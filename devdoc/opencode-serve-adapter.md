# opencode 어댑터 — SSE 기반 persistent-serve 재편

이 문서는 `src/services/opencode.rs`가 겪던 일련의 문제를 고치기 위해 진행한 조사·설계·구현 과정을 기록한다. 특히 oh-my-opencode 플러그인의 background task 기능이 cokacdir 환경에서 "완료되면 알려드리겠습니다" 라고 응답만 남기고 영원히 결과가 도착하지 않던 현상을 구조적으로 해결하는 새 SSE 기반 어댑터의 설계와 구현을 다룬다.

관련 소스는 전부 `src/services/opencode.rs` 한 파일 안에 있으며, 기존 Claude/Gemini/Codex 경로와 cokacdir의 다른 모듈은 건드리지 않았다.

---

## 1. 배경: 드러난 문제들

### 1.1 "empty response" 에러 계열 (이전 수정 대상)

초기 단계의 조사에서 `opencode.rs`의 기존 `opencode run --format json` 기반 어댑터에 여러 구조적 결함이 있다는 것이 드러났다. 같은 이유로 사용자가 `[OpenCode] model='default' returned empty response ...` 같은 로그를 자주 보고 있었다.

| # | 결함 | 위치 |
|---|---|---|
| Gap 1 | `--session <sid>`와 `--continue`를 동시에 전달 → opencode `run.ts:387`이 `--continue`를 우선해서 `session.list().find(s => !s.parentID)` 로 가장 최근 세션을 골라가고 `--session` 값은 무시됨. 세션 크로스토크 발생 | `build_opencode_command` |
| Gap 2 | `is_final = reason == "stop"` 이 너무 좁음. opencode 내부는 `stop`/`length`/`content-filter`/`error` 전부를 종료로 취급 | `extract_step_finish` |
| Gap 3 | `type=error` 이벤트 한 번에 stdout_error를 fatal로 굳힘. opencode의 `ContextOverflowError`는 auto-compaction으로 회복되는 recoverable 케이스인데도 cokacdir은 통째로 에러로 보고 | streaming loop 종료 구간 |
| Gap 4 | 빈 문자열 text 이벤트가 `final_result.is_empty()`를 true로 유지해 `text_event_count > 0`인 케이스를 "빈 응답"으로 오분류 | streaming loop 종료 구간 |
| Gap 5 | 진단 메시지가 `events`/`text_events`/`exit_code`/`stderr_len`만 담고 있어 원인 추정 불가 | streaming/non-streaming 양쪽 |
| Edit 6 | Gap 1 수정 후 새로 드러난 케이스 — stale session id로 `--session` 단독 호출 시 opencode가 exit 0 + stdout 0줄 + stderr에 `NotFoundError`만 남기고 조용히 끝남. 이걸 "빈 응답"으로 오인 | streaming loop / non-streaming both |

이 여섯 건은 SSE 재편 이전에 이미 **legacy 경로에 수정이 반영**되었고, 새 SSE 경로에서도 같은 의미(일부는 구조적으로 재발 불가)로 대응되었다.

### 1.2 진짜 숙제: "백그라운드 처리가 완료되면 응답해드리겠습니다"

사용자가 별도로 지적한 증상은 위의 "empty response" 계열과 성격이 달랐다. cokacdir으로 oh-my-opencode 플러그인이 붙은 opencode를 쓰는 도중, 모델이 `Task dispatched: bg_xxx. I'll report back when it's done.` 같은 응답을 내고 턴이 끝나버린 뒤 **결과가 영원히 도착하지 않는** 패턴이 반복되었다.

초기에는 모델 환각으로 추정했으나, oh-my-opencode 소스를 읽고 실측을 돌려본 결과 **플러그인이 제공하는 실제 기능**이며 cokacdir의 one-shot 실행 모델과 구조적으로 충돌한다는 것이 확인되었다.

---

## 2. 조사 — 무엇이 일어나고 있었는가

### 2.1 oh-my-opencode의 background task 메커니즘

`code-yeongyu/oh-my-openagent` 레포를 클론해 전체 구조를 확인했다. 핵심 구성요소는 다음과 같다.

- **`src/tools/background-task/create-background-task.ts`** — `background_task` 툴(그리고 `task` 툴의 `run_in_background: true` 경로)을 opencode에 등록. 모델이 호출하면 플러그인이 sub-session을 생성하고 fire-and-forget으로 prompt를 쏘고, 모델에게는 다음 텍스트를 반환한다.

  ```
  Background task launched successfully.
  Task ID: bg_xxxxxxxx
  ...
  System notifies on completion. Use `background_output` with task_id="bg_xxxxxxxx" to check.
  Do NOT call background_output now. Wait for <system-reminder> notification first.
  ```

  이 문구가 모델에게 "지금은 polling 하지 말고 기다려라"고 명시적으로 지시하기 때문에 모델이 `"Task dispatched: bg_xxx. I'll report back when it's done."` 같은 응답을 내고 턴을 종료하는 건 **거짓말이 아니라 도구 문서에 적힌 약속을 복창하는 것**이다.

- **`src/features/background-agent/manager.ts`** — in-memory `BackgroundManager`. sub-session 상태를 event bus로 감시하다가 완료 시점에 parent session에 `session.promptAsync({ noReply: !shouldReply, parts: [createInternalAgentTextPart(notification)] })` 로 notification을 주입. `noReply: false` 면 opencode가 parent에서 **새 LLM 턴**을 돌려서 모델이 `background_output`으로 결과를 읽고 최종 답변을 만든다.

- **`src/features/background-agent/task-history.ts`**, **`manager.ts`의 `pendingNotifications` 필드** — 둘 다 **in-memory `Map`** 이며 디스크 persistence가 없다.

### 2.2 cokacdir 쪽의 고장점

cokacdir은 `opencode run --format json` 을 one-shot으로 돌린다. 중요한 점은 opencode의 `packages/opencode/src/cli/cmd/run.ts` 가 parent session이 처음 idle에 도달하는 즉시 event loop를 탈출하고, `packages/opencode/src/cli/bootstrap.ts` 의 `finally` 블록이 `Instance.dispose()` 를 호출해 등록된 Effect disposers를 전부 돌린다는 것이다. 이것이 **parent와 같은 인스턴스 위에서 돌던 sub-session의 fiber를 interrupt**한다.

결과:

1. 모델이 `task(run_in_background=true)` 호출 → sub-session 생성 → 이 단계까지는 정상
2. parent session의 첫 assistant text part가 끝나면서 `step_finish reason=stop`
3. parent session.status → idle → `Instance.dispose()` → sub-session 중도 interrupt
4. sub-session의 assistant 메시지는 `finish=None, parts=0` 상태로 DB에 남음 (절반 생성된 상태)
5. cokacdir 프로세스 종료. 다음 턴은 새 opencode 프로세스 = 새 Instance = 새 BackgroundManager. `pendingNotifications`/`taskHistory`는 전부 초기화. **이전 bg task 정보는 복원되지 않는다.**

### 2.3 직접 재현

이 시스템에서 opencode 1.4.3 + oh-my-opencode 플러그인 환경을 만들어 전체 흐름을 end-to-end로 재현했다.

1. `bun install opencode-ai@1.4.3` 로 격리 설치, 시스템 opencode 1.3.3은 건드리지 않음
2. `bunx oh-my-opencode install --no-tui --skip-auth` 로 플러그인 등록
3. `~/.config/opencode/oh-my-openagent.json` 의 모든 model 참조를 `openai/gpt-5.4-mini-fast` 로 치환 (인증된 provider 맞추기)
4. 플러그인의 agent 키가 zero-width space prefix라는 사실 확인 (`\u200bSisyphus - Ultraworker` 등)
5. `opencode run --format json --agent $'\u200bSisyphus - Ultraworker' --model openai/gpt-5.4-mini-fast`로 bg task 요청 프롬프트 전송

결과 이벤트 시퀀스:

```
step_start
tool_use  tool=task  status=completed
    input={"run_in_background": true, "subagent_type": "Sisyphus-Junior", ...}
    output="Background task launched. Background Task ID: bg_eed06909 ..."
step_finish  reason=tool-calls
step_start
text  "Task dispatched: bg_eed06909. I'll report back when it's done."
step_finish  reason=stop
```

그 뒤 같은 parent session에 follow-up 메시지를 보내면 모델이 `"I haven't received the completion notification for bg_eed06909 yet..."` 이라고 반복 응답했다. Sub-session DB를 `opencode export`로 확인하니 마지막 assistant 메시지가 `finish=None, parts=0` — bash 도구까진 실행됐지만 결과 생성 직전 interrupt된 상태. 가설이 완전히 확인되었다.

### 2.4 `bunx oh-my-opencode run`은 drop-in 대체 불가

플러그인 자체가 `bunx oh-my-opencode run` 이라는 자체 래퍼 명령(`pollForCompletion` 포함)을 제공한다. 하지만 이 시스템에서 직접 돌려보니 **플러그인 본인의 CLI 내부에서 zero-width space agent 이름 resolver 버그**에 걸려 default/명시 agent 모두 `"Agent not found"`로 실패했다. 출력 포맷도 `--json` 모드는 마지막에 단일 summary JSON만 돌려주는 형태라 cokacdir의 JSONL 이벤트 스트림 기반 UI와 호환되지 않았다. 결과적으로 이 경로는 대안에서 제외되었다.

---

## 3. 설계 — 왜 SSE 기반 persistent-serve 경로인가

고장점이 "parent session이 idle이 되자마자 Instance가 dispose되는 것" 이라는 사실이 확정되자 해법은 단 하나로 좁혀졌다: **opencode instance를 턴 전체 동안 살려두고, parent + 모든 child sessions + 모든 todos가 settle된 뒤에만 종료하기**. 이걸 달성하는 경로는 다음 네 가지가 있었다.

| 접근 | 설명 | 평가 |
|---|---|---|
| 1 | opencode `run.ts`를 포크해서 loop 탈출 조건에 children/todos 대기 추가 | 업스트림 포크 유지보수 부담, bun 빌드 체인을 cokacdir에 끌어들임. 기각 |
| 2 | cokacdir이 메시지당 `opencode serve` 를 자식 프로세스로 띄우고 HTTP + SSE로 직접 대화. pollForCompletion은 cokacdir이 Rust로 구현 | cokacdir 측 수정으로 국한, 메시지 단위 lifecycle 유지, oh-my-opencode 기능 전체 호환 |
| 3 | 턴 경계를 넘어 persistent `opencode serve` 데몬 | 완전하지만 daemon lifecycle/포트/orphan detect/멀티 cokacdir 레이스를 전부 관리해야 함. 접근 2가 안정화된 뒤 증분으로 고려 |
| 4 | `bunx oh-my-opencode run` 을 drop-in 대체 | 플러그인 자체 zwsp 버그로 불가. 기각 |

**접근 2**를 채택했다. 이유:

- cokacdir의 "메시지당 프로세스" 모델을 깨지 않고 턴 안에서만 persistent 서버 유지 → daemon 관리 복잡도 배제.
- oh-my-opencode의 plugin 기능 전체 동작. bg task 완료 notification이 자체 `session.promptAsync` 주입으로 parent 세션에 들어오고, 우리의 SSE 구독이 그걸 그대로 관찰하므로 자동 연결.
- 이전 Gap 1~6 수정을 전부 유지한다. 특히 Gap 1(세션 크로스토크)은 HTTP body에 `sessionID` 를 직접 넘기므로 **구조적으로 재발 불가**.
- 텍스트 매칭·언어 감지·문구 추정 같은 **휴리스틱이 하나도 필요 없다**. 모든 판정이 HTTP API 필드와 SSE 이벤트 타입의 정확한 값 비교로만 이루어진다.
- `reqwest::Response::chunk()` 는 reqwest 기본 API라 `stream` feature 추가 없이 SSE 파싱 가능 → `Cargo.toml` 변경 없음.

완전성 면에서 접근 3이 더 강하지만(턴 경계를 넘어서까지 살아남는 bg task 지원), 구현 부담이 크고 접근 2가 잘 동작한 뒤에 증분으로 올리는 쪽이 안전하다고 판단했다.

---

## 4. 사전 조사 — opencode serve의 실제 표면

구현 전에 이 시스템에서 `opencode serve` 를 실제로 돌려 HTTP/SSE 표면을 확정했다.

### 4.1 Readiness 신호

```bash
$ opencode serve --port 0 --hostname 127.0.0.1
Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.
opencode server listening on http://127.0.0.1:4096
```

한 줄짜리 `opencode server listening on http://HOST:PORT` 가 stdout/stderr 중 한 쪽에 찍히고, 이 라인을 보면 TCP listen이 완료된 상태. cokacdir은 이 라인을 probe해 `base_url` 을 추출한다.

### 4.2 HTTP 엔드포인트

opencode `packages/opencode/src/server/routes/session.ts` 와 `event.ts` 를 대조해서 필요한 경로를 확정했다.

| Method | Path | 용도 |
|---|---|---|
| `POST` | `/session` | 세션 생성. body `{ title }` 또는 `{}`. `?directory=...` query 가능 |
| `GET` | `/session/status` | `Record<sessionID, {type: "idle"\|"busy"\|"retry"}>` 반환 |
| `GET` | `/session/:id/children` | child session 배열 |
| `GET` | `/session/:id/todo` | todo 배열 |
| `POST` | `/session/:id/prompt_async` | 프롬프트 fire-and-forget, 204 반환 |
| `GET` | `/event` | SSE 스트림 |

### 4.3 SSE 프레임 포맷

각 이벤트는 `data: <single-line-json>\n\n` 블록으로 구분되고, JSON 페이로드 구조는 다음과 같다.

- 초기: `{"type":"server.connected","properties":{}}`
- 10초마다: `{"type":"server.heartbeat","properties":{}}`
- 버스 이벤트: `{"type": "<event>", "properties": { ... }}`

관찰된 주요 이벤트 타입과 페이로드:

```jsonc
{"type":"session.status","properties":{"sessionID":"...","status":{"type":"busy"|"idle"|"retry"}}}
{"type":"session.error","properties":{"sessionID":"...","error":{"message":"...","data":{"message":"..."},"name":"..."}}}
{"type":"session.created","properties":{...}}
{"type":"session.updated","properties":{"sessionID":"...","info":{...}}}
{"type":"session.diff","properties":{"sessionID":"...","diff":[...]}}
{"type":"message.updated","properties":{"sessionID":"...","info":{"id":"msg_...","role":"user|assistant",...}}}
{"type":"message.part.updated","properties":{"sessionID":"...","part":{"id":"prt_...","messageID":"msg_...","type":"text|tool|step-start|step-finish|reasoning|patch|snapshot",...}}}
{"type":"message.part.delta","properties":{"sessionID":"...","messageID":"msg_...","partID":"prt_...","field":"text","delta":"..."}}
{"type":"tui.toast.show","properties":{...}}
```

### 4.4 bg task 실제 관찰

oh-my-opencode 플러그인이 로드된 상태에서 `prompt_async`로 bg task를 포함한 요청을 던지고 SSE를 캡처했더니 389 개 이벤트가 쏟아졌다. 주요 관찰:

- **parent session과 child session 두 개의 sessionID 가 섞여서 온다.** cokacdir은 반드시 parent sid로 필터해서 child 이벤트를 drop해야 한다.
- **parent session이 busy↔idle을 여러 번 오간다.** 플러그인이 bg task 완료 시 `promptAsync({noReply:false})` 로 notification을 주입하면서 parent에 새 턴이 생기기 때문. "idle 한 번 보면 끝" 이 아니라 children + todos까지 확인하는 pollForCompletion 이 필수.
- **message.part.delta 이벤트가 대량**(전체의 80% 이상) 이다. 실시간 텍스트 스트리밍에 쓸 수 있다.
- user 메시지(원본 프롬프트, 플러그인이 system-reminder 주입용으로 만드는 user 메시지)도 `message.part.updated type=text` 로 등장한다. role 필터 없이 처리하면 UI가 오염된다.

---

## 5. 구현 — 새 SSE 어댑터

### 5.1 파일/의존성 변경 범위

- **변경 파일**: `src/services/opencode.rs` 하나.
- **변경 안 한 것**: `Cargo.toml` (reqwest `chunk()` API가 기본), 다른 서비스, UI, 텔레그램 브리지, 크론.
- **호출부 시그니처 유지**: `pub fn execute_command_streaming(...)` 의 파라미터/반환 타입은 불변. telegram.rs 의 3 호출 지점은 손대지 않음.

### 5.2 최상위 경로 선택 — dispatcher

`execute_command_streaming`은 다음 규칙으로 경로를 선택한다.

1. 환경변수 `COKACDIR_OPENCODE_LEGACY=1` 이면 무조건 legacy.
2. 현재 스레드에서 `tokio::runtime::Handle::try_current()` 가 실패하면(= tokio runtime 밖에서 호출) legacy.
3. 그 외엔 `handle.block_on(async move { execute_command_streaming_serve(...).await })` 로 새 SSE 경로.

기존 본체는 `execute_command_streaming_legacy` 로 **원본 그대로** 보존되어 있고 Gap 1~6 수정도 그대로 살아있다. 호출은 `spawn_blocking` 안에서 이뤄지고 있으므로 `Handle::current()` 는 유효하고, `block_on`은 블로킹 스레드에서 async 코드를 돌리는 공식 패턴이다.

### 5.3 상수

```rust
const SERVE_READY_NEEDLE: &str = "listening on http://";
const SERVE_READY_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const POLL_REQUIRED_CONSECUTIVE: u32 = 2;
const POLL_MIN_STABILIZATION: Duration = Duration::from_secs(1);
const POLL_OVERALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const POLL_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_MAX_CONSECUTIVE_ERRORS: u32 = 6;
```

값은 `oh-my-opencode run` 의 `pollForCompletion` 기본값을 참고했다. cokacdir 쪽은 `POLL_REQUIRED_CONSECUTIVE=2` 로 한 단계 더 엄격하게 갔다. 실질 최소 턴 시간은 `2 × POLL_INTERVAL + POLL_MIN_STABILIZATION ≈ 2초`, 최대 `POLL_OVERALL_TIMEOUT = 30분` 이다. `POLL_MAX_CONSECUTIVE_ERRORS` 는 서버가 mid-turn 에 죽었을 때 dead server 를 상대로 30분 동안 계속 폴링하는 것을 막는 fast-fail 안전장치다 (6 × 500ms ≈ 3초 뒤 `PollError::Fatal` 로 빠져나옴). 섹션 6b 의 버그 M 참조.

### 5.4 프로세스 라이프사이클 — `ServeChild`

```rust
struct ServeChild { child: Option<tokio::process::Child> }

impl ServeChild {
    async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;
        }
    }
}

impl Drop for ServeChild {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
        }
    }
}
```

정상 경로에서는 `shutdown().await` 가 SIGKILL을 보내고 3초 안에 wait까지 해서 좀비를 reap한다. 패닉/조기 리턴 경로에서는 Drop이 동기 SIGKILL만 보내고(Drop은 await 불가) OS가 reap하게 둔다. 추가 방어로 `cmd.kill_on_drop(true)` 를 spawn 전에 호출해, `ServeChild`로 감싸기 전 단계에서 발생하는 에러(stdout/stderr take 실패, readiness timeout 등)에서도 bare `tokio::process::Child` 의 Drop이 자동 SIGKILL하도록 만들었다.

### 5.5 메인 흐름 — `execute_command_streaming_serve`

```
0. AGENTS.md 주입 (기존 inject_system_prompt_into_agents_md 재사용, AgentsMdGuard Drop 으로 복원)
1. 초기 cancel 체크
2. spawn_opencode_serve(working_dir)
   ├─ tokio::process::Command 로 `opencode serve --port 0 --hostname 127.0.0.1` 실행
   ├─ stdin null / stdout pipe / stderr pipe / kill_on_drop(true) / current_dir = working_dir
   ├─ BufReader::lines() 로 stdout + stderr 라인을 tokio::select! 로 동시 관찰
   ├─ 라인에서 SERVE_READY_NEEDLE 을 찾으면 extract_serve_url 로 base_url 추출 (30초 timeout)
   └─ readiness 후 나머지 라인은 백그라운드 tokio::task 로 drain (opencode_debug 로그로만 흘림)
3. cancel_token 에 child PID 등록
4. reqwest::Client 두 개 생성
   ├─ `client`: timeout = POLL_REQUEST_TIMEOUT (10s) → /session/*, prompt_async, 폴링 요청용
   └─ `sse_client`: request timeout 없음, connect_timeout = 10s → /event SSE 용
5. 세션 resolve
   ├─ session_id 가 Some 이고 비어있지 않으면 그대로 사용
   └─ 아니면 POST /session?directory=... { title: <prompt 첫 줄 60자> } 로 신규 생성
6. StreamMessage::Init { session_id } 송신
7. SSE 연결을 '동기적으로' 수행
   ├─ sse_client.get(<base>/event).send().await
   ├─ non-2xx 면 serve 종료 + Error 송신 + return
   └─ 성공 시 이미 열린 reqwest::Response 를 tokio::task::spawn 으로 consume_sse_chunks 에 넘김
      ↑ 이 순서가 중요: prompt_async 가 이벤트를 발생시키기 전에 SSE 가 반드시 붙어 있어야 함
8. POST /session/:id/prompt_async { agent?, model?, parts: [{type:"text", text: prompt}] }
9. poll_until_complete 루프로 parent + children + todos 가 전부 idle 이 될 때까지 대기
10. 종료 시퀀스
    ├─ sse_stop 플래그 true
    ├─ tokio::time::sleep(500ms) 로 트레일링 이벤트 드레인 여유
    ├─ sse_handle.abort() + await
    └─ ServeChild::shutdown()
11. poll_result 에 따라 Done / Error / (취소 시 무송신)
12. AgentsMdGuard Drop → AGENTS.md 원상복구
```

### 5.6 SSE consumer — `consume_sse_chunks` + `handle_sse_event`

SSE 파서는 의존성 추가 없이 `reqwest::Response::chunk()` 를 반복 호출하는 방식이다.

```rust
let mut buf: Vec<u8> = Vec::with_capacity(8192);
loop {
    if stop.load(Relaxed) { break; }
    match resp.chunk().await {
        Ok(Some(c)) => buf.extend_from_slice(&c),
        Ok(None) => break,      // stream 종료
        Err(_) => break,        // 네트워크 오류
    }
    while let Some(pos) = find_double_newline(&buf) {
        let raw: Vec<u8> = buf.drain(..pos + 2).collect();
        // "data: <json>" 라인을 concat 해 payload 생성 후 handle_sse_event
    }
}
```

`find_double_newline` 은 `\n\n` 과 `\r\n\r\n` 양쪽을 지원한다. `data:` 가 여러 줄일 경우 `\n` 으로 이어붙이는 SSE 스펙도 준수한다.

`handle_sse_event` 의 핵심 불변식:

1. **parent sid 필터**: 모든 이벤트는 `properties.sessionID == parent_sid` 일 때만 처리. child sub-session 이벤트는 전부 drop.
2. **role 필터**: `message.updated` 에서 `info.role` 을 `message_roles: HashMap<messageID, role>` 에 기록. `message.part.updated` 와 `message.part.delta` 는 part 의 `messageID` 가 "user" 로 알려진 경우 drop. 원본 사용자 프롬프트와 **플러그인이 inject한 `<system-reminder>` notification 메시지**가 UI에 노출되지 않는다(= plumbing 숨김).
3. **파트 타입 화이트리스트**: `message.part.updated` 에서 `part.type` 을 `part_types: HashMap<partID, type>` 에 기록. `message.part.delta` 는 `part_types[partID] == "text"` 인 경우에만 통과시키고 나머지(reasoning 등)는 drop. 블랙리스트가 아닌 화이트리스트 방식으로, 향후 알 수 없는 새 파트 타입이 추가되어도 기본 차단된다. 3개 모델(gpt-5.1-codex-mini, gpt-5.4, big-pickle) 실측으로 delta를 발생시키는 파트 타입이 `text`와 `reasoning` 뿐임을 확인한 뒤 결정. 섹션 13 참조.
4. **빈 text 가드**: text/delta 의 내용이 빈 문자열이면 StreamMessage::Text 를 보내지 않고, final_result 누적에도 `\n\n` 구분자를 넣지 않는다.
5. **text delta 송신 + 중복 회피**: `StreamMessage::Text` 는 append-only delta 계약(telegram.rs / claude / codex / gemini 어댑터와 동일)이다. `message.part.delta` 는 수신한 delta 그대로 방출한다. `message.part.updated` 는 파트의 전체 스냅샷이 오므로 `part_progress: HashMap<partID, String>` 에 저장된 이전 전체 내용과 비교하여 새로 추가된 접미사(suffix)만 방출한다. `part_progress` 는 두 이벤트 경로 양쪽에서 파트의 현재 전체 내용을 미러링하여, (a) `message.part.updated` 의 delta 추출 기준선과 (b) 두 경로 간 dedup(`text == previously` 일 때 skip) 역할을 동시에 한다.
6. **final_result 누적**: `time.end` 가 설정된 text part 가 도착하면 `Arc<Mutex<String>>` 에 append (중간에 `\n\n` 구분자). 완료 시점에 Done.result 로 실려 UI의 `finalize_streaming_history` 가 최종 Assistant 히스토리 아이템을 확정짓게 한다.
7. **tool_use → ToolUse + ToolResult**: tool part 가 `completed` 또는 `error` 상태일 때만 방출. 기존 `normalize_tool_name` / `normalize_opencode_params` 헬퍼를 재사용.
8. **session.error tentative**: 한 번 에러 이벤트가 오더라도 그 자리에서 실패 확정짓지 않고 debug 로그만 남긴다. 최종 성공/실패는 `poll_until_complete` 가 HTTP API로 본 최종 상태 기준으로 판단.
9. **명시적 무시 리스트**: `server.connected`, `server.heartbeat`, `session.diff`, `session.updated`, `session.status`, `session.created`, `tui.toast.show` 는 UI 노출 없이 그냥 흘려보낸다(로그 스팸 방지).

### 5.7 완료 판정 — `poll_until_complete`

`oh-my-opencode run` 의 `poll-for-completion.ts` 를 Rust로 포팅했다.

```rust
loop {
    if cancel_hit { return Cancelled; }
    if elapsed > POLL_OVERALL_TIMEOUT { return Fatal("..."); }
    sleep(POLL_INTERVAL);

    let parent_kind = get_session_status_kind(..)?;
    if parent_kind == "busy"|"retry" { ever_busy = true; consecutive = 0; continue; }
    let parent_idle = parent_kind == "idle" || (parent_kind == "" && ever_busy);
    if !parent_idle { consecutive = 0; continue; }

    if get_children_busy(..)? { consecutive = 0; continue; }
    if get_todos_pending(..)? { consecutive = 0; continue; }

    if !ever_busy && elapsed < POLL_MIN_STABILIZATION { continue; }

    consecutive += 1;
    if consecutive >= POLL_REQUIRED_CONSECUTIVE { return Ok(()); }
}
```

- `get_session_status_kind` — `GET /session/status` 에서 parent sid 의 `type` 을 추출.
- `get_children_busy` — `GET /session/:id/children` 으로 자식 목록을 받고, 각각의 상태를 다시 `GET /session/status` 에서 크로스 참조해 하나라도 busy/retry 면 true.
- `get_todos_pending` — `GET /session/:id/todo` 에서 `status != completed` 이면서 `status != cancelled` 인 todo가 있으면 true. 404는 "없음" 취급.

HTTP 오류나 파싱 실패는 `consecutive = 0; continue` 로 리셋해 다음 주기를 기다린다. 모든 엔드포인트가 계속 실패하면 `POLL_OVERALL_TIMEOUT` 가 최종 가드.

### 5.8 `PollError`

```rust
enum PollError {
    Cancelled,      // 사용자 취소 → 상위에서 Done/Error 미송신
    Fatal(String),  // 치명적(30분 초과 등) → StreamMessage::Error 송신
}
```

---

## 6. 1차 자체 감사 — 정적 리뷰에서 잡은 버그

구현 직후 컴파일 전에 스스로 한 번 더 코드를 훑어 다음 버그를 잡아 고쳤다.

| # | 버그 | 심각도 | 수정 |
|---|---|---|---|
| A | `message.part.updated`/`delta` 에 role 필터 부재 — 원본 사용자 프롬프트와 플러그인의 system-reminder 주입 메시지가 assistant 응답으로 렌더링됨 | 치명적 | `message_roles` HashMap 으로 messageID→role 추적, user role 은 skip |
| B | 빈 text 파트의 final_result 누적이 `"\n\n"` 구분자만 남겨 Done 결과 오염 | 중 | `!text.is_empty()` 가드 추가 |
| C | `tokio::task::spawn(consume_sse)` → 즉시 `prompt_async` → SSE connection race, 초기 이벤트 유실 가능 | 치명적 | `GET /event` 는 메인 태스크에서 **동기 await**, 이미 열린 `Response` 를 spawned task 로 넘기는 시그니처(`consume_sse_chunks`)로 변경 |
| D | `message.updated` 의 sessionID를 `properties.info.sessionID` 로 읽어 일관성 결여 | 중 | 모든 이벤트에서 top-level `properties.sessionID` 로 통일 |
| E | 단일 reqwest::Client 로 10초 per-request timeout을 건 채 SSE 스트림까지 구독 → 스트림이 10초 timeout 에 잘릴 위험 | 치명적 | `sse_client` 를 분리. request timeout 없음, `connect_timeout(10s)` 만 설정 |
| F | `spawn_opencode_serve` 에서 `ServeChild` 래핑 전 조기 실패 시 bare `tokio::process::Child` 가 drop 되면서 프로세스를 죽이지 않음 → 좀비 | 중 | `cmd.kill_on_drop(true)` 추가 |
| G | `sse_client` 에 connect timeout 이 없으면 opencode serve 가 죽었을 때 TCP handshake 에서 무한 대기 | 중 | 위 E 수정과 동시에 `connect_timeout(POLL_REQUEST_TIMEOUT)` 설정 |
| - | `session.status`/`session.created`/`tui.toast.show` 등 플러그인 이벤트가 UNKNOWN 경고 스팸 생성 | 로그 품질 | 명시적 ignore 리스트에 추가 |

## 6b. 빌드 + 런타임 검증에서 잡은 버그

정적 감사가 끝난 뒤 `python3 build.py --linux-arm64` 로 직접 빌드하고 빌드된 `./dist_beta/cokacdir-linux-aarch64` 를 main.rs 에 넣은 `--test-opencode-sse` 하니스로 실제로 돌려보면서 추가로 다섯 개 버그가 드러났다. 이들은 정적 코드 리뷰만으로는 잡히지 않는 종류였고, 실제 컴파일러와 런타임이 알려준 것들이다.

| # | 버그 | 어떻게 드러남 | 수정 |
|---|---|---|---|
| H | `reqwest::RequestBuilder::json` 메서드 미존재 — cokacdir의 reqwest 빌드는 `default-features = false` 라서 `json` feature가 꺼져 있고, `RequestBuilder::json` 은 그 feature 안에 있음 | `cargo build` 가 `error[E0599]: no method named 'json' found` 를 6건 (`create_session`, `post_prompt_async` 두 곳에서 cascade) | `serde_json::to_string(&body)?` 로 직접 직렬화하고 `.header("content-type", "application/json").body(body_str)` 로 전송. 의존성 변경 없이 해결 |
| I | `Init` 메시지 중복 송신 — main task가 한 번 보내고, SSE consumer의 `message.updated` 핸들러에서 fallback으로 한 번 더 보냄 | T1 smoke test에서 `init=2` 가 찍힘 | SSE consumer의 fallback 제거. `init_sent` 변수는 서명 호환을 위해 남겨두되 발행 안 함 |
| J | **process group 좀비** — `opencode` 는 node 런처 → bun 컴파일된 `.opencode` 의 다단계 프로세스 트리. tokio의 `child.start_kill()` 은 직접 자식(node)에게만 SIGKILL 을 보내서 손자 프로세스(`.opencode`)가 init 으로 reparent되어 좀비로 남음 | bg task 테스트 후 `pgrep -af opencode` 가 매번 leaked 프로세스를 보여줌 | (1) `tokio::process::Command::process_group(0)` 으로 새 프로세스 그룹 생성, (2) `kill_serve_process_group(pid)` 헬퍼가 unix `libc::kill(-pid, SIGKILL)` 로 그룹 전체 SIGKILL, (3) `ServeChild::shutdown` 과 `Drop` 양쪽에서 호출 |
| K | fast-fail 케이스 (잘못된 모델, 모델 not found 등)에서 `poll_until_complete` 가 무한 hang. 원인: `ever_busy=false` 인 상태에서 `kind=""` 가 와도 `parent_idle = ever_busy = false` 로 평가되어 `consecutive=0` 으로 리셋만 반복 | 잘못된 모델로 테스트하면 60초 timeout으로 외부 SIGTERM 받기 전까지 안 끝남 | `parent_idle = ever_busy \|\| start.elapsed() >= POLL_MIN_STABILIZATION` 으로 변경. 1초 안정화 시간이 지나면 ever_busy 없이도 idle 처리 가능 |
| L | fast-fail 케이스에서 빈 Done 송신 — session.error 가 캡처됐는데 final_result 도 비어 있는데, 정상 Done 으로 처리되어 사용자에겐 빈 응답으로 보임 | 잘못된 모델 테스트가 K 수정 후 PASS 로 빠지면서 `done_result_len=0` 으로 끝남. 사용자 시각으로는 "왜 응답이 없지?" | (1) `last_error: Arc<Mutex<Option<String>>>` 공유 슬롯 추가, (2) SSE consumer 의 `session.error` 핸들러가 마지막 에러 메시지를 슬롯에 기록, (3) main task 의 종료 분기에서 `accumulated.is_empty() && captured_error.is_some()` 이면 Done 을 `StreamMessage::Error` 로 demote |
| M | **서버 크래시 시 무한 재시도** — `poll_until_complete` 가 HTTP 에러를 만나면 `consecutive = 0` 으로 리셋만 하고 다음 iteration 으로 넘어감. `opencode serve` 가 mid-turn 에 죽으면 `POLL_OVERALL_TIMEOUT = 30분` 이 다 될 때까지 dead server 를 계속 폴링하는데 그동안 사용자는 아무 응답도 못 받음 | 2차 검증 (섹션 6d) 에서 mid-turn 에 serve 프로세스 그룹을 SIGKILL 한 뒤 관찰. 1차 감사에서는 개념적으로만 걱정되었고 실제 재현되기 전까지는 구현되지 않았던 fast-fail 방어장치 | (1) `POLL_MAX_CONSECUTIVE_ERRORS = 6` 상수 추가 (≈ 3초의 grace period), (2) `poll_until_complete` 에 `consecutive_http_errors` 카운터 및 `last_http_error` 슬롯 추가, (3) 6회 연속 HTTP 에러 발생 시 즉시 `PollError::Fatal("opencode server unreachable after N consecutive polls (Ns): <detail>")` 반환 |

이 여섯 개는 정적 감사로는 절대 못 잡았을 것들이다. 특히 H(reqwest feature 부재)는 컴파일러가 알려준 것이고, I/J/K/L 은 1차 검증 실행에서, M 은 2차 검증에서 실제 시나리오를 돌려야 드러난 런타임 결함이다. 검증 사이클의 중요성을 보여준다.

---

## 6c. 검증 — 직접 빌드 + 실행으로 확인된 4개 시나리오

`python3 build.py --linux-arm64` 빌드 + `./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse` 직접 실행으로 다음 4가지를 모두 검증.

| # | 시나리오 | 명령 | 결과 |
|---|---|---|---|
| T1 | SSE 경로 + 간단한 텍스트 응답 | `--test-opencode-sse 'Say HELLO in one word.' --model openai/gpt-5.4-mini-fast --dir /tmp/oc_test --agent <ZWSP>Sisyphus - Ultraworker` | PASS — Init/Text/Done 시퀀스, delta 스트리밍 정상 |
| T2 | SSE 경로 + 잘못된 모델 (expect-error) | `--test-opencode-sse 'Say HI' --model bogus/nonexistent ... --expect-error` | PASS — `ProviderModelNotFoundError` 가 SSE에서 캡처되어 Done이 Error로 demote |
| T3 | Legacy 경로 (env var fallback, 플러그인 임시 disable) | `COKACDIR_OPENCODE_LEGACY=1 ... --test-opencode-sse 'Say PONG'` | PASS — 기존 Gap 1~6 수정이 모두 살아 있음 |
| T4 | **헤드라인 시나리오** — SSE 경로 + bg task end-to-end | `--test-opencode-sse 'Run cat /etc/hostname as a background task ... wait for completion notification then report the actual hostname output verbatim.'` | PASS — 모델이 task 도구를 `run_in_background:true` 로 디스패치 → 6초간 bg sub-session 실행 → 플러그인이 `session.promptAsync({noReply:false})` 로 parent 에 notification 주입 → 모델이 자동으로 `background_output` 호출 → 결과 `kst` 가 SSE 로 스트리밍되어 최종 Done.result 에 포함 |

모든 테스트 후 `pgrep -af opencode` 결과 leaked 프로세스 0개. process group SIGKILL 동작 확인.

T4의 디버그 로그 발췌 (`~/.cokacdir/debug/opencode.log`):

```
[14:34:24] [serve.spawn] spawned PID=Some(43908)
[14:34:25] [serve.stdout] opencode server listening on http://127.0.0.1:41641
[14:34:26] [serve] created new session_id=ses_2882f2f69ffeJ4Cqv9sPjJeP1f
[14:34:26] [serve.sse] consumer started
... 1분 43초 동안 bg task 실행 ...
[14:36:09] [serve.poll] all idle (consecutive=1/2)
[14:36:10] [serve.poll] all idle (consecutive=2/2)
[14:36:10] [serve] completed normally, final_result_len=153
```

`pollForCompletion` 이 parent + children + todos 가 모두 idle 이 될 때까지 정확히 103초 기다린 뒤 깔끔히 종료되었다.

---

## 6d. 2차 검증 — 섹션 9d 에서 미커버로 남겨두었던 4개 시나리오

1차 검증(T1~T4) 이후 사용자 지시로 섹션 9d 에 "운영 중 추가 관찰 권장" 으로 남겨두었던 4개 영역을 직접 바이너리 실행으로 검증했다. 이 라운드가 버그 M(서버 크래시 시 무한 재시도)을 드러내는 계기가 되었다.

| # | 시나리오 | 검증 방법 | 결과 | 증거 |
|---|---|---|---|---|
| V1 | Cancel 정리 (초기 세션) | `--cancel-after 3000 --expect-cancelled` 로 Init 직후 cancel 발동 | PASS | 디버그 로그: Init→cancel detected→SSE stop→serve END 전체 약 500ms. leaked 프로세스 0개. `StreamMessage::Done`/`Error` 송출 없음 (legacy cancel 동작과 일치) |
| V2 | Cancel 정리 (텍스트 스트리밍 중) | `--cancel-after 8000 --expect-cancelled` 로 Text 이벤트 44개가 흘러나오는 도중 cancel | PASS | `poll iter=1~11` 모두 busy, iter=11 에서 cancel 감지 → SSE consumer 가 stop 플래그 보고 exit → ServeChild shutdown → function END (cancel 감지부터 END 까지 약 500ms) |
| V3 | 30분 타임아웃 천장 | `POLL_OVERALL_TIMEOUT` 을 임시로 5초로 낮추고 재빌드, 장시간 프롬프트 실행 | PASS → 버그 없음 | `poll iter=10` 이후 `PollError::Fatal("opencode turn exceeded 0 minute ceiling")` 발동, `StreamMessage::Error` 로 demote, ServeChild shutdown 정상, 상수는 즉시 `30 * 60` 으로 복원 |
| V4 | 서버 크래시 mid-execution | 테스트 실행 중 `kill -9 -<pgid>` 로 `opencode serve` 프로세스 그룹 전체 종료 | **FAIL → 버그 M 발견 → 수정 후 PASS** | 1차 관찰: 크래시 후 `poll_until_complete` 가 HTTP 에러만 반복하며 30분까지 탈출 못 함. 수정 후: 6회 연속 HTTP 에러에서 `PollError::Fatal` 로 빠져나와 3초 이내 종료, `StreamMessage::Error` 송출 |
| V5 | 동시 여러 cokacdir 세션 | 2개 인스턴스를 별도 작업 디렉토리에서 동시 실행 | PASS | 각자 `--port 0` 로 서로 다른 포트(4096, 4097 류) 할당, SQLite(`~/.local/share/opencode/opencode.db`) 잠금 에러 0건, 두 세션 모두 정상 완료, leaked 프로세스 0개 |

**2차 검증 라운드 최대 수확은 버그 M 이었다.** V1/V2/V3/V5 는 기존 구현의 방어장치가 실제로 동작함을 확인하는 것으로 끝났지만, V4 는 1차 감사에서 이론적 걱정거리로만 남겨져 있던 시나리오가 실제로 30분 무응답 버그를 만든다는 것을 재현시켰고, 그 자리에서 `POLL_MAX_CONSECUTIVE_ERRORS` 기반 fast-fail 을 추가해 재검증까지 완료했다.

**검증 환경 함정 (회귀 검증 시 주의)**:

- **전역 opencode 설정이 플러그인을 강제 로드**: `~/.config/opencode/opencode.json` 에 `plugin: ["oh-my-openagent@latest"]` 가 있으면 작업 디렉토리를 아무리 깨끗한 곳으로 옮겨도 default agent `"Sisyphus - Ultraworker"` not found 에러로 조기 실패한다. 플러그인-프리 테스트가 필요하면 `XDG_CONFIG_HOME=/tmp/oc_plain_cfg` 같은 격리된 config 디렉토리를 쓰고 그 안에 빈 `opencode/opencode.json` 을 넣어야 한다.
- **opencode 버전 혼선**: 시스템 opencode 가 1.3.x 면 `/session` 엔드포인트가 특정 플러그인 설정과 상호작용해 hang 하는 것을 확인했다. 1.4+ 가 필요하면 `bun add opencode-ai@1.4.3 -P /tmp/oc_local` 로 격리 설치하고 `COKAC_OPENCODE_PATH=/tmp/oc_local/node_modules/.bin/opencode` 로 고정한다.
- **`POLL_OVERALL_TIMEOUT` 검증은 상수 임시 축소 필요**: 30분을 실제로 기다릴 수는 없으므로 `src/services/opencode.rs` 의 `const POLL_OVERALL_TIMEOUT` 을 `Duration::from_secs(5)` 로 고친 뒤 재빌드해서 검증하고, **반드시 끝나면 `30 * 60` 으로 되돌린 뒤 최종 빌드를 한 번 더 하고 배포**한다. 오류 메시지의 `{} minute ceiling` 포맷은 5초에서 "0 minute" 로 찍히지만 Fatal 경로 자체는 정상 동작한다.
- **프로세스 그룹 킬 검증**: `pgrep -f "opencode serve"` 로 나온 pid 를 `kill -9 -<pid>` (negative pid = pgid) 로 죽여야 node 래퍼와 bun 컴파일 grandchild 를 동시에 종료한다. `kill -9 <pid>` 만 쓰면 grandchild 가 살아남아 V4 재현이 되지 않는다.

---

## 7. 보존한 것 — 이 변경이 건드리지 않는 것

- **Claude/Gemini/Codex 어댑터**: 무관.
- **기존 `execute_command`(non-streaming)**: 본체 유지, 기존 Gap 수정 그대로.
- **`execute_command_streaming_legacy`**: 이전 Gap 1~6 수정이 반영된 상태로 환경변수 토글 또는 no-tokio fallback 경로로 살아남음.
- **`build_opencode_command`**: legacy 경로에서 계속 사용.
- **`telegram.rs` 의 호출 지점 3곳**: 시그니처 변화 없음.
- **UI, 히스토리 모델, 크론, 텔레그램/디스코드 브리지**: 무관.
- **`Cargo.toml`**: 의존성 추가 없음.
- **`StreamMessage` enum 정의**: 신규 variant 없이 기존 Init/Text/ToolUse/ToolResult/TaskNotification/Done/Error 재사용.

---

## 8. Rollback 경로

문제가 생기면 코드 변경 없이 환경변수 하나로 이전 동작으로 되돌릴 수 있다.

```bash
export COKACDIR_OPENCODE_LEGACY=1
```

이 상태에서는 dispatcher 가 legacy body 를 그대로 호출하므로 이전 턴들에서 적용한 Gap 1~6 수정만 반영된 "직전 세대 cokacdir" 과 동일하게 동작한다. SSE 경로 관련 버그가 re-보고되면 env var 로 즉시 완화한 뒤 원인을 분석하고 재배포할 수 있다.

---

## 9. 검증 — 어떻게 확인했고 어떻게 다시 확인하나

### 9a. 이미 완료된 검증

사용자가 빌드와 직접 실행을 명시적으로 허락한 시점부터, 이 작업의 검증은 **`python3 build.py --linux-arm64` 로 실제로 빌드하고 빌드된 `./dist_beta/cokacdir-linux-aarch64` 를 직접 실행해 결과를 보는** 방식으로 진행되었다. 빌드 사이클에서 잡힌 5개 추가 버그(섹션 6b 의 H~L)는 이 검증 단계 없이는 절대 발견되지 못했을 것들이다. 4개 시나리오(T1~T4)가 모두 PASS 했고(섹션 6c 표 참조), 모든 테스트 후 좀비 프로세스 0개를 확인했다.

### 9b. 회귀 검증을 위한 영구 인프라

검증 자체가 영구 인프라로 남아 있다. 향후 cokacdir 또는 opencode/플러그인 업그레이드 후 회귀 확인이 필요할 때 다음 절차를 그대로 다시 돌리면 된다.

`src/main.rs` 에 `--test-opencode-sse <prompt>` 라는 internal CLI 플래그를 추가해 두었다. 이 플래그는 실제 `opencode::execute_command_streaming` 어댑터를 직접 구동하고 채널로 흘러나오는 모든 `StreamMessage` 를 stdout 에 출력한 뒤 PASS/FAIL 판정을 한다. 추가 플래그:

| 플래그 | 의미 |
|---|---|
| `--model <provider/model>` | 특정 모델 강제 (예: `openai/gpt-5.4-mini-fast`) |
| `--session <sid>` | 기존 세션 재개 |
| `--dir <path>` | 워킹 디렉토리 |
| `--agent <name>` | 플러그인 agent 이름. 내부적으로 `COKACDIR_OPENCODE_TEST_AGENT` env var 로 SSE 어댑터에 전달되어 `prompt_async` body 에 `agent` 필드로 주입됨. zwsp prefix 같은 까다로운 이름도 통과시킬 수 있음 |
| `--expect-error` | bad-model 같은 negative 케이스에서 Error 가 와야 PASS 로 간주 |
| `--cancel-after <ms>` | 지정된 밀리초 뒤에 테스트 하니스가 `CancelToken` 을 발동. V1/V2 cancel 회귀 검증용. 타이머는 tokio runtime 시작 시점 기준이므로 Init 송출 시점보다 먼저 경과 시간이 쌓이기 시작함에 주의 |
| `--expect-cancelled` | cancel 이 올바르게 처리된 케이스(`Done`/`Error` 없이 함수 종료)가 PASS 로 간주되도록 판정 기준 전환. `--cancel-after` 와 함께 씀 |

또한 `~/.cokacdir/debug/opencode.log` 에 `[dispatch]`, `[serve]`, `[serve.spawn]`, `[serve.sse]`, `[serve.poll iter=N]` 태그의 상세 로그가 쌓이도록 verbose 디버그 출력이 영구 추가되어 있다(빌드 사이클에서 K번 버그를 진단할 때 결정적이었음).

### 9c. 한 번에 모든 시나리오 검증하는 스크립트

다음 셸 블록을 그대로 실행하면 4개 시나리오를 차례로 돌리고 PASS/FAIL 카운트와 leaked 프로세스 수까지 보고한다 (`/tmp/oc_local` 에 opencode 1.4+ 가 있고 `/tmp/oc_test` 가 작업 디렉토리이며 oh-my-openagent 플러그인이 `~/.config/opencode/opencode.json` 에 등록된 환경 가정).

```bash
export PATH="/tmp/oc_local/node_modules/.bin:$HOME/.bun/bin:$PATH"
AGENT=$'\u200bSisyphus - Ultraworker'
PASS=0; FAIL=0
test_run() {
    local name="$1"; shift
    if "$@" 2>&1 | tail -3 | grep -q 'RESULT: PASS'; then
        echo ">>> $name: PASS"; PASS=$((PASS+1))
    else
        echo ">>> $name: FAIL"; FAIL=$((FAIL+1))
    fi
}

test_run "T1 SSE simple" \
  ./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse 'Say HELLO in one word.' \
  --model openai/gpt-5.4-mini-fast --dir /tmp/oc_test --agent "$AGENT"

test_run "T2 SSE bad model" \
  ./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse 'Say HI' \
  --model bogus/nonexistent --dir /tmp/oc_test --agent "$AGENT" --expect-error

# Legacy 경로는 플러그인 default agent 와 충돌하므로 일시적으로 비활성화
mv /home/$USER/.config/opencode/opencode.json /home/$USER/.config/opencode/opencode.json.bak
echo '{}' > /home/$USER/.config/opencode/opencode.json
COKACDIR_OPENCODE_LEGACY=1 \
  test_run "T3 legacy" \
  ./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse 'Say PONG' \
  --model openai/gpt-5.4-mini-fast --dir /tmp/oc_test
mv /home/$USER/.config/opencode/opencode.json.bak /home/$USER/.config/opencode/opencode.json

test_run "T4 SSE bg task end-to-end" \
  ./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse \
  'Run cat /etc/hostname as a background task using task tool with run_in_background:true subagent_type Sisyphus-Junior category quick. After dispatching wait for the completion notification then report the actual hostname output verbatim.' \
  --model openai/gpt-5.4-mini-fast --dir /tmp/oc_test --agent "$AGENT"

echo "PASS=$PASS FAIL=$FAIL leaked=$(pgrep -af opencode 2>/dev/null | grep -v 'bash\|pgrep' | wc -l)"
```

기대 출력:
```
>>> T1 SSE simple: PASS
>>> T2 SSE bad model: PASS
>>> T3 legacy: PASS
>>> T4 SSE bg task end-to-end: PASS
PASS=4 FAIL=0 leaked=0
```

### 9d. 2차 검증 완료 시나리오

과거 이 섹션은 "미커버 시나리오 (운영 중 추가 관찰 권장)" 으로 cancel, 타임아웃, 서버 크래시, 동시 세션을 나열했었다. 이후 사용자 지시로 4개 모두 직접 바이너리 실행으로 검증 완료했다. 상세 결과와 검증 환경 함정은 섹션 6d 를 참조.

- **Cancel (cancel_token)** — V1/V2 PASS. 초기 세션과 텍스트 스트리밍 중 두 시점 모두에서 cancel 후 약 500ms 내에 SSE consumer 와 ServeChild 가 정상 정리되고 leaked 프로세스 없음을 확인. `--cancel-after`, `--expect-cancelled` 플래그로 재회귀 가능.
- **30분 타임아웃 천장** — V3 PASS. 상수를 5초로 임시 축소해 `PollError::Fatal` 경로와 `StreamMessage::Error` 로의 demote 를 확인. 검증 후 상수는 `30 * 60` 으로 복원됨.
- **opencode serve 크래시** — V4 검증 중 **무한 재시도 버그 M 발견** 및 수정. `POLL_MAX_CONSECUTIVE_ERRORS = 6` 을 도입해 6회 연속 HTTP 에러에서 즉시 `PollError::Fatal` 로 빠져나오도록 fast-fail 처리. 재검증 PASS.
- **여러 cokacdir 세션 동시 실행** — V5 PASS. `--port 0` 자동 할당으로 포트 충돌 없음, SQLite 잠금 에러 없음, 두 세션 모두 정상 종료, 누수 없음. 장기적인 스트레스 테스트(수십 개 세션)는 여전히 미검증.

### 9e. 여전히 미커버인 시나리오

아래는 2차 검증 라운드에서도 건드리지 않은 영역이다. 운영 중 관찰이 필요하면 이쪽부터 우선 점검:

- **네트워크 중단 / TCP reset 중간 발생**: 로컬 `127.0.0.1` 바인딩 환경에서는 재현이 어려움. SSE chunk error 의 자연 복구 동작과 `poll_until_complete` 의 HTTP 에러 카운터가 함께 걸리는 경우의 상호작용은 실측 미확인.
- **`POLL_OVERALL_TIMEOUT = 30분` 실제 운영 경계**: 임시 축소 버전으로만 Fatal 경로를 확인했다. 실제 30분이 흐른 뒤 발동하는 경로는 검증 불가능(실측 비용 과다). 상수 복원 자체는 재빌드 전 diff 로 확인.
- **대규모 동시 세션 스트레스**: V5 는 2개 병렬만 검증했다. 5개 이상 동시 실행 시 SQLite WAL 경합이나 포트 고갈 같은 문제는 관찰되지 않음.
- **OPENCODE_SERVER_PASSWORD 설정 환경**: 현재 구현은 인증 없는 loopback 을 가정한다. 환경에 암호가 설정되어 있으면 연결 실패하며 이는 코드 수정 대상 (섹션 10 참조).

---

## 10. 알려진 한계와 장기 로드맵

- **턴 경계를 넘는 bg task 미지원**: 한 턴 안에서 끝나지 않는 초장시간 background 작업은 현재 구현에서도 처리되지 않는다. `POLL_OVERALL_TIMEOUT = 30분` 안에 끝나야 한다. 이 제약을 풀려면 접근 3(cross-turn persistent `opencode serve` daemon) 이 필요하고, 그건 별도 프로젝트 수준 작업으로 분리.
- **여러 cokacdir 세션이 동시에 돌 때**: 각 세션이 자기 `opencode serve` 인스턴스를 띄우므로 포트는 `--port 0` 으로 OS 할당되어 충돌 없음. 다만 opencode 서버의 database(`~/.local/share/opencode/opencode.db`) 는 전역 공유라 잠금/스키마 관점에서 문제가 생길 수 있다. 실사용에서 관찰되면 추가 조사 필요.
- **`opencode serve` cold start 오버헤드**: 메시지당 1~2초 서버 부팅 시간이 추가된다. `opencode run --format json` 과 크게 다르지 않지만 실측으로 확인 필요.
- **인증**: 현재는 `OPENCODE_SERVER_PASSWORD` 없이 `127.0.0.1` 에 바인드되는 기본 상태를 가정한다. 환경에 따라 암호가 설정되어 있으면 `Authorization: Basic` 헤더 전달 로직 추가 필요.

---

## 11. 참고 파일/위치

| 주제 | 위치 |
|---|---|
| dispatcher + legacy 보존 | `src/services/opencode.rs` `execute_command_streaming`, `execute_command_streaming_legacy` |
| 새 SSE 경로 본체 | `src/services/opencode.rs` `execute_command_streaming_serve` |
| 프로세스 가드 + 그룹 SIGKILL | `src/services/opencode.rs` `ServeChild`, `kill_serve_process_group` |
| 서버 spawn + readiness + process_group(0) | `src/services/opencode.rs` `spawn_opencode_serve`, `extract_serve_url` |
| HTTP 헬퍼 (수동 JSON 직렬화) | `src/services/opencode.rs` `create_session`, `post_prompt_async`, `get_session_status_kind`, `get_children_busy`, `get_todos_pending` |
| SSE 파서 + 이벤트 핸들러 | `src/services/opencode.rs` `consume_sse_chunks`, `find_double_newline`, `handle_sse_event` |
| 완료 판정 + fast-fail fallback | `src/services/opencode.rs` `poll_until_complete`, `PollError` |
| Error demotion (fast-fail) | `src/services/opencode.rs` `execute_command_streaming_serve` 의 종료 분기, `last_error: Arc<Mutex<Option<String>>>` |
| 영구 회귀 테스트 하니스 | `src/main.rs` `test_opencode_sse`, `TestSummary`, `--test-opencode-sse` CLI 플래그 |
| 참조 레퍼런스 (외부) | oh-my-opencode `src/cli/run/poll-for-completion.ts`, `src/features/background-agent/manager.ts`, opencode `packages/opencode/src/server/routes/{session,event}.ts`, opencode `packages/opencode/src/cli/cmd/run.ts` |

---

## 12. 시간선 요약

1. "empty response" 계열 버그 리포트 → `opencode.rs` legacy 경로에 Gap 1~6 수정 적용.
2. "완료되면 응답해드리겠습니다" 증상 리포트 → 초기엔 모델 환각으로 추정.
3. 사용자가 oh-my-opencode 플러그인 사용 중이라고 알려줌 → 플러그인 레포 클론 후 실제 원인 확정.
4. 이 시스템에서 opencode 1.4.3 + 플러그인 설치하여 end-to-end 재현 성공.
5. 해법 옵션 검토, 접근 2 (per-turn `opencode serve` + SSE) 선택.
6. 사전 조사: cokacdir tokio 런타임 확인, opencode HTTP API 표면 실측, SSE 포맷 캡처.
7. 구현: `execute_command_streaming_serve` 및 헬퍼 함수 ~1000줄 추가, legacy 경로 보존, dispatcher 도입.
8. 1차 자체 감사 (정적 리뷰) → 버그 A–G 발견 및 수정.
9. 이 문서 1차 작성.
10. **사용자가 빌드와 직접 실행을 명시적으로 허락**.
11. `python3 build.py --linux-arm64` 빌드 → 5개 추가 버그 (H~L) 가 컴파일러 에러와 런타임 hang/leak 으로 차례로 드러남:
    - H: `reqwest::RequestBuilder::json` 미존재 → 수동 직렬화로 우회
    - I: `Init` 메시지 중복 송신 → SSE consumer fallback 제거
    - J: process group 좀비 → `process_group(0)` + `libc::kill(-pid, SIGKILL)` 도입
    - K: fast-fail 시 poll 무한 hang → `elapsed >= POLL_MIN_STABILIZATION` fallback 추가
    - L: fast-fail 시 빈 Done 송신 → `last_error` 공유 슬롯 + Error 로 demote
12. `src/main.rs` 에 영구 회귀 인프라 (`--test-opencode-sse` + 부속 플래그 + verbose poll 로그) 추가.
13. 4개 시나리오 (T1~T4) 검증 모두 PASS, leaked 프로세스 0개 확인.
14. devdoc 갱신 (섹션 6b/6c/9 추가).
15. 사용자 지시로 **이전에 "미커버" 로 남겨두었던 4개 시나리오 (cancel, 30분 타임아웃, 서버 크래시, 동시 세션) 2차 검증**. 테스트 하니스에 `--cancel-after`, `--expect-cancelled` 플래그 추가, `CancelToken` 주입 경로 추가, 검증 환경 격리 레시피(XDG_CONFIG_HOME + 로컬 opencode 1.4.3 설치) 정립.
16. **2차 검증 중 버그 M 발견 및 수정**: 서버가 mid-turn 에 죽었을 때 `poll_until_complete` 가 HTTP 에러를 무한 재시도하며 30분 timeout 까지 소진하는 문제. `POLL_MAX_CONSECUTIVE_ERRORS = 6` 도입 + `consecutive_http_errors` 카운터 + `last_http_error` 슬롯 추가로 6회 연속 에러 시 즉시 `PollError::Fatal` 반환하도록 수정. 재검증 PASS.
17. V1~V5 (2차 검증) 모두 PASS 확인, leaked 프로세스 0개 재확인.
18. devdoc 2차 갱신 (지금 이 문서 — 섹션 5.3 상수 업데이트, 6b 버그 M 추가, 6d 2차 검증 섹션 신설, 9b 플래그 표 확장, 9d 재작성, 9e 잔여 미커버 분리, 시간선 15~18번 추가).
19. **텔레그램 파일 첨부 비활성화**: opencode 응답이 `file_attach_threshold` (8192바이트)를 초과할 때 스트리밍 중 읽던 내용을 `📄 Response attached as file`로 덮어쓰고 전체 응답을 파일로 중복 전송하는 문제 확인. `should_attach_response_as_file(response_len, provider_str)` 헬퍼를 도입해 `provider_str == "opencode"`일 때 파일 첨부를 비활성화. `telegram.rs`의 6개 판정 지점(일반/스케줄/봇메시지 × 정상종료/Stopped) 모두 적용. 스트리밍 중 delta 커밋 경계로만 쓰이는 3개 `file_attach_threshold()` 호출은 변경 없이 유지.
20. **reasoning delta 필터링**: opencode SSE 어댑터의 `handle_sse_event`에서 `message.part.delta` 핸들러가 파트 타입을 확인하지 않아 reasoning 파트의 플레인텍스트 delta가 `StreamMessage::Text`로 텔레그램까지 누출되는 구조적 결함 확인 및 수정. `part_types: HashMap<String, String>`을 도입해 `message.part.updated` 시점에 파트 타입을 기록하고, `message.part.delta`에서 화이트리스트(`part_type == "text"`인 delta만 통과) 적용.
21. **reasoning 필터 검증**: 직접 `opencode serve --port 14096`을 띄우고 3개 모델(gpt-5.1-codex-mini, gpt-5.4, big-pickle)로 raw SSE 이벤트를 수집해 파트 타입별 delta 발생 여부를 실측. 이후 빌드된 바이너리(`./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse`)로 gpt-5.4에서 reasoning이 차단되고 응답 텍스트만 전달됨을 확인. 상세는 섹션 13 참조.
22. devdoc 3차 갱신 (섹션 13 신설, 시간선 19~22번 추가).

---

## 13. reasoning delta 필터링 및 파일 첨부 비활성화

### 13.1 문제 1 — 텔레그램 파일 첨부 전환

opencode를 통한 AI 응답이 `file_attach_threshold()` (기본 `TELEGRAM_MSG_LIMIT * 2 = 8192`바이트)를 초과하면 telegram.rs가 스트리밍 중 placeholder를 `📄 Response attached as file`로 덮어쓰고 전체 응답을 `.txt` 파일로 첨부한다.

rolling placeholder 구조에서 이 전환이 일어나면 사용자는 다음을 경험한다:

1. 이미 확정된 메시지들로 8000자 이상의 응답을 읽고 있다
2. placeholder의 마지막 수백 자가 갑자기 `📄 Response attached as file`로 교체된다
3. 첨부 파일에는 이미 읽은 8000자 + 나머지가 전부 들어있다

opencode는 reasoning 모델 + tool 호출 등으로 응답 길이가 쉽게 임계값을 넘기므로 이 전환이 빈번하게 발생할 수 있다.

**수정**: `telegram.rs`에 `should_attach_response_as_file(response_len, provider_str)` 헬퍼를 추가. `provider_str == "opencode"`이면 무조건 `false`를 반환해 파일 첨부 분기를 타지 않는다. 임계값을 넘는 응답은 기존 `send_long_message` 경로로 분할 전송된다.

변경 위치 (`src/services/telegram.rs`):

| 줄 | 용도 |
|---|---|
| 1779 | `should_attach_response_as_file` 헬퍼 정의 |
| 7113 | 일반 메시지 FINAL (정상 종료) |
| 7255 | 일반 메시지 STOPPED |
| 9034 | 스케줄 STOPPED |
| 9067 | 스케줄 FINAL |
| 9811 | 봇 메시지 FINAL |
| 9959 | 봇 메시지 STOPPED |

`execute_schedule`의 `tokio::spawn` 직전에 `let provider_str: &'static str = detect_provider(model.as_deref());`를 추가해 closure에 캡처되도록 했다. 일반 메시지와 봇 메시지 경로는 이미 `provider_str`이 scope에 있었다.

스트리밍 중 delta 커밋 경계로 `file_attach_threshold()`를 사용하는 3개 지점(7008, 8947, 9731)은 파일 첨부 판정이 아니라 rolling placeholder의 확정 크기를 결정하는 용도이므로 변경하지 않았다.

### 13.2 문제 2 — reasoning delta 누출

SSE 어댑터의 `handle_sse_event` 에는 두 이벤트 경로가 있다:

- `message.part.updated`: `part.type` 필드를 볼 수 있으므로 `"reasoning"`을 명시적으로 무시 (기존 코드, 2445줄)
- `message.part.delta`: `props.field == "text"`만 확인하고 파트 타입 정보가 없음. reasoning 파트의 delta도 `field: "text"`이므로 필터를 통과해 `StreamMessage::Text`로 텔레그램까지 도달

### 13.3 실측 — raw SSE 이벤트 수집

직접 `opencode serve --port 14096`을 띄우고 3개 모델로 reasoning을 유발하는 프롬프트를 전송해 raw SSE 이벤트를 수집했다.

**관측된 파트 타입과 delta 발생 여부**:

| 파트 타입 | delta 발생 | 모델별 특이사항 |
|---|---|---|
| `text` | O (항상) | 어시스턴트 응답 텍스트. 전달 대상 |
| `reasoning` | 모델에 따라 다름 | gpt-5.1-codex-mini: 암호화만(delta 0건). gpt-5.4: 플레인텍스트 delta 발생. big-pickle: 플레인텍스트 delta 발생 |
| `tool` | X | `message.part.updated`에서 completed/error 상태일 때 별도 경로(ToolUse/ToolResult)로 처리 |
| `step-start` | X | — |
| `step-finish` | X | — |
| `patch` | 미관측 | 기존 코드에서 무시 목록에 포함 |
| `snapshot` | 미관측 | 기존 코드에서 무시 목록에 포함 |

**모델별 reasoning 상세**:

| 모델 | reasoning 전달 방식 | delta 건수 | 텍스트 크기 |
|---|---|---|---|
| `openai/gpt-5.1-codex-mini` | 서버측 암호화. `text=""`, `metadata.openai.reasoningEncryptedContent`에 블롭 | 0 | 0 |
| `openai/gpt-5.4` | 암호화 + **플레인텍스트 delta 동시 발생**. `text` 필드에 357자 누적 | 69 | 357자 |
| `opencode/big-pickle` | 플레인텍스트만. `text` 필드에 1454자 누적 | 14 | 1454자 |

**핵심 발견**: 모든 delta의 `(part_type, field)` 조합은 `(text, text)`와 `(reasoning, text)` 두 가지뿐이었다. 전달해야 하는 것은 `(text, text)` 뿐이다. 이 데이터가 화이트리스트 방식을 지지한다.

**이벤트 순서 확인**: 3개 모델 모두에서 `message.part.updated`(파트 타입 포함)가 해당 파트의 첫 `message.part.delta`보다 먼저 도착했다. `part_types` 맵이 delta 도착 시점에 항상 채워져 있음을 확인.

### 13.4 수정 내용

블랙리스트(`reasoning`만 차단)가 아닌 **화이트리스트(`text`만 허용)** 적용. 향후 알 수 없는 새 파트 타입이 추가되어도 기본적으로 차단된다.

변경 위치 (`src/services/opencode.rs`):

| 줄 | 내용 |
|---|---|
| 2197 | `part_types: HashMap<String, String>` 선언 (`consume_sse_chunks` 내부) |
| 2263 | `handle_sse_event` 호출 시 `&mut part_types` 전달 |
| 2310 | `handle_sse_event` 시그니처에 `part_types` 파라미터 추가 |
| 2383 | `message.part.updated`에서 `part_types.insert(part_id, part_type)` |
| 2423 | 텍스트 파트 종료(`has_end`) 시 `part_types.remove(&part_id)` |
| 2500 | `message.part.delta`에서 `part_types.get(&part_id) != Some("text")`이면 `return` |

`part_types` 맵은 `consume_sse_chunks` 로컬 변수이므로 턴 종료 시 자동 해제된다. reasoning 파트 엔트리는 명시적으로 제거하지 않지만 턴 단위 lifecycle이므로 누수 없음.

### 13.5 빌드 검증

`python3 build.py --linux-arm64`로 빌드 후 `--test-opencode-sse`로 gpt-5.4에 reasoning을 유발하는 프롬프트 전송:

```
$ ./dist_beta/cokacdir-linux-aarch64 --test-opencode-sse \
  "Think step by step. Count the number of letter r in strawberry." \
  --model openai/gpt-5.4 --dir /tmp
```

결과: Text 이벤트 18건, 전부 최종 응답 텍스트("Sisyphus here: there are 3 r's in \"strawberry.\"")의 delta 조각. reasoning 내용(수정 전 raw SSE에서 69개 delta, 357자로 관측)은 0건. `Done.result = 53바이트`.

| 항목 | 수정 전 (raw SSE 프로브) | 수정 후 (빌드 바이너리) |
|---|---|---|
| Text 이벤트 수 | 87 (reasoning 69 + 응답 18) | 18 (응답만) |
| reasoning 내용 | 357자 플레인텍스트 노출 | 0자 |
| Done.result | reasoning + 응답 혼합 | 응답 53바이트만 |

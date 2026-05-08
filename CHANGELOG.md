# Changelog — cokacdir

## 0.6.5 — 2026-05-07

- **Busy-slot panic recovery now uses dispatch ownership instead of `Arc::strong_count`.** 0.6.4's `strong_count == 1` check correctly avoided the false-positive of killing a foreign owner's child, but had a known gap: a panic in a handler whose fire-and-forget sub-task was still running left the slot busy until that sub-task finished, because the surviving clone kept `strong_count ≥ 2`. Each `CancelToken` now carries an `owner_dispatch_id: AtomicU64` set at creation, and every chat_worker unit gets a fresh dispatch id from a process-wide counter via a `CURRENT_DISPATCH_ID` task-local. Recovery removes the slot iff the post-panic token's owner matches the panicked dispatch's id — independent of how many `Arc` clones are still in flight. Scheduler reservations, queued feedback, and later handlers carry different owner ids, so the same check still leaves their tokens alone. Both panic-recovery sites — chat_worker dispatch and inline dispatch — also now use `cancel_token_now(&tok)` (sets `cancelled=true` **and** SIGTERMs the recorded child PID); the chat_worker path previously only SIGTERMed and left siblings (e.g. an exec polling loop on a blocking thread that survived the async parent's panic) waiting on signal delivery alone.
- **Inline queue/feedback dispatches and scheduler-side handlers now recover from panics.** 0.6.3 covered chat_worker dispatch only. The remaining panic surfaces — the queue/loop inline `tokio::spawn` (`loop:dispatch`, `queue:next`), `execute_schedule`, and `process_bot_message` — were each fire-and-forget and a panic invisibly stranded the pre-inserted busy-slot token, plus (for `execute_schedule`) the schedule-specific session and `pending_schedules[chat_id]` entry, so the chat would refuse new requests forever and a `/start` would still see the half-mutated state. Each of these sites is now wrapped by an inner `tokio::spawn` running inside `CURRENT_DISPATCH_ID.scope(dispatch_id, ...)`, the JoinHandle is awaited, and on `JoinError` the new `reclaim_panicked_dispatch_token` helper performs the owner-id-gated cleanup. The `execute_schedule` path additionally restores `sessions[chat_id]` from a captured `prev_session` clone and removes the schedule's id from `pending_schedules` — restoration is idempotent so a panic after `execute_schedule`'s own cleanup just rewrites identical state. All four sites also print `Chat <id> <ctx> ... panicked: ... — recovering` to stderr for operational visibility.
- **`scheduler_loop` itself now survives panics inside its cycle body.** Previously a single `loop { ... await ... }` whose body could panic on `chrono::NaiveDateTime::parse_from_str`, `list_schedule_entries`, `should_trigger`, any file IO, or any Telegram API call — and a panic killed the scheduler permanently for the rest of the process lifetime. The cycle body is now extracted into `scheduler_cycle` and each 5-second tick spawns it and awaits; a `JoinError` is logged (`Scheduler cycle panicked: ... — continuing on next tick`) and the loop continues. Per-dispatch state is already protected by the inner recovery paths above, so cycle-level panics primarily affect logging and the in-progress iteration of the entries/messages loops; the next tick re-scans the schedule directory and the messages spool, so any work skipped by the panicked iteration is naturally retried.
- **Deterministic `run_bot` shutdown via `RunBotCleanup` + sync token mirror.** A `RunBotCleanup` RAII guard installed early in `run_bot` runs at function exit (graceful shutdown, fatal `PollingExit`, or panic propagating up). Its `Drop` synchronously drains a `request_tokens` mirror of `cancel_tokens` — a `std::sync::Mutex<HashMap<ChatId, Arc<CancelToken>>>` kept in lock-step by `insert_cancel_token_locked` / `remove_cancel_token_locked`, the only two paths now allowed to mutate `cancel_tokens` — and SIGTERMs every recorded child PID. The sync mirror exists because async-locked state is unreachable from a sync `Drop` when the runtime is shutting down; without it, in-flight AI subprocesses could outlive the process and become init-adopted zombies. As a defensive second pass, the Drop also `try_lock`s the async state for re-cancel (idempotent) and schedules a final async cleanup via `Handle::try_current().spawn(...)` for cases where the try_lock failed but the runtime is still running. Polling and scheduler tasks are aborted via `AbortOnDrop` guards before `RunBotCleanup`'s drop, so by SIGTERM-time the only outstanding work is in-flight AI subprocesses.
- **Per-request async tasks are now tracked for shutdown.** Three `spawn_tracked_*` helpers (`request_task`, `blocking_task`, `blocking_result`) replace fire-and-forget `tokio::spawn` / `tokio::task::spawn_blocking` calls in every AI streaming path (text, queue, loop, schedule, bot-to-bot). Each spawn registers an `AbortHandle` in `request_tasks: Arc<Mutex<HashMap<u64, AbortHandle>>>` under a monotonic id, and a `RequestTaskGuard` removes the entry on drop via a ready-channel pattern: the guard is sent to the spawned task immediately after registration, so an abort that fires before the task starts cleanly drops the guard on the spawning side and the entry is removed without leaking. `abort_request_tasks` aborts every registered handle at shutdown. Doc comments on the blocking variants spell out the tokio limitation — `AbortHandle::abort()` does not preempt a blocking thread; shutdown of the AI subprocess itself relies on the `CancelToken`'s `cancelled` flag + SIGTERM path, not the abort handle. `ChatWorkerEntry` was similarly extended from a bare mpsc sender to `(sender, AbortHandle)` so a forced removal mid-handler aborts the worker cleanly instead of waiting for it to next yield.

---

## 0.6.4 — 2026-05-07

- **Backend death no longer kills sibling bots in a multi-bot deployment.** 0.6.2 surfaced Discord/Slack gateway death by having `run_bridge` call `std::process::exit(1)` directly — correct for a single-bot deployment, but in multi-bot setups (Telegram + Discord + Slack running concurrently in one cokacdir process) one bridge's backend dying tore the entire process down and stopped every other bot too. This contradicted 0.6.1's per-bot isolation principle (where a Telegram fatal `PollingExit` only ends that bot's task and leaves the others running). `run_bridge` now returns a `BridgeExit` enum (`Graceful` | `Fatal`) instead of exiting the process. `main` decides the exit code at the right scope: a single-bot bridge still exits with status 1 on `Fatal` (preserving the supervisor signal that systemd / docker watch for), and the multi-bot path collects `Fatal` flags via a shared `AtomicBool`, lets healthy bots keep serving traffic, and only exits 1 after every bot's task has finished. The detached `run_proxy_server` task and the backend listener are now held as `JoinHandle`s and explicitly aborted before `run_bridge` returns (via an `abort_handle` for the backend), so a dying bridge does not leak its TCP-bound proxy port or its gateway listener into the runtime that the surviving bots are sharing.
- **Chat busy-slot panic recovery no longer false-reclaims foreign tokens.** 0.6.3 used an `Arc::ptr_eq` snapshot to decide whether the token currently in `cancel_tokens` belonged to the panicked handler (reclaim) or a foreign owner (leave alone). The check had two narrow but real race windows: (a) `pre_token == None` followed by a foreign task (`execute_schedule` / `process_bot_message`) inserting between the snapshot and the handler's first `state.lock()` — if the handler then took the queue path and panicked, the foreign-inserted token was misclassified as handler-inserted and got removed plus its child SIGTERMed; (b) `pre_token == Some(F)` where `F` finished and a *different* foreign owner inserted `G` during the gap — `Arc::ptr_eq(F, G)` is false, so `G` was again falsely reclaimed. The check is now `Arc::strong_count(post) == 1`: reclaim only when the map's entry is the *only* live `Arc` reference to this `CancelToken`. Every still-running owner (the panicked handler before unwind, a fire-and-forget child holding a clone, a scheduler-side task, or any foreign owner that inserted before this dispatch) keeps at least one extra `Arc` clone in its stack, so `strong_count` observes ≥ 2 while any of them are alive and the entry is left for the real owner to clean up. The state lock is held across both the count check and the `remove`, so the count cannot be mutated between the two. The trade-off — that a panic in a handler whose fire-and-forget sub-task is still running will leave the slot busy until that sub-task finishes naturally instead of being aggressively SIGTERMed — was the explicit known-gap territory called out in 0.6.3's changelog and is preferable to the prior false-positive of killing a healthy foreign task's child.

---

## 0.6.3 — 2026-05-07

- **Chat is no longer permanently stuck "busy" after a handler panic.** `/stop` and `/stopall` only set `cancelled=true` on the cancel token — they intentionally do not remove the map entry, deferring removal to the in-flight task's normal cleanup path. When that task panicked between `cancel_tokens.insert` and `cancel_tokens.remove` the cleanup never ran, leaving the slot held forever and the chat unable to start any new AI request (queue/redirect would always see "busy"). Even `/stop` could not recover this state because it never removed the token. The chat_worker's `Err(join_err)` arm now reclaims the orphaned slot immediately after the inner `tokio::spawn` reports a panic and best-effort SIGTERMs the child PID stored in the token in case the AI subprocess outlived the panicked parent task. Logged to `msg.log` and stderr (`Chat <id> busy slot reset`). Reclaim is gated by an `Arc::ptr_eq` identity check against a pre-dispatch snapshot: a token whose `Arc` identity is unchanged from before this unit ran belongs to some other still-running owner — either a fire-and-forget polling task spawned by an earlier unit on this same worker, or a scheduler-side task (`execute_schedule` / `process_bot_message` invoked from `scheduler_loop`) — and is left alone, so the panicking handler cannot strand a foreign owner or SIGTERM its child. Coverage is the chat_worker dispatch (the bulk of user-message panic surface); panics inside fire-and-forget tasks spawned by `handle_text_message` / `handle_shell` / `execute_schedule` / `process_bot_message` (the per-unit polling loops at lines 9201 / 7522 / 11581 / 12427) remain uncovered as a known gap, since wrapping each requires invasive refactoring of its polling task structure.
- **Bot-to-bot message no longer lost in TOCTOU window.** `scheduler_loop` previously deleted the on-disk message file at `~/.cokacdir/messages/<id>.json` immediately after its busy-check (under `state.lock()`) and then called `process_bot_message`. Between the lock release and `process_bot_message`'s own claim, a concurrent chat_worker on another thread could claim the slot — `process_bot_message` would then see "busy" and return early with the file already gone, dropping the message silently. The deletion is now performed inside `process_bot_message` immediately after its claim succeeds; if the claim fails the file is left on disk so the next 5-second scheduler tick re-discovers and re-attempts it.

---

## 0.6.2 — 2026-05-07

- **Discord and Slack backend death is now detected and surfaced.** Previously the bridge spawned each backend's gateway listener (`serenity::Client::start` for Discord, `SlackClientSocketModeListener::serve` for Slack) into a fire-and-forget `tokio::spawn` and discarded the `JoinHandle`. When the listener gave up reconnecting (token revoked, persistent disconnect, banned bot, internal panic) the proxy server and teloxide poller stayed up but no messages ever arrived — the bot looked healthy but was vegetative. This is the exact same failure-class as Telegram 401/409 that 0.6.1 already addressed, just on the other side of the bridge. `MessengerBackend::start` now returns `Result<JoinHandle<()>, String>`, and `run_bridge` races that handle against `run_bot` via `tokio::select!`. When the backend dies first, cokacdir prints `Backend listener stopped — bot can no longer receive messages. Reason: <gateway exit / panic / error>. Fix the underlying issue and restart cokacdir.` and exits with status 1 instead of presenting a silent dead bot.
- All three `MessengerBackend` implementations (`ConsoleBackend`, `DiscordBackend`, `SlackBackend`) updated to return their internal task's `JoinHandle` so the death signal propagates uniformly. `tokio::task::spawn_blocking` (Console stdin) and `tokio::spawn` (Discord/Slack) both yield `JoinHandle<()>` directly, so no wrapping required.

---

## 0.6.1 — 2026-05-07

- **Strict per-chat ordering across `getUpdates` batches.** The previous `process_batch` spawned a fresh task per chat per batch and immediately returned, so a slow handler on chat C in batch N could still be running when batch N+1's task for chat C started — `state.lock()` ordering was undefined across batches. Each chat now has a long-lived FIFO mpsc worker (`run_chat_worker`) that pulls units one at a time and awaits each before the next. `process_batch` only pushes into the channel; the worker is created on first use and reused across reconnects, so within a chat the arrival order Telegram delivered is exactly the processing order, regardless of how many batches the messages span.
- **Conflict (multiple-instance) and Unauthorized (revoked token) are now fatal instead of silently retried.** `polling_loop` previously treated every `getUpdates` error as transient and slept-and-retried, so two cokacdir processes on the same token would thrash forever stealing updates from each other, and a revoked token would loop indefinitely with no surfaced cause. `detect_fatal_polling_error` now classifies these by inspecting the full `RequestError::Display` (covering both `Api(Unauthorized)` typed variants and the `Api(Unknown(...))` wrapper, plus any `Network` re-wrapping in future teloxide versions) with anchored matches `Conflict: ` and `Unauthorized` (trailing or before `: `). The anchors avoid false-positive on unrelated messages like `Bad Request: scheduling conflict in cron expression` or `... user is unauthorized to ...`, which would otherwise stop a healthy bot. `polling_loop` returns `PollingExit::Fatal(reason)` and `run_bot` prints `Bot @<name> stopped: <reason>. No reconnect — fix the underlying issue and restart cokacdir.` and exits the reconnect loop. Other bots in the same process keep running.
- **`polling_loop` honors `RetryAfter` verbatim.** A 429 response with a server-mandated cooldown (`RetryAfter(s)`) now sleeps for exactly `s` seconds and resets the local backoff to 500 ms, instead of compounding the linear 500 ms→1 s→2 s→… escalation while ignoring the server's request. Mirrors the `RetryAfter` handling already in `get_updates_with_retry` (startup flush) and the spinner-edit path (introduced in 0.4.99).
- **Panics inside chat handlers no longer disappear silently.** Each `DispatchUnit` is now executed inside an inner `tokio::spawn` whose `JoinHandle` is awaited by the worker; on `JoinError::is_panic` the worker logs `[chat_worker <id>] handler PANICKED: <msg>` to `msg.log` and prints `⚠ Chat <id> handler panicked: ... — continuing` to stderr, then resumes with the next unit. The previous detached-task model dropped the `JoinHandle` and a panic was invisible to operators.
- **Graceful chat-worker shutdown.** When `run_bot` exits the reconnect loop (fatal or future shutdown signal), the workers map is cleared so the senders drop and each worker observes `recv() → None` and exits on its own — no `abort()` mid-handler, so an in-flight unit is never killed at an inconsistent point.
- Internal: `DispatchUnit` (was a local enum inside `process_batch`) and `ChatWorkers` are now module-level so the same type flows through the per-chat channel; `process_unit` centralizes the album-fragment vs ≥2-photo dispatch decision.

---

## 0.6.0 — 2026-05-06

- **Telegram long-polling no longer times out during idle periods.** teloxide's default reqwest client ships a 17 s timeout, but `polling_loop` asks the server for a 30 s long-poll — the client closed the connection mid-poll, surfacing as repeated `getUpdates ... operation timed out` errors in `msg.log` whenever no messages arrived for ~17 s. The bot now builds reqwest with a 45 s timeout that strictly exceeds the long-poll window.
- **Codex `--sendfile` paths with spaces are now extracted correctly.** The previous extractor split on whitespace and grabbed the next token, so `--sendfile "/path/with spaces/img.png"` was truncated at the first inner space. The extractor now walks the command string, validates `--sendfile` as a whitespace-bounded token (rejects matches like `--no-sendfile`), and respects single/double quotes so the full quoted path is recovered.
- **Windows askpass refuses passwords containing newline or `"`.** CMD's `echo` cannot safely encode either character — a newline splits the script into a new command (injection) and a `"` closes a quoted segment. The askpass-script generator now errors out with a clear message instead of attempting partial escaping that CMD's parser quirks would defeat.
- Internal: `read_group_chat_log_tail` no longer double-counts corrupt lines on its second pass (pass 1 already attributes every io/parse failure under the same shared lock).

---

## 0.5.9 — 2026-05-06

- **Bot tokens are now redacted from on-disk debug logs and user-facing error messages.** teloxide / reqwest can include the request URL (`/bot<TOKEN>/...`) in some error kinds — both `RequestError::Network` and `reqwest::Error::Display` are known offenders. A process-wide token registry is consulted by `redact_known_tokens` from `tg_debug` (`debug/api_*.log`), `msg_debug` (`debug/msg.log`), `sched_debug` (`debug/cron.log`), `ai_trace` (`debug/ai_trace.log`), the file-download error path, and every `println!`/`eprintln!`/Telegram error message that renders a teloxide error.
- **Pending-updates flush at startup is now mandatory.** Previously a transient network failure during `getUpdates(offset=-1)` would log a warning and start polling anyway, leaking stale messages into the new run. Both flush steps now retry up to 5 times with exponential backoff (and honor `RetryAfter`); exhausting retries aborts the process with `FATAL: failed to {fetch,confirm} pending updates after 5 attempts` instead of proceeding with a half-flush.
- **Per-chat strict ordering for batched updates.** A `getUpdates` response containing two messages from the same chat used to spawn two independent tasks that raced for `state.lock()`. Updates are now grouped by `chat_id` and each chat is handled by a single task that awaits its units sequentially; different chats still run in parallel. Album batching is preserved.
- **`/debug` is now per-bot, not per-chat.** The flag is stored once per bot token; `refresh_global_debug_flags` re-evaluates the process-wide enable state at toggle time (env override or any saved bot's flag). Toggling OFF in one chat now reports `Shared debug logging is still ON because another bot or COKACDIR_DEBUG=1 enables it.` when applicable instead of misleadingly claiming logs were disabled.
- **Slash-command routing uses exact name matching.** `text.starts_with("/foo")` is replaced by `is_cmd(text, "foo")` across every router branch, so a future command like `/silentmode` or `/queueoff` cannot be silently re-routed to `/silent` / `/queue`. `command_name` strips an optional `@botname` suffix before comparison.
- **Owner-only commands now reject in group chats with a single clear message** (`Only the bot owner can use this command.`) via a centralized `is_owner_only_command` gate (covers `/start`, `/clear`, `/public`, `/setpollingtime`, `/model`, `/greeting`, `/debug`, `/envvars`, `/usechrome`, `/silent`, `/queue`, `/direct`, `/contextlevel`, `/instruction`, `/instruction_clear`, `/setendhook`, `/setendhook_clear`, `/allowed`).
- **Tail-N reader for group-chat logs.** `read_group_chat_log_tail(chat_id, n, …)` streams the JSONL with O(n + bot_count) memory using a two-pass scan (clear-marker map, then a sliding window of size `n`). The system-prompt hot path used to call `read_group_chat_log_range(.., 1, None, ..)` and slice the tail, materializing the whole log on every AI turn — now linear in the window size only.
- **Cron expressions are validated at write time.** `validate_cron_expression` rejects field-count mismatches, named values (JAN/MON), macros (`@reboot`), the L/W/? characters, out-of-range numbers, and zero step. Invalid `--at` values now error at register/update time instead of silently never firing. Includes a `Sunday is 0, not 7` hint when day-of-week=7 is supplied.
- **Schedule IDs from CLI input are validated as `[0-9A-F]{8}` before being composed into a path.** `--cron-context`, `--cron-history`, and `--cron-remove` now refuse path-traversal segments. `schedule_history_path_pub` returns `None` for malformed ids, and `delete_schedule_entry_pub` / `delete_schedule_history_pub` short-circuit the same way.
- **`--cron-history` redacts only after authorization succeeds.** Calling redact on a smuggled path could otherwise write outside the `schedule_history` dir. Redaction now runs only after the caller proves authorization via the live entry or the first history record's verifier; `is_valid_schedule_id` is enforced as defense in depth.
- **Session IDs spliced into AI-CLI argv are now argparse-injection-safe.** `is_valid_session_id` (Claude, Codex, Gemini, OpenCode, AI screen, and the shared `services::process` helper) explicitly rejects a leading `-`. Without that, a value like `--config /etc/passwd` would pass the prior alphanumeric-and-dash check and be parsed as a new flag by the downstream CLI.
- **Dedup verifies byte-level equality before destructive deletion.** A theoretical MD5 collision could otherwise cause `run_dedup` to remove a non-duplicate file. `files_byte_equal` reads both files in equal-sized 64 KB chunks via `read_exact` (avoiding `Read::read` short-read mismatches that the prior code path was vulnerable to) and is invoked under the cancel-flag check.
- **Symlink security in archive / copy paths hardened.**
  - `target_is_sensitive` matches on path-segment boundaries — `/etc` no longer matches `/etcd/foo`.
  - `check_symlinks_for_tar` canonicalizes the base directory once and fails closed if it cannot be resolved; previously a transient canonicalize failure bypassed all checks (fail-open).
  - `check_symlink_recursive` propagates `read_dir` errors instead of silently skipping unreadable directories; `collect_unsafe_symlinks` excludes a directory it cannot enumerate.
  - `copy_dir_recursive_with_progress` now rejects circular symlinks via a `HashSet` of canonicalized parents and a `MAX_COPY_DEPTH` guard, mirroring the existing unprefixed copy path.
- **`.cokacenc` decryption masks setuid/setgid/sticky bits.** A maliciously crafted archive cannot set `04755` on an extracted file as a privilege-escalation vector — `unpack_file_group` applies `mode & 0o0777` before `set_permissions`.
- **Discord and Slack file-fetch endpoints are now host-restricted.** The proxy receives the file URL via an HTTP path component, so without a host check an attacker who could reach the bridge port could SSRF arbitrary URLs — and on Slack, ship the bot token in the `Authorization` header. `is_allowed_discord_file_url` accepts only `cdn.discordapp.com` / `media.discordapp.net`; `is_allowed_slack_file_url` accepts `files.slack.com`, `slack.com`, and `*.slack.com`. Both match host on a segment boundary so `cdn.discordapp.com.evil` is rejected, and host extraction terminates at `?` and `#` so query-only URLs cannot smuggle the boundary.
- **Bridge token comparison is now constant-time.** The 401 path in `route_request` used a plain `!=`, which leaks a timing oracle on the prefix of `state.expected_token`. `tokens_eq_constant_time` always inspects every byte and uses `std::hint::black_box` to discourage length-leak optimization.
- **`bot_settings.json` is now written `0600` (parent dir `0700`) on Unix.** The file holds chat history, working paths, and chat IDs; permissive defaults previously left it readable to other users on shared hosts. The atomic `tmp` file is also chmod'd before the rename.
- **`PartialFileGuard` cleans up partial SFTP downloads on cancel/error.** Failed or cancelled transfers no longer leave a truncated file masquerading as a successful one. The guard drops the file handle before `remove_file` so Windows' open-file lock doesn't block removal.
- **`AskpassGuard` removes the temporary `SSH_ASKPASS` script via RAII**, with a random per-call nonce in the filename so concurrent transfers from the same PID don't collide on `askpass_<pid>`.
- **Stderr is now drained in a background thread for Claude, Gemini, and OpenCode-legacy.** When the child wrote more than ~64 KB to stderr while the parent was blocked reading stdout, the pipe filled and the whole pipeline deadlocked. Pattern mirrors `codex.rs`.
- **`expand_tilde` consolidated into `services::remote`.** `~`, `~/`, `~\` resolve to the user's home; `~user/` is intentionally left unexpanded (we cannot resolve another user's home, and rewriting it as `$HOME/user/` would yield a silently-wrong path). Replaces three duplicated implementations across `remote.rs` and `remote_transfer.rs`.
- **`handle_message` no longer wipes pending uploads when a message is for a sibling bot.** A `;`-prefixed photo upload addressed to all bots could previously be silently lost when one bot saw a follow-up text intended for another. Uploads are now consumed only when an addressed message actually arrives.
- **`/envvars` is now 1:1-only.** A group-chat dump would expose env vars like `ANTHROPIC_API_KEY` to non-owner members. Replies with `/envvars is only available in a 1:1 chat with the bot.` in groups; the existing owner gate is preserved everywhere.
- **`getUpdates` offset boundary handled explicitly.** `next_offset_after(last_id)` caps the offset at `i32::MAX` and logs the boundary hit when triggered (rare in practice — `update_id` rolls past i32 very slowly).
- **File-extension truncation in the panel uses `chars().count()`.** A multi-byte extension like `.한글` no longer panics with "byte index is not a char boundary" inside `&str` slicing.
- **`append_group_chat_log` and `read_group_chat_log_range` log every silent-loss path under `/debug`.** Previously a `create_dir_all`/`open`/`lock_exclusive`/`write_all`/`sync_data` failure dropped the entry without trace; the debug stream now identifies which step failed and how many lines were unreadable / unparseable.
- 7 new built-in docs (env vars, settings, tools, Slack bot setup, file transfer, shell commands, sharing bot with others) ship in `~/.cokacdir/docs/` so the AI can reference them — see also 0.5.8.
- Documentation and website updates across the env vars, settings, file-transfer, group-chat, multi-chat, request-management, schedules, and Slack sections.

---

## 0.5.8 — 2026-05-04

- **7 missing built-in docs are now deployed.** `deploy_docs()` previously omitted `how-to-configure-environment-variables.md`, `how-to-configure-settings.md`, `how-to-manage-tools.md`, `how-to-setup-slack-bot.md`, `how-to-use-file-transfer.md`, `how-to-use-shell-commands.md`, and `how-to-share-bot-with-others.md`, so the bot couldn't answer questions that referenced them. Added to the install set.
- **New `how-to-share-bot-with-others.md` guide** documenting the BotFather privacy toggle + group + `/direct` + `/public on` + `/contextlevel 0` flow for letting non-owner users interact with the bot through a shared group chat.
- Documentation updates across `how-to-configure-settings.md` (per-bot scope of `/debug`, `/usechrome` reference), `how-to-manage-requests.md` (`/queue OFF` redirect mechanics, confirmation-message wording, `/stop` / `/stop_<ID>` reply text), `how-to-manage-tools.md` (provider restriction: `/allowed` rejects on Codex/Gemini/OpenCode), `how-to-setup-discord-bot.md` (corrected required intents — only `MESSAGE_CONTENT` is required; `Manage Messages` permission removed), `how-to-simulate-multiple-chats-with-one-bot.md` (`/direct` is owner-only group-only; `/contextlevel` default is 12), `how-to-use-file-transfer.md` (concrete `/down` error messages), `how-to-use-shell-commands.md` (spinner replaces line-by-line streaming, 4000-byte threshold measured against rendered block, Windows powershell invocation), and `how-to-use-start-session-and-clear.md` (full ordering of `/clear` cancel-and-clean steps).

---

## 0.5.7 — 2026-05-04

- **Long-message splitter no longer produces empty chunks.** When `rfind('\n')` returned position 0 the resulting `raw_chunk` was empty and Telegram rejected the send with `text must be non-empty` (typically reproducible on AI responses that began with a blank line). Both `send_long_message` (5 split sites) and `truncate_str` now fall back to the full UTF-8-safe boundary when the only available newline split point would yield an empty leading chunk.

---

## 0.5.6 — 2026-05-04

- **Slack bot support added.** You can now use Slack bot tokens with `--ccserver`. Slack runs over **Socket Mode**, so a bot token (`xoxb-...`) and an app-level token (`xapp-...`) are both required. Token format is auto-detected as `xoxb-...,xapp-...` (either order), or you can prefix explicitly with `slack:`. Telegram, Discord, and Slack bots can now run simultaneously in the same server. New `slack-morphism` dependency. See the new "Slack Bot Setup" guide in the docs.
- **Atomic multi-attachment processing across all three platforms.** Telegram albums (members of the same `media_group_id` arriving in one `getUpdates` batch), Discord multi-attachment messages, and Slack multi-file uploads now behave identically: every file in the bundle is saved to the workspace, and the message caption — typically attached to the first item — routes the whole batch as a single AI request. Discord and Slack synthesize a `media_group_id` (`d:<msg_id>` / `s:<ts>`) on fan-out so the downstream album path picks them up uniformly. Previously, only the first Discord attachment was processed.
- **Telegram polling switched from `teloxide::repl` to direct `getUpdates`.** This is the mechanism that enables atomic album batching on Telegram — the new loop processes raw batches and groups album members deterministically by `media_group_id` instead of relying on a debounce timer. The outer reconnect-on-panic loop with exponential backoff is preserved, and transient `getUpdates` errors retry inline with their own bounded backoff.
- **Codex `image_gen` output is now auto-delivered.** Codex's built-in `image_gen` tool writes generated images to `~/.codex/generated_images/<session_id>/` without surfacing any tool event in `--json` output, so previously the user saw nothing. cokacdir now snapshots the directory at turn start and, when the turn ends, scans for new files (mtime ≥ turn-start, not in snapshot, not already delivered by a model-issued `--sendfile` in this turn) and runs `cokacdir --sendfile` for each. Synthetic `ToolUse`/`ToolResult` events are emitted so the bot UI renders the delivery exactly like a model-issued sendfile. Codex-only — Claude Code, Gemini, and OpenCode are unaffected.
- **Schedule history `bot_key` migrated to a non-secret SHA-256 verifier.** `~/.cokacdir/schedule/*.json` no longer stores the raw `bot_key` field on disk; instead a domain-separated verifier `SHA-256("cokacdir:live_schedule:v1\0" + id + chat_id + bot_key)` is stored. Pre-migration files are read transparently and rewritten on the next legitimate update. The schedule run-history files (`~/.cokacdir/schedule_history/<id>.log`) use a separate domain (`"cokacdir:schedule_history:v1\0"`) so a verifier from one system cannot authorize the other. History writes are now serialized via an `fs2` flock (`<id>.log.lock`), and a one-time idempotent legacy redaction marker (`<id>.log.redacted`) ensures plaintext keys are stripped exactly once. All cron/msg debug logs that previously printed the raw `bot_key` now print `key_supplied=true` or `<redacted>`.
- **`write_schedule_entry_pub` rejects empty `bot_key`.** `list_schedule_entries_pub` returns `ScheduleEntryData` with `bot_key=""` (since the raw key is no longer recoverable from disk), so any list-then-modify-then-write code path must re-supply the raw key from the CLI `--key` argument before writing. The new guard turns silent schedule orphaning into an explicit error. `handle_cron_update` now restores the raw key from `--key` before calling write, fixing what would otherwise have been a regression introduced by the verifier migration.
- **`--cron-history` now sanitizes records and triggers a one-time legacy redaction.** Reading a schedule's history file lazily redacts any pre-migration `bot_key` plaintext, then strips both `bot_key` and `bot_key_verifier` from each record before returning to the caller, so the JSON output exposes no key material.
- **Codex MCP / Collab / WebSearch event handling polished.**
  - MCP `tool_call` results now respect the codex `status` field — `status == "failed"` flags the result as `is_error=true` even when a partial result payload is present, and a synthetic error result is emitted when neither `error` nor `result` is populated.
  - Collab tool agent states (`pending_init` / `running` / `interrupted` / `completed` / `errored` / `shutdown` / `not_found`) are now rendered with `[status]` prefixes for problematic states and the `ToolResult` is marked `is_error` if any agent failed; healthy agent messages keep the prior message-only UX.
  - WebSearch decodes the action-tagged enum (`search` / `open_page` / `find_in_page` / `other`) instead of always falling back to `action.queries`. Empty displays no longer emit a bare ToolUse.
- **Slack-specific operational bits.** Per-channel rate limit (~1.1s) is enforced via a `last_post_at` map. Channel ⇄ chat_id mapping persists at `~/.cokacdir/bridge_maps/slack_<token_hash>.json` (atomic temp-rename) so scheduled tasks reach the right channel after restart. `app_mention` and `message.*` events for the same `ts` are deduplicated via a bounded `claim_incoming_event` set. File uploads use the Slack `files.completeUploadExternal` flow with a pending-mapping registered before completion so the auto-posted `file_share` event can attach the real `ts` for later edit/delete.

---

## 0.5.2 — 2026-04-28

- New `--cron-history <SID> --chat <ID> --key <HASH>` command — inspect the JSONL run-history file of a schedule. Each cron firing now appends a record (`ts, schedule_id, chat_id, prompt, status (ok|cancelled|error), response (capped at 4 KB), workspace_path, duration_ms, error?`) to `~/.cokacdir/schedule_history/<id>.log`. Authorization prefers the live schedule entry's `(chat_id, bot_key)` match, but falls back to the first record in the history file when the live entry is gone (one-time / `--once` schedules already auto-deleted), so already-executed schedules can still be inspected.
- The `--cron` JSON response now includes a `hint` field with the exact `--cron-history` invocation bound to that schedule's ID. This gives the AI a deterministic in-output mapping ("for THIS id, run THIS exact command"), useful when the user refers to the schedule by natural-language phrases like "방금 한 거" without naming the id.
- `--cron-remove` now also deletes the schedule's run-history file, so a future schedule that happens to receive the same 8-char ID does not inherit prior history.

---

## 0.5.1 — 2026-04-28

- **Auto-created workspaces now announce themselves.** When the bot lazily creates a workspace under `~/.cokacdir/workspace/<id>/` on the first message after `/clear`, a `/model` provider switch, or a fresh chat, it now sends a `Workspace auto-started at <path>. Use /<id> to resume this session.` notification before processing the message. Previously, users had to type `/pwd` to discover where the AI was operating, which was easy to miss for the very first message in a new workspace. The notification fires only when the workspace was actually newly created — concurrent-message races that find an existing session do not double-notify.

---

## 0.5.0 — 2026-04-28

- **`/clear`, `/model`, and `/start` now correctly cancel in-flight work and uploads.** Previously, `/clear` and provider switches via `/model` only blanked the in-memory session, while an in-flight AI task was free to keep running and eventually write its response (and a stale session_id from the old provider) back into the just-cleared session — partially resurrecting what the user explicitly cleared. The same issue applied to `/start` when it switched workspaces. Now all three commands cancel the in-progress task, drop queued messages, clear pending file uploads (when the path actually changes), and stop any active `/loop` verification before mutating session state. `/loop`'s post-verify outcome messages also re-check `loop_states` under the lock so `/clear` or `/model` arriving mid-verification suppress the trailing "Loop complete" / "Loop limit" / re-inject message uniformly.
- **Brand-new-session `/clear` race detection.** A brand-new session has `session_id = None`, so the previous "writeback only if session_id matches" guard could not detect `/clear` on a fresh session whose first message was still being processed. A monotonic per-chat `clear_epoch` counter is now bumped on every `/clear` and captured at task spawn; the post-completion guard skips the writeback whenever the epoch advances during the task. The guard also compares the (provider, path, session_id) triple to catch `/model` provider switches and `/start` same-path session-id swaps. Applied to all four polling sites (text-message and bot-to-bot, normal completion and stopped branches).
- **`/start` identifies path-vs-session intent and adds a same-path no-op.** Typing `/start <path>` at the path you are already in now responds with `Already at <path>.` and does nothing else, instead of clearing pending uploads, nulling `session_id`, and reloading history from disk over your in-progress state. Session-identifier inputs (`/start <session-id>`) intentionally still proceed even when the session resolves to the current cwd, since the user may be switching to a different session at the same path. Cross-provider fallback inside `/start` also runs the same cancel/cleanup flow as `/model`.
- **`/model` provider switch now shows what was reset and where.** A `Provider changed — previous workspace, history, and uploads have been reset for compatibility. Previous workspace: <path> (preserved on disk). A new workspace will be created on your next message. To resume work in the previous workspace instead, use /start <path>.` notice now appears whenever a `/model` command crosses provider boundaries with non-empty session state. The count of any queued messages that were dropped is also reported.
- **`/down` now expands `~`.** Paths starting with `~/`, `~\`, or just `~` are resolved against the user's home directory before download. `~user/`, `~~/`, and embedded `~` are intentionally left alone.
- **`/model` provider comparison aligned with the polling guard.** Internally switched from prefix-only `provider_from_model` to availability-aware `detect_provider`, so a chat with no explicit model that was running on a CLI fallback (e.g. Codex when Claude is unavailable) now correctly recognizes `/model claude` as a provider change and runs the cleanup flow. Without this fix, the writeback guard's spawn-time capture (which already used `detect_provider`) would disagree with `/model`'s comparison and the cleanup would be skipped.
- New `src/utils/path.rs` module with a conservative `expand_tilde` helper backed by unit tests for `~`, `~/`, `~\`, `~user/`, `~~/`, and embedded-`~` cases.

---

## 0.4.99 — 2026-04-25

- **Telegram Flood Control responses are now honored.** When the Telegram server returns `RetryAfter` on a high-frequency spinner edit, the bot now pushes the per-chat next-call timestamp forward by the server-mandated duration so that subsequent `shared_rate_limit_wait` calls naturally wait out the full cooldown instead of firing again after the normal `polling_time_ms` gap. Previously, ignoring `RetryAfter` could cause the cooldown to escalate over repeated violations (production logs showed bans accumulating to ~14000s). Applied to the five spinner-edit sites that fire every polling cycle: shell command spinner, AI streaming spinner (text and bot-to-bot polling loops), schedule spinner, and the verify spinner. The shared rate-limit serialization itself is unchanged.

---

## 0.4.98 — 2026-04-25

- **Gemini CLI `--skip-trust` auto-detection.** The bridge now probes `gemini --version` once on first use and adds `--skip-trust` to the gemini-cli invocation only when the installed version supports it (stable ≥ 0.39.1, preview ≥ 0.40.0-preview.3, or nightly built on/after 2026-04-23 — PR google-gemini/gemini-cli#25814). Older versions silently keep the previous behavior so they don't error out on an unknown flag. The decision is propagated from the parent cokacdir process to the `--bridge gemini` subprocess via the internal `COKAC_GEMINI_SKIP_TRUST` env var, which is stripped before spawning gemini-cli itself.
- Bot server startup now prints the detected Gemini CLI version and `--skip-trust` capability (e.g. `▸ Gemini : v0.40.0 (+--skip-trust)`).
- `/model` help now lists `codex:gpt-5.5` as the latest frontier coding model; `gpt-5.4` remains available and is relabeled "Frontier agentic coding model".

---

## 0.4.97 — 2026-04-25

- **`/queue` OFF behavior changed: reject → redirect.** Previously, sending a message while the AI was busy with `/queue` OFF returned "AI request in progress" and dropped the message. Now, that same message cancels the in-progress task and is processed immediately on the same session — natural mid-task redirects ("아니 그거 말고 X 해줘") just work. Plain text, `;text`, `/query <text>`, and captioned file uploads trigger redirect; slash commands (`/help`, `/start`, …) and shell commands (`!cmd`) keep the existing rejection so an unrelated command never kills a long-running task. If a second redirect arrives while the first is still cancelling, the latest one wins (replaces the pending target). `/queue` ON (the default) is unchanged — messages still queue FIFO. `/stop`/`/stopall` semantics are unchanged. Resolves [#34](https://github.com/kstost/cokacdir/issues/34); thanks to [@twpark](https://github.com/twpark) for [#36](https://github.com/kstost/cokacdir/pull/36) which proposed the redirect approach.

---

## 0.4.92 — 2026-04-17

- **`/loop` now works with Codex and OpenCode**, not just Claude. After each turn the bot still asks the AI to judge whether the task is fully done and re-injects remaining work until it is, but the verification mechanics are now provider-specific: Claude uses its native `--fork-session`; Codex replays a full-fidelity session archive into an isolated `codex exec --ephemeral` call that never touches the original rollout file; OpenCode uses `opencode run --session <id> --fork --agent plan`. Gemini still falls back with a clear message.
- New full-fidelity session archive at `~/.cokacdir/ai_sessions_full/{session_id}.json` — parallel to the existing truncated UI summary. Preserves all text, tool arguments, tool results, timestamps, model info, and token usage for Claude/Codex/Gemini/OpenCode sessions. Used by the Codex verifier; written automatically alongside the summary.
- The `/loop` verification progress indicator is now an animated 🔍/🔎 spinner that cycles letter-by-letter while the verifier runs.
- Fixed: `/model` help listed Opus as 4.6; now correctly shows Opus 4.7.

---

## 0.4.89 — 2026-04-15

- New `/setendhook <message>` command — set a custom notification message that is sent as a separate message whenever AI processing completes. Useful as an alert when waiting for long responses. Use `/setendhook_clear` to remove. Applies to all processing types: normal AI responses, shell commands, scheduled tasks, and bot-to-bot messages. Not sent when the request is cancelled via `/stop`.

---

## 0.4.88 — 2026-04-15

- **File copy now preserves timestamps.** All copy operations (single file, directory recursive, paste) now retain the original modification and access times using the `filetime` crate. Directory timestamps are set after contents are fully copied to avoid being overwritten by child writes.
- **Codex streaming: improved tool display.** Codex `file_change` events now emit a ToolResult summary listing each changed file and its kind (add/update/delete). `collab_tool_call` events display human-readable prompts for spawn/send/followup tools and extract agent response messages from `agents_states` on wait/close. `web_search` events show the actual query text (or expanded queries) instead of raw JSON. `command_execution` error detection now also checks the `status` field for "failed"/"declined".
- Fixed: Codex Collab tool display showed redundant text like "Agent wait: wait" instead of "Agent: wait" for tools whose display string equalled the tool name.
- Fixed: Codex web_search with an empty `action.queries` array would lose the original query text, showing a bare "Search" label instead of the query.

---

## 0.4.85 — 2026-04-11

- **OpenCode background tasks now actually complete.** When using the oh-my-opencode plugin, messages that dispatched a background task (e.g. "I'll report back when it's done") previously left the turn hanging forever because the one-shot `opencode run` process was torn down as soon as the parent session went idle, interrupting the background sub-session mid-flight. The OpenCode adapter was reworked to spawn `opencode serve` per turn, drive the session over HTTP + SSE, and wait until the parent session, all child sessions, and all todos are idle before shutting down — so background task notifications make it back to the user and the final answer is delivered end-to-end.
- Fixed: OpenCode `--session <id>` was silently ignored when combined with `--continue`, causing cross-session routing into whichever root session was most recent. `--continue` is no longer passed alongside `--session`.
- Fixed: OpenCode responses that ended with a legitimate non-"stop" finish reason (`length`, `content-filter`, `error`) were misreported as "empty response" errors. These are now treated as terminal like OpenCode itself does.
- Fixed: a recoverable OpenCode error (e.g. `ContextOverflowError` that auto-compaction recovers from) could poison an otherwise successful turn. Error events are now tentative until the turn ends and are only surfaced when no usable output arrived.
- Fixed: OpenCode calls with a stale `--session` id used to exit cleanly with an empty stdout while writing `NotFoundError` to stderr, surfacing as a confusing "empty response". The stderr message is now reported as the actual error.
- Improved: OpenCode empty-response diagnostics now include the last finish reason, event/tool counters, last event type, output-token count, and exit code, making it possible to tell at a glance why a turn produced no text.
- The legacy `opencode run` path is preserved and can be forced with `COKACDIR_OPENCODE_LEGACY=1` as a rollback escape hatch.

---

## 0.4.84 — 2026-04-10

- Fixed: streaming AI responses could panic with "byte index is not a char boundary" when a multi-byte character (emoji, CJK text) happened to straddle the rolling-placeholder threshold or when `full_response` was replaced by an error message mid-stream. All nine `full_response` slicing sites across the text, schedule, and bot-to-bot polling loops now floor to a valid UTF-8 char boundary and reset `last_confirmed_len` if it no longer points at a valid boundary in the current response.

---

## 0.4.83 — 2026-04-10

- New `/envvars` command — dump all environment variables visible to the bot process (bot-owner only). Useful for verifying which overrides are active. ⚠ Exposes sensitive values with no redaction — use in a 1:1 chat only.
- New startup loader for `~/.cokacdir/.env.json` — values from this file are injected into the process environment at launch and take priority over shell-exported values. Supports string, number, and boolean values at the root JSON object.
- New `COKAC_CLAUDE_PATH` environment variable — override the path to the Claude CLI binary instead of relying on `which claude` / `SearchPathW`.
- New `COKAC_CODEX_PATH` environment variable — same as above for the Codex CLI binary.
- New `COKAC_FILE_ATTACH_THRESHOLD` environment variable — tune the byte threshold (default 8192) at which long AI responses switch to `.txt` file attachment mode, introduced in 0.4.81.
- Documented the pre-existing `COKAC_GEMINI_PATH`, `COKAC_OPENCODE_PATH`, and `COKACDIR_DEBUG` environment variables. See the new "Environment Variables" guide in the docs for the full reference.
- Fixed: CLI-binary path resolution for Claude, Codex, Gemini, and Opencode now verifies the resolved path actually exists on disk before returning it. Previously, a stale `which` result or a `COKAC_*_PATH` pointing at a deleted file would be accepted and then fail later at spawn time. The multi-panel file manager's CLI availability check was hardened the same way.
- Fixed: when switching to a previously-saved workspace, a stale `session_id` from the prior workspace could leak into the newly-restored session. The in-memory `session.session_id` is now explicitly cleared before restoration.

---

## 0.4.82 — 2026-04-03

- New `/usechrome` command — toggle Chrome browser tool (`--chrome`) for Claude CLI per chat.

---

## 0.4.81 — 2026-04-03

- **Very long AI responses are now sent as a file attachment** instead of flooding the chat with many consecutive messages. Responses over ~8,000 characters are delivered as a downloadable `.txt` file.
- This applies everywhere: normal responses, stopped/cancelled responses, scheduled tasks, and bot-to-bot messages.

---

## 0.4.79 — 2026-04-02

- Updated the built-in schedule documentation to be simpler and more user-friendly.

---

## 0.4.78 — 2026-04-02

- **The bot now knows how to answer "how to" questions** — built-in documentation (14 help guides) is deployed to `~/.cokacdir/docs/` on startup and the AI references them when you ask for help.
- Fixed Discord `<@ID>` mentions being passed as raw text — they are now shown as readable `@username` format.
- Removed outdated internal design documents.

---

## 0.4.77 — 2026-04-02

- **Discord bot support added.** You can now use Discord bot tokens with `--ccserver`. Token type (Telegram vs Discord) is auto-detected, or you can prefix with `discord:` explicitly.
- Telegram and Discord bots can run simultaneously in the same server.
- All existing features (AI chat, file upload, schedules, group collaboration) work on Discord.
- Co-work guidelines for multi-bot group chats can now be customized by editing `~/.cokacdir/prompt/cowork.md`.

---

## 0.4.76 — 2026-03-31

- **You can now upload videos, voice messages, audio, GIFs, and video notes** — previously only documents and photos were supported.
- **No more `/start` required** — sending a message or file automatically creates a workspace if none exists.
- New `/greeting` command to switch between a compact and full startup message.
- Files with duplicate names are automatically renamed (e.g., `file(1).txt`) instead of being overwritten.
- Files larger than 20 MB are rejected with a clear error message.
- Shell commands are now properly blocked while the AI is busy.

---

## 0.4.75 — 2026-03-29

- When the model list is too long for a Telegram message, it is now sent as a text file attachment.

---

## 0.4.74 — 2026-03-29

- Fixed unnecessary request serialization in private chats introduced in 0.4.71.

---

## 0.4.73 — 2026-03-29

- `/stop_ID` no longer sends a confusing "not found" error when the queued message was already processed.

---

## 0.4.72 — 2026-03-29

- Changed the cancel command format from `/stop ID` to `/stop_ID` so it works as a tappable link in Telegram.

---

## 0.4.71 — 2026-03-29

- **Message queue**: Messages sent while the AI is busy are now automatically queued (up to 20) and processed in order. No more "busy" rejections.
- New `/stopall` command — cancels the current AI request and clears all queued messages.
- New `/stop_ID` command — cancel a specific queued message by its ID.
- New `/queue` command — toggle queue mode on/off (on by default).

---

## 0.4.69 — 2026-03-28

- Fixed a potential deadlock when checking group chat context settings.

---

## 0.4.67 — 2026-03-26

- **Bots in group chats now see who else is in the chat**, improving multi-bot awareness.
- Bots now understand that @mentioning another bot in chat text doesn't work — they must use the `--message` command to talk to each other.
- Improved Gemini CLI output parsing for edge cases.

---

## 0.4.66 — 2026-03-25

- **OpenCode AI backend added** — you can now use any model configured in OpenCode via Telegram bot.
- **Gemini AI backend added** — Google's Gemini models are now available as an AI provider.
- Session resume now works across all four providers (Claude, Codex, Gemini, OpenCode).
- Incoming Telegram messages are now logged to `~/.cokacdir/logs/` for diagnostics.
- Bot startup now flushes any pending messages from previous runs to avoid processing stale requests.

---

## 0.4.65 — 2026-03-25

- Tool names from Gemini and OpenCode are now shown in familiar format (e.g., "Bash", "Read", "Edit" instead of their native names).
- Session resume now tries all available AI providers as fallback.
- Startup message now includes community links.

---

## 0.4.64 — 2026-03-24

- **Initial Gemini and OpenCode support** — experimental integration of two new AI providers alongside Claude and Codex.
- Server startup now shows availability status for all providers.

---

## 0.4.63 — 2026-03-23

- Fixed Claude/Codex not starting in non-interactive environments (cron jobs, launchd, SSH) by automatically adding the binary's directory to PATH.

---

## 0.4.62 — 2026-03-23

- **Fixed Windows path issues for Korean (and other non-ASCII) usernames** — paths are now resolved using native Windows APIs.

---

## 0.4.61 — 2026-03-23

- **New `/context` command for group chats** — control how many recent messages the AI sees (e.g., `/context 20` for more history, `/context 0` to disable). Default is 12.

---

## 0.4.60 — 2026-03-23

- Improved @mention routing in group chats — messages addressed to another bot are now correctly ignored, even in direct mode.
- Fixed tool errors cluttering chat output in silent mode.
- Fixed chat log growing exponentially when bots read each other's logs.

---

## 0.4.59 — 2026-03-22

- Long tool output in group chat logs is now truncated to prevent log bloat (full content saved separately).

---

## 0.4.58 — 2026-03-22

- **Group chat log now shows readable summaries** instead of raw internal data when using `--read_chat_log`.

---

## 0.4.57 — 2026-03-21

- Fixed Claude CLI not being found on Windows when both `.cmd` and extensionless versions exist.

---

## 0.4.56 — 2026-03-21

- **File uploads in group chats can now be directed to a specific bot** using `@botname` in the caption.
- Caption text is automatically sent to the AI, so you can upload a file and ask about it in one step.

---

## 0.4.55 — 2026-03-17

- **Bots in group chats now detect when another bot already answered** and avoid repeating the same response — they add new information or acknowledge and move on instead.
- Group chat context increased from 5 to 12 recent entries.

---

## 0.4.53 — 2026-03-17

- Fixed a race condition where multiple bots saving settings simultaneously could corrupt the shared settings file.

---

## 0.4.52 — 2026-03-17

- Codex sessions now properly handle system prompts for both new and resumed sessions.
- Bot now automatically reconnects if the Telegram connection drops (with backoff).

---

## 0.4.51 — 2026-03-16

- **Codex session resume** — conversation history is now preserved across messages instead of starting fresh each time.

---

## 0.4.50 — 2026-03-16

- Fixed file locking issues on Windows that affected debug logging and group chat logs.

---

## 0.4.49 — 2026-03-15

- Fixed a crash ("Argument list too long") that could happen when the system prompt was very large.

---

## 0.4.48 — 2026-03-15

- **Group chat bot coordination** — bots now take turns processing messages, preventing race conditions.
- **Location sharing** — you can share your GPS location or a venue with the bot.
- **Real-time progress in group chats** — long responses are delivered incrementally instead of all at once.
- Bots are now instructed to keep group chat responses short and avoid repeating what others said.
- Fixed `/stop` race condition where the AI could sneak in a new request before cancellation took effect.

---

## 0.4.47 — 2026-03-14

- **Group chat shared log** — bots in the same group can now see each other's conversations and coordinate.
- **Bot-to-bot messaging** — bots can send direct messages to each other using the `--message` command.
- New commands: `/direct` (toggle prefix requirement in groups), `/silent` (toggle streaming output), `/instruction` (set custom AI instructions).
- **Scheduler** — schedule tasks to run at specific times or on recurring cron schedules.

---

## 0.4.46 — 2026-03-13

- Bots now automatically see the 5 most recent group chat log entries, improving context awareness without manual log reading.
- `/clear` now marks the log so other bots skip old history.
- Bots display their name alongside @username in the group chat log.

---

## 0.4.45 — 2026-03-13

- Group chat log now records full AI output including tool calls, giving bots richer context about what each bot did.

---

## 0.4.44 — 2026-03-12

- Improved group chat log filtering and bot message delivery instructions.

---

## 0.4.43 — 2026-03-13

- **Group chat support** — multiple bots in the same Telegram group can now see each other's conversations.
- **Direct mode** (`/direct`) — in group chats, the `;` prefix is no longer required when direct mode is on.
- **Custom instructions** (`/instruction`) — set persistent AI instructions per chat.
- **Cross-provider session resume** — `/start` now falls back to other AI providers if the session was created with a different one.

---

## 0.4.42 — 2026-03-11

- Added `/session` command — view your current session ID and get a ready-to-paste terminal command to resume it locally.

---

## 0.4.41 — 2026-03-10

- Added vim-style navigation keys (`j`/`k`/`h`/`l`) in the file manager.
- Updated Codex model list with latest models.

---

## Earlier Versions — 2026-01-27 ~ 2026-03-08

> Initial development period. Major milestones:

- **Full Rust rewrite** from TypeScript/React — complete TUI file manager with dual-panel browsing.
- **Claude AI integration** — natural language commands, streaming responses, session management.
- **Telegram bot** — remote AI chat, file upload/download, session management.
- **Codex CLI support** — OpenAI Codex as alternative AI backend.
- **Built-in file viewer/editor** with syntax highlighting and markdown rendering.
- **SSH/SFTP** remote file management.
- **File encryption** (AES-256-CBC).
- **Git integration** — status, log, diff viewer.
- **Theme system** — customizable JSON themes in `~/.cokacdir/themes/`.
- **Scheduler** — absolute time and cron-based task scheduling.
- **Windows support** — native builds with PowerShell path detection.
- **Project website** launched at https://cokacdir.cokac.com.

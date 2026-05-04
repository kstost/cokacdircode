# Changelog — cokacdir

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

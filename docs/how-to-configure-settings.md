# How to Configure Settings

## /silent

Toggles silent mode for the current chat. Default: **ON**.

- **ON** — Tool calls (Bash, Read, Edit, etc.) are hidden from the response. Only the AI's text output and errors are shown.
- **OFF** — Full tool call details are displayed, including commands run and file contents read.

Silent mode reduces message noise, especially in group chats.

---

## /debug

Toggles debug logging. Default: **OFF**.

When enabled, detailed logs are printed for Telegram API operations, AI service calls, and the cron scheduler. This is a **global** toggle — it affects all chats.

---

## /greeting

Toggles the startup greeting style.

- **Compact**: `cokacdir started (v0.4.80, Claude)`
- **Full**: Includes session path, community links, GitHub URL, and update notices.

---

## /setpollingtime \<ms\>

Sets the API polling interval in milliseconds. This controls how frequently streaming responses and shell command output are updated on screen.

```
/setpollingtime 3000
```

- **Minimum**: 2500ms
- **Recommended**: 3000ms or higher
- Setting it too low may cause Telegram API rate limits.
- Without arguments, shows the current value.

---

## /envvars

Prints every environment variable currently visible to the bot process, sorted alphabetically. **Bot owner only.**

Useful for verifying that `~/.cokacdir/.env.json` loaded correctly, or checking whether a `COKAC_*` override is active.

> ⚠ **Security warning:** `/envvars` exposes **all** environment variables with no redaction — including API keys, tokens, and credentials. Telegram stores message history on its servers, so anything printed by this command is persisted until you delete the messages. Use it only for diagnostics, clear the response afterward, and **always use it in a 1:1 chat** — never in a group chat. When the owner runs `/envvars` in a group, the response is a normal group message that every member sees, regardless of the `/public` setting.

See [How to Configure Environment Variables](how-to-configure-environment-variables.md) for the full list of variables cokacdir reads (`COKAC_CLAUDE_PATH`, `COKAC_CODEX_PATH`, `COKAC_GEMINI_PATH`, `COKAC_OPENCODE_PATH`, `COKAC_FILE_ATTACH_THRESHOLD`, `COKACDIR_DEBUG`) and for the `~/.cokacdir/.env.json` auto-loader.

---

## /help

Displays the full command reference with all available commands and usage examples.

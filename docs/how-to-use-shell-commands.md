# How to Use Shell Commands

## !command

Prefix a message with `!` to execute a shell command directly on the server, bypassing the AI.

```
!ls -la
!git status
!cat config.json
```

The command runs in the current session's working directory (set by `/start`). If no session is active, it falls back to your home directory (`/` on Linux/macOS, `C:\` on Windows if home cannot be resolved).

If an AI request is already in progress for the chat, the shell command is rejected with `AI request in progress. Use /stop to cancel.`

---

## Output Handling

- While the command runs, the placeholder shows an animated `🕐 Processing` spinner — output is **not** streamed line-by-line; it is buffered and rendered once on completion.
- The 4000-byte threshold below is measured against the rendered block `$ <command>\n\n<output>`, including the command header.
- If the rendered block is **4000 bytes or less**, it is shown inline in the chat.
- If it **exceeds 4000 bytes**, it is saved to `~/.cokacdir/tmp/cokacdir_shell_<chat_id>_<timestamp>.txt` and sent as a document.
- A non-zero exit code is appended to the completion line: `Done <cmd> (exit code: N)`. On exit code 0 the suffix is omitted.

## Cancellation

Use `/stop` to terminate a running shell command. The process tree is killed immediately.

## Platform

- **Linux/macOS**: `bash -c "<command>"`
- **Windows**: `powershell -NoProfile -NonInteractive -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; <command>; exit $LASTEXITCODE"`

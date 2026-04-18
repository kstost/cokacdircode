# How to Use Shell Commands

## !command

Prefix a message with `!` to execute a shell command directly on the server, bypassing the AI.

```
!ls -la
!git status
!cat config.json
```

The command runs in the current session's working directory (set by `/start`).

---

## Output Handling

- Output is streamed line-by-line and displayed in real time.
- If the output is **4000 bytes or less**, it is shown inline in the chat.
- If the output **exceeds 4000 bytes**, it is saved to a temporary `.txt` file and sent as a document.
- A non-zero exit code is shown at the end of the output: `(exit code: N)`

## Cancellation

Use `/stop` to terminate a running shell command. The process tree is killed immediately.

## Platform

- **Linux/macOS**: Runs via `bash -c`
- **Windows**: Runs via `powershell.exe`

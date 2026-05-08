# How to Use File Transfer

## Upload Files

Send a file, photo, or media to the bot. The file is saved to the current session's working directory.

If no session is active, a workspace is automatically created.

### Supported Types

- **Photo** — Saved as `photo_<id>.jpg` (highest quality selected)
- **Document** — Original filename preserved
- **Video** — Saved as `video_<id>.mp4` or original filename
- **Audio** — Saved as `audio_<id>.mp3` or original filename
- **Voice** — Saved as `voice_<id>.ogg`
- **Animation (GIF)** — Saved as `animation_<id>.mp4` or original filename
- **Video Note** — Saved as `videonote_<id>.mp4`

### Limits

- Maximum file size: **20MB** (Telegram Bot API limit)
- If a file with the same name already exists, a counter is appended: `file(1).txt`, `file(2).txt`, etc.

### Upload with Caption

If you include a caption with the file, the caption is sent to the AI along with the file context. This is useful for giving instructions about the uploaded file.

### Upload While AI Is Busy

If the AI is busy processing a request and queue mode is ON, file uploads are captured and queued along with the message. When the queued message is processed, the file context is preserved.

---

## Download Files

### /down \<filepath\>

Downloads a file from the server to your Telegram chat.

```
/down /home/user/report.pdf
/down ./output.csv
```

- Accepts absolute paths anytime, or relative paths when a session is active (resolved against the current working directory).
- Only single files can be downloaded. If the target path exists but is not a regular file (e.g., a directory or symlink target), the bot replies with `Not a file: <path>`. If the path does not exist, the bot replies with `File not found: <path>`.
- If a relative path is given but no session is active, the bot replies with `No active session. Use absolute path or /start <path> first.`

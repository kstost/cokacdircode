# How to Use File Transfer

## Upload Files

Send a file, photo, or media to the bot. Non-audio uploads are saved to the current session's working directory; Telegram audio and voice uploads are transcribed as STT input.

If no session is active, a workspace is automatically created.

### Supported Types

- **Photo** — Saved as `photo_<id>.jpg` (highest quality selected)
- **Document** — Original filename preserved
- **Video** — Saved as `video_<id>.mp4` or original filename
- **Audio** — In Telegram, transcribed as STT input instead of being saved as a workspace file
- **Voice** — In Telegram, transcribed as STT input instead of being saved as a workspace file
- **Animation (GIF)** — Saved as `animation_<id>.mp4` or original filename
- **Video Note** — Saved as `videonote_<id>.mp4`

### Speech Recognition

Telegram audio and voice uploads are recognized with transcriptor. The bot first replies with `Recognizing speech..` and edits that same message when recognition finishes. If transcriptor needs to download a model first, the same message is edited to show the model download progress.

Use `/stt_model` to view the current STT model for the chat:

```
/stt_model
/stt_model small
/stt_model large-v3-turbo
/stt_model path:/absolute/model.bin
/stt_model reset
```

Bare model names are passed to transcriptor as `--model-name` and override an inherited `TRANSCRIPTOR_MODEL` value for that run; `path:<model_path>` is passed as `--model`. Resetting removes the chat override and lets transcriptor use its environment, saved config, or default model.

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

# Third-Party Notices

`cokacdir` uses third-party open-source software. This file focuses on the
runtime STT integration because `cokacdir` may download and spawn the
`transcriptor` binary and because `transcriptor` may download Whisper model
artifacts at runtime.

This notice file is informational and is not a substitute for the license files
distributed by each upstream project.

---

## Project License

`cokacdir` is distributed under the MIT License. See [LICENSE](LICENSE).

- Copyright: Copyright (c) 2026 cokac
- License: MIT License

---

## transcriptor STT Integration

`cokacdir` uses `transcriptor` for Telegram audio and voice speech recognition.
The `transcriptor` process is spawned as a child process and its progress events
are used to show STT and model-download status to chat users.

If a compatible local binary is not present, `cokacdir` downloads the
platform-specific `transcriptor` artifact from:

```text
https://raw.githubusercontent.com/kstost/transcriptor/main/dist_beta/<artifact>
```

The downloaded binary is stored under:

```text
~/.cokacdir/bin/
```

`transcriptor` is distributed under the MIT License.

- Project: transcriptor
- Copyright: Copyright (c) 2026 transcriptor contributors
- License: MIT License
- Repository: https://github.com/kstost/transcriptor
- Notices: https://github.com/kstost/transcriptor/blob/main/THIRD_PARTY_NOTICES.md

---

## Whisper Models

`transcriptor` uses OpenAI Whisper speech recognition models through
whisper.cpp-compatible ggml model files.

The OpenAI Whisper repository states that the Whisper code and model weights are
released under the MIT License.

- Project: OpenAI Whisper
- Copyright: Copyright (c) 2022 OpenAI
- License: MIT License
- Repository: https://github.com/openai/whisper
- License text: https://github.com/openai/whisper/blob/main/LICENSE
- Model card: https://github.com/openai/whisper/blob/main/model-card.md

The default model download source used by `transcriptor` is the Hugging Face
repository `ggerganov/whisper.cpp`, which hosts OpenAI Whisper models converted
to ggml format for whisper.cpp.

- Model repository: https://huggingface.co/ggerganov/whisper.cpp
- Repository license label: MIT
- Default download base URL:
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main

Model files may be downloaded at runtime into:

```text
~/.transcriptor/models/
```

---

## whisper.cpp and ggml

`transcriptor` uses `whisper-rs`, which binds to whisper.cpp. whisper.cpp is a
C/C++ implementation for running Whisper models and includes ggml components.

- Project: whisper.cpp
- Copyright: Copyright (c) 2023-2026 The ggml authors
- License: MIT License
- Repository: https://github.com/ggml-org/whisper.cpp
- License text: https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE

---

## Other Rust Dependencies

`cokacdir` depends on third-party Rust crates for terminal UI, chat platform
integration, networking, cryptography, storage, and filesystem operations. The
complete resolved dependency set is recorded in [Cargo.lock](Cargo.lock).

Release packaging should preserve required notices for bundled third-party
software and artifacts.

---

## Audio and Transcript Rights

The MIT licenses above cover the relevant software and model artifacts. They do
not grant rights to third-party audio content supplied by users.

Users are responsible for ensuring they have the necessary rights or consent to
transcribe input audio. Transcription output can inherit legal or contractual
restrictions from the source audio or surrounding usage context.

---

## Model Limitations and Use

The OpenAI Whisper model card describes limitations and risks including
hallucinated text, uneven language performance, and concerns around
transcribing recordings of people without consent.

Before deploying STT in production, evaluate transcription quality and
consent/privacy requirements for the intended domain.

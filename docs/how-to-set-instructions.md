# How to Set Instructions

Instructions let you give the bot persistent guidance that applies to every message in a chat. They are injected into the system prompt, so the AI agent follows them throughout the conversation.

## /instruction \<text\>

Sets a custom instruction for the current chat.

```
/instruction Always respond in Korean.
```

```
/instruction You are a senior backend engineer. Focus on performance and security.
```

The instruction takes effect starting from the next message you send. It does not apply retroactively to previous conversation history.

## /instruction (no argument)

Shows the current instruction set for the chat. If no instruction has been set:

```
No instruction set.
Usage: /instruction <text>
```

## /instruction_clear

Removes the instruction for the current chat. After clearing, the bot returns to its default behavior with no custom guidance.

```
Instruction cleared.
```

## Key Behaviors

- **Per-chat**: Each chat (private or group) has its own independent instruction.
- **Persistent**: Instructions survive bot restarts. They are stored in `bot_settings.json`.
- **Immediate**: The instruction applies from the very next message, no need to restart the session.
- **Multiline**: You can include newlines in the instruction text.
- **No length limit in code**: Practically limited by Telegram's message size (~4096 characters).

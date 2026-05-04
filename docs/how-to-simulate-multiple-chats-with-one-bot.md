# How to Simulate Multiple 1:1 Chats with One Bot

With a single bot token, you can create multiple independent sessions by using group chats. Each group chat acts as a separate 1:1 conversation with the bot.

## Setup

1. In BotFather, send `/setprivacy`, select your bot, and choose **Disable**. This allows the bot to receive all messages in group chats. Without this, Telegram only delivers `/` commands and direct replies to the bot.

2. Create a new group chat and invite the bot.

3. Send `/direct` in the group chat to toggle direct mode ON — the bot then responds to every message without requiring the `;` prefix or `@mention`. `/direct` is owner-only and only works inside a group chat (it errors out in DMs). Sending it again toggles direct mode back OFF.

4. Send `/contextlevel 0` to disable shared context. The default value is **12** entries; setting it to `0` prevents the AI from seeing other bots' messages in its prompt, so it behaves as if it is the only bot in the conversation. `/contextlevel` is also group-chat-only.

5. Send `/start <project_path>` to begin working on your project.

The group chat now behaves like a dedicated 1:1 chat with the bot. Repeat steps 2–5 to create additional independent sessions, each in its own group chat.

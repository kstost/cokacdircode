# How to Simulate Multiple 1:1 Chats with One Bot

With a single bot token, you can create multiple independent sessions by using group chats. Each group chat acts as a separate 1:1 conversation with the bot.

## Setup

1. In BotFather, send `/setprivacy`, select your bot, and choose **Disable**. This allows the bot to receive all messages in group chats. Without this, Telegram only delivers `/` commands and direct replies to the bot.

2. Create a new group chat and invite the bot.

3. Send `/direct` in the group chat. This enables direct mode — the bot responds to every message without requiring the `;` prefix or `@mention`.

4. Send `/contextlevel 0` to disable shared context. This prevents the AI from seeing other bots' messages in its prompt, so it behaves as if it is the only bot in the conversation.

5. Send `/start <project_path>` to begin working on your project.

The group chat now behaves like a dedicated 1:1 chat with the bot. Repeat steps 2–5 to create additional independent sessions, each in its own group chat.

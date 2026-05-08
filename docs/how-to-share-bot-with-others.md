# How to Share Your Bot with Other Users

By default, only the bot owner can interact with the bot. To let other people use the same bot, share it through a group chat that has been opened up to non-owner members.

## Setup

1. In BotFather, send `/setprivacy`, select your bot, and choose **Disable**. Without this, Telegram only delivers `/`-commands and direct replies to the bot — regular messages from other members will silently fail to reach it.

2. Create a new group chat in Telegram.

3. Invite both the bot and the people who should be allowed to use it into the group.

4. In the group chat, send `/direct` to toggle direct mode ON. The bot then responds to every message without requiring the `;` prefix or `@mention`. (`/direct` is owner-only and only works inside group chats.)

5. Send `/public on` so non-owner members can interact with the bot. Without this, the bot ignores everyone except the owner. (`/public` is owner-only.)

6. Send `/contextlevel 0` to disable shared chat-log embedding. Since there is only one bot in the group, the shared log would add tokens to every turn with no benefit.

7. (Optional) Send `/start <project_path>` to begin working on a specific project.

Once configured, the group chat acts as a shared workspace where every member can talk to the bot. Ownership stays with you — only you can change `/public`, `/direct`, `/contextlevel`, and other owner-only settings — but any member can then send AI prompts, file uploads, and shell commands.

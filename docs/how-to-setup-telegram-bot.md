# Telegram Bot Setup Guide

## 1. Create a Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Enter a display name for your bot
4. Enter a username for your bot (must end with `bot`)
5. BotFather will reply with your bot token — copy and save it
6. **Disable privacy mode** (required for group chats): send `/setprivacy` to BotFather, select your bot, and choose **Disable**

> ⚠️ **Step 6 is mandatory if you ever plan to use this bot in a group chat.** With privacy mode enabled, Telegram only delivers `/` commands, `@mentions`, and direct replies to the bot — regular group messages (including the `;` and `!` prefixes used by cokacdir) will not reach it, and group chat features will silently fail. You must do this for **every** bot you intend to use in a group. See [How to Use Group Chat](how-to-use-group-chat.md) for details.

## 2. Register the Token

1. Run `cokacctl`
2. Press **`k`** to open the token input screen
3. Paste the bot token and press Enter

## 3. Start the Server

1. Press **`s`** in `cokacctl` to start the server
2. Open Telegram and start chatting with your bot

# How to Manage Tokens

## Add a Token

1. Run `cokacctl`
2. Press **`k`** to open the token input screen
3. Paste your token and press Enter

## Remove a Token

1. Run `cokacctl`
2. Press **`k`** to open the token input screen
3. Select the token to remove and delete it

## Token Types

- **Telegram**: Token created via [@BotFather](https://t.me/botfather) (format: `123456789:ABCdef...`)
- **Discord**: Bot token created at [Discord Developer Portal](https://discord.com/developers/applications)
  - Discord tokens are auto-detected; you can also prefix with `discord:` explicitly
- **Slack**: Socket Mode token pair from a Slack app
  - Format: `slack:xoxb-...,xapp-...`
  - `xoxb-` is the bot token, `xapp-` is the app-level token

## Multiple Tokens

When multiple tokens are registered, all bots will run simultaneously on server start.

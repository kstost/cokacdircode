# Discord Bot Setup Guide

## 1. Create a Discord Server

1. Go to https://discord.com/channels/@me
2. Click the **+** button on the left sidebar
3. Select **Create My Own** to create a server

## 2. Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application**
3. Set a name and click **Create**

## 3. Installation Settings

1. Select **Installation** from the left menu
2. Set **Install Link** to **None**

## 4. Bot Settings

1. Select **Bot** from the left menu
2. Click **Reset Token** to generate a token (copy and save this token)
3. **Public Bot** — turn off
4. **Presence Intent** — turn on
5. **Server Members Intent** — turn on
6. **Message Content Intent** — turn on

## 5. Generate OAuth2 URL and Invite the Bot

1. Select **OAuth2** from the left menu
2. Check **bot** in **OAuth2 URL Generator**
3. Check the following in **Bot Permissions**:
   - Send Messages
   - Manage Messages
   - Attach Files
   - Read Message History
4. Copy the URL from **Generated URL** at the bottom
5. Open the URL in your browser
6. In **Add to server**, select the server created in step 1
7. The bot is now invited to your server

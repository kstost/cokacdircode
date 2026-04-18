# cokacdir Install Guide

## macOS / Linux

```bash
curl -fsSL https://cokacdir.cokac.com/manage.sh | bash && cokacctl
```

## Windows (run PowerShell as Administrator)

```powershell
irm https://cokacdir.cokac.com/manage.ps1 | iex; cokacctl
```

## Setup

1. Press **`i`** to install cokacdir
2. Press **`k`** to open the token input screen
3. Paste your bot token and press Enter to add
4. Press **`s`** to start the server

## cokacctl Server Controls

| Key | Action | Persists after reboot? |
|-----|--------|----------------------|
| **`s`** | Start the server and register it as a background service. Automatically starts on reboot. | Yes |
| **`t`** | Stop the server. The background registration remains, so it will start again on reboot. | Yes (restarts on reboot) |
| **`r`** | Restart the server. | Yes |
| **`d`** | Stop the server and remove the background registration. Will not start on reboot. | No |

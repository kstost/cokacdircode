# How to Use Schedules

## Overview

You can schedule tasks for the bot to execute at a specific time or on a recurring basis. Just describe what you want in natural language — the bot handles the rest.

---

## How to Schedule

Simply tell the bot what you want and when. For example:

```
Check disk usage tomorrow at 9am
Run the backup script in 30 minutes
Check server health every weekday at 9am
Clean logs every Sunday at midnight
```

The bot understands natural language for both one-time and recurring schedules.

---

## Schedule Types

- **One-time**: Runs once at the specified time, then is automatically deleted.
- **Recurring**: Runs repeatedly on a schedule (e.g., every day, every weekday, every 30 minutes).

---

## Managing Schedules

### View Schedules

Ask the bot to show your schedules:

```
Show my schedules
What schedules do I have?
```

### Cancel a Schedule

Ask the bot to remove a schedule:

```
Cancel the disk usage schedule
Remove all schedules
```

When a scheduled task is currently running, you can use `/stop` to cancel its execution.

### Resume a Schedule Workspace

Each scheduled task runs in its own workspace. After a schedule completes, you can resume work in that workspace:

```
/start <schedule_id>
```

Or type `/<schedule_id>` as a shortcut.

---

## How Scheduled Tasks Execute

1. When the scheduled time arrives, the bot creates an isolated workspace.
2. A new AI session is started with your prompt.
3. The result is streamed to the chat as it would be for a normal message.
4. Your current session is not affected — it is backed up and restored after the schedule completes.
5. One-time schedules are automatically deleted after execution.

---

## Schedule Storage

Schedules are stored as JSON files in `~/.cokacdir/schedule/`. You can inspect or manually remove these files if needed.

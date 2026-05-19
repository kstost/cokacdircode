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

In the default isolated mode, each scheduled task runs in its own workspace under `~/.cokacdir/workspace/<schedule_id>/`. After the schedule completes, you can resume work in that workspace:

```
/start <schedule_id>
```

Or type `/<schedule_id>` as a shortcut.

When `COKAC_SCHEDULE_INLINE=1` is set (inline mode), no separate workspace is created — the scheduled task runs directly in the chat's current session. There is nothing to resume because the conversation is already in the chat itself; just send your next message normally to continue. The `/<schedule_id>` shortcut will return "no workspace found" if attempted, and the bot no longer appends the "Use /<id> to continue this schedule session" hint to inline-mode replies for that reason.

---

## How Scheduled Tasks Execute

The bot has two execution modes for scheduled tasks. The mode is chosen by the `COKAC_SCHEDULE_INLINE` environment variable (see `how-to-configure-environment-variables.md`).

### Isolated mode (default)

1. When the scheduled time arrives, the bot creates an isolated workspace under `~/.cokacdir/workspace/<schedule_id>/`.
2. A brand-new AI session is started with your prompt — context from any conversation you were having in the chat is **not** carried in (recurring cron schedules instead carry forward a separate one-line `context_summary` text that the bot extracted at registration time).
3. The result is streamed to the chat as if it were a normal reply.
4. Your current chat session is not affected — it is backed up before the schedule runs and restored after the schedule completes.
5. One-time schedules are automatically deleted after execution; their workspace folder is preserved on disk so you can re-enter it with `/<schedule_id>`.

### Inline mode (`COKAC_SCHEDULE_INLINE=1`)

Set this when you want scheduled tasks to feel like they were typed into your active conversation rather than running off to the side.

1. When the scheduled time arrives, **no separate workspace is created**.
2. The schedule's prompt is sent into the chat's **current** session (same `session_id`, same working directory), so the task continues whatever conversation is already in progress.
3. The result streams into the chat as normal; the prompt and the reply are appended to the live session history, just as if you had typed them yourself at that moment.
4. The reply does **not** include the `Use /<schedule_id> to continue this schedule session` hint, because the chat itself is already the continuation point — just send your next message to follow up.
5. If the chat has no active session at trigger time, inline mode falls back silently to the isolated path so the schedule still runs.

#### Example user flow (inline mode)

```
You:  /start /home/alice/myproject
You:  Check this code for slow spots
Bot:  (analysis reply)
You:  Run the same check again in 5 minutes from a different angle
Bot:  (schedule registered)
```

Five minutes later, with no further action from you:

```
Bot:  ⏰ Run the same check again in 5 minutes from a different angle
Bot:  (reply that builds on the earlier analysis, since it's the same session)
```

You can then keep typing as if nothing unusual happened — the bot has full context of the schedule's prompt and reply.

#### Things to be aware of

- Recurring cron schedules in inline mode accumulate into the same chat session every run. Use `/clear` if the context gets too long.
- One-time inline schedules cannot be re-entered via `/<schedule_id>` because no isolated workspace exists — the conversation is already in the chat.
- The flag is global per bot process. To switch modes, edit `~/.cokacdir/.env.json` and restart the bot.

---

## Schedule Storage

Schedules are stored as JSON files in `~/.cokacdir/schedule/`. You can inspect or manually remove these files if needed.

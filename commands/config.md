---
description: View or modify notification plugin settings (sound, debug, notifyOn, etc.)
argument-hint: "Optional: key=value to set, or 'show' to display current config"
allowed-tools: ["Read", "Write", "Bash", "AskUserQuestion"]
---

# Notification Plugin Configuration

The config file is at `$CLAUDE_PLUGIN_DATA/config.json` (environment variable `CLAUDE_PLUGIN_DATA` is set by Claude Code).

## Behavior

1. If the user provides no arguments or says "show", read and display the current config
2. If the user provides key=value pairs, update the config
3. If the config file doesn't exist, create it with defaults
4. Always show the updated config after changes

## Config Schema

```json
{
  "enabled": true,
  "sound": "on",
  "soundFile": "",
  "debug": false,
  "logFile": "",
  "notifyOn": "Stop,Notification"
}
```

## Settings Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Master switch for all notifications |
| `sound` | `"on"` / `"off"` | `"on"` | Play sound when notifying |
| `soundFile` | string | `""` | Path to custom .wav file (empty = system sound) |
| `debug` | bool | `false` | Enable debug logging |
| `logFile` | string | `""` | Custom log file path (empty = plugin data dir) |
| `notifyOn` | string | `"Stop,Notification"` | Comma-separated hook event types to notify on. Check log for available types. |

### notifyOn values

The value is a comma-separated list of CC hook event names. Known types:

- `Stop` — every assistant response
- `Notification` — idle prompt, permission prompt, auth, etc.

Users can check `notification.log` (with `debug=true`) to see all event types and their subtypes, then adjust `notifyOn` accordingly. Example:

- `"Stop,Notification"` — notify on everything (default)
- `"Notification"` — only notify on idle/permission events, not every response
- `"Stop"` — only notify on responses, not idle events

## Instructions

- The config file path is: use the `CLAUDE_PLUGIN_DATA` environment variable + `/config.json`
- Read the environment variable via Bash: `echo $CLAUDE_PLUGIN_DATA`
- Read existing config with the Read tool, write updates with the Write tool
- When setting a value, merge with existing config (don't overwrite other keys)
- For boolean values, accept `true`/`false`, `on`/`off`, `1`/`0`
- Show config as a formatted table after any change
- If user says "reset", delete the config file to restore defaults

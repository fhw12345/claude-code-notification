---
description: View or modify notification plugin settings (notifyOn, sound, debug, etc.)
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
  "notifyOn": "normal",
  "quietHours": "",
  "notifyWhenFocused": false
}
```

## Settings Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Master switch for all notifications |
| `notifyOn` | string | `"normal"` | Notification level or custom event list |
| `sound` | `"on"` / `"off"` | `"on"` | Play sound when notifying |
| `soundFile` | string | `""` | Path to custom .wav file (empty = system sound) |
| `quietHours` | string | `""` | Suppress during time range, e.g. `"22:00-08:00"` (local time). Empty = no quiet hours |
| `notifyWhenFocused` | bool | `false` | Notify even when the host window is in foreground |
| `debug` | bool | `false` | Enable debug logging |
| `logFile` | string | `""` | Custom log file path (empty = plugin data dir) |

### notifyOn levels (inclusive)

| Level | Events | Description |
|-------|--------|-------------|
| `all` | Stop, Notification, SubagentStop, SubagentStart, TeammateIdle, SessionStart, SessionEnd, StopFailure | Every event notifies |
| `normal` | Stop, Notification, SubagentStop | Response done + needs input + subagent done |
| `important` | Notification | Only permission_prompt and idle_prompt |

Users can also specify a custom comma-separated list: `"Stop,Notification,SubagentStop,TeammateIdle"`

## Instructions

- The config file path is: use the `CLAUDE_PLUGIN_DATA` environment variable + `/config.json`
- Read the environment variable via Bash: `echo $CLAUDE_PLUGIN_DATA`
- Read existing config with the Read tool, write updates with the Write tool
- When setting a value, merge with existing config (don't overwrite other keys)
- For boolean values, accept `true`/`false`, `on`/`off`, `1`/`0`
- Show config as a formatted table after any change
- If user says "reset", delete the config file to restore defaults

# cc-plugin-notification

Desktop notifications for Claude Code — taskbar flash, sound, and native notifications. Alerts you when Claude finishes responding so you can switch away and come back when it's done.

## Install

```
claude plugin marketplace add fhw12345/claude-code-notification
claude plugin install cc-plugin-notification@cc-notification-marketplace
```

## What it does

When Claude Code finishes a response, the plugin sends a desktop notification:

| Platform | Notification | Sound |
|----------|-------------|-------|
| **Windows** | Taskbar icon flashes orange | System asterisk or custom .wav |
| **macOS** | Native notification banner | System ping or custom sound |
| **Linux** | Desktop notification (notify-send) | Freedesktop sound theme or custom |

### Windows

Works with any terminal host: Windows Terminal, VS Code, PowerShell, CMD, JetBrains IDEs.
The taskbar flash continues until you switch back to the window, then auto-clears.

### macOS

Shows a native macOS notification via osascript. Detects the frontmost terminal app (Terminal.app, iTerm2, VS Code, etc.) for focus checking.

### Linux

Uses notify-send (with zenity/dbus-send fallback). Sound via PulseAudio, ALSA, or canberra-gtk-play.

## Configuration

### Using the config command

In a Claude Code session:

```
/cc-plugin-notification:config                       # show current settings
/cc-plugin-notification:config notifyOn=important    # only notify when user action needed
/cc-plugin-notification:config notifyOn=all          # notify on everything
/cc-plugin-notification:config sound=off             # disable sound
/cc-plugin-notification:config soundFile=C:\path\to\alert.wav  # custom sound
/cc-plugin-notification:config enabled=false         # disable all notifications
/cc-plugin-notification:config quietHours=22:00-08:00 # no notifications 10pm-8am
/cc-plugin-notification:config notifyWhenFocused=true # notify even when window is active
/cc-plugin-notification:config debug=true            # enable debug logging
/cc-plugin-notification:config reset                 # reset to defaults
```

### Notification levels (`notifyOn`)

Controls which events trigger a notification. Use a preset level or a custom comma-separated list.

| Level | Events included | Use case |
|-------|----------------|----------|
| `all` | Stop, Notification, SubagentStop, SubagentStart, TeammateIdle, SessionStart, SessionEnd, StopFailure | Every CC event notifies (frequent) |
| **`normal`** (default) | Stop, Notification, SubagentStop | Response done + needs input + subagent done |
| `important` | Notification | Only when user action is needed (quiet) |

**Event details:**

| Event | Meaning |
|-------|---------|
| `Stop` | Claude finished responding |
| `Notification/permission_prompt` | Claude needs permission to use a tool |
| `Notification/idle_prompt` | Claude is waiting for your input (after 60s idle) |
| `SubagentStop` | A subagent (spawned via Agent tool) completed |
| `SubagentStart` | A subagent was spawned |
| `TeammateIdle` | A teammate in an agent team went idle |
| `SessionStart` | A new CC session started |
| `SessionEnd` | A CC session ended |
| `StopFailure` | Claude's response failed |

**Custom list example:**

```
/cc-plugin-notification:config notifyOn=Stop,Notification,SubagentStop,TeammateIdle
```

### Config file

The config file is stored at `~/.claude/plugins/data/cc-plugin-notification-.../config.json` and is managed via the `/cc-plugin-notification:config` command.

```json
{
  "enabled": true,
  "sound": "on",
  "soundFile": "",
  "debug": false,
  "logFile": "",
  "notifyOn": "normal",
  "quietHours": "",
  "notifyWhenFocused": false,
  "debounceMs": 3000
}
```

### Settings reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | bool | `true` | Master switch for all notifications |
| `notifyOn` | string | `"normal"` | Notification level: `all`, `normal`, `important`, or custom comma-separated events |
| `sound` | `"on"` / `"off"` | `"on"` | Play sound when notifying |
| `soundFile` | string | `""` | Path to custom .wav file (empty = system sound) |
| `quietHours` | string | `""` | Suppress notifications during time range, e.g. `"22:00-08:00"` (local time) |
| `notifyWhenFocused` | bool | `false` | Notify even when the host window is in foreground |
| `debug` | bool | `false` | Enable debug logging |
| `logFile` | string | `""` | Custom log file path (empty = default in plugin data dir) |
| `debounceMs` | number | `3000` | Minimum milliseconds between notifications (prevents rapid-fire) |

### Environment variable overrides

Environment variables take precedence over the config file:

| Variable | Overrides | Values |
|----------|-----------|--------|
| `CC_NOTIFY_ENABLED` | `enabled` | `true` / `false` |
| `CC_NOTIFY_ON` | `notifyOn` | level name or comma-separated events |
| `CC_NOTIFY_SOUND` | `sound` | `on` / `off` |
| `CC_NOTIFY_SOUND_FILE` | `soundFile` | file path |
| `CC_NOTIFY_QUIET_HOURS` | `quietHours` | `HH:MM-HH:MM` or empty |
| `CC_NOTIFY_WHEN_FOCUSED` | `notifyWhenFocused` | `true` / `false` |
| `CC_NOTIFY_DEBUG` | `debug` | `1` / `0` |
| `CC_NOTIFY_LOG_FILE` | `logFile` | file path |
| `CC_NOTIFY_DEBOUNCE_MS` | `debounceMs` | milliseconds (e.g. `3000`) |
| `CC_NOTIFY_TARGET_PID` | — | Override target window PID |
| `CC_NOTIFY_DRY_RUN` | — | `1` to find window without flashing |

## How it works

The plugin registers hooks for all CC event types. A platform dispatcher (`src/notify.sh`) routes to the correct script:

- **Windows**: `src/platform/windows/flash.ps1` — walks the process tree, finds the outermost host window, calls `FlashWindowEx`
- **macOS**: `src/platform/macos/flash.sh` — shows native notification via `osascript`, plays sound via `afplay`
- **Linux**: `src/platform/linux/flash.sh` — shows notification via `notify-send`, plays sound via PulseAudio/ALSA

On each event:

1. Loads config from `$CLAUDE_PLUGIN_DATA/config.json` with env var overrides
2. Checks enabled, quiet hours, debounce, event type filter
3. Checks focus (skip if host window is active, unless `notifyWhenFocused=true`)
4. Sends platform-native notification
5. Plays notification sound

## Logs

All hook payloads are logged to `~/.claude/plugins/data/cc-plugin-notification-.../notification.log`. Enable debug mode for verbose process chain output:

```
/cc-plugin-notification:config debug=true
```

## Troubleshooting

- **Too many notifications**: Set `notifyOn=important` to only notify when user action is needed
- **Wrong window flashes**: Set `CC_NOTIFY_TARGET_PID` to the correct process ID
- **Nothing flashes**: Enable debug logging and check `notification.log`
- **No sound**: Check `sound` is not `"off"` in config
- **Custom sound not playing**: Ensure the file exists and is a valid `.wav` file

## Roadmap

- **Toast notifications** — Windows toast popups with message preview
- **Per-event sounds** — different sounds for different event types

## Requirements

| Platform | Requirements |
|----------|-------------|
| Windows | Windows 10/11, PowerShell (built-in) |
| macOS | macOS 10.14+, python3 (built-in) |
| Linux | notify-send or zenity (most distros), python3 or jq |

## License

MIT

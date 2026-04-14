# cc-plugin-notification

Windows taskbar flash + sound notifications for Claude Code. Alerts you when Claude finishes responding — so you can switch away and come back when it's done.

## Install

```
claude plugin marketplace add fhw12345/claude-code-notification
claude plugin install cc-plugin-notification@cc-notification-marketplace
```

## What it does

When Claude Code finishes a response, the plugin:

1. **Flashes the taskbar icon** (orange) of the host window
2. **Plays a notification sound** (Windows system sound by default)

Works with:

- **Windows Terminal** — flashes the WT window
- **VS Code** — flashes the VS Code window (integrated terminal)

The flash continues until you switch back to the window, then auto-clears.

## Configuration

### Using the config command

In a Claude Code session:

```
/cc-plugin-notification:config                    # show current settings
/cc-plugin-notification:config sound=off          # disable sound
/cc-plugin-notification:config sound=on           # enable sound
/cc-plugin-notification:config soundFile=C:\path\to\alert.wav  # custom sound
/cc-plugin-notification:config enabled=false      # disable all notifications
/cc-plugin-notification:config events.stop=false  # disable per-response notifications
/cc-plugin-notification:config debug=true         # enable debug logging
/cc-plugin-notification:config reset              # reset to defaults
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
  "events": {
    "stop": true,
    "notification": true
  }
}
```

### Settings reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | bool | `true` | Master switch for all notifications |
| `sound` | `"on"` / `"off"` | `"on"` | Play sound when notifying |
| `soundFile` | string | `""` | Path to custom .wav file (empty = system sound) |
| `debug` | bool | `false` | Enable debug logging |
| `logFile` | string | `""` | Custom log file path (empty = default in plugin data dir) |
| `events.stop` | bool | `true` | Notify when Claude finishes responding |
| `events.notification` | bool | `true` | Notify on CC idle/permission events |

### Environment variable overrides

Environment variables take precedence over the config file:

| Variable | Overrides | Values |
|----------|-----------|--------|
| `CC_NOTIFY_ENABLED` | `enabled` | `true` / `false` |
| `CC_NOTIFY_SOUND` | `sound` | `on` / `off` |
| `CC_NOTIFY_SOUND_FILE` | `soundFile` | file path |
| `CC_NOTIFY_DEBUG` | `debug` | `1` / `0` |
| `CC_NOTIFY_LOG_FILE` | `logFile` | file path |
| `CC_NOTIFY_TARGET_PID` | — | Override target window PID |
| `CC_NOTIFY_DRY_RUN` | — | `1` to find window without flashing |

## How it works

The plugin registers a **Stop hook** that runs after every Claude response. It:

1. Walks the process tree from the hook's PowerShell process up to the root
2. Finds the outermost ancestor with a visible taskbar window (WindowsTerminal.exe, Code.exe, etc.)
3. Calls `FlashWindowEx` on that window
4. Plays a notification sound

## Logs

Logs are written to `~/.claude/plugins/data/cc-plugin-notification-.../notification.log`. Enable debug mode for verbose output:

```
/cc-plugin-notification:config debug=true
```

## Troubleshooting

- **Wrong window flashes**: Set `CC_NOTIFY_TARGET_PID` to the correct process ID
- **Nothing flashes**: Enable debug logging and check `notification.log`
- **No sound**: Check `sound` is not `"off"` in config
- **Custom sound not playing**: Ensure the file exists and is a valid `.wav` file

## Requirements

- Windows 10/11
- PowerShell (ships with Windows)

## License

MIT

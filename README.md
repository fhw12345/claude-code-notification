# cc-plugin-notification

Windows taskbar flash notifications for Claude Code. Alerts you when tasks complete, fail, or need input — so you can switch away and come back when Claude is done.

## Install

In Claude Code, run:

```
claude plugin marketplace add fhw12345/claude-code-notification
claude plugin install cc-plugin-notification@cc-notification-marketplace
```

Or from inside a Claude Code session:

```
/plugin marketplace add fhw12345/claude-code-notification
/plugin install cc-plugin-notification@cc-notification-marketplace
```

## What it does

When Claude Code finishes a task, the plugin flashes the host window's taskbar icon (orange/red). Works with:

- **Windows Terminal** — flashes the terminal window
- **VS Code** — flashes the VS Code window (integrated terminal)
- **PowerShell / CMD** — flashes the console window

The flash continues until you switch back to the window, then auto-clears.

## Supported events

| Event | Default |
|-------|---------|
| Task completed | Enabled |
| Task failed | Enabled |
| Needs input | Enabled |
| Progress update | Enabled |

## Configuration

### CLI flags

These can be set in the hook command inside `hooks/hooks.json`:

| Flag | Values | Description |
|------|--------|-------------|
| `--notify-enabled` | `true`/`false` | Enable/disable all notifications |
| `--notify-channel-taskbar-flash` | `true`/`false` | Enable/disable taskbar flash |
| `--notify-event-task-failed` | `true`/`false` | Enable/disable task-failed events |
| `--notify-behavior-throttle-ms` | number | Minimum ms between notifications |
| `--notify-behavior-quiet-hours` | `off` or `HH:MM-HH:MM` | Disable or set quiet hours (UTC) |

### Environment variables

| Variable | Description |
|----------|-------------|
| `CC_NOTIFY_TARGET_PID` | Override target window PID |
| `CC_NOTIFY_DEBUG` | Set to `1` for debug output |

## How window targeting works

The plugin automatically finds the correct window to flash:

1. Explicit `CC_NOTIFY_TARGET_PID` if set
2. `VSCODE_PID` in VS Code integrated terminal
3. VS Code browser process from the parent chain
4. Terminal host process (WindowsTerminal.exe, etc.)

Shell processes (pwsh.exe, bash.exe, cmd.exe, node.exe) are skipped to avoid flashing the wrong window.

## Troubleshooting

- **Wrong window flashes**: Set `CC_NOTIFY_TARGET_PID` to the correct window's process ID
- **Nothing flashes**: Run with `CC_NOTIFY_DEBUG=1` to see which PID and HWND were selected
- **Quiet hours blocking**: Use `--notify-behavior-quiet-hours=off` to disable

## Requirements

- Windows 10/11
- Node.js 18+
- PowerShell (ships with Windows)

## License

MIT

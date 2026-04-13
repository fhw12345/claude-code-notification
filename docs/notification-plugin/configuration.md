# Notification Plugin Configuration

Config precedence is:

1. CLI flags
2. Plugin config file
3. settings.json
4. Built-in defaults

Supported CLI overrides:

- `--notify-enabled=true|false`
- `--notify-channel-taskbar-flash=true|false`
- `--notify-event-task-failed=true|false`
- `--notify-behavior-throttle-ms=<number>`

Invalid CLI values are ignored and reported as warnings.

## Windows taskbar flash targeting

Taskbar flashing is the only supported Windows notification channel.
The notifier resolves the Claude Code host window automatically. It prefers:

1. `CC_NOTIFY_TARGET_PID` when explicitly provided
2. `VSCODE_PID` in VS Code integrated terminal, which normally points at the current VS Code window process
3. A `Code.exe --type=browser` process found in the current parent process chain
4. The remaining current Claude Code parent process chain

It then enumerates visible top-level windows for those candidate PIDs and flashes the first matching host window.

When a candidate PID owns multiple visible windows, the notifier sorts them deterministically:

1. Exact VS Code window title mapped from the current Claude Code extension host when multi-window VS Code is ambiguous
1. Title containing the current workspace folder name
2. Alphabetical window title
3. Numeric window handle as a final tie-breaker

To avoid slowing down every notification, the VS Code status lookup only runs when the current VS Code browser process owns multiple visible windows and workspace-title matching alone is still ambiguous. It first tries the `cli.js` path derived from the current VS Code install and cache metadata, then falls back to `code --status` if needed. The runtime PowerShell selector and the TypeScript tests use the same ordering rule so the chosen window stays stable across repeated runs.

Expected behavior by host:

- VS Code integrated terminal: flashes the VS Code window.
- Terminal hosts (Windows Terminal, PowerShell console, CMD): flashes the terminal window.

Troubleshooting:

- If you run multiple VS Code windows and the wrong window flashes, set `CC_NOTIFY_TARGET_PID` explicitly to the intended host window process.
- If nothing flashes in VS Code integrated terminal, confirm the Claude Code process is launched inside that VS Code window and that `VSCODE_PID` is present in the environment. The current window should usually win before any other `Code.exe` process.
- Run the demo or plugin process with `CC_NOTIFY_DEBUG=1` to print the candidate PID list and the resolved window handle while testing host selection.
- In multi-window VS Code, the debug output also includes the current extension-host PID, whether status lookup ran, the ordered window list, and the preferred window title so you can confirm why a specific window won.
- `npm run demo:notify:inspect` resolves and prints the current target window without flashing it.
- If the host has no visible top-level window, the notification returns `taskbar_flash_failed`.

If the host window cannot be resolved, the notification returns `taskbar_flash_failed`.

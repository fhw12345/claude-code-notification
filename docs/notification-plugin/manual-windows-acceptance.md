# Manual Windows Acceptance

## Host matrix

| Host | Foreground behavior (`notifyWhenTerminalFocused=false`) | Background behavior | Host-window targeting | Taskbar flash only check |
| --- | --- | --- | --- | --- |
| Windows Terminal | [ ] No notification while terminal is focused | [ ] Notification appears after switching away | [ ] Flash highlights Windows Terminal taskbar entry | [ ] No toast UI appears, only taskbar flash | 
| PowerShell console host | [ ] No notification while terminal is focused | [ ] Notification appears after switching away | [ ] Flash highlights PowerShell taskbar entry | [ ] No toast UI appears, only taskbar flash | 
| VS Code integrated terminal | [ ] No notification while terminal is focused | [ ] Notification appears after switching away | [ ] Flash highlights VS Code taskbar entry | [ ] No toast UI appears, only taskbar flash | 

## CLI override checks

- [ ] Run with `--notify-event-task-failed=false`; verify task-failed notifications are suppressed.
- [ ] Run with plugin/settings enabling task-failed notifications and confirm CLI still wins.
- [ ] Run with invalid value `--notify-enabled=maybe`; verify warning is emitted and default/file value remains active.

## Foreground/background behavior checks

- [ ] With `notifyWhenTerminalFocused=false`, keep terminal focused and verify events are suppressed.
- [ ] Switch focus away from the host window and verify the same events notify.
- [ ] Set `notifyWhenTerminalFocused=true` and verify focused terminal can notify.

## Taskbar flash failure checks

- [ ] Unset `CC_NOTIFY_TARGET_PID` and run outside a windowed host; verify notification returns `taskbar_flash_failed`.
- [ ] With multiple VS Code windows open, verify the integrated terminal flashes the current VS Code window. If it flashes the wrong window, set `CC_NOTIFY_TARGET_PID` and verify the target becomes deterministic.
- [ ] Re-run with `CC_NOTIFY_DEBUG=1` and record the printed candidate PID order, `currentExtensionHostPid`, status-lookup fields, and resolved HWND for the selected VS Code window.
- [ ] Use `npm run demo:notify:debug` and verify the printed `selectedPid` window title matches the VS Code window you launched Claude Code from.
- [ ] Use `npm run demo:notify:inspect` before flashing and verify it predicts the same window that later flashes.

## Regression checks

- [ ] Run baseline flow with no CLI overrides; verify existing behavior is unchanged.

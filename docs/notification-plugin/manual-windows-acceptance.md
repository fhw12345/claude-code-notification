# Manual Windows Acceptance

## Host matrix

| Host | Foreground behavior (`notifyWhenTerminalFocused=false`) | Background behavior | Toast fallback check |
| --- | --- | --- | --- |
| Windows Terminal | [ ] No notification while terminal is focused | [ ] Notification appears after switching away | [ ] Force taskbar flash failure and verify toast still appears |
| PowerShell console host | [ ] No notification while terminal is focused | [ ] Notification appears after switching away | [ ] Force taskbar flash failure and verify toast still appears |
| VS Code integrated terminal | [ ] No notification while terminal is focused | [ ] Notification appears after switching away | [ ] Force taskbar flash failure and verify toast still appears |

## CLI override checks

- [ ] Run with `--notify-event-task-failed=false`; verify task-failed notifications are suppressed.
- [ ] Run with plugin/settings enabling task-failed notifications and confirm CLI still wins.
- [ ] Run with invalid value `--notify-enabled=maybe`; verify warning is emitted and default/file value remains active.

## Foreground/background behavior checks

- [ ] With `notifyWhenTerminalFocused=false`, keep terminal focused and verify events are suppressed.
- [ ] Switch focus away from terminal and verify the same events notify.
- [ ] Set `notifyWhenTerminalFocused=true` and verify focused terminal can notify.

## Toast fallback checks

- [ ] Enable both taskbar flash and toast; force flash failure and verify toast is used.
- [ ] Disable toast, force flash failure, and verify no channel succeeds (expected failure path).

## Regression checks

- [ ] Run baseline flow with no CLI overrides; verify existing behavior is unchanged.

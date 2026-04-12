# Manual Windows Acceptance

## CLI override checks

- [ ] Run with `--notify-event-task-failed=false`; verify task-failed notifications are suppressed.
- [ ] Run with plugin/settings enabling task-failed notifications and confirm CLI still wins.
- [ ] Run with invalid value `--notify-enabled=maybe`; verify warning is emitted and default/file value remains active.

## Regression checks

- [ ] Run baseline flow with no CLI overrides; verify existing behavior is unchanged.

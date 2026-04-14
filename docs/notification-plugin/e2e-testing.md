# E2E Testing Guide

## Automated Tests

```bash
npm test
```

Runs 14 E2E tests that invoke the real PowerShell script (`flash.ps1`). Tests cover:
- enabled/disabled
- quiet hours (active/inactive)
- notifyWhenFocused
- notifyOn levels (all/normal/important/custom)
- sound on/off
- dry run mode
- payload logging

## Manual Testing

### Test flash directly

```bash
CC_NOTIFY_DEBUG=1 powershell -NoProfile -ExecutionPolicy Bypass -File src/platform/windows/flash.ps1
```

### Test with specific hook payload

```bash
echo '{"hook_event_name":"Stop","last_assistant_message":"test"}' | \
  CC_NOTIFY_DEBUG=1 CC_NOTIFY_WHEN_FOCUSED=true \
  powershell -NoProfile -ExecutionPolicy Bypass -File src/platform/windows/flash.ps1
```

### Test via Claude Code

```bash
claude -p "say hi" --output-format stream-json --include-hook-events --verbose 2>/dev/null | grep Stop
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CC_NOTIFY_DEBUG=1` | Debug output to stdout + log |
| `CC_NOTIFY_DRY_RUN=1` | Find window without flashing |
| `CC_NOTIFY_TARGET_PID=<pid>` | Override target window PID |
| `CC_NOTIFY_WHEN_FOCUSED=true` | Notify even when window is active |
| `CC_NOTIFY_ON=important` | Filter by notification level |
| `CC_NOTIFY_SOUND=off` | Disable sound |
| `CC_NOTIFY_QUIET_HOURS=22:00-08:00` | Quiet hours (local time) |

## Plugin Update Cycle

```bash
# 1. Edit code
# 2. Bump version in .claude-plugin/plugin.json AND .claude-plugin/marketplace.json
# 3. git commit && git push
# 4. claude plugins update cc-plugin-notification@cc-notification-marketplace
# 5. Restart cc (for hooks.json changes; .ps1 changes take effect immediately)
```

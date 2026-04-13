# E2E Testing Guide

## Quick E2E Test

Tests the full pipeline (stdin payload → normalize → rules → flash) without manual interaction:

```bash
# From repo root
claude -p "say hi" --output-format stream-json --include-hook-events --verbose 2>/dev/null | grep -E "Stop|Notification"
```

Expected: `hook_started` and `hook_response` events with `hook_event="Stop"` and `exit_code=0`.

## Detailed Test Steps

### 1. Test payload parsing (Stop hook)

```bash
echo '{"hook_event_name":"Stop","stop_hook_active":false,"last_assistant_message":"Hello!"}' | \
  CC_NOTIFY_DEBUG=1 CC_PLUGIN_E2E_OUTPUT=1 \
  node ./node_modules/tsx/dist/cli.mjs ./src/cli.ts \
  --notify-enabled=true --notify-channel-taskbar-flash=true --notify-behavior-quiet-hours=off
```

Expected: `candidatePids=XXXX`, `resolvedHwnd=XXXX`, `{"delivered":true,...}`.

### 2. Test payload parsing (Notification hook)

```bash
echo '{"hook_event_name":"Notification","notification_type":"idle_prompt","message":"Claude is waiting"}' | \
  CC_PLUGIN_E2E_OUTPUT=1 \
  node ./node_modules/tsx/dist/cli.mjs ./src/cli.ts \
  --notify-enabled=true --notify-channel-taskbar-flash=true --notify-behavior-quiet-hours=off
```

### 3. Test with explicit target PID

Bypasses process chain detection — useful for isolating flash logic:

```bash
# Find WindowsTerminal PID
powershell -Command "Get-Process WindowsTerminal | Select Id"

# Or find VS Code PID
powershell -Command "Get-Process Code | Where-Object { $_.MainWindowHandle -ne 0 } | Select Id"

# Flash it
echo '{"hook_event_name":"Stop","last_assistant_message":"test"}' | \
  CC_NOTIFY_DEBUG=1 CC_PLUGIN_E2E_OUTPUT=1 CC_NOTIFY_TARGET_PID=<PID> \
  node ./node_modules/tsx/dist/cli.mjs ./src/cli.ts \
  --notify-enabled=true --notify-channel-taskbar-flash=true --notify-behavior-quiet-hours=off
```

### 4. Debug process chain

When `candidatePids` is empty, trace the process chain:

```bash
npm run demo:notify:debug
```

Or create `debug-chain.ps1`:

```powershell
$currentPid = $PID
$visited = @{}
while ($currentPid -gt 0 -and -not $visited.ContainsKey($currentPid)) {
    $visited[$currentPid] = $true
    $proc = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $currentPid) -ErrorAction SilentlyContinue
    if (-not $proc) { break }
    Write-Output ('PID=' + $proc.ProcessId + ' PPID=' + $proc.ParentProcessId + ' Name=' + $proc.Name)
    if ($proc.ParentProcessId -eq $currentPid) { break }
    $currentPid = [int]$proc.ParentProcessId
}
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CC_NOTIFY_DEBUG=1` | PowerShell debug output (candidatePids, hwnd, etc.) |
| `CC_PLUGIN_E2E_OUTPUT=1` | Emit JSON result on stdout |
| `CC_NOTIFY_TARGET_PID=<pid>` | Skip process chain, flash this PID's window |
| `CC_NOTIFY_DRY_RUN=1` | Find window but don't flash |
| `VSCODE_PID` | Auto-set by VS Code for window detection |

## Plugin Update Cycle

```bash
# 1. Make code changes
# 2. Bump version in BOTH files:
#    .claude-plugin/plugin.json
#    .claude-plugin/marketplace.json
# 3. Commit and push
git add -A && git commit -m "..." && git push
# 4. Update plugin
claude plugins update cc-plugin-notification@cc-notification-marketplace
# 5. Restart CC (required for hooks.json changes, not for .ts code changes)
```

## Key Gotchas

- **Notification hook ≠ every response.** Only fires after 60s idle. Use **Stop hook** for per-response notifications.
- **Hook processes have isolated process chains.** WindowsTerminal.exe / Code.exe may not be in the parent chain. The fallback searches by process name.
- **`-EncodedCommand` has a length limit.** Uses temp file + `-File` instead.
- **Plugin cache is version-pinned.** Must bump version for `claude plugins update` to re-fetch.
- **hooks.json needs CC restart.** Source .ts files are re-compiled per invocation.

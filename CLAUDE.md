# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- Run tests: `npm test`
- Single test: `npx vitest run tests/e2e/flash-ps1.test.ts`
- Manual test (Windows): `CC_NOTIFY_DEBUG=1 powershell -NoProfile -ExecutionPolicy Bypass -File src/platform/windows/flash.ps1`
- Manual test (macOS/Linux): `echo '{"hook_event_name":"Stop"}' | CC_NOTIFY_DEBUG=1 CC_NOTIFY_DRY_RUN=1 CLAUDE_PLUGIN_DATA=/tmp/test bash src/platform/linux/flash.sh`

## Architecture overview

Cross-platform Claude Code notification plugin — flashes taskbar (Windows), shows native notifications (macOS/Linux), and plays sound when Claude responds.

- **Entry point**: `hooks/hooks.json` registers all CC hook events, each calling `src/notify.sh`
- **Platform dispatcher**: `src/notify.sh` — detects OS via `uname -s`, routes to platform script
- **Platform scripts**:
  - `src/platform/windows/flash.ps1` — FlashWindowEx + system sound
  - `src/platform/macos/flash.sh` — osascript notification + afplay + terminal bell
  - `src/platform/linux/flash.sh` — notify-send + PulseAudio/ALSA + terminal bell
- **Config command**: `commands/config.md` — `/cc-plugin-notification:config` slash command
- **Tests**: `tests/e2e/flash-ps1.test.ts` — 17 E2E tests (Windows PowerShell)
- **CI**: `.github/workflows/ci.yml` — tests on Windows, macOS, Linux runners

## Key config settings

- `notifyOn`: `all` / `normal` (default) / `important` / custom comma-separated events
- `sound`: `on` / `off`
- `quietHours`: `"HH:MM-HH:MM"` (local time)
- `notifyWhenFocused`: `true` / `false`
- `debounceMs`: minimum ms between notifications (default 3000)

## Plugin update cycle

1. Edit code
2. Bump version in ALL THREE files: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
3. `git commit && git push`
4. `claude plugins update cc-plugin-notification@cc-notification-marketplace`
5. Restart cc (required for hooks.json changes, not for script code changes)

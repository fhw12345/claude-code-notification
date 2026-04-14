# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- Run tests: `npm test`
- Single test: `npx vitest run tests/e2e/flash-ps1.test.ts`
- Manual test: `CC_NOTIFY_DEBUG=1 powershell -NoProfile -ExecutionPolicy Bypass -File src/platform/windows/flash.ps1`

## Architecture overview

This is a Claude Code plugin that flashes the Windows taskbar and plays a sound when Claude responds.

- **Entry point**: `hooks/hooks.json` registers CC hooks (Stop, Notification, SubagentStop, etc.) that invoke `src/platform/windows/flash.ps1` directly via PowerShell.
- **Core logic**: `src/platform/windows/flash.ps1` — standalone PowerShell script that:
  1. Loads config from `$CLAUDE_PLUGIN_DATA/config.json` with env var overrides
  2. Checks enabled, quiet hours, event type filters (`notifyOn` levels)
  3. Walks the process chain from `$PID` up to find the outermost host window
  4. Calls `FlashWindowEx` on the host window
  5. Plays notification sound (system or custom wav)
  6. Logs payload and debug info to `notification.log`
- **Config command**: `commands/config.md` — `/cc-plugin-notification:config` slash command for managing settings
- **Tests**: `tests/e2e/flash-ps1.test.ts` — 14 E2E tests that invoke the real PowerShell script

## Key config settings

- `notifyOn`: `all` / `normal` (default) / `important` / custom comma-separated events
- `sound`: `on` / `off`
- `quietHours`: `"HH:MM-HH:MM"` (local time)
- `notifyWhenFocused`: `true` / `false`

## Plugin update cycle

1. Edit code
2. Bump version in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
3. `git commit && git push`
4. `claude plugins update cc-plugin-notification@cc-notification-marketplace`
5. Restart cc (required for hooks.json changes, not for .ps1 code changes)

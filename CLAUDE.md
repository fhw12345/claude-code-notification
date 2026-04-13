# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- Run tests:
  - `npm test`
  - Single test file: `npx vitest run tests/unit/platform/windows-notifier.test.ts`
- Demo (runs CLI with sample payload):
  - `npm run demo:notify:ok`
  - `npm run demo:notify:badjson`
  - `npm run demo:notify:debug` (with debug output)
  - `npm run demo:notify:inspect` (inspect notification target)
- No build step — CLI runs directly from `.ts` via `tsx`.

## Architecture overview

- **Entry points**
  - CLI: `src/cli.ts` (bin: `cc-plugin-notification`). Reads JSON payload from stdin, resolves config, runs pipeline. Set `CC_PLUGIN_E2E_OUTPUT=1` to emit JSON result on stdout (used by integration tests).
  - Library: `src/index.ts` exports `createNotificationPipeline`.

- **Runtime pipeline** (`src/runtime/*`)
  - `createPipeline.ts` builds state (throttle, focus detector) and routes events.
  - `handleEvent.ts` flow: normalize hook payload -> evaluate rules -> call adapter notify -> return `{ delivered, reason }`.

- **Event normalization** (`src/events/*`)
  - `normalizeHookEvent.ts` maps hook payloads to `AgentEvent` (`task_completed`, `task_failed`, `needs_input`, `progress_update`).

- **Config resolution** (`src/config/*`)
  - Defaults in `defaults.ts`.
  - CLI overrides parsed in `parseCliArgs.ts` (limited set of flags).
  - Merge in `mergeConfig.ts` and `resolveConfig.ts`; precedence: defaults -> settings -> plugin -> CLI.
  - Note: loaders `loadSettingsJson.ts` / `loadPluginConfig.ts` exist but are not wired through the CLI path.

- **Rules engine** (`src/rules/*`)
  - `evaluateRules.ts` enforces enabled flags, focus policy, quiet hours, and throttle.
  - Quiet hours are evaluated using UTC time (`getUTCHours/getUTCMinutes`).

- **Windows notifications** (`src/platform/windows/*`)
  - `windowsNotifier.ts` uses taskbar flash only. No toast fallback.
  - `taskbarFlash.ts` uses PowerShell + `FlashWindowEx`. Targets a PID via `CC_NOTIFY_TARGET_PID` to flash the Claude Code host window (VS Code window for integrated terminal, terminal window for terminal hosts).

## Docs

- Config and CLI flags: `docs/notification-plugin/configuration.md`
- Manual Windows acceptance checklist: `docs/notification-plugin/manual-windows-acceptance.md`
- Design/plan docs: `docs/superpowers/specs/*` and `docs/superpowers/plans/*`

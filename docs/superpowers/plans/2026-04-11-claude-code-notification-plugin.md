# Claude Code Notification Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first Claude Code notification plugin that triggers taskbar attention/toast notifications from Claude Code events with user-configurable rules.

**Architecture:** Implement a small event pipeline: event normalization → config resolution → rule evaluation → Windows notification adapter. Keep policy logic pure and side effects isolated for testability. Use precedence-based config merging (`CLI > plugin config > settings.json > defaults`) and non-fatal error handling.

**Tech Stack:** Node.js, TypeScript, Vitest

---

## File Structure (planned)

- `package.json` — scripts, deps, CLI bin
- `tsconfig.json` — TypeScript compiler config
- `vitest.config.ts` — test runner config
- `src/index.ts` — exported pipeline factory
- `src/contracts/config.ts` — `NotifyConfig` type
- `src/contracts/events.ts` — `AgentEvent` union
- `src/config/defaults.ts` — default config
- `src/config/loadSettingsJson.ts` — parse settings source
- `src/config/loadPluginConfig.ts` — parse plugin config source
- `src/config/parseCliArgs.ts` — parse CLI flags
- `src/config/mergeConfig.ts` — merge semantics
- `src/config/warnOnce.ts` — per-key warning dedupe
- `src/config/resolveConfig.ts` — precedence resolver
- `src/events/normalizeHookEvent.ts` — hook payload normalization
- `src/events/eventSource.ts` — event source wrapper
- `src/rules/throttleState.ts` — throttle bookkeeping
- `src/rules/evaluateRules.ts` — rule decision engine
- `src/runtime/focusDetector.ts` — terminal focus detection interface/impl
- `src/platform/NotificationAdapter.ts` — adapter contract
- `src/platform/windows/taskbarFlash.ts` — taskbar flash implementation
- `src/platform/windows/toastNotifier.ts` — toast fallback implementation
- `src/platform/windows/windowsNotifier.ts` — Windows adapter orchestration
- `src/runtime/handleEvent.ts` — single-event pipeline
- `src/runtime/createPipeline.ts` — pipeline construction
- `src/cli.ts` — CLI entrypoint
- `tests/**` — unit/integration tests
- `docs/notification-plugin/configuration.md` — config docs
- `docs/notification-plugin/manual-windows-acceptance.md` — manual matrix checklist

---

### Task 1: Bootstrap project and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `tests/smoke/startup.test.ts`

- [ ] **Step 1: Write failing startup test**
```ts
import { describe, it, expect } from "vitest";
import { createNotificationPipeline } from "../../src/index";

describe("startup", () => {
  it("exports createNotificationPipeline", () => {
    expect(typeof createNotificationPipeline).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- --run tests/smoke/startup.test.ts`  
Expected: FAIL (missing export/module)

- [ ] **Step 3: Add minimal export**
```ts
export function createNotificationPipeline() {
  return {};
}
```

- [ ] **Step 4: Re-run startup test**
Run: `npm test -- --run tests/smoke/startup.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add package.json tsconfig.json vitest.config.ts src/index.ts tests/smoke/startup.test.ts
git commit -m "chore: bootstrap TypeScript notification plugin project"
```

### Task 2: Define contracts and defaults

**Files:**
- Create: `src/contracts/config.ts`, `src/contracts/events.ts`, `src/config/defaults.ts`
- Test: `tests/unit/contracts/config-defaults.test.ts`, `tests/unit/contracts/events-contract.test.ts`

- [ ] **Step 1: Write failing defaults test**
```ts
import { expect, it } from "vitest";
import { defaultNotifyConfig } from "../../../src/config/defaults";

it("has required default fields", () => {
  expect(defaultNotifyConfig.enabled).toBe(true);
  expect(defaultNotifyConfig.channels.taskbarFlash).toBe(true);
  expect(defaultNotifyConfig.events.taskCompleted).toBe(true);
});
```

- [ ] **Step 2: Run tests and confirm failure**
Run: `npm test -- --run tests/unit/contracts/config-defaults.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `NotifyConfig`, `AgentEvent`, defaults**
```ts
export type AgentEvent =
  | { type: "taskCompleted"; taskId: string; title?: string; at: string }
  | { type: "taskFailed"; taskId: string; reason?: string; at: string }
  | { type: "needsInput"; prompt: string; at: string }
  | { type: "progressUpdate"; taskId: string; message: string; at: string };
```

- [ ] **Step 4: Re-run contract tests**
Run: `npm test -- --run tests/unit/contracts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/contracts src/config/defaults.ts tests/unit/contracts
git commit -m "feat: add notification config and event contracts"
```

### Task 3: Implement config source loaders

**Files:**
- Create: `src/config/loadSettingsJson.ts`, `src/config/loadPluginConfig.ts`, `src/config/parseCliArgs.ts`
- Test: `tests/unit/config/loaders.test.ts`, fixtures under `tests/fixtures/`

- [ ] **Step 1: Write failing loader tests**
```ts
it("returns partial config from valid settings file", async () => {
  const result = await loadSettingsJson("tests/fixtures/settings.valid.json");
  expect(result.value?.events?.taskFailed).toBe(true);
  expect(result.warnings).toEqual([]);
});
```

- [ ] **Step 2: Run loader tests and verify failure**
Run: `npm test -- --run tests/unit/config/loaders.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement loaders and CLI parser (non-fatal invalid input)**
```ts
type LoadResult = { value?: Partial<NotifyConfig>; warnings: string[] };
```

- [ ] **Step 4: Re-run loader tests**
Run: `npm test -- --run tests/unit/config/loaders.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/config/loadSettingsJson.ts src/config/loadPluginConfig.ts src/config/parseCliArgs.ts tests/unit/config/loaders.test.ts tests/fixtures
git commit -m "feat: add config loaders for settings, plugin file, and CLI"
```

### Task 4: Implement resolver and merge semantics

**Files:**
- Create: `src/config/mergeConfig.ts`, `src/config/resolveConfig.ts`, `src/config/warnOnce.ts`
- Test: `tests/unit/config/resolve-config.test.ts`

- [ ] **Step 1: Write failing precedence and merge tests**
```ts
it("applies precedence CLI > plugin > settings > defaults", () => {
  const resolved = resolveConfig({
    defaults: { enabled: true },
    settings: { enabled: false },
    plugin: { enabled: true },
    cli: { enabled: false },
  });
  expect(resolved.config.enabled).toBe(false);
});
```

- [ ] **Step 2: Run resolver tests and confirm failure**
Run: `npm test -- --run tests/unit/config/resolve-config.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement deep merge + per-key warn once**
```ts
// scalars override; objects deep-merge; arrays replace
```

- [ ] **Step 4: Re-run resolver tests**
Run: `npm test -- --run tests/unit/config/resolve-config.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/config/mergeConfig.ts src/config/resolveConfig.ts src/config/warnOnce.ts tests/unit/config/resolve-config.test.ts
git commit -m "feat: add config resolver with precedence and merge semantics"
```

### Task 5: Implement hook event normalization

**Files:**
- Create: `src/events/normalizeHookEvent.ts`, `src/events/eventSource.ts`
- Test: `tests/unit/events/normalize-hook-event.test.ts`

- [ ] **Step 1: Write failing normalization tests**
```ts
it("maps hook payload to taskCompleted event", () => {
  const event = normalizeHookEvent({ kind: "task_completed", taskId: "t1", at: "2026-04-11T10:00:00Z" });
  expect(event).toEqual({ type: "taskCompleted", taskId: "t1", at: "2026-04-11T10:00:00Z" });
});
```

- [ ] **Step 2: Run tests and verify failure**
Run: `npm test -- --run tests/unit/events/normalize-hook-event.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement mapping/drop behavior**
```ts
// unknown shape => undefined + debug log
// missing required field => undefined + warning
```

- [ ] **Step 4: Re-run normalization tests**
Run: `npm test -- --run tests/unit/events/normalize-hook-event.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/events/normalizeHookEvent.ts src/events/eventSource.ts tests/unit/events/normalize-hook-event.test.ts
git commit -m "feat: normalize Claude Code hook events"
```

### Task 6: Implement rule engine

**Files:**
- Create: `src/rules/evaluateRules.ts`, `src/rules/throttleState.ts`, `src/runtime/focusDetector.ts`
- Test: `tests/unit/rules/evaluate-rules.test.ts`

- [ ] **Step 1: Write failing rule tests**
```ts
it("suppresses notification when terminal is focused and focused notifications are disabled", () => {
  const decision = evaluateRules(event, config, { isFocused: true, nowMs: 1000 }, state);
  expect(decision.notify).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify failure**
Run: `npm test -- --run tests/unit/rules/evaluate-rules.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement evaluateRules with injected time/focus**
```ts
export type RuleDecision = { notify: boolean; reason: string };
```

- [ ] **Step 4: Re-run rule tests**
Run: `npm test -- --run tests/unit/rules/evaluate-rules.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/rules/evaluateRules.ts src/rules/throttleState.ts src/runtime/focusDetector.ts tests/unit/rules/evaluate-rules.test.ts
git commit -m "feat: add notification rule evaluation engine"
```

### Task 7: Implement Windows adapter and toast fallback

**Files:**
- Create: `src/platform/NotificationAdapter.ts`, `src/platform/windows/taskbarFlash.ts`, `src/platform/windows/toastNotifier.ts`, `src/platform/windows/windowsNotifier.ts`
- Test: `tests/unit/platform/windows-notifier.test.ts`

- [ ] **Step 1: Write failing adapter tests**
```ts
it("falls back to toast when taskbar flash fails and toast is enabled", async () => {
  const adapter = createWindowsNotifier({ flash: async () => { throw new Error("fail"); }, toast: vi.fn() });
  await adapter.notify(event, config);
  expect(adapterDeps.toast).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests and verify failure**
Run: `npm test -- --run tests/unit/platform/windows-notifier.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement non-throwing Windows notifier**
```ts
// never throw to pipeline; return outcome object instead
```

- [ ] **Step 4: Re-run adapter tests**
Run: `npm test -- --run tests/unit/platform/windows-notifier.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/platform/NotificationAdapter.ts src/platform/windows tests/unit/platform/windows-notifier.test.ts
git commit -m "feat: add windows notification adapter with toast fallback"
```

### Task 8: Assemble runtime pipeline and integration tests

**Files:**
- Create: `src/runtime/handleEvent.ts`, `src/runtime/createPipeline.ts`
- Modify: `src/index.ts`
- Test: `tests/integration/pipeline.integration.test.ts`

- [ ] **Step 1: Write failing integration tests**
```ts
it("runs end-to-end decision and dispatch", async () => {
  const pipeline = createNotificationPipeline({ ...deps });
  await pipeline.handle(rawHookPayload);
  expect(mockAdapter.notify).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run integration test and verify failure**
Run: `npm test -- --run tests/integration/pipeline.integration.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement pipeline composition**
```ts
// normalize -> resolveConfig -> evaluateRules -> adapter.notify
```

- [ ] **Step 4: Re-run integration test**
Run: `npm test -- --run tests/integration/pipeline.integration.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/runtime src/index.ts tests/integration/pipeline.integration.test.ts
git commit -m "feat: wire end-to-end notification pipeline"
```

### Task 9: Add CLI entry and user docs

**Files:**
- Create: `src/cli.ts`, `docs/notification-plugin/configuration.md`, `docs/notification-plugin/manual-windows-acceptance.md`
- Test: `tests/unit/cli/parse-cli-args.test.ts`

- [ ] **Step 1: Write failing CLI override test**
```ts
it("CLI flags override file and settings values", () => {
  const parsed = parseCliArgs(["--notify-task-failed=false"]);
  expect(parsed.events?.taskFailed).toBe(false);
});
```

- [ ] **Step 2: Run CLI tests and verify failure**
Run: `npm test -- --run tests/unit/cli/parse-cli-args.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement CLI entrypoint and config docs**
```ts
#!/usr/bin/env node
// parse args -> resolve config -> start pipeline listener
```

- [ ] **Step 4: Re-run CLI tests and full test suite**
Run: `npm test -- --run`  
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/cli.ts tests/unit/cli/parse-cli-args.test.ts docs/notification-plugin/configuration.md docs/notification-plugin/manual-windows-acceptance.md
git commit -m "feat: add CLI wiring and notification plugin docs"
```

---

## Validation Commands

```bash
npm install
npm test -- --run
npm test -- --run tests/unit/config/resolve-config.test.ts
npm test -- --run tests/unit/events/normalize-hook-event.test.ts
npm test -- --run tests/unit/rules/evaluate-rules.test.ts
npm test -- --run tests/unit/platform/windows-notifier.test.ts
npm test -- --run tests/integration/pipeline.integration.test.ts
```

## Spec Coverage Check
- Event ingress + normalization: Task 5
- Config precedence/merge semantics: Tasks 3–4
- Rule engine (events/focus/throttle/quiet hours): Task 6
- Windows flash + toast fallback: Task 7
- Pipeline orchestration + non-fatal behavior: Task 8
- CLI/settings/plugin config support: Tasks 3, 4, 9
- Test matrix + docs/manual acceptance: Task 9

No uncovered spec requirement found.

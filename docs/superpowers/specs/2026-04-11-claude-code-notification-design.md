# Claude Code Notification Plugin Design

Date: 2026-04-11
Status: Approved for implementation planning

## 1. Problem Statement
Build a Claude Code notification plugin that provides Windows desktop/taskbar alerts when meaningful Claude Code progress occurs. Primary user value is making background terminal activity visible by taskbar highlight (orange flash behavior), with configurable notification triggers and behavior.

## 2. Goals
- Deliver Windows-first notification capability for Claude Code activity.
- Support user-configurable trigger events.
- Support configurable foreground/background notification behavior.
- Support three configuration entry points:
  - `settings.json`
  - plugin config file
  - CLI arguments
- Define architecture that can later extend to macOS/Linux without redesign.

## 3. Non-Goals
- Full cross-platform implementation in v1.
- Multi-channel enterprise notifications (Slack/Feishu/email) in v1.
- Complex daemon/service process architecture in v1.

## 4. Recommended Approach
Use a modular event pipeline:
1. Event Source
2. Rule Engine
3. Notification Adapter (Windows)
4. Config Resolver
5. Platform Adapter abstraction

This balances fast delivery with clean extension paths.

## 5. Architecture

### 5.1 Event Source
Receives normalized Claude Code runtime events (task completion/failure/input needed/progress).

Event ingress for v1 uses Claude Code hook outputs with a small parser layer:
- `Notification`-relevant hook payloads are read from Claude Code event output streams.
- Payloads are normalized into `AgentEvent` records.
- Unknown event shapes are ignored with debug logging.
- Missing required fields (e.g., `taskId` for task events) cause drop + warning (non-fatal).

### 5.2 Rule Engine
Evaluates whether to notify based on:
- event-type enablement
- foreground/background policy
- throttle/quiet-hours policy

### 5.3 Notification Layer
Windows implementation prioritizes taskbar attention behavior (flash/highlight). Optional toast fallback remains configurable.

Feasibility/host notes for taskbar attention:
- Works best when terminal host has a taskbar-visible top-level window.
- Behavior may differ across hosts (Windows Terminal, PowerShell console host, VS Code integrated terminal).
- VS Code integrated terminal may not expose per-terminal taskbar signaling; in that case, fallback toast is the reliable path.

### 5.4 Config Resolver
Merges config with strict precedence:
1. CLI args (highest)
2. plugin config file
3. `settings.json`
4. defaults (lowest)

Merge semantics:
- Scalar/boolean fields: higher-precedence value fully overrides lower.
- Object fields: deep-merge by key.
- Arrays (if introduced later): replace, not concatenate.
- Invalid value type: ignore invalid value, keep next valid lower-precedence value, emit one warning per key.

### 5.5 Platform Adapter
Define adapter interface now; implement only Windows adapter in v1.

## 6. Data Contracts

### 6.1 Notification Config
```ts
export type NotifyConfig = {
  enabled: boolean;
  channels: {
    taskbarFlash: boolean;
    toast: boolean;
  };
  events: {
    taskCompleted: boolean;
    taskFailed: boolean;
    needsInput: boolean;
    progressUpdate: boolean;
  };
  behavior: {
    notifyWhenTerminalFocused: boolean;
    throttleMs: number;
    quietHours?: { start: string; end: string };
  };
};
```

### 6.2 Event Model
```ts
export type AgentEvent =
  | { type: "taskCompleted"; taskId: string; title?: string; at: string }
  | { type: "taskFailed"; taskId: string; reason?: string; at: string }
  | { type: "needsInput"; prompt: string; at: string }
  | { type: "progressUpdate"; taskId: string; message: string; at: string };
```

## 7. Runtime Flow
1. Receive event.
2. Resolve effective config.
3. Evaluate rules (enabled event + focus policy + throttle + quiet-hours).
4. Dispatch to Windows adapter.
5. On adapter failure, log and optionally fall back to toast.

## 8. Error Handling
- Notification failures are non-fatal and must not block Claude Code main flow.
- Invalid config values fall back to defaults with single warning emission.
- If taskbar flash fails and toast is enabled, attempt toast fallback.
- High-frequency progress events are throttled.

## 9. Testing Strategy

### 9.1 Unit Tests
- Config merge precedence.
- Event switch evaluation.
- Focus-policy logic.
- Throttle and quiet-hours behavior.

### 9.2 Integration Tests
- Simulated event stream verifies adapter invocation decisions and counts.

### 9.3 Manual Windows Acceptance
Host matrix to validate:
- Windows Terminal
- PowerShell console host
- VS Code integrated terminal

Checks:
- Background terminal event triggers taskbar highlight on hosts that support taskbar signaling.
- Foreground behavior follows config switch.
- CLI/config/settings precedence is observable and correct.
- On host/path where taskbar highlight is unavailable, toast fallback triggers when enabled.

## 10. Acceptance Criteria
- Windows notification pipeline implemented and operable.
- For enabled event types, notification attempt begins within $<2\,s$ of event ingestion under normal local load.
- Taskbar flash behavior available and configurable where host supports taskbar signaling.
- If host does not support taskbar signaling, toast fallback works when enabled.
- Event switches are user-configurable.
- Foreground/background notify policy is user-configurable.
- All three config entry points supported with defined precedence and merge semantics.
- Core unit and integration tests pass.
- Manual Windows checks pass on supported host matrix.

## 11. Risks
- Terminal/taskbar attention behavior may vary by terminal host and Windows policy.
- Foreground detection may be environment-dependent and needs robust fallback behavior.

## 12. Scope Fitness Check
This scope is suitable for a single implementation plan and does not require decomposition into multiple independent specs.

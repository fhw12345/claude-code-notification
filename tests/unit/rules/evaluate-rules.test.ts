import { describe, expect, it } from "vitest";
import { evaluateRules, type RuleDecision } from "../../../src/rules/evaluateRules";
import { createThrottleState } from "../../../src/rules/throttleState";
import type { NotifyConfig } from "../../../src/contracts/config";
import type { AgentEvent } from "../../../src/contracts/events";

const baseConfig: NotifyConfig = {
  enabled: true,
  channels: {
    taskbarFlash: true,
    toast: true
  },
  events: {
    taskCompleted: true,
    taskFailed: true,
    needsInput: true,
    progressUpdate: true
  },
  behavior: {
    notifyWhenTerminalFocused: false,
    throttleMs: 5000,
    quietHours: {
      start: "22:00",
      end: "08:00"
    }
  }
};

const taskCompletedEvent: AgentEvent = {
  type: "taskCompleted",
  taskId: "t1",
  at: "2026-04-11T10:00:00Z"
};

const progressEvent: AgentEvent = {
  type: "progressUpdate",
  taskId: "t1",
  message: "working",
  at: "2026-04-11T10:00:00Z"
};

describe("evaluateRules", () => {
  it("suppresses notification when globally disabled", () => {
    const decision: RuleDecision = evaluateRules(
      taskCompletedEvent,
      { ...baseConfig, enabled: false },
      { isFocused: false, nowMs: 1000 },
      createThrottleState()
    );

    expect(decision).toEqual({ notify: false, reason: "disabled" });
  });

  it("suppresses notification when event toggle is disabled", () => {
    const decision = evaluateRules(
      taskCompletedEvent,
      {
        ...baseConfig,
        events: { ...baseConfig.events, taskCompleted: false }
      },
      { isFocused: false, nowMs: 1000 },
      createThrottleState()
    );

    expect(decision).toEqual({ notify: false, reason: "eventDisabled" });
  });

  it("suppresses notification when terminal is focused and focused notifications are disabled", () => {
    const decision = evaluateRules(
      taskCompletedEvent,
      baseConfig,
      { isFocused: true, nowMs: 1000 },
      createThrottleState()
    );

    expect(decision).toEqual({ notify: false, reason: "focusedSuppressed" });
  });

  it("suppresses notification during quiet hours", () => {
    const decision = evaluateRules(
      taskCompletedEvent,
      baseConfig,
      { isFocused: false, nowMs: Date.UTC(2026, 3, 11, 22, 30, 0, 0) },
      createThrottleState()
    );

    expect(decision).toEqual({ notify: false, reason: "quietHours" });
  });

  it("suppresses high-frequency progress updates using throttle state", () => {
    const state = createThrottleState();

    const first = evaluateRules(
      progressEvent,
      baseConfig,
      { isFocused: false, nowMs: Date.UTC(2026, 3, 11, 12, 0, 0, 0) },
      state
    );
    const second = evaluateRules(
      progressEvent,
      baseConfig,
      { isFocused: false, nowMs: Date.UTC(2026, 3, 11, 12, 0, 1, 0) },
      state
    );

    expect(first).toEqual({ notify: true, reason: "allowed" });
    expect(second).toEqual({ notify: false, reason: "throttled" });
  });

  it("allows notification when all checks pass", () => {
    const decision = evaluateRules(
      taskCompletedEvent,
      baseConfig,
      { isFocused: false, nowMs: Date.UTC(2026, 3, 11, 12, 0, 0, 0) },
      createThrottleState()
    );

    expect(decision).toEqual({ notify: true, reason: "allowed" });
  });
});

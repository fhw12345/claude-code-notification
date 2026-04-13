import type { NotifyConfig } from "../contracts/config";
import type { AgentEvent } from "../contracts/events";
import type { ThrottleState } from "./throttleState";

export type RuleDecision = { notify: boolean; reason: string };

export type RuleContext = {
  isFocused: boolean;
  nowMs: number;
};

function isEventEnabled(event: AgentEvent, config: NotifyConfig): boolean {
  switch (event.type) {
    case "taskCompleted":
      return config.events.taskCompleted;
    case "taskFailed":
      return config.events.taskFailed;
    case "needsInput":
      return config.events.needsInput;
    case "progressUpdate":
      return config.events.progressUpdate;
    case "notification":
      return config.events.notification;
    default:
      return false;
  }
}

function parseTimeToMinutes(value: string): number | undefined {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return undefined;
  }

  return hours * 60 + minutes;
}

function isInQuietHours(nowMs: number, quietHours: NotifyConfig["behavior"]["quietHours"]): boolean {
  if (!quietHours) {
    return false;
  }

  const start = parseTimeToMinutes(quietHours.start);
  const end = parseTimeToMinutes(quietHours.end);
  if (start === undefined || end === undefined) {
    return false;
  }

  const now = new Date(nowMs);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (start === end) {
    return true;
  }

  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }

  return nowMinutes >= start || nowMinutes < end;
}

export function evaluateRules(
  event: AgentEvent,
  config: NotifyConfig,
  context: RuleContext,
  throttleState: ThrottleState
): RuleDecision {
  if (!config.enabled) {
    return { notify: false, reason: "disabled" };
  }

  if (!isEventEnabled(event, config)) {
    return { notify: false, reason: "eventDisabled" };
  }

  if (context.isFocused && !config.behavior.notifyWhenTerminalFocused) {
    return { notify: false, reason: "focusedSuppressed" };
  }

  if (isInQuietHours(context.nowMs, config.behavior.quietHours)) {
    return { notify: false, reason: "quietHours" };
  }

  if (event.type === "progressUpdate" && throttleState.shouldThrottle(event, context.nowMs, config.behavior.throttleMs)) {
    return { notify: false, reason: "throttled" };
  }

  return { notify: true, reason: "allowed" };
}

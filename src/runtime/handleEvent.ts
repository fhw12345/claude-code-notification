import { normalizeHookEvent } from "../events/normalizeHookEvent";
import type { NotifyConfig } from "../contracts/config";
import type { NotificationAdapter, NotifyOutcome } from "../platform/NotificationAdapter";
import { evaluateRules } from "../rules/evaluateRules";
import type { ThrottleState } from "../rules/throttleState";
import type { FocusDetector } from "./focusDetector";

type HookPayload = {
  kind?: unknown;
  taskId?: unknown;
  title?: unknown;
  reason?: unknown;
  prompt?: unknown;
  message?: unknown;
  at?: unknown;
};

export type HandleEventResult = {
  delivered: boolean;
  reason: string;
  outcome?: NotifyOutcome;
};

export type CreateHandleEventInput = {
  config: NotifyConfig;
  adapter: NotificationAdapter;
  focusDetector: FocusDetector;
  throttleState: ThrottleState;
  now: () => number;
  warn: (message: string) => void;
};

export function createHandleEvent(input: CreateHandleEventInput) {
  return async function handleEvent(payload: HookPayload): Promise<HandleEventResult> {
    const event = normalizeHookEvent(payload, { warn: input.warn });
    if (!event) {
      return { delivered: false, reason: "invalidEvent" };
    }

    const decision = evaluateRules(
      event,
      input.config,
      { isFocused: input.focusDetector.isFocused(), nowMs: input.now() },
      input.throttleState
    );

    if (!decision.notify) {
      return { delivered: false, reason: decision.reason };
    }

    try {
      const outcome = await input.adapter.notify(event, input.config);
      if (!outcome.ok) {
        return { delivered: false, reason: outcome.reason ?? "notifyFailed", outcome };
      }

      return { delivered: true, reason: decision.reason, outcome };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.warn(`adapter.notify threw: ${message}`);
      return { delivered: false, reason: "notifyException" };
    }
  };
}

import type { AgentEvent } from "../contracts/events";

type ThrottleStateData = {
  lastNotifiedAtByKey: Map<string, number>;
};

export type ThrottleState = {
  shouldThrottle(event: AgentEvent, nowMs: number, throttleMs: number): boolean;
};

function toThrottleKey(event: AgentEvent): string {
  return `${event.type}:${"taskId" in event ? event.taskId : "global"}`;
}

export function createThrottleState(): ThrottleState {
  const state: ThrottleStateData = {
    lastNotifiedAtByKey: new Map()
  };

  return {
    shouldThrottle(event, nowMs, throttleMs) {
      if (throttleMs <= 0) {
        return false;
      }

      const key = toThrottleKey(event);
      const lastNotifiedAt = state.lastNotifiedAtByKey.get(key);

      if (lastNotifiedAt !== undefined && nowMs - lastNotifiedAt < throttleMs) {
        return true;
      }

      state.lastNotifiedAtByKey.set(key, nowMs);
      return false;
    }
  };
}

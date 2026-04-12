import type { AgentEvent } from "../contracts/events";
import { normalizeHookEvent, type HookEventNormalizeLogger } from "./normalizeHookEvent";

export type EventSource = {
  fromHookPayload: (payload: unknown) => AgentEvent | undefined;
};

export function createEventSource(logger: HookEventNormalizeLogger = {}): EventSource {
  return {
    fromHookPayload(payload: unknown): AgentEvent | undefined {
      if (!isObject(payload)) {
        logger.warn?.("invalid hook event payload: expected object");
        return undefined;
      }

      return normalizeHookEvent(payload, logger);
    }
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

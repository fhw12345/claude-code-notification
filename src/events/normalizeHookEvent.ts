import type { AgentEvent } from "../contracts/events";

type HookEventKind = "task_completed" | "task_failed" | "needs_input" | "progress_update";

type HookPayload = {
  kind?: unknown;
  taskId?: unknown;
  title?: unknown;
  reason?: unknown;
  prompt?: unknown;
  message?: unknown;
  at?: unknown;
  hook_event_name?: unknown;
  notification_type?: unknown;
};

export type HookEventNormalizeLogger = {
  debug?: (message: string) => void;
  warn?: (message: string) => void;
};

export function normalizeHookEvent(payload: HookPayload, logger: HookEventNormalizeLogger = {}): AgentEvent | undefined {
  // Claude Code Notification hook payload: { hook_event_name: "Notification", notification_type: "...", message: "..." }
  if (typeof payload.hook_event_name === "string" && payload.hook_event_name === "Notification") {
    if (!isString(payload.notification_type) || !isString(payload.message)) {
      logger.warn?.("invalid Notification hook payload: missing notification_type or message");
      return undefined;
    }

    return {
      type: "notification",
      notificationType: payload.notification_type,
      message: payload.message,
      title: isString(payload.title) ? payload.title : undefined
    };
  }

  const kind = typeof payload.kind === "string" ? payload.kind : undefined;

  if (!kind) {
    logger.warn?.("invalid hook event payload: missing kind");
    return undefined;
  }

  if (!isKnownKind(kind)) {
    logger.debug?.(`unknown hook event kind: ${kind}`);
    return undefined;
  }

  switch (kind) {
    case "task_completed": {
      if (!isString(payload.taskId) || !isString(payload.at)) {
        logger.warn?.("invalid hook event payload for kind: task_completed");
        return undefined;
      }

      return {
        type: "taskCompleted",
        taskId: payload.taskId,
        title: isString(payload.title) ? payload.title : undefined,
        at: payload.at
      };
    }
    case "task_failed": {
      if (!isString(payload.taskId) || !isString(payload.at)) {
        logger.warn?.("invalid hook event payload for kind: task_failed");
        return undefined;
      }

      return {
        type: "taskFailed",
        taskId: payload.taskId,
        reason: isString(payload.reason) ? payload.reason : undefined,
        at: payload.at
      };
    }
    case "needs_input": {
      if (!isString(payload.prompt) || !isString(payload.at)) {
        logger.warn?.("invalid hook event payload for kind: needs_input");
        return undefined;
      }

      return {
        type: "needsInput",
        prompt: payload.prompt,
        at: payload.at
      };
    }
    case "progress_update": {
      if (!isString(payload.taskId) || !isString(payload.message) || !isString(payload.at)) {
        logger.warn?.("invalid hook event payload for kind: progress_update");
        return undefined;
      }

      return {
        type: "progressUpdate",
        taskId: payload.taskId,
        message: payload.message,
        at: payload.at
      };
    }
  }
}

function isKnownKind(kind: string): kind is HookEventKind {
  return kind === "task_completed" || kind === "task_failed" || kind === "needs_input" || kind === "progress_update";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

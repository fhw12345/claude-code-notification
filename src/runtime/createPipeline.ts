import { defaultNotifyConfig } from "../config/defaults";
import { resolveConfig } from "../config/resolveConfig";
import type { NotifyConfig } from "../contracts/config";
import type { NotificationAdapter } from "../platform/NotificationAdapter";
import { createThrottleState } from "../rules/throttleState";
import { createFocusDetector, type FocusDetector } from "./focusDetector";
import { createHandleEvent } from "./handleEvent";

type HookPayload = {
  kind?: unknown;
  taskId?: unknown;
  title?: unknown;
  reason?: unknown;
  prompt?: unknown;
  message?: unknown;
  at?: unknown;
};

export type NotificationPipeline = {
  handleEvent(payload: HookPayload): Promise<{ delivered: boolean; reason: string }>;
};

export type CreateNotificationPipelineInput = {
  adapter: NotificationAdapter;
  defaults?: NotifyConfig;
  settings?: Partial<NotifyConfig>;
  plugin?: Partial<NotifyConfig>;
  cli?: Partial<NotifyConfig>;
  focusDetector?: FocusDetector;
  now?: () => number;
  warn?: (message: string) => void;
};

export function createNotificationPipeline(input: CreateNotificationPipelineInput): NotificationPipeline {
  const warn = input.warn ?? (() => {});
  const resolved = resolveConfig(
    {
      defaults: input.defaults ?? defaultNotifyConfig,
      settings: input.settings,
      plugin: input.plugin,
      cli: input.cli
    },
    warn
  );

  const handleEvent = createHandleEvent({
    config: resolved.config,
    adapter: input.adapter,
    focusDetector: input.focusDetector ?? createFocusDetector(),
    throttleState: createThrottleState(),
    now: input.now ?? (() => Date.now()),
    warn
  });

  return {
    handleEvent
  };
}

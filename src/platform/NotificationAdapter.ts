import type { NotifyConfig } from "../contracts/config";
import type { AgentEvent } from "../contracts/events";

export type NotifyOutcome = {
  ok: boolean;
  channel: "taskbar" | "toast" | "none";
  reason?: string;
};

export interface NotificationAdapter {
  notify(event: AgentEvent, config: NotifyConfig): Promise<NotifyOutcome>;
}

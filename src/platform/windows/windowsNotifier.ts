import type { NotifyConfig } from "../../contracts/config";
import type { AgentEvent } from "../../contracts/events";
import type { NotificationAdapter, NotifyOutcome } from "../NotificationAdapter";
import { flashTaskbar } from "./taskbarFlash";

type WindowsNotifierDeps = {
  flash: (event: AgentEvent) => Promise<void>;
};

const defaultDeps: WindowsNotifierDeps = {
  flash: flashTaskbar
};

export function createWindowsNotifier(
  deps: WindowsNotifierDeps = defaultDeps
): NotificationAdapter {
  return {
    async notify(event: AgentEvent, config: NotifyConfig): Promise<NotifyOutcome> {
      if (!config.enabled) {
        return {
          ok: false,
          channel: "none",
          reason: "disabled"
        };
      }

      if (config.channels.taskbarFlash) {
        try {
          await deps.flash(event);
          return {
            ok: true,
            channel: "taskbar"
          };
        } catch {
          return {
            ok: false,
            channel: "none",
            reason: "taskbar_flash_failed"
          };
        }
      }

      return {
        ok: false,
        channel: "none",
        reason: "no_channels_enabled"
      };
    }
  };
}

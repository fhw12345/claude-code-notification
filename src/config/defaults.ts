import type { NotifyConfig } from "../contracts/config";

export const defaultNotifyConfig: NotifyConfig = {
  enabled: true,
  channels: {
    taskbarFlash: true,
    toast: false
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

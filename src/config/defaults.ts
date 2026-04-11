import type { NotifyConfig } from "../contracts/config";

export const defaultNotifyConfig: NotifyConfig = {
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
  }
};

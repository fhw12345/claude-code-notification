export type NotifyConfig = {
  enabled: boolean;
  channels: {
    taskbarFlash: boolean;
    toast: boolean;
  };
  events: {
    taskCompleted: boolean;
    taskFailed: boolean;
    needsInput: boolean;
    progressUpdate: boolean;
    notification: boolean;
  };
  behavior: {
    notifyWhenTerminalFocused: boolean;
    throttleMs: number;
    quietHours?: {
      start: string;
      end: string;
    };
  };
};

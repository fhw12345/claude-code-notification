import { expect, it } from "vitest";
import { defaultNotifyConfig } from "../../../src/config/defaults";
import type { NotifyConfig } from "../../../src/contracts/config";

it("has required default fields", () => {
  expect(defaultNotifyConfig.enabled).toBe(true);
  expect(defaultNotifyConfig.channels.taskbarFlash).toBe(true);
  expect(defaultNotifyConfig.channels.toast).toBe(false);
  expect(defaultNotifyConfig.events.taskCompleted).toBe(true);
  expect(defaultNotifyConfig.behavior.notifyWhenTerminalFocused).toBe(false);
  expect(defaultNotifyConfig.behavior.throttleMs).toBe(5000);
  expect(defaultNotifyConfig.behavior.quietHours).toEqual({
    start: "22:00",
    end: "08:00"
  });
});

it("matches the notify config contract shape", () => {
  const config: NotifyConfig = defaultNotifyConfig;

  expect(config.behavior).toEqual({
    notifyWhenTerminalFocused: false,
    throttleMs: 5000,
    quietHours: {
      start: "22:00",
      end: "08:00"
    }
  });
});


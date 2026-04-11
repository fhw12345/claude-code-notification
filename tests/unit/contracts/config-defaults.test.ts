import { expect, it } from "vitest";
import { defaultNotifyConfig } from "../../../src/config/defaults";

it("has required default fields", () => {
  expect(defaultNotifyConfig.enabled).toBe(true);
  expect(defaultNotifyConfig.channels.taskbarFlash).toBe(true);
  expect(defaultNotifyConfig.events.taskCompleted).toBe(true);
});

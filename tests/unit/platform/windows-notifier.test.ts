import { describe, expect, it, vi } from "vitest";
import type { NotifyConfig } from "../../../src/contracts/config";
import type { AgentEvent } from "../../../src/contracts/events";
import { createWindowsNotifier } from "../../../src/platform/windows/windowsNotifier";

const baseConfig: NotifyConfig = {
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
  },
  behavior: {
    notifyWhenTerminalFocused: false,
    throttleMs: 5000
  }
};

const event: AgentEvent = {
  type: "taskCompleted",
  taskId: "task-1",
  at: "2026-04-11T10:00:00Z"
};

describe("createWindowsNotifier", () => {
  it("falls back to toast when taskbar flash fails and toast is enabled", async () => {
    const flash = vi.fn().mockRejectedValue(new Error("flash failed"));
    const toast = vi.fn().mockResolvedValue(undefined);
    const notifier = createWindowsNotifier({ flash, toast });

    const result = await notifier.notify(event, baseConfig);

    expect(result.ok).toBe(true);
    expect(result.channel).toBe("toast");
    expect(flash).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("returns failure outcome without throwing when all channels fail", async () => {
    const flash = vi.fn().mockRejectedValue(new Error("flash failed"));
    const toast = vi.fn().mockRejectedValue(new Error("toast failed"));
    const notifier = createWindowsNotifier({ flash, toast });

    const result = await notifier.notify(event, baseConfig);

    expect(result.ok).toBe(false);
    expect(result.channel).toBe("none");
    expect(result.reason).toBe("all_channels_failed");
    expect(flash).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("does not use toast fallback when toast channel is disabled", async () => {
    const flash = vi.fn().mockRejectedValue(new Error("flash failed"));
    const toast = vi.fn().mockResolvedValue(undefined);
    const notifier = createWindowsNotifier({ flash, toast });

    const result = await notifier.notify(event, {
      ...baseConfig,
      channels: {
        ...baseConfig.channels,
        toast: false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("taskbar_flash_failed");
    expect(flash).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });
});

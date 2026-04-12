import { describe, expect, it } from "vitest";
import { createNotificationPipeline } from "../../src/index";
import type { NotifyConfig } from "../../src/contracts/config";
import type { AgentEvent } from "../../src/contracts/events";
import type { NotificationAdapter, NotifyOutcome } from "../../src/platform/NotificationAdapter";

class RecordingAdapter implements NotificationAdapter {
  public calls: Array<{ event: AgentEvent; config: NotifyConfig }> = [];

  async notify(event: AgentEvent, config: NotifyConfig): Promise<NotifyOutcome> {
    this.calls.push({ event, config });
    return { ok: true, channel: "toast" };
  }
}

class ThrowingAdapter implements NotificationAdapter {
  async notify(): Promise<NotifyOutcome> {
    throw new Error("adapter exploded");
  }
}

describe("notification pipeline integration", () => {
  it("composes normalize -> resolveConfig -> evaluateRules -> adapter.notify", async () => {
    const adapter = new RecordingAdapter();
    const warnings: string[] = [];

    const pipeline = createNotificationPipeline({
      adapter,
      defaults: {
        enabled: true,
        channels: { taskbarFlash: true, toast: true },
        events: {
          taskCompleted: false,
          taskFailed: true,
          needsInput: true,
          progressUpdate: true
        },
        behavior: {
          notifyWhenTerminalFocused: false,
          throttleMs: 5000,
          quietHours: { start: "22:00", end: "08:00" }
        }
      },
      settings: {
        events: {
          taskCompleted: true,
          taskFailed: true,
          needsInput: true,
          progressUpdate: true
        }
      },
      focusDetector: {
        isFocused: () => false
      },
      now: () => Date.UTC(2026, 3, 11, 12, 0, 0, 0),
      warn: (message) => warnings.push(message)
    });

    const outcome = await pipeline.handleEvent({
      kind: "task_completed",
      taskId: "task-1",
      at: "2026-04-11T12:00:00Z"
    });

    expect(outcome.delivered).toBe(true);
    expect(outcome.reason).toBe("allowed");
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.event).toEqual({
      type: "taskCompleted",
      taskId: "task-1",
      at: "2026-04-11T12:00:00Z"
    });
    expect(adapter.calls[0]?.config.events.taskCompleted).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("treats adapter.notify throw as non-fatal", async () => {
    const warnings: string[] = [];

    const pipeline = createNotificationPipeline({
      adapter: new ThrowingAdapter(),
      defaults: {
        enabled: true,
        channels: { taskbarFlash: true, toast: true },
        events: {
          taskCompleted: false,
          taskFailed: true,
          needsInput: true,
          progressUpdate: true
        },
        behavior: {
          notifyWhenTerminalFocused: false,
          throttleMs: 5000,
          quietHours: { start: "22:00", end: "08:00" }
        }
      },
      settings: {
        events: {
          taskCompleted: true,
          taskFailed: true,
          needsInput: true,
          progressUpdate: true
        }
      },
      focusDetector: {
        isFocused: () => false
      },
      now: () => Date.UTC(2026, 3, 11, 12, 0, 0, 0),
      warn: (message) => warnings.push(message)
    });

    const outcome = await pipeline.handleEvent({
      kind: "task_completed",
      taskId: "task-2",
      at: "2026-04-11T12:00:00Z"
    });

    expect(outcome).toEqual({ delivered: false, reason: "notifyException" });
    expect(warnings).toEqual(["adapter.notify threw: adapter exploded"]);
  });
});

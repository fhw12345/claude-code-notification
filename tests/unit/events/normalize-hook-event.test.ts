import { describe, expect, it, vi } from "vitest";
import { normalizeHookEvent } from "../../../src/events/normalizeHookEvent";
import { createEventSource } from "../../../src/events/eventSource";

describe("normalizeHookEvent", () => {
  it("maps task_completed payload to taskCompleted event", () => {
    const event = normalizeHookEvent({ kind: "task_completed", taskId: "t1", at: "2026-04-11T10:00:00Z" });

    expect(event).toEqual({ type: "taskCompleted", taskId: "t1", at: "2026-04-11T10:00:00Z" });
  });

  it("drops unknown kind and emits debug log", () => {
    const debug = vi.fn();

    const event = normalizeHookEvent({ kind: "unknown_kind" }, { debug });

    expect(event).toBeUndefined();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith("unknown hook event kind: unknown_kind");
  });

  it("drops payload with missing required fields and emits warning", () => {
    const warn = vi.fn();

    const event = normalizeHookEvent({ kind: "task_failed", at: "2026-04-11T10:00:00Z" }, { warn });

    expect(event).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("invalid hook event payload for kind: task_failed");
  });
});

describe("createEventSource", () => {
  it("normalizes raw payloads through the event source wrapper", () => {
    const source = createEventSource();

    const event = source.fromHookPayload({
      kind: "progress_update",
      taskId: "t1",
      message: "working",
      at: "2026-04-11T10:00:00Z"
    });

    expect(event).toEqual({
      type: "progressUpdate",
      taskId: "t1",
      message: "working",
      at: "2026-04-11T10:00:00Z"
    });
  });
});

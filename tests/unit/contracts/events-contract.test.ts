import { expectTypeOf, it } from "vitest";
import type { AgentEvent } from "../../../src/contracts/events";

it("defines the supported agent event variants", () => {
  expectTypeOf<AgentEvent>().toEqualTypeOf<
    | { type: "taskCompleted"; taskId: string; title?: string; at: string }
    | { type: "taskFailed"; taskId: string; reason?: string; at: string }
    | { type: "needsInput"; prompt: string; at: string }
    | { type: "progressUpdate"; taskId: string; message: string; at: string }
  >();
});

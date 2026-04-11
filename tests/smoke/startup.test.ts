import { describe, it, expect } from "vitest";
import { createNotificationPipeline } from "../../src/index";

describe("startup", () => {
  it("exports createNotificationPipeline", () => {
    expect(typeof createNotificationPipeline).toBe("function");
  });
});

import { describe, expect, it, vi } from "vitest";
import { defaultNotifyConfig } from "../../../src/config/defaults";
import { resolveCliConfig } from "../../../src/cli";

describe("resolveCliConfig", () => {
  it("CLI flags override plugin and settings values", () => {
    const warn = vi.fn();

    const result = resolveCliConfig({
      args: ["--notify-event-task-failed=false"],
      defaults: defaultNotifyConfig,
      settings: {
        events: {
          taskFailed: true
        }
      },
      plugin: {
        events: {
          taskFailed: true
        }
      },
      warn
    });

    expect(result.config.events.taskFailed).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns parse warnings for invalid cli values", () => {
    const warn = vi.fn();

    const result = resolveCliConfig({
      args: ["--notify-enabled=maybe"],
      defaults: defaultNotifyConfig,
      warn
    });

    expect(result.config.enabled).toBe(true);
    expect(result.warnings).toEqual(["invalid boolean for --notify-enabled: maybe"]);
    expect(warn).toHaveBeenCalledWith("invalid boolean for --notify-enabled: maybe");
  });
});

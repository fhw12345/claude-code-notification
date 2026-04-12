import { describe, expect, it, vi } from "vitest";
import { defaultNotifyConfig } from "../../../src/config/defaults";
import { isDirectCliExecution, resolveCliConfig, runCli } from "../../../src/cli";

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

describe("runCli", () => {
  it("resolves config and starts listener with resolved config", () => {
    const warn = vi.fn();
    const startListener = vi.fn();

    const result = runCli(
      ["node", "cli", "--notify-event-task-failed=false"],
      {
        warn,
        startListener
      }
    );

    expect(result.config.events.taskFailed).toBe(false);
    expect(startListener).toHaveBeenCalledTimes(1);
    expect(startListener).toHaveBeenCalledWith(result.config);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isDirectCliExecution", () => {
  it("returns false when argv entrypoint is missing", () => {
    expect(isDirectCliExecution("file:///repo/src/cli.ts", undefined)).toBe(false);
  });

  it("matches module URL against normalized entrypoint file URL", () => {
    expect(isDirectCliExecution("file:///D:/repo/cc-plugin/src/cli.ts", "D:\\repo\\cc-plugin\\src\\cli.ts")).toBe(true);
  });

  it("returns false when module URL does not match normalized entrypoint", () => {
    expect(isDirectCliExecution("file:///D:/repo/cc-plugin/src/other.ts", "D:\\repo\\cc-plugin\\src\\cli.ts")).toBe(false);
  });
});

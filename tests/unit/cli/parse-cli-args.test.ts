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

  it("--notify-behavior-quiet-hours=off disables quiet hours", () => {
    const result = resolveCliConfig({
      args: ["--notify-behavior-quiet-hours=off"],
      defaults: defaultNotifyConfig
    });

    expect(result.config.behavior.quietHours).toBeUndefined();
  });

  it("--notify-behavior-quiet-hours=HH:MM-HH:MM sets quiet hours", () => {
    const result = resolveCliConfig({
      args: ["--notify-behavior-quiet-hours=23:00-07:00"],
      defaults: defaultNotifyConfig
    });

    expect(result.config.behavior.quietHours).toEqual({ start: "23:00", end: "07:00" });
  });

  it("--notify-behavior-quiet-hours warns on invalid format", () => {
    const warn = vi.fn();

    const result = resolveCliConfig({
      args: ["--notify-behavior-quiet-hours=banana"],
      defaults: defaultNotifyConfig,
      warn
    });

    expect(result.config.behavior.quietHours).toEqual(defaultNotifyConfig.behavior.quietHours);
    expect(result.warnings).toEqual([
      'invalid value for --notify-behavior-quiet-hours: banana (use "HH:MM-HH:MM" or "off")'
    ]);
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

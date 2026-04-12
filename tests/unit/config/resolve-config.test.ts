import { describe, expect, it, vi } from "vitest";
import { defaultNotifyConfig } from "../../../src/config/defaults";
import { resolveConfig } from "../../../src/config/resolveConfig";

describe("resolveConfig", () => {
  it("applies precedence CLI > plugin > settings > defaults", () => {
    const resolved = resolveConfig({
      defaults: {
        ...defaultNotifyConfig,
        enabled: true
      },
      settings: {
        enabled: false
      },
      plugin: {
        enabled: true
      },
      cli: {
        enabled: false
      }
    });

    expect(resolved.config.enabled).toBe(false);
  });

  it("overrides scalar values from higher-precedence layers", () => {
    const resolved = resolveConfig({
      defaults: {
        ...defaultNotifyConfig,
        behavior: {
          ...defaultNotifyConfig.behavior,
          throttleMs: 5000
        }
      },
      settings: {
        behavior: {
          throttleMs: 1200
        }
      },
      plugin: {},
      cli: {}
    });

    expect(resolved.config.behavior.throttleMs).toBe(1200);
  });

  it("deep-merges objects across layers", () => {
    const resolved = resolveConfig({
      defaults: defaultNotifyConfig,
      settings: {
        events: {
          taskFailed: false
        }
      },
      plugin: {
        events: {
          needsInput: false
        }
      },
      cli: {}
    });

    expect(resolved.config.events.taskCompleted).toBe(true);
    expect(resolved.config.events.taskFailed).toBe(false);
    expect(resolved.config.events.needsInput).toBe(false);
    expect(resolved.config.events.progressUpdate).toBe(true);
  });

  it("replaces arrays instead of deep-merging them", () => {
    const resolved = resolveConfig({
      defaults: {
        ...defaultNotifyConfig,
        behavior: {
          ...defaultNotifyConfig.behavior,
          quietHours: {
            start: "22:00",
            end: "08:00"
          }
        },
        channels: {
          ...defaultNotifyConfig.channels,
          extra: ["taskbar"]
        } as typeof defaultNotifyConfig.channels & { extra: string[] }
      } as typeof defaultNotifyConfig & {
        channels: typeof defaultNotifyConfig.channels & { extra: string[] };
      },
      settings: {
        channels: {
          extra: ["toast", "taskbar"]
        } as { extra: string[] }
      },
      plugin: {
        channels: {
          extra: ["toast"]
        } as { extra: string[] }
      },
      cli: {}
    });

    expect((resolved.config as { channels: { extra: string[] } }).channels.extra).toEqual(["toast"]);
  });

  it("ignores invalid type overrides and warns once per key even across different invalid types", () => {
    const warn = vi.fn();

    const resolved = resolveConfig({
      defaults: defaultNotifyConfig,
      settings: {
        behavior: {
          throttleMs: "fast"
        } as unknown as { throttleMs: number }
      },
      plugin: {
        behavior: {
          throttleMs: false
        } as unknown as { throttleMs: number }
      },
      cli: {}
    }, warn);

    expect(resolved.config.behavior.throttleMs).toBe(defaultNotifyConfig.behavior.throttleMs);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("behavior.throttleMs");
  });
});

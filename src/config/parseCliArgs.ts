import type { NotifyConfig } from "../contracts/config";

export type ParseResult = {
  value?: Partial<NotifyConfig>;
  warnings: string[];
};

export function parseCliArgs(args: string[]): ParseResult {
  const value: Partial<NotifyConfig> = {};
  const warnings: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [flag, rawValue] = arg.split("=", 2);

    if (rawValue === undefined) {
      continue;
    }

    if (flag === "--notify-enabled") {
      const parsed = parseBoolean(rawValue);
      if (parsed === undefined) {
        warnings.push(`invalid boolean for --notify-enabled: ${rawValue}`);
      } else {
        value.enabled = parsed;
      }
      continue;
    }

    if (flag === "--notify-channel-taskbar-flash") {
      const parsed = parseBoolean(rawValue);
      if (parsed === undefined) {
        warnings.push(`invalid boolean for --notify-channel-taskbar-flash: ${rawValue}`);
      } else {
        value.channels = {
          ...(value.channels ?? {}),
          taskbarFlash: parsed
        };
      }
      continue;
    }

    if (flag === "--notify-event-task-failed") {
      const parsed = parseBoolean(rawValue);
      if (parsed === undefined) {
        warnings.push(`invalid boolean for --notify-event-task-failed: ${rawValue}`);
      } else {
        value.events = {
          ...(value.events ?? {}),
          taskFailed: parsed
        };
      }
      continue;
    }

    if (flag === "--notify-behavior-throttle-ms") {
      const parsed = parseNumber(rawValue);
      if (parsed === undefined) {
        warnings.push(`invalid number for --notify-behavior-throttle-ms: ${rawValue}`);
      } else {
        value.behavior = {
          ...(value.behavior ?? {}),
          throttleMs: parsed
        };
      }
      continue;
    }

    if (flag === "--notify-behavior-quiet-hours") {
      if (rawValue === "off") {
        value.behavior = {
          ...(value.behavior ?? {}),
          quietHours: null as unknown as undefined
        };
      } else {
        const match = rawValue.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
        if (!match) {
          warnings.push(`invalid value for --notify-behavior-quiet-hours: ${rawValue} (use "HH:MM-HH:MM" or "off")`);
        } else {
          value.behavior = {
            ...(value.behavior ?? {}),
            quietHours: { start: match[1], end: match[2] }
          };
        }
      }
    }
  }

  return { value, warnings };
}

function parseBoolean(rawValue: string): boolean | undefined {
  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  return undefined;
}

function parseNumber(rawValue: string): number | undefined {
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

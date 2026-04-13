import type { WarnOnce } from "./warnOnce";

export function mergeConfig<T>(base: T, override: unknown, warn: WarnOnce = () => {}): T {
  return mergeValue(base, override, "", warn) as T;
}

function mergeValue(base: unknown, override: unknown, path: string, warn: WarnOnce): unknown {
  if (override === undefined) {
    return cloneValue(base);
  }

  if (override === null) {
    return undefined;
  }

  if (Array.isArray(base)) {
    if (!Array.isArray(override)) {
      warnInvalid(path, base, override, warn);
      return cloneValue(base);
    }

    return cloneValue(override);
  }

  if (isObject(base)) {
    if (!isObject(override)) {
      warnInvalid(path, base, override, warn);
      return cloneValue(base);
    }

    const result: Record<string, unknown> = {
      ...cloneValue(base) as Record<string, unknown>
    };

    for (const [key, overrideValue] of Object.entries(override)) {
      const nextPath = path ? `${path}.${key}` : key;
      const baseValue = (base as Record<string, unknown>)[key];

      if (baseValue === undefined) {
        result[key] = cloneValue(overrideValue);
        continue;
      }

      result[key] = mergeValue(baseValue, overrideValue, nextPath, warn);
    }

    return result;
  }

  if (typeof base !== typeof override) {
    warnInvalid(path, base, override, warn);
    return cloneValue(base);
  }

  return cloneValue(override);
}

function warnInvalid(path: string, expected: unknown, actual: unknown, warn: WarnOnce): void {
  const keyPath = path || "<root>";
  warn(keyPath, `ignored invalid override at ${keyPath}: expected ${describeType(expected)} but got ${describeType(actual)}`);
}

function describeType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      result[key] = cloneValue(child);
    }

    return result as T;
  }

  return value;
}

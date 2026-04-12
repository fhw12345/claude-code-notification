#!/usr/bin/env node

import { defaultNotifyConfig } from "./config/defaults";
import { parseCliArgs } from "./config/parseCliArgs";
import { resolveConfig } from "./config/resolveConfig";
import type { NotifyConfig } from "./contracts/config";

export type CliRuntimeDeps = {
  warn: (message: string) => void;
  startListener: (config: NotifyConfig) => void;
};

export type ResolveCliConfigInput = {
  args: string[];
  defaults?: NotifyConfig;
  settings?: Partial<NotifyConfig>;
  plugin?: Partial<NotifyConfig>;
  warn?: (message: string) => void;
};

export type ResolveCliConfigResult = {
  config: NotifyConfig;
  warnings: string[];
};

export function resolveCliConfig(input: ResolveCliConfigInput): ResolveCliConfigResult {
  const parsedCli = parseCliArgs(input.args);
  const warn = input.warn ?? (() => {});

  for (const warning of parsedCli.warnings) {
    warn(warning);
  }

  const resolved = resolveConfig(
    {
      defaults: input.defaults ?? defaultNotifyConfig,
      settings: input.settings,
      plugin: input.plugin,
      cli: parsedCli.value
    },
    warn
  );

  return {
    config: resolved.config,
    warnings: parsedCli.warnings
  };
}

function parseHookPayload(raw: string, warn: (message: string) => void): unknown | undefined {
  if (!raw.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    warn("invalid hook event payload: malformed JSON");
    return undefined;
  }
}

export function startNotificationPipelineListener(
  config: NotifyConfig,
  deps: Pick<CliRuntimeDeps, "warn">
): void {
  const { warn } = deps;

  process.stdin.setEncoding("utf8");

  let buffer = "";
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
  });

  process.stdin.on("end", () => {
    parseHookPayload(buffer, warn);
  });

  process.stdin.resume();

  void config;
}

export function runCli(argv: string[], deps?: Partial<CliRuntimeDeps>): ResolveCliConfigResult {
  const warn = deps?.warn ?? ((message: string) => console.warn(message));
  const resolved = resolveCliConfig({ args: argv.slice(2), warn });

  const startListener = deps?.startListener ?? ((config: NotifyConfig) => startNotificationPipelineListener(config, { warn }));
  startListener(resolved.config);

  return resolved;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv);
}

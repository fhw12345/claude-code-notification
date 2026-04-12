#!/usr/bin/env node

import { defaultNotifyConfig } from "./config/defaults";
import { parseCliArgs } from "./config/parseCliArgs";
import { resolveConfig } from "./config/resolveConfig";
import type { NotifyConfig } from "./contracts/config";

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

export function runCli(argv: string[]): ResolveCliConfigResult {
  return resolveCliConfig({ args: argv.slice(2) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv);
}

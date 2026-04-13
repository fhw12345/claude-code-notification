#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { defaultNotifyConfig } from "./config/defaults";
import { parseCliArgs } from "./config/parseCliArgs";
import { resolveConfig } from "./config/resolveConfig";
import type { NotifyConfig } from "./contracts/config";
import { createWindowsNotifier } from "./platform/windows/windowsNotifier";
import { createNotificationPipeline } from "./runtime/createPipeline";

export type CliRuntimeDeps = {
  warn: (message: string) => void;
  startListener: (config: NotifyConfig) => void;
  handlePayload: (payload: unknown) => Promise<void>;
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
  deps: Pick<CliRuntimeDeps, "warn" | "handlePayload">
): void {
  const { warn, handlePayload } = deps;

  process.stdin.setEncoding("utf8");

  let buffer = "";
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
  });

  process.stdin.on("end", () => {
    const payload = parseHookPayload(buffer, warn);
    if (payload !== undefined) {
      void handlePayload(payload).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        warn(`failed to process hook payload: ${message}`);
      });
    }
  });

  process.stdin.resume();

  void config;
}

export function runCli(argv: string[], deps?: Partial<CliRuntimeDeps>): ResolveCliConfigResult {
  const warn = deps?.warn ?? ((message: string) => console.warn(message));
  const resolved = resolveCliConfig({ args: argv.slice(2), warn });

  const pipeline = createNotificationPipeline({
    adapter: createWindowsNotifier(),
    defaults: defaultNotifyConfig,
    cli: resolved.config,
    warn
  });

  const handlePayload = deps?.handlePayload ?? (async (payload: unknown) => {
    const result = await pipeline.handleEvent(payload as Record<string, unknown>);
    if (process.env.CC_PLUGIN_E2E_OUTPUT === "1") {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  });

  const startListener = deps?.startListener ?? ((config: NotifyConfig) => startNotificationPipelineListener(config, { warn, handlePayload }));
  startListener(resolved.config);

  return resolved;
}

export function isDirectCliExecution(moduleUrl: string, argvEntryPoint: string | undefined): boolean {
  if (!argvEntryPoint) {
    return false;
  }

  return moduleUrl === pathToFileURL(argvEntryPoint).href;
}

if (isDirectCliExecution(import.meta.url, process.argv[1])) {
  runCli(process.argv);
}

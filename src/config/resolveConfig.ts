import type { NotifyConfig } from "../contracts/config";
import { mergeConfig } from "./mergeConfig";
import { createWarnOnce, type Warn } from "./warnOnce";

export type ResolveConfigInput = {
  defaults: NotifyConfig;
  settings?: Partial<NotifyConfig>;
  plugin?: Partial<NotifyConfig>;
  cli?: Partial<NotifyConfig>;
};

export type ResolveConfigResult = {
  config: NotifyConfig;
};

export function resolveConfig(input: ResolveConfigInput, warn: Warn = () => {}): ResolveConfigResult {
  const warnOnce = createWarnOnce(warn);
  const withSettings = mergeConfig(input.defaults, input.settings, warnOnce);
  const withPlugin = mergeConfig(withSettings, input.plugin, warnOnce);
  const withCli = mergeConfig(withPlugin, input.cli, warnOnce);

  return {
    config: withCli
  };
}


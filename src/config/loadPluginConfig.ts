import { readFile } from "node:fs/promises";
import type { NotifyConfig } from "../contracts/config";

export type LoadResult = {
  value?: Partial<NotifyConfig>;
  warnings: string[];
};

export async function loadPluginConfig(filePath: string): Promise<LoadResult> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isObject(parsed)) {
      return {
        value: {},
        warnings: ["plugin config file must contain an object"]
      };
    }

    return {
      value: parsed as Partial<NotifyConfig>,
      warnings: []
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        warnings: ["plugin config file not found"]
      };
    }

    if (error instanceof SyntaxError) {
      return {
        warnings: ["plugin config file is malformed JSON"]
      };
    }

    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

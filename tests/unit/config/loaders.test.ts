import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSettingsJson } from "../../../src/config/loadSettingsJson";
import { loadPluginConfig } from "../../../src/config/loadPluginConfig";
import { parseCliArgs } from "../../../src/config/parseCliArgs";

describe("loadSettingsJson", () => {
  it("returns partial config from valid settings file", async () => {
    const result = await loadSettingsJson("tests/fixtures/settings.valid.json");

    expect(result.value?.events?.taskFailed).toBe(true);
    expect(result.value?.channels?.toast).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("returns warning for missing settings file", async () => {
    const result = await loadSettingsJson("tests/fixtures/settings.missing.json");

    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual(["settings.json not found"]);
  });

  it("returns warning for malformed settings json", async () => {
    const malformedPath = await createTempJsonFile("settings-malformed", "{\n  \"events\": {\n    \"taskFailed\": true,\n  }\n");
    const result = await loadSettingsJson(malformedPath);

    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual(["settings.json is malformed JSON"]);
  });

  it("returns warning when settings json root is not object", async () => {
    const wrongTypePath = await createTempJsonFile("settings-wrongtype", "[]\n");
    const result = await loadSettingsJson(wrongTypePath);

    expect(result.value).toEqual({});
    expect(result.warnings).toEqual(["settings.json must contain an object"]);
  });
});

describe("loadPluginConfig", () => {
  it("returns partial config from valid plugin config file", async () => {
    const result = await loadPluginConfig("tests/fixtures/plugin.valid.json");

    expect(result.value?.enabled).toBe(false);
    expect(result.value?.behavior?.throttleMs).toBe(2500);
    expect(result.warnings).toEqual([]);
  });

  it("returns warning for missing plugin config file", async () => {
    const result = await loadPluginConfig("tests/fixtures/plugin.missing.json");

    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual(["plugin config file not found"]);
  });

  it("returns warning for malformed plugin config json", async () => {
    const malformedPath = await createTempJsonFile("plugin-malformed", "{\n  \"enabled\": true,\n");
    const result = await loadPluginConfig(malformedPath);

    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual(["plugin config file is malformed JSON"]);
  });

  it("returns warning when plugin config json root is not object", async () => {
    const wrongTypePath = await createTempJsonFile("plugin-wrongtype", "\"not-an-object\"\n");
    const result = await loadPluginConfig(wrongTypePath);

    expect(result.value).toEqual({});
    expect(result.warnings).toEqual(["plugin config file must contain an object"]);
  });
});

async function createTempJsonFile(prefix: string, content: string): Promise<string> {
  const dirPath = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const filePath = join(dirPath, "config.json");
  await writeFile(filePath, content, "utf8");

  return filePath;
}

describe("parseCliArgs", () => {
  it("parses valid cli args into partial config without warnings", () => {
    const result = parseCliArgs([
      "--notify-enabled=false",
      "--notify-channel-taskbar-flash=false",
      "--notify-event-task-failed=false",
      "--notify-behavior-throttle-ms=1200"
    ]);

    expect(result.value).toEqual({
      enabled: false,
      channels: {
        taskbarFlash: false
      },
      events: {
        taskFailed: false
      },
      behavior: {
        throttleMs: 1200
      }
    });
    expect(result.warnings).toEqual([]);
  });

  it("returns warning for invalid boolean cli value", () => {
    const result = parseCliArgs(["--notify-enabled=maybe"]);

    expect(result.value).toEqual({});
    expect(result.warnings).toEqual(["invalid boolean for --notify-enabled: maybe"]);
  });

  it("returns warning for invalid number cli value", () => {
    const result = parseCliArgs(["--notify-behavior-throttle-ms=fast"]);

    expect(result.value).toEqual({});
    expect(result.warnings).toEqual(["invalid number for --notify-behavior-throttle-ms: fast"]);
  });
});

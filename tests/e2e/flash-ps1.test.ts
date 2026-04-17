import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const flashScript = join(__dirname, "../../src/platform/windows/flash.ps1");

// Find a window PID for testing — PowerShell spawned by Node.js won't have
// a parent chain reaching a window host, so we need an explicit target.
let testTargetPid: string;
try {
  const result = execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command",
     "(Get-Process -Name 'WindowsTerminal' -ErrorAction SilentlyContinue | Select-Object -First 1).Id"],
    { encoding: "utf8", timeout: 10000 }
  ).trim();
  testTargetPid = result || "0";
} catch {
  testTargetPid = "0";
}

function runFlash(env: Record<string, string>, stdin?: string): { stdout: string; exitCode: number } {
  try {
    const result = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", flashScript],
      {
        env: {
          ...process.env,
          CC_NOTIFY_DEBUG: "1",
          CC_NOTIFY_WHEN_FOCUSED: "true",
          CC_NOTIFY_DRY_RUN: "1",
          CC_NOTIFY_TARGET_PID: testTargetPid,
          ...env
        },
        input: stdin,
        encoding: "utf8",
        timeout: 30000
      }
    );
    return { stdout: result, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

describe("flash.ps1 E2E", { timeout: 30000 }, () => {
  it("finds host window in dry run", () => {
    const { stdout, exitCode } = runFlash({});
    // exit 0 = window found (dry run), exit 2 = no window (CI environment)
    expect([0, 2]).toContain(exitCode);
    if (exitCode === 0) {
      expect(stdout).toContain("selected: PID=");
      expect(stdout).toContain("DRY_RUN");
    }
  }, 30000);

  it("skips when enabled=false", () => {
    const { stdout, exitCode } = runFlash({ CC_NOTIFY_ENABLED: "false" });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("notification disabled by config");
  });

  it("skips when quiet hours are active", () => {
    const { stdout, exitCode } = runFlash({ CC_NOTIFY_QUIET_HOURS: "00:00-23:59" });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("quiet hours active");
  });

  it("proceeds when quiet hours are not active", () => {
    const { stdout, exitCode } = runFlash({ CC_NOTIFY_QUIET_HOURS: "03:00-03:01" });
    expect([0, 2]).toContain(exitCode);
    expect(stdout).not.toContain("quiet hours active");
  });

  it("respects notifyWhenFocused setting", () => {
    // With notifyWhenFocused=false, behavior depends on whether the window is foreground
    // We just verify the script runs without error and either skips or proceeds
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_WHEN_FOCUSED: "false",
      CC_NOTIFY_DRY_RUN: "1"
    });
    expect(exitCode).toBe(0);
    const skipped = stdout.includes("window is focused, skipping");
    const proceeded = stdout.includes("DRY_RUN");
    expect(skipped || proceeded).toBe(true);
  });

  it("filters Stop event when notifyOn=important", () => {
    const { stdout, exitCode } = runFlash(
      { CC_NOTIFY_ON: "important" },
      '{"hook_event_name":"Stop","last_assistant_message":"test"}'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("not in notifyOn=");
  });

  it("allows Notification event when notifyOn=important", () => {
    const { stdout, exitCode } = runFlash(
      { CC_NOTIFY_ON: "important" },
      '{"hook_event_name":"Notification","notification_type":"permission_prompt","message":"needs permission"}'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("DRY_RUN");
    expect(stdout).not.toContain("not in notifyOn=");
  });

  it("allows Stop event when notifyOn=normal", () => {
    const { stdout, exitCode } = runFlash(
      { CC_NOTIFY_ON: "normal" },
      '{"hook_event_name":"Stop","last_assistant_message":"test"}'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("DRY_RUN");
    expect(stdout).not.toContain("not in notifyOn=");
  });

  it("filters SubagentStart when notifyOn=normal", () => {
    const { stdout, exitCode } = runFlash(
      { CC_NOTIFY_ON: "normal" },
      '{"hook_event_name":"SubagentStart","agent_id":"a1","agent_type":"general"}'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("not in notifyOn=");
  });

  it("allows custom notifyOn list", () => {
    const { stdout, exitCode } = runFlash(
      { CC_NOTIFY_ON: "Stop,TeammateIdle" },
      '{"hook_event_name":"TeammateIdle","teammate_name":"reviewer","team_name":"dev"}'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("DRY_RUN");
    expect(stdout).not.toContain("not in notifyOn=");
  });

  it("rejects events not in custom notifyOn list", () => {
    const { stdout, exitCode } = runFlash(
      { CC_NOTIFY_ON: "Stop,TeammateIdle" },
      '{"hook_event_name":"SubagentStart","agent_id":"a1","agent_type":"general"}'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("not in notifyOn=");
  });

  it("logs payload to log file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-test-"));
    const logFile = join(tempDir, "test.log");
    try {
      runFlash(
        { CC_NOTIFY_LOG_FILE: logFile },
        '{"hook_event_name":"Stop","last_assistant_message":"hello"}'
      );
      const log = readFileSync(logFile, "utf8");
      expect(log).toContain("payload:");
      expect(log).toContain('"hook_event_name":"Stop"');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("flashes and plays sound when not in dry run", () => {
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_DRY_RUN: "0",
      CC_NOTIFY_WHEN_FOCUSED: "true"
    });
    // exit 0 = flashed, exit 2 = no window (CI)
    expect([0, 2]).toContain(exitCode);
    if (exitCode === 0) {
      expect(stdout).toContain("flashed hwnd=");
      expect(stdout).toContain("sound: system asterisk");
    }
  }, 30000);

  it("flashes without sound when sound=off", () => {
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_DRY_RUN: "0",
      CC_NOTIFY_WHEN_FOCUSED: "true",
      CC_NOTIFY_SOUND: "off"
    });
    expect([0, 2]).toContain(exitCode);
    if (exitCode === 0) {
      expect(stdout).toContain("flashed hwnd=");
      expect(stdout).not.toContain("sound:");
    }
  }, 30000);

  it("debounce skips when called twice rapidly", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-debounce-"));
    const lockFile = join(tempDir, "notification.lock");
    // Write a recent lock file (just now)
    writeFileSync(lockFile, "");
    try {
      const { stdout, exitCode } = runFlash({
        CC_NOTIFY_DEBOUNCE_MS: "10000",
        CC_NOTIFY_DEBOUNCE_LOCK_FILE: lockFile,
        CLAUDE_PLUGIN_DATA: tempDir
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("debounced");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("debounce allows when lock file is old", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-debounce-"));
    const lockFile = join(tempDir, "notification.lock");
    // Write a lock file and backdate it
    writeFileSync(lockFile, "");
    const past = new Date(Date.now() - 5000);
    const { utimesSync } = require("node:fs");
    utimesSync(lockFile, past, past);
    try {
      const { stdout, exitCode } = runFlash({
        CC_NOTIFY_DEBOUNCE_MS: "1",
        CC_NOTIFY_DEBOUNCE_LOCK_FILE: lockFile,
        CLAUDE_PLUGIN_DATA: tempDir
      });
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain("debounced");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("debounce is disabled when debounceMs=0", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-debounce-"));
    const lockFile = join(tempDir, "notification.lock");
    writeFileSync(lockFile, "");
    try {
      const { stdout, exitCode } = runFlash({
        CC_NOTIFY_DEBOUNCE_MS: "0",
        CC_NOTIFY_DEBOUNCE_LOCK_FILE: lockFile,
        CLAUDE_PLUGIN_DATA: tempDir
      });
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain("debounced");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("attempts GetConsoleWindow before process chain walk", () => {
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_TARGET_PID: "",
      CLAUDE_PLUGIN_DATA: ""
    });
    expect([0, 2]).toContain(exitCode);
    const triedConsole = stdout.includes("consoleWindow:");
    expect(triedConsole).toBe(true);
  });

  it("falls back to process chain when GetConsoleWindow returns zero", () => {
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_TARGET_PID: "",
      CLAUDE_PLUGIN_DATA: ""
    });
    expect([0, 2]).toContain(exitCode);
    if (stdout.includes("consoleWindow: returned zero")) {
      if (exitCode === 0) {
        expect(stdout).toContain("candidate:");
      }
    }
  });

  it("prefers window title matching workspace name", () => {
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_TARGET_PID: "",
      CLAUDE_PLUGIN_DATA: "",
      CC_NOTIFY_WORKSPACE_NAME: "test-workspace-unique-name"
    });
    expect([0, 2]).toContain(exitCode);
    if (exitCode === 0 && stdout.includes("candidate:")) {
      expect(stdout).toContain("rank=");
    }
  });

  it("uses innermost ancestor window (breaks on first match)", () => {
    const { stdout, exitCode } = runFlash({
      CC_NOTIFY_TARGET_PID: "",
      CLAUDE_PLUGIN_DATA: ""
    });
    expect([0, 2]).toContain(exitCode);
    if (exitCode === 0) {
      const candidateLines = stdout.split("\n").filter(l => l.includes("candidate:"));
      expect(candidateLines.length).toBeLessThanOrEqual(1);
    }
  });

  it("SessionStart saves foreground window hwnd to session_hwnd file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-session-"));
    try {
      const { stdout, exitCode } = runFlash(
        { CLAUDE_PLUGIN_DATA: tempDir, CC_NOTIFY_TARGET_PID: "" },
        '{"hook_event_name":"SessionStart"}'
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("sessionStart: saved hwnd=");
      const hwndFile = join(tempDir, "session_hwnd");
      expect(existsSync(hwndFile)).toBe(true);
      const content = readFileSync(hwndFile, "utf8");
      // Format: hwnd|title
      expect(content).toMatch(/^\d+\|/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("SessionEnd removes session_hwnd file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-session-"));
    const hwndFile = join(tempDir, "session_hwnd");
    writeFileSync(hwndFile, "12345|Test Window");
    try {
      const { stdout, exitCode } = runFlash(
        { CLAUDE_PLUGIN_DATA: tempDir, CC_NOTIFY_TARGET_PID: "" },
        '{"hook_event_name":"SessionEnd"}'
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("sessionEnd: removed session_hwnd file");
      expect(existsSync(hwndFile)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Stop event uses saved session hwnd when available", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-session-"));
    try {
      // First: simulate SessionStart to capture hwnd
      const startResult = runFlash(
        { CLAUDE_PLUGIN_DATA: tempDir, CC_NOTIFY_TARGET_PID: "" },
        '{"hook_event_name":"SessionStart"}'
      );
      expect(startResult.exitCode).toBe(0);
      const hwndFile = join(tempDir, "session_hwnd");
      expect(existsSync(hwndFile)).toBe(true);
      const savedHwnd = readFileSync(hwndFile, "utf8").split("|")[0];

      // Then: simulate Stop — should use the saved hwnd
      const stopResult = runFlash(
        {
          CLAUDE_PLUGIN_DATA: tempDir,
          CC_NOTIFY_TARGET_PID: "",
          CC_NOTIFY_DEBOUNCE_MS: "0"
        },
        '{"hook_event_name":"Stop"}'
      );
      expect(stopResult.exitCode).toBe(0);
      expect(stopResult.stdout).toContain("sessionHwnd: hwnd=" + savedHwnd);
      expect(stopResult.stdout).toContain("selected: PID=");
      expect(stopResult.stdout).toContain("DRY_RUN");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("SessionStart/SessionEnd bypass notifyOn filter for hwnd tracking", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cc-notify-session-"));
    try {
      // With notifyOn=important, SessionStart is NOT in the event list
      // but should still save hwnd
      const { stdout, exitCode } = runFlash(
        { CLAUDE_PLUGIN_DATA: tempDir, CC_NOTIFY_ON: "important", CC_NOTIFY_TARGET_PID: "" },
        '{"hook_event_name":"SessionStart"}'
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("sessionStart: saved hwnd=");
      expect(stdout).toContain("handled for hwnd tracking");
      expect(existsSync(join(tempDir, "session_hwnd"))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

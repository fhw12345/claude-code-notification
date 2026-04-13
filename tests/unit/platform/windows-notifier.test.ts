import { describe, expect, it, vi } from "vitest";
import type { NotifyConfig } from "../../../src/contracts/config";
import type { AgentEvent } from "../../../src/contracts/events";
import {
  buildCandidatePidList,
  findVsCodeHostProcessIds,
  flashTaskbar,
  resolveVsCodeWindowTitleFromStatus,
  selectWindowCandidate,
  shouldResolveVsCodeWindowTitle
} from "../../../src/platform/windows/taskbarFlash";
import { createWindowsNotifier } from "../../../src/platform/windows/windowsNotifier";

const baseConfig: NotifyConfig = {
  enabled: true,
  channels: {
    taskbarFlash: true,
    toast: false
  },
  events: {
    taskCompleted: true,
    taskFailed: true,
    needsInput: true,
    progressUpdate: true
  },
  behavior: {
    notifyWhenTerminalFocused: false,
    throttleMs: 5000
  }
};

const event: AgentEvent = {
  type: "taskCompleted",
  taskId: "task-1",
  at: "2026-04-11T10:00:00Z"
};

describe("createWindowsNotifier", () => {
  it("returns success when taskbar flash succeeds", async () => {
    const flash = vi.fn().mockResolvedValue(undefined);
    const notifier = createWindowsNotifier({ flash });

    const result = await notifier.notify(event, baseConfig);

    expect(result.ok).toBe(true);
    expect(result.channel).toBe("taskbar");
    expect(flash).toHaveBeenCalledTimes(1);
  });

  it("returns failure outcome without throwing when taskbar flash fails", async () => {
    const flash = vi.fn().mockRejectedValue(new Error("flash failed"));
    const notifier = createWindowsNotifier({ flash });

    const result = await notifier.notify(event, baseConfig);

    expect(result.ok).toBe(false);
    expect(result.channel).toBe("none");
    expect(result.reason).toBe("taskbar_flash_failed");
    expect(flash).toHaveBeenCalledTimes(1);
  });

  it("returns failure outcome when no channels are enabled", async () => {
    const flash = vi.fn().mockResolvedValue(undefined);
    const notifier = createWindowsNotifier({ flash });

    const result = await notifier.notify(event, {
      ...baseConfig,
      channels: {
        ...baseConfig.channels,
        taskbarFlash: false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.channel).toBe("none");
    expect(result.reason).toBe("no_channels_enabled");
    expect(flash).not.toHaveBeenCalled();
  });
});

describe("taskbarFlash", () => {
  it("finds the current VS Code browser and extension host from the process chain", () => {
    const result = findVsCodeHostProcessIds([
      { processId: 7001, parentProcessId: 8001, name: "codex.exe", commandLine: "codex" },
      {
        processId: 6001,
        parentProcessId: 7001,
        name: "Code.exe",
        commandLine: "Code.exe --type=utility --utility-sub-type=node.mojom.NodeService --inspect-port=0"
      },
      { processId: 5001, parentProcessId: 6001, name: "Code.exe", commandLine: '"C:\VS Code\Code.exe" .' }
    ]);

    expect(result).toEqual({ browserPid: 5001, extensionHostPid: 6001 });
  });

  it("prioritizes explicit target pid, then VS Code pid, then browser process, then process chain", () => {
    const result = buildCandidatePidList({
      targetPid: 9001,
      vscodePid: 8001,
      processChain: [
        { processId: 7001, parentProcessId: 0, name: "powershell.exe", commandLine: "powershell" },
        { processId: 6001, parentProcessId: 7001, name: "Code.exe", commandLine: "Code.exe --type=browser" },
        { processId: 5001, parentProcessId: 6001, name: "codex.exe", commandLine: "codex" }
      ]
    });

    expect(result).toEqual([9001, 8001, 6001, 7001, 5001]);
  });

  it("maps the current extension host to the matching VS Code window title from status output", () => {
    const result = resolveVsCodeWindowTitleFromStatus({
      extensionHostPid: 45356,
      statusText: [
        "    0   215   900 window [1] (manual-windows-acceptance.md - cc-plugin - Visual Studio Code)",
        "    0   269 32680 window [2] (README.md - cc-plugin - Visual Studio Code)",
        "    0   478 45356 extension-host [1]"
      ].join("\n")
    });

    expect(result).toBe("manual-windows-acceptance.md - cc-plugin - Visual Studio Code");
  });

  it("flags ambiguous multi-window VS Code cases for status lookup", () => {
    expect(
      shouldResolveVsCodeWindowTitle({
        browserPid: 8001,
        extensionHostPid: 7001,
        workspaceName: "cc-plugin",
        windows: [
          { pid: 8001, hwnd: "100", title: "alpha.md - cc-plugin - Visual Studio Code" },
          { pid: 8001, hwnd: "101", title: "beta.md - cc-plugin - Visual Studio Code" }
        ]
      })
    ).toBe(true);

    expect(
      shouldResolveVsCodeWindowTitle({
        browserPid: 8001,
        extensionHostPid: 7001,
        workspaceName: "cc-plugin",
        windows: [
          { pid: 8001, hwnd: "100", title: "alpha.md - cc-plugin - Visual Studio Code" },
          { pid: 8001, hwnd: "101", title: "notes - Visual Studio Code" }
        ]
      })
    ).toBe(false);
  });

  it("prefers the exact VS Code status title before workspace and title ordering", () => {
    const selectedWindow = selectWindowCandidate({
      candidatePids: [8001],
      windows: [
        { pid: 8001, hwnd: "100", title: "alpha.md - cc-plugin - Visual Studio Code" },
        { pid: 8001, hwnd: "101", title: "zeta.md - cc-plugin - Visual Studio Code" }
      ],
      workspaceName: "cc-plugin",
      preferredWindowTitle: "zeta.md - cc-plugin - Visual Studio Code"
    });

    expect(selectedWindow).toEqual({ pid: 8001, hwnd: "101", title: "zeta.md - cc-plugin - Visual Studio Code" });
  });

  it("selects the workspace-matching window title before other windows for the same pid", () => {
    const selectedWindow = selectWindowCandidate({
      candidatePids: [8001, 6001],
      windows: [
        { pid: 8001, hwnd: "102", title: "notes - Visual Studio Code" },
        { pid: 8001, hwnd: "101", title: "cc-plugin - Visual Studio Code" },
        { pid: 6001, hwnd: "200", title: "other - Visual Studio Code" }
      ],
      workspaceName: "cc-plugin"
    });

    expect(selectedWindow).toEqual({ pid: 8001, hwnd: "101", title: "cc-plugin - Visual Studio Code" });
  });

  it("falls back to a stable title and handle ordering when no title matches", () => {
    const selectedWindow = selectWindowCandidate({
      candidatePids: [8001, 6001],
      windows: [
        { pid: 8001, hwnd: "101", title: "zeta - Visual Studio Code" },
        { pid: 8001, hwnd: "100", title: "alpha - Visual Studio Code" },
        { pid: 6001, hwnd: "200", title: "cc-plugin - Visual Studio Code" }
      ],
      workspaceName: "missing-workspace"
    });

    expect(selectedWindow).toEqual({ pid: 8001, hwnd: "100", title: "alpha - Visual Studio Code" });
  });

  it("invokes powershell with an encoded host-window flash script", async () => {
    const spawn = vi.fn((_cmd: string, _args: string[]) => {
      const handlers: Record<string, (code: number) => void> = {};
      return {
        stdout: {
          on: () => {}
        },
        stderr: {
          on: () => {}
        },
        on: (eventName: string, handler: (code: number) => void) => {
          handlers[eventName] = handler;
          if (eventName === "close") {
            handler(0);
          }
        }
      };
    });

    await flashTaskbar(event, { spawn });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][0]).toBe("powershell");
    expect(spawn.mock.calls[0][1]).toContain("-File");
    expect(spawn.mock.calls[0][1]).toContain("-ExecutionPolicy");
    expect(spawn.mock.calls[0][2]).toMatchObject({
      env: expect.objectContaining({
        CC_NOTIFY_CALLER_PID: expect.any(String)
      })
    });
  });
});

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2] ?? "ok";
const extraArgs = process.argv.slice(3);
const debug = extraArgs.includes("--debug");
const targetPid = extraArgs.find((arg) => arg !== "--debug");

const payload =
  mode === "badjson"
    ? "{bad-json"
    : JSON.stringify({
        kind: "task_failed",
        taskId: "demo-1",
        reason: "test",
        at: "2026-04-12T21:10:00Z"
      });

const cliPath = resolve("./src/cli.ts");
const tsxCli = resolve("./node_modules/tsx/dist/cli.mjs");

const child = spawn(
  process.execPath,
  [
    tsxCli,
    cliPath,
    "--notify-enabled=true",
    "--notify-event-task-failed=true",
    "--notify-channel-taskbar-flash=true",
    "--notify-behavior-throttle-ms=0",
    "--notify-behavior-quiet-hours=off"
  ],
  {
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      CC_PLUGIN_E2E_OUTPUT: "1",
      ...(debug ? { CC_NOTIFY_DEBUG: "1" } : {}),
      ...(targetPid ? { CC_NOTIFY_TARGET_PID: targetPid } : {})
    }
  }
);

child.stdin.write(payload);
child.stdin.end();

child.on("close", (code) => {
  process.exit(code ?? 1);
});

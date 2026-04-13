import { flashTaskbar } from "../src/platform/windows/taskbarFlash.ts";

const targetPid = process.argv[2];

process.env.CC_NOTIFY_DEBUG = "1";
process.env.CC_NOTIFY_DRY_RUN = "1";

if (targetPid) {
  process.env.CC_NOTIFY_TARGET_PID = targetPid;
}

await flashTaskbar({
  type: "taskCompleted",
  taskId: "inspect",
  at: new Date().toISOString()
});

console.log("inspect-complete");

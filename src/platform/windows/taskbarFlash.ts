import { basename } from "node:path";
import { spawn as defaultSpawn, type SpawnOptions } from "node:child_process";
import type { AgentEvent } from "../../contracts/events";

type SpawnLike = (command: string, args: string[], options?: SpawnOptions) => {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  on: (event: "close" | "error", handler: (codeOrError: number | Error) => void) => void;
};

type TaskbarDeps = {
  spawn: SpawnLike;
};

export type HostProcessInfo = {
  processId: number;
  parentProcessId: number;
  name: string;
  commandLine: string;
};

export type WindowCandidate = {
  pid: number;
  hwnd: string;
  title: string;
};

type WindowSortHints = {
  workspaceName?: string;
  preferredWindowTitle?: string;
};

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function toSortableHandle(hwnd: string): number {
  const parsed = Number(hwnd);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortWindowsForPid(windows: WindowCandidate[], hints: WindowSortHints = {}): WindowCandidate[] {
  const normalizedWorkspace = hints.workspaceName ? normalizeTitle(hints.workspaceName) : undefined;
  const normalizedPreferredWindowTitle = hints.preferredWindowTitle
    ? normalizeTitle(hints.preferredWindowTitle)
    : undefined;

  return [...windows].sort((left, right) => {
    const leftPreferredMatch = normalizedPreferredWindowTitle && normalizeTitle(left.title) === normalizedPreferredWindowTitle ? 0 : 1;
    const rightPreferredMatch = normalizedPreferredWindowTitle && normalizeTitle(right.title) === normalizedPreferredWindowTitle ? 0 : 1;

    if (leftPreferredMatch !== rightPreferredMatch) {
      return leftPreferredMatch - rightPreferredMatch;
    }

    const leftWorkspaceMatch = normalizedWorkspace && normalizeTitle(left.title).includes(normalizedWorkspace) ? 0 : 1;
    const rightWorkspaceMatch = normalizedWorkspace && normalizeTitle(right.title).includes(normalizedWorkspace) ? 0 : 1;

    if (leftWorkspaceMatch !== rightWorkspaceMatch) {
      return leftWorkspaceMatch - rightWorkspaceMatch;
    }

    const titleCompare = normalizeTitle(left.title).localeCompare(normalizeTitle(right.title));
    if (titleCompare !== 0) {
      return titleCompare;
    }

    return toSortableHandle(left.hwnd) - toSortableHandle(right.hwnd);
  });
}

export function findVsCodeHostProcessIds(processChain: HostProcessInfo[]): {
  browserPid?: number;
  extensionHostPid?: number;
} {
  let browserPid: number | undefined;
  let extensionHostPid: number | undefined;

  for (const proc of processChain) {
    if (proc.name.toLowerCase() !== "code.exe") {
      continue;
    }

    const normalizedCommandLine = proc.commandLine.toLowerCase();

    if (!extensionHostPid && normalizedCommandLine.includes("--type=utility")) {
      extensionHostPid = proc.processId;
    }

    if (!browserPid && (normalizedCommandLine.includes("--type=browser") || !normalizedCommandLine.includes("--type="))) {
      browserPid = proc.processId;
    }
  }

  return {
    browserPid,
    extensionHostPid
  };
}

function parseVsCodeStatusLine(line: string):
  | { kind: "window"; index: string; title: string }
  | { kind: "extensionHost"; index: string; pid: number }
  | undefined {
  const windowMatch = line.match(/^\s*\S+\s+\S+\s+(\d+)\s+window(?: \[(\d+)\])? \((.+)\)\s*$/);
  if (windowMatch) {
    return {
      kind: "window",
      index: windowMatch[2] ?? "default",
      title: windowMatch[3]
    };
  }

  const extensionHostMatch = line.match(/^\s*\S+\s+\S+\s+(\d+)\s+extension-host(?: \[(\d+)\])?\s*$/);
  if (extensionHostMatch) {
    return {
      kind: "extensionHost",
      index: extensionHostMatch[2] ?? "default",
      pid: Number(extensionHostMatch[1])
    };
  }

  return undefined;
}

export function resolveVsCodeWindowTitleFromStatus(input: {
  statusText: string;
  extensionHostPid: number;
}): string | undefined {
  const windowsByIndex = new Map<string, string>();
  let extensionHostIndex: string | undefined;

  for (const line of input.statusText.split(/\r?\n/)) {
    const parsed = parseVsCodeStatusLine(line);
    if (!parsed) {
      continue;
    }

    if (parsed.kind === "window") {
      if (!windowsByIndex.has(parsed.index)) {
        windowsByIndex.set(parsed.index, parsed.title);
      }
      continue;
    }

    if (parsed.pid === input.extensionHostPid) {
      extensionHostIndex = parsed.index;
    }
  }

  if (extensionHostIndex && windowsByIndex.has(extensionHostIndex)) {
    return windowsByIndex.get(extensionHostIndex);
  }

  if (windowsByIndex.size === 1) {
    return [...windowsByIndex.values()][0];
  }

  return undefined;
}

export function shouldResolveVsCodeWindowTitle(input: {
  browserPid?: number;
  extensionHostPid?: number;
  windows: WindowCandidate[];
  workspaceName?: string;
}): boolean {
  if (!input.browserPid || !input.extensionHostPid) {
    return false;
  }

  const browserWindows = input.windows.filter((window) => window.pid === input.browserPid);
  if (browserWindows.length <= 1) {
    return false;
  }

  const normalizedWorkspace = input.workspaceName?.trim().toLowerCase();
  if (!normalizedWorkspace) {
    return true;
  }

  const workspaceMatches = browserWindows.filter((window) => normalizeTitle(window.title).includes(normalizedWorkspace));
  return workspaceMatches.length !== 1;
}

export function buildCandidatePidList(input: {
  targetPid?: number;
  vscodePid?: number;
  processChain: HostProcessInfo[];
}): number[] {
  const result: number[] = [];
  const vsCodeHostProcessIds = findVsCodeHostProcessIds(input.processChain);

  const pushUnique = (pid: number | undefined) => {
    if (!pid || pid <= 0 || result.includes(pid)) {
      return;
    }

    result.push(pid);
  };

  pushUnique(input.targetPid);
  pushUnique(input.vscodePid);
  pushUnique(vsCodeHostProcessIds.browserPid);

  for (const proc of input.processChain) {
    pushUnique(proc.processId);
  }

  return result;
}

export function selectWindowCandidate(input: {
  candidatePids: number[];
  windows: WindowCandidate[];
  workspaceName?: string;
  preferredWindowTitle?: string;
}): WindowCandidate | undefined {
  for (const candidatePid of input.candidatePids) {
    const windowsForPid = sortWindowsForPid(
      input.windows.filter((window) => window.pid === candidatePid),
      {
        workspaceName: input.workspaceName,
        preferredWindowTitle: input.preferredWindowTitle
      }
    );

    if (windowsForPid.length === 0) {
      continue;
    }

    return windowsForPid[0];
  }

  return undefined;
}

function buildFlashScript(): string {
  return [
    "$ProgressPreference = 'SilentlyContinue';",
    "$debugEnabled = $env:CC_NOTIFY_DEBUG -eq '1';",
    "$dryRun = $env:CC_NOTIFY_DRY_RUN -eq '1';",
    "$workspaceName = $env:CC_NOTIFY_WORKSPACE_NAME;",
    "$source = 'using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices; public struct FLASHWINFO { public UInt32 cbSize; public IntPtr hwnd; public UInt32 dwFlags; public UInt32 uCount; public UInt32 dwTimeout; } public static class Win32Flash { public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam); [DllImport(\"user32.dll\")] public static extern bool FlashWindowEx(ref FLASHWINFO pwfi); [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam); [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern IntPtr GetWindow(IntPtr hWnd, UInt32 uCmd); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount); [DllImport(\"user32.dll\")] public static extern UInt32 GetWindowThreadProcessId(IntPtr hWnd, out UInt32 processId); }';",
    "Add-Type -TypeDefinition $source;",
    "$gwOwner = 4;",
    "$candidatePids = New-Object System.Collections.Generic.List[int];",
    "$targetPidText = $env:CC_NOTIFY_TARGET_PID;",
    "if (-not [string]::IsNullOrWhiteSpace($targetPidText)) {",
    "  $candidatePids.Add([int]$targetPidText) | Out-Null;",
    "}",
    "$vscodePid = 0;",
    "$vscodePidText = $env:VSCODE_PID;",
    "if (-not [string]::IsNullOrWhiteSpace($vscodePidText)) {",
    "  $vscodePid = [int]$vscodePidText;",
    "  if ($vscodePid -gt 0 -and -not $candidatePids.Contains($vscodePid)) { $candidatePids.Add($vscodePid) | Out-Null; }",
    "}",
    "$startPid = [int]$env:CC_NOTIFY_CALLER_PID;",
    "if ($startPid -le 0) { exit 3 }",
    "$visited = New-Object 'System.Collections.Generic.HashSet[int]';",
    "$pidToInspect = $startPid;",
    "$processChain = New-Object System.Collections.Generic.List[object];",
    "$currentBrowserPid = 0;",
    "$currentExtensionHostPid = 0;",
    "$currentBrowserPath = '';",
    "while ($pidToInspect -gt 0 -and $visited.Add($pidToInspect)) {",
    "  $cim = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $pidToInspect) -ErrorAction SilentlyContinue;",
    "  if (-not $cim) { break }",
    "  $proc = [pscustomobject]@{ ProcessId = [int]$cim.ProcessId; ParentProcessId = [int]$cim.ParentProcessId; Name = [string]$cim.Name; CommandLine = [string]$cim.CommandLine };",
    "  $processChain.Add($proc) | Out-Null;",
    "  if ($proc.Name -ieq 'Code.exe') {",
    "    if ($currentExtensionHostPid -eq 0 -and $proc.CommandLine -like '*--type=utility*') { $currentExtensionHostPid = $proc.ProcessId }",
    "    if ($currentBrowserPid -eq 0 -and ($proc.CommandLine -like '*--type=browser*' -or $proc.CommandLine -notlike '*--type=*')) {",
    "      $currentBrowserPid = $proc.ProcessId;",
    "      $browserPathMatch = [regex]::Match($proc.CommandLine, '^\\s*\"([^\"]+Code\\.exe)\"');",
    "      if ($browserPathMatch.Success) { $currentBrowserPath = $browserPathMatch.Groups[1].Value }",
    "    }",
    "    if (($proc.CommandLine -like '*--type=browser*' -or $proc.CommandLine -notlike '*--type=*') -and -not $candidatePids.Contains($proc.ProcessId)) { $candidatePids.Add($proc.ProcessId) | Out-Null; }",
    "  }",
    "  if ($cim.ParentProcessId -eq $pidToInspect) { break }",
    "  $pidToInspect = [int]$cim.ParentProcessId;",
    "}",
    "if ($currentBrowserPid -le 0 -and $vscodePid -gt 0) { $currentBrowserPid = $vscodePid }",
    "if ([string]::IsNullOrWhiteSpace($currentBrowserPath) -and $currentBrowserPid -gt 0) {",
    "  $browserProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $currentBrowserPid) -ErrorAction SilentlyContinue;",
    "  if ($browserProcess) {",
    "    $browserPathMatch = [regex]::Match([string]$browserProcess.CommandLine, '^\\s*\"([^\"]+Code\\.exe)\"');",
    "    if ($browserPathMatch.Success) { $currentBrowserPath = $browserPathMatch.Groups[1].Value }",
    "  }",
    "}",
    "$shellNames = @('powershell.exe','pwsh.exe','cmd.exe','bash.exe','sh.exe','zsh.exe','fish.exe','node.exe','claude.exe','git.exe');",
    "foreach ($proc in $processChain) {",
    "  if (-not $candidatePids.Contains($proc.ProcessId) -and $shellNames -notcontains $proc.Name.ToLowerInvariant()) { $candidatePids.Add($proc.ProcessId) | Out-Null; }",
    "}",
    "if ($debugEnabled) { Write-Output ('cc-notify debug: candidatePids=' + ($candidatePids -join ',')) }",
    "$windowsByPid = @{};",
    "$windowTitlesByHandle = @{};",
    "$callback = [Win32Flash+EnumWindowsProc]{",
    "  param([IntPtr]$hWnd, [IntPtr]$lParam)",
    "  if (-not [Win32Flash]::IsWindowVisible($hWnd)) { return $true }",
    "  if ([Win32Flash]::GetWindow($hWnd, $gwOwner) -ne [IntPtr]::Zero) { return $true }",
    "  $windowPid = [uint32]0;",
    "  [void][Win32Flash]::GetWindowThreadProcessId($hWnd, [ref]$windowPid);",
    "  if ($windowPid -eq 0) { return $true }",
    "  $titleBuilder = New-Object System.Text.StringBuilder 512;",
    "  [void][Win32Flash]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity);",
    "  $windowTitle = $titleBuilder.ToString();",
    "  if (-not $windowsByPid.ContainsKey([int]$windowPid)) { $windowsByPid[[int]$windowPid] = New-Object System.Collections.Generic.List[IntPtr] }",
    "  $windowsByPid[[int]$windowPid].Add($hWnd) | Out-Null;",
    "  $windowTitlesByHandle[$hWnd.ToString()] = $windowTitle;",
    "  return $true",
    "};",
    "[Win32Flash]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null;",
    "$preferredWindowTitle = '';",
    "$preferredWindowTitleLower = '';",
    "$statusLookup = $false;",
    "$statusWindowIndex = '';",
    "$workspaceNameLower = if ([string]::IsNullOrWhiteSpace($workspaceName)) { '' } else { $workspaceName.ToLowerInvariant() };",
    "if ($currentExtensionHostPid -gt 0 -and $currentBrowserPid -gt 0 -and $windowsByPid.ContainsKey($currentBrowserPid) -and $windowsByPid[$currentBrowserPid].Count -gt 1) {",
    "  $workspaceMatchCount = 0;",
    "  if (-not [string]::IsNullOrWhiteSpace($workspaceNameLower)) {",
    "    foreach ($browserHandle in $windowsByPid[$currentBrowserPid]) {",
    "      $browserTitle = [string]$windowTitlesByHandle[$browserHandle.ToString()];",
    "      if ($browserTitle.ToLowerInvariant().Contains($workspaceNameLower)) { $workspaceMatchCount += 1 }",
    "    }",
    "  }",
    "  if ([string]::IsNullOrWhiteSpace($workspaceNameLower) -or $workspaceMatchCount -ne 1) { $statusLookup = $true }",
    "}",
    "if ($statusLookup) {",
    "  $statusOutput = '';",
    "  $vscodeCachePath = $env:VSCODE_CODE_CACHE_PATH;",
    "  $cliScriptPath = '';",
    "  if (-not [string]::IsNullOrWhiteSpace($currentBrowserPath) -and -not [string]::IsNullOrWhiteSpace($vscodeCachePath)) {",
    "    $commit = Split-Path -Path $vscodeCachePath -Leaf;",
    "    if (-not [string]::IsNullOrWhiteSpace($commit)) { $cliScriptPath = Join-Path (Split-Path -Path $currentBrowserPath -Parent) ($commit + '\\resources\\app\\out\\cli.js') }",
    "  }",
    "  if ([string]::IsNullOrWhiteSpace($cliScriptPath) -and -not [string]::IsNullOrWhiteSpace($currentBrowserPath)) {",
    "    $installRoot = Split-Path -Path $currentBrowserPath -Parent;",
    "    $fallbackCli = Get-ChildItem -LiteralPath $installRoot -Directory -ErrorAction SilentlyContinue |",
    "      Where-Object { $_.Name -match '^[0-9a-f]{10,}$' } |",
    "      ForEach-Object { Join-Path $_.FullName 'resources\\app\\out\\cli.js' } |",
    "      Where-Object { Test-Path -LiteralPath $_ } |",
    "      Select-Object -First 1;",
    "    if ($fallbackCli) { $cliScriptPath = [string]$fallbackCli }",
    "  }",
    "  if (-not [string]::IsNullOrWhiteSpace($cliScriptPath) -and (Test-Path -LiteralPath $cliScriptPath)) {",
    "    $previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE;",
    "    $previousVsCodeDev = $env:VSCODE_DEV;",
    "    try {",
    "      $env:ELECTRON_RUN_AS_NODE = '1';",
    "      $env:VSCODE_DEV = '';",
    "      $statusOutput = (& $currentBrowserPath $cliScriptPath --status 2>$null | Out-String);",
    "    } catch {",
    "      $statusOutput = '';",
    "    } finally {",
    "      if ($null -eq $previousElectronRunAsNode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode }",
    "      if ($null -eq $previousVsCodeDev) { Remove-Item Env:VSCODE_DEV -ErrorAction SilentlyContinue } else { $env:VSCODE_DEV = $previousVsCodeDev }",
    "    }",
    "  } elseif (Get-Command code -ErrorAction SilentlyContinue) {",
    "    try { $statusOutput = (& code --status 2>$null | Out-String) } catch { $statusOutput = '' }",
    "  }",
    "  if (-not [string]::IsNullOrWhiteSpace($statusOutput)) {",
    "    $windowTitlesByIndex = @{};",
    "    foreach ($statusLine in ($statusOutput -split [Environment]::NewLine)) {",
    "      $windowMatch = [regex]::Match($statusLine, '^\\s*\\S+\\s+\\S+\\s+(\\d+)\\s+window(?: \\[(\\d+)\\])? \\((.+)\\)\\s*$');",
    "      if ($windowMatch.Success) {",
    "        $indexKey = if ([string]::IsNullOrWhiteSpace($windowMatch.Groups[2].Value)) { 'default' } else { $windowMatch.Groups[2].Value };",
    "        if (-not $windowTitlesByIndex.ContainsKey($indexKey)) { $windowTitlesByIndex[$indexKey] = $windowMatch.Groups[3].Value }",
    "        continue",
    "      }",
    "      $extensionHostMatch = [regex]::Match($statusLine, '^\\s*\\S+\\s+\\S+\\s+(\\d+)\\s+extension-host(?: \\[(\\d+)\\])?\\s*$');",
    "      if ($extensionHostMatch.Success -and [int]$extensionHostMatch.Groups[1].Value -eq $currentExtensionHostPid) {",
    "        $statusWindowIndex = if ([string]::IsNullOrWhiteSpace($extensionHostMatch.Groups[2].Value)) { 'default' } else { $extensionHostMatch.Groups[2].Value }",
    "      }",
    "    }",
    "    if (-not [string]::IsNullOrWhiteSpace($statusWindowIndex) -and $windowTitlesByIndex.ContainsKey($statusWindowIndex)) {",
    "      $preferredWindowTitle = [string]$windowTitlesByIndex[$statusWindowIndex]",
    "    } elseif ($windowTitlesByIndex.Count -eq 1) {",
    "      $preferredWindowTitle = [string](($windowTitlesByIndex.GetEnumerator() | Select-Object -First 1).Value)",
    "    }",
    "    if (-not [string]::IsNullOrWhiteSpace($preferredWindowTitle)) { $preferredWindowTitleLower = $preferredWindowTitle.Trim().ToLowerInvariant() }",
    "  }",
    "}",
    "$selectedPid = 0;",
    "$hwnd = [IntPtr]::Zero;",
    "$selectedTitle = '';",
    "$selectedWindowSummaries = New-Object System.Collections.Generic.List[string];",
    "foreach ($candidatePid in $candidatePids) {",
    "  if (-not $windowsByPid.ContainsKey($candidatePid) -or $windowsByPid[$candidatePid].Count -eq 0) { continue }",
    "  $handles = $windowsByPid[$candidatePid];",
    "  $windowEntries = foreach ($handle in $handles) {",
    "    $title = [string]$windowTitlesByHandle[$handle.ToString()];",
    "    [pscustomobject]@{ Handle = $handle; HandleText = $handle.ToString(); HandleSort = [double]$handle.ToString(); Title = $title; PreferredRank = if (-not [string]::IsNullOrWhiteSpace($preferredWindowTitleLower) -and $title.Trim().ToLowerInvariant() -eq $preferredWindowTitleLower) { 0 } else { 1 }; WorkspaceRank = if (-not [string]::IsNullOrWhiteSpace($workspaceNameLower) -and $title.ToLowerInvariant().Contains($workspaceNameLower)) { 0 } else { 1 } }",
    "  }",
    "  $sortedEntries = $windowEntries | Sort-Object PreferredRank, WorkspaceRank, Title, HandleSort;",
    "  foreach ($entry in $sortedEntries) { $selectedWindowSummaries.Add(($candidatePid.ToString() + ':' + $entry.HandleText + ':' + $entry.Title)) | Out-Null }",
    "  $preferredHandle = $sortedEntries[0].Handle;",
    "  $preferredTitle = [string]$sortedEntries[0].Title;",
    "  $selectedPid = $candidatePid;",
    "  $hwnd = $preferredHandle;",
    "  $selectedTitle = $preferredTitle;",
    "  break",
    "}",
    "if ($debugEnabled) { Write-Output ('cc-notify debug: orderedWindows=' + ($selectedWindowSummaries -join ' | ')) }",
    "if ($debugEnabled) { Write-Output ('cc-notify debug: currentExtensionHostPid=' + $currentExtensionHostPid + '; currentBrowserPid=' + $currentBrowserPid + '; statusLookup=' + $statusLookup + '; statusWindowIndex=' + $statusWindowIndex + '; preferredWindowTitle=' + $preferredWindowTitle + '; cliScriptPath=' + $cliScriptPath) }",
    "if ($debugEnabled) { Write-Output ('cc-notify debug: workspaceName=' + $workspaceName + '; selectedPid=' + $selectedPid + '; resolvedHwnd=' + $hwnd + '; title=' + $selectedTitle) }",
    "if ($hwnd -eq [IntPtr]::Zero) { exit 2 }",
    "if ($dryRun) { exit 0 }",
    "$fw = New-Object FLASHWINFO;",
    "$fw.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($fw);",
    "$fw.hwnd = $hwnd;",
    "$fw.dwFlags = 14;",
    "$fw.uCount = 0;",
    "$fw.dwTimeout = 0;",
    "[void][Win32Flash]::FlashWindowEx([ref]$fw);",
    "Write-Output ('hwnd=' + $hwnd)"
  ].join("\n");
}

function buildCleanupScript(hwnd: string): string {
  return [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public struct FI { public UInt32 cbSize; public IntPtr hwnd; public UInt32 dwFlags; public UInt32 uCount; public UInt32 dwTimeout; } public static class FC { [DllImport(\"user32.dll\")] public static extern bool FlashWindowEx(ref FI p); [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }';",
    `$h = [IntPtr]${hwnd};`,
    "for ($i=0; $i -lt 120; $i++) {",
    "  Start-Sleep -Milliseconds 500;",
    "  if ([FC]::GetForegroundWindow() -eq $h) {",
    "    $f = New-Object FI; $f.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($f); $f.hwnd = $h; $f.dwFlags = 0; $f.uCount = 0; $f.dwTimeout = 0;",
    "    [void][FC]::FlashWindowEx([ref]$f); break",
    "  }",
    "}"
  ].join("\n");
}

function encodeScript(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export async function flashTaskbar(_event: AgentEvent, deps: TaskbarDeps = { spawn: defaultSpawn as unknown as SpawnLike }): Promise<void> {
  const stdout = await runPowershell(buildFlashScript(), deps.spawn);
  const hwndMatch = stdout.match(/hwnd=(\d+)/);
  if (hwndMatch) {
    spawnCleanupProcess(hwndMatch[1], deps.spawn);
  }
}

function spawnCleanupProcess(hwnd: string, spawn: SpawnLike): void {
  const script = buildCleanupScript(hwnd);
  const encoded = encodeScript(script);
  try {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
      { detached: true, stdio: "ignore" } as SpawnOptions
    );
    child.on("error", () => {});
  } catch {
    // cleanup is best-effort
  }
}

function runPowershell(script: string, spawn: SpawnLike): Promise<string> {
  return new Promise((resolve, reject) => {
    const debugEnabled = process.env.CC_NOTIFY_DEBUG === "1";
    const encodedCommand = encodeScript(script);
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const workspaceName = basename(process.cwd());

    let child;
    try {
      child = spawn(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand],
        {
          env: {
            ...process.env,
            CC_NOTIFY_CALLER_PID: String(process.pid),
            CC_NOTIFY_WORKSPACE_NAME: workspaceName
          }
        }
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    child.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
    child.on("close", (code) => {
      const stdoutDetail = stdoutChunks.join("");
      if (debugEnabled && stdoutDetail.trim()) {
        process.stderr.write(stdoutDetail.endsWith("\n") ? stdoutDetail : `${stdoutDetail}\n`);
      }

      if (typeof code === "number" && code === 0) {
        resolve(stdoutDetail);
        return;
      }

      const detail = stderrChunks.join("").trim();
      reject(new Error(detail ? `powershell exited with code ${String(code)}: ${detail}` : `powershell exited with code ${String(code)}`));
    });
  });
}

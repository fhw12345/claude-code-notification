$ProgressPreference = 'SilentlyContinue'

# --- Load config from $CLAUDE_PLUGIN_DATA/config.json ---
$config = @{}
if (-not [string]::IsNullOrWhiteSpace($env:CLAUDE_PLUGIN_DATA)) {
    $configPath = Join-Path $env:CLAUDE_PLUGIN_DATA 'config.json'
    if (Test-Path -LiteralPath $configPath) {
        try { $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } catch { $config = @{} }
    }
}

# Helper: config value with env var override
function Get-Setting($configKey, $envVar, $default) {
    $envVal = [System.Environment]::GetEnvironmentVariable($envVar)
    if (-not [string]::IsNullOrWhiteSpace($envVal)) { return $envVal }
    $val = $config.PSObject.Properties[$configKey].Value 2>$null
    if ($null -ne $val) { return [string]$val }
    return $default
}

$enabled      = (Get-Setting 'enabled'   'CC_NOTIFY_ENABLED'    'true') -ine 'false'
$debugEnabled = (Get-Setting 'debug'     'CC_NOTIFY_DEBUG'      'false') -ieq '1' -or (Get-Setting 'debug' 'CC_NOTIFY_DEBUG' 'false') -ieq 'true'
$dryRun       = (Get-Setting 'dryRun'    'CC_NOTIFY_DRY_RUN'    'false') -ieq '1' -or (Get-Setting 'dryRun' 'CC_NOTIFY_DRY_RUN' 'false') -ieq 'true'
$soundEnabled = (Get-Setting 'sound'     'CC_NOTIFY_SOUND'      'on') -ine 'off'
$soundFile    =  Get-Setting 'soundFile' 'CC_NOTIFY_SOUND_FILE' ''
$logFileCfg   =  Get-Setting 'logFile'   'CC_NOTIFY_LOG_FILE'   ''
$notifyOn     =  Get-Setting 'notifyOn'  'CC_NOTIFY_ON'         'normal'

# Resolve notifyOn level to event list
$levelMap = @{
    'all'       = @('stop','notification','subagentstop','subagentstart','teammateidle','sessionstart','sessionend','stopfailure')
    'normal'    = @('stop','notification','subagentstop')
    'important' = @('notification')
}
$notifyOnLower = $notifyOn.Trim().ToLowerInvariant()
if ($levelMap.ContainsKey($notifyOnLower)) {
    $notifyOnSet = $levelMap[$notifyOnLower]
} else {
    # Custom comma-separated list
    $notifyOnSet = @($notifyOn -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ -ne '' })
}

$workspaceName = $env:CC_NOTIFY_WORKSPACE_NAME
if ([string]::IsNullOrWhiteSpace($workspaceName)) {
    $workspaceName = Split-Path -Leaf (Get-Location)
}

# --- Log setup ---
$logFile = $logFileCfg
if ([string]::IsNullOrWhiteSpace($logFile) -and -not [string]::IsNullOrWhiteSpace($env:CLAUDE_PLUGIN_DATA)) {
    $logFile = Join-Path $env:CLAUDE_PLUGIN_DATA 'notification.log'
}

function Write-DebugLog($msg) {
    if ($debugEnabled) { Write-Output $msg }
    if (-not [string]::IsNullOrWhiteSpace($logFile)) {
        $dir = Split-Path -Parent $logFile
        if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force -ErrorAction SilentlyContinue | Out-Null
        }
        Add-Content -LiteralPath $logFile -Value ("[" + (Get-Date -Format o) + "] " + $msg) -ErrorAction SilentlyContinue
    }
}

# --- Check if enabled ---
if (-not $enabled) {
    Write-DebugLog "notification disabled by config"
    exit 0
}

# --- Check event type filter ---
# Hook payload comes via stdin as JSON; peek at hook_event_name to filter
$hookEventName = ''
$notificationType = ''
$stopReason = ''
$stdinContent = ''
if (-not [Console]::IsInputRedirected) {
    # no stdin — likely direct invocation, allow
} else {
    try {
        $stdinContent = [Console]::In.ReadToEnd()
        if (-not [string]::IsNullOrWhiteSpace($stdinContent)) {
            $payload = $stdinContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($payload) {
                $hookEventName = [string]$payload.hook_event_name
                $notificationType = [string]$payload.notification_type
                $stopReason = [string]$payload.reason
            }
        }
    } catch {}
}

# Log the full event type for analysis (always logged, not gated by debug)
if (-not [string]::IsNullOrWhiteSpace($logFile) -and -not [string]::IsNullOrWhiteSpace($stdinContent.Trim())) {
    $dir = Split-Path -Parent $logFile
    if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force -ErrorAction SilentlyContinue | Out-Null
    }
    Add-Content -LiteralPath $logFile -Value ("[" + (Get-Date -Format o) + "] payload: " + $stdinContent.Trim()) -ErrorAction SilentlyContinue
}

if ($hookEventName -ne '' -and $notifyOnSet -notcontains $hookEventName.ToLowerInvariant()) {
    Write-DebugLog ("event '" + $hookEventName + "' not in notifyOn=[" + ($notifyOnSet -join ',') + "], skipping")
    exit 0
}

# --- Win32 API ---
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public struct FLASHWINFO {
    public UInt32 cbSize;
    public IntPtr hwnd;
    public UInt32 dwFlags;
    public UInt32 uCount;
    public UInt32 dwTimeout;
}

public static class Win32Flash {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO pwfi);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, UInt32 uCmd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern UInt32 GetWindowThreadProcessId(IntPtr hWnd, out UInt32 processId);
}
'@

# --- Explicit target PID override ---
$targetPidText = $env:CC_NOTIFY_TARGET_PID

# --- Walk the process chain from this script's PID ---
$startPid = $PID
Write-DebugLog ("startPid=" + $startPid + " workspace=" + $workspaceName + " hookEvent=" + $hookEventName)

$visited = New-Object 'System.Collections.Generic.HashSet[int]'
$pidToInspect = $startPid
$processChain = New-Object System.Collections.Generic.List[object]
$skipNames = @('explorer.exe','csrss.exe','svchost.exe','services.exe','wininit.exe')

while ($pidToInspect -gt 0 -and $visited.Add($pidToInspect)) {
    $cim = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $pidToInspect) -ErrorAction SilentlyContinue
    if (-not $cim) { break }
    $proc = [pscustomobject]@{
        ProcessId = [int]$cim.ProcessId
        ParentProcessId = [int]$cim.ParentProcessId
        Name = [string]$cim.Name
        CommandLine = [string]$cim.CommandLine
    }
    $processChain.Add($proc) | Out-Null
    Write-DebugLog ("  chain: PID=" + $proc.ProcessId + " PPID=" + $proc.ParentProcessId + " Name=" + $proc.Name)
    if ($cim.ParentProcessId -eq $pidToInspect) { break }
    $pidToInspect = [int]$cim.ParentProcessId
}

# --- Enumerate all visible top-level windows ---
$script:windowsByPid = @{}
$script:windowTitlesByHandle = @{}

$callback = [Win32Flash+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    if (-not [Win32Flash]::IsWindowVisible($hWnd)) { return $true }
    if ([Win32Flash]::GetWindow($hWnd, 4) -ne [IntPtr]::Zero) { return $true }
    $windowPid = [uint32]0
    [void][Win32Flash]::GetWindowThreadProcessId($hWnd, [ref]$windowPid)
    if ($windowPid -eq 0) { return $true }
    $titleBuilder = New-Object System.Text.StringBuilder 512
    [void][Win32Flash]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
    $windowTitle = $titleBuilder.ToString()
    if (-not $script:windowsByPid.ContainsKey([int]$windowPid)) {
        $script:windowsByPid[[int]$windowPid] = New-Object System.Collections.Generic.List[IntPtr]
    }
    $script:windowsByPid[[int]$windowPid].Add($hWnd) | Out-Null
    $script:windowTitlesByHandle[$hWnd.ToString()] = $windowTitle
    return $true
}
[Win32Flash]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

# --- Select target window ---
$selectedPid = 0
$hwnd = [IntPtr]::Zero
$selectedTitle = ''

# Priority 1: Explicit target PID
if (-not [string]::IsNullOrWhiteSpace($targetPidText)) {
    $tpid = [int]$targetPidText
    if ($script:windowsByPid.ContainsKey($tpid) -and $script:windowsByPid[$tpid].Count -gt 0) {
        $selectedPid = $tpid
        $hwnd = $script:windowsByPid[$tpid][0]
        $selectedTitle = [string]$script:windowTitlesByHandle[$hwnd.ToString()]
        Write-DebugLog ("targetPid override: PID=" + $tpid + " hwnd=" + $hwnd + " title=" + $selectedTitle)
    }
}

# Priority 2: Walk process chain, pick outermost (last) ancestor with a window
if ($hwnd -eq [IntPtr]::Zero) {
    $workspaceNameLower = if ([string]::IsNullOrWhiteSpace($workspaceName)) { '' } else { $workspaceName.ToLowerInvariant() }
    foreach ($proc in $processChain) {
        if ($skipNames -contains $proc.Name.ToLowerInvariant()) { continue }
        if (-not $script:windowsByPid.ContainsKey($proc.ProcessId) -or $script:windowsByPid[$proc.ProcessId].Count -eq 0) { continue }
        $handles = $script:windowsByPid[$proc.ProcessId]
        $windowEntries = foreach ($handle in $handles) {
            $title = [string]$script:windowTitlesByHandle[$handle.ToString()]
            [pscustomobject]@{
                Handle = $handle
                Title = $title
                WorkspaceRank = if (-not [string]::IsNullOrWhiteSpace($workspaceNameLower) -and $title.ToLowerInvariant().Contains($workspaceNameLower)) { 0 } else { 1 }
            }
        }
        $best = $windowEntries | Sort-Object WorkspaceRank, Title | Select-Object -First 1
        $selectedPid = $proc.ProcessId
        $hwnd = $best.Handle
        $selectedTitle = $best.Title
        Write-DebugLog ("  candidate: PID=" + $proc.ProcessId + " Name=" + $proc.Name + " hwnd=" + $hwnd + " title=" + $selectedTitle)
    }
}

Write-DebugLog ("selected: PID=" + $selectedPid + " hwnd=" + $hwnd + " title=" + $selectedTitle)

if ($hwnd -eq [IntPtr]::Zero) {
    Write-DebugLog "FAILED: no window found"
    exit 2
}
if ($dryRun) {
    Write-DebugLog "DRY_RUN: skipping flash and sound"
    exit 0
}

# --- Flash ---
$fw = New-Object FLASHWINFO
$fw.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($fw)
$fw.hwnd = $hwnd
$fw.dwFlags = 14
$fw.uCount = 0
$fw.dwTimeout = 0
[void][Win32Flash]::FlashWindowEx([ref]$fw)
Write-DebugLog ("flashed hwnd=" + $hwnd)
Write-Output ('hwnd=' + $hwnd)

# --- Sound ---
if ($soundEnabled) {
    if (-not [string]::IsNullOrWhiteSpace($soundFile) -and (Test-Path -LiteralPath $soundFile)) {
        try {
            $player = New-Object System.Media.SoundPlayer($soundFile)
            $player.Play()
            Write-DebugLog ("sound: custom file=" + $soundFile)
        } catch {
            Write-DebugLog ("sound: custom file failed, falling back to system sound")
            [System.Media.SystemSounds]::Asterisk.Play()
        }
    } else {
        [System.Media.SystemSounds]::Asterisk.Play()
        Write-DebugLog "sound: system asterisk"
    }
}

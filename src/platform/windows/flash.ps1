$ProgressPreference = 'SilentlyContinue'
$debugEnabled = $env:CC_NOTIFY_DEBUG -eq '1'
$dryRun = $env:CC_NOTIFY_DRY_RUN -eq '1'
$workspaceName = $env:CC_NOTIFY_WORKSPACE_NAME
if ([string]::IsNullOrWhiteSpace($workspaceName)) {
    $workspaceName = Split-Path -Leaf (Get-Location)
}
$logFile = $env:CC_NOTIFY_LOG_FILE

function Write-DebugLog($msg) {
    if ($debugEnabled) { Write-Output $msg }
    if (-not [string]::IsNullOrWhiteSpace($logFile)) {
        Add-Content -LiteralPath $logFile -Value ("[" + (Get-Date -Format o) + "] " + $msg) -ErrorAction SilentlyContinue
    }
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
Write-DebugLog ("startPid=" + $startPid)

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
Write-DebugLog ("windowsByPid keys: " + (($script:windowsByPid.Keys | Sort-Object) -join ','))

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
        # Sort: workspace match first, then by title
        $windowEntries = foreach ($handle in $handles) {
            $title = [string]$script:windowTitlesByHandle[$handle.ToString()]
            [pscustomobject]@{
                Handle = $handle
                Title = $title
                WorkspaceRank = if (-not [string]::IsNullOrWhiteSpace($workspaceNameLower) -and $title.ToLowerInvariant().Contains($workspaceNameLower)) { 0 } else { 1 }
            }
        }
        $best = $windowEntries | Sort-Object WorkspaceRank, Title | Select-Object -First 1
        # Overwrite — later (outermost) wins
        $selectedPid = $proc.ProcessId
        $hwnd = $best.Handle
        $selectedTitle = $best.Title
        Write-DebugLog ("  candidate: PID=" + $proc.ProcessId + " Name=" + $proc.Name + " hwnd=" + $hwnd + " title=" + $selectedTitle)
    }
}

Write-DebugLog ("selected: PID=" + $selectedPid + " hwnd=" + $hwnd + " title=" + $selectedTitle)

if ($hwnd -eq [IntPtr]::Zero) { exit 2 }
if ($dryRun) { exit 0 }

# --- Flash! ---
$fw = New-Object FLASHWINFO
$fw.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($fw)
$fw.hwnd = $hwnd
$fw.dwFlags = 14
$fw.uCount = 0
$fw.dwTimeout = 0
[void][Win32Flash]::FlashWindowEx([ref]$fw)
Write-Output ('hwnd=' + $hwnd)

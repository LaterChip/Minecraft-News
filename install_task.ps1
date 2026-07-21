# ============================================================
# Install Windows Task Scheduler: MinecraftDailyFetch (daily 06:00)
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install_task.ps1
# ============================================================

$ErrorActionPreference = 'Continue'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = $ScriptDir
$BatPath = Join-Path $ProjectDir 'fetch_daily.bat'

if (-not (Test-Path $BatPath)) {
    [Console]::WriteLine("[ERR] Not found: $BatPath")
    exit 1
}

$TaskName = 'MinecraftDailyFetch'

# Try to remove existing task (ignore error)
[Console]::WriteLine("[..] Removing old task if exists...")
$proc = Start-Process -FilePath 'schtasks' -ArgumentList @('/Delete','/TN',$TaskName,'/F') -NoNewWindow -PassThru -Wait -RedirectStandardError 'NUL' -RedirectStandardOutput 'NUL' -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# Create new task
[Console]::WriteLine("[..] Creating new task...")
$argList = @(
    '/Create',
    '/TN', $TaskName,
    '/TR",$BatPath,"',
    '/SC', 'DAILY',
    '/ST', '06:00',
    '/RL', 'LIMITED',
    '/F'
)
# schtasks /TR needs quoting when path has spaces. Use single-quoted.
$trArg = '/TR'
$trValue = '"' + $BatPath + '"'
$finalArgs = @('/Create','/TN',$TaskName,$trArg,$trValue,'/SC','DAILY','/ST','06:00','/RL','LIMITED','/F')

$proc = Start-Process -FilePath 'schtasks' -ArgumentList $finalArgs -NoNewWindow -PassThru -Wait -RedirectStandardError 'tmp_err.txt' -RedirectStandardOutput 'tmp_out.txt'
$exit = $proc.ExitCode

if ($exit -ne 0) {
    $errOut = ''
    if (Test-Path 'tmp_err.txt') { $errOut = [System.IO.File]::ReadAllText('tmp_err.txt') }
    $outOut = ''
    if (Test-Path 'tmp_out.txt') { $outOut = [System.IO.File]::ReadAllText('tmp_out.txt') }
    [Console]::WriteLine("[ERR] Create failed, exit=$exit")
    [Console]::WriteLine("stdout: $outOut")
    [Console]::WriteLine("stderr: $errOut")
    if (Test-Path 'tmp_err.txt') { Remove-Item 'tmp_err.txt' }
    if (Test-Path 'tmp_out.txt') { Remove-Item 'tmp_out.txt' }
    exit 1
}
if (Test-Path 'tmp_err.txt') { Remove-Item 'tmp_err.txt' }
if (Test-Path 'tmp_out.txt') { Remove-Item 'tmp_out.txt' }

[Console]::WriteLine("")
[Console]::WriteLine("============================================")
[Console]::WriteLine(" Task installed successfully")
[Console]::WriteLine("============================================")
[Console]::WriteLine(" Name    : $TaskName")
[Console]::WriteLine(" Trigger : daily 06:00")
[Console]::WriteLine(" Command : $BatPath")
[Console]::WriteLine(" WorkDir : $ProjectDir")
[Console]::WriteLine("")
[Console]::WriteLine(" Run now      : schtasks /Run /TN $TaskName")
[Console]::WriteLine(" Manual fetch : double-click fetch_daily.bat")
[Console]::WriteLine(" Open UI      : taskschd.msc")
[Console]::WriteLine(" Uninstall    : powershell -File uninstall_task.ps1")

# ============================================================
# Uninstall scheduled task: MinecraftDailyFetch
# ============================================================

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$TaskName = 'MinecraftDailyFetch'

$check = schtasks /Query /TN $TaskName 2>$null
if ($LASTEXITCODE -eq 0) {
    schtasks /Delete /TN $TaskName /F | Out-Null
    [Console]::WriteLine("[OK] Task removed: $TaskName")
} else {
    [Console]::WriteLine("[WARN] Task not found: $TaskName")
}

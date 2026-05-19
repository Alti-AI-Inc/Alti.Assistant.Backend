# scripts/run-install-background.ps1
$scriptPath = Join-Path $PSScriptRoot "install-all-gcp-repos.cjs"
$logPath = Join-Path $PSScriptRoot "../logs/gcp-install.log"
$errLogPath = Join-Path $PSScriptRoot "../logs/gcp-install-error.log"

# Ensure logs directory exists
$logsDir = Split-Path $logPath
if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
}

Write-Host "`n======================================================"
Write-Host "Launching Monolithic GCP Submodule Installation Background Task"
Write-Host "======================================================"

Start-Process node -ArgumentList "$scriptPath" -RedirectStandardOutput $logPath -RedirectStandardError $errLogPath -WindowStyle Hidden

Write-Host "Background installer successfully launched!"
Write-Host "You can track progress in real-time by viewing the log file:"
Write-Host "  Get-Content -Path '$logPath' -Wait"
Write-Host "======================================================`n"

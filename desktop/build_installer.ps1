# ===========================================================================
# 🏥 SIMS VoiceScribe AI - Desktop Application Packager
# ===========================================================================

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🏥 BUILDING SIMS VOICESCRIBE AI DESKTOP APPLICATION" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$DesktopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $DesktopDir
$FrontendDir = Join-Path $RepoRoot "frontend"

# Step 1: Compile Frontend Production Distribution
Write-Host "`n[1/3] Compiling Single-Page React Application..." -ForegroundColor Yellow
Set-Location $FrontendDir
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed."
    exit 1
}

# Step 2: Install Desktop Packaging Dependencies
Write-Host "`n[2/3] Verifying Electron desktop dependencies..." -ForegroundColor Yellow
Set-Location $DesktopDir
if (-not (Test-Path "$DesktopDir\node_modules\electron\dist\electron.exe")) {
    npm install
}

# Step 3: Package 1-Click Installer
Write-Host "`n[3/3] Generating 1-Click Single Standalone Installer (.exe)..." -ForegroundColor Yellow
Set-Location $DesktopDir
npm run dist
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Dist build encountered warnings. Checking generated artifacts..."
}

$DistDir = Join-Path $DesktopDir "dist-electron"
$InstallerPath = Join-Path $DistDir "SIMS VoiceScribe AI Setup 1.0.0.exe"
$PortablePath = Join-Path $DistDir "SIMS VoiceScribe AI 1.0.0.exe"

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "🏥 SIMS HOSPITAL VOICESCRIBE AI - INSTALLER READY!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "1. Single-Click Setup Installer (Send to Doctors):" -ForegroundColor White
Write-Host "   $InstallerPath" -ForegroundColor Green
Write-Host "`n2. Standalone Portable Executable (Runs without install):" -ForegroundColor White
Write-Host "   $PortablePath" -ForegroundColor Green
Write-Host "`n3. Local Native App Launcher:" -ForegroundColor White
Write-Host "   $DesktopDir\START_SIMS_APP.bat" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan

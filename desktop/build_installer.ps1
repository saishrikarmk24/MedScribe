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

# Step 3: Package Application
Write-Host "`n[3/3] SIMS Desktop Workspace Ready!" -ForegroundColor Green
Write-Host "   -> Launcher script : $DesktopDir\START_SIMS_APP.bat"
Write-Host "   -> Native Electron : npm start (in desktop directory)"
Write-Host "=================================================================" -ForegroundColor Cyan

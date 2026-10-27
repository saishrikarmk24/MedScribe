<#
.SYNOPSIS
  One-click setup for the SIMS VoiceScribe online workstation (Gemini).

  Installs Python, Node.js, and the app's own libraries if they are missing,
  then opens the workstation. No Ollama, no GPU model download.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Backend = Join-Path $RepoRoot "backend"
$Frontend = Join-Path $RepoRoot "frontend"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
$VenvPip = Join-Path $Backend ".venv\Scripts\pip.exe"
$LogDir = Join-Path $RepoRoot "install-logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "install_gemini_online.log"

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
    Add-Content $LogFile "[$n/$total] $msg"
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
    Add-Content $LogFile "OK $msg"
}

function Write-Warn($msg) {
    Write-Host "  [!] $msg" -ForegroundColor Yellow
    Add-Content $LogFile "WARN $msg"
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
    $nodeDir = Join-Path $env:ProgramFiles "nodejs"
    if (Test-Path $nodeDir) { $env:Path = "$nodeDir;$env:Path" }
    $pyDir = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312"
    if (Test-Path $pyDir) { $env:Path = "$pyDir;$pyDir\Scripts;$env:Path" }
}

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Install-Winget($id) {
    if (-not (Test-Cmd "winget")) { return $false }
    Write-Host "  Installing $id ..."
    $p = Start-Process -FilePath "winget" -ArgumentList @(
        "install", "--id", $id, "-e", "--accept-package-agreements",
        "--accept-source-agreements", "--disable-interactivity", "--scope", "user"
    ) -Wait -PassThru -NoNewWindow
    Refresh-Path
    return ($p.ExitCode -eq 0 -or $p.ExitCode -eq -1978335189)
}

function Install-Exe($url, $args, $outName) {
    $dest = Join-Path $env:TEMP $outName
    Write-Host "  Downloading $outName ..."
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    if ($outName -like "*.msi") {
        $p = Start-Process -FilePath "msiexec.exe" -ArgumentList (@("/i", $dest) + $args) -Wait -PassThru
    } else {
        $p = Start-Process -FilePath $dest -ArgumentList $args -Wait -PassThru
    }
    Refresh-Path
    return ($p.ExitCode -eq 0)
}

function Find-Python {
    Refresh-Path
    $known = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe")
    )
    foreach ($exe in $known) {
        if (Test-Path $exe) {
            $ver = & $exe --version 2>&1
            if ($ver -match "Python 3\.(1[0-9]|[2-9]\d)") { return $exe }
        }
    }
    foreach ($cand in @("python", "py")) {
        if (-not (Test-Cmd $cand)) { continue }
        try {
            $ver = & $cand --version 2>&1
            if ($ver -match "Python 3\.(1[0-9]|[2-9]\d)") { return $cand }
        } catch {}
    }
    return $null
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SIMS VoiceScribe  |  Online workstation (Gemini)" -ForegroundColor Cyan
Write-Host "  First run installs Python, Node.js, and the app libraries." -ForegroundColor Cyan
Write-Host "  Later runs only open the workstation." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Folder: $RepoRoot"
Write-Host "  Log:    $LogFile"
Write-Host ""

Write-Step 1 6 "Microsoft Visual C++ runtime"
if (-not (Test-Path "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64")) {
    $ok = Install-Winget "Microsoft.VCRedist.2015+.x64"
    if (-not $ok) {
        Install-Exe "https://aka.ms/vs/17/release/vc_redist.x64.exe" @("/install", "/quiet", "/norestart") "vc_redist.x64.exe" | Out-Null
    }
    Write-Ok "VC++ runtime installed or already present"
} else {
    Write-Ok "VC++ runtime already present"
}

Write-Step 2 6 "Python 3.12"
$py = Find-Python
if (-not $py) {
    $ok = Install-Winget "Python.Python.3.12"
    if (-not $ok) {
        Install-Exe `
            "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe" `
            @("/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_test=0", "Include_pip=1") `
            "python-3.12.10-amd64.exe" | Out-Null
    }
    Start-Sleep -Seconds 2
    $py = Find-Python
}
if (-not $py) {
    Write-Host "  [ERROR] Python 3.12 is not installed. Install it from https://www.python.org/downloads/ and tick Add python.exe to PATH, then run this file again." -ForegroundColor Red
    exit 1
}
Write-Ok (& $py --version)

Write-Step 3 6 "Node.js"
Refresh-Path
if (-not (Test-Cmd "npm")) {
    $ok = Install-Winget "OpenJS.NodeJS.LTS"
    if (-not $ok) {
        Install-Exe `
            "https://nodejs.org/dist/v22.21.0/node-v22.21.0-x64.msi" `
            @("/quiet", "/norestart") `
            "node-v22.21.0-x64.msi" | Out-Null
    }
    Start-Sleep -Seconds 2
    Refresh-Path
}
if (-not (Test-Cmd "npm")) {
    Write-Host "  [ERROR] Node.js is not installed. Install the LTS version from https://nodejs.org/ and run this file again." -ForegroundColor Red
    exit 1
}
Write-Ok "node $(node --version) / npm $(npm --version)"

function Test-PostgresListening {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $wait = $client.BeginConnect("127.0.0.1", 5432, $null, $null)
        $ok = $wait.AsyncWaitHandle.WaitOne(800, $false) -and $client.Connected
        $client.Close()
        return [bool]$ok
    } catch {
        return $false
    }
}

Write-Step 4 6 "Clinical workstation settings"
$useSqlite = -not (Test-PostgresListening)
foreach ($target in @((Join-Path $RepoRoot ".env"), (Join-Path $Backend ".env"))) {
    if (-not (Test-Path $target)) {
        Write-Host "  [ERROR] Missing settings file: $target" -ForegroundColor Red
        Write-Host "  This pack must include the .env files. Ask for a fresh copy of the zip." -ForegroundColor Red
        exit 1
    }
    $raw = Get-Content $target -Raw
    if ($useSqlite) {
        $raw = $raw -replace '(?m)^DATABASE_URL=.*$', 'DATABASE_URL=sqlite+aiosqlite:///./medscribe_online.db'
    }
    $raw = $raw -replace '(?m)^ALLOW_SQLITE_FALLBACK=.*$', 'ALLOW_SQLITE_FALLBACK=true'
    $raw = $raw -replace '(?m)^AI_MODE=.*$', 'AI_MODE=gemini'
    $raw = $raw -replace '(?m)^ASR_PROVIDER=.*$', 'ASR_PROVIDER=gemini'
    $raw = $raw -replace '(?m)^DIARIZATION_PROVIDER=.*$', 'DIARIZATION_PROVIDER=gemini'
    $raw = $raw -replace '(?m)^GEMINI_MODEL=.*$', 'GEMINI_MODEL=gemini-3.8-flash'
    $raw = $raw -replace '(?m)^GEMINI_ASR_MODEL=.*$', 'GEMINI_ASR_MODEL=gemini-3.8-flash'
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($target, $raw, $utf8)
}
Write-Ok "Gemini online settings ready (no separate database to install)"

Write-Step 5 6 "Application libraries"
Set-Location $Backend
if (-not (Test-Path $VenvPython)) {
    & $py -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] Could not create the Python environment." -ForegroundColor Red
        exit 1
    }
    Write-Ok "Created the Python environment"
} else {
    Write-Ok "Python environment already present"
}
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { exit 1 }
& $VenvPip install -r (Join-Path $Backend "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Python libraries failed to install. See $LogFile" -ForegroundColor Red
    exit 1
}
& $VenvPython -c "import fastapi, uvicorn, google.genai; print('PY_OK')"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] The clinical engine did not import." -ForegroundColor Red
    exit 1
}
Write-Ok "Clinical engine libraries installed"

Set-Location $Frontend
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] The workstation screen failed to install." -ForegroundColor Red
        exit 1
    }
}
Write-Ok "Workstation screen ready"

Write-Step 6 6 "Opening VoiceScribe"
$backendCmd = "cd /d `"$Backend`" && call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $backendCmd -WindowStyle Normal
Start-Sleep -Seconds 3
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$Frontend`" && npm run dev -- --host 127.0.0.1 --port 5173" -WindowStyle Normal
Start-Sleep -Seconds 4
Start-Process "http://127.0.0.1:5173"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  SIMS VoiceScribe is opening." -ForegroundColor Green
Write-Host "  Workstation:  http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "  Leave the two black windows open while you use it." -ForegroundColor Green
Write-Host "  Close those windows to stop VoiceScribe." -ForegroundColor Green
Write-Host "  Next time, double-click the same file again." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""

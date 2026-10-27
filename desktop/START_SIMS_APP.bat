@echo off
title SIMS VoiceScribe AI Workstation Launcher
cd /d "%~dp0"

echo ===========================================================================
echo       SIMS HOSPITAL - VOICESCRIBE AI CLINICAL WORKSTATION
echo ===========================================================================
echo [1/3] Starting embedded clinical engine (Google Gemini 3.7 Flash)...

start /B "" "..\backend\.venv\Scripts\python.exe" "desktop_runner.py"

echo [2/3] Connecting to micro-backend...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:18420/api/status >nul 2>&1
if errorlevel 1 goto wait_loop

echo [3/3] Opening SIMS VoiceScribe Medical Application Window...

:: Try launching in Edge App Mode (Chromium Native App Frame, zero address bar)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:18420 --window-size=1366,860
    exit /b
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:18420 --window-size=1366,860
    exit /b
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:18420 --window-size=1366,860
    exit /b
)

:: Fallback standard browser opener
start http://127.0.0.1:18420
exit /b

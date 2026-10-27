@echo off
setlocal
title SIMS VoiceScribe - Online workstation
cd /d "%~dp0"
echo.
echo ==============================================================================
echo   SIMS Hospital  -  VoiceScribe online workstation
echo   Double-click this file to install anything missing, then open the app.
echo ==============================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install_gemini_online.ps1" -RepoRoot "%~dp0"
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" (
    echo Setup did not finish. The log is in install-logs\install_gemini_online.log
    echo.
    pause
    exit /b %ERR%
)
echo You can close this window. Keep the other two windows open while using VoiceScribe.
echo.
pause
exit /b 0

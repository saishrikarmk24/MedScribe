@echo off
setlocal enabledelayedexpansion
title VoiceScribe AI - Quick Launcher
color 0a

echo ==============================================================================
echo                      STARTING VOICESCRIBE AI WORKSTATION
echo ==============================================================================
echo.

:: 1. Start Backend
echo [1/3] Starting Python Backend on http://127.0.0.1:8000 ...
start "VoiceScribe AI - Backend" cmd /k "cd /d ""%~dp0backend"" && call .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000"

timeout /t 2 >nul

:: 2. Start Frontend
echo [2/3] Starting Frontend Workstation on http://127.0.0.1:5173 ...
start "VoiceScribe AI - Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

timeout /t 3 >nul

:: 3. Open Browser
echo [3/3] Launching Web Browser...
start http://127.0.0.1:5173

echo.
echo ==============================================================================
echo VoiceScribe AI is running at http://127.0.0.1:5173 !
echo To close VoiceScribe AI, close the Backend and Frontend command windows.
echo ==============================================================================
timeout /t 5 >nul

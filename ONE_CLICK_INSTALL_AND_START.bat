@echo off
setlocal enabledelayedexpansion
title VoiceScribe AI - One Click Installer & Launcher
color 0b

echo ==============================================================================
echo                      VOICESCRIBE AI - ONE-CLICK SETUP & LAUNCH
echo ==============================================================================
echo.

:: 1. Check Python installation
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
python --version
echo [OK] Python is available.
echo.

:: 2. Check Node.js installation
echo [2/5] Checking Node.js installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js / npm is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/ (LTS version recommended).
    pause
    exit /b 1
)
echo [OK] Node.js and npm are available.
echo.

:: 3. Setup Python Backend
echo [3/5] Setting up Python Backend Virtual Environment...
cd /d "%~dp0backend"
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate.bat
echo Installing/Verifying Python dependencies...
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARNING] Some dependencies had warnings, retrying standard install...
    pip install -r requirements.txt
)
echo [OK] Backend environment is ready.
cd /d "%~dp0"
echo.

:: 4. Setup Environment File
if not exist ".env" (
    echo Creating .env file from template...
    copy .env.example .env >nul
)

:: 5. Setup Frontend
echo [4/5] Setting up Frontend Web App...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo Installing Frontend npm packages (first-time setup)...
    call npm install
) else (
    echo [OK] Frontend packages already installed.
)
cd /d "%~dp0"
echo.

:: 6. Launch Applications
echo [5/5] Launching VoiceScribe AI Services...
echo.
echo Starting Backend on http://127.0.0.1:8000 ...
start "VoiceScribe AI - Backend" cmd /k "cd /d ""%~dp0backend"" && call .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000"

timeout /t 2 >nul

echo Starting Frontend on http://127.0.0.1:5173 ...
start "VoiceScribe AI - Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

timeout /t 3 >nul

echo Opening browser at http://127.0.0.1:5173 ...
start http://127.0.0.1:5173

echo.
echo ==============================================================================
echo                     VOICESCRIBE AI IS RUNNING!
echo ==============================================================================
echo.
echo  * Web App:       http://127.0.0.1:5173
echo  * API Docs:      http://127.0.0.1:8000/docs
echo  * Google Meet Extension:
echo      1. Open Chrome and go to chrome://extensions
echo      2. Turn ON 'Developer mode' (top right)
echo      3. Click 'Load unpacked' and select the 'extension' folder in this directory.
echo.
echo You can keep this window open or close it. To stop, close the two terminal windows.
echo ==============================================================================
pause

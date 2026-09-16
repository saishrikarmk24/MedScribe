@echo off
setlocal
title VoiceScribe AI - Package for Sharing
color 0e

echo ==============================================================================
echo                      CREATING CLEAN DISTRIBUTION ZIP
echo ==============================================================================
echo.
echo Packaging project into VoiceScribe_AI_Setup.zip (excluding bulky node_modules and .venv)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $source = Get-Location; $destination = Join-Path $source 'VoiceScribe_AI_Setup.zip'; if (Test-Path $destination) { Remove-Item $destination -Force }; $excludes = @('node_modules', '.venv', '.venvs', '.git', '__pycache__', '.pytest_cache', '.claude', 'dist', 'coverage', 'VoiceScribe_AI_Setup.zip'); $files = Get-ChildItem -Path $source -Recurse | Where-Object { $item = $_; -not ($excludes | Where-Object { $item.FullName -match [regex]::Escape([IO.Path]::DirectorySeparatorChar + $_) -or $item.FullName.EndsWith([IO.Path]::DirectorySeparatorChar + $_) }) }; Compress-Archive -Path $files.FullName -DestinationPath $destination -CompressionLevel Optimal; Write-Host 'Zip created successfully at: ' $destination -ForegroundColor Green }"

echo.
echo ==============================================================================
echo PACKAGE CREATED: VoiceScribe_AI_Setup.zip
echo.
echo You can now send 'VoiceScribe_AI_Setup.zip' to your friend!
echo When they extract it, they only need to double-click:
echo    --> ONE_CLICK_INSTALL_AND_START.bat
echo ==============================================================================
pause

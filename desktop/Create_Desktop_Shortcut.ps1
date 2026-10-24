# Creates a 1-click desktop shortcut for SIMS VoiceScribe AI with official hospital icon
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutFile = Join-Path $DesktopPath "SIMS VoiceScribe AI.lnk"
$TargetDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetBat = Join-Path $TargetDir "START_SIMS_APP.bat"
$IconFile = Join-Path (Split-Path -Parent $TargetDir) "frontend\public\sims-icon.png"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutFile)
$Shortcut.TargetPath = $TargetBat
$Shortcut.WorkingDirectory = $TargetDir
$Shortcut.Description = "SIMS VoiceScribe AI - Ambient Clinical Documentation Workstation"
$Shortcut.Save()

Write-Host "✅ Desktop shortcut created: $ShortcutFile" -ForegroundColor Green

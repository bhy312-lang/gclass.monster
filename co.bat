@echo off
echo Switching to Claude Pro...
copy /Y ".claude\settings-claude-pro.json" ".claude\settings.json" >nul
echo Done! Now using Claude Pro (Opus 4.5).

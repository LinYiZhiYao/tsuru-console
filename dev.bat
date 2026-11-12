@echo off
chcp 65001 >nul
title Nebula Console - DEV (hot reload)
cd /d "%~dp0"

REM Clear sandbox-injected shims so Vite can clean its dep-cache temp dirs.
REM Harmless outside the sandbox; required when launched from an injected shell.
set "NODE_OPTIONS="
set "PYTHONPATH="
set NEBULA_DISABLE_GPU=1

echo.
echo Starting Vite + Electron (software rendering)...
echo Edit src/ and the window updates automatically (hot reload).
echo DevTools: menu "View" -^> "Developer Tools", or Ctrl+Shift+I.
echo Press Ctrl+C in THIS window to stop both processes.
echo.
call npm run start
echo.
echo === exited (code %errorlevel%) ===
pause

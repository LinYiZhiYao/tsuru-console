@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Nebula Console - cleanup old builds

REM ============================================================
REM  IMPORTANT: run this AFTER a Windows reboot.
REM  app.asar files are locked until reboot; deleting before that
REM  silently fails. This script only touches release-* build dirs
REM  inside this project, never your personal files.
REM  It keeps the newest folder that actually contains a working exe.
REM ============================================================

set "KEEP="
for /f "delims=" %%D in ('dir /b /ad /o-d release-* 2^>nul') do (
  if not defined KEEP if exist "%%D\win-unpacked\Nebula Console.exe" set "KEEP=%%D"
)

if not defined KEEP (
  echo ERROR: no working build found, nothing will be deleted.
  pause
  exit /b 1
)

echo.
echo   KEEP : %KEEP%
echo   The following old build folders will be DELETED:
echo.
for /f "delims=" %%D in ('dir /b /ad release-* 2^>nul') do (
  if /i not "%%D"=="%KEEP%" echo     %%D
)
for %%X in (release dist-release) do (
  if exist "%%X" echo     %%X
)
echo.
echo This is irreversible. Make sure you have rebooted first.
set "CONFIRM="
set /p "CONFIRM=Type YES to continue: "
if /i not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 0
)

for /f "delims=" %%D in ('dir /b /ad release-* 2^>nul') do (
  if /i not "%%D"=="%KEEP%" (
    echo Removing %%D ...
    rmdir /s /q "%%D" 2>nul
    if exist "%%D" echo   [WARN] %%D is still locked by Windows, reboot required.
  )
)
for %%X in (release dist-release) do (
  if exist "%%X" (
    echo Removing %%X ...
    rmdir /s /q "%%X" 2>nul
    if exist "%%X" echo   [WARN] %%X is still locked by Windows, reboot required.
  )
)

echo.
echo Done. Kept: %KEEP%
pause

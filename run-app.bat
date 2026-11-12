@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NEBULA_DISABLE_GPU=1

REM Auto-discover the newest build that actually has a working exe.
REM prepare-dist.cjs switches output folder on every rebuild, so never hardcode one here.
set "APP="
for /f "delims=" %%D in ('dir /b /ad /o-d release-* 2^>nul') do (
  if exist "%%D\win-unpacked\Tsuru Console.exe" (
    set "APP=%%D\win-unpacked\Tsuru Console.exe"
    goto :found
  )
  if exist "%%D\win-unpacked\Nebula Console.exe" (
    set "APP=%%D\win-unpacked\Nebula Console.exe"
    goto :found
  )
)

:found
if not defined APP (
  echo ERROR: no packaged app found. Run "npm run dist:portable" first.
  pause
  exit /b 1
)
start "" "%APP%"
exit /b 0

@echo off
chcp 65001 >nul
setlocal

set "PROJECT_DIR=%~dp0"
set "INDEX=%PROJECT_DIR%index.html"

start "" "msedge" "%INDEX%" 2>nul
if %ERRORLEVEL% EQU 0 goto :end

start "" "chrome" "%INDEX%" 2>nul
if %ERRORLEVEL% EQU 0 goto :end

start "" "%INDEX%"

:end
endlocal
exit /b 0

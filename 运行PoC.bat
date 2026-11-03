@echo off
chcp 65001 >nul
cd /d "%~dp0"
node poc.mjs
set "pocExit=%errorlevel%"
if "%pocExit%"=="0" if exist "output\live\result.html" start "" "output\live\result.html"
if "%pocExit%"=="2" if exist "output\live\result.html" start "" "output\live\result.html"
pause

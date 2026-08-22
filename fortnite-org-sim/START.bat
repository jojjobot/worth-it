@echo off
title APEX ORG - Esports Manager
cd /d "%~dp0"

echo.
echo   APEX ORG  -  starting up
echo   ------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed.
  echo   Download it from https://nodejs.org  ^(pick the LTS button^), then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   First run - installing the bits it needs. This takes a minute.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo   Opening the game in your browser...
echo   Leave this window open while you play. Close it to stop the game.
echo.
call npm run start
pause

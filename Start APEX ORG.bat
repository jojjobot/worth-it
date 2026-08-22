@echo off
REM Starts APEX ORG (the esports org manager) and opens it in your browser.
REM Leave the black window open while you play; close it to stop the game.
cd /d "%~dp0fortnite-org-sim"
if not exist "node_modules" (
  echo First run - installing what it needs. This takes about a minute.
  call npm install
)
start "" cmd /k npm run dev
timeout /t 5 /nobreak >nul
start "" http://localhost:5180/
exit

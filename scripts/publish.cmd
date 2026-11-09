@echo off
setlocal
cd /d "%~dp0.." || (echo Cannot cd to project root & pause & exit /b 1)

set "BASH_EXE="
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if not defined BASH_EXE if exist "C:\Program Files (x86)\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files (x86)\Git\bin\bash.exe"
if not defined BASH_EXE (
  echo Git for Windows not found.
  echo Please open Git Bash in the project folder and run: ./scripts/publish.sh
  pause
  exit /b 1
)

"%BASH_EXE%" -c "./scripts/publish.sh"
set "RC=%ERRORLEVEL%"
echo.
echo Done. Exit code %RC%.
pause >nul
exit /b %RC%

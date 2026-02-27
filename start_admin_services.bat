@echo off
setlocal enableextensions

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo [WHR] Starting admin services from:
echo        %ROOT_DIR%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo         Install Node.js and try again.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo         Install npm/Node.js and try again.
  exit /b 1
)

if not exist "admin\backend\package.json" (
  echo [ERROR] admin\backend\package.json not found.
  exit /b 1
)

echo [WHR] Installing backend dependencies...
call npm --prefix admin\backend install --silent
if errorlevel 1 (
  echo [ERROR] Backend dependency installation failed.
  exit /b 1
)

echo [WHR] Installing frontend dependencies...
call npm --prefix admin\frontend install --silent
if errorlevel 1 (
  echo [ERROR] Frontend dependency installation failed.
  exit /b 1
)

echo [WHR] Launching backend service...
start "WHR Admin Backend" cmd /k "cd /d "%ROOT_DIR%" && npm --prefix admin\backend run dev"

echo [WHR] Launching frontend service...
start "WHR Admin Frontend" cmd /k "cd /d "%ROOT_DIR%" && npm --prefix admin\frontend run dev"

echo.
echo [WHR] Services started.
echo       Backend:  http://localhost:3001
echo       Frontend: http://localhost:5173
echo.
echo Press any key to close this launcher...
pause >nul

exit /b 0

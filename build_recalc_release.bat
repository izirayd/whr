@echo off
setlocal enableextensions

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo [WHR] Build whr_recalc (Release)
echo       Root: %ROOT_DIR%
echo.

where cmake >nul 2>nul
if errorlevel 1 (
  echo [ERROR] cmake was not found in PATH.
  echo         Install CMake and try again.
  exit /b 1
)

if not exist "CMakeLists.txt" (
  echo [ERROR] CMakeLists.txt not found in:
  echo         %ROOT_DIR%
  exit /b 1
)

set "BUILD_DIR=build"

if not exist "%BUILD_DIR%\CMakeCache.txt" (
  echo [WHR] Configuring CMake project...
  cmake -S . -B "%BUILD_DIR%"
  if errorlevel 1 (
    echo [ERROR] CMake configure failed.
    exit /b 1
  )
)

echo [WHR] Building target whr_recalc in Release...
cmake --build "%BUILD_DIR%" --target whr_recalc --config Release
if errorlevel 1 (
  echo [ERROR] Release build failed.
  exit /b 1
)

set "RECALC_EXE=%ROOT_DIR%%BUILD_DIR%\bin\whr_recalc.exe"
if not exist "%RECALC_EXE%" (
  echo [WARN] Build completed, but executable path was not found:
  echo        %RECALC_EXE%
  exit /b 1
)

echo.
echo [WHR] Release build completed successfully.
echo       Executable: %RECALC_EXE%
echo.
exit /b 0

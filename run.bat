@echo off
title Ore Sentinels - Digital Twin Launcher
color 0B
echo ===================================================================
echo     ORE SENTINELS - 3D DIGITAL TWIN & TELEMETRY SERVER
echo ===================================================================
echo.

:: Ensure working directory is the script location
cd /d "%~dp0conveyor_digital_twin"

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not found in your PATH!
    echo Please install Python 3.10+ from https://www.python.org/
    echo and ensure "Add Python to PATH" is checked during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Python detected.
echo [1] Digital Twin Dashboard (index.html) -> http://localhost:8080
echo [2] Digital Twin DOM View (dom.html)    -> http://localhost:8080/dom.html
echo.
echo Starting Industrial Telemetry Server...
echo.

:: Open default browser to the web interface
start "" http://localhost:8080

:: Start the Python telemetry server
python twin_server.py

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [SERVER STOPPED WITH ERROR CODE %errorlevel%]
    pause
)

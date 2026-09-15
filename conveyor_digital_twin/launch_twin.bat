@echo off
echo ===================================================================
echo   Ore Sentinels Condition Monitoring - 3D Digital Twin Launcher
echo ===================================================================
cd /d "%~dp0"
echo Starting Industrial Telemetry Server on http://localhost:8080 ...
start "" http://localhost:8080
python twin_server.py
pause

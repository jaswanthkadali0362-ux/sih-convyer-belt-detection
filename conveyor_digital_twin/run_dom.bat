@echo off
title Ore Sentinels - DOM View Launcher
color 0B
echo ===================================================================
echo     ORE SENTINELS - DOM VIEW (dom.html) LAUNCHER
echo ===================================================================
cd /d "%~dp0"
echo Starting Industrial Telemetry Server and launching dom.html ...
start "" http://localhost:8080/dom.html
python twin_server.py
pause

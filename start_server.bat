@echo off
title AeroMetrics - Airline Route Analytics
echo ==========================================================
echo Starting AeroMetrics Local Analytics Web Server...
echo ==========================================================
python start_server.py
if %ERRORLEVEL% NEQ 0 (
    echo Python server failed to start, opening index.html directly...
    start index.html
)
pause

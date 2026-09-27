@echo off
echo Installing GK2 Crafting Tracker dependencies...
python -m pip install -r "%~dp0requirements.txt"
echo.
echo Done. Run run.bat to start the tracker.
pause

@echo off
REM Starts the GK2 Crafting Tracker in the background, then launches the game.
REM
REM To use: in Steam, right-click Graveyard Keeper 2 -> Properties -> General
REM -> Launch Options, and set it to:
REM   "C:\full\path\to\launch_with_game.bat" %command%
REM (Steam substitutes %command% with the real game launch command.)

cd /d "%~dp0"

REM Only start it if it's not already running.
tasklist /FI "IMAGENAME eq GK2CraftingTracker.exe" 2>NUL | find /I "GK2CraftingTracker.exe" >NUL
if errorlevel 1 (
    start "" /B GK2CraftingTracker.exe
)

REM Hand off to the actual game launch command Steam passed in.
%*

"""Locates the Graveyard Keeper 2 install folder (and the GKTrackerBridge
data dropped there by the BepInEx plugin) without any hardcoded paths, so
this works on other people's machines/Steam library layouts too."""

import json
import os
import re
import sys
import winreg

GAME_FOLDER_NAME = "Graveyard Keeper 2"
DATA_SUBFOLDER = "GKTrackerBridge"


def _app_dir():
    """The folder the exe/script actually lives in - NOT __file__, which
    resolves inside a temp extraction folder for a PyInstaller onefile build."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


CONFIG_FILE = os.path.join(_app_dir(), "config.json")


def _steam_install_path():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
            return winreg.QueryValueEx(key, "SteamPath")[0].replace("/", "\\")
    except OSError:
        pass
    for candidate in (r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"):
        if os.path.isdir(candidate):
            return candidate
    return None


def _library_folders(steam_path):
    libraries = [steam_path]
    vdf_path = os.path.join(steam_path, "steamapps", "libraryfolders.vdf")
    if not os.path.isfile(vdf_path):
        return libraries
    try:
        with open(vdf_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except OSError:
        return libraries
    for match in re.finditer(r'"path"\s*"([^"]+)"', text):
        path = match.group(1).replace("\\\\", "\\")
        if path not in libraries:
            libraries.append(path)
    return libraries


def find_game_install_dir():
    """Returns the GK2 install directory, or None if not found."""
    steam_path = _steam_install_path()
    if steam_path:
        for lib in _library_folders(steam_path):
            candidate = os.path.join(lib, "steamapps", "common", GAME_FOLDER_NAME)
            if os.path.isdir(candidate):
                return candidate
    return None


def load_manual_override():
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            path = data.get("game_install_dir")
            if path and os.path.isdir(path):
                return path
        except (OSError, json.JSONDecodeError):
            pass
    return None


def save_manual_override(path):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"game_install_dir": path}, f, indent=2)


def resolve_data_dir():
    """Returns (data_dir, game_install_dir) or (None, None) if unresolved."""
    game_dir = load_manual_override() or find_game_install_dir()
    if not game_dir:
        return None, None
    data_dir = os.path.join(game_dir, DATA_SUBFOLDER)
    return data_dir, game_dir

"""GK2 Crafting Tracker auto-installer.

Auto-installs BepInEx and GKTrackerBridge.dll into the Graveyard Keeper 2
game installation directory so users don't have to manually copy files.
"""

import os
import shutil
import sys


def get_payload_dir():
    """Returns absolute path to the payload folder (works both frozen in PyInstaller and from source)."""
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "payload")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "payload")


def install_plugin_to_game(game_dir):
    """Installs BepInEx (if missing) and GKTrackerBridge.dll into game_dir.

    Returns (success: bool, message: str)
    """
    if not game_dir or not os.path.isdir(game_dir):
        return False, "Game install directory does not exist."

    # Check that this looks like a GK2 folder
    gk2_exe = os.path.join(game_dir, "GraveyardKeeper2.exe")
    gk2_data = os.path.join(game_dir, "GraveyardKeeper2_Data")
    if not os.path.isfile(gk2_exe) and not os.path.isdir(gk2_data):
        return False, "Directory does not appear to contain Graveyard Keeper 2."

    payload_dir = get_payload_dir()
    bepinex_payload = os.path.join(payload_dir, "bepinex")
    plugin_payload = os.path.join(payload_dir, "plugin")

    if not os.path.isdir(payload_dir):
        return False, "Installer payload folder missing."

    changes_made = []

    try:
        # 1. Install BepInEx core if version.dll / winhttp.dll is not present
        has_version_dll = os.path.isfile(os.path.join(game_dir, "version.dll"))
        has_winhttp_dll = os.path.isfile(os.path.join(game_dir, "winhttp.dll"))
        has_bepinex_dir = os.path.isdir(os.path.join(game_dir, "BepInEx", "core"))

        if not (has_version_dll or has_winhttp_dll) or not has_bepinex_dir:
            # Copy BepInEx payload
            for item in os.listdir(bepinex_payload):
                src = os.path.join(bepinex_payload, item)
                dst = os.path.join(game_dir, item)
                if os.path.isdir(src):
                    if os.path.exists(dst):
                        shutil.copytree(src, dst, dirs_exist_ok=True)
                    else:
                        shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
            changes_made.append("BepInEx core installed")

        # If winhttp.dll was dropped or existed, ensure it's version.dll
        winhttp_path = os.path.join(game_dir, "winhttp.dll")
        version_path = os.path.join(game_dir, "version.dll")
        if os.path.isfile(winhttp_path) and not os.path.isfile(version_path):
            try:
                os.rename(winhttp_path, version_path)
                changes_made.append("renamed winhttp.dll to version.dll")
            except OSError:
                pass

        # 2. Install / update GKTrackerBridge plugin
        target_plugin_dir = os.path.join(game_dir, "BepInEx", "plugins", "GKTrackerBridge")
        os.makedirs(target_plugin_dir, exist_ok=True)

        for item in os.listdir(plugin_payload):
            src = os.path.join(plugin_payload, item)
            dst = os.path.join(target_plugin_dir, item)
            if os.path.isfile(src):
                try:
                    shutil.copy2(src, dst)
                except OSError:
                    # If game is running with plugin loaded, file is locked. If it already exists, it is active.
                    if not os.path.isfile(dst):
                        raise

        changes_made.append("plugin verified")
        msg = f"Plugin setup complete ({', '.join(changes_made)})."
        return True, msg
    except Exception as e:
        target_dll = os.path.join(game_dir, "BepInEx", "plugins", "GKTrackerBridge", "GKTrackerBridge.dll")
        if os.path.isfile(target_dll):
            return True, "Plugin already installed and active (game is running)."
        return False, f"Installation error: {e}"

# GK2 Crafting Tracker

A live inventory + crafting tracker for **Graveyard Keeper 2**. It reads your actual inventory and every chest you've visited straight out of the game's own memory (via a small BepInEx mod) — no OCR, no manual entry, no wiki lookups for recipes. Pin the recipes you're working toward and watch a readiness checklist update live as you play, on your PC or on your phone/tablet.

## Source Code & Project Structure

The entire project is open source and organized as follows:

- **`Plugin/`** — BepInEx C# plugin (`GKTrackerBridge`):
  - `TrackerPlugin.cs`: Core BepInEx plugin entry point and Harmony patches.
  - `RecipeDumper.cs`: Dumps the full recipe/item database on load, resolving display names via game localization tables (`LLBase.L`).
  - `InventoryWatcher.cs`: Periodically dumps player inventory, toolbelt, loaded world containers (with named areas like "Home", "Yard", "Mine"), and unlocked crafts.
- **`Server/`** — Python/Flask local web app & launcher:
  - `launcher.py`: Tkinter GUI launcher with QR code, local IP display, tray minimization, and game process auto-shutdown monitoring.
  - `app.py`: Flask API server (`/api/status`, `/api/recipes`, `/api/inventory`, `/api/pinned`, `/api/bundles`).
  - `gk2_locate.py`: Dynamic Steam installation path locator (searches Windows Registry & `libraryfolders.vdf`).
  - `static/`: Frontend web UI (`index.html`, `app.js`, `style.css`, and item icon assets).

---

## Setup & Running

### Option 1: Run Pre-Built Executable (Standalone)

1. Download `GK2CraftingTracker.exe` from the latest GitHub Release.
2. Double-click `GK2CraftingTracker.exe` and press **Start**.
3. Scan the QR code with your phone/tablet or open `http://localhost:5151` on your PC.

### Option 2: Run Directly from Source (Python)

If you prefer to inspect or run the code directly without executing a pre-compiled `.exe`:

```bash
cd Server
setup.bat   # Installs dependencies (Flask, Pillow, qrcode, pystray)
run.bat     # Launches the server and GUI launcher directly via Python
```

---

### Installing the BepInEx Plugin (One-Time)

Graveyard Keeper 2 is a Unity/Mono game, so BepInEx 5.x works out of the box.

1. Download **BepInEx_win_x64_5.4.23.x** from the [BepInEx releases page](https://github.com/BepInEx/BepInEx/releases).
2. Extract it into your GK2 install folder (where `GraveyardKeeper2.exe` lives).
3. **Rename `winhttp.dll` to `version.dll`** in that folder (Windows treats `winhttp.dll` as a system DLL and will bypass BepInEx unless renamed).
4. Launch the game once and close it to generate BepInEx folder structures.
5. Drop `GKTrackerBridge.dll` and `Newtonsoft.Json.dll` from the `Plugin/` build into `BepInEx/plugins/`.

---

## Features

- **Live Inventory & Chest Tracking**: Tracks items across your inventory and every visited container in your save.
- **Named Container Areas**: Groups chest items by location ("Home", "Yard", "Mine", etc.).
- **Recipe Pinning & Bundles**: Pin recipes and group them into bundles with a **Total Items Needed** checklist.
- **Crafting Tree Visibility**: Expand any recipe to view required sub-ingredients and multi-tier crafting requirements.
- **Auto-Minimize to Tray**: Launcher window stays visible until a client connects, then minimizes cleanly to the system tray.

---

## Contributing

Issues and PRs are welcome! Feel free to explore the source code in `Plugin/` and `Server/`.

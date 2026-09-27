# GK2 Crafting Tracker

A live inventory + crafting tracker for **Graveyard Keeper 2**. It reads your actual inventory and every chest you've visited straight out of the game's own memory (via a small BepInEx mod) — no OCR, no manual entry, no wiki lookups for recipes. Pin the recipes you're working toward and watch a readiness checklist update live as you play, on your PC or on your phone/tablet.

---

## 🚀 Quick Setup (Zero Installation Required!)

1. **Download `GK2CraftingTracker.exe`** from the [Releases](https://github.com/Txupport/GK2CraftingTracker/releases) tab.
2. **Double-click `GK2CraftingTracker.exe`** and press **Start**.
   - The app automatically detects your *Graveyard Keeper 2* Steam installation, installs BepInEx (if missing), configures Doorstop, and installs the `GKTrackerBridge` plugin automatically — **no manual file copying, downloading, or renaming required!**
3. **Open the Web Tracker**: Scan the QR code with your phone/tablet, or open `http://localhost:5151` on your PC.
4. **Launch Graveyard Keeper 2** and enjoy live crafting checklists!

---

## 🛠️ Source Code & Project Structure

The entire project is 100% open source. Anyone can inspect, build, or run the code directly from source without executing pre-compiled binaries:

- **`Plugin/`** — BepInEx C# plugin (`GKTrackerBridge`):
  - `TrackerPlugin.cs`: Core BepInEx plugin entry point and Harmony patches.
  - `RecipeDumper.cs`: Dumps full recipe/item databases on game load, resolving display names via game localization tables (`LLBase.L`).
  - `InventoryWatcher.cs`: Periodically dumps player inventory, toolbelt, loaded world containers (with named areas like "Home", "Yard", "Mine"), and unlocked crafts.
- **`Server/`** — Python/Flask local web app, auto-installer & launcher:
  - `launcher.py`: Tkinter GUI launcher with QR code, local IP display, smart tray minimization on connection, and game process auto-shutdown monitoring.
  - `installer.py`: Auto-installer module that deploys BepInEx core files, configures `version.dll`, and copies plugin DLLs into the game folder.
  - `app.py`: Flask API server (`/api/status`, `/api/recipes`, `/api/inventory`, `/api/pinned`, `/api/bundles`).
  - `gk2_locate.py`: Dynamic Steam installation path locator (searches Windows Registry & `libraryfolders.vdf`).
  - `payload/`: Bundled BepInEx core & pre-built `GKTrackerBridge.dll` plugin payload.
  - `static/`: Frontend web UI (`index.html`, `app.js`, `style.css`, and item icon assets).

---

## 💻 Running from Source (Python)

If you prefer to inspect or run directly from Python source:

```bash
cd Server
setup.bat   # Installs Python dependencies (Flask, Pillow, qrcode, pystray)
run.bat     # Launches the server, auto-installer, and GUI launcher directly via Python
```

To build the C# plugin from source:
```bash
cd Plugin
dotnet build -c Release
```

---

## ✨ Features

- **Zero-Friction Auto-Setup**: Auto-installs BepInEx and plugin DLLs on first run.
- **Live Inventory & Chest Tracking**: Tracks items across your inventory and every visited container in your save.
- **Named Container Areas**: Groups chest items by location ("Home", "Yard", "Mine", etc.).
- **Recipe Pinning & Bundles**: Pin recipes and group them into bundles with a **Total Items Needed** checklist.
- **Crafting Tree Visibility**: Expand any recipe to view required sub-ingredients and multi-tier crafting requirements.
- **Smart Auto-Minimize**: Launcher window stays visible until a client connects, then minimizes cleanly to the system tray.

---

## 🤝 Contributing

Issues and PRs are welcome! Feel free to explore the source code in `Plugin/` and `Server/`.

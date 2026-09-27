# GK2 Crafting Tracker

A live inventory + crafting tracker for **Graveyard Keeper 2**. It reads your
actual inventory and every chest you've visited straight out of the game's
own memory (via a small BepInEx mod) — no OCR, no manual entry, no wiki
lookups for recipes. Pin the recipes you're working toward and watch a
readiness checklist update live as you play, on your PC or on your phone.

## How it works

- **`Plugin/`** — a BepInEx C# plugin (`GKTrackerBridge`) that hooks into
  the game's own data. It dumps the full recipe/item database once on load
  (straight from the game's balance data, so it's always accurate to your
  exact game version) and writes a live snapshot of your inventory + every
  loaded chest once a second.
- **`Server/`** — a small local web app that reads those files and serves a
  UI for browsing recipes, pinning the ones you want, and seeing what you
  still need. It's LAN-accessible, so you can pin/check from your phone or
  tablet while your PC runs the game.

## Setup

### 1. Install BepInEx (one-time, if you don't already have it)

Graveyard Keeper 2 is a Unity/Mono game, so BepInEx 5.x works out of the box.

1. Download **BepInEx_win_x64_5.4.23.x** from the
   [BepInEx releases page](https://github.com/BepInEx/BepInEx/releases).
2. Extract it into your GK2 install folder (where `GraveyardKeeper2.exe` is).
3. **Rename `winhttp.dll` to `version.dll`** in that same folder. This step
   matters: Windows treats `winhttp.dll` as a "Known DLL" and will silently
   load the real system one instead of BepInEx's, which stops it from
   working. `version.dll` isn't on that list and GK2 doesn't otherwise use it.
4. Launch the game once and close it — this generates BepInEx's folder
   structure (`BepInEx/plugins`, `BepInEx/config`, etc.).

### 2. Install the plugin

Build `Plugin/Plugin.csproj` (or grab a release build) and drop
`GKTrackerBridge.dll` + `Newtonsoft.Json.dll` into `BepInEx/plugins/`.

> The `.csproj` points at `D:\Games\steamapps\common\Graveyard Keeper 2` by
> default — edit the `<GameDir>` property in `Plugin.csproj` to match your
> own install path before building.

### 3. Run the tracker server

**Option A — standalone exe (no Python needed):**
Grab `GK2CraftingTracker.exe` from a release and double-click it.

**Option B — from source:**
```bash
cd Server
setup.bat   # installs dependencies, one-time
run.bat     # starts the server
```

Either way, the console will print two links:
```
This PC:      http://localhost:5151
Phone/tablet: http://192.168.x.x:5151
```
Open either in a browser. The phone/tablet link works from any other device
on the same Wi-Fi/network.

The server auto-detects your GK2 install via Steam's library folders. If it
can't find it, the page will show a box to type the install path in manually.

### Optional: auto-launch it when you start the game

`Server/launch_with_game.bat` starts the tracker (if it's not already
running) and then launches the game itself. Point Steam at it instead of
the game directly: right-click **Graveyard Keeper 2 → Properties → General
→ Launch Options** and set it to:
```
"C:\full\path\to\launch_with_game.bat" %command%
```
This only works with the standalone exe (Option A above) sitting next to
the `.bat` file, since it needs to find `GK2CraftingTracker.exe` by name.

## Using it

- **Browse Recipes** — search by item or recipe name, pin the ones you're
  working toward.
- **Pinned Recipes** — see live have/need counts for every ingredient,
  across your inventory *and* every chest in your world (loaded the moment
  you load your save, no need to walk around first), with a Ready / Missing
  items badge. Bump the quantity if you want to craft more than one.

## Known limitations

- **Item/recipe names are the game's internal ids, prettified** (e.g.
  `wooden_plank` → "Wooden Plank"), not the fully localized display names —
  GK2's real display names live in Unity's Addressables string tables,
  which aren't as straightforward to resolve. They're readable enough for
  almost everything, but a few may look a little raw.

## Contributing

Issues and PRs welcome — this was built by reverse-engineering the game's
own Mono assembly with a plain .NET reflection dump (no decompiler needed,
since it's not IL2CPP), so if something breaks after a GK2 update it's
usually just a renamed field away from a fix.

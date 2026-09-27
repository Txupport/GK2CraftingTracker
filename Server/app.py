"""GK2 Crafting Tracker server.

Reads recipes.json / inventory.json written by the GKTrackerBridge BepInEx
plugin and serves a small web UI (reachable from other devices on the LAN)
for pinning recipes and watching live readiness.
"""

import json
import os
import socket
import sys
import threading

from flask import Flask, jsonify, request, send_from_directory

import gk2_locate

app = Flask(__name__, static_folder="static", static_url_path="")

_on_request_callback = None


def set_on_request_callback(cb):
    global _on_request_callback
    _on_request_callback = cb


@app.before_request
def _notify_request():
    if _on_request_callback:
        try:
            _on_request_callback()
        except Exception:
            pass



def _app_dir():
    """The folder the exe/script actually lives in - NOT __file__, which
    resolves inside a temp extraction folder for a PyInstaller onefile build."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


PINNED_FILE = os.path.join(_app_dir(), "pinned.json")
BUNDLES_FILE = os.path.join(_app_dir(), "bundles.json")
_pin_lock = threading.Lock()


def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _load_pinned():
    return _read_json(PINNED_FILE, {})


def _save_pinned(pinned):
    with _pin_lock:
        with open(PINNED_FILE, "w", encoding="utf-8") as f:
            json.dump(pinned, f, indent=2)


def _load_bundles():
    return _read_json(BUNDLES_FILE, [])


def _save_bundles(bundles):
    with _pin_lock:
        with open(BUNDLES_FILE, "w", encoding="utf-8") as f:
            json.dump(bundles, f, indent=2)


def _data_paths():
    data_dir, game_dir = gk2_locate.resolve_data_dir()
    if not data_dir:
        return None, None, None
    return os.path.join(data_dir, "recipes.json"), os.path.join(data_dir, "inventory.json"), game_dir


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/status")
def status():
    recipes_path, inventory_path, game_dir = _data_paths()
    if not game_dir:
        return jsonify({
            "found": False,
            "message": "Couldn't find a Graveyard Keeper 2 install. Set one manually via POST /api/config.",
        })

    recipes_ok = os.path.isfile(recipes_path)
    inventory_ok = os.path.isfile(inventory_path)
    return jsonify({
        "found": True,
        "gameDir": game_dir,
        "recipesFound": recipes_ok,
        "inventoryFound": inventory_ok,
        "recipesModified": os.path.getmtime(recipes_path) if recipes_ok else None,
        "inventoryModified": os.path.getmtime(inventory_path) if inventory_ok else None,
    })


@app.post("/api/config")
def set_config():
    body = request.get_json(force=True, silent=True) or {}
    path = body.get("game_install_dir", "").strip()
    if not path or not os.path.isdir(path):
        return jsonify({"ok": False, "error": "Path does not exist"}), 400
    gk2_locate.save_manual_override(path)
    return jsonify({"ok": True})


@app.get("/api/recipes")
def recipes():
    recipes_path, _, game_dir = _data_paths()
    if not game_dir:
        return jsonify({"items": [], "crafts": []})
    return jsonify(_read_json(recipes_path, {"items": [], "crafts": []}))


@app.get("/api/inventory")
def inventory():
    _, inventory_path, game_dir = _data_paths()
    if not game_dir:
        return jsonify({
            "containers": [],
            "totals": {},
            "unlockedCraftIds": [],
            "oneTimeCompletedCraftIds": [],
            "builtWgoIds": [],
        })

    snapshot = _read_json(inventory_path, {"containers": [], "unlockedCraftIds": []})
    # Backwards-compat: older plugin builds wrote inventory.json as a bare array.
    containers = snapshot if isinstance(snapshot, list) else snapshot.get("containers", [])
    totals = {}
    for container in containers:
        for stack in container.get("items", []):
            totals[stack["id"]] = totals.get(stack["id"], 0) + stack["count"]

    unlocked = [] if isinstance(snapshot, list) else snapshot.get("unlockedCraftIds", [])
    one_time_completed = [] if isinstance(snapshot, list) else snapshot.get("oneTimeCompletedCraftIds", [])
    built_wgos = [] if isinstance(snapshot, list) else snapshot.get("builtWgoIds", [])

    return jsonify({
        "containers": containers,
        "totals": totals,
        "unlockedCraftIds": unlocked,
        "oneTimeCompletedCraftIds": one_time_completed,
        "builtWgoIds": built_wgos,
    })


@app.get("/api/pinned")
def get_pinned():
    return jsonify(_load_pinned())


def _bundles_of(entry):
    """Reads an entry's bundle membership, migrating the old single-`bundle`
    string field (from before multi-bundle support) into the `bundles` list."""
    if "bundles" in entry:
        return entry["bundles"]
    if entry.get("bundle"):
        return [entry["bundle"]]
    return []


@app.post("/api/pinned/<craft_id>")
def pin(craft_id):
    body = request.get_json(force=True, silent=True) or {}
    pinned = _load_pinned()
    existing = pinned.get(craft_id, {})
    qty = max(1, int(body.get("qty", existing.get("qty", 1))))
    bundles_list = body["bundles"] if "bundles" in body else _bundles_of(existing)
    pinned[craft_id] = {"qty": qty, "bundles": bundles_list}
    _save_pinned(pinned)
    return jsonify(pinned)


@app.delete("/api/pinned/<craft_id>")
def unpin(craft_id):
    pinned = _load_pinned()
    pinned.pop(craft_id, None)
    _save_pinned(pinned)
    return jsonify(pinned)


@app.delete("/api/pinned")
def clear_pinned():
    _save_pinned({})
    return jsonify({})


@app.get("/api/bundles")
def get_bundles():
    return jsonify(_load_bundles())


@app.post("/api/bundles")
def create_bundle():
    body = request.get_json(force=True, silent=True) or {}
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Bundle name can't be empty"}), 400
    bundles = _load_bundles()
    if name not in bundles:
        bundles.append(name)
        _save_bundles(bundles)
    return jsonify(bundles)


@app.delete("/api/bundles/<name>")
def delete_bundle(name):
    bundles = [b for b in _load_bundles() if b != name]
    _save_bundles(bundles)
    # Remove this bundle from any pinned recipe's membership rather than orphaning them.
    pinned = _load_pinned()
    changed = False
    for entry in pinned.values():
        current = _bundles_of(entry)
        if name in current:
            entry["bundles"] = [b for b in current if b != name]
            entry.pop("bundle", None)
            changed = True
    if changed:
        _save_pinned(pinned)
    return jsonify(bundles)


def _rank(ip):
    """Lower is better. Prefers ordinary home-LAN ranges over VPN/CGNAT (100.64.0.0/10,
    used by Tailscale/NordLynx/etc.) or other virtual-adapter addresses, since a VPN
    being active shouldn't hijack the address we tell people to use on their phone."""
    octets = [int(p) for p in ip.split(".")]
    if octets[0] == 192 and octets[1] == 168:
        return 0
    if octets[0] == 10:
        return 2
    if octets[0] == 172 and 16 <= octets[1] <= 31:
        return 2
    if octets[0] == 100 and 64 <= octets[1] <= 127:
        return 9  # CGNAT range: Tailscale, NordLynx, carrier-grade NAT, etc.
    return 5


def _candidate_lan_ips():
    hostname = socket.gethostname()
    ips = set()
    try:
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    ips.discard("127.0.0.1")
    return sorted(ips, key=_rank)


if __name__ == "__main__":
    port = 5151
    candidates = _candidate_lan_ips()
    best = candidates[0] if candidates else "127.0.0.1"
    print("GK2 Crafting Tracker running:")
    print(f"  This PC:      http://localhost:{port}")
    print(f"  Phone/tablet: http://{best}:{port}  (same Wi-Fi/network)")
    if len(candidates) > 1:
        others = [ip for ip in candidates if ip != best]
        print(f"  (Other network adapters detected too: {', '.join(others)}.")
        print("   If the address above doesn't work from your phone, try one of those instead.)")
    app.run(host="0.0.0.0", port=port)

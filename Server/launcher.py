"""GK2 Crafting Tracker launcher.

A small window (LAN address + QR code + Start button) instead of a bare
console app. Pressing Start boots the Flask tracker in the background and
minimizes the window to the system tray. Once it has seen Graveyard Keeper 2
running, it closes itself automatically when the game exits - the tracker
is meant to be launched manually, whenever you want it (before or during a
play session), not tied to the game's own launch.
"""

import os
import subprocess
import sys
import threading
import time
import tkinter as tk
import webbrowser
from tkinter import filedialog, font as tkfont, messagebox

import pystray
import qrcode
from PIL import Image, ImageDraw, ImageTk

import app as tracker_app
import gk2_locate
import installer

PORT = 5151
GAME_PROCESS_NAME = "GraveyardKeeper2.exe"
GAME_POLL_SECONDS = 5


def is_game_running():
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {GAME_PROCESS_NAME}", "/NH"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return GAME_PROCESS_NAME.lower() in out.stdout.lower()
    except (OSError, subprocess.SubprocessError):
        return False


def _tray_icon_image():
    img = Image.new("RGB", (64, 64), (11, 11, 11))
    draw = ImageDraw.Draw(img)
    draw.ellipse((6, 6, 58, 58), fill=(196, 30, 58))
    return img


class LauncherApp:

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("GK2 Recipe Tracker")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close_button)

        candidates = tracker_app._candidate_lan_ips()
        self.lan_ip = candidates[0] if candidates else "127.0.0.1"
        self.url = f"http://{self.lan_ip}:{PORT}"

        self.tray_icon = None
        self._server_started = False
        self._connected = False
        self._stop_event = threading.Event()

        tracker_app.set_on_request_callback(self._on_client_request)
        self._build_ui()

    def _build_ui(self):
        title_font = tkfont.Font(size=13, weight="bold")
        mono_font = tkfont.Font(family="Consolas", size=10)

        tk.Label(self.root, text="GK2 Recipe Tracker", font=title_font).pack(
            padx=16, pady=(16, 8)
        )
        tk.Label(
            self.root, text=f"This PC:      http://localhost:{PORT}", font=mono_font
        ).pack(anchor="w", padx=16)
        tk.Label(
            self.root, text=f"Phone/tablet: {self.url}", font=mono_font
        ).pack(anchor="w", padx=16, pady=(0, 10))

        qr_img = qrcode.make(self.url).resize((200, 200))
        self._qr_photo = ImageTk.PhotoImage(qr_img)
        tk.Label(self.root, image=self._qr_photo).pack(pady=4)
        tk.Label(
            self.root, text="Scan to open on your phone/tablet", fg="#888"
        ).pack(pady=(0, 6))

        self.plugin_label = tk.Label(
            self.root, text="", fg="#55aaff", font=("Segoe UI", 9)
        )
        self.plugin_label.pack(pady=(0, 4))

        self.status_label = tk.Label(self.root, text="Not started", fg="#888")
        self.status_label.pack(pady=(0, 6))

        self.start_btn = tk.Button(
            self.root, text="Start", width=22, command=self._on_start
        )
        self.start_btn.pack(pady=(0, 16))

        # Check plugin setup on window load
        self.root.after(100, self._auto_setup_plugin)

    def _auto_setup_plugin(self):
        try:
            _, game_dir = gk2_locate.resolve_data_dir()
            if game_dir:
                ok, msg = installer.install_plugin_to_game(game_dir)
                if ok:
                    self.plugin_label.config(
                        text="✓ Plugin installed to game", fg="#4e9a06"
                    )
                else:
                    self.plugin_label.config(
                        text=f"Plugin: {msg}", fg="#cc0000"
                    )
            else:
                self.plugin_label.config(
                    text="GK2 folder not found (click Start to set)", fg="#888"
                )
        except Exception as e:
            self.plugin_label.config(text=f"Setup note: {e}", fg="#888")

    def _on_start(self):
        if self._server_started:
            return

        try:
            _, game_dir = gk2_locate.resolve_data_dir()
            if not game_dir:
                selected = filedialog.askdirectory(
                    title="Select Graveyard Keeper 2 Installation Folder"
                )
                if selected:
                    gk2_locate.save_manual_override(selected)
                    game_dir = selected

            if game_dir:
                ok, msg = installer.install_plugin_to_game(game_dir)
                if ok:
                    self.plugin_label.config(
                        text="✓ Plugin installed to game", fg="#4e9a06"
                    )
                else:
                    self.plugin_label.config(
                        text=f"Plugin: {msg}", fg="#cc0000"
                    )
        except Exception as e:
            self.plugin_label.config(text=f"Notice: {e}", fg="#888")

        self._server_started = True
        self.start_btn.config(state="disabled")
        self.status_label.config(text="Running - waiting for connection...")

        threading.Thread(target=self._run_server, daemon=True).start()
        threading.Thread(target=self._monitor_game, daemon=True).start()

    def _on_client_request(self):
        if not self._connected and self._server_started:
            self._connected = True
            self.root.after(0, self._on_first_connection)

    def _on_first_connection(self):
        self.status_label.config(text="Client connected! Minimizing to tray...")
        self.root.after(600, self._minimize_to_tray)

    def _run_server(self):
        try:
            tracker_app.app.run(
                host="0.0.0.0", port=PORT, debug=False, use_reloader=False
            )
        except Exception as e:
            self.root.after(0, lambda: self._on_server_error(str(e)))

    def _on_server_error(self, err_msg):
        self._server_started = False
        self.start_btn.config(state="normal")
        self.status_label.config(
            text=f"Server error: port {PORT} occupied", fg="#cc0000"
        )
        messagebox.showerror(
            "Port Error",
            f"Could not start server on port {PORT}.\n\nError: {err_msg}\n\nAnother instance of GK2 Recipe Tracker may already be running!",
        )

    def _minimize_to_tray(self):
        self.root.withdraw()
        if self.tray_icon is None:
            menu = pystray.Menu(
                pystray.MenuItem(
                    "Open in browser", self._open_browser, default=True
                ),
                pystray.MenuItem("Show window", self._restore_window),
                pystray.MenuItem("Quit", self._quit_app),
            )
            self.tray_icon = pystray.Icon(
                "gk2tracker", _tray_icon_image(), "GK2 Recipe Tracker", menu
            )
            threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def _open_browser(self, icon=None, item=None):
        webbrowser.open(self.url)

    def _restore_window(self, icon=None, item=None):
        self.root.after(0, self.root.deiconify)

    def _on_close_button(self):
        if self._server_started:
            self._minimize_to_tray()
        else:
            self.root.destroy()

    def _monitor_game(self):
        seen_running = False
        while not self._stop_event.is_set():
            try:
                running = is_game_running()
                if running:
                    seen_running = True
                elif seen_running:
                    self.root.after(0, self._quit_app)
                    return
            except Exception:
                pass
            time.sleep(GAME_POLL_SECONDS)

    def _quit_app(self, icon=None, item=None):
        self._stop_event.set()
        if self.tray_icon:
            self.tray_icon.stop()
        os._exit(0)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    LauncherApp().run()

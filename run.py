#!/usr/bin/env python3
"""
Python Learning Roadmap — local launcher.

Serves this folder over HTTP and opens the app in your browser.

Your progress is saved in the browser (localStorage), so closing and
reopening the app keeps everything. The port is fixed on purpose: the
browser ties saved data to the address, so a stable port means your
progress is always found in the same place.
"""

import functools
import http.server
import socketserver
import threading
import webbrowser
from pathlib import Path

PORT = 8765


def main() -> None:
    root = Path(__file__).resolve().parent
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(root)
    )
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        url = f"http://127.0.0.1:{PORT}/"
        print(f"Python Learning Roadmap is running at {url}")
        print("Press Ctrl+C to stop.")
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Serve the local site without retaining previous builds in browser caches."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class LocalHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_head(self):
        # A development reload must fetch the current file, even if its timestamp
        # matches a file the browser previously received.
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        return super().send_head()


if __name__ == "__main__":
    site = Path(__file__).resolve().parents[1] / "dist"
    handler = partial(LocalHandler, directory=str(site))
    with ThreadingHTTPServer(("127.0.0.1", 4174), handler) as server:
        print("Flay local: http://127.0.0.1:4174/ (browser cache disabled)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

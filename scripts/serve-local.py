#!/usr/bin/env python3
"""Serve the local site without retaining previous builds in browser caches."""

from functools import partial
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit


class LocalHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_head(self):
        # A development reload must fetch the current file, even if its timestamp
        # matches a file the browser previously received.
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            site = Path(self.directory)
            content = (site / "index.html").read_text(encoding="utf-8")
            # New pages must not reuse assets cached by an older local server.
            for name in ("app.js", "style.css"):
                revision = sha256((site / name).read_bytes()).hexdigest()[:20]
                content = content.replace(f'"{name}"', f'"{name}?v={revision}"')
            body = content.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return BytesIO(body)
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

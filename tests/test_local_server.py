import importlib.util
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import re
import tempfile
from threading import Thread
import unittest
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location(
    "serve_local", Path(__file__).resolve().parents[1] / "scripts/serve-local.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalServerTest(unittest.TestCase):
    def test_reload_uses_current_assets_and_ignores_old_timestamps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text(
                '<link href="style.css"><script src="app.js"></script>'
            )
            (root / "style.css").write_text("body{}")
            (root / "app.js").write_text("old build")
            server = ThreadingHTTPServer(
                ("127.0.0.1", 0), partial(module.LocalHandler, directory=directory)
            )
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"

            def get(path):
                request = Request(base + path, headers={
                    "If-Modified-Since": "Wed, 31 Dec 2099 23:59:59 GMT"
                })
                with urlopen(request) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers["Cache-Control"], "no-store, max-age=0")
                    return response.read().decode()

            try:
                previous = get("/")
                old_script = re.search(r'src="([^"]+)"', previous)[1]
                self.assertIn("app.js?v=", old_script)
                self.assertIn("style.css?v=", previous)
                (root / "app.js").write_text("current build")
                current = get("/?refresh=1")
                script = re.search(r'src="([^"]+)"', current)[1]
                self.assertNotEqual(script, old_script)
                self.assertEqual(get("/" + script), "current build")
                self.assertEqual(get("/index.html"), current)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()

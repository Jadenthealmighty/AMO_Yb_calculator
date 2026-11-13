#!/usr/bin/env python3
"""PhysCalc local server.

Serves this folder at http://localhost:31415 (bound to 127.0.0.1 only, so nothing else on the
network can reach it). Standard library only. The launchd agent from install.sh keeps it running.

    python3 server.py            # run by hand
    PHYSCALC_PORT=8080 python3 server.py
"""
import functools
import http.server
import os

PORT = int(os.environ.get("PHYSCALC_PORT", "31415"))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # always revalidate, so edits to equations/*.js show up on a normal reload
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the log quiet
        pass


def main():
    handler = functools.partial(Handler, directory=ROOT)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"PhysCalc on http://localhost:{PORT}  (serving {ROOT})", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()

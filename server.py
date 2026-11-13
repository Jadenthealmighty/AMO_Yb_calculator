#!/usr/bin/env python3
"""PhysCalc local server.

Serves this folder at http://localhost:31415 (bound to 127.0.0.1 by default; set PHYSCALC_HOST=0.0.0.0
to make it reachable from your LAN / Tailscale). Standard library only. install.sh keeps it running (a launchd agent on
macOS, a systemd user service on Linux).

It also saves the equations you add in the app (Equations tab -> "+ Add") to
equations/custom_equations.js, so they survive clearing the browser and can be copied to another PC.

    python3 server.py            # run by hand
    PHYSCALC_PORT=8080 python3 server.py
"""
import functools
import ipaddress
import http.server
import json
import os
import tempfile

PORT = int(os.environ.get("PHYSCALC_PORT", "31415"))
# 127.0.0.1 = this machine only. Set PHYSCALC_HOST=0.0.0.0 to also serve your LAN and Tailscale.
HOST = os.environ.get("PHYSCALC_HOST", "127.0.0.1")
ROOT = os.path.dirname(os.path.abspath(__file__))
CUSTOM_FILE = os.path.join(ROOT, "equations", "custom_equations.js")
MAX_BODY = 2 * 1024 * 1024
TEXT_FIELDS = ("key", "name", "def", "tex", "returns", "example", "notes", "cat")

CUSTOM_HEADER = """/* Equations added from the app (Equations tab → "＋ Add"). PhysCalc rewrites this file whenever you
 * add, edit or delete one there, so edit them in the app rather than here. To share your equations
 * with another computer, copy this file into its PhysCalc folder (equations/custom_equations.js). */
"""


def clean_equations(data):
    """Keep only the fields the app uses, as plain strings (nothing else is ever written to disk)."""
    items = data.get("equations") if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) > 2000:
        raise ValueError("expected {\"equations\": [...]}")
    out = []
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get("def"), str):
            raise ValueError("every equation needs a 'def' string")
        eq = {k: it[k] for k in TEXT_FIELDS if isinstance(it.get(k), str) and len(it[k]) <= 4000}
        args = it.get("args")
        if isinstance(args, dict):
            eq["args"] = {str(k)[:80]: v[:400] for k, v in args.items() if isinstance(v, str)}
        out.append(eq)
    return out


def write_custom(equations):
    body = json.dumps(equations, ensure_ascii=False, indent=2)
    body = body.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    text = (CUSTOM_HEADER + "(function (g) {\n  var P = g.PhysCalc = g.PhysCalc || {};\n  P.customEquations = "
            + body.replace("\n", "\n  ") + ";\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n")
    os.makedirs(os.path.dirname(CUSTOM_FILE), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(CUSTOM_FILE), prefix=".custom_equations.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, CUSTOM_FILE)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


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

    def _reply(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def _host_ok(hostport):
        """Accept localhost, IP addresses, bare hostnames and .ts.net/.local/.lan names (blocks DNS rebinding
        from arbitrary public domains). Extra names: PHYSCALC_ALLOWED_HOSTS=name1,name2"""
        host = hostport.rsplit(":", 1)[0] if not hostport.endswith("]") else hostport
        host = host.strip("[]").lower()
        extra = {h.strip().lower() for h in os.environ.get("PHYSCALC_ALLOWED_HOSTS", "").split(",") if h.strip()}
        if host in extra or host == "localhost" or "." not in host:
            return True
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return host.endswith((".ts.net", ".local", ".lan", ".home.arpa"))

    def _same_origin(self):
        """Only the PhysCalc page itself may save: other web pages open in the browser are refused."""
        host = self.headers.get("Host", "")
        if not self._host_ok(host):
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin != "http://" + host:
            return False
        return self.headers.get("Content-Type", "").split(";")[0].strip() == "application/json"

    def do_POST(self):
        if self.path.split("?")[0] != "/api/custom-equations":
            return self._reply(404, {"error": "not found"})
        if not self._same_origin():
            return self._reply(403, {"error": "forbidden"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ValueError("bad length")
            equations = clean_equations(json.loads(self.rfile.read(length).decode("utf-8")))
            write_custom(equations)
        except (ValueError, UnicodeDecodeError) as e:
            return self._reply(400, {"error": str(e)})
        except OSError as e:
            return self._reply(500, {"error": str(e)})
        self._reply(200, {"ok": True, "count": len(equations)})


def main():
    handler = functools.partial(Handler, directory=ROOT)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer((HOST, PORT), handler) as httpd:
        print(f"PhysCalc on http://{HOST}:{PORT}  (serving {ROOT})", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()

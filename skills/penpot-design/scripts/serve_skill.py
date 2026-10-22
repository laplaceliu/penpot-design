#!/usr/bin/env python3
"""serve_skill.py — serve this skill directory over loopback HTTP so `execute_code` can SEED the engines by fetch.

Why this file exists (measured, capabilities §0 + engines.md):
  * `execute_code` payloads are capped (~21 KB): "paste the whole file" is impossible for component_factory.js (264 KB)
    or layout_engine.js (60 KB). Fetching sidesteps the cap completely — a 259 KB engine seeds in ~35 ms.
  * The Penpot plugin runs in a browser on THIS machine, so `http://127.0.0.1:<port>/...` is reachable from inside
    `execute_code`, and loopback is exempt from mixed-content blocking (measured: fetch → 200 "pong").
  * CORS: the Penpot origin must be allowed to read the response → this server sends `Access-Control-Allow-Origin: *`.
  * **Binary assets**: the sandbox `fetch` response exposes only `.text()`/`.json()` (no `arrayBuffer`/`blob`), so a
    raster asset reaches `penpot.uploadMediaData` through `/b64/<path>` → base64 text → `atob` → `Uint8Array`
    (measured 2026-10-22; see `references/penpot-capabilities.md` §9 "raster media").

Usage (seed path in execute_code):
    python3 scripts/serve_skill.py                     # default port 8777, binds 127.0.0.1, serves the skill dir
    python3 scripts/serve_skill.py --root .. --port 8778   # serve a project tree (captured source assets) instead
    # then in execute_code:
    #   const src = await (await fetch('http://127.0.0.1:8777/scripts/component_factory.js')).text();
    #   const summary = new Function('storage', 'penpot', 'penpotUtils', src)(storage, penpot, penpotUtils);
    # the engines assign themselves into storage, so `summary` is only the seed report.
    # for a raster asset:
    #   const b64 = await (await fetch('http://127.0.0.1:8778/b64/assets/hero.png')).text();
    #   const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    #   const media = await penpot.uploadMediaData('hero.png', bytes);   →  fills = [{ fillImage: { id: media.id } }]

Security: binds loopback only (override with --bind for a container-only topology, e.g. 0.0.0.0 behind a local compose
network — never expose the repo to a hostile network), serves THIS directory tree only (or --root), rejects paths
outside the root.
"""

import base64
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _root():
    for flag in ('--root',):
        if flag in sys.argv:
            return os.path.abspath(sys.argv[sys.argv.index(flag) + 1])
    env = os.environ.get('SKILL_SERVE_ROOT')
    if env:
        return os.path.abspath(env)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # this skill's directory: URLs hang off it, so /scripts/<file>.js


ROOT = _root()
PORT = int(os.environ.get('SKILL_SERVE_PORT', (sys.argv[sys.argv.index('--port') + 1] if '--port' in sys.argv else '8777')))
BIND = os.environ.get('SKILL_SERVE_BIND', '127.0.0.1')


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/ping.txt':
            return self._send(200, b'pong')
        as_b64 = path.startswith('/b64/')
        if as_b64:
            path = path[len('/b64'):]
        target = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if target.startswith(ROOT) and os.path.isfile(target):
            with open(target, 'rb') as fh:
                data = fh.read()
            if as_b64:
                return self._send(200, base64.b64encode(data), 'text/plain; charset=us-ascii')
            ctype = 'application/javascript; charset=utf-8' if target.endswith('.js') else 'application/octet-stream'
            return self._send(200, data, ctype)
        return self._send(404, b'not found')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print('serving %s on http://%s:%d  (ping: /ping.txt)' % (ROOT, BIND, PORT))
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()

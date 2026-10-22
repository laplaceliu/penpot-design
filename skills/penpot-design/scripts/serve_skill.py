#!/usr/bin/env python3
"""serve_skill.py — serve this skill directory over loopback HTTP so `execute_code` can SEED the engines by fetch.

Why this file exists (measured, capabilities §0 + engines.md):
  * `execute_code` payloads are capped (~21 KB): "paste the whole file" is impossible for component_factory.js (264 KB)
    or layout_engine.js (60 KB). Fetching sidesteps the cap completely — a 259 KB engine seeds in ~35 ms.
  * The Penpot plugin runs in a browser on THIS machine, so `http://127.0.0.1:<port>/...` is reachable from inside
    `execute_code`, and loopback is exempt from mixed-content blocking (measured: fetch → 200 "pong").
  * CORS: the Penpot origin must be allowed to read the response → this server sends `Access-Control-Allow-Origin: *`.

Usage (seed path in execute_code):
    node scripts/serve_skill.py            # default port 8777, binds 127.0.0.1 only
    # then in execute_code:
    #   const src = await (await fetch('http://127.0.0.1:8777/scripts/component_factory.js')).text();
    #   const summary = new Function('storage', 'penpot', 'penpotUtils', src)(storage, penpot, penpotUtils);
    # the engines assign themselves into storage, so `summary` is only the seed report.

Security: binds loopback only (override with --bind for a container-only topology, e.g. 0.0.0.0 behind a local compose
network — never expose the repo to a hostile network), serves THIS directory tree only, rejects paths outside the root.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # this skill's directory: URLs hang off it, so /scripts/<file>.js
PORT = int(os.environ.get('SKILL_SERVE_PORT', '8777'))
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
        target = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if target.startswith(ROOT) and os.path.isfile(target):
            with open(target, 'rb') as fh:
                data = fh.read()
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

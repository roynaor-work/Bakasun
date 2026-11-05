#!/usr/bin/env python3
"""Optional localhost-only preview server; no build or dependencies."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
print(f'Local preview: http://127.0.0.1:{args.port}/preview.html', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()

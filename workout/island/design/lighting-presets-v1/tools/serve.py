#!/usr/bin/env python3
"""Open the downloaded package on loopback only. No internet or dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
url = f'http://127.0.0.1:{server.server_port}/preview.html'
print(url,flush=True)
print('Local preview. Ctrl+C stops the server.',flush=True)
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()

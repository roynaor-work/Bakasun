"""Optional loopback-only static preview. No dependencies and no external calls."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8765),partial(Handler,directory=str(root))).serve_forever()

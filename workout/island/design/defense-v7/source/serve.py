"""Local-only static viewer. No packages, no network at runtime."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8765)
args=parser.parse_args()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(Path(__file__).resolve().parents[1]),**kw)
    def log_message(self,*a): pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()

#!/usr/bin/env python3
"""Local/offline preview server. Python standard library only; loopback only."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import io
import webbrowser
from urllib.parse import urlsplit
import zipfile

ROOT=Path(__file__).resolve().parent
ARCHIVE_NAME="city-buildings-v2-offline.zip"


class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # An extracted archive cannot contain itself. Re-create its download on demand
        # so the same offline button also works when viewing an unpacked copy.
        if urlsplit(self.path).path=="/"+ARCHIVE_NAME and not (ROOT/ARCHIVE_NAME).exists():
            output=io.BytesIO()
            with zipfile.ZipFile(output,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
                for path in sorted(ROOT.rglob("*")):
                    if path.is_file() and path.name!=ARCHIVE_NAME and "__pycache__" not in path.parts:
                        archive.write(path,"city-buildings-v2/"+str(path.relative_to(ROOT)))
            data=output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type","application/zip")
            self.send_header("Content-Disposition",f'attachment; filename="{ARCHIVE_NAME}"')
            self.send_header("Content-Length",str(len(data)))
            self.end_headers();self.wfile.write(data)
        else:super().do_GET()

def main():
    parser=argparse.ArgumentParser(description="Open the City Buildings v2 offline preview")
    parser.add_argument("--port",type=int,default=8765)
    parser.add_argument("--open",action="store_true")
    args=parser.parse_args()
    handler=partial(PreviewHandler,directory=str(ROOT))
    server=ThreadingHTTPServer(("127.0.0.1",args.port),handler)
    url=f"http://127.0.0.1:{server.server_port}/preview.html"
    print(f"City preview: {url}\nPress Ctrl+C to stop.",flush=True)
    if args.open:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=="__main__":main()

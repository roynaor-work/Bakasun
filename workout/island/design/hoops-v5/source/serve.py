"""Loopback preview server with an explicit public-asset allowlist.
It never serves the repository root, dotfiles, app data, or unrelated files.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ISLAND = ROOT.parents[1]
REPO = ISLAND.parents[1]
DEPENDENCIES = {
    'vendor/three.module.js', 'vendor/GLTFLoader.js', 'vendor/DRACOLoader.js', 'vendor/BufferGeometryUtils.js',
    'vendor/draco/draco_wasm_wrapper.js', 'vendor/draco/draco_decoder.wasm',
    'minigames/hoops-draco.mjs', 'minigames/hoops-draco-worker.mjs',
    'minigames/hoops-gltf.mjs', 'minigames/hoops-reflection.mjs',
}

class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):super().__init__(*args,directory=str(REPO),**kwargs)
    def allowed(self):
        request = unquote(urlsplit(self.path).path).lstrip('/')
        if not request:request='workout/island/design/hoops-v5/preview.html'
        candidate = (REPO/request).resolve()
        allowed_preview = candidate.is_relative_to(ROOT) and not candidate.is_relative_to(ROOT/'source')
        allowed_dependency = any(candidate == ISLAND/dep for dep in DEPENDENCIES)
        if not (allowed_preview or allowed_dependency) or any(p.startswith('.') for p in Path(request).parts):
            return False
        self.path='/'+request
        return True
    def do_GET(self):
        if self.allowed():return super().do_GET()
        self.send_error(404)
    def do_HEAD(self):
        if self.allowed():return super().do_HEAD()
        self.send_error(404)
    def log_message(self, *args):pass

def server(port=8765):return ThreadingHTTPServer(('127.0.0.1',port),PreviewHandler)

if __name__=='__main__':
    with server() as httpd:
        print('Preview only: http://127.0.0.1:8765/workout/island/design/hoops-v5/preview.html',flush=True)
        httpd.serve_forever()

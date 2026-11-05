"""Local-only audit support. Never adds CSP or changes a product response."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from contextlib import contextmanager
from urllib.parse import urlsplit, unquote
import threading, json, datetime, subprocess, os

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parents[1]
BASE = '5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275'
CHROMIUM = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
AXE = Path(os.environ.get('AXE_PATH', '/tmp/bakasun-audit-runtime/node_modules/axe-core/axe.min.js'))
FLAGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

def baseline_files():
    changed=subprocess.run(['git','diff','--quiet',BASE,'--','.',':(exclude)audit/2026-11-05'],cwd=ROOT)
    if changed.returncode:raise RuntimeError('Product tree differs from the frozen audit baseline; replay in a separate checkout.')
    return [p for p in subprocess.check_output(['git','ls-tree','-r','--name-only','-z',BASE],cwd=ROOT).decode().split('\0') if p]

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def write_json(path, data):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

class Handler(SimpleHTTPRequestHandler):
    faults = {}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *args): pass
    def do_GET(self):
        fault = self.faults.get(urlsplit(self.path).path)
        if fault:
            self.send_response(fault); self.send_header('Content-Type','text/plain');self.end_headers();self.wfile.write(b'synthetic audit fault');return
        try:super().do_GET()
        except (BrokenPipeError,ConnectionResetError):pass
    def translate_path(self, path):
        # Exercise the GitHub Pages project prefix, not just an origin root.
        clean = unquote(urlsplit(path).path)
        if clean == '/Bakasun': clean = '/'
        elif clean.startswith('/Bakasun/'): clean = clean[8:]
        return super().translate_path(clean)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

@contextmanager
def server(faults=None):
    handler=type('AuditHandler',(Handler,),{'faults':faults if faults is not None else {}})
    srv = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
    try: yield f'http://127.0.0.1:{srv.server_port}/Bakasun/'
    finally: srv.shutdown(); srv.server_close(); t.join()

def block_external(context, base, blocked):
    origin = urlsplit(base).netloc
    def route(r):
        u = urlsplit(r.request.url)
        if u.scheme in ('http', 'https') and u.netloc != origin:
            blocked.append({'host': u.hostname, 'type': r.request.resource_type})
            r.abort('blockedbyclient')
        else: r.continue_()
    context.route('**/*', route)

OBSERVERS = """(() => {
  performance.setResourceTimingBufferSize(5000);
  window.__audit = {lcp: null, longTasks: [], csp: []};
  try {new PerformanceObserver(l => {for (const e of l.getEntries()) window.__audit.lcp = {ms:e.startTime,size:e.size,tag:e.element?.tagName};}).observe({type:'largest-contentful-paint',buffered:true});} catch {}
  try {new PerformanceObserver(l => {window.__audit.longTasks.push(...l.getEntries().map(e=>({ms:e.startTime,duration:e.duration})));}).observe({type:'longtask',buffered:true});} catch {}
  addEventListener('securitypolicyviolation', e => window.__audit.csp.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}));
})()"""

def axe(page):
    page.evaluate(AXE.read_text())
    return page.evaluate("""async () => {
      const r=await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}});
      return {version:axe.version, passes:r.passes.length, incomplete:r.incomplete.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),
        violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,tags:v.tags,
          nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};
    }""")

def snapshot(page):
    return page.evaluate("""() => ({title:document.title,lang:document.documentElement.lang,dir:document.documentElement.dir,
      viewport:{width:innerWidth,height:innerHeight},scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
      csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||null,
      observations:window.__audit,
      resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,type:r.initiatorType,bytes:r.transferSize,decoded:r.decodedBodySize,duration:r.duration})),
      navigation:performance.getEntriesByType('navigation').map(r=>({domContentLoaded:r.domContentLoadedEventEnd,load:r.loadEventEnd,bytes:r.transferSize})),
      serviceWorker:{controller:navigator.serviceWorker?.controller?.scriptURL?.split('/').slice(-2).join('/')||null},
      landmarks:document.querySelectorAll('main,[role=main]').length,
      headings:[...document.querySelectorAll('h1,h2,h3')].slice(0,25).map(e=>({tag:e.tagName})),
      smallTargets:[...document.querySelectorAll('button,a,input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<24||r.height<24)}).slice(0,40).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))
    })""")

# Mask only existing contact/identity surfaces in committed screenshots. DOM/axe
# and product measurements run before screenshot zoom or masking.
MASKS = {'north':['.logo','#footer','#wa','.paylogos'], 'bakasun':[], 'workout':[], 'island':[]}
def shots(page, folder, name, app, far=True):
    masks = [page.locator(s) for s in MASKS.get(app, [])]
    page.screenshot(path=str(folder / f'{name}-near.jpg'), type='jpeg', quality=80, mask=masks, mask_color='#29394a')
    if far:
        if app=='island' and page.evaluate('() => !!window.__island?.view'):
            saved=page.evaluate("() => {const v=window.__island.view;const s={zoom:v.zoom,target:v.target.toArray(),angle:v.angle,elevation:v.elevation};v.overview();return s}")
            page.wait_for_timeout(250)
            page.screenshot(path=str(folder / f'{name}-far.jpg'),type='jpeg',quality=80,mask=masks,mask_color='#29394a')
            page.evaluate('(s)=>{const v=window.__island.view;v.zoom=s.zoom;v.target.fromArray(s.target);v.angle=s.angle;v.elevation=s.elevation;v.resize()}',saved)
            return
        # Explicit screenshot-only 67% page zoom, with the exact requested pixel
        # dimensions. Restore immediately; no metrics are taken at this zoom.
        old = page.evaluate("() => {const z=document.documentElement.style.zoom;document.documentElement.style.zoom='.67';return z}")
        page.wait_for_timeout(200)
        page.screenshot(path=str(folder / f'{name}-far.jpg'), type='jpeg', quality=80, mask=masks, mask_color='#29394a')
        page.evaluate('(z)=>document.documentElement.style.zoom=z', old)


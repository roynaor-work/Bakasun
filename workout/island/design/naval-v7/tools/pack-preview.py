"""Inline local ES modules and assets without a JS build or runtime dependency.

The output opens directly as file://, including a local embedded Draco worker.
Source remains readable under src/; vendored r160 modules are not transpiled.
"""
from pathlib import Path
import re,json,base64,hashlib
ROOT=Path(__file__).resolve().parents[1]
modules={
 'naval-three':'vendor/three.module.js',
 'naval-utils':'vendor/BufferGeometryUtils.js',
 'naval-gltf':'vendor/GLTFLoader.js',
 'naval-draco':'vendor/draco/DRACOLoader.js',
 'naval-ocean':'src/ocean.js',
 'naval-effects':'src/effects.js',
 'naval-crew':'src/crew.js',
 'naval-lighting':'src/lighting.js',
}
names={str((ROOT/p).resolve()):k for k,p in modules.items()}
def rewrite(source,location):
    def change(m):
        before,quote,relative=m.groups()
        if not relative.startswith('.') or not relative.endswith('.js'):
            return m.group(0)
        absolute=str((location.parent/relative).resolve())
        if absolute not in names:raise ValueError('Unregistered module: '+relative)
        return before+quote+names[absolute]+quote
    return re.sub(r'(\bfrom\s*)([\'\"])([^\'\"]+)\2',change,source)
mapping={}
for key,p in modules.items():
    source=rewrite((ROOT/p).read_text(),ROOT/p)
    mapping[key]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
assets={}
for p in sorted((ROOT/'assets').rglob('*')):
    if p.suffix in ('.glb','.png'):assets[p.relative_to(ROOT).as_posix()]=base64.b64encode(p.read_bytes()).decode()
for n in ('draco_wasm_wrapper.js','draco_decoder.wasm'):
    p=ROOT/'vendor/draco'/n;assets[p.relative_to(ROOT).as_posix()]=base64.b64encode(p.read_bytes()).decode()
html=(ROOT/'src/shell.html').read_text()
html=html.replace('/*STYLES*/',(ROOT/'src/style.css').read_text())
html=html.replace('<!--MODULES-->','<script type="importmap">'+json.dumps({'imports':mapping},separators=(',',':'))+'</script>')
html=html.replace('<!--ASSETS-->','<script id="naval-assets" type="application/json">'+json.dumps(assets,separators=(',',':'))+'</script>')
html=html.replace('/*APP*/',rewrite((ROOT/'src/app.js').read_text(),ROOT/'src/app.js'))
(ROOT/'index.html').write_text(html)
report={'file':'index.html','bytes':len(html.encode()),'sha256':hashlib.sha256(html.encode()).hexdigest(),'embeddedAssets':len(assets),'embeddedModules':len(modules),'runtimeNetworkRequired':False,'runtimeBuildRequired':False}
(ROOT/'verification/offline-package.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))

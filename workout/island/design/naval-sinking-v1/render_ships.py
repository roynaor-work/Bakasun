"""Render read-only GLBs with the repository's Three.js/Draco loader.

Requires Python Playwright + Chromium. No third-party art or network downloads.
Only writes transparent render caches to the output directory passed by caller.
"""
import base64
import functools
import http.server
import json
import shutil
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ISLAND = HERE.parents[1]
REPO = ISLAND.parents[1]
SPECS = []
for ship in ('corvette', 'destroyer', 'cruiser', 'carrier'):
    for fleet in ('tide', 'ember'):
        SPECS.append({'id': f'{ship}-{fleet}', 'path': f'design/naval-v7/assets/ships/{ship}-lod0.glb', 'fleet': fleet})
for key, filename in [('patrol', 'boat-patrol-512.glb'), ('gunboat', 'enemy-gunboat-512.glb'), ('legacy-enemy', 'enemy-ship-b-512.glb'), ('legacy-boss', 'boss-ship-512.glb')]:
    SPECS.append({'id': key, 'path': f'assets/models/{filename}', 'fleet': None})
SPECS.append({'id': 'submarine', 'path': 'minigames/naval-view.mjs', 'fleet': None})

HTML = r'''<!doctype html><meta charset="utf-8"><script type="module">
import * as T from '/workout/island/vendor/three.module.js';
import {GLTFLoader} from '/workout/island/vendor/GLTFLoader.js';
import {DRACOLoader} from '/workout/island/vendor/DRACOLoader.js';
import {mergeGeometries} from '/workout/island/vendor/BufferGeometryUtils.js';
const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(800,560);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
document.body.append(renderer.domElement);
const draco=new DRACOLoader().setDecoderPath('/workout/island/vendor/draco/').setWorkerLimit(1);
const loader=new GLTFLoader().setDRACOLoader(draco),texLoader=new T.TextureLoader();
window.renderModel=async spec=>{
 const scene=new T.Scene();
 scene.add(new T.HemisphereLight('#d8ecff','#334853',2.0));
 for(const [color,intensity,pos]of [['#ffe0b6',3.2,[4,12,6]],['#a8d4ff',2,[-8,7,-6]],['#ffffff',2.4,[2,10,-10]]]){
  const light=new T.DirectionalLight(color,intensity);light.position.set(...pos);scene.add(light);
 }
 let model;
 if(spec.id==='submarine'){
  const source=await (await fetch('/workout/island/'+spec.path)).text();
  const fn=source.slice(source.indexOf('\nfunction createSubmarine('));
  const config=await (await fetch('/workout/island/data/config.json')).json();
  const create=new Function('THREE','mergeGeometries','return ('+fn.trim()+')')(T,mergeGeometries);
  model=create({foam:'#d8eff1'},config.minigames.navalDuel.render.effects).root;
 }else model=(await loader.loadAsync('/workout/island/'+spec.path)).scene;
 if(spec.fleet){
  const texture=await texLoader.loadAsync('/workout/island/design/naval-v7/assets/textures/fleet-'+spec.fleet+'-1024.png');
  texture.flipY=false;texture.colorSpace=T.SRGBColorSpace;
  model.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){m.map=texture;m.color.set('#ffffff');m.needsUpdate=true;}});
 }
 let box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
 if(size.x>size.z)model.rotation.y=Math.PI/2;
 box=new T.Box3().setFromObject(model);size=box.getSize(new T.Vector3());
 const center=box.getCenter(new T.Vector3()),scale=10/Math.max(size.x,size.z);
 const root=new T.Group();root.add(model);root.scale.setScalar(scale);
 root.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);scene.add(root);
 const camera=new T.OrthographicCamera(-6.7,6.7,4.69,-4.69,.1,100);
 camera.position.set(16,10,8);camera.lookAt(0,1.25,0);camera.updateProjectionMatrix();
 renderer.render(scene,camera);
 const result=renderer.domElement.toDataURL('image/png');
 const resources=new Set();scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [].concat(o.material||[])){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});resources.forEach(r=>r.dispose());
 return result;
};window.renderReady=true;
</script>'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def render_all(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(QuietHandler, directory=str(REPO))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path, headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width': 800, 'height': 560})
            page.route('**/_naval_render.html', lambda route: route.fulfill(body=HTML, content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/_naval_render.html')
            page.wait_for_function('window.renderReady', timeout=60000)
            for spec in SPECS:
                if (out / (spec['id'] + '.png')).exists():
                    continue
                data = page.evaluate('(spec)=>window.renderModel(spec)', spec)
                (out / (spec['id'] + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))
                print('RENDERED', spec['id'], flush=True)
            browser.close()
        (out / 'sources.json').write_text(json.dumps(SPECS, indent=2) + '\n')
    finally:
        server.shutdown()


if __name__ == '__main__':
    render_all(sys.argv[1])

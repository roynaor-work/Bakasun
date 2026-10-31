#!/usr/bin/env python3
"""Exercise final v2 GLBs through the unchanged design/viewer and motion packages.

Only GLB HTTP responses are redirected in the test browser. No source viewer,
retargeter, motion file, game, or existing asset is modified.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from urllib.parse import urlparse
import argparse
import hashlib
import io
import json
import math
import re
import time
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageOps
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent
REPO = HERE.parents[4]
MODELS = ['soccer-player', 'goalkeeper', 'basketball-player', 'skier']
GAMES = ['soccer', 'hoops', 'alpine']

DEFORMATION = r'''async ({game}) => {
 const THREE=await import('/workout/island/vendor/three.module.js');
 const data=await (await fetch(`/workout/island/design/motion/${game}.json`)).json();
 const api=window.viewerTest,rig=api.rig;
 api.pause();rig.resetBind();
 const targets={shoulders:['LeftShoulder','RightShoulder','LeftArm','RightArm'],elbows:['LeftForeArm','RightForeArm'],hips:['LeftUpLeg','RightUpLeg']};
 const records=[];
 for(const mesh of rig.meshes){
  const a=mesh.geometry.attributes,index=mesh.geometry.index;
  const positions=[],p=new THREE.Vector3();
  for(let i=0;i<a.position.count;i++)positions.push(mesh.getVertexPosition(i,p).clone().applyMatrix4(mesh.matrixWorld));
  const group=i=>Object.fromEntries(Object.entries(targets).map(([name,bones])=>[name,[0,1,2,3].some(k=>a.skinWeight.getComponent(i,k)>.2&&bones.includes(mesh.skeleton.bones[a.skinIndex.getComponent(i,k)].name))]));
  const groups=positions.map((_,i)=>group(i)),edges=[],seen=new Set();
  const idx=index?index.array:Array.from({length:a.position.count},(_,i)=>i);
  for(let i=0;i<idx.length;i+=3)for(const [a,b] of [[idx[i],idx[i+1]],[idx[i+1],idx[i+2]],[idx[i+2],idx[i]]]){
   const lo=Math.min(a,b),hi=Math.max(a,b),key=lo+':'+hi;
   if(seen.has(key))continue;seen.add(key);
   const length=positions[lo].distanceTo(positions[hi]);
   if(length<.002)continue; // Tiny stitch/eyelid triangles are not anatomical envelopes.
   const regions=Object.keys(targets).filter(name=>groups[lo][name]||groups[hi][name]);
   if(regions.length)edges.push({a:lo,b:hi,length,regions});
  }
  records.push({mesh,positions,edges});
 }
 const phases=[0,.125,.25,.375,.5,.625,.75,.875,1],clips=[];
 for(const [name,clip] of Object.entries(data.states)){
  const regions=Object.fromEntries(Object.keys(targets).map(n=>[n,{testedEdges:0,maxStretch:0,minRatio:Infinity,collapsedEdges:0}]));
  let finite=true,vertexSamples=0;
  for(const phase of phases){
   api.selectClip(name);api.seek(phase*clip.durationSeconds);
   for(const rec of records){
    const points=[],p=new THREE.Vector3();
    for(let i=0;i<rec.positions.length;i++){
     rec.mesh.getVertexPosition(i,p).applyMatrix4(rec.mesh.matrixWorld);
     if(![p.x,p.y,p.z].every(Number.isFinite))finite=false;
     points.push(p.clone());vertexSamples++;
    }
    for(const e of rec.edges){
     const ratio=points[e.a].distanceTo(points[e.b])/e.length;
     for(const region of e.regions){const r=regions[region];r.testedEdges++;if(ratio>r.maxStretch){r.maxStretch=ratio;r.worst={phase,vertexIndices:[e.a,e.b],restMeters:e.length,bindPositions:[rec.positions[e.a].toArray(),rec.positions[e.b].toArray()],posedPositions:[points[e.a].toArray(),points[e.b].toArray()],influences:[e.a,e.b].map(i=>[0,1,2,3].map(k=>({bone:rec.mesh.skeleton.bones[rec.mesh.geometry.attributes.skinIndex.getComponent(i,k)].name,weight:rec.mesh.geometry.attributes.skinWeight.getComponent(i,k)})).filter(w=>w.weight>0))};}r.minRatio=Math.min(r.minRatio,ratio);if(ratio<.08)r.collapsedEdges++;}
    }
   }
  }
  for(const r of Object.values(regions)){r.collapsedFraction=r.testedEdges?r.collapsedEdges/r.testedEdges:0;if(!Number.isFinite(r.minRatio))r.minRatio=null;}
  const pass=finite&&Object.values(regions).every(r=>r.testedEdges>0&&r.maxStretch<=2.5&&r.collapsedFraction<=.02);
  clips.push({clip:name,phases,vertexSamples,finite,regions,pass});
  await new Promise(requestAnimationFrame);
 }
 return {scope:'Nine rendered poses per clip; finite skinned vertices and anatomical edge envelopes. Does not replace visual inspection or establish absence of self-intersections.',limits:{minRestEdgeMeters:.002,maxEdgeStretch:2.5,collapseRatio:.08,maxCollapsedFraction:.02},clips,pass:clips.every(c=>c.pass)};
}'''

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def contact_sheet(page, model, game, out):
    states = json.loads((PACKAGE.parent / 'motion' / f'{game}.json').read_text())['states']
    width, height = 300, 330
    sheet = Image.new('RGB', (width * 3, height * len(states)), '#111e29')
    draw = ImageDraw.Draw(sheet)
    for row, (clip, spec) in enumerate(states.items()):
        for col, phase in enumerate([.15, .5, .85]):
            crop = page.evaluate(r'''async ({clip,time})=>{
                viewerTest.selectClip(clip);viewerTest.seek(time);viewerTest.render();
                const THREE=await import('/workout/island/vendor/three.module.js');
                const canvas=document.querySelector('#stage canvas'),width=canvas.clientWidth,height=canvas.clientHeight;
                // Reconstruct the unchanged viewer's fixed default camera only to
                // compute a crop of its real pixels; never change its camera/render.
                const p=viewerTest.rig.snapshot().bones.Root,target=new THREE.Vector3(p[0],.72,p[2]);
                const camera=new THREE.PerspectiveCamera(34,width/height,.01,200);
                camera.position.copy(target).add(new THREE.Vector3(Math.sin(.42)*4.3,1,Math.cos(.42)*4.3));
                camera.lookAt(target);camera.updateMatrixWorld(true);
                let minX=width,minY=height,maxX=0,maxY=0;
                const point=new THREE.Vector3();
                for(const mesh of viewerTest.rig.meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
                    mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).project(camera);
                    const x=(point.x+1)*width/2,y=(1-point.y)*height/2;
                    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
                }
                const padding=Math.max(12,Math.max(maxX-minX,maxY-minY)*.10);
                return [Math.max(0,Math.floor(minX-padding)),Math.max(0,Math.floor(minY-padding)),Math.min(width,Math.ceil(maxX+padding)),Math.min(height,Math.ceil(maxY+padding))];
            }''', {'clip': clip, 'time': phase * spec['durationSeconds']})
            picture = Image.open(io.BytesIO(page.locator('#stage canvas').screenshot())).convert('RGB')
            picture = picture.crop(crop)
            picture = ImageOps.contain(picture, (width, height - 24))
            x = col * width + (width - picture.width) // 2
            y = row * height + 24
            sheet.paste(picture, (x, y))
            draw.text((col * width + 9, row * height + 7), f'{clip} / {phase:.2f}', fill='#d7e5eb')
    target = out / f'{model}-{game}-clips.webp'
    sheet.save(target, quality=85, method=6)
    return target.name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', choices=MODELS)
    parser.add_argument('--game', choices=GAMES)
    parser.add_argument('--out', type=Path, default=PACKAGE / 'verification')
    parser.add_argument('--executable', default='/usr/bin/chromium')
    parser.add_argument('--no-sheets', action='store_true')
    parser.add_argument('--deformation-only', action='store_true', help='Diagnostic run; final evidence requires the default complete viewer checks.')
    args = parser.parse_args()
    models = [args.model] if args.model else MODELS
    games = [args.game] if args.game else GAMES
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sources = [PACKAGE / f'{m}.glb' for m in models]
    sources += [PACKAGE.parent / 'motion' / f'{g}.json' for g in games]
    sources += [PACKAGE.parent / 'characters' / 'rig.json']
    sources += [PACKAGE.parent / 'viewer' / n for n in ['viewer.js', 'viewer.html', 'checks.js', 'retarget.js', 'retarget-map.json', 'animation.js']]
    sources += [HERE / 'check-viewer.py', HERE / 'validate.mjs']
    evidence = {str(p.relative_to(REPO)): digest(p) for p in sources}
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(REPO)))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    diagnostics = {'pageErrors': [], 'consoleErrors': [], 'httpErrors': [], 'nonLocalRequests': [], 'failedRequests': []}
    report = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': evidence,
              'scope': {'models': models, 'games': games, 'viewport': {'width': 1100, 'height': 850}, 'allStatesPerMotionPackage': True, 'fullViewerChecks': not args.deformation_only},
              'method': 'Unchanged design/viewer; HTTP test interception replaces only the requested GLB bytes with characters2 GLBs.',
              'browserFlags': ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'], 'cases': [], 'diagnostics': diagnostics, 'pass': False}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=args.executable, headless=True, args=report['browserFlags'])
            report['browserVersion'] = browser.version
            context = browser.new_context(viewport=report['scope']['viewport'], device_scale_factor=1, service_workers='block')

            def route_request(route):
                url = route.request.url
                if url.startswith(('blob:', 'data:')):
                    route.continue_()
                    return
                parsed = urlparse(url)
                if f'{parsed.scheme}://{parsed.netloc}' != origin:
                    diagnostics['nonLocalRequests'].append(url)
                    route.abort('blockedbyclient')
                    return
                match = re.fullmatch(r'/workout/island/design/characters/(soccer-player|goalkeeper|basketball-player|skier)\.glb', parsed.path)
                if match:
                    route.fulfill(path=str(PACKAGE / f'{match.group(1)}.glb'), content_type='model/gltf-binary')
                else:
                    route.continue_()

            context.route('**/*', route_request)
            page = context.new_page()
            page.set_default_timeout(120000)
            page.on('pageerror', lambda error: diagnostics['pageErrors'].append(str(error)))
            page.on('console', lambda message: diagnostics['consoleErrors'].append(message.text) if message.type == 'error' else None)
            page.on('requestfailed', lambda req: diagnostics['failedRequests'].append({'url': req.url, 'error': req.failure}))
            page.on('response', lambda response: diagnostics['httpErrors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 and not response.url.endswith('favicon.ico') else None)
            page.goto(f'{origin}/workout/island/design/viewer/viewer.html', wait_until='load')
            page.wait_for_function('Boolean(window.viewerTest)')
            page.evaluate('async()=>await window.viewerTest.ready')
            page.evaluate('()=>window.viewerTest.pause()')
            for model in models:
                for game in games:
                    print(f'Checking {model}/{game}', flush=True)
                    result = {'model': model, 'game': game, 'pass': False}
                    report['cases'].append(result)
                    started = time.monotonic()
                    if args.deformation_only:
                        page.evaluate('async({model,game})=>{await viewerTest.selectCharacter(model);await viewerTest.selectGame(game);}', {'model': model, 'game': game})
                        result['viewer'] = {'pass': True, 'diagnosticOnly': True, 'note': 'Full viewer checks skipped; this result cannot serve as final acceptance evidence.'}
                    else:
                        result['viewer'] = page.evaluate('async options=>await window.viewerTest.runAllChecks(options)', {'character': model, 'game': game})
                    print(f'  viewer {"PASS" if result["viewer"]["pass"] else "FAIL"}; {time.monotonic()-started:.1f}s', flush=True)
                    result['deformation'] = page.evaluate(DEFORMATION, {'game': game})
                    if not args.no_sheets:
                        result['contactSheet'] = contact_sheet(page, model, game, out)
                    result['elapsedSeconds'] = round(time.monotonic()-started, 3)
                    result['pass'] = result['viewer']['pass'] and result['deformation']['pass']
                    # Preserve completed results if a later browser case is interrupted.
                    (out / 'viewer-validation.json').write_text(json.dumps(report, indent=2) + '\n')
                    print(f'  anatomy {"PASS" if result["deformation"]["pass"] else "FAIL"}; {len(result["deformation"]["clips"])} clips', flush=True)
            context.close()
            browser.close()
        changed = [str(p.relative_to(REPO)) for p in sources if digest(p) != evidence[str(p.relative_to(REPO))]]
        report['changedDuringRun'] = changed
        report['pass'] = len(report['cases']) == len(models)*len(games) and all(c['pass'] for c in report['cases']) and not changed and not any(diagnostics.values())
    except Exception as error:
        report['fatal'] = repr(error)
        print(f'Fatal: {error!r}', flush=True)
    finally:
        server.shutdown()
        server.server_close()
        (out / 'viewer-validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'{"PASS" if report["pass"] else "FAIL"}: {out / "viewer-validation.json"}', flush=True)
    raise SystemExit(0 if report['pass'] else 1)


if __name__ == '__main__':
    main()

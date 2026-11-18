"""CC0. Capture the actual preview and record ABBA software-renderer measurements.

Run with a root HTTP server: python3 lod/source/measure.py [origin]
Requires the tool environment's Playwright, Pillow, and /usr/bin/chromium.
Does not modify the parent package, game, ops, or repository tests.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = '/workout/island/design/tennis-crowd-3d-v1/lod/'


def main(origin, capture_only=False):
    manifest = json.loads((ROOT/'assets.json').read_text())
    for asset in manifest['assets']:
        raw = (ROOT/asset['file']).read_bytes()
        assert len(raw) == asset['bytes']
        assert hashlib.sha256(raw).hexdigest() == asset['sha256']
        if asset['level'] == 0:
            assert raw == (ROOT.parent/'runtime'/Path(asset['file']).name).read_bytes()
    audit = {'date':datetime.now(timezone.utc).isoformat(), 'errors':[], 'failedRequests':[],
             'cameras':[], 'gallery':[], 'lod0ByteIdentical':True}
    measurements = {'date':audit['date'], 'runs':[], 'summary':[]}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width':1438,'height':1100},device_scale_factor=1)
        page.on('pageerror', lambda e:audit['errors'].append(str(e)))
        page.on('console', lambda m:audit['errors'].append(m.text) if m.type=='error' else None)
        page.on('requestfailed', lambda r:audit['failedRequests'].append({'url':r.url,'failure':r.failure}))
        page.goto(origin+PAGE+'preview.html')
        page.wait_for_function('() => window.lodPreview?.status.ready || window.lodPreview?.status.errors.length', timeout=60000)
        audit['status'] = page.evaluate('() => lodPreview.status')
        assert audit['status']['ready'], audit['status']
        assert audit['status']['modelsLoaded'] == 36
        assert 'SwiftShader' in audit['status']['renderer']
        page.evaluate('() => {lodPreview.pause=true;document.getElementById("auto").checked=false;}')
        audit['wasmBlocked'] = page.evaluate('''async () => {
          try {await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return false;}
          catch(e){return e instanceof WebAssembly.CompileError;}
        }''')
        assert audit['wasmBlocked']
        audit['models'] = page.evaluate('''async () => {
          const T=await import('../../../vendor/three.module.js');
          const {GLTFLoader}=await import('../../../vendor/GLTFLoader.js');
          const {assets}=await (await fetch('assets.json')).json();
          const results=[];
          for(const asset of assets){
            const gltf=await new GLTFLoader().loadAsync(asset.file), mesh=gltf.scene.children[0];
            if(mesh.geometry.index.count/3!==asset.triangles)throw new Error('Triangle mismatch');
            if(!mesh.geometry.getAttribute('_head') || !mesh.userData.headPivot)throw new Error('Missing head control');
            if(!mesh.geometry.morphAttributes.position.length)throw new Error('Missing arms morph');
            const position=mesh.geometry.attributes.position.array,delta=mesh.geometry.morphAttributes.position[0].array;
            for(const weight of [0,.25,.5,.75,1])for(let i=0;i<position.length;i++)
              if(!Number.isFinite(position[i]+delta[i]*weight))throw new Error('Non-finite morph');
            const mixer=new T.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations[0]).play();mixer.setTime(1);
            if(Math.abs(mesh.morphTargetInfluences[0]-1)>1e-6)throw new Error('Animation mismatch');
            mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
            results.push({file:asset.file,triangles:asset.triangles,nativeAnimation:true,morphWeights:[0,.25,.5,.75,1]});
            mesh.geometry.dispose();mesh.material.dispose();
          }
          return results;
        }''')
        # All variants, all levels, three angles and both celebration endpoints.
        # Only actual WebGL screenshots are composed; no illustrated substitutes.
        panels=[]
        for variant in range(12):
            for yaw in [0,90,180]:
                for arms in [0,1]:
                    page.evaluate('(v) => lodPreview.gallery(v)', {'variant':variant,'yaw':yaw,'arms':arms})
                    audit['gallery'].append({'variant':variant,'yaw':yaw,'arms':arms,'rendered':True})
                    if yaw==0 and arms==0:
                        im=Image.open(io.BytesIO(page.locator('#levels').screenshot())).convert('RGB')
                        im.thumbnail((960,274))
                        panel=Image.new('RGB',(960,300),'#101d24');panel.paste(im,(0,26))
                        ImageDraw.Draw(panel).text((12,8),f'Variant {variant+1:02}                 LOD0 / 210                         LOD1 / 90                         LOD2 / 24',fill='#d7ed9d')
                        panels.append(panel)
                    if variant==0 and arms==1:
                        im=Image.open(io.BytesIO(page.locator('#levels').screenshot())).convert('RGB')
                        im.save(ROOT/f'levels-{yaw}.webp',quality=82,method=6)
        sheet=Image.new('RGB',(960,300*12),'#101d24')
        for index,panel in enumerate(panels):sheet.paste(panel,(0,index*300))
        sheet.save(ROOT/'variants.webp',quality=78,method=6)
        shots=[]
        for name in ['landscape','portrait','side','rear','close']:
            page.evaluate('(name)=>lodPreview.setCamera(name)',name)
            for cheer in [0,1]:
                counts=page.evaluate('(celebration)=>lodPreview.frame({seconds:1.3,celebration})',cheer)
                metrics=page.evaluate('()=>lodPreview.getMetrics()')
                assert metrics['instances']==600 and counts['crowdTriangles']<=80000
                audit['cameras'].append({'camera':name,'celebration':cheer,**counts,**metrics})
                if cheer==1 and name!='close':
                    im=Image.open(io.BytesIO(page.locator('#view').screenshot())).convert('RGB');im.thumbnail((685,330))
                    panel=Image.new('RGB',(685,358),'#101d24');panel.paste(im,(0,28))
                    ImageDraw.Draw(panel).text((12,9),f'{name} / {counts["crowdTriangles"]:,} crowd triangles / {counts["crowdDrawCalls"]} draws',fill='#d7ed9d');shots.append(panel)
        montage=Image.new('RGB',(1370,716),'#101d24')
        for i,im in enumerate(shots):montage.paste(im,((i%2)*685,(i//2)*358))
        montage.save(ROOT/'preview.webp',quality=80,method=6)
        print('36 GLBs, 72 gallery poses, 10 full-crowd views captured',flush=True)
        measurements.update({'renderer':audit['status']['renderer'],'browserVersion':browser.version,
          'userAgent':page.evaluate('()=>navigator.userAgent'),'viewport':[1370,660],'devicePixelRatio':1,
          'protocol':'Four cameras, ABBA (LOD0 / distance LOD / distance LOD / LOD0), 30 warmup + 120 measured RAF intervals per run. Static gallery idle; 600 seats; same stand and court geometry; celebration 0.75.',
          'note':'Asset preview, not the full game or a hardware-device result. Original #409 FPS is historical and is not a controlled comparison to this executor.'})
        for name in ([] if capture_only else ['landscape','portrait','side','rear']):
            result=page.evaluate('(camera)=>lodPreview.benchmark({camera,warmup:30,samples:120})',name)
            assert result['viewport']==[1370,660],result['viewport']
            measurements['runs'].extend(result['runs'])
            for mode in ['before','after']:
                group=[r for r in result['runs'] if r['mode']==mode]
                fps=sum(r['samples'] for r in group)/sum(r['samples']/r['fps'] for r in group)
                row={k:v for k,v in group[0].items() if k not in ['frameIntervalsMs','fps']}
                row.update({'fps':fps,'fpsRuns':[r['fps'] for r in group],
                  'medianFrameRunsMs':[r['medianFrameMs'] for r in group], 'p95FrameRunsMs':[r['p95FrameMs'] for r in group]})
                measurements['summary'].append(row)
            (ROOT/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
            print(json.dumps({'camera':name,'runs':[{k:r[k] for k in ['mode','fps','crowdTriangles','sceneTriangles','sceneDrawCalls']} for r in result['runs']]}),flush=True)
        page.set_viewport_size({'width':390,'height':844})
        page.get_by_role('button',name='משחק · גובה',exact=True).click()
        page.evaluate('()=>lodPreview.frame({celebration:1})')
        assert page.locator('#view').bounding_box()['width']<=390
        assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
        audit['mobileLayout']={'viewport':[390,844],'horizontalOverflow':False,'physicalDevice':False}
        # The real controls must redraw every variation and both morph endpoints.
        page.locator('#variant').select_option('11');page.locator('#arms').evaluate('(el)=>el.value="100"');page.locator('#arms').dispatch_event('input')
        page.locator('#mode').select_option('before');assert page.locator('#triangles').inner_text().replace(',','')=='126000'
        page.locator('#mode').select_option('after');assert page.evaluate('()=>lodPreview.getMetrics().triangles<=80000')
        audit['externalRequests']=page.evaluate('() => performance.getEntriesByType("resource").filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)')
        assert not audit['externalRequests']
        assert not audit['errors'],audit['errors']
        assert not audit['failedRequests'],audit['failedRequests']
        browser.close()
    (ROOT/'verification.json').write_text(json.dumps(audit,indent=2)+'\n')
    print('Capture and measurement complete.',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('origin',nargs='?',default='http://127.0.0.1:8765')
    parser.add_argument('--capture-only',action='store_true',help='Capture and audit without replacing FPS measurements')
    args=parser.parse_args()
    main(args.origin.rstrip('/'),args.capture_only)

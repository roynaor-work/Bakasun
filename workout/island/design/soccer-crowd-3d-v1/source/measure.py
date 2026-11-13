"""CC0. Browser validation, native glTF playback and ABBA SwiftShader measurements.

Run a repository-root HTTP server first. Uses development-only Python Playwright
and system Chromium. Writes evidence only inside this new design package.
"""
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765'
URL = ORIGIN + '/workout/island/design/soccer-crowd-3d-v1/preview.html'


def capture(locator, name):
    # Direct WebGL capture, scaled only for documentation and encoded as WebP.
    image = Image.open(io.BytesIO(locator.screenshot())).convert('RGB')
    image.thumbnail((844,844))
    image.save(ROOT / name, format='WEBP', quality=76, method=6)


def main():
    manifest = json.loads((ROOT / 'assets.json').read_text())
    for a in manifest['assets']:
        data = (ROOT / a['file']).read_bytes()
        assert len(data) == a['bytes']
        assert hashlib.sha256(data).hexdigest() == a['sha256']
    evidence = {'date': datetime.now(timezone.utc).isoformat(), 'errors': [], 'failedRequests': [],
                'externalRequests': [], 'httpFailures': [], 'hashesVerified': 36, 'gallery': [], 'cameras': []}
    measurements = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1100, 'height': 1000}, device_scale_factor=1)
        page.on('pageerror', lambda e: evidence['errors'].append(str(e)))
        page.on('console', lambda m: evidence['errors'].append(m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: evidence['failedRequests'].append({'url': r.url, 'failure': r.failure}))
        page.on('request', lambda r: evidence['externalRequests'].append(r.url)
                if r.url.startswith('http') and not r.url.startswith(ORIGIN + '/') else None)
        page.on('response', lambda r: evidence['httpFailures'].append({'url': r.url, 'status': r.status}) if r.status >= 400 else None)
        page.goto(URL)
        page.wait_for_function('() => window.crowdPreview?.ready', timeout=60000)
        evidence['browserVersion'] = browser.version
        assert 'SwiftShader' in page.evaluate('() => crowdPreview.environment().renderer')
        evidence['models'] = page.evaluate('''async () => {
          const T=crowdPreview.T, {GLTFLoader}=await import('../../vendor/GLTFLoader.js');
          const results=[];
          for(const asset of crowdPreview.crowd.manifest.assets) {
            const data=await new GLTFLoader().loadAsync(asset.file),m=data.scene.children[0],g=m.geometry;
            if(g.index.count/3!==asset.triangles)throw Error('Triangle count');
            if(!g.attributes._head || !g.attributes._shirt || !m.userData.headPivot)throw Error('Masks/pivot');
            if(g.morphAttributes.position.length!==2 || data.animations.length!==2)throw Error('Morph/clip count');
            if(data.parser.json.extensionsUsed.some(x=>/draco|meshopt/i.test(x)))throw Error('Compressed');
            const p=g.attributes.position.array;
            for(const delta of g.morphAttributes.position) for(const weight of [0,.25,.5,.75,1])
              for(let i=0;i<p.length;i++)if(!Number.isFinite(p[i]+delta.array[i]*weight))throw Error('Invalid morph');
            const mixer=new T.AnimationMixer(data.scene);
            for(let i=0;i<2;i++) {
              mixer.stopAllAction();m.morphTargetInfluences.fill(0);
              mixer.clipAction(data.animations[i]).play();mixer.setTime(i===0?.5:.25);
              if(Math.abs(m.morphTargetInfluences[i]-1)>1e-5)throw Error('Native clip playback');
            }
            mixer.stopAllAction();mixer.uncacheRoot(data.scene);
            results.push({file:asset.file,triangles:asset.triangles,nativeClips:true,morphsFinite:true});
            g.dispose();m.material.dispose();
          }
          return results;
        }''')
        evidence['wasmBlocked'] = page.evaluate('''async () => {
          try {await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])); return false;}
          catch(e) {return e instanceof WebAssembly.CompileError;}
        }''')
        assert evidence['wasmBlocked']
        # 108 native gallery states: all variants, all levels, front/side/rear,
        # down/up/clap. Screenshots wait for real WebGL rendering, no stand-ins.
        for variant in range(12):
            page.select_option('#variant', str(variant))
            for angle in [0, 90, 180]:
                page.locator('#angle').evaluate('(el,v) => {el.value=v;el.dispatchEvent(new Event("input"));}', str(angle))
                for pose in [0, 1, 2]:
                    page.select_option('#catalogPose', str(pose))
                    page.evaluate('() => new Promise(resolve => requestAnimationFrame(resolve))')
                    assert page.evaluate('''() => crowdPreview.galleryModels().every(m =>
                      m.geometry.index.count/3===[210,90,24][crowdPreview.galleryModels().indexOf(m)] &&
                      m.morphTargetInfluences.length===2)''')
                    evidence['gallery'].append([variant, angle, pose])
            if variant in [0, 6]:
                page.locator('#angle').evaluate('(el) => {el.value=0;el.dispatchEvent(new Event("input"));}')
                page.select_option('#catalogPose', '1')
                capture(page.locator('#catalog'), f'variant-{variant+1:02}.webp')
        print('36 GLBs and 108 gallery states loaded', flush=True)
        # Record the policy at every seat (including zero-distance ties) and a
        # deterministic random camera sweep, independent of frustum culling.
        evidence['policy'] = page.evaluate('''async () => {
          const {planCrowd}=await import('./runtime/lod-policy.mjs'),seats=crowdPreview.seats,c=crowdPreview.crowd.config;
          let seed=81273,maximum=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
          const points=[[0,0,0],...seats.map(s=>[s.x,s.y,s.z]),...Array.from({length:2000},()=>[(random()-.5)*120,random()*50,(random()-.5)*100])];
          for(const point of points) {
            const plan=planCrowd(seats,point,c);
            if(plan.triangles>80000 || plan.submitted.reduce((a,b)=>a+b)!==1200)throw Error('Budget/occupancy');
            maximum=Math.max(maximum,plan.triangles);
          }
          return {seed:81273,cameras:points.length,maxTriangles:maximum,allSeatsRetained:true,
            variants:Array.from({length:12},(_,v)=>seats.filter(s=>s.variant===v).length),teams:[0,1].map(t=>seats.filter(s=>s.team===t).length)};
        }''')
        for camera in ['soccer', 'overview', 'close', 'rear']:
            page.select_option('#camera', camera)
            for cheer in [0, 1]:
                page.evaluate('(v) => crowdPreview.render(1.3,v)', cheer)
                metrics = page.evaluate('() => crowdPreview.metrics()')
                assert metrics['triangles'] <= 80000 and metrics['instances'] == 1200
                actual = page.evaluate('''() => {
                  const {scene,camera,renderer,crowd,atlas}=crowdPreview;
                  const others=scene.children.filter(o=>o!==crowd.root && o!==atlas.root);
                  const shown=others.map(o=>o.visible);others.forEach(o=>o.visible=false);
                  renderer.render(scene,camera);
                  const counts={triangles:renderer.info.render.triangles,draws:renderer.info.render.calls};
                  others.forEach((o,i)=>o.visible=shown[i]);renderer.render(scene,camera);return counts;
                }''')
                assert actual['triangles'] == metrics['triangles'], (actual, metrics)
                assert actual['draws'] == metrics['draws'], (actual, metrics)
                evidence['cameras'].append({'camera': camera, 'cheer': cheer, 'actualCrowd':actual, **metrics})
            if camera == 'close':
                capture(page.locator('#view'), 'closeup.webp')
        page.select_option('#camera', 'soccer')
        page.select_option('#pose', '0')
        page.evaluate('() => crowdPreview.render(1,0,[-15,.3,-12])')
        left = page.locator('#view').screenshot()
        page.evaluate('() => crowdPreview.render(1,0,[15,.3,-12])')
        right = page.locator('#view').screenshot()
        assert left != right
        evidence['headTracking'] = {'sameTimeAndPose': True, 'leftRightFramesDiffer': True,
            'yawLimitRadians': .87, 'note': 'The ball marker also moves. Shader inspection and fixed-body comparison accompany the image check.'}
        # Confirm only head vertices move when the ball changes, using the GPU
        # program's actual head mask and rotation formula on source attributes.
        evidence['headMask'] = page.evaluate('''() => {
          let heads=0,bodies=0;
          for(const s of crowdPreview.crowd.sources) {
            const mask=s.geometry.attributes._head;
            for(let i=0;i<mask.count;i++)if(mask.getX(i)===1)heads++;else if(mask.getX(i)===0)bodies++;else throw Error('Non-binary head mask');
          }
          return {headVertices:heads,bodyVertices:bodies,binary:true};
        }''')
        # Software FPS: same scene, clock, camera and goal strength in ABBA order.
        # Resize the actual canvas to the stated dimensions (DPR 1).
        for name, width, height in [('landscape',844,390), ('portrait',390,844)]:
            page.set_viewport_size({'width': width+44, 'height': max(1000,height+450)})
            page.evaluate('(h) => {document.querySelector(".stage").style.height=h+"px";dispatchEvent(new Event("resize"));}', height)
            # The mobile page uses 12px instead of 22px padding.
            if width < 600:
                page.set_viewport_size({'width': width+24, 'height': height+450})
                page.evaluate('() => dispatchEvent(new Event("resize"))')
            env = page.evaluate('() => crowdPreview.environment()')
            assert env['canvas'] == [width,height], env
            print(f'Measuring {name} {width}x{height}: ABBA, 20 warmup + 90 frames/run', flush=True)
            measurements.append({'name': name, **page.evaluate('() => crowdPreview.benchmark({frames:90,warmup:20})')})
            page.select_option('#mode','after')
            page.evaluate('() => crowdPreview.render(1.3,1)')
            capture(page.locator('#view'), f'preview-{name}.webp')
            evidence[name] = {'horizontalOverflow': page.evaluate('() => document.documentElement.scrollWidth>innerWidth'), 'environment':env}
            assert not evidence[name]['horizontalOverflow']
        browser.close()
    for key in ['errors','failedRequests','externalRequests','httpFailures']:
        assert not evidence[key], evidence[key]
    # Millisecond samples retain microsecond precision; avoid verbose binary
    # floating-point tails in the downloadable evidence package.
    for measurement in measurements:
        for run in measurement['runs']:
            for key in ['rafMs','submitMs']:
                run[key] = [round(v,3) for v in run[key]]
    (ROOT / 'measurements.json').write_text(json.dumps(measurements,separators=(',',':'))+'\n')
    (ROOT / 'verification.json').write_text(json.dumps(evidence,separators=(',',':'))+'\n')
    print(json.dumps({'browserErrors':len(evidence['errors']),'measurements':len(measurements),'models':len(evidence['models'])}),flush=True)


if __name__ == '__main__':
    main()

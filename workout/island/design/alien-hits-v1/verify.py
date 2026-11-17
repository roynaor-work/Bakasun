#!/usr/bin/env python3
"""Validate media bytes/alpha/frames/audio and the real 844x390 browser demo.

Python, Pillow, NumPy, FFmpeg/FFprobe, Playwright, Chromium. No network needed.
Writes verification.json and two screenshots INSIDE this package only.
"""
from array import array
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import math
import subprocess
import threading
from PIL import Image
import numpy as np
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[3]


def check_media(m):
    results={'hashes':0,'frames':0,'atlases':[],'audio':[]}
    for f in m['files']:
        data=(ROOT/f['path']).read_bytes()
        assert len(data)==f['bytes'],f['path']
        assert hashlib.sha256(data).hexdigest()==f['sha256'],f['path']
        results['hashes']+=1
    atlases={}
    for a in m['atlases']:
        im=Image.open(ROOT/a['path'])
        assert im.format=='PNG' and im.mode=='RGBA'
        assert im.size==(a['width'],a['height'])
        assert (ROOT/a['path']).stat().st_size<=600000
        arr=np.asarray(im)
        assert (arr[:,:,3]==0).any() and (arr[:,:,3]>0).any()
        assert (arr[:,:,:3][arr[:,:,3]==0]==0).all(),'RGB matte on transparent pixels'
        atlases[a['path']]=im
        results['atlases'].append({'path':a['path'],'bytes':a['bytes'],'size':list(im.size),'rgba':True})
    occupied={k:set() for k in atlases}
    for key,c in m['clips'].items():
        im=atlases[c['atlas']]
        hashes=[]
        for f in c['frames']:
            x,y,w,h=[f[k] for k in ['x','y','w','h']]
            assert 0<=x<x+w<=im.width and 0<=y<y+h<=im.height
            assert (x,y) not in occupied[c['atlas']],f'overlap: {key}'
            occupied[c['atlas']].add((x,y))
            tile=np.asarray(im.crop((x,y,x+w,y+h)))
            a=tile[:,:,3]
            assert a.max()>0,f'blank cel: {key}'
            assert not a[:3].any() and not a[-3:].any() and not a[:,:3].any() and not a[:,-3:].any(),f'edge bleed: {key}'
            hashes.append(hashlib.sha256(tile.tobytes()).hexdigest())
            results['frames']+=1
        assert len(set(hashes))==len(hashes),f'duplicate animation frames: {key}'
    for k in ['impact-small','impact-medium','impact-large','absorb']:
        assert len(m['clips'][k]['frames'])==6
    assert len(m['clips']['explosion']['frames'])==10
    areas=[]
    for k in ['impact-small','impact-medium','impact-large']:
        c=m['clips'][k];f=c['frames'][2]
        a=np.asarray(atlases[c['atlas']].crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h'])))[:,:,3]
        areas.append(int((a>24).sum()))
    assert areas[0]<areas[1]<areas[2],areas
    results['impactAreasPx']=areas
    for sound in m['audio']:
        peaks=[]
        rms=[]
        for path in sound['sources']:
            assert (ROOT/path).stat().st_size<=40000
            info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(ROOT/path)]))['streams'][0]
            assert info['codec_name'] in ['vorbis','mp3']
            assert info['channels']==1 and int(info['sample_rate'])==44100
            raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/path),'-f','f32le','-ac','1','pipe:1'])
            samples=np.frombuffer(raw,dtype='<f4')
            assert np.isfinite(samples).all() and .01<abs(samples).max()<.99
            assert .8*sound['durationMs']<=len(samples)/44.1<=sound['durationMs']+100
            assert abs(samples.mean())<.01,'DC offset'
            assert abs(samples[-128:]).max()<.04,'abrupt tail'
            peaks.append(round(float(20*np.log10(abs(samples).max())),2))
            rms.append(round(float(20*np.log10(np.sqrt((samples**2).mean()))),2))
        results['audio'].append({'id':sound['id'],'decodedPeakDbFS':peaks,'decodedRmsDbFS':rms,
                                  'sources':sound['sources'],'bytes':[(ROOT/p).stat().st_size for p in sound['sources']]})
    return results


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


def check_browser():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(REPO)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[]
    failures=[]
    checks=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
            page=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=1)
            page.on('pageerror',lambda err:errors.append(str(err)))
            page.on('response',lambda r: failures.append(f'{r.status} {r.url}') if r.status>=400 else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/alien-hits-v1/preview.html')
            page.wait_for_function('window.alienHitsPreview?.state.ready')
            page.click('#pause')
            assert page.get_attribute('#pause','aria-pressed')=='true'
            for power in range(3):
                page.click(f'[data-power="{power}"]')
                page.evaluate('alienHitsPreview.step(.3)')
                hit=page.evaluate('alienHitsPreview.inspect()')
                assert hit['hits']==1 and hit['rearHits']==0 and not hit['liveProjectile'],hit
                assert hit['effectCount']==2
                page.evaluate('alienHitsPreview.step(.26)')
                assert page.evaluate('alienHitsPreview.inspect().effectCount')==0
            checks.append('All 3 impact powers: exactly one target, no live projectile, both one-shots cleaned up')
            page.click('#replay');page.evaluate('alienHitsPreview.step(.8)')
            assert page.evaluate('alienHitsPreview.inspect().hits')==1
            assert page.evaluate('alienHitsPreview.inspect().rearHits')==0
            checks.append('Swept contact over a long .8 s step stops at front hull')
            page.click('#replay');page.evaluate('alienHitsPreview.step(.3)')
            before=page.evaluate('alienHitsPreview.inspect()');page.evaluate('alienHitsPreview.step(.12)')
            after=page.evaluate('alienHitsPreview.inspect()')
            assert before['localContact']==after['localContact']
            assert before['contact']!=after['contact']
            checks.append('Local contact persists and follows moving/rotating hull')
            for ship in range(5):
                page.select_option('#ship',str(ship))
                for damage in range(5):
                    page.select_option('#damage',str(damage));page.evaluate('alienHitsPreview.step(.02)')
                    assert page.locator('#layerNames').inner_text()
            checks.append('All 25 ship/damage combinations render')
            for id in ['hit-01','hit-02','hit-03','crack','explosion']:
                page.click(f'[data-sound="{id}"]')
                page.wait_for_function('(id)=>alienHitsPreview.state.lastSound===id',arg=id)
                assert page.evaluate('alienHitsPreview.state.soundError') is None
            # Independently decode ALL ten browser source formats, including MP3 fallback.
            decoded=page.evaluate('''async () => {
              const ac=new AudioContext();const out=[];
              for(const a of alienHitsPreview.manifest.audio)for(const src of a.sources){
                const b=await ac.decodeAudioData(await (await fetch(src)).arrayBuffer());
                out.push({src,duration:b.duration,channels:b.numberOfChannels});
              }await ac.close();return out;
            }''')
            assert len(decoded)==10 and all(a['channels']==1 for a in decoded)
            checks.append('Five audition controls play; all 10 OGG/MP3 sources decode in Chromium')
            page.click('#destroy');assert page.evaluate('alienHitsPreview.inspect().deathVisible')
            page.evaluate('alienHitsPreview.step(.501)')
            death=page.evaluate('alienHitsPreview.inspect()')
            assert death['dead'] and not death['deathVisible'] and not death['liveProjectile']
            checks.append('Death removes hull/overlays; 10-frame one-shot ends at 500 ms')
            page.select_option('#ship','1');page.select_option('#damage','4')
            page.click('[data-power="2"]');page.evaluate('alienHitsPreview.step(.34)')
            page.screenshot(path=str(ROOT/'preview-844x390.png'))
            overflow=page.evaluate('({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})')
            assert overflow=={'width':844,'height':390},overflow
            page.set_viewport_size({'width':390,'height':844})
            page.wait_for_function("Math.abs(document.getElementById('stage').getBoundingClientRect().width-390)<1")
            bounds=page.locator('#stage').bounding_box()
            assert bounds and abs(bounds['x'])<1 and bounds['y']>=0,bounds
            page.screenshot(path=str(ROOT/'preview-390x844.png'))
            assert page.evaluate('document.documentElement.scrollWidth')==390
            shot=np.asarray(Image.open(ROOT/'preview-390x844.png'))
            assert shot.std()>15,'blank scaled preview'
            checks.append('844x390 native canvas and 390x844 scaled portrait have no horizontal overflow')
            page.emulate_media(reduced_motion='reduce');page.reload();page.wait_for_function('alienHitsPreview.state.ready')
            assert page.evaluate('alienHitsPreview.state.paused')
            checks.append('Reduced motion starts paused; explicit play available')
            browser.close()
    finally:server.shutdown()
    assert not errors,errors
    assert not failures,failures
    return {'checks':checks,'pageErrors':errors,'httpFailures':failures,'decodedAudio':decoded,
            'screenshots':['preview-844x390.png','preview-390x844.png']}


def main():
    manifest=json.loads((ROOT/'manifest.json').read_text())
    result={'media':check_media(manifest),'browser':check_browser()}
    (ROOT/'verification.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'frames':result['media']['frames'],'hashes':result['media']['hashes'],
                      'browserChecks':len(result['browser']['checks']),'pageErrors':result['browser']['pageErrors']}))


if __name__=='__main__':main()

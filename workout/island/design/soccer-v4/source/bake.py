"""Bake the repository's calibrated IK into portable, in-place GLB tracks."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
RAW = Path('/tmp/soccer-v4-bake')

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main():
    RAW.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(REPO)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'])
            page = browser.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/characters2/preview.html')
            page.evaluate('async()=>await characters2.ready')
            for model in ['soccer-player', 'goalkeeper']:
                page.evaluate('async id=>await characters2.selectCharacter(id)', model)
                data = page.evaluate('''async model => {
                  const {sample} = await import('../viewer/animation.js');
                  const T = await import('../../vendor/three.module.js');
                  const get = async p => (await fetch(p)).json();
                  const base = await get('../motion/soccer.json');
                  const extra = await get('../motion2/soccer.json');
                  const throws = await get('../motion2/soccer/throws-receives.json');
                  const specs = [
                    ['idle', [[base.states.idle]], true],
                    ['run', [[base.states.run]], true],
                    ['sprint', [[base.states.run]], true, .56],
                    ['kick', [[base.states.kick]], false],
                    ['pass', [[extra.states.short_pass]], false],
                    ['throw_in', [['throw_in_prepare','throw_in_release','throw_in_follow'].map(n=>throws.states[n])], false],
                  ];
                  if(model==='goalkeeper') specs.push(
                    ['keeper_throw', [[throws.states.goalkeeper_throw]], false],
                    ['keeper_punt', [[extra.states.keeper_punt]], false],
                    ['keeper_dive_left', [[extra.states.keeper_dive_side_left]], false],
                    ['keeper_dive_right', [[extra.states.keeper_dive_side_right]], false]
                  );
                  const rig=characters2.rig, out=[];
                  for(const [id,wrapped,loop,override] of specs){
                    const parts=wrapped[0], sourceDuration=parts.reduce((s,c)=>s+c.durationSeconds,0);
                    const duration=override||sourceDuration;
                    // Include source boundaries and presentation markers exactly.
                    const times=new Set([0,duration]); let cursor=0;const events=[];
                    for(const clip of parts){
                      times.add(cursor/sourceDuration*duration);
                      for(const e of clip.events||[]) {const t=e.atSeconds??e.time*clip.durationSeconds;const atSeconds=(cursor+t)/sourceDuration*duration;times.add(atSeconds);events.push({...e,atSeconds});}
                      cursor+=clip.durationSeconds;
                    }
                    for(let i=0;i<=Math.ceil(duration*30);i++)times.add(Math.min(duration,i/30));
                    const frames=[];
                    for(const time of [...times].sort((a,b)=>a-b)){
                      let t=time/duration*sourceDuration, clip=parts.at(-1);
                      for(const part of parts){if(t<=part.durationSeconds+1e-9){clip=part;break;}t-=part.durationSeconds;}
                      const pose=sample(clip,t,false);
                      if(id==='sprint'){
                        pose.rotations.Spine=new T.Quaternion().fromArray(pose.rotations.Spine).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.13)).toArray();
                        pose.rotations.Chest=new T.Quaternion().fromArray(pose.rotations.Chest).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.05)).toArray();
                      }
                      rig.apply(pose,{referenceRoot:pose.referenceRootTranslationMeters,contacts:pose.contacts,floor:true});
                      rig.bones.Root.position.x=0;rig.bones.Root.position.z=0;rig.update();
                      frames.push({time,bones:Object.fromEntries(Object.entries(rig.bones).map(([n,b])=>[n,{rotation:b.quaternion.toArray(),translation:b.position.toArray()}]))});
                    }
                    out.push({id,duration,loop,events,frames,sourceParts:parts.map(p=>p.id||p.name||null)});
                  }
                  return out;
                }''', model)
                (RAW / f'{model}.json').write_text(json.dumps(data, separators=(',', ':')))
                print(model, [(x['id'], len(x['frames'])) for x in data])
            browser.close()
    finally:
        server.shutdown(); server.server_close()

if __name__ == '__main__': main()

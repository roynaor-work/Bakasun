// Basketball v24.1, Roy: "upgraded players with the shared character". The athlete-body-v2 guard / wing / centre (the soccer v24 body:
// hands, number on the back and the shorts) and the hoops-motion-v13 locomotion, dribbles and jump shot on them, each behind its switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from '../workout/island/vendor/three.module.js';
import {decodeTallPack,chooseTallMotion,pickGait,GAIT_TABLE} from '../workout/island/minigames/hoops-tall.mjs';
import {prepareV13,alignSharedV12,hoopsV13Gaits,footfall,shiftLoop,V13_USE,V13_CLIPS,GAIT_FOOTFALL,V13_MAX_RATE} from '../workout/island/minigames/hoops-motion-v13.mjs';
import {V22_LEG_RATIO} from '../workout/island/minigames/athlete-body-v22.mjs';
import {HOOPS_V2_BODY_SHAPES,loadHoopsBodyV2} from '../workout/island/minigames/hoops-body-v2.mjs';

const island=new URL('../workout/island/',import.meta.url);
const json=rel=>JSON.parse(readFileSync(new URL(rel,island),'utf8'));
const sha=async rel=>createHash('sha256').update(await readFile(new URL(rel,island))).digest('hex');
const v13=()=>prepareV13(json('assets/hoops-v241/motion/motion-v13.json'),decodeTallPack);
const v12=()=>decodeTallPack(json('assets/hoops-tall/motion-v12.json'));

test('v13 runtime copy: the eight clips the game plays, canonical profile, every clip record as in the pack (tall-v12 encoding)',()=>{
  const j=json('assets/hoops-v241/motion/motion-v13.json');
  assert.deepEqual(Object.keys(j.clips).sort(),[...V13_CLIPS].sort());
  assert.equal(j.version,1);assert.equal(j.fps,30);assert.deepEqual(j.profiles.canonical.hips,[0,.86,0]);
  assert.equal(j.source.pack,'codex/hoops-motion-v13');assert.match(j.source.sha256,/^[0-9a-f]{64}$/);assert.equal(j.source.license,'CC0-1.0');
  const offline=json('offline-manifest.json');assert.ok(offline.games.hoops.includes('assets/hoops-v241/motion/motion-v13.json'));
});

test('one footfall for every gait that shares the phase: v13 jog / run / sprint / run dribble and v12 walk / sprint dribble at 0.33',()=>{
  const p=v13(),q=v12();
  for(const id of ['jog','run','sprint','dribble_run'])assert.ok(Math.abs(footfall(p.pack.clips[id]).phase-GAIT_FOOTFALL)<.04,id+' '+footfall(p.pack.clips[id]).phase);
  const before={walk:footfall(q.clips.walk,V22_LEG_RATIO.wing).phase,sprint_ball:footfall(q.clips.sprint_ball,V22_LEG_RATIO.wing).phase};
  assert.ok(Math.abs(before.walk-GAIT_FOOTFALL)>.15&&Math.abs(before.sprint_ball-GAIT_FOOTFALL)>.15,'v12 was not aligned: '+JSON.stringify(before));
  alignSharedV12(q,V22_LEG_RATIO.wing);
  for(const id of ['walk','sprint_ball'])assert.ok(Math.abs(footfall(q.clips[id],V22_LEG_RATIO.wing).phase-GAIT_FOOTFALL)<.04,id);
  // the soles never go through the floor in the turned clips (canonical metres, the QA tool's sole point)
  for(const id of ['jog','run','sprint','dribble_run'])assert.ok(footfall(p.pack.clips[id]).min>-.005,id+' min '+footfall(p.pack.clips[id]).min);
});

test('shiftLoop turns whole frames, keeps the loop closed and moves the events with them',()=>{
  const c=v13().pack.clips.dribble_stand,s=shiftLoop(c,.25),n=c.frames-1,k=Math.round(.25*n);
  assert.equal(s.frames,c.frames);
  for(let i=0;i<72;i++)assert.equal(s.quat[i],c.quat[k*72+i],'frame 0 of the result is frame k');
  for(let i=0;i<72;i++)assert.equal(s.quat[n*72+i],s.quat[i],'the loop end repeats the start');
  assert.deepEqual(s.ball.slice(0,3),c.ball.slice(k*3,k*3+3));
  const shift=k/30;for(const t of s.events.contact)assert.ok(c.events.contact.some(u=>Math.abs(((u-shift)%c.duration+c.duration)%c.duration-t)<1e-3),'contact '+t);
  assert.equal(new Set(s.events.contact).size,s.events.contact.length,'the loop ends are one event');
});

test('per-body gait tables: references x the skeleton scale, rates inside 0.5-1.8, the v12 walk and sprint dribble keep their references',()=>{
  const p=v13(),q=v12();
  for(const [body,scale] of [['guard',1.086],['wing',1.144],['center',1.202]]){
    const g=hoopsV13Gaits(p.pack,scale,q.clips);
    assert.equal(g.gaits.find(e=>e.name==='run').ref,+(2.2*scale).toFixed(3),body);
    assert.equal(g.gaits.find(e=>e.name==='walk').ref,q.clips.walk.refSpeed);
    assert.equal(g.dribble.find(e=>e.name==='sprint_ball').rate,q.clips.sprint_ball.refSpeed);
    for(let speed=.6;speed<=7.3;speed+=.1){
      const plan=chooseTallMotion({clips:{...q.clips,...Object.fromEntries(p.byGame)}},{vx:0,vz:speed,face:0,hasBall:false},{gaits13:g},{gait:null});
      assert.ok(plan.rate>=.5&&plan.rate<=V13_MAX_RATE+1e-9,body+' '+speed.toFixed(1)+' '+plan.clip+' '+plan.rate);
      if(speed>=1.7&&speed<=6.5)assert.ok(['jog','run','sprint'].includes(plan.clip),body+' '+speed.toFixed(1)+' '+plan.clip);
    }
  }
});

test('the motion plan with the v13 tables: stands, runs, dribbles on the spot with the full-body clip, sprints with the v12 dribble above ~4 m/s',()=>{
  const p=v13(),q=v12(),pack={clips:{...q.clips,...Object.fromEntries(p.byGame)}},g=hoopsV13Gaits(p.pack,1.144,q.clips),st=()=>({gait:null,dribbleGait:null});
  assert.equal(chooseTallMotion(pack,{vx:0,vz:0,face:0},{gaits13:g},st()).clip,'idle_ready');
  assert.equal(chooseTallMotion(pack,{vx:0,vz:2.5,face:0},{gaits13:g},st()).clip,'run');
  const stand=chooseTallMotion(pack,{vx:0,vz:0,face:0,hasBall:true,dribbling:true},{gaits13:g},st());
  assert.deepEqual([stand.kind,stand.clip,stand.dribble],['loop','dribble_stand',true]);
  assert.equal(chooseTallMotion(pack,{vx:0,vz:3,face:0,hasBall:true,dribbling:true},{gaits13:g},st()).clip,'run_ball');
  assert.equal(chooseTallMotion(pack,{vx:0,vz:5.5,face:0,hasBall:true,dribbling:true},{gaits13:g},st()).clip,'sprint_ball');
  // without the tables: exactly the v12 plan (the switch off)
  assert.deepEqual(chooseTallMotion({clips:q.clips},{vx:0,vz:0,face:0,hasBall:true,dribbling:true},{},st()),{kind:'layer',upper:'dribble_right',lower:'idle_ready_ball',rate:1,group:'dribble'});
  assert.equal(pickGait(GAIT_TABLE.gaits,.2),'idle_ready');assert.equal(pickGait(GAIT_TABLE.dribble,.2),'dribble_walk_right');
});

test('v13 jump shot under the jump shot and the three: events the shot timing reads (takeoff, release, land)',()=>{
  const p=v13();
  for(const name of ['jump_shot','three_point']){const c=p.byGame.get(name);assert.equal(c.v13,'jump_shot');for(const e of ['takeoff','release','land'])assert.ok(c.events[e]?.length,name+' '+e);assert.ok(c.events.takeoff[0]<c.events.release[0]&&c.events.release[0]<c.events.land[0]);}
  assert.deepEqual(Object.keys(V13_USE).sort(),['dribble_stand','idle_ready','idle_ready_ball','jog','jog_ball','jump_shot','run','run_ball','sprint','three_point']);
});

test('athlete-body-v2 basketball bodies: the pack files byte for byte, the v22 rig and atlas, the glove morph off, hands and region colours',async()=>{
  const want={guard:'e136c3348565359571a55bfa9474846919d4ff576a75a1489bbd2eda46b1930e',wing:'f2f4fad89a714de5ce68f507bf8ed640c2ac40e25be1ee435994e6b7f70f0ab8',center:'9bec85f4464c7a0d546240b831601975b4424a2f545b92d2283452d3ef1d8170'};
  for(const [id,h] of Object.entries(want))assert.equal(await sha('assets/hoops-v241/body/models/'+id+'.glb'),h,id);
  assert.match(readFileSync(new URL('assets/hoops-v241/body/LICENSES.md',island),'utf8'),/CC0/);
  globalThis.self??=globalThis;const {GLTFLoader}=await import('../workout/island/vendor/GLTFLoader.js');
  const load=(loader,url)=>{const bytes=readFileSync(fileURLToPath(url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),error=console.error;console.error=()=>{};return loader.parseAsync(buffer,'').finally(()=>{console.error=error;});};
  const v2=await loadHoopsBodyV2({T,GLTFLoader,load});
  assert.equal(v2.v2,true);assert.deepEqual(Object.keys(v2.bodies),['guard','wing','center']);
  const v22rest=[0,.86,0];
  for(const id of ['guard','wing','center']){
    const b=v2.bodies[id];assert.deepEqual(b.bones.Hips.position.toArray().map(v=>+v.toFixed(4)),v22rest,id+' canonical hips');
    let mesh=null;b.scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
    assert.ok(mesh.geometry.attributes._glove&&mesh.geometry.attributes._region,'glove and region attributes');
    assert.ok(mesh.geometry.index.count/3>5100&&mesh.geometry.index.count/3<5300,'5,188 triangles: '+mesh.geometry.index.count/3);
    assert.ok(HOOPS_V2_BODY_SHAPES[id][0]>0);
  }
});

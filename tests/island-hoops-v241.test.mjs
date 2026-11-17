// Basketball v24.1 (14/11/2026): the referee whistles of hoops-referee-audio-v1 on steals and fouls, the 3D crowd of hoops-crowd-3d-v1,
// the athlete-body-v2 basketball bodies and the hoops-motion-v13 locomotion, each behind a switch that brings v24 back (hoops-v241.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hoopsV241Flags,hoopsWhistleV241Enabled,hoopsCrowd3dMode,hoopsBodyV2Enabled,hoopsMotionV13Enabled,hoopsRefereeWhistle,HOOPS_REFEREE_WHISTLES} from '../workout/island/minigames/hoops-v241.mjs';
import {createHoopsAudio} from '../workout/island/minigames/hoops-audio.mjs';

// Historical v24.1 whistle/gesture contract; the phone-fixes-v1 suite checks the new default.
globalThis.location={search:'?phoneFixA=0'};
const island=new URL('../workout/island/',import.meta.url);
const full=JSON.parse(await readFile(new URL('data/config.json',island),'utf8'));
const mixText=await readFile(new URL('design/audio/mix.json',island),'utf8');
const sha=async rel=>createHash('sha256').update(await readFile(new URL(rel,island))).digest('hex');

test('v24.1 switches: everything on by default, each one off on its own, ?hoopsV241=0 turns all of them off',()=>{
  assert.deepEqual(hoopsV241Flags(''),{whistle:true,crowd3d:'budget',bodyV2:true,motionV13:true,referee:true});
  assert.equal(hoopsWhistleV241Enabled('?hoopsWhistleV241=0'),false);
  assert.equal(hoopsCrowd3dMode('?hoopsCrowd3d=0'),'off');assert.equal(hoopsCrowd3dMode('?hoopsCrowd3d=full'),'full');
  assert.equal(hoopsBodyV2Enabled('?hoopsBodyV2=0'),false);assert.equal(hoopsMotionV13Enabled('?hoopsMotionV13=0'),false);
  assert.deepEqual(hoopsV241Flags('?hoopsV241=0'),{whistle:false,crowd3d:'off',bodyV2:false,motionV13:false,referee:false});
  // one switch off leaves the others on
  assert.deepEqual(hoopsV241Flags('?hoopsWhistleV241=0'),{whistle:false,crowd3d:'budget',bodyV2:true,motionV13:true,referee:true});
  assert.equal(hoopsV241Flags('?hoopsReferee=0').referee,false);
});

test('referee: the gesture of each call, and he trails the ball on the far line without shuffling or leaving the court length',async()=>{
  const {refereeGesture,stepReferee,REFEREE}=await import('../workout/island/minigames/hoops-referee.mjs');
  assert.equal(refereeGesture({type:'steal'}),'whistle');assert.equal(refereeGesture({type:'interception'}),'whistle');
  assert.equal(refereeGesture({type:'foul'}),'foul');assert.equal(refereeGesture({type:'violation',kind:'travel'}),'direction');
  assert.equal(refereeGesture({type:'score',points:3}),'three_points');assert.equal(refereeGesture({type:'score',points:2}),null);assert.equal(refereeGesture({type:'pass'}),null);
  const st={x:0,vx:0};for(let i=0;i<240;i++)stepReferee(st,{ballX:12,hx:14.3});
  assert.ok(Math.abs(st.x-12*REFEREE.lead)<REFEREE.deadZone+.05,'arrives: '+st.x);
  const x=st.x;for(let i=0;i<60;i++)stepReferee(st,{ballX:12.1,hx:14.3});assert.ok(Math.abs(st.x-x)<.05,'no shuffle while the ball moves inside the dead zone');
  for(let i=0;i<600;i++)stepReferee(st,{ballX:40,hx:14.3});assert.ok(st.x<=14.3-1.2+1e-9,'inside the court length');
  const g={x:0,vx:5};for(let i=0;i<60;i++)stepReferee(g,{ballX:10,hx:14.3,gesture:true});assert.equal(g.vx,0,'stops for a call');
});

test('referee model: the pack file byte for byte, six clips, twenty primitives merged into two skinned meshes on one skeleton',async()=>{
  assert.equal(await sha('assets/hoops-v241/referee/referee.glb'),'1f0ca6130ec76f5fc5e29f25bab6deb71cd1bb528c3b0e1572394270d1f1a8dd');
  const offline=JSON.parse(await readFile(new URL('offline-manifest.json',island),'utf8'));assert.ok(offline.games.hoops.includes('assets/hoops-v241/referee/referee.glb'));
  const T=await import('../workout/island/vendor/three.module.js');globalThis.self??=globalThis;const {GLTFLoader}=await import('../workout/island/vendor/GLTFLoader.js');
  const {createHoopsReferee}=await import('../workout/island/minigames/hoops-referee.mjs');
  const bytes=await readFile(new URL('assets/hoops-v241/referee/referee.glb',island)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const error=console.error;console.error=()=>{};
  try{
    const ref=await createHoopsReferee({T,court:{hx:14.325,hz:7.62},load:()=>new GLTFLoader().parseAsync(buffer,'')});
    // node decodes no image, so every primitive lands in the plain group here; the browser splits textured / plain (two draw calls)
    const skinned=[];ref.group.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});
    assert.ok(skinned.length>=1&&skinned.length<=2);assert.ok(ref.metrics.draws<=2);assert.equal(ref.metrics.triangles,1225);
    assert.ok(skinned.every(m=>m.skeleton===skinned[0].skeleton),'one skeleton');
    assert.ok(Math.abs(ref.group.position.z-(7.62+.9))<1e-9,'far sideline, outside the court');
    for(let i=0;i<30;i++)ref.update(1/60,{ball:new T.Vector3(8,1,0)});
    assert.equal(ref.event({type:'steal'}),'whistle');assert.equal(ref.gesture,'whistle');
    for(let i=0;i<180;i++)ref.update(1/60,{ball:new T.Vector3(8,1,0)});assert.equal(ref.gesture,null,'the 2.4 s whistle gesture ends');
    ref.dispose();
  }finally{console.error=error;}
});

test('referee whistle rules: a steal or an intercepted pass takes the short whistle, a foul the long one, nothing else changes',()=>{
  assert.equal(hoopsRefereeWhistle({type:'steal'}),'steal');
  assert.equal(hoopsRefereeWhistle({type:'interception'}),'steal');
  assert.equal(hoopsRefereeWhistle({type:'foul',kind:'reach'}),'foul');
  for(const type of ['stealTry','stealMiss','violation','timeout','jumpBall','score','block','pass','contact'])assert.equal(hoopsRefereeWhistle({type}),null,type);
  assert.equal(HOOPS_REFEREE_WHISTLES.steal.id,'whistle-steal-short');assert.equal(HOOPS_REFEREE_WHISTLES.foul.id,'whistle-foul-long');
});

test('the runtime whistles are the pack files byte for byte (hashes of design/hoops-referee-audio-v1/manifest.json), with the CC0 licence',async()=>{
  const want={'whistle-steal-short.ogg':'71a961271c119aca553e701899939fd2b24a03db18bba27f7da72a51abb784e6','whistle-steal-short.mp3':'9129a1c58f51360b1bb78e1d4f9d8a9e616ac81ef54f7d44e4bf23e286c80e3c',
    'whistle-foul-long.ogg':'3bc0608a379bf0cb4b0179cd074835e78b7fca9432a492c73b8fe57b4cae4756','whistle-foul-long.mp3':'122ffc9db618b531acbe32279410f85ac41e20bcaa04f9f71a5ebb1971e112da'};
  for(const [file,hash] of Object.entries(want))assert.equal(await sha('assets/hoops-v241/referee-audio/'+file),hash,file);
  assert.match(await readFile(new URL('assets/hoops-v241/referee-audio/LICENSE.txt',island),'utf8'),/CC0-1\.0/);
  const offline=JSON.parse(await readFile(new URL('offline-manifest.json',island),'utf8'));
  for(const file of Object.keys(want))assert.ok(offline.games.hoops.includes('assets/hoops-v241/referee-audio/'+file),'offline list: '+file);
});

/** A Web Audio stand-in that records the buffer each source plays (by the URL it was fetched from). */
function fakeAudio({failOgg=false}={}){
  const nodes=[];let ctx;
  class Param{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
  class Node{constructor(kind){this.kind=kind;this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();this.playbackRate=new Param(1);nodes.push(this);}connect(n){return n;}disconnect(){}start(){this.started=true;}stop(){this.stopped=true;setTimeout(()=>this.onended?.(),0);}}
  class Ctx{constructor(){ctx=this;this.state='running';this.currentTime=1;this.destination=new Node('dest');}
    createGain(){return new Node('gain');}createBiquadFilter(){return new Node('filter');}createDynamicsCompressor(){return new Node('comp');}
    createBufferSource(){return new Node('source');}createOscillator(){return new Node('osc');}
    async decodeAudioData(bytes){const url=urls.get(bytes)||'';if(failOgg&&url.endsWith('.ogg')&&url.includes('hoops-v241'))throw Error('no vorbis');return {duration:1,url};}
    resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
  const urls=new WeakMap();
  const fetcher=async url=>{const u=String(url);if(u.endsWith('mix.json'))return {ok:true,json:async()=>JSON.parse(mixText)};return {ok:true,arrayBuffer:async()=>{const b=new ArrayBuffer(8);urls.set(b,u);return b;}};};
  // slice(0) inside the decoder loses the WeakMap key: keep the URL on the copy too
  const slice=ArrayBuffer.prototype.slice;ArrayBuffer.prototype.slice=function(...a){const out=slice.apply(this,a);if(urls.has(this))urls.set(out,urls.get(this));return out;};
  return {Ctx,fetcher,nodes,get ctx(){return ctx;},restore(){ArrayBuffer.prototype.slice=slice;},
    /** Time passes: the clock moves and every sample that started has finished (a real source ends by itself). */
    elapse(seconds){ctx.currentTime+=seconds;for(const n of nodes)if(n.kind==='source'&&n.started&&!n.done){n.done=true;n.onended?.();}},
    played:()=>nodes.filter(n=>n.kind==='source'&&n.started).map(n=>n.buffer?.url?.replace(/^.*\/island\//,'')||'?')};
}
const settle=()=>new Promise(r=>setTimeout(r,80));

test('audio v24.1: a steal and an interception blow the short whistle (not the squeak), a foul the long one, a violation keeps the v24 sample',async()=>{
  const fake=fakeAudio();
  try{
    const audio=createHoopsAudio({config:full.minigames.streetSlam.audio,storage:null,AudioContext:fake.Ctx,fetcher:fake.fetcher,clock:()=>fake.ctx?.currentTime??0});
    audio.unlock();await settle();
    audio.events([{type:'steal',playerId:'a',fromId:'b'}]);
    fake.elapse(3);audio.events([{type:'interception',playerId:'a',fromId:'b'}]);
    fake.elapse(3);audio.events([{type:'foul',playerId:'a',kind:'reach'}]);
    fake.elapse(3);audio.events([{type:'violation',kind:'travel',team:0}]);
    const list=fake.played();
    assert.deepEqual(list.filter(u=>/whistle/.test(u)),['assets/hoops-v241/referee-audio/whistle-steal-short.ogg','assets/hoops-v241/referee-audio/whistle-steal-short.ogg','assets/hoops-v241/referee-audio/whistle-foul-long.ogg','assets/audio/g3h/whistle.ogg']);
    assert.ok(!list.some(u=>/shoes/.test(u)),'no shoe squeak on the steal');
    const m=audio.metrics().whistle;assert.equal(m.v241,true);assert.equal(m.referee.steal,2);assert.equal(m.referee.foul,1);assert.deepEqual(m.referee.ready,['steal','foul']);
    audio.dispose();
  }finally{fake.restore();}
});

test('audio v24.1: the 2.5 s gate spaces a steal and a foul right after it into one whistle',async()=>{
  const fake=fakeAudio();
  try{
    const audio=createHoopsAudio({config:full.minigames.streetSlam.audio,storage:null,AudioContext:fake.Ctx,fetcher:fake.fetcher,clock:()=>fake.ctx?.currentTime??0});
    audio.unlock();await settle();
    audio.events([{type:'steal'}]);fake.elapse(1);audio.events([{type:'foul',kind:'reach'}]);
    assert.equal(fake.played().filter(u=>/whistle/.test(u)).length,1);
    assert.equal(audio.metrics().whistle.referee.gated,1);
    audio.dispose();
  }finally{fake.restore();}
});

test('audio v24.1: an OGG the browser cannot decode falls back to the MP3 of the same pack',async()=>{
  const fake=fakeAudio({failOgg:true});
  try{
    const audio=createHoopsAudio({config:full.minigames.streetSlam.audio,storage:null,AudioContext:fake.Ctx,fetcher:fake.fetcher,clock:()=>fake.ctx?.currentTime??0});
    audio.unlock();await settle();
    audio.events([{type:'steal'}]);
    assert.deepEqual(fake.played().filter(u=>/whistle/.test(u)),['assets/hoops-v241/referee-audio/whistle-steal-short.mp3']);
    assert.deepEqual(audio.metrics().whistle.referee.mp3.sort(),['ref:foul','ref:steal']);
    audio.dispose();
  }finally{fake.restore();}
});

test('?hoopsWhistleV241=0 is v24: the steal plays the shoe squeak, the foul the old whistle, no pack file is fetched',async()=>{
  const fake=fakeAudio(),fetched=[];const fetcher=url=>{fetched.push(String(url));return fake.fetcher(url);};
  try{
    const audio=createHoopsAudio({config:full.minigames.streetSlam.audio,storage:null,AudioContext:fake.Ctx,fetcher,clock:()=>fake.ctx?.currentTime??0,refereeWhistles:false});
    audio.unlock();await settle();
    audio.events([{type:'steal'}]);fake.elapse(3);audio.events([{type:'foul',kind:'reach'}]);
    const list=fake.played();
    assert.ok(list.some(u=>/basketball\/shoes\.ogg$/.test(u)),'squeak on the steal: '+list);
    assert.deepEqual(list.filter(u=>/whistle/.test(u)),['assets/audio/g3h/whistle.ogg']);
    assert.ok(!fetched.some(u=>u.includes('hoops-v241')),'no v24.1 file fetched');
    assert.equal(audio.metrics().whistle.v241,false);
    audio.dispose();
  }finally{fake.restore();}
});

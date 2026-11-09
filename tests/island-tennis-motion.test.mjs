import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {statSync} from 'node:fs';
import {sampleClip,segmentDirections,clipFor,strokeTime,turnTo,qrot,loadMotion,blendDirections} from '../workout/island/minigames/tennis-motion.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=JSON.parse(await readFile(new URL('assets/tennis-motion-v1/core.json',root),'utf8'));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

test('tennis motion v1: the data is the Codex package subset (CC0) and small enough to load lazily',()=>{
  assert.equal(data.fps,30);assert.equal(data.bones.length,18);
  for(const name of ['ready_idle','run_forward','run_left','run_right','run_backward','forehand_flat_short','backhand_flat_short','serve_toss','celebrate_point','disappointed'])assert.ok(data.clips[name],name);
  assert.ok(statSync(new URL('assets/tennis-motion-v1/core.json',root)).size<=600000);
  for(const clip of Object.values(data.clips))assert.ok(clip.frames.length>=30&&clip.dur>0);
  assert.ok(data.clips.forehand_flat_short.events.some(e=>e.name==='racket_contact'));
});

test('tennis motion v1: a standing pose has thighs and shins pointing down and the spine up',()=>{
  const dirs=segmentDirections(data.bones,sampleClip(data.clips.ready_idle,.4));
  for(const leg of ['LeftUpLeg','LeftLeg','RightUpLeg','RightLeg'])assert.ok(dirs[leg][1]<-.6,leg+' '+dirs[leg]);
  assert.ok(dirs.Spine[1]>.85&&dirs.Chest[1]>.85);
  assert.ok(Math.abs(Math.hypot(...dirs.Spine)-1)<1e-6);
});

test('tennis motion v1: clips are chosen from the game state (stand, run direction, stroke, serve, point)',()=>{
  const clips=data.clips,pick=(extra,player={})=>clipFor({index:0,player:{swing:0,vx:0,vz:0,stroke:'forehand',...player},phase:'rally',...extra},clips);
  assert.equal(pick({}),'ready_idle');
  assert.equal(pick({},{vz:-3}),'run_forward');assert.equal(pick({},{vz:3}),'run_backward');
  assert.equal(pick({},{vx:-3}),'run_left','facing -Z, moving -X is to the character\'s left');assert.equal(pick({},{vx:3}),'run_right');
  assert.equal(clipFor({index:1,player:{swing:0,vx:3,vz:0},phase:'rally'},clips),'run_left','the opponent faces +Z, so +X is its left');
  assert.equal(pick({},{swing:.3}),'forehand_flat_short');assert.equal(pick({},{swing:.3,stroke:'backhand'}),'backhand_flat_short');
  assert.equal(pick({tossing:true}),'serve_toss');
  assert.equal(pick({phase:'point',winner:0}),'celebrate_point');assert.equal(pick({phase:'point',winner:1}),'disappointed');
  assert.equal(clipFor({index:0,player:{swing:0,vx:0,vz:0},phase:'rally'},{}),null,'no clips loaded: the old pose stays');
});

test('tennis motion v1: the racket_contact instant of the clip lands on the game contact fraction',()=>{
  const clip=data.clips.forehand_flat_short,contact=clip.events.find(e=>e.name==='racket_contact').at;
  assert.ok(Math.abs(strokeTime(clip,.4,.4)-contact)<1e-9);assert.equal(strokeTime(clip,0,.4),0);assert.ok(Math.abs(strokeTime(clip,1,.4)-clip.dur)<1e-9);
  assert.ok(strokeTime(clip,.2,.4)<contact&&strokeTime(clip,.7,.4)>contact);
});

test('tennis motion v1: retarget math (turnTo) and blending are exact',()=>{
  const q=turnTo([0,-1,0],[0,0,1]);const v=qrot(q,[0,-1,0]);assert.ok(dot(v,[0,0,1])>.999999);
  const flip=turnTo([0,-1,0],[0,1,0]);assert.ok(dot(qrot(flip,[0,-1,0]),[0,1,0])>.999999);
  const mid=blendDirections({a:[1,0,0]},{a:[0,1,0]},.5).a;assert.ok(Math.abs(Math.hypot(...mid)-1)<1e-9);
  assert.equal(sampleClip(data.clips.ready_idle,0).rot.Hips.length,4);
});

test('tennis motion v1: a missing or broken file and the flag fall back without throwing',async()=>{
  assert.equal(await loadMotion({base:import.meta.url,params:new URLSearchParams('tennisMotionV1=0')}),null);
  await assert.rejects(loadMotion({base:import.meta.url,fetcher:async()=>({ok:false,status:404})}));
  await assert.rejects(loadMotion({base:import.meta.url,fetcher:async()=>({ok:true,json:async()=>({bones:[],clips:{}})})}));
  const ok=await loadMotion({base:import.meta.url,fetcher:async()=>({ok:true,json:async()=>data})});assert.ok(ok.clips.ready_idle);
});

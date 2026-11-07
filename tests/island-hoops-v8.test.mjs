import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as THREE from '../workout/island/vendor/three.module.js';
import {v8MotionEnabled,v8ArenaEnabled,decodeMotionPack,buildV8Clips,V8_CLIPS,V8_BONES,passClipFor,passClipTime,stealClipTime,receiveClipTime,createDribbleGuard,chooseV8Motion} from '../workout/island/minigames/hoops-v8-motion.mjs';
import {seatingLayout,v8LodFromParams,V8_FILES} from '../workout/island/minigames/hoops-v8-venue.mjs';
const island=new URL('../workout/island/',import.meta.url);
const read=f=>readFile(new URL(f,island),'utf8');
const cfg=JSON.parse(await read('data/config.json')).minigames.streetSlam.assets;
const offline=JSON.parse(await read('offline-manifest.json'));
const pack=decodeMotionPack(JSON.parse(await read(cfg.v8.motion)));
const q=s=>new URLSearchParams(s);

test('v8 switches: default on, ?hoopsV8=0 off, forced on only when configured, quality gate for the hall',()=>{
 assert.equal(v8MotionEnabled(cfg,q('')),true);assert.equal(v8MotionEnabled(cfg,q('hoopsV8=0')),false);
 assert.equal(v8MotionEnabled({},q('hoopsV8=1')),false);assert.equal(v8MotionEnabled({v8:{enabled:false,motion:'x'}},q('')),false);
 assert.equal(v8ArenaEnabled(cfg,2,q('')),true);assert.equal(v8ArenaEnabled(cfg,2,q('hoopsV8=0')),false);assert.equal(v8ArenaEnabled(cfg,0,q('')),false);
 assert.equal(v8LodFromParams(q('hoopsV8Lod=2')),2);assert.equal(v8LodFromParams(q('')),'auto');
});
test('runtime files are under assets/, exist, and are on the offline list; nothing points into design/',async()=>{
 const files=[cfg.v8.motion,...cfg.v8.arena.files.map(f=>cfg.v8.arena.base+f),...Object.values(cfg.v8.arena.textures).map(f=>cfg.v8.arena.base+f)];
 assert.deepEqual(cfg.v8.arena.files,[...V8_FILES]);
 for(const f of files){assert.ok(f.startsWith('assets/hoops-v8/'),f);await stat(new URL(f,island));assert.ok(offline.games.hoops.includes(f),f);}
 for(const m of ['minigames/hoops-v8-motion.mjs','minigames/hoops-v8-venue.mjs'])assert.ok(offline.shell.includes(m),m);
});
test('motion pack: nine clips on the 18-bone rig, release markers present, flight clips lose the jump height',()=>{
 assert.equal(Object.keys(pack.clips).length,V8_CLIPS.length);
 for(const id of V8_CLIPS.filter(i=>i.startsWith('pass_')))assert.ok(pack.clips[id].events.release>.4,id);
 for(const id of ['receive_two_hands','receive_moving','steal'])assert.ok(pack.clips[id].events.contact>.3,id);
 const clips=buildV8Clips(THREE,pack,[0,.86,0]);
 for(const id of V8_CLIPS){const c=clips.get('v8:'+id);assert.equal(c.tracks.length,V8_BONES.length+1);}
 for(const id of ['pass_jump','block']){const t=clips.get('v8:'+id).tracks.find(t=>t.name==='Hips.position');for(let i=1;i<t.values.length;i+=3)assert.ok(t.values[i]<=.86+1e-6,id);}
 const big=buildV8Clips(THREE,pack,[0,1.1,0]).get('v8:pass_chest').tracks.find(t=>t.name==='Hips.position');assert.ok(Math.abs(big.values[1]-1.1)<.2,'a tall body keeps its own hip height');
});
test('pass timing: held short of the release while the engine holds the ball, release marker on release, real time after',()=>{
 const c=pack.clips.pass_chest,rel=c.events.release;
 assert.ok(passClipTime(c,0,.16,null)<rel-.2);assert.ok(passClipTime(c,.16,.16,null)>rel-.02);assert.ok(passClipTime(c,.9,.16,null)<rel,'never passes the release while holding');
 assert.ok(Math.abs(passClipTime(c,.16,.16,.16)-rel)<1e-9);assert.ok(Math.abs(passClipTime(c,.36,.16,.16)-(rel+.2))<1e-9);assert.ok(passClipTime(c,9,.16,.1)<c.duration);
 assert.equal(passClipFor('chest',2),'pass_side');assert.equal(passClipFor('chest',6),'pass_chest');assert.equal(passClipFor('lob',6),'pass_overhead');assert.equal(passClipFor('jump',6),'pass_jump');assert.equal(passClipFor('bounce',6),'pass_bounce');
 const s=pack.clips.steal;assert.ok(Math.abs(stealClipTime(s,.14,.14)-s.events.contact)<1e-9);
 const r=pack.clips.receive_two_hands;assert.equal(receiveClipTime(r,5),0);assert.ok(receiveClipTime(r,.1)>0&&receiveClipTime(r,.1)<r.events.contact);assert.ok(receiveClipTime(r,0,.2)>r.events.contact);
});
test('the ball stays with the engine: a pass clip never decides possession and ends in the v7 plan',()=>{
 const st={},base={face:0,vx:0,vz:0,hasBall:true,dribbling:true};
 let o=chooseV8Motion(pack,{...base,act:'pass',actT:.05,passKind:'chest'},{passDist:6},st,.016);assert.equal(o.full,'v8:pass_chest');
 o=chooseV8Motion(pack,{...base,hasBall:false,act:'pass',actT:.2,passKind:'chest'},{passDist:6},st,.016);assert.ok(st.releasedAt>=.2&&o.t>=pack.clips.pass_chest.events.release);
 assert.equal(chooseV8Motion(pack,{...base,hasBall:false,act:null},{},st,.016),null,'after the act the v7 plan applies');
 assert.equal(chooseV8Motion(null,{...base,act:'pass'},{},{},.016),null,'no pack = v7 passes');
});
test('after a stop the handler never dribbles again until the possession ends',()=>{
 const g=createDribbleGuard(),dribble={mode:'dribble',upper:'dribble_right',lower:'idle'};
 g.observe({hasBall:true,dribbling:true});assert.equal(g.filter(dribble).mode,'dribble');
 g.observe({hasBall:true,dribbling:false});assert.equal(g.locked,true);
 // even if a later frame claims dribbling again (a stale flag), the plan stays held
 g.observe({hasBall:true,dribbling:true});assert.equal(g.locked,true);assert.equal(g.filter(dribble).mode,'hold');
 // receive / pass / steal overrides never produce a dribble plan
 const st={};for(const act of ['pass','steal','block',null]){const o=chooseV8Motion(pack,{hasBall:true,dribbling:false,vx:0,vz:0,act,actT:.1,passKind:'chest'},{catching:false},st,.016);if(o)assert.ok(!/dribble/.test(o.full),act);}
 g.observe({hasBall:false});assert.equal(g.locked,false);g.observe({hasBall:true,dribbling:true});assert.equal(g.filter(dribble).mode,'dribble');
});
test('hall: three levels of spectators (2084 / 1936 / 1000), under the 35K budget by the package numbers',()=>{
 assert.deepEqual([0,1,2].map(l=>seatingLayout(l).length),[2084,1936,1000]);
});

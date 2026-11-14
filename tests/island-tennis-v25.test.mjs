// Tennis v25 (14/11/2026), Roy after v24 on the phone: a load of 10+ seconds (twice), the racket glued to the hand with no grip, a ball that keeps
// bouncing after the point is over, and choosing where to stand before the opponent's serve.
//  - receive spot (?tennisReceive=0 off): before the opponent's serve the child picks one of three spots on the baseline with the stick;
//  - after a point the ball stops, an out shows the red X on its landing point for 1.5 s (?tennisOut=v24 off);
//  - the grip: the Codex 68 cm racket held in the closed fist, the swing unchanged (?tennisGrip=0 off);
//  - the load: everything the first frame needs downloads at once, the 3D crowd after it, one parse of the player model (?tennisLoad=v24 off).
// Pure model (the same input path as the phone), math, data and wiring. The phone path with real touch and the load measurement before/after are
// workout/island/tests/tennis-aliens-v24-1-browser.mjs and workout/island/tools/tennis-load-ab.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
import {gripTransform,gripConfig,GRIP_DEFAULTS,tennisGripEnabled} from '../workout/island/minigames/tennis-grip.mjs';
import {baseConfig} from '../workout/island/verification/tennis-v14/sim.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const config=JSON.parse(await read('../workout/island/data/config.json')).minigames.tennis,FRAME=1/60;
/** A model where the opponent serves first: play the child's service game away quickly by losing points on purpose is slow, so start on a game
 * the opponent serves by letting the child lose the first game (no serve input = the serve times out? no: we drive the state the same way the phone
 * does and simply wait for the opponent's serve). */
function opponentServing(extra={},seed=11){
 const m=createTennis({config:baseConfig,stage:3,seed,difficulty:'easy',returnMeter:true,softDrop:true,...extra});
 // The child serves the first game; serve into the net on purpose (tap at the red end) until the game is lost and the opponent serves.
 for(let i=0;i<60*240;i++){const s=m.getState();if(s.server===1&&s.phase==='serve')return m;
  const tap=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter<.03);m.update(FRAME,{serve:tap});m.update(0,{serve:false});}
 throw Error('the opponent never served');
}

test('v25 flags: the session turns the receive spot and the stopped ball on (off with ?tennisReceive=0 / ?tennisOut=v24); the model defaults stay v24',async()=>{
 const session=await read('../workout/island/minigames/tennis-session.mjs');
 assert.match(session,/get\('tennisReceive'\)==='0'\)&&balance\.v9\?\.receive\?\.enabled!==false/);assert.match(session,/get\('tennisOut'\)==='v24'\)\}\);/);
 assert.equal(config.v9.receive.enabled,true);assert.deepEqual(config.v9.receive.slots,[.55,1.65,3.05]);
 const s=createTennis({config:baseConfig,stage:2,seed:5}).getState();assert.equal(s.receive,undefined,'no receive state at the model level by default');
 // Same seed and inputs: omitting both options is exactly passing them false.
 const run=extra=>{const m=createTennis({config:baseConfig,stage:4,seed:21,difficulty:'normal',returnMeter:true,softDrop:true,...extra});for(let i=0;i<60*50;i++){const st=m.getState();m.update(FRAME,{serve:st.server===0&&(st.phase==='serve'||st.phase==='toss'&&Math.abs(st.serveMeter-.5)<.06),swing:st.phase==='rally'&&st.contact?.side===0&&st.contact.eta<.04,move:st.contact?.side===0?Math.sign(st.contact.x-st.players[0].x):0});}return JSON.stringify(m.snapshot());};
 assert.equal(run({}),run({receiveChoice:false,stopDead:false}));
});

test('receive spot: before the opponent serves the child picks one of three spots on the baseline (the middle one is the old spot), with the stick',()=>{
 const m=opponentServing({receiveChoice:true}),s=m.getState(),r=s.receive;
 assert.equal(r.active,true);assert.equal(r.slot,1);assert.equal(s.players[0].x,r.slots[1],'starts on the old fixed spot');
 assert.deepEqual(r.slots.map(Math.abs).sort((a,b)=>a-b),[.55,1.65,3.05]);assert.ok(r.slots.every(x=>Math.sign(x)===s.serveSide),'all three in the receiving half');
 assert.ok(r.slots[0]<r.slots[1]&&r.slots[1]<r.slots[2],'left to right on the screen');
 // One push = one spot, even held for a moment; release and push again = the next; held longer = one more every `repeat`.
 m.update(FRAME,{move:1});m.update(FRAME*5,{move:1});assert.equal(m.getState().receive.slot,2);m.update(FRAME,{move:0});
 m.update(FRAME,{move:-1});assert.equal(m.getState().receive.slot,1);m.update(.2,{move:-1});assert.equal(m.getState().receive.slot,1,'held: not yet');m.update(.3,{move:-1});assert.equal(m.getState().receive.slot,0,'held past repeat: one more');
 m.update(FRAME,{move:0});m.update(FRAME,{move:-1});assert.equal(m.getState().receive.slot,0,'clamped at the edge');
 // The child walks there, at running speed, along the baseline.
 for(let i=0;i<60&&!m.getState().receive.arrived;i++)m.update(FRAME,{move:0});const k=m.getState();assert.ok(Math.abs(k.players[0].x-k.receive.slots[0])<.07,'arrived');assert.ok(Math.abs(k.players[0].z-(baseConfig.court.halfLength+baseConfig.serve.baselineMargin))<1e-6,'on the baseline');
 // input.receiveSlot (a tap on a spot) works too.
 m.update(FRAME,{receiveSlot:2});assert.equal(m.getState().receive.slot,2);
});

test('receive spot: the opponent waits about a second longer before the toss, and for a child who moved to arrive (at most 3.2 s); v24 tossed at 0.7 s',()=>{
 const tossAt=extra=>{const m=opponentServing(extra);let t=0;while(m.getState().phase==='serve'&&t<6){m.update(FRAME,{});t+=FRAME;}return t;};
 const old=tossAt({}),fresh=tossAt({receiveChoice:true});
 assert.ok(Math.abs(old-.7)<.05,`v24 tossed after ${old.toFixed(2)} s`);assert.ok(Math.abs(fresh-1.7)<.05,`v25 tosses after ${fresh.toFixed(2)} s`);
 const m=opponentServing({receiveChoice:true});let t=0;while(t<1.5){m.update(FRAME,{move:t>1.4?1:0});t+=FRAME;}m.update(FRAME,{move:0});
 let toss=null;for(let i=0;i<300&&toss===null;i++){m.update(FRAME,{});t+=FRAME;if(m.getState().phase!=='serve')toss=t;}
 assert.ok(toss>1.75&&toss<=3.25,`a late move delays the toss until the child is there: ${toss.toFixed(2)} s`);
 const s=m.getState();assert.ok(Math.abs(s.players[0].x-s.receive.slots[2])<.07,'standing on the new spot when the toss starts');
 // After the serve is struck the spot is no longer chosen: normal play.
 for(let i=0;i<120&&m.getState().phase!=='rally';i++)m.update(FRAME,{});assert.equal(m.getState().receive.active,false);
});

test('after the point the ball stops: no dead ball bouncing on after a soft drop (v24: it bounced and rolled), and every out/net mark carries an id',()=>{
 const play=extra=>{const m=createTennis({config:baseConfig,stage:9,seed:77,difficulty:'normal',returnMeter:true,softDrop:true,...extra});const dead=[];let track=null,eid=m.getState().event.id;
  for(let i=0;i<60*600&&m.getState().phase!=='complete';i++){const s=m.getState(),drop=s.phase==='rally'&&s.contact?.side===0&&s.ball.lastHitter===1&&s.contact.eta<.04;
   m.update(FRAME,{serve:s.server===0&&(s.phase==='serve'||s.phase==='toss'&&Math.abs(s.serveMeter-.5)<.06),swing:drop,drop:drop&&s.players[0].z<7.6,move:s.contact?.side===0?Math.max(-1,Math.min(1,(s.contact.x-s.players[0].x)*4)):0,moveZ:s.contact?.side===0?Math.max(-1,Math.min(1,(s.contact.z-s.players[0].z)*4)):0});
   const n=m.getState(),b=n.ball;if(track){if(['point','game'].includes(n.phase))track.move=Math.max(track.move,Math.hypot(b.x-track.x,b.z-track.z),Math.abs(b.y-track.y));else{dead.push(track);track=null;}}
   if(n.event.id!==eid){eid=n.event.id;if(['point','game'].includes(n.event.type)&&n.event.reason==='doubleBounce')track={x:b.x,y:b.y,z:b.z,move:0,mark:n.faultMark};}}
  return {dead,model:m};};
 const v24=play({}),v25=play({stopDead:true});
 assert.ok(v24.dead.some(d=>d.move>.3),'v24: the dead ball moved after some points');
 assert.ok(v25.dead.length>=5&&v25.dead.every(d=>d.move<1e-9),`v25: the ball stays where the point ended (${v25.dead.length} points)`);
 // An out: the mark is the landing point, with an id; the ball stays there through the pause.
 const m=createTennis({config:baseConfig,stage:1,seed:3,difficulty:'easy',returnMeter:true,softDrop:true,stopDead:true});let out=null;
 for(let i=0;i<60*600&&!out;i++){const s=m.getState();m.update(FRAME,{serve:s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>.97),swing:false});const n=m.getState();if(n.faultMark?.reason==='out')out={...n.faultMark,ballX:n.ball.x,ballZ:n.ball.z};}
 assert.ok(out,'an out happened');assert.ok(Number.isInteger(out.id));const c=baseConfig.court;assert.ok(Math.abs(out.x)>c.lineTolerance||Math.abs(out.z)>c.serviceLength+c.lineTolerance,'the mark is the landing point, outside the box');
});

test('grip: the held racket points exactly where the v24 racket pointed for every swing angle; the head the IK aims at is the package head node',()=>{
 const cfg=gripConfig(config),t=gripTransform(T,cfg);
 for(const z of [-.6,0,.6,1.5,2.4,Math.PI])for(const pitch of [0,-.2]){const E=new T.Quaternion().setFromEuler(new T.Euler(pitch,0,z));
  const oldHead=new T.Vector3(0,-1,0).applyQuaternion(E),oldFace=new T.Vector3(0,0,1).applyQuaternion(E),racket=E.clone().multiply(t.correction).multiply(t.quaternion);
  assert.ok(new T.Vector3(0,1,0).applyQuaternion(racket).distanceTo(oldHead)<1e-9,'shaft');assert.ok(new T.Vector3(0,0,1).applyQuaternion(racket).distanceTo(oldFace)<1e-9,'strings face');}
 // The handle crosses the palm diagonally (not along the fingers): the shaft is between "across" (thumb side) and "along the fingers".
 const across=t.shaft.dot(new T.Vector3(-1,0,0)),along=t.shaft.dot(new T.Vector3(0,-1,0));assert.ok(across>.6&&along>.3&&along<.75,`shaft ${t.shaft.toArray().map(v=>v.toFixed(2))}`);
 // The hand centre of the handle is in the fist, in front of the palm; the head is 0.435 m of racket (x scale) beyond it.
 const handCentre=t.position.clone().add(new T.Vector3(0,cfg.handY*cfg.scale,0).applyQuaternion(t.quaternion)),palm=new T.Vector3(...cfg.palm);
 assert.ok(Math.abs(handCentre.distanceTo(palm)-cfg.inset)<1e-9);assert.ok(Math.abs(t.headLocal.distanceTo(handCentre)-(.5-cfg.handY)*cfg.scale)<1e-9);
 assert.ok(t.headLocal.length()<.7,`head ${t.headLocal.length().toFixed(2)} m from the wrist (v24: ${Math.hypot(...config.animation.racket.headOffset).toFixed(2)} m)`);
 assert.equal(tennisGripEnabled(''),true);assert.equal(tennisGripEnabled('?tennisGrip=0'),false);for(const k of Object.keys(GRIP_DEFAULTS))assert.ok(k in config.animation.grip,k);
});

test('grip asset: the package racket is 68 cm with grip and head nodes, no decoders; licensed; the view swaps it in only after it loaded',async()=>{
 const glb=await readFile(new URL('../workout/island/assets/tennis-grip-v1/racket.glb',import.meta.url)),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
 const nodes=Object.fromEntries(json.nodes.map(n=>[n.name,n]));assert.deepEqual(nodes.grip.translation,[0,.2,0]);assert.deepEqual(nodes.head.translation,[0,.5,0]);assert.equal(json.extensionsUsed,undefined,'no Draco or meshopt');
 const maxY=Math.max(...json.meshes.flatMap(m=>m.primitives.map(p=>json.accessors[p.attributes.POSITION].max[1])));assert.ok(Math.abs(maxY-.68)<.001,`length ${maxY}`);
 const view=await read('../workout/island/minigames/tennis-view.mjs');
 assert.match(view,/if\(ch\.grip\)handRotation\.multiply\(ch\.grip\.correction\)/);assert.match(view,/headOffset\(\)\.applyQuaternion\(handRotation\)/);assert.match(view,/ch\.oldRacket\.visible=false;ch\.grip=grip;ch\.racketHead=grip\.head;/);
 assert.match(view,/tennisGripEnabled\(\)\?loadGripRacket/);assert.match(await read('../workout/island/assets/tennis-grip-v1/LICENSES.md'),/CC0/);
});

test('the out X and the receive arrow: Codex decals on the court, 1.5 s for the X (view clock), the arrow on the chosen spot; the drawn X stays for ?tennisOut=v24',async()=>{
 const view=await read('../workout/island/minigames/tennis-view.mjs'),session=await read('../workout/island/minigames/tennis-session.mjs'),css=await read('../workout/island/minigames/tennis.css');
 assert.match(view,/tennis-ui-fx-v1/);assert.match(view,/if\(outAge>=1\.5\)outShown=null/);assert.match(view,/mark\.id!==lastMarkId\)\{lastMarkId=mark\.id;/,'each mark once (the model keeps it through the second serve; caught in the browser)');assert.match(view,/outShown=mark\.reason==='out'\?\{\.\.\.mark\}:null/);
 assert.match(view,/faultMark\.visible=mark\?\.id!==undefined\?showX&&!xTex:Boolean\(mark\)/,'v24 marks (no id) keep the drawn X');assert.match(view,/serve-arrow-left','serve-arrow-center','serve-arrow-right'\]\[rc\.slot\]/);
 assert.match(session,/outText\.textContent=t\('tennis\.out'\)/);assert.match(session,/receiveHint\.textContent=t\('tennis\.receiveHint'\)/);assert.match(css,/\.tennis-out-sign\{/);assert.match(css,/\.tennis-receive-hint\{/);
 const strings=JSON.parse(await read('../workout/island/data/strings.he.json'));assert.equal(strings['tennis.out'],'אאוט');assert.match(strings['tennis.receiveHint'],/ג׳ויסטיק/);
});

test('the load: one parse and a skinned clone, the model/stadium/racket/motion fetched at once, the 3D crowd after the model; ?tennisLoad=v24 keeps the old order',async()=>{
 const view=await read('../workout/island/minigames/tennis-view.mjs'),stadium=await read('../workout/island/minigames/tennis-v12-stadium.mjs');
 assert.match(view,/const lazyLoad=params\.get\('tennisLoad'\)!=='v24'/);assert.match(view,/import \{clone as cloneSkinned\} from '\.\.\/vendor\/SkeletonUtils\.js'/);
 assert.match(view,/pristine=\{scene:cloneSkinned\(gltf\.scene\),animations:gltf\.animations\}/);assert.match(view,/lateCrowd:lazyLoad\?modelArrived:false/);
 assert.match(view,/if\(!lazyLoad\)startMotion\(\);/,'v24: the motion clips after the models, as before');assert.match(view,/const buffer=lazyLoad\?await characterBuffer:await \(await fetch\(characterUrl\)\)\.arrayBuffer\(\)/);
 assert.match(stadium,/export const STADIUM_FILES=FILES/);assert.match(stadium,/if\(crowdModule\?\.createLODCrowd&&!lateCrowd\)\{try\{/);assert.match(stadium,/if\(crowd\)\{crowd\.visible=false;\}/);
 const manifest=JSON.parse(await read('../workout/island/offline-manifest.json'));
 for(const f of ['minigames/tennis-grip.mjs','vendor/SkeletonUtils.js'])assert.ok(manifest.shell.includes(f),f);
 for(const f of ['assets/tennis-grip-v1/racket.glb','assets/tennis-ui-fx-v1/out-cross.png','assets/tennis-ui-fx-v1/serve-arrow-center.png','assets/tennis-ui-fx-v1/sign-out.png'])assert.ok(manifest.games.tennis.includes(f),f);
});

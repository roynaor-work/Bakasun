import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennis,serveMeterAt} from '../workout/island/minigames/tennis.mjs';
import {tennisPose} from '../workout/island/minigames/tennis-pose.mjs';
import {tennisSeats} from '../workout/island/minigames/tennis-crowd.mjs';
import {createTennisAudio} from '../workout/island/minigames/g4e-audio.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.tennis,dt=config.simulation.step;
const advance=(m,t,input={})=>{for(let i=0;i<Math.round(t/dt);i++)m.update(dt,input);};
const press=(m,key)=>{m.update(0,{[key]:true});m.update(0,{});};
test('G4e meter rises and falls for three complete unattended cycles, without score or faults',()=>{
 const m=createTennis({config}),s=m.getState();press(m,'serve');
 for(let cycle=0;cycle<3;cycle++){let previous=s.serveMeter,up=0,down=0,peak=0,low=1;
  for(let n=0;n<Math.round(config.serve.tossSeconds*2/dt);n++){m.update(dt);const v=s.serveMeter;if(v>previous+.001)up++;if(v<previous-.001)down++;peak=Math.max(peak,v);low=Math.min(low,v);previous=v;}
  assert.ok(up>50&&down>50&&peak>.99&&low<.01);assert.equal(s.phase,'toss');assert.equal(s.faults,0);assert.deepEqual(s.score.points,[0,0]);
 }
 assert.deepEqual(serveMeterAt(.55,1.1),{value:.5,direction:1});assert.deepEqual(serveMeterAt(1.65,1.1),{value:.5,direction:-1});
});
test('G4e two seconds of idle before serve keep the ready pose and all movement still',()=>{
 const m=createTennis({config}),s=m.getState(),before=structuredClone(s.players[0]),pose=tennisPose(s.players[0],config);
 for(let i=0;i<240;i++){m.update(dt);assert.deepEqual(tennisPose(s.players[0],config),pose);assert.equal(s.players[0].running,false);}
 assert.deepEqual(s.players[0],before);assert.equal(pose.step,0);
});
test('G4e approaching ball and legacy targetX never move the player without joystick input',()=>{
 for(const stage of [1,3,10]){const m=createTennis({config,stage}),s=m.getState(),p=s.players[0],before={x:p.x,z:p.z};s.phase='rally';s.shot={serving:false};s.contact={side:0,x:-4,z:2,at:5};Object.assign(s.ball,{x:-4,z:3,y:100,vx:0,vy:0,vz:2,lastHitter:1});advance(m,2,{targetX:-4});assert.deepEqual({x:p.x,z:p.z},before);assert.equal(p.running,false);}
});
test('G4e serve faults depend on physical landing; every yellow and green landing in the service box is legal',()=>{
 for(const difficulty of ['easy','normal','hard'])for(const zone of ['yellow','green'])for(let seed=0;seed<40;seed++){
  const m=createTennis({config,difficulty,seed}),s=m.getState();press(m,'serve');s.serveZone=zone;s.serveMeter=zone==='green'?.5:.2;press(m,'serve');assert.ok(s.ball.vy<0,'serve strikes down from the toss apex');assert.ok(Math.abs(s.shot.targetZ)<config.court.serviceLength);assert.ok(s.shot.targetX*s.players[0].x<0);
  for(let i=0;i<300&&s.ball.bounces===0&&s.phase==='rally';i++)m.update(dt);
  assert.equal(s.faults,0);assert.equal(s.ball.bounces,1);assert.equal(s.event.type,'bounce');assert.equal(s.faultMark,null);
 }
});
test('G4e service centre line is in the box, while a bounce beyond its line tolerance faults',()=>{
 for(const x of [0,-.01,config.court.lineTolerance/2,config.court.lineTolerance*2]){
  const m=createTennis({config}),s=m.getState();s.phase='rally';s.shot={serving:true,side:0};s.contact=null;Object.assign(s.ball,{x,z:-3,y:config.ball.radius+.001,vx:0,vz:0,vy:-1,lastHitter:0,bounces:0});m.update(dt);
  assert.equal(s.faults,x>config.court.lineTolerance?1:0);if(x<=config.court.lineTolerance)assert.equal(s.event.type,'bounce');
 }
});
test('G4e physical out and net faults retain a marker at the actual contact position',()=>{
 for(const reason of ['out','net']){const m=createTennis({config}),s=m.getState();press(m,'serve');press(m,'serve');s.contact=null;
  if(reason==='out')Object.assign(s.ball,{x:-2,z:-6,y:config.ball.radius+.001,vx:0,vz:0,vy:-1});else Object.assign(s.ball,{x:-.7,z:.01,y:.3,vx:0,vz:-5,vy:0});
  m.update(dt);assert.equal(s.faults,1);assert.equal(s.faultMark.reason,reason);assert.equal(s.faultMark.x,reason==='out'?-2:-.7);assert.equal(s.faultMark.z,reason==='out'?-6:0);assert.deepEqual(s.score.points,[0,0]);
 }
});
test('G4e easy reach is 1.6x, normal 1.3x, hard unchanged, with wider timing windows',()=>{
 const states=['easy','normal','hard'].map(difficulty=>createTennis({config,difficulty}).getState());assert.deepEqual(states.map(s=>s.attributes.reach),[config.player.reach*1.6,config.player.reach*1.3,config.player.reach]);assert.ok(states[0].timingWindow>states[1].timingWindow&&states[1].timingWindow>states[2].timingWindow);
 // Late stages have the same distance assistance, with no stage-based auto-hit.
 for(const [difficulty,hit]of [['easy',true],['normal',false],['hard',false]]){const m=createTennis({config,difficulty,stage:10}),s=m.getState();s.phase='rally';s.shot={serving:false};s.contact={side:0,at:0};Object.assign(s.ball,{x:s.players[0].x+1.5,z:s.players[0].z,y:.85,lastHitter:1,bounces:1});press(m,'swing');assert.equal(s.ball.lastHitter===0,hit);}
});
test('G4e at least 120 seated spectators surround all four sides, behind fences on rising terraces',()=>{
 const seats=tennisSeats(config);assert.ok(seats.length>=120);
 for(const side of [0,1,2,3]){const section=seats.filter(s=>s.side===side);assert.equal(section.length,36);assert.ok(section.every(s=>side<2?Math.abs(s.x)>6.5:Math.abs(s.z)>12.3));assert.ok(section.find(s=>s.row===2).y>section.find(s=>s.row===0).y);for(const s of section)assert.ok(Math.sin(s.facing)*(-s.x)+Math.cos(s.facing)*(-s.z)>0);}
 assert.deepEqual(config.environment.models.filter(n=>/tree/.test(n)),['assets/models/palm-tree-512.glb']);
});
test('G4e dedicated audio honors the existing sound switch and releases pending loads safely',async()=>{
 let value='off';const audio=createTennisAudio({config:config.audio,storage:{getItem:()=>value},AudioContext:undefined,fetcher:async()=>({ok:false})});audio.sync();assert.equal(audio.metrics().muted,true);value='on';audio.sync();assert.equal(audio.metrics().muted,false);audio.setPaused(true);assert.equal(audio.metrics().paused,true);audio.play('hit');audio.dispose();await Promise.resolve();assert.equal(audio.metrics().active,0);
});

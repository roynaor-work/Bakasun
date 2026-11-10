import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {tallEnabled,decodeTallPack,buildTallClips,TALL_REQUIRED,TALL_PROFILES,TALL_BONES,pickGait,gaitRate,GAIT_TABLE,warp,shotAnchors,layupSide,bouncePhase,ballAt,chooseTallMotion} from '../workout/island/minigames/hoops-tall.mjs';
const island=new URL('../workout/island/',import.meta.url);
const read=f=>readFile(new URL(f,island),'utf8');
const config=JSON.parse(await read('data/config.json')),cfg=config.minigames.streetSlam.assets;
const offline=JSON.parse(await read('offline-manifest.json'));
const pack=decodeTallPack(JSON.parse(await read(cfg.tall.base+cfg.tall.motion)));
const q=s=>new URLSearchParams(s);

test('tall switches: default on, ?hoopsTall=0 off, forced on only when configured, quality gate',()=>{
 assert.equal(tallEnabled(cfg,q('')),true);assert.equal(tallEnabled(cfg,q('hoopsTall=0')),false);
 assert.equal(tallEnabled({},q('hoopsTall=1')),false);assert.equal(tallEnabled({tall:{enabled:false}},q('')),false);
 assert.equal(tallEnabled(cfg,q(''),0),false);assert.equal(tallEnabled(cfg,q('hoopsTall=1'),0),true);
});
test('runtime files live under assets/, exist, are on the offline list; every position has a profile',async()=>{
 const files=[cfg.tall.base+cfg.tall.motion,...Object.values(cfg.tall.profiles).map(f=>cfg.tall.base+f)];
 for(const f of files){assert.ok(f.startsWith('assets/hoops-tall/'),f);assert.ok(!f.includes('design/'),f);await stat(new URL(f,island));assert.ok(offline.games.hoops.includes(f),f);}
 assert.ok(offline.shell.includes('minigames/hoops-tall.mjs'));
 for(const pos of ['PG','SG','SF','PF','C'])assert.ok(TALL_PROFILES.includes(cfg.tall.posProfile[pos]),pos);
 for(const p of TALL_PROFILES)assert.ok((await stat(new URL(cfg.tall.base+cfg.tall.profiles[p],island))).size<1_100_000,p+' body under 1.1 MB');
});
test('motion pack: 83 clips on the 18-bone rig, every clip the state machine names exists, the dunk calibration is there for each body',()=>{
 assert.equal(Object.keys(pack.clips).length,83);for(const n of TALL_REQUIRED)assert.ok(pack.clips[n],n);
 for(const id of ['dunk_one_hand','dunk_two_hands'])for(const p of TALL_PROFILES)assert.ok(pack.clips[id].jumpScale[p]>0&&pack.clips[id].jumpScale[p]<1,id+p);
 const clips=buildTallClips(pack,'guard');assert.equal(clips.size,83);for(const c of clips.values())assert.equal(c.tracks.length,TALL_BONES.length+1);
});
test('dunk hips: the positive lift is calibrated per body (a taller body jumps less), the crouch is untouched',()=>{
 const lift=(profile,id)=>{const t=buildTallClips(pack,profile).get(id).tracks.find(t=>t.name==='Hips.position'),rest=pack.profiles[profile].hips[1];let m=0;for(let i=1;i<t.values.length;i+=3)m=Math.max(m,t.values[i]-rest);return m;};
 const g=lift('guard','dunk_two_hands'),c=lift('center','dunk_two_hands');
 assert.ok(g>c,'the guard needs more rise than the centre to clear the rim by the same margin');
 assert.ok(Math.abs(g-pack.clips.dunk_two_hands.jumpScale.guard*1.548686)<.01,'calibrated peak lift');
 const walk=buildTallClips(pack,'guard').get('walk').tracks.find(t=>t.name==='Hips.position');assert.ok(walk.values[1]>0.9);
});
test('gaits: the authored speed picks the clip, hysteresis keeps it, cadence stays near the clip\'s own',()=>{
 const G=GAIT_TABLE.gaits;
 assert.equal(pickGait(G,0),'idle_ready');assert.equal(pickGait(G,1.4),'walk');assert.equal(pickGait(G,2.7),'jog');assert.equal(pickGait(G,4.6),'run');assert.equal(pickGait(G,7),'sprint');
 assert.equal(pickGait(G,3.5,'jog'),'jog');assert.equal(pickGait(G,3.5,'run'),'run','the current gait holds near the edge');
 for(const [name,ref] of G.slice(1)){const r=gaitRate(ref,ref);assert.ok(Math.abs(r-1)<1e-9,name);}
 assert.ok(gaitRate(9,6.8)<=1.45&&gaitRate(.1,1.35)>=.5);
 for(const s of [.5,1,2,3,4,5,6]){const g=pickGait(G,s),ref=G.find(x=>x[0]===g)[1];if(ref)assert.ok(gaitRate(s,ref)>=.5&&gaitRate(s,ref)<=1.45);}
});
test('shot timing: the step-and-a-half lines the clip\'s takeoff, release and landing up with the engine\'s; the approach is never more than 1.6x',()=>{
 const clip=pack.clips.layup_right,eng={release:1.03,duration:1.7,shotAir:.62},a=shotAnchors(clip,'layup',eng);
 const takeoffE=a[1][0];assert.ok(Math.abs(a[1][1]-clip.events.takeoff[0])<1e-9);assert.ok(Math.abs(a[2][1]-clip.events.release[0])<1e-9);
 assert.ok((a[1][1]-a[0][1])/takeoffE<=1.6+1e-9);
 assert.ok(Math.abs(warp(a,1.03)-clip.events.release[0])<1e-9);assert.equal(warp(a,0),a[0][1]);assert.ok(warp(a,99)<clip.duration);
 const ft=shotAnchors(pack.clips.free_throw,'ft',{release:1.1,duration:2,shotAir:0});assert.ok(Math.abs(warp(ft,1.1)-pack.clips.free_throw.events.release[0])<1e-9);
});
test('sideways movement plays a sideways clip, forward movement a forward gait',()=>{
 const st={gait:null,dribbleGait:null,cross:false,spin:false,celebrate:0,stumbleT:0,guardLocked:false},base={face:0,vx:0,vz:0,hasBall:false,dribbling:false,act:null,actT:0};
 assert.match(chooseTallMotion(pack,{...base,vx:2.2,vz:0.2},{},st).clip,/^defensive_slide_(left|right)$/,'an off-ball sideways move');
 assert.equal(chooseTallMotion(pack,{...base,vz:3},{},st).clip,'jog','a forward move keeps the gait');
 assert.match(chooseTallMotion(pack,{...base,hasBall:true,dribbling:true,vx:-2,vz:.2},{},st).clip,/^dribble_(left|right)$/);
 assert.ok(!/^defensive_slide/.test(chooseTallMotion(pack,{...base,vx:6.3},{},st).clip||''),'a sprint across is not a slide');
});
test('layup hand follows the side of the basket the shooter comes from',()=>{
 // facing +x (face = pi/2) at the rim line: from z>0 the rim is to his right-front... the sign is symmetric
 assert.notEqual(layupSide(Math.PI/2,5,1),layupSide(Math.PI/2,5,-1));
});
test('ball track: floor contact at 0.42 of the bounce phase, the ball reaches the floor in every dribble gait',()=>{
 for(const id of ['dribble_walk_right','jog_ball','run_ball','sprint_ball','dribble_crossover_left']){
  const c=pack.clips[id];assert.ok(c.ball,id);let min=9;for(let t=0;t<c.duration;t+=1/30)min=Math.min(min,ballAt(c,t)[1]);assert.ok(min<.16,id+' floor '+min);
 }
 const c=pack.clips.run_ball,b=c.events.bounce[0];assert.ok(Math.abs(bouncePhase(c,b)-.42)<.01);assert.ok(bouncePhase(c,c.events.contact[0]+.001)<.05);
});
test('motion plan: defender stands in the stance, locked handler never dribbles, acts pick their clips, a stumble gets up',()=>{
 const st={gait:null,dribbleGait:null,cross:false,spin:false,celebrate:0,stumbleT:0,guardLocked:false};
 const base={vx:0,vz:0,face:0,hasBall:false,dribbling:false,act:null,actT:0};
 assert.equal(chooseTallMotion(pack.clips?pack:{clips:pack.clips},{...base},{defending:true},st).clip,'defensive_stance');
 assert.match(chooseTallMotion(pack,{...base,vx:3},{defending:true},st).clip,/defensive_slide_(left|right)/);
 const handler={...base,hasBall:true,dribbling:true,vx:0,vz:4};
 assert.equal(chooseTallMotion(pack,handler,{},st).clip,'run_ball');
 const locked=chooseTallMotion(pack,handler,{},{...st,guardLocked:true});assert.ok(!/ball$|dribble/.test(locked.clip||''),'a locked handler plays no dribble clip: '+locked.clip);
 assert.equal(chooseTallMotion(pack,{...base,hasBall:true,act:'shoot',shotType:'dunk',actT:.2},{engineAnim:{layup:{release:1.03,duration:1.7}}},st).clip.startsWith('dunk_'),true);
 assert.equal(chooseTallMotion(pack,{...base,hasBall:true,act:'shoot',shotType:'layup',actT:.2},{layupSide:'left',engineAnim:{layup:{release:1.03,duration:1.7}}},st).clip,'layup_left');
 assert.equal(chooseTallMotion(pack,{...base,stumble:true},{},st).clip,'get_up_front');
 assert.equal(chooseTallMotion(pack,{...base,act:'block',actT:.1},{},st).ownsJump,true);
});

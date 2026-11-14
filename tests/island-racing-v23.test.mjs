// racing-v23 (Roy after v22 on the phone): no walls by default (?racingWalls=1 brings them back), the off-track flip back to the centre line at speed 0
// (?racingOffTrack=0 = the old recovery), the camera NaN that made "the screen disappear" at a fence hit, posts that stay solid, a clear trackside, the shift sound.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {OFF_TRACK,CLEAR_ZONE,racingWallsOn,racingOffTrackOn,offTrackConfig,clearLane} from '../workout/island/minigames/racing-offtrack.mjs';
import {shakeAmount} from '../workout/island/minigames/racing-view.mjs';
import {measureStage} from '../workout/island/tools/racing-clear-zone.mjs';
import {crowdSites} from '../workout/island/minigames/racing-v7.mjs';
import {createTrack} from '../workout/island/minigames/racing-tracks.mjs';
import {excursion} from '../workout/island/tools/racing-offtrack-sim.mjs';

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const OPEN={countdown:0,walls:false,offTrack:true};
function pursuit(race,p,lag=0,q=[]){const tr=race.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
 q.push(clamp(err*1.7,-1,1));return {steer:q.length>lag?q.shift():0,throttle:1,autoAccelerate:true,brake:curv>.62&&p.speed>24,drift:false,nitro:false};}
/** put the player on a straight part of the first sector, `lateral` metres from the centre line, along the road, at `speed` */
function place(race,lateral,speed,s=40){const p=race.state.player,tr=race.track,q=tr.sample(s);Object.assign(p,{x:q.x+q.normal.x*lateral,z:q.z+q.normal.z*lateral,y:q.y,heading:q.heading,speed,s:q.s,routeS:s,previousS:s,progress:s,lateral,gearInit:false});return p;}
const events=(race,input,seconds)=>{const out=[];for(let n=0;n<seconds*60;n++){race.step(1/60,typeof input==='function'?input():input);for(const e of race.state.events)if(e.car==='player')out.push({...e});}return out;};

test('flags: no walls by default, ?racingWalls=1 brings them back; the off-track flip is on unless ?racingOffTrack=0; the distances can be tuned from the address',()=>{
 assert.equal(racingWallsOn(''),false);assert.equal(racingWallsOn('?racingWalls=1'),true);assert.equal(racingWallsOn('?racingWalls=0'),false);
 assert.equal(racingOffTrackOn(''),true);assert.equal(racingOffTrackOn('?racingOffTrack=0'),false);
 assert.deepEqual(offTrackConfig(''),{soft:OFF_TRACK.soft,dwell:OFF_TRACK.dwell,hard:OFF_TRACK.hard,long:OFF_TRACK.long});
 assert.deepEqual(offTrackConfig('?racingOffTrackSoft=5&racingOffTrackDwell=.4&racingOffTrackHard=8&racingOffTrackLong=2.5'),{soft:5,dwell:.4,hard:8,long:2.5});
 assert.equal(offTrackConfig('?racingOffTrackHard=abc').hard,OFF_TRACK.hard,'nonsense keeps the default');assert.equal(offTrackConfig('?racingOffTrackHard=999').hard,30,'clamped');
 assert.ok(OFF_TRACK.hard+1.5<CLEAR_ZONE,'a car flipped at the hard limit (plus a step and its own half width) never reaches a trackside object');
 assert.equal(clearLane(-9,8,0),-9);assert.equal(clearLane(-9,8,10.6),-18.6);assert.equal(clearLane(25,8,10.6),25);
});

test('the session wires the flags: walls from racingWallsOn(), the off-track config, posts from the view, a friendly line after the landing',async()=>{
 const src=await readFile(new URL('../workout/island/minigames/racing-session.mjs',import.meta.url),'utf8');
 assert.match(src,/walls:racingWallsOn\(\),offTrack:racingOffTrackOn\(\)\?offTrackConfig\(\):false/);
 assert.match(src,/model\.setObstacles\?\.\(loaded\.obstacles\?\.\(\)\|\|\[\]\)/);
 assert.match(src,/e\.reason==='offtrack'\)\{toastText=t\('racing\.recover'\)/);
 assert.doesNotMatch(src,/הפסד/,'no "you lost" anywhere in the race session');
});

test('driving off the open run-off: the big flip, then the car lands on the centre line, along the road, at speed 0, without a gate, and drives on',()=>{
 const race=createRacing({stage:1,seed:4,config:{...OPEN,extraRivals:0}}),p=place(race,0,26),tr=race.track,half=tr.width/2,gates=p.checkpoints;
 let crash=null,maxBeyond=0;for(let n=0;n<8*60&&!crash;n++){race.step(1/60,{steer:-1,throttle:1,autoAccelerate:true});maxBeyond=Math.max(maxBeyond,Math.abs(p.lateral)-half);crash=race.state.events.find(e=>e.car==='player'&&e.type==='crash')||null;}
 assert.ok(crash,'the car left the run-off and flipped');assert.equal(crash.reason,'offtrack');assert.ok(['hard','far','long'].includes(crash.why));assert.ok(crash.strength>=OFF_TRACK.minStrength,'always the big show');
 assert.ok(maxBeyond<=OFF_TRACK.hard+.6,'never further than the hard limit plus one step: '+maxBeyond);
 assert.ok(p.crashDur>=.85&&p.crashDur<=1.1,'the m7 flight time: '+p.crashDur);assert.equal(p.crashSpin,2,'two rolls');
 let landing=null,last=Math.abs(p.lateral),air=0;
 for(let n=0;n<2*60&&!landing;n++){race.step(1/60,{steer:0,throttle:0,autoAccelerate:false});assert.ok(p.crashAir>=0&&p.crashAir<=1.6);air=Math.max(air,p.crashAir);
  assert.ok(Math.abs(p.lateral)<=last+.05,'flies back towards the centre line');last=Math.abs(p.lateral);landing=race.state.events.find(e=>e.car==='player'&&e.type==='crashRecover')||null;}
 assert.ok(landing,'it lands');assert.equal(landing.reason,'offtrack');assert.ok(air>1,'it rises in the arc: '+air);
 assert.equal(p.speed,0,'from speed 0');assert.ok(Math.abs(p.lateral)<1e-9,'on the centre line');assert.ok(Math.abs(wrap(p.heading-tr.sample(p.s).heading))<1e-6,'along the race direction');
 assert.equal(p.checkpoints,gates,'a flip never grants a gate');assert.ok(p.routeS<p.nextCheckpoint*tr.length/tr.checkpoints.length,'before the next gate');
 assert.equal(p.gear,1);assert.ok(p.rpm<=.22,'the revs already settled to idle in the air');assert.equal(p.crashT,0);
 events(race,{steer:0,throttle:1,autoAccelerate:true},2);assert.ok(p.speed>8,'the throttle drives it on: '+p.speed);
});

test('the soft limit flips only after the dwell, the long rule after OFF_TRACK.long s on the grass, never on the asphalt',()=>{
 const half=w=>w/2;
 {const race=createRacing({stage:1,seed:2,config:{...OPEN,extraRivals:0}}),w=race.track.width,p=place(race,half(w)+OFF_TRACK.soft+.8,9);
  const early=events(race,{steer:0,throttle:0,autoAccelerate:false},OFF_TRACK.dwell-.15);assert.ok(!early.some(e=>e.type==='crash'),'not before the dwell');
  const later=events(race,{steer:0,throttle:0,autoAccelerate:false},.4);const c=later.find(e=>e.type==='crash');assert.ok(c,'after the dwell');assert.equal(c.why,'far');}
 {const race=createRacing({stage:1,seed:2,config:{...OPEN,extraRivals:0}}),w=race.track.width,p=place(race,-(half(w)+2.5),6);
  const early=events(race,()=>{const tr=race.track,q=tr.sample(p.s+10);return {steer:clamp(wrap(Math.atan2(q.x+q.normal.x*-(half(w)+2.5)-p.x,q.z+q.normal.z*-(half(w)+2.5)-p.z)-p.heading)*2,-1,1),throttle:0,autoAccelerate:false};},OFF_TRACK.long-.4);
  assert.ok(!early.some(e=>e.type==='crash'),'2.5 m on the run-off is allowed for a while');
  const later=events(race,{steer:0,throttle:0,autoAccelerate:false},1.2);const c=later.find(e=>e.type==='crash');assert.ok(c,'lost on the grass for too long');assert.equal(c.why,'long');}
 {const race=createRacing({stage:1,seed:2,config:{...OPEN,extraRivals:0}}),p=race.state.player,q=[];const all=events(race,()=>pursuit(race,p,0,q),40);assert.ok(!all.some(e=>e.type==='crash'||e.type==='recovery'),'a clean drive never flips');}
});

test('?racingOffTrack=0 with no walls keeps the old open shoulders (back to the last gate after 3.5 s), ?racingWalls=1 keeps the fence: the car never gets off',()=>{
 {const race=createRacing({stage:1,seed:5,config:{countdown:0,walls:false,offTrack:false,extraRivals:0}}),p=place(race,0,26);
  const all=events(race,{steer:-1,throttle:1,autoAccelerate:true},8);assert.ok(!all.some(e=>e.type==='crash'&&e.reason==='offtrack'),'no off-track flip');assert.ok(all.some(e=>e.type==='recovery'),'the old recovery');}
 {const race=createRacing({stage:1,seed:5,config:{countdown:0,walls:true,offTrack:true,extraRivals:0}}),p=place(race,0,26),w=race.track.width;let max=0;
  for(let n=0;n<8*60;n++){race.step(1/60,{steer:-1,throttle:1,autoAccelerate:true});if(p.crashT<=0)max=Math.max(max,Math.abs(p.lateral));}
  assert.ok(max<=w/2+.25,'the fence holds the car: '+max);assert.equal(race.offTrack,null,'the off-track rule is idle behind a fence');}
});

test('1,000 hard exits over the 30 stages: every one flips, lands on the centre line at speed 0 along the road, before the next gate, and drives on (no NaN)',()=>{
 let word=99;const r=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296),rows=[];
 for(let i=0;i<1000;i++)rows.push(excursion(1+(i%30),1+Math.floor(r()*9999),{drive:1+r()*4,side:r()<.5?-1:1,lock:.55+r()*.45}));
 const bad=rows.filter(a=>!a.landing||a.nan||a.landing.speed>1.25||Math.abs(a.landing.lateral)>1e-6||Math.abs(a.landing.headingError)>1e-6||a.landing.gateGranted||!a.landing.beforeNextGate||a.maxBeyond>OFF_TRACK.hard+.6||a.speedAfter3s<8);
 assert.deepEqual(bad.slice(0,3),[],`${bad.length} of 1000 excursions went wrong`);
 assert.ok(Math.max(...rows.map(a=>a.landing.fromNearest))<12,'lands next to the nearest centre-line point (a few metres on, or before the next gate)');
});

test('no walls, sloppy driving: gates are never missed (routeS follows the car on the open run-off), the computer drivers stay on the road',()=>{
 for(const [stage,seed] of [[1,7],[2,31],[3,7],[4,31]]){
  const race=createRacing({stage,seed,config:{...OPEN,extraRivals:5}}),p=race.state.player,q=[];let w=seed*7919>>>0,t=8,m=0,side=1;const rnd=()=>((w=(Math.imul(w,1664525)+1013904223)>>>0)/4294967296);
  const c={recovery:0,rivalCrash:0,playerOff:0};
  for(let n=0;n<400*60&&race.state.phase!=='finished';n++){const b=pursuit(race,p,16,q);t-=1/60;if(t<=0){if(m>0){m=0;t=6+rnd()*6;}else{m=.6+rnd()*.8;t=m;side=rnd()<.5?-1:1;}}if(m>0)b.steer=b.steer*.3+side*.45;
   race.step(1/60,b);for(const e of race.state.events){if(e.type==='recovery'&&e.car==='player')c.recovery++;if(e.type==='crash'&&e.car!=='player')c.rivalCrash++;if(e.type==='crash'&&e.car==='player'&&e.reason==='offtrack')c.playerOff++;}}
  assert.equal(race.state.phase,'finished',`stage ${stage}: the race ends`);assert.equal(c.recovery,0,`stage ${stage}: never sent back to the last gate`);assert.equal(c.rivalCrash,0,`stage ${stage}: rivals do not flip`);
  assert.ok(c.playerOff>0,`stage ${stage}: the sloppy driver did leave the track (the test exercises the rule)`);
 }
});

test('a gate crossed on the open run-off counts (up to OFF_TRACK.gate beyond the edge)',()=>{
 const race=createRacing({stage:1,seed:3,config:{...OPEN,extraRivals:0}}),tr=race.track,sector=tr.length/tr.checkpoints.length,w=tr.width,lat=w/2+4,p=place(race,lat,15,sector-12);
 const q=tr.sample(sector);const all=events(race,()=>({steer:clamp(wrap(Math.atan2(q.x+q.normal.x*lat-p.x,q.z+q.normal.z*lat-p.z)-p.heading)*2,-1,1),throttle:1,autoAccelerate:true}),1.6);
 assert.ok(!all.some(e=>e.type==='crash'),'4 m out is within the run-off');assert.ok(Math.abs(p.lateral)>w/2+2,'still out on the run-off: '+p.lateral);assert.equal(p.checkpoints,1,'the gate counted');
});

test('posts (setObstacles): solid, a touch scrubs speed, a hard straight hit flips, nothing passes through; invalid entries are ignored',()=>{
 const race=createRacing({stage:1,seed:6,config:{...OPEN,extraRivals:0}}),tr=race.track,q=tr.sample(60);
 assert.equal(race.setObstacles([{x:q.x,z:q.z,r:.6},{x:NaN,z:1,r:1},{x:1,z:1,r:0},null]),1);assert.equal(race.obstacles.length,1);
 const p=place(race,0,20,30),all=[];let minGap=Infinity;
 for(let n=0;n<4*60;n++){race.step(1/60,{steer:0,throttle:1,autoAccelerate:true});for(const e of race.state.events)if(e.car==='player')all.push(e);
  if(p.crashT<=0){const fx=Math.sin(p.heading),fz=Math.cos(p.heading),along=clamp((q.x-p.x)*fx+(q.z-p.z)*fz,-1.9,1.9);minGap=Math.min(minGap,Math.hypot(p.x+fx*along-q.x,p.z+fz*along-q.z)-.6-.95);}}
 assert.ok(all.some(e=>e.type==='post'),'the post was hit');assert.ok(minGap>-.05,'the car never sinks into it: '+minGap);
 const hard=createRacing({stage:1,seed:6,config:{...OPEN,extraRivals:0}});hard.setObstacles([{x:q.x,z:q.z,r:.6}]);const h=place(hard,0,40,30);
 const e2=events(hard,{steer:0,throttle:1,autoAccelerate:true},2);assert.ok(e2.some(e=>e.type==='crash'&&e.reason==='post'),'a hard straight hit flips the car');
 assert.equal(createRacing({stage:1,seed:6,config:OPEN}).obstacles.length,0,'none in the pure model');
});

test('the camera shake is always finite: a fence kick on a car that is not flipping (crashDur 0) was 0/0 = NaN and the screen showed only the sky',()=>{
 assert.ok(Number.isNaN(Math.max(.28/.28*.6,0*.09*(0/0))),'the old expression (the bug)');
 assert.equal(shakeAmount(.28,.6,0,0,0),.6,'a fence kick');assert.equal(shakeAmount(0,0,0,0,0),0);
 assert.ok(Math.abs(shakeAmount(0,0,1,.5,1)-.045)<1e-12,'the flight shake');assert.equal(shakeAmount(.1,.5,1,.2,0),.1/.28*.5,'a flag without a duration never divides by zero');
 for(const v of [NaN,Infinity,-1])assert.ok(Number.isFinite(shakeAmount(v,.5,1,v,v)));
});

test('the view: walls only with ?racingWalls=1, the camera guard, posts from the arches and the gantry, trees out of the clear zone',async()=>{
 const src=await readFile(new URL('../workout/island/minigames/racing-view.mjs',import.meta.url),'utf8');
 assert.match(src,/const wallsOn=racingWallsOn\(\),clear=wallsOn\?0:CLEAR_ZONE;/);
 assert.match(src,/if\(wallsOn\)\{instances\(new T\.BoxGeometry\(\.15,\.28,3\.05\),steel,rails\)/,'the slope rails only with walls');
 assert.match(src,/shakeAmount\(shakeT,shakeA,flying,player\.crashT,player\.crashDur\)/);assert.match(src,/if\(!Number\.isFinite\(camera\.position\.x\+camera\.position\.y\+camera\.position\.z\+camTarget\.x/);
 assert.match(src,/const obstacles=\[\],leg=\(s,lane,r\)=>\{if\(wallsOn\)return;/);assert.match(src,/obstacles:\(\)=>obstacles\.map/);
 // the end of a flip: the roll (2-4 pi) is wrapped before it eases back, so the car does not spin back twice after the landing
 assert.match(src,/if\(Math\.abs\(car\.body\.rotation\.z\)>Math\.PI\)car\.body\.rotation\.z=Math\.atan2\(Math\.sin\(car\.body\.rotation\.z\),Math\.cos\(car\.body\.rotation\.z\)\);car\.body\.rotation\.z\+=/);
 const wrapped=Math.atan2(Math.sin(4*Math.PI),Math.cos(4*Math.PI));assert.ok(Math.abs(wrapped)<1e-9,'4 pi is the same pose as 0');
});

test('trackside: with no walls nothing solid stands within 9 m of the asphalt on any of the 30 stages (was 0.65 m); with walls the old layout is untouched',()=>{
 let nearest=Infinity,worst=null;
 for(let stage=1;stage<=30;stage++){const r=measureStage(stage,{clear:CLEAR_ZONE});for(const x of r.rows)if(!x.span&&x.beyond<nearest){nearest=x.beyond;worst={stage,...x};}}
 assert.ok(nearest>=9,'nearest solid object '+JSON.stringify(worst));
 const old=measureStage(1,{clear:0});assert.ok(old.rows.some(x=>x.beyond<1),'with walls the barrier is still there');
 for(let stage=1;stage<=6;stage++){const r=measureStage(stage,{clear:CLEAR_ZONE});assert.ok(!r.rows.some(x=>x.layer==='scenery'&&x.name==='racing-roadside-masonry'&&x.beyond<2),'no barrier');}
});

test('v7 spectators stand beyond the clear zone without walls, where they stood with walls',()=>{
 const track=createTrack(1),g=()=>0,open=crowdSites(track,g,1,CLEAR_ZONE),old=crowdSites(track,g,1);
 assert.ok(open.length>=40,'still a crowd: '+open.length);for(const s of open)assert.ok(track.project(s.x,s.z).distance>track.width/2+CLEAR_ZONE+.5);
 assert.ok(old.some(s=>track.project(s.x,s.z).distance<track.width/2+CLEAR_ZONE),'the old sites were inside');
});

test('the offline list carries the new module',async()=>{
 const m=JSON.parse(await readFile(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8'));
 assert.ok(JSON.stringify(m).includes('minigames/racing-offtrack.mjs'));
});

// ---- gear-change sound (task 4): ?racingShift=a|b|c, 'v22' = the sound until now; default 'a'
import {createRacingAudio,shiftStyle,SHIFT_STYLES} from '../workout/island/minigames/racing-audio.mjs';
import {createRacingSamples} from '../workout/island/minigames/racing-samples.mjs';
function audioContextMock(){
 const made={osc:[],src:[],gain:[],filter:[]};
 const param=v=>{const p={value:v,calls:[],setTargetAtTime(x){this.value=x;this.calls.push(['target',x]);},setValueAtTime(x,t){this.calls.push(['set',x,t,this.value]);},linearRampToValueAtTime(x,t){this.calls.push(['ramp',x,t]);},exponentialRampToValueAtTime(x,t){this.calls.push(['exp',x,t]);}};return p;};
 const node=extra=>Object.assign({connect(){},disconnect(){},start(t){this.started=t??0;},stop(t){this.stopped=t;}},extra);
 class Ctx{constructor(){this.state='running';this.currentTime=5;this.destination={};this.sampleRate=44100;}
  createOscillator(){const n=node({type:'sine',frequency:param(440)});made.osc.push(n);return n;}
  createBiquadFilter(){const n=node({type:'lowpass',frequency:param(350),Q:param(1)});made.filter.push(n);return n;}
  createGain(){const n=node({gain:param(1)});made.gain.push(n);return n;}
  createBuffer(){return {getChannelData:()=>new Float32Array(64)};}
  createBufferSource(){const n=node({playbackRate:param(1),buffer:null,loop:false});made.src.push(n);return n;}
  resume(){return Promise.resolve();}close(){return Promise.resolve();}}
 return {Ctx,made};
}
function drive(style,steps){const {Ctx,made}=audioContextMock();let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=new Ctx();return ctx;},storage:{getItem:()=>'on'},shift:style});audio.unlock();
 const osc0=made.osc.length,src0=made.src.length;for(const [t,gear,rpm] of steps){ctx.currentTime=t;audio.sync(20,false,{rpm,gear,throttle:1,steer:0});}
 return {audio,made,newOsc:made.osc.slice(osc0),newSrc:made.src.slice(src0),ctx};}

test('shift sound: ?racingShift picks a, b, c or v22 (the old sound); anything else is a',()=>{
 assert.deepEqual([...SHIFT_STYLES],['a','b','c','v22']);
 assert.equal(shiftStyle(''),'a');for(const s of ['a','b','c','v22'])assert.equal(shiftStyle('?racingShift='+s),s);assert.equal(shiftStyle('?racingShift=zz'),'a');
});

test('shift sound: a = a soft low thump that starts from 0 and ends on a ramp (no hiss, no pop); v22 keeps the old path; b and c play their own one-shot',()=>{
 const up=[[5,1,.5],[5.02,1,.7],[5.04,2,.4],[5.06,2,.45]];
 const a=drive('a',up),thump=a.newOsc.find(o=>o.stopped!==undefined);assert.ok(thump,'a: the thump oscillator');assert.equal(thump.type,'sine');
 const tg=a.made.gain.find(g=>g.gain.calls.some(c=>c[0]==='ramp'&&c[1]===.014));assert.ok(tg,'its gain node');assert.equal(tg.gain.calls[0][3],0,'starts from 0, not from the default 1');assert.equal(tg.gain.calls.at(-1)[1],0,'ends on 0');
 assert.equal(a.newSrc.length,0,'a: no noise one-shot');assert.equal(a.audio.engine().shiftStyle,'a');assert.equal(a.audio.engine().shifts,1);
 const v=drive('v22',up);assert.equal(v.newOsc.filter(o=>o.stopped!==undefined).length,0,'v22: no thump');assert.equal(v.newSrc.length,0,'v22 without samples: nothing new (the samples played shift-up)');
 const b=drive('b',up),hiss=b.newSrc.find(s=>s.stopped!==undefined);assert.ok(hiss,'b without samples: the filtered hiss');assert.ok(b.made.filter.some(f=>f.type==='bandpass'&&f.frequency.value===1500));
 const c=drive('c',up);assert.ok(c.newSrc.some(s=>s.stopped!==undefined),'c without samples: the procedural crack');assert.ok(c.made.filter.some(f=>f.type==='lowpass'&&f.frequency.value===800));
 for(const r of [b,c]){const g=r.made.gain.find(g=>g.gain.calls.some(x=>x[0]==='set'&&x[1]===0)&&g.gain.calls.some(x=>x[0]==='ramp'));assert.equal(g.gain.calls.find(x=>x[0]==='set')[3],0,'the cue gain starts from 0');}
});

test('shift sound: a and b blip the revs up on a downshift, v22 does not; the sample layer cuts the blow-off to 0.32 s and keeps the 0.45 s gearbox gate',async()=>{
 const down=[[5,3,.5],[5.02,3,.5],[5.04,2,.5]];
 const pitch=(style,steps)=>{const r=drive(style,steps);return r.audio.engine().pitch;};
 const flat=[[5,2,.5],[5.02,2,.5],[5.04,2,.5]];
 assert.ok(pitch('a',down)>pitch('a',flat)*1.02,'a: the rev blip');assert.ok(pitch('b',down)>pitch('b',flat)*1.02,'b: the rev blip');
 assert.ok(Math.abs(pitch('v22',down)-pitch('v22',flat))<1e-9,'v22 as before');
 const ctx={currentTime:1,destination:{},src:[],gains:[],createGain(){const g={gain:{value:1,calls:[],setValueAtTime(v,t){this.calls.push(['set',v,t,this.value]);},linearRampToValueAtTime(v,t){this.calls.push(['ramp',v,t]);},setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){}};this.gains.push(g);return g;},
  createBufferSource(){const s={playbackRate:{value:1,setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){},start(t){this.started=t;},stop(t){this.stopped=t;},loop:false};this.src.push(s);return s;},decodeAudioData:async()=>({duration:1})};
 const layer=createRacingSamples({context:ctx,base:'http://x/a/',fetchFn:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}),format:'ogg'});await layer.load();
 const n0=ctx.src.length;layer.turbo();const t=ctx.src.at(-1);assert.equal(ctx.src.length,n0+1);assert.equal(t.playbackRate.value,1.2);assert.ok(Math.abs(t.stopped-(1+.34))<1e-9,'stops right after its 0.32 s fade');
 const g=ctx.gains.at(-1);assert.equal(g.gain.calls[0][3],0,'from 0');assert.deepEqual(g.gain.calls.at(-1).slice(0,2),['ramp',0],'fades out');
 layer.crack();assert.equal(ctx.src.length,n0+1,'one gearbox sound per 0.45 s');ctx.currentTime=1.5;layer.crack();assert.equal(ctx.src.length,n0+2);ctx.currentTime=2;layer.shiftDownSoft();assert.equal(ctx.src.length,n0+3);
});

test('the engine note glides through the off-track flip: no pitch jump at the take-off or at the landing (the session feeds the audio every frame)',()=>{
 const {Ctx}=audioContextMock();let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=new Ctx();return ctx;},storage:{getItem:()=>'on'},shift:'a'});audio.unlock();
 const race=createRacing({stage:1,seed:4,config:{...OPEN,extraRivals:0}}),p=place(race,0,26);const pitch=[];let phase='drive',t=5;
 for(let n=0;n<10*60;n++){const steer=phase==='drive'?-1:0,thr=phase==='after'?1:phase==='drive'?1:0;race.step(1/60,{steer,throttle:thr,autoAccelerate:thr>0});
  for(const e of race.state.events)if(e.car==='player'){if(e.type==='crash')phase='fly';if(e.type==='crashRecover')phase='after';}
  t+=1/60;ctx.currentTime=t;audio.sync(p.speed,p.boosting,{rpm:p.rpm,gear:p.gear,throttle:thr,steer:p.steer});pitch.push({phase,f:audio.engine().pitch});}
 const steps=(ph)=>{let m=0;for(let i=1;i<pitch.length;i++)if(pitch[i].phase===ph&&pitch[i-1].phase===ph)m=Math.max(m,Math.abs(pitch[i].f-pitch[i-1].f)/pitch[i-1].f);return m;};
 const across=(a,b)=>{const i=pitch.findIndex((x,k)=>k>0&&x.phase===b&&pitch[k-1].phase===a);return Math.abs(pitch[i].f-pitch[i-1].f)/pitch[i-1].f;};
 assert.ok(pitch.some(x=>x.phase==='after'),'the flip happened and ended');
 assert.ok(across('drive','fly')<.12,'take-off: '+across('drive','fly'));assert.ok(across('fly','after')<.06,'landing: '+across('fly','after'));
 assert.ok(steps('fly')<.12,'in the air the note eases down: '+steps('fly'));
});

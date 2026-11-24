// racing-v24.9 (Roy after v24.8 on the phone, 22/11/2026: "a permanent caption about changing tyres, not relevant, should not appear / maybe an option to drift,
// because there are very hard corners / a caption in the middle of the race about an overtake and so on, it hides and disturbs"). Every change has an address flag
// (racing-v24-9.mjs): ?racingTyreHud=old, ?racingText=old, ?racingDrift=0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {racingV249Flags,v249PhysicsConfig,driftOn,driftInput,DRIFT,driftGrip,driftReward,CHIP,chipFor,chipForCard,chipForPit} from '../workout/island/minigames/racing-v24-9.mjs';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {racingV24Flags,v24PhysicsConfig,playerInput} from '../workout/island/minigames/racing-v24.mjs';
import {racingV245Flags,v245PhysicsConfig} from '../workout/island/minigames/racing-v24-5.mjs';
import {racingV247Flags,v247PhysicsConfig,TIGHT} from '../workout/island/minigames/racing-v24-7.mjs';
import {createPitUi} from '../workout/island/minigames/racing-pit-ui.mjs';
import {createRacingControls} from '../workout/island/minigames/racing-controls.mjs';
import {broadcastEvents} from '../workout/island/minigames/racing-broadcast.mjs';
import {solo,field,drive,CFG} from '../workout/island/tools/racing-v24-9-sim.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=p=>readFile(path.join(island,p),'utf8');
const f24=racingV24Flags(''),BASE={countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(f24),pitAuto:true,pitSeq:true,...v245PhysicsConfig(racingV245Flags('')),...v247PhysicsConfig(racingV247Flags(''),true)};
const cfg=(query='')=>({...BASE,...v249PhysicsConfig(racingV249Flags(query),f24.turbo)});
const place=(r,car,s,lane,speed)=>{const p=r.track.sample(s),k=Math.floor(s/(r.track.length/16));Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:k,nextCheckpoint:k+1,gearInit:false});};
/** a car alone on the main straight of stage 1 at `speed`, the race clock past the start */
function straight(query,speed=34){const r=createRacing({stage:1,seed:3,config:{...cfg(query),stage:{opponents:0}}}),p=r.state.player,m=r.track.mainStraight;place(r,p,m.from+30,0,speed);r.state.time=10;return {r,p};}
const run=(r,seconds,input,each)=>{for(let n=0;n<Math.round(seconds*60);n++){r.step(1/60,input);each?.();}};
const events=(r,type)=>r.state.events.filter(e=>e.car==='player'&&e.type===type);

test('flags: tyres only in the pits, messages in the corner and the drift by default; each one has its address value',()=>{
 assert.deepEqual({...racingV249Flags('')},{tyreHud:'pit',text:'corner',drift:true});
 assert.equal(racingV249Flags('?racingTyreHud=old').tyreHud,'old');assert.equal(racingV249Flags('?racingText=old').text,'old');assert.equal(racingV249Flags('?racingDrift=0').drift,false);
 assert.deepEqual(v249PhysicsConfig(racingV249Flags('')),{drift249:true});assert.deepEqual(v249PhysicsConfig(racingV249Flags('?racingDrift=0')),{drift249:false});
 assert.equal(driftOn(racingV249Flags(''),'v23'),false,'?racingTurbo=v23 keeps its own "drift / brake" button');assert.deepEqual(v249PhysicsConfig(racingV249Flags(''),'v23'),{drift249:false});
});

test('the drift button slides, the brake button brakes, both together brake; without the flag the sample passes untouched',()=>{
 const sample=(over={})=>({steer:.5,throttle:1,autoAccelerate:false,brake:false,drift:false,nitro:false,slide:false,...over});
 const through=(s,on=true)=>driftInput(playerInput(s,f24),s,on);
 assert.deepEqual(through(sample({slide:true})),{...sample({slide:true}),drift:true,brake:false});
 const braked=through(sample({brake:true,drift:true}));assert.equal(braked.brake,true);assert.equal(braked.drift,false,'the brake button never drifts (v24)');
 const both=through(sample({brake:true,drift:true,slide:true}));assert.equal(both.brake,true);assert.equal(both.drift,false);
 const s=sample({slide:true}),off=through(s,false);assert.equal(off.drift,false);assert.equal(off.brake,false);
});

test('controls: the drift button exists only when asked, sends {slide}, holds the gas like the nitro, and X is its key',t=>{
 class El extends EventTarget{constructor(tag,doc){super();this.tagName=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.className='';this.style={setProperty(){},removeProperty(){}};
  this.classList={add:(...v)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...v])].join(' ');},remove:(...v)=>{this.className=this.className.split(' ').filter(x=>!v.includes(x)).join(' ');}};}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}append(...c){for(const e of c){e.parentElement=this;this.children.push(e);}}setPointerCapture(){}closest(){return null;}}
 const fixture=slide=>{const doc=new EventTarget();doc.defaultView=new EventTarget();doc.hidden=false;doc.createElement=tag=>new El(tag,doc);doc.createElementNS=(_,tag)=>new El(tag,doc);
  const root=doc.createElement('div'),controls=createRacingControls({root,canvas:doc.createElement('canvas'),t:k=>k,automatic:false,...(slide===undefined?{}:{slide})});t.after(()=>controls.dispose());
  const walk=e=>[e,...e.children.flatMap(walk)],buttons=Object.fromEntries(walk(root).filter(e=>e.dataset.gameControl).map(e=>[e.dataset.gameControl,e]));return {doc,controls,buttons};};
 const fire=(target,type,values={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,values);target.dispatchEvent(e);};
 const plain=fixture();assert.deepEqual(Object.keys(plain.buttons).sort(),['accelerate','drift','nitro']);assert.equal('slide' in plain.controls.sample(),false,'the v24.8 sample has no slide field');
 const {doc,controls,buttons}=fixture(true);assert.ok(buttons.slide,'the drift button');assert.match(buttons.slide.className,/racing-action racing-slide/);assert.equal(buttons.slide.getAttribute('aria-label'),'racing.slide');
 assert.deepEqual({...controls.sample(),steer:0},{steer:0,throttle:0,autoAccelerate:false,brake:false,drift:false,nitro:false,slide:false});
 fire(buttons.slide,'pointerdown',{pointerId:7});let s=controls.sample();assert.equal(s.slide,true);assert.equal(s.throttle,1,'the drift finger holds the gas');assert.equal(s.brake,false);assert.equal(s.drift,false);
 fire(buttons.slide,'pointerup',{pointerId:7});assert.equal(controls.sample().slide,false);
 fire(doc.defaultView,'keydown',{code:'KeyX'});assert.equal(controls.sample().slide,true);fire(doc.defaultView,'keyup',{code:'KeyX'});assert.equal(controls.sample().slide,false);
 fire(buttons.slide,'pointerdown',{pointerId:8});controls.setEnabled(false);assert.equal(controls.sample().slide,false,'released on pause');
});

test('the drift costs far less speed than the brake, the engine neither pulls nor brakes a sliding car, and without the wheel the button does nothing',()=>{
 const loss=(input,seconds=1)=>{const {r,p}=straight('');const v0=p.speed;run(r,seconds,input);const out=(v0-p.speed)/seconds;r.dispose();return out;};
 const gas={steer:.6,throttle:1,autoAccelerate:true},drift=loss({...gas,drift:true}),driftNoGas=loss({steer:.6,throttle:0,autoAccelerate:false,drift:true}),brake=loss({...gas,brake:true});
 assert.ok(Math.abs(drift-DRIFT.decel)<.4,'a second of drift costs '+drift.toFixed(2)+' m/s');assert.ok(Math.abs(driftNoGas-drift)<.2,'the same without the gas: '+driftNoGas.toFixed(2));
 assert.ok(brake>20&&drift<brake/5,'the brake costs '+brake.toFixed(1)+' m/s a second');
 const {r,p}=straight('');run(r,.5,{steer:0,throttle:1,autoAccelerate:true,drift:true});assert.equal(p.drifting,false,'no slide in a straight line');r.dispose();
});

test('a sliding car turns tighter than the grip limit (DRIFT.aLat against TIGHT.aLat) after running wide for a moment; a drift held past DRIFT.fade loses its grip',()=>{
 assert.ok(DRIFT.aLat>TIGHT.aLat*1.3);assert.equal(driftGrip(0),DRIFT.aLat);assert.equal(driftGrip(DRIFT.fade),DRIFT.aLat);assert.ok(Math.abs(driftGrip(DRIFT.fade+DRIFT.fadeOver)-DRIFT.aLat*DRIFT.faded)<1e-9);assert.ok(DRIFT.aLat*DRIFT.faded<TIGHT.aLat,'a faded drift turns less than the grip');
 // the heading turned in 1 s at full lock from 30 m/s, and the lateral acceleration it means
 const turn=(input,query='')=>{const {r,p}=straight(query,30);const h0=p.heading;let slip=0;run(r,1,{steer:1,throttle:1,autoAccelerate:true,...input},()=>{slip=Math.max(slip,Math.abs(p.slipAngle));});const out={rate:Math.abs(Math.atan2(Math.sin(p.heading-h0),Math.cos(p.heading-h0))),speed:p.speed,slip};r.dispose();return out;};
 const grip=turn({}),drift=turn({drift:true});
 assert.ok(grip.rate*30<TIGHT.aLat+1.5,'on grip the car holds '+(grip.rate*30).toFixed(1)+' m/s^2');
 assert.ok(drift.rate*29>DRIFT.aLat-4&&drift.rate*29<DRIFT.aLat+3,'sliding it holds '+(drift.rate*29).toFixed(1)+' m/s^2');
 assert.ok(drift.rate>grip.rate*1.3,'the slide turns the car '+(drift.rate/grip.rate).toFixed(2)+' times as much');
 assert.ok(drift.slip>DRIFT.slip*.8&&grip.slip<.06,'the slide angle: '+drift.slip.toFixed(2)+' rad (the path lags the nose: the short loss of grip)');
 // held for 4 s (past fade + fadeOver): the yaw rate of the last half second is the faded one, and the car reports that it pushes wide
 const {r,p}=straight('',30);let h=0,wide=0;run(r,3.5,{steer:1,throttle:1,autoAccelerate:true,drift:true});h=p.heading;const v=p.speed;run(r,.5,{steer:1,throttle:1,autoAccelerate:true,drift:true},()=>{wide=Math.max(wide,p.wide);});
 if(p.drifting){const rate=Math.abs(Math.atan2(Math.sin(p.heading-h),Math.cos(p.heading-h)))/.5;assert.ok(rate*v<DRIFT.aLat*DRIFT.faded+3,'a drift held 4 s holds only '+(rate*v).toFixed(1)+' m/s^2');assert.ok(wide>0,'and pushes wide');}
 else assert.ok(p.offroad||p.crashT>0||p.recoveryTime>0,'a drift held 4 s on a straight left the road');
 r.dispose();
});

test('a long clean drift charges the ERS when it is released, with no boost by itself; a short one, or one that ends off the asphalt, gives nothing',()=>{
 assert.equal(driftReward(DRIFT.clean-.05),0);assert.equal(driftReward(DRIFT.clean),+(DRIFT.ers*DRIFT.clean).toFixed(2));assert.equal(driftReward(9),+(DRIFT.ers*DRIFT.fade).toFixed(2),'seconds past the fade do not count');assert.equal(driftReward(2,false),0);
 // a real lap of stage 10 by the simulation's drifter: every drift that was released
 const r=createRacing({stage:10,seed:5,config:{...cfg(''),stage:{opponents:0,laps:2,timeLimit:400}}}),p=r.state.player,st={},ends=[];let boosts=0,boosted=false,checked=0;
 for(let n=0;n<70*60&&r.state.phase==='racing';n++){p.nitro=Math.min(p.nitro,40);const before=p.nitro;r.step(1/60,drive(r,p,st,'drifter',{aDrift:36}));boosts+=events(r,'driftBoost').length;boosted=boosted||p.boosting;
  for(const e of events(r,'driftEnd')){ends.push(e);if(e.gain>0){checked++;assert.equal(e.gain,+e.reward.toFixed(1));assert.ok(p.nitro-before>=e.gain-.11,'the ERS meter rose by the reward: '+(p.nitro-before).toFixed(2)+' for '+e.gain);}}}
 r.dispose();
 const clean=ends.filter(e=>e.gain>0),short=ends.filter(e=>e.seconds<DRIFT.clean-.02);
 assert.ok(ends.length>=10&&clean.length>=3&&short.length>=1&&checked>=1,`${ends.length} drifts, ${clean.length} clean, ${short.length} short`);
 for(const e of ends){assert.ok(e.gain<=driftReward(e.seconds)+.06,'never more than the rule: '+JSON.stringify(e));if(e.seconds<DRIFT.clean-.02||!e.clean)assert.equal(e.gain,0,JSON.stringify(e));}
 for(const e of clean)assert.ok(e.gain>=DRIFT.ers*DRIFT.clean-.06&&e.gain<=DRIFT.ers*DRIFT.fade+.06,JSON.stringify(e));
 assert.equal(boosts,0,'no drift boost event');
 // the v23 drift (the pure model's default; ?racingDrift=0): the boost on release and no driftEnd
 const {r:r2,p:p2}=straight('?racingDrift=0',30);let b2=0,e2=0,on=false;run(r2,.45,{steer:.5,throttle:1,autoAccelerate:true,drift:true});run(r2,.3,{steer:.5,throttle:1,autoAccelerate:true},()=>{b2+=events(r2,'driftBoost').length;e2+=events(r2,'driftEnd').length;on=on||p2.boosting;});
 assert.equal(b2,1);assert.equal(e2,0);assert.equal(on,true);r2.dispose();
 // the same half second with the flag: a short drift, no reward, no boost
 const {r:r3,p:p3}=straight('',30);const got=[];let on3=false;run(r3,.45,{steer:.5,throttle:1,autoAccelerate:true,drift:true});run(r3,.3,{steer:.5,throttle:1,autoAccelerate:true},()=>{got.push(...events(r3,'driftEnd'));on3=on3||p3.boosting;});
 assert.equal(got.length,1);assert.equal(got[0].gain,0);assert.equal(on3,false);r3.dispose();
});

test('fair: on circuits full of tight corners the drifter beats the best braker, drifting in every bend loses to both, and the computer drivers never drift',()=>{
 for(const stage of [5,10,11]){
  const braker=[22,24,26,28].map(aLat=>solo(stage,'braker',{aLat})).filter(r=>r.finished).sort((a,b)=>a.time-b.time)[0],drifter=[32,36,40].map(aDrift=>solo(stage,'drifter',{aDrift})).filter(r=>r.finished).sort((a,b)=>a.time-b.time)[0],always=solo(stage,'always');
  assert.ok(braker&&drifter&&always.finished,'stage '+stage+': all three finished');
  assert.ok(drifter.time<braker.time-.5,`stage ${stage}: the drifter ${drifter.time} s, the braker ${braker.time} s`);
  assert.ok(always.time>braker.time+1,`stage ${stage}: drifting in every bend ${always.time} s, the braker ${braker.time} s`);
  assert.equal(drifter.flips,0,'stage '+stage+': the drifter never flips');assert.ok(drifter.cleanDrifts>=3,'stage '+stage+': '+drifter.cleanDrifts+' clean drifts charged the ERS');
 }
 const f=field(10,'drifter',{aDrift:36});assert.equal(f.aiDrifting,false);assert.ok(f.rank>=1&&f.rank<=10,'the drifter finished the race in the field: place '+f.rank);
});

test('the computer drivers are untouched: with the same player input the whole race is identical with and without the drift flag',()=>{
 const race=query=>{const r=createRacing({stage:10,seed:9,config:{...cfg(query),extraRivals:5}}),p=r.state.player,log=[];
  for(let n=0;n<45*60;n++){const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=Math.atan2(Math.sin(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),Math.cos(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading));
   r.step(1/60,p.pit?{steer:0,throttle:0,autoAccelerate:false}:{steer:Math.max(-1,Math.min(1,err*1.7)),throttle:1,autoAccelerate:true,brake:p.speed>30&&Math.abs(err)>.12,drift:false,nitro:false});
   if(n%300===299)log.push(r.state.cars.map(c=>[+c.x.toFixed(4),+c.z.toFixed(4),+c.speed.toFixed(4),c.rank,c.drifting]));}
  r.dispose();return log;};
 const on=race(''),off=race('?racingDrift=0');assert.deepEqual(on,off);assert.ok(on.flat().every(c=>c[4]===false),'nobody drifted');
});

/** a tiny DOM for the pit HUD (the one of island-racing-v24-1.test.mjs) */
function fakeDocument(){
 const el=tag=>({tagName:tag,className:'',textContent:'',hidden:false,dataset:{},style:{},attrs:{},children:[],listeners:{},type:'',src:'',alt:'',draggable:true,
  setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},append(...c){this.children.push(...c);},remove(){this.removed=true;},
  addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);},querySelectorAll(){return [];},closest(){return null;}});
 return {createElement:el};
}
test('tyres: no meter, no button and no announcement outside the pit lane; the meter shows while the car is in it; ?racingTyreHud=old keeps v24.8',()=>{
 const make=tyreHud=>{const doc=fakeDocument(),stage=doc.createElement('div'),controls=doc.createElement('div'),ui=createPitUi({stage,controls,document:doc,auto:true,phoneFix:false,changeButton:false,tyreHud});
  return {ui,meter:stage.children.find(c=>c.className==='racing-tyres'),button:controls.children.find(c=>c.className==='racing-pit-button')};};
 const state=(over={})=>({laps:2,cars:[],player:{tyre:.8,lap:1,pits:0,pitRequest:true,pitAuto:true,pit:null,...over}});
 const now=make('pit');assert.equal(now.button,undefined,'no pit button beside the controls');
 now.ui.update(state());assert.equal(now.meter.hidden,true,'on the stop lap, before the pit entry: no meter');
 for(const phase of ['entry','lane','stop','change','leave','exit']){now.ui.update(state({pit:{phase,t:0,dur:2}}));assert.equal(now.meter.hidden,false,'the meter shows in the pit lane: '+phase);}
 now.ui.update(state({pits:1,pitRequest:false}));assert.equal(now.meter.hidden,true,'and leaves with the car');
 assert.equal(now.ui.toast({car:'player',type:'pitRequest',auto:true}),null,'the stop is not announced a lap ahead');assert.equal(now.ui.toast({car:'player',type:'pitDone'}),'צמיגים חדשים');
 const old=make('old');assert.ok(old.button,'v24.8 (phoneFixD=0): the button');old.ui.update(state());assert.equal(old.meter.hidden,false,'v24.8: the meter all race long');assert.match(old.ui.toast({car:'player',type:'pitRequest',auto:true}),/צמיגים/);
});

test('messages are short corner chips: a position, a lap, the fastest lap, the pit stop itself; nothing about tyres before the pit lane',()=>{
 assert.deepEqual(chipFor('up','3'),{kind:'up',icon:'▲',text:'מקום 3'});assert.equal(chipFor('nothing'),null);
 for(const kind of ['up','down','lap','fastest','ers','pickup','boostPad','offroad','recover','pitIn','pitChange','pitDone','pitCancel','drift','draft']){const c=chipFor(kind,kind==='fastest'?'1:07.42':'');assert.ok(c.text.length<=CHIP.max&&c.icon.length<=2,kind+': '+c.text);
  assert.equal(/צמיג/.test(c.text),kind.startsWith('pit')&&kind!=='pitCancel',kind);}
 assert.ok(CHIP.seconds<=2);
 const state={phase:'racing',time:30,laps:3,cars:[{id:'player',isPlayer:true,lapTimes:[67.42]},{id:'ai-1',name:'אלמוג',lapTimes:[70]}],player:{id:'player',lap:2,lapTimes:[67.42],finished:false}};
 const cards=broadcastEvents(state,{changes:[{id:'player',from:4,to:3,delta:1}],prevFastest:{id:'ai-1',time:70},prevLaps:0}).cards;
 assert.deepEqual(cards.map(c=>c.kind).sort(),['fastest','lap','up']);
 const chips=Object.fromEntries(cards.map(c=>[c.kind,chipForCard(c)]));
 assert.deepEqual(chips.up,{kind:'up',icon:'▲',text:'מקום 3'});assert.equal(chips.lap.text,'הקפה 2/3');assert.equal(chips.fastest.text,'הקפה מהירה 1:07.42');
 assert.equal(chipForCard({kind:'lap',title:'הקפה אחרונה',sub:'אחרונה 1:07.42'}).text,'הקפה אחרונה');
 assert.equal(chipForCard(null),null);assert.equal(chipForCard({kind:'grid',title:'x'}),null);
 assert.equal(chipForPit({car:'player',type:'pitRequest',auto:true}),null,'the automatic stop is not announced a lap ahead');assert.equal(chipForPit({car:'ai-1',type:'pitIn'}),null);
 assert.equal(chipForPit({car:'player',type:'pitIn'}).text,'נכנסים לצמיגים');assert.equal(chipForPit({car:'player',type:'pitDone'}).text,'צמיגים חדשים');
});

test('wiring: the session reads the flags, the chip lives in the HUD corner, the card is not shown, the drift button and tip are styled, and the files are in the offline list',async()=>{
 const [session,css,bc,strings,manifest]=await Promise.all([read('minigames/racing-session.mjs'),read('minigames/racing-v24.css'),read('minigames/racing-broadcast.mjs'),read('data/strings.he.json'),read('offline-manifest.json')]);
 assert.match(session,/from '\.\/racing-v24-9\.mjs\?v=island-v2-/);assert.match(session,/\.\.\.v249PhysicsConfig\(v249,v24\.turbo\)/);assert.match(session,/tyreHud:v249\.tyreHud/);assert.match(session,/showCards:!cornerText/);
 assert.match(session,/hud\.append\(toast\)/,'the chip is a child of the top-left HUD block');assert.match(session,/driftInput\(playerInput\(sample,v24\),sample,slideOn\)/);assert.match(session,/slide:slideOn/);
 assert.match(session,/island\.racing\.driftTip/,'the tip is shown once per device');
 assert.match(css,/\[data-racing-text=corner\] \.racing-hud \.racing-toast\{\s*position:static;transform:none/);assert.match(css,/\.racing-slide\{/);assert.match(css,/\.racing-drift-tip\{/);
 assert.match(bc,/card\.hidden=!c\|\|!showCards/);
 assert.equal(JSON.parse(strings)['racing.slide'],'דריפט');
 assert.match(manifest,/minigames\/racing-v24-9\.mjs/);
 assert.equal(CFG.drift249,true,'the simulation runs the session default');
});

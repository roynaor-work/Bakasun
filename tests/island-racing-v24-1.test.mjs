// Historical optional pit cancellation remains available under rollback; tests/island-phone-fix-d.test.mjs checks mandatory automatic entry.
globalThis.location={search:'?phoneFixD=0'};
// racing-v24.1 (Roy after v24 on the phone: "a tyre change on only one track, I did not notice whether it went there by itself; the goal is that it goes in for
// the tyre change automatically after two laps"). ?racingPitAuto=0 brings v24 back; the pure race model keeps v24 unless its config asks (the session does).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {pitAutoEnabled,autoStopLap,PIT_AUTO,PIT,playerInput,racingV24Flags} from '../workout/island/minigames/racing-v24.mjs';
import {getRacingStage,createTrack,TRACKS} from '../workout/island/minigames/racing-tracks.mjs';
import {calendar} from '../workout/island/minigames/racing-league.mjs';
import {V24,pilot} from '../workout/island/tools/racing-v24-sim.mjs';
import {createPitUi} from '../workout/island/minigames/racing-pit-ui.mjs';

const island=new URL('../workout/island/',import.meta.url),read=f=>readFile(new URL(f,island),'utf8');
const AUTO={...V24,pitAuto:true};
const make=(stage,seed,cfg,extra=7)=>createRacing({stage,seed,config:{countdown:0,extraRivals:extra,walls:false,offTrack:true,...cfg}});
/** drive the player like a child who never touches the pit button (the pilot of the sims, its brake mapped as the v24 button) until `until` says stop */
function drive(race,until,{seconds=240,onStep=null}={}){
 const p=race.state.player,st={},flags=racingV24Flags(''),log=[];
 for(let n=0;n<seconds*60&&race.state.phase!=='finished';n++){
  race.step(1/60,p.pit?{steer:0,throttle:0,autoAccelerate:false}:playerInput(pilot(race,p,st,{aLat:24,aBrake:20}),flags));
  for(const e of race.state.events)log.push({...e,t:race.state.time,lapNow:race.state.cars.find(c=>c.id===e.car)?.lap});
  onStep?.(race,log);if(until(race,log))break;
 }
 return log;
}

test('flag and rule: v24.1 by default, ?racingPitAuto=0 is v24; the automatic stop is at the end of lap 2, or lap 1 in a two-lap race',()=>{
 assert.equal(pitAutoEnabled(''),true);assert.equal(pitAutoEnabled('?racingPitAuto=0'),false);assert.equal(pitAutoEnabled('?racingPitAuto=1'),true);
 assert.deepEqual([2,3,4,5].map(autoStopLap),[1,2,2,2]);assert.equal(PIT_AUTO.distance,3500);assert.equal(PIT.minLaps,3,'v24 is unchanged');
});

test('why v24 showed the stop on one track only: it needed 3 laps, and the quick races of tiers 0-1, the league sprints and half the short-races calendar have 2; v24.1 stops in every race',()=>{
 // quick races: stages 1-12 run 2 laps, 13-30 run 3
 const laps=Array.from({length:30},(_,i)=>getRacingStage(i+1).laps);assert.deepEqual(laps,[...Array(12).fill(2),...Array(18).fill(3)]);
 const on=(stage,cfg)=>{const r=make(stage,1,cfg,0),v=!!r.pit.on;r.dispose();return v;};
 for(let s=1;s<=30;s++){assert.equal(on(s,V24),s>12,'v24 stage '+s);assert.equal(on(s,AUTO),true,'v24.1 stage '+s);}
 // the league: every race is 2 or 3 laps of the six 2.0-2.3 km circuits, so 4.0 km and more: all over PIT_AUTO.distance
 for(const t of TRACKS){const L=createTrack(t.id).length;assert.ok(L>2000&&L<2300,t.id+' '+L);assert.ok(2*L>=PIT_AUTO.distance);}
 for(const shortRaces of [false,true])for(let season=1;season<=5;season++){const cal=calendar(season,{shortRaces});
  assert.ok(cal.every(c=>c.laps>=2&&c.laps<=3));if(season===1)assert.equal(cal.filter(c=>c.laps===2).length,shortRaces?6:1,'season 1: the sprint (and the short-races setting) run 2 laps');}
 const lg=make(1,1,{...AUTO,stage:{laps:2}},0);assert.ok(lg.pit.on&&lg.pit.auto&&lg.pit.stopLap===1,'a two-lap league race stops at the end of lap 1');lg.dispose();
});

test('3 laps, no tap at all: the stop is announced at the start of lap 2 (not 80 m before the entry as in v24), the car goes in at the end of lap 2, the change starts by itself, new tyres',()=>{
 const race=make(13,3,AUTO),p=race.state.player;assert.equal(race.pit.stopLap,2);
 const log=drive(race,(r,l)=>l.some(e=>e.type==='pitExit'&&e.car==='player'));
 const ask=log.find(e=>e.type==='pitRequest'&&e.car==='player'),lap2=log.find(e=>e.type==='lap'&&e.car==='player')?.t??null;
 assert.ok(ask&&ask.auto&&ask.lap===2,'asked automatically on lap 2: '+JSON.stringify(ask));
 const pin=log.find(e=>e.type==='pitIn'&&e.car==='player'),change=log.find(e=>e.type==='pitChange'&&e.car==='player'),done=log.find(e=>e.type==='pitDone'&&e.car==='player');
 assert.ok(pin&&pin.lap===2&&pin.auto,'in at the end of lap 2: '+JSON.stringify(pin));
 assert.ok(pin.t-ask.t>30,'announced a long way before the entry ('+(pin.t-ask.t).toFixed(1)+' s), so a child sees it coming');
 assert.ok(change&&change.tapped===false,'the change started by itself');assert.ok(done&&p.tyre===1&&p.pits===1&&p.pitLaps[0]===2);
 if(lap2!==null)assert.ok(ask.t>=lap2-.05||ask.t<=lap2+60);
 race.dispose();
});

test('2 laps, no tap: the stop is announced after the start and taken at the end of lap 1; every computer driver stops on lap 1 too and the race finishes',()=>{
 const race=make(1,3,AUTO),p=race.state.player;assert.equal(race.pit.stopLap,1);
 const log=drive(race,()=>false,{seconds:300});
 const ask=log.find(e=>e.type==='pitRequest'&&e.car==='player'),pin=log.find(e=>e.type==='pitIn'&&e.car==='player');
 assert.ok(ask&&ask.auto&&ask.t>=PIT_AUTO.armAfter&&ask.t<PIT_AUTO.armAfter+.1,'announced 5 s after the start');assert.ok(pin&&pin.lap===1);
 assert.equal(race.state.phase,'finished');assert.equal(p.pits,1);
 for(const c of race.state.cars)assert.deepEqual(c.pitLaps,[1],c.id+' stopped once, on lap 1');
 assert.ok(!log.some(e=>/^pit/.test(e.type)&&Number.isNaN(e.t)));
 race.dispose();
});

test('a tap cancels the automatic stop until the car is committed 80 m before the entry; it is not asked again, and the button can still ask for one',()=>{
 const race=make(1,3,AUTO),p=race.state.player;let cancelled=null,lateTry=null;
 const log=drive(race,(r,l)=>l.some(e=>e.type==='lap'&&e.car==='player'),{seconds:200,onStep:(r)=>{if(!cancelled&&p.pitRequest&&p.pitAuto&&r.state.time>8){cancelled={ok:r.cancelPit(),t:r.state.time};}}});
 assert.ok(cancelled&&cancelled.ok,'cancelled');assert.ok(log.some(e=>e.type==='pitCancel'&&e.car==='player'));
 assert.equal(p.pitCancelled,true);assert.equal(p.pits,0);assert.ok(!log.some(e=>e.type==='pitIn'&&e.car==='player'),'drove past the entry');
 assert.equal(log.filter(e=>e.type==='pitRequest'&&e.car==='player').length,1,'never asked again');
 // a stop asked by hand on the last lap is refused (no stop on the last lap)
 assert.equal(race.requestPit(),false);race.dispose();
 // committed: the decision 80 m before the entry holds, a late cancel is refused
 const r2=make(1,3,AUTO),p2=r2.state.player;
 drive(r2,()=>false,{seconds:200,onStep:(r)=>{if(lateTry===null&&p2.pitGo&&p2.pitRequest&&!p2.pit)lateTry=r.cancelPit();}});
 assert.equal(lateTry,false,'too late to cancel');assert.equal(p2.pits,1);r2.dispose();
 // a stop asked by hand in v24.1 can be cancelled too, and then the automatic one still comes
 const r3=make(13,3,AUTO),p3=r3.state.player;let asked=false,undone=null;
 const l3=drive(r3,(r,l)=>l.some(e=>e.type==='pitRequest'&&e.car==='player'&&e.auto),{seconds:200,onStep:(r)=>{if(!asked&&r.state.time>10){asked=r.requestPit();}else if(asked&&undone===null&&r.state.time>12)undone=r.cancelPit();}});
 assert.ok(asked&&undone,'asked by hand on lap 1, then cancelled');assert.equal(p3.pitCancelled,false,'a manual cancel does not stop the automatic one');
 assert.ok(l3.some(e=>e.type==='pitRequest'&&e.car==='player'&&e.auto&&e.lap===2));r3.dispose();
});

test('v24 without pitAuto (?racingPitAuto=0): 2-lap races have no stop, cancel does nothing, and in 3 laps the player is asked silently 80 m before the entry',()=>{
 const r1=make(1,3,V24,0);assert.equal(r1.pit.on,false);assert.equal(r1.pit.auto,false);r1.dispose();
 const race=make(13,3,V24),p=race.state.player;let tried=null;
 const log=drive(race,(r,l)=>l.some(e=>e.type==='pitIn'&&e.car==='player'),{onStep:(r)=>{if(tried===null&&p.pitRequest)tried=r.cancelPit();}});
 const ask=log.find(e=>e.type==='pitRequest'&&e.car==='player'),pin=log.find(e=>e.type==='pitIn'&&e.car==='player');
 assert.equal(tried,false,'no cancel in v24');assert.ok(ask&&pin&&pin.t-ask.t<6,'v24 asked only just before the entry ('+(pin.t-ask.t).toFixed(1)+' s)');race.dispose();
});

/** a tiny DOM for the pit HUD: elements with class, text, dataset, attributes, children and pointerdown listeners */
function fakeDocument(){
 const el=tag=>{const n={tagName:tag,className:'',textContent:'',hidden:false,dataset:{},style:{},attrs:{},children:[],listeners:{},type:'',src:'',alt:'',draggable:true,
  setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},append(...c){this.children.push(...c);},remove(){this.removed=true;},
  addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);},querySelectorAll(){return [];},
  press(){for(const fn of this.listeners.pointerdown||[])fn({preventDefault(){},stopPropagation(){}});}};return n;};
 return {createElement:el};
}
test('pit HUD: the button pulses "automatic" from the start of the stop lap and a tap cancels; a hand request can be cancelled too; v24 keeps its button',()=>{
 for(const auto of [true,false]){
  const doc=fakeDocument(),stage=doc.createElement('div'),controls=doc.createElement('div'),calls=[];
  const ui=createPitUi({stage,controls,document:doc,auto,onRequest:()=>calls.push('request'),onCancel:()=>calls.push('cancel'),onTap:()=>calls.push('tap')});
  const button=controls.children.find(c=>c.dataset.action==='racing-pit');
  const player={tyre:.9,lap:2,pits:0,pit:null,pitRequest:true,pitAuto:true,pitGo:false};ui.update({player,laps:3,cars:[player]});
  if(auto){assert.equal(button.dataset.state,'auto');assert.match(button.children.at(-1).textContent,/אוטומטי/);assert.match(button.getAttribute('aria-label'),/מבטלת/);
   button.press();assert.deepEqual(calls,['cancel']);
   ui.update({player:{...player,pitGo:true},laps:3,cars:[player]});assert.equal(button.hidden,true,'committed: no button');
   ui.update({player:{...player,pitAuto:false},laps:3,cars:[player]});assert.equal(button.dataset.state,'requested');button.press();assert.deepEqual(calls,['cancel','cancel']);
   assert.equal(ui.toast({car:'player',type:'pitCancel'}),'הפיטס בוטל');assert.match(ui.toast({car:'player',type:'pitRequest',auto:true}),/אוטומטי/);}
  else{assert.equal(button.dataset.state,'requested','v24 shows its automatic stop as a request');button.press();assert.deepEqual(calls,[],'and a tap does nothing, as in v24');
   assert.equal(ui.toast({car:'player',type:'pitCancel'}),'הפיטס בוטל');assert.equal(ui.toast({car:'player',type:'pitRequest',auto:true}),'בסוף ההקפה: פיטס להחלפת צמיגים');}
  ui.update({player:{...player,pitRequest:false,pitAuto:false},laps:3,cars:[player]});assert.equal(button.dataset.state,'idle');button.press();assert.equal(calls.at(-1),'request');
 }
});

test('session, view and style carry v24.1',async()=>{
 const session=await read('minigames/racing-session.mjs');
 assert.match(session,/v24PhysicsConfig\(v24\),pitAuto:pitAutoEnabled\(\)/);assert.match(session,/auto:!!model\.pit\.auto,onRequest:/);assert.match(session,/onCancel:\(\)=>\{model\.cancelPit\?\.\(\);\}/);
 assert.match(session,/pits:!!model\.pit\?\.on\}/,'the view paints the boxes when the model has stops (two-lap races too)');
 const view=await read('minigames/racing-view.mjs');assert.match(view,/pits:pitsOn\}=\{\}\)\{/);assert.match(view,/if\(pitsOn!==undefined\?pitsOn:pv\.pitBoxesOn\(stage\)\)\{/);
 const css=await read('minigames/racing-v24.css');assert.match(css,/racing-pit-button\[data-state=auto\]\{[^}]*animation:racing-pit-auto/);assert.match(css,/prefers-reduced-motion[^\n]*data-state=auto\]\{animation:none\}/);
 const physics=await read('minigames/racing-physics.mjs');assert.match(physics,/const pitAutoOn=!!config\.pitAuto;/);assert.match(physics,/enabled:!!config\.pit,auto:pitAutoOn\}/);assert.match(physics,/state\.events=pitAutoOn\?state\.events\.filter\(e=>e\.id>stepSerial&&\/\^pit\/\.test\(e\.type\)\):\[\];/);assert.match(physics,/pitCrew\.watch\(car,state\.time\)/);
 for(const f of ['minigames/racing-pit.mjs','minigames/racing-v24.mjs','minigames/racing-session.mjs','minigames/racing-pit-ui.mjs'])assert.doesNotMatch(await read(f),/\?v=island-v2-20261107-16/,f+' carries the current tag');
});

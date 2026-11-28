// v25.2 interface fixes, group B (QA scan of v25.1, 28/11/2026): the races and the basketball. Every group has an address flag that brings v25.1 back:
// ?racingDriftTip=old, ?racingGauge=old, ?racingCredit=old, ?racingLabels=old, ?racingContact=old (racing-v25-2.mjs), ?hoopsMeterPos=old, ?hoopsBtnPos=old (hoops-v252.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {racingV252Flags,v252PhysicsConfig,DRIFT_TIP,driftTipStep,DRAFT_CHIP,draftChipOn,CREDIT_LINE} from '../workout/island/minigames/racing-v25-2.mjs';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';
import {racingV24Flags,v24PhysicsConfig} from '../workout/island/minigames/racing-v24.mjs';
import {racingV245Flags,v245PhysicsConfig} from '../workout/island/minigames/racing-v24-5.mjs';
import {racingV247Flags,v247PhysicsConfig} from '../workout/island/minigames/racing-v24-7.mjs';
import {racingV249Flags,v249PhysicsConfig} from '../workout/island/minigames/racing-v24-9.mjs';
import {hoopsV252Flags,meterAnchor,METER} from '../workout/island/minigames/hoops-v252.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=p=>readFile(path.join(island,p),'utf8');
const ARABIC=/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

test('racing flags: the new behaviour is the default and every group has its own way back', () => {
 assert.deepEqual({...racingV252Flags('')},{driftTip:'corner',gauge:'side',credit:'intro',labels:'clear',contact:'long'});
 assert.equal(racingV252Flags('?racingDriftTip=old').driftTip,'old');
 assert.equal(racingV252Flags('?racingGauge=old').gauge,'old');
 assert.equal(racingV252Flags('?racingCredit=old').credit,'old');
 assert.equal(racingV252Flags('?racingLabels=old').labels,'old');
 assert.equal(racingV252Flags('?racingContact=old').contact,'old');
 const one=racingV252Flags('?racingGauge=old');
 assert.deepEqual([one.driftTip,one.credit,one.labels,one.contact],['corner','intro','clear','long'],'one flag does not drag the others');
 assert.deepEqual(v252PhysicsConfig(racingV252Flags('')),{noseTail:true});
 assert.deepEqual(v252PhysicsConfig(racingV252Flags('?racingContact=old')),{noseTail:false});
});

test('drift tip: nothing on the straight, three seconds at the first hard turn at speed, then gone for good', () => {
 const tip={shownAt:null,done:false},at=(time,more={})=>driftTipStep(tip,{racing:true,time,steer:0,speed:30,drifting:false,pit:false,...more});
 for(const t of [0,2,5,8,11.9])assert.deepEqual(at(t),{show:false,done:false},'straight at '+t);
 assert.equal(at(12.5,{steer:.3}).show,false,'a gentle bend is not a hard turn');
 assert.equal(at(13,{steer:.9,speed:8}).show,false,'a hard turn at walking pace is not one either');
 assert.deepEqual(at(14,{steer:-.8}),{show:true,done:false});
 assert.equal(at(15.5).show,true,'it stays after the wheel is straight again');
 assert.equal(at(14+DRIFT_TIP.seconds-.05).show,true);
 assert.deepEqual(at(14+DRIFT_TIP.seconds),{show:false,done:true});
 assert.deepEqual(at(40,{steer:1}),{show:false,done:true},'never again');
 assert.equal(DRIFT_TIP.seconds,3);
 // the first drift ends it at once, shown or not
 const b={shownAt:null,done:false};assert.deepEqual(driftTipStep(b,{racing:true,time:4,steer:1,speed:30,drifting:true}),{show:false,done:true});
 // not in the countdown, not in the first second and a half
 const c={shownAt:null,done:false};assert.equal(driftTipStep(c,{racing:false,time:0,steer:1,speed:30}).show,false);assert.equal(driftTipStep(c,{racing:true,time:1,steer:1,speed:30}).show,false);
});

test('drift tip, ?racingDriftTip=old: the v25.1 window from 1.5 to 12 seconds', () => {
 const tip={shownAt:null,done:false},at=(time,more={})=>driftTipStep(tip,{racing:true,time,steer:0,speed:30,drifting:false,pit:false,...more},'old');
 assert.equal(at(1).show,false);assert.equal(at(2).show,true);assert.equal(at(11).show,true);assert.equal(at(6,{pit:true}).show,false);
 assert.deepEqual(at(12),{show:false,done:true});
});

test('slipstream chip: a readable name, in the race at speed only', () => {
 assert.equal(DRAFT_CHIP.text,'רוח גבית');assert.ok(!/סלפה/.test(DRAFT_CHIP.text+DRAFT_CHIP.icon));assert.ok(!ARABIC.test(DRAFT_CHIP.text));assert.ok(!/!/.test(DRAFT_CHIP.text));
 assert.equal(draftChipOn({draft:.5,racing:false,speed:0}),false,'not on the standing grid');
 assert.equal(draftChipOn({draft:.5,racing:true,speed:3}),false);
 assert.equal(draftChipOn({draft:.5,racing:true,speed:25}),true);
 assert.equal(draftChipOn({draft:.1,racing:true,speed:25}),false);
 assert.equal(draftChipOn({draft:.5,racing:false,speed:0},'old'),true,'the old flag keeps v25.1');
});

test('racing session and styles: gauge on the side, no link out of the race, no hint over the start lights', async () => {
 const session=await read('minigames/racing-session.mjs'),css=await read('minigames/racing-v24.css'),broadcast=await read('minigames/racing-broadcast.mjs');
 assert.match(session,/if\(v252\.gauge==='side'\)screen\.dataset\.racingGauge='side'/);
 assert.match(session,/if\(v252\.credit==='old'\)\{const credit=node\('a','racing-credit'/,'the link exists only with the old flag');
 assert.equal((session.match(/target='_blank'/g)||[]).length,1);
 assert.match(session,/creditLine:v252\.credit!=='old'\?CREDIT_LINE:''/);
 assert.match(broadcast,/if\(creditLine\)side\.append\(node\('small','rb-intro-credit',creditLine\)\)/);
 assert.match(session,/cornerText&&\(s\.phase==='racing'\|\|v252\.labels!=='old'\)/,'the hint is hidden in the countdown too');
 assert.match(session,/driftTipStep\(tipState,/);
 assert.match(session,/\.\.\.v252PhysicsConfig\(v252\)/);
 // the side gauge: anchored to the right edge from the top (not the bottom centre), smaller, and it outranks the child HUD rule
 const rule=css.match(/\[data-racing-gauge=side\]\[data-racing-gauge\] \.racing-readout\{([^}]*)\}/)?.[1]||'';
 assert.match(rule,/bottom:auto/);assert.match(rule,/top:var\(--race-gauge-top\)/);assert.match(rule,/right:max\(var\(--race-edge\)/);
 const dial=Number(rule.match(/--race-dial:(\d+)px/)?.[1]);assert.ok(dial>0&&dial<=90,'smaller than the 122 px dial');
 assert.match(css,/\[data-racing-gauge=side\]\[data-racing-gauge\] \.racing-energy\{[^}]*bottom:auto/);
 assert.ok(/Car Concept/.test(CREDIT_LINE)&&/Eric Chadwick/.test(CREDIT_LINE)&&/CC BY 4\.0/.test(CREDIT_LINE),'CC-BY: the work, the author, the licence');
 assert.ok(!ARABIC.test(CREDIT_LINE)&&!/!/.test(CREDIT_LINE));
});

const f24=racingV24Flags('');
const cfg=noseTail=>({walls:true,offTrack:false,feel:true,engine:true,extraRivals:5,crash:true,shiftMap:true,ers:true,ai:true,grid:true,grind:true,topCap:true,revShift:true,crashFx:true,...v24PhysicsConfig(f24),pitAuto:true,pitSeq:true,
 ...v245PhysicsConfig(racingV245Flags('')),...v247PhysicsConfig(racingV247Flags(''),true),...v249PhysicsConfig(racingV249Flags(''),f24.turbo),noseTail});
/** A child who starts late: frames in the first eight seconds in which a rival stands inside the player's car (a car is 4.2 m long and about 2 m wide). */
function lateStart(noseTail,seed){
 const r=createRacing({stage:1,seed,difficulty:'easy',config:cfg(noseTail)});let inside=0,raceT=0,jump=0;const prev=new Map();
 for(let i=0;i<60*12&&r.state.time<8;i++){
  if(r.state.phase==='racing')raceT+=1/60;r.step(1/60,{steer:0,throttle:raceT>1.5?1:0,autoAccelerate:false});const p=r.state.player;
  for(const c of r.state.cars){const was=prev.get(c.id);if(was&&!c.isPlayer)jump=Math.max(jump,Math.hypot(c.x-was.x,c.z-was.z)-Math.max(was.speed,c.speed)/60);prev.set(c.id,{x:c.x,z:c.z,speed:c.speed});
   if(c.isPlayer)continue;const dx=c.x-p.x,dz=c.z-p.z,fwd=dx*Math.sin(p.heading)+dz*Math.cos(p.heading),side=dx*Math.cos(p.heading)-dz*Math.sin(p.heading);
   if(Math.abs(fwd)<3.9&&Math.abs(side)<1.6)inside++;}
 }
 return {inside,jump,rank:r.state.player.rank,slowest:Math.min(...r.state.cars.filter(c=>!c.isPlayer).map(c=>c.speed))};
}

test('start line: a rival no longer stands with its nose inside a late-starting car; the old circle did', () => {
 for(const seed of [1,7]){
  const old=lateStart(false,seed),now=lateStart(true,seed);
  assert.ok(old.inside>=20,`seed ${seed}: the v25.1 contact reproduces the overlap (${old.inside} frames)`);
  assert.ok(now.inside<=3,`seed ${seed}: nose to tail now (${now.inside} frames)`);
  assert.ok(now.jump<.6,`seed ${seed}: no rival teleports (${now.jump.toFixed(2)} m)`);
  assert.ok(now.slowest>10,`seed ${seed}: nobody is left waiting behind the player (${now.slowest.toFixed(1)} m/s)`);
 }
});

test('start line: the model alone (no config) keeps the v25.1 contact, so the computer drivers and the old tests are untouched', async () => {
 const physics=await read('minigames/racing-physics.mjs');
 assert.match(physics,/noseTail=config\.noseTail===true/);
 assert.match(physics,/else if\(noseTail&&aiOn&&\(first\.isPlayer\|\|second\.isPlayer\)/,'the player\'s car only');
});

test('hoops flags: both groups default to the new layout and each has its own way back', () => {
 assert.deepEqual({...hoopsV252Flags('')},{meterPos:'side',btnPos:'top'});
 assert.deepEqual({...hoopsV252Flags('?hoopsMeterPos=old')},{meterPos:'old',btnPos:'top'});
 assert.deepEqual({...hoopsV252Flags('?hoopsBtnPos=old')},{meterPos:'side',btnPos:'old'});
});

test('hoops shot meter: smaller, beside the shooter on the side with no player next to him, inside the screen', () => {
 const W=844,H=390,shooter={x:600,y:210};
 const free=meterAnchor({shooter,others:[{x:570,y:200},{x:520,y:230}],width:W,height:H});
 assert.equal(free.side,1,'players on the left: the meter goes right');
 assert.ok(free.x>shooter.x+METER.gap-1);
 const other=meterAnchor({shooter,others:[{x:640,y:205}],width:W,height:H});
 assert.equal(other.side,-1,'a player on the right: the meter goes left');
 const edge=meterAnchor({shooter:{x:830,y:200},others:[],width:W,height:H});
 assert.ok(edge.x<=W-METER.margin&&edge.x>=METER.margin,'never off the screen');
 const top=meterAnchor({shooter:{x:400,y:20},others:[],width:W,height:H});
 assert.ok(top.y-METER.height/2>=METER.margin-1,'never off the top');
 assert.ok(METER.scale<=.72,'smaller than the v25.1 meter');
 const none=meterAnchor({shooter,others:[],width:W,height:H});assert.equal(none.side,1,'alone: the default side');
});

test('hoops shot meter: a button block is never covered, even when a player stands on the other side', () => {
 const W=844,H=390,avoid=[{x0:W-250,y0:H-175,x1:W,y1:H}];
 const a=meterAnchor({shooter:{x:590,y:300},others:[{x:557,y:300}],width:W,height:H,avoid});
 assert.equal(a.side,-1,'the buttons are on the right: the meter goes left even over a player');
 const b=meterAnchor({shooter:{x:300,y:200},others:[],width:W,height:H,body:120,avoid});
 assert.ok(b.x-300>=METER.gap+METER.width/2,'a near (large) shooter pushes the meter further out');
});

test('hoops session and styles: the meter anchors to the shooter, no large ring after the release, the two round buttons leave the basket', async () => {
 const hud=await read('minigames/hoops-v250-hud.mjs'),session=await read('minigames/hoops-session.mjs'),css=await read('minigames/hoops-v250.css');
 assert.match(hud,/const sideMeter=v252\?\.meterPos==='side';if\(sideMeter\)screenEl\.dataset\.hoopsMeterPos='side'/);
 assert.match(hud,/meterAnchor\(\{shooter:\{x:px,y:py\},others,/);
 assert.match(session,/const v252=hoopsV252Flags\(params\)/);assert.match(session,/if\(v252\.btnPos==='top'\)screenEl\.dataset\.hoopsBtnPos='top'/);
 assert.match(css,/\[data-hoops-meter-pos=side\] \.hv250-meter\{width:18px;height:92px\}/);
 assert.match(css,/\[data-hoops-meter-pos=side\] \.hv250-reb-ring\{display:none\}/,'the large ring is gone, the small jump spot stays');
 assert.ok(!/\[data-hoops-meter-pos=side\] \.hv250-reb(-core)?\{[^}]*display:none/.test(css));
 const top=css.match(/\[data-hoops-btn-pos=top\] \.hoops-kit-trigger\{top:calc\((\d+)px/)?.[1];assert.equal(top,'12','the top row, not 72 px down');
 assert.match(css,/\[data-hoops-btn-pos=top\]\[data-hoops-v250~=hud\] \.kid-hoops-pass-launch\{top:max\(12px/);
 assert.equal(METER.width,18);assert.equal(METER.height,92);
});

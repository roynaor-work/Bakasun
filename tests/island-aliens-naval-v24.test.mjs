// v24 (14/11/2026), Roy after v23 on the phone.
// Aliens: "it worked. But the buttons are too big and hide; they should be elegant, at the side" (thin rings in one column at the right
// edge, `?alienHud=v23` restores v23) and "the Vulcan needs a way to refill" (a Vulcan magazine drops from downed aliens; it empties the
// gauge and keeps the barrels cold; `?alienRefill=0` restores v23).
// Ships: "the aiming is a serious improvement; I want one more level" (a tap locks, a Lock button with smart order and swipe, the lock
// moves on after a sinking, the Vulcan crosshair locks on aircraft, the hit ring on the forecast hull; `?navalAim=v23`), "the enemies
// should fire a lot more" (1.45x to 2.4x, salvos, red decals, lighter hits; `?navalEnemyFire=v23`) and "a submarine under water: only a
// torpedo hits it; it fires under water only" (`?navalSub=v23`).
// Pure rules, models (headless, deterministic), input layer on a fake DOM, drawing on a recording canvas, data and wiring. The real phone
// path (CDP touch at 844x390) is workout/island/tests/aliens-naval-v24-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienHudV24Enabled,alienRefillEnabled,V24_DEFAULTS,v24Config,refillShouldDrop,refillApply,refillLevel} from '../workout/island/minigames/alien-v24.mjs';
import {drawV24Refills,drawV24Cold} from '../workout/island/minigames/alien-v24-draw.mjs';
import {drawV14Heat} from '../workout/island/minigames/alien-v14-draw.mjs';
import {createAlienVulcan} from '../workout/island/minigames/alien-v23-ui.mjs';
import {v23Config} from '../workout/island/minigames/alien-v23.mjs';
import {createAlienV24Audio} from '../workout/island/minigames/alien-v24-audio.mjs';
import {alienFlightHudStatus,alienFlightFeedbackText} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {createNavalModel,navalTargetable} from '../workout/island/minigames/naval.mjs';
import {createNavalInput} from '../workout/island/minigames/naval-controls.mjs';
import {navalAimV24,navalEnemyFireV24,navalSubV24,navalV24Config,NAVAL_V24_DEFAULTS,navalFireRate,navalFireSeconds,navalEnemyAim,navalSubDepth,navalSubShield,navalTorpedoStock,navalLockOrder,navalLockNext,navalHitChance,navalChanceColor,NAVAL_V24_COLORS} from '../workout/island/minigames/naval-v24.mjs';
import {drawNavalV24,navalV24Threats,NAVAL_V24_WORDS} from '../workout/island/minigames/naval-v24-hud.mjs';
import {navalSkyAngles} from '../workout/island/minigames/naval-air.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {playStage} from './helpers/naval-kid-bot.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const config=JSON.parse(await read('../workout/island/data/config.json')).minigames,ab=config.alienDefense,nb=config.navalDuel,strings=JSON.parse(await read('../workout/island/data/strings.he.json'));
const FRAME=1/60,PHONE=(844/390)/(360/480),phone={...config,width:844,height:390},DEG=Math.PI/180;
/** Alien model under the v24 switches (globals the flag readers use). */
function alien({refill=true,level=1,seed=3,...rest}={}){globalThis.__alienRefill=refill?undefined:'0';try{return createAlienModel({config,balance:ab,level,random:seededRandom(seed),completion:'waves',roundChoices:false,...rest});}finally{globalThis.__alienRefill=undefined;}}
/** Naval model under a search string (the flag readers use location.search). */
function naval(stage,seed,search='',balance=nb){globalThis.location={search};try{return createNavalModel({config:phone,balance,level:stage,seed,random:seededRandom(seed),difficulty:stage});}finally{delete globalThis.location;}}
const run=(m,frames,input={})=>{for(let i=0;i<frames&&!m.result;i++)m.update(FRAME,typeof input==='function'?input(m,i):input);};
/** A canvas that records what was drawn. */
function recorder(){const calls=[];const p=new Proxy({canvas:{clientWidth:844,width:844},calls},{get(t,k){if(k in t)return t[k];if(k==='measureText')return s=>({width:String(s).length*6});if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...a)=>{calls.push([k,...a]);};},set(t,k,v){t[k]=v;calls.push(['set:'+String(k),v]);return true;}});return p;}

// ---------------------------------------------------------------- Aliens
test('aliens v24 flags: HUD and refill on by default; ?alienHud=v23 and ?alienRefill=0 (or the globals) restore v23; config carries the numbers',()=>{
 assert.equal(alienHudV24Enabled('',undefined),true);assert.equal(alienHudV24Enabled('?alienHud=v23',undefined),false);assert.equal(alienHudV24Enabled('','v23'),false);
 assert.equal(alienRefillEnabled('',undefined),true);assert.equal(alienRefillEnabled('?alienRefill=0',undefined),false);assert.equal(alienRefillEnabled('','0'),false);
 assert.ok(ab.v24?.refill,'config.json alienDefense.v24.refill');assert.deepEqual(Object.keys(v24Config({}).refill).sort(),Object.keys(V24_DEFAULTS.refill).sort());
 const c=v24Config(ab).refill;assert.ok(c.coldSeconds>=3&&c.coldSeconds<=8);assert.ok(c.maxOnScreen>=1&&c.gapSeconds>=3);assert.deepEqual(c.bigKinds,[1,4],'heavy and carrier always drop');
 assert.equal(alien().refillOn,true);assert.equal(alien({refill:false}).refillOn,false);
 globalThis.__alienFire='v15';try{assert.equal(createAlienModel({config,balance:ab,level:1,random:seededRandom(3)}).refillOn,false,'refill is part of the two-button fire');}finally{globalThis.__alienFire=undefined;}
});

test('refill drop rule: big ships and boss phases always (gap and one on screen allowing), others by chance only after the Vulcan was used, pity after locks',()=>{
 const c=v24Config(ab).refill,never=()=>.99,always=()=>0;
 assert.equal(refillShouldDrop({kind:1,time:20,lastDropAt:-Infinity,random:never},c),true,'heavy');assert.equal(refillShouldDrop({kind:4,time:20,random:never},c),true,'carrier');
 assert.equal(refillShouldDrop({phase:true,time:20,random:never},c),true,'boss phase');assert.equal(refillShouldDrop({kind:1,child:true,time:20,random:never},c),false,'a launched child is not a big ship');
 assert.equal(refillShouldDrop({kind:1,time:20,lastDropAt:20-c.gapSeconds+.1,random:never},c),false,'gap');assert.equal(refillShouldDrop({kind:1,time:20,onScreen:c.maxOnScreen,random:never},c),false,'one at a time');
 assert.equal(refillShouldDrop({kind:0,time:20,lastVulcanAt:-Infinity,random:always},c),false,'Vulcan never used: a scout drops nothing');
 assert.equal(refillShouldDrop({kind:0,time:20,lastVulcanAt:15,random:always},c),true,'Vulcan used: by chance');assert.equal(refillShouldDrop({kind:0,time:20,lastVulcanAt:15,random:never},c),false);
 assert.equal(refillShouldDrop({kind:0,time:20,overheatsSince:c.pityOverheats,random:never},c),true,'pity after locks');
 const r=refillApply({heat:1,lock:1.4,rest:0},c);assert.equal(r.gate.heat,0);assert.equal(r.gate.lock,0);assert.equal(r.cold,c.coldSeconds);
 assert.equal(refillLevel('red',1),'cold');assert.equal(refillLevel('red',0),'red');
});

test('refill in the model: a magazine falls after a Vulcan run, the pick-up ends a lock at once, empties the gauge and keeps the barrels cold (no heat) for coldSeconds',()=>{
 const m=alien({level:2,seed:5});m.effectAspect=PHONE;const c=v24Config(ab).refill;let picked=null,locked=false,frames=0;
 // A pilot under the falling magazine (or the lowest alien) holding both buttons, as the browser bot does.
 while(!m.result&&frames<60*240&&!picked){const r=m.refills[0],t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0],want=r?r.x:t?t.x:m.player.x;if(m.vulcanLocked)locked=true;m.update(FRAME,{moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),firing:true,vulcan:true});frames++;if(m.refillPicked)picked={...m.refillPicked};}
 assert.ok(picked,'a magazine was picked up');assert.ok(locked,'the Vulcan had locked before');const s=m.snapshot();assert.ok(s.refill.dropped>=1&&s.refill.collected>=1);
 assert.equal(m.vulcanLocked,false,'the pick-up ends the lock');assert.ok(m.refillCold>c.coldSeconds-.1,'cold for coldSeconds');assert.ok(m.vulcanHeat<.01,'gauge empty');
 const vf=m.snapshot().vulcanFired;run(m,Math.round((c.coldSeconds-.3)/FRAME),{vulcan:true,firing:false});
 assert.ok(m.snapshot().vulcanFired-vf>=(c.coldSeconds-.4)*9,'the Vulcan fires the whole cold time');assert.ok(m.vulcanHeat<.01&&!m.vulcanLocked,'no heat while cold');
 run(m,90,{vulcan:true});assert.ok(m.vulcanHeat>.05||m.vulcanLocked,'after the cold time the gauge fills again');
 const hud=alienFlightFeedbackText({kind:'refill',id:1,life:1});assert.match(hud.text,/מחסנית וולקן/);
});

test('?alienRefill=0: no magazines and the same game as v23; with the regular button only (no Vulcan, no big ships at stage 1) v24 plays exactly like v23',()=>{
 const a=alien({refill:false}),b=alien({refill:true});a.effectAspect=b.effectAspect=PHONE;
 const pilot=(m,i)=>({moveX:Math.sin(i/40),firing:true});run(a,60*40,pilot);run(b,60*40,pilot);
 const strip=s=>{const {refill,refills,...rest}=s;return JSON.stringify(rest);};assert.equal(strip(a.snapshot()),strip(b.snapshot()),'identical game');
 assert.equal(a.snapshot().refill,undefined);assert.equal(b.snapshot().refill.dropped,0);
 const both=alien({refill:false,level:2});both.effectAspect=PHONE;run(both,60*60,{firing:true,vulcan:true});assert.equal(both.refills.length,0);assert.equal(both.refillCold,0);
});

test('balance: stage 1 at the phone aspect is still won in 85-135 s with both buttons (taking the magazines as they come) and the Vulcan alone gets stronger',()=>{
 const play=(seed,hold,refill,chase)=>{const m=alien({refill,seed});m.effectAspect=PHONE;const r0=seededRandom(seed*7+1);let on=false;
  for(let f=0;f<30*400&&!m.result;f++){if(f%30===0)on=r0()<chase;const r=on?m.refills?.[0]:null,t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0],py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}let want=r?r.x:t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>14);if(!safe(want)){out:for(let d=0;d<=360;d+=3)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>18&&x<342&&safe(x)){want=x;break out;}}}
   m.update(1/30,{moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),...hold});}
  return {seconds:m.time,win:m.result?.outcome==='win',dropped:m.snapshot().refill?.dropped??0,collected:m.snapshot().refill?.collected??0};};
 const both=[1,2,3,4].map(s=>play(s,{firing:true,vulcan:true},true,.5)),avg=both.reduce((n,r)=>n+r.seconds,0)/both.length;
 assert.ok(both.every(r=>r.win),JSON.stringify(both));assert.ok(avg>=85&&avg<=135,`both buttons ${avg.toFixed(1)} s`);assert.ok(both.every(r=>r.dropped>=3&&r.collected>=1),'magazines fall and are taken');
 const v23=[1,2,3,4].map(s=>play(s,{vulcan:true},false,0)),v24=[1,2,3,4].map(s=>play(s,{vulcan:true},true,.5));
 const wins=rs=>rs.filter(r=>r.win).length,sec=rs=>rs.reduce((n,r)=>n+r.seconds,0)/rs.length;
 assert.ok(wins(v24)>=wins(v23)&&sec(v24)<sec(v23),`Vulcan alone: v23 ${wins(v23)} wins ${sec(v23).toFixed(0)} s, v24 ${wins(v24)} wins ${sec(v24).toFixed(0)} s`);
});

test('aliens drawing and HUD text: the falling magazine and the pick-up burst, the cyan cold bar instead of the heat bar, the weapon line says the Vulcan is cold',()=>{
 const base={time:3,player:{x:180,y:440},v23:true,v14:true,v15:true,vulcanHeat:.6,vulcanLocked:false};
 const p=recorder();const n=drawV24Refills(p,{...base,refills:[{id:1,x:100,y:200},{id:2,x:200,y:240}],refillPicked:null},2.9,1);assert.equal(n,2);assert.ok(p.calls.some(c=>c[0]==='fill'||c[0]==='drawImage'),'a token is drawn (picture or glyph)');
 const q=recorder();drawV24Refills(q,{...base,refills:[],refillPicked:{at:2.9,x:180,y:440}},2.9,1);assert.ok(q.calls.some(c=>c[0]==='arc'||c[0]==='drawImage'),'the pick-up burst');
 const cold=recorder();assert.equal(drawV24Cold(cold,{...base,refillCold:2.5,refillColdMax:5},2.9,1),true);assert.ok(cold.calls.some(c=>c[0]==='set:fillStyle'&&c[1]==='#6fe3ff'),'cyan');
 assert.equal(drawV24Cold(recorder(),{...base,refillCold:0,refillColdMax:5},2.9,1),false);
 const heat=recorder();drawV14Heat(heat,{...base,refillOn:true,refills:[],refillCold:3,refillColdMax:5},2.9,1);assert.ok(heat.calls.some(c=>c[0]==='set:fillStyle'&&c[1]==='#6fe3ff'),'while cold the bar is the cyan one');
 const status=alienFlightHudStatus({v23:true,vulcanLocked:false,refillCold:3.2,wings:[]},'touch');assert.match(status.weaponText,/וולקן קר 4ש׳/);
});

/** The fake DOM of the v23 Vulcan tests (buttons with listeners, a style map). */
function fakeDom(){
 const node=tag=>{const map={},attrs={},props={},classes=new Set(),captures=new Set();const n={tagName:tag,children:[],dataset:{},parent:null,style:{setProperty(k,v){props[k]=v;},getPropertyValue(k){return props[k]||'';}},classList:{toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},
  addEventListener(type,fn,opts){(map[type]||=[]).push({fn,signal:opts?.signal});},setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k]??null,append(...kids){for(const k of kids){k.parent=n;n.children.push(k);}},remove(){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);},
  setPointerCapture(id){captures.add(id);},releasePointerCapture(id){captures.delete(id);},hasPointerCapture:id=>captures.has(id),querySelector(sel){const id=sel.replace('#','');const find=list=>{for(const c of list){if(c.id===id)return c;const f=find(c.children);if(f)return f;}return null;};return find(n.children);}};return n;};
 const doc={head:node('head'),createElement:tag=>node(tag),createElementNS:(ns,tag)=>node(tag)},win=node('window'),controls=node('div'),shoot=node('button');shoot.id='shoot';controls.append(shoot);return {doc,win,controls};
}
test('Vulcan ring with a magazine: cyan "cold" level that drains with the cold time, back to the heat bands after it',()=>{
 const {doc,win,controls}=fakeDom(),v=createAlienVulcan({controls,cfg:v23Config(ab),windowTarget:win,documentTarget:doc});
 v.update({time:1,vulcanHeat:0,vulcanLocked:false,refillCold:5,refillColdMax:5});assert.equal(v.button.dataset.level,'cold');assert.equal(v.button.style.getPropertyValue('--heat'),'100%');
 v.update({time:2,vulcanHeat:0,vulcanLocked:false,refillCold:2.5,refillColdMax:5});assert.equal(v.button.style.getPropertyValue('--heat'),'50%');
 v.update({time:3,vulcanHeat:.9,vulcanLocked:false,refillCold:0,refillColdMax:5});assert.equal(v.button.dataset.level,'red');v.dispose();
});

test('aliens v24 sounds: the magazine and the lock play the Codex samples on their own context, nothing else, and the island mute holds',async()=>{
 const started=[];class Ctx{constructor(){this.state='running';this.destination={};this.currentTime=0;}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}createBufferSource(){return {buffer:null,connect(){},disconnect(){},start(){started.push(this.buffer);},set onended(f){}};}decodeAudioData(){return Promise.resolve({decoded:true});}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 const fetched=[],fetcher=async url=>{fetched.push(String(url));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};};
 const a=createAlienV24Audio({storage:{getItem:()=>null},AudioContext:Ctx,fetch:fetcher});a.unlock();await new Promise(r=>setTimeout(r,5));
 assert.ok(fetched.some(u=>u.includes('assets/alien-v24/refill-pickup.ogg'))&&fetched.some(u=>u.includes('assets/alien-v24/overheat.ogg')));
 assert.equal(a.play('refill'),true);assert.equal(a.play('overheat'),true);assert.equal(a.play('shot'),false);assert.equal(started.length,2);
 const muted=createAlienV24Audio({storage:{getItem:k=>k==='island.sound'?'off':null},AudioContext:Ctx,fetch:fetcher});muted.unlock();await new Promise(r=>setTimeout(r,5));assert.equal(muted.play('refill'),false);a.dispose();muted.dispose();
});

test('HUD v24 stylesheet: three thin rings of 56-64 px in one column at the right edge, above the ship lane (bottom 16.4%), thin heat arc, captions that fade; only with data-alien-hud=v24',async()=>{
 const css=await read('../workout/island/minigames/alien-v24.css'),scope='.alien-controls.alien-controls.alien-controls[data-alien-fire=v23][data-alien-hud=v24]';
 const rule=sel=>{const i=css.indexOf(scope+' '+sel+'{');assert.ok(i>=0,sel);return css.slice(i,css.indexOf('}',i));};
 const size=sel=>Number(rule(sel).match(/width:(\d+)px/)[1]);for(const [sel,min,max] of [['#shoot',60,64],['#vulcan',56,64],['#pass',56,60]]){const s=size(sel);assert.ok(s>=min&&s<=max,`${sel} ${s}px`);}
 for(const sel of ['#shoot','#vulcan','#pass']){const r=rule(sel);assert.match(r,/right:/);assert.match(r,/bottom:calc\(16\.4% \+ \d+px\)/,'above the lane');}
 const bottoms=['#shoot','#vulcan','#pass'].map(sel=>Number(rule(sel).match(/bottom:calc\(16\.4% \+ (\d+)px\)/)[1]));assert.ok(bottoms[0]<bottoms[1]&&bottoms[1]<bottoms[2],'one column, the cannon lowest (under the thumb)');
 assert.ok(bottoms[1]-bottoms[0]>=size('#shoot')&&bottoms[2]-bottoms[1]>=size('#vulcan'),'no overlap in the column');
 assert.match(css,/mask:radial-gradient\(farthest-side,transparent calc\(100% - 3\.5px\)/,'a 3 px arc, not a filled disc');assert.match(css,/data-alien-captions=off\] \.alien-fire-caption\{opacity:0\}/);
 assert.match(css,/#vulcan\[data-level=cold\]/);
 const session=await read('../workout/island/minigames/alien-session.mjs');assert.match(session,/alienHudV24Enabled\(\)/);assert.match(session,/controls\.dataset\.alienHud='v24'/);assert.match(session,/delete controls\.dataset\.alienHud/);
});

// ---------------------------------------------------------------- Ships: rules
test('ships v24 flags: aim, enemy fire and submarine are on by default and each one alone returns to v23',()=>{
 assert.equal(navalAimV24(''),true);for(const v of ['v23','v20','v19','v1'])assert.equal(navalAimV24('?navalAim='+v),false,v);
 assert.equal(navalEnemyFireV24(''),true);assert.equal(navalEnemyFireV24('?navalEnemyFire=v23'),false);assert.equal(navalSubV24(''),true);assert.equal(navalSubV24('?navalSub=v23'),false);
 assert.equal(navalEnemyFireV24('?navalAim=v23'),true,'independent');assert.equal(navalSubV24('?navalEnemyFire=v23'),true);
 const m=naval(11,1),old=naval(11,1,'?navalAim=v23&navalEnemyFire=v23&navalSub=v23');assert.equal(m.aimV24,true);assert.equal(m.enemyFireV24,true);assert.equal(m.subV24,true);
 assert.equal(old.aimV24,false);assert.equal(old.enemyFireV24,false);assert.equal(old.subV24,false);assert.equal(naval(3,1,'?navalLock=0').aimV24,false,'v24 aim is built on the lock');
});

test('enemy-fire rules: 1.45x at stage 1 rising to 2.4x from stage 20, salvos laid along the course (across it when still), the aim leads a sailing ship',()=>{
 const c=NAVAL_V24_DEFAULTS.enemyFire;assert.equal(navalFireRate(1,c),c.rateFirst);assert.equal(navalFireRate(20,c),c.rateLast);assert.equal(navalFireRate(30,c),c.rateLast);
 assert.ok(c.rateFirst>=1.3&&c.rateFirst<=1.6,'30-60% more at the start');assert.ok(c.rateLast>=2&&c.rateLast<=2.5,'2-2.5x late');
 for(let s=1;s<30;s++)assert.ok(navalFireRate(s+1,c)>=navalFireRate(s,c));assert.ok(Math.abs(navalFireSeconds(10.5,1,c)-10.5/1.45)<1e-9);
 const still=navalEnemyAim({x:100,z:0,speed:0,heading:0},{seconds:3,error:0,salvo:3,cfg:c}),moving=navalEnemyAim({x:100,z:0,speed:40,heading:0},{seconds:3,error:0,salvo:3,cfg:c});
 assert.equal(still.length,3);assert.ok(still.every(q=>Math.abs(q.x-100)<1e-9),'still: across the hull');assert.ok(Math.abs(still[2].z-still[0].z-2*c.salvoStep)<1e-9);
 assert.ok(moving[1].x>100+30,'leads a sailing ship');assert.ok(moving.every(q=>Math.abs(q.z)<1e-9),'along the course');
 assert.ok(c.damageMult<1,'a hit costs less hull than in v23');assert.ok(c.telegraphMult>=1,'the warning time is not shortened');
});

test('submarine rules: v24 dives after a moment and surfaces briefly every cycle; while diving only the torpedo reaches it; 3-5 torpedoes',()=>{
 const sub={subMode:'v24',kind:3,active:true,hp:1,depth:0},c=NAVAL_V24_DEFAULTS.sub;
 assert.equal(navalSubDepth(sub,0,nb),0);assert.equal(navalSubDepth(sub,c.firstDive+.1,nb),1);assert.equal(navalSubDepth(sub,c.firstDive+c.cycle-c.surface+.1,nb),0,'surfaces');
 let diving=0;for(let t=0;t<120;t+=.1)diving+=navalSubDepth(sub,t,nb);assert.ok(diving/1200>.65,'mostly under water');
 assert.equal(navalSubDepth({kind:3},5,nb),5%nb.combat.submarineCycle>nb.combat.submarineSurface?1:0,'v23 hulls keep their cycle');
 const dive={...sub,depth:1};for(const k of [0,1,3,4])assert.equal(navalTargetable(dive,k,nb),false,'ammo '+k);assert.equal(navalTargetable(dive,2,nb),true,'torpedo');assert.equal(navalSubShield(dive,2,nb),false);
 assert.equal(navalTargetable({...dive,depth:0},0,nb),true,'surfaced: shells too');
 const v23={kind:3,active:true,hp:1,depth:1};assert.equal(navalTargetable(v23,1,nb),true,'v23: the guided missile reaches a diver');assert.equal(navalTargetable(v23,2,nb),false);
 assert.equal(navalTorpedoStock(10,c),5);assert.equal(navalTorpedoStock(1,c),3);assert.equal(navalTorpedoStock(4,c),4);
});

test('smart lock order and hit chance: a hull about to fire first, then the nearest, reachable hulls first; next wraps; colours by chance',()=>{
 const player={x:0,z:0},e=(index,x,z,extra={})=>({index,x,z,active:true,hp:1,...extra});
 const fleet=[e(0,300,0),e(1,120,0),e(2,200,40,{attack:{fireTime:11}}),e(3,90,0,{hp:0})];
 assert.deepEqual(navalLockOrder(fleet,player,{time:10}),[2,1,0],'the one about to fire, then the nearest; sunk skipped');
 assert.deepEqual(navalLockOrder(fleet,player,{time:10,canHit:x=>x.index!==2}),[1,0,2],'reachable first');
 assert.equal(navalLockNext([2,1,0],2,1),1);assert.equal(navalLockNext([2,1,0],0,1),2);assert.equal(navalLockNext([2,1,0],2,-1),0);assert.equal(navalLockNext([2,1,0],7,1),2);
 assert.equal(navalHitChance(null,{status:'ready'}),1);assert.equal(navalHitChance(null,{status:'turning'}),.6);assert.equal(navalHitChance(null,{status:'far'}),0);
 assert.equal(navalChanceColor(1),NAVAL_V24_COLORS.hit);assert.equal(navalChanceColor(.6),NAVAL_V24_COLORS.maybe);assert.equal(navalChanceColor(.2),NAVAL_V24_COLORS.miss);
});

// ---------------------------------------------------------------- Ships: model
test('aim v24 in the model: a tap locks, a tap on the locked hull fires; the Lock button picks the order and the next; a swipe goes back',()=>{
 const m=naval(10,2);run(m,60);const live=m.enemies.filter(e=>e.active&&e.hp>0&&!e.structure);
 m.update(FRAME,{lockTap:live[1].index});assert.equal(m.homing.index,live[1].index,'tap = lock');assert.equal(m.locksMade,1);
 run(m,40);const f=m.fired;m.update(FRAME,{lockTap:live[1].index});run(m,3);assert.equal(m.fired,f+1,'a tap on the locked hull fires');assert.equal(m.homing.index,live[1].index,'and keeps the lock');
 const order=navalLockOrder(m.enemies,m.playerShip,{time:m.time,canHit:e=>navalTargetable(e,m.ammoIndex,nb)});
 const g=naval(10,2);run(g,60);g.update(FRAME,{lockSmart:true});assert.equal(g.homing.index,navalLockOrder(g.enemies,g.playerShip,{time:g.time,canHit:e=>navalTargetable(e,0,nb)})[0],'first tap: the top of the order');
 const first=g.homing.index;g.update(FRAME,{lockSmart:true});assert.notEqual(g.homing.index,first,'second tap: the next');const second=g.homing.index;g.update(FRAME,{lockCycle:-1});assert.equal(g.homing.index,first,'swipe back');
 assert.ok(order.length>=2);assert.equal(naval(10,2,'?navalAim=v23').aimV24,false);const old=naval(10,2,'?navalAim=v23');run(old,60);old.update(FRAME,{lockTap:0,lockSmart:true});assert.equal(old.homing,null,'?navalAim=v23 ignores the v24 inputs');
 void second;
});

test('aim v24: the lock moves on by itself after a sinking; locked shells never count as the weak centre (the gold star is a hand-aimed shot); a ready lock fires at once',()=>{
 const m=naval(10,2);run(m,30);m.update(FRAME,{lockSmart:true});const first=m.homing.index;let n=0,crit=0,shells=0,last=null;
 while(n<60*60&&!m.result){m.update(FRAME,n%30===0?{quickShot:true}:{});n++;const ls=m.lastShot;if(ls&&ls.shotId!==last){last=ls.shotId;shells++;if(ls.actual.critical)crit++;}if(m.enemies[first].hp<=0&&m.homing&&m.homing.index!==first)break;}
 assert.ok(m.enemies[first].hp<=0,'the first hull sank');assert.ok(m.homing&&m.homing.index!==first,'the lock moved on to another hull');assert.equal(m.unlocked.reason,'sunk');
 assert.ok(shells>=2);assert.equal(crit,0,'no locked shell is a weak-centre hit');
 const old=naval(10,2,'?navalAim=v23');run(old,30);old.update(FRAME,{lockTarget:old.enemies.find(e=>e.active&&e.hp>0).index});let k=0;while(k<60*60&&!old.result&&old.homing){old.update(FRAME,k%30===0?{quickShot:true}:{});k++;}
 run(old,60);assert.equal(old.homing,null,'v23: the lock ends with the sinking');
});

test('Vulcan v24: a child\'s crosshair 15 degrees off the helicopter locks on and brings it down; v23 with the same thumb misses',()=>{
 const balance=structuredClone(nb);balance.levels[2].air={...balance.levels[2].air,from:1,every:99,count:1,kinds:['heli']};
 const go=search=>{const m=naval(3,4,search,balance);let n=0;while(n<60*12&&!m.result){const a=m.air.find(x=>x.state!=='down');const input={skyMode:'manual'};if(a){const t=navalSkyAngles(m.playerShip,a,balance);Object.assign(input,{skyHeld:true,skyYaw:t.yaw+15*DEG,skyPitch:Math.max(0,t.pitch+3*DEG)});}m.update(FRAME,input);n++;}return m;};
 const v24=go(''),v23=go('?navalAim=v23');
 assert.ok(v24.vulcan.hits>0&&v24.vulcan.kills>=1,`v24 ${JSON.stringify({shots:v24.vulcan.shots,hits:v24.vulcan.hits,kills:v24.vulcan.kills})}`);assert.equal(v23.vulcan.hits,0,'v23: 15 degrees off is outside the 6 degree cone');
 assert.ok(v24.vulcan.shots>0&&v23.vulcan.shots>0,'both fire only while held');
});

test('enemy fire v24: more shots per minute (1.3-1.6x at stage 1, 2x and more at stage 10 with salvos), each shown before it is fired, lighter hits; v23 with the flag',()=>{
 const perMinute=(stage,search)=>{const m=naval(stage,7,search);let shown=new Set(),unshown=0,seen=0;const shots=new Set();
  for(let i=0;i<60*60&&!m.result;i++){for(const e of m.enemies)if(e.attack)shown.add(`${e.index}:${e.attack.fireTime}`);const before=m.enemyFired;m.update(FRAME,{moveX:Math.sin(i/90)*.4});if(m.enemyFired>before)seen++;for(const s of m.enemyShots){if(!shots.has(s)){shots.add(s);}}}
  return {n:m.enemyFired,per:60*m.enemyFired/m.time,salvos:m.snapshot().v24.enemySalvos,dmg:[...shots].map(s=>s.damage),time:m.time};};
 const s1=[perMinute(1,'?navalEnemyFire=v23'),perMinute(1,'')],s10=[perMinute(10,'?navalEnemyFire=v23'),perMinute(10,'')];
 const r1=s1[1].per/s1[0].per,r10=s10[1].per/s10[0].per;assert.ok(r1>=1.25&&r1<=2.2,`stage 1 ${s1[0].per.toFixed(1)} -> ${s1[1].per.toFixed(1)} per minute (${r1.toFixed(2)}x)`);
 assert.ok(r10>=2,`stage 10 ${s10[0].per.toFixed(1)} -> ${s10[1].per.toFixed(1)} per minute (${r10.toFixed(2)}x)`);assert.ok(s10[1].salvos>=1,'salvos from stage 6');
 const v23dmg=Math.max(...s10[0].dmg),v24dmg=Math.max(...s10[1].dmg);assert.ok(v24dmg<v23dmg&&v24dmg>=v23dmg*.6,`a hit costs less (${v23dmg} -> ${v24dmg})`);
 // Every v24 shot lands where its decal was shown, and sailing off evades it.
 const m=naval(1,0);let target=null;while(!m.result&&m.time<20){const e=m.enemies[0];if(e.attack&&!target)target={x:e.attack.x,z:e.attack.z,warn:e.attack.fireTime-m.time};m.update(1/50,{});if(m.enemyShots.length)break;}
 assert.ok(target&&target.warn>=1.3,'shown at least 1.3 s before the shot');assert.deepEqual({x:m.enemyShots[0].targetX,z:m.enemyShots[0].targetZ},{x:target.x,z:target.z});
 const hp=m.lives;for(let i=0;i<150&&!m.result;i++)m.update(1/50,{moveX:1});assert.equal(m.lives,hp,'sailing off the decal evades');
});

test('submarine v24 in the model: shells pass over a diver ("under water"), a torpedo from its button hits it under water; it fires torpedoes only while diving; v23 with the flag',()=>{
 const m=naval(11,3),sub=m.enemies.find(e=>e.subMode==='v24');assert.ok(sub,'a v24 submarine');assert.ok(m.torpedoes>=3&&m.torpedoes<=5,`torpedoes ${m.torpedoes}`);
 run(m,60*4);assert.equal(sub.depth,1,'diving after the first moment');
 // A shell solved straight onto the diver: it passes over.
 m.update(FRAME,{lockTarget:sub.index});run(m,30);const hp=sub.hp,f=m.fired;let n=0;
 m.update(FRAME,{fireRelease:true,releaseTarget:{target:sub.index,x:sub.x,z:sub.z},releaseCurrent:false});while(n<240&&m.ball.active){m.update(FRAME,{});n++;}
 if(m.fired>f){assert.equal(sub.hp,hp,'the shell did no harm under water');}
 // The torpedo button.
 const tf=m.snapshot().v24.torpedoesFired,t0=m.torpedoes;let hit=false;for(let k=0;k<6&&!hit&&m.torpedoes>0;k++){if(sub.depth>0){m.update(FRAME,{torpedoShot:true});n=0;while(n<60*5&&!hit){m.update(FRAME,{});n++;if(sub.hp<hp)hit=true;}}else run(m,30);}
 assert.ok(m.snapshot().v24.torpedoesFired>tf&&m.torpedoes<t0,'torpedoes left the tube');assert.ok(hit,'a torpedo hit the diving submarine');
 // Fire: torpedoes only, only while diving.
 const w=naval(11,5);const kinds=new Set();let surfacedShots=0;for(let i=0;i<60*70&&!w.result;i++){const before=w.enemyShots.length;w.update(FRAME,{moveX:Math.sin(i/70)*.5});for(const s of w.enemyShots.slice(before))if(s.sub){kinds.add(s.kind);const e=w.enemies.find(x=>x.subMode==='v24');if(e&&!(e.depth>0))surfacedShots++;}}
 assert.deepEqual([...kinds],[2],'torpedoes only');assert.equal(surfacedShots,0,'never from the surface');
 const old=naval(11,3,'?navalSub=v23');assert.equal(old.enemies.some(e=>e.subMode),false);assert.equal(old.subV24,false);
});

// ---------------------------------------------------------------- Ships: drawing and input
test('ships v24 HUD: red decals for every threat, sonar rings over divers, the hit ring coloured by chance; nothing when the switches are off',()=>{
 const project=(x,z,y=0)=>({x:422+z*1.2,y:300-(x-60)*.5-y,depth:1});
 const m={time:2,enemyFireV24:true,subV24:true,aimV24:true,result:null,playerShip:{x:60,z:0,heading:0},enemies:[{index:0,active:true,hp:1,x:200,z:10,attack:{x:62,z:2,fireTime:3,points:[{x:62,z:-11},{x:62,z:2},{x:62,z:15}]}},{index:1,active:true,hp:1,x:240,z:-30,subMode:'v24',depth:1,heading:Math.PI}],air:[],enemyShots:[{targetX:70,targetZ:5,duration:1.2,age:.3,kind:2,fromX:240,fromZ:-30,x:150,z:-10}],aimHint:{index:0,from:{x:200,z:10},to:{x:210,z:20},chance:1,status:'ready'},homing:{index:0},blast:null,lastFeedback:null};
 assert.equal(navalV24Threats(m).length,4,'three salvo points and one torpedo on its way');
 const p=recorder(),out=drawNavalV24(p,m,nb,project,844,390);assert.equal(out.decals,4);assert.equal(out.torpedoLines,1);assert.equal(out.sonar,1);assert.equal(out.aim.color,NAVAL_V24_COLORS.hit);
 const miss=drawNavalV24(recorder(),{...m,aimHint:{...m.aimHint,chance:.2,status:'miss'},homing:null},nb,project,844,390);assert.equal(miss.aim.color,NAVAL_V24_COLORS.miss);assert.equal(miss.aim.word,NAVAL_V24_WORDS.miss);
 assert.equal(drawNavalV24(recorder(),{...m,enemyFireV24:false,subV24:false,aimV24:false},nb,project,844,390),null);
});

/** The real input layer on a fake DOM (as the v23 lock tests): elements with listeners, window listeners by phase. */
function fakeInput(m,search=''){
 const made=[],away={left:-1e4,right:-1e4,top:-1e4,bottom:-1e4,width:0,height:0};
 const el=(name,rect)=>{const e={name,dataset:{},style:{setProperty(){},removeProperty(){}},listeners:new Map(),innerHTML:'',hidden:false,setAttribute(){},getAttribute:()=>null,remove(){},querySelector:()=>null,addEventListener(t,fn){e.listeners.set(t,[...(e.listeners.get(t)||[]),fn]);},closest:s=>(name==='fire'||e.tag==='button')&&/button/.test(s)?e:null,getBoundingClientRect:()=>rect||{left:0,top:0,right:844,bottom:390,width:844,height:390},setPointerCapture(){}};return e;};
 const fire=el('fire',{left:734,right:822,top:280,bottom:368,width:88,height:88}),canvas=el('canvas'),controls={addEventListener(){},style:{setProperty(){},removeProperty(){}},dataset:{},classList:{toggle(){},remove(){},add(){}},querySelector:s=>s==='#shoot'?fire:null,prepend(){},append(){}};
 const win={bubble:new Map(),capture:new Map()};globalThis.window={addEventListener(t,fn,o){const map=o?.capture?win.capture:win.bubble;map.set(t,[...(map.get(t)||[]),fn]);}};globalThis.document={addEventListener(){},createElement:tag=>{const e=el('made'+made.length,away);e.tag=tag;made.push(e);return e;}};globalThis.location={search};
 const input=createNavalInput({controls,canvas,balance:nb,t:k=>k},()=>m,()=>null);let ms=0;const pad=made[0],lockBtn=made.find(e=>e.className==='naval-lock-btn'),torpBtn=made.find(e=>e.className==='naval-torpedo-btn');
 const send=(type,id,x,y,target)=>{const e={pointerId:id,clientX:x,clientY:y,timeStamp:ms,button:0,target,preventDefault(){}};for(const fn of win.capture.get(type)||[])fn(e);for(const fn of target?.listeners?.get(type)||[])fn(e);for(const fn of win.bubble.get(type)||[])fn(e);};
 return {input,controls,fire,canvas,pad,lockBtn,torpBtn,down:(id,x,y,t)=>send('pointerdown',id,x,y,t),move:(id,x,y,t=null)=>send('pointermove',id,x,y,t),up:(id,x,y,t=null)=>send('pointerup',id,x,y,t),
  step(n=1,raw={}){const outs=[];for(let i=0;i<n;i++){ms+=1000/60;const out=input.sample(raw);outs.push(out);m.update(FRAME,out);}return outs;},dispose(){input.dispose();delete globalThis.window;delete globalThis.document;delete globalThis.location;}};
}
test('input layer v24: a short tap on a hull locks it on the canvas and on the aim pad (no quick shot); the Lock button taps and swipes; the Torpedo button while a submarine is out; ?navalAim=v23 keeps v23',()=>{
 const m=naval(10,2);run(m,30);const f=fakeInput(m);
 try{
  const e=m.enemies.find(x=>x.active&&x.hp>0),q=m.screenPoint(e.x,e.z,1.5),fired=m.fired;
  f.down(1,q.x,q.y,f.pad);f.step(4);f.up(1,q.x,q.y);const outs=f.step(3);assert.ok(outs.some(o=>o.lockTap===e.index),'tap = lock');assert.equal(m.homing?.index,e.index);assert.ok(!outs.some(o=>o.quickShot),'no quick shot');assert.equal(m.fired,fired);
  assert.ok(f.lockBtn&&f.lockBtn.hidden===false,'the Lock button is shown');f.lockBtn.listeners.get('pointerdown')[0]({pointerId:5,clientX:700,clientY:200,button:0,preventDefault(){}});f.lockBtn.listeners.get('pointerup')[0]({pointerId:5,clientX:702,clientY:200});
  let o=f.step(1)[0];assert.equal(o.lockSmart,true,'tap');f.lockBtn.listeners.get('pointerdown')[0]({pointerId:6,clientX:700,clientY:200,button:0,preventDefault(){}});f.lockBtn.listeners.get('pointermove')[0]({pointerId:6,clientX:660,clientY:200});f.lockBtn.listeners.get('pointerup')[0]({pointerId:6,clientX:660,clientY:200});
  o=f.step(1)[0];assert.equal(o.lockCycle,-1,'swipe');assert.equal(f.lockBtn.dataset.locked,'true');assert.ok(f.torpBtn.hidden,'no submarine: no Torpedo button');
  f.dispose();
  const s=naval(11,3);run(s,30);const g=fakeInput(s);g.step(2);assert.equal(g.torpBtn.hidden,false,'a submarine is out: the Torpedo button');g.torpBtn.listeners.get('pointerdown')[0]({pointerId:9,button:0,preventDefault(){}});const ot=g.step(1)[0];assert.equal(ot.torpedoShot,true);g.dispose();
  const v=naval(10,2,'?navalAim=v23');run(v,30);const h=fakeInput(v,'?navalAim=v23');const e2=v.enemies.find(x=>x.active&&x.hp>0),q2=v.screenPoint(e2.x,e2.z,1.5);
  assert.equal(h.lockBtn.hidden,true,'no Lock button with ?navalAim=v23');h.down(2,q2.x,q2.y,h.pad);h.step(4);h.up(2,q2.x,q2.y);const o2=h.step(3);assert.ok(o2.some(x=>x.quickShot),'v23: the quick shot');assert.equal(v.homing,null);h.dispose();
 }finally{delete globalThis.window;delete globalThis.document;delete globalThis.location;}
});

// ---------------------------------------------------------------- Ships: the child with human noise
test('the child bot (human noise: reaction, missed warnings, taps at its own rhythm): with the v24 Lock button it hits 80-100% at stages 1, 5 and 10 and wins stage 1; enemy fire per minute rises',()=>{
 const rows=[];for(const stage of [1,5,10])for(const seed of [1,2,3]){const v24=playStage((s,sd)=>naval(s,sd),stage,seed,{balance:nb,style:'lockButton',notice:.6}),v23=playStage((s,sd)=>naval(s,sd,'?navalAim=v23&navalEnemyFire=v23&navalSub=v23'),stage,seed,{balance:nb,style:'longPress',notice:.6});rows.push({stage,v24,v23});}
 const hit=r=>r.fired?r.hits/r.fired:1;
 for(const stage of [1,5,10]){const rs=rows.filter(r=>r.stage===stage),f=rs.reduce((n,r)=>n+r.v24.fired,0),h=rs.reduce((n,r)=>n+r.v24.hits,0);assert.ok(h/f>=.8,`stage ${stage}: v24 hit ${(100*h/f).toFixed(0)}%`);}
 assert.ok(rows.filter(r=>r.stage===1).every(r=>r.v24.outcome==='win'),'stage 1 is won');
 const per=(rs,k)=>rs.reduce((n,r)=>n+r[k].enemyFired,0)/rs.reduce((n,r)=>n+r[k].seconds,0)*60,s10=rows.filter(r=>r.stage===10);assert.ok(per(s10,'v24')>=1.5*per(s10,'v23'),`stage 10 enemy shots per minute ${per(s10,'v23').toFixed(1)} -> ${per(s10,'v24').toFixed(1)}`);
 void hit;
});

// ---------------------------------------------------------------- Data and wiring
test('words, styles and the offline list: help texts describe the magazine, the tap lock, the red decal and the torpedo; the new modules and Codex copies are cached offline with their licences',async()=>{
 assert.match(strings['minigame.alienDefense.help.1'],/מחסנית וולקן/);assert.match(strings['minigame.navalDuel.help.1'],/כפתור הנעילה/);assert.match(strings['minigame.navalDuel.help.3'],/סימון אדום/);assert.match(strings['minigame.navalDuel.help.3'],/רק טורפדו/);
 const manifest=JSON.parse(await read('../workout/island/offline-manifest.json'));
 for(const f of ['minigames/alien-v24.mjs','minigames/alien-v24-draw.mjs','minigames/alien-v24-audio.mjs','minigames/alien-v24.css','minigames/naval-v24.mjs','minigames/naval-v24-hud.mjs','minigames/naval-v24-audio.mjs','minigames/naval-v24.css'])assert.ok(manifest.shell.includes(f),f);
 for(const f of ['assets/alien-v24/vulcan-magazine.png','assets/alien-v24/pickup-burst.png','assets/alien-v24/refill-pickup.ogg','assets/alien-v24/overheat.ogg'])assert.ok(manifest.games.alien.includes(f),f);
 for(const f of ['assets/game-naval/fx/water-target.png','assets/game-naval/fx/water_explosion.png','assets/game-naval/audio/enemy-cannon.ogg','assets/game-naval/audio/incoming-shell.ogg'])assert.ok(manifest.games.naval.includes(f),f);
 assert.match(await read('../workout/island/assets/alien-v24/LICENSES.md'),/CC0/);assert.match(await read('../workout/island/assets/game-naval/LICENSES.md'),/refill-enemyfire-v1/);
 const release=JSON.parse(await read('../workout/island/release.json'));for(const f of ['alien-v24.mjs','alien-v24-draw.mjs','alien-v24-audio.mjs','naval-v24.mjs','naval-v24-hud.mjs','naval-v24-audio.mjs']){const src=await read('../workout/island/minigames/'+f);for(const m of src.matchAll(/\?v=([\w-]+)/g))assert.equal(m[1],release.version,`${f}: new code uses the current tag`);}
 const css=await read('../workout/island/minigames/naval-v24.css');for(const sel of ['.naval-lock-btn{','.naval-torpedo-btn{'])assert.ok(css.includes(sel),sel);assert.match(css,/width:60px;height:60px/);
});

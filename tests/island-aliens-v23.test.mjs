// Aliens v23 (13/11/2026), Roy after testing v22: "the fire changes, for some reason, while you shoot. Maybe Vulcan fire that heats up,
// and the regular fire on another button". Two weapons, two buttons, each doing one predictable thing: the fire button is the steady
// cannon only (about 5.6/s from the first shot, never a burst, never a pause), a second button is the Vulcan only (10/s, a heat gauge
// that fills green, yellow, red; full = locked 2 s with a red blink, then open again). ?alienFire=v15 restores v22 exactly.
// Pure model, UI (fake DOM), drawing and data tests; the real phone path is workout/island/tests/aliens-v23-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienFireV23Enabled,V23_DEFAULTS,v23Config,vulcanGate,vulcanShot,vulcanLevel,vulcanBlink,VULCAN_COLORS} from '../workout/island/minigames/alien-v23.mjs';
import {createAlienVulcan} from '../workout/island/minigames/alien-v23-ui.mjs';
import {drawV23Heat} from '../workout/island/minigames/alien-v23-draw.mjs';
import {drawV14Heat} from '../workout/island/minigames/alien-v14-draw.mjs';
import {alienFrameInput} from '../workout/island/minigames/alien-session.mjs';
import {alienFlightHudStatus} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {v15Config} from '../workout/island/minigames/alien-v15.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const config=JSON.parse(await read('../workout/island/data/config.json')).minigames,balance=config.alienDefense,cfg=v23Config(balance),c15=v15Config(balance);
const strings=JSON.parse(await read('../workout/island/data/strings.he.json'));
const FRAME=1/60,REGULAR_RATE=1/c15.normalInterval;
const make=(o={})=>{const {fire='v23',...rest}=o;globalThis.__alienFire=fire==='v15'?'v15':undefined;try{return createAlienModel({config,balance,level:1,random:seededRandom(3),completion:'waves',roundChoices:false,...rest});}finally{globalThis.__alienFire=undefined;}};
const run=(m,s,input={})=>{for(let i=0;i<Math.round(s/FRAME);i++)m.update(FRAME,input);};
/** Per-frame trace of the fire counters (the model's own clock). */
function trace(m,seconds,inputAt){const out=[];let t=0;for(let i=0;i<Math.round(seconds/FRAME);i++){m.update(FRAME,inputAt(t));t+=FRAME;const s=m.snapshot();out.push({t:m.time,heat:m.vulcanHeat,locked:m.vulcanLocked,rf:s.regularFired??s.steadyShots,vf:s.vulcanFired??0,pulls:s.steadyShots+s.burstShots,oh:s.overheats,mode:m.fireMode,spin:m.firing});}return out;}
const perSecond=(rows,key)=>{const counts=[];for(let sec=1;sec*1-1e-9<=rows.at(-1).t+1e-9;sec++){const end=rows.findLast(r=>r.t<=sec+1e-9),start=rows.findLast(r=>r.t<=sec-1+1e-9);if(!end)break;counts.push(end[key]-(start&&sec>1?start[key]:0));}return counts;};

test('v23 flag: on by default, ?alienFire=v15 and the global switch restore v22; config carries the numbers',()=>{
 assert.equal(alienFireV23Enabled('',undefined),true);assert.equal(alienFireV23Enabled('?alienFire=v15',undefined),false);assert.equal(alienFireV23Enabled('?alienFire=v23',undefined),true);
 assert.equal(alienFireV23Enabled('','v15'),false);assert.equal(alienFireV23Enabled('',false),false);
 assert.ok(balance.v23,'config.json alienDefense.v23');assert.deepEqual(Object.keys(v23Config({})).sort(),Object.keys(V23_DEFAULTS).sort());
 assert.equal(cfg.lockSeconds,2,'Roy: a full gauge locks the Vulcan for 2 seconds');assert.ok(1/cfg.vulcanInterval>=9&&1/cfg.vulcanInterval<=12,'the Vulcan is fast');
 assert.ok(cfg.yellowAt<cfg.redAt&&cfg.redAt<1);assert.equal(cfg.vulcanKey,'KeyZ');
 assert.equal(make().v23,true);assert.equal(make({fire:'v15'}).v23,false);
 globalThis.__alienV15=false;try{assert.equal(createAlienModel({config,balance,level:1,random:seededRandom(3)}).v23,false,'v23 is built on v15: ?alienV15=0 keeps v14');}finally{globalThis.__alienV15=undefined;}
});

test('regular button alone: a constant 5-6 shots per second from the first second, never a burst, never a pause, no heat',()=>{
 const m=make(),rows=trace(m,8,()=>({firing:true}));const counts=perSecond(rows,'rf');
 assert.equal(counts.length,8);assert.ok(counts.every(c=>c>=5&&c<=6),`per second ${counts}`);
 const total=rows.at(-1).rf;assert.ok(Math.abs(total/8-REGULAR_RATE)<.35,`${total/8}/s`);
 let gap=0,lastAt=0;for(let i=1;i<rows.length;i++)if(rows[i].rf>rows[i-1].rf){gap=Math.max(gap,rows[i].t-lastAt);lastAt=rows[i].t;}
 assert.ok(gap<=c15.normalInterval+FRAME+1e-9,`largest gap between shots ${gap} s`);
 const s=m.snapshot();assert.equal(s.vulcanFired,0);assert.equal(s.burstShots,0);assert.equal(s.overheats,0);assert.equal(m.vulcanHeat,0);assert.equal(m.fireMode,'normal');
 assert.ok(rows.every(r=>!r.spin),'the barrels never spin for the steady cannon');
 // v22 (one button) for contrast: the same hold went 10/s, then silence, then 5.6/s. That is the "change while you shoot".
 const old=perSecond(trace(make({fire:'v15'}),8,()=>({firing:true})),'pulls');assert.ok(Math.max(...old)-Math.min(...old)>=5,`v22 per second ${old}`);
});

test('Vulcan alone: 10/s, the gauge goes green, yellow, red, full after heatShots ticks; locked 2 s (drains, blinks), then open again',()=>{
 const m=make(),rows=trace(m,7,()=>({vulcan:true}));
 const firstLock=rows.findIndex(r=>r.locked);assert.ok(firstLock>0);const lockAt=rows[firstLock].t;
 assert.equal(rows[firstLock].vf,cfg.heatShots,'the gauge counts Vulcan bullets');assert.ok(Math.abs(lockAt-cfg.heatShots*cfg.vulcanInterval)<.12,`locks after ${lockAt} s`);
 const open=rows.slice(0,firstLock),firstShot=rows.find(r=>r.vf>0);assert.ok(Math.abs((rows[firstLock].vf-1)/(lockAt-firstShot.t)-1/cfg.vulcanInterval)<.3,'about 10 bullets per second');
 const levels=[...new Set(open.filter(r=>r.vf>0).map(r=>vulcanLevel(r.heat,false,cfg)))];assert.deepEqual(levels,['green','yellow','red']);
 const lockRows=rows.slice(firstLock,rows.findIndex((r,i)=>i>firstLock&&!r.locked));const lockSeconds=lockRows.at(-1).t-lockRows[0].t+FRAME;
 assert.ok(Math.abs(lockSeconds-cfg.lockSeconds)<=2*FRAME,`locked ${lockSeconds} s`);assert.ok(lockRows.every(r=>r.vf===lockRows[0].vf),'no Vulcan fire while locked');
 for(let i=1;i<lockRows.length;i++)assert.ok(lockRows[i].heat<=lockRows[i-1].heat+1e-12,'the gauge drains during the lock');assert.ok(lockRows.at(-1).heat<.02);
 const blinks=new Set(lockRows.map(r=>vulcanBlink(r.t,true)));assert.deepEqual([...blinks].sort(),[false,true],'red blink while locked');assert.equal(vulcanBlink(1.3,false),false);
 const after=rows.at(-1);assert.ok(after.vf>cfg.heatShots,'it opens again and fires');assert.ok(after.oh>=2);assert.equal(after.rf,0,'the regular cannon never fires from the Vulcan button');
 assert.ok(rows.some(r=>r.spin),'the barrels spin for the Vulcan');
});

test('quick taps cannot dodge the heat (40/60, 64/96, 112/192 ms), and the Vulcan never beats 10/s',()=>{
 for(const [on,off] of [[40,60],[64,96],[112,192]]){const m=make(),rows=trace(m,8,t=>({vulcan:(t*1000)%(on+off)<on}));
  const lock=rows.find(r=>r.locked);assert.ok(lock&&lock.t<4.5,`${on}/${off} ms: first lock ${lock?.t}`);
  assert.ok(rows.at(-1).vf/8<=1/cfg.vulcanInterval+.01,`${on}/${off} ms: ${rows.at(-1).vf/8}/s`);assert.ok(rows.at(-1).oh>=1);}
 // The gate itself: a short gap keeps the heat, a real rest cools it, each bullet heats by 1/heatShots, and a full gauge locks.
 assert.equal(vulcanGate({heat:.5},false,.3,cfg).heat,.5);let g={heat:.5};for(let i=0;i<60*(cfg.restSeconds+.5);i++)g=vulcanGate(g,false,FRAME,cfg);assert.ok(g.heat<.5&&g.heat>0);
 let h={heat:0};for(let i=0;i<cfg.heatShots-1;i++)h=vulcanShot(h,cfg);assert.equal(h.lock||0,0);h=vulcanShot(h,cfg);assert.equal(h.lock,cfg.lockSeconds);assert.equal(h.overheat,true);
 assert.equal(vulcanGate(h,true,FRAME,cfg).firing,false,'pressing during the lock does nothing');
 // Taps on the regular button keep its interval too (at most 5.6/s).
 const r=make(),rr=trace(r,6,t=>({firing:(t*1000)%100<40}));assert.ok(rr.at(-1).rf/6<=REGULAR_RATE+.2,`regular taps ${rr.at(-1).rf/6}/s`);
});

test('both buttons: the stream never beats the Vulcan alone, the cannon keeps its own rate inside it and fires on through the lock',()=>{
 const m=make(),rows=trace(m,10,()=>({firing:true,vulcan:true}));
 const counts=perSecond(rows,'rf');assert.ok(counts.every(c=>c>=5&&c<=6),`cannon per second with both held: ${counts}`);
 const alone=trace(make(),10,()=>({firing:true}));assert.ok(Math.abs(rows.at(-1).rf-alone.at(-1).rf)<=1,`cannon shots in 10 s: both ${rows.at(-1).rf}, alone ${alone.at(-1).rf}`);
 let openPulls=0,openTime=0,lockShots=0,lockTime=0;for(let i=1;i<rows.length;i++){const d=rows[i].pulls-rows[i-1].pulls;if(rows[i].locked){lockShots+=rows[i].rf-rows[i-1].rf;lockTime+=FRAME;}else{openPulls+=d;openTime+=FRAME;}}
 assert.ok(openPulls/openTime<=1/cfg.vulcanInterval+.3,`stream ${openPulls/openTime}/s while the Vulcan runs`);
 assert.ok(lockTime>3&&Math.abs(lockShots/lockTime-REGULAR_RATE)<.6,`cannon during the Vulcan lock: ${lockShots/lockTime}/s over ${lockTime} s`);
 assert.ok(rows.at(-1).vf>0&&rows.at(-1).oh>=2,'the Vulcan fires and overheats as usual');
 // At no moment do both buttons fire more than one bullet per Vulcan tick: no 15/s wall like v20.
 let maxWindow=0;for(let i=0;i<rows.length;i++){const j=rows.findIndex(r=>r.t>=rows[i].t+1-1e-9);if(j<0)break;maxWindow=Math.max(maxWindow,rows[j].pulls-rows[i].pulls);}assert.ok(maxWindow<=11,`busiest second: ${maxWindow} trigger pulls`);
});

test('sounds and spin: the cannon alone is the single-shot sound, the Vulcan is the BRRRT (shot) with spinning barrels',()=>{
 const events=[];const m=make({sound:e=>events.push(e)});run(m,1.5,{firing:true});assert.ok(events.includes('shotSingle')&&!events.includes('shot'));
 events.length=0;run(m,.5,{firing:true,vulcan:true});assert.ok(events.includes('shot')&&!events.includes('shotSingle'),'with both held the stream sounds like the Vulcan');assert.equal(m.firing,true);
 events.length=0;const v=make({sound:e=>events.push(e)});run(v,.5,{vulcan:true});assert.ok(events.filter(e=>e==='shot').length>=4&&!events.includes('shotSingle'));
});

test('damage per bullet: the cannon is the v15 steady shot, a Vulcan bullet is vulcanDamage; snapshot and getters expose the Vulcan',()=>{
 const m=make();m.update(FRAME,{firing:true});const cannon=m.shots.find(s=>s.kind===0&&!s.vulcan);assert.ok(cannon);assert.equal(cannon.damage,cfg.regularDamage);assert.equal(cfg.regularDamage,c15.normalDamage);
 const v=make();v.update(FRAME,{vulcan:true});const bullet=v.shots.find(s=>s.vulcan);assert.ok(bullet);assert.equal(bullet.damage,cfg.vulcanDamage);
 const s=v.snapshot();assert.equal(s.v23,true);assert.equal(s.vulcanFired,1);assert.equal(s.regularFired,0);assert.equal(s.vulcan.locked,false);assert.ok(s.vulcan.heat>0);
 assert.equal(v.vulcanLocked,false);assert.ok(v.vulcanHeat>0);assert.equal(v.vulcanLockLeft,0);assert.equal(v.vulcanOn,true);assert.equal(v.regularOn,false);
});

test('?alienFire=v15 restores v22: one button, the v15 burst/cool/steady gate, the Vulcan input ignored, no v23 fields',()=>{
 const a=make({fire:'v15'}),b=make({fire:'v15'});run(a,6,{firing:true});run(b,6,{firing:true,vulcan:true});
 const strip=s=>({...s,aliens:s.aliens.length,shots:s.shots.length,bolts:s.bolts.length});assert.deepEqual(strip(b.snapshot()),strip(a.snapshot()),'input.vulcan changes nothing');
 const s=a.snapshot();assert.equal(a.v23,false);assert.equal('v23' in s,false);assert.equal('vulcanFired' in s,false);assert.equal(s.overheats,1);assert.ok(s.burstShots>=10&&s.burstShots<=13);
 const only=make({fire:'v15'});run(only,3,{vulcan:true});assert.equal(only.snapshot().fired,0,'no second weapon in v22');
});

const PHONE=(844/390)/(360/480);
function playPhone(seed,hold,fire='v23'){const m=make({random:seededRandom(seed),fire});m.effectAspect=PHONE;
 for(let f=0;f<30*400&&!m.result;f++){const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}let want=t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>14);if(!safe(want)){out:for(let d=0;d<=360;d+=3)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>18&&x<342&&safe(x)){want=x;break out;}}}
  m.update(1/30,{moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),...hold});}
 return {seconds:+m.time.toFixed(1),outcome:m.result?.outcome||'timeout'};}
test('stage 1 balance (headless phone bot): the regular button alone plays like v22, both buttons help without making it easy',()=>{
 const avg=rs=>rs.reduce((n,r)=>n+r.seconds,0)/rs.length,seeds=[1,2,3];
 const v22=seeds.map(s=>playPhone(s,{firing:true},'v15')),regular=seeds.map(s=>playPhone(s,{firing:true})),both=seeds.map(s=>playPhone(s,{firing:true,vulcan:true}));
 for(const [name,rs] of [['v22',v22],['regular',regular],['both',both]])assert.ok(rs.every(r=>r.outcome==='win'),name+' '+JSON.stringify(rs));
 assert.ok(Math.abs(avg(regular)-avg(v22))<=avg(v22)*.12,`regular alone ${avg(regular)} s vs v22 ${avg(v22)} s`);
 assert.ok(avg(both)>=85&&avg(both)<avg(regular),`both ${avg(both)} s (regular ${avg(regular)} s)`);assert.ok(avg(both)>=avg(regular)*.8,'the Vulcan helps, it does not halve the stage');
});

/** Minimal DOM for the button: pointer capture per element, listeners with AbortSignal, dataset/style/classList. */
function fakeDom(){
 const node=(tag,ns)=>{const map={},attrs={},props={},classes=new Set(),captures=new Set();const n={tagName:tag,namespaceURI:ns||'http://www.w3.org/1999/xhtml',children:[],dataset:{},parent:null,
  style:{setProperty(k,v){props[k]=v;},getPropertyValue(k){return props[k]||'';}},classList:{toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},
  addEventListener(type,fn,opts){(map[type]||=[]).push({fn,signal:opts?.signal});},dispatch(type,event={}){for(const l of map[type]||[])if(!l.signal?.aborted)l.fn({preventDefault(){},button:0,target:{matches:()=>false},...event});},
  setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k]??null,append(...kids){for(const k of kids){k.parent=n;n.children.push(k);}},remove(){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);n.parent=null;},
  setPointerCapture(id){captures.add(id);},releasePointerCapture(id){captures.delete(id);},hasPointerCapture:id=>captures.has(id),querySelector(sel){const id=sel.replace('#','');const find=list=>{for(const c of list){if(c.id===id)return c;const f=find(c.children);if(f)return f;}return null;};return find(n.children);}};return n;};
 const doc={head:node('head'),createElement:tag=>node(tag),createElementNS:(ns,tag)=>node(tag,ns)},win=node('window'),controls=node('div'),shoot=node('button');shoot.id='shoot';controls.append(shoot);
 return {doc,win,controls,shoot};
}
test('Vulcan button: its own finger (two fingers on two buttons), a press shorter than a frame counts once, Z key, ring follows the model',()=>{
 const {doc,win,controls,shoot}=fakeDom();let gestures=0;
 const v=createAlienVulcan({controls,cfg,label:'וולקן',lockedLabel:'הוולקן מתקרר',regularLabel:'ירי רגיל',onGesture:()=>gestures++,windowTarget:win,documentTarget:doc});
 const b=v.button;assert.equal(b.id,'vulcan');assert.equal(controls.dataset.alienFire,'v23');assert.equal(b.getAttribute('aria-label'),'וולקן');assert.ok(shoot.children.some(c=>c.textContent==='ירי רגיל'),'caption under the fire button');
 assert.equal(v.sample(),false,'disabled until the round starts');b.dispatch('pointerdown',{pointerId:1});assert.equal(v.sample(),false);
 v.setEnabled(true);b.dispatch('pointerdown',{pointerId:7});assert.equal(v.sample(),true);assert.equal(v.sample(),true,'held');assert.ok(b.hasPointerCapture(7));assert.ok(b.classList.contains('held'));
 b.dispatch('pointerdown',{pointerId:8});b.dispatch('pointerup',{pointerId:8});assert.equal(v.held,true,'a second finger on the same button neither takes it nor releases it');
 shoot.dispatch('pointerdown',{pointerId:9});assert.equal(v.held,true,'a finger on the fire button does not touch the Vulcan');
 b.dispatch('pointerup',{pointerId:7});b.dispatch('lostpointercapture',{pointerId:7});assert.equal(v.held,false);assert.equal(v.sample(),false);assert.ok(!b.classList.contains('held'));
 b.dispatch('pointerdown',{pointerId:3});b.dispatch('pointerup',{pointerId:3});assert.equal(v.sample(),true,'a tap between two frames still fires once');assert.equal(v.sample(),false);
 b.dispatch('pointerdown',{pointerId:4});b.dispatch('pointercancel',{pointerId:4});assert.equal(v.sample(),false,'a cancelled touch fires nothing');
 win.dispatch('keydown',{code:'Space'});assert.equal(v.sample(),false,'Space stays the regular cannon');win.dispatch('keydown',{code:'KeyZ'});assert.equal(v.sample(),true);win.dispatch('keydown',{code:'KeyZ',repeat:true});win.dispatch('keyup',{code:'KeyZ'});assert.equal(v.sample(),false);
 assert.ok(gestures>=4,'presses unlock audio');
 v.update({vulcanHeat:0,vulcanLocked:false,time:0});assert.equal(b.dataset.level,'green');assert.equal(b.style.getPropertyValue('--heat'),'0%');
 v.update({vulcanHeat:.6,vulcanLocked:false,time:1});assert.equal(b.dataset.level,'yellow');assert.equal(b.style.getPropertyValue('--heat'),'60%');
 v.update({vulcanHeat:.9,vulcanLocked:false,time:1});assert.equal(b.dataset.level,'red');
 v.update({vulcanHeat:1,vulcanLocked:true,time:2});assert.equal(b.dataset.level,'lock');assert.equal(b.dataset.locked,'true');assert.equal(b.getAttribute('aria-label'),'הוולקן מתקרר');assert.equal(b.dataset.blink,'on');
 v.update({vulcanHeat:.9,vulcanLocked:true,time:2.125});assert.equal(b.dataset.blink,'off','blinks: on and off every eighth of a second of game time');
 v.update({vulcanHeat:0,vulcanLocked:false,time:4});assert.equal(b.dataset.level,'green');assert.equal(b.getAttribute('aria-label'),'וולקן');
 b.dispatch('pointerdown',{pointerId:5});v.setEnabled(false);assert.equal(v.held,false,'pause releases the button');
 v.dispose();assert.equal(controls.querySelector('#vulcan'),null);assert.equal(controls.dataset.alienFire,undefined);assert.ok(!shoot.children.some(c=>c.textContent==='ירי רגיל'));
 v.setEnabled(true);b.dispatch('pointerdown',{pointerId:6});assert.equal(v.sample(),false,'listeners are gone after dispose');
});

test('frame input: the Vulcan adapter fills input.vulcan; without it (?alienFire=v15) the input keeps the v22 shape',()=>{
 const shared={sample:()=>({moveX:0,kickHeld:true,passHeld:false})};
 assert.deepEqual(alienFrameInput(shared,FRAME,null),{moveX:0,firing:true,nova:false});
 assert.deepEqual(alienFrameInput(shared,FRAME,null,.12,{sample:()=>true}),{moveX:0,firing:true,nova:false,vulcan:true});
 assert.equal(alienFrameInput(shared,0,null,.12,{sample:()=>true}),null);
});

test('heat bar next to the ship: hidden when cold and open, green/yellow/red by heat, red/white blink while locked; v15 keeps its bar',()=>{
 const ctx=()=>{const fills=[];return {fills,set fillStyle(v){fills.push(v);},get fillStyle(){return fills.at(-1);},strokeStyle:'',lineWidth:1,globalAlpha:1,save(){},restore(){},translate(){},scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}};};
 const m=o=>({v23:true,v14:true,player:{x:100,y:400},time:0,vulcanHeat:0,vulcanLocked:false,...o});
 let p=ctx();drawV23Heat(p,m({}));assert.equal(p.fills.length,0,'cold and open: nothing drawn');
 for(const [heat,color] of [[.3,VULCAN_COLORS.green],[.6,VULCAN_COLORS.yellow],[.9,VULCAN_COLORS.red]]){p=ctx();drawV23Heat(p,m({vulcanHeat:heat}));assert.ok(p.fills.includes(color),`${heat} -> ${color}`);}
 p=ctx();drawV23Heat(p,m({vulcanHeat:1,vulcanLocked:true,time:0}));assert.ok(p.fills.includes(VULCAN_COLORS.blink));p=ctx();drawV23Heat(p,m({vulcanHeat:.9,vulcanLocked:true,time:.125}));assert.ok(p.fills.includes(VULCAN_COLORS.lock)&&!p.fills.includes(VULCAN_COLORS.blink));
 p=ctx();drawV14Heat(p,m({vulcanHeat:.6}));assert.ok(p.fills.includes(VULCAN_COLORS.yellow),'drawV14Heat hands v23 to the Vulcan bar (both render paths call it)');
 p=ctx();drawV14Heat(p,{v14:true,v15:true,player:{x:100,y:400},time:0,heat:.5,overheated:false,fireMode:'normal'});assert.ok(p.fills.includes('#ffc94a'),'v15: the amber steady bar as before');
 assert.equal(vulcanLevel(.49,false,cfg),'green');assert.equal(vulcanLevel(.5,false,cfg),'yellow');assert.equal(vulcanLevel(.8,false,cfg),'red');assert.equal(vulcanLevel(.1,true,cfg),'lock');
});

test('words for the child: help text and the in-game line describe the two buttons; the v22 help text is kept for ?alienFire=v15',async()=>{
 const help=strings['minigame.alienDefense.help.1'];
 for(const word of ['ברק','הירי הרגיל','קצב קבוע','וולקן','ירוק','צהוב','אדום','שתי שניות','מהבהב'])assert.ok(help.includes(word),word);
 assert.doesNotMatch(help,/!/);assert.doesNotMatch(help,/פרץ/,'no burst on the fire button any more');
 assert.match(strings['minigame.alienDefense.help.1.v15'],/פרץ וולקן קצר/);assert.equal(strings['minigame.vulcan'],'וולקן');assert.ok(strings['minigame.vulcanLocked']);assert.ok(strings['minigame.fireRegular']);
 const base={powerup:-1,upgrades:{},equipment:{},spreadTime:0,wings:[],v23:true,vulcanLocked:false};
 assert.match(alienFlightHudStatus(base,'touch',true).controlText,/וולקן/);assert.match(alienFlightHudStatus(base,'keyboard',true).controlText,/רווח.*Z וולקן/);
 assert.match(alienFlightHudStatus({...base,vulcanLocked:true},'touch',true).weaponText,/וולקן מתקרר/);
 assert.doesNotMatch(alienFlightHudStatus({...base,v23:false},'touch',true).controlText,/וולקן/,'v22 line unchanged');
 const ui=await read('../workout/island/minigames/alien-ui.mjs');assert.match(ui,/help\.1\.v15/);
});

test('layout and offline: the Vulcan button is at least 56 px and sits between the fire button and the missile; the files are cached offline',async()=>{
 const css=await read('../workout/island/minigames/alien-v23.css');
 const rule=css.match(/#vulcan\{position:absolute;[^}]*\}/)[0],num=k=>Number(rule.match(new RegExp(`[{;]${k}:(\\d+)px`))[1]);
 assert.ok(num('width')>=56&&num('height')>=56&&num('min-height')>=56,'thumb-sized');assert.equal(num('right'),144,'next to the fire button (right 22 + 108 + gap 14)');
 assert.match(css,/#pass\{right:246px/,'the missile moves one step left');
 const manifest=JSON.parse(await read('../workout/island/offline-manifest.json'));
 for(const file of ['minigames/alien-v23.mjs','minigames/alien-v23-ui.mjs','minigames/alien-v23-draw.mjs','minigames/alien-v23.css'])assert.ok(manifest.shell.includes(file),file);
});

// Codex final audit on 1207031 (28/10/2026): short engaged drags, torpedo reach and the aim upgrade hint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {createNavalInput,navalReachAim,navalReachOf,navalReachRange} from '../workout/island/minigames/naval-controls.mjs';
import {navalLaunch,navalLanding} from '../workout/island/minigames/naval-ballistics.mjs';

const root=new URL('../workout/island/',import.meta.url);
const config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames,b=config.navalDuel;
const strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
const near=(a,e,tol=1e-6)=>assert.ok(Math.abs(a-e)<=tol,`${a} ≉ ${e}`);

function harness(t,{right=true,difficulty='normal'}={}){
 const node=()=>{const listeners=new Map();return {matches:()=>false,addEventListener(type,fn,{signal}){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);signal.addEventListener('abort',()=>list.splice(list.indexOf(fn),1),{once:true});},emit(type,props={}){const e={target:this,pointerId:7,button:0,clientX:700,clientY:320,timeStamp:0,preventDefault(){},...props};for(const fn of [...listeners.get(type)||[]])fn(e);}};};
 const fire=node(),canvas={...node(),getBoundingClientRect:()=>({left:0,top:0,width:844,height:390})},win=node(),doc=node(),controls={querySelector:s=>s==='#shoot'?fire:null,dataset:{},style:{setProperty(){}}};
 const saved=new Map(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'window',{configurable:true,value:win});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const balance={...b,controls:{...b.controls,rightHanded:right}};
 const model=createNavalModel({config,balance,level:3,seed:4,random:seededRandom(4),difficulty}),input=createNavalInput({canvas,controls,balance},()=>model,()=>null);
 t.after(()=>{input.dispose();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 return {model,fire,win,input,frame(raw={}){const out=input.sample(raw);model.update(.02,out);return out;}};
}
// Leave the turret at a low-power setting, as a player who dragged down for a short shot would.
function lowPower(h){
 const R=navalReachRange(b),low=navalReachAim(R.min+(R.low-R.min)*.2,b);
 h.model.update(.02,{aimHeld:true,aimYaw:.05,aimElevation:low.elevation,aimPower:low.power});h.model.update(.02,{aimCancel:true});
 assert.ok(h.model.turret.power<.5,`turret left at low power (${h.model.turret.power})`);return low;
}

test('A short drag that engaged the aim fires the shown low-power settings for both hands and both difficulties',t=>{
 for(const right of [true,false])for(const difficulty of ['normal','easy'])for(const px of [2,3,5,8,10])for(const axis of ['x','y']){
  const h=harness(t,{right,difficulty}),low=lowPower(h),fired=h.model.fired,quick=h.model.quickShots,dir=right?1:-1;
  h.fire.emit('pointerdown',{clientX:700,clientY:320,timeStamp:0});h.frame();h.frame();h.frame();
  const move=axis==='x'?{clientX:700+dir*px,clientY:320}:{clientX:700,clientY:320+px};
  h.win.emit('pointermove',{...move,timeStamp:60});h.frame();h.frame();
  h.win.emit('pointerup',{...move,timeStamp:120});const out=h.frame();
  const label=`${right?'right':'left'} hand, ${difficulty}, ${px} px on ${axis} in 0.12 s`;
  assert.equal(out.quickShot,false,`${label}: not a quick shot`);assert.equal(out.fireRelease,true,`${label}: fires`);
  assert.ok(out.aimPower<.5,`${label}: the low power on the ring is kept (${out.aimPower})`);
  if(axis==='x')near(out.aimPower,low.power,1e-9);else assert.ok(out.aimPower<=low.power+1e-9,`${label}: dragging down never adds power`);
  assert.equal(h.model.fired,fired+1,`${label}: exactly one shell`);assert.equal(h.model.quickShots,quick,`${label}: no quick aim`);
  near(h.model.turret.power,out.aimPower,1e-9);
 }
});

test('An undragged tap (and a 1 px jitter) is still the quick shot',t=>{
 for(const right of [true,false])for(const jitter of [0,1]){
  const h=harness(t,{right});lowPower(h);
  h.fire.emit('pointerdown',{clientX:700,clientY:320,timeStamp:0});h.frame();h.frame();
  if(jitter)h.win.emit('pointermove',{clientX:700+jitter,clientY:320,timeStamp:40});
  h.win.emit('pointerup',{clientX:700+jitter,clientY:320,timeStamp:80});const out=h.frame();
  assert.equal(out.quickShot,true);assert.equal(out.fireRelease,false);assert.equal(h.model.turret.power,1,'the quick shot fires at full power');
 }
});

test('Torpedo: the whole reach control maps to run length 90 → 380, both ways, with no change to guns',()=>{
 const R=navalReachRange(b),ship={x:60,z:0,heading:0},min=b.ballistics.torpedoMinRange,max=b.ballistics.torpedoMaxRange;
 const run=v=>{const a=navalReachAim(v,b,2),L=navalLaunch({ship,yaw:0,...a,ammo:2},b);return navalLanding(L).x-L.origin.x;};
 const first=navalReachAim(R.min,b,2),last=navalReachAim(R.max,b,2);near(first.power,R.minPower);near(last.power,1);
 let prev=-Infinity;for(let v=R.min;v<=R.max+1e-9;v+=.5){const a=navalReachAim(v,b,2);assert.ok(a.power>=prev-1e-12,'longer as the drag goes up');assert.ok(a.power-prev<.02||prev===-Infinity,`no jump at ${v}`);prev=a.power;
  near(navalReachOf(a,b,2),v,1e-9);}
 // At 10° (the old top of the torpedo range) the control is only part way: the upper half of the drag is now live.
 assert.ok(navalReachAim(R.low,b,2).power<.8,'the upper part of the drag still lengthens the run');
 assert.equal(min,90);assert.equal(max,380);near(run(R.min),min,2);near(run(R.max),max,2);
 assert.deepEqual(navalReachAim(14,b,0),{elevation:14,power:1},'guns keep the elevation control');assert.deepEqual(navalReachAim(14,b,1),navalReachAim(14,b,0));
});

test('The aim upgrade hint names the shorter wait between shots, which is what equipment.rate changes',async()=>{
 const hint=strings['naval.upgrades.aim.hint'];assert.ok(hint.includes('המתנה'),hint);assert.ok(!/טבעת|מתמלא/.test(hint),hint);
 const naval=await readFile(new URL('minigames/naval.mjs',root),'utf8');assert.match(naval,/equipment\.rate/);
});

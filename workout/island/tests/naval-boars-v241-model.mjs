// v24.1 measurements without a browser (14/11/2026): the same models the tests use, written to verification/naval-boars-v241/model.json.
// Run: node workout/island/tests/naval-boars-v241-model.mjs
//  - ships: the radar lock time by stage (Lock button, model time), locked shells that fly into the empty sea after their hull sank (a child
//    tapping Fire every 0.4 s at a locked hull, stages 3-30, three seeds), the child bot (tests/helpers/naval-kid-bot.mjs) at stages 1, 5,
//    10 and 11, each against the v24 switches;
//  - boars: the child model (boar-aim-model.mjs, 8-12 deg aim noise, 2400 boars a version) for v23, v24 and v24.1, and the crosshair
//    speed by push on a 844 x 390 phone.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createNavalModel} from '../minigames/naval.mjs';
import {seededRandom} from '../minigames/context.mjs';
import {playStage} from '../../../tests/helpers/naval-kid-bot.mjs';
import {runTrials} from './boar-aim-model.mjs';
import {AIM24,AIM241,V23,stickCurve,topSpeed} from '../minigames/boar-island/aim-v24.mjs';
const cfg=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames,nb=cfg.navalDuel,phone={...cfg,width:844,height:390},FRAME=1/60;
const naval=(stage,seed,search='')=>{globalThis.location={search};try{return createNavalModel({config:phone,balance:nb,level:stage,seed,random:seededRandom(seed),difficulty:stage});}finally{delete globalThis.location;}};
const out={date:'2026-11-14',ships:{},boars:{}};
// Radar lock time by stage (the Lock button, the first hull of the order).
out.ships.lockSeconds=[];for(const stage of [1,5,10,15,20,25,30])for(const seed of [1,2]){const m=naval(stage,seed);for(let i=0;i<40;i++)m.update(FRAME,{});m.update(FRAME,{lockSmart:true});if(!m.radar)continue;const e=m.enemies.find(x=>x.index===m.radar.index),d=Math.hypot(e.x-m.playerShip.x,e.z-m.playerShip.z),t0=m.time;let at=null;for(let i=0;i<120&&at===null;i++){m.update(FRAME,{});if(m.homing)at=m.time;}out.ships.lockSeconds.push({stage,seed,distance:Math.round(d),seconds:at===null?null:+(at-t0).toFixed(2)});}
// Locked shells into the empty sea.
const sea=search=>{let shots=0,empty=0;for(const stage of [3,5,10,20,25,30])for(const seed of [1,2,3]){const m=naval(stage,seed,search);let last=null;const locked=new Set();
  for(let i=0;i<60*60&&!m.result;i++){const inp={moveX:Math.sin(i/120)*.5,moveZ:Math.cos(i/170)*.3};if(!m.homing&&!m.radar)inp.lockSmart=true;if(m.homing&&i%24===0)inp.quickShot=true;if(m.ammoIndex!==0)inp.ammoIndex=0;const f=m.fired;m.update(FRAME,inp);if(m.fired>f&&m.ball.lockShot)locked.add(m.ball.shotId);
   const ls=m.lastShot;if(ls&&ls.shotId!==last){last=ls.shotId;if(!locked.has(ls.shotId))continue;shots++;if(ls.actual.victim===null)empty++;}}}
 return {lockedShells:shots,intoTheSea:empty,hitPercent:+(100*(shots-empty)/shots).toFixed(1)};};
out.ships.lockedShells={v24:sea('?navalRadar=v24'),v241:sea('')};
// The child bot.
out.ships.kidBot=[];for(const stage of [1,5,10,11])for(const [mode,search] of [['v24','?navalRadar=v24&navalSub=v24&navalAirEnd=v24&navalHint=v24'],['v241','']]){let fired=0,hits=0,wins=0,seconds=0;for(const seed of [1,2,3]){const r=playStage((s,sd)=>naval(s,sd,search),stage,seed,{balance:nb,style:'lockButton',notice:.6});fired+=r.fired;hits+=r.hits;wins+=r.outcome==='win'?1:0;seconds+=r.seconds;}out.ships.kidBot.push({stage,mode,hitPercent:+(100*hits/fired).toFixed(1),shells:fired,wins,meanSeconds:+(seconds/3).toFixed(1)});}
// Boars: the child model.
const agg=v=>{const s={hitRate:0,aimMedian:0,aimMean:0,strokes:0,firstHitMedian:0,killMedian:0};let n=0;for(const sigmaDeg of [8,10,12])for(const seed of [1,2,3,4,5,6,7,8]){const r=runTrials({version:v,sigmaDeg,seed,trials:100});for(const k in s)s[k]+=r.all[k];n++;}for(const k in s)s[k]=+(s[k]/n).toFixed(3);return s;};
out.boars.childModel={v23:agg('v23'),v24:agg('v24'),v241:agg('v241')};
const px=(m,P)=>+(stickCurve(m,P)*topSpeed(1,0,844,390,P)).toFixed(1);out.boars.speedPxPerS=Object.fromEntries([.15,.2,.3,.5,.75,1].map(m=>[m,{v24:px(m,AIM24),v241:px(m,AIM241),overBoarV24:+(px(m,AIM24)*AIM24.FRICTION_MIN).toFixed(1),overBoarV241:+(px(m,AIM241)*AIM241.FRICTION_MIN).toFixed(1)}]));
const dir=new URL('../verification/naval-boars-v241/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('model.json',dir),JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify(out));void V23;

// Aliens v25, headless (the model's own clock, phone aspect): the Vulcan v24 -> v25, the enemy fire v24 -> v25, and the arsenal in play.
//   node workout/island/tools/alien-v25-sim.mjs [stages=1,3,5] [seeds=1,2,3]   prints a JSON table (also used by the report).
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../minigames/aliens.mjs';
import {seededRandom} from '../minigames/context.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.split('=')));
const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames,balance=config.alienDefense;
const PHONE=(844/390)/(360/480),FRAME=1/60;
const stages=(args.stages||'1,3,5').split(',').map(Number),seeds=(args.seeds||'1,2,3').split(',').map(Number);
export function make({vulcan='v25',enemy='v25',arsenal='v25',refill=true,level=1,seed=3}={}){
 Object.assign(globalThis,{__alienVulcan:vulcan==='v24'?'v24':undefined,__alienEnemyFire:enemy==='v24'?'v24':undefined,__alienArsenal:arsenal==='v24'?'0':undefined,__alienRefill:refill?undefined:'0'});
 try{return createAlienModel({config,balance,level,random:seededRandom(seed),completion:'waves',roundChoices:false});}
 finally{for(const k of ['__alienVulcan','__alienEnemyFire','__alienArsenal','__alienRefill'])globalThis[k]=undefined;}
}
/** A good child: under the lowest alien, dodging bullets, both fire buttons held, the special fired when it has charges (switching to one that
 * has), half the time flying to an ammo token or a Vulcan magazine on screen. */
export function play(opts,hold={firing:true,vulcan:true},useSpecial=true){
 const m=make(opts);m.effectAspect=PHONE;const r0=seededRandom((opts.seed||3)*7+1);let chase=false,switches=0,lastSwitch=-9,lastFire=-9;
 for(let f=0;f<30*500&&!m.result;f++){
  if(f%30===0)chase=r0()<.5;
  const token=chase?(m.ammoDrops?.[0]||m.refills?.[0]):null,t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0],py=m.player.y,cross=[];
  for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}
  let want=token?token.x:t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>14);
  if(!safe(want)){out:for(let d=0;d<=360;d+=3)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>18&&x<342&&safe(x)){want=x;break out;}}}
  const input={moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),...hold};
  if(useSpecial&&m.arsenalOn){const ammo=m.specialAmmo;if(ammo[m.special]<=0&&ammo.some(n=>n>0)&&m.time-lastSwitch>.3){input.switchSpecial=true;lastSwitch=m.time;switches++;}
   else if(ammo[m.special]>0&&m.time-lastFire>2.5&&m.aliens.some(a=>a.entry<=0)){input.nova=true;lastFire=m.time;}}
  else if(useSpecial&&m.novaCharges>0&&m.time-lastFire>2.5&&m.aliens.some(a=>a.entry<=0)){input.nova=true;lastFire=m.time;}
  m.update(1/30,input);
 }
 const s=m.snapshot();
 return {seconds:+m.time.toFixed(1),win:m.result?.outcome==='win',boltsPerMin:+(60*s.boltsFired/m.time).toFixed(1),hitsTaken:s.playerHits,lives:s.lives,
  arsenal:s.arsenal?{dropped:s.arsenal.dropped,collected:s.arsenal.collected,lightning:s.arsenal.lightningsFired,lightningHits:s.arsenal.lightningHits,waves:s.arsenal.wavesFired,waveHits:s.arsenal.waveHits,bulletsWiped:s.arsenal.waveBolts,switches}:null,missiles:s.missilesFired};
}
const avg=(rs,k)=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(1);
if(import.meta.url===`file://${process.argv[1]}`){
 const table={};
 for(const level of stages){
  const rows={};
  for(const [name,opts] of Object.entries({v24:{vulcan:'v24',enemy:'v24',arsenal:'v24'},enemyOnly:{vulcan:'v24',enemy:'v25',arsenal:'v24'},v25:{}})){
   const rs=seeds.map(seed=>play({...opts,level,seed}));
   rows[name]={seconds:avg(rs,'seconds'),wins:rs.filter(r=>r.win).length,boltsPerMin:avg(rs,'boltsPerMin'),hitsTaken:avg(rs,'hitsTaken'),arsenal:rs[0].arsenal,missiles:avg(rs,'missiles')};
  }
  table['stage'+level]=rows;
 }
 console.log(JSON.stringify(table,null,1));
}

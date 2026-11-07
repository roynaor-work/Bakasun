// Headless balance simulation for the alien stages (no browser). Usage: node sim.mjs [label] [json-overrides]
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../../minigames/aliens.mjs';
import {seededRandom} from '../../minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../../data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
if(process.env.ALIEN_V9==='0')globalThis.__alienV9=false;
if(process.env.V9)Object.assign(balance.v9,JSON.parse(process.env.V9));
// bot: moves under the lowest living alien, holds the fire button when roughly aligned (a "pressing" player).
export function run(level,seed,{profile={},press=0.85}={}){
 const rnd=seededRandom(seed),m=createAlienModel({config,balance,level,random:rnd,completion:'waves',roundChoices:false,...profile});
 let pressed=0,frames=0,cnt={bonus:0};const dt=1/30;
 while(!m.result&&m.time<400){
  const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];
  let dx=t?t.x-m.player.x:0;
  // dodge: step away from a bolt/diving alien that is about to cross the ship
  const threat=[...m.bolts.filter(b=>b.y<m.player.y&&b.y>m.player.y-230),...m.aliens.filter(a=>a.diveAge>=0&&a.y>m.player.y-180)].find(o=>Math.abs(o.x-m.player.x)<46);
  const input={moveX:Math.max(-1,Math.min(1,dx/40)),firing:false};
  if(threat)input.moveX=m.player.x>=threat.x?1:-1;
  if(press>=1){input.firing=Boolean(t);pressed++;}else if(t&&Math.abs(dx)<balance.alienRadius*1.3&&rnd()<press){input.firing=true;pressed++;}
  frames++;m.update(dt,input);
 }
 const s=m.snapshot();
 return {level,seconds:+m.time.toFixed(1),outcome:m.result?.outcome||'timeout',kills:s.kills,fired:s.fired,hits:s.hits,shotsPerKill:+(s.fired/Math.max(1,s.kills)).toFixed(2),bonuses:s.bonusesDropped,livesLost:s.maxLives-s.lives,waves:s.wave};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const profiles={base:{},upgraded:{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}}},presses={casual:0.45,pressing:0.85},label=process.argv[2]||'run';
 console.log(label);
 for(const [pn,profile] of Object.entries(profiles))for(const [qn,press] of Object.entries(presses)){
  const rows=[];
  for(const level of [1,2,3,5,8,12,20,30]){
   const rs=[1,2,3,4,5].map(seed=>run(level,seed,{profile,press})),avg=k=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(2);
   rows.push({level,seconds:avg('seconds'),kills:avg('kills'),shotsPerKill:avg('shotsPerKill'),bonuses:avg('bonuses'),livesLost:avg('livesLost'),win:rs.filter(r=>r.outcome==='win').length+'/5'});
  }
  console.log(pn+'/'+qn);console.table(rows);
 }
}

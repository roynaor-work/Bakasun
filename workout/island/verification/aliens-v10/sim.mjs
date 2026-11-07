// Headless v10 measurements (no browser). Usage: node sim.mjs [label]; ALIEN_V10=0 for v9 behaviour.
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../../minigames/aliens.mjs';
import {seededRandom} from '../../minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../../data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
if(process.env.ALIEN_V10==='0')globalThis.__alienV10=false;
const dt=1/30;
/** Missile hit rate: launch from random player positions at random times in a stage. */
export function missiles(level,seed,count=12){
 const rnd=seededRandom(seed),m=createAlienModel({config,balance,level,random:rnd,completion:'waves',roundChoices:false});
 let fired=0;
 for(let f=0;f<30*160&&!m.result&&fired<count;f++){
  const input={moveX:Math.sin(f/37+seed),firing:true,nova:false};
  if(m.novaCharges<=0)m.pickups.push({kind:5,x:m.player.x,y:m.player.y,vy:0});
  const idle=m.nova.flight<=0&&m.nova.life<=0;
  if(idle&&m.aliens.some(a=>a.y>0&&a.entry<=0)&&f%(30+Math.floor(rnd()*40))===0){input.nova=true;fired++;}
  m.update(dt,input);
  if(m.lives<=0)break;
 }
 for(let i=0;i<60;i++)m.update(dt,{});
 const s=m.snapshot();return {fired:s.missilesFired,hit:s.missilesHit};
}
/** Fire at the player: bolts per minute and player hits for a dodging, shooting player. */
export function pressure(level,seed,secs=60){
 const rnd=seededRandom(seed),m=createAlienModel({config,balance,level,random:rnd,completion:'waves',roundChoices:false,lives:99});
 for(let f=0;f<30*secs&&!m.result;f++){
  const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];let dx=t?t.x-m.player.x:0;
  const threat=[...m.bolts.filter(b=>b.y<m.player.y&&b.y>m.player.y-230),...m.aliens.filter(a=>a.diveAge>=0&&a.y>m.player.y-180)].find(o=>Math.abs(o.x-m.player.x)<46);
  const input={moveX:Math.max(-1,Math.min(1,dx/40)),firing:true};if(threat)input.moveX=m.player.x>=threat.x?1:-1;
  m.update(dt,input);
 }
 const s=m.snapshot();return {t:m.time,bolts:s.boltsFired,hits:s.playerHits,lost:s.maxLives-s.lives,waves:s.wave,outcome:m.result?.outcome||'running'};
}
if(import.meta.url===`file://${process.argv[1]}`){
 console.log(process.argv[2]||'run','v10',process.env.ALIEN_V10!=='0');
 const rows=[];for(const l of [1,2,3,5,8]){let f=0,h=0;for(let s=1;s<=10;s++){const r=missiles(l,s);f+=r.fired;h+=r.hit;}rows.push({stage:l,fired:f,hit:h,hitPct:+(100*h/f).toFixed(0)});}console.table(rows);
 const pr=[];for(const l of [1,2,3,4]){const rs=[1,2,3,4,5,6].map(s=>pressure(l,s)),a=k=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(1);pr.push({stage:l,secs:a('t'),boltsPerMin:+(a('bolts')*60/a('t')).toFixed(1),playerHitsPerMin:+(a('hits')*60/a('t')).toFixed(1)});}console.table(pr);
}

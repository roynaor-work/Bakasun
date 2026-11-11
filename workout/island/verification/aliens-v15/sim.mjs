// Headless v10 measurements (no browser). Usage: node sim.mjs [label]; ALIEN_V10=0 for v9 behaviour.
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../../minigames/aliens.mjs';
import {seededRandom} from '../../minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../../data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
if(process.env.ALIEN_V10==='0')globalThis.__alienV10=false;
if(process.env.ALIEN_V11==='0')globalThis.__alienV11=false;
if(process.env.ALIEN_V12==='0')globalThis.__alienV12=false;
if(process.env.ALIEN_V14==='0')globalThis.__alienV14=false;
if(process.env.ALIEN_V15==='0')globalThis.__alienV15=false;
if(process.env.V15)Object.assign(balance.v15,JSON.parse(process.env.V15));
if(process.env.V9)Object.assign(balance.v9,JSON.parse(process.env.V9));
if(process.env.V11)Object.assign(balance.v11,JSON.parse(process.env.V11));
if(process.env.V14)Object.assign(balance.v14,JSON.parse(process.env.V14));
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
  const threat=[...m.bolts.filter(b=>b.y<m.player.y&&b.y>m.player.y-260),...m.aliens.filter(a=>a.diveAge>=0&&a.y>m.player.y-180)].find(o=>Math.abs(o.x-m.player.x)<58);
  const input={moveX:Math.max(-1,Math.min(1,dx/40)),firing:true};if(threat){let d=m.player.x>=threat.x?1:-1;if(m.player.x>config.width-70&&d>0)d=-1;if(m.player.x<70&&d<0)d=1;input.moveX=d;}
  m.update(dt,input);
 }
 const s=m.snapshot();return {t:m.time,bolts:s.boltsFired,hits:s.playerHits,lost:s.maxLives-s.lives,waves:s.wave,outcome:m.result?.outcome||'running'};
}
/** Attentive-player dodge: predicts where every bolt crosses the ship's row and picks the nearest safe x. */
function aimX(m,wantX){
 const py=m.player.y,R=30,crossings=[];
 for(const b of m.bolts){const vy=b.vy||1;const tt=(py-b.y)/vy;if(tt>0&&tt<1.4)crossings.push({x:b.x+(b.vx||0)*tt,tt});}
 for(const a of m.aliens)if(a.diveAge>=0&&a.y<py)crossings.push({x:a.x,tt:(py-a.y)/200});
 const safe=x=>crossings.every(c=>Math.abs(c.x-x)>R+Math.max(0,(1-c.tt))*8);
 if(safe(wantX))return wantX;
 let best=null;for(let d=0;d<=config.width;d+=6)for(const sg of [1,-1]){const x=m.player.x+sg*d;if(x<20||x>config.width-20)continue;if(safe(x)){best=x;break;}}
 return best??wantX;
}
/** Stage measurements for a player who holds fire: duration, shots, alien fire, hits, bonuses, laser, blasts. */
export function stage(level,seed,{profile={},cap=400}={}){
 const rnd=seededRandom(seed),m=createAlienModel({config,balance,level,random:rnd,completion:'waves',roundChoices:false,...profile});
 for(let f=0;f<30*cap&&!m.result;f++){
  const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0],x=aimX(m,t?t.x:m.player.x);
  m.update(dt,{moveX:Math.max(-1,Math.min(1,(x-m.player.x)/25)),firing:true});
 }
 const s=m.snapshot();return {level,seconds:+m.time.toFixed(1),fired:s.fired,shotsPerSec:+(s.fired/m.time).toFixed(2),lasers:s.lasersFired,blasts:s.blastsMade,kills:s.kills,bolts:s.boltsFired,boltsPerMin:+(s.boltsFired*60/m.time).toFixed(1),hits:s.playerHits,lost:s.maxLives-s.lives,bonuses:s.bonusesDropped,outcome:m.result?.outcome||'timeout'};
}
if(import.meta.url===`file://${process.argv[1]}`&&process.argv[3]==='stages'){
 const rows=[];for(const [pn,profile] of Object.entries({base:{},upgraded:{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}}}))for(const l of (process.env.STAGES||'1,2,3,4,5,6,7,8,9,10').split(',').map(Number)){
  const rs=Array.from({length:+(process.env.SEEDS||6)},(_,i)=>i+1).map(s=>stage(l,s,{profile})),a=k=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(1);
  rows.push({profile:pn,stage:l,seconds:a('seconds'),shotsPerSec:a('shotsPerSec'),lasers:a('lasers'),blasts:a('blasts'),boltsPerMin:a('boltsPerMin'),hitsPerMin:+(a('hits')*60/a('seconds')).toFixed(1),lost:a('lost'),bonuses:a('bonuses'),noBonusRuns:rs.filter(r=>r.bonuses===0&&r.outcome==='win').length,win:rs.filter(r=>r.outcome==='win').length+'/'+rs.length});}
 console.table(rows);
}

// Ships v24.8 "harder" measurement (21/11/2026): the child bot (tests/helpers/naval-kid-bot.mjs) plays whole stages on the production
// defaults (naval battle on, phone fixes on) with `?navalHarder=0` and without it, and the numbers are printed as JSON lines.
// Run: node workout/island/tools/naval-harder-sim.mjs [seeds=20] [stages=1,15,30]
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../minigames/naval.mjs';
import {navalHarderEnabled} from '../minigames/naval-harder.mjs';
import {seededRandom} from '../minigames/context.mjs';
import {playStage} from '../../../tests/helpers/naval-kid-bot.mjs';
const cfg=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames,nb=cfg.navalDuel,phone={...cfg,width:844,height:390};
const seeds=Number(process.argv[2])||20,stages=(process.argv[3]||'1,15,30').split(',').map(Number);
const naval=(stage,seed,search)=>{globalThis.location={search};try{return createNavalModel({config:phone,balance:nb,level:stage,seed,random:seededRandom(seed),navalBattle:true,navalHarder:navalHarderEnabled(search)});}finally{delete globalThis.location;}};
for(const stage of stages)for(const [mode,search] of [['off','?navalHarder=0'],['on','']].filter(m=>!process.argv[4]||m[0]===process.argv[4])){
 const row={stage,mode,seeds,wins:0,loss:0,timeout:0,seconds:0,enemyFired:0,enemyPerMinute:0,hpLeft:0,fired:0,hits:0,lockTaps:0,ships:0,radarLocks:0,radarBreaks:0,trackBreaks:0};
 for(let seed=1;seed<=seeds;seed++){let made=null;const r=playStage((s,sd)=>made=naval(s,sd,search),stage,seed,{balance:nb,style:'lockButton',notice:.6});
  const snap=made.snapshot();row[r.outcome==='win'?'wins':r.outcome==='timeout'?'timeout':'loss']++;row.seconds+=r.seconds;row.enemyFired+=r.enemyFired;row.enemyPerMinute+=r.enemyPerMinute;row.hpLeft+=r.hpLeft;row.fired+=r.fired;row.hits+=r.hits;row.lockTaps+=r.stats.lockTaps;
  row.ships=made.enemies.filter(e=>e.behavior!=='base').length;row.radarLocks+=snap.v241.radarLocks;row.radarBreaks+=snap.v241.radarBreaks;row.trackBreaks+=snap.harder?.trackBreaks||0;}
 for(const k of ['seconds','enemyPerMinute','hpLeft'])row[k]=+(row[k]/seeds).toFixed(2);row.winPercent=Math.round(100*row.wins/seeds);row.hitPercent=row.fired?Math.round(100*row.hits/row.fired):null;
 row.secondsPerLock=row.radarLocks?+(row.seconds*seeds/row.radarLocks).toFixed(2):null;console.log(JSON.stringify(row));
}

// AI offence measurement (headless, fixed seeds): node measure.mjs [games] [ticksPerGame]
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../../minigames/hoops-franchise.mjs';
const cfg=JSON.parse(await readFile(new URL('../../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
export async function measure({games=24,ticks=60*60*6,difficulty='normal'}={}){
 const m={games,possessions:0,passes:0,inboundPasses:0,lateral:0,backward:0,attackSec:0,fga:0,fgm:0,tpa:0,tpm:0,points:0,turnovers:{},travel:0,doubleDribble:0,shotclockViol:0,attacks:0};
 for(let g=0;g<games;g++){
  const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
  const e=createHoopsEngine({config,seed:1000+g*37,teams:clubs.teams,userTeam:0,profile:'quick',difficulty,autopilot:true});
  const a=e.debug.api,S=e.debug.state;let curTeam=null,start=0,passes=0,shots=0;
  const close=(t)=>{if(curTeam===null)return;m.possessions++;m.attackSec+=(t-start)/60;};
  for(let i=0;i<ticks&&S.phase!=='final';i++){
   e.step(NO_INPUT);
   for(const ev of e.drainEvents()){
    if(ev.type==='possession'&&ev.team!==curTeam&&ev.reason!=='inbound-ready'){close(i);curTeam=ev.team;start=i;}
    if(ev.type==='pass'){if(S.inbound||S.phase!=='live'){m.inboundPasses=(m.inboundPasses||0)+1;continue;}const p=a.byId(ev.playerId),q=a.byId(ev.targetId);if(!p||!q)continue;m.passes++;
     const rim=a.court.rim(a.side(p.team)),dp=Math.hypot(p.x-rim.x,p.z-rim.z),dq=Math.hypot(q.x-rim.x,q.z-rim.z);
     if(dq>dp-1.0){m.lateral++;if(dq>dp+0.5)m.backward++;}}
    if(ev.type==='violation'){m.turnovers[ev.kind]=(m.turnovers[ev.kind]||0)+1;}
   }
  }
  close(S.tick);
  for(const t of S.teams)for(const p of t.roster){m.fga+=p.stats.fga;m.fgm+=p.stats.fgm;m.tpa+=p.stats.tpa;m.tpm+=p.stats.tpm;m.points+=p.stats.pts;}
 }
 const r={...m,passesPerPossession:+(m.passes/m.possessions).toFixed(2),lateralPct:+(100*m.lateral/Math.max(1,m.passes)).toFixed(1),attackSeconds:+(m.attackSec/m.possessions).toFixed(1),fgPct:+(100*m.fgm/Math.max(1,m.fga)).toFixed(1),threePct:+(100*m.tpm/Math.max(1,m.tpa)).toFixed(1),ptsPerPossession:+(m.points/m.possessions).toFixed(2),shotsPerPossession:+(m.fga/m.possessions).toFixed(2)};
 return r;
}
if(import.meta.url===`file://${process.argv[1]}`)console.log(JSON.stringify(await measure({games:+process.argv[2]||24,ticks:+process.argv[3]||60*60*6}),null,1));

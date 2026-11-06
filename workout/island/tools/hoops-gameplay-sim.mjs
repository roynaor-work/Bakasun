// Headless AI-vs-AI gameplay measurement for Street Slam basketball (no browser).
// Usage: node workout/island/tools/hoops-gameplay-sim.mjs [games=200] [ai=v2|v1] [profile=quick] [out.json]
// Each game: both teams on autopilot, real tactics package loaded (as the session does), fixed seeds.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHoopsEngine,NO_INPUT} from '../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../minigames/hoops-franchise.mjs';
import {compileHoopsTactics} from '../minigames/hoops-tactics.mjs';
const cfg=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const tacticsData=compileHoopsTactics(JSON.parse(readFileSync(new URL('../design/tactics/basketball.json',import.meta.url),'utf8')));
const r2=(n,d=2)=>+n.toFixed(d),pct=(a,b)=>b?r2(100*a/b,1):0;

export function simulate({games=200,ai='v2',profile='quick',difficulty='normal',seedBase=9000,mirror=false}={}){
 const m={games,possessions:0,fga:0,fgm:0,tpa:0,tpm:0,points:0,passes:0,tov:0,steals:0,intercepts:0,blocks:0,rebounds:0,oreb:0,fouls:0,
  travel:0,doubleDribble:0,out:0,shotclock:0,backcourt:0,three:0,shotTypes:{layup:0,dunk:0,jumpshot:0,pullup:0,other:0},zones:{close:0,mid:0,three:0},
  passesBeforeShot:0,shotPossessions:0,pingPong:0,holdTicks:0,holds:0,attackSec:0,wins0:0,diffAbs:0,diff0:0,scores:[],lateralPass:0,contestedLateral:0,holdList:[],tovOwn:0,inboundOut:0,looseOut:0,badPassOut:0,shotClockOver:0,dribbleFails:0};
 let steps=0;const t0=Date.now();
 for(let g=0;g<games;g++){
  const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
  let teams=clubs.teams;
  if(mirror){const b=structuredClone(teams[0]);b.id=b.id+'-b';b.name=b.name+' B';b.look=teams[1].look;b.colors=teams[1].colors;b.roster=structuredClone(teams[0].roster);teams=[teams[0],b];}
  const e=createHoopsEngine({config,seed:seedBase+g*37,teams,userTeam:0,profile,difficulty,autopilot:true,aiVersion:ai});
  e.setTacticsData(tacticsData);
  const a=e.debug.api,S=e.debug.state;
  let lastInbound=-9999,curTeam=null,start=0,passes=0,shots=0,holdStart=null,holdPlayer=null,pos=0;
  const closePoss=(i)=>{if(curTeam===null)return;m.possessions++;m.attackSec+=(i-start)/60;if(shots>0){m.passesBeforeShot+=passes;m.shotPossessions++;}if(passes>=3&&shots===0)m.pingPong++;};
  const rel={};
  for(let i=0;i<60*60*12&&S.phase!=='final';i++){
   e.step(NO_INPUT);steps++;
   for(const ev of e.drainEvents()){
    switch(ev.type){
     case'possession':if(ev.reason==='inbound-ready')break;if(ev.team!==curTeam){closePoss(i);curTeam=ev.team;start=i;passes=0;shots=0;}
      holdStart=i;holdPlayer=ev.playerId;break;
     case'catch':holdStart=i;holdPlayer=ev.playerId;break;
     case'passStart':if(S.phase==='live'&&!S.inbound){if(holdStart!=null&&holdPlayer===ev.playerId){m.holdTicks+=i-holdStart;m.holds++;m.holdList.push((i-holdStart)/60);}
      const p=a.byId(ev.playerId),q=a.byId(ev.targetId);if(p&&q){const rim=a.court.rim(a.side(p.team)),dp=Math.hypot(p.x-rim.x,p.z-rim.z),dq=Math.hypot(q.x-rim.x,q.z-rim.z);if(dq>dp-1){const open=Math.min(...a.onCourt(1-q.team).map(o=>Math.hypot(o.x-q.x,o.z-q.z)));if(open<1.8)m.contestedLateral++;}}}break;
     case'shotStart':if(ev.shotType!=='ft'&&holdStart!=null&&holdPlayer===ev.playerId){m.holdTicks+=i-holdStart;m.holds++;holdStart=null;}break;
     case'pass':if(S.inbound||S.phase!=='live')break;m.passes++;passes++;{const p=a.byId(ev.playerId),q=a.byId(ev.targetId);if(p&&q){const rim=a.court.rim(a.side(p.team)),dp=Math.hypot(p.x-rim.x,p.z-rim.z),dq=Math.hypot(q.x-rim.x,q.z-rim.z);if(dq>dp-1)m.lateralPass++;}}break;
     case'release':if(ev.shotType==='ft')break;shots++;m.fga++;if(ev.points===3)m.tpa++;m.shotTypes[ev.shotType in m.shotTypes?ev.shotType:'other']++;rel[ev.shotId]=ev;
      {const s=a.side(a.byId(ev.playerId).team),d=a.court.distToRim(s,ev.x,ev.z);m.zones[ev.points===3?'three':d<3?'close':'mid']++;}break;
     case'score':if(ev.shotId&&rel[ev.shotId]){m.fgm++;if(ev.points===3)m.tpm++;}break;
     case'steal':m.steals++;m.tov++;break;
     case'interception':m.intercepts++;m.tov++;break;
     case'block':m.blocks++;break;
     case'rebound':m.rebounds++;if(ev.offensive)m.oreb++;break;
     case'foul':m.fouls++;break;
     case'inbound':lastInbound=i;break;
     case'outOfBounds':if(ev.playerId){m.tovOwn++;if(i-lastInbound<150)m.inboundOut++;}else m.looseOut++;break;
     case'violation':if(ev.kind==='out')break;m[ev.kind]=(m[ev.kind]||0)+1;m.tov++;break;
    }
   }
  }
  closePoss(S.tick);
  const sc=[S.teams[0].score,S.teams[1].score];m.points+=sc[0]+sc[1];m.scores.push(sc);
  if(sc[0]>sc[1])m.wins0++;m.diff0+=sc[0]-sc[1];m.diffAbs+=Math.abs(sc[0]-sc[1]);
 }
 m.tov+=m.tovOwn;m.out=m.tovOwn;const P=m.possessions;
 return {ai,profile,difficulty,mirror,games,seedBase,
  pace:{possessionsPerGame:r2(P/games,1),attackSeconds:r2(m.attackSec/P,1)},
  shooting:{fgPct:pct(m.fgm,m.fga),threePct:pct(m.tpm,m.tpa),fgaPerPoss:r2(m.fga/P),ptsPerPoss:r2(m.points/P),
   pointsPerTeamGame:r2(m.points/games/2,1),threeShare:pct(m.tpa,m.fga),
   mix:{close:pct(m.zones.close,m.fga),mid:pct(m.zones.mid,m.fga),three:pct(m.zones.three,m.fga)},types:m.shotTypes},
  passing:{passesPerPoss:r2(m.passes/P),passesBeforeShot:r2(m.passesBeforeShot/Math.max(1,m.shotPossessions)),pingPongPct:pct(m.pingPong,P),lateralPct:pct(m.lateralPass,m.passes),contestedLateralPct:pct(m.contestedLateral,m.passes)},
  turnovers:{tovPctOfPoss:pct(m.tov,P),steals:r2(m.steals/games),intercepts:r2(m.intercepts/games),travel:r2(m.travel/games),doubleDribble:r2(m.doubleDribble/games),out:r2(m.out/games),outAfterThrowIn:r2(m.inboundOut/games),looseBallOut:r2(m.looseOut/games),shotclock:r2(m.shotclock/games),backcourt:r2(m.backcourt/games),three:r2((m.three||0)/games)},
  defense:{blocksPerGame:r2(m.blocks/games),stealsPerGame:r2(m.steals/games)},
  rebounds:{perGame:r2(m.rebounds/games),offensivePct:pct(m.oreb,m.rebounds)},fouls:r2(m.fouls/games),
  decision:{avgHoldSec:r2(m.holdTicks/Math.max(1,m.holds)/60),holdOver4sPct:pct(m.holdList.filter(x=>x>4).length,m.holdList.length)},
  balance:{team0WinPct:pct(m.wins0,games),avgDiff0:r2(m.diff0/games,1),avgMargin:r2(m.diffAbs/games,1)},
  simSpeedX:Math.round(steps/((Date.now()-t0)/1000)/60)};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [games,ai,profile,out]=[+process.argv[2]||200,process.argv[3]||'v2',process.argv[4]||'quick',process.argv[5]];
 const r=simulate({games,ai,profile});console.log(JSON.stringify(r,null,1));if(out)writeFileSync(out,JSON.stringify(r,null,1));
}

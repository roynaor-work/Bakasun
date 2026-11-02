// v4 (02/11): the computer's passing needs a reason. Measured before this change (AI vs AI,
// 50 possessions, 8 seeds): 24% of passes were sideways or backward without pressure, 4.1
// passes per possession, the ball held 1.0 s on average, 0.89 points per possession.
// After: 11% / 3.2 / 1.45 s / 0.87 points per possession (scoring balance kept).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
import {passReason} from '../workout/island/minigames/hoops-ai.mjs';
const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;

test('pass reasons: advancing receivers, pressure, a dying clock, a clearly better look or a stuck probe; nothing else',()=>{
 const base={progress:0,role:null,receiverOpen:3,receiverShot:0.5,myShot:0.5,worth:1,pressure:0,hold:1,clock:18,backToPasser:false};
 assert.equal(passReason(base),null,'a free handler does not swing the ball sideways to an equal look');
 assert.equal(passReason({...base,progress:1.5}),'advance');assert.equal(passReason({...base,role:'cut'}),'advance');assert.equal(passReason({...base,role:'roll'}),'advance');
 assert.equal(passReason({...base,pressure:1,hold:0.3}),null,'a defender who just arrived is not yet a reason');
 assert.equal(passReason({...base,pressure:1,hold:0.8}),'pressure');assert.equal(passReason({...base,pressure:2,hold:0}),'pressure');
 assert.equal(passReason({...base,clock:3}),'clock');assert.equal(passReason({...base,clock:3,receiverOpen:1}),null);
 assert.equal(passReason({...base,receiverShot:1.2,myShot:0.5,worth:0.9}),'look');
 assert.equal(passReason({...base,receiverShot:1.2,myShot:0.5,worth:0.9,receiverOpen:1.5}),null,'a covered man is not a better look');
 assert.equal(passReason({...base,hold:3.5}),'stuck');assert.equal(passReason({...base,hold:2}),null);
 assert.equal(passReason({...base,progress:2,backToPasser:true}),null,'no ping-pong back to the passer while free');
 assert.equal(passReason({...base,progress:2,backToPasser:true,pressure:1,hold:1}),'advance','pressure allows the return pass');
});

function simulate({seed,possessions=50}){
 const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:'normal',autopilot:true});
 const s=e.debug.state,a=e.debug.api,court=a.court;
 const st={possessions:0,passes:0,lateral:0,hold:0};let lastPoss=null,ticks=0;
 while(st.possessions<possessions&&ticks<60*60*20){
  e.step(NO_INPUT);ticks++;if(s.possession!==lastPoss){lastPoss=s.possession;st.possessions++;}
  if(s.phase==='final'){s.phase='live';s.clock=600;}
  for(const ev of e.drainEvents()){
   if(ev.type!=='pass')continue;
   const p=a.byId(ev.playerId),q=a.byId(ev.targetId),side=a.side(p.team),dp=court.distToRim(side,p.x,p.z),dq=court.distToRim(side,q.x,q.z);
   const open=Math.min(...a.onCourt(1-p.team).map(o=>a.dist(o,p)));
   const progressive=dq<dp-1||q.role==='cut'||q.role==='roll'||q.role==='giveGo'||!court.frontcourt(side,p.x),pressured=open<1.1||s.shotClock<5;
   st.passes++;if(!progressive&&!pressured)st.lateral++;st.hold+=s.ball.dribbleT;
  }
 }
 return {lateralShare:st.lateral/Math.max(1,st.passes),passesPerPossession:st.passes/st.possessions,avgHold:st.hold/Math.max(1,st.passes),ppp:(s.teams[0].score+s.teams[1].score)/st.possessions,possessions:st.possessions};
}

test('simulation: over 50 possessions the computer throws far fewer free sideways passes, holds the ball longer, and scores about as before',()=>{
 for(const seed of [11,23,47]){
  const r=simulate({seed});
  assert.equal(r.possessions,50);
  assert.ok(r.lateralShare<0.16,`seed ${seed}: lateral share ${r.lateralShare.toFixed(2)} (was 0.22-0.26)`);
  assert.ok(r.passesPerPossession<4.3&&r.passesPerPossession>1,`seed ${seed}: passes per possession ${r.passesPerPossession.toFixed(2)} (was 4.2-4.5)`);
  assert.ok(r.avgHold>1.1,`seed ${seed}: the ball is held ${r.avgHold.toFixed(2)} s before a pass (was 0.9-1.0)`);
  assert.ok(r.ppp>0.5&&r.ppp<1.3,`seed ${seed}: points per possession ${r.ppp.toFixed(2)} stay in the pre-change band (0.80-0.96)`);
 }
});

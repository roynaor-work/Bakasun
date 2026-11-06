/** Headless full-match gameplay metrics for the island soccer model (no browser).
 * One match = the real `createSoccer` model on its fixed 60 Hz step. Team 0 is a
 * human proxy (`createHumanBot`: it drives the selected player the way a child
 * does, with a reaction delay) plus the model's own team-mate AI; team 1 is the
 * pure rival AI. Metrics are measured per team, so rival behaviour (no bot) and
 * team-0 behaviour (bot + AI mates) can be read separately.
 * Pure measurement: nothing here changes the model. */
import {createSoccer} from '../minigames/soccer.mjs';
import {hasShootingLane,selectTeamPass} from '../minigames/soccer-tactics.mjs';

const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

/** Deterministic child proxy. `latency` ticks of reaction delay on every command. */
export function createHumanBot(seed,{latency=9}={}){
  let n=(seed^0x9e3779b9)>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  const queue=[];let hold=0,shotCooldown=0,passCooldown=0,stealCooldown=0,decide=0;
  const blank=()=>({moveX:0,moveZ:0,kickHeld:false,passHeld:false,passPressed:false,sprintHeld:false,switchPlayer:false});
  return (game,dt,c)=>{
    const s=game.getState(),p=s.players[s.controlled],b=s.ball,hx=c.pitch.length/2,d=s.attackDir,goalX=d*hx,input=blank();
    shotCooldown-=dt;passCooldown-=dt;stealCooldown-=dt;decide-=dt;
    const opponents=s.players.filter(q=>q.team!==p.team&&q.role!=='keeper');
    let near=null,nearD=Infinity;for(const q of opponents){const m=dist(q,p);if(m<nearD){nearD=m;near=q;}}
    const steer=(tx,tz)=>{const dx=tx-p.x,dz=tz-p.z,l=Math.hypot(dx,dz)||1;input.moveX=dx/l;input.moveZ=dz/l;};
    if(s.phase==='playing'||s.phase==='restartReady'){
      if(b.owner===p.id&&!p.hands){
        // Carry toward goal, swerving away from a defender that is close ahead.
        let tx=goalX,tz=clamp(-p.z*.35,-3,3);
        if(near&&nearD<4&&(near.x-p.x)*d>-1){tz=p.z+(p.z>=near.z?1:-1)*5;tx=p.x+d*6;}
        steer(tx,tz);input.sprintHeld=nearD>4.5;
        const range=Math.abs(goalX-p.x);
        if(hold>0){hold-=dt;input.kickHeld=hold>0;}
        else if(shotCooldown<=0&&range<11&&Math.abs(p.z)<8&&hasShootingLane(p,s,c)&&random()<.6){hold=.25+random()*.25;shotCooldown=3;input.kickHeld=true;}
        else if(passCooldown<=0&&decide<=0&&nearD<3.2){
          const mate=selectTeamPass(p,s,c);
          if(mate){steer(mate.x,mate.z);input.passPressed=true;passCooldown=.9;}
          decide=.25;
        }
      }else if(b.owner!==null&&s.players[b.owner].team===p.team){
        // Support: go to the team's tactical spot, as a child follows the play.
        const t=game.tacticalTarget(p);steer(t.x,t.z);input.sprintHeld=dist(p,t)>6;
      }else{
        // Loose ball or rival has it: chase and tap the pass button to tackle.
        steer(b.x+(b.vx||0)*.25,b.z+(b.vz||0)*.25);input.sprintHeld=dist(p,b)>4;
        if(b.owner!==null&&dist(p,b)<c.steal.reach&&stealCooldown<=0){input.passPressed=true;stealCooldown=1.1;}
      }
    }
    queue.push(input);
    return queue.length>latency?queue.shift():blank();
  };
}

/** Role anchor used to measure how far a player strays from his job: kickoff depth
 * pulled halfway toward the ball, lane from the tactics table. A convention, not model state. */
function anchor(p,s,c){
  const role=Math.max(0,c.players.roles.indexOf(p.role)),d=s.attackDir*(p.team===0?1:-1),hx=c.pitch.length/2,hz=c.pitch.width/2;
  const x=clamp(d*c.ai.kickoffX[role]+s.ball.x*.5,-hx+2,hx-2);
  return {x,z:clamp(c.tactics.lanes[role]*d,-hz+1.5,hz-1.5)};
}
const makeTeam=()=>({
  possessionTicks:0,passes:0,passDone:0,passOther:0,passIntercepted:0,passOut:0,passLoft:0,
  shots:0,shotsOnTarget:0,goals:0,shotDistance:0,tackles:0,turnoversLoose:0,restarts:{throwIn:0,corner:0,goalKick:0},
  anchorSum:0,anchorN:0,farFromRole:0,pressSum:0,pressN:0,multiPress:0,carrierPressureSum:0,carrierPressureN:0,
  headers:0,clearances:0,posts:0,saves:0,heavy:0,shotsCtrl:0,shotsMate:0,shotsFar:0,spells:0,spellTicks:0,spellPasses:0,spellBuilt:0,stillN:0,stillOff:0,offN:0,lenSum:0,widSum:0,shapeN:0,crowdN:0,crowdPairs:0,coverSum:0,coverN:0,unmarked:0,unmarkedN:0
});
const blankInput=()=>({moveX:0,moveZ:0,kickHeld:false,passHeld:false,passPressed:false,sprintHeld:false,switchPlayer:false});
/** bot 'idle' = no input at all; with help (stage rows forced to help:true, difficulty easy) the model's own
 * beginner helper drives the selected player, so both sides are pure model AI. */
export function playMatch({config,seed,stage=5,difficulty='normal',ai,latency=9,maxSeconds=400,bot:botKind='human',helpAll=false,trace=false}){
  const shotLog=[];let openShot=null;
  if(helpAll)config={...config,stages:config.stages.map(row=>({...row,help:true}))};
  const game=createSoccer({config,seed,stage,difficulty,role:'field',...(ai?{aiVersion:ai}:{})}),bot=botKind==='idle'?()=>blankInput():createHumanBot(seed,{latency});
  const step=config.match.fixedStep,hx=config.pitch.length/2,L=config.pitch.length;
  const T=[makeTeam(),makeTeam()];
  const m={playingTicks:0,deadTicks:0,restTicks:0,stuckWindows:0,windows:0,maxStuck:0,thirds:[0,0,0],swings:0,progress10:0,progressN:0,coverage:0,coverageN:0,
    switches:0,autoSwitches:0,autoPingPong:0,pingPong:0,switchCorrect:0,switchJudged:0,mismatchTicks:0,defTicks:0,mismatchRun:0,mismatchRuns:[],roleTicks:{},ownerControlledTicks:0,
    touchToMove:[],manualSwitchLag:[],halves:0,restartTicks:0,eventsPlayed:0};
  let lastTeam0Event=-9;let restartAt=null;const restartDur={};let prevControlledForShot=game.getState().controlled;let spell=null;let edgeRun=0,maxEdgeRun=0,cornerTicks=0;let pending=null,pendingShot=null,prevOwner=null,lastHolderTeam=null,prevControlled=game.getState().controlled,zone=null,lastSwitchAt=-9,lastSwitchFrom=null,pendingSwitchJudge=null;
  let winStart=null,winX=0,winZ=0,winT=0,xMin=Infinity,xMax=-Infinity,covT=0,restT=0,stuckRun=0,sampleN=0,progAnchor=null;
  let touch=null;
  let elapsed=0;
  while(!game.result&&elapsed<maxSeconds){
    const s=game.getState();prevControlledForShot=s.controlled;game.update(step,bot(game,step,config));elapsed+=step;
    const cur=game.getState(),b=cur.ball;
    for(const e of game.drainEvents()){
      if((e.type==='pass'||e.type==='loft'||e.type==='possession'||e.type==='restart'||e.type==='throw')&&(e.team===0||e.type==='possession'))lastTeam0Event=elapsed;
      if(e.type==='pass'||e.type==='loft'){const t=T[e.team];t.passes++;if(spell&&spell.team===e.team)spell.passes++;if(e.type==='loft')t.passLoft++;pending={team:e.team,player:e.player,target:e.target};}
      else if(e.type==='shot'&&!e.punt){const t=T[e.team];t.shots++;const shooter=cur.players[e.player];if(shooter){const dd=Math.abs(cur.attackDir*(e.team===0?1:-1)*hx-shooter.x);t.shotDistance+=dd;if(dd>config.pitch.penaltyDepth+config.pitch.penaltySpot+6)t.shotsFar++;}if(e.team===0&&e.player===prevControlledForShot)t.shotsCtrl++;else t.shotsMate++;pendingShot={team:e.team};pending=null;if(trace){openShot={team:e.team,player:e.player,dist:shooter?Math.abs(cur.attackDir*(e.team===0?1:-1)*hx-shooter.x):null,z:shooter?shooter.z:null,power:e.power,assisted:e.assisted,outcome:'miss',t:elapsed};shotLog.push(openShot);}}
      else if(e.type==='goal'){if(openShot)openShot.outcome='goal';T[e.team].goals++;if(pendingShot&&pendingShot.team===e.team){T[e.team].shotsOnTarget++;pendingShot=null;}if(pending)pending=null;}
      else if(e.type==='post'){if(openShot)openShot.outcome='post';if(pendingShot){T[pendingShot.team].posts++;T[pendingShot.team].shotsOnTarget++;pendingShot=null;}}
      else if(e.type==='header'){T[e.team].headers++;}
      else if(e.type==='heavy-touch'){T[e.team].heavy++;}
      else if(e.type==='clearance'){T[e.team].clearances++;}
      else if(e.type==='restart'){
        restartAt={t:elapsed,type:e.restart};
        if(pending){T[pending.team].passOut++;pending=null;}pendingShot=null;
        if(e.restart in T[0].restarts)T[e.team].restarts[e.restart]++;
      }
      else if(e.type==='possession'){
        const q=cur.players[e.player];
        if(pending){
          if(e.team===pending.team){if(e.player===pending.target)T[pending.team].passDone++;else if(e.player!==pending.player){T[pending.team].passOther++;}}
          else T[pending.team].passIntercepted++;
          pending=null;
        }
        if(pendingShot){
          if(e.team!==pendingShot.team&&q.role==='keeper'){T[pendingShot.team].shotsOnTarget++;T[e.team].saves++;if(openShot)openShot.outcome='save';}
          pendingShot=null;
        }
        if(lastHolderTeam!==null&&lastHolderTeam!==e.team){if(prevOwner!==null)T[e.team].tackles++;else T[e.team].turnoversLoose++;}
        lastHolderTeam=e.team;
        if(!spell||spell.team!==e.team){if(spell){T[spell.team].spells++;T[spell.team].spellTicks+=spell.ticks;T[spell.team].spellPasses+=spell.passes;if(spell.passes>=3)T[spell.team].spellBuilt++;}spell={team:e.team,ticks:0,passes:0};}
        if(e.team===0&&e.player===cur.controlled)touch={t:elapsed,v:Math.hypot(q.vx,q.vz)};
      }
      else if(e.type==='steal'||e.type==='slide-contact'){/* counted through possession change */}
      else if(e.type==='switch'){m.manualSwitchLag.push(0);}
    }
    prevOwner=b.owner;
    // Selection tracking (any phase, but judged while playing).
    if(cur.controlled!==prevControlled){
      if(cur.phase==='playing'){m.switches++;const auto=elapsed-lastTeam0Event>0.6;if(auto){m.autoSwitches++;if(lastSwitchFrom===cur.controlled&&elapsed-lastSwitchAt<1.5)m.autoPingPong++;}
      if(lastSwitchFrom===cur.controlled&&elapsed-lastSwitchAt<1.5)m.pingPong++;}
      if(cur.phase==='playing'){pendingSwitchJudge={t:elapsed,id:cur.controlled};}
      lastSwitchAt=elapsed;lastSwitchFrom=prevControlled;prevControlled=cur.controlled;
    }
    if(pendingSwitchJudge&&elapsed-pendingSwitchJudge.t>=1.5){
      let best=null,bd=Infinity;for(const q of cur.players)if(q.team===0&&q.role!=='keeper'){const m2=dist(q,b);if(m2<bd){bd=m2;best=q;}}
      const mine=cur.players[pendingSwitchJudge.id];m.switchJudged++;
      if(best&&(best.id===mine.id||dist(mine,b)<=bd+1.5||b.owner===mine.id))m.switchCorrect++;
      pendingSwitchJudge=null;
    }
    if(cur.phase==='playing'&&restartAt){(restartDur[restartAt.type]||(restartDur[restartAt.type]=[])).push(elapsed-restartAt.t);restartAt=null;}
    if(cur.phase!=='playing'){touch=null;continue;}
    m.playingTicks++;
    const owner=b.owner===null?null:cur.players[b.owner],team=owner?owner.team:b.lastTeam;
    T[team].possessionTicks++;if(spell&&spell.team===team)spell.ticks++;
    {const nearEdge=Math.abs(b.z)>config.pitch.width/2-2.2||Math.abs(b.x)>hx-2.2;edgeRun=nearEdge?edgeRun+step:0;maxEdgeRun=Math.max(maxEdgeRun,edgeRun);if(Math.abs(b.x)>hx-4&&Math.abs(b.z)>config.pitch.width/2-4)cornerTicks++;}
    const me=cur.players[cur.controlled];
    m.roleTicks[me.role]=(m.roleTicks[me.role]||0)+1;
    if(b.owner===cur.controlled)m.ownerControlledTicks++;
    if(touch){
      const d=cur.attackDir;const v=me.vx*d;
      if(elapsed-touch.t>2||v>=0.6*config.players.speed){m.touchToMove.push(Math.min(2,elapsed-touch.t));touch=null;}
    }
    // Dead ball: loose, nobody closing on it.
    if(!owner&&!b.flight){
      let closing=0;for(const q of cur.players){const dx=b.x-q.x,dz=b.z-q.z,l=Math.hypot(dx,dz)||1;closing=Math.max(closing,(dx*q.vx+dz*q.vz)/l);}
      if(closing<1.2)m.deadTicks++;
      if(Math.hypot(b.vx,b.vz)<.5)m.restTicks++;
    }
    // Defensive mismatch: team 0 without the ball, controlled not the closest field player.
    if(team!==0||(owner&&owner.team!==0)){
      m.defTicks++;let bd=Infinity;for(const q of cur.players)if(q.team===0&&q.role!=='keeper'&&!(q.recover>0))bd=Math.min(bd,dist(q,b));
      if(dist(me,b)>bd+1.5){m.mismatchTicks++;m.mismatchRun+=step;}else if(m.mismatchRun>0){m.mismatchRuns.push(m.mismatchRun);m.mismatchRun=0;}
    }else if(m.mismatchRun>0){m.mismatchRuns.push(m.mismatchRun);m.mismatchRun=0;}
    // Ball progression.
    const xn=b.x*cur.attackDir;
    const third=xn<-L/6?0:xn>L/6?2:1;m.thirds[third]++;
    if(zone===2&&third===0)m.swings++;if(zone===0&&third===2)m.swings++;if(third!==1)zone=third;
    xMin=Math.min(xMin,xn);xMax=Math.max(xMax,xn);covT+=step;
    if(covT>=20){m.coverage+=(xMax-xMin)/L;m.coverageN++;xMin=Infinity;xMax=-Infinity;covT=0;}
    // Stuck windows: 4 s with the ball inside a 3 m circle.
    if(winStart===null){winStart={x:b.x,z:b.z};winT=0;}
    winT+=step;if(winT>=4){m.windows++;if(Math.hypot(b.x-winStart.x,b.z-winStart.z)<3)m.stuckWindows++;winStart=null;}
    stuckRun=(progAnchor&&Math.hypot(b.x-progAnchor.x,b.z-progAnchor.z)<5)?stuckRun+step:0;if(!progAnchor||stuckRun===0)progAnchor={x:b.x,z:b.z};m.maxStuck=Math.max(m.maxStuck,stuckRun);
    // Every 6th tick: shape metrics.
    if(Math.round(elapsed/step)%6===0){
      sampleN++;
      for(const t of [0,1]){
        let pressing=0;
        for(const q of cur.players){
          if(q.team!==t||q.role==='keeper')continue;
          if(q.id===cur.controlled&&t===0)continue;
          const a=anchor(q,cur,config);
          if(q.duty!=='press'&&q.id!==b.owner){const dd=dist(q,a);T[t].anchorSum+=dd;T[t].anchorN++;if(dd>13)T[t].farFromRole++;}
          if(q.duty==='press')pressing++;
        }
        {const mates=cur.players.filter(q=>q.team===t&&q.role!=='keeper'),d=cur.attackDir*(t===0?1:-1);
          let mnx=Infinity,mxx=-Infinity,mnz=Infinity,mxz=-Infinity;
          for(const q of mates){mnx=Math.min(mnx,q.x);mxx=Math.max(mxx,q.x);mnz=Math.min(mnz,q.z);mxz=Math.max(mxz,q.z);}
          T[t].lenSum+=mxx-mnx;T[t].widSum+=mxz-mnz;T[t].shapeN++;
          for(let i=0;i<mates.length;i++)for(let j=i+1;j<mates.length;j++){T[t].crowdN++;if(dist(mates[i],mates[j])<2.2)T[t].crowdPairs++;}
          if(owner&&owner.team===t){for(const q of mates){if(q.id===owner.id||(t===0&&q.id===cur.controlled))continue;T[t].offN++;if(Math.hypot(q.vx,q.vz)<.3)T[t].stillOff++;}}
          if(owner&&owner.team!==t){let side=0;for(const q of mates)if(q.x*d<b.x*d-.5)side++;T[t].coverSum+=side;T[t].coverN++;
            // danger: rival attackers within 18 m of our goal with no defender inside 3 m
            const goalX=-d*hx;for(const r of cur.players){if(r.team===t||r.role==='keeper'||r.id===owner.id)continue;if(Math.abs(r.x-goalX)>18)continue;T[t].unmarkedN++;let marked=false;for(const q of mates)if(dist(q,r)<3){marked=true;break;}if(!marked)T[t].unmarked++;}}
        }
        if(owner&&owner.team!==t){T[t].pressSum+=pressing;T[t].pressN++;if(pressing>=2)T[t].multiPress++;}
        if(owner&&owner.team===t&&owner.role!=='keeper'){let nd=Infinity;for(const q of cur.players)if(q.team!==t&&q.role!=='keeper')nd=Math.min(nd,dist(q,owner));T[t].carrierPressureSum+=nd;T[t].carrierPressureN++;}
      }
    }
  }
  if(m.mismatchRun>0)m.mismatchRuns.push(m.mismatchRun);
  const secs=m.playingTicks*step,out={seed,stage,seconds:elapsed,playingSeconds:secs};
  const flat=(t,i)=>{const o=T[1-i];return {
    goals:t.goals,shots:t.shots,shotsOnTarget:t.shotsOnTarget,shotDistance:t.shots?t.shotDistance/t.shots:null,
    passes:t.passes,passCompletion:t.passes?t.passDone/t.passes:null,passUnintended:t.passes?t.passOther/t.passes:null,passIntercepted:t.passes?t.passIntercepted/t.passes:null,passOut:t.passes?t.passOut/t.passes:null,
    passDoneCount:t.passDone,passInterceptedCount:t.passIntercepted,passOutCount:t.passOut,passOtherCount:t.passOther,loft:t.passLoft,
    possession:m.playingTicks?t.possessionTicks/m.playingTicks:0,tackles:t.tackles,looseWins:t.turnoversLoose,
    throwIns:t.restarts.throwIn,corners:t.restarts.corner,goalKicks:t.restarts.goalKick,
    anchorDist:t.anchorN?t.anchorSum/t.anchorN:null,farFromRole:t.anchorN?t.farFromRole/t.anchorN:null,
    pressers:t.pressN?t.pressSum/t.pressN:null,multiPress:t.pressN?t.multiPress/t.pressN:null,carrierPressure:t.carrierPressureN?t.carrierPressureSum/t.carrierPressureN:null,
    headers:t.headers,clearances:t.clearances,posts:t.posts,saves:t.saves,heavyTouches:t.heavy,
    shotsCtrl:t.shotsCtrl,shotsMate:t.shotsMate,shotsFar:t.shotsFar,conversion:t.shots?t.goals/t.shots:null,saveRate:(t.saves+o.goals)?t.saves/(t.saves+o.goals):null,saves:t.saves,conceded:o.goals,
    spells:t.spells,spellSeconds:t.spells?t.spellTicks*step/t.spells:null,passesPerSpell:t.spells?t.spellPasses/t.spells:null,builtSpells:t.spells?t.spellBuilt/t.spells:null,
    stillOffBall:t.offN?t.stillOff/t.offN:null,teamLength:t.shapeN?t.lenSum/t.shapeN:null,teamWidth:t.shapeN?t.widSum/t.shapeN:null,crowd:t.crowdN?t.crowdPairs/t.crowdN:null,
    goalSideCover:t.coverN?t.coverSum/t.coverN:null,unmarkedThreat:t.unmarkedN?t.unmarked/t.unmarkedN:null
  };};
  out.team=[flat(T[0],0),flat(T[1],1)];out.restartDur=Object.fromEntries(Object.entries(restartDur).map(([k,v])=>[k,{n:v.length,mean:v.reduce((a,b)=>a+b,0)/v.length}]));
  const sorted=[...m.mismatchRuns].sort((a,b)=>a-b),q=(arr,f)=>arr.length?arr[Math.min(arr.length-1,Math.floor(arr.length*f))]:null;
  const t2m=[...m.touchToMove].sort((a,b)=>a-b);
  out.game={
    totalGoals:T[0].goals+T[1].goals,totalShots:T[0].shots+T[1].shots,
    deadBall:secs?m.deadTicks*step/secs:0,restBall:secs?m.restTicks*step/secs:0,
    stuckWindows:m.windows?m.stuckWindows/m.windows:0,maxStuckSeconds:m.maxStuck,
    thirdAttack:secs?m.thirds[2]/m.playingTicks:0,thirdMid:m.playingTicks?m.thirds[1]/m.playingTicks:0,thirdDefend:m.playingTicks?m.thirds[0]/m.playingTicks:0,
    swings:m.swings,coverage:m.coverageN?m.coverage/m.coverageN:null,
    switchesPerMinute:secs?m.switches/(secs/60):0,autoSwitchesPerMinute:secs?m.autoSwitches/(secs/60):0,autoPingPong:m.autoPingPong,pingPong:m.pingPong,switchAccuracy:m.switchJudged?m.switchCorrect/m.switchJudged:null,
    mismatchShare:m.defTicks?m.mismatchTicks/m.defTicks:0,mismatchP90:q(sorted,.9),mismatchMedian:q(sorted,.5),
    touchToMoveMedian:q(t2m,.5),touchToMoveP90:q(t2m,.9),
    maxEdgeRun,cornerShare:secs?cornerTicks*step/secs:0,nonPlaySeconds:elapsed-secs,transitionsPerMinute:secs?(T[0].spells+T[1].spells)/(secs/60):0,controlledOwner:m.playingTicks?m.ownerControlledTicks/m.playingTicks:0,controlledRoles:Object.fromEntries(Object.entries(m.roleTicks).map(([k,v])=>[k,v/m.playingTicks]))
  };
  if(trace)out.shotLog=shotLog;
  return out;
}

const mean=a=>{const v=a.filter(x=>x!==null&&x!==undefined&&Number.isFinite(x));return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
const pct=(a,f)=>{const v=a.filter(x=>x!==null&&Number.isFinite(x)).sort((x,y)=>x-y);return v.length?v[Math.min(v.length-1,Math.floor(v.length*f))]:null;};
/** Mean of every numeric metric across matches (+ p10/p90 for the headline ones). */
export function summarize(results){
  const out={matches:results.length,team:[{},{}],game:{}};
  for(const i of [0,1])for(const k of Object.keys(results[0].team[i]))out.team[i][k]=mean(results.map(r=>r.team[i][k]));
  for(const k of Object.keys(results[0].game)){if(k==='controlledRoles')continue;out.game[k]=mean(results.map(r=>r.game[k]));}
  out.game.controlledRoles={};for(const role of new Set(results.flatMap(r=>Object.keys(r.game.controlledRoles))))out.game.controlledRoles[role]=mean(results.map(r=>r.game.controlledRoles[role]||0));
  out.spread={
    totalGoals:{p10:pct(results.map(r=>r.game.totalGoals),.1),p90:pct(results.map(r=>r.game.totalGoals),.9),zeroGoal:results.filter(r=>r.game.totalGoals===0).length/results.length,inRange:results.filter(r=>r.game.totalGoals>=2&&r.game.totalGoals<=5).length/results.length},
    totalShots:{p10:pct(results.map(r=>r.game.totalShots),.1),p90:pct(results.map(r=>r.game.totalShots),.9)},
    maxStuckSeconds:{p90:pct(results.map(r=>r.game.maxStuckSeconds),.9)}
  };
  out.restartDur={};for(const k of ['goalKick','throwIn','corner'])out.restartDur[k]={n:mean(results.map(r=>r.restartDur[k]?.n||0)),mean:mean(results.filter(r=>r.restartDur[k]).map(r=>r.restartDur[k].mean))};
  out.seconds=mean(results.map(r=>r.seconds));
  return out;
}

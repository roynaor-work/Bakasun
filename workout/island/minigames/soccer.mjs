import {rosterCards} from '../activity/soccer-roster.mjs?v=island-ski-20261031-1';
import {inPenaltyArea,keeperSaveChance,rollBall,stealApproach} from './soccer-physics.mjs?v=island-ski-20261031-1';
import {cardEffects} from '../activity/soccer-card.mjs?v=island-ski-20261031-1';
import {pitchCrossing,goalFrameContact} from './soccer-boundary.mjs?v=island-ski-20261031-1';
import {fieldTarget,separatePlayers,selectTeamPass,keeperTarget,hasShootingLane,teamPassPoint,passLaneClearance} from './soccer-tactics.mjs?v=island-ski-20261031-1';
import {shotLift,safeShotAim} from './soccer-shot.mjs?v=island-ski-20261031-1';
import {campaignConfig,createCampaignStats,recordCampaignEvent,leagueMatch} from './soccer-campaign.mjs?v=island-ski-20261031-1';
import {assistedPassDestination,selectControlledPlayer,canContactBall,receiveBallMotion,followDribbleBall} from './soccer-assistance.mjs?v=island-ski-20261031-1';
import {loftDestination,safeLoftPoint,createLoftFlight,stepLoftBall} from './soccer-loft.mjs';
import {createRestartLayout,restartTarget,restartActionProfile,sampleRestartAction,restartBallPose,restartThrowTarget,createKeeperThrowFlight} from './soccer-restarts.mjs';
// Pure simulation. No browser, Three.js, storage, wall clock or Math.random.
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const finite = n => Number.isFinite(n) ? n : 0;
export function seededRandom(seed) {
  let n = Number(seed) >>> 0;
  return () => { n += 0x6D2B79F5; let t=n; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
}
export function matchResult({score,stage,seed,elapsed,difficulty}) {
  const [goalsFor,goalsAgainst]=score, won=goalsFor>goalsAgainst;
  return {won,goalsFor,goalsAgainst,stage,stars:won && goalsAgainst===0 ? 3 : won && goalsFor-goalsAgainst>=2 ? 2 : 1,seed,difficulty,durationSeconds:Math.round(elapsed*1000)/1000};
}
export function opponentSettings(config,stage,difficulty) {
  // A league match may sit between two tuned stages: interpolate their rows.
  const at=Math.min(config.stages.length,Math.max(1,finite(stage)||1)),lo=Math.floor(at),hi=Math.min(config.stages.length,lo+1),f=at-lo,A=config.stages[lo-1],B=config.stages[hi-1];
  const original=f?Object.fromEntries(Object.entries(A).map(([k,v])=>[k,typeof v==='number'&&typeof B[k]==='number'?v+(B[k]-v)*f:v])):A,factors=config.difficulties[difficulty];
  if(typeof difficulty!=='string'||!Object.hasOwn(config.difficulties,difficulty))throw Error('Invalid soccer difficulty');
  const scaled={...original};
  for(const key of ['speed','stealRate','accuracy','keeper','tackleReach'])scaled[key]*=factors[key];
  scaled.thinkSeconds/=factors.thinkSeconds;
  return scaled;
}
/** A quick pass leads a teammate; a held pass is a manually aimed cross. */
export function passDestination(state,config,power=0){
 return power*config.passing.chargeSeconds>=config.passing.loftThresholdSeconds?loftDestination(state,config,power):assistedPassDestination(state,config,power);
}
export function soccerPassAim(state){return state.passAim?.manual?state.passAim:state.moving?state.aim:state.passAim||state.aim;}
export function canHead(player,ball,config){return canContactBall(player,ball,config,{kind:'head'});}
export function createSoccer({config,seed=1,stage=1,team=config.team,random,difficulty='normal',card,role='field',league=false}={}) {
  if (!config?.stages?.length || !Number.isFinite(config.match?.fixedStep) || config.match.fixedStep<=0) throw Error('Invalid soccer config');
  seed=Number(seed)>>>0; stage=clamp(Math.round(finite(stage))||1,1,30);const leagueStage=stage,ladder=league?leagueMatch(config,stage):null;if(ladder?.leagues)stage=clamp(finite(ladder.tuning)||1,1,30);config=campaignConfig(config,stage);
  const attack=config.ai.attack[difficulty];
  const rng=random || seededRandom(seed), opponent=opponentSettings(config,stage,difficulty), ph=config.physics,effects=cardEffects(card,config);
  // League keepers rise match by match, even when a new league restarts the field tuning lower.
  if(Number.isFinite(ladder?.keeper))opponent.keeper=ladder.keeper;
  const hx=config.pitch.length/2,hz=config.pitch.width/2,step=config.match.fixedStep,aiConfig=config.ai,rules=config.rules;
  const keeperThrowLead=Math.ceil(restartActionProfile('keeperThrow').contact/step-1e-8)*step;
  // Preserve the original six IDs; the two wings extend the roster at IDs 6/7.
  const cards=rosterCards(config,team,card,stage,difficulty);
  const players=config.players.roster.map((entry,i)=>{
    const template=entry.team===0?(team.players?.[entry.template]||config.team.players[entry.template]):config.opponentDefaults;
    const rank=key=>clamp(Math.round(finite(template[key]))||1,1,5);
    return {card:cards[i],hands:false,diveTime:0,diveCooldown:0,throwTime:0,catchTime:0,id:i,templateId:entry.team===0?template.id:`opponent${entry.template}`,team:entry.team,role:entry.role,x:0,z:0,vx:0,vz:0,fx:entry.team===0?1:-1,fz:0,speed:rank('speed'),kick:rank('kick'),guard:rank('guard'),cooldown:0,kickTime:0,request:false,think:0,hold:0,slideTime:0,recover:0,slideCooldown:0,stealCooldown:0,stealTime:0,headerTime:0,autoHeadTime:0,turnLean:0,slideAttempted:false,slideWon:false,slideX:0,slideZ:0,sprinting:false,sprintTime:0,sprintRest:0};
  });
  const s={role,league:ladder?.leagues?ladder:null,campaign:config.campaign,campaignStats:createCampaignStats(),bufferedAction:null,selectionTime:0,switchCooldown:0,actionAim:null,phase:'playing',half:1,halfElapsed:0,elapsed:0,phaseTime:0,score:[0,0],stage:leagueStage,seed,difficulty,mode:'attack',aim:{x:1,z:0},sprint:{value:config.sprint.capacity*effects.capacity,capacity:config.sprint.capacity*effects.capacity,active:false,locked:false,regenDelay:0},attackDir:1,controlled:0,players,ball:{x:0,z:0,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0,lastTeam:0,lastPlayer:0,grace:0},charge:0,charging:false,chargeKind:null,idle:0,defenseIdle:0,autoSwitchCandidate:null,passTarget:null,restart:null,event:null,eventId:0,result:null};
  let events=[],rivalPasses=0,nextRivalShot=0,nextHomeShot=0;
  const before={valid:false,players:[],ball:[0,0,0]};
  const shown={players:[],ball:{},state:{}};
  function remember(){const P=before.players;for(let i=0;i<s.players.length;i++){const p=s.players[i],b=P[i]||(P[i]=[0,0,0,0]);b[0]=p.x;b[1]=p.z;b[2]=p.fx;b[3]=p.fz;}P.length=s.players.length;before.ball[0]=s.ball.x;before.ball[1]=s.ball.y;before.ball[2]=s.ball.z;before.valid=true;}
  let tickCount=0,accumulator=0,held=false,previousSwitch=false,pendingSwitch=false,previousKick=false,pendingRelease=false,previousPass=false,pendingPass=false,pendingSlide=false,pendingKick=false,previousPassHeld=false,pendingPassStart=false,pendingPassRelease=false;
  let rawKickHeld=false,rawPassHeld=false,consumedKick=false,consumedPass=false;
  function consumeHeldActions(){consumedKick=consumedKick||rawKickHeld;consumedPass=consumedPass||rawPassHeld;}
  function event(type,extra={}) { s.event={id:++s.eventId,type,...extra};recordCampaignEvent(s.campaignStats,s.event,s);events.push(s.event);if(events.length>256)events.shift(); }
  function direction(teamId) { return s.attackDir*(teamId===0?1:-1); }
  // Card effects never change inside a match: one object per card instead of two allocations per call per tick.
  const personalCache=new Map();
  function personal(p){let e=personalCache.get(p.card);if(!e){e=cardEffects({attributes:{power:p.card.shot,pace:p.card.pace,accuracy:p.card.pass,defense:p.card.defense}},config);personalCache.set(p.card,e);}return e;}
  function positionKickoff(teamId=0) {
    rivalPasses=0;
    for (const p of players) {
      const d=direction(p.team),role=config.players.roles.indexOf(p.role);
      p.x=d*aiConfig.kickoffX[role];p.z=role===1?(p.team===0?-1:1)*aiConfig.kickoffZ:role===3?(p.team===0?1:-1)*aiConfig.kickoffZ:0;p.vx=p.vz=0;p.fx=d;p.fz=0;p.hold=0;p.think=aiConfig.initialThink;p.cooldown=aiConfig.initialCooldown;p.sprinting=false;p.sprintTime=p.sprintRest=0;
      p.restartMotion=p.distribution=null;
      p.hands=false;p.autoHeadTime=0;p.diveTime=p.diveCooldown=p.throwTime=p.catchTime=0;p.slideTime=p.recover=p.headerTime=p.kickTime=p.stealTime=p.turnLean=0;p.slideAttempted=p.slideWon=false;
    }
    const owner=players.find(p=>p.team===teamId&&p.role==='striker');owner.x=-direction(teamId)*aiConfig.kickoffOwnerX;owner.z=0;
    Object.assign(s.ball,{thrower:null,shot:null,flight:null,x:0,z:0,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:owner.id,lastTeam:teamId,lastPlayer:owner.id,grace:aiConfig.kickoffGrace});
    clearInput();s.idle=0;s.defenseIdle=0;s.autoSwitchCandidate=null;s.passTarget=null;if(teamId===0&&role!=='keeper')s.controlled=owner.id;if(role==='keeper')s.controlled=2;
  }
  positionKickoff();
  function nearest(teamId,point,exclude=-1,fieldOnly=false) {
    let best=null,bestDistance=Infinity;
    for(const p of players) if(p.team===teamId && p.id!==exclude && (!fieldOnly||p.role!=='keeper')) {const d=distance(p,point);if(d<bestDistance){best=p;bestDistance=d;}}
    return best;
  }
  function passTarget(p) {
    return selectTeamPass(p,s,config)||nearest(p.team,p,p.id);
  }
  function kick(p,power=0,pass=false,forceLoft=false,release=false) {
    if(s.ball.owner!==p.id || p.cooldown>0)return;
    if(p.distribution)return;
    if(p.hands&&!release){
      const kind=pass?'keeperThrow':'keeperPunt';
      p.distribution={power,pass,forceLoft,aim:{...s.aim},passAim:s.passAim?{...s.passAim}:null,kickAim:s.kickAim?{...s.kickAim}:null,moving:s.moving};
      const manual=p.id===s.controlled,active=manual?(pass?s.passAim:s.kickAim):null,mate=!manual&&pass?passTarget(p):null;
      const aim=active?.manual?active:mate?{x:mate.x-p.x,z:mate.z-p.z}:manual?s.aim:{x:p.fx,z:p.fz},length=Math.hypot(aim.x,aim.z)||1;
      p.fx=aim.x/length;p.fz=aim.z/length;p.restartMotion=sampleRestartAction(kind,0);p.vx=p.vz=0;
      if(p.id===s.controlled){consumeHeldActions();s.charging=false;s.charge=0;s.chargeKind=null;}
      event('distribution-windup',{player:p.id,team:p.team,kind});return;
    }
    const d=direction(p.team),manual=p.id===s.controlled||s.restart?.player===p.id&&p.team===0,skill=personal(p);let tx,tz,target=null,assisted=false,destination=null;
    const action=manual?(pass?s.passAim:s.kickAim):null;
    const inward={x:d*(hx-config.pitch.penaltyDepth/2)-s.ball.x,z:-s.ball.z},length=Math.hypot(inward.x,inward.z)||1;
    const rawAim=pass&&manual&&!forceLoft?soccerPassAim(s):forceLoft?{x:inward.x/length,z:inward.z/length}:action&&(action.manual||pass)?action:manual?s.aim:{x:p.fx,z:p.fz};
    const aim=pass||!manual?rawAim:safeShotAim(rawAim,action,d,power,config);
    if(pass) {
      if(p.team===1)rivalPasses++;

      if(manual||forceLoft){const context={...s,controlled:p.id,aim};destination=forceLoft?loftDestination(context,config,power,{aim}):passDestination(context,config,power);target=players[destination.target];tx=destination.x;tz=destination.z;}
      else{
        target=passTarget(p);const point=target?teamPassPoint(target,config):{x:s.ball.x+aim.x,z:s.ball.z+aim.z};tx=point.x;tz=point.z;
        destination={distance:Math.hypot(tx-s.ball.x,tz-s.ball.z),kind:'ground'};
        s.passTarget=target?{player:target.id,x:tx,z:tz,startX:s.ball.x,startZ:s.ball.z,distance:destination.distance,time:config.passing.runSeconds,kind:'ground'}:null;
      }
      if(manual||forceLoft)s.passTarget=target?{player:target.id,x:tx,z:tz,startX:s.ball.x,startZ:s.ball.z,distance:destination.distance,time:config.passing.runSeconds,kind:destination.kind}:null;
      event(destination?.kind==='loft'?'loft':'pass',{team:p.team,player:p.id,target:target?.id??null,x:tx,z:tz,distance:destination?.distance??null,power});
    } else {
      const goalX=d*hx,gx=goalX-s.ball.x,gz=-s.ball.z;
      const angle=Math.acos(clamp((gx*aim.x+gz*aim.z)/(Math.hypot(gx,gz)||1),-1,1));
      assisted=manual&&!action?.manual&&p.x*d>0&&angle<=(config.aimAssistDegrees+skill.assistDegrees)*Math.PI/180;
      if(!manual||assisted||manual&&!action?.manual&&s.kickAim){
        tx=manual?goalX:d*(hx+rules.goalTargetExtra);const accuracy=p.team===0?aiConfig.playerAccuracy:Math.max(opponent.accuracy,attack.accuracy);
        tz=(rng()-.5)*config.pitch.goalWidth*Math.max(0,aiConfig.shotSpread-accuracy)*(manual?skill.spread:1);
        if(manual)tz=clamp(tz,-config.pitch.goalWidth/2+ph.ballRadius,config.pitch.goalWidth/2-ph.ballRadius);
      }else {tx=s.ball.x+aim.x;tz=s.ball.z+aim.z;}
      event('shot',{team:p.team,player:p.id,power,assisted});
    }
    const dx=tx-s.ball.x,dz=tz-s.ball.z,len=Math.hypot(dx,dz)||1;
    const handRelease=p.hands;
    p.fx=dx/len;p.fz=dz/len;p.hands=false;p.hold=0;s.actionAim={x:p.fx,z:p.fz};
    const passSpeed=pass?Math.hypot(tx-s.ball.x,tz-s.ball.z)*ph.friction/(1-Math.exp(-ph.friction*(destination?.kind==='ground'?config.passing.groundTravelSeconds:config.passing.travelSeconds))):ph.passSpeed;
    // A keeper's throw is an underarm roll to a team-mate, not a shot: bounded by
    // goalkeeping.throwMin/MaxSpeed (measured 29/10/2026 at 22 m/s for a 10 m pass).
    const gk=config.goalkeeping,throwSpeed=handRelease&&pass&&Number.isFinite(gk.throwMaxSpeed)?clamp(Math.hypot(tx-s.ball.x,tz-s.ball.z)*ph.friction/(1-Math.exp(-ph.friction*(gk.throwTravelSeconds||config.passing.travelSeconds))),gk.throwMinSpeed||0,gk.throwMaxSpeed):null;
    const speed=throwSpeed??(pass?passSpeed:ph.shotSpeed+power*ph.shotBoost)*(1+(p.kick-1)*config.players.kickPerRank)*(pass?1:skill.power)*(pass?1:1+(p.card.shot-config.card.initial)/config.card.max*config.roster.attributeShotWeight);
    Object.assign(s.ball,{flight:null,owner:null,vx:dx/len*speed,vz:dz/len*speed,vy:pass?aiConfig.passLift:aiConfig.shotLift+power*aiConfig.shotLiftPower,curve:pass||manual&&!assisted?0:(rng()-.5)*power*aiConfig.curveStrength*(manual?skill.spread:1),lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace});
    if(!pass&&manual)s.ball.vy=shotLift(power,action?.height,config);
    if(handRelease){p.throwTime=config.restarts.throwSeconds;if(pass)s.ball.vy=config.restarts.throwLift;}
    s.ball.shot={speed,aim:Math.min(1,Math.abs(s.ball.z+(d*hx-s.ball.x)*dz/(Math.abs(dx)>1e-6?dx:1e-6))/(config.pitch.goalWidth/2)),distance:Math.abs(d*hx-p.x),shooter:p.id};
    if(handRelease&&pass){
      const flight=createKeeperThrowFlight(s.ball,{x:tx,z:tz},config,power);Object.assign(s.ball,flight);
      if(target&&Math.hypot(target.x-flight.flight.x,target.z-flight.flight.z)>2.2){target=null;s.passTarget=null;s.event.target=null;}
      else if(s.passTarget){s.passTarget.x=flight.flight.x;s.passTarget.z=flight.flight.z;}
    }
    else if((manual||forceLoft)&&pass&&destination.kind==='loft'&&!handRelease){
      Object.assign(s.ball,createLoftFlight(s.ball,destination,config,power));
    }else if(pass&&!handRelease){s.ball.vy=0;s.ball.y=ph.ballRadius;}
    // Ground passes retain their card spread. The old scripted loft ignored
    // this velocity error; its replacement must likewise hit the shown target.
    if(pass&&p.card.pass<config.card.initial){const error=(rng()-.5)*(config.card.initial-p.card.pass)*config.roster.passSpread;if(!s.ball.flight)s.ball.vz+=error;}
    if(pass&&target&&target.role!=='keeper'&&p.team===0&&role!=='keeper')selectPlayer(target.id);
    p.cooldown=aiConfig.kickCooldown;p.kickTime=aiConfig.kickAnimationSeconds;p.hold=0;
  }
  function updateDistribution(p){
    const action=p.distribution,motion=p.restartMotion;if(!action||!motion)return;
    if(s.ball.owner!==p.id||!p.hands){p.distribution=p.restartMotion=null;return;}
    sampleRestartAction(motion.kind,motion.elapsed+step,motion);
    if(!motion.released)return;
    const pose=restartBallPose(motion.kind,motion.contact);
    s.ball.x=p.x+p.fx*pose.forward-p.fz*pose.side;s.ball.z=p.z+p.fz*pose.forward+p.fx*pose.side;s.ball.y=pose.height;
    p.distribution=null;
    if(p.id===s.controlled)consumeHeldActions();
    const previous={aim:s.aim,passAim:s.passAim,kickAim:s.kickAim,moving:s.moving};
    Object.assign(s,{aim:action.aim,passAim:action.passAim,kickAim:action.kickAim,moving:action.moving});
    p.cooldown=0;kick(p,action.power,action.pass,action.forceLoft,true);
    Object.assign(s,previous);
  }
  /** A wide AI carrier crosses to a team-mate attacking the box; the receiver's
   * automatic header (aerial.autoHeaderDelaySeconds) finishes it. */
  function crossTarget(p){
    const d=direction(p.team),a=aiConfig;if(p.role==='keeper'||p.id===s.controlled||p.cooldown>0)return null;
    if(p.team===1&&stage<(a.crossFromStage??Infinity))return null;
    if(hx-p.x*d>(a.crossRange??0)||Math.abs(p.z)<(a.crossWidth??Infinity))return null;
    return players.filter(q=>q.team===p.team&&q.id!==p.id&&q.role!=='keeper'&&q.x*d>hx-config.pitch.penaltyDepth-1.5&&Math.abs(q.z)<config.pitch.penaltyWidth/2+.5).sort((u,v)=>distance(u,p)-distance(v,p)||u.id-v.id)[0]||null;
  }
  function cross(p,mate){
    const power=aiConfig.crossPower??.55,flight=config.passing.loftMinSeconds+power*config.passing.loftExtraSeconds;
    const d=direction(p.team),x=d*clamp((mate.x+(mate.vx||0)*flight*.5)*d,hx-config.pitch.penaltyDepth,hx-1.2);
    const point=safeLoftPoint({x,z:clamp(mate.z+(mate.vz||0)*flight*.5,-config.pitch.penaltyWidth/2+.5,config.pitch.penaltyWidth/2-.5)},config),tx=point.x,z=point.z,dx=tx-s.ball.x,dz=z-s.ball.z,len=Math.hypot(dx,dz)||1;
    if(p.team===1)rivalPasses++;
    p.fx=dx/len;p.fz=dz/len;p.hold=0;p.cooldown=aiConfig.kickCooldown;p.kickTime=aiConfig.kickAnimationSeconds;s.actionAim={x:p.fx,z:p.fz};
    Object.assign(s.ball,{owner:null,thrower:null,shot:null,curve:0,lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace},createLoftFlight(s.ball,point,config,power));
    s.passTarget={player:mate.id,x:tx,z,startX:s.ball.x,startZ:s.ball.z,distance:len,time:config.passing.runSeconds,kind:'loft'};
    event('loft',{team:p.team,player:p.id,target:mate.id,x:tx,z,distance:len,power});
  }
  const keeperMotion=config.players.keeperMotion?{...config.players,...config.players.keeperMotion}:config.players;
  let referenceTick=-1,referenceSpeed=0;
  function teamReference(){
    if(referenceTick===tickCount)return referenceSpeed;referenceTick=tickCount;let best=-Infinity;
    for(const q of players)if(q.team===0){const v=(config.players.speed+(q.speed-1)*config.players.speedPerRank)*personal(q).pace;if(v>best)best=v;}
    return referenceSpeed=best;
  }
  function move(p,dx,dz,dt,multiplier=1) {const pm=p.role==='keeper'?keeperMotion:config.players;
    const length=Math.hypot(dx,dz),reference=teamReference(),speed=p.team===0?(config.players.speed+(p.speed-1)*config.players.speedPerRank)*multiplier*personal(p).pace:Math.max(opponent.speed*multiplier*personal(p).pace,reference*config.opponents.minSpeedRatio*attack.speed);
    const scale=length>1?1/length:1;
    // Turn the body toward intent before redirecting momentum. Reversals brake
    // first; low-speed changes remain responsive on the first fixed tick.
    let alignment=1;
    if(length>0&&p.kickTime<=0){
      const current=Math.atan2(p.fx,p.fz),wanted=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(wanted-current),Math.cos(wanted-current));
      const turn=pm.turnRate*(1+pm.lowSpeedTurnBoost*(1-Math.min(1,Math.hypot(p.vx,p.vz)/speed)));
      const angle=current+delta*(1-Math.exp(-turn*dt));p.fx=Math.sin(angle);p.fz=Math.cos(angle);
      alignment=config.players.turnDrive+(1-config.players.turnDrive)*Math.max(0,(p.fx*dx+p.fz*dz)/length);
      p.turnLean=clamp(delta*config.players.turnLean,-config.players.maxTurnLean,config.players.maxTurnLean);
    }
    const blend=1-Math.exp(-dt*(length>0?pm.acceleration:pm.deceleration));
    p.vx+=(dx*scale*speed*alignment-p.vx)*blend;p.vz+=(dz*scale*speed*alignment-p.vz)*blend;
    p.x=clamp(p.x+p.vx*dt,-hx+rules.playerBoundary,hx-rules.playerBoundary);p.z=clamp(p.z+p.vz*dt,-hz+rules.playerBoundary,hz-rules.playerBoundary);
    if(length===0)p.turnLean*=Math.exp(-pm.turnRate*dt);
  }
  function moveControlledKeeper(p,mx,mz,dt){
    const k=config.goalkeeping,d=direction(p.team),home=-d*(hx-aiConfig.keeperInset),diving=p.diveTime>0;
    const x=p.hands?mx:Math.abs(mx)>aiConfig.idleThreshold?mx:clamp((home-p.x)*1.6,-1,1);
    move(p,x,diving?p.diveZ:mz,dt,p.hands?k.carrySpeedMultiplier:diving?k.diveSpeed/config.players.speed:1);
    p.x=d*clamp(p.x*d,-hx+k.areaInset,-hx+config.pitch.penaltyDepth-k.areaInset);
    p.z=clamp(p.z,-config.pitch.penaltyWidth/2+k.areaInset,config.pitch.penaltyWidth/2-k.areaInset);
  }
  function ai(p,dt) {
    const b=s.ball,d=direction(p.team),owner=b.owner===null?null:players[b.owner];
    const possession=owner?.team===p.team;
    let tx=p.x,tz=p.z;p.request=false;
    if(owner===p&&p.hands){
      p.hold+=dt;
      if(p.hold+1e-8>=config.goalkeeping.maxHoldSeconds-keeperThrowLead||p.hold>=config.goalkeeping.catchSeconds&&p.think<=0){p.cooldown=0;kick(p,0,true);}
    }else if(owner===p) {
      if(p.team===0&&role==='keeper'&&p.hold<=0)p.carryStartX=p.x;
      p.hold+=dt;tx=d*(hx-aiConfig.targetGoalInset);tz=p.z*aiConfig.dribbleCentering;
      // A wing keeps the width so a cross is possible (from crossFromStage for the rival).
      if(Number.isFinite(aiConfig.wingWidth)&&p.role==='wing'&&p.id!==s.controlled&&(p.team===0||stage>=(aiConfig.crossFromStage??Infinity))){const side=Math.sign(p.z)||(p.id%2?1:-1);tz=side*Math.min(hz-config.tactics.sideInset,aiConfig.wingWidth);}
      const blocker=nearest(1-p.team,p);
      if(p.team===0&&distance(blocker,p)<aiConfig.passPressure)tz=clamp(p.z+(p.id%2?1:-1)*config.tactics.evadeWidth,-hz+config.tactics.sideInset,hz-config.tactics.sideInset);
      if(p.team===0&&role==='keeper'&&distance(blocker,p)<aiConfig.passPressure*1.3){
        const side=Math.sign(p.z-blocker.z)||(p.z?-Math.sign(p.z):p.id%2?1:-1);
        tx=p.x+d*3.5;tz=clamp(p.z+side*config.tactics.evadeWidth,-hz+config.tactics.sideInset,hz-config.tactics.sideInset);
      }
      // A newly opened goal lane must not wait for the next passing decision.
      if(p.team===1&&p.role!=='keeper'&&p.cooldown<=0&&s.elapsed>=nextRivalShot&&hx-p.x*d<attack.shootDistance&&Math.abs(p.z)<config.pitch.goalWidth&&p.hold>(rivalPasses?attack.shotHold:Math.max(attack.shotHold,attack.passHold)))p.think=0;
      const crossMate=p.think<=0&&p.hold>Math.min(attack.passHold,.5)?crossTarget(p):null;
      if(crossMate){cross(p,crossMate);p.think=p.team===0?aiConfig.teamThinkSeconds:Math.min(opponent.thinkSeconds,attack.thinkSeconds);}
      else if(p.think<=0) {
        const defender=nearest(1-p.team,p),pressure=distance(defender,p);
        const teammate=passTarget(p);
        const canPass=distance(teammate,p)>aiConfig.requestDistance && distance(nearest(1-p.team,teammate),teammate)>aiConfig.requestClearance;
        if(p.team===1){
          // A shooting lane wins over recycling possession under pressure.
          // Outside that lane, pass only after a real dribble or to escape a press.
          const range=hx-p.x*d;
          if(p.role==='keeper'||(canPass&&rivalPasses===0&&range>config.ai.attackCombinationDistance&&p.hold>attack.passHold))kick(p,0,true);
          else if(p.cooldown<=0&&s.elapsed>=nextRivalShot&&range<attack.shootDistance&&Math.abs(p.z)<config.pitch.goalWidth&&p.hold>(rivalPasses?attack.shotHold:Math.max(attack.shotHold,attack.passHold))){kick(p,aiConfig.opponentShotPower+stage*aiConfig.opponentPowerPerStage);nextRivalShot=s.elapsed+attack.shotIntervalSeconds;}
          else if(canPass&&p.hold>attack.passHold&&((teammate.x-p.x)*d>aiConfig.passAheadMargin&&pressure<aiConfig.passPressure||p.hold>attack.buildSeconds))kick(p,0,true);
        }else if(role==='keeper'){
          // The child can defend only; teammates must turn a good attack into
          // a shot before a nearby presser forces another recycling pass.
          // Keep the same card/accuracy and a visible, deterministic cadence.
          const opening=clamp((stage-1)/9,0,1),range=hx-p.x*d,shootDistance=Math.max(aiConfig.teamShootDistance,Math.min(14.5,attack.shootDistance)+(attack.shootDistance-Math.min(14.5,attack.shootDistance))*opening);
          const canShoot=p.role!=='keeper'&&p.cooldown<=0&&range<shootDistance&&Math.abs(p.z)<config.pitch.goalWidth*1.15&&p.hold>Math.max(aiConfig.minShotHold,attack.shotHold)&&s.elapsed>=nextHomeShot&&hasShootingLane(p,s,config);
          const carried=(p.x-(p.carryStartX??p.x))*d,forward=(teammate.x-p.x)*d>aiConfig.passAheadMargin;
          const buildPass=canPass&&p.hold>=attack.passHold&&(forward||carried>=config.tactics.evadeWidth);
          if(canShoot){kick(p,aiConfig.teamShotPower);nextHomeShot=s.elapsed+Math.max(2.2,attack.shotIntervalSeconds)*(2+.2*(1-opening));}
          else if(p.role==='keeper'||buildPass&&(pressure<aiConfig.passPressure||p.hold>attack.buildSeconds))kick(p,0,true);
        }else if(p.role==='keeper' || (canPass && pressure<aiConfig.passPressure))kick(p,0,true);
        else if(p.x*d>hx-aiConfig.teamShootDistance && p.hold>aiConfig.minShotHold)kick(p,aiConfig.teamShotPower);
        p.think=p.team===0?aiConfig.teamThinkSeconds:Math.min(opponent.thinkSeconds,attack.thinkSeconds);
      }
    } else if(p.role==='keeper') {
      const target=keeperTarget(p,s,config);tx=target.x;tz=target.z;p.duty=target.duty;
    } else {
      const target=fieldTarget(p,s,config);tx=target.x;tz=target.z;p.duty=target.duty;
      p.request=possession&&distance(p,owner)>aiConfig.requestDistance&&distance(nearest(1-p.team,p),p)>aiConfig.requestClearance;
    }
    if(s.passTarget?.player===p.id&&s.passTarget.time>0&&b.owner===null){tx=s.passTarget.x;tz=s.passTarget.z;}
    // A deterministic duty cycle uses elapsed simulation time, never extra RNG.
    // Sprint never consumes RNG, including below the stage gate.
    p.sprintRest=Math.max(0,p.sprintRest-dt);p.sprintTime=Math.max(0,p.sprintTime-dt);
    if(owner===p&&p.team===1&&stage>=aiConfig.sprintFromStage&&p.role!=='keeper'&&p.sprintRest<=0&&distance(p,{x:tx,z:tz})>=aiConfig.sprintDistance){p.sprintTime=aiConfig.sprintSeconds;p.sprintRest=aiConfig.sprintRestSeconds;}
    p.sprinting=p.sprintTime>0;
    move(p,tx-p.x,tz-p.z,dt,p.role==='keeper'?aiConfig.keeperSpeedScale:p.sprinting?aiConfig.sprintMultiplier:1);
  }
  function mode(){return role==='keeper'&&s.ball.owner!==s.controlled||s.ball.owner!==null&&players[s.ball.owner].team===1?'defense':'attack';}
  function takeBall(p){
    const b=s.ball;if(b.owner!==null&&players[b.owner].hands)return;
    if(p.team===1&&b.lastTeam===0)rivalPasses=0;if(b.owner!==null){players[b.owner].cooldown=rules.tackleCooldown;players[b.owner].hands=false;}
    const mayHandle=p.role==='keeper'&&inPenaltyArea(p,p,s,config)&&inPenaltyArea(p,b,s,config)&&b.lastTeam!==p.team;
    const received=s.passTarget?.player===p.id&&b.lastTeam===p.team;
    const reception=received?receiveBallMotion(p,b,config):null;
    b.thrower=null;Object.assign(b,{flight:null,owner:p.id,lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace,vx:0,vz:0,vy:0,curve:0});
    if(reception)Object.assign(p,reception);
    p.hands=mayHandle;p.hold=0;
    if(p.hands)p.catchTime=config.goalkeeping.catchSeconds;
    if(p.team===0&&role!=='keeper'&&p.role!=='keeper')selectPlayer(p.id);s.passTarget=null;s.charging=false;s.charge=0;s.chargeKind=null;
  }
  function aerialStrike(p,clear=false,aim=null){
    if(!canHead(p,s.ball,config))return false;
    const b=s.ball,d=direction(p.team),intent=aim||{x:d*hx-b.x,z:-b.z},len=Math.hypot(intent.x,intent.z)||1;
    const power=clear?config.aerial.clearPower:config.aerial.power,speed=ph.shotSpeed+power*ph.shotBoost;
    p.fx=intent.x/len;p.fz=intent.z/len;p.headerTime=config.aerial.seconds;p.kickTime=0;p.cooldown=aiConfig.kickCooldown;
    Object.assign(b,{owner:null,flight:null,thrower:null,vx:p.fx*speed,vz:p.fz*speed,vy:config.aerial.lift,curve:0,lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace});
    b.shot={speed,aim:Math.min(1,Math.abs(b.z)/(config.pitch.goalWidth/2)),distance:Math.abs(d*hx-p.x),shooter:p.id};
    s.passTarget=null;s.charging=false;s.charge=0;s.chargeKind=null;
    event(clear?'clearance':'header',{player:p.id,team:p.team});return true;
  }
  function selectPlayer(id){
    if(s.controlled!==id){s.controlled=id;s.selectionTime=.35;s.switchCooldown=config.tactics.switchCooldownSeconds;}
    s.defenseIdle=0;s.autoSwitchCandidate=null;s.charging=false;s.charge=0;s.chargeKind=null;
  }
  function rememberAction(kind,p,aim){
    s.bufferedAction={kind,player:p.id,remaining:config.assistance?.contact?.inputBufferSeconds??.18,released:false,aim:aim?{...aim}:null};
  }
  function resolveAction(input,p){
    const action=s.bufferedAction;if(!action)return;
    if(action.player!==p.id||(action.remaining-=step)<0){s.bufferedAction=null;return;}
    if(p.cooldown>0||p.recover>0||p.slideTime>0)return;
    if(action.kind==='shot'&&canHead(p,s.ball,config)){
      if(aerialStrike(p,false,action.aim?.manual?action.aim:s.headerAim)){s.bufferedAction=null;held=false;pendingRelease=false;}return;
    }
    if(action.kind==='steal'){
      if(distance(p,s.ball)<=config.steal.reach&&p.stealCooldown<=0){p.stealCooldown=config.steal.cooldownSeconds;standingAttempt(p);s.bufferedAction=null;}return;
    }
    if(s.ball.owner!==p.id)return;
    const pass=action.kind==='pass',stillHeld=pass?!!input.passHeld:held;
    if(pass&&action.aim)s.passAim=action.aim;if(!pass&&action.aim)s.kickAim=action.aim;
    s.bufferedAction=null;
    if(stillHeld&&!action.released){s.charging=true;s.chargeKind=pass?'pass':'shot';s.charge=0;}
    else {kick(p,pass?0:.12,pass);s.charging=false;s.charge=0;s.chargeKind=null;}
  }
  function standingAttempt(p){p.stealTime=config.steal.animationSeconds;const dx=s.ball.x-p.x,dz=s.ball.z-p.z,len=Math.hypot(dx,dz)||1;p.fx=dx/len;p.fz=dz/len;return attempt(p,config.steal,'steal');}
  function attempt(p,settings,type){
    const b=s.ball,owner=b.owner===null?null:players[b.owner];
    if(owner?.hands||owner?.team===p.team||distance(p,b)>settings.reach||b.y>rules.pickupHeight)return false;
    const base=typeof settings.baseChance==='number'?settings.baseChance:settings.baseChance[difficulty];
    const chance=clamp((base*(1+(p.guard-1)*config.players.defensePerRank)+personal(p).defense+(p.card.defense-(owner?.card.defense??config.card.initial))*config.roster.duelWeight)*stealApproach(p,owner,config),0,1),won=rng()<chance;
    if(won)takeBall(p);event(type,{player:p.id,won});return won;
  }
  function sprint(dt,moving,requested,available){
    const meter=s.sprint,c=config.sprint;
    if(meter.locked&&meter.value>=c.minToStart)meter.locked=false;
    meter.active=requested&&moving&&available&&!meter.locked&&meter.value>0;
    if(meter.active){meter.value=Math.max(0,meter.value-c.drainPerSecond*dt);meter.regenDelay=c.regenDelaySeconds;if(!meter.value){meter.active=false;meter.locked=true;}}
    else if(meter.regenDelay>0)meter.regenDelay=Math.max(0,meter.regenDelay-dt);
    else meter.value=Math.min(meter.capacity,meter.value+c.regenPerSecond*effects.regen*dt);
  }
  function restart(type,teamId,x,z) {
    if(type==='goalKick'){x=Math.sign(x)*(hx-config.pitch.goalAreaDepth);z=Math.sign(z||s.ball.z||1)*config.pitch.goalAreaWidth/2;}
    s.phase='restart';s.phaseTime=config.match.restartSeconds;s.restart={type,team:teamId,x,z,age:0,elapsed:0};
    const owner=type==='goalKick'?players.find(p=>p.team===teamId&&p.role==='keeper'):nearest(teamId,{x,z},-1,true),r=s.restart;
    const facing=type==='corner'?{x:direction(teamId)*(hx-config.pitch.penaltyDepth/2)-r.x,z:-r.z}:{x:direction(teamId),z:0},faceLength=Math.hypot(facing.x,facing.z)||1;
    r.facing={x:facing.x/faceLength,z:facing.z/faceLength};
    r.stance=type==='throwIn'?{x:r.x,z:r.z}:{x:clamp(r.x-r.facing.x*.55,-hx+rules.playerBoundary,hx-rules.playerBoundary),z:clamp(r.z-r.facing.z*.55,-hz+rules.playerBoundary,hz-rules.playerBoundary)};
    r.player=owner.id;r.from={x:owner.x,z:owner.z};r.walkSeconds=Math.max(config.restarts.walkSeconds,1.5*distance(owner,r.stance)/(config.players.speed*1.05));
    for(const p of players)p.restartMotion=p.distribution=null;
    owner.hands=false;owner.vx=owner.vz=0;owner.fx=direction(teamId);owner.fz=0;owner.slideTime=owner.recover=owner.headerTime=owner.kickTime=owner.stealTime=0;
    r.targets=createRestartLayout(r,s,config);
    // Everyone gets time to form a receiving/marking shape, without jumping
    // to assigned spots or advancing the live match clock.
    r.organizeSeconds=config.restarts.walkSeconds;
    for(const p of players)if(p!==owner&&p.id!==s.controlled&&r.targets[p.id])r.organizeSeconds=Math.max(r.organizeSeconds,Math.min(3,distance(p,r.targets[p.id])/config.players.speed+.2));
    Object.assign(s.ball,{thrower:null,shot:null,flight:null,x,z,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:owner.id,grace:rules.restartGrace,lastTeam:teamId,lastPlayer:owner.id});
    if(role!=='keeper'&&s.controlled===owner.id)selectPlayer(nearest(0,s.ball,owner.id,true).id);if(role==='keeper')s.controlled=2;s.passTarget=null;s.chargeKind=null;s.actionAim=s.kickAim=s.passAim=null;
    s.charging=false;s.charge=0;event('restart',{restart:type,team:teamId});
  }
  /** A throw reaches about restarts.throwReach metres: pick the most open team-mate
   * inside it, never a distant runner the ball cannot reach. */
  function throwInTarget(p,r,long=false){
    return restartThrowTarget(p,r,s,config,long);
  }
  function restartClearance(p,r){
    if(p.team===r.team||p.role==='keeper')return null;
    if(r.type==='goalKick'){
      const d=direction(r.team),line=-hx+config.pitch.penaltyDepth;
      if(p.x*d<line&&Math.abs(p.z)<config.pitch.penaltyWidth/2)return {x:d*(line+.35),z:p.z};
    }
    const space=r.type==='throwIn'?config.restarts.opponentSpace||0:r.type==='corner'?3:0;
    if(!space)return null;const dx=p.x-r.x,dz=p.z-r.z,l=Math.hypot(dx,dz);if(l>=space-1e-7)return null;
    const limitX=hx-rules.playerBoundary,limitZ=hz-rules.playerBoundary,radius=space+.3;
    const radial={x:clamp(r.x+(l?dx/l:-direction(r.team))*radius,-limitX,limitX),z:clamp(r.z+(l?dz/l:-Math.sign(r.z)||1)*radius,-limitZ,limitZ)};
    if(distance(radial,r)>=space+.05)return radial;
    // At a corner the outward ray can hit both pitch limits. Choose the nearest
    // legal point on the in-field arc, rather than walking forever into a wall.
    const ix=-Math.sign(r.x)||-direction(r.team),iz=-Math.sign(r.z)||1,n=Math.hypot(ix,iz),ux=ix/n,uz=iz/n;
    let best=null,cost=Infinity;
    for(let k=0;k<16;k++){const a=k*Math.PI/8,cos=Math.cos(a),sin=Math.sin(a),x=r.x+(ux*cos-uz*sin)*radius,z=r.z+(ux*sin+uz*cos)*radius;
      if(Math.abs(x)>limitX||Math.abs(z)>limitZ)continue;const range=Math.hypot(x-p.x,z-p.z);if(range<cost){best={x,z};cost=range;}}
    return best||{x:clamp(r.x-direction(r.team)*radius,-limitX,limitX),z:clamp(r.z-Math.sign(r.z)*radius,-limitZ,limitZ)};
  }
  function moveRestartMember(p,dx,dz){
    const r=s.restart,oldX=p.x,oldZ=p.z,wasLegal=!restartClearance(p,r);
    if(p.id===s.controlled&&role==='keeper')moveControlledKeeper(p,dx,dz,step);else move(p,dx,dz,step);
    if(!wasLegal||!restartClearance(p,r))return;
    const travelX=p.x-oldX,travelZ=p.z-oldZ;let low=0,high=1;
    for(let i=0;i<16;i++){const u=(low+high)/2;p.x=oldX+travelX*u;p.z=oldZ+travelZ*u;if(restartClearance(p,r))high=u;else low=u;}
    p.x=oldX+travelX*low;p.z=oldZ+travelZ*low;
    const nx=p.x-r.x,nz=p.z-r.z,length=Math.hypot(nx,nz)||1,inward=(p.vx*nx+p.vz*nz)/length;
    if(inward<0){p.vx-=nx/length*inward;p.vz-=nz/length*inward;}
  }
  function moveRestart(input){
    const r=s.restart,taker=players[r.player];
    for(const p of players){
      if(p===taker)continue;
      const clearance=restartClearance(p,r);
      if(clearance){const dx=clearance.x-p.x,dz=clearance.z-p.z,l=Math.hypot(dx,dz)||1;moveRestartMember(p,dx/l,dz/l);continue;}
      if(p.id===s.controlled){moveRestartMember(p,clamp(finite(input.moveX),-1,1),clamp(finite(input.moveZ),-1,1));continue;}
      const target=restartTarget(p,r,s,config)||fieldTarget(p,s,config);
      p.duty=target.duty;moveRestartMember(p,target.x-p.x,target.z-p.z);
    }
    // The taker is reserved for the restart. Everyone else can find space.
    const walking=r.walkSeconds??config.restarts.walkSeconds,u=clamp(r.elapsed/walking,0,1),smooth=u*u*(3-2*u),oldX=taker.x,oldZ=taker.z,stance=r.stance||r;
    taker.x=r.from.x+(stance.x-r.from.x)*smooth;taker.z=r.from.z+(stance.z-r.from.z)*smooth;
    taker.vx=(taker.x-oldX)/step;taker.vz=(taker.z-oldZ)/step;
    if(u<1){const l=Math.hypot(stance.x-r.from.x,stance.z-r.from.z)||1;taker.fx=(stance.x-r.from.x)/l;taker.fz=(stance.z-r.from.z)/l;}
    else{s.ball.owner=taker.id;s.ball.x=r.x;s.ball.z=r.z;s.ball.y=ph.ballRadius;if(!r.action){taker.fx=r.facing?.x??direction(r.team);taker.fz=r.facing?.z??0;}}
    // Prepare while the receiver chooses a pass. The overhead pose is held at
    // the authored end of preparation; accepting a button resumes at release.
    if(!r.action&&r.type==='throwIn'&&u===1)taker.restartMotion=sampleRestartAction('throwIn',Math.min(.9,Math.max(0,r.elapsed-walking)),taker.restartMotion||{});
    if(!r.action&&r.type==='corner'&&r.elapsed>=Math.max(0,walking-1.2))taker.restartMotion=sampleRestartAction('corner',Math.min(1.2,Math.max(0,r.elapsed-Math.max(0,walking-1.2))),taker.restartMotion||{});
    if(taker.restartMotion&&r.type==='throwIn'){const pose=restartBallPose(taker.restartMotion.kind,taker.restartMotion.elapsed);s.ball.x=taker.x+taker.fx*pose.forward-taker.fz*pose.side;s.ball.z=taker.z+taker.fz*pose.forward+taker.fx*pose.side;s.ball.y=pose.height;}
  }
  function readyRestart(input){
    const r=s.restart,p=players[r.player],human=r.team===0&&(role!=='keeper'||p.role==='keeper');r.age+=step;
    if(r.action){
      const motion=p.restartMotion;
      if(motion.released)releaseRestart(r,p,r.action.input,r.action.power,r.action.button);
      return;
    }
    const moving=Math.hypot(input.moveX||0,input.moveZ||0)>aiConfig.idleThreshold;
    const aim=moving?{x:input.moveX,z:input.moveZ}:r.type==='corner'?{x:direction(r.team)*(hx-config.pitch.penaltyDepth/2)-r.x,z:-r.z}:{x:direction(r.team),z:r.type==='throwIn'?-Math.sign(r.z):0},length=Math.hypot(aim.x,aim.z)||1;
    s.aim={x:aim.x/length,z:aim.z/length};
    // Automatic button aim belongs to the freely moving controlled teammate.
    // The reserved taker aims from the restart spot; a drag still wins.
    if(held)r.button='shot';else if(input.passHeld)r.button='pass';
    const shot=held||pendingRelease||r.button==='shot',activeAim=shot?input.kickAim:input.passAim;
    s.kickAim=shot&&activeAim?.manual?activeAim:null;s.passAim=!shot&&activeAim?.manual?activeAim:null;s.actionAim=activeAim?.manual?activeAim:null;s.moving=moving;
    s.chargeKind=shot?'shot':'pass';s.charging=!!(input.passHeld||held);const cap=shot?ph.chargeSeconds:config.passing.chargeSeconds;
    if(s.charging)s.charge=Math.min(cap,s.charge+step);
    const requested=human&&(pendingPass||pendingPassRelease||pendingRelease);
    if(r.age<config.restarts.readySeconds&&!requested||r.elapsed+1e-8<(r.walkSeconds??config.restarts.walkSeconds))return;
    if(human?!(pendingPass||pendingPassRelease||pendingRelease)&&r.age<config.restarts.idleReleaseSeconds:r.age<config.restarts.aiReleaseSeconds)return;
    const power=clamp(s.charge/cap,0,1),button=shot?'shot':'pass';
    r.action={input:{moveX:finite(input.moveX),moveZ:finite(input.moveZ),passAim:input.passAim?{...input.passAim}:null,kickAim:input.kickAim?{...input.kickAim}:null},power,button,automatic:!(pendingPass||pendingPassRelease||pendingRelease)};
    const manual=activeAim?.manual?activeAim:null;
    if(manual)s.aim=manual;
    else if(r.type==='throwIn'&&!moving){const target=throwInTarget(p,r,button==='shot');if(target){const point=teamPassPoint(target,config),dx=point.x-r.x,dz=point.z-r.z,length=Math.hypot(dx,dz)||1;s.aim={x:dx/length,z:dz/length};}}
    if(r.type==='throwIn'){const z=-Math.sign(r.z)*Math.max(config.restarts.inwardMinimum,Math.abs(s.aim.z)),length=Math.hypot(s.aim.x,z)||1;s.aim={x:s.aim.x/length,z:z/length};}
    p.restartMotion=sampleRestartAction(r.type,p.restartMotion?.kind===r.type?p.restartMotion.elapsed:0);p.fx=s.aim.x;p.fz=s.aim.z;
    if(r.type==='throwIn'){const pose=restartBallPose(r.type,p.restartMotion.elapsed);s.ball.x=p.x+p.fx*pose.forward-p.fz*pose.side;s.ball.z=p.z+p.fz*pose.forward+p.fx*pose.side;s.ball.y=pose.height;}
    // An accepted release cannot be replaced by a second edge while winding up.
    consumeHeldActions();clearInput();event('restart-windup',{player:p.id,team:p.team,restart:r.type});
  }
  function releaseRestart(r,p,input,power,button){
    const human=r.team===0&&(role!=='keeper'||p.role==='keeper'),moving=Math.hypot(input.moveX||0,input.moveZ||0)>aiConfig.idleThreshold;
    const activeAim=button==='shot'?input.kickAim:input.passAim,aimed=activeAim?.manual?activeAim:moving?{x:input.moveX,z:input.moveZ}:null;
    s.aim=aimed||{x:p.fx,z:p.fz};s.passAim=aimed?.manual?aimed:null;s.moving=moving;
    p.cooldown=0;s.ball.owner=p.id;s.phase='playing';
    if(r.type!=='throwIn'){s.ball.x=r.x;s.ball.z=r.z;s.ball.y=ph.ballRadius;}
    if(r.type==='throwIn'){
      // No drag and no stick: throw to the best open team-mate, at a strength that
      // reaches them (measured 29/10/2026: a fixed 10 m/s crossed the whole pitch).
      const manualThrow=aimed?.manual||moving,mate=manualThrow||!config.restarts.throwReach?null:throwInTarget(p,r,button==='shot'),matePoint=mate?teamPassPoint(mate,config):null;
      const aim=aimed||(matePoint?{x:matePoint.x-s.ball.x,z:matePoint.z-s.ball.z}:s.aim),dx=aim.x,dz=-Math.sign(r.z)*Math.max(config.restarts.inwardMinimum,Math.abs(aim.z)),len=Math.hypot(dx,dz)||1;
      p.fx=dx/len;p.fz=dz/len;
      const pose=restartBallPose('throwIn',restartActionProfile('throwIn').contact);
      s.ball.x=p.x+p.fx*pose.forward-p.fz*pose.side;s.ball.z=p.z+p.fz*pose.forward+p.fx*pose.side;s.ball.y=pose.height;
      const reach=(config.restarts.throwReach||9)*(.6+.4*power),target=matePoint||{x:s.ball.x+p.fx*reach,z:s.ball.z+p.fz*reach};
      const flight=createLoftFlight(s.ball,target,config,power);
      Object.assign(s.ball,flight,{owner:null,lastTeam:r.team,lastPlayer:p.id,grace:rules.restartGrace,thrower:p.id,shot:null});p.throwTime=config.restarts.throwSeconds;
      // The chosen team-mate comes to meet the throw instead of waiting to be beaten to it.
      if(mate){s.passTarget={player:mate.id,x:flight.flight.x,z:flight.flight.z,startX:s.ball.x,startZ:s.ball.z,distance:Math.hypot(flight.flight.x-s.ball.x,flight.flight.z-s.ball.z),time:config.passing.runSeconds,kind:'ground'};if(r.team===0&&role!=='keeper'&&mate.role!=='keeper')selectPlayer(mate.id);}
      event('throw',{player:p.id,target:mate?.id??null});
    }else {
      const long=button==='shot'||r.type==='corner'&&(!human||r.action.automatic),strength=long?Math.max(config.restarts.defaultCornerPower,power):power;
      kick(p,strength,true,r.type==='corner'&&!human);
    }
    consumeHeldActions();s.restart=null;s.charge=0;s.charging=false;s.chargeKind=null;clearInput();
  }
  function goal(teamId) {
    s.ball.flight=null;s.passTarget=null;s.score[teamId]++;s.phase='goal';s.phaseTime=config.match.goalSeconds;s.charging=false;s.charge=0;
    s.scorer=s.ball.lastPlayer;s.goalTeam=teamId;event('goal',{team:teamId,player:s.scorer});
  }
  function ball(dt) {
    const b=s.ball;let from={x:b.x,y:b.y,z:b.z};b.grace=Math.max(0,b.grace-dt);
    if(b.owner!==null){const p=players[b.owner];if(p.hands){const pose=p.restartMotion&&!p.restartMotion.released?restartBallPose(p.restartMotion.kind,p.restartMotion.elapsed):null;b.x=p.x+p.fx*(pose?.forward??config.goalkeeping.holdForward)-p.fz*(pose?.side??0);b.z=p.z+p.fz*(pose?.forward??config.goalkeeping.holdForward)+p.fx*(pose?.side??0);b.y=pose?.height??config.goalkeeping.holdHeight;b.vx=p.vx;b.vz=p.vz;b.vy=0;const puntDrop=p.distribution&&p.restartMotion.kind==='keeperPunt'&&p.restartMotion.elapsed>=restartActionProfile('keeperPunt').drop;if(!inPenaltyArea(p,p,s,config)||!puntDrop&&!inPenaltyArea(p,b,s,config)){p.hands=false;b.y=ph.ballRadius;}}
      else {Object.assign(b,followDribbleBall(p,b,dt,config));if(b.owner===null){b.lastTeam=p.team;b.lastPlayer=p.id;b.grace=.12;event('heavy-touch',{player:p.id,team:p.team});}}
    }
    else if(b.flight?.kind==='physical-loft')stepLoftBall(b,dt,config);
    else if(b.flight){const f=b.flight;f.age=Math.min(f.duration,f.age+dt);const u=f.age/f.duration;b.x=f.fromX+(f.x-f.fromX)*u;b.z=f.fromZ+(f.z-f.fromZ)*u;b.y=ph.ballRadius+4*f.height*u*(1-u);b.vy=4*f.height/f.duration*(1-2*u);if(u>=1){b.flight=null;b.vx*=config.ball.landingCarry;b.vz*=config.ball.landingCarry;b.vy=Math.abs(b.vy)*config.ball.bounce;}}
    else {
      rollBall(b,dt,config);
    }
    let crossing=pitchCrossing(from,b,config);
    const contact=goalFrameContact(from,b,config);
    if(contact&&(!crossing||contact.time<crossing.time)){
      if(b.owner!==null){players[b.owner].cooldown=rules.tackleCooldown;players[b.owner].hands=false;}
      b.owner=null;b.flight=null;s.passTarget=null;
      const n=contact.normal,normalSpeed=b.vx*n.x+b.vy*n.y+b.vz*n.z;
      for(const axis of ['x','y','z'])b['v'+axis]-=(1+ph.postBounce)*normalSpeed*n[axis];
      from={...contact.point};
      for(const axis of ['x','y','z']){from[axis]+=n[axis]*1e-5;b[axis]=from[axis]+b['v'+axis]*dt*(1-contact.time);}
      b.y=Math.max(ph.ballRadius,b.y);b.curve=0;event('post',{kind:contact.kind});
      crossing=pitchCrossing(from,b,config);
    }
    if(crossing){
      const end=crossing.axis==='x';
      if(end&&Math.abs(from.x)<=hx+ph.ballRadius&&Math.abs(crossing.z)<config.pitch.goalWidth/2-ph.ballRadius-config.pitch.postRadius&&crossing.y<config.pitch.goalHeight-ph.ballRadius-config.pitch.postRadius){
        const scoring=crossing.side*s.attackDir>0?0:1;
        if(b.thrower!=null){const opponentGoal=scoring===b.lastTeam;restart(opponentGoal?'goalKick':'corner',opponentGoal?1-scoring:scoring,crossing.side*(hx-(opponentGoal?rules.goalKickInset:rules.cornerInset)),opponentGoal?crossing.z:Math.sign(crossing.z||1)*(hz-rules.cornerInset));}
        else goal(scoring);
        return;
      }
      const defender=crossing.x*s.attackDir>0?1:0;
      const corner=end && b.lastTeam===defender;
      const teamId=end?(corner?1-defender:defender):1-b.lastTeam;
      restart(!end?'throwIn':corner?'corner':'goalKick',teamId,end?(corner?crossing.side*(hx-rules.cornerInset):crossing.side*(hx-rules.goalKickInset)):clamp(crossing.x,-hx+rules.sideGoalInset,hx-rules.sideGoalInset),corner?Math.sign(crossing.z||1)*(hz-rules.cornerInset):end?crossing.z:crossing.side*(hz-rules.sideInset));return;
    }
    for(const p of players) {
      if(p.id===b.thrower||p.id===b.owner || p.cooldown>0 || p.recover>0 || p.slideTime>0)continue;
      const handsAllowed=b.lastTeam!==p.team&&p.role==='keeper'&&inPenaltyArea(p,p,s,config)&&inPenaltyArea(p,b,s,config);
      const receivingCross=b.flight&&b.vy<0&&s.passTarget?.kind==='loft'&&s.passTarget.player===p.id&&p.team===b.lastTeam&&p.role!=='keeper'&&b.x*direction(p.team)>hx-config.pitch.penaltyDepth&&Math.abs(b.z)<config.pitch.penaltyWidth/2;
      if(receivingCross&&canHead(p,b,config)){p.autoHeadTime+=dt;if(p.autoHeadTime+1e-8>=config.aerial.autoHeaderDelaySeconds&&aerialStrike(p))break;continue;}else p.autoHeadTime=0;
      if(b.y>rules.pickupHeight){if(p.team===1&&p.role!=='keeper'&&b.x*direction(p.team)<-hx+config.aerial.clearanceZone&&aerialStrike(p,true))break;if(!handsAllowed||b.y>config.aerial.keeperHeight)continue;}
      const dist=distance(p,b),owner=b.owner===null?null:players[b.owner];
      if(owner) {
        if(owner.hands)continue;
        if(p.id===s.controlled)continue;
        const reach=handsAllowed?aiConfig.keeperBaseReach+(p.team===0?aiConfig.teamKeeper:opponent.keeper)*aiConfig.keeperReachScale:p.team===0?rules.stealRadius:Math.max(opponent.tackleReach,attack.tackleReach);
        if(p.team===owner.team || b.grace>0 || dist>reach)continue;
        const duel=Math.max(0,1+(p.card.defense-owner.card.defense)*config.roster.duelWeight);
        const rate=duel*(p.team===0?aiConfig.teamStealRate*(1+(p.guard-1)*config.players.defensePerRank):Math.max(opponent.stealRate,attack.stealRate))+(handsAllowed?(p.team===0?aiConfig.teamKeeper:opponent.keeper)*aiConfig.keeperStealRate:0);
        if(rng()>1-Math.exp(-rate*stealApproach(p,owner,config)*dt))continue;
        owner.cooldown=rules.tackleCooldown;
      } else {
        const keeper=handsAllowed && b.lastTeam!==p.team && Math.hypot(b.vx,b.vz)>aiConfig.keeperFastBall;
        const radius=keeper?aiConfig.keeperBaseReach+(p.team===0?aiConfig.teamKeeper:opponent.keeper)*aiConfig.keeperReachScale:ph.pickupRadius;
        const controlledFoot=p.id===s.controlled&&!keeper&&canContactBall(p,b,config);
        if(dist>radius&&!controlledFoot || (b.grace>0 && p.id===b.lastPlayer))continue;
        if(keeper){p.diveTime=config.goalkeeping.diveSeconds;p.diveZ=Math.sign(b.z-p.z)||1;}
        if(keeper && rng()>Math.min(.99,keeperSaveChance(p.card,players[b.shot?.shooter??b.lastPlayer]?.card??cards[0],b.shot||{speed:Math.hypot(b.vx,b.vz),aim:Math.abs(b.z)/(config.pitch.goalWidth/2),distance:0},config)*(p.team===1?config.difficulties[difficulty].keeper:1)+(p.id===s.controlled&&role==='keeper'&&p.diveCooldown>0?.12:0))) {p.cooldown=aiConfig.keeperAttemptCooldown;continue;}
      }
      if(!owner&&s.passTarget&&b.lastTeam!==p.team&&p.role!=='keeper'){const sender=players[b.lastPlayer],chance=clamp(config.roster.interceptionBase+(p.card.defense-sender.card.pass)*config.roster.duelWeight,0,1);if(rng()>chance){p.cooldown=config.roster.interceptionCooldown;continue;}}
      takeBall(p);p.hold=0;event('possession',{team:p.team,player:p.id});break;
    }
  }
  function tick(input) {
    if(s.result)return;tickCount++;
    if(consumedKick){held=false;pendingKick=pendingSlide=pendingRelease=false;}
    if(consumedPass)pendingPass=pendingPassStart=pendingPassRelease=false;
    if(consumedKick&&input.kickHeld||consumedPass&&input.passHeld)input={...input,kickHeld:consumedKick?false:input.kickHeld,passHeld:consumedPass?false:input.passHeld};
    for(const p of players){p.cooldown=Math.max(0,p.cooldown-step);p.kickTime=Math.max(0,p.kickTime-step);p.stealTime=Math.max(0,p.stealTime-step);p.headerTime=Math.max(0,p.headerTime-step);p.diveTime=Math.max(0,p.diveTime-step);p.diveCooldown=Math.max(0,(p.diveCooldown||0)-step);p.throwTime=Math.max(0,p.throwTime-step);p.catchTime=Math.max(0,p.catchTime-step);p.think-=step;p.slideCooldown=Math.max(0,p.slideCooldown-step);p.stealCooldown=Math.max(0,p.stealCooldown-step);p.recover=Math.max(0,p.recover-step);}
    for(const p of players)if(p.restartMotion&&!p.distribution&&!(s.restart?.player===p.id)){
      sampleRestartAction(p.restartMotion.kind,p.restartMotion.elapsed+step,p.restartMotion);
      if(p.restartMotion.stage==='complete')p.restartMotion=null;
    }
    if(s.restart&&s.phase.startsWith('restart')){s.restart.elapsed+=step;if(s.phase==='restartReady'&&s.restart.action){const p=players[s.restart.player];sampleRestartAction(s.restart.type,p.restartMotion.elapsed+step,p.restartMotion);}moveRestart(input);if(s.phase==='restartReady'){readyRestart(input);return;}}
    if(s.phase!=='playing') {
      s.phaseTime-=step;
      if(s.phase==='restart'){const r=s.restart;if(s.phaseTime<=0&&r.elapsed+1e-8>=Math.max(r.walkSeconds,r.organizeSeconds)&&!players.some(p=>restartClearance(p,r))){s.phase='restartReady';s.phaseTime=0;r.age=0;}return;}
      if(s.phase==='goal'){s.ball.x=clamp(s.ball.x+s.ball.vx*step*rules.goalSlowMotion,-hx-rules.netBallInset,hx+rules.netBallInset);s.ball.z=clamp(s.ball.z+s.ball.vz*step*rules.goalSlowMotion,-rules.netBallWidth,rules.netBallWidth);s.ball.y=Math.max(ph.ballRadius,s.ball.y-step);}
      if(s.phaseTime<=0){
        if(s.phase==='goal')positionKickoff(1-(s.goalTeam??s.event?.team??0));
        if(s.phase==='halftime'){s.half=2;s.halfElapsed=0;s.attackDir=-1;positionKickoff(1);}
        s.phase='playing';s.restart=null;event('play');
      }
      return;
    }
    s.selectionTime=Math.max(0,s.selectionTime-step);
    if(s.passTarget){s.passTarget.time=Math.max(0,s.passTarget.time-step);if(!s.passTarget.time)s.passTarget=null;}
    const candidate=players[selectControlledPlayer(s,config)],current=players[s.controlled];
    const advantage=distance(current,s.ball)-distance(candidate,s.ball);
    s.switchCooldown=Math.max(0,s.switchCooldown-step);
    if(role!=='keeper'&&!s.switchCooldown&&mode()==='defense'&&candidate.id!==current.id&&advantage>=config.autoSwitchAdvantage){
      s.defenseIdle=s.autoSwitchCandidate===candidate.id?s.defenseIdle+step:step;s.autoSwitchCandidate=candidate.id;
      if(s.defenseIdle+1e-8>=config.autoSwitchSeconds)selectPlayer(candidate.id);
    }else{s.defenseIdle=0;s.autoSwitchCandidate=null;}
    if(role==='keeper')pendingSwitch=false;
    if(pendingSwitch){const id=selectControlledPlayer(s,config,{manual:true,moveX:finite(input.moveX),moveZ:finite(input.moveZ)});if(id!==null){s.bufferedAction=null;selectPlayer(id);event('switch',{player:id});}pendingSwitch=false;}
    const p=players[s.controlled],mx=clamp(finite(input.moveX),-1,1),mz=clamp(finite(input.moveZ),-1,1),length=Math.hypot(mx,mz);
    s.aim=length>aiConfig.idleThreshold?{x:mx/length,z:mz/length}:{x:p.fx,z:p.fz};
    s.moving=length>aiConfig.idleThreshold;s.headerAim=s.moving?s.aim:null;
    s.kickAim=input.kickAim;s.passAim=input.passAim;
    s.actionAim=input.kickAim?.manual?input.kickAim:input.passAim?.manual?input.passAim:null;
    s.mode=mode();
    resolveAction(input,p);
    if(role==='keeper'&&pendingSlide){if(p.diveCooldown<=0&&!p.hands){p.diveTime=config.goalkeeping.diveSeconds;p.diveCooldown=config.goalkeeping.diveSeconds+.15;p.diveZ=input.kickAim?.manual?input.kickAim.z:mz||Math.sign(s.ball.z-p.z)||1;event('dive',{player:p.id,team:p.team});}pendingSlide=false;}
    s.idle=length>aiConfig.idleThreshold||held||input.passHeld?0:s.idle+step;
    if(s.mode==='defense'){s.charging=false;s.charge=0;s.chargeKind=null;}
    if(pendingSlide&&s.mode==='defense'&&p.slideCooldown<=0&&p.recover<=0&&p.slideTime<=0){
      p.slideTime=config.slide.seconds;p.slideCooldown=config.slide.cooldownSeconds;p.slideX=s.aim.x;p.slideZ=s.aim.z;p.slideAttempted=false;p.slideWon=false;
      event('slide',{player:p.id});
    }
    pendingSlide=false;
    if(pendingPass){
      if(s.mode==='defense'&&p.stealCooldown<=0&&p.recover<=0&&p.slideTime<=0){if(distance(p,s.ball)>config.steal.reach&&distance(p,s.ball)<config.steal.reach+.75)rememberAction('steal',p);else {p.stealCooldown=config.steal.cooldownSeconds;standingAttempt(p);}}
      else if(s.mode==='attack'&&p.recover<=0&&p.slideTime<=0)kick(p,0,true);
      pendingPass=false;
    }
    if(pendingPassStart){
      if(s.mode==='defense'&&p.stealCooldown<=0&&p.recover<=0&&p.slideTime<=0){if(distance(p,s.ball)>config.steal.reach&&distance(p,s.ball)<config.steal.reach+.75)rememberAction('steal',p);else {p.stealCooldown=config.steal.cooldownSeconds;standingAttempt(p);}}
      else if(!s.charging&&s.ball.owner===p.id&&p.slideTime<=0&&p.recover<=0){s.charging=true;s.chargeKind='pass';s.charge=0;}
      else if(s.ball.owner===null&&p.recover<=0&&p.slideTime<=0)rememberAction('pass',p,s.passAim);
    }
    if(pendingKick&&aerialStrike(p,false,s.headerAim)){pendingKick=false;held=false;pendingRelease=false;}
    if(pendingKick&&s.ball.owner===null&&p.recover<=0&&p.slideTime<=0)rememberAction('shot',p,s.kickAim);
    if((held||pendingKick)&&s.mode==='attack'&&s.ball.owner===p.id&&p.slideTime<=0&&p.recover<=0&&s.chargeKind!=='pass'){s.charging=true;s.chargeKind='shot';}
    if(s.charging&&(s.chargeKind==='pass'?(input.passHeld||pendingPassStart):(held||pendingKick))){const cap=s.chargeKind==='pass'?config.passing.chargeSeconds:ph.chargeSeconds;s.charge=Math.min(cap,s.charge+step);}
    pendingKick=pendingPassStart=false;
    if(pendingRelease){if(s.bufferedAction?.kind==='shot')s.bufferedAction.released=true;if(s.charging&&s.chargeKind==='shot'){kick(p,s.charge/ph.chargeSeconds);s.charging=false;s.charge=0;s.chargeKind=null;}pendingRelease=false;}
    if(pendingPassRelease){if(s.bufferedAction?.kind==='pass')s.bufferedAction.released=true;if(s.charging&&s.chargeKind==='pass'){kick(p,s.charge/config.passing.chargeSeconds,true);s.charging=false;s.charge=0;s.chargeKind=null;}pendingPassRelease=false;}
    sprint(step,length>aiConfig.idleThreshold,!!input.sprintHeld,p.recover<=0&&p.slideTime<=0);
    for(const member of players)if(member.distribution)updateDistribution(member);
    for(const member of players) {
      if(member.distribution){member.vx=member.vz=0;continue;}
      if(member.recover>0){member.vx=member.vz=0;continue;}
      if(member.slideTime>0){
        const speed=config.slide.distance/config.slide.seconds;member.vx=member.slideX*speed;member.vz=member.slideZ*speed;member.x=clamp(member.x+member.vx*step,-hx+rules.playerBoundary,hx-rules.playerBoundary);member.z=clamp(member.z+member.vz*step,-hz+rules.playerBoundary,hz-rules.playerBoundary);member.slideTime=Math.max(0,member.slideTime-step);
        if(!member.slideAttempted&&distance(member,s.ball)<=config.slide.reach){member.slideAttempted=true;member.slideWon=attempt(member,config.slide,'slide-contact');}
        if(member.slideTime<=0)member.recover=config.slide.recoverSeconds;
      }else if(member.id===s.controlled&&member.hands){
        const k=config.goalkeeping,d=direction(member.team);member.hold+=step;
        moveControlledKeeper(member,mx,mz,step);
        if(member.hold+1e-8>=k.maxHoldSeconds-keeperThrowLead){member.cooldown=0;kick(member,0,true);}
      }else if(member.id===s.controlled&&role==='keeper')moveControlledKeeper(member,mx,mz,step);
      else if(member.id===s.controlled&&s.ball.owner===null&&s.passTarget?.player===member.id&&length<=aiConfig.idleThreshold&&distance(member,s.passTarget)<(config.assistance?.contact?.receiveRunDistance??3.2))move(member,s.passTarget.x-member.x,s.passTarget.z-member.z,step,.82);
      else if(member.id===s.controlled && !(opponent.help && difficulty==='easy' && s.idle>aiConfig.idleHelpSeconds && !s.charging))move(member,mx,mz,step,(s.sprint.active?config.sprint.multiplier:1)*(s.charging?config.chargeSpeedMultiplier:1));
      else ai(member,step);
    }
    separatePlayers(s,config);
    for(const keeper of players)if(keeper.hands){const k=config.goalkeeping,d=direction(keeper.team);keeper.x=d*clamp(keeper.x*d,-hx+k.areaInset,-hx+config.pitch.penaltyDepth-k.areaInset);keeper.z=clamp(keeper.z,-config.pitch.penaltyWidth/2+k.areaInset,config.pitch.penaltyWidth/2-k.areaInset);}
    ball(step);s.mode=mode();s.elapsed+=step;s.halfElapsed+=step;
    if(s.halfElapsed+1e-8>=config.match.halfSeconds) {
      s.halfElapsed=config.match.halfSeconds;
      if(s.half===1){s.phase='halftime';s.phaseTime=config.match.halftimeSeconds;s.charging=false;s.charge=0;event('halftime');}
      else {s.elapsed=config.match.halfSeconds*2;s.phase='finished';s.result=matchResult(s);event('fulltime');}
    }
  }
  function clearInput(){held=previousKick=previousPass=previousSwitch=pendingSwitch=pendingRelease=pendingPass=pendingSlide=pendingKick=previousPassHeld=pendingPassStart=pendingPassRelease=false;s.bufferedAction=null;s.sprint.active=false;s.charging=false;s.charge=0;s.chargeKind=null;}
  return {
    update(dt,input={}) {
      if(!Number.isFinite(dt)||dt<=0 || s.result)return s;
      rawKickHeld=!!input.kickHeld;rawPassHeld=!!input.passHeld;
      if(!rawKickHeld)consumedKick=false;if(!rawPassHeld)consumedPass=false;
      if(s.restart?.action||players[s.controlled].distribution)consumeHeldActions();
      if(consumedKick||consumedPass)input={...input,kickHeld:consumedKick?false:input.kickHeld,passHeld:consumedPass?false:input.passHeld};
      // Stoppages must not queue a tap for the next kickoff or restart.
      if(s.phase!=='playing'&&s.phase!=='restartReady')clearInput();
      else {
      // Retain edges until a fixed tick, even on a 120 Hz display.
      if(input.switchPlayer&&!previousSwitch)pendingSwitch=true;previousSwitch=!!input.switchPlayer;
      if(input.passHeld&&!previousPassHeld)pendingPassStart=true;if(previousPassHeld&&!input.passHeld)pendingPassRelease=true;previousPassHeld=!!input.passHeld;
      held=!!input.kickHeld;
      if(held&&!previousKick){if(role==='keeper'&&s.ball.owner!==s.controlled)pendingSlide=true;else if(canHead(players[s.controlled],s.ball,config))pendingKick=true;else if(mode()==='defense')pendingSlide=true;else pendingKick=true;}
      if(previousKick&&!held)pendingRelease=true;previousKick=held;
      if(input.passPressed&&!previousPass)pendingPass=true;previousPass=!!input.passPressed;
      }
      accumulator+=Math.min(dt,rules.maxUpdateSeconds);
      while(accumulator+1e-10>=step){remember();tick(input);accumulator-=step;}
      return s;
    },
    /** Presentation copy of the state between the last two fixed steps (render interpolation),
     * so motion stays even when the display does not run at exactly 60 Hz. Never fed back. */
    renderState(){
      if(!before.valid)return s;
      const a=Math.min(1,Math.max(0,accumulator/step)),lerp=(x,y)=>x+(y-x)*a;
      // The copy is reused between frames (no per-frame garbage); it is overwritten in full on every call.
      const players=shown.players;players.length=s.players.length;
      for(let i=0;i<s.players.length;i++){const p=s.players[i],b=before.players[i],copy=Object.assign(players[i]||(players[i]={}),p);if(!b||Math.hypot(p.x-b[0],p.z-b[1])>1.5)continue;const fx=lerp(b[2],p.fx),fz=lerp(b[3],p.fz),l=Math.hypot(fx,fz)||1;copy.x=lerp(b[0],p.x);copy.z=lerp(b[1],p.z);copy.fx=fx/l;copy.fz=fz/l;}
      const B=before.ball,ball=Object.assign(shown.ball,s.ball);if(!(Math.hypot(s.ball.x-B[0],s.ball.z-B[2])>3)){ball.x=lerp(B[0],s.ball.x);ball.y=lerp(B[1],s.ball.y);ball.z=lerp(B[2],s.ball.z);}
      const out=Object.assign(shown.state,s);out.players=players;out.ball=ball;return out;
    },
    drainEvents(){const pending=events;events=[];return pending;},
    getState:()=>s,
    clearInput,
    snapshot:()=>JSON.parse(JSON.stringify(s)),
    get result(){return s.result;}
  };
}

import {cardEffects} from '../activity/soccer-card.mjs?v=g4b-20261017-1';
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
  const original=config.stages[stage-1],factors=config.difficulties[difficulty];
  if(typeof difficulty!=='string'||!Object.hasOwn(config.difficulties,difficulty))throw Error('Invalid soccer difficulty');
  const scaled={...original};
  for(const key of ['speed','stealRate','accuracy','keeper','tackleReach'])scaled[key]*=factors[key];
  scaled.thinkSeconds/=factors.thinkSeconds;
  return scaled;
}
/** Directed manual pass; teammates chase the endpoint rather than changing aim. */
export function passDestination(state,config,power=0){
  const distance=config.passing.minDistance+(config.passing.maxDistance-config.passing.minDistance)*clamp(power,0,1);
  const x=state.ball.x+state.aim.x*distance,z=state.ball.z+state.aim.z*distance,p=state.players[state.controlled];
  let target=null,best=Infinity;
  for(const member of state.players)if(member.team===p.team&&member.id!==p.id){const d=Math.hypot(member.x-x,member.z-z);if(d<best){best=d;target=member.id;}}
  return {x,z,distance,target};
}
export function createSoccer({config,seed=1,stage=1,team=config.team,random,difficulty='normal',card}={}) {
  if (!config?.stages?.length || !Number.isFinite(config.match?.fixedStep) || config.match.fixedStep<=0) throw Error('Invalid soccer config');
  seed=Number(seed)>>>0; stage=clamp(Math.round(finite(stage))||1,1,10);
  const rng=random || seededRandom(seed), opponent=opponentSettings(config,stage,difficulty), ph=config.physics,effects=cardEffects(card,config);
  const hx=config.pitch.length/2,hz=config.pitch.width/2,step=config.match.fixedStep,aiConfig=config.ai,rules=config.rules;
  const players=Array.from({length:6},(_,i)=>{
    const template=i<3?(team.players?.[i%3]||config.team.players[i%3]):config.opponentDefaults;
    const rank=key=>clamp(Math.round(finite(template[key]))||1,1,5);
    return {id:i,templateId:i<3?template.id:`opponent${i%3}`,team:i<3?0:1,role:['striker','support','keeper'][i%3],x:0,z:0,vx:0,vz:0,fx:i<3?1:-1,fz:0,speed:rank('speed'),kick:rank('kick'),guard:rank('guard'),cooldown:0,kickTime:0,request:false,think:0,hold:0,slideTime:0,recover:0,slideCooldown:0,stealCooldown:0,slideAttempted:false,slideWon:false,slideX:0,slideZ:0,sprinting:false,sprintTime:0,sprintRest:0};
  });
  const s={phase:'playing',half:1,halfElapsed:0,elapsed:0,phaseTime:0,score:[0,0],stage,seed,difficulty,mode:'attack',aim:{x:1,z:0},sprint:{value:config.sprint.capacity*effects.capacity,capacity:config.sprint.capacity*effects.capacity,active:false,locked:false,regenDelay:0},attackDir:1,controlled:0,players,ball:{x:0,z:0,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0,lastTeam:0,lastPlayer:0,grace:0},charge:0,charging:false,chargeKind:null,idle:0,defenseIdle:0,autoSwitchCandidate:null,passTarget:null,restart:null,event:null,eventId:0,result:null};
  let accumulator=0,held=false,previousSwitch=false,pendingSwitch=false,previousKick=false,pendingRelease=false,previousPass=false,pendingPass=false,pendingSlide=false,pendingKick=false,previousPassHeld=false,pendingPassStart=false,pendingPassRelease=false;
  function event(type,extra={}) { s.event={id:++s.eventId,type,...extra}; }
  function direction(teamId) { return s.attackDir*(teamId===0?1:-1); }
  function positionKickoff(teamId=0) {
    for (const p of players) {
      const d=direction(p.team),role=p.id%3;
      p.x=d*aiConfig.kickoffX[role];p.z=role===1?(p.team===0?-1:1)*aiConfig.kickoffZ:0;p.vx=p.vz=0;p.fx=d;p.fz=0;p.hold=0;p.think=aiConfig.initialThink;p.cooldown=aiConfig.initialCooldown;p.sprinting=false;p.sprintTime=p.sprintRest=0;
    }
    const owner=players[teamId*3];owner.x=-direction(teamId)*aiConfig.kickoffOwnerX;owner.z=0;
    Object.assign(s.ball,{x:0,z:0,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:owner.id,lastTeam:teamId,lastPlayer:owner.id,grace:aiConfig.kickoffGrace});
    s.charge=0;s.charging=false;s.chargeKind=null;s.defenseIdle=0;s.autoSwitchCandidate=null;s.passTarget=null;if(teamId===0)s.controlled=owner.id;
  }
  positionKickoff();
  function nearest(teamId,point,exclude=-1) {
    let best=null,bestDistance=Infinity;
    for(const p of players) if(p.team===teamId && p.id!==exclude) {const d=distance(p,point);if(d<bestDistance){best=p;bestDistance=d;}}
    return best;
  }
  function passTarget(p) {
    if(p.team===0)return nearest(p.team,p,p.id);
    let target=null,value=-Infinity;
    for(const member of players)if(member.team===p.team && member.id!==p.id && member.role!=='keeper'){
      const score=distance(nearest(0,member),member)+member.x*direction(p.team)*aiConfig.passSelectionAdvanceWeight;
      if(score>value){value=score;target=member;}
    }
    return target || nearest(p.team,p,p.id);
  }
  function kick(p,power=0,pass=false) {
    if(s.ball.owner!==p.id || p.cooldown>0)return;
    const d=direction(p.team),manual=p.id===s.controlled;let tx,tz,target=null,assisted=false;
    const aim=manual?s.aim:{x:p.fx,z:p.fz};
    if(pass) {
      let destination=null;
      if(manual){destination=passDestination(s,config,power);target=players[destination.target];tx=destination.x;tz=destination.z;}
      else{target=passTarget(p);tx=target?target.x+target.vx*aiConfig.passLeadSeconds:s.ball.x+aim.x;tz=target?target.z+target.vz*aiConfig.passLeadSeconds:s.ball.z+aim.z;}
      if(manual)s.passTarget={player:target.id,x:tx,z:tz,startX:s.ball.x,startZ:s.ball.z,distance:destination.distance,time:config.passing.runSeconds};
      event('pass',{team:p.team,player:p.id,target:target?.id??null,x:tx,z:tz,distance:destination?.distance??null,power});
    } else {
      const goalX=d*hx,gx=goalX-s.ball.x,gz=-s.ball.z;
      const angle=Math.acos(clamp((gx*aim.x+gz*aim.z)/(Math.hypot(gx,gz)||1),-1,1));
      assisted=manual&&p.x*d>0&&angle<=(config.aimAssistDegrees+effects.assistDegrees)*Math.PI/180;
      if(!manual||assisted){
        tx=manual?goalX:d*(hx+rules.goalTargetExtra);const accuracy=p.team===0?aiConfig.playerAccuracy:opponent.accuracy;
        tz=(rng()-.5)*config.pitch.goalWidth*Math.max(0,aiConfig.shotSpread-accuracy)*(manual?effects.spread:1);
        if(manual)tz=clamp(tz,-config.pitch.goalWidth/2+ph.ballRadius,config.pitch.goalWidth/2-ph.ballRadius);
      }else {tx=s.ball.x+aim.x;tz=s.ball.z+aim.z;}
      event('shot',{team:p.team,player:p.id,power,assisted});
    }
    const dx=tx-s.ball.x,dz=tz-s.ball.z,len=Math.hypot(dx,dz)||1;
    const passSpeed=pass&&manual?Math.hypot(tx-s.ball.x,tz-s.ball.z)*ph.friction/(1-Math.exp(-ph.friction*config.passing.travelSeconds)):ph.passSpeed;
    const speed=(pass?passSpeed:ph.shotSpeed+power*ph.shotBoost)*(1+(p.kick-1)*config.players.kickPerRank)*(manual&&!pass?effects.power:1);
    Object.assign(s.ball,{owner:null,vx:dx/len*speed,vz:dz/len*speed,vy:pass?aiConfig.passLift:aiConfig.shotLift+power*aiConfig.shotLiftPower,curve:pass||manual&&!assisted?0:(rng()-.5)*power*aiConfig.curveStrength*(manual?effects.spread:1),lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace});
    p.cooldown=aiConfig.kickCooldown;p.kickTime=aiConfig.kickAnimationSeconds;p.hold=0;
  }
  function move(p,dx,dz,dt,multiplier=1) {
    const length=Math.hypot(dx,dz),speed=(p.team===0?config.players.speed+(p.speed-1)*config.players.speedPerRank:opponent.speed)*multiplier*(p.id===s.controlled?effects.pace:1);
    const scale=length>1?1/length:1;
    const blend=Math.min(1,dt*config.players.acceleration);
    p.vx+=(dx*scale*speed-p.vx)*blend;p.vz+=(dz*scale*speed-p.vz)*blend;
    p.x=clamp(p.x+p.vx*dt,-hx+rules.playerBoundary,hx-rules.playerBoundary);p.z=clamp(p.z+p.vz*dt,-hz+rules.playerBoundary,hz-rules.playerBoundary);
    if(Math.hypot(p.vx,p.vz)>aiConfig.movingThreshold){const l=Math.hypot(p.vx,p.vz);p.fx=p.vx/l;p.fz=p.vz/l;}
  }
  function ai(p,dt) {
    const b=s.ball,d=direction(p.team),owner=b.owner===null?null:players[b.owner];
    const possession=owner?.team===p.team;
    let tx=p.x,tz=p.z;p.request=false;
    if(owner===p) {
      p.hold+=dt;tx=d*(hx-aiConfig.targetGoalInset);tz=p.z*aiConfig.dribbleCentering;
      if(p.think<=0) {
        const defender=nearest(1-p.team,p),pressure=distance(defender,p);
        const teammate=passTarget(p);
        const canPass=teammate.x*d>p.x*d-aiConfig.passAheadMargin && distance(nearest(1-p.team,teammate),teammate)>aiConfig.requestClearance;
        if(p.role==='keeper' || (canPass && (pressure<aiConfig.passPressure || (p.team===1 && stage>=aiConfig.quickPassStage && p.hold>aiConfig.quickPassHold && pressure<aiConfig.quickPassPressure))))kick(p,0,true);
        else if(p.x*d>hx-(p.team===0?aiConfig.teamShootDistance:aiConfig.opponentShootDistance) && p.hold>aiConfig.minShotHold)kick(p,p.team===0?aiConfig.teamShotPower:aiConfig.opponentShotPower+stage*aiConfig.opponentPowerPerStage);
        p.think=p.team===0?aiConfig.teamThinkSeconds:opponent.thinkSeconds;
      }
    } else if(p.role==='keeper') {
      tx=-d*(hx-aiConfig.keeperInset);tz=clamp(b.z*aiConfig.keeperTracking,-config.pitch.goalWidth/2+aiConfig.keeperPostInset,config.pitch.goalWidth/2-aiConfig.keeperPostInset);
      if(!possession && b.owner===null && Math.hypot(b.vx,b.vz)<aiConfig.keeperFastBall && b.x*d<-hx+aiConfig.keeperChaseDistance && distance(p,b)<aiConfig.keeperChaseRadius){tx=b.x;tz=b.z;}
    } else if(!possession && nearest(p.team,b)?.id===p.id) {
      tx=b.x+b.vx*aiConfig.interceptSeconds;tz=b.z+b.vz*aiConfig.interceptSeconds;
    } else if(possession) {
      tx=clamp(owner.x+d*(p.role==='support'?aiConfig.supportAdvance:aiConfig.strikerAdvance),-hx+aiConfig.supportGoalInset,hx-aiConfig.supportGoalInset);
      tz=owner.z>0?-aiConfig.supportWidth:aiConfig.supportWidth;p.request=distance(p,owner)>aiConfig.requestDistance && distance(nearest(1-p.team,p),p)>aiConfig.requestClearance;
    } else if(p.team===1 && opponent.pressure>=aiConfig.doublePress) {
      tx=b.x+b.vx*aiConfig.pressInterceptSeconds-d*aiConfig.pressFrontDistance;
      tz=b.z+b.vz*aiConfig.pressInterceptSeconds;
    } else {
      tx=b.x-d*(p.team===1?aiConfig.defenseDepth/opponent.pressure:aiConfig.teamDefenseDepth);tz=-b.z*aiConfig.defenseWidth;
    }
    if(p.team===0&&s.passTarget?.player===p.id&&s.passTarget.time>0&&b.owner===null){tx=s.passTarget.x;tz=s.passTarget.z;}
    // A deterministic duty cycle uses elapsed simulation time, never extra RNG.
    // Sprint never consumes RNG, including below the stage gate.
    p.sprintRest=Math.max(0,p.sprintRest-dt);p.sprintTime=Math.max(0,p.sprintTime-dt);
    if(owner===p&&p.team===1&&stage>=aiConfig.sprintFromStage&&p.role!=='keeper'&&p.sprintRest<=0&&distance(p,{x:tx,z:tz})>=aiConfig.sprintDistance){p.sprintTime=aiConfig.sprintSeconds;p.sprintRest=aiConfig.sprintRestSeconds;}
    p.sprinting=p.sprintTime>0;
    move(p,tx-p.x,tz-p.z,dt,p.role==='keeper'?aiConfig.keeperSpeedScale:p.sprinting?aiConfig.sprintMultiplier:1);
  }
  function mode(){return s.ball.owner!==null&&players[s.ball.owner].team===1?'defense':'attack';}
  function takeBall(p){
    const b=s.ball;if(b.owner!==null)players[b.owner].cooldown=rules.tackleCooldown;
    Object.assign(b,{owner:p.id,lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace,vx:0,vz:0,vy:0,curve:0});
    if(p.team===0)s.controlled=p.id;s.passTarget=null;s.charging=false;s.charge=0;s.chargeKind=null;
  }
  function attempt(p,settings,type){
    const b=s.ball,owner=b.owner===null?null:players[b.owner];
    if(owner?.team===p.team||distance(p,b)>settings.reach||b.y>rules.pickupHeight)return false;
    const chance=clamp(settings.baseChance*(1+(p.guard-1)*config.players.defensePerRank)+(p.id===s.controlled?effects.defense:0),0,1),won=rng()<chance;
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
    s.phase='restart';s.phaseTime=config.match.restartSeconds;s.restart={type,team:teamId,x,z};
    const owner=nearest(teamId,{x,z});owner.x=x;owner.z=z;owner.vx=owner.vz=0;owner.fx=direction(teamId);owner.fz=0;
    for(const p of players)if(p!==owner && distance(p,owner)<rules.restartSpace){p.x=clamp(p.x-direction(teamId)*rules.restartPushX,-hx+rules.restartPlayerInset,hx-rules.restartPlayerInset);p.z=clamp(p.z+(p.id%2?1:-1)*rules.restartPushZ,-hz+rules.restartPlayerInset,hz-rules.restartPlayerInset);}
    Object.assign(s.ball,{x,z,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:owner.id,grace:rules.restartGrace,lastTeam:teamId,lastPlayer:owner.id});
    if(teamId===0)s.controlled=owner.id;s.passTarget=null;s.chargeKind=null;
    s.charging=false;s.charge=0;event('restart',{restart:type,team:teamId});
  }
  function goal(teamId) {
    s.score[teamId]++;s.phase='goal';s.phaseTime=config.match.goalSeconds;s.charging=false;s.charge=0;
    event('goal',{team:teamId});
  }
  function ball(dt) {
    const b=s.ball,oldX=b.x;b.grace=Math.max(0,b.grace-dt);
    if(b.owner!==null){const p=players[b.owner];b.x=p.x+p.fx*ph.dribbleOffset;b.z=p.z+p.fz*ph.dribbleOffset;b.y=ph.ballRadius;b.vx=p.vx;b.vz=p.vz;b.vy=0;}
    else {
      b.vx+=-b.vz*b.curve*dt;b.vz+=b.vx*b.curve*dt;b.curve*=Math.exp(-rules.ballCurveDecay*dt);
      b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;b.vy-=ph.gravity*dt;
      const pass=s.passTarget;if(pass&&Math.hypot(b.x-pass.startX,b.z-pass.startZ)>=pass.distance){b.x=pass.x;b.z=pass.z;b.vx=b.vz=b.vy=0;b.y=ph.ballRadius;}
      if(b.y<ph.ballRadius){b.y=ph.ballRadius;b.vy=Math.abs(b.vy)>rules.bounceThreshold?-b.vy*ph.bounce:0;}
      const friction=Math.exp(-ph.friction*dt*(b.y<=ph.ballRadius+rules.groundThreshold?1:rules.airFrictionScale));b.vx*=friction;b.vz*=friction;
    }
      // Sweep the goal plane for both shots and dribbles.
      if(Math.abs(b.x)>=hx && Math.abs(oldX)<hx) {
        const t=(Math.sign(b.x)*hx-oldX)/(b.x-oldX),z=b.z-b.vz*dt*(1-t);
        if(Math.abs(z)<config.pitch.goalWidth/2-ph.ballRadius && b.y<config.pitch.goalHeight-ph.ballRadius){goal(b.x*s.attackDir>0?0:1);return;}
      }
    if(Math.abs(b.x)>hx+rules.outMargin || Math.abs(b.z)>hz+rules.outMargin){
      const end=Math.abs(b.x)>hx,defender=b.x*s.attackDir>0?1:0;
      const corner=end && b.lastTeam===defender;
      const teamId=end?(corner?1-defender:defender):1-b.lastTeam;
      restart(corner?'corner':'goalKick',teamId,end?(corner?Math.sign(b.x)*(hx-rules.cornerInset):Math.sign(b.x)*(hx-rules.goalKickInset)):clamp(b.x,-hx+rules.sideGoalInset,hx-rules.sideGoalInset),corner?Math.sign(b.z||1)*(hz-rules.cornerInset):end?0:Math.sign(b.z)*(hz-rules.sideInset));return;
    }
    for(const p of players) {
      if(p.id===b.owner || p.cooldown>0 || p.recover>0 || p.slideTime>0 || b.y>rules.pickupHeight)continue;
      const dist=distance(p,b),owner=b.owner===null?null:players[b.owner];
      if(owner) {
        if(p.id===s.controlled)continue;
        const reach=p.role==='keeper'?aiConfig.keeperBaseReach+(p.team===0?aiConfig.teamKeeper:opponent.keeper)*aiConfig.keeperReachScale:p.team===0?rules.stealRadius:opponent.tackleReach;
        if(p.team===owner.team || b.grace>0 || dist>reach)continue;
        const rate=(p.team===0?aiConfig.teamStealRate*(1+(p.guard-1)*config.players.defensePerRank):opponent.stealRate)+(p.role==='keeper'?(p.team===0?aiConfig.teamKeeper:opponent.keeper)*aiConfig.keeperStealRate:0);
        if(rng()>1-Math.exp(-rate*dt))continue;
        owner.cooldown=rules.tackleCooldown;
      } else {
        const keeper=p.role==='keeper' && b.lastTeam!==p.team && Math.hypot(b.vx,b.vz)>aiConfig.keeperFastBall;
        const radius=keeper?aiConfig.keeperBaseReach+(p.team===0?aiConfig.teamKeeper:opponent.keeper)*aiConfig.keeperReachScale:ph.pickupRadius;
        if(dist>radius || (b.grace>0 && p.id===b.lastPlayer))continue;
        if(keeper && b.grace>0 && rng()>(p.team===0?aiConfig.teamKeeperSave:opponent.keeper)) {p.cooldown=aiConfig.keeperAttemptCooldown;continue;}
      }
      takeBall(p);p.hold=0;event('possession',{team:p.team,player:p.id});break;
    }
  }
  function tick(input) {
    if(s.result)return;
    for(const p of players){p.cooldown=Math.max(0,p.cooldown-step);p.kickTime=Math.max(0,p.kickTime-step);p.think-=step;p.slideCooldown=Math.max(0,p.slideCooldown-step);p.stealCooldown=Math.max(0,p.stealCooldown-step);p.recover=Math.max(0,p.recover-step);}
    if(s.phase!=='playing') {
      s.phaseTime-=step;
      if(s.phase==='goal'){s.ball.x=clamp(s.ball.x+s.ball.vx*step*rules.goalSlowMotion,-hx-rules.netBallInset,hx+rules.netBallInset);s.ball.z=clamp(s.ball.z+s.ball.vz*step*rules.goalSlowMotion,-rules.netBallWidth,rules.netBallWidth);s.ball.y=Math.max(ph.ballRadius,s.ball.y-step);}
      if(s.phaseTime<=0){
        if(s.phase==='goal')positionKickoff(1-(s.event?.team??0));
        if(s.phase==='halftime'){s.half=2;s.halfElapsed=0;s.attackDir=-1;positionKickoff(1);}
        s.phase='playing';s.restart=null;event('play');
      }
      return;
    }
    if(s.passTarget){s.passTarget.time=Math.max(0,s.passTarget.time-step);if(!s.passTarget.time)s.passTarget=null;}
    const candidate=nearest(0,s.ball),current=players[s.controlled];
    const advantage=distance(current,s.ball)-distance(candidate,s.ball);
    if(mode()==='defense'&&candidate.id!==current.id&&advantage>=config.autoSwitchAdvantage){
      s.defenseIdle=s.autoSwitchCandidate===candidate.id?s.defenseIdle+step:step;s.autoSwitchCandidate=candidate.id;
      if(s.defenseIdle+1e-8>=config.autoSwitchSeconds)pendingSwitch=true;
    }else{s.defenseIdle=0;s.autoSwitchCandidate=null;}
    if(pendingSwitch){s.defenseIdle=0;s.autoSwitchCandidate=null;s.controlled=candidate.id;s.charging=false;s.charge=0;s.chargeKind=null;pendingSwitch=false;}
    const p=players[s.controlled],mx=clamp(finite(input.moveX),-1,1),mz=clamp(finite(input.moveZ),-1,1),length=Math.hypot(mx,mz);
    s.aim=length>aiConfig.idleThreshold?{x:mx/length,z:mz/length}:{x:p.fx,z:p.fz};
    s.mode=mode();
    s.idle=length>aiConfig.idleThreshold||held||input.passHeld?0:s.idle+step;
    if(s.mode==='defense'){s.charging=false;s.charge=0;s.chargeKind=null;}
    if(pendingSlide&&s.mode==='defense'&&p.slideCooldown<=0&&p.recover<=0&&p.slideTime<=0){
      p.slideTime=config.slide.seconds;p.slideCooldown=config.slide.cooldownSeconds;p.slideX=s.aim.x;p.slideZ=s.aim.z;p.slideAttempted=false;p.slideWon=false;
      event('slide',{player:p.id});
    }
    pendingSlide=false;
    if(pendingPass){
      if(s.mode==='defense'&&p.stealCooldown<=0&&p.recover<=0&&p.slideTime<=0){p.stealCooldown=config.steal.cooldownSeconds;attempt(p,config.steal,'steal');}
      else if(s.mode==='attack'&&p.recover<=0&&p.slideTime<=0)kick(p,0,true);
      pendingPass=false;
    }
    if(pendingPassStart){
      if(s.mode==='defense'&&p.stealCooldown<=0&&p.recover<=0&&p.slideTime<=0){p.stealCooldown=config.steal.cooldownSeconds;attempt(p,config.steal,'steal');}
      else if(!s.charging&&s.ball.owner===p.id&&p.slideTime<=0&&p.recover<=0){s.charging=true;s.chargeKind='pass';s.charge=0;}
    }
    if((held||pendingKick)&&s.mode==='attack'&&s.ball.owner===p.id&&p.slideTime<=0&&p.recover<=0&&s.chargeKind!=='pass'){s.charging=true;s.chargeKind='shot';}
    if(s.charging&&(s.chargeKind==='pass'?(input.passHeld||pendingPassStart):(held||pendingKick))){const cap=s.chargeKind==='pass'?config.passing.chargeSeconds:ph.chargeSeconds;s.charge=Math.min(cap,s.charge+step);}
    pendingKick=pendingPassStart=false;
    if(pendingRelease){if(s.charging&&s.chargeKind==='shot'){kick(p,s.charge/ph.chargeSeconds);s.charging=false;s.charge=0;s.chargeKind=null;}pendingRelease=false;}
    if(pendingPassRelease){if(s.charging&&s.chargeKind==='pass'){kick(p,s.charge/config.passing.chargeSeconds,true);s.charging=false;s.charge=0;s.chargeKind=null;}pendingPassRelease=false;}
    sprint(step,length>aiConfig.idleThreshold,!!input.sprintHeld,p.recover<=0&&p.slideTime<=0);
    for(const member of players) {
      if(member.recover>0){member.vx=member.vz=0;continue;}
      if(member.slideTime>0){
        move(member,member.slideX,member.slideZ,step,config.slide.speedMultiplier);member.slideTime=Math.max(0,member.slideTime-step);
        if(!member.slideAttempted&&distance(member,s.ball)<=config.slide.reach){member.slideAttempted=true;member.slideWon=attempt(member,config.slide,'slide-contact');}
        if(member.slideTime<=0&&!member.slideWon)member.recover=config.slide.recoverSeconds;
      }else if(member.id===s.controlled && !(opponent.help && s.idle>aiConfig.idleHelpSeconds && !s.charging))move(member,mx,mz,step,(s.sprint.active?config.sprint.multiplier:1)*(s.charging?config.chargeSpeedMultiplier:1));
      else ai(member,step);
    }
    // Soft separation prevents piling up without fouls or trapping the ball.
    for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
      const a=players[i],b=players[j],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),min=config.players.radius*2;
      if(a.recover>0||b.recover>0)continue;
      if(l>0 && l<min){const push=(min-l)*rules.separationScale;a.x=clamp(a.x-dx/l*push,-hx+rules.playerBoundary,hx-rules.playerBoundary);b.x=clamp(b.x+dx/l*push,-hx+rules.playerBoundary,hx-rules.playerBoundary);a.z=clamp(a.z-dz/l*push,-hz+rules.playerBoundary,hz-rules.playerBoundary);b.z=clamp(b.z+dz/l*push,-hz+rules.playerBoundary,hz-rules.playerBoundary);}
    }
    ball(step);s.mode=mode();s.elapsed+=step;s.halfElapsed+=step;
    if(s.halfElapsed+1e-8>=config.match.halfSeconds) {
      s.halfElapsed=config.match.halfSeconds;
      if(s.half===1){s.phase='halftime';s.phaseTime=config.match.halftimeSeconds;s.charging=false;s.charge=0;event('halftime');}
      else {s.elapsed=config.match.halfSeconds*2;s.phase='finished';s.result=matchResult(s);event('fulltime');}
    }
  }
  return {
    update(dt,input={}) {
      if(!Number.isFinite(dt)||dt<=0 || s.result)return s;
      // Retain edges until a fixed tick, even on a 120 Hz display.
      if(input.switchPlayer&&!previousSwitch)pendingSwitch=true;previousSwitch=!!input.switchPlayer;
      if(input.passHeld&&!previousPassHeld)pendingPassStart=true;if(previousPassHeld&&!input.passHeld)pendingPassRelease=true;previousPassHeld=!!input.passHeld;
      held=!!input.kickHeld;
      if(held&&!previousKick){if(mode()==='defense')pendingSlide=true;else pendingKick=true;}
      if(previousKick&&!held)pendingRelease=true;previousKick=held;
      if(input.passPressed&&!previousPass)pendingPass=true;previousPass=!!input.passPressed;
      accumulator+=Math.min(dt,rules.maxUpdateSeconds);
      while(accumulator+1e-10>=step){tick(input);accumulator-=step;}
      return s;
    },
    getState:()=>s,
    clearInput(){held=previousKick=previousPass=previousSwitch=pendingSwitch=pendingRelease=pendingPass=pendingSlide=pendingKick=previousPassHeld=pendingPassStart=pendingPassRelease=false;s.sprint.active=false;s.charging=false;s.charge=0;s.chargeKind=null;},
    snapshot:()=>JSON.parse(JSON.stringify(s)),
    get result(){return s.result;}
  };
}

// Pure simulation. No browser, Three.js, storage, wall clock or Math.random.
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const finite = n => Number.isFinite(n) ? n : 0;
export function seededRandom(seed) {
  let n = Number(seed) >>> 0;
  return () => { n += 0x6D2B79F5; let t=n; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
}
export function matchResult({score,stage,seed,elapsed}) {
  const [goalsFor,goalsAgainst]=score, won=goalsFor>goalsAgainst;
  return {won,goalsFor,goalsAgainst,stage,stars:won && goalsAgainst===0 ? 3 : won && goalsFor-goalsAgainst>=2 ? 2 : 1,seed,durationSeconds:Math.round(elapsed*1000)/1000};
}
export function createSoccer({config,seed=1,stage=1,team=config.team,random}={}) {
  if (!config?.stages?.length || !Number.isFinite(config.match?.fixedStep) || config.match.fixedStep<=0) throw Error('Invalid soccer config');
  seed=Number(seed)>>>0; stage=clamp(Math.round(finite(stage))||1,1,10);
  const rng=random || seededRandom(seed), difficulty=config.stages[stage-1], ph=config.physics;
  const hx=config.pitch.length/2,hz=config.pitch.width/2,step=config.match.fixedStep,aiConfig=config.ai,rules=config.rules;
  const players=Array.from({length:6},(_,i)=>{
    const template=i<3?(team.players?.[i%3]||config.team.players[i%3]):config.opponentDefaults;
    const rank=key=>clamp(Math.round(finite(template[key]))||1,1,5);
    return {id:i,templateId:i<3?template.id:`opponent${i%3}`,team:i<3?0:1,role:['striker','support','keeper'][i%3],x:0,z:0,vx:0,vz:0,fx:i<3?1:-1,fz:0,speed:rank('speed'),kick:rank('kick'),guard:rank('guard'),cooldown:0,kickTime:0,request:false,think:0,hold:0};
  });
  const s={phase:'playing',half:1,halfElapsed:0,elapsed:0,phaseTime:0,score:[0,0],stage,seed,attackDir:1,controlled:0,players,ball:{x:0,z:0,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0,lastTeam:0,lastPlayer:0,grace:0},charge:0,charging:false,idle:0,restart:null,event:null,eventId:0,result:null};
  let accumulator=0,held=false,previousSwitch=false,pendingSwitch=false,previousKick=false,pendingRelease=false;
  function event(type,extra={}) { s.event={id:++s.eventId,type,...extra}; }
  function direction(teamId) { return s.attackDir*(teamId===0?1:-1); }
  function positionKickoff(teamId=0) {
    for (const p of players) {
      const d=direction(p.team),role=p.id%3;
      p.x=d*aiConfig.kickoffX[role];p.z=role===1?(p.team===0?-1:1)*aiConfig.kickoffZ:0;p.vx=p.vz=0;p.fx=d;p.fz=0;p.hold=0;p.think=aiConfig.initialThink;p.cooldown=aiConfig.initialCooldown;
    }
    const owner=players[teamId*3];owner.x=-direction(teamId)*aiConfig.kickoffOwnerX;owner.z=0;
    Object.assign(s.ball,{x:0,z:0,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:owner.id,lastTeam:teamId,lastPlayer:owner.id,grace:aiConfig.kickoffGrace});
    s.charge=0;s.charging=false;
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
    const d=direction(p.team); let tx,tz;
    if(pass) {
      const target=passTarget(p);
      tx=target.x+target.vx*aiConfig.passLeadSeconds;tz=target.z+target.vz*aiConfig.passLeadSeconds;
      event('pass',{team:p.team,player:p.id,target:target.id});
    } else {
      tx=d*(hx+rules.goalTargetExtra);const accuracy=p.team===0?aiConfig.playerAccuracy:difficulty.accuracy;
      // A little seeded curl and spread; player shots always aim at the goal.
      tz=(rng()-.5)*config.pitch.goalWidth*(aiConfig.shotSpread-accuracy);
      event('shot',{team:p.team,player:p.id,power});
    }
    const dx=tx-s.ball.x,dz=tz-s.ball.z,len=Math.hypot(dx,dz)||1;
    const speed=(pass?ph.passSpeed:ph.shotSpeed+power*ph.shotBoost)*(1+(p.kick-1)*config.players.kickPerRank);
    Object.assign(s.ball,{owner:null,vx:dx/len*speed,vz:dz/len*speed,vy:pass?aiConfig.passLift:aiConfig.shotLift+power*aiConfig.shotLiftPower,curve:pass?0:(rng()-.5)*power*aiConfig.curveStrength,lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace});
    p.cooldown=aiConfig.kickCooldown;p.kickTime=aiConfig.kickAnimationSeconds;p.hold=0;
    // Short passes make switching optional: the child controls the receiver.
    if(pass && p.team===0)s.controlled=nearest(0,{x:tx,z:tz},p.id).id;
  }
  function move(p,dx,dz,dt,multiplier=1) {
    const length=Math.hypot(dx,dz),speed=(p.team===0?config.players.speed+(p.speed-1)*config.players.speedPerRank:difficulty.speed)*multiplier;
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
        p.think=p.team===0?aiConfig.teamThinkSeconds:difficulty.thinkSeconds;
      }
    } else if(p.role==='keeper') {
      tx=-d*(hx-aiConfig.keeperInset);tz=clamp(b.z*aiConfig.keeperTracking,-config.pitch.goalWidth/2+aiConfig.keeperPostInset,config.pitch.goalWidth/2-aiConfig.keeperPostInset);
      if(!possession && b.owner===null && Math.hypot(b.vx,b.vz)<aiConfig.keeperFastBall && b.x*d<-hx+aiConfig.keeperChaseDistance && distance(p,b)<aiConfig.keeperChaseRadius){tx=b.x;tz=b.z;}
    } else if(!possession && nearest(p.team,b)?.id===p.id) {
      tx=b.x+b.vx*aiConfig.interceptSeconds;tz=b.z+b.vz*aiConfig.interceptSeconds;
    } else if(possession) {
      tx=clamp(owner.x+d*(p.role==='support'?aiConfig.supportAdvance:aiConfig.strikerAdvance),-hx+aiConfig.supportGoalInset,hx-aiConfig.supportGoalInset);
      tz=owner.z>0?-aiConfig.supportWidth:aiConfig.supportWidth;p.request=distance(p,owner)>aiConfig.requestDistance && distance(nearest(1-p.team,p),p)>aiConfig.requestClearance;
    } else if(p.team===1 && difficulty.pressure>=aiConfig.doublePress) {
      tx=b.x+b.vx*aiConfig.pressInterceptSeconds-d*aiConfig.pressFrontDistance;
      tz=b.z+b.vz*aiConfig.pressInterceptSeconds;
    } else {
      tx=b.x-d*(p.team===1?aiConfig.defenseDepth/difficulty.pressure:aiConfig.teamDefenseDepth);tz=-b.z*aiConfig.defenseWidth;
    }
    move(p,tx-p.x,tz-p.z,dt,p.role==='keeper'?aiConfig.keeperSpeedScale:1);
  }
  function restart(type,teamId,x,z) {
    s.phase='restart';s.phaseTime=config.match.restartSeconds;s.restart={type,team:teamId,x,z};
    const owner=nearest(teamId,{x,z});owner.x=x;owner.z=z;owner.vx=owner.vz=0;owner.fx=direction(teamId);owner.fz=0;
    for(const p of players)if(p!==owner && distance(p,owner)<rules.restartSpace){p.x=clamp(p.x-direction(teamId)*rules.restartPushX,-hx+rules.restartPlayerInset,hx-rules.restartPlayerInset);p.z=clamp(p.z+(p.id%2?1:-1)*rules.restartPushZ,-hz+rules.restartPlayerInset,hz-rules.restartPlayerInset);}
    Object.assign(s.ball,{x,z,y:ph.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:owner.id,grace:rules.restartGrace,lastTeam:teamId,lastPlayer:owner.id});
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
      if(p.id===b.owner || p.cooldown>0 || b.y>rules.pickupHeight)continue;
      const dist=distance(p,b),owner=b.owner===null?null:players[b.owner];
      if(owner) {
        const reach=p.role==='keeper'?aiConfig.keeperBaseReach+(p.team===0?aiConfig.teamKeeper:difficulty.keeper)*aiConfig.keeperReachScale:p.team===0?rules.stealRadius:difficulty.tackleReach;
        if(p.team===owner.team || b.grace>0 || dist>reach)continue;
        const rate=(p.team===0?aiConfig.teamStealRate*(1+(p.guard-1)*config.players.defensePerRank):difficulty.stealRate)+(p.role==='keeper'?(p.team===0?aiConfig.teamKeeper:difficulty.keeper)*aiConfig.keeperStealRate:0);
        if(rng()>1-Math.exp(-rate*dt))continue;
        owner.cooldown=rules.tackleCooldown;
      } else {
        const keeper=p.role==='keeper' && b.lastTeam!==p.team && Math.hypot(b.vx,b.vz)>aiConfig.keeperFastBall;
        const radius=keeper?aiConfig.keeperBaseReach+(p.team===0?aiConfig.teamKeeper:difficulty.keeper)*aiConfig.keeperReachScale:ph.pickupRadius;
        if(dist>radius || (b.grace>0 && p.id===b.lastPlayer))continue;
        if(keeper && b.grace>0 && rng()>(p.team===0?aiConfig.teamKeeperSave:difficulty.keeper)) {p.cooldown=aiConfig.keeperAttemptCooldown;continue;}
      }
      Object.assign(b,{owner:p.id,lastTeam:p.team,lastPlayer:p.id,grace:ph.possessionGrace,vx:0,vz:0,vy:0,curve:0});p.hold=0;event('possession',{team:p.team,player:p.id});break;
    }
  }
  function tick(input) {
    if(s.result)return;
    for(const p of players){p.cooldown=Math.max(0,p.cooldown-step);p.kickTime=Math.max(0,p.kickTime-step);p.think-=step;}
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
    if(pendingSwitch){s.controlled=nearest(0,s.ball).id;s.charging=false;s.charge=0;pendingSwitch=false;}
    const p=players[s.controlled],mx=clamp(finite(input.moveX),-1,1),mz=clamp(finite(input.moveZ),-1,1);
    s.idle=Math.hypot(mx,mz)>aiConfig.idleThreshold||held?0:s.idle+step;
    if(held){s.charging=true;s.charge=Math.min(config.physics.chargeSeconds,s.charge+step);}
    if(pendingRelease){if(s.charging)kick(p,s.charge/ph.chargeSeconds,s.charge<ph.shortPressSeconds);s.charging=false;s.charge=0;pendingRelease=false;}
    for(const member of players) {
      if(member.id===s.controlled && !(difficulty.help && s.idle>aiConfig.idleHelpSeconds && !s.charging))move(member,mx,mz,step);
      else ai(member,step);
    }
    // Soft separation prevents piling up without fouls or trapping the ball.
    for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
      const a=players[i],b=players[j],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),min=config.players.radius*2;
      if(l>0 && l<min){const push=(min-l)*rules.separationScale;a.x=clamp(a.x-dx/l*push,-hx+rules.playerBoundary,hx-rules.playerBoundary);b.x=clamp(b.x+dx/l*push,-hx+rules.playerBoundary,hx-rules.playerBoundary);a.z=clamp(a.z-dz/l*push,-hz+rules.playerBoundary,hz-rules.playerBoundary);b.z=clamp(b.z+dz/l*push,-hz+rules.playerBoundary,hz-rules.playerBoundary);}
    }
    ball(step);s.elapsed+=step;s.halfElapsed+=step;
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
      held=!!input.kickHeld;if(previousKick&&!held)pendingRelease=true;previousKick=held;
      accumulator+=Math.min(dt,rules.maxUpdateSeconds);
      while(accumulator+1e-10>=step){tick(input);accumulator-=step;}
      return s;
    },
    getState:()=>s,
    clearInput(){held=previousKick=previousSwitch=pendingSwitch=pendingRelease=false;s.charging=false;s.charge=0;},
    snapshot:()=>JSON.parse(JSON.stringify(s)),
    get result(){return s.result;}
  };
}

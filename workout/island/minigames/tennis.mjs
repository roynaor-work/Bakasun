// Pure, fixed-step tennis. Coordinates: child +Z, opponent -Z; metres/seconds.
// No DOM, storage, wall clock or Math.random. The host owns loading and lifecycle.
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function serveMeterAt(seconds, riseSeconds) {
  const phase = ((seconds / riseSeconds) % 2 + 2) % 2;
  return { value: phase <= 1 ? phase : 2 - phase, direction: phase < 1 ? 1 : -1 };
}
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value + 0x6D2B79F5) >>> 0; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createScore() { return { points: [0, 0], games: [0, 0], finished: false, winner: null }; }
export function awardPoint(score, side, rules) {
  if (score.finished || ![0, 1].includes(side)) return { game: false, match: score.finished };
  score.points[side]++;
  const other = 1 - side;
  const game = score.points[side] >= rules.pointsToWin && score.points[side] - score.points[other] >= rules.pointMargin;
  if (game) { score.games[side]++; score.points = [0, 0]; }
  if (score.games[side] >= rules.gamesToWin) { score.finished = true; score.winner = side; }
  return { game, match: score.finished };
}
export function pointLabels(score, rules) {
  const [a, b] = score.points;
  if (a >= rules.pointsToWin - 1 && b >= rules.pointsToWin - 1) {
    if (a === b) return ['deuce', 'deuce'];
    return a > b ? ['advantage', ''] : ['', 'advantage'];
  }
  return score.points.map(n => rules.pointValues[Math.min(n, rules.pointValues.length - 1)]);
}
export function buildResult(score, stage, seed, durationSeconds, rules) {
  if (!score.finished) return null;
  const won = score.winner === 0;
  const stars = won ? score.games[1] === 0 ? rules.perfectStars : score.games[1] <= rules.goodWinAgainst ? rules.goodWinStars : rules.winStars : rules.lossStars;
  return { won, gamesFor: score.games[0], gamesAgainst: score.games[1], stage, stars, seed, durationSeconds: Math.round(durationSeconds * 1000) / 1000 };
}
// Solve the next ground contact and the rising, post-bounce racket contact.
export function predictLanding(ball, config) {
  const c = config.ball, g = c.gravity+(ball.spin||0)*(c.topspinGravity||.45);
  const t = Math.max(0, (ball.vy + Math.sqrt(Math.max(0, ball.vy ** 2 + 2 * g * (ball.y - c.radius)))) / g);
  return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t, seconds: t };
}
export function createTennis({ config, stage = 1, seed = config.seed, ranks = config.player.defaults,difficulty='easy' } = {}) {
  stage = clamp(Math.trunc(Number(stage) || 1), 1, config.levels.length);
  seed = Number(seed) >>> 0;
  const rng = seededRandom(seed), selected=config.levels[stage-1],d=config.difficulties?.[difficulty]||{speed:1,timing:1,miss:0},level={...selected,speed:selected.speed*d.speed,timingWindow:selected.timingWindow*d.timing,missChance:clamp(selected.missChance+d.miss,0,config.opponent.maximumMissChance)}, p = config.player, c = config.ball, court = config.court, rules = config.rules;
  const safeRanks = Object.fromEntries(['speed', 'hit', 'serve'].map(k => [k, clamp(Math.trunc(Number(ranks[k]) || p.defaults[k]), p.rankMin, p.rankMax)]));
  const contactConfig={bufferSeconds:.24,minHeight:.32,maxHeight:2.25,assistRadius:2.05,assistSpeed:1.65,assistMaxStep:.55,edgePowerPenalty:.22,edgeSpread:.3,...p.contact};
  const attributes = { speed: p.speedByRank[safeRanks.speed - 1], hitPower: p.hitPowerByRank[safeRanks.hit - 1], servePower: p.servePowerByRank[safeRanks.serve - 1], reach: p.reach * (d.reach || 1) };
  const score = createScore();
  const state = { stage, seed, ranks: safeRanks, attributes, timingWindow: level.timingWindow, faults:0,serveMeter:0,serveZone:'red',serveSide:1,phase: 'serve', elapsed: 0, phaseTime: 0, server: 0, score, pointLabels: [0, 0], players: [{ x: 0, z: p.readyZ, swing: 0, running: false }, { x: 0, z: -p.readyZ, swing: 0, running: false }], ball: { x: 0, y: c.serveHeight, z: p.readyZ, vx: 0, vy: 0, vz: 0, bounces: 0, lastHitter: 0 }, landing: null, contact: null, charge: 0, rallyHits: 0, pointNumber: 0, event: { id: 0, type: 'ready' }, result: null, shot: null,contactWindow:null,assist:{active:false,distance:0},feedback:{kind:'ready',age:0} };
  let lob=false,drop=false,aim=null,serveWasDown=false,serveHeld=0,pendingShot=null;let accumulator = 0, inputWasSwing = false, pendingTap = null, pendingUntil=0, cooldown = 0, rallyTime = 0, shotTime = 0, aiMiss = false, aiOffset = 0;
  function emit(type, details = {}) { state.event = { id: state.event.id + 1, type, ...details };state.feedback={kind:type,age:0,...details}; }
  function prepareServe() {
    state.phase = 'serve'; state.phaseTime = 0;state.assist={active:false,distance:0}; state.charge = 0; state.rallyHits = 0; pendingTap = null;pendingShot=null; rallyTime = 0;
    state.serveSide=(score.points[0]+score.points[1])%2===0?1:-1;
    for (let i=0;i<2;i++){const serverSign=state.server===0?1:-1;state.players[i].x=(i===state.server?1:-1)*serverSign*state.serveSide*config.serve.sideX;state.players[i].z=(i===0?1:-1)*(court.halfLength+config.serve.baselineMargin);state.players[i].vx=state.players[i].vz=0;}
    state.serveMeter=0;state.serveMeterDirection=1;state.tossProgress=0;state.serveZone='red';state.manualMovement=false;if(!state.faults)state.faultMark=null;
    state.players.forEach(player=>{player.assistTravel=0;player.swing=0;player.contactPoint=null;player.preparing=false;player.running=false;player.serving=false;});
    Object.assign(state.ball, { x: 0, y: c.serveHeight, z: state.players[state.server].z, vx: 0, vy: 0, vz: 0, bounces: 0, lastHitter: state.server });
    state.landing = null; state.contact = null; state.shot = null; emit('ready');
  }
  function point(winner, reason) {
    if (!['rally','serve','toss'].includes(state.phase)) return;
    const ace = state.rallyHits === 1 && state.ball.lastHitter === state.server && winner === state.server && reason !== 'out' && reason !== 'net';
    state.ball.vx = state.ball.vy = state.ball.vz = 0;
    state.players.forEach(player=>{player.running=false;player.vx=player.vz=0;});
    const transition = awardPoint(score, winner, rules);
    state.faults=0;state.pointLabels = pointLabels(score, rules); state.pointNumber++; state.phaseTime = 0;
    state.phase = transition.match ? 'complete' : transition.game ? 'game' : 'point';
    state.result = buildResult(score, stage, seed, state.elapsed, rules);if(state.result)state.result.difficulty=difficulty;
    emit(transition.match ? 'complete' : transition.game ? 'game' : 'point', { winner, reason, ace });
    state.landing = null; state.contact = null; pendingTap = null;
    if (transition.game) state.server = 1 - state.server;
  }
  function planContact() {
    const b = state.ball, landing = predictLanding(b, config);
    const gravity=c.gravity+(b.spin||0)*(c.topspinGravity||.45),downSpeed = b.vy - gravity * landing.seconds;
    const upSpeed = -downSpeed * (state.shot?.drop ? config.drop.bounce : c.bounce);
    const apex=c.radius+upSpeed**2/(2*gravity),height=Math.min(c.hitHeight,apex);
    const discriminant = upSpeed ** 2 - 2 * gravity * (height - c.radius);
    const afterBounce = (upSpeed - Math.sqrt(Math.max(0, discriminant))) / gravity;
    state.landing = { ...landing, valid: Math.abs(landing.x) <= court.halfWidth + court.lineTolerance && Math.abs(landing.z) <= court.halfLength + court.lineTolerance };
    const damping=state.shot?.drop?config.drop.horizontalBounce:1+(b.spin||0)*.045;
    const time = landing.seconds + afterBounce;
    state.contact = { x: landing.x + b.vx * afterBounce*damping, z: landing.z + b.vz * afterBounce*damping, at: state.elapsed + time, eta: time, height, side: 1 - b.lastHitter };
    // A low drop may never rise to the normal contact height. Give the AI a
    // reachable point on the real arc instead of blindly chasing that height.
    // This is a movement target only: contactStatus still judges every return.
    if(b.lastHitter!==0||state.shot?.serving||!state.landing.valid||apex>=c.hitHeight)return;
    const player=state.players[1],speed=Math.max(level.speed,p.speedByRank[0]*config.opponent.minimumSpeedRatio),reach=p.reach*1.25;
    const end=landing.seconds+2*upSpeed/gravity,interval=Math.max(config.simulation.step,1/40);
    for(let t=Math.max(interval,level.reaction);t<end;t+=interval){
      const bounced=t>=landing.seconds,u=bounced?t-landing.seconds:t;
      const x=bounced?landing.x+b.vx*u*damping:b.x+b.vx*t;
      const z=bounced?landing.z+b.vz*u*damping:b.z+b.vz*t;
      const y=bounced?c.radius+upSpeed*u-.5*gravity*u*u:b.y+b.vy*t-.5*gravity*t*t;
      const vy=bounced?upSpeed-gravity*u:b.vy-gravity*t;
      if(z>-p.contactOffsetZ*.45||y<Math.max(contactConfig.minHeight,bounced?0:p.volleyMinHeight)||y>contactConfig.maxHeight||(!bounced&&vy>0))continue;
      const targetX=clamp(x+aiOffset,-court.playerLimit,court.playerLimit),targetZ=clamp(z-p.contactOffsetZ,-court.halfLength-p.reach,-p.contactOffsetZ);
      const dx=targetX-player.x,dz=targetZ-player.z,distance=Math.hypot(dx,dz),available=Math.max(0,t-level.reaction);
      const initial=distance?clamp(((player.vx||0)*dx+(player.vz||0)*dz)/distance,-speed,speed):0;
      const accelerating=Math.min(available,Math.max(0,(speed-initial)/p.acceleration));
      const travel=initial*accelerating+.5*p.acceleration*accelerating**2+speed*(available-accelerating);
      if(distance>travel+reach*.65)continue;
      state.contact.aiIntercept={x,z,y,at:state.elapsed+t,volley:!bounced};break;
    }
  }
  function shoot(side, timing = 0, charge = 0) {
    const b = state.ball, serving = ['serve','toss'].includes(state.phase);
    if(side===0&&pendingShot){({lob,drop,aim,charge}=pendingShot);pendingShot=null;}
    const serveZone=side===0?state.serveZone:'green';
    const perfect=serving&&side===0&&serveZone==='green'&&Math.abs(state.serveMeter-.5)<=config.serve.perfectWidth/2+1e-9;
    const aiDrop=!serving&&side===1&&rng()<(level.dropChance||0),aiLob=!serving&&side===1&&!aiDrop&&rng()<(level.lobChance||0);
    const isDrop=!serving&&(side===0?drop:aiDrop),isLob=!serving&&(side===0?lob:aiLob),quality=serving?1:(side===0?contactQuality():1);
    const overpowered=!serving&&side===0&&charge>config.shotPower.safeMax[difficulty];
    const power = (side === 0 ? (serving ? attributes.servePower + (perfect?config.serve.centerPowerBonus:0) : attributes.hitPower + charge*p.chargeBonus - Math.abs(timing) * p.timingPowerPenalty) : level.power)*(1-(1-quality)*contactConfig.edgePowerPenalty);
    let targetX = 0;
    if (side === 0) {
      targetX=aim?.manual?clamp(aim.x,-1,1)*c.spread:(state.players[1].x>=0?-1:1)*c.spread;targetX+=timing*c.spread*p.timingPowerPenalty+(rng()-.5)*(1-quality)*contactConfig.edgeSpread;
    } else {
      const corner = rng() < level.cornerChance;
      targetX = corner ? (state.players[0].x >= 0 ? -1 : 1) * c.spread : 0;
      targetX += (rng() - 0.5) * (1 - level.accuracy) * c.spread;
    }
    const direction = side === 0 ? -1 : 1;
    let targetZ=direction*(serving?court.serviceLength-c.outMargin:isDrop?config.drop.depth:isLob?config.lob.depth:(side===1?(level.shotDepth||c.depth):c.depth)+charge*config.shotPower.depthBonus);
    if(!serving&&side===0&&!isDrop&&!lob&&aim?.manual)targetZ-=direction*clamp(aim.z||0,-1,1)*1.5;
    let serveFault=null;
    const serviceSign=serving?Math.sign(state.players[side].x):0;
    if(serving){
      targetX=-serviceSign*court.halfWidth/2*(1+(side===0&&!perfect?clamp(aim?.manual?aim.x:0,-1,1):0)*config.serve.aimFraction);
      if(side===1){
        // Decide an intended landing, then let the same net and line physics judge it.
        if(rng()>=config.serve.computerInRate[difficulty]){
          serveFault=rng()<.45?'net':'out';
          if(serveFault==='out'){
            if(rng()<.5)targetZ=direction*(court.serviceLength+.16+rng()*.18);
            else targetX=-serviceSign*(court.halfWidth+.16+rng()*.18);
          }
        }else{targetX=-serviceSign*(.7+rng()*(court.halfWidth-1.4));targetZ=direction*(1.9+rng()*1.8);}
      }else if(serveZone==='red')targetZ=direction*(court.serviceLength+config.serve.missDepth);
    }
    if(overpowered)targetZ=direction*(court.halfLength+config.shotPower.outMargin+charge-config.shotPower.safeMax[difficulty]);
    const spin=isDrop?-.25:isLob?-.12:.22+charge*.55+quality*.12;b.spin=spin;const gravity=c.gravity+spin*(c.topspinGravity||.45);
    const pace = power + (serving ? 0 : Math.min(c.rallyPowerLimit, state.rallyHits * c.rallyPowerPerHit));
    let flight = serving ? Math.max(config.serve.minimumFlight,config.serve.flightSeconds-pace*config.serve.powerFlightFactor)/(perfect?config.serve.perfectSpeedMultiplier:1) : Math.max(c.minimumFlight,c.flightSeconds-pace*c.powerFlightFactor)*(isLob&&!isDrop?config.lob.flightMultiplier:1);
    // Toss motion already places the ball at the real contact point.
    // Keep the physical contact point continuous; only velocity changes on return.
    // Serving also retains its current toss position.
    if(!serving)flight/=level.rallyPace||1;
    // Solve clearance at the net for short balls, including a drop from the baseline.
    const fraction=-b.z/(targetZ-b.z);
    if(fraction>0&&fraction<1){
      const base=b.y*(1-fraction)+c.radius*fraction,arc=.5*gravity*fraction*(1-fraction);
      const clearance=Math.sqrt(Math.max(0,(court.netHeight+c.radius+config.drop.netClearance-base)/arc));
      if(serveFault==='net')flight=Math.sqrt(Math.max(.02,(court.netHeight-base)/arc));
      else flight=Math.max(flight,clearance);
    }
    b.vx = (targetX - b.x) / flight; b.vz = (targetZ - b.z) / flight;
    b.vy = (c.radius - b.y + 0.5 * gravity * flight ** 2) / flight;
    b.bounces = 0; b.lastHitter = side;
    state.faultMark=null;state.phase = 'rally'; state.phaseTime = 0; state.rallyHits++; shotTime = 0;
    const player=state.players[side];
    player.stroke=(b.x-player.x)*(side===0?-1:1)>=0?'forehand':'backhand';
    player.lob=isLob;player.serving=serving;player.preparing=false;
    player.contactPoint={x:b.x,y:b.y,z:b.z};
    player.swingDuration=serving?config.animation.serveSeconds:p.swingSeconds;
    // Physics contact and the contact keyframe share the same instant. Backswing
    // is previewed while aiming, or while an early tap waits for the incoming ball.
    player.swing=player.swingDuration*(1-config.animation.contactFraction);
    const fatigue = Math.max(0, state.rallyHits - config.opponent.fatigueAfterHits) * config.opponent.fatigueMissPerHit;
    aiMiss = rng() < Math.min(config.opponent.maximumMissChance, level.missChance + fatigue); aiOffset = (rng() - 0.5) * (1 - level.accuracy) * c.spread;
    state.players[1-side].assistTravel=0;
    state.shot = { side, serving, power, quality, spin, charge, overpowered, drop:isDrop, serviceSign, serveFault, perfect, targetX, targetZ, flight, timing, lob:isLob&&!isDrop,serveZone };
    state.charge=0;
    planContact(); emit('hit', { side, serving, timing, power,quality,edge:quality<.55 }); pendingTap = null;
  }
  function faultOrPoint(reason){const mark={x:state.ball.x,z:state.ball.z,reason};if(!state.shot?.serving){point(1-state.ball.lastHitter,reason);state.faultMark=mark;return;}state.faults++;if(state.faults>=2)point(1-state.server,'doubleFault');else{prepareServe();emit('fault',{reason});}state.faultMark=mark;state.event.impact=reason;}
  function serve(){if(state.server!==0)return;if(state.phase==='serve'){state.phase='toss';state.phaseTime=0;emit('toss');}else if(state.phase==='toss')shoot(0);}
  function contactStatus(side=0){
    const b=state.ball,player=state.players[side],reach=side===0?attributes.reach:p.reach*1.25,distance=Math.hypot(player.x-b.x,player.z-b.z);
    const ownSide=side===0?b.z>=p.contactOffsetZ*.45:b.z<=-p.contactOffsetZ*.45;
    const height=b.y>=contactConfig.minHeight&&b.y<=contactConfig.maxHeight;
    const bounce=b.bounces===1||(!state.shot?.serving&&b.bounces===0&&b.y>=p.volleyMinHeight);
    const depth=Math.abs(player.z-b.z),eligible=state.phase==='rally'&&b.lastHitter!==side&&state.shot?.side!==side&&ownSide&&height&&bounce&&distance<=reach&&depth<=Math.min(1.3,reach*.96);
    return {eligible,distance,reach,height,ownSide,bounce,quality:clamp(1-Math.max(distance/reach,Math.abs(b.y-1)/2)**2,0,1),reason:!ownSide?'side':!height?'height':!bounce?'bounce':distance>reach||depth>Math.min(1.3,reach*.96)?'reach':'timing'};
  }
  function contactQuality(){return contactStatus(0).quality;}
  function miss(reason='timing'){
    const player=state.players[0];player.contactPoint=null;player.swingDuration=p.swingSeconds;player.swing=p.swingSeconds;player.serving=false;player.stroke=(state.ball.x-player.x)*-1>=0?'forehand':'backhand';
    pendingTap=null;pendingShot=null;emit('missSwing',{reason});
  }
  function swing(){
    if(cooldown>0||state.phase!=='rally')return;
    cooldown=p.swingCooldown;
    if(state.ball.lastHitter!==1||state.shot?.side===0||!state.contact){miss('turn');return;}
    const half=Math.max(.1,level.timingWindow/2),difference=state.elapsed-state.contact.at;
    pendingTap=clamp(difference/half,-1,1);pendingUntil=state.elapsed+contactConfig.bufferSeconds;
    pendingShot={lob,drop,aim:aim?{...aim}:null,charge:state.charge};state.charge=0;state.players[0].preparing=true;
    tryHumanHit();
  }
  function tryHumanHit(){
    if(pendingTap===null)return;
    const contact=contactStatus();state.contactWindow=contact;
    if(contact.eligible){const timing=clamp((state.elapsed-state.contact.at)/Math.max(.1,level.timingWindow/2),-1,1);shoot(0,timing);}
    else if(state.elapsed>=pendingUntil)miss(contact.reason);
  }
  function movePlayer(index,x,z,speed,dt){
    const player=state.players[index],dx=x-player.x,dz=z-player.z,length=Math.hypot(dx,dz),scale=length>speed*dt?speed/length:1/dt;
    const targetVx=dx*scale,targetVz=dz*scale,oldVx=player.vx||0,oldVz=player.vz||0,dvx=targetVx-oldVx,dvz=targetVz-oldVz,dv=Math.hypot(dvx,dvz),acc=(length<.00001?(p.braking||18):p.acceleration)*dt,f=dv>acc?acc/dv:1;
    player.vx=oldVx+dvx*f;player.vz=oldVz+dvz*f;
    const nextX=player.x+player.vx*dt,nextZ=player.z+player.vz*dt;
    player.x=clamp(nextX,-court.playerLimit,court.playerLimit);player.z=clamp(nextZ,index===0?p.contactOffsetZ:-court.halfLength-p.reach,index===0?court.halfLength+p.reach:-p.contactOffsetZ);
    if(nextX!==player.x)player.vx=0;if(nextZ!==player.z)player.vz=0;
    player.running=Math.hypot(player.vx,player.vz)>.12;
  }
  function step(dt, input) {
    state.feedback.age+=dt;if(!(state.server===0&&['serve','toss'].includes(state.phase)))state.elapsed+=dt;state.phaseTime+=dt; cooldown = Math.max(0, cooldown - dt);
    state.players.forEach(player => { player.swing = Math.max(0, player.swing - dt); });
    if (state.phase === 'complete') return;
    if (state.phase === 'point' || state.phase === 'game') {
      if (state.phaseTime >= (state.phase === 'game' ? rules.gamePause : rules.pointPause)) prepareServe();
      return;
    }
    if (['serve','toss'].includes(state.phase)) {
      const b=state.ball,server=state.players[state.server];b.x=server.x;b.z=server.z;
      if(state.phase==='toss'){
        const t=state.phaseTime%config.serve.tossSeconds;b.z=server.z-(state.server===0?1:-1)*p.contactOffsetZ*Math.min(1,t/.4);b.y=Math.max(config.serve.handHeight,config.serve.handHeight+config.serve.tossVelocity*t-c.gravity*t*t/2);
        const meter=serveMeterAt(state.phaseTime,config.serve.tossSeconds);state.serveMeter=meter.value;state.serveMeterDirection=meter.direction;state.tossProgress=t/config.serve.tossSeconds;
        const green=config.serve.green[difficulty]+(safeRanks.serve-1)*config.serve.rankGreenBonus,distance=Math.abs(state.serveMeter-.5);
        state.serveZone=distance<=green/2?'green':distance<=(green+config.serve.yellowWidth)/2?'yellow':'red';
        if(state.server===1&&state.phaseTime>=config.serve.tossSeconds*.45)shoot(1);
      }else{b.y=config.serve.handHeight;if(state.server===1&&state.phaseTime>=Math.max(.25,rules.serveWait-config.serve.tossSeconds*.45)){state.phase='toss';state.phaseTime=0;emit('toss');}}
      return;
    }
    if(input.prepare)state.charge=clamp(state.charge+dt/p.chargeSeconds,0,1);else state.charge=0;
    const contact=state.contact;if(contact)contact.eta=contact.at-state.elapsed;
    const length=Math.hypot(input.move||0,input.moveZ||0),hasManual=length>0;
    if(hasManual)state.manualMovement=true;
    const moveX=(input.move||0)/Math.max(1,length),moveZ=(input.moveZ||0)/Math.max(1,length);
    const human=state.players[0];let assistX=0,assistZ=0;state.assist.active=false;
    if(length<.12&&(input.prepare||pendingTap!==null)&&state.contact?.side===0&&state.contact.eta<.7&&state.contact.eta>-.4&&(human.assistTravel||0)<contactConfig.assistMaxStep){
      const target=state.contact.eta>0?state.contact:state.ball,dx=target.x-human.x,dz=target.z-human.z,distance=Math.hypot(dx,dz);
      if(distance>attributes.reach*.58&&distance<=contactConfig.assistRadius){const remaining=contactConfig.assistMaxStep-(human.assistTravel||0),speed=Math.min(contactConfig.assistSpeed,remaining/dt);assistX=dx/distance*speed;assistZ=dz/distance*speed;state.assist.active=true;}
    }
    const beforeX=human.x,beforeZ=human.z;
    movePlayer(0,human.x+(moveX*attributes.speed+assistX)*dt,human.z+(moveZ*attributes.speed+assistZ)*dt,state.assist.active?contactConfig.assistSpeed:attributes.speed,dt);
    if(state.assist.active)human.assistTravel=(human.assistTravel||0)+Math.hypot(human.x-beforeX,human.z-beforeZ);state.assist.distance=human.assistTravel||0;
    state.players[0].preparing=Boolean(input.prepare)||pendingTap!==null;
    if(state.players[0].preparing){state.players[0].serving=false;state.players[0].stroke=(state.ball.x-state.players[0].x)*-1>=0?'forehand':'backhand';state.players[0].lob=Boolean(pendingShot?.lob??input.lob);}
    const aiIncoming=contact?.side===1;
    const approach=level.netChance>0&&state.pointNumber%Math.max(1,Math.round(1/level.netChance))===0;
    const aiTarget=aiIncoming?(contact.aiIntercept||contact):null;
    movePlayer(1,aiIncoming&&shotTime>=level.reaction?aiTarget.x+aiOffset:0,aiIncoming?aiTarget.z-p.contactOffsetZ:approach?-court.serviceLength:-p.readyZ,Math.max(level.speed,p.speedByRank[0]*config.opponent.minimumSpeedRatio),dt);
    rallyTime += dt; shotTime += dt;
    const b = state.ball, previousZ = b.z, previousY = b.y,gravity=c.gravity+(b.spin||0)*(c.topspinGravity||.45);
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt - 0.5 * gravity * dt * dt; b.vy -= gravity * dt;
    // Swept net crossing: a fast ball cannot skip the net between ticks.
    if (previousZ * b.z <= 0 && previousZ !== b.z) {
      const alpha = Math.abs(previousZ) / Math.abs(b.z - previousZ);
      if (previousY + (b.y - previousY) * alpha - c.radius < court.netHeight) { b.z = 0; faultOrPoint('net'); return; }
    }
    if (b.y <= c.radius && b.vy < 0) {
      b.y = c.radius; b.bounces++;
      if (b.bounces === 1) {
        const wrongSide = b.z * (b.lastHitter === 0 ? -1 : 1) < 0;
        // The server may already be running through the centre line after contact.
        const serviceSign=state.shot.serviceSign??Math.sign(state.players[b.lastHitter].x);
        const serveOut = state.shot.serving && (Math.abs(b.z)>court.serviceLength+court.lineTolerance||b.x*serviceSign>court.lineTolerance);
        if (Math.abs(b.x) > court.halfWidth + court.lineTolerance || Math.abs(b.z) > court.halfLength + court.lineTolerance || wrongSide || serveOut) { faultOrPoint('out'); return; }
        b.vy = -b.vy * (state.shot.drop?config.drop.bounce:c.bounce);
        if(state.shot.drop){b.vx*=config.drop.horizontalBounce;b.vz*=config.drop.horizontalBounce;}else{b.vx*=1+(b.spin||0)*.045;b.vz*=1+(b.spin||0)*.045;}
        emit('bounce');
      } else { point(b.lastHitter, 'doubleBounce'); return; }
    }
    state.contactWindow=contactStatus();if(pendingTap!==null)tryHumanHit();
    if (state.contact?.side === 1 && shotTime>=level.reaction && contactStatus(1).eligible) {
      if (!aiMiss && contactStatus(1).eligible) shoot(1);
    }
    // Bounded point fallback covers even a pathological endless exchange.
    if (rallyTime >= rules.rallyTimeout) point(b.lastHitter, 'timeout');
  }
  function update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt < 0 || state.phase === 'complete') return state;
    if(input.cancelCharge){state.charge=0;pendingShot=null;pendingTap=null;serveWasDown=false;serveHeld=0;inputWasSwing=false;state.players[0].preparing=false;return state;}
    // A tap is an edge; held charge is continuous. Consume taps even below one tick.
    lob=Boolean(input.lob);drop=Boolean(input.drop);aim=input.aim;const down=Boolean(input.serve),serveTap=down&&!serveWasDown,released=!down&&serveWasDown;serveWasDown=down;if(serveTap){serveHeld=0;serve();}if(down)serveHeld+=Math.max(0,Math.min(dt,config.simulation.maxDelta));if(released&&serveHeld>=config.serve.holdSeconds&&state.phase==='toss')serve();const tap = Boolean(input.swing) && !inputWasSwing; inputWasSwing = Boolean(input.swing);

    if (tap) swing();
    accumulator += Math.min(dt, config.simulation.maxDelta);
    while (accumulator + 1e-10 >= config.simulation.step && state.phase !== 'complete') { step(config.simulation.step, input); accumulator -= config.simulation.step; }
    state.pointLabels = pointLabels(score, rules);
    return state;
  }
  prepareServe();
  return { update, getState: () => state, snapshot: () => structuredClone(state), get result() { return state.result; } };
}

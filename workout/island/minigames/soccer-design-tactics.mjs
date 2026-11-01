import {passLaneClearance} from './soccer-teamplay.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const phaseNames=['build_up','attack','defensive_transition','defense','throw_in','corner','goal_kick','free_kick'];
const restartNames={throwIn:'throw_in',corner:'corner',goalKick:'goal_kick',freeKick:'free_kick'};
const metric=(record,key,fallback)=>Number.isFinite(record?.parameters?.[key]?.example)?record.parameters[key].example:fallback;
const candidateOffsets=[0,-1,1];

/** Compile the actual design package once per session. Six-a-side uses an
 * explicit subset of the full formation; it never creates eleven ghost roles.
 * Return values are reused targets. Callers must not mutate them. */
export function compileSoccerTactics(data,c){
 if(data?.schemaVersion!==1||data.sport!=='soccer')throw Error('Unsupported soccer tactics package');
 if(!Number.isFinite(data.minSeparationM)||data.minSeparationM<=0||!(data.field?.lengthM>0)||!(data.field?.widthM>0))throw Error('Invalid soccer tactics field');
 const selected=c.squad?.formation||'4-3-3',formation=data.formations?.find(item=>item.id===selected);
 if(!formation)throw Error('Unknown soccer formation: '+selected);
 const available=new Set(formation.roles),striker=available.has('CF')?'CF':'LST',wide=available.has('LW')?'LW':available.has('LM')?'LM':'LWB';
 const selectedRoles=[striker,'RCM','GK',wide,'LCB','RCB'];
 if(selectedRoles.some(role=>!available.has(role)))throw Error('Soccer formation lacks a reduced-side role');
 const aliases={CF:striker,LW:wide},rules=new Map((data.rules||[]).map(rule=>[rule.id,rule])),restarts=new Map((data.restartPolicies||[]).map(rule=>[rule.id,rule]));
 const number=(rule,key,fallback)=>metric(rules.get(rule),key,fallback);
 const parameters={
  midfield:number('phase_selection','midfield',.5),hysteresis:number('phase_selection','hysteresis',.02),
  decisionSeconds:1/Math.max(1,number('observed_reaction','decisionHz',8)),reactionSeconds:number('observed_reaction','possessionReactionSeconds',.25),
  passReactionSeconds:number('observed_reaction','passReactionSeconds',.2),transitionSeconds:number('observed_reaction','defensiveTransitionSeconds',1.8),
  pressHold:number('single_presser','pressHoldSeconds',.6),incumbentAdvantage:number('single_presser','incumbentAdvantageM',.65),intercept:number('single_presser','interceptSeconds',.22),
  markDistance:number('goal_side_marking','markDistanceM',2),goalSideDepth:number('goal_side_marking','goalSideDepthM',1.5),
  candidateStep:number('open_pass_lane','candidateStepM',2.5),candidateCount:clamp(Math.floor(number('open_pass_lane','candidateCount',9)),1,9),laneClearance:number('open_pass_lane','laneClearanceM',1.6),prediction:number('open_pass_lane','predictionSeconds',.25),
  spacing:number('spacing_priority','teammateTargetSpacingM',5.5),bodyClearance:Math.max(data.minSeparationM,number('spacing_priority','bodyClearanceM',1.8)),
  supportDistance:number('diagonal_support','supportDistanceM',10),maxForwardRunners:number('diagonal_support','maxForwardRunners',2),
  restDefenders:number('rest_defense','minimumRestDefenders',3),behindBall:number('rest_defense','behindBallM',11),
  pressureDistance:number('pressure_outlet','pressureDistanceM',4.5),outletBack:number('pressure_outlet','dropDistanceM',6),outletSide:number('pressure_outlet','lateralDistanceM',5),
  finalThird:number('wide_box_run','finalThirdStart',.7),wideThreshold:number('wide_box_run','wideThreshold',.3),farPost:number('wide_box_run','farPostOffsetM',4.5),cutback:number('wide_box_run','cutbackDepthM',7),
  throwClearance:metric(restarts.get('opponent_restart'),'throwInClearanceM',2),cornerClearance:metric(restarts.get('opponent_restart'),'cornerFreeKickClearanceM',9.15)
 };
 const phases=Object.create(null),profiles=Object.create(null);
 for(const id of phaseNames){
  const source=formation.phases.find(item=>item.id===id);
  if(!source)throw Error('Missing soccer tactics phase: '+id);
  const positions=Object.create(null);
  for(const role of selectedRoles){
   const point=source.positions?.[role];
   if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||point.x>1||point.y<0||point.y>1)throw Error('Invalid soccer anchor: '+id+'/'+role);
   positions[role]={x:point.x,y:point.y};
  }
  phases[id]={positions,ball:{x:source.ball.x,y:source.ball.y},takerRole:source.takerRole};
 }
 for(const source of data.ballMovementProfiles||[]){
  const byRole=Object.create(null);
  for(const role of selectedRoles){
   const matches=source.groups.filter(group=>group.roles.includes(role));
   if(matches.length!==1)throw Error('A soccer role needs one movement group: '+source.phase+'/'+role);
   const group=matches[0];
   byRole[role]={lateral:group.lateralGain.example,longitudinal:group.longitudinalGain.example,maxLateral:group.maxLateralOffset.example,maxBackward:group.maxBackwardOffset.example,maxForward:group.maxForwardOffset.example};
  }
  profiles[source.phase]={reference:{x:source.referenceBall.x,y:source.referenceBall.y},byRole};
 }
 for(const id of phaseNames.slice(0,4))if(!profiles[id])throw Error('Missing soccer movement profile: '+id);
 const length=c.pitch.length,width=c.pitch.width,hx=length/2,hz=width/2,boundary=Math.max(0,c.rules.playerBoundary),scale=length/data.field.lengthM;
 const caches=new WeakMap();let plans=0;

 function createState(state){
  const teams=[0,1].map(team=>({team,nodes:[],byId:new Map(),phase:'defense',possessionPhase:null,lastPossessionAt:-Infinity,transitionUntil:-Infinity,pressId:null,pressUntil:-Infinity,nextDecision:-Infinity,key:'',observed:state.players.filter(player=>player.team!==team).map(player=>({player,x:0,z:0})),candidatePoint:{x:0,z:0},boundsPoint:{x:0,z:0},desiredPoint:{x:0,z:0},placed:[]}));
  for(const team of teams){
   const members=state.players.filter(p=>p.team===team.team).sort((a,b)=>a.id-b.id),used=new Set();
   if(members.length>selectedRoles.length)throw Error('The soccer tactics adapter supports at most six players per side');
   for(const player of members){
    let role=player.tacticalRole?aliases[player.tacticalRole]||player.tacticalRole:null;
    if(role&&!selectedRoles.includes(role))throw Error('Unsupported reduced soccer role: '+role);
    if(role&&used.has(role))throw Error('Duplicate reduced soccer role: '+role);
    if(!role){
     const preferred=player.role==='keeper'?['GK']:player.role==='striker'?[striker]:player.role==='support'?['RCM','LCB']:[wide,'RCB'];
     role=preferred.find(candidate=>!used.has(candidate))||selectedRoles.find(candidate=>!used.has(candidate));
    }
    used.add(role);
    const node={player,role,x:player.x,z:player.z,duty:'cover',markId:null,fixed:false,maxDepth:Infinity,clearance:0,opponentClearance:0,result:{x:player.x,z:player.z,duty:'cover',role,markId:null}};
    team.nodes.push(node);team.byId.set(player.id,node);
   }
   if(!used.has('GK'))throw Error('Soccer tactics requires a goalkeeper on each side');
  }
  const cached={teams,lastOwnerTeam:null,lastTime:finite(state.elapsed)+finite(state.restart?.elapsed),lastElapsed:finite(state.elapsed),lastRestart:state.restart,lastRestartElapsed:finite(state.restart?.elapsed)};caches.set(state,cached);return cached;
 }
 function memory(state){return caches.get(state)||createState(state);}
 function direction(team,state){return state.attackDir*(team===0?1:-1);}
 function inBounds(node,x,z,d,out={}){
  x=clamp(x,-hx+boundary,hx-boundary);z=clamp(z,-hz+boundary,hz-boundary);
  if(node.role==='GK'){
   const inset=c.goalkeeping.areaInset;x=d*clamp(x*d,-hx+inset,-hx+c.pitch.penaltyDepth-inset);z=clamp(z,-c.pitch.penaltyWidth/2+inset,c.pitch.penaltyWidth/2-inset);
  }else if(Number.isFinite(node.maxDepth))x=d*Math.min(x*d,Math.max(-hx+boundary,node.maxDepth));
  out.x=x;out.z=z;return out;
 }
 function ownPass(team,state){
  const receiver=state.passTarget&&state.players.find(p=>p.id===state.passTarget.player);
  return state.ball.owner==null&&state.ball.lastTeam===team&&receiver?.team===team&&state.passTarget.time>0;
 }
 function choosePhase(team,state,now,owner){
  const active=state.restart&&String(state.phase).startsWith('restart');
  if(active)return state.restart.team===team.team?restartNames[state.restart.type]||'free_kick':'defense';
  const d=direction(team.team,state),depth=.5+state.ball.x*d/length;
  const passing=ownPass(team.team,state);
  if(passing&&!Number.isFinite(team.lastPossessionAt))team.lastPossessionAt=now;
  const keepPass=passing&&now-team.lastPossessionAt<=Math.min(c.passing.runSeconds,(state.ball.flight?.duration??c.passing.groundTravelSeconds)+parameters.passReactionSeconds);
  if(owner?.team===team.team||keepPass||owner==null&&now-team.lastPossessionAt<=parameters.reactionSeconds){
   const previous=team.possessionPhase;
   team.possessionPhase=previous==='build_up'?depth>parameters.midfield+parameters.hysteresis?'attack':'build_up':previous==='attack'?depth<parameters.midfield-parameters.hysteresis?'build_up':'attack':depth>parameters.midfield?'attack':'build_up';
   return team.possessionPhase;
  }
  return owner&&now<team.transitionUntil?'defensive_transition':'defense';
 }
 function anchor(node,team,state){
  const phase=phases[team.phase],profile=profiles[team.phase],d=direction(team.team,state),point=phase.positions[node.role],ball=state.ball;
  let nx=point.x,ny=point.y;
  if(profile){
   const group=profile.byRole[node.role],dx=.5+ball.z/width-profile.reference.x,dy=.5+ball.x*d/length-profile.reference.y;
   nx+=clamp(dx*group.lateral,-group.maxLateral,group.maxLateral);ny+=clamp(dy*group.longitudinal,-group.maxBackward,group.maxForward);
  }else if(state.restart){
   const mirror=state.restart.z>0;
   if(mirror)nx=1-nx;
   if(team.phase==='throw_in'||team.phase==='free_kick'){
    const referenceX=mirror?1-phase.ball.x:phase.ball.x;
    if(node.role!=='GK'){nx+=.5+state.restart.z/width-referenceX;ny+=.5+state.restart.x*d/length-phase.ball.y;}
   }
  }
  return {x:d*(ny-.5)*length,z:(nx-.5)*width};
 }
 function selectPresser(team,state,now){
  const receiver=ownPass(team.team,state)?state.passTarget.player:null;
  if(receiver!=null&&team.byId.get(receiver)?.role!=='GK')return team.byId.get(receiver);
  const active=team.nodes.filter(node=>node.role!=='GK'&&!(node.player.recover>0)&&!(node.player.slideTime>0));
  const controlled=active.find(node=>node.player.id===state.controlled);
  if(controlled&&distance(controlled.player,state.ball)<=c.physics.pickupRadius+finite(c.assistance?.contact?.footSlack))return controlled;
  const current=active.find(node=>node.player.id===team.pressId);
  if(current&&now<team.pressUntil)return current;
  let best=null,cost=Infinity;
  const point={x:state.ball.x+finite(state.ball.vx)*parameters.intercept,z:state.ball.z+finite(state.ball.vz)*parameters.intercept};
  for(const node of active){const score=distance(node.player,point)-(node===current?parameters.incumbentAdvantage:0);if(score<cost-1e-10||Math.abs(score-cost)<=1e-10&&node.player.id<(best?.player.id??Infinity)){best=node;cost=score;}}
  if(best&&best.player.id!==team.pressId)team.pressUntil=now+parameters.pressHold;
  return best;
 }
 function candidate(node,team,state,placed,owner){
  if(node.fixed)return;
  const desired=team.desiredPoint,d=direction(team.team,state),step=parameters.candidateStep;
  desired.x=node.x;desired.z=node.z;
  // Keep a full 3x3 neighborhood even beside a line. The presser itself stays
  // free to reach that line; supporting players find a separate interior lane.
  const centerX=clamp(desired.x,-hx+boundary+step,hx-boundary-step),centerZ=clamp(desired.z,-hz+boundary+step,hz-boundary-step);
  let found=false,bestX=0,bestZ=0,bestScore=-Infinity;
  for(let index=0;index<parameters.candidateCount;index++){
   const ox=candidateOffsets[Math.floor(index/3)],oz=candidateOffsets[index%3],point=avoidOpponents(node,team,state,inBounds(node,centerX+ox*step,centerZ+oz*step,d,team.candidatePoint),d);
   if(node.clearance&&distance(point,state.restart)<node.clearance-1e-8)continue;
   let separation=Infinity;for(const other of placed)separation=Math.min(separation,distance(point,other));
   if(separation<parameters.bodyClearance-1e-8)continue;
   let lane=parameters.laneClearance*2,opposition=parameters.spacing;
   for(const observed of team.observed){
    opposition=Math.min(opposition,distance(point,observed));if(owner?.team===team.team)lane=Math.min(lane,passLaneClearance(observed,owner,point));
   }
   const score=Math.min(separation,parameters.spacing)*.65+lane*.9+opposition*.3-distance(point,desired)*.8;
   if(score>bestScore){bestScore=score;found=true;bestX=point.x;bestZ=point.z;}
  }
  if(found){node.x=bestX;node.z=bestZ;}
 }
 function avoidOpponents(node,team,state,point,d){
  if(!(node.opponentClearance>0))return point;
  let x=point.x,z=point.z;
  for(let iteration=0;iteration<c.tactics.separationIterations;iteration++){
   let moved=false;
   for(const observed of team.observed){
    const rival=observed.player;
    const dx=x-rival.x,dz=z-rival.z,length=Math.hypot(dx,dz);
    if(length>=node.opponentClearance-1e-8)continue;
    const next=inBounds(node,rival.x+(length?dx/length:-d)*node.opponentClearance,rival.z+(length?dz/length:(node.player.id%2?1:-1)*.35)*node.opponentClearance,d,team.boundsPoint);
    if(Math.abs(next.x-x)+Math.abs(next.z-z)>1e-8)moved=true;
    x=next.x;z=next.z;
   }
   if(!moved)break;
  }
  point.x=x;point.z=z;return point;
 }
 function plan(team,state,now,owner){
  plans++;const d=direction(team.team,state),b=state.ball,ours=owner?.team===team.team,freePass=ownPass(team.team,state),restart=state.restart&&String(state.phase).startsWith('restart');
  // Every candidate in this synchronous plan sees the same observed rivals.
  // Keep their order and arithmetic, but calculate predictions only once.
  for(const observed of team.observed){const rival=observed.player;observed.x=rival.x+finite(rival.vx)*parameters.prediction;observed.z=rival.z+finite(rival.vz)*parameters.prediction;}
  const presser=!restart&&(!ours||freePass)?selectPresser(team,state,now):null;team.pressId=presser?.player.id??null;
  const fieldCount=team.nodes.filter(node=>node.role!=='GK').length,coverCount=Math.max(1,Math.ceil(parameters.restDefenders*fieldCount/10));
  const opponentClearance=Math.max(parameters.markDistance,finite(c.tactics.markDistance?.[state.difficulty])+finite(c.tactics.spacingBuffer));
  const profileStage=state.league?.tuning??c.campaign?.stage??state.stage;
  const crossCorridor=ours&&owner.role!=='keeper'&&(team.team===0||profileStage>=(c.ai.crossFromStage??Infinity))&&hx-b.x*d<=c.ai.crossRange&&Math.abs(b.z)>=c.ai.crossWidth;
  for(const node of team.nodes){
   node.fixed=false;node.maxDepth=Infinity;node.clearance=0;node.opponentClearance=node.role==='GK'?0:ours||freePass?parameters.bodyClearance:opponentClearance;node.markId=null;node.duty=ours||freePass?'support':'cover';
   const point=anchor(node,team,state);node.x=point.x;node.z=point.z;
   if(ours&&!restart&&node.player.id!==owner.id&&(node.role==='LCB'||node.role==='RCB'))node.maxDepth=b.x*d-Math.min(c.pitch.penaltyDepth,parameters.behindBall*scale);
   if(ours&&!restart&&node.role==='RCM'){
    let nearest=null,range=Infinity;for(const rival of state.players)if(rival.team!==team.team&&rival.role!=='keeper'){const at=distance(rival,owner);if(at<range){range=at;nearest=rival;}}
    if(nearest&&range<parameters.pressureDistance){const side=Math.sign(owner.z-nearest.z)||(node.player.id%2?1:-1);node.x=owner.x-d*parameters.outletBack;node.z=owner.z+side*parameters.outletSide;node.duty='outlet';}
   }
   if(ours&&!restart&&(crossCorridor||.5+b.x*d/length>=parameters.finalThird&&Math.abs(b.z/width)>=parameters.wideThreshold)){
    if(node.role===striker){node.x=d*(hx-c.pitch.penaltySpot);node.z=-Math.sign(b.z)*Math.min(parameters.farPost,c.pitch.goalWidth/2-c.players.radius);node.duty='box-run';}
    else if(node.role==='RCM'){node.x=owner.x-d*parameters.cutback;node.z=owner.z*.25;node.duty='square';}
   }
   if(restart&&state.restart.team!==team.team&&node.role!=='GK')node.clearance=state.restart.type==='throwIn'?parameters.throwClearance:state.restart.type==='goalKick'?0:parameters.cornerClearance;
   if(node.clearance&&distance(node,state.restart)<node.clearance){const dx=node.x-state.restart.x,dz=node.z-state.restart.z,at=Math.hypot(dx,dz)||1;node.x=state.restart.x+dx/at*node.clearance;node.z=state.restart.z+dz/at*node.clearance;}
   if(node===presser){node.x=freePass?state.passTarget.x:b.x+finite(b.vx)*parameters.intercept;node.z=freePass?state.passTarget.z:b.z+finite(b.vz)*parameters.intercept;node.duty='press';node.fixed=true;}
   if(node.player.id===owner?.id||node.player.id===state.controlled){node.x=node.player.x;node.z=node.player.z;node.fixed=true;}
   if(restart&&state.restart.team===team.team&&node.player.id===state.restart.player){node.x=state.restart.x;node.z=state.restart.z;node.duty='restart-taker';node.fixed=true;}
   const bounded=inBounds(node,node.x,node.z,d);node.x=bounded.x;node.z=bounded.z;
  }
  if(!ours&&!freePass&&!restart){
   const defenders=team.nodes.filter(node=>node!==presser&&node.role!=='GK'&&!node.fixed&&!(node.player.recover>0)),threats=state.players.filter(p=>p.team!==team.team&&p.role!=='keeper'&&p.id!==owner?.id).sort((a,b)=>(a.x-b.x)*d||a.id-b.id);
   const marked=new Set(),limit=Math.max(0,fieldCount-1-coverCount);
   for(const threat of threats){
    if(marked.size>=limit)break;
    let marker=null,best=Infinity;for(const node of defenders)if(node.markId==null){const at=distance(node.player,threat);if(at<best-1e-10||Math.abs(at-best)<=1e-10&&node.player.id<(marker?.player.id??Infinity)){marker=node;best=at;}}
    if(!marker)break;
    const depth=Math.min(parameters.goalSideDepth,opponentClearance),lateral=Math.sqrt(Math.max(0,opponentClearance**2-depth**2));
    marker.x=threat.x-d*depth;marker.z=threat.z+(Math.sign(marker.z-threat.z)||(marker.player.id%2?1:-1))*lateral;marker.maxDepth=threat.x*d-.2;marker.markId=threat.id;marker.duty='mark';marked.add(threat.id);
    const point=inBounds(marker,marker.x,marker.z,d);marker.x=point.x;marker.z=point.z;
   }
  }
  for(const node of team.nodes)if(!node.fixed){const point=avoidOpponents(node,team,state,node,d);node.x=point.x;node.z=point.z;}
  const placed=team.placed;placed.length=0;
  for(const node of team.nodes)if(node.fixed)placed.push(node);
  for(const node of team.nodes)if(!node.fixed){candidate(node,team,state,placed,owner);placed.push(node);}
  for(const node of team.nodes){const result=node.result;result.x=node.x;result.z=node.z;result.duty=node.duty;result.role=node.role;result.markId=node.markId;}
 }
 function update(state){
  const cached=memory(state),elapsed=finite(state.elapsed),restartElapsed=finite(state.restart?.elapsed);
  const restartAdvance=state.restart===cached.lastRestart?Math.max(0,restartElapsed-cached.lastRestartElapsed):state.restart?restartElapsed:0;
  const now=cached.lastTime+Math.max(0,elapsed-cached.lastElapsed)+restartAdvance,owner=state.ball.owner==null?null:state.players.find(p=>p.id===state.ball.owner);
  cached.lastElapsed=elapsed;cached.lastRestart=state.restart;cached.lastRestartElapsed=restartElapsed;
  if(owner&&owner.team!==cached.lastOwnerTeam){
   if(cached.lastOwnerTeam!=null)cached.teams[cached.lastOwnerTeam].transitionUntil=now+parameters.transitionSeconds;
   cached.lastOwnerTeam=owner.team;cached.teams[owner.team].transitionUntil=-Infinity;
  }
  if(owner)cached.teams[owner.team].lastPossessionAt=now;
  for(const team of cached.teams){
   const phase=choosePhase(team,state,now,owner),key=phase+'/'+state.attackDir+'/'+(owner?.team??'loose')+'/'+(state.restart?.id??state.restart?.type??'');
   if(now<team.nextDecision&&key===team.key)continue;
   team.phase=phase;team.key=key;team.nextDecision=now+parameters.decisionSeconds;plan(team,state,now,owner);
  }
  cached.lastTime=now;return cached;
 }
 return {
  target(player,state){return update(state).teams[player.team].byId.get(player.id)?.result||null;},
  roleFor(player,state){return memory(state).teams[player.team].byId.get(player.id)?.role??null;},
  phase(team,state){return update(state).teams[team].phase;},
  diagnostics(state){const cached=update(state);return {formation:selected,roles:[...selectedRoles],decisionHz:1/parameters.decisionSeconds,plans,minSeparation:data.minSeparationM,teams:cached.teams.map(team=>({phase:team.phase,presser:team.pressId,roles:team.nodes.map(node=>({id:node.player.id,role:node.role,markId:node.markId,duty:node.duty}))}))};}
 };
}

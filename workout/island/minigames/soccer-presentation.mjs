import {passDestination,soccerPassAim,canHead} from './soccer.mjs?v=island-alpine-20261028-1';
/** Pure presentation decisions; the simulation never imports this module. */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function slideWeight(player,config){
 if(player.recover>0)return clamp(player.recover/config.slide.recoverSeconds,0,1);
 const u=clamp(1-player.slideTime/config.slide.seconds,0,1),keys=config.view.slidePhases;
 for(let i=1;i<keys.length;i++)if(u<=keys[i].at){const a=keys[i-1],b=keys[i],v=(u-a.at)/(b.at-a.at),smooth=v*v*(3-2*v);return a.weight+(b.weight-a.weight)*smooth;}
 return keys.at(-1).weight;
}
export function playerAnimation(player,state,config){
  const a=config.view.animation,speed=Math.hypot(player.vx,player.vz),celebrating=state.phase==='goal'&&state.ball.lastPlayer===player.id,sprinting=player.id===state.controlled?state.sprint.active:player.sprinting;
  const mode=celebrating?'celebrate':player.throwTime>0?'throw':player.hands?'catch':player.diveTime>0?'dive':player.catchTime>0?'catch':player.headerTime>0?'header':player.slideTime>0?'slide':player.recover>0?'recover':player.stealTime>0?'steal':player.kickTime>0?'kick':speed<=a.idleSpeed?'idle':sprinting?'sprint':'run';
  const clip=mode==='catch'&&player.hands&&speed>a.idleSpeed?'run':{idle:'stand',run:'run',sprint:'run',kick:'kick',steal:'stand',throw:'stand',dive:'stand',catch:'stand',slide:'stand',recover:'stand',header:'stand',celebrate:'jumping-jacks'}[mode];
  const recovery=mode==='slide'||mode==='recover'?slideWeight(player,config):1,header=mode==='header'?Math.sin((1-player.headerTime/config.aerial.seconds)*Math.PI):0,steal=mode==='steal'?Math.sin((1-player.stealTime/config.steal.animationSeconds)*Math.PI):0;
  return {mode,clip,speed:clip==='run'?clamp(speed/a.runSpeed,a.minRate,a.maxRate):mode==='steal'?a.stealRate:1,
    lean:mode==='slide'||mode==='recover'?a.slideLean*recovery:mode==='sprint'?a.sprintLean:mode==='steal'?a.stealLean*steal:mode==='header'?a.headerLean*header:0,
    roll:mode==='dive'?a.diveRoll*(player.diveZ||1):mode==='slide'||mode==='recover'?a.slideRoll*recovery:player.turnLean||0,height:mode==='slide'||mode==='recover'?a.slideHeight*recovery:header*config.aerial.jumpHeight,leg:mode==='slide'?a.slideLeg:mode==='steal'?steal*a.slideLeg:0,head:header*config.aerial.headLean,bonePose:mode};
}
export function passReceiver(state,config){
  return state.charging&&state.chargeKind==='pass'&&state.ball.owner===state.controlled?passDestination(state,config,state.charge/config.passing.chargeSeconds).target:null;
}
export function soccerShotIcon(state,config){
 if(state.role==='keeper'&&state.ball.owner!==state.controlled)return 'slide';
 return canHead(state.players[state.controlled],state.ball,config)?'header':state.mode==='defense'?'slide':'shoot';
}
/** Preview and flight share the exact same endpoint, height and parabola. */
export function crossArc(state,config){
 if(state.ball.flight)return state.ball.flight;
 if(!state.charging||state.chargeKind!=='pass'||state.charge<config.passing.loftThresholdSeconds)return null;
 const power=state.charge/config.passing.chargeSeconds,destination=passDestination({...state,aim:soccerPassAim(state)},config,power);
 return {fromX:state.ball.x,fromZ:state.ball.z,x:destination.x,z:destination.z,height:config.passing.loftMinHeight+power*config.passing.loftExtraHeight};
}
/** Analytic perspective projection matching the side camera, useful without WebGL. */
export function projectSoccerPoint(point,camera,aspect,config){
  const c=config.view.camera,angle=c.elevationDegrees*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle),tan=Math.tan(c.fovDegrees*Math.PI/360),dx=point.x-camera.x,dz=(point.z-camera.z)*camera.direction,y=point.y||0;
  const depth=camera.distance-y*sin-dz*cos;
  return {x:dx*camera.direction/(depth*tan*aspect),y:(y*cos-dz*sin)/(depth*tan),depth};
}
/** Smooth tracking with velocity lead and zoom, then a hard fit for ball + player.
 * The fit is solved after smoothing, including the player's head and airborne ball. */
export function soccerCamera(state,aspect,config,previous,dt=0){
  const c=config.view.camera,b=state.ball,p=state.players[state.controlled],speed=Math.hypot(b.vx,b.vz),lead=Math.min(c.maxLead,speed*c.leadSeconds),length=speed||1;
  const wanted={x:(b.x+p.x)/2+b.vx/length*lead,z:(b.z+p.z)/2+b.vz/length*lead,distance:c.nearDistance+clamp(speed/c.fastBallSpeed,0,1)*c.speedZoom,direction:state.attackDir};
  const blend=previous?1-Math.exp(-c.smoothing*dt):1;
  const next={x:previous?previous.x+(wanted.x-previous.x)*blend:wanted.x,z:previous?previous.z+(wanted.z-previous.z)*blend:wanted.z,distance:previous?previous.distance+(wanted.distance-previous.distance)*blend:wanted.distance,direction:wanted.direction};
  const angle=c.elevationDegrees*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle),tan=Math.tan(c.fovDegrees*Math.PI/360);
  const arc=crossArc(state,config),points=[b,{x:p.x,z:p.z,y:0},{x:p.x,z:p.z,y:c.playerHeight}];
  if(arc)points.push({x:arc.x,z:arc.z,y:0},{x:(arc.fromX+arc.x)/2,z:(arc.fromZ+arc.z)/2,y:arc.height});
  for(const point of points){
    const dx=point.x-next.x,dz=(point.z-next.z)*next.direction,y=point.y||0;
    next.distance=Math.max(next.distance,y*sin+dz*cos+Math.max(Math.abs(dx)/(tan*aspect*c.safeX),Math.abs(y*cos-dz*sin)/(tan*c.safeY)));
  }return next;
}

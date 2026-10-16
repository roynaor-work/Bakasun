import {passDestination} from './soccer.mjs?v=g4b-20261017-1';
/** Pure presentation decisions; the simulation never imports this module. */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function playerAnimation(player,state,config){
  const a=config.view.animation,speed=Math.hypot(player.vx,player.vz);
  const celebrating=state.phase==='goal'&&state.ball.lastPlayer===player.id;
  const sprinting=player.id===state.controlled?state.sprint.active:player.sprinting;
  const mode=celebrating?'celebrate':player.slideTime>0||player.recover>0?'slide':player.kickTime>0?'kick':speed<=a.idleSpeed?'idle':sprinting?'sprint':'run';
  const clip={idle:'stand',run:'run',sprint:'run',kick:'kick',slide:'stand',celebrate:'jumping-jacks'}[mode];
  return {mode,clip,speed:mode==='run'||mode==='sprint'?clamp(speed/a.runSpeed,a.minRate,a.maxRate):1,
    lean:mode==='slide'?a.slideLean:mode==='sprint'?a.sprintLean:0};
}
export function passReceiver(state,config){
  return state.charging&&state.chargeKind==='pass'&&state.ball.owner===state.controlled?passDestination(state,config,state.charge/config.passing.chargeSeconds).target:null;
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
  for(const point of [b,{x:p.x,z:p.z,y:0},{x:p.x,z:p.z,y:c.playerHeight}]){
    const dx=point.x-next.x,dz=(point.z-next.z)*next.direction,y=point.y||0;
    next.distance=Math.max(next.distance,y*sin+dz*cos+Math.max(Math.abs(dx)/(tan*aspect*c.safeX),Math.abs(y*cos-dz*sin)/(tan*c.safeY)));
  }return next;
}

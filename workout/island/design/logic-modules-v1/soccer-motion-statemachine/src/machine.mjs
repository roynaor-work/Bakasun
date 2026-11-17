import { API_VERSION,HUBS,getClip,transitionsFrom,guardFailures,chooseLocomotion } from './graph.mjs';
import { sampleClip,blendPoses,correctFloor,FLOOR_POLICY } from './pose.mjs';
import { finite,freeze,clamp } from './math.mjs';

const EPS=1e-9;
export const RETIMING_POLICY=freeze({maxRate:1.5,gameSpeedsMps:[2.6,4.5,7.2],worldMotion:'simulation-owned horizontal velocity; never integrate animation Hips translation'});
export function playbackRateFor(clipOrId,speedMps){
  const clip=typeof clipOrId==='string'?getClip(clipOrId):clipOrId;
  finite(speedMps,'speedMps',0);
  return clip.loop&&clip.kind==='move'&&clip.speedMps>0?Math.min(RETIMING_POLICY.maxRate,speedMps/clip.speedMps):1;
}
export function createMotionState({role='field',clipId=HUBS[role],speedMps=0,heading=0,position=[0,0,0]}={}){
  const clip=getClip(clipId);
  if(!Object.hasOwn(HUBS,role)||clip.role!==role)throw new RangeError('clip does not belong to role');
  finite(speedMps,'speedMps',0);finite(heading,'heading');
  if(clip.loop&&clip.kind==='move'&&clip.speedMps>0&&speedMps>clip.speedMps*RETIMING_POLICY.maxRate)throw new RangeError('clip speed exceeds supported retiming envelope');
  if(clip.guards.some(g=>g.startsWith('maxSpeed:')&&speedMps>Number(g.slice(9))))throw new RangeError('clip speed exceeds supported retiming envelope');
  if(!Array.isArray(position)||position.length!==3)throw new RangeError('position must be xyz');
  position.forEach(v=>finite(v,'position'));
  return freeze({schemaVersion:1,apiVersion:API_VERSION,clock:0,clipId,time:0,cycle:0,role,speedMps,heading,position:[...position],blend:null,queue:null,sequence:0});
}
function validateState(s){
  if(!s||s.schemaVersion!==1||s.apiVersion!==API_VERSION)throw new RangeError('unsupported state schema');
  const c=getClip(s.clipId);
  if(c.role!==s.role)throw new RangeError('state role mismatch');
  for(const k of ['clock','time','cycle','speedMps','sequence'])finite(s[k],k,0);
  finite(s.heading,'heading');
  if(!Number.isSafeInteger(s.cycle)||!Number.isSafeInteger(s.sequence)||s.time>c.duration+EPS)throw new RangeError('state phase or counters out of range');
  if(!Array.isArray(s.position)||s.position.length!==3)throw new RangeError('invalid position');
  s.position.forEach(v=>finite(v,'position'));
  if(s.blend===undefined||s.queue===undefined)throw new RangeError('blend and queue must be explicit null or object');
  if(s.blend){
    finite(s.blend.startedAt,'blend startedAt',0);finite(s.blend.duration,'blend duration',Number.MIN_VALUE);
    if(s.blend.startedAt>s.clock||!Array.isArray(s.blend.fromPose)||s.blend.fromPose.length!==c.skeleton.length)throw new RangeError('invalid blend');
    for(const p of s.blend.fromPose){for(const [key,n] of [['translation',3],['rotation',4],['scale',3]]){if(!Array.isArray(p[key])||p[key].length!==n)throw new RangeError('invalid pose');p[key].forEach(v=>finite(v,'pose'));}if(Math.hypot(...p.rotation)<1e-12)throw new RangeError('zero pose quaternion');}
  }
  if(s.queue){normalizedRequest(s.queue.request);finite(s.queue.expiresAt,'queue expiry',0);finite(s.queue.priority,'queue priority',0);}
  return c;
}
export function restoreMotionState(json){
  const state=typeof json==='string'?JSON.parse(json):JSON.parse(JSON.stringify(json));
  validateState(state);return freeze(state);
}
function rawPose(s){
  const pose=sampleClip(getClip(s.clipId),s.time);
  return s.blend?blendPoses(s.blend.fromPose,pose,clamp((s.clock-s.blend.startedAt)/s.blend.duration,0,1)):pose;
}
/** Renderer-neutral parent-local TRS. Floor corrections affect presentation only. */
export function sampleMotion(state,{floor=true,floorPolicy=FLOOR_POLICY}={}){
  const clip=validateState(state),pose=rawPose(state);
  if(!floor)return freeze({clipId:clip.id,time:state.time,pose,diagnostics:null});
  const {pose:corrected,...diagnostics}=correctFloor(clip,pose,floorPolicy);
  return freeze({clipId:clip.id,time:state.time,pose:corrected,diagnostics});
}
function normalizedRequest(request){
  if(!request||typeof request.clipId!=='string')throw new TypeError('request.clipId is required');
  const clip=getClip(request.clipId),ttl=request.ttl??.45,priority=request.priority??clip.priority;
  finite(ttl,'ttl',0);finite(priority,'priority',0);
  return {clipId:clip.id,ttl,priority,cancel:request.cancel===true};
}
function edgeFor(state,request){return transitionsFrom(state.clipId).find(t=>t.to===request.clipId&&t.kind===(request.cancel?'cancel':'request'));}
function inWindow(s,e){const phase=s.time/getClip(s.clipId).duration;return phase>=e.exitWindow[0]-EPS&&phase<=e.exitWindow[1]+EPS;}
function enter(state,edge,events){
  if(state.sequence>=Number.MAX_SAFE_INTEGER)throw new RangeError('sequence overflow');
  const from=getClip(state.clipId),to=getClip(edge.to),fromPose=rawPose(state);
  const time=edge.entryPhase==='preserve-normalized'?state.time/from.duration*to.duration:edge.entryPhase*to.duration;
  const next={...state,clipId:to.id,time,cycle:0,sequence:state.sequence+1,blend:{fromClipId:from.id,fromPose,startedAt:state.clock,duration:edge.blendSeconds}};
  events.push({type:'transition',at:state.clock,from:from.id,to:to.id,transitionId:edge.id,kind:edge.kind});
  for(const e of to.events??[])if(Math.abs(e.time-time)<EPS)events.push({type:'clip-event',clipId:to.id,event:{...e},count:1,firstAt:state.clock,lastAt:state.clock});
  return next;
}
function processQueue(s,context,events){
  if(!s.queue)return s;
  if(s.queue.expiresAt<=s.clock+EPS){events.push({type:'queue-expired',at:s.clock,clipId:s.queue.request.clipId});return {...s,queue:null};}
  const request=s.queue.request,failures=guardFailures(getClip(request.clipId),s.role,{...context,speedMps:s.speedMps});
  if(failures.length){events.push({type:'queue-rejected',at:s.clock,clipId:request.clipId,guards:failures});return {...s,queue:null};}
  if(request.clipId===s.clipId)return {...s,queue:null};
  const edge=edgeFor(s,request);
  if(edge&&inWindow(s,edge))return enter({...s,queue:null},edge,events);
  return s;
}
export function requestMotion(state,request,context={}){
  validateState(state);const r=normalizedRequest(request),clip=getClip(r.clipId),events=[];
  const failures=guardFailures(clip,state.role,{...context,speedMps:state.speedMps});
  if(failures.length)return freeze({state,events:[{type:'request-rejected',at:state.clock,clipId:r.clipId,guards:failures}]});
  if(r.clipId===state.clipId)return freeze({state,events:[{type:'already-active',at:state.clock,clipId:r.clipId}]});
  const edge=edgeFor(state,r);
  if(edge&&inWindow(state,edge))return freeze({state:enter({...state,queue:null},edge,events),events});
  // Recoveries can only be entered through their designated automatic edge.
  if(clip.kind==='recovery'||r.cancel)return freeze({state,events:[{type:'request-rejected',at:state.clock,clipId:r.clipId,reason:r.cancel?'cancel-window-closed':'recovery-requires-predecessor'}]});
  if(r.ttl===0)return freeze({state,events:[{type:'queue-expired',at:state.clock,clipId:r.clipId}]});
  if(state.queue&&state.queue.expiresAt>state.clock&&state.queue.priority>r.priority)return freeze({state,events:[{type:'queue-kept',at:state.clock,clipId:state.queue.request.clipId}]});
  const queued={...state,queue:{request:r,expiresAt:state.clock+r.ttl,priority:r.priority}};
  return freeze({state:queued,events:[{type:'queued',at:state.clock,clipId:r.clipId,expiresAt:queued.queue.expiresAt,replaced:state.queue?.request.clipId??null}]});
}
function markerEvents(s,seconds,rate,events){
  if(rate<=0||seconds<=0)return;
  const clip=getClip(s.clipId),a=s.cycle*clip.duration+s.time,b=a+seconds*rate;
  for(const e of clip.events??[]){
    if(!Number.isFinite(e.time)||e.time<0||e.time>clip.duration)continue;
    let first,last,count;
    if(clip.loop){first=Math.floor((a-e.time+EPS)/clip.duration)+1;last=Math.floor((b-e.time+EPS)/clip.duration);first=Math.max(0,first);count=Math.max(0,last-first+1);}
    else{first=last=0;count=e.time>a+EPS&&e.time<=b+EPS?1:0;}
    if(count)events.push({type:'clip-event',clipId:clip.id,event:{...e},count,firstAt:s.clock+(first*clip.duration+e.time-a)/rate,lastAt:s.clock+(last*clip.duration+e.time-a)/rate});
  }
}
/** Advance at exact queue/exit boundaries. Loop intervals and marker occurrences are aggregated. */
export function advanceMotion(state,dt,context={}){
  validateState(state);finite(dt,'dt',0);
  if(!Number.isFinite(state.clock+dt)||state.clock+dt>Number.MAX_SAFE_INTEGER)throw new RangeError('clock overflow');
  let s={...state},remaining=dt;const events=[],start=[...state.position];
  for(let iteration=0;;iteration++){
    if(iteration>512)throw new RangeError('transition boundary overflow');
    s=processQueue(s,context,events);
    const clip=getClip(s.clipId),rate=playbackRateFor(clip,s.speedMps);
    if(!clip.loop&&s.time>=clip.duration-EPS){
      const edges=transitionsFrom(clip.id);let edge=edges.find(t=>t.kind==='automatic');
      if(!edge)throw new Error('missing recovery transition');
      const unsupported=guardFailures(getClip(edge.to),s.role,{...context,speedMps:s.speedMps}).some(g=>g.startsWith('maxSpeed:'));
      if(unsupported){edge=edges.find(t=>t.kind==='automatic-fallback');if(!edge)throw new Error('missing supported automatic fallback');events.push({type:'automatic-speed-fallback',at:s.clock,from:clip.id,to:edge.to});}
      s=enter(s,edge,events);continue;
    }
    if(remaining<=0)break;
    let step=remaining;
    if(!clip.loop&&rate>0)step=Math.min(step,(clip.duration-s.time)/rate);
    if(s.queue){step=Math.min(step,Math.max(0,s.queue.expiresAt-s.clock));const e=edgeFor(s,s.queue.request);if(e&&rate>0&&s.time<e.exitWindow[0]*clip.duration-EPS)step=Math.min(step,(e.exitWindow[0]*clip.duration-s.time)/rate);}
    if(step<=0)throw new RangeError('non-progressing clock boundary');
    markerEvents(s,step,rate,events);
    const raw=s.time+step*rate,loops=clip.loop?Math.floor((raw+EPS)/clip.duration):0;
    const time=clip.loop?Math.max(0,raw-loops*clip.duration):Math.min(raw,clip.duration);
    if(!Number.isSafeInteger(s.cycle+loops))throw new RangeError('cycle overflow');
    if(loops)events.push({type:'loop',at:s.clock+step,clipId:clip.id,count:loops});
    const moving=clip.kind==='move'||clip.kind==='bridge'||clip.locomotion===true,travel=moving?s.speedMps*step:0;
    s={...s,clock:s.clock+step,time,cycle:s.cycle+loops,position:[s.position[0]+Math.sin(s.heading)*travel,s.position[1],s.position[2]+Math.cos(s.heading)*travel]};
    if(s.blend&&s.clock>=s.blend.startedAt+s.blend.duration-EPS)s={...s,blend:null};
    remaining=Math.max(0,remaining-step);
  }
  return freeze({state:s,events,rootDisplacement:s.position.map((v,i)=>v-start[i])});
}
export function setLocomotion(state,{speedMps=state.speedMps,heading=state.heading}={},context={}){
  validateState(state);finite(speedMps,'speedMps',0);finite(heading,'heading');
  const next=freeze({...state,speedMps,heading});
  return requestMotion(next,{clipId:chooseLocomotion(speedMps,state.role),priority:10},context);
}

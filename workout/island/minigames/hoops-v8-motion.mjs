/** Island Pro Basketball — the hoops v8 motion pack (GPT package design/hoops-motion-v8, 06/11).
 * assets/hoops-v8/motion.json carries nine of the package's 15 authored clips as 60 Hz int16 quaternions on the same
 * 18-bone rig as the v7 bodies: five passes (chest, bounce, overhead, side, jump), two receptions, the steal and the block.
 * The simulation stays in charge: a clip never gives, takes or keeps the ball. The view only chooses WHICH clip plays and
 * WHEN (clip time is derived from the engine's own act time), so the ball stays in the hands until the engine releases it
 * and the release lands on the clip's release marker. Anything that fails to load leaves the v7 arm-IK passes in place.
 *
 * The pure helpers here do not need WebGL, so node tests can run them. */
export const V8_BONES=Object.freeze(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
export const V8_CLIPS=Object.freeze(['pass_chest','pass_bounce','pass_overhead','pass_side','pass_jump','receive_two_hands','receive_moving','steal','block']);
/** Clips whose authored Hips track carries the jump: the engine supplies the vertical world motion. */
export const V8_FLIGHT=Object.freeze(['pass_jump','block']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

/** ?hoopsV8=0 switches the v8 motion off (before/after captures), ?hoopsV8=1 forces it; otherwise the config decides. */
export function v8MotionEnabled(cfg,params){
 const q=params?.get?.('hoopsV8');
 if(q==='0')return false;if(q==='1')return !!cfg?.v8;
 return !!(cfg?.v8&&cfg.v8.enabled!==false&&cfg.v8.motion);
}
/** The venue half of the same switch. */
export function v8ArenaEnabled(cfg,quality,params){
 const q=params?.get?.('hoopsV8');
 if(q==='0')return false;
 if(q==='1')return !!cfg?.v8?.arena;
 return !!(cfg?.v8&&cfg.v8.enabled!==false&&cfg.v8.arena&&quality>=(cfg.v8.minQuality??1));
}

function decode64(text,Type){
 const bin=typeof atob==='function'?atob(text):Buffer.from(text,'base64').toString('binary'),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return new Type(bytes.buffer);
}
/** Validate and decode motion.json: {fps, clips:{id:{duration,frames,events,quat:Float32Array,hips:Float32Array,support}}}. Throws on a bad pack. */
export function decodeMotionPack(json){
 if(!json||json.version!==1||!json.clips)throw Error('Basketball v8 motion pack is malformed');
 if(json.bones?.join()!==V8_BONES.join())throw Error('Basketball v8 motion pack has another rig');
 const clips={};
 for(const id of V8_CLIPS){
  const c=json.clips[id];if(!c)throw Error('Basketball v8 clip missing: '+id);
  const q=decode64(c.quat,Int16Array),h=decode64(c.hips,Int16Array);
  if(q.length!==c.frames*V8_BONES.length*4||h.length!==c.frames*3)throw Error('Basketball v8 clip is truncated: '+id);
  const quat=new Float32Array(q.length),hips=new Float32Array(h.length);
  for(let i=0;i<q.length;i++)quat[i]=q[i]/32767;for(let i=0;i<h.length;i++)hips[i]=h[i]/10000;
  clips[id]={id,duration:c.duration,frames:c.frames,events:c.events,quat,hips,support:c.support||[],release:c.release||null,start:c.start,end:c.end};
 }
 return {fps:json.fps||60,hipsRest:json.hipsRest||0.86,clips};
}
/** AnimationClips for one body. `rest` = the body's own Hips rest position (from its idle clip), so the clip's Hips offset (metres on
 * the 0.86 m canonical hips) scales with the body's height; flight clips lose the part above the standing height (the crouch stays). */
export function buildV8Clips(THREE,pack,rest){
 const out=new Map(),scale=rest[1]/pack.hipsRest;
 for(const id of V8_CLIPS){
  const c=pack.clips[id],n=c.frames,times=new Float32Array(n);for(let f=0;f<n;f++)times[f]=Math.min(c.duration,f/pack.fps);
  const tracks=[];
  V8_BONES.forEach((name,bi)=>{const v=new Float32Array(n*4);for(let f=0;f<n;f++)for(let k=0;k<4;k++)v[f*4+k]=c.quat[(f*V8_BONES.length+bi)*4+k];tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,v));});
  const hv=new Float32Array(n*3),flight=V8_FLIGHT.includes(id);
  for(let f=0;f<n;f++){const oy=c.hips[f*3+1];hv[f*3]=rest[0]+c.hips[f*3]*scale;hv[f*3+1]=rest[1]+(flight?Math.min(0,oy):oy)*scale;hv[f*3+2]=rest[2]+c.hips[f*3+2]*scale;}
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position',times,hv));
  out.set('v8:'+id,new THREE.AnimationClip('v8:'+id,c.duration,tracks));
 }
 return out;
}
export async function loadV8Motion(cfg,base,fetchImpl=globalThis.fetch){
 const r=await fetchImpl(new URL(cfg.v8.motion,base));if(!r.ok)throw Error('Basketball v8 motion pack '+r.status);
 return decodeMotionPack(await r.json());
}

// ---- which clip, and where in it --------------------------------------------------------------
export const PASS_CLIP=Object.freeze({chest:'pass_chest',bounce:'pass_bounce',lob:'pass_overhead',overhead:'pass_overhead',long:'pass_overhead',jump:'pass_jump',side:'pass_side'});
/** Chest passes over a short distance use the side pass (a quick hand-off from the hip), everything else follows the engine's kind. */
export function passClipFor(kind,dist=5){
 if((kind==='chest'||!kind)&&dist<3.2)return 'pass_side';
 return PASS_CLIP[kind]||'pass_chest';
}
const PASS_SPEED={bounce:8.5,lob:9,overhead:9,long:9};
/** Seconds of the clip that play before its release marker: the engine releases after its own wind-up (0.16 s), so the load phase is
 * played in a shortened lead instead of delaying the pass. */
export const RELEASE_LEAD=0.3;
/** Clip time for a pass. Before the release the clip runs from `release - lead` to the release marker over the engine's wind-up and is
 * held just short of it while the engine still holds the ball; from the moment the ball is gone it plays in real time (the follow-through). */
export function passClipTime(clip,actT,windup,releasedAt){
 const rel=clip.events.release,lead=Math.min(rel,RELEASE_LEAD),w=Math.max(.05,windup);
 if(releasedAt==null)return Math.min(rel-.012,rel-lead+clamp(actT/w,0,1)*lead);
 return Math.min(clip.duration-.001,rel+Math.max(0,actT-releasedAt));
}
/** Clip time for the steal: the engine's reach moment lines up with the clip's contact marker. */
export function stealClipTime(clip,actT,reachAt=.14){
 const c=clip.events.contact,lead=Math.min(c,.28);
 return actT<reachAt?c-lead+clamp(actT/Math.max(.05,reachAt),0,1)*lead:Math.min(clip.duration-.001,c+(actT-reachAt));
}
/** Block: takeoff lands about a tenth of a second into the engine's jump, then real time. */
export function blockClipTime(clip,actT){return Math.min(clip.duration-.001,clip.events.takeoff-.11+actT);}
/** Reception: the ready pose until the ball is about one contact-time away, then the clip runs in real time so that its contact marker
 * meets the ball; after the catch it keeps running from the contact marker. `eta` is the ball's flight time left (seconds). */
export function receiveClipTime(clip,eta,sinceCatch=null){
 const c=clip.events.contact;
 if(sinceCatch!=null)return Math.min(clip.duration-.001,c+Math.max(0,sinceCatch));
 return clamp(c-Math.max(0,eta),0,c-.005);
}
export function passFlightSpeed(kind,fallback=11.5){return PASS_SPEED[kind]||fallback;}
export const RECEIVE_HOLD=0.5;

/** One handler's possession guard: once the ball is held with the dribble over, no animation may dribble again until the possession
 * ends (the ball leaves his hands). The engine already says so through `dribbling:false`; this is the view-side belt and braces. */
export function createDribbleGuard(){
 let locked=false;
 return {
  observe(p){if(!p.hasBall)locked=false;else if(p.dribbling===false)locked=true;return locked;},
  get locked(){return locked;},
  /** A dribbling plan is replaced by the held-ball plan while locked. */
  filter(plan){if(locked&&plan&&plan.mode==='dribble')return {upper:'idle_hold',lower:plan.lower,mode:'hold'};return plan;},
 };
}

/** The v8 override for an engine player: {full:'v8:<clip>', mode:'v8', t} or null (the v7 plan applies).
 * `s` is the avatar's own mutable state {releasedAt, passClip, recvClip, recvSince}. Pure. */
export function chooseV8Motion(pack,p,ctx,s,dt){
 const act=p.act;
 if(!pack)return null;
 if(act!=='pass'){s.passClip=null;s.releasedAt=null;}
 if(act==='pass'){
  const kind=p.passKind||ctx.passKind||'chest';
  if(!s.passClip)s.passClip=passClipFor(kind,ctx.passDist);
  if(s.releasedAt==null&&!p.hasBall)s.releasedAt=p.actT||0;
  const clip=pack.clips[s.passClip];
  return {full:'v8:'+s.passClip,mode:'v8',t:passClipTime(clip,p.actT||0,ctx.passWindup??.16,s.releasedAt)};
 }
 if(act==='steal')return {full:'v8:steal',mode:'v8',t:stealClipTime(pack.clips.steal,p.actT||0,ctx.stealReach??.14)};
 if(act==='block')return {full:'v8:block',mode:'v8',t:blockClipTime(pack.clips.block,p.actT||0)};
 if(act)return null;
 const moving=Math.hypot(p.vx||0,p.vz||0)>1.2,id=moving?'receive_moving':'receive_two_hands';
 if(ctx.catching&&!p.hasBall){
  s.recvSince=null;s.recvClip=id;
  return {full:'v8:'+id,mode:'v8',t:receiveClipTime(pack.clips[id],ctx.eta??0)};
 }
 if(p.hasBall&&s.recvClip){
  s.recvSince=(s.recvSince??0)+dt;
  if(s.recvSince<RECEIVE_HOLD)return {full:'v8:'+s.recvClip,mode:'v8',t:receiveClipTime(pack.clips[s.recvClip],0,s.recvSince)};
 }
 if(!p.hasBall||s.recvSince>=RECEIVE_HOLD){s.recvClip=null;s.recvSince=null;}
 return null;
}

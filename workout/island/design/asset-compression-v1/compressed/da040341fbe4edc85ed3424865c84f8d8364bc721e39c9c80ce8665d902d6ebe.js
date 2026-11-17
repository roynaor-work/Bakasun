import {Quaternion,Vector3} from '../../vendor/three.module.js';

export const smooth = u => (u = Math.max(0, Math.min(1, u))) * u * (3 - 2 * u);
const lerp = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);
const quat = a => new Quaternion().fromArray(a).normalize();
export function mix(a, b, w) {
  return {
    rotations: Object.fromEntries(Object.keys(a.rotations).map(n => [n, quat(a.rotations[n]).slerp(quat(b.rotations[n]), w).toArray()])),
    hipsOffsetMeters: lerp(a.hipsOffsetMeters, b.hipsOffsetMeters, w),
    referenceRootTranslationMeters: lerp(a.referenceRootTranslationMeters, b.referenceRootTranslationMeters, w)
  };
}
export function sample(clip, seconds, wrap = true) {
  const cycles = clip.loop && wrap ? Math.floor(Math.max(0, seconds) / clip.durationSeconds) : 0;
  const t = clip.loop && wrap ? ((seconds % clip.durationSeconds) + clip.durationSeconds) % clip.durationSeconds / clip.durationSeconds : Math.max(0, Math.min(1, seconds / clip.durationSeconds));
  const keys = clip.keyframes;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (keys[mid].time <= t) lo = mid; else hi = mid; }
  const a = keys[lo], b = keys[hi];
  const pose = mix(a, b, smooth((t - a.time) / (b.time - a.time)));
  const stride = clip.referenceLocomotion?.cycleAnchorTranslationMeters || [0, 0, 0];
  pose.referenceRootTranslationMeters = pose.referenceRootTranslationMeters.map((v, i) => v + cycles * stride[i]);
  // Acquire before the declared support window; release after it. Inside the
  // window the constraint is full strength. This also preacquires next cycle's
  // first plant before modulo wraps, without reusing the previous world anchor.
  const absolute=clip.loop ? (wrap ? Math.max(0,seconds)/clip.durationSeconds : t) : t;
  const ramp=.06/clip.durationSeconds, contacts=[];
  for(const c of clip.supportContacts || []) for(const cycle of clip.loop?[Math.floor(absolute)-1,Math.floor(absolute),Math.floor(absolute)+1]:[0]) {
    const start=cycle+c.startTime,end=cycle+c.endTime;
    if(absolute<start-ramp || absolute>end+ramp)continue;
    const weight=absolute<start?smooth((absolute-start+ramp)/ramp):absolute>end?1-smooth((absolute-end)/ramp):1;
    const candidate={...c,weight,contactKey:`${c.bone}:${cycle}:${c.startTime}`,anchorMeters:c.anchorMeters.map((v,i)=>v+cycle*stride[i])};
    const existing=contacts.findIndex(p=>p.bone===c.bone);
    if(existing<0)contacts.push(candidate);else if(weight>contacts[existing].weight)contacts[existing]=candidate;
  }
  pose.contacts=contacts;
  pose.normalizedTime = t;
  return pose;
}
export function eligible(data, state, events) {
  return data.transitions.filter(t => events.includes(t.on) && (t.source === state || t.source === '*' && t.target !== state)
    && !(t.on === 'fall_confirmed' && ['fall','recover'].includes(state))
    && !(t.on === 'result_success' && ['fall','recover','celebrate'].includes(state)))
    .sort((a,b)=>b.priority-a.priority)[0];
}
export function expandedTransitions(data) {
  return Object.keys(data.states).flatMap(state => data.transitions.filter(t => eligible(data, state, [t.on]) === t).map(t => ({...t, source:state})));
}

// Source angular/linear velocity is measured from the current displayed blend,
// not by resampling the old clip. Quaternion powers continue the shortest arc.
function extrapolate(current, previous, dt, seconds) {
  const out = structuredClone(current);
  for (const n of Object.keys(current.rotations)) {
    const q = quat(current.rotations[n]);
    const delta = quat(previous.rotations[n]).invert().multiply(q);
    if (delta.w < 0) delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
    const angle = 2 * Math.acos(Math.max(-1,Math.min(1,delta.w)));
    const sn = Math.sin(angle / 2);
    const power = sn < 1e-10 ? new Quaternion() : new Quaternion().setFromAxisAngle({x:delta.x/sn,y:delta.y/sn,z:delta.z/sn},angle*seconds/dt);
    out.rotations[n] = q.multiply(power).normalize().toArray();
  }
  for (const key of ['hipsOffsetMeters','referenceRootTranslationMeters']) out[key] = current[key].map((v,i)=>v+(v-previous[key][i])*seconds/dt);
  return out;
}
export class MotionPlayer {
  constructor(data, retargeter) { this.data=data; this.rig=retargeter; this.reset(data.initialState); }
  reset(state, time=0) {
    this.state=state; this.time=time; this.fade=null; this.origin=[0,0,0]; this.finished=false;this.locks=new Map();
    this.display=sample(this.data.states[state],time); this.previous=structuredClone(this.display); this.dt=1/120;
    this.apply();
  }
  apply() { this.rig.apply(this.display,{referenceRoot:this.display.referenceRootTranslationMeters,contacts:this.display.contacts || [],floor:true}); }
  event(events) {
    const t = eligible(this.data,this.state,Array.isArray(events)?events:[events]);
    if (!t) return null;
    const atEvent=this.rig.snapshot();
    const held = (this.display.contacts || []).map(c=>({...c,worldAnchorMeters:c.worldAnchorMeters||(c.mode==='ski-slide'?atEvent.feet[c.bone]:this.rig.scene.localToWorld(new Vector3().fromArray(c.anchorMeters).multiplyScalar(this.rig.scale)).toArray())}));
    this.locks=new Map(held.map(c=>[c.bone,{anchor:c.worldAnchorMeters,key:null}]));
    this.fade={transition:t,elapsed:0,source:structuredClone(this.display),previous:structuredClone(this.previous),dt:this.dt,held};
    this.origin=[...this.display.referenceRootTranslationMeters]; this.state=t.target; this.time=0; this.finished=false;
    // Zero elapsed keeps the complete incoming displayed pose and contact set.
    return t;
  }
  step(dt, {autoFinish=false,moving=false}={}) {
    this.previous=structuredClone(this.display); this.dt=dt;
    this.time+=dt;
    const clip=this.data.states[this.state];
    const target=sample(clip,this.time);
    target.referenceRootTranslationMeters=target.referenceRootTranslationMeters.map((v,i)=>v+this.origin[i]);
    target.contacts=target.contacts.map(c=>({...c,anchorMeters:c.anchorMeters.map((v,i)=>v+this.origin[i])}));
    for(const [bone,lock] of this.locks){
      const contact=target.contacts.find(c=>c.bone===bone);
      if(!contact){if(!this.fade)this.locks.delete(bone);continue;}
      if(lock.key===null)lock.key=contact.contactKey;
      if(lock.key!==contact.contactKey){this.locks.delete(bone);continue;}
      contact.worldAnchorMeters=lock.anchor;
    }
    if(this.fade) {
      const fade=this.fade; fade.elapsed+=dt;
      const w=smooth(fade.elapsed/fade.transition.visualBlendSeconds);
      this.display=mix(extrapolate(fade.source,fade.previous,fade.dt,fade.elapsed),target,w);
      const byBone=new Map(target.contacts.map(c=>[c.bone,c]));
      // Carry outgoing world anchors, releasing smoothly over the fade. Target
      // constraints ramp in rather than snapping on the state-change frame.
      for(const c of fade.held) {
        const incoming=byBone.get(c.bone);
        const fromHorizontal=c.horizontalWeight ?? (c.mode==='ski-slide'?0:1);
        const toHorizontal=incoming?(incoming.horizontalWeight ?? (incoming.mode==='ski-slide'?0:1)):fromHorizontal;
        byBone.set(c.bone,incoming?{...incoming,worldAnchorMeters:c.worldAnchorMeters,horizontalWeight:fromHorizontal*(1-w)+toHorizontal*w,weight:(c.weight??1)*(1-w)+incoming.weight*w}:{...c,weight:(c.weight??1)*(1-w)});
      }
      this.display.contacts=[...byBone.values()].map(c=>({...c,weight:fade.held.some(h=>h.bone===c.bone)?c.weight:c.weight*w}));
      if(w>=1) { this.display=target; this.fade=null; }
    } else this.display=target;
    this.apply();
    if(autoFinish && !clip.loop && this.time>=clip.durationSeconds && !this.finished) {
      this.finished=true;
      this.event([moving?'clip_finished_and_moving':'clip_finished_and_stopped','clip_finished']);
    }
    return this.display;
  }
}

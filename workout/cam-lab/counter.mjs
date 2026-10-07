// Pure landmark logic; timestamps are monotonic milliseconds. No camera/storage/network.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const essential = [0,11,12,13,14,15,16,23,24,25,26,27,28];
export function fullBody(points) {
  const visible = Array.isArray(points) && essential.every(i => {
    const p = points[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      (p.visibility ?? 0) >= .65 && p.x > .035 && p.x < .965 && p.y > .035 && p.y < .965;
  });
  if (!visible) return false;
  const body=(points[27].y+points[28].y)/2-points[0].y;
  // Pose gives a nose, not the crown: reserve an approximate head margin above it.
  return body>.2 && points[0].y-.10*body>.035;
}
export function thresholds({age = 7, height = 120} = {}) {
  age = clamp(Number(age) || 7, 5, 12); height = clamp(Number(height) || 120, 90, 170);
  // Experimental tolerance, not age-specific medical targets. Height sets an approximate
  // 8cm knee lift as fraction of entered stature (bounded to avoid unreasonable targets).
  return { squatDown: age <= 8 ? 120 : 115, squatUp: 158, squatAttempt: 145,
    kneeUp: clamp(8 / height, .05, .085), kneeDown: .025,
    jackOpen: age <= 8 ? 1.55 : 1.65, jackClosed: 1.18,
    holdMs: age <= 8 ? 140 : 120, minRepMs: 450, maxRepMs: 12000,
    smoothMs: 90, collapseRatio: .65 };
}
export function angle(a,b,c) {
  const u = ['x','y','z'].map(k => (a[k] ?? 0) - (b[k] ?? 0));
  const v = ['x','y','z'].map(k => (c[k] ?? 0) - (b[k] ?? 0));
  const size = Math.hypot(...u) * Math.hypot(...v);
  return size ? Math.acos(clamp(u.reduce((s,x,i)=>s+x*v[i],0)/size,-1,1))*180/Math.PI : NaN;
}
export function features(p, world, baseline) {
  const body = baseline || ((p[27].y+p[28].y)/2-p[0].y);
  const shoulder = Math.abs(p[11].x-p[12].x);
  if (body <= .2 || shoulder <= .035) return null; // frontal view required
  const w = world?.length === 33 ? world : p;
  const kneeAngle = (angle(w[23],w[25],w[27])+angle(w[24],w[26],w[28]))/2;
  return { kneeAngle,
    kneeRatio: Math.abs(p[25].x-p[26].x)/Math.max(.02,Math.abs(p[27].x-p[28].x)),
    front: shoulder / body > .12,
    feet: Math.abs(p[27].x-p[28].x)/shoulder,
    handsUp: Math.min(p[11].y-p[15].y,p[12].y-p[16].y)/body,
    leftLift: (p[28].y-p[27].y)/body,
    rightLift: (p[27].y-p[28].y)/body,
    leftKneeHeight:(p[23].y-p[25].y)/body, rightKneeHeight:(p[24].y-p[26].y)/body,
    // Raised knee approaches hip; require an actual flexed leg, not lateral translation.
    leftBent: angle(w[23],w[25],w[27]), rightBent: angle(w[24],w[26],w[28]) };
}
export const reasons = {
  partial: 'טווח תנועה חלקי', knees: 'סימן אפשרי לברכיים פנימה',
  arms: 'הידיים והרגליים לא נפתחו יחד', tracking: 'הגוף לא היה ברור בתמונה',
  fast: 'תנועה קצרה מדי לזיהוי', timeout: 'התנועה לא הושלמה בזמן',
};
export class RepCounter {
  constructor(exercise, profile) {
    if (!['squats','jumping-jacks','high-knees'].includes(exercise)) throw new Error('Unknown exercise');
    this.exercise=exercise; this.t=thresholds(profile); this.count=0; this.rejected=0;
    this.why={}; this.lastTime=null; this.smoothed=null; this.resetMotion();
  }
  resetMotion() { this.phase='unarmed'; this.pending=null; this.pendingAt=0; this.started=0; this.deep=false; this.bad=null; this.badAt=null; this.side=null; }
  reject(reason) { this.rejected++; this.why[reason]=(this.why[reason]||0)+1; return {kind:'rejected',reason}; }
  finish(now) {
    const reason=this.bad || (!this.deep ? (this.exercise==='jumping-jacks'?'arms':'partial') : null) ||
      (now-this.started < this.t.minRepMs ? 'fast' : null);
    const event=reason ? this.reject(reason) : (this.count++,{kind:'counted'});
    this.resetMotion(); this.phase='ready'; return event;
  }
  stable(target, now) {
    if (!target) {this.pending=null; return false;}
    if (target!==this.pending) {this.pending=target;this.pendingAt=now;return false;}
    return now-this.pendingAt>=this.t.holdMs;
  }
  update(points, now, world, baseline) {
    if (!Number.isFinite(now) || (this.lastTime!==null && now<=this.lastTime)) return null;
    const dt=this.lastTime===null?33:now-this.lastTime; this.lastTime=now;
    if (!fullBody(points) || dt>600) {
      const event=this.phase==='moving'?this.reject('tracking'):null;
      this.resetMotion();this.smoothed=null;return event;
    }
    const raw=features(points,world,baseline);
    if (!raw || !Object.values(raw).every(v=>typeof v==='boolean'||Number.isFinite(v))) {
      const event=this.phase==='moving'?this.reject('tracking'):null;
      this.resetMotion();this.smoothed=null;return event;
    }
    const alpha=1-Math.exp(-dt/this.t.smoothMs);
    const f={}; for (const [k,v] of Object.entries(raw)) f[k]=typeof v==='boolean'?v:
      this.smoothed ? this.smoothed[k]+alpha*(v-this.smoothed[k]) : v;
    this.smoothed=f;
    let neutral, attempt, deep;
    if (this.exercise==='squats') {
      neutral=f.kneeAngle>this.t.squatUp;attempt=f.kneeAngle<this.t.squatAttempt;
      deep=f.kneeAngle<this.t.squatDown;
      // Sustained frontal cue only; never infer knee alignment in side view.
      if (this.phase==='moving' && f.front && f.kneeRatio<this.t.collapseRatio) {
        this.badAt ??= now; if(now-this.badAt>=200) this.bad='knees';
      } else this.badAt=null;
    } else if(this.exercise==='jumping-jacks') {
      neutral=f.feet<this.t.jackClosed && f.handsUp<-.12;
      attempt=f.feet>1.3 || f.handsUp>0;
      deep=f.feet>this.t.jackOpen && f.handsUp>.08;
    } else {
      neutral=Math.max(f.leftLift,f.rightLift)<this.t.kneeDown;
      const side=f.leftLift>f.rightLift?'left':'right';
      attempt=f[side+'Lift']>this.t.kneeDown+.015;
      if(this.phase!=='moving') this.side=side;
      deep=f[this.side+'Lift']>this.t.kneeUp && f[this.side+'Bent']<135 && f[this.side+'KneeHeight']>-.12;
    }
    if(this.phase==='unarmed') { if(this.stable(neutral?'neutral':null,now)){this.phase='ready';this.pending=null;} return null; }
    if(this.phase==='ready') {
      if(this.stable(attempt?'attempt':null,now)) {
        this.phase='moving';this.started=this.pendingAt;this.pending=null;this.deep=false;
      }
      return null;
    }
    if(now-this.started>this.t.maxRepMs) {const e=this.reject('timeout');this.resetMotion();return e;}
    // Depth must persist too; a single pose spike cannot validate a repetition.
    if(this.stable(deep?'deep':neutral?'neutral':null,now)) {
      if(deep){this.deep=true;this.pending=null;}
      else if(neutral) return this.finish(now);
    }
    return null;
  }
  interrupt() {
    const event=this.phase==='moving'?this.reject('tracking'):null;
    this.resetMotion();this.smoothed=null;this.lastTime=null;return event;
  }
  summary() {return {count:this.count,rejected:this.rejected,reasons:{...this.why}};}
}

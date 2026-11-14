// אי החזירים: כיוון v24 (14/11/2026).
// Roy after v22.1: "היכולת להזיז את הכיוון ירי לא מספיק טובה. צריך לתקן את היכולת לכוון מדויק יותר ולהזיז בקלות יותר."
// Measured on v23 (real touch through the island, and a child-like touch model): the crosshair kept its full speed over a boar, so a thumb
// that reacts in a fifth of a second overshot the small far boars and needed about 6 corrections to settle; a walking boar slid out from
// under the crosshair; and the ring's centre stayed where the thumb landed, so after a fast push past the ring the stick kept pointing the
// old way until the thumb travelled all the way back ("אחרי הזזת אגודל מהירה").
// v24 keeps the v23 stick (dead zone, curve, smoothing, top speeds, precision finger, sensitivity) and adds, only while the thumb is on the
// stick: a ring that follows the thumb past its edge, a slowdown over a boar, a gentle pull to the eyes of the boar closest to the crosshair,
// and following the boar that is under the crosshair. A push away from the boar switches the pull off, so it never holds the crosshair
// against the thumb. With the thumb off the stick nothing moves the crosshair, and the fire button never moves it.
// Pure module (no DOM, no Three.js): CSS px and seconds. game.js gives it the boars as circles on the screen; the tests and the touch model
// use it as is. `?boarAim=v23` on the island URL turns all of it off.

/** The v23 stick as game.js runs it (STICK_V21 + AIM_TRUE): ring radius, dead zone, curve, smoothing, top speeds in screen halves per second. */
export const V23=Object.freeze({R:80,DZ:.08,LIN:.3,POW:1,TAU:.045,SPEED_X:1.6,SPEED_Y:1.3});
export const AIM24=Object.freeze({
  ...V23,                                // the stick itself is unchanged (faster or curved versions made the child overshoot more)
  FRICTION_MIN:.6,FRICTION_PAD:22,       // over a boar the thumb moves the crosshair at 60% speed, back to 100% at 22 px from its edge
  FRICTION_MAX_R:45,                     // circles bigger than 45 px (a boss's body) do not slow the crosshair
  MAGNET_SCALE:2.6,MAGNET_MIN:44,MAGNET_MAX_R:70, // pull radius around the aim point: 2.6 x the boar's hit radius, 44 to 70 px
  MAGNET_K:4,MAGNET_SPEED:260,MAGNET_FAST:.4, // pull speed 4/s x the distance (at most 260 px/s), 40% weaker while the thumb pushes hard
  AWAY_COS:-.2,AWAY_TILT:.15,            // a push more than about 100 degrees away from the boar (15% of the speed or more) switches the pull off
  TRACK:.9,TRACK_PAD:6,TRACK_SPEED:420,  // over a boar the crosshair follows 90% of its movement on the screen (at most 420 px/s)
  VEL_TAU:.08,SWITCH:.7                  // the boar's speed is smoothed over 80 ms; another boar must be 30% closer to take over
});

const smooth01=x=>x<=0?0:x>=1?1:x*x*(3-2*x);

/** The ring follows the thumb: when the thumb is further than R from the centre, the centre is dragged along the line to the thumb.
 *  Mutates `s` ({ox,oy}); returns the thumb offset from the (new) centre and whether the centre moved. */
export function followAnchor(s,x,y,R=AIM24.R){
  let dx=x-s.ox,dy=y-s.oy;const d=Math.hypot(dx,dy);
  if(d>R){const k=(d-R)/d;s.ox+=dx*k;s.oy+=dy*k;dx=x-s.ox;dy=y-s.oy;return {dx,dy,d:R,moved:true};}
  return {dx,dy,d,moved:false};
}

/** Stick response 0..1 for a thumb offset of m ring radii: dead zone, linear start (slope LIN), full speed at full tilt (game.js stickMag). */
export function stickCurve(m,{DZ,LIN,POW=1}=AIM24){const mag=Math.max(0,Math.min(1,(m-DZ)/(1-DZ)));return mag*(LIN+(1-LIN)*mag**POW);}
/** Top speed (CSS px/s) in a screen direction (ux,uy) on a W x H screen, as AIM_TRUE: the thumb's direction is kept, each axis has its own top speed. */
export function topSpeed(ux,uy,W,H,{SPEED_X,SPEED_Y}=AIM24){return Math.hypot(SPEED_X*W/2*ux,SPEED_Y*H/2*uy);}

/** Distance from (x,y) to the nearest circle of a target (negative = inside). maxR skips circles bigger than that. */
export function edgeDistance(t,x,y,maxR=Infinity){let best=Infinity;for(const z of t.zones){if(z.r>maxR)continue;const d=Math.hypot(x-z.x,y-z.y)-z.r;if(d<best)best=d;}return best;}
const bodyRadius=t=>t.zones.reduce((m,z)=>Math.max(m,z.r),0);
/** Pull radius around a target's aim point. */
export function magnetRadius(t,P=AIM24){return Math.min(P.MAGNET_MAX_R,Math.max(P.MAGNET_MIN,bodyRadius(t)*P.MAGNET_SCALE));}

/** The aim help. step() takes the stick's velocity (px/s, with sensitivity and precision), its speed fraction `tilt` (0..1), the crosshair
 *  and the boars on the screen ({id,x,y,zones:[{x,y,r}]}, x/y = the aim point), and returns the velocity to apply.
 *  With `held:false` it returns the input untouched and forgets its target. */
export function createAimAssist(P=AIM24){
  const seen=new Map();let target=null,info=null;
  function track(targets,dt){
    const k=dt>0?1-Math.exp(-dt/P.VEL_TAU):1,live=new Set();
    for(const t of targets){live.add(t.id);const s=seen.get(t.id);
      if(!s){seen.set(t.id,{x:t.x,y:t.y,vx:0,vy:0,n:0});continue;}
      if(dt>0){const ivx=(t.x-s.x)/dt,ivy=(t.y-s.y)/dt;s.vx+=(ivx-s.vx)*(s.n?k:1);s.vy+=(ivy-s.vy)*(s.n?k:1);s.n++;}
      s.x=t.x;s.y=t.y;}
    for(const id of seen.keys())if(!live.has(id))seen.delete(id);
  }
  function pick(targets,cx,cy){
    let best=null,bestScore=Infinity,cur=null,curScore=Infinity;
    for(const t of targets){const R=magnetRadius(t,P),dc=Math.hypot(t.x-cx,t.y-cy),d=edgeDistance(t,cx,cy,P.FRICTION_MAX_R);
      if(dc>R&&d>P.FRICTION_PAD)continue;const score=Math.min(dc/R,Math.max(0,d)/R);
      if(score<bestScore){bestScore=score;best=t;}if(target!==null&&t.id===target){cur=t;curScore=score;}}
    if(cur&&best!==cur&&bestScore>curScore*P.SWITCH)best=cur;
    target=best?best.id:null;return best;
  }
  return {
    get target(){return target;},get info(){return info;},
    reset(){seen.clear();target=null;info=null;},
    step({dt,cx,cy,vx,vy,held,tilt=0,targets=[]}){
      if(!held){if(target!==null||seen.size)this.reset();return {vx,vy,info:null};}
      track(targets,dt);const t=pick(targets,cx,cy);
      if(!t){info=null;return {vx,vy,info};}
      const edge=edgeDistance(t,cx,cy,P.FRICTION_MAX_R),R=magnetRadius(t,P),dx=t.x-cx,dy=t.y-cy,dc=Math.hypot(dx,dy);
      const sp=Math.hypot(vx,vy),cos=sp>1e-6&&dc>1e-6?(vx*dx+vy*dy)/(sp*dc):1,away=tilt>=P.AWAY_TILT&&cos<P.AWAY_COS;
      // 1. slowdown: the thumb moves the crosshair slower over a boar and close to it
      const f=P.FRICTION_MIN+(1-P.FRICTION_MIN)*smooth01(edge/P.FRICTION_PAD);
      let ox=vx*f,oy=vy*f,pull=0,follow=0;
      // 2. pull to the aim point (eyes first), off when the thumb pushes away from the boar, weaker while it pushes hard
      if(!away&&dc<R&&dc>1e-6){const w=(1-smooth01(dc/R))*(1-P.MAGNET_FAST*smooth01(tilt/.7));pull=Math.min(P.MAGNET_SPEED,P.MAGNET_K*dc)*w;
        if(dt>0)pull=Math.min(pull,dc/dt);ox+=dx/dc*pull;oy+=dy/dc*pull;}
      // 3. follow the boar that is under the crosshair
      const s=seen.get(t.id);
      if(s&&s.n>1&&edge<P.TRACK_PAD){follow=P.TRACK*(1-smooth01(Math.max(0,edge)/P.TRACK_PAD));let tx=s.vx*follow,ty=s.vy*follow;const ts=Math.hypot(tx,ty);
        if(ts>P.TRACK_SPEED){tx*=P.TRACK_SPEED/ts;ty*=P.TRACK_SPEED/ts;}ox+=tx;oy+=ty;}
      info={id:t.id,edge:+edge.toFixed(1),friction:+f.toFixed(3),pull:+pull.toFixed(1),follow:+follow.toFixed(2),away};
      return {vx:ox,vy:oy,info};
    }
  };
}

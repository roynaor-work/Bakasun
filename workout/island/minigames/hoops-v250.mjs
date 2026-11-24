/** Island Pro Basketball v25.0 (24/11/2026), round 2 of the basketball push: the feel around the ball.
 * Pure rules, no DOM and no three.js: the shot meter model, the tap on a team-mate, the rebound jump timing and its cue,
 * the defender auto-stick, the special meter, the made-basket replay rule and its broadcast camera, and the foot-slide
 * measure. The engine, the session and the view call in here; `?hoopsV250=0` turns the whole layer off and each part has
 * its own switch (see FLAGS). Nothing here reads the clock or the random stream: same input, same output. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hyp=Math.hypot;

/** URL switch per part. `?hoopsV250=0` = v24.9 exactly. */
export const FLAGS=Object.freeze({meter:'hoopsMeter250',hud:'hoopsHud250',tapPass:'hoopsTapPass',rebound:'hoopsRebound250',stick:'hoopsStick',replay:'hoopsReplay250',special:'hoopsSpecial',feet:'hoopsFeet250'});
export function hoopsV250Flags(params){
 const get=k=>params&&typeof params.get==='function'?params.get(k):null,on=get('hoopsV250')!=='0',out={on};
 for(const [key,name] of Object.entries(FLAGS))out[key]=on&&get(name)!=='0';
 return out;
}

export const V250=Object.freeze({
 // rebound: the catch at the top of the jump is perfect; `bonus` is added to the child's rebound weight times the timing value
 rebound:Object.freeze({bonus:0.1,floor:0.1,catchHeight:3.0,lead:0.36,window:0.2,bounce:0.3}),
 // auto-stick: inside `radius` of the guarding spot and steering within the cone, half of the stick is replaced by the pull
 stick:Object.freeze({radius:3.5,cone:0.25,pull:0.65,settle:0.9,minSpeed:0.25}),
 // special meter: what fills it (fractions of a full meter) and what the fire shot adds to the make chance
 special:Object.freeze({bonus:0.18,green:0.1,yellow:0.03,basket:0.07,three:0.1,freeThrow:0.02,defence:0.07,rebound:0.035,reboundPerfect:0.04,alleyoop:0.1,tapPass:0.008}),
 // tap on a team-mate: a touch that stays within `move` px and `ms` milliseconds, within `radius` px of his body on screen
 tap:Object.freeze({radius:40,move:14,ms:320}),
 // made-basket replay: a three or a green-release basket of the child's team, at most one per `cooldown` seconds of wall time
 replay:Object.freeze({cooldown:38,cut:Object.freeze({before:0.9,slowBefore:0.9,slowAfter:0.5,after:1.05,slowScale:0.45,skipBlend:0.35})}),
 meter:Object.freeze({hold:0.65}),
});

/** What the engine needs (createHoopsEngine `v250`), or null when every engine part is off. */
export function engineV250(flags){
 if(!flags?.on||!(flags.tapPass||flags.rebound||flags.stick||flags.special))return null;
 return {tapPass:flags.tapPass,rebound:flags.rebound?V250.rebound:null,stick:flags.stick?V250.stick:null,special:flags.special?V250.special:null};
}

// ---------- shot meter ----------
/** The meter of a held shot as fractions of its height (0 bottom, 1 top): the marker, the yellow band and the green window.
 * The same numbers as the engine's `timingQuality` (window, green, yellow around the clip's release), so what the child sees
 * is what is graded. */
export function meterModel(actT,release,shot){
 const w=shot.window,g=w*(shot.green??0.35),y=w*(shot.yellow??0.8),max=release+w,f=v=>clamp(v/max,0,1);
 const e=Math.abs(actT-release);
 return {marker:f(actT),green:[f(release-g),f(release+g)],yellow:[f(release-y),f(release+y)],ideal:f(release),zone:e<=g?'green':e<=y?'yellow':'red',early:actT<release,max};
}
/** Grade icon name of a `timing` event. */
export const releaseGrade=e=>e.zone==='green'?'perfect':e.zone==='yellow'?'good':e.early?'early':'late';

// ---------- tap on a team-mate ----------
/** Which candidate a tap means: each has the screen points of his feet and his head; the nearest body segment within `radius`
 * wins. Candidates off screen (`visible:false`) never match. Returns the id or null. */
export function pickTapTarget(tap,candidates,radius=V250.tap.radius){
 let best=null,bd=radius;
 for(const c of candidates){
  if(c.visible===false)continue;
  const ax=c.foot.x,ay=c.foot.y,bx=c.head.x,by=c.head.y,dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1;
  const t=clamp(((tap.x-ax)*dx+(tap.y-ay)*dy)/l2,0,1),d=hyp(tap.x-ax-dx*t,tap.y-ay-dy*t);
  if(d<bd){bd=d;best=c.id;}
 }
 return best;
}
/** Is a touch a tap (short, still)? */
export function isTap(down,up,cfg=V250.tap){return !!down&&up.t-down.t<=cfg.ms&&hyp(up.x-down.x,up.y-down.y)<=cfg.move;}

// ---------- rebound ----------
/** Grade of a rebound jump from `u`, the fraction of the jump already flown at the catch: the top (0.5) is perfect. */
export function reboundTiming(u){
 u=clamp(u,0,1);const value=clamp(1-Math.abs(u-0.5)/0.42,0,1);
 return {value,grade:value>=0.6?'perfect':value>=0.25?'good':u<0.5?'late':'early'};
}
/** The child's extra rebound weight with timing: a badly timed jump is worth less than the flat v24.9 bonus, a perfect one more,
 * so the cue (which makes him jump more often) does not tilt the boards on its own. */
export function reboundWeight(userBonus,u,cfg=V250.rebound){const v=reboundTiming(u).value;return userBonus*(cfg.floor+(1-cfg.floor)*v)+cfg.bonus*v;}
/** Where and when a missed ball comes down to catching height: `t` seconds from now, `go` true inside the window in which
 * a jump started now meets the ball at its top. */
export function reboundCue(b,gravity,cfg=V250.rebound){
 const h=cfg.catchHeight,dy=b.y-h,disc=b.vy*b.vy+2*gravity*dy;
 const t=disc>0?Math.max(0,(b.vy+Math.sqrt(disc))/gravity):0;
 return {x:+(b.x+b.vx*t).toFixed(2),z:+(b.z+b.vz*t).toFixed(2),t:+t.toFixed(3),go:Math.abs(t-cfg.lead)<=cfg.window};
}
/** The same cue while the shot is still in the air (nobody knows yet whether it drops): the spot in front of the rim and the
 * time until the ball is down at the rim plus one bounce. A made basket simply ends the cue. */
export function shotCue(b,rimY,spot,gravity,cfg=V250.rebound){
 const dy=b.y-rimY,disc=b.vy*b.vy+2*gravity*dy,t=(disc>0?Math.max(0,(b.vy+Math.sqrt(disc))/gravity):0)+cfg.bounce;
 return {x:+spot.x.toFixed(2),z:+spot.z.toFixed(2),t:+t.toFixed(3),go:Math.abs(t-cfg.lead)<=cfg.window,flight:true};
}

// ---------- defender auto-stick ----------
/** The steering of the child's defender near his man: `dir` is the unit stick direction, the result the blended direction and
 * a speed cap that settles him on the guarding spot (between the man and the basket, `gap` from the man). Null when he is
 * far, or steering away (outside the cone): then the stick is his alone. */
export function stickAssist(p,dir,man,rim,gap,cfg=V250.stick){
 const dr=hyp(rim.x-man.x,rim.z-man.z),k=Math.min(gap/Math.max(0.6,dr),0.85),px=man.x+(rim.x-man.x)*k,pz=man.z+(rim.z-man.z)*k;
 const dx=px-p.x,dz=pz-p.z,d=hyp(dx,dz);
 if(d>cfg.radius)return null;
 if(d<0.12)return {x:0,z:0,speed:0,d};
 const tx=dx/d,tz=dz/d,dot=dir.x*tx+dir.z*tz;
 if(dot<cfg.cone)return null;
 let x=dir.x*(1-cfg.pull)+tx*cfg.pull,z=dir.z*(1-cfg.pull)+tz*cfg.pull;const l=hyp(x,z)||1;x/=l;z/=l;
 return {x,z,speed:clamp(d/cfg.settle,cfg.minSpeed,1),d};
}

// ---------- special meter ----------
/** How much one engine event fills the child's special meter (0 when it is not his team's good play). */
export function specialGain(ev,{userTeam=0,controlled=null,teamOf=()=>null}={},cfg=V250.special){
 switch(ev.type){
  case 'timing':return ev.playerId===controlled?(ev.zone==='green'?cfg.green:ev.zone==='yellow'?cfg.yellow:0):0;
  case 'score':return ev.team===userTeam?(ev.shotType==='ft'?cfg.freeThrow:ev.points===3?cfg.three:cfg.basket):0;
  case 'steal':case 'interception':case 'block':return teamOf(ev.playerId)===userTeam?cfg.defence:0;
  case 'rebound':return teamOf(ev.playerId)===userTeam?cfg.rebound:0;
  case 'reboundTiming':return ev.grade==='perfect'&&ev.won?cfg.reboundPerfect:0;
  case 'alleyoop':return ev.result==='score'&&ev.team===userTeam?cfg.alleyoop:0;
  case 'tapPass':return cfg.tapPass;
  default:return 0;
 }
}

// ---------- made-basket replay ----------
/** The made baskets of the child's team that earn the short broadcast replay: a three, or a basket released in the green.
 * `existing` are the show's own triggers of this step (dunk, alley-oop, buzzer, winner): those keep their own replay.
 * `state` = {lastWall, green:Set of shooter ids whose last release was green}; `wall` in seconds. One trigger at most. */
export function basketReplayTrigger(batch,{userTeam=0,existing=[],state,wall=0,cfg=V250.replay}={}){
 if(!batch?.length||!state)return null;
 for(const e of batch){
  if(e.type==='timing'){if(e.zone==='green')state.green.add(e.playerId);else state.green.delete(e.playerId);}
 }
 for(const e of batch){
  if(e.type!=='score'||e.team!==userTeam||e.shotType==='ft'||e.playerId==null)continue;
  const green=state.green.delete(e.playerId);
  if(existing.some(t=>t.playerId===e.playerId))continue;
  if(!(e.points===3||green))continue;
  if(state.lastWall!=null&&wall-state.lastWall<cfg.cooldown)continue;
  state.lastWall=wall;
  return {reason:e.points===3?'three':'green',playerId:e.playerId,team:e.team,shotId:e.shotId??null,home:true,cam:'broadcast',cut:cfg.cut};
 }
 return null;
}
/** The broadcast angle of the short replay: high on the main-camera side, tight on the attacked basket, panned a little
 * to the shooter so the release and the net are both in the frame. */
export function broadcastReplayCamera(scorer,side,court,{landscape=true}={}){
 const s=side<0?-1:1,rx=s*court.rimX,sx=scorer?.x??rx-s*5,sz=scorer?.z??0,mx=rx+(sx-rx)*0.5,mz=sz*0.5;
 return {pos:[mx-s*1.5,5.2,13.5],look:[mx,2.0,mz],fov:landscape?34:50};
}

// ---------- foot slide ----------
/** The fix for the worst slide found by the measure (tools/hoops-v250-touch.mjs feet=1): the side-shuffle clips cover 0.55 m/s
 * per cycle and were played at up to 5 m/s. Now they stop at `slideMax` (above it the body turns and runs, `slideRate` keeps their
 * cadence), the defender's body follows his travel direction above the same speed, and a moving loop stays for `dwell` seconds
 * before the next one (fewer clip changes under a planted foot). `heading` replaces the
 * shared athletes heading constants for basketball only. */
export const FEET=Object.freeze({slideMax:2.2,slideRate:1.7,dwell:0.22,heading:Object.freeze({minSpeed:1.6,engage:40*Math.PI/180,release:16*Math.PI/180,rate:12,faceRate:16,slideMax:2.2})});
/** Foot slide of one planted foot between two samples: the distance the foot moved on the floor while it was on the floor
 * in both (`y` under `plantY`). Metres. */
export function plantedSlide(a,b,plantY=0.09){return a&&b&&a.y<plantY&&b.y<plantY?hyp(b.x-a.x,b.z-a.z):0;}
/** Summary of a list of per-frame slides (metres per frame at `hz`): mean and p95 speed of planted feet in m/s, and the
 * share of planted frames sliding faster than `bad` m/s. */
export function slideSummary(samples,hz=60,bad=0.6){
 const v=samples.filter(x=>x>=0).map(x=>x*hz).sort((a,b)=>a-b),n=v.length;
 if(!n)return {n:0,mean:0,p95:0,badPct:0};
 return {n,mean:+(v.reduce((a,b)=>a+b,0)/n).toFixed(3),p95:+v[Math.min(n-1,Math.floor(n*0.95))].toFixed(3),badPct:+(100*v.filter(x=>x>bad).length/n).toFixed(1)};
}

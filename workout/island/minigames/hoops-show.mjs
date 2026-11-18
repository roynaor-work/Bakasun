/** Island Pro Basketball, presentation M4 ("hoopsShow", 11/11/2026): the rules behind the automatic instant replay,
 * its two-angle cut, the crowd reactions, the celebration casting and the broadcast camera helpers. Pure functions:
 * the view owns the camera and the clock, the session owns the DOM, the engine is never touched. `?hoopsShow=0`
 * restores the previous presentation (manual replay button, scorer-only celebration, cheer-only crowd). */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smootherstep=u=>(u=clamp(u,0,1))*u*u*(u*(u*6-15)+10);

export function showEnabled(params){return !params||typeof params.get!=='function'||params.get('hoopsShow')!=='0';}

export const SHOW=Object.freeze({
 // the replay starts this long after the score: the child sees the live celebration first, the inbound (1.3 s) has not begun
 replayDelay:1.2,
 // the cut, in recorded (game) seconds around the contact frame: a low baseline angle, then the slow-motion chase, then the
 // blend back to the live camera. 0.8 s of game time at 0.5x is the 1.6 s slow-motion segment
 cut:Object.freeze({before:2.0,slowBefore:0.4,slowAfter:0.4,after:1.0,slowScale:0.5,skipBlend:0.35}),
 // live camera: a 0.4 s cut to the baseline angle on a made basket, then a 0.35 s blend back; a gentler pan for 0.8 s when the ball changes side
 liveCut:Object.freeze({hold:0.4,blend:0.35}),possessionPan:0.8,leadVelocity:0.35,
 celebrateSeconds:2.2,
 crowd:Object.freeze({standSeconds:3.2,groanSeconds:2.2,waveSeconds:1.3,waveSpan:34}),
});

/** Which made baskets earn an automatic replay. `batch` is every event drained in the same step (the alley-oop event follows
 * its score, the buzzer precedes it), `snapshot` the state after the step. One trigger per score, free throws never. */
export function replayTriggers(batch,snapshot,{userTeam=0}={}){
 const out=[];if(!batch?.length)return out;
 const buzzer=batch.some(e=>e.type==='buzzer'&&e.inAir);
 for(const e of batch){
  if(e.type!=='score'||e.shotType==='ft'||e.playerId==null)continue;
  const base={playerId:e.playerId,team:e.team,shotId:e.shotId??null,home:e.team===userTeam};
  if(e.shotType==='dunk'){out.push({reason:'dunk',...base});continue;}
  if(batch.some(a=>a.type==='alleyoop'&&a.result==='score'&&a.to===e.playerId)){out.push({reason:'alleyoop',...base});continue;}
  if(e.points===3){
   const clock=snapshot?.clock??Infinity,quarter=snapshot?.quarter??1,sc=e.score||snapshot?.score;
   if(buzzer||clock<=0){out.push({reason:'buzzer',...base});continue;}
   // the three that wins: last minute of the fourth quarter or overtime, the team was not ahead, now it is
   if(sc&&quarter>=4&&clock<=60&&sc[e.team]>sc[1-e.team]&&sc[e.team]-3<=sc[1-e.team]){out.push({reason:'winner',...base});continue;}
  }
 }
 return out;
}

/** The recorded frame of the contact: the last frame of the scorer's shot in flight, plus one (the ball goes dead on the make).
 * Falls back to one second before the end when the shot is not in the recording. */
export function contactFrame(frames,trigger,hz=30){
 if(!frames?.length)return 0;
 let last=-1;
 for(let i=frames.length-1;i>=0;i--){const b=frames[i].ball;if(b?.state==='shot'&&(trigger?.shotId==null||b.shotId==null||b.shotId===trigger.shotId)){last=i;break;}}
 if(last<0)return Math.max(0,frames.length-1-Math.round(hz));
 return Math.min(frames.length-1,last+1);
}

/** The two-angle cut as segments over the recording: `from`/`to` in recorded seconds, `scale` the playback rate, `wall` the
 * on-screen seconds of each segment. Clamped to the recording; the chase is centred on the contact. */
export function cutTimeline(contactT,length,cut=SHOW.cut){
 const b0=clamp(contactT-cut.before,0,length),b1=clamp(contactT-cut.slowBefore,b0,length),b2=clamp(contactT+cut.slowAfter,b1,length),b3=clamp(contactT+cut.after,b2,length);
 const segments=[{cam:'baseline',from:b0,to:b1,scale:1},{cam:'chase',from:b1,to:b2,scale:cut.slowScale},{cam:'back',from:b2,to:b3,scale:1}];
 let start=0;for(const s of segments){s.wall=(s.to-s.from)/s.scale;s.wallStart=start;start+=s.wall;}
 return {segments,wall:start,contactT,length};
}

/** Where the replay is after `wall` seconds on screen: the segment, the recorded time `t`, the progress `u` inside the segment. */
export function segmentAt(timeline,wall){
 const segs=timeline.segments;let i=0;while(i<segs.length-1&&wall>=segs[i].wallStart+segs[i].wall)i++;
 const s=segs[i],local=clamp(wall-s.wallStart,0,s.wall),u=s.wall>0?local/s.wall:1;
 return {cam:s.cam,scale:s.scale,t:s.from+local*s.scale,u,index:i,done:wall>=timeline.wall-1e-9};
}

/** A tap skips to the blend back to the live camera (never a hard snap). */
export function skipWall(timeline,wall){const back=timeline.segments[2];return Math.max(wall,back.wallStart);}

/** Low angle beside the attacked basket, on the far side from the scorer so he comes across the frame. */
export function baselineCamera(scorer,side,court,{landscape=true}={}){
 const s=side<0?-1:1,lat=(scorer?.z??0)>=0?-1:1;
 return {pos:[s*(court.rimX+1.9),1.05,lat*4.6],look:[scorer?.x??s*court.rimX,1.35,scorer?.z??0],fov:landscape?42:60};
}
/** Close chase behind and beside the scorer, looking past him at the basket he attacks. */
export function chaseCamera(scorer,side,court,{landscape=true}={}){
 const s=side<0?-1:1,x=scorer?.x??0,z=scorer?.z??0;
 let dx=s*court.rimX-x,dz=-z;const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
 const px=-dz,pz=dx,lat=z>=0?1:-1;
 return {pos:[x-dx*3.3+px*lat*1.3,2.05,z-dz*3.3+pz*lat*1.3],look:[x+dx*0.6,1.45,z+dz*0.6],fov:landscape?38:56};
}
/** Blend weight of a replay segment against the live camera, for the 'back' segment and the skip. */
export const backBlend=u=>smootherstep(u);

/** Crowd reaction to one event, from the home crowd's point of view: a cheer wave on a home score, a groan (sway down) on
 * an away score, standing with arms up on a home dunk, alley-oop, buzzer beater or the final win. Visual only. */
export function crowdReaction(e,{userTeam=0,triggers=[]}={}){
 if(!e)return null;
 if(e.type==='score'&&e.shotType!=='ft'){
  const home=e.team===userTeam;
  if(!home)return {cheer:0,groan:1,stand:0,wave:0};
  const big=triggers.some(t=>t.playerId===e.playerId&&t.reason!=='winner')||e.shotType==='dunk';
  return {cheer:1,groan:0,stand:big?1:0,wave:1};
 }
 if(e.type==='score')return e.team===userTeam?{cheer:0.5,groan:0,stand:0,wave:0}:null;
 if(e.type==='alleyoop'&&e.result==='score'&&e.team===userTeam)return {cheer:1,groan:0,stand:1,wave:0};
 if(e.type==='final')return e.won?{cheer:1,groan:0,stand:1,wave:1}:{cheer:0,groan:1,stand:0,wave:0};
 return null;
}

/** Which crowd sample a score plays: the authored excited layer at home, the calm crowd for the visitors (no bed, same cooldowns). */
export function scoreCrowdSample(e,{show=true,userTeam=0}={}){return show&&e?.team!==userTeam?'calm':'crowd';}

/** The dunked-on defender: the closest opponent to the scorer inside `radius`, else null. */
function nearest(players,from,pick,radius=Infinity){
 let best=null,bd=radius;for(const p of players){if(p.id===from.id||!pick(p))continue;const d=Math.hypot(p.x-from.x,p.z-from.z);if(d<bd){bd=d;best=p;}}return best;
}
const hash=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return h;};

/** Who else reacts to an event (the scorer's own celebration already exists): the nearest teammate with a fist or a point, the
 * defender who got dunked on with 'disappointed', and at the final the losers with hands on hips or 'disappointed'. */
export function castCelebration(e,snapshot,{userTeam=0}={}){
 const out=[];const players=snapshot?.players;if(!players||!e)return out;
 if(e.type==='score'&&e.shotType!=='ft'&&e.playerId!=null){
  const scorer=players.find(p=>p.id===e.playerId);if(!scorer)return out;
  const mate=nearest(players,scorer,p=>p.team===scorer.team);
  if(mate)out.push({playerId:mate.id,clip:hash(mate.id)%2?'celebrate_point':'celebrate_fist'});
  if(e.shotType==='dunk'){const d=nearest(players,scorer,p=>p.team!==scorer.team,3.2);if(d)out.push({playerId:d.id,clip:'disappointed'});}
 }
 if(e.type==='final'){
  const winner=e.won?userTeam:1-userTeam;let k=0;
  for(const p of players)if(p.team!==winner)out.push({playerId:p.id,clip:(k++)%2?'disappointed':'hands_on_hips'});
 }
 return out;
}

/** Soccer v25.0 (24/11/2026): Roy after v24.9 ("תמשיך להרים רמה בכדור רגל וכדור סל / אנחנו רחוקים שם ממש"). Round 2 of the level push, taken
 * from the list the v24.9 report left open against the mobile football games a child plays (FC Mobile, Dream League Soccer, Score! Hero):
 * a defending team that works together, set pieces the child aims, more than two things to do with the ball, and a camera that shows players.
 * `?soccerV250=0` brings back v24.9 exactly; every part also has its own switch:
 *  `?soccerDefence250=0` one presser and zones (default: in the defending half a second man steps out in front of the carrier and holds
 *                        him up while the presser tackles, covering defenders stand goal-side of the attackers in and around the
 *                        box, and runners ahead of the ball are followed).
 *  `?soccerWall250=0`    no wall (default: at a free kick within shooting range the defending side builds a wall 9.15 m from the ball; a
 *                        low shot into it is knocked away).
 *  `?soccerAim250=0`     the free kick and the corner as in v24.9 (default: the stick moves a target, in the goal mouth at a free kick and
 *                        in the box at a corner; the shot button sends the ball there: over the wall with a curl, or a cross to that spot).
 *  `?soccerCurve250=0`   every shot flies straight (default: turn the stick while the shot button is held and the ball curls that way,
 *                        still ending on its target; a curled shot is a little harder for the keeper).
 *  `?soccerTap250=0`     the pitch is not a button (default: a tap on a team-mate passes to him, or selects him in defence; a tap on open
 *                        grass ahead plays the ball into that space for the nearest runner).
 *  `?soccerKeeper250=0`  the rival keeper's v24.9 balance (default: at stages 1 and 2 he reaches further and saves more, see
 *                        SOCCER_V250.keeper; from stage 3 he is as he was).
 *  `?soccerCam250=0`     the v24.9 camera (default: closer, the players about a quarter taller on the screen).
 *  `?soccerSaveReplay250=0` no replay of a save (default: a save pushed round the post is replayed in slow motion while the corner is
 *                        set up; the goal replay and the replay of a shot off the post were already there).
 * Engine rules follow soccer-r249.mjs: on in a page unless switched off, off in node unless an option or `search` asks, so every contract
 * written for the earlier match keeps testing that match. Pure: no three.js and no DOM. */
import {rollBall} from './soccer-physics.mjs?v=island-v2-20261107-23';
const read=(name,search)=>{try{const q=typeof search==='string'?search:globalThis.location?.search;return typeof q==='string'?new URLSearchParams(q).get(name):null;}catch{return null;}};
const hasPage=search=>typeof (typeof search==='string'?search:globalThis.location?.search)==='string';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const master=search=>read('soccerV250',search)!=='0';
const rule=(option,name,search)=>option!==undefined?Boolean(option):hasPage(search)&&master(search)&&read(name,search)!=='0';

export const SOCCER_V250=Object.freeze({
  defence:Object.freeze({
    // the second man: with the carrier inside `doubleDepth` metres of the defending goal line, the defender nearest the point `ahead`
    // metres goal-side of the ball (within `doubleReach` of it) steps out; `blockGap` = how far goal-side he holds when the level has no gap
    doubleDepth:58,doubleReach:14,ahead:4,blockGap:2.4,lead:.35,closeFrom:1.4,
    // marking: with the ball within `markBallDepth` of the goal line, attackers inside `boxDepth` x (penalty width / 2 + `boxSide`) are
    // marked from `markGap` goal-side and `ballSide` toward the ball, by a defender within `markReach`
    markBallDepth:44,boxDepth:22,boxSide:5,markGap:1.15,ballSide:.55,markReach:16,
    // shadowing: an attacker at least `shadowAhead` nearer the goal than the ball is followed from `shadowGap` goal-side
    shadowAhead:3,shadowGap:2.4,shadowReach:11,shadowBlend:.7,
    // a defender keeps the man he has unless another is this much nearer (no swapping every tick)
    sticky:2.5,
    // by stage for the rival (the child's team always defends at `home`): whether a second man steps out and how far goal-side of the ball
    // he holds (`gap`: he shadows the carrier and blocks the shot rather than diving in), how fast he closes, how many markers and shadows.
    // `zonal`: markers and shadows are taken only from the men the tactics hold in a covering zone, never from a passing lane or a man
    // already marking (measured: pulling those out opened the middle and the child scored more).
    rival:Object.freeze([null,
      Object.freeze({double:true,gap:2.8,close:1.06,markers:2,shadows:1,zonal:true}),
      Object.freeze({double:true,gap:2.6,close:1.1,markers:2,shadows:1,zonal:true}),
      Object.freeze({double:true,gap:2.4,close:1.15,markers:3,shadows:2,zonal:true}),
      Object.freeze({double:true,gap:2.2,close:1.2,markers:3,shadows:2,zonal:true})]),
    home:Object.freeze({double:true,gap:2.4,close:1.1,markers:3,shadows:2,zonal:true}),
  }),
  // the wall: free kicks from `minRange` to `maxRange` metres of the goal centre and at most `maxSide` from the middle of the pitch
  wall:Object.freeze({minRange:12,maxRange:31,maxSide:24,space:9.4,gap:.62,near:.3,members:Object.freeze([[19,4],[26,3],[99,2]]),
    radius:.95,height:1.85,minSpeed:7,keep:.32,pop:2.4,seconds:1.4,
    // the men run to the wall (`hurry` times their speed) and the kick waits for them at most `waitSeconds`
    hurry:1.45,waitSeconds:6.5}),
  // the aimed free kick: the target moves along the goal line at `speed` m/s with the stick, the ball arrives `low`..`high` metres up by the
  // power, curls at `curve` rad/s toward the target, and the keeper's save chance drops by `keeperPenalty`
  aim:Object.freeze({speed:5.2,postInset:.42,low:.55,high:2.05,start:.3,curve:1.15,keeperPenalty:.07,maxRange:33,clear:.3,underBar:.3,
    // the aimed corner: the target moves inside the penalty area at `cornerSpeed` m/s, `cornerInset` off its lines; it starts `cornerDepth`
    // metres from the goal line, toward the far post
    cornerSpeed:9,cornerInset:1.2,cornerDepth:7.5}),
  // the curled shot: the stick turned at least `minDegrees` from where it pointed when the charge began (full curl at `fullDegrees`)
  curve:Object.freeze({minDegrees:24,fullDegrees:70,rate:Object.freeze([.85,1.6]),keeperPenalty:.08,minCharge:.12}),
  // taps on the pitch: a team-mate within `pixels` of the finger; a ground pass up to `groundRange` metres with `lane` metres clear of
  // every rival, otherwise a high ball; open grass `spaceMin`..`spaceMax` metres from the ball, not more than 4 m behind it, that a
  // team-mate reaches within `runnerSeconds`; a tap is at most `maxMs` long and `maxMove` pixels of travel
  tap:Object.freeze({pixels:46,groundRange:24,lane:1.25,spaceMin:6,spaceMax:38,runnerSeconds:3.2,maxMs:260,maxMove:14,forwardOnly:-4}),
  // the rival keeper's save bonus in the full match (v24.9: 0.2 at every stage)
  // `early`: on top of it at stages 1 and 2, and `reach`: metres added there to how far from his body he gets to a shot (the stage rows
  // give him 0.79 m at stage 1 and 0.88 m at stage 2, so most shots never reached him). Measured with tools/soccer-v250-sim.mjs: the
  // child proxy scored 6.4 a match at stage 2 in v24.9. From stage 3 the team defence above does the work and he is v24.9's keeper.
  keeper:Object.freeze({rivalKeeperSave:.2,early:Object.freeze([.2,.2]),reach:Object.freeze([.55,.55])}),
  camera:Object.freeze({base:19.2,near:15.4,far:31,edgeX:6.2,ahead:5,boxZoom:2.6,speedZoom:6,portraitBase:33,portraitFar:47,
    // the child's aimed corner: the camera looks `share` of the way from the flag to the target, `zoom` metres further back
    cornerAim:Object.freeze({share:.55,zoom:4})}),
});

/** Engine rules. `options`: true / false for all, or {defence, wall, aim, curve, tap, keeper}; undefined = by the page's URL (off in node). */
export function soccerV250Rules(options,search){
  const all=options===true?true:options===false?false:undefined,o=options&&typeof options==='object'?options:{};
  const pick=(key,name)=>rule(all??o[key],name,search);
  return {defence:pick('defence','soccerDefence250'),wall:pick('wall','soccerWall250'),aim:pick('aim','soccerAim250'),curve:pick('curve','soccerCurve250'),tap:pick('tap','soccerTap250'),keeper:pick('keeper','soccerKeeper250')};
}
/** View and session switches: a page only. */
export const soccerCam250Enabled=search=>hasPage(search)&&master(search)&&read('soccerCam250',search)!=='0';
export const soccerTap250Enabled=search=>hasPage(search)&&master(search)&&read('soccerTap250',search)!=='0';
export const soccerSaveReplay250Enabled=search=>hasPage(search)&&master(search)&&read('soccerSaveReplay250',search)!=='0';
export const soccerAim250Enabled=search=>hasPage(search)&&master(search)&&read('soccerAim250',search)!=='0';

/** The session's config for the v25.0 view: the full match's camera closer still (the small match keeps its camera), and the replay of a
 * parried save switched on in the show's config. */
export function applySoccerV250View(config,{enabled=soccerCam250Enabled(),saveReplay=soccerSaveReplay250Enabled()}={}){
  if(saveReplay&&!config.show?.short?.parry)config={...config,show:{...config.show,short:{...config.show?.short,parry:true}}};
  if(!enabled||config.v250View||!config.full?.camera)return config;
  const C=SOCCER_V250.camera,camera={...config.full.camera,base:C.base,near:C.near,far:C.far,edgeX:C.edgeX,ahead:C.ahead,boxZoom:C.boxZoom,speedZoom:C.speedZoom,portraitBase:C.portraitBase,portraitFar:C.portraitFar,cornerAim:C.cornerAim};
  return {...config,v250View:true,full:{...config.full,camera},view:{...config.view,camera:{...config.view.camera,nearDistance:C.base,portraitNearDistance:C.portraitBase}}};
}

// ---- team defence ---------------------------------------------------------------------------------------------------------------------
/** What the defending side does at this stage: the rival grows into it (stage 1 is the tutorial: null), the child's team always has it. */
export function soccerDefenceLevel(team,stage,D=SOCCER_V250.defence){
  if(team===0)return D.home;
  return D.rival[clamp(Math.round(stage)||1,1,D.rival.length)-1]||null;
}
/** The defending side's jobs for one tick: {[playerId]: {x, z, duty: 'double' | 'mark' | 'shadow', mark?: rivalId}}, or null when the side
 * does not defend (no rival carrier, a keeper holds the ball, or the level is null). `dir` = the defending side's attacking direction, so
 * its own goal line is at -dir * length / 2. `exclude` = a player who takes no job (the child's selected player). The nearest player of the
 * side to the ball is the presser and gets no job here: the tactics already send him. */
export function soccerDefencePlan(team,state,config,{dir,level,exclude=-1}={},D=SOCCER_V250.defence){
  const b=state.ball,owner=b.owner===null||b.owner===undefined?null:state.players[b.owner];
  if(!level||!owner||owner.team===team||owner.hands)return null;
  const hx=config.pitch.length/2,goal={x:-dir*hx,z:0},depth=q=>q.x*dir+hx,side=config.pitch.penaltyWidth/2+D.boxSide;
  const mine=[],rivals=[];
  for(const q of state.players){if(q.role==='keeper')continue;if(q.team===team)mine.push(q);else if(q.id!==owner.id)rivals.push(q);}
  let presser=null,gap=Infinity;for(const q of mine){const m=dist(q,b);if(m<gap){gap=m;presser=q;}}
  const used=new Set(presser?[presser.id]:[]),free=q=>!used.has(q.id)&&q.id!==exclude&&!(q.recover>0)&&!(q.slideTime>0),zonal=q=>!level.zonal||q.base250===undefined||q.base250==='cover';
  const out={};let jobs=0;
  const toward=(from,to,length)=>{const dx=to.x-from.x,dz=to.z-from.z,l=Math.hypot(dx,dz)||1;return {x:dx/l*length,z:dz/l*length};};
  const nearest=(point,reach,man)=>{let best=null,cost=Infinity;for(const q of mine){if(!free(q)||man!==-2&&!zonal(q))continue;const m=dist(q,point)-(q.mark250===man?D.sticky:0);if(m<cost&&dist(q,point)<=reach){cost=m;best=q;}}return best;};
  // 1. the second man: goal-side of the ball when the presser is not, otherwise where the carrier is heading
  if(level.double&&presser&&depth(owner)<D.doubleDepth){
    // the man best placed in the carrier's way (measured from `ahead` metres goal-side of the ball) steps out to meet him: he runs to a
    // body's width goal-side of where the ball will be in `lead` seconds, so the carrier has the presser on him and this man in front
    const g=toward(b,goal,1),front={x:b.x+g.x*D.ahead,z:b.z+g.z*D.ahead},second=nearest(front,D.doubleReach,-2);
    const gap=level.gap??D.blockGap;if(second){out[second.id]={x:b.x+(owner.vx||0)*D.lead+g.x*gap,z:b.z+(owner.vz||0)*D.lead+g.z*gap,duty:'double',mark:-2};used.add(second.id);jobs++;}
  }
  // 2. the box: the attackers nearest the goal first
  const marked=new Set();
  if(level.markers>0&&depth(b)<D.markBallDepth){
    const threats=rivals.filter(q=>depth(q)<D.boxDepth&&Math.abs(q.z)<side).sort((u,v)=>depth(u)-depth(v)||Math.abs(u.z)-Math.abs(v.z)||u.id-v.id).slice(0,level.markers);
    for(const q of threats){
      const g=toward(q,goal,D.markGap),s=toward(q,b,D.ballSide),point={x:q.x+g.x+s.x,z:q.z+g.z+s.z},marker=nearest(point,D.markReach,q.id);
      if(marker){out[marker.id]={x:point.x,z:point.z,duty:'mark',mark:q.id};used.add(marker.id);marked.add(q.id);jobs++;}
    }
  }
  // 3. the runners ahead of the ball
  if(level.shadows>0){
    const line=depth(owner)-D.shadowAhead,runners=rivals.filter(q=>!marked.has(q.id)&&depth(q)<line).sort((u,v)=>depth(u)-depth(v)||u.id-v.id).slice(0,level.shadows);
    for(const q of runners){
      const g=toward(q,goal,D.shadowGap),s=toward(q,b,D.ballSide),point={x:q.x+g.x+s.x,z:q.z+g.z+s.z},shadow=nearest(point,D.shadowReach,q.id);
      if(shadow){out[shadow.id]={x:point.x,z:point.z,duty:'shadow',mark:q.id,blend:D.shadowBlend};used.add(shadow.id);jobs++;}
    }
  }
  return jobs?out:null;
}

// ---- the wall -------------------------------------------------------------------------------------------------------------------------
/** The wall at a free kick: [{id, x, z}] for the defending side's nearest outfield players, or null when the kick is not in shooting range.
 * `dir` = the kicking side's attacking direction. The wall stands `space` metres from the ball on the line to the goal, a little toward
 * the near post, side by side across that line. */
export function soccerWall(r,state,config,dir,W=SOCCER_V250.wall){
  if(!r||r.type!=='freeKick')return null;
  const hx=config.pitch.length/2,goal={x:dir*hx,z:0},range=dist(r,goal);
  if(range<W.minRange||range>W.maxRange||Math.abs(r.z)>W.maxSide)return null;
  const count=W.members.find(([limit])=>range<=limit)?.[1]??2,ux=(goal.x-r.x)/range,uz=(goal.z-r.z)/range,px=-uz,pz=ux;
  // never on the goal line: a wall for a kick from the edge of the area stands at least 2.2 m off it
  const off=Math.min(W.space,Math.max(3,range-2.2)),near=Math.sign(r.z)||1,shift=(pz*near>0?1:-1)*W.near;
  const cx=r.x+ux*off+px*shift,cz=r.z+uz*off+pz*shift;
  const pool=state.players.filter(p=>p.team!==r.team&&p.role!=='keeper'&&!(p.fouledTime>0)).sort((a,b)=>dist(a,{x:cx,z:cz})-dist(b,{x:cx,z:cz})||a.id-b.id).slice(0,count);
  if(pool.length<2)return null;
  // the men keep their order across the line, so nobody crosses a neighbour on the way
  pool.sort((a,b)=>((a.x-cx)*px+(a.z-cz)*pz)-((b.x-cx)*px+(b.z-cz)*pz)||a.id-b.id);
  return pool.map((p,i)=>{const k=(i-(pool.length-1)/2)*W.gap;return {id:p.id,x:cx+px*k,z:cz+pz*k};});
}
/** A ball driven into a man of the wall: its new velocity (knocked back and aside), or null when it misses him, is too high or too slow.
 * `roll` in [0,1) picks the side. */
export function soccerWallBlock(p,ball,roll=.5,W=SOCCER_V250.wall){
  const speed=Math.hypot(ball.vx||0,ball.vz||0);
  if(speed<W.minSpeed||ball.y>W.height||dist(p,ball)>W.radius)return null;
  const nx=-ball.vx/speed,nz=-ball.vz/speed,side=(roll<.5?-1:1)*(.25+.5*Math.abs(roll-.5)*2),back=speed*W.keep;
  return {vx:(nx+(-nz)*side)*back,vz:(nz+nx*side)*back,vy:W.pop};
}

// ---- curl -----------------------------------------------------------------------------------------------------------------------------
/** The launch that makes a curling ball arrive at `target` ({x, z}, and at `height` when given): {vx, vz, vy, curve, seconds}. The flight is
 * the match's own ball step (rollBall), so what is solved here is what the ball then does. `curve` in rad/s (its sign is the bend). */
export function soccerCurvedLaunch(from,target,speed,curve,config,{vy=0,height=null}={}){
  const dx=target.x-from.x,dz=target.z-from.z,L=Math.hypot(dx,dz)||1,ux=dx/L,uz=dz/L,step=config.match?.fixedStep||1/60,r=config.physics.ballRadius;
  // first guess for the lift: a drag-free flight of the chord at this speed
  const t0=L/Math.max(1,speed)*1.12,g=config.ball?.gravity??12;
  let angle=0,lift=height===null?vy:(height-(from.y??r)+.5*g*t0*t0)/t0,seconds=0;
  for(let pass=0;pass<12;pass++){
    const c=Math.cos(angle),s=Math.sin(angle),b={x:0,z:0,y:Math.max(r,from.y??r),vx:(ux*c-uz*s)*speed,vz:(ux*s+uz*c)*speed,vy:lift,curve};
    let along=0,across=0,t=0,py=b.y,pa=0,pc=0;
    while(t<5){pa=along;pc=across;py=b.y;rollBall(b,step,config);t+=step;along=b.x*ux+b.z*uz;across=-b.x*uz+b.z*ux;if(along>=L||Math.hypot(b.vx,b.vz)<.5)break;}
    const u=along>pa?clamp((L-pa)/(along-pa),0,1):1,miss=pc+(across-pc)*u,arrive=py+(b.y-py)*u;seconds=t-step*(1-u);
    if(along<L){seconds=t;break;}
    angle-=Math.atan2(miss,L);
    if(height!==null)lift+=(height-arrive)/Math.max(.2,seconds);
    if(Math.abs(miss)<.03&&(height===null||Math.abs(height-arrive)<.04))break;
  }
  const c=Math.cos(angle),s=Math.sin(angle);
  return {vx:(ux*c-uz*s)*speed,vz:(ux*s+uz*c)*speed,vy:lift,curve,seconds};
}
/** The curl the child asked for: `from` = the stick's direction when the charge began, `now` = at release (both {x, z}, null = idle).
 * Returns 0 or a signed rate in rad/s: the ball bends toward the side the stick was turned to. */
export function soccerCurveIntent(from,now,charge=1,C=SOCCER_V250.curve){
  if(!from||!now||charge<C.minCharge)return 0;
  const a=Math.atan2(from.z,from.x),b=Math.atan2(now.z,now.x),turn=Math.atan2(Math.sin(b-a),Math.cos(b-a)),deg=Math.abs(turn)*180/Math.PI;
  if(deg<C.minDegrees)return 0;
  return Math.sign(turn)*(C.rate[0]+(C.rate[1]-C.rate[0])*clamp((deg-C.minDegrees)/(C.fullDegrees-C.minDegrees),0,1));
}

// ---- the aimed free kick and corner ---------------------------------------------------------------------------------------------------
/** Is this free kick one the child aims at goal (and the rival defends with a wall)? */
export function soccerFreeKickAimed(r,config,dir,A=SOCCER_V250.aim){
  if(!r||r.type!=='freeKick')return false;
  return dist(r,{x:dir*config.pitch.length/2,z:0})<=A.maxRange;
}
/** The target a set piece starts with: at a free kick a point on the goal line toward the far post, at a corner a spot in front of goal. */
export function soccerAimStart(r,config,dir,A=SOCCER_V250.aim){
  const hx=config.pitch.length/2,far=-(Math.sign(r.z)||1);
  if(r.type==='corner')return {x:dir*(hx-A.cornerDepth),z:far*config.pitch.goalWidth*.2};
  return {x:dir*hx,z:far*config.pitch.goalWidth*A.start};
}
/** Moves the target with the stick ({x, z} in pitch axes, each -1..1). Free kick: along the goal line between the posts. Corner: inside the
 * penalty area. Returns the same object. */
export function soccerAimMove(aim,r,mx,mz,dt,config,dir,A=SOCCER_V250.aim){
  const hx=config.pitch.length/2;
  if(r.type==='corner'){
    const P=config.pitch,x0=hx-P.penaltyDepth+A.cornerInset,x1=hx-A.cornerInset*1.6,z1=P.penaltyWidth/2-A.cornerInset;
    aim.x=dir*clamp(aim.x*dir+mx*dir*A.cornerSpeed*dt,x0,x1);aim.z=clamp(aim.z+mz*A.cornerSpeed*dt,-z1,z1);return aim;
  }
  const z1=config.pitch.goalWidth/2-A.postInset;aim.x=dir*hx;aim.z=clamp(aim.z+mz*A.speed*dt,-z1,z1);return aim;
}
/** The aimed free kick's launch: over the wall, curling toward the target, arriving `low`..`high` metres up by the power. Where a wall
 * stands (the same ranges as soccerWall) the ball must pass it at least `clear` above the men's heads: the arrival height is raised first
 * (never above the bar), then the pace taken off, until it does. Returns the launch plus the `speed` and `height` it settled on. */
export function soccerFreeKickLaunch(r,aim,power,speed,config,A=SOCCER_V250.aim,W=SOCCER_V250.wall){
  const from={x:r.x,z:r.z,y:config.physics.ballRadius},goalX=Math.sign(aim.x)*config.pitch.length/2,range=Math.hypot(goalX-r.x,r.z);
  // the bend takes the ball outside the straight line and back: away from the middle of the wall, into the target
  // (a positive rate turns the ball from +x toward +z; a target on that side of the line to the goal centre needs the opposite turn)
  const gx=goalX-r.x,gz=-r.z,cross=gx*(aim.z-r.z)-gz*(aim.x-r.x),curve=(cross>=0?-1:1)*A.curve;
  const walled=range>=W.minRange&&range<=W.maxRange&&Math.abs(r.z)<=W.maxSide,top=(config.pitch.goalHeight||2.44)-A.underBar,step=config.match?.fixedStep||1/60;
  let height=A.low+(A.high-A.low)*clamp(power,0,1),pace=speed,launch=null;
  for(let attempt=0;attempt<9;attempt++){
    launch=soccerCurvedLaunch(from,aim,pace,curve,config,{vy:5,height});
    if(!walled)break;
    // the lowest the ball is while it passes the wall's depth (the men stand `space` away, a body deep)
    const b={x:from.x,z:from.z,y:from.y,vx:launch.vx,vz:launch.vz,vy:launch.vy,curve:launch.curve};let lowest=Infinity;
    for(let t=0;t<launch.seconds;t+=step){rollBall(b,step,config);const m=Math.hypot(b.x-r.x,b.z-r.z);if(m>W.space+W.radius)break;if(m>=W.space-W.radius-.2)lowest=Math.min(lowest,b.y);}
    if(lowest>=W.height+A.clear)break;
    if(height<top-1e-6)height=Math.min(top,height+.3);else pace*=.93;
  }
  return {...launch,speed:pace,height};
}
/** Points along a launch for the view's dotted guide: `count` points [{x, y, z}] evenly spaced in time from the kick to its arrival. */
export function soccerFlightPath(from,launch,config,count=14){
  const step=config.match?.fixedStep||1/60,r=config.physics.ballRadius,b={x:from.x,z:from.z,y:Math.max(r,from.y??r),vx:launch.vx,vz:launch.vz,vy:launch.vy,curve:launch.curve||0};
  const total=Math.max(step,launch.seconds||1),steps=Math.ceil(total/step-1e-9),track=[{x:b.x,y:b.y,z:b.z}],points=[];
  for(let i=0;i<steps;i++){rollBall(b,step,config);track.push({x:b.x,y:b.y,z:b.z});}
  for(let i=0;i<count;i++){const at=Math.min(steps,i/(count-1)*total/step),k=Math.min(steps-1,Math.floor(at)),u=at-k,p=track[k],q=track[k+1];points.push({x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u,z:p.z+(q.z-p.z)*u});}
  return points;
}
/** What the view draws for the child's aimed set piece: {points: [{x, y, z}], target: {x, y, z}, flat} or null. At a free kick the flight
 * the shot button would send now (the power so far, a middling one before the press) and the target in the goal mouth; at a corner an arc
 * to the target on the grass. `out` is reused between frames. */
export function soccerAimGuide(state,config,out={points:[],target:{x:0,y:0,z:0},flat:false},A=SOCCER_V250.aim){
  const r=state.restart;if(!r?.aim250||r.team!==0||!String(state.phase).startsWith('restart'))return null;
  const aim=r.aim250,ph=config.physics;
  if(r.type==='corner'){
    const n=12,apex=4.4;out.points.length=n;
    for(let i=0;i<n;i++){const u=i/(n-1),q=out.points[i]||(out.points[i]={x:0,y:0,z:0});q.x=r.x+(aim.x-r.x)*u;q.z=r.z+(aim.z-r.z)*u;q.y=ph.ballRadius+4*apex*u*(1-u);}
    out.target.x=aim.x;out.target.y=.06;out.target.z=aim.z;out.flat=true;return out;
  }
  const power=state.charging&&state.chargeKind==='shot'?clamp(state.charge/ph.chargeSeconds,0,1):.45,launch=soccerFreeKickLaunch(r,aim,power,ph.shotSpeed+power*ph.shotBoost,config,A);
  out.points=soccerFlightPath({x:r.x,z:r.z},launch,config,14);
  out.target.x=aim.x;out.target.y=launch.height;out.target.z=aim.z;out.flat=false;return out;
}

// ---- taps on the pitch ----------------------------------------------------------------------------------------------------------------
const laneClear=(from,to,rivals)=>{let clear=Infinity;const dx=to.x-from.x,dz=to.z-from.z,l2=dx*dx+dz*dz||1;for(const o of rivals){const u=((o.x-from.x)*dx+(o.z-from.z)*dz)/l2;if(u<.08||u>1)continue;clear=Math.min(clear,Math.hypot(o.x-(from.x+u*dx),o.z-(from.z+u*dz)));}return clear;};
/** A tap on a team-mate while the child's player has the ball: the pass to play. {mate, x, z, loft, power, through} or null.
 * A ground pass when he is within range with a clear lane (ahead of his run when he runs toward goal), otherwise a high ball. */
export function soccerTapPass(carrier,mate,state,config,dir,T=SOCCER_V250.tap){
  if(!mate||mate.id===carrier.id||mate.team!==carrier.team||mate.role==='keeper'||mate.recover>0)return null;
  const b=state.ball,rivals=state.players.filter(o=>o.team!==carrier.team&&o.role!=='keeper'&&!(o.recover>0)),range=dist(mate,b);
  if(range<1.2)return null;
  const P=config.passing,lead=config.ai?.passLeadSeconds??.3,running=(mate.vx||0)*dir>(P.throughSpeed||3.5);
  const ahead=running?P.throughLeadSeconds||.75:lead,hx=config.pitch.length/2,hz=config.pitch.width/2;
  const point={x:clamp(mate.x+(mate.vx||0)*ahead,-hx+1,hx-1),z:clamp(mate.z+(mate.vz||0)*ahead,-hz+1,hz-1)};
  if(range<=T.groundRange&&laneClear(b,point,rivals)>=T.lane)return {mate:mate.id,x:point.x,z:point.z,loft:false,power:0,through:running&&dist(point,b)>=4};
  const flight=1.1,land={x:clamp(mate.x+(mate.vx||0)*flight*.5,-hx+1.5,hx-1.5),z:clamp(mate.z+(mate.vz||0)*flight*.5,-hz+1.5,hz-1.5)};
  return {mate:mate.id,x:land.x,z:land.z,loft:true,power:clamp((dist(land,b)-P.minDistance)/Math.max(1,P.maxDistance-P.minDistance),.36,1),through:false};
}
/** A tap on open grass: the ball into that space for the team-mate who gets there first. `force` (a corner) skips the range and direction
 * limits and always plays a high ball. {mate, x, z, loft, power, through: true} or null. */
export function soccerTapSpace(carrier,point,state,config,dir,{force=false,speed=7}={},T=SOCCER_V250.tap){
  const b=state.ball,hx=config.pitch.length/2,hz=config.pitch.width/2,P=config.passing;
  const target={x:clamp(point.x,-hx+1.2,hx-1.2),z:clamp(point.z,-hz+1.2,hz-1.2)},range=dist(target,b);
  if(!force&&(range<T.spaceMin||range>T.spaceMax||(target.x-b.x)*dir<T.forwardOnly))return null;
  // never into the keeper's hands
  if(!force&&target.x*dir>hx-config.pitch.goalAreaDepth-.5)target.x=dir*(hx-config.pitch.goalAreaDepth-.5);
  let runner=null,best=Infinity;
  for(const q of state.players){
    if(q.team!==carrier.team||q.id===carrier.id||q.role==='keeper'||q.recover>0)continue;
    // where he will be in half a second counts: a runner already going there beats a nearer man standing still
    const t=Math.hypot(target.x-(q.x+(q.vx||0)*.5),target.z-(q.z+(q.vz||0)*.5))/speed;if(t<best){best=t;runner=q;}
  }
  if(!runner||!force&&best>T.runnerSeconds)return null;
  const rivals=state.players.filter(o=>o.team!==carrier.team&&o.role!=='keeper'&&!(o.recover>0));
  const loft=force||range>T.groundRange||laneClear(b,target,rivals)<T.lane;
  return {mate:runner.id,x:target.x,z:target.z,loft,power:loft?clamp((range-P.minDistance)/Math.max(1,P.maxDistance-P.minDistance),force?.4:.36,1):0,through:true,space:true};
}
/** Which team-mate a tap means: `shown` = [{id, x, y}] screen positions (pixels) of the child's outfield players, `at` = the tap. The nearest
 * within `pixels`, or null. */
export function soccerTapMate(shown,at,T=SOCCER_V250.tap){
  let best=null,cost=T.pixels;for(const p of shown){const m=Math.hypot(p.x-at.x,p.y-at.y);if(m<=cost){cost=m;best=p.id;}}return best;
}
/** Is this pointer gesture a tap: short and still. */
export function soccerIsTap(ms,movedPixels,T=SOCCER_V250.tap){return ms<=T.maxMs&&movedPixels<=T.maxMove;}

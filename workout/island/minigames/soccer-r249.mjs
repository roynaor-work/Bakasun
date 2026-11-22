/** Soccer v24.9 (22/11/2026): Roy after v24.8 ("תמשיך להרים רמה בכדור רגל וכדור סל / אנחנו רחוקים שם ממש"). A quality round measured against
 * mobile football games a child plays (FC Mobile, Dream League Soccer, Score! Hero, web games): the press of a button must do something on
 * the pitch, the ball must stick to the child's player the way it does there, the keeper must make saves that are not always a catch, and the
 * screen must show the player and the ball, not text. `?soccerV249=0` brings back v24.8 exactly; every part also has its own switch:
 *  `?soccerLunge=0`    a tackle pressed a step too early does nothing (default: the player lunges at the carrier for a moment and tackles
 *                      when he gets there, like the press-and-tackle of the references).
 *  `?soccerMagnet=0`   no pull to a loose ball (default: a stick pushed roughly at a loose ball bends to where the ball will be, and the
 *                      selected player's first touch reaches a little further).
 *  `?soccerParry=0`    every save is a catch (default: a hard or wide shot is pushed away: round the post for a corner, or back into play).
 *  `?soccerGo=0`       the passer walks back to his zone (default: he keeps running forward for a moment after his pass: a one-two).
 *  `?soccerKeeper249=0` the child's keeper as in v24.8 (default: he saves more of the shots a stronger rival now takes; see SOCCER_V249.rival).
 *  `?soccerCam249=0`   the v24.8 camera, ball and markers (default: closer camera that shows the goal beside the buttons, larger ball,
 *                      a bright arrow and ring on the selected player).
 *  `?soccerLook=0`     the players' bodies as in v24.8 (default: the look fixes of soccer-look249.mjs).
 *  `?soccerHud249=0`   the v24.8 texts (default: no text pill for ordinary touches, the stage card steps aside after kickoff).
 * Engine rules follow soccer-r241.mjs: on in a page unless switched off, off in node unless an option or `search` asks, so every contract
 * written for the earlier match keeps testing that match. Pure: no three.js and no DOM. */
const read=(name,search)=>{try{const q=typeof search==='string'?search:globalThis.location?.search;return typeof q==='string'?new URLSearchParams(q).get(name):null;}catch{return null;}};
const hasPage=search=>typeof (typeof search==='string'?search:globalThis.location?.search)==='string';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const master=search=>read('soccerV249',search)!=='0';
const rule=(option,name,search)=>option!==undefined?Boolean(option):hasPage(search)&&master(search)&&read(name,search)!=='0';

export const SOCCER_V249=Object.freeze({
  // a tackle pressed up to `range` metres from the ball: `seconds` of a run at the ball at `boost` times the speed; tackles on arrival
  lunge:Object.freeze({range:2.8,seconds:.42,boost:1.32,lead:.12,missCooldown:.3}),
  // loose ball inside `range`, stick within `coneDegrees` of it: the direction bends by up to `blend` toward the ball `lookSeconds` ahead
  magnet:Object.freeze({range:4.2,coneDegrees:60,blend:.78,lookSeconds:.2,maxHeight:.9,pickupBonus:.2}),
  // a saved shot at `minSpeed` m/s or faster is parried with a chance from `chance[0]` (at the keeper) to `chance[1]` (at full stretch)
  parry:Object.freeze({minSpeed:12.5,chance:Object.freeze([.22,.8]),cornerShare:.55,speed:10.5,reboundSpeed:7,lift:2.6,wide:Object.freeze([1.1,3.2]),cooldown:.6}),
  // the passer's run after his pass (team 0 only, while the team keeps the ball)
  go:Object.freeze({seconds:1.8,advance:10,centre:.25,goalInset:9}),
  // full match only: the rival may shoot a little earlier and more often, the child's keeper saves more (the chances stay level, see the test)
  rival:Object.freeze({shotIntervalScale:.7,shootRangeBonus:2,keeperSave:.16,rivalKeeperSave:.2}),
  camera:Object.freeze({base:23.6,near:18.6,far:35,edgeX:7.5,ahead:4.4,boxZoom:3,portraitBase:36,portraitFar:50}),
  view:Object.freeze({ballScale:1.4,arrowScale:2.1,arrowColor:'#ffe14a',arrowHeight:2.55,ringScale:1.28}),
  hud:Object.freeze({fixtureSeconds:6,quiet:Object.freeze(['pass','loft','shot','header','received','switch','steal'])}),
});

/** Engine rules. `options`: true / false for all, or {lunge, magnet, parry, go, keeper}; undefined = by the page's URL (off in node). */
export function soccerV249Rules(options,search){
  const all=options===true?true:options===false?false:undefined,o=options&&typeof options==='object'?options:{};
  const pick=(key,name)=>rule(all??o[key],name,search);
  return {lunge:pick('lunge','soccerLunge'),magnet:pick('magnet','soccerMagnet'),parry:pick('parry','soccerParry'),go:pick('go','soccerGo'),keeper:pick('keeper','soccerKeeper249')};
}
/** View switches (camera, ball and markers; texts): a page only. */
export const soccerCam249Enabled=search=>hasPage(search)&&master(search)&&read('soccerCam249',search)!=='0';
export const soccerHud249Enabled=search=>hasPage(search)&&master(search)&&read('soccerHud249',search)!=='0';
/** The players' look (soccer-look249.mjs): `?soccerLook=0` = the v24.8 bodies as they were. */
export const soccerLook249Enabled=search=>hasPage(search)&&master(search)&&read('soccerLook',search)!=='0';

/** The session's config for the v24.9 view: the full match's camera closer and nearer the goal line, and what the view draws larger.
 * The small match (`?soccerFull=0`) keeps its camera and takes only the markers. */
export function applySoccerV249View(config,{enabled=soccerCam249Enabled(),look=soccerLook249Enabled()}={}){
  if(look&&!config.v249Look)config={...config,v249Look:true};
  if(!enabled||config.v249View)return config;
  const C=SOCCER_V249.camera,next={...config,v249View:SOCCER_V249.view};
  if(!config.full?.camera)return next;
  const camera={...config.full.camera,base:C.base,near:C.near,far:C.far,edgeX:C.edgeX,ahead:C.ahead,boxZoom:C.boxZoom,portraitBase:C.portraitBase,portraitFar:C.portraitFar};
  return {...next,full:{...config.full,camera},view:{...config.view,camera:{...config.view.camera,nearDistance:C.base,portraitNearDistance:C.portraitBase}}};
}

/** Where the lunging tackler runs: the ball a moment ahead (the carrier's speed carries it). */
export function soccerLungeTarget(ball,owner,L=SOCCER_V249.lunge){return {x:ball.x+(owner?.vx||0)*L.lead,z:ball.z+(owner?.vz||0)*L.lead};}
/** May a tackle pressed now become a lunge: a rival on the ground has the ball, further than the tackle reaches and inside the lunge range. */
export function soccerLungeAllowed(p,ball,owner,reach,pickupHeight=1.25,L=SOCCER_V249.lunge){
  if(!owner||owner.team===p.team||owner.hands||ball.y>pickupHeight)return false;
  const m=Math.hypot(ball.x-p.x,ball.z-p.z);return m>reach&&m<=L.range;
}

/** The stick bent toward a loose ball: {x, z} with the stick's own length, or null (no loose ball near, or the child steers elsewhere). */
export function soccerMagnetSteer(p,ball,mx,mz,M=SOCCER_V249.magnet){
  const length=Math.hypot(mx,mz);
  if(!(length>.05)||ball.owner!==null&&ball.owner!==undefined||ball.y>M.maxHeight)return null;
  const tx=ball.x+(ball.vx||0)*M.lookSeconds,tz=ball.z+(ball.vz||0)*M.lookSeconds,dx=tx-p.x,dz=tz-p.z,gap=Math.hypot(dx,dz);
  if(gap>M.range||gap<.15)return null;
  const cosine=(mx*dx+mz*dz)/(length*gap);if(cosine<Math.cos(M.coneDegrees*Math.PI/180))return null;
  // strongest near the ball, where a few degrees decide whether the foot meets it
  const w=M.blend*(1-.45*gap/M.range),x=mx/length*(1-w)+dx/gap*w,z=mz/length*(1-w)+dz/gap*w,n=Math.hypot(x,z)||1;
  return {x:x/n*length,z:z/n*length};
}

/** A save that is pushed away instead of caught. `stretch` 0 (at the keeper's body) to 1 (at his full reach), `roll` and `roll2` in [0,1).
 * Returns null (a catch) or the ball's new velocity: round the post for a corner when that path stays clear of the goal mouth, otherwise back
 * into play. `dir` = the keeper's team's attacking direction (+1 / -1), `goalX` his goal line, `side` the side the ball went to (+1 / -1). */
export function soccerParry({speed,stretch,roll,roll2,ball,dir,goalX,side,goalWidth},P=SOCCER_V249.parry){
  if(!(speed>=P.minSpeed))return null;
  const chance=P.chance[0]+(P.chance[1]-P.chance[0])*clamp(stretch,0,1);
  if(roll>=chance)return null;
  const share=(roll/chance);// uniform in [0,1) given the parry
  if(share<P.cornerShare){
    const tz=side*(goalWidth/2+P.wide[0]+(P.wide[1]-P.wide[0])*roll2),tx=goalX-dir*.9,dx=tx-ball.x,dz=tz-ball.z,l=Math.hypot(dx,dz)||1;
    // the point where this path meets the goal line must be clear of the post
    const gap=Math.abs(goalX-ball.x),u=Math.abs(dx)>1e-6?clamp(gap/Math.abs(dx),0,1):1,crossZ=ball.z+dz*u;
    if(Math.abs(crossZ)>goalWidth/2+.6)return {kind:'corner',vx:dx/l*P.speed,vz:dz/l*P.speed,vy:P.lift};
  }
  const angle=(25+40*roll2)*Math.PI/180;
  return {kind:'rebound',vx:dir*Math.cos(angle)*P.reboundSpeed,vz:side*Math.sin(angle)*P.reboundSpeed,vy:P.lift};
}

/** The passer's run target for a moment after his pass. */
export function soccerGoTarget(p,dir,hx,hz,G=SOCCER_V249.go){
  return {x:clamp(p.x+dir*G.advance,-hx+G.goalInset,hx-G.goalInset),z:clamp(p.z*(1-G.centre),-hz+2,hz-2),duty:'go'};
}

/** Does the text pill show this cue: with the v24.9 texts only what the child cannot see on the pitch (calls, a blocked action, a loose ball). */
export function soccerCueShown(key,{enabled=soccerHud249Enabled()}={}){return !enabled||!SOCCER_V249.hud.quiet.includes(key);}

/** Soccer "full" (14/11/2026, Roy after v23: "11 על 11 שיהיה יותר אמיתי וגם המגרש שיהיה גדול כמו ב-FIFA"): eleven against eleven
 * (a keeper, four defenders, four midfielders, two strikers: 4-4-2; `?soccerFormation=433` plays 4-3-3) on the full 105 x 68 m pitch.
 * The child still plays one player at a time (automatic and manual switch, lob and header as in v23); the other ten move as a team:
 * a block whose back line rises and drops with the ball, shifts toward the ball side and is compact without it, one presser and a
 * cover, zonal marking near the own goal, runs, overlaps and a holding midfielder with it.
 * `?soccerFull=0` (or an explicit `?soccerTeams=`) gives back the v24 small match exactly: nothing below is read then.
 * Pure: no three.js and no DOM; the URL is read only when a browser location exists. */
import {applySoccerTeams} from './soccer-teams.mjs';
import {soccerSlideRecoverV241Enabled,SOCCER_SLIDE_V241} from './soccer-r241.mjs?v=island-v2-20261107-16';

const read=(name,search=globalThis.location?.search)=>{try{return typeof search==='string'?new URLSearchParams(search).get(name):null;}catch{return null;}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=n=>Math.round(n*1000)/1000;
const lerp=(a,b,u)=>a+(b-a)*u;

/** On the page: on unless `?soccerFull=0|off|v24` (an option wins over the URL); an explicit `?soccerTeams=` (6, 7, 8, 11) is a comparison
 * run of the older presets and also leaves it off. Without a page (node: engine tests and tools, no `location`) it is off unless asked
 * (option or `search`), so every contract written for the v24 match keeps testing the v24 match. */
export function soccerFullEnabled(option,search){
  const pick=v=>v===false||v==='0'||v==='off'||v==='v24'?false:v===true||v==='1'||v==='v1'?true:null;
  const chosen=pick(option);if(chosen!==null)return chosen;
  const query=typeof search==='string'?search:globalThis.location?.search;
  if(typeof query!=='string')return false;
  const url=pick(read('soccerFull',query));if(url!==null)return url;
  return !read('soccerTeams',query);
}
/** Length of a half the result check expects: the full match's when it is on (same switch as the session), the island config's otherwise. */
export function soccerHalfSeconds(balance,{drill=false,search}={}){return !drill&&soccerFullEnabled(undefined,search)?SOCCER_FULL.halfSeconds:balance.match.halfSeconds;}
/** '4-4-2' (default) or '4-3-3' (`?soccerFormation=433` / `4-3-3`). */
export function soccerFullFormation(option,search){
  const v=String(option??read('soccerFormation',search)??'').replace(/-/g,'');
  return v==='433'?'4-3-3':'4-4-2';
}

/** The two squads. `base` names the tactical role of the four saved player cards (striker, support, keeper, wing: their IDs, ranks and
 * training never change); `extras` are the seven match-only players added to each side (soccer-squad.mjs), with the shirt number and
 * the kickoff spot ([x of half-length, z of half-width], own half, z as in the tactics package: LB at -z). */
export const SOCCER_FULL_SQUADS=Object.freeze({
  '4-4-2':Object.freeze({
    roles:Object.freeze(['LST','RCM','GK','LM','LCB','RCB','RM','LCM','LB','RB','RST']),
    base:Object.freeze(['LST','RCM','GK','LM']),
    extras:Object.freeze([
      Object.freeze({role:'support',template:1,tacticalRole:'LCB',matchNumber:4,kickoff:Object.freeze([-.62,-.21])}),
      Object.freeze({role:'support',template:1,tacticalRole:'RCB',matchNumber:5,kickoff:Object.freeze([-.62,.21])}),
      Object.freeze({role:'wing',template:3,tacticalRole:'RM',matchNumber:11,kickoff:Object.freeze([-.2,.62])}),
      Object.freeze({role:'support',template:1,tacticalRole:'LCM',matchNumber:6,kickoff:Object.freeze([-.3,-.2])}),
      Object.freeze({role:'wing',template:3,tacticalRole:'LB',matchNumber:3,kickoff:Object.freeze([-.52,-.66])}),
      Object.freeze({role:'wing',template:3,tacticalRole:'RB',matchNumber:2,kickoff:Object.freeze([-.52,.66])}),
      Object.freeze({role:'striker',template:0,tacticalRole:'RST',matchNumber:10,kickoff:Object.freeze([-.04,.16])}),
    ]),
    kickoff:Object.freeze({LST:Object.freeze([-.02,-.1]),RCM:Object.freeze([-.3,.2]),LM:Object.freeze([-.2,-.62])}),
  }),
  '4-3-3':Object.freeze({
    roles:Object.freeze(['CF','RCM','GK','LW','LCB','RCB','RW','LCM','LB','RB','DM']),
    base:Object.freeze(['CF','RCM','GK','LW']),
    extras:Object.freeze([
      Object.freeze({role:'support',template:1,tacticalRole:'LCB',matchNumber:4,kickoff:Object.freeze([-.62,-.21])}),
      Object.freeze({role:'support',template:1,tacticalRole:'RCB',matchNumber:5,kickoff:Object.freeze([-.62,.21])}),
      Object.freeze({role:'wing',template:3,tacticalRole:'RW',matchNumber:11,kickoff:Object.freeze([-.06,.6])}),
      Object.freeze({role:'support',template:1,tacticalRole:'LCM',matchNumber:10,kickoff:Object.freeze([-.28,-.24])}),
      Object.freeze({role:'wing',template:3,tacticalRole:'LB',matchNumber:3,kickoff:Object.freeze([-.52,-.66])}),
      Object.freeze({role:'wing',template:3,tacticalRole:'RB',matchNumber:2,kickoff:Object.freeze([-.52,.66])}),
      Object.freeze({role:'support',template:1,tacticalRole:'DM',matchNumber:6,kickoff:Object.freeze([-.42,0])}),
    ]),
    kickoff:Object.freeze({CF:Object.freeze([-.02,0]),RCM:Object.freeze([-.28,.24]),LW:Object.freeze([-.06,-.6])}),
  }),
});
/** Role lines of the block (the keeper is moved by keeperTarget). */
export const SOCCER_FULL_ROLE_GROUP=Object.freeze({LCB:'back',RCB:'back',CB:'back',LB:'back',RB:'back',LWB:'back',RWB:'back',LM:'mid',RM:'mid',LCM:'mid',RCM:'mid',DM:'mid',LST:'fwd',RST:'fwd',CF:'fwd',LW:'fwd',RW:'fwd',GK:'keeper'});

/** Everything the full match changes, in one place (numbers measured in the headless simulation, see the tests).
 * - speed: players and the ball scale less than the pitch (players x1.43 = 7.6 m/s, the child's sprint x1.35 = 10.3 m/s; shots x1.12 =
 *   19-30 m/s, the keeper's save formula was tuned on those speeds; shooting range x1.32): crossing 105 m takes 14 s, not 20.
 * - shape: back-line depth (fraction of the length from the own goal line) = a + b * ball depth, clamped, per phase; the other lines keep
 *   the package's distances to the back line times `compact`; the width times `width`, plus `shift` of the ball's z.
 * - camera: a broadcast side camera that follows the ball (with lead), keeps the selected player in the frame and zooms between `near`
 *   and `far` with the ball speed, the distance to the selected player and the set piece.
 * - lod: 5.2K-triangle bodies near the camera, Codex athlete-lod-v1's 1.4K and 0.37K ones further out (same skeleton; soccer-full-lod.mjs),
 *   at most `maxFull` near ones. The edges are
 *   distances from the camera (the broadcast camera is ~27 m from play): a body 33 m away is ~29 px tall on a 390 px screen, 62 m ~15 px. */
export const SOCCER_FULL=Object.freeze({
  version:'v1',teams:'11',halfSeconds:90,
  speed:Object.freeze({speedExp:.45,ballExp:.14,shootExp:.35,sprintMultiplier:1.35}),
  // the rival shoots from a corridor 1.7 goals wide instead of one: on a 68 m wide pitch its carriers reach the box wide (sim: 0-0.8 shots a match at stages 2-5)
  ai:Object.freeze({shotCorridor:1.7,passAdvanceCap:24,passSelectionAdvanceWeight:.42}),
  passing:Object.freeze({}),
  // the product preset's two measured fixes (soccer-teams.mjs, 8-a-side) hold here too: an aimed ground pass arrives like a pass, not a shot
  // (travel 0.45 s + 0.03 s a metre), and a slide gets up 0.5 s later (its authored fall and get-up played at 3x popped 53-57 degrees a frame)
  assistPassing:Object.freeze({travelBaseSeconds:.45,travelPerMetre:.03}),slideRecoverExtra:.5,
  shape:Object.freeze({
    defense:Object.freeze({line:Object.freeze([.085,.34]),min:.06,max:.4,ahead:.03,compact:Object.freeze({mid:.72,fwd:.8}),width:.8,shift:.4}),
    defensive_transition:Object.freeze({line:Object.freeze([.1,.33]),min:.08,max:.42,ahead:.04,compact:Object.freeze({mid:.8,fwd:.85}),width:.86,shift:.34}),
    build_up:Object.freeze({line:Object.freeze([.12,.3]),min:.14,max:.33,behind:.1,compact:Object.freeze({mid:.95,fwd:.95}),width:1,shift:.18}),
    attack:Object.freeze({line:Object.freeze([.17,.34]),min:.3,max:.5,behind:.08,compact:Object.freeze({mid:.92,fwd:.9}),width:1,shift:.15}),
  }),
  marking:Object.freeze({zone:36,nearBall:15,reach:20}),
  runs:Object.freeze({maxForwardRunners:3,secondStrikerDrop:7,holdBehind:9,fullbackBehind:4}),
  restartPlayers:Object.freeze({throwIn:3,corner:5,goalKick:3,freeKick:3}),
  advantage:Object.freeze({seconds:2.5,minDepth:.4}),
  camera:Object.freeze({elevationDegrees:30,fovDegrees:40,near:21,base:26.5,far:38,portraitBase:40,portraitFar:54,speedZoom:7,fastBallSpeed:26,spreadFrom:12,spreadZoom:.42,boxZoom:4,setPieceZoom:Object.freeze({goalKick:5,keeper:4,corner:-1.5,penalty:-5,freeKick:-1,throwIn:-1}),
    lead:.35,maxLead:7,ahead:3.2,follow:.22,followRange:26,smoothing:3.4,zoomOut:2.4,zoomIn:.85,edgeX:12,edgeZ:5,safeX:.86,safeY:.76,playerHeight:2.2}),
  lod:Object.freeze({near:33,far:62,hysteresis:2.5,maxFull:6,qualityNear:Object.freeze([33,28,22,15]),qualityFar:Object.freeze([62,52,40,30]),qualityMaxFull:Object.freeze([6,4,2,1]),lowShadows:false}),
  radar:Object.freeze({width:132,height:86,hz:10}),
});

/** The full match's config from the island's soccer config (the same source the small match uses). Order as in the session: this, then
 * expandSoccerConfig, the v23 pitch markings (real 105 x 68 m numbers here) and the v23 control. */
export function applySoccerFull(config,{formation=soccerFullFormation(),tune=config.fullTune||null,v241=soccerSlideRecoverV241Enabled()}={}){
  if(config.full?.version)return config;
  // `tune` (tools only: the simulation's --set 'fullTune={...}') overrides speed, ai, passing, assistPassing, shape and camera entries.
  const T=tune?{...SOCCER_FULL,...tune,speed:{...SOCCER_FULL.speed,...tune.speed},ai:{...SOCCER_FULL.ai,...tune.ai},passing:{...SOCCER_FULL.passing,...tune.passing},assistPassing:{...SOCCER_FULL.assistPassing,...tune.assistPassing},shape:{...SOCCER_FULL.shape,...tune.shape},camera:{...SOCCER_FULL.camera,...tune.camera}}:SOCCER_FULL;
  // v24.1 (soccer-r241.mjs, `?soccerTackleV2=0` / `?soccerV241=0` = v24): the Codex quick get-up needs 0.2 s more, not v24's 0.5 s.
  const F=v241&&!tune?.slideRecoverExtra?{...T,slideRecoverExtra:SOCCER_SLIDE_V241.extra}:T;
  const squad=SOCCER_FULL_SQUADS[formation]||SOCCER_FULL_SQUADS['4-4-2'];
  const scaled=applySoccerTeams(config,F.teams,{speedExp:F.speed.speedExp,shootExp:F.speed.shootExp});
  const base=config.pitch,kd=((105/base.length)+(68/base.width))/2,kb=Math.pow(kd,F.speed.ballExp)/Math.pow(kd,F.speed.speedExp);
  const ph=scaled.physics;
  const kickoff=Object.fromEntries([...squad.extras.map(e=>[e.tacticalRole,e.kickoff]),...Object.entries(squad.kickoff)]);
  const camera={...scaled.view.camera,elevationDegrees:F.camera.elevationDegrees,fovDegrees:F.camera.fovDegrees,nearDistance:F.camera.base,portraitNearDistance:F.camera.portraitBase,farPlane:Math.max(scaled.view.camera.farPlane,420)};
  return {...scaled,
    full:{version:F.version,formation,shape:F.shape,marking:F.marking,runs:F.runs,restartPlayers:F.restartPlayers,camera:F.camera,lod:F.lod,radar:F.radar},
    match:{...scaled.match,halfSeconds:F.halfSeconds},
    squad:{...scaled.squad,formation,roles:[...squad.roles],baseRoles:[...squad.base],extras:squad.extras.map(e=>({...e,kickoff:[...e.kickoff]})),kickoff},
    physics:{...ph,shotSpeed:round(ph.shotSpeed*kb),shotBoost:round(ph.shotBoost*kb),passSpeed:round(ph.passSpeed*kb)},
    sprint:{...scaled.sprint,multiplier:F.speed.sprintMultiplier},
    passing:{...scaled.passing,...F.passing},
    ai:{...scaled.ai,...F.ai},
    assistance:scaled.assistance&&{...scaled.assistance,passing:{...scaled.assistance.passing,...F.assistPassing}},
    slide:scaled.slide&&F.slideRecoverExtra?{...scaled.slide,recoverSeconds:round(scaled.slide.recoverSeconds+F.slideRecoverExtra),maxTotalSeconds:round((scaled.slide.maxTotalSeconds??1.2)+F.slideRecoverExtra),
      variants:scaled.slide.variants&&Object.fromEntries(Object.entries(scaled.slide.variants).map(([name,v])=>[name,{...v,recoverSeconds:round(v.recoverSeconds+F.slideRecoverExtra)}]))}:scaled.slide,
    rules:{...scaled.rules,advantage:{...F.advantage}},
    view:{...scaled.view,camera},
  };
}

// ---- the block ----------------------------------------------------------------------------------------------------------------------
/** Back-line depth (0 = own goal line, 1 = the other one) for a phase and the ball's depth `u` (same scale, for this team). Null for the
 * restart phases (their package anchors stay). Defending, the line is never more than `ahead` in front of a ball deep in the own half;
 * attacking, it stays `behind` the ball. */
export function soccerFullBackLine(phase,u,shape=SOCCER_FULL.shape){
  const s=shape[phase];if(!s)return null;
  let line=clamp(s.line[0]+s.line[1]*clamp(u,0,1),s.min,s.max);
  if(Number.isFinite(s.ahead))line=Math.min(line,Math.max(s.min,u+s.ahead));
  if(Number.isFinite(s.behind))line=Math.max(s.min,Math.min(line,u-s.behind));
  return line;
}
/** Anchor (metres, world axes) of one role in the full block: the package's spot for the phase, moved with the back line and compacted
 * toward it, narrowed and shifted toward the ball. `phase` is the compiled phase ({positions}), `d` the team's attack direction. */
export function soccerFullAnchor(role,phaseId,phase,ball,d,length,width,shape=SOCCER_FULL.shape){
  const s=shape[phaseId],group=SOCCER_FULL_ROLE_GROUP[role];
  if(!s||!group||group==='keeper')return null;
  const point=phase.positions[role],backRole=phase.positions.LCB||phase.positions.CB||phase.positions.RCB;
  if(!point||!backRole)return null;
  const u=.5+ball.x*d/length,line=soccerFullBackLine(phaseId,u,shape),reference=backRole.y;
  const k=group==='back'?1:s.compact[group]??1,y=clamp(line+(point.y-reference)*k,.02,.98);
  const z=clamp((point.x-.5)*width*s.width+s.shift*ball.z,-width/2+1.2,width/2-1.2);
  return {x:d*(y-.5)*length,z};
}

// ---- marking --------------------------------------------------------------------------------------------------------------------------
/** A rival worth a marker: inside `zone` metres of our goal line, or within `nearBall` of the ball (zonal otherwise). */
export function soccerFullMarkable(threat,ball,d,hx,marking=SOCCER_FULL.marking){
  const depth=hx+threat.x*d;
  return depth<=marking.zone||Math.hypot(threat.x-ball.x,threat.z-ball.z)<=marking.nearBall;
}

// ---- advantage ----------------------------------------------------------------------------------------------------------------------
/** Law 5 advantage, kept simple: a foul outside the box on a carrier who still has the ball in the rivals' half is played on (the
 * referee's call shows); if his team loses the ball within `seconds`, the free kick is given where the foul was. */
export function soccerAdvantage(foul,owner,state,config){
  const a=config.rules?.advantage;if(!a||!foul||!owner||foul.penalty)return false;
  if(state.ball.owner!==owner.id||owner.hands)return false;
  const d=state.attackDir*(owner.team===0?1:-1),u=.5+state.ball.x*d/config.pitch.length;
  return u>=(a.minDepth??.4);
}

// ---- camera -----------------------------------------------------------------------------------------------------------------------
/** The full match's broadcast camera. Same shape and projection as soccerCamera ({x, z, distance, direction}) so the framing, the edge
 * arrow and the replays keep working; `zoom` is the wanted distance before the hard fit. */
export function soccerFullCamera(state,aspect,config,previous,dt=0){
  const c=config.full?.camera||SOCCER_FULL.camera,v=config.view.camera,b=state.ball,p=state.players[state.controlled],hx=config.pitch.length/2,hz=config.pitch.width/2;
  const speed=Math.hypot(b.vx||0,b.vz||0),lead=Math.min(c.maxLead,speed*c.lead),n=speed||1,owner=b.owner==null?null:state.players[b.owner];
  const ahead=owner&&!owner.hands?state.attackDir*(owner.team===0?1:-1)*c.ahead:0,gap=p?Math.hypot(p.x-b.x,p.z-b.z):0,follow=p&&gap<=c.followRange?c.follow:0;
  let x=b.x+(b.vx||0)/n*lead+ahead,z=b.z+(b.vz||0)/n*lead;
  if(follow){x+=(p.x-x)*follow;z+=(p.z-z)*follow;}
  x=clamp(x,-hx+c.edgeX,hx-c.edgeX);z=clamp(z,-hz+c.edgeZ,hz-c.edgeZ);
  const portrait=aspect<1,base=portrait?c.portraitBase:c.base,far=portrait?c.portraitFar:c.far;
  const restart=state.restart&&String(state.phase).startsWith('restart')?state.restart.type:null,keeper=owner?.hands;
  const box=Math.max(0,1-Math.hypot(Math.max(0,hx-config.pitch.penaltyDepth-Math.abs(b.x)),Math.max(0,Math.abs(b.z)-config.pitch.penaltyWidth/2))/4);
  let zoom=base+clamp(speed/c.fastBallSpeed,0,1)*c.speedZoom+Math.max(0,gap-c.spreadFrom)*c.spreadZoom-box*c.boxZoom*(restart?0:1)+(restart?c.setPieceZoom[restart]??0:keeper?c.setPieceZoom.keeper:0);
  zoom=clamp(zoom,c.near,far);
  const blend=previous&&dt>0?1-Math.exp(-c.smoothing*dt):previous?0:1,zoomBlend=previous&&dt>0?1-Math.exp(-(zoom>previous.zoom?c.zoomOut:c.zoomIn)*dt):previous?0:1;
  const next={x:previous?previous.x+(x-previous.x)*blend:x,z:previous?previous.z+(z-previous.z)*blend:z,zoom:previous?previous.zoom+(zoom-previous.zoom)*zoomBlend:zoom,direction:state.attackDir};
  next.distance=next.zoom;
  // Hard fit after smoothing: the ball (with its height) and the selected player (head to feet) inside the safe frame.
  const angle=(portrait&&Number.isFinite(v.portraitElevationDegrees)?v.portraitElevationDegrees:v.elevationDegrees)*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle),tan=Math.tan(v.fovDegrees*Math.PI/360);
  const points=[b];if(p&&gap<=c.followRange*1.6)points.push({x:p.x,z:p.z,y:0},{x:p.x,z:p.z,y:c.playerHeight});else points.push({x:b.x,z:b.z,y:c.playerHeight});
  for(const point of points){
    const dx=point.x-next.x,dz=(point.z-next.z)*next.direction,y=point.y||0;
    next.distance=Math.max(next.distance,y*sin+dz*cos+Math.max(Math.abs(dx)/(tan*aspect*c.safeX),Math.abs(y*cos-dz*sin)/(tan*c.safeY)));
  }
  next.distance=Math.min(next.distance,far*1.25);
  return next;
}

// ---- level of detail ------------------------------------------------------------------------------------------------------------------
/** LOD for one player from his distance to the camera (metres): 0 near, 1 middle, 2 far, with hysteresis around the edges. Tiers 1-3
 * pull the edges in. Pure; the view applies the `maxFull` cap. */
export function soccerFullLodLevel(distance,previous=0,quality=0,lod=SOCCER_FULL.lod){
  const q=clamp(Math.floor(quality)||0,0,3),near=lod.qualityNear?.[q]??lod.near,far=lod.qualityFar?.[q]??lod.far,h=lod.hysteresis??2;
  const nearEdge=previous===0?near+h:near-h,farEdge=previous===2?far-h:far+h;
  return distance<nearEdge?0:distance<farEdge?1:2;
}

// ---- radar ----------------------------------------------------------------------------------------------------------------------------
/** Where the pitch sits inside the radar canvas (CSS pixels): the whole 105 x 68 m pitch, a few pixels of margin. */
export function soccerRadarLayout(width,height,pitch,pad=5){
  const scale=Math.min((width-2*pad)/pitch.length,(height-2*pad)/pitch.width);
  return {scale,w:pitch.length*scale,h:pitch.width*scale,ox:(width-pitch.length*scale)/2,oy:(height-pitch.width*scale)/2,hx:pitch.length/2,hz:pitch.width/2};
}
/** A pitch point on the radar, oriented like the screen: the child's team attacks to the right, the far touchline is at the top. */
export function soccerRadarPoint(x,z,attackDir,layout){
  return {x:layout.ox+(x*attackDir+layout.hx)*layout.scale,y:layout.oy+(z*attackDir+layout.hz)*layout.scale};
}
/** Draw one radar frame on a 2D context (CSS pixels; the caller scales for the device pixel ratio). `frame` is the camera's footprint on
 * the grass (four points), `colors` [home, rival]. Returns the number of dots drawn (tests). */
export function drawSoccerRadar(ctx,state,layout,{colors=['#3b82f6','#ef4444'],frame=null,pitch}={}){
  const L=layout,dir=state.attackDir||1,P=(x,z)=>soccerRadarPoint(x,z,dir,L);
  ctx.clearRect(0,0,L.ox*2+L.w,L.oy*2+L.h);
  ctx.fillStyle='rgba(9,28,24,.72)';ctx.fillRect(0,0,L.ox*2+L.w,L.oy*2+L.h);
  ctx.fillStyle='rgba(46,120,72,.55)';ctx.fillRect(L.ox,L.oy,L.w,L.h);
  ctx.strokeStyle='rgba(240,246,232,.55)';ctx.lineWidth=1;ctx.strokeRect(L.ox+.5,L.oy+.5,L.w-1,L.h-1);
  ctx.beginPath();ctx.moveTo(L.ox+L.w/2,L.oy);ctx.lineTo(L.ox+L.w/2,L.oy+L.h);ctx.stroke();
  if(pitch){for(const end of [-1,1]){const a=P(end*L.hx,-pitch.penaltyWidth/2),b=P(end*(L.hx-pitch.penaltyDepth),pitch.penaltyWidth/2);ctx.strokeRect(Math.min(a.x,b.x)+.5,Math.min(a.y,b.y)+.5,Math.abs(b.x-a.x),Math.abs(b.y-a.y));}
    ctx.beginPath();ctx.arc(L.ox+L.w/2,L.oy+L.h/2,(pitch.centreRadius||9.15)*L.scale,0,Math.PI*2);ctx.stroke();}
  if(frame?.length===4){ctx.beginPath();frame.forEach((q,i)=>{const r=P(clamp(q.x,-L.hx,L.hx),clamp(q.z,-L.hz,L.hz));if(i)ctx.lineTo(r.x,r.y);else ctx.moveTo(r.x,r.y);});ctx.closePath();ctx.fillStyle='rgba(255,255,255,.1)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.35)';ctx.stroke();}
  let dots=0;
  for(const p of state.players){
    const r=P(p.x,p.z),me=p.id===state.controlled;
    ctx.beginPath();ctx.arc(r.x,r.y,me?3.4:2.3,0,Math.PI*2);ctx.fillStyle=colors[p.team]||'#fff';ctx.fill();
    if(me){ctx.lineWidth=1.4;ctx.strokeStyle='#fffbe6';ctx.stroke();ctx.lineWidth=1;}else if(p.role==='keeper'){ctx.strokeStyle='rgba(255,255,255,.7)';ctx.stroke();}
    dots++;
  }
  const ball=P(state.ball.x,state.ball.z);ctx.beginPath();ctx.arc(ball.x,ball.y,2.2,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();ctx.strokeStyle='#0b1512';ctx.stroke();dots++;
  return dots;
}

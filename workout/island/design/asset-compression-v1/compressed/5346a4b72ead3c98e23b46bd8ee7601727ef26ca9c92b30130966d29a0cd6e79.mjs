/** Soccer presentation M4 ("soccerShow", 11/11/2026, programme sports-deep-fable: "like FIFA"). The pure rules behind the goal
 * broadcast: the live cut to a behind-goal angle, the two-cut replay over the recorded last seconds (wide build-up, then a low close
 * angle at half speed through the net), the celebration cast and its choreography (scorer to the corner, two team-mates after him, the
 * beaten keeper), the full-time finale, the crowd mood, the box zoom of the live camera and the short replays of a post or a save.
 * `?soccerShow=0` (or the option '0'/'off'/'v1'... see resolveSoccerShow) restores the previous presentation exactly: the 2.2 s single-path
 * replay at quality < 2, scorer-only celebration in place, cheer-only crowd.
 * Nothing here touches the simulation: the view renders a presentation copy of the state, and the session simply does not step the
 * model while `hold` is true (the match clock, phase timers and the kickoff layout stay as the simulation left them). Unit-tested
 * without a renderer; the view integration is soccer-show-view.mjs. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hypot2=(x,z)=>Math.sqrt(x*x+z*z);
export function resolveSoccerShow(option,search=globalThis.location?.search){
  const pick=value=>value==='v1'?'v1':value==='0'||value==='off'?'0':null;
  const fromUrl=typeof search==='string'?pick(new URLSearchParams(search).get('soccerShow')):null;
  return fromUrl||pick(option)||'v1'; // the page's query wins over the config value, so ?soccerShow=0 always restores today's presentation
}
export const soccerShowEnabled=(option,search)=>resolveSoccerShow(option,search)==='v1';

/** Defaults; `config.show` (data/config.json, minigames.soccer.show) overrides field by field. Seconds unless noted. */
export const SOCCER_SHOW_DEFAULTS=Object.freeze({
  /** Live behind-goal angle right after the goal (the ball still rolling into the net in the simulation's slow motion), before the replay. */
  cutSeconds:.7,
  replay:Object.freeze({
    /** Recorded seconds before the strike the wide angle starts at; the recording holds `recordSeconds` (the ring buffer). */
    before:3,recordSeconds:4.6,
    /** The close angle starts this long before the strike, but never more than `closeMaxBefore` before the ball crosses the line
     * (a long-range shot keeps the slow motion for the end of the flight), and runs `after` seconds past the line. */
    strikeLead:.55,closeMaxBefore:1.15,after:.45,
    /** Playback rate of the close angle; the wide angle is real time but never longer than `maxWideSeconds` on screen. */
    slowRate:.5,maxWideSeconds:1.9,maxCloseSeconds:2.6,
    /** Below this much recording (a goal straight after a restart) the replay is skipped and the celebration starts. */
    minRecording:1,
    /** When the scorer's kick is not in the recording (deflection, own goal) the strike is assumed this long before the line. */
    strikeFallback:.9,
  }),
  celebrate:Object.freeze({
    /** The model is held this long for the celebration (a tap ends the hold early); the choreography keeps going until the kickoff. */
    holdSeconds:2.2,
    runSpeed:4.6,maxRun:10,cornerInset:2.4,mates:2,mateSpeed:5.4,mateDelay:.25,mateOffset:1.25,mateBack:1.2,
    mateClips:Object.freeze(['v9_celebrate_clap','v9_celebrate_hop']),
    /** The beaten keeper: the first clip that exists. keeper_after_goal / disappointed are not in any shipped pack (11/11/2026). */
    keeperClips:Object.freeze(['v11_keeper_after_goal','disappointed','v10_idle_weight_shift','v9_idle_weight_shift','v10_idle_relaxed','v9_idle_relaxed']),
    winnerClips:Object.freeze(['celebrate_arms_up','v9_celebrate_hop','celebrate_fist_pump','v9_celebrate_pump','celebrate_victory_leap','v9_celebrate_turn','v9_celebrate_clap']),
  }),
  /** Full time: winners celebrate, losers stand; the session waits this long before the penalties / the result card. */
  fulltimeSeconds:3,
  camera:Object.freeze({
    /** Live camera: metres closer when the ball is inside either penalty box (ramped over `boxRamp` metres outside it); landscape only. */
    boxZoom:3,boxRamp:4,
    /** Entry blend into the first show camera, exit blend back to the live camera, pan smoothing (1/s) inside a shot. */
    cutBlend:.35,exitBlend:.6,pan:9,
    wide:Object.freeze({back:7,height:5.6,side:3.2,fov:50}),
    close:Object.freeze({back:2.2,side:4.6,height:1.45,fov:38}),
    celebrate:Object.freeze({distance:8,height:3.1,fov:40}),
    /** Portrait keeps the authored vertical field of view, widened only a little (see soccer-design-replay for the measurement). */
    portraitExtraFov:8,
  }),
  short:Object.freeze({enabled:true,before:.8,after:.5,rate:.5,cooldown:20,postWindow:3,saveWindow:1.2,minPlaySeconds:3}),
  crowd:Object.freeze({cheerSeconds:3.6,groanSeconds:2.6,exciteEase:.6,gaspLevel:.45}),
});
const merge=(base,over)=>{if(!over||typeof over!=='object')return base;const out={...base};for(const [k,v] of Object.entries(over))out[k]=v&&typeof v==='object'&&!Array.isArray(v)&&base[k]&&typeof base[k]==='object'&&!Array.isArray(base[k])?merge(base[k],v):v;return out;};
export const soccerShowConfig=config=>merge(SOCCER_SHOW_DEFAULTS,config?.show);

// ---- replay --------------------------------------------------------------------------------------------------------------------------------------
/** The two cuts over the recording, in recorded seconds. `strike` = the scorer's last kick (null when unknown), `contact` = the ball on the
 * line, `oldest`/`latest` = what the ring buffer holds. Each segment: cam, from, to, rate, wall (screen seconds), wallStart. Null = no replay. */
export function replayCuts({strike,contact,oldest,latest},cfg=SOCCER_SHOW_DEFAULTS.replay){
  if(!(latest-oldest>=cfg.minRecording))return null;
  const s=Number.isFinite(strike)?strike:contact-cfg.strikeFallback;
  const closeFrom=clamp(Math.max(s-cfg.strikeLead,contact-cfg.closeMaxBefore),oldest,latest),wideFrom=clamp(s-cfg.before,oldest,closeFrom),closeTo=clamp(contact+cfg.after,closeFrom,latest);
  const segments=[];
  if(closeFrom-wideFrom>=.4)segments.push({cam:'wide',from:wideFrom,to:closeFrom,rate:Math.max(1,(closeFrom-wideFrom)/cfg.maxWideSeconds)});
  if(closeTo-closeFrom>.1)segments.push({cam:'close',from:closeFrom,to:closeTo,rate:Math.max(cfg.slowRate,(closeTo-closeFrom)/cfg.maxCloseSeconds)});
  if(!segments.length)return null;
  let start=0;for(const seg of segments){seg.wall=(seg.to-seg.from)/seg.rate;seg.wallStart=start;start+=seg.wall;}
  return {segments,wall:start,strike:s,contact};
}
/** One close cut around `at` (a post, a save) at the slow rate. */
export function shortCuts({at,oldest,latest},cfg=SOCCER_SHOW_DEFAULTS.short){
  const from=clamp(at-cfg.before,oldest,latest),to=clamp(at+cfg.after,from,latest);
  if(to-from<.3)return null;
  return {segments:[{cam:'close',from,to,rate:cfg.rate,wall:(to-from)/cfg.rate,wallStart:0}],wall:(to-from)/cfg.rate,strike:at,contact:at};
}
/** Where the replay is at `wall` screen seconds: the segment, the recorded time and the playback rate. */
export function replayCursor(cuts,wall){
  for(let i=0;i<cuts.segments.length;i++){const seg=cuts.segments[i];if(wall<seg.wallStart+seg.wall)return {cut:i,cam:seg.cam,time:seg.from+(wall-seg.wallStart)*seg.rate,rate:seg.rate,done:false};}
  const last=cuts.segments.at(-1);return {cut:cuts.segments.length-1,cam:last.cam,time:last.to,rate:last.rate,done:true};
}
/** The strike: the last rise of the scorer's kick or header clock in the recording, at or before `contact`. `samples` ascend in time
 * ({time,kick,header}); null when the scorer never kicked in the recording. */
export function strikeTime(samples,contact){
  let found=null;
  for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i];if(b.time>contact+1e-6)break;if(b.kick>a.kick+1e-3||b.header>a.header+1e-3)found=b.time;}
  return found;
}

// ---- celebration -------------------------------------------------------------------------------------------------------------------------------------
const nearest=(list,x,z)=>list.reduce((best,p)=>!best||hypot2(p.x-x,p.z-z)<hypot2(best.x-x,best.z-z)?p:best,null);
/** Who celebrates where. The scorer runs toward the corner flag on the camera side of the goal he scored in (at most `maxRun` metres),
 * the two nearest team-mates follow, the beaten keeper stays. An own goal or a keeper's goal casts the nearest outfield player of the
 * scoring team. `cameraSide` is the touchline the live camera sits on (the camera is at z = attackDir * distance). */
export function celebrationCast(state,pitch,cfg=SOCCER_SHOW_DEFAULTS.celebrate){
  const players=state.players,ball=state.ball,team=state.goalTeam??state.event?.team??players[ball.lastPlayer]?.team??0;
  const goalDir=Math.sign(ball.x)||(state.attackDir||1)*(team===0?1:-1),cameraSide=Math.sign(state.attackDir||1)||1;
  const outfield=players.filter(p=>p.team===team&&p.role!=='keeper');
  let scorer=players[state.scorer??ball.lastPlayer];
  if(!scorer||scorer.team!==team||scorer.role==='keeper')scorer=nearest(outfield,ball.x,ball.z)||players.find(p=>p.team===team)||players[0];
  const mates=outfield.filter(p=>p.id!==scorer.id).sort((a,b)=>hypot2(a.x-scorer.x,a.z-scorer.z)-hypot2(b.x-scorer.x,b.z-scorer.z)).slice(0,cfg.mates);
  const keeper=players.find(p=>p.team!==team&&p.role==='keeper')||null;
  const corner={x:goalDir*(pitch.length/2-cfg.cornerInset),z:cameraSide*(pitch.width/2-cfg.cornerInset)};
  const dx=corner.x-scorer.x,dz=corner.z-scorer.z,dist=hypot2(dx,dz),run=Math.min(dist,cfg.maxRun),ux=dist>1e-6?dx/dist:-goalDir,uz=dist>1e-6?dz/dist:0;
  return {team,goalDir,cameraSide,scorer:scorer.id,mates:mates.map(m=>m.id),keeper:keeper?.id??null,corner,
    start:{x:scorer.x,z:scorer.z},target:{x:scorer.x+ux*run,z:scorer.z+uz*run},dir:{x:ux,z:uz},run,
    mateStarts:mates.map(m=>({x:m.x,z:m.z}))};
}
/** Choreography at `elapsed` seconds into the celebration, pure in time (no accumulation): writes x/z/vx/vz/fx/fz of the cast into the
 * presentation copies in `players` and fills `roles` ({id:{role:'run'|'celebrate'|'dejected',clip}}). Returns true once the scorer has arrived. */
export function celebrationPose(cast,elapsed,players,roles,cfg=SOCCER_SHOW_DEFAULTS.celebrate){
  const {dir:u}=cast,scorer=players[cast.scorer],run=Math.min(cast.run,cfg.runSpeed*Math.max(0,elapsed)),arrived=run>=cast.run-1e-6;
  scorer.x=cast.start.x+u.x*run;scorer.z=cast.start.z+u.z*run;
  const face=(p,fx,fz)=>{const l=hypot2(fx,fz)||1;p.fx=fx/l;p.fz=fz/l;};
  if(arrived){scorer.vx=scorer.vz=0;scorer.sprinting=false;face(scorer,-scorer.x||-cast.goalDir,-scorer.z);/* toward the centre spot = toward the celebration camera */roles[scorer.id]={role:'celebrate',clip:null};}
  else {scorer.vx=u.x*cfg.runSpeed;scorer.vz=u.z*cfg.runSpeed;scorer.sprinting=true;face(scorer,u.x,u.z);roles[scorer.id]={role:'run',clip:null};}
  // The mates flank the scorer's target, a step behind him, and clap or hop when they get there.
  const px=-u.z,pz=u.x;
  cast.mates.forEach((id,i)=>{
    const m=players[id],from=cast.mateStarts[i],side=i%2?1:-1,goal={x:cast.target.x-u.x*cfg.mateBack+px*side*cfg.mateOffset,z:cast.target.z-u.z*cfg.mateBack+pz*side*cfg.mateOffset};
    const dx=goal.x-from.x,dz=goal.z-from.z,dist=hypot2(dx,dz),t=Math.max(0,elapsed-cfg.mateDelay*(i+1)),step=Math.min(dist,cfg.mateSpeed*t),there=step>=dist-1e-6,ux=dist>1e-6?dx/dist:u.x,uz=dist>1e-6?dz/dist:u.z;
    m.x=from.x+ux*step;m.z=from.z+uz*step;
    if(there){m.vx=m.vz=0;m.sprinting=false;face(m,scorer.x-m.x||-cast.goalDir,scorer.z-m.z||0);roles[id]={role:'celebrate',clip:cfg.mateClips[i%cfg.mateClips.length]};}
    else {m.vx=ux*cfg.mateSpeed;m.vz=uz*cfg.mateSpeed;m.sprinting=true;face(m,ux,uz);roles[id]={role:'run',clip:null};}
  });
  if(cast.keeper!==null)roles[cast.keeper]={role:'dejected',clip:null};
  return arrived;
}
/** Full time: every winner celebrates (clips cycle through the pack), the losers stand hands down. A draw casts nobody. */
export function fulltimeRoles(state,roles,cfg=SOCCER_SHOW_DEFAULTS.celebrate){
  const [a,b]=state.score;if(a===b)return null;
  const winner=a>b?0:1;let n=0;
  for(const p of state.players)roles[p.id]=p.team===winner?{role:'celebrate',clip:cfg.winnerClips[n++%cfg.winnerClips.length]}:{role:'dejected',clip:null};
  return winner;
}

// ---- crowd ------------------------------------------------------------------------------------------------------------------------------------------
/** What the stands do about a match event: a cheer for a home goal, a groan for a rival goal, a gasp for the post. */
export function crowdReaction(event,home=0){
  if(!event)return null;
  if(event.type==='goal')return event.team===home?'cheer':'groan';
  if(event.type==='post')return 'gasp';
  return null;
}
/** How close the ball is to either penalty box: 1 inside, falling to 0 `ramp` metres outside. */
export function boxExcitement(ball,pitch,ramp=SOCCER_SHOW_DEFAULTS.camera.boxRamp){
  const hx=pitch.length/2,outX=Math.max(0,hx-pitch.penaltyDepth-Math.abs(ball.x)),outZ=Math.max(0,Math.abs(ball.z)-pitch.penaltyWidth/2);
  return clamp(1-hypot2(outX,outZ)/Math.max(1e-6,ramp),0,1);
}
/** Step the crowd mood: cheer and groan decay linearly, excitement eases toward the live value. Mutates and returns `mood`. */
export function stepCrowdMood(mood,reaction,excitement,dt,cfg=SOCCER_SHOW_DEFAULTS.crowd){
  mood.cheer=Math.max(0,mood.cheer-dt/cfg.cheerSeconds);mood.groan=Math.max(0,mood.groan-dt/cfg.groanSeconds);
  if(reaction==='cheer')mood.cheer=1;else if(reaction==='groan')mood.groan=1;else if(reaction==='gasp')mood.cheer=Math.max(mood.cheer,cfg.gaspLevel);
  mood.excitement+=(clamp(excitement,0,1)-mood.excitement)*(1-Math.exp(-dt/cfg.exciteEase));
  return mood;
}

// ---- cameras (pure descriptors: position, target, fov) -----------------------------------------------------------------------------------------------
/** Wide angle from behind the goal that was scored in, on the camera side, panning onto the ball: the build-up runs toward the lens. */
export function wideCamera(cast,ball,pitch,c=SOCCER_SHOW_DEFAULTS.camera.wide){
  return {position:[cast.goalDir*(pitch.length/2+c.back),c.height,cast.cameraSide*c.side],target:[ball.x,.6,ball.z],fov:c.fov};
}
/** Low tripod beside the strike spot, a step behind it on the camera side, panning with the ball through the net. */
export function closeCamera(anchor,cast,ball,c=SOCCER_SHOW_DEFAULTS.camera.close){
  return {position:[anchor.x-cast.goalDir*c.back,c.height,anchor.z+cast.cameraSide*c.side],target:[ball.x,Math.max(.3,ball.y||0)+.15,ball.z],fov:c.fov};
}
/** Celebration: from the pitch side of the scorer (toward the centre spot), so the corner and the stands are behind him and he faces the lens. */
export function celebrateCamera(focus,c=SOCCER_SHOW_DEFAULTS.camera.celebrate){
  const dx=-focus.x,dz=-focus.z,l=hypot2(dx,dz)||1;
  return {position:[focus.x+dx/l*c.distance,c.height,focus.z+dz/l*c.distance],target:[focus.x,1,focus.z],fov:c.fov};
}

// ---- timeline -----------------------------------------------------------------------------------------------------------------------------------------
/** The show's state machine. Phases: live, cut (behind-goal live angle), replay, celebrate, short (post / save), fulltime. `update` is pure in
 * its inputs: the live state, the frame dt, and a recorder view {clock, oldest, latest, strike(scorerId, contact), ballAt(time, out)}.
 * `hold` tells the session not to step the model this frame. */
export function createSoccerShowTimeline(cfg=SOCCER_SHOW_DEFAULTS,pitch={length:48,width:30,penaltyDepth:4.8,penaltyWidth:9.6}){
  let phase='live',t=0,hold=false,cuts=null,cast=null,cursor=null,lastPhase=null,tap=false,contact=0,shortCooldown=0,shortAnchor=null,pendingPost=null,pendingDive=null,playSeconds=0,starts=0,shorts=0,reason='idle',lastGoalPhase=false;
  const begin=(next,{holdModel=false}={})=>{phase=next;t=0;hold=holdModel;tap=false;if(next==='replay')starts++;if(next==='short')shorts++;};
  return {
    get phase(){return phase;},get hold(){return hold;},get elapsed(){return t;},get cuts(){return cuts;},get cast(){return cast;},get cursor(){return cursor;},get shortAnchor(){return shortAnchor;},
    get active(){return phase!=='live';},get replaying(){return phase==='replay'||phase==='short';},get reason(){return reason;},
    metrics(){return {phase,hold,elapsed:t,starts,shorts,reason,cast:cast?{scorer:cast.scorer,mates:cast.mates,keeper:cast.keeper,team:cast.team}:null,wall:cuts?.wall??null,cuts:cuts?.segments.map(s=>({cam:s.cam,span:+(s.to-s.from).toFixed(3),rate:s.rate,wall:+s.wall.toFixed(3)}))??null};},
    skip(){tap=true;},
    /** Match events (drained by the session after the frame): a post and a keeper dive may earn a short replay. */
    event(e,clock){if(e?.type==='post')pendingPost={at:clock};else if(e?.type==='dive')pendingDive={player:e.player,at:clock};},
    update(live,dt,recorder){
      const step=Math.max(0,Number.isFinite(dt)?dt:0),enteredGoal=live.phase==='goal'&&lastPhase!=='goal',enteredFinish=live.phase==='finished'&&lastPhase!=='finished';lastPhase=live.phase;
      if(!hold)shortCooldown=Math.max(0,shortCooldown-step);playSeconds=live.phase==='playing'?playSeconds+step:0;
      if(enteredGoal&&!live.shootout&&!live.drill){cast=celebrationCast(live,pitch,cfg.celebrate);contact=recorder.clock;cuts=null;cursor=null;begin('cut');reason='goal';}
      else if(enteredFinish&&cfg.fulltimeSeconds>0&&!live.shootout){cast=null;begin('fulltime');reason='fulltime';}
      else if(['cut','replay','celebrate'].includes(phase)&&live.phase!=='goal'){begin('live');reason='kickoff';}
      else if(phase==='fulltime'&&live.phase!=='finished'){begin('live');reason='after-fulltime';}
      else t+=step;
      switch(phase){
        case 'cut':
          if(t>=cfg.cutSeconds){
            cuts=replayCuts({strike:recorder.strike(cast.scorer,contact),contact,oldest:recorder.oldest,latest:recorder.latest},cfg.replay);
            if(cuts){cursor=replayCursor(cuts,0);begin('replay',{holdModel:true});reason='replay';}else {begin('celebrate',{holdModel:true});reason='short-recording';}
          }break;
        case 'replay':cursor=replayCursor(cuts,t);if(cursor.done||tap){reason=tap?'skipped':'complete';begin('celebrate',{holdModel:true});}break;
        case 'celebrate':if(tap){hold=false;tap=false;}if(t>=cfg.celebrate.holdSeconds)hold=false;break;
        case 'short':cursor=replayCursor(cuts,t);if(cursor.done||tap){reason=tap?'short-skipped':'short-complete';begin('live');}break;
        case 'fulltime':break;
        default:{
          // Short replays: a shot off the post once the ball is out (the restart is held meanwhile), a keeper's catch straight after his dive.
          if(!cfg.short.enabled||live.shootout||live.drill)break;
          const clock=recorder.clock;
          if(pendingPost&&clock-pendingPost.at>cfg.short.postWindow)pendingPost=null;
          if(pendingDive&&clock-pendingDive.at>cfg.short.saveWindow)pendingDive=null;
          const keeper=pendingDive?live.players[pendingDive.player]:null,saved=keeper&&keeper.hands&&live.phase==='playing',post=pendingPost&&live.phase.startsWith('restart');
          if(shortCooldown>0||!(saved||post))break;
          const at=saved?clock:pendingPost.at,anchor={x:0,y:0,z:0};recorder.ballAt(at,anchor);
          const next=shortCuts({at,oldest:recorder.oldest,latest:recorder.latest},cfg.short);
          pendingPost=pendingDive=null;
          if(!next||playSeconds<cfg.short.minPlaySeconds&&saved)break;
          cuts=next;cursor=replayCursor(cuts,0);shortCooldown=cfg.short.cooldown;
          shortAnchor={anchor,goalDir:Math.sign(anchor.x)||1,cameraSide:Math.sign(live.attackDir||1)||1,kind:saved?'save':'post'};
          begin('short',{holdModel:true});reason=shortAnchor.kind;
        }
      }
      return {phase,hold,cursor,cast,cuts};
    },
  };
}

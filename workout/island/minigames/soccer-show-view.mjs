import * as T from '../vendor/three.module.js';
import {createSoccerShowTimeline,celebrationPose,fulltimeRoles,wideCamera,closeCamera,celebrateCamera,crowdReaction,boxExcitement,stepCrowdMood,soccerShowConfig} from './soccer-show.mjs';

const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*u*(u*(u*6-15)+10);};
const preference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
/** soccerShow v1, the view half (soccer-show.mjs holds the rules). Owns: the show camera (cuts, pans, the blends from and back to the live
 * camera), the presentation copy of the state during the celebration and the finale (positions and roles the choreography writes), the
 * replay readback through the existing ring buffer (the live avatars render the recorded frames, nothing is cloned), and the crowd mood.
 * The live camera is applied by the view first and captured here, so the exit blend always lands on the real framing. */
export function createSoccerShowView({config,replay,reducedMotion=()=>preference?.matches===true}){
  const cfg=soccerShowConfig(config),pitch=config.pitch,timeline=createSoccerShowTimeline(cfg,pitch),look=new T.Vector3();
  const live={pos:[0,0,0],target:[0,0,0],fov:50},shot={pos:[0,0,0],target:[0,0,0],fov:50},from={pos:[0,0,0],target:[0,0,0],fov:50},out={pos:[0,0,0],target:[0,0,0],fov:50};
  const recorder={get clock(){return replay.clock;},get oldest(){return replay.oldest;},get latest(){return replay.latest;},strike:(id,contact)=>replay.strike(id,contact),ballAt:(time,o)=>replay.ballAt(time,o)};
  const mood={cheer:0,groan:0,excitement:0},anchor={x:0,y:0,z:0},roles={};let state=null,players=[],reaction=null,lastCut=-1,entry=0,exit=1,owned=false,baseFov=null,lastPhase='live',holdSeconds=0,fulltimeFocus=null;
  function ensure(source){
    if(state)return;players=source.players.map(p=>({...p}));state={...source,players,ball:source.ball,show:{roles}};
  }
  /** Presentation copy of the live state (the simulation object is never written): players are field-copied, the ball is shared. */
  function copy(source){
    ensure(source);Object.assign(state,source);state.players=players;state.ball=source.ball;state.show={roles};
    for(let i=0;i<source.players.length;i++)Object.assign(players[i]||(players[i]={}),source.players[i]);players.length=source.players.length;
    for(const key of Object.keys(roles))delete roles[key];
    return state;
  }
  const set3=(dst,src)=>{dst[0]=src[0];dst[1]=src[1];dst[2]=src[2];};
  const mix=(dst,a,b,u)=>{for(let i=0;i<3;i++){dst.pos[i]=a.pos[i]+(b.pos[i]-a.pos[i])*u;dst.target[i]=a.target[i]+(b.target[i]-a.target[i])*u;}dst.fov=a.fov+(b.fov-a.fov)*u;};
  /** A new shot snaps (a cut); inside a shot the lens pans and dollies with an exponential ease. */
  function aim(desc,dt,snap){
    if(snap){set3(shot.pos,desc.position);set3(shot.target,desc.target);shot.fov=desc.fov;return;}
    const k=1-Math.exp(-cfg.camera.pan*dt);
    for(let i=0;i<3;i++){shot.pos[i]+=(desc.position[i]-shot.pos[i])*k;shot.target[i]+=(desc.target[i]-shot.target[i])*k;}shot.fov+=(desc.fov-shot.fov)*k;
  }
  function apply(camera,c){
    camera.position.set(c.pos[0],c.pos[1],c.pos[2]);look.set(c.target[0],c.target[1],c.target[2]);camera.lookAt(look);camera.updateMatrixWorld();
    const fov=camera.aspect<1?c.fov+cfg.camera.portraitExtraFov:c.fov;if(Math.abs(camera.fov-fov)>1e-4){camera.fov=fov;camera.updateProjectionMatrix();}
  }
  return {
    cfg,timeline,mood,
    get hold(){return timeline.hold;},get replaying(){return timeline.replaying;},get active(){return timeline.active||exit<1;},get phase(){return timeline.phase;},
    get finaleSeconds(){return cfg.fulltimeSeconds;},
    skip(){timeline.skip();},
    /** Match events drained by the session (after the frame): short replays and the crowd mood. */
    event(e){timeline.event(e,replay.clock);const r=crowdReaction(e,0);if(r)reaction=r;},
    /** Returns the state to render, the clip playback rate and whether the camera was taken over. `liveTarget` is the point the live camera looks at. */
    update(source,dt,camera,liveTarget,quality=0){
      const step=Math.max(0,Number.isFinite(dt)?dt:0);
      // The recorder stops while the model is held (the frozen match would otherwise push the goal out of the 4.6 s window).
      replay.held=timeline.hold;replay.record(source,step);
      const excitement=Math.max(boxExcitement(source.ball,pitch,cfg.camera.boxRamp),source.phase==='goal'?1:0);
      stepCrowdMood(mood,reaction,excitement,step,cfg.crowd);reaction=null;
      if(reducedMotion()){replay.held=false;timeline.skip();}
      const r=timeline.update(source,step,recorder),phase=r.phase;
      if(baseFov===null)baseFov=camera.fov;
      live.pos[0]=camera.position.x;live.pos[1]=camera.position.y;live.pos[2]=camera.position.z;set3(live.target,liveTarget);live.fov=baseFov;
      let rendered=source,rate=1,desc=null,snap=false;
      if(phase!==lastPhase){
        if(lastPhase==='live'){mix(from,live,live,0);entry=0;}
        if(phase==='live'){mix(from,out,out,0);exit=0;}
        if(phase==='replay'||phase==='short'){lastCut=-1;if(phase==='replay'){const at=replay.readAt(r.cuts.strike,source),p=at.players[r.cast.scorer];anchor.x=p.x;anchor.y=0;anchor.z=p.z;}}
        if(phase==='celebrate'||phase==='fulltime')copy(source);
        if(phase==='fulltime'){const winner=fulltimeRoles(source,roles,cfg.celebrate);fulltimeFocus=winner===null?null:(source.players[source.controlled].team===winner?source.players[source.controlled]:source.players.filter(p=>p.team===winner&&p.role!=='keeper').sort((a,b)=>Math.hypot(a.x-source.ball.x,a.z-source.ball.z)-Math.hypot(b.x-source.ball.x,b.z-source.ball.z))[0]||null);}
        holdSeconds=0;lastPhase=phase;
      }
      if(timeline.hold)holdSeconds+=step;
      switch(phase){
        case 'cut':desc=wideCamera(r.cast,source.ball,pitch,cfg.camera.wide);break;
        case 'replay':{const c=r.cursor;rendered=replay.readAt(c.time,source);rate=c.rate;snap=c.cut!==lastCut;lastCut=c.cut;
          desc=c.cam==='wide'?wideCamera(r.cast,rendered.ball,pitch,cfg.camera.wide):closeCamera(anchor,r.cast,rendered.ball,cfg.camera.close);break;}
        case 'short':{const c=r.cursor,a=timeline.shortAnchor;rendered=replay.readAt(c.time,source);rate=c.rate;snap=lastCut<0;lastCut=c.cut;desc=closeCamera(a.anchor,a,rendered.ball,cfg.camera.close);break;}
        case 'celebrate':{rendered=copy(source);celebrationPose(r.cast,timeline.elapsed,players,roles,cfg.celebrate);desc=celebrateCamera(players[r.cast.scorer],cfg.camera.celebrate);break;}
        case 'fulltime':{rendered=copy(source);if(fulltimeRoles(source,roles,cfg.celebrate)!==null&&fulltimeFocus)desc=celebrateCamera(fulltimeFocus,cfg.camera.celebrate);break;}
      }
      if(desc){
        aim(desc,step,snap||entry===0);entry+=step;
        // A hard cut only after the first shot: the entry is a short blend from the live framing, every later shot change is a cut.
        if(entry<cfg.camera.cutBlend&&!(snap&&lastCut>0))mix(out,from,shot,smooth(entry/cfg.camera.cutBlend));else mix(out,shot,shot,0);
        apply(camera,out);owned=true;exit=1;
      }else if(exit<1){
        exit=Math.min(1,exit+step/cfg.camera.exitBlend);mix(out,from,live,smooth(exit));apply(camera,out);owned=true;
        if(exit>=1&&camera.fov!==baseFov){camera.fov=baseFov;camera.updateProjectionMatrix();}
      }else owned=false;
      return {state:rendered,rate,owned,phase,hold:timeline.hold,replaying:timeline.replaying,tag:timeline.replaying?'replay':phase==='celebrate'||phase==='fulltime'?'celebrate':null};
    },
    metrics(){return {...timeline.metrics(),owned,mood:{cheer:+mood.cheer.toFixed(3),groan:+mood.groan.toFixed(3),excitement:+mood.excitement.toFixed(3)},holdSeconds:+holdSeconds.toFixed(3),recording:{seconds:+(replay.latest-replay.oldest).toFixed(3),samples:replay.count}};},
    dispose(){state=null;players.length=0;},
  };
}

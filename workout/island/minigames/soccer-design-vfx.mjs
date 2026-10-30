import * as T from '../vendor/three.module.js';

const root=new URL('../design/vfx/',import.meta.url);
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const smoother=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduced=()=>motionPreference?.matches===true;

function envelope(points,time){
  for(let i=1;i<points.length;i++)if(time<=points[i].time){const a=points[i-1],b=points[i];return a.opacity+(b.opacity-a.opacity)*smooth((time-a.time)/(b.time-a.time));}
  return 0;
}

/** Three atlases, three pooled sprites; no particle objects or dynamic lights. */
export function createSoccerDesignVfx(scene,{track,fetcher=globalThis.fetch,reducedMotion=reduced}={}){
  const slots=[],owned=[],controller=new AbortController(),keep=value=>track?track(value):(owned.push(value),value);let disposed=false,lastEvent=-1,lastPhase='',status='loading',active=0;
  const ready=Promise.all(['goal-burst','confetti','landing-dust'].map(async id=>{
    let texture;
    try{
      const url=new URL(`atlases/${id}.json`,root),response=await fetcher(url,{signal:controller.signal});
      if(!response.ok)throw Error(`VFX ${response.status}`);
      const data=await response.json();texture=await new T.TextureLoader().loadAsync(new URL(data.image,url).href);
      if(disposed){texture.dispose();return;}
      keep(texture);texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;
      const material=keep(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true,opacity:0,blending:data.blendMode==='additive'?T.AdditiveBlending:T.NormalBlending,toneMapped:false}));
      const sprite=new T.Sprite(material);sprite.visible=false;scene.add(sprite);
      slots.push({id,data,texture,material,sprite,age:data.durationSeconds,size:1});
    }catch{/* A missing decorative atlas cannot interrupt the match. */}
  })).then(()=>{if(!disposed)status=slots.length===3?'ready':slots.length?'partial':'unavailable';});
  function emit(id,x,y,z,size=1){
    if(disposed||reducedMotion()&&id!=='landing-dust')return false;
    for(const slot of slots)if(slot.id===id){slot.age=0;slot.size=size;slot.sprite.position.set(x,y,z);slot.sprite.visible=true;return true;}
    return false;
  }
  return {
    ready,emit,
    update(state,dt,quality=0,camera){
      if(disposed)return;
      if(state.eventId!==lastEvent){
        lastEvent=state.eventId;const event=state.event,p=state.players[event?.player??state.controlled];
        if(event?.type==='slide'&&p)emit('landing-dust',p.x,.23,p.z,.8);
      }
      if(state.phase==='goal'&&lastPhase!=='goal'&&quality<2){
        emit('goal-burst',state.ball.x,Math.max(.65,state.ball.y),state.ball.z,2.2);
        emit('confetti',state.ball.x,1.7,state.ball.z,2.8);
      }
      if(state.phase==='finished'&&lastPhase!=='finished'&&state.score[0]>state.score[1]&&quality<2){const p=state.players[state.controlled];emit('confetti',p.x,1.65,p.z,3);}
      lastPhase=state.phase;active=0;
      for(const slot of slots){
        slot.age+=Math.max(0,dt);slot.sprite.visible=quality<2&&slot.age<slot.data.durationSeconds&&!(reducedMotion()&&slot.id!=='landing-dust');
        if(!slot.sprite.visible)continue;
        const data=slot.data,frame=Math.min(data.frameCount-1,Math.floor(slot.age*data.fps)),inset=data.sampling.uvInsetPixels;
        slot.texture.repeat.set((data.frameSize.width-inset*2)/data.atlasSize.width,(data.frameSize.height-inset*2)/data.atlasSize.height);
        slot.texture.offset.set(((frame%data.columns)*data.frameSize.width+inset)/data.atlasSize.width,1-((Math.floor(frame/data.columns)+1)*data.frameSize.height-inset)/data.atlasSize.height);
        let size=slot.size;
        if(camera){const distance=camera.position.distanceTo(slot.sprite.position),height=2*distance*Math.tan(camera.fov*Math.PI/360);size=Math.min(size,height*Math.sqrt(data.lowEnd.maxScreenFractionPerInstance*camera.aspect));}
        slot.sprite.scale.setScalar(size);slot.material.opacity=envelope(data.opacityEnvelope,slot.age)*(reducedMotion()?.28:1);active++;
      }
    },
    metrics:()=>({status,active,residentAtlases:slots.length,residentBytes:slots.length*1048576}),
    dispose(){if(disposed)return;disposed=true;controller.abort();for(const slot of slots)slot.sprite.removeFromParent();for(const resource of owned)resource.dispose();owned.length=slots.length=0;active=0;}
  };
}

function hermite(a,b,ma,mb,t,d){const t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*a+(t3-2*t2+t)*d*ma+(-2*t3+3*t2)*b+(t3-t2)*d*mb;}

/** Presentation-only camera for a caller-owned recording. Never advances a match. */
export function createSoccerReplayCamera({fetcher=globalThis.fetch,reducedMotion=reduced}={}){
  const tracks=[],controller=new AbortController(),pose={position:[0,0,0],target:[0,0,0],fov:50,active:false,recordingTime:0};
  const startPosition=[0,0,0],startTarget=[0,0,0],pathPosition=[0,0,0],pathTarget=[0,0,0];
  let track=null,elapsed=0,anchorX=0,anchorZ=0,direction=1,startFov=50,disposed=false,skipAt=-1,skipPosition=[0,0,0],skipTarget=[0,0,0],skipFov=50;
  const ready=Promise.all(['left','right','behind'].map(async side=>{try{const response=await fetcher(new URL(`cameras/goal-replay-${side}.json`,root),{signal:controller.signal});if(response.ok){const data=await response.json();if(!disposed)tracks.push(data);}}catch{}}));
  function world(local,out){out[0]=anchorX-direction*local[2];out[1]=local[1];out[2]=anchorZ+direction*local[0];}
  function path(time){
    const points=track.points;let a=points[0],b=points[1];
    for(let i=1;i<points.length;i++){b=points[i];a=points[i-1];if(time<=b.time)break;}
    const d=b.time-a.time,t=clamp((time-a.time)/d);
    for(let k=0;k<3;k++){pathPosition[k]=hermite(a.position[k],b.position[k],a.positionTangent[k],b.positionTangent[k],t,d);pathTarget[k]=hermite(a.target[k],b.target[k],a.targetTangent[k],b.targetTangent[k],t,d);}
    const px=pathPosition[0],pz=pathPosition[2],tx=pathTarget[0],tz=pathTarget[2];
    pathPosition[0]=anchorX-direction*pz;pathPosition[2]=anchorZ+direction*px;pathTarget[0]=anchorX-direction*tz;pathTarget[2]=anchorZ+direction*tx;
    return hermite(a.fov,b.fov,a.fovTangent,b.fovTangent,t,d);
  }
  return {
    ready,
    start({goalX,goalZ=0,goalDirection=Math.sign(goalX)||1,position,target,fov,angle='left'}){
      if(disposed||reducedMotion())return false;
      track=tracks.find(value=>value.id===`goal-replay-${angle}`)||tracks[0];if(!track)return false;
      anchorX=goalX;anchorZ=goalZ;direction=goalDirection;elapsed=0;skipAt=-1;startFov=fov;
      for(let k=0;k<3;k++){startPosition[k]=position[k];startTarget[k]=target[k];pose.position[k]=position[k];pose.target[k]=target[k];}
      pose.fov=fov;pose.active=true;return true;
    },
    sample(dt,live){
      if(!pose.active)return pose;
      elapsed+=Math.max(0,dt);
      const entry=track.entry.durationSeconds,exit=track.exit.durationSeconds,pathDuration=track.pathDurationSeconds;
      let weight=1,fov;
      if(skipAt>=0){weight=smoother((elapsed-skipAt)/exit);for(let k=0;k<3;k++){pose.position[k]=skipPosition[k]+(live.position[k]-skipPosition[k])*weight;pose.target[k]=skipTarget[k]+(live.target[k]-skipTarget[k])*weight;}pose.fov=skipFov+(live.fov-skipFov)*weight;if(weight===1)pose.active=false;return pose;}
      if(elapsed<entry){world(track.points[0].position,pathPosition);world(track.points[0].target,pathTarget);weight=smoother(elapsed/entry);fov=track.points[0].fov;for(let k=0;k<3;k++){pose.position[k]=startPosition[k]+(pathPosition[k]-startPosition[k])*weight;pose.target[k]=startTarget[k]+(pathTarget[k]-startTarget[k])*weight;}pose.fov=startFov+(fov-startFov)*weight;pose.recordingTime=-track.replayContactPathTime;}
      else if(elapsed<entry+pathDuration){const time=pathDuration*smoother((elapsed-entry)/pathDuration);pose.fov=path(time);for(let k=0;k<3;k++){pose.position[k]=pathPosition[k];pose.target[k]=pathTarget[k];}pose.recordingTime=time-track.replayContactPathTime;}
      else {const end=track.points[track.points.length-1];world(end.position,pathPosition);world(end.target,pathTarget);weight=smoother((elapsed-entry-pathDuration)/exit);for(let k=0;k<3;k++){pose.position[k]=pathPosition[k]+(live.position[k]-pathPosition[k])*weight;pose.target[k]=pathTarget[k]+(live.target[k]-pathTarget[k])*weight;}pose.fov=end.fov+(live.fov-end.fov)*weight;pose.recordingTime=pathDuration-track.replayContactPathTime;if(weight===1)pose.active=false;}
      return pose;
    },
    skip(){if(!pose.active||skipAt>=0)return;skipAt=elapsed;skipFov=pose.fov;for(let k=0;k<3;k++){skipPosition[k]=pose.position[k];skipTarget[k]=pose.target[k];}},
    get active(){return pose.active;},
    get duration(){return track?.durationSeconds||0;},
    dispose(){disposed=true;controller.abort();pose.active=false;tracks.length=0;}
  };
}

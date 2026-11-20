import * as T from '../vendor/three.module.js';

const DEG = Math.PI / 180;
const UP = new T.Vector3(0,1,0);
const CHILD_HIP = .60;
const smooth = t => t*t*(3-2*t);

function sample(track,index){
  const a=track[Math.min(track.length-1,Math.floor(index))];
  const b=track[Math.min(track.length-1,Math.floor(index)+1)];
  return a.map((v,i)=>T.MathUtils.lerp(v,b[i],index%1));
}

/** Sample the canonical body clip and prop tracks against the room-model clock. */
export function createRescuePlayback(crew,root,clips,catalog,box){
  const actions=new Map(catalog.actions.map(action=>[action.id,action]));
  const clipById=new Map(clips.map(clip=>[clip.name,clip]));
  for(const {id,timer}of actions.values()){
    if(Math.abs((clipById.get(id)?.duration??-1)-timer.durationSeconds)>1e-5)throw new Error('Missing rescue clip '+id);
  }
  const mixer=new T.AnimationMixer(root);
  const props=new T.Group();
  crew.parent.add(props);
  const obstacle=new T.Group(),seat=new T.Group();
  props.add(obstacle,seat);
  box(obstacle,.48,.35,.38,'#a37951',0,.175,0);
  box(seat,.48,.09,.39,'#886243',0,.252,0);
  for(const x of [-.18,.18])for(const z of [-.14,.14])box(seat,.06,.22,.06,'#614830',x,.11,z);
  let playing=null;
  const from=new T.Vector3(),to=new T.Vector3(),offset=new T.Vector3(),hip=new T.Vector3();
  function place(object,frame,yaw){
    object.position.set(...frame.slice(0,3)).applyAxisAngle(UP,yaw).add(crew.position);
    object.rotation.set(frame[3]*DEG,frame[4]*DEG,frame[5]*DEG,'XYZ');
    object.quaternion.premultiply(crew.quaternion);
  }
  function childPose(root,blend){
    for(const side of ['L','R']){
      const upper=root.getObjectByName('Thigh_'+side),lower=root.getObjectByName('Shin_'+side);
      if(upper)upper.rotation.x=T.MathUtils.lerp(-.85,-.63,blend);
      if(lower)lower.rotation.x=T.MathUtils.lerp(1.4,1.2,blend);
    }
  }
  return {
    update(pose,state,friend){
      props.visible=Boolean(pose);
      if(!pose){
        if(playing){mixer.stopAllAction();playing=null;}
        return false;
      }
      const {id,elapsed,duration,exitProgress}=pose,action=actions.get(id),tracks=action.propTracks;
      const yaw=Math.atan2(state.exit[0]-state.pos[0],state.exit[2]-state.pos[2]);
      const child=Boolean(tracks.child),cat=Boolean(tracks.cat);
      const first=child ? .38 : cat ? .395 : .90;
      from.fromArray(state.pos).sub(offset.set(0,0,first).applyAxisAngle(UP,yaw));
      to.fromArray(state.exit).sub(offset.set(0,0,.45).applyAxisAngle(UP,yaw));
      crew.position.copy(from);
      if(id==='carry-arms')crew.position.lerp(to.sub(offset.set(0,0,.6).applyAxisAngle(UP,yaw)),smooth(elapsed/duration));
      else if(id==='set-down')crew.position.copy(to);
      else if(exitProgress)crew.position.lerp(to,smooth(exitProgress));
      crew.rotation.y=yaw;
      if(playing?.getClip().name!==id){
        mixer.stopAllAction();
        playing=mixer.clipAction(clipById.get(id));
        playing.reset().setLoop(T.LoopOnce,1).play();
        playing.paused=true;
      }
      playing.time=Math.min(playing.getClip().duration,elapsed);
      mixer.update(0);
      const frameIndex=elapsed*catalog.sampleRateHz;
      obstacle.visible=Boolean(tracks.obstacle);
      seat.visible=Boolean(tracks.seat);
      if(obstacle.visible)place(obstacle,sample(tracks.obstacle,frameIndex),yaw);
      if(seat.visible)place(seat,sample(tracks.seat,frameIndex),yaw);
      if(friend&&(child||cat)){
        if(friend.mode!=='rescue-action'){friend.mixer.stopAllAction();friend.mode='rescue-action';}
        const frame=sample(tracks.child||tracks.cat,frameIndex);
        place(friend.root,frame,yaw);
        if(child){
          friend.root.position.sub(hip.set(0,CHILD_HIP,0).applyQuaternion(friend.root.quaternion));
          childPose(friend.root,frame[6]??0);
        }
      }
      return true;
    },
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}
  };
}

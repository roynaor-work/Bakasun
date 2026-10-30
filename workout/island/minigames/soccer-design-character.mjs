import * as T from '../vendor/three.module.js';
import {cloneSoccerRig} from './soccer-rig.mjs';
import {createSoccerDesignLoader} from './soccer-design-loader.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const Q=a=>new T.Quaternion().fromArray(a).normalize();
const asset=path=>new URL(`../design/${path}`,import.meta.url).href;
const json=async path=>{const response=await fetch(asset(path));if(!response.ok)throw Error(`Soccer asset ${path}: ${response.status}`);return response.json();};

function validateBind(source,rig) {
  const meshes=[];source.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  for(const j of rig.joints) {
    const bone=source.getObjectByName(j.name);
    if(!bone?.isBone||bone.position.distanceTo(new T.Vector3().fromArray(j.translation))>1e-5||bone.quaternion.clone().normalize().angleTo(Q(j.rotation))>1e-5||bone.scale.distanceTo(new T.Vector3().fromArray(j.scale))>1e-5)throw Error(`Soccer GLB bind mismatch: ${j.name}`);
    for(const mesh of meshes) {
      const i=mesh.skeleton.bones.indexOf(bone);
      if(i<0||mesh.skeleton.boneInverses[i].elements.some((v,k)=>Math.abs(v-j.inverseBindMatrix[k])>1e-5))throw Error(`Soccer GLB inverse bind mismatch: ${j.name}`);
    }
  }
}

/** Compile the calibrated world-basis retarget once. Reference locomotion is
 * deliberately excluded: only the simulation may move a player in the world. */
export function compileSoccerDesignClips(data,rig,map) {
  const targets=new Map(map.bones.map(b=>[b.target,b]));
  if(targets.size!==rig.joints.length||data.skeleton.bones.some(b=>!map.bones.some(m=>m.source===b.name)))throw Error('Incomplete soccer retarget map');
  const clips=[];
  for(const [name,state] of Object.entries(data.states)) {
    const times=state.keyframes.map(k=>k.time*state.durationSeconds),values=Object.fromEntries(rig.joints.map(j=>[j.name,[]])),hips=[],root=[];
    for(const frame of state.keyframes) {
      const source={},world={};
      for(const b of data.skeleton.bones)source[b.name]=(b.parent?source[b.parent].clone():new T.Quaternion()).multiply(Q(frame.rotations[b.name]));
      for(const joint of rig.joints) {
        const entry=targets.get(joint.name);
        if(!entry||!source[entry.source||entry.inheritSource])throw Error(`Missing soccer target ${joint.name}`);
        world[joint.name]=source[entry.source||entry.inheritSource].clone().multiply(Q(entry.targetBasisWorldQuaternion));
        const local=joint.parent?world[joint.parent].clone().invert().multiply(world[joint.name]):world[joint.name].clone();
        // Keep adjacent keys on the same quaternion hemisphere for interpolation.
        const previous=values[joint.name],n=previous.length;
        if(n&&local.x*previous[n-4]+local.y*previous[n-3]+local.z*previous[n-2]+local.w*previous[n-1]<0)local.set(-local.x,-local.y,-local.z,-local.w);
        previous.push(local.x,local.y,local.z,local.w);
      }
      const h=rig.joints.find(j=>j.name==='Hips').translation,offset=frame.hipsOffsetMeters||[0,0,0];
      hips.push(...h.map((v,i)=>v+offset[i]*map.motionScale));
      root.push(0,0,0);
    }
    const tracks=rig.joints.map(j=>new T.QuaternionKeyframeTrack(`${j.name}.quaternion`,times,values[j.name]));
    tracks.push(new T.VectorKeyframeTrack('Hips.position',times,hips),new T.VectorKeyframeTrack('Root.position',times,root));
    const clip=new T.AnimationClip(name,state.durationSeconds,tracks);
    clip.userData={loop:state.loop};clips.push(clip);
  }
  return clips;
}

/** Floor correction is baked at load time, never evaluated by CPU skinning in a
 * live frame. Each character asset can have its own sole/glove geometry. */
export function bakeSoccerDesignFloor(source,clips) {
  const bones={},meshes=[],saved=[];
  source.traverse(o=>{if(o.isBone){bones[o.name]=o;saved.push({bone:o,q:o.quaternion.clone(),p:o.position.clone()});}if(o.isSkinnedMesh)meshes.push(o);});
  const point=new T.Vector3(),out=[];
  source.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(source.matrixWorld).invert();
  const minY=()=>{
    source.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();
    let low=Infinity;
    for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);low=Math.min(low,point.y);
    }
    return low;
  };
  const bindLift=-minY();
  for(const input of clips) {
    const clip=input.clone(),positions=clip.tracks.find(t=>t.name==='Root.position');
    for(let key=0;key<positions.times.length;key++) {
      for(const track of clip.tracks) {
        const [name,property]=track.name.split('.');
        if(property==='quaternion')bones[name].quaternion.fromArray(track.values,key*4);
        else bones[name].position.fromArray(track.values,key*3);
      }
      positions.values[key*3+1]=Math.max(bindLift,-minY())+.002;
    }
    clip.userData=input.userData;out.push(clip);
  }
  for(const {bone,q,p} of saved){bone.quaternion.copy(q);bone.position.copy(p);}source.updateMatrixWorld(true);
  return out;
}

/** Lightweight presentation state machine. Authored transitions determine fade
 * lengths; animation events never dispatch physics, ownership or scoring. */
export function createSoccerDesignMotion(mixer,clips,data,config) {
  const actions=Object.fromEntries(clips.map(clip=>{
    const a=mixer.clipAction(clip);a.setLoop(data.states[clip.name].loop?T.LoopRepeat:T.LoopOnce,Infinity);a.clampWhenFinished=true;return [clip.name,a];
  }));
  let state=data.initialState,previousMode=null,previousSpeed=0,previousYaw=null,kickTimer=0,stealTimer=0,lastTransition=null;
  actions[state].play();
  const change=(name,event,force=false,{at=0,rate=1,fadeSeconds}={})=>{
    if(!actions[name]||name===state&&!force)return;
    const transition=data.transitions.find(t=>(t.source===state||t.source==='*')&&t.target===name&&(!event||t.on===event));
    const fade=fadeSeconds??transition?.visualBlendSeconds??.12;
    const outgoing=actions[state],incoming=actions[name];
    if(incoming!==outgoing)outgoing.fadeOut(fade);
    incoming.reset().setEffectiveWeight(1).setEffectiveTimeScale(rate);incoming.time=at;
    if(incoming!==outgoing)incoming.fadeIn(fade);incoming.play();
    state=name;lastTransition=event||name;
  };
  return {
    actions,get state(){return state;},get lastTransition(){return lastTransition;},
    update(p,s,animation,dt) {
      if(dt<=0)return state;
      const speed=Math.hypot(p.vx,p.vz),yaw=Math.atan2(p.fx,p.fz),mode=animation.mode,turn=previousYaw===null?0:wrap(yaw-previousYaw);
      const moving=speed>(config.view.animation.idleSpeed||.2),edge=mode!==previousMode;
      const kick=(p.kickTime||0)>kickTimer+1e-6||(p.stealTime||0)>stealTimer+1e-6;
      if(mode==='celebrate'&&edge)change('celebrate','result_success');
      else if((mode==='slide'||mode==='dive')&&edge)change('fall','fall_confirmed');
      else if(mode==='recover'&&edge)change('recover','recovery_allowed');
      else if((mode==='kick'||mode==='steal')&&kick) {
        // The simulation has already released the ball. Enter immediately before
        // the authored contact, then fit only the follow-through to its existing
        // countdown. No physics release, countdown or result is delayed.
        const clip=data.states.kick,contact=clip.ballContacts?.find(c=>c.event==='visual_contact');
        const contactTime=(contact?.time??.35)*clip.durationSeconds,m=config.view.athlete?.motion||{};
        const at=Math.max(0,contactTime-(m.contactLead??.03));
        const remaining=Math.max(.08,(mode==='steal'?p.stealTime:p.kickTime)||config.ai?.kickAnimationSeconds||.42);
        change('kick','action',true,{at,rate:(clip.durationSeconds-at)/remaining,fadeSeconds:m.kickFadeIn??.025});
      }
      else if(mode==='catch'&&edge)change('catch','receive');
      else if(!['celebrate','fall','recover','kick','catch'].includes(state)||actions[state].time>=data.states[state].durationSeconds-1e-5) {
        if(mode==='celebrate'){/* Hold the authored celebration until the goal phase ends. */}
        else if(!moving&&state==='run')change('decelerate','slowing');
        else if(!moving)change('idle','stopped');
        else if(state==='run'&&Math.abs(turn)>.16)change(turn<0?'turn_left':'turn_right',turn<0?'turn_left':'turn_right');
        else if(speed<previousSpeed-.15&&state==='run')change('decelerate','slowing');
        else if(!['turn_left','turn_right','decelerate'].includes(state)||actions[state].time>=data.states[state].durationSeconds-1e-5)change('run','moving');
      }
      if(state==='run')actions.run.setEffectiveTimeScale(clamp(speed/(config.view.animation.runSpeed||4.5),.55,1.7));
      previousMode=mode;previousSpeed=speed;previousYaw=yaw;kickTimer=p.kickTime||0;stealTimer=p.stealTime||0;
      mixer.update(dt);return state;
    },
  };
}

/** Optional authored GLB path for comparison/fallback. The realistic athlete
 * remains the game's default; no textures or decoding are added to that path. */
export async function loadDesignCharacters({config,roster,scene,track=x=>x}) {
  const loader=createSoccerDesignLoader(),resources=new Set(),characters=[];
  const own=value=>(resources.add(value),track(value),value);
  let disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;for(const c of characters)c.dispose();
    for(const r of resources)r.dispose?.();resources.clear();loader.dispose();
  };
  try {
    const [player,keeper,rig,map,data]=await Promise.all([
      loader.loadAsync(asset('characters/soccer-player.glb')),loader.loadAsync(asset('characters/goalkeeper.glb')),
      json('characters/rig.json'),json('viewer/retarget-map.json'),json('motion/soccer.json'),
    ]);
    const compiled=compileSoccerDesignClips(data,rig,map),sources=[player.scene,keeper.scene];
    for(const source of sources)validateBind(source,rig);
    const clipSets=sources.map(source=>bakeSoccerDesignFloor(source,compiled));
    const height=config.view.animation.characterHeight||1.8;
    const sourceHeights=sources.map(source=>{const bounds=new T.Box3().setFromObject(source);return bounds.max.y-bounds.min.y;});
    for(const source of sources)source.traverse(o=>{if(o.isMesh){own(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])own(m);}});
    let triangles=0;
    for(let id=0;id<roster.length;id++) {
      const slot=roster[id],isKeeper=slot.role==='keeper',index=isKeeper?1:0,source=sources[index],root=cloneSoccerRig(source),pivot=new T.Group();
      root.scale.setScalar(height/sourceHeights[index]);pivot.add(root);scene.add(pivot);
      const team=slot.team===0?config.team:config.opponent;
      const tint=new T.Color(isKeeper?(config.view.athlete?.keeperColors?.[slot.team]||(slot.team===0?'#dfbb48':'#339d91')):team.colors[0]);
      root.traverse(o=>{
        if(!o.isMesh)return;
        const geometry=own(o.geometry.clone()),colors=geometry.attributes.color;
        if(colors)for(let i=0;i<colors.count;i++) {
          const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i);
          const jersey=isKeeper?r>.25&&g>r*.65&&b<g*.55:g>r*1.3&&g>b*1.08;
          if(jersey){const shade=.65+.35*Math.max(r,g,b);colors.setXYZ(i,tint.r*shade,tint.g*shade,tint.b*shade);}
        }
        const original=Array.isArray(o.material)?o.material[0]:o.material;
        o.geometry=geometry;o.material=own(original.clone());o.material.vertexColors=true;o.material.roughness=.88;o.material.metalness=0;
        o.frustumCulled=false;o.castShadow=o.receiveShadow=true;
        triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;
      });
      const mixer=new T.AnimationMixer(root),motion=createSoccerDesignMotion(mixer,clipSets[index],data,config);
      let characterDisposed=false;
      const character={design:true,root,pivot,mixer,motion,team:slot.team,keeper:isKeeper,active:data.initialState,mode:'idle',yaw:null,
        update(p,s,animation,dt){
          if(characterDisposed)return;
          const wanted=Math.atan2(p.fx,p.fz);
          if(this.yaw===null)this.yaw=wanted;else if(dt>0)this.yaw+=wrap(wanted-this.yaw)*(1-Math.exp(-dt*18));
          pivot.position.set(p.x,Math.max(0,animation.height||0),p.z);pivot.rotation.set(0,this.yaw,0);
          this.active=motion.update(p,s,animation,dt);this.mode=animation.mode;
        },
        metrics:()=>({kind:'design-glb',state:motion.state,lastTransition:motion.lastTransition,keeper:isKeeper}),
        dispose(){if(characterDisposed)return;characterDisposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);root.traverse(o=>o.skeleton?.dispose());pivot.removeFromParent();},
      };
      mixer.update(0);characters.push(character);
    }
    loader.dispose();
    return {characters,metrics:{kind:'design-glb',triangles:triangles/roster.length,eightCharacterTriangles:triangles,meshes:1,independentSkeletons:true,clips:compiled.map(c=>c.name),retarget:'calibrated-world-basis',floor:'baked-at-load',referenceRootMotion:false},dispose};
  }catch(error){dispose();throw error;}
}

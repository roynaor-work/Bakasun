import * as T from '../vendor/three.module.js';
import {cloneSoccerRig} from './soccer-rig.mjs';
import {createSoccerDesignLoader} from './soccer-design-loader.mjs';
import {loadSoccerRestartMotion} from './soccer-athlete-motion.mjs';
import {soccerMetreScale,createSoccerCharacterLod} from './soccer-scale.mjs';
import {regionForTriangle} from '../design/variants/apply-variant.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const Q=a=>new T.Quaternion().fromArray(a).normalize();
const asset=path=>new URL(`../design/${path}`,import.meta.url).href;
const json=async path=>{const response=await fetch(asset(path));if(!response.ok)throw Error(`Soccer asset ${path}: ${response.status}`);return response.json();};
const regions=['preserve','skin','hair','shirt','shorts','socks','shoes','soles','gloves','accent','equipment','helmet'];

function assignRegions(geometry,spec,map){
  const p=geometry.attributes.position,c=geometry.attributes.color,index=geometry.index,labels=new Uint8Array(p.count);
  for(let first=0;first<(index?.count||p.count);first+=3){
    const face=[0,1,2].map(k=>index?index.getX(first+k):first+k),centroid=[0,0,0];
    for(const vertex of face){centroid[0]+=p.getX(vertex)/3;centroid[1]+=p.getY(vertex)/3;centroid[2]+=p.getZ(vertex)/3;}
    const vertex=face[0],region=regionForTriangle([c.getX(vertex),c.getY(vertex),c.getZ(vertex)],centroid,spec,map.maxColorError),label=regions.indexOf(region);
    if(label<0)throw Error(`Unknown soccer character region ${region}`);
    for(const vertex of face)labels[vertex]=label;
  }
  geometry.setAttribute('soccerRegion',new T.BufferAttribute(labels,1));
}

function characterGeometry(source,palette){
  // Share positions, indices, normals and skin buffers between actors. Only
  // vertex colours vary; all actors still own independent skeleton matrices.
  const geometry=new T.BufferGeometry();geometry.setIndex(source.index);
  for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,name==='color'?attribute.clone():attribute);
  const colors=geometry.attributes.color,labels=geometry.attributes.soccerRegion;
  for(let vertex=0;vertex<colors.count;vertex++){
    const tint=palette[regions[labels.getX(vertex)]];if(tint)colors.setXYZ(vertex,tint.r,tint.g,tint.b);
  }
  geometry.boundingBox=source.boundingBox?.clone()||null;geometry.boundingSphere=source.boundingSphere?.clone()||null;
  return geometry;
}

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
  const clean=[];let cleanSaved=false;
  mixer.getRoot().traverse(bone=>{if(bone.isBone)clean.push({bone,q:bone.quaternion.clone(),p:bone.position.clone()});});
  const updateMixer=dt=>{
    if(cleanSaved)for(const pose of clean){pose.bone.quaternion.copy(pose.q);pose.bone.position.copy(pose.p);}
    mixer.update(dt);for(const pose of clean){pose.q.copy(pose.bone.quaternion);pose.p.copy(pose.bone.position);}cleanSaved=true;
  };
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
      const restart=p.restartMotion;
      if(restart&&actions[restart.kind]){
        if(state!==restart.kind){for(const action of Object.values(actions))action.stopFading().setEffectiveWeight(0);change(restart.kind,'restart-action',true,{rate:0,fadeSeconds:0});}
        const action=actions[restart.kind];action.stopFading().setEffectiveWeight(1).setEffectiveTimeScale(0);action.time=clamp(restart.elapsed,0,data.states[restart.kind].durationSeconds);
        kickTimer=p.kickTime||0;stealTimer=p.stealTime||0;previousMode=animation.mode;
        updateMixer(0);return state;
      }
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
        const requested=s.event?.type==='shot'?'kick_power':s.ball.flight?'pass_long':'pass_short',name=actions[requested]?requested:'kick';
        const clip=data.states[name],contact=clip.ballContacts?.find(c=>/strike|contact/.test(c.event));
        const contactTime=(contact?.time??.35)*clip.durationSeconds,m=config.view.athlete?.motion||{};
        const at=Math.max(0,contactTime-(m.contactLead??.03));
        const remaining=Math.max(.08,(mode==='steal'?p.stealTime:p.kickTime)||config.ai?.kickAnimationSeconds||.42);
        change(name,'action',true,{at,rate:(clip.durationSeconds-at)/remaining,fadeSeconds:m.kickFadeIn??.025});
      }
      else if(mode==='catch'&&edge)change('catch','receive');
      else if(!['celebrate','fall','recover','kick','kick_power','pass_short','pass_long','catch'].includes(state)||actions[state].time>=data.states[state].durationSeconds-1e-5) {
        const running=['run','dribble_run','defensive_jockey'].includes(state),locomotion=s.ball.owner===p.id&&actions.dribble_run?'dribble_run':s.mode==='defense'&&actions.defensive_jockey&&speed<config.view.animation.runSpeed?'defensive_jockey':'run';
        if(mode==='celebrate'){/* Hold the authored celebration until the goal phase ends. */}
        else if(!moving&&running)change('decelerate','slowing');
        else if(!moving)change('idle','stopped');
        else if(running&&Math.abs(turn)>.16)change(turn<0?'turn_left':'turn_right',turn<0?'turn_left':'turn_right');
        else if(speed<previousSpeed-.15&&running)change('decelerate','slowing');
        else if(!['turn_left','turn_right','decelerate'].includes(state)||actions[state].time>=data.states[state].durationSeconds-1e-5)change(locomotion,'moving');
      }
      if(['run','dribble_run','defensive_jockey'].includes(state))actions[state].setEffectiveTimeScale(clamp(speed/(config.view.animation.runSpeed||4.5),.55,1.7));
      previousMode=mode;previousSpeed=speed;previousYaw=yaw;kickTimer=p.kickTime||0;stealTimer=p.stealTime||0;
      updateMixer(dt);return state;
    },
  };
}

/** Optional authored GLB path for comparison/fallback. The realistic athlete
 * remains the game's default; no textures or decoding are added to that path. */
export async function loadDesignCharacters({config,roster,scene,track=x=>x,selectedKit=null}) {
  const loader=createSoccerDesignLoader(),resources=new Set(),characters=[];
  const own=value=>(resources.add(value),track(value),value);
  let disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;for(const c of characters)c.dispose();
    for(const r of resources)r.dispose?.();resources.clear();loader.dispose();
  };
  try {
    const [player,keeper,rig,map,data,regionMap]=await Promise.all([
      loader.loadAsync(asset('characters2/soccer-player.glb')),loader.loadAsync(asset('characters2/goalkeeper.glb')),
      json('characters/rig.json'),json('viewer/retarget-map.json'),loadSoccerRestartMotion(),json('characters2/regions.json'),
    ]);
    // Compile actions that have a live simulation mapping. Other extension
    // states remain in the merged library without an expensive unused floor bake.
    const active=new Set(['idle','run','decelerate','turn_left','turn_right','kick','catch','celebrate','fall','recover','throwIn','corner','goalKick','keeperThrow','keeperPunt','dribble_run','defensive_jockey','pass_short','pass_long','kick_power']);
    const compiled=compileSoccerDesignClips({...data,states:Object.fromEntries(Object.entries(data.states).filter(([name])=>active.has(name)))},rig,map),sources=[player.scene,keeper.scene];
    for(const source of sources)validateBind(source,rig);
    const clipSets=sources.map(source=>bakeSoccerDesignFloor(source,compiled));
    const height=config.view.animation.characterHeight||1.8;
    const sourceHeights=sources.map(source=>{
      source.updateMatrixWorld(true);source.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
      const bounds=new T.Box3().setFromObject(source);return bounds.max.y-bounds.min.y;
    });
    const lodGeometry=new Map();
    sources.forEach((source,sourceIndex)=>source.traverse(o=>{
      if(!o.isMesh)return;
      const spec=regionMap.models[sourceIndex?'goalkeeper':'soccer-player'];assignRegions(o.geometry,spec,regionMap);
      // 40 cells along the source body retain silhouette and source colour/skin
      // boundaries. Full v2 remains available for close/high-quality comparison.
      lodGeometry.set(o.geometry,own(createSoccerCharacterLod(o.geometry,sourceHeights[sourceIndex]/40)));
    }));
    for(const source of sources)source.traverse(o=>{if(o.isMesh){own(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])own(m);}});
    let triangles=0,lowTriangles=0;
    for(let id=0;id<roster.length;id++) {
      const slot=roster[id],isKeeper=slot.role==='keeper',index=isKeeper?1:0,source=sources[index],root=cloneSoccerRig(source),pivot=new T.Group();
      root.scale.setScalar(soccerMetreScale(sourceHeights[index],height));pivot.add(root);scene.add(pivot);
      const team=slot.team===0?config.team:config.opponent;
      const appearance=config.view.appearance||{},pick=(name,fallback)=>appearance[name]?.[id%(appearance[name]?.length||1)]||fallback;
      const kit=slot.team===0&&!isKeeper?selectedKit:null;
      const palette=Object.fromEntries(Object.entries({skin:pick('skin','#bf8054'),hair:pick('hair','#263443'),shirt:isKeeper?(config.view.athlete?.keeperColors?.[slot.team]||(slot.team===0?'#dfbb48':'#339d91')):(kit?.primary||team.colors[0]),shorts:kit?.shorts||team.colors[1],socks:kit?.socks||pick('socks','#f2f4ee')}).map(([name,hex])=>[name,new T.Color(hex)]));
      const fullMeshes=[],lowMeshes=[];root.traverse(o=>{if(o.isMesh)fullMeshes.push(o);});
      for(const o of fullMeshes){
        const originalGeometry=o.geometry,geometry=own(characterGeometry(originalGeometry,palette));
        const original=Array.isArray(o.material)?o.material[0]:o.material;
        o.geometry=geometry;o.material=own(original.clone());o.material.vertexColors=true;o.material.roughness=.88;o.material.metalness=0;
        o.frustumCulled=false;o.castShadow=o.receiveShadow=true;
        triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;
        const low=o.clone(false);low.name=o.name+'LOD1';low.geometry=own(characterGeometry(lodGeometry.get(originalGeometry),palette));low.visible=false;o.parent.add(low);lowMeshes.push(low);
        lowTriangles+=(low.geometry.index?.count||low.geometry.attributes.position.count)/3;
      }
      const mixer=new T.AnimationMixer(root),motion=createSoccerDesignMotion(mixer,clipSets[index],data,config);
      let characterDisposed=false;
      let lod=0;
      const character={design:true,root,pivot,mixer,motion,team:slot.team,keeper:isKeeper,active:data.initialState,mode:'idle',yaw:null,restartContactMap:map,
        setLod(level){lod=level>0?1:0;fullMeshes.forEach(o=>o.visible=lod===0);lowMeshes.forEach(o=>o.visible=lod===1);return lod;},
        update(p,s,animation,dt){
          if(characterDisposed)return;
          const wanted=Math.atan2(p.fx,p.fz);
          if(this.yaw===null)this.yaw=wanted;else if(dt>0)this.yaw+=wrap(wanted-this.yaw)*(1-Math.exp(-dt*18));
          pivot.position.set(p.x,Math.max(0,animation.height||0),p.z);pivot.rotation.set(0,this.yaw,0);
          this.active=motion.update(p,s,animation,dt);this.mode=animation.mode;
        },
        metrics:()=>({kind:'design-glb-v2',state:motion.state,lastTransition:motion.lastTransition,keeper:isKeeper,lod,heightMetres:height}),
        dispose(){if(characterDisposed)return;characterDisposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);root.traverse(o=>o.skeleton?.dispose());pivot.removeFromParent();},
      };
      mixer.update(0);characters.push(character);
    }
    loader.dispose();
    return {characters,metrics:{kind:'design-glb-v2',source:'design/characters2',triangles:triangles/roster.length,eightCharacterTriangles:triangles,economyCharacterTriangles:lowTriangles/roster.length,meshes:1,lod:0,lodCount:2,independentSkeletons:true,clips:compiled.map(c=>c.name),retarget:'calibrated-world-basis',floor:'baked-at-load',referenceRootMotion:false,heightMetres:height},dispose};
  }catch(error){dispose();throw error;}
}

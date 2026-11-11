/** Island Pro Basketball — the tall bodies and the v9 motion library (Codex packages hoops-tall-v1 and hoops-motion-v9, 08/11).
 * Three bodies (guard 1.88, wing 1.98, centre 2.08 m, 18 bones, 6.2K triangles, one draw call each after the merge) and the 83 authored clips of
 * the v9 library, played by a motion state machine of its own: gaits by speed with the authored reference speed of every gait, the dribble with
 * its authored ball track (the ball reaches the floor), the defensive stance and slide, the step-and-a-half with its events
 * (gather, long step, short step, takeoff, release, land), the dunk calibrated so the palm clears the rim by 25 cm, shots, rebounds, blocks,
 * steals, crossovers. The passes and receptions are the v8 pack on the same rig. The simulation stays in charge of the ball and of the
 * result: the clips are timed against the engine's own act times. `?hoopsTall=0` returns to the v7 bodies. Pure helpers need no WebGL. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {loadV8Motion,buildV8Clips,chooseV8Motion,createDribbleGuard,v8MotionEnabled} from './hoops-v8-motion.mjs';
import {splitClip} from './hoops-v7.mjs';
import {athletesEnabled,unifyTallPack,createHeading,stepHeading} from './athletes-gait.mjs';

export const TALL_PROFILES=Object.freeze(['guard','wing','center']);
export const TALL_BONES=Object.freeze(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};

/** ?hoopsTall=0 switches the tall bodies off, ?hoopsTall=1 forces them when configured, otherwise the config decides (quality 1 and up). */
export function tallEnabled(cfg,params,quality=2){
 const q=params?.get?.('hoopsTall');
 if(q==='0')return false;if(q==='1')return !!cfg?.tall;
 return !!(cfg?.tall&&cfg.tall.enabled!==false&&quality>=(cfg.tall.minQuality??1));
}
export const tallProfileFor=(cfg,pos)=>cfg.posProfile?.[pos]||'wing';

function decode64(text,Type){
 const bin=typeof atob==='function'?atob(text):Buffer.from(text,'base64').toString('binary'),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Type(bytes.buffer);
}
/** motion.json → typed arrays. Throws on a pack that is not the 18-bone one. */
export function decodeTallPack(json){
 if(!json||json.version!==1||!json.clips||!json.profiles)throw Error('Basketball tall motion pack is malformed');
 if(json.bones?.join()!==TALL_BONES.join())throw Error('Basketball tall motion pack has another rig');
 const clips={};
 for(const [id,c] of Object.entries(json.clips)){
  const q=decode64(c.quat,Int16Array),h=decode64(c.hips,Int16Array);
  if(q.length!==c.frames*TALL_BONES.length*4||h.length!==c.frames*3)throw Error('Basketball tall clip is truncated: '+id);
  const quat=new Float32Array(q.length),hips=new Float32Array(h.length);for(let i=0;i<q.length;i++)quat[i]=q[i]/32767;for(let i=0;i<h.length;i++)hips[i]=h[i]/10000;
  let ball=null;if(c.ball){const b=decode64(c.ball,Int16Array);ball=new Float32Array(b.length);for(let i=0;i<b.length;i++)ball[i]=b[i]/10000;}
  clips[id]={id,duration:c.duration,frames:c.frames,loop:c.loop,kind:c.kind,events:c.events||{},refSpeed:c.refSpeed,quat,hips,ball,jumpScale:c.jumpScale||null,timeScale:c.timeScale||1,score:c.score??null};
 }
 return {fps:json.fps,profiles:json.profiles,clips};
}
export const TALL_REQUIRED=Object.freeze(['idle_ready','idle_ready_ball','walk','jog','run','sprint','dribble_walk_right','dribble_right','jog_ball','run_ball','sprint_ball','defensive_stance','defensive_slide_left','defensive_slide_right','closeout','layup_left','layup_right','dunk_one_hand','dunk_two_hands','jump_shot','three_point','free_throw','block_two_hands','rebound_jump','steal_poke','dribble_crossover_left','dribble_crossover_right','pivot_reverse_left','pivot_reverse_right','get_up_front','celebrate_fist','celebrate_chest','celebrate_jump','celebrate_point']);

/** AnimationClips for one body. Hips = the body's own rest + the clip's offset; only the positive lift of the dunks is calibrated (the package's
 * `jumpScale` for that body: the palm clears the rim by 25 cm); every other clip keeps its authored lift, so the jump comes from the clip. */
export function buildTallClips(pack,profile){
 const out=new Map(),rest=pack.profiles[profile].hips;
 for(const [id,c] of Object.entries(pack.clips)){
  const n=c.frames,times=new Float32Array(n);for(let f=0;f<n;f++)times[f]=f/pack.fps;
  const tracks=[];
  TALL_BONES.forEach((name,bi)=>{const v=new Float32Array(n*4);for(let f=0;f<n;f++)for(let k=0;k<4;k++)v[f*4+k]=c.quat[(f*TALL_BONES.length+bi)*4+k];tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,v));});
  const hv=new Float32Array(n*3),js=c.jumpScale?.[profile]??1;
  for(let f=0;f<n;f++){const y=c.hips[f*3+1];hv[f*3]=rest[0]+c.hips[f*3];hv[f*3+1]=rest[1]+(y>0?y*js:y);hv[f*3+2]=rest[2]+c.hips[f*3+2];}
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position',times,hv));
  out.set(id,new THREE.AnimationClip(id,(n-1)/pack.fps,tracks));
 }
 return out;
}

// ---- the plan: which clip, and where in it ----------------------------------------------------
const GAITS=[['idle_ready',0],['walk',1.35],['jog',2.7],['run',4.6],['sprint',6.8]];
const DRIBBLE_GAITS=[['dribble_walk_right',1.2],['jog_ball',2.7],['run_ball',4.6],['sprint_ball',6.8]];
/** The gait for a speed: the nearest authored reference speed in a log scale (so the cadence stays within a narrow band of the clip's own), with
 * 12% hysteresis around the current choice so it does not flicker at the edges. `list` is GAITS or DRIBBLE_GAITS. */
export function pickGait(list,speed,current=null){
 const idleEdge=current==='idle_ready'||current==='idle_ready_ball'?.5:.3;
 if(list===GAITS&&speed<idleEdge)return 'idle_ready';
 let best=list[0][0],bd=Infinity;
 for(const [name,ref] of list){if(!ref)continue;const d=Math.abs(Math.log(Math.max(.05,speed)/ref))*(name===current?.88:1);if(d<bd){bd=d;best=name;}}
 return best;
}
/** Playback rate for a gait: the clip's own reference speed (the v12 repair slows some gaits, so the rate climbs up to 1.45 x its timeScale). */
export const gaitRate=(speed,ref,max=1.45)=>clamp(speed/Math.max(.1,ref),.5,max);
const clipRef=(pack,name,ref)=>pack?.clips?.[name]?.refSpeed||ref,clipMax=(pack,name)=>1.45*(pack?.clips?.[name]?.timeScale||1);
export const GAIT_TABLE=Object.freeze({gaits:GAITS,dribble:DRIBBLE_GAITS});

/** Piecewise-linear clip time for an engine act time through anchors [[engineT, clipT], ...] (sorted); held at the end. */
export function warp(anchors,t){
 if(t<=anchors[0][0])return anchors[0][1];
 for(let i=1;i<anchors.length;i++){const [t1,c1]=anchors[i],[t0,c0]=anchors[i-1];if(t<=t1)return c0+(c1-c0)*(t-t0)/Math.max(1e-6,t1-t0);}
 return anchors[anchors.length-1][1];
}
const ev=(clip,name,i=0)=>clip.events[name]?.[i];
/** Anchors for a shot: the engine's takeoff, release and landing against the clip's events. The approach before the takeoff plays at most
 * 1.6x faster than authored (the clip starts later in its own approach when the engine's is shorter). `eng` = {release, duration, shotAir, lift}. */
export function shotAnchors(clip,type,eng){
 const rel=eng.release,dur=eng.duration,cr=ev(clip,'release'),cd=clip.duration;
 if(type==='ft')return [[0,Math.max(0,cr-rel*1.6)],[rel,cr],[dur,Math.min(cd,cr+(dur-rel))]];
 const lift=type==='layup'||type==='dunk'?.32:.22,mult=type==='dunk'?1.35:type==='layup'?1.2:1;
 const takeoffE=Math.max(.05,rel-lift-.12),landE=takeoffE+eng.shotAir*mult,ct=ev(clip,'takeoff'),cl=ev(clip,'land');
 const t0=Math.max(0,ct-takeoffE*1.6);
 return [[0,t0],[takeoffE,ct],[rel,cr],[landE,cl],[Math.max(dur,landE+.1),Math.min(cd-.001,cl+.35)]];
}

/** Layup hand from the side of the basket the shooter comes from (right hand from the right side). `facing` is p.face, (dx,dz) = rim minus player. */
export function layupSide(face,dx,dz){
 // the shooter's left vector is (cos f, -sin f); the rim's left component says which side of him the rim is on
 const leftOfRim=dx*Math.cos(face)-dz*Math.sin(face);
 return leftOfRim>0?'right':'left';
}

/** The motion plan for an engine player. Pure. `st` is the avatar's own state {gait, dribbleGait, cross, spin, celebrate, stumbleT, guardLocked, jumpClip}.
 * Returns {kind:'full'|'layer'|'v8', clip|upper+lower, t?, rate?, loop, ownsJump}. */
export function chooseTallMotion(pack,p,ctx,st){
 const speed=Math.hypot(p.vx||0,p.vz||0),face=p.face||0,fwd=(p.vx||0)*Math.sin(face)+(p.vz||0)*Math.cos(face),lat=(p.vx||0)*Math.cos(face)-(p.vz||0)*Math.sin(face);
 if(p.stumble)return {kind:'full',clip:'get_up_front',t:Math.min(pack.clips.get_up_front.duration-.01,st.stumbleT||0),ownsJump:false};
 const act=p.act;
 if(act==='shoot'){
  const type=p.shotType,anim=ctx.engineAnim||{},key=type==='ft'?'freethrow':type==='dunk'?'layup':type;
  const meta=anim[key]||{release:.8,duration:1.5},rel=meta.release*(type==='dunk'?.92:1);
  const dist=ctx.rimDist??5,three=type!=='dunk'&&type!=='layup'&&type!=='ft'&&dist>=6.3;
  const name=type==='dunk'?(st.dunkOne?'dunk_one_hand':'dunk_two_hands'):type==='layup'?'layup_'+(ctx.layupSide||'right'):type==='ft'?'free_throw':three?'three_point':'jump_shot';
  const clip=pack.clips[name]||pack.clips.jump_shot;
  const anchors=shotAnchors(clip,type,{release:rel,duration:meta.duration,shotAir:ctx.shotAir??.62});
  // a held jump shot waits at the gather until the engine lets the ball go
  let t=warp(anchors,p.actT||0);if(p.hasBall&&type!=='ft')t=Math.min(t,ev(clip,'release')-.012);
  return {kind:'full',clip:clip.id,t,ownsJump:type!=='ft'};
 }
 if(act==='fake')return {kind:'full',clip:'jump_shot',t:.38*Math.sin(Math.PI*clamp((p.actT||0)/.52,0,1))+.2,ownsJump:false};
 if(act==='cross')return {kind:'full',clip:'dribble_crossover_'+(st.cross?'left':'right'),t:.2+(p.actT||0)*1.64,ownsJump:false};
 if(act==='spin')return {kind:'full',clip:'pivot_reverse_'+(st.spin?'left':'right'),t:.1+(p.actT||0)*1.6,ownsJump:false};
 if(act==='block'){const c=pack.clips.block_two_hands;return {kind:'full',clip:'block_two_hands',t:Math.min(c.duration-.01,ev(c,'takeoff')-.1+(p.actT||0)*1.1),ownsJump:true};}
 if(act==='rebound'){const c=pack.clips.rebound_jump;return {kind:'full',clip:'rebound_jump',t:Math.min(c.duration-.01,ev(c,'takeoff')-.08+(p.actT||0)),ownsJump:true};}
 if(act==='steal'){const c=pack.clips.steal_poke,reach=ctx.stealReach??.14,po=ev(c,'poke');return {kind:'full',clip:'steal_poke',t:(p.actT||0)<reach?po-.3+(p.actT||0)/reach*.3:Math.min(c.duration-.01,po+((p.actT||0)-reach)),ownsJump:false};}
 if(act==='pass'||(ctx.catching&&!p.hasBall)){
  const v8=ctx.v8pack?chooseV8Motion(ctx.v8pack,p,ctx,ctx.v8s,ctx.dt):null;
  if(v8)return {kind:'v8',clip:v8.full,t:v8.t,ownsJump:false};
 }
 if(st.celebrate>0&&!act)return {kind:'full',clip:st.celebrateClip,t:Math.min(pack.clips[st.celebrateClip].duration-.01,2.2-st.celebrate),ownsJump:true};
 if(ctx.defending&&!p.hasBall){
  if(speed<.4)return {kind:'loop',clip:'defensive_stance',rate:1,group:'def'};
  if(Math.abs(lat)>Math.abs(fwd)*.8&&speed<4.2)return {kind:'loop',clip:'defensive_slide_'+(lat>0?'left':'right'),rate:clamp(speed/.55,.8,1.7),group:'def'};
  if(fwd>2&&speed<4.5&&ctx.nearHandler)return {kind:'loop',clip:'closeout',rate:clamp(speed/.9,.8,1.6),group:'def',closeout:true};
 }
 // moving sideways relative to where he faces: the sideways clips (a forward gait played over a sideways move is the "walks sideways" look;
 // measured: about half of the moving frames of a game have the sideways component bigger than the forward one)
 if(speed>.8&&speed<5&&Math.abs(lat)>Math.abs(fwd)*1.1){
  if(!p.hasBall)return {kind:'loop',clip:'defensive_slide_'+(lat>0?'left':'right'),rate:clamp(speed/.55,.8,1.7),group:'def',sideways:true};
  if(p.dribbling!==false&&!st.guardLocked&&speed<3.5)return {kind:'loop',clip:'dribble_'+(lat>0?'left':'right'),rate:clamp(speed/1.05,.6,1.4),group:'dribble',dribble:true,sideways:true};
 }
 if(p.hasBall){
  if(p.dribbling!==false&&!st.guardLocked){
   if(speed<.3)return {kind:'layer',upper:'dribble_right',lower:'idle_ready_ball',rate:1,group:'dribble'};
   const g=pickGait(DRIBBLE_GAITS,speed,st.dribbleGait);return {kind:'loop',clip:g,rate:gaitRate(speed,clipRef(pack,g,DRIBBLE_GAITS.find(x=>x[0]===g)[1]),clipMax(pack,g)),group:g==='dribble_walk_right'?'dribble':'gait',dribble:true};
  }
  if(speed<.3)return {kind:'loop',clip:'idle_ready_ball',rate:1,group:'idle'};
 }
 const g=pickGait(GAITS,speed,st.gait);
 if(g==='idle_ready')return {kind:'loop',clip:'idle_ready',rate:1,group:'idle'};
 return {kind:'loop',clip:g,rate:gaitRate(speed,clipRef(pack,g,GAITS.find(x=>x[0]===g)[1]),clipMax(pack,g)),group:'gait'};
}

/** Ball-bounce phase for the view (floor contact at u = 0.42, the convention of the dribble code), from the clip's own events. */
export function bouncePhase(clip,t){
 const C=clip.events.contact||[],B=clip.events.bounce||[];if(!C.length||!B.length)return null;
 const d=clip.duration,x=((t%d)+d)%d;
 const cs=[...C.map(v=>v-d),...C,...C.map(v=>v+d)],bs=[...B.map(v=>v-d),...B,...B.map(v=>v+d)];
 let tc=-Infinity,tn=Infinity;for(const c of cs){if(c<=x&&c>tc)tc=c;if(c>x&&c<tn)tn=c;}
 let tb=null;for(const b of bs)if(b>tc&&b<tn){tb=b;break;}
 if(tb==null)return null;
 return x<tb?.42*(x-tc)/Math.max(1e-6,tb-tc):.42+.58*(x-tb)/Math.max(1e-6,tn-tb);
}
export function ballAt(clip,t,out=[0,0,0]){
 if(!clip.ball)return null;
 const d=clip.duration,f=clamp(((t%d)+d)%d*30,0,clip.frames-1.001),i=Math.floor(f),u=f-i,b=clip.ball;
 for(let k=0;k<3;k++)out[k]=b[i*3+k]+(b[(i+1)*3+k]-b[i*3+k])*u;return out;
}

// ---- loading ------------------------------------------------------------------------------------
const KIT_RANGES={uniform_primary:'primary',uniform_secondary:'secondary',uniform_trim:'trim'};
const SKIN_TINTS=[[1,1,1],[.9,.84,.8],[.74,.64,.58],[.56,.47,.42],[.97,.93,.88],[.82,.72,.64]];
/** The nine primitives of a body become one SkinnedMesh with one material (the atlas) and a vertex colour per primitive (the material colour of the
 * glTF), so the three uniform parts can take any team colours. `ranges` says which vertices are which. */
export function mergeTallBody(scene){
 const skinned=[];scene.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});
 if(!skinned.length)throw Error('Basketball tall body has no skin');
 const bones=new Set();scene.traverse(o=>{if(o.isBone)bones.add(o.name);});
 for(const b of TALL_BONES)if(!bones.has(b))throw Error('Basketball tall body lacks bone '+b);
 const parts=[],ranges={};let offset=0,map=null;
 for(const m of skinned){
  const src=m.geometry,g=new THREE.BufferGeometry();
  // plain float32 attributes and a 32-bit index (the glTF primitives come with mixed integer / quantised types that do not merge)
  for(const n of ['position','normal','uv','skinIndex','skinWeight']){const a=src.attributes[n];if(!a)continue;const f=new Float32Array(a.count*a.itemSize);
   for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)f[i*a.itemSize+k]=k===0?a.getX(i):k===1?a.getY(i):k===2?a.getZ(i):a.getW(i);g.setAttribute(n,new THREE.BufferAttribute(f,a.itemSize));}
  if(src.index)g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array),1));
  const count=g.attributes.position.count,col=m.material.color,c=new Float32Array(count*3);for(let i=0;i<count;i++){c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;}
  g.setAttribute('color',new THREE.BufferAttribute(c,3));
  ranges[m.material.name]=[offset,count];offset+=count;parts.push(g);map=map||m.material.map;
 }
 const merged=mergeGeometries(parts,false);if(!merged)throw Error('Basketball tall body does not merge');
 const base=Float32Array.from(merged.attributes.color.array);
 const material=new THREE.MeshStandardMaterial({map,vertexColors:true,roughness:.62,metalness:0});
 const mesh=new THREE.SkinnedMesh(merged,material);mesh.name='tall-body';mesh.frustumCulled=false;mesh.castShadow=true;
 mesh.bind(skinned[0].skeleton,skinned[0].bindMatrix);skinned[0].parent.add(mesh);
 for(const m of skinned){m.parent.remove(m);}
 for(const g of parts)g.dispose();
 return {scene,mesh,ranges,base,material};
}

function releaseTall(body){body.mesh.geometry.dispose();body.material.dispose();body.material.map?.dispose();}

/** The three bodies and the pack. Throws on any failure (the caller falls back to the v7 bodies). The v8 pack (passes, receptions) is optional. */
export async function loadTall(cfg,base,onProgress,{params,onFallback}={}){
 const t=cfg.tall;if(!t?.profiles)throw Error('Basketball tall is not configured');
 const loader=new GLTFLoader(),bodies={},dir=t.base;let done=0;const tick=()=>onProgress?.(++done/(TALL_PROFILES.length+1));
 const pr=await fetch(new URL(dir+t.motion,base));if(!pr.ok)throw Error('Basketball tall motion pack '+pr.status);
 const pack=decodeTallPack(await pr.json());tick();
 for(const n of TALL_REQUIRED)if(!pack.clips[n])throw Error('Basketball tall clip missing: '+n);
 const results=await Promise.allSettled(TALL_PROFILES.map(async p=>{const g=await loadHoopsGLTF(loader,new URL(dir+t.profiles[p],base).href);bodies[p]=mergeTallBody(g.scene);tick();}));
 const failed=results.find(r=>r.status==='rejected');if(failed){for(const b of Object.values(bodies))releaseTall(b);throw failed.reason;}
 // unified athletes (09/11): the soccer gait arms and lean on every walk, jog, run and sprint, and the arm cap on idles, braking and cuts. ?athletes=0 skips it.
 let unified=null;
 if(t.athletes&&athletesEnabled(t,params||'')){
  try{const dr=await fetch(new URL(t.athletes.donor,base));if(!dr.ok)throw Error('Gait donor '+dr.status);unified=unifyTallPack(pack,await dr.json());}
  catch(error){unified=null;onFallback?.('athletes',error);}
 }
 let v8=null;
 if(v8MotionEnabled(cfg,params)){try{v8=await loadV8Motion(cfg,base);}catch(error){v8=null;onFallback?.('v8 motion',error);}}
 const clips={};for(const p of TALL_PROFILES){clips[p]=buildTallClips(pack,p);if(v8)for(const [n,c] of buildV8Clips(THREE,v8,pack.profiles[p].hips))clips[p].set(n,c);}
 return {tall:true,pack,v8,unified,bodies,clips:new Map(),clipSets:clips,baseHeights:t.baseHeights,posProfile:t.posProfile,
  dispose(){for(const b of Object.values(bodies))releaseTall(b);}};
}

// ---- the avatar ---------------------------------------------------------------------------------
export function createAvatarTall(assets,card,teamLook,opts={}){
 const profile=tallProfileFor({posProfile:assets.posProfile},card.pos),src=assets.bodies[profile],pack=assets.pack,clipSet=assets.clipSets[profile];
 // the shared athlete body (hoops-athlete.mjs) supplies the root, materials, palms and kit instead of the merged tall mesh
 const body=assets.bodyFactory?assets.bodyFactory(profile,card,teamLook,opts):null;
 const root=body?body.root:cloneSkinned(src.scene);root.name='player-'+card.id;if(!body)root.userData.characterVersion=9;
 const baseH=assets.baseHeights?.[profile]||pack.profiles[profile].height*100,scale=(card.ratings?.height||baseH)/baseH;if(body)root.scale.multiplyScalar(scale);else root.scale.setScalar(scale);
 root.rotation.order='YXZ';
 const mesh=body?null:root.getObjectByName('tall-body'),geometry=body?null:new THREE.BufferGeometry();
 if(!body){for(const [n,a] of Object.entries(mesh.geometry.attributes))geometry.setAttribute(n,n==='color'?a.clone():a);geometry.setIndex(mesh.geometry.index);mesh.geometry=geometry;}
 const material=body?null:mesh.material.clone();if(!body)mesh.material=material;const mats=body?body.mats:[material];
 const bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 const hands={},palms=pack.profiles[profile].palms;
 for(const [side,key] of [['Right','r'],['Left','l']]){
  if(body){hands[key]=body.palms[key];hands[key+'Wrist']=body.palms[key+'Wrist'];continue;}
  const a=new THREE.Object3D();a.name=side+'Palm';const pp=palms?.[side+'Hand']?.palmPoint||pack.profiles[profile].palm;a.position.fromArray(pp);bones[side+'Hand'].add(a);hands[key]=a;hands[key+'Wrist']=bones[side+'Hand'];
 }
 // kit colours and the skin tone live in the vertex colours of this avatar's own copy
 const variant=Math.abs(card.look?.skin??card.number??0)%SKIN_TINTS.length,tint=SKIN_TINTS[variant];
 const colors=geometry?.attributes.color;
 const paint=(name,c)=>{const r=src?.ranges[name];if(!r||!colors)return;for(let i=r[0];i<r[0]+r[1];i++)colors.setXYZ(i,c.r,c.g,c.b);};
 const skin=src?.ranges.human_surface;if(skin&&colors)for(let i=skin[0];i<skin[0]+skin[1];i++)colors.setXYZ(i,src.base[i*3]*tint[0],src.base[i*3+1]*tint[1],src.base[i*3+2]*tint[2]);
 const mixer=new THREE.AnimationMixer(root),actions={},cur={full:{},upper:{},lower:{},mix:1};
 const clipData=id=>pack.clips[id];
 function action(name){
  if(actions[name])return actions[name];
  let clip=clipSet.get(name);
  if(!clip&&/^[UL]:/.test(name)){const base=clipSet.get(name.slice(2));if(!base)return null;clip=splitClip(base,name[0]==='U'?'upper':'lower',name);}
  if(!clip)return null;
  const a=mixer.clipAction(clip);a.enabled=true;a.setEffectiveWeight(0);a.setLoop(THREE.LoopRepeat,Infinity);a.paused=true;a.play();actions[name]=a;return a;
 }
 const times={},st={gait:null,dribbleGait:null,cross:false,spin:false,celebrate:0,celebrateClip:'celebrate_fist',stumbleT:0,guardLocked:false,dunkOne:(card.number||0)%2===0};
 const guard=createDribbleGuard(),v8s={releasedAt:null,passClip:null,recvClip:null,recvSince:null};
 const heading=createHeading(0);let headingReady=false;
 let gaitPhase=0,state='idle',statePhase=0,lastAct=null,dribbleSrc=null,ownsJump=false;
 const dur=name=>clipSet.get(name)?.duration||1;
 function easeWeights(map,name,tau,dt){const k=1-Math.exp(-dt/tau);let sum=0;for(const n of new Set([...Object.keys(map),...(name?[name]:[])])){const g=n===name?1:0,v=(map[n]||0)+(g-(map[n]||0))*k;if(v<.004&&g===0)delete map[n];else{map[n]=v;sum+=v;}}return sum;}
 const av={root,hands,mixer,actions,mats,card,kind:body?'athlete':'tall',role:profile,scale,dribblePump:0,dribbleCtx:null,layupSideFor:layupSide,body,
  setLod(level){return body?body.setLod(level):0;},get lod(){return body?body.lod:0;},
  applyKit(kit){
   if(body){body.applyKit(kit);return;}
   const primary=new THREE.Color(kit.base||'#5b38c9'),accent=new THREE.Color(kit.accent||'#f4d377'),secondary=kit.shorts?new THREE.Color(kit.shorts):primary.clone().multiplyScalar(.62);
   paint('uniform_primary',primary);paint('uniform_secondary',secondary);paint('uniform_trim',accent);colors.needsUpdate=true;
  },
  event(e){
   const type=typeof e==='string'?e:e?.type;
   if(type==='score'||type==='result_success'){st.celebrate=2.2;st.celebrateClip=['celebrate_fist','celebrate_chest','celebrate_jump','celebrate_point'][Math.floor(Math.random()*4)];}
   else if(type==='catch'||type==='interception')st.catchUntil=performance.now()+420;
  },
  get motionState(){return state;},get motionPhase(){return statePhase;},get dribbleLocked(){return guard.locked;},
  /** The authored ball of the current dribble (the bounce reaches the floor, hand and floor in step), world space; null when no dribble clip plays. */
  dribbleBallWorld(out){
   if(!dribbleSrc)return null;const l=ballAt(dribbleSrc.clip,dribbleSrc.t);if(!l)return null;
   out.set(l[0],l[1],l[2]);return root.localToWorld(out);
  },
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);if(body){body.dispose();return;}for(const m of mats)m.dispose();geometry.dispose();},
 };
 av.pose=function(p,ctx={},dt){
  if(!(dt>0))return;dt=Math.min(.05,dt);
  guard.observe(p);st.guardLocked=guard.locked;
  if(p.stumble)st.stumbleT+=dt;else st.stumbleT=0;
  if(st.celebrate>0){st.celebrate-=dt;if(p.act||p.stumble)st.celebrate=0;}
  if(p.act==='cross'&&lastAct!=='cross')st.cross=!st.cross;
  if(p.act==='spin'&&lastAct!=='spin')st.spin=!st.spin;
  lastAct=p.act;
  const catching=ctx.catching||performance.now()<(st.catchUntil||0);
  const plan=chooseTallMotion(pack,p,{...ctx,catching,v8pack:assets.v8,v8s,dt},st);
  // weights and times: a layered plan is the upper and lower halves of two clips; everything else is one clip (full-body)
  const layered=plan.kind==='layer';
  cur.mix+=((layered?0:1)-cur.mix)*(1-Math.exp(-dt/(plan.kind==='loop'?.12:.07)));
  const fullName=layered?null:plan.clip,upName=layered?'U:'+plan.upper:null,loName=layered?'L:'+plan.lower:null,tau=plan.kind==='loop'?.12:.07;
  const sF=easeWeights(cur.full,fullName,tau,dt),sU=easeWeights(cur.upper,upName,tau,dt),sL=easeWeights(cur.lower,loName,tau,dt);
  for(const n in actions)actions[n].setEffectiveWeight(0);
  const apply=(map,sum,k)=>{for(const [n,w] of Object.entries(map)){const a=action(n);if(a)a.setEffectiveWeight(w/sum*k);}};
  if(sF>0)apply(cur.full,sF,cur.mix);if(sU>0)apply(cur.upper,sU,1-cur.mix);if(sL>0)apply(cur.lower,sL,1-cur.mix);
  // times: gaits share one phase (a swap between jog and run keeps the foot), other loops keep their own, one-shots take the planned time
  const advance=(name,rate)=>{const d=dur(name.replace(/^[UL]:/,''));times[name]=((times[name]||0)+dt*rate)%d;return times[name];};
  if(plan.kind==='loop'&&plan.group==='gait'){gaitPhase=(gaitPhase+dt*plan.rate/dur(plan.clip))%1;}
  const setT=(name,t)=>{const a=action(name);if(a){a.time=Math.min(a.getClip().duration-.001,Math.max(0,t));times[name]=a.time;}};
  for(const n of new Set([...Object.keys(cur.full),...Object.keys(cur.upper),...Object.keys(cur.lower)])){
   const a=action(n);if(!a)continue;const d=a.getClip().duration,base=n.replace(/^[UL]:/,''),data=clipData(base);
   if(n===fullName||n===upName||n===loName){
    if(plan.kind==='loop'){a.time=plan.group==='gait'?gaitPhase*d:advance(n,plan.rate);times[n]=a.time;}
    else if(layered)a.time=advance(n,plan.rate);
    else setT(n,plan.t);
   }else if(data?.loop){a.time=data.kind==='gait'&&GAITS.some(g=>g[0]===base)?gaitPhase*d:advance(n,1);}
  }
  mixer.update(0);
  // unified athletes: the visible body runs where he is going (the simulation's face is untouched)
  if(assets.unified){if(!headingReady){heading.yaw=p.face||0;headingReady=true;}root.rotation.y=av.visualFace=stepHeading(heading,p,{defending:ctx.defending,hasBall:p.hasBall},dt);}
  // the clip owns the jump during shots, blocks and rebounds: the engine's own height (the old 0.85 lift) is replaced by the authored hips
  ownsJump=!!plan.ownsJump;if(ownsJump)root.position.y=0;
  // lean into acceleration, back into braking (a few hundredths of a radian)
  const sp=Math.hypot(p.vx||0,p.vz||0),accel=(sp-(av._lastSpeed??sp))/dt;av._lastSpeed=sp;
  av._lean=(av._lean||0)+(clamp(accel*.01+Math.min(.05,sp*.008),-.07,.12)-(av._lean||0))*(1-Math.exp(-dt/.12));root.rotation.x=plan.kind==='full'?0:av._lean;
  // for the view: state name (the dribble code keys on "dribble"), the bounce phase, the ball track
  const mainName=layered?plan.upper:plan.clip,main=clipData(mainName),t=layered?times[upName]:plan.kind==='loop'?(plan.group==='gait'?gaitPhase*(main?.duration||1):times[plan.clip]):plan.t;
  dribbleSrc=null;
  if(main&&main.ball&&(plan.dribble||layered||/crossover|between_legs|hesitation/.test(mainName)))dribbleSrc={clip:main,t:t||0};
  state=(plan.dribble||layered||/^dribble_/.test(mainName))?'dribble:'+mainName:mainName;
  statePhase=main?(bouncePhase(main,t||0)??((t||0)/main.duration)%1):0;
  if(plan.group==='gait'&&!plan.dribble)st.gait=plan.clip;if(plan.dribble)st.dribbleGait=plan.clip;
 };
 if(teamLook)av.applyKit({base:teamLook.primary,accent:teamLook.trim||teamLook.secondary,shorts:teamLook.shortsBase});
 return av;
}


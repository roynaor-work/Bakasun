/** Island Pro Basketball — the broadcast athletes (default since 01/11 v3, back from the v1
 * pipeline after the low-poly characters2 switch read as a step down on the phone): adult
 * MakeHuman (CC0) bodies with skin textures and hair, uniforms cut from the body with a drawn
 * jersey, motion-capture clips (CMU, retargeted) and the ball hand. An avatar only shows the
 * engine state it is given; clip time of shots, jumps and moves is taken from the engine action
 * time, so the release in the animation is the engine release. The characters2 athlete and the
 * authored motion2 clips remain available through `assets.characterVersion: 2`. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {jerseyTexture,shortsTexture} from './hoops-textures.mjs';
import {shareSkeletons} from './hoops-perf.mjs';
import {compactAvatar} from './hoops-lod.mjs';

const BODY_FOR_POS={PG:'guard',SG:'guard',SF:'wing',PF:'forward',C:'big'};
const IDENTITY=new THREE.Quaternion(),_a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_t1=new THREE.Vector3(),_t2=new THREE.Vector3(),_q=new THREE.Quaternion(),_pq=new THREE.Quaternion(),_wq=new THREE.Quaternion();
/** World-space limb aim, independent of the rig's local bone axes (a local rotateX on this
 * MakeHuman/Mixamo arm swung the hand behind the back): rotate `upper` about its own joint so
 * the line joint -> `end` points at `target`, by `weight` (0..1). Child world matrices are
 * refreshed so chained calls (upper arm, then forearm) see the new pose. */
export function aimLimb(upper,end,target,weight){
 if(!upper||!end||!(weight>0))return;
 upper.getWorldPosition(_a);end.getWorldPosition(_b);_b.sub(_a);_c.copy(target).sub(_a);
 if(_b.lengthSq()<1e-8||_c.lengthSq()<1e-8)return;
 _q.setFromUnitVectors(_b.normalize(),_c.normalize());if(weight<1)_q.slerp(IDENTITY,1-weight);
 upper.parent.getWorldQuaternion(_pq);upper.getWorldQuaternion(_wq);
 upper.quaternion.copy(_pq.invert()).multiply(_q).multiply(_wq);upper.updateWorldMatrix(false,true);
}
/** Rotate a bone by a world-space quaternion about its own joint. */
export function worldRotate(bone,q){if(!bone)return;bone.parent.getWorldQuaternion(_pq);bone.getWorldQuaternion(_wq);bone.quaternion.copy(_pq.invert()).multiply(q).multiply(_wq);bone.updateWorldMatrix(false,true);}
/** Locomotion clips by speed with overlapping bands (m/s): the current clip keeps playing while
 * the speed stays inside its band, so a speed that hovers around a boundary no longer flickers
 * between two clips (walk/jog at 1.9, jog/run at 4.4, run/sprint at 5.7). Pure. */
export const LOCO_BANDS=Object.freeze({
 free:[['idle',0,0.45,0],['walk',0.3,2.15,1.37],['jog',1.75,4.65,4.0],['run',4.2,5.95,4.77],['sprint',5.5,99,6.47]],
 ball:[['dribble_stand',0,0.6,0],['dribble_walk',0.3,2.65,1.84],['dribble_jog',2.2,4.85,4.0],['jog',4.4,99,4.0]],
});
export function pickLocomotion(bands,speed,current){
 const stay=bands.find(b=>b[0]===current);
 if(stay&&speed>=stay[1]&&speed<=stay[2])return stay;
 return bands.find(b=>speed>=b[1]&&speed<=b[2])||bands[bands.length-1];
}
/** Realistic dribble bounce: phase u in [0,1) from the hand (top) down to the floor at `down`
 * and back up; the push down is quicker than the free rise. Returns 0 (floor) .. 1 (hand). */
export function dribbleHeight(u,down=0.42){u=((u%1)+1)%1;return u<down?1-Math.pow(u/down,1.7):1-Math.pow((1-u)/(1-down),2);}
/** How far the dribbling hand pumps down with the ball (0 = at rest, 1 = full pump): it rides
 * the ball into the first part of the drop, waits low, and lifts to meet the ball at the top. */
export function dribblePump(u){u=((u%1)+1)%1;return u<0.25?u/0.25:u<0.7?1:(1-u)/0.3;}
/** The steal reach as a pure timeline over the engine act (duration 0.4 s, contact at reachAt),
 * following the motion2 steal clips: reach out to the ball (steal_fail: the hand comes back
 * empty), or touch, gather to the chest and stand ready (steal_success). `result` is the
 * engine's verdict once it has arrived ('steal' | 'stealMiss' | null). Returns the reference
 * clip, the reach weight (hand toward the ball), the gather weight (hand to the chest), the
 * lunge (step toward the ball, 0..1) and the crouch. */
export function stealLayer(actT,result,steal={reachAt:0.14,duration:0.4}){
 const t=Math.max(0,actT),touch=steal.reachAt,end=steal.duration,success=result==='steal';
 const clip=success?'steal_success':'steal_fail';
 // reach: out by the contact, held a moment, then withdrawn (a miss withdraws later and lower)
 const out=Math.min(1,t/touch),back=t<=touch+0.04?0:Math.min(1,(t-touch-0.04)/(end-touch-0.04));
 const reach=out*(1-(success?Math.min(1,back*1.6):back*back));
 const gather=success?Math.min(1,Math.max(0,(t-touch)/(end-touch))):0;
 const lunge=Math.sin(Math.min(1,t/end)*Math.PI)*(success?0.8:1);
 const crouch=Math.sin(Math.min(1,t/end)*Math.PI);
 return {clip,reach,gather,lunge,crouch,touched:t>=touch};
}
const HAIR=/short0|afro|long0|bob0|braid|pony/i;

export async function loadPlayerAssetsV1(cfg,base,onProgress){
 const loader=new GLTFLoader();
 const paths=cfg.lodModels||cfg.models,names=Object.keys(paths);let done=0;
 const tick=()=>{done++;onProgress?.(done/(names.length+1));};
 const bodies={};
 await Promise.all(names.map(async k=>{const g=await loader.loadAsync(new URL(paths[k],base).href);bodies[k]=g;tick();}));
 const anim=await loader.loadAsync(new URL(cfg.animations,base).href);tick();
 const clips=new Map(anim.animations.map(c=>[c.name,c]));
 const r=await fetch(new URL('design/hoops/legacy-shot-fake.json',base));if(!r.ok)throw Error('Basketball action clips unavailable');const authored=await r.json();for(const clip of authored.clips){const c=THREE.AnimationClip.parse(clip);clips.set(c.name,c);}
 // skin textures of all bodies share the MakeHuman UV layout: any skin fits any body
 const skins=[];
 for(const k of names)bodies[k].scene.traverse(o=>{if(o.isMesh&&/^Human_x/.test(o.name)&&o.material.map&&!skins.includes(o.material.map))skins.push(o.material.map);});
 return {bodies,clips,skins,dispose(){const tex=new Set();for(const g of Object.values(bodies))g.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const t of Object.values(o.material))if(t?.isTexture)tex.add(t);o.material.dispose();}});for(const t of tex)t.dispose();for(const t of this.shorts?.values()||[])t.dispose();}};
}

/** Bone lookup that ignores the "mixamorig:" prefix variants the exporter may write. */
function bone(root,name){let found=null;root.traverse(o=>{if(!found&&o.isBone&&o.name.replace(/^mixamorig:?/,'')===name)found=o;});return found;}

const trimShader=(trimColor,waistColor)=>sh=>{
 sh.uniforms.uTrim={value:new THREE.Color(trimColor)};sh.uniforms.uWaist={value:new THREE.Color(waistColor)};
 sh.vertexShader=sh.vertexShader.replace('#include <color_pars_vertex>','#include <color_pars_vertex>\nattribute vec4 trim;\nvarying vec2 vTrim;').replace('#include <color_vertex>','#include <color_vertex>\nvTrim=trim.rg;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <color_pars_fragment>','#include <color_pars_fragment>\nvarying vec2 vTrim;uniform vec3 uTrim;uniform vec3 uWaist;')
  .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,uTrim,smoothstep(0.42,0.52,vTrim.x));diffuseColor.rgb=mix(diffuseColor.rgb,uWaist,smoothstep(0.4,0.6,vTrim.y));');
};

/** Shorts carry no number: one texture per team look, shared by every avatar of the team. */
function teamShorts(assets,teamLook){
 const cache=assets.shorts||(assets.shorts=new Map()),key=JSON.stringify([teamLook.primary,teamLook.secondary,teamLook.trim,teamLook.mark]);
 let t=cache.get(key);if(!t){t=shortsTexture(teamLook);cache.set(key,t);}
 return t;
}

export function createAvatarV1(assets,card,teamLook,opts={}){
 const kind=card.look?.body||BODY_FOR_POS[card.pos]||'wing';
 const src=assets.bodies[kind]||Object.values(assets.bodies)[0];
 const root=cloneSkinned(src.scene);root.name='player-'+card.id;
 // the clone gives every skinned mesh its own Skeleton over the same bones: share one
 const skinned=[];root.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});shareSkeletons(skinned);
 const mats=[];
 const skin=assets.skins[(card.look?.skin??0)%Math.max(1,assets.skins.length)];
 root.traverse(o=>{
  if(!o.isMesh)return;
  o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
  const name=o.name;
  if(/Jersey|Shorts/.test(name)){
   const ga=o.geometry.attributes;
   if(!ga.trim&&(ga.color_1||ga.color))o.geometry.setAttribute('trim',ga.color_1||ga.color);
   const isJ=/Jersey/.test(name);
   const map=isJ?jerseyTexture({primary:teamLook.primary,secondary:teamLook.secondary,trim:teamLook.trim,number:card.number,wordmark:teamLook.wordmark,name:card.shortName||card.name,dark:teamLook.darkText}):teamShorts(assets,teamLook);
   const m=new THREE.MeshStandardMaterial({map,roughness:0.78,metalness:0,side:THREE.DoubleSide});if(!isJ)m.userData.sharedMap=true;
   m.userData.kitPart=isJ?'jersey':'shorts';m.onBeforeCompile=trimShader(teamLook.trim,isJ?teamLook.secondary:new THREE.Color(teamLook.primary).multiplyScalar(0.55));
   m.customProgramCacheKey=()=>'hoops-uniform';
   o.material=m;mats.push(m);return;
  }
  const m=o.material.clone();m.transparent=false;m.depthWrite=true;
  if(HAIR.test(name)||/eyebrow|eyelash/i.test(name)){m.alphaTest=/eyelash|eyebrow/i.test(name)?0.3:0.45;m.side=THREE.DoubleSide;if(card.look?.hairTint)m.color=new THREE.Color(card.look.hairTint);}
  else m.alphaTest=0;
  m.userData.sourceMap=!!m.map;
  if(/^Human_x/.test(name)){if(skin)m.map=skin;m.roughness=0.62;m.metalness=0;}
  if(/shoes/i.test(name)){m.color=new THREE.Color(teamLook.shoe||'#f2f2f2');m.roughness=0.55;}
  o.material=m;mats.push(m);
 });
 if(card.look?.hidden)for(const h of card.look.hidden)root.traverse(o=>{if(o.isMesh&&o.name.includes(h))o.visible=false;});
 const scale=(card.ratings?.height||200)/(opts.baseHeights?.[kind]||(kind==='guard'?188:kind==='wing'?198:kind==='forward'?203:209));
 root.scale.setScalar(scale);
 const mixer=new THREE.AnimationMixer(root);
 const actions={};
 for(const [name,clip] of assets.clips){const a=mixer.clipAction(clip);a.enabled=true;a.setEffectiveWeight(0);a.play();actions[name]=a;}
 const hands={r:bone(root,'RightHand'),l:bone(root,'LeftHand'),rIdx:bone(root,'RightHandMiddle1'),lIdx:bone(root,'LeftHandMiddle1')};
 const spine=bone(root,'Spine2'),rArm=bone(root,'RightArm'),lArm=bone(root,'LeftArm'),rFore=bone(root,'RightForeArm'),lFore=bone(root,'LeftForeArm'),neck=bone(root,'Neck'),hips=bone(root,'Hips');
 let stealResult=null,stealSeen=0,lastVx=0,lastVz=0,lastFace=null,leanPitch=0,leanRoll=0,chestYaw=0,loco=null;const Y_AXIS=new THREE.Vector3(0,1,0),_ax=new THREE.Vector3(),_lq=new THREE.Quaternion();
 const packed=compactAvatar(root,{maxTriangles:4000,teamLook});
 const av={root,mixer,actions,hands,kind,scale,cur:null,weights:{},card,mats,packed,
  applyKit(kit){for(const m of mats){if(m.userData.kitPart){if(!m.userData.sharedMap)m.map?.dispose();m.userData.sharedMap=false;m.map=m.userData.kitPart==='jersey'?jerseyTexture({primary:kit.base,secondary:kit.accent,trim:kit.accent,number:card.number,wordmark:teamLook.wordmark,name:card.shortName||card.name,dark:false}):shortsTexture({primary:kit.base,secondary:kit.accent,trim:kit.accent});}}packed.refreshMaps({}, {primary:kit.base,secondary:kit.accent,trim:kit.accent});},
  event(e){const type=typeof e==='string'?e:e?.type;if(type==='steal'||type==='stealMiss'){stealResult=type;stealSeen=0;}},get motionState(){return this.cur||'idle';},get stealResult(){return stealResult;},
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);packed.dispose();for(const m of mats){if(!m.userData.sharedMap&&!m.userData.sourceMap)m.map?.dispose?.();m.dispose();}},
 };
 // locomotion state
 let baseClip='idle',baseT=0,lastSync=null;
 const W={};for(const k in actions)W[k]=0;
 function want(name,dt,fade=0.18){
  for(const k in W){const target=k===name?1:0,step=dt/Math.max(0.001,fade);W[k]+=(target-W[k])*Math.min(1,step*3);if(W[k]<0.003)W[k]=0;}
 }
 av.pose=function(p,ctx,dt){
  const sp=Math.hypot(p.vx,p.vz),fx=Math.sin(p.face),fz=Math.cos(p.face);
  const fwd=(p.vx*fx+p.vz*fz),lat=(p.vx*fz-p.vz*fx);   // lat>0 = to the player's left
  let name='idle',rate=1,sync=null;
  const defending=ctx.defending;
  if(p.act==='fake'){name='fake_shot';sync=p.actT*(actions.fake_shot?.getClip().duration||.62)/.52;}
  else if(p.act==='shoot'){
   const t=p.shotType==='dunk'?'layup':p.shotType==='ft'?'freethrow':p.shotType;
   name=t;sync=p.actT*(p.shotType==='dunk'?1.08:1);
  } else if(p.act==='cross'||p.act==='spin'){name=p.act==='spin'?'spin':'crossover';sync=p.actT*(actions[name]?.getClip().duration||1)/(p.act==='spin'?.75:.55);}
  else if(p.air&&(p.act==='block'||p.act==='rebound')){name='jump';sync=0.28+ctx.airU*0.62;}
  else if(p.stumble){name='stop';sync=0.55;}
  else if(p.hasBall){
   const band=pickLocomotion(LOCO_BANDS.ball.filter(b=>actions[b[0]]),sp,loco);name=band[0];rate=band[3]?sp/band[3]:1;
   if(name==='dribble_stand'&&!ctx.dribbling)name='idle_ball';
  } else if(defending&&sp>(loco==='slide_l'||loco==='slide_r'?0.3:0.45)&&sp<2.8&&Math.abs(lat)>Math.abs(fwd)*(loco==='slide_l'||loco==='slide_r'?0.7:0.9)){name=lat>0?'slide_l':'slide_r';rate=Math.abs(lat)/3.0;}
  else if(defending&&sp<=0.6){name='def_hold';}
  else if(fwd<-0.8&&sp<4&&sp>0.35){name='jog';rate=-sp/4.0;}
  else {const band=pickLocomotion(LOCO_BANDS.free,sp,loco);name=band[0];rate=band[3]?sp/band[3]:1;}
  if(!actions[name])name='idle';
  // a change between two strides keeps the stride phase, so the legs do not cross-fade between
  // opposite steps (the main source of the foot slide at speed changes)
  const CYCLIC=/^(walk|jog|run|sprint|dribble_walk|dribble_jog|slide_l|slide_r)$/;
  if(name!==loco&&loco&&CYCLIC.test(name)&&CYCLIC.test(loco)&&actions[loco]&&sync==null){const from=actions[loco],to=actions[name];to.time=(from.time/Math.max(1e-6,from.getClip().duration))%1*to.getClip().duration;}
  if(sync==null)loco=name;
  want(name,dt,sync!=null?0.08:0.2);
  for(const k in actions){const a=actions[k];a.setEffectiveWeight(W[k]);
   if(W[k]===0)continue;
   if(k===name&&sync!=null){a.time=Math.min(sync,a.getClip().duration-0.001);a.setEffectiveTimeScale(0);}
   else if(k===name){a.setEffectiveTimeScale(clamp(rate,-2.2,2.2));}
  }
  mixer.update(dt);av.cur=name;
  // procedural layers on top of the clip (world space, one matrix refresh): lean, pass push,
  // steal reach, dribble hand, contest, block, catch
  root.updateMatrixWorld(true);
  // v4 lean: the body tips into acceleration and into a turn, the chest leads the turn; all
  // small (under 0.18 rad), smoothed, and gone when standing still
  if(hips&&dt>0){
   const ax=(p.vx-lastVx)/dt,az=(p.vz-lastVz)/dt,aFwd=ax*fx+az*fz,aLat=ax*fz-az*fx;
   const turn=lastFace==null?0:(((p.face-lastFace+Math.PI*3)%(Math.PI*2))-Math.PI)/dt;
   const k=1-Math.exp(-dt*7);
   leanPitch+=(clamp(aFwd*0.022,-0.1,0.16)+clamp(sp/6.5,0,1)*0.05-leanPitch)*k;
   leanRoll+=(clamp(-aLat*0.018-turn*sp*0.012,-0.12,0.12)-leanRoll)*k;
   chestYaw+=(clamp(turn*0.04,-0.22,0.22)*Math.min(1,sp/2)-chestYaw)*k;
   if(p.act!=='shoot'&&!p.air){
    _ax.set(fz,0,-fx);_lq.setFromAxisAngle(_ax,leanPitch);worldRotate(hips,_lq);
    _ax.set(fx,0,fz);_lq.setFromAxisAngle(_ax,leanRoll);worldRotate(hips,_lq);
    if(spine&&Math.abs(chestYaw)>1e-3){_lq.setFromAxisAngle(Y_AXIS,chestYaw);worldRotate(spine,_lq);}
   }
  }
  lastVx=p.vx;lastVz=p.vz;lastFace=p.face;
  if(p.act==='pass'&&rArm&&lArm&&hands.r&&hands.l){
   // both hands push the ball out in front of the chest (world space), like pass_chest
   const u=Math.min(1,p.actT/0.16),k=Math.sin(u*Math.PI)*0.9;hips.getWorldPosition(_t1);_t1.x+=fx*0.75;_t1.y+=0.55*scale;_t1.z+=fz*0.75;
   aimLimb(rArm,hands.r,_t1,k);aimLimb(lArm,hands.l,_t1,k);rFore&&aimLimb(rFore,hands.r,_t1,k*0.7);lFore&&aimLimb(lFore,hands.l,_t1,k*0.7);
  }
  av.dribblePump=0;
  if(p.hasBall&&!p.act&&ctx.dribbling&&ctx.dribble&&rArm&&hands.r&&!p.air){
   // the dribbling hand rides the ball down and lifts to meet it (phase from the view's bounce)
   const pump=dribblePump(ctx.dribble.u)*ctx.dribble.drop;av.dribblePump=pump;
   if(pump>0.005){hands.r.getWorldPosition(_t1);_t1.y-=pump;_t1.x+=fx*0.04;_t1.z+=fz*0.04;aimLimb(rArm,hands.r,_t1,1);}
  }
  if(p.act==='steal'&&rArm&&hands.r){
   // v4: a real reach, hands toward the ball (world space), a step and a crouch into it, then
   // either the gather of a success or the empty hand of a miss (see stealLayer)
   if(p.actT<0.02&&stealSeen>0.3)stealResult=null;stealSeen+=dt;
   const L=stealLayer(p.actT,stealResult,ctx.steal);
   const target=ctx.ball&&Number.isFinite(ctx.ball.x)?_t1.set(ctx.ball.x,Math.max(0.3,ctx.ball.y),ctx.ball.z):_t1.set(root.position.x+fx*0.75,0.75,root.position.z+fz*0.75);
   if(L.gather>0){hips.getWorldPosition(_t2);_t2.x+=fx*0.25;_t2.y+=0.45*scale;_t2.z+=fz*0.25;target.lerp(_t2,L.gather);}
   const w=Math.max(L.reach,L.gather*0.9);
   if(w>0){
    aimLimb(rArm,hands.r,target,w);rFore&&aimLimb(rFore,hands.r,target,w*0.85);
    // the other hand comes forward too, lower and wider, like a defender's second hand
    _t2.set(target.x-fz*0.35,target.y+0.15,target.z+fx*0.35);aimLimb(lArm,hands.l,_t2,w*0.55);
    // the chest follows the hand a little
    if(spine&&neck){neck.getWorldPosition(_t2);_t2.set(_t2.x+(target.x-_t2.x)*0.6,_t2.y-0.25*w,_t2.z+(target.z-_t2.z)*0.6);aimLimb(spine,neck,_t2,w*0.35);}
   }
   root.position.x+=fx*0.18*L.lunge;root.position.z+=fz*0.18*L.lunge;root.position.y-=0.07*L.crouch;
  }
  if(ctx.contest&&lArm&&rArm&&!p.hasBall&&p.act!=='shoot'&&!p.air){lArm.rotateZ(-0.9*ctx.contest);rArm.rotateZ(0.9*ctx.contest);}
  // block and rebound: both arms reach straight up through the jump
  if(p.air&&(p.act==='block'||p.act==='rebound')&&lArm&&rArm){const k=Math.min(1,0.35+ctx.airU*1.4);lArm.rotateZ(-2.6*k);rArm.rotateZ(2.6*k);lFore&&lFore.rotateZ(-1.6*k);rFore&&rFore.rotateZ(1.6*k);}
  // a pass on its way: hands up in front of the chest, ready to catch
  if(ctx.catching&&!p.hasBall&&lArm&&rArm&&!p.air){lArm.rotateX(-0.9);rArm.rotateX(-0.9);lFore&&lFore.rotateX(-0.5);rFore&&rFore.rotateX(-0.5);}
 };
 return av;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export {bone as boneV1};

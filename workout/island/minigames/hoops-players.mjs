/** Island Pro Basketball — player avatars: adult MakeHuman (CC0) bodies with a full rig,
 * uniforms cut from the body, motion-capture clips (CMU, retargeted) and the ball hand.
 * An avatar only shows the engine state it is given; clip time of shots, jumps and moves is
 * taken from the engine action time, so the release in the animation is the engine release. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {jerseyTexture,shortsTexture} from './hoops-textures.mjs?v=island-naval-aim-20261030-1';

const BODY_FOR_POS={PG:'guard',SG:'guard',SF:'wing',PF:'forward',C:'big'};
const HAIR=/short0|afro|long0|bob0|braid|pony/i;

export async function loadPlayerAssets(cfg,base,onProgress){
 const loader=new GLTFLoader();
 const names=Object.keys(cfg.models);let done=0;
 const tick=()=>{done++;onProgress?.(done/(names.length+1));};
 const bodies={};
 await Promise.all(names.map(async k=>{const g=await loader.loadAsync(new URL(cfg.models[k],base).href);bodies[k]=g;tick();}));
 const anim=await loader.loadAsync(new URL(cfg.animations,base).href);tick();
 const clips=new Map(anim.animations.map(c=>[c.name,c]));
 // skin textures of all bodies share the MakeHuman UV layout: any skin fits any body
 const skins=[];
 for(const k of names)bodies[k].scene.traverse(o=>{if(o.isMesh&&/^Human_x/.test(o.name)&&o.material.map&&!skins.includes(o.material.map))skins.push(o.material.map);});
 return {bodies,clips,skins};
}

/** Bone lookup that ignores the "mixamorig:" prefix variants the exporter may write. */
function bone(root,name){let found=null;root.traverse(o=>{if(!found&&o.isBone&&o.name.replace(/^mixamorig:?/,'')===name)found=o;});return found;}

const trimShader=(trimColor,waistColor)=>sh=>{
 sh.uniforms.uTrim={value:new THREE.Color(trimColor)};sh.uniforms.uWaist={value:new THREE.Color(waistColor)};
 sh.vertexShader=sh.vertexShader.replace('#include <color_pars_vertex>','#include <color_pars_vertex>\nattribute vec4 trim;\nvarying vec2 vTrim;').replace('#include <color_vertex>','#include <color_vertex>\nvTrim=trim.rg;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <color_pars_fragment>','#include <color_pars_fragment>\nvarying vec2 vTrim;uniform vec3 uTrim;uniform vec3 uWaist;')
  .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,uTrim,smoothstep(0.42,0.52,vTrim.x));diffuseColor.rgb=mix(diffuseColor.rgb,uWaist,smoothstep(0.4,0.6,vTrim.y));');
};

export function createAvatar(assets,card,teamLook,opts={}){
 const kind=card.look?.body||BODY_FOR_POS[card.pos]||'wing';
 const src=assets.bodies[kind]||Object.values(assets.bodies)[0];
 const root=cloneSkinned(src.scene);root.name='player-'+card.id;
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
   const map=isJ?jerseyTexture({primary:teamLook.primary,secondary:teamLook.secondary,trim:teamLook.trim,number:card.number,wordmark:teamLook.wordmark,name:card.shortName||card.name,dark:teamLook.darkText}):shortsTexture(teamLook);
   const m=new THREE.MeshStandardMaterial({map,roughness:0.78,metalness:0,side:THREE.DoubleSide});
   m.onBeforeCompile=trimShader(teamLook.trim,isJ?teamLook.secondary:new THREE.Color(teamLook.primary).multiplyScalar(0.55));
   m.customProgramCacheKey=()=>'hoops-uniform';
   o.material=m;mats.push(m);return;
  }
  const m=o.material.clone();m.transparent=false;m.depthWrite=true;
  if(HAIR.test(name)||/eyebrow|eyelash/i.test(name)){m.alphaTest=/eyelash|eyebrow/i.test(name)?0.3:0.45;m.side=THREE.DoubleSide;if(card.look?.hairTint)m.color=new THREE.Color(card.look.hairTint);}
  else m.alphaTest=0;
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
 const spine=bone(root,'Spine2'),rArm=bone(root,'RightArm'),lArm=bone(root,'LeftArm'),rFore=bone(root,'RightForeArm'),lFore=bone(root,'LeftForeArm');
 const av={root,mixer,actions,hands,kind,scale,cur:null,weights:{},card,mats,
  dispose(){mixer.stopAllAction();for(const m of mats){m.map?.dispose?.();m.dispose();}},
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
  if(p.act==='shoot'){
   const t=p.shotType==='dunk'?'layup':p.shotType==='ft'?'freethrow':p.shotType;
   name=t;sync=p.actT*(p.shotType==='dunk'?1.08:1);
  } else if(p.act==='cross'||p.act==='spin'){name=p.act==='spin'?'spin':'crossover';sync=p.actT*(p.act==='spin'?1.9:1.45);}
  else if(p.air&&(p.act==='block'||p.act==='rebound')){name='jump';sync=0.28+ctx.airU*0.62;}
  else if(p.stumble){name='stop';sync=0.55;}
  else if(p.hasBall){
   if(sp<0.45){name=ctx.dribbling?'dribble_stand':'idle_ball';}
   else if(sp<2.4){name='dribble_walk';rate=sp/1.84;}
   else {name='jog';rate=sp/4.0;}
  } else if(defending&&sp>0.45&&Math.abs(lat)>Math.abs(fwd)*0.9){name=lat>0?'slide_l':'slide_r';rate=Math.abs(lat)/3.0;}
  else if(defending&&sp<=0.6){name='def_hold';}
  else if(sp<0.35)name='idle';
  else if(fwd<-0.8&&sp<4){name='jog';rate=-sp/4.0;}
  else if(sp<1.9){name='walk';rate=sp/1.37;}
  else if(sp<4.4){name='jog';rate=sp/4.0;}
  else if(sp<5.7){name='run';rate=sp/4.77;}
  else {name='sprint';rate=sp/6.47;}
  if(!actions[name])name='idle';
  want(name,dt,sync!=null?0.08:0.2);
  for(const k in actions){const a=actions[k];a.setEffectiveWeight(W[k]);
   if(W[k]===0)continue;
   if(k===name&&sync!=null){a.time=Math.min(sync,a.getClip().duration-0.001);a.setEffectiveTimeScale(0);}
   else if(k===name){a.setEffectiveTimeScale(clamp(rate,-2.2,2.2));}
  }
  mixer.update(dt);
  // procedural layers on top of the clip: pass push, steal reach, ball carry
  if(p.act==='pass'&&rArm&&lArm){const u=Math.min(1,p.actT/0.16);const k=Math.sin(u*Math.PI)*0.9;rArm.rotateX(-k);lArm.rotateX(-k);rFore&&rFore.rotateX(-k*0.6);lFore&&lFore.rotateX(-k*0.6);}
  if(p.act==='steal'&&rArm){const u=Math.min(1,p.actT/0.4);const k=Math.sin(u*Math.PI)*1.1;rArm.rotateX(-k);spine&&spine.rotateX(k*0.25);}
  if(ctx.contest&&lArm&&rArm&&!p.hasBall&&p.act!=='shoot'&&!p.air){lArm.rotateZ(-0.9*ctx.contest);rArm.rotateZ(0.9*ctx.contest);}
  // block and rebound: both arms reach straight up through the jump
  if(p.air&&(p.act==='block'||p.act==='rebound')&&lArm&&rArm){const k=Math.min(1,0.35+ctx.airU*1.4);lArm.rotateZ(-2.6*k);rArm.rotateZ(2.6*k);lFore&&lFore.rotateZ(-1.6*k);rFore&&rFore.rotateZ(1.6*k);}
  // a pass on its way: hands up in front of the chest, ready to catch
  if(ctx.catching&&!p.hasBall&&lArm&&rArm&&!p.air){lArm.rotateX(-0.9);rArm.rotateX(-0.9);lFore&&lFore.rotateX(-0.5);rFore&&rFore.rotateX(-0.5);}
 };
 return av;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export {bone};

/** Basketball on the shared athlete body (11/11/2026, "sports-deep-fable" M1, see athlete-body.mjs).
 *
 * The tall motion library (Codex hoops-tall-v1 + v9, unified gaits, the v8 passes) keeps driving the game exactly as before: the same
 * `chooseTallMotion` plan, the same events, ball tracks and jump calibration. What changes is the body it plays on: the realistic MakeHuman
 * athlete of soccer (skin shader, kit shader with team colours and the player's number, sleeveless jersey, sneakers), scaled per profile
 * (guard 1.88, wing 1.98, centre 2.08 m). Every tall clip is sampled on the canonical rig and retargeted once per profile through the
 * world-basis map (`athleteRetargetMap`), then `createAvatarTall` builds the avatar with `assets.bodyFactory` (this module) instead of the
 * merged vertex-coloured mesh. `?athleteBody=0` returns to the tall bodies. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {loadAthleteSource,athleteRetargetMap,retargetCanonicalClips,createAthleteInstance,athleteKitFor,athleteKitGeometry,ATHLETE_HEIGHTS,ATHLETE_BULK,CANON_REST,CANON18,athleteBodyEnabled} from './athlete-body.mjs';
import {createAthleteMaterials,athleteSources} from './soccer-athlete.mjs';
import {decodeTallPack,buildTallClips,TALL_PROFILES,TALL_REQUIRED,tallEnabled} from './hoops-tall.mjs';
import {loadV8Motion,buildV8Clips,v8MotionEnabled} from './hoops-v8-motion.mjs';
import {athletesEnabled,unifyTallPack} from './athletes-gait.mjs';

/** The athlete body is used when the tall library is on and the flag does not say otherwise. */
export function hoopsAthleteEnabled(cfg,params,quality=2){return athleteBodyEnabled(params?.toString?.()?'?'+params.toString():'')&&tallEnabled(cfg,params,quality);}

/** Face / skin profiles for the ten players (the soccer table has eight; basketball reuses them by player number). */
export const HOOPS_PROFILES=Object.freeze([
 {skin:'#8a5a40',hair:'#120e0c',beard:.3,shape:{african:.75,narrow:.25,hairVolume:0}},
 {skin:'#c08a68',hair:'#1f1712',beard:.55,shape:{caucasian:.25,jaw:.4,hairVolume:.15}},
 {skin:'#5e3b2a',hair:'#0d0b0a',beard:.25,shape:{african:1,jaw:.5,hairVolume:.05}},
 {skin:'#a8714f',hair:'#18120f',beard:.65,shape:{nose:.5,brow:.5,hairVolume:.3}},
 {skin:'#ddb090',hair:'#5a3a22',beard:.7,shape:{caucasian:.7,jaw:.7,hairVolume:.5}},
 {skin:'#9a6448',hair:'#1a1411',beard:.8,shape:{brow:.6,jaw:.3,nose:.3,hairVolume:.2}},
 {skin:'#e6bd9c',hair:'#a07246',beard:.2,shape:{caucasian:.8,narrow:.5,hairVolume:.6}},
 {skin:'#c99a78',hair:'#2b1e15',beard:.4,shape:{asian:.6,hairVolume:.35}},
]);

/** A canonical-rig AnimationClip (tracks `<bone>.quaternion`, `Hips.position` absolute) -> the state shape of the retargeter: keyframes at
 * `fps` with rotations per canonical bone and the hips offset from `restHips` (metres). Pure except for three.js interpolants. */
export function clipToCanonicalState(clip,restHips,fps=30){
 const n=Math.max(2,Math.round(clip.duration*fps)+1),dur=clip.duration,inter={};
 for(const t of clip.tracks){const [bone,prop]=t.name.split('.');inter[bone+'.'+prop]=t.createInterpolant();}
 const keyframes=[];
 for(let f=0;f<n;f++){
  const time=Math.min(dur,f/fps),rotations={};
  for(const b of CANON18){const i=inter[b+'.quaternion'];rotations[b]=i?Array.from(i.evaluate(time)):[0,0,0,1];}
  const hp=inter['Hips.position']?.evaluate(time);
  keyframes.push({time:dur?time/dur:0,rotations,hipsOffsetMeters:hp?[hp[0]-restHips[0],hp[1]-restHips[1],hp[2]-restHips[2]]:[0,0,0]});
 }
 return {durationSeconds:dur,loop:clip.userData?.loop??true,keyframes};
}

/** Retarget a Map of canonical clips (buildTallClips / buildV8Clips output) onto the athlete rig; names are kept. */
export function retargetClipMap(clips,restHips,rig,map,fps=30){
 const states={};for(const [name,clip] of clips)states[name]=clipToCanonicalState(clip,restHips,fps);
 const out=new Map();for(const clip of retargetCanonicalClips(THREE,states,CANON_REST,rig,map)){clip.userData.loop=states[clip.name].loop;out.set(clip.name,clip);}
 return out;
}

/** The three profiles and the pack, on the athlete body. Same contract as loadTall (createAvatarTall reads pack / clipSets / baseHeights /
 * posProfile / unified / v8) plus `athlete:true` and `bodyFactory`. Throws on any failure: the caller falls back to the tall bodies. */
export async function loadAthleteHoops(cfg,base,onProgress,{params,onFallback}={}){
 const t=cfg.tall;if(!t?.profiles)throw Error('Basketball tall is not configured');
 const loader=new GLTFLoader();let done=0;const tick=()=>onProgress?.(++done/4);
 const pr=await fetch(new URL(t.base+t.motion,base));if(!pr.ok)throw Error('Basketball tall motion pack '+pr.status);
 const pack=decodeTallPack(await pr.json());tick();
 for(const n of TALL_REQUIRED)if(!pack.clips[n])throw Error('Basketball tall clip missing: '+n);
 const source=await loadAthleteSource(url=>loadHoopsGLTF(loader,url),{url:new URL(cfg.athlete?.url||'assets/athlete/athlete.glb',base).href,T:THREE,prepare:scene=>athleteSources(THREE,scene)});tick();
 let unified=null;
 if(t.athletes&&athletesEnabled(t,params||'')){
  try{const dr=await fetch(new URL(t.athletes.donor,base));if(!dr.ok)throw Error('Gait donor '+dr.status);unified=unifyTallPack(pack,await dr.json());}
  catch(error){unified=null;onFallback?.('athletes',error);}
 }
 tick();
 let v8=null;
 if(v8MotionEnabled(cfg,params)){try{v8=await loadV8Motion(cfg,base);}catch(error){v8=null;onFallback?.('v8 motion',error);}}
 const map=athleteRetargetMap(source.rig,CANON_REST),clipSets={};
 const t0=globalThis.performance?.now?.()??0;
 for(const p of TALL_PROFILES){
  const rest=pack.profiles[p].hips,canonical=buildTallClips(pack,p);
  if(v8)for(const [n,c] of buildV8Clips(THREE,v8,rest))canonical.set(n,c);
  clipSets[p]=retargetClipMap(canonical,rest,source.rig,map);
 }
 const retargetMs=(globalThis.performance?.now?.()??0)-t0;tick();
 const sleeves=athleteKitGeometry(THREE,source,'basketball');
 const heights=t.baseHeights||{guard:188,wing:198,center:208};
 return {tall:true,athlete:true,pack,v8,unified,bodies:{},clips:new Map(),clipSets,baseHeights:heights,posProfile:t.posProfile,retargetMs,source,
  /** createAvatarTall calls this instead of cloning a tall body. `look` is the team look ({primary, trim/secondary, shortsBase}). */
  bodyFactory(profile,card,look,{numbers=null,cell=0,track=x=>x}={}){
   const height=(heights[profile]||ATHLETE_HEIGHTS.basketball[profile]*100)/100;
   const kit=athleteKitFor('basketball',[look?.primary||'#5b38c9',look?.trim||look?.secondary||'#f4d377'],{accent:look?.trim||look?.secondary||null});
   if(look?.shortsBase)kit.shorts=look.shortsBase;
   const profileLook=HOOPS_PROFILES[Math.abs(card.look?.skin??card.number??0)%HOOPS_PROFILES.length];
   const inst=createAthleteInstance(THREE,source,{createMaterials:createAthleteMaterials,cloneRig:cloneSkinned,profile:profileLook,kit,number:cell,numbers:numbers||blankNumbers(),track,style:'basketball',height,sleeveGeometry:sleeves,bulk:ATHLETE_BULK[profile]||1});
   inst.root.userData.characterVersion=10;
   const u=inst.materials.kit.userData.athlete,col=hex=>{const c=new THREE.Color(hex);return new THREE.Vector3(c.r,c.g,c.b);};
   return {root:inst.root,mats:[inst.materials.skin,inst.materials.kit],palms:inst.palms,instance:inst,
    applyKit(k){u.kitPrimary.value.copy(col(k.base||'#5b38c9'));u.kitSecondary.value.copy(col(k.accent||'#f4d377'));u.kitShorts.value.copy(col(k.shorts||k.base||'#5b38c9'));u.kitShortsTrim.value.copy(col(k.accent||'#f4d377'));u.kitBootAccent.value.copy(col(k.accent||'#f4d377'));},
    setLod:level=>inst.setLod(level),get lod(){return inst.lod;},
    dispose(){inst.dispose();}};
  },
  dispose(){for(const set of Object.values(clipSets))set.clear();}};
}

let blank=null;
/** The kit shader needs a numbers texture; without the roster canvas a 1-cell transparent one keeps the back empty. */
function blankNumbers(){
 if(blank)return blank;
 const data=new Uint8Array(64*64*4),tex=new THREE.DataTexture(data,64,64);tex.needsUpdate=true;blank=tex;return tex;
}

/** The numbers texture for a roster: one 64x64 cell per card index, the number in white with a dark edge (the shader samples cell `number`). */
export function hoopsNumbersTexture(cards,doc=globalThis.document){
 if(!doc)return blankNumbers();
 const canvas=doc.createElement('canvas');canvas.width=Math.max(1,cards.length)*64;canvas.height=64;const ctx=canvas.getContext('2d');
 ctx.font='bold 46px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 cards.forEach((c,i)=>{const n=String(c.number??i);ctx.lineWidth=5;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.strokeText(n,i*64+32,34);ctx.fillStyle='#ffffff';ctx.fillText(n,i*64+32,34);});
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Run from the clean target checkout, or set REVIEW_FIX_ROOT to that checkout.
export const root=resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
export const read=path=>JSON.parse(readFileSync(resolve(root,'workout/island',path),'utf8'));
export const module=path=>import(pathToFileURL(resolve(root,'workout/island',path)).href);
const T=await module('vendor/three.module.js');
const {compileSoccerDesignClips,createSoccerDesignMotion}=await module('minigames/soccer-design-character.mjs');
const {soccerV241ClipStates,SOCCER_V241_EXPECTED}=await module('minigames/soccer-r241.mjs');
const {soccerV24ClipStates}=await module('minigames/soccer-v24.mjs');
const base=read('design/motion/soccer.json'),rig=read('design/characters/rig.json'),map=read('design/viewer/retarget-map.json');
const states={...base.states,...soccerV24ClipStates(read('assets/soccer-v24/clips/clips.json')),...soccerV241ClipStates(read('assets/soccer-v241/clips/tackle.json'),SOCCER_V241_EXPECTED.tackle)};
const data={...base,states},clips=compileSoccerDesignClips(data,rig,map);
export const config=read('data/config.json').minigames.soccer;
export const dt=1/60;

// Real authored quaternion tracks, compiled by the production retargeter onto
// the checked-in rig. The only fixture replacement is the renderer/GLB mesh:
// the animation mixer, controller, timing, bone hierarchy and clips are real.
export function fixture(search=''){
  globalThis.location={search};
  const group=new T.Group(),bones={};
  for(const j of rig.joints){
    const bone=new T.Bone();bone.name=j.name;bone.position.fromArray(j.translation);bone.quaternion.fromArray(j.rotation);bone.scale.fromArray(j.scale);bones[j.name]=bone;
    (j.parent?bones[j.parent]:group).add(bone);
  }
  const motion=createSoccerDesignMotion(new T.AnimationMixer(group),clips,data,config);
  return {motion,bones,group,states};
}
export function assertFiniteBones(assert,group){
  group.updateMatrixWorld(true);
  group.traverse(o=>{if(o.isBone){assert.ok(o.quaternion.toArray().every(Number.isFinite),o.name+' quaternion');assert.ok(o.position.toArray().every(Number.isFinite),o.name+' position');assert.ok(o.matrixWorld.elements.every(Number.isFinite),o.name+' world matrix');}});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {bakeSoccerDesignFloor,soccerFloorCandidates,prepareSoccerDesignSources} from '../workout/island/minigames/soccer-design-character.mjs';

/** A two-bone skinned limb: a dense capsule whose lower half follows a child bone. */
function skinnedLimb(segments=48){
 const geometry=new T.CylinderGeometry(.12,.12,1.6,segments,segments,false);geometry.translate(0,.8,0);
 const count=geometry.attributes.position.count,index=new Uint16Array(count*4),weight=new Float32Array(count*4);
 for(let i=0;i<count;i++){const y=geometry.attributes.position.getY(i),lower=Math.max(0,Math.min(1,(.9-y)/.3));index[i*4]=1;index[i*4+1]=0;weight[i*4]=lower;weight[i*4+1]=1-lower;}
 geometry.setAttribute('skinIndex',new T.BufferAttribute(index,4));geometry.setAttribute('skinWeight',new T.BufferAttribute(weight,4));
 const root=new T.Bone();root.name='Root';const hips=new T.Bone();hips.name='Hips';hips.position.y=1.6;const knee=new T.Bone();knee.name='Knee';knee.position.y=-.8;
 root.add(hips);hips.add(knee);const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial());mesh.add(root);mesh.bind(new T.Skeleton([hips,knee]));
 const scene=new T.Group();scene.add(mesh);scene.updateMatrixWorld(true);return {scene,hips,knee,mesh};
}
function clips(hips,knee){
 const out=[];
 for(const [name,angles] of [['idle',[0,0,0]],['kick',[0,.9,-1.6]],['fall',[1.4,1.2,.4]]]){
  const times=[0,.5,1],tracks=[new T.VectorKeyframeTrack('Root.position',times,[0,0,0,0,0,0,0,0,0]),new T.VectorKeyframeTrack('Hips.position',times,[0,1.6,0,0,1.6,0,0,1.6,0])];
  const q=a=>new T.Quaternion().setFromEuler(new T.Euler(a,0,0)).toArray();
  tracks.push(new T.QuaternionKeyframeTrack('Hips.quaternion',times,[...q(angles[0]),...q(angles[1]),...q(angles[2])]));
  tracks.push(new T.QuaternionKeyframeTrack('Knee.quaternion',times,[...q(angles[0]*.5),...q(angles[1]*.5),...q(angles[2]*.5)]));
  out.push(new T.AnimationClip(name,1,tracks));
 }
 return out;
}

test('v3 loading: the floor bake samples a small hull-candidate subset and matches the exhaustive bake within millimetres',()=>{
 const {scene,hips,knee,mesh}=skinnedLimb();
 const candidates=soccerFloorCandidates(mesh);
 assert.ok(candidates.length<mesh.geometry.attributes.position.count*.15,`${candidates.length} candidates of ${mesh.geometry.attributes.position.count} vertices`);
 assert.equal(soccerFloorCandidates(mesh),candidates,'cached per geometry');
 const fast=bakeSoccerDesignFloor(scene,clips(hips,knee)),full=bakeSoccerDesignFloor(scene,clips(hips,knee),{exhaustive:true});
 let worst=0;
 for(let i=0;i<fast.length;i++){const a=fast[i].tracks.find(t=>t.name==='Root.position').values,b=full[i].tracks.find(t=>t.name==='Root.position').values;for(let k=1;k<a.length;k+=3){assert.ok(a[k]>=b[k]-1e-9,'the candidate bake never sinks below the exhaustive floor');worst=Math.max(worst,a[k]-b[k]);}}
 assert.ok(worst<.006,`root lift differs by ${worst.toFixed(4)} m at most`);
 // Bones are restored after either bake.
 assert.ok(hips.quaternion.equals(new T.Quaternion())&&knee.quaternion.equals(new T.Quaternion()));
});

test('v3 loading: the real characters are prepared once per page; a failed preparation is retried, not cached',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:false,status:503,json:async()=>({}),arrayBuffer:async()=>new ArrayBuffer(0)};};
 try{
  const first=prepareSoccerDesignSources();assert.equal(prepareSoccerDesignSources(),first,'one shared preparation while pending');
  await assert.rejects(first);
  const second=prepareSoccerDesignSources();assert.notEqual(second,first,'a failure is forgotten so the next match retries');await assert.rejects(second);
  assert.ok(calls>=2);
 }finally{globalThis.fetch=originalFetch;}
});

test('v3 loading: the match loop does not render while the loading panel is up, and the soccer menu warms the match assets once',async()=>{
 const session=await readFile(new URL('../workout/island/minigames/soccer-session.mjs',import.meta.url),'utf8');
 assert.match(session,/else if\(!loading\)view\.render\(/,'no fallback-stadium frames (and no wasted shader compiles) during loading');
 const card=await readFile(new URL('../workout/island/ui/soccer-card.mjs',import.meta.url),'utf8');
 assert.match(card,/export function warmSoccerAssets/);assert.match(card,/prepareSoccerDesignSources\(\)/);assert.match(card,/loadSoccerDesignContracts\(\)/);assert.match(card,/warmSoccerAssets\(\);/);
 assert.ok(!/unsafe|blob:|eval\(/.test(card),'warming uses same-origin fetches only (index CSP)');
});

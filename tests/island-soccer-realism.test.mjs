import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../workout/island/vendor/three.module.js';
import {createSoccerLighting} from '../workout/island/minigames/soccer-lighting.mjs';
import {playerSoccerClip} from '../workout/island/minigames/soccer-rig.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const assetBase=new URL('../workout/island/assets/soccer-realism/',import.meta.url);

function lightingFixture(){
 const scene=new T.Scene(),existing=new T.Group();scene.add(existing);
 const renderer={shadowMap:{enabled:false,type:T.BasicShadowMap}};
 const lighting=createSoccerLighting(scene,renderer,config);
 const sun=scene.children.find(node=>node.isDirectionalLight&&node.castShadow);
 assert.ok(sun,'a real Three.js directional light provides the shadow');
 return {scene,existing,renderer,lighting,sun};
}
function observedTarget(size){
 const target=new T.WebGLRenderTarget(size,size);let disposals=0;
 target.addEventListener('dispose',()=>disposals++);
 return {target,get disposals(){return disposals;}};
}

test('soccer sunlight shadow tiers resize once and free allocated targets when disabled',()=>{
 const {lighting,sun,renderer}=lightingFixture();
 assert.deepEqual(lighting.metrics(),{sunShadows:true,shadowSize:2048,quality:0});
 assert.equal(renderer.shadowMap.type,T.PCFSoftShadowMap);
 const high=observedTarget(2048),highPass=observedTarget(2048);
 sun.shadow.map=high.target;sun.shadow.mapPass=highPass.target;
 lighting.setQuality(0);
 assert.equal(high.disposals,0,'retaining a tier does not destroy its render target');
 assert.equal(sun.shadow.map,high.target);
 lighting.setQuality(1);
 assert.equal(high.disposals,1);assert.equal(highPass.disposals,1);
 assert.equal(sun.shadow.map,null);assert.equal(sun.shadow.mapPass,null);
 assert.deepEqual(sun.shadow.mapSize.toArray(),[1024,1024]);
 assert.deepEqual(lighting.metrics(),{sunShadows:true,shadowSize:1024,quality:1});
 const medium=observedTarget(1024);sun.shadow.map=medium.target;
 lighting.setQuality(1);assert.equal(medium.disposals,0);
 lighting.setQuality(2);
 assert.equal(medium.disposals,1);assert.equal(sun.shadow.map,null);
 assert.equal(sun.castShadow,false);assert.equal(renderer.shadowMap.enabled,false);
 assert.deepEqual(lighting.metrics(),{sunShadows:false,shadowSize:0,quality:2});
 lighting.setQuality(3);lighting.dispose();lighting.dispose();
 assert.equal(high.disposals,1);assert.equal(highPass.disposals,1);assert.equal(medium.disposals,1);
});

test('soccer lighting disposal releases both render targets once and preserves unrelated scene nodes',()=>{
 const {lighting,sun,scene,existing}=lightingFixture();
 const map=observedTarget(2048),pass=observedTarget(2048);
 sun.shadow.map=map.target;sun.shadow.mapPass=pass.target;
 lighting.dispose();lighting.dispose();
 assert.equal(map.disposals,1);assert.equal(pass.disposals,1);
 assert.equal(sun.shadow.map,null);assert.equal(sun.shadow.mapPass,null);
 assert.deepEqual(scene.children,[existing]);
});

test('soccer single-sun shadow camera contains the complete pitch, goal depth and player height',()=>{
 const {lighting,sun,scene}=lightingFixture();
 assert.equal(scene.children.filter(node=>node.castShadow).length,1,'only one light adds a shadow pass');
 scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
 const camera=sun.shadow.camera,hx=config.pitch.length/2+config.pitch.goalDepth,hz=config.pitch.width/2;
 for(const x of [-hx,0,hx])for(const z of [-hz,0,hz])for(const y of [0,Math.max(config.pitch.goalHeight,config.view.animation.characterHeight)]){
  const projected=new T.Vector3(x,y,z).project(camera);
  for(const axis of ['x','y','z'])assert.ok(Number.isFinite(projected[axis])&&Math.abs(projected[axis])<=1,`shadow camera clips ${axis} at world ${x},${y},${z}`);
 }
 lighting.setQuality(-10);assert.equal(lighting.metrics().shadowSize,2048);
 lighting.setQuality(10);assert.equal(lighting.metrics().quality,3);
 assert.equal(lighting.metrics().sunShadows,false);lighting.dispose();
});

test('soccer player clips animate the original rig independently while excluding only the detached ball',()=>{
 const root=new T.Group(),hips=new T.Bone(),ballast=new T.Object3D();hips.name='Hips';ballast.name='Ballast';root.add(hips,ballast);
 const source=new T.AnimationClip('kick',1,[
  new T.VectorKeyframeTrack('Hips.position',[0,1],[0,0,0,2,0,0]),
  new T.VectorKeyframeTrack('Ball.position',[0,1],[0,0,0,100,0,0]),
  new T.QuaternionKeyframeTrack('Ball.quaternion',[0,1],[0,0,0,1,0,1,0,0]),
  new T.VectorKeyframeTrack('Ballast.position',[0,1],[0,0,0,0,2,0])
 ]);
 const original=JSON.stringify(T.AnimationClip.toJSON(source)),clip=playerSoccerClip(source);
 assert.notEqual(clip,source);assert.equal(clip.name,source.name);assert.equal(clip.duration,source.duration);
 assert.deepEqual(clip.tracks.map(track=>track.name),['Hips.position','Ballast.position']);
 assert.equal(JSON.stringify(T.AnimationClip.toJSON(source)),original,'filtering must not alter the shared source animation');
 assert.notEqual(clip.tracks[0],source.tracks[0]);assert.notEqual(clip.tracks[0].values,source.tracks[0].values);
 const mixer=new T.AnimationMixer(root);mixer.clipAction(clip).play();mixer.update(.5);
 assert.ok(Math.abs(hips.position.x-1)<1e-6,'remaining body animation still drives the actual bone');
 assert.ok(Math.abs(ballast.position.y-1)<1e-6,'an unrelated Ball-prefixed node keeps its animation');
 mixer.stopAllAction();mixer.uncacheRoot(root);
});

function jpegDimensions(bytes){
 assert.equal(bytes.readUInt16BE(0),0xffd8,'JPEG SOI marker');
 let at=2;
 while(at<bytes.length){
  assert.equal(bytes[at++],0xff,'JPEG segment marker');while(bytes[at]===0xff)at++;
  const marker=bytes[at++];
  if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  const length=bytes.readUInt16BE(at);assert.ok(length>=2&&at+length<=bytes.length);
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {width:bytes.readUInt16BE(at+5),height:bytes.readUInt16BE(at+3),channels:bytes[at+7]};
  at+=length;
 }
 throw Error('JPEG frame header was not found');
}

test('soccer turf files match their verified source manifest and fit a one-megabyte 1K RGB budget',async()=>{
 const provenance=JSON.parse(await readFile(new URL('provenance.json',assetBase),'utf8'));
 assert.equal(provenance.license,'CC0-1.0');
 assert.equal(provenance.sourcePage,'https://ambientcg.com/view?id=Grass005');
 assert.equal(provenance.licenseSource,'https://docs.ambientcg.com/license/');
 assert.deepEqual(provenance.maps.map(map=>map.file).sort(),['turf-albedo-1k.jpg','turf-normal-gl-1k.jpg']);
 let total=0;
 for(const map of provenance.maps){
  const bytes=await readFile(new URL(map.file,assetBase));total+=bytes.length;
  assert.equal(bytes.length,map.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),map.sha256);
  assert.deepEqual(jpegDimensions(bytes),{width:1024,height:1024,channels:3},map.file);
 }
 assert.equal(total,provenance.runtimeBytes);assert.ok(total<=1_000_000,`turf payload is ${total} bytes`);
 assert.equal(provenance.maps.find(map=>map.file.includes('normal')).normalConvention,'OpenGL tangent space, +Y');
});

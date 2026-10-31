import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../workout/island/vendor/three.module.js';
import {SOCCER_BALL_DIAMETER_METRES,SOCCER_PLAYER_HEIGHT_METRES,soccerMetreScale,normalizeSoccerBallGeometry,createSoccerCharacterLod,soccerPitchUv} from '../workout/island/minigames/soccer-scale.mjs';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const config=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
test('models2 pitch maps the full environment grass in metres independently of packed asset UVs',()=>{
 const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-24,0,-15,24,0,-15,-24,0,15,24,0,15,0,0,0],3));
 soccerPitchUv(geometry,48,30);assert.deepEqual([...geometry.getAttribute('uv').array],[0,0,1,0,0,1,1,1,.5,.5]);
 geometry.dispose();
});
const glbJson=name=>{
  const bytes=readFileSync(new URL('../workout/island/design/characters2/'+name+'.glb',import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
};
function skinnedSphere(){
  const geometry=new T.SphereGeometry(.4,32,24),count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(count*3).fill(.5),3));
  return geometry;
}

test('soccer uses a 22cm diameter rather than a 22cm radius beside a1.8m player',()=>{
  near(SOCCER_BALL_DIAMETER_METRES,.22);near(SOCCER_PLAYER_HEIGHT_METRES,1.8);
  near(config.physics.ballRadius*2,SOCCER_BALL_DIAMETER_METRES);near(config.view.animation.characterHeight,SOCCER_PLAYER_HEIGHT_METRES);
  const ball=new T.SphereGeometry(3.4,32,16);ball.translate(7,-3,12);normalizeSoccerBallGeometry(ball);
  near(ball.boundingSphere.radius,.11);near(ball.boundingSphere.center.length(),0);
  near(ball.boundingBox.max.y-ball.boundingBox.min.y,.22);
  ball.dispose();
});

for(const name of ['soccer-player','goalkeeper'])test(`${name} v2 actual GLB bind bounds normalize to1.8m`,()=>{
  const document=glbJson(name),primitive=document.meshes[0].primitives[0],accessor=document.accessors[primitive.attributes.POSITION];
  assert.ok(primitive.extensions.KHR_draco_mesh_compression);
  assert.equal(document.skins[0].joints.length,20);
  const sourceHeight=accessor.max[1]-accessor.min[1];
  assert.ok(sourceHeight>1&&sourceHeight<2,'unexpected source-space body height');
  near(sourceHeight*soccerMetreScale(sourceHeight,SOCCER_PLAYER_HEIGHT_METRES),1.8);
});

for(const viewport of [{width:844,height:390},{width:390,height:844}])test(`physical ball/player projected ratio stays22/180 at${viewport.width}x${viewport.height}`,()=>{
  const camera=new T.PerspectiveCamera(45,viewport.width/viewport.height,.1,100);camera.position.set(0,.9,8);camera.lookAt(0,.9,0);camera.updateMatrixWorld();
  const y=height=>new T.Vector3(0,height,0).project(camera).y*viewport.height/2;
  near(Math.abs(y(.22)-y(0))/Math.abs(y(1.8)-y(0)),22/180);
});

test('asset scaling rejects missing, zero and nonfinite spans',()=>{
  for(const span of [0,-1,NaN,Infinity,undefined])assert.throws(()=>soccerMetreScale(span,1.8),RangeError);
  for(const span of [0,-1,NaN,Infinity,undefined])assert.throws(()=>soccerMetreScale(1.2,span),RangeError);
});

test('source-derived LOD reduces a closed skinned surface without arbitrary missing faces',()=>{
  const source=skinnedSphere(),lod=createSoccerCharacterLod(source,.07);
  assert.ok(lod.index.count<source.index.count*.7,'LOD must reduce actual submitted triangles');
  assert.ok(lod.index.count>source.index.count*.15,'body silhouette must remain represented');
  near(lod.boundingBox.max.y-lod.boundingBox.min.y,.8);
  for(let i=0;i<lod.index.count;i+=3){const face=[lod.index.getX(i),lod.index.getX(i+1),lod.index.getX(i+2)];assert.equal(new Set(face).size,3);}
  const weights=lod.attributes.skinWeight,normals=lod.attributes.normal;
  for(let i=0;i<weights.count;i++){
    near(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i),1);
    near(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i)),1,1e-5);
  }
  source.dispose();lod.dispose();
});

test('LOD keeps coincident surfaces on different skin joints separate',()=>{
  const geometry=new T.BufferGeometry();
  const one=[0,0,0,.04,0,0,0,.04,0];geometry.setAttribute('position',new T.Float32BufferAttribute([...one,...one],3));
  const joints=[0,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,7,0,0,0,7,0,0,0];
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2,3,4,5]);
  const lod=createSoccerCharacterLod(geometry,.1);
  assert.equal(lod.attributes.position.count,6);assert.equal(lod.index.count,6);
  assert.deepEqual(new Set(lod.attributes.skinIndex.array),new Set([0,7]));
  geometry.dispose();lod.dispose();
});

test('normalized integer skin weights remain normalized after source LOD',()=>{
  const source=skinnedSphere(),count=source.attributes.position.count,weights=new Uint16Array(count*4);
  for(let i=0;i<count;i++){weights[i*4]=16384;weights[i*4+1]=49151;source.attributes.skinIndex.setY(i,1);}
  source.setAttribute('skinWeight',new T.BufferAttribute(weights,4,true));
  const lod=createSoccerCharacterLod(source,.07),actual=lod.attributes.skinWeight;
  assert.equal(actual.normalized,true);
  for(let i=0;i<actual.count;i++)near(actual.getX(i)+actual.getY(i)+actual.getZ(i)+actual.getW(i),1,2/65535);
  source.dispose();lod.dispose();
});

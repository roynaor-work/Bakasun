import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {seatingLayout} from './layout.mjs';

/** Two draws for every populated bowl: one seat batch, one alpha-tested crowd. */
export function createPopulation(level,texture=null) {
  const layout=seatingLayout(level);
  const group=new THREE.Group();group.name='instanced-population-lod'+level;
  // The spectator hides the cushion; retain just the visible molded backrest.
  const back=new THREE.PlaneGeometry(.50,.48);back.translate(0,.31,-.19);
  const seatGeo=mergeGeometries([back]);seatGeo.computeVertexNormals();
  const seatMat=new THREE.MeshLambertMaterial({color:0x324657,side:THREE.DoubleSide});seatMat.forceSinglePass=true;
  const seats=new THREE.InstancedMesh(seatGeo,seatMat,layout.length);seats.name='seats';
  const crowdGeo=new THREE.PlaneGeometry(.66,1.10);crowdGeo.translate(0,.54,.04);
  const variant=new Float32Array(layout.length),phase=new Float32Array(layout.length);
  const crowdMat=new THREE.MeshLambertMaterial({map:texture,alphaTest:.46,side:THREE.DoubleSide,depthWrite:true});
  crowdMat.forceSinglePass=true;
  const uniforms={arenaTime:{value:0},arenaCheer:{value:0}};
  crowdMat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float spectatorTile;attribute float spectatorPhase;
uniform float arenaTime;uniform float arenaCheer;
varying float vSpectatorTile;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vSpectatorTile=spectatorTile;
float upper=smoothstep(0.20,0.85,position.y);
transformed.x+=sin(arenaTime*1.4+spectatorPhase)*0.018*upper;
transformed.y+=sin(arenaTime*2.2+spectatorPhase)*0.009*upper*(1.0+arenaCheer*3.0);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying float vSpectatorTile;`)
      .replace('#include <map_fragment>',`#ifdef USE_MAP
vec2 tile=vec2(mod(vSpectatorTile,8.0),3.0-floor(vSpectatorTile/8.0));
vec2 atlasUv=(tile+vec2(0.018)+vMapUv*0.964)/vec2(8.0,4.0);
vec4 sampledDiffuseColor=texture2D(map,atlasUv);
diffuseColor*=sampledDiffuseColor;
#endif`);
  };
  crowdMat.customProgramCacheKey=()=> 'arena8-crowd-atlas-1';
  const crowd=new THREE.InstancedMesh(crowdGeo,crowdMat,layout.length);crowd.name='spectators';
  const dummy=new THREE.Object3D();const color=new THREE.Color();
  layout.forEach((p,i)=>{
    // Plane +Z is the front. Both long sides and ends face the playing surface.
    dummy.position.set(p.x,p.y+.13,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
    seats.setMatrixAt(i,dummy.matrix);
    dummy.position.y=p.y+.08;dummy.scale.setScalar(.93+(i*17%11)*.012);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);
    color.setHex(p.tier?0x36404b: i%13<6?0x284753:0x3a4650);seats.setColorAt(i,color);
    color.setRGB(.75+(i%7)*.025,.75+(i%7)*.025,.75+(i%7)*.025);crowd.setColorAt(i,color);
    variant[i]=(i*13+Math.floor(i/9)*7)%32;phase[i]=i*2.39996;
  });
  crowdGeo.setAttribute('spectatorTile',new THREE.InstancedBufferAttribute(variant,1));
  crowdGeo.setAttribute('spectatorPhase',new THREE.InstancedBufferAttribute(phase,1));
  for(const m of [seats,crowd]){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();m.frustumCulled=true;}
  group.add(seats,crowd);
  return {group,count:layout.length,update(time,cheer=0){uniforms.arenaTime.value=time;uniforms.arenaCheer.value=cheer;},
    dispose(){seatGeo.dispose();crowdGeo.dispose();seatMat.dispose();crowdMat.dispose();}};
}

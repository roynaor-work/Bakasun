/** CC0. Optional asset adapter; no changes to game code. three r160, no decoders. */
import {planCrowd} from './lod-policy.mjs';

export async function createLODCrowd({T, GLTFLoader, seats, base=new URL('../',import.meta.url)}) {
  const readJSON = async name => {
    const r=await fetch(new URL(name,base));
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.json();
  };
  const [manifest,config]=await Promise.all([readJSON('assets.json'),readJSON('lod-config.json')]);
  if (!Array.isArray(seats) || !seats.length || seats.length>config.instances ||
      seats.some(s => ![s.id,s.x,s.y,s.z,s.yaw].every(Number.isFinite) ||
        (s.variant!==undefined && (!Number.isInteger(s.variant) || s.variant<0 || s.variant>11))) ||
      new Set(seats.map(s=>s.id)).size!==seats.length) throw new Error('Expected 1–600 finite, uniquely identified seats');
  const root=new T.Group(), batches=[], sources=[], dummy=new T.Object3D();
  const time={value:0},cheer={value:0},ball={value:new T.Vector3()};
  let lastCamera=null, disposed=false;
  const byVariant=Array.from({length:12},(_,v)=>seats.map((s,index)=>({s,index})).filter(({s,index})=>(s.variant??(index*7+Math.floor(index/12)*5)%12)===v));
  root.name='TennisCrowdLOD';
  const metrics={instances:seats.length,triangles:0,draws:0,payloadBytes:manifest.payloadBytes};
  function dispose() {
    if(disposed)return;disposed=true;root.removeFromParent();
    for(const mesh of batches){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}
    for(const source of sources){source.geometry.dispose();source.material.dispose();}
    root.clear();
  }
  try {
    // Sequential loads also make error cleanup deterministic.
    for(const asset of manifest.assets) {
      const source=(await new GLTFLoader().loadAsync(new URL(asset.file,base).href)).scene.children[0];
      sources.push(source);
      const selected=byVariant[asset.variant], geometry=source.geometry.clone();
      geometry.setAttribute('cheerDelta',geometry.morphAttributes.position[0]);
      geometry.setAttribute('headMask',geometry.getAttribute('_head'));
      geometry.morphAttributes={};
      geometry.setAttribute('fanPhase',new T.InstancedBufferAttribute(new Float32Array(selected.length),1));
      // [lower, upper) interval in one shared noise distribution. Adjacent levels
      // use complementary intervals; no transparency sorting or double blending.
      geometry.setAttribute('lodInterval',new T.InstancedBufferAttribute(new Float32Array(selected.length*2),2).setUsage(T.DynamicDrawUsage));
      const material=source.material.clone();
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{crowdTime:time,crowdCheer:cheer,crowdBall:ball,
          headPivot:{value:new T.Vector3(...source.userData.headPivot)}});
        shader.vertexShader=`attribute vec3 cheerDelta; attribute float headMask; attribute float fanPhase;
attribute vec2 lodInterval; varying vec2 vLodInterval; varying float vFanSeed;
uniform float crowdTime; uniform float crowdCheer; uniform vec3 crowdBall; uniform vec3 headPivot;
`+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
vLodInterval=lodInterval; vFanSeed=fanPhase;
float response=smoothstep(0.0,0.7,crowdCheer*1.2-(sin(fanPhase)+1.0)*0.1);
vec3 transformed=position+cheerDelta*response;
vec3 toBall=crowdBall-instanceMatrix[3].xyz;
float localX=dot(toBall,normalize(instanceMatrix[0].xyz));
float localZ=dot(toBall,normalize(instanceMatrix[2].xyz));
float yaw=clamp(atan(localX,localZ),-0.87,0.87)*headMask;
vec3 hp=transformed-headPivot;
transformed.x=headPivot.x+cos(yaw)*hp.x+sin(yaw)*hp.z;
transformed.z=headPivot.z-sin(yaw)*hp.x+cos(yaw)*hp.z;
transformed.y+=response*abs(sin(crowdTime*6.5+fanPhase))*0.075;
transformed.z+=sin(crowdTime*1.4+fanPhase)*0.008*smoothstep(0.5,1.0,position.y);
`);
        shader.fragmentShader='varying vec2 vLodInterval; varying float vFanSeed;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
#include <clipping_planes_fragment>
float noise=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(0.06711056,0.00583715))+vFanSeed));
if(noise<vLodInterval.x || noise>=vLodInterval.y) discard;
`);
      };
      material.customProgramCacheKey=()=> 'tennis-crowd-lod-dither-v1';
      const mesh=new T.InstancedMesh(geometry,material,selected.length);
      mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.name=`Fan_${asset.variant+1}_LOD${asset.level}`;
      mesh.userData={asset,selected};root.add(mesh);batches.push(mesh);
    }
  } catch(error) {dispose();throw error;}
  function setCamera(cameraPosition) {
    if(disposed)throw new Error('Disposed crowd');
    if(!cameraPosition || cameraPosition.length!==3 || !cameraPosition.every(Number.isFinite))throw new Error('Expected local camera position [x,y,z]');
    if(lastCamera?.every((v,i)=>v===cameraPosition[i]))return metrics;
    lastCamera=[...cameraPosition];
    const plan=planCrowd(seats,cameraPosition,config);
    let draws=0;
    for(const mesh of batches) {
      const {asset,selected}=mesh.userData, intervals=mesh.geometry.getAttribute('lodInterval'), phases=mesh.geometry.getAttribute('fanPhase');
      let count=0;
      for(const {s,index} of selected) {
        const w=plan.assignments[index].weights;
        if(w[asset.level]<=0)continue;
        const lower=w.slice(0,asset.level).reduce((a,b)=>a+b,0);
        intervals.setXY(count,lower,asset.level===2?1:lower+w[asset.level]);
        phases.setX(count,(s.id*.61803398875%1)*Math.PI*2);
        dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.yaw,0);
        dummy.scale.set(.92+(s.id*37%17)/160,.92+(s.id*19%13)/100,.96+(s.id*11%13)/120);
        dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
      }
      mesh.count=count;mesh.visible=count>0;
      if(count){draws++;mesh.instanceMatrix.needsUpdate=true;intervals.needsUpdate=true;phases.needsUpdate=true;}
    }
    const {assignments,...summary}=plan;
    Object.assign(metrics,summary,{draws});
    return metrics;
  }
  return {root,batches,sources,manifest,config,metrics,setCamera,dispose,
    update({seconds,celebration=0,ballPosition=[0,1,0],cameraPosition}) {
      if(cameraPosition)setCamera(cameraPosition);
      time.value=seconds;cheer.value=T.MathUtils.clamp(celebration,0,1);ball.value.fromArray(ballPosition);
    }};
}

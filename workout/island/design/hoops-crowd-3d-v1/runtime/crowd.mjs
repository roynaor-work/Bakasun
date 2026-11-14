/** CC0 basketball crowd. three r160. GPU arm morphs/head tracking; no codecs. */
import {planCrowd} from './lod-policy.mjs';

export async function createHoopsCrowd({T, GLTFLoader, seats, base=new URL('../',import.meta.url), teamColors}) {
  const read=async file=>{const r=await fetch(new URL(file,base));if(!r.ok)throw Error(`${file}: ${r.status}`);return r.json();};
  const [manifest,config]=await Promise.all([read('assets.json'),read('lod-config.json')]);
  if(!Array.isArray(seats)||!seats.length||seats.length>800||
     seats.some(s=>![s.id,s.x,s.y,s.z,s.yaw].every(Number.isFinite)||
       (s.variant!==undefined&&(!Number.isInteger(s.variant)||s.variant<0||s.variant>11))||
       (s.team!==undefined&&s.team!==0&&s.team!==1))||new Set(seats.map(s=>s.id)).size!==seats.length)
    throw Error('Expected 1–800 finite unique seats, variant 0–11, team 0 or 1');
  const root=new T.Group(),batches=[],sources=[],dummy=new T.Object3D();root.name='HoopsCrowd3D';
  const colors=teamColors||config.teamColors;
  const uniforms={crowdTime:{value:0},crowdCheer:{value:0},crowdBall:{value:new T.Vector3(0,1,0)},
    basketTime:{value:-100},basketTeam:{value:-1},reducedMotion:{value:0},poseOverride:{value:-1},
    teamHome:{value:new T.Color(colors[0])},teamAway:{value:new T.Color(colors[1])},
    headYawLimit:{value:config.head.yawLimitRadians},headPitchLimit:{value:config.head.pitchLimitRadians},
    basketDuration:{value:config.basket.durationSeconds},jumpHeight:{value:config.basket.jumpMeters},
    reactionStagger:{value:config.basket.staggerSeconds}};
  const byVariant=Array.from({length:12},(_,v)=>seats.filter((s,i)=>(s.variant??i%12)===v));
  const metrics={instances:seats.length,triangles:0,draws:0,payloadBytes:manifest.payloadBytes};
  let lastCamera=null,disposed=false;
  function dispose(){
    if(disposed)return;disposed=true;root.removeFromParent();
    for(const m of batches){m.geometry.dispose();m.material.dispose();m.dispose();}
    for(const m of sources){m.geometry.dispose();m.material.dispose();}
    root.clear();
  }
  try{
    for(const asset of manifest.assets){
      const loaded=await new GLTFLoader().loadAsync(new URL(asset.file,base).href);
      const source=loaded.scene.children[0];sources.push(source);
      const selected=byVariant[asset.variant],g=source.geometry.clone();
      ['armsUp','clapOpen','clapClose'].forEach((name,i)=>g.setAttribute(name,g.morphAttributes.position[i]));
      g.morphAttributes={};g.setAttribute('partMask',g.getAttribute('_part'));
      g.setAttribute('fanData',new T.InstancedBufferAttribute(new Float32Array(selected.length*2),2));
      g.setAttribute('lodInterval',new T.InstancedBufferAttribute(new Float32Array(selected.length*2),2).setUsage(T.DynamicDrawUsage));
      const material=source.material.clone();
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms,{headPivot:{value:new T.Vector3(...asset.headPivot)},restPose:{value:asset.variant%3}});
        shader.vertexShader=`attribute vec3 armsUp,clapOpen,clapClose;
attribute vec4 partMask; attribute vec2 fanData,lodInterval;
varying vec2 vInterval; varying float vSeed;
uniform float crowdTime,crowdCheer,basketTime,basketTeam,reducedMotion,poseOverride,restPose;
uniform float headYawLimit,headPitchLimit,basketDuration,jumpHeight,reactionStagger;
uniform vec3 crowdBall,headPivot,teamHome,teamAway;
`+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
vColor.rgb*=mix(vec3(1.0),mix(teamHome,teamAway,fanData.y),partMask.y);
`);
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
vInterval=lodInterval;vSeed=fanData.x;
float age=crowdTime-basketTime-reactionStagger*fract(fanData.x);
float supporting=basketTeam<0.0?1.0:1.0-step(0.5,abs(fanData.y-basketTeam));
float reaction=age>=0.0&&age<basketDuration?exp(-age*1.1)*supporting:0.0;
float cheer=max(crowdCheer,reaction);
float pose=poseOverride<0.0?restPose:poseOverride;
float clap=1.0-step(0.1,abs(pose-2.0));
float up=max(1.0-step(0.1,abs(pose-1.0)),cheer);
float cycle=reducedMotion>0.5?0.0:0.5-0.5*cos(crowdTime*17.45+fanData.x);
vec3 transformed=position+armsUp*up+(clapOpen*(1.0-cycle)+clapClose*cycle)*clap*(1.0-up);
vec3 toBall=crowdBall-instanceMatrix[3].xyz;
float localX=dot(toBall,normalize(instanceMatrix[0].xyz));
float localZ=dot(toBall,normalize(instanceMatrix[2].xyz));
float yaw=clamp(atan(localX,localZ),-headYawLimit,headYawLimit)*partMask.x;
float scaleY=length(instanceMatrix[1].xyz);
float pitch=clamp(atan(toBall.y-headPivot.y*scaleY,max(0.001,length(toBall.xz))),-headPitchLimit,headPitchLimit)*partMask.x;
vec3 hp=transformed-headPivot;
hp=vec3(cos(yaw)*hp.x+sin(yaw)*hp.z,hp.y,-sin(yaw)*hp.x+cos(yaw)*hp.z);
hp=vec3(hp.x,cos(pitch)*hp.y+sin(pitch)*hp.z,-sin(pitch)*hp.y+cos(pitch)*hp.z);
transformed=hp+headPivot;
if(reducedMotion<0.5){
  transformed.y+=jumpHeight*cheer*max(0.0,sin(max(0.0,age)*9.0+fanData.x));
  transformed.z+=sin(crowdTime*1.4+fanData.x)*0.008*smoothstep(0.5,1.0,position.y);
}
`);
        shader.fragmentShader='varying vec2 vInterval;varying float vSeed;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
float noise=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(0.06711056,0.00583715))+vSeed));
if(noise<vInterval.x||noise>=vInterval.y)discard;
`);
      };
      material.customProgramCacheKey=()=> 'hoops-crowd-3d-v1';
      const mesh=new T.InstancedMesh(g,material,selected.length);
      mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.name=`Fan_${asset.variant+1}_LOD${asset.level}`;mesh.userData={asset,selected};root.add(mesh);batches.push(mesh);
    }
  }catch(error){dispose();throw error;}
  function setCamera(cameraPosition,cameraForward){
    if(disposed)throw Error('Disposed crowd');
    if(!Array.isArray(cameraPosition)||cameraPosition.length!==3||!cameraPosition.every(Number.isFinite))throw Error('Expected local camera [x,y,z]');
    if(cameraForward&&(!Array.isArray(cameraForward)||cameraForward.length!==3||!cameraForward.every(Number.isFinite)))throw Error('Expected local camera forward [x,y,z]');
    const key=[...cameraPosition,...(cameraForward||[])];
    if(lastCamera?.length===key.length&&lastCamera.every((v,i)=>v===key[i]))return metrics;
    lastCamera=key;const plan=planCrowd(seats,cameraPosition,config,cameraForward);
    const assignments=new Map(seats.map((s,i)=>[s.id,plan.assignments[i]]));
    let draws=0;
    for(const mesh of batches){
      const {asset,selected}=mesh.userData,interval=mesh.geometry.getAttribute('lodInterval'),data=mesh.geometry.getAttribute('fanData');
      let count=0;
      for(const s of selected){
        const w=assignments.get(s.id).weights;if(w[asset.level]<=0)continue;
        const low=w.slice(0,asset.level).reduce((a,b)=>a+b,0);
        interval.setXY(count,low,asset.level===2?1:low+w[asset.level]);
        data.setXY(count,(s.id*.61803398875%1)*Math.PI*2,s.team??s.id%2);
        dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.yaw,0);
        dummy.scale.set(.94+(s.id*37%11)/140,.96+(s.id*19%9)/130,.96+(s.id*11%9)/130);
        dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
      }
      mesh.count=count;mesh.visible=count>0;
      if(count){draws++;mesh.instanceMatrix.needsUpdate=true;interval.needsUpdate=true;data.needsUpdate=true;}
    }
    const {assignments:ignored,...summary}=plan;Object.assign(metrics,summary,{draws});return metrics;
  }
  return {root,batches,sources,config,manifest,metrics,setCamera,dispose,
    setTeamColors(home,away){uniforms.teamHome.value.set(home);uniforms.teamAway.value.set(away);},
    onBasket({seconds=uniforms.crowdTime.value,team=-1}={}){
      if(!Number.isFinite(seconds)||![-1,0,1].includes(team))throw Error('Expected basket seconds and team -1/0/1');
      uniforms.basketTime.value=seconds;uniforms.basketTeam.value=team;
    },
    update({seconds,celebration=0,ballPosition=[0,1,0],cameraPosition,cameraForward,reducedMotion=false,pose=-1}){
      if(disposed)throw Error('Disposed crowd');
      if(cameraPosition)setCamera(cameraPosition,cameraForward);
      uniforms.crowdTime.value=seconds;uniforms.crowdCheer.value=T.MathUtils.clamp(celebration,0,1);
      uniforms.crowdBall.value.fromArray(ballPosition);uniforms.reducedMotion.value=Number(reducedMotion);
      uniforms.poseOverride.value=pose;
    }};
}

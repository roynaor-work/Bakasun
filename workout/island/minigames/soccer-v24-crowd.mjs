/** Soccer v24 3D fans (Codex soccer-crowd-3d-v1, CC0; runtime copy in assets/soccer-v24/crowd). The adapter follows the pack's
 * runtime/crowd.mjs (same shader: team shirts, raised arms and clapping morphs, heads that follow the ball, a jump on a goal; one
 * InstancedMesh per figure and level, nothing per fan on the CPU) and its LOD policy (runtime/lod-policy.mjs, unchanged), with what
 * the match needs on top:
 *  - only the figures and levels the mode uses are fetched, in parallel (the pack loads all 36 in a row);
 *  - a fan count and a triangle limit fixed once from what the match really draws without them (soccerCrowdLimit), so the 3D fans
 *    never push the match off its quality tier (the tier machinery steps down above 130K triangles / 90 draw calls);
 *  - the plan is redone at most four times a second (the game camera moves every frame; the pack re-plans on every change);
 *  - budget mode keeps the fans on the stand the camera faces: the crowd turns half a turn with the camera at half time.
 * Presentation only. */
import {planCrowd} from '../assets/soccer-v24/crowd/runtime/lod-policy.mjs?v=island-v2-20261107-12';
import {soccerV24Url,SOCCER_CROWD_BUDGET,SOCCER_CROWD_FULL} from './soccer-v24.mjs?v=island-v2-20261107-12';

const LEVEL_COSTS=[210,90,24];
/** Fans and triangle limit for the measured scene: `scene` = triangles the match draws without the 3D fans (cards they replace still
 * counted, they are a few hundred), `draws` its draw calls. Leaves `margin` of the tier budget free. Pure. */
export function soccerCrowdLimit({scene,draws,maxTriangles,maxDrawCalls,mode,seats,margin=.015}){
  const spec=mode==='full'?SOCCER_CROWD_FULL:SOCCER_CROWD_BUDGET;
  if(mode==='full')return {fans:Math.min(seats,spec.instances),triangles:spec.triangles,levels:[...spec.levels]};
  const room=Math.floor(maxTriangles*(1-margin)-scene),triangles=Math.max(0,Math.min(spec.triangles,room)),fans=Math.min(seats,Math.floor(triangles/LEVEL_COSTS[2]));
  // every level drawn is one call per figure: LOD1 only when both levels fit next to the match's own calls
  const perLevel=spec.variants.length,levels=draws+2*perLevel<=maxDrawCalls-1?[1,2]:[2];
  return {fans:fans>=24&&draws+perLevel<=maxDrawCalls-1?fans:0,triangles,levels};
}

export async function createSoccerCrowd3d({T,GLTFLoader,seats,mode,base=soccerV24Url('crowd/'),fetcher=globalThis.fetch}){
  const spec=mode==='full'?SOCCER_CROWD_FULL:SOCCER_CROWD_BUDGET;
  const get=async name=>{const response=await fetcher(new URL(name,base));if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);return response.json();};
  const [manifest,sourceConfig]=await Promise.all([get('assets.json'),get('lod-config.json')]);
  const variants=new Set(seats.map(s=>s.variant)),wanted=manifest.assets.filter(a=>variants.has(a.variant)&&spec.levels.includes(a.level));
  const root=new T.Group(),batches=[],sources=[],dummy=new T.Object3D();root.name='SoccerCrowd3D';
  const uniforms={crowdTime:{value:0},crowdCheer:{value:0},crowdPose:{value:-1},crowdBall:{value:new T.Vector3()},homeColor:{value:new T.Color(sourceConfig.teamColors.home)},awayColor:{value:new T.Color(sourceConfig.teamColors.away)}};
  // the pack's policy, on the levels this mode loads (no LOD0 in budget mode: its near threshold is closed)
  const config={...sourceConfig,distanceThresholds:[spec.levels.includes(0)?sourceConfig.distanceThresholds[0]:0,spec.levels.includes(1)?sourceConfig.distanceThresholds[1]:0],crowdTriangleLimit:spec.triangles};
  let disposed=false,active=seats.length,levels=[...spec.levels],lastPlan=0,planned=false;
  const metrics={instances:0,triangles:0,draws:0,submitted:[0,0,0],scale:1,limit:config.crowdTriangleLimit,files:wanted.length};
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const m of batches){m.geometry.dispose();m.material.dispose();m.dispose();}for(const s of sources){s.geometry.dispose();s.material.dispose();}root.clear();}
  try{
    const loaded=await Promise.all(wanted.map(asset=>new GLTFLoader().loadAsync(new URL(asset.file,base).href).then(data=>({asset,source:data.scene.children[0]}))));
    for(const {asset,source}of loaded){
      sources.push(source);
      const selected=seats.map((s,index)=>({s,index})).filter(({s})=>s.variant===asset.variant),geometry=source.geometry.clone();
      geometry.setAttribute('raiseDelta',geometry.morphAttributes.position[0]);geometry.setAttribute('clapDelta',geometry.morphAttributes.position[1]);
      geometry.setAttribute('headMask',geometry.getAttribute('_head'));geometry.setAttribute('shirtMask',geometry.getAttribute('_shirt'));geometry.morphAttributes={};
      for(const name of ['fanPhase','fanTeam'])geometry.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(Math.max(1,selected.length)),1).setUsage(T.DynamicDrawUsage));
      const material=source.material.clone();
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms,{headPivot:{value:new T.Vector3(...asset.headPivot)}});
        shader.vertexShader=`attribute vec3 raiseDelta; attribute vec3 clapDelta;
attribute float headMask; attribute float shirtMask; attribute float fanPhase; attribute float fanTeam;
uniform float crowdTime; uniform float crowdCheer; uniform float crowdPose;
uniform vec3 crowdBall; uniform vec3 headPivot; uniform vec3 homeColor; uniform vec3 awayColor;
`+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`
#include <color_vertex>
vColor.rgb *= mix(vec3(1.0), mix(homeColor, awayColor, fanTeam), shirtMask);
`);
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
float response = smoothstep(0.0,0.8,crowdCheer*1.2-(sin(fanPhase)+1.0)*0.12);
float raised = crowdPose < -0.5 ? response*step(0.33,fract(fanPhase)) : (crowdPose < 0.5 ? 0.0 : (crowdPose < 1.5 ? 1.0 : 0.0));
float applause = crowdPose < -0.5 ? (1.0-step(0.33,fract(fanPhase)))*(0.5+0.5*response) : step(1.5,crowdPose);
float clapWeight = applause*(0.68+0.32*(0.5+0.5*cos(crowdTime*11.0+fanPhase)));
vec3 transformed = position + raiseDelta*raised + clapDelta*clapWeight;
vec3 toBall = crowdBall-instanceMatrix[3].xyz;
float localX = dot(toBall,normalize(instanceMatrix[0].xyz));
float localZ = dot(toBall,normalize(instanceMatrix[2].xyz));
float yaw = length(vec2(localX,localZ))>0.0001 ? clamp(atan(localX,localZ),-0.87,0.87)*headMask : 0.0;
vec3 hp = transformed-headPivot;
transformed.x = headPivot.x+cos(yaw)*hp.x+sin(yaw)*hp.z;
transformed.z = headPivot.z-sin(yaw)*hp.x+cos(yaw)*hp.z;
transformed.y += response*max(0.0,sin(crowdTime*7.0+fanPhase))*0.12;
`);
      };
      material.customProgramCacheKey=()=> 'soccer-crowd-3d-v1';
      const mesh=new T.InstancedMesh(geometry,material,Math.max(1,selected.length));
      mesh.name=`Fan${asset.variant+1}LOD${asset.level}`;mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.userData={asset,selected};root.add(mesh);batches.push(mesh);
    }
  }catch(error){dispose();throw error;}
  /** Re-plan for a camera given in this root's local metres (budget mode turns the root, the caller converts). */
  function plan(cameraLocal){
    if(disposed)return metrics;
    const used=seats.slice(0,active);
    if(!used.length){for(const m of batches){m.count=0;m.visible=false;}Object.assign(metrics,{instances:0,triangles:0,draws:0,submitted:[0,0,0]});return metrics;}
    const cfg={...config,distanceThresholds:[levels.includes(0)?config.distanceThresholds[0]:0,levels.includes(1)?config.distanceThresholds[1]:0]};
    const p=planCrowd(used,cameraLocal,cfg);let draws=0;
    for(const mesh of batches){
      const {asset,selected}=mesh.userData,g=mesh.geometry;let count=0;
      for(const {s,index}of selected){
        if(index>=active)continue;const w=p.assignments[index].weights;if(w[asset.level]<=0)continue;
        g.attributes.fanPhase.setX(count,(s.id*.61803398875%1)*Math.PI*2);g.attributes.fanTeam.setX(count,s.team);
        dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.yaw,0);dummy.scale.setScalar(s.scale??1);dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
      }
      mesh.count=count;mesh.visible=count>0;
      if(count){draws++;mesh.instanceMatrix.needsUpdate=true;g.attributes.fanPhase.needsUpdate=g.attributes.fanTeam.needsUpdate=true;}
    }
    Object.assign(metrics,{instances:used.length,triangles:p.triangles,draws,submitted:p.submitted,scale:+p.scale.toFixed(4),limit:cfg.crowdTriangleLimit});planned=true;return metrics;
  }
  return {root,batches,metrics,dispose,config,
    get planned(){return planned;},
    /** Fans drawn (the first `count` seats), the triangle limit and the levels allowed; the next update re-plans. */
    configure({count=seats.length,triangles=config.crowdTriangleLimit,levels:allowed=levels}={}){active=Math.max(0,Math.min(seats.length,count));config.crowdTriangleLimit=Math.max(active*LEVEL_COSTS[2],triangles);levels=allowed.filter(l=>spec.levels.includes(l));lastPlan=-1;},
    setTeamColors(home,away){uniforms.homeColor.value.set(home);uniforms.awayColor.value.set(away);},
    /** cameraLocal / ballLocal: this root's local metres. Re-plans at most every `spec.replanSeconds`. */
    update({seconds,celebration=0,ballLocal,cameraLocal,pose=-1}){
      if(disposed)return;
      if(cameraLocal&&(lastPlan<0||seconds-lastPlan>=spec.replanSeconds||seconds<lastPlan)){lastPlan=seconds;plan(cameraLocal);}
      uniforms.crowdTime.value=seconds;uniforms.crowdCheer.value=Math.max(0,Math.min(1,celebration));uniforms.crowdPose.value=pose;if(ballLocal)uniforms.crowdBall.value.copy(ballLocal);
    }};
}

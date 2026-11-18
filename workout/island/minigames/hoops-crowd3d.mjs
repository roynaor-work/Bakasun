/** Basketball v24.1 3D fans (Codex hoops-crowd-3d-v1, CC0; runtime copy in assets/hoops-v241/crowd) in the v8 hall, in place of the flat
 * cards Roy called cardboard. The shader is the pack's runtime/crowd.mjs (arms-up and clap morphs, heads that follow the ball, a staggered
 * jump for the scoring team, screen-door blends between levels; one InstancedMesh per figure and level, nothing per fan on the CPU) with one
 * change: a shirt colour per fan (team shirts for about half, everyday shirts for the rest; all-team shirts read as one blue block), and the
 * level policy is the pack's runtime/lod-policy.mjs, unchanged. What the game adds, because the pack measured 21.6 against 27.6 FPS for its
 * 800 fans (58K triangles) at 844x390 in SwiftShader:
 *  - seats: the hall's own lower tier (hoops-v8-venue seatingLayout level 0) without the near sideline, the stand under the broadcast camera
 *    (measured: never on screen in landscape), 796 fans; the cards stay on the upper deck and behind the camera;
 *  - the six seated figures only (12 draw calls at most instead of 36), with more fans at rest than with raised arms;
 *  - quality tiers (`hoopsCrowdBudget`): 24K triangles and levels 1-2 at quality 2, 10K and level 2 at quality 1 or when the hall's frame-time
 *    governor has stepped it down once, the cards again when it has stepped down twice; level 0 (210 triangles a fan) only with
 *    `?hoopsCrowd3d=full` (Codex's 70K budget, all three levels, no culling) for a comparison on a phone;
 *  - fans outside the camera's view (with a margin) are not submitted; the plan is redone at most four times a second, at once on a cut.
 * Presentation only: the simulation never reads any of it. */
import {planCrowd} from '../assets/hoops-v241/crowd/runtime/lod-policy.mjs?v=island-v2-20261107-18';

export const HOOPS_CROWD_BASE=()=>new URL('../assets/hoops-v241/crowd/',import.meta.url).href;
/** The six seated figures of the pack (variant 0-5: pose down, up, clap, down, up, clap). */
export const HOOPS_CROWD_VARIANTS=Object.freeze([0,1,2,3,4,5]);
export const HOOPS_CROWD_LEVEL_TRIANGLES=Object.freeze([210,90,24]);
/** `overlap`: the band of distances where a fan is drawn at two levels with complementary screen-door masks. The pack's 20% band left a few
 * dozen fans permanently checkered in the game camera (the plan moves in quarter-second steps, so the masks do not animate); the budget mode
 * keeps a 2% band (a fan 30 m away changes level with a small step instead). */
export const HOOPS_CROWD_MODES=Object.freeze({
  budget:Object.freeze({levels:Object.freeze([1,2]),triangles:24000,lowTriangles:10000,cull:true,replanSeconds:.25,overlap:.02}),
  full:Object.freeze({levels:Object.freeze([0,1,2]),triangles:70000,cull:false,replanSeconds:.25,overlap:null}),
});
/** Unlit vertex colours under the hall light: the grade of the lit cards beside them (measured on the v8 card crowd in the game camera). */
export const HOOPS_CROWD_TINT='#a9b3bf';
/** Everyday shirts beside the team shirts: with every fan in the team colour the stand read as one blue block (first browser check); the pack's
 * shader takes one shirt colour per fan here (`fanShirt`) instead of the two team colours. About half the fans wear their team's colour. */
export const HOOPS_CROWD_SHIRTS=Object.freeze(['#e6e6e2','#8b9097','#2b2d31','#2d3b5c','#b23a3e','#3d6e48','#c8b28d','#6f2c37','#7ea5c8','#d9cf9f']);

const hash=n=>{let x=(n+1)*2654435761>>>0;x^=x>>>15;x=Math.imul(x,2246822519)>>>0;x^=x>>>13;return (x>>>0)/4294967296;};
/** Seats with 3D fans: level-0 seats of the v8 hall, lower tier, all but the near sideline (`angle` 0 = the stand under the camera).
 * Poses: 60% arms down, 25% clapping, 15% arms up; 70% of the fans wear the home colours. Pure. */
export function hoopsCrowdSeats(layout,{homeShare=.7,max=800}={}){
  const out=[];
  for(let i=0;i<layout.length&&out.length<max;i++){
    const s=layout[i];if(s.tier!==0||Math.abs(s.angle)<1e-6)continue;
    const r=hash(i),pose=r<.6?0:r<.85?2:1,variant=pose+(hash(i+7919)<.5?0:3),team=hash(i+104729)<homeShare?0:1;
    // the team's own shirt for about half the fans (-1), an everyday shirt for the rest (index into HOOPS_CROWD_SHIRTS)
    const own=hash(i+2971)<(team===0?.5:.55),shirt=own?-1:Math.floor(hash(i+6113)*HOOPS_CROWD_SHIRTS.length);
    out.push({id:i,x:s.x,y:s.y,z:s.z,yaw:s.angle,row:s.row,variant,team,shirt});
  }
  return out;
}
/** Budget for the frame: null shows the cards (no 3D fans). `arenaLod` is the hall's current level (its frame-time governor). Pure. */
export function hoopsCrowdBudget({mode='budget',quality=2,arenaLod=0}={}){
  if(mode==='off')return null;
  if(mode==='full')return {...HOOPS_CROWD_MODES.full,levels:[...HOOPS_CROWD_MODES.full.levels],tier:'full'};
  if(arenaLod>=2||quality<1)return null;
  const b=HOOPS_CROWD_MODES.budget;
  if(quality<2||arenaLod===1)return {levels:[2],triangles:b.lowTriangles,cull:true,replanSeconds:b.replanSeconds,overlap:b.overlap,tier:'low'};
  return {levels:[...b.levels],triangles:b.triangles,cull:true,replanSeconds:b.replanSeconds,overlap:b.overlap,tier:'high'};
}
/** Which seats a view-projection matrix (column-major 16 numbers, as three.js elements) shows: the fan's chest (y + 0.7) inside the screen
 * widened by `margin` in clip space, in front of the camera. Pure. */
export function seatsInView(seats,m,margin=.3){
  const out=new Uint8Array(seats.length),lim=1+margin;
  for(let i=0;i<seats.length;i++){
    const s=seats[i],x=s.x,y=s.y+.7,z=s.z,w=m[3]*x+m[7]*y+m[11]*z+m[15];
    if(w<=.05)continue;
    const cx=(m[0]*x+m[4]*y+m[8]*z+m[12])/w,cy=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;
    out[i]=Math.abs(cx)<=lim&&Math.abs(cy)<=lim?1:0;
  }
  return out;
}

/** `load(url)` reads one GLB (the game passes loadHoopsGLTF: the browser's own body reader, see hoops-gltf.mjs); by default a GLTFLoader. */
export async function createHoopsCrowd3d({T,GLTFLoader,load=url=>new GLTFLoader().loadAsync(url),seats,mode='budget',base=HOOPS_CROWD_BASE(),teamColors,fetcher=globalThis.fetch,tint=HOOPS_CROWD_TINT}){
  const spec=mode==='full'?HOOPS_CROWD_MODES.full:HOOPS_CROWD_MODES.budget;
  const read=async file=>{const r=await fetcher(new URL(file,base));if(!r.ok)throw Error(`${file}: HTTP ${r.status}`);return r.json();};
  const [manifest,config]=await Promise.all([read('assets.json'),read('lod-config.json')]);
  const variants=new Set(seats.map(s=>s.variant)),wanted=manifest.assets.filter(a=>variants.has(a.variant)&&spec.levels.includes(a.level));
  if(!wanted.length)throw Error('Hoops crowd: no figure for these seats');
  const root=new T.Group(),batches=[],sources=[],dummy=new T.Object3D();root.name='HoopsCrowd3D';root.visible=false;
  const colors=teamColors||config.teamColors;
  const uniforms={crowdTime:{value:0},crowdCheer:{value:0},crowdBall:{value:new T.Vector3(0,1,0)},
    basketTime:{value:-100},basketTeam:{value:-1},reducedMotion:{value:0},poseOverride:{value:-1},
    teamHome:{value:new T.Color(colors[0])},teamAway:{value:new T.Color(colors[1])},
    headYawLimit:{value:config.head.yawLimitRadians},headPitchLimit:{value:config.head.pitchLimitRadians},
    basketDuration:{value:config.basket.durationSeconds},jumpHeight:{value:config.basket.jumpMeters},
    reactionStagger:{value:config.basket.staggerSeconds}};
  let disposed=false,lastPlan=-1,lastKey=null,budgetKey='',lastCam=null,plans=0;
  const metrics={status:'loading',mode,fans:seats.length,submitted:[0,0,0],instances:0,triangles:0,draws:0,inView:0,scale:1,tier:null,limit:0,plans:0,files:wanted.length};
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const m of batches){m.geometry.dispose();m.material.dispose();m.dispose();}for(const s of sources){s.geometry.dispose();s.material.dispose();}root.clear();metrics.status='disposed';}
  try{
    const loaded=await Promise.all(wanted.map(asset=>load(new URL(asset.file,base).href).then(data=>({asset,source:data.scene.children[0]}))));
    for(const {asset,source}of loaded){
      if(!source?.geometry?.morphAttributes?.position?.length||!source.geometry.getAttribute('_part'))throw Error('Hoops crowd: '+asset.file+' is not a pack figure');
      sources.push(source);
      const selected=seats.filter(s=>s.variant===asset.variant),g=source.geometry.clone();
      ['armsUp','clapOpen','clapClose'].forEach((name,i)=>g.setAttribute(name,g.morphAttributes.position[i]));
      g.morphAttributes={};g.setAttribute('partMask',g.getAttribute('_part'));
      g.setAttribute('fanData',new T.InstancedBufferAttribute(new Float32Array(Math.max(1,selected.length)*2),2).setUsage(T.DynamicDrawUsage));
      g.setAttribute('fanShirt',new T.InstancedBufferAttribute(new Float32Array(Math.max(1,selected.length)*3),3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('lodInterval',new T.InstancedBufferAttribute(new Float32Array(Math.max(1,selected.length)*2),2).setUsage(T.DynamicDrawUsage));
      const material=source.material.clone();material.color?.set(tint);
      // the pack's shader (runtime/crowd.mjs): arms-up / clap morphs, head yaw and pitch toward the ball, basket jump, the complementary
      // screen-door between two levels during a blend; one change: the shirt takes the fan's own colour (fanShirt) instead of home / away
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms,{headPivot:{value:new T.Vector3(...asset.headPivot)},restPose:{value:asset.variant%3}});
        shader.vertexShader=`attribute vec3 armsUp,clapOpen,clapClose,fanShirt;
attribute vec4 partMask; attribute vec2 fanData,lodInterval;
varying vec2 vInterval; varying float vSeed;
uniform float crowdTime,crowdCheer,basketTime,basketTeam,reducedMotion,poseOverride,restPose;
uniform float headYawLimit,headPitchLimit,basketDuration,jumpHeight,reactionStagger;
uniform vec3 crowdBall,headPivot,teamHome,teamAway;
`+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
vColor.rgb*=mix(vec3(1.0),fanShirt,partMask.y);
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
      const mesh=new T.InstancedMesh(g,material,Math.max(1,selected.length));
      mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.castShadow=mesh.receiveShadow=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.name=`Fan_${asset.variant+1}_LOD${asset.level}`;mesh.userData={asset,selected};root.add(mesh);batches.push(mesh);
    }
  }catch(error){dispose();throw error;}
  metrics.status='ready';
  const viewProj=new T.Matrix4(),camPos=new T.Vector3(),camDir=new T.Vector3(),lastPos=new T.Vector3(),lastDir=new T.Vector3();
  const everyday=HOOPS_CROWD_SHIRTS.map(h=>new T.Color(h)),shirtOf=s=>s.shirt>=0?everyday[s.shirt%everyday.length]:s.team===1?uniforms.teamAway.value:uniforms.teamHome.value;
  const clock=()=>globalThis.performance?.now?.()??Date.now();
  /** Redo the level plan for `camera` and `budget` (the pack's planCrowd on the seats in view). */
  function plan(camera,budget){
    const t0=clock();
    camera.updateMatrixWorld();viewProj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    camera.getWorldPosition(camPos);camera.getWorldDirection(camDir);lastPos.copy(camPos);lastDir.copy(camDir);
    const inView=budget.cull?seatsInView(seats,viewProj.elements):null,used=inView?seats.filter((s,i)=>inView[i]):seats;
    const levels=budget.levels,thresholds=[levels.includes(0)?config.distanceThresholds[0]:0,levels.includes(1)?config.distanceThresholds[1]:0];
    const cfg={...config,distanceThresholds:thresholds,crowdTriangleLimit:Math.max(used.length*HOOPS_CROWD_LEVEL_TRIANGLES[2],budget.triangles),
      transition:budget.overlap?{...config.transition,overlapFraction:budget.overlap}:config.transition};
    const p=used.length?planCrowd(used,camPos.toArray(),cfg,camDir.toArray()):{assignments:[],submitted:[0,0,0],triangles:0,scale:1};
    const weightsOf=new Map(used.map((s,i)=>[s.id,p.assignments[i].weights]));let draws=0;
    for(const mesh of batches){
      const {asset,selected}=mesh.userData,interval=mesh.geometry.getAttribute('lodInterval'),data=mesh.geometry.getAttribute('fanData'),shirt=mesh.geometry.getAttribute('fanShirt');let count=0;
      for(const s of selected){
        const w=weightsOf.get(s.id);if(!w||w[asset.level]<=0)continue;
        const low=w.slice(0,asset.level).reduce((a,b)=>a+b,0);
        interval.setXY(count,low,asset.level===2?1:low+w[asset.level]);
        data.setXY(count,(s.id*.61803398875%1)*Math.PI*2,s.team??s.id%2);
        const c=shirtOf(s);shirt.setXYZ(count,c.r,c.g,c.b);
        dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.yaw,0);
        dummy.scale.set(.94+(s.id*37%11)/140,.96+(s.id*19%9)/130,.96+(s.id*11%9)/130);
        dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
      }
      mesh.count=count;mesh.visible=count>0;
      if(count){draws++;mesh.instanceMatrix.needsUpdate=true;interval.needsUpdate=true;data.needsUpdate=true;shirt.needsUpdate=true;}
    }
    plans++;Object.assign(metrics,{submitted:p.submitted,instances:used.length,triangles:p.triangles,draws,inView:used.length,scale:+(+p.scale).toFixed(4),tier:budget.tier,limit:cfg.crowdTriangleLimit,plans,planMs:+(clock()-t0).toFixed(2)});
  }
  return {root,batches,metrics,config,seats,
    get visible(){return root.visible;},
    setTeamColors(home,away){uniforms.teamHome.value.set(home);uniforms.teamAway.value.set(away);lastPlan=-1;},
    /** The scoring team's fans react (staggered jump, arms up) for the pack's 3.2 s; team -1: everyone. */
    onBasket({seconds=uniforms.crowdTime.value,team=-1}={}){uniforms.basketTime.value=seconds;uniforms.basketTeam.value=team===0||team===1?team:-1;},
    /** One frame. `budget` from hoopsCrowdBudget (null hides the fans: the caller shows the cards). Re-plans at most every
     * budget.replanSeconds, at once when the budget changes or the camera jumps (a cut: over 1.5 m or 12 degrees since the last plan). */
    update({seconds,celebration=0,ballPosition,camera,budget,reducedMotion=false}){
      if(disposed)return;
      if(!budget){root.visible=false;metrics.tier=null;budgetKey='';return;}
      const key=budget.tier+'/'+budget.triangles;
      camera.getWorldPosition(camPos);camera.getWorldDirection(camDir);
      const cut=lastPlan<0||camPos.distanceTo(lastPos)>1.5||camDir.dot(lastDir)<Math.cos(12*Math.PI/180);
      if(key!==budgetKey||cut||seconds-lastPlan>=budget.replanSeconds||seconds<lastPlan){budgetKey=key;lastPlan=seconds;plan(camera,budget);}
      root.visible=true;
      uniforms.crowdTime.value=seconds;uniforms.crowdCheer.value=Math.max(0,Math.min(1,celebration));uniforms.reducedMotion.value=reducedMotion?1:0;
      if(ballPosition)uniforms.crowdBall.value.copy(ballPosition);
    },
    dispose};
}

/** Hide the v8 cards that sit on a 3D fan's seat (every level of the hall: the levels share the seat positions), and bring them back.
 * `meshes` are the hall's card InstancedMeshes (one per level). The seat backs stay. Returns {hidden, restore()}. */
export function hideCardsUnder(T,meshes,seats,{radius=.3}={}){
  // a card goes when a 3D seat is within `radius` (the coarser levels move the corner seats a little; neighbours are 0.68 m apart or more)
  const cell=1,grid=new Map(),k=(x,z)=>Math.floor(x/cell)+','+Math.floor(z/cell);
  for(const s of seats){const key=k(s.x,s.z);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}
  const near=(x,y,z)=>{const cx=Math.floor(x/cell),cz=Math.floor(z/cell);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const s of grid.get((cx+dx)+','+(cz+dz))||[])if(Math.hypot(s.x-x,s.z-z)<radius&&Math.abs(s.y-y)<.35)return true;return false;};
  const saved=[],m=new T.Matrix4(),zero=new T.Matrix4().makeScale(0,0,0);let hidden=0;
  for(const mesh of meshes){
    if(!mesh?.isInstancedMesh)continue;const e=mesh.instanceMatrix.array,list=[];
    for(let i=0;i<mesh.count;i++){if(near(e[i*16+12],e[i*16+13],e[i*16+14])){mesh.getMatrixAt(i,m);list.push([i,m.clone()]);mesh.setMatrixAt(i,zero);hidden++;}}
    if(list.length){mesh.instanceMatrix.needsUpdate=true;saved.push([mesh,list]);}
  }
  let restored=false;
  return {hidden,restore(){if(restored)return;restored=true;for(const [mesh,list] of saved){for(const [i,mat] of list)mesh.setMatrixAt(i,mat);mesh.instanceMatrix.needsUpdate=true;}}};
}

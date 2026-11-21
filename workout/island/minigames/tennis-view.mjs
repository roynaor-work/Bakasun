import {createUltraTennisCourt,createUltraTennisEffects} from './ultra-tennis-court.mjs?v=island-v2-20261107-22';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {seededRandom} from './tennis.mjs?v=island-v2-20261107-22';
import {tennisPose} from './tennis-pose.mjs?v=island-v2-20261107-22';
import {createTennisEnvironment} from './tennis-environment.mjs?v=island-v2-20261107-22';
import {v7Enabled,surfaceFor} from './tennis-v7.mjs?v=island-v2-20261107-22';
import {tennisGripEnabled,gripConfig,loadGripRacket,attachGrip,tennisReadyEnabled,readyConfig,readyStance,readyHold,tennisPoseEnabled,pose25Config,pose25Mode,hold25} from './tennis-grip.mjs?v=island-v2-20261107-22';

export async function createTennisView(canvas,config,{onQuality=()=>{},characterUrl=new URL('../assets/kid-full.glb?v=island-v2-20261107-22',import.meta.url)}={}) {
  const r=config.render, colors=r.colors, scene=new T.Scene();
  scene.background=new T.Color('#c4dcdf');scene.fog=new T.Fog('#c4dcdf',r.environment.fogNear,r.environment.fogFar);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const camera=new T.PerspectiveCamera(r.cameraFov,1,0.1,300),cameraBase=new T.Vector3(),resources=new Set();
  let cameraFollow=0,cameraInspected=false;
  let observer;
  let disposed=false,quality=0,slow=0,qualityAge=0,frameCount=0,lastEvent=0,characterLoaded=false;
  const keep=x=>(resources.add(x),x);
  const material=(color,extra={})=>keep(new T.MeshStandardMaterial({color,roughness:0.9,...extra}));
  const basic=(color,extra={})=>keep(new T.MeshBasicMaterial({color,...extra}));
  const hemi=new T.HemisphereLight('#e9f1f1','#5b6850',1.08);scene.add(hemi);
  const sun=new T.DirectionalLight('#fff1d3',2.55);sun.position.set(-9,18,8);sun.castShadow=true;
  sun.shadow.mapSize.set(r.shadowMapSize,r.shadowMapSize);Object.assign(sun.shadow.camera,{left:-12,right:12,top:15,bottom:-15,near:1,far:50});sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun);
  const dark=material('#253e38',{roughness:.65,metalness:.15});
  // Tennis v7 (design/tennis-v7, copied to assets/tennis-v7): court surface, net, ball, venue, officials and the instanced crowd.
  // It is an upgrade, never a requirement: ?tennisV7=0, the config switch or any load failure keeps the previous court and crowd.
  const params=new URLSearchParams(globalThis.location?.search||''),v7Fallbacks=[];let v7=null;
  // v25 grip (?tennisGrip=0 keeps the v24 racket): the package racket starts downloading now, in parallel with the venue; a failure keeps the old racket.
  // v25 load (Roy, 14/11/2026: "10+ seconds to load, twice"; ?tennisLoad=v24 keeps the v24 order). v24 waited for each stage before asking for the next
  // (venue, then the stadium and its 36 crowd fans one by one, then the 1.4 MB player model last), so on a phone the requests queued behind each other.
  // v25: the player model, the stadium pieces, the racket and the motion clips start downloading at once; the 3D crowd fans come after the first
  // frame (the billboard fans stand in until then); the player model is parsed once and cloned for the opponent.
  const lazyLoad=params.get('tennisLoad')!=='v24',prefetched=new Map(),loadMarks={start:globalThis.performance?.now?.()??0};
  const prefetch=url=>{const key=String(url);if(!prefetched.has(key)){const p=fetch(key).then(res=>{if(!res.ok)throw Error(key+' '+res.status);return res.arrayBuffer();});p.catch(()=>{});prefetched.set(key,p);}return prefetched.get(key);};
  class PrefetchGLTFLoader extends GLTFLoader{loadAsync(url,onProgress){const hit=prefetched.get(String(url));return hit?hit.then(buffer=>this.parseAsync(buffer,new URL('./',url).href)):super.loadAsync(url,onProgress);}}
  let motion=null;const motionApi={};
  const startMotion=()=>import('./tennis-motion.mjs?v=island-v2-20261107-22').then(async api=>{Object.assign(motionApi,api);motion=await api.loadMotion({base:import.meta.url,params});}).catch(()=>{motion=null;});
  const characterBuffer=lazyLoad?prefetch(new URL(characterUrl).href):null;
  // The motion clips and the 3D crowd fans wait for the player model's bytes, so they do not share the link with it.
  const modelArrived=lazyLoad?characterBuffer.then(()=>{},()=>{}):null;
  if(lazyLoad){modelArrived.then(startMotion);import('./tennis-v12-stadium.mjs?v=island-v2-20261107-22').then(m=>{for(const n of m.STADIUM_FILES)prefetch(new URL(`../assets/tennis-stadium-v1/${n}.glb?v=island-v2-20261107-22`,import.meta.url).href);}).catch(()=>{});}
  // v24.4 ready stance (?tennisReady=0 off): between strokes the racket is held up in front with both hands (tennis-grip.mjs readyHold).
  const readyOn=tennisReadyEnabled(),readyCfg=readyConfig(config),readyPose=readyOn?readyHold(T,readyCfg):null;
  // v24.5 (?tennisPose=0 off): the racket rises beside the head in the toss and is held a little to the side for a backhand (tennis-grip.mjs).
  const poseCfg=pose25Config(config),poseHolds=tennisPoseEnabled()?{trophy:hold25(T,poseCfg.trophy),backhand:hold25(T,poseCfg.backhand)}:null;
  const gripCfg=gripConfig(config),gripTemplate=tennisGripEnabled()?loadGripRacket({GLTFLoader,base:import.meta.url,buffer:lazyLoad?prefetch(new URL('../assets/tennis-grip-v1/racket.glb?v=island-v2-20261107-22',import.meta.url).href):undefined}).catch(()=>{v7Fallbacks.push('tennis grip racket');return null;}):null;
  if(v7Enabled(config.environment,0,params)){
    try{
      const {createTennisV7}=await import('./tennis-v7-venue.mjs?v=island-v2-20261107-22');
      v7=await createTennisV7({scene,config,keep,params,surface:surfaceFor(config.environment.v7,config.stage,params),quality:0,camera});
      if(disposed){v7.dispose();v7=null;}
    }catch(error){v7=null;v7Fallbacks.push('tennis v7 venue');}
  }
  if(v7){
    scene.add(v7.root);const look=v7.look;scene.background=new T.Color(look.background);scene.fog.color.set(look.fog);
    hemi.color.set(look.hemi[0]);hemi.groundColor.set(look.hemi[1]);hemi.intensity=look.hemi[2];sun.color.set(look.sun[0]);sun.intensity=look.sun[1];sun.position.fromArray(look.sun[2]);renderer.toneMappingExposure=look.exposure;
  }
  // v11: evening sky, skyline, sponsor boards, glow and a billboard crowd between the 3D spectators (?tennisStadium=0 removes it).
  let stadium12=null,stadium11=null;
  if(v7){try{const {createTennisV12Stadium}=await import('./tennis-v12-stadium.mjs?v=island-v2-20261107-22'),{GLTFLoader:Imported}=await import('../vendor/GLTFLoader.js'),Loader=lazyLoad?PrefetchGLTFLoader:Imported;stadium12=await createTennisV12Stadium({T,scene,renderer,hemi,sun,keep,v7,params,config,lateCrowd:lazyLoad?modelArrived:false,GLTFLoader:Loader,base:import.meta.url,camera});if(disposed&&stadium12){stadium12.dispose();stadium12=null;}}catch(error){stadium12=null;v7Fallbacks.push('tennis v12 stadium');}}
  if(v7){try{const {createTennisV11Stadium}=await import('./tennis-v11-stadium.mjs?v=island-v2-20261107-22');stadium11=await createTennisV11Stadium({T,scene,renderer,hemi,sun,keep,v7,params,config,surroundOnly:Boolean(stadium12)});if(disposed&&stadium11){stadium11.dispose();stadium11=null;}}catch(error){stadium11=null;v7Fallbacks.push('tennis v11 stadium');}}
  const courtPresentation=v7?{metrics:v7.courtMetrics}:createUltraTennisCourt(scene,config,keep,renderer),effects=createUltraTennisEffects(scene,keep);
  const environment=v7||await createTennisEnvironment(scene,config,keep,renderer,camera),rand=seededRandom(config.seed);
  const ball=v7?v7.ball:new T.Mesh(keep(new T.SphereGeometry(config.ball.radius,20,12)),material(colors.ball,{roughness:.97,emissive:colors.ball,emissiveIntensity:.16}));scene.add(ball);
  // Recessed ivory seams retain the exact physical radius and silhouette.
  if(!v7)for(const angle of [0,Math.PI]){const pts=[];for(let i=0;i<=48;i++){const t=i/48*Math.PI*2,phi=.55*Math.sin(2*t)+angle;pts.push(new T.Vector3(Math.cos(t)*Math.cos(phi),Math.sin(t),Math.cos(t)*Math.sin(phi)).multiplyScalar(config.ball.radius*1.006));}const seam=new T.Mesh(keep(new T.TubeGeometry(new T.CatmullRomCurve3(pts),48,.005,3,false)),material('#ececc7'));ball.add(seam);}
  // Contact shadows remain at every tier, including devices without shadow maps.
  const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=64;const shadeCtx=shadeCanvas.getContext('2d'),gradient=shadeCtx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(16,28,23,.48)');gradient.addColorStop(.45,'rgba(16,28,23,.22)');gradient.addColorStop(1,'rgba(16,28,23,0)');shadeCtx.fillStyle=gradient;shadeCtx.fillRect(0,0,64,64);const shadeMap=keep(new T.CanvasTexture(shadeCanvas));
  const playerShadows=[0,1].map(()=>{const m=new T.Mesh(keep(new T.PlaneGeometry(1.05,.78)),basic('#ffffff',{map:shadeMap,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;scene.add(m);return m;});
  const shadow=new T.Mesh(keep(new T.CircleGeometry(.26,20)),basic('#ffffff',{map:shadeMap,transparent:true,opacity:.8,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const ring=new T.Mesh(keep(new T.RingGeometry(.45,.55,40)),basic('#dfff55',{side:T.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  const faultMark=new T.Group(),faultMat=basic('#ff604f');
  for(const angle of [-Math.PI/4,Math.PI/4]){const bar=new T.Mesh(keep(new T.BoxGeometry(.75,.035,.10)),faultMat);bar.rotation.y=angle;faultMark.add(bar);}
  const faultRing=new T.Mesh(keep(new T.RingGeometry(.45,.51,24)),faultMat);faultRing.rotation.x=-Math.PI/2;faultMark.add(faultRing);scene.add(faultMark);
  // v25 court decals from the Codex tennis-ui-fx-v1 package (assets/tennis-ui-fx-v1, CC0): the red X on the landing point of an out ball for 1.5 s
  // (marks with an id come from the model's stopDead mode; ?tennisOut=v24 keeps the old mark), and the arrow that shows where the child will stand
  // to receive the serve (state.receive, ?tennisReceive=0 has none). Textures load in the background; until then the drawn mark stands in.
  const decalUrl=name=>new URL(`../assets/tennis-ui-fx-v1/${name}.png?v=island-v2-20261107-22`,import.meta.url).href,texLoader=new T.TextureLoader();
  const decal=(size,order)=>{const m=new T.Mesh(keep(new T.PlaneGeometry(size,size)),keep(new T.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false})));m.rotation.x=-Math.PI/2;m.renderOrder=order;m.visible=false;scene.add(m);return m;};
  const outX=decal(1.9,3),receiveArrow=decal(1.5,3),decalTex={};let outShown=null,outAge=0,lastMarkId=null;
  for(const name of ['out-cross','serve-arrow-left','serve-arrow-center','serve-arrow-right'])texLoader.loadAsync(decalUrl(name)).then(t=>{if(disposed){t.dispose();return;}t.colorSpace=T.SRGBColorSpace;decalTex[name]=keep(t);}).catch(()=>{v7Fallbacks.push('tennis decal '+name);});
  const receiveDots=[0,1,2].map(()=>{const d=new T.Mesh(keep(new T.RingGeometry(.12,.2,20)),keep(new T.MeshBasicMaterial({color:'#f3ecd2',transparent:true,opacity:.75,depthWrite:false})));d.rotation.x=-Math.PI/2;d.visible=false;scene.add(d);return d;});
  // Fixed particle pool: one draw, no geometry creation during play.
  const positions=new Float32Array(r.particles*3),particleData=Array.from({length:r.particles},()=>({vx:0,vy:0,vz:0,life:0}));
  const particleGeometry=keep(new T.BufferGeometry());particleGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const particles=new T.Points(particleGeometry,keep(new T.PointsMaterial({color:colors.accent,size:.13,transparent:true,depthWrite:false})));particles.visible=false;scene.add(particles);
  const holders=[new T.Group(),new T.Group()];holders.forEach(h=>scene.add(h));const characters=[];
  // Parse the same existing GLB twice to get independent skeletons, without a new helper dependency.
  try{
    loadMarks.venue=(globalThis.performance?.now?.()??0)-loadMarks.start;
    const buffer=lazyLoad?await characterBuffer:await (await fetch(characterUrl)).arrayBuffer();let pristine=null;
    for(let index=0;index<2;index++){
      // v25: one parse; the opponent is a skinned clone of the untouched first copy (v24 parsed the 1.4 MB file twice).
      let gltf;if(lazyLoad&&index===1&&pristine)gltf=pristine;else{gltf=await new GLTFLoader().parseAsync(lazyLoad?buffer:buffer.slice(0),'');if(lazyLoad&&index===0)pristine={scene:cloneSkinned(gltf.scene),animations:gltf.animations};}
      if(disposed){gltf.scene.traverse(disposeObject);continue;}
      const root=gltf.scene;const oldBall=root.getObjectByName('Ball');if(oldBall){oldBall.removeFromParent();disposeObject(oldBall);}root.scale.setScalar(r.characterScale);holders[index].add(root);
      const mixer=new T.AnimationMixer(root),actions={};for(const name of ['stand','run']){const clip=gltf.animations.find(c=>c.name===name);if(clip){const legs=clip.tracks.filter(track=>/^(UpperLeg|LowerLeg|Foot|Toe)_/.test(track.name));actions[name]=mixer.clipAction(new T.AnimationClip(name,clip.duration,legs)).play();}}
      if(actions.run)actions.run.setEffectiveWeight(0);
      root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material){const original=o.material;o.material=keep(original.clone());const shirt=new T.Color(index===0?r.shirtColor:config.opponentShirtColor);o.material.onBeforeCompile=shader=>{shader.uniforms.tennisShirt={value:shirt};shader.fragmentShader='uniform vec3 tennisShirt;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(diffuseColor.b>diffuseColor.r*1.4&&diffuseColor.b>diffuseColor.g*1.1) {float fabricLight=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/.22,.45,1.35);diffuseColor.rgb=tennisShirt*fabricLight;}');};original.dispose();}}});
      const bones=Object.fromEntries(['Hips','Chest','UpperArm_R','LowerArm_R','Hand_R','UpperArm_L','LowerArm_L','Hand_L','UpperLeg_L','LowerLeg_L','Foot_L','Toe_L','UpperLeg_R','LowerLeg_R','Foot_R','Toe_R'].map(name=>[name,root.getObjectByName(name)]));
      characters.push({bodyHeight:new T.Box3().setFromObject(root).getSize(new T.Vector3()).y,root,mixer,actions,bones,hand:bones.Hand_R,reachOffset:new T.Vector3(),reachSpeed:0,racketPitch:0,rest:Object.fromEntries(Object.entries(bones).filter(([,b])=>b).map(([name,b])=>[name,b.quaternion.clone()]))});
      const rk=config.animation.racket,racket=new T.Group(),frameMat=material(index===0?'#c7a367':'#e6e2cf',{roughness:.38,metalness:.35});
      const frame=new T.Mesh(keep(new T.TorusGeometry(rk.radius,rk.tube,rk.tubeSegments,rk.frameSegments)),frameMat);frame.scale.fromArray(rk.headScale);frame.position.fromArray(rk.headOffset);racket.add(frame);
      const handle=new T.Mesh(keep(new T.CylinderGeometry(.032,.036,rk.handleLength,rk.handleSegments)),dark);handle.position.y=rk.handleOffset;racket.add(handle);
      const strings=[];for(let n=-rk.stringsPerHalf;n<=rk.stringsPerHalf;n++){const t=n*rk.stringGap,len=Math.sqrt(rk.stringRadius**2-t*t),y=rk.headOffset[1],stretch=rk.headScale[1];strings.push(t,y-len*stretch,0,t,y+len*stretch,0,-len,y+t*stretch,0,len,y+t*stretch,0);}
      const wireGeometry=keep(new T.BufferGeometry());wireGeometry.setAttribute('position',new T.Float32BufferAttribute(strings,3));racket.add(new T.LineSegments(wireGeometry,keep(new T.LineBasicMaterial({color:'#edf0d1'}))));
      // Batch the detailed throat and wrapped grip into two extra draws.
      const throatParts=[];for(const sign of [-1,1]){const g=new T.CylinderGeometry(.018,.022,.29,6);g.rotateZ(sign*-.34);g.translate(sign*.065,-.63,0);throatParts.push(g);}
      const cap=new T.CylinderGeometry(.044,.04,.038,8);cap.translate(0,-.025,0);throatParts.push(cap);
      const throatGeometry=keep(mergeGeometries(throatParts,false));throatParts.forEach(g=>g.dispose());racket.add(new T.Mesh(throatGeometry,frameMat));
      const gripParts=[];for(let n=0;n<8;n++){const g=new T.TorusGeometry(.037,.006,3,8);g.rotateX(Math.PI/2);g.translate(0,-.09-n*.034,0);gripParts.push(g);}
      const gripGeometry=keep(mergeGeometries(gripParts,false));gripParts.forEach(g=>g.dispose());racket.add(new T.Mesh(gripGeometry,material('#ddd7be')));
      characters[index].hand?.add(racket);characters[index].racketHead=frame;characters[index].oldRacket=racket;
    }
    characterLoaded=characters.length===2;loadMarks.characters=(globalThis.performance?.now?.()??0)-loadMarks.start;
    // v25: swap in the held racket (fixed grip contract, fingers closed); the v24 racket stays if the package racket did not load.
    const template=gripTemplate?await gripTemplate:null;
    if(template&&!disposed)for(const ch of characters){if(!ch.hand)continue;const fingers=Object.fromEntries(['Finger0_R','Finger1_R','Finger2_R','Finger3_R','Finger4_R'].map(n=>[n,ch.root.getObjectByName(n)]));
      const grip=attachGrip(T,{hand:ch.hand,fingers,template,cfg:gripCfg});ch.oldRacket.visible=false;ch.grip=grip;ch.racketHead=grip.head;}
  }catch(error){dispose();throw error;}
  function disposeObject(o){if(o.isSkinnedMesh)o.skeleton?.dispose();o.geometry?.dispose();for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}}
  observer=new ResizeObserver(resize);observer.observe(canvas);
  function positionCamera(){camera.position.copy(cameraBase);camera.position.x+=cameraFollow;camera.lookAt(r.cameraTarget[0]+cameraFollow*.45,r.cameraTarget[1],r.cameraTarget[2]);}
  function resize(){if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;camera.aspect=w/h;cameraBase.fromArray(w>h?r.cameraLandscape:r.cameraPortrait);if(!cameraInspected)positionCamera();camera.updateProjectionMatrix();renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio||1,r.pixelRatios[quality]));}
  function setQuality(q){quality=Math.min(r.pixelRatios.length-1,q);renderer.shadowMap.enabled=r.shadowEnabled[quality];sun.castShadow=r.shadowEnabled[quality];environment.setQuality(quality);resize();onQuality(quality);}
  function observeFrame(milliseconds){if(disposed)return;v7?.observe(milliseconds);qualityAge+=milliseconds/1000;if(milliseconds>r.slowFrameMs)slow++;else slow=Math.max(0,slow-1);if(slow>=r.slowSamples&&qualityAge>=r.qualityCooldown&&quality<r.pixelRatios.length-1){slow=0;qualityAge=0;setQuality(quality+1);}}
  function burst(x,z){for(let i=0;i<r.particles;i++){const p=particleData[i];p.life=r.particleSeconds;p.vx=(rand()-.5)*5;p.vy=2+rand()*4;p.vz=(rand()-.5)*5;positions.set([x,.4,z],i*3);}particles.visible=true;}
  // tennis motion v1 (Codex clips): thighs, shins and spine follow the clip; arms and racket stay with the contact IK.
  if(!lazyLoad)startMotion();
  const LEG_MAP=[['Spine','Spine','Chest'],['Chest','Chest',null],['LeftUpLeg','UpperLeg_L','LowerLeg_L'],['LeftLeg','LowerLeg_L','Foot_L'],['RightUpLeg','UpperLeg_R','LowerLeg_R'],['RightLeg','LowerLeg_R','Foot_R']];
  function applyMotion(ch,i,state,p,dt){
    if(!motion)return;
    const name=motionApi.clipFor({index:i,player:p,phase:state.phase,serving:p.serving,tossing:state.phase==='toss'&&state.server===i,winner:state.event?.winner},motion.clips),m=ch.motion||(ch.motion={name:null,time:0,from:null,blend:1,dirs:null,w:0});
    // Clips the package did not admit (standing, running right, celebration) return null: the game's own pose is kept, and the clip pose is faded in/out
    // over 0.15 s against the pose the bones already hold, so nothing pops on entering or leaving a clip.
    m.w=T.MathUtils.clamp(m.w+(name?1:-1)*dt/.15,0,1);
    if(name){
      const clip=motion.clips[name];
      if(m.name!==name){m.from=m.dirs;m.name=name;m.time=0;m.blend=m.from?0:1;}
      const stroke=p.swing>0&&state.phase==='rally'&&!p.serving&&/^(forehand|backhand)/.test(name);
      if(stroke)m.time=motionApi.strokeTime(clip,1-p.swing/(p.swingDuration||config.player.swingSeconds),config.animation.contactFraction);
      else if(name==='serve_toss')m.time=Math.min(clip.dur,(state.tossProgress||0)*clip.dur);
      else m.time+=dt*(/^run/.test(name)?T.MathUtils.clamp(Math.hypot(p.vx||0,p.vz||0)/3.5,.6,1.6):1);
      m.blend=Math.min(1,m.blend+dt/.15);
      const dirs=motionApi.segmentDirections(motion.bones,motionApi.sampleClip(clip,m.time));m.dirs=dirs;m.shown=m.from&&m.blend<1?motionApi.blendDirections(m.from,dirs,T.MathUtils.smoothstep(m.blend,0,1)):dirs;
    }else if(m.name){m.name=null;m.from=null;}
    ch.motionName=name;
    if(m.w<=0||!m.shown)return;
    const rootQ=ch.root.getWorldQuaternion(new T.Quaternion()),rootInv=rootQ.clone().invert(),weight=T.MathUtils.smoothstep(m.w,0,1);
    for(const [key,boneName,childName] of LEG_MAP){
      const bone=ch.bones[boneName];if(!bone)continue;
      const child=childName?ch.bones[childName]:(ch.bones.UpperChest||ch.bones.Neck);if(!child)continue;
      bone.parent.updateWorldMatrix(true,false);bone.updateWorldMatrix(false,false);child.updateWorldMatrix(true,false);
      const own=child.getWorldPosition(new T.Vector3()).sub(bone.getWorldPosition(new T.Vector3())).applyQuaternion(rootInv).normalize(),
        goal=new T.Vector3(...m.shown[key]).lerp(own,1-weight).normalize(),
        parentQ=bone.parent.getWorldQuaternion(new T.Quaternion()),rest=ch.rest[boneName],restDir=child.position.clone().normalize().applyQuaternion(rest),
        target=goal.applyQuaternion(rootQ).applyQuaternion(parentQ.clone().invert());
      bone.quaternion.copy(new T.Quaternion().setFromUnitVectors(restDir,target.normalize()).multiply(rest));bone.updateMatrixWorld(true);
    }
  }
  function render(state,dt=0){
    if(disposed)return;
    if(!cameraInspected&&dt>0){const target=T.MathUtils.clamp(state.players[0].x*.35+state.ball.x*.12,-.65,.65),change=(target-cameraFollow)*(1-Math.exp(-dt*2.8));cameraFollow+=T.MathUtils.clamp(change,-dt*.8,dt*.8);positionCamera();}
    ball.position.set(state.ball.x,state.ball.y+.09,state.ball.z);ball.visible=state.phase!=='complete';
    const flightSpeed=Math.hypot(state.ball.vx||0,state.ball.vz||0),spinRate=T.MathUtils.clamp(state.ball.spin??.3,-1,1)*28;
    if(flightSpeed>.01){ball.rotation.x+=dt*state.ball.vz/flightSpeed*spinRate;ball.rotation.z-=dt*state.ball.vx/flightSpeed*spinRate;}
    shadow.position.set(state.ball.x,.11,state.ball.z);shadow.scale.setScalar(1+state.ball.y*.12);shadow.material.opacity=.6/(1+state.ball.y*.15);shadow.visible=ball.visible;
    ring.visible=Boolean(state.landing&&state.phase==='rally');
    if(ring.visible){const incoming=state.contact?.side===0&&state.ball.lastHitter===1,ready=incoming&&state.contactWindow?.eligible,prepared=incoming&&state.players[0].preparing,cue=incoming&&state.ball.bounces===1?state.contact:state.landing;
      ring.position.set(cue.x,.115,cue.z);ring.material.color.set(!state.landing.valid?'#e69077':ready?'#e7efb4':prepared?'#f5e7a5':'#e3cea0');ring.material.opacity=incoming?(ready?.96:prepared?.85:.65):.32;
      const anticipation=incoming?T.MathUtils.clamp(state.contact.eta,0,1)*.18:0;ring.scale.setScalar(1+anticipation+(ready||prepared?Math.sin(state.elapsed*7)*.035:0));}
    characters.forEach((ch,i)=>{
      const p=state.players[i];holders[i].position.set(p.x,.09,p.z);holders[i].rotation.y=i===0?Math.PI:0;playerShadows[i].position.set(p.x,.093,p.z);
      // Only leg tracks are played. Hips keep their bind orientation toward the
      // net, and every upper-body pose starts from bind to prevent accumulation.
      for(const [name,bone]of Object.entries(ch.bones))if(bone)bone.quaternion.copy(ch.rest[name]);
      const reachGait=Math.min(.4,ch.reachSpeed/3.2*.4);ch.actions.run?.setEffectiveWeight(p.running?1:reachGait);ch.actions.stand?.setEffectiveWeight(0);if(p.running||reachGait>.01)ch.mixer.update(dt);
      const pose=tennisPose(p,config,{toss:state.phase==='toss'&&state.server===i,tossProgress:state.tossProgress||0});
      // v24.4: ease into the ready hold between strokes and out of it for the backswing, the serve and the toss.
      if(readyPose){const goal=readyStance(p,{phase:state.phase,server:state.server,index:i})?1:0;ch.readyW=T.MathUtils.clamp((ch.readyW??goal)+Math.sign(goal-(ch.readyW??goal))*Math.max(0,dt)/readyCfg.blend,0,1);
        const w=ch.readyW*ch.readyW*(3-2*ch.readyW);if(w>0)for(const k of ['rightHand','rightElbow','leftHand','leftElbow'])pose[k]=pose[k].map((v,j)=>v+(readyPose[k][j]-v)*w);ch.readyEase=w;}
      if(poseHolds){const want=pose25Mode(p,{phase:state.phase,server:state.server,index:i,contact:state.contact,lastHitter:state.ball.lastHitter});let goal=want?1:0;
        if(want&&ch.pose25&&want!==ch.pose25&&ch.pose25W>0)goal=0;else if(want)ch.pose25=want;/* a new hold waits until the old one has eased out */
        const seconds=ch.pose25==='trophy'&&goal?poseCfg.tossRise:poseCfg.blend;ch.pose25W=T.MathUtils.clamp((ch.pose25W||0)+Math.sign(goal-(ch.pose25W||0))*Math.max(0,dt)/seconds,0,1);
        const w=ch.pose25W*ch.pose25W*(3-2*ch.pose25W),h=ch.pose25&&poseHolds[ch.pose25];ch.pose25Ease=h?w:0;
        if(h&&w>0){for(const k of ['rightHand','rightElbow','leftHand','leftElbow'])if(h[k])pose[k]=pose[k].map((v,j)=>v+(h[k][j]-v)*w);pose.chest+=(h.chest||0)*w;}}
      ch.root.position.set(0,0,pose.step);
      if(!p.running){ch.bones.UpperLeg_L.rotation.x-=pose.step*1.6;ch.bones.LowerLeg_L.rotation.x+=pose.knee;ch.bones.Foot_L.rotation.x-=pose.knee*.5;ch.bones.LowerLeg_R.rotation.x+=pose.knee*.5;}
      ch.bones.Chest.rotation.y+=pose.chest;ch.root.updateWorldMatrix(true,true);
      applyMotion(ch,i,state,p,dt);ch.root.updateWorldMatrix(true,true);
      const rk=config.animation.racket,u=1-p.swing/(p.swingDuration||config.player.swingSeconds);
      const base=p.serving||state.phase==='toss'&&state.server===i?rk.serveRotation:p.stroke==='backhand'?rk.backhandRotation:rk.handRotation,rotation=[...base];
      if(p.swing>0){let follow=T.MathUtils.clamp((u-config.animation.contactFraction)/(config.animation.recoveryFraction-config.animation.contactFraction),0,1);follow=follow*follow*(3-2*follow);const end=p.serving?rk.serveFollowAngle:(p.stroke==='backhand'?-1:1)*rk.followAngle;rotation[2]=T.MathUtils.lerp(base[2],end,follow);}
      const contactWeight=p.swing>0&&p.contactPoint?Math.max(0,1-Math.abs(u-config.animation.contactFraction)/config.animation.contactBlend):0,contactIKWeight=T.MathUtils.smoothstep(contactWeight,0,.75);
      // Begin a small stride while the incoming ball is nearby, then recover at
      // the same bounded speed. World-space presentation offsets never alter
      // player coordinates, and are applied BEFORE the original arm IK.
      const reachTarget=new T.Vector3(),incoming=state.phase==='rally'&&state.contact?.side===i&&state.ball.lastHitter!==i,eta=state.contact?.eta;
      const anticipating=incoming&&eta>=0&&eta<=.45&&Math.hypot(state.contact.x-p.x,state.contact.z-p.z)<=(i===0?state.attributes.reach:config.player.reach*1.25)+.55;
      const contact=contactWeight>0&&!p.serving?p.contactPoint:anticipating?state.contact:null;
      // A slight wrist pitch uses the existing racket shaft to cover depth;
      // a purely vertical racket would force even a legal low ball beyond the
      // original forearm's reach. Anticipate/recover this rotation continuously.
      const localDepth=contact?ch.root.worldToLocal(new T.Vector3(contact.x,(contact.y??config.ball.hitHeight)+.09,contact.z)).z:0,targetPitch=contact?-T.MathUtils.clamp((localDepth-.3)*.32,0,.35):0,pitchChange=(targetPitch-ch.racketPitch)*(1-Math.exp(-Math.max(0,dt)*18));
      ch.racketPitch+=T.MathUtils.clamp(pitchChange,-Math.max(0,dt)*2,Math.max(0,dt)*2);rotation[0]+=ch.racketPitch;
      const handRotation=new T.Quaternion().setFromEuler(new T.Euler(...rotation));if(readyPose&&ch.readyEase>0)handRotation.slerp(readyPose.quaternion,ch.readyEase);if(poseHolds&&ch.pose25Ease>0)handRotation.slerp(poseHolds[ch.pose25].quaternion,ch.pose25Ease);
      // v25 grip: `rotation` is still the racket's orientation; the hand is turned so the racket held in it points there, and the IK aims the real head.
      if(ch.grip)handRotation.multiply(ch.grip.correction);const headOffset=()=>ch.grip?ch.grip.headLocal.clone():new T.Vector3(...rk.headOffset);
      if(contact){
        // The wrist target must be reachable by the original arm lengths.
        // Solve the horizontal deficit at this height, including the racket
        // head offset, instead of estimating a step from the authored pose.
        const shoulder=ch.bones.UpperArm_R.getWorldPosition(new T.Vector3()),elbow=ch.bones.LowerArm_R.getWorldPosition(new T.Vector3()),palm=ch.hand.getWorldPosition(new T.Vector3()),armLength=shoulder.distanceTo(elbow)+elbow.distanceTo(palm)-config.animation.ikEpsilon;
        const wristLocal=ch.root.worldToLocal(new T.Vector3(contact.x,(contact.y??config.ball.hitHeight)+.09,contact.z)).sub(headOffset().applyQuaternion(handRotation)),wrist=ch.root.localToWorld(wristLocal),dy=wrist.y-shoulder.y;
        const horizontal=Math.hypot(wrist.x-shoulder.x,wrist.z-shoulder.z),available=Math.sqrt(Math.max(0,armLength*armLength-dy*dy)),deficit=Math.max(0,horizontal-available);
        if(deficit>.005)reachTarget.set(wrist.x-shoulder.x,0,wrist.z-shoulder.z).setLength(Math.min(.55,deficit+.065));
      }
      const reachChange=reachTarget.sub(ch.reachOffset),reachDistance=reachChange.length(),reachStep=Math.min(reachDistance*(1-Math.exp(-Math.max(0,dt)*18)),Math.max(0,dt)*3.2);
      if(reachDistance>1e-6)ch.reachOffset.addScaledVector(reachChange,reachStep/reachDistance);ch.reachSpeed=dt>0?reachStep/dt:0;
      const localReach=ch.reachOffset.clone().applyQuaternion(holders[i].getWorldQuaternion(new T.Quaternion()).invert());ch.root.position.add(localReach);ch.root.updateWorldMatrix(true,true);
      playerShadows[i].position.x+=ch.reachOffset.x;playerShadows[i].position.z+=ch.reachOffset.z;ch.displayLunge=ch.reachOffset.length();
      for(const [suffix,elbow,hand]of [['R',pose.rightElbow,pose.rightHand],['L',pose.leftElbow,pose.leftHand]]){
        const wrist=new T.Vector3(...hand);
        if(suffix==='R'&&contactWeight>0){
          const hit=ch.root.worldToLocal(new T.Vector3(p.contactPoint.x,p.contactPoint.y+.09,p.contactPoint.z));
          const offset=headOffset().applyQuaternion(handRotation);
          wrist.lerp(hit.sub(offset),contactIKWeight);
        }
        poseArm(ch.bones['UpperArm_'+suffix],ch.bones['LowerArm_'+suffix],ch.bones['Hand_'+suffix],ch.root.localToWorld(new T.Vector3(...elbow)),ch.root.localToWorld(wrist));
      }
      const world=ch.root.getWorldQuaternion(new T.Quaternion()).multiply(handRotation),parent=ch.hand.parent.getWorldQuaternion(new T.Quaternion());
      ch.hand.quaternion.copy(parent.invert().multiply(world));ch.root.updateWorldMatrix(true,true);
      ch.contactWeight=contactWeight;ch.contactIKWeight=contactIKWeight;ch.contactDistance=p.contactPoint?ch.racketHead.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(p.contactPoint.x,p.contactPoint.y+.09,p.contactPoint.z)):null;
    });
    // The ball rests in the original off-hand before the real toss begins.
    // Rally/toss coordinates, contact IK and all shot timing stay model-owned.
    if(state.phase==='serve'&&characters[state.server]){characters[state.server].bones.Hand_L.getWorldPosition(ball.position);ball.position.y+=config.ball.radius*.65;}
    // v25: a mark with an id (stopDead) shows the Codex X on an out's landing point for its own 1.5 s; v24 marks keep the drawn X until the next shot.
    const mark=state.faultMark;if(mark?.id!==undefined&&mark.id!==lastMarkId){lastMarkId=mark.id;outShown=mark.reason==='out'?{...mark}:null;outAge=0;}/* each mark once: the model keeps it through the second serve */
    if(outShown){outAge+=dt;if(outAge>=1.5)outShown=null;}
    const xTex=decalTex['out-cross'],showX=Boolean(outShown);outX.visible=showX&&Boolean(xTex);if(outX.visible){outX.material.map=xTex;outX.material.needsUpdate=outX.material.map!==outX.userData.map;outX.userData.map=xTex;outX.position.set(outShown.x,.1,outShown.z);}
    faultMark.visible=mark?.id!==undefined?showX&&!xTex:Boolean(mark);if(faultMark.visible){const at=mark?.id!==undefined?outShown:mark;faultMark.position.set(at.x,.13,at.z);}
    // v25: where the child will stand to receive: the arrow in front of the chosen spot (pointing at the net) and three dots on the baseline.
    const rc=state.receive,choosing=Boolean(rc?.active)&&['serve','toss'].includes(state.phase)&&state.server===1;
    const arrowTex=choosing?decalTex[['serve-arrow-left','serve-arrow-center','serve-arrow-right'][rc.slot]]:null;receiveArrow.visible=Boolean(arrowTex);
    if(arrowTex){if(receiveArrow.material.map!==arrowTex){receiveArrow.material.map=arrowTex;receiveArrow.material.needsUpdate=true;}const z=config.court.halfLength+config.serve.baselineMargin-1.75;receiveArrow.position.set(rc.x,.1,z);}
    receiveDots.forEach((d,k)=>{d.visible=choosing;if(choosing){d.position.set(rc.slots[k],.1,config.court.halfLength+config.serve.baselineMargin+.05);d.material.opacity=k===rc.slot?.95:.45;d.scale.setScalar(k===rc.slot?1.25:1);}});
    environment.render(state,dt);stadium12?.update(state,dt);effects.update(state,dt,camera);
    if(state.event.id!==lastEvent){lastEvent=state.event.id;if(state.event.ace||state.event.type==='complete'&&state.result?.won)burst(state.players[0].x,state.players[0].z);}
    let active=0;for(let i=0;i<particleData.length;i++){const p=particleData[i];if(p.life>0){p.life-=dt;positions[i*3]+=p.vx*dt;positions[i*3+1]+=p.vy*dt;positions[i*3+2]+=p.vz*dt;p.vy-=5*dt;active++;}else positions[i*3+1]=-10;}
    particles.visible=active>0;if(active)particleGeometry.attributes.position.needsUpdate=true;
    renderer.render(scene,camera);frameCount++;
  }
  function poseArm(arm,forearm,hand,guide,wrist){
    const shoulder=arm.getWorldPosition(new T.Vector3()),elbow=forearm.getWorldPosition(new T.Vector3()),palm=hand.getWorldPosition(new T.Vector3());
    const upper=shoulder.distanceTo(elbow),lower=elbow.distanceTo(palm),epsilon=config.animation.ikEpsilon;
    const axis=wrist.clone().sub(shoulder),distance=T.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+epsilon,upper+lower-epsilon);axis.normalize();
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
    const bend=guide.sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<epsilon)bend.set(0,0,1).addScaledVector(axis,-axis.z);bend.normalize();
    const target=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
    aimBone(arm,forearm,target);aimBone(forearm,hand,shoulder.addScaledVector(axis,distance));
  }
  function aimBone(bone,child,target){
    if(!bone||!child)return;
    const origin=bone.getWorldPosition(new T.Vector3()),parent=bone.parent.getWorldQuaternion(new T.Quaternion());
    const direction=target.sub(origin).normalize().applyQuaternion(parent.invert());
    bone.quaternion.setFromUnitVectors(child.position.clone().normalize(),direction);bone.updateWorldMatrix(false,true);
  }
  // v24.5 measurement (read only): racket head, hand and head in the player's own frame (x racket side, y up, z forward) and on screen.
  function pose25(){const local=(ch,o)=>{if(!o)return null;const v=ch.root.worldToLocal(o.getWorldPosition(new T.Vector3()));return [+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(2)];},
    screen=o=>{if(!o)return null;const v=o.getWorldPosition(new T.Vector3()).project(camera);return [Math.round((v.x+1)*canvas.clientWidth/2),Math.round((1-v.y)*canvas.clientHeight/2)];};
   return characters.map(ch=>{const head=ch.headBone||(ch.headBone=ch.root.getObjectByName('Head'));return {on:Boolean(poseHolds),mode:ch.pose25Ease>0?ch.pose25:'none',w:+(ch.pose25Ease||0).toFixed(2),racket:local(ch,ch.racketHead),hand:local(ch,ch.hand),head:local(ch,head),screen:{racket:screen(ch.racketHead),hand:screen(ch.hand),head:screen(head),hips:screen(ch.bones.Hips)}};});}
  function metrics(){return {pose25:pose25(),decals:{outX:outX.visible,outXAt:outX.visible?[+outX.position.x.toFixed(2),+outX.position.z.toFixed(2)]:null,drawnX:faultMark.visible,receiveArrow:receiveArrow.visible,receiveArrowX:receiveArrow.visible?+receiveArrow.position.x.toFixed(2):null},load:{mode:lazyLoad?'v25':'v24',venueMs:Math.round(loadMarks.venue??-1),charactersMs:Math.round(loadMarks.characters??-1),prefetched:prefetched.size,crowd:stadium12?.metrics?.crowd??null,crowdLate:stadium12?.metrics?.crowdLate??null},grip:characters.map(c=>c.grip?{curled:c.grip.curled.length,racket:'tennis-grip-v1'}:null),ready:characters.map(c=>{const hand=c.hand?.getWorldPosition(new T.Vector3()),head=c.racketHead?.getWorldPosition(new T.Vector3());return {on:Boolean(readyPose),ease:+(c.readyEase||0).toFixed(2),headAboveHand:hand&&head?+(head.y-hand.y).toFixed(3):null};}),tennisV7:false,stadium11:stadium11?.metrics??null,stadium12:stadium12?.metrics??null,motion:{loaded:Boolean(motion),clips:characters.map(c=>c.motionName||null)},v7Fallbacks,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,quality,pixelRatio:renderer.getPixelRatio(),...environment.metrics(),...courtPresentation.metrics(),...effects.metrics(),ballSurfaceOffset:.09,cameraFollow,cameraInspected,reachOffsetLimit:.55,reachSpeedLimit:3.2,shadows:renderer.shadowMap.enabled,characterLoaded,shirtColors:[r.shirtColor,config.opponentShirtColor],frames:frameCount,disposed,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,rig:characters.map((ch,i)=>({bodyHeight:ch.bodyHeight,facing:holders[i].rotation.y,hips:ch.bones.Hips.rotation.toArray().slice(0,3),chest:ch.bones.Chest.rotation.toArray().slice(0,3),rightArm:ch.bones.UpperArm_R.quaternion.toArray(),legs:['UpperLeg_L','LowerLeg_L','Foot_L','UpperLeg_R','LowerLeg_R','Foot_R'].map(n=>ch.bones[n].quaternion.toArray()),step:ch.root.position.z,reachOffset:ch.reachOffset.toArray(),reachSpeed:ch.reachSpeed,displayLunge:ch.displayLunge,contactWeight:ch.contactWeight,contactIKWeight:ch.contactIKWeight,contactDistance:ch.contactDistance,rightHand:ch.hand.getWorldPosition(new T.Vector3()).toArray(),racketHead:ch.racketHead.getWorldPosition(new T.Vector3()).toArray()}))};}
  function dispose(){if(disposed)return;disposed=true;observer?.disconnect();v7?.dispose();stadium11?.dispose();stadium12?.dispose();sun.shadow.dispose?.();characters.forEach(c=>{c.mixer.stopAllAction();c.mixer.uncacheRoot(c.root);});scene.traverse(disposeObject);resources.forEach(o=>o.dispose?.());resources.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear();}
  setQuality(0);resize();
  return {render,observeFrame,metrics,dispose,setQuality,playerScreenPosition(s){const v=new T.Vector3(s.players[0].x,1.2,s.players[0].z).project(camera);return {x:(v.x+1)*canvas.clientWidth/2,y:(1-v.y)*canvas.clientHeight/2};},inspectCamera(position,target){cameraInspected=Boolean(position);if(position){camera.position.fromArray(position);camera.lookAt(...target);}else positionCamera();camera.updateProjectionMatrix();}};
}

/** Keep the same round alive when a GPU context cannot be used. */
export function createTennisFallback(canvas,config){
 const surface=canvas.cloneNode();surface.classList.add('tennis-fallback');canvas.hidden=true;canvas.after(surface);const p=surface.getContext('2d');let disposed=false;
 return {playerScreenPosition(s){const scale=Math.min(surface.clientWidth/(config.court.halfWidth*3),surface.clientHeight/(config.court.halfLength*2.5));return {x:surface.clientWidth/2+s.players[0].x*scale,y:surface.clientHeight/2+s.players[0].z*scale-1.2*scale};},metrics(){return {mode:'canvas',triangles:0,drawCalls:0,characterLoaded:false,shirtColors:[config.render.shirtColor,config.opponentShirtColor],disposed};},observeFrame(){},dispose(){if(disposed)return;disposed=true;surface.remove();canvas.hidden=false;},render(s){if(disposed)return;const w=surface.clientWidth,h=surface.clientHeight;surface.width=w;surface.height=h;p.fillStyle=config.render.colors.apron;p.fillRect(0,0,w,h);const scale=Math.min(w/(config.court.halfWidth*3),h/(config.court.halfLength*2.5)),project=(x,z)=>[w/2+x*scale,h/2+z*scale];p.strokeStyle=config.render.colors.line;p.lineWidth=2;const [x,y]=project(-config.court.halfWidth,-config.court.halfLength);p.strokeRect(x,y,config.court.halfWidth*2*scale,config.court.halfLength*2*scale);p.beginPath();p.moveTo(x,h/2);p.lineTo(w-x,h/2);p.stroke();s.players.forEach((v,i)=>{const [x,z]=project(v.x,v.z);p.fillStyle=i?config.opponentShirtColor:config.render.shirtColor;p.fillRect(x-8,z-14,16,22);p.fillStyle='#edac78';p.beginPath();p.arc(x,z-20,7,0,Math.PI*2);p.fill();});const [bx,bz]=project(s.ball.x,s.ball.z);p.fillStyle=config.render.colors.ball;p.beginPath();p.arc(bx,bz-s.ball.y*scale,Math.max(3,config.ball.radius*scale),0,Math.PI*2);p.fill();}};
}

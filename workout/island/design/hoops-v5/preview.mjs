import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {HoopsDRACOLoader} from '../../minigames/hoops-draco.mjs';
import {loadHoopsGLTF} from '../../minigames/hoops-gltf.mjs';
import {createFloorReflection,REFLECTION_LAYER} from '../../minigames/hoops-reflection.mjs';

const $=s=>document.querySelector(s),canvas=$('#arena');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const capture=new URLSearchParams(location.search).has('capture');
let renderer,reflection,mixer,ball,ballSample,crowdMesh,loaded={},envTarget,pmrem;
let paused=reduced.matches,economy=false,dirty=true,view='arena',ready=false,last=performance.now(),elapsed=0;
const scene=new THREE.Scene();scene.background=new THREE.Color('#08131b');
scene.fog=new THREE.FogExp2('#08131b',.009);
const camera=new THREE.PerspectiveCamera(56,1,.03,180);
const aim=new THREE.Vector3(),direction=new THREE.Vector3();
const orbit={yaw:.72,pitch:.56,distance:40};
const product=new THREE.Group();product.visible=false;scene.add(product);
const clock=new THREE.Clock();
const geometryResources=new Set(),materialResources=new Set(),textureResources=new Set();

const labels={arena:['מבט אולם','אולם מלא. אור ממוקד. רגע לפני השריקה.'],floor:['מבט פרקט','מייפל טבעי, לכה עדינה והשתקפות חיה.'],crowd:['מבט יציע','קהל יושב ומריע, בתנועה עדינה שאינה מסונכרנת.'],materials:['חדר חומרים','אריג ספורט, מספרים ברורים ועור מחוספס.']};

function collect(root){root.traverse(o=>{if(o.geometry)geometryResources.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materialResources.add(m);for(const t of Object.values(m))if(t?.isTexture)textureResources.add(t);}});}

function lightRoom(){
  scene.add(new THREE.HemisphereLight(0xc5dded,0x25221a,.60));
  const key=new THREE.SpotLight(0xfff2db,600,90,.86,.65,2);
  key.position.set(3,17,4);key.target.position.set(0,0,0);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.00035;key.shadow.normalBias=.035;
  key.shadow.camera.near=3;key.shadow.camera.far=65;
  scene.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xd8ebff,1.4);fill.position.set(-7,14,-9);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffd7a0,.45);rim.position.set(15,10,9);scene.add(rim);
  // Small studio environment for lacquer/glass/metal. No remote HDR or image dependency.
  const room=new THREE.Scene();room.background=new THREE.Color('#313d48');
  const geo=new THREE.PlaneGeometry(10,3);
  const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(3.6,3.7,4)});
  for(const [x,y,z] of [[0,10,0],[7,5,5],[-7,5,-4]]){
    const panel=new THREE.Mesh(geo,mat);panel.position.set(x,y,z);panel.lookAt(0,0,0);room.add(panel);
  }
  pmrem=new THREE.PMREMGenerator(renderer);envTarget=pmrem.fromScene(room,0,.1,50);scene.environment=envTarget.texture;
  geo.dispose();mat.dispose();pmrem.dispose();
}

function decorate(gltf,name){
  const root=gltf.scene;root.name='v5-'+name;
  root.traverse(o=>{
    if(!o.isMesh)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){
      m.side=THREE.FrontSide;
      if(m.map)m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      if(m.name==='glass'){m.side=THREE.DoubleSide;m.depthWrite=false;m.forceSinglePass=true;}
      if(m.name==='display'||m.name==='shot-display'||m.name==='ribbon'||m.name==='practical'||m.name==='gold-light'){
        // Keep scoreboard digits readable under the photographic tone curve.
        m.toneMapped=false;
        if(m.emissive)m.emissiveIntensity=m.name==='practical'?2:.8;
      }
    }
    o.receiveShadow=name==='court';
    o.castShadow=name==='hoops';
    if(['hoops','crowd','ball'].includes(name)||/screen|light-panel|led-ribbon/.test(o.name))o.layers.enable(REFLECTION_LAYER);
  });
  if(name==='crowd'){
    root.traverse(o=>{
      if(!o.isMesh)return;
      crowdMesh=o;
      const old=o.material;
      o.material=new THREE.MeshBasicMaterial({map:old.map,vertexColors:true,alphaTest:.38,side:THREE.DoubleSide,toneMapped:true});
      // The portable GLB morph animation carries body sway. A pose change uses
      // the paired atlas cells, staggered by position, without CPU matrix uploads.
      o.material.onBeforeCompile=shader=>{
        shader.uniforms.crowdTime={value:0};o.userData.time=shader.uniforms.crowdTime;
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float crowdPhase;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\ncrowdPhase=floor(uv.x*4.0)*3.17+floor(uv.y*6.0)*1.71;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float crowdTime;varying float crowdPhase;')
          .replace('#include <map_fragment>',`#ifdef USE_MAP
 vec2 crowdUv=vMapUv;
 float pair=floor(crowdUv.x*4.0);
 float within=fract(crowdUv.x*8.0);
 float cheer=step(.89,sin(crowdTime*.62+crowdPhase));
 crowdUv.x=pair*.25+within*.125+cheer*.125;
 vec4 sampledDiffuseColor=texture2D(map,crowdUv);
 diffuseColor*=sampledDiffuseColor;
 #endif`);
      };
      o.material.customProgramCacheKey=()=> 'hoops-v5-crowd-paired-poses';
      materialResources.add(o.material);old.dispose();
    });
    mixer=new THREE.AnimationMixer(root);
    for(const clip of gltf.animations)mixer.clipAction(clip).play();
  }
  collect(root);return root;
}

function frameCourt(){
  const portrait=camera.aspect<1;
  orbit.yaw=portrait?1.25:.78;orbit.pitch=portrait?.54:.44;
  aim.set(0,1.4,0);
  const dir=new THREE.Vector3(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),Math.cos(orbit.yaw)*Math.cos(orbit.pitch));
  const right=new THREE.Vector3(dir.z,0,-dir.x).normalize(),up=new THREE.Vector3().crossVectors(dir,right);
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;
  let distance=0;
  for(const x of [-17,17])for(const z of [-9.4,9.4]){
    const p=new THREE.Vector3(x,0,z).sub(aim);
    distance=Math.max(distance,Math.abs(p.dot(right))/tanH+p.dot(dir),Math.abs(p.dot(up))/tanV+p.dot(dir));
  }
  // Portrait uses the arena depth for the long court rather than a remote wide shot.
  orbit.distance=portrait?32:distance*1.07;
}

function setView(next){
  if(!ready)return;
  view=next;
  for(const name of ['arena','court','hoops','crowd'])loaded[name].visible=view!=='materials';
  loaded.ball.visible=view!=='materials';product.visible=view==='materials';
  scene.fog=view==='materials'?null:new THREE.FogExp2('#08131b',.009);
  if(view==='arena')frameCourt();
  if(view==='floor'){aim.set(7,1.1,0);Object.assign(orbit,{yaw:-1.15,pitch:.17,distance:camera.aspect<1?16.5:12.3});}
  if(view==='crowd'){aim.set(-6.5,3.4,-13.3);Object.assign(orbit,{yaw:.13,pitch:.13,distance:camera.aspect<1?11.5:9.2});}
  if(view==='materials'){
    const short=camera.aspect>=1&&innerHeight<500;
    aim.set(0,short?.60:.89,.13);Object.assign(orbit,{yaw:.12,pitch:.10,distance:camera.aspect<1?3.7:(short?2.8:2.5)});
  }
  for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  $('#view-label').textContent=labels[view][0];$('#caption').textContent=labels[view][1];
  dirty=true;updateCamera();
}

function updateCamera(){
  if(view!=='materials')orbit.pitch=Math.min(orbit.pitch,Math.asin(Math.min(.99,(17.5-aim.y)/orbit.distance)));
  direction.set(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),Math.cos(orbit.yaw)*Math.cos(orbit.pitch));
  camera.position.copy(aim).addScaledVector(direction,orbit.distance);camera.lookAt(aim);camera.updateMatrixWorld();
}

function resize(){
  if(!renderer)return;
  renderer.setPixelRatio(economy||capture?1:Math.min(1.5,devicePixelRatio));
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  reflection?.resize(innerWidth,innerHeight);
  if(ready)setView(view);dirty=true;
}

function setPaused(value){paused=value;$('#motion').setAttribute('aria-pressed',String(paused));$('#motion').textContent=paused?'הפעלת תנועה':'עצירת תנועה';dirty=true;}
$('#motion').addEventListener('click',()=>setPaused(!paused));
$('#economy').addEventListener('click',()=>{economy=!economy;$('#economy').setAttribute('aria-pressed',String(economy));resize();});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
$('#retry').addEventListener('click',()=>location.reload());
reduced.addEventListener('change',e=>setPaused(e.matches));
window.addEventListener('resize',resize);
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=0;});
canvas.addEventListener('pointermove',e=>{
  const old=pointers.get(e.pointerId);if(!old||!ready)return;
  if(pointers.size===1){orbit.yaw-=(e.clientX-old.x)*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+(e.clientY-old.y)*.004,.06,1.28);}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)orbit.distance=THREE.MathUtils.clamp(orbit.distance*pinch/d,view==='materials'?1.4:6,100);pinch=d;}
  updateCamera();dirty=true;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{pointers.delete(e.pointerId);pinch=0;});
canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=THREE.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),view==='materials'?1.4:6,100);updateCamera();dirty=true;},{passive:false});
canvas.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(e.key))return;e.preventDefault();
  if(e.key==='Home')setView(view);
  if(e.key==='ArrowLeft')orbit.yaw+=.1;if(e.key==='ArrowRight')orbit.yaw-=.1;
  if(e.key==='ArrowUp')orbit.pitch=Math.min(1.28,orbit.pitch+.08);if(e.key==='ArrowDown')orbit.pitch=Math.max(.06,orbit.pitch-.08);
  if(['+','='].includes(e.key))orbit.distance=Math.max(view==='materials'?1.4:6,orbit.distance*.9);
  if(e.key==='-')orbit.distance=Math.min(100,orbit.distance*1.1);
  updateCamera();dirty=true;
});

function render(now){
  if(!ready)return;
  const dt=Math.min(.05,clock.getDelta());
  if(!document.hidden&&(!paused||dirty)){
    if(!paused){elapsed+=dt;mixer?.update(dt);if(crowdMesh?.userData.time)crowdMesh.userData.time.value=elapsed;
      ball.rotation.y=elapsed*.28;ballSample.rotation.y=elapsed*.20;}
    renderer.info.reset();
    if(!economy&&view!=='materials')reflection.update(camera);
    if(reflection)reflectionUniform().reflStrength.value=economy?0:.33;
    renderer.render(scene,camera);
    window.previewMetrics={view,paused,economy,elapsed,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      reflection:view!=='materials'&&!economy,reflectionSize:reflection.size,canvas:[canvas.width,canvas.height],
      crowdAnimation:mixer?loaded.crowd.userData.animationNames:[],models:Object.keys(loaded),
      crowdWeights:crowdMesh?.morphTargetInfluences?.slice(),frameMs:now-last};
    dirty=false;
  }
  last=now;requestAnimationFrame(render);
}
function reflectionUniform(){return loaded.court.getObjectByName('court-surface').material.userData.hoopsFloorReflection;}

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.info.autoReset=false;
    lightRoom();resize();
    const draco=new HoopsDRACOLoader();draco.setDecoderPath(new URL('../../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(2);
    const loader=new GLTFLoader();loader.setDRACOLoader(draco);
    const names=['arena','court','hoops','crowd','ball','uniforms'];
    try{
      const result=await Promise.allSettled(names.map(async name=>{
        const gltf=await loadHoopsGLTF(loader,new URL(`models/${name}.glb`,import.meta.url).href);
        const root=decorate(gltf,name);root.userData.animationNames=gltf.animations.map(c=>c.name);return [name,root];
      }));
      for(const r of result)if(r.status==='fulfilled')loaded[r.value[0]]=r.value[1];
      const failed=result.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    }finally{draco.dispose();}
    for(const name of ['arena','court','hoops','crowd','ball'])scene.add(loaded[name]);
    ball=loaded.ball;ball.position.set(4,.125,2);
    product.add(loaded.uniforms);
    ballSample=loaded.ball.clone(true);ballSample.position.set(0,.37,.55);ballSample.scale.setScalar(3.05);product.add(ballSample);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(25,25),new THREE.MeshStandardMaterial({color:0x12232c,roughness:.55}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.01;product.add(floor);collect(product);
    // An unobtrusive hanger for each real garment surface.
    for(const x of [-.475,.475]){
      const rod=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1.55,8),new THREE.MeshStandardMaterial({color:0xb39863,metalness:.7,roughness:.35}));
      rod.position.set(x,.775,-.12);product.add(rod);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,.025,32),rod.material);base.position.set(x,.01,-.12);product.add(base);
    }
    collect(product);
    const surface=loaded.court.getObjectByName('court-surface');
    reflection=createFloorReflection(renderer,scene,surface,{planeY:.001,scale:.38,maxWidth:512,strength:.33});
    reflection.resize(innerWidth,innerHeight);
    ready=true;setView(new URLSearchParams(location.search).get('view') in labels?new URLSearchParams(location.search).get('view'):'arena');
    setPaused(paused);$('#loading').hidden=true;window.previewReady=true;
    window.hoopsV5={setView,setPaused,getState:()=>({view,paused,economy,elapsed,camera:camera.position.toArray(),morphs:crowdMesh.morphTargetInfluences.slice()}),
      getDiagnostics:()=>({textures:[...textureResources].map(t=>({name:t.name,width:t.image?.width,height:t.image?.height})),
        models:Object.fromEntries(Object.entries(loaded).map(([name,root])=>{let meshes=0,mapped=0;root.traverse(o=>{if(o.isMesh){meshes++;if(o.material?.map)mapped++;}});return [name,{meshes,mapped}];}))})};
    requestAnimationFrame(render);
  }catch(error){
    console.error(error);window.previewError=String(error);$('#loading').classList.add('failed');
    $('#load-message').textContent='לא הצלחנו להציג את האולם. אפשר לנסות שוב.';$('#retry').hidden=false;
  }
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;window.previewError='WebGL context lost';$('#loading').hidden=false;$('#loading').classList.add('failed');$('#load-message').textContent='התצוגה נעצרה. אפשר לטעון אותה מחדש.';$('#retry').hidden=false;});
window.addEventListener('pagehide',()=>{ready=false;reflection?.dispose();mixer?.stopAllAction();for(const g of geometryResources)g.dispose();for(const m of materialResources)m.dispose();for(const t of textureResources)t.dispose();envTarget?.dispose();renderer?.dispose();});
init();

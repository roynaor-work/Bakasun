import * as THREE from '../../../vendor/three.module.js';
import {GLTFLoader} from '../../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../../vendor/DRACOLoader.js';
import {clone as cloneSkeleton} from '../../../vendor/SkeletonUtils.js';

const $ = (id) => document.getElementById(id);
const rootURL = new URL('./', import.meta.url);
const profiles = [
  {id:'pg',role:'PG',label:'רכז',description:'POINT GUARD',heightMeters:1.85,widthScale:.94,number:1},
  {id:'sg',role:'SG',label:'קלע',description:'SHOOTING GUARD',heightMeters:1.95,widthScale:.97,number:7},
  {id:'sf',role:'SF',label:'סמול פורוורד',description:'SMALL FORWARD',heightMeters:2.03,widthScale:1,number:11},
  {id:'pf',role:'PF',label:'פאוור פורוורד',description:'POWER FORWARD',heightMeters:2.10,widthScale:1.06,number:24},
  {id:'c',role:'C',label:'סנטר',description:'CENTER',heightMeters:2.18,widthScale:1.02,number:35},
  {id:'referee',role:'REF',label:'שופט',description:'OFFICIAL',heightMeters:1.88,widthScale:.96,number:0},
];
const clipLabels = {
  idle:'עמידה · נשימה',dribble_stationary:'כדרור שליטה',dribble_crossover:'כדרור קרוסאובר',
  dribble_between_legs:'כדרור בין הרגליים',dribble_behind_back:'כדרור מאחורי הגב',
  shoot_set:'קליעה מהמקום',shoot_jump:'קליעת ניתור',shoot_fadeaway:'קליעה בתנועה',
  layup:'לייאפ',dunk:'דאנק',block:'חסימה',steal:'חטיפה',eurostep:'רב־צעד',
  run:'ריצה',decelerate:'האטה',defensive_slide:'הגנה בצעדי צד',celebration:'חגיגה',
};
const teams = {amber:{jersey:0xeeb36b,shorts:0x1b293b},teal:{jersey:0x54b8c1,shorts:0x153d45}};
const state = {selected:'pg',lod:0,team:'amber',mode:'solo',clip:'dribble_stationary',playing:true,speed:1,camera:'portrait',ready:false,loading:false};
const errors = [], cache = new Map(), textureCache = new Map(), actors = [];
let metadata = null, changeVersion = 0, duration = 1, currentTime = 0, drag = null, orbitAngle = .27, orbitZoom = 1;
const v = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), cameraTarget = new THREE.Vector3(0,1.05,0);
const renderer = new THREE.WebGLRenderer({canvas:$('court'),antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111a22);
scene.fog = new THREE.FogExp2(0x111a22,.040);
const camera = new THREE.PerspectiveCamera(32,1,.05,70);
camera.position.set(2,1.65,4.5);
const hemi = new THREE.HemisphereLight(0xc6dded,0x65513a,1.5);scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe5c0,3.7);
key.position.set(3.8,7,4.5);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:22});
key.shadow.bias=-.0002;key.shadow.normalBias=.018;key.shadow.radius=4;scene.add(key);
const rim = new THREE.DirectionalLight(0x99c8ec,2.8);rim.position.set(-4,4,-3);scene.add(rim);
const front = new THREE.DirectionalLight(0xe9f0f4,1.1);front.position.set(-1,2.5,6);scene.add(front);
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath(new URL('../../../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(2);loader.setDRACOLoader(draco);

function canvasTexture(width,height,paint,color=true){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture;
}
function court(){
  const wood=canvasTexture(1024,1024,(ctx,w,h)=>{
    ctx.fillStyle='#9c7650';ctx.fillRect(0,0,w,h);
    let seed=1703;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let row=0;row<24;row++){
      const y=row*h/24;const light=42+rnd()*9;
      ctx.fillStyle=`hsl(32 31% ${light}%)`;ctx.fillRect(0,y,w,h/24-1);
      for(let col=0;col<3;col++){
        const x=(col+(row%2)*.5)*w/3;ctx.fillStyle='#3a29181e';ctx.fillRect(x,y,1,h/24);
      }
      for(let grain=0;grain<30;grain++){
        ctx.strokeStyle=`rgba(70,43,20,${.025+rnd()*.05})`;ctx.lineWidth=.4+rnd()*.8;
        ctx.beginPath();const gy=y+rnd()*h/24;ctx.moveTo(rnd()*w,gy);ctx.bezierCurveTo(w*.3,gy-2,w*.6,gy+2,w,gy);ctx.stroke();
      }
    }
  });
  wood.wrapS=wood.wrapT=THREE.RepeatWrapping;wood.repeat.set(1.5,2);
  const normal=canvasTexture(256,256,(ctx,w,h)=>{ctx.fillStyle='rgb(128,128,255)';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y+=11){ctx.fillStyle='rgb(128,134,254)';ctx.fillRect(0,y,w,1);ctx.fillStyle='rgb(128,122,254)';ctx.fillRect(0,y+1,w,1);}},false);
  normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(1.5,2);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(17,24),new THREE.MeshPhysicalMaterial({map:wood,normalMap:normal,normalScale:new THREE.Vector2(.24,.24),roughness:.36,metalness:.04,clearcoat:.5,clearcoatRoughness:.2,color:0x9c9a91}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const courtMarks=[];
  const line=(x1,z1,x2,z2)=>courtMarks.push(x1,.012,z1,x2,.012,z2);
  const arc=(x,z,r,start,end,steps=64)=>{for(let i=0;i<steps;i++){const a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;line(x+Math.cos(a)*r,z+Math.sin(a)*r,x+Math.cos(b)*r,z+Math.sin(b)*r);}};
  [[-5,-8,5,-8],[5,-8,5,8],[5,8,-5,8],[-5,8,-5,-8],[-5,0,5,0]].forEach(p=>line(...p));arc(0,0,1.1,0,Math.PI*2);
  for(const sign of [-1,1]){
    const z=sign*8;line(-1.5,z,-1.5,sign*4.2);line(1.5,z,1.5,sign*4.2);line(-1.5,sign*4.2,1.5,sign*4.2);
    arc(0,sign*4.2,1.5,sign>0?Math.PI:0,sign>0?Math.PI*2:Math.PI);
    arc(0,sign*6.6,4.3,sign>0?Math.PI:0,sign>0?Math.PI*2:Math.PI);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(courtMarks,3));
  scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xe2cfaa,transparent:true,opacity:.64})));
  const centerRing=new THREE.Mesh(new THREE.RingGeometry(1.35,1.38,80),new THREE.MeshBasicMaterial({color:0x293943,transparent:true,opacity:.75,side:THREE.DoubleSide}));
  centerRing.rotation.x=-Math.PI/2;centerRing.position.y=.013;scene.add(centerRing);
  const backWall=new THREE.Mesh(new THREE.BoxGeometry(20,4,.3),new THREE.MeshStandardMaterial({color:0x101820,roughness:.8}));backWall.position.set(0,1.8,-10.5);scene.add(backWall);
  // A local light-box environment supplies coherent PBR reflections on skin and varnish.
  const envScene=new THREE.Scene();envScene.background=new THREE.Color(0x263745);
  for(const [x,y,z,w,h,color] of [[-3,4,1,3,1,0xd3e5f6],[3,5,1,4,2,0xffecd0],[0,4,-4,5,1,0x9ab7da]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));panel.position.set(x,y,z);panel.lookAt(0,1,0);envScene.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.05);scene.environment=env.texture;pmrem.dispose();
  const rail=new THREE.Mesh(new THREE.BoxGeometry(18,.12,.12),new THREE.MeshStandardMaterial({color:0x596571,metalness:.6,roughness:.3}));rail.position.set(0,1,-8.8);scene.add(rail);
  const stripMat=new THREE.MeshBasicMaterial({color:0xf8ca91});
  for(const x of [-5,0,5]){const strip=new THREE.Mesh(new THREE.BoxGeometry(3,.04,.15),stripMat);strip.position.set(x,4.3,-6.5);scene.add(strip);}
  const crowdCount=180,torso=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.10,.20,1,4),new THREE.MeshStandardMaterial({color:0xb9cad6,roughness:1}),crowdCount);
  const heads=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.075,0),new THREE.MeshStandardMaterial({color:0xa59280,roughness:1}),crowdCount);
  const dummy=new THREE.Object3D(),bases=[];let n=0;
  for(let row=0;row<5;row++)for(let seat=0;seat<36;seat++){
    const x=(seat-17.5)*.47,y=.57+row*.36,z=-7.8-row*.49;
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,(seat%5-2)*.02);dummy.updateMatrix();torso.setMatrixAt(n,dummy.matrix);
    dummy.position.y+=.29;dummy.updateMatrix();heads.setMatrixAt(n,dummy.matrix);
    torso.setColorAt(n,new THREE.Color().setHSL(.52+(seat%7)*.04,.12+(seat%3)*.08,.16+(seat%5)*.025));
    heads.setColorAt(n,new THREE.Color().setHSL(.08,.20,.25+(seat%8)*.04));bases.push({x,y,z});n++;
  }
  const movement={value:0};
  torso.material.onBeforeCompile=shader=>{shader.uniforms.uCrowdTime=movement;shader.vertexShader='uniform float uCrowdTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(uCrowdTime * 1.4 + instanceMatrix[3].x * 3.0) * .008;');};
  scene.add(torso,heads);return movement;
}
const crowdTime=court();
const ballMap=canvasTexture(512,256,(ctx,w,h)=>{
  ctx.fillStyle='#b86127';ctx.fillRect(0,0,w,h);let seed=41;for(let i=0;i<12000;i++){seed=seed*16807%2147483647;const x=seed%w;seed=seed*16807%2147483647;const y=seed%h;ctx.fillStyle=i%2?'#713a2039':'#f4a15335';ctx.fillRect(x,y,1.4,1.4);}
  ctx.strokeStyle='#2a211e';ctx.lineWidth=4;ctx.beginPath();for(const x of [0,w/4,w/2,w*.75,w]){ctx.moveTo(x,0);ctx.lineTo(x,h);}ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(w/2,0);ctx.bezierCurveTo(w/2+sign*w*.42,h*.3,w/2+sign*w*.42,h*.7,w/2,h);ctx.stroke();}
});
const ballGeometry=new THREE.SphereGeometry(.119,20,12),ballMaterial=new THREE.MeshStandardMaterial({map:ballMap,roughness:.79,metalness:0});

function recolor(material,team,id){
  const result=material.clone();result.envMapIntensity=.58;result.roughness=Math.max(.45,result.roughness??.65);
  if(id==='referee')return result;
  const palette=teams[team];
  const tintJ={value:new THREE.Color(palette.jersey)},tintS={value:new THREE.Color(palette.shorts)};
  result.onBeforeCompile=shader=>{
    shader.uniforms.uJerseyTint=tintJ;shader.uniforms.uShortsTint=tintS;
    shader.fragmentShader='uniform vec3 uJerseyTint;\nuniform vec3 uShortsTint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\nif(vMapUv.y > 0.5) { diffuseColor.rgb *= vMapUv.x < 0.5 ? uJerseyTint : uShortsTint; }\n#endif');
  };
  result.customProgramCacheKey=()=>`hoops-v6-kit-${team}`;
  return result;
}
async function getAsset(id,lod){
  const key=`${id}-${lod}`;
  if(!cache.has(key)){
    const profile=metadata?.players?.find(p=>p.id===id);
    const modelPath=profile?.models?.[`lod${lod}`] || `models/${id}-lod${lod}.glb`;
    const pending=loader.loadAsync(new URL(modelPath,rootURL).href).then(gltf=>{
      // Both LOD files remain standalone. At runtime they share decoded atlases;
      // normal and ORM pixels are identical across the six supplied profiles.
      const discarded=new Set(),retained=new Set();
      gltf.scene.traverse(node=>{if(!node.isMesh)return;for(const material of (Array.isArray(node.material)?node.material:[node.material])){
        for(const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap']){
          const texture=material[slot];if(!texture)continue;
          const group=slot==='map'?`${id}:basecolor`:slot==='normalMap'?'shared:normal':'shared:orm';
          if(textureCache.has(group)){const shared=textureCache.get(group);if(texture!==shared)discarded.add(texture);material[slot]=shared;retained.add(shared);}
          else{textureCache.set(group,texture);retained.add(texture);}
        }
      }});
      for(const texture of discarded)if(!retained.has(texture))texture.dispose();
      return gltf;
    }).catch(error=>{cache.delete(key);throw error;});cache.set(key,pending);
  }
  return cache.get(key);
}
function clearActors(){
  for(const actor of actors){scene.remove(actor.root,actor.ball);for(const material of actor.materials)material.dispose();actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.root);}
  actors.length=0;
}
function spawn(gltf,profile,index,count,team){
  const root=cloneSkeleton(gltf.scene),materials=[],shoeSamples=[];
  root.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=false;node.frustumCulled=false;const source=Array.isArray(node.material)?node.material:[node.material];const tinted=source.map(m=>recolor(m,team,profile.id));materials.push(...tinted);node.material=Array.isArray(node.material)?tinted:tinted[0];});
  const h=profile.heightMeters/1.95;root.scale.set(h*(profile.widthScale??1),h,h);
  if(state.mode==='lineup'){root.position.set((index-2.5)*.82,0,Math.abs(index-2.5)*.10);root.rotation.y=.08;}
  if(state.mode==='scrimmage'){
    const isRef=index===12,side=index<6?-1:1,k=index%6;
    root.position.set(isRef?3.7:side*(1.1+(k%3)*1.1),0,isRef?-1.5:(Math.floor(k/3)-.5)*3.8+(k%3)*.45);
    root.rotation.y=isRef?-.65:side<0?.8:-.8;
  }
  scene.add(root);const mixer=new THREE.AnimationMixer(root);
  const ball=new THREE.Mesh(ballGeometry,ballMaterial);ball.castShadow=true;scene.add(ball);
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;const position=mesh.geometry.attributes.position;
    const indices=[];for(let i=0;i<position.count;i++)if(position.getY(i)<.24)indices.push(i);
    if(indices.length)shoeSamples.push({mesh,indices});
  });
  const actor={root,mixer,clips:gltf.animations,profile,materials,action:null,ball,index,shoeSamples,fadeRemaining:0,floorLift:0,hand:root.getObjectByName('RightHand')||root.getObjectByName('mixamorig:RightHand'),leftHand:root.getObjectByName('LeftHand')||root.getObjectByName('mixamorig:LeftHand')};
  actors.push(actor);setActorClip(actor,state.clip,true);return actor;
}
function setActorClip(actor,name,immediate=false){
  const clip=actor.clips.find(c=>c.name===name)||actor.clips.find(c=>c.name.toLowerCase()===name.toLowerCase())||actor.clips[0];
  if(!clip)return;
  const previous=actor.action,action=actor.mixer.clipAction(clip);
  actor.clipMetadata=metadata?.players?.find(p=>p.id===actor.profile.id)?.clips?.[clip.name]||{};
  const loops=actor.clipMetadata.loop??['idle','run','defensive_slide','dribble_stationary','dribble_crossover','dribble_between_legs','dribble_behind_back'].includes(clip.name);
  action.reset();action.clampWhenFinished=!loops;action.setLoop(loops?THREE.LoopRepeat:THREE.LoopOnce,loops?Infinity:1);action.play();
  if(previous&&previous!==action){if(immediate)previous.stop();else{action.crossFadeFrom(previous,.24,true);actor.fadeRemaining=.26;}}
  actor.action=action;actor.clip=clip;actor.mixer.update(0);
}
function updateCaption(){
  const p=profiles.find(p=>p.id===state.selected);
  $('profileNumber').textContent=String(p.number).padStart(2,'0');$('profileName').textContent=p.label;
  $('profileDescription').textContent=`${p.role} / ${p.description}`;$('profileHeight').innerHTML=`${p.heightMeters.toFixed(2)} <small>מ׳</small>`;
  const m=metadata?.players?.find(m=>m.id===p.id),tri=m?.triangles?.[`lod${state.lod}`];
  $('assetBudget').textContent=tri?`${tri.toLocaleString()} משולשים · ${state.mode==='scrimmage'?'13 דמויות':'שלד משותף'}`:'עד 8K / 3K משולשים';
  $('lodReadout').textContent=`LOD ${state.mode==='scrimmage'?1:state.lod}`;
  $('modeLabel').textContent=state.mode==='solo'?'מצלמת סגל':state.mode==='lineup'?'שישה על קו אחד':'שש מול שש';
  document.querySelectorAll('[data-player]').forEach(b=>b.classList.toggle('active',b.dataset.player===state.selected));
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  document.querySelectorAll('[data-lod]').forEach(b=>b.classList.toggle('active',+b.dataset.lod===(state.mode==='scrimmage'?1:state.lod)));
  document.querySelectorAll('[data-team]').forEach(b=>b.classList.toggle('active',b.dataset.team===state.team));
  $('profileHeight').hidden=state.mode!=='solo';
  if(state.mode!=='solo'){$('profileNumber').textContent=state.mode==='lineup'?'06':'12';$('profileName').textContent=state.mode==='lineup'?'כל העמדות':'שש מול שש';$('profileDescription').textContent=state.mode==='lineup'?'THE FULL ROSTER':'MOBILE LOAD / 12 PLAYERS + OFFICIAL';}
}
function populateClips(){
  const names=actors[0]?.clips.map(c=>c.name)||Object.keys(clipLabels);
  const previous=state.clip;
  $('clip').replaceChildren(...names.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=clipLabels[name]||name;return option;}));
  if(!names.includes(previous))state.clip=names.find(n=>n.includes('dribble'))||names[0]||'idle';
  $('clip').value=state.clip;updateClipCount();
}
function updateClipCount(){const i=$('clip').selectedIndex+1;$('clipCounter').textContent=`${String(i).padStart(2,'0')} / ${$('clip').options.length}`;}
async function refresh(){
  const version=++changeVersion;state.loading=true;state.ready=false;$('loading').hidden=false;$('failure').hidden=true;updateCaption();
  const lod=state.mode==='scrimmage'?1:state.lod;
  const list=state.mode==='solo'?[profiles.find(p=>p.id===state.selected)]:state.mode==='lineup'?profiles:[...profiles.slice(0,5),profiles[0],...profiles.slice(0,5),profiles[1],profiles[5]];
  try{
    const loaded=await Promise.all(list.map(profile=>getAsset(profile.id,lod)));
    if(version!==changeVersion)return;clearActors();
    loaded.forEach((gltf,i)=>spawn(gltf,list[i],i,list.length,state.mode==='scrimmage'&&i>=6&&i<12?'teal':state.team));
    populateClips();for(const actor of actors)setActorClip(actor,state.clip,true);
    duration=actors[0]?.clip?.duration||1;currentTime=0;state.ready=true;state.loading=false;$('loading').hidden=true;
    resize();updateCaption();renderFrame(0);
  }catch(error){
    if(version!==changeVersion)return;state.loading=false;const message=String(error?.message||error);errors.push(message);$('loading').hidden=true;$('failure').hidden=false;console.error('Hoops v6 asset load:',message);
  }
}
function select(id){if(!profiles.some(p=>p.id===id))throw new Error(`Unknown profile: ${id}`);state.selected=id;if(state.mode!=='solo')state.mode='solo';return refresh();}
function setMode(mode){if(!['solo','lineup','scrimmage'].includes(mode))throw new Error(`Unknown mode: ${mode}`);state.mode=mode;return refresh();}
function playClip(name){
  if(!actors.some(a=>a.clips.some(c=>c.name===name)))return false;
  state.clip=name;for(const actor of actors)setActorClip(actor,name);duration=actors[0]?.clip?.duration||1;currentTime=0;$('clip').value=name;updateClipCount();updateCamera();return true;
}
function seek(time){
  currentTime=Math.max(0,Math.min(duration,Number(time)||0));
  for(const actor of actors){actor.mixer.stopAllAction();actor.action=actor.mixer.clipAction(actor.clip);actor.action.reset().play();actor.action.time=currentTime;actor.mixer.update(0);}
  renderFrame(0);updateTransport();
}
function updateTransport(){
  $('timeline').value=String(Math.round(currentTime/Math.max(.001,duration)*1000));
  $('timeReadout').textContent=`${currentTime.toFixed(2)} / ${duration.toFixed(2)}`;
}
function updateCamera(){
  const width=$('viewport').clientWidth,height=$('viewport').clientHeight;camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();
  const wide=state.mode!=='solo';let target=wide?new THREE.Vector3(0,1,0):new THREE.Vector3(0,1.06,0),distance;
  const elevation=state.camera==='broadcast'||state.mode==='scrimmage'?.47:state.camera==='detail'?.06:.105;
  const angle=state.camera==='broadcast'?-.66:orbitAngle;
  if(state.camera==='detail'&&!wide){
    const head=actors[0]?.root.getObjectByName('Head');
    if(head){actors[0].root.updateMatrixWorld(true);head.getWorldPosition(target);target.y+=.055;}else target.y=profiles.find(p=>p.id===state.selected).heightMeters*.88;
    distance=1.18;
  }
  else if(wide){
    // Fit all eight corners of a conservative group envelope in camera space.
    // This covers foreground feet, wide defensive arms and the tallest dunk.
    const jumping=/shoot|layup|dunk|block|celebration/.test(state.clip);
    const halfX=Math.max(0,...actors.map(actor=>Math.abs(actor.root.position.x)))+1.5;
    const halfZ=Math.max(0,...actors.map(actor=>Math.abs(actor.root.position.z)))+1.5;
    const halfY=(jumping?4.3:2.7)/2;target.y=halfY;
    const back=new THREE.Vector3(Math.sin(angle),elevation,Math.cos(angle)).normalize();
    const right=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const up=new THREE.Vector3().crossVectors(back,right);
    const tanHalfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    let actualDistance=0;
    for(const x of [-halfX,halfX])for(const y of [-halfY,halfY])for(const z of [-halfZ,halfZ]){
      const corner=new THREE.Vector3(x,y,z);
      const vertical=Math.abs(corner.dot(up))/(tanHalfFov*.90);
      const horizontal=Math.abs(corner.dot(right))/(tanHalfFov*camera.aspect*.90);
      actualDistance=Math.max(actualDistance,corner.dot(back)+Math.max(vertical,horizontal));
    }
    distance=actualDistance/Math.sqrt(1+elevation*elevation);
  }
  else{
    const jumpEnvelope=/shoot|layup|dunk|block|celebration/.test(state.clip);
    const heightFactor=profiles.find(p=>p.id===state.selected).heightMeters/1.83;
    const extent=jumpEnvelope?3.65*heightFactor:2.45;
    if(jumpEnvelope)target.y=1.55*heightFactor;
    distance=Math.max(4.15,extent/(2*Math.tan(THREE.MathUtils.degToRad(32/2))));
    if(state.clip==='defensive_slide'&&camera.aspect<1)distance*=1.25;
  }
  distance*=orbitZoom;
  desiredCamera.set(Math.sin(angle)*distance,target.y+distance*elevation,Math.cos(angle)*distance);
  cameraTarget.copy(target);camera.position.copy(desiredCamera);camera.lookAt(cameraTarget);
}
function resize(){const viewport=$('viewport');renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);updateCamera();}
function updateBall(actor){
  const name=state.clip,t=actor.action?.time||0,phase=t/Math.max(.01,actor.clip?.duration||1),scale=actor.profile.heightMeters/1.95;
  const hasBall=/dribble|shoot|layup|dunk|eurostep/.test(name)&&actor.profile.id!=='referee';actor.ball.visible=hasBall;if(!hasBall)return;
  actor.root.updateMatrixWorld(true);const hand=actor.hand;
  if(hand){hand.getWorldPosition(v);actor.root.worldToLocal(v);}else v.set(.42,1,.25);
  v.z+=.075;actor.ball.scale.setScalar(scale);
  if(name.startsWith('dribble')){
    const ballSpec=actor.clipMetadata.ball||{},bounceEvent=actor.clipMetadata.events?.find(e=>e.name==='ball_bounce');
    const bouncePhase=bounceEvent?bounceEvent.atSeconds/actor.clip.duration:ballSpec.bouncePhase??.5;
    const bounce=Math.abs(Math.sin((phase-bouncePhase)*Math.PI));
    v.y=.124+Math.max(.3,v.y-.124)*Math.pow(bounce,.63);
    const cycle=Math.sin(phase*Math.PI*2);
    if(name==='dribble_crossover')v.x=cycle*.42;
    if(name==='dribble_between_legs'){v.x=cycle*.34;v.z=.03;}
    if(name==='dribble_behind_back'){v.x=cycle*.39;v.z=-.20;}
  }else if(name.startsWith('shoot')&&phase>.47&&phase<.88){
    const u=(phase-.47)/.41;v.set(-u*.35,2.0+Math.sin(u*Math.PI)*1.1,.4+u*2.2);
  }
  actor.root.localToWorld(v);actor.ball.position.copy(v);
  actor.ball.position.y=Math.max(.12*scale,actor.ball.position.y);actor.ball.rotation.x=t*2.3;actor.ball.rotation.z=t*.8;
}
let fpsFrames=0,fpsSince=performance.now(),fpsValue=0;
const floorVertex=new THREE.Vector3();
function correctFloor(actor,delta=0){
  actor.root.position.y=0;actor.floorLift=0;
  if(actor.fadeRemaining<=0)return;
  actor.root.updateMatrixWorld(true);let lowest=Infinity;
  for(const {mesh,indices} of actor.shoeSamples){
    mesh.skeleton.update();for(const i of indices){floorVertex.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,floorVertex);floorVertex.applyMatrix4(mesh.matrixWorld);lowest=Math.min(lowest,floorVertex.y);}
  }
  if(Number.isFinite(lowest)){actor.floorLift=Math.max(0,.004-lowest);actor.root.position.y=actor.floorLift;actor.root.updateMatrixWorld(true);}
  actor.fadeRemaining=Math.max(0,actor.fadeRemaining-delta*state.speed);
}
function renderFrame(delta){
  if(state.playing){for(const actor of actors)actor.mixer.update(delta*state.speed);currentTime=actors[0]?.action?.time||0;
    if(actors[0]?.action?.loop===THREE.LoopOnce&&actors[0].action.paused&&currentTime>=duration-.001){state.playing=false;$('playPause').textContent='▶';$('playPause').setAttribute('aria-label','הפעלת תנועה מחדש');}
  }
  for(const actor of actors){correctFloor(actor,state.playing?delta:0);updateBall(actor);}
  if(state.camera==='detail')updateCamera();
  crowdTime.value+=state.playing?delta:0;renderer.render(scene,camera);updateTransport();
  fpsFrames++;const now=performance.now();if(now-fpsSince>900){fpsValue=Math.round(fpsFrames*1000/(now-fpsSince));fpsSince=now;fpsFrames=0;$('fps').textContent=String(fpsValue);}
  $('triangles').textContent=renderer.info.render.triangles.toLocaleString();$('calls').textContent=String(renderer.info.render.calls);
}
let lastRender=performance.now();
function animate(now){requestAnimationFrame(animate);const elapsed=now-lastRender;if(elapsed<1000/30-.5)return;lastRender=now-(elapsed%(1000/30));renderFrame(Math.min(elapsed/1000,.1));}
requestAnimationFrame(animate);

$('roster').replaceChildren(...profiles.map(profile=>{
  const button=document.createElement('button');button.className='player-card';button.dataset.player=profile.id;button.setAttribute('aria-label',`${profile.role} · ${profile.label}`);
  const role=document.createElement('span');role.className='role';role.textContent=profile.role;const label=document.createElement('small');label.textContent=profile.label;
  button.append(role,label);button.addEventListener('click',()=>select(profile.id));return button;
}));
for(const [id,label] of Object.entries(clipLabels)){const option=document.createElement('option');option.value=id;option.textContent=label;$('clip').append(option);}
$('clip').value=state.clip;$('clip').addEventListener('change',e=>{playClip(e.target.value);state.playing=true;$('playPause').textContent='Ⅱ';$('playPause').setAttribute('aria-label','השהיית תנועה');});
$('playPause').addEventListener('click',()=>{if(!state.playing&&currentTime>=duration-.001)playClip(state.clip);state.playing=!state.playing;$('playPause').textContent=state.playing?'Ⅱ':'▶';$('playPause').setAttribute('aria-label',state.playing?'השהיית תנועה':'הפעלת תנועה');});
$('timeline').addEventListener('input',e=>{state.playing=false;$('playPause').textContent='▶';$('playPause').setAttribute('aria-label','הפעלת תנועה');seek(Number(e.target.value)/1000*duration);});
$('speed').addEventListener('change',e=>{state.speed=Number(e.target.value);});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
document.querySelectorAll('[data-lod]').forEach(button=>button.addEventListener('click',()=>{state.lod=+button.dataset.lod;if(state.mode==='scrimmage'&&state.lod===0)state.mode='solo';refresh();}));
document.querySelectorAll('[data-team]').forEach(button=>button.addEventListener('click',()=>{state.team=button.dataset.team;refresh();}));
document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{state.camera=button.dataset.camera;orbitAngle=.27;orbitZoom=1;document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b===button));updateCamera();}));
$('retry').addEventListener('click',()=>refresh());
$('court').addEventListener('pointerdown',event=>{drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle:orbitAngle,zoom:orbitZoom};$('court').setPointerCapture(event.pointerId);});
$('court').addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;orbitAngle=drag.angle+(event.clientX-drag.x)*.008;orbitZoom=THREE.MathUtils.clamp(drag.zoom+(event.clientY-drag.y)*.003,.65,1.8);updateCamera();});
for(const type of ['pointerup','pointercancel'])$('court').addEventListener(type,()=>{drag=null;});
$('court').addEventListener('wheel',event=>{event.preventDefault();orbitZoom=THREE.MathUtils.clamp(orbitZoom+event.deltaY*.0007,.65,1.8);updateCamera();},{passive:false});
new ResizeObserver(resize).observe($('viewport'));
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.__HOOPS_V6={state,errors,renderer,scene,camera,actors,profiles,select,setMode,playClip,seek,refresh,correctFloor,setLOD:async lod=>{state.lod=lod;await refresh();},setTeam:async team=>{state.team=team;await refresh();},get metadata(){return metadata;},get ready(){return state.ready;},get duration(){return duration;},get currentTime(){return currentTime;},get fps(){return fpsValue;},get textureCount(){return new Set(textureCache.values()).size;},render:()=>renderFrame(0)};
try{
  const response=await fetch(new URL('asset-metadata.json',rootURL));if(response.ok){metadata=await response.json();for(const profile of profiles){const data=metadata.players?.find(p=>p.id===profile.id);if(data)Object.assign(profile,{heightMeters:data.heightMeters??profile.heightMeters,widthScale:data.widthScale??profile.widthScale,number:data.number??profile.number});}}
}catch(error){errors.push(`Metadata: ${error.message}`);}
resize();await refresh();

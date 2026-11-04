import * as THREE from 'three';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const $ = s => document.querySelector(s);
const stage = $('#stage'), status = $('#status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const loader = new THREE.TextureLoader(), gltfLoader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({canvas: $('#scene'), antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(59, 1, .1, 300);
camera.position.set(0,3.1,-8); camera.lookAt(0,.2,20);
const ambient = new THREE.HemisphereLight();
const sun = new THREE.DirectionalLight(); scene.add(ambient, sun);
let manifest, active, root, generation = 0, bgGeneration = 0, bgOrientation, paused = false;
let clock = 0, lastTime = performance.now(), frameOverride = null;
let bgTexture = null, textures = {}, effects = [], effectMeta = {}, flakes = [], cones = [], fogSheets = [];
const atlasCanvas = $('#atlas-preview'), atlasCtx = atlasCanvas.getContext('2d');
const assetMap = new Map();
const notes = {sunset:'אור ענברי · צללים סגולים', fog:'ערפל שכבות · סמנים בולטים', 'night-floodlit':'ירח קר · תאורה חמה על השלג'};
const previewState = {ready:false, environment:null, loadedModels:[], activeEffects:0, effectFrame:0, frame:0, error:null};
window.alpineAssetPreview = previewState;

async function json(path) {
  const r = await fetch(path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json();
}
const texture = async (id) => {
  const a = assetMap.get(id); if (!a) throw new Error(`Unknown asset: ${id}`);
  const t = await loader.loadAsync(a.path);
  t.colorSpace = a.colorSpace === 'linear-data' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = a.wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = a.mipmaps ?? false;
  t.minFilter = t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
};
const elevation = (x,z) => -.018*z + Math.min(2.4,Math.max(0,Math.abs(x)-8)**1.2*.065) + .035*Math.sin(z*.2)*Math.min(1,Math.abs(x)/6);
const disposeRoot = group => {
  if (!group) return;
  const geometries = new Set(), materials = new Set();
  group.traverse(o => {if(o.geometry) geometries.add(o.geometry); if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); scene.remove(group);
};
function clearEffects() {
  for(const e of effects) {root?.remove(e.sprite); e.sprite.material.map.dispose();e.sprite.material.dispose();}
  effects=[];previewState.activeEffects=0;
}
function fitBackground(t) {
  const imageAspect=t.image.width/t.image.height, viewAspect=stage.clientWidth/stage.clientHeight;
  t.repeat.set(Math.min(1,viewAspect/imageAspect),Math.min(1,imageAspect/viewAspect));
  t.offset.set((1-t.repeat.x)/2,(1-t.repeat.y)/2);
}
async function setBackground() {
  if(!active) return;
  const orientation=stage.clientWidth>=stage.clientHeight?'landscape':'portrait';
  if(orientation===bgOrientation&&bgTexture){fitBackground(bgTexture);return;}
  const token=++bgGeneration, env=active;
  const t=await texture(env.backgrounds[orientation]);
  if(token!==bgGeneration||env!==active){t.dispose();return;}
  bgTexture?.dispose();bgTexture=t;bgOrientation=orientation;fitBackground(t);scene.background=t;
}
function resize() {
  const w=stage.clientWidth,h=stage.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;
  camera.fov=w>=h?59:66; camera.updateProjectionMatrix();
  setBackground().catch(fail);
}
function fail(e) {
  console.error(e);previewState.error=e.message;previewState.ready=false;
  status.dataset.state='error';status.textContent=`טעינת הנכסים נכשלה: ${e.message}. אפשר לרענן ולנסות שוב.`;
}

function decal(index,x,z,w=1.8,length=2.2,opacity=.78) {
  const t=textures['route-and-snow'].clone();t.needsUpdate=true;
  const px=index%4*128,py=Math.floor(index/4)*128;
  t.repeat.set(127/512,127/512);t.offset.set((px+.5)/512,1-(py+127.5)/512);
  const m=new THREE.MeshBasicMaterial({map:t,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,length),m);
  mesh.rotation.x=-Math.PI/2;mesh.rotation.z=Math.PI;mesh.position.set(x,elevation(x,z)+.025,z);
  root.add(mesh);return t;
}

async function selectEnvironment(id) {
  const token=++generation;previewState.ready=false;previewState.error=null;
  status.dataset.state='loading';status.textContent='טוענים את ההר…';
  const envEntry=manifest.environments.find(e=>e.id===id);
  const env=await json(envEntry.path);
  const wanted=env.assets.filter(a=>assetMap.get(a).kind!=='background');
  const [loaded, metadata]=await Promise.all([Promise.all(wanted.map(async id=>{
    const a=assetMap.get(id);
    return [id,a.kind==='model'?await gltfLoader.loadAsync(a.path):await texture(id)];
  })), Promise.all(['landing-cloud','powder-spray'].map(async id=>[id,await json(assetMap.get(id).metadata)]))]);
  if(token!==generation) {
    for(const [,v] of loaded) v.isTexture?v.dispose():disposeRoot(v.scene);
    return;
  }
  clearEffects();disposeRoot(root);Object.values(textures).forEach(t=>t.dispose());textures={};
  active=env;root=new THREE.Group();scene.add(root);flakes=[];cones=[];fogSheets=[];
  const models={};
  for(const [id,v] of loaded) v.isTexture?textures[id]=v:models[id]=v.scene;
  effectMeta=Object.fromEntries(metadata);
  scene.fog=new THREE.Fog(env.fog.color,env.fog.nearMeters,env.fog.farMeters);
  ambient.color.set(env.hemisphere.sky);ambient.groundColor.set(env.hemisphere.ground);ambient.intensity=env.hemisphere.intensity;
  sun.color.set(env.sun.color);sun.intensity=env.sun.intensity;sun.position.fromArray(env.sun.position);
  renderer.toneMappingExposure=env.exposure;
  const terrain=new THREE.PlaneGeometry(100,240,50,90);terrain.rotateX(-Math.PI/2);terrain.translate(0,0,85);
  const pos=terrain.attributes.position;
  const colors=[];
  for(let i=0;i<pos.count;i++){
    pos.setY(i,elevation(pos.getX(i),pos.getZ(i)));
    const t=THREE.MathUtils.smoothstep(pos.getZ(i),55,130);colors.push(1,1,1,1-t);
  }
  terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
  terrain.computeVertexNormals();
  for(const id of ['snow-albedo','snow-normal','snow-roughness']){textures[id].repeat.set(25,60);textures[id].anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}
  const piste=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({color:env.snowTint,map:textures['snow-albedo'],normalMap:textures['snow-normal'],normalScale:new THREE.Vector2(.22,.22),roughnessMap:textures['snow-roughness'],roughness:1,metalness:0,transparent:true,vertexColors:true}));
  piste.renderOrder=-2;root.add(piste);
  for(const side of [-1,1]) {
    for(let i=0;i<13;i++) {
      const z=3+i*6,x=side*8;
      const fence=models[`safety-fence-${id}`].clone(true);
      fence.rotation.y=Math.PI/2;fence.position.set(x,elevation(x,z),z);root.add(fence);
    }
    for(let i=0;i<5;i++){
      const z=12+i*15,x=side*6.7,marker=models[`route-marker-${id}`].clone(true);
      marker.position.set(x,elevation(x,z),z);marker.rotation.y=side*.12;root.add(marker);
    }
  }
  for(let i=0;i<7;i++)textures[`decal-${i}`]=decal(i%2?1:0,0,9+i*8,1.35,1.9,env.id==='night-floodlit'?.9:.68);
  textures['decal-left']=decal(2,-3,23,1.3,1.8);
  textures['decal-warning']=decal(4,4.5,16,1.8,1.8);
  textures['decal-tracks']=decal(8,-1.4,2,.8,4,.35);
  if(env.id==='fog') {
    for(let i=0;i<2;i++) {
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:textures['fog-ribbon'],transparent:true,opacity:.24,depthWrite:false,depthTest:true}));
      sprite.position.set(i?-11:10,2.2,38+i*22);sprite.scale.set(45,7,1);root.add(sprite);fogSheets.push(sprite);
    }
  }
  if(env.floodlights) {
    for(const [i,placement] of env.floodlights.placements.entries()){
      const p=placement.position, y=elevation(p[0],p[2]);
      const tower=models['floodlight-tower'].clone(true);tower.position.set(p[0],y,p[2]);root.add(tower);
      tower.rotation.y=p[0]<0?.4:-.4;
      const target=new THREE.Object3D();target.position.fromArray(placement.target);target.position.y=elevation(target.position.x,target.position.z);root.add(target);
      const light=new THREE.SpotLight(env.floodlights.color,env.floodlights.intensityCandela,44,.62,.5,2);
      light.position.set(p[0],y+11.75,p[2]+.22);light.target=target;root.add(light);
      const cone=new THREE.Sprite(new THREE.SpriteMaterial({map:textures['light-cone'],transparent:true,opacity:.22,depthWrite:false,depthTest:true,toneMapped:false}));
      cone.center.set(.5,1);cone.position.copy(light.position);cone.scale.set(12,15,1);root.add(cone);cones.push(cone);
      const pool=new THREE.Mesh(new THREE.PlaneGeometry(12,17),new THREE.MeshBasicMaterial({map:textures['light-pool'],color:'#fff0d0',transparent:true,opacity:.42,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-3}));
      pool.rotation.x=-Math.PI/2;pool.position.copy(target.position);pool.position.y+=.035;root.add(pool);
    }
  }
  for(let i=0;i<24;i++) {
    const t=textures['snow-flecks'].clone();t.needsUpdate=true;const f=i%16;
    t.repeat.set(63/256,63/256);t.offset.set((f%4*64+.5)/256,1-(Math.floor(f/4)*64+63.5)/256);textures[`flake-${i}`]=t;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:t,color:env.powderTint,transparent:true,opacity:.7,depthWrite:false}));
    sprite.scale.setScalar(.018+(i%5)*.008);sprite.position.set(Math.sin(i*14.3)*8,1+(i%8)*.5,-3+(i*7)%40);root.add(sprite);flakes.push(sprite);
  }
  bgOrientation=null;await setBackground();
  if(token!==generation) return;
  $('#scene-name').textContent=env.label;$('#scene-index').textContent=`0${ENVS.indexOf(id)+1} / 03`;
  $('#environment-note').textContent=notes[id];
  $('#bg-landscape').src=assetMap.get(`${id}-landscape`).path;$('#bg-portrait').src=assetMap.get(`${id}-portrait`).path;
  document.querySelectorAll('[data-environment]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.environment===id)));
  previewState.environment=id;previewState.loadedModels=Object.keys(models);previewState.ready=true;
  previewState.error=null;status.dataset.state='ready';
  updateMotionPreference();resize();
  renderer.render(scene,camera);
}
const ENVS=['sunset','fog','night-floodlit'];
function spawn(kind) {
  if(!previewState.ready)return;
  if(effects.length>=5){const e=effects.shift();root.remove(e.sprite);e.sprite.material.map.dispose();e.sprite.material.dispose();}
  const t=textures[kind].clone();t.needsUpdate=true;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:t,color:active.powderTint,transparent:true,depthWrite:false,depthTest:true}));
  sprite.center.set(.5,.2);sprite.position.set(kind==='landing-cloud'?0:1.4,elevation(0,6)+.06,6);
  sprite.scale.set(...effectMeta[kind].sizeMeters,1);root.add(sprite);
  effects.push({sprite,kind,age:0});previewState.activeEffects=effects.length;
  previewState.effectFrame=0;
}
function updateMotionPreference(){for(const o of [...flakes,...cones,...fogSheets])o.visible=!reduced.matches;}
function drawAtlas(f) {
  const img=textures['landing-cloud']?.image;if(!img)return;
  atlasCtx.clearRect(0,0,256,192);atlasCtx.drawImage(img,f%4*128,Math.floor(f/4)*128,128,128,32,0,192,192);
  $('#frame-number').textContent=`${String(f+1).padStart(2,'0')} / 16`;$('#frame').value=f;previewState.frame=f;
}
function tick(now){
  const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
  if(!paused)clock+=dt;
  if(root&&previewState.ready){
    if(!paused){
      for(const e of [...effects]){
        e.age+=dt;const meta=effectMeta[e.kind],duration=reduced.matches ? .15 : meta.durationSeconds;
        if(e.age>=duration){root.remove(e.sprite);e.sprite.material.map.dispose();e.sprite.material.dispose();effects.splice(effects.indexOf(e),1);continue;}
        const f=reduced.matches?5:Math.min(15,Math.floor(e.age*meta.fps)),uv=meta.frames[f].uv;
        previewState.effectFrame=f;
        e.sprite.material.map.repeat.set(uv[2]-uv[0],uv[3]-uv[1]);e.sprite.material.map.offset.set(uv[0],uv[1]);
        e.sprite.material.opacity=reduced.matches ? .35 : 1;
      }
      if(!reduced.matches){
        for(let i=0;i<flakes.length;i++){const p=flakes[i].position;p.y-=dt*.15;if(p.y<.3)p.y=4.5;p.x+=Math.sin(clock*.4+i)*dt*.035;}
        fogSheets.forEach((s,i)=>s.position.x=(i?-11:10)+Math.sin(clock*.08+i)*2);
      }
    }
    previewState.activeEffects=effects.length;
    drawAtlas(frameOverride??(reduced.matches?5:Math.floor(clock*16)%16));
    renderer.render(scene,camera);
  }
  requestAnimationFrame(tick);
}
$('#landing').onclick=()=>spawn('landing-cloud');$('#powder').onclick=()=>spawn('powder-spray');
$('#pause').onclick=()=>{paused=!paused;$('#pause').setAttribute('aria-pressed',String(paused));$('#pause').textContent=paused?'המשך':'השהיה';};
$('#frame').oninput=e=>{frameOverride=Number(e.target.value);drawAtlas(frameOverride);};
document.querySelectorAll('[data-environment]').forEach(b=>b.onclick=()=>selectEnvironment(b.dataset.environment).catch(fail));
new ResizeObserver(resize).observe(stage);reduced.addEventListener('change',updateMotionPreference);
try{
  manifest=await json('manifest.json');manifest.assets.forEach(a=>assetMap.set(a.id,a));
  await selectEnvironment('sunset');requestAnimationFrame(tick);
}catch(e){fail(e);}

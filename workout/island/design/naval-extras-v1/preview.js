// Original asset inspector, CC0-1.0. Existing repository loaders stay unchanged.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const loader = new GLTFLoader();
const loaded = new Map();
const labels = {
  supply_buoy: 'מצוף אספקה', ammo_crate: 'ארגז צף',
  patrol_boat: 'סירת סיור', small_destroyer: 'משחתת קטנה', tower_submarine: 'צוללת',
  shell_regular: 'פגז רגיל', shell_heavy: 'פגז כבד', landing_flag: 'דגל נחיתה',
};
const fxLabels = {bow_mist:'אדי חרטום',landing_splash:'נתז נחיתה',water_explosion:'רסס פיצוץ',foam:'קצף',vulcan_missile:'טיל וולקן'};
const soundLabels = {supply_collect:'איסוף אספקה',shell_hit_ship:'פגיעה בספינה',base_cannon:'תותח בסיס',depot_burst:'פיצוץ מחסן קצר'};
const stage = $('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a2cdbb');
scene.fog = new THREE.Fog('#a2cdbb',24,75);
const camera = new THREE.PerspectiveCamera(36,1,.01,120);
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','תצוגת הנכס הנבחר; אפשר לסובב גם במקשי החצים ולקרב במקשי פלוס ומינוס');
renderer.domElement.tabIndex = 0;
stage.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff2d1','#3a7a76',1.5));
const sun = new THREE.DirectionalLight('#fff0c7',2.4);
sun.position.set(-6,11,8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:40});
sun.shadow.normalBias = .025;
scene.add(sun);
const water = new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:'#6cafa4',roughness:.68,metalness:.04}));
water.rotation.x = -Math.PI/2;
water.position.y = -.025;
water.receiveShadow = true;
scene.add(water);
// Discrete low-poly ripple strokes on the water, all geometry local to this preview.
const ripple = new THREE.Group();
for (let i=0;i<36;i++) {
  const z = -13 + Math.floor(i/6)*4.7, x = -12+(i%6)*5.1 + Math.sin(i*4)*.7;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(.3+(i%4)*.14,.022),new THREE.MeshBasicMaterial({color:'#c1dace',transparent:true,opacity:.38}));
  line.rotation.x = -Math.PI/2;
  line.rotation.z = .15*Math.sin(i);
  line.position.set(x,-.018,z);
  ripple.add(line);
}
scene.add(ripple);
const display = new THREE.Group();
scene.add(display);
let manifest, current='fleet', state='intact', mixer=null, action=null;
let radius=11, theta=.64, phi=1.02, targetY=.2, elapsed=0, loadToken=0, aspectScale=1;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('paused').checked = paused;
let fx = [];

function updateCamera() {
  camera.position.set(radius*Math.sin(phi)*Math.sin(theta),targetY+radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(0,targetY,0);
}
function resetCamera() {
  theta=.64; phi=1.02;
  const model=manifest?.models.find(m=>m.id===current);
  if (current==='fleet') {radius=13.5*aspectScale;targetY=.1;}
  else {
    radius=Math.max(...model.boundsMetres.size)*2.1*aspectScale;
    targetY=model.id.startsWith('shell_') ? .06 : .38;
  }
  updateCamera();
}
new ResizeObserver(() => {
  const {width,height}=stage.getBoundingClientRect();
  renderer.setSize(width,height);
  camera.aspect=width/height;
  camera.updateProjectionMatrix();
  const nextScale=Math.max(1,1.3/camera.aspect);
  radius*=nextScale/aspectScale;
  aspectScale=nextScale;
  updateCamera();
}).observe(stage);
let pointer=null;
renderer.domElement.addEventListener('pointerdown',e=>{
  pointer={x:e.clientX,y:e.clientY}; renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
  if (!pointer) return;
  theta-=(e.clientX-pointer.x)*.008;
  phi=THREE.MathUtils.clamp(phi+(e.clientY-pointer.y)*.005,.2,1.48);
  pointer={x:e.clientX,y:e.clientY};updateCamera();
});
for (const type of ['pointerup','pointercancel','lostpointercapture']) renderer.domElement.addEventListener(type,()=>pointer=null);
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();radius=THREE.MathUtils.clamp(radius*Math.exp(e.deltaY*.001),.25,35);updateCamera();},{passive:false});
renderer.domElement.addEventListener('keydown',e=>{
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key)) return;
  e.preventDefault();
  if (e.key==='ArrowLeft') theta-=.12;
  if (e.key==='ArrowRight') theta+=.12;
  if (e.key==='ArrowUp') phi=Math.max(.2,phi-.09);
  if (e.key==='ArrowDown') phi=Math.min(1.48,phi+.09);
  if (e.key==='+'||e.key==='=') radius=Math.max(.25,radius*.9);
  if (e.key==='-') radius=Math.min(35,radius*1.1);
  updateCamera();
});
$('reset-view').onclick=resetCamera;
$('paused').onchange=e=>paused=e.target.checked;

async function asset(id) {
  if (!loaded.has(id)) {
    loaded.set(id,loader.loadAsync(manifest.models.find(m=>m.id===id).file).then(gltf=>{
      for (const root of gltf.scenes) root.traverse(o=>{if(o.isMesh){o.castShadow=o.name!=='landing_decal';o.receiveShadow=true;}});
      return gltf;
    }).catch(error=>{loaded.delete(id);throw error;}));
  }
  return loaded.get(id);
}
function applyRig() {
  display.traverse(o=>{
    if(o.userData.role==='turret') o.rotation.y=THREE.MathUtils.degToRad(Number($('yaw').value));
    if(o.userData.role==='barrel') o.rotation.x=-THREE.MathUtils.degToRad(Number($('pitch').value));
  });
}
$('yaw').oninput=$('pitch').oninput=applyRig;
function applyBeacon() {
  display.traverse(o=>{
    if (o.isPointLight) o.intensity=$('beacon').checked?2:0;
    if (o.isMesh && o.material.name==='amber_lens_on') o.material.emissiveIntensity=$('beacon').checked?1:0;
  });
}
$('beacon').onchange=applyBeacon;
function applyDecal() {
  display.traverse(o=>{if(o.name==='landing_decal'){o.material.opacity=$('decal').checked ? .55 : 0;o.material.depthWrite=false;}});
}
$('decal').onchange=applyDecal;
function stopMixer() {
  if(mixer){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());mixer=null;action=null;}
}
function removeDisplayed() {
  stopMixer();
  for(const child of [...display.children]){child.position.set(0,0,0);child.quaternion.identity();display.remove(child);}
}
async function select(id,nextState='intact',keepCamera=false) {
  const token=++loadToken;
  current=id;state=nextState;
  $('load-status').hidden=false;
  $('load-status').textContent='טוען את הנכס…';
  for(const b of $('asset-list').children) b.setAttribute('aria-pressed',String(b.dataset.id===id));
  const model=manifest.models.find(m=>m.id===id);
  $('ship-controls').hidden=!model?.states;
  $('buoy-controls').hidden=id!=='supply_buoy';
  $('flag-controls').hidden=id!=='landing_flag';
  $('replay-sinking').hidden=nextState!=='sinking';
  $('model-title').textContent=labels[id]||'הצי החדש';
  $('model-download').hidden=id==='fleet';
  if(model) $('model-download').href=model.file;
  $('model-note').textContent=model?`${model.trianglesByScene[nextState]||model.trianglesByScene.default} משולשים · ${model.boundsMetres.size.map(x=>x.toFixed(2)).join(' × ')} מ׳`: 'שלוש צלליות חדשות, מצוף זוהר, ארגז אספקה ודגל כתום על המים.';
  for(const b of $('states').children) b.setAttribute('aria-pressed',String(b.dataset.state===nextState));
  try {
    const ids=id==='fleet'?['patrol_boat','small_destroyer','tower_submarine','supply_buoy','ammo_crate','landing_flag']:[id];
    const assets=await Promise.all(ids.map(asset));
    if(token!==loadToken) return;
    removeDisplayed();
    ids.forEach((key,i)=>{
      const gltf=assets[i];
      const index=id==='fleet'?0:(model.states?.indexOf(nextState)||0);
      const root=gltf.scenes[index];
      root.position.set(0,0,0);root.quaternion.identity();
      if(id==='fleet'){
        const positions=[[-2.5,0,-.6],[.1,0,-1.5],[2.8,0,-.2],[-2.2,0,2.1],[-.6,0,2.6],[1.6,0,2.1]];
        root.position.set(...positions[i]);root.rotation.y=i<3?-.23:0;
      }
      display.add(root);
      if(nextState==='sinking'&&id!=='fleet'){
        mixer=new THREE.AnimationMixer(root);
        action=mixer.clipAction(gltf.animations.find(a=>a.name==='sinking'));
        action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
      }
    });
    water.visible=!id.startsWith('shell_');
    ripple.visible=water.visible;
    if(!keepCamera) resetCamera();
    applyRig();applyBeacon();applyDecal();
    $('load-status').hidden=true;
  } catch(error) {
    if(token===loadToken){$('load-status').hidden=false;$('load-status').textContent=`טעינת הנכס נכשלה: ${error.message}`;}
    console.error(error);
  }
}
for(const b of $('states').children) b.onclick=()=>select(current,b.dataset.state,true);
$('replay-sinking').onclick=()=>select(current,'sinking',true);

function buildEffects() {
  for(const s of [...manifest.effects,manifest.vulcanMissile]) {
    const card=document.createElement('figure');card.className='fx-card';
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
    canvas.setAttribute('aria-label',fxLabels[s.id]);
    const cap=document.createElement('figcaption');
    const text=document.createElement('span');text.textContent=fxLabels[s.id];
    const link=document.createElement('a');link.href=s.file;link.download='';link.textContent='PNG ↓';
    cap.append(text,link);
    const note=document.createElement('small');note.textContent=`16 פריימים · ${s.fps} fps`;
    card.append(canvas,cap,note);$('effects').append(card);
    const image=new Image();image.src=s.file;
    fx.push({canvas,context:canvas.getContext('2d'),image,spec:s});
  }
}
function buildSounds() {
  for(const s of manifest.audio) {
    const card=document.createElement('div');card.className='sound-card';
    const row=document.createElement('div');row.className='sound-top';
    const button=document.createElement('button');button.className='sound-play';button.setAttribute('aria-label',`ניגון ${soundLabels[s.id]}`);
    const icon=document.createElement('span');icon.className='play-icon';icon.setAttribute('aria-hidden','true');button.append(icon);
    const text=document.createElement('div');
    const name=document.createElement('p');name.className='sound-name';name.textContent=soundLabels[s.id];
    const time=document.createElement('div');time.className='sound-time';time.textContent=`${s.durationSeconds.toFixed(2)} s · −16 LUFS`;
    text.append(name,time);row.append(button,text);
    const links=document.createElement('div');links.className='sound-links';
    for(const file of s.files){const a=document.createElement('a');a.href=file.file;a.download='';a.textContent=file.format.toUpperCase()+' ↓';links.append(a);}
    button.onclick=async()=>{
      const player=$('audio');player.pause();player.replaceChildren();
      for(const f of s.files){const source=document.createElement('source');source.src=f.file;source.type=f.mimeType;player.append(source);}
      player.load();$('audio-status').textContent=soundLabels[s.id];
      try{await player.play();}catch{ $('audio-status').textContent='אפשר לנגן בנגן או להוריד את הצליל.'; }
    };
    card.append(row,links);$('sounds').append(card);
  }
}
let last=performance.now();
function tick(now) {
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!paused){elapsed+=dt;if(mixer)mixer.update(dt);}
  for(const f of fx){
    const {canvas,context:c,image,spec}=f;
    if(!image.complete||!image.naturalWidth)continue;
    c.clearRect(0,0,256,256);
    if($('atlas-view').checked)c.drawImage(image,0,0,256,256);
    else{const i=paused?7:Math.floor(elapsed*spec.fps)%16;c.drawImage(image,(i%4)*64,Math.floor(i/4)*64,64,64,0,0,256,256);}
  }
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

try {
  const response=await fetch('manifest.json');
  if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
  manifest=await response.json();
  for(const id of ['fleet',...Object.keys(labels)]){
    const b=document.createElement('button');b.textContent=labels[id]||'כל הצי';b.dataset.id=id;b.setAttribute('aria-pressed',String(id==='fleet'));
    b.onclick=()=>select(id);$('asset-list').append(b);
  }
  buildEffects();buildSounds();await select('fleet');
  // Read-only inspection hook, useful for downstream integration and manual review.
  window.navalExtras={get selected(){return current;},get state(){return state;},get root(){return display;},get manifest(){return manifest;},get renderer(){return renderer;},get mixer(){return mixer;},select};
} catch(error){$('load-status').hidden=false;$('load-status').textContent=`לא ניתן לפתוח את התצוגה: ${error.message}. יש להגיש את המאגר בשרת HTTP מקומי.`;console.error(error);}

window.addEventListener('pagehide',()=>{
  stopMixer();
  const geometries=new Set(),materials=new Set(),textures=new Set();
  const collect=o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [o.material].flat()){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}};
  scene.traverse(collect);
  for(const p of loaded.values())p.then(g=>{for(const root of g.scenes)root.traverse(collect);for(const t of textures)t.dispose();for(const m of materials)m.dispose();for(const g of geometries)g.dispose();});
  $('audio').pause();renderer.dispose();
});

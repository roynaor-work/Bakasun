import * as T from './vendor/engine.mjs';
import { loadVehicle } from './vehicle-controller.mjs';

const $ = selector => document.querySelector(selector);
const manifest = await (await fetch(new URL('./manifest.json',import.meta.url))).json();
const stage = $('#stage');
const query = new URLSearchParams(location.search);
const scene = new T.Scene();
const renderer = new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
stage.prepend(renderer.domElement);
const camera = new T.OrthographicCamera(-4,4,3,-3,.1,70);
camera.position.set(6,4.3,7.5);
const orbit = new T.OrbitControls(camera,renderer.domElement);
orbit.enablePan=false;
orbit.enableDamping=true;
orbit.dampingFactor=.10;
orbit.minPolarAngle=.25;
orbit.maxPolarAngle=Math.PI/2-.12;
orbit.minZoom=.75;
orbit.maxZoom=2;
const environmentScene = new T.RoomEnvironment();
const pmrem = new T.PMREMGenerator(renderer);
const environmentTarget = pmrem.fromScene(environmentScene,.04);
scene.environment = environmentTarget.texture;
environmentScene.dispose();
pmrem.dispose();
scene.add(new T.HemisphereLight(0xd4ebff,0x283241,1.8));
const sun = new T.DirectionalLight(0xffead0,3.2);
sun.position.set(-4,8,6);
sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-5;sun.shadow.camera.right=5;
sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;
sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;
scene.add(sun);
const rimLight = new T.DirectionalLight(0x72b8ff,2.5);
rimLight.position.set(5,3,-5);
scene.add(rimLight);
const ground = new T.Mesh(new T.CylinderGeometry(3.55,3.63,.14,64),new T.MeshStandardMaterial({color:0x253742,roughness:.88,metalness:.1}));
ground.position.y=-.085;
ground.receiveShadow=true;
scene.add(ground);
const circle = new T.Mesh(new T.TorusGeometry(3.37,.014,4,80),new T.MeshBasicMaterial({color:0x526b7b,transparent:true,opacity:.6}));
circle.rotation.x=Math.PI/2;circle.position.y=-.008;scene.add(circle);
const markings = new T.Group();
const markGeometry = new T.BoxGeometry(.035,.005,.22);
const markMaterial = new T.MeshBasicMaterial({color:0x6f8a9a});
for(let i=0;i<24;i++){
  const a=Math.PI*2*i/24;
  const object = new T.Mesh(markGeometry,markMaterial);
  object.position.set(Math.sin(a)*3.12,-.008,Math.cos(a)*3.12);
  object.rotation.y=a;markings.add(object);
}
scene.add(markings);

let vehicle, selected, team='police', loadingGeneration=0;
let rolling=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let lights=true, smoke=false, damage='intact', wireframe=false;
let frameBounds = new T.Box3();
let lastTime=performance.now();
const corner = new T.Vector3(), offset = new T.Vector3(), inverse = new T.Quaternion();

function fit(reset=false){
  if(!vehicle)return;
  if(reset){
    const center=frameBounds.getCenter(new T.Vector3());
    orbit.target.copy(center);
    camera.position.copy(center).add(new T.Vector3(6,4.3,7.5));
    camera.zoom=1;
    orbit.update();
  }
  const rect=stage.getBoundingClientRect();
  const aspect=rect.width/rect.height;
  camera.updateMatrixWorld(true);
  inverse.copy(camera.quaternion).invert();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<8;i++){
    corner.set(i&1?frameBounds.max.x:frameBounds.min.x,i&2?frameBounds.max.y:frameBounds.min.y,i&4?frameBounds.max.z:frameBounds.min.z);
    corner.sub(orbit.target).applyQuaternion(inverse);
    minX=Math.min(minX,corner.x);maxX=Math.max(maxX,corner.x);
    minY=Math.min(minY,corner.y);maxY=Math.max(maxY,corner.y);
  }
  const h=Math.max((maxY-minY)*.61,(maxX-minX)/aspect*.60,1.1);
  camera.left=-h*aspect;camera.right=h*aspect;camera.top=h;camera.bottom=-h;
  camera.updateProjectionMatrix();
}

function resize(){
  const rect=stage.getBoundingClientRect();
  renderer.setSize(rect.width,rect.height,false);
  fit();
}
new ResizeObserver(resize).observe(stage);
orbit.addEventListener('change',()=>fit());

function catalog(){
  $('#vehicles').innerHTML='';
  for(const [i,meta] of manifest.assets.entries()){
    if(meta.team!==team)continue;
    const button=document.createElement('button');
    button.className='vehicle';
    button.dataset.id=meta.id;
    button.setAttribute('aria-pressed',String(selected?.id===meta.id));
    button.innerHTML=`<span class="number">${String(i+1).padStart(2,'0')}</span><span class="dot" style="background:${meta.colors[0]}"></span><span class="name">${meta.label}</span><span class="arrow" aria-hidden="true">‹</span>`;
    button.addEventListener('click',()=>selectVehicle(meta));
    $('#vehicles').append(button);
  }
}

function pressed(selector,value){ $(selector).setAttribute('aria-pressed',String(value)); }
function setWireframe(value){
  wireframe=Boolean(value);
  pressed('#wireframe',wireframe);
  vehicle?.root.traverse(object=>{
    if(!object.isMesh || object.parent?.name==='vehicle_effects')return;
    for(const mat of Array.isArray(object.material)?object.material:[object.material])mat.wireframe=wireframe;
  });
}

async function selectVehicle(meta){
  const generation=++loadingGeneration;
  $('#loading').hidden=false;
  selected=meta;
  catalog();
  try{
    const next = await loadVehicle(meta);
    if(generation!==loadingGeneration){next.dispose();return;}
    vehicle?.dispose();
    vehicle=next;
    scene.add(vehicle.root);
    frameBounds.setFromObject(vehicle.scenes.get('intact').scene,true);
    vehicle.setDamage(damage);
    vehicle.setLights(lights);
    vehicle.setEngineSmoke(smoke);
    setWireframe(wireframe);
    $('#model-name').textContent=meta.label;
    $('#team-label').textContent=meta.team==='police'?'יחידת המרדף':'רכבי המילוט';
    $('#asset-number').textContent=`${String(manifest.assets.indexOf(meta)+1).padStart(2,'0')} / 14`;
    $('#triangles').textContent=`${meta.triangles.intact.toLocaleString('he-IL')} משולשים`;
    $('#bytes').textContent=`${(meta.bytes/1000).toFixed(0)} KB`;
    $('.stage-stamp span').textContent=damage==='intact'?'מוכן למרדף':damage==='damaged'?'סימני פגיעה':'נזק כבד';
    const wheelLabels={FL:'קדמי שמאל',FR:'קדמי ימין',RL:'אחורי שמאל',RR:'אחורי ימין',F:'קדמי',R:'אחורי'};
    $('#wheel').innerHTML=meta.wheels.filter(w=>!w.spare).map(w=>`<option value="${w.id}">${wheelLabels[w.id]}</option>`).join('');
    $('#colors').innerHTML='';
    meta.colors.forEach((color,i)=>{
      const button=document.createElement('button');
      button.style.background=color;
      button.setAttribute('aria-label',`צבע ${i+1}`);
      button.setAttribute('aria-pressed',String(i===0));
      button.addEventListener('click',()=>{
        vehicle.setColor(color);
        for(const b of $('#colors').children)b.setAttribute('aria-pressed',String(b===button));
      });
      $('#colors').append(button);
    });
    fit(true);
    $('#loading').hidden=true;
    window.dispatchEvent(new CustomEvent('vehicle-ready',{detail:{id:meta.id}}));
  }catch(error){
    if(generation!==loadingGeneration)return;
    $('#loading').textContent='טעינת הרכב נכשלה. יש לפתוח דרך שרת מקומי ולרענן.';
    console.error(error);
  }
}

for(const tab of document.querySelectorAll('[data-team]')){
  tab.addEventListener('click',()=>{
    team=tab.dataset.team;
    for(const t of document.querySelectorAll('[data-team]'))t.setAttribute('aria-selected',String(t===tab));
    $('#vehicles').setAttribute('aria-labelledby',tab.id);
    selectVehicle(manifest.assets.find(a=>a.team===team));
  });
  tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const tabs=[...document.querySelectorAll('[data-team]')];
    const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs.find(t=>t!==tab);
    next.focus();next.click();
  });
}
for(const button of document.querySelectorAll('[data-damage]'))button.addEventListener('click',()=>{
  damage=button.dataset.damage;
  vehicle?.setDamage(damage);
  for(const b of document.querySelectorAll('[data-damage]'))b.setAttribute('aria-pressed',String(b===button));
  smoke=damage!=='intact';
  vehicle?.setEngineSmoke(smoke);pressed('#smoke',smoke);
  $('.stage-stamp span').textContent=damage==='intact'?'מוכן למרדף':damage==='damaged'?'סימני פגיעה':'נזק כבד';
});
$('#rolling').addEventListener('click',()=>{rolling=!rolling;pressed('#rolling',rolling);});
$('#lights').addEventListener('click',()=>{lights=!lights;vehicle?.setLights(lights);pressed('#lights',lights);});
$('#smoke').addEventListener('click',()=>{smoke=!smoke;vehicle?.setEngineSmoke(smoke);pressed('#smoke',smoke);});
$('#burst').addEventListener('click',()=>vehicle?.burstTire($('#wheel').value));
$('#wireframe').addEventListener('click',()=>setWireframe(!wireframe));
$('#reset').addEventListener('click',()=>{
  damage='intact';smoke=false;lights=true;
  vehicle?.reset();setWireframe(false);fit(true);
  pressed('#lights',true);pressed('#smoke',false);
  for(const b of document.querySelectorAll('[data-damage]'))b.setAttribute('aria-pressed',String(b.dataset.damage===damage));
  $('.stage-stamp span').textContent='מוכן למרדף';
});
pressed('#rolling',rolling);

renderer.setAnimationLoop(time=>{
  const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
  vehicle?.update(dt,rolling?2.0:0);
  orbit.update();
  renderer.render(scene,camera);
});
renderer.domElement.addEventListener('webglcontextlost',event=>{
  event.preventDefault();$('#loading').hidden=false;$('#loading').textContent='התצוגה נעצרה. מרעננים כדי להמשיך.';
});

// The same public controller API is used for integration and browser verification.
window.catchVehicles={manifest,get vehicle(){return vehicle;},renderer,camera,orbit,scene,
  select:async id=>{
    const meta=manifest.assets.find(a=>a.id===id);
    if(!meta)throw new RangeError(id);
    team=meta.team;
    for(const t of document.querySelectorAll('[data-team]'))t.setAttribute('aria-selected',String(t.dataset.team===team));
    $('#vehicles').setAttribute('aria-labelledby',team+'-tab');
    await selectVehicle(meta);
  },
  render:()=>renderer.render(scene,camera)};
const initial=manifest.assets.find(a=>a.id===query.get('vehicle'))||manifest.assets[0];
team=initial.team;
for(const t of document.querySelectorAll('[data-team]'))t.setAttribute('aria-selected',String(t.dataset.team===team));
await selectVehicle(initial);

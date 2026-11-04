import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {clone as skeletonClone} from './vendor/SkeletonUtils.js';
import {catalog,ids,lodIds} from './catalog.mjs';
import {DefenseEffects} from './effects.mjs';

const $=id=>document.getElementById(id),canvas=$('canvas'),stage=$('stage');
const params=new URLSearchParams(location.search);
const embedded=globalThis.DEFENSE_EMBEDDED;
const state={scene:params.get('scene')||'space',night:params.get('light')==='night',close:params.get('view')==='close',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality:'auto',selected:null,ready:false,time:0,frame:0,yaw:0,pitch:0,zoom:1,fxTime:0,errors:[],samples:[],lod:{high:0,low:0}};
if(params.has('still'))state.playing=false;
const assets=new Map(),mixers=[],moving=[],lods=[],guardPairs=[];
const scene=new T.Scene(),spaceRoot=new T.Group(),farmRoot=new T.Group(),inspectRoot=new T.Group();
scene.add(spaceRoot,farmRoot,inspectRoot);
const camera=new T.PerspectiveCamera(36,1,.1,250),target=new T.Vector3(0,1,0);
let renderer;
try{
  renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:params.has('capture')});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
}catch(error){fail(error);}
const hemi=new T.HemisphereLight('#dceadf','#526957',2.2),sun=new T.DirectionalLight('#fff0cf',3.0),rim=new T.DirectionalLight('#a9ded8',1.3);
sun.position.set(-8,18,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.camera.near=1;sun.shadow.camera.far=50;sun.shadow.normalBias=.045;sun.shadow.bias=-.0003;
rim.position.set(8,7,-6);scene.add(hemi,sun,rim);

const draco=new DRACOLoader();draco.setDecoderPath('./vendor/draco/');draco.setWorkerLimit(2);
if(embedded){
  draco._loadLibrary=async(url,type)=>{
    const key=url.split('/').at(-1),value=embedded['vendor/draco/'+key];if(!value)throw Error('Missing embedded decoder '+key);
    return type==='arraybuffer'?decode(value).buffer:new TextDecoder().decode(decode(value));
  };
}
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
function decode(base64){const s=atob(base64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
async function data(path){if(embedded){const d=embedded[path];if(!d)throw Error('Missing embedded '+path);return JSON.parse(new TextDecoder().decode(decode(d)));}const r=await fetch(path);if(!r.ok)throw Error(path+' '+r.status);return r.json();}
async function load(id){
  if(assets.has(id))return assets.get(id);
  const promise=(async()=>{
    const path='models/'+id+'.glb';
    const gltf=embedded?await loader.parseAsync(decode(embedded[path]).buffer,''):await loader.loadAsync(path);
    if(id.endsWith('-lod1')){
      const original=await load(id.slice(0,-5));let sharedMap=null;
      original.scene.traverse(o=>{if(o.isMesh&&o.material.map)sharedMap=o.material.map;});
      if(sharedMap)gltf.scene.traverse(o=>{if(o.isMesh&&o.material.map&&o.material.map!==sharedMap){const old=o.material.map;o.material.map=sharedMap;old.dispose();old.image?.close?.();}});
    }
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;}});
    return gltf;
  })();assets.set(id,promise);return promise;
}
function copy(gltf){return gltf.scene.getObjectByProperty('isSkinnedMesh',true)?skeletonClone(gltf.scene):gltf.scene.clone(true);}
async function model(id,parent,position=[0,0,0],scale=1,yaw=0,{animate=false,clip='idle',lod=true}={}){
  const gltf=await load(id),obj=copy(gltf),wrapper=new T.Group();wrapper.position.fromArray(position);wrapper.scale.setScalar(scale);wrapper.rotation.y=yaw;
  wrapper.userData={assetId:id};let low=null,lowGLTF=null;
  if(lod&&lodIds.has(id)){
    const levels=new T.LOD();lowGLTF=await load(id+'-lod1');low=copy(lowGLTF);levels.addLevel(obj,0);levels.addLevel(low,id.startsWith('alien')?13:id.startsWith('guard-')?8:17);wrapper.add(levels);lods.push(levels);
  }else wrapper.add(obj);
  parent.add(wrapper);
  if(animate&&gltf.animations.length){
    const mixer=new T.AnimationMixer(obj),animation=gltf.animations.find(a=>a.name===clip)||gltf.animations[0],action=mixer.clipAction(animation);action.play();mixers.push({mixer,root:wrapper,id,action});
    // Deterministic phase offsets prevent a synchronized toy parade.
    mixer.setTime(mixers.length*.173);
    if(low&&lowGLTF.animations.length){const lowMixer=new T.AnimationMixer(low),lowClip=lowGLTF.animations.find(a=>a.name===clip)||lowGLTF.animations[0],lowAction=lowMixer.clipAction(lowClip);lowAction.play();mixers.push({mixer:lowMixer,root:wrapper,id:id+'-lod1',action:lowAction});lowMixer.setTime(mixers.length*.173);}
  }
  return wrapper;
}
async function instances(id,parent,placements){
  const create=async sourceId=>{
  const source=(await load(sourceId)).scene;source.updateMatrixWorld(true);
  const batch=new T.Group();
  source.traverse(o=>{
    if(!o.isMesh)return;
    const mesh=new T.InstancedMesh(o.geometry,o.material,placements.length),dummy=new T.Object3D();
    placements.forEach((p,i)=>{dummy.position.fromArray(p.position);dummy.rotation.set(0,p.rotationY||0,0);dummy.scale.setScalar(p.scale||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix.clone().multiply(o.matrixWorld));});
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.userData.assetId=id;batch.add(mesh);
  });return batch;};
  const batch=await create(id);
  if(lodIds.has(id)){
    const levels=new T.LOD(),low=await create(id+'-lod1');levels.addLevel(batch,0);levels.addLevel(low,12);parent.add(levels);lods.push(levels);return levels;
  }
  parent.add(batch);return batch;
}
function mat(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.88,...extra});}

// The sky and water are original analytic shaders; all model geometry is GLB.
const skyUniforms={top:{value:new T.Color('#8FB9C8')},bottom:{value:new T.Color('#ECE4D2')},resolution:{value:new T.Vector2(1,1)}};
const sky=new T.Mesh(new T.SphereGeometry(130,24,12),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:skyUniforms,
  vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 top,bottom;uniform vec2 resolution;void main(){float h=clamp(gl_FragCoord.y/resolution.y,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.82)),1.);\n#include <colorspace_fragment>\n}'
}));scene.add(sky);
const waterUniforms={time:{value:0},night:{value:0}};
const sea=new T.Mesh(new T.PlaneGeometry(180,180,1,1).rotateX(-Math.PI/2),new T.ShaderMaterial({uniforms:waterUniforms,
  vertexShader:'varying vec3 p;void main(){p=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}',
  fragmentShader:`varying vec3 p;uniform float time,night;void main(){float rip=sin(p.x*2.7+p.z*1.4+time*.7)*cos(p.z*3.2-time*.6);float shallow=1.-smoothstep(6.,14.,length(p.xz));vec3 c=mix(vec3(.14,.48,.55),vec3(.31,.70,.67),shallow);c+=smoothstep(.87,1.,rip)*.13;c=mix(c,c*vec3(.07,.12,.22),night);gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}`
}));sea.position.y=-.14;sea.receiveShadow=true;farmRoot.add(sea);

function addStars(){
  const n=220,positions=[],sizes=[];let seed=761;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<n;i++){positions.push((rnd()-.5)*65,rnd()*28-10,(rnd()-.5)*38-18);sizes.push(.5+rnd());}
  const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
  const points=new T.Points(geo,new T.PointsMaterial({color:'#FFF0CC',size:.13,transparent:true,opacity:.76,sizeAttenuation:true,depthWrite:false}));spaceRoot.add(points);return points;
}
const stars=addStars();

let effects,alarmAge=99,inspectMixer=null;
function effect(){
  if(!state.ready)return;
  if(state.selected){effects.burst();effects.aimLaser(0,[-.3,0,3],[0,0,0]);effects.aimLaser(1,[.3,0,3],[0,0,0]);toast('פיצוץ · לייזר · גל הלם');return;}
  if(state.scene==='farm'){alarmAge=0;toast('פעמון התרעה · הצוות מגיב');
    for(const item of mixers.filter(m=>m.id.startsWith('guard-'))){const gltfPromise=assets.get(item.id);gltfPromise.then(g=>{const clip=g.animations.find(a=>a.name==='alert');if(clip){item.mixer.stopAllAction();const a=item.mixer.clipAction(clip).setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.reset().play();}});}
  }else{effects.burst({position:[.1,1.2,.4]});effects.aimLaser(0,[-.35,-.5,3.7],[-.1,0,0]);effects.aimLaser(1,[.35,-.5,3.7],[.1,0,0]);toast('פיצוץ · לייזר · גל הלם');}
}
function updateFX(dt){
  alarmAge+=dt;effects?.update(dt,camera);
  const bell=farmRoot.getObjectByName('alarm-bell');
  if(bell){const b=bell.getObjectByName('bell');if(b)b.rotation.z=alarmAge<2?Math.sin(alarmAge*17)*.23*Math.exp(-alarmAge):0;}
  if(alarmAge>=2&&alarmAge-dt<2)for(const m of mixers.filter(m=>m.id.startsWith('guard-'))){m.mixer.stopAllAction();m.mixer.clipAction(m.action.getClip()).reset().play();}
}
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2200);}
function fail(error){state.errors.push(String(error?.stack||error));$('failure').hidden=false;$('failure-message').textContent='יש לפתוח את offline.html ישירות, או להגיש את התיקייה בשרת מקומי.';if($('loading'))$('loading').hidden=true;console.error(error);}

async function buildSpace(){
  const specs=[['alien-scout',[-2.65,1.4,1.35],.85,0],['alien-manta',[2.6,1.4,1.25],.90,.22],['alien-beetle',[-3.0,1.7,-2.0],.85,.18],['alien-carrier',[2.8,1.9,-2.2],.84,0],['alien-harvester',[0,1.5,-.6],.8,.15],['alien-boss',[0,2.45,-4.6],1.1,0],['defender-plane',[0,.45,4.1],1.1,Math.PI]];
  for(const [id,p,s,yaw]of specs){const o=await model(id,spaceRoot,p,s,yaw);o.name=id;moving.push({o,base:o.position.y,phase:moving.length*.82,kind:'ship'});}
  const planet=await model('planet-ring',spaceRoot,[-7,1,-10],2.3,.2);planet.rotation.z=-.24;
  await model('planet-moon',spaceRoot,[8,3,-15],2.0,-.5);
  for(const [p,s]of [[[-6,-.5,1],1.6],[[6,-.4,-5],1.8],[[-2,-.8,-8],1.4]])await model('island-cloud',spaceRoot,p,s,0);
}
async function buildFarm(){
  const layout=await data('farm-layout.json');
  const repeated=new Map();
  for(const spec of layout.props){if(spec.asset==='island-palm'||spec.asset==='crop-patch'||spec.asset==='hay-bale'){if(!repeated.has(spec.asset))repeated.set(spec.asset,[]);repeated.get(spec.asset).push(spec);}else {const o=await model(spec.asset,farmRoot,spec.position,spec.scale||1,spec.rotationY||0);o.name=spec.asset;}}
  for(const [id,placements]of repeated)await instances(id,farmRoot,placements);
  await instances('farm-fence',farmRoot,layout.fence);
  for(const spec of layout.boars){const o=await model(spec.asset,farmRoot,spec.position,spec.scale||1,spec.rotationY||0,{animate:true,clip:'trot'});moving.push({o,base:o.position.y,phase:moving.length*.7,kind:'boar'});}
  for(const spec of layout.guards){const o=await model(spec.asset,farmRoot,spec.position,spec.scale||1,spec.rotationY||0,{animate:true});guardPairs.push(o);}
  const placements=Array.from({length:18},(_,i)=>({position:[Math.cos(i*.35)*6.2,.23,Math.sin(i*.35)*4.8-1.3],rotationY:-i*.35,scale:.72+(i%3)*.06}));
  const crowd=await instances('guard-crowd',farmRoot,placements);crowd.name='crowd';
  const lanternMaterial=mat('#FFF0C2',{emissive:'#F6C77D',emissiveIntensity:1.6});
  for(const [x,z]of [[-1.3,3.4],[1.3,3.4],[3.7,2.1],[-3.5,-2.4]]){
    const lamp=new T.Mesh(new T.SphereGeometry(.11,12,8),lanternMaterial);lamp.position.set(x,1.6,z);farmRoot.add(lamp);
    const light=new T.PointLight('#F4BC6C',0,5,2);light.position.copy(lamp.position);farmRoot.add(light);light.userData.nightLight=true;
  }
  for(const [p,s]of [[[11,9,-7],2.0],[[-10,7,-5],1.8],[[3,10,-12],2.6]])await model('island-cloud',farmRoot,p,s,0);
}

function lighting(){
  document.body.classList.toggle('night',state.night);
  const space=state.scene==='space';
  skyUniforms.top.value.set(state.night?(space?'#18213D':'#243A58'):(space?'#467486':'#79B6CB'));
  skyUniforms.bottom.value.set(state.night?(space?'#464863':'#8E9A9C'):(space?'#ADCDD0':'#E4E9D5'));
  hemi.intensity=state.night?1.25:2.2;hemi.color.set(state.night?'#B7C7E6':'#DCEADF');sun.intensity=state.night?1.25:3.0;sun.color.set(state.night?'#BBCDE9':'#FFF0CF');rim.intensity=state.night?1.2:1.3;
  waterUniforms.night.value=state.night?1:0;stars.material.opacity=state.night?.9:.43;
  farmRoot.traverse(o=>{if(o.userData.nightLight)o.intensity=state.night?2.8:0;});
  $('day').setAttribute('aria-pressed',!state.night);$('night').setAttribute('aria-pressed',state.night);
  $('scene-chip').querySelector('span').textContent=state.night?'משמרת לילה':'משמרת יום';
}
function updateScene(){
  const farm=state.scene==='farm',inspecting=!!state.selected;
  document.body.dataset.scene=state.scene;document.body.dataset.inspect=String(inspecting);
  farmRoot.visible=farm&&!inspecting;spaceRoot.visible=!farm&&!inspecting;inspectRoot.visible=inspecting;
  $('scene-title').textContent=inspecting?catalog.find(a=>a.id===state.selected)?.name:(farm?'שקט בין הדקלים':'שומרים על האופק');
  $('eyebrow').textContent=inspecting?'קטלוג / מבט מקרוב':(farm?'סביבה 02 / החיים על הקרקע':'סביבה 01 / הגנה מהאוויר');
  $('scene-subtitle').textContent=inspecting?catalog.find(a=>a.id===state.selected)?.description:(farm?'שלושה חזירי בר. צוות אחד. אי שלם.':'חמש ספינות, בוס אחד ומטוס מגן.');
  $('caption-title').textContent=inspecting?'נכס מתוך חבילת הגנת האי':(farm?'החווה נשארת בטוחה':'צי בגווני האי');
  $('caption-copy').textContent=inspecting?'גררו כדי לבדוק את הצללית והפרטים.':(farm?'גדר, פעמון ומישהו שתמיד שומר.':'צלליות שונות, אותה שפה.');
  $('effect-label').textContent=farm&&!inspecting?'פעמון':'גל הלם';
  document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.scene===state.scene));
  $('far').setAttribute('aria-pressed',!state.close);$('close').setAttribute('aria-pressed',state.close);
  $('play').setAttribute('aria-pressed',state.playing);$('play').setAttribute('aria-label',state.playing?'עצירת התנועה':'הפעלת התנועה');$('play-icon').textContent=state.playing?'Ⅱ':'▷';
  lighting();positionCamera();
}
function positionCamera(){
  const aspect=camera.aspect,portrait=aspect<1;
  let base,look;
  if(state.selected){base=portrait?[3.4,2.3,4.4]:[2.6,1.9,3.6];look=[0,.1,0];}
  else if(state.scene==='farm'){
    if(state.close){base=portrait?[11.8,10,15.5]:[7.2,6.2,9.3];look=[-.7,.5,.3];}
    else{base=portrait?[22,28,34]:[10.2,11.8,15.3];look=[0,.5,0];}
  }else{
    if(state.close){base=portrait?[5.5,10.4,16.5]:[4.9,8.5,14.2];look=[0,1,.2];}
    else{base=portrait?[8,15,25]:[5.4,10.2,16.5];look=[0,1,-.2];}
  }
  const offset=new T.Vector3(...base).sub(new T.Vector3(...look));
  offset.applyAxisAngle(new T.Vector3(0,1,0),state.yaw);offset.y+=state.pitch*offset.length()*.5;offset.multiplyScalar(state.zoom);
  target.fromArray(look);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld(true);
}
function resize(){
  const rect=stage.getBoundingClientRect();if(!renderer||!rect.width||!rect.height)return;
  renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();positionCamera();
  skyUniforms.resolution.value.set(rect.width*renderer.getPixelRatio(),rect.height*renderer.getPixelRatio());
}
new ResizeObserver(resize).observe(stage);

async function inspect(id){
  state.selected=id;while(inspectRoot.children.length)inspectRoot.remove(inspectRoot.children[0]);
  inspectMixer=null;
  const gltf=await load(id),o=copy(gltf);o.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(o),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),scale=2.4/Math.max(size.x,size.y,size.z);
  o.position.copy(center).multiplyScalar(-1);const holder=new T.Group();holder.add(o);holder.scale.setScalar(scale);inspectRoot.add(holder);
  if(gltf.animations.length){inspectMixer=new T.AnimationMixer(o);inspectMixer.clipAction(gltf.animations.find(c=>c.name==='idle')||gltf.animations[0]).play();inspectMixer.setTime(.27);}
  state.yaw=0;state.pitch=0;state.zoom=1;updateScene();$('library').close();
}
function setScene(value){state.scene=value;state.selected=null;state.yaw=0;state.pitch=0;state.zoom=1;effects?.reset();updateScene();}
for(const def of catalog){
  const b=document.createElement('button');b.className='asset-card';b.dataset.asset=def.id;b.style.setProperty('--swatch',def.color);b.setAttribute('aria-pressed','false');
  const sw=document.createElement('span');sw.className='swatch';const strong=document.createElement('strong');strong.textContent=def.name;const small=document.createElement('small');small.textContent=def.family;
  b.append(sw,strong,small);b.onclick=()=>inspect(def.id);$('asset-grid').append(b);
}
$('library-open').onclick=()=>{$('library').showModal();};$('library-close').onclick=()=>$('library').close();
$('return-scene').onclick=()=>{state.selected=null;updateScene();$('library').close();};
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>setScene(b.dataset.scene));
$('day').onclick=()=>{state.night=false;lighting();};$('night').onclick=()=>{state.night=true;lighting();};
$('far').onclick=()=>{state.close=false;state.zoom=1;updateScene();};$('close').onclick=()=>{state.close=true;state.zoom=1;updateScene();};
$('play').onclick=()=>{state.playing=!state.playing;updateScene();};$('effect').onclick=effect;
$('reset').onclick=()=>{state.yaw=0;state.pitch=0;state.zoom=1;positionCamera();toast('המבט אופס');};
$('metrics-toggle').onclick=()=>{const open=$('metrics').hidden;$('metrics').hidden=!open;$('metrics-toggle').setAttribute('aria-expanded',open);};
$('quality').onchange=e=>{state.quality=e.target.value;};
const pointers=new Map();let previousPinch=0;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointers.size===1){state.yaw-=(e.clientX-prev[0])*.008;state.pitch=T.MathUtils.clamp(state.pitch+(e.clientY-prev[1])*.006,-.5,.7);}
  else{const a=[...pointers.values()],dist=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(previousPinch)state.zoom=T.MathUtils.clamp(state.zoom*previousPinch/dist,.5,1.7);previousPinch=dist;}
  positionCamera();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);previousPinch=0;});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=T.MathUtils.clamp(state.zoom*Math.exp(e.deltaY*.001),.5,1.7);positionCamera();},{passive:false});
canvas.addEventListener('keydown',e=>{const handlers={ArrowLeft:()=>state.yaw-=.15,ArrowRight:()=>state.yaw+=.15,'+':()=>state.zoom=Math.max(.5,state.zoom*.9),'-':()=>state.zoom=Math.min(1.7,state.zoom*1.1),'0':()=>{state.yaw=0;state.zoom=1;state.pitch=0;}};if(handlers[e.key]){e.preventDefault();handlers[e.key]();positionCamera();}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();state.playing=false;toast('התצוגה נעצרה. רענון הדף יחזיר את האי.');});
let last=performance.now(),lastStats=0;
function render(now){
  requestAnimationFrame(render);if(!renderer||!state.ready||document.hidden)return;
  const rawElapsed=(now-last)/1000,elapsed=Math.min(rawElapsed,.08);last=now;const dt=state.playing?elapsed:0;
  state.time+=dt;state.frame++;
  waterUniforms.time.value=state.time;
  for(const m of moving)if(m.kind==='ship')m.o.position.y=m.base+Math.sin(state.time*.8+m.phase)*.09;
  if(state.playing){for(const {mixer,root}of mixers)if(root.parent?.visible)mixer.update(dt);inspectMixer?.update(dt);}
  updateFX(dt);
  for(const lod of lods){lod.autoUpdate=state.quality==='auto';if(!lod.autoUpdate){const high=state.quality==='high';lod.levels.forEach((l,i)=>l.object.visible=high?i===0:i===1);}}
  renderer.render(scene,camera);
  state.samples.push(rawElapsed*1000);if(state.samples.length>180)state.samples.shift();
  if(now-lastStats>500){lastStats=now;const avg=state.samples.reduce((a,b)=>a+b,0)/state.samples.length;
    $('stats').textContent=`${Math.round(1000/avg)} fps · ${(avg).toFixed(1)} ms\n${renderer.info.render.triangles.toLocaleString('en-US')} triangles\n${renderer.info.render.calls} draw calls\nDPR ${renderer.getPixelRatio()} · Three r${T.REVISION}\n${[...scene.children].filter(o=>o.visible).length} scene roots`;
  }
}
globalThis.defense={state,catalog,renderer,scene,camera,
  configure(options={}){Object.assign(state,options);if(options.time!==undefined){for(const {mixer}of mixers)mixer.setTime(options.time);inspectMixer?.setTime(options.time);}updateScene();resize();return this.snapshot();},
  inspect,setScene,effect,
  snapshot(){return {scene:state.scene,selected:state.selected,night:state.night,close:state.close,quality:state.quality,time:state.time,frame:state.frame,ready:state.ready,errors:[...state.errors],revision:T.REVISION,triangles:renderer?.info.render.triangles,calls:renderer?.info.render.calls,dpr:renderer?.getPixelRatio(),geometries:renderer?.info.memory.geometries,textures:renderer?.info.memory.textures,instancedMeshes:(()=>{let n=0;scene.traverse(o=>{if(o.isInstancedMesh)n++;});return n;})(),samples:state.samples.slice(-120)};},
  renderFrame(){positionCamera();renderer.render(scene,camera);return this.snapshot();},
  effectFrame(seconds=.3){effect();effects?.setAge(seconds);updateFX(0);renderer.render(scene,camera);return this.snapshot();}
};
async function start(){
  try{
    const textureLoader=new T.TextureLoader();
    const atlasPath='textures/effects-atlas.png',atlas=await textureLoader.loadAsync(embedded?'data:image/png;base64,'+embedded[atlasPath]:atlasPath);atlas.colorSpace=T.SRGBColorSpace;
    effects=new DefenseEffects(scene,atlas);
    await Promise.all([buildSpace(),buildFarm()]);
    state.ready=true;updateScene();resize();$('loading').hidden=true;
    requestAnimationFrame(render);
  }catch(error){fail(error);}
}
if(renderer)start();

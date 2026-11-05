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
  quality:'auto',detailMode:'auto',shadowMode:'dynamic',materialMode:'pbr',selected:null,ready:false,time:0,frame:0,yaw:0,pitch:0,zoom:1,fxTime:0,errors:[],samples:[],lod:{high:0,low:0}};
if(params.has('still'))state.playing=false;
const assets=new Map(),mixers=[],moving=[],lods=[],guardPairs=[];
let needsRender=true,adaptiveCounter=0;
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
const matteMaterials=new WeakMap(),pbrMaterials=new WeakMap();
function applyMaterialMode(root){
  root.traverse(o=>{if(!o.isMesh)return;const convert=material=>{
    if(state.materialMode==='matte'&&material.isMeshStandardMaterial){
      let converted=matteMaterials.get(material);
      if(!converted){converted=new T.MeshLambertMaterial({color:material.color,map:material.map,vertexColors:material.vertexColors,emissive:material.emissive,emissiveMap:material.emissiveMap,emissiveIntensity:material.emissiveIntensity,side:material.side,transparent:material.transparent,opacity:material.opacity,alphaTest:material.alphaTest,depthWrite:material.depthWrite,flatShading:material.flatShading});matteMaterials.set(material,converted);pbrMaterials.set(converted,material);}
      return converted;
    }
    return state.materialMode==='pbr'&&pbrMaterials.has(material)?pbrMaterials.get(material):material;
  };o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
}
function setMaterialMode(mode){
  state.materialMode=mode;applyMaterialMode(scene);for(const promise of assets.values())promise.then(g=>applyMaterialMode(g.scene));document.body.classList.toggle('economy',mode==='matte');lighting();needsRender=true;
}
function decode(base64){const s=atob(base64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
async function data(path){if(embedded){const d=embedded[path];if(!d)throw Error('Missing embedded '+path);return JSON.parse(new TextDecoder().decode(decode(d)));}const r=await fetch(path);if(!r.ok)throw Error(path+' '+r.status);return r.json();}
async function load(id){
  if(assets.has(id))return assets.get(id);
  const promise=(async()=>{
    const path='models/'+id+'.glb';
    const gltf=embedded?await loader.parseAsync(decode(embedded[path]).buffer,''):await loader.loadAsync(path);
    if(/-lod\d$/.test(id)){
      const original=await load(id.replace(/-lod\d$/,''));let sharedMap=null;
      original.scene.traverse(o=>{if(o.isMesh&&o.material.map)sharedMap=o.material.map;});
      if(sharedMap)gltf.scene.traverse(o=>{if(o.isMesh&&o.material.map&&o.material.map!==sharedMap){const old=o.material.map;o.material.map=sharedMap;old.dispose();old.image?.close?.();}});
    }
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;}});
    applyMaterialMode(gltf.scene);
    return gltf;
  })();assets.set(id,promise);return promise;
}
function copy(gltf){return gltf.scene.getObjectByProperty('isSkinnedMesh',true)?skeletonClone(gltf.scene):gltf.scene.clone(true);}
async function model(id,parent,position=[0,0,0],scale=1,yaw=0,{animate=false,clip='idle',lod=true}={}){
  const gltf=await load(id),obj=copy(gltf),wrapper=new T.Group();wrapper.position.fromArray(position);wrapper.scale.setScalar(scale);wrapper.rotation.y=yaw;
  wrapper.userData={assetId:id};let low=null,lowGLTF=null;
  if(lod&&lodIds.has(id)){
    const levels=new T.LOD();levels.userData.assetId=id;lowGLTF=await load(id+'-lod1');low=copy(lowGLTF);levels.addLevel(obj,0);levels.addLevel(low,id.startsWith('alien')?13:id.startsWith('guard-')?8:17);
    if(['guard-ranger','guard-lookout','guard-keeper'].includes(id)||id.startsWith('boar-'))levels.addLevel(copy(await load(id+'-lod2')),25);
    wrapper.add(levels);lods.push(levels);
  }else wrapper.add(obj);
  parent.add(wrapper);
  if(animate&&gltf.animations.length){
    const mixer=new T.AnimationMixer(obj),animation=gltf.animations.find(a=>a.name===clip)||gltf.animations[0],action=mixer.clipAction(animation),phase=[...id].reduce((s,c)=>s+c.charCodeAt(0),0)%1000/1000;action.play();mixers.push({mixer,root:wrapper,object:obj,id,action,phase,alertStarted:null});
    // Deterministic phase offsets prevent a synchronized toy parade.
    mixer.setTime(phase);
    if(low&&lowGLTF.animations.length){const lowMixer=new T.AnimationMixer(low),lowClip=lowGLTF.animations.find(a=>a.name===clip)||lowGLTF.animations[0],lowAction=lowMixer.clipAction(lowClip);lowAction.play();mixers.push({mixer:lowMixer,root:wrapper,object:low,id:id+'-lod1',action:lowAction,phase,alertStarted:null});lowMixer.setTime(phase);}
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
const waterUniforms={time:{value:0},night:{value:0},waves:{value:null}};
const sea=new T.Mesh(new T.PlaneGeometry(180,180,1,1).rotateX(-Math.PI/2),new T.ShaderMaterial({uniforms:waterUniforms,
  vertexShader:'varying vec3 p;void main(){p=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}',
  fragmentShader:`varying vec3 p;uniform float time,night;uniform sampler2D waves;void main(){vec2 phase=(vec2(p.x*2.7+p.z*1.4,p.z*3.2)+time*vec2(.7,-.6))*.159154943;float highlight=texture2D(waves,phase).r;float shallow=1.-smoothstep(6.,14.,length(p.xz));vec3 c=mix(vec3(.14,.48,.55),vec3(.31,.70,.67),shallow);c+=highlight*.13;c=mix(c,c*vec3(.07,.12,.22),night);gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}`
}));sea.position.y=-.14;sea.receiveShadow=true;farmRoot.add(sea);
let bakedShadow=null;
const contactRoot=new T.Group();contactRoot.name='Baked contact shadows';farmRoot.add(contactRoot);
function contactShadows(placements){
  if(bakedShadow){
    const material=new T.MeshBasicMaterial({map:bakedShadow,transparent:true,alphaTest:.005,depthWrite:false,toneMapped:false,opacity:.58});material.userData.nightShadow=true;
    const plane=new T.Mesh(new T.PlaneGeometry(18.6,18.6).rotateX(-Math.PI/2),material);plane.position.y=.268;contactRoot.add(plane);return;
  }
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),gradient=x.createRadialGradient(32,32,2,32,32,31);gradient.addColorStop(0,'rgba(19,47,45,.35)');gradient.addColorStop(.6,'rgba(19,47,45,.18)');gradient.addColorStop(1,'rgba(19,47,45,0)');x.fillStyle=gradient;x.fillRect(0,0,64,64);
  const texture=new T.CanvasTexture(c),material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  const mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),material,placements.length),o=new T.Object3D();
  placements.forEach((p,i)=>{o.position.set(p.x,.268,p.z);o.scale.set(p.w,1,p.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});contactRoot.add(mesh);
}

function addStars(){
  const n=220,positions=[],sizes=[];let seed=761;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<n;i++){positions.push((rnd()-.5)*65,rnd()*28-10,(rnd()-.5)*38-18);sizes.push(.5+rnd());}
  const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
  const points=new T.Points(geo,new T.PointsMaterial({color:'#FFF0CC',size:.13,transparent:true,opacity:.76,sizeAttenuation:true,depthWrite:false}));spaceRoot.add(points);return points;
}
const stars=addStars();

let effects,alarmAge=99,inspectMixer=null,inspectBounds=null,inspectSerial=0;
function effect(){
  if(!state.ready)return;
  needsRender=true;
  if(state.selected){effects.burst();effects.aimLaser(0,[-.3,0,3],[0,0,0]);effects.aimLaser(1,[.3,0,3],[0,0,0]);toast('פיצוץ · לייזר · גל הלם');return;}
  if(state.scene==='farm'){alarmAge=0;toast('פעמון התרעה · הצוות מגיב');
    for(const item of mixers.filter(m=>m.id.startsWith('guard-'))){const gltfPromise=assets.get(item.id);gltfPromise.then(g=>{const clip=g.animations.find(a=>a.name==='alert');if(clip){item.alertStarted=state.time;item.mixer.stopAllAction();const a=item.mixer.clipAction(clip).setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.reset().play();item.mixer.setTime(0);}});}
  }else{
    const enemy=spaceRoot.getObjectByName('alien-harvester')?.getObjectByName('anchor_hit'),impact=enemy?enemy.getWorldPosition(new T.Vector3()).toArray():[0,1.7,-.6];effects.burst({position:impact});effects.root.updateMatrixWorld(true);
    const plane=spaceRoot.getObjectByName('defender-plane');
    for(const [i,name]of ['anchor_fire_left','anchor_fire_right'].entries()){
      const emitter=plane?.getObjectByName(name),from=emitter?effects.root.worldToLocal(emitter.getWorldPosition(new T.Vector3())).toArray():[i?.3:-.3,-.5,3.7];effects.aimLaser(i,from,[0,0,0]);
    }
    toast('פיצוץ · לייזר · גל הלם');
  }
}
function updateFX(dt){
  alarmAge+=dt;effects?.update(dt,camera);
  const bell=farmRoot.getObjectByName('alarm-bell');
  if(bell)bell.traverse(b=>{if(b.name==='bell')b.rotation.z=alarmAge<2?Math.sin(alarmAge*17)*.23*Math.exp(-alarmAge):0;});
  if(alarmAge>=2.4&&alarmAge-dt<2.4)for(const m of mixers.filter(m=>m.id.startsWith('guard-'))){m.alertStarted=null;m.mixer.stopAllAction();m.action.reset().play();m.mixer.setTime(state.time+m.phase);}
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
  const lampPositions=[[-1.3,3.4],[1.3,3.4],[3.7,2.1],[-3.5,-2.4]],lamps=new T.InstancedMesh(new T.SphereGeometry(.11,12,8),lanternMaterial,4),lampMatrix=new T.Matrix4();
  for(const [lampIndex,[x,z]]of lampPositions.entries()){
    lampMatrix.makeTranslation(x,1.6,z);lamps.setMatrixAt(lampIndex,lampMatrix);
    if(lampIndex===0||lampIndex===2){const light=new T.PointLight('#F4BC6C',0,5,2);light.position.set(x,1.6,z);farmRoot.add(light);light.userData.nightLight=true;}
  }
  lamps.name='farm-lanterns';lamps.computeBoundingSphere();farmRoot.add(lamps);
  contactShadows([...layout.boars.map(p=>({x:p.position[0],z:p.position[2],w:1.1*p.scale,d:1.6*p.scale})),...layout.guards.map(p=>({x:p.position[0],z:p.position[2],w:.7,d:.5})),{x:-3.5,z:-2.4,w:3.7,d:2.8},{x:3.7,z:1.9,w:2.2,d:2.2}]);
  await instances('island-cloud',farmRoot,[{position:[11,9,-7],scale:2},{position:[-10,7,-5],scale:1.8},{position:[3,10,-12],scale:2.6}]);
}

function lighting(){
  needsRender=true;
  document.body.classList.toggle('night',state.night);
  const space=state.scene==='space';
  skyUniforms.top.value.set(state.night?(space?'#18213D':'#243A58'):(space?'#467486':'#79B6CB'));
  skyUniforms.bottom.value.set(state.night?(space?'#464863':'#8E9A9C'):(space?'#ADCDD0':'#E4E9D5'));
  hemi.intensity=state.night?1.25:2.2;hemi.color.set(state.night?'#B7C7E6':'#DCEADF');sun.intensity=state.night?1.25:3.0;sun.color.set(state.night?'#BBCDE9':'#FFF0CF');rim.intensity=state.night?1.2:1.3;
  waterUniforms.night.value=state.night?1:0;stars.material.opacity=state.night?.9:.43;
  farmRoot.traverse(o=>{if(o.userData.nightLight){o.intensity=state.night?2.8:0;o.visible=state.night&&state.materialMode==='pbr';}});
  contactRoot.traverse(o=>{if(o.material?.userData.nightShadow)o.material.opacity=state.night?.42:.58;});
  $('day').setAttribute('aria-pressed',!state.night);$('night').setAttribute('aria-pressed',state.night);
  $('scene-chip').querySelector('span').textContent=state.night?'משמרת לילה':'משמרת יום';
}
function updateScene(){
  const farm=state.scene==='farm',inspecting=!!state.selected;
  document.body.dataset.scene=state.scene;document.body.dataset.inspect=String(inspecting);
  farmRoot.visible=farm&&!inspecting;spaceRoot.visible=!farm&&!inspecting;inspectRoot.visible=inspecting;
  renderer.shadowMap.enabled=farm&&!inspecting&&state.shadowMode==='dynamic';contactRoot.visible=!renderer.shadowMap.enabled;
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
  if(state.selected){base=(portrait?[3.4,2.3,4.4]:[2.6,1.9,3.6]).map(v=>v*.90);look=[0,.1,0];}
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
  if(state.selected&&inspectBounds&&state.zoom>=1){
    const points=[];for(const x of [inspectBounds.min.x,inspectBounds.max.x])for(const y of [inspectBounds.min.y,inspectBounds.max.y])for(const z of [inspectBounds.min.z,inspectBounds.max.z])points.push(new T.Vector3(x,y,z).project(camera));
    const extent=Math.max(...points.map(p=>Math.max(Math.abs(p.x)/.84,Math.abs(p.y)/(portrait?.68:.82))));
    if(extent>1){camera.position.copy(target).add(offset.multiplyScalar(extent*1.04));camera.lookAt(target);camera.updateMatrixWorld(true);}
  }
  if(state.selected&&!state.close){camera.position.copy(target).add(offset.multiplyScalar(1.32));camera.lookAt(target);camera.updateMatrixWorld(true);}
  needsRender=true;
}
function resize(){
  const rect=stage.getBoundingClientRect();if(!renderer||!rect.width||!rect.height)return;
  renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();positionCamera();
  skyUniforms.resolution.value.set(rect.width*renderer.getPixelRatio(),rect.height*renderer.getPixelRatio());
}
new ResizeObserver(resize).observe(stage);

function clearInspection(){
  if(inspectMixer){inspectMixer.stopAllAction();inspectMixer.uncacheRoot(inspectMixer.getRoot());}
  const skeletons=new Set();inspectRoot.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
  for(const skeleton of skeletons)skeleton.dispose();
  inspectRoot.clear();inspectMixer=null;inspectBounds=null;
}
async function inspect(id){
  const request=++inspectSerial;state.selected=id;clearInspection();
  const gltf=await load(id);if(request!==inspectSerial)return;
  const o=copy(gltf);o.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(o),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),scale=2.4/Math.max(size.x,size.y,size.z);
  o.position.copy(center).multiplyScalar(-1);const holder=new T.Group();holder.add(o);holder.scale.setScalar(scale);inspectRoot.add(holder);
  if(gltf.animations.length){inspectMixer=new T.AnimationMixer(o);inspectMixer.clipAction(gltf.animations.find(c=>c.name==='idle')||gltf.animations[0]).play();inspectMixer.setTime(.27);}
  inspectRoot.updateMatrixWorld(true);inspectBounds=new T.Box3().setFromObject(inspectRoot,true);
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));state.samples=[];adaptiveCounter=0;
  state.yaw=0;state.pitch=0;state.zoom=1;state.close=true;updateScene();$('library').close();
  document.querySelectorAll('[data-asset]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.asset===id));
}
function setScene(value){inspectSerial++;clearInspection();state.scene=value;state.selected=null;state.yaw=0;state.pitch=0;state.zoom=1;effects?.reset();updateScene();}
for(const def of catalog){
  const b=document.createElement('button');b.className='asset-card';b.dataset.asset=def.id;b.style.setProperty('--swatch',def.color);b.setAttribute('aria-pressed','false');
  const sw=document.createElement('span');sw.className='swatch';const strong=document.createElement('strong');strong.textContent=def.name;const small=document.createElement('small');small.textContent=def.family;
  b.append(sw,strong,small);b.onclick=()=>inspect(def.id).catch(fail);$('asset-grid').append(b);
}
$('library-open').onclick=()=>{$('library').showModal();};$('library-close').onclick=()=>$('library').close();
$('return-scene').onclick=()=>{inspectSerial++;clearInspection();state.selected=null;updateScene();$('library').close();};
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>setScene(b.dataset.scene));
$('day').onclick=()=>{state.night=false;lighting();};$('night').onclick=()=>{state.night=true;lighting();};
$('far').onclick=()=>{state.close=false;state.zoom=1;updateScene();};$('close').onclick=()=>{state.close=true;state.zoom=1;updateScene();};
$('play').onclick=()=>{state.playing=!state.playing;if(!state.playing)renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));updateScene();resize();};$('effect').onclick=effect;
$('reset').onclick=()=>{state.yaw=0;state.pitch=0;state.zoom=1;positionCamera();toast('המבט אופס');};
$('metrics-toggle').onclick=()=>{const open=$('metrics').hidden;$('metrics').hidden=!open;$('metrics-toggle').setAttribute('aria-expanded',open);};
$('quality').onchange=e=>{state.quality=e.target.value;state.detailMode='auto';if(state.quality==='high'){renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));state.shadowMode='dynamic';setMaterialMode('pbr');}if(state.quality==='low'){state.shadowMode='contact';setMaterialMode('matte');}updateScene();resize();};
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
let resumeAfterRestore=false;
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();resumeAfterRestore=state.playing;state.playing=false;toast('התצוגה נעצרה לרגע. משחזר את האי…');});
canvas.addEventListener('webglcontextrestored',()=>{state.playing=resumeAfterRestore;updateScene();toast('האי חזר. אפשר להמשיך.');});
let last=performance.now(),lastStats=0,nextRenderAt=0;
function updateLOD(){
  const quality=state.quality==='auto'&&state.detailMode==='low'?'low':state.quality;
  for(const lod of lods){
    if(alarmAge<2.4&&lod.userData.assetId==='guard-ranger'&&quality!=='high'){lod.autoUpdate=false;lod.levels.forEach((l,i)=>l.object.visible=i===1);continue;}
    lod.autoUpdate=quality==='auto';
    if(lod.autoUpdate&&lod.levels.length===3){
      lod.autoUpdate=false;
      const height=(lod.userData.assetId.startsWith('boar-')?1.23:1.36)*lod.getWorldScale(new T.Vector3()).y;
      const distance=camera.position.distanceTo(lod.getWorldPosition(new T.Vector3())),pixels=height*stage.clientHeight/(distance*2*Math.tan(T.MathUtils.degToRad(camera.fov/2)));
      const level=alarmAge<2.4&&lod.userData.assetId==='guard-ranger'?1:pixels<80?2:pixels<160?1:0;lod.levels.forEach((l,i)=>l.object.visible=i===level);
    }else if(lod.autoUpdate){lod.update(camera);lod.autoUpdate=false;}
    else{const high=quality==='high';lod.levels.forEach((l,i)=>l.object.visible=high?i===0:i===lod.levels.length-1);}
  }
}
function updateVisibleMatrices(object){
  if(!object.visible)return;
  // Preserve SkinnedMesh's bind-matrix maintenance while skipping hidden trees.
  if(object.isSkinnedMesh){object.updateMatrixWorld(false);return;}
  object.updateWorldMatrix(false,false);
  for(const child of object.children)updateVisibleMatrices(child);
}
function drawScene(){
  if(renderer.getContext().isContextLost())return;
  updateLOD();for(const child of scene.children)updateVisibleMatrices(child);renderer.render(scene,camera);needsRender=false;
}
function render(now){
  requestAnimationFrame(render);if(!renderer||!state.ready||document.hidden||renderer.getContext().isContextLost())return;
  if(!state.playing&&!needsRender){last=now;nextRenderAt=now;return;}
  if(now<nextRenderAt-1)return;
  nextRenderAt=now-nextRenderAt>200?now+1000/30:nextRenderAt+1000/30;
  const rawElapsed=(now-last)/1000,elapsed=Math.min(rawElapsed,.08);last=now;const dt=state.playing?elapsed:0;
  state.time+=dt;state.frame++;
  waterUniforms.time.value=state.time;
  for(const m of moving)if(m.kind==='ship')m.o.position.y=m.base+Math.sin(state.time*.8+m.phase)*.09;
  updateLOD();
  if(state.playing){
    for(const m of mixers)if(m.root.parent?.visible&&m.object.visible)m.mixer.setTime(m.alertStarted!==null?state.time-m.alertStarted:state.time+m.phase);
    if(state.selected)inspectMixer?.update(dt);
  }
  updateFX(dt);
  drawScene();
  state.samples.push(rawElapsed*1000);if(state.samples.length>180)state.samples.shift();
  // Resolution adapts only during live playback. HTML text remains at native
  // resolution; explicit high/low geometry modes leave resolution untouched.
  // A 30-frame 75th percentile notices repeated long frames without reacting
  // to a single shader compilation or impact.
  if(state.playing&&state.quality==='auto'&&++adaptiveCounter>=10&&state.samples.length>=30){
    adaptiveCounter=0;const recent=state.samples.slice(-30).sort((a,b)=>a-b),slow=recent[23]>41,current=renderer.getPixelRatio();
    if(slow&&current>.75){renderer.setPixelRatio(Math.max(.75,Math.round((current-.25)*100)/100));resize();}
    else if(slow&&state.shadowMode==='dynamic'){state.shadowMode='contact';renderer.shadowMap.enabled=false;contactRoot.visible=true;needsRender=true;}
    else if(slow&&state.materialMode==='pbr')setMaterialMode('matte');
    else if(slow&&state.detailMode!=='low'){state.detailMode='low';needsRender=true;}
    else if(slow&&current>.5){renderer.setPixelRatio(.5);resize();}
  }
  if(now-lastStats>500){lastStats=now;const avg=state.samples.reduce((a,b)=>a+b,0)/state.samples.length;
    $('stats').textContent=`${Math.round(1000/avg)} fps · ${(avg).toFixed(1)} ms\n${renderer.info.render.triangles.toLocaleString('en-US')} triangles\n${renderer.info.render.calls} draw calls\nDPR ${renderer.getPixelRatio()} · Three r${T.REVISION}\n${state.materialMode} · ${state.shadowMode}`;
  }
}
globalThis.defense={state,catalog,renderer,scene,camera,
  configure(options={}){if(options.time===undefined&&Object.entries(options).every(([key,value])=>Object.is(state[key],value)))return this.snapshot();if(options.selected===null&&state.selected!==null){inspectSerial++;clearInspection();}Object.assign(state,options);if(options.time!==undefined){for(const {mixer}of mixers)mixer.setTime(options.time);inspectMixer?.setTime(options.time);}updateScene();resize();return this.snapshot();},
  inspect,setScene,effect,setMaterialMode,
  effectDebug(){
    const plane=spaceRoot.getObjectByName('defender-plane');effects?.root.updateMatrixWorld(true);
    return effects?effects.lasers.map((laser,i)=>({emitter:plane?.getObjectByName(i?'anchor_fire_right':'anchor_fire_left')?.getWorldPosition(new T.Vector3()).toArray(),laserFrom:new T.Vector3(0,-.5,0).applyMatrix4(laser.matrixWorld).toArray(),laserTo:new T.Vector3(0,.5,0).applyMatrix4(laser.matrixWorld).toArray()})):[];
  },
  effectSnapshot(){return effects?.snapshot();},
  framing(){
    if(!inspectBounds)return null;
    const projected=[];for(const x of [inspectBounds.min.x,inspectBounds.max.x])for(const y of [inspectBounds.min.y,inspectBounds.max.y])for(const z of [inspectBounds.min.z,inspectBounds.max.z])projected.push(new T.Vector3(x,y,z).project(camera).toArray());
    return {asset:state.selected,projectedCorners:projected,clipped:projected.some(p=>Math.abs(p[0])>1||Math.abs(p[1])>1||p[2]<-1||p[2]>1)};
  },
  snapshot(){return {scene:state.scene,selected:state.selected,night:state.night,close:state.close,quality:state.quality,detailMode:state.detailMode,shadowMode:state.shadowMode,materialMode:state.materialMode,time:state.time,frame:state.frame,ready:state.ready,errors:[...state.errors],revision:T.REVISION,triangles:renderer?.info.render.triangles,calls:renderer?.info.render.calls,dpr:renderer?.getPixelRatio(),geometries:renderer?.info.memory.geometries,textures:renderer?.info.memory.textures,instancedMeshes:(()=>{let n=0;scene.traverse(o=>{if(o.isInstancedMesh)n++;});return n;})(),samples:state.samples.slice(-120)};},
  renderFrame(){positionCamera();drawScene();return this.snapshot();},
  effectFrame(seconds=.3){effect();effects?.setAge(seconds);updateFX(0);drawScene();return this.snapshot();}
};
async function start(){
  try{
    const textureLoader=new T.TextureLoader();
    const atlasPath='textures/effects-atlas.png',shadowPath='textures/farm-shadow.png',waterPath='textures/water-wave.png';
    const [atlas,shadow,waves]=await Promise.all([textureLoader.loadAsync(embedded?'data:image/png;base64,'+embedded[atlasPath]:atlasPath),textureLoader.loadAsync(embedded?'data:image/png;base64,'+embedded[shadowPath]:shadowPath),textureLoader.loadAsync(embedded?'data:image/png;base64,'+embedded[waterPath]:waterPath)]);atlas.colorSpace=T.SRGBColorSpace;bakedShadow=shadow;
    waves.wrapS=waves.wrapT=T.RepeatWrapping;waterUniforms.waves.value=waves;
    effects=new DefenseEffects(scene,atlas);
    await Promise.all([buildSpace(),buildFarm()]);
    scene.updateMatrixWorld(true);scene.matrixWorldAutoUpdate=false;
    state.ready=true;updateScene();resize();$('loading').hidden=true;
    requestAnimationFrame(render);
  }catch(error){fail(error);}
}
if(renderer)start();

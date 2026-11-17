/* Original local asset viewer. Character geometry and animation come only from GLB files. */
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from '../../vendor/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {ready:false,character:'mother',clip:'wave_help',all:false,environment:'balcony',playing:!reducedMotion,time:0,skeleton:false,errors:[]};
const swatches = {'boy':'#8cb9d4','girl':'#dba594','mother':'#d5a653','father':'#6f9f95','grandfather':'#a4aaa0','grandmother':'#bb96b6','baby-stroller':'#9bc7c2','panicked-man':'#abbdcf','captain':'#eee0b9','young-firefighter':'#edbd5d','female-firefighter':'#df7b66'};
let manifest,actors=[],skeletons=[],selectedAction=null,selectedDuration=1,selectionToken=0;
const sources=new Map(),loader=new GLTFLoader();
const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#1a303e');
scene.fog=new THREE.Fog('#1a303e',11,25);
const camera=new THREE.PerspectiveCamera(36,1,.05,80);
const orbit={yaw:.30,pitch:1.36,radius:3.75,target:new THREE.Vector3(0,.85,0)};
const followBaseTarget=new THREE.Vector3(),followOrigin=new THREE.Vector3();
const hero=new THREE.Group(),balcony=new THREE.Group(),outdoors=new THREE.Group(),backdrop=new THREE.Group();
scene.add(hero,balcony,outdoors,backdrop);
scene.add(new THREE.HemisphereLight('#bed8e9','#716558',2.1));
const key=new THREE.DirectionalLight('#ffe2bc',3.1);key.position.set(-3,6,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.camera.near=.1;key.shadow.camera.far=18;key.shadow.normalBias=.015;key.shadow.bias=-.0003;scene.add(key);
const fill=new THREE.DirectionalLight('#93c6e0',1.4);fill.position.set(4,3,-5);scene.add(fill);
const materials=new Map();
function material(color,roughness=.86,metalness=0){const k=`${color}/${roughness}/${metalness}`;if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({color,roughness,metalness}));return materials.get(k);}
function box(parent,size,pos,color,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color,opts.roughness,opts.metalness));m.position.set(...pos);m.castShadow=!!opts.cast;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,radius,height,pos,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,8),material(color));m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}

// Restrained architecture gives the assets the same scale and setting as the rescue game.
box(balcony,[8,.19,5],[0,-.105,-.65],'#b6ad98');
box(balcony,[8,.035,.25],[0,.003,1.70],'#d6c7aa');
box(balcony,[8,7,.26],[0,3.28,-2.02],'#63777d');
box(balcony,[8,.28,.62],[0,2.55,-1.92],'#91a09d');
box(balcony,[8,.24,.56],[0,5.10,-1.92],'#91a09d');
for(let floor=0;floor<3;floor++)for(let col=0;col<4;col++){
  const x=(col-1.5)*2.04,y=.98+floor*2.55;
  box(balcony,[1.19,1.67,.07],[x,y,-1.845],'#283e49');
  box(balcony,[1.05,1.48,.014],[x,y,-1.800],'#365568',{roughness:.27});
  box(balcony,[.035,1.5,.035],[x,y,-1.78],'#a8b8b7');
  box(balcony,[1.10,.035,.035],[x,y+.04,-1.78],'#a8b8b7');
  box(balcony,[1.40,.10,.30],[x,y-.88,-1.70],'#b8b8aa');
  if((col+floor)%3===0)box(balcony,[.77,.91,.02],[x-.10,y+.16,-1.77],'#d6b281');
}
for(const side of [-1,1]){
  for(let i=0;i<5;i++)box(balcony,[.035,.85,.035],[side*2.65,.44,.9-i*.6],'#a5aaa0');
  box(balcony,[.06,.06,2.5],[side*2.65,.88,-.3],'#c6c7b6');
  box(balcony,[.10,.16,2.6],[side*2.65,.085,-.3],'#8c9997');
}
box(outdoors,[20,.18,12],[0,-.10,0],'#9fa9a1');
box(outdoors,[20,.02,.36],[0,.003,1.65],'#dccda9');
box(outdoors,[20,.16,2],[0,-.16,3.4],'#405158');
for(let i=-4;i<5;i++)box(outdoors,[.85,.018,.12],[i*1.5,-.068,3.4],'#e4cf9a');
for(const side of [-1,1]){
  box(outdoors,[.80,.37,.75],[side*2.25,.17,-1.45],'#687d77');
  cylinder(outdoors,.24,.5,[side*2.25,.58,-1.45],'#638477');
  const top=new THREE.Mesh(new THREE.IcosahedronGeometry(.47,0),material('#769888'));top.position.set(side*2.25,1.05,-1.45);outdoors.add(top);
}
for(let i=0;i<12;i++){
  const x=(i-5.5)*1.5,height=2.8+(i*7%6)*.53,z=-8.1-(i%3)*.45;
  box(backdrop,[1.25,height,1.2],[x,height*.5-.2,z],i%2?'#233b48':'#2a4450');
  for(let y=.6;y<height-.2;y+=.64)for(let col=0;col<2;col++){
    box(backdrop,[.23,.28,.02],[x+(col-.5)*.48,y,z+.61],(i+col+Math.round(y*10))%4?'#54717b':'#a58c66');
  }
}
outdoors.visible=false;
const gradient=document.createElement('canvas');gradient.width=gradient.height=64;
const ctx=gradient.getContext('2d'),radial=ctx.createRadialGradient(32,32,0,32,32,32);radial.addColorStop(0,'#0717219f');radial.addColorStop(.45,'#0717215c');radial.addColorStop(1,'#07172100');ctx.fillStyle=radial;ctx.fillRect(0,0,64,64);
const contactTexture=new THREE.CanvasTexture(gradient);
function contactShadow(parent,size=1){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size*.72),new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,opacity:.75}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.006;parent.add(mesh);return mesh;}

function updateCamera(){const s=Math.sin(orbit.pitch);camera.position.set(orbit.target.x+orbit.radius*s*Math.sin(orbit.yaw),orbit.target.y+orbit.radius*Math.cos(orbit.pitch),orbit.target.z+orbit.radius*s*Math.cos(orbit.yaw));camera.lookAt(orbit.target);}
function resize(){const bounds=$('viewport').getBoundingClientRect();renderer.setSize(Math.max(1,bounds.width),Math.max(1,bounds.height),false);camera.aspect=bounds.width/Math.max(1,bounds.height);camera.updateProjectionMatrix();updateCamera();}
new ResizeObserver(resize).observe($('viewport'));
function getDefinition(id=state.character){return manifest?.characters.find(c=>c.id===id);}
function clipName(c){return typeof c==='string'?c:c.name||c.id;}
function clipDefinition(def,name){return (def.clips||[]).find(c=>clipName(c)===name);}
function labelForClip(def,name){const c=clipDefinition(def,name);return c?.label||name;}
function isFirefighter(def){return def.role==='firefighter'||['captain','young-firefighter','female-firefighter'].includes(def.id);}
function clearActors(){for(const actor of actors)actor.mixer.stopAllAction();actors=[];for(const helper of skeletons){scene.remove(helper);helper.geometry.dispose();helper.material.dispose();}skeletons=[];hero.clear();}
function addActor(def,clip,position=[0,0,0]){
  const source=sources.get(def.id),object=cloneSkeleton(source.scene),container=new THREE.Group();container.name='viewer-placement-'+def.id;container.position.set(...position);container.add(object);hero.add(container);
  object.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;}});
  const mixer=new THREE.AnimationMixer(object),animation=source.animations.find(c=>c.name===clip)||source.animations[0];
  const action=animation?mixer.clipAction(animation):null;
  if(action){action.play();action.clampWhenFinished=true;const c=clipDefinition(def,animation.name);if(c?.loop===false)action.setLoop(THREE.LoopOnce,1);}
  mixer.update(0);
  const entry={definition:def,object,container,mixer,action,clip:animation?.name||clip,duration:animation?.duration||1};
  actors.push(entry);const helper=new THREE.SkeletonHelper(object);helper.visible=state.skeleton;helper.material.depthTest=false;helper.renderOrder=20;scene.add(helper);skeletons.push(helper);
  entry.shadow=contactShadow(container,def.id==='baby-stroller'?1.0:.88);
  applyVisibility(entry);
  return entry;
}
function applyVisibility(actor){
  const clip=clipDefinition(actor.definition,actor.clip),visibility=clip?.visibility||clip?.props||{};
  actor.object.traverse(node=>{
    if(!node.isMesh)return;
    const category=node.userData.category||node.parent?.userData.category||'';
    if(category==='hose'||category==='extinguisher')node.visible=actor.clip===category;
    if(typeof visibility[category]==='boolean')node.visible=visibility[category];
  });
}
function resetCamera(){
  if(state.all){orbit.yaw=.15;orbit.pitch=1.05;orbit.radius=6.1;orbit.target.set(0,.75,-.2);}
  else{
    const actor=actors[0];actor?.object.updateMatrixWorld(true);
    const bounds=actor?new THREE.Box3().setFromObject(actor.object,true):new THREE.Box3(new THREE.Vector3(-.3,0,-.2),new THREE.Vector3(.3,1.7,.2));
    const size=bounds.getSize(new THREE.Vector3()),height=Math.max(1.25,size.y),center=bounds.getCenter(new THREE.Vector3());
    orbit.yaw=.28;orbit.pitch=1.37;orbit.radius=Math.max(2.55,height*2.13);orbit.target.set(center.x,Math.max(.58,center.y+.10),center.z);
    if(state.clip==='sit_floor')orbit.target.y-=height*.14;
    if(state.clip==='sit_floor'&&state.character==='baby-stroller'){orbit.radius=3.35;orbit.target.set(0,.40,.30);}
    if(state.clip==='carried_shoulder'||state.clip==='rescue_carry'){orbit.radius=4.7;orbit.target.set(0,.95,0);}
  }
  followBaseTarget.copy(orbit.target);followOrigin.set(0,0,0);actors[0]?.object.getObjectByName('Root')?.getWorldPosition(followOrigin);
  updateCamera();
}
function setEnvironment(environment){state.environment=environment;balcony.visible=environment==='balcony';outdoors.visible=!balcony.visible;for(const button of document.querySelectorAll('[data-environment]'))button.setAttribute('aria-pressed',String(button.dataset.environment===environment));$('scene-label').textContent=balcony.visible?'קומת החילוץ':'אזור בטוח';$('scene-detail').textContent=balcony.visible?'מרפסת · מבנה רב־קומות':'מחוץ לבניין · אחרי החילוץ';scene.background.set(balcony.visible?'#1a303e':'#2c454d');scene.fog.color.copy(scene.background);}
function updateLabels(){
  const def=getDefinition(),firefighter=isFirefighter(def);
  $('character-label').textContent=state.all?'כל אחד הוא עולם':def.label;
  $('role-label').textContent=state.all?'שמונה אנשים · שלושה אנשי צוות':firefighter?'צוות כיבוי וחילוץ':'אנשים להצלה';
  $('clip-label').textContent=state.all?'11 דמויות · תנועות עצמאיות':labelForClip(def,state.clip);
  const tris=state.all?manifest.characters.reduce((s,c)=>s+(c.triangles||0),0):def.triangles;
  $('triangle-count').textContent=tris?`${tris.toLocaleString('en')} △`:'GLB';
  $('character-count').textContent=`${String(manifest.characters.findIndex(c=>c.id===def.id)+1).padStart(2,'0')} / 11`;
  $('show-all').setAttribute('aria-pressed',String(state.all));
  for(const button of $('roster').querySelectorAll('button'))button.setAttribute('aria-pressed',String(!state.all&&button.dataset.id===state.character));
  $('clip').disabled=state.all;
}
function populateClips(){const def=getDefinition();$('clip').replaceChildren(...def.clips.map(c=>{const option=document.createElement('option');option.value=clipName(c);option.textContent=typeof c==='string'?c:c.label||c.name;return option;}));if(!def.clips.some(c=>clipName(c)===state.clip))state.clip=clipName(def.clips[0]);$('clip').value=state.clip;}
async function rebuild(){
  if(!manifest)return;
  const token=++selectionToken;clearActors();
  if(state.all){
    manifest.characters.forEach((def,i)=>{const row=i<6?0:1,col=row?i-6:i,count=row?5:6;const entry=addActor(def,isFirefighter(def)?'idle':'wave_help',[(col-(count-1)/2)*1.03,0,row?-1.15:.5]);entry.offset=i*.13;});
  }else{
    const def=getDefinition(),entry=addActor(def,state.clip);selectedAction=entry.action;selectedDuration=entry.duration;
    if(state.clip==='carried_shoulder'){
      const firefighter=manifest.characters.find(c=>c.id==='young-firefighter');if(firefighter)addActor(firefighter,'rescue_carry');
    }else if(state.clip==='rescue_carry'){
      const civilian=manifest.characters.find(c=>c.id==='boy');if(civilian)addActor(civilian,'carried_shoulder');
    }
  }
  if(token!==selectionToken)return;
  state.time=0;seek(0);updateLabels();resetCamera();
}
function seek(seconds){
  state.time=Math.max(0,seconds);
  for(const actor of actors){
    const def=clipDefinition(actor.definition,actor.clip),loop=def?.loop!==false,time=loop?state.time%actor.duration:Math.min(state.time,actor.duration);
    if(actor.action){actor.action.enabled=true;actor.action.paused=false;actor.action.time=time;actor.mixer.update(0);}
    actor.object.updateMatrixWorld(true);
    const root=actor.object.getObjectByName('Root');if(root&&actor.shadow){const position=root.getWorldPosition(new THREE.Vector3());actor.container.worldToLocal(position);actor.shadow.position.set(position.x,.006,position.z);}
  }
  if(!state.all&&state.clip==='walk_happy'&&actors[0]){const position=actors[0].object.getObjectByName('Root')?.getWorldPosition(new THREE.Vector3());if(position){orbit.target.copy(followBaseTarget).add(position).sub(followOrigin);updateCamera();}}
  $('timeline').value=String(Math.min(1,state.time/selectedDuration));
  $('time').value=`${Math.min(state.time,selectedDuration).toFixed(2)} / ${selectedDuration.toFixed(2)}`;
}
async function selectCharacter(id){if(!getDefinition(id))throw new Error('Unknown character '+id);state.character=id;state.all=false;populateClips();await rebuild();}
async function selectClip(name){if(!getDefinition().clips.some(c=>clipName(c)===name))throw new Error('Unknown clip '+name);state.clip=name;state.all=false;$('clip').value=name;if(name==='walk_happy')setEnvironment('outdoors');await rebuild();}
function setPlaying(playing){state.playing=playing;$('play').setAttribute('aria-pressed',String(playing));$('play').setAttribute('aria-label',playing?'השהיית תנועה':'הפעלת תנועה');$('play').firstElementChild.textContent=playing?'Ⅱ':'▶';}
$('clip').addEventListener('change',()=>selectClip($('clip').value));
$('show-all').addEventListener('click',async()=>{state.all=!state.all;await rebuild();});
$('play').addEventListener('click',()=>setPlaying(!state.playing));
$('timeline').addEventListener('input',()=>{setPlaying(false);seek(Number($('timeline').value)*selectedDuration);});
$('skeleton').addEventListener('click',()=>{state.skeleton=!state.skeleton;for(const helper of skeletons)helper.visible=state.skeleton;$('skeleton').setAttribute('aria-pressed',String(state.skeleton));});
$('home').addEventListener('click',resetCamera);
for(const button of document.querySelectorAll('[data-environment]'))button.addEventListener('click',()=>setEnvironment(button.dataset.environment));
let drag=null;
$('scene').addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};$('scene').setPointerCapture(event.pointerId);});
$('scene').addEventListener('pointermove',event=>{if(!drag)return;orbit.yaw-=(event.clientX-drag.x)*.008;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch-(event.clientY-drag.y)*.006,.48,1.69);drag={x:event.clientX,y:event.clientY};updateCamera();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(name,()=>{drag=null;});
$('scene').addEventListener('wheel',event=>{event.preventDefault();orbit.radius=THREE.MathUtils.clamp(orbit.radius*Math.exp(event.deltaY*.001),1.5,16);updateCamera();},{passive:false});
$('scene').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(event.key))event.preventDefault();if(event.key==='ArrowLeft')orbit.yaw+=.15;if(event.key==='ArrowRight')orbit.yaw-=.15;if(event.key==='ArrowUp')orbit.pitch=Math.max(.48,orbit.pitch-.1);if(event.key==='ArrowDown')orbit.pitch=Math.min(1.69,orbit.pitch+.1);if(event.key===' ')setPlaying(!state.playing);updateCamera();});
let previous=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.07,(now-previous)/1000);previous=now;if(state.ready&&state.playing){let time=state.time+dt;if(time>selectedDuration)time=0;seek(time);}renderer.render(scene,camera);}
requestAnimationFrame(frame);resize();setPlaying(state.playing);

window.FireRescuePreview={
  get ready(){return state.ready;},
  snapshot(){return { ...state,actorCount:actors.length,character:getDefinition()?.label,duration:selectedDuration,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,canvas:[$('scene').width,$('scene').height],camera:{position:camera.position.toArray(),target:orbit.target.toArray(),radius:orbit.radius,yaw:orbit.yaw,pitch:orbit.pitch},actors:actors.map(a=>({id:a.definition.id,clip:a.clip,time:a.action?.time}))};},
  setCharacter:selectCharacter,setClip:selectClip,setEnvironment,
  async setAll(all){state.all=all;await rebuild();},seek,setPlaying,
  frameBounds(){
    camera.updateMatrixWorld(true);
    return actors.map(actor=>{
      actor.object.updateMatrixWorld(true);const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity],v=new THREE.Vector3();
      actor.object.traverse(mesh=>{if(!mesh.isSkinnedMesh||!mesh.visible)return;const ids=mesh.geometry.index?new Set(mesh.geometry.index.array):Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i);for(const id of ids){mesh.getVertexPosition(id,v);v.applyMatrix4(mesh.matrixWorld).project(camera);for(let axis=0;axis<2;axis++){const n=axis?v.y:v.x;lo[axis]=Math.min(lo[axis],n);hi[axis]=Math.max(hi[axis],n);}}});
      return {id:actor.definition.id,min:lo,max:hi,inside:lo.every(n=>n>=-.99)&&hi.every(n=>n<=.99)};
    });
  },
};
try{
  const response=await fetch('manifest.json');if(!response.ok)throw new Error(`manifest: HTTP ${response.status}`);manifest=await response.json();
  if(!Array.isArray(manifest.characters)||manifest.characters.length!==11)throw new Error('Expected eleven character definitions');
  const order=['boy','girl','mother','father','grandfather','grandmother','baby-stroller','panicked-man','captain','young-firefighter','female-firefighter'];manifest.characters.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  for(const def of manifest.characters){
    const button=document.createElement('button');button.dataset.id=def.id;button.dataset.role=isFirefighter(def)?'firefighter':'civilian';button.setAttribute('aria-pressed','false');button.style.setProperty('--swatch',swatches[def.id]||'#9cb8c4');const dot=document.createElement('i');dot.className='avatar-dot';dot.setAttribute('aria-hidden','true');button.append(dot,document.createTextNode(def.label));button.addEventListener('click',()=>selectCharacter(def.id));$('roster').append(button);
  }
  let loaded=0;
  await Promise.all(manifest.characters.map(async def=>{const gltf=await loader.loadAsync(def.file||`models/${def.id}.glb`);sources.set(def.id,gltf);$('load-status').textContent=`${++loaded} מתוך 11 דמויות מוכנות`;}));
  const params=new URLSearchParams(location.search);if(params.has('character')&&getDefinition(params.get('character')))state.character=params.get('character');
  if(params.has('clip'))state.clip=params.get('clip');
  populateClips();await rebuild();if(params.get('all')==='1'){state.all=true;await rebuild();}if(params.get('environment')==='outdoors')setEnvironment('outdoors');
  state.ready=true;$('loading').hidden=true;
}catch(error){state.errors.push(String(error));$('error').textContent='הטעינה לא הושלמה. פתחו את התצוגה דרך שרת מקומי ובדקו שקובצי החבילה זמינים. '+error.message;$('error').hidden=false;$('loading').hidden=true;console.error(error);}

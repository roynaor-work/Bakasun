import * as T from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const clipLabels = {idle:'עמידה',walk:'הליכה',wave:'הנפה',sit:'ישיבה',talk:'שיחה',run:'ריצה',trot:'ריצה',flutter:'רפרוף',flap:'מעוף',fly:'מעוף',swim:'שחייה',flight:'מעוף',perch:'מנוחה'};
const state = {mode:'city',family:'people',selected:null,clip:'idle',playing:true,rotate:false,variant:0,errors:[],ready:false};
const actors = new Map(), cache = new Map(), loader = new GLTFLoader();
let records = [], humanRecords = [], animalRecords = [], selectedActor = null, frame = 0;
const canvas=$('scene'), stage=canvas.parentElement;
const renderer = new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setClearColor(0xe6eedb,0);
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(), camera=new T.OrthographicCamera(-5,5,3,-3,.1,100);
scene.add(new T.HemisphereLight(0xfffae7,0x8eaa7e,2.6));
const sun=new T.DirectionalLight(0xfff2ce,3.1);
sun.position.set(-3,8,5);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-7,right:7,top:6,bottom:-6,near:.5,far:20});
sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;
scene.add(sun);
const fill=new T.DirectionalLight(0xd9edff,.7);fill.position.set(5,3,-5);scene.add(fill);
const diorama=new T.Group(), population=new T.Group(), focusStage=new T.Group();
scene.add(diorama,population,focusStage);
const material=(color,roughness=1)=>new T.MeshStandardMaterial({color,roughness});
const mats={grass:material('#b7cc93'),edge:material('#ccd6b5'),pave:material('#e8ddbe'),tile:material('#d9cead'),trunk:material('#a98c64'),leaf:material('#6d9972'),leaf2:material('#8bab72'),wood:material('#bf8c53'),metal:material('#4c6a58'),water:material('#8fc4bc',.35),stone:material('#ebe7d4')};
function mesh(geometry,mat,parent,x=0,y=0,z=0){const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,w,h,d,mat,x,y,z){return mesh(new T.BoxGeometry(w,h,d),mat,parent,x,y,z);}
function cylinder(parent,r1,r2,h,mat,x,y,z,n=10){return mesh(new T.CylinderGeometry(r1,r2,h,n),mat,parent,x,y,z);}
function tree(x,z,s=1){const group=new T.Group();group.position.set(x,0,z);group.scale.setScalar(s);diorama.add(group);cylinder(group,.062,.085,1.25,mats.trunk,0,.625,0,7);mesh(new T.IcosahedronGeometry(.55,1),mats.leaf,group,.05,1.48,0).scale.set(.85,1.22,.85);mesh(new T.IcosahedronGeometry(.42,1),mats.leaf2,group,-.25,1.4,.07).scale.set(.9,1.15,.9);cylinder(group,.43,.46,.14,mats.edge,0,.02,0,12);}
function bench(x,z,angle=0){const group=new T.Group();group.position.set(x,0,z);group.rotation.y=angle;diorama.add(group);for(const t of [-.17,0,.17])box(group,1.1,.05,.12,mats.wood,0,.44,t);for(const y of [.69,.85])box(group,1.1,.105,.045,mats.wood,0,y,-.2);for(const x of [-.4,.4]){box(group,.04,.41,.34,mats.metal,x,.21,0);box(group,.04,.48,.04,mats.metal,x,.66,-.21);}return group;}
function planter(x,z){const group=new T.Group();group.position.set(x,0,z);diorama.add(group);box(group,.75,.25,.45,mats.edge,0,.125,0);for(let i=0;i<5;i++)mesh(new T.IcosahedronGeometry(.16,0),i%2?mats.leaf:mats.leaf2,group,(i-2)*.13,.34,.025*Math.sin(i));}
function buildDiorama(){
  cylinder(diorama,5.2,5.15,.16,mats.edge,0,-.14,0,64).scale.set(1,1,.64);
  cylinder(diorama,5.08,5.08,.10,mats.grass,0,-.04,0,64).scale.set(1,1,.64);
  box(diorama,7.9,.025,2.8,mats.pave,0,.015,.2);
  box(diorama,1.2,.026,5.3,mats.pave,-.3,.02,.1);
  for(let x=-3.8;x<4;x+=.55)box(diorama,.012,.003,2.8,mats.tile,x,.029,.2);
  for(let z=-1.2;z<1.7;z+=.47)box(diorama,7.9,.003,.009,mats.tile,0,.03,z);
  tree(-4,-1.5,.95);tree(3.9,-1.65,1.05);tree(-3.6,1.95,.72);tree(3.8,1.9,.68);
  bench(-2.35,-1.35);bench(2.5,-1.35);planter(-4,.1);planter(4,.1);
  cylinder(diorama,.65,.72,.15,mats.stone,.1,.09,-2.15,24);
  cylinder(diorama,.58,.58,.035,mats.water,.1,.18,-2.15,24);
  for(const x of [-3.2,3.25]){cylinder(diorama,.026,.035,1.65,mats.metal,x,.825,-2.15,6);mesh(new T.SphereGeometry(.11,8,6),mats.stone,diorama,x,1.69,-2.15);}
  cylinder(focusStage,1.2,1.26,.09,mats.stone,0,-.07,0,48);
  cylinder(focusStage,1.13,1.2,.025,mats.pave,0,-.012,0,48);
}
buildDiorama();
function createSeat(parent,scale){
  const seat=new T.Group();parent.add(seat);seat.scale.setScalar(scale);
  box(seat,.54,.07,.44,mats.wood,0,.36,-.41);
  for(const x of [-.2,.2])for(const z of [-.57,-.25])box(seat,.035,.325,.035,mats.metal,x,.1625,z);
  box(seat,.54,.08,.035,mats.wood,0,.73,-.63);
  for(const x of [-.22,.22])box(seat,.035,.35,.035,mats.metal,x,.55,-.63);
  seat.visible=false;return seat;
}

function normalizeManifest(manifest){
  const rawPeople=manifest.people||manifest.citizens||manifest.characters||[];
  const rawAnimals=manifest.animals||[];
  const normalize=(r,category)=>{
    const variants=(r.variants||[{id:'original',path:r.path||r.file||r.glb}]).map((v,i)=>typeof v==='string'?{id:String(i),path:v}:{...v,path:v.path||v.file||v.glb});
    const animations=(r.animations||r.clips||[]).map(c=>typeof c==='string'?{name:c}:c);
    return {...r,id:r.id||r.name,labelHe:r.labelHe||r.label||r.name||r.id,category,variants,animations,scale:r.ageScale||r.scale||1};
  };
  let people=rawPeople.map(r=>normalize(r,'people')), animals=rawAnimals.map(r=>normalize(r,'animals'));
  if(!people.length&&manifest.assets){
    const grouped=new Map();
    for(const a of manifest.assets){const cat=a.category==='animal'||a.kind==='animal'?'animals':'people';const id=a.characterId||a.identity||a.species||a.id;const existing=grouped.get(id);if(existing)existing.variants.push({id:a.variant||String(existing.variants.length),path:a.path||a.file,triangles:a.triangles,byteLength:a.byteLength});else grouped.set(id,normalize({...a,id},cat));}
    people=[...grouped.values()].filter(a=>a.category==='people');animals=[...grouped.values()].filter(a=>a.category==='animals');
  }
  return {people,animals};
}
async function loadAsset(record,variantIndex=0){
  const variant=record.variants[Math.min(variantIndex,record.variants.length-1)];
  if(!variant?.path)throw new Error(`אין נתיב דגם עבור ${record.id}`);
  const path=variant.path;
  let promise=cache.get(path);
  if(!promise){promise=loader.loadAsync(new URL(path,import.meta.url).href);cache.set(path,promise);}
  const gltf=await promise;
  // Each exported variant belongs to exactly one actor; no shared skeleton clones.
  const model=gltf.scene;
  model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;}});
  const existing=actors.get(record.id);
  if(existing){existing.mixer.stopAllAction();existing.mixer.uncacheRoot(existing.model);existing.container.remove(existing.model);}
  const container=existing?.container||new T.Group();
  container.add(model);
  const scalar=typeof record.scale==='number'?record.scale:1;
  model.scale.setScalar(scalar);
  if(!existing)population.add(container);
  const actor={record,variant:variantIndex,container,model,mixer:new T.AnimationMixer(model),clips:gltf.animations,action:null,seat:existing?.seat||(record.category==='people'?createSeat(container,scalar):null)};
  actors.set(record.id,actor);
  playActor(actor,state.clip);
  model.updateMatrixWorld(true);
  model.traverse(node=>{if(node.isSkinnedMesh)node.computeBoundingBox();});
  const bounds=new T.Box3().setFromObject(model,true);
  actor.dimensions=bounds.getSize(new T.Vector3());
  actor.localCenterY=bounds.getCenter(new T.Vector3()).y-container.position.y;
  if(record.id===state.selected)selectedActor=actor;
  return actor;
}
function playActor(actor,name){
  const clip=actor.clips.find(c=>c.name===name)||actor.clips.find(c=>c.name==='idle')||actor.clips[0];
  if(!clip)return;
  actor.mixer.stopAllAction();
  actor.action=actor.mixer.clipAction(clip);
  actor.action.reset().setLoop(T.LoopRepeat,Infinity).play();
  actor.action.time=(state.mode==='city'&&actor.record.id!==state.selected)?((records.indexOf(actor.record)*.173)%Math.max(.001,clip.duration)):0;
  if(actor.seat)actor.seat.visible=clip.name==='sit';
  actor.mixer.update(0);
}
function layout(){
  diorama.visible=state.mode==='city';focusStage.visible=state.mode==='focus';
  const peopleSlots=[[-2.8,.85],[-1.65,.7],[-.5,.75],[.65,.7],[1.8,.85],[2.95,.8],[-2.8,-.45],[-1.65,-.5],[-.5,-.5],[.65,-.45],[1.8,-.5],[2.95,-.45]];
  const animalSlots=[[-1.3,1.7],[1.45,1.7],[-3.2,1.5],[3.15,1.5],[.1,-2.15],[.3,1.9]];
  for(const actor of actors.values()){
    const r=actor.record,isPeople=r.category==='people',index=(isPeople?humanRecords:animalRecords).indexOf(r);
    actor.container.visible=state.mode!=='focus'||r.id===state.selected;
    let x=0,z=0,y=0,turn=0;
    if(state.mode==='city'){
      [x,z]=(isPeople?peopleSlots:animalSlots)[index]||[0,0];
      turn=isPeople?(index%3-1)*.14:0;
      if(!isPeople&&/bird|butterfly/.test(r.id))y=/butterfly/.test(r.id)?.8:1.5;
      if(!isPeople&&/fish/.test(r.id))y=.21;
    }else if(state.mode==='lineup'){
      const allIndex=records.indexOf(r);
      const row=allIndex<6?0:allIndex<12?1:2;
      x=((allIndex%6)-2.5)*1.12;z=(row-1)*1.48;
      if(!isPeople&&/bird|butterfly|fish/.test(r.id))y=.12;
    }else{
      if(!isPeople&&/bird|butterfly|fish/.test(r.id))y=.65;
      turn=.12;
    }
    actor.container.position.set(x,y,z);actor.container.rotation.y=turn;
  }
  updateCamera();
}
function updateCamera(){
  const aspect=Math.max(1,stage.clientWidth)/Math.max(1,stage.clientHeight);
  const focusAnimal=state.mode==='focus'&&selectedActor?.record.category==='animals';
  const dimensions=selectedActor?.dimensions;
  let height=state.mode==='focus'?(focusAnimal&&dimensions?Math.max(.5,dimensions.y*1.8,dimensions.x/aspect*1.8,dimensions.z/aspect*1.8):2.65):state.mode==='lineup'?5.7:5.55;
  if(aspect<1.4&&state.mode!=='focus')height*=1.4/aspect;
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
  if(state.mode==='focus'){
    const focusY=focusAnimal?(selectedActor.localCenterY+selectedActor.container.position.y):.85;
    const isButterfly=/butterfly/.test(selectedActor?.record.id||'');
    const isFish=/fish/.test(selectedActor?.record.id||'');
    camera.position.set(focusAnimal?(isFish?4:1.8):3,focusY+(focusAnimal?(isButterfly?4.5:1.2):1.1),focusAnimal?(isFish?3:5):7);camera.lookAt(0,focusY,0);
  }else{camera.position.set(4.3,6.4,11.5);camera.lookAt(0,.57,-.1);}
  camera.updateProjectionMatrix();
}
function renderList(){
  const list=state.family==='people'?humanRecords:animalRecords;
  $('asset-list').replaceChildren(...list.map((record,index)=>{
    const button=document.createElement('button');button.type='button';button.className='asset-button';button.dataset.asset=record.id;
    button.setAttribute('aria-pressed',String(record.id===state.selected));
    const dot=document.createElement('i');dot.style.setProperty('--dot',['#9f9f67','#c99367','#7fa699','#8b93a1','#b49c7e','#8b9b6e'][index%6]);
    const text=document.createElement('span');text.textContent=record.labelHe;button.title=record.labelHe;
    button.append(dot,text);button.addEventListener('click',()=>select(record.id));return button;
  }));
  for(const button of document.querySelectorAll('[data-family]'))button.setAttribute('aria-selected',String(button.dataset.family===state.family));
}
function renderControls(){
  if(!selectedActor)return;
  const record=selectedActor.record;
  $('selected-name').textContent=record.labelHe;
  $('selected-detail').textContent=record.category==='people'?'שישה רגעים קטנים מהחיים בעיר':'גם להם יש מקום בשכונה';
  const variants=record.variants;
  $('palettes').replaceChildren(...Array.from({length:3},(_,index)=>{
    const button=document.createElement('button');button.type='button';button.className='palette-button';button.dataset.variant=String(index);button.disabled=index>=variants.length;
    button.setAttribute('aria-label',`גרסת צבע ${index+1}`);button.setAttribute('aria-pressed',String(index===selectedActor.variant));button.title=variants[index]?.labelHe||`צבע ${index+1}`;
    button.style.setProperty('--swatch',['#5f897b','#c99769','#8686a6'][index]);button.addEventListener('click',()=>setVariant(index));return button;
  }));
  $('clip-list').replaceChildren(...selectedActor.clips.map(clip=>{
    const button=document.createElement('button');button.type='button';button.dataset.clip=clip.name;button.textContent=clipLabels[clip.name]||clip.name;
    button.setAttribute('aria-pressed',String(selectedActor.action?.getClip().name===clip.name));button.addEventListener('click',()=>setClip(clip.name));return button;
  }));
  const variant=variants[selectedActor.variant]||{};
  const triangles=variant.triangles||record.triangles;
  $('triangle-count').textContent=triangles?`${Number(triangles).toLocaleString('en')} △`:'GLB';
  $('asset-count').textContent=`${records.length} דמויות`;
}
function select(id){
  const record=records.find(r=>r.id===id);if(!record)return false;
  state.selected=id;state.family=record.category;selectedActor=actors.get(id)||null;state.variant=selectedActor?.variant||0;
  if(selectedActor&&!selectedActor.clips.some(c=>c.name===state.clip)){state.clip=selectedActor.clips[0]?.name||'idle';playActor(selectedActor,state.clip);}
  renderList();renderControls();layout();return true;
}
function setClip(name){
  if(!selectedActor?.clips.some(c=>c.name===name))return false;
  state.clip=name;
  for(const actor of actors.values())playActor(actor,name);
  renderControls();layout();return true;
}
async function setVariant(index){
  if(!selectedActor||index<0||index>=selectedActor.record.variants.length)return false;
  const record=selectedActor.record,id=record.id;
  $('load-status').textContent='מחליף צבעי לבוש…';
  try{await loadAsset(record,index);if(state.selected===id){selectedActor=actors.get(id);state.variant=index;}layout();renderControls();$('load-status').textContent='השכונה מוכנה';return true;}
  catch(error){reportError(error);return false;}
}
function setMode(mode){
  if(!['city','focus','lineup'].includes(mode))return false;
  state.mode=mode;population.rotation.y=0;
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  layout();return true;
}
function snapshot(){return {ready:state.ready,mode:state.mode,family:state.family,selected:state.selected,clip:selectedActor?.action?.getClip().name||null,variant:selectedActor?.variant??0,playing:state.playing,loaded:actors.size,loadedHumans:[...actors.values()].filter(a=>a.record.category==='people').length,loadedAnimals:[...actors.values()].filter(a=>a.record.category==='animals').length,people:humanRecords.length,animals:animalRecords.length,errors:[...state.errors],frame,viewport:[stage.clientWidth,stage.clientHeight],renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},assets:[...actors.values()].map(a=>({id:a.record.id,variant:a.variant,clips:a.clips.map(c=>c.name),visible:a.container.visible}))};}
function reportError(error){const message=error?.message||String(error);state.errors.push(message);$('stage-error').hidden=false;$('stage-error').textContent=`התצוגה לא נטענה במלואה: ${message}`;$('load-status').textContent='אירעה שגיאה בטעינה';console.error(error);}
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>setMode(button.dataset.mode));
for(const button of document.querySelectorAll('[data-family]'))button.addEventListener('click',()=>{const list=button.dataset.family==='people'?humanRecords:animalRecords;if(list.length)select(list[0].id);});
$('play').addEventListener('click',()=>{state.playing=!state.playing;$('play').setAttribute('aria-pressed',String(!state.playing));$('play').setAttribute('aria-label',state.playing?'השהיית האנימציה':'ניגון האנימציה');$('pause-icon').hidden=!state.playing;$('play-icon').hidden=state.playing;});
$('rotate').addEventListener('click',()=>{state.rotate=!state.rotate;$('rotate').setAttribute('aria-pressed',String(state.rotate));});
$('scrub').addEventListener('input',()=>{const duration=selectedActor?.action?.getClip().duration||0;for(const actor of actors.values()){if(actor.action){actor.action.time=Number($('scrub').value)/1000*(actor.action.getClip().duration||duration);actor.mixer.update(0);}}});
let dragging=false,lastX=0;
canvas.addEventListener('pointerdown',event=>{dragging=true;lastX=event.clientX;canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!dragging)return;population.rotation.y+=(event.clientX-lastX)*.008;lastX=event.clientX;});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight,false);updateCamera();}).observe(stage);
let last=performance.now();
function tick(now){const delta=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(state.playing)for(const actor of actors.values())actor.mixer.update(delta);if(state.rotate)population.rotation.y+=delta*.23;
  if(selectedActor?.action){const duration=selectedActor.action.getClip().duration,time=selectedActor.action.time;$('time').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)}`;if(document.activeElement!==$('scrub'))$('scrub').value=String(Math.round(time/Math.max(.001,duration)*1000));}
  renderer.render(scene,camera);frame++;requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
const ready=(async()=>{
  try{
    const response=await fetch(new URL('manifest.json',import.meta.url));if(!response.ok)throw new Error(`manifest.json: ${response.status}`);
    const normalized=normalizeManifest(await response.json());humanRecords=normalized.people;animalRecords=normalized.animals;records=[...humanRecords,...animalRecords];
    if(!records.length)throw new Error('לא נמצאו דמויות במניפסט');
    state.selected=humanRecords[0]?.id||records[0].id;renderList();
    let loaded=0;
    const results=await Promise.allSettled(records.map(async record=>{await loadAsset(record);loaded++;$('load-status').textContent=`${loaded} מתוך ${records.length} דמויות מוכנות`;}));
    for(const result of results)if(result.status==='rejected')reportError(result.reason);
    selectedActor=actors.get(state.selected)||actors.values().next().value;
    if(selectedActor)state.selected=selectedActor.record.id;
    renderList();renderControls();layout();state.ready=state.errors.length===0&&actors.size===records.length;
    if(state.ready)$('load-status').textContent='השכונה מוכנה';
    return snapshot();
  }catch(error){reportError(error);return snapshot();}
})();
window.cityPreview={ready,setClip,select,setVariant,setMode,snapshot,setPlaying(value){if(state.playing!==Boolean(value))$('play').click();},seek(seconds){if(!Number.isFinite(seconds))return false;for(const actor of actors.values())if(actor.action){actor.action.time=T.MathUtils.euclideanModulo(seconds,actor.action.getClip().duration);actor.mixer.update(0);}return true;}};

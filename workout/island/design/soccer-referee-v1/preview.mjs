// SPDX-License-Identifier: CC0-1.0
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from '../../vendor/SkeletonUtils.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const stage = $('#stage');
const errors = [];
const clipNames = ['idle', 'jog', 'whistle', 'point_penalty', 'advantage', 'yellow_card', 'red_card', 'goal_signal', 'assistant_run', 'assistant_offside'];
const labels = {idle:'עמידת מוצא',jog:'ריצה קלה',whistle:'שריקה',point_penalty:'בעיטת עונשין',advantage:'יתרון',yellow_card:'כרטיס צהוב',red_card:'כרטיס אדום',goal_signal:'אישור שער',assistant_run:'ריצה לאורך קו החוץ',assistant_offside:'סימון נבדל'};
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#294c43');
scene.fog = new THREE.Fog('#294c43',18,36);
const camera = new THREE.OrthographicCamera(-4,4,2,-2,.1,60);
scene.add(new THREE.HemisphereLight('#f8f3d9','#19352a',2.25));
const sun = new THREE.DirectionalLight('#fff2c8',3.2);
sun.position.set(-3,8,6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
sun.shadow.camera.near = .1;
sun.shadow.camera.far = 24;
sun.shadow.normalBias = .025;
sun.shadow.bias = -.00015;
scene.add(sun);
const rim = new THREE.DirectionalLight('#a4e0da',1.3);
rim.position.set(4,4,-5);
scene.add(rim);
const actors = [];
const uniforms = [];
const clockState = {clip:'idle',time:0,duration:1,playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,shirt:'yellow',view:'front',context:false};
let ready = false;
let lastFrame = performance.now();
let cameraAzimuth = 0;

const material = (color,extra={}) => new THREE.MeshStandardMaterial({color,roughness:.9,...extra});
function box(w,h,d,mat,x,y,z,parent=scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const turf = new THREE.Group();
scene.add(turf);
box(26,.16,28,material('#335b40'),0,-.14,-4,turf);
for(let i=0;i<12;i++) box(6.3,.018,.9,material(i%2?'#3c7851':'#44845a'),0,-.04,-4.5+i*.9,turf);
const white = new THREE.LineBasicMaterial({color:'#c9dcb7',transparent:true,opacity:.7});
function line(points,mat=white,parent=turf) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x,z]) => new THREE.Vector3(x,-.022,z)));
  const result = new THREE.Line(geometry,mat);
  parent.add(result);
  return result;
}
line([[-3.15,-4.5],[-3.15,5.4],[3.15,5.4],[3.15,-4.5],[-3.15,-4.5]]);
line([[-3.15,.45],[3.15,.45]]);
line(Array.from({length:81},(_,i) => [Math.cos(i/80*Math.PI*2)*1.04,.45+Math.sin(i/80*Math.PI*2)*1.04]));
for(const [end,sign] of [[-4.5,1],[5.4,-1]]) {
  line([[-1.65,end],[-1.65,end+sign*1.6],[1.65,end+sign*1.6],[1.65,end]]);
  line([[-.8,end],[-.8,end+sign*.55],[.8,end+sign*.55],[.8,end]]);
}
const dot = new THREE.Mesh(new THREE.CircleGeometry(.035,16),material('#dbe5b8'));
dot.rotation.x = -Math.PI/2;
dot.position.set(0,-.019,.45);
turf.add(dot);
// A quiet stadium edge keeps the figures readable at phone size.
const darkRail = material('#213c35');
box(19,.28,.18,darkRail,0,.04,-7.4);
for(let i=0;i<3;i++)box(19,.22,.8,material(['#315448','#355b4c','#3c6252'][i]),0,.2+i*.22,-8.2-i*.85);
const boardMats = ['#87933a','#233f36','#486447','#233f36','#87933a'].map(c=>material(c));
for(let i=-4;i<=4;i++)box(1.65,.38,.08,boardMats[(i+4)%5],i*1.9,.12,-7.25);
// Optional match context reuses the delivered character geometry in two team colors.
const contextGroup = new THREE.Group();
contextGroup.visible = false;
scene.add(contextGroup);
function buildContext(source,clips) {
  const positions=[[0,-4],[-2,-3.1],[0,-3.3],[2,-3],[-2.4,-1.9],[-.9,-2],[.9,-2.25],[2.4,-1.8],[-1.8,-.5],[0,-.6],[1.8,-.4]];
  for(let team=0;team<2;team++)for(let i=0;i<11;i++) {
    const model=cloneSkeleton(source);
    model.name=`context-team-${team+1}-player-${i+1}`;
    model.scale.setScalar(.35);
    model.position.set(positions[i][0]+(team?.12:0),0,team?.9-positions[i][1]:positions[i][1]);
    model.rotation.y=team?Math.PI:0;
    model.traverse(node=>{
      if(!node.isMesh)return;
      node.castShadow=false;
      const recolor=sourceMaterial=>{
        if(!/shirt/i.test(sourceMaterial.name)&&!/shirt/i.test(node.name))return sourceMaterial;
        const colored=sourceMaterial.clone();
        colored.map=null;
        colored.color.set(team?'#ce6757':'#d9e8df');
        return colored;
      };
      node.material=Array.isArray(node.material)?node.material.map(recolor):recolor(node.material);
    });
    contextGroup.add(model);
    const mixer=new THREE.AnimationMixer(model);
    mixer.clipAction(clips.find(c=>c.name==='idle')).play();
    mixer.setTime(i*.17);
  }
}

function setCamera() {
  const width = Math.max(stage.clientWidth,1);
  const height = Math.max(stage.clientHeight,1);
  const aspect = width/height;
  const portrait = aspect<1.05;
  const viewHeight = clockState.view==='wide' ? (portrait?Math.max(9.8,8.7/aspect):6.5) : (portrait?Math.max(6.9,7.35/aspect):3.65);
  camera.left = -viewHeight*aspect/2;
  camera.right = viewHeight*aspect/2;
  camera.top = viewHeight/2;
  camera.bottom = -viewHeight/2;
  const azimuth = clockState.view==='threeQuarter' ? .33 : cameraAzimuth;
  camera.position.set(Math.sin(azimuth)*10,clockState.view==='wide'?8.7:3.6,Math.cos(azimuth)*10);
  camera.lookAt(0,clockState.view==='wide'?.2:.95,clockState.view==='wide'?-.4:.1);
  camera.updateProjectionMatrix();
  renderer.setSize(width,height,false);
}
const observer = new ResizeObserver(setCamera);
observer.observe(stage);
setCamera();

function serializeActor(actor) {
  const meshes=[];
  let triangles=0;
  actor.model.traverse(node=>{
    if(node.isMesh){
      const count=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
      triangles+=count;
      meshes.push({name:node.name,triangles:count,visible:node.visible,material:Array.isArray(node.material)?node.material.map(m=>m.name):node.material.name});
    }
  });
  const bounds = new THREE.Box3().setFromObject(actor.model);
  const props=[];
  actor.model.traverse(node=>{if(/^(Whistle|YellowCard|RedCard|Flag)$/.test(node.name)){props.push({name:node.name,parent:node.parent?.name,scale:node.scale.toArray(),position:node.position.toArray(),quaternion:node.quaternion.toArray(),worldPosition:node.getWorldPosition(new THREE.Vector3()).toArray(),visible:node.visible});}});
  return {name:actor.name,placement:actor.placement.position.toArray(),hostTravelMetersPerSecond:actor.name==='referee'?0:1.15,clips:actor.clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),triangles,meshes,props,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},bones:actor.model.getObjectsByProperty('isBone',true).map(b=>b.name),active:actor.action?.getClip().name};
}
function applyTime(seconds) {
  clockState.time=Math.max(0,Math.min(Number(seconds)||0,clockState.duration));
  for(const actor of actors) {
    // All moving parts, including flags and cards, are sampled from GLB animation tracks.
    const duration=actor.action.getClip().duration;
    actor.action.paused=false;
    actor.action.enabled=true;
    actor.mixer.setTime(Math.min(clockState.time,duration));
    // The clip is in place: world travel belongs to the host placement group.
    // Both assistants advance along their own touchline at the declared 1.15 m/s.
    actor.placement.position.z=actor.baseZ+(clockState.clip==='assistant_run'&&actor.name!=='referee'?clockState.time*1.15:0);
    actor.placement.updateMatrixWorld(true);
  }
  $('#seek').value=String(clockState.time);
  $('#time').textContent=`${clockState.time.toFixed(2)} / ${clockState.duration.toFixed(2)}`;
}
function showPlayState() {
  $('#pause-icon').toggleAttribute('hidden',!clockState.playing);
  $('#play-icon').toggleAttribute('hidden',clockState.playing);
  $('#play').setAttribute('aria-label',clockState.playing?'השהיה':'ניגון');
  $('#play').title=clockState.playing?'השהיה':'ניגון';
}
function select(name) {
  if(!ready) return false;
  if(!clipNames.includes(name)) throw new Error(`Unknown animation: ${name}`);
  for(const actor of actors) {
    const selectedName=actor.name==='referee' ? (name.startsWith('assistant_')?'idle':name) : (name.startsWith('assistant_')?name:'idle');
    const clip=actor.clips.find(c=>c.name===selectedName);
    if(!clip) throw new Error(`${actor.name}: missing ${selectedName}`);
    actor.mixer.stopAllAction();
    actor.action=actor.mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);
    actor.action.clampWhenFinished=true;
    actor.action.reset().play();
    actor.mixer.setTime(0);
  }
  clockState.clip=name;
  clockState.duration=(name.startsWith('assistant_')?actors[1]:actors[0]).action.getClip().duration;
  $('#seek').max=String(clockState.duration);
  document.querySelectorAll('[data-clip]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.clip===name)));
  $('#stage-caption').textContent=labels[name];
  $('#status').textContent=name==='assistant_run'?'שני הקוונים רצים לאורך קווי החוץ':name==='assistant_offside'?'שני הקוונים מסמנים בקווי החוץ':'השופט הראשי במרכז המגרש';
  applyTime(0);
  return true;
}
function setShirt(color) {
  if(!['yellow','black'].includes(color))throw new Error(`Unknown shirt: ${color}`);
  clockState.shirt=color;
  for(const item of uniforms) item.color.set(color==='yellow'?item.userData.originalColor:'#20262d');
  document.querySelectorAll('[data-shirt]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.shirt===color)));
}
function setView(view) {
  if(!['front','threeQuarter','wide'].includes(view))throw new Error(`Unknown view: ${view}`);
  clockState.view=view;
  cameraAzimuth=0;
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  setCamera();
}
const api={
  get ready(){return ready},
  select,
  seek(seconds){clockState.playing=false;showPlayState();applyTime(seconds);renderer.render(scene,camera);return clockState.time},
  play(){if(clockState.time>=clockState.duration)applyTime(0);clockState.playing=true;lastFrame=performance.now();showPlayState()},
  pause(){clockState.playing=false;showPlayState()},
  setShirt,
  setView,
  setContext(visible){clockState.context=Boolean(visible);contextGroup.visible=clockState.context;$('#context').checked=clockState.context},
  inspect(){return {ready,state:{...clockState},clips:clipNames,actors:actors.map(serializeActor),errors:[...errors],shirts:uniforms.map(m=>({name:m.name,color:`#${m.color.getHexString()}`})),contextPlayers:contextGroup.children.length,width:stage.clientWidth,height:stage.clientHeight,render:renderer.info.render}},
  renderer,scene,camera,actors,errors,
};
window.__refereePreview=api;
document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.clip)));
document.querySelectorAll('[data-shirt]').forEach(button=>button.addEventListener('click',()=>setShirt(button.dataset.shirt)));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('#seek').addEventListener('input',event=>api.seek(event.target.value));
$('#play').addEventListener('click',()=>clockState.playing?api.pause():api.play());
$('#restart').addEventListener('click',()=>applyTime(0));
$('#context').addEventListener('change',event=>api.setContext(event.target.checked));
let drag;
canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,azimuth:cameraAzimuth};canvas.setPointerCapture(event.pointerId)});
canvas.addEventListener('pointermove',event=>{if(drag&&Math.abs(event.clientX-drag.x)>3){clockState.view='front';cameraAzimuth=THREE.MathUtils.clamp(drag.azimuth+(event.clientX-drag.x)*.004,-.7,.7);setCamera()}});
canvas.addEventListener('pointerup',()=>{drag=null});
canvas.addEventListener('pointercancel',()=>{drag=null});
showPlayState();

try {
  const loader = new GLTFLoader();
  const loaded = await Promise.all([
    ['referee','models/referee.glb',[0,0,.9],1.25,0],
    ['assistant-left','models/assistant-left.glb',[-3.08,0,-1.1],.82,.18],
    ['assistant-right','models/assistant-right.glb',[3.08,0,-1.1],.82,-.18],
  ].map(async([name,url,position,scale,rotation])=>{
    const gltf=await loader.loadAsync(new URL(url,import.meta.url).href);
    const model=gltf.scene;
    const placement=new THREE.Group();
    placement.name=`${name}-placement`;
    placement.position.set(...position);
    placement.scale.setScalar(scale);
    placement.rotation.y=rotation;
    placement.add(model);
    scene.add(placement);
    model.traverse(node=>{
      if(!node.isMesh)return;
      node.castShadow=true;
      node.receiveShadow=true;
      // Clone only jersey materials; original model assets remain intact.
      const prepare = source=>{
        if(!/shirt/i.test(source.name)&&!/shirt/i.test(node.name))return source;
        const copy=source.clone();
        copy.userData.originalColor=`#${source.color.getHexString()}`;
        uniforms.push(copy);
        return copy;
      };
      node.material=Array.isArray(node.material)?node.material.map(prepare):prepare(node.material);
    });
    return {name,model,placement,baseZ:position[2],clips:gltf.animations,mixer:new THREE.AnimationMixer(model),action:null};
  }));
  actors.push(...loaded);
  buildContext(actors[0].model,actors[0].clips);
  ready=true;
  select('idle');
  setShirt('yellow');
  $('#loading').hidden=true;
  const query=new URLSearchParams(location.search);
  if(query.has('clip'))select(query.get('clip'));
  if(query.has('t'))api.seek(Number(query.get('t')));
  if(query.has('shirt'))setShirt(query.get('shirt'));
  if(query.has('view'))setView(query.get('view'));
  if(query.get('context')==='1')api.setContext(true);
  if(query.get('paused')==='1')api.pause();
} catch(error) {
  ready=false;
  errors.push(String(error.stack||error));
  console.error(error);
  $('#loading').textContent='לא ניתן לטעון את צוות השיפוט';
  $('#status').textContent='הטעינה לא הושלמה';
}
function animate(now) {
  const delta=Math.min((now-lastFrame)/1000,.06);
  lastFrame=now;
  if(ready&&clockState.playing){
    const next=clockState.time+delta;
    if(clockState.clip==='assistant_run'&&next>=clockState.duration){applyTime(clockState.duration);clockState.playing=false;showPlayState()}
    else applyTime(next>clockState.duration?next%clockState.duration:next);
  }
  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

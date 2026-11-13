// Original work, CC0-1.0. Uses the repository's existing MIT Three.js loader.
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {applyUniform} from './recolor.js';

const $ = id => document.getElementById(id);
const labels = {idle:'מחכים בשקט', scared:'קצת רועדים', wave:'מבקשים עזרה',
  rescued:'איזה כיף, חולצנו!', walk_out:'הולכים למקום בטוח'};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const actors = [];
let playing = !reduced.matches, speed = 1, elapsed = 0, angle = 0;
const controls = [...document.querySelectorAll('button,select,input')];
controls.forEach(control => control.disabled = true);

function setPlaying(value) {
  playing = value;
  $('play').textContent = playing ? 'השהיה' : 'ניגון';
  $('play').setAttribute('aria-pressed', String(playing));
}

function stage(element, id) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  element.append(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 20);
  scene.add(new THREE.HemisphereLight(0xfff3d9, 0xb7c1ad, 2.1));
  const key = new THREE.DirectionalLight(0xffeed5, 2.6);
  key.position.set(-2, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(3, 2, -2); scene.add(rim);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(.66,.70,.035,64),
    new THREE.MeshStandardMaterial({color:id === 'cat' ? '#EFE2C4' : id === 'dog' ? '#DEE8D2' : '#F1DDCB', roughness:1}));
  pad.position.set(0,-.03,.08); scene.add(pad);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.27,40),
    new THREE.MeshBasicMaterial({color:0x667056, transparent:true, opacity:.13, depthWrite:false}));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = -.008; shadow.scale.set(1, .76, 1); scene.add(shadow);
  const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0,-.006,.66), new THREE.Vector3(0,-.006,1.22),
    new THREE.Vector3(-.06,-.006,1.14), new THREE.Vector3(0,-.006,1.22), new THREE.Vector3(.06,-.006,1.14)]),
    new THREE.LineBasicMaterial({color:0x9eaf91, transparent:true, opacity:.8}));
  path.visible = false; scene.add(path);
  const resize = () => {
    const {width, height} = element.getBoundingClientRect();
    const aspect = width/Math.max(1,height), half = .94;
    renderer.setSize(width,height,false);
    camera.left = -half*aspect; camera.right = half*aspect;
    camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
    renderer.render(scene,camera);
  };
  new ResizeObserver(resize).observe(element); resize();
  return {scene,renderer,camera,shadow,path,element};
}

function setAngle(value) {
  angle = value;
  for (const a of actors) {
    a.camera.position.set(4*Math.sin(angle),1.30,4*Math.cos(angle)+.30);
    a.camera.lookAt(0,.70,.30);
    a.camera.updateMatrixWorld();
  }
  document.querySelectorAll('[data-angle]').forEach(b =>
    b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.angle)-angle)<.001)));
}

function selectActorClip(actor, name) {
  actor.mixer.stopAllAction();
  actor.active = actor.clips.find(c => c.name === name);
  if (!actor.active) throw new Error(`Missing clip: ${actor.id}/${name}`);
  actor.action = actor.mixer.clipAction(actor.active);
  const loop = ['idle','scared','wave'].includes(name);
  actor.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  actor.action.clampWhenFinished = true; actor.action.reset().play();
  actor.clipName = name; actor.path.visible = name === 'walk_out';
  document.querySelector(`[data-actor="${actor.id}"]`).value = name;
}

function selectClip(name) {
  elapsed = 0;
  for (const actor of actors) selectActorClip(actor,name);
  document.querySelectorAll('[data-clip]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.clip === name)));
  seek(0);
}

function render() {
  for (const actor of actors) {
    actor.model.updateMatrixWorld(true);
    const root = actor.model.getObjectByName('Root');
    actor.shadow.position.z = root.position.z;
    actor.shadow.position.x = root.position.x;
    const visible = actor.element.getBoundingClientRect();
    if (visible.bottom > 0 && visible.top < innerHeight) actor.renderer.render(actor.scene,actor.camera);
  }
}

function seek(fraction) {
  for (const a of actors) {
    a.action.paused = false;
    a.action.time = Math.min(a.active.duration-.000001, Math.max(0,fraction*a.active.duration));
    a.mixer.update(0);
  }
  elapsed = fraction*(actors[0]?.active.duration || 1);
  $('timeline').value = fraction;
  $('time').value = `${elapsed.toFixed(2)} s`;
  render();
}

const ready = (async () => {
  const response = await fetch(new URL('./manifest.json',import.meta.url));
  if (!response.ok) throw new Error(`manifest.json: ${response.status}`);
  const manifest = await response.json();
  const loader = new GLTFLoader();
  // Sequential setup also keeps card order stable when a tiny GLB loads first.
  for (const data of manifest.assets) {
    const gltf = await loader.loadAsync(new URL(data.file,import.meta.url).href);
    const actor = {...stage($(`view-${data.id}`), data.id), id:data.id, model:gltf.scene, clips:gltf.animations, data};
    actor.scene.add(actor.model);
    actor.mixer = new THREE.AnimationMixer(actor.model);
    actor.model.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    actors.push(actor);
    const select = document.querySelector(`[data-actor="${data.id}"]`);
    select.replaceChildren(...Object.keys(labels).map(name => new Option(`${labels[name]} · ${name}`,name)));
    select.addEventListener('change', () => {
      selectActorClip(actor,select.value);
      document.querySelectorAll('[data-clip]').forEach(b => b.setAttribute('aria-pressed','false'));
      elapsed = 0; seek(0);
    });
    $(`stats-${data.id}`).textContent = `${data.triangles.toLocaleString('he')} משולשים · חומר אחד · ${data.joints} עצמות`;
  }
  selectClip('idle'); setAngle(0); setPlaying(playing);
  controls.forEach(control => control.disabled = false);
  $('status').textContent = 'כולם כאן. בחרו תנועה כדי לראות את שלושת החברים, או תנועה נפרדת לכל אחד.';
  render();
  return actors;
})();
ready.catch(error => {
  $('status').textContent = `לא הצלחנו לטעון את התצוגה: ${error.message}. פתחו דרך שרת HTTP מקומי משורש המאגר.`;
  console.error(error);
});

document.querySelectorAll('[data-clip]').forEach(b => b.addEventListener('click',()=>selectClip(b.dataset.clip)));
document.querySelectorAll('[data-angle]').forEach(b => b.addEventListener('click',()=>{setAngle(Number(b.dataset.angle));render();}));
$('play').addEventListener('click',()=>setPlaying(!playing));
$('replay').addEventListener('click',()=>{
  for (const actor of actors) selectActorClip(actor,actor.clipName);
  seek(0); setPlaying(true);
});
$('speed').addEventListener('change',()=>speed=Number($('speed').value));
$('timeline').addEventListener('input',()=>{setPlaying(false);seek(Number($('timeline').value));});
function recolor() {
  if (actors[0]) applyUniform(actors[0].model,{uniform_primary:$('primary').value, uniform_secondary:$('secondary').value});
  render();
}
$('primary').addEventListener('input',recolor); $('secondary').addEventListener('input',recolor);
$('reset-colors').addEventListener('click',()=>{$('primary').value='#ec805e';$('secondary').value='#417e83';recolor();});
reduced.addEventListener('change',()=>{if(reduced.matches)setPlaying(false);});
window.addEventListener('scroll',()=>{if(!playing)render();},{passive:true});
let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min((now-previous)/1000,.05)*speed; previous = now;
  if (!playing || document.hidden || actors.length !== 3) return;
  elapsed += delta;
  for (const a of actors) a.mixer.update(delta);
  const first = actors[0];
  $('timeline').value = first.action.time/first.active.duration;
  $('time').value = `${first.action.time.toFixed(2)} s`;
  if (actors.every(a => ['rescued','walk_out'].includes(a.clipName) && !a.action.isRunning())) setPlaying(false);
  render();
}
requestAnimationFrame(frame);
// Review helpers: all rendering and animation still use the actual GLBs above.
window.rescuePreview = {ready,actors,selectClip,seek,setAngle,setPlaying,render,applyUniform};

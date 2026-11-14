import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const testMode = params.has('test');
const state = { team: params.get('team') === 'enemy' ? 'enemy' : 'player',
  view: params.get('ship') || 'fleet', radar: true, lights: true, yaw: 0, pitch: 0,
  wire: false, top: false, time: 0 };
const canvas = $('scene');
for (const control of document.querySelectorAll('button,input')) control.disabled = true;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: testMode });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#367d82');
scene.add(new THREE.HemisphereLight('#fff1cf', '#38707b', 2.3));
const sun = new THREE.DirectionalLight('#ffe5b3', 3.1);
sun.position.set(-6, 14, 8); scene.add(sun);
const fill = new THREE.DirectionalLight('#b6e5e0', 1.15);
fill.position.set(8, 7, -9); scene.add(fill);
const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 160);
const waterUniforms = { time: { value: 0 } };
const waterMaterial = new THREE.MeshStandardMaterial({color:'#154653',roughness:.85,metalness:0});
waterMaterial.onBeforeCompile = shader => {
  shader.uniforms.time = waterUniforms.time;
  shader.vertexShader = 'varying vec3 waterPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterPoint = position;');
  shader.fragmentShader = 'uniform float time; varying vec3 waterPoint;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    float wave = sin(waterPoint.x * .8 + waterPoint.y * 2.4 + time * .35);
    diffuseColor.rgb *= .97 + .04 * wave * sin(waterPoint.y * .9 - time * .2);`);
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(120,120), waterMaterial);
water.rotation.x = -Math.PI/2; water.position.y = -.045; scene.add(water);
const fleet = new THREE.Group(); scene.add(fleet);
const records = new Map();
let manifest, azimuth = .66, elevation = .78, zoom = 1, last = performance.now();

function frameCamera() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  renderer.setSize(bounds.width, bounds.height, false);
  const aspect = bounds.width / bounds.height;
  const viewHeight = 12.7 / zoom;
  const viewWidth = viewHeight * aspect;
  camera.left = -viewWidth/2; camera.right = viewWidth/2;
  camera.top = viewHeight/2; camera.bottom = -viewHeight/2;
  // On narrow screens show the complete formation and each individual hull.
  if (state.view === 'fleet' && viewWidth < 15.5) {
    camera.left = -7.75/zoom; camera.right = 7.75/zoom;
    camera.top = 7.75/aspect/zoom; camera.bottom = -camera.top;
  }
  const selected = manifest?.models.find(m => m.ship === state.view && m.team === state.team);
  const box = selected && new THREE.Box3(new THREE.Vector3(...selected.boundsMetres.min),new THREE.Vector3(...selected.boundsMetres.max));
  const target = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(0,.25,0);
  camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*32,
    Math.sin(elevation)*32,Math.cos(azimuth)*Math.cos(elevation)*32).add(target);
  camera.lookAt(target); camera.updateMatrixWorld(true);
  if (box) {
    let halfWidth=0,halfHeight=0;
    for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
      const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
      halfWidth=Math.max(halfWidth,Math.abs(p.x));halfHeight=Math.max(halfHeight,Math.abs(p.y));
    }
    const half=Math.max(halfHeight,halfWidth/aspect)*1.16/zoom;
    camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect;
  }
  camera.updateProjectionMatrix();
}

function applyRig() {
  for (const { root, rest } of records.values()) {
    root.getObjectByName('lights').visible = state.lights;
    root.traverse(node => {
      if (/^turret(?:_aft)?$/.test(node.name)) {
        node.quaternion.copy(rest.get(node.name)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(state.yaw)));
      }
      if (/^barrel(?:_aft)?$/.test(node.name)) node.rotation.x = -THREE.MathUtils.degToRad(state.pitch);
      if (node.isMesh) node.material.wireframe = state.wire;
    });
  }
}

function refresh() {
  let index = 0;
  for (const spec of manifest.ships) {
    for (const team of ['player','enemy']) {
      const { root } = records.get(spec.id+'-'+team);
      root.visible = team === state.team && (state.view === 'fleet' || state.view === spec.id);
      root.position.set(0,0,0); root.scale.setScalar(1);
      if (state.view === 'fleet') {
        root.scale.setScalar(.68);
        root.position.set((index%3-1)*5.2,0,(Math.floor(index/3)-.5)*6.0);
      }
    }
    index++;
  }
  const selected = manifest.ships.find(s => s.id === state.view);
  const model = selected && manifest.models.find(m => m.ship === selected.id && m.team === state.team);
  $('title').textContent = selected?.labelHe || 'כל הצי';
  $('title').classList.toggle('long', $('title').textContent.length > 15);
  $('subtitle').textContent = state.team === 'player' ? 'טורקיז וזהב' : 'אלמוג וסגול כהה';
  $('details').textContent = model ? `${model.triangles.toLocaleString('he-IL')} משולשים · ${(model.bytes/1024).toFixed(1)} KB` : 'שש צלליות · סגנון משותף';
  $('download').href = model?.file || 'manifest.json';
  $('download').textContent = model ? 'הורדת הדגם ↓' : 'מפרט וקובצי הצי ↓';
  for (const team of ['player','enemy']) $(team).setAttribute('aria-pressed',String(state.team===team));
  for (const button of $('ships').children) button.setAttribute('aria-pressed',String(button.dataset.ship===state.view));
  $('fleet').setAttribute('aria-pressed',String(state.view==='fleet'));
  applyRig(); frameCamera(); render();
}

function render() { renderer.render(scene,camera); }
function step(seconds) {
  state.time += seconds; waterUniforms.time.value = state.time;
  if (state.radar) for (const rec of records.values()) if (rec.root.visible) rec.mixer.update(seconds);
  render();
}
function setView(view) {
  state.view = manifest.ships.some(s=>s.id===view) ? view : 'fleet';
  zoom=1; refresh();
}
function setTeam(team) { if (team==='player' || team==='enemy') { state.team=team; refresh(); } }
for (const team of ['player','enemy']) $(team).onclick=()=>setTeam(team);
$('fleet').onclick=()=>setView('fleet');
for (const key of ['radar','lights','wire','top']) $(key).onclick=()=>{
  state[key]=!state[key]; $(key).setAttribute('aria-pressed',String(state[key]));
  if (key==='radar') $('radar').textContent=state.radar?'מכ״ם מסתובב':'מכ״ם מושהה';
  if (key==='lights') $('lights').textContent=state.lights?'אורות דולקים':'אורות כבויים';
  if (key==='top') elevation=state.top?1.49:.78;
  applyRig(); frameCamera(); render();
};
for (const key of ['yaw','pitch']) $(key).oninput=()=>{
  state[key]=Number($(key).value); $(key+'-value').textContent=state[key]+'°'; applyRig(); render();
};
let drag;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  if (!drag) return;
  azimuth-=(e.clientX-drag.x)*.008;
  elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.007,.23,1.49);
  drag={x:e.clientX,y:e.clientY}; state.top=false; $('top').setAttribute('aria-pressed','false'); frameCamera(); render();
});
canvas.addEventListener('pointerup',()=>{drag=null;});
canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.65,1.8);frameCamera();render();},{passive:false});
new ResizeObserver(frameCamera).observe(canvas.parentElement);

async function init() {
  try {
    const response=await fetch('./manifest.json');
    if (!response.ok) throw new Error('manifest '+response.status);
    manifest=await response.json();
    const loader=new GLTFLoader();
    await Promise.all(manifest.models.map(async model=>{
      const gltf=await loader.loadAsync(model.file);
      const root=gltf.scene;
      root.name=model.id; root.visible=false;
      const mixer=new THREE.AnimationMixer(root);
      mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'radar_spin')).play();
      const rest=new Map(); root.traverse(n=>rest.set(n.name,n.quaternion.clone()));
      fleet.add(root); records.set(model.id,{root,mixer,rest,model});
    }));
    for (const spec of manifest.ships) {
      const button=document.createElement('button');button.textContent=spec.labelHe;
      button.dataset.ship=spec.id;button.onclick=()=>setView(spec.id);$('ships').append(button);
    }
    for (const control of document.querySelectorAll('button,input')) control.disabled = false;
    if (!manifest.ships.some(s=>s.id===state.view)) state.view='fleet';
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) { state.radar=false; $('radar').setAttribute('aria-pressed','false');$('radar').textContent='מכ״ם מושהה'; }
    refresh(); $('status').hidden=true;
    window.__fleet={state,records,manifest,camera,renderer,step,setTeam,setView,render};
    window.__fleetReady=true;
    requestAnimationFrame(function tick(now){
      const dt=Math.min((now-last)/1000,.05);last=now;
      if (!testMode && !document.hidden) step(dt);
      requestAnimationFrame(tick);
    });
  } catch(error) {
    $('status').textContent='הטעינה נכשלה. יש לפתוח את התצוגה דרך שרת HTTP מקומי.';
    window.__fleetError=String(error); console.error(error);
  }
}
init();

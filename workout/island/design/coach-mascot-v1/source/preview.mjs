import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const animations = [
  ['stand','עומדים בנחת'],['wave','מנופפים לשלום'],['point_right','מצביעים ימינה'],['point_left','מצביעים שמאלה'],['point_up','מצביעים למעלה'],['point_down','מצביעים למטה'],['fist_pump','מכווצים אגרוף'],['clap','מוחאים כפיים'],['joy_jump','קופצים משמחה'],['shrug','כתפיים מורמות'],['nod','מהנהנים'],['shake_head','מנידים בראש'],['air_hug','חיבוק באוויר'],['go_there','ניגשים לשם'],['well_done','כל הכבוד'],['try_again','עוד פעם'],['ready','מוכנים להתחיל'],['rest_idle','נחים קצת']
];
const expressions = [
  ['auto','לפי התנועה'],
  ['happy','שמח'],['surprised','מופתע'],['encouraging','מעודד'],['thoughtful','חושב'],['proud','גאה'],['gently_disappointed','קצת מאוכזב'],['laughing','צוחק'],['wink','קורץ']
];
const $ = id => document.getElementById(id);
const select = $('animation'), faceBox = $('expressions'), scrub = $('scrub');
for (const [name,label] of animations) select.add(new Option(label,name));
for (const [name,label] of expressions) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.expression = name;
  b.setAttribute('aria-pressed',String(name === 'auto')); faceBox.append(b);
}
const state = { ready:false, animation:'stand', expression:'auto', playing:true, camera:'front', duration:0, time:0, error:null };
let renderer, camera, scene, model, mixer, clips = new Map(), action, meshes = [], rafTime = 0, introTimer = null;
let cameraTarget = new THREE.Vector3(0,1,0), cameraDistance = 5;
const clockText = n => `0:${String(Math.floor(Math.max(0,n))).padStart(2,'0')}`;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function setPlaying(value) {
  state.playing = Boolean(value);
  $('play').classList.toggle('paused', !state.playing);
  $('play').setAttribute('aria-label',state.playing ? 'השהיית התנועה' : 'המשך התנועה');
  $('play').title = state.playing ? 'השהיה' : 'המשך';
}
function endIntro() { clearTimeout(introTimer); introTimer = null; $('skip').hidden = true; $('intro').hidden = false; }
function setAnimation(name, time) {
  if (!clips.has(name) || !mixer) return false;
  const clip = clips.get(name);
  mixer.stopAllAction(); action = mixer.clipAction(clip); action.reset(); action.setLoop(THREE.LoopRepeat,Infinity); action.play();
  state.animation = name; state.duration = clip.duration; select.value = name; $('duration').textContent = clockText(clip.duration);
  if (Number.isFinite(time)) { action.time = Math.max(0,Math.min(time,clip.duration)); setPlaying(false); }
  else setPlaying(true);
  mixer.update(0); applyExpression(); updateTimeline(); render(); return true;
}
function applyExpression() {
  if (state.expression === 'auto') return;
  for (const mesh of meshes) for (const [key,index] of Object.entries(mesh.morphTargetDictionary || {})) {
    if (expressions.some(item => item[0] === key)) mesh.morphTargetInfluences[index] = key === state.expression ? 1 : 0;
  }
}
function setExpression(name) {
  if (!expressions.some(item => item[0] === name)) return false;
  state.expression = name;
  if (name === 'auto' && mixer) {
    for (const mesh of meshes) if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
    mixer.update(0);
  } else applyExpression();
  for (const b of faceBox.children) b.setAttribute('aria-pressed', String(b.dataset.expression === name));
  render(); return true;
}
function setCamera(view) {
  state.camera = view === 'side' ? 'side' : 'front';
  $('front').setAttribute('aria-pressed',String(state.camera === 'front')); $('side').setAttribute('aria-pressed',String(state.camera === 'side'));
  resize();
}
function updateTimeline() {
  state.time = action ? action.time : 0;
  scrub.value = state.duration ? String(Math.round(state.time / state.duration * 1000)) : '0';
  $('current').textContent = clockText(state.time);
}
function render() { if (renderer && scene && camera) renderer.render(scene,camera); }
function resize() {
  if (!renderer || !camera) return;
  const canvas = $('canvas'), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w,h,false);
  camera.aspect = w/h;
  const distance = Math.max(cameraDistance,cameraDistance / camera.aspect * 0.78);
  if (state.camera === 'side') camera.position.set(distance,cameraTarget.y + distance * .07,0);
  else camera.position.set(0,cameraTarget.y + distance * .07,distance);
  camera.lookAt(cameraTarget); camera.updateProjectionMatrix(); render();
}
function tick(t) {
  requestAnimationFrame(tick);
  const dt = rafTime ? Math.min((t-rafTime)/1000,.1) : 0; rafTime = t;
  if (mixer && state.playing) { mixer.update(dt * Number($('speed').value)); applyExpression(); updateTimeline(); }
  render();
}
function runIntro() {
  if (!state.ready) return;
  endIntro(); $('skip').hidden = false; $('intro').hidden = true;
  const steps = [
    ['wave','happy','היי! איזה כיף להכיר!',2200],
    ['point_right','encouraging','בואו נגלה את האי יחד!',2000],
    ['fist_pump','proud','כל צעד קטן הוא הצלחה!',2000],
    ['stand','happy','מוכנים לבחור תנועה?',0]
  ];
  let i = 0;
  const next = () => { const [anim,face,text,delay] = steps[i++]; setAnimation(anim); setExpression(face); $('speech').textContent = text; if (delay) introTimer = setTimeout(next,delay); else { endIntro(); setExpression('auto'); } };
  next();
}
select.addEventListener('change',() => { endIntro(); setAnimation(select.value); $('speech').textContent = 'קדימה, זזים יחד!'; });
faceBox.addEventListener('click',e => { const b = e.target.closest('button[data-expression]'); if (b) { endIntro(); setExpression(b.dataset.expression); } });
$('play').addEventListener('click',() => { endIntro(); setPlaying(!state.playing); });
scrub.addEventListener('input',() => { if (!action) return; endIntro(); action.time = state.duration * Number(scrub.value)/1000; mixer.update(0); applyExpression(); setPlaying(false); updateTimeline(); render(); });
$('intro').addEventListener('click',runIntro);
$('skip').addEventListener('click',() => { endIntro(); setAnimation('stand'); setExpression('auto'); $('speech').textContent = 'מוכנים לבחור תנועה?'; });
$('front').addEventListener('click',() => setCamera('front')); $('side').addEventListener('click',() => setCamera('side'));
window.addEventListener('resize',resize);
window.__coach = { state, setAnimation:(name,time) => { endIntro(); return setAnimation(name,time); }, setExpression:(name) => { endIntro(); return setExpression(name); }, setCamera, setPlaying, replayIntro:runIntro };

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas:$('canvas'), antialias:true, alpha:true });
    renderer.setClearColor(0x000000,0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(32,1,.01,100);
    scene.add(new THREE.HemisphereLight(0xeafff3,0x92745f,2));
    const key = new THREE.DirectionalLight(0xffeed8,2.2); key.position.set(-3,5,5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xd7fff4,1); fill.position.set(4,3,-3); scene.add(fill);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.48,48),new THREE.MeshBasicMaterial({color:0x457d69,transparent:true,opacity:.20,depthWrite:false}));
    shadow.rotation.x = -Math.PI/2; shadow.position.y = .003; scene.add(shadow);
    const binary = atob(window.__COACH_GLB_BASE64__), bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
    const modelDownload = document.querySelector('a[href="coach.glb"]');
    modelDownload.href = URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
    modelDownload.download = 'coach.glb';
    const gltf = await new Promise((resolve,reject) => new GLTFLoader().parse(bytes.buffer,'',resolve,reject));
    model = gltf.scene; scene.add(model); model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) meshes.push(o); });
    clips = new Map(gltf.animations.map(clip => [clip.name,clip])); mixer = new THREE.AnimationMixer(model);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    cameraTarget.set(center.x,center.y,center.z); cameraDistance = Math.max(size.y,1) * 2.25;
    resize(); setAnimation(clips.has('stand') ? 'stand' : gltf.animations[0]?.name); setExpression('auto');
    state.ready = true; $('loading').hidden = true; $('status').textContent = 'מוכן למשחק · פועל ללא חיבור';
    if (reducedMotion) { setPlaying(false); $('speech').textContent = 'היי! מוכנים לזוז וליהנות?'; } else runIntro();
    requestAnimationFrame(tick);
  } catch (err) {
    state.error = String(err); $('loading').textContent = 'לא הצלחנו להציג את המאמן במכשיר הזה.'; $('status').textContent = 'התצוגה לא נטענה'; console.error(err);
  }
}
init();

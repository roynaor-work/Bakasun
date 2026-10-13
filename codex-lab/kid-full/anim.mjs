import * as T from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// IDs and Hebrew wording are copied from the app catalogue/SAY. The viewer
// deliberately has no runtime import from workout/, which is developed separately.
const exercises = [
  { id:'squats', name:'סקוואט', cue:'רגליים קצת פתוחות. יורדים כמו לשבת על כיסא, ידיים קדימה. קמים חזק. הגב ישר. הברכיים פונות לכיוון כפות הרגליים.' },
  { id:'jumping-jacks', name:'פתח-סגור · קפיצות פיסוק', cue:'עומדים ישר, ידיים למטה. קופצים ופותחים: רגליים לצדדים, ידיים למעלה. קופצים וסוגרים. נוחתים בשקט על קצות האצבעות.' },
  { id:'high-knees', name:'ברכיים גבוהות', cue:'רצים במקום. מרימים ברכיים עד הבטן. הידיים עוזרות, כמו בריצה מהירה.' },
  { id:'lunges', name:'מכרעים · ירידה לברך', cue:'עושים צעד גדול קדימה. יורדים עד שהברך של הרגל האחורית כמעט נוגעת ברצפה. קמים ומחליפים רגל. שומרים על גוף זקוף.' },
  { id:'push-ups', name:'שכיבות סמיכה', cue:'ידיים על הרצפה, הגוף ישר כמו קרש. יורדים עד שהחזה קרוב לרצפה. דוחפים חזק למעלה.' },
  { id:'knee-push-ups', name:'שכיבות סמיכה על הברכיים', cue:'ברכיים על הרצפה, ידיים מתחת לכתפיים. יורדים לאט ודוחפים למעלה. הגוף ישר מהברכיים עד הכתפיים.' },
  { id:'glute-bridge', name:'גשר ישבן', cue:'שוכבים על הגב, ברכיים כפופות. מרימים את הטוסיק למעלה, כמו גשר. מחזיקים שנייה ויורדים לאט. שומרים על גב בלי קימור יתר.' },
];
const byId = Object.fromEntries(exercises.map(ex => [ex.id, ex]));
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');
const canvas = document.querySelector('#stage');
const status = document.querySelector('#load-status');
const timeControl = document.querySelector('#time');
const playControl = document.querySelector('#play');
const scene = new T.Scene();
scene.background = new T.Color('#eae7e2');
const camera = new T.OrthographicCamera(-2,2,2,-2,.1,40);
let renderer, root, mixer, action, clips = [], playing = false, frame = 0;
let exercise = 'squats', view = 'front', speed = 1, time = 0, modelTriangles = 0;
let lastFrame = 0, frameWindow = [], fps = null, lastUI = 0;
const bounds = new Map();
const skeletons = new Set();
const sizeVector = new T.Vector3(), centerVector = new T.Vector3();
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');

function updateModel() {
  root.updateMatrixWorld(true);
  for (const skeleton of skeletons) skeleton.update();
}
function render() {
  if (!root || !renderer) return;
  updateModel();
  renderer.render(scene,camera);
}
function frameCamera() {
  const box = bounds.get(exercise);
  if (!box || !renderer) return;
  box.getSize(sizeVector);box.getCenter(centerVector);
  const { width,height } = canvas.getBoundingClientRect();
  const aspect = width / Math.max(height,1);
  const horizontal = view === 'front' ? sizeVector.x : sizeVector.z;
  const vertical = Math.max(sizeVector.y*1.20,horizontal*1.25/aspect,1.2);
  camera.left = -vertical*aspect/2;camera.right = vertical*aspect/2;
  camera.top = vertical/2;camera.bottom = -vertical/2;
  // A small elevation keeps the local floor grid visible while preserving the
  // anatomical front/side views. The camera is fixed for the complete cycle.
  if (view === 'front') camera.position.set(centerVector.x,centerVector.y+.36,centerVector.z+9);
  else camera.position.set(centerVector.x-9,centerVector.y+.36,centerVector.z);
  camera.lookAt(centerVector);camera.updateProjectionMatrix();
}
function resize() {
  if (!renderer) return;
  const { width,height } = canvas.getBoundingClientRect();
  // Same explicit .6 phone-buffer compromise as the delivered kid-full lab.
  // Larger views cap the buffer dimension; CSS size and the model stay intact.
  const renderScale = capture || params.get('resolution') === 'full' ? 1 : Math.min(.6,720/Math.max(width,height));
  renderer.setPixelRatio(renderScale);
  renderer.setSize(Math.max(1,width),Math.max(1,height),false);
  frameCamera();render();
}
function metrics() {
  const rect = canvas.getBoundingClientRect();
  return { modelTriangles, renderTriangles:renderer?.info.render.triangles ?? 0,
    renderCalls:renderer?.info.render.calls ?? 0, fps, fpsSampleFrames:frameWindow.length,
    playing, exercise, view, speed, time, duration:action?.getClip().duration ?? 0,
    bones:root ? new Set([...skeletons].flatMap(s=>s.bones)).size : 0,
    viewport:{cssWidth:rect.width,cssHeight:rect.height,width:canvas.width,height:canvas.height,
      renderScale:renderer?.getPixelRatio() ?? 0,dpr:devicePixelRatio},
    source:'kid-full.glb' };
}
function refreshTime() {
  timeControl.value = String(time);
  document.querySelector('#time-label').textContent = `${time.toFixed(2)} / ${(action?.getClip().duration ?? 0).toFixed(2)} s`;
}
function refreshPlayback() {
  playControl.textContent = playing ? 'השהיה' : 'ניגון';
  playControl.setAttribute('aria-pressed',String(playing));
  document.querySelector('#fps-note').textContent = playing ? 'קצב הציור בפועל' : 'הניגון מושהה';
  document.querySelector('#fps').textContent = playing && fps !== null ? fps.toFixed(1) : '—';
}
function resetFPS() { frameWindow = [];fps = null;lastFrame = 0;lastUI = 0; }
function stop() {
  playing = false;cancelAnimationFrame(frame);frame = 0;
  if (action) action.paused = true;
  refreshPlayback();
}
function clipFor(id) {
  if (!byId[id]) throw new RangeError(`Unknown exercise: ${id}`);
  const clip = clips.find(clip=>clip.name === id);
  if (!clip) throw new Error(`GLB animation is missing: ${id}`);
  return clip;
}
function activate(clip,seconds,loop) {
  mixer.stopAllAction();
  action = mixer.clipAction(clip);
  action.reset().setLoop(loop,Infinity);
  action.clampWhenFinished = loop === T.LoopOnce;
  action.play();action.time = seconds;action.paused = true;
  mixer.update(0);time = seconds;
}
function selectExercise(id) {
  const clip = clipFor(id),resume = playing;
  stop();exercise = id;activate(clip,0,T.LoopOnce);
  document.querySelector('#exercise').value = id;
  document.querySelector('#exercise-title').textContent = byId[id].name;
  document.querySelector('#exercise-cue').textContent = byId[id].cue;
  document.querySelector('#repeat-note').textContent = id === 'high-knees'
    ? 'מחזור ריצה עם שני הצדדים בלולאה. אפשר לעצור ולגרור את הסרגל כדי לבדוק כל רגע בתנועה.'
    : id === 'lunges'
      ? 'מכרע אחד: יורדים ועולים. לאחר החזרה מחליפים רגל. אפשר לעצור ולגרור את הסרגל.'
      : 'חזרה אחת בלולאה. אפשר לעצור ולגרור את הסרגל כדי לבדוק כל רגע בתנועה.';
  canvas.setAttribute('aria-label',`דמות ילד מדגימה ${byId[id].name} בתלת ממד`);
  timeControl.max = String(clip.duration);refreshTime();frameCamera();render();resetFPS();
  if (resume) play();
  return metrics();
}
function sample(id,seconds) {
  if (!Number.isFinite(seconds)) throw new RangeError('Sample time must be finite');
  stop();if (exercise !== id) selectExercise(id);
  const clip = clipFor(id),at = T.MathUtils.clamp(seconds,0,clip.duration);
  activate(clip,at,T.LoopOnce);refreshTime();render();
  return metrics();
}
function setView(id) {
  if (!['front','side'].includes(id)) throw new RangeError(`Unknown view: ${id}`);
  view = id;
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view === id));
  document.querySelector('#view-label').textContent = id === 'front' ? 'מבט מלפנים' : 'מבט מהצד';
  frameCamera();render();resetFPS();
  return metrics();
}
function setSpeed(value) {
  if (![1,.25].includes(value)) throw new RangeError('Speed must be 1 or 0.25');
  speed = value;
  for (const button of document.querySelectorAll('[data-speed]')) button.setAttribute('aria-pressed',String(Number(button.dataset.speed) === value));
  return metrics();
}
function tick(now) {
  if (!playing) return;
  if (lastFrame) {
    const delta = (now-lastFrame)/1000;
    mixer.update(Math.min(delta,.1)*speed);time = action.time;
    frameWindow.push({start:lastFrame,end:now});
    while (frameWindow.length > 1 && frameWindow[0].start < now-1500) frameWindow.shift();
    if (frameWindow.length > 1) fps = frameWindow.length*1000/(now-frameWindow[0].start);
  }
  lastFrame = now;render();
  if (now-lastUI >= 160) {refreshTime();refreshPlayback();lastUI = now;}
  frame = requestAnimationFrame(tick);
}
function play() {
  if (!root || playing) return;
  activate(clipFor(exercise),time % action.getClip().duration,T.LoopRepeat);
  action.paused = false;playing = true;resetFPS();refreshPlayback();
  frame = requestAnimationFrame(tick);
}
function dispose() {
  stop();const geometries = new Set(),materials = new Set(),textures = new Set();
  scene.traverse(object=>{if (!object.isMesh && !object.isLine) return;geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const item of [...geometries,...materials,...textures]) item.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  renderer?.dispose();
}
async function initialize() {
  const full = capture || params.get('resolution') === 'full';
  renderer = new T.WebGLRenderer({canvas,antialias:full,preserveDrawingBuffer:full});
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;renderer.toneMappingExposure = 1;
  scene.add(new T.HemisphereLight('#fff5eb','#9da8be',1));
  for (const [position,color,intensity] of [[[-3,4.5,5],'#fff2e1',3.10],[[3,2,3],'#e3edff',1.35],[[1,3,-4],'#fff5e5',2]]) {
    const light = new T.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);
  }
  // Local floor/contact reference: two floor triangles and a line grid. Neither
  // enters modelTriangles, which counts only meshes in the delivered GLB.
  const floor = new T.Mesh(new T.PlaneGeometry(10,10),new T.MeshBasicMaterial({color:'#e6e4dc'}));
  floor.rotation.x = -Math.PI/2;floor.position.y = -.012;scene.add(floor);
  const grid = new T.GridHelper(8,16,'#bfc9bc','#d1d6c9');
  grid.position.y = -.008;grid.material.transparent = true;grid.material.opacity = .65;scene.add(grid);
  const data = await new GLTFLoader().loadAsync('./kid-full.glb');
  root = data.scene;clips = data.animations;
  for (const item of exercises) clipFor(item.id);
  root.traverse(object=>{
    if (!object.isMesh) return;
    modelTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count)/3;
    if (object.isSkinnedMesh) {skeletons.add(object.skeleton);object.frustumCulled = false;}
  });
  if (modelTriangles > 20000) throw new Error(`Model exceeds triangle budget: ${modelTriangles}`);
  scene.add(root);mixer = new T.AnimationMixer(root);
  // Fit the entire movement once from deformed vertices, never the rest-pose
  // bounding boxes. Keep the camera still while the child demonstrates a rep.
  for (const item of exercises) {
    const clip = clipFor(item.id),box = new T.Box3();
    for (let step = 0;step <= 16;step++) {
      activate(clip,clip.duration*step/16,T.LoopOnce);updateModel();
      box.union(new T.Box3().setFromObject(root,true));
    }
    bounds.set(item.id,box);
  }
  status.hidden = true;
  for (const control of document.querySelectorAll('button,select,input')) control.disabled = false;
  document.querySelector('#triangles').textContent = modelTriangles.toLocaleString('he-IL');
  resize();selectExercise(byId[params.get('exercise')] ? params.get('exercise') : 'squats');
  setView(params.get('view') === 'side' ? 'side' : 'front');
  setSpeed(params.get('speed') === '0.25' ? .25 : 1);
  if (!capture && !params.has('paused') && !reducedMotion.matches) play();
  return window.animLab;
}

window.animLab = {get root(){return root;},get clips(){return clips;},get bounds(){return bounds;},
  get renderer(){return renderer;},scene,camera,selectExercise,sample,setView,setSpeed,play,stop,render,metrics,
  exercises:exercises.map(({id,name})=>({id,name}))};
window.animLab.ready = initialize();
// Keep the readiness rejection visible to browser automation as well as users.
window.animLab.ready.catch(error=>{stop();status.hidden = false;status.classList.add('error');
  status.textContent = `טעינת ההדגמות נכשלה: ${error.message}`;console.error(error);});
document.querySelector('#exercise').addEventListener('change',event=>selectExercise(event.target.value));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click',()=>setView(button.dataset.view));
for (const button of document.querySelectorAll('[data-speed]')) button.addEventListener('click',()=>setSpeed(Number(button.dataset.speed)));
playControl.addEventListener('click',()=>playing ? stop() : play());
timeControl.addEventListener('input',event=>sample(exercise,Number(event.target.value)));
new ResizeObserver(resize).observe(canvas.parentElement);
document.addEventListener('visibilitychange',()=>{if (document.hidden) stop();});
reducedMotion.addEventListener('change',()=>{if (reducedMotion.matches) stop();});
window.addEventListener('pagehide',dispose,{once:true});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stop();status.hidden = false;
  status.classList.add('error');status.textContent = 'תצוגת התלת־ממד נעצרה. יש לרענן את הדף.';});

import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../vendor/DRACOLoader.js';
import {WeaponEffects, WeaponAudio} from './effects.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const names = {cannon:'תותח רגיל', cannon2:'תותח כבד', cannon3:'מרגמה',
  shotgun:'שוטגן רסס', shotgun2:'שוטגן כבד', shotgun3:'שוטגן חיצים'};
const descriptions = {cannon:'פלדה כהה, חגורת נחושת ופיצוץ מדורג',
  cannon2:'פגז רחב, הדף עמוק וענן עשן כבד', cannon3:'פגז בעל סנפירים, מעוף בקשת גבוהה ופגיעת קרקע',
  shotgun:'שמונה כדוריות, ענן מתרחב ופגיעות נפרדות', shotgun2:'כדוריות כבדות, הבזק רחב ומכת רסס',
  shotgun3:'חיצי פלדה קטנים ומטח חד ומהיר'};
const from = new THREE.Vector3(-3.7, .95, .12);
const boarPosition = new THREE.Vector3(2.3, 0, -.3);
const groundHit = new THREE.Vector3(2.55, .015, 1.1);
const direction = new THREE.Vector3(1, 0, 0);
let weapon = params.get('weapon') || 'cannon';
let groundMode = params.get('target') === 'ground';
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let time = 0, running = false, impacted = false, shots = 0, variation = 0;
let flight = null, flightPellets = [], lastTrail = 0, manifest, effects, audio, boar, specimen;
let ground, craterMesh, hitCount = 0, renderFrames = 0;
const templates = {}, resources = new Set();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#91a99a');
scene.fog = new THREE.Fog('#91a99a', 18, 65);
const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
camera.position.set(0, 3.5, 8.8);
camera.lookAt(.25, 1.0, 0);
const renderer = new THREE.WebGLRenderer({canvas:$('scene'), antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const specimenScene = new THREE.Scene();
const specimenCamera = new THREE.PerspectiveCamera(28, 1, .1, 20);
specimenCamera.position.set(.7, .5, 2.5);
specimenCamera.lookAt(0, 0, 0);
const specimenRenderer = new THREE.WebGLRenderer({canvas:$('model'), antialias:true, alpha:true});
specimenRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
specimenRenderer.outputColorSpace = THREE.SRGBColorSpace;
specimenRenderer.toneMapping = THREE.ACESFilmicToneMapping;
specimenRenderer.toneMappingExposure = 1.6;

function light(target) {
  target.add(new THREE.HemisphereLight('#e4f2e5', '#716341', 2.6));
  const sun = new THREE.DirectionalLight('#ffdfb0', 3.4);
  sun.position.set(-3, 7, 5);
  target.add(sun);
  const rim = new THREE.DirectionalLight('#bddbdf', 2.1);
  rim.position.set(3, 2, -3);
  target.add(rim);
}
light(scene); light(specimenScene);
// Metal needs reflections to retain its silhouette, even on mobile PBR.
const envScene = new THREE.Scene();
envScene.background = new THREE.Color('#a6b7b9');
for (const [color, x, y, z, sx, sy] of [
  ['#fff1d1', -3, 4, 3, 6, 4], ['#e1f1ff', 4, 1, 2, 2, 5], ['#394a49', 0, -3, 0, 10, 3]]) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}));
  plane.position.set(x, y, z); plane.lookAt(0, 0, 0); envScene.add(plane);
}
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(envScene, .1);
scene.environment = env.texture;
// PMREM textures cannot be shared across WebGL contexts; create one for each.
const specimenPmrem = new THREE.PMREMGenerator(specimenRenderer);
const specimenEnv = specimenPmrem.fromScene(envScene, .1);
specimenScene.environment = specimenEnv.texture;
envScene.traverse(o => {o.geometry?.dispose(); o.material?.dispose();});

const sandMaterial = new THREE.MeshStandardMaterial({color:'#81734e', roughness:1});
const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), new THREE.MeshStandardMaterial({color:'#5d8e86', roughness:.53, metalness:.12}));
sea.rotation.x = -Math.PI/2; sea.position.set(0, -.28, -13); scene.add(sea);
const sandBase = new THREE.Mesh(new THREE.BoxGeometry(80, .3, 46), sandMaterial);
sandBase.position.set(0, -.4, 17.1); scene.add(sandBase);

function makeGround(hole = false) {
  if (ground) {ground.geometry.dispose(); scene.remove(ground);}
  const shape = new THREE.Shape();
  shape.moveTo(-40, -40); shape.lineTo(40, -40); shape.lineTo(40, 5.9); shape.lineTo(-40, 5.9); shape.closePath();
  if (hole) {
    const path = new THREE.Path();
    path.absarc(groundHit.x, -groundHit.z, .72, 0, Math.PI*2, true);
    shape.holes.push(path);
  }
  ground = new THREE.Mesh(new THREE.ShapeGeometry(shape, 40), sandMaterial);
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);
}
makeGround();
// Quiet range markings and stones: the effects remain the focal point.
const lineMaterial = new THREE.MeshBasicMaterial({color:'#e2dac0', transparent:true, opacity:.35});
for (let i=0; i<6; i++) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(.035, 4), lineMaterial);
  line.rotation.x = -Math.PI/2; line.position.set(-4.4+i*1.5, .004, -.2); scene.add(line);
}
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({color:'#223327', transparent:true, opacity:.17, depthWrite:false}));
shadow.rotation.x = -Math.PI/2; shadow.scale.set(1.25, .62, 1); shadow.position.copy(boarPosition).y=.009; scene.add(shadow);
const targetRing = new THREE.Mesh(new THREE.RingGeometry(.48, .50, 64), new THREE.MeshBasicMaterial({color:'#ebd39c', side:THREE.DoubleSide, transparent:true, opacity:.85}));
targetRing.rotation.x=-Math.PI/2; targetRing.position.copy(groundHit); scene.add(targetRing);
const marker = new THREE.Mesh(new THREE.TorusGeometry(.16, .008, 4, 40), new THREE.MeshBasicMaterial({color:'#e8c380'}));
marker.position.copy(from); marker.rotation.y=Math.PI/2; scene.add(marker);

function resize() {
  const rect = $('stage').getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect=rect.width/rect.height; camera.updateProjectionMatrix();
  const box = $('model').getBoundingClientRect();
  specimenRenderer.setSize(box.width, box.height, false);
  specimenCamera.aspect=box.width/box.height; specimenCamera.updateProjectionMatrix();
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe($('stage'));

function targetPoint() {return groundMode ? groundHit.clone() : boarPosition.clone().add(new THREE.Vector3(-.25, .85, .80));}
function config() {return manifest.weapons[weapon];}
function isCannon() {return weapon.startsWith('cannon');}
function totalTime() {return config().preview.flightSeconds + (isCannon() ? 1.0 : .65);}

function phase() {
  if (!manifest) return;
  const u = config().preview.flightSeconds;
  $('phase').textContent = !running ? 'מוכן לירי' : time < .09 ? 'הבזק לוע' : time < u ?
    (isCannon() ? 'פגז במעוף' : 'ענן כדוריות') : time < u+.5 ?
    (isCannon() ? 'פיצוץ בפגיעה · 8 פריימים' : `פגיעה מרובה · וריאציה ${variation+1}`) : groundMode && isCannon() ? 'מכתש בקרקע' : 'העשן מתפזר';
  $('scrub').value=String(Math.round(time/totalTime()*100));
  $('time').value=`${time.toFixed(2)} ש׳`;
  $('pause').textContent=paused?'המשך':'השהיה';
  $('pause').setAttribute('aria-pressed', String(paused));
}

function reset() {
  effects?.clear(); audio?.stop();
  if (flight) {flight.removeFromParent(); flight=null;}
  flightPellets=[];
  if (craterMesh) {craterMesh.removeFromParent(); craterMesh=null;}
  makeGround();
  if (boar) {boar.position.copy(boarPosition); boar.rotation.z=0;}
  time=0; impacted=false; running=false; lastTrail=0; hitCount=0;
}

function select(key) {
  if (!manifest.weapons[key]) key='cannon';
  reset(); weapon=key;
  for (const button of document.querySelectorAll('[data-weapon]')) button.setAttribute('aria-pressed', String(button.dataset.weapon===key));
  $('weapon-title').textContent=names[key];
  $('weapon-description').textContent=descriptions[key];
  if (specimen) {
    specimen.removeFromParent();
    if (specimen.isSprite) {
      resources.delete(specimen.material.map); resources.delete(specimen.material);
      specimen.material.map.dispose(); specimen.material.dispose();
    }
    specimen=null;
  }
  if (isCannon()) {
    specimen=templates[key].clone(true);
    specimen.rotation.set(.4, 1.15, -.70);
    specimen.scale.setScalar(key==='cannon2'?1.05:1.18);
    $('model-title').textContent=key==='cannon3'?'פגז מרגמה':key==='cannon2'?'פגז כבד':'פגז פלדה';
    $('model-detail').textContent='מתכת כהה · חגורת נחושת';
  } else {
    // Sample an actual pellet frame from the delivered atlas in the viewer.
    const texture = effects.texture.clone(); texture.needsUpdate=true;
    const rect = manifest.atlas.sequences.pellet.frames[config().pelletVariant];
    texture.repeat.set(rect.w/1024, rect.h/2048);
    texture.offset.set(rect.x/1024, 1-(rect.y+rect.h)/2048);
    const material = new THREE.SpriteMaterial({map:texture, transparent:true, depthWrite:false, toneMapped:false});
    resources.add(texture); resources.add(material);
    specimen=new THREE.Sprite(material); specimen.scale.set(1.7, 1.7, 1);
    $('model-title').textContent=key==='shotgun3'?'חיצי פלדה':'כדוריות פלדה';
    $('model-detail').textContent='קליעים קטנים · שובל קצר';
  }
  specimenScene.add(specimen);
  targetRing.visible=groundMode;
  $('target').textContent=groundMode?'מטרה: קרקע':'מטרה: חזיר';
  $('target').setAttribute('aria-pressed', String(groundMode));
  phase();
}

function fire(silent = false) {
  reset(); if (!silent) shots++;
  variation=Math.max(0, shots-1)%4; running=true;
  const cfg=config(), size=cfg.preview.effectScale;
  effects.spawn(scene, cfg.muzzle, from, {scale:isCannon()?1.25:1.5, aspect:isCannon()?1.3:1.85, rotation:0});
  if (isCannon()) {
    effects.spawn(scene, cfg.smoke, from, {scale:1.2*size, rise:.28, grow:.55});
    flight=templates[weapon].clone(true); flight.position.copy(from); scene.add(flight);
    if (!silent) void audio.play(cfg.flightAudio, .19);
  } else {
    effects.spawn(scene, cfg.cloud, from.clone().lerp(targetPoint(), .31), {scale:1.4*size, aspect:2.5, duration:.25});
    for (let i=0; i<cfg.preview.pellets; i++) {
      const end=targetPoint();
      end.y+=(Math.sin(i*2.399)*.32); end.x+=Math.cos(i*2.399)*.22; end.z+=(i%3-1)*.18;
      const sprite=effects.spawn(scene, cfg.pellet, from, {scale:weapon==='shotgun3'?.16:.22,
        aspect:1.8, frame:cfg.pelletVariant, duration:cfg.preview.flightSeconds+.015*i});
      flightPellets.push({sprite, end, duration:cfg.preview.flightSeconds+.003*i});
    }
  }
  if (!silent) void audio.play(cfg.fireAudio, .5);
  phase();
}

function impact(silent) {
  impacted=true; hitCount=isCannon()?1:config().preview.pellets;
  const cfg=config(), point=targetPoint(), size=cfg.preview.effectScale;
  if (isCannon()) {
    flight?.removeFromParent(); flight=null;
    effects.spawn(scene, cfg.explosion, point, {scale:2.9*size});
    effects.spawn(scene, cfg.smoke, point.clone().add(new THREE.Vector3(0, .28, 0)), {scale:2*size, rise:.45, grow:.5, opacity:.8});
    if (groundMode) {
      makeGround(true);
      craterMesh=templates.crater.clone(true); craterMesh.position.set(groundHit.x, 0, groundHit.z);
      craterMesh.scale.set(.74, 1.2, .74); scene.add(craterMesh);
    }
    if (!silent) void audio.play(cfg.impactAudio, .42);
  } else {
    effects.spawn(scene, cfg.impactVariations[variation], point, {scale:1.8*size});
    if (!silent) void audio.play(cfg.impactAudioVariations[variation], .42);
  }
}

function advance(dt, silent = false) {
  if (!running) return;
  time=Math.min(totalTime(), time+dt);
  effects.update(dt);
  const cfg=config(), u=Math.min(1, time/cfg.preview.flightSeconds);
  if (isCannon() && flight) {
    const end=targetPoint(), height=cfg.preview.arcHeight;
    flight.position.copy(from).lerp(end, u); flight.position.y+=4*height*u*(1-u);
    direction.copy(end).sub(from); direction.y+=4*height*(1-2*u);
    flight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    flight.rotateZ(time*(weapon==='cannon3'?0:12));
    if (time-lastTrail>.042 && u<1) {
      effects.spawn(scene, cfg.trail, flight.position.clone(), {scale:.52, aspect:1.8, opacity:.6, rise:.08, grow:.4, duration:.34});
      lastTrail=time;
    }
  }
  for (const pellet of flightPellets) {
    pellet.sprite.position.copy(from).lerp(pellet.end, Math.min(1, time/pellet.duration));
    if (time>=pellet.duration) pellet.sprite.visible=false;
  }
  if (!impacted && u>=1) impact(silent);
  if (impacted && boar && !groundMode) {
    const age=time-cfg.preview.flightSeconds;
    boar.position.x=boarPosition.x+Math.sin(age*26)*Math.exp(-age*9)*.13;
    boar.rotation.z=Math.sin(age*28)*Math.exp(-age*9)*.06;
  }
  phase();
}

function seek(seconds) {
  fire(true);
  const end=Math.max(0, Math.min(totalTime(), seconds));
  // Rebuild from fixed steps, preserving correct sequence overlap at any time.
  while (time+1/120<end) advance(1/120, true);
  if (end>time) advance(end-time, true);
  paused=true;
  phase(); render();
}

function render() {
  renderer.render(scene, camera);
  specimenRenderer.render(specimenScene, specimenCamera);
  renderFrames++;
}

let previous=performance.now(), animationId;
function animate(now) {
  const dt=Math.min(.05, (now-previous)/1000); previous=now;
  if (!document.hidden && !paused) {
    if (specimen?.isGroup || specimen?.type==='Object3D') specimen.rotation.y+=dt*.32;
    advance(dt);
  }
  if (!document.hidden) render();
  animationId=requestAnimationFrame(animate);
}

try {
  const response=await fetch(new URL('./manifest.json', import.meta.url));
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
  manifest=await response.json();
  if (!manifest.weapons[weapon]) weapon='cannon';
  const draco=new DRACOLoader();
  draco.setDecoderPath(new URL('../../vendor/draco/', import.meta.url).href);
  const loader=new GLTFLoader().setDRACOLoader(draco);
  const [texture, ...loaded]=await Promise.all([
    new THREE.TextureLoader().loadAsync(new URL(manifest.atlas.file, import.meta.url).href),
    ...Object.entries(manifest.models).map(async ([key, model]) => [key, (await loader.loadAsync(new URL(model.file, import.meta.url).href)).scene]),
  ]);
  for (const [key, model] of loaded) templates[key]=model;
  effects=new WeaponEffects(THREE, manifest, texture);
  audio=new WeaponAudio(manifest);
  // Context model is an existing read-only asset. It is not part of this pack.
  const target=await loader.loadAsync(new URL('../defense-v7/models/boar-amber-lod1.glb', import.meta.url).href);
  draco.dispose();
  boar=target.scene;
  const bounds=new THREE.Box3().setFromObject(boar), size=bounds.getSize(new THREE.Vector3());
  boar.scale.setScalar(1.65/size.y);
  boar.rotation.y=-Math.PI/2;
  const offset=new THREE.Box3().setFromObject(boar);
  boar.children.forEach(child => {child.position.y-=offset.min.y/boar.scale.y;});
  boar.position.copy(boarPosition); scene.add(boar);
  select(weapon); resize(); render();
  $('fire').disabled=false;
  $('fire').addEventListener('click', () => {paused=false; fire();});
  $('scene').addEventListener('click', () => {paused=false; fire();});
  $('scene').addEventListener('keydown', e => {if (e.code==='Space'||e.code==='Enter') {e.preventDefault(); paused=false; fire();}});
  for (const button of document.querySelectorAll('[data-weapon]')) button.addEventListener('click', () => select(button.dataset.weapon));
  $('target').addEventListener('click', () => {groundMode=!groundMode; select(weapon);});
  $('sound').addEventListener('click', () => {
    audio.enabled=!audio.enabled;
    if (!audio.enabled) audio.stop();
    $('sound').textContent=audio.enabled?'צליל: פועל':'צליל: כבוי';
    $('sound').setAttribute('aria-pressed', String(audio.enabled));
    if (audio.enabled) void audio.play(config().fireAudio, .35);
  });
  $('pause').addEventListener('click', () => {paused=!paused; if (paused) audio.stop(); phase();});
  $('scrub').addEventListener('input', () => seek(Number($('scrub').value)/100*totalTime()));
  document.addEventListener('visibilitychange', () => {if (document.hidden) {audio.stop(); paused=true; phase();}});
  window.__weaponsPreview={
    get ready(){return true;}, manifest, select,
    fire(){paused=false; fire();}, seek,
    target(value){groundMode=value==='ground'; select(weapon);},
    get state(){return {weapon, groundMode, paused, running, time, impacted, hitCount, variation,
      activeEffects:effects.active.length, shellVisible:!!flight, craterVisible:!!craterMesh,
      shellNDC:flight?flight.position.clone().project(camera).toArray():null,
      audioVoices:audio.voices.size, lastCodec:audio.lastCodec, audioError:audio.lastError,
      renderFrames, viewport:[$('lab').clientWidth, $('lab').clientHeight]};},
    playClip(key, codec){audio.enabled=true; return audio.play(key, .15, codec);},
    stopAudio(){audio.enabled=false; audio.stop();},
    dispose(){cancelAnimationFrame(animationId); resizeObserver.disconnect(); effects.dispose(); audio.stop();
      for (const resource of resources) resource.dispose();
      scene.traverse(o=>{o.geometry?.dispose(); if (o.material) for (const m of [].concat(o.material)) m.dispose();});
      for (const model of Object.values(templates)) model.traverse(o=>{o.geometry?.dispose(); o.material?.dispose();});
      env.dispose(); specimenEnv.dispose(); pmrem.dispose(); specimenPmrem.dispose();
      renderer.dispose(); specimenRenderer.dispose();},
  };
  if (params.has('at')) seek(Number(params.get('at')));
  animationId=requestAnimationFrame(animate);
} catch (error) {
  console.error(error);
  $('phase').textContent='טעינת הנכסים נכשלה';
  $('error').hidden=false;
  $('error').textContent=`לא ניתן לטעון את התצוגה: ${error.message}. יש לפתוח דרך שרת HTTP משורש הריפו.`;
}

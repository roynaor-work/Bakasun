import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../viewer/draco/DRACOLoader.js';
import {clone} from '../../vendor/SkeletonUtils.js';
import {BroadcastCamera, AdaptiveQuality} from './camera-rig.mjs';
import {MobilePost} from './mobile-post.mjs';

const $ = id => document.getElementById(id), stage = $('stage'), canvas = $('canvas');
const params = new URLSearchParams(location.search);
const state = {sport: params.get('sport') === 'basketball' ? 'basketball' : 'soccer', mode: 'broadcast', playing: !params.has('still'), elapsed: 0, replay: null, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, hidden: false, contextLost: false, disposed: false};
const errors = [], actors = [], history = [], stages = {}, resources = new Set();
let config, qualityConfig, rig, post, quality, spectator, ball, blobShadows, geometry, readyComplete = false, crowdTimeUniform;
const surfaces = {};
let lastNow = performance.now(), lastDraw = 0, nextHistory = 0, fpsWindow = [], frames = 0, stats = {}, sportGeneration = 0;
const renderer = new T.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false});
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.info.autoReset = false;
const scene = new T.Scene(); scene.background = new T.Color('#17232e'); scene.fog = new T.Fog('#182b38', 95, 220);
const camera = new T.PerspectiveCamera(48, 1, .12, 240);
scene.add(new T.HemisphereLight('#dbeaff', '#6b7052', 1.1));
const key = new T.DirectionalLight('#ffecd9', 1.8); key.position.set(-18, 38, 15); key.castShadow = true;
key.shadow.camera.left = key.shadow.camera.bottom = -21; key.shadow.camera.right = key.shadow.camera.top = 21;
key.shadow.camera.near = .5; key.shadow.camera.far = 85; key.shadow.normalBias = .025; key.shadow.bias = -.0002; key.shadow.radius = 2;
scene.add(key); scene.add(key.target);
const fill = new T.DirectionalLight('#aac9ed', .65); fill.position.set(30, 16, -28); scene.add(fill);
const rim = new T.DirectionalLight('#daeeff', .9); rim.position.set(-25, 15, -30); scene.add(rim);

// Small generated PBR light environment, baked ONCE. No runtime cubemap captures.
let environment;
function buildEnvironment() {
const lightBox = new T.Scene(); lightBox.background = new T.Color('#344358');
for (let i = 0; i < 4; i++) {
  const panel = new T.Mesh(new T.PlaneGeometry(12, 3), new T.MeshBasicMaterial({color: i % 2 ? '#9fbdd4' : '#fff1db', side: T.DoubleSide}));
  panel.position.set(Math.cos(i * Math.PI / 2) * 12, 7, Math.sin(i * Math.PI / 2) * 12); panel.lookAt(0, 0, 0); lightBox.add(panel);
}
const pmrem = new T.PMREMGenerator(renderer); environment?.dispose(); environment = pmrem.fromScene(lightBox, .04, .1, 60);
scene.environment = environment.texture; pmrem.dispose(); lightBox.traverse(o => {o.geometry?.dispose(); o.material?.dispose();});
}
buildEnvironment();
const decoder = new DRACOLoader().setDecoderPath(new URL('../viewer/draco/', import.meta.url).href).setWorkerLimit(1);
const loader = new GLTFLoader().setDRACOLoader(decoder);
const actorGroup = new T.Group(); scene.add(actorGroup);
const vec = a => new T.Vector3(...a);

function pressed(selector, key, value) { document.querySelectorAll(selector).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === value))); }
function fail(error) { errors.push(String(error?.message || error)); console.error(error); $('loading').hidden = true; $('error').hidden = false; $('error').textContent = 'התצוגה לא נטענה. רעננו את הדף דרך שרת HTTP מקומי.'; }
function surfaceY() { return config.sports[state.sport].field.surfaceY; }
function makeTeamMaterial(source, team) {
  const mat = source.clone(); mat.roughness = .7; mat.envMapIntensity = .6; mat.vertexColors = false;
  mat.onBeforeCompile = shader => {
    shader.uniforms.kitColor = {value: new T.Color(team ? '#31afbd' : '#eca74e')};
    shader.fragmentShader = 'uniform vec3 kitColor;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float kitMask=clamp((1.-diffuseColor.a)*2.,0.,1.);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*kitColor*1.6,kitMask);diffuseColor.a=1.;`);
  };
  mat.customProgramCacheKey = () => 'broadcast-kit-atlas-v1'; resources.add(mat); return mat;
}
function makeActors(low, high) {
  const teamMaterials = [0, 1].map(team => makeTeamMaterial(low.scene.getObjectByProperty('isMesh', true).material, team));
  for (let i = 0; i < 12; i++) {
    const group = new T.Group(); actorGroup.add(group); const actor = {group, variants: [], active: 1, index: i, team: i < 6 ? 0 : 1};
    for (const asset of [high, low]) {
      const model = clone(asset.scene); model.traverse(o => {if (o.isMesh) {o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.material = teamMaterials[actor.team];}});
      const mixer = new T.AnimationMixer(model); const clips = asset.animations;
      const idle = clips.find(c => c.name.toLowerCase().includes('idle')) || clips[0];
      const run = clips.find(c => c.name.toLowerCase() === 'run') || idle;
      if (!idle || !run) throw Error('Fixture animation missing');
      const idleAction = mixer.clipAction(idle).play(), runAction = mixer.clipAction(run).play();
      idleAction.setEffectiveWeight(.25); runAction.setEffectiveWeight(.75);
      group.add(model); actor.variants.push({model, mixer, idleAction, runAction});
    }
    actors.push(actor);
  }
}

// Analytic rehearsal paths, combined with the existing motion-capture-derived
// skeletal clips. This is a camera fixture, with no match AI or game state.
function sample(time, sport = state.sport) {
  const soccer = sport === 'soccer';
  const positions = [], angles = [], mix = [];
  const base = soccer ? [[0,-1],[-6,-5],[6,-5],[-8,2],[8,3],[0,-11],[1,4],[-5,7],[5,8],[-8,10],[8,12],[0,15]] : [[0,-2],[-4,-5],[4,-5],[-5,1],[5,2],[-2,5],[1,1],[-4,4],[4,5],[-5,7],[5,8],[1,9]];
  for (let i = 0; i < 12; i++) {
    const phase = time * .34 + i * .62;
    const amp = soccer ? 1.1 : .62;
    const x = base[i][0] * (soccer ? .85 : 1) + Math.sin(phase) * amp;
    const z = base[i][1] * (soccer ? .85 : 1) + Math.sin(time * .42 + i * .55) * amp * 1.2;
    positions.push([x, surfaceY(), z]); angles.push(Math.atan2(Math.cos(phase) * .34, Math.cos(time * .42 + i * .55) * .5));
    mix.push(.15 + .65 * Math.pow(Math.sin(time * .32 + i * .3), 2));
  }
  const hero = positions[0], ballPos = soccer ? [hero[0] + .5, surfaceY() + .12, hero[2] + .75] : [hero[0] + .45, surfaceY() + .18 + Math.abs(Math.sin(time * 4.6)) * .85, hero[2] + .45];
  return {time, positions, angles, mix, ball: ballPos};
}
function storeHistory(frame) {
  history.push(frame); const min = frame.time - config.replay.historySeconds;
  while (history.length > 2 && history[1].time < min) history.shift();
}
function seedHistory() {history.length = 0; for (let i = -Math.ceil(config.replay.historySeconds * config.replay.sampleRateHz); i <= 0; i++) storeHistory(sample(state.elapsed + i / config.replay.sampleRateHz)); nextHistory = state.elapsed + 1 / config.replay.sampleRateHz;}
function replaySample() {
  const replay = state.replay, list = replay.frames, time = T.MathUtils.lerp(list[0].time, list.at(-1).time, replay.progress);
  let i = Math.min(list.length - 2, Math.max(0, Math.floor((list.length - 1) * replay.progress)));
  while (i < list.length - 2 && list[i + 1].time < time) i++;
  while (i > 0 && list[i].time > time) i--;
  const a = list[i], b = list[i + 1], u = T.MathUtils.clamp((time - a.time) / (b.time - a.time || 1), 0, 1);
  return {time, positions: a.positions.map((p, j) => p.map((n, k) => T.MathUtils.lerp(n, b.positions[j][k], u))),
    angles: a.angles.map((n, j) => n + Math.atan2(Math.sin(b.angles[j] - n), Math.cos(b.angles[j] - n)) * u),
    mix: a.mix.map((n, j) => T.MathUtils.lerp(n, b.mix[j], u)), ball: a.ball.map((n, k) => T.MathUtils.lerp(n, b.ball[k], u))};
}
function updateActors(frame) {
  const tier = qualityConfig.tiers[quality.tier];
  for (const a of actors) {
    a.group.position.fromArray(frame.positions[a.index]); a.group.rotation.y = frame.angles[a.index];
    const high = tier.lod0Distance > 0 && camera.position.distanceTo(a.group.position) < tier.lod0Distance;
    a.active = high ? 0 : 1;
    a.variants.forEach((variant, index) => {
      variant.model.visible = index === a.active;
      if (index !== a.active) return;
      const weight = frame.mix[a.index]; variant.idleAction.setEffectiveWeight(1 - weight); variant.runAction.setEffectiveWeight(weight);
      variant.mixer.setTime(frame.time * .7 + a.index * .17);
    });
    const dummy = new T.Object3D(); dummy.position.copy(a.group.position); dummy.position.y += .015; dummy.rotation.x = -Math.PI / 2; dummy.scale.set(1, .65, 1); dummy.updateMatrix(); blobShadows.setMatrixAt(a.index, dummy.matrix);
  }
  blobShadows.instanceMatrix.needsUpdate = true; ball.position.fromArray(frame.ball); ball.rotation.set(frame.time * .8, 0, frame.time * .4);
}

function buildCrowd(asset) {
  const object = asset.scene.getObjectByProperty('isMesh', true), g = object.geometry.clone();
  // Bake its local transform once. Use the same albedo atlas, one material/draw.
  object.updateWorldMatrix(true, false); g.applyMatrix4(object.matrixWorld);
  const material = object.material.clone(); material.roughness = .85; material.envMapIntensity = .15; material.normalMap = null;
  material.onBeforeCompile = shader => {
    crowdTimeUniform = {value: 0}; shader.uniforms.crowdTime = crowdTimeUniform;
    shader.vertexShader = 'attribute float phase; uniform float crowdTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x+=sin(crowdTime*1.3+phase)*.035*smoothstep(.6,1.8,position.y);');
  };
  material.customProgramCacheKey = () => 'broadcast-instanced-crowd';
  const phase = new Float32Array(288); for (let i = 0; i < phase.length; i++) phase[i] = i * 2.399;
  g.setAttribute('phase', new T.InstancedBufferAttribute(phase, 1));
  spectator = new T.InstancedMesh(g, material, 288); spectator.castShadow = false; spectator.frustumCulled = false; scene.add(spectator); resources.add(g); resources.add(material);
}
function placeCrowd() {
  if (!spectator) return;
  const soccer = state.sport === 'soccer', dummy = new T.Object3D(), color = new T.Color();
  for (let i = 0; i < 288; i++) {
    // Interleave sides/rows so every quality tier keeps an occupied stadium.
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 72), col = Math.floor(i / 2) % 36;
    dummy.position.set(side * (soccer ? 38 + row * 2.4 : 10 + row * 1.25), soccer ? 1.2 + row * 1.25 : 1 + row * .85, (col - 17.5) * (soccer ? 2.1 : .8));
    dummy.rotation.y = -side * Math.PI / 2; dummy.scale.setScalar(.87 + (i % 7) * .025); dummy.updateMatrix(); spectator.setMatrixAt(i, dummy.matrix);
    color.setHSL((i * .137) % 1, .16, .55 + (i % 4) * .06); spectator.setColorAt(i, color);
  }
  spectator.instanceMatrix.needsUpdate = true; spectator.instanceColor.needsUpdate = true;
}
function createBall() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'); ctx.fillStyle = state.sport === 'soccer' ? '#e5e9e1' : '#b96524'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = state.sport === 'soccer' ? '#1c2630' : '#3b281a'; ctx.lineWidth = state.sport === 'soccer' ? 2 : 5;
  for (let i = 0; i < 8; i++) {ctx.beginPath(); ctx.moveTo(i * 36, 0); ctx.bezierCurveTo(i * 36 - 25, 85, i * 36 + 25, 170, i * 36, 256); ctx.stroke();}
  for (let i = 1; i < 4; i++) {ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();}
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
  if (!ball) {ball = new T.Mesh(new T.SphereGeometry(.12, 16, 10), new T.MeshStandardMaterial({roughness: .62})); ball.castShadow = true; scene.add(ball);}
  ball.material.map?.dispose(); ball.material.map = tex; ball.material.needsUpdate = true;
}
function createContactShadows() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const ctx = cv.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gradient.addColorStop(0, '#00000066'); gradient.addColorStop(1, '#00000000'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(cv); blobShadows = new T.InstancedMesh(new T.PlaneGeometry(.95, .95), new T.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}), 12); blobShadows.frustumCulled = false; scene.add(blobShadows);
}
function buildSurfaces() {
  for (const sport of ['soccer', 'basketball']) {
    const width = sport === 'soccer' ? 68 : 15, length = sport === 'soccer' ? 105 : 28;
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const ctx = cv.getContext('2d');
    const sx = 1024 / width, sy = 1024 / length;
    if (sport === 'basketball') {
      // Deterministic parquet, metre-scaled grain, clear coat supplied by PBR.
      ctx.fillStyle = '#b48a52'; ctx.fillRect(0, 0, 1024, 1024);
      let seed = 17; const random = () => {seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296;};
      for (let row = 0; row < 44; row++) {
        for (let col = -1; col < 8; col++) {
          const x = col * 160 + (row % 2) * 80, y = row * 24;
          const light = 49 + random() * 13; ctx.fillStyle = `hsl(33,42%,${light}%)`; ctx.fillRect(x, y, 159, 23);
          ctx.strokeStyle = '#624c2730'; ctx.lineWidth = .6;
          for (let grain = 0; grain < 6; grain++) {ctx.beginPath(); ctx.moveTo(x, y + grain * 4 + 1); ctx.bezierCurveTo(x + 45, y + grain * 4 + random() * 2, x + 110, y + grain * 4 + 2, x + 159, y + grain * 4 + 1); ctx.stroke();}
        }
      }
      ctx.fillStyle = '#173e54'; ctx.fillRect((width / 2 - 2.45) * sx, 0, 4.9 * sx, 5.8 * sy); ctx.fillRect((width / 2 - 2.45) * sx, (length - 5.8) * sy, 4.9 * sx, 5.8 * sy);
    }
    ctx.save(); ctx.translate(512, 512); ctx.scale(sx, sy); ctx.strokeStyle = sport === 'soccer' ? '#edf0e0' : '#f1e9d7'; ctx.lineWidth = sport === 'soccer' ? .16 : .065;
    const line = (a, b) => {ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();};
    const circle = (x, y, r) => {ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();};
    ctx.strokeRect(-width / 2 + .12, -length / 2 + .12, width - .24, length - .24); line([-width / 2, 0], [width / 2, 0]); circle(0, 0, sport === 'soccer' ? 9.15 : 1.8);
    for (const end of [-1, 1]) {
      const baseline = end * length / 2;
      if (sport === 'soccer') {
        const y = end > 0 ? baseline - 16.5 : baseline;
        ctx.strokeRect(-20.16, y, 40.32, 16.5); ctx.strokeRect(-9.16, end > 0 ? baseline - 5.5 : baseline, 18.32, 5.5);
        circle(0, baseline - end * 11, .13);
      } else {
        ctx.strokeRect(-2.45, end > 0 ? baseline - 5.8 : baseline, 4.9, 5.8); circle(0, baseline - end * 5.8, 1.8);
        const hoopZ = baseline - end * 1.575;
        ctx.beginPath(); ctx.arc(0, hoopZ, 6.75, end > 0 ? Math.PI : 0, end > 0 ? Math.PI * 2 : Math.PI); ctx.stroke();
      }
    }
    ctx.restore(); const texture = new T.CanvasTexture(cv); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    let material;
    if (sport === 'soccer') material = new T.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false});
    else {
      const normalCanvas = document.createElement('canvas'); normalCanvas.width = normalCanvas.height = 256; const nctx = normalCanvas.getContext('2d'); nctx.fillStyle = '#8080ff'; nctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 2) {nctx.fillStyle = y % 4 ? '#7c80ff' : '#8480ff'; nctx.fillRect(0, y, 256, 1);}
      const normal = new T.CanvasTexture(normalCanvas); normal.wrapS = normal.wrapT = T.RepeatWrapping; normal.repeat.set(4, 7);
      material = new T.MeshStandardMaterial({map: texture, normalMap: normal, normalScale: new T.Vector2(.1, .1), roughness: .33, metalness: .08, envMapIntensity: 1.1});
    }
    const mesh = new T.Mesh(new T.PlaneGeometry(width, length), material); mesh.rotation.x = -Math.PI / 2; mesh.position.y = sport === 'soccer' ? .079 : .04;
    mesh.receiveShadow = sport === 'basketball'; scene.add(mesh); surfaces[sport] = mesh;
  }
}
function resize() {
  if (!post || state.disposed) return;
  const width = stage.clientWidth, height = stage.clientHeight, tier = qualityConfig.tiers[quality.tier];
  const ratio = Math.min(devicePixelRatio, tier.maxDpr) * tier.renderScale;
  renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); camera.aspect = width / height;
  camera.updateProjectionMatrix(); post.resize(width, height, ratio); quality.resetSamples();
}
function applyQuality(tierName) {
  const tier = qualityConfig.tiers[tierName];
  if (spectator) spectator.count = tier.crowdCount;
  if (key.shadow.mapSize.x !== tier.shadowMap) {key.shadow.mapSize.setScalar(tier.shadowMap); key.shadow.map?.dispose(); key.shadow.map = null;}
  $('tier-badge').textContent = tierName.toUpperCase(); $('quality').value = quality.auto ? 'auto' : tierName;
  $('effect-note').textContent = tierName === 'economy' ? 'גוון · Vignette · רינדור חסכוני' : 'גוון · Bloom · עומק עדין · Vignette'; resize();
}
function setCamera(mode) {
  if (!readyComplete || !['broadcast', 'side', 'shoulder', 'replay'].includes(mode)) return;
  if (mode === 'replay' && state.mode !== 'replay') state.replay = {frames: history.map(f => structuredClone(f)), progress: 0};
  if (mode !== 'replay') state.replay = null;
  const leavingReplay = state.mode === 'replay'; state.mode = mode;
  rig.select(state.sport, mode, mode === 'replay' ? config.replay.entrySeconds : leavingReplay ? config.replay.returnSeconds : config.transition.seconds);
  pressed('[data-camera]', 'camera', mode); $('replay-strip').hidden = mode !== 'replay'; $('air-label').textContent = mode === 'replay' ? 'הילוך חוזר' : 'שידור חי';
  $('camera-index').textContent = `CAM 0${['broadcast', 'side', 'shoulder', 'replay'].indexOf(mode) + 1}`;
  $('camera-label').textContent = {broadcast: 'מצלמת שידור', side: 'מצלמת צד', shoulder: 'מעל הכתף', replay: 'הילוך חוזר'}[mode];
}
function setSport(sport) {
  if (!readyComplete || !stages[sport]) return;
  sportGeneration++; state.sport = sport; state.replay = null; state.mode = 'broadcast';
  for (const [name, model] of Object.entries(stages)) model.visible = name === sport;
  for (const [name, model] of Object.entries(surfaces)) model.visible = name === sport;
  scene.background.set(sport === 'soccer' ? '#23343c' : '#182631'); scene.fog.color.copy(scene.background);
  key.intensity = sport === 'soccer' ? 1.7 : 1.9;
  pressed('[data-sport]', 'sport', sport); $('score').innerHTML = sport === 'soccer' ? '1<span>:</span>0' : '42<span>:</span>38';
  seedHistory(); placeCrowd(); createBall(); setCamera('broadcast'); quality.resetSamples();
}
function togglePlay() {state.playing = !state.playing; updatePlay();}
function updatePlay() {$('play').setAttribute('aria-pressed', String(state.playing)); $('play').setAttribute('aria-label', state.playing ? 'השהיית התנועה' : 'ניגון התנועה'); $('play').textContent = state.playing ? 'Ⅱ' : '\u25b6\ufe0e';}
function displayFrame(dt) {
  const frame = state.replay ? replaySample() : sample(state.elapsed);
  const subject = vec(frame.positions[0]);
  const velocity = state.replay ? new T.Vector3() : vec(sample(state.elapsed + .05).positions[0]).sub(subject).multiplyScalar(20);
  rig.update(dt, subject, velocity, stage.clientWidth < stage.clientHeight, state.replay?.progress || 0);
  updateActors(frame);
  if (crowdTimeUniform) crowdTimeUniform.value = state.reducedMotion ? 0 : frame.time;
  const tier = qualityConfig.tiers[quality.tier]; renderer.info.reset();
  post.render(scene, camera, rig, tier, state.reducedMotion);
  frames++;
  stats = {calls: renderer.info.render.calls, submittedTriangles: renderer.info.render.triangles, sceneTriangles: countSceneTriangles(), postTargetMiB: +(post.memoryBytes() / 1048576).toFixed(3), width: stage.clientWidth, height: stage.clientHeight, renderWidth: canvas.width, renderHeight: canvas.height, quality: quality.tier, population: actors.length, crowd: spectator.count};
  $('lens-label').textContent = `${Math.round(camera.fov)}° FOV · ${state.replay ? '0.45×' : 'LIVE'}`;
  if (!state.playing) $('fps').textContent = '—';
  if (state.replay) $('replay-time').value = state.replay.progress;
  const clock = state.sport === 'soccer' ? 64 * 60 + 28 + Math.floor(frame.time) : Math.max(0, 222 - Math.floor(frame.time));
  $('match-clock').textContent = `${Math.floor(clock / 60).toString().padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
  if (!$('metrics').hidden) $('metrics-body').textContent = `משולשים בסצנה: ${stats.sceneTriangles.toLocaleString('he')}\nמשולשים כולל צללים ופוסט: ${stats.submittedTriangles.toLocaleString('he')}\nקריאות ציור: ${stats.calls} · קהל: ${stats.crowd}\nרינדור: ${stats.renderWidth} × ${stats.renderHeight}\nיעדי פוסט: ${stats.postTargetMiB} MiB\nאיכות: ${tier.label} · three.js ${T.REVISION}`;
}
function countSceneTriangles() {
  let total = 0; scene.traverseVisible(o => {if (!o.isMesh) return; const n = (o.geometry.index?.count || o.geometry.attributes.position?.count || 0) / 3; total += n * (o.isInstancedMesh ? o.count : 1);}); return total;
}
function frame(now) {
  if (state.disposed) return;
  requestAnimationFrame(frame);
  if (!readyComplete || state.hidden || state.contextLost || now - lastDraw < 1000 / 30 - 1) return;
  const interval = lastDraw ? now - lastDraw : 1000 / 30, dt = Math.min(interval / 1000, .1);
  lastDraw = now; const start = performance.now();
  if (state.playing) {
    state.elapsed += dt;
    while (nextHistory <= state.elapsed) {storeHistory(sample(nextHistory)); nextHistory += 1 / config.replay.sampleRateHz;}
    if (state.replay) {const duration = state.replay.frames.at(-1).time - state.replay.frames[0].time; state.replay.progress = Math.min(1, state.replay.progress + dt * config.replay.playbackRate / duration);}
  }
  displayFrame(dt); quality.sample(interval, performance.now() - start, dt);
  fpsWindow.push(interval); if (fpsWindow.length > 30) fpsWindow.shift();
  if (state.playing && frames % 10 === 0) $('fps').textContent = Math.round(1000 / (fpsWindow.reduce((a, b) => a + b, 0) / fpsWindow.length));
}
function dispose() {
  if (state.disposed) return; state.disposed = true;
  const seen = new Set();
  scene.traverse(o => {if (o.geometry && !seen.has(o.geometry)) {seen.add(o.geometry); o.geometry.dispose();}
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {if (seen.has(m)) continue; seen.add(m); for (const value of Object.values(m)) if (value?.isTexture && !seen.has(value)) {seen.add(value); value.dispose();} m.dispose();}});
  for (const resource of resources) if (!seen.has(resource)) resource.dispose();
  actors.forEach(a => a.variants.forEach(v => {v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.model);}));
  post?.dispose(); environment.dispose(); decoder.dispose(); renderer.dispose();
}
const ready = (async () => {
  const json = async path => {const response = await fetch(path); if (!response.ok) throw Error(`Could not load ${path}`); return response.json();};
  [config, qualityConfig, geometry] = await Promise.all(['cameras.json', 'quality.json', 'assets/geometry.json'].map(json));
  rig = new BroadcastCamera(camera, config); post = new MobilePost(renderer, qualityConfig); quality = new AdaptiveQuality(qualityConfig, applyQuality);
  const [low, high, crowd, soccer, basketball] = await Promise.all(['athlete-lod1', 'athlete-lod0', 'spectator', 'soccer-stage', 'basketball-stage'].map(n => loader.loadAsync(new URL(`assets/${n}.glb`, import.meta.url).href)));
  for (const [name, asset] of [['soccer', soccer], ['basketball', basketball]]) {
    stages[name] = asset.scene; scene.add(asset.scene);
    asset.scene.traverse(o => {if (o.isMesh) {o.castShadow = false; o.receiveShadow = true; for (const m of Array.isArray(o.material) ? o.material : [o.material]) {m.envMapIntensity = name === 'soccer' ? .18 : .6; m.roughness = name === 'soccer' ? .88 : .43;}}});
  }
  createContactShadows(); buildSurfaces(); makeActors(low, high); buildCrowd(crowd);
  readyComplete = true; setSport(state.sport);
  quality.select(params.get('quality') in qualityConfig.tiers ? params.get('quality') : (!renderer.capabilities.isWebGL2 ? 'economy' : 'balanced'), !params.has('quality'));
  updatePlay(); resize(); displayFrame(1 / 30); $('loading').hidden = true;
  return true;
})();
ready.catch(fail);
document.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));
document.querySelectorAll('[data-sport]').forEach(b => b.onclick = () => setSport(b.dataset.sport));
$('fx').onclick = () => {if (!post) return; post.enabled = !post.enabled; $('fx').setAttribute('aria-pressed', String(post.enabled)); $('fx-label').textContent = post.enabled ? 'פעיל' : 'כבוי';};
$('play').onclick = togglePlay; $('return-live').onclick = () => setCamera('broadcast');
$('quality').onchange = () => {if (quality) quality.select($('quality').value === 'auto' ? quality.tier : $('quality').value, $('quality').value === 'auto');};
$('replay-time').oninput = () => {if (state.replay) {state.replay.progress = +$('replay-time').value; state.playing = false; rig.motion.set(0, 0); rig.resetMotion = true; updatePlay();}};
$('details').onclick = () => {$('metrics').hidden = !$('metrics').hidden; $('details').setAttribute('aria-expanded', String(!$('metrics').hidden)); if (!$('metrics').hidden) $('close-metrics').focus();};
$('close-metrics').onclick = () => {$('metrics').hidden = true; $('details').setAttribute('aria-expanded', 'false'); $('details').focus();};
window.addEventListener('keydown', e => {if (e.key === 'Escape') $('close-metrics').click();});
window.addEventListener('resize', () => {if (rig?.initialized) rig.select(state.sport, state.mode, .7); resize();});
document.addEventListener('visibilitychange', () => {state.hidden = document.hidden; lastDraw = 0; quality?.resetSamples(); if (rig) rig.resetMotion = true;});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {state.reducedMotion = e.matches;});
canvas.addEventListener('webglcontextlost', e => {e.preventDefault(); state.contextLost = true; $('error').hidden = false; $('error').textContent = 'התצוגה הושהתה. ממתינים לחידוש הגרפיקה.';});
canvas.addEventListener('webglcontextrestored', () => {state.contextLost = false; post.dispose(); post = new MobilePost(renderer, qualityConfig); buildEnvironment(); key.shadow.map?.dispose(); key.shadow.map = null; quality.resetSamples(); seedHistory(); rig.resetMotion = true; resize(); $('error').hidden = true;});
window.addEventListener('pagehide', e => {if (!e.persisted) dispose();});
requestAnimationFrame(frame);
window.broadcastPreview = {ready, errors, setSport, setCamera, dispose,
  setQuality: (tier, auto = false) => quality.select(tier, auto),
  seek: time => {state.playing = false; state.elapsed = time; seedHistory(); if (state.replay) {state.replay.frames = history.map(f => structuredClone(f));} updatePlay(); displayFrame(1 / 30);},
  settle: (seconds = 1.5) => {
    const f = state.replay ? replaySample() : sample(state.elapsed), subject = vec(f.positions[0]);
    const velocity = state.replay ? new T.Vector3() : vec(sample(state.elapsed + .05).positions[0]).sub(subject).multiplyScalar(20);
    for (let t = 0; t < seconds; t += 1 / 30) rig.update(1 / 30, subject, velocity, stage.clientWidth < stage.clientHeight, state.replay?.progress || 0);
    displayFrame(1 / 30);
  },
  snapshot: () => ({...stats, camera: rig.snapshot(), sport: state.sport, mode: state.mode, playing: state.playing, replay: state.replay ? {progress: state.replay.progress, samples: state.replay.frames.length, start: state.replay.frames[0].time, end: state.replay.frames.at(-1).time} : null, historySamples: history.length, depthSupported: post.depthSupported, webgl2: renderer.capabilities.isWebGL2, postEnabled: post.enabled, adaptive: {auto: quality.auto, p90: quality.p90, changes: quality.changes}, errors: [...errors]}),
  get renderer() {return renderer;}, get camera() {return camera;}, get scene() {return scene;}, get actors() {return actors;}, get quality() {return quality;}, get post() {return post;}, get state() {return state;}
};

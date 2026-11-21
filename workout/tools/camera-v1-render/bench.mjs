// Internal test bench (not published): renders the app's own 3D figure doing a catalogue exercise, frame by
// frame at a scripted clock, and hands every frame to the REAL camera-v1 pose worker (vendored MediaPipe
// lite model, CPU), exactly as capture.mjs does. Returns the model's raw answers plus the true joint
// positions from the rig, so the tracker, counter and guidance can be replayed and scored in Node.
// A rendered cartoon figure is not a person: this measures the pipeline, not accuracy on a child.
import { Stage3D } from '../../js/stage3d.js?v=20261010-camera-1';
import { THREE, KITS3D } from '../../js/char3d.js?v=20261010-camera-1';
import { byId } from '../../js/exercises.js?v=20261010-camera-1';
import { poseAt, cycleMs, lerpPose } from '../../js/figure.js?v=20261010-camera-1';

const TRUTH = { nose: 'Head', lShoulder: 'LeftArm', rShoulder: 'RightArm', lElbow: 'LeftForeArm', rElbow: 'RightForeArm',
  lWrist: 'LeftHand', rWrist: 'RightHand', lHip: 'LeftUpLeg', rHip: 'RightUpLeg', lKnee: 'LeftLeg', rKnee: 'RightLeg',
  lAnkle: 'LeftFoot', rAnkle: 'RightFoot', lToe: 'LeftToes', rToe: 'RightToes', top: 'Head_end' };
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
let seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

function worker() {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../../js/camera-v1/pose-worker.js', import.meta.url));
    w.onmessage = ({ data }) => data.type === 'ready' ? resolve(w) : reject(new Error('pose worker did not start'));
    w.onerror = () => reject(new Error('pose worker error'));
    w.postMessage({ type: 'init' });
  });
}
const ask = (w, bitmap, time) => new Promise((resolve, reject) => {
  w.onmessage = ({ data }) => data.type === 'pose' ? resolve(data) : reject(new Error('pose worker failed on a frame'));
  w.postMessage({ type: 'frame', time, bitmap }, [bitmap]);
});

// The app's figure is a cartoon with a thick outline, two-tone shading and a head a third of its height; the
// pose model was trained on photographs of people. 'plain' removes the outline and the cartoon face, shades
// the body smoothly and lets the proportions be set, so the picture is nearer to a person (still a rendering).
const REST = new Map();
function shape(st, look, body = {}) {
  const { ch } = st, b = ch.rig.b;
  if (!ch.toon) { ch.toon = ch.mesh.material; ch.plain = new THREE.MeshLambertMaterial({ map: ch.toon.map }); }
  ch.mesh.material = look === 'plain' ? ch.plain : ch.toon;
  if (ch.outline) ch.outline.visible = look !== 'plain';
  const set = (name, x, y = x, z = x) => { if (b[name]) b[name].scale.set(x, y, z); };
  const { head = look === 'plain' ? .62 : 1, legs = 1, arms = 1, shoulders = 1 } = body;
  set('Head', head);
  for (const side of ['Left', 'Right']) {
    set(side + 'UpLeg', legs); set(side + 'Arm', arms);
    const sh = b[side + 'Shoulder'];
    if (sh) { if (!REST.has(sh)) REST.set(sh, sh.position.clone()); sh.position.copy(REST.get(sh)).multiplyScalar(shoulders); }
  }
}

// A room with things on its walls, so that the background changes when the phone is knocked. The walls face
// inwards only: the camera, which stands outside them, sees through the near one.
function furnish(st, on) {
  if (!st.decor) {
    st.decor = new THREE.Group();
    let n = 11;
    const rnd = () => (n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let side = 0; side < 4; side++) {
      const wall = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const w = 40 + rnd() * 110, h = 40 + rnd() * 120;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(rnd(), .35, .3 + rnd() * .4) }));
        m.position.set(-420 + i * 105 + rnd() * 30, 30 + rnd() * 330, 0);
        wall.add(m);
      }
      wall.position.set(0, 0, -330); 
      const turn = new THREE.Group(); turn.add(wall); turn.rotation.y = side * Math.PI / 2;
      st.decor.add(turn);
    }
    st.scene.add(st.decor);
  }
  st.decor.visible = on;
}

let stage = null, stageKey = '';
function stageFor(w, h, look) {
  const key = w + 'x' + h + look;
  if (stage && stageKey === key) return Promise.resolve(stage);
  stage?.dispose();
  const el = document.getElementById('stage');
  el.replaceChildren();
  el.style.width = w + 'px'; el.style.height = h + 'px';
  stageKey = key;
  return new Promise((resolve, reject) => {
    // A plain room instead of the app's pink stage: light wall, wooden floor.
    stage = new Stage3D(el, null, { bg: '#d8d3c6', floor: '#b3956f', kit: look === 'plain' ? { ...KITS3D.israel, face: false } : KITS3D.maccabi, onFail: () => reject(new Error('no WebGL')) });
    const current = stage;
    const wait = () => current.ch ? resolve(current) : setTimeout(wait, 50);
    wait();
  });
}

/**
 * cfg: id, w, h, want ('front'|'side'|'diagonal'), other (the view a quarter turn away), dist, shiftX, shiftY,
 *      dim (0..1 brightness), blur (px), trail (0..1 motion blur), noise (0..40), step (ms), reps, speed, lead, tail,
 *      look ('plain'|'cartoon'), body ({ head, legs, arms, shoulders } scale factors),
 *      depth (0..1: how far each repetition goes), decor (things on the walls),
 *      idle (true: hold the first pose), shake ({ at, dx, dy }: the phone is knocked at that time)
 */
window.runClip = async cfg => {
  const { id, w = 390, h = 844, want = 'side', other = false, dist = 1.25, shiftX = 0, shiftY = 0, dim = 1, blur = 0, trail = 0,
    noise = 0, step = 50, reps = 4, speed = .7, lead = 1600, tail = 700, idle = false, shake = null, jitter = .6, look = 'plain', body, depth = 1, decor = false } = cfg;
  const ex = byId[id];
  const st = await stageFor(w, h, look);
  shape(st, look, body);
  furnish(st, decor);
  st.stop(); st.setExercise(ex);
  st.renderer.setPixelRatio(1); st.renderer.setSize(w, h, false);
  let yaw = want === 'diagonal' ? Math.PI / 4 : (want === 'front') === st.front ? 0 : Math.PI / 2;
  if (other) yaw += want === 'diagonal' ? Math.PI / 4 : Math.PI / 2;
  st.camAngle = yaw; st.frameCamera(); st.camDist *= dist; st.placeCam();
  const out = document.getElementById('out');
  out.width = w; out.height = h;
  const g = out.getContext('2d', { willReadFrequently: noise > 0 });
  const scale = Math.min(1, 640 / Math.max(w, h));
  const bw = Math.round(scale * w), bh = Math.round(scale * h);
  const cycle = cycleMs(ex.frames), motion = idle ? 0 : reps * cycle / speed, total = lead + (idle ? cfg.idleMs ?? 6000 : motion) + tail;
  const v = st._v.clone();
  const pose = await worker();
  const frames = [];
  let first = true;
  seed = 7;
  try {
    for (let t = 0; t <= total; t += step) {
      const active = !idle && t >= lead && t < lead + motion;
      const ms = idle || t < lead ? 0 : Math.min(motion, t - lead) * speed;
      const p = depth < 1 ? lerpPose(ex.frames[0][0], poseAt(ex.frames, ms), depth) : poseAt(ex.frames, ms);
      st.ch.rig.apply(p, st.front); st.updateShadow(p);
      const knocked = shake && t >= shake.at;
      // A propped phone is never perfectly still: a fraction of a pixel of sway each frame.
      const ox = (shiftX + (knocked ? shake.dx : 0)) * w + (random() - .5) * jitter;
      const oy = (shiftY + (knocked ? shake.dy : 0)) * h + (random() - .5) * jitter;
      st.camera.setViewOffset(w, h, ox, oy, w, h);
      st.renderer.render(st.scene, st.camera);
      const truth = {};
      for (const [name, bone] of Object.entries(TRUTH)) {
        const b = st.ch.rig.b[bone]; if (!b) continue;
        b.getWorldPosition(v); v.project(st.camera);
        truth[name] = [round((v.x + 1) / 2, 3), round((1 - v.y) / 2, 3)];
      }
      g.globalAlpha = first || !trail ? 1 : 1 - trail;
      g.filter = [dim < 1 ? `brightness(${dim})` : '', blur ? `blur(${blur}px)` : ''].join(' ').trim() || 'none';
      g.drawImage(st.renderer.domElement, 0, 0, w, h);
      g.filter = 'none'; g.globalAlpha = 1; first = false;
      if (noise > 0) {
        const image = g.getImageData(0, 0, w, h), d = image.data;
        for (let i = 0; i < d.length; i += 4) { const n = (random() - .5) * noise; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        g.putImageData(image, 0, 0);
      }
      const bitmap = await createImageBitmap(out, { resizeWidth: bw, resizeHeight: bh });
      const sent = performance.now();
      const answer = await ask(pose, bitmap, 1000 + t);
      frames.push({ t, active, ms: round(performance.now() - sent, 1), light: answer.light, scene: answer.scene, truth,
        poses: answer.poses.map(person => ({
          landmarks: person.landmarks.map(q => ({ x: round(q.x), y: round(q.y), z: round(q.z, 3), visibility: round(q.visibility, 3), presence: round(q.presence ?? 1, 3) })),
          world: person.world.map(q => ({ x: round(q.x), y: round(q.y), z: round(q.z), visibility: round(q.visibility, 3) })),
        })) });
      if (cfg.shots?.includes(t)) (window.shots ??= {})[cfg.name + '@' + t] = out.toDataURL('image/jpeg', .85);
    }
  } finally { pose.terminate(); st.camera.clearViewOffset(); }
  return { cfg, aspect: bw / bh, bitmap: [bw, bh], cycle, motion, lead, total, front: st.front, type: ex.type, frames };
};

// A recorded video of a person, sampled at the scripted clock and sent to the same worker.
// cfg: url, id, step (ms), from, to (seconds), sheet (true: also return a contact sheet of small frames)
window.runVideo = async cfg => {
  const { url, step = 67, from = 0, sheet = false } = cfg;
  const video = document.createElement('video');
  video.muted = true; video.src = url; video.preload = 'auto';
  await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('the video did not load')); });
  const to = Math.min(cfg.to ?? video.duration, video.duration);
  const seek = time => new Promise(resolve => { video.onseeked = resolve; video.currentTime = time; });
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  const bw = Math.round(scale * video.videoWidth), bh = Math.round(scale * video.videoHeight);
  const out = document.getElementById('out');
  out.width = bw; out.height = bh;
  const g = out.getContext('2d');
  const pose = await worker();
  const frames = [];
  const cols = 8, tw = 160, th = Math.round(160 * bh / bw);
  const count = Math.floor((to - from) * 1000 / step) + 1;
  const every = Math.max(1, Math.round(250 / step));
  const board = sheet ? Object.assign(document.createElement('canvas'), { width: cols * tw, height: Math.ceil(count / every / cols) * th }) : null;
  const bg = board?.getContext('2d');
  try {
    for (let i = 0; i < count; i++) {
      const t = i * step;
      await seek(from + t / 1000);
      g.drawImage(video, 0, 0, bw, bh);
      if (bg && i % every === 0) {
        const k = i / every;
        bg.drawImage(out, (k % cols) * tw, Math.floor(k / cols) * th, tw, th);
        bg.fillStyle = '#ff0'; bg.font = '14px sans-serif'; bg.fillText((t / 1000).toFixed(1), (k % cols) * tw + 4, Math.floor(k / cols) * th + 16);
      }
      const bitmap = await createImageBitmap(out);
      const sent = performance.now();
      const answer = await ask(pose, bitmap, 1000 + t);
      frames.push({ t, active: true, ms: round(performance.now() - sent, 1), light: answer.light, scene: answer.scene, truth: {},
        poses: answer.poses.map(person => ({
          landmarks: person.landmarks.map(q => ({ x: round(q.x), y: round(q.y), z: round(q.z, 3), visibility: round(q.visibility, 3), presence: round(q.presence ?? 1, 3) })),
          world: [] })) });
    }
  } finally { pose.terminate(); }
  return { cfg, aspect: bw / bh, bitmap: [bw, bh], total: (to - from) * 1000, frames, sheet: board?.toDataURL('image/jpeg', .8) };
};
window.benchReady = true;

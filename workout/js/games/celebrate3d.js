// חגיגת שיא חדש בתלת-ממד: אותה דמות כמו במסך התרגיל (Kenney, חולצת מכבי חיפה) באצטדיון אמיתי.
// שתי סצנות: שער (ריצה, בעיטה, השוער צולל, הרשת, קהל קופץ, קונפטי) וריצת 100 מטר (מסלול, שני יריבים, קו סיום, ניצחון).
// הצלילים והקריין נשארים מהגרסה הדו-ממדית (makeAudio, ההקלטות של רועי). אם WebGL לא זמין או שהטעינה נכשלת, המנוע חוזר לגרסה הדו-ממדית.
import { THREE, hasWebGL, loadCharacter, KITS3D, lights, crowd, confetti, soccerBallMesh, makeRenderer } from '../char3d.js';
import { makeAudio, SPRINT, LEAN, poseAt } from './celebrate.js';
import { POSE, GK } from './sprites.js';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const SCENE_IDS_3D = ['goal', 'sprint'];

// שכבת טקסט מעל הקנבס (עברית חדה, לא דרך WebGL)
function textLayer(host) {
  const el = document.createElement('div'); el.className = 'c3dtext'; host.appendChild(el);
  return { show(txt, sub = '', cls = '') { el.innerHTML = `<b class="${cls}">${txt}</b>${sub ? `<span>${sub}</span>` : ''}`; el.classList.add('on'); }, hide() { el.classList.remove('on'); }, remove() { el.remove(); } };
}

export function celebrate3d(canvas, { oldBest = 0, newBest = 1, sound = true, onText = null, onDone = null, scene = null } = {}) {
  if (!hasWebGL()) throw new Error('no webgl');
  const W = canvas.width, H = canvas.height; // 360x560
  const host = canvas.parentElement;
  // קנבס WebGL מעל קנבס המשחק, באותו גודל
  const gl = document.createElement('canvas'); gl.className = 'c3d'; gl.width = W; gl.height = H; host.appendChild(gl);
  const text = textLayer(host);
  const id = SCENE_IDS_3D.includes(scene) ? scene : SCENE_IDS_3D[Math.floor(Math.random() * SCENE_IDS_3D.length)];
  const S = makeAudio(sound);
  let shout = null; try { shout = localStorage.getItem('kidfit.goalShout'); } catch { shout = null; }
  const REC = { goal: new URL('../../snd/goal.mp4', import.meta.url).href, sprint: new URL('../../snd/sprint.mp4', import.meta.url).href };
  const recFor = id === 'goal' ? (shout || REC.goal) : REC.sprint;
  let said = false; const say = (txt, lang) => { if (said) return; said = true; if (sound && recFor) { try { const a = new Audio(recFor); a.onerror = () => { if (txt) onText && onText(txt, lang); }; a.play().catch(() => { if (txt) onText && onText(txt, lang); }); return; } catch { /* */ } } if (txt) onText && onText(txt, lang); };

  let stopped = false, raf = 0, renderer = null;
  const cleanup = () => { cancelAnimationFrame(raf); if (renderer) renderer.dispose(); gl.remove(); text.remove(); };
  const run = async () => {
    renderer = makeRenderer(gl, W, H);
    const sc = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(38, W / H, 1, 4000);
    const build = id === 'goal' ? goalScene : sprintScene;
    const world = await build(sc, cam, S, say, text, { oldBest, newBest });
    if (stopped) return;
    const t0 = performance.now(); let last = t0;
    const frame = now => { const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now; window.__c3dT = t; world.update(t, dt); renderer.render(sc, cam); if (t < world.dur) raf = requestAnimationFrame(frame); else { cleanup(); onDone && onDone(); } };
    raf = requestAnimationFrame(frame);
  };
  run().catch(e => { console.warn('celebrate3d', e); cleanup(); if (!stopped) { stopped = true; onDone && onDone(); } });
  return () => { stopped = true; cleanup(); };
}

// ---- דשא ומגרש ----
function pitch(sc, { w = 3000, d = 3000 } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2f9e44' : '#37b24d'; g.fillRect(0, i * 64, 512, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 1000, d / 1000);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; sc.add(m);
  const line = (x, z, lw, ld) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); l.rotation.x = -Math.PI / 2; l.position.set(x, .5, z); sc.add(l); };
  return { line };
}
function stands(sc, z, y = 60) {
  const st = new THREE.Mesh(new THREE.BoxGeometry(2400, 260, 400), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 1 })); st.position.set(0, y + 60, z - 200); sc.add(st);
  return crowd(sc, { count: 150, x0: -900, x1: 900, z: z + 10, y: y + 190, rows: 3, rowDz: -60, rowDy: 36 });
}
function sky(sc, top = '#0b1026', bottom = '#1e293b') {
  sc.background = new THREE.Color(bottom); sc.fog = new THREE.Fog(bottom, 1500, 3500);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })); sc.add(dome);
  // אורות אצטדיון
  for (const x of [-700, 700]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 700, 8), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); pole.position.set(x, 350, -900); sc.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(120, 40, 20), new THREE.MeshBasicMaterial({ color: '#fef9c3' })); lamp.position.set(x, 700, -900); sc.add(lamp); }
}
function goalFrame(sc, z, w = 300, h = 120) {
  const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .5 });
  for (const x of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, h, 10), mat); p.position.set(x, h / 2, z); p.castShadow = true; sc.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, w, 10), mat); bar.rotation.z = Math.PI / 2; bar.position.set(0, h, z); sc.add(bar);
  const netMat = new THREE.MeshBasicMaterial({ color: '#e2e8f0', wireframe: true, transparent: true, opacity: .55 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 16, 7), netMat); back.position.set(0, h / 2, z - 70); sc.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, 70, 16, 4), netMat); top.rotation.x = -Math.PI / 2; top.position.set(0, h, z - 35); sc.add(top);
  for (const x of [-w / 2, w / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(70, h, 4, 7), netMat); side.rotation.y = Math.PI / 2; side.position.set(x, h / 2, z - 35); sc.add(side); }
  return { back, bulge(k) { back.position.z = z - 70 - 40 * k; } };
}

// ---- סצנה 1: שער ----
async function goalScene(sc, cam, S, say, text, { oldBest, newBest }) {
  sky(sc); lights(sc, { sun: 1.8, ground: '#1e3a2f' });
  pitch(sc); const P = pitch; void P;
  const GZ = -620, GW = 300, GH = 120;
  const g = goalFrame(sc, GZ, GW, GH);
  const fans = stands(sc, GZ - 220, 40);
  // קווי מגרש: רחבה וקו שער
  const line = (x, z, lw, ld) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); l.rotation.x = -Math.PI / 2; l.position.set(x, .6, z); sc.add(l); };
  line(0, GZ, 1200, 5); line(0, GZ + 240, 640, 5); line(-320, GZ + 120, 5, 240); line(320, GZ + 120, 5, 240);
  const conf = confetti(sc, 320);
  const [hero, keeper] = await Promise.all([loadCharacter(KITS3D.maccabi), loadCharacter(KITS3D.keeper)]);
  sc.add(hero.model); sc.add(keeper.model);
  const ball = soccerBallMesh(12); sc.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(12, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .3 })); shadow.rotation.x = -Math.PI / 2; sc.add(shadow);
  const tx = (Math.random() < .5 ? -1 : 1) * rnd(60, 120), ty = rnd(30, 95); const gkDir = tx < 0 ? -1 : 1;
  const HIT = 2.3, KICK = 1.7, DUR = 8;
  S.murmur(0, 1.6); S.tension(0.3, 1.5); S.kick(KICK); S.chant(HIT + .05, 2.4); S.roar(HIT, 4.6); S.drums(HIT + .6);
  const ballStart = new THREE.Vector3(0, 12, -60), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), camPos = new THREE.Vector3(), look = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    // מצלמה: מאחורי השחקן, מתקרבת לשער בבעיטה, ואחרי השער חוזרת אל החוגג
    const zoom = clamp((t - KICK) / .8, 0, 1), back = clamp((t - HIT - .3) / .8, 0, 1);
    // מתחילים גבוה ורחוק מאחורי השחקן (רואים אותו, את השוער ואת השער), מתקרבים לשער בבעיטה, ואחרי השער נסוגים כדי לראות את החוגג רץ למצלמה
    camPos.set(140 - 100 * zoom - 40 * back, 240 - 80 * zoom + 40 * back, 560 - 300 * zoom + 520 * back); look.set(0, 90 - 30 * zoom, -260 + 100 * zoom + 360 * back);
    cam.position.copy(camPos); cam.lookAt(look);
    // שחקן
    let pose, front = false, heading = 0;
    if (t < 1.55) { const k = ease(clamp(t / 1.55, 0, 1)); heroPos.set(-220 + 190 * k, 0, 260 - 300 * k); pose = poseAt(POSE.run, t * 1000); heading = Math.atan2(190, -300); }
    else if (t < 2.2) { heroPos.set(-30, 0, -40); pose = POSE.leap; heading = 0; }
    else { const k = clamp((t - 2.2) / 3, 0, 1); heroPos.set(-30 + 30 * k, 0, -40 + 240 * k); const j = Math.sin(t * 6); pose = j > 0 ? POSE.armsUp : POSE.jumpUp; front = true; heading = Math.PI; /* פונה למצלמה */ heroPos.y = Math.abs(j) * 22; }
    hero.model.rotation.y = front ? 0 : heading; hero.rig.apply(pose, front, heroPos); /* המודל פונה +Z, המצלמה ב-+Z: סיבוב 0 = פונה למצלמה */
    // שוער: עומד, צולל בבעיטה, שוכב
    let gp = GK.ready; const gkBase = new THREE.Vector3(gkDir * clamp((t - KICK) / .5, 0, 1) * 90, 0, GZ + 40);
    if (t > KICK && t < HIT + .3) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .3) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; keeper.rig.apply(gp || POSE.front, true, gkBase);
    // כדור
    if (t < KICK) { ball.position.copy(ballStart); }
    else if (t < HIT) { const k = (t - KICK) / (HIT - KICK); ball.position.lerpVectors(ballStart, ballEnd, k); ball.position.y += Math.sin(k * Math.PI) * 60; ball.rotation.x -= dt * 18; }
    else { ball.position.copy(ballEnd); ball.position.z += Math.sin((t - HIT) * 12) * Math.max(0, 1 - (t - HIT)) * 10; g.bulge(Math.max(0, 1 - (t - HIT) / .9) * Math.abs(Math.cos((t - HIT) * 14))); }
    shadow.position.set(ball.position.x, .8, ball.position.z); shadow.scale.setScalar(Math.max(.4, 1 - ball.position.y / 200));
    fans.update(t, t > HIT);
    if (t > HIT && t < HIT + .05) { conf.start(0, 260, 0, 500); say('', 'pt-BR'); text.show('גוווול!!!', '', 'big'); }
    if (t > HIT + 1.9 && t < HIT + 1.95) text.show(`שיא חדש: ${newBest}`, oldBest ? `השיא הקודם: ${oldBest}` : 'הפעם הראשונה!', 'gold');
    conf.update(dt);
  } };
}

// ---- סצנה 2: ריצת 100 מטר ----
async function sprintScene(sc, cam, S, say, text, { oldBest, newBest }) {
  sky(sc, '#0b1026', '#1e293b'); lights(sc, { sun: 1.6, ground: '#3f1d1d' });
  // מסלול אדום עם 3 נתיבים לאורך X, קו סיום משובץ
  const track = new THREE.Mesh(new THREE.PlaneGeometry(2600, 420), new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 1 })); track.rotation.x = -Math.PI / 2; track.position.set(0, 0, 0); track.receiveShadow = true; sc.add(track);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#2f9e44', roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.y = -.5; sc.add(grass);
  for (let i = 0; i <= 3; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(2600, 4), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); l.rotation.x = -Math.PI / 2; l.position.set(0, .6, -210 + i * 140); sc.add(l); }
  const FIN = 260; for (let j = 0; j < 14; j++) { const sq = new THREE.Mesh(new THREE.PlaneGeometry(16, 30), new THREE.MeshBasicMaterial({ color: j % 2 ? '#111' : '#fff' })); sq.rotation.x = -Math.PI / 2; sq.position.set(FIN, .7, -210 + 15 + j * 30); sc.add(sq); }
  const fans = stands(sc, -330, 20);
  const conf = confetti(sc, 320);
  const kits = [KITS3D.grey, KITS3D.orange, KITS3D.maccabi];
  const runners = await Promise.all(kits.map(k => loadCharacter(k)));
  const lanes = runners.map((r, i) => { sc.add(r.model); return { r, z: -140 + i * 140, speed: [.8, .9, 1][i], ph: 0, x: -520 }; });
  const START = .4, DUR_RUN = 2.5, WIN = 2.95, DUR = 8;
  S.gun(START); S.steps(START + .1, 16, .15); S.murmur(.5, 2.5); S.tension(1, 1.9); S.chant(WIN + .05, 2.2); S.roar(WIN, 4.3); S.drums(WIN + .45, 6);
  text.show('למקומות...', '', '');
  const pos = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    const run = t > START; const heroL = lanes[2];
    lanes.forEach((l, i) => {
      const k = run ? (t - START) / DUR_RUN * l.speed : 0; l.x = -520 + 760 * Math.pow(clamp(k, 0, 1), .85) + Math.max(0, k - 1) * 500; const crossed = l.x >= FIN; const hero = i === 2;
      const hz = run ? Math.min(4.2, 1.2 + (t - START) * 2.2) * l.speed : 0; l.ph += hz * dt;
      let pose = !run ? POSE.ready : (crossed && hero) ? (Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp) : (k > .85 && !crossed) ? LEAN : poseAt(SPRINT, (l.ph % 1) * 8);
      const front = crossed && hero; pos.set(hero && crossed ? Math.min(l.x, FIN + 120) : l.x, front ? Math.abs(Math.sin(t * 6)) * 22 : 0, l.z);
      l.r.model.rotation.y = front ? 0 : Math.PI / 2; /* רץ ימינה = +X; חוגג = פונה למצלמה (+Z) */
      l.r.rig.apply(pose, front, pos);
    });
    // מצלמה עוקבת אחרי הגיבור מהצד-קדימה, ובסוף עוצרת מולו
    const hx = Math.min(heroL.x, FIN + 120), fin = heroL.x >= FIN;
    cam.position.set(hx + (fin ? 20 : 60), fin ? 200 : 240, heroL.z + (fin ? 700 : 820)); cam.lookAt(hx + (fin ? 10 : 40), 100, heroL.z - (fin ? 40 : 160));
    fans.update(t, t > WIN);
    if (t >= START && t < WIN) text.show(`${Math.min(9.58, (t - START) * 3.75).toFixed(2)}`, '', 'clock');
    if (t > WIN && t < WIN + .05) { conf.start(FIN + 100, 260, 0, 400); say('', 'pt-BR'); text.show('מקום ראשון!', '9.58', 'big'); }
    if (t > WIN + 2 && t < WIN + 2.05) text.show(`שיא חדש: ${newBest}`, oldBest ? `השיא הקודם: ${oldBest}` : 'הפעם הראשונה!', 'gold');
    conf.update(dt);
  } };
}

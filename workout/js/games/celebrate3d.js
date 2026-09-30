// חגיגת שיא חדש בתלת-ממד: אותה דמות כמו במסך התרגיל (Kenney, חולצת מכבי חיפה) באצטדיון או במגרש כדורסל.
// חמש סצנות: שער מבעיטה, שער בנגיחה, סלאם דאנק, קליעת שלוש, ריצת 100 מטר. הקצב איטי וברור (רועי, 30/09).
// הצלילים והקריין מהגרסה הדו-ממדית (makeAudio, ההקלטות של רועי). בלי WebGL, או אם הטעינה נכשלה, המנוע חוזר לגרסה הדו-ממדית.
import { THREE, hasWebGL, loadCharacter, KITS3D, lights, crowd, confetti, soccerBallMesh, makeRenderer } from '../char3d.js';
import { makeAudio, SPRINT, LEAN, poseAt } from './celebrate.js';
import { POSE, GK } from './sprites.js';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, easeOut = t => 1 - Math.pow(1 - t, 3);
export const SCENE_IDS_3D = ['goal', 'header', 'dunk', 'three', 'sprint'];
const BOUNCE = 3.2; // קצב הקפיצות בחגיגה (רדיאנים לשנייה; נמוך = איטי וברור)

// שכבת טקסט מעל הקנבס (עברית חדה, לא דרך WebGL)
function textLayer(host) {
  const el = document.createElement('div'); el.className = 'c3dtext'; host.appendChild(el);
  return { show(txt, sub = '', cls = '') { el.innerHTML = `<b class="${cls}">${txt}</b>${sub ? `<span>${sub}</span>` : ''}`; el.classList.add('on'); }, hide() { el.classList.remove('on'); }, remove() { el.remove(); } };
}

export function celebrate3d(canvas, { oldBest = 0, newBest = 1, sound = true, onText = null, onDone = null, scene = null } = {}) {
  if (!hasWebGL()) throw new Error('no webgl');
  const W = canvas.width, H = canvas.height; // 360x560
  const host = canvas.parentElement;
  const gl = document.createElement('canvas'); gl.className = 'c3d'; gl.width = W; gl.height = H; host.appendChild(gl);
  const text = textLayer(host);
  const id = SCENE_IDS_3D.includes(scene) ? scene : SCENE_IDS_3D[Math.floor(Math.random() * SCENE_IDS_3D.length)];
  const S = makeAudio(sound);
  let shout = null; try { shout = localStorage.getItem('kidfit.goalShout'); } catch { shout = null; }
  const REC = Object.fromEntries(['goal', 'dunk', 'three', 'sprint'].map(k => [k, new URL(`../../snd/${k}.mp4`, import.meta.url).href]));
  const recFor = id === 'goal' || id === 'header' ? (shout || REC.goal) : REC[id];
  let said = false; const say = (txt, lang) => { if (said) return; said = true; if (sound && recFor) { try { const a = new Audio(recFor); a.onerror = () => { if (txt) onText && onText(txt, lang); }; a.play().catch(() => { if (txt) onText && onText(txt, lang); }); return; } catch { /* */ } } if (txt) onText && onText(txt, lang); };

  let stopped = false, raf = 0, renderer = null;
  const cleanup = () => { cancelAnimationFrame(raf); if (renderer) renderer.dispose(); gl.remove(); text.remove(); };
  const run = async () => {
    renderer = makeRenderer(gl, W, H);
    const sc = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(38, W / H, 1, 5000);
    const build = { goal: goalScene, header: headerScene, dunk: dunkScene, three: threeScene, sprint: sprintScene }[id];
    const world = await build(sc, cam, S, say, text, { oldBest, newBest });
    if (stopped) return;
    const t0 = performance.now(); let last = t0;
    const frame = now => { const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now; window.__c3dT = t; world.update(t, dt); renderer.render(sc, cam); if (t < world.dur) raf = requestAnimationFrame(frame); else { cleanup(); onDone && onDone(); } };
    raf = requestAnimationFrame(frame);
  };
  run().catch(e => { console.warn('celebrate3d', e); cleanup(); if (!stopped) { stopped = true; onDone && onDone(); } });
  return () => { stopped = true; cleanup(); };
}

// ---- בניית עולם ----
function pitch(sc) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2f9e44' : '#37b24d'; g.fillRect(0, i * 64, 512, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; sc.add(m);
}
const line = (sc, x, z, lw, ld, y = .6) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); l.rotation.x = -Math.PI / 2; l.position.set(x, y, z); sc.add(l); return l; };
function stands(sc, z, y = 60) {
  const st = new THREE.Mesh(new THREE.BoxGeometry(2400, 260, 400), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 1 })); st.position.set(0, y + 60, z - 200); sc.add(st);
  return crowd(sc, { count: 150, x0: -900, x1: 900, z: z + 10, y: y + 190, rows: 3, rowDz: -60, rowDy: 36 });
}
function sky(sc, top = '#0b1026', bottom = '#1e293b', lamps = true) {
  sc.background = new THREE.Color(bottom); sc.fog = new THREE.Fog(bottom, 1500, 3500);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
  if (lamps) for (const x of [-700, 700]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 700, 8), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); pole.position.set(x, 350, -900); sc.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(120, 40, 20), new THREE.MeshBasicMaterial({ color: '#fef9c3' })); lamp.position.set(x, 700, -900); sc.add(lamp); }
}
function goalFrame(sc, z, w = 300, h = 120) {
  const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .5 });
  for (const x of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, h, 10), mat); p.position.set(x, h / 2, z); p.castShadow = true; sc.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, w, 10), mat); bar.rotation.z = Math.PI / 2; bar.position.set(0, h, z); sc.add(bar);
  const netMat = new THREE.MeshBasicMaterial({ color: '#e2e8f0', wireframe: true, transparent: true, opacity: .55 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 16, 7), netMat); back.position.set(0, h / 2, z - 70); sc.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, 70, 16, 4), netMat); top.rotation.x = -Math.PI / 2; top.position.set(0, h, z - 35); sc.add(top);
  for (const x of [-w / 2, w / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(70, h, 4, 7), netMat); side.rotation.y = Math.PI / 2; side.position.set(x, h / 2, z - 35); sc.add(side); }
  return { bulge(k) { back.position.z = z - 70 - 40 * k; } };
}
function ballShadow(sc) { const m = new THREE.Mesh(new THREE.CircleGeometry(12, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .3 })); m.rotation.x = -Math.PI / 2; sc.add(m); return (b) => { m.position.set(b.position.x, .8, b.position.z); m.scale.setScalar(Math.max(.4, 1 - b.position.y / 200)); }; }
function stadium(sc, GZ) { sky(sc); lights(sc, { sun: 1.8, ground: '#1e3a2f' }); pitch(sc); const g = goalFrame(sc, GZ); const fans = stands(sc, GZ - 220, 40); line(sc, 0, GZ, 1200, 5); line(sc, 0, GZ + 240, 640, 5); line(sc, -320, GZ + 120, 5, 240); line(sc, 320, GZ + 120, 5, 240); return { g, fans }; }
// חגיגה משותפת: קפיצות עם ידיים למעלה, פונה למצלמה, מתקדם לאט אליה
function celebrateStep(ch, t, from, k, dir = 1) { const j = Math.sin(t * BOUNCE); const pose = j > 0 ? POSE.armsUp : POSE.jumpUp; const pos = new THREE.Vector3(from.x + 20 * k * dir, Math.abs(j) * 20, from.z + 200 * k); ch.model.rotation.y = 0; ch.rig.apply(pose, true, pos); }
const finaleText = (text, t, at, newBest, oldBest) => { if (t > at && t < at + .06) text.show(`שיא חדש: ${newBest}`, oldBest ? `השיא הקודם: ${oldBest}` : 'הפעם הראשונה!', 'gold'); };

// ---- 1. שער מבעיטה ----
async function goalScene(sc, cam, S, say, text, { oldBest, newBest }) {
  const GZ = -620; const { g, fans } = stadium(sc, GZ); const conf = confetti(sc, 320);
  const [hero, keeper] = await Promise.all([loadCharacter(KITS3D.maccabi), loadCharacter(KITS3D.keeper)]); sc.add(hero.model); sc.add(keeper.model);
  const ball = soccerBallMesh(12); sc.add(ball); const shadow = ballShadow(sc);
  const tx = (Math.random() < .5 ? -1 : 1) * rnd(60, 120), ty = rnd(30, 95); const gkDir = tx < 0 ? -1 : 1;
  const RUN = 2.2, KICK = 2.6, HIT = 3.5, DUR = 10;
  S.murmur(0, 2.4); S.tension(0.8, 1.8); S.kick(KICK); S.chant(HIT + .05, 2.4); S.roar(HIT, 4.6); S.drums(HIT + .6);
  const ballStart = new THREE.Vector3(0, 12, -60), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), camPos = new THREE.Vector3(), look = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    const zoom = clamp((t - KICK) / 1.0, 0, 1), back = clamp((t - HIT - .4) / 1.2, 0, 1);
    camPos.set(140 - 100 * zoom - 40 * back, 240 - 80 * zoom + 40 * back, 560 - 300 * zoom + 520 * back); look.set(0, 90 - 30 * zoom, -260 + 100 * zoom + 360 * back);
    cam.position.copy(camPos); cam.lookAt(look);
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); heroPos.set(-220 + 190 * k, 0, 260 - 300 * k); hero.model.rotation.y = Math.atan2(190, -300); hero.rig.apply(poseAt(POSE.run, t * 650), false, heroPos); }
    else if (t < KICK + .5) { heroPos.set(-30, 0, -40); hero.model.rotation.y = Math.PI; hero.rig.apply(POSE.leap, false, heroPos); } /* פונה לשער */
    else celebrateStep(hero, t, { x: -30, z: -40 }, clamp((t - KICK - .5) / 4, 0, 1));
    // שוער: עומד מוכן, צולל לאט לכיוון הכדור, נוחת ושוכב
    let gp = GK.ready; const gkBase = new THREE.Vector3(gkDir * clamp((t - KICK) / .9, 0, 1) * 90, 0, GZ + 40);
    if (t > KICK + .1 && t < HIT + .4) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .4) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; keeper.rig.apply(gp, true, gkBase);
    if (t < KICK) ball.position.copy(ballStart);
    else if (t < HIT) { const k = (t - KICK) / (HIT - KICK); ball.position.lerpVectors(ballStart, ballEnd, k); ball.position.y += Math.sin(k * Math.PI) * 60; ball.rotation.x -= dt * 12; }
    else { ball.position.copy(ballEnd); ball.position.z += Math.sin((t - HIT) * 10) * Math.max(0, 1 - (t - HIT)) * 10; g.bulge(Math.max(0, 1 - (t - HIT) / 1.1) * Math.abs(Math.cos((t - HIT) * 10))); }
    shadow(ball); fans.update(t, t > HIT);
    if (t > HIT && t < HIT + .06) { conf.start(0, 260, 0, 500); say('', 'pt-BR'); text.show('גוווול!!!', '', 'big'); }
    finaleText(text, t, HIT + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// ---- 2. שער בנגיחה: הכדור מגיע מהפינה, השחקן קופץ ונוגח ----
async function headerScene(sc, cam, S, say, text, { oldBest, newBest }) {
  const GZ = -620; const { g, fans } = stadium(sc, GZ); const conf = confetti(sc, 320);
  const [hero, keeper] = await Promise.all([loadCharacter(KITS3D.maccabi), loadCharacter(KITS3D.keeper)]); sc.add(hero.model); sc.add(keeper.model);
  const ball = soccerBallMesh(12); sc.add(ball); const shadow = ballShadow(sc);
  const side = Math.random() < .5 ? -1 : 1; const tx = -side * rnd(60, 110), ty = rnd(30, 90); const gkDir = tx < 0 ? -1 : 1;
  const CROSS = 1.2, HEAD = 3.0, HIT = 3.9, DUR = 10;
  S.murmur(0, 2.6); S.kick(CROSS); S.tension(1.4, 1.6); S.kick(HEAD); S.chant(HIT + .05, 2.4); S.roar(HIT, 4.6); S.drums(HIT + .6);
  const from = new THREE.Vector3(side * 700, 12, GZ + 120), headPt = new THREE.Vector3(0, 165, GZ + 300), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), look = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - HIT - .4) / 1.2, 0, 1);
    cam.position.set(-side * 160 + side * 100 * back, 220 + 30 * back, GZ + 900 + 260 * back); look.set(0, 90, GZ + 200 + 200 * back); cam.lookAt(look);
    // שחקן: הולך לנקודה, מתכופף, קופץ לנגיחה, נוחת, חוגג
    if (t < HEAD - .6) { const k = ease(clamp(t / (HEAD - .6), 0, 1)); heroPos.set(-60 + 60 * k, 0, GZ + 420 - 120 * k); hero.model.rotation.y = Math.PI; hero.rig.apply(poseAt(POSE.jog, t * 650), false, heroPos); }
    else if (t < HEAD + .5) { const k = clamp((t - (HEAD - .6)) / 1.1, 0, 1); heroPos.set(0, Math.sin(k * Math.PI) * 70, GZ + 300); hero.model.rotation.y = Math.PI; hero.rig.apply(k < .25 ? POSE.squat : POSE.jumpUp, false, heroPos); }
    else celebrateStep(hero, t, { x: 0, z: GZ + 300 }, clamp((t - HEAD - .5) / 4, 0, 1));
    let gp = GK.ready; const gkBase = new THREE.Vector3(gkDir * clamp((t - HEAD) / .9, 0, 1) * 90, 0, GZ + 40);
    if (t > HEAD + .1 && t < HIT + .4) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .4) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; keeper.rig.apply(gp, true, gkBase);
    if (t < CROSS) ball.position.copy(from);
    else if (t < HEAD) { const k = (t - CROSS) / (HEAD - CROSS); ball.position.lerpVectors(from, headPt, k); ball.position.y += Math.sin(k * Math.PI) * 120; ball.rotation.z += dt * 8; }
    else if (t < HIT) { const k = (t - HEAD) / (HIT - HEAD); ball.position.lerpVectors(headPt, ballEnd, k); ball.rotation.x -= dt * 10; }
    else { ball.position.copy(ballEnd); g.bulge(Math.max(0, 1 - (t - HIT) / 1.1) * Math.abs(Math.cos((t - HIT) * 10))); }
    shadow(ball); fans.update(t, t > HIT);
    if (t > HIT && t < HIT + .06) { conf.start(0, 260, GZ + 300, 500); say('', 'pt-BR'); text.show('גוווול!!!', 'בנגיחה!', 'big'); }
    finaleText(text, t, HIT + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// ---- מגרש כדורסל ----
function court(sc, HZ) {
  sky(sc, '#111827', '#1f2937', false); lights(sc, { sun: 2.0, ground: '#4a3a2a' });
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#c9954f'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)'; g.fillRect(0, i * 32, 512, 32); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: t, roughness: .6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  // קווים: צבע, קו שלוש (קשת), קו סיום
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(200, 240), new THREE.MeshBasicMaterial({ color: '#0B7A3B' })); paint.rotation.x = -Math.PI / 2; paint.position.set(0, .4, HZ + 130); sc.add(paint);
  const arc = new THREE.Mesh(new THREE.RingGeometry(300, 306, 48, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI; arc.position.set(0, .6, HZ + 60); sc.add(arc);
  line(sc, 0, HZ - 20, 800, 5); line(sc, -400, HZ + 400, 5, 840); line(sc, 400, HZ + 400, 5, 840);
  // סל: עמוד, לוח, טבעת, רשת
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 300, 10), new THREE.MeshStandardMaterial({ color: '#475569' })); pole.position.set(0, 150, HZ - 60); sc.add(pole);
  const board = new THREE.Mesh(new THREE.BoxGeometry(180, 110, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .3 })); board.position.set(0, 300, HZ - 20); sc.add(board);
  const sq = new THREE.Mesh(new THREE.BoxGeometry(60, 45, 2), new THREE.MeshBasicMaterial({ color: '#ef4444' })); sq.position.set(0, 280, HZ - 16); sc.add(sq);
  const RIM_Y = 240; const rim = new THREE.Mesh(new THREE.TorusGeometry(24, 2.5, 8, 32), new THREE.MeshStandardMaterial({ color: '#f97316' })); rim.rotation.x = Math.PI / 2; rim.position.set(0, RIM_Y, HZ + 14); sc.add(rim);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(24, 15, 40, 12, 4, true), new THREE.MeshBasicMaterial({ color: '#f1f5f9', wireframe: true, transparent: true, opacity: .8 })); net.position.set(0, RIM_Y - 20, HZ + 14); sc.add(net);
  const fans = crowd(sc, { count: 120, x0: -700, x1: 700, z: HZ - 300, y: 60, rows: 3, rowDz: -50, rowDy: 34 });
  const st = new THREE.Mesh(new THREE.BoxGeometry(1800, 200, 300), new THREE.MeshStandardMaterial({ color: '#1e293b' })); st.position.set(0, 100, HZ - 480); sc.add(st);
  return { fans, rim, net, RIM_Y, rimPos: new THREE.Vector3(0, RIM_Y, HZ + 14), shake(k) { rim.position.y = RIM_Y - 6 * k; net.scale.set(1 + .3 * k, 1 + .5 * k, 1 + .3 * k); } };
}
function basketBallMesh(r = 14) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f97316'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#111827'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(192, 0); g.lineTo(192, 128); g.stroke(); g.beginPath(); g.ellipse(128, 64, 60, 64, 0, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: .7 })); m.castShadow = true; return m;
}

// ---- 3. סלאם דאנק ----
async function dunkScene(sc, cam, S, say, text, { oldBest, newBest }) {
  const HZ = -420; const w = court(sc, HZ); const conf = confetti(sc, 320);
  const hero = await loadCharacter(KITS3D.maccabi); sc.add(hero.model);
  const ball = basketBallMesh(14); sc.add(ball); const shadow = ballShadow(sc);
  const RUN = 2.4, JUMP = 3.6, DUNK = 3.5, DUR = 10;
  S.murmur(0, 2.4); S.steps(.4, 10, .22); S.tension(1.6, 1.8); S.rim(DUNK); S.roar(DUNK, 4.2); S.drums(DUNK + .5);
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - DUNK - .6) / 1.2, 0, 1);
    cam.position.set(260 - 120 * back, 200 + 40 * back, HZ + 760 + 200 * back); look.set(0, 150 - 40 * back, HZ + 120 + 120 * back); cam.lookAt(look);
    let handY = 0;
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); pos.set(0, 0, HZ + 560 - 380 * k); hero.model.rotation.y = Math.PI; hero.rig.apply(poseAt(POSE.run, t * 650), false, pos); ball.position.set(pos.x + 22, 40 + Math.abs(Math.sin(t * 5)) * 30, pos.z); }
    else if (t < JUMP) { const k = clamp((t - RUN) / (JUMP - RUN), 0, 1); const air = Math.sin(k * Math.PI); pos.set(0, air * 150, HZ + 180 - 140 * k); hero.model.rotation.y = Math.PI; hero.rig.apply(k < .2 ? POSE.squat : POSE.jumpUp, false, pos); handY = pos.y + 250; if (t < DUNK) ball.position.set(0, handY, pos.z - 30); else ball.position.set(0, w.RIM_Y - 30 - (t - DUNK) * 250, HZ + 14); }
    else { celebrateStep(hero, t, { x: 40, z: HZ + 40 }, clamp((t - JUMP) / 4, 0, 1)); const fall = w.RIM_Y - 30 - (t - DUNK) * 250; ball.position.set(0, Math.max(14, fall), HZ + 14); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin((t - JUMP) * 4)) * 20 * Math.max(0, 1 - (t - JUMP) / 2); }
    w.shake(Math.max(0, 1 - (t - DUNK) / 1.2) * (t > DUNK ? Math.abs(Math.cos((t - DUNK) * 9)) : 0));
    shadow(ball); w.fans.update(t, t > DUNK);
    if (t > DUNK && t < DUNK + .06) { conf.start(0, 320, HZ + 100, 400); say('', 'pt-BR'); text.show('סלאם דאנק!', '', 'big'); }
    finaleText(text, t, DUNK + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// ---- 4. קליעת שלוש ----
async function threeScene(sc, cam, S, say, text, { oldBest, newBest }) {
  const HZ = -420; const w = court(sc, HZ); const conf = confetti(sc, 320);
  const hero = await loadCharacter(KITS3D.maccabi); sc.add(hero.model);
  const ball = basketBallMesh(14); sc.add(ball); const shadow = ballShadow(sc);
  const SHOOT = 2.2, SWISH = 3.9, DUR = 10;
  S.murmur(0, 2.2); S.tension(1.2, 2.6); S.swish(SWISH); S.roar(SWISH, 4.2); S.drums(SWISH + .5);
  const from = new THREE.Vector3(0, 250, HZ + 330), rimP = w.rimPos.clone();
  const pos = new THREE.Vector3(0, 0, HZ + 360), look = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - SWISH - .4) / 1.2, 0, 1);
    cam.position.set(-200 + 160 * back, 240, HZ + 820 + 300 * back); look.set(0, 130, HZ + 60 + 200 * back); cam.lookAt(look); /* רואים גם את הקולע (z+360) וגם את הסל */
    if (t < SHOOT - .5) { hero.model.rotation.y = Math.PI; hero.rig.apply(POSE.squat, false, pos); ball.position.set(pos.x, 150, pos.z - 30); }
    else if (t < SHOOT + .6) { const k = clamp((t - (SHOOT - .5)) / 1.1, 0, 1); pos.y = Math.sin(k * Math.PI) * 50; hero.model.rotation.y = Math.PI; hero.rig.apply(POSE.jumpUp, false, pos); if (t < SHOOT) ball.position.set(0, 150 + k * 200, pos.z - 30); }
    else celebrateStep(hero, t, { x: 0, z: HZ + 360 }, clamp((t - SHOOT - .6) / 4, 0, 1));
    if (t >= SHOOT && t < SWISH) { const k = (t - SHOOT) / (SWISH - SHOOT); ball.position.lerpVectors(from, rimP, k); ball.position.y += Math.sin(k * Math.PI) * 220; ball.rotation.x -= dt * 6; }
    else if (t >= SWISH) { const fall = rimP.y - (t - SWISH) * 220; ball.position.set(0, Math.max(14, fall), rimP.z); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin((t - SWISH) * 4)) * 24 * Math.max(0, 1 - (t - SWISH) / 2.5); }
    w.shake(t > SWISH ? Math.max(0, 1 - (t - SWISH) / .8) * .6 : 0);
    shadow(ball); w.fans.update(t, t > SWISH);
    if (t > SWISH && t < SWISH + .06) { conf.start(0, 320, HZ + 100, 400); say('', 'pt-BR'); text.show('שלוש!', 'סוויש', 'big'); }
    finaleText(text, t, SWISH + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// ---- 5. ריצת 100 מטר ----
async function sprintScene(sc, cam, S, say, text, { oldBest, newBest }) {
  sky(sc, '#0b1026', '#1e293b'); lights(sc, { sun: 1.6, ground: '#3f1d1d' });
  const track = new THREE.Mesh(new THREE.PlaneGeometry(2600, 420), new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 1 })); track.rotation.x = -Math.PI / 2; track.receiveShadow = true; sc.add(track);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#2f9e44', roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.y = -.5; sc.add(grass);
  for (let i = 0; i <= 3; i++) line(sc, 0, -210 + i * 140, 2600, 4);
  const FIN = 260; for (let j = 0; j < 14; j++) { const sq = new THREE.Mesh(new THREE.PlaneGeometry(16, 30), new THREE.MeshBasicMaterial({ color: j % 2 ? '#111' : '#fff' })); sq.rotation.x = -Math.PI / 2; sq.position.set(FIN, .7, -210 + 15 + j * 30); sc.add(sq); }
  const fans = stands(sc, -330, 20); const conf = confetti(sc, 320);
  const runners = await Promise.all([KITS3D.grey, KITS3D.orange, KITS3D.maccabi].map(k => loadCharacter(k)));
  const lanes = runners.map((r, i) => { sc.add(r.model); return { r, z: -140 + i * 140, speed: [.8, .9, 1][i], ph: 0, x: -520 }; });
  const START = .8, DUR_RUN = 3.4, WIN = START + DUR_RUN + .1, DUR = 10.5;
  S.gun(START); S.steps(START + .1, 16, .2); S.murmur(.5, 3.2); S.tension(1.4, 2.4); S.chant(WIN + .05, 2.2); S.roar(WIN, 4.3); S.drums(WIN + .45, 6);
  text.show('למקומות...', '', '');
  const pos = new THREE.Vector3();
  return { dur: DUR, update(t, dt) {
    const run = t > START; const heroL = lanes[2];
    lanes.forEach((l, i) => {
      const k = run ? (t - START) / DUR_RUN * l.speed : 0; l.x = -520 + 760 * Math.pow(clamp(k, 0, 1), .85) + Math.max(0, k - 1) * 400; const crossed = l.x >= FIN; const hero = i === 2;
      const hz = run ? Math.min(2.8, .8 + (t - START) * 1.4) * l.speed : 0; l.ph += hz * dt; /* צעדים איטיים וברורים */
      const pose = !run ? POSE.ready : (crossed && hero) ? (Math.sin(t * BOUNCE) > 0 ? POSE.armsUp : POSE.jumpUp) : (k > .85 && !crossed) ? LEAN : poseAt(SPRINT, (l.ph % 1) * 8);
      const front = crossed && hero; pos.set(hero && crossed ? Math.min(l.x, FIN + 120) : l.x, front ? Math.abs(Math.sin(t * BOUNCE)) * 20 : 0, l.z);
      l.r.model.rotation.y = front ? 0 : Math.PI / 2; l.r.rig.apply(pose, front, pos);
    });
    const hx = Math.min(heroL.x, FIN + 120), fin = heroL.x >= FIN;
    cam.position.set(hx + (fin ? 20 : 60), fin ? 200 : 240, heroL.z + (fin ? 700 : 820)); cam.lookAt(hx + (fin ? 10 : 40), 100, heroL.z - (fin ? 40 : 160));
    fans.update(t, t > WIN);
    if (t >= START && t < WIN) text.show(`${Math.min(9.58, (t - START) / DUR_RUN * 9.58).toFixed(2)}`, '', 'clock');
    if (t > WIN && t < WIN + .06) { conf.start(FIN + 100, 260, 0, 400); say('', 'pt-BR'); text.show('מקום ראשון!', '9.58', 'big'); }
    finaleText(text, t, WIN + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// חגיגת שיא חדש בתלת-ממד: אותה דמות כמו במסך התרגיל (Kenney, חולצת מכבי חיפה) באצטדיון או במגרש כדורסל.
// חמש סצנות: שער מבעיטה, שער בנגיחה, סלאם דאנק, קליעת שלוש, ריצת 100 מטר. הקצב איטי וברור (רועי, 30/09).
// הצלילים והקריין מהגרסה הדו-ממדית (makeAudio, ההקלטות של רועי). בלי WebGL, או אם הטעינה נכשלה, המנוע חוזר לגרסה הדו-ממדית.
import { THREE, hasWebGL, loadCharacter, KITS3D, lights, crowd, confetti, soccerBallMesh, makeRenderer } from '../char3d.js';
import { makeAudio, SPRINT, LEAN, poseAt, celebrate as celebrate2d } from './celebrate.js';
import { lerpPose } from '../figure.js';
import { POSE, GK } from './sprites.js';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, easeOut = t => 1 - Math.pow(1 - t, 3);
export const SCENE_IDS_3D = ['goal', 'header', 'dunk', 'three', 'sprint'];
const BOUNCE = 3.2; // קצב הקפיצות בחגיגה (רדיאנים לשנייה; נמוך = איטי וברור)
// מעבר רך: הדמות מתקרבת לפוזת היעד בכל פריים (מסנן אקספוננציאלי), כך שאין קפיצות בין פוזות. הפעם הראשונה או שינוי מבט = ישר ליעד
function pose(ch, target, front, pos, dt, speed = 9) {
  if (!ch.cur || ch.front !== front) { ch.cur = target; ch.front = front; }
  else ch.cur = lerpPose(ch.cur, target, 1 - Math.exp(-speed * dt));
  ch.rig.apply(ch.cur, front, pos);
}
// מצלמה מרוככת: מתחילים בצילום רחב של כל הזירה (זום החוצה), ואז מתקרבים בעדינות לתסריט (רועי: "להתחיל בזום החוצה")
function camRig(cam, wide, wideLook) {
  const p = wide.clone(), l = wideLook.clone(); cam.position.copy(p); cam.lookAt(l);
  return (t, dt, want, wantLook) => { const tgt = t < 1.4 ? wide : want, tl = t < 1.4 ? wideLook : wantLook; const k = 1 - Math.exp(-(t < 1.4 ? 1.2 : 1.8) * dt); p.lerp(tgt, k); l.lerp(tl, k); cam.position.copy(p); cam.lookAt(l); };
}

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
    const sc = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(48, W / H, 1, 6000);
    const build = { goal: goalScene, header: headerScene, dunk: dunkScene, three: threeScene, sprint: sprintScene }[id];
    const world = await build(sc, cam, S, say, text, { oldBest, newBest });
    if (stopped) return;
    const t0 = performance.now(); let last = t0;
    let tt = 0;
    const frame = now => { let t, dt; if (window.__c3dStep) { dt = window.__c3dStep; tt += dt; t = tt; } else { t = (now - t0) / 1000; dt = Math.min(.05, (now - last) / 1000); } last = now; window.__c3dT = t; world.update(t, dt); renderer.render(sc, cam); if (t < world.dur) raf = requestAnimationFrame(frame); else { cleanup(); onDone && onDone(); } };
    raf = requestAnimationFrame(frame);
  };
  let fallbackStop = null;
  run().catch(e => { console.warn('celebrate3d', e); window.__c3dError = String(e && e.message || e); cleanup(); if (!stopped) { stopped = true; try { fallbackStop = celebrate2d(canvas, { oldBest, newBest, sound, onText, onDone, scene: null }); } catch (e2) { onDone && onDone(); } } });
  return () => { stopped = true; cleanup(); if (fallbackStop) fallbackStop(); };
}

// ---- בניית עולם ----
function pitch(sc) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2f9e44' : '#37b24d'; g.fillRect(0, i * 64, 512, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; sc.add(m);
}
const line = (sc, x, z, lw, ld, y = .6) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); l.rotation.x = -Math.PI / 2; l.position.set(x, y, z); sc.add(l); return l; };
// קנה מידה: הדמות כ-165 יח' = 1.75 מ', כלומר 94 יח' למטר. שער 7.32×2.44 מ' = 690×230, טבעת 3.05 מ' = 290, קהל בגובה הדמות
function stands(sc, z, y = 60) {
  const st = new THREE.Mesh(new THREE.BoxGeometry(4200, 560, 900), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 1 })); st.position.set(0, y + 140, z - 450); sc.add(st);
  return crowd(sc, { count: 150, x0: -1800, x1: 1800, z: z + 10, y: y + 420, rows: 3, rowDz: -150, rowDy: 95 });
}
function sky(sc, top = '#0b1026', bottom = '#1e293b', lamps = true) {
  sc.background = new THREE.Color(bottom); sc.fog = new THREE.Fog(bottom, 1500, 3500);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
  if (lamps) for (const x of [-700, 700]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 700, 8), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); pole.position.set(x, 350, -900); sc.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(120, 40, 20), new THREE.MeshBasicMaterial({ color: '#fef9c3' })); lamp.position.set(x, 700, -900); sc.add(lamp); }
}
function goalFrame(sc, z, w = 690, h = 230, d = 200) {
  const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .5 });
  for (const x of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, h, 10), mat); p.position.set(x, h / 2, z); p.castShadow = true; sc.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, w, 10), mat); bar.rotation.z = Math.PI / 2; bar.position.set(0, h, z); sc.add(bar);
  const netMat = new THREE.MeshBasicMaterial({ color: '#e2e8f0', wireframe: true, transparent: true, opacity: .55 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 24, 8), netMat); back.position.set(0, h / 2, z - d); sc.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 24, 6), netMat); top.rotation.x = -Math.PI / 2; top.position.set(0, h, z - d / 2); sc.add(top);
  for (const x of [-w / 2, w / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(d, h, 6, 8), netMat); side.rotation.y = Math.PI / 2; side.position.set(x, h / 2, z - d / 2); sc.add(side); }
  return { bulge(k) { back.position.z = z - d - 60 * k; } };
}
function ballShadow(sc) { const m = new THREE.Mesh(new THREE.CircleGeometry(12, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .3 })); m.rotation.x = -Math.PI / 2; sc.add(m); return (b) => { m.position.set(b.position.x, .8, b.position.z); m.scale.setScalar(Math.max(.4, 1 - b.position.y / 200)); }; }
function stadium(sc, GZ) { sky(sc); lights(sc, { sun: 1.8, ground: '#1e3a2f' }); pitch(sc); const g = goalFrame(sc, GZ); const fans = stands(sc, GZ - 380, 40); line(sc, 0, GZ, 3400, 6); line(sc, 0, GZ + 520, 1700, 6); line(sc, -850, GZ + 260, 6, 520); line(sc, 850, GZ + 260, 6, 520); return { g, fans }; }
// חגיגה משותפת: קפיצות עם ידיים למעלה, פונה למצלמה, מתקדם לאט אליה
// סיבוב רך של הדמות לזווית יעד (הקשת הקצרה), במקום קפיצה
function face(ch, ang, dt, speed = 5) { let d = ang - ch.model.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); ch.model.rotation.y += d * (1 - Math.exp(-speed * dt)); }
// רגליים מפוזה אחת וידיים מאחרת (ריצה עם ידיים באוויר)
const ARMS = ['le', 'lh', 're', 'rh'];
// כדרור: היד השמאלית (במבט צד = LeftHand) יורדת קדימה-למטה אל הכדור, השאר מהפוזת הריצה
function dribblePose(p) { const o = { ...p }; const [hx, hy] = p.hip; o.le = [hx + 10, hy + 18]; o.lh = [hx + 24, hy + 42]; return o; }
function mixParts(legs, arms) { const out = { ...legs }; for (const j of ARMS) out[j] = arms[j]; return out; }
// כוריאוגרפיית חגיגה (u = שניות מתחילת החגיגה): מסתובב למצלמה עם ידיים למעלה, רץ לעברה, קופץ כמה פעמים, ואז עומד ומנופף
function celebrateStep(ch, u, from, dt, dir = 1, { base = 0, dx = 24 * dir, dz = 130 } = {}) {
  const RUN0 = .8, RUN1 = 2.6, JUMP1 = 5.4; /* base = הזווית שפונה למצלמה, (dx, dz) = לאן רצים */
  const pos = new THREE.Vector3(from.x, 0, from.z);
  let target, faceAng = base;
  if (u < RUN0) { target = POSE.armsUp; faceAng = base + Math.PI - .3 * dir; /* מתחיל להסתובב */ }
  else if (u < RUN1) { const k = ease(clamp((u - RUN0) / (RUN1 - RUN0), 0, 1)); pos.x += dx * k; pos.z += dz * k; target = mixParts(poseAt(POSE.jog, (u - RUN0) * 700), POSE.armsUp); pos.y = Math.abs(Math.sin((u - RUN0) * 7)) * 3; }
  else if (u < JUMP1) { const v = (u - RUN1) * BOUNCE; pos.x += dx; pos.z += dz; const mix = (1 - Math.cos(v)) / 2; target = lerpPose(POSE.armsUp, POSE.jumpUp, mix); pos.y = Math.max(0, Math.sin(v - Math.PI / 2)) * 24; faceAng = base + Math.sin(u * 1.3) * .2; }
  else { pos.x += dx; pos.z += dz; const w = Math.sin((u - JUMP1) * 2.2); target = lerpPose(POSE.armsUp, POSE.jumpUp, .25 + .2 * w); faceAng = base + w * .12; }
  face(ch, faceAng, dt, u < RUN0 ? 4 : 5); pose(ch, target, true, pos, dt, u < RUN1 ? 14 : 9);
}
// פוזות זריקה לשלוש במבט מהצד (+x = לכיוון הסל): אחיזה בחזה, ירידה, זינוק ושחרור מעל הראש, מעקב שורש כף היד, נחיתה
const SHOT = {
  hold: { head: [102, 52], neck: [101, 68], hip: [100, 116], le: [108, 100], lh: [117, 90], re: [110, 102], rh: [119, 92], lk: [100, 150], lf: [97, 182], rk: [102, 150], rf: [104, 182] },
  dip: { head: [106, 66], neck: [104, 82], hip: [98, 130], le: [110, 112], lh: [118, 104], re: [112, 114], rh: [120, 106], lk: [106, 158], lf: [97, 182], rk: [108, 158], rf: [105, 182] },
  release: { head: [104, 40], neck: [102, 56], hip: [100, 104], le: [110, 38], lh: [116, 14], re: [108, 44], rh: [114, 22], lk: [100, 140], lf: [98, 174], rk: [103, 140], rf: [105, 174] },
  follow: { head: [104, 40], neck: [102, 56], hip: [100, 104], le: [110, 36], lh: [124, 22], re: [108, 42], rh: [118, 26], lk: [102, 138], lf: [104, 168], rk: [104, 140], rf: [108, 170] },
  land: { head: [102, 54], neck: [101, 70], hip: [100, 120], le: [106, 74], lh: [112, 52], re: [108, 78], rh: [114, 56], lk: [102, 152], lf: [98, 182], rk: [104, 152], rf: [105, 182] },
};
const finaleText = (text, t, at, newBest, oldBest) => { if (t > at && t < at + .06) text.show(`שיא חדש: ${newBest}`, oldBest ? `השיא הקודם: ${oldBest}` : 'הפעם הראשונה!', 'gold'); };

// ---- 1. שער מבעיטה ----
async function goalScene(sc, cam, S, say, text, { oldBest, newBest }) {
  const GZ = -620; const { g, fans } = stadium(sc, GZ); const conf = confetti(sc, 320);
  const [hero, keeper] = await Promise.all([loadCharacter(KITS3D.maccabi), loadCharacter(KITS3D.keeper)]); sc.add(hero.model); sc.add(keeper.model);
  const ball = soccerBallMesh(12); sc.add(ball); const shadow = ballShadow(sc);
  const tx = (Math.random() < .5 ? -1 : 1) * rnd(150, 290), ty = rnd(40, 190); const gkDir = tx < 0 ? -1 : 1;
  const RUN = 2.2, KICK = 2.6, HIT = 3.5, DUR = 10;
  S.murmur(0, 2.4); S.tension(0.8, 1.8); S.kick(KICK); S.chant(HIT + .05, 2.4); S.roar(HIT, 4.6); S.drums(HIT + .6);
  const ballStart = new THREE.Vector3(0, 12, -60), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(640, 460, 1150), new THREE.Vector3(-90, 60, -120));
  return { dur: DUR, update(t, dt) {
    const zoom = clamp((t - KICK) / 1.0, 0, 1), back = clamp((t - HIT) / 1.0, 0, 1);
    camPos.set(200 - 90 * zoom + 10 * back, 300 - 70 * zoom + 70 * back, 820 - 200 * zoom + 480 * back); look.set(0, 90 - 20 * zoom + 20 * back, -260 + 80 * zoom + 60 * back);
    camera(t, dt, camPos, look);
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); heroPos.set(-220 + 190 * k, 0, 260 - 300 * k); hero.model.rotation.y = Math.atan2(190, -300); pose(hero, poseAt(POSE.run, t * 650), false, heroPos, dt, 14); }
    else if (t < KICK + .5) { heroPos.set(-30, 0, -40); face(hero, Math.PI, dt, 9); pose(hero, POSE.leap, false, heroPos, dt); } /* פונה לשער */
    else celebrateStep(hero, t - KICK - .5, { x: -30, z: -40 }, dt);
    // שוער: עומד מוכן, צולל לאט לכיוון הכדור, נוחת ושוכב
    let gp = GK.ready; const gkBase = new THREE.Vector3(gkDir * clamp((t - KICK) / .9, 0, 1) * 170, 0, GZ + 40);
    if (t > KICK + .1 && t < HIT + .4) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .4) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; pose(keeper, gp, true, gkBase, dt, 7);
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
  const side = Math.random() < .5 ? -1 : 1; const tx = -side * rnd(150, 270), ty = rnd(40, 180); const gkDir = tx < 0 ? -1 : 1;
  const CROSS = 1.2, HEAD = 3.0, HIT = 3.9, DUR = 10;
  S.murmur(0, 2.6); S.kick(CROSS); S.tension(1.4, 1.6); S.kick(HEAD); S.chant(HIT + .05, 2.4); S.roar(HIT, 4.6); S.drums(HIT + .6);
  const from = new THREE.Vector3(side * 700, 12, GZ + 120), headPt = new THREE.Vector3(0, 165, GZ + 300), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(-side * 720, 480, GZ + 1550), new THREE.Vector3(0, 60, GZ + 200));
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - HIT) / 1.0, 0, 1);
    want.set(-side * 240 + side * 140 * back, 260 + 30 * back, GZ + 1150 + 220 * back); look.set(0, 120 - 40 * back, GZ + 150 + 200 * back); camera(t, dt, want, look);
    // שחקן: הולך לנקודה, מתכופף, קופץ לנגיחה, נוחת, חוגג
    if (t < HEAD - .6) { const k = ease(clamp(t / (HEAD - .6), 0, 1)); heroPos.set(-60 + 60 * k, 0, GZ + 420 - 120 * k); hero.model.rotation.y = Math.PI; pose(hero, poseAt(POSE.jog, t * 650), false, heroPos, dt, 14); }
    else if (t < HEAD + .5) { const k = clamp((t - (HEAD - .6)) / 1.1, 0, 1); heroPos.set(0, Math.sin(k * Math.PI) * 70, GZ + 300); hero.model.rotation.y = Math.PI; pose(hero, k < .25 ? POSE.squat : POSE.jumpUp, false, heroPos, dt, 11); }
    else celebrateStep(hero, t - HEAD - .5, { x: 0, z: GZ + 300 }, dt);
    let gp = GK.ready; const gkBase = new THREE.Vector3(gkDir * clamp((t - HEAD) / .9, 0, 1) * 170, 0, GZ + 40);
    if (t > HEAD + .1 && t < HIT + .4) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .4) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; pose(keeper, gp, true, gkBase, dt, 7);
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
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(460, 545), new THREE.MeshBasicMaterial({ color: '#0B7A3B' })); paint.rotation.x = -Math.PI / 2; paint.position.set(0, .4, HZ + 272); sc.add(paint);
  const arc = new THREE.Mesh(new THREE.RingGeometry(635, 641, 64, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI; arc.position.set(0, .6, HZ + 60); sc.add(arc);
  line(sc, 0, HZ - 20, 1500, 6); line(sc, -750, HZ + 700, 6, 1440); line(sc, 750, HZ + 700, 6, 1440);
  // סל: עמוד, לוח, טבעת, רשת
  const RIM_Y = 290; /* 3.05 מ' */
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 380, 10), new THREE.MeshStandardMaterial({ color: '#475569' })); pole.position.set(0, 190, HZ - 80); sc.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 70), new THREE.MeshStandardMaterial({ color: '#475569' })); arm.position.set(0, 372, HZ - 50); sc.add(arm);
  const board = new THREE.Mesh(new THREE.BoxGeometry(170, 100, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .3 })); board.position.set(0, RIM_Y + 32, HZ - 20); sc.add(board);
  const sq = new THREE.Mesh(new THREE.BoxGeometry(56, 42, 2), new THREE.MeshBasicMaterial({ color: '#ef4444' })); sq.position.set(0, RIM_Y + 18, HZ - 16); sc.add(sq); const rim = new THREE.Mesh(new THREE.TorusGeometry(22, 2.5, 8, 32), new THREE.MeshStandardMaterial({ color: '#f97316' })); rim.rotation.x = Math.PI / 2; rim.position.set(0, RIM_Y, HZ + 14); sc.add(rim);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(22, 14, 42, 12, 4, true), new THREE.MeshBasicMaterial({ color: '#f1f5f9', wireframe: true, transparent: true, opacity: .8 })); net.position.set(0, RIM_Y - 20, HZ + 14); sc.add(net);
  const fans = crowd(sc, { count: 120, x0: -1500, x1: 1500, z: HZ - 360, y: 60, rows: 3, rowDz: -130, rowDy: 90 });
  const st = new THREE.Mesh(new THREE.BoxGeometry(3400, 480, 700), new THREE.MeshStandardMaterial({ color: '#1e293b' })); st.position.set(0, 240, HZ - 780); sc.add(st);
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
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3(), handV = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(820, 440, HZ + 1550), new THREE.Vector3(0, 120, HZ + 250));
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - DUNK - .2) / 1.0, 0, 1);
    want.set(320 - 180 * back, 300 - 20 * back, HZ + 1050 + 250 * back); look.set(0, 210 - 100 * back, HZ + 150 + 150 * back); camera(t, dt, want, look);
    let handY = 0;
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); pos.set(0, 0, HZ + 860 - 680 * k); hero.model.rotation.y = Math.PI; pose(hero, dribblePose(poseAt(POSE.run, t * 650)), false, pos, dt, 14); const hp = hero.rig.b.LeftHand.getWorldPosition(handV); const bounce = Math.abs(Math.sin(t * Math.PI * 2.2)); ball.position.set(hp.x, 14 + Math.max(0, hp.y - 14 - 14) * bounce, hp.z); }
    else if (t < JUMP) { const k = clamp((t - RUN) / (JUMP - RUN), 0, 1); const air = Math.sin(k * Math.PI); pos.set(0, air * 150, HZ + 180 - 140 * k); hero.model.rotation.y = Math.PI; pose(hero, k < .2 ? POSE.squat : POSE.jumpUp, false, pos, dt); handY = pos.y + 250; if (t < DUNK) ball.position.set(0, handY, pos.z - 30); else ball.position.set(0, w.RIM_Y - 30 - (t - DUNK) * 250, HZ + 14); }
    else { celebrateStep(hero, t - JUMP, { x: 40, z: HZ + 40 }, dt); const fall = w.RIM_Y - 30 - (t - DUNK) * 250; ball.position.set(0, Math.max(14, fall), HZ + 14); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin((t - JUMP) * 4)) * 20 * Math.max(0, 1 - (t - JUMP) / 2); }
    w.shake(Math.max(0, 1 - (t - DUNK) / 1.2) * (t > DUNK ? Math.abs(Math.cos((t - DUNK) * 9)) : 0));
    shadow(ball); w.fans.update(t, t > DUNK);
    if (t > DUNK && t < DUNK + .06) { conf.start(0, 320, HZ + 100, 400); say('', 'pt-BR'); text.show('סלאם דאנק!', '', 'big'); }
    finaleText(text, t, DUNK + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// ---- 4. קליעת שלוש ----
async function threeScene(sc, cam, S, say, text, { oldBest, newBest }) {
  /* רועי 30/09: "עדיף שזה יראה כמו זריקה מהצד וזה יהיה זורם": מצלמה מהצד, הזורק מימין והסל משמאל, קשת הכדור חוצה את המסך; תנועת זריקה רציפה: אחיזה → ירידה → זינוק ושחרור → מעקב → נחיתה */
  const HZ = -420; const w = court(sc, HZ); const conf = confetti(sc, 320);
  const hero = await loadCharacter(KITS3D.maccabi); sc.add(hero.model);
  const ball = basketBallMesh(14); sc.add(ball); const shadow = ballShadow(sc);
  const DIP = 1.1, RISE = 1.9, SHOOT = 2.3, LAND = 3.0, SWISH = 3.9, DUR = 10.5;
  S.murmur(0, 2.2); S.tension(1.2, 2.6); S.swish(SWISH); S.roar(SWISH, 4.2); S.drums(SWISH + .5);
  const SZ = HZ + 420; /* עומק הזורק: 4.5 מ' מהסל */ const rimP = w.rimPos.clone(); const from = new THREE.Vector3();
  const pos = new THREE.Vector3(0, 0, SZ), look = new THREE.Vector3(), want = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(-1150, 440, SZ - 80), new THREE.Vector3(0, 150, SZ - 200));
  let released = false;
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - SWISH) / 1.0, 0, 1);
    want.set(-880 - 100 * back, 260 + 40 * back, SZ - 215 + 140 * back); look.set(0, 210 - 60 * back, SZ - 215 + 60 * back); camera(t, dt, want, look);
    if (t < SWISH + .5) hero.model.rotation.y = Math.PI; /* פונה לסל (-Z); אחר כך face() מסובב למצלמה */
    if (t < DIP) { pose(hero, SHOT.hold, false, pos, dt, 6); }
    else if (t < RISE) { pose(hero, SHOT.dip, false, pos, dt, 5); }
    else if (t < SHOOT) { const k = clamp((t - RISE) / (SHOOT - RISE), 0, 1); pos.y = ease(k) * 26; pose(hero, SHOT.release, false, pos, dt, 10); }
    else if (t < LAND) { const k = clamp((t - SHOOT) / (LAND - SHOOT), 0, 1); pos.y = Math.max(0, 26 + 60 * Math.sin(k * Math.PI) - 26 * k); pose(hero, k < .6 ? SHOT.follow : SHOT.land, false, pos, dt, 8); }
    else if (t < SWISH + .5) { pos.y = 0; pose(hero, SHOT.land, false, pos, dt, 6); }
    else celebrateStep(hero, t - SWISH - .5, { x: 0, z: SZ }, dt, 1, { base: -Math.PI / 2, dx: -150, dz: -40 }); /* פונה למצלמה שבצד -X ורץ אליה */
    /* הכדור: בידיים עד השחרור, ואז קשת אל הטבעת */
    if (t < SHOOT) { hero.rig.b.LeftHand.getWorldPosition(hl); hero.rig.b.RightHand.getWorldPosition(hr); ball.position.lerpVectors(hl, hr, .5); ball.position.z -= 10; ball.position.y += 6; from.copy(ball.position); }
    else if (t < SWISH) { const k = (t - SHOOT) / (SWISH - SHOOT); ball.position.lerpVectors(from, rimP, k); ball.position.y += Math.sin(k * Math.PI) * 110; ball.rotation.x -= dt * 5; if (!released) { released = true; } }
    else { const fall = rimP.y - (t - SWISH) * 220; ball.position.set(0, Math.max(14, fall), rimP.z); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin((t - SWISH) * 4)) * 24 * Math.max(0, 1 - (t - SWISH) / 2.5); }
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
  const pos = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(-560, 440, 1350), new THREE.Vector3(-380, 60, 0));
  return { dur: DUR, update(t, dt) {
    const run = t > START; const heroL = lanes[2];
    lanes.forEach((l, i) => {
      const k = run ? (t - START) / DUR_RUN * l.speed : 0; l.x = -520 + 760 * Math.pow(clamp(k, 0, 1), .85) + Math.max(0, k - 1) * 400; const crossed = l.x >= FIN; const hero = i === 2;
      const hz = run ? Math.min(2.8, .8 + (t - START) * 1.4) * l.speed : 0; l.ph += hz * dt; /* צעדים איטיים וברורים */
      const stopX = hero ? FIN + 120 : Infinity; const stopped = false; /* האחרים ממשיכים לרוץ החוצה מהפריים */
      const target = !run ? POSE.ready : (crossed && hero) ? lerpPose(POSE.armsUp, POSE.jumpUp, (Math.sin(t * BOUNCE * .5) + 1) / 2) : stopped ? POSE.stand : (k > .85 && !crossed) ? LEAN : poseAt(SPRINT, (l.ph % 1) * 8);
      const front = crossed && hero; pos.set(crossed ? Math.min(l.x, stopX) : l.x, front ? Math.max(0, Math.sin(t * BOUNCE)) * 18 : 0, l.z);
      if (front) face(l.r, Math.sin(t * 1.3) * .2, dt, 5); else l.r.model.rotation.y = Math.PI / 2; pose(l.r, target, front, pos, dt, run && !crossed ? 16 : 9);
    });
    const hx = Math.min(heroL.x, FIN + 120), fin = heroL.x >= FIN;
    want.set(hx + (fin ? 20 : 60), fin ? 260 : 260, heroL.z + (fin ? 1000 : 900)); look.set(hx + (fin ? 10 : 40), 100, heroL.z - (fin ? 40 : 160)); camera(t, dt, want, look);
    fans.update(t, t > WIN);
    if (t >= START && t < WIN) text.show(`${Math.min(9.58, (t - START) / DUR_RUN * 9.58).toFixed(2)}`, '', 'clock');
    if (t > WIN && t < WIN + .06) { conf.start(FIN + 100, 260, 0, 400); say('', 'pt-BR'); text.show('מקום ראשון!', '9.58', 'big'); }
    finaleText(text, t, WIN + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

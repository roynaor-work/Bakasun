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
function camRig(cam, wide, wideLook, wideT = 1.4) {
  const p = wide.clone(), l = wideLook.clone(); cam.position.copy(p); cam.lookAt(l);
  return (t, dt, want, wantLook) => { const tgt = t < wideT ? wide : want, tl = t < wideT ? wideLook : wantLook; const k = 1 - Math.exp(-(t < wideT ? 1.2 : 1.8) * dt); p.lerp(tgt, k); l.lerp(tl, k); cam.position.copy(p); cam.lookAt(l); };
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
// מחזור ריצה לפי מרחק שעברנו: צעד כל ~90 יח' (SPRINT = 8 פריימים גאומטריים עם ברכיים נכונות)
const runPose = (dist, stride = 90) => poseAt(SPRINT, ((dist / stride) % 1) * 8);
// רגליים מפוזה אחת וידיים מאחרת (ריצה עם ידיים באוויר)
const ARMS = ['le', 'lh', 're', 'rh'];
// כדרור: היד השמאלית (במבט צד = LeftHand) יורדת קדימה-למטה אל הכדור, השאר מהפוזת הריצה
function dribblePose(p) { const o = { ...p }; const [hx, hy] = p.hip; o.le = [hx + 10, hy + 18]; o.lh = [hx + 24, hy + 42]; return o; }
function mixParts(legs, arms) { const out = { ...legs }; for (const j of ARMS) out[j] = arms[j]; return out; }
// כוריאוגרפיית חגיגה (u = שניות מתחילת החגיגה): מסתובב למצלמה עם ידיים למעלה, רץ לעברה, קופץ כמה פעמים, ואז עומד ומנופף
function celebrateStep(ch, u, from, dt, dir = 1, { base = 0, dx = 24 * dir, dz = 130 } = {}) {
  const RUN0 = .8, RUN1 = 2.6, JUMP1 = 3.6; /* base = הזווית שפונה למצלמה, (dx, dz) = לאן רצים */
  const pos = new THREE.Vector3(from.x, 0, from.z);
  let target, faceAng = base;
  if (u < RUN0) { target = POSE.armsUp; faceAng = base + Math.PI - .3 * dir; /* מתחיל להסתובב */ }
  else if (u < RUN1) { const k = ease(clamp((u - RUN0) / (RUN1 - RUN0), 0, 1)); pos.x += dx * k; pos.z += dz * k; target = mixParts(poseAt(POSE.jog, (u - RUN0) * 700), POSE.armsUp); pos.y = Math.abs(Math.sin((u - RUN0) * 7)) * 3; }
  else if (u < JUMP1) { /* קפיצת "סיו": ניתור גבוה עם סיבוב שלם באוויר, ידיים למעלה בעלייה, ונחיתה ברגליים פתוחות וידיים למטה-אחורה */ const k = (u - RUN1) / (JUMP1 - RUN1); pos.x += dx; pos.z += dz; pos.y = Math.sin(k * Math.PI) * 70; target = k < .5 ? lerpPose(POSE.armsUp, POSE.jumpUp, k * 2) : lerpPose(POSE.jumpUp, SIU, (k - .5) * 2); ch.model.rotation.y = base + ease(k) * Math.PI * 2; pose(ch, target, true, pos, dt, 12); return; }
  else { pos.x += dx; pos.z += dz; const w = Math.sin((u - JUMP1) * 3); pos.y = 0; target = SIU; faceAng = base + w * .05; pos.y = Math.abs(w) * 1.5; }
  face(ch, faceAng, dt, u < RUN0 ? 4 : 5); pose(ch, target, true, pos, dt, u < RUN1 ? 14 : 9);
}
// בעיטה במבט מהצד (+x = לכיוון השער): רגל אחת נטועה, השנייה אחורה → פוגעת → ממשיכה למעלה (רועי: "בועט עם שתי הרגליים")
const KICKP = {
  back: { head: [106, 54], neck: [104, 70], hip: [100, 116], le: [112, 92], lh: [124, 82], re: [88, 92], rh: [78, 102], lk: [104, 150], lf: [106, 182], rk: [86, 140], rf: [76, 164] },
  hit: { head: [98, 54], neck: [98, 70], hip: [100, 114], le: [84, 92], lh: [74, 104], re: [114, 88], rh: [126, 78], lk: [98, 150], lf: [96, 182], rk: [118, 138], rf: [136, 160] },
  follow: { head: [92, 56], neck: [94, 72], hip: [100, 112], le: [82, 92], lh: [70, 102], re: [112, 84], rh: [124, 70], lk: [98, 148], lf: [96, 178], rk: [120, 118], rf: [134, 98] },
};
// נגיחה בקפיצה קדימה: קשת אחורה (ידיים למעלה) → הראש נשלח קדימה והידיים אחורה
const HEADER = {
  back: { head: [88, 50], neck: [94, 68], hip: [100, 110], le: [88, 74], lh: [84, 52], re: [86, 76], rh: [80, 54], lk: [92, 140], lf: [82, 166], rk: [96, 142], rf: [88, 168] },
  snap: { head: [118, 58], neck: [107, 70], hip: [100, 110], le: [88, 90], lh: [78, 104], re: [90, 92], rh: [80, 106], lk: [96, 138], lf: [90, 164], rk: [102, 140], rf: [98, 168] },
};
// שוער דרוך (מלפנים): ברכיים כפופות ופתוחות, גוף וידיים קדימה-למטה, על קצות האצבעות (רועי: "עומד ומחכה לזינוק")
const GK_SET = { head: [100, 70, 18], neck: [100, 86, 10], hip: [100, 124], le: [78, 106, 8], lh: [72, 128, 18], re: [122, 106, 8], rh: [128, 128, 18], lk: [80, 150], lf: [74, 178], rk: [120, 150], rf: [126, 178] };
// נחיתת "סיו" (מלפנים): רגליים פתוחות, ידיים למטה-הצידה-אחורה, חזה קדימה, ראש למעלה
const SIU = { head: [100, 48, 6], neck: [100, 66, 6], hip: [100, 114], le: [76, 98], lh: [64, 122, -16], re: [124, 98], rh: [136, 122, -16], lk: [78, 150], lf: [66, 182], rk: [122, 150], rf: [134, 182] };
// דאנק באוויר (מהצד, +x = לסל): יד שמאל (הרחוקה) למעלה-קדימה עם הכדור, יד ימין למטה-אחורה, ברך קדמית מורמת, רגל אחורית נגררת (רועי: "שלא ייראה סימטרי")
const DUNK_AIR = { head: [106, 40], neck: [103, 56], hip: [100, 102], le: [112, 36], lh: [120, 8], re: [90, 78], rh: [82, 100], lk: [118, 126], lf: [114, 148], rk: [92, 134], rf: [82, 160] };
// אגרוף למעלה (מלפנים): יד אחת למעלה, השנייה למטה
const FIST = { head: [100, 50], neck: [100, 66], hip: [100, 112], le: [84, 34], lh: [78, 8], re: [116, 96], rh: [122, 118], lk: [92, 148], lf: [88, 182], rk: [108, 148], rf: [112, 182] };
// עמדת "היכון" בבלוקים (מהצד, +x = קדימה): ידיים על הקו, ירכיים מעל הכתפיים, ברך קדמית כפופה, רגל אחורית מתוחה
const SET_POS = { head: [124, 108], neck: [113, 116], hip: [86, 102], le: [116, 148], lh: [118, 180], re: [113, 150], rh: [115, 180], lk: [104, 146], lf: [110, 180], rk: [68, 138], rf: [54, 178] };
// פוזות זריקה לשלוש במבט מהצד (+x = לכיוון הסל): אחיזה בחזה, ירידה, זינוק ושחרור מעל הראש, מעקב שורש כף היד, נחיתה
const SHOT = {
  hold: { head: [102, 52], neck: [101, 68], hip: [100, 116], le: [104, 102], lh: [114, 92], re: [106, 104], rh: [116, 94], lk: [100, 150], lf: [97, 182], rk: [102, 150], rf: [104, 182] },
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
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); heroPos.set(-200 + 186 * k, 0, 250 - 280 * k); hero.model.rotation.y = Math.atan2(186, -280); pose(hero, runPose(k * 336), false, heroPos, dt, 16); }
    else if (t < KICK + .5) { heroPos.set(-14, 0, -30); face(hero, Math.PI, dt, 12); const kp = t < KICK - .12 ? KICKP.back : t < KICK + .1 ? KICKP.hit : KICKP.follow; pose(hero, kp, false, heroPos, dt, 16); } /* פונה לשער, בועט ברגל אחת */
    else celebrateStep(hero, t - KICK - .5, { x: -14, z: -30 }, dt);
    // שוער: עומד מוכן, צולל לאט לכיוון הכדור, נוחת ושוכב
    let gp = GK_SET; const gkBase = new THREE.Vector3(gkDir * clamp((t - KICK) / .9, 0, 1) * 170, 0, GZ + 40);
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
  const [hero, keeper, crosser] = await Promise.all([loadCharacter(KITS3D.maccabi), loadCharacter(KITS3D.keeper), loadCharacter(KITS3D.maccabi)]); sc.add(hero.model); sc.add(keeper.model); sc.add(crosser.model);
  const ball = soccerBallMesh(12); sc.add(ball); const shadow = ballShadow(sc);
  const side = Math.random() < .5 ? -1 : 1; const tx = -side * rnd(150, 270), ty = rnd(40, 180); const gkDir = tx < 0 ? -1 : 1;
  const CROSS = 1.6, HEAD = 3.4, HIT = 4.2, DUR = 10.5;
  S.murmur(0, 2.6); S.kick(CROSS); S.tension(1.8, 1.6); S.kick(HEAD); S.chant(HIT + .05, 2.4); S.roar(HIT, 4.6); S.drums(HIT + .6);
  /* המגביה עומד בצד (רועי: "לא רואים את השחקן שמגביה", צילום הפתיחה רחב ומראה אותו), הכדור לרגליו; הנוגח מתחיל רחוק, רץ וקופץ קדימה אל הכדור (רועי: "לנגוח מרחוק ולהגיע בתנועה") */
  const CX = side * 470, CZ = GZ + 170, HX = -side * 30, HZ0 = GZ + 620, HZ1 = GZ + 330, LEAP = .9; /* קפיצה קדימה: מתחילה HEAD-.5, הכדור בראש ב-HEAD */
  const from = new THREE.Vector3(CX - side * 14, 12, CZ - 12), headPt = new THREE.Vector3(HX, 204, HZ1 - 22), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), crossPos = new THREE.Vector3(CX, 0, CZ), look = new THREE.Vector3(), want = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(-side * 300, 560, GZ + 1900), new THREE.Vector3(side * 120, 80, GZ + 260), CROSS + .3);
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - HIT) / 1.0, 0, 1);
    want.set(-side * 260 + side * 160 * back, 270 + 30 * back, GZ + 1200 + 220 * back); look.set(0, 130 - 50 * back, GZ + 200 + 150 * back); camera(t, dt, want, look);
    /* המגביה: פונה למרכז ובועט ברגל אחת ב-CROSS, ואז עומד */
    crosser.model.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; /* פונה ל--X או +X (למרכז) */
    pose(crosser, t < CROSS - .15 ? (t < CROSS - .5 ? POSE.stand : KICKP.back) : t < CROSS + .1 ? KICKP.hit : t < CROSS + .5 ? KICKP.follow : POSE.stand, false, crossPos, dt, 14);
    /* הנוגח: רץ מרחוק, קופץ קדימה, קשת אחורה ונגיחה, נוחת, חוגג */
    const J0 = HEAD - LEAP * .55, J1 = J0 + LEAP;
    if (t < J0) { const k = ease(clamp((t - .4) / (J0 - .4), 0, 1)); heroPos.set(HX, 0, HZ0 - (HZ0 - (HZ1 + 70)) * k); hero.model.rotation.y = Math.PI; pose(hero, k <= 0 ? POSE.stand : runPose(k * (HZ0 - HZ1 - 70)), false, heroPos, dt, 16); }
    else if (t < J1 + .1) { const k = clamp((t - J0) / LEAP, 0, 1); heroPos.set(HX, Math.sin(k * Math.PI) * 74, HZ1 + 70 - 140 * k); hero.model.rotation.y = Math.PI; pose(hero, t < HEAD - .05 ? HEADER.back : HEADER.snap, false, heroPos, dt, 16); }
    else celebrateStep(hero, t - J1 - .1, { x: HX, z: HZ1 - 70 }, dt);
    let gp = GK_SET; const gkBase = new THREE.Vector3(gkDir * clamp((t - HEAD) / .9, 0, 1) * 170, 0, GZ + 40);
    if (t > HEAD + .1 && t < HIT + .4) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .4) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; pose(keeper, gp, true, gkBase, dt, 7);
    if (t < CROSS) ball.position.copy(from);
    else if (t < HEAD) { const k = (t - CROSS) / (HEAD - CROSS); ball.position.lerpVectors(from, headPt, k); ball.position.y += Math.sin(k * Math.PI) * 150; ball.rotation.z += dt * 8; }
    else if (t < HIT) { const k = (t - HEAD) / (HIT - HEAD); ball.position.lerpVectors(headPt, ballEnd, k); ball.rotation.x -= dt * 10; }
    else { ball.position.copy(ballEnd); g.bulge(Math.max(0, 1 - (t - HIT) / 1.1) * Math.abs(Math.cos((t - HIT) * 10))); }
    shadow(ball); fans.update(t, t > HIT);
    if (t > HIT && t < HIT + .06) { conf.start(0, 260, HZ1, 500); say('', 'pt-BR'); text.show('גוווול!!!', 'בנגיחה!', 'big'); }
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
  const RUN = 2.4, LEAP = 1.15, DUNK = RUN + LEAP * .5, JUMP = RUN + LEAP, DUR = JUMP + 3.6; /* קצר: קפיצה, אגרוף למעלה, וחותכים (רועי) */
  S.murmur(0, 2.4); S.steps(.4, 10, .22); S.tension(1.6, 1.8); S.rim(DUNK); S.roar(DUNK, 3.2); S.drums(DUNK + .5);
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3(), handV = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(820, 440, HZ + 1550), new THREE.Vector3(0, 120, HZ + 250));
  const Z0 = HZ + 150, Z1 = HZ - 10; /* הקפיצה קדימה: הכף מגיעה מעל קדמת הטבעת בשיא */
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - DUNK - .2) / 1.0, 0, 1);
    want.set(320 - 180 * back, 300 - 20 * back, HZ + 1050 + 250 * back); look.set(0, 210 - 100 * back, HZ + 150 + 150 * back); camera(t, dt, want, look);
    const inHand = () => { const hp = hero.rig.b.LeftHand.getWorldPosition(handV); ball.position.set(hp.x, hp.y + 12, hp.z - 8); };
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); pos.set(0, 0, HZ + 860 - (HZ + 860 - Z0) * k); hero.model.rotation.y = Math.PI; pose(hero, dribblePose(runPose(k * (HZ + 860 - Z0))), false, pos, dt, 16); const hp = hero.rig.b.LeftHand.getWorldPosition(handV); const bounce = Math.abs(Math.sin(t * Math.PI * 2.2)); ball.position.set(hp.x, 14 + Math.max(0, hp.y - 14 - 14) * bounce, hp.z); }
    else if (t < JUMP) { const k = clamp((t - RUN) / LEAP, 0, 1); pos.set(0, Math.sin(k * Math.PI) * 130, Z0 - (Z0 - Z1) * k); hero.model.rotation.y = Math.PI; pose(hero, k < .12 ? SHOT.dip : DUNK_AIR, false, pos, dt, 18); if (t < DUNK) inHand(); else ball.position.set(0, Math.max(14, w.RIM_Y - 30 - (t - DUNK) * 250), HZ + 14); }
    else { const u = t - JUMP; pos.set(30, 0, Z1 + 40); /* נחיתה, סיבוב למצלמה, קפיצה אחת עם אגרוף למעלה, ועומדים */ const jk = clamp((u - .5) / .9, 0, 1); pos.y = Math.sin(jk * Math.PI) * 45; face(hero, 0, dt, 6); pose(hero, u < .3 ? SHOT.land : jk < 1 ? FIST : POSE.front, true, pos, dt, 10);
      const fall = w.RIM_Y - 30 - (t - DUNK) * 250; ball.position.set(0, Math.max(14, fall), HZ + 14); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin(u * 4)) * 20 * Math.max(0, 1 - u / 2); }
    w.shake(Math.max(0, 1 - (t - DUNK) / 1.2) * (t > DUNK ? Math.abs(Math.cos((t - DUNK) * 9)) : 0));
    shadow(ball); w.fans.update(t, t > DUNK);
    if (t > DUNK && t < DUNK + .06) { conf.start(0, 320, HZ + 100, 400); say('', 'pt-BR'); text.show('סלאם דאנק!', '', 'big'); }
    finaleText(text, t, DUNK + 1.6, newBest, oldBest); conf.update(dt);
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
  /* רועי: "לזרוק מ-3, באלכסון, שייראה תלת-ממד": הזורק על קשת השלוש (635 מהטבעת) ב-45°, פונה לטבעת; המצלמה מעל הכתף מאחור-מהצד */
  const rimP = w.rimPos.clone(); const A = Math.PI / 4, SX = Math.sin(A) * 635, SZ = rimP.z + Math.cos(A) * 635; const from = new THREE.Vector3();
  const pos = new THREE.Vector3(SX, 0, SZ), look = new THREE.Vector3(), want = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();
  const faceRim = Math.atan2(rimP.x - SX, rimP.z - SZ); /* המודל פונה +Z בסיבוב 0 */
  const CAMX = SX + 300, CAMZ = SZ + 560, toCam = Math.atan2(CAMX - SX, CAMZ - SZ);
  const camera = camRig(cam, new THREE.Vector3(SX + 700, 620, SZ + 900), new THREE.Vector3(SX * .4, 120, (SZ + rimP.z) / 2));
  let released = false;
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - SWISH) / 1.0, 0, 1);
    want.set(CAMX + 60 * back, 300 + 40 * back, CAMZ + 160 * back); look.set(SX * .45 - 60 * back, 200 - 60 * back, (SZ + rimP.z) / 2 + 120 * back); camera(t, dt, want, look);
    if (t < SWISH + .5) hero.model.rotation.y = faceRim; /* פונה לטבעת; אחר כך face() מסובב למצלמה */
    if (t < DIP) { pose(hero, SHOT.hold, false, pos, dt, 6); }
    else if (t < RISE) { pose(hero, SHOT.dip, false, pos, dt, 5); }
    else if (t < SHOOT) { const k = clamp((t - RISE) / (SHOOT - RISE), 0, 1); pos.y = ease(k) * 26; pose(hero, SHOT.release, false, pos, dt, 10); }
    else if (t < LAND) { const k = clamp((t - SHOOT) / (LAND - SHOOT), 0, 1); pos.y = Math.max(0, 26 + 60 * Math.sin(k * Math.PI) - 26 * k); pose(hero, k < .6 ? SHOT.follow : SHOT.land, false, pos, dt, 8); }
    else if (t < SWISH + .5) { pos.y = 0; pose(hero, SHOT.land, false, pos, dt, 6); }
    else celebrateStep(hero, t - SWISH - .5, { x: SX, z: SZ }, dt, 1, { base: toCam, dx: Math.sin(toCam) * 120, dz: Math.cos(toCam) * 120 }); /* פונה למצלמה ורץ אליה */
    /* הכדור: בידיים עד השחרור, ואז קשת אל הטבעת */
    if (t < SHOOT) { hero.rig.b.LeftHand.getWorldPosition(hl); hero.rig.b.RightHand.getWorldPosition(hr); ball.position.lerpVectors(hl, hr, .5); ball.position.x += Math.sin(faceRim) * 10; ball.position.z += Math.cos(faceRim) * 10; ball.position.y += 8; from.copy(ball.position); }
    else if (t < SWISH) { const k = (t - SHOOT) / (SWISH - SHOOT); ball.position.lerpVectors(from, rimP, k); ball.position.y += Math.sin(k * Math.PI) * 160; ball.rotation.x -= dt * 5; if (!released) { released = true; } }
    else { const fall = rimP.y - (t - SWISH) * 220; ball.position.set(rimP.x, Math.max(14, fall), rimP.z); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin((t - SWISH) * 4)) * 24 * Math.max(0, 1 - (t - SWISH) / 2.5); }
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
      if (crossed && hero) { if (l.crossT == null) l.crossT = t; celebrateStep(l.r, t - l.crossT, { x: FIN + 120, z: l.z }, dt, 1, { base: 0, dx: 0, dz: 90 }); return; } /* המנצח: סיבוב למצלמה, קפיצת סיו ונחיתה; האחרים ממשיכים לרוץ */
      const target = !run ? SET_POS : stopped ? POSE.stand : (k > .85 && !crossed) ? LEAN : poseAt(SPRINT, (l.ph % 1) * 8);
      pos.set(crossed ? Math.min(l.x, stopX) : l.x, 0, l.z); l.r.model.rotation.y = Math.PI / 2; pose(l.r, target, false, pos, dt, run ? 16 : 6);
    });
    const hx = Math.min(heroL.x, FIN + 120), fin = heroL.x >= FIN;
    want.set(hx + (fin ? 20 : 60), fin ? 260 : 260, heroL.z + (fin ? 1000 : 900)); look.set(hx + (fin ? 10 : 40), 100, heroL.z - (fin ? 40 : 160)); camera(t, dt, want, look);
    fans.update(t, t > WIN);
    if (t >= START && t < WIN) text.show(`${Math.min(9.58, (t - START) / DUR_RUN * 9.58).toFixed(2)}`, '', 'clock');
    if (t > WIN && t < WIN + .06) { conf.start(FIN + 100, 260, 0, 400); say('', 'pt-BR'); text.show('מקום ראשון!', '9.58', 'big'); }
    finaleText(text, t, WIN + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

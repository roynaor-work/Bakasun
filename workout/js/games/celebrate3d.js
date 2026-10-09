// חגיגת שיא חדש בתלת-ממד: אותה דמות כמו במסך התרגיל (Kenney, חולצת מכבי חיפה) באצטדיון או במגרש כדורסל.
// חמש סצנות: שער מבעיטה, שער בנגיחה, סלאם דאנק, קליעת שלוש, ריצת 100 מטר. הקצב איטי וברור (רועי, 30/09).
// הצלילים והקריין מהגרסה הדו-ממדית (makeAudio, ההקלטות של רועי). בלי WebGL, או אם הטעינה נכשלה, המנוע חוזר לגרסה הדו-ממדית.
import { THREE, hasWebGL, loadCharacter, KITS3D, lights, crowd, confetti, soccerBallMesh, makeRenderer } from '../char3d.js?v=20261009-weekly-1';
import { makeAudio, SPRINT, WALK, LEAN, poseAt, celebrate as celebrate2d } from './celebrate.js?v=20261009-weekly-1';
import { lerpPose } from '../figure.js?v=20261009-weekly-1';
import { POSE, GK } from './sprites.js?v=20261009-weekly-1';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, easeOut = t => 1 - Math.pow(1 - t, 3);
export const SCENE_IDS_3D = ['goal', 'header', 'dunk', 'three', 'sprint'];
const BOUNCE = 3.2; // קצב הקפיצות בחגיגה (רדיאנים לשנייה; נמוך = איטי וברור)
// מעבר רך: הדמות מתקרבת לפוזת היעד בכל פריים (מסנן אקספוננציאלי), כך שאין קפיצות בין פוזות. הפעם הראשונה או שינוי מבט = ישר ליעד
export function pose(ch, target, front, pos, dt, speed = 9) {
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

export function celebrate3d(canvas, { oldBest = 0, newBest = 1, sound = true, onText = null, onRecording = null, onDone = null, scene = null } = {}) {
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
  let said = false; const say = (txt, lang) => { if (said) return; said = true; if (sound && onRecording?.(`celebration-${id === 'header' ? 'goal' : id}`)) return; if (sound && recFor) { try { const a = new Audio(recFor); a.onerror = () => { if (txt) onText && onText(txt, lang); }; a.play().catch(() => { if (txt) onText && onText(txt, lang); }); return; } catch { /* */ } } if (txt) onText && onText(txt, lang); };

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
  run().catch(e => { console.warn('celebrate3d', e); window.__c3dError = String(e && e.message || e); cleanup(); if (!stopped) { stopped = true; try { fallbackStop = celebrate2d(canvas, { oldBest, newBest, sound, onText, onRecording, onDone, scene: null }); } catch (e2) { onDone && onDone(); } } });
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
export function sky(sc, top = '#0b1026', bottom = '#1e293b', lamps = true) {
  sc.background = new THREE.Color(bottom); sc.fog = new THREE.Fog(bottom, 1500, 3500);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
  if (lamps) for (const x of [-700, 700]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 700, 8), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); pole.position.set(x, 350, -900); sc.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(120, 40, 20), new THREE.MeshBasicMaterial({ color: '#fef9c3' })); lamp.position.set(x, 700, -900); sc.add(lamp); }
}
// רשת אמיתית: טקסטורת קנבס של משבצות דקות (לא wireframe: המשולשים נראו כמו "קוביות"; רועי 05/10), שקופה, משני הצדדים
function netTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(248,250,252,.92)'; g.lineWidth = 2.2; g.beginPath(); for (let i = 0; i <= 4; i++) { const v = i * 32 + .5; g.moveTo(v, 0); g.lineTo(v, 128); g.moveTo(0, v); g.lineTo(128, v); } g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const CELL = 12; /* עין רשת כ-12 ס"מ */
function netPlane(w, h, tex) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / (CELL * 4), h / (CELL * 4)); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: .05 })); }
function goalFrame(sc, z, w = 690, h = 230, d = 200) {
  const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .5 });
  for (const x of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, h, 12), mat); p.position.set(x, h / 2, z); p.castShadow = true; sc.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, w + 12, 12), mat); bar.rotation.z = Math.PI / 2; bar.position.set(0, h, z); sc.add(bar);
  // מסגרת אחורית דקה שמחזיקה את הרשת (עמודים אחוריים נמוכים, מוט אחורי על הרצפה, מוטות אלכסוניים מהקורה)
  const thin = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: .6 }); const BH = h * .55;
  for (const x of [-w / 2, w / 2]) {
    const bp = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, BH, 8), thin); bp.position.set(x, BH / 2, z - d); sc.add(bp);
    const diag = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, Math.hypot(d, h - BH), 8), thin); diag.position.set(x, (h + BH) / 2, z - d / 2); diag.rotation.x = Math.atan2(d, h - BH); sc.add(diag);
  }
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, w, 8), thin); bb.rotation.z = Math.PI / 2; bb.position.set(0, 3, z - d); sc.add(bb);
  const tex = netTexture();
  const back = netPlane(w, BH, tex); back.position.set(0, BH / 2, z - d); sc.add(back);
  const slope = netPlane(w, Math.hypot(d, h - BH), tex); slope.position.set(0, (h + BH) / 2, z - d / 2); slope.rotation.x = Math.PI / 2 - Math.atan2(h - BH, d); sc.add(slope);
  for (const x of [-w / 2, w / 2]) { /* צד: מלבן נמוך + משולש עליון */
    const lo = netPlane(d, BH, tex); lo.rotation.y = Math.PI / 2; lo.position.set(x, BH / 2, z - d / 2); sc.add(lo);
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([0, BH, 0, 0, h, d, 0, BH, d], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, (h - BH) / (CELL * 4) / (d / (CELL * 4)), 1, 0], 2)); tri.computeVertexNormals();
    const tt = tex.clone(); tt.needsUpdate = true; tt.repeat.set(d / (CELL * 4), 1); const tm = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ map: tt, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: .05 })); tm.position.set(x, 0, z - d); sc.add(tm);
  }
  return { bulge(k) { back.position.z = z - d - 60 * k; bb.position.z = z - d - 60 * k; } };
}
export function ballShadow(sc) { const m = new THREE.Mesh(new THREE.CircleGeometry(12, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .3 })); m.rotation.x = -Math.PI / 2; sc.add(m); return (b) => { m.position.set(b.position.x, .8, b.position.z); m.scale.setScalar(Math.max(.4, 1 - b.position.y / 200)); }; }
export function stadium(sc, GZ) { sky(sc); lights(sc, { sun: 1.8, ground: '#1e3a2f' }); pitch(sc); const g = goalFrame(sc, GZ); const fans = stands(sc, GZ - 380, 40); line(sc, 0, GZ, 3400, 6); line(sc, 0, GZ + 520, 1700, 6); line(sc, -850, GZ + 260, 6, 520); line(sc, 850, GZ + 260, 6, 520); return { g, fans }; }
// חגיגה משותפת: קפיצות עם ידיים למעלה, פונה למצלמה, מתקדם לאט אליה
// סיבוב רך של הדמות לזווית יעד (הקשת הקצרה), במקום קפיצה
export function face(ch, ang, dt, speed = 5) { let d = ang - ch.model.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); ch.model.rotation.y += d * (1 - Math.exp(-speed * dt)); }
// מחזור ריצה לפי מרחק שעברנו: צעד כל ~90 יח' (SPRINT = 8 פריימים גאומטריים עם ברכיים נכונות)
const runPose = (dist, stride = 90) => { const p = poseAt(SPRINT, ((dist / stride) % 1) * 8); p.lat = .1; return p; };
// רגליים מפוזה אחת וידיים מאחרת (ריצה עם ידיים באוויר)
const ARMS = ['le', 'lh', 're', 'rh'];
// כדרור: היד השמאלית (במבט צד = LeftHand) יורדת קדימה-למטה אל הכדור, השאר מהפוזת הריצה
function dribblePose(p, s = 0) { const o = { ...p }; const [hx, hy] = p.hip; o.le = [hx + 6, hy + 16 + 3 * s]; o.lh = [hx + 16, hy + 38 + 12 * s]; return o; } /* s = 0..1: היד דוחפת למטה כשהכדור למטה (רועי: "היד סטטית") */
function mixParts(legs, arms) { const out = { ...legs }; for (const j of ARMS) out[j] = arms[j]; return out; }
// כוריאוגרפיית חגיגה (u = שניות מתחילת החגיגה): מסתובב למצלמה עם ידיים למעלה, רץ לעברה, קופץ כמה פעמים, ואז עומד ומנופף
function celebrateStep(ch, u, from, dt, dir = 1, { base = 0, short = false } = {}) {
  /* רועי 30/09: "הידיים למטה בתחילת החגיגה, לא לעשות סיבוב; רק אחרי שהוא מסתכל הוא קופץ, מרים ידיים, עושה סיבוב ומוריד את הידיים אחרי שנוחת עם הפנים למסך"; "שהוא מרים בדיוק כשהוא קופץ"; short (כדורסל): בלי קפיצה, רק יד אחת למעלה */
  const LOOK = 1.0, CR = LOOK + .28, J1 = CR + 1.0;
  const pos = new THREE.Vector3(from.x, 0, from.z);
  let target;
  if (u < LOOK) { target = POSE.front; face(ch, base, dt, 4); } /* מסתובב למצלמה, ידיים למטה, מסתכל */
  else if (short) { target = FIST; face(ch, base, dt, 5); pose(ch, target, true, pos, dt, 8); return; }
  else if (u < CR) { target = CROUCH_F; face(ch, base, dt, 6); pose(ch, target, true, pos, dt, 14); return; } /* כריעה קצרה */
  else if (u < J1) { const k = (u - CR) / (J1 - CR); pos.y = Math.sin(k * Math.PI) * 72; target = k < .22 ? lerpPose(CROUCH_F, POSE.armsUp, k / .22) : k < .55 ? POSE.armsUp : lerpPose(POSE.armsUp, SIU, (k - .55) / .45); /* הידיים עולות עם הניתור */ ch.model.rotation.y = base + ease(k) * Math.PI * 2; pose(ch, target, true, pos, dt, 16); return; }
  else { const w = Math.sin((u - J1) * 3); pos.y = Math.abs(w) * 1.2; target = SIU; face(ch, base + w * .04, dt, 5); }
  pose(ch, target, true, pos, dt, 9);
}
// בעיטה במבט מהצד (+x = לכיוון השער): רגל אחת נטועה, השנייה אחורה → פוגעת → ממשיכה למעלה (רועי: "בועט עם שתי הרגליים")
export const KICKP = {
  back: { head: [106, 54], neck: [104, 70], hip: [100, 116], le: [112, 92], lh: [124, 82], re: [88, 92], rh: [78, 102], lk: [104, 150], lf: [106, 182], rk: [86, 140], rf: [76, 164] },
  hit: { head: [98, 54], neck: [98, 70], hip: [100, 114], le: [84, 92], lh: [74, 104], re: [114, 88], rh: [126, 78], lk: [98, 150], lf: [96, 182], rk: [118, 138], rf: [136, 160] },
  follow: { head: [92, 56], neck: [94, 72], hip: [100, 112], le: [82, 92], lh: [70, 102], re: [112, 84], rh: [124, 70], lk: [98, 148], lf: [96, 178], rk: [121, 100], rf: [142, 88] }, /* רגל ישרה שעולה, הברך לא מתעקמת */
};
// נגיחה בקפיצה קדימה: קשת אחורה (ידיים למעלה) → הראש נשלח קדימה והידיים אחורה
const HEADER = {
  back: { head: [88, 50], neck: [94, 68], hip: [100, 110], le: [88, 74], lh: [84, 52], re: [86, 76], rh: [80, 54], lk: [92, 140], lf: [82, 166], rk: [96, 142], rf: [88, 168] },
  snap: { head: [118, 58], neck: [107, 70], hip: [100, 110], le: [88, 90], lh: [78, 104], re: [90, 92], rh: [80, 106], lk: [96, 138], lf: [90, 164], rk: [102, 140], rf: [98, 168] },
};
// שוער דרוך (מלפנים): ברכיים כפופות ופתוחות, גוף וידיים קדימה-למטה, על קצות האצבעות (רועי: "עומד ומחכה לזינוק")
export const GK_SET = { head: [100, 70, 18], neck: [100, 86, 10], hip: [100, 124], le: [78, 106, 8], lh: [72, 128, 18], re: [122, 106, 8], rh: [128, 128, 18], lk: [80, 150], lf: [74, 178], rk: [120, 150], rf: [126, 178] };
// נחיתת "סיו" (מלפנים): רגליים פתוחות, ידיים למטה-הצידה-אחורה, חזה קדימה, ראש למעלה
// כריעה לפני ניתור (מלפנים)
export const CROUCH_F = { head: [100, 64], neck: [100, 80], hip: [100, 128], le: [90, 104], lh: [86, 124], re: [110, 104], rh: [114, 124], lk: [88, 154], lf: [86, 182], rk: [112, 154], rf: [114, 182] };
const SIU = { head: [100, 48, 6], neck: [100, 66, 6], hip: [100, 114], le: [76, 98], lh: [64, 122, -16], re: [124, 98], rh: [136, 122, -16], lk: [78, 150], lf: [66, 182], rk: [122, 150], rf: [134, 182] };
// דאנק באוויר (מהצד, +x = לסל): יד שמאל (הרחוקה) למעלה-קדימה עם הכדור, יד ימין למטה-אחורה, ברך קדמית מורמת, רגל אחורית נגררת (רועי: "שלא ייראה סימטרי")
const DUNK_AIR = { head: [106, 40], neck: [103, 56], hip: [100, 102], le: [112, 36], lh: [120, 8], re: [90, 78], rh: [82, 100], lk: [118, 126], lf: [114, 148], rk: [92, 134], rf: [82, 160] };
// "ג'ורדן": באוויר הרגליים נפתחות (קדמית ישרה קדימה, אחורית כפופה מאחור), יד עם הכדור למעלה, יד שנייה אחורה
const JORDAN = { head: [106, 38], neck: [103, 54], hip: [100, 100], le: [112, 34], lh: [120, 6], re: [86, 70], rh: [74, 86], lk: [130, 108], lf: [152, 114], rk: [82, 122], rf: [66, 146] }; /* פתיחת רגליים גדולה */
// תלוי על הטבעת: יד אחת ישרה למעלה אוחזת, הגוף מאונך, רגליים משתלשלות
const HANG = { head: [102, 42], neck: [101, 58], hip: [100, 110], le: [104, 30], lh: [106, 4], re: [106, 96], rh: [110, 120], lk: [100, 144], lf: [98, 170], rk: [104, 142], rf: [106, 168] };
// אגרוף למעלה (מלפנים): יד אחת למעלה, השנייה למטה
export const FIST = { head: [100, 50], neck: [100, 66], hip: [100, 112], le: [84, 34], lh: [78, 8], re: [116, 96], rh: [122, 118], lk: [92, 148], lf: [88, 182], rk: [108, 148], rf: [112, 182] };
// עמדת "היכון" בבלוקים (מהצד, +x = קדימה): ידיים על הקו, ירכיים מעל הכתפיים, ברך קדמית כפופה, רגל אחורית מתוחה
const SET_POS = { head: [122, 112], neck: [111, 118], hip: [86, 100], le: [112, 150], lh: [112, 180], re: [110, 150], rh: [110, 180], lk: [98, 140], lf: [104, 178], rk: [66, 132], rf: [50, 176] };
// פוזות זריקה לשלוש במבט מהצד (+x = לכיוון הסל): אחיזה בחזה, ירידה, זינוק ושחרור מעל הראש, מעקב שורש כף היד, נחיתה
export const SHOT = {
  hold: { head: [102, 52], neck: [101, 68], hip: [100, 116], le: [104, 100], lh: [112, 118], re: [106, 102], rh: [114, 120], lk: [100, 150], lf: [97, 182], rk: [102, 150], rf: [104, 182] }, /* הכדור למטה, באזור המותן (רועי) */
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
    else celebrateStep(hero, t - KICK - .5, { x: -14, z: -10 }, dt);
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
  const CX = side * 1500, CZ = GZ + 900, HX = -side * 30, HZ0 = GZ + 620, HZ1 = GZ + 330, LEAP = .9; /* המגביה בקצה הרחבה (רועי) */ /* קפיצה קדימה: מתחילה HEAD-.5, הכדור בראש ב-HEAD */
  const from = new THREE.Vector3(CX - side * 14, 12, CZ - 12), headPt = new THREE.Vector3(HX, 222, HZ1 - 26), ballEnd = new THREE.Vector3(tx, ty, GZ - 60);
  const heroPos = new THREE.Vector3(), crossPos = new THREE.Vector3(CX, 0, CZ), look = new THREE.Vector3(), want = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(side * 1750, 380, GZ + 1450), new THREE.Vector3(side * 200, 90, GZ + 350), CROSS + .4); /* מתחילים מאחורי המגביה (רועי: "לא רואים מי מגביה") */
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - HIT) / 1.0, 0, 1);
    want.set(-side * 260 + side * 160 * back, 270 + 30 * back, GZ + 1200 + 220 * back); look.set(0, 130 - 50 * back, GZ + 200 + 150 * back); camera(t, dt, want, look);
    /* המגביה: פונה למרכז ובועט ברגל אחת ב-CROSS, ואז עומד */
    crosser.model.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; /* פונה ל--X או +X (למרכז) */
    { const r0 = CROSS - .9, rk = clamp((t - r0) / .7, 0, 1); crossPos.set(CX + side * 90 * (1 - ease(rk)), 0, CZ); /* רץ קצת אל הכדור */
      pose(crosser, t < r0 ? POSE.stand : t < CROSS - .2 ? runPose(rk * 90 + 45, 60) : t < CROSS - .06 ? KICKP.back : t < CROSS + .1 ? KICKP.hit : t < CROSS + .5 ? KICKP.follow : POSE.stand, false, crossPos, dt, 16); }
    /* הנוגח: רץ מרחוק, קופץ קדימה, קשת אחורה ונגיחה, נוחת, חוגג */
    const J0 = HEAD - LEAP * .55, J1 = J0 + LEAP;
    if (t < J0) { const k = ease(clamp((t - .4) / (J0 - .4), 0, 1)); heroPos.set(HX, 0, HZ0 - (HZ0 - (HZ1 + 70)) * k); hero.model.rotation.y = Math.PI; pose(hero, k <= 0 ? POSE.stand : runPose(k * (HZ0 - HZ1 - 70)), false, heroPos, dt, 16); }
    else if (t < J1 + .1) { const k = clamp((t - J0) / LEAP, 0, 1); heroPos.set(HX, Math.sin(k * Math.PI) * 92, HZ1 + 70 - 140 * k); hero.model.rotation.y = Math.PI; pose(hero, t < HEAD - .1 ? HEADER.back : HEADER.snap, false, heroPos, dt, 18); }
    else celebrateStep(hero, t - J1 - .1, { x: HX, z: HZ1 - 70 }, dt);
    let gp = GK_SET; const gkBase = new THREE.Vector3(gkDir * clamp((t - HEAD) / .9, 0, 1) * 170, 0, GZ + 40);
    if (t > HEAD + .1 && t < HIT + .4) gp = gkDir > 0 ? GK.diveRH : GK.diveLH; else if (t >= HIT + .4) gp = gkDir > 0 ? GK.lyingR : GK.lyingL;
    keeper.model.rotation.y = 0; pose(keeper, gp, true, gkBase, dt, 7);
    if (t < CROSS) ball.position.copy(from);
    else if (t < HEAD) { const k = (t - CROSS) / (HEAD - CROSS); ball.position.lerpVectors(from, headPt, k); ball.position.y += Math.sin(k * Math.PI) * 220; ball.rotation.z += dt * 8; }
    else if (t < HIT) { const k = (t - HEAD) / (HIT - HEAD); ball.position.lerpVectors(headPt, ballEnd, k); ball.rotation.x -= dt * 10; }
    else { ball.position.copy(ballEnd); g.bulge(Math.max(0, 1 - (t - HIT) / 1.1) * Math.abs(Math.cos((t - HIT) * 10))); }
    shadow(ball); fans.update(t, t > HIT);
    if (t > HIT && t < HIT + .06) { conf.start(0, 260, HZ1, 500); say('', 'pt-BR'); text.show('גוווול!!!', 'בנגיחה!', 'big'); }
    finaleText(text, t, HIT + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

// ---- מגרש כדורסל ----
export function court(sc, HZ) {
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
  /* הסל כקבוצה אחת (לוח, מסגרת, ריבוע, טבעת, רשת) כדי שאפשר להזיז אותו ברמות הגבוהות (רועי 01/10: "הסל זז קצת") */
  const goal = new THREE.Group(); sc.add(goal);
  const board = new THREE.Mesh(new THREE.BoxGeometry(170, 100, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .3, transparent: true, opacity: .92 })); board.position.set(0, RIM_Y + 32, HZ - 20); goal.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(178, 108, 4), new THREE.MeshStandardMaterial({ color: '#334155' })); frame.position.set(0, RIM_Y + 32, HZ - 23); goal.add(frame); /* מסגרת כהה סביב הלוח */
  const sqMat = new THREE.MeshBasicMaterial({ color: '#ef4444' }); for (const [w, h, dx, dy] of [[56, 4, 0, 19], [56, 4, 0, -19], [4, 42, -26, 0], [4, 42, 26, 0]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), sqMat); e.position.set(dx, RIM_Y + 18 + dy, HZ - 16); goal.add(e); } /* הריבוע האדום כמסגרת, לא מלבן מלא */
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 36), new THREE.MeshStandardMaterial({ color: '#ea580c' })); bracket.position.set(0, RIM_Y - 2, HZ - 2); goal.add(bracket);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(22, 3.2, 10, 40), new THREE.MeshStandardMaterial({ color: '#f97316', roughness: .4 })); rim.rotation.x = Math.PI / 2; rim.position.set(0, RIM_Y, HZ + 14); goal.add(rim);
  /* רשת אמיתית: 12 חוטים שמתכנסים + 4 טבעות, קווים לבנים (לא wireframe של משולשים) */
  const netPts = []; const N = 12, RT = 21, RB = 12, NH = 44; for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + .5) / N * Math.PI * 2; netPts.push(Math.cos(a0) * RT, 0, Math.sin(a0) * RT, Math.cos(a1) * (RT * .75 + RB * .25), -NH * .33, Math.sin(a1) * (RT * .75 + RB * .25)); netPts.push(Math.cos(a1) * (RT * .75 + RB * .25), -NH * .33, Math.sin(a1) * (RT * .75 + RB * .25), Math.cos(a0) * (RT * .45 + RB * .55), -NH * .66, Math.sin(a0) * (RT * .45 + RB * .55)); netPts.push(Math.cos(a0) * (RT * .45 + RB * .55), -NH * .66, Math.sin(a0) * (RT * .45 + RB * .55), Math.cos(a1) * RB, -NH, Math.sin(a1) * RB); }
  for (const [rr, yy] of [[RT * .75 + RB * .25, -NH * .33], [RT * .45 + RB * .55, -NH * .66], [RB, -NH]]) for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2; netPts.push(Math.cos(a0) * rr, yy, Math.sin(a0) * rr, Math.cos(a1) * rr, yy, Math.sin(a1) * rr); }
  const netGeo = new THREE.BufferGeometry(); netGeo.setAttribute('position', new THREE.Float32BufferAttribute(netPts, 3));
  const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: .95 })); net.position.set(0, RIM_Y, HZ + 14); goal.add(net);
  /* יציע מדורג: 3 מדרגות בהירות יותר שעליהן האוהדים יושבים, ומעקה */
  for (let i = 0; i < 3; i++) { const step = new THREE.Mesh(new THREE.BoxGeometry(3400, 90, 150), new THREE.MeshStandardMaterial({ color: i % 2 ? '#334155' : '#3b4a63' })); step.position.set(0, 60 + i * 90 - 45 + 45, HZ - 360 - i * 130 - 10); sc.add(step); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3400, 6, 6), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); rail.position.set(0, 60 + 42, HZ - 300); sc.add(rail);
  const fans = crowd(sc, { count: 120, x0: -1500, x1: 1500, z: HZ - 360, y: 60, rows: 3, rowDz: -130, rowDy: 90 });
  const st = new THREE.Mesh(new THREE.BoxGeometry(3400, 480, 700), new THREE.MeshStandardMaterial({ color: '#1e293b' })); st.position.set(0, 240, HZ - 820); sc.add(st);
  return { fans, rim, net, goal, RIM_Y, rimPos: new THREE.Vector3(0, RIM_Y, HZ + 14), shake(k) { rim.position.y = RIM_Y - 6 * k; net.scale.set(1 + .3 * k, 1 + .5 * k, 1 + .3 * k); } };
}
export function basketBallMesh(r = 14) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f97316'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#111827'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(192, 0); g.lineTo(192, 128); g.stroke(); g.beginPath(); g.ellipse(128, 64, 60, 64, 0, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: .7 })); m.castShadow = true; return m;
}

// ---- 3. סלאם דאנק ----
async function dunkScene(sc, cam, S, say, text, { oldBest, newBest }) {
  const HZ = -420; const w = court(sc, HZ); const conf = confetti(sc, 320);
  const hero = await loadCharacter(KITS3D.maccabi); sc.add(hero.model);
  const ball = basketBallMesh(14); sc.add(ball); const shadow = ballShadow(sc);
  const RUN = 2.4, LEAP = .95, DUNK = RUN + LEAP, HANGT = .7, DROP = .4, JUMP = DUNK + HANGT + DROP, DUR = JUMP + 2.9, JH = 122; /* קפיצה עד הטבעת, תלוי עליה, יורד, אגרוף למעלה, וחותכים */
  S.murmur(0, 2.4); S.steps(.4, 10, .22); S.tension(1.6, 1.8); S.rim(DUNK); S.roar(DUNK, 3.2); S.drums(DUNK + .5);
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3(), handV = new THREE.Vector3();
  const camera = camRig(cam, new THREE.Vector3(820, 440, HZ + 1550), new THREE.Vector3(0, 120, HZ + 250));
  const Z0 = HZ + 150, Z1 = HZ - 10; /* הקפיצה קדימה: הכף מגיעה מעל קדמת הטבעת בשיא */
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - DUNK - .2) / 1.0, 0, 1);
    want.set(320 - 180 * back, 300 - 20 * back, HZ + 1050 + 250 * back); look.set(0, 210 - 100 * back, HZ + 150 + 150 * back); camera(t, dt, want, look);
    const inHand = () => { const hp = hero.rig.b.LeftHand.getWorldPosition(handV); ball.position.set(hp.x, hp.y + 12, hp.z - 8); };
    if (t < RUN) { const k = ease(clamp(t / RUN, 0, 1)); pos.set(0, 0, HZ + 860 - (HZ + 860 - Z0) * k); hero.model.rotation.y = Math.PI; const bounce = Math.abs(Math.sin(t * Math.PI * 2.2)); pose(hero, dribblePose(runPose(k * (HZ + 860 - Z0)), 1 - bounce), false, pos, dt, 16); const hp = hero.rig.b.LeftHand.getWorldPosition(handV); ball.position.set(hp.x, 14 + Math.max(0, hp.y - 14 - 14) * bounce, hp.z); }
    else if (t < DUNK) { const k = clamp((t - RUN) / LEAP, 0, 1); pos.set(0, Math.sin(k * Math.PI / 2) * JH, Z0 - (Z0 - Z1) * k); hero.model.rotation.y = Math.PI; pose(hero, k < .12 ? SHOT.dip : k < .32 ? DUNK_AIR : JORDAN, false, pos, dt, 14); inHand(); } /* איסוף → ברך למעלה → רגליים נפתחות (ג'ורדן) */
    else if (t < DUNK + HANGT) { pos.set(0, JH, Z1); hero.model.rotation.y = Math.PI; pose(hero, HANG, false, pos, dt, 12); ball.position.set(0, Math.max(14, w.RIM_Y - 30 - (t - DUNK) * 250), HZ + 14); } /* תלוי על הטבעת */
    else if (t < JUMP) { const k = clamp((t - DUNK - HANGT) / DROP, 0, 1); pos.set(0, JH * (1 - k * k), Z1 + 30 * k); pose(hero, k < .8 ? HANG : SHOT.land, false, pos, dt, 14); ball.position.set(0, Math.max(14, w.RIM_Y - 30 - (t - DUNK) * 250), HZ + 14); }
    else { const u = t - JUMP; /* נחיתה, סיבוב למצלמה, יד אחת למעלה (בלי קפיצה; רועי) */ if (u < .35) { pos.set(30, 0, Z1 + 60); pose(hero, SHOT.land, false, pos, dt, 10); } else celebrateStep(hero, u - .35, { x: 30, z: Z1 + 60 }, dt, 1, { short: true });
      const fall = w.RIM_Y - 30 - (t - DUNK) * 250; ball.position.set(0, Math.max(14, fall), HZ + 14); if (fall < 14) ball.position.y = 14 + Math.abs(Math.sin(u * 4)) * 20 * Math.max(0, 1 - u / 2); }
    w.shake(Math.max(0, 1 - (t - DUNK) / 1.2) * (t > DUNK ? Math.abs(Math.cos((t - DUNK) * 9)) : 0));
    shadow(ball); w.fans.update(t, t > DUNK);
    if (t > DUNK && t < DUNK + .06) { conf.start(0, 320, HZ + 100, 400); say('', 'pt-BR'); text.show('סלאם דאנק!', '', 'big'); }
    finaleText(text, t, DUNK + 2.2, newBest, oldBest); conf.update(dt);
  } };
}

// ---- 4. קליעת שלוש ----
async function threeScene(sc, cam, S, say, text, { oldBest, newBest }) {
  /* רועי 30/09: "עדיף שזה יראה כמו זריקה מהצד וזה יהיה זורם": מצלמה מהצד, הזורק מימין והסל משמאל, קשת הכדור חוצה את המסך; תנועת זריקה רציפה: אחיזה → ירידה → זינוק ושחרור → מעקב → נחיתה */
  const HZ = -420; const w = court(sc, HZ); const conf = confetti(sc, 320);
  const hero = await loadCharacter(KITS3D.maccabi); sc.add(hero.model);
  const ball = basketBallMesh(14); sc.add(ball); const shadow = ballShadow(sc);
  const DIP = 1.1, RISE = 1.9, SHOOT = 2.3, LAND = 3.0, SWISH = 3.9, DUR = 8.2;
  S.murmur(0, 2.2); S.tension(1.2, 2.6); S.swish(SWISH); S.roar(SWISH, 4.2); S.drums(SWISH + .5);
  /* רועי: "לזרוק מ-3, באלכסון, שייראה תלת-ממד": הזורק על קשת השלוש (635 מהטבעת) ב-45°, פונה לטבעת; המצלמה מעל הכתף מאחור-מהצד */
  const rimP = w.rimPos.clone(); const A = Math.PI / 4, SX = Math.sin(A) * 705, SZ = rimP.z + Math.cos(A) * 705; /* מאחורי קשת השלוש (635) */ const from = new THREE.Vector3();
  const pos = new THREE.Vector3(SX, 0, SZ), look = new THREE.Vector3(), want = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();
  const faceRim = Math.atan2(rimP.x - SX, rimP.z - SZ); /* המודל פונה +Z בסיבוב 0 */
  /* רועי: "מהצד השני שיראו את הפנים": מצלמה A מלפנים-מהצד של הזורק (בין הזורק לסל, הצידה), רואים את הפנים והאחיזה; אחרי הזריקה מצלמה B מאחור-מהצד שרואה את הכדור נכנס לסל */
  const camA = new THREE.Vector3(SX + 520, 230, SZ - 420), lookA = new THREE.Vector3(SX, 120, SZ);
  const CAMX = SX + 300, CAMZ = SZ + 560, toCam = Math.atan2(CAMX - SX, CAMZ - SZ);
  const camera = camRig(cam, new THREE.Vector3(SX + 900, 520, SZ - 300), new THREE.Vector3(SX * .5, 120, SZ - 100));
  let released = false;
  return { dur: DUR, update(t, dt) {
    const back = clamp((t - SWISH) / 1.0, 0, 1);
    if (t < SHOOT + .25) { want.copy(camA); look.copy(lookA); } else { want.set(CAMX + 60 * back, 300 + 40 * back, CAMZ + 160 * back); look.set(SX * .45 - 60 * back, 200 - 60 * back, (SZ + rimP.z) / 2 + 120 * back); } camera(t, dt, want, look);
    if (t < SWISH + .5) hero.model.rotation.y = faceRim; /* פונה לטבעת; אחר כך face() מסובב למצלמה */
    if (t < DIP) { pose(hero, SHOT.hold, false, pos, dt, 6); }
    else if (t < RISE) { pose(hero, SHOT.dip, false, pos, dt, 5); }
    else if (t < SHOOT) { const k = clamp((t - RISE) / (SHOOT - RISE), 0, 1); pos.y = ease(k) * 26; pose(hero, SHOT.release, false, pos, dt, 10); }
    else if (t < LAND) { const k = clamp((t - SHOOT) / (LAND - SHOOT), 0, 1); pos.y = Math.max(0, 26 + 60 * Math.sin(k * Math.PI) - 26 * k); pose(hero, k < .6 ? SHOT.follow : SHOT.land, false, pos, dt, 8); }
    else if (t < SWISH + .5) { pos.y = 0; pose(hero, SHOT.land, false, pos, dt, 6); }
    else celebrateStep(hero, t - SWISH - .5, { x: SX, z: SZ }, dt, 1, { base: toCam, short: true }); /* פונה למצלמה, יד אחת למעלה, בלי קפיצה (רועי) */
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
      if (crossed && hero) { if (l.crossT == null) l.crossT = t; celebrateStep(l.r, t - l.crossT, { x: FIN + 120, z: l.z }, dt, 1, { base: 0 }); return; } /* המנצח: מסתובב למצלמה, מסתכל, קופץ עם סיבוב ונוחת */
      if (crossed) { /* האחרים: מאטים אחרי הקו ועוברים להליכה (רועי: "צריכים ללכת ולא להמשיך לרוץ") */ if (l.vx == null) { l.vx = 420; l.wx = l.x; } l.vx = Math.max(70, l.vx - 300 * dt); l.wx += l.vx * dt; l.ph += (l.vx / 110) * dt; const walking = l.vx < 160; pos.set(l.wx, 0, l.z); l.r.model.rotation.y = Math.PI / 2; pose(l.r, walking ? poseAt(WALK, (l.ph % 1) * 8) : poseAt(SPRINT, (l.ph % 1) * 8), false, pos, dt, 12); return; }
      const target = !run ? SET_POS : (k > .85 && !crossed) ? LEAN : poseAt(SPRINT, (l.ph % 1) * 8);
      pos.set(l.x, 0, l.z); l.r.model.rotation.y = Math.PI / 2; pose(l.r, target, false, pos, dt, run ? 16 : 6);
    });
    const hx = Math.min(heroL.x, FIN + 120), fin = heroL.x >= FIN;
    want.set(hx + (fin ? 20 : 60), fin ? 260 : 260, heroL.z + (fin ? 1000 : 900)); look.set(hx + (fin ? 10 : 40), 100, heroL.z - (fin ? 40 : 160)); camera(t, dt, want, look);
    fans.update(t, t > WIN);
    if (t >= START && t < WIN) text.show(`${Math.min(9.58, (t - START) / DUR_RUN * 9.58).toFixed(2)}`, '', 'clock');
    if (t > WIN && t < WIN + .06) { conf.start(FIN + 100, 260, 0, 400); say('', 'pt-BR'); text.show('מקום ראשון!', '9.58', 'big'); }
    finaleText(text, t, WIN + 2.4, newBest, oldBest); conf.update(dt);
  } };
}

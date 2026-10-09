// הדמות התלת-ממדית המשותפת: טעינת המודל (Kenney, CC0), הנעת השלד מפוזות הקטלוג (PoseRig), ערכות בגדים (צביעת הטקסטורה),
// וסצנות מוכנות (חדר, אצטדיון, מסלול). משמש את מסך התרגיל (3d/), את חגיגת השיא (games/celebrate3d.js) ובעתיד את משחקי הספורט.
import * as THREE from '../3d/lib/three.module.min.js?v=20261009-companion-1';
import { FBXLoader } from '../3d/lib/loaders/FBXLoader.js?v=20261009-companion-1';

export { THREE };
export const SCALE = 68 / 111; // רגל תלת-ממד (111 יחידות) = רגל דו-ממד (68), כך שהדמות בקנה מידה של פוזות הקטלוג
// מבט לתלת-ממד: ex.view3d ('front'/'side') גובר; אחרת לפי רוב הפריימים (ידיים סימטריות סביב הצוואר = מלפנים)
export const isFrontPose = p => Math.abs((p.le[0] - p.neck[0]) + (p.re[0] - p.neck[0])) < 10 && Math.abs(p.le[0] - p.re[0]) > 14;
export const viewFront = ex => ex.view3d ? ex.view3d === 'front' : ex.frames.filter(f => isFrontPose(f[0])).length * 2 > ex.frames.length;
export const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

// ---- ערכות: צובעים את אזורי החולצה והמכנסיים בטקסטורה של Kenney (1024x1024: חולצה משמאל למטה, מכנסיים מימין למטה) ----
export const KITS3D = {
  maccabi: { name: 'מכבי חיפה', shirt: '#0B7A3B', shirt2: '#0A6A34', shorts: '#F4F4F4', number: '7', numberColor: '#FFFFFF', stripe: null },
  israel: { name: 'ישראל', shirt: '#1D4ED8', shirt2: '#1E40AF', shorts: '#F4F4F4', number: '10', numberColor: '#FFFFFF' },
  keeper: { name: 'שוער', shirt: '#FACC15', shirt2: '#EAB308', shorts: '#111827', number: '1', numberColor: '#111827' },
  grey: { name: 'אפור', shirt: '#9CA3AF', shirt2: '#6B7280', shorts: '#374151', number: '', numberColor: '#fff' },
  red: { name: 'אדום', shirt: '#DC2626', shirt2: '#B91C1C', shorts: '#F4F4F4', number: '9', numberColor: '#fff' },
  orange: { name: 'כתום', shirt: '#F97316', shirt2: '#EA580C', shorts: '#111827', number: '11', numberColor: '#fff' },
};
let baseSkin = null;
const skinUrl = new URL('../3d/model/skaterMaleA.png', import.meta.url).href;
export function loadBaseSkin() { return baseSkin || (baseSkin = new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = skinUrl; })); }
// הפנים בטקסטורה של Kenney: עיניים ב-(289,214) ו-(353,214), אף (322,245), פה (322,268). מציירים מעליהן פרצוף של סרט מצויר
function toonFace(g) {
  const LINE = '#241B3A', skin = '#F4967B';
  g.fillStyle = skin; g.fillRect(250, 176, 144, 110); /* מנקים עיניים/גבות/פה ישנים */
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(250, 176, 144, 0);
  for (const [ex, dir] of [[289, 1], [353, -1]]) { /* רועי 01/10: "קצת מפחיד, יותר אנושי": עיניים קטנות יותר, קשתית חומה, גבות דקות ורגועות */
    g.fillStyle = '#ffffff'; g.strokeStyle = LINE; g.lineWidth = 3; g.beginPath(); g.ellipse(ex, 216, 15, 17, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#5B3A1E'; g.beginPath(); g.arc(ex + 2 * dir, 219, 8.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1210'; g.beginPath(); g.arc(ex + 2 * dir, 219, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex + 5 * dir, 214, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3B2112'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - 17 * dir, 193); g.quadraticCurveTo(ex, 186, ex + 15 * dir, 190); g.stroke(); /* גבה דקה, קשת רגועה */
    g.fillStyle = 'rgba(255,120,120,.25)'; g.beginPath(); g.ellipse(ex + 26 * dir, 248, 12, 8, 0, 0, Math.PI * 2); g.fill(); /* סומק עדין */
  }
  g.strokeStyle = LINE; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(321, 254, 16, Math.PI * .2, Math.PI * .8); g.stroke(); /* חיוך עדין */
  g.strokeStyle = '#D9735F'; g.lineWidth = 4; g.beginPath(); g.moveTo(319, 236); g.quadraticCurveTo(316, 246, 323, 247); g.stroke(); /* אף: קו קטן */
}
export async function kitTexture(kit = KITS3D.maccabi) {
  const im = await loadBaseSkin(); const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 1024, 1024);
  // חולצה: הבד המרכזי 155..485 x 490..1024, פסי צד לבנים 45..155 ו-485..600 נשארים (שרוולים), הגלגולת מתכסה
  g.fillStyle = kit.shirt; g.fillRect(150, 488, 340, 536);
  g.fillStyle = kit.shirt2; g.fillRect(150, 488, 340, 26); // צווארון כהה
  if (kit.stripe) { g.fillStyle = kit.stripe; for (let x = 170; x < 480; x += 64) g.fillRect(x, 514, 22, 510); }
  // תג האימונים על קדמת החולצה של החבר. שאר הדמויות משתמשות בערכות הקיימות.
  if (kit.patch) {
    g.fillStyle = '#FACC15'; g.beginPath(); g.arc(320, 920, 66, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#241B3A'; g.font = `900 ${kit.patch.length > 2 ? 42 : 70}px Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kit.patch, 320, 920, 108);
  }
  // המספר על הגב (האזור הזה ממופה לגב, במראה, לכן מציירים הפוך כדי שייקרא נכון)
  if (kit.number) { g.save(); g.translate(320, 720); g.scale(-1, 1); g.fillStyle = kit.numberColor; g.font = '900 150px Heebo, Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kit.number, 0, 0); g.restore(); }
  if (kit.face !== false) toonFace(g); /* פרצוף מצויר: עיניים גדולות, גבות, חיוך, סומק (רועי 01/10: "לשפר את הדמות") */
  // מכנסיים: 612..1024 x 762..1024
  g.fillStyle = kit.shorts; g.fillRect(612, 762, 412, 262);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(612, 890, 412, 14); // חגורה
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; return t;
}

// ---- המודל ----
let fbxText = null;
async function fbxBuffer() {
  if (!fbxText) fbxText = import('../3d/model/character.js?v=20261009-companion-1').then(m => { const bin = atob(m.FBX_B64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf.buffer; });
  return fbxText;
}
// דמות חדשה (כל קריאה = עותק עצמאי עם שלד משלו). מחזיר { model, rig, mesh, setKit }
export async function loadCharacter(kit = KITS3D.maccabi) {
  const [buf, tex] = await Promise.all([fbxBuffer(), kitTexture(kit)]);
  const model = new FBXLoader().parse(buf, ''); model.scale.setScalar(SCALE);
  let mesh = null, outline = null;
  model.traverse(o => { if (o.isMesh) { mesh = o; o.castShadow = true; o.frustumCulled = false; o.material = toonMaterial(tex); } });
  // קו מתאר: עותק של הרשת המעורה (אותו שלד), פנים הפוכות, מוזז החוצה לאורך הנורמל; נותן מראה של סרט מצויר
  if (mesh) { model.updateMatrixWorld(true); const ws = new THREE.Vector3(); mesh.getWorldScale(ws); /* הגאומטריה של ה-FBX בקנה מידה פנימי, לכן רוחב הקו מתורגם ליחידות הרשת */ outline = mesh.clone(); outline.material = outlineMaterial(CARTOON.outline / (ws.x || 1), CARTOON.line); outline.castShadow = false; /* קו עבה: סגנון 3 שרועי בחר (01/10) */ outline.renderOrder = -1; mesh.parent.add(outline); }
  const rig = new PoseRig(model);
  return { model, rig, mesh, outline, async setKit(k) { mesh.material.map = await kitTexture(k); mesh.material.needsUpdate = true; } };
}

// חומר "טון": הצללה בדרגות (כמו אנימציה), עם ברק קטן. gradientMap של 4 דרגות
export const CARTOON = { outline: 4.2, line: '#241B3A', steps: ['#8a8a8a', '#ffffff'], boost: 1.12 }; /* סרט מצויר: שתי דרגות צבע, קו מתאר עבה, צבע רווי (רועי 01/10: "מספר 3 מעולה") */
let gradTex = null;
function gradientMap() { if (gradTex) return gradTex; const c = document.createElement('canvas'); c.width = CARTOON.steps.length; c.height = 1; const g = c.getContext('2d'); CARTOON.steps.forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); gradTex = new THREE.CanvasTexture(c); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.colorSpace = THREE.NoColorSpace; return gradTex; }
export function toonMaterial(map) { return new THREE.MeshToonMaterial({ map, gradientMap: gradientMap(), color: new THREE.Color(CARTOON.boost, CARTOON.boost, CARTOON.boost) }); }
export function outlineMaterial(width = 1.9, color = '#1B1740') {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(objectNormal) * ${width.toFixed(5)};`); };
  return m;
}

// ---- מניע השלד מפוזות דו-ממד ----
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const PAIRS = [['Hips', 'Spine'], ['Spine', 'Chest'], ['Chest', 'UpperChest'], ['UpperChest', 'Neck'], ['Neck', 'Head'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftFoot', 'LeftToes'], ['RightFoot', 'RightToes'], ['LeftHand', 'LeftHandIndex1'], ['RightHand', 'RightHandIndex1']]; // כף היד עם ילד, כדי שאפשר יהיה לכוון אותה (שטוחה על הרצפה)
export class PoseRig {
  constructor(model) {
    this.model = model; this.b = {}; model.traverse(o => { if (o.isBone) this.b[o.name] = o; });
    model.updateMatrixWorld(true); this.rest = {};
    for (const [a, c] of PAIRS) { const A = this.b[a], C = this.b[c]; if (!A || !C) continue; A.getWorldPosition(_v); C.getWorldPosition(_w); this.rest[a] = { dir: _w.sub(_v).normalize().clone(), q: A.getWorldQuaternion(new THREE.Quaternion()) }; }
    this.b.Hips.getWorldPosition(_v); this.hipsRest = _v.clone(); this.qmInv = new THREE.Quaternion();
  }
  // IK של שתי עצמות: מוריד את הקרסול ב-drop (עולם) על ידי כיפוף הברך באותו מישור שבו היא כבר כפופה
  legIK(footName, drop) {
    const side = footName.startsWith('Left') ? 'Left' : 'Right'; const H = this.b[side + 'UpLeg'], K = this.b[side + 'Leg'], F = this.b[footName]; if (!H || !K || !F) return;
    const h = new THREE.Vector3(), k = new THREE.Vector3(), f = new THREE.Vector3(); H.getWorldPosition(h); K.getWorldPosition(k); F.getWorldPosition(f);
    const l1 = h.distanceTo(k), l2 = k.distanceTo(f); const t = f.clone(); t.y -= drop;
    const u = t.clone().sub(h); let d = u.length(); if (d < 1e-3) return; u.divideScalar(d); d = Math.min(d, l1 + l2 - .05);
    const hk = k.clone().sub(h); const p = hk.clone().sub(u.clone().multiplyScalar(hk.dot(u))); if (p.lengthSq() < 1e-4) { p.set(0, 0, 1).applyQuaternion(this.model.quaternion); p.sub(u.clone().multiplyScalar(p.dot(u))); } p.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const kn = h.clone().add(u.clone().multiplyScalar(a)).add(p.multiplyScalar(hgt)); const tgt = h.clone().add(u.clone().multiplyScalar(d));
    this.aim(side + 'UpLeg', kn.clone().sub(h).applyQuaternion(this.qmInv)); this.model.updateMatrixWorld(true); K.getWorldPosition(k);
    this.aim(side + 'Leg', tgt.sub(k).applyQuaternion(this.qmInv)); this.model.updateMatrixWorld(true);
  }
  // סיבוב רגל שלמה (ישרה) סביב הירך כך שקצה האצבעות יעלה ב-lift, בלי לשנות את אורכה: לפלאנק/שכיבות סמיכה כשמורידים את האגן כדי שהידיים יגיעו לרצפה
  legPivot(footName, lift) {
    const side = footName.startsWith('Left') ? 'Left' : 'Right'; const H = this.b[side + 'UpLeg'], K = this.b[side + 'Leg'], F = this.b[footName], T = this.b[footName.replace('Foot', 'Toes_end')] || F; if (!H || !K || !F || !T) return;
    const h = new THREE.Vector3(), k = new THREE.Vector3(), f = new THREE.Vector3(), t = new THREE.Vector3(); H.getWorldPosition(h); K.getWorldPosition(k); F.getWorldPosition(f); T.getWorldPosition(t);
    const v = t.clone().sub(h), r = v.length(); if (r < 1e-3) return; const tgt = v.clone(); tgt.y = Math.min(r * .98, tgt.y + lift);
    const horiz = Math.hypot(tgt.x, tgt.z), need = Math.sqrt(Math.max(0, r * r - tgt.y * tgt.y)); if (horiz < 1e-3) return; const sc = need / horiz; tgt.x *= sc; tgt.z *= sc;
    const q = new THREE.Quaternion().setFromUnitVectors(v.clone().normalize(), tgt.clone().normalize());
    const kd = k.clone().sub(h).applyQuaternion(q), fd = f.clone().sub(k).applyQuaternion(q);
    this.aim(side + 'UpLeg', kd.applyQuaternion(this.qmInv)); this.model.updateMatrixWorld(true);
    this.aim(side + 'Leg', fd.applyQuaternion(this.qmInv)); this.model.updateMatrixWorld(true);
  }
  // מסובב עצם כך שהכיוון אל הילד שלו יהיה dir במערכת המודל (הדמות פונה +Z), בסיבוב המינימלי מכיוון המנוחה
  aim(name, dir) {
    const bone = this.b[name], r = this.rest[name]; if (!bone || !r || dir.lengthSq() < 1e-6) return;
    _v.copy(dir).normalize();
    if (r.dir.dot(_v) < -0.9) { /* כיוון כמעט הפוך למנוחה (רגליים למעלה בשכיבה): הסיבוב המינימלי בוחר ציר שרירותי והברך/כף הרגל יוצאות הפוכות (רועי: "הרגליים הפוכות"). מסובבים קודם 180° סביב ציר הרוחב (X) ואז סיבוב קטן אל היעד */
      const ax = new THREE.Vector3(1, 0, 0); ax.addScaledVector(r.dir, -ax.dot(r.dir)); if (ax.lengthSq() < 1e-4) ax.set(0, 0, 1); ax.normalize();
      const flip = new THREE.Quaternion().setFromAxisAngle(ax, Math.PI); const mid = r.dir.clone().applyQuaternion(flip);
      _q.setFromUnitVectors(mid, _v).multiply(flip);
    } else _q.setFromUnitVectors(r.dir, _v);
    _q.multiply(r.q);
    bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_pq); _pq.premultiply(this.qmInv).invert();
    bone.quaternion.copy(_pq.multiply(_q));
  }
  // pose: פוזה מהקטלוג (200x200, רצפה 182). front: מבט מלפנים (u,v,0), אחרת מהצד (0,v,u). at: מיקום כפות הרגליים בעולם (ברירת מחדל: לפי הפוזה)
  apply(pose, front, at = null) {
    /* pose.face (מבט צד בלבד): 1 = פונה ימינה (+X בעולם), -1 = פונה שמאלה. הדמות מסתובבת סביב עצמה והפוזה המשוקפת (TURN) מתהפכת חזרה, כך שבריצת מעבורת היא באמת רצה חזרה ולא "אחורה" */
    const face = (!front && pose.face != null) ? Math.max(-1, Math.min(1, pose.face)) : 1;
    if (!front && pose.face != null) { this.model.rotation.y = Math.PI / 2 - Math.acos(face); this._faced = true; } /* מינוס: הסיבוב עובר דרך +Z, כלומר הפנים אל המצלמה ולא הגב */
    else if (this._faced && !front) { this.model.rotation.y = Math.PI / 2; this._faced = false; } /* פוזה בלי face אחרי פוזות עם face: חזרה לפנייה ימינה (frameCamera עובר על כל הפריימים ומשאיר את הסיבוב האחרון) */
    const ms = face < 0 ? -1 : 1;
    this.model.updateWorldMatrix(true, false); this.model.getWorldQuaternion(this.qmInv).invert();
    const P = ([x, y, z = 0]) => front ? new THREE.Vector3(x - 100, 182 - y, z) : new THREE.Vector3(-z, 182 - y, ms * (x - 100)); /* z אופציונלי: עומק; ms משקף רק כיוונים (TURN) */
    const d = (a, b) => P(b).sub(P(a));
    const L = front ? 'Right' : 'Left', R = front ? 'Left' : 'Right';
    /* מיקום האגן: לפי הציור כמו שהוא (בלי השיקוף של ms): כשהדמות פונה שמאלה היא צריכה להיות בצד שאליו הציור המשוקף שם אותה. עם השיקוף גם על המיקום היא חזרה לצד הימני ו"עברה דרך הקיר" (רועי 01/10) */
    const hipLocal = front ? new THREE.Vector3(pose.hip[0] - 100, 182 - pose.hip[1], pose.hip[2] || 0) : new THREE.Vector3(-(pose.hip[2] || 0), 182 - pose.hip[1], pose.hip[0] - 100);
    /* המיקום לפי הסיבוב האמיתי של המודל (חגיגות ומשחקים מסובבים את הדמות לכל כיוון), מינוס סיבוב ה-TURN בלבד */
    const hipW = hipLocal.applyQuaternion(this.model.quaternion); if (!front && pose.face != null) hipW.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.acos(face)));
    const off = this.hipsRest.clone().applyQuaternion(this.model.quaternion);
    const base = at || new THREE.Vector3();
    this.model.position.set(base.x + hipW.x - off.x, base.y + hipW.y - off.y, base.z + hipW.z - off.z);
    const torso = d(pose.hip, pose.neck);
    this.aim('Hips', torso); this.aim('Spine', torso); this.aim('Chest', torso); this.aim('UpperChest', torso);
    this.aim('Neck', d(pose.neck, pose.head));
    this.aim(L + 'UpLeg', d(pose.hip, pose.lk)); this.aim(L + 'Leg', d(pose.lk, pose.lf));
    this.aim(R + 'UpLeg', d(pose.hip, pose.rk)); this.aim(R + 'Leg', d(pose.rk, pose.rf));
    // ידיים: במבט מהצד המרפקים נפתחים מעט הצידה (X של המודל), אחרת שתי הידיים נבלעות בגוף באותו מישור
    const lat = front ? 0 : (pose.lat ?? .32), side = name => name === 'Left' ? 1 : -1; /* pose.lat: ריצה = .1, צמוד לגוף (רועי: הידיים בריצה) */
    const armDir = (a, b, who) => { const v = d(a, b); if (lat) v.x += side(who) * lat * v.length(); return v; };
    this.aim(L + 'Arm', armDir(pose.neck, pose.le, L)); this.aim(L + 'ForeArm', armDir(pose.le, pose.lh, L).multiplyScalar(1));
    this.aim(R + 'Arm', armDir(pose.neck, pose.re, R)); this.aim(R + 'ForeArm', armDir(pose.re, pose.rh, R));
    for (const [hand, h] of [[L + 'Hand', pose.lh], [R + 'Hand', pose.rh]]) if (h[1] >= 178) { this.aim(hand, new THREE.Vector3(0, -0.08, 1)); /* כף יד על הרצפה: אצבעות קדימה */ if (this.handTwist && this.rest[hand]) { const bn = this.b[hand]; bn.rotateOnAxis(this.rest[hand].dir.clone().applyQuaternion(this.rest[hand].q.clone().invert()).normalize(), this.handTwist * (hand.startsWith('Left') ? 1 : -1)); } }
    // כף רגל: שטוחה (בעמידה) או בהמשך השוק כשהיא באוויר / על קצות האצבעות (שכיבות סמיכה, פלאנק)
    /* כף רגל: 'שטוח' = כיוון המנוחה של העצם מה-FBX (בפוזת T הדמות עומדת על סוליה שטוחה), לא ניחוש. 'אצבעות' = המנוחה מסובבת למטה סביב ציר הרוחב (X). רועי 01/10: "עומד על העקבים", "טובע ברצפה" */
    const X = new THREE.Vector3(1, 0, 0); const footDir = (foot, downDeg) => this.rest[foot].dir.clone().applyAxisAngle(X, downDeg * Math.PI / 180);
    /* זווית כף הרגל רציפה לפי גובה הפוזה (אין קפיצות בין 'שטוח' ל'אצבעות' ל'באוויר'): 180+ שטוח; 170..180 העקב עולה עד 50°; מתחת ל-170 הרגל באוויר, אצבעות למטה 50°→12° ככל שמרימים גבוה; שוק אופקי (שכיבות סמיכה) = על האצבעות 52° */
    const footAngle = (f, shin) => { const prone = f[1] >= 178 && shin.y < -0.35 * shin.length() && Math.abs(shin.z) > 0.6 * shin.length(); if (prone) return 52; if (f[1] >= 180) return 0; if (f[1] >= 170) return (180 - f[1]) * 5; return Math.min(50, Math.max(12, 50 - (170 - f[1]) * 1.5)); };
    this._feet = []; for (const n of ['LeftLeg', 'RightLeg']) if (this.b[n]) this.b[n].scale.set(1, 1, 1); /* איפוס מתיחת השוק מהפריים הקודם */
    for (const [foot, k, f] of [['LeftFoot', pose[L === 'Left' ? 'lk' : 'rk'], pose[L === 'Left' ? 'lf' : 'rf']], ['RightFoot', pose[R === 'Right' ? 'rk' : 'lk'], pose[R === 'Right' ? 'rf' : 'lf']]]) {
      const shin = d(k, f); const ang = footAngle(f, shin); if (this.rest[foot]) this.aim(foot, footDir(foot, ang)); this._feet.push({ foot, f, ang });
    }
    this.ropeUpdate(pose, front, base);
    // תיקון רצפה: הנקודה הנמוכה של כפות הרגליים (עד קצה האצבעות), הידיים (עד קצה האצבעות) והראש נוגעת בגובה הבסיס, עם שוליים קטנים כדי שהסוליה לא תיבלע
    this.model.updateMatrixWorld(true);
    const footY2 = s => (s === 'Left' ? pose[L === 'Left' ? 'lf' : 'rf'] : pose[R === 'Right' ? 'rf' : 'lf'])[1];
    const anyPlanted = footY2('Left') >= 178 || footY2('Right') >= 178, lyingPose = pose.head[1] >= 160;
    const onFloor = Math.max(pose.lf[1], pose.rf[1]) >= 170 || Math.max(pose.lh[1], pose.rh[1]) >= 178 || pose.head[1] >= 160; /* גם על קצות האצבעות (170..178) מיישרים לרצפה, אחרת הרגליים שוקעות (קפיצות קרסול) */
    if (onFloor) {
      /* רק האיברים שהפוזה אומרת שהם על הרצפה קובעים את הגובה. רגל מורמת (ריצה קלה) לא נספרת, אחרת האצבעות שלה מרימות את כל הגוף והרגל העומדת מרחפת (רועי: "עולה ויורד על העקבים") */
      const footY = s => (s === 'Left' ? pose[L === 'Left' ? 'lf' : 'rf'] : pose[R === 'Right' ? 'rf' : 'lf'])[1];
      const planted = ['Left', 'Right'].some(s => footY(s) >= 178); /* רגל נטועה (182) קובעת; רגל על אצבעות (170..178) רק אם אין נטועה, אחרת בריצה קלה הרגל שנוחתת מרימה את העומדת */
      const footOn = s => planted ? footY(s) >= 178 : footY(s) >= 170;
      const handOn = s => (s === 'Left' ? pose[L === 'Left' ? 'lh' : 'rh'] : pose[R === 'Right' ? 'rh' : 'lh'])[1] >= 178;
      const lying = pose.head[1] >= 160;
      const names = [];
      for (const s of ['Left', 'Right']) { if (footOn(s)) names.push(s + 'Toes_end', s + 'Toes', s + 'Foot'); if (handOn(s)) names.push(s + 'Hand', s + 'HandIndex3_end', s + 'HandThumb2_end', s + 'ForeArm'); }
      if (lying) names.push('Head', 'LeftForeArm', 'RightForeArm');
      let minY = Infinity; for (const n of names) { const b = this.b[n]; if (!b) continue; b.getWorldPosition(_v); const r = n === 'Head' ? 14 * SCALE * 1.6 : n.includes('Hand') ? 3 : 1; /* קצה אצבעות הרגל כמעט על הרצפה (במנוחה העצם 0.3 מעל הרצפה), לא 4: עם 4 כל הדמות ריחפה 4 ס"מ */ if (_v.y - r < minY) minY = _v.y - r; }
      if (minY < Infinity) { this.model.position.y -= minY - base.y; this._lift = -(minY - base.y); this.model.updateMatrixWorld(true); } /* זוכרים כמה הרמנו את הגוף על הרצפה */
    } else if (this._lift) { this.model.position.y += this._lift; this.model.updateMatrixWorld(true); } /* באוויר: אותה הרמה כמו על הרצפה, אחרת גובה הקפיצה "נאכל" (הרגליים התלת-ממדיות קצרות מהציור, על הרצפה הגוף מורם ~14-20 ובאוויר לא, אז קפיצה של 24 בציור נראתה כמו 4; רועי: "קפיצות קרסול נראה כמו תקלה") */
    if (this.trace) this.trace('align');
    /* רגל נטועה (182) שמרחפת כי אורכי הרגליים בציור הדו-ממדי לא תואמים לעצמות התלת-ממד (עמדת זינוק, ריצת מעבורת): מכופפים את הברך (IK של שתי עצמות) עד שכף הרגל יורדת לרצפה */
    for (const ft of this._feet || []) { if (ft.f[1] < 178 || ft.ang >= 50) continue; const te = this.b[ft.foot.replace('Foot', 'Toes_end')]; if (!te) continue; te.getWorldPosition(_v); const h = _v.y - 1 - base.y; if (h > 2) { for (let pass = 0; pass < 3; pass++) { te.getWorldPosition(_v); const hh = _v.y - 1 - base.y; if (hh <= 1) break; this.legIK(ft.foot, hh); if (this.rest[ft.foot]) this.aim(ft.foot, footDir(ft.foot, ft.ang)); this.model.updateMatrixWorld(true); }
        /* הרגל ישרה ועדיין לא מגיעה (הציור הדו-ממדי ארוך מהעצם): מאריכים את השוק עד 12% לאורך העצם */
        te.getWorldPosition(_v); const left = _v.y - 1 - base.y; if (left > 2) { const K = this.b[ft.foot.replace('Foot', 'Leg')], F = this.b[ft.foot]; if (K && F) { const ax = ['x', 'y', 'z'].reduce((m, c) => Math.abs(F.position[c]) > Math.abs(F.position[m]) ? c : m, 'x'); const l2 = F.position.length(); K.scale[ax] = Math.min(1.12, 1 + left / Math.max(1, l2)); this.model.updateMatrixWorld(true); } } } } /* עד 3 מעברים: אחרי כיוון כף הרגל מחדש הגובה משתנה מעט */
    if (this.trace) this.trace('plantedIK');
    /* ידיים על הרצפה שמרחפות (פלאנק, שכיבות סמיכה, עמדת זינוק, נגיעה ברצפה): הזרוע התלת-ממדית קצרה מהציור הדו-ממדי. מורידים את האגן עד 24 יחידות, ואת הרגליים שעל הרצפה מתקנים: רגל ישרה מסתובבת סביב הירך (פלאנק: הרגליים נעשות אופקיות יותר), רגל כפופה מתכופפת עוד בברך (סקוואט עמוק יותר) */
    if (!lyingPose) { const hands = []; for (const [hand, h] of [[L + 'Hand', pose.lh], [R + 'Hand', pose.rh]]) if (h[1] >= 178) hands.push(hand);
      const feet = (this._feet || []).filter(ft => ft.f[1] >= 170);
      if (hands.length && feet.length) { let lowest = Infinity; for (const hn of hands) for (const n of [hn, hn + 'Index3_end', hn + 'Thumb2_end']) { const b = this.b[n]; if (!b) continue; b.getWorldPosition(_v); if (_v.y - 3 < lowest) lowest = _v.y - 3; }
        const dropH = Math.min(24, lowest - base.y);
        if (this.trace) this.trace('hands lowest=' + lowest.toFixed(1) + ' drop=' + dropH.toFixed(1));
        if (dropH > 2) { this.model.position.y -= dropH; this.model.updateMatrixWorld(true);
          for (const ft of feet) { const te = this.b[ft.foot.replace('Foot', 'Toes_end')]; if (!te) continue; const side = ft.foot.startsWith('Left') ? 'Left' : 'Right'; const H = this.b[side + 'UpLeg'], K = this.b[side + 'Leg'], F = this.b[ft.foot]; if (!H || !K || !F) continue;
            H.getWorldPosition(_v); K.getWorldPosition(_w); const l1 = _v.distanceTo(_w); F.getWorldPosition(_v); const l2 = _w.distanceTo(_v); H.getWorldPosition(_w); const reach = l1 + l2 - _w.distanceTo(_v); /* רגל ישרה = reach קטן */
            for (let pass = 0; pass < 3; pass++) { te.getWorldPosition(_v); const pen = base.y + 1 - _v.y; if (pen <= .5) break; if (reach < 8) this.legPivot(ft.foot, pen); else this.legIK(ft.foot, -pen); if (this.rest[ft.foot]) this.aim(ft.foot, footDir(ft.foot, ft.ang)); this.model.updateMatrixWorld(true); } } } } }
    /* שוכב (ראש על הרצפה) וידיים 'על הרצפה' (178+) שמרחפות לצד הגוף (הרמות רגליים, גשר ישבן): מיישרים את הזרוע כולה אל נקודת המגע הנמוכה יותר (עד 3 מעברים) */
    if (lyingPose) for (const [hand, h] of [[L + 'Hand', pose.lh], [R + 'Hand', pose.rh]]) { if (h[1] < 178) continue; const side = hand.startsWith('Left') ? 'Left' : 'Right'; const A = this.b[side + 'Arm'], tip = this.b[hand + 'Index3_end'] || this.b[hand]; if (!A || !tip) continue;
      for (let pass = 0; pass < 3; pass++) { tip.getWorldPosition(_v); const fl = _v.y - 3 - base.y; if (fl <= 1.5) break; A.getWorldPosition(_w); const tgt = _v.clone(); tgt.y -= fl; const dir = tgt.sub(_w).applyQuaternion(this.qmInv); this.aim(side + 'Arm', dir); this.aim(side + 'ForeArm', dir); this.model.updateMatrixWorld(true); } }
    if (this.trace) this.trace('handsDone');
    /* רגל מורמת שאצבעותיה חודרות את הרצפה (למשל רגע אחרי ההתרוממות בריצה קלה): מיישרים אותה במקום להרים את כל הגוף, אחרת הרגל העומדת מרחפת; אם זה לא מספיק ויש רגל נטועה, מכופפים את הברך של הרגל המורמת (IK) במקום להרים את כל הגוף (ריצת מעבורת: הרגל הנטועה ריחפה 9 יחידות) */
    for (const ft of this._feet || []) { const te = this.b[ft.foot.replace('Foot', 'Toes_end')]; if (!te || ft.ang <= 0) continue; te.getWorldPosition(_v); if (_v.y - 1 < base.y - .01) { for (const a of [ft.ang * .5, 0]) { this.aim(ft.foot, footDir(ft.foot, a)); this.model.updateMatrixWorld(true); te.getWorldPosition(_v); if (_v.y - 1 >= base.y - .01) break; }
        if (anyPlanted && ft.f[1] < 178) { for (let pass = 0; pass < 3; pass++) { te.getWorldPosition(_v); const pen = base.y + 1 - _v.y; if (pen <= .3) break; this.legIK(ft.foot, -pen); this.aim(ft.foot, footDir(ft.foot, 0)); this.model.updateMatrixWorld(true); } } } }
    /* יד שחודרת את הרצפה כשיש רגל נטועה (מתיחת ירך אחורית: הידיים מגיעות לכפות הרגליים): זרוע ישרה מתקצרת בכיוון (מכוונים אותה אל נקודת המגע), במקום להרים את כל הגוף ואז כפות הרגליים מרחפות */
    if (anyPlanted) for (const side of ['Left', 'Right']) { const A = this.b[side + 'Arm'], F = this.b[side + 'ForeArm'], Hd = this.b[side + 'Hand'], tip = this.b[side + 'HandIndex3_end']; if (!A || !F || !Hd || !tip) continue;
      let low = Infinity; for (const b of [Hd, tip, this.b[side + 'HandThumb2_end']]) { if (!b) continue; b.getWorldPosition(_v); if (_v.y < low) low = _v.y; } const pen = base.y + 3 - low; if (pen <= .01) continue;
      A.getWorldPosition(_v); F.getWorldPosition(_w); const l1 = _v.distanceTo(_w); Hd.getWorldPosition(_w); const l2 = F.position.length() * 0 + _w.distanceTo(F.getWorldPosition(new THREE.Vector3())); const straight = l1 + l2 - _v.distanceTo(_w) < 8; if (!straight) continue;
      tip.getWorldPosition(_w); const tgt = _w.clone(); tgt.y += pen; const dir = tgt.sub(_v).applyQuaternion(this.qmInv); this.aim(side + 'Arm', dir); this.aim(side + 'ForeArm', dir); if (pose[(side === L ? 'lh' : 'rh')][1] >= 178) this.aim(side + 'Hand', new THREE.Vector3(0, -0.08, 1)); this.model.updateMatrixWorld(true); }
    /* תמיד: שום איבר לא חודר את הרצפה. באוויר (קפיצות, ריצה) הירכיים לפי הפוזה, אבל אם קצה רגל יורד מתחת לרצפה מרימים את כל הגוף (רועי: "טובע בתוך הרצפה, הכפות רגליים נעלמות") */
    { let low = Infinity; for (const n of ['LeftToes_end', 'RightToes_end', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'LeftHandIndex3_end', 'RightHandIndex3_end']) { const b = this.b[n]; if (!b) continue; b.getWorldPosition(_v); const r = n.includes('Hand') ? 3 : 1; if (_v.y - r < low) low = _v.y - r; } if (low < base.y - .01) { this.model.position.y += base.y - low; this.model.updateMatrixWorld(true); } }
  }
}

// חבל קפיצה: כשלפוזה יש rope (קטלוג: 300 = מתחת לרגליים, -80 = מעל הראש), מציירים צינור מכף יד לכף יד דרך נקודת שליטה מתחת/מעל
PoseRig.prototype.ropeUpdate = function (pose, front, base) {
  const has = pose.rope != null && this.model.parent;
  if (!has) { if (this.rope) this.rope.visible = false; return; }
  if (!this.rope) { this.rope = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#F97316', roughness: .6 })); this.rope.castShadow = true; this.model.parent.add(this.rope); }
  this.model.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(); this.b.LeftHand.getWorldPosition(a); this.b.RightHand.getWorldPosition(b);
  const mid = a.clone().add(b).multiplyScalar(.5); const below = pose.rope > 100;
  // נקודת השליטה: מתחת לרצפה מעט (החבל עובר מתחת לנעליים) או גבוה מעל הראש; במבט מלפנים החבל עובר לפני הגוף, מהצד לצד הרחוק
  // בעקומת בזייה ריבועית אמצע הקשת = 0.5*ידיים + 0.5*שליטה, לכן השליטה = 2*יעד - גובה הידיים. יעד: מתחת לסוליות או 30 מעל הראש
  let headY = 0; this.b.Head_end.getWorldPosition(_v); headY = _v.y;
  const targetY = below ? base.y - 4 : headY + 30;
  const ctrl = new THREE.Vector3(mid.x, 2 * targetY - mid.y, mid.z + (front ? 44 : 0));
  const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
  this.rope.geometry.dispose(); this.rope.geometry = new THREE.TubeGeometry(curve, 24, 1.3, 6, false); this.rope.visible = true;
};

// אביזרים מהקטלוג (ex.prop): הדום/מדרגה מעץ, קיר אחד, או שני קירות (מסדרון). בתרגילי צד: x דו-ממדי -100 = X בעולם
export function propMesh(prop) {
  if (!prop) return null;
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#C89B6D', roughness: .8 }), wallMat = new THREE.MeshStandardMaterial({ color: '#CFC6F3', roughness: 1 });
  if (prop.type === 'box') { const m = new THREE.Mesh(new THREE.BoxGeometry(prop.w, prop.h, 80), wood); m.position.set(prop.x + prop.w / 2 - 100, prop.h / 2, 0); m.castShadow = m.receiveShadow = true; g.add(m); const top = new THREE.Mesh(new THREE.BoxGeometry(prop.w + 4, 3, 84), new THREE.MeshStandardMaterial({ color: '#E2B98A' })); top.position.set(prop.x + prop.w / 2 - 100, prop.h + 1, 0); g.add(top); }
  else if (prop.type === 'wall') { const x = prop.x - 100 + (prop.x < 100 ? -8 : 8); /* הקיר מעט מאחורי נקודת המגע כדי שהידיים/הגב לא יעברו דרכו */ const near = x > 0; /* קיר בצד המצלמה (+X) מסתיר את הדמות, לכן שקוף למחצה */ const m = new THREE.Mesh(new THREE.BoxGeometry(8, 240, 420), near ? new THREE.MeshStandardMaterial({ color: '#CFC6F3', roughness: 1, transparent: true, opacity: .4 }) : wallMat); m.position.set(x, 120, 0); m.receiveShadow = !near; g.add(m); }
  else if (prop.type === 'marks') { /* קו זינוק וקו נחיתה על הרצפה (קפיצה לרוחק) + חיצים ביניהם */
    const tape = c => new THREE.MeshBasicMaterial({ color: c }); const mk = (x, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 120), tape(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, .3, 0); g.add(m); };
    mk(prop.from, '#ffffff'); mk(prop.to, '#FFD54A');
    const n = 4; for (let i = 1; i < n; i++) { const x = prop.from + (prop.to - prop.from) * i / n; const a = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), tape('rgba(255,255,255)')); a.material.transparent = true; a.material.opacity = .55; a.rotation.x = -Math.PI / 2; a.rotation.z = -Math.PI / 4; a.position.set(x, .2, 0); g.add(a); }
  }
  else if (prop.type === 'walls') {
    // מסדרון: הקיר הרחוק מהמצלמה מלא, הקיר הקרוב (צד +X, שם המצלמה) נמוך ושקוף למחצה כדי לא להסתיר את הדמות
    const far = new THREE.Mesh(new THREE.BoxGeometry(8, 240, 420), wallMat); far.position.set(-98, 120, 0); far.receiveShadow = true; g.add(far);
    const near = new THREE.Mesh(new THREE.BoxGeometry(8, 70, 420), new THREE.MeshStandardMaterial({ color: '#CFC6F3', roughness: 1, transparent: true, opacity: .45 })); near.position.set(98, 35, 0); g.add(near);
  }
  return g;
}

// ---- תאורה וסצנות ----
export function lights(scene, { sun = 2.2, sky = '#ffffff', ground = '#b9a7ff' } = {}) {
  scene.add(new THREE.HemisphereLight(sky, ground, .9));
  const s = new THREE.DirectionalLight('#fff7e6', sun); s.position.set(160, 320, 220); s.castShadow = true; s.shadow.mapSize.set(2048, 2048);
  Object.assign(s.shadow.camera, { left: -500, right: 500, top: 500, bottom: -200, near: 50, far: 1400 }); s.shadow.bias = -0.0005; scene.add(s);
  const fill = new THREE.DirectionalLight('#bfd7ff', sun * .35); fill.position.set(-260, 160, 120); scene.add(fill); // מילוי קר מהצד השני
  const rim = new THREE.DirectionalLight('#ffffff', sun * .5); rim.position.set(-80, 240, -320); scene.add(rim); // אור אחורי שמפריד את הדמות מהרקע
  return s;
}
// חדר: קיר, פנל, פרקט
export function room(scene, dark = false) {
  scene.background = new THREE.Color(dark ? '#1F1C38' : '#E9E3FF'); scene.fog = new THREE.Fog(scene.background, 600, 1100);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: dark ? '#6B5340' : '#E7D6BC', roughness: .95 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  for (let x = -800; x < 800; x += 46) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1600), new THREE.MeshBasicMaterial({ color: dark ? '#4B3A2C' : '#CDB79A' })); m.rotation.x = -Math.PI / 2; m.position.set(x, .2, 0); scene.add(m); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1600, 700), new THREE.MeshStandardMaterial({ color: dark ? '#2B2553' : '#F1ECFF', roughness: 1 })); wall.position.set(0, 350, -280); scene.add(wall);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1600, 8, 6), new THREE.MeshStandardMaterial({ color: '#D9D2F2' })); base.position.set(0, 4, -278); scene.add(base);
}
// כדורגל: כדור עם מחומשים (טקסטורה מצוירת)
export function soccerBallMesh(r = 12) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#111827';
  const pent = (x, y, s) => { g.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } g.closePath(); g.fill(); };
  for (let i = 0; i < 4; i++) { pent(32 + i * 64, 40, 14); pent(64 + i * 64, 96, 14); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: .6 })); m.castShadow = true; return m;
}
// קהל: גופים וראשים כמופעים (instanced), קופץ כשמתרגש
// קהל: אנשים בגודל אמיתי ביחס לדמות (scale 2.8 = גוף כ-95 + ראש, כגובה הדמות; רועי 30/09: "הקהל קטן")
// קהל: אוהדים מצוירים (לוחות עם ציור קנבס: ראש, שיער, חולצה, ידיים למעלה/למטה, קו מתאר) במקום קופסאות וכדורים (רועי 01/10: "המראה של הקהל נראה רע").
// 6 וריאציות, כל אחת InstancedMesh; update(t, excited) מקפיץ אותם ומנענע. אותו API כמו קודם.
const FAN_VARIANTS = 6; let fanTex = null;
function fanTextures() {
  if (fanTex) return fanTex; fanTex = [];
  const shirts = ['#0B7A3B', '#FDE047', '#1E3A8A', '#EF4444', '#0EA5E9', '#F472B6'], skins = ['#F1C27D', '#C68642', '#E0AC69', '#8D5524', '#F1C27D', '#C68642'], hairs = ['#2b1d12', '#111', '#8a5a2b', '#111', '#d9a441', '#3a2415'];
  for (let v = 0; v < FAN_VARIANTS; v++) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); const LINE = '#241B3A'; const up = v % 2 === 0;
    g.lineWidth = 6; g.strokeStyle = LINE; g.lineCap = 'round'; g.lineJoin = 'round';
    // רגליים
    g.fillStyle = '#1f2937'; g.beginPath(); g.roundRect(38, 190, 22, 58, 8); g.roundRect(68, 190, 22, 58, 8); g.fill(); g.stroke();
    // גוף
    g.fillStyle = shirts[v]; g.beginPath(); g.roundRect(30, 100, 68, 100, 18); g.fill(); g.stroke();
    // ידיים
    g.strokeStyle = LINE; g.lineWidth = 20; g.beginPath(); if (up) { g.moveTo(38, 112); g.lineTo(14, 40); g.moveTo(90, 112); g.lineTo(114, 40); } else { g.moveTo(36, 112); g.lineTo(26, 185); g.moveTo(92, 112); g.lineTo(102, 185); } g.stroke();
    g.strokeStyle = skins[v]; g.lineWidth = 11; g.stroke();
    // ראש
    g.lineWidth = 6; g.strokeStyle = LINE; g.fillStyle = skins[v]; g.beginPath(); g.arc(64, 66, 30, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = hairs[v]; g.beginPath(); g.arc(64, 60, 31, Math.PI * 1.05, Math.PI * 1.95); g.lineTo(93, 56); g.quadraticCurveTo(64, 30, 35, 56); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = LINE; g.beginPath(); g.arc(53, 68, 3.5, 0, 7); g.arc(75, 68, 3.5, 0, 7); g.fill();
    g.lineWidth = 4; g.beginPath(); g.arc(64, 74, 11, Math.PI * .15, Math.PI * .85); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; fanTex.push(t);
  }
  return fanTex;
}
export function crowd(scene, { count = 120, x0 = -600, x1 = 600, z = -760, y = 40, rows = 3, rowDz = 40, rowDy = 34, seed = 1, scale = 2.8 } = {}) {
  const S = scale, FW = 26 * S, FH = 52 * S;
  let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const per = Math.ceil(count / rows), fans = [];
  for (let i = 0; i < count; i++) { const r = Math.floor(i / per), j = i % per; fans.push({ x: x0 + (j + (r % 2) * .5 + rnd() * .3) * ((x1 - x0) / per), y: y + r * rowDy, z: z - r * rowDz, ph: rnd() * 6.28, v: Math.floor(rnd() * FAN_VARIANTS), sc: .9 + rnd() * .2 }); }
  const texs = fanTextures(); const meshes = [];
  for (let v = 0; v < FAN_VARIANTS; v++) { const n = fans.filter(f => f.v === v).length || 1; const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: texs[v], transparent: true, alphaTest: .5, side: THREE.DoubleSide }), n); m.frustumCulled = false; scene.add(m); meshes.push(m); }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3();
  const update = (t, excited) => {
    const idx = new Array(FAN_VARIANTS).fill(0);
    for (const f of fans) { const jump = excited ? Math.max(0, Math.sin(t * 9 + f.ph)) * 14 * S : Math.sin(t * 1.3 + f.ph) * 1.5; const m = meshes[f.v]; P.set(f.x, f.y + jump + FH / 2 * f.sc, f.z); SC.set(f.sc, f.sc, 1); Q.identity(); M.compose(P, Q, SC); m.setMatrixAt(idx[f.v]++, M); }
    meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  };
  update(0, false); return { update, meshes, body: meshes[0], head: meshes[1] };
}
// קונפטי: נקודות צבעוניות שנופלות
export function confetti(scene, n = 300) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
  const cs = [[.96, .32, .38], [.99, .87, .28], [.13, .73, .45], [.24, .5, .95], [.98, .98, .98]];
  for (let i = 0; i < n; i++) { const c = cs[i % cs.length]; col.set(c, i * 3); pos.set([0, -1000, 0], i * 3); vel.push([0, 0, 0]); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 9, vertexColors: true, sizeAttenuation: true })); scene.add(pts);
  let on = false;
  return { start(x, y, z, spread = 300) { on = true; for (let i = 0; i < n; i++) { pos.set([x + (Math.random() - .5) * spread, y + Math.random() * 200, z + (Math.random() - .5) * spread * .5], i * 3); vel[i] = [(Math.random() - .5) * 60, -60 - Math.random() * 90, (Math.random() - .5) * 40]; } g.attributes.position.needsUpdate = true; },
    update(dt) { if (!on) return; for (let i = 0; i < n; i++) { const k = i * 3; if (pos[k + 1] < 0) continue; pos[k] += vel[i][0] * dt; pos[k + 1] += vel[i][1] * dt; pos[k + 2] += vel[i][2] * dt; pos[k] += Math.sin(pos[k + 1] * .05 + i) * 30 * dt; } g.attributes.position.needsUpdate = true; } };
}
// מנוע רינדור על קנבס נתון
export function makeRenderer(canvas, w, h) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); renderer.setSize(w, h, false); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; return renderer;
}

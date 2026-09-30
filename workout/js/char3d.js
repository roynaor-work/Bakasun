// הדמות התלת-ממדית המשותפת: טעינת המודל (Kenney, CC0), הנעת השלד מפוזות הקטלוג (PoseRig), ערכות בגדים (צביעת הטקסטורה),
// וסצנות מוכנות (חדר, אצטדיון, מסלול). משמש את מסך התרגיל (3d/), את חגיגת השיא (games/celebrate3d.js) ובעתיד את משחקי הספורט.
import * as THREE from '../3d/lib/three.module.min.js';
import { FBXLoader } from '../3d/lib/loaders/FBXLoader.js';

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
export async function kitTexture(kit = KITS3D.maccabi) {
  const im = await loadBaseSkin(); const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 1024, 1024);
  // חולצה: הבד המרכזי 155..485 x 490..1024, פסי צד לבנים 45..155 ו-485..600 נשארים (שרוולים), הגלגולת מתכסה
  g.fillStyle = kit.shirt; g.fillRect(150, 488, 340, 536);
  g.fillStyle = kit.shirt2; g.fillRect(150, 488, 340, 26); // צווארון כהה
  if (kit.stripe) { g.fillStyle = kit.stripe; for (let x = 170; x < 480; x += 64) g.fillRect(x, 514, 22, 510); }
  // המספר על הגב (האזור הזה ממופה לגב, במראה, לכן מציירים הפוך כדי שייקרא נכון)
  if (kit.number) { g.save(); g.translate(320, 720); g.scale(-1, 1); g.fillStyle = kit.numberColor; g.font = '900 150px Heebo, Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kit.number, 0, 0); g.restore(); }
  // מכנסיים: 612..1024 x 762..1024
  g.fillStyle = kit.shorts; g.fillRect(612, 762, 412, 262);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(612, 890, 412, 14); // חגורה
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; return t;
}

// ---- המודל ----
let fbxText = null;
async function fbxBuffer() {
  if (!fbxText) fbxText = import('../3d/model/character.js').then(m => { const bin = atob(m.FBX_B64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf.buffer; });
  return fbxText;
}
// דמות חדשה (כל קריאה = עותק עצמאי עם שלד משלו). מחזיר { model, rig, mesh, setKit }
export async function loadCharacter(kit = KITS3D.maccabi) {
  const [buf, tex] = await Promise.all([fbxBuffer(), kitTexture(kit)]);
  const model = new FBXLoader().parse(buf, ''); model.scale.setScalar(SCALE);
  let mesh = null, outline = null;
  model.traverse(o => { if (o.isMesh) { mesh = o; o.castShadow = true; o.frustumCulled = false; o.material = toonMaterial(tex); } });
  // קו מתאר: עותק של הרשת המעורה (אותו שלד), פנים הפוכות, מוזז החוצה לאורך הנורמל; נותן מראה של סרט מצויר
  if (mesh) { model.updateMatrixWorld(true); const ws = new THREE.Vector3(); mesh.getWorldScale(ws); /* הגאומטריה של ה-FBX בקנה מידה פנימי, לכן רוחב הקו מתורגם ליחידות הרשת */ outline = mesh.clone(); outline.material = outlineMaterial(1.5 / (ws.x || 1)); outline.castShadow = false; outline.renderOrder = -1; mesh.parent.add(outline); }
  const rig = new PoseRig(model);
  return { model, rig, mesh, outline, async setKit(k) { mesh.material.map = await kitTexture(k); mesh.material.needsUpdate = true; } };
}

// חומר "טון": הצללה בדרגות (כמו אנימציה), עם ברק קטן. gradientMap של 4 דרגות
let gradTex = null;
function gradientMap() { if (gradTex) return gradTex; const c = document.createElement('canvas'); c.width = 4; c.height = 1; const g = c.getContext('2d'); [['#6b6b6b', 0], ['#a8a8a8', 1], ['#e6e6e6', 2], ['#ffffff', 3]].forEach(([col, i]) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); gradTex = new THREE.CanvasTexture(c); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.colorSpace = THREE.NoColorSpace; return gradTex; }
export function toonMaterial(map) { return new THREE.MeshToonMaterial({ map, gradientMap: gradientMap() }); }
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
  // מסובב עצם כך שהכיוון אל הילד שלו יהיה dir במערכת המודל (הדמות פונה +Z), בסיבוב המינימלי מכיוון המנוחה
  aim(name, dir) {
    const bone = this.b[name], r = this.rest[name]; if (!bone || !r || dir.lengthSq() < 1e-6) return;
    _q.setFromUnitVectors(r.dir, _v.copy(dir).normalize()); _q.multiply(r.q);
    bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_pq); _pq.premultiply(this.qmInv).invert();
    bone.quaternion.copy(_pq.multiply(_q));
  }
  // pose: פוזה מהקטלוג (200x200, רצפה 182). front: מבט מלפנים (u,v,0), אחרת מהצד (0,v,u). at: מיקום כפות הרגליים בעולם (ברירת מחדל: לפי הפוזה)
  apply(pose, front, at = null) {
    this.model.updateWorldMatrix(true, false); this.model.getWorldQuaternion(this.qmInv).invert();
    const P = ([x, y, z = 0]) => front ? new THREE.Vector3(x - 100, 182 - y, z) : new THREE.Vector3(-z, 182 - y, x - 100); /* z אופציונלי: עומק */
    const d = (a, b) => P(b).sub(P(a));
    const L = front ? 'Right' : 'Left', R = front ? 'Left' : 'Right';
    const hipW = P(pose.hip).applyQuaternion(this.model.quaternion), off = this.hipsRest.clone().applyQuaternion(this.model.quaternion);
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
    const flat = new THREE.Vector3(0, -0.05, 1);
    for (const [foot, k, f] of [['LeftFoot', pose[L === 'Left' ? 'lk' : 'rk'], pose[L === 'Left' ? 'lf' : 'rf']], ['RightFoot', pose[R === 'Right' ? 'rk' : 'lk'], pose[R === 'Right' ? 'rf' : 'lf']]]) {
      const shin = d(k, f); const tiptoe = (f[1] >= 170 && f[1] < 178) || (f[1] >= 178 && shin.y < -0.35 * shin.length() && Math.abs(shin.z) > 0.6 * shin.length()); /* עקב מורם, או שוק נוטה (שכיבות סמיכה) = על קצות האצבעות */
      this.aim(foot, f[1] < 170 ? new THREE.Vector3(shin.x, shin.y * .3 - .3 * shin.length(), shin.z + .6 * shin.length()) : tiptoe ? new THREE.Vector3(0, -0.9, 0.45) : flat);
    }
    this.ropeUpdate(pose, front, base);
    // תיקון רצפה: הנקודה הנמוכה של כפות הרגליים (עד קצה האצבעות), הידיים (עד קצה האצבעות) והראש נוגעת בגובה הבסיס, עם שוליים קטנים כדי שהסוליה לא תיבלע
    this.model.updateMatrixWorld(true);
    const onFloor = Math.max(pose.lf[1], pose.rf[1]) >= 178 || Math.max(pose.lh[1], pose.rh[1]) >= 178 || pose.head[1] >= 160;
    if (onFloor) { let minY = Infinity; for (const n of ['LeftToes_end', 'RightToes_end', 'LeftToes', 'RightToes', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'LeftHandIndex3_end', 'RightHandIndex3_end', 'LeftHandThumb2_end', 'RightHandThumb2_end', 'LeftForeArm', 'RightForeArm', 'Head']) { const b = this.b[n]; if (!b) continue; b.getWorldPosition(_v); const r = n === 'Head' ? 14 * SCALE * 1.6 : n.includes('Hand') ? 3 : 4; if (_v.y - r < minY) minY = _v.y - r; } this.model.position.y -= minY - base.y; this.model.updateMatrixWorld(true); }
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
export function crowd(scene, { count = 120, x0 = -600, x1 = 600, z = -760, y = 40, rows = 3, rowDz = 40, rowDy = 34, seed = 1, scale = 2.8 } = {}) {
  const S = scale;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(22 * S, 34 * S, 16 * S), new THREE.MeshStandardMaterial({ roughness: .9 }), count);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(9 * S, 10, 8), new THREE.MeshStandardMaterial({ roughness: .8 }), count);
  const fans = []; const colors = ['#0B7A3B', '#ffffff', '#0B7A3B', '#FDE047', '#1E3A8A', '#EF4444', '#0EA5E9', '#F472B6']; const skins = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524'];
  let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const per = Math.ceil(count / rows);
  for (let i = 0; i < count; i++) { const r = Math.floor(i / per), j = i % per; fans.push({ x: x0 + (j + (r % 2) * .5 + rnd() * .3) * ((x1 - x0) / per), y: y + r * rowDy, z: z - r * rowDz, ph: rnd() * 6.28, c: new THREE.Color(colors[Math.floor(rnd() * colors.length)]), sk: new THREE.Color(skins[Math.floor(rnd() * skins.length)]) }); body.setColorAt(i, fans[i].c); head.setColorAt(i, fans[i].sk); }
  scene.add(body); scene.add(head);
  const M = new THREE.Matrix4();
  const update = (t, excited) => { fans.forEach((f, i) => { const jump = excited && Math.sin(t * 9 + f.ph) > 0 ? 12 * S : 0; M.makeTranslation(f.x, f.y + jump + 17 * S, f.z); body.setMatrixAt(i, M); M.makeTranslation(f.x, f.y + jump + 44 * S, f.z); head.setMatrixAt(i, M); }); body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true; };
  update(0, false); return { update, body, head };
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

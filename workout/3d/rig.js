// מניע שלד תלת-ממדי (Mixamo-style: Hips, Spine, Neck, Head, UpLeg/Leg/Foot, Arm/ForeArm/Hand) מפוזות הדו-ממד של הקטלוג (200x200, רצפה 182).
// הרעיון: לכל עצם יש כיוון מנוחה (אל הילד שלו). מחשבים מהפוזה כיוון יעד במישור המסך ומסובבים את העצם בסיבוב המינימלי מכיוון המנוחה לכיוון היעד.
import * as THREE from './lib/three.module.min.js?v=20261009-weekly-1';

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
export class PoseRig {
  // model: האובייקט שנטען; s: קנה מידה של המודל ליחידות הדו-ממד
  constructor(model, s) {
    this.model = model; this.s = s;
    this.b = {}; model.traverse(o => { if (o.isBone) this.b[o.name] = o; });
    model.updateMatrixWorld(true);
    // כיווני מנוחה בעולם (המודל במקום 0, בלי סיבוב)
    this.rest = {};
    const pairs = [['Hips', 'Spine'], ['Spine', 'Chest'], ['Chest', 'UpperChest'], ['UpperChest', 'Neck'], ['Neck', 'Head'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftFoot', 'LeftToes'], ['RightFoot', 'RightToes']];
    for (const [a, c] of pairs) { const A = this.b[a], C = this.b[c]; if (!A || !C) continue; A.getWorldPosition(_v); C.getWorldPosition(_w); this.rest[a] = { dir: _w.sub(_v).normalize().clone(), q: A.getWorldQuaternion(new THREE.Quaternion()) }; }
    this.b.Hips.getWorldPosition(_v); this.hipsRest = _v.clone();
  }
  // מסובב עצם כך שהכיוון אל הילד שלו יהיה dir במערכת הצירים של המודל (הדמות פונה +Z במודל, בלי קשר לסיבוב הקבוצה)
  aim(name, dir) {
    const bone = this.b[name], r = this.rest[name]; if (!bone || !r || dir.lengthSq() < 1e-6) return;
    _q.setFromUnitVectors(r.dir, _v.copy(dir).normalize()); _q.multiply(r.q); // סיבוב המנוחה + הסיבוב המינימלי, במערכת המודל
    bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_pq); _pq.premultiply(this.qmInv).invert(); // ההורה במערכת המודל
    bone.quaternion.copy(_pq.multiply(_q));
  }
  // pose: פוזה מהקטלוג. front: מבט מלפנים (הדמות פונה למצלמה; שמאל המסך = ימין הדמות), אחרת מהצד (הדמות מסובבת ופונה ימינה על המסך)
  apply(pose, front) {
    this.model.updateWorldMatrix(true, false); this.qmInv = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    // מדו-ממד (u ימינה, v למעלה) למערכת המודל: מלפנים (u, v, 0); מהצד (0, v, u) כי קדימה של הדמות = +Z
    const P = ([x, y]) => front ? new THREE.Vector3(x - 100, 182 - y, 0) : new THREE.Vector3(0, 182 - y, x - 100);
    const d = (a, b) => P(b).sub(P(a));
    const L = front ? 'Right' : 'Left', R = front ? 'Left' : 'Right';
    // מיקום: הירכיים לפי הפוזה (בעולם), ואחר כך תיקון רצפה
    const hipW = P(pose.hip).applyQuaternion(this.model.quaternion), off = this.hipsRest.clone().applyQuaternion(this.model.quaternion);
    this.model.position.set(hipW.x - off.x, hipW.y - off.y, hipW.z - off.z);
    const torso = d(pose.hip, pose.neck);
    this.aim('Hips', torso); this.aim('Spine', torso); this.aim('Chest', torso); this.aim('UpperChest', torso);
    this.aim('Neck', d(pose.neck, pose.head));
    this.aim(L + 'UpLeg', d(pose.hip, pose.lk)); this.aim(L + 'Leg', d(pose.lk, pose.lf));
    this.aim(R + 'UpLeg', d(pose.hip, pose.rk)); this.aim(R + 'Leg', d(pose.rk, pose.rf));
    this.aim(L + 'Arm', d(pose.neck, pose.le)); this.aim(L + 'ForeArm', d(pose.le, pose.lh));
    this.aim(R + 'Arm', d(pose.neck, pose.re)); this.aim(R + 'ForeArm', d(pose.re, pose.rh));
    // כפות רגליים: קדימה ומעט למטה (במערכת המודל קדימה = +Z)
    const flat = new THREE.Vector3(0, -0.2, 1);
    for (const side of ['Left', 'Right']) this.aim(side + 'Foot', flat);
    // תיקון רצפה: אם בפוזה יש כף רגל (או יד) על הרצפה, הנקודה הנמוכה נוגעת ב-0
    this.model.updateMatrixWorld(true);
    const onFloor = Math.max(pose.lf[1], pose.rf[1]) >= 178 || Math.max(pose.lh[1], pose.rh[1]) >= 178;
    if (onFloor) {
      let minY = Infinity;
      for (const n of ['LeftToes', 'RightToes', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand']) { const b = this.b[n]; if (!b) continue; b.getWorldPosition(_v); if (_v.y < minY) minY = _v.y; }
      this.model.position.y -= minY; this.model.updateMatrixWorld(true);
    }
  }
}

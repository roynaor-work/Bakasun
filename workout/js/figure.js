// מנוע האנימציה: מקבל רצף פוזות ומצייר דמות מקלות ב-SVG שזזה ביניהן בצורה חלקה, כמו סרטון קצר בלופ.
const NS = 'http://www.w3.org/2000/svg';
const JOINTS = ['head', 'neck', 'hip', 'le', 'lh', 're', 'rh', 'lk', 'lf', 'rk', 'rf'];

const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const ease = t => t * t * (3 - 2 * t); // smoothstep: יוצא ונכנס לאט, כמו תנועה אמיתית

export function lerpPose(a, b, t) {
  const out = {};
  for (const j of JOINTS) { out[j] = [a[j][0] + (b[j][0] - a[j][0]) * t, a[j][1] + (b[j][1] - a[j][1]) * t]; const za = a[j][2] || 0, zb = b[j][2] || 0; if (za || zb) out[j][2] = za + (zb - za) * t; } // z אופציונלי: עומק לתלת-ממד
  if (a.lat != null || b.lat != null) { const la = a.lat ?? .32, lb = b.lat ?? .32; out.lat = la + (lb - la) * t; }
  if (a.rope != null || b.rope != null) {
    const ra = a.rope ?? b.rope, rb = b.rope ?? a.rope;
    out.rope = ra + (rb - ra) * t;
  }
  return out;
}

// באיזו נקודה בלופ נמצאים בזמן נתון (מילישניות) ומה הפוזה שם
export function poseAt(frames, ms) {
  const total = frames.reduce((s, f) => s + f[1], 0);
  let t = ((ms % total) + total) % total;
  for (let i = 0; i < frames.length; i++) {
    const [pose, dur] = frames[i];
    if (t < dur) return lerpPose(pose, frames[(i + 1) % frames.length][0], ease(t / dur));
    t -= dur;
  }
  return frames[0][0];
}

export const cycleMs = frames => frames.reduce((s, f) => s + f[1], 0);

export class Figure {
  // keep=true: הדמות מתווספת ל-SVG קיים (סצנה עם כמה דמויות) בלי לנקות אותו ובלי רצפה ו-viewBox
  constructor(svg, keep = false) {
    this.svg = svg;
    if (!keep) { svg.setAttribute('viewBox', '0 8 200 182'); svg.innerHTML = ''; }
    this.g = el('g', { class: 'fig' });
    if (!keep) svg.appendChild(el('line', { x1: 10, y1: 182, x2: 190, y2: 182, class: 'ground' }));
    this.prop = el('rect', { class: 'prop', x: 0, y: 0, width: 0, height: 0, rx: 4 });
    svg.appendChild(this.prop);
    this.prop2 = el('rect', { class: 'prop', x: 0, y: 0, width: 0, height: 0, rx: 4 });
    svg.appendChild(this.prop2);
    this.rope = el('path', { class: 'rope', d: '' });
    this.g.appendChild(this.rope);
    this.far = { arm: this.limb('far'), leg: this.limb('far') };
    this.torso = el('line', { class: 'torso' });
    this.g.appendChild(this.torso);
    this.near = { arm: this.limb('near'), leg: this.limb('near') };
    this.head = el('circle', { class: 'head', r: 11 });
    this.g.appendChild(this.head);
    svg.appendChild(this.g);
    this.raf = 0; this.speed = 1;
  }
  limb(cls) { const p = el('polyline', { class: 'limb ' + cls }); this.g.appendChild(p); return p; }
  draw(p) {
    const pts = a => a.map(x => x.join(',')).join(' ');
    this.head.setAttribute('cx', p.head[0]); this.head.setAttribute('cy', p.head[1]);
    this.torso.setAttribute('x1', p.neck[0]); this.torso.setAttribute('y1', p.neck[1]);
    this.torso.setAttribute('x2', p.hip[0]); this.torso.setAttribute('y2', p.hip[1]);
    this.far.arm.setAttribute('points', pts([p.neck, p.le, p.lh]));
    this.far.leg.setAttribute('points', pts([p.hip, p.lk, p.lf]));
    this.near.arm.setAttribute('points', pts([p.neck, p.re, p.rh]));
    this.near.leg.setAttribute('points', pts([p.hip, p.rk, p.rf]));
    if (p.rope != null) this.rope.setAttribute('d', `M ${p.lh[0]} ${p.lh[1]} Q 100 ${p.rope} ${p.rh[0]} ${p.rh[1]}`);
    else this.rope.setAttribute('d', '');
  }
  setProp(prop) {
    const r = this.prop; this.prop2.setAttribute('width', 0);
    if (!prop) { r.setAttribute('width', 0); return; }
    if (prop.type === 'walls') { r.setAttribute('x', 4); r.setAttribute('y', 30); r.setAttribute('width', 5); r.setAttribute('height', 152); this.prop2.setAttribute('x', 191); this.prop2.setAttribute('y', 30); this.prop2.setAttribute('width', 5); this.prop2.setAttribute('height', 152); return; }
    if (prop.type === 'box') { r.setAttribute('x', prop.x); r.setAttribute('y', prop.y); r.setAttribute('width', prop.w); r.setAttribute('height', prop.h); }
    else if (prop.type === 'wall') { r.setAttribute('x', prop.x - 4); r.setAttribute('y', 30); r.setAttribute('width', 5); r.setAttribute('height', 152); }
  }
  // ex: תרגיל שלם (frames + prop), או רק frames
  play(ex, speed = 1) {
    const frames = Array.isArray(ex) ? ex : ex.frames;
    this.setProp(Array.isArray(ex) ? null : ex.prop);
    this.stop(); this.frames = frames; this.speed = speed; this.cyc = 0;
    const start = performance.now(), total = cycleMs(frames);
    // onRep: נקרא בכל סיבוב שלם של הסרטון (ספירת חזרות יחד עם הדמות)
    const tick = now => { const ms = (now - start) * this.speed; const c = Math.floor(ms / total); if (c > this.cyc) { this.cyc = c; if (this.onRep) this.onRep(c); } this.draw(poseAt(frames, ms)); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  still(ex) { const frames = Array.isArray(ex) ? ex : ex.frames; this.setProp(Array.isArray(ex) ? null : ex.prop); this.stop(); this.draw(frames[0][0]); }
  // מיקום הדמות בסצנה (הזזה ומידה)
  place(x, y, scale = 1) { this.g.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`); }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
}

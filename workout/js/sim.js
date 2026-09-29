// סימולציית תרגיל: הדמות המלאה (player מ-sprites.js) על קנבס, בתוך חדר, עם קצב חזרות ואפקטים.
// מחליף את דמות המקלות ב-SVG במסך התרגיל. אותן פוזות מהקטלוג (exercises.js), אותו מנוע זמן (figure.js).
import { poseAt, cycleMs } from './figure.js';
import { player, KITS, isFront } from './games/sprites.js';

const W = 360, H = 300, GROUND = 268, CX = 180;
const J = ['head', 'neck', 'hip', 'le', 'lh', 're', 'rh', 'lk', 'lf', 'rk', 'rf'];

// מבט לכל הסרטון: רוב הפריימים מלפנים = מלפנים (אחרת הדמות מתהפכת באמצע תנועה, למשל בסיבובי גו)
export const viewOf = frames => frames.filter(f => isFront(f[0])).length * 2 > frames.length;

export class ExerciseSim {
  constructor(canvas, { kit = KITS.kid, onRep = null, theme = null } = {}) {
    this.cv = canvas; canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.kit = kit; this.onRep = onRep; this.theme = theme;
    this.raf = 0; this.speed = 1; this.scale = 1.3; this.reps = 0; this.puffs = []; this.flash = 0; this.count = null;
    this.ex = null; this.frames = null; this.front = false; this.wasAir = false; this.lastCycle = 0;
  }
  dark() { return this.theme === 'dark' || (this.theme == null && matchMedia('(prefers-color-scheme: dark)').matches); }
  // מפוזה (200x200, רצפה 182) לקנבס
  P([a, b]) { return [CX + (a - 100) * this.scale, GROUND + (b - 182) * this.scale]; }

  play(ex, speed = 1) {
    this.stop(); this.setEx(ex); this.speed = speed; this.reps = 0; this.lastCycle = 0;
    this.t0 = performance.now(); this.paused = 0;
    const tick = now => { this.frame((now - this.t0) * this.speed); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  still(ex) { this.stop(); this.setEx(ex); this.draw(this.frames[0][0], 0); }
  setEx(ex) { this.ex = Array.isArray(ex) ? { frames: ex } : ex; this.frames = this.ex.frames; this.front = viewOf(this.frames); this.puffs = []; }
  setSpeed(s) { if (!this.raf) { this.speed = s; return; } const ms = (performance.now() - this.t0) * this.speed; this.speed = s; this.t0 = performance.now() - ms / s; }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  // ספירה לאחור גדולה על הקנבס (3, 2, 1) לפני "ספור איתי"
  countdown(n) { this.count = { n, at: performance.now() }; }

  frame(ms) {
    const total = cycleMs(this.frames), cyc = Math.floor(ms / total);
    if (cyc > this.lastCycle) { this.lastCycle = cyc; this.reps++; this.flash = 1; if (this.onRep) this.onRep(this.reps); }
    this.draw(poseAt(this.frames, ms), ms);
  }

  draw(pose, ms) {
    const c = this.ctx, dark = this.dark();
    c.clearRect(0, 0, W, H);
    this.room(c, dark);
    this.props(c, dark);
    // צל על הרצפה לפי מה שנוגע בה (רגליים, ידיים, גב); באוויר: צל קטן מתחת לירכיים
    const low = J.filter(j => pose[j][1] >= 176).map(j => this.P(pose[j])[0]);
    const air = low.length === 0;
    if (air) { const [hx] = this.P(pose.hip), lift = 182 - Math.max(pose.lf[1], pose.rf[1]); const k = Math.max(.4, 1 - lift / 120); this.shadow(c, hx, 30 * this.scale * k, .18 * k); }
    else { const a = Math.min(...low), b = Math.max(...low); this.shadow(c, (a + b) / 2, Math.max(28 * this.scale, (b - a) / 2 + 14 * this.scale), .22); }
    // אבק בנחיתה: מהאוויר לרצפה
    if (this.wasAir && !air && ms) { for (const f of [pose.lf, pose.rf]) { const [x, y] = this.P(f); for (let i = 0; i < 4; i++) this.puffs.push({ x: x + (Math.random() - .5) * 16, y: GROUND - 2, vx: (Math.random() - .5) * 60, vy: -20 - Math.random() * 30, r: 4 + Math.random() * 5, a: .5 }); } }
    this.wasAir = air;
    this.countdownDraw(c, dark);
    this.rope(c, pose);
    player(c, pose, CX, GROUND, this.scale, this.kit, { shadow: false, front: this.front });
    this.drawPuffs(c);
    this.hud(c, dark);
  }

  shadow(c, x, rx, alpha) { c.fillStyle = `rgba(30,27,58,${alpha})`; c.beginPath(); c.ellipse(x, GROUND + 4, rx, rx * .22, 0, 0, Math.PI * 2); c.fill(); }

  room(c, dark) {
    // קיר: גרדיאנט רך; רצפה: פרקט עם קווים; פנל תחתון; חלון עם שמיים בצד
    const wall = c.createLinearGradient(0, 0, 0, GROUND); wall.addColorStop(0, dark ? '#2B2553' : '#F4F1FF'); wall.addColorStop(1, dark ? '#1F1C38' : '#E9E3FF');
    c.fillStyle = wall; c.fillRect(0, 0, W, GROUND);
    const hall = this.ex && this.ex.prop && this.ex.prop.type === 'walls';
    if (hall) { this.corridor(c, dark); return; }
    // חלון
    c.fillStyle = dark ? '#3B3570' : '#DDD5FF'; c.beginPath(); c.roundRect(24, 26, 86, 78, 8); c.fill();
    const sky = c.createLinearGradient(0, 30, 0, 100); sky.addColorStop(0, dark ? '#1E3A5F' : '#BFE3FF'); sky.addColorStop(1, dark ? '#0F2440' : '#E6F4FF');
    c.fillStyle = sky; c.beginPath(); c.roundRect(30, 32, 74, 66, 5); c.fill();
    c.fillStyle = dark ? 'rgba(255,255,255,.25)' : '#fff'; c.beginPath(); c.arc(52, 58, 7, 0, 7); c.arc(62, 54, 9, 0, 7); c.arc(72, 59, 7, 0, 7); c.fill();
    c.strokeStyle = dark ? '#3B3570' : '#DDD5FF'; c.lineWidth = 3; c.beginPath(); c.moveTo(67, 32); c.lineTo(67, 98); c.moveTo(30, 65); c.lineTo(104, 65); c.stroke();
    // פוסטר "אלוף" בצד השני
    c.fillStyle = dark ? '#4C1D95' : '#FDE68A'; c.beginPath(); c.roundRect(262, 30, 68, 50, 6); c.fill();
    c.fillStyle = dark ? '#FDE68A' : '#B45309'; c.font = '900 20px Heebo, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🏆', 296, 56);
    // פנל ורצפה
    c.fillStyle = dark ? '#3A3460' : '#D9D2F2'; c.fillRect(0, GROUND - 8, W, 8);
    const fl = c.createLinearGradient(0, GROUND, 0, H); fl.addColorStop(0, dark ? '#5B4636' : '#E9D8BE'); fl.addColorStop(1, dark ? '#3E2F25' : '#D7C2A3');
    c.fillStyle = fl; c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = dark ? 'rgba(0,0,0,.25)' : 'rgba(120,80,40,.18)'; c.lineWidth = 1;
    for (let x = -20; x < W; x += 46) { c.beginPath(); c.moveTo(x, GROUND); c.lineTo(x - 10, H); c.stroke(); }
    c.beginPath(); c.moveTo(0, GROUND + 16); c.lineTo(W, GROUND + 16); c.stroke();
  }

  // מסדרון (תרגילי קיר לקיר): שני קירות בצדדים, דלת בסוף, פנל ורצפה
  corridor(c, dark) {
    const [lx] = this.P([2, 0]), [rx] = this.P([198, 0]);
    const band = (x0, x1, flip) => { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(flip ? 1 : 0, dark ? '#4B4574' : '#CFC6F3'); g.addColorStop(flip ? 0 : 1, dark ? '#2B2553' : '#A99AE0'); c.fillStyle = g; c.fillRect(x0, 0, x1 - x0, GROUND); c.strokeStyle = dark ? '#1B1740' : '#8B7BD0'; c.lineWidth = 2; c.beginPath(); c.moveTo(flip ? x0 : x1, 0); c.lineTo(flip ? x0 : x1, GROUND); c.stroke(); };
    band(0, lx, false); band(rx, W, true);
    // דלת בקיר האחורי
    c.fillStyle = dark ? '#3B3570' : '#D9D2F2'; c.beginPath(); c.roundRect(CX - 34, 60, 68, GROUND - 68, [6, 6, 0, 0]); c.fill(); c.strokeStyle = dark ? '#1B1740' : '#A99AE0'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#FDE68A'; c.beginPath(); c.arc(CX + 22, 160, 4, 0, 7); c.fill();
    c.fillStyle = dark ? '#3A3460' : '#D9D2F2'; c.fillRect(lx, GROUND - 8, rx - lx, 8);
    const fl = c.createLinearGradient(0, GROUND, 0, H); fl.addColorStop(0, dark ? '#5B4636' : '#E9D8BE'); fl.addColorStop(1, dark ? '#3E2F25' : '#D7C2A3');
    c.fillStyle = fl; c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = dark ? 'rgba(0,0,0,.25)' : 'rgba(120,80,40,.18)'; c.lineWidth = 1;
    for (let x = -20; x < W; x += 46) { c.beginPath(); c.moveTo(x, GROUND); c.lineTo(x - 10, H); c.stroke(); }
  }

  props(c, dark) {
    const p = this.ex && this.ex.prop; if (!p || p.type === 'walls') return;
    const wood = (x, y, w, h) => { const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#C89B6D'); g.addColorStop(1, '#8B5E3C'); c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill(); c.strokeStyle = '#5B3A21'; c.lineWidth = 2; c.stroke(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 3, y + 2, w - 6, 3); };
    const wall = x => { const [wx] = this.P([x, 0]); const g = c.createLinearGradient(wx - 8, 0, wx + 8, 0); g.addColorStop(0, dark ? '#4B4574' : '#C7BDF0'); g.addColorStop(1, dark ? '#2B2553' : '#A99AE0'); c.fillStyle = g; c.fillRect(wx - 8, 20, 16, GROUND - 20); c.strokeStyle = dark ? '#1B1740' : '#8B7BD0'; c.lineWidth = 2; c.strokeRect(wx - 8, 20, 16, GROUND - 20); };
    if (p.type === 'box') { const [x, y] = this.P([p.x, p.y]); wood(x, y, p.w * this.scale, p.h * this.scale); }
    else if (p.type === 'wall') wall(p.x - 4);
  }

  rope(c, pose) {
    if (pose.rope == null) return;
    const [ax, ay] = this.P(pose.lh), [bx, by] = this.P(pose.rh), [, cy] = this.P([100, pose.rope]);
    c.strokeStyle = '#F97316'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(CX, cy, bx, by); c.stroke();
    c.fillStyle = '#7C2D12'; for (const [x, y] of [[ax, ay], [bx, by]]) { c.beginPath(); c.roundRect(x - 4, y - 6, 8, 14, 3); c.fill(); }
  }

  drawPuffs(c) {
    const dt = 1 / 60;
    for (const q of this.puffs) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 40 * dt; q.r += 12 * dt; q.a -= 1.4 * dt; c.fillStyle = `rgba(190,170,140,${Math.max(0, q.a)})`; c.beginPath(); c.arc(q.x, q.y, q.r, 0, 7); c.fill(); }
    this.puffs = this.puffs.filter(q => q.a > 0);
  }

  hud(c, dark) {
    // הבזק חזרה: מסגרת שנעלמת
    if (this.flash > 0) { c.strokeStyle = `rgba(139,92,246,${this.flash * .7})`; c.lineWidth = 8 * this.flash; c.strokeRect(0, 0, W, H); this.flash = Math.max(0, this.flash - .06); }
  }
  // ספירה לאחור: מספר ענק על הקיר, מאחורי הדמות, מתכווץ ונעלם
  countdownDraw(c, dark) {
    if (!this.count) return;
    const el = (performance.now() - this.count.at) / 1000, n = this.count.n - Math.floor(el); if (n <= 0) { this.count = null; return; }
    const k = 1 - (el % 1); c.save(); c.globalAlpha = .2 + .6 * k; c.fillStyle = dark ? '#FDE68A' : '#6C4CF1'; c.font = `900 ${110 + 50 * k}px Heebo, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), CX, 120); c.restore();
  }
}

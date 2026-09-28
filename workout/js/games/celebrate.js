// חגיגת שיא חדש: סימולציה אקראית מחמש (שער מבעיטה, שער בנגיחה, סלאם דאנק, קליעת שלוש, ריצת 100 מטר).
// פרספקטיבה, כדור תלת-ממדי שמסתובב עם צל, זום מצלמה, רשת שמתנפחת, קהל אמיתי, מקהלת "גוווול", קריין. בלי צפצופים.
import { POSE, GK, KITS, player, crowd, crowdGen, soccerBall, basketBall, groundShadow } from './sprites.js';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, easeOut = t => 1 - Math.pow(1 - t, 3);
export const SCENE_IDS = ['goal', 'header', 'dunk', 'three', 'sprint'];

// ---- סאונד ----
function makeAudio(enabled) {
  let ac = null; const A = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  const osc = (f, at, dur, { type = 'triangle', vol = .12, slide = 0, vib = 0 } = {}) => { if (!enabled) return; try { const c = A(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + at); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), c.currentTime + at + dur); if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(c.currentTime + at); l.stop(c.currentTime + at + dur); } o.connect(g); g.connect(c.destination); const t = c.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .04); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.start(t); o.stop(t + dur + .05); } catch { /* */ } };
  const noise = (at, dur, { vol = .3, lp = 1000, hp = 100, attack = .02 } = {}) => { if (!enabled) return; try { const c = A(), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const g = c.createGain(); s.connect(f); f.connect(h); h.connect(g); g.connect(c.destination); const t = c.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.start(t); s.stop(t + dur + .05); } catch { /* */ } };
  // מקהלת אוהדים צועקת "גוווול": הרבה קולות, תנועת "או" דרך פורמנטים, גלישה למטה בסוף כמו צעקה
  const chant = (at, dur = 2.2) => { if (!enabled) return; try { const c = A(), t = c.currentTime + at; const master = c.createGain(); master.connect(c.destination); master.gain.setValueAtTime(.0001, t); master.gain.linearRampToValueAtTime(.9, t + .18); master.gain.setValueAtTime(.9, t + dur - .5); master.gain.exponentialRampToValueAtTime(.0001, t + dur);
      const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(); f1.type = 'bandpass'; f2.type = 'bandpass'; f1.Q.value = 6; f2.Q.value = 7; f1.frequency.setValueAtTime(480, t); f2.frequency.setValueAtTime(880, t); f1.frequency.setValueAtTime(480, t + dur - .5); f1.frequency.linearRampToValueAtTime(330, t + dur - .1); f2.frequency.setValueAtTime(880, t + dur - .5); f2.frequency.linearRampToValueAtTime(1100, t + dur - .1);
      const mix = c.createGain(); mix.gain.value = .11; mix.connect(f1); mix.connect(f2); f1.connect(master); f2.connect(master);
      for (let i = 0; i < 14; i++) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; const f0 = 160 + Math.random() * 110; o.frequency.setValueAtTime(f0 * 1.06, t); o.frequency.linearRampToValueAtTime(f0, t + .3); o.frequency.linearRampToValueAtTime(f0 * .86, t + dur); const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 4.5 + Math.random() * 2; lg.gain.value = f0 * .025; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); g.gain.value = 1; o.connect(g); g.connect(mix); o.start(t + Math.random() * .08); o.stop(t + dur); }
      noise(at, .08, { vol: .35, lp: 1200, hp: 300 }); } catch { /* */ } };
  return {
    kick: at => { noise(at, .12, { vol: .45, lp: 500, hp: 80 }); osc(90, at, .15, { type: 'sine', vol: .3, slide: -50 }); },
    bounce: at => { noise(at, .07, { vol: .3, lp: 400, hp: 60 }); osc(110, at, .1, { type: 'sine', vol: .25, slide: -40 }); },
    swish: at => noise(at, .3, { vol: .3, lp: 3500, hp: 900 }),
    rim: at => { noise(at, .12, { vol: .35, lp: 900, hp: 200 }); noise(at + .05, .3, { vol: .2, lp: 2500, hp: 700 }); },
    tension: (at, dur) => noise(at, dur, { vol: .14, lp: 900, hp: 300, attack: dur * .9 }),
    murmur: (at, dur) => noise(at, dur, { vol: .1, lp: 800, hp: 250, attack: .3 }),
    roar: (at, dur) => { noise(at, dur, { vol: .55, lp: 1400, hp: 200, attack: .15 }); for (let i = 0; i < 18; i++) osc(250 + Math.random() * 600, at + Math.random() * dur * .7, .3, { type: 'sawtooth', vol: .02, slide: -120 }); },
    chant,
    horn: () => {},
    drums: (at, n = 8) => { for (let i = 0; i < n; i++) { const t = at + i * .22; noise(t, .1, { vol: .16, lp: i % 2 ? 2500 : 200, hp: i % 2 ? 800 : 30 }); if (!(i % 2)) osc(95, t, .16, { type: 'sine', vol: .22, slide: -60 }); } },
    boom: () => {},
    gun: at => noise(at, .15, { vol: .6, lp: 900, hp: 100 }),
    steps: (at, n, gap) => { for (let i = 0; i < n; i++) noise(at + i * gap, .06, { vol: .12, lp: 600, hp: 150 }); },
    camera: () => {},
  };
}

// ---- ציור משותף ----
function bigText(ctx, txt, x, y, size, fill, stroke = '#1B1740', scale = 1, font = 'Heebo, Rubik, sans-serif') {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.font = `900 ${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = /[A-Za-z]/.test(txt) && !/[֐-׿]/.test(txt) ? 'ltr' : 'rtl'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = size / 6; ctx.shadowOffsetY = size / 14; ctx.strokeStyle = stroke; ctx.lineWidth = size / 7; ctx.strokeText(txt, 0, 0); ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, '#fff'); g.addColorStop(.35, fill); g.addColorStop(1, fill); ctx.fillStyle = g; ctx.fillText(txt, 0, 0); ctx.restore();
}
function poseAt(frames, ms) { const total = frames.reduce((s, f) => s + f[1], 0); let t = ms % total; for (let i = 0; i < frames.length; i++) { const [p, d] = frames[i]; if (t < d) { const q = frames[(i + 1) % frames.length][0], k = t / d, e = k * k * (3 - 2 * k), o = {}; for (const j in p) if (Array.isArray(p[j])) o[j] = [p[j][0] + (q[j][0] - p[j][0]) * e, p[j][1] + (q[j][1] - p[j][1]) * e]; return o; } t -= d; } return frames[0][0]; }
// זום מצלמה סביב נקודה
const cam = (ctx, fx, fy, z, fn) => { ctx.save(); ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy); fn(); ctx.restore(); };
const HEADER = { head: [112, 62], neck: [104, 78], hip: [96, 120], le: [88, 100], lh: [76, 84], re: [116, 98], rh: [126, 80], lk: [96, 150], lf: [92, 176], rk: [106, 148], rf: [112, 174] };
const JORDAN = { head: [104, 26], neck: [102, 42], hip: [100, 90], le: [86, 62], lh: [72, 84], re: [116, 30], rh: [124, -8], lk: [62, 112], lf: [28, 140], rk: [142, 104], rf: [180, 128] }; // הרגליים פתוחות באוויר, יד אחת למעלה
const LAND = { head: [100, 72], neck: [100, 88], hip: [100, 126], le: [84, 106], lh: [66, 122], re: [116, 106], rh: [134, 122], lk: [84, 152], lf: [78, 182], rk: [116, 152], rf: [122, 182] }; // כריעה לפני הניתור ובנחיתה
const DUNK = { head: [104, 30], neck: [102, 46], hip: [100, 92], le: [92, 62], lh: [86, 84], re: [112, 36], rh: [120, 14], lk: [90, 116], lf: [80, 136], rk: [112, 114], rf: [118, 136] };
const SHOOT = { head: [100, 30], neck: [100, 46], hip: [100, 92], le: [88, 60], lh: [92, 40], re: [112, 40], rh: [116, 14], lk: [92, 118], lf: [86, 140], rk: [108, 116], rf: [112, 140] };
const LEAN = { head: [124, 66], neck: [116, 80], hip: [100, 118], le: [100, 104], lh: [82, 118], re: [130, 100], rh: [146, 88], lk: [120, 146], lf: [130, 176], rk: [82, 150], rf: [66, 176] };

function fx(ctx, W, H) {
  let parts = [], confetti = [], flashes = []; const colors = ['#22C55E', '#FDE047', '#fff', '#F472B6', '#60A5FA'];
  return {
    burst(x, y, color, n = 50, sp = 260) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 1 + Math.random() * .8, r: 2 + Math.random() * 3, trail: [] }); } },
    confetti(n) { for (let i = 0; i < n; i++) confetti.push({ x: rnd(0, W), y: rnd(-100, -10), vy: rnd(120, 260), rot: rnd(0, 6), vr: rnd(-6, 6), ph: rnd(0, 6), color: colors[i % 5] }); },
    flash() { flashes.push({ x: rnd(10, W - 10), y: rnd(10, 60), t: .18 }); },
    get count() { return parts.length; },
    draw(dt) {
      confetti.forEach(c => { c.y += c.vy * dt; c.x += Math.sin(c.y / 30 + c.ph) * 40 * dt; c.rot += c.vr * dt; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.color; ctx.fillRect(-5, -8, 10, 16 * Math.abs(Math.cos(c.rot * 2))); ctx.restore(); }); confetti = confetti.filter(c => c.y < H + 20);
      parts.forEach(p => { p.t -= dt; p.vy += 240 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.trail.push([p.x, p.y]); if (p.trail.length > 6) p.trail.shift(); ctx.globalAlpha = Math.max(0, p.t); ctx.strokeStyle = p.color; ctx.lineWidth = p.r; ctx.lineCap = 'round'; ctx.beginPath(); p.trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.globalAlpha = 1; }); parts = parts.filter(p => p.t > 0);
      flashes.forEach(f => { f.t -= dt; ctx.fillStyle = `rgba(255,255,255,${f.t * 4})`; ctx.beginPath(); ctx.arc(f.x, f.y, 8, 0, 7); ctx.fill(); }); flashes = flashes.filter(f => f.t > 0);
    },
  };
}

// ---- מגרש בפרספקטיבה: הקהל למעלה, קו השער הוא האופק, הפסים מתכנסים ----
function pitch(ctx, W, H, goal, fans, t, excited, bulge) {
  const GL = goal.y + goal.h, VX = W / 2, VY = goal.y - 260;
  const sky = ctx.createLinearGradient(0, 0, 0, GL); sky.addColorStop(0, '#0b1026'); sky.addColorStop(1, '#1e293b'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GL);
  ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, W, goal.y + 8); crowd(ctx, fans, t, excited);
  // זרקורים: הילה בהירה משני הצדדים
  for (const lx of [30, W - 30]) { const g = ctx.createRadialGradient(lx, 6, 2, lx, 6, 120); g.addColorStop(0, 'rgba(255,255,230,.55)'); g.addColorStop(.3, 'rgba(255,255,230,.12)'); g.addColorStop(1, 'rgba(255,255,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, GL); }
  // לוחות פרסום צבעוניים לאורך קו השער (בלי טקסט)
  const boards = ['#1d4ed8', '#dc2626', '#059669', '#f59e0b', '#7c3aed', '#0ea5e9']; for (let i = 0; i < 6; i++) { const bx = -20 + i * (W + 40) / 6; ctx.fillStyle = boards[i]; ctx.fillRect(bx, goal.y + 4, (W + 40) / 6 - 3, goal.h - 10 + 4); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(bx + 8, goal.y + goal.h / 2 - 4, (W + 40) / 6 - 19, 8); }
  // דשא: פסים שמתכנסים לנקודת המגוז
  const px = (x, y) => { const k = (y - VY) / (H + 40 - VY); return VX + (x - VX) * k; };
  for (let i = 0; i < 9; i++) { const y0 = GL + (i * (H - GL)) / 9, y1 = GL + ((i + 1) * (H - GL)) / 9; ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a'; ctx.beginPath(); ctx.moveTo(px(-120, y0), y0); ctx.lineTo(px(W + 120, y0), y0); ctx.lineTo(px(W + 120, y1), y1); ctx.lineTo(px(-120, y1), y1); ctx.fill(); }
  const shade = ctx.createLinearGradient(0, GL, 0, H); shade.addColorStop(0, 'rgba(0,0,0,.25)'); shade.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = shade; ctx.fillRect(0, GL, W, H - GL);
  // קווים: קו שער, רחבה, קשת
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, GL + 1); ctx.lineTo(W, GL + 1); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(goal.x - 70, GL), GL); ctx.lineTo(px(goal.x - 70, GL + 120), GL + 120); ctx.lineTo(px(goal.x + goal.w + 70, GL + 120), GL + 120); ctx.lineTo(px(goal.x + goal.w + 70, GL), GL); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(W / 2, GL + 120, 62, 20, 0, 0, Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(W / 2, H - 95, 4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
  // שער עם עומק: רשת אחורית, רשתות צד, קורות
  const d = 22; ctx.fillStyle = 'rgba(15,23,42,.88)'; ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
  const net = (x0, y0, x1, y1, cols, rows) => { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; for (let i = 0; i <= cols; i++) { const k = i / cols; ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * k, y0); const bx = bulge && bulge.t > 0 ? bulge : null; const xx = x0 + (x1 - x0) * k, yy = y1; if (bx) { const dd = Math.hypot(xx - bx.x, (yy + y0) / 2 - bx.y); const off = Math.max(0, 1 - dd / 70) * 14 * bx.t; ctx.quadraticCurveTo(xx + (xx > bx.x ? off : -off), (y0 + y1) / 2 + off, xx, yy); } else ctx.lineTo(xx, yy); ctx.stroke(); } for (let j = 0; j <= rows; j++) { const k = j / rows; ctx.beginPath(); ctx.moveTo(x0, y0 + (y1 - y0) * k); ctx.lineTo(x1, y0 + (y1 - y0) * k); ctx.stroke(); } };
  net(goal.x + d, goal.y + d * .6, goal.x + goal.w - d, goal.y + goal.h, 16, 7);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i <= 6; i++) { const k = i / 6; ctx.beginPath(); ctx.moveTo(goal.x, goal.y + goal.h * k); ctx.lineTo(goal.x + d, goal.y + d * .6 + (goal.h - d * .6) * k); ctx.stroke(); ctx.beginPath(); ctx.moveTo(goal.x + goal.w, goal.y + goal.h * k); ctx.lineTo(goal.x + goal.w - d, goal.y + d * .6 + (goal.h - d * .6) * k); ctx.stroke(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(goal.x, GL); ctx.lineTo(goal.x, goal.y); ctx.lineTo(goal.x + goal.w, goal.y); ctx.lineTo(goal.x + goal.w, GL); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.stroke();
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  return px;
}
function finale(ctx, W, t, t0, oldBest, newBest, F, label) {
  if (t > t0) { const val = Math.round(oldBest + (newBest - oldBest) * ease(clamp((t - t0) / 1.6, 0, 1))); bigText(ctx, 'שיא חדש!', W / 2, 385, 48, '#fff', '#1B1740', 1 + Math.sin(t * 10) * .04); bigText(ctx, String(val), W / 2, 452, 76, '#FDE047', '#7C2D12', val === newBest ? 1 + Math.sin(t * 12) * .08 : 1); }
  if (t > t0 + 1.4 && t < t0 + 1.5 && F.count < 120) { F.burst(80, 240, '#FDE047', 60, 300); F.burst(280, 220, '#22C55E', 60, 300); F.burst(180, 160, '#fff', 60, 320); }
  if (t > t0 + 1.4) bigText(ctx, label, W / 2, 520, 24, '#fff', '#15803D', 1 + Math.sin(t * 8) * .03);
}
// כדור בטיסה: מיקום על הקרקע, גובה, גודל לפי עומק, סיבוב, צל ושובל
function flyingBall(ctx, kind, gx, gy, h, r, rot, trail) {
  groundShadow(ctx, gx, gy, r, h);
  if (trail) trail.forEach((p, i) => { ctx.globalAlpha = (i + 1) / trail.length * .35; (kind === 'soccer' ? soccerBall : basketBall)(ctx, p.x, p.y, p.r * .9, p.rot); ctx.globalAlpha = 1; });
  (kind === 'soccer' ? soccerBall : basketBall)(ctx, gx, gy - h, r, rot);
}

const SCENES = {
  // ---- שער מבעיטה ----
  goal: { dur: 8, setup(W) { const goal = { x: 40, y: 60, w: 280, h: 120 }; const tx = goal.x + (Math.random() < .5 ? rnd(40, 100) : rnd(180, 240)), ty = goal.y + rnd(25, 95); return { goal, tx, ty, gkDir: tx < W / 2 ? 1 : -1, fans: crowdGen(16, W, 2, 18, 20), kit: Math.random() < .5 ? KITS.blue : KITS.green, trail: [], bulge: { x: tx, y: ty, t: 0 } }; },
    sound(S) { S.murmur(0, 1.6); S.tension(0.3, 1.5); S.kick(1.7); S.chant(2.35, 2.4); S.roar(2.3, 4.6); S.horn(2.6, 1.6); S.drums(2.9); S.camera(2.4); S.boom(5.0); },
    draw(ctx, W, H, t, dt, s, F, say) {
      const { goal, tx, ty, gkDir } = s; const GL = goal.y + goal.h; const HIT = 2.3;
      if (t > HIT) s.bulge.t = Math.max(0, 1 - (t - HIT) / .9) * Math.abs(Math.cos((t - HIT) * 14));
      const zoom = t > 1.7 && t < 3.6 ? 1 + .2 * Math.sin(clamp((t - 1.7) / 1.9, 0, 1) * Math.PI) : 1;
      cam(ctx, W / 2, 200, zoom, () => {
        pitch(ctx, W, H, goal, s.fans, t, t > HIT, s.bulge);
        // שוער
        keeper(ctx, t, 1.75, HIT, gkDir, W / 2, GL);
        // שחקן: ריצה בקשת אל הכדור, בעיטה, חגיגה
        const bx0 = W / 2, by0 = H - 95; let px, py, ppose;
        if (t < 1.55) { const k = ease(clamp(t / 1.55, 0, 1)); px = -50 + (bx0 - 34 + 50) * k; py = H - 40 - 40 * k; ppose = poseAt(POSE.run, t * 1000); }
        else if (t < 2.2) { px = bx0 - 34; py = by0 + 12; ppose = POSE.leap; }
        else { px = bx0 - 34 - 90 * ease(clamp((t - 2.2) / .6, 0, 1)) + Math.sin(t * 6) * 6; py = by0 + 12 - Math.abs(Math.sin(t * 6)) * 24; ppose = Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp; }
        player(ctx, ppose, px, py, .78, s.kit);
        // כדור: גדול וקרוב, קטן ורחוק; קשת; סיבוב; שובל
        let gx = bx0, gy = by0, h = 0, r = 22, rot = t * 2;
        if (t >= 1.7) { const k = easeOut(clamp((t - 1.7) / .6, 0, 1)); gx = bx0 + (tx - bx0) * k; gy = by0 + (GL + 6 - by0) * k; h = Math.sin(k * Math.PI) * 70 + (GL + 6 - ty) * k; r = 22 - 14 * k; rot = t * 2 + k * 14; if (k < 1 && s.trail.length < 8) s.trail.push({ x: gx, y: gy - h, r, rot }); }
        if (t > HIT) { gx = tx; gy = GL + 6; h = GL + 6 - ty - Math.min(18, (t - HIT) * 30); r = 8; }
        flyingBall(ctx, 'soccer', gx, gy, h, r, rot, t >= 1.7 && t < HIT + .3 ? s.trail : null);
      });
      if (t > HIT) { if (t < HIT + .05 && F.count < 30) F.burst(tx, ty, '#fff', 40, 200); bigText(ctx, 'GOAL!!!', W / 2, 300, 80 * ease(clamp((t - HIT) / .4, 0, 1)), '#FDE047', '#7C2D12', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('Gooooooooooool!', 'pt-BR'); }
      finale(ctx, W, t, 3.6, s.oldBest, s.newBest, F, 'חיפה חיפה את אלופה');
    } },
  // ---- שער בנגיחה ----
  header: { dur: 8, setup(W) { const goal = { x: 40, y: 60, w: 280, h: 120 }; const tx = goal.x + rnd(50, 230), ty = goal.y + rnd(20, 60); return { goal, tx, ty, gkDir: tx < W / 2 ? 1 : -1, fans: crowdGen(16, W, 2, 18, 20), trail: [], bulge: { x: tx, y: ty, t: 0 } }; },
    sound(S) { S.murmur(0, 1.6); S.kick(0.3); S.tension(0.4, 1.5); S.kick(1.95); S.chant(2.45, 2.4); S.roar(2.4, 4.5); S.horn(2.7, 1.6); S.drums(3.0); S.camera(2.5); },
    draw(ctx, W, H, t, dt, s, F, say) {
      const { goal, tx, ty, gkDir } = s; const GL = goal.y + goal.h; const HIT = 2.4;
      if (t > HIT) s.bulge.t = Math.max(0, 1 - (t - HIT) / .9) * Math.abs(Math.cos((t - HIT) * 14));
      const zoom = t > 1.6 && t < 3.6 ? 1 + .18 * Math.sin(clamp((t - 1.6) / 2, 0, 1) * Math.PI) : 1;
      cam(ctx, W / 2, 200, zoom, () => {
        pitch(ctx, W, H, goal, s.fans, t, t > HIT, s.bulge);
        keeper(ctx, t, 1.9, HIT, gkDir, W / 2, GL);
        // מוסר מהצד (עם בעיטה), נוגח באמצע
        player(ctx, t < .45 ? POSE.leap : POSE.stand, 44, H - 50, .6, KITS.green);
        const hx = W / 2 + 30, hgy = GL + 118; /* קרוב לשער, כמו בקרן */ const jump = t > 1.45 && t < 2.45 ? Math.sin(clamp((t - 1.45) / 1, 0, 1) * Math.PI) * 70 : 0;
        const ppose = t < 1.45 ? POSE.stand : t < 2.45 ? HEADER : (Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp);
        const px = hx + (t > 2.45 ? -70 * ease(clamp((t - 2.45) / .6, 0, 1)) : 0), py = hgy - jump - (t > 2.45 ? Math.abs(Math.sin(t * 6)) * 24 : 0);
        groundShadow(ctx, px, hgy + 2, 20, jump); player(ctx, ppose, px, py, .72, KITS.blue, { shadow: false });
        // הכדור: מסירה גבוהה מהצד לראש, ומהראש לרשת
        const headY = hgy - 70 - (182 - 62) * .72; /* הראש בשיא הקפיצה (70) לפי פוזת הנגיחה */ let gx, gy, h, r = 16, rot = t * 3;
        if (t < 1.95) { const k = ease(clamp((t - .3) / 1.65, 0, 1)); gx = 44 + (hx + 9 - 44) * k; gy = H - 60 + (hgy - (H - 60)) * k; h = Math.sin(k * Math.PI) * 150 + (hgy - headY) * k; r = 18 - 3 * k; if (s.trail.length < 8 && k > .2 && k < 1) s.trail.push({ x: gx, y: gy - h, r, rot }); }
        else { const k = easeOut(clamp((t - 1.95) / .45, 0, 1)); gx = hx + 9 + (tx - hx - 9) * k; gy = hgy + (GL + 6 - hgy) * k; h = (hgy - headY) + ((GL + 6 - ty) - (hgy - headY)) * k; r = 15 - 7 * k; rot = t * 3 + k * 10; }
        if (t > HIT) { gx = tx; gy = GL + 6; h = GL + 6 - ty - Math.min(18, (t - HIT) * 30); r = 8; }
        flyingBall(ctx, 'soccer', gx, gy, h, r, rot, t > 1.95 && t < HIT + .3 ? s.trail.slice(-5) : null);
      });
      if (t > HIT) { if (t < HIT + .05 && F.count < 30) F.burst(tx, ty, '#fff', 40, 200); bigText(ctx, 'GOAL!!!', W / 2, 300, 80 * ease(clamp((t - HIT) / .4, 0, 1)), '#FDE047', '#7C2D12', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); bigText(ctx, 'בראש!', W / 2, 352, 30, '#fff', '#1B1740'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('Gooooooooooool!', 'pt-BR'); }
      finale(ctx, W, t, 3.7, s.oldBest, s.newBest, F, 'חיפה חיפה את אלופה');
    } },
  // ---- אולם כדורסל משותף ----
  dunk: { dur: 8, setup(W) { return { fans: crowdGen(16, W, 2, 18, 20), hoop: { x: 250, y: 190 }, net: 0, shake: 0 }; },
    sound(S) { S.murmur(0, 2); S.bounce(0.3); S.bounce(0.75); S.bounce(1.2); S.tension(1.3, 1); S.rim(2.35); S.boom(2.4); S.chant(2.5, 2.2); S.roar(2.45, 4.5); S.horn(2.7, 1.4, 220); S.drums(3.0, 6); S.camera(2.6); },
    draw(ctx, W, H, t, dt, s, F, say) {
      court(ctx, W, H, s, t, t > 2.35);
      const hp = s.hoop, SC = .85, HIT = 2.35; s.arcGlow = 0;
      const zoom = t > 1.6 && t < 3.6 ? 1 + .16 * Math.sin(clamp((t - 1.6) / 2, 0, 1) * Math.PI) : 1;
      cam(ctx, hp.x - 40, hp.y + 150, zoom, () => {
        hoopBack(ctx, hp, t > HIT ? Math.sin((t - HIT) * 30) * 3 * Math.max(0, 1 - (t - HIT)) : 0);
        // שחקן: כדרור, ניתור עד הטבעת, נוחת, חוגג
        let px, py, pose, bx, by, bh = 0;
        const gy = H - 40;
        const J0 = 1.75, JD = 1.25, startX = hp.x - 170, apexX = hp.x - 22 * SC, apexY = hp.y + (182 - 14) * SC - 44; // היד 44 פיקסלים מעל הטבעת
        const CR = .22; // כריעה לפני הניתור
        if (t < J0 - CR) { const k = ease(clamp(t / (J0 - CR), 0, 1)); px = -40 + (startX + 40) * k; py = gy - Math.abs(Math.sin(t * 14)) * 4; pose = poseAt(POSE.run, t * 1000); const ph = (t * 3.5) % 1; bh = Math.abs(Math.sin(ph * Math.PI)) * 58; bx = px + 30 + Math.sin(ph * Math.PI) * 6; by = gy - 10 - bh; }
        else if (t < J0) { px = startX; py = gy; pose = LAND; bx = px + 34 * SC; by = gy - 62; }
        else if (t < J0 + JD) { const k = clamp((t - J0) / JD, 0, 1); const hang = Math.pow(Math.sin(k * Math.PI), .55); px = startX + (apexX - startX) * Math.min(1, k * 1.5); py = gy - (gy - apexY) * hang; pose = k < .25 ? DUNK : k < .8 ? JORDAN : LAND; bx = px + 24 * SC; by = py + (JORDAN.rh[1] - 182) * SC + 12; if (k > .48) { bx = hp.x; by = hp.y + 6 + (k - .48) * 320; } }
        else { const k = t - J0 - JD; px = apexX - 90 * ease(clamp(k / .6, 0, 1)); py = k < .25 ? gy : gy - Math.abs(Math.sin(t * 6)) * 24; pose = k < .25 ? LAND : Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp; bx = hp.x; by = Math.min(gy - 14, hp.y + 60 + k * 420); }
        if (t < J0 + JD) groundShadow(ctx, px, gy + 2, 22, gy - py);
        // סדר הציור: כדור בתוך הרשת, הרשת והטבעת, השחקן מלפנים, הכדור ביד
        const inNet = t > HIT; if (inNet) { groundShadow(ctx, bx, gy + 2, 13, gy - by); basketBall(ctx, bx, by, 13, t * 5); }
        s.net = t > HIT && t < HIT + .6 ? Math.sin((t - HIT) / .6 * Math.PI) : 0;
        hoopFront(ctx, hp, s.net);
        player(ctx, pose, px, py, SC, KITS.purple, { shadow: t >= J0 + JD });
        if (!inNet) { groundShadow(ctx, bx, gy + 2, 13, gy - by); basketBall(ctx, bx, by, 13, t * 5); }
      });
      if (t > HIT) { if (t < HIT + .05 && F.count < 30) F.burst(hp.x, hp.y, '#F97316', 40, 220); bigText(ctx, 'SLAM DUNK!', W / 2, 300, 60 * ease(clamp((t - HIT) / .4, 0, 1)), '#FDE047', '#4C1D95', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('', 'pt-BR'); }
      finale(ctx, W, t, 3.7, s.oldBest, s.newBest, F, 'אלוף האלופים');
    } },
  // ---- קליעת שלוש ----
  three: { dur: 8, setup(W) { return { fans: crowdGen(16, W, 2, 18, 20), hoop: { x: 262, y: 200 }, net: 0 }; },
    sound(S) { S.murmur(0, 2); S.bounce(0.3); S.bounce(0.7); S.bounce(1.1); S.tension(1.4, 1.2); S.swish(2.75); S.chant(2.85, 2.2); S.roar(2.8, 4.5); S.horn(3.0, 1.4, 262); S.drums(3.3, 6); S.camera(2.9); },
    draw(ctx, W, H, t, dt, s, F, say) {
      court(ctx, W, H, s, t, t > 2.75);
      const hp = s.hoop, HIT = 2.75, gy = H - 40, sx = 62; s.arcGlow = t > 1.4 && t < HIT ? Math.min(1, (t - 1.4) * 2) : t >= HIT ? Math.max(0, 1 - (t - HIT)) : 0;
      const zoom = t > 2.2 && t < 3.8 ? 1 + .14 * Math.sin(clamp((t - 2.2) / 1.6, 0, 1) * Math.PI) : 1;
      cam(ctx, hp.x - 40, hp.y + 150, zoom, () => {
        hoopBack(ctx, hp, 0);
        // קשת השלוש
        let px = sx, py = gy, pose, bx, by;
        if (t < 1.4) { pose = POSE.stand; const bh = Math.abs(Math.sin(t * 8)) * 60; bx = sx + 22; by = gy - 8 - bh; }
        else if (t < 2.1) { const k = clamp((t - 1.4) / .7, 0, 1); py = gy - Math.sin(k * Math.PI) * 60; pose = SHOOT; bx = px + 16 * .8; by = py + (14 - 182) * .8 + 6; }
        else { const k = clamp((t - 2.1) / .4, 0, 1); py = gy - Math.sin(Math.PI * (1 - k)) * 20; pose = t > HIT ? (Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp) : SHOOT; if (t > HIT) py = gy - Math.abs(Math.sin(t * 6)) * 24; bx = null; }
        if (t < 2.5) groundShadow(ctx, px, gy + 2, 22, gy - py);
        player(ctx, pose, px, py, .8, KITS.orange, { shadow: t >= 2.5 });
        // הכדור: מהיד לקשת גבוהה אל הטבעת, סוויש
        const relX = sx + 16 * .8, relY = gy - 60 + (14 - 182) * .8 + 6;
        if (t >= 1.75 && t < HIT) { const k = clamp((t - 1.75) / (HIT - 1.75), 0, 1); const gx = relX + (hp.x - relX) * k; const arcH = Math.sin(k * Math.PI) * 170; const yy = relY + (hp.y - relY) * k - arcH; groundShadow(ctx, gx, gy + 2, 13, gy - yy); basketBall(ctx, gx, yy, 13, t * 6); }
        else if (t >= HIT) { const k = clamp((t - HIT) / .5, 0, 1); basketBall(ctx, hp.x, hp.y + 6 + k * 70, 13 - k * 2, t * 6); }
        else if (bx != null) { groundShadow(ctx, bx, gy + 2, 13, gy - by); basketBall(ctx, bx, by, 13, t * 6); }
        s.net = t > HIT && t < HIT + .6 ? Math.sin((t - HIT) / .6 * Math.PI) * .7 : 0; hoopFront(ctx, hp, s.net);
      });
      if (t > HIT) { if (t < HIT + .05 && F.count < 30) F.burst(hp.x, hp.y, '#fff', 30, 180); bigText(ctx, 'THREE!!!', W / 2, 300, 70 * ease(clamp((t - HIT) / .4, 0, 1)), '#FDE047', '#4C1D95', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); bigText(ctx, 'סוויש!', W / 2, 352, 30, '#fff', '#1B1740'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('', 'pt-BR'); }
      finale(ctx, W, t, 4.0, s.oldBest, s.newBest, F, 'מלך השלשות');
    } },
  // ---- ריצת 100 מטר ----
  sprint: { dur: 8, setup(W) { return { fans: crowdGen(16, W, 2, 18, 20), lanes: [0, 1, 2].map(i => ({ y: 262 + i * 100, kit: [KITS.grey, KITS.orange, KITS.blue][i], speed: [.78, .88, 1][i] })), finished: 0 }; },
    sound(S) { S.gun(0.4); S.steps(0.5, 16, .15); S.murmur(0.5, 2.5); S.tension(1, 1.9); S.camera(2.9); S.chant(3.0, 2.2); S.roar(2.95, 4.3); S.horn(3.1, 1.4, 262); S.drums(3.4, 6); },
    draw(ctx, W, H, t, dt, s, F, say) {
      const sky = ctx.createLinearGradient(0, 0, 0, 280); sky.addColorStop(0, '#0b1026'); sky.addColorStop(1, '#1e293b'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, W, 70); crowd(ctx, s.fans, t, t > 2.95);
      // מסלול עם עומק
      const tg = ctx.createLinearGradient(0, 280, 0, 540); tg.addColorStop(0, '#b91c1c'); tg.addColorStop(1, '#ef4444'); ctx.fillStyle = tg; ctx.fillRect(0, 240, W, 300); for (let i = 0; i <= 3; i++) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(0, 240 + i * 100, W, 3); }
      const FIN = 250; for (let j = 0; j < 15; j++) { ctx.fillStyle = j % 2 ? '#111' : '#fff'; ctx.fillRect(FIN, 240 + j * 20, 14, 20); }
      const run = t > .4; const START = .4, DUR = 2.5;
      s.lanes.forEach((l, i) => { const k = run ? (t - START) / DUR * l.speed : 0; const x = 20 + 230 * Math.pow(clamp(k, 0, 1), .85) + Math.max(0, k - 1) * 200; const crossed = x >= FIN; const hero = i === 2;
        const pose = !run ? POSE.ready : crossed && hero ? (Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp) : k > .85 && !crossed ? LEAN : poseAt(POSE.run, t * 1150 * l.speed);
        const yy = l.y + 92 - (crossed && hero ? Math.abs(Math.sin(t * 6)) * 20 : 0);
        if (x < W + 60) player(ctx, pose, hero && crossed ? Math.min(x, FIN + 60) : x, yy, .5, l.kit); });
      if (t < .4) bigText(ctx, 'למקומות...', W / 2, 150, 34, '#fff', '#1B1740'); else if (t < 2.95) bigText(ctx, `${Math.min(9.58, (t - .4) * 3.75).toFixed(2)}`, W / 2, 150, 54, '#FDE047', '#1B1740', 1, 'Rubik, Arial, sans-serif');
      if (t > 2.9 && t < 3.0) { ctx.fillStyle = `rgba(255,255,255,${(3.0 - t) * 8})`; ctx.fillRect(0, 0, W, H); }
      if (t > 2.95) { if (t < 3.0 && F.count < 30) F.burst(FIN, 480, '#fff', 40, 220); bigText(ctx, 'WINNER!', W / 2, 150, 66 * ease(clamp((t - 2.95) / .4, 0, 1)), '#FDE047', '#1B1740', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); bigText(ctx, '9.58 · מקום ראשון', W / 2, 200, 28, '#fff', '#1B1740'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('', 'pt-BR'); }
      finale(ctx, W, t, 4.1, s.oldBest, s.newBest, F, 'הכי מהיר בעולם');
    } },
};
// השוער: עומד, קופץ לצד (באוויר, בקשת), נוחת ושוכב על הדשא, ואחרי שנייה קם עצוב
function keeper(ctx, t, t0, hit, dir, cx, GL) {
  const DIVE = .55; let pose = GK.ready, x = cx, y = GL - 2, happy = true;
  if (t > t0 && t <= t0 + DIVE) { const k = clamp((t - t0) / DIVE, 0, 1); x = cx + easeOut(k) * dir * 92; y = GL - 2 - Math.sin(k * Math.PI) * 30; pose = dir > 0 ? GK.diveR : GK.diveL; }
  else if (t > t0 + DIVE && t < hit + 1.1) { x = cx + dir * 92; pose = dir > 0 ? GK.lyingR : GK.lyingL; happy = false; }
  else if (t >= hit + 1.1) { x = cx + dir * 92; pose = GK.ready; happy = false; }
  if (t > t0 && t <= t0 + DIVE) groundShadow(ctx, x, GL, 26, GL - 2 - y);
  player(ctx, pose, x, y, .66, KITS.keeper, { happy, shadow: !(t > t0 && t <= t0 + DIVE) });
}
// אולם כדורסל: רצפת פרקט בפרספקטיבה עם קווי מגרש (קו שלוש, הצבע, קו הסיום), קהל
function court(ctx, W, H, s, t, excited) {
  const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0b1026'); sky.addColorStop(1, '#1e1b4b'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, W, 70); crowd(ctx, s.fans, t, excited);
  const FY = H - 130, fg = ctx.createLinearGradient(0, FY, 0, H); fg.addColorStop(0, '#e0a04a'); fg.addColorStop(.5, '#c47f2c'); fg.addColorStop(1, '#8a4b12'); ctx.fillStyle = fg; ctx.fillRect(0, FY, W, H - FY);
  // קרשי פרקט בפרספקטיבה
  ctx.strokeStyle = 'rgba(60,30,0,.22)'; ctx.lineWidth = 1; for (let i = -6; i < 24; i++) { ctx.beginPath(); ctx.moveTo(i * 22 + 40, FY); ctx.lineTo(i * 22 - 30, H); ctx.stroke(); } for (let j = 1; j < 5; j++) { const yy = FY + (H - FY) * j / 5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
  // הצבע (המלבן מתחת לסל) והקו של שלוש הנקודות: כשמסומן s.arcGlow הקו זוהר
  const hx = s.hoop ? s.hoop.x : W - 100; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, FY + 3); ctx.lineTo(W, FY + 3); ctx.stroke();
  ctx.fillStyle = 'rgba(124,58,237,.35)'; ctx.beginPath(); ctx.moveTo(hx - 70, FY + 4); ctx.lineTo(hx + 70, FY + 4); ctx.lineTo(hx + 95, H - 40); ctx.lineTo(hx - 95, H - 40); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(hx, H - 40, 55, 14, 0, 0, Math.PI * 2); ctx.stroke();
  const glow = s.arcGlow || 0; ctx.strokeStyle = glow ? `rgba(253,224,71,${.6 + glow * .4})` : 'rgba(255,255,255,.9)'; ctx.lineWidth = glow ? 5 : 3.5; if (glow) { ctx.shadowColor = '#FDE047'; ctx.shadowBlur = 18 * glow; } ctx.beginPath(); ctx.rect(0, FY + 2, W, H - FY); ctx.clip(); ctx.beginPath(); ctx.ellipse(hx, FY + 2, 225, 118, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, FY, W, 24);
  const spot = ctx.createRadialGradient(W / 2, H - 130, 10, W / 2, H - 130, 300); spot.addColorStop(0, 'rgba(255,255,255,.08)'); spot.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);
}
function hoopBack(ctx, hp, shake) {
  ctx.fillStyle = '#374151'; ctx.fillRect(hp.x + 34, hp.y - 110, 9, 400); ctx.fillStyle = '#4b5563'; ctx.fillRect(hp.x + 34, hp.y - 110, 3, 400);
  const bg = ctx.createLinearGradient(hp.x + 16, 0, hp.x + 34, 0); bg.addColorStop(0, '#f8fafc'); bg.addColorStop(1, '#cbd5e1'); ctx.fillStyle = bg; ctx.fillRect(hp.x + 16 + shake, hp.y - 78, 18, 84); ctx.strokeStyle = '#374151'; ctx.lineWidth = 2; ctx.strokeRect(hp.x + 16 + shake, hp.y - 78, 18, 84); ctx.strokeStyle = '#ef4444'; ctx.strokeRect(hp.x + 20 + shake, hp.y - 30, 10, 26);
  // הצד האחורי של הטבעת (אליפסה)
  ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(hp.x, hp.y, 30, 9, 0, Math.PI, Math.PI * 2); ctx.stroke();
}
function hoopFront(ctx, hp, stretch) {
  // רשת: חוטים מעוקלים שנמשכים למטה כשהכדור עובר
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; const len = 34 + stretch * 26;
  for (let i = -4; i <= 4; i++) { const x0 = hp.x + i * 7.2, x1 = hp.x + i * 4.2; ctx.beginPath(); ctx.moveTo(x0, hp.y + (i % 2 ? 4 : 8)); ctx.quadraticCurveTo(x0 + (x1 - x0) * .5 + (i > 0 ? 3 : -3) * stretch, hp.y + len * .55, x1 + (i > 0 ? 3 : -3) * stretch, hp.y + len); ctx.stroke(); }
  for (let j = 1; j <= 3; j++) { const k = j / 3, yy = hp.y + 8 + (len - 8) * k, w = 30 - 12 * k + stretch * 6 * (1 - k); ctx.beginPath(); ctx.ellipse(hp.x, yy, w, 3 + k * 2, 0, 0, Math.PI); ctx.stroke(); }
  // הטבעת מלפנים
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(hp.x, hp.y, 30, 9, 0, 0, Math.PI); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(hp.x, hp.y - 1, 30, 8, 0, 0, Math.PI); ctx.stroke();
}

/** חגיגה על קנבס. scene: אחד מ-SCENE_IDS או אקראי. onText(text, lang) לקריין. מחזיר פונקציית עצירה. */
export function celebrate(canvas, { oldBest = 0, newBest = 1, sound = true, onText = null, onDone = null, scene = null } = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const id = SCENE_IDS.includes(scene) ? scene : SCENE_IDS[Math.floor(Math.random() * SCENE_IDS.length)];
  const sc = SCENES[id], S = makeAudio(sound), F = fx(ctx, W, H), s = { ...sc.setup(W, H), oldBest, newBest };
  let said = false; let shout = null; try { shout = localStorage.getItem('kidfit.goalShout'); } catch { shout = null; }
  // קריין: אם הוקלטה צעקת גול בהגדרות, משמיעים אותה. אחרת "גוווול" בסגנון שדרן ברזילאי (קול פורטוגזי, איטי, גבוה).
  const say = (txt, lang) => { if (said) return; said = true; if (shout && sound) { try { const a = new Audio(shout); a.play(); return; } catch { /* */ } } if (txt) onText && onText(txt, lang); };
  sc.sound(S);
  const started = performance.now(); let raf = 0, last = started;
  function frame(now) { const t = (now - started) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now; sc.draw(ctx, W, H, t, dt, s, F, say); F.draw(dt); if (t < sc.dur) raf = requestAnimationFrame(frame); else onDone && onDone(); }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
export const celebrateGoal = celebrate;
/** פריים בודד של סצנה (התמונה שנחשפת בטטריס). */
export function renderStill(canvas, scene = 'goal', t = 2.6) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const sc = SCENES[SCENE_IDS.includes(scene) ? scene : 'goal'];
  const s = { ...sc.setup(W, H), oldBest: 0, newBest: 0 };
  const F = { burst() {}, confetti() {}, flash() {}, draw() {}, count: 999 };
  for (let tt = Math.max(0, t - 1); tt <= t; tt += .1) sc.draw(ctx, W, H, tt, .1, s, F, () => {}); // מריצים את השנייה האחרונה כדי שהשובל והרשת יהיו במקום (מהיר גם בטלפון)
}
export const STILL_T = { goal: 2.6, header: 2.7, dunk: 2.4, three: 2.85, sprint: 3.4 };

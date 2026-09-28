// חגיגת שיא חדש: כמה סימולציות שונות (שער מבעיטה, שער מנגיחה, סלאם דאנק, ניצחון בריצת 100 מטר), אחת אקראית בכל פעם.
// דמויות מלאות, קהל של אנשים, שאגת קהל, קריין "GOAL!!!", המספר מטפס לשיא החדש, קונפטי וזיקוקים. בלי צפצופים.
import { POSE, GK, KITS, player, crowd, crowdGen } from './sprites.js';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const SCENE_IDS = ['goal', 'header', 'dunk', 'sprint'];

// ---- סאונד: קהל, בעיטה, צופר, תופים, פנפרה רכה ----
function makeAudio(enabled) {
  let ac = null; const A = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  const osc = (f, at, dur, { type = 'triangle', vol = .12, slide = 0, vib = 0 } = {}) => { if (!enabled) return; try { const c = A(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + at); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), c.currentTime + at + dur); if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(c.currentTime + at); l.stop(c.currentTime + at + dur); } o.connect(g); g.connect(c.destination); const t = c.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .04); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.start(t); o.stop(t + dur + .05); } catch { /* */ } };
  const noise = (at, dur, { vol = .3, lp = 1000, hp = 100, attack = .02 } = {}) => { if (!enabled) return; try { const c = A(), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const g = c.createGain(); s.connect(f); f.connect(h); h.connect(g); g.connect(c.destination); const t = c.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.start(t); s.stop(t + dur + .05); } catch { /* */ } };
  return {
    kick: at => { noise(at, .12, { vol: .4, lp: 500, hp: 80 }); osc(90, at, .15, { type: 'sine', vol: .3, slide: -50 }); },
    swish: at => noise(at, .25, { vol: .25, lp: 3000, hp: 800 }),
    tension: (at, dur) => noise(at, dur, { vol: .14, lp: 900, hp: 300, attack: dur * .9 }),
    murmur: (at, dur) => noise(at, dur, { vol: .1, lp: 800, hp: 250, attack: .3 }),
    roar: (at, dur) => { noise(at, dur, { vol: .55, lp: 1400, hp: 200, attack: .15 }); for (let i = 0; i < 18; i++) osc(250 + Math.random() * 600, at + Math.random() * dur * .7, .3, { type: 'sawtooth', vol: .02, slide: -120 }); },
    horn: (at, dur = 1.4, f = 196) => { for (const m of [1, 1.5, 2]) osc(f * m, at, dur, { type: 'sawtooth', vol: .045, vib: 3 }); },
    drums: (at, n = 8) => { for (let i = 0; i < n; i++) { const t = at + i * .22; noise(t, .1, { vol: .28, lp: i % 2 ? 3000 : 200, hp: i % 2 ? 900 : 30 }); if (!(i % 2)) osc(110, t, .18, { type: 'sine', vol: .32, slide: -70 }); } },
    fanfare: at => { [392, 523, 659, 784].forEach((f, i) => osc(f, at + i * .1, .6, { type: 'triangle', vol: .09 })); osc(784, at + .5, 1.3, { type: 'triangle', vol: .1, vib: 3 }); osc(523, at + .5, 1.3, { type: 'triangle', vol: .06 }); },
    boom: at => noise(at, 1, { vol: .5, lp: 500, hp: 40 }),
    gun: at => { noise(at, .15, { vol: .6, lp: 900, hp: 100 }); },
    steps: (at, n, gap) => { for (let i = 0; i < n; i++) noise(at + i * gap, .06, { vol: .12, lp: 600, hp: 150 }); },
  };
}

// ---- ציור משותף ----
function bigText(ctx, txt, x, y, size, fill, stroke = '#1B1740', scale = 1, font = 'Heebo, Rubik, sans-serif') { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.font = `900 ${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = /[A-Za-z]/.test(txt) && !/[\u0590-\u05FF]/.test(txt) ? 'ltr' : 'rtl'; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = size / 8; ctx.strokeText(txt, 0, 0); ctx.fillStyle = fill; ctx.fillText(txt, 0, 0); ctx.restore(); }
function soccer(ctx, x, y, rad) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rad * .55, y + Math.sin(a) * rad * .55, rad * .22, 0, 7); ctx.fill(); } ctx.beginPath(); ctx.arc(x, y, rad * .2, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.stroke(); }
function bball(ctx, x, y, rad) { ctx.fillStyle = '#F97316'; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.strokeStyle = '#7C2D12'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - rad, y); ctx.lineTo(x + rad, y); ctx.moveTo(x, y - rad); ctx.lineTo(x, y + rad); ctx.stroke(); }
function poseAt(frames, ms) { const total = frames.reduce((s, f) => s + f[1], 0); let t = ms % total; for (let i = 0; i < frames.length; i++) { const [p, d] = frames[i]; if (t < d) { const q = frames[(i + 1) % frames.length][0], k = t / d, e = k * k * (3 - 2 * k), o = {}; for (const j in p) if (Array.isArray(p[j])) o[j] = [p[j][0] + (q[j][0] - p[j][0]) * e, p[j][1] + (q[j][1] - p[j][1]) * e]; return o; } t -= d; } return frames[0][0]; }
const HEADER = { head: [112, 62], neck: [104, 78], hip: [96, 120], le: [88, 100], lh: [76, 84], re: [116, 98], rh: [126, 80], lk: [96, 150], lf: [92, 176], rk: [106, 148], rf: [112, 174] };
const DUNK = { head: [104, 30], neck: [102, 46], hip: [100, 92], le: [92, 62], lh: [86, 84], re: [112, 36], rh: [120, 14], lk: [90, 116], lf: [80, 136], rk: [112, 114], rf: [118, 136] };

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

// שדה + שער + קהל (משותף לשער מבעיטה ומנגיחה)
function pitch(ctx, W, H, goal, fans, t, excited, ripple) {
  ctx.fillStyle = '#0B1026'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1F2937'; ctx.fillRect(0, 0, W, goal.y + 10); crowd(ctx, fans, t, excited);
  ctx.fillStyle = '#15803D'; ctx.fillRect(0, goal.y + goal.h, W, H); for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#16A34A' : '#15803D'; ctx.fillRect(0, goal.y + goal.h + i * 48, W, 48); }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, goal.y + goal.h, W, 4); ctx.beginPath(); ctx.arc(W / 2, H - 100, 60, Math.PI, 0); ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1; for (let i = 0; i <= goal.w; i += 14) { ctx.beginPath(); ctx.moveTo(goal.x + i, goal.y); ctx.lineTo(goal.x + i + ripple, goal.y + goal.h); ctx.stroke(); } for (let j = 0; j <= goal.h; j += 14) { ctx.beginPath(); ctx.moveTo(goal.x, goal.y + j); ctx.lineTo(goal.x + goal.w, goal.y + j + ripple); ctx.stroke(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(goal.x, goal.y + goal.h); ctx.lineTo(goal.x, goal.y); ctx.lineTo(goal.x + goal.w, goal.y); ctx.lineTo(goal.x + goal.w, goal.y + goal.h); ctx.stroke();
}
function finale(ctx, W, t, t0, oldBest, newBest, F, label) {
  if (t > t0) { const val = Math.round(oldBest + (newBest - oldBest) * ease(clamp((t - t0) / 1.6, 0, 1))); bigText(ctx, 'שיא חדש!', W / 2, 385, 48, '#fff', '#1B1740', 1 + Math.sin(t * 10) * .04); bigText(ctx, String(val), W / 2, 452, 72, '#FDE047', '#7C2D12', val === newBest ? 1 + Math.sin(t * 12) * .08 : 1); }
  if (t > t0 + 1.4 && t < t0 + 1.5 && F.count < 120) { F.burst(80, 240, '#FDE047', 60, 300); F.burst(280, 220, '#22C55E', 60, 300); F.burst(180, 160, '#fff', 60, 320); }
  if (t > t0 + 1.4) bigText(ctx, label, W / 2, 520, 24, '#fff', '#15803D', 1 + Math.sin(t * 8) * .03);
}

const SCENES = {
  // ---- שער מבעיטה ----
  goal: { dur: 7.5, setup(W) { const goal = { x: 40, y: 60, w: 280, h: 120 }; const tx = goal.x + (Math.random() < .5 ? rnd(30, 90) : rnd(190, 250)), ty = goal.y + rnd(20, 90); return { goal, tx, ty, gkDir: tx < W / 2 ? 1 : -1, fans: crowdGen(16, W, 2, 18, 20), kick: Math.random() < .5 ? KITS.blue : KITS.green }; },
    sound(S) { S.murmur(0, 1.5); S.tension(0.2, 1.6); S.kick(1.55); S.roar(1.95, 4.5); S.horn(2.1, 1.6); S.drums(2.4); S.fanfare(4.6); S.boom(4.6); },
    draw(ctx, W, H, t, dt, s, F, say) {
      const { goal, tx, ty, gkDir } = s; const ripple = t > 1.95 && t < 3 ? Math.sin((t - 1.95) * 30) * 4 * (1 - (t - 1.95)) : 0;
      pitch(ctx, W, H, goal, s.fans, t, t > 1.95, ripple);
      const gkX = W / 2 + (t > 1.5 ? ease(clamp((t - 1.5) / .5, 0, 1)) * gkDir * 90 : 0);
      player(ctx, t > 1.5 ? (gkDir > 0 ? GK.diveR : GK.diveL) : GK.ready, gkX, goal.y + goal.h - 2, .62, KITS.keeper, { happy: t < 1.95 });
      const bx0 = W / 2, by0 = H - 100; let px, ppose;
      if (t < 1.4) { px = -40 + (bx0 - 30 + 40) * ease(clamp(t / 1.4, 0, 1)); ppose = poseAt(POSE.run, t * 1000); }
      else if (t < 2.0) { px = bx0 - 30; ppose = POSE.leap; }
      else { px = bx0 - 30 - 80 * ease(clamp((t - 2) / .6, 0, 1)) + Math.sin(t * 6) * 6; ppose = Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp; }
      player(ctx, ppose, px, by0 + 20 - (t >= 2 ? Math.abs(Math.sin(t * 6)) * 24 : 0), .6, s.kick);
      let bx = bx0, by = by0, br = 14; if (t >= 1.55) { const k = ease(clamp((t - 1.55) / .4, 0, 1)); bx = bx0 + (tx - bx0) * k; by = by0 + (ty - by0) * k - Math.sin(k * Math.PI) * 60; br = 14 - 7 * k; }
      if (t > 1.6 && t < 1.95) { ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx, by); ctx.stroke(); }
      soccer(ctx, bx, by, br);
      if (t > 1.95) { if (t < 2.0 && F.count < 30) F.burst(tx, ty, '#fff', 40, 200); bigText(ctx, 'GOAL!!!', W / 2, 300, 74 * ease(clamp((t - 1.95) / .4, 0, 1)), '#FDE047', '#7C2D12', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); }
      if (t > 1.95) say('Goooooal!', 'en-US');
      finale(ctx, W, t, 3.2, s.oldBest, s.newBest, F, 'חיפה חיפה את אלופה');
    } },
  // ---- שער מנגיחה ----
  header: { dur: 7.5, setup(W) { const goal = { x: 40, y: 60, w: 280, h: 120 }; const tx = goal.x + rnd(40, 240), ty = goal.y + rnd(15, 60); return { goal, tx, ty, gkDir: tx < W / 2 ? 1 : -1, fans: crowdGen(16, W, 2, 18, 20) }; },
    sound(S) { S.murmur(0, 1.5); S.kick(0.3); S.tension(0.4, 1.4); S.kick(1.75); S.roar(2.0, 4.5); S.horn(2.2, 1.6); S.drums(2.5); S.fanfare(4.7); S.boom(4.7); },
    draw(ctx, W, H, t, dt, s, F, say) {
      const { goal, tx, ty, gkDir } = s; const ripple = t > 2 && t < 3 ? Math.sin((t - 2) * 30) * 4 * (1 - (t - 2)) : 0;
      pitch(ctx, W, H, goal, s.fans, t, t > 2, ripple);
      const gkX = W / 2 + (t > 1.7 ? ease(clamp((t - 1.7) / .5, 0, 1)) * gkDir * 90 : 0);
      player(ctx, t > 1.7 ? (gkDir > 0 ? GK.diveR : GK.diveL) : GK.ready, gkX, goal.y + goal.h - 2, .62, KITS.keeper, { happy: t < 2 });
      // מוסר מהצד, נוגח באמצע
      player(ctx, t < .4 ? POSE.leap : POSE.stand, 40, H - 60, .5, KITS.green, { flip: false });
      const hx = W / 2 + 30, hy = H - 150; const jump = t > 1.3 && t < 2.3 ? Math.sin(clamp((t - 1.3) / 1, 0, 1) * Math.PI) * 60 : 0;
      let ppose = t < 1.3 ? POSE.stand : t < 2.3 ? HEADER : (Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp);
      player(ctx, ppose, hx + (t > 2.3 ? -60 * ease(clamp((t - 2.3) / .6, 0, 1)) : 0), hy + 30 - jump - (t > 2.3 ? Math.abs(Math.sin(t * 6)) * 24 : 0), .6, KITS.blue);
      // הכדור: מהמוסר (גבוה) לראש, ומהראש לרשת
      let bx, by, br = 13; if (t < 1.75) { const k = ease(clamp((t - .3) / 1.45, 0, 1)); bx = 40 + (hx + 6 - 40) * k; by = H - 120 + ((hy - 72 - 60) - (H - 120)) * k - Math.sin(k * Math.PI) * 120; }
      else { const k = ease(clamp((t - 1.75) / .3, 0, 1)); bx = hx + 6 + (tx - hx - 6) * k; by = (hy - 132) + (ty - (hy - 132)) * k; br = 13 - 6 * k; }
      soccer(ctx, bx, by, br);
      if (t > 2) { if (t < 2.05 && F.count < 30) F.burst(tx, ty, '#fff', 40, 200); bigText(ctx, 'GOAL!!!', W / 2, 300, 74 * ease(clamp((t - 2) / .4, 0, 1)), '#FDE047', '#7C2D12', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); bigText(ctx, 'בראש!', W / 2, 350, 30, '#fff', '#1B1740'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('Goooooal! What a header!', 'en-US'); }
      finale(ctx, W, t, 3.4, s.oldBest, s.newBest, F, 'חיפה חיפה את אלופה');
    } },
  // ---- סלאם דאנק ----
  dunk: { dur: 7.5, setup(W) { return { fans: crowdGen(16, W, 2, 18, 20), hoop: { x: 262, y: 150 } }; },
    sound(S) { S.murmur(0, 2); S.steps(0.2, 6, .22); S.tension(1.2, .8); S.boom(2.2); S.roar(2.25, 4.5); S.horn(2.4, 1.4, 220); S.drums(2.7, 6); S.fanfare(4.8); },
    draw(ctx, W, H, t, dt, s, F, say) {
      ctx.fillStyle = '#0B1026'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#1F2937'; ctx.fillRect(0, 0, W, 70); crowd(ctx, s.fans, t, t > 2.2);
      ctx.fillStyle = '#B45309'; ctx.fillRect(0, H - 80, W, 80); for (let i = 0; i < 12; i++) ctx.fillRect(i * 30, H - 80, 2, 80); ctx.fillStyle = '#D97706'; ctx.fillRect(0, H - 80, W, 6);
      const hp = s.hoop; ctx.fillStyle = '#374151'; ctx.fillRect(hp.x + 30, hp.y - 90, 8, H - 80 - (hp.y - 90)); ctx.fillStyle = '#F1F5F9'; ctx.fillRect(hp.x + 14, hp.y - 70, 18, 60); ctx.strokeStyle = '#374151'; ctx.strokeRect(hp.x + 14, hp.y - 70, 18, 60);
      const shake = t > 2.2 && t < 3 ? Math.sin((t - 2.2) * 40) * 3 * (1 - (t - 2.2)) : 0;
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hp.x - 28, hp.y + shake); ctx.lineTo(hp.x + 28, hp.y + shake); ctx.stroke(); ctx.strokeStyle = '#ffffffAA'; ctx.lineWidth = 1.5; for (let i = -20; i <= 20; i += 10) { ctx.beginPath(); ctx.moveTo(hp.x + i, hp.y + shake); ctx.lineTo(hp.x + i * .6, hp.y + 32 + shake * 2); ctx.stroke(); }
      // השחקן: רץ, קופץ, מטביע, נוחת וחוגג
      let px, py, pose, bx, by;
      if (t < 1.5) { const k = ease(clamp(t / 1.5, 0, 1)); px = -30 + (hp.x - 90 + 30) * k; py = H - 80; pose = poseAt(POSE.run, t * 1000); bx = px + 20; by = H - 110 - Math.abs(Math.sin(t * 12)) * 40; }
      else if (t < 2.4) { const k = clamp((t - 1.5) / .9, 0, 1); px = hp.x - 90 + 70 * k; py = H - 80 - Math.sin(k * Math.PI) * 190; pose = DUNK; bx = px + 20 * .6 + 10; by = py - 168 * .6 + 14; if (k > .78) { bx = hp.x; by = hp.y + (k - .78) * 300; } }
      else { px = hp.x - 40 - 70 * ease(clamp((t - 2.4) / .6, 0, 1)); py = H - 80 - Math.abs(Math.sin(t * 6)) * 24; pose = Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp; bx = hp.x; by = Math.min(H - 92, hp.y + 40 + (t - 2.4) * 400); }
      player(ctx, pose, px, py, .62, KITS.purple);
      bball(ctx, bx, by, 13);
      if (t > 2.2) { if (t < 2.25 && F.count < 30) F.burst(hp.x, hp.y, '#F97316', 40, 220); bigText(ctx, 'SLAM DUNK!', W / 2, 300, 56 * ease(clamp((t - 2.2) / .4, 0, 1)), '#FDE047', '#4C1D95', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('Slam dunk! Unbelievable!', 'en-US'); }
      finale(ctx, W, t, 3.6, s.oldBest, s.newBest, F, 'אלוף האלופים');
    } },
  // ---- ריצת 100 מטר ----
  sprint: { dur: 7.5, setup(W) { return { fans: crowdGen(16, W, 2, 18, 20), lanes: [0, 1, 2].map(i => ({ y: 330 + i * 70, kit: [KITS.grey, KITS.orange, KITS.blue][i], speed: [.86, .92, 1][i] })) }; },
    sound(S) { S.gun(0.4); S.steps(0.5, 14, .16); S.murmur(0.5, 2.5); S.tension(1, 1.6); S.roar(2.9, 4.2); S.horn(3, 1.4, 262); S.drums(3.3, 6); S.fanfare(5.2); },
    draw(ctx, W, H, t, dt, s, F, say) {
      ctx.fillStyle = '#0B1026'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#1F2937'; ctx.fillRect(0, 0, W, 70); crowd(ctx, s.fans, t, t > 2.9);
      ctx.fillStyle = '#B91C1C'; ctx.fillRect(0, 280, W, 250); for (let i = 0; i <= 3; i++) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 280 + i * 70 + 60, W, 3); }
      // קו הסיום
      for (let j = 0; j < 12; j++) { ctx.fillStyle = j % 2 ? '#111' : '#fff'; ctx.fillRect(282, 280 + j * 21, 14, 21); }
      const run = t > .4;
      s.lanes.forEach((l, i) => { const k = run ? clamp((t - .4) / 2.5 * l.speed, 0, 1) : 0; const x = 20 + 260 * ease(k); const won = i === 2 && k >= 1; player(ctx, won ? (Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp) : run && k < 1 ? poseAt(POSE.run, t * 1100 * l.speed) : POSE.ready, x, l.y + 45 - (won ? Math.abs(Math.sin(t * 6)) * 20 : 0), .5, l.kit); });
      if (t < .4) bigText(ctx, 'למקומות...', W / 2, 200, 34, '#fff', '#1B1740'); else if (t < 2.9) bigText(ctx, `${Math.min(9.58, (t - .4) * 3.6).toFixed(2)}`, W / 2, 200, 54, '#FDE047', '#1B1740', 1, 'Rubik, Arial, sans-serif');
      if (t > 2.9) { if (t < 2.95 && F.count < 30) F.burst(290, 480, '#fff', 40, 220); bigText(ctx, 'WINNER!', W / 2, 200, 66 * ease(clamp((t - 2.9) / .4, 0, 1)), '#FDE047', '#1B1740', 1 + Math.sin(t * 10) * .05, 'Heebo, Arial Black, sans-serif'); bigText(ctx, 'מקום ראשון! 🥇', W / 2, 250, 30, '#fff', '#1B1740'); if (Math.random() < .6) F.confetti(3); if (Math.random() < .08) F.flash(); say('And the winner is... you!', 'en-US'); }
      finale(ctx, W, t, 4.0, s.oldBest, s.newBest, F, 'הכי מהיר בעולם');
    } },
};

/** חגיגה על קנבס. scene: 'goal' | 'header' | 'dunk' | 'sprint' | undefined (אקראי). onText(text, lang) לקריין. מחזיר פונקציית עצירה. */
export function celebrate(canvas, { oldBest = 0, newBest = 1, sound = true, onText = null, onDone = null, scene = null } = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const id = SCENE_IDS.includes(scene) ? scene : SCENE_IDS[Math.floor(Math.random() * SCENE_IDS.length)];
  const sc = SCENES[id], S = makeAudio(sound), F = fx(ctx, W, H), s = { ...sc.setup(W, H), oldBest, newBest };
  let said = false; const say = (txt, lang) => { if (said) return; said = true; onText && onText(txt, lang); };
  sc.sound(S);
  const started = performance.now(); let raf = 0, last = started;
  function frame(now) { const t = (now - started) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now; sc.draw(ctx, W, H, t, dt, s, F, say); F.draw(dt); if (t < sc.dur) raf = requestAnimationFrame(frame); else onDone && onDone(); }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
export const celebrateGoal = celebrate;

/** מצייר פריים בודד של סצנה (למשל רגע השער) על קנבס, בלי סאונד ובלי קריין. משמש את התמונה הנחשפת בטטריס. */
export function renderStill(canvas, scene = 'goal', t = 2.3) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const sc = SCENES[SCENE_IDS.includes(scene) ? scene : 'goal'];
  const s = { ...sc.setup(W, H), oldBest: 0, newBest: 0 };
  const F = { burst() {}, confetti() {}, flash() {}, draw() {}, count: 999 };
  sc.draw(ctx, W, H, t, 1 / 60, s, F, () => {});
}
export const STILL_T = { goal: 2.3, header: 2.35, dunk: 2.1, sprint: 3.3 };

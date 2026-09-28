// חגיגת שיא חדש: סימולציה של שער. שחקן רץ ובועט, השוער קופץ לצד הלא נכון, הכדור ברשת, שאגת קהל, "גוווול!", המספר מטפס לשיא החדש, זיקוקים.
// עצמאי: מקבל קנבס ומצייר עליו כ-7 שניות. משמש גם את מנוע המשחקים וגם את דף ההדגמה.
import { POSE, GK } from './sprites.js';

const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---- סאונד: קהל, שריקה, צופר, תופים, פנפרה ----
function makeAudio(enabled) {
  let ac = null; const A = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  const osc = (f, at, dur, { type = 'square', vol = .15, slide = 0, vib = 0 } = {}) => { if (!enabled) return; try { const c = A(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + at); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), c.currentTime + at + dur); if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 6; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(c.currentTime + at); l.stop(c.currentTime + at + dur); } o.connect(g); g.connect(c.destination); const t = c.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.start(t); o.stop(t + dur + .05); } catch { /* */ } };
  const noise = (at, dur, { vol = .3, lp = 1000, hp = 100, attack = .02 } = {}) => { if (!enabled) return; try { const c = A(), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const g = c.createGain(); s.connect(f); f.connect(h); h.connect(g); g.connect(c.destination); const t = c.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.start(t); s.stop(t + dur + .05); } catch { /* */ } };
  return {
    whistle: at => { osc(2800, at, .3, { type: 'sine', vol: .1, vib: 60 }); },
    kick: at => { noise(at, .12, { vol: .4, lp: 500, hp: 80 }); osc(90, at, .15, { type: 'sine', vol: .3, slide: -50 }); },
    tension: (at, dur) => noise(at, dur, { vol: .12, lp: 900, hp: 300, attack: dur * .9 }),
    roar: (at, dur) => { noise(at, dur, { vol: .5, lp: 1400, hp: 200, attack: .15 }); for (let i = 0; i < 16; i++) osc(250 + Math.random() * 600, at + Math.random() * dur * .7, .3, { type: 'sawtooth', vol: .02, slide: -120 }); },
    horn: (at, dur = 1.4, f = 196) => { for (const m of [1, 1.5, 2]) osc(f * m, at, dur, { type: 'sawtooth', vol: .07, vib: 3 }); },
    drums: at => { for (let i = 0; i < 8; i++) { const t = at + i * .22; noise(t, .1, { vol: .3, lp: i % 2 ? 3000 : 200, hp: i % 2 ? 900 : 30 }); if (!(i % 2)) osc(110, t, .18, { type: 'sine', vol: .35, slide: -70 }); } },
    fanfare: at => { [523, 659, 784, 1047].forEach((f, i) => osc(f, at + i * .09, .5, { type: 'square', vol: .08 })); osc(1047, at + .5, 1.2, { type: 'square', vol: .1, vib: 4 }); osc(784, at + .5, 1.2, { type: 'square', vol: .06 }); },
    boom: at => { noise(at, 1, { vol: .5, lp: 500, hp: 40 }); },
  };
}

// ---- ציור ----
function stick(ctx, pose, x, y, scale, { color = '#1E1B3A', far = '#7B7797', head = '#FFB84D', width = 5, flip = false } = {}) {
  const px = ([a, b]) => [x + (flip ? -(a - 100) : (a - 100)) * scale, y + (b - 182) * scale];
  const seg = (pts, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * scale * 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.map(px).forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke(); };
  seg([pose.neck, pose.le, pose.lh], far, width); seg([pose.hip, pose.lk, pose.lf], far, width); seg([pose.neck, pose.hip], color, width); seg([pose.neck, pose.re, pose.rh], color, width); seg([pose.hip, pose.rk, pose.rf], color, width);
  const [hx, hy] = px(pose.head); ctx.fillStyle = head; ctx.beginPath(); ctx.arc(hx, hy, 11 * scale, 0, 7); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2 * scale; ctx.stroke();
}
function bigText(ctx, txt, x, y, size, fill, stroke = '#1B1740', scale = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.font = `900 ${size}px Heebo, Rubik, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = size / 8; ctx.strokeText(txt, 0, 0); ctx.fillStyle = fill; ctx.fillText(txt, 0, 0); ctx.restore(); }
function soccer(ctx, x, y, rad) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rad * .55, y + Math.sin(a) * rad * .55, rad * .22, 0, 7); ctx.fill(); } ctx.beginPath(); ctx.arc(x, y, rad * .2, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.stroke(); }
function poseAt(frames, ms) { const total = frames.reduce((s, f) => s + f[1], 0); let t = ms % total; for (let i = 0; i < frames.length; i++) { const [p, d] = frames[i]; if (t < d) { const q = frames[(i + 1) % frames.length][0], k = t / d, e = k * k * (3 - 2 * k), o = {}; for (const j in p) if (Array.isArray(p[j])) o[j] = [p[j][0] + (q[j][0] - p[j][0]) * e, p[j][1] + (q[j][1] - p[j][1]) * e]; return o; } t -= d; } return frames[0][0]; }

/** מריץ את חגיגת השער על קנבס. מחזיר פונקציית עצירה. onText(txt) לקריין (אופציונלי). */
export function celebrateGoal(canvas, { oldBest = 0, newBest = 1, sound = true, onText = null, onDone = null, duration = 7.5 } = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const S = makeAudio(sound);
  const goal = { x: 40, y: 60, w: 280, h: 120 };
  // המקום של השער ברשת: אקראי, לא באמצע
  const tx = goal.x + (Math.random() < .5 ? rnd(30, 90) : rnd(190, 250)), ty = goal.y + rnd(20, 90);
  const gkDir = tx < W / 2 ? 1 : -1; // קופץ לצד הלא נכון
  let parts = [], confetti = [], flashes = [], started = performance.now(), raf = 0, spoke = false;
  const colors = ['#22C55E', '#FDE047', '#fff', '#F472B6', '#60A5FA'];
  const burst = (x, y, color, n = 50, sp = 260) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 1 + Math.random() * .8, r: 2 + Math.random() * 3, trail: [] }); } };
  // סאונד לפי ציר הזמן
  S.whistle(0); S.tension(0.2, 1.6); S.kick(1.55); S.roar(1.95, 4.5); S.horn(2.1, 1.6); S.drums(2.4); S.fanfare(4.6); S.boom(4.6);
  function frame(now) {
    const t = (now - started) / 1000, dt = 1 / 60;
    // רקע: מגרש, יציע
    ctx.fillStyle = '#0B1026'; ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 18; i++) { const jump = t > 1.95 && Math.sin(t * 9 + i + r) > 0 ? 8 : 0; ctx.fillStyle = ['#F472B6', '#60A5FA', '#FBBF24', '#34D399', '#fff'][(i + r) % 5]; ctx.beginPath(); ctx.arc(10 + i * 20, 22 + r * 18 - jump, 6, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#15803D'; ctx.fillRect(0, goal.y + goal.h, W, H); for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#16A34A' : '#15803D'; ctx.fillRect(0, goal.y + goal.h + i * 48, W, 48); }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, goal.y + goal.h, W, 4); ctx.beginPath(); ctx.arc(W / 2, H - 100, 60, Math.PI, 0); ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 3; ctx.stroke();
    // רשת עם רעד אחרי השער
    const ripple = t > 1.95 && t < 3 ? Math.sin((t - 1.95) * 30) * 4 * (1 - (t - 1.95)) : 0;
    ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1; for (let i = 0; i <= goal.w; i += 14) { ctx.beginPath(); ctx.moveTo(goal.x + i, goal.y); ctx.lineTo(goal.x + i + ripple, goal.y + goal.h); ctx.stroke(); } for (let j = 0; j <= goal.h; j += 14) { ctx.beginPath(); ctx.moveTo(goal.x, goal.y + j); ctx.lineTo(goal.x + goal.w, goal.y + j + ripple); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(goal.x, goal.y + goal.h); ctx.lineTo(goal.x, goal.y); ctx.lineTo(goal.x + goal.w, goal.y); ctx.lineTo(goal.x + goal.w, goal.y + goal.h); ctx.stroke();
    // שוער: עומד, ואז קופץ לצד הלא נכון
    const gkX = W / 2 + (t > 1.5 ? ease(clamp((t - 1.5) / .5, 0, 1)) * gkDir * 90 : 0);
    stick(ctx, t > 1.5 ? (gkDir > 0 ? GK.diveR : GK.diveL) : GK.ready, gkX, goal.y + goal.h - 2, .62, { color: '#FACC15', far: '#CA8A04', head: '#FDE68A', width: 6 });
    // שחקן: רץ מהצד לכדור, בועט, חוגג
    const bx0 = W / 2, by0 = H - 100;
    let px, ppose;
    if (t < 1.4) { const k = ease(clamp(t / 1.4, 0, 1)); px = -40 + (bx0 - 40 + 40) * k; ppose = poseAt(POSE.run, t * 1000); }
    else if (t < 2.0) { px = bx0 - 30; ppose = POSE.leap; }
    else { const k = ease(clamp((t - 2) / .6, 0, 1)); px = bx0 - 30 - 80 * k + Math.sin(t * 6) * 6; ppose = Math.sin(t * 6) > 0 ? POSE.armsUp : POSE.jumpUp; }
    stick(ctx, ppose, px, by0 + 20 - (t >= 2 ? Math.abs(Math.sin(t * 6)) * 24 : 0), .6, { color: '#2563EB', far: '#1E40AF', width: 6 });
    // כדור
    let bx = bx0, by = by0, br = 14;
    if (t >= 1.55) { const k = ease(clamp((t - 1.55) / .4, 0, 1)); bx = bx0 + (tx - bx0) * k; by = by0 + (ty - by0) * k - Math.sin(k * Math.PI) * 60; br = 14 - 7 * k; }
    soccer(ctx, bx, by, br);
    if (t > 1.6 && t < 1.95) { ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx, by); ctx.stroke(); }
    // גול!
    if (t > 1.95) {
      if (t < 2.0 && parts.length < 30) { burst(tx, ty, '#fff', 40, 200); }
      const k = clamp((t - 1.95) / .4, 0, 1); bigText(ctx, 'גוווול!', W / 2, 300, 72 * ease(k), '#FDE047', '#7C2D12', 1 + Math.sin(t * 10) * .05);
      if (confetti.length < 120 && Math.random() < .6) for (let i = 0; i < 3; i++) confetti.push({ x: rnd(0, W), y: rnd(-100, -10), vy: rnd(120, 260), rot: rnd(0, 6), vr: rnd(-6, 6), ph: rnd(0, 6), color: colors[i % 5] });
      if (Math.random() < .08) flashes.push({ x: rnd(10, W - 10), y: rnd(10, 50), t: .18 });
    }
    if (t > 3.2) { const val = Math.round(oldBest + (newBest - oldBest) * ease(clamp((t - 3.2) / 1.6, 0, 1))); bigText(ctx, 'שיא חדש!', W / 2 + 30, 385, 48, '#fff', '#1B1740', 1 + Math.sin(t * 10) * .04); bigText(ctx, String(val), W / 2 + 30, 452, 72, '#FDE047', '#7C2D12', val === newBest ? 1 + Math.sin(t * 12) * .08 : 1); }
    if (t > 4.6 && t < 4.7 && parts.length < 120) { burst(80, 240, '#FDE047', 60, 300); burst(280, 220, '#22C55E', 60, 300); burst(180, 160, '#fff', 60, 320); }
    if (t > 4.6) bigText(ctx, 'חיפה חיפה את אלופה', W / 2, 520, 24, '#fff', '#15803D', 1 + Math.sin(t * 8) * .03);
    if (t > 2 && !spoke) { spoke = true; onText && onText('גוווול! שיא חדש!'); }
    // אפקטים
    confetti.forEach(c => { c.y += c.vy * dt; c.x += Math.sin(c.y / 30 + c.ph) * 40 * dt; c.rot += c.vr * dt; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.color; ctx.fillRect(-5, -8, 10, 16 * Math.abs(Math.cos(c.rot * 2))); ctx.restore(); }); confetti = confetti.filter(c => c.y < H + 20);
    parts.forEach(p => { p.t -= dt; p.vy += 240 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.trail.push([p.x, p.y]); if (p.trail.length > 6) p.trail.shift(); ctx.globalAlpha = Math.max(0, p.t); ctx.strokeStyle = p.color; ctx.lineWidth = p.r; ctx.lineCap = 'round'; ctx.beginPath(); p.trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.globalAlpha = 1; }); parts = parts.filter(p => p.t > 0);
    flashes.forEach(f => { f.t -= dt; ctx.fillStyle = `rgba(255,255,255,${f.t * 4})`; ctx.beginPath(); ctx.arc(f.x, f.y, 8, 0, 7); ctx.fill(); }); flashes = flashes.filter(f => f.t > 0);
    if (t < duration) raf = requestAnimationFrame(frame); else onDone && onDone();
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// מנוע המשחקים הקטנים: קנבס בגודל לוגי קבוע, ניקוד, טיימר, מגע/מקלדת, מסכי פתיחה וסיום.
// כל משחק הוא אובייקט { id, name, emoji, how, make(r) } כאשר make מחזיר { update(dt), draw(), tap(x,y), down, up, move, swipe(dir), key(code) }.
import { poseAt } from '../figure.js';
import { celebrateGoal } from './celebrate.js';
export const W = 360, H = 560;

const PAL = { bg: '#1B1740', ink: '#F5F2FF', muted: '#9C96C4', accent: '#8B72FF', ok: '#22C55E', hot: '#FF7A3D', pink: '#FF4D8D', sky: '#38BDF8', gold: '#FFB84D', red: '#EF4444', teal: '#1FB6C9', lime: '#A3E635' };
const rnd = (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function runGame(def, { seconds = 90, host, best = 0, onEnd, sound = true, speak = null }) {
  host.innerHTML = `
    <div class="gamewrap">
      <div class="gamehud">
        <button class="btn icon ghost" id="gexit" aria-label="יציאה">✕</button>
        <span class="gname">${def.emoji} ${def.name}</span>
        <span class="gscore" id="gscore">0</span>
        <span class="gtime" id="gtime"></span>
      </div>
      <div class="gcanvas"><canvas id="gcv" width="${W}" height="${H}"></canvas>
        <div class="goverlay" id="gover"></div>
      </div>
    </div>`;
  const cv = host.querySelector('#gcv'), ctx = cv.getContext('2d');
  const scoreEl = host.querySelector('#gscore'), timeEl = host.querySelector('#gtime'), overlay = host.querySelector('#gover');
  let game = null, raf = 0, last = 0, running = false, ended = false, score = 0, timeLeft = seconds, pauseUntil = 0;
  let pops = [], parts = [], shakeT = 0, ac = null;
  // צלילים קצרים (WebAudio)
  const tone = (f, ms, type = 'sine', vol = .18, at = 0) => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + at; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000); o.start(t); o.stop(t + ms / 1000 + .02); } catch { /* */ } };
  const roar = (at = 0, dur = 1.6) => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const src = ac.createBufferSource(); src.buffer = b; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .6; const g = ac.createGain(); src.connect(f); f.connect(g); g.connect(ac.destination); const t = ac.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.45, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + dur); src.start(t); src.stop(t + dur + .05); for (let i = 0; i < 8; i++) tone(300 + Math.random() * 500, .3, 'sawtooth', .02, at + Math.random() * dur * .6); } catch { /* */ } };
  const SFX = { roar: () => roar(), goal: () => { roar(0, 1.8); tone(196, 900, 'sawtooth', .06); tone(294, 900, 'sawtooth', .05, .02); tone(392, 900, 'sawtooth', .05, .04); }, score: () => { tone(880, 90); tone(1320, 120, 'sine', .14, .08); }, hit: () => tone(220, 120, 'square', .12), over: () => { tone(300, 160, 'sawtooth', .12); tone(200, 260, 'sawtooth', .12, .15); }, win: () => { tone(660, 120); tone(880, 120, 'sine', .18, .13); tone(1100, 260, 'sine', .18, .26); }, tick: () => tone(1000, 40, 'square', .06), bounce: () => tone(500, 50, 'triangle', .1) };

  const r = {
    W, H, ctx, C: PAL, rnd, rint, pick, shuffle, clamp,
    px: W / 2, py: H / 2, isDown: false,
    get score() { return score; }, get timeLeft() { return timeLeft; },
    addScore(n = 1) { score = Math.max(0, Math.round(score + n)); scoreEl.textContent = score; },
    setScore(n) { score = Math.max(0, Math.round(n)); scoreEl.textContent = score; },
    over(msg = 'אופס!') { if (!running) return; running = false; SFX.over(); shakeT = 0.3; flash(msg, timeLeft > 6 ? 'עוד ניסיון...' : ''); if (timeLeft > 6) pauseUntil = performance.now() + 1100; else setTimeout(end, 900); },
    win(msg = 'כל הכבוד!', bonus = 0) { if (!running) return; running = false; SFX.win(); r.burst(W / 2, H / 2, PAL.gold, 30, 320); if (bonus) r.addScore(bonus); flash(msg, timeLeft > 6 ? 'סבב חדש!' : ''); if (timeLeft > 6) pauseUntil = performance.now() + 900; else setTimeout(end, 900); },
    // ציור
    clear(color = PAL.bg) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); },
    rect(x, y, w, h, color, rad = 0) { ctx.fillStyle = color; if (rad) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill(); } else ctx.fillRect(x, y, w, h); },
    circle(x, y, rad, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); },
    line(x1, y1, x2, y2, color, w = 2) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
    text(s, x, y, { size = 20, color = PAL.ink, align = 'center', bold = true, base = 'middle' } = {}) { ctx.fillStyle = color; ctx.font = `${bold ? '800' : '500'} ${size}px Rubik, Heebo, Arial, sans-serif`; ctx.textAlign = align; ctx.textBaseline = base; ctx.direction = 'rtl'; ctx.fillText(s, x, y); },
    emoji(s, x, y, size = 28) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(s, x, y); },
    hit(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    // ---- אפקטים ----
    sfx(kind) { (SFX[kind] || SFX.tick)(); },
    pop(text, x, y, color = PAL.gold, size = 22) { pops.push({ text, x, y, color, size, t: 0.9 }); },
    burst(x, y, color = PAL.gold, n = 14, speed = 220) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0.5 + Math.random() * 0.3, r: 3 + Math.random() * 4 }); } },
    shake(ms = 250) { shakeT = ms / 1000; },
    // דמות מקלות בתוך משחק: pose במרחב 200x200 של הקטלוג (הרגליים ב-y=182), ממוקמת ב-(x,y) = מרכז הרגליים, בגודל scale
    stick(pose, x, y, scale = 0.35, { color = PAL.ink, far = PAL.muted, head = PAL.gold, width = 5, flip = false } = {}) {
      const px = ([a, b]) => [x + (flip ? -(a - 100) : (a - 100)) * scale, y + (b - 182) * scale];
      const seg = (pts, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * scale * 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.map(px).forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke(); };
      seg([pose.neck, pose.le, pose.lh], far, width); seg([pose.hip, pose.lk, pose.lf], far, width);
      seg([pose.neck, pose.hip], color, width); seg([pose.neck, pose.re, pose.rh], color, width); seg([pose.hip, pose.rk, pose.rf], color, width);
      const [hx, hy] = px(pose.head); ctx.fillStyle = head; ctx.beginPath(); ctx.arc(hx, hy, 11 * scale, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2 * scale; ctx.stroke();
    },
    // פוזה מתוך רצף פריימים של תרגיל בזמן נתון
    anim(frames, ms) { return poseAt(frames, ms); },
  };
  function drawFx(dt) {
    pops.forEach(p => { p.t -= dt; p.y -= 40 * dt; ctx.globalAlpha = Math.max(0, p.t / 0.9); r.text(p.text, p.x, p.y, { size: p.size, color: p.color }); ctx.globalAlpha = 1; }); pops = pops.filter(p => p.t > 0);
    parts.forEach(p => { p.t -= dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = Math.max(0, p.t / 0.6); r.circle(p.x, p.y, p.r, p.color); ctx.globalAlpha = 1; }); parts = parts.filter(p => p.t > 0);
  }

  function flash(big, small) { overlay.innerHTML = `<div class="gmsg pop"><b>${big}</b>${small ? `<span>${small}</span>` : ''}</div>`; overlay.classList.add('on'); }
  function hide() { overlay.classList.remove('on'); overlay.innerHTML = ''; }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;

  function fresh() { game = def.make(r); running = true; hide(); }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (ended) return;
    timeLeft -= dt; timeEl.textContent = fmt(Math.max(0, timeLeft)); timeEl.classList.toggle('low', timeLeft < 10);
    if (timeLeft <= 0) return end();
    if (!running) { if (pauseUntil && now >= pauseUntil) { pauseUntil = 0; fresh(); } else return; }
    try {
      game.update && game.update(dt);
      const shaking = shakeT > 0; if (shaking) { shakeT -= dt; ctx.save(); ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 8); }
      game.draw && game.draw(); drawFx(dt);
      if (shaking) ctx.restore();
    } catch (e) { console.error(def.id, e); end(); }
  }
  function end() {
    if (ended) return; ended = true; running = false; cancelAnimationFrame(raf);
    const newBest = score > best && score > 0;
    flash(newBest ? `שיא חדש! ${score}` : `ניקוד: ${score}`, `${best && !newBest ? `השיא שלך: ${best} · ` : ''}חזרה לאימון`);
    if (newBest) {
      // חגיגת שער: מסתירים את ההודעה בזמן הסימולציה, ומראים אותה בסופה
      hide(); const stopFx = celebrateGoal(cv, { oldBest: best, newBest: score, sound, onText: t => speak && speak(t), onDone: () => { flash(`שיא חדש! ${score}`, 'חזרה לאימון'); overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gback">ממשיכים 💪</button>`); overlay.querySelector('#gback').onclick = () => onEnd({ score, best: Math.max(best, score) }); } });
      cv.onclick = () => { stopFx(); cv.onclick = null; flash(`שיא חדש! ${score}`, 'חזרה לאימון'); overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gback">ממשיכים 💪</button>`); overlay.querySelector('#gback').onclick = () => onEnd({ score, best: Math.max(best, score) }); };
      return;
    }
    overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gback">ממשיכים 💪</button>`);
    overlay.querySelector('#gback').onclick = () => onEnd({ score, best: Math.max(best, score) });
  }
  function start() { if (game) return; fresh(); last = performance.now(); raf = requestAnimationFrame(loop); }

  // פתיחה: איך משחקים
  flash(`${def.emoji} ${def.name}`, def.how);
  overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gstart">יאללה! ▶️</button>`);
  overlay.querySelector('#gstart').onclick = start;
  host.querySelector('#gexit').onclick = () => { if (ended) return; if (!game || confirm('לצאת מהמשחק? הניקוד עד עכשיו נשמר.')) end(); };

  // קלט: מגע/עכבר -> קואורדינטות לוגיות, זיהוי טאפ וסווייפ
  const pos = e => { const b = cv.getBoundingClientRect(); return [clamp((e.clientX - b.left) * W / b.width, 0, W), clamp((e.clientY - b.top) * H / b.height, 0, H)]; };
  let sx = 0, sy = 0, st = 0;
  const on = (name, fn) => cv.addEventListener(name, fn, { passive: false });
  on('pointerdown', e => { e.preventDefault(); if (!running) return; cv.setPointerCapture?.(e.pointerId); [r.px, r.py] = pos(e); r.isDown = true; sx = r.px; sy = r.py; st = performance.now(); game.down && game.down(r.px, r.py); });
  on('pointermove', e => { if (!running) return; [r.px, r.py] = pos(e); if (r.isDown) game.move && game.move(r.px, r.py); });
  on('pointerup', e => { if (!running || !r.isDown) return; r.isDown = false; [r.px, r.py] = pos(e); const dx = r.px - sx, dy = r.py - sy;
    game.up && game.up(r.px, r.py);
    if (Math.hypot(dx, dy) < 18 && performance.now() - st < 400) game.tap && game.tap(r.px, r.py);
    else if (Math.hypot(dx, dy) >= 24 && game.swipe) game.swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), dx, dy); });
  on('pointercancel', () => { r.isDown = false; });
  const keys = e => { if (!running) return; const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.key] && game.swipe) { e.preventDefault(); game.swipe(map[e.key], 0, 0); }
    if ((e.key === ' ' || e.key === 'Enter') && game.tap) { e.preventDefault(); game.tap(W / 2, H / 2); }
    game.key && game.key(e.key); };
  window.addEventListener('keydown', keys);
  return { stop() { ended = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', keys); }, isEnded: () => ended };
}

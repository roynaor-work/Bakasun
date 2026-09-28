// מנוע המשחקים הקטנים: קנבס בגודל לוגי קבוע, ניקוד, טיימר, מגע/מקלדת, מסכי פתיחה וסיום.
// כל משחק הוא אובייקט { id, name, emoji, how, make(r) } כאשר make מחזיר { update(dt), draw(), tap(x,y), down, up, move, swipe(dir), key(code) }.
export const W = 360, H = 560;

const PAL = { bg: '#1B1740', ink: '#F5F2FF', muted: '#9C96C4', accent: '#8B72FF', ok: '#22C55E', hot: '#FF7A3D', pink: '#FF4D8D', sky: '#38BDF8', gold: '#FFB84D', red: '#EF4444', teal: '#1FB6C9', lime: '#A3E635' };
const rnd = (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function runGame(def, { seconds = 90, host, best = 0, onEnd }) {
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

  const r = {
    W, H, ctx, C: PAL, rnd, rint, pick, shuffle, clamp,
    px: W / 2, py: H / 2, isDown: false,
    get score() { return score; }, get timeLeft() { return timeLeft; },
    addScore(n = 1) { score = Math.max(0, Math.round(score + n)); scoreEl.textContent = score; },
    setScore(n) { score = Math.max(0, Math.round(n)); scoreEl.textContent = score; },
    over(msg = 'אופס!') { if (!running) return; running = false; flash(msg, timeLeft > 6 ? 'עוד ניסיון...' : ''); if (timeLeft > 6) pauseUntil = performance.now() + 1100; else setTimeout(end, 900); },
    win(msg = 'כל הכבוד!', bonus = 0) { if (!running) return; running = false; if (bonus) r.addScore(bonus); flash(msg, timeLeft > 6 ? 'סבב חדש!' : ''); if (timeLeft > 6) pauseUntil = performance.now() + 900; else setTimeout(end, 900); },
    // ציור
    clear(color = PAL.bg) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); },
    rect(x, y, w, h, color, rad = 0) { ctx.fillStyle = color; if (rad) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill(); } else ctx.fillRect(x, y, w, h); },
    circle(x, y, rad, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); },
    line(x1, y1, x2, y2, color, w = 2) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
    text(s, x, y, { size = 20, color = PAL.ink, align = 'center', bold = true, base = 'middle' } = {}) { ctx.fillStyle = color; ctx.font = `${bold ? '800' : '500'} ${size}px Rubik, Heebo, Arial, sans-serif`; ctx.textAlign = align; ctx.textBaseline = base; ctx.direction = 'rtl'; ctx.fillText(s, x, y); },
    emoji(s, x, y, size = 28) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(s, x, y); },
    hit(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
  };

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
    try { game.update && game.update(dt); game.draw && game.draw(); } catch (e) { console.error(def.id, e); end(); }
  }
  function end() {
    if (ended) return; ended = true; running = false; cancelAnimationFrame(raf);
    const newBest = score > best;
    flash(newBest && score > 0 ? `שיא חדש! ${score}` : `ניקוד: ${score}`, `${best && !newBest ? `השיא שלך: ${best} · ` : ''}חזרה לאימון`);
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

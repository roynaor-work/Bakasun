// מקבץ 4 (29/09): הקפצת כדור (היה הלוליין), יורה בועות, כדורסל, מיני גולף, באולינג. שופרו מראש: מראה (ספרייטים של Kenney), רעיונות ממשחקים דומים, חוקי פסילה, רמות, שמירת התקדמות, peek להדגמה.
import { POSE, S as SP, KITS } from './sprites.js';
export const arcade = [], sport = [];
const BALLS = ['puzzle/tileBlue_11', 'puzzle/tileRed_11', 'puzzle/tileGreen_11', 'puzzle/tileYellow_11', 'puzzle/tilePink_11', 'puzzle/tileOrange_11'], BALL_COL = ['#38bdf8', '#f87171', '#4ade80', '#facc15', '#f472b6', '#fb923c'];
// גרירה מהכדור: כיוון וכוח (כמו בספורט)
const dragShot = (r, getOrigin, onShoot, maxLen = 150, near = 70) => { let sx = 0, sy = 0, dragging = false, cx = 0, cy = 0; return {
  down(x, y) { const [ox, oy] = getOrigin(); if (r.dist(x, y, ox, oy) < near) { dragging = true; sx = x; sy = y; cx = x; cy = y; } }, move(x, y) { if (dragging) { cx = x; cy = y; } },
  up(x, y) { if (!dragging) return; dragging = false; const dx = sx - x, dy = sy - y, L = Math.hypot(dx, dy), len = Math.min(maxLen, L); if (len > 10) onShoot(dx / L * len, dy / L * len, len / maxLen); },
  drawAim() { if (!dragging) return; const [ox, oy] = getOrigin(); const dx = sx - cx, dy = sy - cy, L = Math.hypot(dx, dy), l = Math.min(maxLen, L); if (l < 6) return; const ux = dx / L, uy = dy / L; for (let k = 1; k <= 7; k++) r.circle(ox + ux * l * k / 7, oy + uy * l * k / 7, 2.5 + k * .7, `rgba(255,255,255,${.95 - k * .11})`); r.rect(ox - 30, oy + 30, 60, 8, '#00000055', 4); r.rect(ox - 30, oy + 30, 60 * l / maxLen, 8, l / maxLen > .8 ? '#EF4444' : l / maxLen > .5 ? '#facc15' : '#22C55E', 4); },
  get active() { return dragging; }, get vec() { return dragging ? [sx - cx, sy - cy] : null; } }; };

// ---- הקפצת כדור (היה "הלוליין"; רועי 30/09: בלי דמות למטה שמבלבלת, רקע יפה יותר, שם ברור): פארק בשקיעה עם פרלקסה של Kenney. נוגעים בכדור כדי להקפיץ. כל 10 הקפצות עוד כדור (עד 6), כל 25 רמה (כבידה גבוהה יותר). כדור שנפל = חיים. 3 חיים, כוכבי בונוס, קומבו ----
arcade.push({ id: 'juggle', name: 'הקפצת כדור', emoji: '🏐', assets: BALLS.concat(['fx/star_06', 'bg/mountain1', 'bg/mountain2', 'bg/hills1', 'bg/tree01', 'bg/tree02', 'bg/tree04', 'bg/tree05', 'bg/cloud1', 'bg/cloud2', 'bg/cloud3', 'bg/fence']),
  how: 'נוגעים בכדור כדי להקפיץ אותו למעלה. נוגעים מהצד כדי לשלוח אותו הצידה. כל 10 הקפצות מתווסף כדור (עד 6), כל 25 הקפצות רמה. כדור שנופל לרצפה = חיים אחד. 3 חיים. ⭐ = בונוס. הרמה נשמרת!',
  make(r, progress) {
    const FLOOR = r.H - 40; let level = Math.max(1, (progress && progress.level) || 1), lives = 3, hits = 0, combo = 0, lastBall = -1, tt = 0, armT = 0, jx = r.W / 2, stars = [], starT = 6, spawnT = 0;
    let balls = [{ x: r.W / 2, y: 160, vx: 30, vy: 0, ci: 0, rot: 0 }];
    const grav = () => 420 + level * 40;
    const addBall = () => { balls.push({ x: r.rnd(70, r.W - 70), y: 60, vx: r.rnd(-40, 40), vy: 0, ci: balls.length % 6, rot: 0 }); r.pop('עוד כדור! 🏐', r.W / 2, 120, r.C.gold, 22); r.sfx('powerup'); };
    const clouds = [0, 1, 2, 3].map(i => ({ x: 40 + i * 110, y: 50 + (i % 2) * 40, v: 6 + i * 2 }));
    return {
      save() { return { level }; }, revive() { lives = 3; balls = balls.slice(0, Math.max(1, Math.min(2, balls.length))); balls.forEach(b => { b.y = 120; b.vy = 0; }); },
      peek() { return { balls, lives, FLOOR }; },
      down(x, y) { const b = balls.filter(b => r.dist(x, y, b.x, b.y) < 40).sort((a, c) => r.dist(x, y, a.x, a.y) - r.dist(x, y, c.x, c.y))[0]; if (!b) return; const i = balls.indexOf(b); combo = i !== lastBall ? combo + 1 : 0; lastBall = i; b.vy = -(540 + level * 15); b.vx = r.clamp((b.x - x) * 10 + (r.W / 2 - b.x) * .6, -240, 240); b.rot += 3; hits++; const pts = 2 + balls.length + Math.min(combo, 5); r.addScore(pts); r.pop((combo >= 3 ? `קומבו ${combo}! ` : '') + '+' + pts, b.x, b.y - 30, combo >= 3 ? r.C.gold : '#fff', combo >= 3 ? 20 : 14); r.sparkle(b.x, b.y, 14, 3); r.sfx('bounce'); armT = .25; jx = x;
        if (hits % 10 === 0 && balls.length < 6) addBall(); if (hits % 25 === 0) { level++; r.pop(`רמה ${level}! הכדורים כבדים יותר`, r.W / 2, 200, r.C.gold, 22); r.sfx('levelup'); } },
      update(dt) { tt += dt; armT = Math.max(0, armT - dt); starT -= dt; if (starT <= 0) { starT = r.rnd(7, 12); stars.push({ x: r.rnd(40, r.W - 40), y: -20, vy: 70 }); }
        stars.forEach(s => { s.y += s.vy * dt; }); for (const s of stars) if (!s.got && balls.some(b => r.dist(b.x, b.y, s.x, s.y) < 30)) { s.got = true; r.addScore(50); r.pop('⭐ +50', s.x, s.y, r.C.gold, 22); r.sparkle(s.x, s.y, 30, 8); r.sfx('ching'); } stars = stars.filter(s => !s.got && s.y < r.H);
        for (const b of balls) { b.vy += grav() * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vx * dt * .02; if (b.x < 22) { b.x = 22; b.vx = Math.abs(b.vx); } if (b.x > r.W - 22) { b.x = r.W - 22; b.vx = -Math.abs(b.vx); } if (b.y < 30) { b.y = 30; b.vy = Math.abs(b.vy) * .5; } }
        const fallen = balls.filter(b => b.y > FLOOR - 16); if (fallen.length) { fallen.forEach(f => { r.puff(f.x, FLOOR, 30, 5); balls.splice(balls.indexOf(f), 1); }); lives -= 1; combo = 0; r.shake(250); r.sfx('over'); if (lives <= 0) return r.over('הכדור נפל!'); r.pop(`אופס! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); if (!balls.length) balls.push({ x: r.W / 2, y: 120, vx: 0, vy: 0, ci: 0, rot: 0 }); }
        const avg = balls.reduce((s, b) => s + b.x, 0) / balls.length; jx += (avg - jx) * Math.min(1, dt * 4); },
      draw() { const c = r.ctx; /* פארק בשקיעה: שמיים בגרדיאנט, שמש, עננים, הרים, גבעות, עצים, גדר ודשא (Kenney, צבועים) */
        const g = c.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, '#312e81'); g.addColorStop(.45, '#c2410c'); g.addColorStop(1, '#fde68a'); c.fillStyle = g; c.fillRect(0, 0, r.W, FLOOR);
        r.circle(r.W * .72, FLOOR - 150, 46, '#fff7ae'); r.circle(r.W * .72, FLOOR - 150, 36, '#fde047');
        clouds.forEach((cl, i) => { cl.x += cl.v * (1 / 60); if (cl.x > r.W + 80) cl.x = -80; if (!r.img('bg/cloud' + (1 + i % 3), cl.x, cl.y, 110, null, { alpha: .9, tint: '#fff1f2' })) r.circle(cl.x, cl.y, 20, 'rgba(255,255,255,.8)'); });
        for (let i = -1; i < 2; i++) { r.img('bg/mountain1', i * 520 + 120, FLOOR - 30, 240, null, { ay: 1, tint: '#7c3aed' }); r.img('bg/mountain2', i * 520 + 380, FLOOR - 30, 200, null, { ay: 1, tint: '#6d28d9' }); }
        r.img('bg/hills1', r.W / 2, FLOOR + 2, 720, null, { ay: 1, tint: '#4d7c0f' });
        [['bg/tree02', 30, 120], ['bg/tree04', 110, 95], ['bg/tree01', r.W - 100, 130], ['bg/tree05', r.W - 30, 90]].forEach(([k, x, h]) => r.img(k, x, FLOOR + 2, null, h, { ay: 1, tint: '#14532d' }));
        for (let x = 20; x < r.W; x += 64) r.img('bg/fence', x, FLOOR + 2, 64, null, { ay: 1, tint: '#a16207' });
        const fg = c.createLinearGradient(0, FLOOR, 0, r.H); fg.addColorStop(0, '#65a30d'); fg.addColorStop(1, '#3f6212'); c.fillStyle = fg; c.fillRect(0, FLOOR, r.W, r.H - FLOOR); r.rect(0, FLOOR, r.W, 5, '#4d7c0f'); for (let i = 0; i < 9; i++) r.rect(20 + i * 40, FLOOR + 18 + (i % 2) * 8, 26, 3, 'rgba(0,0,0,.15)');
        stars.forEach(s => { if (!r.img('fx/star_06', s.x, s.y, 28, 28, { rot: tt * 2 })) r.emoji('⭐', s.x, s.y, 24); });
        balls.forEach(b => { r.circle(b.x, FLOOR - 2, 14 * Math.max(.3, 1 - (FLOOR - b.y) / 500), 'rgba(0,0,0,.18)'); if (!r.img(BALLS[b.ci], b.x, b.y, 40, 40, { rot: b.rot })) r.circle(b.x, b.y, 20, BALL_COL[b.ci]); });
        r.text(`רמה ${level} · ${balls.length} כדורים · ${'❤️'.repeat(Math.max(0, lives))}${combo >= 3 ? ` · קומבו ${combo} 🔥` : ''}`, r.W / 2, 22, { size: 14, color: '#fff' }); },
    };
  } });

// ---- יורה בועות (רועי 30/09: יותר צבע ורקע, מכונת ירייה עם ילד שיושב בתוכה, קצב מהיר יותר, אזהרה בהתמהמהות ואז התקרה יורדת): רשת משושים אמיתית, קו כיוון עם קפיצה מהקירות, הבועה הבאה (נוגעים בה להחלפה), אשכולות מרחפים נופלים, תקרה יורדת כל 6 יריות, יותר צבעים ברמות, 3 חיים ----
arcade.push({ id: 'bubble-shooter', name: 'יורה בועות', emoji: '🔮', assets: BALLS.concat(['bg/hills1', 'bg/hills2', 'bg/cloud1', 'bg/cloud2']),
  how: 'גוררים כדי לכוון (הקו מראה גם קפיצה מהקיר) ומשחררים כדי לירות. 3 בועות באותו צבע שנוגעות נעלמות, ובועות שנשארות באוויר נופלות (בונוס!). נוגעים בבועה הקטנה בצד כדי להחליף. כל 5 יריות התקרה יורדת, וגם אם מתמהמהים: צפצוף והבהוב = לירות מהר! הבועות הגיעו לקו = חיים אחד. 3 חיים, הרמה נשמרת.',
  make(r, progress) {
    const COLS = 9, S = 38, RH = S * .87, TOP = 26, SX = (r.W - COLS * S) / 2 + S / 2, DANGER = 11;
    let level = Math.max(1, (progress && progress.level) || 1), lives = 3, grid = new Map(), shift = 0, shot = null, shots = 0, pops = 0, falling = [], aim = null, tt = 0, cur, next, idle = 0, warnT = 0, barrel = -Math.PI / 2, recoil = 0;
    const IDLE_WARN = 4, IDLE_DROP = 6; /* שניות בלי ירייה: אזהרה (צפצוף + הבהוב 2 שניות), ואז התקרה יורדת שורה */
    const nColors = () => Math.min(6, 3 + Math.ceil(level / 2)); const rc = () => r.rint(0, nColors() - 1);
    const off = row => ((row + shift) % 2) * S / 2; const px = (row, col) => SX + col * S + off(row); const py = row => TOP + row * RH + S / 2;
    const key = (row, col) => row + ',' + col; const parse = k => k.split(',').map(Number);
    const nb = (row, col) => { const odd = (row + shift) % 2; return [[row, col - 1], [row, col + 1], [row - 1, col], [row + 1, col], [row - 1, odd ? col + 1 : col - 1], [row + 1, odd ? col + 1 : col - 1]].filter(([a, b]) => a >= 0 && b >= 0 && b < COLS - ((a + shift) % 2)); };
    const fill = () => { grid = new Map(); for (let row = 0; row < 5; row++) for (let col = 0; col < COLS - ((row + shift) % 2); col++) grid.set(key(row, col), rc()); cur = rc(); next = rc(); };
    fill();
    const cluster = (row, col) => { const c = grid.get(key(row, col)); const seen = new Set([key(row, col)]), st = [[row, col]]; while (st.length) { const [a, b] = st.pop(); for (const [x, y] of nb(a, b)) { const k = key(x, y); if (!seen.has(k) && grid.get(k) === c) { seen.add(k); st.push([x, y]); } } } return seen; };
    const dropFloating = () => { const anchored = new Set(); const st = []; for (const k of grid.keys()) { const [row] = parse(k); if (row === 0) { anchored.add(k); st.push(parse(k)); } } while (st.length) { const [a, b] = st.pop(); for (const [x, y] of nb(a, b)) { const k = key(x, y); if (grid.has(k) && !anchored.has(k)) { anchored.add(k); st.push([x, y]); } } } let n = 0; for (const k of [...grid.keys()]) if (!anchored.has(k)) { const [row, col] = parse(k); falling.push({ x: px(row, col), y: py(row), vy: 0, c: grid.get(k) }); grid.delete(k); n++; } if (n) { r.addScore(n * 20); r.pop(`נפלו ${n}! +${n * 20}`, r.W / 2, 300, r.C.gold, 22); r.sfx('score'); } };
    const settle = (sx, sy) => { let best = null, bd = 1e9; for (let row = 0; row < DANGER + 2; row++) for (let col = 0; col < COLS - ((row + shift) % 2); col++) { if (grid.has(key(row, col))) continue; const d = r.dist(sx, sy, px(row, col), py(row)); if (d < bd) { bd = d; best = [row, col]; } } if (!best) return; grid.set(key(...best), cur); const cl = cluster(...best);
      if (cl.size >= 3) { cl.forEach(k => { const [row, col] = parse(k); r.burst(px(row, col), py(row), BALL_COL[grid.get(k)], 5, 120); r.sparkle(px(row, col), py(row), 12, 1); grid.delete(k); }); pops += cl.size; r.addScore(cl.size * 10); r.pop('+' + cl.size * 10, px(...best), py(best[0]) - 20, '#fff', 18); r.sfx('pop'); dropFloating(); if (pops >= 30 * level) { level++; r.pop(`רמה ${level}! עוד צבע`, r.W / 2, 260, r.C.gold, 24); r.sfx('levelup'); } } else r.sfx('tick');
      shots++; if (shots % 5 === 0) dropCeiling();
      cur = next; next = rc(); checkDanger(); };
    const dropCeiling = () => { const ng = new Map(); for (const [k, v] of grid) { const [row, col] = parse(k); ng.set(key(row + 1, col), v); } shift = (shift + 1) % 2; for (let col = 0; col < COLS - (shift % 2); col++) ng.set(key(0, col), rc()); grid = ng; r.shake(150); r.sfx('wood'); };
    const checkDanger = () => { if ([...grid.keys()].some(k => parse(k)[0] >= DANGER)) { lives--; r.shake(300); r.sfx('over'); if (lives <= 0) return r.over('הבועות הגיעו למטה!'); for (const k of [...grid.keys()]) if (parse(k)[0] >= 6) grid.delete(k); r.pop(`הבועות ירדו! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); } };
    const SHOOT = { x: r.W / 2, y: r.H - 56 };
    const fire = (dx, dy) => { const L = Math.hypot(dx, dy); if (L < 8 || dy > -8) return; shot = { x: SHOOT.x, y: SHOOT.y, vx: dx / L * 900, vy: dy / L * 900 }; barrel = Math.atan2(dy, dx); recoil = 1; idle = 0; warnT = 0; r.sfx('jump'); };
    const NEXT = { x: r.W - 40, y: r.H - 56 };
    return {
      save() { return { level }; }, revive() { lives = 3; for (const k of [...grid.keys()]) if (parse(k)[0] >= 5) grid.delete(k); },
      peek() { const cells = [...grid].map(([k, c]) => { const [row, col] = parse(k); return { row, col, x: px(row, col), y: py(row), c }; }); return { cells, cur, next, shooter: SHOOT, shot: !!shot, S }; },
      down(x, y) { if (r.dist(x, y, NEXT.x, NEXT.y) < 26) { [cur, next] = [next, cur]; r.sfx('tick'); return; } aim = { x, y }; barrel = Math.atan2(y - SHOOT.y, x - SHOOT.x); }, move(x, y) { if (aim) { aim = { x, y }; if (y < SHOOT.y - 8) barrel = Math.atan2(y - SHOOT.y, x - SHOOT.x); } },
      up(x, y) { if (!aim) return; aim = null; if (shot) return; fire(x - SHOOT.x, y - SHOOT.y); }, tap(x, y) { if (shot || aim) return; if (r.dist(x, y, NEXT.x, NEXT.y) < 26) return; fire(x - SHOOT.x, y - SHOOT.y); },
      update(dt) { tt += dt; recoil = Math.max(0, recoil - dt * 4); falling.forEach(f => { f.vy += 900 * dt; f.y += f.vy * dt; }); falling = falling.filter(f => f.y < r.H + 30);
        if (!shot) { idle += dt; if (idle >= IDLE_WARN && warnT <= 0 && idle < IDLE_DROP) { warnT = 2; r.sfx('tick'); r.pop('מהר! לירות!', r.W / 2, r.H / 2 - 40, r.C.gold, 22); } if (warnT > 0) warnT -= dt; if (idle >= IDLE_DROP) { dropCeiling(); idle = IDLE_WARN - 1.5; warnT = 0; checkDanger(); } return; }
        for (let k = 0; k < 3; k++) { shot.x += shot.vx * dt / 3; shot.y += shot.vy * dt / 3; if (shot.x < S / 2) { shot.x = S / 2; shot.vx *= -1; } if (shot.x > r.W - S / 2) { shot.x = r.W - S / 2; shot.vx *= -1; }
          if (shot.y < TOP + S / 2) { settle(shot.x, shot.y); shot = null; return; } for (const [kk] of grid) { const [row, col] = parse(kk); if (r.dist(shot.x, shot.y, px(row, col), py(row)) < S - 3) { settle(shot.x, shot.y); shot = null; return; } } } },
      draw() { const c = r.ctx; /* רקע: שמיים צבעוניים, עננים, גבעות ממתקים */ const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#6d28d9'); bg.addColorStop(.5, '#db2777'); bg.addColorStop(1, '#f59e0b'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H);
        for (let i = 0; i < 14; i++) r.circle((i * 97 + tt * 6) % (r.W + 40) - 20, (i * 151) % r.H, 10 + (i % 3) * 8, `rgba(255,255,255,${.05 + (i % 3) * .03})`);
        r.img('bg/cloud1', 60 + Math.sin(tt * .2) * 20, r.H - 190, 120, null, { alpha: .8, tint: '#fbcfe8' }); r.img('bg/cloud2', r.W - 70 + Math.cos(tt * .17) * 20, r.H - 230, 110, null, { alpha: .8, tint: '#fde68a' });
        r.img('bg/hills2', r.W / 2 + 80, r.H - 40, 760, null, { ay: 1, tint: '#c026d3', alpha: .9 }); r.img('bg/hills1', r.W / 2 - 60, r.H - 24, 720, null, { ay: 1, tint: '#7e22ce' });
        if (warnT > 0 && Math.sin(tt * 18) > 0) { c.fillStyle = 'rgba(239,68,68,.22)'; c.fillRect(0, 0, r.W, r.H); } /* הבהוב אזהרה */
        r.rect(0, TOP - 8, r.W, 8, '#4c1d95'); c.setLineDash([6, 6]); c.strokeStyle = 'rgba(239,68,68,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, py(DANGER) - S / 2); c.lineTo(r.W, py(DANGER) - S / 2); c.stroke(); c.setLineDash([]);
        for (const [k, ci] of grid) { const [row, col] = parse(k); const x = px(row, col), y = py(row); if (!r.img(BALLS[ci], x, y, S - 3, S - 3)) r.circle(x, y, S / 2 - 2, BALL_COL[ci]); }
        falling.forEach(f => { if (!r.img(BALLS[f.c], f.x, f.y, S - 3, S - 3, { rot: f.vy * .01 })) r.circle(f.x, f.y, S / 2 - 2, BALL_COL[f.c]); });
        /* קו כיוון עם קפיצה מהקיר */ if (aim && !shot) { let dx = aim.x - SHOOT.x, dy = aim.y - SHOOT.y; const L = Math.hypot(dx, dy) || 1; if (dy < -8) { let x = SHOOT.x, y = SHOOT.y, vx = dx / L, vy = dy / L; for (let i = 0; i < 26; i++) { x += vx * 18; y += vy * 18; if (x < S / 2 || x > r.W - S / 2) vx *= -1; if (y < TOP + S / 2) break; let hit = false; for (const [kk] of grid) { const [row, col] = parse(kk); if (r.dist(x, y, px(row, col), py(row)) < S - 6) { hit = true; break; } } if (hit) break; r.circle(x, y, 3, `rgba(255,255,255,${.9 - i * .03})`); } } }
        /* מכונת ירייה: ילד יושב בתוך צריח מתכת, קנה שמסתובב לכיוון הכיוון, רתע בירייה */ r.player(POSE.stand, SHOOT.x - 36, r.H - 28, .5, KITS.kid); /* הילד יושב בצריח, הראש והכתפיים מעל הבסיס */ c.save(); c.translate(SHOOT.x + 6, SHOOT.y + 6); c.rotate(barrel); const rc2 = 10 * recoil; r.rect(14 - rc2, -13, 46, 26, '#334155', 8); r.rect(52 - rc2, -16, 14, 32, '#0f172a', 4); r.rect(20 - rc2, -6, 30, 5, '#94a3b8', 2); c.restore(); c.fillStyle = '#475569'; c.beginPath(); c.arc(SHOOT.x, r.H, 58, Math.PI, 0); c.fill(); c.fillStyle = '#1e293b'; c.beginPath(); c.arc(SHOOT.x, r.H, 58, Math.PI, 0); c.lineWidth = 5; c.strokeStyle = '#fde047'; c.stroke(); r.rect(SHOOT.x - 34, r.H - 14, 68, 14, '#0f172a', 4); for (let i = 0; i < 3; i++) r.circle(SHOOT.x - 20 + i * 20, r.H - 7, 3.5, ['#22c55e', '#facc15', '#ef4444'][i]); if (shot) { if (!r.img(BALLS[cur], shot.x, shot.y, S - 3, S - 3)) r.circle(shot.x, shot.y, S / 2 - 2, BALL_COL[cur]); } else if (!r.img(BALLS[cur], SHOOT.x, SHOOT.y, S - 3, S - 3)) r.circle(SHOOT.x, SHOOT.y, S / 2 - 2, BALL_COL[cur]);
        r.circle(NEXT.x, NEXT.y, 22, 'rgba(255,255,255,.12)'); if (!r.img(BALLS[next], NEXT.x, NEXT.y, 24, 24)) r.circle(NEXT.x, NEXT.y, 11, BALL_COL[next]); r.text('הבא', NEXT.x, NEXT.y - 28, { size: 11, color: '#c4b5fd' });
        r.text(`רמה ${level} · ${'❤️'.repeat(Math.max(0, lives))} · עוד ${6 - shots % 6} לירידת התקרה`, 90, r.H - 14, { size: 12, color: '#c4b5fd' }); },
    };
  } });

// ---- כדורסל: מגרש עם פרקט, לוח וסל עם רשת שרוקדת, כדור תלת-ממדי מסתובב, סוויש, רצף = כדור בוער, סל שזז מרמה 2, 5 החטאות = נפסלת, הרמה נשמרת ----
sport.push({ id: 'basketball', name: 'כדורסל', emoji: '🏀', assets: ['bg/cloud1', 'bg/cloud2'],
  how: 'הקשת הלבנה זזה עם מד הכוח: נוגעים בדיוק כשהיא עוברת דרך הסל, והכדור עף לשם. סוויש = 30, עם ברזל = 20, מושלם = בונוס. 3 ברצף = הכדור בוער 🔥. מרמה 2 הסל זז ורחוק יותר, המד מהיר יותר. 5 החטאות = נפסלת. הרמה נשמרת.',
  /* לפי Basketball Orbit (רועי 30/09, crazygames): זריקה בלחיצה אחת עם מד כוח שמתנדנד (אדום→צהוב→ירוק); כאן המד מזיז קשת תצוגה מקדימה, כך שרואים לאן הכדור יעוף ולוחצים כשהקשת בסל. הכדור בידיים (לא על הראש), קופץ על הרצפה, מהלוח ומהברזל */
  make(r, progress) {
    const GY = r.H - 44, G = 900, ANG = 62 * Math.PI / 180, V0 = 380, V1 = 560; /* מהירות = V0 + p*V1 */
    let level = Math.max(1, (progress && progress.level) || 1), ball, hoop = { x: 262, y: GY - 190, vx: 0 }, streak = 0, misses = 0, baskets = 0, shooterT = 0, trail = [], tt = 0, netT = 0, fire = false, shotFrom = 70, ph = 0, dir = 1, waitT = 0, lastPerfect = false;
    const SC = .72; /* גודל הזורק */ const HAND = () => [shotFrom + 22, GY - 96 * SC]; /* הכדור בידיים לפני החזה (חזה ≈ 52 מעל הרגליים בקנה מידה .5) */
    const reset = () => { const [hx, hy] = HAND(); ball = { x: hx, y: hy, vx: 0, vy: 0, fly: false, rim: false, t: 0, rot: 0, scored: false, bounces: 0 }; trail = []; shooterT = 0; };
    reset();
    const newHoop = () => { const far = Math.min(1, (level - 1) / 4); hoop = { x: r.rnd(200 + far * 40, 300 + far * 30), y: r.rnd(GY - 235, GY - 150), vx: level >= 2 ? r.pick([-1, 1]) * (24 + level * 10) : 0 }; };
    const meterSpeed = () => .55 + Math.min(.6, (level - 1) * .12); /* מחזורים לשנייה */
    const speedFor = p => V0 + p * V1;
    const idealP = () => { const [bx, by] = HAND(); const dx = hoop.x - bx, up = by - hoop.y, den = 2 * Math.cos(ANG) ** 2 * (dx * Math.tan(ANG) - up); if (den <= 0) return 1; return r.clamp((Math.sqrt(G * dx * dx / den) - V0) / V1, 0, 1); };
    const arc = p => { const pts = []; const [bx, by] = HAND(); const v = speedFor(p); let x = bx, y = by, vx = v * Math.cos(ANG), vy = -v * Math.sin(ANG); for (let i = 0; i < 40; i++) { vy += G * .03; x += vx * .03; y += vy * .03; pts.push([x, y]); if (y > GY || x > r.W + 20) break; } return pts; };
    const shoot = () => { if (ball.fly || waitT > 0) return; const p = ph, v = speedFor(p); ball.vx = v * Math.cos(ANG); ball.vy = -v * Math.sin(ANG); ball.fly = true; shooterT = .6; lastPerfect = Math.abs(p - idealP()) < .035; r.sfx('jump'); if (lastPerfect) r.pop('מושלם!', ball.x, ball.y - 40, r.C.gold, 20); };
    const miss = () => { misses++; streak = 0; fire = false; r.sfx('ohh'); if (misses >= 5) return r.over('5 החטאות'); r.pop(`החטאה ${misses}/5`, r.W / 2, 120, '#f87171', 18); waitT = .6; };
    return {
      tap: shoot, down() {}, up() {},
      save() { return { level }; }, revive() { misses = 0; reset(); },
      peek() { return { ball, hoop, canShoot: !ball.fly && waitT <= 0, GY, p: ph, ideal: idealP() }; },
      update(dt) { tt += dt; shooterT -= dt; netT = Math.max(0, netT - dt); if (hoop.vx) { hoop.x += hoop.vx * dt; if (hoop.x < 190 || hoop.x > 330) hoop.vx *= -1; }
        if (waitT > 0) { waitT -= dt; if (waitT <= 0) { newHoop(); reset(); } return; }
        if (!ball.fly) { ph += dir * meterSpeed() * 2 * dt; if (ph > 1) { ph = 1; dir = -1; } if (ph < 0) { ph = 0; dir = 1; } return; }
        ball.vy += G * dt; const py = ball.y; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += ball.vx * dt * .02; ball.t += dt; if (ball.t % .04 < dt) trail.push({ x: ball.x, y: ball.y }); if (trail.length > 14) trail.shift(); if (fire && Math.random() < .5) r.explode(ball.x, ball.y + 6, 12, 1);
        /* לוח */ if (ball.x + 14 > hoop.x + 30 && ball.x < hoop.x + 44 && ball.y > hoop.y - 70 && ball.y < hoop.y + 10 && ball.vx > 0) { ball.x = hoop.x + 16; ball.vx = -Math.abs(ball.vx) * .55; ball.rim = true; r.sfx('wood'); }
        /* ברזל */ for (const rx of [hoop.x - 24, hoop.x + 24]) { const dd = r.dist(ball.x, ball.y, rx, hoop.y); if (dd < 17) { const nx = (ball.x - rx) / dd, ny = (ball.y - hoop.y) / dd; const vn = ball.vx * nx + ball.vy * ny; if (vn < 0) { ball.vx -= 1.5 * vn * nx; ball.vy -= 1.5 * vn * ny; } ball.x = rx + nx * 17; ball.y = hoop.y + ny * 17; ball.rim = true; r.sfx('metal'); } }
        if (!ball.scored && ball.vy > 0 && py < hoop.y && ball.y >= hoop.y && Math.abs(ball.x - hoop.x) < 20) { ball.scored = true; streak++; baskets++; netT = .6; const swish = !ball.rim; let pts = (swish ? 30 : 20) + Math.min(streak - 1, 3) * 5 + (fire ? 10 : 0) + (lastPerfect ? 10 : 0); r.addScore(pts); r.pop(swish ? `סוויש! +${pts}` : `+${pts}`, hoop.x, hoop.y - 50, '#FDE047', 26); r.burst(hoop.x, hoop.y + 10, '#F97316', 18); r.sparkle(hoop.x, hoop.y, 30, swish ? 10 : 4); r.sfx(swish ? 'score' : 'bounce'); if (streak >= 3 && !fire) { fire = true; r.pop('הכדור בוער! 🔥', r.W / 2, 100, '#f97316', 24); r.sfx('roar'); }
          if (baskets % 5 === 0) { level++; r.pop(`רמה ${level}! הסל זז והמד מהיר יותר`, r.W / 2, 160, r.C.gold, 22); r.sfx('levelup'); } waitT = .7; return; }
        /* רצפה: הכדור קופץ ונרגע (כמו ב-Orbit), ואז החטאה */ if (ball.y > GY - 14 && ball.vy > 0) { ball.y = GY - 14; ball.vy = -ball.vy * .55; ball.vx *= .8; ball.bounces++; r.puff(ball.x, GY, 16, 2); r.sfx('bounce'); if (ball.bounces >= 3 || Math.abs(ball.vy) < 60) { if (!ball.scored) { const res = miss(); if (res !== undefined) return res; } else waitT = .3; } }
        if (ball.x > r.W + 30 || ball.x < -30) { if (ball.scored) { waitT = .3; return; } const res = miss(); if (res !== undefined) return res; } },
      draw() { const c = r.ctx; /* אולם: קיר בגרדיאנט, קהל בשתי שורות, דגלים, פרקט */ const bg = c.createLinearGradient(0, 0, 0, GY); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#4c1d95'); c.fillStyle = bg; c.fillRect(0, 0, r.W, GY);
        r.rect(0, GY - 150, r.W, 150, '#312e81'); for (let row = 0; row < 2; row++) for (let i = 0; i < 13; i++) { const x = 14 + i * 28 + row * 14, y = GY - 128 + row * 30 + (Math.sin(tt * 6 + i) > 0 && netT > 0 ? -5 : 0); r.rect(x - 8, y - 4, 16, 22, ['#f472b6', '#38bdf8', '#a3e635', '#facc15', '#fb923c', '#fff'][(i + row) % 6], 4); r.circle(x, y - 12, 7, ['#F1C27D', '#E0AC69', '#C68642', '#8D5524'][(i * 7 + row) % 4]); }
        r.rect(0, GY - 62, r.W, 62, 'rgba(15,23,42,.55)'); for (let i = 0; i < 6; i++) r.rect(20 + i * 60, 10, 28, 18, ['#0B7A3B', '#fff', '#FDE047', '#1E3A8A', '#EF4444', '#0EA5E9'][i], 2);
        const fl = c.createLinearGradient(0, GY, 0, r.H); fl.addColorStop(0, '#d97706'); fl.addColorStop(1, '#92400e'); c.fillStyle = fl; c.fillRect(0, GY, r.W, r.H - GY); for (let x = 0; x < r.W; x += 28) r.rect(x, GY, 1, r.H - GY, 'rgba(0,0,0,.15)'); r.line(0, GY, r.W, GY, '#fde68a', 3); c.strokeStyle = '#fde68a'; c.lineWidth = 2; c.beginPath(); c.arc(hoop.x, GY, 150, Math.PI, 0); c.stroke();
        /* לוח, סל ורשת */ r.rect(hoop.x + 30, hoop.y - 70, 8, 80, '#334155', 3); r.rect(hoop.x + 30, GY - 200, 6, 200, '#475569'); r.rect(hoop.x + 18, hoop.y - 60, 16, 56, '#f8fafc', 3); r.rect(hoop.x + 22, hoop.y - 40, 8, 26, '#ef4444', 2); c.strokeStyle = '#f97316'; c.lineWidth = 5; c.beginPath(); c.ellipse(hoop.x, hoop.y, 24, 6, 0, 0, Math.PI * 2); c.stroke(); const wob = Math.sin(tt * 18) * netT * 6; c.strokeStyle = '#f8fafc'; c.lineWidth = 1.5; for (let i = 0; i <= 6; i++) { const x0 = hoop.x - 24 + i * 8; c.beginPath(); c.moveTo(x0, hoop.y); c.quadraticCurveTo(hoop.x + (x0 - hoop.x) * .6 + wob, hoop.y + 22, hoop.x + (x0 - hoop.x) * .55 + wob, hoop.y + 34); c.stroke(); } for (let j = 1; j <= 3; j++) { c.beginPath(); c.ellipse(hoop.x + wob * j / 3, hoop.y + j * 11, 24 - j * 3.5, 4, 0, 0, Math.PI * 2); c.stroke(); }
        /* הזורק: עומד עם הכדור בידיים, קופץ בזריקה */ r.player(shooterT > 0 ? POSE.jumpUp : POSE.stand, shotFrom, GY - (shooterT > 0 ? 14 : 0), SC, KITS.purple);
        /* קשת תצוגה מקדימה + מד כוח (Basketball Orbit): נוגעים כשהקשת בסל */ if (!ball.fly && waitT <= 0) { const pts = arc(ph), good = Math.abs(ph - idealP()) < .05; pts.forEach(([x, y], i) => { if (i % 2) r.circle(x, y, good ? 4 : 3, good ? `rgba(74,222,128,${.95 - i * .02})` : `rgba(255,255,255,${.85 - i * .02})`); });
          const MX = 22, MY = GY - 300, MH = 150; r.rect(MX - 9, MY, 18, MH, 'rgba(0,0,0,.45)', 9); const ip = idealP(); r.rect(MX - 9, MY + MH * (1 - Math.min(1, ip + .05)), 18, MH * .1, 'rgba(74,222,128,.7)', 4); r.rect(MX - 12, MY + MH * (1 - ph) - 4, 24, 8, good ? '#4ade80' : ph > .66 ? '#ef4444' : ph > .33 ? '#facc15' : '#38bdf8', 3); r.text('כוח', MX, MY - 12, { size: 12, color: '#fff' }); }
        trail.forEach((t, i) => r.circle(t.x, t.y, 2 + i * .5, fire ? `rgba(249,115,22,${i / 20})` : `rgba(255,255,255,${i / 40})`)); r.circle(ball.x, GY - 2, 12 * Math.max(.3, 1 - (GY - ball.y) / 500), 'rgba(0,0,0,.2)'); SP.basketBall(r, ball.x, ball.y, 14, ball.rot);
        r.text(`רמה ${level} · סלים ${baskets} · החטאות ${misses}/5${streak > 1 ? ` · רצף ${streak}${fire ? ' 🔥' : ''}` : ''}`, r.W / 2, 22, { size: 14, color: '#fff' }); },
    };
  } });

// ---- מיני גולף: 9 גומות מתוכננות (קירות, חול, מים, טחנת רוח מסתובבת, במפרים), פאר לכל גומה, מגבלת חבטות = חיים, 3 חיים, הגומה נשמרת ----
sport.push({ id: 'golf', name: 'מיני גולף', emoji: '⛳',
  how: 'גוררים מהכדור אחורה ומשחררים. 9 גומות: קירות, חול שמאט, מים שמחזירים, טחנת רוח שמסתובבת, במפרים. לכל גומה פאר. פחות חבטות = יותר נקודות. עברת את הפאר ב-3 = חיים אחד. 3 חיים, הגומה נשמרת.',
  make(r, progress) {
    const W = r.W, H = r.H;
    const HOLES = [
      { par: 2, start: [80, 470], hole: [280, 110], walls: [[120, 260, 160, 14]] },
      { par: 3, start: [60, 470], hole: [300, 90], walls: [[0, 330, 220, 14], [140, 180, 220, 14]], sand: [[240, 260, 40]] },
      { par: 3, start: [180, 480], hole: [180, 80], walls: [[60, 300, 240, 14]], water: [[40, 160, 120, 60]], bumpers: [[100, 220], [260, 220]] },
      { par: 3, start: [70, 470], hole: [290, 120], walls: [[120, 120, 14, 200], [230, 240, 14, 200]], sand: [[60, 200, 36]] },
      { par: 4, start: [180, 490], hole: [180, 70], walls: [[40, 360, 120, 14], [200, 360, 120, 14]], mill: [180, 230, 70], water: [[0, 130, 100, 40], [260, 130, 100, 40]] },
      { par: 3, start: [50, 480], hole: [310, 80], walls: [[0, 400, 260, 14], [100, 280, 260, 14], [0, 160, 260, 14]] },
      { par: 3, start: [180, 480], hole: [180, 100], bumpers: [[120, 300], [240, 300], [180, 200]], sand: [[80, 160, 34], [280, 160, 34]] },
      { par: 4, start: [60, 470], hole: [300, 90], walls: [[130, 100, 14, 180], [130, 340, 14, 160]], mill: [240, 250, 60], water: [[200, 400, 100, 50]] },
      { par: 4, start: [180, 490], hole: [180, 60], walls: [[60, 420, 240, 14], [40, 300, 100, 14], [220, 300, 100, 14], [110, 180, 140, 14]], mill: [180, 120, 55], bumpers: [[70, 240], [290, 240]] },
    ];
    let level = Math.max(1, (progress && progress.level) || 1), lives = 3, strokes = 0, ball, last, msg = '', msgT = 0, tt = 0, millA = 0, sinkT = 0;
    const L = () => HOLES[(level - 1) % HOLES.length];
    const setup = () => { const h = L(); ball = { x: h.start[0], y: h.start[1], vx: 0, vy: 0 }; last = { x: ball.x, y: ball.y }; strokes = 0; };
    setup();
    const moving = () => Math.hypot(ball.vx, ball.vy) > 6;
    const d = dragShot(r, () => [ball.x, ball.y], (dx, dy) => { if (moving() || sinkT > 0) return; ball.vx = dx * 4.2; ball.vy = dy * 4.2; strokes++; last = { x: ball.x, y: ball.y }; r.sfx('wood'); r.puff(ball.x, ball.y, 14, 2); }, 150, 60);
    const inRect = (x, y, [rx, ry, rw, rh]) => x > rx && x < rx + rw && y > ry && y < ry + rh;
    const fail = why => { lives--; r.shake(250); r.sfx('over'); if (lives <= 0) return r.over(why); r.pop(`${why} נשארו ${lives} ❤️`, W / 2, H / 2, '#fff', 20); level++; setup(); };
    return {
      down: d.down, move: d.move, up: d.up,
      save() { return { level }; }, revive() { lives = 3; setup(); },
      peek() { return { ball, hole: L().hole, moving: moving(), par: L().par, strokes }; },
      update(dt) { tt += dt; msgT -= dt; millA += dt * 1.6; const h = L(); if (sinkT > 0) { sinkT -= dt; if (sinkT <= 0) { level++; setup(); r.win(`גומה ${(level - 1) % 9 + 1}!`, 0); } return; }
        const inSand = (h.sand || []).some(([sx, sy, sr]) => r.dist(ball.x, ball.y, sx, sy) < sr); const fr = inSand ? 4.5 : 1.3; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= 1 - fr * dt; ball.vy *= 1 - fr * dt;
        if (ball.x < 14) { ball.x = 14; ball.vx = Math.abs(ball.vx) * .8; r.sfx('tick'); } if (ball.x > W - 14) { ball.x = W - 14; ball.vx = -Math.abs(ball.vx) * .8; r.sfx('tick'); } if (ball.y < 14) { ball.y = 14; ball.vy = Math.abs(ball.vy) * .8; r.sfx('tick'); } if (ball.y > H - 14) { ball.y = H - 14; ball.vy = -Math.abs(ball.vy) * .8; r.sfx('tick'); }
        for (const w of (h.walls || [])) if (r.hit(ball.x - 8, ball.y - 8, 16, 16, ...w)) { const [wx, wy, ww, wh] = w; const cx = Math.max(wx, Math.min(ball.x, wx + ww)), cy = Math.max(wy, Math.min(ball.y, wy + wh)); const dx = ball.x - cx, dy = ball.y - cy; if (Math.abs(dx) > Math.abs(dy)) { ball.vx = Math.sign(dx || 1) * Math.abs(ball.vx) * .8; ball.x = cx + Math.sign(dx || 1) * 9; } else { ball.vy = Math.sign(dy || 1) * Math.abs(ball.vy) * .8; ball.y = cy + Math.sign(dy || 1) * 9; } r.sfx('tick'); }
        for (const [bx, by] of (h.bumpers || [])) { const dd = r.dist(ball.x, ball.y, bx, by); if (dd < 26) { const nx = (ball.x - bx) / dd, ny = (ball.y - by) / dd; const sp = Math.max(220, Math.hypot(ball.vx, ball.vy) * 1.1); ball.vx = nx * sp; ball.vy = ny * sp; ball.x = bx + nx * 27; ball.y = by + ny * 27; r.addScore(5); r.pop('+5', bx, by - 30, '#fff', 14); r.sparkle(bx, by, 16, 3); r.sfx('bell'); } }
        if (h.mill) { const [mx, my, ml] = h.mill; for (const a of [millA, millA + Math.PI / 2]) { const ex = Math.cos(a) * ml, ey = Math.sin(a) * ml; const x1 = mx - ex, y1 = my - ey, x2 = mx + ex, y2 = my + ey; const ddx = x2 - x1, ddy = y2 - y1, l2 = ddx * ddx + ddy * ddy; let t = ((ball.x - x1) * ddx + (ball.y - y1) * ddy) / l2; t = Math.max(0, Math.min(1, t)); const cx = x1 + ddx * t, cy = y1 + ddy * t; const dd = r.dist(ball.x, ball.y, cx, cy); if (dd < 13) { const nx = (ball.x - cx) / (dd || 1), ny = (ball.y - cy) / (dd || 1); ball.x = cx + nx * 13; ball.y = cy + ny * 13; const sp = Math.max(160, Math.hypot(ball.vx, ball.vy)); ball.vx = nx * sp; ball.vy = ny * sp; r.sfx('wood'); } } }
        for (const wtr of (h.water || [])) if (inRect(ball.x, ball.y, wtr)) { r.burst(ball.x, ball.y, '#38bdf8', 14, 160); r.pop('פלופ! למים 💦', ball.x, ball.y - 30, '#fff', 20); r.sfx('pop'); strokes++; ball = { x: last.x, y: last.y, vx: 0, vy: 0 }; }
        if (!moving() && strokes >= h.par + 3) { const res = fail('יותר מדי חבטות.'); if (res !== undefined) return res; return; }
        if (r.dist(ball.x, ball.y, h.hole[0], h.hole[1]) < 13 && Math.hypot(ball.vx, ball.vy) < 300) { const pts = Math.max(10, (h.par + 2 - strokes) * 25); r.addScore(pts); msg = strokes === 1 ? 'הול אין וואן! 🤩' : strokes <= h.par - 1 ? 'בירדי! 🐦' : strokes === h.par ? 'פאר 👌' : `בגומה ב-${strokes}`; msgT = 1.5; r.pop('+' + pts, h.hole[0], h.hole[1] - 30, '#fff', 26); r.burst(h.hole[0], h.hole[1], '#FDE047', 16); r.sparkle(h.hole[0], h.hole[1], 30, 8); r.sfx(strokes === 1 ? 'win' : 'score'); ball.vx = ball.vy = 0; ball.x = h.hole[0]; ball.y = h.hole[1]; sinkT = 1; } },
      draw() { const c = r.ctx, h = L(); r.clear('#15803d'); for (let i = 0; i < 12; i++) r.rect(0, i * 48, W, 24, 'rgba(255,255,255,.05)'); for (let i = 0; i < 60; i++) { const gx = (i * 61) % W, gy = (i * 37) % H; c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx, gy + 5); c.lineTo(gx + 2, gy); c.stroke(); }
        r.rect(0, 0, W, 8, '#78350f'); r.rect(0, H - 8, W, 8, '#78350f'); r.rect(0, 0, 8, H, '#78350f'); r.rect(W - 8, 0, 8, H, '#78350f');
        (h.sand || []).forEach(([sx, sy, sr]) => { r.circle(sx, sy, sr, '#fde68a'); r.circle(sx - sr * .3, sy - sr * .3, sr * .4, '#fef3c7'); }); (h.water || []).forEach(([wx, wy, ww, wh]) => { r.rect(wx, wy, ww, wh, '#0ea5e9', 10); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; for (let j = 0; j < 2; j++) { c.beginPath(); for (let x = wx + 6; x < wx + ww - 6; x += 6) c.lineTo(x, wy + wh * (.35 + j * .3) + Math.sin((x + tt * 40) / 12 + j) * 3); c.stroke(); } });
        (h.walls || []).forEach(([wx, wy, ww, wh]) => { r.rect(wx + 2, wy + 3, ww, wh, 'rgba(0,0,0,.3)', 4); r.rect(wx, wy, ww, wh, '#92400e', 4); r.rect(wx + 2, wy + 2, ww - 4, 3, '#b45309', 1); });
        (h.bumpers || []).forEach(([bx, by]) => { r.circle(bx, by + 3, 20, 'rgba(0,0,0,.3)'); r.circle(bx, by, 20, '#ef4444'); r.circle(bx, by, 13, '#f87171'); r.circle(bx - 5, by - 6, 4, '#fff'); });
        if (h.mill) { const [mx, my, ml] = h.mill; r.circle(mx, my, 14, '#78350f'); c.strokeStyle = '#a16207'; c.lineWidth = 10; c.lineCap = 'round'; for (const a of [millA, millA + Math.PI / 2]) { c.beginPath(); c.moveTo(mx - Math.cos(a) * ml, my - Math.sin(a) * ml); c.lineTo(mx + Math.cos(a) * ml, my + Math.sin(a) * ml); c.stroke(); } c.strokeStyle = '#fde68a'; c.lineWidth = 3; for (const a of [millA, millA + Math.PI / 2]) { c.beginPath(); c.moveTo(mx - Math.cos(a) * ml * .9, my - Math.sin(a) * ml * .9); c.lineTo(mx + Math.cos(a) * ml * .9, my + Math.sin(a) * ml * .9); c.stroke(); } r.circle(mx, my, 6, '#fde68a'); }
        r.circle(h.hole[0], h.hole[1], 15, '#052e16'); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(h.hole[0], h.hole[1], 15, 0, Math.PI * 2); c.stroke(); SP.flag(r, h.hole[0] + 12, h.hole[1]);
        d.drawAim(); if (sinkT <= 0 || sinkT > .6) { r.circle(ball.x + 2, ball.y + 3, 8, 'rgba(0,0,0,.25)'); r.circle(ball.x, ball.y, 8, '#fff'); r.circle(ball.x - 3, ball.y - 3, 2.5, 'rgba(0,0,0,.12)'); }
        r.text(`גומה ${(level - 1) % 9 + 1} · פאר ${h.par} · חבטות ${strokes} · ${'❤️'.repeat(Math.max(0, lives))}`, W / 2, 24, { size: 14, color: '#fff' }); if (msgT > 0) r.text(msg, W / 2, H / 2, { size: 28, color: '#fff' }); },
    };
  } });

// ---- באולינג: מסלול בפרספקטיבה עם מרזבים, כדור עם עיקול (החלקה עקומה), פינים שמפילים זה את זה, 10 פריימים עם סטרייק/ספייר, 3 מרזבים = נפסלת, המשחקים נשמרים ----
sport.push({ id: 'bowling', name: 'באולינג', emoji: '🎳',
  how: 'מחליקים את הכדור למעלה לעבר הפינים. חזק = מהיר, החלקה בזווית = הכדור מתעקל. כדור במרזב = 0. 10 פריימים, 2 גלגולים בכל אחד: סטרייק = +10, ספייר = +5. 3 מרזבים = נפסלת. משחק שלם = רמה הבאה (המסלול מהיר יותר).',
  make(r, progress) {
    const W = r.W, H = r.H, TOP = 90, BOT = H - 70; const laneW = y => 150 + (BOT - y) / (BOT - TOP) * 110; /* רחב למטה, צר למעלה */ const laneL = y => W / 2 - laneW(y) / 2, laneR = y => W / 2 + laneW(y) / 2;
    let level = Math.max(1, (progress && progress.level) || 1), pins = [], ball = null, cool = 0, frame = 1, roll = 1, frameHits = 0, gutters = 0, msg = '', msgT = 0, games = 0, tt = 0, lastStrike = false, lastSpare = false, results = [];
    const setPins = (keep = false) => { if (keep) return; pins = []; [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3]].forEach((row, j) => row.forEach(i => pins.push({ x: W / 2 + i * 15, y: TOP + 48 - j * 16, up: true, vx: 0, vy: 0, rot: 0 }))); };
    setPins();
    return {
      save() { return { level }; }, revive() { gutters = 0; msg = ''; },
      peek() { return { pins, ball, frame, roll, canRoll: !ball && cool <= 0, W, BOT }; },
      swipe(d, dx, dy) { if (ball || cool > 0 || dy >= 0) return; const len = Math.hypot(dx, dy); ball = { x: W / 2 + r.clamp(dx * 1.5, -110, 110), y: BOT, vx: dx / len * 140, vy: -Math.max(420, Math.min(760, len * 4)), curve: r.clamp(dx / 40, -1, 1) * (1 + level * .15), t: 0 }; r.sfx('wood'); },
      update(dt) { tt += dt; msgT -= dt; pins.forEach(p => { if (!p.up) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92; p.rot += p.vx * dt * .05; } });
        if (cool > 0) { cool -= dt; if (cool <= 0) { const down = pins.filter(p => !p.up).length; const gained = down - frameHits; frameHits = down;
            if (roll === 1 && down === 10) { r.addScore(10); msg = 'סטרייק! 🎳'; r.burst(W / 2, TOP + 30, '#FDE047', 30, 300); r.sparkle(W / 2, TOP + 30, 60, 14); r.sfx('win'); results.push('X'); frame++; roll = 1; frameHits = 0; setPins(); }
            else if (roll === 2 && down === 10) { r.addScore(5); msg = 'ספייר! ✨'; r.sparkle(W / 2, TOP + 30, 40, 8); r.sfx('score'); results.push('/'); frame++; roll = 1; frameHits = 0; setPins(); }
            else if (roll === 1) { msg = gained ? `${gained} פינים` : 'אף פין...'; roll = 2; }
            else { msg = `${down} מ-10`; results.push(String(down)); frame++; roll = 1; frameHits = 0; setPins(); }
            if (frame > 10) { games++; level++; frame = 1; results = []; r.win(`סיימת משחק! רמה ${level}`, 30); } } return; }
        if (!ball) return; ball.t += dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx += ball.curve * 90 * dt; /* עיקול */
        if (ball.x < laneL(ball.y) + 8 || ball.x > laneR(ball.y) - 8) { if (!ball.gutter) { ball.gutter = true; ball.vx = 0; ball.x = ball.x < W / 2 ? laneL(ball.y) - 4 : laneR(ball.y) + 4; gutters++; r.pop('מרזב! 😬', W / 2, H / 2, '#f87171', 24); r.sfx('over'); if (gutters >= 3) return r.over('3 כדורים במרזב'); } else ball.x = ball.x < W / 2 ? laneL(ball.y) - 4 : laneR(ball.y) + 4; }
        if (!ball.gutter) for (const p of pins) if (p.up && r.dist(ball.x, ball.y, p.x, p.y) < 17) { p.up = false; p.vx = (p.x - ball.x) * 10 + ball.vx * .4 + r.rnd(-30, 30); p.vy = -160 + ball.vy * .25; r.addScore(2); r.sfx('hit'); r.puff(p.x, p.y, 12, 2); }
        for (const p of pins) if (!p.up && (Math.abs(p.vx) + Math.abs(p.vy) > 40)) for (const q of pins) if (q.up && r.dist(p.x, p.y, q.x, q.y) < 18) { q.up = false; q.vx = (q.x - p.x) * 8 + p.vx * .5; q.vy = p.vy * .6 - 60; r.addScore(2); r.sfx('wood'); }
        if (ball.y < TOP - 30) { ball = null; cool = 1.2; } },
      draw() { const c = r.ctx; r.clear('#3b1d0e'); /* מסלול בפרספקטיבה */ c.fillStyle = '#1f2937'; c.beginPath(); c.moveTo(laneL(BOT) - 24, BOT + 40); c.lineTo(laneL(TOP) - 12, TOP - 40); c.lineTo(laneR(TOP) + 12, TOP - 40); c.lineTo(laneR(BOT) + 24, BOT + 40); c.closePath(); c.fill();
        const lg = c.createLinearGradient(0, TOP, 0, BOT); lg.addColorStop(0, '#c9975b'); lg.addColorStop(1, '#e7c08a'); c.fillStyle = lg; c.beginPath(); c.moveTo(laneL(BOT), BOT + 40); c.lineTo(laneL(TOP), TOP - 40); c.lineTo(laneR(TOP), TOP - 40); c.lineTo(laneR(BOT), BOT + 40); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(120,53,15,.35)'; c.lineWidth = 1; for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(laneL(BOT) + laneW(BOT) * i / 8, BOT + 40); c.lineTo(laneL(TOP) + laneW(TOP) * i / 8, TOP - 40); c.stroke(); } for (let i = 0; i < 7; i++) { const ay = BOT - 60 - i * 6, ax = W / 2 + (i - 3) * 14; c.fillStyle = '#7c2d12'; c.beginPath(); c.moveTo(ax, ay - 6); c.lineTo(ax + 4, ay); c.lineTo(ax - 4, ay); c.fill(); } /* חיצי כיוון */
        r.rect(0, TOP - 40, W, 24, '#0f172a'); r.rect(0, TOP - 40, W, 3, '#facc15');
        pins.forEach(p => { if (p.up) SP.pin(r, p.x, p.y); else if (p.y > TOP - 60) { c.save(); c.translate(p.x, p.y); c.rotate(1.3 + p.rot); SP.pin(r, 0, 0); c.restore(); } });
        if (ball) { const sc = .55 + (ball.y - TOP) / (BOT - TOP) * .45; r.circle(ball.x, ball.y + 4, 15 * sc, 'rgba(0,0,0,.25)'); if (!r.img('puzzle/ballBlue_01', ball.x, ball.y, 30 * sc, 30 * sc, { rot: ball.t * 6 })) r.circle(ball.x, ball.y, 14 * sc, '#1D4ED8'); } else if (cool <= 0) { r.circle(W / 2, BOT + 4, 15, 'rgba(0,0,0,.25)'); if (!r.img('puzzle/ballBlue_01', W / 2, BOT, 30, 30)) r.circle(W / 2, BOT, 14, '#1D4ED8'); }
        /* לוח פריימים */ for (let i = 0; i < 10; i++) { const fx = 12 + i * 33.6, on = i + 1 === frame; r.rect(fx, 8, 30, 24, on ? '#facc15' : 'rgba(255,255,255,.12)', 4); r.text(results[i] || String(i + 1), fx + 15, 21, { size: 12, color: on ? '#1B1740' : '#fde68a' }); }
        r.text(msgT > 0 || msg ? msg : `פריים ${frame} · גלגול ${roll} · רמה ${level} · מרזבים ${gutters}/3`, W / 2, H - 20, { size: 15, color: '#fff' }); if (!ball && cool <= 0) r.text('החלק למעלה ↑', W / 2, H - 42, { size: 13, color: '#fde68a' }); },
    };
  } });

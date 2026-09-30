// מקבץ 4 (29/09): הקפצת כדור (היה הלוליין), יורה בועות, כדורסל, מיני גולף, באולינג. שופרו מראש: מראה (ספרייטים של Kenney), רעיונות ממשחקים דומים, חוקי פסילה, רמות, שמירת התקדמות, peek להדגמה.
import { POSE, S as SP, KITS } from './sprites.js';
import { layer3d } from './layer3d.js';
import { loadCharacter, KITS3D, lights } from '../char3d.js';
import { sky, court, basketBallMesh, ballShadow, SHOT, pose } from './celebrate3d.js';
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
        /* משגר (רועי: "תוריד את האיש, תשפר את מראה התותח"): קנה מתכתי מחודד עם גרדיאנט וטבעת לוע, מסתובב לכיוון, רתע; טבעת כרום זוהרת שבה יושבת הבועה; בסיס עם פס ניאון */
        { const bx = SHOOT.x, by = SHOOT.y; c.save(); c.translate(bx, by); c.rotate(barrel); const rc2 = 12 * recoil;
          const bg2 = c.createLinearGradient(0, -14, 0, 14); bg2.addColorStop(0, '#94a3b8'); bg2.addColorStop(.5, '#e2e8f0'); bg2.addColorStop(1, '#475569'); c.fillStyle = bg2; c.beginPath(); c.moveTo(18 - rc2, -11); c.lineTo(62 - rc2, -15); c.lineTo(62 - rc2, 15); c.lineTo(18 - rc2, 11); c.closePath(); c.fill();
          c.fillStyle = '#1e293b'; c.beginPath(); c.roundRect(58 - rc2, -18, 10, 36, 4); c.fill(); c.fillStyle = BALL_COL[cur]; c.globalAlpha = .6; c.beginPath(); c.roundRect(60 - rc2, -13, 4, 26, 2); c.fill(); c.globalAlpha = 1; c.restore();
          const ring = c.createRadialGradient(bx - 8, by - 8, 6, bx, by, 34); ring.addColorStop(0, '#f8fafc'); ring.addColorStop(.6, '#94a3b8'); ring.addColorStop(1, '#334155'); c.save(); c.shadowColor = BALL_COL[cur]; c.shadowBlur = 18; c.fillStyle = ring; c.beginPath(); c.arc(bx, by, 32, 0, Math.PI * 2); c.fill(); c.restore();
          c.fillStyle = '#0f172a'; c.beginPath(); c.arc(bx, by, 24, 0, Math.PI * 2); c.fill();
          const base = c.createLinearGradient(0, r.H - 30, 0, r.H); base.addColorStop(0, '#334155'); base.addColorStop(1, '#0f172a'); c.fillStyle = base; c.beginPath(); c.roundRect(bx - 70, r.H - 30, 140, 30, [14, 14, 0, 0]); c.fill(); c.fillStyle = BALL_COL[cur]; c.globalAlpha = .8; c.beginPath(); c.roundRect(bx - 56, r.H - 27, 112, 3, 2); c.fill(); c.globalAlpha = 1; }
        if (shot) { if (!r.img(BALLS[cur], shot.x, shot.y, S - 3, S - 3)) r.circle(shot.x, shot.y, S / 2 - 2, BALL_COL[cur]); } else if (!r.img(BALLS[cur], SHOOT.x, SHOOT.y, S - 3, S - 3)) r.circle(SHOOT.x, SHOOT.y, S / 2 - 2, BALL_COL[cur]);
        r.circle(NEXT.x, NEXT.y, 22, 'rgba(255,255,255,.12)'); if (!r.img(BALLS[next], NEXT.x, NEXT.y, 24, 24)) r.circle(NEXT.x, NEXT.y, 11, BALL_COL[next]); r.text('הבא', NEXT.x, NEXT.y - 28, { size: 11, color: '#c4b5fd' });
        r.text(`רמה ${level} · ${'❤️'.repeat(Math.max(0, lives))} · עוד ${6 - shots % 6} לירידת התקרה`, 90, r.H - 14, { size: 12, color: '#c4b5fd' }); },
    };
  } });

// ---- כדורסל: מגרש עם פרקט, לוח וסל עם רשת שרוקדת, כדור תלת-ממדי מסתובב, סוויש, רצף = כדור בוער, סל שזז מרמה 2, 5 החטאות = נפסלת, הרמה נשמרת ----
sport.push({ id: 'basketball', name: 'כדורסל', emoji: '🏀',
  how: 'הקשת זזה עם מד הכוח: נוגעים כשהיא עוברת בסל. ירוק = קולעים בטוח, קרוב לירוק = לפעמים, רחוק = פספוס. סוויש = 30, עם ברזל = 20, מושלם = בונוס. 3 ברצף = הכדור בוער 🔥. מרמה 2 זורקים מרחוק יותר ומזוויות אחרות, והמד מהיר יותר. 5 החטאות = נפסלת. הרמה נשמרת.',
  /* תלת-ממד (רועי 30/09: "שזה יהיה בתלת-ממד המשחק", "אם אתה בירוק קולעים, קרוב = הגרלה"): אותו מגרש, דמות וכדור כמו בחגיגות (celebrate3d/char3d) על שכבת WebGL מאחורי הקנבס (layer3d),
     הפיזיקה בעולם (94 יח' = מטר, כבידה 920), הממשק (מד, קשת, טקסט) דו-ממדי מעל. המכניקה לפי Basketball Orbit: לחיצה אחת כשהקשת בסל */
  make(r, progress) {
    const L = layer3d(r); const { sc, cam, THREE } = L; const HZ = -420, RIM_R = 22, BALL_R = 14, G = 920, ANG = 55 * Math.PI / 180, V0 = 520, V1 = 700;
    let level = Math.max(1, (progress && progress.level) || 1), streak = 0, misses = 0, baskets = 0, tt = 0, fire = false, ph = 0, dir = 1, waitT = 0, perfect = false, shotT = -1;
    let w = null, hero = null, ballM = null, shadow = null, ready = false;
    try { sky(sc, '#111827', '#1f2937', false); w = court(sc, HZ); ballM = basketBallMesh(BALL_R); sc.add(ballM); shadow = ballShadow(sc); ready = true; } catch (e) { console.warn('bball3d court', e); }
    if (ready) loadCharacter(KITS3D.maccabi).then(ch => { hero = ch; sc.add(ch.model); }).catch(e => console.warn('bball3d char', e));
    const rim = new THREE.Vector3(0, 290, HZ + 14);
    /* עמדת הזורק: מרחק וזווית לפי הרמה (רמה 1 = 4.8 מ' מול הסל; מרמה 2 רחוק יותר ובאלכסון) */
    let SX = 0, SZ = 0; const place = () => { const dist = Math.min(640, 450 + (level - 1) * 60), a = level >= 2 ? r.pick([-1, 1]) * r.rnd(.25, .8) : 0; SX = Math.sin(a) * dist; SZ = rim.z + Math.cos(a) * dist; };
    place();
    const faceRim = () => Math.atan2(rim.x - SX, rim.z - SZ);
    const hand = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();
    const handPos = () => { if (hero && !ball.fly) { hero.rig.b.LeftHand.getWorldPosition(hl); hero.rig.b.RightHand.getWorldPosition(hr); hand.lerpVectors(hl, hr, .5); hand.y += 8; } else hand.set(SX, 150, SZ); return hand; };
    const rel = new THREE.Vector3(); const relPt = () => { const fr = faceRim(); return rel.set(SX + Math.sin(fr) * 22, 206, SZ + Math.cos(fr) * 22); }; /* נקודת השחרור: מעל הראש, מעט קדימה */
    const REL_T = .62; let pending = null; /* הכוח שנבחר בנגיעה; השיגור קורה בשיא תנועת הזריקה */
    const ball = { p: new THREE.Vector3(), v: new THREE.Vector3(), fly: false, rimHit: false, scored: false, bounces: 0, rot: 0 };
    const speedFor = p => V0 + p * V1;
    const idealP = () => { const h = relPt(); const dx = Math.hypot(rim.x - h.x, rim.z - h.z), up = rim.y - h.y, den = 2 * Math.cos(ANG) ** 2 * (dx * Math.tan(ANG) - up); if (den <= 0) return 1; return r.clamp((Math.sqrt(G * dx * dx / den) - V0) / V1, 0, 1); };
    const launch = (p, out) => { const h = relPt(); const dx = rim.x - h.x, dz = rim.z - h.z, d = Math.hypot(dx, dz) || 1, v = speedFor(p); out.p.copy(h); out.v.set(dx / d * v * Math.cos(ANG), v * Math.sin(ANG), dz / d * v * Math.cos(ANG)); };
    const arc = p => { const o = { p: new THREE.Vector3(), v: new THREE.Vector3() }; launch(p, o); const pts = []; for (let i = 0; i < 44; i++) { o.v.y -= G * .04; o.p.addScaledVector(o.v, .04); pts.push(L.project(o.p.x, o.p.y, o.p.z)); if (o.p.y < 0) break; } return pts; };
    const shoot = () => { if (ball.fly || waitT > 0 || pending) return; const ideal = idealP(), diff = Math.abs(ph - ideal); let p = ph; perfect = diff < .05;
      if (perfect) p = ideal; /* ירוק = קולעים */ else if (diff < .11 && Math.random() < .5) p = ideal; /* קרוב לירוק = הגרלה */
      pending = { p }; shotT = 0; /* הדמות יורדת, עולה, ומשחררת בשיא (REL_T) */ if (perfect) { const [px, py] = L.project(SX, 190, SZ); r.pop('מושלם!', px, py - 30, r.C.gold, 20); } };
    const miss = () => { misses++; streak = 0; fire = false; r.sfx('ohh'); if (misses >= 5) return r.over('5 החטאות'); r.pop(`החטאה ${misses}/5`, r.W / 2, 120, '#f87171', 18); waitT = .8; };
    const meterSpeed = () => .55 + Math.min(.6, (level - 1) * .12);
    const rimProj = () => L.project(rim.x, rim.y, rim.z);
    return {
      tap: shoot, down() {}, up() {},
      save() { return { level }; }, revive() { misses = 0; waitT = .3; },
      dispose() { L.dispose(); },
      peek() { return { canShoot: !ball.fly && waitT <= 0 && !pending, p: ph, ideal: idealP() }; },
      update(dt) { tt += dt;
        /* מצלמה מעל הכתף מאחור-מהצד של הזורק, רואים גם את הסל */ const fr = faceRim(); /* מעל הכתף: מאחור (400) ומהצד (260) כדי שהכדור בידיים ייראה */ cam.position.set(SX - Math.sin(fr) * 400 + Math.cos(fr) * 260, 280, SZ - Math.cos(fr) * 400 - Math.sin(fr) * 260); cam.lookAt(rim.x * .55 + SX * .45, 200, rim.z * .55 + SZ * .45);
        if (w) w.fans.update(tt, streak > 0 && tt % 1 < .5 && ball.scored);
        if (pending && shotT >= REL_T) { launch(pending.p, ball); pending = null; ball.fly = true; ball.rimHit = false; ball.scored = false; ball.bounces = 0; r.sfx('jump'); }
        if (waitT > 0) { waitT -= dt; if (waitT <= 0) { place(); ball.fly = false; shotT = -1; pending = null; } }
        else if (!ball.fly && !pending) { ph += dir * meterSpeed() * 2 * dt; if (ph > 1) { ph = 1; dir = -1; } if (ph < 0) { ph = 0; dir = 1; } }
        if (ball.fly) { shotT += dt; ball.v.y -= G * dt; const py = ball.p.y; ball.p.addScaledVector(ball.v, dt); ball.rot += dt * 6;
          /* לוח */ if (ball.p.z - BALL_R < HZ - 17 && ball.v.z < 0 && Math.abs(ball.p.x - rim.x) < 85 && ball.p.y > rim.y - 20 && ball.p.y < rim.y + 85) { ball.p.z = HZ - 17 + BALL_R; ball.v.z = -ball.v.z * .6; ball.rimHit = true; r.sfx('wood'); }
          /* טבעת */ if (ball.v.y < 0 && py >= rim.y && ball.p.y < rim.y) { const d = Math.hypot(ball.p.x - rim.x, ball.p.z - rim.z); if (d < RIM_R - 6 && !ball.scored) { ball.scored = true; streak++; baskets++; if (w) w.shake(1); const swish = !ball.rimHit; const pts = (swish ? 30 : 20) + Math.min(streak - 1, 3) * 5 + (fire ? 10 : 0) + (perfect ? 10 : 0); r.addScore(pts); const [px, py2] = rimProj(); r.pop(swish ? `סוויש! +${pts}` : `+${pts}`, px, py2 - 50, '#FDE047', 26); r.burst(px, py2, '#F97316', 18); r.sparkle(px, py2, 30, swish ? 10 : 4); r.sfx(swish ? 'score' : 'bounce'); if (streak >= 3 && !fire) { fire = true; r.pop('הכדור בוער! 🔥', r.W / 2, 100, '#f97316', 24); r.sfx('roar'); } if (baskets % 5 === 0) { level++; r.pop(`רמה ${level}! רחוק יותר, מד מהיר יותר`, r.W / 2, 160, r.C.gold, 22); r.sfx('levelup'); } ball.v.multiplyScalar(.25); waitT = 1.1; }
            else if (d < RIM_R + BALL_R && d >= RIM_R - 6) { const nx = (ball.p.x - rim.x) / (d || 1), nz = (ball.p.z - rim.z) / (d || 1); ball.p.y = rim.y + 1; ball.v.y = -ball.v.y * .45; ball.v.x += nx * 180; ball.v.z += nz * 180; ball.rimHit = true; r.sfx('metal'); } }
          /* רצפה */ if (ball.p.y < BALL_R && ball.v.y < 0) { ball.p.y = BALL_R; ball.v.y = -ball.v.y * .55; ball.v.x *= .8; ball.v.z *= .8; ball.bounces++; const [px, py2] = L.project(ball.p.x, 0, ball.p.z); r.puff(px, py2, 14, 2); r.sfx('bounce'); if (!ball.scored && (ball.bounces >= 3 || Math.abs(ball.v.y) < 60)) { const res = miss(); if (res !== undefined) return res; } }
          if (ball.p.z > SZ + 400 || Math.abs(ball.p.x) > 1200 || ball.p.z < HZ - 600) { if (!ball.scored) { const res = miss(); if (res !== undefined) return res; } else waitT = .3; }
          if (fire && Math.random() < .5) { const [px, py2] = L.project(ball.p.x, ball.p.y, ball.p.z); r.explode(px, py2 + 6, 12, 1); } }
        /* הדמות: אחיזה נמוכה בזמן הכיוון; בזריקה ירידה → שחרור → מעקב → נחיתה */
        /* כמו בחגיגת השלוש: אחיזה במותן → ירידה → עלייה ושחרור מעל הראש → מעקב → נחיתה */
        if (hero) { hero.model.rotation.y = fr; const pos = new THREE.Vector3(SX, 0, SZ); let tp = SHOT.hold, sp = 6; if (shotT >= 0) { if (shotT < .3) { tp = SHOT.dip; sp = 12; } else if (shotT < REL_T + .12) { tp = SHOT.release; pos.y = Math.max(0, Math.sin((shotT - .3) / .5 * Math.PI)) * 26; sp = 16; } else if (shotT < 1.15) { tp = SHOT.follow; pos.y = Math.max(0, Math.sin((shotT - .3) / .5 * Math.PI)) * 26; } else tp = SHOT.land; } pose(hero, tp, false, pos, dt, sp); }
        if (ballM) { if (!ball.fly) { const h = handPos(); ballM.position.copy(h); ballM.position.x += Math.sin(fr) * 12; ballM.position.z += Math.cos(fr) * 12; } else { ballM.position.copy(ball.p); ballM.rotation.x = ball.rot; } if (shadow) shadow(ballM); }
        L.render(); },
      draw() { const c = r.ctx; c.clearRect(0, 0, r.W, r.H);
        if (!L.ok) { /* בלי WebGL: רקע פשוט וצורות במקום הסצנה */ const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#4c1d95'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); const [rx, ry] = rimProj(); c.strokeStyle = '#f97316'; c.lineWidth = 5; c.beginPath(); c.ellipse(rx, ry, 24, 7, 0, 0, Math.PI * 2); c.stroke(); const bp = ball.fly ? ball.p : handPos(); const [bx, by] = L.project(bp.x, bp.y, bp.z); SP.basketBall(r, bx, by, 14, ball.rot); }
        /* קשת תצוגה מקדימה + מד כוח */ if (!ball.fly && waitT <= 0 && !pending) { const ideal = idealP(), diff = Math.abs(ph - ideal), good = diff < .05, near = diff < .11; const col = good ? '74,222,128' : near ? '250,204,21' : '255,255,255'; arc(ph).forEach(([x, y, z], i) => { if (i % 2 && z < 1) r.circle(x, y, (good ? 4.5 : 3.5) * (1.2 - i * .012), `rgba(${col},${.95 - i * .018})`); });
          /* מד: מסילה מעוגלת עם גרדיאנט, אזור ירוק זוהר, ידית עגולה עם הילה, וסימון "חזק/חלש" */ const MX = 26, MY = r.H - 340, MH = 180, MW = 22; c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8; r.rect(MX - MW / 2, MY, MW, MH, 'rgba(15,23,42,.85)', MW / 2); c.restore(); const tg = c.createLinearGradient(0, MY, 0, MY + MH); tg.addColorStop(0, 'rgba(239,68,68,.55)'); tg.addColorStop(.5, 'rgba(250,204,21,.35)'); tg.addColorStop(1, 'rgba(56,189,248,.45)'); c.fillStyle = tg; c.beginPath(); c.roundRect(MX - MW / 2 + 4, MY + 4, MW - 8, MH - 8, (MW - 8) / 2); c.fill();
          const zy = MY + MH * (1 - Math.min(1, ideal + .05)), zh = MH * .1; c.save(); c.shadowColor = '#4ade80'; c.shadowBlur = 14; r.rect(MX - MW / 2 + 2, zy, MW - 4, zh, '#4ade80', 5); c.restore(); r.rect(MX - MW / 2 + 5, MY + MH * (1 - Math.min(1, ideal + .11)), MW - 10, MH * .22, 'rgba(250,204,21,.28)', 4);
          const ky = MY + MH * (1 - ph); c.save(); c.shadowColor = good ? '#4ade80' : near ? '#facc15' : '#fff'; c.shadowBlur = 12; r.circle(MX, ky, 10, '#fff'); c.restore(); r.circle(MX, ky, 6, good ? '#4ade80' : near ? '#facc15' : '#94a3b8'); r.text('כוח', MX, MY - 14, { size: 13, color: '#fff' }); r.text('חזק', MX + 26, MY + 10, { size: 10, color: '#fca5a5' }); r.text('חלש', MX + 26, MY + MH - 6, { size: 10, color: '#bae6fd' }); }
        r.text(`רמה ${level} · סלים ${baskets} · החטאות ${misses}/5${streak > 1 ? ` · רצף ${streak}${fire ? ' 🔥' : ''}` : ''}`, r.W / 2, 22, { size: 14, color: '#fff' }); },
    };
  } });

// ---- מיני גולף: 9 גומות מתוכננות (קירות, חול, מים, טחנת רוח מסתובבת, במפרים), פאר לכל גומה, מגבלת חבטות = חיים, 3 חיים, הגומה נשמרת ----
sport.push({ id: 'golf', name: 'מיני גולף', emoji: '⛳',
  how: 'שתי נגיעות: החץ מסתובב סביב הכדור, נוגעים כשהוא מכוון. אז מד הכוח עולה ויורד, נוגעים. 9 גומות: קירות, חול שמאט, מים שמחזירים (+חבטה), טחנת רוח, במפרים (+5). לכל גומה פאר ומכסה חבטות (פאר+3): נגמרו החבטות = ❤️ אחד ועוברים לגומה הבאה. 3 ❤️ = נפסלת. סיימת 9 גומות = סבב חדש, מהיר יותר. הגומה נשמרת.',
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
    let level = Math.max(1, (progress && progress.level) || 1), lives = 3, strokes = 0, ball, last, msg = '', msgT = 2, tt = 0, millA = 0, sinkT = 0;
    const L = () => HOLES[(level - 1) % HOLES.length];
    const setup = () => { const h = L(); ball = { x: h.start[0], y: h.start[1], vx: 0, vy: 0 }; last = { x: ball.x, y: ball.y }; strokes = 0; };
    setup();
    const moving = () => Math.hypot(ball.vx, ball.vy) > 6;
    /* שתי נגיעות (רועי 30/09: "קשה לכוון ולמשוך, אין מקום למשוך"; שיטת השלוש נגיעות שנבחרה בבאולינג): החץ מסתובב סביב הכדור, נגיעה = כיוון; מד כוח, נגיעה = חבטה */
    let gstep = 'aim', aimA = -Math.PI / 2, pw = 0, pwDir = 1;
    const hit = () => { const v = 160 + pw * 560; ball.vx = Math.cos(aimA) * v; ball.vy = Math.sin(aimA) * v; strokes++; last = { x: ball.x, y: ball.y }; r.sfx('wood'); r.puff(ball.x, ball.y, 14, 2); gstep = 'aim'; };
    const tapStep = () => { if (moving() || sinkT > 0) return; if (gstep === 'aim') { gstep = 'power'; pw = 0; pwDir = 1; r.sfx('tick'); } else { hit(); } };
    const inRect = (x, y, [rx, ry, rw, rh]) => x > rx && x < rx + rw && y > ry && y < ry + rh;
    const fail = why => { lives--; r.shake(250); r.sfx('over'); if (lives <= 0) return r.over(why + ' נגמרו הלבבות'); r.pop(`${why} נשארו ${lives} ❤️`, W / 2, H / 2, '#fff', 20); level++; setup(); msg = `גומה ${(level - 1) % 9 + 1} · פאר ${L().par}`; msgT = 2; };
    return {
      tap: tapStep, down() {}, up() {},
      save() { return { level }; }, revive() { lives = 3; setup(); },
      peek() { const hh = L().hole; const want = Math.atan2(hh[1] - ball.y, hh[0] - ball.x); let dA = want - aimA; dA = Math.atan2(Math.sin(dA), Math.cos(dA)); const dist = Math.hypot(hh[0] - ball.x, hh[1] - ball.y); return { ball, hole: hh, moving: moving(), par: L().par, strokes, step: gstep, aimGood: Math.abs(dA) < .12, pw, pwGood: Math.abs(pw - r.clamp(dist / 560, .25, .95)) < .08 }; },
      update(dt) { tt += dt; msgT -= dt; millA += dt * (1.6 + Math.floor((level - 1) / 9) * .6); const h = L(); if (!moving() && sinkT <= 0) { if (gstep === 'aim') aimA += dt * 2.4; else { pw += pwDir * 1.5 * dt; if (pw > 1) { pw = 1; pwDir = -1; } if (pw < 0) { pw = 0; pwDir = 1; } } } if (sinkT > 0) { sinkT -= dt; if (sinkT <= 0) { level++; setup(); if ((level - 1) % 9 === 0) { r.pop(`סיימת סבב! רמה ${Math.floor((level - 1) / 9) + 1}: הטחנה מהירה יותר`, W / 2, H / 2, r.C.gold, 22); r.sfx('levelup'); } r.win(`גומה ${(level - 1) % 9 + 1}!`, 0); msg = `גומה ${(level - 1) % 9 + 1} · פאר ${L().par}`; msgT = 2; } return; }
        const inSand = (h.sand || []).some(([sx, sy, sr]) => r.dist(ball.x, ball.y, sx, sy) < sr); const fr = inSand ? 4.5 : 1.3; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= 1 - fr * dt; ball.vy *= 1 - fr * dt;
        if (ball.x < 14) { ball.x = 14; ball.vx = Math.abs(ball.vx) * .8; r.sfx('tick'); } if (ball.x > W - 14) { ball.x = W - 14; ball.vx = -Math.abs(ball.vx) * .8; r.sfx('tick'); } if (ball.y < 14) { ball.y = 14; ball.vy = Math.abs(ball.vy) * .8; r.sfx('tick'); } if (ball.y > H - 14) { ball.y = H - 14; ball.vy = -Math.abs(ball.vy) * .8; r.sfx('tick'); }
        for (const w of (h.walls || [])) if (r.hit(ball.x - 8, ball.y - 8, 16, 16, ...w)) { const [wx, wy, ww, wh] = w; const cx = Math.max(wx, Math.min(ball.x, wx + ww)), cy = Math.max(wy, Math.min(ball.y, wy + wh)); const dx = ball.x - cx, dy = ball.y - cy; if (Math.abs(dx) > Math.abs(dy)) { ball.vx = Math.sign(dx || 1) * Math.abs(ball.vx) * .8; ball.x = cx + Math.sign(dx || 1) * 9; } else { ball.vy = Math.sign(dy || 1) * Math.abs(ball.vy) * .8; ball.y = cy + Math.sign(dy || 1) * 9; } r.sfx('tick'); }
        for (const [bx, by] of (h.bumpers || [])) { const dd = r.dist(ball.x, ball.y, bx, by); if (dd < 26) { const nx = (ball.x - bx) / dd, ny = (ball.y - by) / dd; const sp = Math.max(220, Math.hypot(ball.vx, ball.vy) * 1.1); ball.vx = nx * sp; ball.vy = ny * sp; ball.x = bx + nx * 27; ball.y = by + ny * 27; r.addScore(5); r.pop('+5', bx, by - 30, '#fff', 14); r.sparkle(bx, by, 16, 3); r.sfx('bell'); } }
        if (h.mill) { const [mx, my, ml] = h.mill; for (const a of [millA, millA + Math.PI / 2]) { const ex = Math.cos(a) * ml, ey = Math.sin(a) * ml; const x1 = mx - ex, y1 = my - ey, x2 = mx + ex, y2 = my + ey; const ddx = x2 - x1, ddy = y2 - y1, l2 = ddx * ddx + ddy * ddy; let t = ((ball.x - x1) * ddx + (ball.y - y1) * ddy) / l2; t = Math.max(0, Math.min(1, t)); const cx = x1 + ddx * t, cy = y1 + ddy * t; const dd = r.dist(ball.x, ball.y, cx, cy); if (dd < 13) { const nx = (ball.x - cx) / (dd || 1), ny = (ball.y - cy) / (dd || 1); ball.x = cx + nx * 13; ball.y = cy + ny * 13; const sp = Math.max(160, Math.hypot(ball.vx, ball.vy)); ball.vx = nx * sp; ball.vy = ny * sp; r.sfx('wood'); } } }
        for (const wtr of (h.water || [])) if (inRect(ball.x, ball.y, wtr)) { r.burst(ball.x, ball.y, '#38bdf8', 14, 160); r.pop('פלופ! למים 💦', ball.x, ball.y - 30, '#fff', 20); r.sfx('pop'); strokes++; ball = { x: last.x, y: last.y, vx: 0, vy: 0 }; }
        if (!moving() && strokes >= h.par + 3) { const res = fail('יותר מדי חבטות.'); if (res !== undefined) return res; return; }
        if (r.dist(ball.x, ball.y, h.hole[0], h.hole[1]) < 13 && Math.hypot(ball.vx, ball.vy) < 300) { const pts = Math.max(10, (h.par + 2 - strokes) * 25); r.addScore(pts); msg = strokes === 1 ? 'הול אין וואן! 🤩' : strokes <= h.par - 1 ? 'בירדי! 🐦' : strokes === h.par ? 'פאר 👌' : `בגומה ב-${strokes}`; msgT = 1.5; r.pop('+' + pts, h.hole[0], h.hole[1] - 30, '#fff', 26); r.burst(h.hole[0], h.hole[1], '#FDE047', 16); r.sparkle(h.hole[0], h.hole[1], 30, 8); r.sfx(strokes === 1 ? 'win' : 'score'); ball.vx = ball.vy = 0; ball.x = h.hole[0]; ball.y = h.hole[1]; sinkT = 1; } },
      draw() { const c = r.ctx, h = L(); /* דשא: גרדיאנט ופסי כיסוח אלכסוניים, צללית עדינה בשוליים, גדר עץ */ const gg = c.createLinearGradient(0, 0, 0, H); gg.addColorStop(0, '#22c55e'); gg.addColorStop(1, '#15803d'); c.fillStyle = gg; c.fillRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2); c.rotate(-.35); for (let i = -14; i < 14; i++) if (i % 2) { c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(i * 44, -H, 44, H * 2); } c.restore(); const vg = c.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.25)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
        [[0, 0, W, 10], [0, H - 10, W, 10], [0, 0, 10, H], [W - 10, 0, 10, H]].forEach(([x, y, w2, h2]) => { r.rect(x, y, w2, h2, '#92400e'); r.rect(x + (w2 > h2 ? 0 : 2), y + (w2 > h2 ? 2 : 0), w2 > h2 ? w2 : 3, w2 > h2 ? 3 : h2, '#b45309'); });
        (h.sand || []).forEach(([sx, sy, sr]) => { r.circle(sx, sy, sr, '#fde68a'); r.circle(sx - sr * .3, sy - sr * .3, sr * .4, '#fef3c7'); }); (h.water || []).forEach(([wx, wy, ww, wh]) => { r.rect(wx, wy, ww, wh, '#0ea5e9', 10); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; for (let j = 0; j < 2; j++) { c.beginPath(); for (let x = wx + 6; x < wx + ww - 6; x += 6) c.lineTo(x, wy + wh * (.35 + j * .3) + Math.sin((x + tt * 40) / 12 + j) * 3); c.stroke(); } });
        (h.walls || []).forEach(([wx, wy, ww, wh]) => { r.rect(wx + 2, wy + 3, ww, wh, 'rgba(0,0,0,.3)', 4); r.rect(wx, wy, ww, wh, '#92400e', 4); r.rect(wx + 2, wy + 2, ww - 4, 3, '#b45309', 1); });
        (h.bumpers || []).forEach(([bx, by]) => { r.circle(bx, by + 3, 20, 'rgba(0,0,0,.3)'); r.circle(bx, by, 20, '#ef4444'); r.circle(bx, by, 13, '#f87171'); r.circle(bx - 5, by - 6, 4, '#fff'); });
        if (h.mill) { const [mx, my, ml] = h.mill; r.circle(mx, my, 14, '#78350f'); c.strokeStyle = '#a16207'; c.lineWidth = 10; c.lineCap = 'round'; for (const a of [millA, millA + Math.PI / 2]) { c.beginPath(); c.moveTo(mx - Math.cos(a) * ml, my - Math.sin(a) * ml); c.lineTo(mx + Math.cos(a) * ml, my + Math.sin(a) * ml); c.stroke(); } c.strokeStyle = '#fde68a'; c.lineWidth = 3; for (const a of [millA, millA + Math.PI / 2]) { c.beginPath(); c.moveTo(mx - Math.cos(a) * ml * .9, my - Math.sin(a) * ml * .9); c.lineTo(mx + Math.cos(a) * ml * .9, my + Math.sin(a) * ml * .9); c.stroke(); } r.circle(mx, my, 6, '#fde68a'); }
        r.circle(h.hole[0], h.hole[1], 15, '#052e16'); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(h.hole[0], h.hole[1], 15, 0, Math.PI * 2); c.stroke(); SP.flag(r, h.hole[0] + 12, h.hole[1]);
        if (!moving() && sinkT <= 0) { /* חץ כיוון מסתובב עם נקודות תצוגה מקדימה; במצב כוח: מד לצד הכדור */ const hh = L().hole; const want = Math.atan2(hh[1] - ball.y, hh[0] - ball.x); let dA = want - aimA; dA = Math.atan2(Math.sin(dA), Math.cos(dA)); const good = Math.abs(dA) < .12; const len = gstep === 'aim' ? 90 : 40 + pw * 120; for (let i = 1; i <= 8; i++) { const px = ball.x + Math.cos(aimA) * len * i / 8, py = ball.y + Math.sin(aimA) * len * i / 8; if (px > 8 && px < W - 8 && py > 8 && py < H - 8) r.circle(px, py, 3.5 - i * .25, good || gstep === 'power' ? `rgba(74,222,128,${1 - i * .1})` : `rgba(255,255,255,${.95 - i * .1})`); } c.fillStyle = good ? '#4ade80' : '#fff'; c.save(); c.translate(ball.x + Math.cos(aimA) * (len + 10), ball.y + Math.sin(aimA) * (len + 10)); c.rotate(aimA); c.beginPath(); c.moveTo(8, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.closePath(); c.fill(); c.restore();
          if (gstep === 'power') { const MX = ball.x < W / 2 ? W - 30 : 30, MY = H / 2 - 80, MH = 160; r.rect(MX - 9, MY, 18, MH, 'rgba(0,0,0,.55)', 9); const dist = Math.hypot(hh[0] - ball.x, hh[1] - ball.y), ip = r.clamp(dist / 560, .25, .95); r.rect(MX - 9, MY + MH * (1 - ip - .08), 18, MH * .16, 'rgba(74,222,128,.8)', 4); r.circle(MX, MY + MH * (1 - pw), 9, '#fff'); r.text('כוח', MX, MY - 12, { size: 12, color: '#fff' }); }
          r.text(gstep === 'aim' ? 'נוגעים כשהחץ מכוון' : 'נוגעים לחבטה', W / 2, H - 22, { size: 14, color: '#fff' }); }
        if (sinkT <= 0 || sinkT > .6) { r.circle(ball.x + 2, ball.y + 3, 8, 'rgba(0,0,0,.25)'); r.circle(ball.x, ball.y, 8, '#fff'); r.circle(ball.x - 3, ball.y - 3, 2.5, 'rgba(0,0,0,.12)'); }
        r.text(`גומה ${(level - 1) % 9 + 1} · פאר ${h.par} · חבטות ${strokes}/${h.par + 3} · ${'❤️'.repeat(Math.max(0, lives))}`, W / 2, 24, { size: 14, color: '#fff' }); if (msgT > 0) r.text(msg, W / 2, H / 2, { size: 28, color: '#fff' }); },
    };
  } });

// ---- באולינג: מסלול בפרספקטיבה עם מרזבים, כדור עם עיקול (החלקה עקומה), פינים שמפילים זה את זה, 10 פריימים עם סטרייק/ספייר, 3 מרזבים = נפסלת, המשחקים נשמרים ----
sport.push({ id: 'bowling', name: 'באולינג', emoji: '🎳', cost: 2, /* עולה 2 מתנות: משחק ארוך (10 פריימים; רועי 30/09) */
  how: 'שלוש נגיעות לכל גלגול: 1) איפה לעמוד: הסמן זז, נוגעים לעצור. 2) כוח: המד עולה ויורד, נוגעים. 3) זווית: החץ מתנדנד, נוגעים. הכדור מתגלגל בתלת-ממד ומפיל פינים. 10 פריימים, 2 גלגולים בכל אחד: סטרייק = +10, ספייר = +5. 3 מרזבים = נפסלת. משחק שלם = רמה הבאה. המשחק הזה עולה 2 מתנות כי הוא ארוך.',
  /* תלת-ממד (רועי: "באולינג חובה תלת-ממד; קודם איפה לעמוד, אז עוצמה, אז זווית"): מסלול 18 מ' (1720 יח'), מרזבים, 10 פינים כגלילים, כדור, דמות שמגלגלת; מצלמה מאחורי הכדור שעוקבת אחריו */
  make(r, progress) {
    const L = layer3d(r); const { sc, cam, THREE } = L; const LANE_W = 100, PINZ = -1720, BALL_R = 11, PIN_R = 5.5;
    let level = Math.max(1, (progress && progress.level) || 1), frame = 1, roll = 1, frameHits = 0, gutters = 0, games = 0, tt = 0, mode = 'taps', step = 'pos', sweep = 0, dir = 1, posX = 0, power = .7, angle = 0, ball = null, settle = 0, msg = '', msgT = 0, cool = 0, lastStrike = false, lastSpare = false, swingT = -1, drag = null; /* רועי בחר: שלוש נגיעות (30/09). שיטות 'swipe' ו-'one' נשארו בקוד לשימוש עתידי, בלי מסך בחירה */
    const MODES = [['taps', 'שלוש נגיעות', 'מיקום → כוח → זווית, נגיעה בכל שלב'], ['swipe', 'החלקה', 'גוררים את הכדור קדימה: הכיוון והכוח מהתנועה'], ['one', 'נגיעה אחת', 'מד כוח בלבד, נוגעים כשירוק']]; const MODE_Y = i => 200 + i * 86;
    let pins = [], pinM = [], ballM = null, hero = null, ready = false, laneG = null;
    const PIN_POS = []; [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3]].forEach((row, j) => row.forEach(i => PIN_POS.push([i * 14, PINZ - j * 25])));
    try {
      sc.background = new THREE.Color('#0b0f1a'); sc.fog = new THREE.Fog('#0b0f1a', 1600, 3200); lights(sc, { sun: 1.6, sky: '#dbeafe', ground: '#3b2a12' });
      /* מסלול עץ: טקסטורת פסים */ const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#d6a15c'; g.fillRect(0, 0, 128, 512); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)'; g.fillRect(i * 8, 0, 8, 512); } g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(20 + k * 14, 300); g.lineTo(24 + k * 14, 300); g.lineTo(22 + k * 14, 330); g.fill(); } /* חיצים */
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 4);
      laneG = new THREE.Group(); sc.add(laneG);
      const lane = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 6, 2100), new THREE.MeshStandardMaterial({ map: tex, roughness: .35, metalness: .05 })); lane.position.set(0, -3, PINZ / 2 + 60); lane.receiveShadow = true; laneG.add(lane);
      for (const sx of [-1, 1]) { const gut = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 2100), new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: .8 })); gut.position.set(sx * (LANE_W / 2 + 11), -6, PINZ / 2 + 60); laneG.add(gut); const rail = new THREE.Mesh(new THREE.BoxGeometry(10, 26, 2100), new THREE.MeshStandardMaterial({ color: '#334155' })); rail.position.set(sx * (LANE_W / 2 + 27), 7, PINZ / 2 + 60); laneG.add(rail); for (const dx of [80, 190]) { const other = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 6, 2100), new THREE.MeshStandardMaterial({ color: '#8b5e3c', roughness: .6 })); other.position.set(sx * (LANE_W / 2 + 27 + dx), -3, PINZ / 2 + 60); laneG.add(other); } }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 800), new THREE.MeshStandardMaterial({ color: '#1e1b4b' })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1, 300); laneG.add(floor);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3000, 500, 20), new THREE.MeshStandardMaterial({ color: '#111827' })); back.position.set(0, 250, PINZ - 200); laneG.add(back);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + 60, 90), new THREE.MeshBasicMaterial({ color: '#38bdf8' })); glow.position.set(0, 110, PINZ - 150); laneG.add(glow);
      const foul = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, .5, 3), new THREE.MeshBasicMaterial({ color: '#111' })); foul.position.set(0, .3, 0); laneG.add(foul);
      /* פינים */ const pinGeo = new THREE.CylinderGeometry(3.6, PIN_R, 30, 12), headGeo = new THREE.SphereGeometry(4.2, 12, 10), ringGeo = new THREE.TorusGeometry(3.9, .8, 8, 16), white = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .3 }), red = new THREE.MeshStandardMaterial({ color: '#dc2626' });
      const mkPin = () => { const gp = new THREE.Group(); const body = new THREE.Mesh(pinGeo, white); body.position.y = 15; body.castShadow = true; gp.add(body); const head = new THREE.Mesh(headGeo, white); head.position.y = 32; gp.add(head); const ring = new THREE.Mesh(ringGeo, red); ring.rotation.x = Math.PI / 2; ring.position.y = 22; gp.add(ring); return gp; };
      for (let i = 0; i < 10; i++) { const m = mkPin(); sc.add(m); pinM.push(m); }
      ballM = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 18), new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: .15, metalness: .3 })); ballM.castShadow = true; sc.add(ballM);
      ready = true;
      loadCharacter(KITS3D.maccabi).then(ch => { hero = ch; sc.add(ch.model); }).catch(e => console.warn('bowling char', e));
    } catch (e) { console.warn('bowling3d', e); }
    const BOWL = { hold: { head: [102, 52], neck: [101, 68], hip: [100, 116], le: [106, 98], lh: [114, 116], re: [104, 100], rh: [110, 118], lk: [100, 150], lf: [97, 182], rk: [102, 150], rf: [104, 182] },
      back: { head: [106, 58], neck: [104, 74], hip: [100, 118], le: [108, 96], lh: [116, 112], re: [84, 96], rh: [70, 82], lk: [110, 150], lf: [116, 182], rk: [92, 150], rf: [86, 182] },
      release: { head: [118, 78], neck: [112, 92], hip: [104, 132], le: [118, 108], lh: [130, 100], re: [112, 122], rh: [130, 156], lk: [124, 158], lf: [126, 182], rk: [78, 150], rf: [62, 178] } };
    const setPins = (keepStanding = false) => { if (!keepStanding) pins = PIN_POS.map(([x, z]) => ({ x, z, up: true, vx: 0, vz: 0, rot: 0, ax: 0, counted: false })); else pins = pins.filter(p => p.up).map(p => ({ ...p, vx: 0, vz: 0 })); };
    setPins();
    const speedFor = p => 620 + p * 560, angFor = a => a * 9 * Math.PI / 180; const PIN_M = .35; /* מסת פין יחסית לכדור */
    const startRoll = () => { const v = speedFor(power), a = angFor(angle); ball = { x: posX, z: 10, y: BALL_R, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, hook: -angle * 95, gutter: false, done: false, rot: 0 }; swingT = 0; r.sfx('wood'); }; /* hook: זריקה בזווית מתעקלת חזרה (כמו סיבוב אמיתי) */
    const camV = new THREE.Vector3(), lookV = new THREE.Vector3(0, 20, PINZ + 200), hv = new THREE.Vector3();
    const prompt = () => mode === 'swipe' ? 'גוררים את הכדור קדימה ומשחררים' : mode === 'one' ? 'נוגעים כשהמד בירוק' : step === 'pos' ? 'איפה לעמוד? נוגעים כדי לעצור' : step === 'power' ? 'כוח! נוגעים באמצע הירוק' : step === 'angle' ? 'זווית! נוגעים כשהחץ ישר' : '';
    const nextStep = () => { if (ball || cool > 0 || settle > 0 || step === 'mode') return; if (mode === 'one') { power = (sweep + 1) / 2; posX = 0; angle = r.rnd(-.15, .15); step = 'roll'; startRoll(); return; } if (mode === 'swipe') return; if (step === 'pos') { posX = sweep * 44; step = 'power'; sweep = 0; dir = 1; r.sfx('tick'); } else if (step === 'power') { power = (sweep + 1) / 2; step = 'angle'; sweep = 0; dir = 1; r.sfx('tick'); } else if (step === 'angle') { angle = sweep; step = 'roll'; startRoll(); } };
    const endRoll = () => { const down = pins.filter(p => !p.up).length; const hitsNow = down - frameHits; frameHits = down; let bonus = 0;
      if (ball.gutter && hitsNow === 0) { gutters++; r.pop(`מרזב! ${gutters}/3`, r.W / 2, r.H / 2, '#f87171', 24); r.sfx('over'); if (gutters >= 3) return r.over('3 מרזבים'); }
      if (roll === 1 && down === 10) { bonus = 10; lastStrike = true; msg = 'סטרייק! ✖️ +10'; r.sfx('win'); } else if (roll === 2 && down === 10) { bonus = 5; lastSpare = true; msg = 'ספייר! / +5'; r.sfx('score'); } else if (hitsNow > 0) { msg = `${hitsNow} פינים`; r.sfx('bounce'); } else if (!ball.gutter) msg = 'פספוס';
      r.addScore(hitsNow + bonus); if (hitsNow + bonus) { const [px, py] = L.project(0, 60, PINZ); r.pop('+' + (hitsNow + bonus), px, py, r.C.gold, 24); } msgT = 1.6;
      const frameOver = roll === 2 || down === 10;
      if (frameOver) { frame++; roll = 1; frameHits = 0; if (frame > 10) { games++; level++; frame = 1; r.pop(`משחק שלם! רמה ${level}`, r.W / 2, r.H / 2 - 40, r.C.gold, 24); r.sfx('levelup'); } setPins(); } else { roll = 2; setPins(true); }
      ball = null; step = mode === 'taps' ? 'pos' : 'aim'; sweep = 0; dir = 1; cool = .8; };
    return {
      tap(x, y) { if (step === 'mode') { const i = MODES.findIndex((m, k) => Math.abs(y - MODE_Y(k)) < 40); if (i >= 0) { mode = MODES[i][0]; step = mode === 'taps' ? 'pos' : 'aim'; sweep = 0; dir = 1; cool = .3; r.sfx('tick'); } return; } nextStep(); },
      down(x, y) { if (mode !== 'swipe' || ball || cool > 0 || settle > 0 || step === 'mode') return; drag = { x0: x, y0: y, x, y }; }, move(x, y) { if (drag) { drag.x = x; drag.y = y; } },
      up(x, y) { if (!drag) return; const d0 = drag; drag = null; const dx = x - d0.x0, dy = d0.y0 - y; if (dy < 30) return; /* גוררים קדימה */ posX = r.clamp((d0.x0 - r.W / 2) * .5, -44, 44); power = r.clamp(dy / 260, .25, 1); angle = r.clamp(dx / 120, -1, 1); step = 'roll'; startRoll(); },
      save() { return { level, mode }; }, revive() { gutters = 0; ball = null; step = mode === 'taps' ? 'pos' : 'aim'; cool = .5; },
      dispose() { L.dispose(); },
      peek() { const good = step === 'mode' ? true : mode === 'one' ? Math.abs((sweep + 1) / 2 - .72) < .08 : step === 'pos' ? Math.abs(sweep) < .15 : step === 'power' ? Math.abs((sweep + 1) / 2 - .72) < .08 : step === 'angle' ? Math.abs(sweep) < .12 : false; return { step, mode, sweep, good, canRoll: !ball && cool <= 0 && settle <= 0, modeY: MODE_Y(0) }; },
      update(dt) { tt += dt; msgT -= dt; if (cool > 0) cool -= dt; if (swingT >= 0) swingT += dt;
        if (!ball && cool <= 0 && step !== 'roll' && step !== 'mode') { const spd = mode === 'one' ? 1.9 + (level - 1) * .25 : step === 'pos' ? 1.3 : step === 'power' ? 1.8 + (level - 1) * .25 : 1.6; sweep += dir * spd * dt; if (sweep > 1) { sweep = 1; dir = -1; } if (sweep < -1) { sweep = -1; dir = 1; } }
        /* פיזיקת כדור (רועי: "אלגוריתם יותר טוב של תנועה"): חיכוך גלגול, התעקלות (hook) שמתחזקת בשליש האחרון של המסלול, מרזב עם האטה */
        if (ball && !ball.done) { const sub = 3; for (let k = 0; k < sub; k++) { const h = dt / sub; if (!ball.gutter) { const prog = r.clamp((10 - ball.z) / (10 - PINZ), 0, 1); ball.vx += ball.hook * (0.4 + prog * 1.6) * h; } ball.x += ball.vx * h; ball.z += ball.vz * h; const sp = Math.hypot(ball.vx, ball.vz); if (sp > 0) { const f = ball.gutter ? 120 : 28; const ns = Math.max(0, sp - f * h); ball.vx *= ns / sp; ball.vz *= ns / sp; } ball.rot += ball.vz * h / BALL_R;
            if (!ball.gutter && Math.abs(ball.x) > LANE_W / 2 - 4) { ball.gutter = true; ball.x = Math.sign(ball.x) * (LANE_W / 2 + 11); ball.vx = 0; ball.y = BALL_R - 5; r.sfx('tick'); }
            /* כדור ↔ פין: אימפולס לאורך הנורמל, הפין עף לפי כיוון הפגיעה (גם פינים שכבר שוכבים נדחפים) */
            if (!ball.gutter) for (const p of pins) { const d = Math.hypot(ball.x - p.x, ball.z - p.z); if (d < BALL_R + PIN_R) { const nx = (p.x - ball.x) / (d || 1), nz = (p.z - ball.z) / (d || 1); const rvx = ball.vx - p.vx, rvz = ball.vz - p.vz; const vn = rvx * nx + rvz * nz; if (vn > 0) { const j = vn * 1.6 / (1 + PIN_M); p.vx += nx * j * 1.0; p.vz += nz * j * 1.0; ball.vx -= nx * j * PIN_M; ball.vz -= nz * j * PIN_M; if (p.up) { p.up = false; p.ax = Math.atan2(p.vx, -p.vz); r.sfx('hit'); const [px, py] = L.project(p.x, 30, p.z); r.burst(px, py, '#f8fafc', 6, 90); } } p.x = ball.x + nx * (BALL_R + PIN_R + .5); p.z = ball.z + nz * (BALL_R + PIN_R + .5); } } }
          if (ball.z < PINZ - 140 || Math.hypot(ball.vx, ball.vz) < 30) { ball.done = true; settle = 1.4; } }
        /* פינים: מחליקים עם חיכוך, נופלים לכיוון התנועה, ומתנגשים זה בזה (התנגשות אלסטית עם מסות שוות; פין שנפגע חזק נופל) */
        for (const p of pins) { if (p.up && Math.hypot(p.vx, p.vz) < 1) continue; p.x += p.vx * dt; p.z += p.vz * dt; const sp = Math.hypot(p.vx, p.vz); if (sp > 0) { const ns = Math.max(0, sp - (p.up ? 400 : 170) * dt); p.vx *= ns / sp; p.vz *= ns / sp; } if (!p.up) { p.rot = Math.min(Math.PI / 2, p.rot + dt * 4.5); if (sp > 20) p.ax = Math.atan2(p.vx, -p.vz); } if (Math.abs(p.x) > LANE_W / 2 + 40) { p.vx *= .2; p.vz *= .2; } }
        for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) { const a = pins[i], b = pins[j]; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < PIN_R * 2 + 3 && d > 0) { const nx = (b.x - a.x) / d, nz = (b.z - a.z) / d; const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; if (vn > 0) { const j2 = vn * .9; a.vx -= nx * j2; a.vz -= nz * j2; b.vx += nx * j2; b.vz += nz * j2; if (vn > 55) { for (const q of [a, b]) if (q.up) { q.up = false; q.ax = Math.atan2(q.vx || nx, -(q.vz || -nz)); r.sfx('hit'); } } } const ov = (PIN_R * 2 + 3 - d) / 2; a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov; } }
        if (settle > 0) { settle -= dt; if (settle <= 0) { const res = endRoll(); if (res !== undefined) return res; } }
        /* דמות: מחזיקה את הכדור, ובגלגול: תנופה אחורה → שחרור בכריעה → חוזרת לעמידה */
        const heroX = ball ? ball.x0 ?? posX : (step === 'pos' ? sweep * 44 : mode === 'swipe' && drag ? r.clamp((drag.x0 - r.W / 2) * .5, -44, 44) : posX); if (ball && ball.x0 == null) ball.x0 = posX;
        if (hero) { const hp = new THREE.Vector3(heroX, 0, 46); hero.model.rotation.y = Math.PI; const tp = swingT < 0 ? BOWL.hold : swingT < .25 ? BOWL.back : swingT < .8 ? BOWL.release : BOWL.hold; pose(hero, tp, false, hp, dt, swingT >= 0 && swingT < .8 ? 18 : 6); if (swingT > 1.4) swingT = -1; }
        /* כדור */ if (ballM) { if (ball) { ballM.position.set(ball.x, ball.y, ball.z); ballM.rotation.x = ball.rot; } else if (hero && hero.rig.b.RightHand) { (hero.rig.b.RightHandIndex1 || hero.rig.b.RightHand).getWorldPosition(hv); ballM.position.set(hv.x, Math.max(BALL_R, hv.y - BALL_R * .7), hv.z - 8); } /* בכף היד (עצם האצבעות), תלוי מעט מתחת וקדימה (רועי: "בכף היד, לא על המרפק") */ else ballM.position.set(heroX, BALL_R, 20); }
        /* פינים */ pins.forEach((p, i) => { const m = pinM[i]; if (!m) return; m.visible = true; m.position.set(p.x, 0, p.z); m.rotation.set(0, 0, 0); if (!p.up) { m.rotateY(p.ax); m.rotateX(-p.rot); } }); for (let i = pins.length; i < pinM.length; i++) pinM[i].visible = false;
        /* מצלמה: מאחורי הכדור, עוקבת; בסיום מסתכלת על הפינים */ const bz = ball ? Math.max(PINZ + 380, ball.z) : 60, bx = ball ? ball.x : heroX; if (ball) camV.set(bx * .5, 160, bz + 320); else camV.set(bx * .3, 310, bz + 540); /* מהמרכז, גבוה מעל הראש כדי שהדמות לא תסתיר את המסלול (רועי: "השחקן יראה את המגרש מהמרכז") */ cam.position.lerp(camV, 1 - Math.exp(-6 * dt)); lookV.set(bx * .2, 0, ball ? Math.min(bz - 400, PINZ + 100) : PINZ + 300); cam.lookAt(lookV);
        L.render(); },
      draw() { const c = r.ctx; c.clearRect(0, 0, r.W, r.H);
        if (!L.ok) { const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#0b0f1a'); bg.addColorStop(1, '#312e81'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); pins.forEach(p => { const [x, y] = L.project(p.x, 15, p.z); r.rect(x - 3, y - 12, 6, 24, p.up ? '#f8fafc' : '#64748b', 3); }); if (ball) { const [x, y] = L.project(ball.x, ball.y, ball.z); r.circle(x, y, 8, '#7c3aed'); } }
        if (step === 'mode') { c.fillStyle = 'rgba(15,23,42,.55)'; c.fillRect(0, 0, r.W, r.H); r.text('איך לגלגל?', r.W / 2, 140, { size: 26, color: '#fff' }); MODES.forEach(([id, name, desc], i) => { const y = MODE_Y(i); r.rect(30, y - 34, r.W - 60, 68, id === mode ? '#6C4CF1' : 'rgba(255,255,255,.12)', 16); r.text(name, r.W / 2, y - 10, { size: 19, color: '#fff' }); r.text(desc, r.W / 2, y + 16, { size: 12, color: '#e0e7ff' }); }); r.text('הבחירה נשמרת. אפשר לשנות בכל משחק', r.W / 2, MODE_Y(2) + 64, { size: 12, color: '#c4b5fd' }); return; }
        /* נגיעה אחת: מד כוח בלבד */ if (!ball && cool <= 0 && mode === 'one') { const MX = 24, MY = r.H - 330, MH = 170, p = (sweep + 1) / 2; r.rect(MX - 9, MY, 18, MH, 'rgba(0,0,0,.5)', 9); r.rect(MX - 9, MY + MH * (1 - .8), 18, MH * .16, 'rgba(74,222,128,.8)', 4); r.rect(MX - 12, MY + MH * (1 - p) - 4, 24, 8, Math.abs(p - .72) < .08 ? '#4ade80' : p > .85 ? '#ef4444' : '#f8fafc', 3); r.text('כוח', MX, MY - 12, { size: 12, color: '#fff' }); }
        /* החלקה: חץ מהכדור לפי הגרירה */ if (drag) { const dx = drag.x - drag.x0, dy = drag.y0 - drag.y; if (dy > 10) { const a = r.clamp(dx / 120, -1, 1) * 9 * Math.PI / 180, pw = r.clamp(dy / 260, .25, 1), hx = r.clamp((drag.x0 - r.W / 2) * .5, -44, 44); for (let i = 1; i <= 8; i++) { const [x, y, z] = L.project(hx + Math.sin(a) * i * 110 * pw, 2, -Math.cos(a) * i * 110 * pw); if (z < 1) r.circle(x, y, 4.5 - i * .3, `rgba(74,222,128,${1 - i * .1})`); } r.rect(r.W / 2 - 50, r.H - 70, 100, 8, 'rgba(0,0,0,.5)', 4); r.rect(r.W / 2 - 50, r.H - 70, 100 * pw, 8, pw > .85 ? '#ef4444' : '#4ade80', 4); } }
        /* שלב 1: סמן מיקום על קו העבירה */ if (!ball && cool <= 0 && mode === 'taps' && step === 'pos') { const [x, y] = L.project(sweep * 44, 2, -60); const col = Math.abs(sweep) < .15 ? '#4ade80' : '#fde047'; c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 13, y - 26); c.lineTo(x + 13, y - 26); c.closePath(); c.fill(); r.circle(x, y + 2, 5, col); }
        /* שלב 2: מד כוח */ if (!ball && cool <= 0 && mode === 'taps' && step === 'power') { const MX = 24, MY = r.H - 330, MH = 170, p = (sweep + 1) / 2; r.rect(MX - 9, MY, 18, MH, 'rgba(0,0,0,.5)', 9); r.rect(MX - 9, MY + MH * (1 - .8), 18, MH * .16, 'rgba(74,222,128,.8)', 4); r.rect(MX - 12, MY + MH * (1 - p) - 4, 24, 8, Math.abs(p - .72) < .08 ? '#4ade80' : p > .85 ? '#ef4444' : '#f8fafc', 3); r.text('כוח', MX, MY - 12, { size: 12, color: '#fff' }); }
        /* שלב 3: חץ זווית מהכדור */ if (!ball && cool <= 0 && mode === 'taps' && step === 'angle') { const a = angFor(sweep); for (let i = 1; i <= 10; i++) { const [x, y, z] = L.project(posX + Math.sin(a) * i * 90, 2, -Math.cos(a) * i * 90); if (z < 1) r.circle(x, y, 4 - i * .25, Math.abs(sweep) < .12 ? `rgba(74,222,128,${1 - i * .08})` : `rgba(255,255,255,${.9 - i * .08})`); } }
        if (!ball && cool <= 0 && step !== 'roll' && !drag) r.text(prompt(), r.W / 2, r.H - 46, { size: 16, color: '#fff' });
        r.text(msgT > 0 && msg ? msg : `פריים ${frame}/10 · גלגול ${roll} · רמה ${level} · מרזבים ${gutters}/3`, r.W / 2, 22, { size: 15, color: '#fff' }); },
    };
  } });

// משחקי ארקייד קלאסיים
import { POSE, GK, S as SP, KITS } from './sprites.js';
import { renderStill, SCENE_IDS, STILL_T } from './celebrate.js';
const G = [];

// ---- טטריס ----
G.push({ id: 'tetris', name: 'טטריס', emoji: '🧱', how: 'מחליקים ימינה ושמאלה כדי להזיז, נוגעים כדי לסובב, מחליקים למטה כדי להפיל.',
  make(r) {
    const COLS = 10, ROWS = 17, S = 26, OX = 50, OY = 104; // מקום למעלה לשער ולחתיכה הבאה
    const SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]]];
    const COLORS = [r.C.sky, r.C.gold, r.C.accent, r.C.hot, r.C.teal, r.C.ok, r.C.pink];
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let cur, t = 0, speed = 0.55, next = r.rint(0, 6), lines = 0, goals = [], shot = null, revealed = 0, picIdx = r.rint(0, SCENE_IDS.length - 1), picDone = 0;
    const GOAL = { x: 130, y: 12, w: 216, h: 70 };
    // התמונה שמאחורי הלוח: פריים מהחגיגות, נחשפת שורה אחרי שורה
    const pic = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (pic) { pic.width = 360; pic.height = 560; }
    const paintPic = () => { if (!pic) return; try { renderStill(pic, SCENE_IDS[picIdx], STILL_T[SCENE_IDS[picIdx]]); } catch { /* */ } };
    paintPic();
    const spawn = () => { const i = next; next = r.rint(0, 6); cur = { s: SHAPES[i].map(x => [...x]), c: i + 1, x: 3, y: 0 }; if (collides(cur.s, cur.x, cur.y)) r.over('הלוח מלא!'); };
    const collides = (s, x, y) => s.some((row, j) => row.some((v, i) => v && (x + i < 0 || x + i >= COLS || y + j >= ROWS || (y + j >= 0 && grid[y + j][x + i]))));
    const rotate = s => s[0].map((_, i) => s.map(row => row[i]).reverse());
    const lock = () => { cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && cur.y + j >= 0) grid[cur.y + j][cur.x + i] = cur.c; }));
      let n = 0; for (let j = ROWS - 1; j >= 0; j--) if (grid[j].every(Boolean)) { grid.splice(j, 1); grid.unshift(Array(COLS).fill(0)); n++; j++; }
      if (n) { const pts = [0, 100, 300, 500, 800][n]; r.addScore(pts); lines += n; speed = Math.max(0.15, speed - 0.02 * n); r.pop(n === 4 ? 'טטריס! +800' : '+' + pts, r.W / 2, 300, r.C.gold, 26); r.burst(r.W / 2, 330, COLORS[cur.c - 1], 16);
        // כל שורה = שער במקום אחר ברשת, עם שאגת קהל
        for (let k = 0; k < n; k++) { const gx = GOAL.x + 14 + Math.random() * (GOAL.w - 28), gy = GOAL.y + 12 + Math.random() * (GOAL.h - 24); goals.push({ x: gx, y: gy }); shot = { x: OX + COLS * S / 2, y: OY, tx: gx, ty: gy, t: 0, dir: gx < GOAL.x + GOAL.w / 2 ? 1 : -1 }; } r.sfx(n === 4 ? 'win' : 'goal'); r.pop('גול!', GOAL.x + GOAL.w / 2, GOAL.y + GOAL.h + 8, '#FDE047', 24);
        // כל שורה חושפת שורה מהתמונה
        revealed += n; if (revealed >= ROWS) { revealed = 0; picDone++; r.addScore(300); r.pop('התמונה נחשפה! +300', r.W / 2, 280, r.C.gold, 26); r.burst(r.W / 2, 300, r.C.gold, 30, 300); picIdx = (picIdx + 1) % SCENE_IDS.length; paintPic(); } } else r.sfx('tick'); spawn(); };
    const step = () => { if (!collides(cur.s, cur.x, cur.y + 1)) cur.y++; else lock(); };
    spawn();
    return {
      update(dt) { t += dt; if (t > speed) { t = 0; step(); } if (shot) { shot.t += dt * 2.2; if (shot.t >= 1.6) shot = null; } },
      swipe(d) { if (d === 'left' && !collides(cur.s, cur.x - 1, cur.y)) cur.x--; if (d === 'right' && !collides(cur.s, cur.x + 1, cur.y)) cur.x++; if (d === 'down') { while (!collides(cur.s, cur.x, cur.y + 1)) cur.y++; lock(); r.addScore(5); } if (d === 'up') this.tap(); },
      tap() { const rs = rotate(cur.s); for (const dx of [0, -1, 1, -2, 2]) if (!collides(rs, cur.x + dx, cur.y)) { cur.s = rs; cur.x += dx; break; } },
      draw() { r.clear(); r.rect(OX - 2, OY - 2, COLS * S + 4, ROWS * S + 4, '#2A2555', 6);
        // התמונה מאחור, חתוכה לגודל הלוח, ומכוסה בשורות שעוד לא נחשפו (מלמעלה למטה)
        const BW = COLS * S, BH = ROWS * S; r.ctx.save(); r.ctx.beginPath(); r.ctx.roundRect(OX, OY, BW, BH, 4); r.ctx.clip(); const sc = Math.max(BW / 360, BH / 560), dw = 360 * sc, dh = 560 * sc; if (pic) r.ctx.drawImage(pic, OX + (BW - dw) / 2, OY + (BH - dh) / 2, dw, dh); r.ctx.restore();
        for (let j = revealed; j < ROWS; j++) r.rect(OX, OY + j * S, BW, S + 0.5, '#1E1B3A');
        if (revealed > 0 && revealed < ROWS) r.line(OX, OY + revealed * S, OX + BW, OY + revealed * S, r.C.gold, 2);
        r.text(`${revealed} מתוך ${ROWS} שורות בתמונה`, OX + BW / 2, OY + BH + 12, { size: 12, color: r.C.muted });
        // למעלה: החתיכה הבאה (גדולה) והשער עם כל השערים שהבקעת
        r.rect(8, 8, 108, 80, '#2A2555', 8); r.text('הבא', 62, 20, { size: 13, color: r.C.muted }); const ns = SHAPES[next], nw = ns[0].length * 18, nh = ns.length * 18; ns.forEach((row, j) => row.forEach((v, i) => { if (v) r.rect(62 - nw / 2 + i * 18 + 1, 52 - nh / 2 + j * 18 + 1, 16, 16, COLORS[next], 4); }));
        r.rect(GOAL.x - 6, GOAL.y - 4, GOAL.w + 12, GOAL.h + 10, '#15803D', 6); r.ctx.strokeStyle = '#ffffff66'; r.ctx.lineWidth = 1; for (let i = 0; i <= GOAL.w; i += 12) r.line(GOAL.x + i, GOAL.y, GOAL.x + i, GOAL.y + GOAL.h, '#ffffff55', 1); for (let j = 0; j <= GOAL.h; j += 12) r.line(GOAL.x, GOAL.y + j, GOAL.x + GOAL.w, GOAL.y + j, '#ffffff55', 1); r.line(GOAL.x, GOAL.y + GOAL.h, GOAL.x, GOAL.y, '#fff', 4); r.line(GOAL.x, GOAL.y, GOAL.x + GOAL.w, GOAL.y, '#fff', 4); r.line(GOAL.x + GOAL.w, GOAL.y, GOAL.x + GOAL.w, GOAL.y + GOAL.h, '#fff', 4);
        goals.forEach(g => { r.circle(g.x, g.y, 5, '#fff'); r.circle(g.x, g.y, 2, '#111'); }); r.text(`${goals.length} שערים`, GOAL.x + GOAL.w / 2, GOAL.y + GOAL.h + 16, { size: 12, color: r.C.muted });
        const gkx = GOAL.x + GOAL.w / 2 + (shot ? shot.dir * Math.min(1, shot.t) * 70 : 0); r.player(shot ? (shot.dir > 0 ? GK.diveR : GK.diveL) : GK.ready, gkx, GOAL.y + GOAL.h, 0.36, KITS.keeper);
        if (shot) { const k = Math.min(1, shot.t); const bx = shot.x + (shot.tx - shot.x) * k, by = shot.y + (shot.ty - shot.y) * k - Math.sin(k * Math.PI) * 30; r.circle(bx, by, 7 - 3 * k, '#fff'); r.circle(bx, by, 2, '#111'); }
        // רוח: איפה החתיכה תנחת
        let gy = cur.y; while (!collides(cur.s, cur.x, gy + 1)) gy++; cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && gy + j >= 0) r.rect(OX + (cur.x + i) * S + 3, OY + (gy + j) * S + 3, S - 6, S - 6, COLORS[cur.c - 1] + '33', 3); }));
        grid.forEach((row, j) => row.forEach((v, i) => { if (v) { r.rect(OX + i * S + 1, OY + j * S + 1, S - 2, S - 2, COLORS[v - 1], 4); r.rect(OX + i * S + 4, OY + j * S + 4, S - 8, 5, '#ffffff33', 2); } }));
        cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && cur.y + j >= 0) r.rect(OX + (cur.x + i) * S + 1, OY + (cur.y + j) * S + 1, S - 2, S - 2, COLORS[cur.c - 1], 4); })); },
    };
  } });

// ---- נחש ----
G.push({ id: 'snake', name: 'נחש', emoji: '🐍', how: 'מחליקים לכיוון שרוצים. אוכלים תפוחים, לא נוגעים בקירות ולא בזנב.',
  make(r) {
    const S = 20, COLS = r.W / S, ROWS = Math.floor((r.H - 20) / S), OY = 20;
    let snake = [[8, 14], [7, 14], [6, 14]], dir = [1, 0], next = dir, t = 0, food = place(), speed = 0.14;
    function place() { let p; do { p = [r.rint(0, COLS - 1), r.rint(0, ROWS - 1)]; } while (snake.some(s => s[0] === p[0] && s[1] === p[1])); return p; }
    return {
      swipe(d) { const m = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d]; if (m && !(m[0] === -dir[0] && m[1] === -dir[1])) next = m; },
      update(dt) { t += dt; if (t < speed) return; t = 0; dir = next;
        const h = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
        if (h[0] < 0 || h[0] >= COLS || h[1] < 0 || h[1] >= ROWS || snake.some(s => s[0] === h[0] && s[1] === h[1])) return r.over('הנחש נפגע!');
        snake.unshift(h);
        if (h[0] === food[0] && h[1] === food[1]) { r.addScore(10); r.pop('+10', h[0] * S + S / 2, OY + h[1] * S, r.C.lime); r.burst(h[0] * S + S / 2, OY + h[1] * S + S / 2, '#EF4444', 8, 120); r.sfx('score'); food = place(); speed = Math.max(0.07, speed - 0.003); } else snake.pop(); },
      draw() { r.clear('#173A27'); r.emoji('🍎', food[0] * S + S / 2, OY + food[1] * S + S / 2, 18);
        snake.forEach((s, i) => r.rect(s[0] * S + 1, OY + s[1] * S + 1, S - 2, S - 2, i ? (i % 2 ? r.C.lime : '#86EFAC') : r.C.gold, 6));
        const hx = snake[0][0] * S + S / 2, hy = OY + snake[0][1] * S + S / 2; [[-1, -1], [1, -1]].forEach(([a, b]) => { const ex = hx + (dir[0] ? dir[0] * 3 : a * 5), ey = hy + (dir[1] ? dir[1] * 3 : b * 5); r.circle(ex, ey, 3, '#fff'); r.circle(ex + dir[0], ey + dir[1], 1.5, '#111'); }); },
    };
  } });

// ---- שובר לבנים ----
G.push({ id: 'breakout', name: 'שובר לבנים', emoji: '🧊', how: 'מזיזים את המחבט עם האצבע ומפילים את כל הלבנים.',
  make(r) {
    let px = r.W / 2, PW = 80, ball = { x: r.W / 2, y: r.H - 80, vx: 160, vy: -260 }, bricks = [], level = 1;
    const build = () => { bricks = []; for (let j = 0; j < 5 + level; j++) for (let i = 0; i < 8; i++) bricks.push({ x: 8 + i * 43, y: 60 + j * 22, c: [r.C.pink, r.C.hot, r.C.gold, r.C.ok, r.C.sky, r.C.accent, r.C.teal][j % 7] }); };
    build();
    return {
      move(x) { px = r.clamp(x, PW / 2, r.W - PW / 2); }, down(x) { this.move(x); },
      update(dt) { ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 8 || ball.x > r.W - 8) ball.vx *= -1; if (ball.y < 8) ball.vy *= -1;
        if (ball.y > r.H) return r.over('הכדור נפל!');
        if (ball.vy > 0 && ball.y > r.H - 40 && ball.y < r.H - 24 && Math.abs(ball.x - px) < PW / 2 + 8) { ball.vy = -Math.abs(ball.vy) * 1.02; ball.vx = (ball.x - px) * 6; r.sfx('bounce'); }
        for (let i = bricks.length - 1; i >= 0; i--) { const b = bricks[i]; if (r.hit(ball.x - 8, ball.y - 8, 16, 16, b.x, b.y, 40, 18)) { r.burst(b.x + 20, b.y + 9, b.c, 8, 140); bricks.splice(i, 1); ball.vy *= -1; r.addScore(10); r.sfx('tick'); break; } }
        if (!bricks.length) { level++; ball = { x: r.W / 2, y: r.H - 80, vx: 160, vy: -260 }; build(); r.win('ניקית את הלוח!', 100); } },
      draw() { r.clear(); bricks.forEach(b => { r.rect(b.x, b.y, 40, 18, b.c, 4); r.rect(b.x + 3, b.y + 3, 34, 4, '#ffffff44', 2); }); r.rect(px - PW / 2, r.H - 32, PW, 12, r.C.ink, 6); r.rect(px - PW / 2 + 6, r.H - 30, PW - 12, 3, r.C.sky, 2); r.circle(ball.x, ball.y, 8, r.C.gold); r.circle(ball.x - 2, ball.y - 3, 2.5, '#fff8'); },
    };
  } });

// ---- פונג ----
G.push({ id: 'pong', name: 'פונג', emoji: '🏓', how: 'המחבט שלך למטה. מזיזים עם האצבע. כל פעם שהמחשב מפספס, נקודה לך.',
  make(r) {
    let px = r.W / 2, ax = r.W / 2, PW = 80, ball = reset();
    function reset() { return { x: r.W / 2, y: r.H / 2, vx: r.pick([-1, 1]) * 180, vy: 260 }; }
    return {
      move(x) { px = r.clamp(x, PW / 2, r.W - PW / 2); }, down(x) { this.move(x); },
      update(dt) { ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        ax += r.clamp(ball.x - ax, -220 * dt, 220 * dt);
        if (ball.x < 8 || ball.x > r.W - 8) ball.vx *= -1;
        if (ball.vy > 0 && ball.y > r.H - 40 && ball.y < r.H - 26 && Math.abs(ball.x - px) < PW / 2 + 8) { ball.vy = -Math.abs(ball.vy) * 1.04; ball.vx += (ball.x - px) * 4; r.sfx('bounce'); }
        if (ball.vy < 0 && ball.y < 40 && ball.y > 26 && Math.abs(ball.x - ax) < PW / 2 + 8) { ball.vy = Math.abs(ball.vy); ball.vx += (ball.x - ax) * 2; r.sfx('tick'); }
        if (ball.y < 0) { r.addScore(1); r.pop('+1', ball.x, 60, r.C.gold, 26); r.burst(ball.x, 10, r.C.pink, 12); r.sfx('score'); ball = reset(); } if (ball.y > r.H) r.over('פספסת!'); },
      draw() { r.clear('#0F2A3A'); r.line(0, r.H / 2, r.W, r.H / 2, '#ffffff22', 2); r.rect(ax - PW / 2, 20, PW, 10, r.C.pink, 5); r.rect(px - PW / 2, r.H - 32, PW, 10, r.C.sky, 5); r.circle(ball.x, ball.y, 8, r.C.gold); },
    };
  } });

// ---- פינבול ----
G.push({ id: 'pinball', name: 'פינבול', emoji: '🎯', how: 'נוגעים בצד שמאל או ימין כדי להפעיל את הפליפרים. פוגעים בבמפרים לנקודות.',
  make(r) {
    let ball = { x: r.W - 30, y: 120, vx: 0, vy: 0 }, fl = { l: 0, r: 0 };
    const bumpers = [[100, 150, 22], [260, 150, 22], [180, 240, 26], [80, 300, 18], [280, 300, 18]];
    return {
      down(x) { if (x < r.W / 2) fl.l = 0.18; else fl.r = 0.18; },
      update(dt) { fl.l = Math.max(0, fl.l - dt); fl.r = Math.max(0, fl.r - dt);
        ball.vy += 700 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 12) { ball.x = 12; ball.vx = Math.abs(ball.vx) * 0.8; } if (ball.x > r.W - 12) { ball.x = r.W - 12; ball.vx = -Math.abs(ball.vx) * 0.8; }
        if (ball.y < 12) { ball.y = 12; ball.vy = Math.abs(ball.vy) * 0.8; }
        for (const [bx, by, br] of bumpers) { const d = r.dist(ball.x, ball.y, bx, by); if (d < br + 10) { const nx = (ball.x - bx) / d, ny = (ball.y - by) / d; ball.vx = nx * 380; ball.vy = ny * 380; ball.x = bx + nx * (br + 11); ball.y = by + ny * (br + 11); r.addScore(25); r.pop('+25', bx, by - br - 8, '#fff', 16); r.burst(bx, by, '#fff', 6, 100); r.sfx('tick'); } }
        // פליפרים: אזורים בתחתית
        const fy = r.H - 70;
        if (ball.y > fy - 10 && ball.y < fy + 30 && ball.vy > 0) {
          if (ball.x > 30 && ball.x < r.W / 2 - 20 && fl.l > 0) { ball.vy = -620; ball.vx = 200 + r.rnd(-60, 60); r.addScore(5); r.sfx('bounce'); }
          else if (ball.x > r.W / 2 + 20 && ball.x < r.W - 30 && fl.r > 0) { ball.vy = -620; ball.vx = -200 + r.rnd(-60, 60); r.addScore(5); r.sfx('bounce'); }
        }
        // קירות משופעים מכוונים למרכז
        if (ball.y > fy - 40 && ball.x < 30) { ball.vx = Math.abs(ball.vx) + 60; } if (ball.y > fy - 40 && ball.x > r.W - 30) { ball.vx = -Math.abs(ball.vx) - 60; }
        if (ball.y > r.H + 20) r.over('הכדור ירד!'); },
      draw() { r.clear('#2B1B4D'); bumpers.forEach(([x, y, br], i) => { r.circle(x, y, br, [r.C.pink, r.C.hot, r.C.gold, r.C.sky, r.C.lime][i]); r.circle(x, y, br - 8, '#ffffff55'); });
        const fy = r.H - 70; r.line(30, fy + 10, r.W / 2 - 25, fy + (fl.l ? -14 : 28), fl.l ? r.C.gold : r.C.ink, 10); r.line(r.W - 30, fy + 10, r.W / 2 + 25, fy + (fl.r ? -14 : 28), fl.r ? r.C.gold : r.C.ink, 10);
        r.line(0, fy - 40, 30, fy + 10, r.C.muted, 6); r.line(r.W, fy - 40, r.W - 30, fy + 10, r.C.muted, 6);
        r.circle(ball.x, ball.y, 10, '#E5E7EB'); },
    };
  } });

// ---- חלליות ----
G.push({ id: 'invaders', name: 'פולשים מהחלל', emoji: '👾', how: 'החללית עוקבת אחרי האצבע ויורה לבד. פוגעים בכל הפולשים לפני שהם מגיעים למטה.',
  make(r) {
    let px = r.W / 2, shots = [], enemies = [], eshots = [], t = 0, dir = 1, et = 0, wave = 1;
    const spawn = () => { enemies = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) enemies.push({ x: 40 + i * 50, y: 70 + j * 40 }); };
    spawn();
    return {
      move(x) { px = r.clamp(x, 20, r.W - 20); }, down(x) { this.move(x); },
      update(dt) { t += dt; if (t > 0.35) { t = 0; shots.push({ x: px, y: r.H - 60 }); }
        shots.forEach(s => s.y -= 420 * dt); shots = shots.filter(s => s.y > 0);
        et += dt; const sp = 30 + wave * 10; let edge = false;
        enemies.forEach(e => { e.x += dir * sp * dt; if (e.x < 20 || e.x > r.W - 20) edge = true; });
        if (edge) { dir *= -1; enemies.forEach(e => { e.y += 14; e.x = r.clamp(e.x, 20, r.W - 20); }); }
        if (et > 1.2 && enemies.length) { et = 0; const e = r.pick(enemies); eshots.push({ x: e.x, y: e.y }); }
        eshots.forEach(s => s.y += 220 * dt); eshots = eshots.filter(s => s.y < r.H);
        for (const s of shots) { const i = enemies.findIndex(e => r.dist(e.x, e.y, s.x, s.y) < 18); if (i >= 0) { r.burst(enemies[i].x, enemies[i].y, r.C.lime, 10, 160); enemies.splice(i, 1); s.y = -1; r.addScore(20); r.sfx('tick'); } }
        if (eshots.some(s => r.dist(s.x, s.y, px, r.H - 45) < 18) || enemies.some(e => e.y > r.H - 70)) return r.over('החללית נפגעה!');
        if (!enemies.length) { wave++; spawn(); r.win('גל הובס!', 100); } },
      draw() { r.clear('#0B1026'); for (let i = 0; i < 30; i++) r.circle((i * 89) % r.W, (i * 131 + et * 20) % r.H, 1, '#ffffff55'); enemies.forEach((e, i) => SP.alien(r, e.x, e.y, et + i, [r.C.lime, r.C.pink, r.C.sky, r.C.gold][Math.floor(i / 6) % 4])); shots.forEach(s => r.rect(s.x - 2, s.y, 4, 12, r.C.lime)); eshots.forEach(s => r.rect(s.x - 2, s.y, 4, 12, r.C.red)); SP.ship(r, px, r.H - 45); },
    };
  } });

// ---- אסטרואידים ----
G.push({ id: 'asteroids', name: 'שדה אסטרואידים', emoji: '☄️', how: 'החללית עוקבת אחרי האצבע. נוגעים כדי לירות. מתחמקים או מפוצצים.',
  make(r) {
    let px = r.W / 2, py = r.H - 80, rocks = [], shots = [], t = 0, alive = 0;
    return {
      move(x, y) { px = r.clamp(x, 16, r.W - 16); py = r.clamp(y, 200, r.H - 30); }, down(x, y) { this.move(x, y); },
      tap() { shots.push({ x: px, y: py - 20 }); },
      update(dt) { alive += dt; t += dt; if (t > Math.max(0.35, 1 - alive / 60)) { t = 0; rocks.push({ x: r.rnd(20, r.W - 20), y: -30, s: r.rnd(14, 30), vy: r.rnd(90, 190), vx: r.rnd(-40, 40) }); }
        rocks.forEach(k => { k.y += k.vy * dt; k.x += k.vx * dt; }); rocks = rocks.filter(k => k.y < r.H + 40);
        shots.forEach(s => s.y -= 500 * dt); shots = shots.filter(s => s.y > -10);
        for (const s of shots) { const i = rocks.findIndex(k => r.dist(k.x, k.y, s.x, s.y) < k.s + 4); if (i >= 0) { const k = rocks[i]; r.addScore(Math.round(k.s)); r.burst(k.x, k.y, '#A8A29E', 10, 160); r.sfx('tick'); if (k.s > 22) { rocks.push({ x: k.x - 10, y: k.y, s: k.s / 2, vy: k.vy, vx: k.vx - 60 }, { x: k.x + 10, y: k.y, s: k.s / 2, vy: k.vy, vx: k.vx + 60 }); } rocks.splice(i, 1); s.y = -20; } }
        if (rocks.some(k => r.dist(k.x, k.y, px, py) < k.s + 10)) return r.over('בום!');
        if (Math.floor(alive * 2) !== Math.floor((alive - dt) * 2)) r.addScore(1); },
      draw() { r.clear('#0B1026'); for (let i = 0; i < 20; i++) r.circle((i * 97) % r.W, (i * 173 + alive * 40) % r.H, 1.5, '#ffffff66');
        rocks.forEach((k, i) => SP.rock(r, k.x, k.y, k.s, i)); shots.forEach(s => r.rect(s.x - 2, s.y, 4, 14, r.C.lime)); SP.ship(r, px, py, r.C.pink); },
    };
  } });

// ---- ציפור מעופפת ----
G.push({ id: 'flappy', name: 'ציפור מעופפת', emoji: '🐤', how: 'נוגעים כדי לעוף למעלה. עוברים בין הצינורות בלי לגעת.',
  make(r) {
    let y = r.H / 2, vy = 0, pipes = [], t = 1.2, gap = 150;
    return {
      tap() { vy = -330; r.sfx('tick'); }, down() { vy = -330; },
      update(dt) { vy += 900 * dt; y += vy * dt; t += dt;
        if (t > 1.5) { t = 0; pipes.push({ x: r.W + 30, h: r.rnd(80, r.H - gap - 80), passed: false }); }
        pipes.forEach(p => p.x -= 150 * dt); pipes = pipes.filter(p => p.x > -60);
        for (const p of pipes) { if (!p.passed && p.x + 25 < 80) { p.passed = true; r.addScore(10); r.pop('+10', 80, y - 30, '#fff'); r.sfx('score'); }
          if (80 + 14 > p.x && 80 - 14 < p.x + 50 && (y - 14 < p.h || y + 14 > p.h + gap)) return r.over('נגעת בצינור!'); }
        if (y > r.H - 10 || y < -20) r.over('אופס!'); },
      draw() { r.clear('#7DD3FC'); SP.cloud(r, 60 - (t * 30) % 60, 80, 1); SP.cloud(r, 260, 140, 0.7); r.rect(0, r.H - 24, r.W, 24, '#84CC16'); pipes.forEach(p => { r.rect(p.x, 0, 50, p.h, '#16A34A', 4); r.rect(p.x - 4, p.h - 18, 58, 18, '#15803D', 4); r.rect(p.x, p.h + gap, 50, r.H, '#16A34A', 4); r.rect(p.x - 4, p.h + gap, 58, 18, '#15803D', 4); }); SP.bird(r, 80, y, vy < 0 ? 1 : 0); },
    };
  } });

// ---- רץ קופץ ----
G.push({ id: 'runner', name: 'הרץ הקופץ', emoji: '🏃', how: 'נוגעים כדי לקפוץ מעל המכשולים. הריצה מתגברת עם הזמן.',
  make(r) {
    const GY = r.H - 90; let y = GY, vy = 0, obs = [], t = 0, speed = 220, dist = 0, jumps = 0, run = 0, clouds = [{ x: 60, y: 60 }, { x: 250, y: 100 }];
    return {
      tap() { if (y >= GY - 1 || jumps < 2) { vy = -520; jumps++; r.sfx('bounce'); } },
      update(dt) { vy += 1300 * dt; y = Math.min(GY, y + vy * dt); if (y >= GY) { vy = 0; jumps = 0; }
        speed += 6 * dt; t += dt; dist += speed * dt; run += dt * speed / 220; clouds.forEach(c => { c.x -= 15 * dt; if (c.x < -50) c.x = r.W + 50; }); if (t > r.rnd(1, 1.6)) { t = 0; obs.push({ x: r.W + 20, w: r.rint(20, 34), h: r.rint(30, 60), kind: r.pick(['cactus', 'cactus', 'rock']) }); }
        obs.forEach(o => o.x -= speed * dt); obs = obs.filter(o => o.x > -50);
        if (Math.floor(dist / 50) !== Math.floor((dist - speed * dt) / 50)) r.addScore(1); if (Math.floor(dist / 1000) !== Math.floor((dist - speed * dt) / 1000)) { r.pop(`${Math.floor(dist / 100)} מטר!`, 60, GY - 120, '#92400E', 22); r.sfx('score'); }
        if (obs.some(o => r.hit(60 - 14, y - 40, 28, 40, o.x, GY - o.h, o.w, o.h))) r.over('נתקלת!'); },
      draw() { r.clear('#FDE68A'); clouds.forEach(c => SP.cloud(r, c.x, c.y)); r.circle(300, 60, 26, '#FBBF24'); r.rect(0, GY, r.W, r.H - GY, '#A16207'); for (let i = 0; i < 8; i++) r.rect(((i * 50 - dist) % (r.W + 50) + r.W + 50) % (r.W + 50) - 25, GY + 12, 30, 3, '#78350F');
        obs.forEach(o => { if (o.kind === 'rock') SP.rock(r, o.x + o.w / 2, GY - o.h / 2, o.h / 2, o.x); else { r.rect(o.x, GY - o.h, o.w, o.h, '#15803D', 6); r.rect(o.x - 8, GY - o.h * 0.7, 10, 6, '#15803D', 3); r.rect(o.x + o.w - 2, GY - o.h * 0.5, 10, 6, '#15803D', 3); } });
        r.player(y < GY - 2 ? POSE.leap : r.anim(POSE.run, run * 1000), 60, y, 0.5, KITS.orange); },
    };
  } });

// ---- חציית כביש ----
G.push({ id: 'frogger', name: 'צפרדע חוצה כביש', emoji: '🐸', how: 'מחליקים למעלה, למטה, ימינה או שמאלה. חוצים את כל הכביש בלי להיפגע.',
  make(r) {
    const S = 40, COLS = 9, ROWS = 13; let fx = 4, fy = ROWS - 1, lanes = [], round = 1;
    const build = () => { lanes = []; for (let j = 1; j < ROWS - 1; j++) if (j % 3 !== 0) lanes.push({ y: j, dir: j % 2 ? 1 : -1, sp: (60 + r.rnd(0, 60)) * (1 + round * 0.15), cars: [r.rnd(0, r.W), r.rnd(0, r.W)].map(x => ({ x })), color: r.pick(['#EF4444', '#3B82F6', '#F59E0B', '#22C55E', '#A855F7']) }); };
    build();
    return {
      swipe(d) { if (d === 'up') fy--; if (d === 'down') fy = Math.min(ROWS - 1, fy + 1); if (d === 'left') fx = Math.max(0, fx - 1); if (d === 'right') fx = Math.min(COLS - 1, fx + 1);
        if (d === 'up') { r.addScore(2); r.sfx('tick'); } if (fy <= 0) { round++; fx = 4; fy = ROWS - 1; build(); r.win('הגעת לצד השני!', 50); } },
      update(dt) { for (const l of lanes) for (const c of l.cars) { c.x += l.dir * l.sp * dt; if (c.x > r.W + 40) c.x = -40; if (c.x < -40) c.x = r.W + 40;
        if (l.y === fy && Math.abs(c.x - (fx * S + S / 2)) < 32) return r.over('נדרסת! זהירות.'); } },
      draw() { r.clear('#374151'); r.rect(0, 0, r.W, S, '#16A34A'); r.rect(0, (ROWS - 1) * S, r.W, S, '#16A34A'); [3, 6, 9].forEach(j => r.rect(0, j * S, r.W, S, '#4B5563')); for (let j = 1; j < ROWS - 1; j++) if (j % 3 !== 0) for (let x = 0; x < r.W; x += 30) r.rect(x, j * S + S - 1, 16, 2, '#9CA3AF');
        lanes.forEach(l => l.cars.forEach(c => { r.ctx.save(); r.ctx.translate(c.x, l.y * S + S / 2); r.ctx.rotate(l.dir > 0 ? -Math.PI / 2 : Math.PI / 2); SP.car(r, 0, 0, 28, 52, l.color, 1); r.ctx.restore(); })); SP.frog(r, fx * S + S / 2, fy * S + S / 2); },
    };
  } });

// ---- מבוך נקודות ----
G.push({ id: 'dots-maze', name: 'מבוך הנקודות', emoji: '🟡', how: 'מחליקים לכיוון. אוכלים את כל הנקודות ובורחים מהרוחות.',
  make(r) {
    const M = ['###########', '#.........#', '#.##.#.##.#', '#.........#', '#.#.###.#.#', '#.#..#..#.#', '#.#.###.#.#', '#.........#', '#.##.#.##.#', '#....#....#', '#.##.#.##.#', '#.........#', '###########'];
    const S = 32, OX = (r.W - 11 * S) / 2, OY = 40; const wall = (x, y) => (M[y] || '#')[x] !== '.' && (M[y] || '#')[x] !== undefined ? (M[y][x] === '#') : true;
    const dots = new Set(); M.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.') dots.add(x + ',' + y); }));
    let p = { x: 1, y: 1, d: [0, 0], want: [0, 0] }, ghosts = [{ x: 9, y: 11, d: [0, -1] }, { x: 5, y: 5, d: [1, 0] }], t = 0, gt = 0;
    dots.delete('1,1');
    const free = (x, y) => M[y] && M[y][x] === '.';
    return {
      swipe(d) { p.want = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d]; },
      update(dt) { t += dt; gt += dt;
        if (t > 0.16) { t = 0; if (free(p.x + p.want[0], p.y + p.want[1])) p.d = p.want; if (free(p.x + p.d[0], p.y + p.d[1])) { p.x += p.d[0]; p.y += p.d[1]; } const k = p.x + ',' + p.y; if (dots.has(k)) { dots.delete(k); r.addScore(10); } }
        if (gt > 0.24) { gt = 0; for (const g of ghosts) { const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => free(g.x + d[0], g.y + d[1]) && !(d[0] === -g.d[0] && d[1] === -g.d[1])); const d = opts.length ? (Math.random() < 0.3 ? opts.sort((a, b) => r.dist(g.x + a[0], g.y + a[1], p.x, p.y) - r.dist(g.x + b[0], g.y + b[1], p.x, p.y))[0] : r.pick(opts)) : [-g.d[0], -g.d[1]]; g.d = d; g.x += d[0]; g.y += d[1]; } }
        if (ghosts.some(g => g.x === p.x && g.y === p.y)) return r.over('הרוח תפסה אותך!');
        if (!dots.size) { M.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.' && !(x === p.x && y === p.y)) dots.add(x + ',' + y); })); r.win('אכלת הכול!', 100); } },
      draw() { r.clear('#0B1026'); M.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r.rect(OX + x * S, OY + y * S, S, S, '#1E3A8A', 4); }));
        dots.forEach(k => { const [x, y] = k.split(',').map(Number); r.circle(OX + x * S + S / 2, OY + y * S + S / 2, 4, r.C.gold); });
        ghosts.forEach((g, i) => r.emoji(['👻', '🎃'][i], OX + g.x * S + S / 2, OY + g.y * S + S / 2, 26)); r.circle(OX + p.x * S + S / 2, OY + p.y * S + S / 2, 13, r.C.gold); },
    };
  } });

// ---- קפיצות לגובה ----
G.push({ id: 'doodle', name: 'קפיצות לשמיים', emoji: '🐰', how: 'הארנב קופץ לבד. מזיזים אותו ימינה ושמאלה עם האצבע ונוחתים על הפלטפורמות. כמה גבוה תגיע?',
  make(r) {
    let x = r.W / 2, y = r.H - 100, vy = -600, plats = [], top = 0, height = 0;
    for (let i = 0; i < 9; i++) plats.push({ x: r.rnd(30, r.W - 30), y: r.H - 40 - i * 65 });
    return {
      move(px) { x = r.clamp(px, 16, r.W - 16); }, down(px) { this.move(px); },
      update(dt) { vy += 1000 * dt; y += vy * dt;
        if (vy > 0) for (const p of plats) if (Math.abs(x - p.x) < 40 && y + 16 > p.y - 6 && y + 16 < p.y + 12) { vy = p.spring ? -900 : -620; r.sfx(p.spring ? 'score' : 'bounce'); if (p.spring) r.pop('קפיץ!', x, y - 40, r.C.hot); }
        if (y < r.H / 2) { const d = r.H / 2 - y; y = r.H / 2; height += d; plats.forEach(p => p.y += d); r.setScore(Math.floor(height / 10)); }
        plats = plats.filter(p => p.y < r.H + 20); while (plats.length < 9) { top = Math.min(...plats.map(p => p.y)); plats.push({ x: r.rnd(30, r.W - 30), y: top - r.rnd(55, 80), spring: Math.random() < 0.12 }); }
        if (y > r.H + 20) r.over('נפלת!'); },
      draw() { r.clear('#BAE6FD'); plats.forEach(p => { r.rect(p.x - 36, p.y, 72, 12, '#16A34A', 6); r.rect(p.x - 30, p.y + 2, 60, 3, '#4ADE80', 2); if (p.spring) r.rect(p.x - 10, p.y - 8, 20, 8, r.C.hot, 3); }); r.player(vy < 0 ? POSE.hop : POSE.front, x, y + 16, 0.36, KITS.blue); },
    };
  } });

export default G;

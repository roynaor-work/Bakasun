// משחקי ספורט וקפיצה
const G = [];

// עזר: גרירה מהכדור לקביעת כיוון וכוח
const dragShot = (r, getOrigin, onShoot, maxLen = 150) => {
  let sx = 0, sy = 0, dragging = false, cx = 0, cy = 0;
  return {
    down(x, y) { const [ox, oy] = getOrigin(); if (r.dist(x, y, ox, oy) < 60) { dragging = true; sx = x; sy = y; cx = x; cy = y; } },
    move(x, y) { if (dragging) { cx = x; cy = y; } },
    up(x, y) { if (!dragging) return; dragging = false; const dx = sx - x, dy = sy - y, len = Math.min(maxLen, Math.hypot(dx, dy)); if (len > 10) onShoot(dx / Math.hypot(dx, dy) * len, dy / Math.hypot(dx, dy) * len, len / maxLen); },
    drawAim() { if (!dragging) return; const [ox, oy] = getOrigin(); r.line(ox, oy, ox + (sx - cx), oy + (sy - cy), '#ffffffaa', 4); },
  };
};

// ---- פנדלים ----
G.push({ id: 'penalty', name: 'פנדלים', emoji: '⚽', how: 'נוגעים איפה בשער לבעוט. השוער מנסה לנחש. כל שער נקודות.',
  make(r) {
    const goal = { x: 40, y: 70, w: 280, h: 120 }; let ball = { x: r.W / 2, y: r.H - 90, tx: 0, ty: 0, t: -1 }, gk = { x: r.W / 2, tx: r.W / 2 }, msg = '', mt = 0;
    return {
      tap(x, y) { if (ball.t >= 0) return; ball.tx = r.clamp(x, 20, r.W - 20); ball.ty = r.clamp(y, 40, r.H - 200); ball.t = 0; gk.tx = r.rnd(0.35, 0.65) < 0.5 ? r.pick([goal.x + 50, r.W / 2, goal.x + goal.w - 50]) : ball.tx + r.rnd(-70, 70); },
      update(dt) { mt -= dt; if (ball.t < 0) return; ball.t += dt * 1.6; gk.x += r.clamp(gk.tx - gk.x, -300 * dt, 300 * dt);
        if (ball.t >= 1) { const inGoal = ball.tx > goal.x && ball.tx < goal.x + goal.w && ball.ty > goal.y && ball.ty < goal.y + goal.h; const saved = Math.abs(gk.x - ball.tx) < 38 && ball.ty > goal.y + 10;
          if (inGoal && !saved) { r.addScore(10); msg = 'גול! ⚽'; } else msg = saved ? 'השוער עצר! 🧤' : 'החוצה...'; mt = 0.9; ball = { x: r.W / 2, y: r.H - 90, tx: 0, ty: 0, t: -1 }; gk.tx = r.W / 2; } },
      draw() { r.clear('#15803D'); r.rect(goal.x, goal.y, goal.w, goal.h, '#ffffff22'); r.line(goal.x, goal.y, goal.x + goal.w, goal.y, '#fff', 6); r.line(goal.x, goal.y, goal.x, goal.y + goal.h, '#fff', 6); r.line(goal.x + goal.w, goal.y, goal.x + goal.w, goal.y + goal.h, '#fff', 6);
        r.emoji('🧤', gk.x, goal.y + 70, 40); const p = ball.t < 0 ? 0 : ball.t; const bx = ball.x + (ball.tx - ball.x) * p, by = ball.y + (ball.ty - ball.y) * p; r.emoji('⚽', bx, by, 34 - p * 14);
        if (mt > 0) r.text(msg, r.W / 2, r.H / 2, { size: 30, color: r.C.gold }); },
    };
  } });

// ---- כדורסל ----
G.push({ id: 'basketball', name: 'כדורסל', emoji: '🏀', how: 'גוררים מהכדור אחורה ומשחררים כדי לזרוק. מכניסים לסל.',
  make(r) {
    let ball = { x: 80, y: r.H - 80, vx: 0, vy: 0, fly: false }, hoop = { x: 260, y: 200 }, shots = 0;
    const reset = () => { ball = { x: r.rnd(60, 140), y: r.H - 80, vx: 0, vy: 0, fly: false }; };
    const d = dragShot(r, () => [ball.x, ball.y], (dx, dy, p) => { ball.vx = dx * 5; ball.vy = dy * 5; ball.fly = true; shots++; }, 140);
    return {
      down: d.down, move: d.move, up: d.up,
      update(dt) { if (!ball.fly) return; ball.vy += 800 * dt; const py = ball.y; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.vy > 0 && py < hoop.y && ball.y >= hoop.y && Math.abs(ball.x - hoop.x) < 24) { r.addScore(20); hoop = { x: r.rnd(200, 320), y: r.rnd(150, 260) }; reset(); return; }
        if (ball.x > r.W + 30 || ball.y > r.H + 30 || ball.x < -30) reset(); },
      draw() { r.clear('#F59E0B'); r.rect(0, r.H - 40, r.W, 40, '#92400E'); r.rect(hoop.x + 30, hoop.y - 60, 8, 120, '#374151'); r.rect(hoop.x + 20, hoop.y - 50, 12, 50, '#fff'); r.line(hoop.x - 28, hoop.y, hoop.x + 28, hoop.y, '#EF4444', 6); for (let i = -20; i <= 20; i += 10) r.line(hoop.x + i, hoop.y, hoop.x + i * 0.6, hoop.y + 30, '#ffffffaa', 2);
        d.drawAim(); r.emoji('🏀', ball.x, ball.y, 32); },
    };
  } });

// ---- מיני גולף ----
G.push({ id: 'golf', name: 'מיני גולף', emoji: '⛳', how: 'גוררים מהכדור ומשחררים. מכניסים לגומה בכמה שפחות חבטות.',
  make(r) {
    let ball = { x: 80, y: r.H - 80, vx: 0, vy: 0 }, hole = { x: 280, y: 120 }, walls = [], strokes = 0;
    const layout = () => { walls = [{ x: r.rnd(60, 200), y: r.rnd(200, 380), w: r.rnd(80, 160), h: 14 }, { x: r.rnd(100, 300), y: r.rnd(150, 300), w: 14, h: r.rnd(60, 140) }]; hole = { x: r.rnd(40, r.W - 40), y: r.rnd(60, 160) }; };
    layout();
    const d = dragShot(r, () => [ball.x, ball.y], (dx, dy) => { if (Math.hypot(ball.vx, ball.vy) < 5) { ball.vx = dx * 4; ball.vy = dy * 4; strokes++; } }, 150);
    return {
      down: d.down, move: d.move, up: d.up,
      update(dt) { ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= 1 - 1.4 * dt; ball.vy *= 1 - 1.4 * dt;
        if (ball.x < 10) { ball.x = 10; ball.vx *= -0.8; } if (ball.x > r.W - 10) { ball.x = r.W - 10; ball.vx *= -0.8; } if (ball.y < 10) { ball.y = 10; ball.vy *= -0.8; } if (ball.y > r.H - 10) { ball.y = r.H - 10; ball.vy *= -0.8; }
        for (const w of walls) if (r.hit(ball.x - 8, ball.y - 8, 16, 16, w.x, w.y, w.w, w.h)) { if (w.w > w.h) { ball.vy *= -0.8; ball.y += ball.vy > 0 ? 6 : -6; } else { ball.vx *= -0.8; ball.x += ball.vx > 0 ? 6 : -6; } }
        if (r.dist(ball.x, ball.y, hole.x, hole.y) < 14 && Math.hypot(ball.vx, ball.vy) < 260) { r.addScore(Math.max(10, 60 - strokes * 10)); strokes = 0; ball = { x: r.rnd(40, r.W - 40), y: r.H - 80, vx: 0, vy: 0 }; layout(); } },
      draw() { r.clear('#16A34A'); walls.forEach(w => r.rect(w.x, w.y, w.w, w.h, '#78350F', 4)); r.circle(hole.x, hole.y, 14, '#052E16'); r.emoji('⛳', hole.x + 12, hole.y - 16, 22); d.drawAim(); r.circle(ball.x, ball.y, 8, '#fff'); r.text(`חבטות: ${strokes}`, r.W / 2, r.H - 20, { size: 16, color: '#ffffffcc' }); },
    };
  } });

// ---- באולינג ----
G.push({ id: 'bowling', name: 'באולינג', emoji: '🎳', how: 'מחליקים את הכדור למעלה לכיוון הפינים. כל פין שנופל נקודות.',
  make(r) {
    let pins = [], ball = null, cooldown = 0;
    const setPins = () => { pins = []; [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3]].forEach((row, j) => row.forEach(i => pins.push({ x: r.W / 2 + i * 20, y: 130 - j * 24, up: true }))); };
    setPins();
    return {
      swipe(d, dx, dy) { if (ball || dy >= 0) return; const len = Math.hypot(dx, dy); ball = { x: r.W / 2 + r.clamp(dx, -60, 60), y: r.H - 60, vx: dx / len * 200, vy: -Math.max(450, Math.min(800, len * 4)) }; },
      update(dt) { if (cooldown > 0) { cooldown -= dt; if (cooldown <= 0) { if (pins.every(p => !p.up)) r.addScore(30); setPins(); } return; }
        if (!ball) return; ball.x += ball.vx * dt; ball.y += ball.vy * dt; if (ball.x < 20 || ball.x > r.W - 20) ball.vx *= -1;
        for (const p of pins) if (p.up && r.dist(ball.x, ball.y, p.x, p.y) < 22) { p.up = false; r.addScore(10); ball.vx += (p.x - ball.x) * -3; for (const q of pins) if (q.up && q !== p && r.dist(p.x, p.y, q.x, q.y) < 30 && Math.random() < 0.6) { q.up = false; r.addScore(10); } }
        if (ball.y < -20) { ball = null; cooldown = 1.2; } },
      draw() { r.clear('#7C2D12'); r.rect(40, 0, r.W - 80, r.H, '#D6A66B'); r.line(40, 0, 40, r.H, '#1F2937', 8); r.line(r.W - 40, 0, r.W - 40, r.H, '#1F2937', 8);
        pins.forEach(p => { if (p.up) r.emoji('🎳', p.x, p.y, 26); else r.rect(p.x - 8, p.y - 3, 16, 6, '#ffffff55', 3); }); if (ball) r.circle(ball.x, ball.y, 14, '#1D4ED8'); else r.circle(r.W / 2, r.H - 60, 14, '#1D4ED8'); r.text('החלק למעלה ↑', r.W / 2, r.H - 25, { size: 14, color: '#00000088' }); },
    };
  } });

// ---- חץ וקשת ----
G.push({ id: 'archery', name: 'חץ וקשת', emoji: '🏹', how: 'המטרה זזה. נוגעים כדי לירות חץ ישר למעלה. מרכז המטרה שווה 10.',
  make(r) {
    let tx = r.W / 2, dir = 1, sp = 120, arrows = [], hits = [], shots = 0;
    return {
      tap() { arrows.push({ x: r.W / 2, y: r.H - 80 }); },
      update(dt) { tx += dir * sp * dt; if (tx < 50 || tx > r.W - 50) dir *= -1; arrows.forEach(a => a.y -= 600 * dt);
        for (const a of arrows) if (a.y <= 110) { const d = Math.abs(a.x - tx); const pts = d < 8 ? 10 : d < 20 ? 7 : d < 34 ? 4 : d < 48 ? 1 : 0; r.addScore(pts); hits.push({ x: a.x - tx, t: 1.5, pts }); a.y = -99; shots++; if (shots % 5 === 0) sp += 25; }
        arrows = arrows.filter(a => a.y > 0); hits.forEach(h => h.t -= dt); hits = hits.filter(h => h.t > 0); },
      draw() { r.clear('#BFDBFE'); r.rect(0, r.H - 40, r.W, 40, '#65A30D'); [[48, '#fff'], [34, '#111'], [20, '#3B82F6'], [8, '#EF4444']].forEach(([rad, c]) => r.circle(tx, 110, rad, c)); r.circle(tx, 110, 3, '#FDE047');
        hits.forEach(h => { r.line(tx + h.x, 118, tx + h.x, 100, '#78350F', 3); if (h.pts) r.text('+' + h.pts, tx + h.x, 70, { size: 18, color: '#1E3A8A' }); }); arrows.forEach(a => r.line(a.x, a.y, a.x, a.y + 30, '#78350F', 4)); r.emoji('🏹', r.W / 2, r.H - 70, 40); },
    };
  } });

// ---- מכונית ----
G.push({ id: 'racing', name: 'כביש מהיר', emoji: '🏎️', how: 'נוגעים בצד שמאל או ימין כדי לעבור נתיב. מתחמקים מהמכוניות ואוספים מטבעות.',
  make(r) {
    const L = [70, 180, 290]; let lane = 1, cars = [], t = 0, speed = 260, roadY = 0;
    return {
      tap(x) { lane = r.clamp(lane + (x < r.W / 2 ? -1 : 1), 0, 2); }, swipe(d) { if (d === 'left') lane = Math.max(0, lane - 1); if (d === 'right') lane = Math.min(2, lane + 1); },
      update(dt) { speed += 5 * dt; roadY = (roadY + speed * dt) % 60; t += dt; if (t > 0.9) { t = 0; const l = r.rint(0, 2); cars.push({ l, y: -60, coin: Math.random() < 0.35 }); }
        cars.forEach(c => c.y += speed * dt); cars = cars.filter(c => c.y < r.H + 60);
        for (const c of cars) if (c.l === lane && Math.abs(c.y - (r.H - 90)) < 45) { if (c.coin) { r.addScore(10); c.y = r.H + 100; } else return r.over('התנגשות!'); }
        if (Math.floor(roadY) < 5) r.addScore(0.3); },
      draw() { r.clear('#111827'); r.rect(20, 0, r.W - 40, r.H, '#374151'); for (let y = -60 + roadY; y < r.H; y += 60) { r.rect(123, y, 6, 30, '#FDE047'); r.rect(233, y, 6, 30, '#FDE047'); }
        cars.forEach(c => r.emoji(c.coin ? '🪙' : '🚗', L[c.l], c.y, 34)); r.emoji('🏎️', L[lane], r.H - 90, 36); },
    };
  } });

// ---- מסוק במערה ----
G.push({ id: 'heli', name: 'מסוק במערה', emoji: '🚁', how: 'מחזיקים את האצבע כדי לעלות, משחררים כדי לרדת. לא לגעת בקירות.',
  make(r) {
    let y = r.H / 2, vy = 0, segs = [], dist = 0, gap = 260;
    for (let i = 0; i < 12; i++) segs.push({ x: i * 40, top: 60 + Math.sin(i / 2) * 40 });
    return {
      update(dt) { vy += (r.isDown ? -900 : 900) * dt; vy = r.clamp(vy, -300, 300); y += vy * dt; dist += 180 * dt;
        segs.forEach(s => s.x -= 180 * dt); if (segs[0].x < -40) { segs.shift(); const last = segs[segs.length - 1]; segs.push({ x: last.x + 40, top: r.clamp(last.top + r.rnd(-40, 40), 30, r.H - gap - 30) }); gap = Math.max(150, gap - 0.5); r.addScore(1); }
        const s = segs.find(s => s.x <= 90 && s.x + 40 > 90); if (s && (y - 14 < s.top || y + 14 > s.top + gap)) r.over('פגעת בקיר!'); },
      draw() { r.clear('#1F2937'); segs.forEach(s => { r.rect(s.x, 0, 41, s.top, '#78350F'); r.rect(s.x, s.top + gap, 41, r.H, '#78350F'); }); r.emoji('🚁', 90, y, 34); },
    };
  } });

// ---- טנקים ----
G.push({ id: 'tanks', name: 'ארטילריה', emoji: '💣', how: 'גוררים מהטנק כדי לכוון ולקבוע כוח, ומשחררים. פוגעים בטנק היריב.',
  make(r) {
    let me = { x: 50, y: r.H - 70 }, foe = { x: r.rnd(220, 330), y: r.H - 70 }, shell = null, wind = r.rnd(-60, 60), hill = 0;
    const d = dragShot(r, () => [me.x, me.y], (dx, dy) => { if (!shell) shell = { x: me.x, y: me.y - 10, vx: dx * 4.5, vy: dy * 4.5 }; }, 160);
    return {
      down: d.down, move: d.move, up: d.up,
      update(dt) { if (!shell) return; shell.vy += 600 * dt; shell.vx += wind * dt; shell.x += shell.vx * dt; shell.y += shell.vy * dt;
        if (r.dist(shell.x, shell.y, foe.x, foe.y) < 26) { r.addScore(50); foe = { x: r.rnd(200, 340), y: r.H - 70 }; wind = r.rnd(-80, 80); shell = null; }
        else if (shell.y > r.H - 60 || shell.x > r.W + 50 || shell.x < -50) shell = null; },
      draw() { r.clear('#7DD3FC'); r.rect(0, r.H - 60, r.W, 60, '#65A30D'); r.text(`רוח ${wind > 0 ? '→' : '←'} ${Math.abs(Math.round(wind / 10))}`, r.W / 2, 30, { size: 16, color: '#1E3A8A' });
        r.emoji('🚙', me.x, me.y, 34); r.emoji('🚜', foe.x, foe.y, 34); d.drawAim(); if (shell) r.circle(shell.x, shell.y, 6, '#111'); },
    };
  } });

// ---- תותח ----
G.push({ id: 'cannon', name: 'תותח נגד מגדל', emoji: '🏰', how: 'נוגעים איפה לירות. כדור התותח מפיל בלוקים. מפילים את כל המגדל.',
  make(r) {
    let blocks = [], balls = [], cd = 0;
    const build = () => { blocks = []; const cols = r.rint(2, 3); for (let i = 0; i < cols; i++) for (let j = 0; j < r.rint(4, 7); j++) blocks.push({ x: 220 + i * 34, y: r.H - 60 - j * 30, w: 30, h: 28, c: r.pick([r.C.hot, r.C.gold, r.C.pink, r.C.teal]) }); };
    build();
    return {
      tap(x, y) { if (cd > 0) return; cd = 0.5; const dx = x - 40, dy = y - (r.H - 80), len = Math.hypot(dx, dy); balls.push({ x: 40, y: r.H - 80, vx: dx / len * 520, vy: dy / len * 520 }); },
      update(dt) { cd -= dt; balls.forEach(b => { b.vy += 500 * dt; b.x += b.vx * dt; b.y += b.vy * dt; });
        for (const b of balls) { const i = blocks.findIndex(k => r.hit(b.x - 7, b.y - 7, 14, 14, k.x, k.y, k.w, k.h)); if (i >= 0) { blocks.splice(i, 1); r.addScore(10); b.vx *= 0.6; b.vy = -Math.abs(b.vy) * 0.3; } }
        blocks.sort((a, b) => b.y - a.y).forEach(k => { const below = blocks.find(o => o !== k && o.x === k.x && Math.abs(o.y - (k.y + 30)) < 2); if (!below && k.y < r.H - 60) k.y += 300 * dt; if (k.y > r.H - 60) k.y = r.H - 60; });
        balls = balls.filter(b => b.y < r.H + 20 && b.x < r.W + 20); if (!blocks.length) { build(); r.win('המגדל נפל!', 50); } },
      draw() { r.clear('#FEF3C7'); r.rect(0, r.H - 32, r.W, 32, '#78350F'); blocks.forEach(k => r.rect(k.x, k.y, k.w, k.h, k.c, 3)); balls.forEach(b => r.circle(b.x, b.y, 7, '#111')); r.rect(20, r.H - 92, 44, 24, '#374151', 6); r.circle(30, r.H - 60, 14, '#111'); },
    };
  } });

// ---- דיג ----
G.push({ id: 'fishing', name: 'דיג', emoji: '🎣', how: 'מחזיקים כדי להוריד את הקרס, משחררים כדי להעלות. דג גדול שווה יותר.',
  make(r) {
    let hy = 80, fish = [], caught = null, t = 0;
    return {
      update(dt) { hy = r.clamp(hy + (r.isDown && !caught ? 220 : -260) * dt, 80, r.H - 20); t += dt;
        if (t > 0.8 && fish.length < 7) { t = 0; const dir = r.pick([-1, 1]); fish.push({ x: dir > 0 ? -30 : r.W + 30, y: r.rnd(160, r.H - 40), dir, s: r.rint(1, 3), e: r.pick(['🐟', '🐠', '🐡']) }); }
        fish.forEach(f => f.x += f.dir * (60 + 30 * (4 - f.s)) * dt); fish = fish.filter(f => f.x > -60 && f.x < r.W + 60);
        if (!caught) { const i = fish.findIndex(f => r.dist(f.x, f.y, r.W / 2, hy) < 18); if (i >= 0) { caught = fish[i]; fish.splice(i, 1); } }
        if (caught) { caught.x = r.W / 2; caught.y = hy + 10; if (hy <= 81) { r.addScore(caught.s * 10); caught = null; } } },
      draw() { r.clear('#0EA5E9'); r.rect(0, 0, r.W, 80, '#7DD3FC'); r.rect(0, 130, r.W, r.H, '#0369A1'); r.emoji('🛶', r.W / 2 - 20, 66, 40); r.line(r.W / 2, 60, r.W / 2, hy, '#fff', 2); r.emoji('🪝', r.W / 2, hy, 16);
        fish.forEach(f => r.emoji(f.e, f.x, f.y, 18 + f.s * 8)); if (caught) r.emoji(caught.e, caught.x, caught.y, 18 + caught.s * 8); },
    };
  } });

// ---- קפיצה בחבל ----
G.push({ id: 'rope-timing', name: 'קפיצה בחבל בזמן', emoji: '🪢', how: 'החבל מסתובב. נוגעים בדיוק כשהוא מגיע למטה כדי לקפוץ. החבל מתגבר.',
  make(r) {
    let ang = 0, sp = 3.2, jy = 0, vy = 0, jumped = false, combo = 0;
    return {
      tap() { if (jy === 0) { vy = -420; } },
      update(dt) { ang += sp * dt; vy += 1200 * dt; jy = Math.min(0, jy + vy * dt); if (jy === 0) vy = 0;
        const bottom = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (bottom > Math.PI - 0.2 && bottom < Math.PI + 0.2) { if (jy < -10) { if (!jumped) { jumped = true; combo++; r.addScore(5 + Math.min(combo, 10)); if (combo % 5 === 0) sp += 0.5; } } else return r.over('החבל תפס את הרגליים!'); }
        else jumped = false; },
      draw() { r.clear('#FDF2F8'); r.rect(0, r.H - 60, r.W, 60, '#F9A8D4'); const cx = r.W / 2, cy = r.H - 200; const ry = 150 * Math.sin(ang), rx = 120;
        r.ctx.strokeStyle = '#7C3AED'; r.ctx.lineWidth = 4; r.ctx.beginPath(); r.ctx.ellipse(cx, cy, rx, Math.abs(ry), 0, ry > 0 ? 0 : Math.PI, ry > 0 ? Math.PI : Math.PI * 2); r.ctx.stroke();
        r.emoji('🧍', cx, cy + jy, 90); r.text(`רצף: ${combo}`, cx, 40, { size: 20, color: '#7C3AED' }); },
    };
  } });

// ---- סקי ----
G.push({ id: 'ski', name: 'סקי סלאלום', emoji: '⛷️', how: 'מזיזים את הגולש עם האצבע. עוברים בין הדגלים ומתחמקים מהעצים.',
  make(r) {
    let x = r.W / 2, items = [], t = 0, sp = 200;
    return {
      move(px) { x = r.clamp(px, 16, r.W - 16); }, down(px) { this.move(px); },
      update(dt) { sp += 4 * dt; t += dt; if (t > 0.7) { t = 0; if (Math.random() < 0.6) { const gx = r.rnd(70, r.W - 70); items.push({ k: 'gate', x: gx, y: r.H + 20, passed: false }); } else items.push({ k: 'tree', x: r.rnd(20, r.W - 20), y: r.H + 20 }); }
        items.forEach(i => i.y -= sp * dt); items = items.filter(i => i.y > -40);
        for (const i of items) { if (i.k === 'gate' && !i.passed && i.y < 120) { i.passed = true; if (Math.abs(x - i.x) < 50) r.addScore(10); } if (i.k === 'tree' && r.dist(i.x, i.y, x, 120) < 24) return r.over('נכנסת בעץ!'); } },
      draw() { r.clear('#F8FAFC'); items.forEach(i => { if (i.k === 'gate') { r.emoji('🚩', i.x - 50, i.y, 26); r.emoji('🚩', i.x + 50, i.y, 26); } else r.emoji('🌲', i.x, i.y, 30); }); r.emoji('⛷️', x, 120, 34); },
    };
  } });

// ---- משוכות ----
G.push({ id: 'hurdles', name: 'ריצת משוכות', emoji: '🏃‍♂️', how: 'נוגעים בזמן כדי לקפוץ מעל כל משוכה. פגיעה מאיטה אותך.',
  make(r) {
    const GY = r.H - 100; let y = GY, vy = 0, hs = [], t = 0, sp = 240, cleared = 0;
    return {
      tap() { if (y >= GY - 1) vy = -560; },
      update(dt) { vy += 1400 * dt; y = Math.min(GY, y + vy * dt); sp = Math.min(420, sp + 8 * dt); t += dt; if (t > 1.1) { t = 0; hs.push({ x: r.W + 20, hit: false, passed: false }); }
        hs.forEach(h => h.x -= sp * dt); hs = hs.filter(h => h.x > -40);
        for (const h of hs) { if (!h.hit && !h.passed && Math.abs(h.x - 70) < 16) { if (y > GY - 40) { h.hit = true; sp = 200; r.addScore(-5); } } if (!h.passed && h.x < 50) { h.passed = true; if (!h.hit) { cleared++; r.addScore(10); } } } },
      draw() { r.clear('#DBEAFE'); r.rect(0, GY, r.W, r.H - GY, '#B45309'); for (let i = 0; i < 8; i++) r.rect(i * 50, GY + 20, 40, 4, '#fff'); hs.forEach(h => { r.rect(h.x - 3, GY - 44, 6, 44, h.hit ? '#9CA3AF' : '#fff'); r.rect(h.x - 22, GY - 44, 44, 6, h.hit ? '#9CA3AF' : '#EF4444'); }); r.emoji(y < GY - 2 ? '🤾' : '🏃', 70, y - 22, 38); },
    };
  } });

// ---- קפיצה לרוחק ----
G.push({ id: 'long-jump', name: 'קפיצה לרוחק', emoji: '🥇', how: 'נוגעים מהר כדי לצבור מהירות, וכשמגיעים לקו הלבן נוגעים ארוכות לקפוץ. מי קופץ הכי רחוק?',
  make(r) {
    let x = 20, sp = 0, phase = 'run', jy = 0, vy = 0, res = '', rt = 0, best = 0; const LINE = 230;
    return {
      tap() { if (phase === 'run') sp = Math.min(320, sp + 28); },
      down() { if (phase === 'run' && x > LINE - 40 && x <= LINE + 6) { phase = 'air'; vy = -380; } },
      update(dt) { rt -= dt; if (phase === 'run') { sp = Math.max(0, sp - 40 * dt); x += sp * dt; if (x > LINE + 6) { phase = 'foul'; res = 'פסול! קפצת אחרי הקו'; rt = 1.5; } }
        if (phase === 'air') { vy += 700 * dt; jy += vy * dt; x += sp * dt; if (jy >= 0) { jy = 0; const m = Math.max(0, (x - LINE) / 40); res = `${m.toFixed(2)} מטר!`; r.addScore(Math.round(m * 10)); phase = 'done'; rt = 1.5; if (m > best) best = m; } }
        if ((phase === 'done' || phase === 'foul') && rt <= 0) { phase = 'run'; x = 20; sp = 0; jy = 0; } },
      draw() { r.clear('#FCE7F3'); r.rect(0, r.H - 120, r.W, 120, '#DC2626'); r.rect(LINE, r.H - 120, 4, 120, '#fff'); r.rect(LINE + 4, r.H - 120, r.W, 120, '#FBBF24'); for (let m = 1; m <= 3; m++) { r.line(LINE + m * 40, r.H - 120, LINE + m * 40, r.H - 100, '#fff', 2); r.text(m + 'מ', LINE + m * 40, r.H - 85, { size: 12, color: '#7C2D12' }); }
        r.emoji(phase === 'air' ? '🤸' : '🏃', x, r.H - 150 + jy, 38); r.rect(20, 30, r.W - 40, 14, '#00000022', 7); r.rect(20, 30, (r.W - 40) * sp / 320, 14, r.C.ok, 7); r.text('מהירות', r.W / 2, 60, { size: 14, color: '#831843' });
        if (rt > 0) r.text(res, r.W / 2, r.H / 2 - 40, { size: 26, color: '#831843' }); if (best) r.text(`השיא: ${best.toFixed(2)} מ׳`, r.W / 2, 90, { size: 16, color: '#831843' }); },
    };
  } });

export default G;

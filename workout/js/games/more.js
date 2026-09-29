// עוד משחקים: חץ למטרה, ביליארד, כדורעף, דוחף קופסאות, ציור לפי מספרים, ניחוש מילה, צייר מהזיכרון, איפה הכדור
import { POSE, S, KITS } from './sprites.js';
export const arcade = [], sport = [], puzzle = [], quick = [];

// ---- חץ למטרה ----
sport.push({ id: 'darts', name: 'חץ למטרה', emoji: '🎯', how: 'הכוונת נעה כל הזמן. נוגעים כדי לזרוק את החץ בדיוק כשהיא על המרכז.',
  make(r) {
    let t = 0, hits = [], sp = 1;
    const pos = () => [r.W / 2 + Math.sin(t * 1.7 * sp) * 90, 210 + Math.cos(t * 2.3 * sp) * 90];
    return {
      update(dt) { t += dt; hits.forEach(h => h.t -= dt); hits = hits.filter(h => h.t > 0); },
      tap() { const [x, y] = pos(); const d = r.dist(x, y, r.W / 2, 210); const pts = d < 10 ? 50 : d < 25 ? 25 : d < 50 ? 10 : d < 80 ? 5 : 0; r.addScore(pts); hits.push({ x, y, t: 1.2, pts }); if (pts === 50) { r.pop('בול! +50', r.W / 2, 90, '#EF4444', 30); r.burst(x, y, '#EF4444', 20, 220); r.sfx('win'); } else if (pts) r.sfx('score'); else r.sfx('hit'); if (pts >= 25) sp = Math.min(2.2, sp + 0.1); },
      draw() { r.clear('#FEF9C3'); [[100, '#111'], [80, '#fff'], [50, '#EF4444'], [25, '#fff'], [10, '#EF4444']].forEach(([rad, c]) => r.circle(r.W / 2, 210, rad, c)); const [x, y] = pos(); r.line(x - 16, y, x + 16, y, '#2563EB', 3); r.line(x, y - 16, x, y + 16, '#2563EB', 3); r.circle(x, y, 8, '#2563EB44');
        hits.forEach(h => { r.emoji('🎯', h.x, h.y, 16); if (h.pts) r.text('+' + h.pts, h.x, h.y - 24, { size: 18, color: '#B91C1C' }); }); r.text('לחץ כשהכוונת במרכז', r.W / 2, r.H - 60, { size: 18, color: '#713F12' }); },
    };
  } });

// ---- ביליארד ----
sport.push({ id: 'pool', name: 'ביליארד', emoji: '🎱', how: 'גוררים מהכדור הלבן אחורה ומשחררים. מכניסים את הכדורים הצבעוניים לחורים.',
  make(r) {
    let balls; const pockets = [[16, 16], [r.W - 16, 16], [16, r.H / 2], [r.W - 16, r.H / 2], [16, r.H - 16], [r.W - 16, r.H - 16]];
    const rack = () => { balls = [{ x: r.W / 2, y: r.H - 120, vx: 0, vy: 0, c: '#fff', white: true }]; const cols = [r.C.gold, r.C.sky, r.C.red, r.C.accent, r.C.hot, r.C.lime]; let i = 0; for (let row = 0; row < 3; row++) for (let k = 0; k <= row; k++) balls.push({ x: r.W / 2 + (k - row / 2) * 26, y: 150 - row * 23, vx: 0, vy: 0, c: cols[i++ % 6] }); };
    rack();
    const white = () => balls.find(b => b.white);
    const moving = () => balls.some(b => Math.hypot(b.vx, b.vy) > 4);
    let drag = null;
    return {
      down(x, y) { const w = white(); if (w && !moving() && r.dist(x, y, w.x, w.y) < 60) drag = { x, y }; },
      move(x, y) { if (drag) { drag.cx = x; drag.cy = y; } },
      up(x, y) { if (!drag) return; const w = white(); const dx = drag.x - x, dy = drag.y - y, l = Math.min(180, Math.hypot(dx, dy)); if (l > 8 && w) { w.vx = dx / Math.hypot(dx, dy) * l * 5; w.vy = dy / Math.hypot(dx, dy) * l * 5; } drag = null; },
      update(dt) { for (const b of balls) { b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - 1.2 * dt; b.vy *= 1 - 1.2 * dt; if (Math.hypot(b.vx, b.vy) < 4) { b.vx = 0; b.vy = 0; }
          if (b.x < 24) { b.x = 24; b.vx = Math.abs(b.vx) * 0.8; } if (b.x > r.W - 24) { b.x = r.W - 24; b.vx = -Math.abs(b.vx) * 0.8; } if (b.y < 24) { b.y = 24; b.vy = Math.abs(b.vy) * 0.8; } if (b.y > r.H - 24) { b.y = r.H - 24; b.vy = -Math.abs(b.vy) * 0.8; } }
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) { const a = balls[i], b = balls[j], d = r.dist(a.x, a.y, b.x, b.y); if (d < 24 && d > 0) { const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d; const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; if (p > 0) { a.vx -= p * nx; a.vy -= p * ny; b.vx += p * nx; b.vy += p * ny; if (p > 80) r.sfx('tick'); } const ov = (24 - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov; } }
        for (let i = balls.length - 1; i >= 0; i--) { const b = balls[i]; if (pockets.some(([px, py]) => r.dist(px, py, b.x, b.y) < 22)) { if (b.white) { r.addScore(-10); r.pop('-10', b.x, b.y, '#EF4444'); r.sfx('hit'); b.x = r.W / 2; b.y = r.H - 120; b.vx = b.vy = 0; } else { r.pop('+20', b.x, b.y - 20, '#fff'); r.burst(b.x, b.y, b.c, 8, 120); r.sfx('score'); balls.splice(i, 1); r.addScore(20); } } }
        if (balls.length === 1) { r.addScore(50); rack(); } },
      draw() { r.clear('#14532D'); r.rect(8, 8, r.W - 16, r.H - 16, '#166534', 12); pockets.forEach(([x, y]) => r.circle(x, y, 20, '#052E16')); balls.forEach(b => { r.circle(b.x, b.y, 12, b.c); r.circle(b.x - 4, b.y - 4, 3, '#ffffff88'); });
        if (drag && drag.cx != null) { const w = white(); r.line(w.x, w.y, w.x + (drag.x - drag.cx), w.y + (drag.y - drag.cy), '#ffffffaa', 3); } },
    };
  } });

// ---- כדורעף ----
sport.push({ id: 'volley', name: 'כדורעף', emoji: '🏐', how: 'אתה בצד שמאל. מזיזים עם האצבע, נוגעים כדי לקפוץ. הכדור נופל בצד של המחשב = נקודה לך.',
  make(r) {
    const GY = r.H - 60, NET = r.W / 2; let me = { x: 80, y: GY, vy: 0 }, ai = { x: r.W - 80, y: GY, vy: 0 }, ball = serve(1), msg = '', mt = 0;
    function serve(side) { return { x: side > 0 ? 80 : r.W - 80, y: 200, vx: 0, vy: 0 }; }
    return {
      move(x) { me.x = r.clamp(x, 24, NET - 30); }, down(x) { this.move(x); },
      update(dt) { mt -= dt; ball.vy += 520 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        for (const p of [me, ai]) { p.vy += 1200 * dt; p.y = Math.min(GY, p.y + p.vy * dt); if (p.y >= GY) p.vy = 0; }
        ai.x += r.clamp(ball.x > NET ? ball.x - ai.x : r.W - 80 - ai.x, -240 * dt, 240 * dt); ai.x = r.clamp(ai.x, NET + 30, r.W - 24); if (ball.x > NET && ball.y > 300 && ai.y >= GY && Math.random() < 0.05) ai.vy = -500;
        for (const p of [me, ai]) { const d = r.dist(p.x, p.y - 20, ball.x, ball.y); if (d < 44) { const nx = (ball.x - p.x) / d, ny = (ball.y - (p.y - 20)) / d; ball.vx = nx * 330 + (p === me ? 60 : -60); ball.vy = Math.min(-200, ny * 330 - 200); } }
        if (ball.x < 14) { ball.x = 14; ball.vx = Math.abs(ball.vx); } if (ball.x > r.W - 14) { ball.x = r.W - 14; ball.vx = -Math.abs(ball.vx); } if (ball.y < 14) { ball.vy = Math.abs(ball.vy); }
        if (Math.abs(ball.x - NET) < 16 && ball.y > GY - 110) { ball.vx = ball.x < NET ? -Math.abs(ball.vx) : Math.abs(ball.vx); }
        if (ball.y > GY - 8) { if (ball.x > NET) { r.addScore(10); msg = 'נקודה! 🏐'; r.burst(ball.x, GY, '#F59E0B', 14); r.sfx('score'); } else { msg = 'נקודה למחשב'; r.sfx('hit'); } mt = 1; ball = serve(ball.x > NET ? 1 : -1); } },
      tap() { if (me.y >= GY) { me.vy = -520; r.sfx('bounce'); } },
      draw() { r.clear('#FDE68A'); r.circle(300, 60, 28, '#FBBF24'); S.cloud(r, 90, 70); r.rect(0, GY, r.W, r.H - GY, '#F59E0B'); for (let i = 0; i < 12; i++) r.rect(i * 30, GY + 10, 18, 3, '#D97706'); r.rect(NET - 3, GY - 110, 6, 110, '#374151'); S.net(r, NET - 3, GY - 110, 6, 110); r.player(me.y < GY - 2 ? POSE.jumpUp : POSE.shuffle, me.x, me.y, 0.5, KITS.blue); r.player(ai.y < GY - 2 ? POSE.jumpUp : POSE.shuffle, ai.x, ai.y, 0.5, KITS.grey, { flip: true }); r.circle(ball.x, ball.y, 12, '#fff'); r.ctx.strokeStyle = '#1D4ED8'; r.ctx.lineWidth = 2; r.ctx.beginPath(); r.ctx.arc(ball.x, ball.y, 12, 0, Math.PI * 2); r.ctx.stroke(); r.ctx.beginPath(); r.ctx.arc(ball.x - 4, ball.y, 12, -0.8, 0.8); r.ctx.stroke(); if (mt > 0) r.text(msg, r.W / 2, 80, { size: 28, color: '#78350F' }); },
    };
  } });

// ---- דוחף קופסאות ----
puzzle.push({ id: 'sokoban', name: 'דוחף קופסאות', emoji: '📦', how: 'מחליקים כדי ללכת. דוחפים את הקופסאות אל הנקודות. אי אפשר למשוך!',
  make(r) {
    const LV = [
      ['#####', '#.@.#', '#.$.#', '#...#', '#.o.#', '#####'],
      ['######', '#....#', '#.$@.#', '#.$..#', '#oo..#', '######'],
      ['#######', '#..o..#', '#.$.$.#', '#..@..#', '#.o...#', '#######'],
      ['#######', '#.....#', '#o$@$o#', '#.....#', '#..$..#', '#..o..#', '#######'],
      ['########', '#..o...#', '#.$.$..#', '#..@.o.#', '#.$....#', '#..o...#', '########'],
    ];
    let lvl = 0, map, px, py, moves = 0;
    const load = () => { map = LV[lvl % LV.length].map(row => [...row]); map.forEach((row, y) => row.forEach((c, x) => { if (c === '@') { px = x; py = y; row[x] = '.'; } })); moves = 0; };
    load();
    const boxes = () => map.flatMap((row, y) => row.map((c, x) => c === '$' || c === '*' ? [x, y] : null).filter(Boolean));
    return {
      swipe(d) { const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d]; const nx = px + dx, ny = py + dy, c = map[ny]?.[nx]; if (!c || c === '#') return;
        if (c === '$' || c === '*') { const bx = nx + dx, by = ny + dy, b = map[by]?.[bx]; if (!b || b === '#' || b === '$' || b === '*') return; map[by][bx] = b === 'o' ? '*' : '$'; map[ny][nx] = c === '*' ? 'o' : '.'; }
        px = nx; py = ny; moves++; r.sfx('tick');
        if (!map.some(row => row.includes('$'))) { r.addScore(Math.max(20, 100 - moves * 2)); lvl++; load(); r.win('שלב הושלם!', 0); } },
      draw() { r.clear('#FFF7ED'); const S = Math.min(50, 320 / map[0].length), OX = (r.W - map[0].length * S) / 2, OY = 120;
        map.forEach((row, y) => row.forEach((c, x) => { const X = OX + x * S, Y = OY + y * S; if (c === '#') r.rect(X, Y, S, S, '#78350F', 4); else { r.rect(X + 1, Y + 1, S - 2, S - 2, '#FEF3C7', 4); if (c === 'o' || c === '*') r.circle(X + S / 2, Y + S / 2, S / 4, '#FBBF24'); if (c === '$' || c === '*') r.emoji('📦', X + S / 2, Y + S / 2, S * 0.7); } }));
        r.emoji('🧒', OX + px * S + S / 2, OY + py * S + S / 2, S * 0.7); r.text(`שלב ${lvl + 1} · מהלכים: ${moves}`, r.W / 2, 80, { size: 18, color: '#7C2D12' }); },
    };
  } });

// ---- ציור לפי מספרים ----
puzzle.push({ id: 'nonogram', name: 'ציור לפי מספרים', emoji: '🖼️', how: 'המספרים אומרים כמה משבצות מלאות יש בכל שורה ועמודה (ברצף). נוגעים כדי למלא, שוב כדי לסמן איקס.',
  make(r) {
    const N = 5, S = 48, OX = 80, OY = 150; let sol, b;
    const clues = line => { const o = []; let n = 0; for (const v of line) { if (v) n++; else if (n) { o.push(n); n = 0; } } if (n) o.push(n); return o.length ? o : [0]; };
    const make = () => { sol = Array.from({ length: N * N }, () => Math.random() < 0.55 ? 1 : 0); b = Array(N * N).fill(0); };
    make();
    const row = (a, y) => a.slice(y * N, y * N + N), col = (a, x) => [0, 1, 2, 3, 4].map(y => a[y * N + x]);
    return {
      tap(x, y) { const i = Math.floor((x - OX) / S), j = Math.floor((y - OY) / S); if (i < 0 || j < 0 || i >= N || j >= N) return; const k = j * N + i; b[k] = (b[k] + 1) % 3;
        if (b.every((v, k) => (v === 1) === !!sol[k])) { r.addScore(80); make(); r.win('הציור נכון!', 0); } },
      draw() { r.clear('#F5F3FF'); for (let k = 0; k < N * N; k++) { const X = OX + (k % N) * S, Y = OY + Math.floor(k / N) * S; r.rect(X + 1, Y + 1, S - 2, S - 2, b[k] === 1 ? '#6D28D9' : '#fff', 4); if (b[k] === 2) r.text('✕', X + S / 2, Y + S / 2, { size: 22, color: '#A78BFA' }); }
        for (let y = 0; y < N; y++) { const ok = clues(row(b.map(v => v === 1 ? 1 : 0), y)).join() === clues(row(sol, y)).join(); r.text(clues(row(sol, y)).join(' '), OX - 30, OY + y * S + S / 2, { size: 18, color: ok ? '#16A34A' : '#4C1D95' }); }
        for (let x = 0; x < N; x++) { const ok = clues(col(b.map(v => v === 1 ? 1 : 0), x)).join() === clues(col(sol, x)).join(); r.text(clues(col(sol, x)).join(' '), OX + x * S + S / 2, OY - 26, { size: 18, color: ok ? '#16A34A' : '#4C1D95' }); } },
    };
  } });

// ---- ניחוש מילה ----
puzzle.push({ id: 'wordle', name: 'ניחוש מילה', emoji: '🟩', how: 'מנחשים מילה של 4 אותיות. ירוק = אות במקום הנכון, צהוב = במילה אבל במקום אחר. שישה ניסיונות.',
  make(r) {
    const WORDS = ['כדור', 'שחקן', 'מגרש', 'שוער', 'אלוף', 'מאמן', 'קפיץ', 'ריצה', 'שריר', 'ספסל', 'מדליה'.slice(0, 4), 'נצחון'.slice(0, 4), 'מסלול'.slice(0, 4), 'טניס', 'סקווט'.slice(0, 4), 'משחק', 'חבל!'.slice(0, 3) + 'ם', 'ילדה', 'שולחן'.slice(0, 4), 'תפוח', 'בננה', 'גזר!'.slice(0, 3) + 'ה', 'חתול', 'כלבה', 'דינו', 'ספרה', 'מספר', 'מטרה', 'זריז', 'חזקה'].filter(w => w.length === 4);
    const AB = [...'אבגדהוזחטיכלמנסעפצקרשת']; let word, rows, cur, done = false;
    const make = () => { word = r.pick(WORDS); rows = []; cur = ''; done = false; };
    make();
    const norm = c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c] || c);
    const color = (g, i) => norm(g[i]) === norm(word[i]) ? '#16A34A' : [...word].map(norm).includes(norm(g[i])) ? '#CA8A04' : '#9CA3AF';
    return {
      tap(x, y) { if (done) return; if (y > 330 && y < 490) { const col = Math.floor((r.W - x) / 45), row = Math.floor((y - 330) / 52); const l = AB[row * 8 + col]; if (l && cur.length < 4) cur += l; }
        else if (y > 495) { if (x > r.W / 2) { cur = cur.slice(0, -1); } else if (cur.length === 4) { rows.push(cur); if ([...cur].map(norm).join('') === [...word].map(norm).join('')) { r.addScore(Math.max(10, 70 - rows.length * 10)); done = true; setTimeout(make, 900); r.win('מצאת!', 0); } else if (rows.length >= 6) { done = true; r.over(`המילה: ${word}`); } cur = ''; } } },
      draw() { r.clear('#FAFAF9'); for (let i = 0; i < 6; i++) { const g = rows[i] ?? (i === rows.length ? cur : ''); for (let k = 0; k < 4; k++) { const X = r.W / 2 + (1.5 - k) * 58, Y = 40 + i * 48; r.rect(X - 26, Y - 20, 52, 42, rows[i] ? color(g, k) : '#E7E5E4', 6); if (g[k]) r.text(g[k], X, Y, { size: 26, color: rows[i] ? '#fff' : '#111' }); } }
        AB.forEach((l, i) => { const x = r.W - (i % 8) * 45 - 22, y = 330 + Math.floor(i / 8) * 52 + 24; const used = rows.some(g => g.includes(l)); r.rect(x - 20, y - 22, 40, 44, used ? '#D6D3D1' : '#F59E0B', 8); r.text(l, x, y, { size: 22, color: used ? '#78716C' : '#fff' }); });
        r.rect(20, 500, r.W / 2 - 30, 44, '#16A34A', 10); r.text('בדיקה ✓', 20 + r.W / 4 - 15, 522, { size: 20 }); r.rect(r.W / 2 + 10, 500, r.W / 2 - 30, 44, '#78716C', 10); r.text('מחיקה ⌫', r.W / 2 + 10 + r.W / 4 - 15, 522, { size: 20 }); },
    };
  } });

// ---- צייר מהזיכרון ----
puzzle.push({ id: 'pattern', name: 'צייר מהזיכרון', emoji: '🧠', how: 'משבצות נדלקות לכמה שניות ונעלמות. נוגעים באותן משבצות מהזיכרון.',
  make(r) {
    const N = 4, S = 76, OX = (r.W - N * S) / 2, OY = 140; let n = 3, target, picked, phase = 'show', t = 0;
    const make = () => { target = new Set(r.shuffle([...Array(N * N).keys()]).slice(0, n)); picked = new Set(); phase = 'show'; t = 0; };
    make();
    return {
      update(dt) { t += dt; if (phase === 'show' && t > 2 + n * 0.3) { phase = 'input'; } if (phase === 'result' && t > 1.2) { make(); } },
      tap(x, y) { if (phase !== 'input') return; const i = Math.floor((x - OX) / S), j = Math.floor((y - OY) / S); if (i < 0 || j < 0 || i >= N || j >= N) return; const k = j * N + i; if (picked.has(k)) return; picked.add(k);
        if (!target.has(k)) { r.addScore(-5); r.sfx('hit'); phase = 'result'; t = 0; n = Math.max(3, n - 1); return; }
        r.sfx('tick'); if (picked.size === target.size) { r.addScore(n * 10); r.pop('+' + n * 10, r.W / 2, 120, '#0891B2', 26); r.sfx('score'); phase = 'result'; t = 0; n = Math.min(10, n + 1); } },
      draw() { r.clear('#ECFEFF'); r.text(phase === 'show' ? 'תזכור את המשבצות...' : phase === 'input' ? 'עכשיו אתה!' : picked.size === target.size ? 'מדויק! 🎉' : 'אופס, לא זה', r.W / 2, 90, { size: 24, color: '#155E75' });
        for (let k = 0; k < N * N; k++) { const X = OX + (k % N) * S, Y = OY + Math.floor(k / N) * S; const lit = (phase === 'show' && target.has(k)) || (phase !== 'show' && picked.has(k)); const wrong = phase === 'result' && picked.has(k) && !target.has(k); const miss = phase === 'result' && target.has(k) && !picked.has(k); r.rect(X + 4, Y + 4, S - 8, S - 8, wrong ? '#EF4444' : miss ? '#FDE68A' : lit ? '#0891B2' : '#fff', 10); } },
    };
  } });

// ---- איפה הכדור ----
quick.push({ id: 'cups', name: 'איפה הכדור?', emoji: '🥤', how: 'הכדור מתחת לאחת הכוסות. הכוסות מתערבבות. עוקבים בעיניים ונוגעים בכוס הנכונה.',
  make(r) {
    let cups = [0, 1, 2].map(i => ({ x: 60 + i * 120, tx: 60 + i * 120 })), ball = 1, phase = 'show', t = 0, swaps = 0, total = 4, speed = 1, msg = '';
    const posX = i => 60 + i * 120;
    return {
      update(dt) { t += dt; cups.forEach(c => c.x += (c.tx - c.x) * Math.min(1, dt * 8 * speed));
        if (phase === 'show' && t > 1.2) { phase = 'mix'; t = 0; swaps = 0; }
        if (phase === 'mix' && t > 0.45 / speed) { t = 0; if (swaps >= total) { phase = 'guess'; return; } const a = r.rint(0, 2); let b = r.rint(0, 2); if (b === a) b = (a + 1) % 3; const ta = cups[a].tx; cups[a].tx = cups[b].tx; cups[b].tx = ta; swaps++; }
        if (phase === 'result' && t > 1.2) { phase = 'show'; t = 0; cups = [0, 1, 2].map(i => ({ x: posX(i), tx: posX(i) })); ball = r.rint(0, 2); } },
      tap(x) { if (phase !== 'guess') return; const i = cups.reduce((best, c, k) => Math.abs(c.x - x) < Math.abs(cups[best].x - x) ? k : best, 0); phase = 'result'; t = 0; if (i === ball) { r.addScore(10 + total * 2); total = Math.min(12, total + 1); speed = Math.min(2.4, speed + 0.15); msg = 'נכון! 🎉'; r.burst(cups[ball].x, 260, '#EF4444', 14); r.sfx('score'); } else { total = Math.max(3, total - 1); msg = 'לא... הכדור היה שם'; r.sfx('hit'); } },
      draw() { r.clear('#FDF2F8'); r.text(phase === 'show' ? 'תזכור איפה הכדור' : phase === 'mix' ? 'עוקבים...' : phase === 'guess' ? 'איפה הכדור?' : msg, r.W / 2, 100, { size: 24, color: '#9D174D' });
        cups.forEach((c, i) => { const up = (phase === 'show' || phase === 'result') && i === ball; if (up) r.circle(c.x, 300, 14, '#EF4444'); r.emoji('🥤', c.x, up ? 240 : 290, 64); }); },
    };
  } });

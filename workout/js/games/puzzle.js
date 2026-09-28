// משחקי חשיבה ולוח
const G = [];
// עזר לרשת: ממיר נגיעה למשבצת
const grid = (r, cols, rows, size, ox, oy) => ({ cols, rows, size, ox, oy,
  cell(x, y) { const i = Math.floor((x - ox) / size), j = Math.floor((y - oy) / size); return i >= 0 && j >= 0 && i < cols && j < rows ? [i, j] : null; },
  cx(i) { return ox + i * size + size / 2; }, cy(j) { return oy + j * size + size / 2; } });

// ---- 2048 ----
G.push({ id: '2048', name: '2048', emoji: '🔢', how: 'מחליקים לכיוון. משבצות עם מספר זהה מתחברות. מגיעים הכי גבוה שאפשר.',
  make(r) {
    const g = grid(r, 4, 4, 80, 20, 120); let b = Array(16).fill(0);
    const add = () => { const e = b.map((v, i) => v ? -1 : i).filter(i => i >= 0); if (e.length) b[r.pick(e)] = Math.random() < 0.9 ? 2 : 4; };
    add(); add();
    const slide = row => { const a = row.filter(Boolean); for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; r.addScore(a[i]); a.splice(i + 1, 1); } while (a.length < 4) a.push(0); return a; };
    const colors = { 2: '#EEE4DA', 4: '#EDE0C8', 8: '#F2B179', 16: '#F59563', 32: '#F67C5F', 64: '#F65E3B', 128: '#EDCF72', 256: '#EDCC61', 512: '#EDC850', 1024: '#EDC53F', 2048: '#EDC22E' };
    return {
      swipe(d) { const before = b.join(); const rows = [0, 1, 2, 3].map(j => [0, 1, 2, 3].map(i => d === 'left' || d === 'right' ? b[j * 4 + i] : b[i * 4 + j]));
        const out = rows.map(row => { const rev = d === 'right' || d === 'down'; const s = slide(rev ? [...row].reverse() : row); return rev ? s.reverse() : s; });
        out.forEach((row, j) => row.forEach((v, i) => { if (d === 'left' || d === 'right') b[j * 4 + i] = v; else b[i * 4 + j] = v; }));
        if (b.join() !== before) add();
        const stuck = b.every(Boolean) && !b.some((v, i) => (i % 4 < 3 && b[i + 1] === v) || (i < 12 && b[i + 4] === v)); if (stuck) r.over('הלוח מלא!'); },
      draw() { r.clear('#BBADA0'); r.rect(g.ox - 6, g.oy - 6, 332, 332, '#8F7A66', 8); b.forEach((v, i) => { const x = g.ox + (i % 4) * 80, y = g.oy + Math.floor(i / 4) * 80; r.rect(x + 3, y + 3, 74, 74, v ? colors[v] || '#3C3A32' : '#CDC1B4', 6); if (v) r.text(v, x + 40, y + 40, { size: v > 999 ? 24 : 30, color: v > 4 ? '#fff' : '#776E65' }); }); },
    };
  } });

// ---- פאזל הזזה ----
G.push({ id: 'slide', name: 'פאזל הזזה', emoji: '🧩', how: 'נוגעים במספר ליד החור כדי להזיז אותו. מסדרים 1 עד 8.',
  make(r) {
    const g = grid(r, 3, 3, 100, 30, 120); let t, moves = 0;
    const solved = a => a.every((v, i) => v === (i + 1) % 9);
    const make = () => { t = [1, 2, 3, 4, 5, 6, 7, 8, 0]; for (let k = 0; k < 60; k++) { const e = t.indexOf(0), n = [e - 1, e + 1, e - 3, e + 3].filter(i => i >= 0 && i < 9 && Math.abs(i % 3 - e % 3) + Math.abs(Math.floor(i / 3) - Math.floor(e / 3)) === 1); const s = r.pick(n); [t[e], t[s]] = [t[s], t[e]]; } if (solved(t)) make(); };
    make();
    return {
      tap(x, y) { const c = g.cell(x, y); if (!c) return; const i = c[1] * 3 + c[0], e = t.indexOf(0); if (Math.abs(i % 3 - e % 3) + Math.abs(Math.floor(i / 3) - Math.floor(e / 3)) === 1) { [t[e], t[i]] = [t[i], t[e]]; moves++; if (solved(t)) { r.addScore(Math.max(20, 100 - moves)); moves = 0; make(); r.win('פתרת!', 0); } } },
      draw() { r.clear('#FEF3C7'); t.forEach((v, i) => { if (!v) return; const x = g.ox + (i % 3) * 100, y = g.oy + Math.floor(i / 3) * 100; r.rect(x + 4, y + 4, 92, 92, v === (i + 1) ? r.C.ok : r.C.accent, 10); r.text(v, x + 50, y + 50, { size: 40 }); }); r.text(`מהלכים: ${moves}`, r.W / 2, 70, { size: 18, color: '#78350F' }); },
    };
  } });

// ---- כיבוי אורות ----
G.push({ id: 'lights', name: 'כיבוי אורות', emoji: '💡', how: 'נגיעה מחליפה את המנורה ואת השכנות שלה. מכבים את כל המנורות.',
  make(r) {
    const g = grid(r, 5, 5, 60, 30, 130); let b, moves = 0;
    const flip = i => { b[i] ^= 1; if (i % 5 > 0) b[i - 1] ^= 1; if (i % 5 < 4) b[i + 1] ^= 1; if (i >= 5) b[i - 5] ^= 1; if (i < 20) b[i + 5] ^= 1; };
    const make = () => { b = Array(25).fill(0); for (let k = 0; k < 6; k++) flip(r.rint(0, 24)); if (!b.some(Boolean)) make(); moves = 0; };
    make();
    return {
      tap(x, y) { const c = g.cell(x, y); if (!c) return; flip(c[1] * 5 + c[0]); moves++; if (!b.some(Boolean)) { r.addScore(Math.max(20, 80 - moves * 5)); make(); r.win('הכול כבוי!', 0); } },
      draw() { r.clear('#1E1B4B'); b.forEach((v, i) => r.rect(g.ox + (i % 5) * 60 + 4, g.oy + Math.floor(i / 5) * 60 + 4, 52, 52, v ? r.C.gold : '#312E81', 10)); r.text(`דלוקות: ${b.filter(Boolean).length}`, r.W / 2, 80, { size: 18 }); },
    };
  } });

// ---- שולה מוקשים ----
G.push({ id: 'mines', name: 'שולה מוקשים', emoji: '💣', how: 'נוגעים כדי לחשוף. המספר אומר כמה מוקשים מסביב. נגיעה ארוכה מסמנת דגל.',
  make(r) {
    const N = 8, g = grid(r, N, N, 40, 20, 120); let mines, open, flags, first = true, hold = 0, hc = null;
    const nb = i => { const o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = i % N + dx, y = Math.floor(i / N) + dy; if ((dx || dy) && x >= 0 && y >= 0 && x < N && y < N) o.push(y * N + x); } return o; };
    const cnt = i => nb(i).filter(j => mines.has(j)).length;
    const make = (safe) => { mines = new Set(); while (mines.size < 10) { const m = r.rint(0, N * N - 1); if (m !== safe && !nb(safe).includes(m)) mines.add(m); } open = new Set(); flags = new Set(); };
    make(-1);
    const reveal = i => { if (open.has(i) || flags.has(i)) return; open.add(i); if (cnt(i) === 0) nb(i).forEach(reveal); };
    return {
      down(x, y) { hc = g.cell(x, y); hold = 0; },
      update(dt) { if (hc && r.isDown) { hold += dt; if (hold > 0.45) { const i = hc[1] * N + hc[0]; if (!open.has(i)) { flags.has(i) ? flags.delete(i) : flags.add(i); } hc = null; } } },
      tap(x, y) { const c = g.cell(x, y); if (!c) return; const i = c[1] * N + c[0]; if (flags.has(i)) return; if (first) { make(i); first = false; }
        if (mines.has(i)) { open.add(i); return r.over('בום! מוקש.'); } const before = open.size; reveal(i); r.addScore(open.size - before);
        if (open.size === N * N - 10) { r.addScore(100); first = true; make(-1); r.win('ניקית את השדה!', 0); } },
      draw() { r.clear('#334155'); for (let i = 0; i < N * N; i++) { const x = g.ox + (i % N) * 40, y = g.oy + Math.floor(i / N) * 40; if (open.has(i)) { r.rect(x + 1, y + 1, 38, 38, '#CBD5E1', 4); if (mines.has(i)) r.emoji('💣', x + 20, y + 20, 24); else if (cnt(i)) r.text(cnt(i), x + 20, y + 20, { size: 20, color: ['', '#1D4ED8', '#15803D', '#B91C1C', '#6B21A8', '#9A3412'][cnt(i)] || '#000' }); } else { r.rect(x + 1, y + 1, 38, 38, '#64748B', 4); if (flags.has(i)) r.emoji('🚩', x + 20, y + 20, 22); } } r.text(`מוקשים: ${10 - flags.size}`, r.W / 2, 80, { size: 18 }); },
    };
  } });

// ---- איקס עיגול ----
G.push({ id: 'tictactoe', name: 'איקס עיגול', emoji: '❌', how: 'אתה איקס. נוגעים במשבצת. ניצחון 30, תיקו 10.',
  make(r) {
    const g = grid(r, 3, 3, 100, 30, 130); let b = Array(9).fill(''), turn = 'X', msg = '', mt = 0;
    const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const winner = a => { for (const l of L) if (a[l[0]] && a[l[0]] === a[l[1]] && a[l[0]] === a[l[2]]) return a[l[0]]; return a.every(Boolean) ? 'D' : ''; };
    const finish = w => { msg = w === 'X' ? 'ניצחת! 🎉' : w === 'O' ? 'המחשב ניצח' : 'תיקו'; r.addScore(w === 'X' ? 30 : w === 'D' ? 10 : 0); mt = 1.2; };
    const ai = () => { const e = b.map((v, i) => v ? -1 : i).filter(i => i >= 0); const tryWin = p => e.find(i => { const c = [...b]; c[i] = p; return winner(c) === p; }); let m = tryWin('O') ?? tryWin('X'); if (m == null) m = Math.random() < 0.7 && !b[4] ? 4 : r.pick(e); b[m] = 'O'; };
    return {
      tap(x, y) { if (mt > 0 || turn !== 'X') return; const c = g.cell(x, y); if (!c) return; const i = c[1] * 3 + c[0]; if (b[i]) return; b[i] = 'X'; let w = winner(b); if (w) return finish(w); ai(); w = winner(b); if (w) finish(w); },
      update(dt) { if (mt > 0) { mt -= dt; if (mt <= 0) { b = Array(9).fill(''); msg = ''; } } },
      draw() { r.clear('#ECFEFF'); for (let k = 1; k < 3; k++) { r.line(g.ox + k * 100, g.oy, g.ox + k * 100, g.oy + 300, '#0E7490', 6); r.line(g.ox, g.oy + k * 100, g.ox + 300, g.oy + k * 100, '#0E7490', 6); }
        b.forEach((v, i) => { if (v) r.text(v, g.cx(i % 3), g.cy(Math.floor(i / 3)), { size: 64, color: v === 'X' ? '#DB2777' : '#2563EB' }); }); if (msg) r.text(msg, r.W / 2, 80, { size: 28, color: '#0E7490' }); },
    };
  } });

// ---- ארבע בשורה ----
G.push({ id: 'connect4', name: 'ארבע בשורה', emoji: '🔴', how: 'נוגעים בעמודה כדי להפיל דיסקית. ארבע בשורה מנצחות. אתה האדום.',
  make(r) {
    const C = 7, R = 6, S = 48, OX = (r.W - C * S) / 2, OY = 150; let b, msg = '', mt = 0, lock = false;
    const reset = () => { b = Array(C * R).fill(0); };
    reset();
    const drop = (col, p) => { for (let j = R - 1; j >= 0; j--) if (!b[j * C + col]) { b[j * C + col] = p; return j; } return -1; };
    const win = p => { for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { let k = 0; while (k < 4) { const x = i + dx * k, y = j + dy * k; if (x < 0 || y < 0 || x >= C || y >= R || b[y * C + x] !== p) break; k++; } if (k === 4) return true; } return false; };
    const finish = m => { msg = m; mt = 1.4; lock = true; };
    const ai = () => { const cols = [...Array(C).keys()].filter(c => !b[c]); const test = (c, p) => { const j = drop(c, p); const w = j >= 0 && win(p); if (j >= 0) b[j * C + c] = 0; return w; }; let c = cols.find(c => test(c, 2)) ?? cols.find(c => test(c, 1)) ?? (Math.random() < 0.5 && !b[3] ? 3 : r.pick(cols)); drop(c, 2); };
    return {
      tap(x) { if (lock) return; const col = Math.floor((x - OX) / S); if (col < 0 || col >= C || b[col]) return; drop(col, 1); if (win(1)) { r.addScore(50); return finish('ניצחת! 🎉'); } if (b.every(Boolean)) { r.addScore(15); return finish('תיקו'); } ai(); if (win(2)) finish('המחשב ניצח'); else if (b.every(Boolean)) { r.addScore(15); finish('תיקו'); } },
      update(dt) { if (mt > 0) { mt -= dt; if (mt <= 0) { reset(); msg = ''; lock = false; } } },
      draw() { r.clear('#1E3A8A'); r.rect(OX - 6, OY - 6, C * S + 12, R * S + 12, '#2563EB', 10); b.forEach((v, i) => r.circle(OX + (i % C) * S + S / 2, OY + Math.floor(i / C) * S + S / 2, 19, v === 1 ? '#EF4444' : v === 2 ? '#FDE047' : '#1E3A8A')); r.text(msg || 'תורך: אדום', r.W / 2, 90, { size: 26 }); },
    };
  } });

// ---- מגדלי האנוי ----
G.push({ id: 'hanoi', name: 'מגדלי האנוי', emoji: '🗼', how: 'מעבירים את כל המגדל לעמוד הימני. נוגעים בעמוד לקחת דיסק ובעמוד אחר להניח. גדול על קטן אסור.',
  make(r) {
    let n = 3, pegs, held = null, moves = 0;
    const reset = () => { pegs = [[...Array(n).keys()].map(i => n - i), [], []]; moves = 0; held = null; };
    reset();
    return {
      tap(x) { const p = Math.floor(x / (r.W / 3)); if (held == null) { if (pegs[p].length) held = p; } else { const d = pegs[held][pegs[held].length - 1]; const top = pegs[p][pegs[p].length - 1]; if (p === held) held = null; else if (!top || top > d) { pegs[p].push(pegs[held].pop()); held = null; moves++; if (pegs[2].length === n) { r.addScore(Math.max(20, (2 ** n - 1) * 20 - (moves - (2 ** n - 1)) * 5)); n = Math.min(6, n + 1); reset(); r.win('המגדל עבר!', 0); } } } },
      draw() { r.clear('#FFF7ED'); for (let p = 0; p < 3; p++) { const cx = r.W / 6 + p * r.W / 3; r.rect(cx - 5, 200, 10, 260, '#92400E', 4); pegs[p].forEach((d, k) => { const isHeld = held === p && k === pegs[p].length - 1; r.rect(cx - d * 9 - 8, isHeld ? 160 : 440 - k * 24, d * 18 + 16, 20, ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6'][d - 1], 6); }); } r.rect(0, 460, r.W, 10, '#92400E'); r.text(`${n} דיסקים · מהלכים: ${moves} · מינימום: ${2 ** n - 1}`, r.W / 2, 100, { size: 16, color: '#7C2D12' }); },
    };
  } });

// ---- סודוקו קטן ----
G.push({ id: 'sudoku4', name: 'סודוקו קטן', emoji: '🔠', how: 'בכל שורה, עמודה וריבוע 2×2 המספרים 1 עד 4 פעם אחת. נוגעים במשבצת ואז במספר.',
  make(r) {
    const g = grid(r, 4, 4, 70, 40, 110); let sol, b, fixed, sel = -1;
    const make = () => { const base = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]; const perm = r.shuffle([1, 2, 3, 4]); const rows = r.shuffle([0, 1]).flatMap(k => r.shuffle([k * 2, k * 2 + 1])); sol = rows.flatMap(j => base[j].map(v => perm[v - 1])); b = [...sol]; fixed = Array(16).fill(true); r.shuffle([...Array(16).keys()]).slice(0, 9).forEach(i => { b[i] = 0; fixed[i] = false; }); sel = -1; };
    make();
    return {
      tap(x, y) { const c = g.cell(x, y); if (c) { const i = c[1] * 4 + c[0]; if (!fixed[i]) sel = i; return; } if (y > 420 && y < 500 && sel >= 0) { const v = Math.floor((x - 20) / 80) + 1; if (v >= 1 && v <= 4) { b[sel] = v; if (b.every((v, i) => v === sol[i])) { r.addScore(60); make(); r.win('פתרת!', 0); } } } },
      draw() { r.clear('#F0FDF4'); b.forEach((v, i) => { const x = g.ox + (i % 4) * 70, y = g.oy + Math.floor(i / 4) * 70; r.rect(x + 2, y + 2, 66, 66, i === sel ? '#BBF7D0' : fixed[i] ? '#D1FAE5' : '#fff', 6); if (v) r.text(v, x + 35, y + 35, { size: 32, color: fixed[i] ? '#065F46' : v === sol[i] ? '#2563EB' : '#DC2626' }); });
        r.line(g.ox + 140, g.oy, g.ox + 140, g.oy + 280, '#065F46', 4); r.line(g.ox, g.oy + 140, g.ox + 280, g.oy + 140, '#065F46', 4);
        [1, 2, 3, 4].forEach((v, k) => { r.rect(20 + k * 80 + 5, 425, 70, 70, r.C.accent, 10); r.text(v, 20 + k * 80 + 40, 460, { size: 34 }); }); },
    };
  } });

// ---- צוללות ----
G.push({ id: 'battleship', name: 'צוללות', emoji: '🚢', how: 'נוגעים במשבצת כדי לירות. מוצאים את כל הספינות המסתתרות בכמה שפחות יריות.',
  make(r) {
    const N = 6, g = grid(r, N, N, 50, 30, 120); let ships, shots, hits;
    const make = () => { ships = new Set(); shots = new Set(); hits = 0; for (const len of [3, 2, 2]) { let ok = false; while (!ok) { const h = Math.random() < 0.5, x = r.rint(0, N - (h ? len : 1)), y = r.rint(0, N - (h ? 1 : len)); const cells = [...Array(len).keys()].map(k => (h ? y : y + k) * N + (h ? x + k : x)); if (cells.every(c => !ships.has(c))) { cells.forEach(c => ships.add(c)); ok = true; } } } };
    make();
    return {
      tap(x, y) { const c = g.cell(x, y); if (!c) return; const i = c[1] * N + c[0]; if (shots.has(i)) return; shots.add(i); if (ships.has(i)) { hits++; r.addScore(10); if (hits === 7) { r.addScore(Math.max(0, 36 - shots.size) * 5); make(); r.win('הצי הושמד!', 0); } } },
      draw() { r.clear('#0C4A6E'); for (let i = 0; i < N * N; i++) { const x = g.ox + (i % N) * 50, y = g.oy + Math.floor(i / N) * 50; r.rect(x + 2, y + 2, 46, 46, '#0369A1', 6); if (shots.has(i)) r.emoji(ships.has(i) ? '💥' : '🌊', x + 25, y + 25, 28); } r.text(`פגיעות: ${hits} מתוך 7 · יריות: ${shots.size}`, r.W / 2, 80, { size: 16 }); },
    };
  } });

// ---- זיכרון ----
G.push({ id: 'memory', name: 'משחק הזיכרון', emoji: '🃏', how: 'הופכים שני קלפים. אם הם זהים, הם נשארים פתוחים. מוצאים את כל הזוגות.',
  make(r) {
    const g = grid(r, 4, 4, 78, 24, 110); let cards, open = [], matched, lockT = 0, tries = 0;
    const make = () => { const e = r.shuffle(['🍎', '🍌', '🍇', '🍓', '🍒', '🥝', '🍑', '🍍']); cards = r.shuffle([...e, ...e]); matched = new Set(); open = []; tries = 0; };
    make();
    return {
      tap(x, y) { if (lockT > 0) return; const c = g.cell(x, y); if (!c) return; const i = c[1] * 4 + c[0]; if (matched.has(i) || open.includes(i)) return; open.push(i);
        if (open.length === 2) { tries++; if (cards[open[0]] === cards[open[1]]) { open.forEach(k => matched.add(k)); open = []; r.addScore(10); if (matched.size === 16) { r.addScore(Math.max(0, 20 - tries) * 5); make(); r.win('מצאת את כל הזוגות!', 0); } } else lockT = 0.8; } },
      update(dt) { if (lockT > 0) { lockT -= dt; if (lockT <= 0) open = []; } },
      draw() { r.clear('#4C1D95'); cards.forEach((e, i) => { const x = g.ox + (i % 4) * 78, y = g.oy + Math.floor(i / 4) * 78; const show = matched.has(i) || open.includes(i); r.rect(x + 3, y + 3, 72, 72, show ? '#F5F3FF' : '#7C3AED', 10); if (show) r.emoji(e, x + 39, y + 39, 38); else r.text('?', x + 39, y + 39, { size: 30, color: '#C4B5FD' }); }); },
    };
  } });

// ---- איש תלוי ----
G.push({ id: 'hangman', name: 'נחש את המילה', emoji: '🔤', how: 'מנחשים אותיות. כל המילים קשורות לספורט. שש שגיאות והפסדת.',
  make(r) {
    const WORDS = ['כדורגל', 'כדורסל', 'שחייה', 'קפיצה', 'ריצה', 'אופניים', 'מדליה', 'שער', 'כדור', 'אימון', 'שריר', 'מאמן', 'טניס', 'סקווט', 'פלאנק', 'משוכה', 'מגרש', 'שוער', 'ניצחון', 'אליפות'];
    const AB = [...'אבגדהוזחטיכלמנסעפצקרשת']; let word, guessed, wrong;
    const make = () => { word = r.pick(WORDS); guessed = new Set(); wrong = 0; };
    make();
    const norm = c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c] || c);
    const shown = () => [...word].map(c => guessed.has(norm(c)) ? c : '_').join(' ');
    return {
      tap(x, y) { if (y < 300) return; const col = Math.floor((r.W - x) / 45), row = Math.floor((y - 300) / 52); const i = row * 8 + col; const l = AB[i]; if (!l || guessed.has(l)) return; guessed.add(l);
        if ([...word].some(c => norm(c) === l)) { r.addScore(5); if ([...word].every(c => guessed.has(norm(c)))) { r.addScore(30); make(); r.win('מצאת את המילה!', 0); } } else if (++wrong >= 6) { r.over(`המילה הייתה: ${word}`); } },
      draw() { r.clear('#FFFBEB'); r.text(shown(), r.W / 2, 120, { size: 36, color: '#78350F' }); r.text(`שגיאות: ${wrong} מתוך 6`, r.W / 2, 190, { size: 18, color: '#B45309' }); r.emoji(['🙂', '😐', '😕', '😟', '😧', '😱', '💀'][wrong], r.W / 2, 250, 48);
        AB.forEach((l, i) => { const x = r.W - (i % 8) * 45 - 22, y = 300 + Math.floor(i / 8) * 52 + 24; const used = guessed.has(l); r.rect(x - 20, y - 22, 40, 44, used ? '#E5E7EB' : '#F59E0B', 8); r.text(l, x, y, { size: 24, color: used ? '#9CA3AF' : '#fff' }); }); },
    };
  } });

// ---- מילים מבולבלות ----
G.push({ id: 'scramble', name: 'מילים מבולבלות', emoji: '🔀', how: 'האותיות התבלבלו. נוגעים בהן בסדר הנכון כדי להרכיב את המילה.',
  make(r) {
    const WORDS = ['ניתור', 'כדור', 'שחקן', 'שרירים', 'מהירות', 'קפיצה', 'מים', 'אימון', 'מנוחה', 'כוח', 'בטן', 'רגליים', 'מטרה', 'שיא', 'ניצחון', 'אלוף', 'סקווט', 'חבל', 'ריצה', 'משחק'];
    let word, letters, picked, streak = 0;
    const make = () => { word = r.pick(WORDS); do { letters = r.shuffle([...word]).map((c, i) => ({ c, i, used: false })); } while (letters.map(l => l.c).join('') === word && word.length > 1); picked = []; };
    make();
    return {
      tap(x, y) { if (y > 240 && y < 340) { const n = letters.length, s = 56, ox = (r.W - n * s) / 2; const k = Math.floor((x - ox) / s); const idx = n - 1 - k; const l = letters[idx]; if (!l || l.used) return; l.used = true; picked.push(l);
          const cur = picked.map(p => p.c).join(''); if (!word.startsWith(cur)) { streak = 0; letters.forEach(p => p.used = false); picked = []; return; }
          if (cur === word) { streak++; r.addScore(10 * word.length + streak * 5); make(); } } if (y > 400) { letters.forEach(p => p.used = false); picked = []; } },
      draw() { r.clear('#EFF6FF'); r.text('המילה:', r.W / 2, 100, { size: 18, color: '#1E3A8A' }); r.text(picked.map(p => p.c).join('') + '_'.repeat(word.length - picked.length), r.W / 2, 150, { size: 40, color: '#1E3A8A' });
        const n = letters.length, s = 56, ox = (r.W - n * s) / 2; letters.forEach((l, i) => { const x = ox + (n - 1 - i) * s + s / 2; r.rect(x - 24, 266, 48, 48, l.used ? '#CBD5E1' : '#3B82F6', 8); r.text(l.c, x, 290, { size: 28, color: l.used ? '#94A3B8' : '#fff' }); });
        r.rect(r.W / 2 - 60, 410, 120, 44, '#94A3B8', 10); r.text('נקה', r.W / 2, 432, { size: 20 }); r.text(`רצף: ${streak}`, r.W / 2, 500, { size: 16, color: '#1E3A8A' }); },
    };
  } });

// ---- מצא את השונה ----
G.push({ id: 'odd-one', name: 'מצא את השונה', emoji: '🔍', how: 'בין כל הסמלים יש אחד שונה. מוצאים אותו מהר.',
  make(r) {
    const PAIRS = [['🐶', '🐺'], ['🍎', '🍅'], ['😀', '😃'], ['🐱', '🦁'], ['🌕', '🌖'], ['⚽', '🏐'], ['🟢', '🟩'], ['🐸', '🦎'], ['🍊', '🟠'], ['💙', '💎']];
    let n = 4, cells, odd, pair, t = 0;
    const make = () => { pair = r.pick(PAIRS); cells = n * n; odd = r.rint(0, cells - 1); t = 0; };
    make();
    return {
      update(dt) { t += dt; },
      tap(x, y) { const s = Math.min(300 / n, 80), ox = (r.W - n * s) / 2, oy = 130; const i = Math.floor((x - ox) / s), j = Math.floor((y - oy) / s); if (i < 0 || j < 0 || i >= n || j >= n) return; if (j * n + i === odd) { r.addScore(Math.max(5, 30 - Math.floor(t * 3))); n = Math.min(7, n + (Math.random() < 0.5 ? 1 : 0)); make(); } else { r.addScore(-5); } },
      draw() { r.clear('#FDF4FF'); const s = Math.min(300 / n, 80), ox = (r.W - n * s) / 2, oy = 130; for (let k = 0; k < cells; k++) r.emoji(k === odd ? pair[1] : pair[0], ox + (k % n) * s + s / 2, oy + Math.floor(k / n) * s + s / 2, s * 0.7); r.text('איזה שונה?', r.W / 2, 90, { size: 22, color: '#86198F' }); },
    };
  } });

// ---- מספרים לפי הסדר ----
G.push({ id: 'number-order', name: 'מספרים לפי הסדר', emoji: '🔟', how: 'נוגעים במספרים מ-1 ועד הסוף, לפי הסדר, כמה שיותר מהר.',
  make(r) {
    let n = 12, nums, next = 1, t = 0;
    const make = () => { nums = r.shuffle([...Array(n).keys()].map(i => i + 1)); next = 1; t = 0; };
    make();
    const cols = 4;
    return {
      update(dt) { t += dt; },
      tap(x, y) { const s = 80, ox = (r.W - cols * s) / 2, oy = 120; const i = Math.floor((x - ox) / s), j = Math.floor((y - oy) / s); const k = j * cols + i; if (i < 0 || i >= cols || j < 0 || k >= nums.length) return; if (nums[k] === next) { next++; r.addScore(3); if (next > n) { r.addScore(Math.max(0, 40 - Math.floor(t)) * 2); n = Math.min(20, n + 4); make(); } } else r.addScore(-2); },
      draw() { r.clear('#F0F9FF'); const s = 80, ox = (r.W - cols * s) / 2, oy = 120; nums.forEach((v, k) => { const done = v < next; r.rect(ox + (k % cols) * s + 4, oy + Math.floor(k / cols) * s + 4, s - 8, s - 8, done ? '#BAE6FD' : '#0284C7', 10); if (!done) r.text(v, ox + (k % cols) * s + s / 2, oy + Math.floor(k / cols) * s + s / 2, { size: 30 }); }); r.text(`הבא: ${next}`, r.W / 2, 80, { size: 24, color: '#0C4A6E' }); },
    };
  } });

// ---- מה הבא בתור ----
G.push({ id: 'sequence', name: 'מה הבא בסדרה?', emoji: '➕', how: 'סדרת מספרים עם חוקיות. בוחרים את המספר הבא מבין שלוש אפשרויות.',
  make(r) {
    let seq, ans, opts, streak = 0;
    const make = () => { const kind = r.rint(0, 3); const a = r.rint(1, 12); let f; if (kind === 0) { const d = r.rint(2, 9); f = i => a + d * i; } else if (kind === 1) { f = i => a * 2 ** i; } else if (kind === 2) { f = i => (a + i) * (a + i); } else { const d = r.rint(1, 4); f = i => a + d * i * (i + 1) / 2; }
      seq = [0, 1, 2, 3].map(f); ans = f(4); opts = r.shuffle([ans, ans + r.pick([-1, 1]) * r.rint(1, 3), ans + r.pick([-1, 1]) * r.rint(4, 9)]); };
    make();
    return {
      tap(x, y) { if (y < 320 || y > 420) return; const k = Math.floor(x / (r.W / 3)); if (opts[k] === ans) { streak++; r.addScore(10 + streak * 2); } else { streak = 0; r.addScore(-3); } make(); },
      draw() { r.clear('#FFF1F2'); r.text(seq.join(' , ') + ' , ?', r.W / 2, 160, { size: 30, color: '#9F1239' }); opts.forEach((o, k) => { const x = k * r.W / 3 + r.W / 6; r.rect(x - 50, 330, 100, 80, '#E11D48', 12); r.text(o, x, 370, { size: 30 }); }); r.text(`רצף: ${streak}`, r.W / 2, 480, { size: 18, color: '#9F1239' }); },
    };
  } });

export default G;

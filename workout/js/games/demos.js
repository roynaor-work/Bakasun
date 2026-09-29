// תסריטי הדגמה: אצבע מדומה שמשחקת ומסבירה בכתוביות. כל תסריט: (t, game, ctl, r). ctl: say, tap, swipe, moveTo, release, mem (זיכרון לתסריט).
const every = (ctl, key, gap, t) => { if ((ctl.mem[key] ?? -99) + gap <= t) { ctl.mem[key] = t; return true; } return false; };
const captions = (ctl, t, list) => { for (let i = list.length - 1; i >= 0; i--) if (t >= list[i][0]) { ctl.say(list[i][1]); return; } };

export const DEMOS = {
  tetris(t, game, ctl) { captions(ctl, t, [[0, 'מחליקים שמאלה וימינה כדי להזיז את החתיכה'], [3.5, 'נוגעים כדי לסובב'], [6.5, 'מחליקים למטה כדי להפיל מהר'], [9.5, 'שורה מלאה נמחקת וחושפת את התמונה!']]);
    const P = game.peek(); const m = ctl.mem; if (m.target == null) { let best = 0; for (let i = 1; i < P.cols - P.cur.w + 1; i++) if (P.heights[i] < P.heights[best]) best = i; m.target = best; m.rot = Math.random() < .5; m.moves = 0; }
    const fx = P.OX + (P.cur.x + P.cur.w / 2) * P.S, fy = P.OY + (P.cur.y + 1) * P.S + 40;
    if (every(ctl, 'act', .32, t)) { if (m.rot && t > 3.5) { ctl.tap(fx, fy); m.rot = false; } else if (P.cur.x < m.target) ctl.swipe('right', fx, fy); else if (P.cur.x > m.target) ctl.swipe('left', fx, fy); else if (t > 6.5 || m.moves > 6) { ctl.swipe('down', fx, fy); m.target = null; } m.moves++; } },
  snake(t, game, ctl) { captions(ctl, t, [[0, 'מחליקים לכיוון שרוצים ללכת'], [4, 'אוכלים המבורגרים, הזנב מתארך'], [8, 'לא נוגעים בקירות ולא בזנב!']]);
    const P = game.peek(); if (!every(ctl, 'act', .22, t)) return; const [hx, hy] = P.head, [fx, fy] = P.food, [dx, dy] = P.dir;
    const opts = []; if (fx > hx) opts.push('right'); if (fx < hx) opts.push('left'); if (fy > hy) opts.push('down'); if (fy < hy) opts.push('up');
    const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    const safe = d => { const [vx, vy] = vec[d]; if (vx === -dx && vy === -dy) return false; const nx = hx + vx, ny = hy + vy; if (nx < 0 || ny < 0 || nx >= P.cols || ny >= P.rows) return false; return !P.body.some(s => s[0] === nx && s[1] === ny); };
    const pick = opts.find(safe) || ['up', 'down', 'left', 'right'].find(safe); if (pick && (vec[pick][0] !== dx || vec[pick][1] !== dy)) ctl.swipe(pick, P.cx(hx), P.cy(hy)); },
  penalty(t, game, ctl) { captions(ctl, t, [[0, 'נוגעים איפה בשער לבעוט'], [3, 'השוער מנחש צד וגובה. פינות = בונוס!'], [7, 'רצף שערים מכפיל נקודות'], [10, 'זהירות: קרוב מדי לקורה, אפשר להחטיא']]);
    const P = game.peek(); if (P.phase === 'aim' && P.ready >= 1 && every(ctl, 'kick', 2.2, t)) { const zones = [[-1, 0], [1, 2], [0, 0], [1, 0], [-1, 2]]; const [c, rw] = zones[(ctl.mem.k = (ctl.mem.k || 0) + 1) % zones.length]; const [zx, zy] = P.zoneCenter(c, rw); ctl.tap(zx, zy); } },
  keeper(t, game, ctl) { captions(ctl, t, [[0, 'הבועט רץ לכדור...'], [1.5, 'לוחצים בשער לאן לקפוץ, לפני הבעיטה'], [5, 'קפצת לאזור הנכון = עצירה ונקודות!'], [9, 'רצף עצירות מכפיל']]);
    const P = game.peek(); if (P.phase === 'run' && P.shot && ctl.mem.last !== P.shot) { ctl.mem.last = P.shot; ctl.mem.at = t + .45; ctl.mem.shot = P.shot; }
    if (ctl.mem.at && t >= ctl.mem.at) { const s = ctl.mem.shot; const [zx, zy] = P.zoneCenter(s.col, s.row); ctl.tap(zx, zy); ctl.mem.at = 0; } },
  moles(t, game, ctl) { captions(ctl, t, [[0, 'שטר קופץ מהחור? נוגעים בו מהר!'], [4, 'לא נוגעים בקקי. הוא באותו צבע, תסתכלו טוב'], [8, 'שטר עם X קטן = מזויף. לא לגעת'], [10.5, 'שטר של 200 שווה הכי הרבה']]);
    const P = game.peek(); if (!every(ctl, 'act', .38, t)) return; const note = P.holes.find(h => h.up > .3 && h.kind === 'note'); if (note) ctl.tap(note.x, note.y); else { const bad = P.holes.find(h => h.up > 0 && h.kind !== 'note'); if (bad) ctl.moveTo(bad.x + 60, bad.y + 40); } },
  flappy(t, game, ctl) { captions(ctl, t, [[0, 'נוגעים כדי שהפרה תעוף למעלה'], [3, 'עוברים בין התחתונים לאסלות'], [7, 'אוספים בונוסים מצחיקים'], [10, 'כשהרבי בא עם הרשת, עפים גבוה!']]);
    const P = game.peek(); if (!P.started) { if (every(ctl, 'tap', .5, t)) ctl.tap(180, 300); return; }
    const targetY = P.next ? P.next.gapY + 10 : 280; if (P.y > targetY - 6 && every(ctl, 'tap', .27, t)) ctl.tap(180, 420); },
};
export const DEMO_DUR = { tetris: 13, snake: 11, penalty: 12, keeper: 12, moles: 12, flappy: 12 };

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
    const safe = d => { const [vx, vy] = vec[d]; if (vx === -dx && vy === -dy) return false; const nx = hx + vx, ny = hy + vy; if (nx < 0 || ny < 0 || nx >= P.cols || ny >= P.rows) return false; if ((P.walls || []).some(w => w[0] === nx && w[1] === ny)) return false; return !P.body.some(s => s[0] === nx && s[1] === ny); };
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
  // ---- מקבץ 2 ----
  breakout(t, game, ctl, r) { captions(ctl, t, [[0, 'מזיזים את המחבת עם האצבע'], [3, 'הכדור קופץ מהפיצה ומפיל לבנים'], [6, 'תופסים דברים טובים שנופלים: 🍔 🍕 🎾'], [9.5, 'לא תופסים 💩 🌶️ ⚡ (לתפוס = צרות)']]);
    const P = game.peek(); const W = r.W, H = r.H; let target = W / 2;
    const falling = P.balls.filter(b => b.vy > 0).sort((a, b) => b.y - a.y)[0];
    if (falling) { const dtHit = Math.max(0, (H - 40 - falling.y) / Math.max(1, falling.vy)); let x = falling.x + falling.vx * dtHit; while (x < 8 || x > W - 8) x = x < 8 ? 16 - x : 2 * (W - 8) - x; target = x; }
    const good = P.drops.find(d => d.good && d.y > H - 220 && (!falling || falling.y < H / 2 || Math.abs(d.x - target) < 70)); if (good) target = good.x;
    for (const d of P.drops) if (!d.good && d.y > H - 150 && Math.abs(d.x - target) < P.paddleW / 2 + 14) target += d.x < target ? 55 : -55;
    target = Math.max(30, Math.min(W - 30, target)); ctl.moveTo(P.zap ? W - target : target, H - 60); },
  pong(t, game, ctl, r) { captions(ctl, t, [[0, 'נוגעים למטה: נגד המחשב. למעלה: שני שחקנים'], [2.5, 'המחבט עוקב אחרי האצבע, לכל כיוון'], [5.5, 'חבטה מהירה קדימה מעיפה את הדיסקית!'], [9, 'משחק עד 3 שערים']]);
    const P = game.peek(); const W = r.W, H = r.H; if (P.mode == null) { if (t > .4 && every(ctl, 'pick', 1, t)) ctl.tap(W / 2, H * 3 / 4); return; }
    const pk = P.puck; if (pk.y > H / 2 - 40 && pk.vy > -50) { const near = pk.y > H / 2 + 60 && Math.abs(pk.x - P.me.x) < 90 && pk.y < P.me.y + 10; ctl.moveTo(pk.x, near ? Math.max(H / 2 + 40, pk.y - 26) : Math.min(H - 40, pk.y + 70)); } else ctl.moveTo(W / 2, H - 90); },
  pinball(t, game, ctl, r) { captions(ctl, t, [[0, 'מושכים את הכדור למטה ומשחררים: חזק = רחוק'], [2.5, 'נוגעים בצד שמאל או ימין כדי להרים פליפר'], [6, 'מכים כשהכדור מגיע לפליפר, לא לפני'], [9.5, 'מנהרות בצדדים (מלמטה!), ספינר וגשר = בונוסים']]);
    const P = game.peek(); const H = r.H; if (!P.launched) { /* מושכים את הבוכנה ומשחררים */ const lx = r.W - P.LANE / 2; const m = ctl.mem; if (!m.pullT) { m.pullT = t; ctl.moveTo(lx, H - 150); } else if (t - m.pullT > .5 && t - m.pullT < 1.3) ctl.moveTo(lx, H - 150 + 95 * Math.min(1, (t - m.pullT - .5) / .6)); else if (t - m.pullT >= 1.3) { ctl.release(); m.pullT = 0; } return; }
    if (P.rail || P.tunnel) { ctl.moveTo(P.TW / 2, H - 40); return; }
    const b = P.ball; if (b.y > P.FY - 80 && b.vy > 0 && every(ctl, 'flip', .38, t)) { if (b.x < P.TW / 2) ctl.tap(50, H - 50); else ctl.tap(P.TW - 50, H - 50); } },
  invaders(t, game, ctl, r) { captions(ctl, t, [[0, 'כיפת ברזל: המטוס עוקב אחרי האצבע ויורה לבד'], [3, 'מפילים רקטות ורחפנים לפני שהם מגיעים לעיר'], [6.5, 'תופסים נשקים: ⚡ 🚀 🔫 🛡️'], [9.5, 'בסוף כל גל בוס: טיל ענק, ואחריו הדוד!']]);
    const P = game.peek(); const W = r.W, H = r.H; let target = P.px;
    const low = [...P.enemies, ...(P.divers || [])].filter(e => e.y < H - 120).sort((a, b) => b.y - a.y)[0]; if (low) target = low.x; if (P.boss) target = P.boss.x;
    const drop = P.drops.find(d => d.y > 200); if (drop) target = drop.x;
    const threat = P.eshots.find(e => e.y > H - 280 && Math.abs(e.x - P.px) < 36); if (threat) target = threat.x < W / 2 ? threat.x + 70 : threat.x - 70;
    ctl.moveTo(Math.max(24, Math.min(W - 24, target)), H - 45); },
  asteroids(t, game, ctl, r) { captions(ctl, t, [[0, 'מזיזים את המטוס לכל מקום, הוא יורה לבד'], [3, 'מתחמקים מהאבנים'], [6.5, 'אוספים 🌟 ו-🛡️'], [9.5, '💣 מוכנה? לוחצים בפינה ומנקים את המסך']]);
    const P = game.peek(); const W = r.W, H = r.H; let tx = P.px, ty = H - 80;
    const star = P.stars.find(s => s.y > 150 && s.y < P.py); if (star) tx = star.x;
    let danger = null; for (const k of [...P.rocks, ...(P.eshots || []).map(e => ({ ...e, s: 6 }))]) if (k.y < P.py && k.y > P.py - 240 && Math.abs(k.x + k.vx * .6 - tx) < k.s + 30) danger = danger && danger.y > k.y ? danger : k;
    if (P.hole && Math.abs(P.hole.x - tx) < 90) tx = P.hole.x < W / 2 ? Math.min(W - 30, P.hole.x + 120) : Math.max(30, P.hole.x - 120);
    if (danger) tx = danger.x < W / 2 ? Math.min(W - 30, danger.x + danger.s + 60) : Math.max(30, danger.x - danger.s - 60);
    if (t > 9.6 && P.bomb >= 30 && P.rocks.length >= 3 && !ctl.mem.bombed) { ctl.mem.bombed = true; ctl.tap(P.BOMB.x, P.BOMB.y); return; }
    ctl.moveTo(tx, ty); },
  // ---- מקבץ 3 ----
  runner(t, game, ctl, r) { captions(ctl, t, [[0, 'הקנגורו רץ. נוגעים = קפיצה מעל מכשול'], [3, 'באוויר? נוגעים שוב: קפיצה כפולה'], [6, 'ציפור או ענף? מחליקים למטה כדי להתכופף'], [9.5, 'אוספים מטבעות. הנוף מתחלף כל 500 מטר']]);
    const P = game.peek(); const nxt = P.obs.filter(o => o.x + o.w > P.PX - 10).sort((a, b) => a.x - b.x)[0]; if (!nxt) return; const high = nxt.kind === 'bird' || nxt.kind === 'branch'; const dist = nxt.x - P.PX;
    if (high) { if (dist < P.speed * .45 && !P.duck && every(ctl, 'duck', .8, t)) ctl.swipe('down', P.PX, P.GY - 30); }
    else if (dist < P.speed * .42 + nxt.w * .3 && P.y >= P.GY - 1 && every(ctl, 'jump', .5, t)) ctl.tap(P.PX + 60, P.GY - 80); },
  frogger(t, game, ctl, r) { captions(ctl, t, [[0, 'מחליקים למעלה כשהנתיב פנוי'], [3.5, 'בכביש: מחכים שהמכונית תעבור'], [7, 'בנהר: קופצים על בול עץ או צב, לא למים!'], [10, 'ממלאים את 5 הבתים למעלה. זבוב = בונוס']]);
    const P = game.peek(); if (P.dead) return; const px = P.fx * P.S + P.S / 2; const cx = px, cy = P.OY + P.fy * P.S + P.S / 2; if (!every(ctl, 'hop', .45, t)) return;
    const laneAt = y => P.lanes.find(l => l.y === y); const up = laneAt(P.fy - 1);
    const safeRoad = (l, x, ahead = .45) => !l.items.some(it => { const nx = it.x + l.dir * l.sp * ahead; return x > Math.min(it.x, nx) - it.w / 2 - 26 && x < Math.max(it.x, nx) + it.w / 2 + 26; });
    const onLog = (l, x) => l.items.find(it => x > it.x - it.w / 2 + 8 && x < it.x + it.w / 2 - 8 && !(it.dive >= 0 && it.dive > 3.5));
    if (P.fy === P.HOME_ROW + 1) { const target = [0, 1, 2, 3, 4].filter(i => !P.homes[i]).map(i => P.homeX(i) + .5).sort((a, b) => Math.abs(a - P.fx - .5) - Math.abs(b - P.fx - .5))[0]; if (target == null) return; if (Math.abs(target - (P.fx + .5)) < .6) ctl.swipe('up', cx, cy); else ctl.swipe(target > P.fx + .5 ? 'right' : 'left', cx, cy); return; }
    if (!up) { ctl.swipe('up', cx, cy); return; }
    if (up.kind === 'road') { if (safeRoad(up, px)) ctl.swipe('up', cx, cy); return; }
    const log = onLog(up, px); if (log) { ctl.swipe('up', cx, cy); return; }
    const cur = laneAt(P.fy); if (cur && cur.kind === 'river') { const mine = onLog(cur, px); if (mine && px > r.W - 60 && cur.dir > 0) ctl.swipe('left', cx, cy); else if (mine && px < 60 && cur.dir < 0) ctl.swipe('right', cx, cy); } },
  'dots-maze'(t, game, ctl, r) { captions(ctl, t, [[0, 'מחליקים לכיוון, הפקמן ממשיך עד הקיר'], [3, 'אוכלים את כל הנקודות'], [6, 'גלולה גדולה = הרוחות כחולות, אוכלים אותן!'], [9.5, 'מעבר בצד = יוצאים מהצד השני']]);
    const P = game.peek(); if (!every(ctl, 'step', .2, t)) return; const px = Math.round(P.p.x), py = Math.round(P.p.y);
    const danger = (x, y) => !P.fright && P.ghosts.some(g => g.dead <= 0 && Math.abs(g.x - x) + Math.abs(g.y - y) <= 1.2);
    /* BFS לנקודה הקרובה, בלי לעבור ליד רוח */
    const start = px + ',' + py, prev = new Map([[start, null]]), q = [[px, py]]; let goal = null;
    while (q.length && !goal) { const [x, y] = q.shift(); if ((P.dots.has(x + ',' + y) || P.power.has(x + ',' + y) || (P.fruit && P.fruit.x === x && P.fruit.y === y)) && (x !== px || y !== py)) { goal = x + ',' + y; break; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = ((x + dx) % P.COLS + P.COLS) % P.COLS, ny = y + dy; const k = nx + ',' + ny; if (!P.free(nx, ny) || prev.has(k) || danger(nx, ny)) continue; prev.set(k, x + ',' + y); q.push([nx, ny]); } }
    if (!goal) { const opts = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]].filter(([, dx, dy]) => P.free(px + dx, py + dy) && !danger(px + dx, py + dy)); if (opts.length) ctl.swipe(opts[0][0], P.OX + (px + .5) * P.S, P.OY + (py + .5) * P.S); return; }
    let k = goal; while (prev.get(k) !== start) k = prev.get(k); const [gx, gy] = k.split(',').map(Number); let dx = gx - px, dy = gy - py; if (Math.abs(dx) > 1) dx = -Math.sign(dx);
    const dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'; ctl.swipe(dir, P.OX + (px + .5) * P.S, P.OY + (py + .5) * P.S); },
  doodle(t, game, ctl, r) { captions(ctl, t, [[0, 'הקנגורו קופץ לבד, האצבע מזיזה ימינה ושמאלה'], [3, 'דשא רגיל, עץ זז, עוגה נשברת, ענן נעלם'], [6.5, 'קפיץ וטרמפולינה מעיפים גבוה. 🚀 = טיסה'], [9.5, 'מפלצת? קופצים עליה מלמעלה!']]);
    const P = game.peek(); let tx = P.x; if (P.vy > 0 || true) { const cands = P.plats.filter(p => p.y > P.y - 20 && p.y < P.y + 260 && p.kind !== 'break' && !(p.gone > 0)).sort((a, b) => Math.abs(a.y - (P.y + 120)) - Math.abs(b.y - (P.y + 120))); const best = cands.find(p => Math.abs(p.x - P.x) < 150) || cands[0]; if (best) tx = best.x; }
    const m = P.monsters.find(m => Math.abs(m.y - P.y) < 120 && m.y < P.y); if (m && P.vy > -100) { if (Math.abs(m.x - tx) < 40) tx = m.x < r.W / 2 ? Math.min(r.W - 30, m.x + 80) : Math.max(30, m.x - 80); }
    ctl.moveTo(tx, r.H - 80); },
  gems(t, game, ctl, r) { captions(ctl, t, [[0, 'הטור נופל. מחליקים ימינה ושמאלה'], [3.5, 'נוגעים כדי לסובב את הסדר'], [6.5, 'מחליקים למטה כדי להפיל מהר'], [9.5, '3 זהים בשורה, בטור או באלכסון נעלמים. קומבו!']]);
    const P = game.peek(); if (!P.cur) return; const m = ctl.mem; const fx = P.OX + (P.cur.x + .5) * P.S, fy = P.OY + Math.max(1, P.cur.y + 1.5) * P.S;
    if (m.target == null) { let best = 0; for (let i = 1; i < P.COLS; i++) if (P.heights[i] < P.heights[best]) best = i; m.target = best; m.rot = Math.random() < .6 ? 1 + Math.floor(Math.random() * 2) : 0; }
    if (!every(ctl, 'act', .3, t)) return; if (m.rot > 0 && t > 3.5) { ctl.tap(fx, fy); m.rot--; } else if (P.cur.x < m.target) ctl.swipe('right', fx, fy); else if (P.cur.x > m.target) ctl.swipe('left', fx, fy); else if (t > 6.5) { ctl.swipe('down', fx, fy); m.target = null; } },
  // ---- מקבץ 4 ----
  juggle(t, game, ctl, r) { captions(ctl, t, [[0, 'נוגעים בכדור כדי להקפיץ אותו למעלה'], [3, 'נוגעים מהצד: הכדור עף הצידה'], [6, 'כל 10 הקפצות עוד כדור. לא להפיל!'], [9.5, 'קומבו: מחליפים בין הכדורים']]);
    const P = game.peek(); const low = P.balls.filter(b => b.vy > 0 && b.y > 250).sort((a, b) => b.y - a.y)[0]; if (low && every(ctl, 'tap', .25, t)) ctl.tap(low.x + (low.x < r.W / 2 ? -8 : 8), low.y + 6); },
  'bubble-shooter'(t, game, ctl, r) { captions(ctl, t, [[0, 'גוררים כדי לכוון, הקו מראה לאן'], [3.5, 'משחררים: 3 באותו צבע נעלמות'], [6.5, 'בועות שנשארו באוויר נופלות: בונוס!'], [9.5, 'נוגעים בבועה הקטנה כדי להחליף']]);
    const P = game.peek(); if (P.shot) return; const m = ctl.mem; if (m.phase == null) { m.phase = 0; }
    if (m.phase === 0 && every(ctl, 'aim', 2.2, t)) { const same = P.cells.filter(c => c.c === P.cur); let target = same.sort((a, b) => b.y - a.y)[0] || P.cells.sort((a, b) => b.y - a.y)[0]; if (!target) return; m.tx = target.x + (target.x < r.W / 2 ? 12 : -12); m.ty = target.y + P.S * .6; ctl.moveTo(P.shooter.x + (m.tx - P.shooter.x) * .5, P.shooter.y + (m.ty - P.shooter.y) * .5); m.phase = 1; m.at = t + .7; }
    else if (m.phase === 1 && t >= m.at) { ctl.release(); m.phase = 0; } },
  basketball(t, game, ctl, r) { captions(ctl, t, [[0, 'הקשת הלבנה זזה עם מד הכוח'], [3, 'נוגעים כשהקשת עוברת בסל'], [6.5, 'סוויש בלי ברזל = 30 נקודות'], [9.5, '3 ברצף = הכדור בוער 🔥']]);
    const P = game.peek(); if (!P.canShoot) return; if (Math.abs(P.p - P.ideal) < .03 && every(ctl, 'shot', 1.2, t)) ctl.tap(r.W / 2, r.H * .6); },
  golf(t, game, ctl, r) { captions(ctl, t, [[0, 'גוררים מהכדור אחורה, משחררים'], [3, 'חול מאט, מים מחזירים'], [6, 'טחנת הרוח מסתובבת: מחכים לרגע הנכון'], [9.5, 'פחות חבטות מהפאר = יותר נקודות']]);
    const P = game.peek(); const m = ctl.mem; if (P.moving) { m.phase = 0; return; } if (m.phase == null) m.phase = 0;
    if (m.phase === 0 && every(ctl, 'shot', 1.6, t)) { ctl.tap(P.ball.x, P.ball.y); m.phase = .5; m.at = t + .15; }
    else if (m.phase === .5 && t >= m.at) { ctl.moveTo(P.ball.x, P.ball.y); m.phase = 1; m.at = t + .3; }
    else if (m.phase === 1 && t >= m.at) { const dx = P.hole[0] - P.ball.x, dy = P.hole[1] - P.ball.y, L = Math.hypot(dx, dy); const pull = Math.min(140, L * .55); ctl.moveTo(P.ball.x - dx / L * pull, P.ball.y - dy / L * pull); m.phase = 2; m.at = t + .5; }
    else if (m.phase === 2 && t >= m.at) { ctl.release(); m.phase = 0; } },
  bowling(t, game, ctl, r) { captions(ctl, t, [[0, 'נגיעה 1: הסמן זז, עוצרים באמצע'], [3, 'נגיעה 2: כוח, באמצע הירוק'], [6, 'נגיעה 3: זווית, כשהחץ ישר'], [9.5, 'סטרייק = כל העשרה בגלגול אחד!']]);
    const P = game.peek(); if (P.canRoll && P.good && every(ctl, 'tap', .6, t)) ctl.tap(r.W / 2, r.H * .7); },
};
export const DEMO_TOP = new Set(['breakout', 'pong', 'pinball', 'runner', 'frogger', 'juggle', 'bowling']); /* כתוביות למעלה */
export const DEMO_DUR = { tetris: 13, snake: 11, penalty: 12, keeper: 12, moles: 12, flappy: 12, breakout: 13, pong: 12, pinball: 12, invaders: 12, asteroids: 12, runner: 12, frogger: 13, 'dots-maze': 12, doodle: 12, gems: 13, juggle: 12, 'bubble-shooter': 13, basketball: 13, golf: 13, bowling: 13 };

// משחקי ארקייד קלאסיים
import { POSE, S as SP, KITS } from './sprites.js';
import { renderStill, SCENE_IDS, STILL_T } from './celebrate.js';
const G = [];

// ---- טטריס ----
G.push({ id: 'tetris', name: 'טטריס', emoji: '🧱', how: 'מחליקים ימינה ושמאלה כדי להזיז, נוגעים כדי לסובב, מחליקים למטה כדי להפיל.',
  make(r) {
    const COLS = 10, ROWS = 18, S = 27, OX = 45, OY = 62, LINES_PER_PIC = 4; // למעלה רק החתיכה הבאה והתקדמות התמונה
    const SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]]];
    const COLORS = [r.C.sky, r.C.gold, r.C.accent, r.C.hot, r.C.teal, r.C.ok, r.C.pink];
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let cur, t = 0, speed = 0.55, next = r.rint(0, 6), lines = 0, revealed = 0, picLines = 0, picFlash = 0, picIdx = r.rint(0, SCENE_IDS.length - 1), picDone = 0, custom = null;
    // תמונה שהמשתמש העלה בהגדרות (למשל הולאנד בועט) מחליפה את הפריימים המצוירים
    // התמונות: מה שהועלה בהגדרות, ואם אין, התמונות המובנות (workout/img/tetris/1-5.jpg: רונאלדו והולאנד חוגגים)
    let pics = []; try { pics = JSON.parse(localStorage.getItem('kidfit.tetrisPics') || '[]'); const one = localStorage.getItem('kidfit.tetrisPic'); if (one && !pics.length) pics = [one]; } catch { pics = []; }
    if (!pics.length && typeof Image !== 'undefined') pics = [1, 2, 3, 4, 5].map(i => new URL(`../../img/tetris/${i}.jpg`, import.meta.url).href);
    let picI = pics.length ? r.rint(0, pics.length - 1) : 0; const loadCustom = () => { if (!pics.length || typeof Image === 'undefined') return; custom = new Image(); custom.onload = paintPic; custom.src = pics[picI]; };
    // התמונה שמאחורי הלוח: פריים מהחגיגות, נחשפת שורה אחרי שורה
    const pic = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (pic) { pic.width = 360; pic.height = 560; }
    const paintPic = () => { if (!pic) return; try { if (custom && custom.complete && custom.naturalWidth) { const c = pic.getContext('2d'); const k = Math.max(360 / custom.naturalWidth, 560 / custom.naturalHeight); c.fillStyle = '#000'; c.fillRect(0, 0, 360, 560); c.drawImage(custom, (360 - custom.naturalWidth * k) / 2, (560 - custom.naturalHeight * k) / 2, custom.naturalWidth * k, custom.naturalHeight * k); } else renderStill(pic, SCENE_IDS[picIdx], STILL_T[SCENE_IDS[picIdx]]); } catch { /* */ } };
    loadCustom();
    paintPic();
    const spawn = () => { const i = next; next = r.rint(0, 6); cur = { s: SHAPES[i].map(x => [...x]), c: i + 1, x: 3, y: 0 }; if (collides(cur.s, cur.x, cur.y)) r.over('הלוח מלא!'); };
    const collides = (s, x, y) => s.some((row, j) => row.some((v, i) => v && (x + i < 0 || x + i >= COLS || y + j >= ROWS || (y + j >= 0 && grid[y + j][x + i]))));
    const rotate = s => s[0].map((_, i) => s.map(row => row[i]).reverse());
    const lock = () => { cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && cur.y + j >= 0) grid[cur.y + j][cur.x + i] = cur.c; }));
      let n = 0; for (let j = ROWS - 1; j >= 0; j--) if (grid[j].every(Boolean)) { grid.splice(j, 1); grid.unshift(Array(COLS).fill(0)); n++; j++; }
      if (n) { const pts = [0, 100, 300, 500, 800][n]; r.addScore(pts); lines += n; speed = Math.max(0.15, speed - 0.02 * n); r.pop(n === 4 ? 'טטריס! +800' : '+' + pts, r.W / 2, 300, r.C.gold, 26); r.burst(r.W / 2, 330, COLORS[cur.c - 1], 16);
        const lvl = 1 + Math.floor(lines / 6); speed = Math.max(0.22, 0.55 - (lvl - 1) * 0.06); r.addScore(n * 5 * lvl); if (lvl > 1 && (lines - n) < (lvl - 1) * 6) r.pop(`רמה ${lvl}! מהר יותר`, r.W / 2, 240, r.C.gold, 24);
        r.sfx(n === 4 ? 'win' : 'goal');
        // כל שורה חושפת שורה מהתמונה
        // 4 שורות = תמונה שלמה: כל שורה חושפת רבע מהתמונה
        picLines += n; revealed = Math.min(ROWS, Math.ceil(picLines * ROWS / LINES_PER_PIC)); if (picLines >= LINES_PER_PIC) { picFlash = 1.8; picLines = 0; picDone++; r.addScore(300); r.pop('התמונה נחשפה! +300', r.W / 2, 280, r.C.gold, 26); r.burst(r.W / 2, 300, r.C.gold, 30, 300); if (pics.length) { picI = (picI + 1) % pics.length; loadCustom(); } else { picIdx = (picIdx + 1) % SCENE_IDS.length; paintPic(); } } } else r.sfx('tick'); spawn(); };
    const step = () => { if (!collides(cur.s, cur.x, cur.y + 1)) cur.y++; else lock(); };
    spawn();
    return {
      update(dt) { if (picFlash > 0) { picFlash -= dt; if (picFlash <= 0) revealed = 0; return; } t += dt; if (t > speed) { t = 0; step(); } },
      revive() { for (let j = 0; j < Math.floor(ROWS * .6); j++) grid[j].fill(0); spawn(); },
      peek() { const heights = []; for (let i = 0; i < COLS; i++) { let h = 0; for (let j = 0; j < ROWS; j++) if (grid[j][i]) { h = ROWS - j; break; } heights.push(h); } return { cur: { x: cur.x, y: cur.y, w: cur.s[0].length, h: cur.s.length }, cols: COLS, rows: ROWS, OX, OY, S, heights }; }, // בזמן הבזק התמונה השלמה המשחק עוצר לרגע
      swipe(d) { if (d === 'left' && !collides(cur.s, cur.x - 1, cur.y)) cur.x--; if (d === 'right' && !collides(cur.s, cur.x + 1, cur.y)) cur.x++; if (d === 'down') { while (!collides(cur.s, cur.x, cur.y + 1)) cur.y++; lock(); r.addScore(5); } if (d === 'up') this.tap(); },
      tap() { const rs = rotate(cur.s); for (const dx of [0, -1, 1, -2, 2]) if (!collides(rs, cur.x + dx, cur.y)) { cur.s = rs; cur.x += dx; break; } },
      draw() { r.clear(); r.rect(OX - 2, OY - 2, COLS * S + 4, ROWS * S + 4, '#2A2555', 6);
        // התמונה מאחור, חתוכה לגודל הלוח, ומכוסה בשורות שעוד לא נחשפו (מלמעלה למטה)
        const BW = COLS * S, BH = ROWS * S; r.ctx.save(); r.ctx.beginPath(); r.ctx.roundRect(OX, OY, BW, BH, 4); r.ctx.clip(); const sc = Math.max(BW / 360, BH / 560), dw = 360 * sc, dh = 560 * sc; if (pic) { r.ctx.globalAlpha = picFlash > 0 ? 1 : .38; r.ctx.drawImage(pic, OX + (BW - dw) / 2, OY + (BH - dh) / 2, dw, dh); r.ctx.globalAlpha = 1; if (picFlash <= 0) { r.ctx.fillStyle = 'rgba(30,27,58,.45)'; r.ctx.fillRect(OX, OY, BW, BH); } } r.ctx.restore(); /* התמונה כרקע עמום כדי לא להפריע למשחק; כשהיא נחשפת כולה היא מוצגת בהירה לרגע */
        for (let j = revealed; j < ROWS; j++) r.rect(OX, OY + j * S, BW, S + 0.5, '#1E1B3A');
        if (revealed > 0 && revealed < ROWS) r.line(OX, OY + revealed * S, OX + BW, OY + revealed * S, r.C.gold, 2);
        // למעלה: החתיכה הבאה, שורות, והתקדמות התמונה
        r.rect(OX, 6, 96, 50, '#2A2555', 8); r.text('הבא', OX + 16, 18, { size: 11, color: r.C.muted }); const ns = SHAPES[next], nw = ns[0].length * 12, nh = ns.length * 12; ns.forEach((row, j) => row.forEach((v, i) => { if (v) r.rect(OX + 58 - nw / 2 + i * 12 + 1, 31 - nh / 2 + j * 12 + 1, 10, 10, COLORS[next], 3); }));
        r.text(`שורות: ${lines}`, OX + BW - 40, 18, { size: 12, color: r.C.muted }); r.rect(OX + BW - 130, 30, 130, 10, '#2A2555', 5); r.rect(OX + BW - 130, 30, 130 * picLines / LINES_PER_PIC, 10, r.C.gold, 5); r.text(`עוד ${LINES_PER_PIC - picLines} שורות לתמונה${picDone ? ` · ${picDone} ✓` : ''}`, OX + BW - 65, 50, { size: 11, color: r.C.muted });
        // רוח: איפה החתיכה תנחת
        let gy = cur.y; while (!collides(cur.s, cur.x, gy + 1)) gy++; cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && gy + j >= 0) r.rect(OX + (cur.x + i) * S + 3, OY + (gy + j) * S + 3, S - 6, S - 6, COLORS[cur.c - 1] + '33', 3); }));
        grid.forEach((row, j) => row.forEach((v, i) => { if (v) { r.rect(OX + i * S + 1, OY + j * S + 1, S - 2, S - 2, COLORS[v - 1], 4); r.rect(OX + i * S + 4, OY + j * S + 4, S - 8, 5, '#ffffff33', 2); } }));
        cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && cur.y + j >= 0) r.rect(OX + (cur.x + i) * S + 1, OY + (cur.y + j) * S + 1, S - 2, S - 2, COLORS[cur.c - 1], 4); })); },
    };
  } });

// ---- הרעב הגדול (נחש): הפרצוף אוכל המבורגרים. כל 20 המבורגרים = שלב חדש (נשמר): שלב 2 קירות, שלב 3 עכבר שגונב את האוכל, שלב 4 מהיר יותר, שלב 5+ יותר קירות ושני עכברים. 3 חיים, המשך במתנה ----
G.push({ id: 'snake', name: 'הרעב הגדול', emoji: '🍔', how: 'מחליקים לכיוון שרוצים. הפרצוף אוכל המבורגרים, והזנב מתארך. לא נוגעים בקירות ולא בזנב. כל 20 המבורגרים שלב חדש: קירות, עכבר שגונב אוכל (תופסים אותו = בונוס!), מהירות. השלב נשמר לפעם הבאה.',
  make(r, progress) {
    const S = 44, COLS = Math.floor(r.W / S), ROWS = Math.floor((r.H - 44) / S), OX = (r.W - COLS * S) / 2, OY = 44, PER = 20;
    let level = Math.max(1, (progress && progress.level) || 1), eaten = (level - 1) * PER, snake = [[2, 5], [1, 5], [0, 5]], dir = [1, 0], next = dir, t = 0, speed = .3, tt = 0, chew = 0, lives = 3, walls = [], mice = [], mt = 0, levelT = 0, food;
    const REC = k => new URL(`../../snd/${k}.mp4`, import.meta.url).href;
    let face = null; try { if (typeof Image !== 'undefined') { const src = localStorage.getItem('kidfit.facePic'); face = new Image(); face.src = src || new URL('../../img/face.jpg', import.meta.url).href; } } catch { face = null; }
    const occupied = (x, y) => snake.some(s => s[0] === x && s[1] === y) || walls.some(w => w[0] === x && w[1] === y) || mice.some(m => m.x === x && m.y === y);
    function place() { let p, n = 0; do { p = [r.rint(0, COLS - 1), r.rint(0, ROWS - 1)]; } while (n++ < 200 && (occupied(p[0], p[1]) || (Math.abs(p[0] - snake[0][0]) + Math.abs(p[1] - snake[0][1]) < 2))); return p; }
    const setup = () => { // מה יש בשלב הזה
      walls = []; mice = []; const nWalls = level >= 5 ? 10 : level >= 2 ? 6 : 0; for (let i = 0; i < nWalls; i++) { let p, n = 0; do { p = [r.rint(0, COLS - 1), r.rint(1, ROWS - 2)]; } while (n++ < 100 && (occupied(p[0], p[1]) || p[1] === 5 || Math.abs(p[0] - snake[0][0]) < 3)); walls.push(p); }
      const nMice = level >= 5 ? 2 : level >= 3 ? 1 : 0; for (let i = 0; i < nMice; i++) mice.push({ x: COLS - 1 - i, y: ROWS - 1, t: 0 }); speed = Math.max(.14, .3 - (level - 1) * .035 - (level >= 4 ? .04 : 0)); food = place(); };
    setup();
    const cx = c => OX + c * S + S / 2, cy = c => OY + c * S + S / 2;
    const die = msg => { r.play(REC('wall')); lives--; if (lives <= 0) return r.over(msg); r.shake(250); r.pop(`${msg} נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 20); snake = [[2, 5], [1, 5], [0, 5]]; dir = [1, 0]; next = dir; walls = walls.filter(w => !(w[1] === 5 && w[0] < 6)); };
    return {
      swipe(d) { const m = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d]; if (m && !(m[0] === -dir[0] && m[1] === -dir[1])) next = m; },
      peek() { return { head: snake[0], body: snake, food, dir: next, cols: COLS, rows: ROWS, cx, cy, walls, mice }; },
      save() { return { level }; },
      revive() { lives = 3; snake = [[2, 5], [1, 5], [0, 5]]; dir = [1, 0]; next = dir; walls = walls.filter(w => !(w[1] === 5 && w[0] < 6)); },
      update(dt) { t += dt; tt += dt; chew = Math.max(0, chew - dt * 3); levelT -= dt;
        // העכברים: כל 0.55 שניות צעד לעבר האוכל. הגיעו = אכלו אותו והאוכל מופיע במקום אחר
        mt += dt; if (mt > .55) { mt = 0; mice.forEach(m => { const dx = Math.sign(food[0] - m.x), dy = Math.sign(food[1] - m.y); if (Math.abs(food[0] - m.x) >= Math.abs(food[1] - m.y)) m.x += dx; else m.y += dy; if (m.x === food[0] && m.y === food[1]) { r.pop('העכבר אכל! 🐀', cx(m.x), cy(m.y) - 24, '#f87171', 18); r.sfx('laugh'); food = place(); } }); }
        if (t < speed) return; t = 0; dir = next;
        const h = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
        if (h[0] < 0 || h[0] >= COLS || h[1] < 0 || h[1] >= ROWS) return die('בום! נכנסת בקיר.');
        if (snake.some(s => s[0] === h[0] && s[1] === h[1])) return die('אכלת את הזנב שלך!');
        if (walls.some(w => w[0] === h[0] && w[1] === h[1])) return die('נתקעת בקיר!');
        snake.unshift(h);
        const mi = mice.findIndex(m => m.x === h[0] && m.y === h[1]); if (mi >= 0) { mice.splice(mi, 1); r.addScore(40); r.pop('תפסת את העכבר! +40 🐀', cx(h[0]), cy(h[1]) - 24, r.C.gold, 20); r.burst(cx(h[0]), cy(h[1]), '#9ca3af', 14, 180); r.sfx('score'); setTimeout(() => mice.push({ x: COLS - 1, y: ROWS - 1, t: 0 }), 6000); }
        if (h[0] === food[0] && h[1] === food[1]) { eaten++; const pts = (10 + Math.min(eaten % PER, 10) * 2) * level; r.addScore(pts); r.pop('+' + pts + ' 🍔', cx(h[0]), cy(h[1]) - 20, r.C.gold, 22); r.burst(cx(h[0]), cy(h[1]), '#f97316', 10, 140); r.play(REC('eat')); chew = 1;
          if (eaten % PER === 0) { level++; levelT = 2; snake = [[2, 5], [1, 5], [0, 5]]; dir = [1, 0]; next = dir; setup(); r.win(`שלב ${level}! ${level === 2 ? 'קירות!' : level === 3 ? 'עכבר גונב אוכל!' : level === 4 ? 'מהר יותר!' : 'הכול ביחד!'}`, 100 * level); return; }
          food = place(); } else snake.pop(); },
      draw() { r.clear('#0f3d2e'); for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if ((i + j) % 2) r.rect(OX + i * S, OY + j * S, S, S, '#124a37');
        r.text(`שלב ${level} · ${'❤️'.repeat(Math.max(0, lives))} · עוד ${PER - eaten % PER} 🍔 לשלב הבא`, r.W / 2, 20, { size: 14, color: '#bbf7d0' });
        walls.forEach(w => { r.rect(OX + w[0] * S + 2, OY + w[1] * S + 2, S - 4, S - 4, '#7c4a1e', 6); r.rect(OX + w[0] * S + 6, OY + w[1] * S + 6, S - 12, 6, '#a16207', 2); r.rect(OX + w[0] * S + 6, OY + w[1] * S + S / 2, S - 12, 6, '#a16207', 2); });
        SP.burger(r, cx(food[0]), cy(food[1]), 1.1, tt);
        mice.forEach(m => { const x = cx(m.x), y = cy(m.y); r.circle(x, y + 4, 14, '#9ca3af'); r.circle(x - 10, y + 2, 7, '#9ca3af'); r.circle(x - 13, y - 4, 4, '#fda4af'); r.circle(x - 13, y + 1, 1.5, '#1B1740'); r.line(x + 12, y + 6, x + 26, y - 2, '#9ca3af', 3); r.circle(x - 6, y - 5, 4, '#fda4af'); r.emoji('🧀', x + 6, y - 12, 12); });
        for (let i = snake.length - 1; i >= 1; i--) { const k = 1 - i / snake.length; SP.burger(r, cx(snake[i][0]), cy(snake[i][1]), 0.6 + k * .3, tt + i); }
        const near = Math.abs(snake[0][0] - food[0]) + Math.abs(snake[0][1] - food[1]) <= 2; SP.face(r, cx(snake[0][0]), cy(snake[0][1]), S * .68, dir, chew > 0 ? chew : near ? 1 : 0, face);
        if (levelT > 0) r.text(`שלב ${level}`, r.W / 2, r.H / 2, { size: 40, color: r.C.gold }); },
    };
  } });

// ---- שובר לבנים: מהלבנים נופלים בונוסים (מחבט רחב, כדור נוסף, כדור אש, ניקוד כפול, מטבע) ודברים רעים (מחבט קטן, קקי שמלכלך את המסך, כדור מהיר). רמה = יותר שורות, מהיר יותר, ניקוד גבוה יותר ----
G.push({ id: 'breakout', name: 'שובר לבנים', emoji: '🧊', how: 'יש 3 כדורים, והרמה נשמרת לפעם הבאה. מזיזים את המחבט עם האצבע ומפילים את כל הלבנים. מהלבנים נופלים דברים מצחיקים: 🍔 המבורגר = כוח כפול, 🎾 מכפיל כדורים, 🥅 רשת ביטחון, 🍕 פיצה מרחיבה, 🐌 חילזון מאט, ✖️2 ניקוד כפול, 💰 מטבע. רעים: 🩳 תחתונים מקטינים, 💩 קקי, 🌶️ צ׳ילי מהיר, ⚡ חשמל שהופך את הכיוונים!',
  make(r, progress) {
    let px = r.W / 2, PW = 80, balls = [], bricks = [], level = Math.max(1, (progress && progress.level) || 1), drops = [], fx = { wide: 0, fire: 0, x2: 0, small: 0, poop: 0, fast: 0, slow: 0, zap: 0, net: 0 }, tt = 0, lives = 3;
    const newBall = (x = r.W / 2, y = r.H - 80, vx = 160) => ({ x, y, vx, vy: -260 });
    const build = () => { bricks = []; for (let j = 0; j < 4 + level; j++) for (let i = 0; i < 8; i++) bricks.push({ x: 8 + i * 43, y: 60 + j * 22, c: [r.C.pink, r.C.hot, r.C.gold, r.C.ok, r.C.sky, r.C.accent, r.C.teal][j % 7], hp: level >= 3 && j < 2 ? 2 : 1 }); };
    build(); balls = [newBall()];
    // מה נופל: 22% מהלבנים מפילות משהו. טוב: 70%, רע: 30%
    const DROPS = [['fire', '🍔', 'המבורגר! כוח כפול 💪', true], ['multi', '🎾', 'מכפיל כדורים!', true], ['net', '🥅', 'רשת ביטחון!', true], ['wide', '🍕', 'פיצה מרחיבה!', true], ['slow', '🐌', 'חילזון! הכדור איטי', true], ['x2', '✖️2', 'ניקוד כפול!', true], ['coin', '💰', '+50', true], ['small', '🩳', 'תחתונים מקטינים...', false], ['poop', '💩', 'קקי! לא רואים...', false], ['fast', '🌶️', 'צ׳ילי! הכדור בוער', false], ['zap', '⚡', 'חשמל! הכיוונים הפוכים', false]];
    const dropFrom = b => { if (Math.random() > .22) return; const good = Math.random() < .7; const opts = DROPS.filter(d => d[3] === good); const [kind, e, txt] = r.pick(opts); drops.push({ x: b.x + 20, y: b.y + 9, kind, e, txt, good, vy: 90 + level * 8, ph: Math.random() * 6 }); };
    const paddleW = () => fx.wide > 0 ? 130 : fx.small > 0 ? 50 : PW;
    return {
      move(x) { const target = fx.zap > 0 ? r.W - x : x; px = r.clamp(target, paddleW() / 2, r.W - paddleW() / 2); }, down(x) { this.move(x); }, /* חשמל: הכיוונים הפוכים */
      save() { return { level }; }, revive() { lives = 3; balls = [newBall()]; drops = []; },
      update(dt) { tt += dt; for (const k in fx) fx[k] = Math.max(0, fx[k] - dt); const spd = fx.fast > 0 ? 1.45 : fx.slow > 0 ? .65 : 1; const W2 = paddleW();
        // הכדורים
        for (const ball of balls) { ball.x += ball.vx * dt * spd; ball.y += ball.vy * dt * spd;
          if (ball.x < 8) { ball.x = 8; ball.vx = Math.abs(ball.vx); } if (ball.x > r.W - 8) { ball.x = r.W - 8; ball.vx = -Math.abs(ball.vx); } if (ball.y < 8) { ball.y = 8; ball.vy = Math.abs(ball.vy); }
          if (ball.vy > 0 && ball.y > r.H - 40 && ball.y < r.H - 24 && Math.abs(ball.x - px) < W2 / 2 + 8) { ball.vy = -Math.abs(ball.vy) * 1.02; ball.vx = (ball.x - px) * (W2 > 100 ? 4 : 6); r.sfx('bounce'); }
          for (let i = bricks.length - 1; i >= 0; i--) { const b = bricks[i]; if (r.hit(ball.x - 8, ball.y - 8, 16, 16, b.x, b.y, 40, 18)) { b.hp--; if (b.hp <= 0 || fx.fire > 0) { r.burst(b.x + 20, b.y + 9, b.c, 8, 140); bricks.splice(i, 1); dropFrom(b); const pts = 10 * level * (fx.x2 > 0 ? 2 : 1); r.addScore(pts); if (fx.x2 > 0 || level > 1) r.pop('+' + pts, b.x + 20, b.y - 6, '#fff', 14); } else { r.sfx('hit'); } if (fx.fire <= 0) ball.vy *= -1; r.sfx('tick'); break; } } }
        if (fx.net > 0) for (const ball of balls) if (ball.y > r.H - 12 && ball.vy > 0) { ball.vy = -Math.abs(ball.vy); ball.y = r.H - 14; fx.net = 0; r.pop('הרשת תפסה! 🥅', r.W / 2, r.H - 60, r.C.ok, 20); r.sfx('bounce'); }
        const before = balls.length; balls = balls.filter(b => b.y < r.H + 10); if (balls.length < before && balls.length) r.pop('כדור אחד נפל', r.W / 2, r.H - 120, r.C.muted, 16);
        if (!balls.length) { lives--; if (lives <= 0) return r.over('נגמרו הכדורים!'); r.pop(`הכדור נפל. נשארו ${lives} ⚪`, r.W / 2, r.H / 2, '#fff', 20); r.sfx('over'); balls = [newBall()]; }
        // הדברים שנופלים: תופסים עם המחבט
        drops.forEach(d => { d.y += d.vy * dt; d.x += Math.sin(tt * 3 + d.ph) * 20 * dt; });
        for (const d of drops) { if (d.y > r.H - 44 && d.y < r.H - 20 && Math.abs(d.x - px) < W2 / 2 + 12) { d.got = true; r.pop(d.txt, px, r.H - 70, d.good ? r.C.gold : '#f87171', 20);
            if (d.kind === 'wide') { fx.wide = 8; fx.small = 0; r.sfx('score'); } else if (d.kind === 'net') { fx.net = 12; r.sfx('score'); } else if (d.kind === 'slow') { fx.slow = 6; fx.fast = 0; r.sfx('score'); } else if (d.kind === 'zap') { fx.zap = 5; r.sfx('hit'); r.shake(300); } else if (d.kind === 'multi') { const src = balls[0]; balls.push(newBall(src.x, src.y, -src.vx), newBall(src.x, src.y, src.vx * .6)); r.sfx('score'); } else if (d.kind === 'fire') { fx.fire = 6; r.sfx('win'); } else if (d.kind === 'x2') { fx.x2 = 8; r.sfx('score'); } else if (d.kind === 'coin') { r.addScore(50); r.sfx('ching'); }
            else if (d.kind === 'small') { fx.small = 7; fx.wide = 0; r.sfx('over'); } else if (d.kind === 'poop') { fx.poop = 3; r.sfx('fart'); r.shake(200); } else if (d.kind === 'fast') { fx.fast = 6; fx.slow = 0; r.sfx('hit'); } } }
        drops = drops.filter(d => !d.got && d.y < r.H + 20);
        if (!bricks.length) { level++; balls = [newBall()]; drops = []; build(); r.win(`ניקית את הלוח! רמה ${level}`, 100 * level); } },
      draw() { r.clear(); bricks.forEach(b => { r.rect(b.x, b.y, 40, 18, b.c, 4); r.rect(b.x + 3, b.y + 3, 34, 4, '#ffffff44', 2); if (b.hp > 1) r.rect(b.x + 14, b.y + 7, 12, 4, '#ffffff99', 2); });
        drops.forEach(d => { r.circle(d.x, d.y, 14, d.good ? 'rgba(134,239,172,.25)' : 'rgba(248,113,113,.25)'); r.emoji(d.e, d.x, d.y, d.kind === 'x2' ? 14 : 20); });
        if (fx.net > 0) { r.ctx.strokeStyle = 'rgba(34,197,94,.8)'; r.ctx.lineWidth = 2; for (let i = 0; i < r.W; i += 14) r.line(i, r.H - 14, i + 7, r.H - 6, 'rgba(34,197,94,.8)', 2); r.line(0, r.H - 14, r.W, r.H - 14, r.C.ok, 3); }
        const W2 = paddleW(); const jit = fx.zap > 0 ? (Math.random() - .5) * 6 : 0; r.rect(px - W2 / 2 + jit, r.H - 32, W2, 12, fx.zap > 0 ? '#facc15' : fx.wide > 0 ? r.C.ok : fx.small > 0 ? '#ef4444' : r.C.ink, 6); if (fx.zap > 0) r.emoji('⚡', px + W2 / 2 + 14, r.H - 26, 18); r.rect(px - W2 / 2 + 6, r.H - 30, W2 - 12, 3, r.C.sky, 2);
        balls.forEach(ball => { if (fx.fire > 0) { r.circle(ball.x, ball.y, 12, 'rgba(249,115,22,.35)'); r.emoji('🍔', ball.x, ball.y, 18); } else if (fx.fast > 0) { r.circle(ball.x, ball.y, 11, 'rgba(239,68,68,.35)'); r.circle(ball.x, ball.y, 8, '#ef4444'); } else { r.circle(ball.x, ball.y, 8, r.C.gold); r.circle(ball.x - 2, ball.y - 3, 2.5, '#fff8'); } });
        // מצב הבונוסים למעלה
        const act = [fx.wide > 0 && '🍕', fx.fire > 0 && '🍔', fx.x2 > 0 && '✖️2', fx.net > 0 && '🥅', fx.slow > 0 && '🐌', fx.small > 0 && '🩳', fx.fast > 0 && '🌶️', fx.zap > 0 && '⚡'].filter(Boolean).join(' '); r.text(`רמה ${level} · ${'⚪'.repeat(Math.max(0, lives))}${act ? ' · ' + act : ''}`, r.W / 2, 30, { size: 14, color: r.C.muted });
        // קקי על המסך: כתמים חומים שמסתירים חלק מהמסך
        if (fx.poop > 0) { const a = Math.min(1, fx.poop) * .85; for (let i = 0; i < 7; i++) r.circle(40 + (i * 53) % (r.W - 60), 120 + (i * 97) % (r.H - 220), 45 + (i % 3) * 15, `rgba(124,74,30,${a})`); r.emoji('💩', r.W / 2, r.H / 2, 60); } },
    };
  } });

// ---- הוקי שולחן (במקום פונג): מחבט עגול שזז לכל כיוון בחצי התחתון, חבטה מהירה ובזווית מעיפה את הדיסקית, שערים צרים, יריב עם פרצוף שמתעצבן, רמות ----
G.push({ id: 'pong', name: 'הוקי שולחן', emoji: '🏒', how: 'משחקים עד שהיריב מבקיע 3. הרמה נשמרת. המחבט שלך בחצי התחתון וזז לכל כיוון עם האצבע, גם קדימה ואחורה. חובטים בדיסקית לתוך השער העליון. חבטה מהירה ובזווית מעיפה אותה מהר! היריב מתעצבן כשהוא חוטף.',
  make(r, progress) {
    const GW = 150, MR = 26, PR = 11; let me = { x: r.W / 2, y: r.H - 90, vx: 0, vy: 0 }, ai = { x: r.W / 2, y: 90 }, level = Math.max(1, (progress && progress.level) || 1), mood = 0, moodT = 0, tt = 0, myPts = 0, hisPts = 0, trail = [], hitT = 0; let puck = reset();
    function reset(toMe = true) { return { x: r.W / 2, y: toMe ? r.H / 2 + 60 : r.H / 2 - 60, vx: r.rnd(-60, 60), vy: toMe ? 120 : -120 }; }
    const face = (x, y) => { const c = r.ctx; r.circle(x, y, 20, '#FBBF24'); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 20, 0, Math.PI * 2); c.stroke(); const angry = moodT > 0 && mood < 0, happy = moodT > 0 && mood > 0; r.circle(x - 7, y - 4, 3, '#1B1740'); r.circle(x + 7, y - 4, 3, '#1B1740'); c.beginPath(); if (angry) { c.moveTo(x - 12, y - 13); c.lineTo(x - 3, y - 9); c.moveTo(x + 12, y - 13); c.lineTo(x + 3, y - 9); } else { c.moveTo(x - 11, y - 11); c.lineTo(x - 3, y - 10); c.moveTo(x + 11, y - 11); c.lineTo(x + 3, y - 10); } c.stroke(); c.beginPath(); if (angry) c.arc(x, y + 12, 7, Math.PI + .3, -.3); else if (happy) c.arc(x, y + 3, 9, .2, Math.PI - .2); else { c.moveTo(x - 6, y + 7); c.lineTo(x + 6, y + 7); } c.stroke(); if (angry) r.emoji('💢', x + 24, y - 18, 16); };
    const collide = (m, isMe) => { const d = r.dist(puck.x, puck.y, m.x, m.y); if (d < MR + PR && d > 0) { const nx = (puck.x - m.x) / d, ny = (puck.y - m.y) / d; const rel = (puck.vx - (m.vx || 0)) * nx + (puck.vy - (m.vy || 0)) * ny; if (rel < 0) { puck.vx -= 2 * rel * nx; puck.vy -= 2 * rel * ny; } const mv = Math.hypot(m.vx || 0, m.vy || 0); puck.vx += nx * mv * .9; puck.vy += ny * mv * .9; puck.x = m.x + nx * (MR + PR + 1); puck.y = m.y + ny * (MR + PR + 1); const sp = Math.hypot(puck.vx, puck.vy); if (sp > 900) { puck.vx *= 900 / sp; puck.vy *= 900 / sp; } if (sp < 160) { puck.vx *= 160 / Math.max(1, sp); puck.vy *= 160 / Math.max(1, sp); } r.sfx(sp > 600 ? 'hit' : 'bounce'); if (isMe && sp > 600) { hitT = .5; r.pop('חבטה! 💥', puck.x, puck.y - 30, r.C.gold, 22); } } };
    return {
      move(x, y) { const nx = r.clamp(x, MR, r.W - MR), ny = r.clamp(y, r.H / 2 + MR, r.H - MR); me.vx = (nx - me.x) * 30; me.vy = (ny - me.y) * 30; me.x = nx; me.y = ny; }, down(x, y) { this.move(x, y); },
      update(dt) { tt += dt; moodT -= dt; hitT -= dt; me.vx *= .5; me.vy *= .5;
        // חיכוך קל, קירות, ותקרה/רצפה מחוץ לשער
        puck.vx *= (1 - .25 * dt); puck.vy *= (1 - .25 * dt); puck.x += puck.vx * dt; puck.y += puck.vy * dt; trail.push([puck.x, puck.y]); if (trail.length > 10) trail.shift();
        if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx); r.sfx('tick'); } if (puck.x > r.W - PR) { puck.x = r.W - PR; puck.vx = -Math.abs(puck.vx); r.sfx('tick'); }
        const inGoalX = Math.abs(puck.x - r.W / 2) < GW / 2;
        if (puck.y < PR && !inGoalX) { puck.y = PR; puck.vy = Math.abs(puck.vy); r.sfx('tick'); } if (puck.y > r.H - PR && !inGoalX) { puck.y = r.H - PR; puck.vy = -Math.abs(puck.vy); r.sfx('tick'); }
        // היריב: רודף אחרי הדיסקית בחצי העליון, חוזר לשער כשהיא רחוקה. מהיר יותר ברמות גבוהות
        const aiSp = 150 + level * 40; const tx = puck.y < r.H / 2 ? puck.x : r.W / 2, ty = puck.y < r.H / 2 ? Math.max(MR + 20, puck.y - 10) : 70; const dx = tx - ai.x, dy = ty - ai.y, dl = Math.hypot(dx, dy) || 1; const step = Math.min(dl, aiSp * dt); ai.vx = dx / dl * step / dt; ai.vy = dy / dl * step / dt; ai.x += dx / dl * step; ai.y = r.clamp(ai.y + dy / dl * step, MR, r.H / 2 - MR);
        collide(me, true); collide(ai, false);
        if (puck.y < -PR) { myPts++; const sp = Math.hypot(puck.vx, puck.vy); const pts = (10 + Math.floor(sp / 80)) * level; r.addScore(pts); r.pop(`שער! +${pts}`, r.W / 2, 90, r.C.gold, 28); r.burst(r.W / 2, 10, r.C.pink, 16); r.sfx('goal'); mood = -1; moodT = 1.5; if (myPts % 3 === 0) { level++; r.pop(`רמה ${level}! היריב מהיר יותר`, r.W / 2, r.H / 2, r.C.gold, 22); } puck = reset(true); trail = []; }
        if (puck.y > r.H + PR) { hisPts++; mood = 1; moodT = 1.5; r.sfx('laugh'); if (hisPts >= 3) return r.over('היריב הבקיע 3!'); r.pop(`שער נגדך... ${hisPts}/3`, r.W / 2, r.H - 120, '#ef4444', 22); puck = reset(false); trail = []; } },
      save() { return { level }; }, revive() { hisPts = 0; puck = reset(true); trail = []; },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#e0f2fe'); bg.addColorStop(1, '#bae6fd'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H);
        // קווי השולחן, השערים, נקודת האמצע
        r.line(0, r.H / 2, r.W, r.H / 2, '#ef444488', 3); c.strokeStyle = '#ef444488'; c.lineWidth = 3; c.beginPath(); c.arc(r.W / 2, r.H / 2, 46, 0, Math.PI * 2); c.stroke();
        r.rect(r.W / 2 - GW / 2, 0, GW, 8, '#1B1740', 3); r.rect(r.W / 2 - GW / 2, r.H - 8, GW, 8, '#1B1740', 3); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(r.W / 2, 4, GW / 2, 0, Math.PI); c.stroke(); c.beginPath(); c.arc(r.W / 2, r.H - 4, GW / 2, Math.PI, 0); c.stroke();
        r.text(`${myPts} : ${hisPts}`, r.W / 2, r.H / 2 - 20, { size: 26, color: '#1B174066' }); r.text(`רמה ${level}`, r.W / 2, r.H / 2 + 20, { size: 13, color: '#1B174066' });
        trail.forEach(([x, y], i) => r.circle(x, y, PR * (i + 1) / trail.length, `rgba(27,23,64,${(i + 1) / trail.length * .25})`));
        // מחבטים: עיגול עם ידית
        const mallet = (m, col, faceIt) => { r.circle(m.x, m.y + 3, MR, 'rgba(0,0,0,.2)'); r.circle(m.x, m.y, MR, col); r.circle(m.x, m.y, MR - 6, 'rgba(255,255,255,.35)'); r.circle(m.x, m.y, 9, col); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(m.x, m.y, MR, 0, Math.PI * 2); c.stroke(); if (faceIt) face(m.x, m.y - MR - 22); };
        mallet(ai, moodT > 0 && mood < 0 ? '#ef4444' : r.C.pink, true); mallet(me, hitT > 0 ? r.C.gold : r.C.sky, false);
        const pg = c.createRadialGradient(puck.x - 3, puck.y - 3, 1, puck.x, puck.y, PR); pg.addColorStop(0, '#4b5563'); pg.addColorStop(1, '#111827'); c.fillStyle = pg; c.beginPath(); c.arc(puck.x, puck.y, PR, 0, Math.PI * 2); c.fill(); },
    };
  } });

// ---- פינבול: שולחן כמו פינבול אמיתי. פליפרים סימטריים כקטעים פיזיים (הכדור פוגע בהם גם כשלא מרימים, ומקבל תנופה כשמרימים), קירות משופעים
// שמובילים אליהם, במפרים עגולים, מטרות נופלות למעלה, רמפה עם מכפיל, מסלול שיגור מימין, 3 כדורים ----
G.push({ id: 'pinball', name: 'פינבול', emoji: '🎯', how: 'נוגעים בצד שמאל או ימין כדי להרים את הפליפר. הכדור קופץ מהפליפרים גם כשהם למטה, אבל רק פליפר שמורם מעיף אותו למעלה בכוח. במפרים = נקודות, כל המטרות הצהובות = בונוס, הרמפה משמאל = מכפיל. שלושה כדורים.',
  make(r) {
    const PR = 9, LANE = 34, TW = r.W - LANE; // אזור המשחק בלי מסלול השיגור
    let ball = null, fl = { l: 0, r: 0, la: 0, ra: 0 }, balls = 3, mult = 1, multT = 0, tt = 0, hits = 0, launched = false, launchT = 0;
    const bumpers = [{ x: 90, y: 165, r: 22, c: r.C.pink }, { x: 236, y: 165, r: 22, c: r.C.hot }, { x: 163, y: 245, r: 26, c: r.C.gold }];
    const targets = [70, 117, 164, 211, 258].map(x => ({ x, y: 78, up: true })); const flash = {};
    // פליפרים: ציר (pivot) ואורך; זווית מנוחה מטה פנימה, מורם = מעלה. סימטרי לחלוטין סביב מרכז אזור המשחק
    const FY = r.H - 78, FLEN = 72, CX = TW / 2, PIV_L = { x: 42, y: FY }, PIV_R = { x: TW - 42, y: FY }, REST = .42, UP = -.45;
    const flipperEnd = (side) => { const a = side === 'l' ? fl.la : fl.ra; const piv = side === 'l' ? PIV_L : PIV_R; const dir = side === 'l' ? 1 : -1; return { x1: piv.x, y1: piv.y, x2: piv.x + dir * Math.cos(a) * FLEN, y2: piv.y + Math.sin(a) * FLEN }; };
    // התנגשות כדור בקטע (עם רדיוס הפליפר 7): מחזירים נורמל ועומק
    const segHit = (seg, rad) => { const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1, l2 = dx * dx + dy * dy; let t = ((ball.x - seg.x1) * dx + (ball.y - seg.y1) * dy) / l2; t = Math.max(0, Math.min(1, t)); const cx = seg.x1 + dx * t, cy = seg.y1 + dy * t; const d = Math.hypot(ball.x - cx, ball.y - cy); if (d < PR + rad) return { nx: (ball.x - cx) / (d || 1), ny: (ball.y - cy) / (d || 1), depth: PR + rad - d, t }; return null; };
    const bounceSeg = (seg, rad, restitution = .75, extraV = 0, tangentBoost = 0) => { const h = segHit(seg, rad); if (!h) return false; ball.x += h.nx * h.depth; ball.y += h.ny * h.depth; const vn = ball.vx * h.nx + ball.vy * h.ny; if (vn < 0) { ball.vx -= (1 + restitution) * vn * h.nx; ball.vy -= (1 + restitution) * vn * h.ny; } ball.vx += h.nx * extraV * h.t; ball.vy += h.ny * extraV * h.t - tangentBoost * h.t; return true; };
    const walls = [ { x1: 0, y1: FY - 90, x2: PIV_L.x, y2: FY }, { x1: TW, y1: FY - 90, x2: PIV_R.x, y2: FY }, { x1: 0, y1: 40, x2: 40, y2: 8 }, { x1: TW, y1: 40, x2: TW - 40, y2: 8 } ]; // קירות משופעים למטה שמובילים לפליפרים, ופינות עגולות למעלה
    const newBall = () => { ball = { x: r.W - LANE / 2, y: r.H - 60, vx: 0, vy: 0 }; launched = false; launchT = .6; };
    newBall();
    return {
      down(x) { if (x < r.W / 2) fl.l = 0.16; else fl.r = 0.16; },
      revive() { balls = 3; hits = 0; newBall(); },
      update(dt) { tt += dt; fl.l = Math.max(0, fl.l - dt); fl.r = Math.max(0, fl.r - dt); multT -= dt; if (multT <= 0) mult = 1; for (const k in flash) flash[k] -= dt;
        // זוויות הפליפרים עם תנועה מהירה למעלה ואיטית יותר למטה
        const goal = side => (side === 'l' ? fl.l : fl.r) > 0 ? UP : REST; fl.la += (goal('l') - fl.la) * Math.min(1, dt * (fl.l > 0 ? 28 : 14)); fl.ra += (goal('r') - fl.ra) * Math.min(1, dt * (fl.r > 0 ? 28 : 14));
        // שיגור אוטומטי מהמסלול הימני
        if (!launched) { launchT -= dt; if (launchT <= 0) { launched = true; ball.vy = -(980 + r.rnd(0, 140)); r.sfx('bounce'); } return; }
        ball.vy += 640 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        const inLane = ball.x > TW && ball.y > 50; if (inLane) { ball.x = r.clamp(ball.x, TW + PR + 2, r.W - PR - 2); ball.vx = 0; if (ball.y < 60) { ball.vx = -r.rnd(120, 220); } }
        if (ball.y < 50 && ball.x > TW - 10) { ball.x = Math.min(ball.x, TW - 10); ball.vx = -Math.abs(ball.vx) - 120; }
        if (ball.x < PR) { ball.x = PR; ball.vx = Math.abs(ball.vx) * .8; r.sfx('tick'); } if (!inLane && ball.x > TW - PR) { ball.x = TW - PR; ball.vx = -Math.abs(ball.vx) * .8; }
        if (ball.y < PR) { ball.y = PR; ball.vy = Math.abs(ball.vy) * .8; }
        for (const w of walls) bounceSeg(w, 3, .7);
        // במפרים
        for (const b of bumpers) { const d = r.dist(ball.x, ball.y, b.x, b.y); if (d < b.r + PR) { const nx = (ball.x - b.x) / d, ny = (ball.y - b.y) / d; ball.vx = nx * 420; ball.vy = ny * 420; ball.x = b.x + nx * (b.r + PR + 1); ball.y = b.y + ny * (b.r + PR + 1); hits++; const pts = (25 + Math.min(hits, 20) * 5) * mult; r.addScore(pts); r.pop('+' + pts, b.x, b.y - b.r - 8, '#fff', 16); r.burst(b.x, b.y, b.c, 6, 100); flash[b.x] = .15; r.sfx('tick'); } }
        for (const tg of targets) { if (tg.up && Math.abs(ball.x - tg.x) < 20 && Math.abs(ball.y - tg.y) < 12) { tg.up = false; ball.vy = Math.abs(ball.vy); r.addScore(50 * mult); r.pop('+' + 50 * mult, tg.x, tg.y - 14, r.C.gold, 16); r.sfx('score'); if (targets.every(t => !t.up)) { r.addScore(300); r.pop('כל המטרות! +300', TW / 2, 120, r.C.gold, 24); r.burst(TW / 2, 100, r.C.gold, 30, 260); r.sfx('win'); setTimeout(() => targets.forEach(t => t.up = true), 800); } } }
        if (ball.x < 34 && ball.y < 130 && ball.vy < 0 && multT <= 0) { mult = 2; multT = 8; r.pop('מכפיל ×2!', 70, 150, r.C.gold, 22); r.sfx('ching'); }
        // הפליפרים: קטעים פיזיים. מורם = תנופה חזקה למעלה (ככל שרחוק מהציר), למטה = קפיצה רגילה
        for (const side of ['l', 'r']) { const seg = flipperEnd(side); const lifting = side === 'l' ? fl.l > 0 : fl.r > 0; if (bounceSeg(seg, 7, lifting ? .9 : .55, 0, lifting ? 620 : 0)) { if (lifting) { ball.vx += (side === 'l' ? 1 : -1) * 90; r.addScore(5); r.sfx('bounce'); } else r.sfx('tick'); } }
        const sp = Math.hypot(ball.vx, ball.vy); if (sp > 1100) { ball.vx *= 1100 / sp; ball.vy *= 1100 / sp; }
        if (ball.y > r.H + 20) { balls--; hits = 0; if (balls <= 0) return r.over('נגמרו הכדורים!'); r.pop(`הכדור ירד. נשארו ${balls}`, TW / 2, r.H / 2, '#fff', 20); r.sfx('over'); newBall(); } },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#3b2a6b'); bg.addColorStop(1, '#1e1140'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H);
        // מסלול שיגור מימין, קירות
        r.rect(TW, 50, LANE, r.H - 50, 'rgba(255,255,255,.05)'); r.rect(TW - 2, 50, 4, r.H - 50, '#8b7bd1'); c.strokeStyle = '#8b7bd1'; c.lineWidth = 6; c.lineCap = 'round'; walls.forEach(w => { c.beginPath(); c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2); c.stroke(); });
        c.strokeStyle = multT > 0 ? r.C.gold : '#8b7bd1'; c.lineWidth = 4; c.beginPath(); c.moveTo(14, 200); c.quadraticCurveTo(14, 60, 60, 44); c.stroke(); r.text('×2', 40, 110, { size: 14, color: multT > 0 ? r.C.gold : '#8b7bd1' });
        targets.forEach(tg => { if (tg.up) { r.rect(tg.x - 16, tg.y - 8, 32, 16, r.C.gold, 4); r.rect(tg.x - 12, tg.y - 5, 24, 4, '#ffffff66', 2); } else r.rect(tg.x - 16, tg.y - 2, 32, 4, '#5b4a8b', 2); });
        bumpers.forEach(b => { const f = (flash[b.x] || 0) > 0; r.circle(b.x, b.y, b.r + (f ? 4 : 0), b.c); r.circle(b.x, b.y, b.r - 8, f ? '#fff' : '#ffffff55'); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.stroke(); });
        // פליפרים סימטריים: קטע עם קצה עגול, ציר מסומן
        for (const side of ['l', 'r']) { const seg = flipperEnd(side); const lifting = side === 'l' ? fl.l > 0 : fl.r > 0; c.strokeStyle = lifting ? r.C.gold : '#c4b5fd'; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.moveTo(seg.x1, seg.y1); c.lineTo(seg.x2, seg.y2); c.stroke(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.moveTo(seg.x1, seg.y1); c.lineTo(seg.x2, seg.y2); c.stroke(); r.circle(seg.x1, seg.y1, 6, '#1B1740'); }
        // המרזב באמצע
        r.rect(PIV_L.x + FLEN * .6, r.H - 10, PIV_R.x - PIV_L.x - FLEN * 1.2, 10, '#00000066');
        const g = c.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, PR); g.addColorStop(0, '#fff'); g.addColorStop(1, '#9ca3af'); c.fillStyle = g; c.beginPath(); c.arc(ball.x, ball.y, PR, 0, Math.PI * 2); c.fill();
        r.text(`כדורים: ${'●'.repeat(Math.max(0, balls))}`, TW - 60, 22, { size: 13, color: '#c4b5fd' }); if (mult > 1) r.text(`מכפיל ×${mult} עוד ${Math.ceil(multT)}`, 70, 22, { size: 13, color: r.C.gold }); },
    };
  } });

// ---- פולשים מהחלל: גלים שנשמרים בין משחקים (progress.wave), חייזרים שזזים ויורדים, צוללנים, בוס עב"ם, 3 חיים, נשקים: ⚡ ירייה כפולה, 🚀 טילים מתפוצצים, 🔫 לייזר חודר, 🛡️ מגן ----
G.push({ id: 'invaders', name: 'פולשים מהחלל', emoji: '👾', how: 'החללית עוקבת אחרי האצבע ויורה לבד. הפולשים זזים ויורדים, ובסוף כל גל מגיע בוס. תופסים נשקים: ⚡ ירייה כפולה, 🚀 טילים שמתפוצצים, 🔫 לייזר חודר, 🛡️ מגן. יש 3 חיים. הגל שהגעת אליו נשמר לפעם הבאה!',
  make(r, progress) {
    let px = r.W / 2, shots = [], enemies = [], eshots = [], t = 0, dir = 1, et = 0, wave = Math.max(1, (progress && progress.wave) || 1), boss = null, drops = [], weapon = 'basic', weaponT = 0, shield = 0, tt = 0, lives = 3, inv = 0, booms = [], divers = [];
    const spawn = () => { enemies = []; const rows = Math.min(5, 3 + Math.floor(wave / 2)); for (let j = 0; j < rows; j++) for (let i = 0; i < 6; i++) enemies.push({ x: 40 + i * 50, y: 70 + j * 38, hp: wave >= 3 && j === 0 ? 2 : 1, kind: j % 4, bob: Math.random() * 6 }); boss = null; divers = []; };
    spawn();
    const shotGap = () => weapon === 'twin' ? .22 : weapon === 'missile' ? .5 : weapon === 'laser' ? .6 : .35;
    const fire = () => { const y = r.H - 66; if (weapon === 'twin') shots.push({ x: px - 9, y, kind: 'b' }, { x: px + 9, y, kind: 'b' }); else if (weapon === 'missile') shots.push({ x: px, y, kind: 'm', vy: 300 }); else if (weapon === 'laser') shots.push({ x: px, y, kind: 'l', life: .18, hitSet: new Set() }); else shots.push({ x: px, y, kind: 'b' }); if (weapon !== 'laser') r.sfx('tick'); else r.sfx('hit'); };
    const explode = (x, y, rad, pts) => { booms.push({ x, y, r: rad, t: .35 }); r.burst(x, y, r.C.hot, 24, 260); r.sfx('hit'); for (let i = enemies.length - 1; i >= 0; i--) { if (r.dist(enemies[i].x, enemies[i].y, x, y) < rad) { kill(i, pts); } } };
    const kill = (i, mult = 1) => { const e = enemies[i]; r.burst(e.x, e.y, [r.C.lime, r.C.pink, r.C.sky, r.C.gold][e.kind], 12, 180); enemies.splice(i, 1); const pts = 20 * wave * mult; r.addScore(pts); if (Math.random() < .13) drops.push({ x: e.x, y: e.y, kind: r.pick(['twin', 'missile', 'laser', 'shield']) }); };
    const hitMe = () => { if (shield > 0 || inv > 0) { r.burst(px, r.H - 45, r.C.sky, 10, 150); r.sfx('bounce'); return; } lives--; inv = 2; r.shake(300); r.burst(px, r.H - 45, r.C.hot, 30, 300); r.sfx('over'); eshots = []; if (lives <= 0) return r.over('החללית הושמדה!'); r.pop(`נפגעת! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); };
    return {
      move(x) { px = r.clamp(x, 24, r.W - 24); }, down(x) { this.move(x); },
      save() { return { wave }; },
      revive() { lives = 3; inv = 2.5; eshots = []; divers = []; enemies.forEach(e => { if (e.y > r.H - 200) e.y -= 120; }); if (boss) boss.hp = Math.min(boss.maxHp, boss.hp + 2); },
      update(dt) { tt += dt; t += dt; weaponT = Math.max(0, weaponT - dt); if (weaponT <= 0) weapon = 'basic'; shield = Math.max(0, shield - dt); inv = Math.max(0, inv - dt); booms.forEach(b => b.t -= dt); booms = booms.filter(b => b.t > 0);
        if (t > shotGap()) { t = 0; fire(); }
        shots.forEach(s => { if (s.kind === 'l') s.life -= dt; else s.y -= (s.vy || 440) * dt; }); shots = shots.filter(s => s.kind === 'l' ? s.life > 0 : s.y > -20);
        // המבנה זז לצדדים ויורד כל הזמן לאט; בקצה יורד קפיצה קטנה
        et += dt; const sp = 28 + wave * 12; let edge = false; const sink = (3 + wave) * dt;
        enemies.forEach(e => { e.x += dir * sp * dt; e.y += sink; if (e.x < 20 || e.x > r.W - 20) edge = true; }); if (edge) { dir *= -1; enemies.forEach(e => { e.y += 8; e.x = r.clamp(e.x, 20, r.W - 20); }); }
        // צוללנים: מגל 2 חייזר עוזב את המבנה ומזנק לעבר החללית, וחוזר למעלה
        if (wave >= 2 && enemies.length && Math.random() < dt * .25) { const e = r.pick(enemies); if (!e.dive) { e.dive = { vx: (px - e.x) / 1.3, vy: 260, t: 0 }; } }
        enemies.forEach(e => { if (e.dive) { e.dive.t += dt; e.x += e.dive.vx * dt; e.y += e.dive.vy * dt; if (e.y > r.H - 30) { e.y = 60; e.x = r.rnd(30, r.W - 30); e.dive = null; } } });
        if (et > Math.max(.45, 1.2 - wave * .1) && enemies.length) { et = 0; const e = r.pick(enemies); eshots.push({ x: e.x, y: e.y, vy: 200 + wave * 15 }); }
        if (boss) { boss.x += boss.dir * (70 + wave * 10) * dt; if (boss.x < 60 || boss.x > r.W - 60) boss.dir *= -1; boss.y += 4 * dt; boss.t += dt; boss.hurt = Math.max(0, boss.hurt - dt); if (boss.t > Math.max(.6, 1.2 - wave * .05)) { boss.t = 0; for (const dx of [-30, 0, 30]) eshots.push({ x: boss.x + dx, y: boss.y + 20, vy: 230 }); if (wave >= 4) eshots.push({ x: boss.x, y: boss.y + 20, vy: 200, vx: (px - boss.x) * .6 }); } }
        eshots.forEach(s => { s.y += (s.vy || 220) * dt; if (s.vx) s.x += s.vx * dt; }); eshots = eshots.filter(s => s.y < r.H);
        // פגיעות של היריות שלי
        for (const s of shots) {
          if (s.kind === 'l') { for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (Math.abs(e.x - s.x) < 16 && e.y < r.H - 66 && !s.hitSet.has(e)) { s.hitSet.add(e); e.hp -= 1; if (e.hp <= 0) kill(i, 1); } } if (boss && Math.abs(boss.x - s.x) < 46 && !s.hitSet.has(boss)) { s.hitSet.add(boss); boss.hp -= 2; boss.hurt = .2; } continue; }
          const i = enemies.findIndex(e => r.dist(e.x, e.y, s.x, s.y) < 18); if (i >= 0) { if (s.kind === 'm') { s.y = -99; explode(s.x, s.y + 99 - 99, 48, 1); } else { const e = enemies[i]; e.hp--; s.y = -99; if (e.hp <= 0) kill(i, 1); else r.sfx('hit'); } }
          if (boss && s.y > 0 && r.dist(boss.x, boss.y, s.x, s.y) < 44) { boss.hp -= s.kind === 'm' ? 3 : 1; boss.hurt = .2; s.y = -99; r.burst(s.x, s.y + 99, r.C.hot, 6, 120); r.sfx('hit'); if (s.kind === 'm') booms.push({ x: boss.x, y: boss.y, r: 40, t: .3 }); } }
        shots = shots.filter(s => s.kind === 'l' || s.y > -50);
        if (boss && boss.hp <= 0) { r.burst(boss.x, boss.y, r.C.gold, 60, 360); booms.push({ x: boss.x, y: boss.y, r: 90, t: .6 }); r.addScore(200 * wave); r.pop(`הבוס הובס! +${200 * wave}`, r.W / 2, 200, r.C.gold, 26); boss = null; wave++; spawn(); r.win(`גל ${wave}!`, 0); return; }
        drops.forEach(d => d.y += 110 * dt); for (const d of drops) if (Math.abs(d.x - px) < 26 && d.y > r.H - 74 && d.y < r.H - 26) { d.got = true; if (d.kind === 'shield') { shield = 8; r.pop('מגן! 🛡️', px, r.H - 96, r.C.sky, 20); } else { weapon = d.kind; weaponT = 10; r.pop({ twin: 'ירייה כפולה! ⚡', missile: 'טילים! 🚀', laser: 'לייזר! 🔫' }[d.kind], px, r.H - 96, r.C.gold, 20); } r.sfx('score'); } drops = drops.filter(d => !d.got && d.y < r.H);
        const hit = eshots.find(s => r.dist(s.x, s.y, px, r.H - 45) < 20); if (hit) { hit.y = r.H + 10; const res = hitMe(); if (res !== undefined) return res; }
        const rammed = enemies.find(e => e.dive && r.dist(e.x, e.y, px, r.H - 45) < 24); if (rammed) { rammed.y = 60; rammed.dive = null; const res = hitMe(); if (res !== undefined) return res; }
        if (enemies.some(e => !e.dive && e.y > r.H - 90) || (boss && boss.y > r.H - 130)) return r.over('הפולשים הגיעו!');
        if (!enemies.length && !boss) { boss = { x: r.W / 2, y: 100, hp: 8 + wave * 4, maxHp: 8 + wave * 4, dir: 1, t: 0, hurt: 0 }; r.pop('הבוס מגיע! 🛸', r.W / 2, 220, r.C.hot, 26); r.sfx('roar'); } },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#050816'); bg.addColorStop(1, '#151a3a'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); for (let i = 0; i < 40; i++) { const sy = (i * 131 + tt * (10 + (i % 3) * 12)) % r.H; r.circle((i * 89) % r.W, sy, i % 3 ? 1 : 1.6, `rgba(255,255,255,${.3 + (i % 4) * .15})`); }
        enemies.forEach((e, i) => { const by = Math.sin(tt * 3 + e.bob) * 2; SP.alien(r, e.x, e.y + by, tt + i, e.hp > 1 ? '#f97316' : [r.C.lime, r.C.pink, r.C.sky, r.C.gold][e.kind]); if (e.dive) r.circle(e.x, e.y - 14, 3, '#fff'); });
        if (boss) { SP.ufo(r, boss.x, boss.y, tt, 1.2, boss.hurt); r.rect(boss.x - 44, boss.y - 40, 88, 7, '#00000066', 3); r.rect(boss.x - 44, boss.y - 40, 88 * Math.max(0, boss.hp) / boss.maxHp, 7, r.C.hot, 3); }
        shots.forEach(s => { if (s.kind === 'b') { r.rect(s.x - 2, s.y, 4, 12, r.C.lime); r.circle(s.x, s.y, 3, '#fff'); } else if (s.kind === 'm') { r.rect(s.x - 3, s.y, 6, 16, '#e5e7eb', 2); r.rect(s.x - 3, s.y, 6, 5, '#ef4444', 2); r.circle(s.x, s.y + 20 + Math.random() * 4, 4, '#f97316'); } else { const a = s.life / .18; c.fillStyle = `rgba(56,189,248,${a * .9})`; c.fillRect(s.x - 3, 0, 6, s.y); c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(s.x - 1, 0, 2, s.y); } });
        eshots.forEach(s => { r.rect(s.x - 2, s.y, 4, 12, r.C.hot); r.circle(s.x, s.y + 12, 3, '#fde047'); });
        booms.forEach(b => { c.fillStyle = `rgba(251,146,60,${b.t * 1.5})`; c.beginPath(); c.arc(b.x, b.y, b.r * (1 - b.t / .6 * .4), 0, Math.PI * 2); c.fill(); });
        drops.forEach(d => { r.circle(d.x, d.y, 15, 'rgba(255,255,255,.18)'); r.emoji({ twin: '⚡', missile: '🚀', laser: '🔫', shield: '🛡️' }[d.kind], d.x, d.y, 20); });
        if (shield > 0) r.circle(px, r.H - 45, 32, `rgba(56,189,248,${.15 + Math.sin(tt * 8) * .08})`); if (!(inv > 0 && Math.sin(tt * 30) > 0)) SP.fighter(r, px, r.H - 45, tt, weapon === 'basic' ? r.C.sky : r.C.gold);
        r.text(`גל ${wave} · ${'❤️'.repeat(Math.max(0, lives))}${weapon !== 'basic' ? ` · ${{ twin: '⚡', missile: '🚀', laser: '🔫' }[weapon]} ${Math.ceil(weaponT)}` : ''}${shield > 0 ? ' · 🛡️' : ''}`, r.W / 2, r.H - 12, { size: 13, color: r.C.muted }); },
    };
  } });

// ---- שדה אסטרואידים: החללית המשותפת, אבנים מציאותיות שמסתובבות, 🌟 בונוס, 🛡️ מגן, 💣 פצצה שמתמלאת כל 30 שניות (מנקה את המסך), ירייה כפולה מ-10 פגיעות, רמות, 3 חיים, הרמה נשמרת ----
G.push({ id: 'asteroids', name: 'שדה אסטרואידים', emoji: '☄️', how: 'החללית עוקבת אחרי האצבע. נוגעים כדי לירות. הפצצה 💣 בפינה מתמלאת כל חצי דקה: נוגעים בה ומפוצצים את כל האבנים במסך! אוספים 🌟 ו-🛡️. יש 3 חיים. הרמה שהגעת אליה נשמרת.',
  make(r, progress) {
    let px = r.W / 2, py = r.H - 80, rocks = [], shots = [], t = 0, alive = (progress && progress.level ? (progress.level - 1) * 15 : 0), hits = 0, shield = 0, stars = [], st = 0, levelT = 0, lives = 3, inv = 0, bomb = 30, booms = [], tt = 0;
    const level = () => 1 + Math.floor(alive / 15); const BOMB = { x: r.W - 34, y: 34, r: 24 };
    const loseLife = (k) => { if (shield > 0 || inv > 0) { rocks = rocks.filter(x => x !== k); r.burst(k.x, k.y, r.C.sky, 14, 200); r.sfx('bounce'); return; } lives--; inv = 2; r.shake(300); r.burst(px, py, r.C.hot, 30, 300); r.sfx('over'); rocks = rocks.filter(x => r.dist(x.x, x.y, px, py) > 120); if (lives <= 0) return r.over('בום! החללית הושמדה'); r.pop(`נפגעת! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); };
    const detonate = () => { bomb = 0; booms.push({ x: px, y: py, r: 30, t: .8, max: 420 }); r.shake(400); r.sfx('roar'); let n = 0; rocks.forEach(k => { n++; r.burst(k.x, k.y, '#A8A29E', 8, 160); }); const pts = n * 8 * level(); rocks = []; r.addScore(pts); r.pop(`פצצה! ${n} אבנים +${pts} 💣`, r.W / 2, 200, r.C.gold, 24); };
    return {
      move(x, y) { px = r.clamp(x, 16, r.W - 16); py = r.clamp(y, 200, r.H - 30); }, down(x, y) { if (bomb >= 30 && r.dist(x, y, BOMB.x, BOMB.y) < BOMB.r + 10) { detonate(); return; } this.move(x, y); },
      tap(x, y) { if (bomb >= 30 && r.dist(x, y, BOMB.x, BOMB.y) < BOMB.r + 10) return; if (hits >= 10) shots.push({ x: px - 7, y: py - 20 }, { x: px + 7, y: py - 20 }); else shots.push({ x: px, y: py - 20 }); r.sfx('tick'); },
      save() { return { level: level() }; },
      revive() { lives = 3; inv = 3; rocks = []; shield = 3; },
      update(dt) { alive += dt; tt += dt; t += dt; st += dt; shield = Math.max(0, shield - dt); inv = Math.max(0, inv - dt); levelT -= dt; bomb = Math.min(30, bomb + dt); booms.forEach(b => { b.t -= dt; }); booms = booms.filter(b => b.t > 0); const L = level(); if (Math.floor(alive / 15) !== Math.floor((alive - dt) / 15)) { levelT = 1.5; r.pop(`רמה ${L}! ☄️`, r.W / 2, 150, r.C.gold, 24); }
        if (t > Math.max(0.28, 1 - L * .12)) { t = 0; rocks.push({ x: r.rnd(20, r.W - 20), y: -30, s: r.rnd(14, 32), vy: r.rnd(90, 190) + L * 15, vx: r.rnd(-40, 40), rot: r.rnd(0, 6), vr: r.rnd(-2, 2), seed: r.rnd(0, 100) }); }
        if (st > 4) { st = 0; stars.push({ x: r.rnd(30, r.W - 30), y: -20, kind: Math.random() < .75 ? 'star' : 'shield', vy: 80 }); }
        rocks.forEach(k => { k.y += k.vy * dt; k.x += k.vx * dt; k.rot += k.vr * dt; }); rocks = rocks.filter(k => k.y < r.H + 40); stars.forEach(s => { s.y += s.vy * dt; }); stars = stars.filter(s => s.y < r.H + 20 && !s.got);
        shots.forEach(s => s.y -= 500 * dt); shots = shots.filter(s => s.y > -10);
        for (const s of shots) { const i = rocks.findIndex(k => r.dist(k.x, k.y, s.x, s.y) < k.s + 4); if (i >= 0) { const k = rocks[i]; hits++; const pts = Math.round(k.s) * L; r.addScore(pts); r.pop('+' + pts, k.x, k.y - k.s - 6, '#fff', 14); r.burst(k.x, k.y, '#A8A29E', 10, 160); r.sfx('hit'); if (k.s > 22) { rocks.push({ x: k.x - 10, y: k.y, s: k.s / 2, vy: k.vy, vx: k.vx - 60, rot: 0, vr: 3, seed: k.seed + 1 }, { x: k.x + 10, y: k.y, s: k.s / 2, vy: k.vy, vx: k.vx + 60, rot: 0, vr: -3, seed: k.seed + 2 }); } rocks.splice(i, 1); s.y = -20; if (hits === 10) { r.pop('ירייה כפולה נפתחה! ⚡', r.W / 2, 200, r.C.gold, 22); r.sfx('win'); } } }
        for (const s of stars) if (r.dist(s.x, s.y, px, py) < 26) { s.got = true; if (s.kind === 'star') { r.addScore(30 * L); r.pop(`🌟 +${30 * L}`, px, py - 40, r.C.gold, 22); r.sfx('ching'); } else { shield = 6; r.pop('מגן! 🛡️', px, py - 40, r.C.sky, 22); r.sfx('score'); } }
        const hitRock = rocks.find(k => r.dist(k.x, k.y, px, py) < k.s + 12); if (hitRock) { const res = loseLife(hitRock); if (res !== undefined) return res; }
        if (Math.floor(alive * 2) !== Math.floor((alive - dt) * 2)) r.addScore(L); },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#05081a'); bg.addColorStop(1, '#0f172a'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); for (let i = 0; i < 40; i++) r.circle((i * 97) % r.W, (i * 173 + alive * (20 + (i % 3) * 15)) % r.H, i % 3 ? 1 : 1.8, `rgba(255,255,255,${.3 + (i % 4) * .15})`);
        const neb = c.createRadialGradient(80, 200, 10, 80, 200, 220); neb.addColorStop(0, 'rgba(139,92,246,.18)'); neb.addColorStop(1, 'rgba(139,92,246,0)'); c.fillStyle = neb; c.fillRect(0, 0, r.W, r.H);
        rocks.forEach(k => SP.rock(r, k.x, k.y, k.s, k.seed, k.rot)); stars.forEach(s => r.emoji(s.kind === 'star' ? '🌟' : '🛡️', s.x, s.y, 24)); shots.forEach(s => { r.rect(s.x - 2, s.y, 4, 14, r.C.lime); r.circle(s.x, s.y, 3, '#fff'); });
        booms.forEach(b => { const k = 1 - b.t / .8; c.strokeStyle = `rgba(251,146,60,${b.t})`; c.lineWidth = 8; c.beginPath(); c.arc(b.x, b.y, b.r + k * b.max, 0, Math.PI * 2); c.stroke(); });
        if (shield > 0) r.circle(px, py, 30, `rgba(56,189,248,${.15 + Math.sin(alive * 8) * .08})`); if (!(inv > 0 && Math.sin(tt * 30) > 0)) SP.fighter(r, px, py, tt, hits >= 10 ? r.C.gold : r.C.pink);
        // כפתור הפצצה: מתמלא כמו שעון
        r.circle(BOMB.x, BOMB.y, BOMB.r, 'rgba(255,255,255,.1)'); c.strokeStyle = bomb >= 30 ? r.C.gold : '#475569'; c.lineWidth = 4; c.beginPath(); c.arc(BOMB.x, BOMB.y, BOMB.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bomb / 30); c.stroke(); r.emoji('💣', BOMB.x, BOMB.y, bomb >= 30 ? 26 : 20); if (bomb >= 30) r.text('מוכן!', BOMB.x, BOMB.y + 34, { size: 11, color: r.C.gold });
        r.text(`רמה ${level()} · ${'❤️'.repeat(Math.max(0, lives))}${hits >= 10 ? ' · ⚡' : ` · עוד ${10 - hits} לירייה כפולה`}`, r.W / 2 - 30, r.H - 12, { size: 13, color: r.C.muted }); if (levelT > 0) r.text(`רמה ${level()}`, r.W / 2, 100, { size: 30, color: r.C.gold }); },
    };
  } });

// ---- הפרה המעופפת (במקום ציפור): עוברים בין תחתונים תלויים לאסלות. רבי עם כובע שחור ורשת מנסה לתפוס אותה, צייד זורק עגבניות מרמה 2, ובונוסים מצחיקים בין המכשולים ----
G.push({ id: 'flappy', name: 'הפרה המעופפת', emoji: '🐄', how: 'נוגעים כדי שהפרה תעוף למעלה. עוברים בין התחתונים לאסלות בלי לגעת. כשהרבי רץ עם הרשת, עפים גבוה! מרמה 2 מישהו זורק עגבניות. אוספים בונוסים מצחיקים.',
  make(r) {
    const BON = [['🍕', 20, 'פיצה מעופפת!'], ['🦆', 15, 'ברווז גומי!'], ['🧻', 30, 'נייר טואלט מזהב!'], ['🍔', 20, 'המבורגר באוויר!'], ['🧦', 25, 'גרב מסריח!'], ['🍩', 20, 'דונאט!']];
    let y = r.H / 2, vy = 0, obs = [], t = 1.0, gap = 190, tt = 0, passed = 0, started = false, farmer = null, farmerT = r.rnd(5, 8), items = [], warnT = 0, hunter = null, hunterT = 9, shots = [], levelT = 0, lives = 3;
    const crash = msg => { lives--; if (lives <= 0) return r.over(msg); r.pop(`${msg} נשארו ${lives} ❤️`, r.W / 2, r.H / 2 - 60, '#fff', 20); r.sfx('over'); y = r.H / 2; vy = 0; started = false; obs = obs.filter(p => p.x > 200); shots = []; farmer = null; hunter = null; };
    const level = () => Math.floor(passed / 5); // כל 5 מכשולים רמה: מהיר יותר, מרווח קטן יותר, ניקוד גבוה יותר
    const GY = r.H - 24;
    return {
      tap() { started = true; vy = -280; r.sfx('tick'); }, down() { started = true; vy = -280; },
      peek() { const nxt = obs.find(p => p.x + p.w > 62); return { y, started, next: nxt ? { x: nxt.x, gapY: nxt.h + gap / 2 } : null, items, farmer, shots }; },
      update(dt) { tt += dt; if (!started) { y = r.H / 2 + Math.sin(tt * 3) * 12; return; } vy = Math.min(420, vy + 700 * dt); y += vy * dt; t += dt; warnT -= dt;
        const spd = 120 + Math.min(90, level() * 14); gap = Math.max(150, 190 - level() * 8); levelT -= dt; if (t > Math.max(1.4, 1.9 - level() * .08)) { t = 0; const h = r.rnd(70, r.H - gap - 110); obs.push({ x: r.W + 30, h, passed: false, w: 56 });
          // בונוס: בשליש העליון או התחתון של המרווח (לא באמצע הקל), לא בכל מכשול
          if (Math.random() < .6) { const [e, val, txt] = r.pick(BON); items.push({ x: r.W + 30 + 28, y: h + (Math.random() < .5 ? gap * .2 : gap * .8), e, val, txt, got: false }); } }
        obs.forEach(p => p.x -= spd * dt); obs = obs.filter(p => p.x > -80); items.forEach(i => i.x -= spd * dt); items = items.filter(i => i.x > -40 && !i.got);
        for (const i of items) if (r.dist(80, y, i.x, i.y) < 26) { i.got = true; r.addScore(i.val); r.pop(`${i.txt} +${i.val}`, 80, y - 40, '#FDE047', 22); r.burst(i.x, i.y, '#FDE047', 12, 160); r.sfx('score'); }
        // הצייד (מרמה 2): עומד למטה ויורה עגבניות לכיוון הפרה. מתחמקים!
        if (level() >= 1) { hunterT -= dt; if (!hunter && hunterT <= 0) { hunter = { x: r.W + 30, tx: r.rnd(200, 300), shotsLeft: 1 + Math.min(2, level() - 1), cd: 1.2, life: 6 }; hunterT = r.rnd(6, 9); }
          if (hunter) { hunter.life -= dt; if (hunter.x > hunter.tx) hunter.x -= 150 * dt; else { hunter.cd -= dt; if (hunter.cd <= 0 && hunter.shotsLeft > 0) { hunter.shotsLeft--; hunter.cd = 1.3; const dx = 80 - hunter.x, dy = (y - 30) - (GY - 60), T = .9; shots.push({ x: hunter.x, y: GY - 60, vx: dx / T, vy: dy / T - 200 * T / 2, rot: 0 }); r.sfx('hit'); } } if (hunter.life <= 0 || (hunter.shotsLeft <= 0 && hunter.cd <= 0)) hunter.x -= 120 * dt; if (hunter.x < -40 || (hunter.shotsLeft <= 0 && hunter.cd <= 0 && hunter.x < -40)) hunter = null; if (hunter && hunter.shotsLeft <= 0 && hunter.cd <= 0) hunter.tx = -60; }
          shots.forEach(sh => { sh.vy += 200 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.rot += dt * 8; }); shots = shots.filter(sh => sh.y < r.H + 20 && sh.x > -20);
          for (const sh of shots) if (r.dist(sh.x, sh.y, 80, y) < 20) { r.burst(80, y, '#ef4444', 16, 200); return crash('עגבנייה בפרצוף! 🍅'); } }
        // החוואי: מגיע מימין, רץ שמאלה על הקרקע, וקופץ עם הרשת מתחת לפרה. אם הפרה נמוכה, הוא תופס אותה
        farmerT -= dt; if (!farmer && farmerT <= 0) { farmer = { x: r.W + 40, jump: 0, jumped: false }; warnT = 1.6; farmerT = r.rnd(7, 11); r.sfx('hit'); }
        if (farmer) { farmer.x -= (spd + 90) * dt; if (!farmer.jumped && farmer.x < 80 + 60) { farmer.jumped = true; farmer.jump = 0.001; } if (farmer.jump > 0) { farmer.jump += dt * 1.6; if (farmer.jump >= 1) farmer.jump = 0; }
          const fy = GY - (farmer.jump > 0 ? Math.sin(farmer.jump * Math.PI) * 150 : 0); if (farmer.jump > 0 && Math.abs(farmer.x - 80) < 30 && y > fy - 120) { r.burst(80, y, '#fff', 14, 180); return crash('הרבי תפס את הפרה! 🎩'); } if (farmer.x < -60) farmer = null; }
        for (const p of obs) { if (!p.passed && p.x + p.w / 2 < 80) { p.passed = true; passed++; const pts = 10 + level() * 5; r.addScore(pts); r.pop('+' + pts, 80, y - 36, '#fff'); r.sfx('score'); if (passed % 5 === 0) { levelT = 1.6; r.pop(`רמה ${level() + 1}! 🔥`, r.W / 2, 120, '#7c2d12', 26); } }
          if (80 + 18 > p.x && 80 - 18 < p.x + p.w && (y - 12 < p.h || y + 12 > p.h + gap)) { r.burst(80, y, '#fff', 12, 160); return crash(y - 12 < p.h ? 'נתקעת בתחתונים! 🩲' : 'נפלת לאסלה! 🚽'); } }
        if (y > r.H - 30) return crash('אופס, הפרה נחתה!'); if (y < -30) y = -30; },
      revive() { lives = 3; y = r.H / 2; vy = 0; started = false; obs = []; shots = []; hunter = null; farmer = null; },
      draw() { const g = r.ctx.createLinearGradient(0, 0, 0, r.H); g.addColorStop(0, '#7DD3FC'); g.addColorStop(1, '#e0f2fe'); r.ctx.fillStyle = g; r.ctx.fillRect(0, 0, r.W, r.H); SP.cloud(r, 60 - (tt * 30) % 420 + 200, 80, 1); SP.cloud(r, 300 - (tt * 20) % 420, 140, 0.7); r.rect(0, GY, r.W, 24, '#84CC16'); r.rect(0, GY, r.W, 5, '#65a30d');
        obs.forEach(p => { SP.underpants(r, p.x, 0, p.w, p.h); SP.toilet(r, p.x, p.h + gap, p.w, GY - p.h - gap); });
        items.forEach(i => { r.circle(i.x, i.y, 18, 'rgba(255,255,255,.55)'); r.emoji(i.e, i.x, i.y + Math.sin(tt * 5 + i.x) * 3, 26); });
        if (farmer) { const jy = farmer.jump > 0 ? Math.sin(farmer.jump * Math.PI) * 150 : 0; const fy = GY - jy; const pose = farmer.jump > 0 ? POSE.jumpUp : POSE.run[Math.floor(tt * 10) % POSE.run.length][0]; if (farmer.jump > 0) SP.groundShadow(r, farmer.x, GY, 18, jy); r.player(pose, farmer.x, fy, 0.5, KITS.rabbi, { hair: '#111' });
          // רבי: כובע שחור רחב, זקן, ורשת ביד המורמת
          const hy = fy - 66; r.rect(farmer.x - 16, hy - 8, 32, 4, '#111', 2); r.rect(farmer.x - 9, hy - 20, 18, 13, '#111', 3); r.ctx.fillStyle = '#4b5563'; r.ctx.beginPath(); r.ctx.moveTo(farmer.x - 6, hy + 3); r.ctx.quadraticCurveTo(farmer.x, hy + 16, farmer.x + 6, hy + 3); r.ctx.fill(); const nx = farmer.x + (farmer.jump > 0 ? 6 : 22), ny = fy - (farmer.jump > 0 ? 112 : 60); r.line(farmer.x + (farmer.jump > 0 ? 8 : 16), fy - (farmer.jump > 0 ? 88 : 46), nx, ny, '#78350f', 3); r.ctx.strokeStyle = '#1B1740'; r.ctx.lineWidth = 2; r.ctx.beginPath(); r.ctx.ellipse(nx, ny - 14, 16, 16, 0, 0, Math.PI * 2); r.ctx.stroke(); r.ctx.strokeStyle = 'rgba(27,23,64,.5)'; r.ctx.lineWidth = 1; for (let k = -1; k <= 1; k++) { r.line(nx - 14, ny - 14 + k * 7, nx + 14, ny - 14 + k * 7, 'rgba(27,23,64,.5)', 1); r.line(nx + k * 7, ny - 28, nx + k * 7, ny, 'rgba(27,23,64,.5)', 1); } }
        if (hunter) { const walking = hunter.x > hunter.tx || hunter.tx < 0; r.player(walking ? POSE.run[Math.floor(tt * 10) % POSE.run.length][0] : POSE.stand, hunter.x, GY, 0.5, KITS.red, { hair: '#111' }); r.rect(hunter.x - 13, GY - 66 - 8, 26, 4, '#166534', 2); r.rect(hunter.x - 8, GY - 66 - 18, 16, 11, '#166534', 3); if (!walking) r.emoji('🍅', hunter.x - 18, GY - 60, 18); }
        shots.forEach(sh => r.emoji('🍅', sh.x, sh.y, 22));
        if (levelT > 0) r.text(`רמה ${level() + 1}`, r.W / 2, 100, { size: 26, color: '#7c2d12' }); else r.text(`רמה ${level() + 1} · ${passed} · ${'❤️'.repeat(Math.max(0, lives))}`, r.W - 70, 40, { size: 13, color: '#0c4a6e' });
        if (warnT > 0) r.text('הרבי בא עם הרשת! תעופי גבוה! 🎩', r.W / 2, 60, { size: 20, color: '#7c2d12' });
        r.emoji('💨', 80 - 30, y + 8, 14); SP.cow(r, 80, y, vy < 0 ? 1 : 0, tt); if (!started) r.text('נוגעים כדי לעוף!', r.W / 2, r.H / 2 - 80, { size: 22, color: '#0c4a6e' }); },
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

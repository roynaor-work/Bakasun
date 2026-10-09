// משחקי ארקייד קלאסיים
import { POSE, S as SP, KITS } from './sprites.js?v=20261009-companion-1';
import { renderStill, SCENE_IDS, STILL_T } from './celebrate.js?v=20261009-companion-1';
const G = [];

// ---- טטריס ----
G.push({ id: 'tetris', name: 'טטריס', emoji: '🧱', assets: ['puzzle/tileBlue_01', 'puzzle/tileYellow_01', 'puzzle/tilePink_01', 'puzzle/tileOrange_01', 'puzzle/tileGreen_01', 'puzzle/tileRed_01', 'puzzle/tileGrey_01'], how: 'מחליקים ימינה ושמאלה כדי להזיז, נוגעים כדי לסובב, מחליקים למטה כדי להפיל.',
  make(r) {
    const COLS = 10, ROWS = 18, S = 27, OX = 45, OY = 62, LINES_PER_PIC = 4; // למעלה רק החתיכה הבאה והתקדמות התמונה
    const SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]]];
    const COLORS = [r.C.sky, r.C.gold, r.C.accent, r.C.hot, r.C.teal, r.C.ok, r.C.pink]; const TILES = ['puzzle/tileBlue_01', 'puzzle/tileYellow_01', 'puzzle/tilePink_01', 'puzzle/tileOrange_01', 'puzzle/tileGreen_01', 'puzzle/tileRed_01', 'puzzle/tileGrey_01'];
    const cell = (x, y, ci, size = S, alpha = 1) => { if (!r.img(TILES[ci - 1], x + size / 2, y + size / 2, size - 1, size - 1, { alpha })) { r.rect(x + 1, y + 1, size - 2, size - 2, COLORS[ci - 1], 4); r.rect(x + 4, y + 4, size - 8, 5, '#ffffff33', 2); } };
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
        r.rect(OX, 6, 96, 50, '#2A2555', 8); r.text('הבא', OX + 16, 18, { size: 11, color: r.C.muted }); const ns = SHAPES[next], nw = ns[0].length * 12, nh = ns.length * 12; ns.forEach((row, j) => row.forEach((v, i) => { if (v) cell(OX + 58 - nw / 2 + i * 12, 31 - nh / 2 + j * 12, next + 1, 12); }));
        r.text(`שורות: ${lines}`, OX + BW - 40, 18, { size: 12, color: r.C.muted }); r.rect(OX + BW - 130, 30, 130, 10, '#2A2555', 5); r.rect(OX + BW - 130, 30, 130 * picLines / LINES_PER_PIC, 10, r.C.gold, 5); r.text(`עוד ${LINES_PER_PIC - picLines} שורות לתמונה${picDone ? ` · ${picDone} ✓` : ''}`, OX + BW - 65, 50, { size: 11, color: r.C.muted });
        // רוח: איפה החתיכה תנחת
        let gy = cur.y; while (!collides(cur.s, cur.x, gy + 1)) gy++; cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && gy + j >= 0) r.rect(OX + (cur.x + i) * S + 3, OY + (gy + j) * S + 3, S - 6, S - 6, COLORS[cur.c - 1] + '33', 3); }));
        grid.forEach((row, j) => row.forEach((v, i) => { if (v) cell(OX + i * S, OY + j * S, v); }));
        cur.s.forEach((row, j) => row.forEach((v, i) => { if (v && cur.y + j >= 0) cell(OX + (cur.x + i) * S, OY + (cur.y + j) * S, cur.c); })); },
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
G.push({ id: 'breakout', name: 'שובר לבנים', emoji: '🧊', assets: ['puzzle/tilePink_02', 'puzzle/tileOrange_02', 'puzzle/tileYellow_02', 'puzzle/tileGreen_02', 'puzzle/tileBlue_02', 'puzzle/tileRed_02', 'puzzle/tileGrey_02', 'puzzle/ballGrey_01', 'puzzle/ballYellow_01'], how: 'יש 3 כדורים, והרמה נשמרת לפעם הבאה. מזיזים את המחבט עם האצבע ומפילים את כל הלבנים. מהלבנים נופלים דברים מצחיקים: 🍔 המבורגר = כוח כפול, 🎾 מכפיל כדורים, 🥅 רשת ביטחון, 🍕 פיצה מרחיבה, 🐌 חילזון מאט, ✖️2 ניקוד כפול, 💰 מטבע. רעים: 🩳 תחתונים מקטינים, 💩 קקי, 🌶️ צ׳ילי מהיר, ⚡ חשמל שהופך את הכיוונים!',
  make(r, progress) {
    let px = r.W / 2, PW = 80, balls = [], bricks = [], level = Math.max(1, (progress && progress.level) || 1), drops = [], fx = { wide: 0, fire: 0, x2: 0, small: 0, poop: 0, fast: 0, slow: 0, zap: 0, net: 0 }, tt = 0, lives = 3;
    const newBall = (x = r.W / 2, y = r.H - 80, vx = 160) => ({ x, y, vx, vy: -260 });
    const build = () => { bricks = []; for (let j = 0; j < 4 + level; j++) for (let i = 0; i < 8; i++) bricks.push({ x: 8 + i * 43, y: 60 + j * 22, c: [r.C.pink, r.C.hot, r.C.gold, r.C.ok, r.C.sky, r.C.accent, r.C.teal][j % 7], tile: ['puzzle/tilePink_02', 'puzzle/tileOrange_02', 'puzzle/tileYellow_02', 'puzzle/tileGreen_02', 'puzzle/tileBlue_02', 'puzzle/tileRed_02', 'puzzle/tileGrey_02'][j % 7], hp: level >= 3 && j < 2 ? 2 : 1 }); };
    build(); balls = [newBall()];
    // מה נופל: 22% מהלבנים מפילות משהו. טוב: 70%, רע: 30%
    const DROPS = [['fire', '🍔', 'המבורגר! כוח כפול 💪', true], ['multi', '🎾', 'מכפיל כדורים!', true], ['net', '🥅', 'רשת ביטחון!', true], ['wide', '🍕', 'פיצה מרחיבה!', true], ['slow', '🐌', 'חילזון! הכדור איטי', true], ['x2', '✖️2', 'ניקוד כפול!', true], ['coin', '💰', '+50', true], ['small', '🩳', 'תחתונים מקטינים...', false], ['poop', '💩', 'קקי! לא רואים...', false], ['fast', '🌶️', 'צ׳ילי! הכדור בוער', false], ['zap', '⚡', 'חשמל! הכיוונים הפוכים', false]];
    const dropFrom = b => { if (Math.random() > .22) return; const good = Math.random() < .7; const opts = DROPS.filter(d => d[3] === good); const [kind, e, txt] = r.pick(opts); drops.push({ x: b.x + 20, y: b.y + 9, kind, e, txt, good, vy: 90 + level * 8, ph: Math.random() * 6 }); };
    const paddleW = () => fx.wide > 0 ? 130 : fx.small > 0 ? 50 : PW;
    /* המחבט = מחבת פיצה עם ידית (רועי, 29/09). הכדור קופץ מהפיצה שעל המחבת; הידית קישוט בלבד */
    const drawPan = (c, x, y, w, f) => { const hw = w / 2; c.save(); c.translate(x, y);
      if (f.zap > 0) { c.shadowColor = '#facc15'; c.shadowBlur = 18; }
      c.fillStyle = '#1f2937'; c.beginPath(); c.moveTo(hw - 4, -2); c.lineTo(hw + 30, -9); c.lineTo(hw + 32, -3); c.lineTo(hw - 2, 5); c.closePath(); c.fill(); c.fillStyle = '#111827'; c.beginPath(); c.arc(hw + 26, -6, 2.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = f.small > 0 ? '#7f1d1d' : '#374151'; c.beginPath(); c.roundRect(-hw, -4, w, 11, 4); c.fill(); c.fillStyle = '#1f2937'; c.fillRect(-hw + 2, 3, w - 4, 3); c.fillStyle = '#6b7280'; c.fillRect(-hw + 3, -3, w - 6, 2);
      c.shadowBlur = 0; const pw = hw - 5;
      c.fillStyle = '#b45309'; c.beginPath(); c.ellipse(0, -6, pw, 6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fcd34d'; c.beginPath(); c.ellipse(0, -7, pw - 4, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fbbf24'; c.beginPath(); c.ellipse(0, -7.5, pw - 8, 2.5, 0, 0, Math.PI * 2); c.fill();
      const n = Math.max(2, Math.round(w / 26)); for (let i = 0; i < n; i++) { const dx = -pw + 8 + (i + .5) * ((pw - 8) * 2 / n); c.fillStyle = '#b91c1c'; c.beginPath(); c.ellipse(dx, -7.5, 4, 2.2, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#16a34a'; c.beginPath(); c.arc(dx + 5, -8.5, 1.3, 0, Math.PI * 2); c.fill(); }
      if (f.fire > 0) for (let i = 0; i < 3; i++) { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; c.beginPath(); const sx = -pw / 2 + i * pw / 2, ph = tt * 3 + i; c.moveTo(sx, -12); c.quadraticCurveTo(sx + 4 * Math.sin(ph), -20, sx, -28); c.stroke(); }
      c.restore(); };
    return {
      move(x) { const target = fx.zap > 0 ? r.W - x : x; px = r.clamp(target, paddleW() / 2, r.W - paddleW() / 2); }, down(x) { this.move(x); }, /* חשמל: הכיוונים הפוכים */
      save() { return { level }; }, revive() { lives = 3; balls = [newBall()]; drops = []; },
      peek() { return { px, balls, drops, paddleW: paddleW(), zap: fx.zap > 0 }; },
      update(dt) { tt += dt; for (const k in fx) fx[k] = Math.max(0, fx[k] - dt); const spd = fx.fast > 0 ? 1.45 : fx.slow > 0 ? .65 : 1; const W2 = paddleW();
        // הכדורים
        for (const ball of balls) { ball.x += ball.vx * dt * spd; ball.y += ball.vy * dt * spd;
          if (ball.x < 8) { ball.x = 8; ball.vx = Math.abs(ball.vx); } if (ball.x > r.W - 8) { ball.x = r.W - 8; ball.vx = -Math.abs(ball.vx); } if (ball.y < 8) { ball.y = 8; ball.vy = Math.abs(ball.vy); }
          if (ball.vy > 0 && ball.y > r.H - 40 && ball.y < r.H - 24 && Math.abs(ball.x - px) < W2 / 2 + 8) { ball.vy = -Math.abs(ball.vy) * 1.02; ball.vx = (ball.x - px) * (W2 > 100 ? 4 : 6); r.sfx('bounce'); }
          for (let i = bricks.length - 1; i >= 0; i--) { const b = bricks[i]; if (r.hit(ball.x - 8, ball.y - 8, 16, 16, b.x, b.y, 40, 18)) { b.hp--; if (b.hp <= 0 || fx.fire > 0) { r.burst(b.x + 20, b.y + 9, b.c, 8, 140); r.sparkle(b.x + 20, b.y + 9, 16, 3); bricks.splice(i, 1); dropFrom(b); const pts = 10 * level * (fx.x2 > 0 ? 2 : 1); r.addScore(pts); if (fx.x2 > 0 || level > 1) r.pop('+' + pts, b.x + 20, b.y - 6, '#fff', 14); } else { r.sfx('hit'); } if (fx.fire <= 0) ball.vy *= -1; r.sfx('tick'); break; } } }
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
      draw() { r.clear(); bricks.forEach(b => { if (!r.img(b.hp > 1 ? 'puzzle/tileGrey_02' : b.tile, b.x + 20, b.y + 9, 41, 19)) { r.rect(b.x, b.y, 40, 18, b.c, 4); r.rect(b.x + 3, b.y + 3, 34, 4, '#ffffff44', 2); } if (b.hp > 1) r.rect(b.x + 14, b.y + 7, 12, 4, '#ffffff99', 2); });
        drops.forEach(d => { r.circle(d.x, d.y, 14, d.good ? 'rgba(134,239,172,.25)' : 'rgba(248,113,113,.25)'); r.emoji(d.e, d.x, d.y, d.kind === 'x2' ? 14 : 20); });
        if (fx.net > 0) { r.ctx.strokeStyle = 'rgba(34,197,94,.8)'; r.ctx.lineWidth = 2; for (let i = 0; i < r.W; i += 14) r.line(i, r.H - 14, i + 7, r.H - 6, 'rgba(34,197,94,.8)', 2); r.line(0, r.H - 14, r.W, r.H - 14, r.C.ok, 3); }
        const W2 = paddleW(); const jit = fx.zap > 0 ? (Math.random() - .5) * 6 : 0; drawPan(r.ctx, px + jit, r.H - 26, W2, fx); if (fx.zap > 0) r.emoji('⚡', px + W2 / 2 + 40, r.H - 40, 18);
        balls.forEach(ball => { if (fx.fire > 0) { r.circle(ball.x, ball.y, 12, 'rgba(249,115,22,.35)'); r.emoji('🍔', ball.x, ball.y, 18); } else if (fx.fast > 0) { r.circle(ball.x, ball.y, 11, 'rgba(239,68,68,.35)'); r.circle(ball.x, ball.y, 8, '#ef4444'); } else if (!r.img('puzzle/ballYellow_01', ball.x, ball.y, 18, 18, { rot: tt * 4 })) { r.circle(ball.x, ball.y, 8, r.C.gold); r.circle(ball.x - 2, ball.y - 3, 2.5, '#fff8'); } });
        // מצב הבונוסים למעלה
        const act = [fx.wide > 0 && '🍕', fx.fire > 0 && '🍔', fx.x2 > 0 && '✖️2', fx.net > 0 && '🥅', fx.slow > 0 && '🐌', fx.small > 0 && '🩳', fx.fast > 0 && '🌶️', fx.zap > 0 && '⚡'].filter(Boolean).join(' '); r.text(`רמה ${level} · ${'⚪'.repeat(Math.max(0, lives))}${act ? ' · ' + act : ''}`, r.W / 2, 30, { size: 14, color: r.C.muted });
        // קקי על המסך: כתמים חומים שמסתירים חלק מהמסך
        if (fx.poop > 0) { const a = Math.min(1, fx.poop) * .85; for (let i = 0; i < 7; i++) r.circle(40 + (i * 53) % (r.W - 60), 120 + (i * 97) % (r.H - 220), 45 + (i % 3) * 15, `rgba(124,74,30,${a})`); r.emoji('💩', r.W / 2, r.H / 2, 60); } },
    };
  } });

// ---- הוקי שולחן: משחק עד 3 (ניצחת = רמה הבאה, היריב ניצח = נפסלת), נגד המחשב או שני שחקנים באותו טלפון (אצבע למעלה ואצבע למטה), מגע חלק עם מהירות אמיתית של המחבט ----
G.push({ id: 'pong', name: 'הוקי שולחן', emoji: '🏒', how: 'משחק עד 3 שערים. המחבט שלך בחצי התחתון וזז עם האצבע לכל כיוון. חבטה מהירה ובזווית מעיפה את הדיסקית. אפשר גם שני שחקנים באותו טלפון: אחד למעלה ואחד למטה, או מול טלפון אחר מחדר המשחקים! הרמה נשמרת.',
  make(r, progress) {
    const GW = 150, MR = 26, PR = 11, TO = 3; let me = { x: r.W / 2, y: r.H - 90, vx: 0, vy: 0 }, ai = { x: r.W / 2, y: 90, vx: 0, vy: 0 }, level = Math.max(1, (progress && progress.level) || 1), mood = 0, moodT = 0, tt = 0, myPts = 0, hisPts = 0, trail = [], hitT = 0, mode = null, msgT = 0, msg = '', kicked = false, idleT = 0;
    let puck = reset(true);
    /* מול טלפון אחר (r.net): המארח מחשב ומשדר, האורח שולח אצבע ומצייר במראה (הוא תמיד למטה אצל עצמו) */
    const net = r.net || null, isHost = !net || net.role === 'host'; let netT = 0, gotState = false, lostT = 0, sendT = 0, guestScore = 0, ended = false;
    if (net) { mode = 'net'; msg = isHost ? 'מול טלפון אחר! אתה למטה' : 'מול טלפון אחר! אתה למטה'; msgT = 2; }
    const mirror = (x, y) => [r.W - x, r.H - y];
    function reset() { kicked = false; idleT = 0; return { x: r.W / 2, y: r.H / 2, vx: 0, vy: 0 }; } /* הדיסקית באמצע, בלי לזוז; הראשון שנוגע בועט (רועי 29/09) */
    const face = (x, y) => { const c = r.ctx; r.circle(x, y, 20, '#FBBF24'); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 20, 0, Math.PI * 2); c.stroke(); const angry = moodT > 0 && mood < 0, happy = moodT > 0 && mood > 0; r.circle(x - 7, y - 4, 3, '#1B1740'); r.circle(x + 7, y - 4, 3, '#1B1740'); c.beginPath(); if (angry) { c.moveTo(x - 12, y - 13); c.lineTo(x - 3, y - 9); c.moveTo(x + 12, y - 13); c.lineTo(x + 3, y - 9); } else { c.moveTo(x - 11, y - 11); c.lineTo(x - 3, y - 10); c.moveTo(x + 11, y - 11); c.lineTo(x + 3, y - 10); } c.stroke(); c.beginPath(); if (angry) c.arc(x, y + 12, 7, Math.PI + .3, -.3); else if (happy) c.arc(x, y + 3, 9, .2, Math.PI - .2); else { c.moveTo(x - 6, y + 7); c.lineTo(x + 6, y + 7); } c.stroke(); if (angry) r.emoji('💢', x + 24, y - 18, 16); };
    // התנגשות מחבט-דיסקית עם מהירות אמיתית של המחבט (כמו הוקי אוויר): הדיסקית מקבלת את רכיב המהירות של המחבט
    const collide = (m, isMe) => { const d = r.dist(puck.x, puck.y, m.x, m.y); if (d < MR + PR && d > 0) { const nx = (puck.x - m.x) / d, ny = (puck.y - m.y) / d; const rel = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny; if (rel < 0) { puck.vx -= 1.9 * rel * nx; puck.vy -= 1.9 * rel * ny; } puck.x = m.x + nx * (MR + PR + .5); puck.y = m.y + ny * (MR + PR + .5); unpin(m); kicked = true; let sp = Math.hypot(puck.vx, puck.vy); if (sp > 1000) { puck.vx *= 1000 / sp; puck.vy *= 1000 / sp; sp = 1000; } if (sp < 140) { puck.vx = nx * 140; puck.vy = ny * 140; sp = 140; } r.sfx(sp > 650 ? 'hit' : 'bounce'); if (sp > 650) { hitT = .4; if (isMe) r.pop('חבטה! 💥', puck.x, puck.y - 30, r.C.gold, 22); } return true; } return false; };
    /* הדיסקית נלחצה בין המחבט לקיר (רועי, 29/09: "הכדור נתקע מאחורה"): מחזירים לתוך המגרש ומגלגלים אותה לאורך הקיר, הצידה מהמחבט */
    const unpin = m => { let wallX = puck.x < PR ? PR : puck.x > r.W - PR ? r.W - PR : null, wallY = puck.y < PR ? PR : puck.y > r.H - PR ? r.H - PR : null; if (wallX == null && wallY == null) return;
      if (wallX != null) puck.x = wallX; if (wallY != null) puck.y = wallY; if (r.dist(puck.x, puck.y, m.x, m.y) >= MR + PR) return;
      if (wallX != null) { const sy = Math.sign(puck.y - m.y) || (m.y < r.H / 2 ? 1 : -1); puck.y = m.y + sy * (MR + PR + 2); puck.vy = sy * 220; puck.vx = (wallX === PR ? 1 : -1) * 60; }
      else { const sx = Math.sign(puck.x - m.x) || (m.x < r.W / 2 ? 1 : -1); puck.x = m.x + sx * (MR + PR + 2); puck.vx = sx * 220; puck.vy = (wallY === PR ? 1 : -1) * 60; } };
    let stillT = 0; /* דיסקית שעומדת במקום יותר מ-2 שניות: השופט מוריד אותה באמצע */
    // מחבט עוקב אחרי אצבע: תנועה חלקה (לא קפיצה), והמהירות נמדדת מהתנועה האמיתית
    const follow = (m, tx, ty, dt, top) => { const nx = r.clamp(tx, MR, r.W - MR), ny = top ? r.clamp(ty, MR, r.H / 2 - MR) : r.clamp(ty, r.H / 2 + MR, r.H - MR); const k = Math.min(1, dt * 22); const ox = m.x, oy = m.y; m.x += (nx - m.x) * k; m.y += (ny - m.y) * k; const ivx = (m.x - ox) / Math.max(dt, 1e-3), ivy = (m.y - oy) / Math.max(dt, 1e-3); m.vx = m.vx * .5 + ivx * .5; m.vy = m.vy * .5 + ivy * .5; };
    let target = { x: me.x, y: me.y }, target2 = { x: ai.x, y: ai.y };
    if (net) r.netMsg = (t, p) => {
      if (isHost) { if (t === 'in') { const [mx, my] = mirror(p.x, p.y); target2 = { x: mx, y: my }; } if (t === 'bye') { lostT = 99; } return; }
      if (t === 'st') { gotState = true; kicked = true; const [px, py] = mirror(p.p[0], p.p[1]); puck.x = px; puck.y = py; puck.vx = -p.p[2]; puck.vy = -p.p[3]; const [ax, ay] = mirror(p.h[0], p.h[1]); ai.x = ax; ai.y = ay;
        if (p.s[1] > myPts) { r.pop('שער! 🎉', r.W / 2, 90, r.C.gold, 28); r.burst(r.W / 2, 10, r.C.pink, 16); r.sfx('goal'); trail = []; } if (p.s[0] > hisPts) { r.pop(`שער נגדך ${p.s[0]}:${p.s[1]}`, r.W / 2, r.H - 120, '#ef4444', 22); r.sfx('ohh'); trail = []; }
        myPts = p.s[1]; hisPts = p.s[0]; if (p.sc[1] !== guestScore) { guestScore = p.sc[1]; r.setScore(guestScore); } if (p.hit) hitT = .3; }
      if (t === 'end') { if (p.w === 'guest') { const won = `ניצחת ${myPts}:${hisPts}!`; myPts = 0; hisPts = 0; r.win(won, 0); } else r.over(`היריב ניצח ${hisPts}:${myPts}`); }
      if (t === 'bye') lostT = 99; };
    const netTick = dt => { /* מארח: משדר מצב 15 פעמים בשנייה; אורח: שולח אצבע 15 פעמים בשנייה */
      sendT -= dt; if (sendT > 0) return; sendT = 1 / 15;
      if (isHost) net.send('st', { p: [Math.round(puck.x), Math.round(puck.y), Math.round(puck.vx), Math.round(puck.vy)], h: [Math.round(me.x), Math.round(me.y)], s: [myPts, hisPts], sc: [r.score, guestScore], hit: hitT > 0 ? 1 : 0 });
      else net.send('in', { x: Math.round(me.x), y: Math.round(me.y) }); };
    return {
      save() { return net ? null : { level }; }, revive() { hisPts = 0; myPts = 0; puck = reset(true); trail = []; },
      peek() { return { mode, puck, me, ai, myPts, hisPts }; },
      down(x, y) { if (mode == null) { mode = y < r.H / 2 ? '2p' : 'ai'; msg = mode === '2p' ? 'שני שחקנים! למעלה ולמטה' : 'נגד המחשב!'; msgT = 1.5; return; } if (y >= r.H / 2) target = { x, y }; else if (mode === '2p') target2 = { x, y }; },
      move(x, y) { if (mode == null) return; if (y >= r.H / 2 && !Object.values(r.pointers).some(p => p.y < r.H / 2 && Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1)) target = { x, y }; },
      update(dt) { tt += dt; moodT -= dt; hitT -= dt; msgT -= dt; if (mode == null) return;
        if (net) { netT += dt; if (netT > 3 && !net.alive(4000)) lostT += dt; else lostT = 0; if (lostT > 10) return r.over('החיבור לטלפון השני נפל'); netTick(dt);
          if (!isHost) { /* אורח: המחבט שלי עוקב אחרי האצבע, הדיסקית ממשיכה לפי המהירות האחרונה עד העדכון הבא */
            const ps = Object.values(r.pointers); for (const p of ps) if (p.y >= r.H / 2) target = { x: p.x, y: p.y }; follow(me, target.x, target.y, dt, false);
            if (gotState) { puck.x += puck.vx * dt; puck.y += puck.vy * dt; trail.push([puck.x, puck.y]); if (trail.length > 10) trail.shift(); } return; } }
        // כל האצבעות: למטה שלי, למעלה של השחקן השני
        const ps = Object.values(r.pointers); for (const p of ps) { if (p.y >= r.H / 2) target = { x: p.x, y: p.y }; else if (mode === '2p') target2 = { x: p.x, y: p.y }; }
        follow(me, target.x, target.y, dt, false);
        if (mode === '2p' || mode === 'net') follow(ai, target2.x, target2.y, dt, true);
        else { const aiSp = 150 + level * 40; let tx, ty; if (!kicked && idleT > 2.5) { tx = puck.x; ty = Math.max(MR, puck.y - 30); } else if (puck.y < r.H / 2) { const behind = puck.y < ai.y + 6 && Math.abs(puck.x - ai.x) < MR + PR + 30; if (behind) { const side = puck.x < r.W / 2 ? 1 : -1; tx = puck.x + side * (MR + PR + 8); ty = Math.max(MR, puck.y - 6); } else { tx = puck.x; ty = Math.max(MR + 20, puck.y - 10); } } else { tx = r.W / 2; ty = 70; } const dx = tx - ai.x, dy = ty - ai.y, dl = Math.hypot(dx, dy) || 1; const step = Math.min(dl, aiSp * dt); ai.vx = dx / dl * step / dt; ai.vy = dy / dl * step / dt; ai.x = r.clamp(ai.x + dx / dl * step, MR, r.W - MR); ai.y = r.clamp(ai.y + dy / dl * step, MR, r.H / 2 - MR); }
        // הדיסקית: 3 תת-צעדים כדי שחבטה מהירה לא תעבור דרכה
        for (let k = 0; k < 3; k++) { const sdt = dt / 3; puck.vx *= (1 - .18 * sdt); puck.vy *= (1 - .18 * sdt); puck.x += puck.vx * sdt; puck.y += puck.vy * sdt;
          if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx) * .92; r.sfx('tick'); } if (puck.x > r.W - PR) { puck.x = r.W - PR; puck.vx = -Math.abs(puck.vx) * .92; r.sfx('tick'); }
          const inGoalX = Math.abs(puck.x - r.W / 2) < GW / 2; if (puck.y < PR && !inGoalX) { puck.y = PR; puck.vy = Math.abs(puck.vy) * .92; r.sfx('tick'); } if (puck.y > r.H - PR && !inGoalX) { puck.y = r.H - PR; puck.vy = -Math.abs(puck.vy) * .92; r.sfx('tick'); }
          collide(me, true); collide(ai, false); }
        trail.push([puck.x, puck.y]); if (trail.length > 10) trail.shift();
        if (!kicked) idleT += dt; if (kicked && Math.hypot(puck.vx, puck.vy) < 25 && puck.y > -PR && puck.y < r.H + PR) stillT += dt; else stillT = 0; if (stillT > 2) { stillT = 0; puck = reset(puck.y > r.H / 2); trail = []; r.pop('הדיסקית נתקעה. מהאמצע! 🏒', r.W / 2, r.H / 2 - 60, '#1B1740', 18); r.sfx('tick'); }
        if (puck.y < -PR) { myPts++; const sp = Math.hypot(puck.vx, puck.vy); const pts = (10 + Math.floor(sp / 80)) * level; r.addScore(pts); r.sparkle(r.W / 2, 20, 40, 10); r.pop(`שער! +${pts}`, r.W / 2, 90, r.C.gold, 28); r.burst(r.W / 2, 10, r.C.pink, 16); r.sfx('goal'); mood = -1; moodT = 1.5; puck = reset(false); trail = [];
          if (myPts >= TO) { if (mode === 'net') { net.send('st', { p: [puck.x, puck.y, 0, 0], h: [me.x, me.y], s: [myPts, hisPts], sc: [r.score, guestScore], hit: 0 }); net.send('end', { w: 'host' }); const won = `ניצחת ${myPts}:${hisPts}!`; myPts = 0; hisPts = 0; puck = reset(true); r.win(won, 0); return; } level++; r.addScore(50 * level); const won = `ניצחת ${myPts}:${hisPts}! ${mode === '2p' ? 'למטה ניצח' : `רמה ${level}`}`; myPts = 0; hisPts = 0; puck = reset(true); r.win(won, 0); return; } }
        if (puck.y > r.H + PR) { hisPts++; mood = 1; moodT = 1.5; if (mode !== 'ai') r.sfx('goal'); /* בלי צליל בהחטאה נגד המחשב (רועי) */ if (mode === 'net') guestScore += 10 + Math.floor(Math.hypot(puck.vx, puck.vy) / 80); puck = reset(true); trail = []; if (hisPts >= TO) { if (mode === '2p') { const won = `למעלה ניצח ${hisPts}:${myPts}!`; myPts = 0; hisPts = 0; r.win(won, 0); return; } if (mode === 'net') { net.send('end', { w: 'guest' }); net.send('st', { p: [0, 0, 0, 0], h: [me.x, me.y], s: [myPts, hisPts], sc: [r.score, guestScore], hit: 0 }); } return r.over(`היריב ניצח ${hisPts}:${myPts}`); } r.pop(`שער נגדך ${hisPts}:${myPts}`, r.W / 2, r.H - 120, '#ef4444', 22); } },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#e0f2fe'); bg.addColorStop(1, '#bae6fd'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H);
        r.line(0, r.H / 2, r.W, r.H / 2, '#ef444488', 3); c.strokeStyle = '#ef444488'; c.lineWidth = 3; c.beginPath(); c.arc(r.W / 2, r.H / 2, 46, 0, Math.PI * 2); c.stroke();
        r.rect(r.W / 2 - GW / 2, 0, GW, 8, '#1B1740', 3); r.rect(r.W / 2 - GW / 2, r.H - 8, GW, 8, '#1B1740', 3); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(r.W / 2, 4, GW / 2, 0, Math.PI); c.stroke(); c.beginPath(); c.arc(r.W / 2, r.H - 4, GW / 2, Math.PI, 0); c.stroke();
        if (mode == null) { r.rect(20, 30, r.W - 40, r.H / 2 - 60, 'rgba(255,255,255,.7)', 20); r.text('👆👆 שני שחקנים', r.W / 2, r.H / 4 - 20, { size: 26, color: '#1B1740' }); r.text('נוגעים כאן: אחד למעלה, אחד למטה', r.W / 2, r.H / 4 + 20, { size: 15, color: '#475569' }); r.rect(20, r.H / 2 + 30, r.W - 40, r.H / 2 - 60, 'rgba(255,255,255,.7)', 20); r.text('🤖 נגד המחשב', r.W / 2, r.H * 3 / 4 - 20, { size: 26, color: '#1B1740' }); r.text('נוגעים כאן. משחק עד 3', r.W / 2, r.H * 3 / 4 + 20, { size: 15, color: '#475569' }); return; }
        r.text(`${myPts} : ${hisPts}`, r.W / 2, r.H / 2 - 20, { size: 26, color: '#1B174066' }); r.text(mode === '2p' ? 'עד 3' : mode === 'net' ? 'מול טלפון אחר · עד 3' : `רמה ${level} · עד 3`, r.W / 2, r.H / 2 + 20, { size: 13, color: '#1B174066' });
        if (net && !isHost && !gotState) r.text('מחכים למארח… ⏳', r.W / 2, r.H / 2 - 60, { size: 20, color: '#1B1740' }); if (net && lostT > 2) r.text(`החיבור לטלפון השני נעלם… ${Math.ceil(10 - lostT)}`, r.W / 2, r.H / 2 + 60, { size: 16, color: '#ef4444' });
        trail.forEach(([x, y], i) => r.circle(x, y, PR * (i + 1) / trail.length, `rgba(27,23,64,${(i + 1) / trail.length * .25})`));
        const mallet = (m, col, faceIt) => { r.circle(m.x, m.y + 3, MR, 'rgba(0,0,0,.2)'); r.circle(m.x, m.y, MR, col); r.circle(m.x, m.y, MR - 6, 'rgba(255,255,255,.35)'); r.circle(m.x, m.y, 9, col); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(m.x, m.y, MR, 0, Math.PI * 2); c.stroke(); if (faceIt) face(m.x, m.y - MR - 22); };
        mallet(ai, moodT > 0 && mood < 0 ? '#ef4444' : r.C.pink, mode === 'ai'); mallet(me, hitT > 0 ? r.C.gold : r.C.sky, false);
        const pg = c.createRadialGradient(puck.x - 3, puck.y - 3, 1, puck.x, puck.y, PR); pg.addColorStop(0, '#4b5563'); pg.addColorStop(1, '#111827'); c.fillStyle = pg; c.beginPath(); c.arc(puck.x, puck.y, PR, 0, Math.PI * 2); c.fill();
        if (msgT > 0) r.text(msg, r.W / 2, r.H / 2 - 60, { size: 22, color: '#1B1740' }); },
    };
  } });

// ---- פינבול: שולחן עשיר כמו מכונה אמיתית: 3 כדורים, פליפרים סימטריים פיזיים, סלינגשוטים (משולשים שבועטים) מעל הפליפרים, במפרים, מטרות נופלות,
// ספינר שמסתובב ונותן נקודות, מנהרה (חור שמאלי עליון שמעביר את הכדור למסלול הימני עם בונוס), רמפת חוט (גשר) שהכדור עולה עליה מימין ורוכב עליה עד שמאל, רמפה עם מכפיל ----
G.push({ id: 'pinball', name: 'פינבול', emoji: '🎯', how: '3 כדורים. מושכים את הכדור למטה במסלול הימני ומשחררים: חזק = רחוק. נוגעים בצד שמאל או ימין כדי להרים את הפליפר. במפרים וסלינגשוטים = נקודות, כל המטרות הצהובות = בונוס, הספינר מסתובב ונותן נקודות, שתי מנהרות בצדדים (נכנסים מלמטה) = +150: שמאל יוצאת על הגשר, ימין יוצאת מלמעלה. הגשר (הרמפה מימין) = +200 ומכפיל ×2.',
  make(r) {
    const PR = 9, LANE = 34, TW = r.W - LANE; const shadeHex = (hex, d) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, v + d)).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); };
    let ball = null, fl = { l: 0, r: 0, la: 0, ra: 0 }, balls = 3, mult = 1, multT = 0, tt = 0, hits = 0, launched = false, spin = 0, spinV = 0, tunnel = 0, rail = null, pull = 0, pulling = false, pullY0 = 0; /* pull: כמה משכו את הבוכנה (0-1). רועי 29/09: הכדור לא יוצא לבד, מושכים ומשחררים, העוצמה קובעת לאן יגיע */
    const bumpers = [{ x: 96, y: 190, r: 20, c: r.C.pink }, { x: 214, y: 178, r: 20, c: r.C.hot }, { x: 158, y: 262, r: 24, c: r.C.gold }];
    const targets = [88, 128, 168, 208].map(x => ({ x, y: 96, up: true })); const flash = {};
    const FY = r.H - 78, FLEN = 88, PIV_L = { x: 60, y: FY }, PIV_R = { x: TW - 60, y: FY }, REST = .42, UP = -.45; /* הפתח בין הפליפרים כ-2.5 כדורים (רועי: היה גדול מדי) */
    const flipperEnd = side => { const a = side === 'l' ? fl.la : fl.ra; const piv = side === 'l' ? PIV_L : PIV_R; const dir = side === 'l' ? 1 : -1; return { x1: piv.x, y1: piv.y, x2: piv.x + dir * Math.cos(a) * FLEN, y2: piv.y + Math.sin(a) * FLEN }; };
    const segHit = (seg, rad) => { const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1, l2 = dx * dx + dy * dy || 1; let t = ((ball.x - seg.x1) * dx + (ball.y - seg.y1) * dy) / l2; t = Math.max(0, Math.min(1, t)); const cx = seg.x1 + dx * t, cy = seg.y1 + dy * t; const d = Math.hypot(ball.x - cx, ball.y - cy); if (d < PR + rad) return { nx: (ball.x - cx) / (d || 1), ny: (ball.y - cy) / (d || 1), depth: PR + rad - d, t }; return null; };
    const bounceSeg = (seg, rad, restitution = .75, kick = 0) => { const h = segHit(seg, rad); if (!h) return false; ball.x += h.nx * h.depth; ball.y += h.ny * h.depth; const vn = ball.vx * h.nx + ball.vy * h.ny; if (vn < 0) { ball.vx -= (1 + restitution) * vn * h.nx; ball.vy -= (1 + restitution) * vn * h.ny; } ball.vx += h.nx * kick; ball.vy += h.ny * kick; return true; };
    // קירות: שיפועים לפליפרים, פינות עגולות, ומסלולי צד
    const walls = [{ x1: 0, y1: FY - 116, x2: PIV_L.x, y2: FY }, { x1: TW, y1: FY - 116, x2: PIV_R.x, y2: FY }, { x1: 0, y1: 44, x2: 44, y2: 6 }, { x1: TW, y1: 44, x2: TW - 44, y2: 6 }];
    // סלינגשוטים: משולשים משני הצדדים שבועטים את הכדור פנימה
    const slings = [{ pts: [[34, FY - 170], [40, FY - 112], [82, FY - 124]], c: r.C.lime }, { pts: [[TW - 34, FY - 170], [TW - 40, FY - 112], [TW - 82, FY - 124]], c: r.C.sky }]; const slingSegs = s => [[s.pts[0], s.pts[1]], [s.pts[1], s.pts[2]], [s.pts[2], s.pts[0]]].map(([a, b]) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
    const SPIN = { x: 158, y: 150 }, RAIL_IN = { x: TW - 56, y: 262 }; // ספינר, כניסה לגשר
    /* שתי מנהרות בצדדים (רועי 29/09: הכדור לא צריך ללכת ישר למנהרה; עוד מנהרה בצד): הפה פונה למטה, נכנסים רק בכדור שעולה.
       שמאל → הכדור רוכב על הגשר ויוצא מימין. ימין → הכדור יוצא מלמעלה באמצע ונופל על המטרות. מעל כל מנהרה עמוד גומי קטן שחוסם כדור שיורד לאורך הקיר */
    const HOLE = { x: 26, y: 236, r: 12 }, HOLE_R = { x: TW - 26, y: 236, r: 12 }, POSTS = [{ x: 30, y: 200, r: 6 }, { x: TW - 30, y: 200, r: 6 }]; let tunnelSide = 'L';
    // הגשר: מסלול בזייה מהצד הימני למעלה ושמאלה, יורד בצד שמאל
    const railPt = k => { const p0 = { x: TW - 56, y: 262 }, p1 = { x: TW - 10, y: 20 }, p2 = { x: 60, y: 10 }, p3 = { x: 52, y: 130 }; const u = 1 - k; return { x: u * u * u * p0.x + 3 * u * u * k * p1.x + 3 * u * k * k * p2.x + k * k * k * p3.x, y: u * u * u * p0.y + 3 * u * u * k * p1.y + 3 * u * k * k * p2.y + k * k * k * p3.y }; };
    const newBall = () => { ball = { x: r.W - LANE / 2, y: r.H - 60, vx: 0, vy: 0 }; launched = false; pull = 0; pulling = false; rail = null; tunnel = 0; };
    newBall();
    return {
      down(x, y) { if (!launched && x > TW - 6) { pulling = true; pullY0 = y; return; } if (x < r.W / 2) fl.l = 0.16; else fl.r = 0.16; },
      move(x, y) { if (pulling) pull = r.clamp((y - pullY0) / 110, 0, 1); },
      up() { if (!pulling) return; pulling = false; if (pull < .08) { pull = 0; return; } launched = true; ball.vy = -(480 + pull * 620 + r.rnd(-30, 30)); ball.vx = 0; pull = 0; r.sfx('bounce'); },
      revive() { balls = 3; hits = 0; newBall(); },
      peek() { return { ball, launched, FY, TW, rail: !!rail, tunnel: tunnel > 0, pulling, pull, LANE }; },
      update(dt) { tt += dt; fl.l = Math.max(0, fl.l - dt); fl.r = Math.max(0, fl.r - dt); multT -= dt; if (multT <= 0) mult = 1; for (const k in flash) flash[k] -= dt; spin += spinV * dt; spinV *= (1 - 1.8 * dt);
        const goal = side => (side === 'l' ? fl.l : fl.r) > 0 ? UP : REST; fl.la += (goal('l') - fl.la) * Math.min(1, dt * (fl.l > 0 ? 28 : 14)); fl.ra += (goal('r') - fl.ra) * Math.min(1, dt * (fl.r > 0 ? 28 : 14));
        if (!launched) { ball.y = r.H - 60 + pull * 38; ball.x = r.W - LANE / 2; return; }
        // במנהרה: הכדור נעלם ויוצא במסלול הימני
        if (tunnel > 0) { tunnel -= dt; if (tunnel <= 0) { if (tunnelSide === 'L') rail = { k: 1, sp: -1.1 }; else { ball.x = TW / 2; ball.y = 40; ball.vx = r.rnd(-40, 40); ball.vy = 240; } r.sfx('bounce'); } return; } /* המנהרה יוצאת על הגשר (רועי): הכדור רוכב על המסילה הפוך ונופל לשולחן בכניסת הגשר */
        // על הגשר: רוכב לאורך המסלול
        if (rail) { rail.k += dt * rail.sp; const p = railPt(r.clamp(rail.k, 0, 1)); ball.x = p.x; ball.y = p.y; if (rail.sp < 0 && rail.k <= 0) { rail = null; ball.vx = -90; ball.vy = 260; return; } if (rail.k >= 1) { rail = null; ball.vx = -40; ball.vy = 220; if (multT <= 0) { mult = 2; multT = 10; r.pop('גשר! +200 ומכפיל ×2', TW / 2, 160, r.C.gold, 22); } else r.pop('גשר! +200', TW / 2, 160, r.C.gold, 22); r.addScore(200 * mult); r.sfx('ching'); } return; }
        ball.vy += 640 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        const inLane = ball.x > TW && ball.y > 50; if (inLane) { ball.x = r.clamp(ball.x, TW + PR + 2, r.W - PR - 2); ball.vx = 0; if (ball.y < 60) { const sp = Math.abs(ball.vy); ball.vx = -(30 + sp * .2 + r.rnd(0, 70)); } /* חזק = רחוק שמאלה, חלש = נופל קרוב; ועוד קצת מזל */ if (ball.vy > 0 && ball.y > r.H - 70) { launched = false; ball.vx = 0; ball.vy = 0; ball.y = r.H - 60; r.pop('חלש מדי, עוד פעם 😅', TW / 2, r.H - 150, '#fff', 16); } }
        if (ball.y < 50 && ball.x > TW - 10) { ball.x = Math.min(ball.x, TW - 10); ball.vx = -Math.abs(ball.vx) - 120; }
        if (ball.x < PR) { ball.x = PR; ball.vx = Math.abs(ball.vx) * .8; r.sfx('tick'); } if (!inLane && ball.x > TW - PR) { ball.x = TW - PR; ball.vx = -Math.abs(ball.vx) * .8; }
        if (ball.y < PR) { ball.y = PR; ball.vy = Math.abs(ball.vy) * .8; }
        for (const w of walls) bounceSeg(w, 3, .7);
        // כניסה לגשר: כדור שעולה בצד ימין ליד הכניסה
        if (!inLane && ball.x < TW - 36 && ball.vy < -250 && r.dist(ball.x, ball.y, RAIL_IN.x, RAIL_IN.y) < 20) { /* רק כדור שעולה מהשולחן, לא מהשיגור */ rail = { k: 0, sp: Math.min(1.4, Math.abs(ball.vy) / 700) }; r.sfx('score'); return; }
        // מנהרות: רק כדור שעולה נכנס (הפה למטה)
        for (const [h, side] of [[HOLE, 'L'], [HOLE_R, 'R']]) if (ball.vy < -60 && r.dist(ball.x, ball.y, h.x, h.y) < h.r + 2) { tunnel = .8; tunnelSide = side; r.addScore(150 * mult); r.pop(`מנהרה! +${150 * mult}`, side === 'L' ? 100 : TW - 100, h.y - 40, r.C.gold, 22); r.sfx('win'); return; }
        for (const p of POSTS) { const d = r.dist(ball.x, ball.y, p.x, p.y); if (d < p.r + PR) { const nx = (ball.x - p.x) / d, ny = (ball.y - p.y) / d; const vn = ball.vx * nx + ball.vy * ny; if (vn < 0) { ball.vx -= 1.6 * vn * nx; ball.vy -= 1.6 * vn * ny; } ball.x = p.x + nx * (p.r + PR + .5); ball.y = p.y + ny * (p.r + PR + .5); r.sfx('tick'); } }
        // ספינר: מוט שמסתובב כשהכדור עובר, נקודות לכל סיבוב
        if (Math.abs(ball.x - SPIN.x) < 22 && Math.abs(ball.y - SPIN.y) < 12 && Math.abs(spinV) < 5) { spinV = Math.sign(ball.vy || 1) * Math.min(40, Math.abs(ball.vy) / 12); r.sfx('tick'); }
        if (Math.abs(spinV) > 1 && Math.floor(spin / Math.PI) !== Math.floor((spin - spinV * dt) / Math.PI)) { r.addScore(10 * mult); flash.spin = .1; }
        // סלינגשוטים
        for (const sl of slings) for (const seg of slingSegs(sl)) if (bounceSeg(seg, 2, .6, 260)) { hits++; r.addScore(15 * mult); r.pop('+' + 15 * mult, (sl.pts[0][0] + sl.pts[2][0]) / 2, FY - 130, '#fff', 14); flash[sl.c] = .12; r.sfx('bounce'); break; }
        for (const b of bumpers) { const d = r.dist(ball.x, ball.y, b.x, b.y); if (d < b.r + PR) { const nx = (ball.x - b.x) / d, ny = (ball.y - b.y) / d; ball.vx = nx * 420; ball.vy = ny * 420; ball.x = b.x + nx * (b.r + PR + 1); ball.y = b.y + ny * (b.r + PR + 1); hits++; const pts = (25 + Math.min(hits, 20) * 5) * mult; r.addScore(pts); r.pop('+' + pts, b.x, b.y - b.r - 8, '#fff', 16); r.burst(b.x, b.y, b.c, 6, 100); r.sparkle(b.x, b.y, 18, 3); flash[b.x] = .15; r.sfx('bell'); } }
        for (const tg of targets) { if (tg.up && Math.abs(ball.x - tg.x) < 18 && Math.abs(ball.y - tg.y) < 12) { tg.up = false; ball.vy = Math.abs(ball.vy); r.addScore(50 * mult); r.pop('+' + 50 * mult, tg.x, tg.y - 14, r.C.gold, 16); r.sfx('score'); if (targets.every(t => !t.up)) { r.addScore(300); r.pop('כל המטרות! +300', TW / 2, 130, r.C.gold, 24); r.burst(TW / 2, 110, r.C.gold, 30, 260); r.sfx('win'); setTimeout(() => targets.forEach(t => t.up = true), 800); } } }
        for (const side of ['l', 'r']) { const seg = flipperEnd(side); const lifting = side === 'l' ? fl.l > 0 : fl.r > 0; if (bounceSeg(seg, 7, lifting ? .9 : .55, 0)) { if (lifting) { ball.vy -= 560 * Math.max(.3, segHit(seg, 9)?.t ?? .6); ball.vx += (side === 'l' ? 1 : -1) * 90; r.addScore(5); r.sfx('bounce'); } else r.sfx('tick'); } }
        const sp = Math.hypot(ball.vx, ball.vy); if (sp > 1100) { ball.vx *= 1100 / sp; ball.vy *= 1100 / sp; }
        if (ball.y > r.H + 20) { balls--; hits = 0; if (balls <= 0) return r.over('נגמרו הכדורים!'); r.pop(`הכדור ירד. נשארו ${balls}`, TW / 2, r.H / 2, '#fff', 20); r.sfx('over'); newBall(); } },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#4c1d95'); bg.addColorStop(.5, '#312e81'); bg.addColorStop(1, '#1e1b4b'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H);
        // רקע חלל: כוכבים מנצנצים, כוכב לכת עם טבעת, פסי אור
        for (let i = 0; i < 40; i++) r.circle((i * 79) % TW, (i * 113) % r.H, i % 3 ? 1 : 2, `rgba(255,255,255,${.15 + .2 * Math.abs(Math.sin(tt * 2 + i))})`);
        { const pg = c.createRadialGradient(TW / 2 - 12, 300, 4, TW / 2, 310, 46); pg.addColorStop(0, '#f0abfc'); pg.addColorStop(.6, '#7e22ce'); pg.addColorStop(1, '#3b0764'); c.fillStyle = pg; c.beginPath(); c.arc(TW / 2, 310, 46, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(244,114,182,.55)'; c.lineWidth = 5; c.beginPath(); c.ellipse(TW / 2, 314, 74, 16, -.3, 0, Math.PI * 2); c.stroke(); }
        for (let i = 0; i < 5; i++) { c.fillStyle = `rgba(236,72,153,${.05 + i * .015})`; c.beginPath(); c.moveTo(TW / 2, r.H - 40); c.lineTo(20 + i * 40, 0); c.lineTo(50 + i * 40, 0); c.fill(); }
        r.text('PINBALL', TW / 2, 384, { size: 22, color: 'rgba(244,114,182,.35)' });
        r.rect(TW, 50, LANE, r.H - 50, 'rgba(255,255,255,.05)'); r.rect(TW - 2, 50, 4, r.H - 50, '#a78bfa');
        /* שולי השולחן: אזורים מלאים מאחורי הקירות המשופעים, לא קווים דקים */
        const edges = [[[0, FY - 116], [PIV_L.x, FY], [PIV_L.x, r.H], [0, r.H]], [[TW, FY - 116], [PIV_R.x, FY], [PIV_R.x, r.H], [TW, r.H]], [[0, 44], [44, 6], [44, 0], [0, 0]], [[TW, 44], [TW - 44, 6], [TW - 44, 0], [TW, 0]]];
        edges.forEach(pts => { c.fillStyle = '#251650'; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); });
        c.lineCap = 'round'; walls.forEach(w => { c.strokeStyle = '#1B1740'; c.lineWidth = 12; c.beginPath(); c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2); c.stroke(); c.save(); c.shadowColor = '#a78bfa'; c.shadowBlur = 14; c.strokeStyle = '#c4b5fd'; c.lineWidth = 6; c.beginPath(); c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2); c.stroke(); c.restore(); });
        /* צינורות המנהרות: שמאל אל קצה המסילה, ימין אל היציאה למעלה באמצע */
        { const pe = railPt(1); c.lineJoin = 'round'; for (const [w, col] of [[24, '#0f0a1f'], [16, '#000']]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(HOLE.x, HOLE.y); c.lineTo(22, 160); c.lineTo(pe.x, pe.y); c.stroke(); c.beginPath(); c.moveTo(HOLE_R.x, HOLE_R.y); c.lineTo(TW - 20, 60); c.lineTo(TW / 2, 34); c.stroke(); } r.circle(TW / 2, 34, 11, '#000'); c.strokeStyle = tunnel > 0 && tunnelSide === 'R' ? r.C.gold : '#a78bfa'; c.lineWidth = 2; c.beginPath(); c.arc(TW / 2, 34, 13, 0, Math.PI * 2); c.stroke(); }
        // הגשר: מסילת חוט כפולה
        c.lineWidth = 3; for (const off of [-5, 5]) { c.strokeStyle = rail ? r.C.gold : 'rgba(226,232,240,.75)'; c.beginPath(); for (let k = 0; k <= 1; k += .05) { const p = railPt(k); k ? c.lineTo(p.x + off, p.y) : c.moveTo(p.x + off, p.y); } c.stroke(); } r.circle(RAIL_IN.x, RAIL_IN.y, 12, 'rgba(253,224,71,.25)'); r.text('גשר ⬆', RAIL_IN.x - 26, RAIL_IN.y, { size: 11, color: r.C.gold });
        // המנהרה
        for (const [h, side] of [[HOLE, 'L'], [HOLE_R, 'R']]) { r.circle(h.x, h.y, h.r + 4, '#0f0a1f'); r.circle(h.x, h.y, h.r, '#000'); c.save(); c.shadowColor = tunnel > 0 && tunnelSide === side ? r.C.gold : '#22d3ee'; c.shadowBlur = 10; c.strokeStyle = tunnel > 0 && tunnelSide === side ? r.C.gold : '#22d3ee'; c.lineWidth = 2.5; c.beginPath(); c.arc(h.x, h.y, h.r + 4, 0, Math.PI * 2); c.stroke(); c.restore(); r.text('▲', h.x, h.y + h.r + 12, { size: 11, color: '#67e8f9' }); } r.text('מנהרה', HOLE.x + 34, HOLE.y, { size: 10, color: '#a5f3fc' }); r.text('מנהרה', HOLE_R.x - 34, HOLE_R.y, { size: 10, color: '#a5f3fc' }); POSTS.forEach(p => { r.circle(p.x, p.y + 2, p.r + 1, 'rgba(0,0,0,.4)'); r.circle(p.x, p.y, p.r, '#f472b6'); r.circle(p.x - 1.5, p.y - 2, 2, '#fff'); });
        // הספינר
        c.save(); c.translate(SPIN.x, SPIN.y); c.scale(Math.abs(Math.cos(spin)), 1); r.rect(-22, -5, 44, 10, (flash.spin || 0) > 0 ? r.C.gold : '#f472b6', 4); c.restore(); r.text('ספינר', SPIN.x, SPIN.y - 16, { size: 10, color: '#c4b5fd' });
        targets.forEach(tg => { if (tg.up) { r.rect(tg.x - 15, tg.y - 8, 30, 16, r.C.gold, 4); r.rect(tg.x - 11, tg.y - 5, 22, 4, '#ffffff66', 2); } else r.rect(tg.x - 15, tg.y - 2, 30, 4, '#5b4a8b', 2); });
        bumpers.forEach(b => { const f = (flash[b.x] || 0) > 0; r.circle(b.x, b.y + 3, b.r + 3, 'rgba(0,0,0,.35)'); r.circle(b.x, b.y, b.r + 3, f ? '#fff' : '#1B1740'); r.circle(b.x, b.y, b.r, f ? '#fff' : shadeHex(b.c, -30)); const g = c.createRadialGradient(b.x - 5, b.y - 6, 2, b.x, b.y, b.r - 4); g.addColorStop(0, '#fff'); g.addColorStop(.35, b.c); g.addColorStop(1, shadeHex(b.c, -15)); c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r - 4, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(b.x - 4, b.y - 8, 6, 3, -.5, 0, Math.PI * 2); c.fill(); r.text('✦', b.x, b.y + 1, { size: 16, color: f ? b.c : '#fff' }); if (f) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.beginPath(); c.arc(b.x, b.y, b.r + 8 + (0.15 - (flash[b.x] || 0)) * 120, 0, Math.PI * 2); c.stroke(); } });
        slings.forEach(sl => { const f = (flash[sl.c] || 0) > 0; c.lineJoin = 'round'; c.beginPath(); sl.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = f ? '#fff' : shadeHex(sl.c, -35); c.fill(); c.strokeStyle = f ? r.C.gold : '#f8fafc'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#1B1740'; c.lineWidth = 1.5; c.stroke(); const cx = (sl.pts[0][0] + sl.pts[1][0] + sl.pts[2][0]) / 3, cy = (sl.pts[0][1] + sl.pts[1][1] + sl.pts[2][1]) / 3; r.circle(cx, cy, 5, f ? r.C.gold : sl.c); });
        for (const side of ['l', 'r']) { const seg = flipperEnd(side); const lifting = side === 'l' ? fl.l > 0 : fl.r > 0; const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, R1 = 11, R2 = 6; c.shadowColor = r.C.gold; c.shadowBlur = lifting ? 16 : 0; c.fillStyle = lifting ? r.C.gold : '#f1f5f9'; c.beginPath(); c.arc(seg.x1, seg.y1, R1, 0, Math.PI * 2); c.arc(seg.x2, seg.y2, R2, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(seg.x1 + nx * R1, seg.y1 + ny * R1); c.lineTo(seg.x2 + nx * R2, seg.y2 + ny * R2); c.lineTo(seg.x2 - nx * R2, seg.y2 - ny * R2); c.lineTo(seg.x1 - nx * R1, seg.y1 - ny * R1); c.closePath(); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.stroke(); c.strokeStyle = lifting ? '#b45309' : '#ef4444'; c.lineWidth = 3; c.beginPath(); c.moveTo(seg.x1 + dx * .15, seg.y1 + dy * .15); c.lineTo(seg.x1 + dx * .85, seg.y1 + dy * .85); c.stroke(); c.shadowBlur = 0; r.circle(seg.x1, seg.y1, 4, '#1B1740'); }
        r.rect(PIV_L.x + FLEN * .6, r.H - 10, PIV_R.x - PIV_L.x - FLEN * 1.2, 10, '#00000066');
        if (tunnel <= 0) { const g = c.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, PR); g.addColorStop(0, '#fff'); g.addColorStop(1, '#9ca3af'); c.fillStyle = g; c.beginPath(); c.arc(ball.x, ball.y, PR, 0, Math.PI * 2); c.fill(); }
        /* הבוכנה: קפיץ מתחת לכדור במסלול, נדחס כשמושכים; רמז "משוך למטה" לפני השיגור */
        if (!launched) { const bx = r.W - LANE / 2, top = ball.y + PR + 2, bot = r.H - 4; c.strokeStyle = '#94a3b8'; c.lineWidth = 2.5; c.beginPath(); const n = 7; for (let i = 0; i <= n; i++) { const yy = top + (bot - top) * i / n; const xx = bx + (i % 2 ? 9 : -9); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); r.rect(bx - 12, top - 4, 24, 6, '#e2e8f0', 2); r.rect(bx - 6, bot - 8, 12, 8, '#475569', 2);
          if (pulling) { r.rect(TW - 12, r.H - 200, 8, 150, 'rgba(255,255,255,.15)', 3); r.rect(TW - 12, r.H - 50 - 150 * pull, 8, 150 * pull, pull > .75 ? '#ef4444' : pull > .4 ? r.C.gold : r.C.lime, 3); } else if (Math.sin(tt * 4) > -0.3) r.text('משוך למטה ⬇', TW - 40, r.H - 120, { size: 15, color: '#fde047' }); }
        r.text(`כדורים: ${'●'.repeat(Math.max(0, balls))}`, TW - 60, 22, { size: 13, color: '#c4b5fd' }); if (mult > 1) r.text(`×${mult} עוד ${Math.ceil(multT)}`, 90, 40, { size: 12, color: r.C.gold }); },
    };
  } });

// ---- כיפת ברזל (id invaders נשמר לשיאים ולהתקדמות): רקטות ורחפנים נופלים לעבר העיר למטה, המטוס מפיל אותם. גל נשמר (progress.wave). 3 חיים = 3 פגיעות בעיר/במטוס.
// בוסים לסירוגין (רועי 29/09): גל אי-זוגי = טיל ענק, גל זוגי = הדוד בחללית (התמונה של הרעב הגדול) שזורק קקי. נשקים: ⚡ כפול / 🚀 טילים מתפוצצים / 🔫 לייזר / 🛡️ מגן ----
G.push({ id: 'invaders', name: 'כיפת ברזל', emoji: '🛡️', how: 'המטוס עוקב אחרי האצבע ויורה לבד. רקטות ורחפנים נופלים לעבר העיר, מפילים אותם לפני שהם מגיעים! בסוף כל גל בוס: טיל ענק, ובגל הבא... הדוד בחללית. תופסים נשקים: ⚡ ירייה כפולה, 🚀 טילים שמתפוצצים, 🔫 לייזר חודר, 🛡️ מגן. 3 חיים. הגל נשמר לפעם הבאה!',
  make(r, progress) {
    const CITY = r.H - 24, PY = r.H - 78;
    let px = r.W / 2, lastPx = r.W / 2, bank = 0, shots = [], enemies = [], eshots = [], t = 0, et = 0, wave = Math.max(1, (progress && progress.wave) || 1), boss = null, drops = [], weapon = 'basic', weaponT = 0, shield = 0, tt = 0, lives = 3, inv = 0, booms = [], divers = [], spawned = 0, spT = 0, damage = [], bossWarn = 0;
    let face = null; try { if (typeof Image !== 'undefined') { const src = localStorage.getItem('kidfit.facePic'); face = new Image(); face.src = src || new URL('../../img/face.jpg', import.meta.url).href; } } catch { face = null; }
    const quota = () => 10 + wave * 4; const bossKind = () => wave % 2 ? 'missile' : 'uncle';
    const startWave = () => { enemies = []; eshots = []; boss = null; divers = []; spawned = 0; spT = 0; };
    startWave();
    const spawnOne = () => { spawned++; const kind = wave >= 2 && Math.random() < .3 ? 'drone' : wave >= 3 && Math.random() < .2 ? 'heavy' : 'rocket'; const x = r.rnd(24, r.W - 24);
      enemies.push({ x, y: -30, kind, hp: kind === 'heavy' ? 2 : 1, vy: kind === 'drone' ? 60 + wave * 8 : kind === 'heavy' ? 70 + wave * 10 : 95 + wave * 16, vx: kind === 'rocket' ? r.rnd(-25, 25) : 0, bob: Math.random() * 6, ph: Math.random() * 6 }); };
    const shotGap = () => weapon === 'twin' ? .22 : weapon === 'missile' ? .5 : weapon === 'laser' ? .6 : .35;
    const fire = () => { const y = PY - 22; if (weapon === 'twin') shots.push({ x: px - 9, y, kind: 'b' }, { x: px + 9, y, kind: 'b' }); else if (weapon === 'missile') shots.push({ x: px, y, kind: 'm', vy: 300 }); else if (weapon === 'laser') shots.push({ x: px, y, kind: 'l', life: .18, hitSet: new Set() }); else shots.push({ x: px, y, kind: 'b' }); r.sfx(weapon === 'laser' ? 'zap' : 'laser'); };
    const kill = (i, mult = 1) => { const e = enemies[i]; r.explode(e.x, e.y, e.kind === 'heavy' ? 48 : 34, 4); r.sfx('boom'); r.burst(e.x, e.y, e.kind === 'drone' ? r.C.sky : r.C.hot, 6, 200); enemies.splice(i, 1); const pts = (e.kind === 'rocket' ? 20 : 30) * wave * mult; r.addScore(pts); r.pop('+' + pts, e.x, e.y - 10, '#fff', 13); if (Math.random() < .13) drops.push({ x: e.x, y: e.y, kind: r.pick(['twin', 'missile', 'laser', 'shield']) }); };
    const explode = (x, y, rad, pts) => { booms.push({ x, y, r: rad, t: .35 }); r.burst(x, y, r.C.hot, 24, 260); r.sfx('hit'); for (let i = enemies.length - 1; i >= 0; i--) { if (r.dist(enemies[i].x, enemies[i].y, x, y) < rad) kill(i, pts); } };
    const hurt = (what, x) => { if (what === 'plane' && (shield > 0 || inv > 0)) { r.burst(px, PY, r.C.sky, 10, 150); r.sfx('bounce'); return; } lives--; inv = 2; r.shake(300); if (what === 'city') { damage.push({ x }); r.explode(x, CITY - 14, 70, 8); r.burst(x, CITY - 10, r.C.hot, 30, 300); } else { r.explode(px, PY, 60, 6); r.burst(px, PY, r.C.hot, 30, 300); } r.sfx('over'); eshots = []; if (lives <= 0) return r.over(what === 'city' ? 'העיר נפגעה!' : 'המטוס הופל!'); r.pop(what === 'city' ? `רקטה פגעה בעיר! נשארו ${lives} ❤️` : `נפגעת! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); };
    return {
      move(x) { px = r.clamp(x, 24, r.W - 24); }, down(x) { this.move(x); },
      save() { return { wave }; }, peek() { return { px, enemies, eshots, drops, boss, divers }; },
      revive() { lives = 3; inv = 2.5; eshots = []; enemies = enemies.filter(e => e.y < r.H - 220); damage = []; if (boss) boss.hp = Math.min(boss.maxHp, boss.hp + 2); },
      update(dt) { tt += dt; t += dt; bank += (r.clamp((px - lastPx) / Math.max(dt, 1e-3) / 600, -1, 1) - bank) * Math.min(1, dt * 8); lastPx = px; weaponT = Math.max(0, weaponT - dt); if (weaponT <= 0) weapon = 'basic'; shield = Math.max(0, shield - dt); inv = Math.max(0, inv - dt); bossWarn = Math.max(0, bossWarn - dt); booms.forEach(b => b.t -= dt); booms = booms.filter(b => b.t > 0);
        if (t > shotGap()) { t = 0; fire(); }
        shots.forEach(s => { if (s.kind === 'l') s.life -= dt; else s.y -= (s.vy || 440) * dt; }); shots = shots.filter(s => s.kind === 'l' ? s.life > 0 : s.y > -20);
        // רקטות נופלות בקצב שמתגבר עם הגל; רחפנים מזגזגים ויורים
        if (!boss && spawned < quota()) { spT += dt; if (spT > Math.max(.32, 1.1 - wave * .07)) { spT = 0; spawnOne(); } }
        enemies.forEach(e => { e.y += e.vy * dt; if (e.kind === 'drone') e.x = r.clamp(e.x + Math.sin(tt * 2 + e.ph) * 90 * dt, 20, r.W - 20); else e.x = r.clamp(e.x + e.vx * dt, 14, r.W - 14); });
        et += dt; const drones = enemies.filter(e => e.kind === 'drone'); if (et > Math.max(.7, 1.6 - wave * .1) && drones.length) { et = 0; const e = r.pick(drones); eshots.push({ x: e.x, y: e.y + 10, vy: 190 + wave * 12, kind: 'shot' }); }
        if (boss) { boss.x += boss.dir * (60 + wave * 8) * dt; if (boss.x < 60 || boss.x > r.W - 60) boss.dir *= -1; boss.y += (boss.kind === 'missile' ? 5 : 3) * dt; boss.t += dt; boss.hurt = Math.max(0, boss.hurt - dt);
          if (boss.t > Math.max(.7, 1.4 - wave * .05)) { boss.t = 0; if (boss.kind === 'missile') { for (const dx of [-34, 0, 34]) enemies.push({ x: boss.x + dx, y: boss.y + 40, kind: 'rocket', hp: 1, vy: 120 + wave * 10, vx: dx * .8, bob: 0, ph: 0 }); } else { eshots.push({ x: boss.x, y: boss.y + 26, vy: 170, vx: (px - boss.x) * .5, kind: 'poop' }); if (Math.random() < .5) eshots.push({ x: boss.x + r.rnd(-30, 30), y: boss.y + 26, vy: 150, kind: 'poop' }); } } }
        eshots.forEach(s => { s.y += (s.vy || 220) * dt; if (s.vx) s.x += s.vx * dt; }); eshots = eshots.filter(s => s.y < r.H);
        // פגיעות של היריות שלי
        for (const s of shots) {
          if (s.kind === 'l') { for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (Math.abs(e.x - s.x) < 16 && e.y < PY - 20 && !s.hitSet.has(e)) { s.hitSet.add(e); e.hp -= 1; if (e.hp <= 0) kill(i, 1); } } if (boss && Math.abs(boss.x - s.x) < 46 && !s.hitSet.has(boss)) { s.hitSet.add(boss); boss.hp -= 2; boss.hurt = .2; } continue; }
          const i = enemies.findIndex(e => r.dist(e.x, e.y, s.x, s.y) < 18); if (i >= 0) { if (s.kind === 'm') { const ex = s.x, ey = s.y; s.y = -99; explode(ex, ey, 52, 1); } else { const e = enemies[i]; e.hp--; s.y = -99; if (e.hp <= 0) kill(i, 1); else { e.hurt = .15; r.sfx('hit'); } } }
          if (boss && s.y > 0 && r.dist(boss.x, boss.y, s.x, s.y) < 46) { boss.hp -= s.kind === 'm' ? 3 : 1; boss.hurt = .2; s.y = -99; r.burst(s.x, s.y + 99, r.C.hot, 6, 120); r.sfx('hit'); if (s.kind === 'm') booms.push({ x: boss.x, y: boss.y, r: 40, t: .3 }); if (boss.kind === 'uncle' && Math.random() < .25) r.pop(r.pick(['איי!', 'אוי ואבוי!', 'לא הפרצוף!', 'זה מדגדג!']), boss.x, boss.y - 60, '#fff', 16); } }
        shots = shots.filter(s => s.kind === 'l' || s.y > -50);
        if (boss && boss.hp <= 0) { r.burst(boss.x, boss.y, r.C.gold, 60, 360); r.explode(boss.x, boss.y, 110, 12); r.sfx('boom'); r.addScore(200 * wave); r.pop(boss.kind === 'uncle' ? `הדוד ברח! +${200 * wave} 😂` : `הטיל הענק הושמד! +${200 * wave}`, r.W / 2, 200, r.C.gold, 26); if (boss.kind === 'uncle') r.sfx('laugh'); boss = null; wave++; startWave(); r.win(`גל ${wave}!`, 0); return; }
        drops.forEach(d => d.y += 110 * dt); for (const d of drops) if (Math.abs(d.x - px) < 26 && d.y > PY - 30 && d.y < PY + 20) { d.got = true; if (d.kind === 'shield') { shield = 8; r.pop('מגן! 🛡️', px, PY - 50, r.C.sky, 20); } else { weapon = d.kind; weaponT = 10; r.pop({ twin: 'ירייה כפולה! ⚡', missile: 'טילים! 🚀', laser: 'לייזר! 🔫' }[d.kind], px, PY - 50, r.C.gold, 20); } r.sfx('score'); } drops = drops.filter(d => !d.got && d.y < r.H);
        const hit = eshots.find(s => r.dist(s.x, s.y, px, PY) < 20); if (hit) { hit.y = r.H + 10; if (hit.kind === 'poop') { r.sfx('fart'); r.pop('קקי! 💩', px, PY - 50, '#a16207', 20); } const res = hurt('plane'); if (res !== undefined) return res; }
        const rammed = enemies.find(e => r.dist(e.x, e.y, px, PY) < 24); if (rammed) { enemies = enemies.filter(e => e !== rammed); booms.push({ x: rammed.x, y: rammed.y, r: 30, t: .3 }); const res = hurt('plane'); if (res !== undefined) return res; }
        const landed = enemies.find(e => e.y > CITY - 30); if (landed) { enemies = enemies.filter(e => e !== landed); const res = hurt('city', landed.x); if (res !== undefined) return res; }
        if (boss && boss.y > r.H - 170) return r.over(boss.kind === 'uncle' ? 'הדוד כבש את העיר!' : 'הטיל הענק הגיע לעיר!');
        if (!boss && spawned >= quota() && !enemies.length) { const hp = 8 + wave * 4; boss = { kind: bossKind(), x: r.W / 2, y: 90, hp, maxHp: hp, dir: 1, t: 0, hurt: 0 }; bossWarn = 2; r.pop(boss.kind === 'uncle' ? 'הדוד מגיע בחללית! 🛸' : 'טיל ענק! 🚀', r.W / 2, 220, r.C.hot, 26); r.sfx('roar'); } },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#020617'); bg.addColorStop(.7, '#1e1b4b'); bg.addColorStop(1, '#3b0764'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); for (let i = 0; i < 40; i++) { const sy = (i * 131 + tt * (4 + (i % 3) * 5)) % (r.H - 80); r.circle((i * 89) % r.W, sy, i % 3 ? 1 : 1.6, `rgba(255,255,255,${.3 + (i % 4) * .15})`); }
        r.circle(r.W - 60, 70, 22, '#fef3c7'); r.circle(r.W - 68, 64, 22, '#020617'); /* ירח */
        SP.city(r, CITY, r.W, tt, damage); c.fillStyle = '#0b1120'; c.fillRect(0, CITY, r.W, r.H - CITY);
        enemies.forEach((e, i) => { if (e.kind === 'drone') SP.drone(r, e.x, e.y, tt + i, 1, e.hurt || 0); else SP.rocket(r, e.x, e.y, tt + i, e.kind === 'heavy' ? 1.35 : 1, e.kind === 'heavy' ? '#fbbf24' : '#e5e7eb', e.hurt || 0); if (e.hurt) e.hurt = Math.max(0, e.hurt - .016); });
        if (boss) { if (boss.kind === 'missile') { SP.rocket(r, boss.x, boss.y, tt, 2.6, '#f87171', boss.hurt); } else { SP.ufo(r, boss.x, boss.y, tt, 1.3, boss.hurt); if (face && face.complete && face.naturalWidth) { c.save(); c.beginPath(); c.arc(boss.x, boss.y - 12, 20, 0, Math.PI * 2); c.clip(); c.drawImage(face, boss.x - 22, boss.y - 34, 44, 44); c.restore(); } }
          r.rect(boss.x - 44, boss.y - 70, 88, 7, '#00000066', 3); r.rect(boss.x - 44, boss.y - 70, 88 * Math.max(0, boss.hp) / boss.maxHp, 7, r.C.hot, 3); }
        if (bossWarn > 0 && Math.sin(tt * 12) > 0) r.text('⚠️ בוס ⚠️', r.W / 2, 60, { size: 26, color: '#ef4444' });
        shots.forEach(s => { if (s.kind === 'b') { r.rect(s.x - 2, s.y, 4, 12, r.C.lime); r.circle(s.x, s.y, 3, '#fff'); } else if (s.kind === 'm') { r.rect(s.x - 3, s.y, 6, 16, '#e5e7eb', 2); r.rect(s.x - 3, s.y, 6, 5, '#ef4444', 2); r.circle(s.x, s.y + 20 + Math.random() * 4, 4, '#f97316'); } else { const a = s.life / .18; c.fillStyle = `rgba(56,189,248,${a * .9})`; c.fillRect(s.x - 3, 0, 6, s.y); c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(s.x - 1, 0, 2, s.y); } });
        eshots.forEach(s => { if (s.kind === 'poop') r.emoji('💩', s.x, s.y, 22); else { r.rect(s.x - 2, s.y, 4, 12, r.C.hot); r.circle(s.x, s.y + 12, 3, '#fde047'); } });
        booms.forEach(b => { c.fillStyle = `rgba(251,146,60,${Math.min(1, b.t * 1.5)})`; c.beginPath(); c.arc(b.x, b.y, b.r * (1 - b.t / .6 * .4), 0, Math.PI * 2); c.fill(); c.fillStyle = `rgba(255,255,255,${Math.min(1, b.t * 2)})`; c.beginPath(); c.arc(b.x, b.y, b.r * .4, 0, Math.PI * 2); c.fill(); });
        drops.forEach(d => { r.circle(d.x, d.y, 15, 'rgba(255,255,255,.18)'); r.emoji({ twin: '⚡', missile: '🚀', laser: '🔫', shield: '🛡️' }[d.kind], d.x, d.y, 20); });
        if (shield > 0) r.circle(px, PY, 32, `rgba(56,189,248,${.15 + Math.sin(tt * 8) * .08})`); if (!(inv > 0 && Math.sin(tt * 30) > 0)) SP.fighter(r, px, PY, tt, weapon === 'basic' ? r.C.sky : r.C.gold, 1, bank);
        const left = boss ? 'בוס' : `עוד ${Math.max(0, quota() - spawned) + enemies.length}`; r.text(`גל ${wave} · ${left} · ${'❤️'.repeat(Math.max(0, lives))}${weapon !== 'basic' ? ` · ${{ twin: '⚡', missile: '🚀', laser: '🔫' }[weapon]} ${Math.ceil(weaponT)}` : ''}${shield > 0 ? ' · 🛡️' : ''}`, r.W / 2, 22, { size: 13, color: r.C.muted }); },
    };
  } });

// ---- שדה אסטרואידים: החללית המשותפת, אבנים מציאותיות שמסתובבות, 🌟 בונוס, 🛡️ מגן, 💣 פצצה שמתמלאת כל 30 שניות (מנקה את המסך), ירייה כפולה מ-10 פגיעות, רמות, 3 חיים, הרמה נשמרת.
// גיוון (רועי 29/09): שביטים מהירים באלכסון עם זנב (מרמה 2), מוקשים שמתפוצצים לרסיסים (מרמה 2), ביצי חלל שנסדקות והופכות לכוכב או לחרק שרודף (מרמה 3), עב"ם שנשאר למעלה ויורה פלזמה (מרמה 2, כל ~20 שניות), חור שחור שמושך את החללית (מרמה 4) ----
G.push({ id: 'asteroids', name: 'שדה אסטרואידים', emoji: '☄️', assets: ['space/spaceMeteors_001', 'space/spaceMeteors_002', 'space/spaceMeteors_003', 'space/spaceMeteors_004'], how: 'החללית עוקבת אחרי האצבע. נוגעים כדי לירות. הפצצה 💣 בפינה מתמלאת כל חצי דקה: נוגעים בה ומפוצצים את כל האבנים במסך! אוספים 🌟 ו-🛡️. מרמה 2: שביטים, מוקשים שמתפוצצים לרסיסים ועב"ם שיורה. מרמה 3: ביצי חלל שנסדקות והופכות למשהו... מרמה 4: חור שחור! 3 חיים. הרמה נשמרת.',
  make(r, progress) {
    let px = r.W / 2, py = r.H - 80, lastPx = r.W / 2, bank = 0, rocks = [], shots = [], t = 0, alive = (progress && progress.level ? (progress.level - 1) * 15 : 0), hits = 0, shield = 0, stars = [], st = 0, levelT = 0, lives = 3, inv = 0, bomb = 30, booms = [], tt = 0, ufo = null, ufoT = 12, eshots = [], hole = null, holeT = 20;
    const level = () => 1 + Math.floor(alive / 15); const BOMB = { x: r.W - 34, y: 34, r: 24 };
    const mkRock = (x, y, s, vy, vx, seed) => ({ kind: 'rock', x, y, s, vy, vx, rot: r.rnd(0, 6), vr: r.rnd(-2, 2), seed });
    /* משהו שנשבר לרסיסים: 6 אבנים קטנות בטבעת */
    const shatter = (k) => { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + r.rnd(0, .5); rocks.push({ ...mkRock(k.x, k.y, 9, Math.sin(a) * 220 + 80, Math.cos(a) * 220, k.seed + i), shard: true }); } booms.push({ x: k.x, y: k.y, r: 10, t: .5, max: 60 }); r.shake(200); r.sfx('hit'); };
    const loseLife = (k) => { if (shield > 0 || inv > 0) { rocks = rocks.filter(x => x !== k); r.burst(k.x, k.y, r.C.sky, 14, 200); r.sfx('bounce'); return; } lives--; inv = 2; r.shake(300); r.burst(px, py, r.C.hot, 30, 300); r.sfx('over'); rocks = rocks.filter(x => r.dist(x.x, x.y, px, py) > 120); if (lives <= 0) return r.over('בום! החללית הושמדה'); r.pop(`נפגעת! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); };
    const detonate = () => { bomb = 0; booms.push({ x: px, y: py, r: 30, t: .8, max: 420 }); r.shake(400); r.sfx('roar'); let n = 0; rocks.forEach(k => { n++; r.burst(k.x, k.y, '#A8A29E', 8, 160); }); const pts = n * 8 * level(); rocks = []; eshots = []; if (ufo) { ufo.hp -= 3; ufo.hurt = .3; } r.addScore(pts); r.pop(`פצצה! ${n} אבנים +${pts} 💣`, r.W / 2, 200, r.C.gold, 24); };
    return {
      move(x, y) { px = r.clamp(x, 16, r.W - 16); py = r.clamp(y, 200, r.H - 30); }, down(x, y) { if (bomb >= 30 && r.dist(x, y, BOMB.x, BOMB.y) < BOMB.r + 10) { detonate(); return; } this.move(x, y); },
      tap(x, y) { if (bomb >= 30 && r.dist(x, y, BOMB.x, BOMB.y) < BOMB.r + 10) return; if (hits >= 10) shots.push({ x: px - 7, y: py - 20 }, { x: px + 7, y: py - 20 }); else shots.push({ x: px, y: py - 20 }); r.sfx('laser'); },
      save() { return { level: level() }; }, peek() { return { px, py, rocks, stars, bomb, BOMB, ufo, eshots, hole }; },
      revive() { lives = 3; inv = 3; rocks = []; eshots = []; ufo = null; hole = null; shield = 3; },
      update(dt) { alive += dt; tt += dt; t += dt; st += dt; bank += (r.clamp((px - lastPx) / Math.max(dt, 1e-3) / 600, -1, 1) - bank) * Math.min(1, dt * 8); lastPx = px; shield = Math.max(0, shield - dt); inv = Math.max(0, inv - dt); levelT -= dt; bomb = Math.min(30, bomb + dt); booms.forEach(b => { b.t -= dt; }); booms = booms.filter(b => b.t > 0); const L = level(); if (Math.floor(alive / 15) !== Math.floor((alive - dt) / 15)) { levelT = 1.5; r.pop(`רמה ${L}! ☄️`, r.W / 2, 150, r.C.gold, 24); }
        if (t > Math.max(0.28, 1 - L * .12)) { t = 0; const roll = Math.random();
          if (L >= 2 && roll < .14) { const fromLeft = Math.random() < .5; rocks.push({ kind: 'comet', x: fromLeft ? -20 : r.W + 20, y: r.rnd(-20, 160), s: r.rnd(9, 14), vy: r.rnd(160, 260) + L * 20, vx: (fromLeft ? 1 : -1) * r.rnd(180, 300), rot: 0, vr: 0, seed: r.rnd(0, 100), tail: [] }); }
          else if (L >= 2 && roll < .26) rocks.push({ kind: 'mine', x: r.rnd(24, r.W - 24), y: -30, s: 15, vy: r.rnd(50, 90), vx: r.rnd(-20, 20), rot: 0, vr: 1, seed: 0, blink: 0 });
          else if (L >= 3 && roll < .38) rocks.push({ kind: 'egg', x: r.rnd(24, r.W - 24), y: -30, s: 18, vy: r.rnd(40, 70), vx: r.rnd(-15, 15), rot: 0, vr: .3, seed: r.rnd(0, 100), hatch: r.rnd(2.5, 4.5) });
          else rocks.push(mkRock(r.rnd(20, r.W - 20), -30, r.rnd(14, 32), r.rnd(90, 190) + L * 15, r.rnd(-40, 40), r.rnd(0, 100))); }
        /* עב"ם: מגיע מרמה 2, נשאר למעלה, זז לצדדים ויורה פלזמה; עוזב אחרי 16 שניות */
        ufoT -= dt; if (!ufo && L >= 2 && ufoT <= 0) { ufo = { x: -50, y: r.rnd(70, 150), hp: 4 + L, maxHp: 4 + L, dir: 1, t: 0, life: 16, hurt: 0 }; r.pop('עב"ם! 🛸', r.W / 2, 120, r.C.lime, 22); r.sfx('roar'); }
        if (ufo) { ufo.t += dt; ufo.life -= dt; ufo.hurt = Math.max(0, ufo.hurt - dt); ufo.x += ufo.dir * (90 + L * 10) * dt; if (ufo.x > r.W - 40) ufo.dir = -1; if (ufo.x < 40 && ufo.dir < 0) ufo.dir = 1; if (ufo.t > Math.max(.6, 1.5 - L * .1)) { ufo.t = 0; const d = Math.hypot(px - ufo.x, py - ufo.y) || 1; eshots.push({ x: ufo.x, y: ufo.y + 14, vx: (px - ufo.x) / d * 230, vy: (py - ufo.y) / d * 230 }); r.sfx('tick'); } if (ufo.life <= 0) { ufo = null; ufoT = r.rnd(14, 22); r.pop('העב"ם ברח', r.W / 2, 120, r.C.muted, 16); } }
        eshots.forEach(e => { e.x += e.vx * dt; e.y += e.vy * dt; }); eshots = eshots.filter(e => e.y < r.H + 20 && e.x > -20 && e.x < r.W + 20);
        /* חור שחור: מרמה 4, מופיע ל-7 שניות ומושך את החללית והאבנים אליו */
        holeT -= dt; if (!hole && L >= 4 && holeT <= 0) { hole = { x: r.rnd(70, r.W - 70), y: r.rnd(220, 380), t: 7, a: 0 }; r.pop('חור שחור! תתרחק 🕳️', r.W / 2, 160, '#c4b5fd', 22); r.shake(300); }
        if (hole) { hole.t -= dt; hole.a += dt * 3; const k = Math.min(1, hole.t * 2); const d = Math.hypot(hole.x - px, hole.y - py) || 1; const pullF = 150 * k / Math.max(.4, d / 120); px = r.clamp(px + (hole.x - px) / d * pullF * dt, 16, r.W - 16); py = r.clamp(py + (hole.y - py) / d * pullF * dt, 200, r.H - 30); rocks.forEach(rk => { const dd = Math.hypot(hole.x - rk.x, hole.y - rk.y) || 1; rk.vx += (hole.x - rk.x) / dd * 80 * dt; rk.vy += (hole.y - rk.y) / dd * 80 * dt; }); if (hole.t <= 0) { hole = null; holeT = r.rnd(18, 28); } }
        if (st > 4) { st = 0; stars.push({ x: r.rnd(30, r.W - 30), y: -20, kind: Math.random() < .75 ? 'star' : 'shield', vy: 80 }); }
        rocks.forEach(k => { k.y += k.vy * dt; k.x += k.vx * dt; k.rot += k.vr * dt; if (k.kind === 'comet') { k.tail.unshift([k.x, k.y]); if (k.tail.length > 14) k.tail.pop(); } if (k.kind === 'mine') k.blink += dt;
          if (k.kind === 'egg') { k.hatch -= dt; if (k.hatch < 1) k.x += Math.sin(tt * 40) * 1.5; if (k.hatch <= 0) { k.dead = true; if (Math.random() < .5) { stars.push({ x: k.x, y: k.y, kind: 'star', vy: 80 }); r.pop('יצא כוכב! 🌟', k.x, k.y - 30, r.C.gold, 18); } else { rocks.push({ kind: 'bug', x: k.x, y: k.y, s: 13, vy: 0, vx: 0, rot: 0, vr: 0, seed: 0, life: 9 }); r.pop('חרק חלל! הוא רודף 🐛', k.x, k.y - 30, r.C.lime, 18); r.sfx('hit'); } r.burst(k.x, k.y, '#d6d3d1', 14, 200); } }
          if (k.kind === 'bug') { k.life -= dt; const d = Math.hypot(px - k.x, py - k.y) || 1; const sp = 95 + level() * 12; k.vx = (px - k.x) / d * sp; k.vy = (py - k.y) / d * sp; if (k.life <= 0) k.dead = true; } });
        rocks = rocks.filter(k => !k.dead && k.y < r.H + 40 && k.x > -60 && k.x < r.W + 60); stars.forEach(s => { s.y += s.vy * dt; }); stars = stars.filter(s => s.y < r.H + 20 && !s.got);
        shots.forEach(s => s.y -= 500 * dt); shots = shots.filter(s => s.y > -10);
        for (const s of shots) { if (ufo && r.dist(ufo.x, ufo.y, s.x, s.y) < 40) { s.y = -20; ufo.hp--; ufo.hurt = .2; r.sfx('hit'); r.burst(s.x, s.y + 20, r.C.lime, 6, 120); if (ufo.hp <= 0) { const pts = 100 * L; r.addScore(pts); r.pop(`העב"ם הופל! +${pts} 🛸`, ufo.x, ufo.y, r.C.gold, 24); r.burst(ufo.x, ufo.y, r.C.lime, 40, 300); booms.push({ x: ufo.x, y: ufo.y, r: 20, t: .6, max: 90 }); stars.push({ x: ufo.x, y: ufo.y, kind: Math.random() < .5 ? 'star' : 'shield', vy: 80 }); ufo = null; ufoT = r.rnd(16, 24); r.sfx('win'); } continue; }
          const i = rocks.findIndex(k => r.dist(k.x, k.y, s.x, s.y) < k.s + 4); if (i >= 0) { const k = rocks[i]; hits++; const pts = Math.round(k.s) * L * (k.kind === 'comet' ? 3 : k.kind === 'bug' ? 5 : k.kind === 'mine' ? 2 : 1); r.addScore(pts); r.pop('+' + pts, k.x, k.y - k.s - 6, '#fff', 14); r.burst(k.x, k.y, k.kind === 'comet' ? '#67e8f9' : k.kind === 'bug' ? r.C.lime : '#A8A29E', 6, 160); r.explode(k.x, k.y, Math.max(24, k.s * 1.6), 3); r.sfx('boom'); if (k.kind === 'mine') shatter(k); else if (k.kind === 'rock' && k.s > 22) { rocks.push({ x: k.x - 10, y: k.y, s: k.s / 2, vy: k.vy, vx: k.vx - 60, rot: 0, vr: 3, seed: k.seed + 1 }, { x: k.x + 10, y: k.y, s: k.s / 2, vy: k.vy, vx: k.vx + 60, rot: 0, vr: -3, seed: k.seed + 2 }); } rocks.splice(i, 1); s.y = -20; if (hits === 10) { r.pop('ירייה כפולה נפתחה! ⚡', r.W / 2, 200, r.C.gold, 22); r.sfx('win'); } } }
        for (const s of stars) if (r.dist(s.x, s.y, px, py) < 26) { s.got = true; if (s.kind === 'star') { r.addScore(30 * L); r.pop(`🌟 +${30 * L}`, px, py - 40, r.C.gold, 22); r.sparkle(px, py, 30, 8); r.sfx('ching'); } else { shield = 6; r.pop('מגן! 🛡️', px, py - 40, r.C.sky, 22); r.sfx('score'); } }
        const hitRock = rocks.find(k => r.dist(k.x, k.y, px, py) < k.s + 12); if (hitRock) { if (hitRock.kind === 'mine') shatter(hitRock); const res = loseLife(hitRock); if (res !== undefined) return res; }
        const hitP = eshots.find(e => r.dist(e.x, e.y, px, py) < 16); if (hitP) { eshots = eshots.filter(e => e !== hitP); const res = loseLife(hitP); if (res !== undefined) return res; }
        if (hole && r.dist(hole.x, hole.y, px, py) < 22) { const res = loseLife({ x: px, y: py }); hole = null; holeT = 20; if (res !== undefined) return res; }
        if (Math.floor(alive * 2) !== Math.floor((alive - dt) * 2)) r.addScore(L); },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#05081a'); bg.addColorStop(1, '#0f172a'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); for (let i = 0; i < 40; i++) r.circle((i * 97) % r.W, (i * 173 + alive * (20 + (i % 3) * 15)) % r.H, i % 3 ? 1 : 1.8, `rgba(255,255,255,${.3 + (i % 4) * .15})`);
        const neb = c.createRadialGradient(80, 200, 10, 80, 200, 220); neb.addColorStop(0, 'rgba(139,92,246,.18)'); neb.addColorStop(1, 'rgba(139,92,246,0)'); c.fillStyle = neb; c.fillRect(0, 0, r.W, r.H);
        if (hole) { const k = Math.min(1, hole.t * 2); c.save(); c.translate(hole.x, hole.y); c.rotate(hole.a); const g = c.createRadialGradient(0, 0, 4, 0, 0, 70 * k); g.addColorStop(0, '#000'); g.addColorStop(.35, 'rgba(76,29,149,.9)'); g.addColorStop(.7, 'rgba(139,92,246,.35)'); g.addColorStop(1, 'rgba(139,92,246,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 70 * k, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(196,181,253,.7)'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 0, (30 + i * 14) * k, (12 + i * 6) * k, i * .8, 0, Math.PI * 2); c.stroke(); } r.circle(0, 0, 14 * k, '#000'); c.restore(); }
        rocks.forEach(k => { if (k.kind === 'comet') { c.strokeStyle = 'rgba(103,232,249,.5)'; c.lineWidth = k.s * 1.6; c.lineCap = 'round'; c.beginPath(); k.tail.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); const g = c.createRadialGradient(k.x - 3, k.y - 3, 1, k.x, k.y, k.s); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#67e8f9'); g.addColorStop(1, '#0e7490'); c.fillStyle = g; c.beginPath(); c.arc(k.x, k.y, k.s, 0, Math.PI * 2); c.fill(); }
          else if (k.kind === 'mine') { r.circle(k.x, k.y, k.s, '#1f2937'); c.strokeStyle = '#6b7280'; c.lineWidth = 2; c.beginPath(); c.arc(k.x, k.y, k.s, 0, Math.PI * 2); c.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + k.rot; r.circle(k.x + Math.cos(a) * (k.s + 3), k.y + Math.sin(a) * (k.s + 3), 2.5, '#9ca3af'); } r.circle(k.x, k.y, 5, Math.sin(k.blink * 8) > 0 ? '#ef4444' : '#7f1d1d'); }
          else if (k.kind === 'egg') { SP.rock(r, k.x, k.y, k.s, k.seed, k.rot); c.strokeStyle = k.hatch < 1 ? '#fde047' : '#57534e'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(k.x - 8, k.y - 4); c.lineTo(k.x - 2, k.y + 2); c.lineTo(k.x + 3, k.y - 5); c.lineTo(k.x + 8, k.y + 3); c.stroke(); if (k.hatch < 1) r.text('?', k.x, k.y - k.s - 8, { size: 16, color: '#fde047' }); }
          else if (k.kind === 'bug') { SP.alien(r, k.x, k.y, tt, r.C.lime); r.circle(k.x - 3, k.y - 9, 2, '#ef4444'); r.circle(k.x + 3, k.y - 9, 2, '#ef4444'); }
          else if (!r.img('space/spaceMeteors_00' + (1 + Math.floor(k.seed) % 4), k.x, k.y, k.s * 2.3, null, { rot: k.rot })) SP.rock(r, k.x, k.y, k.s, k.seed, k.rot); });
        if (ufo) { SP.ufo(r, ufo.x, ufo.y, tt, .8, ufo.hurt); r.rect(ufo.x - 30, ufo.y - 42, 60, 5, '#00000066', 2); r.rect(ufo.x - 30, ufo.y - 42, 60 * Math.max(0, ufo.hp) / ufo.maxHp, 5, r.C.lime, 2); }
        eshots.forEach(e => { r.circle(e.x, e.y, 7, 'rgba(163,230,53,.35)'); r.circle(e.x, e.y, 4, '#a3e635'); });
        stars.forEach(s => r.emoji(s.kind === 'star' ? '🌟' : '🛡️', s.x, s.y, 24)); shots.forEach(s => { r.rect(s.x - 2, s.y, 4, 14, r.C.lime); r.circle(s.x, s.y, 3, '#fff'); });
        booms.forEach(b => { const k = 1 - b.t / .8; c.strokeStyle = `rgba(251,146,60,${b.t})`; c.lineWidth = 8; c.beginPath(); c.arc(b.x, b.y, b.r + k * b.max, 0, Math.PI * 2); c.stroke(); });
        if (shield > 0) r.circle(px, py, 30, `rgba(56,189,248,${.15 + Math.sin(alive * 8) * .08})`); if (!(inv > 0 && Math.sin(tt * 30) > 0)) SP.fighter(r, px, py, tt, hits >= 10 ? r.C.gold : r.C.pink, 1, bank);
        // כפתור הפצצה: מתמלא כמו שעון
        r.circle(BOMB.x, BOMB.y, BOMB.r, 'rgba(255,255,255,.1)'); c.strokeStyle = bomb >= 30 ? r.C.gold : '#475569'; c.lineWidth = 4; c.beginPath(); c.arc(BOMB.x, BOMB.y, BOMB.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bomb / 30); c.stroke(); r.emoji('💣', BOMB.x, BOMB.y, bomb >= 30 ? 26 : 20); if (bomb >= 30) r.text('מוכן!', BOMB.x, BOMB.y + 34, { size: 11, color: r.C.gold });
        r.text(`רמה ${level()} · ${'❤️'.repeat(Math.max(0, lives))}${hits >= 10 ? ' · ⚡' : ` · עוד ${10 - hits} לירייה כפולה`}`, r.W / 2 - 30, r.H - 12, { size: 13, color: r.C.muted }); if (levelT > 0) r.text(`רמה ${level()}`, r.W / 2, 100, { size: 30, color: r.C.gold }); },
    };
  } });

// ---- הפרה המעופפת (במקום ציפור): עוברים בין תחתונים תלויים לאסלות. רבי עם כובע שחור ורשת מנסה לתפוס אותה, צייד זורק עגבניות מרמה 2, ובונוסים מצחיקים בין המכשולים ----
G.push({ id: 'flappy', name: 'הפרה המעופפת', emoji: '🐄', assets: ['bg/mountain1', 'bg/mountain2', 'bg/hills1', 'bg/cloud1', 'bg/cloud2', 'bg/cloud3', 'bg/tree02', 'bg/tree05'], how: 'נוגעים כדי שהפרה תעוף למעלה. עוברים בין התחתונים לאסלות בלי לגעת. כשהרבי רץ עם הרשת, עפים גבוה! מרמה 2 מישהו זורק עגבניות. אוספים בונוסים מצחיקים.',
  make(r) {
    const BON = [['🍕', 20, 'פיצה מעופפת!'], ['🦆', 15, 'ברווז גומי!'], ['🧻', 30, 'נייר טואלט מזהב!'], ['🍔', 20, 'המבורגר באוויר!'], ['🧦', 25, 'גרב מסריח!'], ['🍩', 20, 'דונאט!']];
    let y = r.H / 2, vy = 0, obs = [], t = 1.0, gap = 190, tt = 0, passed = 0, started = false, farmer = null, farmerT = r.rnd(5, 8), items = [], warnT = 0, hunter = null, hunterT = 9, shots = [], levelT = 0, lives = 3;
    const crash = msg => { lives--; if (lives <= 0) return r.over(msg); r.pop(`${msg} נשארו ${lives} ❤️`, r.W / 2, r.H / 2 - 60, '#fff', 20); r.sfx('over'); y = r.H / 2; vy = 0; started = false; obs = obs.filter(p => p.x > 200); shots = []; farmer = null; hunter = null; };
    const level = () => Math.floor(passed / 5); // כל 5 מכשולים רמה: מהיר יותר, מרווח קטן יותר, ניקוד גבוה יותר
    const GY = r.H - 24;
    return {
      tap() { started = true; vy = -280; r.sfx('jump'); r.puff(70, y + 18, 20, 2); }, down() { started = true; vy = -280; r.puff(70, y + 18, 20, 2); },
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
      draw() { const g = r.ctx.createLinearGradient(0, 0, 0, r.H); g.addColorStop(0, '#7DD3FC'); g.addColorStop(1, '#e0f2fe'); r.ctx.fillStyle = g; r.ctx.fillRect(0, 0, r.W, r.H); for (let i = 0; i < 3; i++) if (!r.img('bg/cloud' + (1 + i), ((i * 150 + 100 - tt * (18 + i * 6)) % (r.W + 200) + r.W + 200) % (r.W + 200) - 100, 70 + i * 55, 130, null, { tint: '#ffffff', alpha: .9 })) SP.cloud(r, 60 - (tt * 30) % 420 + 200, 80, 1); const m1 = (tt * 12) % 520; for (let i = -1; i < 2; i++) { r.img('bg/mountain1', i * 520 - m1 + 120, GY + 2, 200, null, { ay: 1, tint: '#a5b4fc' }); r.img('bg/mountain2', i * 520 - m1 + 380, GY + 2, 170, null, { ay: 1, tint: '#a5b4fc' }); } const h1 = (tt * 30) % 700; for (let i = -1; i < 2; i++) r.img('bg/hills1', i * 700 - h1 + 350, GY + 4, 700, null, { ay: 1, tint: '#86efac' }); const t1 = (tt * 60) % 300; for (let i = -1; i < 3; i++) r.img(i % 2 ? 'bg/tree02' : 'bg/tree05', i * 300 - t1 + 150, GY + 6, null, 80, { ay: 1, tint: '#15803d' }); r.rect(0, GY, r.W, 24, '#84CC16'); r.rect(0, GY, r.W, 5, '#65a30d');
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

export default G;

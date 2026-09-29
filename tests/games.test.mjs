import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_GROUPS, pickGift, gameById } from '../workout/js/games/index.js';
import { POSE, GK, S, KITS, player, crowd, crowdGen } from '../workout/js/games/sprites.js';

// קונטקסט קנבס מדומה: כל פונקציה היא noop, גרדיאנטים מחזירים אובייקט עם addColorStop
const fakeCtx = () => { const noop = () => {}; const grad = () => ({ addColorStop: noop }); return new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : /Gradient$/.test(k) ? grad : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } }); };

test('catalog: 50 or more games, unique ids, all fields', () => {
  assert.ok(GAMES.length >= 50, 'games: ' + GAMES.length);
  assert.equal(new Set(GAMES.map(g => g.id)).size, GAMES.length);
  for (const g of GAMES) {
    assert.ok(g.name && g.emoji && g.how && typeof g.make === 'function', g.id);
    assert.ok(!/[؀-ۿ]/.test(g.name + g.how), g.id);
  }
  assert.equal(GAME_GROUPS.length, 4);
});

test('pickGift prefers unplayed games and avoids recent ones', () => {
  const played = Object.fromEntries(GAMES.slice(1).map(g => [g.id, 1]));
  for (let i = 0; i < 20; i++) assert.equal(pickGift(played, []).id, GAMES[0].id);
  const recent = [GAMES[0].id];
  for (let i = 0; i < 20; i++) assert.notEqual(pickGift(played, recent).id, GAMES[0].id);
  assert.ok(gameById.tetris && gameById.pinball);
});

// מריצים כל משחק על "רנטיים" מדומה: יצירה, כמה עדכונים, ציור וקלט, בלי שגיאות
test('every game runs headless: make, update, draw, input', () => {
  const noop = () => {};
  const ctx = fakeCtx();
  const mk = () => {
    let score = 0, overs = 0;
    const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false, pointers: {}, img: () => false, imgPattern: () => false, imgSize: () => null, explode: () => {}, sparkle: () => {}, puff: () => {}, music: () => {},
      rnd: (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a), rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[Math.floor(Math.random() * a.length)],
      shuffle: a => [...a].sort(() => Math.random() - .5), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      get score() { return score; }, get timeLeft() { return 60; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: () => { overs++; }, win: () => {},
      clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop, sfx: noop, play: noop, pop: noop, burst: noop, shake: noop, stick: noop, player: noop, crowd: noop, crowdGen: () => [], anim: (frames) => frames[0][0],
      hit: (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by, dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) };
    return r;
  };
  for (const g of GAMES) {
    const r = mk();
    const game = g.make(r, { level: 3, wave: 3 }); // גם עם התקדמות שמורה
    if (game.save) assert.ok(typeof game.save() === 'object', g.id + ' save');
    if (game.revive) game.revive();
    for (let i = 0; i < 400; i++) {
      game.update && game.update(1 / 60);
      game.draw && game.draw();
      if (i % 37 === 0) { const x = Math.random() * 360, y = Math.random() * 560; game.down && game.down(x, y); game.move && game.move(x + 5, y + 5); game.up && game.up(x + 5, y + 5); game.tap && game.tap(x, y); }
      if (i % 53 === 0 && game.swipe) game.swipe(['left', 'right', 'up', 'down'][i % 4], 30, -30);
    }
    assert.ok(true, g.id);
  }
});

test('demos: every scripted demo drives its game headless without errors', async () => {
  const { DEMOS } = await import('../workout/js/games/demos.js');
  const noop = () => {}; const ctx = fakeCtx();
  for (const id of Object.keys(DEMOS)) {
    const g = gameById[id]; assert.ok(g && g.demo, id);
    let score = 0; const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false, pointers: {}, img: () => false, imgPattern: () => false, imgSize: () => null, explode: () => {}, sparkle: () => {}, puff: () => {}, music: () => {}, rnd: (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a), rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[Math.floor(Math.random() * a.length)], shuffle: a => a, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), get score() { return score; }, get timeLeft() { return 60; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: noop, win: noop, clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop, sfx: noop, play: noop, pop: noop, burst: noop, shake: noop, stick: noop, player: noop, crowd: noop, crowdGen: () => [], anim: f => f[0][0], hit: (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by, dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) };
    const game = g.make(r); assert.equal(typeof game.peek, 'function', id + ' peek');
    const ctl = { mem: {}, say: noop, tap: (x, y) => { game.down && game.down(x, y); game.up && game.up(x, y); game.tap && game.tap(x, y); }, swipe: d => game.swipe && game.swipe(d, 0, 0), moveTo: (x, y) => game.move && game.move(x, y), release: noop };
    for (let i = 0; i < 600; i++) { const t = i / 50; g.demo(t, game, ctl, r); game.update(1 / 50); game.draw(); }
  }
});

test('sprites: every pose has all joints; every sprite draws on a fake context', () => {
  const J = ['head', 'neck', 'hip', 'le', 'lh', 're', 'rh', 'lk', 'lf', 'rk', 'rf'];
  for (const [k, v] of Object.entries({ ...POSE, ...GK })) { const pose = Array.isArray(v) ? v[0][0] : v; for (const j of J) assert.ok(Array.isArray(pose[j]) && pose[j].length === 2, k + '.' + j); }
  const noop = () => {};
  const ctx = fakeCtx();
  const r = { ctx, rect: noop, circle: noop, line: noop, text: noop, emoji: noop };
  for (const [name, fn] of Object.entries(S)) { if (['player', 'crowd', 'fighter', 'ufo'].includes(name)) continue; fn(r, 100, 100, 20, 20, '#000', 1); assert.ok(true, name); }
  S.fighter(r, 100, 100, 1, '#38BDF8', 1); S.ufo(r, 100, 100, 1, 1.2, .1); S.rock(r, 100, 100, 20, 3, .5);
  S.face(r, 100, 100, 14, [1, 0], 1, null); S.face(r, 100, 100, 14, [0, 1], 0, null); S.cow(r, 80, 100, 1, 2); S.poop(r, 50, 50, 1); S.pouch(r, 50, 50, 1, 1); S.burger(r, 50, 50, 1, 1); S.toilet(r, 10, 10, 56, 100); S.underpants(r, 10, 0, 56, 100); for (const v of [20, 50, 100, 200]) S.banknote(r, 50, 50, v, .1, 1);
});

test('player renderer and crowd draw for every pose and kit on a fake context', () => {
  const ctx = fakeCtx();
  for (const pose of Object.values({ ...POSE, ...GK }).map(v => Array.isArray(v) ? v[0][0] : v)) for (const kit of Object.values(KITS)) { player(ctx, pose, 100, 100, 0.5, kit); player(ctx, pose, 100, 100, 0.5, kit, { flip: true, happy: false }); }
  const fans = crowdGen(10, 360, 2); assert.equal(fans.length, 20); crowd(ctx, fans, 1, true); crowd(ctx, fans, 2, false);
});

test('celebration module: scenes exist and setup/draw run on a fake canvas', async () => {
  const { SCENE_IDS, celebrate, renderStill, STILL_T } = await import('../workout/js/games/celebrate.js');
  assert.deepEqual(SCENE_IDS, ['goal', 'header', 'dunk', 'three', 'sprint']);
  assert.equal(typeof celebrate, 'function');
  // כל סצנה מציירת פריים בודד על קנבס מדומה, בלי שגיאות
  const canvas = { width: 360, height: 560, getContext: () => fakeCtx() };
  for (const id of SCENE_IDS) { assert.ok(STILL_T[id] > 0, id); renderStill(canvas, id, STILL_T[id]); renderStill(canvas, id, 6); }
});

// הוקי מול טלפון אחר: מארח ואורח מדומים מחליפים הודעות דרך "רשת" בזיכרון; האורח רואה את הדיסקית במראה, שער של האורח מעלה לו ניקוד
test('online hockey: host simulates, guest mirrors, goals and end propagate', () => {
  const noop = () => {}; const ctx = fakeCtx();
  const mkR = (net) => { let score = 0; const ev = { over: 0, win: 0 }; const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false, pointers: {}, img: () => false, imgPattern: () => false, imgSize: () => null, explode: () => {}, sparkle: () => {}, puff: () => {}, music: () => {}, net, netMsg: null, rnd: (a = 1, b) => b == null ? a / 2 : (a + b) / 2, /* דטרמיניסטי: הדיסקית יורדת ישר */ rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[0], shuffle: a => a, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), get score() { return score; }, get timeLeft() { return 0; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: () => { ev.over++; }, win: () => { ev.win++; }, clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop, sfx: noop, play: noop, pop: noop, burst: noop, shake: noop, stick: noop, player: noop, crowd: noop, crowdGen: () => [], anim: f => f[0][0], hit: () => false, dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) }; r.ev = ev; return r; };
  const wire = { host: null, guest: null }; const mkNet = role => ({ role, alive: () => true, send(t, p) { const other = role === 'host' ? wire.guest : wire.host; if (other && other.netMsg) other.netMsg(t, JSON.parse(JSON.stringify(p))); }, close: noop });
  const H = mkR(mkNet('host')), G = mkR(mkNet('guest')); wire.host = H; wire.guest = G;
  const pong = gameById.pong; const h = pong.make(H, null), g = pong.make(G, null);
  assert.equal(h.save(), null, 'no level saved online');
  // האורח מזיז אצבע לימין למטה; המארח צריך לראות את המחבט שלו למעלה משמאל (מראה)
  G.pointers = { 1: { x: 300, y: 500 } };
  for (let i = 0; i < 40; i++) { h.update(1 / 30); g.update(1 / 30); }
  h.draw(); g.draw();
  assert.ok(H.score >= 0 && G.score >= 0);
  // מזרימים דיסקית לשער העליון של המארח (= שער לאורח) שלוש פעמים דרך העדכונים
  H.pointers = { 1: { x: 30, y: 540 } }; /* המארח מזיז את המחבט לפינה, הדיסקית נכנסת לשער שלו */
  G.pointers = { 1: { x: 180, y: 296 } }; /* האורח נוגע בדיסקית שמחכה באמצע ובועט אותה לשער המארח */
  let guestGoals = 0; const origMsg = G.netMsg; G.netMsg = (t, p) => { if (t === 'st') guestGoals = p.s[1]; origMsg(t, p); };
  for (let goal = 0; goal < 3; goal++) { let n = 0; while (n++ < 4000) { h.update(1 / 60); g.update(1 / 60); if (guestGoals > goal || G.ev.win) break; } }
  assert.ok(G.ev.win === 1 && H.ev.over === 1 && G.score > 0, `guest goals ${guestGoals}, host over ${H.ev.over}, guest win ${G.ev.win}`);
});

// הוקי נגד המחשב: הדיסקית לא נתקעת (רועי, 29/09: המחשב הלך אחורה ונתקע, הכדור נתקע מאחוריו): בסימולציה ארוכה עם שחקן שעומד בפינה, הדיסקית לא עומדת יותר מ-2.5 שניות
test('hockey vs computer: puck never stays stuck, computer mallet stays on the table', () => {
  const noop = () => {}; const ctx = fakeCtx(); let score = 0;
  const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false, pointers: { 1: { x: 20, y: 540 } }, img: () => false, imgPattern: () => false, imgSize: () => null, explode: () => {}, sparkle: () => {}, puff: () => {}, music: () => {}, net: null, rnd: (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a), rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[0], shuffle: a => a, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), get score() { return score; }, get timeLeft() { return 0; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: noop, win: noop, clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop, sfx: noop, play: noop, pop: noop, burst: noop, shake: noop, stick: noop, player: noop, crowd: noop, crowdGen: () => [], anim: f => f[0][0], hit: () => false, dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) };
  const g = gameById.pong.make(r, null); g.down(180, 420); /* נגד המחשב */
  let still = 0, maxStill = 0, offTable = 0;
  for (let i = 0; i < 60 * 120; i++) { g.update(1 / 60); const P = g.peek(); const sp = Math.hypot(P.puck.vx, P.puck.vy); if (sp < 25 && P.puck.y > 0 && P.puck.y < 560) still += 1 / 60; else still = 0; maxStill = Math.max(maxStill, still); if (P.ai.x < 26 - 1 || P.ai.x > 360 - 26 + 1) offTable++; if (i % 600 === 0) r.pointers = { 1: { x: [20, 340, 180][(i / 600) % 3], y: 540 } }; }
  assert.ok(maxStill < 4, `puck stood still ${maxStill.toFixed(1)}s`); /* הדיסקית מחכה באמצע עד 2.5 שניות ואז המחשב בא לבעוט; אחרי בעיטה, תקיעה של 2 שניות = חזרה לאמצע */ assert.equal(offTable, 0);
});

// כיפת ברזל ואסטרואידים: סימולציה ארוכה ברמות גבוהות מפעילה את כל הסוגים (בוסים, שביטים, מוקשים, ביצים, עב"ם, חור שחור) בלי שגיאות
test('iron dome and asteroids: long simulation at high level runs all enemy kinds without errors', () => {
  const noop = () => {}; const ctx = fakeCtx();
  const mkR = () => { let score = 0; const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false, pointers: {}, img: () => false, imgPattern: () => false, imgSize: () => null, explode: () => {}, sparkle: () => {}, puff: () => {}, music: () => {}, net: null, rnd: (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a), rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[Math.floor(Math.random() * a.length)], shuffle: a => a, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), get score() { return score; }, get timeLeft() { return 0; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: () => { r.overs = (r.overs || 0) + 1; }, win: () => { r.wins = (r.wins || 0) + 1; }, clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop, sfx: noop, play: noop, pop: noop, burst: noop, shake: noop, stick: noop, player: noop, crowd: noop, crowdGen: () => [], anim: f => f[0][0], hit: () => false, dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) }; return r; };
  for (const [id, prog] of [['invaders', { wave: 2 }], ['invaders', { wave: 5 }], ['asteroids', { level: 4 }], ['asteroids', { level: 6 }]]) {
    const r = mkR(); const g = gameById[id].make(r, prog); let kinds = new Set();
    for (let i = 0; i < 60 * 150; i++) { const x = 180 + Math.sin(i / 40) * 150; g.move(x, 450); if (i % 20 === 0 && g.tap) g.tap(x, 450); g.update(1 / 60); if (i % 5 === 0) g.draw(); const P = g.peek(); (P.enemies || P.rocks || []).forEach(e => kinds.add(e.kind)); if (P.boss) kinds.add('boss:' + P.boss.kind); if (P.ufo) kinds.add('ufo'); if (P.hole) kinds.add('hole'); if (r.overs) { g.revive(); r.overs = 0; } }
    if (id === 'asteroids') { assert.ok(kinds.has('comet') && kinds.has('mine') && kinds.has('egg') && kinds.has('ufo') && kinds.has('hole'), `asteroids kinds seen: ${[...kinds].join(',')}`); }
    else assert.ok(kinds.has('rocket') && kinds.has('drone'), `iron dome kinds: ${[...kinds].join(',')}`);
    assert.equal(g.save() && typeof g.save(), 'object');
  }
});

// מבוך הנקודות: כל מפה מחוברת (מכל נקודה מגיעים לכל נקודה), יש בית רוחות, 4 גלולות, ומעבר צדדי בשורה אחת לפחות
test('dots-maze: every maze is connected, has a ghost gate, 4 power pellets and a side tunnel', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../workout/js/games/arcade2.js', import.meta.url), 'utf8'));
  const start = src.indexOf('const MAZES = [') + 'const MAZES = '.length; const block = src.slice(start, src.indexOf('];', start) + 1);
  const MAZES = eval('(' + block + ')');
  assert.ok(MAZES.length >= 6);
  for (const M of MAZES) {
    assert.equal(M.length, 13); M.forEach(row => assert.equal(row.length, 11));
    const cells = []; M.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '#' && ch !== 'g') cells.push([x, y]); })); /* g = בית הרוחות, סגור בכוונה */
    const key = (x, y) => x + ',' + y, all = new Set(cells.map(([x, y]) => key(x, y)));
    const seen = new Set([key(...cells[0])]), q = [cells[0]];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = ((x + dx) % 11 + 11) % 11, ny = y + dy; const k = key(nx, ny); if (all.has(k) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
    assert.equal(seen.size, all.size, 'maze not connected:\n' + M.join('\n'));
    assert.equal(M.join('').split('g').length - 1, 1); assert.equal(M.join('').split('O').length - 1, 4);
    assert.ok(M.some(row => row[0] !== '#' && row[10] !== '#'), 'no side tunnel');
  }
});

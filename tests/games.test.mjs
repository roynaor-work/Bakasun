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
    const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false,
      rnd: (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a), rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[Math.floor(Math.random() * a.length)],
      shuffle: a => [...a].sort(() => Math.random() - .5), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      get score() { return score; }, get timeLeft() { return 60; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: () => { overs++; }, win: () => {},
      clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop, sfx: noop, pop: noop, burst: noop, shake: noop, stick: noop, player: noop, crowd: noop, crowdGen: () => [], anim: (frames) => frames[0][0],
      hit: (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by, dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) };
    return r;
  };
  for (const g of GAMES) {
    const r = mk();
    const game = g.make(r);
    for (let i = 0; i < 400; i++) {
      game.update && game.update(1 / 60);
      game.draw && game.draw();
      if (i % 37 === 0) { const x = Math.random() * 360, y = Math.random() * 560; game.down && game.down(x, y); game.move && game.move(x + 5, y + 5); game.up && game.up(x + 5, y + 5); game.tap && game.tap(x, y); }
      if (i % 53 === 0 && game.swipe) game.swipe(['left', 'right', 'up', 'down'][i % 4], 30, -30);
    }
    assert.ok(true, g.id);
  }
});

test('sprites: every pose has all joints; every sprite draws on a fake context', () => {
  const J = ['head', 'neck', 'hip', 'le', 'lh', 're', 'rh', 'lk', 'lf', 'rk', 'rf'];
  for (const [k, v] of Object.entries({ ...POSE, ...GK })) { const pose = Array.isArray(v) ? v[0][0] : v; for (const j of J) assert.ok(Array.isArray(pose[j]) && pose[j].length === 2, k + '.' + j); }
  const noop = () => {};
  const ctx = fakeCtx();
  const r = { ctx, rect: noop, circle: noop, line: noop, text: noop, emoji: noop };
  for (const [name, fn] of Object.entries(S)) { if (name === 'player' || name === 'crowd') continue; fn(r, 100, 100, 20, 20, '#000', 1); assert.ok(true, name); }
  S.face(r, 100, 100, 14, [1, 0], 1, null); S.face(r, 100, 100, 14, [0, 1], 0, null); S.cow(r, 80, 100, 1, 2); S.poop(r, 50, 50, 1); S.pouch(r, 50, 50, 1, 1); S.toilet(r, 10, 10, 56, 100); S.underpants(r, 10, 0, 56, 100); for (const v of [20, 50, 100, 200]) S.banknote(r, 50, 50, v, .1, 1);
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_GROUPS, pickGift, gameById } from '../workout/js/games/index.js';

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
  const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const mk = () => {
    let score = 0, overs = 0;
    const r = { W: 360, H: 560, ctx, C: new Proxy({}, { get: () => '#000' }), px: 100, py: 100, isDown: false,
      rnd: (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a), rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[Math.floor(Math.random() * a.length)],
      shuffle: a => [...a].sort(() => Math.random() - .5), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      get score() { return score; }, get timeLeft() { return 60; }, addScore: n => { score += n; }, setScore: n => { score = n; }, over: () => { overs++; }, win: () => {},
      clear: noop, rect: noop, circle: noop, line: noop, text: noop, emoji: noop,
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

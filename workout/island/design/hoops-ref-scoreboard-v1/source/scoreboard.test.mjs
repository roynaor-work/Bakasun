import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, formatScoreboard } from '../runtime/scoreboard.mjs';

const close = (actual, expected, message = '') => {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
};

test('the review scene starts paused and exposes independent score and period state', () => {
  const clock = createClock();
  const state = clock.snapshot();
  assert.equal(state.home, 72);
  assert.equal(state.away, 68);
  assert.equal(state.period, 4);
  assert.equal(state.gameSeconds, 134);
  assert.equal(state.shotSeconds, 24);
  assert.equal(state.running, false);
  clock.tick(5);
  assert.equal(clock.snapshot().gameSeconds, 134);
  assert.equal(clock.snapshot().shotSeconds, 24);
});

test('countdown is independent of render cadence and ignores invalid elapsed time', () => {
  const single = createClock({ gameSeconds: 120, shotSeconds: 24, running: true });
  const many = createClock({ gameSeconds: 120, shotSeconds: 24, running: true });
  single.tick(10);
  for (let i = 0; i < 300; i++) many.tick(1 / 30);
  close(many.snapshot().gameSeconds, single.snapshot().gameSeconds, 'game');
  close(many.snapshot().shotSeconds, single.snapshot().shotSeconds, 'shot');
  const before = single.snapshot();
  for (const delta of [-1, NaN, Infinity, -Infinity]) single.tick(delta);
  assert.deepEqual(single.snapshot(), before);
});

test('pause and resume do not count time while paused', () => {
  const clock = createClock({ gameSeconds: 40, shotSeconds: 20 });
  clock.start();
  clock.tick(3);
  clock.pause();
  clock.tick(30);
  close(clock.snapshot().gameSeconds, 37);
  close(clock.snapshot().shotSeconds, 17);
  clock.start();
  clock.tick(2);
  close(clock.snapshot().gameSeconds, 35);
  close(clock.snapshot().shotSeconds, 15);
});

test('a shot-clock violation stops the game at the exact deadline and signals once', () => {
  const events = [];
  const clock = createClock({ gameSeconds: 90, shotSeconds: 1, running: true }, e => events.push(e));
  clock.tick(1.25);
  const state = clock.snapshot();
  close(state.gameSeconds, 89);
  close(state.shotSeconds, 0);
  close(state.redRemaining, 1.75);
  assert.equal(state.running, false);
  assert.equal(state.lastEvent, 'shot-clock-expired');
  assert.equal(events.length, 1);
  clock.tick(4);
  clock.start();
  clock.tick(1);
  assert.equal(clock.snapshot().running, false);
  close(clock.snapshot().gameSeconds, 89);
  close(clock.snapshot().redRemaining, 0);
  assert.equal(events.length, 1);
});

test('game expiration leaves the shot clock at its remaining value', () => {
  const clock = createClock({ gameSeconds: 0.5, shotSeconds: 10, running: true });
  clock.tick(1);
  const state = clock.snapshot();
  close(state.gameSeconds, 0);
  close(state.shotSeconds, 9.5);
  close(state.redRemaining, 1.5);
  assert.equal(state.lastEvent, 'game-clock-expired');
  assert.equal(state.running, false);
});

test('when one frame crosses both deadlines the earlier clock determines the result', () => {
  const gameFirst = createClock({ gameSeconds: 1, shotSeconds: 2, running: true });
  const shotFirst = createClock({ gameSeconds: 2, shotSeconds: 1, running: true });
  gameFirst.tick(3);
  shotFirst.tick(3);
  assert.equal(gameFirst.snapshot().lastEvent, 'game-clock-expired');
  close(gameFirst.snapshot().shotSeconds, 1);
  assert.equal(shotFirst.snapshot().lastEvent, 'shot-clock-expired');
  close(shotFirst.snapshot().gameSeconds, 1);
  assert.equal(gameFirst.snapshot().running, false);
  assert.equal(shotFirst.snapshot().running, false);
});

test('a simultaneous game and shot deadline gives priority to the game horn', () => {
  const events = [];
  const clock = createClock({ gameSeconds: 1, shotSeconds: 1, running: true }, e => events.push(e));
  clock.tick(1);
  const state = clock.snapshot();
  close(state.gameSeconds, 0);
  close(state.shotSeconds, 0);
  assert.equal(state.lastEvent, 'game-clock-expired');
  assert.equal(events.length, 1);
});

test('shot resets support 14 and 24 seconds without changing the game time', () => {
  const clock = createClock({ gameSeconds: 120, shotSeconds: 10, running: true });
  clock.tick(2);
  clock.resetShot(14);
  assert.equal(clock.snapshot().shotSeconds, 14);
  assert.equal(clock.snapshot().gameSeconds, 118);
  assert.equal(clock.snapshot().running, true);
  clock.tick(1);
  clock.resetShot(24);
  assert.equal(clock.snapshot().shotSeconds, 24);
  assert.equal(clock.snapshot().gameSeconds, 117);
  assert.equal(clock.snapshot().running, true);
});

test('a shot reset clears the violation and red lamp before play can resume', () => {
  const clock = createClock({ gameSeconds: 120, shotSeconds: 0.5, running: true });
  clock.tick(0.5);
  assert.equal(clock.snapshot().lastEvent, 'shot-clock-expired');
  clock.resetShot(24);
  const state = clock.snapshot();
  assert.equal(state.shotSeconds, 24);
  assert.ok(!state.lastEvent);
  assert.equal(state.redRemaining, 0);
  assert.equal(state.running, false);
  clock.start();
  clock.tick(1);
  close(clock.snapshot().gameSeconds, 118.5);
  close(clock.snapshot().shotSeconds, 23);
});

test('game reset pauses the countdown and retains score and period', () => {
  const clock = createClock({ home: 12, away: 9, period: 2, gameSeconds: 120, running: true });
  clock.resetGame(600);
  const state = clock.snapshot();
  assert.equal(state.gameSeconds, 600);
  assert.equal(state.running, false);
  assert.equal(state.home, 12);
  assert.equal(state.away, 9);
  assert.equal(state.period, 2);
});

test('manual red-light preview expires while the clocks remain paused', () => {
  const clock = createClock();
  clock.flashRed(2);
  clock.tick(0.75);
  close(clock.snapshot().redRemaining, 1.25);
  close(clock.snapshot().gameSeconds, 134);
  close(clock.snapshot().shotSeconds, 24);
  clock.tick(20);
  close(clock.snapshot().redRemaining, 0);
});

test('out-of-range state cannot overflow digit capacity or start a zero clock', () => {
  const clock = createClock();
  clock.setState({ home: -10, away: 1200, period: 12, gameSeconds: -1, shotSeconds: 120, running: true });
  const state = clock.snapshot();
  assert.equal(state.home, 0);
  assert.equal(state.away, 999);
  assert.equal(state.period, 9);
  assert.equal(state.gameSeconds, 0);
  assert.equal(state.shotSeconds, 99);
  assert.equal(state.running, false);
  clock.setState({ period: -1, gameSeconds: 7000, shotSeconds: 0 });
  assert.equal(clock.snapshot().period, 1);
  assert.equal(clock.snapshot().gameSeconds, 5999);
  clock.start();
  assert.equal(clock.snapshot().running, false);
});

test('snapshots are detached values and cannot mutate clock state', () => {
  const clock = createClock();
  const snapshot = clock.snapshot();
  snapshot.home = 999;
  snapshot.gameSeconds = 0;
  snapshot.running = true;
  assert.equal(clock.snapshot().home, 72);
  assert.equal(clock.snapshot().gameSeconds, 134);
  assert.equal(clock.snapshot().running, false);
});

test('fractional final seconds display one until expiration and fit the GLB digit slots', () => {
  const clock = createClock({ home: 8, away: 123, period: 9, gameSeconds: 0.001, shotSeconds: 0.001 });
  const shown = formatScoreboard(clock.snapshot());
  assert.equal(shown.home, '008');
  assert.equal(shown.away, '123');
  assert.equal(shown.game, '00:01');
  assert.equal(shown.shot, '01');
  assert.equal(Object.keys(shown.digits).length, 13);
  assert.deepEqual(Object.values(shown.digits).filter(value => !Number.isInteger(value) || value < 0 || value > 9), []);
  clock.setState({ gameSeconds: 5999, shotSeconds: 99 });
  assert.equal(formatScoreboard(clock.snapshot()).game, '99:59');
  clock.setState({ gameSeconds: 0, shotSeconds: 0 });
  assert.equal(formatScoreboard(clock.snapshot()).game, '00:00');
  assert.equal(formatScoreboard(clock.snapshot()).shot, '00');
});

test('non-finite state and numeric strings cannot corrupt the visible display', () => {
  const clock = createClock();
  const before = clock.snapshot();
  clock.setState({ home: NaN, away: Infinity, period: '9', gameSeconds: '0', shotSeconds: undefined });
  assert.deepEqual(clock.snapshot(), before);
});

test('disposed clocks stop ticking and ignore later commands', () => {
  const clock = createClock({ gameSeconds: 120, shotSeconds: 24, running: true });
  clock.tick(1);
  clock.dispose();
  const before = clock.snapshot();
  clock.start();
  clock.tick(5);
  clock.setState({ home: 999, gameSeconds: 1 });
  clock.resetShot(14);
  clock.resetGame(600);
  clock.flashRed(2);
  assert.deepEqual(clock.snapshot(), before);
});

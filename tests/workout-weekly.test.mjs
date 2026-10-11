import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { normalizePlan, validatePlan, weekStart, reportSessions, weeklyReport } from '../workout/js/weekly.js';
import { DEFAULT_PLAN, programById } from '../workout/js/programs.js';
import { dayKey, todayProgram } from '../workout/js/logic.js';
import { APP_VERSION } from '../workout/js/camera-session.mjs';

const date = (day, hour = 12) => new Date(2026, 9, day, hour);
const item = (done, target = 10) => ({ exId: 'squats', name: 'סקוואט', type: 'reps', done, target });
const session = (id, day, items = [item(10)], extra = {}) => ({ id, date: date(day).toISOString(), items, duration: 60, ...extra });

test('legacy plans keep valid choices and rest days, and fill missing or unknown choices', () => {
  assert.deepEqual(normalizePlan(null, programById, DEFAULT_PLAN), DEFAULT_PLAN);
  const legacy = { 0: 'quick', 1: '', 2: 'removed-program', 3: '__proto__', 4: 12 };
  const before = structuredClone(legacy);
  const plan = normalizePlan(legacy, programById, DEFAULT_PLAN);
  assert.equal(plan[0], 'quick'); assert.equal(plan[1], '');
  for (let day = 2; day < 7; day++) assert.equal(plan[day], DEFAULT_PLAN[day]);
  assert.deepEqual(legacy, before);
  assert.equal(todayProgram(plan, date(4)), 'quick');
  assert.equal(todayProgram(plan, date(5)), '');
});

test('only complete seven-day plans containing known programs or rest can be saved', () => {
  assert.deepEqual(validatePlan(DEFAULT_PLAN, programById), DEFAULT_PLAN);
  const rest = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, '']));
  assert.deepEqual(validatePlan(rest, programById), rest);
  for (const plan of [null, {}, Object.create(DEFAULT_PLAN), { ...DEFAULT_PLAN, 0: 'unknown' }, { ...DEFAULT_PLAN, 0: 'toString' }, { ...DEFAULT_PLAN, 0: 0 }]) {
    assert.equal(validatePlan(plan, programById), null);
  }
});

test('a saved plan survives reload without changing previous sessions, belts, rewards or the shared choice', async () => {
  const old = { profile: { plan: { 0: 'quick', 1: '' }, level: 'easy', ratioV2: true, noTimerV1: true },
    sessions: [session('old', 3)], tokens: 4, parent: { pinHash: 'synthetic-hash', together: { mode: 'workout', programId: 'full' } },
    games: { resetV: 2, bests: { snake: 42 }, played: {}, recent: [], count: 1 } };
  let raw = JSON.stringify(old);
  globalThis.localStorage = { getItem: () => raw, setItem: (key, value) => { assert.equal(key, 'kidfit.v1'); raw = value; } };
  try {
    const { store } = await import('../workout/js/store.js?weekly-storage-test');
    assert.equal(normalizePlan(store.profile.plan, programById, DEFAULT_PLAN)[1], '');
    store.setProfile({ plan: validatePlan({ ...DEFAULT_PLAN, 0: '', 1: 'full' }, programById) });
    const reloaded = (await import('../workout/js/store.js?weekly-reload-test')).store;
    assert.equal(reloaded.profile.plan[0], ''); assert.equal(reloaded.profile.plan[1], 'full');
    assert.deepEqual(reloaded.sessions, old.sessions); assert.equal(reloaded.tokens, old.tokens);
    assert.deepEqual(reloaded.parent.together, old.parent.together); assert.equal(reloaded.parent.pinHash, old.parent.pinHash);
    assert.equal(reloaded.games.bests.snake, 42); assert.equal(reloaded.profile.level, 'easy');
  } finally { delete globalThis.localStorage; }
});

test('the report uses Sunday through Saturday, includes multiple workouts and excludes adjacent weeks and future times', () => {
  const sessions = [session('before', 3), session('sun', 4), session('sun-again', 4),
    session('sat', 10), session('next', 11), session('future', 10, [item(10)], { date: date(10, 23).toISOString() }),
    { id: 'invalid', date: '2026-02-30', duration: 900 }, { id: 'bad', date: 'invalid' }];
  const before = JSON.stringify(sessions), report = weeklyReport(sessions, date(7), date(10, 20));
  assert.equal(dayKey(report.start), '2026-10-04'); assert.equal(dayKey(report.end), '2026-10-10');
  assert.equal(report.workouts, 3); assert.equal(report.activeDays, 2); assert.equal(report.minutes, 3);
  assert.equal(report.days[0].workouts, 2); assert.equal(report.days[6].workouts, 1);
  assert.equal(report.days[3].workouts, 0); assert.equal(report.days.length, 7);
  assert.equal(JSON.stringify(sessions), before);
});

test('weekly totals count effort stars, partial work, feedback and shared activities without reading game wins', () => {
  const sessions = [session('partial', 4, [item(1), item(0)], { duration: 90, feedback: 'hard', stars: 3, games: { wins: 99 } }),
    session('full', 5, [item(10), item(10)], { duration: 90, feedback: 'ok', together: { mode: 'workout', programId: 'full' } }),
    session('challenge', 6, [item(1)], { duration: 60, feedback: 'easy', together: { mode: 'challenge', exId: 'squats', target: 10 } }),
    session('rest', 7, [item(0)], { duration: -10, feedback: 'unknown' })];
  const report = weeklyReport(sessions, date(7), date(9));
  assert.equal(report.workouts, 4); assert.equal(report.seconds, 240); assert.equal(report.minutes, 4);
  assert.equal(report.stars, 6); assert.equal(report.tried, 4); assert.equal(report.completed, 2);
  assert.equal(report.together, 2); assert.deepEqual(report.feedback, { easy: 1, ok: 1, hard: 1 });
});

test('cloud and device copies of one workout are counted once and updated cloud feedback is retained', () => {
  const local = [session('same', 4), session('local-only', 5)];
  const feed = [{ id: 'same', payload: { ...local[0], feedback: 'hard' } },
    { id: 'remote', payload: session('payload-id', 6) }, null, { payload: { date: 'invalid' } }];
  const before = JSON.stringify({ local, feed }), merged = reportSessions(local, feed);
  assert.equal(merged.length, 3); assert.equal(merged.find(s => s.id === 'same').feedback, 'hard');
  assert.ok(merged.some(s => s.id === 'remote'));
  const report = weeklyReport(merged, date(7), date(9));
  assert.equal(report.workouts, 3); assert.equal(report.stars, 9); assert.equal(report.feedback.hard, 1);
  assert.equal(JSON.stringify({ local, feed }), before);
});

test('empty and historical weeks have stable zero totals; invalid or future selection returns the current week', () => {
  const empty = weeklyReport([], '2026-09-29', date(9));
  assert.equal(dayKey(empty.start), '2026-09-27'); assert.equal(empty.next, '2026-10-04');
  assert.equal(empty.previous, '2026-09-20'); assert.equal(empty.workouts, 0); assert.equal(empty.stars, 0);
  assert.ok(empty.days.every(day => day.sessions.length === 0));
  for (const selected of ['invalid', '2026-02-30', '2026-12-20']) {
    const report = weeklyReport([], selected, date(9));
    assert.equal(dayKey(report.start), '2026-10-04'); assert.equal(report.next, null);
  }
});

test('calendar weeks cross year and daylight-saving boundaries and date-only values stay on the local day', () => {
  for (const timezone of ['UTC', 'Asia/Jerusalem', 'America/Los_Angeles']) {
    const source = `
      import assert from 'node:assert/strict';
      import { weekStart, weeklyReport } from ${JSON.stringify(new URL('../workout/js/weekly.js', import.meta.url).href)};
      import { dayKey } from ${JSON.stringify(new URL('../workout/js/logic.js', import.meta.url).href)};
      assert.equal(dayKey(weekStart('2027-01-01')), '2026-12-27');
      const year = weeklyReport([], '2027-01-01', new Date(2027, 0, 2, 12));
      assert.equal(dayKey(year.end), '2027-01-02');
      const dst = weeklyReport([{ id: 'sun', date: '2026-03-22' }, { id: 'sat', date: '2026-03-28' },
        { id: 'next', date: '2026-03-29' }], '2026-03-24', new Date(2026, 2, 30, 12));
      assert.equal(dst.workouts, 2); assert.equal(dst.days[0].workouts, 1); assert.equal(dst.days[6].workouts, 1);
      assert.deepEqual(dst.days.map(day => day.key), ['2026-03-22','2026-03-23','2026-03-24','2026-03-25','2026-03-26','2026-03-27','2026-03-28']);
      const midnight = weeklyReport([{ id: 'local-sun', date: '2026-10-03T22:30:00Z' }], '2026-10-04', new Date(2026, 9, 9));
      assert.equal(midnight.workouts, process.env.TZ === 'Asia/Jerusalem' ? 1 : 0);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result.status, 0, timezone + ': ' + result.stderr);
  }
});

test('all app imports and entry assets are versioned, including lazy imports and the three.js loader chain', async () => {
  const version = APP_VERSION;
  // The storage security rollout refreshes only these modules and the entrypoint.
  const privateVideoVersion = '20261011-private-vids-1';
  const expectedVersion = path => /(?:^|\/)(?:app|vids|vids-cloud)\.js(?:\?|$)/.test(path) && !path.includes('voice-rec/') ? privateVideoVersion : version;
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) { await inspect(url); continue; }
      if (!/\.(js|mjs|html)$/.test(entry.name) || ['three.module.min.js', 'character.js'].includes(entry.name)) continue;
      const content = await readFile(url, 'utf8');
      for (const match of content.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g)) {
        if (match[2].startsWith('node:')) continue;
        assert.ok(match[2].endsWith('?v=' + expectedVersion(new URL(match[2], url).pathname)), url.pathname + ': ' + match[2]);
      }
    }
  }
  for (const directory of ['../workout/js/', '../workout/3d/', '../workout/voice-rec/']) await inspect(new URL(directory, import.meta.url));
  for (const path of ['../workout/index.html', '../workout/voice-rec/index.html']) {
    const content = await readFile(new URL(path, import.meta.url), 'utf8');
    for (const match of content.matchAll(/(?:src|href)="([^"\n]+\.(?:js|css)(?:\?[^"\n]+)?)"/g)) {
      assert.ok(match[1].endsWith('?v=' + expectedVersion(new URL(match[1], new URL(path, import.meta.url)).pathname)), path + ': ' + match[1]);
    }
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleTarget, buildItems, summarize, streak, stats, earned, fmtTime, todayProgram, weekDays, suggestLevel } from '../workout/js/logic.js';
import { EXERCISES, byId } from '../workout/js/exercises.js';
import { PROGRAMS, DEFAULT_PLAN, programById } from '../workout/js/programs.js';
import { poseAt, cycleMs, lerpPose } from '../workout/js/figure.js';

test('scaleTarget by level', () => {
  assert.equal(scaleTarget(20, 'normal'), 20);
  assert.equal(scaleTarget(20, 'easy'), 14);
  assert.equal(scaleTarget(20, 'hard'), 27);
  assert.equal(scaleTarget(30, 'easy', 'time'), 20);
  assert.equal(scaleTarget(30, 'hard', 'time'), 40);
  assert.equal(scaleTarget(2, 'easy'), 3);
});

test('buildItems expands blocks, rounds and overrides', () => {
  const jump = programById['jump-a'];
  const items = buildItems(jump, byId, 'normal');
  const main = items.filter(i => i.block === 'האימון');
  assert.equal(main.length, jump.blocks[1].items.length * 2);
  assert.equal(items[0].block, 'חימום'); assert.equal(items.at(-1).block, 'מתיחות');
  assert.equal(main[0].round, 1); assert.equal(main.at(-1).round, 2); assert.equal(main[0].rounds, 2);
  const quick = programById['quick'];
  for (const i of buildItems(quick, byId).filter(i => i.block === 'האימון')) { assert.equal(i.type, 'time'); assert.equal(i.target, 30); }
  // תוכנית בלי בלוקים (אימון חופשי)
  const free = buildItems({ items: ['plank', 'squats'] }, byId, 'easy');
  assert.deepEqual(free.map(i => [i.block, i.target]), [['האימון', 20], ['האימון', 11]]);
});

test('weekly plan: today, week strip, level suggestion', () => {
  const sun = new Date(2026, 8, 27, 9), sat = new Date(2026, 9, 3, 9);
  assert.equal(todayProgram(DEFAULT_PLAN, sun), 'jump-a');
  assert.equal(todayProgram(DEFAULT_PLAN, sat), '');
  assert.equal(Object.values(DEFAULT_PLAN).filter(id => id.startsWith('jump')).length, 3);
  for (const id of Object.values(DEFAULT_PLAN)) if (id) assert.ok(programById[id], id);
  const tue = new Date(2026, 8, 29, 18);
  const w = weekDays([{ date: new Date(2026, 8, 27, 10).toISOString() }], tue);
  assert.equal(w.length, 7); assert.equal(w[0].done, true); assert.equal(w[2].today, true); assert.equal(w[1].past, true); assert.equal(w[3].past, false);
  const perfect = () => ({ items: Array.from({ length: 6 }, () => ({ type: 'reps', target: 10, done: 10 })) });
  assert.equal(suggestLevel([perfect(), perfect(), perfect()], 'normal'), 'hard');
  assert.equal(suggestLevel([perfect(), perfect(), perfect()], 'hard'), null);
  assert.equal(suggestLevel([perfect(), perfect()], 'easy'), null);
  const partial = { items: [{ type: 'reps', target: 10, done: 5 }, ...perfect().items] };
  assert.equal(suggestLevel([perfect(), partial, perfect()], 'easy'), null);
});

test('every program refers to real exercises; every exercise has a valid loop', () => {
  for (const p of PROGRAMS) { assert.ok(p.blocks?.length, p.id); for (const b of p.blocks) for (const id of b.items) assert.ok(byId[id], p.id + ':' + id); }
  for (const ex of EXERCISES) {
    assert.ok(cycleMs(ex.frames) > 0, ex.id);
    const p = poseAt(ex.frames, 123);
    for (const j of ['head', 'neck', 'hip', 'lh', 'rh', 'lf', 'rf']) assert.ok(Array.isArray(p[j]) && p[j].length === 2, ex.id + ' ' + j);
    assert.ok(ex.name && !/[؀-ۿ]/.test(ex.name + ex.tip));
  }
});

test('lerpPose midpoint and rope', () => {
  const a = { head: [0, 0], neck: [0, 0], hip: [0, 0], le: [0, 0], lh: [0, 0], re: [0, 0], rh: [0, 0], lk: [0, 0], lf: [0, 0], rk: [0, 0], rf: [0, 0], rope: 100 };
  const b = { ...a, head: [10, 20], rope: 200 };
  const m = lerpPose(a, b, 0.5);
  assert.deepEqual(m.head, [5, 10]); assert.equal(m.rope, 150);
});

test('summarize stars', () => {
  const s = { duration: 600, items: [
    { exId: 'a', type: 'reps', target: 10, done: 10 }, { exId: 'b', type: 'time', target: 30, done: 30 }, { exId: 'c', type: 'reps', target: 10, done: 10 }] };
  const sum = summarize(s);
  assert.equal(sum.stars, 3); assert.equal(sum.reps, 20); assert.equal(sum.seconds, 30); assert.equal(sum.pct, 100);
  s.items[2].done = 0;
  assert.equal(summarize(s).stars, 1);
  s.items[2].done = 5;
  assert.equal(summarize(s).stars, 2);
});

test('streak counts back from today or yesterday', () => {
  const d = n => { const x = new Date(2026, 8, 28, 12); x.setDate(x.getDate() - n); return x.toISOString(); };
  const today = new Date(2026, 8, 28, 18);
  assert.equal(streak([], today), 0);
  assert.equal(streak([{ date: d(0) }, { date: d(1) }, { date: d(2) }], today), 3);
  assert.equal(streak([{ date: d(1) }, { date: d(2) }], today), 2);
  assert.equal(streak([{ date: d(2) }], today), 0);
  assert.equal(streak([{ date: d(0) }, { date: d(0) }, { date: d(3) }], today), 1);
});

test('stats and badges', () => {
  const today = new Date(2026, 8, 28, 18);
  const mk = (n, reps) => ({ date: new Date(2026, 8, 28 - n, 10).toISOString(), duration: 700, items: [{ exId: 'crunches', name: 'x', type: 'reps', target: reps, done: reps }] });
  const st = stats([mk(0, 200), mk(1, 200), mk(2, 200)], today);
  assert.equal(st.workouts, 3); assert.equal(st.streak, 3); assert.equal(st.thisWeek, 3); assert.equal(st.totalReps, 600);
  assert.equal(st.week.length, 7); assert.equal(st.week.at(-1).count, 1);
  assert.equal(st.perExercise.crunches.total, 600); assert.equal(st.perExercise.crunches.best, 200);
  const b = earned(st);
  assert.ok(b.includes('first') && b.includes('three') && b.includes('reps500'));
  assert.ok(!b.includes('week'));
});

test('fmtTime', () => { assert.equal(fmtTime(0), '0:00'); assert.equal(fmtTime(65), '1:05'); assert.equal(fmtTime(600), '10:00'); });

test('basketball stats: totals, percent and trend', async () => {
  const { bbStats, pct, BB_DRILLS } = await import('../workout/js/logic.js');
  assert.equal(pct(7, 10), 70); assert.equal(pct(0, 0), null);
  const s = [
    { id: 'a', date: '2026-09-20T17:00:00Z', minutes: 40, drills: [{ drillId: 'free-throws', name: 'עונשין', att: 20, made: 10 }, { drillId: 'dribble', name: 'כדרור', att: 0, made: 0 }] },
    { id: 'b', date: '2026-09-27T17:00:00Z', minutes: 30, drills: [{ drillId: 'free-throws', name: 'עונשין', att: 20, made: 14 }] },
  ];
  const st = bbStats(s);
  assert.equal(st.sessions, 2); assert.equal(st.minutes, 70); assert.equal(st.last.id, 'b');
  assert.equal(st.per['free-throws'].att, 40); assert.equal(st.per['free-throws'].made, 24); assert.equal(st.per['free-throws'].pct, 60); assert.equal(st.per['free-throws'].best, 70);
  assert.deepEqual(st.per['free-throws'].trend.map(t => t.pct), [50, 70]);
  assert.equal(st.per.dribble.pct, null); assert.equal(st.per.dribble.times, 1);
  assert.ok(BB_DRILLS.length >= 8);
});

test('difficulty boost per program: +10% and harder exercises', async () => {
  const { harderOf, boostText } = await import('../workout/js/logic.js');
  const legs = programById['legs'];
  const base = buildItems(legs, byId, 'normal');
  const boosted = buildItems(legs, byId, 'normal', { boost: 2, swaps: 0 });
  const sq = base.find(i => i.exId === 'squats'), sqB = boosted.find(i => i.exId === 'squats');
  assert.equal(sq.target, 15); assert.equal(sqB.target, 18);
  assert.equal(boosted.find(i => i.block === 'חימום').target, base.find(i => i.block === 'חימום').target, 'warm-up unchanged');
  const swapped = buildItems(legs, byId, 'normal', { boost: 0, swaps: 1 });
  assert.equal(swapped.find(i => i.block === 'האימון').exId, 'squat-jumps');
  assert.ok(swapped.find(i => i.exId === 'squat-jumps').swapped);
  assert.equal(harderOf('knee-push-ups', 2), 'pike-push-ups'); assert.equal(harderOf('burpees'), 'burpees');
  assert.equal(boostText({ boost: 1, swaps: 1 }), '+10% · תרגילים מתקדמים'); assert.equal(boostText({}), '');
  for (const [a, b] of Object.entries((await import('../workout/js/logic.js')).HARDER)) assert.ok(byId[a] && byId[b], a + '>' + b);
});

test('every program has push-ups and a core exercise; unlock credits; ranks', async () => {
  const L = await import('../workout/js/logic.js');
  const CORE = new Set(EXERCISES.filter(e => e.cat === 'core').map(e => e.id));
  for (const p of PROGRAMS) {
    const ids = p.blocks.flatMap(b => b.items);
    assert.ok(ids.includes('push-ups') || ids.includes('knee-push-ups'), p.id + ' push-ups');
    assert.ok(ids.some(id => CORE.has(id)), p.id + ' core');
  }
  const S0 = L.START_GAMES.length; assert.equal(S0, 6); assert.equal(L.unlockCredits(0, S0, 10), 0); assert.equal(L.unlockCredits(10, S0, 10), 5); assert.equal(L.unlockCredits(23, S0 + 3, 10), 7); assert.equal(L.unlockCredits(50, S0, 0), 0);
  assert.equal(L.nextUnlockIn(7, 10), 3);
  assert.equal(L.rankOf(0).name, 'מתחיל'); assert.equal(L.rankOf(26).name, 'אלוף'); assert.equal(L.rankOf(26).toNext, 14); assert.equal(L.rankOf(100).next, undefined);
  assert.ok(L.perseveranceLine({ thisWeek: 3, streak: 3, workouts: 10 }).includes('השלישי'));
  assert.ok(L.isWorkBlock('בטן וידיים') && !L.isWorkBlock('חימום'));
});

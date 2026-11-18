import { catalog, clipById, legacyReplay, matches, replay, variants } from './replay.mjs';

const rows = catalog.map(exercise => {
  const spec = clipById[exercise.id];
  const clean = replay(spec);
  const before = legacyReplay(spec), beforeIdle = legacyReplay(spec, variants.wrong);
  const wrong = replay(spec, variants.wrong);
  const portrait = replay(spec, variants.portrait);
  const landscape = replay(spec, variants.landscape);
  const problems = {};
  for (const name of ['dark', 'backlit', 'multiple', 'multipleSwap', 'absent']) {
    const before = legacyReplay(spec, variants[name]);
    const after = replay(spec, variants[name]);
    problems[name] = {
      baselineReps: before?.count ?? null,
      afterReps: after.count,
      afterMs: after.activeMs,
    };
  }
  return {
    id: exercise.id, unit: exercise.type,
    expected: spec.expected,
    baselineReps: before?.count ?? null,
    baselineWrongReps: beforeIdle?.count ?? null,
    clean: { reps: clean.count, ms: clean.activeMs },
    cleanMatch: matches(clean, spec.expected),
    portrait: { reps: portrait.count, ms: portrait.activeMs },
    portraitMatch: matches(portrait, spec.expected),
    landscape: { reps: landscape.count, ms: landscape.activeMs },
    landscapeMatch: matches(landscape, spec.expected),
    wrong: { reps: wrong.count, ms: wrong.activeMs },
    hasWrongMotion: Array.isArray(spec.wrong),
    problems,
  };
});

const comparable = rows.filter(row => row.unit === 'reps' && row.baselineReps != null);
const sumAbsError = (cases, count) => cases.reduce((sum, row) => sum + Math.abs(count(row) - row.expected.count), 0);
const totals = {
  catalog: rows.length,
  repExercises: rows.filter(row => row.unit === 'reps').length,
  timedExercises: rows.filter(row => row.unit === 'time').length,
  baselineMeasuredReps: rows.filter(row => row.baselineReps != null).length,
  comparable: {
    cases: comparable.length,
    baselineExactCount: comparable.filter(row => row.expected.count === row.baselineReps).length,
    afterExactCount: comparable.filter(row => row.cleanMatch).length,
    baselineAbsoluteRepError: sumAbsError(comparable, row => row.baselineReps),
    afterAbsoluteRepError: sumAbsError(comparable, row => row.clean.reps),
  },
  cleanMatches: rows.filter(row => row.cleanMatch).length,
  cleanRepsMatches: rows.filter(row => row.unit === 'reps' && row.cleanMatch).length,
  cleanTimeMatches: rows.filter(row => row.unit === 'time' && row.cleanMatch).length,
  portraitMatches: rows.filter(row => row.portraitMatch).length,
  landscapeMatches: rows.filter(row => row.landscapeMatch).length,
  wrongMotionClips: rows.filter(row => row.hasWrongMotion).length,
  wrongWithProgress: rows.filter(row => row.wrong.reps > 0 || row.wrong.ms > 0).length,
  baselineWrongWithProgress: rows.filter(row => row.baselineWrongReps > 0).length,
  problems: Object.fromEntries(['dark', 'backlit', 'multiple', 'multipleSwap', 'absent'].map(name => [name, {
    baselineWithProgress: rows.filter(row => row.problems[name].baselineReps > 0).length,
    afterWithProgress: rows.filter(row => row.problems[name].afterReps > 0 || row.problems[name].afterMs > 0).length,
  }])),
};

console.log(JSON.stringify({ totals, rows }, null, 2));

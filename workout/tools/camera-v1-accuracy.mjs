// Accuracy sweep of camera workout v1 on the pack's synthetic skeleton recordings (no real child, no pictures).
// Every catalogue exercise is replayed through the wired tracker and counter under a grid of conditions:
// picture shape, frame interval (the phone's pose rate), joint jitter and movement speed.
// Usage: node workout/tools/camera-v1-accuracy.mjs [--json]
import { catalog, clipById, matches, replay } from '../island/design/workout-camera-exercises-v1/tests/replay.mjs';

export const SHAPES = {
  'upright 3:4': { aspect: 3 / 4, scale: .8 },
  'upright 9:16': { aspect: 9 / 16, scale: .72 },
  square: { aspect: 1, scale: 1 },
  'wide 4:3': { aspect: 4 / 3, scale: .9 },
  'wide 16:9': { aspect: 16 / 9, scale: .86 },
};
export const STEPS = [50, 67, 100, 125];
export const JITTERS = [0, .003, .006];
export const SPEEDS = [.8, 1, 1.25];

export function sweep(ids = catalog.map(exercise => exercise.id), { shapes = SHAPES, steps = STEPS, jitters = JITTERS, speeds = SPEEDS } = {}) {
  return ids.map(id => {
    const spec = clipById[id], reps = spec.expected.count != null;
    const row = { id, unit: reps ? 'reps' : 'time', shapes: {}, runs: 0, exact: 0, expected: 0, counted: 0, extra: 0,
      falseRuns: 0, falseAmount: 0, wrongRuns: 0, steps: Object.fromEntries(steps.map(step => [step, { runs: 0, exact: 0 }])) };
    for (const [shape, frame] of Object.entries(shapes)) {
      const cell = row.shapes[shape] = { runs: 0, exact: 0, extra: 0 };
      for (const step of steps) for (const jitter of jitters) for (const speed of speeds) {
        const options = { ...frame, step, jitter, speed };
        const result = replay(spec, options);
        const ok = reps ? result.count === spec.expected.count
          : matches({ activeMs: result.activeMs * speed }, spec.expected);
        cell.runs++; row.runs++; row.steps[step].runs++;
        if (ok) { cell.exact++; row.exact++; row.steps[step].exact++; }
        if (reps) {
          row.expected += spec.expected.count;
          row.counted += Math.min(result.count, spec.expected.count);
          const extra = Math.max(0, result.count - spec.expected.count);
          row.extra += extra; cell.extra += extra;
        } else if (result.activeMs * speed > spec.expected.activeMs[1]) { row.extra++; cell.extra++; }
        // The look-alike movement (or standing still) must earn nothing.
        const wrong = replay(spec, { ...options, variant: 'wrong' });
        row.wrongRuns++;
        const amount = reps ? wrong.count : Math.floor(wrong.activeMs / 1000);
        if (amount > 0) { row.falseRuns++; row.falseAmount += amount; }
      }
    }
    return row;
  });
}

const percent = (part, whole) => whole ? Math.round(100 * part / whole) : 0;
export function summary(rows) {
  const total = (key, list = rows) => list.reduce((sum, row) => sum + row[key], 0);
  const shapes = Object.fromEntries(Object.keys(rows[0].shapes).map(shape => [shape, {
    exactPercent: percent(rows.reduce((n, row) => n + row.shapes[shape].exact, 0), rows.reduce((n, row) => n + row.shapes[shape].runs, 0)),
    exercisesAlwaysExact: rows.filter(row => row.shapes[shape].exact === row.shapes[shape].runs).length,
    exercisesNeverExact: rows.filter(row => row.shapes[shape].exact === 0).map(row => row.id),
  }]));
  // By pose rate: 1000 / interval answers a second.
  const steps = Object.fromEntries(Object.keys(rows[0].steps).map(step => [Math.round(1000 / step) + ' a second', {
    exactPercent: percent(rows.reduce((n, row) => n + row.steps[step].exact, 0), rows.reduce((n, row) => n + row.steps[step].runs, 0)),
    exercisesAlwaysExact: rows.filter(row => row.steps[step].exact === row.steps[step].runs).length,
  }]));
  const repRows = rows.filter(row => row.unit === 'reps');
  return { exercises: rows.length, runs: total('runs'), exactPercent: percent(total('exact'), total('runs')),
    repsSeenPercent: percent(total('counted', repRows), total('expected', repRows)), extraReps: total('extra', repRows),
    falseRuns: total('falseRuns'), wrongRuns: total('wrongRuns'), falseAmount: total('falseAmount'), shapes, steps };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const rows = sweep();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ summary: summary(rows), rows }, null, 1));
  else {
    console.log(['exercise', 'unit', ...Object.keys(SHAPES), 'reps seen', 'extra', 'false runs'].join(' | '));
    for (const row of rows) {
      console.log([row.id, row.unit, ...Object.values(row.shapes).map(cell => percent(cell.exact, cell.runs) + '%'),
        row.unit === 'reps' ? percent(row.counted, row.expected) + '%' : '-', row.extra, row.falseRuns + '/' + row.wrongRuns].join(' | '));
    }
    console.log(JSON.stringify(summary(rows), null, 1));
  }
}

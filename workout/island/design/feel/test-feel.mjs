import test from 'node:test';
import assert from 'node:assert/strict';
import { readPackage, validateFeel, validatePackage } from './validate-feel.mjs';

const { games, context } = readPackage();
test('all three game packs have complete, bounded, budgeted data', () => {
  const results = validatePackage();
  assert.equal(results.length, 3);
  assert.equal(results.reduce((n, r) => n + r.events, 0), 11);
  assert.ok(results.every(r => r.values > 50));
});

function tuningPaths(value, prefix = []) {
  if (Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)) return [prefix];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => tuningPaths(v, [...prefix, k]));
}
function at(object, path) { return path.reduce((v, k) => v[k], object); }
for (const [game, original] of Object.entries(games)) {
  test(`${game}: reject out-of-range defaults, malformed ranges and costs for every tuning value`, () => {
    for (const path of tuningPaths(original)) {
      for (const mutation of ['below', 'above', 'reversed', 'missing', 'wrongCost', 'nonNumeric']) {
        const data = structuredClone(original), tuple = at(data, path);
        if (mutation === 'below') tuple[0] = tuple[1] - 1;
        if (mutation === 'above') tuple[0] = tuple[2] + 1;
        if (mutation === 'reversed') tuple[1] = tuple[2] + 1;
        if (mutation === 'missing') tuple.pop();
        if (mutation === 'wrongCost') tuple[3] = (tuple[3] + 1) % 3;
        if (mutation === 'nonNumeric') tuple[0] = '20';
        assert.throws(() => validateFeel(data, game, context), `${path.join('.')}: ${mutation} must fail`);
      }
    }
  });
}

const badCases = [
  ['missing event', d => { delete d.events.block; }],
  ['unrecognized parameter', d => { d.events.goal.shake.extra = [1, 0, 2, 1]; }],
  ['hard ceiling cannot be bypassed by widening a range', d => { d.events.goal.hit_stop.duration_ms = [500, 0, 600, 0]; }],
  ['unsafe live time scope', d => { d.events.block.time_scope = 'live'; }],
  ['unordered speed knots', d => { [d.speed.knots[1], d.speed.knots[2]] = [d.speed.knots[2], d.speed.knots[1]]; }],
  ['nonmonotone speed response', d => { d.speed.knots[1].fov_add_deg = [9, 8, 10, 1]; }],
  ['overlapping speed hysteresis', d => { d.speed.lines.off_speed = [0.8, 0.78, 0.81, 0]; }],
  ['line burst exceeds atlas duration', d => { d.speed.lines.burst_ms = [700, 400, 800, 2]; }],
  ['haptic total must match pattern', d => { d.events.goal.haptics.duration_ms[0]++; }],
  ['haptic sequence cannot end on silence', d => { d.events.goal.haptics.pattern_ms.pop(); }],
  ['missing audio id', d => { d.events.goal.timeline[0].asset = 'soccer/missing'; }],
  ['wrong game audio', d => { d.events.goal.timeline[0].asset = 'ski/fall'; }],
  ['gain above the audio mix recommendation', d => { d.events.goal.timeline[0].gain_db = [0, -5, 0, 1]; }],
  ['timeline ordering', d => { d.events.goal.timeline[0].at_ms = [150, 140, 160, 0]; }],
  ['VFX screen area exceeds source limit', d => { d.events.goal.timeline[1].screen_fraction = [0.2, 0.1, 0.3, 2]; }],
  ['atlas must be preloaded', d => { d.preload[0] = 'net-spark'; }],
  ['resident atlas budget', d => { d.preload.push('net-spark'); }],
  ['event voice budget', d => { d.low_end.max_audio_events = [1, 1, 3, 1]; }],
  ['reserve VFX capacity for speed lines', d => { d.low_end.max_vfx_instances = [1, 1, 3, 2]; }],
  ['duplicate cue', d => { d.events.goal.timeline.push(structuredClone(d.events.goal.timeline[2])); }]
];
for (const [name, mutate] of badCases) {
  test(`reject ${name}`, () => {
    const data = structuredClone(games.soccer);
    mutate(data);
    assert.throws(() => validateFeel(data, 'soccer', context));
  });
}

test('score audio timing matches the existing audio layers', () => {
  for (const [game, event, layer] of [
    ['soccer', 'goal', 'soccer_goal'],
    ['hoops', 'three_pointer', 'basketball_score'],
    ['hoops', 'dunk', 'basketball_score']
  ]) {
    for (const cue of context.audio.layers[layer].timeline) {
      const scheduled = games[game].events[event].timeline.find(c => c.kind === 'audio' && c.asset === cue.asset);
      assert.equal(scheduled?.at_ms[0], cue.at_ms, `${game}.${event}: ${cue.asset}`);
    }
  }
});

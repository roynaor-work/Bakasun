// Offline authoring validation only. This module is never imported by a game.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const GAME_EVENTS = {
  soccer: ['goal', 'block', 'fall', 'perfect_landing'],
  hoops: ['three_pointer', 'dunk', 'block', 'fall', 'perfect_landing'],
  alpine: ['fall', 'perfect_landing']
};
const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
const requireThat = (condition, path, message) => { if (!condition) fail(path, message); };
function keys(object, expected, path) {
  requireThat(object && typeof object === 'object' && !Array.isArray(object), path, 'expected object');
  requireThat(Object.keys(object).sort().join('|') === [...expected].sort().join('|'), path, `expected keys ${expected.join(', ')}`);
}

export function validateFeel(data, game, { audio, vfx, atlases }) {
  let values = 0;
  function tuple(value, lo, hi, cost, path, integer = false) {
    requireThat(Array.isArray(value) && value.length === 4 && value.every(Number.isFinite), path, 'expected [value, min, max, cost] with finite numbers');
    const [v, min, max, c] = value;
    requireThat(lo <= min && min <= v && v <= max && max <= hi, path, `value/range must satisfy ${lo} <= min <= value <= max <= ${hi}`);
    requireThat(c === cost, path, `cost must be ${cost}`);
    if (integer) requireThat(value.slice(0, 3).every(Number.isInteger), path, 'expected integer value and bounds');
    values++;
    return v;
  }
  function field(obj, key, lo, hi, cost, path, integer = false) {
    return tuple(obj[key], lo, hi, cost, `${path}.${key}`, integer);
  }
  keys(data, ['schema_version', 'game', 'base_commit', 'integration', 'tuple', 'sources', 'low_end', 'preload', 'speed', 'easing', 'events'], game);
  requireThat(data.schema_version === 1 && data.game === game && GAME_EVENTS[game], game, 'unsupported version/game');
  requireThat(/^[a-f0-9]{40}$/.test(data.base_commit), game, 'invalid base commit');
  requireThat(data.integration === 'not-connected', game, 'this is a data-only package');
  requireThat(JSON.stringify(data.tuple) === '["value","min","max","cost"]', game, 'tuple legend mismatch');
  keys(data.sources, ['audio', 'vfx'], `${game}.sources`);
  requireThat(data.sources.audio === '../audio/mix.json' && data.sources.vfx === '../vfx/manifest.json', game, 'source paths must stay relative to the design packages');
  const limits = data.low_end;
  keys(limits, ['max_audio_events', 'max_vfx_instances', 'max_resident_atlases', 'max_shakes', 'max_haptic_on_ms'], `${game}.low_end`);
  const maxAudio = field(limits, 'max_audio_events', 1, Math.min(3, audio.master.max_simultaneous_events), 1, `${game}.low_end`, true);
  const maxVfx = field(limits, 'max_vfx_instances', 1, 3, 2, `${game}.low_end`, true);
  const resident = field(limits, 'max_resident_atlases', 1, 3, 2, `${game}.low_end`, true);
  field(limits, 'max_shakes', 1, 1, 1, `${game}.low_end`, true);
  const maxOn = field(limits, 'max_haptic_on_ms', 50, 120, 1, `${game}.low_end`, true);
  requireThat(Array.isArray(data.preload) && data.preload.length > 0 && new Set(data.preload).size === data.preload.length && data.preload.length <= resident, game, 'preload exceeds resident atlas budget or has duplicates');
  const atlas = id => {
    const a = atlases[id];
    requireThat(vfx.atlases.includes(`atlases/${id}.json`) && a?.id === id, game, `missing atlas ${id}`);
    requireThat(data.preload.includes(id), game, `atlas ${id} must be preloaded`);
    return a;
  };
  for (const id of data.preload) atlas(id);
  const speed = data.speed;
  keys(speed, ['normalized_by', 'knots', 'fov_in_ms', 'fov_out_ms', 'lines'], `${game}.speed`);
  requireThat(speed.normalized_by === 'current-mode-max-player-speed', game, 'unknown speed normalization');
  requireThat(Array.isArray(speed.knots) && speed.knots.length === 4, game, 'expected four speed knots');
  let previous = -1, prevFov = -1, prevOpacity = -1;
  speed.knots.forEach((k, i) => {
    const p = `${game}.speed.knots[${i}]`;
    keys(k, ['speed', 'fov_add_deg', 'line_opacity'], p);
    const x = field(k, 'speed', 0, 1, 0, p);
    const fov = field(k, 'fov_add_deg', 0, 10, 1, p);
    const opacity = field(k, 'line_opacity', 0, 0.35, 2, p);
    requireThat(x > previous && (i === 0 ? x === 0 && fov === 0 && opacity === 0 : true) && (i === 3 ? x === 1 : true), p, 'knots must span 0..1 in increasing order and be neutral at rest');
    requireThat(fov >= prevFov && opacity >= prevOpacity, p, 'speed response must be monotone');
    previous = x; prevFov = fov; prevOpacity = opacity;
  });
  field(speed, 'fov_in_ms', 80, 400, 1, `${game}.speed`, true);
  field(speed, 'fov_out_ms', 120, 500, 1, `${game}.speed`, true);
  const lines = speed.lines;
  keys(lines, ['asset', 'on_speed', 'off_speed', 'burst_ms', 'cooldown_ms', 'screen_fraction'], `${game}.speed.lines`);
  requireThat(lines.asset === 'speed-lines', game, 'expected speed-lines atlas');
  const lineAtlas = atlas(lines.asset);
  const on = field(lines, 'on_speed', 0.5, 1, 0, `${game}.speed.lines`);
  const off = field(lines, 'off_speed', 0.3, 0.9, 0, `${game}.speed.lines`);
  requireThat(off < on && lines.off_speed[2] < lines.on_speed[1], game, 'speed hysteresis ranges overlap');
  const burst = field(lines, 'burst_ms', 200, Math.floor(lineAtlas.durationSeconds * 1000), 2, `${game}.speed.lines`, true);
  const lineCooldown = field(lines, 'cooldown_ms', 800, 3000, 0, `${game}.speed.lines`, true);
  requireThat(lineCooldown > burst && lines.cooldown_ms[1] >= lines.burst_ms[2], game, 'line bursts may overlap');
  field(lines, 'screen_fraction', 0.01, lineAtlas.lowEnd.maxScreenFractionPerInstance, 2, `${game}.speed.lines`);
  keys(data.easing, ['player', 'camera'], `${game}.easing`);
  for (const actor of ['player', 'camera']) {
    keys(data.easing[actor], ['ease_in', 'ease_out'], `${game}.easing.${actor}`);
    for (const mode of ['ease_in', 'ease_out']) {
      const curve = data.easing[actor][mode], p = `${game}.easing.${actor}.${mode}`, cost = actor === 'camera' ? 1 : 0;
      keys(curve, ['duration_ms', 'power'], p);
      field(curve, 'duration_ms', 40, 800, cost, p, true);
      field(curve, 'power', 1, 3, cost, p);
    }
  }
  keys(data.events, GAME_EVENTS[game], `${game}.events`);
  for (const [id, e] of Object.entries(data.events)) {
    const p = `${game}.events.${id}`;
    keys(e, ['time_scope', 'priority', 'cooldown_ms', 'hit_stop', 'slow_motion', 'shake', 'haptics', 'timeline'], p);
    const expectedScope = id === 'goal' || (game === 'alpine' && id === 'fall') ? 'stopped-play-or-replay' : 'replay-only';
    requireThat(e.time_scope === expectedScope, p, 'time effects must be gated to the documented presentation state');
    field(e, 'priority', 1, 5, 0, p, true);
    field(e, 'cooldown_ms', 200, 5000, 0, p, true);
    keys(e.hit_stop, ['duration_ms', 'scale'], `${p}.hit_stop`);
    field(e.hit_stop, 'duration_ms', 0, 90, 0, `${p}.hit_stop`, true);
    field(e.hit_stop, 'scale', 0, 0.2, 0, `${p}.hit_stop`);
    keys(e.slow_motion, ['duration_ms', 'scale', 'recover_ms'], `${p}.slow_motion`);
    field(e.slow_motion, 'duration_ms', 0, 400, 0, `${p}.slow_motion`, true);
    field(e.slow_motion, 'scale', 0.35, 1, 0, `${p}.slow_motion`);
    field(e.slow_motion, 'recover_ms', 60, 300, 0, `${p}.slow_motion`, true);
    requireThat(e.hit_stop.duration_ms[2] + e.slow_motion.duration_ms[2] + e.slow_motion.recover_ms[2] <= 700, p, 'time effect range exceeds 700ms');
    keys(e.shake, ['amplitude', 'frequency_hz', 'decay_ms'], `${p}.shake`);
    field(e.shake, 'amplitude', 0, 0.006, 1, `${p}.shake`);
    field(e.shake, 'frequency_hz', 6, 12, 1, `${p}.shake`);
    field(e.shake, 'decay_ms', 60, 320, 1, `${p}.shake`, true);
    keys(e.haptics, ['pattern_ms', 'duration_ms'], `${p}.haptics`);
    const pattern = e.haptics.pattern_ms;
    requireThat(Array.isArray(pattern) && pattern.length > 0 && pattern.length <= 5 && pattern.length % 2 === 1, p, 'haptics must end on a pulse and have 1/3/5 segments');
    let total = 0, onTotal = 0, worstOn = 0;
    pattern.forEach((v, i) => {
      total += tuple(v, i % 2 ? 10 : 5, i % 2 ? 80 : 60, 1, `${p}.haptics.pattern_ms[${i}]`, true);
      if (i % 2 === 0) { onTotal += v[0]; worstOn += v[2]; }
    });
    const duration = field(e.haptics, 'duration_ms', 5, 250, 1, `${p}.haptics`, true);
    requireThat(total === duration && onTotal <= maxOn && worstOn <= limits.max_haptic_on_ms[2], p, 'haptic duration mismatch or on-time exceeds budget');
    requireThat(pattern.reduce((s, v) => s + v[1], 0) >= e.haptics.duration_ms[1] && pattern.reduce((s, v) => s + v[2], 0) <= e.haptics.duration_ms[2], p, 'pattern tuning ranges exceed declared duration range');
    requireThat(Array.isArray(e.timeline) && e.timeline.length > 0, p, 'missing event timeline');
    let lastAt = -1, audioCount = 0, vfxCount = 0;
    const seen = new Set();
    for (const [i, cue] of e.timeline.entries()) {
      const cp = `${p}.timeline[${i}]`;
      requireThat(cue && ['audio', 'vfx'].includes(cue.kind), cp, 'unknown cue kind');
      keys(cue, cue.kind === 'audio' ? ['kind', 'asset', 'at_ms', 'gain_db'] : ['kind', 'asset', 'at_ms', 'opacity', 'screen_fraction'], cp);
      const at = field(cue, 'at_ms', 0, 500, 0, cp, true);
      requireThat(at >= lastAt, cp, 'timeline must be sorted by delay');
      lastAt = at;
      requireThat(!seen.has(`${cue.kind}:${cue.asset}`), cp, 'duplicate cue'); seen.add(`${cue.kind}:${cue.asset}`);
      if (cue.kind === 'audio') {
        const asset = audio.assets[cue.asset];
        const prefix = { soccer: 'soccer/', hoops: 'basketball/', alpine: 'ski/' }[game];
        requireThat(cue.asset.startsWith(prefix) && asset && !asset.loop, cp, 'missing or wrong-game audio asset');
        field(cue, 'gain_db', -24, asset.recommended_gain_db, 1, cp);
        audioCount++;
      } else {
        const a = atlas(cue.asset);
        requireThat(cue.asset !== 'speed-lines' && !a.loop, cp, 'event cue must use a one-shot contact atlas');
        field(cue, 'opacity', 0, 1, 2, cp);
        field(cue, 'screen_fraction', 0.001, a.lowEnd.maxScreenFractionPerInstance, 2, cp);
        vfxCount++;
      }
    }
    requireThat(audioCount <= maxAudio && vfxCount + 1 <= maxVfx, p, 'cue budget exceeded (reserve one VFX instance for speed lines)');
  }
  return { game, events: Object.keys(data.events).length, values };
}

export function readPackage(directory = new URL('./', import.meta.url)) {
  const dir = directory instanceof URL ? directory : pathToFileURL(`${resolve(directory)}/`);
  const read = path => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
  const audio = read('../audio/mix.json'), vfx = read('../vfx/manifest.json');
  const games = Object.fromEntries(Object.keys(GAME_EVENTS).map(g => [g, read(`${g}.json`)]));
  const ids = new Set(Object.values(games).flatMap(g => g.preload));
  const atlases = Object.fromEntries([...ids].map(id => {
    requireThat(typeof id === 'string' && /^[a-z-]+$/.test(id), 'preload', 'invalid atlas id');
    return [id, read(`../vfx/atlases/${id}.json`)];
  }));
  const jsonFiles = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  requireThat(jsonFiles.join('|') === ['alpine.json', 'hoops.json', 'soccer.json'].join('|'), 'package', 'expected exactly one JSON per game');
  return { games, context: { audio, vfx, atlases } };
}

export function validatePackage(directory) {
  const { games, context } = readPackage(directory);
  return Object.entries(games).map(([game, data]) => validateFeel(data, game, context));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const results = validatePackage(process.argv[2]);
    console.log(`PASS: ${results.length} games, ${results.reduce((s, r) => s + r.events, 0)} events, ${results.reduce((s, r) => s + r.values, 0)} numeric values with recommended ranges and costs.`);
    for (const r of results) console.log(`  ${r.game}: ${r.events} events, ${r.values} values`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

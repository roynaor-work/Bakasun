// Scores the clips recorded by camera-v1-render.mjs: the real pose model's answers are replayed through the
// real tracker, counter and guidance, wired as session.mjs wires them, and compared with what the rendered
// figure truly did. The figure is a cartoon, not a person; see workout/tools/camera-v1-QA.md.
// Usage: node workout/tools/camera-v1-realmodel.mjs --clips <dir> [--modules <dir with camera-v1 modules>] [--json <file>] [--md]
import path from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { EXERCISES } from '../js/exercises.js';

const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; };
const here = new URL('../js/camera-v1/', import.meta.url);
export async function load(dir) {
  const base = dir ? pathToFileURL(path.resolve(dir) + '/') : here;
  const [motion, tracking, guiding] = await Promise.all(['motion.mjs', 'tracking.mjs', 'guide.mjs'].map(name => import(new URL(name, base))));
  return { ...motion, ...tracking, ...guiding };
}

const byId = Object.fromEntries(EXERCISES.map(ex => [ex.id, ex]));
// How many counts one loop of the figure's animation holds.
const PER_CYCLE = { bicycle: 2, 'russian-twists': 2, 'crab-kicks': 2 };
// What the figure cannot show: it runs on the spot (the corridor counter needs travel across the picture),
// and its lunge repeats one leg (the counter asks to alternate).
export const NOT_SHOWN = { lunges: 'the figure repeats one leg; the counter asks for alternating legs' };
for (const ex of EXERCISES) if (ex.place === 'hall') NOT_SHOWN[ex.id] = 'the figure moves on the spot; the corridor counter needs travel across the picture';
const SLOW_GAP = 275;
const median = values => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const quantile = (values, q) => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const top = counts => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
const bump = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

const PAIRS = [['lShoulder', 11], ['rShoulder', 12], ['lElbow', 13], ['rElbow', 14], ['lWrist', 15], ['rWrist', 16],
  ['lHip', 23], ['rHip', 24], ['lKnee', 25], ['rKnee', 26], ['lAnkle', 27], ['rAnkle', 28]];
const MIRROR = { 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27 };
// Mean joint distance between the model and the rig, in torso lengths. Left and right may be swapped
// (a side view gives the model no way to tell), so the better of the two assignments counts.
function jointError(frame, aspect) {
  const person = frame.poses[0]?.landmarks, t = frame.truth;
  if (!person || !t.lShoulder || !t.lHip) return null;
  const d = (a, b) => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const torso = d(mid(t.lShoulder, t.rShoulder), mid(t.lHip, t.rHip));
  if (!(torso > .01)) return null;
  const known = PAIRS.filter(([name]) => t[name]);
  const err = swap => known.reduce((sum, [name, id]) => { const q = person[swap ? MIRROR[id] : id]; return sum + d(t[name], [q.x, q.y]); }, 0) / known.length / torso;
  return Math.min(err(false), err(true));
}

const PART_TRUTH = { head: ['nose', 'top'], shoulders: ['lShoulder', 'rShoulder'], hands: ['lWrist', 'rWrist', 'lElbow', 'rElbow'],
  hips: ['lHip', 'rHip'], knees: ['lKnee', 'rKnee'], feet: ['lAnkle', 'rAnkle', 'lToe', 'rToe'] };
function trulyCut(frame) {
  const out = { parts: [], edges: new Set() };
  for (const [part, names] of Object.entries(PART_TRUTH)) {
    const gone = names.map(name => frame.truth[name]).filter(p => p && (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1));
    if (!gone.length) continue;
    out.parts.push(part);
    for (const p of gone) { if (p[0] < 0) out.edges.add('left'); if (p[0] > 1) out.edges.add('right'); if (p[1] < 0) out.edges.add('top'); if (p[1] > 1) out.edges.add('bottom'); }
  }
  const xs = Object.values(frame.truth).map(p => p[0]);
  out.middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  return out;
}

/** Replays one recorded clip (optionally for another exercise's counter) and returns what the page would have done. */
export function replay(clip, api, id = clip.cfg.id) {
  const policy = api.CAMERA_EXERCISES[id], ex = byId[id];
  const tracker = new api.PoseTracker({ view: policy.view === 'diagonal' ? 'either' : policy.view, setup: policy.setup, required: policy.required });
  const counter = new api.MotionCounter(id, { goal: 100 });
  const memory = {}, statuses = {}, moves = {}, parts = {}, events = {}, hints = {}, countedAt = [], lines = {};
  let tempo = 0, own = 0, adapted = 0, meterTop = null;
  let reference = null, last = null, slowFrames = 0, readyFrames = 0, motion = { count: 0, activeMs: 0 }, firstReady = null, compute = 0;
  for (const frame of clip.frames) {
    const sample = { poses: frame.poses, time: 1000 + frame.t, aspect: clip.aspect, light: frame.light, scene: frame.scene };
    const began = performance.now();
    const result = tracker.update(sample);
    if ((result.gap || !result.ready) && !result.brief) counter.pause();
    slowFrames = last != null && sample.time - last > SLOW_GAP ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    last = sample.time;
    const slow = slowFrames >= 3 && (result.ready || result.status === 'calibrating');
    const status = slow ? 'slow' : result.status;
    bump(statuses, status);
    if (slow) counter.pause();
    else if (!result.ready) {
      const instruction = api.guide(sample, result.status, policy, memory);
      if (instruction && frame.t >= 500) {
        bump(moves, instruction.move ?? 'none');
        bump(lines, instruction.code);
        for (const part of instruction.parts ?? []) bump(parts, part);
      }
    } else {
      readyFrames++;
      firstReady ??= frame.t;
      if (result.calibration && result.calibration !== reference) {
        reference = result.calibration;
        counter.setReference(reference.reference.landmarks, { aspect: sample.aspect });
      }
      motion = counter.update(result.pose.landmarks, sample.time, { aspect: sample.aspect });
      if (motion.event) bump(events, motion.event);
      if (motion.tempo) tempo++;
      if (motion.own) own++;
      if (motion.bridged) adapted++;
      if (Number.isFinite(motion.meter)) meterTop = Math.max(meterTop ?? 0, motion.meter);
      if (motion.event === 'counted') countedAt.push(frame.t);
      const hint = motion.hint?.text || (typeof motion.hint === 'string' ? motion.hint : '');
      if (hint) bump(hints, motion.event + ': ' + hint);
    }
    compute += performance.now() - began;
  }
  const timed = ex.type === 'time';
  return { id, timed, amount: timed ? motion.activeMs / 1000 : motion.count, count: motion.count, activeMs: motion.activeMs,
    statuses, moves, parts, lines, events, hints, countedAt, tempo, own, adapted, meterTop, partials: motion.partials ?? null, kind: policy.kind, readyFrames, firstReady, frames: clip.frames.length, computeMs: compute / clip.frames.length };
}

export function score(clip, api) {
  const { cfg } = clip, run = replay(clip, api);
  const after = clip.frames.filter(frame => frame.t >= 300);
  const errors = after.map(frame => jointError(frame, clip.aspect));
  const row = { name: cfg.name, id: cfg.id, condition: cfg.condition, shape: cfg.w + 'x' + cfg.h, timed: run.timed,
    detect: after.filter(frame => frame.poses.length > 0).length / after.length,
    phantom: after.filter(frame => frame.poses.length > 1).length / after.length,
    jointError: median(errors), jointOk: errors.filter(e => e != null && e < .35).length / after.length,
    ready: run.readyFrames / run.frames, firstReady: run.firstReady, status: top(run.statuses), statuses: run.statuses,
    amount: run.amount, events: run.events, hints: run.hints, moves: run.moves, parts: run.parts, lines: run.lines,
    modelMs: median(clip.frames.slice(3).map(frame => frame.ms)), modelP95: quantile(clip.frames.slice(3).map(frame => frame.ms), .95), computeMs: run.computeMs };
  Object.assign(row, { partials: run.partials, tempo: run.tempo, own: run.own, adapted: run.adapted, meterTop: run.meterTop });
  if (cfg.idle) row.expected = 0;
  else if (run.timed) row.expected = clip.motion / 1000;
  else row.expected = cfg.reps === undefined ? 4 * (PER_CYCLE[cfg.id] ?? 1) : cfg.reps * (PER_CYCLE[cfg.id] ?? 1);
  row.error = row.amount - row.expected;
  // A timed exercise passes when 60% to 115% of the moving time was credited; a counted one when the count is exact.
  // Holding the starting pose still IS the exercise for a hold, so "idle" says nothing there.
  if (cfg.idle && run.kind === 'hold') row.skip = 'a hold: standing still is the exercise';
  if (cfg.condition === 'shallow-45') row.expected = 0;
  row.exact = cfg.condition === 'shallow-78' ? row.amount >= cfg.reps - 2 && row.amount <= cfg.reps
    : cfg.idle ? (run.timed ? row.amount < 1 : row.amount === 0)
    : run.timed ? row.amount >= .6 * row.expected && row.amount <= 1.15 * row.expected : row.amount === row.expected;
  // Counted from the third repetition on, after the first two taught the child's own range.
  row.learned = !row.exact && !run.timed && run.own > 0 && row.amount >= row.expected - 2 && row.amount <= row.expected;
  // Guidance against the true crop.
  const cut = trulyCut(clip.frames[Math.floor(clip.frames.length / 3)]);
  row.cut = { parts: cut.parts, edges: [...cut.edges], middle: Math.round(cut.middle * 100) / 100 };
  const said = top(run.moves), blocked = 1 - row.ready;
  const expectMove = { far: ['closer'], near: ['back'], 'cut-low': ['back', 'raise'], 'cut-high': ['back', 'raise'],
    'cut-left': [cut.middle < .5 ? 'left' : 'right', 'back'], 'cut-right': [cut.middle < .5 ? 'left' : 'right', 'back'] }[cfg.condition];
  if (expectMove) {
    const needed = cfg.condition === 'far' || cfg.condition === 'near' || cut.parts.length > 0;
    row.guide = { needed, said, blocked, right: needed ? blocked > .5 && expectMove.includes(said) : null,
      // The strict reading for a sideways cut: the direction itself, not just "move back".
      direction: cfg.condition.startsWith('cut-l') || cfg.condition.startsWith('cut-r') ? said === expectMove[0] : null,
      partsNamed: Object.keys(run.parts), partRight: cut.parts.length ? Object.keys(run.parts).some(part => cut.parts.includes(part) || part === 'knees' && cut.parts.includes('feet')) : null,
      countedWhileCut: needed && row.amount > 0 };
  }
  if (cfg.condition === 'other-view') {
    const turn = (run.statuses['turn-side'] ?? 0) + (run.statuses['face-camera'] ?? 0);
    row.view = { want: cfg.want, asked: turn > 0, askedShare: turn / run.frames, counted: row.amount };
  }
  if (cfg.condition === 'knocked') {
    const before = clip.frames.findIndex(frame => frame.t >= cfg.shake.at);
    // Was the framing gate run again after the knock? (Any blocked status in the second after it.)
    const tracker = replay({ ...clip, frames: clip.frames.slice(0, before) }, api);
    const lost = Object.entries(run.statuses).reduce((n, [status, count]) => status === 'ready' ? n : n + count - (tracker.statuses[status] ?? 0), 0);
    row.knock = { regated: lost >= 2, named: (run.statuses['phone-moved'] ?? 0) > 0, statuses: run.statuses };
  }
  return row;
}

// Movements that must earn nothing for another exercise: the same setup, a different exercise.
const FOREIGN = { standing: ['jog', 'arm-circles', 'squats', 'jumping-jacks'], floor: ['crunches', 'push-ups', 'leg-raises', 'mountain-climbers'] };
export function foreign(clips, api) {
  const rows = [];
  for (const id of Object.keys(api.CAMERA_EXERCISES)) {
    const setup = api.CAMERA_EXERCISES[id].setup, timed = byId[id].type === 'time';
    for (const other of FOREIGN[setup].filter(name => name !== id)) {
      const clip = clips.get(other + '.natural');
      if (!clip) continue;
      const run = replay(clip, api, id);
      rows.push({ id, other, amount: timed ? Math.floor(run.amount) : run.amount, timed });
    }
  }
  return rows;
}

export async function readClips(dir, filter = () => true) {
  const clips = new Map();
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.json')).sort()) {
    const key = name.slice(0, -5);
    if (filter(key)) clips.set(key, JSON.parse(await readFile(path.join(dir, name), 'utf8')));
  }
  return clips;
}

const pct = v => v == null ? '-' : Math.round(v * 100) + '%';
const num = v => v == null ? '-' : Math.round(v * 10) / 10;
export function table(rows, falseRows) {
  const by = {};
  for (const row of rows) (by[row.id] ??= {})[row.condition] = row;
  const cell = row => !row ? '-' : row.skip ? 'n/a' : (row.timed ? num(row.amount) + '/' + num(row.expected) + 's' : row.amount + '/' + row.expected) + (row.exact ? '' : row.learned ? ' ~' : ' ✗');
  const out = ['| exercise | detected | joints ok | ready | natural | turned | dim | slow+blur | fast | idle | knocked | foreign | note |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [id, c] of Object.entries(by)) {
    const n = c.natural ?? Object.values(c)[0];
    const wrong = falseRows.filter(row => row.id === id && row.amount > 0);
    out.push(['', id, pct(n.detect), pct(n.jointOk), pct(n.ready), cell(c.natural), cell(c.turned), cell(c.dim), cell(c['slow-blur']), cell(c.fast), cell(c.idle), cell(c.knocked),
      wrong.length ? wrong.map(row => row.other + ' ' + row.amount).join(', ') : '0', NOT_SHOWN[id] ? 'not shown by the figure' : '', ''].join(' | ').trim());
  }
  return out.join('\n');
}

export function summary(rows, falseRows) {
  const shown = rows.filter(row => !NOT_SHOWN[row.id]);
  const of = condition => shown.filter(row => row.condition === condition);
  const share = (list, test) => list.length ? Math.round(100 * list.filter(test).length / list.length) : null;
  const counting = ['natural', 'turned', 'dim', 'slow-blur', 'fast', 'knocked'];
  const reps = list => list.filter(row => !row.timed);
  const guides = rows.filter(row => row.guide?.needed);
  const sideways = guides.filter(row => row.guide.direction != null);
  return {
    clips: rows.length, exercises: new Set(rows.map(row => row.id)).size, notShown: Object.keys(NOT_SHOWN).length,
    detectedMedian: pct(median(of('natural').map(row => row.detect))), jointErrorMedian: num(median(of('natural').map(row => row.jointError * 10)) ) / 10,
    readyMedian: pct(median(of('natural').map(row => row.ready))),
    exactPercent: Object.fromEntries(counting.map(condition => [condition, share(of(condition), row => row.exact)])),
    repsSeenPercent: Object.fromEntries(counting.map(condition => { const list = reps(of(condition)); const want = list.reduce((n, row) => n + row.expected, 0);
      return [condition, want ? Math.round(100 * list.reduce((n, row) => n + Math.min(row.amount, row.expected), 0) / want) : null]; })),
    extraReps: Object.fromEntries(counting.map(condition => [condition, reps(of(condition)).reduce((n, row) => n + Math.max(0, row.amount - row.expected), 0)])),
    exercisesExactNatural: of('natural').filter(row => row.exact).map(row => row.id),
    exercisesLearnedNatural: of('natural').filter(row => row.learned).map(row => row.id),
    exercisesFailNatural: of('natural').filter(row => !row.exact).map(row => row.id + ' ' + num(row.amount) + '/' + num(row.expected)),
    idleFalse: rows.filter(row => row.condition === 'idle' && !row.skip && !row.exact).map(row => row.id + ' ' + num(row.amount)),
    foreignFalse: falseRows.filter(row => row.amount > 0).map(row => row.id + '<' + row.other + ' ' + row.amount), foreignRuns: falseRows.length,
    guidance: { clips: guides.length, rightMove: share(guides, row => row.guide.right), rightDirectionSideways: share(sideways, row => row.guide.direction),
      rightPart: share(guides.filter(row => row.guide.partRight != null), row => row.guide.partRight), countedWhileCut: guides.filter(row => row.guide.countedWhileCut).length,
      byCondition: Object.fromEntries(['far', 'near', 'cut-low', 'cut-high', 'cut-left', 'cut-right'].map(condition => [condition, share(guides.filter(row => row.condition === condition), row => row.guide.right)])) },
    view: (() => { const list = rows.filter(row => row.view && row.view.want !== 'diagonal'); return { clips: list.length, asked: share(list, row => row.view.asked), countedAnyway: list.filter(row => row.view.counted >= 1).length }; })(),
    knocked: (() => { const list = rows.filter(row => row.knock); return { clips: list.length, regated: share(list, row => row.knock.regated), named: share(list, row => row.knock.named), exact: share(list, row => row.exact) }; })(),
    range: (() => {
      const of2 = condition => rows.filter(row => row.condition === condition);
      return { shallow45: { clips: of2('shallow-45').length, falseCounts: of2('shallow-45').reduce((n, row) => n + row.amount, 0), cued: share(of2('shallow-45'), row => (row.partials ?? 0) > 0 || (row.events.partial ?? 0) > 0) },
        shallow78: { clips: of2('shallow-78').length, wanted: of2('shallow-78').reduce((n, row) => n + row.expected, 0), counted: of2('shallow-78').reduce((n, row) => n + row.amount, 0), adaptedClips: of2('shallow-78').filter(row => row.adapted > 0).length },
        rush: { clips: of2('rush').length, counted: of2('rush').reduce((n, row) => n + row.amount, 0), wanted: of2('rush').reduce((n, row) => n + row.expected, 0), slowerSaid: share(of2('rush'), row => row.tempo > 0) },
        normalPace: { clips: of('natural').length, slowerSaid: of('natural').filter(row => row.tempo > 0).map(row => row.id) } };
    })(),
    sizes: Object.fromEntries([...new Set(rows.filter(row => row.condition.startsWith('size-')).map(row => row.condition))].map(condition => { const list = rows.filter(row => row.condition === condition);
      return [condition.slice(5), { clips: list.length, detected: pct(median(list.map(row => row.detect))), jointsOk: pct(median(list.map(row => row.jointOk))), ready: pct(median(list.map(row => row.ready))),
        exact: share(list, row => row.exact), status: top(list.reduce((all, row) => { bump(all, row.status); return all; }, {})), fails: list.filter(row => !row.exact).map(row => row.id + ' ' + num(row.amount) + '/' + num(row.expected) + ' ' + row.status) }]; })),
    modelMsMedian: num(median(rows.map(row => row.modelMs))), modelMsP95: num(median(rows.map(row => row.modelP95))), computeMsMedian: Math.round(median(rows.map(row => row.computeMs)) * 100) / 100,
  };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const api = await load(arg('modules'));
  const clips = await readClips(arg('clips', 'camera-v1-clips'));
  const rows = [...clips.values()].map(clip => score(clip, api));
  const falseRows = foreign(clips, api);
  const result = { summary: summary(rows, falseRows), rows, foreign: falseRows };
  if (arg('json')) await writeFile(arg('json'), JSON.stringify(result, null, 1));
  if (process.argv.includes('--md')) console.log(table(rows, falseRows));
  console.log(JSON.stringify(result.summary, null, 1));
}

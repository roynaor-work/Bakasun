// Camera workout v1 (Codex pack workout-camera-exercises-v1, wired 21/11/2026): where-to-move guidance,
// the reverting flag, device-only rules of the page, and the pack's own replay measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { NODE_TEST_CONTEXT, ...cleanEnv } = process.env;
import { guide, GuideVoice, GUIDE_COPY } from '../workout/js/camera-v1/guide.mjs';
import { cameraV1Enabled, cameraV1Href, cameraV1Redirect } from '../workout/js/camera-v1/flag.mjs';
import { PoseTracker } from '../workout/js/camera-v1/tracking.mjs';
import { CAMERA_EXERCISES } from '../workout/js/camera-v1/profiles.mjs';
import { EXERCISES } from '../workout/js/exercises.js';
import { sweep, summary, SHAPES } from '../workout/tools/camera-v1-accuracy.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const pack = 'workout/island/design/workout-camera-exercises-v1/';

// A standing child seen from the front, in normalized image coordinates (MediaPipe indices).
function standing({ dx = 0, dy = 0, scale = 1, hide = [] } = {}) {
  const base = {
    0: [.5, .16], 7: [.52, .15], 8: [.48, .15], 11: [.57, .28], 12: [.43, .28], 13: [.6, .4], 14: [.4, .4],
    15: [.61, .5], 16: [.39, .5], 23: [.55, .52], 24: [.45, .52], 25: [.55, .68], 26: [.45, .68],
    27: [.55, .84], 28: [.45, .84], 29: [.55, .87], 30: [.45, .87], 31: [.56, .88], 32: [.44, .88],
  };
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0, presence: 0 }));
  for (const [id, [x, y]] of Object.entries(base)) {
    const px = .5 + (x - .5) * scale + dx, py = .5 + (y - .5) * scale + dy;
    const out = px < 0 || px > 1 || py < 0 || py > 1;
    points[id] = { x: px, y: py, visibility: out || hide.includes(+id) ? .05 : .95, presence: out || hide.includes(+id) ? .05 : .95 };
  }
  return { landmarks: points, world: [] };
}
const squat = CAMERA_EXERCISES.squats;
const jack = CAMERA_EXERCISES['jumping-jacks'];
const statusOf = (pose, policy, time = 100) => new PoseTracker({ view: 'either', setup: policy.setup, required: policy.required })
  .update({ poses: pose ? [pose] : [], time, aspect: .75 }).status;

test('a child who is seen well gets no instruction', () => {
  assert.equal(guide({ poses: [standing()], time: 0 }, 'ready', squat), null);
  assert.equal(statusOf(standing(), squat), 'calibrating');
});

test('feet below the picture: names the legs and sends the child back', () => {
  const pose = standing({ dy: .2 });
  const status = statusOf(pose, squat);
  assert.notEqual(status, 'calibrating');
  const g = guide({ poses: [pose], time: 0 }, status, squat);
  assert.deepEqual(g.parts, ['feet']);
  assert.equal(g.move, 'back');
  assert.equal(g.text, 'הרגליים לא נראות. זוז קצת אחורה.');
});

test('standing at the left of the camera image means moving left on the mirrored screen, and the reverse', () => {
  for (const [dx, move, word] of [[-.4, 'left', 'שמאלה'], [.4, 'right', 'ימינה']]) {
    const pose = standing({ dx });
    const g = guide({ poses: [pose], time: 0 }, statusOf(pose, jack), jack);
    assert.equal(g.move, move);
    assert.match(g.text, new RegExp(word));
    assert.ok(g.parts.length > 0, 'the cut side is named');
  }
});

test('too close, too far and a cut head use the tracker verdict', () => {
  assert.equal(guide({ poses: [standing({ scale: 1.6 })], time: 0 }, 'move-back', squat).move, 'back');
  assert.equal(guide({ poses: [standing({ scale: .2 })], time: 0 }, 'move-closer', squat).move, 'closer');
  assert.equal(guide({ poses: [standing()], time: 0 }, 'raise-phone', jack).move, 'raise');
});

test('a hidden part in the middle of the picture asks for light and a clear view, not a step', () => {
  const pose = standing({ hide: [15, 16, 13, 14] });
  const g = guide({ poses: [pose], time: 0 }, 'missing', jack);
  assert.deepEqual(g.parts, ['hands']);
  assert.equal(g.move, 'clear');
});

test('nobody in the picture: remembers the side the child left from, for a few seconds only', () => {
  const memory = {};
  guide({ poses: [standing({ dx: -.36 })], time: 1000 }, 'center', squat, memory);
  const left = guide({ poses: [], time: 2500 }, 'missing', squat, memory);
  assert.equal(left.code, 'exit:left');
  assert.equal(left.text, 'יצאת מהתמונה. זוז קצת שמאלה.');
  assert.equal(guide({ poses: [], time: 20000 }, 'missing', squat, memory).code, 'none');
  assert.equal(guide({ poses: [], time: 0 }, 'missing', squat, {}).code, 'none');
  assert.deepEqual(Object.keys(memory), ['last']);
  assert.deepEqual(Object.keys(memory.last).sort(), ['time', 'x']);
});

test('light, a second person and facing are passed through as short lines', () => {
  for (const status of ['dark', 'backlit', 'multiple', 'turn-side', 'face-camera', 'calibrating', 'reacquiring']) {
    const g = guide({ poses: [standing()], time: 0 }, status, squat);
    assert.equal(g.code, status);
    assert.ok(g.text && g.say, status);
  }
});

test('every one of the 50 catalogue exercises gets a concrete instruction when the child is half out', () => {
  assert.equal(EXERCISES.length, 50);
  for (const ex of EXERCISES) {
    const policy = CAMERA_EXERCISES[ex.id];
    assert.ok(policy, ex.id);
    for (const pose of [standing({ dx: -.42 }), standing({ dy: .3 }), null]) {
      const g = guide({ poses: pose ? [pose] : [], time: 0 }, 'missing', policy, {});
      assert.ok(g && g.text.length > 8 && g.say.length > g.text.length, ex.id);
    }
  }
});

test('copy rules: every spoken line is vowel-marked, no exclamation marks, Hebrew letters only', () => {
  const lines = [...Object.values(GUIDE_COPY.PARTS), ...Object.values(GUIDE_COPY.MOVES), ...Object.values(GUIDE_COPY.LINES), GUIDE_COPY.WHOLE];
  const strip = text => text.replace(/[֑-ׇ]/g, '');
  for (const { text, say } of lines) {
    assert.doesNotMatch(text + say, /!/);
    assert.doesNotMatch(text + say, /[؀-ۿݐ-ݿ]/);
    assert.doesNotMatch(text, /[֑-ׇ]/, 'display text carries no vowel marks');
    if (!say) continue;
    assert.match(say, /[ְ-ּ]/);
    // Every word of the reading carries at least one vowel mark, and has the same count of words as the display line.
    for (const word of say.split(/[\s.,]+/).filter(Boolean)) assert.match(word, /[ְ-ּׁׂ]/, word);
    assert.equal(strip(say).split(/\s+/).length, text.split(/\s+/).length, text);
  }
});

test('the voice waits for a steady instruction, does not repeat it at once, and confirms the return', () => {
  const said = [];
  const voice = new GuideVoice({ speak: line => said.push(line) });
  const feet = guide({ poses: [standing({ dy: .2 })], time: 0 }, 'center', squat);
  assert.equal(voice.update(feet, 0), false, 'not on the first frame');
  assert.equal(voice.update(feet, 900), true);
  for (let t = 1000; t < 6000; t += 100) voice.update(feet, t);
  assert.equal(said.length, 1, 'no repeat within the interval');
  for (let t = 6000; t < 9000; t += 100) voice.update(feet, t);
  assert.equal(said.length, 2, 'one reminder after the interval');
  assert.equal(voice.update(null, 12000), true);
  assert.equal(said.at(-1), GUIDE_COPY.LINES.ok.say + '.');
  assert.equal(voice.update(null, 13000), false, 'the confirmation is said once');
  const flicker = new GuideVoice({ speak: line => said.push(line) });
  const before = said.length;
  for (let t = 0; t < 4000; t += 100) flicker.update(t % 200 ? feet : guide({ poses: [], time: t }, 'missing', squat, {}), t);
  assert.equal(said.length, before, 'a flickering verdict stays silent');
  const broken = new GuideVoice({ speak: () => { throw new Error('no voice'); } });
  assert.equal(broken.update(feet, 0), false);
  assert.doesNotThrow(() => broken.update(feet, 900));
});

test('?cameraV1=0 reverts, ?cameraV1=1 opens the page directly, anything else keeps the app with the link', () => {
  assert.equal(cameraV1Enabled(''), true);
  assert.equal(cameraV1Enabled('?cameraV1=0'), false);
  assert.equal(cameraV1Enabled('?cameraV1=1'), true);
  assert.equal(cameraV1Redirect(''), null);
  assert.equal(cameraV1Redirect('?cameraV1=0'), null);
  assert.equal(cameraV1Redirect('?cameraV1=1'), 'camera-v1/');
  assert.equal(cameraV1Redirect('?cameraV1=1&ex=squats&program=jump-a'), 'camera-v1/?ex=squats&program=jump-a');
  assert.equal(cameraV1Redirect('?cameraV1=1&ex=%3Cscript%3E'), 'camera-v1/');
  assert.equal(cameraV1Href('squats'), 'camera-v1/?ex=squats');
  assert.equal(cameraV1Href('../x'), 'camera-v1/');
});

test('the page and its modules stay on the device: strict policy, no recording, storage, upload or outside address', async () => {
  const html = await read('workout/camera-v1/index.html');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /[\u0590-\u05FF][^<]*!/);
  const dir = new URL('workout/js/camera-v1/', root);
  for (const name of await readdir(dir)) {
    const code = await readFile(new URL(name, dir), 'utf8');
    assert.doesNotMatch(code, /MediaRecorder|localStorage|sessionStorage|indexedDB|sendBeacon|WebSocket|XMLHttpRequest|\bfetch\s*\(|serviceWorker\.register|SpeechRecognition|toDataURL|toBlob|captureStream/, name);
    assert.doesNotMatch(code, /https?:\/\/|cdn|unpkg|jsdelivr/i, name);
    assert.doesNotMatch(code, /[؀-ۿ]/, name);
    assert.doesNotMatch(code, /[֐-׿][^'"`\n]*!/, name + ': no exclamation marks in Hebrew copy');
  }
  const capture = await read('workout/js/camera-v1/capture.mjs');
  assert.match(capture, /audio: false/);
  assert.equal(capture.match(/getUserMedia/g).length, 1);
  const session = await read('workout/js/camera-v1/session.mjs');
  // The camera opens only from the start and retry buttons.
  assert.equal(session.match(/startCamera\(\)/g).length, 2, 'declaration and the call inside start()');
  assert.match(session, /node\('camera-start'\)\.onclick = \(\) => start\('camera'\)/);
  assert.match(session, /node\('retry'\)\.onclick = startCamera/);
  assert.match(session, /speakLocal/);
  const worker = await read('workout/js/camera-v1/pose-worker.js');
  assert.match(worker, /vendor\/vision_bundle\.mjs/);
  assert.match(worker, /models\/pose_landmarker_lite\.task/);
});

test('the earlier app is untouched by the flag: index loads app.js, and app.js only adds links', async () => {
  const index = await read('workout/index.html');
  assert.match(index, /src="js\/app\.js\?v=/);
  assert.doesNotMatch(index, /camera-v1/);
  const app = await read('workout/js/app.js');
  assert.equal(app.match(/cameraV1Enabled\(\) \?/g).length, 2);
  assert.match(app, /cameraV1Redirect\(\)/);
  const stage = await read('.github/scripts/stage-pages.py');
  assert.match(stage, /"workout\/camera-v1\/"/);
  assert.match(stage, /workout-camera-exercises-v1/, 'the review pack itself is not published');
});

test('the pack replay: its own 140 checks pass against the wired modules', () => {
  const dir = fileURLToPath(new URL(pack + 'tests/', root));
  const run = spawnSync(process.execPath, ['--test', dir + 'replay.test.mjs', dir + 'tracking.test.mjs'], { encoding: 'utf8', env: cleanEnv });
  assert.equal(run.status, 0, run.stdout.slice(-2000));
  assert.match(run.stdout, /# pass 140/);
  assert.match(run.stdout, /# fail 0/);
});

test('measured on synthetic skeleton recordings (no real child): the numbers the report quotes', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL(pack + 'tests/benchmark.mjs', root))], { encoding: 'utf8', env: cleanEnv, maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  const { totals } = JSON.parse(run.stdout);
  assert.equal(totals.catalog, 50);
  assert.equal(totals.cleanMatches, 50);
  assert.equal(totals.landscapeMatches, 50);
  assert.equal(totals.portraitMatches, 35, 'known gap: hall and four floor exercises stall with the phone upright');
  assert.equal(totals.wrongWithProgress, 0);
  for (const problem of ['dark', 'backlit', 'multiple']) assert.equal(totals.problems[problem].afterWithProgress, 0, problem);
});

test('accuracy sweep on synthetic skeletons: never an extra or a false count; exact at a normal pose rate in a wide picture', () => {
  const wide = { 'wide 4:3': SHAPES['wide 4:3'] }, upright = { 'upright 3:4': SHAPES['upright 3:4'] };
  // Normal conditions: wide picture, 15 pose answers a second, light jitter, normal speed.
  const normal = summary(sweep(undefined, { shapes: wide, steps: [67], jitters: [.003], speeds: [1] }));
  assert.equal(normal.exactPercent, 100);
  assert.equal(normal.shapes['wide 4:3'].exercisesAlwaysExact, 50);
  // Harder: both picture shapes, a slow phone (8 a second) and a fast child. Misses are allowed, inventions are not.
  const rows = sweep(undefined, { shapes: { ...wide, ...upright }, steps: [67, 125], jitters: [.003], speeds: [1, 1.25] });
  const hard = summary(rows);
  assert.equal(hard.extraReps, 0);
  assert.equal(hard.falseRuns, 0);
  assert.equal(hard.wrongRuns, 400);
  assert.ok(hard.steps['15 a second'].exactPercent >= 95, JSON.stringify(hard.steps));
  assert.ok(hard.steps['8 a second'].exactPercent >= 75, JSON.stringify(hard.steps));
  // Known limit, guarded so it is noticed if it changes: three corridor runs need the phone on its side.
  assert.deepEqual(hard.shapes['upright 3:4'].exercisesNeverExact, ['shuttle-run', 'reaction-sprint', 'floor-wall-run']);
  // Jumps that the tracker used to drop at a low pose rate (vertical allowance, 21/11/2026).
  for (const id of ['squat-jumps', 'tuck-jumps', 'step-jumps']) {
    const row = rows.find(candidate => candidate.id === id);
    assert.ok(row.shapes['wide 4:3'].exact >= 3, id + ' ' + JSON.stringify(row.shapes));
  }
});

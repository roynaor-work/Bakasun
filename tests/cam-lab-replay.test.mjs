import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SkeletonRecorder, replayRecording, compactRecording, RECORDING_DURATION } from '../workout/cam-lab/recording.mjs';
import { RepCounter } from '../workout/cam-lab/counter.mjs';
import { runReplay } from '../workout/cam-lab/tools/replay.mjs';
import { pose } from './cam-lab-fixtures.js';

function squatRecording(angle = 110) {
  const recorder = new SkeletonRecorder(); let time = 0;
  recorder.start({ exercise: 'squats', mode: 'solo', thresholds: new RepCounter('squats').t, aspect: 4 / 3 }, 0);
  const send = (sample, frames = 20) => {
    for (let i = 0; i < frames; i++) {
      time += 50; recorder.add([{ landmarks: sample.p, world: sample.world }], time);
    }
  };
  send(pose()); recorder.markCountStart(time); send(pose({ angle })); send(pose()); recorder.stop(time + 25);
  return recorder.recording;
}

test('detailed replay preserves the existing result shape and compares partial threshold overrides', () => {
  const recording = squatRecording(135), original = structuredClone(recording);
  const oldShape = replayRecording(recording);
  assert.deepEqual(Object.keys(oldShape[0]).sort(), ['counted', 'reasons', 'rejected']);
  assert.equal(oldShape[0].counted, 0); assert.equal(oldShape[0].reasons.partial, 1);
  const result = replayRecording(recording, { details: true, thresholds: { squatDown: 145 } });
  assert.equal(result[0].counted, 1); assert.equal(result[0].rejected, 0);
  assert.ok(result[0].diagnostics.frames > 0); assert.ok(result[0].preparation.frames > 0);
  assert.equal(result[0].thresholds.squatDown, 145);
  assert.deepEqual(recording, original, 'שחזור אינו משנה את ההקלטה או הספים המקוריים');
});

test('preparation-only recordings explain zero counts and missing frames in detailed replay', () => {
  const recorder = new SkeletonRecorder();
  recorder.start({ exercise: 'squats', mode: 'solo', thresholds: new RepCounter('squats').t, aspect: 4 / 3 }, 0);
  recorder.add([], 50); recorder.add([], 100); recorder.add([], 150); recorder.stop(200);
  assert.throws(() => replayRecording(recorder.recording), /התחלת ספירה/);
  const [result] = replayRecording(recorder.recording, { details: true });
  assert.equal(result.counted, 0); assert.equal(result.rejected, 0);
  assert.equal(result.stopReasons['no-count-start'], 1);
  assert.equal(result.preparation.frames, 3);
  assert.equal(result.preparation.fullBodyFailed, 3);
  assert.ok(Object.keys(result.preparation.stopReasons).length > 0);
});

test('skeleton recording stops at four minutes and preserves a changed frame aspect', () => {
  const recorder = new SkeletonRecorder();
  recorder.start({ exercise: 'squats', mode: 'solo', thresholds: new RepCounter('squats').t, aspect: 9 / 16 }, 100);
  recorder.add([], 150, 9 / 16); recorder.add([], 200, 3 / 4);
  assert.equal(recorder.recording.frames[0].aspect, undefined);
  assert.equal(recorder.recording.frames[1].aspect, 3 / 4);
  recorder.add([], 100 + RECORDING_DURATION + 1, 3 / 4);
  assert.equal(recorder.active, false); assert.equal(recorder.recording.stopReason, 'duration');
  assert.equal(recorder.recording.endMs, RECORDING_DURATION); assert.equal(recorder.recording.frames.length, 2);
  assert.equal(replayRecording(recorder.recording, { details: true })[0].counted, 0);
});

test('replay rejects malformed time, aspect and unsafe threshold overrides', () => {
  const recording = squatRecording();
  for (const thresholds of [{ typo: 125 }, { squatDown: 0 }, { squatDown: '145' }, [], 145]) {
    assert.throws(() => replayRecording(recording, { thresholds }), /ספים חלופיים/);
  }
  const backwards = structuredClone(recording); backwards.frames[1].t = backwards.frames[0].t;
  assert.throws(() => replayRecording(backwards), /רצף פריימים/);
  const wrongAspect = structuredClone(recording); wrongAspect.frames[1].aspect = 0;
  assert.throws(() => replayRecording(wrongAspect), /רצף פריימים/);
  const lateFrame = structuredClone(recording); lateFrame.frames.at(-1).t = RECORDING_DURATION + 1;
  assert.throws(() => replayRecording(lateFrame), /רצף פריימים/);
  const badEnd = structuredClone(recording); badEnd.endMs = 1;
  assert.throws(() => replayRecording(badEnd), /זמן סיום/);
});

test('replay CLI reads local skeletons and both JSON literal and file threshold overrides', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cam-lab-replay-'));
  try {
    const skeleton = join(directory, 'skeleton.json'), thresholds = join(directory, 'thresholds.json');
    await writeFile(skeleton, JSON.stringify(squatRecording(135)));
    await writeFile(thresholds, JSON.stringify({ thresholds: { squatDown: 145 } }));
    const fromLiteral = await runReplay([skeleton, '--thresholds', '{"squatDown":145}']);
    const fromFile = await runReplay([skeleton, '--thresholds', thresholds]);
    assert.equal(fromLiteral.baseline[0].counted, 0); assert.equal(fromLiteral.override[0].counted, 1);
    assert.deepEqual(fromLiteral, fromFile);
    await assert.rejects(runReplay([skeleton, '--thresholds', '{broken']), SyntaxError);
    await assert.rejects(runReplay([skeleton, '--thresholds']), /נדרש ערך/);
    await assert.rejects(runReplay([skeleton, '--wrong']), /דגל לא מוכר/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('compact upload skeleton retains replay outcomes and keeps four-minute pair records below 40MB', () => {
  const recording = squatRecording(); const compact = compactRecording(recording);
  assert.equal(compact.version,2);assert.equal(compact.pointFormat,'xyzvp');
  assert.deepEqual(replayRecording(compact),replayRecording(recording));
  const point = { x:-.12345678,y:.98765432,z:-.33333333,visibility:.99999999,presence:.99999999 };
  const pose = { landmarks:Array.from({length:33},()=>point),world:Array.from({length:33},()=>point) };
  const full = {...recording, mode:'pair', adultThresholds:recording.thresholds,
    frames:Array.from({length:5760},(_,i)=>({t:(i+1)*240000/5760,poses:[pose,pose]}))};
  assert.ok(Buffer.byteLength(JSON.stringify(compactRecording(full))) < 40_000_000);
  const malformed=compactRecording(recording);malformed.frames[0].poses[0].landmarks[0]=['private'];
  assert.throws(()=>replayRecording(malformed),/דחוסה/);
});

test('replay respects unarmed start and never invents a prior standing reference', () => {
  const recorder = new SkeletonRecorder();const c = new RepCounter('squats');
  recorder.start({exercise:'squats',mode:'solo',thresholds:c.t,aspect:4/3},0);
  recorder.markCountStart(0,[false]);
  for(let i=1;i<=20;i++) recorder.add([{landmarks:pose({angle:110}).p,world:pose({angle:110}).world}],i*50);
  for(let i=21;i<=40;i++) recorder.add([{landmarks:pose().p,world:pose().world}],i*50);
  assert.equal(replayRecording(recorder.recording)[0].counted,0);
});

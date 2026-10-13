import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { FrameCollection, KeyFrameRecorder, MAX_FRAMES, MAX_FRAME_BYTES, extremeScore } from '../workout/cam-lab/keyframes.mjs';
import { RepCounter } from '../workout/cam-lab/counter.mjs';
import { UploadQueue, UPLOAD_PARTS, VIDEO_CHUNK_BYTES } from '../workout/cam-lab/upload.mjs';
import { pose, floorPose, lungePose } from './cam-lab-fixtures.js';

const jpeg = Buffer.from([255, 216, 255, 217]).toString('base64');
const entry = (reason, i = 1, size = 4) => ({ name: `f${String(i).padStart(3, '0')}-rep01-${reason}.jpg`,
  reason, rep: 1, tMs: i, width: 720, height: 1280, landmarks: [], rejectReason: '', jpegBase64: Buffer.alloc(size).toString('base64') });
const bitmap = id => ({ id, width: 720, height: 1280, closed: 0, close() { this.closed++; assert.equal(this.closed, 1); } });
function rig(enabled = true) {
  const images = [], encoded = [];
  const recorder = new KeyFrameRecorder({ session: 'synthetic', startedAt: 0, enabled,
    encode: async image => { assert.equal(image.closed, 0); encoded.push(image.id); return jpeg; } });
  const counter = new RepCounter('squats'); counter.begin(0, true);
  let time = 0;
  const send = (angle, count = 1) => {
    for (let i = 0; i < count; i++) {
      const sample = pose({ angle }); time += 100;
      const image = bitmap(time); images.push(image);
      recorder.frame(image, time, [{ landmarks: sample.p }], counter.count);
      const event = counter.update(sample.p, sample.world, time, .75);
      recorder.observe(counter, event, { landmarks: sample.p, world: sample.world, aspect: .75 });
    }
  };
  return { recorder, counter, send, encoded, images, time: () => time };
}

test('counted repetition retains the actual deepest camera frame, not the return frame; rejected captures the rejection instant', async () => {
  const h = rig(); h.send(180, 5); h.send(145, 5); h.send(100, 4); h.send(80, 1);
  const bottomTime = h.time(); h.send(90, 5); h.send(180, 10);
  assert.equal(h.counter.count, 1); h.send(145, 5); h.send(140, 8); h.send(180, 10);
  assert.equal(h.counter.rejected, 1);
  const result = await h.recorder.stop(), bottom = result.frames.find(f => f.reason === 'bottom');
  assert.equal(bottom.tMs, bottomTime); assert.equal(bottom.rep, 1); assert.equal(bottom.name, 'f001-rep01-bottom.jpg');
  assert.equal(bottom.width, 720); assert.equal(bottom.height, 1280);
  const rejected = result.frames.find(f => f.reason === 'rejected');
  assert.equal(rejected.rejectReason, 'partial'); assert.equal(rejected.rep, 2);
  assert.ok(rejected.tMs > bottomTime); assert.ok(h.encoded.includes(bottomTime));
  assert.ok(h.encoded.includes(rejected.tMs)); assert.ok(h.images.every(i => i.closed === 1));
});

test('interval captures start at five seconds, use detection timestamps and never catch up with duplicate images', async () => {
  const recorder = new KeyFrameRecorder({ session: 'interval', startedAt: 100, encode: async () => jpeg });
  for (const time of [100, 5099, 5100, 5101, 10100, 22100, 22101]) recorder.frame(bitmap(time), time);
  const data = await recorder.stop();
  assert.deepEqual(data.frames.map(f => [f.tMs, f.reason]), [[5000, 'interval'], [10000, 'interval'], [22000, 'interval']]);
});

test('all seven exercises select their own extreme, including raised knees and bridge', () => {
  const knee = pose(); knee.p[25].y = .35;
  const samples = {
    squats: [pose(), pose({ angle: 85 })], lunges: [lungePose(), lungePose({ angle: 95 })],
    'push-ups': [floorPose({ bridge: 180 }), floorPose({ elbow: 85, bridge: 180 })],
    'knee-push-ups': [floorPose({ bridge: 180 }), floorPose({ elbow: 85, bridge: 180 })],
    'glute-bridge': [floorPose(), floorPose({ bridge: 175 })],
    'jumping-jacks': [pose(), pose({ feet: 2.2, hands: .07 })], 'high-knees': [pose(), knee],
  };
  for (const [exercise, [rest, extreme]] of Object.entries(samples))
    assert.ok(extremeScore(exercise, extreme.p, extreme.world, .75) > extremeScore(exercise, rest.p, rest.world, .75), exercise);
});

test('60-image cap evicts intervals first, then bottoms, then oldest rejections', () => {
  const c = new FrameCollection('limits');
  for (let i = 1; i <= MAX_FRAMES; i++) c.add(entry(i === 1 ? 'interval' : i === 2 ? 'bottom' : 'rejected', i));
  c.add(entry('rejected', 61)); c.add(entry('rejected', 62)); c.add(entry('rejected', 63));
  assert.equal(c.snapshot().frames.length, 60);
  assert.deepEqual(c.discarded.map(f => [f.reason, f.name]), [
    ['interval', 'f001-rep01-interval.jpg'], ['bottom', 'f002-rep01-bottom.jpg'], ['rejected', 'f003-rep01-rejected.jpg']]);
  c.add(entry('interval', 64)); assert.equal(c.discarded.at(-1).name, 'f064-rep01-interval.jpg');
});

test('8 MB limit includes Base64, Unicode metadata and JSON envelope, with the same priority order', () => {
  const c = new FrameCollection('bytes');
  for (const [i, reason] of ['interval', 'bottom', 'rejected'].entries()) c.add(entry(reason, i + 1, 2_000_000));
  assert.ok(new Blob([JSON.stringify(c.snapshot())]).size <= MAX_FRAME_BYTES);
  assert.equal(c.totalBytes, new Blob([JSON.stringify(c.snapshot())]).size);
  assert.deepEqual(c.discarded.map(f => f.reason), ['interval']);
  c.add({ ...entry('rejected', 4, 7_000_000), rejectReason: 'סיבה' });
  assert.ok(c.totalBytes <= MAX_FRAME_BYTES);
  assert.deepEqual(c.snapshot().frames.map(f => f.name), ['f002-rep01-bottom.jpg', 'f003-rep01-rejected.jpg']);
  assert.equal(c.discarded.at(-1).name, 'f004-rep01-rejected.jpg');
});

test('private mode never encodes or keeps a bitmap; revocation during asynchronous JPEG discards its result', async () => {
  const h = rig(false); h.send(180, 5); h.send(145, 5); h.send(90, 8); h.send(180, 10);
  assert.deepEqual((await h.recorder.stop()).frames, []); assert.deepEqual(h.encoded, []);
  assert.ok(h.images.every(i => i.closed === 1));
  let finish;
  const recorder = new KeyFrameRecorder({ session: 'revoke', startedAt: 0, encode: () => new Promise(resolve => { finish = resolve; }) });
  const image = bitmap(5000); recorder.frame(image, 5000); await Promise.resolve();
  recorder.cancel(); finish(jpeg); await recorder.stop();
  assert.deepEqual(recorder.snapshot().frames, []); assert.equal(image.closed, 1);
});

test('unfinished/help/tracking rejections keep last detection metadata and independent pair candidates', async () => {
  const h = rig(); h.send(180, 5); h.send(145, 5);
  h.recorder.observe(h.counter, h.counter.finish(h.time()), { landmarks: pose().p });
  const frames = (await h.recorder.stop()).frames;
  assert.equal(frames[0].reason, 'rejected'); assert.equal(frames[0].rejectReason, 'unfinished'); assert.equal(frames[0].tMs, h.time());
  const pair = new KeyFrameRecorder({ session: 'pair', startedAt: 0, encode: async () => jpeg });
  const counters = [new RepCounter('squats'), new RepCounter('squats')];
  for (const c of counters) { c.cycle = {}; c.count = 0; }
  pair.frame(bitmap(100), 100);
  counters.forEach((c, i) => pair.observe(c, null, { landmarks: pose({ angle: 90 }).p, world: pose({ angle: 90 }).world, participant: i }));
  counters.forEach((c, i) => { c.cycle = null; c.count = 1; pair.observe(c, { type: 'counted', count: 1 }, { participant: i }); });
  assert.deepEqual((await pair.stop()).frames.map(f => f.participant), [0, 1]);
});

test('FPS diagnostics compare measured encoding intervals to idle intervals and flag >10% loss', async () => {
  const recorder = new KeyFrameRecorder({ session: 'fps', startedAt: 0, encode: async () => jpeg });
  recorder.frame(bitmap(0), 0); recorder.frame(bitmap(100), 100);
  recorder.capture(recorder.last, { reason: 'bottom', rep: 1, landmarks: [] });
  await Promise.all([...recorder.pending]); recorder.frame(bitmap(225), 225);
  const fps = recorder.diagnostics().fps;
  assert.equal(fps.withImages.fps, 8); assert.equal(fps.withoutImages.fps, 10); assert.equal(fps.passed, false);
  await recorder.stop();
});

test('frames chunks resume across a new worker queue; older three-part records still upload', async () => {
  const config = { endpoint: 'https://example.invalid/receive', secret: 'synthetic-key', consentId: 'test' };
  const records = new Map(), sent = [];
  const store = { put: async r => records.set(r.session, structuredClone(r)), list: async () => [...records.values()].map(r => structuredClone(r)), remove: async id => records.delete(id) };
  const frames = new Blob([JSON.stringify({ version: 1, session: 'chunked', frames: [entry('bottom', 1, 3_000_000)] })], { type: 'application/json' });
  let fail = true;
  const fetchImpl = async (_, options) => {
    const body = JSON.parse(options.body); sent.push(body);
    if (fail && body.part === 'frames' && body.chunk === 1) return { ok: true, json: async () => ({ ok: false, error: 'secret' }) };
    return { ok: true, json: async () => ({ ok: true, assembled: body.chunk === body.chunks - 1, bytes: body.totalBytes }) };
  };
  const queue = new UploadQueue({ config, store, fetchImpl });
  await queue.enqueue({ session: 'chunked', diagnostics: '{}', skeleton: '{}', frames, video: new Blob(['video'], { type: 'video/webm' }) });
  assert.equal(await queue.retry(), false); assert.deepEqual(sent.map(b => [b.part, b.chunk]), [['diagnostics', undefined], ['skeleton', undefined], ['frames', 0], ['frames', 1]]);
  assert.deepEqual(records.get('chunked').parts.find(p => p.part === 'frames').ackedChunks, [0]);
  sent.pop(); fail = false;
  const sw = new UploadQueue({ config, store, fetchImpl, actor: 'sw' }); assert.equal(await sw.retry(), true);
  assert.deepEqual(UPLOAD_PARTS, ['diagnostics', 'skeleton', 'frames', 'video']);
  const chunks = sent.filter(b => b.part === 'frames');
  assert.deepEqual(chunks.map(b => b.chunk), [0, 1, 2]); assert.ok(chunks.every(b => b.mime === 'application/json'));
  assert.equal(Buffer.concat(chunks.map(b => Buffer.from(b.data, 'base64'))).toString(), await frames.text());
  assert.ok(chunks.slice(0, -1).every(b => Buffer.from(b.data, 'base64').length === VIDEO_CHUNK_BYTES && !b.data.includes('=')));
  sent.length = 0;
  await queue.enqueue({ session: 'legacy', diagnostics: '{}', skeleton: '{}', video: new Blob(['old'], { type: 'video/webm' }) });
  assert.equal(await queue.retry(), true); assert.deepEqual(sent.map(b => b.part), ['diagnostics', 'skeleton', 'video']);
});

test('extract tool writes named JPEG files and rejects path traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'extract-frames-'));
  try {
    const file = join(dir, 'frames.json'), frame = { ...entry('bottom'), jpegBase64: jpeg };
    await writeFile(file, JSON.stringify({ version: 1, frames: [frame] }));
    const output = execFileSync('node', ['workout/cam-lab/tools/extract-frames.mjs', file], { encoding: 'utf8' });
    assert.match(output, /bottom/); assert.match(output, /1 JPEGs/);
    assert.deepEqual(await readFile(join(dir, 'frames-images', frame.name)), Buffer.from(jpeg, 'base64'));
    await writeFile(file, JSON.stringify({ version: 1, frames: [{ ...frame, name: '../outside.jpg' }] }));
    assert.throws(() => execFileSync('node', ['workout/cam-lab/tools/extract-frames.mjs', file], { stdio: 'pipe' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

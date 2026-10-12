import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ModelPerformance } from '../workout/cam-lab/camera.mjs';

async function workerRig() {
  const messages = [], models = []; let closed = 0;
  const self = { location: { href: 'https://synthetic.invalid/cam-lab/pose-worker.js' }, postMessage: m => messages.push(m) };
  const visionFixture = { FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: { createFromOptions: async (_, options) => {
      models.push(options.baseOptions.modelAssetPath);
      return { close() {}, setOptions: async () => {}, detectForVideo: () => ({ landmarks: [], worldLandmarks: [] }) };
    } } };
  // Replace module dependencies only; execute the real worker's serialized
  // message handler, FPS decision, detector lifecycle and posted messages.
  const source = (await readFile(new URL('../workout/cam-lab/pose-worker.js', import.meta.url), 'utf8'))
    .replaceAll("await import('./vendor/vision_bundle.mjs')", 'visionFixture')
    .replaceAll("await import('./camera.mjs')", 'cameraFixture');
  const context = vm.createContext({ self, visionFixture, cameraFixture: { ModelPerformance }, URL,
    OffscreenCanvas: class {}, performance: { now: () => 0 } });
  vm.runInContext(source, context);
  const send = async data => { self.onmessage({ data }); await vm.runInContext('work', context); };
  await send({ type: 'init' }); await send({ type: 'configure', generation: 1 });
  return { messages, models, send, frame: (timestamp, counting) => send({ type: 'frame', timestamp, counting,
    generation: 1, id: timestamp, bitmap: { close() { closed++; } } }), get closed() { return closed; } };
}

test('the real worker falls back to lite only during preparation and labels the transition boundary', async () => {
  const r = await workerRig();
  for (let timestamp = 0; timestamp <= 6000; timestamp += 100) await r.frame(timestamp, false);
  assert.equal(r.models.length, 2); assert.match(r.models[1], /pose_landmarker_lite/);
  const switching = r.messages.filter(m => m.type === 'model-switching');
  assert.equal(switching.length, 1); assert.equal(switching[0].timestamp, 5000);
  assert.equal(r.messages.filter(m => m.type === 'model-change').length, 1);
  assert.equal(r.closed, 61);
});

test('beginning to count before the five-second FPS decision prevents mid-set fallback', async () => {
  const r = await workerRig();
  for (let timestamp = 0; timestamp <= 10000; timestamp += 100) await r.frame(timestamp, timestamp >= 3000);
  assert.equal(r.models.length, 1);
  assert.equal(r.messages.some(m => ['model-switching', 'model-change'].includes(m.type)), false);
  assert.equal(r.closed, 101);
  await r.send({ type: 'configure', generation: 2 });
  for (let timestamp = 11000; timestamp <= 17000; timestamp += 100) await r.frame(timestamp, false);
  assert.equal(r.models.length, 2, 'a new attempt can decide again before counting');
});

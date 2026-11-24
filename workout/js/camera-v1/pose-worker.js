// MediaPipe uses importScripts for its existing vendored WASM loader.
const lab = new URL('../../cam-lab/', self.location.href);
let detector, sampler, measureLight;
let lastTime = -Infinity;
let lastLuma = null, lastBoxes = [];

async function init() {
  if (!self.isSecureContext) throw new Error('Secure origin required');
  const { FilesetResolver, PoseLandmarker } = await import(new URL('vendor/vision_bundle.mjs', lab).href);
  ({ measureLight } = await import('./tracking.mjs?v=20261010-camera-1'));
  sampler = new OffscreenCanvas(48, 32).getContext('2d', { willReadFrequently: true });
  const files = await FilesetResolver.forVisionTasks(new URL('vendor/wasm', lab).href);
  detector = await PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('models/pose_landmarker_lite.task', lab).href, delegate: 'CPU' },
    canvas: new OffscreenCanvas(640, 640),
    runningMode: 'VIDEO',
    numPoses: 2,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  self.postMessage({ type: 'ready' });
}

// Everything a person covers, with a margin: the rest of the small picture is background.
function bodyBoxes(poses) {
  return poses.map(pose => {
    const points = pose.landmarks.filter(p => p?.visibility >= 0.3);
    if (points.length < 3) return null;
    const x = points.map(p => p.x), y = points.map(p => p.y);
    return { left: Math.min(...x) - .1, right: Math.max(...x) + .1, top: Math.min(...y) - .12, bottom: Math.max(...y) + .08 };
  }).filter(Boolean);
}

// How much of the background changed since the last frame (0..1), with an overall brightness change taken
// out. The room does not move, so a large value means the phone did. Only a 48x32 brightness grid of the
// last frame is kept, and only inside this worker.
function sceneChange(rgba, poses) {
  const luma = new Uint8Array(48 * 32);
  for (let i = 0; i < luma.length; i++) luma[i] = (54 * rgba[4 * i] + 183 * rgba[4 * i + 1] + 19 * rgba[4 * i + 2]) >> 8;
  const boxes = bodyBoxes(poses), all = [...boxes, ...lastBoxes], before = lastLuma;
  lastLuma = luma; lastBoxes = boxes;
  if (!before) return null;
  const diffs = [];
  for (let i = 0; i < luma.length; i++) {
    const x = (i % 48 + .5) / 48, y = (Math.floor(i / 48) + .5) / 32;
    if (all.some(b => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) continue;
    diffs.push(luma[i] - before[i]);
  }
  if (diffs.length < 200) return null;
  const overall = [...diffs].sort((a, b) => a - b)[diffs.length >> 1];
  return Math.round(1000 * diffs.filter(d => Math.abs(d - overall) > 22).length / diffs.length) / 1000;
}

function lightAt(bitmap, poses) {
  let region;
  if (poses.length === 1) {
    const points = [0, 7, 8, 11, 12, 23, 24].map(index => poses[0].landmarks[index])
      .filter(p => p?.visibility >= 0.5);
    if (points.length >= 3) {
      const x = points.map(p => p.x);
      const y = points.map(p => p.y);
      region = { left: Math.min(...x) - .02, right: Math.max(...x) + .02, top: Math.min(...y) - .02, bottom: Math.max(...y) };
    }
  }
  try {
    sampler.drawImage(bitmap, 0, 0, 48, 32);
    const { data } = sampler.getImageData(0, 0, 48, 32);
    return { light: measureLight(data, { width: 48, height: 32, region }), scene: sceneChange(data, poses) };
  } finally {
    sampler.clearRect(0, 0, 48, 32);
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try { await init(); }
    catch { self.postMessage({ type: 'error' }); }
    return;
  }
  const { bitmap, time } = data;
  if (!bitmap) return;
  try {
    if (!detector || !Number.isFinite(time) || time <= lastTime) throw new Error('Invalid frame');
    lastTime = time;
    const aspect = bitmap.width / bitmap.height;
    const result = detector.detectForVideo(bitmap, time);
    const poses = result.landmarks.map((landmarks, index) => ({ landmarks, world: result.worldLandmarks[index] || [] }));
    self.postMessage({ type: 'pose', time, ...lightAt(bitmap, poses), aspect, poses });
  } catch {
    self.postMessage({ type: 'error' });
  } finally {
    bitmap.close();
  }
};

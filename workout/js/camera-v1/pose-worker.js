// MediaPipe uses importScripts for its existing vendored WASM loader.
const lab = new URL('../../cam-lab/', self.location.href);
let detector, sampler, measureLight;
let lastTime = -Infinity;

async function init() {
  if (self.location.protocol !== 'http:' || self.location.hostname !== '127.0.0.1') {
    throw new Error('Loopback origin required');
  }
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
    return measureLight(sampler.getImageData(0, 0, 48, 32).data, { width: 48, height: 32, region });
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
    self.postMessage({ type: 'pose', time, light: lightAt(bitmap, poses), aspect, poses });
  } catch {
    self.postMessage({ type: 'error' });
  } finally {
    bitmap.close();
  }
};

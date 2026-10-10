// Classic dedicated worker: MediaPipe's WASM loader uses importScripts.
// Dynamic ESM import keeps the original, unmodified npm distribution intact.
let pose, files, PoseLandmarker, performanceWindow;
let lastTimestamp = -1, model = null, numPoses = 1;
let modelHistory = [], switching = false;
const modelOptions = name => ({
  baseOptions: { modelAssetPath: new URL(`./models/pose_landmarker_${name}.task`, self.location.href).href, delegate: 'CPU' },
  canvas: new OffscreenCanvas(720, 1280),
  runningMode: 'VIDEO', numPoses,
  minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5,
  outputSegmentationMasks: false,
});
async function selectModel(name, reason, timestamp = 0, fps = null) {
  // Keep the current detector until its replacement is ready; failed fallback
  // cannot leave an otherwise functioning attempt without a pose detector.
  const replacement = await PoseLandmarker.createFromOptions(files, modelOptions(name));
  pose?.close(); pose = replacement; model = name;
  modelHistory.push({ model: name, reason, timestamp, ...(fps == null ? {} : { fps }) });
}
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const vision = await import('./vendor/vision_bundle.mjs');
      const { ModelPerformance } = await import('./camera.mjs');
      PoseLandmarker = vision.PoseLandmarker;
      files = await vision.FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href);
      numPoses = data.numPoses === 2 ? 2 : 1;
      lastTimestamp = -1; modelHistory = []; performanceWindow = new ModelPerformance();
      try { await selectModel('full', 'initial'); }
      catch (error) {
        modelHistory.push({ model: 'full', reason: 'load-failed', timestamp: 0, error: String(error.message || error) });
        await selectModel('lite', 'full-load-failed');
      }
      self.postMessage({ type: 'ready', model, modelHistory });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error.message || error) });
    }
  } else if (data.type === 'frame') {
    const { bitmap, timestamp, id } = data;
    const started = performance.now();
    try {
      if (!pose || switching || timestamp <= lastTimestamp) throw new Error('Invalid worker frame sequence');
      lastTimestamp = timestamp;
      const result = pose.detectForVideo(bitmap, timestamp);
      const performanceResult = performanceWindow.update(timestamp);
      const fallback = model === 'full' && performanceResult?.fallback;
      if (fallback) {
        switching = true;
        self.postMessage({ type: 'model-switching', model, fps: performanceResult.fps, reason: 'startup-low-fps' });
      }
      self.postMessage({ type: 'pose', id, timestamp,
        poses: result.landmarks.map((landmarks, i) => ({ landmarks, world: result.worldLandmarks[i] || [] })),
        inferenceMs: performance.now() - started, model, modelHistory });
      if (fallback) {
        try {
          await selectModel('lite', 'startup-low-fps', timestamp, performanceResult.fps);
          self.postMessage({ type: 'model-change', model, modelHistory, fps: performanceResult.fps,
            lowerResolution: true, reason: 'startup-low-fps' });
        } catch (error) {
          modelHistory.push({ model: 'lite', reason: 'switch-failed', timestamp, fps: performanceResult.fps, error: String(error.message || error) });
          self.postMessage({ type: 'model-change', model, modelHistory, fps: performanceResult.fps,
            lowerResolution: true, reason: 'switch-failed' });
        } finally { switching = false; }
      }
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error.message || error) });
    } finally { bitmap.close(); }
  }
};

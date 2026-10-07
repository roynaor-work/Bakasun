// Classic dedicated worker: MediaPipe's WASM loader uses importScripts.
// Dynamic ESM import keeps the original, unmodified npm distribution intact.
let pose;
let lastTimestamp = -1;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, PoseLandmarker } = await import('./vendor/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href);
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/pose_landmarker_lite.task', self.location.href).href, delegate: 'CPU' },
        canvas: new OffscreenCanvas(640, 480),
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: .65, minPosePresenceConfidence: .65, minTrackingConfidence: .65,
        outputSegmentationMasks: false,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error.message || error) });
    }
  } else if (data.type === 'frame') {
    const { bitmap, timestamp, id } = data;
    const started = performance.now();
    try {
      if (!pose || timestamp <= lastTimestamp) throw new Error('Invalid worker frame sequence');
      lastTimestamp = timestamp;
      const result = pose.detectForVideo(bitmap, timestamp);
      self.postMessage({ type: 'pose', id, timestamp,
        landmarks: result.landmarks[0] || [], world: result.worldLandmarks[0] || [],
        inferenceMs: performance.now() - started });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error.message || error) });
    } finally { bitmap.close(); }
  }
};

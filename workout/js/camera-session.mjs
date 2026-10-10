import { EXERCISES, RepCounter, PoseFilter, atRest, statusCode, FRAMING } from '../cam-lab/counter.mjs?v=20261010-camera-1';
import { RestGate } from '../cam-lab/feedback.mjs?v=20261010-camera-1';
import { AutoStart } from '../cam-lab/auto-start.mjs?v=20261010-camera-1';
import { PlacementGuide, placementDistance } from '../cam-lab/placement.mjs?v=20261010-camera-1';
import { SkeletonRecorder } from '../cam-lab/recording.mjs?v=20261010-camera-1';
import { VideoRecorder, VIDEO_LIMIT_MS } from '../cam-lab/video-recording.mjs?v=20261010-camera-1';
import { UploadQueue, initializeUploadConfig, createSessionId } from '../cam-lab/upload.mjs?v=20261010-camera-1';

export const APP_VERSION = '20261010-camera-1';
export const cameraSupported = (profile, id) => profile.cameraWorkout === true && EXERCISES.includes(id);
// Supply an empty location: the app router's real fragment is never inspected.
export function readCameraConsent(storage = globalThis.localStorage) {
  return initializeUploadConfig({ location: { hash: '' }, storage }).config;
}
export const cameraExplanation = consent => consent ? 'הסרטון נשלח לבדיקה בסיום' : 'הסרטון לא נשמר ולא יוצא מהטלפון';
export function cameraQueue(onStatus, storage = globalThis.localStorage) {
  const config = readCameraConsent(storage);
  return config ? new UploadQueue({ config, onStatus }) : null;
}

// A new object owns each attempt. All end paths share the same promise and latch.
export class CameraAttempt {
  constructor({ exercise, target, initialCount = 0, queue = null, now = () => performance.now(),
    videoFactory = options => new VideoRecorder(options), skeletonFactory = () => new SkeletonRecorder(undefined, { compact: true }),
    setTimer = setTimeout, clearTimer = clearTimeout, onCue = () => {}, onStart = () => {},
    onCount = () => {}, onReject = () => {}, onFinish = () => {}, onRelease = () => {}, onUploadError = () => {}, onCaptureError = () => {} }) {
    Object.assign(this, { exercise, target, initialCount, queue, now, videoFactory, skeletonFactory, setTimer, clearTimer,
      onCue, onStart, onCount, onReject, onFinish, onRelease, onUploadError, onCaptureError });
    this.setTimer = (...args) => setTimer.call(globalThis, ...args);
    this.clearTimer = (...args) => clearTimer.call(globalThis, ...args);
    this.counter = new RepCounter(exercise); this.preparation = new RepCounter(exercise);
    this.filter = new PoseFilter(exercise, this.counter.t); this.gate = new RestGate(exercise, this.counter.t);
    this.placement = new PlacementGuide(); this.startedAt = null; this.pausedMs = 0; this.pausedAt = null;
    this.introDone = false; this.ended = false; this.frames = 0; this.inference = 0; this.log = [];
    this.camera = {}; this.model = null; this.modelHistory = []; this.runtimeError = null;
    this.auto = new AutoStart({ onCue, onCancel: () => onCue(null), begin: () => this.begin() });
  }
  open(stream, aspect = 1) {
    if (this.ended) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream; this.openedAt = new Date(); this.session = 'app-' + createSessionId(this.exercise, this.openedAt);
    this.origin = this.now();
    if (this.queue?.enabled) {
      this.queue.status?.('recording', 'מקליט לבדיקה');
      this.skeleton = this.skeletonFactory();
      this.skeleton.start({ exercise: this.exercise, mode: 'solo', thresholds: this.counter.t, aspect }, this.origin);
      try {
        this.video = this.videoFactory({ onLimit: () => this.finish('duration-limit'),
          onError: () => { this.videoError = 'video-recording-failed'; this.onCaptureError(); } });
        this.video.start(stream);
      } catch { this.videoError = 'video-recording-unavailable'; this.onCaptureError(); }
    }
    if (this.ended) return;
    this.limitTimer = this.setTimer(() => this.finish('duration-limit'), VIDEO_LIMIT_MS);
  }
  begin() {
    if (this.ended || this.startedAt != null || this.pausedAt != null) return;
    this.startedAt = this.now(); this.counter.begin(this.startedAt, atRest(this.exercise, this.lastFeatures, this.counter.t));
    this.skeleton?.markCountStart(this.startedAt, [true]); this.onCue(null); this.onStart();
  }
  pause() {
    if (this.ended || this.pausedAt != null) return;
    this.pausedAt = this.now(); this.auto.cancel();
    if (this.startedAt != null) this.counter.resetTracking('help');
  }
  resume() {
    if (this.pausedAt == null) return;
    if (this.startedAt != null) this.pausedMs += this.now() - this.pausedAt;
    this.pausedAt = null; this.gate = new RestGate(this.exercise, this.counter.t);
  }
  pose(data, aspect = 1) {
    if (this.ended) return null;
    const { timestamp, inferenceMs = 0 } = data;
    const poses = data.poses || [], p = poses[0];
    this.skeleton?.add(poses, timestamp, aspect);
    this.model = data.model || this.model; this.modelHistory = data.modelHistory || this.modelHistory;
    const interval = this.lastFrame == null ? 0 : timestamp - this.lastFrame;
    this.lastFrame = timestamp; this.frames++; this.inference += inferenceMs;
    const fps = interval > 0 ? 1000 / interval : null;
    const prepared = this.filter.update(p?.landmarks || [], p?.world || [], timestamp, aspect);
    this.lastFeatures = prepared.features;
    const distance = placementDistance(p?.landmarks || [], { aspect });
    const placementCode = this.placement.update(poses, timestamp, aspect);
    let event = null;
    if (this.startedAt == null) {
      this.preparation.update(p?.landmarks || [], p?.world || [], timestamp, aspect);
      const calibrated = this.gate.update(prepared.fresh ? prepared.features : null, timestamp);
      this.auto.update(this.introDone && this.pausedAt == null && calibrated &&
        this.now() - timestamp <= this.counter.t.maxGap, timestamp);
    } else if (this.pausedAt == null && timestamp >= this.startedAt) {
      event = this.counter.update(p?.landmarks || [], p?.world || [], timestamp, aspect);
      if (event?.type === 'counted') {
        this.onCount(this.counter.count);
        if (this.counter.count >= this.target) this.finish('target');
      } else if (event?.type === 'rejected') this.onReject(event.reason);
    }
    const code = this.startedAt == null ? statusCode(prepared.report, 'waiting', !prepared.usable) : this.counter.status;
    this.log.push({ frame: data.id, timestamp: timestamp - (this.origin ?? timestamp), fps, inferenceMs,
      status: code, phase: this.counter.phase, paused: this.pausedAt != null, placement: placementCode });
    if (this.log.length > 900) this.log.shift();
    return { poses, prepared, event, fps, distance, code, placementCode };
  }
  diagnostics(reason) {
    return { appVersion: APP_VERSION, session: this.session, exercise: this.exercise, target: this.target + this.initialCount,
      initialCount: this.initialCount, counted: this.counter.count, totalCounted: this.initialCount + this.counter.count,
      endReason: reason, openedAt: this.openedAt?.toISOString(),
      countStarted: this.startedAt != null, countNotStartedReason: this.startedAt == null ? 'no-count-start' : null,
      camera: this.camera, model: this.model, modelHistory: this.modelHistory, userAgent: globalThis.navigator?.userAgent || '',
      thresholds: this.counter.t, framing: FRAMING, totalFrames: this.frames,
      inferenceMs: this.inference / Math.max(1, this.frames), videoError: this.videoError || null,
      runtimeError: this.runtimeError, preparation: this.preparation.snapshot(),
      attempts: [{ counted: this.counter.count, rejected: this.counter.rejected, reasons: this.counter.reasons, ...this.counter.snapshot() }],
      performance: this.log, pausedMs: this.pausedMs };
  }
  finish(reason = 'finish') {
    if (this.ended) return this.finished;
    this.ended = true; this.auto.cancel(); this.clearTimer(this.limitTimer);
    const end = this.now(); this.counter.finish(end); this.skeleton?.stop(end);
    const seconds = this.startedAt == null ? 0 : Math.max(0, (end - this.startedAt - this.pausedMs -
      (this.pausedAt == null ? 0 : end - this.pausedAt)) / 1000);
    const result = { count: this.counter.count, seconds, reason };
    const skeleton = this.skeleton?.json({ compact: true });
    // Stop detection/rendering synchronously; leave tracks alive for the final video chunk.
    this.onRelease();
    this.finished = (async () => {
      let video;
      try { video = await this.video?.stop(); }
      catch { this.videoError = 'video-stop-failed'; }
      finally { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (skeleton && this.queue?.enabled) {
        if (!video?.size) this.videoError ||= 'empty-video';
        try {
          await this.queue.enqueue({ session: this.session, video: video || new Blob([], { type: 'video/webm' }),
            skeleton, diagnostics: this.diagnostics(reason) });
          const drained = await this.queue.retry();
          // A preceding drain can finish its empty snapshot as this save completes.
          // Start another drain only after success; failed uploads wait for retry.
          if (drained && this.queue.pending > 0) await this.queue.retry();
          if (this.videoError && this.queue.enabled) this.onUploadError('recording');
        } catch { this.onUploadError(); }
      }
      return result;
    })();
    this.onFinish(result);
    return this.finished;
  }
}

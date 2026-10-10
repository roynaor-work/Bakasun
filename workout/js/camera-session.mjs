// App lifecycle around the lab's unchanged counting and recording modules.
import { EXERCISES, RepCounter, PoseFilter, statusCode } from '../cam-lab/counter.mjs?v=20261010-camera-1';
import { RestGate } from '../cam-lab/feedback.mjs?v=20261010-camera-1';
import { placementDistance } from '../cam-lab/placement.mjs?v=20261010-camera-1';
import { SkeletonRecorder } from '../cam-lab/recording.mjs?v=20261010-camera-1';
import { VideoRecorder, VIDEO_LIMIT_MS } from '../cam-lab/video-recording.mjs?v=20261010-camera-1';
import { UploadQueue, initializeUploadConfig, createSessionId } from '../cam-lab/upload.mjs?v=20261010-camera-1';

export const APP_VERSION = '20261010-camera-1';
export const cameraAvailable = (profile, id) => profile.camera === true && EXERCISES.includes(id);
// Never pass the application's router fragment to the lab initializer.
export const readCameraConsent = storage => initializeUploadConfig({ storage, location: { hash: '' } }).config;
export const cameraPrivacy = enabled => enabled ? 'הסרטון נשלח לבדיקה בסיום' : 'הסרטון לא נשמר ולא יוצא מהטלפון';

export class CameraUploads {
  constructor({ storage, onStatus = () => {}, queueFactory = options => new UploadQueue(options) } = {}) {
    this.storage = storage; this.onStatus = onStatus; this.queueFactory = queueFactory; this.unsaved = new Map(); this.saving = new Map(); this.videoMissing = new Set();
    this.refresh();
  }
  refresh() {
    const config = readCameraConsent(this.storage);
    if (JSON.stringify(config) === JSON.stringify(this.config)) return;
    const disabling = this.queue?.disable();
    this.ready = Promise.allSettled([this.ready, disabling]);
    this.unsaved.clear(); this.videoMissing.clear(); this.config = config;
    this.queue = config ? this.queueFactory({ config, onStatus: status => this.onStatus(status.state === 'sent' && this.videoMissing.has(status.session) ?
      { ...status, state: 'error', message: 'הסרטון חסר. נסה שוב עם המצלמה' } : status) }) : null;
  }
  send(payload, queue = this.queue) {
    if (this.saving.has(payload.session)) return this.saving.get(payload.session);
    const saving = this.saveAndSend(payload, queue).finally(() => this.saving.delete(payload.session));
    this.saving.set(payload.session, saving);
    return saving;
  }
  async saveAndSend(payload, queue) {
    await this.ready;
    // An attempt stays bound to the consent under which it was opened.
    if (!queue?.enabled || queue !== this.queue) return;
    if (!payload.video.size) this.videoMissing.add(payload.session);
    this.unsaved.set(payload.session, payload);
    try { await queue.enqueue(payload); this.unsaved.delete(payload.session); }
    catch { this.onStatus({ state: 'error', message: 'לא נשמר. השאר פתוח ונסה שוב' }); return; }
    await queue.retry();
  }
  async retry() {
    await this.ready;
    if (!this.queue?.enabled) return;
    for (const payload of [...this.unsaved.values()]) await this.send(payload);
    return this.queue.retry();
  }
}

export class CameraAttempt {
  constructor({ exercise, target, initialCount = 0, uploads, profile = {}, now = () => performance.now(),
    onCue = () => {}, onStart = () => {}, onCount = () => {}, onRejected = () => {}, onEnd = () => {},
    makeVideo = options => new VideoRecorder(options), makeSkeleton = () => new SkeletonRecorder(undefined, { compact: true }) }) {
    this.exercise = exercise; this.target = target; this.initialCount = initialCount; this.uploads = uploads;
    this.now = now; this.onCue = onCue; this.onStart = onStart; this.onCount = onCount;
    this.onRejected = onRejected; this.onEnd = onEnd; this.makeVideo = makeVideo; this.makeSkeleton = makeSkeleton;
    this.counter = new RepCounter(exercise, profile); this.probe = new RepCounter(exercise, profile);
    this.filter = new PoseFilter(exercise, this.counter.t); this.gate = new RestGate(exercise, this.counter.t);
    this.state = 'preparing'; this.introDone = false; this.pauseMs = 0; this.frames = 0; this.inferenceMs = 0;
    this.camera = {}; this.modelHistory = []; this.runtimeError = null; this.videoError = null;
    this.released = new Promise(resolve => { this.resolveReleased = resolve; });
  }
  open(stream) {
    this.stream = stream; this.openedAt = this.now(); this.session = `app-${createSessionId(this.exercise)}`;
    this.queue = this.uploads?.queue;
    // Start capture immediately, before video playback, zoom or model loading.
    if (this.queue?.enabled) {
      this.skeleton = this.makeSkeleton();
      this.skeleton.start({ exercise: this.exercise, mode: 'solo', thresholds: this.counter.t, aspect: 1 }, this.openedAt);
      try {
        this.video = this.makeVideo({ onLimit: () => this.finish('limit'), onError: () => { this.videoError = 'recording-failed'; } });
        this.video.start(stream);
      } catch { this.videoError = 'recording-unavailable'; }
      this.uploads.onStatus({ state: 'recording', session: this.session, message: 'מצלמים את התרגיל' });
    }
  }
  seconds(time = this.now()) {
    return this.countStarted == null ? 0 : Math.max(0, (time - this.countStarted - this.pauseMs - (this.pausedAt == null ? 0 : time - this.pausedAt)) / 1000);
  }
  frame({ poses = [], timestamp, inferenceMs = 0, model, modelHistory }, aspect = 1) {
    if (this.ending || this.openedAt == null || timestamp < this.openedAt) return null;
    if (timestamp - this.openedAt >= VIDEO_LIMIT_MS) { this.finish('limit'); return null; }
    this.frames++; this.inferenceMs += inferenceMs; this.model = model; this.modelHistory = modelHistory || this.modelHistory;
    this.skeleton?.add(poses, timestamp, aspect);
    const pose = poses[0], points = pose?.landmarks || [], world = pose?.world || [];
    const prepared = this.filter.update(points, world, timestamp, aspect);
    const distance = placementDistance(points, { aspect });
    let code = statusCode(prepared.report, 'waiting', !prepared.usable);
    let event = null;
    if (this.state === 'preparing' || this.state === 'countdown') {
      this.probe.update(points, world, timestamp, aspect);
      const calibrated = this.gate.update(prepared.fresh ? prepared.features : null, timestamp);
      if (this.state === 'countdown' && !calibrated) { this.state = 'preparing'; this.countdownAt = null; }
      if (calibrated && this.introDone) {
        if (this.state === 'preparing') { this.state = 'countdown'; this.countdownAt = timestamp; this.cue = null; }
        const left = Math.max(0, 3 - Math.floor((timestamp - this.countdownAt) / 1000));
        if (left > 0 && this.cue !== left) { this.cue = left; this.onCue(left); }
        if (left === 0) {
          this.state = 'counting'; this.countStarted = timestamp;
          this.counter.begin(timestamp, true); this.skeleton?.markCountStart(timestamp, [true]); this.onStart();
        }
      }
    } else if (this.state === 'counting' && timestamp > (this.resumeAt ?? -Infinity)) {
      event = this.counter.update(points, world, timestamp, aspect); code = this.counter.status;
      if (event?.type === 'counted') {
        this.onCount(this.initialCount + event.count, this.seconds(timestamp), timestamp);
        if (this.initialCount + event.count >= this.target) this.finish('target');
      } else if (event?.type === 'rejected') this.onRejected(event.reason);
    }
    return { state: this.state, code, distance, event, phase: this.counter.phase };
  }
  help(open) {
    if (this.ending) return;
    if (open && this.state !== 'paused') {
      this.beforeHelp = this.state; this.state = 'paused'; this.pausedAt = this.now();
      this.counter.resetTracking('help');
    } else if (!open && this.state === 'paused') {
      if (this.countStarted != null) this.pauseMs += this.now() - this.pausedAt;
      this.pausedAt = null; this.resumeAt = this.now();
      this.state = this.countStarted == null ? 'preparing' : 'counting';
      this.gate = new RestGate(this.exercise, this.counter.t); this.filter.reset();
    }
  }
  finish(reason = 'finish') {
    if (this.ending) return this.ending;
    // Lock before callbacks or awaits: target, exit and both limits can coincide.
    let resolve;
    this.ending = new Promise(done => { resolve = done; });
    const endedAt = this.now(); this.state = 'finished'; this.endReason = reason;
    this.counter.finish(endedAt); this.skeleton?.stop(endedAt);
    this.result = { counted: this.initialCount + this.counter.count, seconds: this.seconds(endedAt), reason };
    if (this.skeleton && this.queue?.enabled) this.uploads.onStatus({ state: 'stopping', session: this.session, message: 'מסיימים ושולחים' });
    // Capture must finish even if rendering the next screen fails.
    try { this.onEnd(this.result); }
    finally { void this.finalize().catch(() => {}).finally(resolve); }
    return this.ending;
  }
  async finalize() {
    let video;
    try { video = await this.video?.stop(); if (this.queue && !video?.size) this.videoError ||= 'empty-video'; }
    catch { this.videoError ||= 'recording-failed'; }
    finally { this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; this.resolveReleased(); }
    if (!this.skeleton || !this.queue?.enabled) return;
    const diagnostics = { appVersion: APP_VERSION, session: this.session, exercise: this.exercise,
      target: this.target, counted: this.result.counted, attemptCount: this.counter.count, endReason: this.endReason,
      seconds: this.result.seconds, camera: this.camera, model: this.model, modelHistory: this.modelHistory,
      totalFrames: this.frames, inferenceMs: this.inferenceMs / Math.max(1, this.frames),
      thresholds: this.counter.t, preparation: this.probe.snapshot(), diagnostics: this.counter.snapshot(),
      rejected: this.counter.rejected, reasons: this.counter.reasons, videoError: this.videoError, runtimeError: this.runtimeError };
    await this.uploads.send({ session: this.session, video: video || new Blob([], { type: 'video/webm' }),
      skeleton: this.skeleton.json({ compact: true }), diagnostics }, this.queue);
  }
}

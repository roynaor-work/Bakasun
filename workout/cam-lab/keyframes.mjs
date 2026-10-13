import { bodyReport, features } from './counter.mjs';

export const FRAME_INTERVAL_MS = 5000;
export const MAX_FRAMES = 60;
// Bound the complete JSON (including Base64 and metadata), not just JPEG bytes.
export const MAX_FRAME_BYTES = 8_000_000;
export const JPEG_QUALITY = .85;
const priority = { interval: 0, bottom: 1, rejected: 2 };
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

export class FrameCollection {
  constructor(session, { maxFrames = MAX_FRAMES, maxBytes = MAX_FRAME_BYTES } = {}) {
    Object.assign(this, { session, maxFrames, maxBytes });
    this.entries = []; this.discarded = []; this.sequence = 0;
  }
  add(frame) {
    const entry = { frame, order: ++this.sequence, bytes: bytes(frame) };
    if (entry.bytes + bytes({ version: 1, session: this.session, frames: [] }) > this.maxBytes) {
      this.discard(frame); return;
    }
    this.entries.push(entry);
    while (this.entries.length > this.maxFrames || this.totalBytes > this.maxBytes) {
      const victim = [...this.entries].sort((a, b) => priority[a.frame.reason] - priority[b.frame.reason] || a.frame.tMs - b.frame.tMs || a.frame.name.localeCompare(b.frame.name))[0];
      this.entries.splice(this.entries.indexOf(victim), 1);
      this.discard(victim.frame);
    }
  }
  discard({ name, tMs, reason, rep, participant }) {
    this.discarded.push({ name, tMs, reason, rep, ...(participant == null ? {} : { participant }), cause: 'limit' });
  }
  get totalBytes() {
    return bytes({ version: 1, session: this.session, frames: [] }) +
      this.entries.reduce((sum, entry) => sum + entry.bytes, 0) + Math.max(0, this.entries.length - 1);
  }
  snapshot() {
    return { version: 1, session: this.session, frames: [...this.entries]
      .sort((a, b) => a.frame.tMs - b.frame.tMs || a.order - b.order).map(entry => entry.frame) };
  }
  diagnostics() {
    return { count: this.entries.length, totalBytes: this.totalBytes,
      jpegBytes: this.entries.reduce((sum, e) => sum + e.frame.jpegBase64.length * 3 / 4 - (e.frame.jpegBase64.endsWith('==') ? 2 : e.frame.jpegBase64.endsWith('=') ? 1 : 0), 0),
      maxFrames: this.maxFrames, maxBytes: this.maxBytes, discarded: [...this.discarded] };
  }
}

// Observe the existing counter; never alter its thresholds, state or events.
export function extremeScore(exercise, points, world, aspect, side) {
  const f = features(points, world, aspect, bodyReport(points, aspect, exercise, { side }));
  if (!f) return null;
  const value = exercise === 'squats' ? (side === 0 ? f.leftKnee : side === 1 ? f.rightKnee : f.squat) :
    exercise === 'lunges' ? f.lunge : ['push-ups', 'knee-push-ups'].includes(exercise) ? f.elbow :
    exercise === 'glute-bridge' ? f.bridge : exercise === 'jumping-jacks' ? f.feet + f.wristRise :
    side === 0 ? f.leftRise : side === 1 ? f.rightRise : Math.max(f.leftRise ?? -Infinity, f.rightRise ?? -Infinity);
  if (value == null) return null;
  const score = ['squats', 'lunges', 'push-ups', 'knee-push-ups'].includes(exercise) ? -value : value;
  return Number.isFinite(score) ? score : null;
}

// Encoding runs on a separate worker. createImageBitmap clones only selected
// images, from the very bitmap used by inference, never from a later video frame.
export class JpegEncoder {
  constructor() { this.jobs = new Map(); this.sequence = 0; }
  async encode(source) {
    const bitmap = await createImageBitmap(source);
    if (this.closed) { bitmap.close(); throw new Error('jpeg-cancelled'); }
    if (globalThis.Worker && globalThis.OffscreenCanvas) {
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL('./frame-encoder.mjs?v=20261013-frames-1', import.meta.url), { type: 'module' });
          this.worker.onmessage = ({ data }) => {
            const job = this.jobs.get(data.id); if (!job) return;
            this.jobs.delete(data.id);
            data.error ? job.reject(new Error('jpeg-encoding')) : job.resolve(data.jpegBase64);
          };
          this.worker.onerror = () => this.close();
        }
        return await new Promise((resolve, reject) => {
          const id = ++this.sequence;
          const timer = setTimeout(() => { this.jobs.delete(id); reject(new Error('jpeg-timeout')); }, 15000);
          this.jobs.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
          this.worker.postMessage({ id, bitmap, quality: JPEG_QUALITY }, [bitmap]);
        });
      } catch { bitmap.close(); throw new Error('jpeg-encoding'); }
    }
    try {
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('jpeg-encoding');
      const buffer = new Uint8Array(await blob.arrayBuffer()), chunks = [];
      for (let i = 0; i < buffer.length; i += 32768) chunks.push(String.fromCharCode(...buffer.subarray(i, i + 32768)));
      return btoa(chunks.join(''));
    } finally { bitmap.close(); }
  }
  close() {
    this.closed = true;
    this.worker?.terminate(); this.worker = null;
    for (const job of this.jobs.values()) job.reject(new Error('jpeg-encoding'));
    this.jobs.clear();
  }
}

const hold = ref => { if (ref) ref.users++; return ref; };
const release = ref => { if (ref && --ref.users === 0) ref.bitmap.close(); };

export class KeyFrameRecorder {
  constructor({ session, startedAt, enabled = true, encode, encoder = new JpegEncoder(), ...limits }) {
    Object.assign(this, { session, startedAt, enabled, encoder });
    this.encode = encode || (bitmap => encoder.encode(bitmap));
    this.collection = new FrameCollection(session, limits);
    this.nextInterval = startedAt + FRAME_INTERVAL_MS;
    this.candidates = new Map(); this.lastPoints = new Map(); this.pending = new Set(); this.errors = [];
    this.sequence = 0; this.closed = false;
    this.fpsSamples = { withImages: { intervals: 0, ms: 0 }, withoutImages: { intervals: 0, ms: 0 } };
  }
  // Takes ownership of a bitmap returned by pose-worker. At most one current
  // frame and one extreme per participant are retained between detections.
  frame(bitmap, timestamp, poses = [], rep = 0) {
    if (!this.enabled || this.closed) { bitmap?.close(); return; }
    if (this.previousTime != null && timestamp > this.previousTime) {
      const sample = this.fpsSamples[this.pending.size || this.encodedSinceFrame ? 'withImages' : 'withoutImages'];
      sample.intervals++; sample.ms += timestamp - this.previousTime;
    }
    this.previousTime = timestamp; this.encodedSinceFrame = false;
    release(this.last); this.last = null;
    if (!bitmap) return;
    this.last = { bitmap, timestamp, users: 1, landmarks: poses[0]?.landmarks || [] };
    if (timestamp >= this.nextInterval) {
      this.capture(this.last, { reason: 'interval', rep, landmarks: this.last.landmarks });
      this.nextInterval = this.startedAt + (Math.floor((timestamp - this.startedAt) / FRAME_INTERVAL_MS) + 1) * FRAME_INTERVAL_MS;
    }
  }
  observe(counter, event, { landmarks, world = [], aspect = 1, participant, initialCount = 0 } = {}) {
    if (!this.enabled || this.closed || !this.last) return;
    const key = participant ?? 0, candidate = this.candidates.get(key);
    landmarks ??= this.lastPoints.get(key) || this.last.landmarks;
    this.lastPoints.set(key, landmarks);
    if (event?.type === 'counted' && candidate) {
      this.capture(candidate.ref, { ...candidate.meta, reason: 'bottom', rep: initialCount + event.count });
    } else if (event?.type === 'rejected') {
      this.capture(this.last, { reason: 'rejected', rep: initialCount + counter.count + 1, rejectReason: event.reason,
        landmarks, ...(participant == null ? {} : { participant }) });
    }
    if (candidate && (event?.type === 'counted' || event?.type === 'rejected' || candidate.cycle !== counter.cycle)) {
      release(candidate.ref); this.candidates.delete(key);
    }
    if (!counter.cycle) return;
    const score = extremeScore(counter.exercise, landmarks, world, aspect, counter.cycle.observationSide);
    const current = this.candidates.get(key);
    if (score != null && (!current || score > current.score)) {
      release(current?.ref);
      this.candidates.set(key, { cycle: counter.cycle, score, ref: hold(this.last),
        meta: { landmarks: structuredClone(landmarks), ...(participant == null ? {} : { participant }) } });
    }
  }
  capture(ref, meta) {
    if (!ref || !this.enabled || this.closed) return;
    hold(ref); this.encodedSinceFrame = true;
    const frame = { name: `f${String(++this.sequence).padStart(3, '0')}-rep${String(meta.rep).padStart(2, '0')}-${meta.reason}.jpg`,
      tMs: Math.max(0, Math.round(ref.timestamp - this.startedAt)), rejectReason: '', ...meta,
      landmarks: structuredClone(meta.landmarks), width: ref.bitmap.width, height: ref.bitmap.height };
    const job = Promise.resolve().then(() => this.encode(ref.bitmap)).then(jpegBase64 => {
      if (this.enabled) this.collection.add({ ...frame, jpegBase64 });
    }).catch(() => { if (this.enabled) this.errors.push({ name: frame.name, reason: 'jpeg-encoding' }); })
      .finally(() => { release(ref); this.pending.delete(job); });
    this.pending.add(job);
  }
  snapshot() { return this.collection.snapshot(); }
  diagnostics() {
    const samples = Object.fromEntries(Object.entries(this.fpsSamples).map(([key, s]) => [key,
      { fps: s.ms ? s.intervals * 1000 / s.ms : null, intervals: s.intervals, elapsedMs: s.ms }]));
    const drop = samples.withImages.fps != null && samples.withoutImages.fps != null ?
      Math.max(0, 100 * (1 - samples.withImages.fps / samples.withoutImages.fps)) : null;
    return { ...this.collection.diagnostics(), errors: [...this.errors], fps: { ...samples,
      sampling: 'encoding-pending-vs-idle', dropPercent: drop, passed: drop == null ? null : drop <= 10 } };
  }
  clearBitmaps() {
    release(this.last); this.last = null;
    for (const candidate of this.candidates.values()) release(candidate.ref);
    this.candidates.clear(); this.lastPoints.clear();
  }
  async stop() {
    this.closed = true; this.clearBitmaps();
    await Promise.all([...this.pending]); this.encoder.close();
    return this.snapshot();
  }
  cancel() {
    this.enabled = false; this.closed = true; this.clearBitmaps(); this.encoder.close();
    this.collection = new FrameCollection(this.session);
  }
}

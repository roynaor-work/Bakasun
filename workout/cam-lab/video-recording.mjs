import { MAX_UPLOAD_BYTES } from './upload.mjs';
export const VIDEO_LIMIT_MS = 4 * 60 * 1000;
export const VIDEO_BITRATE = 1200000;
const recordingError = 'המכשיר לא הצליח להקליט וידאו לבדיקה. נסו דפדפן מעודכן; הניסיון עדיין לא נשלח.';

export function chooseVideoMime(MediaRecorderClass = globalThis.MediaRecorder, userAgent = globalThis.navigator?.userAgent || '') {
  if (!MediaRecorderClass?.isTypeSupported) return null;
  const webm = ['video/webm;codecs=vp8', 'video/webm'], mp4 = ['video/mp4', 'video/mp4;codecs=avc1.42E01E'];
  const candidates = /iPhone|iPad|iPod/i.test(userAgent) ? [...mp4, ...webm] : [...webm, ...mp4];
  return candidates.find(mime => MediaRecorderClass.isTypeSupported(mime)) || null;
}

// This class is created and started only after the parent opts into upload.
// stop() resolves after the final dataavailable + stop events, so callers must
// await it before stopping the camera's tracks.
export class VideoRecorder {
  constructor({ MediaRecorderClass = globalThis.MediaRecorder, MediaStreamClass = globalThis.MediaStream,
    onLimit = () => {}, onError = () => {}, limitMs = VIDEO_LIMIT_MS,
    setTimer = setTimeout, clearTimer = clearTimeout, stopTimeoutMs = 10000 } = {}) {
    this.MediaRecorderClass = MediaRecorderClass; this.MediaStreamClass = MediaStreamClass;
    this.onLimit = onLimit; this.onError = onError; this.limitMs = Math.min(limitMs, VIDEO_LIMIT_MS);
    this.setTimer = (...args) => setTimer.call(globalThis, ...args);
    this.clearTimer = (...args) => clearTimer.call(globalThis, ...args); this.stopTimeoutMs = stopTimeoutMs;
    this.recorder = null; this.active = false; this.chunks = []; this.bytes = 0; this.error = null;
  }
  start(stream) {
    if (this.active || (this.recorder && !this.settled)) throw new Error('הקלטת הווידאו כבר פעילה.');
    const mimeType = chooseVideoMime(this.MediaRecorderClass);
    if (!mimeType || !this.MediaStreamClass || !stream?.getVideoTracks?.().length) throw new Error(recordingError);
    this.chunks = []; this.bytes = 0; this.error = null; this.blob = null; this.stopping = false; this.settled = false;
    // Never include microphone/audio tracks, even if a supplied stream has one.
    const videoStream = new this.MediaStreamClass(stream.getVideoTracks());
    try { this.recorder = new this.MediaRecorderClass(videoStream, { mimeType, videoBitsPerSecond: VIDEO_BITRATE }); }
    catch { throw new Error(recordingError); }
    this.mime = this.recorder.mimeType || mimeType;
    this.finished = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    // An asynchronous recorder error can happen before the caller requests stop.
    // Keep the rejection handled until stop() exposes it to the caller.
    this.finished.catch(() => {});
    this.recorder.ondataavailable = event => {
      if (!event.data?.size) return;
      this.bytes += event.data.size;
      if (this.bytes > MAX_UPLOAD_BYTES) {
        this.error = new Error('הווידאו עבר את מגבלת 40MB. הניסיון לא נשלח; התחילו ניסיון קצר יותר.');
        this.requestStop(); this.onError(this.error.message); return;
      }
      this.chunks.push(event.data);
    };
    this.recorder.onerror = () => {
      this.error = new Error(recordingError); this.requestStop(); this.onError(this.error.message);
    };
    this.recorder.onstop = () => this.finish();
    try { this.recorder.start(1000); }
    catch { this.error = new Error(recordingError); this.finish(); throw this.error; }
    this.active = true;
    this.limitTimer = this.setTimer(() => {
      if (!this.active) return;
      this.requestStop(); this.onLimit('הניסיון הגיע למגבלת ארבע דקות. ההקלטה הסתיימה ונשלחת לבדיקה.');
    }, this.limitMs);
    return this.mime;
  }
  requestStop() {
    this.clearTimer(this.limitTimer); this.active = false;
    if (!this.recorder || this.stopping) return;
    this.stopping = true;
    if (this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { this.error = new Error(recordingError); this.finish(); return; }
    }
    if (this.settled) return;
    this.stopTimer = this.setTimer(() => {
      this.error ||= new Error('הקלטת הווידאו לא הסתיימה. נסו ניסיון חדש בדפדפן מעודכן.'); this.finish();
    }, this.stopTimeoutMs);
  }
  finish() {
    if (this.settled) return;
    this.settled = true; this.active = false;
    this.clearTimer(this.limitTimer); this.clearTimer(this.stopTimer);
    if (this.error) this.reject(this.error);
    else { this.blob = new Blob(this.chunks, { type: this.mime }); this.resolve(this.blob); }
    this.chunks = [];
  }
  stop() {
    if (!this.recorder) return Promise.resolve(null);
    this.requestStop(); return this.finished;
  }
}

const PERIOD_MS = 62;
const FRAME_TIMEOUT_MS = 5000;
const START_TIMEOUT_MS = 25000;
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());

export class LocalCapture {
  constructor(video, { onPose, onReady, onError }) {
    this.video = video;
    this.onPose = onPose;
    this.onReady = onReady;
    this.onError = onError;
    this.cancelled = false;
    this.lastFrame = -1;
  }

  async start() {
    this.watchdog = setTimeout(() => this.fail('timeout'), START_TIMEOUT_MS);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      });
      if (this.cancelled) { stopTracks(stream); return; }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => this.fail('ended'), { once: true });
      this.video.srcObject = stream;
      await this.video.play();
      if (this.cancelled) return;
      this.worker = new Worker(new URL('./pose-worker.js', import.meta.url));
      this.worker.onmessage = ({ data }) => this.receive(data);
      this.worker.onerror = () => this.fail('worker');
      this.worker.onmessageerror = () => this.fail('worker');
      this.worker.postMessage({ type: 'init' });
    } catch (error) {
      this.fail(error.name === 'NotAllowedError' || error.name === 'SecurityError' ? 'permission' : 'unavailable');
    }
  }

  receive(data) {
    if (this.cancelled) return;
    clearTimeout(this.watchdog);
    if (data.type === 'ready') {
      this.onReady();
      this.schedule(FRAME_TIMEOUT_MS);
    } else if (data.type === 'pose') {
      this.onPose(data);
      this.schedule(FRAME_TIMEOUT_MS);
    } else {
      this.fail('worker');
    }
  }

  schedule(timeout) {
    if (this.cancelled) return;
    this.watchdog = setTimeout(() => this.fail('timeout'), timeout);
    this.tick = setTimeout(() => this.frame(), PERIOD_MS);
  }

  async frame() {
    if (this.cancelled) return;
    const { videoWidth, videoHeight, currentTime } = this.video;
    if (!videoWidth || !videoHeight || this.lastFrame === currentTime) {
      this.tick = setTimeout(() => this.frame(), PERIOD_MS);
      return;
    }
    this.lastFrame = currentTime;
    const time = performance.now();
    let bitmap;
    try {
      const scale = Math.min(1, 640 / Math.max(videoWidth, videoHeight));
      bitmap = await createImageBitmap(this.video, { resizeWidth: Math.round(scale * videoWidth), resizeHeight: Math.round(scale * videoHeight) });
      if (!this.cancelled) {
        this.worker.postMessage({ type: 'frame', time, bitmap }, [bitmap]);
        bitmap = null;
      }
    } catch {
      this.fail('worker');
    } finally {
      bitmap?.close();
    }
  }

  fail(reason) {
    if (this.cancelled) return;
    this.close();
    this.onError(reason);
  }

  close() {
    if (this.cancelled) return;
    this.cancelled = true;
    clearTimeout(this.watchdog);
    clearTimeout(this.tick);
    this.worker?.terminate();
    stopTracks(this.stream);
    this.video.pause();
    this.video.srcObject = null;
    this.stream = this.worker = null;
  }
}

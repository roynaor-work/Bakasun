// A decoded AudioBuffer loops without HTMLMediaElement's end/restart gap.
// The graph runs natively; no JavaScript timer is needed to sustain a loop.
export function makeVoice(context, buffer, destination, region, offset, at, fade = .02) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = region.enabled;
  source.loopStart = region.start_seconds;
  source.loopEnd = region.end_seconds;
  source.connect(gain).connect(destination);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(1, at + fade);
  source.start(at, offset);
  return { source, gain, region, offset, at };
}

export class LoopPlayer extends EventTarget {
  constructor() {
    super();
    this.context = null;
    this.track = null;
    this.voice = null;
    this.pending = null;
    this.level = 'full';
    this.format = 'auto';
    this.actualFormat = null;
    this.volume = .55;
    this.cache = new Map();
    this.nodes = new Set();
    this.serial = 0;
  }

  signal() { this.dispatchEvent(new Event('change')); }

  async load(track, format, signal) {
    const formats = format === 'auto' ? ['ogg', 'mp3'] : [format];
    let lastError;
    for (const kind of formats) {
      const path = track.files[kind].path;
      try {
        let buffer = this.cache.get(path);
        if (!buffer) {
          const response = await fetch(new URL(path, import.meta.url), { signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
          buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (Math.abs(buffer.duration - track.duration_seconds) > .002) {
            throw new Error('הדפדפן לא פענח את אורך הקובץ במדויק');
          }
          // Bounded cache: at most three decoded tracks (about 30 MB).
          if (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value);
          this.cache.set(path, buffer);
        }
        return { buffer, kind };
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  region(level) {
    if (level === 'full' || this.track.kind === 'victory') return { id: 'full', ...this.track.loop };
    const found = this.track.intensity_regions.find(r => r.id === level);
    if (!found) throw new Error('Unknown intensity');
    return { ...found, enabled: true };
  }

  attach(region, offset, at) {
    const voice = makeVoice(this.context, this.buffer, this.master, region, offset, at);
    this.nodes.add(voice);
    voice.source.onended = () => {
      voice.source.disconnect();
      voice.gain.disconnect();
      this.nodes.delete(voice);
      if (this.voice === voice && this.track?.kind === 'victory') {
        this.voice = null;
        this.signal();
      }
    };
    return voice;
  }

  async play(track, { format = 'auto', level = 'full', startBar = 0 } = {}) {
    this.stop();
    const serial = this.serial;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: 32000 });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    // Resume within the click gesture, before any network request.
    await this.context.resume();
    if (serial !== this.serial) return;
    this.loading = true;
    this.track = track;
    this.format = format;
    this.level = track.kind === 'victory' ? 'full' : level;
    this.signal();
    try {
      const { buffer, kind } = await this.load(track, format, signal);
      if (serial !== this.serial) return;
      this.buffer = buffer;
      this.actualFormat = kind;
      this.origin = this.context.currentTime + .03;
      this.startBar = startBar;
      const region = this.region(this.level);
      const offset = track.kind === 'victory' ? 0 : region.start_seconds +
        (startBar % (this.level === 'full' ? 32 : 8)) * track.duration_seconds / 32;
      this.voice = this.attach(region, offset, this.origin);
    } catch (error) {
      if (serial === this.serial && error.name !== 'AbortError') {
        this.track = null;
        throw error;
      }
    } finally {
      if (serial === this.serial) {
        this.loading = false;
        this.signal();
      }
    }
  }

  settle() {
    if (!this.pending || this.context.currentTime < this.pending.at) return;
    const { incoming, outgoing, at } = this.pending;
    this.voice = incoming;
    this.pending = null;
    outgoing.source.stop(Math.max(this.context.currentTime, at + .021));
    this.signal();
  }

  setIntensity(level) {
    if (!['full', 'low', 'medium', 'high'].includes(level)) throw new Error('Unknown intensity');
    this.level = level;
    if (!this.voice || this.track.kind !== 'gameplay') return;
    this.settle();
    const now = this.context.currentTime;
    if (this.pending) {
      // A newer selection replaces an upcoming transition, preserving the old loop.
      this.pending.incoming.source.stop(now);
      this.voice.gain.gain.cancelScheduledValues(now);
      this.voice.gain.gain.setValueAtTime(1, now);
      this.pending = null;
    }
    clearTimeout(this.transitionTimer);
    const region = this.region(level);
    if (region.id === this.voice.region.id) { this.signal(); return; }
    const barSeconds = this.track.duration_seconds / 32;
    const timelineBar = this.startBar + (now - this.origin) / barSeconds;
    let nextBar = Math.floor(timelineBar) + 1;
    let at = this.origin + (nextBar - this.startBar) * barSeconds;
    if (at - now < .05) { nextBar++; at += barSeconds; }
    const offset = region.start_seconds + (nextBar % (level === 'full' ? 32 : 8)) * barSeconds;
    const incoming = this.attach(region, offset, at);
    const outgoing = this.voice;
    outgoing.gain.gain.setValueAtTime(1, at);
    outgoing.gain.gain.linearRampToValueAtTime(0, at + .02);
    this.pending = { incoming, outgoing, at, level, nextBar };
    this.transitionTimer = setTimeout(() => this.settle(), (at - now + .025) * 1000);
    this.signal();
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value)));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .02);
  }

  position() {
    this.settle();
    if (!this.voice) return null;
    const { at, offset, region } = this.voice;
    const elapsed = Math.max(0, this.context.currentTime - at);
    const length = region.end_seconds - region.start_seconds;
    return region.enabled ? region.start_seconds + (offset - region.start_seconds + elapsed) % length :
      Math.min(this.track.duration_seconds, elapsed);
  }

  stop() {
    this.serial++;
    this.abort?.abort();
    clearTimeout(this.transitionTimer);
    const now = this.context?.currentTime ?? 0;
    for (const node of this.nodes) {
      node.gain.gain.cancelAndHoldAtTime(now);
      node.gain.gain.linearRampToValueAtTime(0, now + .02);
      node.source.stop(now + .025);
    }
    this.pending = null;
    this.voice = null;
    this.loading = false;
    this.track = null;
    this.signal();
  }
}

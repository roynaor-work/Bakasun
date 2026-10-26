/** Alpine Rush sound: a procedural carve/wind bed plus short cues, all synthesized locally.
 * Nothing plays before unlock() (a user gesture). The island mute key is authoritative and
 * re-read on every sync, so the pause-sheet mute applies at once. One context per session. */
export function createAlpineAudio({storage = globalThis.localStorage, AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext} = {}) {
  let context, master, bed, bedFilter, bedGain, noiseBuffer, paused = false, disposed = false, muted = false, active = 0;
  const sources = [], cueLast = new Map();
  const VOICES = {
    countdown: [660, 660, .12, 'sine', .5], go: [880, 1320, .3, 'triangle', .55], boost: [380, 1400, .5, 'noise', .7], gate: [990, 1480, .16, 'sine', .45],
    takeoff: [500, 900, .18, 'triangle', .35], land: [180, 70, .2, 'noise', .7], hit: [140, 55, .28, 'square', .45], overtake: [740, 990, .14, 'sine', .35],
    finish: [523, 1046, .7, 'triangle', .6],
  };
  function readMute() { try { muted = storage?.getItem('island.sound') === 'off'; } catch {} }
  function set(param, value, time, constant = .06) { try { param.setTargetAtTime(value, time, constant); } catch { try { param.value = value; } catch {} } }
  function unlock() {
    if (disposed || !AudioContext) return;
    try {
      if (!context) {
        context = new AudioContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
        const length = Math.floor((context.sampleRate || 44100) * 1.6); noiseBuffer = context.createBuffer(1, length, context.sampleRate || 44100);
        const data = noiseBuffer.getChannelData(0); let seed = 50321, prev = 0;
        for (let i = 0; i < length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; prev = prev * .55 + (seed / 2147483648 - 1) * .45; data[i] = prev; }
        bed = context.createBufferSource(); bed.buffer = noiseBuffer; bed.loop = true; bedFilter = context.createBiquadFilter(); bedFilter.type = 'bandpass'; bedFilter.frequency.value = 700; bedGain = context.createGain(); bedGain.gain.value = 0;
        bed.connect(bedFilter); bedFilter.connect(bedGain); bedGain.connect(master); bed.start(); sources.push(bed);
      }
      if (!paused && context.state === 'suspended') void context.resume?.()?.catch?.(() => {});
    } catch {}
  }
  function level() { return paused || muted || disposed ? 0 : .5; }
  function sync(speedKmh = 0, {boosting = false, carving = 0, airborne = false} = {}) {
    readMute(); if (!context) return;
    const now = context.currentTime;
    set(master.gain, level(), now, .03);
    const speed = Math.max(0, Math.min(130, Number(speedKmh) || 0)) / 130;
    set(bedGain.gain, airborne ? speed * .05 : speed * (.07 + Math.min(1, carving) * .09) + (boosting ? .05 : 0), now, .08);
    set(bedFilter.frequency, 450 + speed * 900 + Math.min(1, carving) * 700 + (boosting ? 500 : 0), now, .08);
  }
  function cue(name) {
    readMute(); const voice = VOICES[name];
    if (!context || !voice || paused || muted || disposed || context.state !== 'running' || active > 8) return false;
    const now = context.currentTime; if (now - (cueLast.get(name) ?? -1) < .06) return false; cueLast.set(name, now);
    try {
      const [from, to, seconds, type, peak] = voice, gain = context.createGain();
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(peak * .25, now + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + seconds); gain.connect(master);
      let source, filter;
      if (type === 'noise') { source = context.createBufferSource(); source.buffer = noiseBuffer; filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(from, now); filter.frequency.exponentialRampToValueAtTime(to, now + seconds); source.connect(filter); filter.connect(gain); }
      else { source = context.createOscillator(); source.type = type; source.frequency.setValueAtTime(from, now); source.frequency.exponentialRampToValueAtTime(to, now + seconds); source.connect(gain); }
      active++; source.onended = () => { active--; try { source.disconnect(); filter?.disconnect(); gain.disconnect(); } catch {} };
      source.start(now); source.stop(now + seconds + .02); return true;
    } catch { return false; }
  }
  return {
    unlock, sync, cue,
    setPaused(value) { paused = !!value; if (!context) return; set(master.gain, level(), context.currentTime, .02); try { if (paused && context.state === 'running') void context.suspend()?.catch?.(() => {}); else if (!paused && context.state === 'suspended') void context.resume()?.catch?.(() => {}); } catch {} },
    metrics: () => ({unlocked: !!context, paused, muted, disposed, state: context?.state || 'none'}),
    dispose() {
      if (disposed) return; disposed = true;
      for (const s of sources) { try { s.stop(); s.disconnect(); } catch {} }
      try { void context?.close()?.catch?.(() => {}); } catch {}
    },
  };
}

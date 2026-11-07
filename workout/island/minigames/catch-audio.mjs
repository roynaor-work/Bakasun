/** Small synthesised sound set for "תפוס את הפושע": no files, nothing to load.
 * Honours the island's sound toggle (localStorage island.sound = off) and pause. */
export function createCatchAudio({muted = () => false} = {}) {
  let ac = null, paused = false;
  const ensure = () => {
    if (ac) return ac;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
    ac = new AC(); return ac;
  };
  const tone = (freq, dur, {type = 'sine', gain = .12, slide = 0, delay = 0} = {}) => {
    const a = ensure(); if (!a || muted() || paused) return;
    const t0 = a.currentTime + delay, osc = a.createOscillator(), g = a.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0); if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + .012); g.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
    osc.connect(g).connect(a.destination); osc.start(t0); osc.stop(t0 + dur + .02);
  };
  const noise = (dur, {gain = .1, from = 1800, to = 500, delay = 0} = {}) => {
    const a = ensure(); if (!a || muted() || paused) return;
    const t0 = a.currentTime + delay, buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur); f.Q.value = 1.2;
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t0);
  };
  const cues = {
    tool: () => tone(620, .08, {type: 'triangle', gain: .08}),
    swing: () => noise(.22, {gain: .06, from: 700, to: 1600}),
    whoosh: () => noise(.5, {gain: .09, from: 2200, to: 500}),
    thud: () => { tone(120, .2, {type: 'sine', gain: .2, slide: -60}); noise(.12, {gain: .06, from: 900, to: 300}); },
    miss: () => { tone(260, .28, {type: 'triangle', gain: .09, slide: -140}); },
    catch: () => { [523, 659, 784].forEach((f, i) => tone(f, .18, {type: 'triangle', gain: .12, delay: i * .08})); noise(.18, {gain: .05, from: 3200, to: 1200}); },
    perfect: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .2, {type: 'triangle', gain: .12, delay: i * .07})); noise(.3, {gain: .07, from: 4200, to: 1500}); },
    engine: () => tone(80, 1.2, {type: 'sawtooth', gain: .06, slide: 160}),
  };
  return {
    cue(name) { try { cues[name]?.(); } catch { /* audio is optional */ } },
    tick() { /* silent on purpose: dragging should not chatter */ },
    setPaused(v) { paused = Boolean(v); if (ac) { try { paused ? ac.suspend() : ac.resume(); } catch { /* ignore */ } } },
    dispose() { try { ac?.close(); } catch { /* ignore */ } ac = null; },
  };
}

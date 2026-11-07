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
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const siren = (from, to, delay) => {
    const a = ensure(); if (!a || muted() || paused) return;
    const t0 = a.currentTime + delay, osc = a.createOscillator(), osc2 = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
    osc.type = 'sawtooth'; osc2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 2400;
    for (const o of [osc, osc2]) { o.frequency.setValueAtTime(from, t0); o.frequency.linearRampToValueAtTime(to, t0 + .38); }
    osc2.detune.value = 7;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.045, t0 + .03); g.gain.setValueAtTime(.045, t0 + .34); g.gain.linearRampToValueAtTime(0, t0 + .39);
    osc.connect(lp); osc2.connect(lp); lp.connect(g).connect(a.destination); osc.start(t0); osc2.start(t0); osc.stop(t0 + .41); osc2.stop(t0 + .41);
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
    // Police siren: two alternating notes ("wee-woo"), each with a small glide, softened by a low-pass.
    // `approach` -1..1 gives a light Doppler shift: higher while the cars close in, lower when they pull apart.
    siren: arg => {
      const k = 1 + .045 * clamp(Number(arg?.approach) || 0, -1, 1);
      siren(960 * k, 800 * k, 0); siren(740 * k, 880 * k, .4);
    },
    count: () => tone(520, .12, {type: 'triangle', gain: .1}),
    go: () => { tone(780, .3, {type: 'triangle', gain: .12}); tone(1170, .3, {type: 'triangle', gain: .08, delay: .06}); },
    crash: () => { noise(.3, {gain: .12, from: 1400, to: 200}); tone(90, .3, {type: 'sawtooth', gain: .12, slide: -50}); },
    crimCrash: () => { noise(.25, {gain: .08, from: 1800, to: 400}); tone(300, .25, {type: 'triangle', gain: .09, slide: 260, delay: .1}); },
    pad: () => { tone(660, .12, {type: 'triangle', gain: .09}); tone(990, .16, {type: 'triangle', gain: .09, delay: .08}); },
    ram: () => { noise(.18, {gain: .12, from: 1600, to: 300}); tone(150, .16, {type: 'square', gain: .08, slide: -60}); },
    nitro: () => noise(.5, {gain: .06, from: 600, to: 3000}),
    brake: () => noise(.7, {gain: .07, from: 2600, to: 700}),
    near: () => { noise(.3, {gain: .1, from: 3500, to: 900}); tone(900, .25, {type: 'sine', gain: .06, slide: -500}); },
    bossHit: () => { tone(140, .35, {type: 'sawtooth', gain: .13, slide: -60}); noise(.25, {gain: .1, from: 2200, to: 500}); tone(784, .2, {type: 'triangle', gain: .09, delay: .12}); },
    stars: () => [659, 784, 988].forEach((f, i) => tone(f, .22, {type: 'triangle', gain: .1, delay: .22 * i})),
  };
  return {
    cue(name, arg) { try { cues[name]?.(arg); } catch { /* audio is optional */ } },
    tick() { /* silent on purpose: dragging should not chatter */ },
    setPaused(v) { paused = Boolean(v); if (ac) { try { paused ? ac.suspend() : ac.resume(); } catch { /* ignore */ } } },
    dispose() { try { ac?.close(); } catch { /* ignore */ } ac = null; },
  };
}

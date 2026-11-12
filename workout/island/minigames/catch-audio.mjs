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
  // ----- recorded siren loops: decoded once, looped through a gain node, playbackRate gives the Doppler -----
  const LOOPS = {twoTone: 'siren-two-tone-loop', yelp: 'siren-yelp-loop'}, buffers = {}, loading = {};
  let live = null, killTimer = 0;
  const loopUrl = id => {
    let ogg = false; try { ogg = Boolean(globalThis.document && document.createElement('audio').canPlayType('audio/ogg; codecs=vorbis')); } catch { /* ignore */ }
    return new URL('../assets/game-catch/audio/' + LOOPS[id] + (ogg ? '.ogg' : '.mp3'), import.meta.url).href;
  };
  const fetchLoop = id => {
    if (buffers[id] || loading[id]) return; const a = ensure(); if (!a || typeof fetch !== 'function') return;
    loading[id] = fetch(loopUrl(id)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('siren'))).then(b => a.decodeAudioData(b)).then(buf => { buffers[id] = buf; }).catch(() => { loading[id] = null; });
  };
  const stopLoop = () => {
    const l = live; live = null; if (!l || !ac) return;
    try { const t = ac.currentTime; l.g.gain.cancelScheduledValues(t); l.g.gain.setValueAtTime(l.g.gain.value, t); l.g.gain.linearRampToValueAtTime(0, t + .18); l.src.stop(t + .2); } catch { /* ignore */ }
  };
  const sirenLoop = (id, rate, holdMs) => {
    const a = ensure(); if (!a || muted() || paused) return false;
    fetchLoop(id); const buf = buffers[id]; if (!buf) return false;
    if (live && live.id !== id) stopLoop();
    if (!live) {
      const src = a.createBufferSource(), g = a.createGain(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
      g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(.42, a.currentTime + .2); src.connect(g).connect(a.destination); src.start(); live = {id, src, g};
    } else live.src.playbackRate.setTargetAtTime(rate, a.currentTime, .2);
    clearTimeout(killTimer); killTimer = setTimeout(stopLoop, holdMs); return true;
  };
  // ----- engine loop: two detuned oscillators through a low-pass, pitch follows the speed, a whine while boosting -----
  let eng = null;
  const engineStart = () => {
    const a = ensure(); if (!a || eng) return;
    const o1 = a.createOscillator(), o2 = a.createOscillator(), o3 = a.createOscillator(), lp = a.createBiquadFilter(), g = a.createGain(), gw = a.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sine'; o2.detune.value = -9; lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 1.1;
    o1.frequency.value = 60; o2.frequency.value = 60; o3.frequency.value = 1400;
    g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(.05, a.currentTime + .4); gw.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(a.destination); o3.connect(gw).connect(a.destination);
    o1.start(); o2.start(); o3.start(); eng = {o1, o2, o3, lp, g, gw};
  };
  const engineStop = () => {
    const e = eng; eng = null; if (!e || !ac) return;
    try { const t = ac.currentTime; e.g.gain.cancelScheduledValues(t); e.g.gain.linearRampToValueAtTime(0, t + .3); e.gw.gain.linearRampToValueAtTime(0, t + .2); for (const o of [e.o1, e.o2, e.o3]) o.stop(t + .35); } catch { /* ignore */ }
  };
  let drawOsc = null, lastDraw = 0;
  const cues = {
    // tyre shots: a cartoon pop (never a real gunshot), a metallic clink on a hit
    shot: () => { noise(.09, {gain: .14, from: 900, to: 300}); tone(220, .09, {type: 'square', gain: .08, slide: -120}); },
    shotHit: () => { noise(.08, {gain: .1, from: 1200, to: 400}); tone(1900, .14, {type: 'triangle', gain: .09, slide: -900}); tone(2600, .1, {type: 'sine', gain: .05, delay: .03, slide: -1200}); },
    // a flat tyre: a hiss, then a flap-flap for a second
    flat: () => { noise(.5, {gain: .09, from: 5000, to: 1800}); for (let i = 0; i < 6; i++) tone(90, .07, {type: 'square', gain: .06, delay: .25 + i * .17, slide: -30}); },
    skid: () => { noise(1.1, {gain: .12, from: 2800, to: 900}); tone(110, .5, {type: 'sawtooth', gain: .07, delay: .9, slide: -60}); },
    turn: () => { noise(.3, {gain: .05, from: 2400, to: 1600}); tone(1800, .22, {type: 'sine', gain: .025, slide: 300}); },
    // the bowstring: a creak that rises with the draw (one oscillator, re-tuned), a twang on release, a whistle in flight
    draw: k => { const a = ensure(); if (!a || muted() || paused) return; const kk = clamp(Number(k) || 0, 0, 1); if (!drawOsc) { const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = 140; g.gain.value = 0; o.connect(g).connect(a.destination); o.start(); drawOsc = {o, g}; } drawOsc.o.frequency.setTargetAtTime(140 + kk * 260, a.currentTime, .05); drawOsc.g.gain.setTargetAtTime(.025 + kk * .03, a.currentTime, .05); clearTimeout(lastDraw); lastDraw = setTimeout(() => { try { drawOsc.g.gain.setTargetAtTime(0, a.currentTime, .08); } catch { /* ignore */ } }, 260); },
    twang: () => { if (drawOsc && ac) { try { drawOsc.g.gain.setTargetAtTime(0, ac.currentTime, .02); } catch { /* ignore */ } } tone(180, .18, {type: 'triangle', gain: .12, slide: -90}); tone(360, .12, {type: 'sine', gain: .06, slide: -180}); noise(.12, {gain: .05, from: 2500, to: 900}); },
    whistle: () => tone(1900, .55, {type: 'sine', gain: .04, slide: -900}),
    hitBody: () => { tone(130, .22, {type: 'sine', gain: .16, slide: -50}); noise(.2, {gain: .07, from: 1400, to: 500}); },
    hitHead: () => [988, 1319, 1568].forEach((f, i) => tone(f, .2, {type: 'triangle', gain: .1, delay: i * .06})),
    tool: () => tone(620, .08, {type: 'triangle', gain: .08}),
    swing: () => noise(.22, {gain: .06, from: 700, to: 1600}),
    whoosh: () => noise(.5, {gain: .09, from: 2200, to: 500}),
    thud: () => { tone(120, .2, {type: 'sine', gain: .2, slide: -60}); noise(.12, {gain: .06, from: 900, to: 300}); },
    miss: () => { tone(260, .28, {type: 'triangle', gain: .09, slide: -140}); },
    catch: () => { [523, 659, 784].forEach((f, i) => tone(f, .18, {type: 'triangle', gain: .12, delay: i * .08})); noise(.18, {gain: .05, from: 3200, to: 1200}); },
    perfect: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .2, {type: 'triangle', gain: .12, delay: i * .07})); noise(.3, {gain: .07, from: 4200, to: 1500}); },
    engine: () => { fetchLoop('twoTone'); fetchLoop('yelp'); tone(80, 1.2, {type: 'sawtooth', gain: .06, slide: 160}); },
    // Police siren: two alternating notes ("wee-woo"), each with a small glide, softened by a low-pass.
    // `approach` -1..1 gives a light Doppler shift: higher while the cars close in, lower when they pull apart.
    // Real siren loops (Codex, CC0). The loop plays while the cue keeps arriving and fades out a moment after the last one.
    siren: arg => {
      const k = 1 + .045 * clamp(Number(arg?.approach) || 0, -1, 1);
      if (!sirenLoop(arg?.crew ? 'yelp' : 'twoTone', k, arg?.crew ? 1500 : 1100)) { siren(960 * k, 800 * k, 0); siren(740 * k, 880 * k, .4); }
    },
    count: () => tone(520, .12, {type: 'triangle', gain: .1}),
    go: () => { tone(780, .3, {type: 'triangle', gain: .12}); tone(1170, .3, {type: 'triangle', gain: .08, delay: .06}); },
    crash: () => { noise(.3, {gain: .12, from: 1400, to: 200}); tone(90, .3, {type: 'sawtooth', gain: .12, slide: -50}); },
    crimCrash: () => { noise(.25, {gain: .08, from: 1800, to: 400}); tone(300, .25, {type: 'triangle', gain: .09, slide: 260, delay: .1}); },
    pad: () => { tone(660, .12, {type: 'triangle', gain: .09}); tone(990, .16, {type: 'triangle', gain: .09, delay: .08}); },
    scrape: () => { noise(.35, {gain: .09, from: 3800, to: 1200}); tone(1500, .2, {type: 'square', gain: .03, slide: -700}); },
    ram: () => { noise(.18, {gain: .12, from: 1600, to: 300}); tone(150, .16, {type: 'square', gain: .08, slide: -60}); },
    nitro: () => noise(.5, {gain: .06, from: 600, to: 3000}),
    brake: () => noise(.7, {gain: .07, from: 2600, to: 700}),
    near: () => { noise(.3, {gain: .1, from: 3500, to: 900}); tone(900, .25, {type: 'sine', gain: .06, slide: -500}); },
    bossHit: () => { tone(140, .35, {type: 'sawtooth', gain: .13, slide: -60}); noise(.25, {gain: .1, from: 2200, to: 500}); tone(784, .2, {type: 'triangle', gain: .09, delay: .12}); },
    stars: () => [659, 784, 988].forEach((f, i) => tone(f, .22, {type: 'triangle', gain: .1, delay: .22 * i})),
  };
  return {
    cue(name, arg) { try { cues[name]?.(arg); } catch { /* audio is optional */ } },
    /** Continuous engine note: call every frame of the chase with the speed (m/s) and whether the boost is on. */
    engine(v, boosting) { try { if (muted() || paused) { engineStop(); return; } engineStart(); if (!eng || !ac) return; const t = ac.currentTime, k = clamp((Number(v) || 0) / 31, 0, 1); eng.o1.frequency.setTargetAtTime(55 + k * 95, t, .08); eng.o2.frequency.setTargetAtTime(55 + k * 95, t, .08); eng.lp.frequency.setTargetAtTime(420 + k * 900, t, .1); eng.g.gain.setTargetAtTime(.04 + k * .03, t, .1); eng.o3.frequency.setTargetAtTime(1100 + k * 900, t, .1); eng.gw.gain.setTargetAtTime(boosting ? .018 : 0, t, .12); } catch { /* audio is optional */ } },
    engineStop() { try { engineStop(); } catch { /* ignore */ } },
    tick() { /* silent on purpose: dragging should not chatter */ },
    setPaused(v) { paused = Boolean(v); if (ac) { try { paused ? ac.suspend() : ac.resume(); } catch { /* ignore */ } } },
    dispose() { clearTimeout(killTimer); clearTimeout(lastDraw); try { engineStop(); } catch { /* ignore */ } live = null; drawOsc = null; try { ac?.close(); } catch { /* ignore */ } ac = null; },
  };
}

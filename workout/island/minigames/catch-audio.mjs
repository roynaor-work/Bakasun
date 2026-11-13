/** Sound set for "תפוס את הפושע": Web Audio synthesis plus the two recorded siren loops (Codex, CC0) in
 * assets/game-catch/audio. Honours the island's sound toggle (localStorage island.sound = off) and pause.
 * Mix (probe RMS, tools/catch-audio-probe.html): siren bed ~.10 above the engine bed (~.04 idle, ~.06 boost);
 * one-shot cues below the 'catch' chord peak +20%; a gentle limiter before the destination so stacked cues do not clip.
 * v5 (catch-session.mjs) and v6 (catch-session6.mjs) share this file: every cue name that existed keeps working. */
const CUE_NAMES = ['tool', 'swing', 'whoosh', 'thud', 'miss', 'catch', 'perfect', 'engine', 'siren', 'count', 'countdown', 'go', 'crash', 'crimCrash', 'pad', 'scrape', 'ram', 'nitro', 'brake', 'near', 'bossHit', 'stars',
  'turn', 'shot', 'shotHit', 'flat', 'skid', 'draw', 'twang', 'whistle', 'hitBody', 'hitHead',
  'pickup', 'toolSwap', 'sticky', 'spikes', 'zap', 'tracker', 'slowmo'];
export {CUE_NAMES};

/** `sirenScale` (v7: .55, about -5.2 dB) turns the police siren down so the engine and the other cues are heard; 1 = v6. */
export function createCatchAudio({muted = () => false, sirenScale = 1} = {}) {
  const SIREN_SCALE = Math.max(0, Math.min(1.5, Number(sirenScale) || 0));
  let ac = null, master = null, limiter = null, paused = false, disposed = false, unlockBound = false;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // ----- recorded siren loops: fetched at creation (no context needed), decoded once a context exists -----
  const LOOPS = {twoTone: 'siren-two-tone-loop', yelp: 'siren-yelp-loop'}, encoded = {}, buffers = {}, decoding = {}, attempts = {};
  const loopUrl = id => {
    let ogg = false; try { ogg = Boolean(globalThis.document && document.createElement('audio').canPlayType('audio/ogg; codecs=vorbis')); } catch { /* ignore */ }
    return new URL('../assets/game-catch/audio/' + LOOPS[id] + (ogg ? '.ogg' : '.mp3'), import.meta.url).href;
  };
  const prefetch = id => {
    if (encoded[id] || typeof fetch !== 'function') return;
    encoded[id] = fetch(loopUrl(id)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('siren'))).catch(() => { encoded[id] = null; return null; });
  };
  const decodeLoop = id => {
    // decodeAudioData on a context that was never resumed fails on some phones: resume (fire and forget), decode, and
    // allow one more attempt on a later cue if the first one failed (attempts <= 2 per loop).
    if (buffers[id] || decoding[id]) return; const a = ensure(); if (!a) return;
    if (!encoded[id]) { if ((attempts[id] || 0) >= 2) return; prefetch(id); if (!encoded[id]) return; }
    attempts[id] = (attempts[id] || 0) + 1;
    decoding[id] = encoded[id].then(bytes => bytes ? a.decodeAudioData(bytes.slice(0)) : Promise.reject(new Error('siren'))).then(buf => { buffers[id] = buf; }).catch(() => { decoding[id] = null; if (attempts[id] >= 2) encoded[id] = null; });
  };
  prefetch('twoTone'); prefetch('yelp');
  const ensure = () => {
    if (disposed) return null;
    if (ac) { if (ac.state === 'suspended' && !paused) { try { ac.resume(); } catch { /* ignore */ } } return ac; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
    try { ac = new AC(); } catch { return null; }
    // master gain -> gentle limiter -> destination: stacked cues (siren + engine + a hit) never clip
    master = ac.createGain(); master.gain.value = 1;
    try {
      limiter = ac.createDynamicsCompressor(); limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 6; limiter.attack.value = .003; limiter.release.value = .18;
      master.connect(limiter).connect(ac.destination);
    } catch { limiter = null; master.connect(ac.destination); }
    if (ac.state === 'suspended') { try { ac.resume(); } catch { /* ignore */ } }
    decodeLoop('twoTone'); decodeLoop('yelp');
    return ac;
  };
  // first user gesture anywhere: resume the context (phones start it suspended) and decode the loops
  const unlock = () => { const a = ensure(); if (!a) return; try { a.resume(); } catch { /* ignore */ } decodeLoop('twoTone'); decodeLoop('yelp'); };
  const bindUnlock = () => {
    if (unlockBound || !globalThis.document?.addEventListener) return; unlockBound = true;
    for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlock, {once: true, passive: true, capture: true});
  };
  const unbindUnlock = () => { if (!unlockBound) return; unlockBound = false; try { for (const ev of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(ev, unlock, {capture: true}); } catch { /* ignore */ } };
  bindUnlock();
  const out = () => master;
  const ready = () => { const a = ensure(); return a && !muted() && !paused ? a : null; };

  // ----- primitives -----
  const tone = (freq, dur, {type = 'sine', gain = .12, slide = 0, delay = 0} = {}) => {
    const a = ready(); if (!a) return;
    const t0 = a.currentTime + delay, osc = a.createOscillator(), g = a.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0); if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + .012); g.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
    osc.connect(g).connect(out()); osc.start(t0); osc.stop(t0 + dur + .02);
  };
  const siren = (from, to, delay) => {
    const a = ready(); if (!a) return;
    const t0 = a.currentTime + delay, osc = a.createOscillator(), osc2 = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
    osc.type = 'sawtooth'; osc2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 2400;
    for (const o of [osc, osc2]) { o.frequency.setValueAtTime(from, t0); o.frequency.linearRampToValueAtTime(to, t0 + .38); }
    osc2.detune.value = 7;
    const peak = .07 * SIREN_SCALE; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + .03); g.gain.setValueAtTime(peak, t0 + .34); g.gain.linearRampToValueAtTime(0, t0 + .39);
    osc.connect(lp); osc2.connect(lp); lp.connect(g).connect(out()); osc.start(t0); osc2.start(t0); osc.stop(t0 + .41); osc2.stop(t0 + .41);
  };
  const noise = (dur, {gain = .1, from = 1800, to = 500, delay = 0, q = 1.2, hold = 0} = {}) => {
    const a = ready(); if (!a) return;
    const t0 = a.currentTime + delay, buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur); f.Q.value = q;
    g.gain.setValueAtTime(gain, t0); if (hold) g.gain.setValueAtTime(gain, t0 + Math.min(hold, dur * .9)); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    src.connect(f).connect(g).connect(out()); src.start(t0);
  };

  // ----- siren loop: looped through a gain node, playbackRate gives the Doppler, fades out when the cue stops arriving -----
  let live = null, killTimer = 0;
  const SIREN_GAIN = .62;
  const stopLoop = () => {
    const l = live; live = null; if (!l || !ac) return;
    try { const t = ac.currentTime; l.g.gain.cancelScheduledValues(t); l.g.gain.setValueAtTime(l.g.gain.value, t); l.g.gain.linearRampToValueAtTime(0, t + .18); l.src.stop(t + .2); } catch { /* ignore */ }
  };
  const sirenLoop = (id, rate, holdMs, level) => {
    const a = ready(); if (!a) return false;
    decodeLoop(id); const buf = buffers[id]; if (!buf) return false;
    if (live && live.id !== id) stopLoop();
    const target = SIREN_GAIN * level * SIREN_SCALE;
    if (!live) {
      const src = a.createBufferSource(), g = a.createGain(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
      g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(target, a.currentTime + .2); src.connect(g).connect(out()); src.start(); live = {id, src, g};
    } else { live.src.playbackRate.setTargetAtTime(rate, a.currentTime, .2); live.g.gain.setTargetAtTime(target, a.currentTime, .25); }
    clearTimeout(killTimer); killTimer = setTimeout(stopLoop, holdMs); return true;
  };

  // ----- engine bed: saw + square (detuned) through a low-pass, a sub sine an octave down, a slow pulse at low revs,
  //       a brown rumble, and a turbo whine that rises over ~0.5 s while boosting -----
  let eng = null;
  const engineStart = () => {
    const a = ready(); if (!a || eng) return;
    const t = a.currentTime;
    const o1 = a.createOscillator(), o2 = a.createOscillator(), sub = a.createOscillator(), whine = a.createOscillator(), lfo = a.createOscillator();
    const lp = a.createBiquadFilter(), g = a.createGain(), gSub = a.createGain(), gw = a.createGain(), pulse = a.createGain(), lfoAmt = a.createGain(), gr = a.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -9; sub.type = 'sine'; whine.type = 'sine'; lfo.type = 'sine';
    o1.frequency.value = 60; o2.frequency.value = 60; sub.frequency.value = 30; whine.frequency.value = 900; lfo.frequency.value = 9;
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 1.1;
    // pulse: gain = 1 + lfoAmt * sin(); depth shrinks with speed so the idle chugs and the top end is smooth
    pulse.gain.value = 1; lfoAmt.gain.value = .25; lfo.connect(lfoAmt).connect(pulse.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.032, t + .4); gSub.gain.value = .5; gw.gain.value = 0;
    // rumble: looped brown-ish noise, low-passed hard
    const buf = a.createBuffer(1, a.sampleRate, a.sampleRate), d = buf.getChannelData(0); let acc = 0;
    for (let i = 0; i < d.length; i++) { acc = acc * .985 + (Math.random() * 2 - 1) * .08; d[i] = acc; }
    const rum = a.createBufferSource(), rlp = a.createBiquadFilter(); rum.buffer = buf; rum.loop = true; rlp.type = 'lowpass'; rlp.frequency.value = 160; gr.gain.value = .5;
    o1.connect(lp); o2.connect(lp); sub.connect(gSub).connect(lp); lp.connect(pulse).connect(g).connect(out());
    rum.connect(rlp).connect(gr).connect(g); whine.connect(gw).connect(out());
    for (const o of [o1, o2, sub, whine, lfo, rum]) o.start();
    eng = {o1, o2, sub, whine, lfo, lp, g, gw, lfoAmt, rum, boosting: false};
  };
  const engineStop = () => {
    const e = eng; eng = null; if (!e || !ac) return;
    try {
      const t = ac.currentTime; e.g.gain.cancelScheduledValues(t); e.g.gain.setValueAtTime(e.g.gain.value, t); e.g.gain.linearRampToValueAtTime(0, t + .3);
      e.gw.gain.cancelScheduledValues(t); e.gw.gain.setValueAtTime(e.gw.gain.value, t); e.gw.gain.linearRampToValueAtTime(0, t + .2);
      for (const o of [e.o1, e.o2, e.sub, e.whine, e.lfo, e.rum]) o.stop(t + .35);
    } catch { /* ignore */ }
  };
  const engineSet = (v, boosting) => {
    engineStart(); if (!eng || !ac) return;
    const t = ac.currentTime, k = clamp((Number(v) || 0) / 31, 0, 1), f = 52 + k * 98;
    eng.o1.frequency.setTargetAtTime(f, t, .08); eng.o2.frequency.setTargetAtTime(f, t, .08); eng.sub.frequency.setTargetAtTime(f / 2, t, .08);
    eng.lp.frequency.setTargetAtTime(400 + k * 950, t, .1);
    eng.g.gain.setTargetAtTime(.027 + k * .019, t, .1);
    eng.lfo.frequency.setTargetAtTime(7 + k * 18, t, .1); eng.lfoAmt.gain.setTargetAtTime(.25 * (1 - k) * (1 - k), t, .15);
    const on = Boolean(boosting);
    if (on !== eng.boosting) {
      eng.boosting = on;
      // the turbo spools up over half a second (time constant .17 ≈ 95% in .5 s) and drops faster when the boost ends
      eng.whine.frequency.cancelScheduledValues(t); eng.whine.frequency.setValueAtTime(on ? 900 : eng.whine.frequency.value, t); eng.whine.frequency.setTargetAtTime(on ? 2300 : 900, t, on ? .17 : .1);
      eng.gw.gain.setTargetAtTime(on ? .012 : 0, t, on ? .17 : .08);
    }
  };

  // ----- bowstring: one oscillator pair, re-tuned while dragging (no stacking), fades out when the draw stops -----
  let drawOsc = null, lastDraw = 0, lastTurn = 0;
  const drawStop = (fast) => { if (!drawOsc || !ac) return; try { const t = ac.currentTime; drawOsc.g.gain.setTargetAtTime(0, t, fast ? .02 : .08); drawOsc.gs.gain.setTargetAtTime(0, t, fast ? .02 : .08); } catch { /* ignore */ } };
  const draw = k => {
    const a = ready(); if (!a) return; const kk = clamp(Number(k) || 0, 0, 1);
    if (!drawOsc) {
      const o = a.createOscillator(), g = a.createGain(), s = a.createOscillator(), gs = a.createGain(), bp = a.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 120; bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 4; g.gain.value = 0;
      s.type = 'sine'; s.frequency.value = 620; gs.gain.value = 0;
      o.connect(bp).connect(g).connect(out()); s.connect(gs).connect(out()); o.start(); s.start(); drawOsc = {o, g, s, gs, bp};
    }
    const t = a.currentTime;
    drawOsc.o.frequency.setTargetAtTime(120 + kk * 220, t, .05); drawOsc.bp.frequency.setTargetAtTime(450 + kk * 900, t, .05);
    drawOsc.g.gain.setTargetAtTime(.09 + kk * .1, t, .05);
    drawOsc.s.frequency.setTargetAtTime(620 + kk * 520, t, .05); drawOsc.gs.gain.setTargetAtTime(.006 + kk * .012, t, .05);
    clearTimeout(lastDraw); lastDraw = setTimeout(() => drawStop(false), 260);
  };

  const cues = {
    // ----- chase -----
    engine: () => { decodeLoop('twoTone'); decodeLoop('yelp'); tone(80, 1.2, {type: 'sawtooth', gain: .06, slide: 160}); },
    // Police siren: two alternating notes ("wee-woo"), each with a small glide, softened by a low-pass.
    // `approach` -1..1 gives a light Doppler shift: higher while the cars close in, lower when they pull apart.
    // Real siren loops (Codex, CC0). The loop plays while the cue keeps arriving and fades out a moment after the last one.
    // `level` 0..1 (optional) scales the loop: the chase can turn it down while the thief is far ahead.
    siren: arg => {
      const k = 1 + .055 * clamp(Number(arg?.approach) || 0, -1, 1), level = arg?.level == null ? 1 : clamp(Number(arg.level) || 0, .25, 1);
      if (!sirenLoop(arg?.crew ? 'yelp' : 'twoTone', k, arg?.crew ? 1500 : 1100, level)) { siren(960 * k, 800 * k, 0); siren(740 * k, 880 * k, .4); }
    },
    // tyre squeal for hard steering in a bend: short, soft, rate-limited
    turn: () => { const now = Date.now(); if (now - lastTurn < 300) return; lastTurn = now; noise(.28, {gain: .16, from: 1700, to: 2300, q: 3}); tone(1500, .22, {type: 'sine', gain: .024, slide: 400}); },
    // tyre shots: a cartoon pop (a paintball thump, never a real firearm), a metallic clink with a sparks fizz on a hit
    shot: () => { tone(520, .09, {type: 'sine', gain: .19, slide: -380}); noise(.07, {gain: .09, from: 1100, to: 350}); tone(95, .12, {type: 'triangle', gain: .09, slide: -30, delay: .01}); },
    shotHit: () => { tone(2600, .16, {type: 'triangle', gain: .12, slide: -900}); tone(3900, .12, {type: 'sine', gain: .065, delay: .02, slide: -1400}); noise(.22, {gain: .06, from: 6000, to: 3500, q: .8, delay: .04}); },
    // a flat tyre: a hiss, then a flap-flap that slows down for about 1.2 s
    flat: () => { noise(.4, {gain: .12, from: 5200, to: 2200, q: .9}); let at = .28, gap = .11; for (let i = 0; i < 7; i++) { tone(88, .07, {type: 'sine', gain: .14, delay: at, slide: -28}); noise(.05, {gain: .035, from: 900, to: 400, delay: at}); at += gap; gap += .018; } },
    // the stop: a long screech, a thud, and a hubcap ting that wobbles out
    skid: () => { noise(1.05, {gain: .1, from: 2700, to: 1300, q: 2.2, hold: .5}); tone(1900, .95, {type: 'sine', gain: .02, slide: -700}); tone(95, .32, {type: 'sine', gain: .11, delay: .98, slide: -45}); noise(.14, {gain: .07, from: 700, to: 250, delay: .98}); tone(3150, .5, {type: 'triangle', gain: .045, delay: 1.08}); tone(3230, .45, {type: 'sine', gain: .03, delay: 1.1}); tone(4700, .25, {type: 'sine', gain: .02, delay: 1.08}); },
    // ----- the catch (bow and net) -----
    draw,
    twang: () => { drawStop(true); tone(180, .18, {type: 'triangle', gain: .12, slide: -90}); tone(360, .12, {type: 'sine', gain: .06, slide: -180}); noise(.12, {gain: .05, from: 2500, to: 900}); },
    whistle: () => { tone(1900, .55, {type: 'sine', gain: .045, slide: -1000}); tone(1904, .5, {type: 'sine', gain: .02, slide: -1000}); },
    // the net in flight: a falling whistle over the rush of air (the session plays this on 'launch')
    whoosh: () => { noise(.5, {gain: .1, from: 2200, to: 500}); tone(1900, .5, {type: 'sine', gain: .05, slide: -1000, delay: .02}); },
    hitBody: () => { tone(130, .22, {type: 'sine', gain: .125, slide: -50}); noise(.2, {gain: .07, from: 1400, to: 500}); for (let i = 0; i < 4; i++) noise(.05, {gain: .04, from: 3000, to: 1800, delay: .06 + i * .055}); },
    hitHead: () => { [1047, 1319, 1760].forEach((f, i) => tone(f, .24, {type: 'triangle', gain: .1, delay: i * .07})); tone(3520, .3, {type: 'sine', gain: .03, delay: .14}); },
    // ----- shared with v5 -----
    tool: () => tone(620, .08, {type: 'triangle', gain: .06}),
    swing: () => noise(.22, {gain: .05, from: 700, to: 1600}),
    thud: () => { tone(120, .2, {type: 'sine', gain: .14, slide: -60}); noise(.12, {gain: .06, from: 900, to: 300}); },
    miss: () => { tone(260, .28, {type: 'triangle', gain: .09, slide: -140}); },
    catch: () => { [523, 659, 784].forEach((f, i) => tone(f, .2, {type: 'triangle', gain: .16, delay: i * .08})); noise(.2, {gain: .06, from: 3200, to: 1200}); },
    perfect: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .22, {type: 'triangle', gain: .16, delay: i * .07})); noise(.3, {gain: .07, from: 4200, to: 1500}); },
    count: () => tone(520, .12, {type: 'triangle', gain: .07}),
    countdown: () => tone(520, .12, {type: 'triangle', gain: .07}),
    go: () => { tone(780, .3, {type: 'triangle', gain: .08}); tone(1170, .3, {type: 'triangle', gain: .055, delay: .06}); },
    crash: () => { noise(.3, {gain: .12, from: 1400, to: 200}); tone(90, .3, {type: 'sawtooth', gain: .12, slide: -50}); },
    crimCrash: () => { noise(.25, {gain: .08, from: 1800, to: 400}); tone(300, .25, {type: 'triangle', gain: .09, slide: 260, delay: .1}); },
    pad: () => { tone(660, .12, {type: 'triangle', gain: .09}); tone(990, .16, {type: 'triangle', gain: .09, delay: .08}); },
    scrape: () => { noise(.35, {gain: .15, from: 3800, to: 1200}); tone(1500, .2, {type: 'square', gain: .03, slide: -700}); },
    ram: () => { noise(.18, {gain: .12, from: 1600, to: 300}); tone(150, .16, {type: 'square', gain: .08, slide: -60}); },
    nitro: () => noise(.5, {gain: .12, from: 600, to: 3000}),
    brake: () => noise(.7, {gain: .13, from: 2600, to: 700}),
    near: () => { noise(.3, {gain: .1, from: 3500, to: 900}); tone(900, .25, {type: 'sine', gain: .06, slide: -500}); },
    bossHit: () => { tone(140, .35, {type: 'sawtooth', gain: .13, slide: -60}); noise(.25, {gain: .1, from: 2200, to: 500}); tone(784, .2, {type: 'triangle', gain: .09, delay: .12}); },
    stars: () => [659, 784, 988].forEach((f, i) => tone(f, .22, {type: 'triangle', gain: .1, delay: .22 * i})),
    // ----- v7: chase elements and tools (cartoon: chimes, pops and zaps, nothing like a real firearm) -----
    pickup: () => { tone(988, .1, {type: 'triangle', gain: .09}); tone(1480, .14, {type: 'triangle', gain: .07, delay: .06}); },
    toolSwap: () => { tone(740, .05, {type: 'square', gain: .035}); tone(1110, .06, {type: 'triangle', gain: .05, delay: .045}); },
    sticky: () => { noise(.25, {gain: .08, from: 900, to: 300, q: 2}); tone(180, .3, {type: 'sine', gain: .1, slide: -90}); },
    spikes: () => { noise(.18, {gain: .1, from: 4200, to: 1600}); for (let i = 0; i < 4; i++) tone(2400 - i * 200, .05, {type: 'triangle', gain: .045, delay: .04 + i * .05}); noise(.5, {gain: .07, from: 5200, to: 2400, q: .9, delay: .2}); },
    zap: () => { tone(1800, .22, {type: 'sawtooth', gain: .05, slide: -1500}); noise(.2, {gain: .06, from: 6000, to: 2500, q: 3, delay: .03}); },
    tracker: () => { tone(1320, .07, {type: 'sine', gain: .07}); tone(1320, .07, {type: 'sine', gain: .07, delay: .12}); },
    slowmo: () => { tone(520, .45, {type: 'sine', gain: .05, slide: -260}); noise(.4, {gain: .035, from: 1600, to: 400}); },
  };
  return {
    cue(name, arg) { try { cues[name]?.(arg); } catch { /* audio is optional */ } },
    /** Continuous engine note: call every frame of the chase with the speed (m/s) and whether the boost is on. */
    engine(v, boosting) { try { if (muted() || paused || disposed) { engineStop(); return; } engineSet(v, boosting); } catch { /* audio is optional */ } },
    engineStop() { try { engineStop(); } catch { /* ignore */ } },
    /** Read-only: which recorded siren is decoded and whether it is the one playing (null + sirenLive=false means the synth fallback). */
    status() {
      return {
        state: ac ? ac.state : 'none',
        sirenBuffer: live?.id || (buffers.twoTone ? 'twoTone' : buffers.yelp ? 'yelp' : null),
        sirenDecoded: Object.fromEntries(Object.keys(LOOPS).map(id => [id, buffers[id] ? +buffers[id].duration.toFixed(3) : null])),
        sirenLive: Boolean(live), sirenGain: live ? +live.g.gain.value.toFixed(3) : 0, ...(SIREN_SCALE !== 1 ? {sirenScale: SIREN_SCALE} : {}),
        engine: Boolean(eng), boosting: Boolean(eng?.boosting), draw: Boolean(drawOsc), limiter: Boolean(limiter),
      };
    },
    /** The node every cue feeds (before the limiter): probes tap it with an AnalyserNode. */
    output() { ensure(); return master; },
    cueNames() { return Object.keys(cues); },
    tick() { /* silent on purpose: dragging should not chatter */ },
    setPaused(v) { paused = Boolean(v); if (ac) { try { paused ? ac.suspend() : ac.resume(); } catch { /* ignore */ } } },
    dispose() {
      if (disposed) return; disposed = true; clearTimeout(killTimer); clearTimeout(lastDraw); unbindUnlock();
      try { engineStop(); } catch { /* ignore */ } live = null; drawOsc = null;
      try { ac?.close(); } catch { /* ignore */ } ac = null; master = null; limiter = null;
    },
  };
}

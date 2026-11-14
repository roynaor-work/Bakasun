/** v8 "תפוס את הפושע" sounds (14/11, Roy after v23), synthesized with Web Audio (no files, nothing to decode, so nothing plays a
 * stand-in while a file loads). catch-audio.mjs owns the context, the master, the limiter, mute and pause; it asks this module for
 * voices on its master node when the session passes v8 flags, and keeps every v7 sound for the flags that bring v7 back.
 *  siren   a soft two-tone police siren (hi-lo a fourth apart, 30 ms slurs, a warm tone through a 1.3 kHz low-pass), 7 dB under the
 *          v7 siren. v7 looped the pack's "police-soft": a pure sine wailing 431-711 Hz every 2 s at a constant level, the shape of an
 *          air-raid alert, 2.9 dB over the engine. The near (roadblock) and far (crew) variants are the same voice, louder or muffled.
 *  engine  a V6 car engine: rpm / 40 with the 1.5, 3, 4.5 and 6 crank orders, combustion roughness, an exhaust rumble and an intake
 *          breath, two low-passes so nothing sits above ~1.4 kHz, the rpm from the speed through a six-speed automatic (kickdown on the
 *          boost, soft shifts with a short dip), idling through the countdown. v7's bed was a saw + square buzz with a resonant
 *          1.08 kHz partial and a turbo whine of a pure sine sliding 900 -> 2300 Hz on every boost (the "alarm" of the forensics).
 *  burst   a fire tap is a rapid burst: 7 rounds at 11.5 a second (0.6 s), each a noise crack, a low body thump and a small click,
 *          fading a little round by round, with a short slap echo off the street (a generated impulse response).
 *  intro   the chase opens quietly: the engine idles in, soft dings count down, "go" is a soft chord and one siren whoop, and the
 *          two-tone fades in under the engine after it.
 * Every level here was measured before the limiter (tools/catch-audio8.mjs, verification/catch-v8/audio8.json). */
export const AUDIO8 = Object.freeze({
  // C5 and F5 (a fourth): the second harmonics stay under 1.5 kHz and 25 dB down, the third 40 dB down (no whistle line for the ear or
  // for minigames/audio-guard.mjs); the fundamentals are under its 0.9 kHz line floor
  siren: {lo: 523, hi: 698, note: .62, slur: 14, cut: 1100, q: .5, wave: [1, .05, .012], level: .0285, near: 1.19, crew: .5, crewCut: 800, fadeIn: 1.4, doppler: .04, hold: 1100, crewHold: 1500},
  whoop: {from: 440, peak: 700, to: 500, up: .36, down: .56, level: 1.25},
  engine: {
    ratios: [0, 118, 70, 49, 37, 29.5, 24.5], idle: 820, red: 5800, shiftGap: .45, dip: .28, dipIn: .07, dipOut: .2,
    // harmonics of rpm/40: the even ones are the firing order (3rd crank order) and its multiples, the odd ones the V6 half orders;
    // h4-h8 carry the 250-900 Hz a phone speaker plays (its lows roll off under ~250 Hz); from h9 on they drop away, and with the
    // two low-passes (at most ~1 kHz) every line over 0.9 kHz sits more than 30 dB under the firing order (the forensics of the first
    // v8 draft caught h10 of a 4100 rpm boost at 1.03 kHz, 14 dB down, as a gliding line)
    a: [.45, 1, .35, .55, .22, .35, .12, .2, .05, .07, .025, .03, .012, .015, .006, .008], b: [.3, .8, .5, .3, .22, .18, .1, .1, .03, .03], detune: 7,
    cut: [450, 400, 200], level: [.025, .0125, .009], rumble: .55, intake: .12, rough: [.2, .08], jitter: .006, fadeIn: 1.6, launch: .9,
    upBase: 2000, upThrottle: 2400, // the upshift line: 2000 rpm with a light foot, 4400 at full throttle (f0 110 Hz)
  },
  burst: {rounds: 7, rate: 11.5, crack: .55, body: .4, click: .07, fade: .32, echo: .3, echoSeconds: .5, crackHz: [1150, 1450]},
  ding: {hz: 587, level: .05, go: [587, 740]}, // D5, and D5 + F#5 for "go": the second harmonics stay under 1.5 kHz
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The rpm a six-speed automatic would show at speed v (m/s), with hysteresis: shift up past `up`, down under `down` (both rise with
 * the throttle, so a boost kicks down and a light foot shifts early). Pure, for the tests: returns the gear to hold and its rpm. */
export function gearFor(v, throttle, gear, E = AUDIO8.engine) {
  const kmh = Math.max(0, v) * 3.6, up = E.upBase + E.upThrottle * throttle, down = 1250 + 1750 * throttle, rpm = g => Math.max(E.idle, kmh * E.ratios[g]);
  let g = clamp(gear | 0, 1, 6);
  if (g < 6 && rpm(g) > up && rpm(g + 1) > E.idle * 1.3) g++;
  else if (g > 1 && rpm(g) < down) g--;
  return {gear: g, rpm: Math.min(E.red, rpm(g))};
}
/** The rpm in a given gear at speed v (m/s), between idle and the red line. */
export function rpmIn(v, gear, E = AUDIO8.engine) { return clamp(Math.max(0, v) * 3.6 * E.ratios[clamp(gear | 0, 1, 6)], E.idle, E.red); }
/** The gear to pull away in: the highest one that keeps the rpm over the kickdown line for this throttle. */
export function startGear(v, throttle, E = AUDIO8.engine) { const down = 1250 + 1750 * throttle; for (let g = 6; g > 1; g--) if (rpmIn(v, g, E) >= down) return g; return 1; }
/** The rounds of one burst: time from the tap and a level that fades a little round by round (seeded jitter, so tests can repeat it). */
export function burstRounds({rounds = AUDIO8.burst.rounds, rate = AUDIO8.burst.rate, fade = AUDIO8.burst.fade, rnd = Math.random} = {}) {
  const out = [];
  for (let i = 0; i < rounds; i++) out.push({t: i / rate + (rnd() - .5) * .006, level: (1 - fade * i / Math.max(1, rounds - 1)) * (.9 + rnd() * .2)});
  return out;
}

/** @param {AudioContext} ac  @param {AudioNode} out  the master of catch-audio.mjs */
export function createAudio8(ac, out, {flags = {}} = {}) {
  const S = AUDIO8.siren, E = AUDIO8.engine, B = AUDIO8.burst;
  const has = name => typeof ac[name] === 'function';
  const wave = (amps, phase = 0) => {
    if (!has('createPeriodicWave')) return null;
    const n = amps.length + 1, re = new Float32Array(n), im = new Float32Array(n);
    amps.forEach((a, i) => { const p = phase * (i + 1); re[i + 1] = a * Math.sin(p); im[i + 1] = a * Math.cos(p); });
    try { return ac.createPeriodicWave(re, im); } catch { return null; }
  };
  const osc = (type, freq, pw) => { const o = ac.createOscillator(); if (pw && o.setPeriodicWave) { try { o.setPeriodicWave(pw); } catch { o.type = type; } } else o.type = type; o.frequency.value = freq; return o; };
  const lowpass = (hz, q = .7, type = 'lowpass') => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; return f; };
  const noiseBuffer = (seconds, brown = false) => {
    const len = Math.max(64, Math.ceil(ac.sampleRate * seconds)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let seed = 0x2f6e2b1, acc = 0; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    for (let i = 0; i < d.length; i++) { if (brown) { acc = acc * .985 + r() * .08; d[i] = acc * 3; } else d[i] = r(); }
    return buf;
  };
  let white = null, brown = null; const whiteBuf = () => (white ||= noiseBuffer(1)), brownBuf = () => (brown ||= noiseBuffer(2, true));
  const loopNoise = (buf, rate = 1) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; return s; };
  const now = () => ac.currentTime;
  let disposed = false;

  // ----- siren: a square LFO (rounded by a low-pass into short slurs) swings one warm oscillator between the two notes -----
  let siren = null, sirenTimer = 0, sirenFadeAt = 0, lastKind = null;
  const sirenWave = wave(S.wave);
  function sirenStop(secs = .25) {
    const v = siren; siren = null; clearTimeout(sirenTimer); if (!v) return;
    try { const t = now(); v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + secs); for (const o of [v.o, v.lfo]) o.stop(t + secs + .03); } catch { /* ignore */ }
  }
  /** One call per siren cue (the session sends one every 0.8 s); the voice fades out `hold` ms after the last call. */
  function sirenCue(arg = {}) {
    if (disposed) return false;
    const kind = arg.crew ? 'crew' : arg.near ? 'near' : 'soft', k = 1 + S.doppler * clamp(Number(arg.approach) || 0, -1, 1);
    const level = S.level * (arg.level == null ? 1 : clamp(Number(arg.level) || 0, .25, 1)) * (kind === 'near' ? S.near : kind === 'crew' ? S.crew : 1);
    const center = (S.lo + S.hi) / 2 * k, depth = (S.hi - S.lo) / 2 * k, cut = kind === 'crew' ? S.crewCut : S.cut, t = now();
    if (!siren) {
      const o = osc('triangle', center, sirenWave), lfo = osc('square', 1 / (2 * S.note)), slur = lowpass(S.slur, .5), d = ac.createGain(), f = lowpass(cut, S.q), g = ac.createGain();
      d.gain.value = depth; lfo.connect(slur).connect(d).connect(o.frequency); o.connect(f).connect(g).connect(out);
      // fade in (after the whoop of "go" when it is still sounding), so the siren never starts with a jolt
      const from = Math.max(t, sirenFadeAt - .1); g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, from); g.gain.linearRampToValueAtTime(level, from + S.fadeIn);
      o.start(t); lfo.start(t); siren = {o, lfo, d, f, g};
    } else {
      siren.o.frequency.setTargetAtTime(center, t, .2); siren.d.gain.setTargetAtTime(depth, t, .2); siren.f.frequency.setTargetAtTime(cut, t, .3);
      if (t > sirenFadeAt + S.fadeIn || kind !== lastKind) siren.g.gain.setTargetAtTime(level, t, .3);
    }
    lastKind = kind; clearTimeout(sirenTimer); sirenTimer = setTimeout(() => sirenStop(), kind === 'crew' ? S.crewHold : S.hold);
    return true;
  }
  /** "go": one soft siren whoop (up and down once), then the two-tone fades in under it. */
  function whoop() {
    if (disposed) return;
    const W = AUDIO8.whoop, t = now(), o = osc('triangle', W.from, sirenWave), f = lowpass(S.cut, S.q), g = ac.createGain(), peak = S.level * W.level, end = t + W.up + W.down;
    o.frequency.setValueAtTime(W.from, t); o.frequency.exponentialRampToValueAtTime(W.peak, t + W.up); o.frequency.exponentialRampToValueAtTime(W.to, end);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .07); g.gain.setValueAtTime(peak, t + W.up); g.gain.linearRampToValueAtTime(0, end);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(end + .05);
    sirenFadeAt = end - .25;
  }

  // ----- engine: two V6 voices (A, and B a few cents up for body), roughness, rumble, intake; two low-passes; a dip gain for shifts -----
  let eng = null;
  const st = {gear: 6, rpm: E.idle, throttle: .15, lastV: null, lastT: 0, lastShift: -9, launchUntil: 0, phase: 'run', braking: false, fadeIn: 0, started: false};
  function engineBuild() {
    if (eng || disposed) return;
    const t = now(), A = osc('sawtooth', E.idle / 40, wave(E.a, .7)), Bv = osc('sawtooth', E.idle / 40, wave(E.b, 1.9)); Bv.detune.value = E.detune;
    const gA = ac.createGain(), gB = ac.createGain(), mix = ac.createGain(), lp1 = lowpass(600, .5), lp2 = lowpass(700, .7), dip = ac.createGain(), g = ac.createGain();
    gA.gain.value = 1; gB.gain.value = .45; mix.gain.value = 1; dip.gain.value = 1;
    // roughness: slow noise on the mix gain (combustion to combustion) and on the pitch (a few cents)
    const roughSrc = loopNoise(whiteBuf(), .013), roughLp = lowpass(24, .5), rough = ac.createGain(); rough.gain.value = E.rough[0];
    const jitSrc = loopNoise(whiteBuf(), .007), jitLp = lowpass(8, .5), jit = ac.createGain(); jit.gain.value = E.idle / 40 * E.jitter;
    roughSrc.connect(roughLp).connect(rough).connect(mix.gain); jitSrc.connect(jitLp).connect(jit); jit.connect(A.frequency); jit.connect(Bv.frequency);
    const rum = loopNoise(brownBuf()), rumLp = lowpass(150, .6), rumG = ac.createGain(); rumG.gain.value = E.rumble;
    const ink = loopNoise(whiteBuf(), .9), inkBp = lowpass(450, .9, 'bandpass'), inkG = ac.createGain(); inkG.gain.value = 0;
    A.connect(gA).connect(mix); Bv.connect(gB).connect(mix); mix.connect(lp1).connect(lp2).connect(dip).connect(g).connect(out);
    rum.connect(rumLp).connect(rumG).connect(dip); ink.connect(inkBp).connect(inkG).connect(dip);
    g.gain.setValueAtTime(0, t);
    for (const s of [A, Bv, roughSrc, jitSrc, rum, ink]) s.start(t);
    eng = {A, Bv, gB, lp1, lp2, dip, g, rough, jit, inkBp, inkG, rumG, all: [A, Bv, roughSrc, jitSrc, rum, ink], fresh: true};
  }
  function engineStop(secs = .35) {
    const e = eng; eng = null; st.lastV = null; if (!e) return;
    try { const t = now(); e.g.gain.cancelScheduledValues(t); e.g.gain.setValueAtTime(e.g.gain.value, t); e.g.gain.linearRampToValueAtTime(0, t + secs); for (const s of e.all) s.stop(t + secs + .05); } catch { /* ignore */ }
  }
  /** Every frame of the chase: speed (m/s), boost; the session also tells the chase phase and the brake (engineState). */
  function engineSet(v, boosting) {
    engineBuild(); if (!eng) return;
    const t = now(), dt = st.lastV === null ? 0 : t - st.lastT;
    if (st.lastV !== null && dt < 1 / 90) return; // several sim steps in one audio quantum: one update is enough
    const speed = Number(v) || 0, accel = st.lastV === null || dt <= 0 ? 0 : (speed - st.lastV) / dt; st.lastV = speed; st.lastT = t;
    const idle = st.phase === 'countdown' || speed < .5, launch = t < st.launchUntil;
    const want = idle ? .12 : boosting || launch ? 1 : st.braking ? .03 : clamp(.28 + accel * .06, .12, .85);
    st.throttle += (want - st.throttle) * (1 - Math.exp(-(dt || .016) * 6));
    let target = E.idle + (idle ? 40 * Math.sin(t * 1.7) : 0);
    if (!idle) {
      if (!st.started) { st.started = true; st.throttle = want; st.gear = startGear(speed, want); st.lastShift = t; }
      else if (t - st.lastShift > E.shiftGap) { const g = gearFor(speed, st.throttle, st.gear).gear; if (g !== st.gear) { shift(t, g > st.gear); st.gear = g; } }
      target = rpmIn(speed, st.gear);
    } else st.started = false;
    const shifting = t - st.lastShift < E.dipOut;
    st.rpm += (target - st.rpm) * (1 - Math.exp(-(dt || .016) * (shifting ? 10 : idle ? 3 : 4.5)));
    const rpmN = clamp((st.rpm - E.idle) / 5000, 0, 1), f0 = st.rpm / 40, thr = st.throttle;
    eng.A.frequency.setTargetAtTime(f0, t, .03); eng.Bv.frequency.setTargetAtTime(f0, t, .03); eng.jit.gain.setTargetAtTime(f0 * E.jitter, t, .1);
    const cut = E.cut[0] + rpmN * E.cut[1] + thr * E.cut[2];
    eng.lp1.frequency.setTargetAtTime(cut, t, .06); eng.lp2.frequency.setTargetAtTime(cut * 1.15, t, .06);
    eng.rough.gain.setTargetAtTime(E.rough[0] + (E.rough[1] - E.rough[0]) * Math.max(rpmN, thr), t, .2);
    eng.inkBp.frequency.setTargetAtTime(350 + rpmN * 500, t, .1); eng.inkG.gain.setTargetAtTime(E.intake * thr * (.3 + rpmN), t, .08);
    eng.rumG.gain.setTargetAtTime(E.rumble * (.6 + .4 * thr), t, .15);
    const level = E.level[0] + thr * E.level[1] + rpmN * E.level[2];
    if (eng.fresh) { eng.fresh = false; eng.g.gain.setValueAtTime(0, t); eng.g.gain.linearRampToValueAtTime(level, t + (st.fadeIn || .4)); st.fadeIn = 0; }
    else eng.g.gain.setTargetAtTime(level, t, .12);
  }
  function shift(t, up) {
    st.lastShift = t; if (!eng) return;
    try { const d = eng.dip.gain; d.cancelScheduledValues(t); d.setValueAtTime(d.value, t); d.linearRampToValueAtTime(1 - E.dip * (up ? 1 : .6), t + E.dipIn); d.linearRampToValueAtTime(1, t + E.dipOut); } catch { /* ignore */ }
  }

  /** A short V6 rev on its own voice (the thief getting away on foot after a miss): up to ~4500 rpm and down, 1.1 s. */
  function rev() {
    if (disposed) return; const t = now(), A = osc('sawtooth', 1100 / 40, wave(E.a, .7)), f = lowpass(500, .5), g = ac.createGain();
    A.frequency.setValueAtTime(1100 / 40, t); A.frequency.exponentialRampToValueAtTime(4500 / 40, t + .35); A.frequency.exponentialRampToValueAtTime(1500 / 40, t + 1.05);
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1150, t + .35); f.frequency.linearRampToValueAtTime(450, t + 1.05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(E.level[0] * 1.6, t + .08); g.gain.setValueAtTime(E.level[0] * 1.6, t + .4); g.gain.linearRampToValueAtTime(0, t + 1.1);
    A.connect(f).connect(g).connect(out); A.start(t); A.stop(t + 1.15);
  }

  // ----- the burst: rounds of crack + body + click on one bus, the bus also feeds a short slap echo -----
  let bus = null;
  function busBuild() {
    if (bus) return bus;
    const g = ac.createGain(); g.gain.value = 1; g.connect(out);
    if (has('createConvolver')) {
      try {
        const sr = ac.sampleRate, len = Math.ceil(sr * B.echoSeconds), ir = ac.createBuffer(1, len, sr), d = ir.getChannelData(0);
        let seed = 0x51ed27, y = 0; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
        const a = 1 - Math.exp(-2 * Math.PI * 2200 / sr);
        for (let i = 0; i < len; i++) { const s = i / sr, x = s < .014 ? 0 : r() * Math.exp(-(s - .014) / .09) * .45; y += a * (x - y); d[i] = y; }
        for (const [s, v] of [[.031, .6], [.067, .4], [.104, .25]]) { const i = Math.round(s * sr); for (let j = 0; j < 24 && i + j < len; j++) d[i + j] += v * (1 - j / 24) * (j % 2 ? -1 : 1) * .5; }
        const conv = ac.createConvolver(); conv.buffer = ir; const wet = ac.createGain(); wet.gain.value = B.echo; g.connect(conv).connect(wet).connect(out);
      } catch { /* the dry burst still plays */ }
    }
    return (bus = g);
  }
  /** A tap on fire: `rounds` rounds at `rate` a second (defaults: 7 at 11.5 = 0.6 s), `level` scales the whole burst. */
  function burst({rounds = B.rounds, rate = B.rate, level = 1, delay = 0} = {}) {
    if (disposed) return 0;
    const b = busBuild(), t0 = now() + delay + .004, buf = whiteBuf(), plan = burstRounds({rounds, rate});
    for (const r of plan) {
      const t = t0 + Math.max(0, r.t), env = level * r.level;
      const c = ac.createBufferSource(); c.buffer = buf; c.playbackRate.value = .9 + Math.random() * .2;
      const bp = lowpass(B.crackHz[0] + Math.random() * (B.crackHz[1] - B.crackHz[0]), .75, 'bandpass'), gc = ac.createGain();
      gc.gain.setValueAtTime(0, t); gc.gain.linearRampToValueAtTime(B.crack * env, t + .0015); gc.gain.exponentialRampToValueAtTime(.0005, t + .045);
      c.connect(bp).connect(gc).connect(b); c.start(t, Math.random() * .5); c.stop(t + .06);
      const o = osc('sine', 150 + Math.random() * 20), gb = ac.createGain();
      o.frequency.setValueAtTime(150 + Math.random() * 20, t); o.frequency.exponentialRampToValueAtTime(52, t + .06);
      gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(B.body * env, t + .003); gb.gain.exponentialRampToValueAtTime(.0005, t + .085);
      o.connect(gb).connect(b); o.start(t); o.stop(t + .1);
      const k = ac.createBufferSource(); k.buffer = buf; const hp = lowpass(2400, .7, 'highpass'), gk = ac.createGain();
      gk.gain.setValueAtTime(B.click * env, t); gk.gain.exponentialRampToValueAtTime(.0005, t + .012);
      k.connect(hp).connect(gk).connect(b); k.start(t, Math.random() * .5); k.stop(t + .02);
    }
    return plan.length;
  }
  /** The net and the spike strip leave the launcher: a soft low thump and a whoosh of air. */
  function launch() {
    if (disposed) return; const t = now(), o = osc('sine', 170), g = ac.createGain();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(60, t + .14); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .006); g.gain.exponentialRampToValueAtTime(.0008, t + .22);
    o.connect(g).connect(out); o.start(t); o.stop(t + .25);
    const n = ac.createBufferSource(); n.buffer = whiteBuf(); const f = lowpass(1400, .8, 'bandpass'), gn = ac.createGain();
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(450, t + .35); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.09, t + .05); gn.gain.exponentialRampToValueAtTime(.001, t + .38);
    n.connect(f).connect(gn).connect(out); n.start(t); n.stop(t + .4);
  }
  /** The pulse charges (the zap of a hit follows from catch-audio.mjs). */
  function charge() {
    if (disposed) return; const t = now(), o = osc('triangle', 320), f = lowpass(1500, .7), g = ac.createGain();
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(1100, t + .2); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.04, t + .02); g.gain.linearRampToValueAtTime(0, t + .24);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + .26);
  }
  /** Fire with nothing to fire at (out of range): a soft muffled click. */
  function dry() {
    if (disposed) return; const t = now(), n = ac.createBufferSource(); n.buffer = whiteBuf(); const f = lowpass(900, .7), g = ac.createGain();
    g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.0008, t + .03); n.connect(f).connect(g).connect(out); n.start(t, .2); n.stop(t + .04);
    const o = osc('sine', 230), go = ac.createGain(); go.gain.setValueAtTime(.025, t); go.gain.exponentialRampToValueAtTime(.0008, t + .05); o.connect(go).connect(out); o.start(t); o.stop(t + .06);
  }
  /** The countdown: a soft ding per number; "go" a soft two-note chord, the siren whoop, and a short throttle for the engine. */
  function ding() { if (disposed) return; const D = AUDIO8.ding; pluck(D.hz, D.level, 0); }
  function go() { if (disposed) return; const D = AUDIO8.ding; pluck(D.go[0], D.level * .9, 0); pluck(D.go[1], D.level * .8, .05); whoop(); st.launchUntil = now() + E.launch; }
  function pluck(hz, level, delay) {
    const t = now() + delay, o = osc('sine', hz), o2 = osc('sine', hz * 2), g = ac.createGain(), g2 = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + .005); g.gain.exponentialRampToValueAtTime(.0005, t + .3);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(level * .12, t + .005); g2.gain.exponentialRampToValueAtTime(.0005, t + .12);
    o.connect(g).connect(out); o2.connect(g2).connect(out); o.start(t); o2.start(t); o.stop(t + .32); o2.stop(t + .14);
  }
  return {
    flags, siren: sirenCue, sirenStop, whoop, burst, launch, charge, dry, ding, go,
    engine: engineSet, engineStop,
    /** The chase phase (an idle engine through the countdown) and the brake, from the session every frame. */
    engineState(phase, braking) { st.phase = phase || 'run'; st.braking = Boolean(braking); },
    /** The chase view is up: the engine will fade in from silence at idle, slower than a restart. */
    engineIn() { st.fadeIn = E.fadeIn; },
    rev,
    status() { return {siren: siren ? lastKind : null, sirenGain: siren ? +siren.g.gain.value.toFixed(4) : 0, engine: Boolean(eng), gear: st.gear, rpm: Math.round(st.rpm), throttle: +st.throttle.toFixed(2)}; },
    dispose() { disposed = true; clearTimeout(sirenTimer); try { sirenStop(.05); engineStop(.05); } catch { /* ignore */ } },
  };
}

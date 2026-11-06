/** Original procedural sports foley. No samples, network or endless sources.
 * The same bounded PCM renderer is used in the browser and in node --test.
 * Times are seconds; levels are linear. See ../INTEGRATION.md for the contract.
 */
const TAU = Math.PI * 2;
const clamp = (value, low, high, fallback) =>
  Math.min(high, Math.max(low, typeof value === 'number' && Number.isFinite(value) ? value : fallback));
const definition = (label, group, duration, maxDuration, peak, cooldown = .035) =>
  Object.freeze({label, group, duration, maxDuration, peak, cooldown});

export const SOUND_CATALOG = Object.freeze({
  whistle: definition('שריקת שופט קצרה', 'official', .19, .28, .38, .30),
  basketballBounce: definition('כדור על פרקט', 'basketball', .29, .42, .64),
  basketballCatch: definition('תפיסת כדורסל', 'basketball', .16, .24, .42),
  basketballPass: definition('מסירת כדורסל', 'basketball', .19, .28, .38),
  netSwish: definition('סוויש ברשת', 'basketball', .39, .58, .42),
  rimHit: definition('כדור בטבעת', 'basketball', .57, .80, .55),
  backboardHit: definition('כדור בלוח', 'basketball', .26, .38, .57),
  shoeSqueak: definition('נעל על פרקט', 'basketball', .18, .29, .31, .08),
  buzzer: definition('זמזם סוף זמן', 'official', .44, .65, .35, .70),
  soccerKick: definition('בעיטה בכדורגל', 'soccer', .22, .34, .65),
  soccerPass: definition('מסירת כדורגל', 'soccer', .14, .22, .43),
  soccerTrap: definition('עצירת כדור ברגל', 'soccer', .13, .22, .36),
  goalpostHit: definition('פגיעה בקורה', 'soccer', .73, 1.0, .58),
  soccerNet: definition('כדור ברשת שער', 'soccer', .46, .67, .38),
  courtStep: definition('צעד על מגרש', 'movement', .15, .23, .35, .07),
  runningSteps: definition('שלושה צעדי ריצה', 'movement', .62, .85, .38, .20),
  grassStep: definition('צעד בדשא', 'movement', .21, .32, .34, .07),
  grassSlide: definition('גלישה בדשא', 'movement', .51, .74, .38, .12),
  grassRustle: definition('רשרוש דשא', 'movement', .34, .52, .24, .10),
  crowdBed: definition('קהל ברקע · מקטע סופי', 'crowd', 2.4, 3.2, .15, .30),
  crowdCheer: definition('התלהבות קהל', 'crowd', 1.8, 2.7, .34, .30),
  crowdDisappoint: definition('אכזבת קהל', 'crowd', 1.45, 2.2, .27, .30),
  applause: definition('מחיאות כפיים', 'crowd', 1.2, 1.9, .31, .25),
  tennisServe: definition('הגשת טניס', 'tennis', .27, .39, .56),
  tennisHit: definition('כדור במחבט', 'tennis', .18, .29, .52),
  tennisBounce: definition('כדור טניס במגרש', 'tennis', .13, .23, .41),
  tennisNet: definition('כדור ברשת טניס', 'tennis', .25, .39, .33),
  skiGlide: definition('גלישה בשלג', 'ski', .75, 1.1, .23, .15),
  skiCarve: definition('פנייה חדה בשלג', 'ski', .55, .82, .37, .12),
  skiJump: definition('ניתור סקי', 'ski', .29, .45, .32),
  skiLand: definition('נחיתה בשלג', 'ski', .39, .59, .56),
  skiGate: definition('מגע בשער סלאלום', 'ski', .28, .44, .42),
  windGust: definition('משב רוח', 'ski', 1.2, 1.8, .18, .20),
  engineBurst: definition('האצת מנוע קצרה', 'racing', .85, 1.25, .32, .15),
  tireSkid: definition('החלקת צמיג', 'racing', .43, .68, .35, .12),
  landingThud: definition('נחיתה על הקרקע', 'movement', .27, .43, .51),
});

function randomFrom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
function nameSeed(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Returns a new mono Float32Array. Options never extend a sound beyond its cap.
 * tone is synthesized into the waveform, never implemented as slower playback.
 */
export function renderSound(name, options = {}) {
  if (!Object.hasOwn(SOUND_CATALOG, name)) throw new RangeError(`Unknown sports sound: ${name}`);
  options ??= {};
  const spec = SOUND_CATALOG[name];
  const sampleRate = Math.round(clamp(options.sampleRate, 8000, 48000, 24000));
  const duration = clamp(options.duration, .06, spec.maxDuration, spec.duration);
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  const seconds = length / sampleRate;
  const intensity = clamp(options.intensity, 0, 1, .8);
  const tone = clamp(options.tone, .75, 1.25, 1);
  const seed = clamp(options.seed, 0, 4294967295, nameSeed(name)) >>> 0;
  const random = randomFrom(seed);

  // Modal impact: independently damped, inharmonic modes, not a musical note.
  function modes(at, span, frequencies, decay, level, sweep = 0) {
    at = Math.max(0, at); span = Math.max(0, span);
    const start = Math.floor(at * sampleRate), count = Math.min(length - start, Math.ceil(span * sampleRate));
    for (let mode = 0; mode < frequencies.length; mode++) {
      const frequency = frequencies[mode] * tone;
      if (frequency > sampleRate * .43) continue;
      const amplitude = level / (1 + mode * .8), damping = decay * (1 + mode * .48);
      for (let j = 0; j < count; j++) {
        const t = j / sampleRate;
        const phase = TAU * frequency * (t + sweep * .012 * (1 - Math.exp(-t / .012)));
        samples[start + j] += amplitude * Math.sin(phase) * Math.exp(-t * damping) * Math.min(1, t / .0008);
      }
    }
  }
  // Band-limited, nonrepeating noise using a stable constant-peak biquad.
  function noise(at, span, frequency, q, level, attack = .003, decay = 6, motion = 0) {
    at = Math.max(0, at); span = Math.max(0, span);
    const start = Math.floor(at * sampleRate), count = Math.min(length - start, Math.ceil(span * sampleRate));
    const omega = TAU * Math.min(sampleRate * .40, frequency * tone) / sampleRate;
    const alpha = Math.sin(omega) / (2 * q), denominator = 1 + alpha;
    const b0 = alpha / denominator, a1 = -2 * Math.cos(omega) / denominator, a2 = (1 - alpha) / denominator;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, attenuation = 1;
    const decayStep = Math.exp(-decay / sampleRate);
    for (let j = 0; j < count; j++) {
      const t = j / sampleRate, x = random() * 2 - 1;
      const y = b0 * (x - x2) - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const envelope = Math.min(1, t / attack) * attenuation;
      samples[start + j] += level * y * envelope * (motion ? 1 + motion * Math.sin(TAU * 19 * t) : 1);
      attenuation *= decayStep;
    }
  }
  function ball(kind, at = 0, strength = 1) {
    const basketball = kind === 'basketball';
    modes(at, .32, basketball ? [87, 151, 229, 391] : [105, 188, 317], basketball ? 24 : 37, .72 * strength, basketball ? 1.8 : .55);
    noise(at, .055, basketball ? 1450 : 1900, .65, .67 * strength, .0007, 85);
    noise(at + .007, .10, 590, 1.3, .24 * strength, .001, 44);
    if (basketball) modes(at + .002, .12, [690, 1140, 1830], 48, .09 * strength);
  }
  function step(at, grass = false, strength = 1) {
    modes(at, .14, grass ? [97, 171, 310] : [126, 213, 518], 43, .55 * strength);
    noise(at, grass ? .21 : .09, grass ? 2350 : 1380, .6, .58 * strength, .002, grass ? 16 : 56);
    noise(at + .025, .10, grass ? 4100 : 800, .8, .17 * strength, .005, 32);
  }
  function fabric(at, span, level = 1) {
    noise(at, span, 3100, .7, .52 * level, .009, 8, .45);
    noise(at + .028, Math.max(.02, span - .03), 1150, .65, .38 * level, .006, 11, .36);
    for (let i = 0; i < 5; i++) noise(at + .025 + i * .028, .047, 4300 - i * 230, 1.3, .22 * level, .001, 55);
  }
  function crowd(kind) {
    const bed = kind === 'bed', sad = kind === 'sad';
    // Vocal formants on a noisy carrier; no words, sampled voices or whistles.
    noise(0, seconds, 390, .9, .38, .13, bed ? .18 : .65, .13);
    noise(0, seconds, 920, 1.2, .28, .18, .5, .16);
    const voices = bed ? 9 : 16;
    for (let voice = 0; voice < voices; voice++) {
      const at = random() * (bed ? seconds * .75 : .26);
      const pitch = 105 + random() * 110, phase = random() * TAU;
      const span = Math.min(seconds - at, bed ? .45 + random() * .6 : .9 + random() * .8);
      if (span <= 0) continue;
      const start = Math.floor(at * sampleRate), count = Math.floor(span * sampleRate);
      let sine = Math.sin(phase), cosine = Math.cos(phase), rotationSine = 0, rotationCosine = 1;
      let windowSine = 0, windowCosine = 1, lfoSine = 0, lfoCosine = 1;
      const windowStepSine = Math.sin(TAU / (span * sampleRate)), windowStepCosine = Math.cos(TAU / (span * sampleRate));
      const lfoStepSine = Math.sin(TAU * (4.5 + voice * .13) / sampleRate), lfoStepCosine = Math.cos(TAU * (4.5 + voice * .13) / sampleRate);
      for (let j = 0; j < count; j++) {
        const t = j / sampleRate;
        // A rotating unit vector yields all harmonics. Refresh its frequency
        // every 32 samples; normalise to avoid long-run numerical drift.
        if ((j & 31) === 0) {
          const step = TAU * (pitch + (sad ? -50 : 28) * t) / sampleRate;
          rotationSine = Math.sin(step); rotationCosine = Math.cos(step);
          const norm = 1 / Math.hypot(sine, cosine); sine *= norm; cosine *= norm;
        }
        const squared = sine * sine, third = sine * (3 - 4 * squared);
        const fifth = sine * (5 + squared * (16 * squared - 20));
        const secondSine = 2 * sine * cosine, secondCosine = cosine * cosine - squared;
        const fourthSine = 2 * secondSine * secondCosine, fourthCosine = secondCosine * secondCosine - secondSine * secondSine;
        const formant = .60 * third + .25 * fifth + .24 * fourthSine * fourthCosine;
        const envelope = .5 * (1 - windowCosine) * (bed ? .018 : .043);
        samples[start + j] += envelope * formant * (1 + .16 * lfoSine);
        const nextSine = sine * rotationCosine + cosine * rotationSine;
        cosine = cosine * rotationCosine - sine * rotationSine; sine = nextSine;
        const nextWindowSine = windowSine * windowStepCosine + windowCosine * windowStepSine;
        windowCosine = windowCosine * windowStepCosine - windowSine * windowStepSine; windowSine = nextWindowSine;
        const nextLfoSine = lfoSine * lfoStepCosine + lfoCosine * lfoStepSine;
        lfoCosine = lfoCosine * lfoStepCosine - lfoSine * lfoStepSine; lfoSine = nextLfoSine;
      }
    }
    if (!bed && !sad) for (let i = 0; i < 17; i++) noise(.17 + random() * (seconds - .32), .06, 1750, .75, .15, .001, 65);
  }

  switch (name) {
    case 'whistle': {
      const whistleLength = Math.min(seconds, .245);
      for (let i = 0; i < Math.floor(whistleLength * sampleRate); i++) {
        const t = i / sampleRate;
        const envelope = Math.min(1, t / .008) * Math.min(1, Math.max(0, (whistleLength - t) / .035));
        const trill = .73 + .18 * Math.sin(TAU * 42 * t) + .09 * Math.sin(TAU * 83 * t);
        const whistleTone = Math.min(tone, sampleRate * .43 / 3420);
        const phase = TAU * whistleTone * (2970 * t + 2.1 * (1 - Math.exp(-t * 45)));
        const second = TAU * whistleTone * 3420 * t + .24 * Math.sin(TAU * 38 * t);
        samples[i] = envelope * trill * (.72 * Math.sin(phase) + .28 * Math.sin(second));
      }
      noise(0, whistleLength, 3200, 2, .09, .006, 15);
      break;
    }
    case 'basketballBounce': ball('basketball'); break;
    case 'basketballCatch': ball('basketball', 0, .48); noise(.012, .07, 850, .7, .6, .002, 50); break;
    case 'basketballPass': fabric(0, .12, .5); ball('basketball', .045, .45); break;
    case 'netSwish': fabric(0, seconds, 1); noise(.075, .13, 5900, 1.4, .16, .012, 17); break;
    case 'rimHit':
      ball('basketball', 0, .33); modes(.003, seconds - .003, [463, 783, 1267, 1993, 2837], 12, .35);
      noise(0, .035, 2900, 1, .3, .001, 100); break;
    case 'backboardHit':
      modes(0, seconds, [124, 281, 497, 1081], 29, .63); noise(0, .07, 820, .7, .6, .001, 61); break;
    case 'shoeSqueak': case 'tireSkid': {
      const tire = name === 'tireSkid';
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate, p = t / seconds;
        const phase = TAU * tone * ((tire ? 690 : 1670) * t + (tire ? 170 : -380) * t * t);
        samples[i] = Math.sin(Math.PI * p) ** 1.6 * (.40 * Math.sin(phase + .8 * Math.sin(TAU * 74 * t)) + .12 * Math.sin(phase * 1.47));
      }
      noise(0, seconds, tire ? 2100 : 3900, .8, .24, .006, 5, .5); break;
    }
    case 'buzzer':
      modes(0, seconds, [185, 370, 555, 925], 1.5, .4); noise(0, seconds, 490, 2, .10, .006, 3); break;
    case 'soccerKick': ball('soccer'); noise(.002, .035, 3100, .9, .35, .001, 100); break;
    case 'soccerPass': ball('soccer', 0, .7); break;
    case 'soccerTrap': step(0, true, .2); ball('soccer', .005, .35); break;
    case 'goalpostHit':
      modes(0, seconds, [227, 602, 1171, 1919, 2861], 7.2, .49); noise(0, .045, 2100, .7, .4, .001, 95); break;
    case 'soccerNet': ball('soccer', 0, .3); fabric(.025, seconds - .025, .8); break;
    case 'courtStep': step(0); break;
    case 'runningSteps': step(0, false, .8); step(seconds * .33, false, 1); step(seconds * .66, false, .85); break;
    case 'grassStep': step(0, true); break;
    case 'grassSlide':
      step(0, true, .4); noise(.015, seconds - .015, 1800, .6, .7, .06, 3.8, .6); noise(.06, seconds - .06, 4300, .7, .28, .03, 6, .8); break;
    case 'grassRustle': noise(0, seconds, 2900, .55, .75, .035, 6, .65); noise(.04, .19, 4700, 1.3, .2, .012, 12); break;
    case 'crowdBed': crowd('bed'); break;
    case 'crowdCheer': crowd('cheer'); break;
    case 'crowdDisappoint': crowd('sad'); break;
    case 'applause':
      for (let i = 0; i < 37; i++) {
        const at = random() * (seconds - .08), level = .13 + random() * .22;
        noise(at, .065, 1200 + random() * 1500, .7, level, .0008, 70);
        modes(at, .045, [650 + random() * 250, 1440], 95, level * .22);
      } break;
    case 'tennisServe': fabric(0, .11, .34); modes(.065, .18, [198, 461, 973], 41, .65); noise(.065, .045, 2700, .7, .8, .0007, 88); break;
    case 'tennisHit': modes(0, seconds, [203, 479, 1073], 43, .62); noise(0, .049, 2900, .7, .8, .0007, 84); break;
    case 'tennisBounce': modes(0, seconds, [377, 681, 1359], 62, .6); noise(0, .036, 2500, .8, .5, .0008, 100); break;
    case 'tennisNet': modes(0, .09, [193, 421], 55, .32); fabric(.005, seconds - .005, .55); break;
    case 'skiGlide': case 'skiCarve': case 'skiJump': case 'skiLand': {
      const carve = name === 'skiCarve', land = name === 'skiLand';
      noise(0, seconds, carve ? 2250 : 1550, .6, .7, land ? .003 : .045, land ? 11 : 2, .4);
      noise(.01, Math.max(.02, seconds - .01), carve ? 4300 : 3500, .9, carve ? .44 : .22, .028, 5, .5);
      if (land) modes(0, .21, [69, 119, 239], 26, .7);
      if (name === 'skiJump') modes(0, .12, [110, 273], 39, .3);
      break;
    }
    case 'skiGate': modes(0, seconds, [291, 739, 1543], 28, .58); noise(0, .08, 1700, .8, .4, .001, 46); break;
    case 'windGust': noise(0, seconds, 370, .6, .8, .22, .8, .2); noise(0, seconds, 1100, .7, .25, .35, 1.4); break;
    case 'engineBurst':
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate, p = t / seconds, phase = TAU * tone * (58 * t + 39 * t * t);
        samples[i] = Math.sin(Math.PI * p) * (.44 * Math.sin(phase) + .27 * Math.sin(phase * 2) + .14 * Math.sin(phase * 4) + .08 * Math.sin(phase * 7));
      }
      noise(0, seconds, 650, .7, .24, .045, 1.2, .5); break;
    case 'landingThud': modes(0, seconds, [71, 133, 302], 24, .7); noise(0, .15, 810, .6, .7, .002, 29); break;
  }

  // Remove DC and apply a final fade independent of every synthesis branch.
  // Two milliseconds of exact zero make the endpoint objectively testable.
  let priorInput = 0, priorOutput = 0, peak = 0;
  const highpass = Math.exp(-TAU * 25 / sampleRate), guard = Math.ceil(.002 * sampleRate);
  const release = spec.group === 'crowd' ? Math.min(.32, Math.max(.018, seconds * .22)) :
    name === 'windGust' ? Math.min(.28, Math.max(.018, seconds * .25)) :
      name === 'skiGlide' || name === 'skiCarve' ? Math.min(.09, Math.max(.018, seconds * .2)) : .018;
  for (let i = 0; i < length; i++) {
    const x = samples[i], y = x - priorInput + highpass * priorOutput;
    priorInput = x; priorOutput = y;
    const edge = Math.min(1, i / (sampleRate * .002), Math.max(0, (length - guard - i) / (sampleRate * release)));
    samples[i] = edge > 0 ? y * edge : 0;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const gain = peak > 0 ? spec.peak * intensity / peak : 0;
  if (intensity === 0) samples.fill(0);
  else for (let i = 0; i < length - guard; i++) samples[i] *= gain;
  samples.fill(0, length - guard);
  return {samples, sampleRate, duration: seconds, maxDuration: spec.maxDuration, seed};
}

/** Lazy WebAudio player. Call unlock() directly from a pointer/keyboard gesture.
 * Each named method accepts {intensity,tone,duration,seed,volume,pan,delay}.
 * Unknown events throw; unavailable, muted, paused or throttled events return null.
 */
export function createSportsAudio(options = {}) {
  const AudioContextClass = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const documentTarget = Object.hasOwn(options, 'document') ? options.document : globalThis.document;
  const pageTarget = Object.hasOwn(options, 'pageTarget') ? options.pageTarget : globalThis.window;
  const maxVoices = Math.round(clamp(options.maxVoices, 1, 8, 6));
  const cacheLimit = Math.round(clamp(options.cacheBytes, 0, 4 * 1024 * 1024, 2 * 1024 * 1024));
  const renderRate = Math.round(clamp(options.sampleRate, 8000, 48000, 24000));
  let context = options.context ?? null, master, limiter;
  const owned = !context;
  let muted = Boolean(options.muted), paused = false, hidden = Boolean(documentTarget?.hidden), disposed = false;
  let volume = clamp(options.volume, 0, 1, .65), sequence = 0, cacheBytes = 0;
  const active = new Set(), cache = new Map(), last = new Map();

  function clean(voice) {
    if (voice.ended) return;
    voice.ended = true; active.delete(voice);
    voice.source.onended = null;
    for (const node of voice.nodes) try { node.disconnect(); } catch { /* already disconnected */ }
    try { voice.source.buffer = null; } catch { /* older implementations retain it until GC */ }
    voice.nodes.length = 0;
    voice.resolve();
  }
  function stopVoice(voice, immediate = false) {
    immediate ||= context?.state !== 'running';
    if (voice.ended || (voice.stopping && !immediate)) return;
    voice.stopping = true;
    try {
      const now = context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(immediate ? 0 : voice.level, now);
      if (!immediate) voice.gain.gain.linearRampToValueAtTime(0, now + .008);
      voice.source.stop(now + (immediate ? 0 : .008));
    } catch { clean(voice); }
    if (immediate) clean(voice);
  }
  function stopAll() { for (const voice of [...active]) stopVoice(voice, true); }
  function applyVolume() { if (master) master.gain.value = muted || paused || hidden || disposed ? 0 : volume; }
  function graph() {
    if (master) return;
    let nextMaster, nextLimiter;
    try {
      nextMaster = context.createGain(); nextLimiter = context.createWaveShaper();
      const curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) curve[i] = .9 * Math.tanh((i / 1024 - 1) / .9);
      // Oversampling filters introduce a tail past source.stop(). The inputs
      // are band-limited and this mild static transfer has no time-domain tail.
      nextLimiter.curve = curve; nextLimiter.oversample = 'none';
      nextMaster.connect(nextLimiter); nextLimiter.connect(context.destination);
      master = nextMaster; limiter = nextLimiter; applyVolume();
      context.addEventListener?.('statechange', onStateChange);
    } catch (error) {
      nextMaster?.disconnect(); nextLimiter?.disconnect(); throw error;
    }
  }
  async function unlock() {
    if (disposed || paused || hidden || muted) return false;
    try {
      if (!context) {
        if (!AudioContextClass) return false;
        context = new AudioContextClass({latencyHint: 'interactive'});
      }
      if (context.state === 'closed') return false;
      graph();
      if (context.state !== 'running') await context.resume();
      return !disposed && !paused && !hidden && !muted && context.state === 'running';
    } catch { return false; }
  }
  function bufferFor(name, duration, tone, seed) {
    const key = `${name}:${renderRate}:${duration}:${tone}:${seed}`;
    let buffer = cache.get(key);
    if (buffer) { cache.delete(key); cache.set(key, buffer); return buffer; }
    // Intensity belongs to the voice gain. A softly played prepared event can
    // therefore reuse its buffer when the next contact is stronger.
    const rendered = renderSound(name, {sampleRate: renderRate, intensity: 1, tone, duration, seed});
    buffer = context.createBuffer(1, rendered.samples.length, rendered.sampleRate);
    buffer.getChannelData(0).set(rendered.samples);
    const bytes = rendered.samples.byteLength;
    while (cacheBytes + bytes > cacheLimit && cache.size) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).length * 4; cache.delete(oldest);
    }
    if (bytes <= cacheLimit) { cache.set(key, buffer); cacheBytes += bytes; }
    return buffer;
  }
  /** Prepare only this game's events after unlock(), before starting its frame
   * loop. Finite 0 ms yields keep input responsive between buffers. No playback.
   * Default foley gets four variations; crowd gets one reusable finite phrase.
   */
  async function prepare(names, parameters = {}) {
    if (!Array.isArray(names)) throw new TypeError('prepare expects an array of event names');
    const unique = [...new Set(names)];
    for (const name of unique) if (!Object.hasOwn(SOUND_CATALOG, name)) throw new RangeError(`Unknown sports sound: ${name}`);
    parameters ??= {};
    let prepared = 0;
    for (const name of unique) {
      const spec = SOUND_CATALOG[name];
      const variations = parameters.seed !== undefined || spec.group === 'crowd' ? 1 : 4;
      for (let variant = 0; variant < variations; variant++) {
        if (disposed || hidden || paused || !master || context.state === 'closed') return {prepared, cacheBytes};
        bufferFor(name, clamp(parameters.duration, .06, spec.maxDuration, spec.duration),
          clamp(parameters.tone, .75, 1.25, 1), clamp(parameters.seed, 0, 4294967295, (nameSeed(name) + variant) >>> 0) >>> 0);
        prepared++;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return {prepared, cacheBytes};
  }
  function play(name, parameters = {}) {
    if (!Object.hasOwn(SOUND_CATALOG, name)) throw new RangeError(`Unknown sports sound: ${name}`);
    parameters ??= {};
    if (disposed || paused || hidden || muted || !master || context?.state !== 'running') return null;
    const spec = SOUND_CATALOG[name], now = context.currentTime;
    if (now - (last.get(name) ?? -Infinity) < spec.cooldown) return null;
    if (active.size >= maxVoices && spec.group !== 'official') return null;
    const intensity = clamp(parameters.intensity, 0, 1, .8), level = clamp(parameters.volume, 0, 1, 1) * intensity;
    if (!intensity || !level || !volume) return null;
    const tone = clamp(parameters.tone, .75, 1.25, 1);
    const duration = clamp(parameters.duration, .06, spec.maxDuration, spec.duration);
    const variant = spec.group === 'crowd' ? 0 : sequence++ % 4;
    const seed = clamp(parameters.seed, 0, 4294967295, (nameSeed(name) + variant) >>> 0) >>> 0;
    let voice;
    const nodes = [];
    try {
      const buffer = bufferFor(name, duration, tone, seed);
      const source = context.createBufferSource(); nodes.push(source);
      const gain = context.createGain(); nodes.push(gain);
      source.buffer = buffer; source.loop = false; source.playbackRate.value = 1;
      gain.gain.value = level; source.connect(gain);
      if (context.createStereoPanner) {
        const panner = context.createStereoPanner(); nodes.push(panner);
        panner.pan.value = clamp(parameters.pan, -1, 1, 0);
        gain.connect(panner); panner.connect(master);
      } else gain.connect(master);
      let resolve;
      const ended = new Promise(done => { resolve = done; });
      const priority = spec.group === 'official' ? 3 : spec.group === 'crowd' ? 0 : spec.group === 'movement' ? 1 : 2;
      voice = {source, gain, nodes, resolve, level, priority, ended: false, stopping: false};
      if (active.size >= maxVoices) {
        const victim = [...active].reduce((lowest, candidate) => candidate.priority < lowest.priority ? candidate : lowest);
        stopVoice(victim, true);
      }
      active.add(voice); source.onended = () => clean(voice);
      const start = context.currentTime + clamp(parameters.delay, 0, .25, 0);
      source.start(start); source.stop(start + buffer.duration);
      last.set(name, context.currentTime);
      return Object.freeze({duration: buffer.duration, maxDuration: spec.maxDuration, ended, stop: () => stopVoice(voice)});
    } catch {
      if (voice) { try { voice.source.stop(); } catch {} clean(voice); }
      else for (const node of nodes) try { node.disconnect(); } catch {}
      return null;
    }
  }
  function onStateChange() { if (context.state !== 'running') stopAll(); }
  function onVisibility() { hidden = Boolean(documentTarget.hidden); if (hidden) stopAll(); applyVolume(); }
  function onPageHide() { hidden = true; stopAll(); applyVolume(); }
  function onPageShow() { hidden = Boolean(documentTarget?.hidden); applyVolume(); }
  documentTarget?.addEventListener?.('visibilitychange', onVisibility);
  pageTarget?.addEventListener?.('pagehide', onPageHide);
  pageTarget?.addEventListener?.('pageshow', onPageShow);
  const api = {
    unlock, prepare, play, stopAll,
    setMuted(value) { muted = Boolean(value); if (muted) stopAll(); applyVolume(); },
    setPaused(value) { paused = Boolean(value); if (paused) stopAll(); applyVolume(); },
    setVolume(value) { volume = clamp(value, 0, 1, volume); if (!volume) stopAll(); applyVolume(); },
    clearCache() { cache.clear(); cacheBytes = 0; },
    get metrics() { return Object.freeze({activeVoices: active.size, maxVoices, cacheBytes, cacheLimit, cachedBuffers: cache.size, muted, paused, hidden, disposed, state: context?.state ?? 'locked'}); },
    async dispose() {
      if (disposed) return;
      disposed = true; stopAll(); api.clearCache(); last.clear();
      documentTarget?.removeEventListener?.('visibilitychange', onVisibility);
      pageTarget?.removeEventListener?.('pagehide', onPageHide);
      pageTarget?.removeEventListener?.('pageshow', onPageShow);
      context?.removeEventListener?.('statechange', onStateChange);
      master?.disconnect(); limiter?.disconnect();
      if (owned && context && context.state !== 'closed') try { await context.close(); } catch { /* browser interruption */ }
    },
  };
  for (const name of Object.keys(SOUND_CATALOG)) api[name] = parameters => play(name, parameters);
  return Object.freeze(api);
}

/** Local Alpine samples. Fetching/optional offline decoding starts before play; the
 * audible context is created only by unlock(), called from a user gesture. */
const ROOT = new URL('../design/audio/', import.meta.url);
const SAMPLE_CUES = {boost: 'ski/wind', takeoff: 'ski/jump', land: 'ski/landing', hit: 'ski/fall', crash: 'ski/fall', gate: 'ski/slalom-gate', finish: 'scenes/victory', opening: 'scenes/opening', defeat: 'scenes/defeat'};
const LAYERS = {takeoff: 'ski_air', land: 'ski_landing', hit: 'ski_fall', crash: 'ski_fall', finish: 'victory', opening: 'opening', defeat: 'defeat'};
// Short interface cues have no corresponding design sample. These also keep
// sound usable when audio decoding is unavailable, without network fallbacks.
const TONES = {countdown: [660, 660, .12], go: [880, 1320, .3], boost: [380, 1400, .5], gate: [990, 1480, .16], takeoff: [500, 900, .18], land: [180, 70, .2], hit: [140, 55, .28], overtake: [740, 990, .14], finish: [523, 1046, .7], trickStart: [420, 640, .12], trick: [660, 1320, .38], crash: [240, 55, .5], coin: [1320, 1980, .09], opening: [523, 784, .5], defeat: [330, 165, .5]};
const linear = db => Math.pow(10, db / 20);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

export function createAlpineAudio({storage = globalThis.localStorage, AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext, OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext, fetch: fetcher = globalThis.fetch, baseUrl = ROOT} = {}) {
  const root = new URL(baseUrl), abort = new AbortController(), encoded = new Map(), buffers = new Map(), voices = new Set(), lastCue = new Map(), errors = new Set();
  let context, master, limiter, mix, preparation, decoding, offline, bed, scrape, wind;
  let disposed = false, paused = false, muted = false, preloaded = false, decoded = false, nextWind = 0, scrapeMutedUntil = 0, duckUntil = 0, duckDb = 0;
  let lastSpeed = 0, lastCarving = 0, lastAirborne = false, lastBoosting = false;
  const at = () => context?.currentTime || 0;
  function readMute() { try { muted = storage?.getItem('island.sound') === 'off'; } catch {} }
  function target(param, value, duration = .04) {
    if (!param) return;
    try { param.cancelScheduledValues?.(at()); param.setTargetAtTime(value, at(), Math.max(.001, duration / 3)); } catch { param.value = value; }
  }
  function masterLevel() { return muted || paused || disposed ? 0 : linear(mix?.master?.recommended_gain_db ?? -3); }
  function audible() { return !!context && context.state === 'running' && !muted && !paused && !disposed; }
  function cleanup(v) {
    if (!v || v.cleaned) return;
    v.cleaned = true; voices.delete(v);
    if (scrape === v) scrape = null; if (wind === v) wind = null; if (bed === v) bed = null;
    for (const node of v.nodes) { try { node.disconnect(); } catch {} }
  }
  function stop(v, duration = .04) {
    if (!v || v.cleaned || v.stopping) return;
    v.stopping = true; target(v.gain.gain, 0, duration);
    try { v.source.stop(at() + duration); } catch {}
    v.end = Math.min(v.end, at() + duration);
    if (!duration) cleanup(v);
  }
  function purge() { for (const v of voices) if (v.end <= at()) cleanup(v); }
  function room(priority) {
    purge(); const limit = Math.min(3, mix?.master?.max_simultaneous_events ?? 3);
    if (voices.size < limit) return true;
    // Contact cues take precedence over an optional gust or a scrape. Never let
    // a fourth event accumulate, even while older sources fade out.
    const expendable = [...voices].find(v => v.priority < priority);
    if (!expendable) return false;
    stop(expendable, 0); return true;
  }
  function filters(source, config, gain) {
    const nodes = [source]; let tail = source;
    if (config && context.createBiquadFilter) for (const [type, hz] of [['highpass', config.highpass_hz], ['lowpass', config.lowpass_hz]]) {
      if (!hz) continue;
      const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = hz;
      if (filter.Q) filter.Q.value = config.q ?? .7071;
      tail.connect(filter); tail = filter; nodes.push(filter);
    }
    tail.connect(gain); gain.connect(master); nodes.push(gain); return nodes;
  }
  function sample(id, {isBed = false, scale = 1, priority = 1, fade = .04} = {}) {
    const spec = mix?.assets?.[id], buffer = buffers.get(id);
    if (!audible() || !spec || !buffer) return null;
    purge();
    if (!isBed && [...voices].filter(v => v.id === id).length >= (spec.max_voices ?? 1)) return null;
    if (id === 'ski/wind' && [...voices].some(v => v.id === 'ski/slalom-gate')) return null;
    if (id === 'ski/slalom-gate') stop(wind, 0);
    if (!isBed && !room(priority)) return null;
    // Loop only the delivered seamless ambience, using the full decoded buffer.
    const source = context.createBufferSource(), gain = context.createGain(); source.buffer = buffer;
    source.loop = isBed && spec.loop === true;
    const v = {id, source, gain, nodes: [], priority, end: source.loop ? Infinity : at() + buffer.duration, cleaned: false, stopping: false};
    try {
      gain.gain.value = 0; v.nodes = filters(source, spec.filters, gain);
      if (!isBed) voices.add(v);
      source.onended = () => cleanup(v); source.start(at());
      target(gain.gain, (spec.recommended_gain_linear ?? linear(spec.recommended_gain_db)) * scale, fade);
      if (!source.loop) source.stop(v.end);
      return v;
    } catch { cleanup(v); return null; }
  }
  function tone(name) {
    const spec = TONES[name]; if (!spec || !audible() || !room(3) || !context.createOscillator) return false;
    const [from, to, seconds] = spec, source = context.createOscillator(), gain = context.createGain();
    const v = {id: name, source, gain, nodes: [source, gain], priority: 3, end: at() + seconds + .02, cleaned: false};
    try {
      source.type = 'triangle'; source.frequency.setValueAtTime(from, at()); source.frequency.exponentialRampToValueAtTime(to, at() + seconds);
      gain.gain.setValueAtTime(.0001, at()); gain.gain.exponentialRampToValueAtTime(.09, at() + .01); gain.gain.exponentialRampToValueAtTime(.0001, at() + seconds);
      source.connect(gain); gain.connect(master); voices.add(v); source.onended = () => cleanup(v); source.start(at()); source.stop(v.end); return true;
    } catch { cleanup(v); return false; }
  }
  function prepare() {
    if (preparation) return preparation;
    preparation = (async () => {
      // A file URL occurs only in headless Node tests. It is intentionally not a
      // network request; injected HTTP fetchers can still exercise preparation.
      if (disposed || !fetcher || !/^https?:$/.test(root.protocol)) return false;
      try {
        const response = await fetcher(new URL('mix.json', root), {signal: abort.signal});
        if (!response.ok) throw new Error('mix'); mix = await response.json();
        const ids = Object.keys(mix.assets).filter(id => id.startsWith('ski/') || id.startsWith('scenes/'));
        await Promise.all(ids.map(async id => {
          try { const r = await fetcher(new URL(mix.assets[id].file, root), {signal: abort.signal}); if (!r.ok) throw new Error(id); const data = await r.arrayBuffer(); if (!disposed) encoded.set(id, data); }
          catch { if (!disposed) errors.add(id); }
        }));
        if (disposed) return false; preloaded = true;
        if (OfflineAudioContext) { try { offline = new OfflineAudioContext(1, 1, 48000); } catch {} }
        await decode(offline || context); return !disposed;
      } catch { if (!disposed) errors.add('mix'); return false; }
    })(); return preparation;
  }
  function decode(decoder) {
    if (!decoder?.decodeAudioData || disposed) return Promise.resolve(false);
    if (decoding) return decoding;
    decoding = Promise.all([...encoded].map(async ([id, data]) => {
      if (buffers.has(id)) return;
      try { const buffer = await decoder.decodeAudioData(data.slice(0)); if (!disposed) { buffers.set(id, buffer); encoded.delete(id); } }
      catch { if (!disposed) errors.add(id); }
    })).then(() => { decoded = !disposed && buffers.size > 0; return decoded; }).finally(() => { decoding = null; });
    return decoding;
  }
  function unlock() {
    if (disposed || !AudioContext) return;
    readMute();
    try {
      if (!context) {
        context = new AudioContext(); master = context.createGain(); master.gain.value = 0;
        if (context.createDynamicsCompressor) {
          limiter = context.createDynamicsCompressor();
          for (const [key, value] of Object.entries({threshold: mix?.master?.suggested_limiter_ceiling_dbtp ?? -1, knee: 0, ratio: 20, attack: .003, release: .12})) if (limiter[key]) limiter[key].value = value;
          master.connect(limiter); limiter.connect(context.destination);
        } else master.connect(context.destination);
      }
      if (!paused && context.state === 'suspended') void context.resume?.()?.catch?.(() => {});
      target(master.gain, masterLevel());
      void prepare().then(() => decoded ? true : decode(context));
    } catch { errors.add('context'); }
  }
  function duck(layerId) {
    const layer = mix?.layers?.[layerId]; if (!layer?.duck_bed_db) return;
    duckDb = at() < duckUntil ? Math.min(duckDb, layer.duck_bed_db) : layer.duck_bed_db;
    duckUntil = Math.max(duckUntil, at() + layer.duck_hold_ms / 1000);
  }
  function cue(name) {
    readMute(); if (!audible()) { if (master) target(master.gain, masterLevel()); return false; }
    const id = SAMPLE_CUES[name], spec = mix?.assets?.[id], cooldown = Math.max(.06, (spec?.cooldown_ms ?? 100) / 1000);
    if (at() - (lastCue.get(name) ?? -1) < cooldown) return false;
    // One source in each exclusive sample group (a gust can be triggered by boost
    // and by the wind scheduler during the same frame).
    if (id === 'ski/wind' && wind && !wind.stopping) return false;
    const voice = id ? sample(id, {priority: name === 'boost' ? 1 : 3}) : null;
    const played = !!voice || ((!id || !buffers.has(id)) && tone(name)); if (!played) return false;
    lastCue.set(name, at()); if (voice?.id === 'ski/wind') wind = voice;
    if (LAYERS[name]) duck(LAYERS[name]);
    if (name === 'takeoff' || name === 'hit' || name === 'crash') { stop(scrape, .1); scrapeMutedUntil = at() + (name === 'takeoff' ? .12 : .9); }
    if (name === 'land') scrapeMutedUntil = 0;
    return true;
  }
  function sync(speedKmh = 0, {boosting = false, carving = 0, airborne = false, crashed = false} = {}) {
    readMute(); lastSpeed = clamp(speedKmh, 0, 130); lastCarving = clamp(carving, 0, 1); lastAirborne = !!airborne; lastBoosting = !!boosting;
    if (!context) return; purge(); target(master.gain, masterLevel(), .04);
    if (!audible()) return;
    const speed = lastSpeed / 130;
    if (!bed && decoded && lastSpeed > 0) bed = sample(mix?.layers?.ski_play?.bed || 'ski/ambience-loop', {isBed: true});
    if (bed) {
      const amount = lastSpeed > 0 ? (.45 + speed * .55) * (at() < duckUntil ? linear(duckDb) : 1) : 0;
      target(bed.gain.gain, (mix.assets[bed.id].recommended_gain_linear ?? linear(-18)) * amount, (at() < duckUntil ? mix.master.duck_attack_ms : mix.master.duck_release_ms) / 1000);
    }
    const scraping = lastSpeed > 5 && !lastAirborne && !crashed && at() >= scrapeMutedUntil;
    const wanted = lastSpeed < 45 ? 'ski/scrape-slow' : lastSpeed < 80 ? 'ski/scrape-medium' : 'ski/scrape-fast';
    if (!scraping) stop(scrape, .1);
    else if (!scrape || scrape.id !== wanted || scrape.stopping) {
      const previous = scrape, crossfade = (mix?.layers?.ski_play?.crossfade_ms ?? 100) / 1000;
      if (previous && !previous.stopping) stop(previous, crossfade);
      scrape = sample(wanted, {priority: 2, scale: (.25 + speed * .5 + lastCarving * .25), fade: crossfade}) || previous;
    } else target(scrape.gain.gain, mix.assets[wanted].recommended_gain_linear * (.25 + speed * .5 + lastCarving * .25), .1);
    if (lastSpeed > 20 && !wind && at() >= nextWind) {
      wind = sample('ski/wind', {priority: 1, scale: speed * (lastBoosting ? 1 : .7)});
      if (wind) nextWind = wind.end + .35;
    }
    if (lastSpeed < 5) stop(wind);
  }
  const ready = prepare();
  return {
    unlock, sync, cue, prepare, ready,
    setPaused(value) {
      paused = !!value; readMute(); if (!context) return; target(master.gain, masterLevel(), .04);
      try { if (paused && context.state === 'running') void context.suspend()?.catch?.(() => {}); else if (!paused && context.state === 'suspended') void context.resume()?.catch?.(() => {}); } catch {}
    },
    metrics() { purge(); return {unlocked: !!context, paused, muted, disposed, state: context?.state || 'none', mode: decoded ? 'samples' : 'procedural', preloaded, decoded, samples: buffers.size, activeEvents: voices.size, beds: bed ? 1 : 0, scrape: scrape?.id || null, wind: !!wind, errors: [...errors]}; },
    dispose() {
      if (disposed) return; disposed = true; abort.abort();
      for (const v of [...voices, ...(bed ? [bed] : [])]) { try { v.source.stop(); } catch {} cleanup(v); }
      encoded.clear(); buffers.clear(); for (const node of [master, limiter]) { try { node?.disconnect(); } catch {} }
      try { void context?.close()?.catch?.(() => {}); } catch {}
      offline = null;
    },
  };
}

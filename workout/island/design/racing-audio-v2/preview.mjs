// Original CC0-1.0. Standalone audition code; no game imports or external requests.
export const engineIds = ['engine-idle', 'engine-low', 'engine-mid', 'engine-high', 'engine-redline'];
export const rpms = [4000, 6000, 9000, 12000, 15000];
export function engineWeights(rpm) {
  const w = [0, 0, 0, 0, 0];
  if (rpm <= rpms[0]) w[0] = 1;
  else if (rpm >= rpms[4]) w[4] = 1;
  else {
    const i = rpms.findIndex((v, n) => rpm >= v && rpm < rpms[n + 1]);
    const f = (rpm - rpms[i]) / (rpms[i + 1] - rpms[i]);
    w[i] = Math.cos(f * Math.PI / 2);
    w[i + 1] = Math.sin(f * Math.PI / 2);
  }
  return w;
}
export function smooth(param, value, at, seconds = .045) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at);
  else { const held = param.value; param.cancelScheduledValues(at); param.setValueAtTime(held, at); }
  param.setTargetAtTime(value, at, seconds);
}
export function loopSource(ctx, buffer, asset, destination) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = asset.loop.startSeconds;
  src.loopEnd = asset.loop.endSeconds;
  src.connect(destination);
  return src;
}

const $ = id => document.getElementById(id);
const labels = {
  'engine-idle': 'סרק', 'engine-low': 'סל״ד נמוך', 'engine-mid': 'סל״ד בינוני',
  'engine-high': 'סל״ד גבוה', 'engine-redline': 'קו אדום', 'shift-up': 'העלאת הילוך',
  'shift-down': 'הורדת הילוך', 'turbo-blowoff': 'פריקת טורבו', 'startup': 'התנעה',
  'exhaust-pop-1': 'פליטה · קצרה', 'exhaust-pop-2': 'פליטה · כפולה',
  'exhaust-pop-3': 'פליטה · עמוקה', 'tyre-squeal': 'חריקת צמיגים',
  'kerb-rumble': 'נגיעה בקרב', 'wind-speed': 'רוח במהירות', 'pass-whoosh': 'עקיפה'
};
let manifest, ctx, master, engineBus, buffers = new Map(), voices = new Map();
let running = false, loading = false, gear = 1, played = [], activeShots = new Set();
let audioLoading = null;
let tyre = false, wind = false;
const status = text => { $('status').textContent = text; };
const byId = id => manifest.assets.find(a => a.id === id);

async function initializeAudio() {
  if (ctx) return;
  const pending = new AudioContext({ sampleRate: 44100 });
  await pending.resume();
  const format = $('format').value;
  const loaded = new Map();
  try {
    await Promise.all(manifest.assets.map(async a => {
      const response = await fetch(a.files[format].path);
      if (!response.ok) throw Error(`${a.id}: ${response.status}`);
      const buffer = await pending.decodeAudioData(await response.arrayBuffer());
      loaded.set(a.id, buffer);
    }));
    ctx = pending; buffers = loaded;
    master = ctx.createGain(); master.gain.value = Number($('volume').value);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 12;
    limiter.attack.value = .003; limiter.release.value = .12;
    master.connect(limiter).connect(ctx.destination);
    engineBus = ctx.createGain(); engineBus.connect(master);
    $('format').disabled = true;
  } catch (error) { await pending.close(); throw error; }
}

function load() {
  if (ctx) return Promise.resolve();
  if (!audioLoading) audioLoading = initializeAudio().finally(() => { audioLoading = null; });
  return audioLoading;
}

function rpmUpdate() {
  const rpm = Number($('rpm').value);
  $('rpmValue').textContent = rpm.toLocaleString('he-IL');
  const weights = engineWeights(rpm);
  engineIds.forEach((id, i) => {
    $(`level-${i}`).style.setProperty('--fill', `${weights[i] * 100}%`);
    if (voices.has(id)) {
      smooth(voices.get(id).gain.gain, weights[i], ctx.currentTime);
      smooth(voices.get(id).src.playbackRate, Math.max(.8, Math.min(1.25, rpm / rpms[i])), ctx.currentTime);
    }
  });
}

function ambienceUpdate() {
  $('speedValue').textContent = $('speed').value;
  $('tyre').setAttribute('aria-pressed', String(tyre));
  $('wind').setAttribute('aria-pressed', String(wind));
  if (!ctx) return;
  for (const [id, value] of [['tyre-squeal', tyre ? .34 : 0],
    ['wind-speed', wind ? .38 * (Number($('speed').value) / 320) ** 1.6 : 0]]) {
    if (voices.has(id)) smooth(voices.get(id).gain.gain, value, ctx.currentTime);
  }
}

async function start() {
  if (loading || running) return;
  loading = true; $('start').disabled = true;
  try {
    status('טוען צלילים…'); await load(); await ctx.resume();
    running = true;
    for (const a of manifest.assets.filter(a => a.loop)) {
      const gain = ctx.createGain(); gain.gain.value = 0;
      gain.connect(a.kind === 'engine' ? engineBus : master);
      const src = loopSource(ctx, buffers.get(a.id), a, gain);
      src.onended = () => { src.disconnect(); gain.disconnect(); };
      src.start(ctx.currentTime + .02, a.loop.startSeconds);
      voices.set(a.id, { src, gain });
    }
    rpmUpdate(); ambienceUpdate();
    $('stop').disabled = false; status('מנגן · אפשר לשנות סל״ד והילוך');
  } catch (e) { status(`לא ניתן לנגן: ${e.message}`); }
  finally { loading = false; $('start').disabled = running; }
}

function stop() {
  if (!ctx) return;
  for (const { src, gain } of voices.values()) {
    smooth(gain.gain, 0, ctx.currentTime, .012);
    src.stop(ctx.currentTime + .15);
  }
  voices.clear();
  for (const src of activeShots) src.stop();
  activeShots.clear();
  running = false; $('start').disabled = false; $('stop').disabled = true;
  status('עצור');
}

async function shot(id) {
  try {
    await load(); await ctx.resume();
    // Bound the audition mixer even when buttons are pressed repeatedly.
    if (activeShots.size >= 4) return;
    const a = byId(id), src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buffers.get(id); gain.gain.value = .7;
    src.connect(gain).connect(master);
    activeShots.add(src); played.push(id);
    src.onended = () => { activeShots.delete(src); src.disconnect(); gain.disconnect(); };
    if (a.loop) src.start(0, a.loop.startSeconds, a.loop.lengthSeconds);
    else src.start();
    $('stop').disabled = false;
    status(`האזנה: ${labels[id]}`);
  } catch (e) { status(`לא ניתן לנגן: ${e.message}`); }
}

function changeGear(next) {
  next = Math.max(1, Math.min(7, next));
  if (gear === next) return;
  const up = next > gear;
  const ratios = [0, 3.1, 2.35, 1.85, 1.5, 1.25, 1.07, .93];
  const rpm = Number($('rpm').value) * ratios[next] / ratios[gear];
  gear = next; $('gear').value = gear; $('gearValue').textContent = gear;
  $('rpm').value = Math.max(4000, Math.min(15000, Math.round(rpm / 50) * 50));
  rpmUpdate();
  if (running) {
    shot(up ? 'shift-up' : 'shift-down');
    const at = ctx.currentTime;
    const p = engineBus.gain;
    p.cancelAndHoldAtTime(at); p.linearRampToValueAtTime(up ? .12 : .38, at + .008);
    p.setValueAtTime(up ? .12 : .38, at + .053); p.linearRampToValueAtTime(1, at + .15);
  }
}

async function init() {
  try {
    const response = await fetch('manifest.json');
    if (!response.ok) throw Error(response.status);
    manifest = await response.json();
    $('start').disabled = false;
    $('assets').replaceChildren(...manifest.assets.map(a => {
      const card = document.createElement('article');
      const name = document.createElement('h3'); name.textContent = labels[a.id];
      const detail = document.createElement('p');
      detail.textContent = `${a.loop ? 'לולאה · 3 שניות' : `${a.durationSeconds} שניות`}${a.rpm ? ` · ${a.rpm.toLocaleString('he-IL')} סל״ד` : ''}`;
      const button = document.createElement('button');
      button.textContent = 'השמעה'; button.dataset.asset = a.id;
      button.onclick = () => shot(a.id);
      const links = document.createElement('span'); links.className = 'formats';
      for (const [ext, f] of Object.entries(a.files)) {
        const link = document.createElement('a'); link.href = f.path; link.download = f.path; link.textContent = ext.toUpperCase();
        links.append(link);
      }
      card.append(name, detail, button, links); return card;
    }));
    status('מוכן להאזנה');
  } catch (e) { status(`שגיאה בטעינת החבילה: ${e.message}. יש לפתוח דרך שרת מקומי.`); }
}
$('start').onclick = start; $('stop').onclick = stop;
$('rpm').oninput = rpmUpdate;
$('gear').oninput = () => changeGear(Number($('gear').value));
$('up').onclick = () => changeGear(gear + 1); $('down').onclick = () => changeGear(gear - 1);
$('volume').oninput = () => { if (ctx) smooth(master.gain, Number($('volume').value), ctx.currentTime); };
$('speed').oninput = ambienceUpdate;
$('tyre').onclick = () => { tyre = !tyre; ambienceUpdate(); };
$('wind').onclick = () => { wind = !wind; ambienceUpdate(); };
$('resetFormat').onclick = async () => {
  stop(); if (ctx) await ctx.close(); ctx = null; buffers.clear();
  $('format').disabled = false; status('אפשר לבחור פורמט ולהפעיל שוב');
};
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.audioPreview = { start, stop, shot, changeGear, get context() { return ctx; },
  snapshot: () => ({ running, gear, rpm: Number($('rpm').value), loaded: buffers.size,
    format: $('format').value, loops: voices.size, played: [...played],
    weights: engineWeights(Number($('rpm').value)), state: ctx?.state }) };
rpmUpdate(); init();

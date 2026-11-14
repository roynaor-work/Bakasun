// Original asset review rig. No game modules, balance changes, CDN or dependencies.
const $ = id => document.getElementById(id);
const c = $('scene').getContext('2d');
const ac = $('atlas').getContext('2d');
const TAU = Math.PI * 2;
const fixed = new URLSearchParams(location.search).has('step');
let manifest, sheets = {}, resolution = '512', ready = false;
let time = 0, lastTime = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let auto = true, held = false, gallery = false, size = 1, cycle = 0;
let heat = 0, lock = 0, rest = 0, nextTick = 0, normalTick = 0, firing = false;
let shots = [], impacts = [], vents = [], emitted = 0, locks = 0, stateHistory = new Set(['cold']);
let pageSuspended = false, currentState = '';

class Sound {
  context = null; master = null; buffers = {}; voices = new Set();
  enabled = false; running = false; loading = null; soloUntil = 0; codecs = {};
  async unlock() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = +$('volume').value / 100;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    if (!this.loading) this.loading = this.load().catch(error => { this.loading = null; throw error; });
    await this.loading;
  }
  async load() {
    await Promise.all(Object.entries(manifest.audio).map(async ([name, cue]) => {
      let last;
      for (const codec of ['ogg', 'mp3']) {
        try {
          const response = await fetch(cue.sources[codec]);
          if (!response.ok) throw Error(response.status);
          this.buffers[name] = await this.context.decodeAudioData(await response.arrayBuffer());
          this.codecs[name] = codec;
          return;
        } catch (error) { last = error; }
      }
      throw Error(`לא ניתן לטעון את הצליל ${name}: ${last.message}`);
    }));
  }
  voice(name, when = this.context.currentTime, loop = false, gain = 1) {
    const source = this.context.createBufferSource(), amp = this.context.createGain();
    source.buffer = this.buffers[name];
    source.loop = loop;
    if (loop) { source.loopStart = 0; source.loopEnd = source.buffer.duration; }
    const target = gain * manifest.audio[name].gain;
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(target, when + (loop ? .04 : .008));
    source.connect(amp); amp.connect(this.master);
    const voice = { source, amp, target, when, stopped: false };
    this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); source.disconnect(); amp.disconnect(); };
    source.start(when);
    return voice;
  }
  fade(voice, seconds = .04) {
    if (!voice || voice.stopped) return;
    voice.stopped = true;
    const now = this.context.currentTime;
    // cancelAndHold prevents a jump if release arrives during a ramp or before loop start.
    if (voice.amp.gain.cancelAndHoldAtTime) voice.amp.gain.cancelAndHoldAtTime(now);
    else {
      voice.amp.gain.cancelScheduledValues(now);
      voice.amp.gain.setValueAtTime(now < voice.when ? 0 : voice.amp.gain.value, now);
    }
    voice.amp.gain.linearRampToValueAtTime(0, now + seconds);
    voice.source.stop(now + seconds + .002);
  }
  start() {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.running) return;
    this.running = true;
    const now = this.context.currentTime;
    this.up = this.voice('spin-up', now);
    this.loop = this.voice('fire-loop', now + .36, true);
  }
  stop(withTail = true) {
    if (!this.running) return;
    this.running = false;
    this.fade(this.up); this.fade(this.loop);
    this.up = this.loop = null;
    if (withTail && this.enabled) this.voice('spin-down');
  }
  thermalLock() {
    if (!this.enabled || !this.context || this.context.currentTime < this.soloUntil) return;
    this.stop(false);
    this.voice('overheat');
    this.voice('cooldown', this.context.currentTime + .12);
  }
  sync(want) {
    if (!this.enabled || !this.context || this.context.currentTime < this.soloUntil) return;
    if (want) this.start(); else this.stop();
  }
  allStop() {
    this.running = false; this.up = this.loop = null; this.soloUntil = 0;
    for (const voice of this.voices) this.fade(voice);
  }
  async audition(name) {
    await this.unlock();
    this.allStop();
    const now = this.context.currentTime;
    const seconds = name === 'fire-loop' ? 4.5 : this.buffers[name].duration;
    this.soloUntil = now + seconds + .12;
    const voice = this.voice(name, now, name === 'fire-loop');
    if (name === 'fire-loop') {
      voice.amp.gain.setValueAtTime(voice.target, now + seconds - .04);
      voice.amp.gain.linearRampToValueAtTime(0, now + seconds);
      voice.source.stop(now + seconds + .002);
    }
  }
}
const sound = new Sound();

function fail(error) { $('error').hidden = false; $('error').textContent = error.message; }
function atlasFrame(ctx, name, frame, x, y, w, h = w, rotation = 0, opacity = 1) {
  const atlas = manifest.atlases[name];
  const variant = atlas.variants[resolution];
  const [sx, sy, sw, sh] = variant.frames[frame].rect;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = atlas.blend;
  ctx.drawImage(sheets[variant.path], sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function getState() { return lock > 0 ? 'locked' : heat + 1e-9 >= .8 ? 'near-lock' : heat + 1e-9 >= .5 ? 'hot' : 'cold'; }
function stateUI() {
  const state = getState();
  const text = { cold: 'קר · מוכן לירי', hot: 'חם · החום עולה', 'near-lock': 'כמעט נעול · שחררו לקירור', locked: 'נעול · מתקרר' };
  const colors = { cold: '#9ddfc9', hot: '#ffc153', 'near-lock': '#ff8a38', locked: '#ff6650' };
  if (state !== currentState) {
    currentState = state; stateHistory.add(state);
    $('state').textContent = text[state];
    document.querySelector('.heat-status').style.color = colors[state];
  }
  $('percent').textContent = `${Math.round(heat * 100)}%`;
}

function update(dt) {
  time += dt; cycle = (cycle + dt) % 4.4;
  const want = held || (auto && cycle < 1.3);
  const wasLocked = lock > 0;
  if (wasLocked) { lock = Math.max(0, lock - dt); heat = lock / 2; rest = 0; }
  else if (!want) { rest += dt; if (rest > .5) heat = Math.max(0, heat - dt / 2); }
  else rest = 0;
  firing = want && lock <= 0 && !wasLocked;
  if (firing && time >= nextTick) {
    nextTick = time + .1;
    for (let i = 0; i < 3; i++) {
      shots.push({ x: 518 + i * 5, y: 133 + (i - 1) * 5, age: 0, lane: i, size });
    }
    emitted++; heat = Math.min(1, heat + 1 / 12);
    if (heat >= 1 - 1e-8) {
      heat = 1; lock = 2; firing = false; locks++;
      vents.push({ age: 0 }); sound.thermalLock();
    }
  }
  if (!firing) nextTick = Math.min(nextTick, time);
  if (time >= normalTick) {
    normalTick = time + 1 / 5.6;
    shots.push({ x: 109, y: 133, age: 0, normal: true });
  }
  for (const shot of shots) {
    shot.age += dt; shot.x += dt * (shot.normal ? 450 : 520);
    if (!shot.normal) shot.y += (shot.lane - 1) * dt * 18;
    const targetX = shot.normal ? 344 : 762;
    if (shot.x >= targetX && !shot.hit) {
      shot.hit = true;
      if (!shot.normal && shot.lane === 1) impacts.push({ age: 0, x: targetX, y: shot.y, variant: emitted % 4 });
    }
  }
  shots = shots.filter(s => !s.hit);
  impacts.forEach(i => i.age += dt); impacts = impacts.filter(i => i.age < .18);
  vents.forEach(v => v.age += dt); vents = vents.filter(v => v.age < .5);
  stateUI(); sound.sync(firing);
}

function circle(ctx, x, y, r, color, width = 1) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function emitter(x, y, heavy) {
  const recoil = heavy && firing ? Math.sin(time * 190) * 1.6 : 0;
  c.save(); c.translate(x - Math.abs(recoil), y);
  const g = c.createRadialGradient(-8, -10, 1, 0, 0, 32);
  g.addColorStop(0, '#82939c'); g.addColorStop(.32, '#3a4d58'); g.addColorStop(.75, '#182b38'); g.addColorStop(1, '#0b131c');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, heavy ? 29 : 21, 0, TAU); c.fill();
  circle(c, 0, 0, heavy ? 28 : 20, '#617683', 1.5);
  circle(c, 0, 0, heavy ? 22 : 15, '#0a1117', 3);
  const phase = heavy ? time * (firing ? 14 : 1.1) : 0;
  for (let i = 0; i < (heavy ? 6 : 1); i++) {
    const a = i * TAU / 6 + phase, r = heavy ? 13 : 0;
    const bx = Math.cos(a) * r, by = Math.sin(a) * r;
    c.fillStyle = '#0a1119'; c.beginPath(); c.arc(bx, by, 4.4, 0, TAU); c.fill();
    circle(c, bx, by, 4.6, heavy && firing ? '#c18d3d' : '#556570', 1.1);
  }
  c.fillStyle = heavy ? '#d49839' : '#6a99b3'; c.fillRect(-3, -2, 6, 4);
  c.restore();
}

function target(x, y, heavy) {
  const hit = heavy && impacts.length;
  c.save(); c.translate(x, y);
  c.fillStyle = hit ? '#3d3020' : '#101e2c';
  c.strokeStyle = hit ? '#ffbd60' : '#385263'; c.lineWidth = 1.2;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    const px = Math.cos(a) * 29, py = Math.sin(a) * 29;
    if (!i) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath(); c.fill(); c.stroke();
  circle(c, 0, 0, 18, hit ? '#8f6939' : '#2d475b');
  circle(c, 0, 0, 6, hit ? '#e9c283' : '#56859c');
  c.strokeStyle = '#3a5665'; c.beginPath(); c.moveTo(-39, 0); c.lineTo(-31, 0); c.moveTo(31, 0); c.lineTo(39, 0); c.moveTo(0, -39); c.lineTo(0, -31); c.moveTo(0, 31); c.lineTo(0, 39); c.stroke();
  c.restore();
}

function render() {
  c.clearRect(0, 0, 844, 250);
  const bg = c.createLinearGradient(0, 0, 844, 0);
  bg.addColorStop(0, '#0a1723'); bg.addColorStop(.49, '#09121d'); bg.addColorStop(.5, '#151a1d'); bg.addColorStop(1, '#101720');
  c.fillStyle = bg; c.fillRect(0, 0, 844, 250);
  c.strokeStyle = '#24354340'; c.lineWidth = .5;
  for (let x = 0; x < 844; x += 26) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 250); c.stroke(); }
  for (let y = 3; y < 250; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(844, y); c.stroke(); }
  for (let i = 0; i < 65; i++) {
    const x = (i * 173.73 + 13) % 844, y = (i * 79.11 + 17) % 250;
    c.fillStyle = `rgba(175,205,222,${.09 + (i % 4) * .045})`; c.fillRect(x, y, 1, 1);
  }
  c.fillStyle = '#3b4954'; c.fillRect(421, 14, 1, 222);
  c.fillStyle = '#1e394c'; c.fillRect(113, 132, 196, .5);
  c.fillStyle = '#5b4528'; c.fillRect(528, 132, 195, .5);
  target(344, 133, false); target(762, 133, true);
  emitter(81, 133, false); emitter(489, 133, true);
  atlasFrame(c, 'heat', ['cold','hot','near-lock','locked'].indexOf(getState()), 489, 133, 112);
  if (firing) atlasFrame(c, 'muzzle', Math.floor(time * 25) % 8, 520, 133, 65, 65, Math.PI / 2);
  for (const shot of shots) {
    if (shot.normal) {
      c.fillStyle = '#85cce8'; c.fillRect(shot.x - 8, shot.y - 1, 16, 2);
      c.fillStyle = '#d5f2ff'; c.fillRect(shot.x + 4, shot.y - 1, 3, 2);
    } else {
      const drawSize = [44, 53, 62][shot.size];
      // Square frames contain elongated cores. Preserve their intrinsic aspect ratio.
      atlasFrame(c, 'plasma', shot.size, shot.x, shot.y, drawSize, drawSize, Math.PI / 2);
    }
  }
  for (const v of vents) atlasFrame(c, 'steam', Math.min(5, Math.floor(v.age * 12)), 489, 133, 128, 128, Math.PI / 2);
  for (const i of impacts) atlasFrame(c, 'impact', i.variant * 4 + Math.min(3, Math.floor(i.age / .045)), i.x, i.y, 102);
  c.textAlign = 'left'; c.font = '9px monospace'; c.fillStyle = '#537184';
  c.fillText('SINGLE CORE / STEADY', 24, 231);
  c.fillStyle = '#947245'; c.fillText('6 BARRELS / 3 PLASMA CORES', 444, 208);
  if (gallery) drawGallery();
}

function drawGallery() {
  ac.fillStyle = '#09131e'; ac.fillRect(0, 0, 844, 250);
  const groups = [['plasma',3,0],['muzzle',8,1],['heat',4,2],['steam',6,3],['impact',16,4]];
  ac.textAlign = 'left';
  for (const [name, count, row] of groups) {
    const y = row * 49 + 25;
    ac.font = '10px monospace'; ac.fillStyle = '#c6ab7d'; ac.fillText(name.toUpperCase(), 16, y + 3);
    for (let i = 0; i < count; i++) {
      const x = 118 + i * 44;
      ac.fillStyle = '#142330'; ac.fillRect(x - 21, y - 21, 42, 42);
      atlasFrame(ac, name, i, x, y, 43);
    }
  }
}

function setAuto(value) {
  auto = value; cycle = 0; $('demo').setAttribute('aria-pressed', String(auto));
}
function setHeld(value) {
  if (paused || pageSuspended || !ready) value = false;
  held = value; $('trigger').classList.toggle('active', held);
  if (value) setAuto(false);
  if (!value) { firing = false; sound.stop(); }
}
function setPaused(value) {
  paused = value; setHeld(false); firing = false;
  $('pause').setAttribute('aria-pressed', String(paused)); $('pause').textContent = paused ? 'המשך' : 'השהיה';
  if (paused) sound.allStop();
}
function release() { setHeld(false); }
$('trigger').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); $('trigger').setPointerCapture(e.pointerId); setHeld(true);
});
$('trigger').addEventListener('pointerup', release);
$('trigger').addEventListener('pointercancel', release);
$('trigger').addEventListener('lostpointercapture', release);
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || ['INPUT','SELECT','BUTTON','A'].includes(document.activeElement.tagName)) return;
  e.preventDefault(); if (!e.repeat) setHeld(true);
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); release(); } });
$('trigger').addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) setHeld(true); } });
$('trigger').addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); release(); } });
window.addEventListener('blur', release);
$('demo').onclick = () => { setHeld(false); setAuto(!auto); if (!auto) { firing = false; sound.stop(); } };
$('pause').onclick = () => setPaused(!paused);
$('gallery').onclick = () => { gallery = !gallery; $('atlas-view').hidden = !gallery; $('gallery').setAttribute('aria-pressed', String(gallery)); render(); };
$('size').onchange = () => { size = +$('size').value; };
$('resolution').onchange = () => { resolution = $('resolution').value; render(); };
$('volume').oninput = () => {
  if (sound.master) sound.master.gain.setTargetAtTime(+$('volume').value / 100, sound.context.currentTime, .015);
};
$('sound').onclick = async () => {
  $('sound').disabled = true;
  try {
    if (sound.enabled) { sound.enabled = false; sound.allStop(); }
    else { await sound.unlock(); sound.enabled = true; }
    $('sound').setAttribute('aria-pressed', String(sound.enabled));
    $('sound').textContent = sound.enabled ? 'סאונד פעיל' : 'סאונד כבוי';
  } catch (error) { fail(error); }
  finally { $('sound').disabled = false; }
};
$('audio-menu').onclick = () => {
  $('audio-panel').hidden = !$('audio-panel').hidden;
  $('audio-menu').setAttribute('aria-expanded', String(!$('audio-panel').hidden));
};
document.querySelectorAll('[data-cue]').forEach(button => { button.onclick = () => sound.audition(button.dataset.cue).catch(fail); });
$('stop-audio').onclick = () => sound.allStop();
function suspend() {
  pageSuspended = true; setHeld(false); firing = false; sound.allStop();
  if (sound.context) sound.context.suspend().catch(fail);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
  else { pageSuspended = false; lastTime = 0; if (sound.context && sound.enabled) sound.context.resume().catch(fail); }
});
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', () => { pageSuspended = false; lastTime = 0; });

function frame(stamp) {
  const dt = lastTime ? Math.min(.04, (stamp - lastTime) / 1000) : 0;
  lastTime = stamp;
  if (ready && !paused && !pageSuspended && !fixed) update(dt);
  if (ready) render();
  requestAnimationFrame(frame);
}

window.vulcanPreview = {
  get ready() { return ready; },
  step(seconds) {
    if (!ready || !fixed) throw Error('Open preview.html?step=1 for deterministic inspection');
    for (let left = seconds; left > 1e-8; left -= 1 / 120) if (!paused) update(Math.min(left, 1 / 120));
    render(); return this.snapshot();
  },
  snapshot() {
    return { ready, time, auto, held, paused, heat, lock, state: getState(), firing, emitted, locks,
      shots: shots.length, impacts: impacts.length, vents: vents.length, gallery, resolution, size,
      stateHistory: [...stateHistory], audioEnabled: sound.enabled, audioRunning: sound.running,
      audioState: sound.context?.state, audioVoices: sound.voices.size, codecs: sound.codecs,
      decoded: Object.fromEntries(Object.entries(sound.buffers).map(([name,b]) => [name,{ seconds:b.duration,samples:b.length,sampleRate:b.sampleRate }])) };
  }
};

async function init() {
  const response = await fetch('manifest.json');
  if (!response.ok) throw Error('לא ניתן לטעון manifest.json. יש לפתוח דרך שרת HTTP מקומי.');
  manifest = await response.json();
  await Promise.all(Object.values(manifest.atlases).flatMap(atlas => Object.values(atlas.variants)).map(async variant => {
    const img = new Image(); img.src = variant.path; await img.decode(); sheets[variant.path] = img;
  }));
  ready = true; $('load').textContent = '37 פריימים · 5 צלילים';
  for (const id of ['sound','trigger','demo','pause','gallery']) $(id).disabled = false;
  stateUI(); setPaused(paused); render(); requestAnimationFrame(frame);
}
init().catch(fail);

/* Original design preview. No game imports, storage, telemetry or network dependencies. */
(() => {
  'use strict';
  const manifest = window.ALIEN_SPACE_MANIFEST;
  const canvas = document.querySelector('#space');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id);
  const images = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  const state = { level: 1, paused: false, time: 0, pointer: [0, 0], layers: { far: true, mid: true, near: true }, effects: true, explosionFrame: 'auto', staticShootingStar: false, reducedMotion: motion.matches, ready: false };
  let lastTime = null;
  let level, theme;
  const baseX = (manifest.viewport.width - manifest.textureSize.width) / 2;
  const baseY = (manifest.viewport.height - manifest.textureSize.height) / 2;
  const frameDuration = manifest.effects.explosion.frameDurationsMs.reduce((a, b) => a + b, 0) / 1000;
  function loadTexture(texture) {
    if (images.has(texture.path)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { images.set(texture.path, image); resolve(); };
      image.onerror = () => reject(new Error('לא ניתן לטעון את ' + texture.path));
      image.src = texture.path;
    });
  }
  function updatePause() {
    $('pause').textContent = state.paused || state.reducedMotion ? 'הפעלה' : 'השהיה';
    $('pause').setAttribute('aria-pressed', String(state.paused || state.reducedMotion));
    $('pause').disabled = state.reducedMotion;
    $('motion-note').textContent = state.reducedMotion ? 'העדפת תנועה מופחתת פעילה: הרקע קפוא והאפקטים האוטומטיים כבויים.' : 'הזזת העכבר משנה את נקודת המבט. H להסתרת הממשק.';
  }
  function setLevel(value, updateUrl = true) {
    const number = Number(value);
    state.level = Math.max(1, Math.min(30, Number.isFinite(number) ? Math.trunc(number) : 1));
    level = manifest.levels[state.level - 1];
    theme = manifest.themes.find(t => t.id === level.theme);
    state.time = 0;
    state.pointer = [0, 0];
    document.documentElement.style.setProperty('--accent', theme.accent);
    $('theme-name').textContent = theme.name;
    $('stage-label').textContent = String(state.level).padStart(2, '0') + ' / 30';
    $('level').value = state.level;
    $('previous').disabled = state.level === 1;
    $('next').disabled = state.level === 30;
    $('budget').textContent = `${(theme.totalTextureBytes / 1000).toFixed(1)}KB / 800KB · כולל שני אטלסי האפקטים`;
    canvas.setAttribute('aria-label', `${theme.name}, שלב ${state.level}, שלוש שכבות פרלקסה`);
    document.querySelectorAll('.theme').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === theme.id)));
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('level', String(state.level));
      history.replaceState(null, '', url);
    }
    if (state.ready) draw();
  }
  function explosionFrameAt(age) {
    let end = 0;
    for (let i = 0; i < 4; i++) {
      end += manifest.effects.explosion.frameDurationsMs[i];
      if (age * 1000 < end) return i;
    }
    return 3;
  }
  function drawFrame(effect, index, x, y, width, height, opacity) {
    const image = images.get(effect.path), f = effect.frames[index];
    ctx.globalAlpha = opacity;
    ctx.drawImage(image, f.x, f.y, f.width, f.height, x - width * .5, y - height * .5, width, height);
  }
  function drawExplosion(time) {
    if (!state.effects) return;
    const effect = manifest.effects.explosion;
    const manual = state.explosionFrame !== 'auto';
    if (state.reducedMotion && !manual) return;
    const age = (time + level.explosionIntervalSeconds - 3) % level.explosionIntervalSeconds;
    if (!manual && age >= frameDuration) return;
    const cycle = Math.floor(Math.max(0, time - 3) / level.explosionIntervalSeconds);
    drawFrame(effect, manual ? Number(state.explosionFrame) : explosionFrameAt(age), 220 + cycle % 3 * 112, 98 + cycle % 2 * 42, ...effect.drawSize, effect.opacity);
  }
  function drawShootingStar(time) {
    if (!state.effects || (state.reducedMotion && !state.staticShootingStar)) return;
    const effect = manifest.effects['shooting-stars'];
    const age = state.staticShootingStar ? .95 : (time + level.shootingStarIntervalSeconds - 1.5) % level.shootingStarIntervalSeconds;
    if (age >= effect.lifetimeMs / 1000) return;
    const fade = state.staticShootingStar ? 1 : Math.min(1, age * 6, (effect.lifetimeMs / 1000 - age) * 4);
    drawFrame(effect, level.shootingStarVariant, -100 + age * effect.velocityPxPerSecond[0], 30 + age * effect.velocityPxPerSecond[1], ...effect.drawSize, effect.opacity * fade);
  }
  function drawLayer(layer, time) {
    if (!state.layers[layer.id]) return;
    const image = images.get(layer.path);
    const phase = time * level.driftSpeed + level.phaseSeconds;
    const cameraX = level.camera[0] + state.pointer[0];
    const cameraY = level.camera[1] + state.pointer[1];
    const dx = Math.sin(phase * 2 * Math.PI / (layer.driftPeriodSeconds || 1)) * layer.driftAmplitudePx;
    const x = baseX + cameraX * layer.maxCameraShiftPx + dx;
    const y = baseY + cameraY * manifest.camera.maxVerticalShiftPx * layer.depth;
    ctx.globalAlpha = layer.id === 'near' ? level.gasOpacity : layer.opacity;
    if (layer.repeat === 'x') {
      const offset = (time * layer.scrollPxPerSecond) % image.width;
      ctx.drawImage(image, x - offset, y);
      ctx.drawImage(image, x - offset + image.width, y);
    } else ctx.drawImage(image, x, y);
  }
  function draw() {
    if (!state.ready) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.backgroundColor;
    ctx.fillRect(0, 0, 844, 390);
    drawLayer(theme.layers[0], state.time);
    drawExplosion(state.time);
    drawLayer(theme.layers[1], state.time);
    drawLayer(theme.layers[2], state.time);
    drawShootingStar(state.time);
    ctx.globalAlpha = 1;
  }
  function loop(stamp) {
    const delta = lastTime === null ? 0 : Math.min((stamp - lastTime) / 1000, .05);
    lastTime = stamp;
    if (!state.paused && !state.reducedMotion && !document.hidden) { state.time += delta; draw(); }
    requestAnimationFrame(loop);
  }
  function setClean(clean) {
    document.body.classList.toggle('clean', clean);
    $('restore').hidden = !clean || params.get('clean') === '1';
    if ($('inspector').open) $('inspector').close();
  }
  manifest.themes.forEach(t => {
    const button = document.createElement('button');
    button.className = 'theme'; button.dataset.theme = t.id;
    button.style.setProperty('--swatch', t.accent);
    const swatch = document.createElement('span');
    swatch.className = 'swatch'; swatch.setAttribute('aria-hidden', 'true');
    button.append(swatch, document.createTextNode(t.name));
    button.addEventListener('click', () => setLevel(t.stages[0]));
    $('themes').append(button);
  });
  manifest.levels.forEach(l => {
    const option = document.createElement('option');
    option.value = l.level;
    option.textContent = `${String(l.level).padStart(2, '0')} · ${manifest.themes.find(t => t.id === l.theme).name}`;
    $('level').append(option);
  });
  $('tools').onclick = () => $('inspector').showModal();
  $('close').onclick = () => $('inspector').close();
  $('clean').onclick = () => setClean(true);
  $('restore').onclick = () => setClean(false);
  $('previous').onclick = () => setLevel(state.level - 1);
  $('next').onclick = () => setLevel(state.level + 1);
  $('level').onchange = e => setLevel(e.target.value);
  $('pause').onclick = () => { state.paused = !state.paused; updatePause(); draw(); };
  document.querySelectorAll('[data-layer]').forEach(input => input.onchange = () => { state.layers[input.dataset.layer] = input.checked; draw(); });
  $('effects').onchange = e => { state.effects = e.target.checked; draw(); };
  $('explosion-frame').onchange = e => { state.explosionFrame = e.target.value; draw(); };
  $('shooting-star').onclick = () => { state.staticShootingStar = !state.staticShootingStar; $('shooting-star').setAttribute('aria-pressed', String(state.staticShootingStar)); draw(); };
  canvas.onpointermove = e => {
    if (state.paused || state.reducedMotion) return;
    const r = canvas.getBoundingClientRect();
    state.pointer = [Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)), Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1))];
  };
  canvas.onpointerleave = () => { if (!state.paused && !state.reducedMotion) state.pointer = [0, 0]; };
  document.addEventListener('visibilitychange', () => { lastTime = null; });
  motion.addEventListener('change', e => { state.reducedMotion = e.matches; state.pointer = [0, 0]; updatePause(); draw(); });
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'h' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) setClean(!document.body.classList.contains('clean'));
  });
  setLevel(params.get('level') || 1, false);
  setClean(params.get('clean') === '1');
  updatePause();
  const ready = Promise.all([...manifest.themes.flatMap(t => t.layers), ...Object.values(manifest.effects)].map(loadTexture)).then(() => {
    state.ready = true;
    draw(); requestAnimationFrame(loop);
    return true;
  }).catch(error => { $('error').hidden = false; $('error').textContent = error.message; throw error; });
  // Deterministic inspection API, also usable by downstream asset reviewers.
  window.alienSpacePreview = { ready, manifest, state, setLevel, setClean,
    renderAt(seconds) { state.paused = true; state.time = Math.max(0, Number(seconds) || 0); updatePause(); draw(); },
    draw, explosionFrameAt };
})();

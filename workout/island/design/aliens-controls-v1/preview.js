/* Standalone design demo. All state below is local to this page, never game state. */
(() => {
  'use strict';
  const assets = window.ALIENS_ASSETS;
  const $ = selector => document.querySelector(selector);
  const buttons = [...document.querySelectorAll('[data-action]')];
  const stage = $('#stage');
  const canvas = $('#space');
  const ctx = canvas.getContext('2d');
  const held = new Map();
  const state = { heat: 36, locked: false, energy: 82, shield: 64, ammo: 3,
    bombCooldown: 0, offline: false, bright: false, lastFire: 0, elapsed: 0 };
  const effects = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, previous = 0, wakeUntil = 0;
  const clamp = n => Math.max(0, Math.min(100, n));
  const isHeld = id => [...held.values()].includes(id);
  const announce = text => { $('#feedback').textContent = text; };
  const unavailable = id => state.offline || (id === 'vulcan' && state.locked) ||
    (id === 'missile' && state.ammo === 0) || (id === 'bomb' && state.bombCooldown > 0);

  function vectorDigits(svg, value, color) {
    const group = svg.querySelector('[data-part=value-digits]');
    const text = String(Math.round(value));
    const start = 64 - (text.length * 15 - 4) / 2;
    group.replaceChildren();
    group.setAttribute('stroke', color);
    [...text].forEach((digit, i) => {
      for (const segment of assets.digits[digit]) {
        const [x1, y1, x2, y2] = assets.segments[segment];
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1 + start + i * 15} ${y1 + 88}l${x2 - x1} ${y2 - y1}`);
        group.append(path);
      }
    });
  }

  function paintAsset(host, id, mode, value) {
    if (host.dataset.state !== mode) {
      host.innerHTML = assets.svg[id][mode]; // Trusted, generated local artwork.
      host.dataset.state = mode;
      const svg = host.querySelector('svg');
      svg.removeAttribute('role');
      svg.removeAttribute('aria-labelledby');
      svg.setAttribute('aria-hidden', 'true');
      for (const element of svg.querySelectorAll('[id]')) {
        element.dataset.part = element.id;
        element.id = `demo-${id}-${element.id}`;
      }
    }
    if (value === undefined) return;
    const svg = host.querySelector('svg');
    const accent = assets.components.find(c => c.id === id).accent;
    const color = id === 'vulcan' ? state.locked || value >= 80 ? '#FFAE9E' : value >= 50 ? '#FFD28A' : '#A4F0CD' : accent;
    const ring = svg.querySelector('[data-part=value-ring]');
    ring.setAttribute('stroke-dasharray', `${clamp(value)} 100`);
    ring.setAttribute('stroke', color);
    vectorDigits(svg, value, color);
  }

  function render() {
    for (const button of buttons) {
      const id = button.dataset.action;
      const disabled = unavailable(id);
      if (disabled) {
        for (const [owner, action] of [...held]) if (action === id) release(owner);
      }
      button.disabled = disabled;
      button.dataset.held = String(isHeld(id));
      const mode = disabled ? 'disabled' : isHeld(id) ? 'pressed' : 'normal';
      paintAsset(button.querySelector('.control-art'), id, mode, id === 'vulcan' ? state.heat : undefined);
    }
    $('[data-action=vulcan]').setAttribute('aria-label', `וולקן, חימום ${Math.round(state.heat)} אחוז${state.locked ? ', מתקרר' : ''}${state.offline ? ', מושבת' : ''}`);
    $('[data-action=fire]').setAttribute('aria-label', `ירי רגיל${state.offline ? ', מושבת' : ''}`);
    $('[data-action=missile]').setAttribute('aria-label', `טיל, ${state.ammo} זמינים${state.offline ? ', מושבת' : ''}`);
    $('[data-action=bomb]').setAttribute('aria-label', state.offline ? 'פצצה, מושבתת' : state.bombCooldown > 0 ? `פצצה, טעינה בעוד ${Math.ceil(state.bombCooldown)} שניות` : 'פצצה, זמינה');
    $('#vulcan-label').textContent = state.locked ? 'קירור' : 'וולקן';
    $('#bomb-label').textContent = state.bombCooldown > 0 ? `טעינה ${Math.ceil(state.bombCooldown)}` : 'פצצה';
    $('#ammo').textContent = state.ammo;
    for (const id of ['energy', 'shield']) {
      const host = $(`[data-resource=${id}] .resource-art`);
      paintAsset(host, id, 'normal', state[id]);
      host.setAttribute('aria-valuenow', Math.round(state[id]));
      host.setAttribute('aria-valuetext', `${Math.round(state[id])} אחוז`);
    }
    for (const id of ['heat', 'energy', 'shield']) {
      $(`#${id}`).value = Math.round(state[id]);
      $(`#${id}-output`).value = `${Math.round(state[id])}%`;
    }
  }

  function effect(id) {
    if (!reduced.matches) effects.push({ id, start: state.elapsed });
    wake(1.2);
  }

  function press(owner, id) {
    if (held.has(owner) || unavailable(id) || isHeld(id)) return;
    held.set(owner, id);
    if (id === 'missile') { state.ammo--; effect(id); announce(`טיל שוגר בתצוגה · נותרו ${state.ammo}`); }
    if (id === 'bomb') { state.bombCooldown = 6; effect(id); announce('פצצה הופעלה בתצוגה · טעינה מחדש'); }
    if (id === 'fire' || id === 'vulcan') { effect(id); announce(id === 'fire' ? 'ירי רגיל' : 'וולקן פעיל'); }
    render();
    wake();
  }

  function release(owner) {
    held.delete(owner);
    if (typeof owner === 'number') {
      for (const button of buttons) if (button.hasPointerCapture(owner)) button.releasePointerCapture(owner);
    }
  }

  function cancelAll() {
    for (const owner of [...held.keys()]) release(owner);
    render();
  }

  for (const button of buttons) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || button.disabled) return;
      event.preventDefault();
      button.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId);
      press(event.pointerId, button.dataset.action);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, event => { release(event.pointerId); render(); wake(); });
    }
    // Assistive activation does not need to synthesize pointer events.
    button.addEventListener('click', event => {
      if (event.detail !== 0 || button.disabled) return;
      const owner = `assistive-${button.dataset.action}`;
      press(owner, button.dataset.action);
      release(owner);
      render();
    });
  }

  const keys = { Space: 'fire', KeyZ: 'vulcan', KeyM: 'missile', KeyB: 'bomb' };
  document.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    const isControl = event.target.matches('.control');
    if (event.target.closest('button,a') && !isControl) return;
    const action = isControl && (event.code === 'Space' || event.code === 'Enter') ? event.target.dataset.action : keys[event.code];
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) press(`key-${event.code}`, action);
  });
  document.addEventListener('keyup', event => {
    const owner = `key-${event.code}`;
    if (!held.has(owner)) return;
    event.preventDefault(); release(owner); render(); wake();
  });
  window.addEventListener('blur', cancelAll);
  document.addEventListener('visibilitychange', () => {
    cancelAll();
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    else wake();
  });
  window.addEventListener('resize', () => { cancelAll(); resize(); });

  for (const id of ['heat', 'energy', 'shield']) {
    $(`#${id}`).addEventListener('input', event => {
      const nextValue = clamp(Number(event.target.value));
      cancelAll();
      state[id] = nextValue;
      if (id === 'heat') state.locked = state.heat >= 100;
      render(); draw(); // Keep an unlocked manually chosen value stable until the next interaction.
      if (id === 'heat' && state.locked) wake();
    });
  }
  $('#offline').addEventListener('change', event => { state.offline = event.target.checked; cancelAll(); wake(); });
  $('#bright').addEventListener('change', event => { state.bright = event.target.checked; draw(); });
  $('#safe-area').addEventListener('change', event => { cancelAll(); stage.classList.toggle('safe-area', event.target.checked); draw(); });
  $('#reset').addEventListener('click', () => {
    cancelAll();
    Object.assign(state, { heat: 36, locked: false, energy: 82, shield: 64, ammo: 3, bombCooldown: 0, offline: false, bright: false });
    effects.length = 0;
    for (const id of ['offline', 'bright', 'safe-area']) $(`#${id}`).checked = false;
    stage.classList.remove('safe-area');
    announce('התצוגה אופסה'); render(); draw();
  });

  function gallery(format = 'svg') {
    $('#asset-rows').replaceChildren();
    for (const component of assets.components) {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.append(component.label);
      const english = document.createElement('small'); english.textContent = component.name.toUpperCase(); heading.append(english); row.append(heading);
      for (const [mode, label] of [['normal', 'רגיל'], ['pressed', 'לחוץ'], ['disabled', 'מושבת']]) {
        const cell = document.createElement('td');
        const link = document.createElement('a'); link.className = 'asset-link'; link.href = component.states[mode][format].path;
        link.setAttribute('aria-label', `${component.label}, ${label}, ${format.toUpperCase()}`);
        const image = document.createElement('img'); image.src = link.href; image.alt = ''; image.width = 56; image.height = 56;
        link.append(image); cell.append(link); row.append(cell);
      }
      $('#asset-rows').append(row);
    }
  }
  for (const button of document.querySelectorAll('[data-format]')) {
    button.addEventListener('click', () => {
      for (const other of document.querySelectorAll('[data-format]')) other.setAttribute('aria-pressed', String(other === button));
      gallery(button.dataset.format);
    });
  }

  // Decorative space scene, drawn once while idle. No remote imagery or game imports.
  const stars = Array.from({ length: 150 }, (_, i) => ({ x: ((i * 127 + 31) % 997) / 997, y: ((i * 271 + 67) % 991) / 991, r: i % 7 === 0 ? 1.1 : .55 }));
  function polygon(points, fill, edge, line = 1) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = line; ctx.stroke(); }
  }
  function draw() {
    if (!ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, state.bright ? '#b4ccdc' : '#101d32'); base.addColorStop(.5, state.bright ? '#8ca9c2' : '#060e1c'); base.addColorStop(1, state.bright ? '#b5b3c9' : '#141526');
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .44, h * .36, 0, w * .44, h * .36, w * .6);
    glow.addColorStop(0, '#347b9820'); glow.addColorStop(1, '#347b9800'); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    for (const star of stars) { ctx.globalAlpha = star.r > 1 ? .65 : .4; ctx.fillStyle = '#cfdfef'; ctx.beginPath(); ctx.arc(star.x * w, star.y * h, star.r, 0, 2 * Math.PI); ctx.fill(); }
    ctx.globalAlpha = 1;
    // A planet limb stays behind the left rail; the central flight corridor is quiet.
    const planet = ctx.createRadialGradient(-w * .12, h * .64, 0, -w * .12, h * .64, w * .3);
    planet.addColorStop(.7, '#1b3047'); planet.addColorStop(.96, '#2d5266'); planet.addColorStop(.98, '#6590a0'); planet.addColorStop(1, '#152c3e00');
    ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(-w * .12, h * .64, w * .3, 0, Math.PI * 2); ctx.fill();
    const cx = w * .5, cy = h * .78;
    ctx.save(); ctx.translate(cx, cy);
    const engine = ctx.createLinearGradient(0, 8, 0, 66); engine.addColorStop(0, '#9af3ffb0'); engine.addColorStop(1, '#67cfff00');
    polygon([[-5, 10], [0, 66], [5, 10]], engine);
    polygon([[0, -25], [-11, -3], [-24, 13], [-9, 10], [0, 18], [9, 10], [24, 13], [11, -3]], '#718b9f', '#bdd8e9');
    polygon([[0, -25], [-4, 2], [0, 11], [4, 2]], '#c6e1ed'); polygon([[0, -14], [-4, -2], [4, -2]], '#6bd8f3'); ctx.restore();
    const enemyXs = w < 500 ? [.36, .64] : [.31, .43, .57, .69];
    enemyXs.forEach((x, i) => { const y = h * (.25 + (i % 2) * .06); ctx.save(); ctx.translate(w * x, y);
      polygon([[-14, -3], [-7, -9], [0, -5], [7, -9], [14, -3], [8, 6], [0, 2], [-8, 6]], '#4a475e', '#9b91b6'); ctx.fillStyle = '#ffc19b'; ctx.fillRect(-3, -2, 6, 2); ctx.restore(); });
    for (const effect of effects) {
      const age = state.elapsed - effect.start;
      if (effect.id === 'fire' || effect.id === 'vulcan') {
        ctx.strokeStyle = effect.id === 'fire' ? '#d9f7ff' : '#ffd28a'; ctx.lineWidth = 2; ctx.beginPath();
        const y = cy - 34 - age * h * 1.5; ctx.moveTo(cx - 8, y); ctx.lineTo(cx - 8, y - 15); ctx.moveTo(cx + 8, y); ctx.lineTo(cx + 8, y - 15); ctx.stroke();
      } else if (effect.id === 'missile') {
        const y = cy - age * h * .8; ctx.strokeStyle = '#b5c7ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + 25); ctx.stroke();
      } else { ctx.strokeStyle = `rgba(255,183,170,${Math.max(0, 1 - age)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 20 + age * w * .5, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  function resize() {
    if (!ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  function wake(seconds = 0) {
    wakeUntil = Math.max(wakeUntil, performance.now() + seconds * 1000);
    if (!frame && !document.hidden) { previous = 0; frame = requestAnimationFrame(tick); }
  }
  function tick(time) {
    frame = 0;
    const dt = previous ? Math.min(.05, (time - previous) / 1000) : 0;
    previous = time; state.elapsed += dt;
    if (isHeld('vulcan') && !state.locked) {
      state.heat = clamp(state.heat + dt * 36);
      if (state.heat >= 100) { state.locked = true; announce('וולקן מתקרר · ירי רגיל נשאר זמין'); }
    } else state.heat = clamp(state.heat - dt * 22);
    if (state.locked && state.heat === 0) { state.locked = false; announce('וולקן מוכן'); }
    state.bombCooldown = Math.max(0, state.bombCooldown - dt);
    if ((isHeld('fire') || isHeld('vulcan')) && state.elapsed - state.lastFire > .15) {
      state.lastFire = state.elapsed; effect(isHeld('vulcan') ? 'vulcan' : 'fire');
    }
    while (effects.length && state.elapsed - effects[0].start > 1.2) effects.shift();
    render(); draw();
    const busy = held.size || state.heat > 0 || state.locked || state.bombCooldown > 0 || effects.length || time < wakeUntil;
    if (busy && !frame) frame = requestAnimationFrame(tick);
  }
  reduced.addEventListener('change', () => { effects.length = 0; draw(); });
  new ResizeObserver(resize).observe(stage);
  gallery(); render(); resize();
})();

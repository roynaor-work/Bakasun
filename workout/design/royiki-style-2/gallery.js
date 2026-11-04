/* The gallery runs offline, including file://. Each SVG also works on its own in <img>. */
(() => {
  'use strict';
  const { exercises } = window.ROYIKI_CATALOG;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = { upper: '#e6e0f0', core: '#e3ece8', jump: '#f1e2d4', legs: '#e1e8ef', warm: '#eee4cf', speed: '#dce8ed', stretch: '#e7e8dc' };
  const icons = {
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m9 5 11 7-11 7Z"/>',
    restart: '<path d="M4 11a8 8 0 1 1 2.4 6M4 4v7h7"/>',
    expand: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  const get = id => document.getElementById(id);
  const states = new Map();
  const dialog = get('focus-dialog');
  let activeFilter = 'all', activeBatch = 'all', focused = null, serial = 0, frame = 0;

  function createSvg(item) {
    const prefix = `instance-${++serial}-`;
    const markup = window.ROYIKI_ARTWORK[item.id]
      .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
      .replace(/href="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`)
      .replace(/aria-labelledby="([^"]+)"/g, (_, ids) => `aria-labelledby="${ids.split(' ').map(id => prefix + id).join(' ')}"`);
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    const svg = holder.firstElementChild;
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    return svg;
  }

  function buttonState(button, paused, label) {
    button.innerHTML = icon(paused ? 'play' : 'pause');
    button.setAttribute('aria-label', `${paused ? 'הפעלת' : 'עצירת'} ${label}`);
    button.title = `${paused ? 'הפעלת' : 'עצירת'} ${label}`;
    button.setAttribute('aria-pressed', String(!paused));
  }

  function sync(state) {
    const pause = state.paused || state.card.hidden || document.hidden || dialog.open;
    pause ? state.svg.pauseAnimations() : state.svg.unpauseAnimations();
    buttonState(state.button, state.paused, state.item.name);
  }

  function syncToolbar() {
    const playing = [...states.values()].some(s => !s.card.hidden && !s.paused);
    get('toggle-all').innerHTML = icon(playing ? 'pause' : 'play') + `<span>${playing ? 'עצירת הכול' : 'הפעלת הכול'}</span>`;
    get('toggle-all').setAttribute('aria-pressed', String(playing));
  }

  for (const [index, item] of exercises.entries()) {
    const card = document.createElement('article');
    card.className = 'exercise-card';
    card.dataset.exercise = item.id;
    card.style.setProperty('--stage', colors[item.category]);
    card.innerHTML = `<div class="card-stage"><span class="card-number" dir="ltr">${String(index + 1).padStart(2, '0')} / ${exercises.length}</span><span class="card-category">${item.categoryName}</span><button class="icon-button enlarge" type="button" aria-label="הגדלת ${item.name}" title="הגדלת ההדגמה">${icon('expand')}</button></div><div class="card-info"><div><h2 class="card-title">${item.name}</h2><p class="card-meta" dir="ltr">${(item.bytes / 1000).toFixed(1)} KB · SVG</p></div><button class="icon-button card-toggle" type="button"></button></div>`;
    const svg = createSvg(item);
    card.querySelector('.card-stage').prepend(svg);
    get('exercises').append(card);
    const state = { item, card, svg, button: card.querySelector('.card-toggle'), paused: reducedMotion.matches };
    states.set(item.id, state);
    sync(state);
    state.button.addEventListener('click', () => { state.paused = !state.paused; sync(state); syncToolbar(); });
    card.querySelector('.enlarge').addEventListener('click', () => openFocus(state));
  }

  const categories = ['all', ...new Set(exercises.map(item => item.category))];
  for (const category of categories) {
    const members = exercises.filter(item => category === 'all' || item.category === category);
    const button = document.createElement('button');
    button.className = 'filter';
    button.type = 'button';
    button.dataset.category = category;
    button.setAttribute('aria-pressed', String(category === 'all'));
    button.innerHTML = `${category === 'all' ? 'כל התרגילים' : members[0].categoryName}<span>${members.length}</span>`;
    get('filters').append(button);
    button.addEventListener('click', () => {
      activeFilter = category;
      get('filters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      applyFilters();
      updateResults();
      syncToolbar();
    });
  }

  function applyFilters() {
    for (const state of states.values()) {
      state.card.hidden = (activeFilter !== 'all' && state.item.category !== activeFilter)
        || (activeBatch !== 'all' && state.item.batch !== Number(activeBatch));
      sync(state);
    }
    updateResults();
    syncToolbar();
  }
  for (const button of get('batches').querySelectorAll('button')) {
    button.addEventListener('click', () => {
      activeBatch = button.dataset.batch;
      get('batches').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      applyFilters();
    });
  }
  for (const item of exercises) {
    const row = document.createElement('tr');
    row.innerHTML = `<td><code dir="ltr">${item.id}</code></td><td>${item.name}</td><td>${item.batch}</td><td><a href="${item.src}" dir="ltr">${item.src}</a></td><td dir="ltr">${(item.bytes / 1000).toFixed(2)} KB</td>`;
    get('mapping-rows').append(row);
  }

  function updateResults() {
    const count = [...states.values()].filter(s => !s.card.hidden).length;
    get('results').textContent = `${count} מתוך ${exercises.length} הדגמות · לחצו על פינות ההרחבה למבט מקרוב`;
  }
  get('toggle-all').addEventListener('click', () => {
    const playing = [...states.values()].some(s => !s.card.hidden && !s.paused);
    for (const state of states.values()) if (!state.card.hidden) { state.paused = playing; sync(state); }
    syncToolbar();
  });
  get('restart-all').innerHTML = icon('restart');
  get('restart-all').addEventListener('click', () => {
    for (const state of states.values()) state.svg.setCurrentTime(0);
  });
  document.addEventListener('visibilitychange', () => {
    for (const state of states.values()) sync(state);
    if (focused) (document.hidden || focused.paused) ? focused.svg.pauseAnimations() : focused.svg.unpauseAnimations();
  });
  reducedMotion.addEventListener('change', event => {
    get('motion-note').hidden = !event.matches;
    if (event.matches) {
      for (const state of states.values()) { state.paused = true; sync(state); }
      if (focused) { focused.paused = true; focused.svg.pauseAnimations(); buttonState(get('focus-toggle'), true, 'ההדגמה'); }
      syncToolbar();
    }
  });

  function openFocus(state) {
    const svg = createSvg(state.item);
    get('focus-stage').replaceChildren(svg);
    get('focus-stage').style.setProperty('--stage', colors[state.item.category]);
    get('focus-title').textContent = state.item.name;
    get('focus-category').textContent = state.item.categoryName;
    get('copy-status').textContent = '';
    get('focus-download').href = state.item.src;
    get('focus-download').download = `${state.item.id}.svg`;
    focused = { item: state.item, svg, paused: state.paused };
    dialog.showModal();
    svg.setCurrentTime(state.svg.getCurrentTime() % (state.item.durationMs / 1000));
    if (focused.paused) svg.pauseAnimations();
    for (const background of states.values()) sync(background);
    buttonState(get('focus-toggle'), focused.paused, 'ההדגמה');
    const update = () => {
      if (!focused) return;
      const duration = focused.item.durationMs / 1000;
      const time = focused.svg.getCurrentTime() % duration;
      get('seek').value = String(Math.round(time / duration * 1000));
      get('focus-time').textContent = `${time.toFixed(1)} / ${duration.toFixed(1)} s`;
      frame = requestAnimationFrame(update);
    };
    update();
  }
  get('focus-toggle').addEventListener('click', () => {
    if (!focused) return;
    focused.paused = !focused.paused;
    focused.paused ? focused.svg.pauseAnimations() : focused.svg.unpauseAnimations();
    buttonState(get('focus-toggle'), focused.paused, 'ההדגמה');
  });
  get('seek').addEventListener('input', event => {
    if (!focused) return;
    focused.paused = true;
    focused.svg.pauseAnimations();
    focused.svg.setCurrentTime(Number(event.target.value) / 1000 * focused.item.durationMs / 1000);
    buttonState(get('focus-toggle'), true, 'ההדגמה');
  });
  get('close-dialog').innerHTML = icon('close');
  get('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    cancelAnimationFrame(frame);
    if (focused) focused.svg.pauseAnimations();
    focused = null;
    get('focus-stage').replaceChildren();
    for (const state of states.values()) sync(state);
  });
  get('copy-embed').addEventListener('click', async () => {
    if (!focused) return;
    const item = focused.item;
    const src = `workout/design/royiki-style-2/${item.src}`;
    const poster = `workout/design/royiki-style-2/${item.poster}`;
    const code = `<picture>\n  <source media="(prefers-reduced-motion: reduce)" srcset="${poster}">\n  <img src="${src}" alt="${item.name}" width="440" height="420">\n</picture>`;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(code);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        dialog.append(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Copy unavailable');
      }
      get('copy-status').textContent = 'קוד ההטמעה הועתק';
    } catch { get('copy-status').textContent = 'ההעתקה לא זמינה בדפדפן זה'; }
  });
  get('motion-note').hidden = !reducedMotion.matches;
  const largest = Math.max(...exercises.map(item => item.bytes));
  get('asset-summary').textContent = `${exercises.length} SVG · max ${(largest / 1000).toFixed(1)} KB / 60 KB · offline`;
  updateResults();
  syncToolbar();
})();

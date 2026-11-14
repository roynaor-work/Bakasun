/* Design preview only. Invented scores; no persistence, network or game hooks. */
(() => {
  'use strict';
  const kit = window.REWARD_KIT;
  const assets = new Map(kit.assets.map(asset => [asset.id, asset]));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let format = 'svg';
  let run = 0;
  let opening = false;
  let opened = false;
  const image = (element, id) => {
    element.dataset.asset = id;
    element.src = assets.get(id).files[format];
  };
  const skin = (element, id) => {
    element.dataset.skin = id;
    element.style.setProperty('--skin', `url("${assets.get(id).files[format]}")`);
  };
  const refresh = () => {
    document.querySelectorAll('[data-asset]').forEach(el => image(el, el.dataset.asset));
    document.querySelectorAll('[data-skin]').forEach(el => skin(el, el.dataset.skin));
    document.documentElement.style.setProperty('--panel-bg', `url("${assets.get('panel-background').files[format]}")`);
    document.documentElement.style.setProperty('--panel-line', `url("${assets.get('panel-border').files[format]}")`);
  };
  const status = text => { document.getElementById('status').textContent = text; };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Explicit decode prevents missing/blank frames on first play and format switches.
  const preload = fmt => Promise.all(kit.assets.filter(a => a.role === 'animation-frame').map(async a => {
    const img = new Image();
    img.src = a.files[fmt];
    await img.decode();
  }));
  const cached = new Map();
  const ready = fmt => {
    if (!cached.has(fmt)) cached.set(fmt, preload(fmt).catch(error => { cached.delete(fmt); throw error; }));
    return cached.get(fmt);
  };
  async function animate(element, name, token, finalAsset) {
    const animation = kit.animations[name];
    const final = finalAsset || animation.finalAsset;
    if (token !== run) return;
    if (reducedMotion.matches) { image(element, final); return; }
    try { await ready(format); }
    catch { if (token === run) image(element, final); return; }
    for (const frame of animation.frames) {
      if (token !== run) return;
      if (reducedMotion.matches) break;
      image(element, frame);
      await delay(animation.frameDurationMs);
    }
    if (token === run) image(element, final);
  }
  async function celebrate() {
    const token = ++run;
    opening = false;
    opened = false;
    const gift = document.getElementById('gift');
    gift.dataset.open = 'false';
    gift.setAttribute('aria-label', 'פתיחת המתנה');
    document.getElementById('gift-hint').textContent = 'מחכה לך מתנה';
    image(document.getElementById('gift-image'), 'gift-closed');
    const stars = [...document.querySelectorAll('.rating-star')];
    stars.forEach(el => image(el, 'star-empty'));
    await Promise.all(stars.map(async (el, i) => {
      if (!reducedMotion.matches) await delay(i * 110);
      await animate(el, 'star-light', token, i === 2 ? 'star-half' : 'star-full');
    }));
    if (token === run) status('כל הכבוד! שניים וחצי כוכבים ומדליית זהב.');
  }
  document.getElementById('replay').addEventListener('click', celebrate);
  document.getElementById('gift').addEventListener('click', async () => {
    if (opening || opened) return;
    opening = true;
    const token = run;
    await animate(document.getElementById('gift-image'), 'gift-open', token);
    if (token !== run) return;
    opening = false;
    opened = true;
    document.getElementById('gift').dataset.open = 'true';
    document.getElementById('gift').setAttribute('aria-label', 'המתנה נפתחה');
    document.getElementById('gift-hint').textContent = 'איזו הפתעה!';
    status('המתנה נפתחה. כל הכבוד על ההתמדה!');
  });
  document.getElementById('island').addEventListener('click', () => status('דוגמת עיצוב: כאן חוזרים לאי.'));
  function view(name) {
    document.getElementById('result-view').hidden = name !== 'result';
    document.getElementById('kit-view').hidden = name !== 'kit';
    for (const item of ['result', 'kit']) {
      const tab = document.getElementById(`${item}-tab`);
      if (item === name) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    }
  }
  document.getElementById('result-tab').addEventListener('click', () => view('result'));
  document.getElementById('kit-tab').addEventListener('click', () => view('kit'));
  document.getElementById('format').addEventListener('click', async event => {
    // Cancel old sequences and resolve to stable poses before changing texture formats.
    ++run;
    opening = false;
    document.querySelectorAll('.rating-star').forEach((el, i) => image(el, i === 2 ? 'star-half' : 'star-full'));
    image(document.getElementById('gift-image'), opened ? 'gift-open' : 'gift-closed');
    format = format === 'svg' ? 'png' : 'svg';
    event.currentTarget.innerHTML = `<bdi>${format.toUpperCase()}</bdi>`;
    event.currentTarget.setAttribute('aria-pressed', String(format === 'png'));
    event.currentTarget.setAttribute('aria-label', format === 'svg' ? 'הצגת נכסי PNG במקום SVG' : 'הצגת נכסי SVG במקום PNG');
    refresh();
    ready(format).catch(() => status('הפריימים לא נטענו; יוצג מצב סופי.'));
  });
  // Default, pressed and disabled are real exported skins, also used for pointer/keyboard input.
  document.querySelectorAll('.reward-button').forEach(button => {
    const kind = button.classList.contains('primary') ? 'primary' : 'secondary';
    const set = pressed => skin(button, `button-${kind}-${pressed ? 'pressed' : 'default'}`);
    button.addEventListener('pointerdown', () => set(true));
    ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(event => button.addEventListener(event, () => set(false)));
    button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') set(true); });
    button.addEventListener('keyup', () => set(false));
  });
  const groups = [
    ['שלושה מצבי כוכב', a => a.role === 'rating-star'],
    ['מדליות והישגים', a => a.role === 'medal' || a.id === 'trophy' || a.role === 'text-surface'],
    ['כפתורים · רגיל, לחוץ, מושבת', a => a.role === 'button-surface'],
    ['פאנל והתקדמות', a => a.role.startsWith('panel-') || a.role.startsWith('progress-')],
    ['מטבעות ומתנות', a => a.role === 'currency' || a.id === 'gift-open' || a.id === 'gift-closed'],
    ['הדלקת כוכב · 8 פריימים', a => a.id.startsWith('star-light-')],
    ['פתיחת מתנה · 8 פריימים', a => a.id.startsWith('gift-open-')],
  ];
  const states = {default: 'רגיל', pressed: 'לחוץ', disabled: 'מושבת'};
  const catalog = document.getElementById('catalog');
  for (const [heading, select] of groups) {
    const title = document.createElement('h2');
    title.className = 'catalog-section';
    title.textContent = heading;
    catalog.append(title);
    for (const asset of kit.assets.filter(select)) {
      const card = document.createElement('div');
      card.className = `asset-card ${asset.role === 'animation-frame' ? 'frame' : ''}`;
      let sample;
      if (asset.role === 'button-surface') {
        sample = document.createElement('button');
        sample.className = `sample-surface skin ${asset.kind}`;
        sample.disabled = asset.state === 'disabled';
        sample.textContent = `${asset.labelHe} · ${states[asset.state]}`;
        sample.setAttribute('aria-label', `דוגמת כפתור ${sample.textContent}`);
        skin(sample, asset.id);
      } else if (asset.nineSlice) {
        sample = document.createElement('div');
        sample.className = `skin ${asset.role.startsWith('progress') ? 'sample-progress' : asset.role.startsWith('panel') ? 'sample-panel' : 'record'}`;
        sample.style.setProperty('--slice', asset.nineSlice.insets[0]);
        sample.style.setProperty('--edge', `${asset.nineSlice.borderWidthPx}px`);
        if (asset.role === 'text-surface') sample.textContent = 'שיא חדש';
        skin(sample, asset.id);
      } else {
        sample = document.createElement('img');
        sample.alt = '';
        sample.width = sample.height = 72;
        image(sample, asset.id);
      }
      const label = document.createElement('span');
      label.textContent = asset.role === 'animation-frame' ? `${asset.labelHe} · ${asset.frameIndex + 1}/8` : asset.labelHe;
      const id = document.createElement('code');
      id.textContent = asset.id;
      card.append(sample, label, id);
      catalog.append(card);
    }
  }
  refresh();
  ready(format).catch(() => status('הפריימים לא נטענו; יוצג מצב סופי.'));
})();

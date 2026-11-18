// Original upgrade-offer view. CC0-1.0; see LICENSES.md.
const ICONS = new Set(['engine', 'tires', 'brakes', 'aerodynamics', 'nitro',
  'racket', 'tennis-power', 'accuracy', 'throw-power', 'jump', 'defense',
  'speed', 'kick', 'goalkeeper', 'cannon', 'shield', 'armor',
  'upgrade', 'star', 'coin', 'lock', 'arrow-up']);
const asset = name => new URL(`./icons/${ICONS.has(name) ? name : 'upgrade'}.svg`, import.meta.url).href;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
let serial = 0;

/** Display only. The host owns eligibility, purchases, persistence and dismissal.
 * update takes a full snapshot; callbacks never debit or save anything.
 * A section, not a modal: put the host in the game's dialog when integrating.
 */
export function create(host, options = {}) {
  if (!host?.ownerDocument) throw new TypeError('A DOM host is required');
  const doc = host.ownerDocument;
  const make = (tag, cls, text, parent) => {
    const el = doc.createElement(tag);
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    parent?.append(el);
    return el;
  };
  const image = (name, cls, parent) => {
    const el = make('img', cls, undefined, parent);
    el.src = asset(name); el.alt = ''; el.width = 48; el.height = 48;
    el.setAttribute('aria-hidden', 'true');
    return el;
  };
  const root = make('section', 'uo-kit uo-card', undefined, host);
  root.dir = 'rtl'; root.lang = 'he';
  root.setAttribute('aria-labelledby', `uo-title-${++serial}`);
  const top = make('div', 'uo-top', undefined, root);
  image('upgrade', 'uo-mark', top);
  make('h2', 'uo-title', 'אפשר לשדרג!', top).id = `uo-title-${serial}`;
  const category = make('p', 'uo-category', '', root);
  const art = make('div', 'uo-art', undefined, root);
  const mainIcon = image('upgrade', 'uo-main-icon', art);
  for (let i = 0; i < 3; i++) image('star', `uo-spark uo-spark-${i}`, art);
  const name = make('h3', 'uo-name', '', root);
  const status = make('p', 'uo-status', '', root);
  const budget = make('div', 'uo-budget', undefined, root);
  const priceLine = make('div', '', undefined, budget);
  make('span', '', 'המחיר', priceLine);
  const priceNumber = make('bdi', 'uo-number', '', priceLine);
  const currencyIcon = image('coin', 'uo-currency', priceLine);
  const balanceLine = make('div', '', undefined, budget);
  make('span', '', 'יש לך', balanceLine);
  const balanceNumber = make('bdi', 'uo-number', '', balanceLine);
  const unitLabel = make('span', 'uo-unit', '', balanceLine);
  const progress = make('progress', 'uo-progress', undefined, root);
  const hint = make('p', 'uo-hint', '', root);
  const controls = make('div', 'uo-controls', undefined, root);
  const primary = make('button', 'uo-button uo-primary', 'שדרג', controls);
  const later = make('button', 'uo-button uo-later', 'אחר כך', controls);
  primary.type = later.type = 'button';
  const Abort = doc.defaultView.AbortController;
  const life = new Abort();
  let dead = false, canUpgrade = false;
  primary.addEventListener('click', () => { if (canUpgrade) options.onUpgrade?.(); }, { signal: life.signal });
  later.addEventListener('click', () => options.onLater?.(), { signal: life.signal });

  function update(state = {}) {
    if (dead) return;
    const price = count(state.price), balance = count(state.balance);
    const locked = state.locked === true;
    const purchased = state.purchased === true;
    // Invalid/absent prices fail closed; free upgrades use a separate host flow.
    canUpgrade = !locked && !purchased && price > 0 && balance >= price;
    root.dataset.state = purchased ? 'purchased' : locked ? 'locked' : canUpgrade ? 'ready' : 'short';
    root.dataset.mode = state.mode === 'light' ? 'light' : 'dark';
    root.hidden = state.visible === false;
    category.textContent = state.category ?? 'השדרוג הבא שלך';
    name.textContent = state.name ?? 'שדרוג חדש';
    mainIcon.src = asset(locked ? 'lock' : state.icon);
    const unit = state.unit === 'points' ? 'נקודות' : 'מטבעות';
    currencyIcon.src = asset(state.unit === 'points' ? 'star' : 'coin');
    unitLabel.textContent = unit;
    priceNumber.textContent = price.toLocaleString('he-IL');
    balanceNumber.textContent = balance.toLocaleString('he-IL');
    progress.max = price || 1; progress.value = Math.min(balance, price);
    progress.setAttribute('aria-label', `יש לך ${balance} ${unit}. המחיר ${price} ${unit}`);
    status.textContent = purchased ? 'השדרוג שלך!' : locked ? 'עדיין נעול' : canUpgrade ? 'יש לך מספיק!' : 'כמעט שם!';
    hint.textContent = purchased ? 'מוכנים לסיבוב הבא' : locked ? (state.lockReason ?? 'נפתח בשלב הבא')
      : price === 0 ? 'השדרוג לא זמין כרגע' : canUpgrade ? 'אפשר להתחזק עכשיו' : `חסרים עוד ${price - balance} ${unit}`;
    primary.textContent = purchased ? 'שודרג!' : 'שדרג';
    primary.disabled = !canUpgrade;
  }
  update(options.initial);
  return { update, destroy() { if (!dead) { dead = true; life.abort(); root.remove(); } } };
}

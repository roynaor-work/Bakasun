/** Island UI Kit v2 (design/ui-kit-v2) as small DOM helpers for the game menu, opening and result screens.
 * Display only: values (stars, score, outcome) come from the game; nothing here computes rewards. Every image is
 * decorative (alt="") and hides itself if its file fails, so a missing asset leaves the earlier look. */
const KIT = new URL('../design/ui-kit-v2/', import.meta.url);
export const KIT_GAMES = Object.freeze(['soccer', 'tennis', 'streetSlam', 'alpineRush', 'islandRacing', 'navalDuel', 'fireRescue', 'alienDefense', 'boarDefense']);
export const hasKit = id => KIT_GAMES.includes(id);
export const kitUrl = path => new URL(path, KIT).href;

function image(path, width, height, cls = '') {
  const img = document.createElement('img');
  img.src = kitUrl(path); img.width = width; img.height = height; img.alt = ''; img.decoding = 'async'; img.draggable = false;
  if (cls) img.className = cls;
  img.onerror = () => { img.hidden = true; img.dataset.kit = 'missing'; };
  return img;
}
/** 64x64 game symbol, or null for a game the kit does not cover. */
export const kitGameIcon = (id, size = 44) => hasKit(id) ? image(`icons/games/${id}.svg`, size, size, 'ik-game-icon') : null;
/** 720x450 opening illustration (8:5), or null. */
export const kitIntro = id => hasKit(id) ? image(`intro/${id}.svg`, 720, 450, 'ik-intro') : null;
/** 64x64 menu symbol: lock, check, play, trophy, retry... */
export const kitIcon = (name, size = 20, cls = 'ik-icon') => image(`icons/menu/${name}.svg`, size, size, cls);
export const kitTrophy = () => image('rewards/trophy.svg', 180, 160, 'ik-trophy');

/** Stars as a group with one accessible label; `label` is supplied by the caller (the game's own wording). */
export function kitRating(stars, {max = 3, label = '', size = 56, animate = false} = {}) {
  const box = document.createElement('div'), count = Math.max(0, Math.min(max, Math.round(Number(stars) || 0)));
  box.className = 'ik-rating' + (animate ? ' ik-stars-enter' : ''); box.dataset.rating = String(count); box.setAttribute('role', 'img'); if (label) box.setAttribute('aria-label', label);
  for (let i = 0; i < max; i++) box.append(image(i < count ? 'rewards/star-filled.svg' : 'rewards/star-empty.svg', size, size));
  return box;
}
/** Inline stars for buttons and chips, small. */
export const kitStarsInline = (stars, max = 3) => { const r = kitRating(stars, {max, size: 16}); r.classList.add('ik-rating-inline'); return r; };
/** Replaces a button's trailing emoji/star text: `<span>label</span> [lock icon | stars]`. Accessible name stays on the button. */
export function kitStageLabel(node, text, {locked = false, stars = 0, done = false} = {}) {
  const label = document.createElement('span'); label.className = 'ik-stage-label'; label.textContent = text; node.replaceChildren(label);
  if (locked) node.append(kitIcon('lock', 18, 'ik-icon ik-lock')); else if (done) node.append(kitIcon('check', 18, 'ik-icon ik-check')); else if (stars !== null) node.append(kitStarsInline(stars));
  return node;
}
/** Primary kit button, same data-action and handler contract as the island's own buttons. */
export function kitButton(text, action, fn, {icon = 'play', cls = ''} = {}) {
  const wrap = document.createElement('span'), node = document.createElement('button');
  wrap.className = 'island-kit ik-wrap'; node.type = 'button'; node.className = `ik-button ik-primary ${cls}`.trim(); node.dataset.action = action; node.onclick = fn;
  if (icon) node.append(kitIcon(icon, 24, 'ik-icon')); const label = document.createElement('span'); label.textContent = text; node.append(label); wrap.append(node);
  return {wrap, button: node};
}
/** Result frame: trophy on a win, the stars the game reports, then the caller's rows. */
export function kitResultPanel({win, stars, ratingLabel, max = 3}, ...children) {
  const wrap = document.createElement('div'), panel = document.createElement('article');
  wrap.className = 'island-kit ik-result-wrap'; panel.className = 'ik-result ik-enter'; panel.dataset.outcome = win ? 'win' : 'lose';
  if (win) panel.append(kitTrophy());
  panel.append(kitRating(stars, {max, label: ratingLabel, animate: true}), ...children); wrap.append(panel); return wrap;
}
/** Gives an existing island button the kit's primary surface (same node, same data-action and handler). Returns the wrapper to append. */
export function kitPrimary(node) {
  const wrap = document.createElement('span'); wrap.className = 'island-kit ik-wrap';
  node.classList.remove('primary-button'); node.classList.add('ik-button', 'ik-primary'); wrap.append(node); return wrap;
}

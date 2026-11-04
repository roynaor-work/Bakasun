/* Her look (settings → "אישי"): the theme attribute on <html>, the text-size class and the optional new design.
   Applied at start and whenever a setting changes (also when the cloud brings one), so it never waits for the settings screen to load. */
import { db } from './store.js';
import { ensureCss } from './lazycss.js';

export function applyPersonal() {
  const s = db.settings(); const h = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') h.dataset.theme = s.theme; else delete h.dataset.theme;
  h.classList.toggle('text-large', s.textSize === 'large');
  /* "עיצוב חדש" (pilot, off by default): a stylesheet loaded only when it is on, switched by one attribute on <html> */
  if (s.design === 'new') { ensureCss(['newdesign']); h.dataset.design = 'new'; } else delete h.dataset.design;
}
export function startPersonal() { applyPersonal(); db.subscribe(applyPersonal); }

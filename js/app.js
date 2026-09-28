/* The shell: language, routing, bottom navigation. Each screen is a function (root, params) that draws itself
   and redraws when the data changes. */
import { t, setLang, dir, lang } from './i18n.js';
import { db } from './store.js';
import { esc } from './ui.js';
import * as today from './screens/today.js';
import * as lead from './screens/lead.js';
import * as cases from './screens/cases.js';
import * as clients from './screens/clients.js';
import * as calls from './screens/calls.js';
import * as tasks from './screens/tasks.js';
import * as search from './screens/search.js';
import * as settings from './screens/settings.js';
import * as more from './screens/more.js';
import * as suppliers from './screens/suppliers.js';
import * as quotes from './screens/quotes.js';
import * as groups from './screens/groups.js';
import * as money from './screens/money.js';
import * as notes from './screens/notes.js';
import * as assist from './screens/assist.js';
import * as portal from './screens/portal.js';
import * as receipts from './screens/receipts.js';
import { quickNote } from './notes.js';
import { setChangeHook } from './store.js';
import { enqueue } from './cloud.js';
setChangeHook(enqueue);

const ROUTES = {
  today, lead, cases, 'case': cases, clients, client: clients, calls, tasks, search, settings, more,
  suppliers, supplier: suppliers, quotes, quote: quotes, groups, money, notes, assist, portal, receipts
};
const NAV = [
  ['today', 'today', 'M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z'],
  ['cases', 'cases', 'M4 6h16v13H4zM4 10h16M8 6V4h8v2'],
  ['calls', 'calls', 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z'],
  ['tasks', 'tasks', 'M4 6h12M4 12h12M4 18h8M18 16l2 2 4-4'],
  ['more', 'more', 'M5 12h.01M12 12h.01M19 12h.01']
];

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let unsub = null;

export function applyLang() {
  const l = db.setting('lang') || 'he';
  setLang(l);
  document.documentElement.lang = l;
  document.documentElement.dir = dir(l);
  const rtl = dir(l) === 'rtl';
  [document.body, document.getElementById('root-shell')].forEach(el => { if (el) { el.style.direction = rtl ? 'rtl' : 'ltr'; el.style.textAlign = rtl ? 'right' : 'left'; } });
  document.title = t('app');
}

function drawNav(active) {
  nav.innerHTML = '<ul>' + NAV.map(([key, label, d]) =>
    `<li><a href="#/${key}" class="${active === key || (key === 'cases' && active === 'case') || (key === 'more' && ['clients', 'client', 'search', 'settings', 'suppliers', 'supplier', 'quotes', 'quote', 'money', 'notes', 'assist'].includes(active)) ? 'on' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>${esc(t(label))}</a></li>`).join('') + '</ul>';
}

export function go(hash) { location.hash = hash; }

document.addEventListener('click', e => { const b = e.target.closest('[data-quicknote]'); if (b) { e.preventDefault(); quickNote(); } });

function route() {
  applyLang();
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || 'today';
  const screen = ROUTES[name] || today;
  if (unsub) { unsub(); unsub = null; }
  drawNav(name);
  const ctx = { root: app, name, id: parts[1] || null, query: parts.slice(2) };
  const draw = () => { try { screen.render(ctx); } catch (e) { console.error(e); app.innerHTML = `<p class="warnbox">${esc(String(e && e.message || e))}</p>`; } };
  draw();
  unsub = db.subscribe(() => { if (!screen.noLive) draw(); });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}

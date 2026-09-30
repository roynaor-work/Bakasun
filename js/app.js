/* The shell: language, routing, bottom navigation. Each screen is a function (root, params) that draws itself
   and redraws when the data changes. */
import { t, setLang, dir, lang } from './i18n.js';
import { db } from './store.js';
import { esc } from './ui.js';
import * as today from './screens/today.js';
import * as help from './screens/help.js';
import * as share from './screens/share.js';
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
import * as dashboard from './screens/dashboard.js';
import * as calendar from './screens/calendar.js';
import * as participants from './screens/participants.js';
import * as contracts from './screens/contracts.js';
import { quickNote } from './notes.js';
import { setChangeHook } from './store.js';
import { enqueue } from './cloud.js';
setChangeHook(enqueue);
import { startHistory } from './logic/history.js'; startHistory();

const ROUTES = {
  today, lead, cases, 'case': cases, clients, client: clients, calls, tasks, search, settings, more,
  suppliers, supplier: suppliers, quotes, quote: quotes, groups, money, notes, assist, portal, receipts, help, share,
  dashboard, calendar, participants, contracts, contract: contracts
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
  // On a computer (css/desktop.css, from 900px) the bar becomes a side rail with the app name and the "more" screens listed
  // under the five main ones. On the phone the brand and the second list are hidden and the bar is unchanged.
  const SIDE = [
    ['dashboard', 'dashboard', 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z'],
    ['calendar', 'calendar', 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4'],
    ['clients', 'clients', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
    ['suppliers', 'suppliers', 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6'],
    ['quotes', 'quotes', 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6'],
    ['money', 'money', 'M3 7h18v10H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01'],
    ['notes', 'notes', 'M4 4h13l3 3v13H4zM8 9h8M8 13h8M8 17h5'],
    ['assist', 'assist', 'M12 3a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8'],
    ['search', 'search', 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5'],
    ['settings', 'settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4']
  ];
  const SINGULAR = { client: 'clients', supplier: 'suppliers', quote: 'quotes', 'case': 'cases', contract: 'contracts' };
  const cur = SINGULAR[active] || active;
  const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const item = ([key, label, d], on) => `<li><a href="#/${key}" class="${on ? 'on' : ''}">${icon(d)}${esc(t(label) === label && label === 'calendar' ? 'יומן' : t(label))}</a></li>`;
  nav.innerHTML = `<div class="brand" aria-hidden="true">${esc(t('app'))}</div><ul>` + NAV.map(x =>
    item(x, cur === x[0] || (x[0] === 'more' && ['clients', 'search', 'settings', 'suppliers', 'quotes', 'money', 'notes', 'assist'].includes(cur)))).join('') + '</ul>'
    + '<ul class="side-more">' + SIDE.map(x => item(x, cur === x[0])).join('') + '</ul>';
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

// "Add to home screen": the browser offers it once; we keep the offer and show our own button until she installs.
window.__installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__installPrompt = e; document.dispatchEvent(new Event('bakasun:installable')); });
window.addEventListener('appinstalled', () => { window.__installPrompt = null; try { localStorage.setItem('bakasun.installed', '1'); } catch (x) { /* */ } document.dispatchEvent(new Event('bakasun:installable')); });
// The cloud sign-in link lands here with the session in the hash (once the project's site URL points to the app):
// the session is stored, the hash is cleaned, and she is in. No password.
import { parseUrlHash } from './logic/cloudLink.js';
import { loginWithLink } from './cloud.js';
import { CLOUD } from './data/cloudcfg.js';
const linkSession = parseUrlHash(location.hash);
if (linkSession && CLOUD.url) {
  history.replaceState(null, '', location.pathname + '#/settings');
  loginWithLink(CLOUD.url, CLOUD.key, linkSession).then(() => route()).catch(e => { console.error(e); alert(t('cloudLinkFailed') + ' ' + (e.message || e)); route(); });
}
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}

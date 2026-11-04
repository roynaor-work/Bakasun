/* The shell: language, routing, bottom navigation. Each screen is a function (root, params) that draws itself
   and redraws when the data changes. */
import { t, setLang, dir, lang } from './i18n.js';
import { db } from './store.js';
import { esc } from './ui.js';
import * as today from './screens/today.js';
import { ensureCss } from './lazycss.js';
import { setChangeHook } from './store.js';
import { enqueue } from './cloud.js';
setChangeHook(enqueue);
import { startHistory } from './logic/history.js'; startHistory();

/* Only "today" (the usual landing) ships with the first load. Every other screen is a module fetched on demand:
   [loader, stylesheets it needs, extra modules that must be loaded with it]. Deep links, back and forward all go through route(). */
const S = n => () => import('./screens/' + n + '.js');
/* loaded one after the other, in this order: the order the modules register their tabs is the order of the tabs on the case */
const CASE_TABS_LOAD = ['workgroup', 'calendar', 'participants', 'contracts', 'budget', 'runsheet', 'casefiles'];
const CASE_TABS_CSS = ['participants', 'contracts', 'budget', 'runsheet', 'casefiles', 'calendar', 'templates'];
const LAZY = {
  lead: [S('lead')], cases: [S('cases'), CASE_TABS_CSS, CASE_TABS_LOAD], 'case': [S('cases'), CASE_TABS_CSS, CASE_TABS_LOAD],
  clients: [S('clients')], client: [S('clients')], calls: [S('calls')], tasks: [S('tasks'), ['tasks2']],
  search: [S('search')], settings: [S('settings'), ['rules']], more: [S('more')],
  suppliers: [S('suppliers')], supplier: [S('suppliers')], quotes: [S('quotes')], quote: [S('quotes')],
  groups: [S('groups')], money: [S('money')], notes: [S('notes')], assist: [S('assist'), ['templates']], portal: [S('portal')],
  receipts: [S('receipts')], help: [S('help')], share: [S('share')],
  dashboard: [S('dashboard'), ['dashboard']], calendar: [S('calendar'), ['calendar']],
  participants: [S('participants'), ['participants']], contracts: [S('contracts'), ['contracts']], contract: [S('contracts'), ['contracts']],
  budget: [S('budget'), ['budget']], runsheet: [S('runsheet'), ['runsheet']], files: [S('casefiles'), ['casefiles']],
  notifications: [S('rules'), ['rules']], board: [S('board'), ['board']],
  templates: [S('templates'), ['templates']], 'import': [S('importMail'), ['importmail']]
};
const ROUTES = { today };
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
  // her theme (settings → "אישי"): 'light' / 'dark' pin the colours, anything else follows the device (css/app.css)
  const theme = db.setting('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
}
/* The screen she lands on when the app opens with no address (setting 'landing'); 'today' unless she chose another. */
const LANDINGS = ['today', 'dashboard', 'calendar', 'board', 'tasks'];
function landing() { const l = db.setting('landing'); return LANDINGS.includes(l) ? l : 'today'; }

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

document.addEventListener('click', e => { const b = e.target.closest('[data-quicknote]'); if (b) { e.preventDefault(); import('./notes.js').then(m => m.quickNote()); } });

/* After every navigation: the tab title carries the screen name, focus moves to the screen's heading (so a keyboard / screen-reader
   user starts at the top of the new screen, not on <body>), and a polite live region says which screen opened. */
function announceScreen() {
  const h = app.querySelector('h1');
  const name = h ? h.textContent.trim() : '';
  document.title = name ? name + ' · ' + t('app') : t('app');
  const target = h || app;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  try { target.focus({ preventScroll: true }); } catch (e) { /* */ }
  let live = document.getElementById('route-live');
  if (!live) { live = document.createElement('div'); live.id = 'route-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.className = 'sr-only'; document.body.appendChild(live); }
  live.textContent = name ? t('pageLoaded') + ': ' + name : '';
}

const idle = (fn, timeout) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout }) : setTimeout(fn, Math.min(timeout, 1500)));
let routeSeq = 0;
async function loadScreen(name) {
  const spec = LAZY[name];
  if (!spec) return today;
  const [load, css = [], extra = []] = spec;
  const [mod] = await Promise.all([load(), ensureCss(css), (async () => { for (const n of extra) await import('./screens/' + n + '.js'); })()]);
  return mod;
}
async function route() {
  const seq = ++routeSeq;
  applyLang();
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || landing();
  if (unsub) { unsub(); unsub = null; }
  drawNav(name);
  let screen = ROUTES[name];
  if (!screen) {
    // a slow connection: say so while the screen's module arrives, instead of a blank page
    const wait = setTimeout(() => { if (seq === routeSeq && !app.firstElementChild) app.innerHTML = '<p class="muted" role="status" aria-live="polite">' + esc(t('loading')) + '</p>'; }, 400);
    try { screen = await loadScreen(name); } catch (e) {
      clearTimeout(wait); if (seq !== routeSeq) return;
      console.error(e); app.innerHTML = '<p class="warnbox" role="alert">' + esc(t('screenLoadFailed')) + '</p>'; return;
    }
    clearTimeout(wait);
    if (seq !== routeSeq) return; // she moved on while it loaded
    ROUTES[name] = screen;
  }
  const ctx = { root: app, name, id: parts[1] || null, query: parts.slice(2) };
  const draw = () => { try { screen.render(ctx); } catch (e) { console.error(e); app.innerHTML = `<p class="warnbox">${esc(String(e && e.message || e))}</p>`; } };
  draw();
  unsub = db.subscribe(() => { if (!screen.noLive) draw(); });
  window.scrollTo(0, 0);
  announceScreen();
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
  navigator.serviceWorker.register('sw.js').then(reg => {
    // a new version was published: it installs in the background, then the app reloads itself once (no stale screens)
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (!nw) return; nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) { import('./ui.js').then(m => m.toast(t('newVersion'), 2500)); setTimeout(() => location.reload(), 2600); } }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    // the first screen is cached already; once the page is idle the worker caches the rest, so every screen opens with no network
    const precache = () => navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage('precache')).catch(() => {});
    idle(precache, 3000);
  }).catch(() => { /* offline shell is optional */ });
}

// reminders (the rules engine and the badge on the menu) start once the first screen is up, not in its way
idle(() => import('./notify.js').then(m => m.startNotify()), 2500);
// a save that failed on the device is shown in red at once (and again at most once a minute), never swallowed
import { setSaveErrorHook } from './store.js';
{ let lastWarn = 0; setSaveErrorHook(msg => { if (Date.now() - lastWarn < 60000) return; lastWarn = Date.now(); import('./ui.js').then(m => m.toast(t('saveFailed') + ' ' + msg, 8000)); let bar = document.getElementById('savebar'); if (!bar) { bar = document.createElement('div'); bar.id = 'savebar'; bar.className = 'warnbox savebar'; document.body.prepend(bar); } bar.textContent = t('saveFailed') + ' ' + msg; }); }

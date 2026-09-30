/* The reminders at run time: evaluates the rules on start, on every data change (debounced), on focus and every
   five minutes; keeps the list in memory and in db.setting('notifyCache'); puts the badge on the "more" nav item;
   fires a browser notification for urgent items while the app is open (never during quiet hours, never without the
   permission she gave from the settings screen); reads the digest aloud once a day when she asked for it.
   Nothing here sends anything to anyone. */
import { db, todayIso } from './store.js';
import { lang } from './i18n.js';
import { evaluate, pending, unseen, ruleSettings, counts, digestText, inQuietHours, prune } from './logic/rules.js';
import { speak } from './speak.js';

let list = [];            // every notification the rules produced (before snooze / dismiss)
let shown = [];           // the pending ones
let last = '';            // a fingerprint of `list`, so the cache is written only when something changed
const subs = new Set();
let timer = null, started = false;

/** The pending notifications, most urgent first. */
export function current() { return shown; }
/** All of them, including the snoozed and dismissed ones. */
export function all() { return list; }
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
export function state() { return db.setting('notifyState') || {}; }
export function setState(st) { db.setting('notifyState', st); }

function data() {
  return { cases: db.list('cases'), tasks: db.list('tasks'), calls: db.list('calls'), links: db.list('links'), payments: db.list('payments'), quotes: db.list('quotes'),
    checklists: db.list('checklists'), contracts: db.list('contracts'), participants: db.list('participants'), suppliers: db.list('suppliers'),
    budget: db.list('budget'), clients: db.list('clients'), approvals: db.list('approvals'), print: db.list('print') };
}

/** Re-evaluates now. Returns the pending list. */
export function refresh() {
  const s = db.settings(); s.lang = lang();
  const today = todayIso();
  list = evaluate(data(), today, s);
  const st = state();
  shown = pending(list, st, new Date().toISOString());
  const fp = list.map(n => n.key + '|' + n.level).join(',') + '#' + shown.length;
  if (fp !== last) {
    last = fp;
    try { db.setting('notifyCache', { at: new Date().toISOString(), items: list.map(n => ({ key: n.key, kind: n.kind, level: n.level, title: n.title, when: n.when, href: n.href })) }); } catch (e) { /* the cache is a convenience */ }
  }
  badge();
  browserNotify(st, s);
  readDigest(st, s);
  subs.forEach(fn => { try { fn(shown); } catch (e) { console.error(e); } });
  return shown;
}

/* ---------------- the badge on the nav ---------------- */
let observing = false;
export function badge() {
  const n = unseen(shown, state());
  const nav = document.getElementById('nav'); if (!nav) return;
  ['a[href="#/more"]', 'a[href="#/notifications"]'].forEach(sel => nav.querySelectorAll(sel).forEach(a => {
    let b = a.querySelector('.nbadge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'nbadge'; b.setAttribute('aria-label', String(n)); a.appendChild(b); }
    if (b.textContent !== String(n)) b.textContent = String(n);
  }));
  if (!observing && window.MutationObserver) {
    // the shell redraws the nav on every route: put the badge back when it does (the guard above stops any loop)
    observing = true;
    new MutationObserver(muts => { if (muts.some(m => Array.from(m.addedNodes).some(x => x.nodeType === 1 && !x.classList.contains('nbadge')))) badge(); }).observe(nav, { childList: true, subtree: true });
  }
}

/* ---------------- browser notifications (urgent only, app open, not in quiet hours) ---------------- */
export function canNotify() { return typeof window !== 'undefined' && 'Notification' in window; }
export function permission() { return canNotify() ? Notification.permission : 'unsupported'; }
/** Asked only from the settings screen, on her tap. */
export async function askPermission() {
  if (!canNotify()) return 'unsupported';
  try { const r = await Notification.requestPermission(); return r; } catch (e) { return Notification.permission; }
}
function hhmmNow() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function browserNotify(st, s) {
  if (!canNotify() || Notification.permission !== 'granted') return;
  const R = ruleSettings(s);
  if (inQuietHours(hhmmNow(), R.quietFrom, R.quietTo)) return;
  const urgent = shown.filter(n => n.level === 'urgent' && !(st[n.key] && st[n.key].notified));
  if (!urgent.length) return;
  let next = Object.assign({}, st); const at = new Date().toISOString();
  urgent.slice(0, 3).forEach(n => {
    try {
      const x = new Notification(n.title, { body: n.body, tag: n.key, icon: 'icons/icon-192.png', lang: lang() });
      x.onclick = () => { try { window.focus(); } catch (e) { /* */ } location.hash = n.href || '#/notifications'; };
    } catch (e) { /* some browsers only allow it from a service worker */ }
    next = Object.assign({}, next, { [n.key]: Object.assign({}, next[n.key], { notified: at }) });
  });
  urgent.slice(3).forEach(n => { next = Object.assign({}, next, { [n.key]: Object.assign({}, next[n.key], { notified: at }) }); });
  setState(next);
}

/* ---------------- the digest, aloud, once a day ---------------- */
function readDigest(st, s) {
  const R = ruleSettings(s); if (!R.readDigest) return;
  const day = todayIso(); const meta = st._digest || {};
  if (meta.spoken === day) return;
  if (inQuietHours(hhmmNow(), R.quietFrom, R.quietTo)) return;
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  const ok = speak(digestText(shown, lang()), lang());
  if (ok) setState(Object.assign({}, st, { _digest: { spoken: day } }));
}
/** "Read now": the digest of what is pending, in the UI language. */
export function speakDigest() { return speak(digestText(shown, lang()), lang()); }

/* ---------------- lifecycle ---------------- */
function debounced() { clearTimeout(timer); timer = setTimeout(refresh, 1000); }
export function startNotify() {
  if (started) return; started = true;
  try { refresh(); } catch (e) { console.error(e); }
  db.subscribe(debounced);
  window.addEventListener('focus', () => { try { refresh(); } catch (e) { console.error(e); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { try { refresh(); } catch (e) { console.error(e); } } });
  window.addEventListener('hashchange', () => setTimeout(badge, 0));
  setInterval(() => { try { refresh(); } catch (e) { console.error(e); } }, 5 * 60 * 1000);
  // once a day, drop the state of keys that are gone (a dismissed item that came back is a new item)
  setInterval(() => { const st = state(); const p = prune(st, list.map(n => n.key)); if (Object.keys(p).length !== Object.keys(st).length) setState(p); }, 6 * 60 * 60 * 1000);
}
export { counts };

/* One search over everything: cases, people (clients, suppliers, phone contacts, crew, team), tasks, calls, notes, quotes,
   participants, files, contracts, budget lines, run-of-show blocks, history and the help texts. The matching and ranking live in
   js/logic/search.js; this file draws: grouped results with counts, a link per row, recent searches (this device only), and the
   keyboard: Enter opens the first result, Escape clears, and "/" from any screen (outside a field) opens this screen. */
import { t, lang } from '../i18n.js';
import { db } from '../store.js';
import { esc, empty } from '../ui.js';
import { HELP } from '../data/helpText.js';
import { buildIndex, search, addRecent, removeRecent, RECENT_MAX } from '../logic/search.js';

export const noLive = true;
const RECENT_KEY = 'bakasun.recentSearch';
const LIMIT = 6;
const GROUP_LABEL = { case: 'cases', client: 'clients', supplier: 'suppliers', contact: 'contacts', staff: 'srStaff', team: 'team', task: 'tasks', call: 'calls', note: 'notes', quote: 'quotes', participant: 'tParticipants', file: 'tFiles', contract: 'tContract', budget: 'tBudget', runsheet: 'tRunsheet', history: 'tHistory', help: 'srHelp' };
let q = '';

const recents = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, RECENT_MAX) : []; } catch (e) { return []; } };
const saveRecents = list => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* private mode: no memory, no harm */ } };
const remember = s => { if (s && s.trim()) saveRecents(addRecent(recents(), s)); };

/* "/" anywhere (not while typing in a field) opens the search; on the search screen it just focuses the box. Installed once. */
const typing = el => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('.modal')) return;
  e.preventDefault();
  const box = document.getElementById('q');
  if (location.hash.replace(/^#\/?/, '').split('/')[0] === 'search' && box) { box.focus(); box.select(); } else location.hash = '#/search';
});

export function render({ root, id }) {
  if (id) { try { q = decodeURIComponent(id); } catch (e) { q = id; } }
  root.innerHTML = `<header class="top"><a class="icon" href="#/today" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>
    <input id="q" type="search" placeholder="${esc(t('searchPh'))}" value="${esc(q)}" autocomplete="off" enterkeyhint="go" aria-label="${esc(t('srTitle'))}" autofocus></header>
    <div id="recent" class="sec"></div><p class="hint" id="srHint">${esc(t('srHint'))}</p><div id="res" class="stack"></div>`;
  const inp = root.querySelector('#q'), res = root.querySelector('#res'), rec = root.querySelector('#recent'), hint = root.querySelector('#srHint');
  // the index is built once per visit; every keystroke only runs the query over it
  const index = buildIndex(db.snapshot(), { help: HELP[lang()] || HELP.he });
  const expanded = new Set();
  let first = null, timer = null;

  const drawRecent = () => {
    const list = recents();
    rec.innerHTML = list.length ? `<h2>${esc(t('srRecent'))}</h2><div class="row">${list.map(s => `<span class="row" style="gap:2px"><button type="button" class="chip" data-q="${esc(s)}">${esc(s)}</button><button type="button" class="copyq" data-rm="${esc(s)}" aria-label="${esc(t('srRemove'))}" title="${esc(t('srRemove'))}">✕</button></span>`).join('')}</div>` : '';
    rec.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { inp.value = b.dataset.q; draw(); inp.focus(); }; });
    rec.querySelectorAll('[data-rm]').forEach(b => { b.onclick = () => { saveRecents(removeRecent(recents(), b.dataset.rm)); drawRecent(); }; });
  };
  const row = h => `<a class="card tap" href="${esc(h.href)}"><div class="row between"><span class="title">${esc(h.title || t('general'))}</span><span class="badge muted">${esc(t(GROUP_LABEL[h.group] || h.group))}</span></div>${h.sub ? `<div class="sub">${esc(h.sub)}</div>` : ''}</a>`;
  const draw = () => {
    q = inp.value;
    const r = search(index, q, { limit: 500 });
    first = r.first;
    hint.hidden = !!q.trim();
    drawRecent();
    if (!q.trim()) { res.innerHTML = ''; return; }
    if (!r.total) { res.innerHTML = empty(t('noResults')); return; }
    res.innerHTML = `<p class="hint">${esc(r.total === 1 ? t('srOne') : t('srTotal', { n: r.total }))}</p>` + r.groups.map(g => {
      const items = expanded.has(g.key) ? g.items : g.items.slice(0, LIMIT);
      return `<section class="sec"><div class="sec-h"><h2>${esc(t(GROUP_LABEL[g.key] || g.key))}</h2><span class="badge muted count">${g.count}</span></div>
        <div class="list">${items.map(row).join('')}${g.count > items.length ? `<button type="button" class="btn sm ghost" data-more="${g.key}">${esc(t('srShowAll', { n: g.count }))}</button>` : ''}</div></section>`;
    }).join('');
    res.querySelectorAll('[data-more]').forEach(b => { b.onclick = () => { expanded.add(b.dataset.more); draw(); }; });
  };
  inp.oninput = () => { clearTimeout(timer); timer = setTimeout(draw, 60); };
  inp.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); draw(); if (first) { remember(inp.value); location.hash = first.href; } }
    else if (e.key === 'Escape' && inp.value) { e.preventDefault(); inp.value = ''; draw(); }
    else if (e.key === 'ArrowDown') { const a = res.querySelector('a.card'); if (a) { e.preventDefault(); a.focus(); } }
  };
  res.addEventListener('click', e => { if (e.target.closest('a.card')) remember(inp.value); });
  draw(); setTimeout(() => inp.focus(), 50);
}

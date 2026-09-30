/* The event board: one column per status (kanban), cards move between columns with the "⋯" menu on every device,
   by drag and drop with a mouse, and by press-and-hold on touch. '#/board/stats' shows the pipeline numbers.
   Filters live in the hash: '#/board/f/<month>/<kind>/<source>/<status>' ('-' = none), so the statistics can link back.
   Logic in js/logic/pipeline.js; a move is an ordinary db.put (the history records it). Nothing is deleted here. */
import { t, lang, kindLabel, statusLabel } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, toast, empty, section, dial, relDay } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { matchClient } from '../logic/extra.js';
import { columns, filterCases, move, validTransitions, stats, sources, SOURCES, SOURCE_FIELD, ORDER, caseMonth } from '../logic/pipeline.js';

const { STATUS } = Office;
let search = '';
let showLost = false;
const LOCALE = { he: 'he-IL', fr: 'fr-FR', en: 'en-GB' };
const ICON = {
  back: '<svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

export function render(ctx) {
  if (ctx.id === 'stats') return renderStats(ctx);
  return renderBoard(ctx);
}

/* ---------------- filters in the hash ---------------- */
const dec = v => { try { return v && v !== '-' ? decodeURIComponent(v) : ''; } catch (e) { return ''; } };
const enc = v => (v ? encodeURIComponent(v) : '-');
function filtersOf(ctx) {
  const q = ctx.id === 'f' ? ctx.query || [] : [];
  return { month: dec(q[0]), kind: dec(q[1]), source: dec(q[2]), status: dec(q[3]) };
}
export function hashFor(f) {
  f = f || {};
  if (!f.month && !f.kind && !f.source && !f.status) return '#/board';
  return '#/board/f/' + [f.month, f.kind, f.source, f.status].map(enc).join('/');
}
function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!m) return ym || '';
  return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString(LOCALE[lang()] || 'he-IL', { month: 'short', year: 'numeric' });
}
const money = n => Office.money(n);

/* ---------------- the board ---------------- */
function renderBoard(ctx) {
  const { root } = ctx;
  const f = filtersOf(ctx);
  const all = db.list('cases');
  const kinds = Office.KINDS.filter(k => all.some(c => c.kind === k)).concat(all.map(c => c.kind).filter(k => k && Office.KINDS.indexOf(k) < 0).filter((k, i, a) => a.indexOf(k) === i));
  const months = all.map(caseMonth).filter(Boolean).filter((m, i, a) => a.indexOf(m) === i).sort();
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const chip = (on, data, label) => `<button class="${on ? 'on' : ''}" ${data}>${esc(label)}</button>`;
  const extra = [f.source ? ['source', t('src_' + f.source) === 'src_' + f.source ? f.source : t('src_' + f.source)] : null, f.status ? ['status', statusLabel(f.status)] : null].filter(Boolean);
  root.innerHTML = `
    <header class="top"><h1>${esc(t('board'))}</h1><a class="btn sm" href="#/board/stats">${esc(t('bStats'))}</a></header>
    <div class="bd-tools">
      <input id="bq" type="search" class="bd-search" placeholder="${esc(t('bSearch'))}" value="${esc(search)}" aria-label="${esc(t('bSearch'))}">
      ${kinds.length > 1 ? `<div class="tabs bd-chips" data-f="kind">${chip(!f.kind, 'data-v=""', t('bAllKinds'))}${kinds.map(k => chip(f.kind === k, `data-v="${esc(k)}"`, kindLabel(k))).join('')}</div>` : ''}
      ${months.length > 1 ? `<div class="tabs bd-chips" data-f="month">${chip(!f.month, 'data-v=""', t('bAllMonths'))}${months.map(m => chip(f.month === m, `data-v="${esc(m)}"`, monthLabel(m))).join('')}</div>` : ''}
      ${extra.length ? `<div class="tabs bd-chips">${extra.map(x => `<button class="on" data-f="${x[0]}" data-v="">${esc(x[1])} ×</button>`).join('')}<button data-clear>${esc(t('bClear'))}</button></div>` : ''}
      ${coarse ? `<p class="hint bd-hint">${esc(t('bHoldToMove'))}</p>` : ''}
    </div>
    <div class="bd-board" id="board"></div>`;

  const q = root.querySelector('#bq');
  q.oninput = () => { search = q.value; paint(); };
  root.querySelectorAll('.bd-chips button:not([data-clear])').forEach(b => {
    b.onclick = () => { const nf = Object.assign({}, f); nf[b.dataset.f || b.parentNode.dataset.f] = b.dataset.v || ''; location.hash = hashFor(nf); };
  });
  const clr = root.querySelector('[data-clear]'); if (clr) clr.onclick = () => { location.hash = '#/board'; };

  const boardEl = root.querySelector('#board');
  function paint() {
    const today = todayIso();
    const shown = filterCases(all, { kind: f.kind, month: f.month, source: f.source, q: search });
    let cols = columns(shown, db.list('quotes'), db.list('tasks'), db.list('links'), today);
    if (f.status) cols = cols.filter(c => c.status === f.status);
    if (!all.length) { boardEl.innerHTML = empty(t('bNoCases')); return; }
    boardEl.innerHTML = cols.map(col => colHtml(col, f.status ? true : showLost)).join('');
    wire(boardEl, cols);
  }
  paint();
}

function colHtml(col, lostOpen) {
  const lost = col.status === STATUS.lost;
  const collapsed = lost && !lostOpen;
  return `<section class="bd-col${lost ? ' lost' : ''}${collapsed ? ' collapsed' : ''}" data-status="${esc(col.status)}">
    <header class="bd-col-h"><h2>${esc(statusLabel(col.status))}</h2><span class="badge muted count">${col.count}</span>
      ${lost ? `<button class="btn sm ghost" data-toggle>${esc(collapsed ? t('bShowLost') : t('bHideLost'))}</button>` : ''}
      <button class="icon bd-add" data-add aria-label="${esc(t('bAddHere'))}" title="${esc(t('bAddHere'))}">${ICON.plus}</button></header>
    ${collapsed ? '' : `<div class="bd-cards">${col.cases.length ? col.cases.map(cardHtml).join('') : `<p class="empty bd-empty">${esc(t('bEmptyCol'))}</p>`}</div>
    <footer class="bd-col-f"><span>${col.count}</span><span>${col.total ? esc(t('bColTotal')) + ' <span class="count">' + esc(money(col.total)) + '</span>' : ''}</span></footer>`}
  </section>`;
}

function cardHtml(c) {
  const when = c.date
    ? Office.fmt(c.date) + (c.daysToEvent != null && c.daysToEvent >= 0 ? ' · ' + relDay(c.date) : c.daysToEvent != null ? ' · ' + t('bDaysAgo', { n: -c.daysToEvent }) : '')
    : t('bNoDate');
  const src = c[SOURCE_FIELD] ? (t('src_' + c[SOURCE_FIELD]) === 'src_' + c[SOURCE_FIELD] ? c[SOURCE_FIELD] : t('src_' + c[SOURCE_FIELD])) : '';
  return `<article class="card bd-card" draggable="true" data-id="${esc(c.id)}">
    <div class="row between bd-card-h"><a class="title" href="#/case/${esc(c.id)}">${esc(c.client || t('unknownClient'))}</a>
      <button class="icon bd-menu" data-menu aria-label="${esc(t('bMenu'))}">⋯</button></div>
    <div class="sub">${[kindLabel(c.kind), when, c.place, c.participants ? c.participants + ' ' + t('people') : ''].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="row bd-meta">
      ${c.quoteTotal ? `<span class="badge ok count">${esc(money(c.quoteTotal))}</span>` : ''}
      ${src ? `<span class="badge muted">${esc(src)}</span>` : ''}
      ${c.overdueTasks ? `<span class="badge warn">${esc(t('bOverdue', { n: c.overdueTasks }))}</span>` : ''}
      ${c.silentSuppliers ? `<span class="badge">${esc(t('bSilent', { n: c.silentSuppliers }))}</span>` : ''}
      ${c.phone ? `<button class="btn sm bd-dial" data-dial="${esc(c.phone)}">${ICON.phone}<span class="ltr">${esc(phonePretty(c.phone))}</span></button>` : ''}
    </div></article>`;
}

/* ---------------- moving ---------------- */
function doMove(id, to) {
  const c = db.get('cases', id);
  if (!c) return false;
  if (c.status === to) { toast(t('bSameCol')); return false; }
  const patch = move(c, to, todayIso());
  if (!patch) { toast(t('bCantMove', { from: statusLabel(c.status), to: statusLabel(to) }), 3000); return false; }
  db.put('cases', patch);
  toast(t('bMoved', { status: statusLabel(to) }));
  return true;
}

function wire(boardEl, cols) {
  boardEl.querySelectorAll('[data-dial]').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); dial(b.dataset.dial); }; });
  boardEl.querySelectorAll('[data-menu]').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); menu(b.closest('.bd-card').dataset.id); }; });
  boardEl.querySelectorAll('[data-toggle]').forEach(b => { b.onclick = () => { showLost = !showLost; b.closest('.bd-col').outerHTML = colHtml(cols.find(c => c.status === STATUS.lost), showLost); wire(boardEl, cols); }; });
  boardEl.querySelectorAll('[data-add]').forEach(b => { b.onclick = () => addTo(b.closest('.bd-col').dataset.status); });

  // mouse: HTML5 drag and drop
  boardEl.querySelectorAll('.bd-card').forEach(card => {
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  boardEl.querySelectorAll('.bd-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) doMove(id, col.dataset.status); });
  });

  // touch: press and hold, then slide the card over another column
  let hold = null, lifted = null, start = null;
  const colAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.bd-col') : null; };
  const clearOver = () => boardEl.querySelectorAll('.bd-col.over').forEach(c => c.classList.remove('over'));
  const drop = () => {
    clearTimeout(hold); hold = null;
    if (!lifted) return;
    const target = lifted.target;
    const id = lifted.el.dataset.id;
    lifted.el.classList.remove('lifted'); lifted.el.style.transform = '';
    clearOver(); lifted = null;
    if (target && !doMove(id, target)) { /* stays where it was */ }
  };
  boardEl.addEventListener('touchstart', e => {
    const card = e.target.closest('.bd-card'); if (!card || e.target.closest('button,a')) return;
    const tch = e.touches[0]; start = { x: tch.clientX, y: tch.clientY };
    clearTimeout(hold);
    hold = setTimeout(() => { hold = null; lifted = { el: card, x: start.x, y: start.y, target: null }; card.classList.add('lifted'); if (navigator.vibrate) navigator.vibrate(20); }, 450);
  }, { passive: true });
  boardEl.addEventListener('touchmove', e => {
    const tch = e.touches[0];
    if (!lifted) { if (hold && start && Math.hypot(tch.clientX - start.x, tch.clientY - start.y) > 10) { clearTimeout(hold); hold = null; } return; }
    e.preventDefault();
    lifted.el.style.transform = `translate(${tch.clientX - lifted.x}px, ${tch.clientY - lifted.y}px)`;
    const col = colAt(tch.clientX, tch.clientY);
    clearOver();
    lifted.target = col ? col.dataset.status : null;
    if (col) col.classList.add('over');
  }, { passive: false });
  boardEl.addEventListener('touchend', drop);
  boardEl.addEventListener('touchcancel', drop);
  boardEl.addEventListener('contextmenu', e => { if (lifted || hold) e.preventDefault(); });
}

/** The card menu: move to another column, set where the lead came from, open the case. Works on every device. */
function menu(id) {
  const c = db.get('cases', id); if (!c) return;
  const ok = validTransitions(c.status);
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  const srcLabel = s => (t('src_' + s) === 'src_' + s ? s : t('src_' + s));
  const known = SOURCES.concat(sources(db.list('cases')).map(x => x.source).filter(s => SOURCES.indexOf(s) < 0));
  wrap.innerHTML = `<div class="modal-card"><h2>${esc(c.client || t('unknownClient'))}</h2>
    <div class="modal-body">
      <h3>${esc(t('bMoveTo'))}</h3>
      <div class="chips" data-status>${ORDER.map(s => `<button type="button" class="chip${s === c.status ? ' on' : ''}" data-v="${esc(s)}"${s !== c.status && ok.indexOf(s) < 0 ? ' disabled' : ''}>${esc(statusLabel(s))}</button>`).join('')}</div>
      <h3>${esc(t('bSource'))}</h3>
      <div class="chips" data-source>${known.map(s => `<button type="button" class="chip${c[SOURCE_FIELD] === s ? ' on' : ''}" data-v="${esc(s)}">${esc(srcLabel(s))}</button>`).join('')}</div>
    </div>
    <div class="row end"><a class="btn" href="#/case/${esc(c.id)}">${esc(t('bOpenCase'))}</a><button type="button" class="btn ghost" data-x="cancel">${esc(t('cancel'))}</button></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.dataset.x === 'cancel') close(); });
  wrap.querySelectorAll('[data-status] .chip').forEach(b => { b.onclick = () => { if (b.dataset.v === c.status) return; if (doMove(c.id, b.dataset.v)) close(); }; });
  wrap.querySelectorAll('[data-source] .chip').forEach(b => {
    b.onclick = () => {
      const cur = db.get('cases', c.id) || c;
      const v = cur[SOURCE_FIELD] === b.dataset.v ? '' : b.dataset.v;
      db.put('cases', { id: c.id, [SOURCE_FIELD]: v });
      wrap.querySelectorAll('[data-source] .chip').forEach(x => x.classList.toggle('on', x.dataset.v === v));
      toast(t('bSourceSaved'));
    };
  });
}

/** "+" on a column: the lead column opens the inquiry flow; the others create a case directly in that status. */
async function addTo(status) {
  if (status === STATUS.lead) { location.hash = '#/lead'; return; }
  const s = db.settings();
  const r = await dialog(t('bNewIn', { status: statusLabel(status) }),
    field('client', t('fClient'), '') + `<div class="grid2">${field('contact', t('fName'), '')}${field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })}
    ${field('kind', t('fKind'), Office.KINDS[0], { type: 'select', options: Office.KINDS.map(k => [k, kindLabel(k)]) })}${field('date', t('fDate'), '', { type: 'date' })}
    ${field('place', t('fPlace'), '')}${field('participants', t('fParticipants'), '', { type: 'number', inputmode: 'numeric' })}</div>`, { ok: t('save') });
  if (!r || !(r.client || r.contact)) return;
  const today = todayIso();
  const existing = matchClient({ client: r.client, phone: r.phone }, db.list('clients'));
  const clientId = existing ? existing.id : db.put('clients', { name: r.client || r.contact, contact: r.contact, phone: r.phone, type: '' });
  const cs = { clientId, client: r.client || (existing && existing.name) || r.contact, contact: r.contact, phone: r.phone, kind: r.kind, date: r.date, place: r.place, participants: r.participants,
    status, opened: today, lang: s.msgLang || 'he' };
  if (status === STATUS.quoted) cs.quotedAt = today;
  if (status === STATUS.won || status === STATUS.done) cs.wonAt = today;
  if (status === STATUS.done) cs.doneAt = today;
  if (status === STATUS.lost) cs.lostAt = today;
  db.put('cases', cs);
  toast(t('bCreated'));
}

/* ---------------- statistics ---------------- */
function renderStats({ root }) {
  const cases = db.list('cases');
  const s = stats(cases, db.list('quotes'), db.list('payments'), todayIso());
  const srcLabel = v => (v ? (t('src_' + v) === 'src_' + v ? v : t('src_' + v)) : t('bNoSource'));
  const n = v => `<span class="count">${esc(v == null ? '' : v)}</span>`;
  const pct = v => (v == null ? '' : `<span class="count">${v}%</span>`);
  const link = (href, inner) => `<a class="bd-num" href="${esc(href)}">${inner}</a>`;
  const fun = s.funnel, max = Math.max(1, fun.leads);
  const funnelRows = [['bLeads', fun.leads, hashFor({}), 'lead'], ['bQuoted', fun.quoted, hashFor({ status: STATUS.quoted }), 'quoted'], ['bWon', fun.won, hashFor({ status: STATUS.won }), 'won'], ['bDone', fun.done, hashFor({ status: STATUS.done }), 'done']];
  const funnel = `<div class="bd-funnel">${funnelRows.map(r => `<div class="bd-frow"><span class="bd-flabel">${esc(t(r[0]))}</span>
    <span class="bd-bar ${r[3]}"><i style="width:${Math.round(r[1] / max * 100)}%"></i></span>${link(r[2], n(r[1]))}</div>`).join('')}
    <p class="hint">${esc(t('bConv'))}: ${pct(s.totals.conversion) || '–'} · ${esc(t('bConvHint'))}${s.totals.avgDays != null ? ` · ${esc(t('bAvgDays'))}: ${n(s.totals.avgDays)}` : ''}</p></div>`;
  const best = s.best
    ? `<a class="card tap bd-best" href="${esc(hashFor({ month: s.best.month }))}"><div class="big">${esc(monthLabel(s.best.month))}</div><div class="sub">${esc(t('bRevenue'))} <b class="count">${esc(money(s.best.revenue))}</b> · ${esc(t('bWon'))} ${n(s.best.won)}</div></a>`
    : empty(t('bBestNone'));
  const head = cols => `<thead><tr>${cols.map(c => `<th${c[1] ? ' class="n"' : ''}${c[2] ? ` title="${esc(c[2])}"` : ''}>${esc(c[0])}</th>`).join('')}</tr></thead>`;
  const monthRows = s.months.slice().reverse();
  const monthly = `<div class="tablewrap"><table class="bd-table bd-monthly">${head([[t('bMonth')], [t('bLeads'), 1], [t('bQuoted'), 1], [t('bWon'), 1], [t('bLost'), 1], [t('bDone'), 1], [t('bConv'), 1, t('bConvHint')], [t('bAvgDays'), 1, t('bAvgDaysHint')], [t('bRevenue'), 1, t('bRevenueHint')]])}
    <tbody>${monthRows.map(r => { const dim = !(r.leads || r.quoted || r.won || r.lost || r.done || r.revenue); const h = hashFor({ month: r.month }); return `<tr class="${dim ? 'bd-dim' : ''}"><td>${link(h, esc(monthLabel(r.month)))}</td>
      <td class="n">${link(h, n(r.leads))}</td><td class="n">${n(r.quoted)}</td><td class="n">${link(hashFor({ month: r.month, status: STATUS.won }), n(r.won))}</td><td class="n">${link(hashFor({ month: r.month, status: STATUS.lost }), n(r.lost))}</td><td class="n">${link(hashFor({ month: r.month, status: STATUS.done }), n(r.done))}</td>
      <td class="n">${pct(r.conversion)}</td><td class="n">${n(r.avgDays)}</td><td class="n">${r.revenue ? n(money(r.revenue)) : ''}</td></tr>`; }).join('')}
    <tr class="bd-total"><td>${esc(t('bTotalRow'))}</td><td class="n">${n(s.totals.leads)}</td><td class="n">${n(s.totals.quoted)}</td><td class="n">${n(s.totals.won)}</td><td class="n">${n(s.totals.lost)}</td><td class="n">${n(s.totals.done)}</td><td class="n">${pct(s.totals.conversion)}</td><td class="n">${n(s.totals.avgDays)}</td><td class="n">${s.totals.revenue ? n(money(s.totals.revenue)) : ""}</td></tr></tbody></table></div>`;
  const breakdown = (rows, key, label, hrefOf) => rows.length ? `<div class="tablewrap"><table class="bd-table">${head([[label], [t('bLeads'), 1], [t('bWon'), 1], [t('bLost'), 1], [t('bConv'), 1, t('bConvHint')], [t('bRevenue'), 1, t('bRevenueHint')]])}
    <tbody>${rows.map(r => `<tr><td>${link(hrefOf(r), esc(key(r)))}</td><td class="n">${link(hrefOf(r), n(r.leads))}</td><td class="n">${n(r.won)}</td><td class="n">${n(r.lost)}</td><td class="n">${pct(r.conversion)}</td><td class="n">${r.revenue ? n(money(r.revenue)) : ''}</td></tr>`).join('')}</tbody></table></div>` : empty(t('bNoStats'));
  root.innerHTML = `
    <header class="top"><a class="icon" href="#/board" aria-label="${esc(t('bBack'))}">${ICON.back}</a><h1>${esc(t('bStats'))}</h1></header>
    <p class="hint">${esc(t('bStatsIntro'))}</p>
    ${cases.length ? `<div class="bd-stats">
      <div class="bd-stats-a">
        ${section(t('bFunnel'), funnel)}
        ${section(t('bBest'), best)}
        ${section(t('bByKind'), breakdown(s.byKind, r => kindLabel(r.kind), t('bKind'), r => hashFor({ kind: r.kind })))}
        ${section(t('bBySource'), breakdown(s.bySource, r => srcLabel(r.source), t('bSource'), r => hashFor({ source: r.source })))}
      </div>
      <div class="bd-stats-b">${section(t('bMonthly'), monthly)}</div>
    </div>` : empty(t('bNoStats'))}`;
}

/* Budget and profitability of one event (a tab on the event card, and #/budget/<caseId> full screen), and the overview of all
   active events (#/budget). Every amount is before VAT; the VAT total is shown once. Nothing is sent by the app. */
import { t } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, section, empty, dialog, confirmDialog, toast, openWhatsApp, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { contractTotals } from '../logic/contracts.js';
import { registerCaseTab } from '../caseTabs.js';
import { DEFAULTS } from '../data/defaults.js';
import { supplierPaidMessage } from '../logic/approvals.js';
import { payStatusLabel } from '../labels.js';
import { CATEGORIES, LINE_STATUS, LINE_STATUSES, linesFromCase, mergeLines, summary, paymentSchedule, attachPaymentsToCases, overviewRows, invoiceAskText, costOf, priceOf, plannedOf, paidOf, qtyOf } from '../logic/budget.js';

let sort = 'date';
let attachedOnce = false;
const catLabel = c => { const k = 'bgc_' + c; const v = t(k); return v === k ? c : v; };
const stLabel = s => t('bgSt_' + (LINE_STATUSES.includes(s) ? s : 'estimate'));
const M = n => Office.money(n);
const N = n => `<span class="bg-n">${esc(M(n))}</span>`;
const signerOf = s => s.signer || DEFAULTS.signer;
const BACK = (href, label) => `<a class="icon" href="${href}" aria-label="${esc(label)}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;

/** Seed payments (and any payment added without a case) get their case once per session: idempotent, nothing else changes. */
function attachOnce() {
  if (attachedOnce) return; attachedOnce = true;
  const patches = attachPaymentsToCases(db.list('payments'), db.list('cases'));
  if (!patches.length) return;
  setTimeout(() => { patches.forEach(p => db.put('payments', { id: p.id, caseId: p.caseId })); toast(t('bgAttached', { n: patches.length }), 3500); }, 0);
}

/* ---------------- the screen: overview, or one case in full ---------------- */
export function render({ root, id }) {
  attachOnce();
  const s = db.settings();
  if (id) {
    const c = db.get('cases', id);
    if (!c) { root.innerHTML = `<header class="top">${BACK('#/budget', t('back'))}<h1>${esc(t('bgTitle'))}</h1></header>` + empty(t('noResults')); return; }
    root.innerHTML = `<header class="top">${BACK('#/case/' + esc(id) + '/budget', t('bgBackToCase'))}<h1>${esc(t('bgTitle'))} · ${esc(c.client || t('unknownClient'))}</h1></header>
      <div class="sub">${[c.kind, c.date ? Office.fmt(c.date) : '', c.place].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="stack sec" id="bgBody"></div>`;
    draw(root.querySelector('#bgBody'), c, s, true);
    return;
  }
  const { rows, totals } = overviewRows(db.list('cases'), db.list('budget'), db.list('payments'), s.vat, sort, todayIso());
  const chip = (key, label) => `<button type="button" class="chip ${sort.replace('-', '') === key ? 'on' : ''}" data-sort="${key}">${esc(label)}${sort === '-' + key ? ' ↓' : sort === key ? ' ↑' : ''}</button>`;
  const pctBadge = r => `<span class="badge ${r.margin < 0 ? 'late' : r.marginPct >= 10 ? 'ok' : 'warn'}"><span class="bg-n">${esc(r.marginPct)}%</span></span>`;
  root.innerHTML = `<header class="top">${BACK('#/more', t('back'))}<h1>${esc(t('bgOverview'))}</h1></header>
    <div class="chips">${chip('date', t('bgSortDate'))}${chip('margin', t('bgSortMargin'))}</div>
    <div class="bg-stats sec">${[['bgCost', totals.cost], ['bgPrice', totals.price], ['bgMargin', totals.margin, totals.margin < 0 ? 'neg' : 'pos', totals.marginPct + '%'], ['bgReceived', totals.received], ['bgOpen', totals.open]].map(x => `<div class="card ${x[2] || ''}"><b>${esc(M(x[1]))}</b><span>${esc(t(x[0]))}${x[3] ? ' · <span class="bg-n">' + esc(x[3]) + '</span>' : ''}</span></div>`).join('')}</div>
    ${rows.length ? `
    <div class="tablewrap bg-desk-only sec"><table class="cmp bg-table"><thead><tr><th>${esc(t('bgEvent'))}</th><th>${esc(t('date'))}</th><th>${esc(t('bgCost'))}</th><th>${esc(t('bgPrice'))}</th><th>${esc(t('bgMargin'))}</th><th>${esc(t('bgReceived'))}</th><th>${esc(t('bgOpen'))}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="bg-link" data-href="#/case/${esc(r.id)}/budget"><td><a href="#/case/${esc(r.id)}/budget">${esc(r.client)}</a>${r.kind ? ` <span class="sub">· ${esc(r.kind)}</span>` : ''}${r.warnings ? ` <span class="badge warn" title="${esc(t('bgWarnings'))}">${r.warnings}</span>` : ''}</td><td class="n">${esc(r.date ? Office.fmt(r.date) : '')}</td><td class="n">${esc(M(r.cost))}</td><td class="n">${esc(M(r.price))}</td><td class="n">${esc(M(r.margin))} ${pctBadge(r)}</td><td class="n">${esc(M(r.received))}</td><td class="n${r.open > 0 ? ' bg-late' : ''}">${esc(M(r.open))}</td></tr>`).join('')}
      <tr class="bg-total"><td>${esc(t('bgTotal'))}</td><td></td><td class="n">${esc(M(totals.cost))}</td><td class="n">${esc(M(totals.price))}</td><td class="n">${esc(M(totals.margin))} <span class="bg-n">${esc(totals.marginPct)}%</span></td><td class="n">${esc(M(totals.received))}</td><td class="n">${esc(M(totals.open))}</td></tr></tbody></table></div>
    <div class="list sec bg-cards">${rows.map(r => `<a class="card tap" href="#/case/${esc(r.id)}/budget"><div class="row between"><span class="title">${esc(r.client)}</span>${pctBadge(r)}</div>
      <div class="sub">${[r.kind, r.date ? Office.fmt(r.date) : ''].filter(Boolean).map(esc).join(' · ')}${r.warnings ? ` · <span class="badge warn" title="${esc(t('bgWarnings'))}">${r.warnings}</span>` : ''}</div>
      <div class="sub">${esc(t('bgCost'))} ${N(r.cost)} · ${esc(t('bgPrice'))} ${N(r.price)} · ${esc(t('bgMargin'))} ${N(r.margin)}</div>
      <div class="sub">${esc(t('bgReceived'))} ${N(r.received)} · ${esc(t('bgOpen'))} <span class="${r.open > 0 ? 'bg-late' : ''}">${N(r.open)}</span></div></a>`).join('')}</div>` : empty(t('bgNoActive'))}`;
  root.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; sort = sort === k ? '-' + k : k; render({ root, id }); });
  root.querySelectorAll('tr.bg-link').forEach(tr => { tr.onclick = e => { if (e.target.closest('a')) return; location.hash = tr.dataset.href; }; });
}

/* ---------------- the tab on the event card ---------------- */
registerCaseTab({ key: 'budget', label: () => t('tBudget'), render(body, c, s) { attachOnce(); draw(body, c, s, false); } });

function linesOf(c) {
  const order = {}; CATEGORIES.forEach((k, i) => { order[k] = i; });
  const rank = l => (l.category in order ? order[l.category] : CATEGORIES.length);
  return db.list('budget', l => l.caseId === c.id).sort((a, b) => rank(a) - rank(b) || String(a.created || '').localeCompare(String(b.created || '')));
}

function draw(body, c, s, full) {
  const lines = linesOf(c);
  const pays = db.list('payments', p => p.caseId === c.id);
  const today = todayIso();
  const sm = summary(lines, pays, s.vat, c, today);
  const sched = paymentSchedule(lines, pays, c, today);
  const sups = {}; db.list('suppliers').forEach(x => { sups[x.id] = x; });
  const supName = l => (sups[l.supplierId] || {}).name || '';
  const warnText = w => t('bgW_' + w.code, { item: w.item || '', cost: M(w.cost), price: M(w.price), date: w.date ? Office.fmt(w.date) : '', amount: M(w.amount), pct: w.pct, budget: M(w.budget) });
  const stat = (key, val, cls, extra) => `<div class="card ${cls || ''}"><b>${esc(M(val))}</b><span>${esc(t(key))}${extra ? ' · <span class="bg-n">' + esc(extra) + '</span>' : ''}</span></div>`;
  const contract = db.list('contracts', x => x.caseId === c.id).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')))[0];
  const ctTot = contract ? contractTotals(contract) : null;
  const head = [c.client, c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ');
  // the lines and the schedule as plain text, for a message or a spreadsheet
  const linesText = t('bgLines') + ' · ' + head + '\n' + lines.map(l => '• ' + [l.item || catLabel(l.category), supName(l), t('bgCost') + ' ' + M(costOf(l)), t('bgPrice') + ' ' + M(priceOf(l)), stLabel(l.status), l.dueDate && l.status !== LINE_STATUS.paid ? t('bgDue') + ' ' + Office.fmt(l.dueDate) : ''].filter(Boolean).join(' · ')).join('\n')
    + '\n' + t('bgTotal') + ': ' + t('bgCost') + ' ' + M(sm.totalCost) + ' · ' + t('bgPrice') + ' ' + M(sm.clientPrice) + ' · ' + t('bgMargin') + ' ' + M(sm.margin) + ' (' + sm.marginPct + '%)';
  const schedText = t('bgSchedule') + ' · ' + head + '\n' + sched.map(r => '• ' + [r.date ? Office.fmt(r.date) : t('bgNoDate'), r.kind === 'client' ? t('bgClient') : t('bgSupplierRow'), r.label, r.kind === 'supplier' && r.supplierId && sups[r.supplierId] ? sups[r.supplierId].name : '', (r.kind === 'client' ? '+' : '−') + M(r.amount), r.kind === 'client' ? payStatusLabel(r.status) : r.paid ? t('bgPaidShort') : stLabel(r.status), r.overdue ? t('bgOverdue') : '', t('bgBalance') + ' ' + M(r.balance)].filter(Boolean).join(' · ')).join('\n');
  const catRows = sm.byCategory.map(cat => {
    const mine = lines.filter(l => (l.category || 'אחר') === cat.category);
    return `<div class="bg-cat"><span class="title">${esc(catLabel(cat.category))}</span><span class="sub">${esc(t('bgCost'))} ${N(cat.cost)} · ${esc(t('bgPrice'))} ${N(cat.price)} · ${esc(t('bgMargin'))} <span class="${cat.margin < 0 ? 'bg-late' : ''}">${N(cat.margin)}</span></span></div>
      ${mine.map(l => { const cost = costOf(l), price = priceOf(l), mg = price - cost; return `<div class="card bg-row" data-l="${esc(l.id)}">
        <div class="bg-cell bg-item"><span class="title">${esc(l.item || catLabel(l.category))}</span><div class="sub">${[supName(l), l.note].filter(Boolean).map(esc).join(' · ')}</div>
          <div class="sub bg-sub-mobile">${esc(t('bgCost'))} ${N(cost)} · ${esc(t('bgPrice'))} ${N(price)} · ${esc(t('bgMargin'))} <span class="${mg < 0 ? 'bg-late' : ''}">${N(mg)}</span>${l.dueDate && l.status !== LINE_STATUS.paid ? ` · ${esc(t('bgDue'))} <span class="bg-n${l.dueDate < today ? ' bg-late' : ''}">${esc(Office.fmt(l.dueDate))}</span>` : ''}</div></div>
        <div class="bg-cell"><span class="badge ${l.status === LINE_STATUS.paid ? 'ok' : l.status === LINE_STATUS.approved ? 'ok' : l.status === LINE_STATUS.quoted ? 'warn' : 'muted'}">${esc(stLabel(l.status))}</span>${qtyOf(l) !== 1 ? ` <span class="sub bg-n">×${esc(qtyOf(l))}</span>` : ''}</div>
        <div class="bg-cell bg-desk bg-n">${plannedOf(l) ? esc(M(plannedOf(l))) : ''}</div>
        <div class="bg-cell bg-desk bg-n">${cost ? esc(M(cost)) : ''}</div>
        <div class="bg-cell bg-desk bg-n">${price ? esc(M(price)) : ''}</div>
        <div class="bg-cell bg-desk bg-n ${mg < 0 ? 'bg-late' : ''}">${cost || price ? esc(M(mg)) : ''}</div>
        <div class="bg-cell bg-desk bg-n${l.dueDate && l.status !== LINE_STATUS.paid && l.dueDate < today ? ' bg-late' : ''}">${l.status === LINE_STATUS.paid ? esc(t('bgPaidShort')) + (l.paidAt ? ' ' + esc(Office.fmt(l.paidAt)) : '') : l.dueDate ? esc(Office.fmt(l.dueDate)) : ''}</div></div>`; }).join('')}`;
  }).join('');
  body.innerHTML = `
    <div class="bg-stats">${stat('bgCost', sm.totalCost)}${stat('bgPrice', sm.clientPrice)}${stat('bgMargin', sm.margin, sm.margin < 0 ? 'neg' : 'pos', sm.marginPct + '%')}${stat('bgReceived', sm.received)}${stat('bgOpen', sm.open, sm.open > 0 ? 'neg' : '')}</div>
    <p class="hint">${esc(t('bgVatLine', { rate: sm.vatRate, vat: M(sm.vat), gross: M(sm.gross) }))}${sm.supplierDue ? ' · ' + esc(t('bgOpenVsSuppliers')) + ' ' : ''}${sm.supplierDue ? N(sm.supplierDue) : ''}</p>
    ${sm.warnings.length ? `<div class="warnbox"><b>${esc(t('bgWarnings'))}</b><ul class="open">${sm.warnings.map(w => `<li>${esc(warnText(w))}</li>`).join('')}</ul></div>` : ''}
    <div class="row"><button class="btn primary sm" id="bgAdd">+ ${esc(t('bgAddLine'))}</button><button class="btn sm" id="bgRefresh">${esc(t('bgRefresh'))}</button><button class="btn sm wa" id="bgAsk">${esc(t('bgAskRoy'))}</button>${sm.open > 0 ? copyBtn(invoiceAskText(c, sm.open), { label: t('bgCopyAsk') }) : ''}<button class="btn sm" id="bgPay">${esc(t('bgPaySupplier'))}</button>${full ? `<a class="btn sm ghost" href="#/budget">${esc(t('bgOverview'))}</a>` : `<a class="btn sm ghost" href="#/budget/${esc(c.id)}">${esc(t('bgFull'))}</a>`}
      ${contract ? `<a class="btn sm ghost" href="#/contract/${esc(contract.id)}">${esc(t('bgContract'))}${ctTot.hasPrice ? ' · ' : ''}${ctTot.hasPrice ? N(ctTot.net) : ''}</a>` : ''}</div>
    ${section(t('bgLines'), lines.length ? `<div class="bg-lines"><div class="bg-head"><span>${esc(t('bgItem'))}</span><span>${esc(t('bgStatus'))}</span><span>${esc(t('bgPlanned'))}</span><span>${esc(t('bgCost'))}</span><span>${esc(t('bgPrice'))}</span><span>${esc(t('bgMargin'))}</span><span>${esc(t('bgDue'))}</span></div>${catRows}
      <div class="bg-cat bg-total"><span class="title">${esc(t('bgTotal'))}</span><span class="sub">${esc(t('bgCost'))} ${N(sm.totalCost)} · ${esc(t('bgPrice'))} ${N(sm.clientPrice)} · ${esc(t('bgMargin'))} <span class="${sm.margin < 0 ? 'bg-late' : ''}">${N(sm.margin)}</span> (<span class="bg-n">${esc(sm.marginPct)}%</span>)</span></div></div>` : `<p class="hint">${esc(t('bgNoLines'))}</p>`, lines.length ? copyBtn(linesText, { icon: true }) : '')}
    ${section(t('bgSchedule'), sched.length ? `<div class="bg-sched">${sched.map(r => `<div class="card bg-srow${r.overdue ? ' late' : ''}${r.paid ? ' paid' : ''}" ${r.kind === 'supplier' ? `data-l="${esc(r.id)}"` : ''}>
        <span class="bg-n bg-date">${esc(r.date ? Office.fmt(r.date) : t('bgNoDate'))}</span>
        <span class="bg-who"><span class="badge ${r.kind === 'client' ? '' : 'muted'}">${esc(r.kind === 'client' ? t('bgClient') : t('bgSupplierRow'))}</span> <span class="title">${esc(r.label)}</span>${r.kind === 'supplier' && r.supplierId && sups[r.supplierId] ? ` <span class="sub">· ${esc(sups[r.supplierId].name)}</span>` : ''}</span>
        <span class="bg-n bg-amt">${esc((r.kind === 'client' ? '+' : '−') + M(r.amount))}</span>
        <span class="bg-st"><span class="badge ${r.paid ? 'ok' : r.overdue ? 'late' : 'warn'}">${esc(r.kind === 'client' ? payStatusLabel(r.status) : r.paid ? t('bgPaidShort') : stLabel(r.status))}${r.overdue ? ' · ' + esc(t('bgOverdue')) : ''}</span></span>
        <span class="bg-n bg-bal bg-desk">${esc(t('bgBalance'))} ${esc(M(r.balance))}</span></div>`).join('')}</div>` : `<p class="hint">${esc(t('bgNoSchedule'))}</p>`, sched.length ? copyBtn(schedText, { icon: true }) : '')}`;

  body.querySelector('#bgAdd').onclick = () => editLine(c, null, sups);
  body.querySelectorAll('.bg-row[data-l], .bg-srow[data-l]').forEach(el => { el.onclick = e => { if (e.target.closest('a,button')) return; const l = db.get('budget', el.dataset.l); if (l) editLine(c, l, sups); }; });
  body.querySelector('#bgRefresh').onclick = () => {
    const cand = linesFromCase(c, db.list('links'), db.list('quotes'), db.list('suppliers'));
    const { add, update } = mergeLines(linesOf(c), cand);
    add.forEach(x => db.put('budget', x)); update.forEach(x => db.put('budget', x));
    toast(add.length || update.length ? t('bgRefreshed', { n: add.length, m: update.length }) : t('bgNothingNew'), 3000);
  };
  body.querySelector('#bgAsk').onclick = () => {
    if (!(sm.open > 0)) { toast(t('bgNothingOpen'), 3500); return; }
    sessionStorage.setItem('bakasun.ask', invoiceAskText(c, sm.open)); sessionStorage.removeItem('bakasun.askMic');
    location.hash = '#/assist/from-today';
  };
  body.querySelector('#bgPay').onclick = () => paySupplier(c, s, lines, sups);
}

/* ---------------- one line ---------------- */
async function editLine(c, l, sups) {
  l = l || { caseId: c.id, category: 'אחר', item: '', supplierId: '', linkId: '', planned: '', cost: '', price: '', qty: 1, unit: '', status: LINE_STATUS.estimate, note: '', dueDate: '', paidAt: '', paidAmount: '' };
  const linked = db.list('links', x => x.caseId === c.id).map(x => x.supplierId).filter((v, i, a) => v && a.indexOf(v) === i);
  const all = Object.values(sups).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const supOpts = [['', t('bgNoSupplier')]].concat(linked.map(id => sups[id]).filter(Boolean).map(x => [x.id, x.name + ' ★'])).concat(all.filter(x => !linked.includes(x.id)).map(x => [x.id, x.name]));
  const r = await dialog(l.id ? (l.item || catLabel(l.category)) : t('bgAddLine'), `<div class="grid2">${field('category', t('bgCategory'), l.category || 'אחר', { type: 'select', options: CATEGORIES.map(k => [k, catLabel(k)]) })}${field('status', t('bgStatus'), l.status || LINE_STATUS.estimate, { type: 'select', options: LINE_STATUSES.map(k => [k, stLabel(k)]) })}</div>
    ${field('item', t('bgItem'), l.item || '')}
    <div class="grid2">${field('supplierId', t('bgSupplier'), l.supplierId || '', { type: 'select', options: supOpts })}${field('qty', t('bgQty'), l.qty == null || l.qty === '' ? 1 : l.qty, { type: 'number', inputmode: 'decimal' })}
      ${field('planned', t('bgPlannedF'), l.planned == null ? '' : l.planned, { type: 'number', inputmode: 'decimal' })}${field('cost', t('bgCostF'), l.cost == null ? '' : l.cost, { type: 'number', inputmode: 'decimal' })}
      ${field('price', t('bgPriceF'), l.price == null ? '' : l.price, { type: 'number', inputmode: 'decimal' })}${field('unit', t('bgUnit'), l.unit || '')}
      ${field('dueDate', t('bgDue'), l.dueDate || '', { type: 'date' })}${field('paidAt', t('bgPaidAt'), l.paidAt || '', { type: 'date' })}${field('paidAmount', t('bgPaidAmount'), l.paidAmount == null ? '' : l.paidAmount, { type: 'number', inputmode: 'decimal' })}</div>
    ${field('note', t('bgNote'), l.note || '')}<p class="hint">${esc(t('bgLineHint'))}</p>
    ${l.id ? `<div class="row end"><button type="button" class="btn danger sm" data-delbudget="${esc(l.id)}">${esc(t('delete'))}</button></div>` : ''}`);
  if (!r) return;
  if (!String(r.item || '').trim() && !r.category) return;
  r.item = String(r.item || '').trim();
  if (r.status === LINE_STATUS.paid && !r.paidAt) r.paidAt = todayIso();
  if (r.paidAt && r.status !== LINE_STATUS.paid && Office.num(r.paidAmount) >= Office.num(r.cost) && Office.num(r.cost) > 0) r.status = LINE_STATUS.paid;
  db.put('budget', Object.assign(l.id ? { id: l.id } : { caseId: c.id, linkId: l.linkId || '' }, r));
  toast(t('saved'));
}

// deleting one line: from inside the edit dialog, always with a confirmation
let wired = false;
function wireDelete() {
  if (wired) return; wired = true;
  document.addEventListener('click', async e => {
    const b = e.target && e.target.closest && e.target.closest('[data-delbudget]'); if (!b) return;
    const l = db.get('budget', b.dataset.delbudget); if (!l) return;
    if (await confirmDialog(t('bgLineDelete', { item: l.item || catLabel(l.category) }))) { db.remove('budget', l.id); toast(t('bgDeleted')); const f = b.closest('form'); if (f) { const x = f.querySelector('[data-x=cancel]'); if (x) x.click(); } }
  });
}
wireDelete();

/* ---------------- "the payment was sent, please send the invoice" to a supplier ---------------- */
async function paySupplier(c, s, lines, sups) {
  const cands = lines.filter(l => l.supplierId && sups[l.supplierId] && costOf(l) > 0).sort((a, b) => (a.status === LINE_STATUS.paid ? 1 : 0) - (b.status === LINE_STATUS.paid ? 1 : 0));
  if (!cands.length) { toast(t('bgNoSupplierLines'), 3500); return; }
  const left = l => Math.max(0, costOf(l) - paidOf(l));
  const label = l => sups[l.supplierId].name + ' · ' + (l.item || catLabel(l.category)) + ' · ' + M(left(l) || costOf(l));
  const pr = dialog(t('bgPaySupplier'), field('lineId', t('bgSupplier'), cands[0].id, { type: 'select', options: cands.map(l => [l.id, label(l)]) }) + `<div class="grid2">${field('amount', t('bgAmount'), left(cands[0]) || costOf(cands[0]), { type: 'number', inputmode: 'decimal' })}${field('markPaid', t('bgMarkPaid'), 'כן', { type: 'select', options: [['כן', t('bgYes')], ['לא', t('bgNo')]] })}</div>`, { ok: t('next') });
  const form = document.querySelector('.modal:last-of-type form');
  if (form) form.querySelector('select[name=lineId]').onchange = e => { const l = cands.find(x => x.id === e.target.value); if (l) form.querySelector('[name=amount]').value = left(l) || costOf(l); };
  const r = await pr; if (!r) return;
  const l = cands.find(x => x.id === r.lineId); if (!l) return;
  const sp = sups[l.supplierId]; const amount = Office.num(r.amount);
  if (!sp.phone) { toast(t('bgNoPhone'), 3500); return; }
  const text = supplierPaidMessage(sp, c, isNaN(amount) ? 0 : amount, sp.lang || 'he', signerOf(s));
  const r2 = await dialog(sp.name, `<textarea name="text" rows="7">${esc(text)}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
  if (!r2 || !openWhatsApp(sp.phone, r2.text)) return;
  if (Office.yes(r.markPaid)) {
    const paidNow = (paidOf(l) || 0) + (isNaN(amount) ? 0 : amount);
    db.put('budget', { id: l.id, status: LINE_STATUS.paid, paidAt: todayIso(), paidAmount: paidNow });
    if (l.linkId && db.get('links', l.linkId)) db.put('links', { id: l.linkId, paid: 'כן', paidAt: todayIso() });
  }
}

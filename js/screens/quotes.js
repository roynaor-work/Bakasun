/* Quotes: a list per case and the quote editor. Each line: item (three names), qty, unit, days, supplier, cost, margin, price.
   Totals from Office.quoteTotals. Preview and PDF from Office.quoteHtml. The message to the client from Office.quoteMessage. */
import { t, lang, kindLabel, langName, KIND_LABELS } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, empty, dialog, confirmDialog, toast, openWhatsApp } from '../ui.js';
import Office from '../logic/office.js';
import { QUOTE_STATUS, priceFromCost, marginOf, recommendedLines, catalogAll, lastCost, resolveLines, translator } from '../logic/quotes.js';
import { quoteStatusLabel, unitLabel, categoryLabel } from '../labels.js';
import { LOGO_H } from '../data/brand.js';
import { DEFAULTS } from '../data/defaults.js';

export function render(ctx) {
  if (ctx.name === 'quote' && ctx.id) return renderOne(ctx);
  const list = db.list('quotes').sort((a, b) => String(b.created).localeCompare(String(a.created)));
  ctx.root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('quotes'))}</h1></header>
    <div class="list">${list.length ? list.map(q => { const c = db.get('cases', q.caseId) || {}; return card(q, c); }).join('') : empty(t('noQuotes'))}</div>`;
}
export function card(q, c) {
  const tot = Office.quoteTotals(resolveLines(q.lines, q.defaultMargin), q.vatRate);
  return `<a class="card tap" href="#/quote/${esc(q.id)}"><div class="row between"><span class="title"><span class="ltr">${esc(q.no)}</span> · ${esc(c.client || '')}</span><span class="badge ${q.status === QUOTE_STATUS.accepted ? 'ok' : q.status === QUOTE_STATUS.sent ? 'warn' : 'muted'}">${esc(quoteStatusLabel(q.status))}</span></div>
    <div class="sub">${esc(Office.fmt(q.date))} · ${esc(kindLabel(c.kind))} · <span class="ltr">${esc(Office.money(tot.net))}</span> ${esc(t('net'))} · ${esc(t('margin'))} <span class="count">${tot.margin}</span></div></a>`;
}

/** Creates a new quote for a case (with the recommended lines) and opens it. */
export function newQuote(cs) {
  const s = db.settings();
  const no = Office.nextQuoteNo(db.list('quotes').map(q => q.no), new Date());
  const id = db.put('quotes', { no, version: 1, caseId: cs.id, client: cs.client, date: todayIso(), lang: cs.lang || 'he', status: QUOTE_STATUS.draft,
    vatRate: s.vat || 18, defaultMargin: s.defaultMargin || 25, validUntil: Office.iso(Office.addDays(new Date(), +(s.validDays || 14))), terms: s.terms || DEFAULTS.terms, cancel: s.cancelTerms || DEFAULTS.cancelTerms, includes: DEFAULTS.includes, notes: '',
    lines: recommendedLines(cs.kind, cs.participants, s.recs, db.list('catalog')) });
  db.put('cases', { id: cs.id, quoteNo: no });
  location.hash = '#/quote/' + id;
}

function renderOne({ root, id }) {
  const q = db.get('quotes', id);
  if (!q) { root.innerHTML = empty(t('noResults')); return; }
  const cs = db.get('cases', q.caseId) || {};
  const s = db.settings();
  const sups = db.list('suppliers').filter(x => !/^(לא|no)$/i.test(String(x.active || ''))).sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
  const lines = resolveLines(q.lines, q.defaultMargin);
  const tot = Office.quoteTotals(lines, q.vatRate);
  const L = lang();
  const lineCard = (l, i) => {
    const raw = q.lines[i];
    const name = L === 'he' ? l.item : (l[L] || l.item);
    const supName = raw.supplierId ? (sups.find(x => x.id === raw.supplierId) || {}).name || raw.supplier : '';
    return `<div class="card" data-i="${i}">
      <div class="row between"><span class="title">${esc(name)}</span><span class="ltr big">${esc(Office.money(Office.quoteTotals([l], q.vatRate).net))}</span></div>
      <div class="sub"><span class="count">${esc(l.qty)}</span> ${esc(unitLabel(l.unit))}${l.days > 1 ? ` · <span class="count">${l.days}</span> ${esc(t('days'))}` : ''} · ${esc(t('price'))} <span class="ltr">${esc(Office.money(l.price))}</span>${l.cost ? ` · ${esc(t('cost'))} <span class="ltr">${esc(Office.money(l.cost))}</span> · ${esc(t('margin'))} <span class="count">${marginOf(l.cost, l.price)}</span>` : ''}</div>
      <div class="sub">${supName ? `<b>${esc(supName)}</b>` : `<span class="badge warn">${esc(t('noSupplier'))}</span>`}${l.section ? ' · ' + esc(categoryLabel(l.section)) : ''}</div>
      <div class="row"><button class="btn sm" data-edit>${esc(t('edit'))}</button><button class="btn sm ghost" data-del>${esc(t('delete'))}</button></div></div>`;
  };
  root.innerHTML = `<header class="top"><a class="icon" href="#/case/${esc(q.caseId)}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1><span class="ltr">${esc(q.no)}</span> · ${esc(cs.client || '')}</h1>
      <button class="icon" id="edit" aria-label="${esc(t('edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg></button></header>
    <div class="stack">
      <div class="row"><select id="status" class="grow" aria-label="${esc(t('fStatus'))}">${Object.values(QUOTE_STATUS).map(v => `<option value="${esc(v)}"${v === q.status ? ' selected' : ''}>${esc(quoteStatusLabel(v))}</option>`).join('')}</select>
        <span class="badge muted">${esc(langName(q.lang))}</span><span class="badge muted">${esc(Office.fmt(q.date))}</span></div>
      <div class="stat"><div class="card"><b class="ltr">${esc(Office.money(tot.net))}</b><span>${esc(t('net'))}</span></div><div class="card"><b class="ltr">${esc(Office.money(tot.gross))}</b><span>${esc(t('gross'))}</span></div><div class="card"><b class="count">${tot.margin}%</b><span>${esc(t('marginTotal'))} · <span class="ltr">${esc(Office.money(tot.net - tot.cost))}</span></span></div></div>
      <div class="row"><button class="btn primary" id="addLine">+ ${esc(t('addLine'))}</button><button class="btn" id="fromRec">${esc(t('fromRecommended'))}</button></div>
      <div class="list">${lines.length ? lines.map(lineCard).join('') : empty(t('none'))}</div>
      <div class="row"><button class="btn" id="preview">${esc(t('preview'))}</button><button class="btn" id="pdf">${esc(t('pdf'))}</button><button class="btn wa" id="send">${esc(t('sendQuote'))}</button><button class="btn ghost" id="clone">${esc(t('copyQuote'))}</button></div>
      <p class="hint">${esc(t('pdfHint'))}</p>
      <div class="row end"><button class="btn danger sm" id="del">${esc(t('delete'))}</button></div>
    </div>`;

  root.querySelector('#status').onchange = e => { db.put('quotes', { id, status: e.target.value }); if (e.target.value === QUOTE_STATUS.accepted && cs.id) db.put('cases', { id: cs.id, status: Office.STATUS.won }); };
  root.querySelector('#edit').onclick = async () => {
    const r = await dialog(t('edit'), `<div class="grid2">${field('lang', t('quoteLang'), q.lang, { type: 'select', options: [['he', langName('he')], ['en', langName('en')], ['fr', langName('fr')]] })}${field('date', t('date'), q.date, { type: 'date' })}
      ${field('validUntil', t('validUntil'), q.validUntil || '', { type: 'date' })}${field('defaultMargin', t('defaultMargin'), q.defaultMargin || 25, { type: 'number', inputmode: 'numeric' })}${field('vatRate', t('vat'), q.vatRate || 18, { type: 'number', inputmode: 'decimal' })}</div>
      ${field('includes', t('includes'), q.includes || '', { type: 'textarea', rows: 3 })}${field('terms', t('terms'), q.terms || '', { type: 'textarea', rows: 3 })}${field('cancel', t('cancelTerms'), q.cancel || '', { type: 'textarea', rows: 3 })}${field('notes', t('fNotes'), q.notes || '', { type: 'textarea', rows: 2 })}`);
    if (r) { r.id = id; db.put('quotes', r); }
  };
  root.querySelector('#addLine').onclick = () => editLine(q, null, sups);
  root.querySelector('#fromRec').onclick = () => {
    const have = {}; q.lines.forEach(l => { have[l.item] = 1; });
    const add = recommendedLines(cs.kind, cs.participants, s.recs, db.list('catalog')).filter(l => !have[l.item]);
    db.put('quotes', { id, lines: q.lines.concat(add) }); toast(t('saved'));
  };
  root.querySelectorAll('.card[data-i]').forEach(el => {
    const i = +el.dataset.i;
    el.querySelector('[data-edit]').onclick = () => editLine(q, i, sups);
    el.querySelector('[data-del]').onclick = () => { const ls = q.lines.slice(); ls.splice(i, 1); db.put('quotes', { id, lines: ls }); };
  });
  const biz = () => ({ name: s.bizName || DEFAULTS.bizName, legal: s.bizLegal || DEFAULTS.bizLegal, id: s.bizId || DEFAULTS.bizId, phone: s.bizPhone || DEFAULTS.bizPhone, email: s.bizEmail || DEFAULTS.bizEmail, signer: s.signer || DEFAULTS.signer });
  const pageHtml = () => brandQuote(Office.quoteHtml(Object.assign({}, q, { lines }), cs, biz(), translator(KIND_LABELS, db.list('catalog'))), q, s);
  root.querySelector('#preview').onclick = () => showPreview(pageHtml());
  root.querySelector('#pdf').onclick = () => makePdf(pageHtml(), q.no + '.pdf');
  root.querySelector('#send').onclick = async () => {
    const text = Office.quoteMessage(Object.assign({}, q, { lines }), cs, s.signer || '');
    const r = await dialog(t('sendQuote'), `<textarea name="text" rows="7">${esc(text)}</textarea>`, { ok: t('whatsapp') });
    if (r && openWhatsApp(cs.phone, r.text)) { db.put('quotes', { id, status: QUOTE_STATUS.sent, sentAt: todayIso() }); if (cs.id) db.put('cases', { id: cs.id, status: Office.STATUS.quoted, waitingSince: todayIso(), quoteNo: q.no }); }
  };
  root.querySelector('#clone').onclick = () => {
    const c = Office.cloneQuote(q, { caseId: q.caseId });
    const no = Office.nextQuoteNo(db.list('quotes').map(x => x.no), new Date());
    const nid = db.put('quotes', Object.assign(c, { no, version: 1, date: todayIso(), vatRate: q.vatRate, defaultMargin: q.defaultMargin, validUntil: Office.iso(Office.addDays(new Date(), +(s.validDays || 14))) }));
    location.hash = '#/quote/' + nid;
  };
  root.querySelector('#del').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { db.remove('quotes', id); location.hash = '#/case/' + q.caseId; } };
}

async function editLine(q, i, sups) {
  const l = i == null ? { item: '', en: '', fr: '', unit: 'אירוע', qty: 1, days: 1, cost: '', margin: '', price: '', supplierId: '', section: '' } : Object.assign({}, q.lines[i]);
  const cat = catalogAll(db.list('catalog'));
  const supOpts = [['', t('noSupplier')]].concat(sups.map(x => [x.id, x.name + ' · ' + x.type]));
  const last = l.supplierId && l.item ? lastCost(l.supplierId, l.item, db.list('quotes', x => x.id !== q.id)) : null;
  const r = await dialog(i == null ? t('addLine') : t('edit'),
    `<label class="f"><span>${esc(t('item'))}</span><input name="item" list="cat" value="${esc(l.item)}" autocomplete="off"><datalist id="cat">${cat.map(c => `<option value="${esc(c.item)}">${esc(categoryLabel(c.category))}</option>`).join('')}</datalist></label>
    <div class="grid2">${field('en', 'English', l.en || '', { ltr: true })}${field('fr', 'Français', l.fr || '', { ltr: true })}
    ${field('qty', t('qty'), l.qty, { type: 'number', inputmode: 'decimal' })}${field('unit', t('unit'), l.unit || '')}${field('days', t('days'), l.days || 1, { type: 'number', inputmode: 'numeric' })}
    ${field('supplierId', t('supplierOfLine'), l.supplierId || '', { type: 'select', options: supOpts })}
    ${field('cost', t('cost'), l.cost, { type: 'number', inputmode: 'decimal' })}${field('margin', t('margin'), l.margin, { type: 'number', inputmode: 'decimal', placeholder: String(q.defaultMargin || 25) })}
    ${field('price', t('price'), l.price, { type: 'number', inputmode: 'decimal' })}${field('section', t('section'), l.section || '')}</div>
    ${last ? `<p class="hint">${esc(t('lastCost'))}: <span class="ltr">${esc(Office.money(last.cost))}</span> (${esc(Office.fmt(last.date))})</p>` : ''}
    <p class="hint">${esc(t('price'))} = ${esc(t('cost'))} + ${esc(t('margin'))}. ${esc(t('price'))} ≠ 0 → ${esc(t('price'))}.</p>`);
  if (!r || !r.item) return;
  const c = cat.find(x => x.item === r.item);
  if (c) { if (!r.en) r.en = c.en; if (!r.fr) r.fr = c.fr; if (!r.section) r.section = c.category; if (!r.unit) r.unit = c.unit; }
  else db.put('catalog', { item: r.item, en: r.en, fr: r.fr, unit: r.unit, category: r.section, supplierType: (sups.find(x => x.id === r.supplierId) || {}).type || '' });
  const sup = sups.find(x => x.id === r.supplierId); r.supplier = sup ? sup.name : '';
  const ls = q.lines.slice();
  if (i == null) ls.push(r); else ls[i] = r;
  db.put('quotes', { id: q.id, lines: ls });
}

function showPreview(html) {
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-card" style="max-height:95vh;padding:8px"><div class="row between"><button class="btn sm" id="pvClose">${esc(t('close'))}</button></div><iframe id="pv" style="width:100%;height:80vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#pv').srcdoc = html;
  wrap.querySelector('#pvClose').onclick = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
}

/** PDF in the browser: the quote page is rendered and saved as a file (html2pdf, loaded only when needed). */
function makePdf(html, filename) {
  const go = () => {
    const host = document.createElement('div'); host.style.position = 'fixed'; host.style.insetInlineStart = '-10000px'; host.style.top = '0'; host.style.width = '794px'; host.style.background = '#fff';
    const body = html.replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    const style = (/<style>([\s\S]*?)<\/style>/.exec(html) || [])[1] || '';
    const dir = /dir="ltr"/.test(html) ? 'ltr' : 'rtl';
    host.innerHTML = `<div dir="${dir}" style="direction:${dir}"><style>${style}</style>${body}</div>`;
    document.body.appendChild(host);
    window.html2pdf().set({ margin: 8, filename, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4' } }).from(host.firstChild).save().then(() => host.remove(), () => host.remove());
  };
  if (window.html2pdf) return go();
  const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; sc.onload = go; sc.onerror = () => toast(t('pdfHint'), 4000);
  document.head.appendChild(sc);
}

/* Virginie's document: the logo on top, the address line, the opening sentence, "the service includes", and the cancellation terms. */
function brandQuote(html, q, s) {
  const L = ['he', 'en', 'fr'].includes(q.lang) ? q.lang : 'he';
  const T = { he: { intro: t('intro'), includes: 'השירות כולל', cancel: 'תנאי ביטול' }, en: { intro: 'Further to our pleasant conversation, here is our quotation', includes: 'The service includes', cancel: 'Cancellation terms' }, fr: { intro: 'Suite à notre agréable échange, voici notre devis', includes: 'Le service comprend', cancel: 'Conditions d’annulation' } }[L];
  const e = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const addr = ' · ' + e(s.bizAddress || DEFAULTS.bizAddress);
  html = html.replace('<div class="top">', '<div class="top" style="display:flex;align-items:center;gap:16px"><img src="' + LOGO_H + '" alt="" style="height:64px;width:auto"><div>').replace('</div></div><h1>', addr + '</div></div></div><h1>');
  const intro = '<p style="margin:10px 0 4px">' + e(T.intro) + (L === 'he' ? ':' : ' :') + '</p>';
  html = html.replace('<table class="info">', intro + '<table class="info">');
  const blocks = [];
  if (String(q.includes || '').trim()) blocks.push('<h3>' + e(T.includes) + '</h3><p>' + e(q.includes).replace(/\n/g, '<br>') + '</p>');
  if (String(q.cancel || '').trim()) blocks.push('<h3>' + e(T.cancel) + '</h3><p>' + e(q.cancel).replace(/\n/g, '<br>') + '</p>');
  const bank = s.bankDetails || DEFAULTS.bankDetails;
  if (bank) blocks.push('<h3>' + e({ he: 'לתשלום בהעברה בנקאית', en: 'Payment by bank transfer', fr: 'Paiement par virement bancaire' }[L]) + '</h3><p class="ltr" style="direction:ltr;text-align:left">' + e(bank).replace(/\n/g, '<br>') + '</p>');
  if (blocks.length) html = html.replace('<p style="margin-top:22px">', blocks.join('') + '<p style="margin-top:22px">');
  return html;
}

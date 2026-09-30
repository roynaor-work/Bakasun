/* Contracts with signature, and the event checklist.
   Routes: '#/contracts' = all contracts (newest first). '#/contract/<contractId>' = one contract (edit, preview, print, sign, send).
   '#/contract/<caseId>' (a case id instead of a contract id) forwards to that case's "contract" tab: '#/case/<caseId>/contract'.
   Case tabs registered here: 'contract' (the contracts of the event) and 'checklist' (the production checklist by kind of event).
   Nothing is sent by the app: WhatsApp / mail open prefilled, she presses send. Deleting asks per item. */
import { t, lang, kindLabel, langName, KIND_LABELS } from '../i18n.js';
import { db, todayIso, nowIso } from '../store.js';
import { esc, field, dialog, confirmDialog, toast, empty, section, openWhatsApp, openMail, copyText, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { TASK } from '../logic/extra.js';
import { registerCaseTab } from '../caseTabs.js';
import { LOGO_H } from '../data/brand.js';
import { signaturePad } from '../signature.js';
import { CONTRACT_STATUS, contractFromCase, contractHtml, contractTotals, missingForContract, pickQuote, contractMessage, contractSubject, contractFileName, applyForm } from '../logic/contracts.js';
import { buildChecklist, progress, dueSoon, addMissing, byPhase, toggle, customItem, taskFromItem, PHASES } from '../logic/checklists.js';

const BACK = (href) => `<a class="icon" href="${esc(href)}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;
const statusBadge = c => `<span class="badge ${c.status === CONTRACT_STATUS.signed ? 'ok' : c.status === CONTRACT_STATUS.sent ? 'warn' : 'muted'}">${esc(t('ctStatus_' + (c.status || 'draft')))}</span>`;
const kindIn = (kind, L) => { if (!kind || L === 'he') return kind || ''; const k = KIND_LABELS[kind]; return (k && k[L]) || kind; };
/** The client's details as lines, for pasting into an invoice or a mail. */
const clientBlockText = cl => [cl.legalName || cl.name, cl.name && cl.name !== cl.legalName ? cl.name : '', cl.taxId ? t('ctClientTaxId') + ' ' + cl.taxId : '', cl.address, cl.contact, cl.phone, cl.email].filter(Boolean).join('\n');

/* ================= routes ================= */
export function render(ctx) {
  if (ctx.name === 'contract' && ctx.id) {
    const c = db.get('contracts', ctx.id);
    if (c) return renderOne(ctx.root, c);
    if (db.get('cases', ctx.id)) { location.hash = '#/case/' + ctx.id + '/contract'; return; }
    ctx.root.innerHTML = `<header class="top">${BACK('#/contracts')}<h1>${esc(t('tContract'))}</h1></header>` + empty(t('noResults'));
    return;
  }
  const list = db.list('contracts').sort((a, b) => String(b.created).localeCompare(String(a.created)));
  ctx.root.innerHTML = `<header class="top">${BACK('#/more')}<h1>${esc(t('ctContracts'))}</h1></header>
    <div class="list ct-body">${list.length ? list.map(card).join('') : empty(t('ctNoneAll'))}</div>`;
}

function card(c) {
  const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {}; const tot = contractTotals(c);
  return `<a class="card tap" href="#/contract/${esc(c.id)}"><div class="row between"><span class="title">${esc(cl.name || cl.legalName || t('unknownClient'))}</span>${statusBadge(c)}</div>
    <div class="sub">${[c.title, kindIn(ev.kind, lang()), ev.date ? Office.fmt(ev.date) : '', ev.place].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="sub">${tot.hasPrice ? `<span class="ltr">${esc(Office.money(tot.gross))}</span> ${esc(t('ctGross'))}` : esc(t('ctNoPrice'))}${c.signatures && c.signatures.client ? ' · ' + esc(t('ctClientSig')) + ' ✓' : ''}</div></a>`;
}

/** Builds a new contract for the case (client card + best quote + settings) and opens it. */
function newContract(cs) {
  const s = db.settings();
  const client = db.get('clients', cs.clientId) || db.list('clients', x => x.name && x.name === cs.client)[0] || null;
  const quote = pickQuote(db.list('quotes', q => q.caseId === cs.id));
  const rec = contractFromCase(cs, client, quote, s, cs.lang || lang());
  const id = db.put('contracts', rec);
  location.hash = '#/contract/' + id;
}

/* ================= one contract ================= */
function renderOne(root, c) {
  const cs = db.get('cases', c.caseId) || {};
  const s = db.settings();
  const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {}; const sg = c.signatures || {};
  const tot = contractTotals(c); const miss = missingForContract(c);
  const L = lang();
  const sigBox = (label, png, name, when) => `<div class="ct-sig"><span class="lbl">${esc(label)}</span>${png ? `<img src="${esc(png)}" alt="">` : `<span class="none">${esc(t('ctNotSigned'))}</span>`}
    ${png && (name || when) ? `<span class="sub">${name ? esc(name) : ''}${when ? ' · <span class="ltr">' + esc(Office.fmt(when) + ' ' + String(when).slice(11, 16)) + '</span>' : ''}</span>` : ''}</div>`;
  root.innerHTML = `<header class="top">${BACK(c.caseId ? '#/case/' + c.caseId + '/contract' : '#/contracts')}<h1>${esc(c.title || t('tContract'))}</h1>
      <button class="icon" id="edit" aria-label="${esc(t('edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg></button></header>
    <div class="stack ct-body">
      <div class="row">${statusBadge(c)}<select id="status" class="grow" aria-label="${esc(t('fStatus'))}">${Object.values(CONTRACT_STATUS).map(v => `<option value="${v}"${v === c.status ? ' selected' : ''}>${esc(t('ctStatus_' + v))}</option>`).join('')}</select>
        <span class="badge muted">${esc(langName(c.lang))}</span><span class="badge muted"><span class="ltr">${esc(Office.fmt(c.date))}</span></span></div>
      ${miss.length ? `<div class="warnbox">${esc(t('ctMissing'))}: ${miss.map(k => esc(t('ctMiss_' + k))).join(' · ')}</div>` : ''}
      <div class="card"><div class="row between"><span class="title">${esc(cl.legalName || cl.name || t('unknownClient'))}</span>${copyBtn(clientBlockText(cl), { icon: true })}</div>
        <div class="sub">${[cl.name && cl.name !== cl.legalName ? cl.name : '', cl.taxId, cl.address, cl.contact].filter(Boolean).map(esc).join(' · ')}</div>
        ${cl.phone || cl.email ? `<div class="sub ltr">${esc(cl.phone || '')}${cl.phone ? copyBtn(cl.phone, { icon: true }) : ''}${cl.phone && cl.email ? ' · ' : ''}${esc(cl.email || '')}${cl.email ? copyBtn(cl.email, { icon: true }) : ''}</div>` : ''}
        <div class="sub">${[kindIn(ev.kind, L), ev.date ? Office.fmt(ev.date) : '', ev.hours, ev.place, ev.participants ? ev.participants + ' ' + t('people') : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="card ct-price">${tot.hasPrice ? `<div class="row between"><span><b class="ltr">${esc(Office.money(tot.net))}</b> ${esc(t('ctNet'))}</span><span class="sub">+ ${esc(t('vat')).replace('%', '')} <span class="count">${tot.vatRate}%</span> = <b class="ltr">${esc(Office.money(tot.gross))}</b> ${esc(t('ctGross'))}</span></div>` : `<span class="sub">${esc(t('ctNoPrice'))}</span>`}
        ${c.quoteNo ? `<div class="sub">${esc(t('ctFromQuote'))} <a class="ltr" href="#/quote/${esc(c.quoteId)}">${esc(c.quoteNo)}</a></div>` : ''}</div>
      <div class="ct-sigs">${sigBox(t('ctProducerSig'), sg.producer, (c.parties.producer.signer || '').split('\n')[0], sg.producerSignedAt)}${sigBox(t('ctClientSig'), sg.client, sg.clientName, sg.clientSignedAt)}</div>
      <div class="row"><button class="btn primary" id="clientSign">${esc(t('ctClientSign'))}</button><button class="btn" id="mySign">${esc(t('ctMySign'))}</button></div>
      <div class="row"><button class="btn" id="preview">${esc(t('preview'))}</button><button class="btn" id="print">${esc(t('ctPrint'))}</button><button class="btn wa" id="send">${esc(t('ctSend'))}</button></div>
      <p class="hint">${esc(t('ctSendHint'))}</p>
      <div class="row end">${sg.client || sg.producer ? `<button class="btn ghost sm" id="unsign">${esc(t('ctSigRemove'))}</button>` : ''}<button class="btn danger sm" id="del">${esc(t('delete'))}</button></div>
    </div>`;

  const id = c.id;
  const pageHtml = () => contractHtml(c, { logo: LOGO_H, kindLabel: kindIn });
  root.querySelector('#status').onchange = e => db.put('contracts', { id, status: e.target.value });
  root.querySelector('#edit').onclick = () => editContract(c);
  root.querySelector('#preview').onclick = () => showPreview(pageHtml());
  root.querySelector('#print').onclick = () => printHtml(pageHtml());
  root.querySelector('#clientSign').onclick = async () => {
    const r = await signaturePad({ title: t('ctSigTitleClient'), hint: t('ctHandDevice'), askName: true, name: sg.clientName || cl.contact || '' });
    if (!r) return;
    db.put('contracts', { id, status: CONTRACT_STATUS.signed, signedAt: nowIso(), signatures: Object.assign({}, sg, { client: r.png, clientName: r.name, clientSignedAt: nowIso() }) });
    toast(t('ctSigned'));
  };
  root.querySelector('#mySign').onclick = async () => {
    const saved = db.setting('signaturePng') || '';
    const r = await signaturePad({ title: t('ctSigTitleMine'), saved, offerSave: true });
    if (!r) return;
    if (r.save && r.png) db.setting('signaturePng', r.png);
    db.put('contracts', { id, signatures: Object.assign({}, sg, { producer: r.png, producerSignedAt: nowIso() }) });
    toast(t('saved'));
  };
  const unsign = root.querySelector('#unsign');
  if (unsign) unsign.onclick = async () => {
    const r = await dialog(t('ctSigRemove'), `${field('which', t('ctSigRemove'), 'client', { type: 'select', options: [['client', t('ctClientSig')], ['producer', t('ctProducerSig')]] })}`, { ok: t('ctSigRemove'), danger: true });
    if (!r) return;
    const next = Object.assign({}, sg, r.which === 'client' ? { client: '', clientName: '', clientSignedAt: '' } : { producer: '', producerSignedAt: '' });
    db.put('contracts', { id, signatures: next, status: next.client ? c.status : (c.status === CONTRACT_STATUS.signed ? CONTRACT_STATUS.sent : c.status), signedAt: next.client ? c.signedAt : '' });
  };
  root.querySelector('#send').onclick = () => sendContract(c, cs, s, pageHtml);
  root.querySelector('#del').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { db.remove('contracts', id); location.hash = c.caseId ? '#/case/' + c.caseId + '/contract' : '#/contracts'; } };
}

async function editContract(c) {
  const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {};
  const r = await dialog(t('edit'), `<div class="grid2">${field('lang', t('ctLang'), c.lang, { type: 'select', options: [['he', langName('he')], ['en', langName('en')], ['fr', langName('fr')]] })}${field('date', t('ctDate'), c.date || '', { type: 'date' })}</div>
    ${field('title', t('ctTitle'), c.title || '')}
    <h3>${esc(t('ctClientName'))}</h3>
    ${field('clientName', t('ctClientName'), cl.name || '')}${field('clientLegalName', t('ctClientLegal'), cl.legalName || '')}
    <div class="grid2">${field('clientTaxId', t('ctClientTaxId'), cl.taxId || '', { ltr: true, inputmode: 'numeric' })}${field('clientContact', t('ctClientContact'), cl.contact || '')}</div>
    ${field('clientAddress', t('ctClientAddress'), cl.address || '')}
    <div class="grid2">${field('clientEmail', t('ctClientEmail'), cl.email || '', { type: 'email', ltr: true })}${field('clientPhone', t('ctClientPhone'), cl.phone || '', { type: 'tel', ltr: true })}</div>
    <h3>${esc(t('fKind'))}</h3>
    <div class="grid2">${field('eventKind', t('ctEventKind'), ev.kind || '')}${field('eventDate', t('ctEventDate'), ev.date || '', { type: 'date' })}${field('eventHours', t('ctEventHours'), ev.hours || '')}${field('eventPlace', t('ctEventPlace'), ev.place || '')}${field('eventParticipants', t('ctEventParticipants'), ev.participants || '')}</div>
    <h3>${esc(t('price'))}</h3>
    <div class="grid2">${field('price', t('ctPrice'), c.price === '' || c.price == null ? '' : c.price, { type: 'number', inputmode: 'decimal' })}${field('vatRate', t('ctVat'), c.vatRate == null ? 18 : c.vatRate, { type: 'number', inputmode: 'decimal' })}</div>
    ${field('scope', t('ctScope'), c.scope || '', { type: 'textarea', rows: 3 })}${field('paymentTerms', t('ctPayment'), c.paymentTerms || '', { type: 'textarea', rows: 3 })}${field('cancellation', t('ctCancel'), c.cancellation || '', { type: 'textarea', rows: 4 })}${field('extras', t('ctExtras'), c.extras || '', { type: 'textarea', rows: 2 })}`);
  if (!r) return;
  const next = applyForm(c, r);
  db.put('contracts', { id: c.id, lang: next.lang, title: next.title, date: next.date, parties: next.parties, eventLine: next.eventLine, price: next.price, vatRate: next.vatRate, scope: next.scope, paymentTerms: next.paymentTerms, cancellation: next.cancellation, extras: next.extras });
  toast(t('saved'));
}

/* ---- preview / print / share: same approach as the quotes (a printable HTML page in an iframe) ---- */
function showPreview(html) {
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-card ct-pv" style="max-height:95vh;padding:8px"><div class="row between"><button class="btn sm" id="pvClose">${esc(t('close'))}</button><span class="row"><button class="btn sm ghost" id="pvCopy">${esc(t('ctCopyText'))}</button><button class="btn sm" id="pvPrint">${esc(t('ctPrint'))}</button></span></div><iframe id="pv" title="${esc(t('preview'))}"></iframe></div>`;
  document.body.appendChild(wrap);
  const pv = wrap.querySelector('#pv'); pv.srcdoc = html;
  wrap.querySelector('#pvClose').onclick = () => wrap.remove();
  wrap.querySelector('#pvPrint').onclick = () => printHtml(html);
  // the contract as plain text: what the rendered page reads, line breaks kept (the frame is same-origin: srcdoc)
  wrap.querySelector('#pvCopy').onclick = () => { try { copyText(pv.contentDocument.body.innerText.replace(/\n{3,}/g, '\n\n').trim()); } catch (e) { toast(t('ctCopyFailed')); } };
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
}
/** Opens the printable page in a hidden frame and calls print: she prints, or saves as PDF from the print dialog. */
function printHtml(html) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.style.position = 'fixed'; f.style.insetInlineStart = '-10000px'; f.style.top = '0'; f.style.width = '794px'; f.style.height = '1123px'; f.style.border = '0';
  document.body.appendChild(f);
  const cleanup = () => setTimeout(() => f.remove(), 60000);
  f.onload = () => { try { const w = f.contentWindow; w.focus(); setTimeout(() => { try { w.print(); } catch (e) { toast(t('pdfHint'), 4000); } cleanup(); }, 250); } catch (e) { toast(t('pdfHint'), 4000); f.remove(); } };
  f.srcdoc = html;
}
/** The document as a PDF blob (html2pdf, loaded only when needed, like the quotes). Rejects when the library cannot load. */
function pdfBlob(html) {
  const make = () => {
    const host = document.createElement('div'); host.style.position = 'fixed'; host.style.insetInlineStart = '-10000px'; host.style.top = '0'; host.style.width = '794px'; host.style.background = '#fff';
    const body = html.replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    const style = ((/<style>([\s\S]*?)<\/style>/.exec(html) || [])[1] || '').replace(/@media print\{[^}]*\}[^}]*\}/g, '');
    const dir = /dir="ltr"/.test(html) ? 'ltr' : 'rtl';
    host.innerHTML = `<div dir="${dir}" style="direction:${dir}"><style>${style}</style>${body}</div>`;
    document.body.appendChild(host);
    return window.html2pdf().set({ margin: 8, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4' } }).from(host.firstChild).outputPdf('blob').then(b => { host.remove(); return b; }, e => { host.remove(); throw e; });
  };
  if (window.html2pdf) return make();
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; sc.onload = () => res(make()); sc.onerror = rej; document.head.appendChild(sc); });
}
async function sendContract(c, cs, s, pageHtml) {
  const cl = (c.parties && c.parties.client) || {};
  const text = contractMessage(c, cs, s.signer || '');
  const canFile = !!(navigator.share && navigator.canShare);
  const r = await dialog(t('ctSend'), `${field('channel', t('ctChannel'), 'wa', { type: 'select', options: [['wa', t('ctChWa')], ['mail', t('ctChMail')], ['file', t('ctChFile')]] })}
    <label class="f"><span>${esc(t('ctCover'))}</span><textarea name="text" rows="7">${esc(text)}</textarea></label><div class="row">${copyOf('[name=text]')}</div><p class="hint">${esc(canFile ? t('ctSendHint') : t('ctShareHint'))}</p>`, { ok: t('ctSend') });
  if (!r) return;
  const markSent = () => { if (c.status === CONTRACT_STATUS.draft) db.put('contracts', { id: c.id, status: CONTRACT_STATUS.sent, sentAt: todayIso() }); else db.put('contracts', { id: c.id, sentAt: todayIso() }); };
  if (r.channel === 'wa') { if (openWhatsApp(cl.phone || cs.phone, r.text)) markSent(); return; }
  if (r.channel === 'mail') { if (openMail(cl.email || cs.email, contractSubject(c), r.text)) markSent(); return; }
  if (!canFile) { toast(t('ctShareHint'), 5000); printHtml(pageHtml()); return; }
  try {
    const blob = await pdfBlob(pageHtml());
    const file = new File([blob], contractFileName(c), { type: 'application/pdf' });
    if (!navigator.canShare({ files: [file] })) throw new Error('no file share');
    await navigator.share({ files: [file], title: contractSubject(c), text: r.text });
    markSent();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast(t('ctShareHint'), 5000); printHtml(pageHtml());
  }
}

/* ================= case tab: contract ================= */
function tabContract(body, cs) {
  body.classList.add('ct-body');
  const list = db.list('contracts', x => x.caseId === cs.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  body.innerHTML = `<div class="row"><button class="btn primary" id="ctNew">+ ${esc(t('ctNew'))}</button></div>
    <div class="list">${list.length ? list.map(card).join('') : empty(t('ctNone'))}</div>`;
  body.querySelector('#ctNew').onclick = () => newContract(cs);
}

/* ================= case tab: checklist ================= */
function tabChecklist(body, cs, s) {
  body.classList.add('ct-body');
  const cl = db.list('checklists', x => x.caseId === cs.id).sort((a, b) => String(a.created).localeCompare(String(b.created)))[0];
  if (!cl) {
    body.innerHTML = `<p class="hint">${esc(t('clNone'))}</p><div class="row"><button class="btn primary" id="clNew">${esc(t('clNew'))}</button></div>`;
    body.querySelector('#clNew').onclick = () => { db.put('checklists', buildChecklist(cs)); toast(t('saved')); };
    return;
  }
  const today = todayIso();
  const p = progress(cl); const soon = dueSoon(cl, today, 7); const late = soon.filter(i => i.late > 0).length;
  const dueTag = i => {
    if (!i.due || i.done) return i.due ? `<span class="ltr">${esc(Office.fmt(i.due))}</span>` : '';
    const n = Office.daysBetween(today, i.due);
    return `<span class="${n < 0 ? 'late' : n <= 7 ? 'soon' : ''}"><span class="ltr">${esc(Office.fmt(i.due))}</span></span>`;
  };
  const item = i => `<div class="cl-item ${i.done ? 'done' : ''}" data-id="${esc(i.id)}">
      <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="${esc(t('clDone'))}">
      <div class="txt"><div>${esc(i.text)}</div><div class="meta">${dueTag(i)}${i.taskId ? `<a class="badge muted" href="#/tasks">${esc(t('clIsTask'))}</a>` : ''}</div></div>
      <div class="acts">${!i.taskId && !i.done ? `<button class="btn sm ghost" data-task>${esc(t('clToTask'))}</button>` : ''}<button class="btn sm ghost" data-del aria-label="${esc(t('clDeleteItem'))}">×</button></div></div>`;
  body.innerHTML = `
    <div class="card"><div class="row between"><span class="title">${esc(p.total && p.done === p.total ? t('clAllDone') : t('clProgress', { done: p.done, total: p.total }))}</span><span class="count">${p.pct}%</span></div>
      <div class="cl-bar"><span style="width:${p.pct}%"></span></div>
      <div class="sub">${[late ? `<span class="badge">${esc(t('clOverdue', { n: late }))}</span>` : '', soon.length - late ? `<span class="badge warn">${esc(t('clDueSoon', { n: soon.length - late }))}</span>` : ''].filter(Boolean).join(' ') || (cs.date ? '' : esc(t('clNoDate')))}</div></div>
    <div class="row"><button class="btn" id="clAdd">${esc(t('clAdd'))}</button><button class="btn ghost" id="clRefresh">${esc(t('clRefresh'))}</button></div>
    ${byPhase(cl).map(g => g.items.length ? `<div class="card cl-phase"><h3>${esc(t('clPhase_' + g.phase))}<span class="badge muted">${g.items.filter(i => i.done).length}/${g.items.length}</span></h3>${g.items.map(item).join('')}</div>` : '').join('')}`;

  const save = items => db.put('checklists', { id: cl.id, items });
  body.querySelectorAll('.cl-item').forEach(el => {
    const it = cl.items.find(x => x.id === el.dataset.id); if (!it) return;
    const flip = () => save(cl.items.map(x => x.id === it.id ? toggle(x) : x));
    el.querySelector('input').onchange = flip;
    el.querySelector('.txt').onclick = flip;
    const tb = el.querySelector('[data-task]');
    if (tb) tb.onclick = () => {
      const tid = db.put('tasks', Object.assign(taskFromItem(it, cs, t('me')), { lang: s.msgLang || 'he' }));
      save(cl.items.map(x => x.id === it.id ? Object.assign({}, x, { taskId: tid }) : x));
      toast(t('clTaskMade'));
    };
    el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog(t('clDeleteItem') + ': ' + it.text)) save(cl.items.filter(x => x.id !== it.id)); };
  });
  body.querySelector('#clAdd').onclick = async () => {
    const r = await dialog(t('clAdd'), `${field('text', t('clItem'), '')}<div class="grid2">${field('phase', t('clPhase'), 'before', { type: 'select', options: PHASES.map(ph => [ph, t('clPhase_' + ph)]) })}${field('due', t('clDue'), '', { type: 'date' })}</div>`, { ok: t('add') });
    if (!r || !String(r.text || '').trim()) return;
    save(cl.items.concat([customItem(r.text, r.phase, r.due)]));
  };
  body.querySelector('#clRefresh').onclick = () => {
    const { checklist, added } = addMissing(cl, cs);
    if (added || checklist.items.some((x, i) => x.due !== (cl.items[i] || {}).due)) db.put('checklists', { id: cl.id, kind: checklist.kind, items: checklist.items });
    toast(added ? t('clAdded', { n: added }) : t('clNothingAdded'));
  };
}

registerCaseTab({ key: 'contract', label: () => t('tContract'), render: tabContract });
registerCaseTab({ key: 'checklist', label: () => t('tChecklist'), render: tabChecklist });

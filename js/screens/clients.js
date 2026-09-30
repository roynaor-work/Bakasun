/* Clients: the list, and one client with the history of their cases (from Office.clientHistory). */
import { t, kindLabel, statusLabel, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, empty, dialog, confirmDialog, toast, dial, openWhatsApp, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { notesHtml, wireNotes } from '../notes.js';
import { DEFAULTS } from '../data/defaults.js';
const missingForInvoice = c => DEFAULTS.invoiceFields.filter(k => !String(c[k] || '').trim());

const TYPES = ['חברה', 'עמותה', 'רשות או משרד ממשלתי', 'פרטי', 'מפיק או ספק אחר'];
const TYPE_L = { 'חברה': { fr: 'Société', en: 'Company' }, 'עמותה': { fr: 'Association', en: 'Nonprofit' }, 'רשות או משרד ממשלתי': { fr: 'Administration', en: 'Government' }, 'פרטי': { fr: 'Particulier', en: 'Private' }, 'מפיק או ספק אחר': { fr: 'Autre producteur / fournisseur', en: 'Other producer / supplier' } };
import { lang } from '../i18n.js';
const typeLabel = v => (lang() === 'he' || !TYPE_L[v]) ? v : TYPE_L[v][lang()] || v;

export function render(ctx) {
  if (ctx.name === 'client' && ctx.id) return renderOne(ctx);
  const list = db.list('clients').sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
  ctx.root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('clients'))}</h1><button class="btn sm" id="new">+ ${esc(t('newClient'))}</button></header>
    <div class="list">${list.length ? list.map(c => `<a class="card tap" href="#/client/${esc(c.id)}"><div class="row between"><span class="title">${esc(c.name)}</span><span class="row">${missingForInvoice(c).length ? `<span class="badge warn">${esc(t('missingInvoice'))}</span>` : ''}${c.type ? `<span class="badge muted">${esc(typeLabel(c.type))}</span>` : ''}</span></div><div class="sub">${esc(c.contact || '')} <span class="ltr">${esc(phonePretty(c.phone))}</span>${c.phone ? copyBtn(c.phone, { icon: true }) : ''}</div></a>`).join('') : empty(t('noClients'))}</div>`;
  ctx.root.querySelector('#new').onclick = () => edit(null);
}

function renderOne({ root, id }) {
  const c = db.get('clients', id);
  if (!c) { root.innerHTML = empty(t('noResults')); return; }
  const h = Office.clientHistory(id, db.list('cases'), db.list('quotes'));
  root.innerHTML = `<header class="top"><a class="icon" href="#/clients" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(c.name)}</h1>
      <button class="icon" id="edit" aria-label="${esc(t('edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg></button></header>
    <div class="stack">
      <div class="card"><div class="title">${esc(c.contact || '')}</div><div class="sub ltr">${esc(phonePretty(c.phone))}${c.phone ? copyBtn(c.phone, { icon: true }) : ''}${c.email ? ' · ' + esc(c.email) + copyBtn(c.email, { icon: true }) : ''}</div>
        <div class="sub">${[typeLabel(c.type), langName(c.lang), c.legalName, c.taxId, c.address].filter(Boolean).map(esc).join(' · ')}${c.legalName || c.taxId || c.address ? copyBtn([c.legalName || c.name, c.taxId ? t('fTaxId') + ' ' + c.taxId : '', c.address].filter(Boolean).join('\n'), { icon: true }) : ''}</div>
        ${missingForInvoice(c).length ? `<div class="warnbox">${esc(t('missingInvoice'))}: ${missingForInvoice(c).map(k => esc(t(k === 'legalName' ? 'fLegal' : k === 'taxId' ? 'fTaxId' : 'fAddress'))).join(', ')}</div>` : ''}
        <div class="row"><button class="btn wa" id="wa">${esc(t('whatsapp'))}</button><button class="btn" id="dial">${esc(t('call'))}</button></div></div>
      <div class="stat"><div class="card"><b class="count">${h.count}</b><span>${esc(t('events'))}</span></div><div class="card"><b class="count">${h.won}</b><span>${esc(t('won'))}</span></div><div class="card"><b class="count">${h.lost}</b><span>${esc(t('lost'))}</span></div></div>
      ${h.totalNet ? `<div class="card"><span class="sub">${esc(t('totalNet'))}</span><span class="big ltr">${esc(Office.money(h.totalNet))}</span></div>` : ''}
      ${c.approver || c.payer || c.payTerms || c.attachments || c.invoiceEmail ? `<div class="card"><div class="title">${esc(t('clientProcess'))}</div><div class="kv">${c.approver ? `<dt>${esc(t('approver'))}</dt><dd>${esc(c.approver)}</dd>` : ''}${c.payer ? `<dt>${esc(t('payer'))}</dt><dd>${esc(c.payer)}</dd>` : ''}${c.payTerms ? `<dt>${esc(t('payTermsClient'))}</dt><dd>${esc(c.payTerms)}</dd>` : ''}${c.invoiceEmail ? `<dt>${esc(t('invoiceEmail'))}</dt><dd class="ltr">${esc(c.invoiceEmail)}${copyBtn(c.invoiceEmail, { icon: true })}</dd>` : ''}${c.attachments ? `<dt>${esc(t('attachments'))}</dt><dd>${esc(c.attachments)}</dd>` : ''}</div></div>` : ''}
      ${c.notes ? `<div class="card"><p style="white-space:pre-wrap">${esc(c.notes)}</p></div>` : ''}
      ${notesHtml('client', id)}
      <section class="sec"><h2>${esc(t('history'))}</h2><div class="list">${h.cases.length ? h.cases.map(x => `<a class="card tap" href="#/case/${esc(x.id)}"><div class="row between"><span class="title">${esc(kindLabel(x.kind))}</span><span class="badge ${x.status === Office.STATUS.won || x.status === Office.STATUS.done ? 'ok' : 'muted'}">${esc(statusLabel(x.status))}</span></div>
        <div class="sub">${[x.date ? Office.fmt(x.date) : '', x.place, x.participants ? x.participants + ' ' + t('people') : '', x.budget].filter(Boolean).map(esc).join(' · ')}</div></a>`).join('') : empty(t('noCases'))}</div></section>
      <div class="row end"><button class="btn danger sm" id="del">${esc(t('delete'))}</button></div>
    </div>`;
  wireNotes(root, 'client', id);
  root.querySelector('#edit').onclick = () => edit(c);
  root.querySelector('#dial').onclick = () => dial(c.phone);
  root.querySelector('#wa').onclick = async () => { const r = await dialog(t('whatsapp'), `<textarea name="text" rows="6"></textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') }); if (r) openWhatsApp(c.phone, r.text); };
  root.querySelector('#del').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { db.remove('clients', id); location.hash = '#/clients'; } };
}

async function edit(c) {
  c = c || {};
  const r = await dialog(c.id ? t('edit') : t('newClient'), `<div class="grid2">${field('name', t('fClient'), c.name || '')}${field('contact', t('fName'), c.contact || '')}${field('phone', t('fPhone'), c.phone || '', { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), c.email || '', { ltr: true })}
    ${field('type', t('fType'), c.type || '', { type: 'select', options: [['', '']].concat(TYPES.map(x => [x, typeLabel(x)])) })}${field('lang', t('fLang'), c.lang || 'he', { type: 'select', options: [['he', langName('he')], ['en', langName('en')], ['fr', langName('fr')]] })}
    ${field('legalName', t('fLegal'), c.legalName || '')}${field('taxId', t('fTaxId'), c.taxId || '', { ltr: true })}</div>${field('address', t('fAddress'), c.address || '')}
    <h3>${esc(t('clientProcess'))}</h3><div class="grid2">${field('approver', t('approver'), c.approver || '')}${field('payer', t('payer'), c.payer || '')}${field('payTerms', t('payTermsClient'), c.payTerms || '')}${field('invoiceEmail', t('invoiceEmail'), c.invoiceEmail || '', { ltr: true, inputmode: 'email' })}</div>${field('attachments', t('attachments'), c.attachments || '')}${field('notes', t('fNotes'), c.notes || '', { type: 'textarea' })}`);
  if (!r || !r.name) return;
  if (c.id) r.id = c.id;
  const id = db.put('clients', r);
  db.list('cases', x => x.clientId === id).forEach(x => db.put('cases', { id: x.id, client: r.name }));
  toast(t('saved'));
  if (!c.id) location.hash = '#/client/' + id;
}

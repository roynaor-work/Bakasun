/* Suppliers: the pool with rating and type; one supplier with contact buttons and the events done with us. */
import { t, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, empty, dialog, confirmDialog, toast, dial, openWhatsApp } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';
import { supplierTypeLabel, stars, linkStatusLabel } from '../labels.js';
import { notesHtml, wireNotes } from '../notes.js';

let typeFilter = '';

export function render(ctx) {
  if (ctx.name === 'supplier' && ctx.id) return renderOne(ctx);
  const links = db.list('links');
  const list = Office.rankSuppliers(db.list('suppliers'), typeFilter, links).concat(db.list('suppliers', s => /^(לא|no)$/i.test(String(s.active || '')) && (!typeFilter || s.type === typeFilter)));
  const types = [''].concat(SUPPLIER_TYPES);
  ctx.root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('suppliers'))}</h1><button class="btn sm" id="new">+ ${esc(t('newSupplier'))}</button></header>
    <div class="tabs">${types.map(x => `<button class="${x === typeFilter ? 'on' : ''}" data-type="${esc(x)}">${esc(x ? supplierTypeLabel(x) : t('all'))}</button>`).join('')}</div>
    <div class="list sec">${list.length ? list.map(s => `<a class="card tap" href="#/supplier/${esc(s.id)}"><div class="row between"><span class="title">${esc(s.name)}</span><span class="badge ${/^(לא|no)$/i.test(String(s.active || '')) ? 'muted' : 'ok'}">${esc(stars(s.rating))}</span></div>
      <div class="sub">${[supplierTypeLabel(s.type), s.area, s.contact].filter(Boolean).map(esc).join(' · ')}${s.events ? ` · <span class="count">${s.events}</span> ${esc(t('eventsWith'))}` : ''}</div></a>`).join('') : empty(t('noSuppliers'))}</div>`;
  ctx.root.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { typeFilter = b.dataset.type; render(ctx); });
  ctx.root.querySelector('#new').onclick = () => edit(null);
}

function renderOne({ root, id }) {
  const s = db.get('suppliers', id);
  if (!s) { root.innerHTML = empty(t('noResults')); return; }
  const links = db.list('links', l => l.supplierId === id);
  const cases = {}; db.list('cases').forEach(c => { cases[c.id] = c; });
  root.innerHTML = `<header class="top"><a class="icon" href="#/suppliers" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(s.name)}</h1>
      <button class="icon" id="edit" aria-label="${esc(t('edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg></button></header>
    <div class="stack">
      <div class="card"><div class="row between"><span class="title">${esc(supplierTypeLabel(s.type))}</span><span class="badge ok">${esc(stars(s.rating))}</span></div>
        <div class="sub">${esc(s.contact || '')} <span class="ltr">${esc(phonePretty(s.phone))}</span>${s.email ? ' · ' + esc(s.email) : ''}${s.area ? ' · ' + esc(s.area) : ''}${s.lang ? ' · ' + esc(langName(s.lang)) : ''}</div>
        ${s.notes ? `<p class="sub" style="white-space:pre-wrap">${esc(s.notes)}</p>` : ''}
        <div class="row"><button class="btn wa" id="wa">${esc(t('whatsapp'))}</button><button class="btn" id="dial">${esc(t('call'))}</button></div></div>
      ${notesHtml('supplier', id)}
      <section class="sec"><h2>${esc(t('eventsWith'))} (<span class="count">${links.length}</span>)</h2><div class="list">${links.length ? links.map(l => { const c = cases[l.caseId] || {}; return `<a class="card tap" href="#/case/${esc(l.caseId)}"><div class="row between"><span class="title">${esc(c.client || '')}${c.date ? ' · ' + esc(Office.fmt(c.date)) : ''}</span><span class="badge muted">${esc(linkStatusLabel(l.status))}</span></div><div class="sub">${esc(l.what || '')}${l.cost ? ' · ' + esc(Office.money(l.cost)) : ''}${l.rating ? ' · ' + esc(stars(l.rating)) : ''}</div></a>`; }).join('') : empty(t('none'))}</div></section>
      <div class="row end"><button class="btn danger sm" id="del">${esc(t('delete'))}</button></div></div>`;
  wireNotes(root, 'supplier', id);
  root.querySelector('#edit').onclick = () => edit(s);
  root.querySelector('#dial').onclick = () => dial(s.phone);
  root.querySelector('#wa').onclick = async () => { const r = await dialog(t('whatsapp'), `<textarea name="text" rows="6"></textarea>`, { ok: t('whatsapp') }); if (r) openWhatsApp(s.phone, r.text); };
  root.querySelector('#del').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { db.remove('suppliers', id); location.hash = '#/suppliers'; } };
}

export async function edit(s, preset) {
  s = s || Object.assign({ type: '', active: 'כן', rating: 3 }, preset || {});
  const r = await dialog(s.id ? t('edit') : t('newSupplier'), `<div class="grid2">${field('name', t('name'), s.name || '')}${field('type', t('fType'), s.type || '', { type: 'select', options: SUPPLIER_TYPES.map(x => [x, supplierTypeLabel(x)]) })}
    ${field('contact', t('fName'), s.contact || '')}${field('phone', t('fPhone'), s.phone || '', { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), s.email || '', { ltr: true })}${field('area', t('area'), s.area || '')}
    ${field('lang', t('fLang'), s.lang || 'he', { type: 'select', options: [['he', langName('he')], ['en', langName('en')], ['fr', langName('fr')]] })}
    ${field('rating', t('rating'), s.rating || 3, { type: 'select', options: [5, 4, 3, 2, 1].map(n => [n, stars(n)]) })}
    ${field('active', t('active'), s.active || 'כן', { type: 'select', options: [['כן', '✓'], ['לא', '✗']] })}</div>${field('notes', t('fNotes'), s.notes || '', { type: 'textarea' })}`);
  if (!r || !r.name) return null;
  if (s.id) r.id = s.id;
  const id = db.put('suppliers', r); toast(t('saved'));
  if (!s.id && !preset) location.hash = '#/supplier/' + id;
  return id;
}

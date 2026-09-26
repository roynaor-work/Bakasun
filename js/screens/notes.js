/* All notes, newest first, with a filter by who they are about. */
import { t } from '../i18n.js';
import { db } from '../store.js';
import { esc, empty } from '../ui.js';
import Office from '../logic/office.js';
import { quickNote } from '../notes.js';

let filter = '';
const LINK = { client: id => '#/client/' + id, supplier: id => '#/supplier/' + id, case: id => '#/case/' + id };

export function render(ctx) {
  const all = db.list('notes').sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const list = filter ? all.filter(n => n.about === filter) : all;
  const tabs = [['', 'all'], ['client', 'clients'], ['supplier', 'suppliers'], ['case', 'cases'], ['', 'general']];
  ctx.root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('notes'))}</h1><button class="btn sm primary" id="new">🎙 ${esc(t('quickNote'))}</button></header>
    <div class="tabs">${[['', t('all')], ['client', t('clients')], ['supplier', t('suppliers')], ['case', t('cases')]].map(x => `<button class="${filter === x[0] ? 'on' : ''}" data-f="${x[0]}">${esc(x[1])}</button>`).join('')}</div>
    <div class="list sec">${list.length ? list.map(n => `<div class="card" data-note="${esc(n.id)}"><p style="white-space:pre-wrap">${esc(n.text)}</p>
      <div class="row between"><span class="sub">${n.about && LINK[n.about] ? `<a href="${LINK[n.about](n.aboutId)}"><b>${esc(n.aboutLabel)}</b></a> · ` : ''}${esc(Office.fmt(n.created))}</span><button class="btn sm ghost" data-delnote>${esc(t('delete'))}</button></div></div>`).join('') : empty(t('noNotes'))}</div>`;
  ctx.root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(ctx); });
  ctx.root.querySelector('#new').onclick = () => quickNote();
  ctx.root.querySelectorAll('[data-note]').forEach(el => { el.querySelector('[data-delnote]').onclick = () => db.remove('notes', el.dataset.note); });
}

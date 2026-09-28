/* One search over everything: cases, clients, calls, tasks, suppliers. Phones match by digits. */
import { t } from '../i18n.js';
import { db } from '../store.js';
import { esc, empty } from '../ui.js';
import Office from '../logic/office.js';
import { searchDocs } from '../logic/extra.js';

export const noLive = true;
let q = '';
const LINK = { case: id => '#/case/' + id, client: id => '#/client/' + id, call: () => '#/calls', task: () => '#/tasks', supplier: id => '#/supplier/' + id, note: (id, h) => h.about === 'client' ? '#/client/' + h.aboutId : h.about === 'supplier' ? '#/supplier/' + h.aboutId : h.about === 'case' ? '#/case/' + h.aboutId : '#/notes' };

export function render({ root, id }) {
  if (id) { try { q = decodeURIComponent(id); } catch (e) { q = id; } }
  root.innerHTML = `<header class="top"><a class="icon" href="#/today" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>
    <input id="q" type="search" placeholder="${esc(t('searchPh'))}" value="${esc(q)}" autofocus></header><div id="res" class="list"></div>`;
  const inp = root.querySelector('#q'), res = root.querySelector('#res');
  const draw = () => {
    q = inp.value;
    const hits = Office.search(searchDocs(db.snapshot()), q);
    res.innerHTML = !q.trim() ? '' : hits.length ? hits.map(h => `<a class="card tap" href="${LINK[h.type](h.id, h)}"><div class="row between"><span class="title">${esc(h.title || t('general'))}</span><span class="badge muted">${esc(t(h.type === 'case' ? 'caseOf' : h.type === 'client' ? 'clients' : h.type === 'call' ? 'calls' : h.type === 'task' ? 'tasks' : h.type === 'note' ? 'notes' : 'suppliers'))}</span></div><div class="sub">${esc(h.sub)}</div></a>`).join('') : empty(t('noResults'));
  };
  inp.oninput = draw; draw(); setTimeout(() => inp.focus(), 50);
}

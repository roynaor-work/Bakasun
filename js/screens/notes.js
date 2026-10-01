/* All notes, newest first, with a filter by who they are about. */
import { t } from '../i18n.js';
import { db } from '../store.js';
import { esc, empty, confirmDialog, copyBtn } from '../ui.js';
import Office from '../logic/office.js';
import { quickNote } from '../notes.js';

let filter = '';
/* Where a note's subject lives. A task opens the tasks screen (filtered to its event) with "#<no>" in the search box, see goTask. */
const LINK = { client: id => '#/client/' + id, supplier: id => '#/supplier/' + id, case: id => '#/case/' + id, team: () => '#/settings', contact: () => '#/settings',
  staff: id => { const x = db.get('staff', id); return x && x.caseId ? '#/case/' + x.caseId + '/plan' : '#/cases'; },
  task: id => { const x = db.get('tasks', id); return x && x.caseId ? '#/tasks/case/' + x.caseId : '#/tasks'; } };
/** Opens the tasks screen on the task's event and puts "#<no>" in its search box (the tasks screen has no per-task route). */
function goTask(id) {
  const x = db.get('tasks', id);
  location.hash = LINK.task(id);
  if (!x || !x.no) return;
  let tries = 0;
  const fill = () => { const q = document.getElementById('tkq'); if (q) { q.value = '#' + x.no; q.dispatchEvent(new Event('input', { bubbles: true })); } else if (++tries < 20) setTimeout(fill, 50); };
  setTimeout(fill, 50);
}

export function render(ctx) {
  const all = db.list('notes').sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const list = filter ? all.filter(n => n.about === filter) : all;
  ctx.root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('notes'))}</h1><button class="btn sm primary" id="new">🎙 ${esc(t('quickNote'))}</button></header>
    <div class="tabs">${[['', t('all')], ['client', t('clients')], ['supplier', t('suppliers')], ['case', t('cases')], ['task', t('tasks')]].map(x => `<button class="${filter === x[0] ? 'on' : ''}" data-f="${x[0]}">${esc(x[1])}</button>`).join('')}</div>
    <div class="list sec">${list.length ? list.map(n => `<div class="card" data-note="${esc(n.id)}"><p style="white-space:pre-wrap">${esc(n.text)}</p>
      <div class="row between"><span class="sub">${n.about && LINK[n.about] ? `<a href="${LINK[n.about](n.aboutId)}"${n.about === 'task' ? ` data-task="${esc(n.aboutId)}"` : ''}><b>${esc(n.aboutLabel)}</b></a> · ` : ''}${esc(Office.fmt(n.created))}</span><span class="row">${copyBtn(n.text)}<button class="btn sm ghost" data-delnote>${esc(t('delete'))}</button></span></div></div>`).join('') : empty(t('noNotes'))}</div>`;
  ctx.root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(ctx); });
  ctx.root.querySelector('#new').onclick = () => quickNote();
  ctx.root.querySelectorAll('a[data-task]').forEach(a => a.onclick = e => { e.preventDefault(); goTask(a.dataset.task); });
  ctx.root.querySelectorAll('[data-note]').forEach(el => { el.querySelector('[data-delnote]').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) db.remove('notes', el.dataset.note); }; });
}

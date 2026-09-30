/* Seating and grouping for one case: tables, rooms, buses. Tap a name, then tap a container. */
import { t, lang } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, empty, dialog, toast, copyText, openWhatsApp, copyBtn, copyOf } from '../ui.js';
import { GROUP_KINDS, parsePeople, makeContainers, summary, autoFill, containerText, allText } from '../logic/groups.js';
import { groupKindLabel } from '../labels.js';

let selected = null;

export function render({ root, id }) {
  const cs = db.get('cases', id);
  if (!cs) { root.innerHTML = empty(t('noResults')); return; }
  let g = db.list('groups', x => x.caseId === id)[0];
  const back = `<a class="icon" href="#/case/${esc(id)}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;
  if (!g) {
    root.innerHTML = `<header class="top">${back}<h1>${esc(t('groups'))}</h1></header>
      <form class="stack" id="setup"><div class="grid2">${field('kind', t('groupKind'), 'שולחנות', { type: 'select', options: GROUP_KINDS.map(k => [k, groupKindLabel(k)]) })}${field('n', t('howMany'), 10, { type: 'number', inputmode: 'numeric' })}${field('capacity', t('capacity'), 10, { type: 'number', inputmode: 'numeric' })}</div>
      ${field('people', t('people'), '', { type: 'textarea', rows: 8, placeholder: t('pastePeople') })}<button class="btn primary" type="submit">${esc(t('save'))}</button></form>`;
    root.querySelector('#setup').onsubmit = e => {
      e.preventDefault(); const o = {}; new FormData(e.target).forEach((v, k) => { o[k] = v; });
      db.put('groups', { caseId: id, kind: o.kind, containers: makeContainers(o.kind, +o.n || 1, +o.capacity || 0, lang()), people: parsePeople(o.people) });
    };
    return;
  }
  const sm = summary(g.people, g.containers);
  const person = p => `<button type="button" class="chip ${selected === p.name ? 'on' : ''}" data-p="${esc(p.name)}">${esc(p.name)}${p.note ? ` <span class="sub">· ${esc(p.note)}</span>` : ''}</button>`;
  root.innerHTML = `<header class="top">${back}<h1>${esc(groupKindLabel(g.kind))} · ${esc(cs.client || '')}</h1></header>
    <div class="stack">
      <div class="row"><span class="badge ok"><span class="count">${sm.placed}/${g.people.length}</span></span>${sm.over.length ? `<span class="badge">${esc(t('over'))}: ${sm.over.map(c => esc(c.name)).join(', ')}</span>` : ''}
        <button class="btn sm" id="auto">${esc(t('autoFill'))}</button><button class="btn sm ghost" id="addPeople">+ ${esc(t('people'))}</button><button class="btn sm ghost" id="addC">+ ${esc(groupKindLabel(g.kind))}</button></div>
      <p class="hint">${esc(t('tapToPlace'))}</p>
      <section class="card"><h2>${esc(t('unassigned'))} (<span class="count">${sm.unassigned.length}</span>)</h2><div class="chips">${sm.unassigned.map(person).join('') || `<span class="sub">${esc(t('none'))}</span>`}</div></section>
      ${sm.containers.map(c => `<section class="card cont ${c.over ? 'overc' : ''}" data-c="${esc(c.id)}"><div class="row between"><h2>${esc(c.name)}</h2><span class="badge ${c.over ? '' : 'muted'}"><span class="count">${c.count}${c.capacity ? '/' + c.capacity : ''}</span></span><button class="btn sm ghost" data-send="${esc(c.id)}">${esc(t('sendList'))}</button>${copyBtn(containerText(c, g.people, cs))}</div>
        <div class="chips">${g.people.filter(p => p.group === c.id).map(person).join('')}</div></section>`).join('')}
      <div class="row"><button class="btn" id="copyAll">${esc(t('copyList'))}</button><button class="btn ghost" id="clear">${esc(t('clearGroups'))}</button></div>
    </div>`;
  const save = people => db.put('groups', { id: g.id, people });
  root.querySelectorAll('[data-p]').forEach(b => b.onclick = e => { e.stopPropagation(); selected = selected === b.dataset.p ? null : b.dataset.p; render({ root, id }); });
  root.querySelectorAll('.cont').forEach(sec => sec.onclick = e => {
    if (e.target.closest('[data-send],[data-copy]')) return;
    if (!selected) return;
    const people = g.people.map(p => p.name === selected ? Object.assign({}, p, { group: sec.dataset.c }) : p);
    selected = null; save(people);
  });
  root.querySelectorAll('[data-send]').forEach(b => b.onclick = async () => {
    const c = g.containers.find(x => x.id === b.dataset.send);
    const r = await dialog(t('sendList'), field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' }) + `<textarea name="text" rows="10">${esc(containerText(c, g.people, cs))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
    if (r) openWhatsApp(r.phone, r.text);
  });
  root.querySelector('#auto').onclick = () => save(autoFill(g.people, g.containers));
  root.querySelector('#clear').onclick = () => save(g.people.map(p => Object.assign({}, p, { group: '' })));
  root.querySelector('#copyAll').onclick = () => copyText(allText(g.containers, g.people, cs));
  root.querySelector('#addPeople').onclick = async () => {
    const r = await dialog(t('people'), field('people', t('people'), '', { type: 'textarea', rows: 8, placeholder: t('pastePeople') }), { ok: t('add') });
    if (!r) return;
    const have = {}; g.people.forEach(p => { have[p.name] = 1; });
    save(g.people.concat(parsePeople(r.people).filter(p => !have[p.name])));
  };
  root.querySelector('#addC').onclick = () => {
    const n = g.containers.length + 1;
    const one = makeContainers(g.kind, 1, g.containers[0] ? g.containers[0].capacity : 0, lang())[0];
    db.put('groups', { id: g.id, containers: g.containers.concat([{ id: 'g' + n, name: one.name.replace(/\d+$/, String(n)), capacity: one.capacity }]) });
  };
}

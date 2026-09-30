/* The working group card: who is in it, the question "how do you want to work with it", and the ways: WhatsApp (share the
   brief; WhatsApp itself creates the group), mail to all, the brief text, a task for everyone. Saved on the event.
   Nothing is sent by the app: every option opens the phone's app and she taps send there. */
import { t, lang } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, dialog, toast, openWhatsApp, openWhatsAppPick, openMail, copyBtn, copyText } from '../ui.js';
import Office from '../logic/office.js';
import { TASK } from '../logic/extra.js';
import { registerCaseTab } from '../caseTabs.js';
import { resolveNames, briefText, groupOption } from '../logic/workgroup.js';
import { remember } from '../logic/undo.js';
import { DEFAULTS } from '../data/defaults.js';

const caseLine = c => [c.client, c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ');
const activeCases = () => db.list('cases', x => Office.ACTIVE.includes(x.status)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
const openTasks = cid => cid ? db.list('tasks', x => x.caseId === cid && x.status !== TASK.done && !x.isTemplate).sort((a, b) => String(a.due || '').localeCompare(String(b.due || ''))) : [];

/** Builds the group from what she said and draws the card into `out`. ctx: {people, caseByName, s}. */
export function showWorkGroup(out, req, ctx) {
  const cs = req.caseName ? ctx.caseByName(req.caseName, req.caseName) : (activeCases().length === 1 ? activeCases()[0] : null);
  const g = { caseId: cs ? cs.id : '', members: resolveNames(req.names, ctx.people()) };
  // a group already saved on this event: her new names join it
  const prev = cs ? db.list('workgroups', x => x.caseId === cs.id)[0] : null;
  if (prev) { g.id = prev.id; (prev.members || []).forEach(m => { if (!g.members.some(x => Office.normHe(x.name) === Office.normHe(m.name))) g.members.push(m); }); }
  draw(out, g, ctx);
}

/** She answered the question by voice ("whatsapp", "mail", "add Dana"): the matching button on the card on screen. */
export function answerWorkGroup(out, text) {
  const card = out && out.querySelector('.wg'); if (!card) return false;
  const opt = groupOption(text); if (!opt) return false;
  if (typeof opt === 'object') { const inp = card.querySelector('#wgAddName'); inp.value = opt.add; card.querySelector('#wgAddBtn').click(); return true; }
  const b = card.querySelector(`[data-opt="${opt}"]`); if (b) { b.click(); return true; }
  return false;
}

function save(g) {
  const rec = { caseId: g.caseId || '', members: g.members, updatedAt: new Date().toISOString() };
  if (g.id) rec.id = g.id;
  g.id = db.put('workgroups', rec);
  return g.id;
}

function draw(out, g, ctx, opened) {
  const s = ctx.s || {};
  const cs = g.caseId ? db.get('cases', g.caseId) : null;
  const cases = activeCases();
  const brief = briefText(cs, g.members, openTasks(g.caseId), { lang: lang(), signer: s.signer || DEFAULTS.signer });
  const missing = g.members.filter(m => !m.phone && !m.email);
  const noMail = g.members.filter(m => !m.email);
  out.innerHTML = `<div class="card stack wg">
    <div class="row between"><span class="title">${esc(t('wgTitle'))}${cs ? ' · ' + esc(caseLine(cs)) : ''}</span></div>
    ${!cs ? `<div class="sub"><b>${esc(t('wgWhichCase'))}</b></div><div class="chips">${cases.map(c => `<button type="button" class="chip" data-case="${esc(c.id)}">${esc(caseLine(c))}</button>`).join('')}<button type="button" class="chip on" data-case="">${esc(t('wgNoCase'))}</button></div>` : ''}
    <div class="sub"><b>${esc(t('wgMembers'))}</b> (${g.members.length})</div>
    <div class="list">${g.members.map((m, i) => `<div class="row between" data-m="${i}"><span>${esc(m.name)}${m.role ? ' · ' + esc(m.role) : ''} ${m.phone ? `<span class="ltr">${esc(m.phone)}</span>` : m.email ? `<span class="ltr">${esc(m.email)}</span>` : `<span class="badge warn">${esc(m.known ? t('wgNoDetails') : t('wgUnknown'))}</span>`}</span><span class="row">${!m.phone && !m.email ? `<button type="button" class="btn sm ghost" data-fill="${i}">${esc(t('wgAddPhone'))}</button>` : ''}<button type="button" class="btn sm ghost" data-rm="${i}" aria-label="${esc(t('wgRemove'))}">✕</button></span></div>`).join('')}</div>
    <div class="row"><input id="wgAddName" class="grow" placeholder="${esc(t('wgAddPh'))}"><button type="button" class="btn sm" id="wgAddBtn">+ ${esc(t('wgAdd'))}</button></div>
    <p><b>${esc(t('wgAsk'))}</b></p>
    <div class="row wrap"><button type="button" class="btn wa" data-opt="wa">${esc(t('wgOptWa'))}</button><button type="button" class="btn" data-opt="mail">${esc(t('wgOptMail'))}</button><button type="button" class="btn" data-opt="brief">${esc(t('wgOptBrief'))}</button><button type="button" class="btn" data-opt="tasks">${esc(t('wgOptTasks'))}</button><button type="button" class="btn ghost" data-opt="save">${esc(t('wgOptSave'))}</button></div>
    <div id="wgOut" class="stack"></div></div>`;
  const card = out.querySelector('.wg'), o = card.querySelector('#wgOut');
  const redraw = () => draw(out, g, ctx);
  card.querySelectorAll('[data-case]').forEach(b => b.onclick = () => { g.caseId = b.dataset.case; redraw(); });
  card.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { g.members.splice(+b.dataset.rm, 1); redraw(); });
  card.querySelectorAll('[data-fill]').forEach(b => b.onclick = async () => {
    const m = g.members[+b.dataset.fill];
    const r = await dialog(m.name, `<div class="grid2">${field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), '', { ltr: true, inputmode: 'email' })}</div>`, { ok: t('save') });
    if (!r || (!r.phone && !r.email)) return;
    m.phone = r.phone || ''; m.email = r.email || '';
    // kept on the person's card too, so next time the app knows them
    if (m.id && m.about) { const col = m.about === 'client' ? 'clients' : m.about === 'supplier' ? 'suppliers' : m.about === 'team' ? 'team' : m.about === 'contact' ? 'contacts' : ''; if (col) db.put(col, { id: m.id, phone: r.phone || undefined, email: r.email || undefined }); }
    else { m.id = db.put('contacts', { name: m.name, phone: m.phone, email: m.email }); m.about = 'contact'; m.known = true; }
    toast(t('personSaved')); redraw();
  });
  card.querySelector('#wgAddBtn').onclick = () => {
    const v = card.querySelector('#wgAddName').value.trim(); if (!v) return;
    const ph = /(?:\+972[\s\-]?|0)5\d[\s\-]?\d{3}[\s\-]?\d{4}/.exec(v);
    const name = ph ? v.replace(ph[0], '').replace(/[,:\-–]+$/, '').trim() : v;
    resolveNames([name], ctx.people()).forEach(m => { if (ph && !m.phone) m.phone = ph[0]; if (!g.members.some(x => Office.normHe(x.name) === Office.normHe(m.name))) g.members.push(m); });
    redraw();
  };
  const needCase = () => { if (!cs) { o.innerHTML = `<p class="warnbox">${esc(t('wgNeedCase'))}</p>`; return false; } return true; };
  const ev = cs ? caseLine(cs) : t('wgTitle');
  card.querySelector('[data-opt=save]').onclick = () => { save(g); toast(t('wgSaved'), 2500); };
  card.querySelector('[data-opt=brief]').onclick = () => {
    save(g);
    o.innerHTML = `<div class="sub"><b>${esc(t('wgBrief'))}</b></div><textarea rows="12" id="wgBrief">${esc(brief)}</textarea><div class="row">${copyBtn(brief)}</div>`;
  };
  card.querySelector('[data-opt=wa]').onclick = () => {
    save(g);
    const phones = g.members.filter(m => m.phone).map(m => m.name + ': ' + m.phone).join('\n');
    o.innerHTML = `<p class="hint">${esc(t('wgWaHow'))}</p>
      ${phones ? `<div class="sub"><b>${esc(t('wgPhones'))}</b> ${copyBtn(phones, { icon: true })}</div><pre class="ltr" style="white-space:pre-wrap;font:inherit">${esc(phones)}</pre>` : ''}
      <div class="row"><button type="button" class="btn wa grow" id="wgShare">${esc(t('wgShareWa'))}</button>${copyBtn(brief)}</div>
      ${g.members.some(m => m.phone) ? `<div class="sub">${esc(t('wgOneByOne'))}</div><div class="chips">${g.members.map((m, i) => m.phone ? `<button type="button" class="chip" data-one="${i}">${esc(m.name)}</button>` : '').join('')}</div>` : ''}
      ${missing.length ? `<p class="warnbox">${esc(t('wgNotFound', { who: missing.map(m => m.name).join(', ') }))}</p>` : ''}`;
    o.querySelector('#wgShare').onclick = () => openWhatsAppPick(brief);
    o.querySelectorAll('[data-one]').forEach(b => b.onclick = () => openWhatsApp(g.members[+b.dataset.one].phone, brief));
  };
  card.querySelector('[data-opt=mail]').onclick = () => {
    save(g);
    const to = g.members.filter(m => m.email).map(m => m.email).join(',');
    o.innerHTML = `<div class="row"><button type="button" class="btn primary grow" id="wgMail" ${to ? '' : 'disabled'}>${esc(t('wgMailAll'))}</button>${copyBtn(brief)}</div>
      ${to ? `<p class="sub ltr">${esc(to)} ${copyBtn(to, { icon: true })}</p>` : ''}
      ${noMail.length ? `<p class="warnbox">${esc(t('wgNoMail', { who: noMail.map(m => m.name).join(', ') }))}</p>` : ''}`;
    const b = o.querySelector('#wgMail'); if (b) b.onclick = () => openMail(to, t('wgTitle') + ' · ' + ev + ' · ' + (s.bizName || DEFAULTS.bizName), brief);
  };
  card.querySelector('[data-opt=tasks]').onclick = () => {
    if (!needCase()) return;
    save(g);
    const due = Office.iso(Office.addDays(new Date(), 1)); const ids = [];
    g.members.forEach(m => ids.push(db.put('tasks', { title: t('wgTaskTitle', { event: ev }), who: m.name, phone: m.phone || '', caseId: g.caseId, due, status: TASK.open, lang: s.msgLang || 'he' })));
    remember(t('wgTasksMade', { n: ids.length }), () => ids.forEach(id => db.remove('tasks', id)));
    o.innerHTML = `<p class="okbox">${esc(t('wgTasksMade', { n: ids.length }))} <a class="btn sm" href="#/tasks/case/${esc(g.caseId)}">${esc(t('tasks'))}</a></p>`;
  };
  if (opened) card.querySelector(`[data-opt=${opened}]`).click();
}

/* The event's "group" tab: the saved group with the same card. */
registerCaseTab({
  key: 'workgroup', label: () => t('wgTabTitle'),
  render(body, c, s) {
    const g = db.list('workgroups', x => x.caseId === c.id)[0];
    if (!g) { body.innerHTML = `<p class="hint">${esc(t('wgNoGroup'))}</p><div class="row"><a class="btn sm" href="#/assist">${esc(t('wgTitle'))}</a></div>`; return; }
    const people = () => import('../notes.js').then(m => m.subjects());
    // people are only needed for adding names; the saved members already carry their details
    const ctx = { s, people: () => db.list('staff').map(x => ({ label: x.name, names: [x.name], phone: x.phone, email: x.email, about: 'staff', id: x.id })).concat(db.list('contacts').map(x => ({ label: x.name, names: [x.name], phone: x.phone, email: x.email, about: 'contact', id: x.id }))).concat(db.list('team').map(x => ({ label: x.name, names: [x.name], phone: x.phone, email: x.email, about: 'team', id: x.id }))), caseByName: () => c };
    void people;
    draw(body, { id: g.id, caseId: c.id, members: (g.members || []).slice() }, ctx);
  }
});

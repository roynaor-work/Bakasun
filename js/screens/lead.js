/* A new inquiry: paste the client's message or dictate it, the logic reads the six things she always asks,
   she fixes what it missed, saves, and (only if she taps) WhatsApp opens with the questions that are still missing. */
import { t, lang, LANGS, SPEECH, kindLabel, langName } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, toast, openWhatsApp } from '../ui.js';
import Office from '../logic/office.js';
import { TASK } from '../logic/extra.js';
import { PLACES } from '../data/places.js';
import { matchClient } from '../logic/extra.js';
import { speechSupported, listen } from '../voice.js';
import { parseBrief } from '../logic/brief.js';
import { wireDelete, isDeleteCommand, stripDelete, stripDone } from '../recbox.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';
import { supplierTypeLabel } from '../labels.js';

export const noLive = true;
let draft = { text: '', lead: null };
let stopRec = null;

export function render({ root }) {
  const s = db.settings();
  const pre = sessionStorage.getItem('bakasun.leadText'); if (pre != null) { sessionStorage.removeItem('bakasun.leadText'); draft = { text: pre, lead: null }; }
  const autoRead = pre != null && pre.trim().length > 3;
  const dictLang = s.dictLang || lang();
  root.innerHTML = `
    <header class="top"><a class="icon" href="#/today" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('newLead'))}</h1></header>
    <div class="stack">
      <p class="hint">${esc(t('leadIntro'))}</p>
      <textarea id="msg" rows="6" placeholder="${esc(t('leadPlaceholder'))}">${esc(draft.text)}</textarea>
      <div class="row">
        <button class="btn rec" id="rec" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>${esc(t('dictate'))}</span></button>
        <select id="dictLang" aria-label="${esc(t('dictateLang'))}">${Object.keys(LANGS).map(k => `<option value="${k}"${k === dictLang ? ' selected' : ''}>${esc(LANGS[k])}</option>`).join('')}</select>
        <button class="btn primary grow" id="read" type="button">${esc(t('read'))}</button>
      </div>
      <div id="form"></div>
    </div>`;

  const msg = root.querySelector('#msg');
  const rec = root.querySelector('#rec');
  const sel = root.querySelector('#dictLang');
  sel.onchange = () => db.setting('dictLang', sel.value);
  msg.oninput = () => { draft.text = msg.value; };
  const bin = wireDelete(root, msg, 'lead', v => { draft.text = v; });

  let manual = false;
  rec.onclick = () => {
    if (stopRec) { stopRec(); return; }
    if (!speechSupported()) { toast(t('noSpeech'), 3500); return; }
    const base = msg.value ? msg.value.replace(/\s+$/, '') + '\n' : '';
    rec.classList.add('on'); rec.querySelector('span').textContent = t('doneBtn'); manual = false;
    stopRec = listen(SPEECH[sel.value] || 'he-IL', text => { msg.value = base + text; draft.text = msg.value; }, (said, why, finals) => {
      stopRec = null; rec.classList.remove('on'); rec.querySelector('span').textContent = t('dictate');
      const lastSaid = (finals || []).slice(-1)[0] || '';
      const without = rest => { msg.value = (base + (finals || []).slice(0, -1).concat(rest ? [rest] : []).join(' ')).trim(); draft.text = msg.value; };
      const delRest = stripDelete(lastSaid), doneRest = stripDone(lastSaid);
      if (delRest !== null) { without(delRest); if (bin) bin.doDelete(); return; }
      if (manual) return;
      const run = doneRest !== null || why === 'stop';
      if (doneRest !== null) without(doneRest);
      if (!run) { toast(t('stoppedHint'), 4000); return; }
      if (msg.value.trim().length > 3) { toast(t('heardRunning'), 1500); root.querySelector('#read').click(); }
    }, { silence: 10000, stopOn: x => stripDone(x) !== null || stripDelete(x) !== null });
    if (!stopRec) { rec.classList.remove('on'); rec.querySelector('span').textContent = t('dictate'); toast(t('noSpeech'), 3500); }
  };

  root.querySelector('#read').onclick = () => {
    if (stopRec) { manual = true; stopRec(); }
    if (isDeleteCommand(msg.value)) { if (bin) bin.doDelete(); return; }
    const b = parseBrief(msg.value, PLACES, new Date(), db.list('clients'));
    draft.lead = b.lead; draft.lead.source = msg.value; draft.lead.needs = b.needs; draft.lead.tasks = b.tasks; draft.lead.days = b.days; draft.lead.rooms = b.rooms;
    drawForm(root.querySelector('#form'), draft.lead, s);
  };
  if (autoRead) setTimeout(() => root.querySelector('#read').click(), 60);
  if (draft.lead) drawForm(root.querySelector('#form'), draft.lead, s);
}

function drawForm(box, lead, s) {
  const miss = Office.missingOf(lead);
  const isMissing = k => miss.includes(k) ? ' missing' : '';
  const kinds = [['', t('pickKind')]].concat(Office.KINDS.map(k => [k, kindLabel(k)]));
  const langs = ['he', 'en', 'fr'].map(k => [k, langName(k)]);
  box.innerHTML = `<form class="stack" id="leadForm">
    <div class="row">${miss.length ? `<span class="badge warn">${esc(t('missing'))}: ${miss.map(k => esc(t('f' + k[0].toUpperCase() + k.slice(1)))).join(', ')}</span>` : `<span class="badge ok">${esc(t('allThere'))}</span>`}</div>
    <div class="grid2">
      ${field('client', t('fClient'), lead.client || '')}
      ${field('name', t('fName'), lead.name)}
      ${field('phone', t('fPhone'), lead.phone, { ltr: true, inputmode: 'tel' })}
      ${field('email', t('fEmail'), lead.email, { ltr: true, inputmode: 'email' })}
      <div class="f${isMissing('kind')}"><span>${esc(t('fKind'))}</span><select name="kind">${kinds.map(o => `<option value="${esc(o[0])}"${o[0] === lead.kind ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>
      <div class="f${isMissing('date')}"><span>${esc(t('fDate'))}</span><input name="date" type="date" value="${esc(lead.date)}"></div>
      <div class="f${isMissing('participants')}"><span>${esc(t('fParticipants'))}</span><input name="participants" value="${esc(lead.participants)}"></div>
      <div class="f${isMissing('budget')}"><span>${esc(t('fBudget'))}</span><input name="budget" value="${esc(lead.budget)}"></div>
      <div class="f${isMissing('place')}"><span>${esc(t('fPlace'))}</span><input name="place" value="${esc(lead.place)}"></div>
      <div class="f"><span>${esc(t('fLang'))}</span><select name="lang">${langs.map(o => `<option value="${o[0]}"${o[0] === lead.lang ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>
    </div>
    <div class="f${isMissing('purpose')}"><span>${esc(t('fPurpose'))}</span><input name="purpose" value="${esc(lead.purpose)}"></div>
    <div class="f"><span>${esc(t('needsFound'))}</span><p class="hint">${esc((lead.needs || []).length ? t('needsHint') : t('noNeeds'))}</p>
      <div class="pick">${SUPPLIER_TYPES.map(x => `<label class="chk"><input type="checkbox" name="needs" value="${esc(x)}"${(lead.needs || []).includes(x) ? ' checked' : ''}> ${esc(supplierTypeLabel(x))}</label>`).join('')}</div></div>
    ${(lead.tasks || []).length ? `<div class="f"><span>${esc(t('tasksFound'))}</span><div class="pick">${lead.tasks.map((x, i) => `<label class="chk"><input type="checkbox" name="tasks" value="${i}" checked> ${esc(x.title)}</label>`).join('')}</div></div>` : ''}
    <div class="row"><button class="btn primary grow" type="submit">${esc(t('saveCase'))}</button></div>
  </form>`;
  box.querySelector('#leadForm').onsubmit = e => {
    e.preventDefault();
    const o = {}, needs = [], picked = []; new FormData(e.target).forEach((v, k) => { if (k === 'needs') needs.push(String(v)); else if (k === 'tasks') picked.push(+v); else o[k] = String(v).trim(); });
    const existing = matchClient({ phone: o.phone, email: o.email, client: o.client }, db.list('clients'));
    let clientId;
    if (existing) {
      clientId = existing.id;
      if (!existing.contact && o.name) db.put('clients', { id: clientId, contact: o.name });
    } else {
      clientId = db.put('clients', { name: o.client || o.name || t('unknownClient'), contact: o.name, phone: o.phone, email: o.email, lang: o.lang, type: '' });
    }
    const cs = { clientId, client: o.client || (existing && existing.name) || o.name || t('unknownClient'), contact: o.name, phone: o.phone, email: o.email,
      kind: o.kind, date: o.date, participants: o.participants, budget: o.budget, place: o.place, purpose: o.purpose, lang: o.lang,
      status: Office.STATUS.lead, source: lead.source || '', opened: todayIso(), needs, days: lead.days || '', rooms: lead.rooms || '' };
    const id = db.put('cases', cs);
    picked.forEach(i => { const tk = (lead.tasks || [])[i]; if (tk) db.put('tasks', { caseId: id, title: tk.title, who: t('me'), due: Office.iso(Office.addDays(new Date(), 1)), status: TASK.open, lang: o.lang || 'he' }); });
    const stillMissing = Office.missingOf(cs);
    draft = { text: '', lead: null };
    toast(t('saved'));
    if (stillMissing.length && o.phone) {
      const text = Office.followupQuestions(Object.assign({}, cs, { name: o.name, missing: stillMissing }), o.lang, s.signer || '');
      box.innerHTML = `<div class="stack"><p class="warnbox">${esc(t('missing'))}: ${stillMissing.map(k => esc(t('f' + k[0].toUpperCase() + k.slice(1)))).join(', ')}</p>
        <textarea id="q" rows="7">${esc(text)}</textarea>
        <div class="row"><button class="btn wa grow" id="ask">${esc(t('askMissing'))}</button><a class="btn" href="#/case/${esc(id)}">${esc(t('open'))}</a></div></div>`;
      box.querySelector('#ask').onclick = () => {
        if (openWhatsApp(o.phone, box.querySelector('#q').value)) { db.put('cases', { id, waitingSince: todayIso() }); location.hash = '#/case/' + id; }
      };
    } else location.hash = '#/case/' + id;
  };
}

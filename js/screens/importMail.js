/* #/import: she pastes a client's e-mail (or a WhatsApp message) as it is, taps "read", checks the card the parser filled,
   and opens the inquiry. The original mail is kept as a note on the case. Nothing is sent. The reading itself is
   js/logic/mailImport.js (pure, tested). */
import { t, lang, kindLabel, langName } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, toast, dialog, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { PLACES } from '../data/places.js';
import { matchClient } from '../logic/extra.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';
import { supplierTypeLabel } from '../labels.js';
import { parseMail, missingOf, summaryText } from '../logic/mailImport.js';

export const noLive = true;
const PRE_KEY = 'bakasun.importText';
let draft = { text: '', parsed: null, auto: false };

const read = text => parseMail(text, { clients: db.list('clients'), places: PLACES, today: new Date() });

/** Other screens (the voice box) hand a text over: it lands in the paste box, already read. Returns what was read. */
export function importFromText(text, ctx) {
  draft = { text: String(text || ''), parsed: null, auto: true };
  if (ctx && ctx.root && (ctx.name === 'import' || location.hash.replace(/^#\/?/, '').split('/')[0] === 'import')) render(ctx);
  else { try { sessionStorage.setItem(PRE_KEY, draft.text); } catch (e) { /* storage blocked: the draft is kept in memory */ } location.hash = '#/import'; }
  return read(draft.text);
}

export function render({ root }) {
  let pre = null;
  try { pre = sessionStorage.getItem(PRE_KEY); if (pre != null) sessionStorage.removeItem(PRE_KEY); } catch (e) { /* nothing */ }
  if (pre != null) draft = { text: pre, parsed: null, auto: true };
  root.innerHTML = `
    <header class="top"><a class="icon" href="#/today" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('imTitle'))}</h1></header>
    <div class="stack im">
      <p class="hint">${esc(t('imIntro'))}</p>
      <textarea id="mail" class="im-box" rows="9" dir="auto" placeholder="${esc(t('imPlaceholder'))}">${esc(draft.text)}</textarea>
      <div class="row">
        <button class="btn primary grow" id="read" type="button">${esc(t('imRead'))}</button>
        <button class="btn ghost" id="clear" type="button">${esc(t('imClear'))}</button>
      </div>
      <div id="form"></div>
    </div>`;
  const box = root.querySelector('#mail');
  box.oninput = () => { draft.text = box.value; };
  root.querySelector('#clear').onclick = () => { box.value = ''; draft = { text: '', parsed: null, auto: false }; root.querySelector('#form').innerHTML = ''; box.focus(); };
  root.querySelector('#read').onclick = () => {
    if (box.value.trim().length < 3) { toast(t('imNoText'), 3000); return; }
    draft.text = box.value; draft.parsed = read(box.value);
    drawPreview(root.querySelector('#form'), draft.parsed, draft.text);
    const f = root.querySelector('#form'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (draft.parsed) drawPreview(root.querySelector('#form'), draft.parsed, draft.text);
  else if (draft.auto && draft.text.trim().length > 3) { draft.auto = false; setTimeout(() => root.querySelector('#read').click(), 60); }
}

const labelOf = k => k === 'client' ? t('imClientLabel') : k === 'contact' ? t('imMissingContact') : t('f' + k[0].toUpperCase() + k.slice(1));
const LABELS = () => ({ client: t('imClientLabel'), contact: t('fName'), kind: t('fKind'), date: t('fDate'), participants: t('fParticipants'), place: t('fPlace'), budget: t('fBudget'), hours: t('fHours'), purpose: t('fPurpose'), needs: t('needsFound'), days: t('imDays'), rooms: t('imRooms'), subject: t('imSubject') });

/** The form as an object the summary and the case can use. */
function collect(form) {
  const o = {}, needs = [];
  new FormData(form).forEach((v, k) => { if (k === 'needs') needs.push(String(v)); else o[k] = String(v).trim(); });
  o.needs = needs;
  o.kindLabelled = o.kind ? kindLabel(o.kind) : '';
  return o;
}

function drawPreview(box, p, original) {
  const miss = missingOf(p);
  const isMissing = k => miss.includes(k) ? ' missing' : '';
  const kinds = [['', t('pickKind')]].concat(Office.KINDS.map(k => [k, kindLabel(k)]));
  const langs = ['he', 'en', 'fr'].map(k => [k, langName(k)]);
  const found = [p.name, p.email, p.phone, p.org, p.kind, p.date, p.participants, p.place, p.budget, p.purpose].some(Boolean) || (p.needs || []).length;
  box.innerHTML = `<form class="stack im-card card" id="imForm">
    <h2>${esc(t('imPreview'))}</h2>
    <div class="row im-status">
      ${p.clientId ? `<span class="badge ok">${esc(t('imClientKnown', { who: p.client }))}${p.clientBy ? ' · ' + esc(t('imBy_' + p.clientBy)) : ''}</span>` : `<span class="badge warn">${esc(t('imClientUnknown'))}</span>`}
      ${miss.length ? `<span class="badge warn">${esc(t('missing'))}: ${miss.map(k => esc(labelOf(k))).join(', ')}</span>` : `<span class="badge ok">${esc(t('allThere'))}</span>`}
      ${p.hadQuote ? `<span class="badge muted">${esc(t('imQuoteStripped'))}</span>` : ''}
    </div>
    ${!found ? `<p class="warnbox">${esc(t('imNothing'))}</p>` : ''}
    <div class="grid2">
      <div class="f${isMissing('client')}"><span>${esc(t('fClient'))}</span><input name="client" value="${esc(p.client || p.org || '')}"></div>
      ${field('org', t('imOrg'), p.org || '')}
      ${field('name', t('fName'), p.name || '')}
      <div class="f${isMissing('contact')}"><span>${esc(t('fPhone'))}</span><input name="phone" value="${esc(p.phone || '')}" class="ltr-input" inputmode="tel"></div>
      <div class="f${isMissing('contact')}"><span>${esc(t('fEmail'))}</span><input name="email" value="${esc(p.email || '')}" class="ltr-input" inputmode="email"></div>
      <div class="f${isMissing('kind')}"><span>${esc(t('fKind'))}${p.kindWord ? ` <small class="im-word">(${esc(p.kindWord)})</small>` : ''}</span><select name="kind">${kinds.map(o => `<option value="${esc(o[0])}"${o[0] === p.kind ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>
      <div class="f${isMissing('date')}"><span>${esc(t('fDate'))}${p.dateText && !p.date ? ` <small class="im-word">(${esc(p.dateText)})</small>` : ''}</span><input name="date" type="date" value="${esc(p.date || '')}"></div>
      <div class="f"><span>${esc(t('imDateEnd'))}</span><input name="dateEnd" type="date" value="${esc(p.dateEnd || '')}"></div>
      ${field('hours', t('fHours'), p.hours || '', { ltr: true })}
      <div class="f${isMissing('participants')}"><span>${esc(t('fParticipants'))}</span><input name="participants" value="${esc(p.participants || '')}"></div>
      <div class="f${isMissing('budget')}"><span>${esc(t('fBudget'))}</span><input name="budget" value="${esc(p.budget || '')}"></div>
      <div class="f${isMissing('place')}"><span>${esc(t('fPlace'))}</span><input name="place" value="${esc(p.place || '')}"></div>
      ${field('venue', t('imVenue'), p.venue && p.venue !== p.place ? p.venue : '')}
      ${field('days', t('imDays'), p.days || '', { inputmode: 'numeric' })}
      ${field('rooms', t('imRooms'), p.rooms || '', { inputmode: 'numeric' })}
      <div class="f"><span>${esc(t('fLang'))}</span><select name="lang">${langs.map(o => `<option value="${o[0]}"${o[0] === (p.lang || 'he') ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>
      ${field('mailDate', t('imMailDate'), p.mailDate || '', { type: 'date' })}
    </div>
    <div class="f${isMissing('purpose')}"><span>${esc(t('fPurpose'))}</span><input name="purpose" value="${esc(p.purpose || '')}"></div>
    ${field('subject', t('imSubject'), p.subject || '')}
    <div class="f"><span>${esc(t('needsFound'))}</span><p class="hint">${esc((p.needs || []).length ? t('needsHint') : t('noNeeds'))}</p>
      <div class="pick">${SUPPLIER_TYPES.map(x => `<label class="chk"><input type="checkbox" name="needs" value="${esc(x)}"${(p.needs || []).includes(x) ? ' checked' : ''}> ${esc(supplierTypeLabel(x))}</label>`).join('')}</div></div>
    <div class="f"><div class="row between"><span>${esc(t('imSummary'))}</span>${copyOf('#imSum')}</div><pre id="imSum" class="im-sum" dir="auto"></pre></div>
    <details class="im-orig"><summary>${esc(t('imOriginal'))}</summary><pre dir="auto">${esc(p.body || '')}</pre>${p.signature ? `<p class="hint">${esc(t('imSignature'))}:</p><pre dir="auto">${esc(p.signature)}</pre>` : ''}<div class="row">${copyBtn(p.body || '')}</div></details>
    <p class="hint">${esc(t('imOpenHint'))}</p>
    <div class="row"><button class="btn primary grow" type="submit">${esc(t('imOpenCase'))}</button></div>
  </form>`;
  const form = box.querySelector('#imForm');
  const sum = box.querySelector('#imSum');
  const refresh = () => { const o = collect(form); sum.textContent = summaryText(Object.assign({}, p, o, { kind: o.kindLabelled, client: o.client, dateText: '' }), LABELS()); };
  refresh();
  form.addEventListener('input', refresh);
  form.onsubmit = async e => {
    e.preventDefault();
    const o = collect(form);
    const clients = db.list('clients');
    let existing = p.clientId ? db.get('clients', p.clientId) : null;
    if (!existing) existing = matchClient({ phone: o.phone, email: o.email, client: o.client }, clients);
    let clientId = '', clientName = o.client || o.org || o.name || t('unknownClient');
    if (existing) {
      clientId = existing.id; clientName = o.client || existing.name;
      // the card learns what it did not have; nothing is overwritten
      const fill = {}; if (!existing.contact && o.name) fill.contact = o.name; if (!existing.email && o.email) fill.email = o.email; if (!existing.phone && o.phone) fill.phone = o.phone;
      if (Object.keys(fill).length) db.put('clients', Object.assign({ id: clientId }, fill));
    } else if (o.client || o.org || o.name) {
      // a client the app does not know yet: she decides whether it joins the client list or stays a one-time name (like the invoice flow)
      const r = await dialog(t('imNewClientQ', { who: clientName }), `<label class="chk"><input type="radio" name="keep" value="add" checked> ${esc(t('imKeepAdd'))}</label><label class="chk"><input type="radio" name="keep" value="once"> ${esc(t('imKeepOnce'))}</label>`, { ok: t('imOk') });
      if (!r) return;
      if (r.keep === 'add') { clientId = db.put('clients', { name: clientName, contact: o.name, phone: o.phone, email: o.email, lang: o.lang, kind: '' }); toast(t('clientAdded', { who: clientName }), 2000); }
    }
    const cs = { clientId, client: clientName, contact: o.name, phone: o.phone, email: o.email,
      kind: o.kind, date: o.date, dateEnd: o.dateEnd, hours: o.hours, participants: o.participants, budget: o.budget, place: o.place, venue: o.venue, purpose: o.purpose, lang: o.lang || 'he',
      status: Office.STATUS.lead, leadSource: 'מייל', source: original || '', subject: o.subject, mailDate: o.mailDate, opened: todayIso(), needs: o.needs, days: o.days || '', rooms: o.rooms || '' };
    const id = db.put('cases', cs);
    const label = [clientName, o.subject].filter(Boolean).join(' · ');
    db.put('notes', { text: (o.subject ? t('imSubject') + ': ' + o.subject + '\n\n' : '') + (original || ''), about: 'case', aboutId: id, aboutLabel: label || t('imNoteLabel'), lang: o.lang || lang() });
    draft = { text: '', parsed: null, auto: false };
    toast(t('imCreated'), 2500);
    location.hash = '#/case/' + id;
  };
}

/* Participants of one event: the list with RSVP, rooms and dietary needs; the rooming list for the hotel, the needs for the caterer,
   name tags and CSV. Lives as a tab on the event card and as a full screen (#/participants/<caseId>). Nothing is sent by the app. */
import { t, lang, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, dialog, confirmDialog, toast, empty, openWhatsApp, openWhatsAppPick, openMail, dial, copyText, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { registerCaseTab } from '../caseTabs.js';
import { DEFAULTS } from '../data/defaults.js';
import { RSVP, ROOMS, DIETS, parseParticipantsText, newOnes, roomingList, dietarySummary, rsvpSummary, nameTagsText, toCsv, hotelListText, cateringText, rsvpAskText, plannedCount, sortByName, attending, normName } from '../logic/participants.js';

const ui = { q: '', rsvp: '', room: '' }; // filters survive re-renders
const RSVP_KEY = { invited: 'pInvited', yes: 'pYes', no: 'pNo', maybe: 'pMaybe' };
const ROOM_KEY = { none: 'pRoomNone', single: 'pRoomSingle', double: 'pRoomDouble' };
const rsvpLabel = k => t(RSVP_KEY[k] || 'pInvited');
const roomLabel = k => t(ROOM_KEY[k] || 'pRoomNone');
const dietLabel = k => t('d' + k.charAt(0).toUpperCase() + k.slice(1));
const signerOf = s => s.signer || DEFAULTS.signer;
const BACK = href => `<a class="icon" href="${href}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;

/* ---------------- the full screen ---------------- */
export function render({ root, id }) {
  const c = db.get('cases', id);
  if (!c) { root.innerHTML = `<header class="top">${BACK('#/cases')}<h1>${esc(t('pTitle'))}</h1></header>` + empty(t('noResults')); return; }
  root.innerHTML = `<header class="top">${BACK('#/case/' + esc(id))}<h1>${esc(t('pTitle'))} · ${esc(c.client || t('unknownClient'))}</h1></header>
    <div class="sub">${[c.kind, c.date ? Office.fmt(c.date) : '', c.place].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="stack sec pt-wide" id="pbody"></div>`;
  draw(root.querySelector('#pbody'), c, db.settings(), true);
}

/* ---------------- the tab on the event card ---------------- */
registerCaseTab({ key: 'participants', label: () => t('tParticipants'), render(body, c, s) { draw(body, c, s, false); } });

function listOf(c) { return sortByName(db.list('participants', p => p.caseId === c.id)); }
/** The list as plain text (name · phone · organisation · RSVP), one line per person: for a message or a spreadsheet. */
function listText(c, list) {
  const head = t('pTitle') + ' · ' + [c.client, c.date ? Office.fmt(c.date) : '', c.place].filter(Boolean).join(' · ');
  return head + '\n' + list.map(p => '• ' + [p.name, phonePretty(p.phone), p.email, p.org, rsvpLabel(p.rsvp || 'invited')].filter(Boolean).join(' · ')).join('\n');
}

function draw(body, c, s, full) {
  body.classList.add('pt-body');
  const list = listOf(c);
  const rs = rsvpSummary(list), rm = roomingList(list), ds = dietarySummary(list), planned = plannedCount(c);
  const missing = planned && list.length < planned.min ? planned.min - list.length : 0;
  const chip = (group, val, label) => `<button type="button" class="chip ${ui[group] === val ? 'on' : ''}" data-f="${group}" data-v="${esc(val)}">${esc(label)}</button>`;
  body.innerHTML = `
    <div class="row between"><span class="sub">${planned ? `<b>${esc(t('pPlanned'))}</b> <span class="pt-count">${esc(planned.text)}</span> · ` : ''}<b>${esc(t('pInList'))}</b> <span class="pt-count">${list.length}</span> · <b>${esc(t('pAttending'))}</b> <span class="pt-count">${rs.attending}</span></span>
      ${full ? '' : `<a class="btn sm ghost" href="#/participants/${esc(c.id)}">${esc(t('pFull'))}</a>`}</div>
    ${missing ? `<p class="hint">${esc(t('pMissing', { n: missing }))}</p>` : ''}
    <div class="pt-stats">${[['pInvited', rs.invited], ['pYes', rs.yes], ['pNo', rs.no], ['pMaybe', rs.maybe], ['pRooms', rm.total + (rm.unpaired.length ? '+' : '')], ['pSpecial', ds.special]].map(x => `<div class="card"><b class="pt-count">${esc(x[1])}</b><span>${esc(t(x[0]))}</span></div>`).join('')}</div>
    <div class="row"><button class="btn primary sm" id="pAdd">+ ${esc(t('pAdd'))}</button><button class="btn sm" id="pPaste">${esc(t('pPaste'))}</button><button class="btn sm" id="pHotel">${esc(t('pHotel'))}</button><button class="btn sm" id="pCater">${esc(t('pCatering'))}</button><button class="btn sm" id="pTags">${esc(t('pNameTags'))}</button><button class="btn sm ghost" id="pCsv">${esc(t('pCsv'))}</button>${list.length ? copyBtn(listText(c, list), { label: t('pCopyList') }) : ''}</div>
    <div class="row pt-links"><a class="btn sm ghost" href="#/runsheet/${esc(c.id)}">${esc(t('pRunsheetLink'))}</a><a class="btn sm ghost" href="#/case/${esc(c.id)}/files">${esc(t('tFiles'))}</a></div>
    ${list.length ? `<input class="pt-search" id="pSearch" type="search" value="${esc(ui.q)}" placeholder="${esc(t('pSearchPh'))}" aria-label="${esc(t('search'))}">
    <div class="chips pt-filters">${chip('rsvp', '', t('all'))}${RSVP.map(k => chip('rsvp', k, rsvpLabel(k))).join('')}<span class="grow"></span>${chip('room', 'single', roomLabel('single'))}${chip('room', 'double', roomLabel('double'))}${chip('room', 'none', roomLabel('none'))}</div>
    <div class="pt-head"><span>${esc(t('name'))}</span><span>${esc(t('phone'))}</span><span>${esc(t('pOrg'))}</span><span>${esc(t('pRsvp'))}</span><span>${esc(t('pRoom'))}</span><span>${esc(t('pDietary'))}</span><span></span></div>
    <div class="list pt-rows" id="pRows"></div>` : empty(t('pEmpty'))}`;

  body.querySelector('#pAdd').onclick = () => editPerson(c, null, list);
  body.querySelector('#pPaste').onclick = () => pasteFlow(c, list);
  body.querySelector('#pHotel').onclick = () => hotelDialog(c, s, list);
  body.querySelector('#pCater').onclick = () => cateringDialog(c, s, list);
  body.querySelector('#pTags').onclick = () => tagsDialog(list);
  body.querySelector('#pCsv').onclick = () => downloadCsv(c, list);
  if (!list.length) return;
  const search = body.querySelector('#pSearch');
  search.oninput = () => { ui.q = search.value; rows(body, c, s, list); };
  body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const g = b.dataset.f, v = b.dataset.v; ui[g] = ui[g] === v && g === 'room' ? '' : v; draw(body, c, s, full); });
  rows(body, c, s, list);
}

function matches(p) {
  if (ui.rsvp && (p.rsvp || 'invited') !== ui.rsvp) return false;
  if (ui.room && (p.room || 'none') !== ui.room) return false;
  const q = normName(ui.q); if (!q) return true;
  const hay = normName([p.name, p.org, p.role, p.roommate, p.email, p.notes, (p.tags || []).join(' ')].join(' '));
  return hay.indexOf(q) >= 0 || (/\d/.test(q) && String(p.phone || '').replace(/\D/g, '').indexOf(q.replace(/\D/g, '')) >= 0);
}

function rows(body, c, s, list) {
  const box = body.querySelector('#pRows'); if (!box) return;
  const shown = list.filter(matches);
  box.innerHTML = shown.length ? shown.map(p => {
    const diet = (p.dietTags || []).map(dietLabel).concat(p.dietary ? [p.dietary] : []).join(', ');
    const room = p.room && p.room !== 'none' ? roomLabel(p.room) + (p.roommate ? ' + ' + p.roommate : '') : '';
    const sub = [phonePretty(p.phone), p.email, p.org, p.role, room, diet, p.arrival ? t('pArrival') + ' ' + p.arrival : ''].filter(Boolean);
    const icons = (p.phone ? copyBtn(p.phone, { icon: true }) : '') + (p.email ? copyBtn(p.email, { icon: true }) : '');
    return `<div class="card pt-row" data-p="${esc(p.id)}">
      <div class="pt-main">
        <div class="pt-cell"><span class="title">${esc(p.name)}</span>${sub.length ? `<div class="sub pt-sub-mobile">${sub.map(esc).join(' · ')}${icons}</div>` : ''}</div>
        <div class="pt-cell pt-desk"><span class="ltr">${esc(phonePretty(p.phone))}</span>${icons}</div>
        <div class="pt-cell pt-desk">${esc([p.org, p.role].filter(Boolean).join(' · '))}</div>
        <div class="pt-cell"><span class="badge rsvp-${esc(p.rsvp || 'invited')}">${esc(rsvpLabel(p.rsvp || 'invited'))}</span></div>
        <div class="pt-cell pt-desk">${esc(room)}</div>
        <div class="pt-cell pt-desk">${esc(diet)}</div>
      </div>
      <div class="pt-acts">${p.phone ? `<button type="button" class="btn sm wa" data-ask>${esc(t('whatsapp'))}</button><button type="button" class="btn sm ghost" data-dial>${esc(t('call'))}</button>` : ''}
        ${['yes', 'maybe', 'no'].map(k => `<button type="button" class="chip ${p.rsvp === k ? 'on' : ''}" data-rsvp="${k}">${esc(rsvpLabel(k))}</button>`).join('')}</div></div>`;
  }).join('') : empty(t('pNoMatch'));
  box.querySelectorAll('.pt-row').forEach(el => {
    const p = list.find(x => x.id === el.dataset.p); if (!p) return;
    el.onclick = e => { if (e.target.closest('button,a')) return; editPerson(c, p, list); };
    el.querySelectorAll('[data-rsvp]').forEach(b => b.onclick = () => db.put('participants', { id: p.id, rsvp: b.dataset.rsvp }));
    const ask = el.querySelector('[data-ask]'); if (ask) ask.onclick = () => askRsvp(c, s, p);
    const dl = el.querySelector('[data-dial]'); if (dl) dl.onclick = () => dial(p.phone);
  });
}

/* ---------------- one person ---------------- */
async function editPerson(c, p, list) {
  p = p || { name: '', phone: '', email: '', org: '', role: '', rsvp: 'invited', room: 'none', roommate: '', arrival: '', departure: '', dietTags: [], dietary: '', nameTag: '', notes: '', tags: [] };
  const names = list.filter(x => x.id !== p.id).map(x => x.name);
  const r = await dialog(p.id ? p.name : t('pAdd'), `<div class="grid2">${field('name', t('name'), p.name)}${field('phone', t('fPhone'), p.phone, { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), p.email || '', { ltr: true })}${field('org', t('pOrg'), p.org || '')}${field('role', t('pRole'), p.role || '')}
      ${field('rsvp', t('pRsvp'), p.rsvp || 'invited', { type: 'select', options: RSVP.map(k => [k, rsvpLabel(k)]) })}${field('room', t('pRoom'), p.room || 'none', { type: 'select', options: ROOMS.map(k => [k, roomLabel(k)]) })}
      <label class="f"><span>${esc(t('pRoommate'))}</span><input name="roommate" list="ptNames" value="${esc(p.roommate || '')}"><datalist id="ptNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      ${field('arrival', t('pArrival'), p.arrival || '')}${field('departure', t('pDeparture'), p.departure || '')}</div>
    <div class="f"><span>${esc(t('pDietary'))}</span><div class="pt-diet">${DIETS.map(d => `<label><input type="checkbox" name="dietTags" value="${d}"${(p.dietTags || []).includes(d) ? ' checked' : ''}> ${esc(dietLabel(d))}</label>`).join('')}</div></div>
    ${field('dietary', t('pDietText'), p.dietary || '')}<div class="grid2">${field('nameTag', t('pNameTag'), p.nameTag || '', { placeholder: p.name })}${field('tags', t('pTags'), (p.tags || []).join(', '))}</div>${field('notes', t('fNotes'), p.notes || '', { type: 'textarea', rows: 2 })}
    ${p.id ? `<div class="row end"><button type="button" class="btn danger sm" data-delpart="${esc(p.id)}">${esc(t('delete'))}</button></div>` : ''}`);
  if (!r || !String(r.name || '').trim()) return;
  r.name = r.name.trim();
  r.dietTags = [].concat(r.dietTags || []);
  r.tags = String(r.tags || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean);
  db.put('participants', Object.assign(p.id ? { id: p.id } : { caseId: c.id }, r));
  toast(t('saved'));
}

// deleting one person: from inside the edit dialog, always with a confirmation
let wired = false;
function wireDelete() {
  if (wired) return; wired = true;
  document.addEventListener('click', async e => {
    const b = e.target && e.target.closest && e.target.closest('[data-delpart]'); if (!b) return;
    const p = db.get('participants', b.dataset.delpart); if (!p) return;
    if (await confirmDialog(t('pPersonDelete', { who: p.name }))) { db.remove('participants', p.id); toast(t('pDeleted')); const f = b.closest('form'); if (f) { const x = f.querySelector('[data-x=cancel]'); if (x) x.click(); } }
  });
}
wireDelete();

/* ---------------- paste a list ---------------- */
async function pasteFlow(c, list) {
  const r = await dialog(t('pPaste'), `<p class="hint">${esc(t('pPasteHint'))}</p>` + field('text', '', '', { type: 'textarea', rows: 10 }), { ok: t('next') });
  if (!r) return;
  const parsed = parseParticipantsText(r.text);
  if (!parsed.length) { toast(t('pNothingParsed')); return; }
  const fresh = newOnes(list, parsed), dupes = parsed.length - fresh.length;
  if (!fresh.length) { toast(t('pSkipped', { n: dupes })); return; }
  const line = p => [phonePretty(p.phone), p.email, p.org, p.role, p.room ? roomLabel(p.room) : '', (p.dietTags || []).map(dietLabel).join(', '), p.dietary].filter(Boolean);
  const ok = await dialog(t('pPreview'), `<p class="hint">${fresh.length}${dupes ? ' · ' + esc(t('pDupes', { n: dupes })) : ''}</p><div class="list pt-preview">${fresh.map(p => `<div class="card"><span class="title">${esc(p.name)}</span>${line(p).length ? `<span class="sub">${line(p).map(esc).join(' · ')}</span>` : ''}</div>`).join('')}</div>`, { ok: t('pAddN', { n: fresh.length }) });
  if (!ok) return;
  fresh.forEach(p => db.put('participants', Object.assign({ caseId: c.id }, p)));
  toast(t('pAdded', { n: fresh.length }));
}

/* ---------------- texts to the hotel and the caterer ---------------- */
function supplierEmail(c, re) {
  const sups = {}; db.list('suppliers').forEach(x => { sups[x.id] = x; });
  const links = db.list('links', l => l.caseId === c.id && !/בוטל/.test(String(l.status || ''))).map(l => sups[l.supplierId]).filter(sp => sp && re.test(String(sp.type || '')) && sp.email);
  const chosen = db.list('links', l => l.caseId === c.id && /אושר/.test(String(l.status || ''))).map(l => sups[l.supplierId]).filter(sp => sp && re.test(String(sp.type || '')) && sp.email);
  return (chosen[0] || links[0] || {}).email || '';
}
/** A message dialog: the language switch rebuilds the text; copy is the main button; WhatsApp (she picks the chat) and mail open with the text. */
async function messageDialog(title, subject, textOf, defaultTo, c, s) {
  const l0 = c.lang || s.msgLang || lang();
  const pr = dialog(title, `${field('lang', t('pLang'), l0, { type: 'select', options: ['he', 'fr', 'en'].map(k => [k, langName(k)]) })}<div class="pt-msg"><textarea name="text" rows="14">${esc(textOf(l0))}</textarea></div>
    ${field('to', t('pTo'), defaultTo || '', { ltr: true, type: 'email' })}<div class="row"><button type="button" class="btn wa" data-x="wa">${esc(t('pWaPick'))}</button><button type="button" class="btn" data-x="mail">${esc(t('pMailBtn'))}</button>${copyOf('[name=text]')}</div>`, { ok: t('copy') });
  const form = document.querySelector('.modal:last-of-type form');
  if (form) {
    const ta = form.querySelector('textarea[name=text]');
    form.querySelector('select[name=lang]').onchange = e => { ta.value = textOf(e.target.value); };
    form.querySelector('[data-x=wa]').onclick = () => openWhatsAppPick(ta.value);
    form.querySelector('[data-x=mail]').onclick = () => openMail(form.querySelector('[name=to]').value, subject, ta.value);
  }
  const r = await pr;
  if (r) copyText(r.text);
}
function hotelDialog(c, s, list) {
  if (!attending(list).length) { toast(t('pNoPeople'), 3000); return; }
  messageDialog(t('pHotel'), t('pHotelSubject') + ' · ' + [c.client, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · '), l => hotelListText(list, c, l, signerOf(s)), supplierEmail(c, /מלון/), c, s);
}
function cateringDialog(c, s, list) {
  if (!attending(list).length) { toast(t('pNoPeople'), 3000); return; }
  messageDialog(t('pCatering'), t('pCateringSubject') + ' · ' + [c.client, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · '), l => cateringText(list, c, l, signerOf(s)), supplierEmail(c, /קייטרינג|שפים|מסעד|מלון/), c, s);
}
async function tagsDialog(list) {
  if (!attending(list).length) { toast(t('pNoPeople'), 3000); return; }
  const r = await dialog(t('pNameTags'), `<p class="hint">${esc(t('pNameTagsHint'))}</p><textarea name="text" rows="12">${esc(nameTagsText(list))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('copy') });
  if (r) copyText(r.text);
}
function downloadCsv(c, list) {
  const blob = new Blob([toCsv(list, lang())], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = ['participants', String(c.client || '').replace(/[\\/:*?"<>|]+/g, ' ').trim(), c.date || ''].filter(Boolean).join('-') + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- RSVP request to one person ---------------- */
async function askRsvp(c, s, p) {
  const l0 = c.lang || s.msgLang || lang();
  const pr = dialog(t('pAskRsvp') + ' · ' + p.name, `${field('lang', t('pLang'), l0, { type: 'select', options: ['he', 'fr', 'en'].map(k => [k, langName(k)]) })}<textarea name="text" rows="8">${esc(rsvpAskText(p, c, l0, signerOf(s)))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
  const form = document.querySelector('.modal:last-of-type form');
  if (form) form.querySelector('select[name=lang]').onchange = e => { form.querySelector('textarea[name=text]').value = rsvpAskText(p, c, e.target.value, signerOf(s)); };
  const r = await pr;
  if (r) openWhatsApp(p.phone, r.text);
}

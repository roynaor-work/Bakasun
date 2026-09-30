/* Run of show of the event day: a tab on the event card, a full screen (#/runsheet/<caseId>) and the day-of mode (#/runsheet/<caseId>/live).
   Blocks on a timeline, call sheets per supplier / staff member, the whole day as text / PDF / calendar. Nothing is sent by the app. */
import { t, lang } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, confirmDialog, toast, empty, openWhatsApp, openWhatsAppPick, openMail, copyText, dial, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { rsvpSummary } from '../logic/participants.js';
import { registerCaseTab } from '../caseTabs.js';
import { DEFAULTS } from '../data/defaults.js';
import { downloadFile, shareFile } from '../files.js';
import * as RS from '../logic/runsheet.js';

const ui = { day: {}, liveDay: {} }; // the chosen day per case survives re-renders
const kindT = k => t('rsKind' + k.charAt(0).toUpperCase() + k.slice(1));
const statusT = s => t(s === 'done' ? 'rsDone' : s === 'late' ? 'rsLate' : 'rsPlanned');
const BACK = href => `<a class="icon" href="${href}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;
const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const timeOf = b => Office.hhmm(b.start) + (Office.minutes(b.end) != null ? '–' + Office.hhmm(b.end) : '');

/* ---------------- data ---------------- */
function recOf(c) { return db.list('runsheet', r => r.caseId === c.id)[0] || null; }
function save(rec) { rec.updatedAt = new Date().toISOString(); rec.version = (rec.version || 0) + 1; rec.id = db.put('runsheet', rec); return rec; }
function withDays(c) { const r = recOf(c) || RS.newRecord(c.id); if (!r.days) r.days = []; return r; }
function producerOpts(s) { const signer = s.signer || DEFAULTS.signer; return { producer: String(signer).split('\n')[0].split(' ')[0] || 'וירג׳יני', phone: s.bizPhone || DEFAULTS.bizPhone, signer }; }
/** The phone of a person on the sheet: the block, the staff of this event, any staff record, the supplier. */
function phoneFor(c, name, block) {
  if (block && block.phone) return block.phone;
  const n = String(name || '').trim().toLowerCase(); if (!n) return '';
  const st = db.list('staff', x => String(x.name || '').trim().toLowerCase() === n && x.phone).sort((a, b) => (b.caseId === c.id) - (a.caseId === c.id))[0]; if (st) return st.phone;
  const sp = db.list('suppliers', x => String(x.name || '').trim().toLowerCase() === n && x.phone)[0]; if (sp) return sp.phone;
  const l = db.list('links', x => x.caseId === c.id && String(x.supplier || '').trim().toLowerCase() === n)[0];
  const sp2 = l && db.get('suppliers', l.supplierId); return sp2 && sp2.phone || '';
}
function emailFor(c, name) {
  const n = String(name || '').trim().toLowerCase(); if (!n) return '';
  const sp = db.list('suppliers', x => String(x.name || '').trim().toLowerCase() === n && x.email)[0]; if (sp) return sp.email;
  const st = db.list('staff', x => String(x.name || '').trim().toLowerCase() === n && x.email)[0]; return st && st.email || '';
}
function knownNames(c) {
  const names = [];
  const add = v => { v = String(v || '').trim(); if (v && !names.includes(v)) names.push(v); };
  db.list('staff', x => x.caseId === c.id).forEach(x => add(x.name));
  db.list('links', x => x.caseId === c.id).forEach(x => add(x.supplier || (db.get('suppliers', x.supplierId) || {}).name));
  db.list('staff').forEach(x => add(x.name)); db.list('suppliers').forEach(x => add(x.name));
  return names;
}
function pickDay(rec, store, c) {
  const days = rec.days || []; if (!days.length) return null;
  const chosen = store[c.id]; if (chosen && days.some(d => d.date === chosen)) return chosen;
  const today = todayIso(); if (days.some(d => d.date === today)) return today;
  const next = days.find(d => d.date >= today); return (next || days[0]).date;
}

/* ---------------- the full screen and the tab ---------------- */
let liveTimer = null, wakeLock = null;
function stopLive() { clearInterval(liveTimer); liveTimer = null; if (wakeLock) { try { wakeLock.release(); } catch (e) { /* */ } wakeLock = null; } document.body.classList.remove('rs-live-on'); }
window.addEventListener('hashchange', () => { if (!/^#\/runsheet\/[^/]+\/live/.test(location.hash)) stopLive(); });

export function render({ root, id, query }) {
  const c = db.get('cases', id);
  if (!c) { stopLive(); root.innerHTML = `<header class="top">${BACK('#/cases')}<h1>${esc(t('rsTitle'))}</h1></header>` + empty(t('noResults')); return; }
  if (query && query[0] === 'live') { renderLive(root, c); return; }
  stopLive();
  root.innerHTML = `<header class="top">${BACK('#/case/' + esc(id))}<h1>${esc(t('rsTitle'))} · ${esc(c.client || t('unknownClient'))}</h1></header>
    <div class="sub">${[c.kind, c.date ? Office.fmt(c.date) : '', c.place].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="stack sec" id="rsbody"></div>`;
  draw(root.querySelector('#rsbody'), c, db.settings(), true);
}
registerCaseTab({ key: 'runsheet', label: () => t('tRunsheet'), render(body, c, s) { draw(body, c, s, false); } });

function draw(body, c, s, full) {
  const rec = withDays(c);
  const schedRows = db.list('schedule', r => r.caseId === c.id);
  const notImported = schedRows.filter(r => !(rec.importedIds || []).includes(r.id || ('row:' + [r.date, r.start, r.what].join('|'))));
  const date = pickDay(rec, ui.day, c);
  const day = date ? RS.dayOf(rec, date) : null;
  const blocks = day ? RS.sortBlocks(day.blocks) : [];
  const ov = day ? RS.overlaps(day.blocks) : [];
  const total = rec.days.reduce((n, d) => n + (d.blocks || []).length, 0);
  const plist = db.list('participants', p => p.caseId === c.id); const ppl = { total: plist.length, attending: rsvpSummary(plist).attending };
  body.innerHTML = `
    <div class="row rs-tools">
      <button class="btn primary sm" id="rsAdd">+ ${esc(t('rsAdd'))}</button>
      ${!blocks.length ? `<button class="btn sm" id="rsTpl">${esc(t('rsTemplate'))}</button>` : ''}
      ${notImported.length ? `<button class="btn sm" id="rsImport">${esc(t('rsImport'))} (<span class="count">${notImported.length}</span>)</button>` : ''}
      <button class="btn sm ghost" id="rsAddDay">+ ${esc(t('rsAddDay'))}</button>
      ${total ? `<button class="btn sm wa" id="rsCall">${esc(t('rsCallSheet'))}</button><button class="btn sm" id="rsWhole">${esc(t('rsWhole'))}</button><button class="btn sm ghost" id="rsCal">${esc(t('rsToCal'))}</button>` : ''}
      <a class="btn sm ok" id="rsLive" href="#/runsheet/${esc(c.id)}/live">${esc(t('rsLive'))}</a>
      <a class="btn sm ghost" href="#/participants/${esc(c.id)}">${esc(t('rsToParticipants', { n: ppl.attending, m: ppl.total }))}</a>
    </div>
    ${rec.days.length > 1 ? `<div class="tabs rs-days">${rec.days.map(d => `<button class="${d.date === date ? 'on' : ''}" data-day="${esc(d.date)}">${esc(Office.fmt(d.date))} <span class="count">(${(d.blocks || []).length})</span></button>`).join('')}</div>` : ''}
    ${!total ? `<p class="hint">${esc(t('rsEmpty'))}</p>` : ''}
    ${day ? `<div class="card rs-daynotes" id="rsNotes"><span class="sub"><b>${esc(t('rsDayNotes'))}</b> ${day.notes ? esc(day.notes) : '<span class="rs-muted">…</span>'}</span>${day.notes ? copyBtn(day.notes, { icon: true }) : ''}${rec.days.length > 1 ? `<button type="button" class="btn sm ghost" id="rsDelDay">${esc(t('delete'))}</button>` : ''}</div>` : ''}
    ${blocks.length ? `<div class="${ov.length ? 'warnbox' : 'hint'}">${ov.length ? ov.map(x => esc(t(x.why === 'owner' ? 'rsOverlapOwner' : 'rsOverlapPlace', { who: x.who, a: x.a.title, b: x.b.title, ta: Office.hhmm(x.a.start), tb: Office.hhmm(x.b.start) }))).join('<br>') : esc(t('rsNoOverlap'))}</div>` : ''}
    <div class="rs-tl" id="rsTl">${blocks.map(b => blockHtml(b, c)).join('')}</div>`;

  body.querySelector('#rsAdd').onclick = () => editBlock(c, rec, date, null, s);
  const tpl = body.querySelector('#rsTpl'); if (tpl) tpl.onclick = () => templateFlow(c, rec, date);
  const imp = body.querySelector('#rsImport'); if (imp) imp.onclick = () => { const r = RS.buildFromSchedule(c, schedRows, rec); save(r.rec); toast(r.added ? t('rsImported', { n: r.added }) : t('rsImportedNone')); };
  body.querySelector('#rsAddDay').onclick = async () => {
    const r = await dialog(t('rsAddDay'), field('date', t('date'), nextDate(rec, c), { type: 'date' }), { ok: t('add') });
    if (!r || !r.date) return; RS.ensureDay(rec, r.date); ui.day[c.id] = r.date; save(rec);
  };
  body.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { ui.day[c.id] = b.dataset.day; draw(body, c, s, full); });
  const notes = body.querySelector('#rsNotes'); if (notes) notes.onclick = async e => {
    if (e.target.closest('button')) return;
    const r = await dialog(t('rsDayNotes'), field('notes', Office.fmt(date), day.notes || '', { type: 'textarea', rows: 3 }));
    if (r) { day.notes = r.notes; save(rec); }
  };
  const delDay = body.querySelector('#rsDelDay'); if (delDay) delDay.onclick = async () => {
    if (await confirmDialog(t('rsDeleteDay', { date: Office.fmt(date) }))) { rec.days = rec.days.filter(d => d.date !== date); delete ui.day[c.id]; save(rec); toast(t('rsDeleted')); }
  };
  const call = body.querySelector('#rsCall'); if (call) call.onclick = () => callSheetFlow(c, rec, s);
  const whole = body.querySelector('#rsWhole'); if (whole) whole.onclick = () => wholeFlow(c, rec, s);
  const cal = body.querySelector('#rsCal'); if (cal) cal.onclick = () => calendarFlow(c, rec);
  body.querySelectorAll('.rs-block').forEach(el => {
    const b = blocks.find(x => x.id === el.dataset.b); if (!b) return;
    el.onclick = e => { if (e.target.closest('button,a')) return; editBlock(c, rec, date, b, s); };
    el.querySelector('[data-shift]').onclick = () => { day.blocks = RS.shift(day.blocks, b.id, 15); save(rec); toast(t('rsDelayed', { n: 15 })); };
    el.querySelector('[data-done]').onclick = () => { b.status = b.status === 'done' ? 'planned' : 'done'; save(rec); };
    const dl = el.querySelector('[data-dial]'); if (dl) dl.onclick = () => dial(phoneFor(c, b.owner, b));
  });
}
function nextDate(rec, c) { const last = (rec.days || []).map(d => d.date).sort().pop(); return last ? Office.iso(Office.addDays(last, 1)) : (c.date || todayIso()); }
function blockHtml(b, c) {
  const phone = phoneFor(c, b.owner, b);
  return `<div class="card rs-block k-${esc(b.kind)} st-${esc(b.status)}" data-b="${esc(b.id)}">
    <div class="rs-time count"><b>${esc(Office.hhmm(b.start) || '--:--')}</b>${Office.minutes(b.end) != null ? `<span>${esc(Office.hhmm(b.end))}</span>` : ''}</div>
    <div class="rs-bar"></div>
    <div class="rs-main">
      <div class="row between"><span class="title">${esc(b.title)}</span><span class="badge ${b.status === 'done' ? 'ok' : b.status === 'late' ? 'late' : 'muted'}">${esc(b.status === 'planned' ? kindT(b.kind) : statusT(b.status))}</span></div>
      <div class="chips rs-chips">${b.owner ? `<span class="chip rs-owner">${esc(b.owner)}</span>` : ''}${b.place ? `<span class="chip">${esc(b.place)}</span>` : ''}</div>
      ${b.cue ? `<div class="sub rs-cue"><b>${esc(t('rsCue'))}:</b> ${esc(b.cue)}</div>` : ''}${b.notes ? `<div class="sub">${esc(b.notes)}</div>` : ''}
      <div class="row rs-acts"><button type="button" class="btn sm ghost" data-shift>${esc(t('rsDelay15'))}</button><button type="button" class="btn sm ghost" data-done>${esc(b.status === 'done' ? t('rsPlanned') : t('rsMarkDone'))}</button>${phone ? `<button type="button" class="btn sm ghost" data-dial>${esc(t('call'))}</button><span class="sub ltr rs-phone">${esc(phonePretty(phone))}</span>${copyBtn(phone, { icon: true })}` : ''}</div>
    </div></div>`;
}

/* ---------------- one block ---------------- */
async function editBlock(c, rec, date, b, s) {
  const isNew = !b;
  b = b || RS.newBlock({ start: '', end: '', kind: 'session' });
  const names = knownNames(c);
  const r = await dialog(isNew ? t('rsAdd') : t('rsEditBlock'), `<div class="grid2">${field('date', t('date'), date || c.date || todayIso(), { type: 'date' })}${field('kind', t('rsKind'), b.kind, { type: 'select', options: RS.KINDS.map(k => [k, kindT(k)]) })}
      ${field('start', t('rsStart'), b.start, { type: 'time' })}${field('end', t('rsEnd'), b.end, { type: 'time' })}</div>
    ${field('title', t('rsWhat'), b.title)}
    <div class="grid2">${field('place', t('rsPlace'), b.place)}<label class="f"><span>${esc(t('rsOwner'))}</span><input name="owner" list="rsNames" value="${esc(b.owner)}" autocomplete="off"><datalist id="rsNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      ${field('phone', t('rsPhone'), b.phone, { ltr: true, inputmode: 'tel', placeholder: phoneFor(c, b.owner) })}${field('status', t('rsStatus'), b.status, { type: 'select', options: RS.STATUS.map(k => [k, statusT(k)]) })}</div>
    ${field('cue', t('rsCue'), b.cue)}${field('notes', t('rsNotes'), b.notes, { type: 'textarea', rows: 2 })}
    ${isNew ? '' : `<div class="row end"><button type="button" class="btn danger sm" data-delblock="${esc(b.id)}" data-case="${esc(c.id)}" data-date="${esc(date)}">${esc(t('delete'))}</button></div>`}`);
  if (!r || !String(r.title || '').trim()) return;
  const cur = withDays(c); // fresh, in case the record changed while the dialog was open
  const nb = RS.newBlock(Object.assign({}, b, r, { id: b.id }));
  if (!nb.phone) nb.phone = phoneFor(c, nb.owner);
  const sp = db.list('suppliers', x => String(x.name || '').trim().toLowerCase() === nb.owner.toLowerCase())[0];
  nb.supplierId = sp ? sp.id : ''; nb.staffName = sp ? '' : nb.owner;
  cur.days.forEach(d => { d.blocks = (d.blocks || []).filter(x => x.id !== nb.id); });
  const target = RS.ensureDay(cur, r.date || date || c.date || todayIso());
  target.blocks.push(nb); ui.day[c.id] = target.date;
  save(cur); toast(t('saved'));
}
// deleting one block: from the edit dialog, always with a confirmation
document.addEventListener('click', async e => {
  const btn = e.target && e.target.closest && e.target.closest('[data-delblock]'); if (!btn) return;
  const c = db.get('cases', btn.dataset.case); if (!c) return;
  const rec = recOf(c); const day = rec && RS.dayOf(rec, btn.dataset.date); if (!day) return;
  const b = (day.blocks || []).find(x => x.id === btn.dataset.delblock); if (!b) return;
  if (await confirmDialog(t('rsDeleteBlock', { title: b.title }))) {
    day.blocks = day.blocks.filter(x => x.id !== b.id); save(rec); toast(t('rsDeleted'));
    const f = btn.closest('form'); if (f) { const x = f.querySelector('[data-x=cancel]'); if (x) x.click(); }
  }
});

async function templateFlow(c, rec, date) {
  const r = await dialog(t('rsTemplate'), `<div class="grid2">${field('kind', t('rsKind'), RS.templateKind(c.kind), { type: 'select', options: RS.TEMPLATE_KINDS.map(k => [k, { seminar: t('rsTplSeminar'), conference: t('rsTplConference'), delegation: t('rsTplDelegation'), dinner: t('rsTplDinner') }[k]]) })}
    ${field('date', t('date'), date || c.date || todayIso(), { type: 'date' })}${field('start', t('rsStart'), ((/(\d{1,2}[:.]\d{2})/.exec(String(c.hours || '')) || [])[1] || (RS.templateKind(c.kind) === 'dinner' ? '19:00' : '09:00')), { type: 'time' })}</div>`, { ok: t('add') });
  if (!r) return;
  const day = RS.template(r.kind, r.date, r.start, lang());
  const target = RS.ensureDay(rec, day.date || c.date || todayIso());
  target.blocks = RS.sortBlocks((target.blocks || []).concat(day.blocks)); ui.day[c.id] = target.date;
  save(rec); toast(t('saved'));
}

/* ---------------- texts: call sheet, the whole day ---------------- */
/** A text with a language switch and the ways out: copy, WhatsApp, mail, and extra buttons. Nothing is sent by the app. */
function textModal(title, makeText, opts) {
  opts = opts || {};
  const wrap = document.createElement('div'); wrap.className = 'modal';
  let L = opts.lang || lang();
  const langs = [['he', 'עברית'], ['fr', 'Français'], ['en', 'English']];
  wrap.innerHTML = `<div class="modal-card rs-msg"><h2>${esc(title)}</h2>
    <div class="chips">${langs.map(x => `<button type="button" class="chip ${x[0] === L ? 'on' : ''}" data-lang="${x[0]}">${esc(x[1])}</button>`).join('')}</div>
    <textarea rows="12" id="rsText"></textarea>
    <div class="row">${copyOf('#rsText', { label: t('rsCopy') })}<button type="button" class="btn sm wa" id="rsWa">${esc(opts.phone ? t('rsWaTo', { who: opts.who }) : t('rsWaPick'))}</button><button type="button" class="btn sm" id="rsMailB">${esc(t('rsMail'))}</button>${(opts.extra || []).map((x, i) => `<button type="button" class="btn sm" data-extra="${i}">${esc(x[0])}</button>`).join('')}<span class="grow"></span><button type="button" class="btn sm ghost" data-x="cancel">${esc(t('close'))}</button></div></div>`;
  document.body.appendChild(wrap);
  const ta = wrap.querySelector('#rsText');
  const refresh = () => { ta.value = makeText(L); ta.dir = L === 'he' ? 'rtl' : 'ltr'; wrap.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === L)); };
  refresh();
  wrap.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { L = b.dataset.lang; refresh(); });
  wrap.querySelector('#rsWa').onclick = () => { if (opts.phone) openWhatsApp(opts.phone, ta.value); else { if (opts.who) toast(t('rsNoPhoneFor', { who: opts.who })); openWhatsAppPick(ta.value); } };
  wrap.querySelector('#rsMailB').onclick = () => { if (opts.email) openMail(opts.email, opts.subject ? opts.subject(L) : title, ta.value); else { copyText(ta.value); toast(t('rsNoEmailFor')); } };
  wrap.querySelectorAll('[data-extra]').forEach(b => b.onclick = () => opts.extra[+b.dataset.extra][1](L, ta.value));
  wrap.addEventListener('click', e => { if (e.target === wrap || (e.target.dataset && e.target.dataset.x === 'cancel')) wrap.remove(); });
}
async function callSheetFlow(c, rec, s) {
  const ppl = RS.people(rec);
  if (!ppl.length) { toast(t('rsNoPeople'), 3500); return; }
  const r = await dialog(t('rsCallSheet'), field('who', t('rsPickWho'), ppl[0].name, { type: 'select', options: ppl.map(p => [p.name, p.name + (p.count > 1 ? ' (' + p.count + ')' : '')]) }), { ok: t('open') });
  if (!r || !r.who) return;
  const p = ppl.find(x => x.name === r.who) || { name: r.who };
  const phone = p.phone || phoneFor(c, p.name), email = emailFor(c, p.name);
  const sp = p.supplierId && db.get('suppliers', p.supplierId);
  textModal(t('rsCallSheetFor', { who: p.name }), L => RS.callSheetText(rec, c, p.name, L, producerOpts(s)), { who: p.name, phone, email, lang: (sp && sp.lang) || undefined, subject: L => (L === 'en' ? 'Call sheet · ' : L === 'fr' ? 'Feuille de route · ' : 'דף קריאה · ') + [c.client, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ') });
}
function wholeFlow(c, rec, s) {
  textModal(t('rsWhole'), L => RS.runsheetText(rec, c, L, producerOpts(s)), { extra: [[t('rsPdf'), L => { printHtml(RS.runsheetHtml(rec, c, L, printLabels(s))); toast(t('rsPrintHint'), 4000); }]], subject: L => (L === 'en' ? 'Run of show · ' : L === 'fr' ? 'Déroulé · ' : 'לו״ז יום האירוע · ') + [c.client, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ') });
}
function printLabels(s) {
  const p = producerOpts(s);
  return { title: t('rsPrintTitle'), client: t('rsPrintClient'), event: t('rsPrintEvent'), date: t('rsPrintDate'), place: t('rsPrintPlace'), time: t('rsPrintTime'), what: t('rsPrintWhat'), where: t('rsPrintWhere'), who: t('rsPrintWho'), cue: t('rsPrintCue'), notes: t('rsPrintNotes'), producer: t('rsPrintProducer'), producerLine: p.producer + ' ' + p.phone };
}
/** Opens the printable page in a hidden frame and calls print: she prints, or saves as PDF from the print dialog (same as the contracts). */
function printHtml(html) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.style.position = 'fixed'; f.style.insetInlineStart = '-10000px'; f.style.top = '0'; f.style.width = '794px'; f.style.height = '1123px'; f.style.border = '0';
  document.body.appendChild(f);
  const cleanup = () => setTimeout(() => f.remove(), 60000);
  f.onload = () => { try { const w = f.contentWindow; w.focus(); setTimeout(() => { try { w.print(); } catch (e) { toast(t('pdfHint'), 4000); } cleanup(); }, 250); } catch (e) { toast(t('pdfHint'), 4000); f.remove(); } };
  f.srcdoc = html;
}
async function calendarFlow(c, rec) {
  const ics = RS.toIcs(rec, c);
  if (!/BEGIN:VEVENT/.test(ics)) { toast(t('rsCalNothing')); return; }
  const name = 'bakasun-runsheet-' + (c.date || 'event') + '.ics';
  const file = { blob: new Blob([ics], { type: 'text/calendar;charset=utf-8' }), name, type: 'text/calendar', title: t('rsTitle') + ' · ' + (c.client || '') };
  if (!(await shareFile(file, file.title))) downloadFile(file);
  toast(t('rsCalDone'), 3000);
}

/* ---------------- day-of mode ---------------- */
async function keepAwake() {
  if (wakeLock || !navigator.wakeLock) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.body.classList.contains('rs-live-on')) keepAwake(); });

function renderLive(root, c) {
  const rec = withDays(c);
  const date = pickDay(rec, ui.liveDay, c);
  const day = date ? RS.dayOf(rec, date) : null;
  const blocks = day ? RS.sortBlocks(day.blocks) : [];
  const now = nowHHMM();
  const nn = RS.nowNext(blocks, now);
  const allDone = blocks.length && blocks.every(b => b.status === 'done');
  const ppl = RS.people({ days: day ? [day] : [] }).map(p => Object.assign(p, { phone: p.phone || phoneFor(c, p.name) }));
  const target = nn.now || nn.next; // what the big buttons act on
  const nextPhone = nn.next ? phoneFor(c, nn.next.owner, nn.next) : '';
  const card = (label, b, cls, meta) => `<section class="rs-card ${cls}"><div class="rs-label">${esc(label)}</div><div class="rs-big">${esc(b.title)}</div>
      <div class="rs-meta"><span class="count">${esc(timeOf(b))}</span>${[b.place, b.owner].filter(Boolean).map(x => ' · ' + esc(x)).join('')}</div>${meta || ''}${b.cue ? `<div class="rs-cue">${esc(t('rsCue'))}: ${esc(b.cue)}</div>` : ''}</section>`;
  document.body.classList.add('rs-live-on');
  root.innerHTML = `<div class="rs-live" dir="${lang() === 'he' ? 'rtl' : 'ltr'}">
    <header class="rs-head"><a class="btn sm ghost rs-exit" href="#/case/${esc(c.id)}">${esc(t('rsExit'))}</a><div class="rs-ev"><b>${esc(c.client || '')}</b><span>${[c.kind, date ? Office.fmt(date) : '', c.place].filter(Boolean).map(esc).join(' · ')}</span></div><div class="rs-clock count">${esc(now)}</div></header>
    ${rec.days.length > 1 ? `<div class="tabs rs-days">${rec.days.map(d => `<button class="${d.date === date ? 'on' : ''}" data-day="${esc(d.date)}">${esc(Office.fmt(d.date))}</button>`).join('')}</div>` : ''}
    ${!blocks.length ? `<p class="rs-empty">${esc(day ? t('rsNoDay') : t('rsEmpty'))}</p>` : allDone ? `<p class="rs-empty rs-ok">${esc(t('rsAllDone'))}</p>` : ''}
    ${nn.late.length ? `<section class="rs-card rs-late"><div class="rs-label">${esc(t('rsRunningLate'))}</div>${nn.late.map(b => `<div class="rs-laterow" data-late="${esc(b.id)}"><span><b>${esc(b.title)}</b> <span class="count">${esc(timeOf(b))}</span> · ${esc(t('rsLateBy', { n: b.lateBy }))}</span><button type="button" class="btn sm ok" data-donelate="${esc(b.id)}">${esc(t('rsMarkDone'))}</button></div>`).join('')}</section>` : ''}
    ${nn.now ? card(t('rsNow'), nn.now, 'rs-now', `<div class="rs-prog"><div style="width:${Math.round(100 * nn.now.elapsed / Math.max(1, nn.now.total))}%"></div></div><div class="rs-meta count-line">${esc(t('rsElapsed', { n: nn.now.elapsed }))} · ${esc(t('rsRemaining', { n: nn.now.remaining }))}</div>`) : blocks.length && !allDone ? `<section class="rs-card rs-now rs-idle"><div class="rs-label">${esc(t('rsNow'))}</div><div class="rs-big rs-muted">${esc(t('rsNothingNow'))}</div></section>` : ''}
    ${nn.next ? card(t('rsNext'), nn.next, 'rs-next', `<div class="rs-in">${esc(t('rsInMin', { n: nn.next.inMinutes }))}</div>`) : ''}
    ${target ? `<div class="rs-btns">
      <button type="button" class="btn ok" id="lvDone">${esc(t('rsMarkDone'))}</button>
      <button type="button" class="btn" id="lv10">${esc(t('rsDelay10'))}</button>
      <button type="button" class="btn" id="lv15">${esc(t('rsDelay15s'))}</button>
      ${nn.next && nn.next.owner ? `<button type="button" class="btn ${nextPhone ? 'primary' : 'ghost'}" id="lvCall">${esc(t('rsCall', { who: nn.next.owner }))}</button>` : ''}
    </div>` : ''}
    ${blocks.length ? `<section class="rs-list">${blocks.map(b => `<div class="rs-row k-${esc(b.kind)} st-${esc(b.status)} ${nn.now && nn.now.id === b.id ? 'is-now' : ''}"><span class="count">${esc(timeOf(b))}</span><span class="grow">${esc(b.title)}${b.owner ? ` <small>· ${esc(b.owner)}</small>` : ''}</span><button type="button" class="btn sm ${b.status === 'done' ? 'ghost' : ''}" data-toggle="${esc(b.id)}">${esc(b.status === 'done' ? '✓' : t('rsMarkDone'))}</button></div>`).join('')}</section>` : ''}
    ${ppl.length ? `<section class="rs-phones"><div class="rs-label rs-label-row"><span>${esc(t('rsPhones'))}</span>${copyBtn(ppl.map(p => p.name + (p.phone ? ': ' + phonePretty(p.phone) : '')).join('\n'), { icon: true })}</div>${ppl.map(p => `<div class="rs-row"><span class="grow">${esc(p.name)}</span><span class="count">${esc(phonePretty(p.phone))}</span>${p.phone ? copyBtn(p.phone, { icon: true }) + `<button type="button" class="btn sm wa" data-call="${esc(p.phone)}">${esc(t('call'))}</button>` : ''}</div>`).join('')}</section>` : ''}
    <p class="rs-hint">${esc(t('rsLiveHint'))}</p></div>`;

  const commit = () => save(rec);
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { ui.liveDay[c.id] = b.dataset.day; renderLive(root, c); });
  const setStatus = (id, st) => { const b = (day.blocks || []).find(x => x.id === id); if (b) { b.status = st; commit(); } };
  root.querySelectorAll('[data-donelate]').forEach(b => b.onclick = () => setStatus(b.dataset.donelate, 'done'));
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { const x = day.blocks.find(y => y.id === b.dataset.toggle); if (x) setStatus(x.id, x.status === 'done' ? 'planned' : 'done'); });
  root.querySelectorAll('[data-call]').forEach(b => b.onclick = () => dial(b.dataset.call));
  const done = root.querySelector('#lvDone'); if (done) done.onclick = () => { // the running block, else the first late one, else the next
    const id = nn.now ? nn.now.id : nn.late.length ? nn.late[0].id : nn.next.id; setStatus(id, 'done');
  };
  const delay = n => () => { const from = nn.now || nn.next; if (!from) return; day.blocks = RS.shift(day.blocks, from.id, n); commit(); toast(t('rsDelayed', { n })); };
  const d10 = root.querySelector('#lv10'); if (d10) d10.onclick = delay(10);
  const d15 = root.querySelector('#lv15'); if (d15) d15.onclick = delay(15);
  const call = root.querySelector('#lvCall'); if (call) call.onclick = () => dial(nextPhone);
  keepAwake();
  clearInterval(liveTimer);
  liveTimer = setInterval(() => { if (/^#\/runsheet\/[^/]+\/live/.test(location.hash) && document.body.contains(root)) renderLive(root, db.get('cases', c.id) || c); else stopLive(); }, 30000);
}

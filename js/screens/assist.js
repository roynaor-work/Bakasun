/* "Tell me what to do": one box, typed or dictated. Send a document to someone, ask Roy for an invoice,
   or turn a supplier's quote into the client's quote with her fee. Nothing goes out until she taps. */
import { t, lang, SPEECH, langName } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, empty, dialog, toast, openWhatsApp, openWhatsAppPick, copyText, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { TASK } from '../logic/extra.js';
import { isReceiptCommand } from '../logic/receipts.js';
import { parseAgenda, agenda } from '../logic/agenda.js';
import { parseGoto, screenWord } from '../logic/nav.js';
import { parseMissing, openItems, focusSections } from '../logic/openItems.js';
import { parseHow, findHelp } from '../logic/howto.js';
import { toCalendar } from '../calendar.js';
import { speak, isReadAloudCommand, textOfEl } from '../speak.js';
import { parseAction } from '../logic/questions.js';
import { parseAction2 } from '../logic/questions2.js';
import { parseWorkGroup } from '../logic/workgroup.js';
import { showWorkGroup, answerWorkGroup } from './workgroup.js';
import { runAction, supplierStatus, undoBtn, wireUndo } from './actions.js';
import { remember, undoLast, isUndoCommand } from '../logic/undo.js';
import { pushRecent, recentList } from '../logic/recent.js';

/** The person she named, from the live list (clients, suppliers, team, contacts). */
function findPersonIn(who, people) {
  const hay = Office.normHe(who || ''); if (hay.length < 2) return null;
  let best = null, bl = 0;
  (people || []).forEach(p => (p.names || []).forEach(n => { const k = Office.normHe(n); if (!k || k.length < 2) return; const hit = k === hay ? 99 : hay.indexOf(k) >= 0 ? k.length : k.indexOf(hay) >= 0 ? hay.length : 0; if (hit > bl) { best = p; bl = hit; } }));
  return best ? { name: best.label, phone: best.phone, email: best.email, about: best.about, id: best.id } : null;
}
import { taskEvent } from '../logic/ics.js';
import { HELP } from '../data/helpText.js';
import { parseCommand, parseInvoiceRequest, invoiceRequestText, parseSupplierQuote, markupLines, supplierMarkupMessage, guessSupplier } from '../logic/commands.js';
import { templates, saveTemplate, findTemplate, fillTemplate, isSaveTemplateCommand, templateRef, isSendCommand } from '../logic/templates.js';
import { QUOTE_STATUS } from '../logic/quotes.js';
import { subjects } from '../notes.js';
import { files, shareFile, downloadFile, pdfText } from '../files.js';
import { speechSupported, listen } from '../voice.js';
import { wireDelete, isDeleteCommand, stripDelete, stripDone, splitDone, isEmptyBinCommand, emptyBins } from '../recbox.js';
import { DEFAULTS } from '../data/defaults.js';
import { hasArabic, waLink } from '../logic/core.js';
import { COMPANY_PAPERS } from '../data/docsList.js';
import { replaceNumbersInPdf } from '../pdfedit.js';
let preSupplier = '';
let lastPdf = null;

/** A bundled paper as a file record (fetched from the app's own files). */
async function bundledRec(p) {
  const r = await fetch(p.file); const blob = await r.blob();
  return { id: 'paper:' + p.key, name: p.file.split('/').pop(), type: blob.type || 'application/pdf', size: blob.size, blob, title: p.title };
}
function bundledDocs() { return COMPANY_PAPERS.filter(p => p.status === 'found' && p.file).map(p => ({ id: 'paper:' + p.key, title: p.title, aliases: p.aliases || [], rec: null, paper: p })); }
/** The company papers not in the library yet: known by name, so "send the insurance" gets a clear answer. */
function missingDocs() { return COMPANY_PAPERS.filter(p => !(p.status === 'found' && p.file)).map(p => ({ id: 'paper:' + p.key, title: p.title, aliases: p.aliases || [], rec: null, paper: p, missing: true })); }

export const noLive = true;
let mode = 'command';
let draft = '';
let runOnce = false; // the sentence that moved us to the invoice tab runs there at once, no second tap

const BACK = `<a class="icon" href="#/today" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;

export function render(ctx) {
  const { root } = ctx;
  if (ctx.id === 'supplier-quote') { mode = 'supplierQuote'; const sq = sessionStorage.getItem('bakasun.sqText'); if (sq != null) { sessionStorage.removeItem('bakasun.sqText'); draft = sq; } }
  if (ctx.id === 'listen') { mode = 'command'; ctx.autoMic = true; }
  if (ctx.id === 'from-today') { const v = sessionStorage.getItem('bakasun.ask') || ''; sessionStorage.removeItem('bakasun.ask'); mode = 'command'; draft = v; ctx.autoRun = !!v; ctx.autoMic = sessionStorage.getItem('bakasun.askMic') === '1'; sessionStorage.removeItem('bakasun.askMic'); }
  const s = db.settings();
  root.innerHTML = `<header class="top">${BACK}<h1>${esc(t('assist'))}</h1></header>
    <div class="tabs">${[['command', 'cmdSend'], ['invoice', 'cmdInvoice'], ['supplierQuote', 'cmdSupplierQuote'], ['docs', 'docsLib']].map(x => `<button class="${mode === x[0] ? 'on' : ''}" data-m="${x[0]}">${esc(t(x[1]))}</button>`).join('')}</div>
    <div class="stack sec" id="body"></div>`;
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; render({ root }); });
  const body = root.querySelector('#body');
  ({ command: tabCommand, invoice: tabInvoice, supplierQuote: tabSupplierQuote, docs: tabDocs }[mode])(body, s, ctx);
}

/** A short vibration where the phone allows it (Android). */
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not allowed */ } }

function inputBox(body, hint, ph, onRead, readLabel, examples, autoRun) {
  const s = db.settings(); const dictLang = s.dictLang || lang();
  const ex = Array.isArray(examples) && examples.length ? `<details class="examples"><summary>${esc(t('cmdEx'))}</summary><div class="chips">${examples.map(x => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div></details>` : '';
  const recent = autoRun ? recentList(localStorage) : [];
  const rc = recent.length ? `<details class="examples" id="recent"><summary>${esc(t('recentCmds'))}</summary><div class="chips">${recent.map(x => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div></details>` : '';
  body.innerHTML = `<p class="hint">${esc(hint)}</p>${ex}${rc}<textarea id="txt" rows="5" placeholder="${esc(ph)}">${esc(draft)}</textarea>
    <div class="row"><button class="btn rec" id="rec" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>${esc(t('dictate'))}</span></button>
      <select id="dl">${Object.keys(SPEECH).map(k => `<option value="${k}"${k === dictLang ? ' selected' : ''}>${esc(langName(k))}</option>`).join('')}</select>
      <button class="btn primary grow" id="go" type="button">${esc(readLabel || t('read'))}</button></div><div id="out" class="stack"></div>`;
  const ta = body.querySelector('#txt'), rec = body.querySelector('#rec'), dl = body.querySelector('#dl');
  body.querySelectorAll('[data-ex]').forEach(b => { b.onclick = () => { ta.value = b.dataset.ex; draft = ta.value; ta.focus(); body.querySelectorAll('details.examples').forEach(d => { d.open = false; }); }; });
  const onReadRaw = onRead; onRead = (text, out) => {
    // "what is the profit of Shoval, finished, what is missing for Shoval": two instructions, each with its own answer
    const parts = splitDone(text);
    if (parts.length > 1) { out.innerHTML = ''; parts.forEach(part => { const d = document.createElement('div'); d.className = 'stack'; out.appendChild(d); onRead(part, d); }); return; }
    if (autoRun && !isUndoCommand(text) && !isSendCommand(text) && !isDeleteCommand(text)) pushRecent(localStorage, text);
    return onReadRaw(text, out);
  };
  const bin = wireDelete(body, ta, 'cmd:' + mode, v => { draft = v; });
  let stop = null;
  ta.oninput = () => { draft = ta.value; };
  dl.onchange = () => db.setting('dictLang', dl.value);
  // The instruction runs only when she says "finished" or taps the "finished" button. Ten seconds of silence just stops
  // the microphone; the text stays, and the next tap on "dictate" continues from there.
  let manual = false; // "read" tapped while recording: the recording's own end must not run it a second time
  rec.onclick = () => {
    if (stop) { stop(); return; }
    if (!speechSupported()) { toast(t('noSpeech'), 3500); return; }
    const base = ta.value ? ta.value.replace(/\s+$/, '') + '\n' : '';
    rec.classList.add('on'); rec.querySelector('span').textContent = t('doneBtn'); manual = false;
    // like a voice recorder: a running clock on the button, a short buzz at start and end, the screen stays awake
    const t0 = Date.now(); const clock = setInterval(() => { const n = Math.round((Date.now() - t0) / 1000); rec.querySelector('span').textContent = t('doneBtn') + ' ' + Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }, 1000);
    buzz(30); let lock = null; try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {}); } catch (e) { /* no wake lock */ }
    stop = listen(SPEECH[dl.value] || 'he-IL', text => { ta.value = base + text; draft = ta.value; }, (said, why, finals) => {
      stop = null; rec.classList.remove('on'); rec.querySelector('span').textContent = t('dictate'); clearInterval(clock); buzz([20, 40, 20]); if (lock) { try { lock.release(); } catch (e) { /* gone */ } lock = null; }
      const lastSaid = (finals || []).slice(-1)[0] || '';
      // the closing word may sit at the end of the last sentence, with no pause before it
      const without = rest => { ta.value = (base + (finals || []).slice(0, -1).concat(rest ? [rest] : []).join(' ')).trim(); draft = ta.value; };
      const delRest = stripDelete(lastSaid), doneRest = stripDone(lastSaid);
      if (delRest !== null) { without(delRest); if (bin) bin.doDelete(); return; }
      if (manual) return;
      // "go to suppliers" alone moves there at once, no "finished" needed
      if (autoRun && parseGoto(lastSaid) && !(finals || []).slice(0, -1).length) { ta.value = base.trim(); draft = ta.value; goTo(parseGoto(lastSaid)); return; }
      const run = doneRest !== null || why === 'stop';
      if (doneRest !== null) without(doneRest);
      if (!run) { toast(t('stoppedHint'), 4000); return; }
      if (autoRun && ta.value.trim()) { toast(t('heardRunning'), 1500); onRead(ta.value, body.querySelector('#out')); }
    }, { silence: 10000, stopOn: x => stripDone(x) !== null || stripDelete(x) !== null || (autoRun && !!parseGoto(x)) });
    if (!stop) { rec.classList.remove('on'); rec.querySelector('span').textContent = t('dictate'); toast(t('noSpeech'), 3500); clearInterval(clock); }
  };
  body.querySelector('#go').onclick = () => { if (stop) { manual = true; stop(); } if (!isUndoCommand(ta.value) && isDeleteCommand(ta.value)) { if (bin) bin.doDelete(); return; } onRead(ta.value, body.querySelector('#out')); };
  return ta;
}

/** Under every answer: a "read aloud" button; with the setting on, the answer is read at once (she is driving). */
function afterAnswer(out, s) {
  const card = out.querySelector('.card'); if (!card || card.querySelector('[data-read]')) return;
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<button type="button" class="btn sm ghost" data-read>🔊 ${esc(t('readAloud'))}</button>`;
  card.appendChild(row);
  row.querySelector('[data-read]').onclick = () => speak(textOfEl(card), lang());
  if (s && s.autoSpeak === 'on') speak(textOfEl(card), lang());
}

/** A spoken screen name moves there, no tap. */
function goTo(route) {
  toast(t('goingTo', { screen: screenWord(route, lang()) }), 1200);
  location.hash = route === 'assist' ? '#/assist' : '#/' + route;
}

/** The case she means: by the client's name (or its id), tried as said and without a Hebrew one-letter prefix. */
function caseByName(who, alt) {
  const active = db.list('cases', x => Office.ACTIVE.includes(x.status)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const clients = db.list('clients');
  const aliasHit = hay => clients.find(c => String(c.aliases || '').split(/[,;]+/).map(a => Office.normHe(a)).some(a => a && (a.indexOf(hay) >= 0 || hay.indexOf(a) >= 0)));
  const find = w => {
    const hay = Office.normHe(w || ''); if (hay.length < 2) return null;
    const direct = active.find(x => Office.normHe(x.client || '').indexOf(hay) >= 0 || (hay.length >= 3 && hay.indexOf(Office.normHe(x.client || '')) >= 0) || Office.normHe(x.contact || '').indexOf(hay) >= 0 || Office.normHe(x.purpose || '').indexOf(hay) >= 0);
    if (direct) return direct;
    const cl = aliasHit(hay); if (cl) { const byClient = active.find(x => x.clientId === cl.id || Office.normHe(x.client || '') === Office.normHe(cl.name || '')); if (byClient) return byClient; }
    // a long sentence: the event name is one of its words ("what is missing in the documents of Shoval, and also...")
    const ws = hay.split(/\s+/).filter(x => x.length >= 3);
    if (ws.length > 1) for (const w0 of ws) { for (const w of [w0, /^[הלבמו]/.test(w0) ? w0.slice(1) : w0]) { if (w.length < 3) continue; const hit = active.find(x => Office.normHe(x.client || '').split(/\s+/).some(cw => cw.length >= 3 && cw === w)) || (() => { const c2 = aliasHit(w); return c2 ? active.find(x => x.clientId === c2.id || Office.normHe(x.client || '') === Office.normHe(c2.name || '')) : null; })(); if (hit) return hit; } }
    return null;
  };
  return find(who) || find(alt) || null;
}

/** "How do I delete a recording?": the closest lines from the help, with a link to all of it. */
function showHow(out, hq) {
  const hits = findHelp(hq.words, HELP[lang()] || HELP.he);
  out.innerHTML = `<div class="card stack"><div class="title">${esc(t('howAnswer'))}</div>
    ${hits.length ? `<ul class="open">${hits.map(h => `<li><span class="sub">${esc(h.section)}:</span> ${esc(h.text)}</li>`).join('')}</ul>` : `<p class="hint">${esc(t('noHow'))}</p>`}
    <div class="row"><a class="btn sm" href="#/help">${esc(t('fullHelp'))}</a></div></div>`;
}

/** "What is missing for Shoval?": everything open on that event, in sections with links. */
function showMissing(out, mq) {
  const active = db.list('cases', x => Office.ACTIVE.includes(x.status)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let cs = caseByName(mq.who, mq.alt);
  // "what about Daniel hotel?": a supplier, not an event
  if (!cs && mq.who && (supplierStatus(out, mq.who) || supplierStatus(out, mq.alt))) return;
  if (!cs && active.length === 1) cs = active[0];
  if (!cs) {
    out.innerHTML = `<div class="card stack"><div class="title">${esc(t('whichCase'))}</div>${active.length ? active.map(c => `<button type="button" class="btn" data-case="${esc(c.id)}">${esc(c.client)}${c.date ? ' · ' + esc(Office.fmt(c.date)) : ''}</button>`).join('') : `<p class="hint">${esc(t('noCases'))}</p>`}</div>`;
    out.querySelectorAll('[data-case]').forEach(b => { b.onclick = () => showMissing(out, Object.assign({}, mq, { who: db.get('cases', b.dataset.case).client, alt: '' })); });
    return;
  }
  const res = focusSections(openItems(cs, db.snapshot(), new Date(), lang()), mq.focus);
  const head = [cs.client, cs.kind, cs.date ? Office.fmt(cs.date) : ''].filter(Boolean).join(' · ');
  const days = res.daysLeft != null && res.daysLeft >= 0 ? `<span class="badge ${res.daysLeft <= 7 ? 'warn' : 'muted'}">${esc(t('daysLeft', { n: res.daysLeft }))}</span>` : '';
  out.innerHTML = `<div class="card stack"><div class="row between"><a class="title" href="#/case/${esc(cs.id)}">${esc(head)}</a>${days}</div>
    ${res.sections.length ? res.sections.map(s => `<div><div class="sub"><b>${esc(s.title)}</b> (${s.items.length})</div><ul class="open">${s.items.map(i => `<li><a href="${esc(i.href)}">${esc(i.text)}</a></li>`).join('')}</ul></div>`).join('') : `<p class="okbox">${esc(t('nothingOpen'))}</p>`}
    <div class="row"><a class="btn sm" href="#/case/${esc(cs.id)}">${esc(t('open'))}</a><button type="button" class="btn sm ghost" id="copyOpen">${esc(t('copy'))}</button></div></div>`;
  const b = out.querySelector('#copyOpen'); if (b) b.onclick = () => copyText(head + '\n' + res.sections.map(s => s.title + ':\n' + s.items.map(i => '• ' + i.text).join('\n')).join('\n\n'));
}

/** "What do I have tomorrow?": tasks and reminders (with a done tick), events, calls. */
function showAgenda(out, q) {
  const draw = () => {
    const a = agenda(db.snapshot(), q, new Date());
    const when = q.key === 'today' ? t('agendaToday') : q.key === 'tomorrow' ? t('agendaTomorrow') : q.key === 'week' ? t('agendaWeek') : q.key === 'all' ? t('agendaAll') : Office.fmt(q.from);
    const line = x => `<div class="row between" data-task="${esc(x.id)}"><span>${x.due && q.key !== 'today' && q.key !== 'tomorrow' && q.key !== 'day' ? esc(Office.fmt(x.due)) + ' · ' : ''}${x.time ? esc(x.time) + ' · ' : ''}${esc(x.title)}${x.who && x.who !== t('me') ? ' <span class="sub">' + esc(x.who) + '</span>' : ''}</span><button class="btn sm ok" data-done>✓</button></div>`;
    const ev = c => `<div><a href="#/case/${esc(c.id)}">${esc(c.client)}</a> · ${esc(c.kind || '')}${c.date ? ' · ' + esc(Office.fmt(c.date)) : ''}${c.place ? ' · ' + esc(c.place) : ''}</div>`;
    const cl = c => `<div><a href="#/calls">${esc(c.who || c.name || c.client || '')}</a>${c.about ? ' · ' + esc(c.about) : ''}</div>`;
    const none = !a.tasks.length && !a.events.length && !a.calls.length;
    out.innerHTML = `<div class="card stack"><div class="title">${esc(when)}</div>
      ${none ? `<p class="hint">${esc(t('agendaNone', { when }))}</p>` : ''}
      ${a.tasks.length ? `<div class="sub"><b>${esc(t('agendaTasks'))}</b></div>${a.tasks.map(line).join('')}` : ''}
      ${a.events.length ? `<div class="sub"><b>${esc(t('agendaEvents'))}</b></div>${a.events.map(ev).join('')}` : ''}
      ${a.calls.length ? `<div class="sub"><b>${esc(t('agendaCalls'))}</b></div>${a.calls.map(cl).join('')}` : ''}
      <div class="row"><a class="btn sm" href="#/tasks">${esc(t('allTasks'))}</a><a class="btn sm ghost" href="#/today">${esc(t('today'))}</a>${none ? '' : copyBtn(when + '\n' + [a.tasks.length ? t('agendaTasks') + ':\n' + a.tasks.map(x => '• ' + [x.time, x.title, x.who && x.who !== t('me') ? x.who : ''].filter(Boolean).join(' · ')).join('\n') : '', a.events.length ? t('agendaEvents') + ':\n' + a.events.map(c => '• ' + [c.client, c.kind, c.date ? Office.fmt(c.date) : '', c.place].filter(Boolean).join(' · ')).join('\n') : '', a.calls.length ? t('agendaCalls') + ':\n' + a.calls.map(c => '• ' + [c.who || c.name || c.client || '', c.about].filter(Boolean).join(' · ')).join('\n') : ''].filter(Boolean).join('\n\n'))}</div></div>`;
    out.querySelectorAll('[data-task]').forEach(el => { el.querySelector('[data-done]').onclick = () => { db.put('tasks', { id: el.dataset.task, status: TASK.done }); toast(t('taskDone')); draw(); }; });
  };
  draw();
}

/* ---------------- 1. send a document to someone ---------------- */
async function tabCommand(body, s, ctx) {
  const lib = (await files.all()).filter(f => !f.caseId); // event files live on their event, not in the company library
  const docs = lib.map(f => ({ id: f.id, title: f.title || f.name, aliases: (f.aliases || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean), rec: f })).concat(bundledDocs()).concat(missingDocs());
  // built fresh on every command, so a phone saved a second ago is already known
  const peopleNow = () => subjects().map(p => { const c = p.about === 'client' ? db.get('clients', p.id) : p.about === 'supplier' ? db.get('suppliers', p.id) : p.about === 'team' ? db.get('team', p.id) : db.get('cases', p.id); return { label: p.label, names: p.names, phone: c && c.phone, email: c && c.email, about: p.about, id: p.id }; })
    .concat(db.list('staff').map(x => ({ label: x.name, names: [x.name], phone: x.phone })))
    .concat(db.list('contacts').map(x => ({ label: x.name, names: [x.name], phone: x.phone, email: x.email, about: 'contact', id: x.id })));
  inputBox(body, t('cmdHint'), t('cmdPh'), (text, out) => {
    if (isReceiptCommand(text)) { location.hash = '#/receipts/' + new Date().toISOString().slice(0, 7) + '/snap'; return; }
    // "undo": the last saved thing (task, note, reminder, mark done...) is taken back
    if (isUndoCommand(text)) { const l = undoLast(); out.innerHTML = `<p class="${l ? 'okbox' : 'warnbox'}">${esc(l ? t('undone', { what: l }) : t('nothingToUndo'))}</p>`; draft = ''; body.querySelector('#txt').value = ''; return; }
    // "send" alone: the tap on WhatsApp or mail for the message already on screen
    if (isSendCommand(text)) { const b = out.querySelector('#wa, #waPick, #mail, #paidWa'); if (b) { b.click(); } else toast(t('nothingToSend')); return; }
    // "save as template tour": the message on screen becomes a template
    { const tn = isSaveTemplateCommand(text); if (tn) { const ta2 = out.querySelector('[name=msg], textarea'); if (ta2 && ta2.value.trim()) { saveTemplate(db, tn, ta2.value); toast(t('templateSaved', { name: tn }), 3000); } else toast(t('nothingToSave')); return; } }
    if (isEmptyBinCommand(text)) { emptyBins().then(ok => { if (ok) { draft = ''; body.querySelector('#txt').value = ''; const b = body.querySelector('#bin'); if (b) b.hidden = true; } }); return; }
    // "open a working group with Eran and Moshe": the group card, then her answer to "how?" by voice
    // each step of the group is its own recording: the box is emptied so the next answer does not ride on the last sentence
    const clearBox = () => { draft = ''; const ta0 = body.querySelector('#txt'); if (ta0) ta0.value = ''; };
    if (answerWorkGroup(out, text)) { clearBox(); return; }
    { const wg = parseWorkGroup(text); if (wg) { showWorkGroup(out, wg, { s, people: peopleNow, caseByName }); afterAnswer(out, s); clearBox(); return; } }
    // participants, budget, run of show, files, contract, checklist, reminders, board, history: before "go to", so that
    // "go to day-of mode" is not read as a screen name
    const act2 = parseAction2(text);
    if (act2) { runAction(act2, { out, s, caseByName, findPerson: w => findPersonIn(w, peopleNow()) }).then(() => afterAnswer(out, s)); return; }
    const go = parseGoto(text);
    if (go) { draft = ''; goTo(go); return; }
    const q = parseAgenda(text, new Date());
    if (isReadAloudCommand(text)) { const last = out.querySelector('.card, .okbox, .warnbox'); if (last) speak(textOfEl(last), lang()); else toast(t('nothingToRead')); return; }
    const act = parseAction(text, new Date());
    if (act) { runAction(act, { out, s, caseByName, findPerson: w => findPersonIn(w, peopleNow()) }).then(() => afterAnswer(out, s)); return; }
    if (q) { showAgenda(out, q); afterAnswer(out, s); return; }
    const mq = parseMissing(text);
    if (mq) { showMissing(out, mq); afterAnswer(out, s); return; }
    const hq = parseHow(text);
    if (hq) { showHow(out, hq); afterAnswer(out, s); return; }
    const c = parseCommand(text, docs, peopleNow());
    if (c.kind === 'invoice') { mode = 'invoice'; draft = text; runOnce = true; render({ root: body.closest('#app') }); return; }
    if (c.kind === 'supplierQuote') { mode = 'supplierQuote'; preSupplier = c.supplier && c.supplier.about === 'supplier' ? c.supplier.id : ''; draft = ''; render({ root: body.closest('#app') }); return; }
    if (c.kind === 'today') { location.hash = '#/today'; return; }
    if (c.kind === 'lead') { sessionStorage.setItem('bakasun.leadText', c.body || ''); location.hash = '#/lead'; return; }
    const caseOf = who => { const hay = Office.normHe(who || ''); if (!hay) return null; const cs = db.list('cases', x => Office.ACTIVE.includes(x.status)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); return cs.find(x => c.to && c.to.about === 'client' && x.clientId === c.to.id) || cs.find(x => hay.length >= 3 && (Office.normHe(x.client || '').indexOf(hay) >= 0 || hay.indexOf(Office.normHe(x.client || '')) >= 0 || Office.normHe(x.contact || '').indexOf(hay) >= 0)) || null; };
    if (c.kind === 'quote') { const cs = caseOf(c.who); if (cs) { location.hash = '#/case/' + cs.id + '/money'; setTimeout(() => import('./quotes.js').then(m => m.newQuote(db.get('cases', cs.id))), 400); } else { sessionStorage.setItem('bakasun.leadText', c.who ? 'לקוח: ' + c.who : ''); toast(t('noCaseFor', { who: c.who || '' }), 3500); location.hash = '#/lead'; } return; }
    if (c.kind === 'ask') { const cs = caseOf(c.who); if (!cs) { out.innerHTML = `<p class="warnbox">${esc(t('noCaseFor', { who: c.who || c.type || '' }))}</p>`; return; } sessionStorage.setItem('bakasun.autoAsk', c.type || '1'); location.hash = '#/case/' + cs.id + '/suppliers'; return; }
    if (c.kind === 'open') { if (c.to && c.to.about === 'client') { location.hash = '#/client/' + c.to.id; return; } if (c.to && c.to.about === 'supplier') { location.hash = '#/supplier/' + c.to.id; return; } const cs = caseOf(c.who); if (cs) { location.hash = '#/case/' + cs.id; return; } location.hash = '#/search/' + encodeURIComponent(c.who || ''); return; }
    if (c.kind === 'call') { if (c.to && c.to.phone) { dial(c.to.phone); out.innerHTML = `<p class="okbox">${esc(t('calling', { who: c.to.name }))}</p>`; } else out.innerHTML = `<p class="warnbox">${esc(t('noContact'))}</p>`; return; }
    if (c.kind === 'task') {
      const cs = c.who ? caseOf(c.who) : null; const who = c.to ? c.to.name.split(' · ')[0] : (c.who || t('me'));
      const due = c.due || Office.iso(Office.addDays(new Date(), 1));
      const tid = db.put('tasks', { title: c.body, who, phone: c.to && c.to.phone || '', caseId: cs ? cs.id : '', due, time: c.time || '', status: TASK.open, lang: s.msgLang || 'he' });
      remember(t('taskSaved', { what: c.body, who }), () => db.remove('tasks', tid));
      out.innerHTML = `<div class="okbox stack"><p>${esc(t('taskSaved', { what: c.body, who }))} · ${esc(Office.fmt(due))}${c.time ? ' ' + esc(c.time) : ''}</p><div class="row"><button type="button" class="btn sm" id="toCal">${esc(t('toCalendar'))}</button>${undoBtn()}</div></div>`;
      out.querySelector('#toCal').onclick = () => toCalendar(taskEvent(db.get('tasks', tid))); wireUndo(out); return;
    }
    if (c.kind === 'note') { const nid = db.put('notes', { text: c.body, about: c.to ? c.to.about : '', aboutId: c.to ? c.to.id : '', aboutLabel: c.to ? c.to.name.split(' · ')[0] : c.who, lang: s.uiLang || 'he' }); remember(t('noteSaved', { who: c.to ? c.to.name.split(' · ')[0] : c.who }), () => db.remove('notes', nid)); out.innerHTML = `<div class="okbox stack"><p>${esc(t('noteSaved', { who: c.to ? c.to.name.split(' · ')[0] : c.who }))}</p><div class="row">${undoBtn()}</div></div>`; wireUndo(out); return; }
    if (c.kind === 'reminder') {
      const tid = db.put('tasks', { title: c.reminder.title, due: c.reminder.due, time: c.reminder.time, who: t('me'), status: TASK.open, lang: s.uiLang || 'he' });
      remember(t('reminderSaved', { what: c.reminder.title, when: Office.fmt(c.reminder.due) }), () => db.remove('tasks', tid));
      out.innerHTML = `<div class="okbox stack"><p>${esc(t('reminderSaved', { what: c.reminder.title, when: Office.fmt(c.reminder.due) + (c.reminder.time ? ' ' + c.reminder.time : '') }))}</p><div class="row"><button type="button" class="btn sm" id="toCal">${esc(t('toCalendar'))}</button>${undoBtn()}<span class="sub">${esc(t('calWhy'))}</span></div></div>`;
      out.querySelector('#toCal').onclick = () => toCalendar(taskEvent(db.get('tasks', tid))); wireUndo(out);
      return;
    }
    if (c.kind === 'contact') {
      const col = c.to && c.to.about === 'client' ? 'clients' : c.to && c.to.about === 'supplier' ? 'suppliers' : c.to && c.to.about === 'team' ? 'team' : c.to && c.to.about === 'contact' ? 'contacts' : '';
      const patch = { phone: c.contact.phone || undefined, email: c.contact.email || undefined };
      if (col && c.to.id) db.put(col, Object.assign({ id: c.to.id }, patch)); else db.put('team', Object.assign({ name: c.contact.name }, patch));
      if (/רועי|roy/i.test(c.contact.name) && c.contact.phone && !s.invoiceTo) db.setting('invoiceTo', c.contact.phone);
      out.innerHTML = `<p class="okbox">${esc(t('contactSaved', { name: c.to ? c.to.name : c.contact.name, value: c.contact.phone || c.contact.email }))} ${copyBtn(c.contact.phone || c.contact.email, { icon: true })}</p>`; return;
    }
    if (c.kind === 'message') {
      // "send myself..." : her own number from the settings
      if (c.to && !c.to.phone && !c.to.email && /^(?:ל?עצמי|אליי|אלי|לי|myself|me|to me|moi|à moi|moi-même)$/i.test(String(c.to.name || '').trim())) c.to = { name: t('me'), phone: s.bizPhone || DEFAULTS.bizPhone, about: 'me' };
      const has = c.via === 'email' ? c.to.email : c.to.phone;
      // "send Dana the template tour": the body is one of her templates, with the first name filled in
      const ref = templateRef(c.body);
      if (ref) { const tp = findTemplate(templates(db), ref); if (tp) c.body = fillTemplate(tp.text, { name: c.to.name || '' }); else { out.innerHTML = `<p class="warnbox">${esc(t('noTemplateNamed', { name: ref }))}</p>`; return; } }
      out.innerHTML = `<div class="card"><div class="kv"><dt>${esc(c.to.group ? t('groupTo') : t('recipient'))}</dt><dd class="ltr">${esc(c.to.name || c.to.phone || c.to.email)}${c.to.name && has ? ' · ' + esc(has) : ''}${has ? copyBtn(has, { icon: true }) : ''}</dd></div>
        ${field('msg', t('theMessage'), c.body, { type: 'textarea', rows: 4 })}
        ${c.to.group ? `<div class="row"><button class="btn wa" id="waPick">${esc(t('waPickGroup'))}</button></div><p class="hint">${esc(t('groupHint'))}</p>`
          : has ? `<div class="row">${c.via === 'email' ? `<a class="btn primary" id="mail">${esc(t('email'))}</a>` : `<button class="btn wa" id="wa">${esc(t('whatsapp'))}</button>`}${c.via === 'email' && c.to.phone ? `<button class="btn wa" id="wa">${esc(t('whatsapp'))}</button>` : ''}${c.via !== 'email' && c.to.email ? `<a class="btn" id="mail">${esc(t('email'))}</a>` : ''}</div>`
          : `<p class="warnbox">${esc(t('noContact'))} <button class="btn sm" id="addContact">${esc(c.via === 'email' ? t('addEmail') : t('addPhone'))}</button></p>`}</div>`;
      const msg = () => out.querySelector('[name=msg]').value;
      // she read a number for someone who has none on the card: one tap keeps it there
      if (c.to.newPhone && c.to.id && c.to.phone) {
        const col = c.to.about === 'client' ? 'clients' : c.to.about === 'supplier' ? 'suppliers' : c.to.about === 'team' ? 'team' : c.to.about === 'contact' ? 'contacts' : '';
        if (col) { const r0 = document.createElement('div'); r0.className = 'row'; r0.innerHTML = `<button type="button" class="btn sm" id="keepPhone">${esc(t('keepPhoneFor', { who: c.to.name, phone: c.to.phone }))}</button>`; out.querySelector('.card').appendChild(r0); r0.querySelector('#keepPhone').onclick = () => { db.put(col, { id: c.to.id, phone: c.to.phone }); toast(t('personSaved')); r0.remove(); }; }
      }
      { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `${copyOf('[name=msg]')}<button type="button" class="btn sm ghost" id="readMsg">🔊 ${esc(t('readAloud'))}</button><button type="button" class="btn sm ghost" id="saveTpl">${esc(t('saveAsTemplate'))}</button>`; out.querySelector('.card').appendChild(r); r.querySelector('#readMsg').onclick = () => speak(msg(), lang());
        r.querySelector('#saveTpl').onclick = async () => { const rr = await dialog(t('saveAsTemplate'), field('name', t('templateName'), '') + `<p class="hint">${esc(t('templateHint'))}</p>`, { ok: t('save') }); if (rr && rr.name) { saveTemplate(db, rr.name, msg()); toast(t('templateSaved', { name: rr.name })); } }; }
      const wa = out.querySelector('#wa'); if (wa) wa.onclick = () => openWhatsApp(c.to.phone, msg());
      const wp = out.querySelector('#waPick'); if (wp) wp.onclick = () => openWhatsAppPick(msg());
      const ml = out.querySelector('#mail'); if (ml) { ml.href = 'mailto:' + encodeURIComponent(c.to.email) + '?subject=' + encodeURIComponent(s.bizName || DEFAULTS.bizName) + '&body=' + encodeURIComponent(msg()); ml.target = '_blank'; }
      const ac = out.querySelector('#addContact'); if (ac) ac.onclick = async () => {
        // the number she just said is already filled in; only what is still missing is asked
        const pre = c.to.phone || c.phoneFound || '';
        const r = await dialog(c.to.name || t('newContact'), (c.to.name ? '' : field('name', t('fName'), '')) + `<div class="grid2">${field('phone', t('fPhone'), pre, { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), c.to.email || '', { ltr: true, inputmode: 'email' })}</div>`, { ok: t('save') });
        if (!r || (!r.phone && !r.email)) return;
        const col = c.to.about === 'client' ? 'clients' : c.to.about === 'supplier' ? 'suppliers' : c.to.about === 'team' ? 'team' : '';
        if (col && c.to.id) db.put(col, { id: c.to.id, phone: r.phone || undefined, email: r.email || undefined }); else db.put('team', { name: c.to.name || r.name || r.phone, phone: r.phone, email: r.email });
        toast(t('personSaved')); body.querySelector('#go').click();
      };
      return;
    }
    // "to Roy" with no card for him: the invoice mailbox from the settings
    if (c.kind === 'send' && !c.to && /(?:^|\s)(?:ל|של\s+|עבור\s+)?(?:רועי|roy)(?=\s|$)/i.test(text)) c.to = { name: s.invoiceName || DEFAULTS.invoiceName, email: s.invoiceEmail || DEFAULTS.invoiceEmail, about: 'team' };
    if (c.kind !== 'send' || (!c.doc && !c.to)) { out.innerHTML = `<p class="warnbox">${esc(t('cmdUnknown'))}</p>`; return; }
    if (c.doc && c.doc.missing) {
      out.innerHTML = `<div class="card stack"><div class="title">${esc(c.doc.title)} <span class="badge warn">${esc(t('paperMissing'))}</span></div><p>${esc(t('docMissingYet'))}</p>${c.doc.paper.note ? `<p class="hint">${esc(c.doc.paper.note)}</p>` : ''}${c.to ? `<p class="sub">${esc(t('recipient'))}: ${esc(c.to.name || c.to.email || c.to.phone || '')}</p>` : ''}<div class="row"><a class="btn sm" href="#/settings">${esc(t('docMissingWhere'))}</a><a class="btn sm ghost" href="#/files">${esc(t('files'))}</a></div></div>`;
      return;
    }
    out.innerHTML = `<div class="card"><div class="kv"><dt>${esc(t('document'))}</dt><dd>${c.doc ? esc(c.doc.title) : `<span class="badge warn">${esc(t('docNotFound'))}</span>`}</dd><dt>${esc(t('recipient'))}</dt><dd class="ltr">${c.to ? esc(c.to.name || c.to.phone || c.to.email) + (c.to.name && c.to.phone ? ' · ' + esc(c.to.phone) : '') + (c.to.phone || c.to.email ? copyBtn(c.to.phone || c.to.email, { icon: true }) : '') : `<span class="badge warn">${esc(t('noRecipient'))}</span>`}</dd></div>
      ${field('msg', t('note'), c.doc ? t('docMsg', { doc: c.doc.title }) : '', { type: 'textarea', rows: 2 })}
      <div class="row">${c.doc ? `<button class="btn primary" id="share">${esc(t('shareFile'))}</button>` : ''}${c.to && c.to.phone ? `<button class="btn wa" id="wa">${esc(t('whatsapp'))}</button>` : ''}${c.to && c.to.email ? `<a class="btn" id="mail">${esc(t('email'))}</a>` : ''}${copyOf('[name=msg]')}</div>
      ${c.to && c.to.name && !c.to.phone && !c.to.email ? `<p class="warnbox">${esc(t('noContact'))} <button class="btn sm" id="addContact">${esc(t('addPhone'))}</button></p>` : ''}
      <p class="hint">${esc(t('shareHint'))}</p></div>`;
    const msg = () => out.querySelector('[name=msg]').value;
    const ac = out.querySelector('#addContact'); if (ac) ac.onclick = async () => {
      const r = await dialog(c.to.name, `<div class="grid2">${field('phone', t('fPhone'), c.phoneFound || '', { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), '', { ltr: true, inputmode: 'email' })}</div>`, { ok: t('save') });
      if (!r || (!r.phone && !r.email)) return;
      const col = c.to.about === 'client' ? 'clients' : c.to.about === 'supplier' ? 'suppliers' : c.to.about === 'team' ? 'team' : '';
      if (col && c.to.id) db.put(col, { id: c.to.id, phone: r.phone || undefined, email: r.email || undefined }); else db.put('team', { name: c.to.name, phone: r.phone, email: r.email });
      toast(t('personSaved')); body.querySelector('#go').click();
    };
    const sh = out.querySelector('#share'); if (sh) sh.onclick = async () => { const rec = c.doc.rec || await bundledRec(c.doc.paper); if (!(await shareFile(rec, msg()))) { downloadFile(rec); toast(t('shareFallback'), 4000); } };
    const wa = out.querySelector('#wa'); if (wa) wa.onclick = () => openWhatsApp(c.to.phone, msg());
    const ml = out.querySelector('#mail'); if (ml) { ml.href = 'mailto:' + encodeURIComponent(c.to.email) + '?subject=' + encodeURIComponent((c.doc ? c.doc.title : '') + ' · ' + (s.bizName || DEFAULTS.bizName)) + '&body=' + encodeURIComponent(msg()); ml.target = '_blank'; }
  }, t('read'), t('cmdExamples'), true);
  if (!lib.length && !bundledDocs().length) body.insertAdjacentHTML('afterbegin', `<p class="warnbox">${esc(t('noDocsYet'))}</p>`);
  if (ctx && ctx.autoRun) { ctx.autoRun = false; body.querySelector('#go').click(); }
  if (ctx && ctx.autoMic) { ctx.autoMic = false; body.querySelector('#rec').click(); }
}

/* ---------------- 2. ask Roy for an invoice ---------------- */
function tabInvoice(body, s) {
  inputBox(body, t('invHint'), t('invPh'), (text, out) => {
    const clients = db.list('clients');
    const r = parseInvoiceRequest(text, clients);
    const match = (r.clientId && db.get('clients', r.clientId)) || clients.find(c => r.taxId && c.taxId === r.taxId) || clients.find(c => r.client && Office.normHe(c.name) === Office.normHe(r.client)) || null;
    const mailTo = s.invoiceEmail || DEFAULTS.invoiceEmail;
    const cases = db.list('cases', c => Office.ACTIVE.includes(c.status) && (!match || c.clientId === match.id));
    out.innerHTML = `<form class="card stack" id="inv">
      <div class="grid2">${field('client', t('fClient'), r.client || (match && match.legalName) || (match && match.name) || '')}${field('taxId', t('fTaxId'), r.taxId || (match && match.taxId) || '', { ltr: true })}${field('address', t('fAddress'), r.address || (match && match.address) || '')}${field('email', t('fEmail'), r.email || (match && match.email) || '', { ltr: true })}
      ${field('kind', t('fType'), r.kind, { type: 'select', options: [['חשבונית', 'חשבונית מס'], ['חשבון עסקה', 'חשבון עסקה'], ['דרישת תשלום', 'דרישת תשלום']] })}${field('caseId', t('forCase'), '', { type: 'select', options: [['', t('none')]].concat(cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')])) })}</div>
      <div id="items" class="stack">${(r.items.length ? r.items : [{ desc: '', amount: '' }]).map(x => `<div class="row"><input name="desc" class="grow" value="${esc(x.desc)}" placeholder="${esc(t('note'))}"><input name="amount" type="number" inputmode="decimal" style="max-width:9em" value="${esc(x.amount)}" placeholder="${esc(t('amount'))}"></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn sm ghost" id="addItem">+ ${esc(t('addLine'))}</button><span class="hint">${esc(t('amountsBeforeVat'))}</span></div>
      ${field('note', t('invExtra'), r.note || '')}
      <textarea name="text" rows="10" id="invText"></textarea>
      <div class="row"><button type="button" class="btn" id="rebuild">${esc(t('rebuild'))}</button><button type="submit" class="btn ${r.channel === 'mail' ? '' : 'wa'} grow" id="sendWa">${esc(t('askInvoice'))}</button><button type="button" class="btn ${r.channel === 'mail' ? 'primary' : ''} grow" id="sendMail">${esc(t('askInvoiceMail'))}</button><button type="button" class="btn ghost" id="copyInv">${esc(t('copy'))}</button></div>
      ${match && (!match.taxId || !match.address) ? `<p class="warnbox">${esc(t('clientDetailsMissing', { who: match.name }))}</p>` : ''}
      ${!s.invoiceTo ? `<p class="hint">${esc(t('noInvoicePhone'))}</p>` : ''}</form>`;
    const form = out.querySelector('#inv');
    const build = () => {
      const o = {}; new FormData(form).forEach((v, k) => { if (k !== 'desc' && k !== 'amount') o[k] = String(v).trim(); });
      const descs = [...form.querySelectorAll('[name=desc]')].map(x => x.value), amts = [...form.querySelectorAll('[name=amount]')].map(x => Office.num(x.value));
      const items = descs.map((d, i) => ({ desc: d, amount: amts[i] })).filter(x => !isNaN(x.amount) && x.amount);
      const req = { client: o.client, taxId: o.taxId, address: o.address, email: o.email, kind: o.kind, note: o.note, items, total: items.reduce((a, x) => a + x.amount, 0) };
      form.querySelector('#invText').value = invoiceRequestText(req, {}, s.signer || DEFAULTS.signer);
      return Object.assign(req, { caseId: o.caseId });
    };
    build();
    form.querySelector('#rebuild').onclick = build;
    form.querySelector('#addItem').onclick = () => { form.querySelector('#items').insertAdjacentHTML('beforeend', `<div class="row"><input name="desc" class="grow" placeholder="${esc(t('note'))}"><input name="amount" type="number" inputmode="decimal" style="max-width:9em" placeholder="${esc(t('amount'))}"></div>`); };
    form.querySelector('#copyInv').onclick = () => copyText(form.querySelector('#invText').value);
    // remember: the client's invoice details, and a payment row per amount
    const done = async req => {
      if (match) db.put('clients', { id: match.id, legalName: req.client || match.legalName, taxId: req.taxId || match.taxId, address: req.address || match.address, email: req.email || match.email });
      // a client the app does not know yet: she decides whether it joins the client list or stays a one-time name
      else if (req.client) {
        const r = await dialog(t('newClientQ', { who: req.client }), `<label class="chk"><input type="radio" name="keep" value="add" checked> ${esc(t('addToClients'))}</label><label class="chk"><input type="radio" name="keep" value="once"> ${esc(t('oneTimeClient'))}</label>`, { ok: t('okBtn') });
        if (r && r.keep === 'add') { const cid = db.put('clients', { name: req.client, legalName: req.client, taxId: req.taxId || '', address: req.address || '', invoiceEmail: req.email || '', kind: '' }); remember(t('clientAdded', { who: req.client }), () => db.remove('clients', cid)); toast(t('clientAdded', { who: req.client }), 2500); }
      }
      req.items.forEach(x => db.put('payments', { caseId: req.caseId || '', client: req.client, amount: x.amount, due: '', status: Office.PAY.invoiceAsked, note: x.desc, invoiceKind: req.kind }));
      draft = ''; toast(t('saved')); location.hash = '#/money';
    };
    form.onsubmit = e => {
      e.preventDefault();
      const req = build(); const text = form.querySelector('#invText').value;
      if (!s.invoiceTo) { toast(t('noInvoicePhone'), 3500); return; }
      if (!openWhatsApp(s.invoiceTo, text)) return;
      done(req);
    };
    // by mail to Roy: the mail app opens with the text; she taps send there
    form.querySelector('#sendMail').onclick = () => {
      const req = build(); const text = form.querySelector('#invText').value;
      const subject = (req.kind || 'חשבונית') + (req.client ? ' · ' + req.client : '') + ' · ' + (s.bizName || DEFAULTS.bizName);
      window.open('mailto:' + encodeURIComponent(mailTo) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text), '_blank');
      done(req);
    };
  }, t('read'));
  if (runOnce) { runOnce = false; const g = body.querySelector('#go'); if (g && draft) g.click(); }
}

/* ---------------- 3. a supplier's quote → the client's quote, with her fee ---------------- */
function tabSupplierQuote(body, s, ctx) {
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const sups = db.list('suppliers').sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
  const preCase = ctx && ctx.query && ctx.query[0] ? ctx.query[0] : '';
  const ta = inputBox(body, t('sqHint'), t('sqPh'), (text, out) => {
    const q = parseSupplierQuote(text);
    if (!q.items.length) { out.innerHTML = `<p class="warnbox">${esc(t('sqNothing'))}</p>`; return; }
    // the supplier: the one she named, or the one the text itself points to (a phone, a mail domain, a name)
    const guessed = preSupplier ? null : guessSupplier(text, sups);
    const supPre = preSupplier || (guessed ? guessed.id : '');
    // the case: the one whose suppliers include this one, when only one does
    const withSup = guessed ? cases.filter(c => db.list('links', l => l.caseId === c.id && l.supplierId === guessed.id).length) : [];
    const casePre = preCase || (withSup.length === 1 ? withSup[0].id : '');
    out.innerHTML = `<form class="card stack" id="sq">
      ${guessed ? `<p class="hint">${esc(t('supplierGuessed', { who: guessed.name }))}</p>` : ''}
      <div class="grid2">${field('caseId', t('forCase'), casePre, { type: 'select', options: cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')]) })}${field('supplierId', t('supplier'), supPre, { type: 'select', options: [['', t('noSupplier')]].concat(sups.map(x => [x.id, x.name + ' · ' + x.type])) })}
      ${field('pct', t('fee'), s.defaultMargin || 15, { type: 'number', inputmode: 'decimal' })}${field('lang', t('msgLang'), 'he', { type: 'select', options: [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]] })}</div>
      <div class="list">${q.items.map((x, i) => `<div class="row"><input name="item" class="grow" value="${esc(x.item)}"><input name="qty" type="number" style="max-width:5em" value="${esc(x.qty)}"><input name="cost" type="number" inputmode="decimal" style="max-width:8em" value="${esc(x.cost)}"></div>`).join('')}</div>
      <div class="sub"><b>${esc(t('supplierTotal'))}:</b> <span class="ltr">${esc(Office.money(q.sum))}</span>${q.total && q.total !== q.sum ? ` · ${esc(t('statedTotal'))} <span class="ltr">${esc(Office.money(q.total))}</span>` : ''} · <b>${esc(t('clientTotal'))}:</b> <span class="ltr" id="ct"></span></div>
      <div class="sub"><b>${esc(t('choose'))}</b></div><div class="row"><button type="submit" class="btn primary grow">${esc(t('newDoc'))}</button>${lastPdf ? `<button type="button" class="btn grow" id="sameDoc">${esc(t('sameDoc'))}</button>` : ''}</div>${lastPdf ? `<p class="hint">${esc(t('sameDocHint'))}</p>` : ''}</form>`;
    const form = out.querySelector('#sq');
    const sd = out.querySelector('#sameDoc'); if (sd) sd.onclick = async () => {
      const pct = Office.num(form.pct.value) || 0;
      const items = [...form.querySelectorAll('[name=item]')].map((x, i) => ({ item: x.value, cost: Office.num(form.querySelectorAll('[name=cost]')[i].value) || 0 })).filter(x => x.cost);
      const reps = items.map(x => ({ from: x.cost, to: Math.round(x.cost * (1 + pct / 100)) }));
      const sum = items.reduce((a, x) => a + x.cost, 0); if (q.total && q.total !== sum) reps.push({ from: q.total, to: Math.round(q.total * (1 + pct / 100)) }); else if (q.total) reps.push({ from: q.total, to: Math.round(sum * (1 + pct / 100)) });
      toast(t('syncing'));
      try {
        const r = await replaceNumbersInPdf(lastPdf, reps);
        if (r.missed.length) toast(t('missedNumbers', { list: r.missed.join(', ') }), 5000);
        const cs = db.get('cases', form.caseId.value);
        const rec = { name: (cs ? cs.client : 'quote').replace(/[\\/:*?"<>|]/g, '') + '-' + Office.iso(new Date()) + '.pdf', type: 'application/pdf', blob: r.blob, title: t('quote') };
        if (!(await shareFile(rec, t('quote')))) { downloadFile(rec); toast(t('shareFallback'), 4000); }
      } catch (err) { toast(t('sqPdfFail'), 4000); }
    };
    const totals = () => { const pct = Office.num(form.pct.value) || 0; const costs = [...form.querySelectorAll('[name=cost]')].map(x => Office.num(x.value) || 0); const sum = costs.reduce((a, b) => a + b, 0); form.querySelector('#ct').textContent = Office.money(Math.round(sum * (1 + pct / 100))); return { sum, pct, client: Math.round(sum * (1 + pct / 100)) }; };
    totals(); form.oninput = totals;
    form.onsubmit = e => {
      e.preventDefault();
      const cs = db.get('cases', form.caseId.value); if (!cs) return;
      const sup = sups.find(x => x.id === form.supplierId.value) || null;
      const items = [...form.querySelectorAll('[name=item]')].map((x, i) => ({ item: x.value, qty: Office.num(form.querySelectorAll('[name=qty]')[i].value) || 1, cost: Office.num(form.querySelectorAll('[name=cost]')[i].value) || 0 })).filter(x => x.item && x.cost);
      const { pct, client } = totals();
      const lines = markupLines(items, pct, sup);
      // the client's quote: the open draft for this case, or a new one
      let q = db.list('quotes', x => x.caseId === cs.id && x.status === QUOTE_STATUS.draft).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
      if (!q) { const no = Office.nextQuoteNo(db.list('quotes').map(x => x.no), new Date()); const id = db.put('quotes', { no, version: 1, caseId: cs.id, client: cs.client, date: todayIso(), lang: cs.lang || 'he', status: QUOTE_STATUS.draft, vatRate: s.vat || 18, defaultMargin: pct, validUntil: Office.iso(Office.addDays(new Date(), +(s.validDays || 14))), terms: s.terms || DEFAULTS.terms, cancel: s.cancelTerms || DEFAULTS.cancelTerms, includes: DEFAULTS.includes, notes: '', lines: [] }); q = db.get('quotes', id); db.put('cases', { id: cs.id, quoteNo: no }); }
      db.put('quotes', { id: q.id, lines: (q.lines || []).concat(lines) });
      if (sup) { const link = db.list('links', l => l.caseId === cs.id && l.supplierId === sup.id)[0]; db.put('links', Object.assign(link ? { id: link.id } : { caseId: cs.id, supplierId: sup.id, supplier: sup.name, what: items.map(x => x.item).join(', '), askedAt: todayIso() }, { status: 'הצעה התקבלה', cost: items.reduce((a, x) => a + x.cost, 0) })); }
      toast(t('saved'));
      if (sup && sup.phone) {
        dialog(t('sqNotify', { name: sup.name }), `<textarea name="text" rows="8">${esc(supplierMarkupMessage(sup, cs, client, form.lang.value, s.signer || DEFAULTS.signer))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp'), cancel: t('skip') })
          .then(r => { if (r) openWhatsApp(sup.phone, r.text); location.hash = '#/quote/' + q.id; });
      } else location.hash = '#/quote/' + q.id;
    };
  }, t('read'));
  body.insertAdjacentHTML('afterbegin', `<div class="row"><label class="btn">${esc(t('sqPdf'))}<input type="file" accept="application/pdf,image/*" id="sqFile" class="sr"></label><span class="hint">${esc(t('sqPdfHint'))}</span></div>`);
  body.querySelector('#sqFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!/pdf/i.test(f.type)) { toast(t('sqImageHint'), 5000); return; }
    toast(t('syncing'));
    try { const text = await pdfText(f); ta.value = text; draft = text; lastPdf = f; toast(t('read')); } catch (err) { toast(t('sqPdfFail'), 4000); }
  };
}

/* ---------------- 4. the documents she keeps to send ---------------- */
async function tabDocs(body) {
  const lib = (await files.all()).filter(f => !f.caseId);
  body.innerHTML = `<p class="hint">${esc(t('docsHint'))}</p>
    <form class="card stack" id="up"><label class="btn">${esc(t('pickFile'))}<input type="file" id="f" class="sr"></label><span id="fname" class="sub"></span>${field('title', t('docTitle'), '')}${field('aliases', t('docAliases'), '', { placeholder: 'אישור חשבון, אישור בנק' })}<button class="btn primary" type="submit">${esc(t('save'))}</button></form>
    <h2>${esc(t('companyPapers'))}</h2><div class="list">${COMPANY_PAPERS.map(p => `<div class="card" data-p="${esc(p.key)}"><div class="row between"><span class="title">${esc(p.title)}</span><span class="badge ${p.status === 'found' ? 'ok' : ''}">${esc(p.status === 'found' ? t('paperFound') + (p.date ? ' · ' + esc(Office.fmt(p.date)) : '') : t('paperMissing'))}</span></div>${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}${p.status === 'found' && p.file ? `<div class="row"><button class="btn sm primary" data-pshare>${esc(t('shareFile'))}</button><a class="btn sm ghost" href="${esc(p.file)}" target="_blank" rel="noopener">${esc(t('open'))}</a>${copyBtn(new URL(p.file, location.href).href)}</div>` : ''}</div>`).join('')}</div>
    <h2>${esc(t('docsLib'))}</h2><div class="list">${lib.length ? lib.map(f => `<div class="card" data-f="${esc(f.id)}"><div class="row between"><span class="title">${esc(f.title || f.name)}</span><span class="sub ltr">${esc(f.name)} · ${Math.round((f.size || 0) / 1024)} KB</span></div>${f.aliases ? `<div class="sub">${esc(f.aliases)}</div>` : ''}<div class="row"><button class="btn sm primary" data-share>${esc(t('shareFile'))}</button>${copyBtn(t('docMsg', { doc: f.title || f.name }))}<button class="btn sm ghost" data-del>${esc(t('delete'))}</button></div></div>`).join('') : empty(t('noDocsYet'))}</div>
    <p class="hint">${esc(t('docsSuggest'))}</p>`;
  const inp = body.querySelector('#f'); inp.onchange = () => { body.querySelector('#fname').textContent = inp.files[0] ? inp.files[0].name : ''; if (inp.files[0] && !body.querySelector('[name=title]').value) body.querySelector('[name=title]').value = inp.files[0].name.replace(/\.[a-z0-9]+$/i, ''); };
  body.querySelector('#up').onsubmit = async e => { e.preventDefault(); const f = inp.files[0]; if (!f) return; await files.put(f, { title: body.querySelector('[name=title]').value.trim(), aliases: body.querySelector('[name=aliases]').value.trim() }); toast(t('saved')); tabDocs(body); };
  body.querySelectorAll('[data-p]').forEach(el => { const b = el.querySelector('[data-pshare]'); if (b) b.onclick = async () => { const p = COMPANY_PAPERS.find(x => x.key === el.dataset.p); const rec = await bundledRec(p); if (!(await shareFile(rec, p.title))) { downloadFile(rec); toast(t('shareFallback'), 4000); } }; });
  body.querySelectorAll('[data-f]').forEach(el => {
    el.querySelector('[data-del]').onclick = async () => { await files.remove(el.dataset.f); tabDocs(body); };
    el.querySelector('[data-share]').onclick = async () => { const rec = await files.get(el.dataset.f); if (!(await shareFile(rec, rec.title || rec.name))) { downloadFile(rec); toast(t('shareFallback'), 4000); } };
  });
}

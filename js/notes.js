/* Quick notes: one tap, dictate or type, pick who it is about (client, supplier, case, or nobody), save.
   The note stays on the person's card forever, and search finds it. If a known name is in the text, it is picked automatically. */
import { t, lang, SPEECH } from './i18n.js';
import { db } from './store.js';
import { esc, toast, confirmDialog, copyBtn } from './ui.js';
import Office from './logic/office.js';
import { speechSupported, listen } from './voice.js';

/** Who could this note be about: every client, supplier and open case, as {key, label, about, id}. */
export function subjects() {
  const out = [];
  db.list('clients').forEach(c => out.push({ key: 'client:' + c.id, label: c.name + (c.contact ? ' · ' + c.contact : ''), about: 'client', id: c.id, names: [c.name, c.contact] }));
  db.list('suppliers').forEach(s => out.push({ key: 'supplier:' + s.id, label: s.name + (s.contact ? ' · ' + s.contact : ''), about: 'supplier', id: s.id, names: [s.name, s.contact] }));
  db.list('team').forEach(p => out.push({ key: 'team:' + p.id, label: p.name + (p.role ? ' · ' + p.role : ''), about: 'team', id: p.id, names: [p.name] }));
  db.list('cases', c => Office.ACTIVE.includes(c.status)).forEach(c => out.push({ key: 'case:' + c.id, label: (c.client || '') + ' · ' + (c.kind || '') + (c.date ? ' · ' + Office.fmt(c.date) : ''), about: 'case', id: c.id, names: [] }));
  return out;
}
/** The subject whose name appears in the text (longest match wins), or null. */
export function guessSubject(text, list) {
  const hay = Office.normHe(text);
  let best = null, bestLen = 0;
  (list || subjects()).forEach(s => s.names.forEach(n => {
    const k = Office.normHe(n);
    if (k && k.length >= 3 && k.length > bestLen && hay.indexOf(k) >= 0) { best = s; bestLen = k.length; }
  }));
  return best;
}

/** Opens the quick-note sheet. preset: {about, id} locks the subject (from a client or supplier card). */
export function quickNote(preset) {
  const s = db.settings();
  const list = subjects();
  const dictLang = s.dictLang || lang();
  const wrap = document.createElement('div'); wrap.className = 'modal';
  const locked = preset && preset.about && preset.id ? list.find(x => x.about === preset.about && x.id === preset.id) : null;
  wrap.innerHTML = `<form class="modal-card"><h2>${esc(t('quickNote'))}</h2><div class="modal-body">
      <textarea name="text" rows="5" placeholder="${esc(t('notePh'))}" id="qnText"></textarea>
      <div class="row"><button type="button" class="btn rec" id="qnRec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>${esc(t('dictate'))}</span></button>
        <select id="qnLang" aria-label="${esc(t('dictateLang'))}">${Object.keys(SPEECH).map(k => `<option value="${k}"${k === dictLang ? ' selected' : ''}>${esc({ he: 'עברית', fr: 'Français', en: 'English' }[k])}</option>`).join('')}</select></div>
      <label class="f"><span>${esc(t('noteAbout'))}</span><select name="subject" id="qnSubject"${locked ? ' disabled' : ''}><option value="">${esc(t('nobody'))}</option>${list.map(x => `<option value="${esc(x.key)}"${locked && locked.key === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      <p class="hint" id="qnGuess"></p></div>
    <div class="row end"><button type="button" class="btn ghost" data-x="cancel">${esc(t('cancel'))}</button><button type="submit" class="btn primary">${esc(t('save'))}</button></div></form>`;
  document.body.appendChild(wrap);
  const ta = wrap.querySelector('#qnText'), rec = wrap.querySelector('#qnRec'), sel = wrap.querySelector('#qnSubject'), guess = wrap.querySelector('#qnGuess'), ls = wrap.querySelector('#qnLang');
  let stop = null;
  const close = () => { if (stop) stop(); wrap.remove(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.dataset.x === 'cancel') close(); });
  ls.onchange = () => db.setting('dictLang', ls.value);
  const autoPick = () => {
    if (locked) return;
    const g = guessSubject(ta.value, list);
    if (g && !sel.value) { sel.value = g.key; guess.textContent = t('guessed') + ': ' + g.label; }
  };
  ta.oninput = autoPick;
  rec.onclick = () => {
    if (stop) { stop(); return; }
    if (!speechSupported()) { toast(t('noSpeech'), 3500); return; }
    const base = ta.value ? ta.value.replace(/\s+$/, '') + '\n' : '';
    rec.classList.add('on'); rec.querySelector('span').textContent = t('stop');
    stop = listen(SPEECH[ls.value] || 'he-IL', text => { ta.value = base + text; autoPick(); }, () => { stop = null; rec.classList.remove('on'); rec.querySelector('span').textContent = t('dictate'); });
    if (!stop) { rec.classList.remove('on'); rec.querySelector('span').textContent = t('dictate'); toast(t('noSpeech'), 3500); }
  };
  wrap.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const text = ta.value.trim(); if (!text) return;
    const subj = locked || list.find(x => x.key === sel.value) || null;
    db.put('notes', { text, about: subj ? subj.about : '', aboutId: subj ? subj.id : '', aboutLabel: subj ? subj.label.split(' · ')[0] : '', lang: ls.value });
    close(); toast(t('saved'));
  };
  setTimeout(() => ta.focus(), 50);
  if (!speechSupported()) return;
  rec.click();
}

/** Notes about one subject, newest first. */
export function notesAbout(about, id) {
  return db.list('notes', n => n.about === about && n.aboutId === id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
}
/** The notes block for a client or supplier card. Wire with wireNotes(root, about, id). */
export function notesHtml(about, id) {
  const list = notesAbout(about, id);
  return `<section class="sec"><div class="sec-h"><h2>${esc(t('notes'))}</h2><button class="btn sm" id="addNote">🎙 ${esc(t('quickNote'))}</button></div>
    <div class="list">${list.length ? list.map(n => `<div class="card" data-note="${esc(n.id)}"><p style="white-space:pre-wrap">${esc(n.text)}</p><div class="row between"><span class="sub">${esc(Office.fmt(n.created))}</span><span class="row">${copyBtn(n.text)}<button class="btn sm ghost" data-delnote>${esc(t('delete'))}</button></span></div></div>`).join('') : `<p class="empty">${esc(t('noNotes'))}</p>`}</div></section>`;
}
export function wireNotes(root, about, id) {
  const b = root.querySelector('#addNote'); if (b) b.onclick = () => quickNote({ about, id });
  root.querySelectorAll('[data-note]').forEach(el => { el.querySelector('[data-delnote]').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) db.remove('notes', el.dataset.note); }; });
}

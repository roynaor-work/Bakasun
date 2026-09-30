/* The call queue: who to call now (call-backs due first), what we need from them, one tap to dial, and three outcomes:
   no answer (stays in the queue, a "could not reach you" message is ready), answered (with a note), call back (on a date). */
import { t, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, section, empty, dialog, toast, openWhatsApp, dial, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { CALL, callQueue, callOutcome, noAnswerMessage } from '../logic/extra.js';
import { delegateCallMessage } from '../logic/commands.js';
import { DEFAULTS } from '../data/defaults.js';

let tab = 'now';

export function render(ctx) {
  const { root } = ctx;
  const s = db.settings();
  const all = db.list('calls');
  const q = callQueue(all, new Date());
  const done = all.filter(c => c.status === CALL.answered).sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 30);
  const list = tab === 'now' ? q.now : tab === 'later' ? q.scheduled : done;
  const card = c => {
    const cs = c.caseId ? db.get('cases', c.caseId) : null;
    return `<div class="card" data-id="${esc(c.id)}">
      <div class="row between"><span class="title">${esc(c.name)}</span><span class="row">${c.status === CALL.callback && c.callbackAt ? `<span class="badge warn">${esc(Office.fmt(c.callbackAt))}</span>` : ''}${c.attempts ? `<span class="badge muted"><span class="count">${c.attempts}</span> ${esc(t('attempts'))}</span>` : ''}</span></div>
      ${c.why ? `<div class="sub"><b>${esc(t('why'))}:</b> ${esc(c.why)}</div>` : ''}
      <div class="sub">${cs ? `<a href="#/case/${esc(cs.id)}">${esc(cs.client)}${cs.date ? ' · ' + esc(Office.fmt(cs.date)) : ''}</a> · ` : ''}<span class="ltr">${esc(phonePretty(c.phone))}</span>${c.phone ? copyBtn(c.phone, { icon: true }) : ''}${c.note ? ' · ' + esc(c.note) : ''}</div>
      ${tab !== 'done' ? `<div class="row"><button class="btn primary" data-dial>${esc(t('call'))}</button><button class="btn wa sm" data-msg>${esc(t('sendMsg'))}</button></div>
      <div class="row"><button class="btn sm" data-out="noanswer">${esc(t('noAnswer'))}</button><button class="btn sm ok" data-out="answered">${esc(t('answered'))}</button><button class="btn sm" data-out="callback">${esc(t('callBack'))}</button><button class="btn sm ghost" data-delegate>${esc(t('delegate'))}</button></div>` : ''}
    </div>`;
  };
  root.innerHTML = `<header class="top"><h1>${esc(t('callQueue'))}</h1><button class="btn sm" id="new">+ ${esc(t('newCall'))}</button></header>
    <div class="tabs"><button class="${tab === 'now' ? 'on' : ''}" data-tab="now">${esc(t('toCall'))} (<span class="count">${q.now.length}</span>)</button><button class="${tab === 'later' ? 'on' : ''}" data-tab="later">${esc(t('callbacks'))} (<span class="count">${q.scheduled.length}</span>)</button><button class="${tab === 'done' ? 'on' : ''}" data-tab="done">${esc(t('callsDone'))}</button></div>
    <div class="list sec">${list.length ? list.map(card).join('') : empty(t('noCalls'))}</div>`;

  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(ctx); });
  root.querySelector('#new').onclick = async () => {
    const r = await dialog(t('newCall'), `<div class="grid2">${field('name', t('whoToCall'), '')}${field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })}</div>${field('why', t('why'), '')}
      ${field('lang', t('msgLang'), s.msgLang || 'he', { type: 'select', options: [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]] })}`, { ok: t('add') });
    if (r && (r.name || r.phone)) { db.put('calls', { name: r.name || phonePretty(r.phone), phone: r.phone, why: r.why, lang: r.lang, status: CALL.todo, attempts: 0 }); toast(t('saved')); }
  };
  root.querySelectorAll('.card[data-id]').forEach(el => {
    const c = db.get('calls', el.dataset.id);
    const d = el.querySelector('[data-dial]'); if (d) d.onclick = () => dial(c.phone);
    const m = el.querySelector('[data-msg]'); if (m) m.onclick = async () => {
      const text = noAnswerMessage(c, c.lang || s.msgLang || 'he', s.signer || '');
      const r = await dialog(t('sendMsg'), `<textarea name="text" rows="7">${esc(text)}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (r) openWhatsApp(c.phone, r.text);
    };
    const dg = el.querySelector('[data-delegate]'); if (dg) dg.onclick = async () => {
      const staff = db.list('staff').filter((x, i, a) => x.name && a.findIndex(y => y.name === x.name) === i);
      const r = await dialog(t('delegate'), `<label class="f"><span>${esc(t('delegateTo'))}</span><input name="who" list="dlg" autocomplete="off"><datalist id="dlg">${staff.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist></label>${field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })}${field('lang', t('msgLang'), s.msgLang || 'he', { type: 'select', options: [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]] })}`, { ok: t('whatsapp') });
      if (!r || !r.who) return;
      const st = staff.find(x => x.name === r.who); const phone = r.phone || (st && st.phone) || '';
      const cs = c.caseId ? db.get('cases', c.caseId) : null;
      const r2 = await dialog(r.who, `<textarea name="text" rows="8">${esc(delegateCallMessage(c, r.who, cs, r.lang, s.signer || DEFAULTS.signer))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (r2 && openWhatsApp(phone, r2.text)) db.put('calls', { id: c.id, note: (c.note ? c.note + ' · ' : '') + t('delegate') + ': ' + r.who });
    };
    el.querySelectorAll('[data-out]').forEach(b => b.onclick = async () => {
      const out = b.dataset.out;
      if (out === 'answered') {
        const r = await dialog(t('answered'), field('note', t('note'), c.note || '', { type: 'textarea', rows: 3 }), { ok: t('save') });
        if (r) db.put('calls', callOutcome(c, 'answered', { note: r.note }));
      } else if (out === 'callback') {
        const r = await dialog(t('callBack'), field('when', t('callbackWhen'), Office.iso(Office.addDays(new Date(), 1)), { type: 'date' }), { ok: t('save') });
        if (r) db.put('calls', callOutcome(c, 'callback', { when: r.when }));
      } else db.put('calls', callOutcome(c, 'noanswer'));
    });
  });
}

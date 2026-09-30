/* Reminders: the notification centre (#/notifications) and its settings (#/notifications/settings).
   The list comes from js/notify.js (the rules in js/logic/rules.js). Every action is hers to tap: a task, a WhatsApp
   draft she sends herself, a screen to open, "done", snooze, remove. Nothing goes out on its own. */
import { t, lang } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, toast, empty, openWhatsApp, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { TASK } from '../logic/extra.js';
import { RULE_KEYS, ruleSettings, groupByWhen, counts, snooze, dismiss, markSeen, snoozeDate } from '../logic/rules.js';
import { refresh, current, state, setState, permission, askPermission, canNotify, speakDigest } from '../notify.js';

export function render(ctx) {
  if (ctx.id === 'settings') return renderSettings(ctx);
  return renderList(ctx);
}

/* ---------------- the centre ---------------- */

function renderList({ root }) {
  const list = refresh();
  const st = state();
  const today = todayIso();
  const g = groupByWhen(list, today);
  const c = counts(list);
  const levelBadge = n => `<span class="badge ${n.level === 'urgent' ? 'late' : n.level === 'warn' ? 'warn' : 'muted'}">${esc(t(n.level === 'urgent' ? 'nfLevelUrgent' : n.level === 'warn' ? 'nfLevelWarn' : 'nfLevelInfo'))}</span>`;
  const card = n => {
    const cs = n.caseId ? db.get('cases', n.caseId) : null;
    const isNew = !(st[n.key] && st[n.key].seen);
    return `<div class="card nf ${esc(n.level)}" data-key="${esc(n.key)}">
      <div class="row between"><span class="title">${esc(n.title)}</span><span class="row nf-tags">${isNew ? `<span class="badge">${esc(t('nfNew'))}</span>` : ''}${n.kind === 'digest' ? '' : levelBadge(n)}</span></div>
      ${n.body ? `<div class="sub nf-body">${esc(n.body)}</div>` : ''}
      ${cs ? `<div class="sub"><a href="#/case/${esc(cs.id)}">${esc(t('nfEvent'))}: ${esc(cs.client)}${cs.date ? ' · ' + esc(Office.fmt(cs.date)) : ''}</a></div>` : ''}
      <div class="row nf-actions">${n.actions.map((a, i) => `<button class="btn sm ${a.type === 'whatsapp' ? 'wa' : a.type === 'done' ? 'ok' : a.type === 'open' ? 'ghost' : ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}
        <details class="nf-more"><summary class="btn sm ghost">${esc(t('nfSnooze'))}</summary><div class="row"><button class="btn sm ghost" data-snooze="1">${esc(t('nfSnooze1'))}</button><button class="btn sm ghost" data-snooze="3">${esc(t('nfSnooze3'))}</button>${cs && Office.day(cs.date) && Office.daysBetween(today, cs.date) > 1 ? `<button class="btn sm ghost" data-snooze="event">${esc(t('nfSnoozeEvent'))}</button>` : ''}<button class="btn sm ghost nf-dismiss" data-dismiss>${esc(t('nfDismiss'))}</button></div></details>
      </div></div>`;
  };
  const group = (key, items) => items.length ? `<div class="sub grp"><b>${esc(t(key))}</b> · ${items.length}</div>${items.map(card).join('')}` : '';
  root.innerHTML = `<header class="top nf-head"><h1>${esc(t('notifications'))}</h1><a class="btn sm" href="#/notifications/settings">${esc(t('settings'))}</a></header>
    <div class="row between nf-sub"><span class="sub">${esc(t('nfSub'))}</span><button class="btn sm ghost" id="allRead" ${list.length ? '' : 'disabled'}>${esc(t('nfAllRead'))}</button></div>
    <div class="list sec nf-list">${list.length ? group('nfToday', g.today) + group('nfSoon', g.soon) + group('nfLater', g.later)
      : `<div class="card nf-empty"><span class="title">${esc(t('nfEmptyTitle'))}</span><div class="sub">${esc(t('nfEmpty'))}</div></div>`}</div>
    ${list.length ? `<p class="hint">${esc(t('nfTestResult', { n: c.total, u: c.urgent, w: c.warn, i: c.info }))}</p>` : ''}`;

  root.querySelector('#allRead').onclick = () => { setState(markSeen(state(), list.map(n => n.key))); toast(t('nfMarkedRead')); };
  root.querySelectorAll('.card.nf[data-key]').forEach(el => {
    const n = list.find(x => x.key === el.dataset.key); if (!n) return;
    const cs = n.caseId ? db.get('cases', n.caseId) : null;
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(n, n.actions[+b.dataset.act], cs));
    el.querySelectorAll('[data-snooze]').forEach(b => b.onclick = () => {
      const v = b.dataset.snooze;
      const until = v === 'event' && cs ? Office.iso(Office.addDays(Office.day(cs.date), -1)) : snoozeDate(today, +v);
      setState(snooze(state(), n.key, until)); toast(t('nfSnoozed', { d: Office.fmt(until) }));
    });
    const d = el.querySelector('[data-dismiss]'); if (d) d.onclick = () => { setState(dismiss(state(), n.key)); toast(t('nfDismissed')); };
  });
}

/** One tapped action. Nothing is sent: WhatsApp opens with the draft and she presses send there. */
async function act(n, a, cs) {
  if (!a) return;
  const p = a.payload || {};
  if (a.type === 'open') { if (p.href) location.hash = p.href; return; }
  if (a.type === 'task') {
    db.put('tasks', { title: p.title || n.title, details: n.body || '', due: p.due || todayIso(), caseId: p.caseId || '', who: '', status: TASK.open, from: 'notify', notifyKey: n.key });
    setState(markSeen(state(), [n.key])); toast(t('nfTaskMade'));
    return;
  }
  if (a.type === 'whatsapp') {
    const r = await dialog(t('nfWaTitle'), (p.phone ? '' : `<p class="hint">${esc(t('nfPhoneAsk'))}</p>` + field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' }))
      + `<textarea name="text" rows="8">${esc(p.text)}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
    if (!r) return;
    if (openWhatsApp(p.phone || r.phone, r.text)) setState(markSeen(state(), [n.key]));
    return;
  }
  if (a.type === 'done') {
    if (p.col && p.id) { db.put(p.col, Object.assign({ id: p.id }, p.patch || {})); toast(t('nfDoneOk')); }
    else { setState(dismiss(state(), n.key)); toast(t('nfDoneOk')); }
  }
}
/* ---------------- the settings ---------------- */

function renderSettings({ root }) {
  const R = ruleSettings(db.settings());
  const perm = permission();
  const numField = (k, f) => `<label class="nf-num"><input type="number" min="0" max="365" name="${k}.${f}" value="${esc(R[k][f])}" inputmode="numeric"> <span>${esc(t(f === 'pct' ? 'nfPct' : 'nfDays'))}</span></label>`;
  const rule = ([k, nums]) => `<div class="card nf-rule"><label class="chk grow"><input type="checkbox" name="${k}.on"${R[k].on ? ' checked' : ''}> <span>${esc(t('nfR_' + k))}</span></label>${nums.length ? `<div class="row nf-nums">${nums.map(f => numField(k, f)).join('')}</div>` : ''}</div>`;
  root.innerHTML = `<header class="top"><a class="icon" href="#/notifications" aria-label="${esc(t('nfBackToList'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('nfSettings'))}</h1></header>
    <form id="rulesForm" class="stack nf-body">
      <section class="sec"><div class="sec-h"><h2>${esc(t('nfRules'))}</h2></div><p class="hint">${esc(t('nfRulesHint'))}</p><div class="list">${RULE_KEYS.map(rule).join('')}</div></section>
      <section class="sec"><div class="sec-h"><h2>${esc(t('nfBrowser'))}</h2></div><p class="hint">${esc(t('nfBrowserHint'))}</p>
        <div class="row">${!canNotify() ? `<span class="badge muted">${esc(t('nfBrowserNo'))}</span>` : perm === 'granted' ? `<span class="badge ok">${esc(t('nfBrowserGranted'))}</span>` : perm === 'denied' ? `<span class="warnbox">${esc(t('nfBrowserDenied'))}</span>` : `<button type="button" class="btn" id="askPerm">${esc(t('nfBrowserAsk'))}</button>`}</div>
        <label class="chk"><input type="checkbox" name="readDigest"${R.readDigest ? ' checked' : ''}> <span>${esc(t('nfReadDigest'))}</span></label>
        <div class="row"><button type="button" class="btn sm ghost" id="readNow">${esc(t('nfReadNow'))}</button></div></section>
      <section class="sec"><div class="sec-h"><h2>${esc(t('nfQuiet'))}</h2></div><p class="hint">${esc(t('nfQuietHint'))}</p>
        <div class="row nf-quiet">${field('quietFrom', t('nfQuietFrom'), R.quietFrom, { type: 'time' })}${field('quietTo', t('nfQuietTo'), R.quietTo, { type: 'time' })}</div></section>
      <section class="sec"><div class="row"><button type="button" class="btn primary" id="testNow">${esc(t('nfTestNow'))}</button></div><p class="hint" id="testOut"></p></section>
    </form>`;
  const form = root.querySelector('#rulesForm');
  const save = () => {
    const rules = {};
    RULE_KEYS.forEach(([k, nums]) => { rules[k] = { on: form.querySelector(`[name="${k}.on"]`).checked }; nums.forEach(f => { rules[k][f] = +form.querySelector(`[name="${k}.${f}"]`).value; }); });
    rules.readDigest = form.querySelector('[name=readDigest]').checked;
    rules.quietFrom = form.querySelector('[name=quietFrom]').value || '21:00';
    rules.quietTo = form.querySelector('[name=quietTo]').value || '07:00';
    db.setting('rules', rules); toast(t('nfSaved'));
  };
  form.addEventListener('change', save);
  const ask = root.querySelector('#askPerm'); if (ask) ask.onclick = async () => { await askPermission(); renderSettings({ root }); };
  root.querySelector('#readNow').onclick = () => speakDigest();
  root.querySelector('#testNow').onclick = () => { const c = counts(refresh()); root.querySelector('#testOut').textContent = t('nfTestResult', { n: c.total, u: c.urgent, w: c.warn, i: c.info }); };
}

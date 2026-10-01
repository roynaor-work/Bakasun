/* Settings: languages, signature, business, quote defaults, cloud login, backup, demo. */
import { t, LANGS, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, toast, confirmDialog, dialog, pickContacts, contactsSupported } from '../ui.js';
import { parseContactsFile } from '../logic/contacts.js';
import { importContacts, planImport, CLASSES } from '../contactsImport.js';
import { undoLast } from '../logic/undo.js';
import { templates, removeTemplate } from '../logic/templates.js';
import { TASK } from '../logic/extra.js';
import { PAPERS_BUCKET, paperAvailable, paperNeedsCloud } from '../papers.js';
import { travelLine } from '../logic/travel.js';
import { phoneDigits } from '../logic/core.js';
import * as cloud from '../cloud.js';
import { CLOUD } from '../data/cloudcfg.js';
import { parseMailLink, parseUrlHash, pickEmail } from '../logic/cloudLink.js';
import { DEFAULTS, COMPANY_DOCS } from '../data/defaults.js';
import { COMPANY_PAPERS } from '../data/docsList.js';
import { copyText, copyBtn, copyOf } from '../ui.js';
import { DASH_WIDGETS, widgetsOn, widgetsSetting } from '../logic/dashboard.js';

export const noLive = true;

/* Her look (settings → "אישי"): the theme attribute on <html> (app.js sets it on every route too) and the text-size class.
   Runs at start (app.js imports this module) and whenever a setting changes, also when the cloud brings one. */
const LANDINGS = ['today', 'dashboard', 'calendar', 'board', 'tasks'];
const WIDGET_LABEL = { now: 'dbNow', events: 'dbOpenEvents', tasksOverdue: 'dbTasksOverdue', tasksToday: 'dbTasksToday', tasksWeek: 'dbTasksWeek', calls: 'dbCalls', money: 'dbUnpaid', quotes: 'dbQuotes', suppliers: 'dbSuppliers', leads: 'dbLeads', next14: 'dbNext14', moneyByEvent: 'dbMoneyByEvent' };
export function applyPersonal() {
  const s = db.settings(); const h = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') h.dataset.theme = s.theme; else delete h.dataset.theme;
  h.classList.toggle('text-large', s.textSize === 'large');
}
applyPersonal(); db.subscribe(applyPersonal);

function personalSection(s) {
  const on = widgetsOn(s.dashWidgets);
  return `<section class="sec"><h2>${esc(t('personal'))}</h2><p class="hint">${esc(t('personalHint'))}</p>
    <form class="stack card" id="personalForm"><div class="grid2">
      ${field('landing', t('landing'), LANDINGS.includes(s.landing) ? s.landing : 'today', { type: 'select', options: LANDINGS.map(k => [k, t(k)]) })}
      ${field('theme', t('theme'), s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto', { type: 'select', options: [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]] })}
      ${field('textSize', t('textSize'), s.textSize === 'large' ? 'large' : 'normal', { type: 'select', options: [['normal', t('textNormal')], ['large', t('textLarge')]] })}
    </div>
    <h3>${esc(t('dashWidgets'))}</h3><p class="hint">${esc(t('dashWidgetsHint'))}</p>
    <div class="grid2">${DASH_WIDGETS.map(k => `<label class="chk"><input type="checkbox" name="w" value="${k}"${on[k] ? ' checked' : ''}> ${esc(t(WIDGET_LABEL[k]))}</label>`).join('')}</div>
    <div class="row"><button class="btn primary" type="submit">${esc(t('save'))}</button></div></form></section>`;
}

export function render({ root }) {
  const s = db.settings();
  const L = [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]];
  const cc = cloud.config();
  const travel = (() => { try { return JSON.parse(s.travel || '{}'); } catch (e) { return {}; } })();
  root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('settings'))}</h1></header>
    <form class="stack" id="f">
      <div class="grid2">
        ${field('lang', t('uiLang'), s.lang || 'he', { type: 'select', options: Object.keys(LANGS).map(k => [k, LANGS[k]]) })}
        ${field('dictLang', t('dictateLang'), s.dictLang || s.lang || 'he', { type: 'select', options: L })}
        ${field('msgLang', t('msgLang'), s.msgLang || 'he', { type: 'select', options: L })}
        ${field('followupDays', t('followupDays'), s.followupDays || 1, { type: 'number', inputmode: 'numeric' })}
        ${field('approvalRemindDays', t('approvalRemindDays'), s.approvalRemindDays || 2, { type: 'number', inputmode: 'numeric' })}
        ${field('supplierRemindDays', t('waitingSuppliers') + ': ' + t('afterDays'), s.supplierRemindDays || 1, { type: 'number', inputmode: 'numeric' })}
        ${field('supInvoiceDays', t('supInvoicesMissing') + ': ' + t('afterDays'), s.supInvoiceDays || 3, { type: 'number', inputmode: 'numeric' })}
        ${field('accountantEmail', t('accountantEmail'), s.accountantEmail || '', { ltr: true, inputmode: 'email' })}
        ${field('supplierPayReminder', t('supplierPayReminder'), s.supplierPayReminder || 'auto', { type: 'select', options: [['auto', t('autoRemind')], ['manual', t('manualRemind')]] })}
        ${field('supplierPayDays', t('supplierPay') + ': ' + t('afterEventDays'), s.supplierPayDays || 1, { type: 'number', inputmode: 'numeric' })}
        ${field('autoSpeak', t('autoSpeak'), s.autoSpeak || 'off', { type: 'select', options: [['off', t('autoSpeakOff')], ['on', t('autoSpeakOn')]] })}
      </div>
      ${field('signer', t('signer'), s.signer || DEFAULTS.signer, { type: 'textarea', rows: 2 })}
      <h2>${esc(t('templatesTitle'))}</h2>
      <p class="hint">${esc(t('templatesHint'))}</p>
      <div class="list">${templates(db).map(tp => `<div class="card" data-tpl="${esc(tp.name)}"><div class="row between"><span class="title">${esc(tp.name)}</span><span class="row">${copyBtn(tp.text)}<button type="button" class="btn sm ghost" data-del>${esc(t('delete'))}</button></span></div><div class="sub" style="white-space:pre-wrap">${esc(tp.text)}</div></div>`).join('') || `<p class="hint">${esc(t('noTemplates'))}</p>`}</div>
      <h2>${esc(t('biz'))}</h2>
      <div class="grid2">
        ${field('bizName', t('name'), s.bizName || DEFAULTS.bizName)}
        ${field('bizLegal', t('fLegal'), s.bizLegal || DEFAULTS.bizLegal)}
        ${field('bizId', t('fTaxId'), s.bizId || DEFAULTS.bizId, { ltr: true })}
        ${field('bizAddress', t('bizAddress'), s.bizAddress || DEFAULTS.bizAddress)}
        ${field('bizPhone', t('phone'), s.bizPhone || DEFAULTS.bizPhone, { ltr: true, inputmode: 'tel' })}
        ${field('bizEmail', t('fEmail'), s.bizEmail || DEFAULTS.bizEmail, { ltr: true })}
        ${field('invoiceTo', t('invoiceTo'), s.invoiceTo || '', { ltr: true, inputmode: 'tel' })}
      </div>
      <h2>${esc(t('quotes'))}</h2>
      <div class="grid2">
        ${field('vat', t('vat'), s.vat || 18, { type: 'number', inputmode: 'decimal' })}
        ${field('defaultMargin', t('defaultMargin'), s.defaultMargin || 25, { type: 'number', inputmode: 'decimal' })}
        ${field('validDays', t('validUntil') + ' (' + t('days') + ')', s.validDays || 14, { type: 'number', inputmode: 'numeric' })}
        ${field('reviewUrl', t('review'), s.reviewUrl || '', { ltr: true })}
      </div>
      ${field('bankDetails', t('bankDetails'), s.bankDetails || DEFAULTS.bankDetails, { type: 'textarea', rows: 3 })}<div class="row">${copyOf('[name=bankDetails]')}</div>
      ${field('terms', t('terms'), s.terms || DEFAULTS.terms, { type: 'textarea', rows: 3 })}
      ${field('cancelTerms', t('cancelTerms'), s.cancelTerms || DEFAULTS.cancelTerms, { type: 'textarea', rows: 4 })}
      <div class="row"><button class="btn primary grow" type="submit">${esc(t('save'))}</button></div>
    </form>
    ${personalSection(s)}
    <section class="sec"><h2>${esc(t('cloud'))}</h2>
      ${cc && cc.on ? `<p class="hint">${esc(t('cloudOn'))} <span class="ltr">${esc(cc.email)}</span>${copyBtn(cc.email, { icon: true })} · <span id="cs"></span></p><div class="row"><button class="btn" id="logout">${esc(t('logout'))}</button><button class="btn primary" id="relink" hidden>${esc(t('sendLink'))}</button></div>`
      : `<p class="hint">${esc(t('cloudOff'))} ${esc(t('cloudHelp'))}</p>
        <form class="stack card" id="cl"><div class="grid2">${field('email', t('email'), s.bizEmail || DEFAULTS.bizEmail, { ltr: true })}</div>
          <div class="row"><button class="btn primary" type="submit">${esc(t('sendLink'))}</button>${copyOf('[name=email]')}<span class="hint">${esc(t('sendLinkHint'))}</span></div>
          <details><summary>${esc(t('pasteLinkTitle'))}</summary>${field('link', t('pasteLink'), '', { type: 'textarea', rows: 3, ltr: true })}<div class="row"><button class="btn" type="button" id="useLink">${esc(t('useLink'))}</button>${copyOf('[name=link]')}</div></details></form>
        <details><summary>${esc(t('withPassword'))}</summary><form class="stack" id="cf"><div class="grid2">${CLOUD.url ? `<input type="hidden" name="url" value="${esc(CLOUD.url)}"><input type="hidden" name="key" value="${esc(CLOUD.key)}">` : field('url', t('cloudUrl'), (cc && cc.url) || '', { ltr: true, placeholder: 'https://xxxx.supabase.co' }) + field('key', t('cloudKey'), '', { ltr: true })}${field('email', t('email'), (cc && cc.email) || '', { ltr: true, inputmode: 'email' })}${field('password', t('password'), '', { type: 'password', ltr: true })}</div><button class="btn primary" type="submit">${esc(t('login'))}</button></form></details>`}
    </section>
    <section class="sec"><h2>${esc(t('companyDocs'))}</h2><div class="card"><div class="kv"><dt>${esc(t('fLegal'))}</dt><dd>${esc(s.bizLegal || DEFAULTS.bizLegal)}</dd><dt>${esc(t('fTaxId'))}</dt><dd class="ltr">${esc(s.bizId || DEFAULTS.bizId)}${copyBtn(s.bizId || DEFAULTS.bizId, { icon: true })}</dd><dt>${esc(t('bizAddress'))}</dt><dd>${esc(s.bizAddress || DEFAULTS.bizAddress)}${copyBtn(s.bizAddress || DEFAULTS.bizAddress, { icon: true })}</dd><dt>${esc(t('phone'))}</dt><dd class="ltr">${esc(s.bizPhone || DEFAULTS.bizPhone)}${copyBtn(s.bizPhone || DEFAULTS.bizPhone, { icon: true })}</dd><dt>${esc(t('fEmail'))}</dt><dd class="ltr">${esc(s.bizEmail || DEFAULTS.bizEmail)}${copyBtn(s.bizEmail || DEFAULTS.bizEmail, { icon: true })}</dd></div><div class="row"><button class="btn sm" id="copyBiz">${esc(t('copyDetails'))}</button></div></div>
      <div class="list">${COMPANY_PAPERS.map(p => `<div class="card row between"><span class="title grow">${esc(p.title)}</span><span class="badge ${paperAvailable(p) ? 'ok' : p.status === 'found' ? 'warn' : ''}">${esc(paperNeedsCloud(p) ? t('paperInCloud') : p.status === 'found' ? t('paperFound') : t('paperMissing'))}</span></div>`).join('')}</div>
      <p class="hint">${esc(t('docsHint'))} <a href="#/assist">${esc(t('assist'))}</a></p>
      <div class="list">${COMPANY_DOCS.map(d => `<a class="card tap" href="${esc(d.url)}" target="_blank" rel="noopener"><span class="title">${esc(d.title)}</span></a>`).join('')}</div></section>
    <section class="sec"><h2>${esc(t('backup'))}</h2><p class="hint">${esc(cc && cc.on ? t('cloudOn') : t('dataLocal'))}</p>
      <div class="row"><button class="btn" id="exp">${esc(t('exportJson'))}</button><label class="btn">${esc(t('importJson'))}<input type="file" accept="application/json" id="imp" class="sr"></label></div></section>
    <section class="sec"><h2>${esc(t('travelMode'))}</h2><p class="hint">${esc(t('travelHint'))}</p>
      <form class="stack" id="travelForm"><label class="chk"><input type="checkbox" name="on"${travel.on ? ' checked' : ''}> ${esc(t('travelOn'))}</label>
      <div class="grid2">${field('from', t('fromDate'), travel.from || '', { type: 'date' })}${field('to', t('until'), travel.to || '', { type: 'date' })}${field('subName', t('coveredBy'), travel.subName || '', { type: 'select', options: [['', '']].concat(db.list('team').map(x => [x.name, x.name + (x.role ? ' · ' + x.role : '')])) })}${field('subPhone', t('fPhone'), travel.subPhone || '', { ltr: true, inputmode: 'tel' })}</div>
      ${field('notes', t('travelNotes'), travel.notes || '', { type: 'textarea', rows: 3 })}<button class="btn primary" type="submit">${esc(t('save'))}</button></form></section>
    <section class="sec"><h2>${esc(t('contacts'))}</h2><p class="hint">${esc(t('contactsHint'))}</p>
      <p><b>${esc(t('contactsCount', { n: db.list('contacts').length }))}</b></p>
      <div class="row"><button class="btn sm" id="pickMany">${esc(t('fromPhone'))}</button><label class="btn sm">${esc(t('importFile'))}<input type="file" id="contactsFile" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard,text/plain" hidden></label></div>
      <div id="ciPreview" class="stack"></div></section>
    <section class="sec"><h2>${esc(t('team'))}</h2><p class="hint">${esc(t('teamHint'))}</p>
      <div class="list">${db.list('team').map(p => `<div class="card" data-team="${esc(p.id)}"><div class="row between"><span class="title">${esc(p.name)}${p.role ? ` <span class="sub">· ${esc(p.role)}</span>` : ''}</span><span class="row"><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button><button class="btn sm ghost" data-del>✕</button></span></div><div class="sub ltr">${p.phone || p.email ? [p.phone, p.email].filter(Boolean).map(v => esc(v) + copyBtn(v, { icon: true })).join(' · ') : '—'}</div></div>`).join('')}</div>
      <div class="row"><button class="btn sm" id="addTeam">${esc(t('addPerson'))}</button></div></section>
    <section class="sec"><h2>${esc(t('startData'))}</h2><div class="row"><button class="btn" id="seed">${esc(t('loadSeed'))}</button></div><p class="hint">${esc(t('noWipeHint'))}</p></section>
    <p class="hint sec">${esc(t('install'))}</p>
    <p class="hint sec" id="ver">${esc(t('version'))}: <span class="ltr">…</span> <button type="button" class="btn sm ghost" id="verChk">${esc(t('checkUpdate'))}</button></p>`;
  showVersion(root);

  root.querySelectorAll('[data-tpl]').forEach(el => { el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog(t('delete') + ' "' + el.dataset.tpl + '"?')) { removeTemplate(db, el.dataset.tpl); render({ root }); } }; });
  root.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const o = {}; new FormData(e.target).forEach((v, k) => { o[k] = String(v).trim(); });
    Object.keys(o).forEach(k => db.setting(k, o[k]));
    toast(t('saved'));
    location.hash = '#/today';
  };
  root.querySelector('#personalForm').onsubmit = e => {
    e.preventDefault(); const fd = new FormData(e.target);
    db.setting('landing', String(fd.get('landing') || 'today'));
    db.setting('theme', String(fd.get('theme') || 'auto'));
    db.setting('textSize', String(fd.get('textSize') || 'normal'));
    db.setting('dashWidgets', widgetsSetting(fd.getAll('w').map(String)));
    applyPersonal(); toast(t('saved')); render({ root });
  };
  const cf = root.querySelector('#cf'); if (cf) cf.onsubmit = async e => {
    e.preventDefault(); const o = {}; new FormData(e.target).forEach((v, k) => { o[k] = String(v).trim(); });
    toast(t('syncing'));
    try { await cloud.login(o.url, o.key, o.email, o.password); toast(t('synced')); render({ root }); } catch (err) { toast(t('syncError') + ' ' + (err.message || ''), 5000); }
  };
  const cl = root.querySelector('#cl'); if (cl) {
    cl.onsubmit = async e => {
      e.preventDefault(); const email = pickEmail(cl.querySelector('[name=email]').value, s.bizEmail || DEFAULTS.bizEmail);
      try { await cloud.sendLink(CLOUD.url, CLOUD.key, email); toast(t('linkSent', { email }), 6000); } catch (err) { toast(t('syncError') + ' ' + (err.message || ''), 5000); }
    };
    cl.querySelector('#useLink').onclick = async () => {
      const link = parseMailLink(cl.querySelector('[name=link]').value) || parseUrlHash(cl.querySelector('[name=link]').value.trim());
      if (!link) { toast(t('noLinkFound'), 4000); return; }
      toast(t('syncing'));
      try { await cloud.loginWithLink(CLOUD.url, CLOUD.key, link); toast(t('synced')); render({ root }); } catch (err) { toast((err.message === 'no-org' ? t('noOrg') : t('cloudLinkFailed')) + ' ' + (err.message || ''), 6000); }
    };
  }
  const lo = root.querySelector('#logout'); if (lo) lo.onclick = () => { if (cloud.status.queued && !confirm(t('cloudQueuedWarn', { n: cloud.status.queued }))) return; cloud.logout(); render({ root }); };
  const rl = root.querySelector('#relink'); if (rl) rl.onclick = async () => { try { await cloud.sendLink(CLOUD.url, CLOUD.key, cc.email); toast(t('linkSent', { email: cc.email }), 6000); } catch (err) { toast(t('cloudLinkFailed') + ' ' + (err.message || ''), 6000); } };
  const cs = root.querySelector('#cs'); if (cs) {
    const draw = st => {
      const extra = [st.queued ? t('cloudQueued', { n: st.queued }) : '', st.conflicts && st.conflicts.length ? t('cloudConflicts', { n: st.conflicts.length }) : '', st.skipped && st.skipped.length ? t('cloudSkipped', { what: st.skipped.join(', ') }) : '', st.fileError ? t('cloudFileError') + ' ' + st.fileError : ''].filter(Boolean).join(' · ');
      cs.textContent = st.expired ? t('sessionExpired') : st.state === 'error' ? t('syncError') + (st.error ? ' (' + st.error + ')' : '') : st.state === 'syncing' ? t('syncing') : t('synced') + (st.last ? ' · ' + st.last.slice(11, 16) : '');
      if (extra) cs.textContent += ' · ' + extra;
      const relink = root.querySelector('#relink'); if (relink) relink.hidden = !st.expired;
    };
    draw(cloud.status); cloud.onStatus(draw);
  }
  root.querySelector('#copyBiz').onclick = () => copyText([s.bizLegal || DEFAULTS.bizLegal, 'ח.פ. ' + (s.bizId || DEFAULTS.bizId), s.bizAddress || DEFAULTS.bizAddress, s.bizPhone || DEFAULTS.bizPhone, s.bizEmail || DEFAULTS.bizEmail].join('\n'));
  root.querySelector('#exp').onclick = () => {
    const blob = new Blob([db.exportJson()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bakasun-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  };
  root.querySelector('#imp').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    // a backup file only adds what is missing or newer; it never wipes what is here
    f.text().then(txt => { const n = db.importJson(txt); toast(t('mergedBackup', { n }), 4000); location.hash = '#/today'; }).catch(() => toast(t('badBackup'), 4000));
  };
  // the starting data (suppliers, clients, team, open events) is not in the app: it is fetched from the private cloud bucket
  root.querySelector('#seed').onclick = async () => {
    if (!cloud.isOn() || cloud.status.expired) { toast(t('seedNeedsCloud'), 5000); return; }
    const blob = await cloud.downloadFileBlob(PAPERS_BUCKET, cloud.orgId() + '/seed/seed.json');
    let seed = null; try { seed = blob ? JSON.parse(await blob.text()) : null; } catch (e) { seed = null; }
    if (!seed) { toast(t('seedLoadFailed') + (cloud.status.fileError ? ' ' + cloud.status.fileError : ''), 6000); return; }
    const SEED_SUPPLIERS = seed.SEED_SUPPLIERS || [], SEED_CLIENTS = seed.SEED_CLIENTS || [], SEED_TEAM = seed.SEED_TEAM || [], SEED_STAFF = seed.SEED_STAFF || [], SEED_PAYMENTS = seed.SEED_PAYMENTS || [], SEED_CASES = seed.SEED_CASES || [];
    const haveS = new Set(db.list('suppliers').map(x => x.name)), haveC = new Set(db.list('clients').map(x => x.name)), haveT = new Set(db.list('team').map(x => x.name));
    let ns = 0, nc = 0, np = 0;
    SEED_SUPPLIERS.forEach(x => {
      // a supplier already there only gets the fields it lacks (a mail, a phone); nothing is overwritten
      const ex = db.list('suppliers').find(c => c.name === x.name);
      if (ex) { const patch = {}; ['email', 'phone', 'contact'].forEach(k => { if (x[k] && !ex[k]) patch[k] = x[k]; }); if (Object.keys(patch).length) db.put('suppliers', Object.assign({ id: ex.id }, patch)); return; }
      db.put('suppliers', { name: x.name, type: x.type, contact: x.contact, phone: x.phone, email: x.email, lang: x.lang, notes: [x.role, x.notes].filter(Boolean).join(' · '), rating: 3, active: 'כן', area: '' }); ns++;
    });
    SEED_CLIENTS.forEach(x => { const ex = db.list('clients').find(c => c.name === x.name); const rec = { name: x.name, aliases: x.aliases, contact: x.contact, phone: x.phone, email: x.email, lang: x.lang, legalName: x.legalName, taxId: x.taxId, address: x.address, invoiceEmail: x.invoiceEmail, approver: x.approver, payer: x.payer, payTerms: x.payTerms, attachments: x.attachments, notes: [x.kind, x.role, x.notes].filter(Boolean).join(' · ') }; if (ex) { const patch = { id: ex.id }; Object.keys(rec).forEach(k => { if (rec[k] && !ex[k]) patch[k] = rec[k]; }); if (Object.keys(patch).length > 1) db.put('clients', patch); return; } db.put('clients', rec); nc++; });
    const havePay = new Set(db.list('payments').map(p => (p.paidAt || p.invoicedAt || '') + '|' + p.amount));
    SEED_PAYMENTS.forEach(x => { const key = x.date + '|' + x.amount; if (havePay.has(key)) return; const cl = db.list('clients').find(c => c.name.includes(x.client)); db.put('payments', { client: cl ? cl.name : x.client, clientId: cl ? cl.id : '', amount: x.amount, note: x.note, status: x.status, invoicedAt: x.date, paidAt: x.status === 'שולם' ? x.date : '', due: x.date }); });
    SEED_TEAM.forEach(x => {
      const ex = db.list('team').find(c => c.name === x.name);
      if (ex) { const patch = {}; ['role', 'phone', 'email', 'note'].forEach(k => { if (x[k] && !ex[k]) patch[k] = x[k]; }); if (Object.keys(patch).length) db.put('team', Object.assign({ id: ex.id }, patch)); return; }
      db.put('team', { name: x.name, role: x.role, phone: x.phone, email: x.email, note: x.note || '' }); np++;
    });
    const haveStaff = new Set(db.list('staff').map(x => x.name));
    SEED_STAFF.forEach(x => { if (haveStaff.has(x.name)) return; db.put('staff', { name: x.name, role: x.role, phone: x.phone, email: x.email, note: x.note || '' }); np++; });
    let ne = 0;
    SEED_CASES.forEach(x => {
      if (db.list('cases').some(c => c.seedKey === x.key)) return;
      const cl = db.list('clients').find(c => c.name === x.client) || {};
      const id = db.put('cases', { seedKey: x.key, clientId: cl.id || '', client: x.client, contact: cl.contact || '', phone: cl.phone || '', email: cl.email || '', kind: x.kind, date: x.date, participants: x.participants, place: x.place, purpose: x.purpose, lang: x.lang, status: x.status, asClient: !!x.asClient, needs: x.needs, days: x.days || '', rooms: x.rooms || '', opened: '2026-09-27' });
      (x.suppliers || []).forEach(([name, status, what]) => { const sp = db.list('suppliers').find(y => y.name === name); if (sp) db.put('links', { caseId: id, supplierId: sp.id, supplier: sp.name, status, what, askedAt: status === 'ביקשנו הצעה' ? '2026-09-25' : '', answeredAt: status === 'ביקשנו הצעה' ? '' : '2026-09-26' }); });
      (x.tasks || []).forEach(([title, due]) => db.put('tasks', { caseId: id, title, who: t('me'), due, status: TASK.open, lang: x.lang }));
      ne++;
    });
    toast(ns + nc + np + ne ? t('seedLoaded', { s: ns, c: nc, p: np, e: ne }) : t('seedDone'), 4000); render({ root });
  };
  const editTeam = async p => {
    const r = await dialog(p ? p.name : t('addPerson'), `${field('name', t('fName'), p ? p.name : '')}<div class="grid2">${field('role', t('role'), p ? p.role : '')}${field('phone', t('fPhone'), p ? p.phone : '', { ltr: true, inputmode: 'tel' })}</div>${field('email', t('fEmail'), p ? p.email : '', { ltr: true, inputmode: 'email' })}`, { ok: t('save') });
    if (!r || !r.name) return;
    db.put('team', Object.assign({}, p ? { id: p.id } : {}, { name: r.name.trim(), role: r.role, phone: r.phone, email: r.email }));
    if (!db.setting('invoiceTo') && /רועי|roy/i.test(r.name) && r.phone) db.setting('invoiceTo', r.phone);
    render({ root });
  };
  root.querySelector('#addTeam').onclick = () => editTeam(null);
  root.querySelector('#travelForm').onsubmit = e => {
    e.preventDefault(); const fd = new FormData(e.target); const tr = { on: !!fd.get('on'), from: fd.get('from'), to: fd.get('to'), subName: fd.get('subName'), subPhone: fd.get('subPhone') || ((db.list('team').find(x => x.name === fd.get('subName')) || {}).phone || ''), notes: fd.get('notes') };
    const was = travel.on; db.setting('travel', JSON.stringify(tr));
    const base = s.signerBackup || s.signer || DEFAULTS.signer;
    if (tr.on) { db.setting('signerBackup', base); db.setting('signer', base + '\n' + travelLine(tr, s.msgLang || 'he')); }
    else if (was) { db.setting('signer', base); db.setting('signerBackup', ''); }
    toast(t('saved')); render({ root });
  };
  // contacts import: parse → preview (counts per class, one class selector per row) → import → summary with undo. Nothing is saved before "import".
  const ciBox = root.querySelector('#ciPreview');
  const ciLabel = cls => t('ci_' + cls);
  const ciReason = r => r.reason === 'none' ? '' : t('ciWhy_' + r.reason, { what: r.word });
  const previewContacts = list => {
    if (!list || !list.length) { toast(t('ciNothing'), 3000); return; }
    const plan = planImport(list);
    const counts = plan.counts, limit = 400;
    const rowHtml = (r, i) => `<div class="card row between ci-row" data-ci="${i}"><div style="min-width:0;flex:1"><div class="title">${esc(r.contact.name)}${r.contact.org && r.contact.org !== r.contact.name ? ` <span class="hint">· ${esc(r.contact.org)}</span>` : ''}</div>
        <div class="sub"><span class="ltr">${esc(r.contact.phone || '')}</span>${r.contact.email ? ` · <span class="ltr">${esc(r.contact.email)}</span>` : ''}${r.existing ? ` · <span class="badge muted">${esc(t('ciExisting', { who: r.existing.card.name }))}</span>` : ''}${ciReason(r) ? ` <span class="hint">${esc(ciReason(r))}</span>` : ''}</div></div>
        <select name="cls" data-ci-sel="${i}">${CLASSES.map(c => `<option value="${c}"${c === r.cls ? ' selected' : ''}>${esc(ciLabel(c))}</option>`).join('')}</select></div>`;
    ciBox.innerHTML = `<div class="card stack"><h3>${esc(t('ciPreviewTitle', { n: plan.rows.length }))}</h3>
      <p class="hint">${esc(t('ciCounts', { client: counts.client, supplier: counts.supplier, staff: counts.staff, contact: counts.contact, existing: counts.existing }))}</p>
      <div class="row"><label class="hint">${esc(t('ciSetAll'))} <select id="ciAll"><option value=""></option>${CLASSES.map(c => `<option value="${c}">${esc(ciLabel(c))}</option>`).join('')}</select></label></div>
      <div class="list" id="ciRows">${plan.rows.slice(0, limit).map(rowHtml).join('')}${plan.rows.length > limit ? `<p class="hint">${esc(t('ciMore', { n: plan.rows.length - limit }))}</p>` : ''}</div>
      <div class="row"><button class="btn primary" id="ciGo">${esc(t('ciImportBtn'))}</button><button class="btn ghost" id="ciCancel">${esc(t('cancel'))}</button></div></div>`;
    ciBox.querySelector('#ciAll').onchange = e => { if (!e.target.value) return; ciBox.querySelectorAll('[data-ci-sel]').forEach(sel => { sel.value = e.target.value; }); };
    ciBox.querySelector('#ciCancel').onclick = () => { ciBox.innerHTML = ''; };
    ciBox.querySelector('#ciGo').onclick = () => {
      const choices = plan.rows.map((r, i) => { const sel = ciBox.querySelector(`[data-ci-sel="${i}"]`); return sel ? sel.value : r.cls; });
      const res = importContacts(list, choices, t('ciUndoLabel'));
      const a = res.added, u = res.updated;
      const msg = t('ciDone', { added: a.client + a.supplier + a.staff + a.contact, updated: u.client + u.supplier + u.staff + u.contact, skipped: res.skipped, client: a.client + u.client, supplier: a.supplier + u.supplier, staff: a.staff + u.staff, contact: a.contact + u.contact });
      toast(msg, 5000);
      render({ root });
      const box = root.querySelector('#ciPreview'); if (!box) return;
      box.innerHTML = `<div class="okbox row between"><span>${esc(msg)}</span>${res.total ? `<button class="btn sm ghost" id="ciUndo">${esc(t('undoBtn'))}</button>` : ''}</div>`;
      const ub = box.querySelector('#ciUndo'); if (ub) ub.onclick = () => { const l = undoLast(); toast(l ? t('undone', { what: l }) : t('nothingToUndo')); render({ root }); };
    };
    ciBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  root.querySelector('#pickMany').onclick = async () => { if (!contactsSupported()) { toast(t('noPicker'), 4000); return; } const list = await pickContacts(true); if (list && list.length) previewContacts(list); };
  root.querySelector('#contactsFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; const text = await f.text(); e.target.value = ''; previewContacts(parseContactsFile(f.name, text)); };
  root.querySelectorAll('[data-team]').forEach(el => {
    el.querySelector('[data-edit]').onclick = () => editTeam(db.get('team', el.dataset.team));
    el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog(t('delete') + '?')) { db.remove('team', el.dataset.team); render({ root }); } };
  });
}

/** The version she runs (the service-worker cache name), and a button that fetches a newer one when there is one. */
async function showVersion(root) {
  const el = root.querySelector('#ver'); if (!el) return;
  let v = '';
  try { if (window.caches) { const ks = await caches.keys(); v = (ks.map(k => (/^bakasun-v(\d+)$/.exec(k) || [])[1]).filter(Boolean).sort((a, b) => Number(b) - Number(a))[0]) || ''; } } catch (e) { /* no cache api */ }
  el.querySelector('span').textContent = v ? 'v' + v : t('versionUnknown');
  el.querySelector('#verChk').onclick = async () => {
    try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) { await reg.update(); toast(t('updateChecked')); setTimeout(() => showVersion(root), 3000); return; } } catch (e) { /* fall through */ }
    location.reload();
  };
}

/* Settings: languages, signature, business, quote defaults, cloud login, backup, demo. */
import { t, LANGS, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, toast, confirmDialog, dialog, pickContacts, contactsSupported } from '../ui.js';
import { parseContactsFile } from '../logic/contacts.js';
import { SEED_SUPPLIERS, SEED_CLIENTS, SEED_TEAM } from '../data/seedContacts.js';
import { phoneDigits } from '../logic/core.js';
import { loadDemo } from '../data/demo.js';
import * as cloud from '../cloud.js';
import { CLOUD } from '../data/cloudcfg.js';
import { DEFAULTS, COMPANY_DOCS } from '../data/defaults.js';
import { COMPANY_PAPERS } from '../data/docsList.js';
import { copyText } from '../ui.js';

export const noLive = true;

export function render({ root }) {
  const s = db.settings();
  const L = [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]];
  const cc = cloud.config();
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
      </div>
      ${field('signer', t('signer'), s.signer || DEFAULTS.signer, { type: 'textarea', rows: 2 })}
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
      ${field('bankDetails', t('bankDetails'), s.bankDetails || DEFAULTS.bankDetails, { type: 'textarea', rows: 3 })}
      ${field('terms', t('terms'), s.terms || DEFAULTS.terms, { type: 'textarea', rows: 3 })}
      ${field('cancelTerms', t('cancelTerms'), s.cancelTerms || DEFAULTS.cancelTerms, { type: 'textarea', rows: 4 })}
      <div class="row"><button class="btn primary grow" type="submit">${esc(t('save'))}</button></div>
    </form>
    <section class="sec"><h2>${esc(t('cloud'))}</h2>
      ${cc && cc.on ? `<p class="hint">${esc(t('cloudOn'))} <span class="ltr">${esc(cc.email)}</span> · <span id="cs"></span></p><div class="row"><button class="btn" id="logout">${esc(t('logout'))}</button></div>`
      : `<p class="hint">${esc(t('cloudOff'))} ${esc(t('cloudHelp'))}</p><form class="stack" id="cf"><div class="grid2">${CLOUD.url ? `<input type="hidden" name="url" value="${esc(CLOUD.url)}"><input type="hidden" name="key" value="${esc(CLOUD.key)}">` : field('url', t('cloudUrl'), (cc && cc.url) || '', { ltr: true, placeholder: 'https://xxxx.supabase.co' }) + field('key', t('cloudKey'), '', { ltr: true })}${field('email', t('email'), (cc && cc.email) || '', { ltr: true, inputmode: 'email' })}${field('password', t('password'), '', { type: 'password', ltr: true })}</div><button class="btn primary" type="submit">${esc(t('login'))}</button></form>`}
    </section>
    <section class="sec"><h2>${esc(t('companyDocs'))}</h2><div class="card"><div class="kv"><dt>${esc(t('fLegal'))}</dt><dd>${esc(s.bizLegal || DEFAULTS.bizLegal)}</dd><dt>${esc(t('fTaxId'))}</dt><dd class="ltr">${esc(s.bizId || DEFAULTS.bizId)}</dd><dt>${esc(t('bizAddress'))}</dt><dd>${esc(s.bizAddress || DEFAULTS.bizAddress)}</dd><dt>${esc(t('fEmail'))}</dt><dd class="ltr">${esc(s.bizEmail || DEFAULTS.bizEmail)}</dd></div><div class="row"><button class="btn sm" id="copyBiz">${esc(t('copyDetails'))}</button></div></div>
      <div class="list">${COMPANY_PAPERS.map(p => `<div class="card row between"><span class="title grow">${esc(p.title)}</span><span class="badge ${p.status === 'found' ? 'ok' : ''}">${esc(p.status === 'found' ? t('paperFound') : t('paperMissing'))}</span></div>`).join('')}</div>
      <p class="hint">${esc(t('docsHint'))} <a href="#/assist">${esc(t('assist'))}</a></p>
      <div class="list">${COMPANY_DOCS.map(d => `<a class="card tap" href="${esc(d.url)}" target="_blank" rel="noopener"><span class="title">${esc(d.title)}</span></a>`).join('')}</div></section>
    <section class="sec"><h2>${esc(t('backup'))}</h2><p class="hint">${esc(cc && cc.on ? t('cloudOn') : t('dataLocal'))}</p>
      <div class="row"><button class="btn" id="exp">${esc(t('exportJson'))}</button><label class="btn">${esc(t('importJson'))}<input type="file" accept="application/json" id="imp" class="sr"></label></div></section>
    <section class="sec"><h2>${esc(t('contacts'))}</h2><p class="hint">${esc(t('contactsHint'))}</p>
      <p><b>${esc(t('contactsCount', { n: db.list('contacts').length }))}</b></p>
      <div class="row"><button class="btn sm" id="pickMany">${esc(t('fromPhone'))}</button><label class="btn sm">${esc(t('importFile'))}<input type="file" id="contactsFile" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard" hidden></label>${db.list('contacts').length ? `<button class="btn sm ghost" id="clearContacts">${esc(t('clearContacts'))}</button>` : ''}</div></section>
    <section class="sec"><h2>${esc(t('team'))}</h2><p class="hint">${esc(t('teamHint'))}</p>
      <div class="list">${db.list('team').map(p => `<div class="card" data-team="${esc(p.id)}"><div class="row between"><span class="title">${esc(p.name)}${p.role ? ` <span class="sub">· ${esc(p.role)}</span>` : ''}</span><span class="row"><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button><button class="btn sm ghost" data-del>✕</button></span></div><div class="sub ltr">${esc([p.phone, p.email].filter(Boolean).join(' · ') || '—')}</div></div>`).join('')}</div>
      <div class="row"><button class="btn sm" id="addTeam">${esc(t('addPerson'))}</button></div></section>
    <section class="sec"><h2>${esc(t('demo'))}</h2><div class="row"><button class="btn" id="seed">${esc(t('loadSeed'))}</button></div><div class="row"><button class="btn" id="demo">${esc(t('loadDemo'))}</button><button class="btn danger" id="clear">${esc(t('clearAll'))}</button></div></section>
    <p class="hint sec">${esc(t('install'))}</p>`;

  root.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const o = {}; new FormData(e.target).forEach((v, k) => { o[k] = String(v).trim(); });
    Object.keys(o).forEach(k => db.setting(k, o[k]));
    toast(t('saved'));
    location.hash = '#/today';
  };
  const cf = root.querySelector('#cf'); if (cf) cf.onsubmit = async e => {
    e.preventDefault(); const o = {}; new FormData(e.target).forEach((v, k) => { o[k] = String(v).trim(); });
    toast(t('syncing'));
    try { await cloud.login(o.url, o.key, o.email, o.password); toast(t('synced')); render({ root }); } catch (err) { toast(t('syncError') + ' ' + (err.message || ''), 5000); }
  };
  const lo = root.querySelector('#logout'); if (lo) lo.onclick = () => { cloud.logout(); render({ root }); };
  const cs = root.querySelector('#cs'); if (cs) { const draw = st => { cs.textContent = st.state === 'error' ? t('syncError') : st.state === 'syncing' ? t('syncing') : t('synced'); }; draw(cloud.status); cloud.onStatus(draw); }
  root.querySelector('#copyBiz').onclick = () => copyText([s.bizLegal || DEFAULTS.bizLegal, 'ח.פ. ' + (s.bizId || DEFAULTS.bizId), s.bizAddress || DEFAULTS.bizAddress, s.bizPhone || DEFAULTS.bizPhone, s.bizEmail || DEFAULTS.bizEmail].join('\n'));
  root.querySelector('#exp').onclick = () => {
    const blob = new Blob([db.exportJson()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bakasun-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  };
  root.querySelector('#imp').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { db.importJson(txt); toast(t('saved')); location.hash = '#/today'; }).catch(() => toast('?'));
  };
  root.querySelector('#demo').onclick = () => { loadDemo(); toast(t('saved')); location.hash = '#/today'; };
  root.querySelector('#seed').onclick = () => {
    const haveS = new Set(db.list('suppliers').map(x => x.name)), haveC = new Set(db.list('clients').map(x => x.name)), haveT = new Set(db.list('team').map(x => x.name));
    let ns = 0, nc = 0, np = 0;
    SEED_SUPPLIERS.forEach(x => { if (haveS.has(x.name)) return; db.put('suppliers', { name: x.name, type: x.type, contact: x.contact, phone: x.phone, email: x.email, lang: x.lang, notes: [x.role, x.notes].filter(Boolean).join(' · '), rating: 3, active: 'כן', area: '' }); ns++; });
    SEED_CLIENTS.forEach(x => { if (haveC.has(x.name)) return; db.put('clients', { name: x.name, contact: x.contact, phone: x.phone, email: x.email, lang: x.lang, notes: [x.kind, x.role, x.notes].filter(Boolean).join(' · ') }); nc++; });
    SEED_TEAM.forEach(x => { if (haveT.has(x.name)) return; db.put('team', { name: x.name, role: x.role, phone: x.phone, email: x.email }); np++; });
    toast(ns + nc + np ? t('seedLoaded', { s: ns, c: nc, p: np }) : t('seedDone'), 4000); render({ root });
  };
  const editTeam = async p => {
    const r = await dialog(p ? p.name : t('addPerson'), `${field('name', t('fName'), p ? p.name : '')}<div class="grid2">${field('role', t('role'), p ? p.role : '')}${field('phone', t('fPhone'), p ? p.phone : '', { ltr: true, inputmode: 'tel' })}</div>${field('email', t('fEmail'), p ? p.email : '', { ltr: true, inputmode: 'email' })}`, { ok: t('save') });
    if (!r || !r.name) return;
    db.put('team', Object.assign({}, p ? { id: p.id } : {}, { name: r.name.trim(), role: r.role, phone: r.phone, email: r.email }));
    if (!db.setting('invoiceTo') && /רועי|roy/i.test(r.name) && r.phone) db.setting('invoiceTo', r.phone);
    render({ root });
  };
  root.querySelector('#addTeam').onclick = () => editTeam(null);
  const addContacts = list => { let n = 0; const have = new Set(db.list('contacts').map(c => phoneDigits(c.phone || ''))); list.forEach(c => { const d = phoneDigits(c.phone || ''); if (!c.name && !c.phone) return; if (d && have.has(d)) return; have.add(d); db.put('contacts', { name: c.name, phone: c.phone, email: c.email }); n++; }); toast(t('imported', { n })); render({ root }); };
  root.querySelector('#pickMany').onclick = async () => { if (!contactsSupported()) { toast(t('noPicker'), 4000); return; } const list = await pickContacts(true); if (list && list.length) addContacts(list); };
  root.querySelector('#contactsFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; addContacts(parseContactsFile(f.name, await f.text())); };
  const clr = root.querySelector('#clearContacts'); if (clr) clr.onclick = async () => { if (await confirmDialog(t('clearContacts') + '?')) { db.list('contacts').forEach(c => db.remove('contacts', c.id)); render({ root }); } };
  root.querySelectorAll('[data-team]').forEach(el => {
    el.querySelector('[data-edit]').onclick = () => editTeam(db.get('team', el.dataset.team));
    el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog(t('delete') + '?')) { db.remove('team', el.dataset.team); render({ root }); } };
  });
  root.querySelector('#clear').onclick = async () => { if (await confirmDialog(t('confirmClear'))) { db.clear(); location.hash = '#/today'; } };
}

/* Message templates: a library of ready messages (he / fr / en) filled from the app's data.
   Routes: '#/templates' = the list by audience with search. '#/templates/<key>' = one template, '#/templates/<key>/<caseId>' = with the event preselected.
   <key> is a built-in key (js/data/messageTemplates.js) or 'custom:<name>' for one of her own (js/logic/templates.js).
   Nothing is sent by the app: copy, WhatsApp or mail open with the text and she presses send. Deleting her own template asks first. */
import { t, lang, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, dialog, confirmDialog, toast, empty, section, openWhatsApp, openWhatsAppPick, openMail, copyOf, copyBtn } from '../ui.js';
import Office from '../logic/office.js';
import { DEFAULTS } from '../data/defaults.js';
import { INSURANCE, PLACEHOLDERS } from '../data/messageTemplates.js';
import { TEMPLATES as TX } from '../i18n/templates.js';
import { templates, saveTemplate, removeTemplate } from '../logic/templates.js';
import { byAudience, searchTemplates, templateByKey, fillFrom, fillSubject, missingIn, pickLang, kindIn, msgLangOf } from '../logic/msgTemplates.js';

const BACK = (href) => `<a class="icon" href="${esc(href)}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;
const LANG_OPTS = () => [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]];
const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
/** The settings with the fixed company texts behind them (bank details, signer, terms), like the quotes screen. */
const settingsAll = () => Object.assign({}, DEFAULTS, db.settings());
const activeCases = () => db.list('cases', c => !c.status || Office.ACTIVE.includes(c.status)).sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')));
const caseLabel = (c, L) => [c.client, kindIn(c.kind, L), c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ');
const tx = (L, k) => (TX[L] && TX[L][k]) || TX.he[k] || k;

/* What the screen remembers while she moves between the list and a template (not persisted). */
const st = { key: '', caseId: '', rid: '', lang: '', langPicked: false, extra: {}, edited: false };

/* ================= routes ================= */
export function render(ctx) {
  if (ctx.id) return renderOne(ctx.root, dec(ctx.id), ctx.query && ctx.query[0] ? dec(ctx.query[0]) : '');
  renderList(ctx.root);
}

/* ================= the list ================= */
function renderList(root) {
  const L = st.lang || msgLangOf(db.setting('msgLang') || lang());
  root.innerHTML = `<header class="top">${BACK('#/more')}<h1>${esc(t('mtTitle'))}</h1></header>
    <div class="stack mt-body">
      <div class="row mt-tools"><input id="q" type="search" class="grow" placeholder="${esc(t('mtSearch'))}" aria-label="${esc(t('mtSearch'))}">
        <label class="mt-lang"><span class="sr">${esc(t('mtLang'))}</span><select id="lang" aria-label="${esc(t('mtLang'))}">${LANG_OPTS().map(o => `<option value="${o[0]}"${o[0] === L ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label></div>
      <p class="hint">${esc(t('mtSentHint'))}</p>
      <div id="groups"></div>
    </div>`;
  const draw = () => {
    const Lx = root.querySelector('#lang').value, q = root.querySelector('#q').value;
    const groups = byAudience(Lx, templates(db)).map(g => ({ audience: g.audience, items: searchTemplates(g.items, q) })).filter(g => g.items.length);
    root.querySelector('#groups').innerHTML = groups.length
      ? groups.map(g => section(t('mtAud_' + g.audience), `<div class="list">${g.items.map(tp => card(tp, Lx)).join('')}</div>`)).join('') + (groups.some(g => g.audience === 'custom') ? '' : `<p class="hint">${esc(t('mtMineHint'))}</p>`)
      : empty(t('mtNone'));
  };
  root.querySelector('#q').oninput = draw;
  root.querySelector('#lang').onchange = e => { st.lang = e.target.value; st.langPicked = true; draw(); };
  draw();
}

function card(tp, L) {
  const prev = String(tp.body || '').replace(/\s+/g, ' ').slice(0, 110);
  return `<a class="card tap mt-card" href="#/templates/${encodeURIComponent(tp.key)}" lang="${L}"><div class="row between"><span class="title">${esc(tp.title)}</span><span class="badge muted">${esc(t('mtAud_' + tp.to))}</span></div><div class="sub mt-prev">${esc(prev)}</div></a>`;
}

/* ================= one template ================= */
function renderOne(root, key, caseId) {
  const mine = templates(db);
  const tp = templateByKey(key, mine);
  if (!tp) { root.innerHTML = `<header class="top">${BACK('#/templates')}<h1>${esc(t('mtTitle'))}</h1></header>` + empty(t('mtNoTemplate')); return; }
  if (st.key !== tp.key) { st.key = tp.key; st.rid = ''; st.extra = {}; st.edited = false; }
  if (caseId) st.caseId = caseId;
  const s = settingsAll();
  const cases = activeCases();
  if (st.caseId && !cases.some(c => c.id === st.caseId)) { const c = db.get('cases', st.caseId); if (c) cases.unshift(c); else st.caseId = ''; }
  const cs = db.get('cases', st.caseId) || null;
  const rec = recipients(tp, cs);
  if (!st.rid || !rec.options.some(o => o[0] === st.rid)) st.rid = rec.def || '';
  const who = recipientOf(tp, st.rid, cs);
  const uiL = lang();
  const L = st.langPicked && st.lang ? st.lang : pickLang(who.card, s, uiL);
  st.lang = L;
  const title = tp.custom ? tp.name : (tp.title[uiL] || tp.title.he);

  root.innerHTML = `<header class="top">${BACK('#/templates')}<h1>${esc(title)}</h1></header>
    <div class="stack mt-body">
      <div class="grid2">
        ${field('caseId', t('mtEvent'), st.caseId, { type: 'select', options: [['', t('mtNoEvent')]].concat(cases.map(c => [c.id, caseLabel(c, uiL)])) })}
        ${field('lang', t('mtLang'), L, { type: 'select', options: LANG_OPTS() })}
      </div>
      ${recipientBlock(tp, rec, who)}
      ${tp.fields.length ? `<div class="card"><h3>${esc(t('mtDetails'))}</h3><div class="grid2 mt-fields">${tp.fields.map(extraField).join('')}</div></div>` : ''}
      <label class="f"><span>${esc(t('mtText'))}</span><textarea id="mtText" class="mt-text" rows="14" lang="${L}" dir="${L === 'he' ? 'rtl' : 'ltr'}"></textarea></label>
      <div class="row between mt-missing-row"><div id="missing" class="chips"></div><button type="button" class="btn sm ghost" id="rebuild">${esc(t('mtRebuild'))}</button></div>
      <div class="mt-actions">${copyOf('#mtText', { sm: false })}<button type="button" class="btn wa" id="wa">${esc(t('whatsapp'))}</button><button type="button" class="btn" id="mail">${esc(t('mtMail'))}</button><button type="button" class="btn" id="saveMine">${esc(t('mtSaveMine'))}</button></div>
      <p class="hint">${esc(t('mtSentHint'))}</p>
      ${tp.custom ? `<div class="row end"><button type="button" class="btn danger sm" id="delMine">${esc(t('mtDeleteMine'))}</button></div>` : ''}
    </div>`;

  const ta = root.querySelector('#mtText');
  const data = () => {
    const w = recipientOf(tp, st.rid, cs);
    const link = cs && w.supplier ? db.list('links', l => l.caseId === cs.id && (l.supplierId === w.supplier.id || l.supplier === w.supplier.name))[0] : null;
    const payment = cs ? db.list('payments', p => p.caseId === cs.id && p.status !== Office.PAY.paid).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0] || null : null;
    return { case: cs, client: w.client, supplier: w.supplier, link, payment, settings: s, extra: extrasOf(root, tp, st.lang) };
  };
  const build = () => {
    ta.value = fillFrom(tp, data(), st.lang); st.edited = false;
    ta.setAttribute('lang', st.lang); ta.dir = st.lang === 'he' ? 'rtl' : 'ltr';
    const miss = missingIn(ta.value);
    root.querySelector('#missing').innerHTML = miss.length ? `<span class="hint">${esc(t('mtMissing'))}:</span>` + miss.map(m => `<span class="chip mt-miss">${esc(m)}</span>`).join('') : `<span class="hint ok">${esc(t('mtAllFilled'))}</span>`;
  };
  build();

  ta.oninput = () => { st.edited = true; };
  root.querySelector('[name=caseId]').onchange = e => { st.caseId = e.target.value; st.rid = ''; renderOne(root, key, ''); };
  root.querySelector('[name=lang]').onchange = e => { st.lang = e.target.value; st.langPicked = true; renderOne(root, key, ''); };
  const rsel = root.querySelector('[name=rid]');
  if (rsel) rsel.onchange = e => { st.rid = e.target.value; renderOne(root, key, ''); };
  root.querySelectorAll('.mt-fields [name]').forEach(el => { el.onchange = build; el.oninput = () => { if (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'number') build(); }; });
  root.querySelector('#rebuild').onclick = () => { build(); toast(t('mtRebuilt')); };
  root.querySelector('#wa').onclick = () => { const text = ta.value; if (who.phone) openWhatsApp(who.phone, text); else openWhatsAppPick(text); };
  root.querySelector('#mail').onclick = () => openMail(who.email, fillSubject(tp, data(), st.lang) || title, ta.value);
  root.querySelector('#saveMine').onclick = () => saveMine(tp, ta.value, st.lang, title);
  const del = root.querySelector('#delMine');
  if (del) del.onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { removeTemplate(db, tp.name); toast(t('saved')); location.hash = '#/templates'; } };
}

/** The recipient choices for the audience: {options:[[value,label]], def, groups}. Values: client id, supplier id, or 'c:<id>' / 's:<id>' for her own templates. */
function recipients(tp, cs) {
  const clients = db.list('clients').sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const sups = db.list('suppliers').filter(x => !/^(לא|no)$/i.test(String(x.active || ''))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const linked = cs ? db.list('links', l => l.caseId === cs.id) : [];
  const linkedIds = linked.map(l => l.supplierId).filter(Boolean);
  const supLabel = x => x.name + (x.contact ? ' · ' + x.contact : '');
  const clLabel = x => x.name + (x.contact ? ' · ' + x.contact : '');
  const caseClient = cs ? (clients.find(c => c.id === cs.clientId) || clients.find(c => c.name && c.name === cs.client)) : null;
  if (tp.to === 'client') return { options: [['', t('mtNoRecipient')]].concat(clients.map(c => [c.id, clLabel(c)])), def: caseClient ? caseClient.id : '' };
  if (tp.to === 'supplier') {
    const first = sups.filter(x => linkedIds.includes(x.id)), rest = sups.filter(x => !linkedIds.includes(x.id));
    return { options: [['', t('mtNoRecipient')]].concat(first.map(x => [x.id, '★ ' + supLabel(x)]), rest.map(x => [x.id, supLabel(x)])), def: first.length === 1 ? first[0].id : '' };
  }
  if (tp.to === 'custom') return { options: [['', t('mtNoRecipient')]].concat(clients.map(c => ['c:' + c.id, t('mtClients') + ': ' + clLabel(c)]), sups.map(x => ['s:' + x.id, t('mtSuppliers') + ': ' + supLabel(x)])), def: caseClient ? 'c:' + caseClient.id : '' };
  return { options: [], def: '' };
}
/** The chosen recipient as {card, client, supplier, phone, email}. */
function recipientOf(tp, rid, cs) {
  let client = null, supplier = null;
  if (tp.to === 'client' && rid) client = db.get('clients', rid);
  if (tp.to === 'supplier' && rid) supplier = db.get('suppliers', rid);
  if (tp.to === 'custom' && rid) { if (rid.startsWith('c:')) client = db.get('clients', rid.slice(2)); else if (rid.startsWith('s:')) supplier = db.get('suppliers', rid.slice(2)); }
  if ((tp.to === 'client' || tp.to === 'custom' || tp.to === 'participants' || tp.to === 'agency') && !client && cs) client = db.get('clients', cs.clientId) || db.list('clients', c => c.name && c.name === cs.client)[0] || null;
  const card = supplier || client || null;
  const phone = supplier ? supplier.phone : tp.to === 'participants' || tp.to === 'agency' ? '' : (client && client.phone) || (cs && cs.phone) || '';
  const email = tp.to === 'agency' ? INSURANCE.email : supplier ? supplier.email : tp.to === 'participants' ? '' : (client && client.email) || (cs && cs.email) || '';
  return { card: tp.to === 'agency' ? { lang: '' } : card, client, supplier, phone: String(phone || '').trim(), email: String(email || '').trim() };
}
function recipientBlock(tp, rec, who) {
  const uiL = lang();
  if (tp.to === 'agency') return `<div class="card mt-fixed"><div class="row between"><span class="title">${esc(INSURANCE.agency[uiL])}</span>${copyBtn(INSURANCE.email, { icon: true })}</div><div class="sub ltr">${esc(INSURANCE.email)}</div><div class="sub">${esc(t('mtAgencyCard'))} · ${esc(t('mtPolicy'))} <span class="ltr">${esc(INSURANCE.of(db.settings()).policyNo || '…')}</span> · ${esc(INSURANCE.of(db.settings()).period || '')}</div></div>`;
  if (tp.to === 'participants') return `<p class="hint">${esc(t('mtPickInWa'))}</p>`;
  const line = who.phone || who.email ? `<div class="sub ltr mt-who">${esc(who.phone)}${who.phone ? copyBtn(who.phone, { icon: true }) : ''}${who.phone && who.email ? ' · ' : ''}${esc(who.email)}${who.email ? copyBtn(who.email, { icon: true }) : ''}</div>` : '';
  return field('rid', t('mtRecipient'), who.supplier ? who.supplier.id : who.client && tp.to !== 'custom' ? who.client.id : (tp.to === 'custom' && who.client ? 'c:' + who.client.id : ''), { type: 'select', options: rec.options }) + line;
}

/* ---- the extra details a template asks for, beyond the case ---- */
const YESNO = ['meetingRoom', 'kosher'];
function extraField(f) {
  const label = t('mtF_' + f);
  if (YESNO.includes(f)) return field(f, label, '', { type: 'select', options: [['', t('mtBoardChoose')], ['yes', t('mtYes')], ['no', t('mtNo')]] });
  if (f === 'board') return field(f, label, '', { type: 'select', options: [['', t('mtBoardChoose')], ['half', t('mtHalfBoard')], ['bb', t('mtBB')], ['full', t('mtFullBoard')]] });
  if (f === 'dueDate' || f === 'rsvpBy') return field(f, label, '', { type: 'date' });
  if (f === 'terms' || f === 'requirements' || f === 'what') return field(f, label, '', { type: 'textarea', rows: 2 });
  if (f === 'amount' || f === 'price' || f === 'nights' || f === 'rooms') return field(f, label, '', { inputmode: 'decimal', ltr: true });
  if (f === 'arrival') return field(f, label, '', { type: 'time' });
  return field(f, label, '');
}
/** The values typed in the details card, with yes/no and board choices in the language of the message. */
function extrasOf(root, tp, L) {
  const x = {};
  root.querySelectorAll('.mt-fields [name]').forEach(el => {
    const k = el.name, v = String(el.value || '').trim(); if (!v) return;
    if (YESNO.includes(k)) x[k] = v === 'yes' ? tx(L, 'mtYes') : tx(L, 'mtNo');
    else if (k === 'board') x[k] = v === 'half' ? tx(L, 'mtHalfBoard') : v === 'bb' ? tx(L, 'mtBB') : tx(L, 'mtFullBoard');
    else x[k] = v;
  });
  return x;
}

/* ---- "save as my template": the current text, with 【labels】 turned back into {fields} so it fills again next time ---- */
function unfill(text, L) {
  const byLabel = {}; Object.keys(PLACEHOLDERS).forEach(k => { byLabel[PLACEHOLDERS[k][L]] = k; });
  return String(text || '').replace(/【([^】]+)】/g, (m, l) => '{' + (byLabel[l] || l) + '}');
}
async function saveMine(tp, text, L, title) {
  const blank = tp.custom ? tp.text : (tp.body[L] || tp.body.he);
  const r = await dialog(t('mtSaveMine'), field('name', t('templateName'), tp.custom ? tp.name : title) + field('mode', t('mtText'), 'filled', { type: 'select', options: [['filled', t('mtSaveFilled')], ['blank', t('mtSaveBlank')]] }) + `<p class="hint">${esc(t('mtSaveMineHint'))}</p>`, { ok: t('save') });
  if (!r || !String(r.name || '').trim()) return;
  saveTemplate(db, r.name, r.mode === 'blank' ? blank : unfill(text, L));
  toast(t('templateSaved', { name: String(r.name).trim() }));
  if (tp.custom && Office.normHe(r.name) !== Office.normHe(tp.name)) location.hash = '#/templates/' + encodeURIComponent('custom:' + String(r.name).trim());
}

/** For the voice flow (assist.js): the hash that opens a template for a case. */
export function templateHash(key, caseId) { return '#/templates/' + encodeURIComponent(key) + (caseId ? '/' + encodeURIComponent(caseId) : ''); }

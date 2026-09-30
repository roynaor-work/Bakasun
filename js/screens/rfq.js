/* Need number one on screen: ask several suppliers from a template (mail or WhatsApp, one tap each), record the offers,
   compare them, pick one and tell the others. Used by the case's suppliers tab and by Today. */
import { t, lang as uiLang } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, toast, openWhatsApp, openMail, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { supplierTypeLabel, stars } from '../labels.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';
import { DEFAULTS } from '../data/defaults.js';
import { templateFor, TEMPLATES, rfqText, rfqSubject, rfqReminder, rfqDecline, parseOffer, compareRows, compareHtml, LABELS, offerSummary } from '../logic/rfq.js';
import { translateText, hasHebrew, translatorAvailable, prepareTranslator } from '../logic/translate.js';
import { langName } from '../i18n.js';
import { shareFile, downloadFile } from '../files.js';
import { typesIn } from '../logic/brief.js';

const L = () => uiLang();
const herName = s => ((s.signer || DEFAULTS.signer || 'וירג׳יני').split('\n')[0].trim().split(' ')[0]) || 'וירג׳יני';
const herPhone = s => s.bizPhone || DEFAULTS.bizPhone;

/** One message after another. Each supplier gets the channel they have: mail (opens the mail app, she presses send) or WhatsApp. */
export function sendEach(targets, textOf, subjectOf, after) {
  let i = 0;
  const step = () => {
    if (i >= targets.length) { toast(t('saved')); return; }
    const sp = targets[i]; const text = textOf(sp);
    const wrap = document.createElement('div'); wrap.className = 'modal';
    wrap.innerHTML = `<form class="modal-card"><h2>${esc(sp.name)} (<span class="count">${i + 1}/${targets.length}</span>)</h2><div class="modal-body">${sp.email ? `<div class="sub ltr">${esc(sp.email)}${copyBtn(sp.email, { icon: true })}</div>` : ''}<textarea name="text" rows="10">${esc(text)}</textarea></div>
      <div class="row end"><button type="button" class="btn ghost" data-x="skip">${esc(t('skip'))}</button>${copyOf('[name=text]', { sm: false })}${sp.phone ? `<button type="button" class="btn wa" data-x="wa">${esc(t('whatsapp'))}</button>` : ''}${sp.email ? `<button type="button" class="btn primary" data-x="mail">${esc(t('email'))}</button>` : ''}${!sp.phone && !sp.email ? `<span class="badge warn">${esc(t('noContact'))}</span>` : ''}</div></form>`;
    document.body.appendChild(wrap);
    const next = () => { wrap.remove(); i++; setTimeout(step, 300); };
    wrap.querySelector('[data-x=skip]').onclick = next;
    const wa = wrap.querySelector('[data-x=wa]'); if (wa) wa.onclick = () => { if (openWhatsApp(sp.phone, wrap.querySelector('textarea').value)) { if (after) after(sp, 'whatsapp'); next(); } };
    const ml = wrap.querySelector('[data-x=mail]'); if (ml) ml.onclick = () => { if (openMail(sp.email, subjectOf ? subjectOf(sp) : '', wrap.querySelector('textarea').value)) { if (after) after(sp, 'email'); next(); } };
    wrap.querySelector('form').onsubmit = e => e.preventDefault();
  };
  step();
}

/** The spec form of one template, pre-filled from the case. */
function specForm(kind, c, prev) {
  const p = prev || {}; const lang = L();
  const guess = { checkIn: c.date, checkOut: c.date && c.days ? Office.iso(Office.addDays(c.date, Office.num(c.days) - 1)) : '', date: c.date, hours: c.hours, participants: c.participants, passengers: c.participants, to: c.place, hall: c.place };
  return (TEMPLATES[kind] || TEMPLATES.other).map(([name, label, type, options]) => {
    const v = p[name] != null ? p[name] : (guess[name] || '');
    if (type === 'select') return field(name, label[lang], v || options[0][0], { type: 'select', options: options.map(o => [o[0], lang === 'en' ? o[1] : lang === 'fr' ? o[2] : o[0]]) });
    if (type === 'yesno') return `<label class="chk"><input type="checkbox" name="${name}"${/^(כן|on|yes|true)$/.test(String(v)) ? ' checked' : ''}> ${esc(label[lang])}</label>`;
    if (type === 'textarea') return field(name, label[lang], v, { type: 'textarea', rows: 3 });
    return field(name, label[lang], v, { type: type === 'number' ? 'number' : type === 'date' ? 'date' : 'text', inputmode: type === 'number' ? 'numeric' : undefined });
  }).join('');
}

/** Step 1: which suppliers. Step 2: one form per template. Step 3: one message per supplier. */
export async function askFlow(c, s, links, sups, recTypes, refresh, wantText) {
  // said "ask hotels": those types come first and their best three are already ticked
  const want = wantText && wantText !== '1' ? typesIn(wantText) : [];
  const all = Object.values(sups).filter(x => !/^(לא|no)$/i.test(String(x.active || '')));
  const linked = {}; links.forEach(l => { linked[l.supplierId] = 1; });
  const byType = {}; all.forEach(x => { (byType[x.type] = byType[x.type] || []).push(x); });
  const types = want.concat(recTypes.filter(x => !want.includes(x))).concat(SUPPLIER_TYPES.filter(x => recTypes.indexOf(x) < 0 && !want.includes(x))).filter(ty => (byType[ty] || []).length || recTypes.includes(ty) || want.includes(ty));
  const pre = {}; want.forEach(ty => Office.rankSuppliers(byType[ty] || [], ty, db.list('links')).filter(x => !linked[x.id]).slice(0, 3).forEach(x => { pre[x.id] = 1; }));
  const listHtml = types.map(ty => `<div class="f"><span>${esc(supplierTypeLabel(ty))}${recTypes.includes(ty) ? ' ★' : ''}</span>${(byType[ty] || []).length ? Office.rankSuppliers(byType[ty], ty, db.list('links')).map(x => `<label class="chk"><input type="checkbox" name="sup" value="${esc(x.id)}"${linked[x.id] ? ' disabled' : ''}${pre[x.id] ? ' checked' : ''}> ${esc(x.name)} <span class="sub">${esc(stars(x.rating))}${x.events ? ' · ' + x.events : ''}${x.email ? ' · ✉' : ''}${x.phone ? ' · ☏' : ''}</span></label>`).join('') : `<span class="sub">${esc(t('noneOfType'))}</span>`}</div>`).join('');
  const r1 = await dialog(t('askSuppliers'), `<div class="grid2">${field('replyBy', t('replyBy'), Office.iso(Office.addDays(new Date(), 2)), { type: 'date' })}<label class="chk"><input type="checkbox" name="asClient"${c.asClient === 'לא' ? '' : ' checked'}> ${esc(t('asClient'))}</label></div><h3>${esc(t('pickSuppliers'))}</h3>${listHtml}`, { ok: t('next') });
  if (!r1) return;
  const ids = [].concat(r1.sup || []).filter(Boolean); if (!ids.length) { toast(t('pickSuppliers')); return; }
  const asClient = !!r1.asClient; db.put('cases', { id: c.id, asClient: asClient ? 'כן' : 'לא' });
  const chosen = ids.map(id => sups[id]).filter(Boolean);
  const kinds = [...new Set(chosen.map(sp => templateFor(sp.type)))];
  const specs = {};
  for (const kind of kinds) {
    const r = await dialog(t('specFor', { type: kinds.length > 1 ? kindTitle(kind) : '' }).trim(), specForm(kind, c, (c.specs || {})[kind]), { ok: kinds.indexOf(kind) < kinds.length - 1 ? t('next') : t('sendEach') });
    if (!r) return;
    specs[kind] = r;
  }
  db.put('cases', { id: c.id, specs: Object.assign({}, c.specs || {}, specs) });
  const everLinked = {}; db.list('links').forEach(l => { everLinked[l.supplierId] = 1; });
  const opts = sp => ({ asClient, firstContact: !everLinked[sp.id], replyBy: r1.replyBy, name: herName(s), phone: herPhone(s) });
  chosen.forEach(sp => { const kind = templateFor(sp.type); db.put('links', { caseId: c.id, supplierId: sp.id, supplier: sp.name, kind, spec: specs[kind], what: summary(kind, specs[kind]), status: 'ביקשנו הצעה', askedAt: '', replyBy: r1.replyBy }); });
  sendEach(chosen, sp => rfqText(c, sp, templateFor(sp.type), specs[templateFor(sp.type)], opts(sp)), sp => rfqSubject(c, templateFor(sp.type), sp.lang), (sp, channel) => {
    const l = db.list('links', x => x.caseId === c.id && x.supplierId === sp.id)[0]; if (l) db.put('links', { id: l.id, askedAt: todayIso(), channel });
  });
  if (refresh) setTimeout(refresh, 500);
}
function kindTitle(kind) { return { hotel: t('tplHotel'), venue: t('tplVenue'), food: t('tplFood'), transport: t('tplTransport'), print: t('tplPrint'), activity: t('tplActivity'), other: t('tplOther') }[kind] || ''; }
function summary(kind, spec) {
  const p = spec || {};
  return [p.checkIn ? Office.fmt(p.checkIn) + (p.checkOut ? '-' + Office.fmt(p.checkOut) : '') : p.date ? Office.fmt(p.date) : '', p.singles ? p.singles + ' סינגל' : '', p.doubles ? p.doubles + ' זוגי' : '', p.participants ? p.participants + ' משתתפים' : '', p.passengers ? p.passengers + ' נוסעים' : '', p.board, p.items ? String(p.items).split('\n')[0] : '', p.what].filter(Boolean).join(' · ');
}

/** Re-send the request of one link, or a reminder. */
export function resend(c, s, l, sp, reminder) {
  const kind = l.kind || templateFor(sp.type);
  const text = reminder ? rfqReminder(c, sp, Office.daysBetween(l.askedAt || todayIso(), new Date()), { name: herName(s) }) : rfqText(c, sp, kind, l.spec, { asClient: c.asClient !== 'לא', replyBy: l.replyBy, name: herName(s), phone: herPhone(s) });
  sendEach([sp], () => text, () => (reminder ? 'Re: ' : '') + rfqSubject(c, kind, sp.lang), (x, channel) => db.put('links', { id: l.id, askedAt: l.askedAt || todayIso(), channel, remindedAt: reminder ? todayIso() : l.remindedAt }));
}

/** One tap for every supplier who has not answered: the reminders go out one after the other (each still needs her tap on WhatsApp or mail). */
export function remindAll(pending, s) {
  const items = pending.map(l => ({ l, sp: db.get('suppliers', l.supplierId) || { name: l.supplier, id: l.supplierId }, c: db.get('cases', l.caseId) || {} })).filter(x => x.sp);
  const bySup = {}; items.forEach(x => { bySup[x.sp.id || x.sp.name] = x; });
  const targets = items.map(x => Object.assign({}, x.sp, { _l: x.l, _c: x.c }));
  sendEach(targets, sp => rfqReminder(sp._c, sp, Office.daysBetween(sp._l.askedAt || todayIso(), new Date()), { name: herName(s) }),
    sp => 'Re: ' + rfqSubject(sp._c, sp._l.kind || templateFor(sp.type), sp.lang),
    (sp, channel) => db.put('links', { id: sp._l.id, channel, remindedAt: todayIso() }));
}

/** The offer came back: paste it, the fields fill, she fixes and saves. */
export async function offerDialog(c, l, sp) {
  const o = l.offer || {}; const S = LABELS[L()] || LABELS.he;
  const body = `<label class="f"><span>${esc(t('pasteOffer'))}</span><textarea name="text" rows="4">${esc(o.text || '')}</textarea></label><div class="row"><button type="button" class="btn sm" id="readOffer">${esc(t('readOffer'))}</button>${copyOf('[name=text]')}</div>
    <div class="grid2">${field('total', S.total, o.total || l.cost || '', { type: 'number', inputmode: 'decimal' })}${field('perPerson', S.per, o.perPerson || '', { type: 'number', inputmode: 'decimal' })}${field('venue', S.venue, o.venue || '', { type: 'number', inputmode: 'decimal' })}${field('food', S.food, o.food || '', { type: 'number', inputmode: 'decimal' })}${field('av', S.av, o.av || '', { type: 'number', inputmode: 'decimal' })}${field('deposit', S.deposit, o.deposit || '')}</div>
    ${field('included', S.included, o.included || '')}${field('cancellation', S.cancellation, o.cancellation || '')}${field('terms', S.terms, o.terms || '')}
    <div class="grid2">${field('verdict', t('verdict'), o.verdict || '', { type: 'select', options: [['', ''], ['שווה', t('vWorth')], ['סביר', t('vOk')], ['יקר', t('vPricey')]] })}${field('note', t('note'), o.note || '')}</div>`;
  const p = dialog(t('offerReceived') + ' · ' + (sp.name || ''), body, { ok: t('save') });
  const form = document.querySelector('.modal form');
  form.querySelector('#readOffer').onclick = () => {
    const parsed = parseOffer(form.text.value);
    ['total', 'perPerson', 'venue', 'food', 'av', 'included', 'cancellation', 'deposit', 'terms'].forEach(k => { if (parsed[k] !== '' && parsed[k] != null) form[k].value = parsed[k]; });
  };
  const r = await p; if (!r) return false;
  db.put('links', { id: l.id, offer: r, cost: Office.num(r.total) || l.cost, status: /אושר/.test(l.status) ? l.status : 'הצעה התקבלה', answeredAt: l.answeredAt || todayIso() });
  return true;
}

/** The comparison block under the suppliers list. */
export function compareBlock(c, links, sups) {
  const rows = compareRows(links, Object.values(sups), c.participants);
  if (!rows.some(r => r.hasOffer)) return '';
  const S = LABELS[L()] || LABELS.he;
  return `<section class="sec"><div class="sec-h"><h2>${esc(t('compare'))}</h2></div>
    <div class="tablewrap"><table class="cmp"><thead><tr><th>${esc(S.supplier)}</th><th>${esc(S.total)}</th><th>${esc(S.per)}</th><th>${esc(S.cancellation)}</th><th>${esc(S.deposit)}</th><th>${esc(S.terms)}</th><th>${esc(S.note)}</th><th></th></tr></thead>
    <tbody>${rows.map(r => `<tr${r.chosen ? ' class="chosen"' : ''}><td>${esc(r.supplier)}${r.chosen ? ' ★' : ''}</td><td class="n">${r.hasOffer ? esc(Office.money(r.total)) : `<i>${esc(S.none)}</i>`}</td><td class="n">${r.perPerson ? esc(Office.money(r.perPerson)) : ''}</td><td>${esc(r.cancellation)}</td><td>${esc(r.deposit)}</td><td>${esc(r.terms)}</td><td>${esc([r.verdict, r.note].filter(Boolean).join(' · '))}</td><td>${r.hasOffer && !r.chosen ? `<button class="btn sm ok" data-choose="${esc(r.id)}">${esc(t('chooseSup'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn sm primary" data-summary>${esc(t('clientSummary'))}</button>${copyBtn([S.supplier + ' · ' + S.total + ' · ' + S.per + ' · ' + S.cancellation + ' · ' + S.deposit + ' · ' + S.terms].concat(rows.map(r => [r.supplier + (r.chosen ? ' ★' : ''), r.hasOffer ? Office.money(r.total) : S.none, r.perPerson ? Office.money(r.perPerson) : '', r.cancellation, r.deposit, r.terms, [r.verdict, r.note].filter(Boolean).join(' · ')].filter(Boolean).join(' · '))).join('\n'))}<button class="btn sm" data-share-cmp="he">${esc(t('shareCompare'))} · עברית</button><button class="btn sm" data-share-cmp="en">${esc(t('shareCompare'))} · English</button>${rows.some(r => r.chosen) && rows.some(r => !r.chosen && /ביקשנו|התקבלה/.test(r.status)) ? `<button class="btn sm ghost" data-decline>${esc(t('declineOthers'))}</button>` : ''}</div></section>`;
}
export function wireCompare(body, c, s, links, sups, refresh) {
  body.querySelectorAll('[data-share-cmp]').forEach(b => b.onclick = async () => {
    const rows = compareRows(links, Object.values(sups), c.participants);
    const html = compareHtml(c, rows, b.dataset.shareCmp, false);
    const rec = { blob: new Blob([html], { type: 'text/html' }), name: 'comparison-' + (c.client || 'event').replace(/[^\w֐-׿]+/g, '-') + '.html', type: 'text/html', title: t('compare') };
    if (!(await shareFile(rec, t('compare') + ' · ' + (c.client || '')))) { downloadFile(rec); toast(t('shareFallback'), 4000); }
  });
  const sm = body.querySelector('[data-summary]'); if (sm) sm.onclick = () => clientSummary(c, s, links, sups);
  body.querySelectorAll('[data-choose]').forEach(b => b.onclick = () => { db.put('links', { id: b.dataset.choose, chosen: 'כן', status: 'אושר' }); refresh(); });
  const d = body.querySelector('[data-decline]'); if (d) d.onclick = () => {
    const others = links.filter(l => !Office.yes(l.chosen) && /ביקשנו|התקבלה/.test(String(l.status))).map(l => sups[l.supplierId]).filter(Boolean);
    sendEach(others, sp => rfqDecline(c, sp, { name: herName(s) }), sp => 'Re: ' + rfqSubject(c, templateFor(sp.type), sp.lang), sp => { const l = links.find(x => x.supplierId === sp.id); if (l) db.put('links', { id: l.id, status: 'בוטל' }); });
    setTimeout(refresh, 500);
  };
}

/** Need number two: the offers, translated and summed up for the client, with her open points. Mail or WhatsApp. */
export async function clientSummary(c, s, links, sups) {
  const client = c.clientId ? db.get('clients', c.clientId) : null;
  const lang = (client && client.lang) || c.lang || 'he';
  const r1 = await dialog(t('clientSummary'), `<div class="grid2">${field('lang', t('msgLang'), lang, { type: 'select', options: [['he', langName('he')], ['en', langName('en')], ['fr', langName('fr')]] })}${field('which', t('whichOffers'), 'all', { type: 'select', options: [['all', t('allOffers')], ['chosen', t('chosenOnly')]] })}</div>
    ${field('names', t('greetNames'), (client && client.contact) || c.contact || '')}${field('open', t('openPoints'), '', { type: 'textarea', rows: 3, placeholder: t('openPointsPh') })}
    ${translatorAvailable() ? '' : `<p class="hint">${esc(t('glossaryOnly'))}</p>`}`, { ok: t('next') });
  if (!r1) return;
  if (r1.lang !== 'he') prepareTranslator('he', r1.lang);
  let rows = compareRows(links, Object.values(sups), c.participants).filter(r => r.hasOffer);
  if (r1.which === 'chosen' && rows.some(r => r.chosen)) rows = rows.filter(r => r.chosen);
  toast(t('translating'), 2000);
  const to = r1.lang;
  rows = await Promise.all(rows.map(async r => { const o = Object.assign({}, r); for (const k of ['included', 'cancellation', 'deposit', 'terms']) o[k] = to === 'he' ? r[k] : await translateText(r[k], 'he', to); return o; }));
  const open = await Promise.all(String(r1.open || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => to === 'he' ? x : translateText(x, 'he', to)));
  const text = offerSummary(c, rows, to, { names: r1.names, openPoints: open, name: to === 'he' ? herName(s) : 'Virginie' });
  const leftover = to !== 'he' && hasHebrew(text.replace(/\* [^\n]+/g, m => (rows.some(r => m.includes(r.supplier)) ? '' : m)));
  const subject = (to === 'he' ? 'הצעות ל' : to === 'fr' ? 'Offres pour ' : 'Offers for ') + [c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ');
  const r2 = await dialog(t('clientSummary'), `${leftover ? `<p class="warnbox">${esc(t('checkHebrew'))}</p>` : ''}<textarea name="text" rows="14" ${to === 'he' ? '' : 'dir="ltr" style="direction:ltr;text-align:left"'}>${esc(text)}</textarea><div class="row">${c.email || (client && client.email) ? `<button type="button" class="btn primary" data-x="mail">${esc(t('email'))}</button>` : ''}${c.phone ? `<button type="button" class="btn wa" data-x="wa">${esc(t('whatsapp'))}</button>` : ''}${copyOf('[name=text]', { sm: false })}</div>`, { ok: t('close') });
  // the buttons live inside the dialog body: wire them while it is open
  const form = document.querySelector('.modal form'); if (!form) return;
  const ta = form.querySelector('textarea[name=text]');
  const mailBtn = form.querySelector('[data-x=mail]'); if (mailBtn) mailBtn.onclick = () => openMail(c.email || (client && client.email), subject, ta.value);
  const waBtn = form.querySelector('[data-x=wa]'); if (waBtn) waBtn.onclick = () => openWhatsApp(c.phone, ta.value);
  await r2;
}

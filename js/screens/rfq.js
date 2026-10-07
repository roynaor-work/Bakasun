/* Need number one on screen: ask several suppliers from a template (mail or WhatsApp, one tap each), record the offers,
   compare them, pick one and tell the others. Used by the case's suppliers tab and by Today. */
import { t, lang as uiLang } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, toast, openWhatsApp, openMail, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { supplierTypeLabel, stars } from '../labels.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';
import { hasArabic, phoneDigits } from '../logic/core.js';
import { draftRequest, sentRequest, chooseOffer, declineCandidates, validSpec, validOffer } from '../logic/rfqFlow.js';
import { templateFor, TEMPLATES, rfqText, rfqSubject, rfqReminder, rfqDecline, parseOffer, compareRows, compareHtml, LABELS, offerSummary, offerMoney, netOf } from '../logic/rfq.js';
import { translateText, hasHebrew, translatorAvailable, prepareTranslator } from '../logic/translate.js';
import { langName } from '../i18n.js';
import { shareFile, downloadFile } from '../files.js';
import { typesIn } from '../logic/brief.js';

const L = () => uiLang();
const herName = () => "וירג'יני";
const herPhone = s => db.setting('bizPhone') || s.bizPhone || '';

async function ensurePhone(s) {
  if (phoneDigits(herPhone(s)).length >= 10) return true;
  const pending = dialog(t('rfqPhoneMissing'), field('bizPhone', t('rfqPhoneLabel'), '', { ltr: true, inputmode: 'tel' }));
  const form = document.querySelector('.modal:last-child form');
  form.addEventListener('submit', e => {
    if (phoneDigits(form.elements.bizPhone.value).length < 10 || hasArabic(form.elements.bizPhone.value)) {
      e.preventDefault(); e.stopImmediatePropagation(); toast(t('rfqInvalidPhone'));
    }
  }, true);
  const r = await pending; if (!r) return false;
  db.setting('bizPhone', r.bizPhone.trim());
  return true;
}

/** One editable draft at a time. Only explicit confirmation calls `after`; stopping/skipping retains drafts. */
export async function sendEach(targets, textOf, subjectOf, after, saveDraft) {
  for (let i = 0; i < targets.length; i++) {
    const sp = targets[i];
    const outcome = await new Promise(resolve => {
      const wrap = document.createElement('div'); wrap.className = 'modal';
      wrap.innerHTML = `<form class="modal-card"><h2>${esc(sp.name)} (<span class="count">${i + 1}/${targets.length}</span>)</h2><div class="modal-body"><p class="hint">${esc(t('rfqSendHint'))}</p>${sp.email ? `<div class="sub ltr">${esc(sp.email)}${copyBtn(sp.email, { icon: true })}</div>` : ''}<textarea name="text" rows="10">${esc(textOf(sp))}</textarea></div>
        <div class="row end"><button type="button" class="btn ghost" data-x="stop">${esc(t('rfqStop'))}</button><button type="button" class="btn ghost" data-x="skip">${esc(t('skip'))}</button>${copyOf('[name=text]', { sm: false })}${sp.phone ? `<button type="button" class="btn wa" data-x="wa">${esc(t('whatsapp'))}</button>` : ''}${sp.email ? `<button type="button" class="btn primary" data-x="mail">${esc(t('email'))}</button>` : ''}<button type="button" class="btn" data-x="manual">${esc(t('rfqMarkSent'))}</button>${!sp.phone && !sp.email ? `<span class="badge warn">${esc(t('noContact'))}</span>` : ''}</div></form>`;
      document.body.appendChild(wrap);
      const text = () => wrap.querySelector('textarea').value;
      const save = () => { if (saveDraft) saveDraft(sp, text()); };
      const done = result => { save(); wrap.remove(); resolve(result); };
      wrap.querySelector('textarea').oninput = save;
      wrap.querySelector('[data-x=stop]').onclick = () => done('stop');
      wrap.querySelector('[data-x=skip]').onclick = () => done('next');
      wrap.onclick = e => { if (e.target === wrap) done('stop'); };
      const send = async channel => {
        const currentText = text();
        if (hasArabic(currentText)) { toast(t('arabicBlocked'), 4000); return; }
        wrap.querySelectorAll('button').forEach(b => { b.disabled = true; });
        const opened = channel === 'whatsapp' ? openWhatsApp(sp.phone, currentText) : channel === 'email' ? openMail(sp.email, subjectOf ? subjectOf(sp) : '', currentText) : true;
        if (!opened) { wrap.querySelectorAll('button').forEach(b => { b.disabled = false; }); return; }
        save(); wrap.style.display = 'none';
        const confirmed = await dialog(t('rfqConfirmSent'), '', { ok: t('askSentYes'), cancel: t('askSentNo') });
        wrap.style.display = ''; wrap.querySelectorAll('button').forEach(b => { b.disabled = false; });
        if (!confirmed) return;
        if (after) await after(sp, channel, currentText);
        done('next');
      };
      const wa = wrap.querySelector('[data-x=wa]'); if (wa) wa.onclick = () => send('whatsapp');
      const ml = wrap.querySelector('[data-x=mail]'); if (ml) ml.onclick = () => send('email');
      wrap.querySelector('[data-x=manual]').onclick = () => send('manual');
      wrap.querySelector('form').onsubmit = e => e.preventDefault();
    });
    if (outcome === 'stop') break;
  }
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
  if (!(await ensurePhone(s))) return;
  // said "ask hotels": those types come first and their best three are already ticked
  const want = wantText && wantText !== '1' ? typesIn(wantText) : [];
  const all = Object.values(sups).filter(x => !/^(לא|no)$/i.test(String(x.active || '')));
  const linked = {}; links.forEach(l => { if (l.askedAt || l.offer || /התקבלה|אושר|בוטל/.test(l.status || '')) linked[l.supplierId] = 1; });
  const byType = {}; all.forEach(x => { (byType[x.type] = byType[x.type] || []).push(x); });
  const types = want.concat(recTypes.filter(x => !want.includes(x))).concat(SUPPLIER_TYPES.filter(x => recTypes.indexOf(x) < 0 && !want.includes(x))).filter(ty => (byType[ty] || []).length || recTypes.includes(ty) || want.includes(ty));
  const pre = {}; want.forEach(ty => Office.rankSuppliers(byType[ty] || [], ty, db.list('links')).filter(x => !linked[x.id]).slice(0, 3).forEach(x => { pre[x.id] = 1; }));
  const listHtml = types.map(ty => `<div class="f"><span>${esc(supplierTypeLabel(ty))}${recTypes.includes(ty) ? ' ★' : ''}</span>${(byType[ty] || []).length ? Office.rankSuppliers(byType[ty], ty, db.list('links')).map(x => `<label class="chk"><input type="checkbox" name="sup" value="${esc(x.id)}"${linked[x.id] ? ' disabled' : ''}${pre[x.id] ? ' checked' : ''}> ${esc(x.name)} <span class="sub">${esc(stars(x.rating))}${x.events ? ' · ' + x.events : ''}${x.email ? ' · ✉' : ''}${x.phone ? ' · ☏' : ''}</span></label>`).join('') : `<span class="sub">${esc(t('noneOfType'))}</span>`}</div>`).join('');
  const r1 = await dialog(t('askSuppliers'), `<div class="grid2">${field('replyBy', t('replyBy'), Office.iso(Office.addDays(new Date(), 2)), { type: 'date' })}<label class="chk"><input type="checkbox" name="asClient"${c.asClient === 'לא' ? '' : ' checked'}> ${esc(t('asClient'))}</label></div><h3>${esc(t('pickSuppliers'))}</h3>${listHtml}`, { ok: t('next') });
  if (!r1) return;
  const ids = [].concat(r1.sup || []).filter(Boolean); if (!ids.length) { toast(t('rfqNoneSelected')); return; }
  const asClient = !!r1.asClient;
  const chosen = ids.map(id => sups[id]).filter(Boolean);
  const kinds = [...new Set(chosen.map(sp => templateFor(sp.type)))];
  const specs = {};
  for (const kind of kinds) {
    const r = await dialog(t('specFor', { type: kinds.length > 1 ? kindTitle(kind) : '' }).trim(), specForm(kind, c, (c.specs || {})[kind]), { ok: kinds.indexOf(kind) < kinds.length - 1 ? t('next') : t('sendEach') });
    if (!r) return;
    if (!validSpec(kind, r)) { toast(t('rfqInvalidSpec'), 4000); return; }
    specs[kind] = r;
  }
  db.put('cases', { id: c.id, asClient: asClient ? 'כן' : 'לא', specs: Object.assign({}, c.specs || {}, specs) });
  const everLinked = {}; db.list('links').forEach(l => { if (l.askedAt) everLinked[l.supplierId] = 1; });
  const opts = sp => ({ asClient, firstContact: !everLinked[sp.id], replyBy: r1.replyBy, name: herName(s), phone: herPhone(s) });
  const requestIds = {};
  chosen.forEach(sp => {
    const kind = templateFor(sp.type);
    const existing = db.list('links', l => l.caseId === c.id && l.supplierId === sp.id && !l.askedAt && !l.offer && !/אושר|בוטל/.test(l.status || ''))[0];
    const draft = draftRequest(c, sp, kind, specs[kind], r1.replyBy, existing);
    draft.what = summary(kind, specs[kind]);
    const unchangedSpec = existing && JSON.stringify(existing.spec) === JSON.stringify(specs[kind]) && existing.replyBy === r1.replyBy;
    draft.requestText = unchangedSpec && existing.requestText || rfqText(c, sp, kind, specs[kind], opts(sp));
    requestIds[sp.id] = db.put('links', draft);
  });
  if (refresh) refresh();
  await sendEach(chosen, sp => db.get('links', requestIds[sp.id]).requestText, sp => rfqSubject(c, templateFor(sp.type), sp.lang), (sp, channel, text) => {
    const l = db.get('links', requestIds[sp.id]);
    if (l) db.put('links', sentRequest(l, channel, todayIso(), text));
    if (refresh) refresh();
  }, (sp, text) => db.put('links', { id: requestIds[sp.id], requestText: text }));
  if (refresh) refresh();

}
function kindTitle(kind) { return { hotel: t('tplHotel'), venue: t('tplVenue'), food: t('tplFood'), transport: t('tplTransport'), print: t('tplPrint'), activity: t('tplActivity'), other: t('tplOther') }[kind] || ''; }
function summary(kind, spec) {
  const p = spec || {};
  return [p.checkIn ? Office.fmt(p.checkIn) + (p.checkOut ? '-' + Office.fmt(p.checkOut) : '') : p.date ? Office.fmt(p.date) : '', p.singles ? p.singles + ' סינגל' : '', p.doubles ? p.doubles + ' זוגי' : '', p.participants ? p.participants + ' משתתפים' : '', p.passengers ? p.passengers + ' נוסעים' : '', p.board, p.items ? String(p.items).split('\n')[0] : '', p.what].filter(Boolean).join(' · ');
}

/** Re-send the request of one link, or a reminder. */
export async function resend(c, s, l, sp, reminder, refresh) {
  if (!(await ensurePhone(s))) return;
  const kind = l.kind || templateFor(sp.type);
  const opts = { asClient: c.asClient !== 'לא', replyBy: l.replyBy, name: herName(s), phone: herPhone(s) };
  const text = reminder ? rfqReminder(c, sp, Office.daysBetween(l.askedAt || todayIso(), new Date()), opts) : l.requestText || rfqText(c, sp, kind, l.spec, opts);
  await sendEach([sp], () => text, () => (reminder ? 'Re: ' : '') + rfqSubject(c, kind, sp.lang), (x, channel, sentText) => {
    const current = db.get('links', l.id); if (current) db.put('links', sentRequest(current, channel, todayIso(), sentText, reminder));
    if (refresh) refresh();
  }, (x, draftText) => db.put('links', { id: l.id, [reminder ? 'reminderText' : 'requestText']: draftText }));
  if (refresh) refresh();
}

/** Reminders keep the original waiting date and only record the confirmed reminder date. */
export async function remindAll(pending, s, refresh) {
  if (!(await ensurePhone(s))) return;
  const targets = pending.map(l => ({ ...(db.get('suppliers', l.supplierId) || { name: l.supplier, id: l.supplierId }), _l: l, _c: db.get('cases', l.caseId) || {} }));
  await sendEach(targets, sp => rfqReminder(sp._c, sp, Office.daysBetween(sp._l.askedAt || todayIso(), new Date()), { phone: herPhone(s) }),
    sp => 'Re: ' + rfqSubject(sp._c, sp._l.kind || templateFor(sp.type), sp.lang),
    (sp, channel, text) => { const l = db.get('links', sp._l.id); if (l) db.put('links', sentRequest(l, channel, todayIso(), text, true)); if (refresh) refresh(); },
    (sp, text) => db.put('links', { id: sp._l.id, reminderText: text }));
  if (refresh) refresh();
}

/** The offer came back: paste it, the fields fill, she fixes and saves. */
export async function offerDialog(c, l, sp) {
  const o = l.offer || {}; const S = LABELS[L()] || LABELS.he;
  const body = `<p class="hint">${esc(t('rfqReadHint'))}</p><div class="grid2">${field('currency', t('rfqCurrency'), o.currency || 'ILS', { type: 'select', options: [['ILS', 'ILS · ₪'], ['EUR', 'EUR · €'], ['USD', 'USD · $']] })}${field('incl', t('rfqVatBasis'), o.incl === true || o.incl === 'true' ? 'true' : 'false', { type: 'select', options: [['false', t('rfqNet')], ['true', t('rfqGross')]] })}${field('vatPct', t('rfqVatRate'), o.vatPct ?? 18, { type: 'number', inputmode: 'decimal' })}</div><label class="f"><span>${esc(t('pasteOffer'))}</span><textarea name="text" rows="4">${esc(o.text || '')}</textarea></label><div class="row"><button type="button" class="btn sm" id="readOffer">${esc(t('readOffer'))}</button>${copyOf('[name=text]')}</div>
    <div class="grid2">${field('total', S.total, o.total || l.cost || '', { type: 'number', inputmode: 'decimal' })}${field('perPerson', S.per, o.perPerson || '', { type: 'number', inputmode: 'decimal' })}${field('venue', S.venue, o.venue || '', { type: 'number', inputmode: 'decimal' })}${field('food', S.food, o.food || '', { type: 'number', inputmode: 'decimal' })}${field('av', S.av, o.av || '', { type: 'number', inputmode: 'decimal' })}${field('deposit', S.deposit, o.deposit || '')}</div>
    ${field('included', S.included, o.included || '')}${field('cancellation', S.cancellation, o.cancellation || '')}${field('terms', S.terms, o.terms || '')}
    <div class="grid2">${field('verdict', t('verdict'), o.verdict || '', { type: 'select', options: [['', ''], ['שווה', t('vWorth')], ['סביר', t('vOk')], ['יקר', t('vPricey')]] })}${field('note', t('note'), o.note || '')}</div>`;
  const p = dialog(t('offerReceived') + ' · ' + (sp.name || ''), body, { ok: t('save') });
  const form = document.querySelector('.modal form');
  form.querySelector('#readOffer').onclick = () => {
    const parsed = parseOffer(form.elements.text.value);
    form.elements.currency.value = parsed.currency; form.elements.incl.value = String(parsed.incl); form.elements.vatPct.value = parsed.vatPct;
    ['total', 'perPerson', 'venue', 'food', 'av', 'included', 'cancellation', 'deposit', 'terms'].forEach(k => { if (parsed[k] !== '' && parsed[k] != null) form.elements[k].value = parsed[k]; });
  };
  form.addEventListener('submit', e => {
    if (!validOffer(Object.fromEntries(new FormData(form)))) { e.preventDefault(); e.stopImmediatePropagation(); toast(t('rfqInvalidOffer'), 4000); }
  }, true);
  const r = await p; if (!r) return false;
  r.incl = r.incl === 'true'; r.vatPct = Number(r.vatPct);
  db.put('links', { id: l.id, offer: { ...o, ...r }, cost: netOf(r.total, r.incl, r.vatPct) || '', status: /אושר/.test(l.status) ? l.status : 'הצעה התקבלה', answeredAt: l.answeredAt || todayIso() });
  return true;
}

/** The comparison block under the suppliers list. */
export function compareBlock(c, links, sups) {
  const rows = compareRows(links, Object.values(sups), c.participants);
  if (!rows.some(r => r.hasOffer)) return '';
  const S = LABELS[L()] || LABELS.he;
  const money = (r, value) => offerMoney(value, r.currency);
  const price = r => r.total ? money(r, r.total) : r.hasOffer ? t('rfqNoPrice') : S.none;
  const cols = ['supplier', 'total', 'per', 'venue', 'food', 'av', 'included', 'cancellation', 'deposit', 'terms', 'note'];
  const copied = [S.title, t('rfqGroupHint'), ...rows.map(r => [kindTitle(r.kind) + ' · ' + r.currency, r.supplier + (r.chosen ? ' ★' : ''), price(r), r.perPerson ? S.per + ': ' + money(r, r.perPerson) : '',
    ...['venue', 'food', 'av'].filter(k => r[k]).map(k => S[k] + ': ' + money(r, r[k])),
    ...['included', 'cancellation', 'deposit', 'terms'].filter(k => r[k]).map(k => S[k] + ': ' + r[k]),
    [r.verdict, r.note].filter(Boolean).join(' · ')].filter(Boolean).join(' · '))].join('\n');
  return `<section class="sec"><div class="sec-h"><h2>${esc(t('compare'))}</h2></div><p class="hint">${esc(t('rfqGroupHint'))}</p>
    <div class="tablewrap"><table class="cmp"><thead><tr><th>${esc(S.group)}</th>${cols.map(k => `<th>${esc(S[k])}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map(r => `<tr${r.chosen ? ' class="chosen"' : ''}><td>${esc(kindTitle(r.kind))} · <span class="ltr">${esc(r.currency)}</span></td><td>${esc(r.supplier)}${r.chosen ? ' ★' : ''}${r.incl ? `<div class="sub">${esc(S.fromGross)}</div>` : ''}${r.calculated ? `<div class="sub">${esc(t('rfqCalculated'))}</div>` : ''}</td><td class="n">${esc(price(r))}</td><td class="n">${esc(money(r, r.perPerson))}</td>${['venue', 'food', 'av'].map(k => `<td class="n">${esc(money(r, r[k]))}</td>`).join('')}${['included', 'cancellation', 'deposit', 'terms'].map(k => `<td>${esc(r[k])}</td>`).join('')}<td>${esc([r.verdict, r.note].filter(Boolean).join(' · '))}</td><td>${r.hasOffer && !r.chosen ? `<button class="btn sm ok" data-choose="${esc(r.id)}">${esc(t('chooseSup'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn sm primary" data-summary>${esc(t('clientSummary'))}</button>${copyBtn(copied)}${['he', 'fr', 'en'].map(lang => `<button class="btn sm" data-share-cmp="${lang}">${esc(t('shareCompare'))} · ${esc(langName(lang))}</button>`).join('')}${declineCandidates(links, Object.values(sups)).length ? `<button class="btn sm ghost" data-decline>${esc(t('declineOthers'))}</button>` : ''}</div></section>`;
}
export function wireCompare(body, c, s, links, sups, refresh) {
  body.querySelectorAll('[data-share-cmp]').forEach(b => b.onclick = async () => {
    const rows = compareRows(db.list('links', l => l.caseId === c.id), Object.values(sups), c.participants);
    const html = compareHtml(c, rows, b.dataset.shareCmp, false);
    const rec = { blob: new Blob([html], { type: 'text/html' }), name: 'comparison-' + (c.client || 'event').replace(/[^\w֐-׿]+/g, '-') + '.html', type: 'text/html', title: t('compare') };
    if (!(await shareFile(rec, t('compare') + ' · ' + (c.client || '')))) { downloadFile(rec); toast(t('shareFallback'), 4000); }
  });
  const sm = body.querySelector('[data-summary]'); if (sm) sm.onclick = () => clientSummary(c, s, links, sups);
  body.querySelectorAll('[data-choose]').forEach(b => b.onclick = async () => {
    if (!(await dialog(t('rfqChooseConfirm'), '', { ok: t('chooseSup') }))) return;
    chooseOffer(db.list('links', l => l.caseId === c.id), Object.values(sups), b.dataset.choose).forEach(patch => db.put('links', patch));
    refresh();
  });
  const d = body.querySelector('[data-decline]'); if (d) d.onclick = async () => {
    if (!(await ensurePhone(s))) return;
    const alternatives = declineCandidates(db.list('links', l => l.caseId === c.id), Object.values(sups));
    const others = alternatives.map(l => ({ ...(sups[l.supplierId] || { name: l.supplier }), _linkId: l.id }));
    await sendEach(others, sp => rfqDecline(c, sp, { phone: herPhone(s) }), sp => 'Re: ' + rfqSubject(c, templateFor(sp.type), sp.lang), (sp, channel, text) => {
      db.put('links', { id: sp._linkId, status: 'בוטל', declinedAt: todayIso(), declineChannel: channel, declineText: text });
      refresh();
    });
    refresh();
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
  const text = offerSummary(c, rows, to, { names: r1.names, openPoints: open, name: to === 'he' ? herName(s) : 'Virginie', phone: herPhone(s) });
  const leftover = to !== 'he' && hasHebrew(text.replace(/\* [^\n]+/g, m => (rows.some(r => m.includes(r.supplier)) ? '' : m)));
  const subject = (to === 'he' ? 'הצעות ל' : to === 'fr' ? 'Offres pour ' : 'Offers for ') + [c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ');
  const r2 = dialog(t('clientSummary'), `${leftover ? `<p class="warnbox">${esc(t('checkHebrew'))}</p>` : ''}<textarea name="text" rows="14" ${to === 'he' ? '' : 'dir="ltr" style="direction:ltr;text-align:left"'}>${esc(text)}</textarea><div class="row">${c.email || (client && client.email) ? `<button type="button" class="btn primary" data-x="mail">${esc(t('email'))}</button>` : ''}${c.phone ? `<button type="button" class="btn wa" data-x="wa">${esc(t('whatsapp'))}</button>` : ''}${copyOf('[name=text]', { sm: false })}</div>`, { ok: t('close') });
  // the buttons live inside the dialog body: wire them while it is open
  const form = document.querySelector('.modal form'); if (!form) return;
  const ta = form.querySelector('textarea[name=text]');
  const mailBtn = form.querySelector('[data-x=mail]'); if (mailBtn) mailBtn.onclick = () => openMail(c.email || (client && client.email), subject, ta.value);
  const waBtn = form.querySelector('[data-x=wa]'); if (waBtn) waBtn.onclick = () => openWhatsApp(c.phone, ta.value);
  await r2;
}

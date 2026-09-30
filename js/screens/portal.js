/* The client's page for one event: what was agreed, the schedule, planned versus paid, and who to call.
   Today it is a page she previews and shares as a file; in the cloud stage it becomes a live link with the same content. */
import { t, kindLabel, statusLabel, KIND_LABELS } from '../i18n.js';
import { db } from '../store.js';
import { esc, empty, toast, copyText } from '../ui.js';
import Office from '../logic/office.js';
import { resolveLines, translator, QUOTE_STATUS } from '../logic/quotes.js';
import { LOGO_H } from '../data/brand.js';
import { DEFAULTS } from '../data/defaults.js';
import { shareFile, downloadFile } from '../files.js';
import { phonePretty } from '../logic/core.js';
import { APPROVAL, kindLabel as approvalKindLabel } from '../logic/approvals.js';

const T = {
  he: { title: 'דף האירוע', planned: 'תוכנן', paid: 'שולם', balance: 'יתרה', schedule: 'לו״ז', items: 'מה כלול', contact: 'איש הקשר שלכם', bank: 'לתשלום בהעברה בנקאית', updated: 'עודכן', gross: 'כולל מע״מ', net: 'לפני מע״מ', vat: 'מע״מ', status: 'סטטוס', docs: 'מסמכים', quote: 'הצעת מחיר', people: 'משתתפים', noSchedule: 'הלו״ז יתעדכן בהמשך', payments: 'תשלומים', open: 'פתוח', paidOn: 'שולם' },
  en: { title: 'Your event page', planned: 'Planned', paid: 'Paid', balance: 'Balance', schedule: 'Schedule', items: 'What is included', contact: 'Your contact', bank: 'Payment by bank transfer', updated: 'Updated', gross: 'incl. VAT', net: 'before VAT', vat: 'VAT', status: 'Status', docs: 'Documents', quote: 'Quote', people: 'guests', noSchedule: 'The schedule will follow', payments: 'Payments', open: 'Open', paidOn: 'Paid' },
  fr: { title: 'La page de votre événement', planned: 'Prévu', paid: 'Payé', balance: 'Solde', schedule: 'Déroulé', items: 'Ce qui est compris', contact: 'Votre contact', bank: 'Paiement par virement', updated: 'Mis à jour', gross: 'TTC', net: 'HT', vat: 'TVA', status: 'Statut', docs: 'Documents', quote: 'Devis', people: 'participants', noSchedule: 'Le déroulé suivra', payments: 'Paiements', open: 'Ouvert', paidOn: 'Payé' }
};

/** The page as one self-contained HTML string, in the client's language. */
function portalInner(cs, lang) {
  const L = T[lang] ? lang : 'he'; const S = T[L]; const s = db.settings(); const rtl = L === 'he';
  const tr = translator(KIND_LABELS, db.list('catalog'));
  const quotes = db.list('quotes', q => q.caseId === cs.id);
  const q = quotes.find(x => x.status === QUOTE_STATUS.accepted) || quotes.find(x => x.status === QUOTE_STATUS.sent) || quotes.sort((a, b) => String(b.created).localeCompare(String(a.created)))[0] || null;
  const lines = q ? resolveLines(q.lines, q.defaultMargin) : [];
  const tot = q ? Office.quoteTotals(lines, q.vatRate) : null;
  const pays = db.list('payments', p => p.caseId === cs.id);
  const paid = pays.filter(p => p.status === Office.PAY.paid).reduce((a, p) => a + (Office.num(p.amount) || 0), 0);
  const planned = tot ? tot.net : 0;
  const rows = db.list('schedule', r => r.caseId === cs.id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Office.minutes(a.start) || 0) - (Office.minutes(b.start) || 0));
  const e = x => esc(x == null ? '' : x);
  const name = l => L === 'he' ? l.item : (l[L] || tr(l.item, L));
  const bank = s.bankDetails || DEFAULTS.bankDetails;
  return `<div class="w" data-lang="${L}" dir="${rtl ? 'rtl' : 'ltr'}" style="direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'}">
<div class="top"><img src="${LOGO_H}" alt=""><div><h1>${e(S.title)}</h1><div class="small">${e(cs.client)}${cs.contact ? ' · ' + e(cs.contact) : ''}</div></div></div>
<div class="card"><div class="kv"><b>${e(L === 'he' ? 'האירוע' : L === 'fr' ? 'Événement' : 'Event')}</b><span>${e(L === 'he' ? cs.kind : tr(cs.kind, L))}</span>${cs.date ? `<b>${e(L === 'he' ? 'מועד' : 'Date')}</b><span class="ltr">${e(Office.fmt(cs.date))}${cs.hours ? ' · ' + e(cs.hours) : ''}</span>` : ''}${cs.place ? `<b>${e(L === 'he' ? 'מקום' : L === 'fr' ? 'Lieu' : 'Venue')}</b><span>${e(cs.place)}</span>` : ''}${cs.participants ? `<b>${e(S.people)}</b><span class="ltr">${e(cs.participants)}</span>` : ''}<b>${e(S.status)}</b><span><span class="badge">${e(L === 'he' ? cs.status : statusLabelIn(cs.status, L))}</span></span></div></div>
${(() => { const pend = db.list('approvals', a => a.caseId === cs.id && a.status === APPROVAL.sent); if (!pend.length) return ''; const P = { he: 'ממתין לאישורך', en: 'Waiting for your approval', fr: 'En attente de votre validation' }[L]; const H = { he: 'כדי לאשר, השיבו להודעה שקיבלתם, או צרו קשר.', en: 'To approve, reply to the message you received, or contact us.', fr: 'Pour valider, répondez au message reçu ou contactez-nous.' }[L]; return `<h2>${e(P)}</h2>${pend.map(a => `<div class="card" style="border-color:#D7352B"><b>${e(approvalKindLabel(a.kind, L))}${a.title ? ': ' + e(a.title) : ''}</b>${a.details ? `<div class="small">${e(a.details)}</div>` : ''}${Office.num(a.amount) ? `<div class="ltr">${e(Office.money(a.amount))} + ${e(S.vat)}</div>` : ''}</div>`).join('')}<p class="small">${e(H)}</p>`; })()}
<h2>${e(S.payments)}</h2><div class="stat"><div class="card"><big class="ltr">${e(Office.money(planned))}</big><span class="small">${e(S.planned)} · ${e(S.net)}</span></div><div class="card"><big class="ltr">${e(Office.money(paid))}</big><span class="small">${e(S.paid)}</span></div><div class="card"><big class="ltr">${e(Office.money(Math.max(0, (tot ? tot.gross : 0) - paid)))}</big><span class="small">${e(S.balance)} · ${e(S.gross)}</span></div></div>
${pays.length ? `<div class="card"><table><thead><tr><th>${e(L === 'he' ? 'פירוט' : 'Item')}</th><th class="n">${e(L === 'he' ? 'סכום' : 'Amount')}</th><th>${e(S.status)}</th></tr></thead><tbody>${pays.map(p => `<tr><td>${e(p.note || '')}${p.due ? ` <span class="small ltr">${e(Office.fmt(p.due))}</span>` : ''}</td><td class="n">${e(Office.money(p.amount))}</td><td>${e(p.status === Office.PAY.paid ? S.paidOn : S.open)}</td></tr>`).join('')}</tbody></table></div>` : ''}
${lines.length ? `<h2>${e(S.items)}</h2><div class="card"><table><thead><tr><th>${e(L === 'he' ? 'פריט' : 'Item')}</th><th class="n">${e(L === 'he' ? 'כמות' : 'Qty')}</th><th class="n">${e(L === 'he' ? 'סה״כ' : 'Total')}</th></tr></thead><tbody>${tot.lines.map(l => `<tr><td>${e(name(l))}</td><td class="n">${e(l.qty)}</td><td class="n">${e(Office.money(l.total))}</td></tr>`).join('')}<tr><td><b>${e(S.planned)} ${e(S.net)}</b></td><td></td><td class="n"><b>${e(Office.money(tot.net))}</b></td></tr><tr><td>${e(S.vat)} ${tot.vatRate}%</td><td></td><td class="n">${e(Office.money(tot.vat))}</td></tr><tr><td><b>${e(S.gross)}</b></td><td></td><td class="n"><b>${e(Office.money(tot.gross))}</b></td></tr></tbody></table></div>` : ''}
<h2>${e(S.schedule)}</h2><div class="card">${rows.length ? `<table><tbody>${rows.map(r => `<tr><td class="n">${e(Office.hhmm(r.start))}${r.end ? '–' + e(Office.hhmm(r.end)) : ''}</td><td>${e(r.what)}${r.where ? ` <span class="small">· ${e(r.where)}</span>` : ''}</td></tr>`).join('')}</tbody></table>` : `<span class="small">${e(S.noSchedule)}</span>`}</div>
<h2>${e(S.contact)}</h2><div class="card"><div>${e((s.signer || DEFAULTS.signer).split('\n')[0])} · ${e(s.bizName || DEFAULTS.bizName)}</div><div class="ltr">${e(phonePretty(s.bizPhone || DEFAULTS.bizPhone))} · ${e(s.bizEmail || DEFAULTS.bizEmail)}</div></div>
${bank ? `<h2>${e(S.bank)}</h2><div class="card small" style="white-space:pre-line">${e(bank)}</div>` : ''}
<p class="small">${e(S.updated)} <span class="ltr">${e(Office.fmt(new Date()))}</span> · ${e(s.bizLegal || DEFAULTS.bizLegal)} · ${e(s.bizId || DEFAULTS.bizId)}</p></div>`;
}
/** The page as one self-contained HTML string: all three languages inside, the client picks one; starts in the client's language. */
export function portalHtml(cs, lang) {
  const L = T[lang] ? lang : 'he'; const e = x => esc(x == null ? '' : x);
  return `<!DOCTYPE html><html dir="${L === 'he' ? 'rtl' : 'ltr'}" lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(T[L].title)} · ${e(cs.client)}</title>
<style>body{margin:0;background:#EFE8DC;color:#12100F;font-family:Assistant,'Noto Sans Hebrew','Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;unicode-bidi:embed}
.w{max-width:720px;margin:0 auto;padding:12px 16px 40px}.langs{max-width:720px;margin:0 auto;padding:12px 16px 0;display:flex;gap:6px;justify-content:flex-end;direction:ltr}.langs button{border:1px solid #DED3C2;background:#FBF8F2;border-radius:999px;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer}.langs button.on{background:#12100F;color:#EFE8DC;border-color:#12100F}
.w[data-lang]{display:none}.w.on{display:block}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #D7352B;padding-bottom:12px;margin-bottom:16px}.top img{height:56px}
h1{font-size:24px;margin:0}h2{font-size:17px;margin:20px 0 8px;color:#D7352B}.card{background:#FBF8F2;border:1px solid #DED3C2;border-radius:12px;padding:12px 14px;margin-bottom:10px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px}.kv b{color:#6E645A;font-weight:600}.stat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stat .card{text-align:center}.stat big{display:block;font-size:22px;font-weight:800}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #DED3C2;text-align:start;vertical-align:top}th{font-size:13px;color:#6E645A}.n{direction:ltr;unicode-bidi:isolate;white-space:nowrap;text-align:end}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}.small{font-size:13px;color:#6E645A}.badge{display:inline-block;padding:1px 9px;border-radius:999px;font-size:13px;font-weight:700;background:#DCEBE2;color:#2E6A4E}</style></head><body>
<div class="langs">${['he', 'en', 'fr'].map(k => `<button type="button" data-l="${k}" class="${k === L ? 'on' : ''}">${{ he: 'עברית', en: 'English', fr: 'Français' }[k]}</button>`).join('')}</div>
${['he', 'en', 'fr'].map(k => portalInner(cs, k).replace('<div class="w"', '<div class="w' + (k === L ? ' on' : '') + '"')).join('')}
<script>document.querySelectorAll('.langs button').forEach(function(b){b.onclick=function(){var l=b.getAttribute('data-l');document.querySelectorAll('.langs button').forEach(function(x){x.classList.toggle('on',x===b)});document.querySelectorAll('.w[data-lang]').forEach(function(w){w.classList.toggle('on',w.getAttribute('data-lang')===l)});document.documentElement.dir=l==='he'?'rtl':'ltr';document.documentElement.lang=l;}});</script></body></html>`;
}
function statusLabelIn(st, L) { const m = { 'פנייה': { en: 'Inquiry', fr: 'Demande' }, 'הצעה נשלחה': { en: 'Quote sent', fr: 'Devis envoyé' }, 'נסגר': { en: 'Confirmed', fr: 'Confirmé' }, 'בוצע': { en: 'Done', fr: 'Réalisé' }, 'ירד': { en: 'Cancelled', fr: 'Annulé' } }; return (m[st] && m[st][L]) || st; }

export const noLive = true;
export function render({ root, id }) {
  const cs = db.get('cases', id);
  if (!cs) { root.innerHTML = empty(t('noResults')); return; }
  let lang = cs.lang || 'he';
  const draw = () => {
    root.innerHTML = `<header class="top"><a class="icon" href="#/case/${esc(id)}/money" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('portal'))}</h1></header>
      <div class="row"><select id="pl">${['he', 'en', 'fr'].map(k => `<option value="${k}"${k === lang ? ' selected' : ''}>${esc({ he: 'עברית', en: 'English', fr: 'Français' }[k])}</option>`).join('')}</select><button class="btn primary" id="share">${esc(t('sharePortal'))}</button><button type="button" class="btn ghost" id="copyPage">${esc(t('copy'))}</button></div>
      <p class="hint">${esc(t('portalHint'))}</p>
      <iframe id="pv" style="width:100%;height:70vh;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>`;
    root.querySelector('#pv').srcdoc = portalHtml(cs, lang);
    root.querySelector('#pl').onchange = e => { lang = e.target.value; draw(); };
    // the page as plain text, in the language shown, for pasting into a mail or a chat
    root.querySelector('#copyPage').onclick = () => { const d = root.querySelector('#pv').contentDocument; const w = d && d.querySelector('.w.on'); copyText(w ? w.innerText.trim() : ''); };
    root.querySelector('#share').onclick = async () => {
      const html = portalHtml(cs, lang);
      const rec = { name: (cs.client || 'event').replace(/[\\/:*?"<>|]/g, '') + '-' + Office.iso(new Date()) + '.html', type: 'text/html', blob: new Blob([html], { type: 'text/html' }), title: t('portal') };
      if (!(await shareFile(rec, t('portal') + ' · ' + cs.client))) { downloadFile(rec); toast(t('shareFallback'), 4000); }
    };
  };
  draw();
}

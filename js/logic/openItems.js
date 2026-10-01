/* "What is still missing for Shoval?": everything open on one event, in plain sections: details of the event, suppliers,
   client, tasks, print, money. Only when she asks. Pure, tested. */
import Office from './office.js';
import { str, trim } from './core.js';
import { TASK } from './extra.js';
import { PRINT_STATUS } from './print.js';
import { APPROVAL } from './approvals.js';
import { SUP_INVOICE } from './money.js';
import { loose, polite } from './travel.js';

const ASK = loose(/^(?:מה\s+(?:עוד\s+)?(?:חסר|פתוח|נשאר|לא סגור|צריך|אני צריכה|צריכה|המצב של|המצב עם|המצב ב|קורה עם|עם|הסטטוס של|הסטטוס עם)|what(?:'s| is| do i(?: still)? need| do we(?: still)? need|(?: is)? still| remains| is left| else)\s*(?:missing|open|left|needed|need|outstanding|pending|the status of|the status with|the status on|the situation with|up with|going on with|happening with|to do for|to do on|to do with)?|where (?:are we|do we stand|do things stand|things stand)(?: at)?|how (?:are we doing|is it going|are things|is it looking)|status of|qu'est-ce qu(?:i|e)\s+(?:manque|reste|il manque|il reste|je dois|j'ai|il faut encore|il reste à faire|il y a encore|il y a d'ouvert|est encore ouvert)|que manque-t-il|que reste-t-il|qu'est-ce qui est (?:ouvert|encore ouvert|en attente|en suspens)|où en est(?:-on)?|ou en est|on en est où|où ça en est|quel est le statut|c'est quoi le statut|quoi de neuf avec|le point sur|fais(?:-moi)? le point sur|où on en est)/i);
const FOCUS_SUP = /(?:ספק|suppliers?|vendors?|fournisseurs?)/i;
const FOCUS_CLIENT = /(?:לקוח|client|customer)/i;
const STRIP = /(?:\s|^)(?:מ|ב|ל|עם\s+)?ה?ספקים?(?:\s+של)?(?=\s|$)|(?:\s|^)(?:from |with |for |of )?(?:the )?(?:suppliers?|vendors?)(?: of| for)?(?=\s|$)|(?:\s|^)(?:des |les |aux |du |de la |avec les |chez les |côté |cote )?fournisseurs?(?: de| pour)?(?=\s|$)|(?:\s|^)(?:מ|ל|עם\s+)?ה?לקוח(?:\s+של)?(?=\s|$)|(?:\s|^)(?:from |with |for )?(?:the )?(?:client|customer)(?: of| for)?(?=\s|$)|(?:\s|^)(?:du |le |avec le |chez le |côté |cote )?client(?: de| pour)?(?=\s|$)/gi;
const WHO = loose(/(?:^|\s)(?:של|מול|עם|אצל|לאירוע של|לאירוע|בתיק של|בתיק|for the event of|for the event|for|with|from|of|on|at|pour l'événement de|pour l'événement|pour|de|du|chez|avec|sur|dans)\s+(.+)$/i);

/** {who, alt, focus: 'all'|'suppliers'|'client'} or null when the text is not this question.
    `alt` is `who` without a Hebrew one-letter prefix (ל/ב): "לשוב״ל" → "שוב״ל"; the caller tries who first, then alt. */
export function parseMissing(text) {
  const t = polite(trim(str(text)).replace(/’/g, "'")).replace(/[?!.]+$/, '');
  if (!t || t.length > 120 || !ASK.test(t)) return null;
  const focus = FOCUS_SUP.test(t) ? 'suppliers' : FOCUS_CLIENT.test(t) ? 'client' : 'all';
  let rest = t.replace(ASK, '').replace(/^\s*(?:לי|me|moi)\b/i, '').replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  rest = rest.replace(/^(?:עוד|still|encore)\s+/i, '').replace(/^(?:לי|me|moi)\s+/i, '').replace(/^(?:à faire|to do|to be done)\s+/i, '');
  const m = WHO.exec(' ' + rest);
  let who = m ? trim(m[1]) : rest;
  who = who.replace(/^(?:the |l['’]|le |la )/, '').replace(loose(/^(?:ה?אירוע|ה?תיק|event|case|dossier|événement|evenement|projet|project)\s+(?:של|of|de|du)?\s*/i), '').replace(/^(?:הזה|הזאת|this|ce|cette)$/i, '').trim();
  const alt = /^[לב][֐-׿]/.test(who) ? who.slice(1) : who;
  return { who, alt, focus };
}

/** Sections of open items for one case. Each item: {text, href}. Empty sections are left out. */
export function openItems(cs, data, today, L) {
  const lang = L || 'he';
  const T = TEXT[lang] || TEXT.he;
  const t0 = Office.day(today) || Office.day(new Date());
  const id = cs.id;
  const links = (data.links || []).filter(l => l.caseId === id);
  const sups = {}; (data.suppliers || []).forEach(s => { sups[s.id] = s; });
  const supName = l => (sups[l.supplierId] || {}).name || l.supplier || '';
  const out = [];
  const push = (key, items) => { if (items.length) out.push({ key, title: T[key], items }); };

  // 1. the event itself
  const miss = Office.missingOf(cs).map(k => ({ text: T.f[k], href: '#/case/' + id }));
  if (!trim(cs.phone) && !trim(cs.email)) miss.push({ text: T.noContact, href: '#/case/' + id });
  push('details', miss);

  // 2. suppliers
  const sup = [];
  const linkedTypes = new Set(links.filter(l => !/בוטל/.test(str(l.status))).map(l => (sups[l.supplierId] || {}).type).filter(Boolean));
  (cs.needs || []).forEach(ty => { if (!linkedTypes.has(ty)) sup.push({ text: T.noSupplierFor(ty), href: '#/case/' + id + '/suppliers' }); });
  links.filter(l => /ביקשנו/.test(str(l.status)) && !l.answeredAt).forEach(l => sup.push({ text: T.waiting(supName(l), l.askedAt ? Office.daysBetween(l.askedAt, t0) : null), href: '#/case/' + id + '/suppliers' }));
  const byType = {}; links.filter(l => /התקבלה/.test(str(l.status))).forEach(l => { const ty = (sups[l.supplierId] || {}).type || '?'; (byType[ty] = byType[ty] || []).push(l); });
  Object.keys(byType).forEach(ty => { if (!links.some(l => /אושר/.test(str(l.status)) && ((sups[l.supplierId] || {}).type || '?') === ty)) sup.push({ text: T.notChosen(byType[ty].length, ty), href: '#/case/' + id + '/suppliers' }); });
  links.filter(l => !/בוטל/.test(str(l.status))).forEach(l => { const s = sups[l.supplierId]; if (s && !trim(s.phone) && !trim(s.email)) sup.push({ text: T.supNoContact(s.name), href: '#/supplier/' + s.id }); });
  links.filter(l => /אושר/.test(str(l.status)) && !Office.num(l.cost)).forEach(l => sup.push({ text: T.noPrice(supName(l)), href: '#/case/' + id + '/suppliers' }));
  push('suppliers', sup);

  // 3. client
  const cl = [];
  (data.approvals || []).filter(a => a.caseId === id && a.status !== APPROVAL.approved && a.status !== APPROVAL.declined).forEach(a => cl.push({ text: (a.status === APPROVAL.sent ? T.approvalWaiting : T.approvalDraft) + ': ' + str(a.title || a.kind), href: '#/case/' + id + '/money' }));
  (data.payments || []).filter(p => p.caseId === id && p.status !== Office.PAY.paid && Office.num(p.amount)).forEach(p => cl.push({ text: T.payment(p.status, Office.money(Office.num(p.amount))), href: '#/case/' + id + '/money' }));
  const client = (data.clients || []).find(c => c.id === cs.clientId);
  if (client && !trim(client.approver) && !trim(client.payer)) cl.push({ text: T.noProcess, href: '#/client/' + client.id });
  push('client', cl);

  // 4. tasks and calls
  const tk = (data.tasks || []).filter(x => x.caseId === id && x.status !== TASK.done).map(x => ({ text: x.title + (x.due ? ' · ' + Office.fmt(x.due) : '') + (x.who && x.who !== 'אני' ? ' · ' + x.who : ''), href: '#/tasks' }));
  (data.calls || []).filter(x => x.caseId === id && !x.outcome && !x.done && x.status !== 'נענה').forEach(x => tk.push({ text: T.call + ': ' + str(x.who || x.name || x.client), href: '#/calls' }));
  push('tasks', tk);

  // 5. print
  const pr = (data.print || []).filter(i => i.caseId === id);
  const prItems = [];
  const plan = pr.filter(i => i.status === PRINT_STATUS.plan); if (plan.length) prItems.push({ text: T.printPlan(plan.length), href: '#/case/' + id + '/lists' });
  const ordered = pr.filter(i => i.status === PRINT_STATUS.ordered); if (ordered.length) prItems.push({ text: T.printOrdered(ordered.length), href: '#/case/' + id + '/lists' });
  push('print', prItems);

  // 6. money with suppliers
  const mo = [];
  links.filter(l => Office.yes(l.paid) && l.supInvoice !== SUP_INVOICE.received && Office.num(l.cost)).forEach(l => mo.push({ text: T.supInvoice(supName(l)), href: '#/money' }));
  links.filter(l => /אושר/.test(str(l.status)) && !Office.yes(l.paid) && Office.num(l.cost) && Office.day(cs.date) && Office.day(cs.date) < t0).forEach(l => mo.push({ text: T.supUnpaid(supName(l), Office.money(Office.num(l.cost))), href: '#/money' }));
  push('money', mo);

  const total = out.reduce((a, s) => a + s.items.length, 0);
  return { sections: out, total, daysLeft: Office.day(cs.date) ? Office.daysBetween(t0, cs.date) : null };
}

/** Only the sections she asked about. */
export function focusSections(res, focus) {
  if (focus === 'suppliers') return Object.assign({}, res, { sections: res.sections.filter(s => s.key === 'suppliers' || s.key === 'print' || s.key === 'money') });
  if (focus === 'client') return Object.assign({}, res, { sections: res.sections.filter(s => s.key === 'client' || s.key === 'details') });
  return res;
}

const TEXT = {
  he: {
    details: 'פרטי האירוע', suppliers: 'ספקים', client: 'לקוח', tasks: 'משימות ושיחות', print: 'דפוס ומיתוג', money: 'כספים מול ספקים',
    f: { date: 'אין תאריך', participants: 'אין מספר משתתפים', budget: 'אין תקציב', place: 'אין מקום', kind: 'אין סוג אירוע', purpose: 'אין מטרה' },
    noContact: 'אין טלפון ומייל לאיש הקשר', noSupplierFor: ty => 'אין עדיין ספק ל' + ty, waiting: (n, d) => n + ': ביקשנו הצעה, עדיין לא ענו' + (d != null ? ' (' + d + ' ימים)' : ''),
    notChosen: (n, ty) => 'התקבלו ' + n + ' הצעות ל' + ty + ', עדיין לא נבחר', supNoContact: n => n + ': אין טלפון ומייל', noPrice: n => n + ': אושר בלי מחיר',
    approvalWaiting: 'מחכה לאישור הלקוח', approvalDraft: 'אישור שעוד לא נשלח ללקוח', payment: (st, amt) => st + ': ' + amt, noProcess: 'בכרטיס הלקוח חסר מי מאשר ומי משלם',
    call: 'שיחה פתוחה', printPlan: n => n + ' פריטי דפוס עוד לא הוזמנו', printOrdered: n => n + ' פריטי דפוס הוזמנו בלי אישור הזמנה',
    supInvoice: n => n + ': שולם, חסרה חשבונית', supUnpaid: (n, amt) => n + ': האירוע עבר, עוד לא שולם ' + amt
  },
  en: {
    details: 'Event details', suppliers: 'Suppliers', client: 'Client', tasks: 'Tasks and calls', print: 'Print and branding', money: 'Money with suppliers',
    f: { date: 'No date', participants: 'No number of participants', budget: 'No budget', place: 'No place', kind: 'No event type', purpose: 'No purpose' },
    noContact: 'No phone or e-mail for the contact', noSupplierFor: ty => 'No supplier yet for ' + ty, waiting: (n, d) => n + ': quote requested, no answer yet' + (d != null ? ' (' + d + ' days)' : ''),
    notChosen: (n, ty) => n + ' offers received for ' + ty + ', none chosen yet', supNoContact: n => n + ': no phone or e-mail', noPrice: n => n + ': confirmed without a price',
    approvalWaiting: 'Waiting for the client’s approval', approvalDraft: 'Approval not sent to the client yet', payment: (st, amt) => st + ': ' + amt, noProcess: 'Client card is missing who approves and who pays',
    call: 'Open call', printPlan: n => n + ' print items not ordered yet', printOrdered: n => n + ' print items ordered without confirmation',
    supInvoice: n => n + ': paid, invoice missing', supUnpaid: (n, amt) => n + ': event is over, still unpaid ' + amt
  },
  fr: {
    details: 'Détails de l’événement', suppliers: 'Fournisseurs', client: 'Client', tasks: 'Tâches et appels', print: 'Impression', money: 'Argent avec les fournisseurs',
    f: { date: 'Pas de date', participants: 'Pas de nombre de participants', budget: 'Pas de budget', place: 'Pas de lieu', kind: 'Pas de type d’événement', purpose: 'Pas d’objectif' },
    noContact: 'Ni téléphone ni e-mail pour le contact', noSupplierFor: ty => 'Pas encore de fournisseur pour ' + ty, waiting: (n, d) => n + ' : devis demandé, pas encore de réponse' + (d != null ? ' (' + d + ' jours)' : ''),
    notChosen: (n, ty) => n + ' devis reçus pour ' + ty + ', aucun choisi', supNoContact: n => n + ' : ni téléphone ni e-mail', noPrice: n => n + ' : confirmé sans prix',
    approvalWaiting: 'En attente de l’accord du client', approvalDraft: 'Accord pas encore envoyé au client', payment: (st, amt) => st + ' : ' + amt, noProcess: 'Fiche client sans « qui valide » ni « qui paie »',
    call: 'Appel ouvert', printPlan: n => n + ' articles d’impression pas encore commandés', printOrdered: n => n + ' articles commandés sans confirmation',
    supInvoice: n => n + ' : payé, facture manquante', supUnpaid: (n, amt) => n + ' : événement passé, pas encore payé ' + amt
  }
};

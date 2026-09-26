/* Demo data so the app can be tried before real work. Names and numbers are invented. */
import { db } from '../store.js';
import Office from '../logic/office.js';
import { CALL, TASK } from '../logic/extra.js';
import { QUOTE_STATUS, recommendedLines } from '../logic/quotes.js';

export function loadDemo() {
  const d = n => Office.iso(Office.addDays(new Date(), n));
  const c1 = db.put('clients', { name: 'טכנו-גליל בע״מ', contact: 'דנה לוי', phone: '052-1234567', email: 'dana@example.com', type: 'חברה', lang: 'he', legalName: 'טכנו-גליל בע״מ', taxId: '515123456', address: 'רח׳ התעשייה 4, נוף הגליל' });
  const c2 = db.put('clients', { name: 'Famille Cohen', contact: 'Marc Cohen', phone: '+33612345678', email: 'marc@example.fr', type: 'פרטי', lang: 'fr' });
  const c3 = db.put('clients', { name: 'Galilee Tours Ltd', contact: 'Sarah Green', phone: '054-7654321', type: 'מפיק או ספק אחר', lang: 'en' });
  const k1 = db.put('cases', { clientId: c1, client: 'טכנו-גליל בע״מ', contact: 'דנה לוי', phone: '052-1234567', email: 'dana@example.com', kind: 'יום גיבוש', date: d(9), hours: '09:00-16:00', place: 'ראש פינה',
    participants: '40', budget: '20,000 ₪', purpose: 'גיבוש צוות הפיתוח אחרי גיוס', lang: 'he', status: Office.STATUS.won, source: 'היי, שמי דנה מטכנו-גליל. אנחנו רוצים יום גיבוש ל-40 עובדים בראש פינה, תקציב 20 אלף ש"ח.' });
  const k2 = db.put('cases', { clientId: c2, client: 'Famille Cohen', contact: 'Marc Cohen', phone: '+33612345678', email: 'marc@example.fr', kind: 'בר או בת מצווה', date: d(45), place: 'צפת',
    participants: '120', budget: '60,000 ₪', purpose: 'Bar mitsva de Nathan', lang: 'fr', status: Office.STATUS.quoted, waitingSince: d(-3),
    source: 'Bonjour, nous organisons la bar mitsva de notre fils Nathan à Safed, environ 120 personnes, budget 60 000 shekels.' });
  const k3 = db.put('cases', { clientId: c3, client: 'Galilee Tours Ltd', contact: 'Sarah Green', phone: '054-7654321', kind: 'משלחת או סיור', date: d(21), place: 'גליל עליון', participants: '25-30', budget: '',
    purpose: 'Delegation from Toronto, 3 days', lang: 'en', status: Office.STATUS.lead, waitingSince: d(-2), source: 'Hi, this is Sarah. We have a delegation of 25-30 people from Toronto for 3 days in the Upper Galilee.' });

  const s1 = db.put('suppliers', { name: 'הגברה יוסי', type: 'הגברה ותאורה', contact: 'יוסי', phone: '050-1112233', area: 'גליל', lang: 'he', rating: 5, active: 'כן' });
  const s2 = db.put('suppliers', { name: 'קייטרינג שקד', type: 'קייטרינג ושפים', contact: 'רותם', phone: '052-3334455', area: 'גליל', lang: 'he', rating: 4, active: 'כן', notes: 'כשר, טבעוני לפי בקשה' });
  const s3 = db.put('suppliers', { name: 'קייטרינג הגליל', type: 'קייטרינג ושפים', contact: 'אמיר', phone: '053-5556677', area: 'גליל', lang: 'he', rating: 3, active: 'כן' });
  const s4 = db.put('suppliers', { name: 'הסעות צפון', type: 'הסעות', contact: 'משה', phone: '054-8889900', area: 'צפון', lang: 'he', rating: 4, active: 'כן' });
  const s5 = db.put('suppliers', { name: 'DJ Léo', type: 'תקליטנים ולהקות', contact: 'Léo', phone: '058-1231234', area: 'צפון', lang: 'fr', rating: 5, active: 'כן' });
  const s6 = db.put('suppliers', { name: 'סטודיו אור', type: 'צילום ווידאו', contact: 'אור', phone: '052-9998887', area: 'חיפה', lang: 'he', rating: 4, active: 'כן' });
  db.put('links', { caseId: k1, supplierId: s1, supplier: 'הגברה יוסי', what: 'הגברה לפעילות בחוץ', status: 'אושר', cost: 1800, arrive: '07:30', askedAt: d(-10) });
  db.put('links', { caseId: k1, supplierId: s2, supplier: 'קייטרינג שקד', what: 'ארוחת בוקר וצהריים ל-40', status: 'אושר', cost: 6000, arrive: '08:00', askedAt: d(-10) });
  db.put('links', { caseId: k1, supplierId: s4, supplier: 'הסעות צפון', what: 'אוטובוס 50 מקומות, הלוך ושוב מנוף הגליל', status: 'הצעה התקבלה', cost: 2200, askedAt: d(-8) });
  db.put('links', { caseId: k2, supplierId: s5, supplier: 'DJ Léo', what: 'Soirée, 5 heures', status: 'ביקשנו הצעה', askedAt: d(-4) });

  const lines = recommendedLines('יום גיבוש', '40').map(l => {
    const cost = { 'ניהול והפקת האירוע': 0, 'עוזר/ת הפקה': 600, 'אוטובוס': 2200, 'מדריך טיולים': 1200, 'סדנה או פעילות': 3500, 'ארוחה': 150, 'כיבוד קל': 25, 'כניסה לאתר': 40 }[l.item];
    const sup = { 'אוטובוס': [s4, 'הסעות צפון'], 'ארוחה': [s2, 'קייטרינג שקד'], 'כיבוד קל': [s2, 'קייטרינג שקד'] }[l.item];
    return Object.assign(l, { cost: cost || '', margin: '', price: l.item === 'ניהול והפקת האירוע' ? 3500 : '', supplierId: sup ? sup[0] : '', supplier: sup ? sup[1] : '' });
  });
  db.put('quotes', { no: 'BS-' + new Date().getFullYear() + '-001', version: 1, caseId: k1, client: 'טכנו-גליל בע״מ', date: d(-7), lang: 'he', status: QUOTE_STATUS.accepted, vatRate: 18, defaultMargin: 25, validUntil: d(7), terms: 'מקדמה 30% באישור, היתרה עד 7 ימים אחרי האירוע.', lines });
  db.put('cases', { id: k1, quoteNo: 'BS-' + new Date().getFullYear() + '-001' });
  db.put('payments', { caseId: k1, client: 'טכנו-גליל בע״מ', amount: 5400, due: d(-2), status: 'לגבות', note: 'מקדמה 30%' });
  db.put('payments', { caseId: k1, client: 'טכנו-גליל בע״מ', amount: 12600, due: d(16), status: 'לגבות', note: 'יתרה' });

  Office.scheduleFromTemplate('יום גיבוש', '09:00', d(9)).forEach(r => db.put('schedule', Object.assign(r, { caseId: k1, who: r.who === 'הסעות' ? 'הסעות צפון' : r.who === 'קייטרינג ושפים' ? 'קייטרינג שקד' : r.who })));
  db.put('staff', { caseId: k1, name: 'נועה', phone: '050-9998877', role: 'עוזרת הפקה', arrive: '07:30', confirmed: 'כן' });
  db.put('staff', { caseId: k1, name: 'Léa', phone: '053-1231234', role: 'עוזרת הפקה', arrive: '08:00', confirmed: '' });
  Office.checklistFor(Office.CHECK_SEED.map(r => ({ list: r[0], kind: r[1], item: r[2] })), 'יום גיבוש').forEach((k, i) => db.put('checks', Object.assign(k, { caseId: k1, done: i < 5 ? 'כן' : '' })));

  db.put('calls', { caseId: k1, clientId: c1, name: 'יוסי (הגברה)', phone: '050-1112233', why: 'לאשר שעת הגעה 07:30 ומחיר סופי', lang: 'he', status: CALL.todo, attempts: 0 });
  db.put('calls', { caseId: k2, clientId: c2, name: 'Marc Cohen', phone: '+33612345678', why: 'Réponse au devis, choix du traiteur', lang: 'fr', status: CALL.noanswer, attempts: 1 });
  db.put('calls', { caseId: k3, clientId: c3, name: 'Sarah Green', phone: '054-7654321', why: 'Budget and hotel level', lang: 'en', status: CALL.callback, callbackAt: d(0), attempts: 1 });
  db.put('tasks', { caseId: k1, title: 'לאסוף שלטי הכוונה מהדפוס', details: 'דפוס גליל, נוף הגליל. 6 שלטים + 2 רול-אפ. לבדוק שהלוגו לא חתוך.', who: 'נועה', phone: '050-9998877', due: d(7), lang: 'he', status: TASK.open });
  db.put('tasks', { caseId: k2, title: 'Photos de la salle', details: 'Prendre 10 photos de la salle à Safed, y compris la cuisine et le parking.', who: 'Léa', phone: '053-1231234', due: d(5), lang: 'fr', status: TASK.sent });
  db.put('notes', { about: 'client', aboutId: c1, aboutLabel: 'טכנו-גליל בע״מ', text: 'דנה אוהבת יין אדום, יש לה כלב בשם בוני. מעדיפה הודעות ולא שיחות.' });
  db.put('notes', { about: 'supplier', aboutId: s1, aboutLabel: 'הגברה יוסי', text: 'ספק מצוין, תמיד אפשר לסמוך עליו. מגיע מוקדם.' });
  db.put('notes', { about: 'supplier', aboutId: s3, aboutLabel: 'קייטרינג הגליל', text: 'איחרו פעם ב-40 דקות. לבקש אישור הגעה ביום לפני.' });
  db.put('approvals', { caseId: k1, kind: 'participants', title: '45 במקום 40', details: 'הקייטרינג צריך לדעת עד יום שלישי', amount: 750, status: 'sent', sentAt: d(-3) });
  if (!db.setting('signer')) db.setting('signer', 'וירג׳יני מנדל נאור\nבאקה סאן בע״מ');
  if (!db.setting('invoiceTo')) db.setting('invoiceTo', '050-0000000');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseInvoiceRequest, invoiceRequestText, parseSupplierQuote, markupLines, supplierMarkupMessage, unansweredSince, delegateCallMessage } from '../js/logic/commands.js';

const docs = [{ id: 'd1', title: 'אישור ניהול חשבון בנק', aliases: ['אישור ניהול חשבון', 'אישור חשבון'] }, { id: 'd2', title: 'תעודת התאגדות' }, { id: 'd3', title: 'ערכת לוגו', aliases: ['לוגו', 'logo'] }];
const people = [{ label: 'דנה לוי · טכנו-גליל', names: ['דנה לוי', 'טכנו-גליל'], phone: '052-1234567' }, { label: 'Marc Cohen', names: ['Marc Cohen', 'Famille Cohen'], email: 'marc@x.fr' }];

test('send a document to a number, an e-mail, or a known person', () => {
  let c = parseCommand('שלחי אישור ניהול חשבון ל-052-9998877', docs, people);
  assert.equal(c.kind, 'send'); assert.equal(c.doc.id, 'd1'); assert.equal(c.to.phone, '052-9998877');
  c = parseCommand('send the logo to marc@x.fr', docs, people);
  assert.equal(c.doc.id, 'd3'); assert.equal(c.to.email, 'marc@x.fr');
  c = parseCommand('תשלחי תעודת התאגדות לדנה לוי', docs, people);
  assert.equal(c.doc.id, 'd2'); assert.equal(c.to.phone, '052-1234567');
  c = parseCommand('envoie le logo à Marc Cohen', docs, people);
  assert.equal(c.doc.id, 'd3'); assert.equal(c.to.email, 'marc@x.fr');
  assert.equal(parseCommand('מה השעה', docs, people).kind, 'unknown');
});

test('an invoice request is read from her usual message', () => {
  const r = parseInvoiceRequest('לקוח חדש\nעמותת קומיוניטי או\nע.ר 580777894\nעין ורד 1, תל אביב\nסכומים\nמקדמה עבור וירגיני הפקה 3,000 + מעמ\n20 כריות 1,595 + מעמ\nציוד משרדי 1,214 + מעמ');
  assert.equal(r.client, 'עמותת קומיוניטי או'); assert.equal(r.taxId, '580777894');
  assert.deepEqual(r.items.map(x => x.amount), [3000, 1595, 1214]); assert.equal(r.total, 5809);
  assert.match(r.items[0].desc, /מקדמה/);
  const r2 = parseInvoiceRequest('היי תוכל בבקשה לשלוח לי היום חשבון עסקה לפי הפרטים הבאים\nסכום 27,310+ מע"מ\nהפקה אירוע ועידת הנוער הצפוני 2026\nלכבוד : יעדים לצפון\n580421626');
  assert.equal(r2.kind, 'חשבון עסקה'); assert.equal(r2.client, 'יעדים לצפון'); assert.equal(r2.taxId, '580421626'); assert.equal(r2.total, 27310);
  const r3 = parseInvoiceRequest('תוציא לי חשבונית ל weRisrael מקדמה עם משלחת פוז 10000 פלוס מעמ');
  assert.equal(r3.total, 10000);
  const c = parseCommand('תבקש מרועי חשבונית: קומיוניטי או, 580777894, 3,000 + מע"מ הפקה', docs, people);
  assert.equal(c.kind, 'invoice'); assert.equal(c.invoice.taxId, '580777894'); assert.equal(c.invoice.total, 3000);
  const txt = invoiceRequestText(r, { email: 'a@b.co' }, 'וירג׳יני');
  assert.match(txt, /^שלום רועי,\n\nצריך להוציא חשבונית:\n• לקוח: עמותת קומיוניטי או\n• ח\.פ\. \/ ע\.ר: 580777894\n• כתובת: עין ורד 1, תל אביב\n• לשלוח ל: a@b\.co\n• מקדמה עבור וירגיני הפקה: 3,000 ₪ \+ מע״מ/);
  assert.match(txt, /סה״כ לפני מע״מ: 5,809 ₪/);
});

test('a supplier quote: lines with prices, a markup, and the note to the supplier', () => {
  const q = parseSupplierQuote('הצעת מחיר - קייטרינג שקד\nארוחת בוקר 40 משתתפים 3,200 ₪\nארוחת צהריים בשרית 40 איש 6,000 + מע"מ\nשירות ומלצרים 1,500\nסה"כ 10,700 + מע"מ');
  assert.deepEqual(q.items.map(x => [x.item, x.cost, x.qty]), [['ארוחת בוקר', 3200, 40], ['ארוחת צהריים בשרית', 6000, 40], ['שירות ומלצרים', 1500, 1]]);
  assert.equal(q.total, 10700); assert.equal(q.sum, 10700);
  const lines = markupLines(q.items, 15, { id: 's2', name: 'קייטרינג שקד', type: 'קייטרינג ושפים' });
  assert.equal(lines[0].cost, 80); assert.equal(lines[0].qty, 40); assert.equal(lines[0].margin, 15); assert.equal(lines[2].cost, 1500); assert.equal(lines[0].supplier, 'קייטרינג שקד');
  const m = supplierMarkupMessage({ name: 'קייטרינג שקד', contact: 'רותם כהן' }, { kind: 'יום גיבוש', date: '2026-10-05' }, 12305, 'he', 'וירג׳יני');
  assert.match(m, /^היי רותם, תודה על ההצעה ליום גיבוש · 05\/10\/2026\./); assert.match(m, /12,305 ₪ לפני מע״מ/);
});

test('calls not answered yesterday, and handing a call to someone else', () => {
  const calls = [{ id: 'a', name: 'יוסי', status: 'noanswer', lastTry: '2026-09-25T10:00:00Z', attempts: 2, why: 'מחיר' }, { id: 'b', name: 'דנה', status: 'noanswer', lastTry: '2026-09-20T10:00:00Z' }, { id: 'c', name: 'רון', status: 'answered', lastTry: '2026-09-25T10:00:00Z' }];
  assert.deepEqual(unansweredSince(calls, '2026-09-25', '2026-09-26').map(c => c.id), ['a']);
  assert.match(delegateCallMessage(calls[0], 'נועה כהן', { kind: 'כנס', date: '2026-10-10' }, 'he', 'וירג׳יני'), /^היי נועה, תוכל\/י להתקשר ליוסי \(\)\?\nמה צריך: מחיר\nלגבי: כנס · 10\/10\/2026\nניסיתי 2 פעמים/);
});

test('"I got a quote from X" opens the supplier-quote flow with the supplier picked', () => {
  const people = [{ label: 'קייטרינג שקד', names: ['קייטרינג שקד', 'רותם'], about: 'supplier', id: 's2' }, { label: 'דנה לוי', names: ['דנה לוי'], about: 'client', id: 'c1' }];
  const c = parseCommand('קיבלתי הצעה מקייטרינג שקד בטלפון, קח את ההצעה', [], people);
  assert.equal(c.kind, 'supplierQuote'); assert.equal(c.supplier.id, 's2');
  assert.equal(parseCommand('J’ai reçu un devis de Shaked', [], people).kind, 'supplierQuote');
});

test('a free message to a person, and saving a phone by voice', () => {
  const people = [{ label: 'רועי · מנהל', names: ['רועי'], phone: '052-1112233', email: 'roy@b.co', about: 'team', id: 't1' }, { label: 'Marc Cohen', names: ['Marc Cohen'], email: 'marc@x.fr', about: 'client', id: 'c2' }];
  let c = parseCommand('שלחי הודעה לרועי: אני מגיעה ב-10', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.via, 'whatsapp'); assert.equal(c.to.phone, '052-1112233'); assert.equal(c.body, 'אני מגיעה ב-10');
  c = parseCommand('תגידי לרועי שאני מאחרת', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.body, 'אני מאחרת');
  c = parseCommand('envoie un mail à Marc Cohen : le devis est prêt', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.via, 'email'); assert.equal(c.to.email, 'marc@x.fr'); assert.equal(c.body, 'le devis est prêt');
  c = parseCommand('שלחי הודעה ל-052-5554444: מגיעה', [], people);
  assert.equal(c.to.phone, '052-5554444');
  c = parseCommand('שמרי את הטלפון של רועי 052-9998877', [], people);
  assert.equal(c.kind, 'contact'); assert.equal(c.to.id, 't1'); assert.equal(c.contact.phone, '052-9998877');
  c = parseCommand('המייל של דנה dana@x.co', [], people);
  assert.equal(c.kind, 'contact'); assert.equal(c.to, null); assert.equal(c.contact.name, 'דנה'); assert.equal(c.contact.email, 'dana@x.co');
  assert.equal(parseCommand('שלחי אישור ניהול חשבון לרועי', [{ id: 'd1', title: 'אישור ניהול חשבון בנק' }], people).kind, 'send');
});

test('action commands: quote, ask, open, call, task, note, lead, today', () => {
  const people = [{ label: 'ארגון שוב״ל · עידית', names: ['ארגון שוב״ל', 'עידית'], about: 'client', id: 'c1', phone: '050-1' }, { label: 'ביסקוטי · עינת', names: ['ביסקוטי', 'עינת'], about: 'supplier', id: 's1', phone: '050-2204686' }, { label: 'שירית כהן', names: ['שירית כהן'], about: 'team', id: 't1', phone: '050-3' }];
  let c = parseCommand('תבני לי הצעת מחיר לשוב״ל', [], people); assert.equal(c.kind, 'quote'); assert.equal(c.to.id, 'c1');
  c = parseCommand('build a quote for Shoval', [], people); assert.equal(c.kind, 'quote'); assert.equal(c.who, 'Shoval');
  c = parseCommand('תבקשי הצעות ממלונות לשוב״ל', [], people); assert.equal(c.kind, 'ask'); assert.equal(c.type, 'מלונות'); assert.equal(c.to.id, 'c1');
  c = parseCommand('תבקשי הצעות לשוב״ל', [], people); assert.equal(c.kind, 'ask'); assert.equal(c.to.id, 'c1'); assert.equal(c.type, '');
  c = parseCommand('תפתחי את הספק ביסקוטי', [], people); assert.equal(c.kind, 'open'); assert.equal(c.to.about, 'supplier');
  c = parseCommand('תתקשרי לביסקוטי', [], people); assert.equal(c.kind, 'call'); assert.equal(c.to.phone, '050-2204686');
  c = parseCommand('משימה לשירית כהן: לאסוף שלטים מהדפוס', [], people); assert.equal(c.kind, 'task'); assert.equal(c.to.id, 't1'); assert.equal(c.body, 'לאסוף שלטים מהדפוס');
  c = parseCommand('רשמי הערה על ביסקוטי: יקרים אבל שווים', [], people); assert.equal(c.kind, 'note'); assert.equal(c.to.id, 's1'); assert.equal(c.body, 'יקרים אבל שווים');
  c = parseCommand('פנייה חדשה: דנה לוי 052-1234567 יום גיבוש ל-40 בראש פינה', [], people); assert.equal(c.kind, 'lead'); assert.match(c.body, /^דנה לוי/);
  assert.equal(parseCommand('מה יש לי היום', [], people).kind, 'today');
  assert.equal(parseCommand('שלחי הודעה לשירית כהן: מגיעה', [], people).kind, 'message');
  assert.equal(parseCommand('תזכירי לי מחר ב-9 להתקשר לדנה', [], people).kind, 'reminder');
});

test('the message body starts after the recipient at a marker: "ask" makes a question, "say/write" strips the marker, a bare ש is grammar', () => {
  const people = [{ label: 'דנה לוי', names: ['דנה לוי', 'דנה'], phone: '0521111111', about: 'client' }];
  let c = parseCommand('שלח הודעת וואטסאפ לטלפון 0544974644 שאל מתי את מגיעה הביתה', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.to.phone, '054-4974644'); assert.equal(c.body, 'מתי את מגיעה הביתה?');
  assert.equal(parseCommand('שלחי וואטסאפ לדנה, ההודעה: מגיעה ב-10', [], people).body, 'מגיעה ב-10');
  assert.equal(parseCommand('שלחי וואטסאפ לדנה תכתבי אני מאחרת בעשר דקות', [], people).body, 'אני מאחרת בעשר דקות');
  assert.equal(parseCommand('שלחי הודעה לדנה תגידי לה שהאוטובוס יוצא בשמונה', [], people).body, 'האוטובוס יוצא בשמונה');
  assert.equal(parseCommand('שלחי הודעה לדנה שאלי אם היא בבית', [], people).body, 'האם היא בבית?');
  assert.equal(parseCommand('שלחי וואטסאפ לדנה שלום דנה מה שלומך', [], people).body, 'שלום דנה מה שלומך');
  assert.equal(parseCommand('send a message to Dana ask when she arrives', [], people).body, 'when she arrives?');
  assert.equal(parseCommand('envoie un message à Dana demande quand elle arrive', [], people).body, 'quand elle arrive?');
});

test('without any marker, everything after the number or the name is the message; a group is a group', () => {
  const people = [{ label: 'דנה לוי', names: ['דנה לוי', 'דנה'], phone: '0521111111', about: 'client' }];
  let c = parseCommand('שלח הודעה לטלפון 0544974644 בוואטסאפ זו היא בדיקה', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.to.phone, '054-4974644'); assert.equal(c.body, 'זו היא בדיקה');
  c = parseCommand('שלחי וואטסאפ לדנה זו בדיקה שנייה', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.to.name, 'דנה לוי'); assert.equal(c.body, 'זו בדיקה שנייה');
  c = parseCommand('send a whatsapp to 0544974644 this is a test', [], people);
  assert.equal(c.body, 'this is a test');
  c = parseCommand('שלחי וואטסאפ לקבוצת הצוות: הלו״ז נשלח במייל', [], people);
  assert.equal(c.kind, 'message'); assert.ok(c.to.group); assert.equal(c.to.name, 'הצוות'); assert.equal(c.body, 'הלו״ז נשלח במייל');
  c = parseCommand('send a whatsapp to the group of the team saying schedule sent', [], people);
  assert.ok(c.to.group); assert.equal(c.body, 'schedule sent');
  assert.equal(parseCommand('שלחי אישור ניהול חשבון ל-052-1234567', [{ id: 'd', title: 'אישור ניהול חשבון', aliases: [] }], people).kind, 'send');
});

test('the supplier behind a shared offer is guessed from a phone, a mail domain, or a name in the text', async () => {
  const { guessSupplier } = await import('../js/logic/commands.js');
  const sups = [{ id: 'a', name: 'מלון דניאל הרצליה (תמרס)', contact: 'ארבל גבילי', email: 'Arbel.Gvili@tamareshotels.co.il', phone: '' }, { id: 'b', name: 'ביסקוטי', contact: 'עינת', phone: '050-2204686' }, { id: 'c', name: 'גרשון טורס', contact: 'אורית', email: 'acc@gershon-tours.co.il' }];
  assert.equal(guessSupplier('היי, מצורפת הצעה. עינת 0502204686', sups).id, 'b');
  assert.equal(guessSupplier('From: Maggie.Levy@tamareshotels.co.il\n16 rooms 450 per night', sups).id, 'a');
  assert.equal(guessSupplier('שלום וירג׳יני, מדברת ארבל ממלון דניאל. הצעה ל-16 חדרים', sups).id, 'a');
  assert.equal(guessSupplier('הצעה לאוטובוס 19-24/11: 3,200 ליום, גרשון טורס', sups).id, 'c');
  assert.equal(guessSupplier('הצעה למלון 16 חדרים 450 שח', sups), null);
});

test('a phone in any grouping the speech engine produces is found, prettified, and the message follows it', () => {
  let c = parseCommand('שלחי לעצמי בוואטסאפ בטלפון 052-58708-38 תשאל האם הבדיקה עובדת', [], []);
  assert.equal(c.kind, 'message'); assert.equal(c.to.phone, '052-5870838'); assert.equal(c.body, 'האם הבדיקה עובדת?');
  c = parseCommand('שלחי הודעה ל-052 587 0838 מגיעה ב-10', [], []);
  assert.equal(c.to.phone, '052-5870838'); assert.equal(c.body, 'מגיעה ב-10');
  c = parseCommand('send a whatsapp to +972-52-587-0838 hello there', [], []);
  assert.equal(c.to.phone, '052-5870838'); assert.equal(c.body, 'hello there');
  assert.equal(parseCommand('תגידי לדנה שאני מאחרת', [], [{ label: 'דנה', names: ['דנה'], about: 'client' }]).phoneFound, '');
});

test('a name plus a number she read: the number is used as is, and remembered for that person', () => {
  const people = [{ label: 'דנה לוי', names: ['דנה לוי', 'דנה'], phone: '', about: 'client', id: 'k1' }, { label: 'רועי נאור', names: ['רועי'], phone: '052-1111111', about: 'team', id: 't1' }];
  let c = parseCommand('שלחי וואטסאפ לדנה 052-58708-38 שלום דנה', [], people);
  assert.equal(c.kind, 'message'); assert.equal(c.to.phone, '052-5870838'); assert.equal(c.to.name, 'דנה לוי'); assert.equal(c.to.newPhone, true); assert.equal(c.body, 'שלום דנה');
  c = parseCommand('שלחי וואטסאפ לרועי 052-58708-38 שלום', [], people);
  assert.equal(c.to.phone, '052-5870838'); assert.equal(c.to.name, 'רועי נאור'); assert.ok(!c.to.newPhone);
  c = parseCommand('שלחי וואטסאפ למוטי 052-58708-38 שלום מוטי', [], people);
  assert.equal(c.to.phone, '052-5870838'); assert.ok(!c.to.name);
});

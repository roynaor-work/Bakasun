import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMail, cleanMail, parseAddress, takeDates, takeHours, takeOrg, takeKind, takeBudget, matchMailClient, summaryText, missingOf, cleanSubject } from '../js/logic/mailImport.js';

const PLACES = [['הרצליה', 'Herzliya'], ['ראש פינה', 'Rosh Pinna'], ['תל אביב', 'Tel Aviv'], ['ירושלים', 'Jerusalem'], ['מצפה רמון', 'Mitzpe Ramon'], ['חריש', 'Harish'], ['קיסריה', 'Caesarea'], ['בנימינה', 'Binyamina']];
const CLIENTS = [
  { id: 'c1', name: 'ארגון שוב״ל', aliases: 'שובל, שוב״ל, Shoval', contact: 'עידית פודולר ראובני', email: 'idit@shoval-net.org', notes: 'אנשי קשר נוספים: צופיה אורן; tzofia@shoval-net.org', lang: 'he' },
  { id: 'c2', name: 'Bertelsmann Stiftung', aliases: 'ברטלסמן, GIYLE', contact: 'Claudia Baum-Jaumann', email: 'claudia.baum-jaumann@bertelsmann-stiftung.de', lang: 'en' },
  { id: 'c3', name: 'עיריית חריש', contact: 'אורלי רמות', email: 'orlyramot15@gmail.com', lang: 'he' },
  { id: 'c4', name: 'WeRIsrael', aliases: 'וי אר ישראל', contact: 'Tamar Adler-Furman', email: 'tamar@werisrael.com', phone: '050-885-5015', lang: 'he' }
];
const today = '2026-10-01';
const opts = { clients: CLIENTS, places: PLACES, today };

test('Hebrew Gmail reply with headers, signature and a quoted thread: client matched by the e-mail in her card notes', () => {
  const p = parseMail(`מאת: צופיה אורן <tzofia@shoval-net.org>
נושא: Re: סמינר צוות אוקטובר
תאריך: 28 בספטמבר 2026

היי וירג'יני מה שלומך?
אנחנו רוצים לקיים סמינר צוות ב-19-20/10/2026 עם לינה, בערך 18 משתתפים, 16 חדרי סינגל חצי פנסיון.
צריך אולם עם מסך ומקרן ומיניבוס מתל אביב. התקציב בסביבות 40,000 ש"ח.
המטרה: גיבוש הצוות החדש.
תודה רבה,
צופיה
050-1234567

בתאריך יום ב׳, 21 בספט׳ 2026 ב-10:15 מאת וירג'יני <info.virpro@gmail.com> כתב/ה:
> היי צופיה, מה עם התאריכים? יש תקציב של 100,000 ש"ח?
> וירג'יני`, opts);
  assert.equal(p.name, 'צופיה אורן'); assert.equal(p.email, 'tzofia@shoval-net.org'); assert.equal(p.phone, '050-1234567');
  assert.equal(p.clientId, 'c1'); assert.equal(p.client, 'ארגון שוב״ל'); assert.equal(p.clientBy, 'email');
  assert.equal(p.subject, 'סמינר צוות אוקטובר'); assert.equal(p.mailDate, '2026-09-28');
  assert.equal(p.kind, 'יום גיבוש'); assert.equal(p.date, '2026-10-19'); assert.equal(p.dateEnd, '2026-10-20'); assert.equal(p.days, '2');
  assert.equal(p.participants, '18'); assert.equal(p.rooms, '16'); assert.equal(p.budget, '40,000 ₪'); assert.equal(p.purpose, 'גיבוש הצוות החדש');
  assert.deepEqual(p.needs, ['מלונות', 'הסעות', 'מקום לאירוע', 'הגברה ותאורה']);
  assert.equal(p.lang, 'he'); assert.equal(p.hadQuote, true);
  assert.ok(!p.body.includes('100,000'), 'the quoted budget must not leak into the reading');
  assert.deepEqual(p.missing, ['place']);
});

test('Hebrew mail from an unknown company: organisation, hours, region, budget in thousands, signature phone', () => {
  const p = parseMail(`From: Dana Cohen <dana@alpha-tech.co.il>
Subject: בקשה להצעת מחיר - יום גיבוש
Date: Mon, 28 Sep 2026 09:12:00 +0300
To: info.virpro@gmail.com

שלום,
שמי דנה מחברת אלפא טכנולוגיות בע"מ ואנחנו מתכננים יום גיבוש לעובדים ב-15 בנובמבר באזור הרצליה.
מדובר בכ-120 איש, בין השעות 9 ל-17. התקציב עד 60 אלף ש"ח.
נשמח לקבל הצעה שכוללת פעילות, ארוחת צהריים והסעות מתל אביב.
בברכה,
דנה כהן
מנהלת משאבי אנוש
אלפא טכנולוגיות בע"מ
03-6543210`, opts);
  assert.equal(p.name, 'Dana Cohen'); assert.equal(p.phone, '03-6543210'); assert.equal(p.email, 'dana@alpha-tech.co.il');
  assert.equal(p.org, 'חברת אלפא טכנולוגיות בע"מ'); assert.equal(p.clientId, ''); assert.equal(p.client, p.org);
  assert.equal(p.kind, 'יום גיבוש'); assert.equal(p.date, '2026-11-15'); assert.equal(p.participants, '120'); assert.equal(p.place, 'הרצליה');
  assert.equal(p.hours, '09:00-17:00'); assert.equal(p.budget, '60,000 ₪'); assert.equal(p.mailDate, '2026-09-28');
  assert.deepEqual(p.needs, ['הסעות', 'קייטרינג ושפים', 'פעילות וסיורים']);
  assert.deepEqual(p.missing, []);
});

test('French mail: date range "du 3 au 5 mars", "une quarantaine", "25 000 €", "de 9h à 17h30", accents in the place, quoted "a écrit"', () => {
  const p = parseMail(`De : Marie Dupont <marie.dupont@fondation-lumiere.fr>
Objet : Séminaire à Jérusalem
Date : 29 septembre 2026

Bonjour Virginie,
Je vous écris de la part de la Fondation Lumière. Nous souhaitons organiser un séminaire du 3 au 5 mars 2027 à Jérusalem pour une quarantaine de personnes, avec hébergement en hôtel et un dîner le premier soir.
Le budget est d'environ 25 000 € hors transport. Les journées se dérouleraient de 9h à 17h30.
Dans le cadre de notre programme d'échanges franco-israélien.
Bien cordialement,
Marie Dupont
Chargée de projets
Fondation Lumière
+33 6 12 34 56 78

Le lun. 28 sept. 2026 à 11:02, Virginie <info.virpro@gmail.com> a écrit :
> Bonjour Marie, merci pour votre message. 80 personnes ?`, opts);
  assert.equal(p.lang, 'fr'); assert.equal(p.name, 'Marie Dupont'); assert.equal(p.phone, '+33612345678');
  assert.equal(p.org, 'Fondation Lumière'); assert.equal(p.kind, 'יום גיבוש');
  assert.equal(p.date, '2027-03-03'); assert.equal(p.dateEnd, '2027-03-05'); assert.equal(p.days, '3');
  assert.equal(p.participants, '40'); assert.equal(p.budget, '25,000 €'); assert.equal(p.hours, '09:00-17:30'); assert.equal(p.place, 'ירושלים');
  assert.equal(p.purpose, "notre programme d'échanges franco-israélien");
  assert.ok(p.needs.includes('מלונות') && p.needs.includes('קייטרינג ושפים'));
  assert.equal(p.hadQuote, true); assert.deepEqual(p.missing, []);
});

test('English forwarded Gmail thread: client by e-mail domain, "November 19 and leaving November 24", "at 7pm", € budget', () => {
  const p = parseMail(`---------- Forwarded message ---------
From: Stefanie Schulz <stefanie.schulz@bertelsmann-stiftung.de>
Date: Tue, Sep 29, 2026 at 4:05 PM
Subject: Re: GIYLE Israel module November
To: Virginie <info.virpro@gmail.com>

Hi Virginie, hope you are doing well!
Quick update on the delegation: we will be 24 participants, arriving November 19 and leaving November 24, 2026. We need hotels in Tel Aviv for the whole stay, a bus, and a dinner on the 19th at 7pm.
Our budget for the dinner is about 4,000 € in total.
Thanks a lot,
Stefanie

On Mon, Sep 28, 2026 at 10:15 AM Virginie <info.virpro@gmail.com> wrote:
> Hi Stefanie, do you already know the number of participants?`, opts);
  assert.equal(p.clientId, 'c2'); assert.equal(p.clientBy, 'domain'); assert.equal(p.org, 'Bertelsmann Stiftung');
  assert.equal(p.name, 'Stefanie Schulz'); assert.equal(p.subject, 'GIYLE Israel module November'); assert.equal(p.mailDate, '2026-09-29');
  assert.equal(p.kind, 'משלחת או סיור'); assert.equal(p.date, '2026-11-19'); assert.equal(p.dateEnd, '2026-11-24'); assert.equal(p.days, '6');
  assert.equal(p.participants, '24'); assert.equal(p.place, 'תל אביב'); assert.equal(p.budget, '4,000 €'); assert.equal(p.hours, '19:00'); assert.equal(p.lang, 'en');
  assert.deepEqual(p.needs, ['מלונות', 'הסעות', 'קייטרינג ושפים']);
});

test('English mail without headers: name and company from the first line, "50k NIS", signature with a UK number', () => {
  const p = parseMail(`Hello, I'm John Smith from Globex Ltd and we are looking to organise a company evening for about 80 people on 12/12/2026 in Caesarea. Budget around 50k NIS. We would need catering, a DJ and name tags.
Best regards,
John Smith
Office Manager | Globex Ltd
+44 7700 900123`, opts);
  assert.equal(p.name, 'John Smith'); assert.equal(p.org, 'Globex Ltd'); assert.equal(p.phone, '+447700900123'); assert.equal(p.email, '');
  assert.equal(p.kind, 'אירוע חברה'); assert.equal(p.kindWord, 'company evening'); assert.equal(p.date, '2026-12-12'); assert.equal(p.participants, '80');
  assert.equal(p.place, 'קיסריה'); assert.equal(p.budget, '50,000 ₪');
  assert.deepEqual(p.needs, ['קייטרינג ושפים', 'דפוס ומיתוג', 'תקליטנים ולהקות']);
  assert.deepEqual(p.missing, ['purpose']);
});

test('WhatsApp message in Hebrew, no headers: the name after "זאת", a conference, "3.2" next year, no contact details', () => {
  const p = parseMail(`היי היי וירג'יני, זאת אורלי מהעירייה. רוצים לעשות כנס לעובדי העירייה ב-3.2 בחריש, כ-250 משתתפים, צריך הגברה ותאורה וכיבוד. תקציב עוד לא ידוע.`, opts);
  assert.equal(p.name, 'אורלי'); assert.equal(p.kind, 'כנס'); assert.equal(p.date, '2027-02-03'); assert.equal(p.participants, '250'); assert.equal(p.place, 'חריש');
  assert.deepEqual(p.needs, ['קייטרינג ושפים', 'הגברה ותאורה']);
  assert.deepEqual(p.missing, ['client', 'budget', 'purpose', 'contact']);
  assert.equal(p.hadQuote, false);
});

test('Outlook-style reply: the "From: / Sent: / To:" block after the body is the previous mail; the client by the contact name fills e-mail and phone', () => {
  const p = parseMail(`From: Tamar Adler-Furman
Sent: Monday, September 28, 2026 2:10 PM
To: info.virpro@gmail.com
Subject: J50 delegation - printing

Hi Virginie,
For the J50 delegation (Nov 2-6) we need 60 branded notebooks, pens and name tags. Could you send a quote?
Thanks,
Tamar

From: Virginie <info.virpro@gmail.com>
Sent: Sunday, September 27, 2026 9:00 AM
To: Tamar Adler-Furman
Subject: J50 delegation
Hi Tamar, sure. 300 people?`, opts);
  assert.equal(p.clientId, 'c4'); assert.equal(p.clientBy, 'contact'); assert.equal(p.email, 'tamar@werisrael.com'); assert.equal(p.phone, '050-885-5015');
  assert.equal(p.date, '2026-11-02'); assert.equal(p.dateEnd, '2026-11-06'); assert.equal(p.participants, '');
  assert.deepEqual(p.needs, ['דפוס ומיתוג']); assert.equal(p.hadQuote, true);
  assert.ok(!p.body.includes('300 people'));
});

test('a known client named in the body with an alias, and a Hebrew date range with month name', () => {
  const p = parseMail(`שלום וירג'יני, מדברת גאיה משובל. אנחנו מתכננים מפגש כפר ב-18 עד 19 באוקטובר בגן שפיים לכ-100 איש. צריך קייטרינג וצלם.
תודה, גאיה`, opts);
  assert.equal(p.clientId, 'c1'); assert.equal(p.clientBy, 'name'); assert.equal(p.name, 'גאיה');
  assert.equal(p.date, '2026-10-18'); assert.equal(p.dateEnd, '2026-10-19'); assert.equal(p.participants, '100');
  assert.equal(p.venue, 'גן שפיים'); assert.equal(p.place, 'גן שפיים');
  assert.ok(p.needs.includes('קייטרינג ושפים') && p.needs.includes('צילום ווידאו'));
});

test('cleanMail: headers, "-- " signature separator, "Sent from my iPhone", two-line "On ... wrote:"', () => {
  const c = cleanMail(`Subject: Workshop
From: Lea <lea@example.com>

Hi, we want a workshop in May.
--
Lea Levi
Sent from my iPhone
On Tue, 29 Sep 2026 at 09:00, Virginie
wrote:
> earlier text`);
  assert.equal(c.headers.from, 'Lea <lea@example.com>'); assert.equal(c.headers.subject, 'Workshop');
  assert.equal(c.body, 'Hi, we want a workshop in May.'); assert.equal(c.signature, 'Lea Levi'); assert.equal(c.hadQuote, true);
  assert.ok(!c.body.includes('iPhone') && !c.signature.includes('iPhone'));
  const h = cleanMail('-----הודעה מקורית-----\nמאת: x\nנושא: y\n\nגוף');
  assert.equal(h.headers.from, 'x'); assert.equal(h.body, 'גוף');
});

test('parseAddress and cleanSubject', () => {
  assert.deepEqual(parseAddress('"Cohen, Dana" <Dana@Alpha.co.il>'), { name: 'Dana Cohen', email: 'dana@alpha.co.il' });
  assert.deepEqual(parseAddress('dana@alpha.co.il'), { name: '', email: 'dana@alpha.co.il' });
  assert.deepEqual(parseAddress('צופיה אורן'), { name: 'צופיה אורן', email: '' });
  assert.equal(cleanSubject('Re: Fwd: TR: Séminaire'), 'Séminaire'); assert.equal(cleanSubject('תגובה: כנס'), 'כנס'); assert.equal(cleanSubject('(no subject)'), '');
});

test('takeDates: the range forms of the three languages, and phones are not dates', () => {
  assert.deepEqual(takeDates('19-24/11', today), { date: '2026-11-19', dateEnd: '2026-11-24', dateText: '19-24/11', days: 6 });
  assert.deepEqual(takeDates('מ-19 עד 24 בנובמבר', today), { date: '2026-11-19', dateEnd: '2026-11-24', dateText: '19 עד 24 בנובמבר', days: 6 });
  assert.equal(takeDates('November 19-24, 2027', today).dateEnd, '2027-11-24');
  assert.equal(takeDates('du 19 au 24 novembre 2026', today).days, 6);
  assert.deepEqual([takeDates('19.11.26', today).date, takeDates('19.11.26', today).dateEnd], ['2026-11-19', '']);
  assert.equal(takeDates('2026-11-19 to 2026-11-21', today).days, 3);
  assert.equal(takeDates('on the 2nd of March', today).date, '2027-03-02');
  assert.equal(takeDates('my number is 050-1234567', today).date, '');
  assert.equal(takeDates('19 October - 2 November', today).dateEnd, '2026-11-02');
});

test('takeHours: ranges and single times, dates are not hours', () => {
  assert.equal(takeHours('from 10am to 4pm'), '10:00-16:00');
  assert.equal(takeHours('בין השעות 9 ל-17.'), '09:00-17:00');
  assert.equal(takeHours('de 9h à 17h30'), '09:00-17:30');
  assert.equal(takeHours('09:00 עד 16:30'), '09:00-16:30');
  assert.equal(takeHours('בשעה 18:30'), '18:30');
  assert.equal(takeHours('at 7pm.'), '19:00');
  assert.equal(takeHours('from 19 to 24 November, 24 people'), '');
  assert.equal(takeHours('between 20 and 25k'), '');
});

test('takeOrg: Hebrew prefixes, English "on behalf of", signature lines, e-mail domain as a last guess', () => {
  assert.equal(takeOrg('אני מעמותת מעוז ואנחנו רוצים אופסייט', '', ''), 'עמותת מעוז');
  assert.equal(takeOrg('מטעם עיריית חריש, מחלקת חינוך', '', ''), 'עיריית חריש');
  assert.equal(takeOrg('I am writing on behalf of the Jewish Agency to ask about a seminar.', '', ''), 'Jewish Agency');
  assert.equal(takeOrg('Hi there', 'Dana Cohen\nHR Manager\nAlpha Tech Ltd\n03-1234567', 'dana@gmail.com'), 'Alpha Tech Ltd');
  assert.equal(takeOrg('Hi there', 'Dana Cohen\n03-1234567', 'dana@alpha-tech.co.il'), 'Alpha-tech');
  assert.equal(takeOrg('Hi there', 'Dana Cohen', 'dana@gmail.com'), '');
});

test('takeKind and takeBudget', () => {
  assert.equal(takeKind('nous organisons une conférence annuelle').kind, 'כנס');
  assert.equal(takeKind('סדנת יצירה לצוות').kind, 'יום גיבוש');
  assert.equal(takeKind('ערב הוקרה לעובדים').kind, 'אירוע חברה');
  assert.equal(takeKind('un dîner de gala').kind, 'אירוע חברה');
  assert.equal(takeKind('just a question').kind, '');
  assert.equal(takeBudget('budget de 20 000 €'), '20,000 €');
  assert.equal(takeBudget('40,000 NIS'), '40,000 ₪');
  assert.equal(takeBudget('around $12,500'), '12,500 $');
  assert.equal(takeBudget('תקציב של 35 אלף'), '35,000 ₪');
  assert.equal(takeBudget('200 people'), '');
});

test('matchMailClient: e-mail, domain, alias in the text, contact name; generic domains never match by domain', () => {
  assert.equal(matchMailClient({ email: 'idit@shoval-net.org' }, CLIENTS).by, 'email');
  assert.equal(matchMailClient({ email: 'someone@shoval-net.org' }, CLIENTS).client.id, 'c1');
  assert.equal(matchMailClient({ email: 'new@gmail.com', text: 'מברטלסמן' }, CLIENTS).client.id, 'c2');
  assert.equal(matchMailClient({ email: 'x@gmail.com', name: 'אורלי רמות' }, CLIENTS).by, 'contact');
  assert.equal(matchMailClient({ email: 'x@gmail.com', text: 'hello', name: 'Nobody' }, CLIENTS), null);
  assert.equal(matchMailClient({ phone: '+972508855015' }, CLIENTS).client.id, 'c4');
});

test('missingOf and summaryText', () => {
  const p = parseMail('From: a@gmail.com\n\nhi', opts);
  assert.deepEqual(p.missing, ['client', 'date', 'participants', 'budget', 'place', 'kind', 'purpose']);
  const s = summaryText({ client: 'Globex', name: 'John', phone: '052-1111111', email: 'j@globex.com', kind: 'כנס', date: '2026-12-12', dateEnd: '2026-12-13', participants: '80', place: 'קיסריה', budget: '50,000 ₪', hours: '09:00-17:00', purpose: 'סוף שנה', needs: ['קייטרינג ושפים'], days: '2' });
  assert.equal(s, 'לקוח: Globex\nאיש קשר: John · 052-1111111 · j@globex.com\nסוג: כנס\nתאריך: 12/12/2026 - 13/12/2026\nשעות: 09:00-17:00\nמשתתפים: 80\nמקום: קיסריה\nתקציב: 50,000 ₪\nימים: 2\nמטרה: סוף שנה\nספקים נדרשים: קייטרינג ושפים');
  assert.equal(summaryText({ client: 'X' }, { client: 'Client' }), 'Client: X');
  assert.deepEqual(missingOf({ client: 'X', email: 'a@b.c', date: '2026-01-01', participants: '5', budget: '1', place: 'p', kind: 'k', purpose: 'q' }), []);
});

test('with the official places list: "באזור הרצליה" is Herzliya, not the town called אזור; "à Jérusalem" and "in the Negev"', async () => {
  const { PLACES: ALL } = await import('../js/data/places.js');
  assert.equal(parseMail('רוצים יום גיבוש באזור הרצליה ל-50 איש', { places: ALL, today }).place, 'הרצליה');
  assert.equal(parseMail('un séminaire à Jérusalem pour 30 personnes', { places: ALL, today }).place, 'ירושלים');
  assert.equal(parseMail('a retreat in the Negev for 30 people', { places: ALL, today }).place, 'נגב');
});

test('nothing in the module holds Arabic letters', async () => {
  const fs = await import('node:fs');
  for (const f of ['js/logic/mailImport.js', 'js/screens/importMail.js', 'js/i18n/importmail.js', 'css/importmail.css']) {
    const txt = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(txt), f);
  }
});

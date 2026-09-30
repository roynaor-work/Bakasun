import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction2, whoOf, statusWord } from '../js/logic/questions2.js';
import { parseAction } from '../js/logic/questions.js';
import { parseMissing } from '../js/logic/openItems.js';
import { parseGoto } from '../js/logic/nav.js';

const P = s => parseAction2(s);

test('the event name is read after של / ל / for / pour', () => {
  assert.deepEqual(whoOf('של שוב״ל'), { who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(whoOf('לשוב״ל?'), { who: 'לשוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(whoOf('באירוע שוב״ל'), { who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(whoOf('בברטלסמן'), { who: 'בברטלסמן', alt: 'ברטלסמן' });
  // a name that itself starts with ב/ל: the caller tries `who` first, so nothing is lost
  assert.deepEqual(whoOf('של ברטלסמן'), { who: 'ברטלסמן', alt: 'רטלסמן' });
  assert.deepEqual(whoOf('for the event of Shoval'), { who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(whoOf('de Shoval'), { who: 'Shoval', alt: 'Shoval' });
});

test('participants: add, how many confirmed, who has not, hotel list', () => {
  assert.deepEqual(P('הוסיפי משתתף לשוב״ל: דנה כהן 052-1234567 צמחונית'), { kind: 'partAdd', who: 'שוב״ל', alt: 'שוב״ל', text: 'דנה כהן 052-1234567 צמחונית' });
  assert.equal(P('תוסיפי משתתפים לברטלסמן:\nדנה כהן\nיוסי לוי').text, 'דנה כהן\nיוסי לוי');
  assert.deepEqual(P('add a participant to Shoval: Dana Cohen 052-1234567 vegetarian'), { kind: 'partAdd', who: 'Shoval', alt: 'Shoval', text: 'Dana Cohen 052-1234567 vegetarian' });
  assert.deepEqual(P('ajoute un participant à Shoval : Dana Cohen 052-1234567 végétarienne'), { kind: 'partAdd', who: 'Shoval', alt: 'Shoval', text: 'Dana Cohen 052-1234567 végétarienne' });
  assert.deepEqual(P('כמה אישרו הגעה לשוב״ל'), { kind: 'rsvpCount', who: 'לשוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('כמה מגיעים לשוב״ל?'), { kind: 'rsvpCount', who: 'לשוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('how many confirmed for Shoval'), { kind: 'rsvpCount', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('combien ont confirmé pour Shoval ?'), { kind: 'rsvpCount', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('מי עוד לא אישר הגעה לשוב״ל'), { kind: 'rsvpMissing', who: 'לשוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P("who hasn't confirmed for Shoval"), { kind: 'rsvpMissing', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('qui n’a pas encore confirmé pour Shoval'), { kind: 'rsvpMissing', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('רשימה למלון של שוב״ל'), { kind: 'hotelList', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('תכיני את הרשימה למלון של שוב״ל'), { kind: 'hotelList', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('rooming list for Shoval'), { kind: 'hotelList', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('liste pour l’hôtel de Shoval'), { kind: 'hotelList', who: 'Shoval', alt: 'Shoval' });
  // the old questions keep their old answers
  assert.equal(P('כמה משתתפים יש לברטלסמן'), null);
  assert.equal(P('מי לא ענה'), null);
  assert.equal(parseAction('מי לא ענה', '2026-09-30').kind, 'waiting');
});

test('budget: profit, supplier cost, payment schedule, open', () => {
  assert.deepEqual(P('מה הרווח באירוע שוב״ל'), { kind: 'budgetProfit', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('מה הרווח של שוב״ל?'), { kind: 'budgetProfit', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('what is the margin of Shoval'), { kind: 'budgetProfit', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('quelle est la marge de Shoval'), { kind: 'budgetProfit', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('כמה עולים לנו הספקים בברטלסמן'), { kind: 'budgetCost', who: 'בברטלסמן', alt: 'ברטלסמן' });
  assert.deepEqual(P('how much do the suppliers cost for Bertelsmann'), { kind: 'budgetCost', who: 'Bertelsmann', alt: 'Bertelsmann' });
  assert.deepEqual(P('combien coûtent les fournisseurs pour Bertelsmann'), { kind: 'budgetCost', who: 'Bertelsmann', alt: 'Bertelsmann' });
  assert.deepEqual(P('מה לוח התשלומים של שוב״ל'), { kind: 'budgetSchedule', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('what is the payment schedule for Shoval'), { kind: 'budgetSchedule', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('quel est l’échéancier de Shoval'), { kind: 'budgetSchedule', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('כמה פתוח לתשלום בשוב״ל'), { kind: 'budgetOpen', who: 'בשוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('how much is still open for Shoval'), { kind: 'budgetOpen', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('combien reste à payer pour Shoval'), { kind: 'budgetOpen', who: 'Shoval', alt: 'Shoval' });
  assert.equal(P('מה התקציב של שוב״ל'), null);
  assert.equal(parseAction('מה התקציב של שוב״ל', '2026-09-30').kind, 'field');
  assert.equal(P('מה פתוח באירוע של ברטלסמן'), null);
  assert.equal(parseMissing('מה פתוח באירוע של ברטלסמן').who, 'ברטלסמן');
});

test('run of show: now, next, call sheet, day-of mode', () => {
  assert.deepEqual(P('מה עכשיו בלו״ז'), { kind: 'rsNow' });
  assert.deepEqual(P('מה עכשיו בלו"ז?'), { kind: 'rsNow' });
  assert.deepEqual(P("what's on now"), { kind: 'rsNow' });
  assert.deepEqual(P('qu’est-ce qu’il y a maintenant au programme'), { kind: 'rsNow' });
  assert.deepEqual(P('מה הבא בלו״ז'), { kind: 'rsNext' });
  assert.deepEqual(P("what's next on the run sheet"), { kind: 'rsNext' });
  assert.deepEqual(P('et après ?'.replace('et ', '')), { kind: 'rsNext' });
  const c = P('דף קריאה לגרשון טורס לשוב״ל');
  assert.equal(c.kind, 'callSheet'); assert.equal(c.who, 'גרשון טורס'); assert.equal(c.event, 'שוב״ל'); assert.equal(c.raw, 'גרשון טורס לשוב״ל');
  const c2 = P('תכיני דף קריאה לדנה');
  assert.equal(c2.who, 'דנה'); assert.equal(c2.event, undefined);
  const c3 = P('call sheet for Gershon Tours for Shoval');
  assert.equal(c3.who, 'Gershon Tours'); assert.equal(c3.event, 'Shoval');
  const c4 = P('feuille de route pour Gershon Tours pour Shoval');
  assert.equal(c4.who, 'Gershon Tours'); assert.equal(c4.event, 'Shoval');
  assert.deepEqual(P('עברי למצב יום האירוע'), { kind: 'live' });
  assert.deepEqual(P('מצב יום האירוע של שוב״ל'), { kind: 'live', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('go to day-of mode'), { kind: 'live' });
  assert.deepEqual(P('passe en mode jour J'), { kind: 'live' });
  assert.equal(parseGoto('עברי למצב יום האירוע'), null);
  assert.equal(parseGoto('עברי לספקים'), 'suppliers');
  assert.equal(P('עברי לספקים'), null);
  assert.equal(P('מה הלו״ז'), null);
});

test('files: what is missing, where is a document', () => {
  assert.deepEqual(P('מה חסר במסמכים של שוב״ל'), { kind: 'docsMissing', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('אילו מסמכים חסרים לשוב״ל'), { kind: 'docsMissing', who: 'לשוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('which documents are missing for Shoval'), { kind: 'docsMissing', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('quels documents manquent pour Shoval'), { kind: 'docsMissing', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('איפה התפריט של שוב״ל'), { kind: 'fileFind', what: 'תפריט', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('איפה החוזה של ברטלסמן?'), { kind: 'fileFind', what: 'חוזה', who: 'ברטלסמן', alt: 'רטלסמן' });
  assert.deepEqual(P('where is the menu of Shoval'), { kind: 'fileFind', what: 'menu', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('où est le menu de Shoval'), { kind: 'fileFind', what: 'menu', who: 'Shoval', alt: 'Shoval' });
  assert.equal(P('מה חסר לי לשוב״ל'), null);
  assert.equal(parseMissing('מה חסר לי לשוב״ל').alt, 'שוב״ל');
  assert.equal(P('תפתחי את התיק של שוב״ל'), null);
});

test('contracts: what is missing, is it signed', () => {
  assert.deepEqual(P('מה חסר לחוזה של שוב״ל'), { kind: 'contractMissing', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P("what's missing for the contract of Shoval"), { kind: 'contractMissing', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('que manque-t-il au contrat de Shoval'), { kind: 'contractMissing', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('האם החוזה של שוב״ל חתום?'), { kind: 'contractSigned', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('החוזה של שוב״ל נחתם'), { kind: 'contractSigned', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('is the contract of Shoval signed'), { kind: 'contractSigned', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('le contrat de Shoval est-il signé ?'), { kind: 'contractSigned', who: 'Shoval', alt: 'Shoval' });
  assert.equal(P('מה חסר לי מהספקים של שוב״ל'), null);
});

test('checklists: what is left, what is due this week', () => {
  assert.deepEqual(P('מה נשאר ברשימת התיוג של שוב״ל'), { kind: 'checklistLeft', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('מה נשאר ברשימה של שוב״ל'), { kind: 'checklistLeft', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P("what's left on the checklist of Shoval"), { kind: 'checklistLeft', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('que reste-t-il sur la check-list de Shoval'), { kind: 'checklistLeft', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('מה לשבוע הקרוב ברשימה של ברטלסמן'), { kind: 'checklistWeek', who: 'ברטלסמן', alt: 'רטלסמן' });
  assert.deepEqual(P("what's due this week on the checklist of Bertelsmann"), { kind: 'checklistWeek', who: 'Bertelsmann', alt: 'Bertelsmann' });
  assert.deepEqual(P('qu’est-ce qu’il y a cette semaine sur la liste de Bertelsmann'), { kind: 'checklistWeek', who: 'Bertelsmann', alt: 'Bertelsmann' });
  assert.equal(P('מה נשאר לי לשוב״ל'), null);
});

test('reminders: list, urgent, mark as read', () => {
  assert.deepEqual(P('מה התזכורות שלי'), { kind: 'reminders' });
  assert.deepEqual(P('what are my reminders'), { kind: 'reminders' });
  assert.deepEqual(P('quels sont mes rappels ?'), { kind: 'reminders' });
  assert.deepEqual(P('מה דחוף'), { kind: 'urgent' });
  assert.deepEqual(P("what's urgent"), { kind: 'urgent' });
  assert.deepEqual(P('qu’est-ce qui est urgent'), { kind: 'urgent' });
  assert.deepEqual(P('סמני את התזכורות כנקראו'), { kind: 'remindersRead' });
  assert.deepEqual(P('mark the reminders as read'), { kind: 'remindersRead' });
  assert.deepEqual(P('marque les rappels comme lus'), { kind: 'remindersRead' });
  assert.equal(P('תזכירי לי מחר ב-9 להתקשר לדנה'), null);
  assert.equal(P('סמני שהסיור בוצע'), null);
});

test('event board: move a case, the lead is won or lost', () => {
  assert.deepEqual(P('העבירי את שוב״ל לנסגר'), { kind: 'caseMove', who: 'שוב״ל', alt: 'שוב״ל', status: 'נסגר' });
  assert.deepEqual(P('הפנייה של שוב״ל נסגרה'), { kind: 'caseMove', who: 'שוב״ל', alt: 'שוב״ל', status: 'נסגר' });
  assert.deepEqual(P('הפנייה של ברטלסמן ירדה'), { kind: 'caseMove', who: 'ברטלסמן', alt: 'רטלסמן', status: 'ירד' });
  assert.deepEqual(P('תעבירי את התיק של שוב״ל להצעה נשלחה'), { kind: 'caseMove', who: 'שוב״ל', alt: 'שוב״ל', status: 'הצעה נשלחה' });
  assert.deepEqual(P('move Shoval to won'), { kind: 'caseMove', who: 'Shoval', alt: 'Shoval', status: 'נסגר' });
  assert.deepEqual(P('the lead of Shoval is lost'), { kind: 'caseMove', who: 'Shoval', alt: 'Shoval', status: 'ירד' });
  assert.deepEqual(P('passe Shoval en gagné'), { kind: 'caseMove', who: 'Shoval', alt: 'Shoval', status: 'נסגר' });
  assert.deepEqual(P('le dossier de Shoval est perdu'), { kind: 'caseMove', who: 'Shoval', alt: 'Shoval', status: 'ירד' });
  assert.equal(statusWord('Won'), 'נסגר');
  // suppliers and tasks stay where they were
  assert.equal(P('סגרי עם מלון דניאל'), null);
  assert.equal(P('מלון דניאל נבחר'), null);
  assert.equal(P('דחי את המשימה של הסיור ליום חמישי'), null);
  assert.equal(parseAction('העבירי את המשימה של הסיור ליום חמישי', '2026-09-30').kind, 'snooze');
});

test('history: what changed today / recently, with or without an event', () => {
  assert.deepEqual(P('מה השתנה היום בשוב״ל'), { kind: 'history', when: 'today', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('מה השתנה לאחרונה'), { kind: 'history', when: 'recent', who: '', alt: '' });
  assert.deepEqual(P('מה השתנה בשוב״ל השבוע?'), { kind: 'history', when: 'week', who: 'שוב״ל', alt: 'שוב״ל' });
  assert.deepEqual(P('what changed today in Shoval'), { kind: 'history', when: 'today', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('what changed recently'), { kind: 'history', when: 'recent', who: '', alt: '' });
  assert.deepEqual(P('qu’est-ce qui a changé aujourd’hui dans Shoval'), { kind: 'history', when: 'today', who: 'Shoval', alt: 'Shoval' });
  assert.deepEqual(P('quoi de neuf récemment'), { kind: 'history', when: 'recent', who: '', alt: '' });
  assert.equal(P('quoi de neuf avec Shoval'), null);
  assert.equal(P('מה יש לי מחר'), null);
  assert.equal(P('שלחי וואטסאפ לדנה מגיעה'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseInvoiceRequest } from '../js/logic/commands.js';
import { parseAction } from '../js/logic/questions.js';
import { parseAction2 } from '../js/logic/questions2.js';
import { parseAgenda } from '../js/logic/agenda.js';
import { parseMissing } from '../js/logic/openItems.js';
import { parseGoto } from '../js/logic/nav.js';
import { parseReminder, takeWhen, polite, amountNum } from '../js/logic/travel.js';
import { isDoneCommand, isDeleteCommand, isEmptyBinCommand } from '../js/logic/trash.js';
import { isSaveTemplateCommand, templateRef, isSendCommand } from '../js/logic/templates.js';
import { isUndoCommand } from '../js/logic/undo.js';
import { parseHow } from '../js/logic/howto.js';
import { parseWorkGroup, groupOption } from '../js/logic/workgroup.js';
import { parseBrief } from '../js/logic/brief.js';

/* The same sentence in Hebrew, French and English gives the same parse. T is a Monday. */
const T = '2026-09-28';
const same = (fn, sentences, expected) => sentences.forEach(s => assert.deepEqual(fn(s), expected, s));
const people = [{ label: 'דנה לוי', names: ['דנה לוי', 'דנה', 'Dana Levy', 'Dana'], phone: '052-1234567', about: 'client', id: 'c1' }, { label: 'רועי נאור', names: ['רועי נאור', 'רועי', 'Roy Naor', 'Roy'], phone: '052-1112233', email: 'roy@b.co', about: 'team', id: 't1' }, { label: 'מלון דניאל', names: ['מלון דניאל', 'Hotel Daniel', 'Hôtel Daniel'], about: 'supplier', id: 's1', phone: '050-1' }];
const cmd = s => { const c = parseCommand(s, [{ id: 'logo', title: 'לוגו', aliases: ['logo'] }], people); return { kind: c.kind, to: c.to && (c.to.id || c.to.name || c.to.phone), who: c.who, body: c.body, via: c.via, type: c.type, due: c.due }; };

test('reminders in three languages carry the same day and time', () => {
  const r = s => { const x = parseReminder(s, T); return x && { due: x.due, time: x.time }; };
  same(r, ['תזכירי לי מחר ב-9 להתקשר לדנה', 'remind me tomorrow at 9 to call Dana', 'rappelle-moi demain à 9h d’appeler Dana', 'rappelle moi s’il te plaît demain a 9h00 d’appeler Dana', 'remind me please tomorrow at 9:00 am to call Dana'], { due: '2026-09-29', time: '09:00' });
  same(r, ['תזכירי לי ביום חמישי לבדוק', 'remind me next thursday to check', 'rappelle-moi jeudi prochain de vérifier', 'remind me this thursday to check', 'rappelle-moi ce jeudi de vérifier'], { due: '2026-10-01', time: '' });
  same(r, ['תזכירי לי בעוד 3 ימים לחזור לצופיה', 'remind me in 3 days to call Zofia back', 'rappelle-moi dans 3 jours de rappeler Zofia', 'rappelle-moi dans trois jours de rappeler Zofia', 'remind me in three days to call Zofia back'], { due: '2026-10-01', time: '' });
  same(r, ['תזכורת: לשלוח חשבונית 15/10', 'reminder: send the invoice on the 15/10', 'rappel : envoyer la facture le 15/10', 'remind me on thursday the 15th to send the invoice', 'rappelle-moi jeudi 15 d’envoyer la facture'], { due: '2026-10-15', time: '' });
  same(r, ['תזכירי לי ב-5 לצאת', 'remind me at 5pm to leave', 'rappelle-moi à 17h de partir', 'remind me at 17:00 to leave'], { due: '2026-09-28', time: '17:00' });
  assert.equal(parseReminder('rappelle-moi demain à 9h30 d’appeler Dana', T).title, 'appeler Dana');
  assert.equal(parseReminder('remind me tomorrow at 9:30 to call Dana', T).title, 'call Dana');
  assert.equal(parseReminder('rappelle Dana', T), null);
  assert.equal(takeWhen('appeler Dana dans une semaine', T).due, '2026-10-05');
  assert.equal(takeWhen('call Dana in a week', T).due, '2026-10-05');
  assert.equal(takeWhen('mardi 14 à 10h', T).time, '10:00');
  assert.equal(polite('envoie s’il te plaît le logo à Dana'), 'envoie le logo à Dana');
  assert.equal(polite('please call Dana, please'), 'call Dana');
  assert.equal(amountNum('1 561,86 €'), 1561.86); assert.equal(amountNum('10 000'), 10000); assert.equal(amountNum('1,500 ₪'), 1500); assert.equal(amountNum('10.500'), 10500);
});

test('agenda questions: today, tomorrow, a weekday, a date, in N days, this week', () => {
  same(s => parseAgenda(s, T), ['מה יש לי מחר', 'what do I have tomorrow', 'qu’est-ce que j’ai demain', 'mes tâches pour demain', 'my tasks for tomorrow please'], { from: '2026-09-29', to: '2026-09-29', key: 'tomorrow' });
  same(s => parseAgenda(s, T), ['מה המשימות שלי ליום חמישי', 'what are my tasks for thursday', 'what do I have next thursday', 'qu’est-ce que j’ai jeudi', 'mes tâches jeudi prochain'], { from: '2026-10-01', to: '2026-10-01', key: 'day' });
  same(s => parseAgenda(s, T), ['משימות ל-14/10', 'my tasks on 14/10', 'mes tâches le 14/10', 'what’s on mardi 14', 'qu’est-ce que j’ai mardi 14'], { from: '2026-10-14', to: '2026-10-14', key: 'day' });
  same(s => parseAgenda(s, T), ['מה יש לי בעוד 3 ימים', 'what do I have in 3 days', 'qu’est-ce que j’ai dans 3 jours'], { from: '2026-10-01', to: '2026-10-01', key: 'day' });
  same(s => parseAgenda(s, T), ['מה יש השבוע', 'what’s on this week', 'qu’est-ce que j’ai cette semaine', 'mon programme cette semaine'], { from: T, to: '2026-10-05', key: 'week' });
  same(s => parseAgenda(s, T), ['מה יש לי שבוע הבא', 'what do I have next week', 'qu’est-ce que j’ai la semaine prochaine'], { from: '2026-10-05', to: '2026-10-12', key: 'nextweek' });
});

test('going to a screen, including the two new ones (templates, import)', () => {
  same(parseGoto, ['עברי לספקים', 'go to suppliers', 'va aux fournisseurs', 'ouvre les fournisseurs', 'open the suppliers screen'], 'suppliers');
  same(parseGoto, ['עברי לתבניות', 'go to templates', 'va aux modèles', 'va aux modeles', 'ouvre les modèles', 'open the templates page'], 'templates');
  same(parseGoto, ['עברי לייבוא', 'לייבא מייל', 'go to import', 'import a mail', 'va à importer', 'importer un mail', 'va à l’import'], 'import');
  same(parseGoto, ['va a reglages', 'go to settings', 'עברי להגדרות', 'ouvre les paramètres'], 'settings');
  same(parseGoto, ['open Dana', 'ouvre Dana', 'תפתחי את דנה', 'import the quote of Dana'], null);
});

test('the short state sentences: waiting, remind, paid, call log, done, postpone, cancel, chosen, print, field', () => {
  same(s => parseAction(s, T), ['מי לא ענה', 'who has not answered yet', "who hasn't replied", 'qui n’a pas encore répondu', 'quels fournisseurs n’ont pas repondu'], { kind: 'waiting' });
  same(s => parseAction(s, T), ['תזכירי לכל הספקים שלא ענו', 'remind all the suppliers who have not answered', 'rappelle tous les fournisseurs qui n’ont pas répondu', 'relance tout le monde'], { kind: 'remindAll' });
  same(s => parseAction(s, T), ['תשלחי תזכורת לגרשון טורס', 'send a reminder to גרשון טורס', 'envoie un rappel à גרשון טורס', 'relance גרשון טורס', 'remind גרשון טורס'], { kind: 'remindSup', who: 'גרשון טורס' });
  same(s => parseAction(s, T), ['מה שילמנו לביסקוטי', 'how much did we pay ביסקוטי', 'combien on a payé à ביסקוטי', 'combien a-t-on payé ביסקוטי'], { kind: 'paidQuery', who: 'ביסקוטי' });
  same(s => parseAction(s, T), ['העברתי תשלום לדף אור 500', 'I paid 500 to דף אור', 'j’ai payé 500 à דף אור', 'j’ai viré 500 € à דף אור', 'I transferred דף אור 500 shekels'], { kind: 'paid', who: 'דף אור', amount: 500 });
  assert.equal(parseAction('payé Biscotti 1 561,86 €', T).amount, 1561.86);
  same(s => { const c = parseAction(s, T); return c && { kind: c.kind, who: c.who, when: c.when }; }, ['תרשמי שיחה עם ארבל מחר ב-10', 'log a call with ארבל tomorrow at 10', 'note un appel avec ארבל demain à 10h', 'schedule a call with ארבל tomorrow at 10am'], { kind: 'callLog', who: 'ארבל', when: { due: '2026-09-29', time: '10:00' } });
  same(s => parseAction(s, T), ['סמני שהסיור בוצע', 'mark הסיור as done', 'marque הסיור comme faite', 'tick הסיור', 'coche הסיור', 'הסיור is done', 'הסיור est terminée'], { kind: 'taskDone', who: 'הסיור' });
  same(s => parseAction(s, T), ['דחי את המשימה של הסיור ליום חמישי', 'postpone the task הסיור to thursday', 'move the הסיור task to thursday', 'reporte la tâche הסיור à jeudi', 'décale la tache הסיור a jeudi'], { kind: 'snooze', when: { due: '2026-10-01', time: '' }, who: 'הסיור' });
  same(s => parseAction(s, T), ['תבטלי את המשימה של הסיור', 'cancel the task הסיור', 'delete the הסיור task', 'annule la tâche הסיור', 'supprime la tâche de הסיור'], { kind: 'taskCancel', who: 'הסיור' });
  same(s => parseAction(s, T), ['סגרי עם מלון דניאל', 'go with מלון דניאל', 'close with מלון דניאל', 'on prend מלון דניאל', 'on part sur מלון דניאל', 'מלון דניאל is chosen', 'מלון דניאל est choisi', 'מלון דניאל נבחר'], { kind: 'chosen', who: 'מלון דניאל' });
  same(s => parseAction(s, T), ['תוסיפי לרשימת הדפוס 20 תגי שם לשוב״ל', 'add to the print list 20 תגי שם for שוב״ל', 'ajoute à la liste d’impression 20 תגי שם pour שוב״ל'], { kind: 'printAdd', qty: 20, item: 'תגי שם', who: 'שוב״ל' });
  same(s => parseAction(s, T), ['מה התקציב של שוב״ל', 'what is the budget of שוב״ל', "what's the budget for שוב״ל", 'quel est le budget de שוב״ל', 'c’est quoi le budget de שוב״ל'], { kind: 'field', field: 'budget', who: 'שוב״ל' });
  same(s => parseAction(s, T), ['כמה משתתפים יש לברטלסמן', 'how many participants does ברטלסמן have', 'combien de participants pour ברטלסמן'], { kind: 'field', field: 'participants', who: 'ברטלסמן' });
  same(s => parseAction(s, T), ['מתי האירוע של שוב״ל?', 'when is the event of שוב״ל', 'quand est l’événement de שוב״ל', 'c’est quand l’evenement de שוב״ל', "what's the date of שוב״ל"], { kind: 'field', field: 'date', who: 'שוב״ל' });
  same(s => parseAction(s, T), ['איפה האירוע של שוב״ל', 'where is the event of שוב״ל', 'où est l’événement de שוב״ל'], { kind: 'field', field: 'place', who: 'שוב״ל' });
  same(s => parseAction(s, T), ['באיזו שעה האירוע של שוב״ל', 'what time is the event of שוב״ל', 'à quelle heure est l’événement de שוב״ל'], { kind: 'field', field: 'hours', who: 'שוב״ל' });
});

test('participants, budget and run of show in three languages', () => {
  const P = parseAction2; const W = { who: 'שוב״ל', alt: 'שוב״ל' };
  same(P, ['הוסיפי משתתף לשוב״ל: דנה', 'add a participant to שוב״ל: דנה', 'ajoute une participante à שוב״ל : דנה', 'inscris des participants pour שוב״ל: דנה'], { kind: 'partAdd', ...W, text: 'דנה' });
  same(P, ['כמה אישרו הגעה של שוב״ל', 'how many people are coming to שוב״ל', 'how many confirmed for שוב״ל', 'combien de personnes viennent à שוב״ל', 'combien ont confirmé pour שוב״ל ?'], { kind: 'rsvpCount', ...W });
  same(P, ['מי עוד לא אישר הגעה של שוב״ל', "who hasn't confirmed for שוב״ל", 'who has not replied yet for שוב״ל', 'qui n’a pas encore confirmé pour שוב״ל', 'qui n’ont pas répondu pour שוב״ל'], { kind: 'rsvpMissing', ...W });
  same(P, ['רשימה למלון של שוב״ל', 'the rooming list for שוב״ל', 'hotel list for שוב״ל', 'la liste pour l’hôtel de שוב״ל', 'liste hôtel de שוב״ל'], { kind: 'hotelList', ...W });
  same(P, ['מה הרווח של שוב״ל', 'what is the margin of שוב״ל', "what's the profit on שוב״ל", 'quelle est la marge de שוב״ל', 'combien on gagne sur שוב״ל'], { kind: 'budgetProfit', ...W });
  same(P, ['כמה עולים לנו הספקים של שוב״ל', 'how much do the suppliers cost for שוב״ל', 'combien coûtent les fournisseurs de שוב״ל', 'combien coutent les fournisseurs pour שוב״ל'], { kind: 'budgetCost', ...W });
  same(P, ['מה לוח התשלומים של שוב״ל', 'what is the payment schedule for שוב״ל', 'show me the payment plan of שוב״ל', 'quel est l’échéancier de שוב״ל', 'montre-moi l’echeancier de שוב״ל'], { kind: 'budgetSchedule', ...W });
  same(P, ['כמה פתוח לתשלום של שוב״ל', 'how much is still open for שוב״ל', 'how much is left to pay for שוב״ל', 'combien reste à payer pour שוב״ל', 'combien il reste à encaisser pour שוב״ל'], { kind: 'budgetOpen', ...W });
  same(P, ['מה עכשיו בלו״ז', "what's on now", 'what is happening now', 'qu’est-ce qu’il y a maintenant', 'on en est où'], { kind: 'rsNow' });
  same(P, ['מה הבא בלו״ז', "what's next", 'and then', 'et ensuite', 'la suite', 'après'], { kind: 'rsNext' });
  same(P, ['מצב יום האירוע של שוב״ל', 'go to day-of mode for שוב״ל', 'event day mode for שוב״ל', 'passe en mode jour J pour שוב״ל', 'mode jour-J de שוב״ל'], { kind: 'live', ...W });
});

test('files, contracts, checklists, reminders, board and history', () => {
  const P = parseAction2; const W = { who: 'שוב״ל', alt: 'שוב״ל' };
  same(P, ['מה חסר במסמכים של שוב״ל', 'which documents are missing for שוב״ל', 'what files are missing for שוב״ל', 'quels documents manquent pour שוב״ל', 'qu’est-ce qui manque dans les documents de שוב״ל'], { kind: 'docsMissing', ...W });
  same(s => { const x = P(s); return x && { kind: x.kind, who: x.who }; }, ['איפה החוזה של שוב״ל', 'where is the contract of שוב״ל', 'où est le contrat de שוב״ל', 'trouve-moi le contrat de שוב״ל'], { kind: 'fileFind', who: 'שוב״ל' });
  same(P, ['מה חסר לחוזה של שוב״ל', "what's missing for the contract of שוב״ל", 'que manque-t-il au contrat de שוב״ל', 'qu’est-ce qui manque au contrat de שוב״ל'], { kind: 'contractMissing', ...W });
  same(P, ['האם החוזה של שוב״ל חתום?', 'is the contract of שוב״ל signed', 'did שוב״ל sign the contract yet', 'le contrat de שוב״ל est-il signé ?', 'est-ce que שוב״ל a signé le contrat'], { kind: 'contractSigned', ...W });
  same(P, ['מה נשאר ברשימה של שוב״ל', "what's left on the checklist of שוב״ל", 'what remains on the list for שוב״ל', 'que reste-t-il sur la check-list de שוב״ל', 'il reste quoi sur la liste de שוב״ל'], { kind: 'checklistLeft', ...W });
  same(P, ['מה לשבוע הקרוב ברשימה של שוב״ל', "what's due this week on the checklist of שוב״ל", 'what is due this week on the checklist of שוב״ל', 'qu’est-ce qu’il y a cette semaine sur la liste de שוב״ל', 'que faire cette semaine sur la check-list de שוב״ל'], { kind: 'checklistWeek', ...W });
  same(P, ['מה התזכורות שלי', 'what are my reminders', 'my reminders', 'quels sont mes rappels ?', 'mes rappels'], { kind: 'reminders' });
  same(P, ['מה דחוף', "what's urgent", 'anything urgent', 'qu’est-ce qui est urgent', 'quoi d’urgent'], { kind: 'urgent' });
  same(P, ['סמני את התזכורות כנקראו', 'mark the reminders as read', 'mark all my notifications as read', 'marque les rappels comme lus', 'marque tous mes rappels comme lus'], { kind: 'remindersRead' });
  same(P, ['העבירי את שוב״ל לנסגר', 'move שוב״ל to won', 'mark שוב״ל as won', 'we won שוב״ל', 'passe שוב״ל en gagné', 'on a gagné שוב״ל', 'marque שוב״ל comme gagné'], { kind: 'caseMove', ...W, status: 'נסגר' });
  same(P, ['הפנייה של שוב״ל ירדה', 'the lead of שוב״ל is lost', 'שוב״ל is lost', 'le dossier de שוב״ל est perdu', 'שוב״ל est perdu'], { kind: 'caseMove', ...W, status: 'ירד' });
  same(P, ['מה השתנה היום בשוב״ל', 'what changed today in שוב״ל', 'what has changed today in שוב״ל', 'qu’est-ce qui a changé aujourd’hui dans שוב״ל', 'quoi de neuf aujourd’hui dans שוב״ל'], { kind: 'history', when: 'today', ...W });
  same(P, ['מה השתנה לאחרונה', 'what changed recently', "what's new", 'quoi de neuf', 'qu’est-ce qui a changé récemment'], { kind: 'history', when: 'recent', who: '', alt: '' });
});

test('"what is missing for X", with the focus on the suppliers or the client', () => {
  same(parseMissing, ['מה חסר לי לאירוע של שוב״ל', "what's still missing for שוב״ל", 'what is open for שוב״ל', 'where are we with שוב״ל', 'qu’est-ce qui manque pour שוב״ל ?', 'où en est שוב״ל', 'que reste-t-il pour שוב״ל'], { who: 'שוב״ל', alt: 'שוב״ל', focus: 'all' });
  same(parseMissing, ['מה חסר לי מהספקים של שוב״ל', "what's missing from the suppliers for שוב״ל", 'what do I still need from the suppliers for שוב״ל', 'qu’est-ce qui manque chez les fournisseurs de שוב״ל'], { who: 'שוב״ל', alt: 'שוב״ל', focus: 'suppliers' });
  same(parseMissing, ['מה פתוח מול הלקוח שוב״ל', 'what is open with the client שוב״ל', 'qu’est-ce qui manque avec le client שוב״ל'], { who: 'שוב״ל', alt: 'שוב״ל', focus: 'client' });
});

test('finished, delete, empty the bin, send, undo, save as template: the same words in three languages', () => {
  ['סיימתי', 'done', 'finished', "that's it", "I'm done", 'i have finished', 'terminé', 'termine', 'j’ai fini', 'c’est fini', 'c’est bon', 'ok done'].forEach(x => assert.ok(isDoneCommand(x), x));
  ['סיימתי את ההצעה', 'done with the hotel', 'c’est fini pour aujourd’hui'].forEach(x => assert.ok(!isDoneCommand(x), x));
  ['מחקי', 'delete', 'delete that', 'never mind', 'efface', 'supprime tout', 'laisse tomber', 'annule ça'].forEach(x => assert.ok(isDeleteCommand(x), x));
  ['רוקני את הסל', 'empty the bin', 'empty the trash', 'clear the bin', 'vide la corbeille', 'vider la corbeille', 'supprime la corbeille', 'efface définitivement'].forEach(x => assert.ok(isEmptyBinCommand(x), x));
  ['תשלחי', 'send', 'send it', 'ok send', 'send please', 'go ahead', 'envoie', 'envoie-le', 'envoie s’il te plaît', 'vas-y', 'tu peux envoyer'].forEach(x => assert.ok(isSendCommand(x), x));
  ['תשלחי לדנה', 'send a message to Roy', 'envoie le logo à Dana'].forEach(x => assert.ok(!isSendCommand(x), x));
  ['תחזירי', 'undo', 'undo that', 'undo the last action', 'cancel the last action', 'go back', 'annule la dernière action', 'annule la derniere action', 'reviens en arrière', 'retour', 'défaire'].forEach(x => assert.ok(isUndoCommand(x), x));
  ['בטלי', 'cancel', 'annule', 'מחקי', 'undo the task tour'].forEach(x => assert.ok(!isUndoCommand(x), x));
  same(isSaveTemplateCommand, ['שמרי את ההודעה כתבנית סיור', 'save this message as a template: סיור', 'save as template סיור', 'save it as a template called סיור', 'enregistre ce message comme modèle סיור', 'sauvegarde en modele : סיור', 'garde ça comme modèle סיור'], 'סיור');
  same(templateRef, ['את תבנית הסיור', 'the template הסיור', 'template הסיור', 'le modèle הסיור', 'modele הסיור'], 'הסיור');
});

test('"how do I" questions are stripped to the words that matter', () => {
  same(s => parseHow(s).words, ['how do I send a quote', 'how to send a quote', 'how can I send a quote', 'how should we send a quote'], ['send', 'quote']);
  same(s => parseHow(s).words, ['comment envoyer un devis', 'comment on fait pour envoyer un devis', 'comment faire pour envoyer un devis', 'comment est-ce que je peux envoyer un devis'], ['envoyer', 'devis']);
  same(s => parseHow(s).words, ['איך מוחקים הקלטה', 'מה עושים אם מוחקים הקלטה'], ['מוחקימ', 'הקלטה']);
  assert.deepEqual(parseHow('what do I do when a supplier does not answer').words, ['supplier', 'does', 'not', 'answer']);
  assert.deepEqual(parseHow('que faire si un fournisseur ne répond pas').words, ['fournisseur', 'ne', 'répond', 'pas']);
  assert.equal(parseHow('rappelle-moi demain'), null);
});

test('a working group and her answer about how to work with it', () => {
  same(parseWorkGroup, ['פתחי קבוצת עבודה לשובל עם דנה, רותם ועידית, במייל', 'open a working group for שובל with דנה, רותם and עידית by email', 'set up a whatsapp group for the שובל event with דנה, רותם and עידית, by e-mail', 'crée un groupe de travail pour שובל avec דנה, רותם et עידית, par mail', 'ouvre-moi un groupe pour l’événement שובל avec דנה, רותם et עידית par e-mail', 'crée s’il te plaît un groupe pour שובל avec דנה, רותם et עידית, mail'], { names: ['דנה', 'רותם', 'עידית'], caseName: 'שובל', opt: 'mail' });
  same(groupOption, ['וואטסאפ', 'whatsapp', 'whats app', 'by whatsapp', 'par whatsapp', 'sur whatsapp'], 'wa');
  same(groupOption, ['במייל', 'mail', 'by email', 'par mail', 'par e-mail', 'courriel'], 'mail');
  same(groupOption, ['תדריך', 'brief', 'a brief', 'le brief', 'un résumé', 'summary'], 'brief');
  same(groupOption, ['משימות לכולם', 'tasks', 'a task for everyone', 'des tâches', 'une tâche pour tous'], 'tasks');
  same(groupOption, ['רק לשמור', 'just save', 'save', 'enregistre', 'juste enregistrer', 'sauvegarde seulement'], 'save');
  same(groupOption, ['תוסיפי את דנה לקבוצה', 'add דנה to the group', 'add דנה too', 'ajoute דנה au groupe', 'ajoute aussi דנה'], { add: 'דנה' });
});

test('commands in three languages', () => {
  same(cmd, ['שלחי הודעה לרועי: אני מגיעה', 'send a message to Roy: אני מגיעה', 'send Roy a message: אני מגיעה', 'envoie un message à Roy : אני מגיעה', 'écris à Roy : אני מגיעה', 'envoie un whats app à Roy : אני מגיעה', 'send a whats app to Roy saying אני מגיעה', 'envoie un whatsapp à Roy en disant אני מגיעה'], { kind: 'message', to: 't1', body: 'אני מגיעה', via: 'whatsapp', who: undefined, type: undefined, due: undefined });
  same(cmd, ['שלחי מייל לרועי: ההצעה מוכנה', 'send an email to Roy: ההצעה מוכנה', 'send Roy an e-mail: ההצעה מוכנה', 'envoie un mail à Roy : ההצעה מוכנה', 'envoie un e-mail à Roy, ההצעה מוכנה'], { kind: 'message', to: 't1', body: 'ההצעה מוכנה', via: 'email', who: undefined, type: undefined, due: undefined });
  same(s => cmd(s).body, ['תגידי לדנה שאני מאחרת', 'tell Dana that אני מאחרת', 'dis à Dana que אני מאחרת'], 'אני מאחרת');
  same(s => [cmd(s).kind, cmd(s).to], ['שלחי את הלוגו לדנה', 'send the logo to Dana', 'please send the logo to Dana', 'envoie le logo à Dana', 'envoie s’il te plaît le logo à Dana', 'envoyer le logo à Dana'], ['send', 'c1']);
  same(s => [cmd(s).kind, cmd(s).who], ['תבני לי הצעת מחיר לשוב״ל', 'build a quote for שוב״ל', 'prepare me a quote for שוב״ל', 'make a quote for שוב״ל please', 'prépare un devis pour שוב״ל', 'fais-moi un devis pour שוב״ל', 'crée un devis pour שוב״ל s’il te plaît'], ['quote', 'שוב״ל']);
  same(s => [cmd(s).kind, cmd(s).type, cmd(s).who], ['תבקשי הצעות ממלונות לשוב״ל', 'ask for quotes from מלונות for שוב״ל', 'request quotes from the מלונות for שוב״ל', 'ask the מלונות for quotes for שוב״ל', 'demande des devis aux מלונות pour שוב״ל', 'demande des devis à des מלונות pour שוב״ל'], ['ask', 'מלונות', 'שוב״ל']);
  same(s => [cmd(s).kind, cmd(s).to], ['תתקשרי לדנה', 'call Dana', 'call Dana back', 'phone Dana', 'appelle Dana', 'appeler Dana', 'téléphone à Dana', 'rappelle Dana'], ['call', 'c1']);
  same(s => [cmd(s).kind, cmd(s).to, cmd(s).body, cmd(s).due], ['משימה לרועי: לאסוף שלטים ביום חמישי', 'task for Roy: לאסוף שלטים by thursday', 'add a task for Roy: לאסוף שלטים on thursday', 'new task for Roy: לאסוף שלטים next thursday', 'tâche pour Roy : לאסוף שלטים jeudi', 'ajoute une tâche pour Roy : לאסוף שלטים jeudi prochain', 'nouvelle tâche pour Roy : לאסוף שלטים ce jeudi'], ['task', 't1', 'לאסוף שלטים', '2026-10-08']);
  same(s => [cmd(s).kind, cmd(s).to, cmd(s).body], ['רשמי הערה על דנה: יקרים אבל שווים', 'note on Dana: יקרים אבל שווים', 'write a note about Dana: יקרים אבל שווים', 'note sur Dana : יקרים אבל שווים', 'écris une note sur Dana : יקרים אבל שווים'], ['note', 'c1', 'יקרים אבל שווים']);
  same(s => [cmd(s).kind, cmd(s).to], ['תפתחי את הספק מלון דניאל', 'open the supplier Hotel Daniel', 'show me Hotel Daniel', 'ouvre le fournisseur Hôtel Daniel', 'ouvre la fiche de Hotel Daniel', 'montre-moi Hotel Daniel'], ['open', 's1']);
  same(s => [cmd(s).kind, cmd(s).body], ['פנייה חדשה: דנה לוי 052', 'new lead: דנה לוי 052', 'new inquiry: דנה לוי 052', 'new enquiry: דנה לוי 052', 'nouvelle demande : דנה לוי 052', 'nouveau lead : דנה לוי 052', 'nouveau client : דנה לוי 052'], ['lead', 'דנה לוי 052']);
  same(s => cmd(s).kind, ['מה יש לי היום', 'what is on today', "what's today", 'what do I have today', 'aujourd’hui', 'qu’est-ce que j’ai aujourd’hui', 'qu’est-ce qu’il y a aujourd’hui'], 'today');
  same(s => { const c = parseCommand(s, [], people); return [c.kind, c.to && c.to.id, c.contact.phone]; }, ['שמרי את הטלפון של דנה 052-9998877', 'save the phone of Dana 052-9998877', "save Dana's phone 052-9998877", "Dana's phone is 052-9998877", 'enregistre le téléphone de Dana 052-9998877', 'enregistre le numéro de Dana : 052-9998877', 'le numéro de Dana est 052-9998877', 'le numéro de Dana c’est le 052-9998877'], ['contact', 'c1', '052-9998877']);
  same(s => { const c = parseCommand(s, [], people); return [c.kind, c.contact.email]; }, ['המייל של דנה dana@x.co', 'the mail of Dana is dana@x.co', "Dana's email is dana@x.co", 'le mail de Dana : dana@x.co', 'l’adresse mail de Dana est dana@x.co'], ['contact', 'dana@x.co']);
  same(s => { const c = parseCommand(s, [], people); return [c.kind, c.supplier && c.supplier.id]; }, ['קיבלתי הצעה ממלון דניאל', 'I got a quote from Hotel Daniel', 'received an offer from Hotel Daniel', 'j’ai reçu un devis de Hotel Daniel', 'j’ai reçu une offre de Hotel Daniel', 'devis de Hotel Daniel'], ['supplierQuote', 's1']);
  same(s => { const c = parseCommand(s, [], people); return [c.kind, c.to.group, c.to.name, c.body]; }, ['שלחי וואטסאפ לקבוצת הצוות: הלו״ז נשלח', 'send a whatsapp to the group הצוות: הלו״ז נשלח', 'envoie un whatsapp au groupe הצוות : הלו״ז נשלח', 'envoie un message au groupe de הצוות : הלו״ז נשלח'], ['message', true, 'הצוות', 'הלו״ז נשלח']);
});

test('an invoice request to Roy: the client, the amount in every format, HT / TTC / plus VAT, the channel', () => {
  const inv = s => { const r = parseInvoiceRequest(s, []); return { client: r.client, amount: r.items[0] && r.items[0].amount, incl: !!(r.items[0] && r.items[0].incl), channel: r.channel }; };
  same(inv, ['תוציא חשבונית לחברת אלפא על 3,000 שקל פלוס מע״מ, שלח במייל לרועי', 'ask Roy for an invoice for חברת אלפא, 3,000 plus VAT, by email', 'ask Roy for an invoice for חברת אלפא 3000 HT by e-mail', 'demande à Roy une facture pour חברת אלפא 3 000 € HT, par mail', 'demande une facture à Roy pour חברת אלפא : 3 000 HT par e-mail'], { client: 'חברת אלפא', amount: 3000, incl: false, channel: 'mail' });
  same(inv, ['חשבונית לחברת אלפא על 11,800 כולל מע״מ, תבקש מרועי', 'invoice for חברת אלפא 11,800 including VAT, ask Roy', 'facture pour חברת אלפא 11 800 TTC, demande à Roy'], { client: 'חברת אלפא', amount: 10000, incl: true, channel: '' });
  const r = parseInvoiceRequest('facture pour חברת אלפא de 1 500,50 € HT pour יום גיבוש, envoie à Roy par mail', []);
  assert.equal(r.items[0].amount, 1500.5); assert.equal(r.items[0].desc, 'יום גיבוש'); assert.equal(r.channel, 'mail');
  assert.equal(parseInvoiceRequest('ask Roy for an invoice for חברת אלפא, 3,000 plus VAT for יום גיבוש', []).items[0].desc, 'יום גיבוש');
  assert.equal(parseCommand('demande une facture à Roy pour חברת אלפא : 10 000 € HT', [], people).kind, 'invoice');
  assert.equal(parseCommand('ask Roy for an invoice for חברת אלפא: 10,000 before VAT', [], people).kind, 'invoice');
});

test('a brief dictated in French or English: needs, tasks, nights and rooms', () => {
  const PL = [['הרצליה', 'Herzliya'], ['תל אביב', 'Tel Aviv']];
  const b = parseBrief('Bertelsmann veut un séminaire le 19 octobre à Herzliya avec une nuit à l’hôtel, 16 chambres single, environ 18 participants, il faut une salle avec écran et projecteur et un minibus, il faut vérifier le budget avec Claudia et appeler Arbel de l’hôtel Daniel pour une visite, ne pas oublier les badges', PL, T);
  assert.deepEqual(b.needs, ['מלונות', 'הסעות', 'מקום לאירוע', 'הגברה ותאורה', 'דפוס ומיתוג', 'פעילות וסיורים']);
  assert.deepEqual(b.tasks.map(x => x.title), ['il faut vérifier le budget avec Claudia', 'appeler Arbel de l’hôtel Daniel pour une visite', 'ne pas oublier les badges']);
  assert.equal(b.days, '2'); assert.equal(b.rooms, '16'); assert.equal(b.lead.participants, '18');
  const e = parseBrief('Shoval wants a team seminar on October 19 in Herzliya with two nights, 16 single rooms, about 18 participants, we need a hall with a screen and a projector and a minibus from Tel Aviv, must check the budget with Zofia and call Arbel from hotel Daniel to book a tour, do not forget name tags', PL, T);
  assert.deepEqual(e.tasks.map(x => x.title), ['must check the budget with Zofia', 'call Arbel from hotel Daniel to book a tour', 'do not forget name tags']);
  assert.equal(e.days, '3'); assert.equal(e.rooms, '16');
});

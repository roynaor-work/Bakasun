import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkGroup, splitNames, resolveNames, groupOption, briefText } from '../js/logic/workgroup.js';

test('"open a working group with five people Eran Moshe Haim David and Eran": the names, without the count, no duplicates', () => {
  const r = parseWorkGroup('פתח לי בבקשה קבוצת עבודה עם חמש אנשים ערן משה חיים דוד וערן');
  assert.deepEqual(r, { names: ['ערן משה חיים דוד', 'ערן'], caseName: '', opt: null });
  assert.deepEqual(parseWorkGroup('פתחי קבוצת עבודה לשובל עם מרינה רותם ועידית וואטסאפ'), { names: ['מרינה רותם', 'עידית'], caseName: 'שובל', opt: 'wa' });
  assert.deepEqual(parseWorkGroup('פתחי קבוצת עבודה לשובל עם מרינה, רותם ועידית, במייל'), { names: ['מרינה', 'רותם', 'עידית'], caseName: 'שובל', opt: 'mail' });
  const people = [{ label: 'ערן לוי', names: ['ערן לוי'], phone: '050-1', about: 'team', id: 'a' }, { label: 'משה חיים', names: ['משה חיים'], email: 'm@x', about: 'contact', id: 'b' }, { label: 'יד ושם · מרינה ביקלניצקי', names: ['יד ושם', 'מרינה ביקלניצקי'], email: 'm@y', about: 'client', id: 'c' }];
  const m = resolveNames(r.names.concat(['מרינה']), people);
  assert.deepEqual(m.map(x => [x.name, x.known]), [['ערן לוי', true], ['משה חיים', true], ['דוד', false], ['מרינה ביקלניצקי', true]]);
  assert.equal(m[0].phone, '050-1'); assert.equal(m[3].role, 'יד ושם'); assert.equal(m[3].email, 'm@y');
});

test('the event and the separators: "for Shoval with Dana, Rotem and Marina"; English and French too', () => {
  assert.deepEqual(parseWorkGroup('פתחי קבוצת עבודה לשובל עם דנה, רותם ומרינה'), { names: ['דנה', 'רותם', 'מרינה'], caseName: 'שובל', opt: null });
  assert.deepEqual(parseWorkGroup('open a working group for the Bertelsmann event with Dana and Rotem'), { names: ['Dana', 'Rotem'], caseName: 'Bertelsmann', opt: null });
  assert.deepEqual(parseWorkGroup('crée un groupe de travail avec Dana et Rotem').names, ['Dana', 'Rotem']);
  assert.equal(parseWorkGroup('מה חסר לשובל'), null);
  assert.deepEqual(splitNames('ערן, משה חיים דוד וערן'), ['ערן', 'משה חיים דוד']);
});

test('a garbled foreign name still finds the person: "ירז\'ני" is Virginie', () => {
  const people = [{ label: 'וירג׳יני מנדל', names: ['וירג׳יני מנדל'], phone: '054-4974644', about: 'team', id: 'v' }, { label: 'רותם', names: ['רותם'], about: 'staff', id: 'r' }];
  const m = resolveNames(["ירז'ני"], people);
  assert.equal(m[0].name, 'וירג׳יני מנדל'); assert.equal(m[0].phone, '054-4974644');
  assert.equal(resolveNames(['דוד'], people)[0].known, false);
});

test('her answer to "how?": whatsapp, mail, brief, tasks, or add someone', () => {
  assert.equal(groupOption('וואטסאפ'), 'wa'); assert.equal(groupOption('במייל'), 'mail'); assert.equal(groupOption('תדריך'), 'brief'); assert.equal(groupOption('משימות לכולם'), 'tasks');
  assert.deepEqual(groupOption('תוסיפי את דנה לקבוצה'), { add: 'דנה' }); assert.equal(groupOption('מה חסר לשובל'), null);
});

test('the brief carries the event, the group and the open tasks', () => {
  const txt = briefText({ client: 'ארגון שוב״ל', kind: 'כנס', date: '2026-10-18', place: 'שפיים', participants: '100', purpose: 'מפגש הכפר' }, [{ name: 'ערן לוי', phone: '050-1' }, { name: 'דוד' }], [{ title: 'חוזה עם המקום', who: 'אני', due: '2026-10-01' }], { lang: 'he', signer: 'וירג׳יני' });
  assert.match(txt, /תדריך פרויקט · ארגון שוב״ל · כנס/); assert.match(txt, /תאריך: 18\/10\/2026/); assert.match(txt, /• ערן לוי · 050-1/); assert.match(txt, /• דוד$/m); assert.match(txt, /• חוזה עם המקום · אני · 01\/10\/2026/); assert.match(txt, /וירג׳יני$/);
});

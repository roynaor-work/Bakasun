import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseParticipantsText, roomingList, dietarySummary, rsvpSummary, nameTagsText, toCsv, csvCell, hotelListText, cateringText, rsvpAskText, plannedCount, newOnes, addFromText } from '../js/logic/participants.js';

import { hasArabic } from '../js/logic/core.js';
const noArabic = s => assert.ok(!hasArabic(s), 'no Arabic letters');

test('parser: comma separated Hebrew line "שם, טלפון, ארגון"', () => {
  const r = parseLine('דנה כהן, 052-1234567, ארגון שוב״ל');
  assert.equal(r.name, 'דנה כהן'); assert.equal(r.phone, '052-1234567'); assert.equal(r.org, 'ארגון שוב״ל');
});

test('parser: "name - phone" with international and local Israeli formats', () => {
  assert.deepEqual([parseLine('Claudia Meyer - +972 52 123 4567').phone, parseLine('יוסי לוי - 0521234567').phone, parseLine('Marc - 0033612345678').phone], ['052-1234567', '052-1234567', '+33612345678']);
  assert.equal(parseLine('Claudia Meyer - +972 52 123 4567').name, 'Claudia Meyer');
});

test('parser: tab separated with a role and an email; email alone gives a name', () => {
  const r = parseLine('Stefanie Braun\t+49 170 1234567\tBertelsmann Stiftung\tProject lead\tstefanie@bertelsmann.de');
  assert.equal(r.name, 'Stefanie Braun'); assert.equal(r.phone, '+491701234567'); assert.equal(r.org, 'Bertelsmann Stiftung'); assert.equal(r.role, 'Project lead'); assert.equal(r.email, 'stefanie@bertelsmann.de');
  assert.equal(parseLine('רונית שמש <ronit.s@gmail.com>').email, 'ronit.s@gmail.com');
  assert.equal(parseLine('רונית שמש <ronit.s@gmail.com>').name, 'רונית שמש');
  assert.equal(parseLine('avi.levi@example.com').name, 'avi levi');
});

test('parser: no separator, the phone is found inside the line; numbering is stripped', () => {
  assert.deepEqual([parseLine('1. משה פרץ 050-9876543').name, parseLine('1. משה פרץ 050-9876543').phone], ['משה פרץ', '050-9876543']);
  assert.equal(parseLine('3) Anna Roth').name, 'Anna Roth');
  assert.equal(parseLine('• צופיה').name, 'צופיה');
  assert.equal(parseLine('   '), null);
  // the phone glued to the name inside the first comma part
  const a = parseLine('שירן לוי - 0541112222, זוגי'); assert.deepEqual([a.name, a.phone, a.room], ['שירן לוי', '054-1112222', 'double']);
  const b = parseLine('משה פרץ 050-9876543, קייטרינג הכפר, כשר'); assert.deepEqual([b.name, b.phone, b.org, b.dietTags], ['משה פרץ', '050-9876543', 'קייטרינג הכפר', ['kosher']]);
});

test('parser: dietary words and room words become chips, allergy text is kept', () => {
  const r = parseLine('שירן לוי, 054-1112222, צמחונית, סינגל');
  assert.deepEqual(r.dietTags, ['vegetarian']); assert.equal(r.room, 'single'); assert.equal(r.org, '');
  const a = parseLine('Tom, vegan, allergy to nuts, double');
  assert.deepEqual(a.dietTags, ['vegan', 'allergy']); assert.equal(a.dietary, 'allergy to nuts'); assert.equal(a.room, 'double');
});

test('parser: whole text, duplicate names folded, rsvp starts as invited', () => {
  const list = parseParticipantsText('דנה כהן, 052-1234567\n\nיוסי לוי - 0521234567\nדנה כהן\n2. Anna Roth\tanna@x.org');
  assert.equal(list.length, 3);
  assert.ok(list.every(p => p.rsvp === 'invited'));
  assert.equal(list[2].email, 'anna@x.org');
});

const people = [
  { id: 'a', name: 'דנה כהן', room: 'double', roommate: 'שירן לוי', rsvp: 'yes', dietTags: ['vegetarian'], org: 'שוב״ל', arrival: '19/10 14:00' },
  { id: 'b', name: 'שירן לוי', room: 'double', roommate: '', rsvp: 'yes', dietTags: ['vegetarian', 'glutenfree'], dietary: 'אלרגיה לאגוזים' },
  { id: 'c', name: 'יוסי לוי', room: 'single', rsvp: 'maybe', dietTags: [] },
  { id: 'd', name: 'צופיה', room: 'single', rsvp: 'no', dietTags: ['kosher'] },
  { id: 'e', name: 'משה פרץ', room: 'double', roommate: '', rsvp: 'invited' },
  { id: 'f', name: 'Anna Roth', room: 'double', roommate: 'Tom Bell', rsvp: 'yes', nameTag: 'Anna R.', org: 'Bertelsmann' },
  { id: 'g', name: 'רונית', room: 'none', rsvp: 'yes', dietTags: ['vegan'] }
];

test('rooming: pairs by roommate name, singles, unpaired, guest partner, "no" is left out', () => {
  const r = roomingList(people);
  assert.equal(r.singles, 1); // צופיה said no
  assert.equal(r.doubles, 2);
  assert.deepEqual(r.rooms.find(x => x.names[0] === 'דנה כהן').names, ['דנה כהן', 'שירן לוי']);
  assert.deepEqual(r.rooms.find(x => x.names[0] === 'Anna Roth').names, ['Anna Roth', 'Tom Bell']);
  assert.equal(r.rooms.find(x => x.names[0] === 'Anna Roth').guest, 'Tom Bell');
  assert.deepEqual(r.unpaired.map(p => p.name), ['משה פרץ']);
  assert.deepEqual(r.noRoom.map(p => p.name), ['רונית']);
  assert.equal(r.total, 3); assert.equal(r.sleeping, 6);
});

test('rooming: mutual pair is one room, matching ignores final letters and quotes', () => {
  const r = roomingList([{ name: 'שירן', room: 'double', roommate: 'דנה' }, { name: 'דנה', room: 'double', roommate: 'שירן' }, { name: 'יוסף', room: 'double', roommate: 'ניצן' }, { name: 'ניצן', room: 'double' }]);
  assert.equal(r.rooms.length, 2); assert.equal(r.unpaired.length, 0);
  // a named partner whose own room is not set yet is paired; a partner who asked for a single is not
  const r2 = roomingList([{ name: 'שירן', room: 'double', roommate: 'קלאודיה' }, { name: 'קלאודיה', room: '' }, { name: 'רון', room: 'double', roommate: 'גיל' }, { name: 'גיל', room: 'single' }]);
  assert.deepEqual(r2.rooms.map(x => x.names), [['שירן', 'קלאודיה'], ['גיל']]); assert.deepEqual(r2.unpaired.map(p => p.name), ['רון']);
});

test('summaries: dietary counts and notes, rsvp counts', () => {
  const d = dietarySummary(people);
  assert.equal(d.counts.vegetarian, 2); assert.equal(d.counts.kosher, 0); assert.equal(d.counts.vegan, 1); assert.equal(d.counts.glutenfree, 1);
  assert.deepEqual(d.notes, [{ name: 'שירן לוי', text: 'אלרגיה לאגוזים' }]);
  assert.equal(d.total, 6); assert.equal(d.special, 3);
  assert.deepEqual(rsvpSummary(people), { total: 7, invited: 1, yes: 4, no: 1, maybe: 1, attending: 6 });
});

test('name tags: printed name first, tab separated, sorted, without the ones who said no', () => {
  const t = nameTagsText(people).split('\n');
  assert.equal(t.length, 6);
  assert.ok(t.includes('Anna R.\tBertelsmann'));
  assert.ok(t.includes('דנה כהן\tשוב״ל'));
  assert.ok(!t.some(x => /צופיה/.test(x)));
});

test('csv: BOM, Hebrew headers, quotes and commas escaped, phones pretty', () => {
  assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('he said "hi"'), '"he said ""hi"""'); assert.equal(csvCell('plain'), 'plain'); assert.equal(csvCell(null), '');
  const csv = toCsv([{ name: 'דנה, כהן', phone: '0521234567', rsvp: 'yes', room: 'single', dietTags: ['kosher'], notes: 'שורה\nשנייה' }], 'he');
  assert.ok(csv.startsWith(String.fromCharCode(0xFEFF) + 'שם,טלפון,מייל'));
  const rows = csv.split('\r\n');
  assert.equal(rows.length, 2); // header + one record: the newline inside the quoted note is not a row break
  assert.ok(rows[1].startsWith('"דנה, כהן",052-1234567,,,,מגיע,סינגל,,,,כשר,,,"שורה'));
});

const cs = { client: 'ארגון שוב״ל', kind: 'יום גיבוש', date: '2026-10-19', days: '2', place: 'הרצליה', participants: '16-20' };

test('hotel text in three languages, in her voice, numbered rooms', () => {
  const he = hotelListText(people, cs, 'he', 'וירג׳יני 054-4974644');
  assert.match(he, /^היי היי, מה שלומך\?\nמצורפת רשימת החדרים ליום גיבוש של ארגון שוב״ל ב-19\/10\/2026 \(2 ימים\):\nחדרי סינגל \(1\):\n1\. יוסי לוי\nחדרים זוגיים \(2\):\n1\. דנה כהן \+ שירן לוי · הגעה 19\/10 14:00\n2\. Anna Roth \+ Tom Bell \(השותף\/ה לחדר יאושר\)\nעוד בלי שותף\/ה לחדר \(1\):\n1\. משה פרץ\nסה״כ 3\+ חדרים ל-6 אורחים\.\nאשמח לאישור שקיבלת בבקשה\. תודה רבה!\nוירג׳יני 054-4974644$/);
  const en = hotelListText(people, cs, 'en');
  assert.match(en, /^Hi, hope you are doing well!\nHere is the rooming list for יום גיבוש of ארגון שוב״ל on 19\/10\/2026 \(2 days\):\nSingle rooms \(1\)/);
  assert.match(en, /Total: 3\+ rooms for 6 guests\./);
  const fr = hotelListText(people, cs, 'fr');
  assert.match(fr, /^Bonjour, j’espère que vous allez bien !\n/); assert.match(fr, /Chambres doubles \(2\)/);
  [he, en, fr].forEach(noArabic);
});

test('catering text lists needs with names and the notes', () => {
  const he = cateringText(people, cs, 'he');
  assert.match(he, /סה״כ 6 סועדים\.\nצרכים מיוחדים:\nצמחוני: 2 \(דנה כהן, שירן לוי\)\nטבעוני: 1 \(רונית\)\nללא גלוטן: 1 \(שירן לוי\)\nאלרגיות והערות:\n• שירן לוי: אלרגיה לאגוזים/);
  assert.match(cateringText([{ name: 'x', rsvp: 'yes' }], cs, 'en'), /1 guests in total\.\nNo special dietary needs\./);
  assert.match(cateringText(people, cs, 'fr'), /Végétarien : 2/);
});

test('rsvp ask per language, with the first name and the place', () => {
  assert.equal(rsvpAskText({ name: 'דנה כהן' }, cs, 'he', 'וירג׳יני'), 'היי דנה, מה שלומך? :)\nאשמח לאישור הגעה ליום גיבוש של ארגון שוב״ל ב-19/10/2026 (2 ימים) בהרצליה בבקשה.\nאם יש צרכים מיוחדים באוכל, כתבו לי. תודה רבה!\nוירג׳יני');
  assert.match(rsvpAskText({ name: 'Anna Roth' }, cs, 'en'), /^Hi Anna, hope you are doing well!\nCan you confirm you are coming to/);
  assert.match(rsvpAskText({ name: 'Marc' }, cs, 'fr'), /^Bonjour Marc, j’espère/);
});

test('planned count reads "100" and "16-20"; newOnes skips same name or same phone', () => {
  assert.deepEqual(plannedCount({ participants: '16-20' }), { min: 16, max: 20, text: '16-20' });
  assert.deepEqual(plannedCount({ participants: '100' }), { min: 100, max: 100, text: '100' });
  assert.equal(plannedCount({}), null);
  const fresh = newOnes([{ name: 'דנה כהן', phone: '052-1234567' }], [{ name: 'דנה כהן' }, { name: 'ד. כהן', phone: '+972521234567' }, { name: 'חדש', phone: '' }]);
  assert.deepEqual(fresh.map(p => p.name), ['חדש']);
});

test('addFromText adds only the new ones to the store', async () => {
  const rows = [{ id: 'p1', caseId: 'c1', name: 'דנה כהן', phone: '' }];
  const fake = { list: (col, pred) => rows.filter(pred), put: (col, o) => { o.id = o.id || 'p' + (rows.length + 1); rows.push(o); return o.id; } };
  const r = await addFromText('c1', 'דנה כהן\nיוסי לוי, 050-1111111\nAnna', fake);
  assert.equal(r.added.length, 2); assert.equal(r.skipped, 1);
  assert.equal(rows.length, 3); assert.equal(rows[1].caseId, 'c1'); assert.equal(rows[1].rsvp, 'invited');
});

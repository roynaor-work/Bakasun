import { pathToFileURL } from 'node:url';
const R = '/home/user/Bakasun/js/';
const imp = f => import(pathToFileURL(R + f).href);
const mail = await imp('logic/mailImport.js'); const con = await imp('logic/contacts.js'); const ci = await imp('contactsImport.js');
const Office = (await imp('logic/office.js')).default; const brief = await imp('logic/brief.js'); const cmd = await imp('logic/commands.js'); const tr = await imp('logic/travel.js');
const rtl = '‮​‍﻿⁦';
const N = 200000;
const cases = {
  'a x200k': 'a'.repeat(N), 'spaces x200k': ' '.repeat(N), 'a b x100k': 'a '.repeat(N / 2), 'newlines x100k': '\n'.repeat(N / 2),
  'digits x200k': '1'.repeat(N), 'digit-space x100k': '1 '.repeat(N / 2), 'dots/dashes': '-.'.repeat(N / 2), '<<< x100k': '<'.repeat(N / 2), '"" x100k': '"'.repeat(N / 2),
  'long header': 'From: ' + 'x'.repeat(N) + '\nSubject: ' + 'y'.repeat(N) + '\n\n' + 'z'.repeat(1000), 'at-signs': '@'.repeat(N / 2), 'email-ish': 'a@'.repeat(N / 4) + 'b.com',
  'hebrew x100k': 'ש'.repeat(N / 2), 'quote-nest': '> '.repeat(N / 4) + 'hi', 'invisible': rtl.repeat(N / 5), 'date-ish': '12/'.repeat(N / 3), 'phone-ish': '05'.repeat(N / 4) + '-'.repeat(1000),
  'vcard-bomb': 'BEGIN:VCARD\n' + 'TEL:' + '1'.repeat(N) + '\nEND:VCARD\n', 'vcard-many': 'BEGIN:VCARD\nFN:x\nEND:VCARD\n'.repeat(20000), 'csv-quote-bomb': 'Name,Phone\n"' + 'x,'.repeat(N / 2), 'csv-wide': ','.repeat(N), 'csv-rows': ('a,b\n').repeat(N / 4),
};
const targets = {
  parseMail: t => mail.parseMail(t, {}), cleanMail: t => mail.cleanMail(t), takeDates: t => mail.takeDates(t, '2026-11-04'), takeOrg: t => mail.takeOrg(t, t, 'a@b.co'), takeName: t => mail.takeName(t), takePhone: t => mail.takePhone(t), takeBudget: t => mail.takeBudget(t, {}), takeVenue: t => mail.takeVenue(t),
  parseVcf: t => con.parseVcf(t), parseContactsCsv: t => con.parseContactsCsv(t), 'Office.parseLead': t => Office.parseLead ? Office.parseLead(t, 'he') : null, 'brief.parse': t => (brief.parseBrief || brief.splitBrief || (() => null))(t),
  'commands.parse': t => (cmd.parseCommand || cmd.interpret || (() => null))(t), 'takeWhen': t => tr.takeWhen(t, '2026-11-04'),
};
let worst = [];
for (const [tn, fn] of Object.entries(targets)) for (const [cn, text] of Object.entries(cases)) {
  process.stdout.write('> ' + tn + ' | ' + cn + '\n');
  const t0 = performance.now(); let err = '';
  try { const w = fn(text); if (w && typeof w.then === 'function') await w; } catch (e) { err = String(e.message || e).slice(0, 50); }
  const ms = performance.now() - t0; worst.push({ tn, cn, ms: Math.round(ms), err }); if (ms > 500) process.stdout.write('   SLOW ' + Math.round(ms) + 'ms\n');
}
worst.sort((a, b) => b.ms - a.ms);
console.log('slowest 12:'); worst.slice(0, 12).forEach(w => console.log(w.ms + 'ms', w.tn, '|', w.cn, w.err));
console.log('errors (exceptions on hostile input):', worst.filter(w => w.err).map(w => w.tn + '|' + w.cn + ': ' + w.err).slice(0, 12));
console.log('count over 1s:', worst.filter(w => w.ms > 1000).length, 'of', worst.length);

import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import { serve } from './srv.mjs';
const [,, root] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const fx = JSON.parse(fs.readFileSync('/home/user/Bakasun/tests/e2e/fixture.json','utf8'));
const X = `"'><b id="xss-a">x</b><i id="xss-b" onclick="window.__x=1">y</i>`;
const INV = '‮​‍﻿⁦⁧';
const { server, base } = await serve(root);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
await ctx.addInitScript(d => { if (!localStorage.getItem('bakasun.v1')) localStorage.setItem('bakasun.v1', JSON.stringify(Object.assign({ settings: {} }, d))); window.__csp = []; addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective)); }, fx);
const p = await ctx.newPage(); await p.route(/fonts\.|supabase/, r => r.abort());
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
const out = [];
const check = async what => { const r = await p.evaluate(() => ({ a: !!document.getElementById('xss-a'), b: !!document.getElementById('xss-b'), x: window.__x || 0, csp: window.__csp.length, inl: document.querySelectorAll('[onclick],[onerror],[onload]').length })); out.push({ what, ok: !(r.a || r.b || r.x || r.csp || r.inl), ...r }); };
// 1) pasted hostile mails
const mails = [
  `From: ${X} <evil${X}@x.co>\nSubject: ${X}\n\nשלום, מחפשים אולם ל-${X} איש ב-19/11/2026. תקציב ${X} ₪. ${INV.repeat(50)}\n${X}\n050-1234567`,
  `From: ${'x'.repeat(50000)}\nSubject: ${'y'.repeat(50000)}\n\n${'z '.repeat(30000)}`,
  `מאת: ${INV}${X}\nנושא: ${INV}\n\n${'‮'.repeat(3000)}שלום`,
  ('1.'.repeat(100000)),
];
for (const [i, m] of mails.entries()) {
  await p.goto(base + 'index.html#/import'); await p.reload(); await p.waitForSelector('#mail');
  await p.fill('#mail', m); const t0 = Date.now(); await p.click('#read'); await p.waitForTimeout(500);
  const hang = Date.now() - t0; await check('mail ' + i + ' (' + hang + 'ms)');
  // open the card's inputs: every value must be text
  await p.click('#imForm button[type=submit]', { timeout: 1500 }).catch(() => {}); await p.waitForTimeout(250); await check('mail ' + i + ' after save');
}
// 2) hostile contact files in settings
const files = {
  'evil.csv': `Name,Phone,Email,Company\n"${X}","${X}","a${X}@b.co","${X}"\n${'a,'.repeat(5000)}\n"${'q'.repeat(100000)}",1,2,3`,
  'evil.vcf': `BEGIN:VCARD\nFN:${X}\nTEL:${X}\nEMAIL:${X}\nORG:${X}\nNOTE:${X}\nEND:VCARD\nBEGIN:VCARD\nFN:${'x'.repeat(100000)}\nEND:VCARD\n`,
};
for (const [name, body] of Object.entries(files)) {
  await p.goto(base + 'index.html#/settings'); await p.reload(); await p.waitForSelector('#contactsFile', { state: 'attached' });
  await p.setInputFiles('#contactsFile', { name, mimeType: name.endsWith('csv') ? 'text/csv' : 'text/vcard', buffer: Buffer.from(body) }); await p.waitForTimeout(800); await check(name + ' preview');
  const apply = await p.$('#ciPreview button.primary'); if (apply) { await apply.click().catch(() => {}); await p.waitForTimeout(400); await check(name + ' applied'); }
}
// 3) hostile backup file
const backup = { clients: [{ id: 'bk1', name: X, phone: X, email: X, aliases: X }], cases: [{ id: 'bk2', client: X, place: X, purpose: X, status: X, kind: X, date: X }], suppliers: [{ id: 'bk3', name: X, type: X }], tasks: [{ id: 'bk4', title: X, who: X }], notes: [{ id: 'bk5', text: X, about: X, aboutId: X }], payments: [{ id: 'bk6', caseId: X, supplier: X, status: X, amount: X }], links: [{ id: 'bk7', caseId: X }], team: [{ id: 'bk8', name: X, role: X }], settings: { bizLegal: X, signer: X } };
await p.goto(base + 'index.html#/settings'); await p.reload(); await p.waitForSelector('#imp', { state: 'attached' });
await p.setInputFiles('#imp', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await p.waitForTimeout(600);
for (const r of ['today', 'cases', 'clients', 'suppliers', 'tasks', 'notes', 'money', 'settings', 'dashboard', 'calendar', 'board', 'search', 'bk2', 'receipts', 'calls', 'notifications']) {
  const h = r.startsWith('bk') ? 'case/' + r : r;
  await p.goto(base + 'index.html#/' + h); await p.reload(); await p.waitForSelector('#app > :not(noscript)', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(150); await check('backup ' + r);
}
await p.goto(base + 'index.html#/case/bk2'); await p.reload(); await p.waitForTimeout(300);
const tabs = await p.$$eval('[data-ctab]', x => x.map(y => y.dataset.ctab)); for (const t of tabs) { await p.click('[data-ctab="' + t + '"]', { timeout: 1500 }).catch(() => {}); await p.waitForTimeout(100); await check('backup case tab ' + t); }
console.log('checks:', out.length, 'failed:', out.filter(o => !o.ok).length, 'pageerrors:', errs.length, errs.slice(0, 3));
out.filter(o => !o.ok).forEach(o => console.log(JSON.stringify(o)));
console.log(out.filter(o => /mail/.test(o.what)).map(o => o.what).join(' | '));
await b.close(); server.close();

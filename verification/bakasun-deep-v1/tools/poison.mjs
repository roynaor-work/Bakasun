import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import { serve } from './srv.mjs';
const [,, root, mode='free'] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const fx = JSON.parse(fs.readFileSync('/home/user/Bakasun/tests/e2e/fixture.json','utf8'));
// hostile suffix: closes quotes/tags and plants two canary elements; any unescaped use shows up as an element with id xss-*
const P = `"'><b id="xss-a">x</b><i id="xss-b" onclick="window.__x=1">y</i>‮​${'A'.repeat(300)}`;
const SKIP = /^(id|updated|created|.*Id|date|due|start|end|time|sentAt|paidAt|invoicedAt|attempts|rating|active|lang|amount|price|cost|total|no|n|order|key|status|kind|type|about)$/i;
const poison = (o, depth=0) => { if (Array.isArray(o)) return o.map(x => poison(x, depth+1)); if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = typeof v === 'string' ? (SKIP.test(k) && mode === 'free' ? v : v + P) : poison(v, depth+1); return r; } return o; };
const bad = poison(fx);
const { server, base } = await serve(root);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
await ctx.addInitScript(d => { if (!localStorage.getItem('bakasun.v1')) localStorage.setItem('bakasun.v1', JSON.stringify(Object.assign({ settings: { poison: 1 } }, d))); window.open = () => null; window.__csp = []; addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); }, bad);
const p = await ctx.newPage(); await p.route(/fonts\.|supabase/, r => r.abort());
const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('dialog', d => d.dismiss());
const ids = k => bad[k].map(x => x.id);
const R = ['today','lead','cases','clients','calls','tasks','search','settings','more','suppliers','quotes','money','notes','assist','receipts','help','share','dashboard','calendar','contracts','budget','files','notifications','notifications/settings','board','board/stats','templates','import','portal','groups'];
for (const c of ids('cases')) R.push('case/'+c, 'groups/'+c, 'participants/'+c, 'budget/'+c, 'runsheet/'+c, 'runsheet/'+c+'/live', 'files/'+c, 'portal/'+c, 'tasks/case/'+c, 'templates/bookingConfirm/'+c);
for (const c of ids('clients')) R.push('client/'+c);
for (const c of ids('suppliers')) R.push('supplier/'+c);
const hits = [];
const check = async (what) => { const r = await p.evaluate(() => ({ a: !!document.getElementById('xss-a'), b: !!document.getElementById('xss-b'), x: window.__x || 0, csp: window.__csp.slice(), inl: [...document.querySelectorAll('[onclick],[onerror],[onload]')].map(e => e.outerHTML.slice(0, 80)) })); if (r.a || r.b || r.x || r.csp.length || r.inl.length) hits.push({ what, ...r }); };
for (const r of R) {
  await p.goto(base + 'index.html#/' + r); await p.reload(); await p.waitForSelector('#app > :not(noscript)', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(150); await check(r);
  if (/^case\/[^/]+$/.test(r)) { const tabs = await p.$$eval('[data-ctab]', x => x.map(y => y.dataset.ctab)); for (const t of tabs) { await p.click('[data-ctab="' + t + '"]', { timeout: 1500 }).catch(() => {}); await p.waitForTimeout(120); await check(r + ' tab ' + t); } }
  // open dialogs: click buttons that are not destructive, scan, close
  if (/^(today|cases|case\/[^/]+|clients|client\/.*|suppliers|supplier\/.*|tasks|money|calls|board|budget\/.*|participants\/.*|runsheet\/[^/]+|files\/.*|quotes|notes)$/.test(r)) {
    const n = await p.$$eval('#app button:not(.danger), #app summary', e => e.length);
    for (let i = 0; i < Math.min(n, 8); i++) {
      await p.goto(base + 'index.html#/' + r); await p.reload(); await p.waitForSelector('#app > :not(noscript)', { timeout: 10000 }).catch(() => {});
      const hs = await p.$$('#app button:not(.danger), #app summary'); if (!hs[i]) continue;
      const label = (await hs[i].innerText().catch(() => '')).slice(0, 40); if (/שליחה|וואטסאפ|מייל|ייצוא|הורד|הדפס|מחק|איפוס|התנתק/.test(label)) continue;
      await hs[i].click({ timeout: 1200 }).catch(() => {}); await p.waitForTimeout(200); await check(r + ' click[' + label + ']');
    }
  }
}
console.log('routes+states checked; hits:', hits.length, 'pageerrors:', errs.length, errs.slice(0, 3));
for (const h of hits.slice(0, 25)) console.log(JSON.stringify(h).slice(0, 300));
await b.close(); server.close();

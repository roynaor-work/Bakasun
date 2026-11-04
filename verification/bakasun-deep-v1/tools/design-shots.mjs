import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import { serve } from './srv.mjs';
const [,, root, outDir] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const fx = JSON.parse(fs.readFileSync('/home/user/Bakasun/tests/e2e/fixture.json','utf8'));
fs.mkdirSync(outDir, { recursive: true });
const { server, base } = await serve(root);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const report = [];
for (const [vw, vh, tag] of [[390, 844, 'm'], [1280, 800, 'd']]) {
  for (const scheme of ['light', 'dark']) {
    for (const design of ['classic', 'new']) {
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, locale: 'he-IL', colorScheme: scheme, deviceScaleFactor: 1 });
      await ctx.addInitScript(([fx, design]) => { localStorage.setItem('bakasun.v1', JSON.stringify(Object.assign({ settings: design === 'new' ? { design: 'new' } : {} }, fx))); }, [fx, design]);
      const p = await ctx.newPage(); await p.route(/fonts\.(googleapis|gstatic)|supabase/, r => r.abort());
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      for (const r of ['today', 'board']) {
        await p.goto(base + 'index.html#/' + r); await p.waitForSelector('#app > :not(noscript)'); await p.waitForTimeout(900);
        const st = await p.evaluate(() => ({ attr: document.documentElement.dataset.design || null, css: !!document.querySelector('link[href*="newdesign"]'), font: document.fonts.check('16px "Baka Noto"') }));
        await p.screenshot({ path: `${outDir}/${r}-${tag}-${scheme}-${design}.png` });
        report.push({ r, tag, scheme, design, ...st, errs: errs.length });
      }
      await ctx.close();
    }
  }
}
console.log(JSON.stringify(report.filter(x => x.tag === 'm' && x.scheme === 'light')));
console.log('errors total', report.reduce((s, x) => s + x.errs, 0));
await b.close(); server.close();

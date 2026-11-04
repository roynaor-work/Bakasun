import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import { serve } from './srv.mjs';
const [,, root, out] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const axe = fs.readFileSync(new URL('./axe.min.js', import.meta.url), 'utf8');
const fx = JSON.parse(fs.readFileSync('/home/user/Bakasun/tests/e2e/fixture.json','utf8'));
const { server, base } = await serve(root);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const cid=fx.cases[0].id;
const R=['today','cases','case/'+cid,'clients','suppliers','tasks','settings','money','calls','lead','assist','budget/'+cid,'participants/'+cid,'contracts','board','notes','templates','receipts','quotes'];
const SKIP = /שליחה|וואטסאפ|מייל|ייצוא|הורד|הדפס|מחק|הסרה|איפוס|התנתק/;
const found=[]; let dialogs=0, clicks=0;
for (const scheme of ['light','dark']) {
 const ctx = await b.newContext({ viewport:{width:390,height:844}, locale:'he-IL', colorScheme:scheme, bypassCSP:true });
 await ctx.addInitScript(fx => { if (!localStorage.getItem('bakasun.v1')) localStorage.setItem('bakasun.v1', JSON.stringify(Object.assign({settings:{}}, fx))); window.open=()=>null; }, fx);
 const p = await ctx.newPage(); await p.route(/fonts\.|supabase/, r=>r.abort());
 p.on('dialog',d=>d.dismiss());
 const SEL='#app button:not(.danger):not([data-del]):not([data-delete]), #app summary, .fab';
 for (const r of R) {
  await p.goto(base+'index.html#/'+r); await p.reload(); await p.waitForSelector('#app > :not(noscript)',{timeout:15000}).catch(()=>{});
  const n = await p.$$eval(SEL, e=>e.length);
  for (let i=0;i<Math.min(n,10);i++) {
   await p.goto(base+'index.html#/'+r); await p.reload(); await p.waitForSelector('#app > :not(noscript)',{timeout:15000}).catch(()=>{});
   const hs=await p.$$(SEL); if(!hs[i]) continue;
   const label=(await hs[i].innerText().catch(()=>'')).slice(0,30);
   if (SKIP.test(label)) continue;
   await hs[i].click({timeout:1500}).catch(()=>{}); await p.waitForTimeout(250); clicks++;
   if (await p.$('.modal')) dialogs++;
   await p.addScriptTag({content:axe}).catch(()=>{});
   const v=await p.evaluate(async()=>{ if(!window.axe) return []; const x=await axe.run(document,{resultTypes:['violations'],runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}); return x.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes[0].target.join(' ')+' :: '+(v.nodes[0].html||'').slice(0,110)}))});
   for (const x of v) found.push({scheme,r,label,...x});
  }
 }
 await ctx.close();
}
const agg={};for(const f of found){const k=f.id+'|'+f.impact+'|'+f.ex.slice(0,90);(agg[k]??={n:0,at:new Set()});agg[k].n+=f.n;agg[k].at.add(f.scheme+' '+f.r+' ['+f.label+']')}
for(const [k,a] of Object.entries(agg))console.log(a.n,k,'@',[...a.at].slice(0,3).join(' ; '));
console.log('clicks',clicks,'dialogs opened',dialogs,'distinct violations',Object.keys(agg).length);
fs.writeFileSync(out,JSON.stringify(found,null,1));
await b.close();server.close();

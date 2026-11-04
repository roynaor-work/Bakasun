import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import crypto from 'node:crypto'; import { serve } from './srv.mjs';
const [,, root, out, shotsDir] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const fx = JSON.parse(fs.readFileSync('/home/user/Bakasun/tests/e2e/fixture.json','utf8'));
const { server, base } = await serve(root);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport:{width:390,height:844}, locale:'he-IL' });
await ctx.addInitScript(fx => { if (!localStorage.getItem('bakasun.v1')) localStorage.setItem('bakasun.v1', JSON.stringify(Object.assign({settings:{}}, fx))); }, fx);
const page = await ctx.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, r=>r.abort());
let errs=[]; page.on('pageerror',e=>errs.push('pageerror '+e.message)); page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errs.push('console '+m.text())});
const cid=fx.cases[0].id, cl=fx.clients[0].id, su=fx.suppliers[0].id;
const R=['today','lead','cases','case/'+cid,'clients','client/'+cl,'calls','tasks','tasks/case/'+cid,'search','search/שובל','settings','more','suppliers','supplier/'+su,'quotes','quote/x','groups','money','notes','assist','assist/from-today','assist/supplier-quote','portal','receipts','help','share','dashboard','calendar','participants','participants/'+cid,'contracts','contract/x','budget','budget/'+cid,'runsheet/'+cid,'runsheet/'+cid+'/live','files','files/'+cid,'notifications','notifications/settings','board','board/stats','templates','templates/x/'+cid,'import','nonexistent'];
const res={};
fs.mkdirSync(shotsDir,{recursive:true});
async function cap(key){
  await page.waitForTimeout(250);
  const d=await page.evaluate(()=>{const a=document.getElementById('app');return{text:a.innerText.replace(/\s+/g,' ').trim(),len:a.innerHTML.length,nav:document.getElementById('nav').innerText.replace(/\s+/g,' ').trim()}});
  const file=shotsDir+'/'+key.replace(/\W+/g,'_')+'.png'; await page.screenshot({path:file,fullPage:false});
  res[key]={...d,text:d.text.slice(0,4000),h:crypto.createHash('md5').update(d.text).digest('hex'),errs:errs.splice(0)};
}
for(const r of R){ await page.goto(base+'index.html#/'+r); await page.reload(); await page.waitForSelector('#app > :not(noscript)',{timeout:20000}).catch(()=>{}); await cap(r);
  if(r==='case/'+cid){ const tabs=await page.$$eval('[data-ctab]',b=>b.map(x=>x.dataset.ctab)); for(const k of tabs){ await page.click('[data-ctab="'+k+'"]').catch(()=>{}); await cap('case-tab-'+k);} }
  if(r==='assist'){}
}
// desktop layout of a few
await page.setViewportSize({width:1280,height:800});
for(const r of ['today','dashboard','board','cases','case/'+cid]){ await page.goto(base+'index.html#/'+r); await page.reload(); await page.waitForSelector('#app > :not(noscript)').catch(()=>{}); await cap('desk-'+r); }
fs.writeFileSync(out,JSON.stringify(res,null,1));
console.log(Object.keys(res).length,'captured; errors:',Object.entries(res).filter(([k,v])=>v.errs.length).map(([k,v])=>k+': '+v.errs[0]).join(' | ').slice(0,1500));
await browser.close();server.close();

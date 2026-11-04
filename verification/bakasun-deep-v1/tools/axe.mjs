import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import { serve } from './srv.mjs';
const [,, root, out, label='x'] = process.argv;
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const axe = fs.readFileSync(new URL('./axe.min.js', import.meta.url), 'utf8');
const fx = JSON.parse(fs.readFileSync('/home/user/Bakasun/tests/e2e/fixture.json','utf8'));
const { server, base } = await serve(root);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const cid=fx.cases[0].id, cl=fx.clients[0].id, su=fx.suppliers[0].id;
const R=['today','lead','cases','case/'+cid,'clients','client/'+cl,'calls','tasks','search','settings','more','suppliers','supplier/'+su,'quotes','groups','money','notes','assist','receipts','help','share','dashboard','calendar','participants/'+cid,'contracts','contract/x','budget/'+cid,'runsheet/'+cid,'runsheet/'+cid+'/live','files/'+cid,'notifications','notifications/settings','board','board/stats','templates','templates/x/'+cid,'import','portal'];
const TABS=['details','suppliers','plan','money','lists','workgroup','history','participants','contract','checklist','budget','runsheet','files'];
const results=[];
for (const scheme of ['light','dark']) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, locale:'he-IL', colorScheme:scheme, bypassCSP:true });
  await ctx.addInitScript(([fx, des]) => { if (!localStorage.getItem('bakasun.v1')) localStorage.setItem('bakasun.v1', JSON.stringify(Object.assign({settings: des==='new' ? {design:'new'} : {}}, fx))); }, [fx, process.env.DESIGN||'']);
  const p = await ctx.newPage(); await p.route(/fonts\.|supabase/, r=>r.abort());
  const scan = async key => { await p.waitForTimeout(250); await p.addScriptTag({content: axe}).catch(()=>{});
    const r = await p.evaluate(async()=>{ if(!window.axe) return null; const x=await axe.run(document,{resultTypes:['violations'],runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}); return x.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,ex:v.nodes.slice(0,2).map(n=>n.target.join(' ')+' :: '+(n.html||'').slice(0,100))}))});
    results.push({scheme,key,v:r}); };
  for (const r of R) { await p.goto(base+'index.html#/'+r); await p.reload(); await p.waitForSelector('#app > :not(noscript)',{timeout:15000}).catch(()=>{}); await scan(r);
    if (r==='case/'+cid) for (const t of TABS) { const ok=await p.click('[data-ctab="'+t+'"]',{timeout:1500}).then(()=>true).catch(()=>false); if(ok) await scan('case-tab-'+t); } }
  await ctx.close();
}
fs.writeFileSync(out, JSON.stringify(results,null,1));
const agg={};for(const r of results){ if(!r.v){console.log('no axe',r.key);continue;} for(const v of r.v){const k=v.id+'|'+v.impact;(agg[k]??={n:0,screens:new Set(),help:v.help,ex:v.ex[0]});agg[k].n+=v.n;agg[k].screens.add(r.key+(r.scheme==='dark'?' (dark)':''));}}
for(const [k,a] of Object.entries(agg).sort((x,y)=>y[1].n-x[1].n)) console.log(k,a.n,'nodes',a.screens.size,'screens |',a.help,'|',a.ex);
console.log(label,'total violations(nodes):',Object.values(agg).reduce((s,a)=>s+a.n,0));
await b.close();server.close();

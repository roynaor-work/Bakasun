import { pathToFileURL } from 'node:url'; import https from 'node:https'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const root='/home/user/Bakasun'; const M=path.dirname(new URL(import.meta.url).pathname);
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=https.createServer({key:fs.readFileSync(M+'/k.pem'),cert:fs.readFileSync(M+'/c.pem')},(req,res)=>{let p=new URL(req.url,'http://x').pathname;if(p.endsWith('/'))p+='index.html';try{const b=fs.readFileSync(path.join(root,p));res.writeHead(200,{'content-type':TYPES[path.extname(p)]||'application/octet-stream'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const base='https://127.0.0.1:'+server.address().port+'/';
const { chromium } = await import(pathToFileURL('/opt/node-tools/node_modules/playwright/index.mjs').href);
const fx = JSON.parse(fs.readFileSync(root+'/tests/e2e/fixture.json','utf8'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--ignore-certificate-errors']});
const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},locale:'he-IL'});
await ctx.addInitScript(fx=>{if(!localStorage.getItem('bakasun.v1'))localStorage.setItem('bakasun.v1',JSON.stringify(Object.assign({settings:{}},fx)));},fx);
const p=await ctx.newPage(); await p.route(/fonts\.|supabase/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errs.push(m.text())});
await p.goto(base+'index.html#/today'); await p.waitForSelector('#app > :not(noscript)');
const want=await p.evaluate(async()=>{const s=await fetch('sw.js').then(r=>r.text());return (s.match(/'\.\/[^']+'/g)||[]).length});
let have=0;for(let i=0;i<60;i++){have=await p.evaluate(async()=>{const k=await caches.keys();const c=await caches.open(k.find(x=>x.startsWith('bakasun-v')));return (await c.keys()).length});if(have>=want-1)break;await p.waitForTimeout(500);}
console.log('SW lists',want,'cached',have);
await ctx.setOffline(true);
const cid=fx.cases[0].id;
const R=['today','cases','case/'+cid,'dashboard','calendar','board','budget/'+cid,'runsheet/'+cid,'files','participants/'+cid,'contracts','templates','import','assist','settings','tasks','notifications','help','search'];
let bad=0;
for(const r of R){await p.goto(base+'index.html#/'+r);await p.reload();const ok=await p.waitForSelector('#app > :not(noscript):not(.warnbox)',{timeout:8000}).then(()=>true).catch(()=>false);const w=await p.$('#app .warnbox');if(!ok||w){bad++;console.log('FAIL offline',r,w?await w.innerText():'');}}
console.log('offline routes',R.length,'failed',bad,'errors',errs.slice(0,3));
await b.close();server.close();

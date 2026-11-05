// Reproduce checked-in edge-handler behavior with local, injected dependencies.
// This file never contacts a payment processor or a deployed database.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import * as grow from '../../../supabase/functions/_shared/grow.mjs';
import {computeTotal} from '../../../supabase/functions/_shared/pricing.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dest=path.join(root,'audit/2026-11-05/iterations/02/backend.json');
const report={started:new Date().toISOString(),conditions:'Unmodified source handlers, TypeScript stripped; all network and environment dependencies synthetic',cases:[]};
for(const value of [undefined,null,'invalid','Infinity',0,100]){
  const info=grow.parseInfo({status:1,data:{transactionId:'audit-transaction',statusCode:2,...(value===undefined?{}:{sum:value})}});
  report.cases.push({name:'payment-amount-validation',input:value===undefined?'missing':value,finite:Number.isFinite(info.sum),accepted:grow.matchesOrder(info,{total:100},{transactionId:'audit-transaction'})});
}
let handler;const requests=[];
const source=await fs.readFile(path.join(root,'supabase/functions/grow-pay/index.ts'),'utf8');
const env={GROW_USER_ID:'synthetic',GROW_PAGE_CODE:'synthetic',SUPABASE_URL:'https://audit.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
const sandbox={...grow,computeTotal,PRODUCTS:[{id:'audit-cheap',price:10}],BUILD:{bases:[],addons:[],packs:[]},SHIPPING:{pickup:{price:0}},Response,URL,FormData,
  Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},
  fetch:async(url,options)=>{
    requests.push({url,method:options.method||'GET',body:options.body instanceof FormData?Object.fromEntries(options.body):options.body});
    if(url.includes('createPaymentProcess'))return {json:async()=>({status:1,data:{url:'https://payment.audit.invalid',processId:'audit-process',processToken:'synthetic'}})};
    return {ok:true,status:204};
  }};
runInNewContext(stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm,''),sandbox);
const response=await handler({method:'POST',url:'https://audit.invalid/functions/v1/grow-pay',json:async()=>({order:{no:'audit-existing-order',total:1000,items:[{id:'audit-cheap',qty:1,price:10}],customer:{name:'בדיקה סינתטית'}},returnBase:'https://untrusted.audit.invalid/return'})});
const patch=requests.find(r=>r.method==='PATCH');
report.cases.push({name:'payment-order-authorization-and-return-origin',status:response.status,readSavedOrder:requests.some(r=>r.url.includes('/north_orders')&&r.method==='GET'),patchTarget:patch?.url,patch:patch?JSON.parse(patch.body):null,
  returnUrl:requests.find(r=>r.url.includes('createPaymentProcess'))?.body?.successUrl});

// Real Postgres parser/runtime in WASM. A synthetic auth schema supplies Supabase
// dependencies. A fresh north.sql migration should compile before policies run.
const {PGlite}=await import(process.env.PGLITE_MODULE||'/tmp/bakasun-audit-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
try{await db.exec(await fs.readFile(path.join(root,'supabase/north.sql'),'utf8'));report.cases.push({name:'north-fresh-SQL',compiled:true});}
catch(e){report.cases.push({name:'north-fresh-SQL',compiled:false,code:e.code,message:e.message});}
await db.exec(`create table auth.users(id uuid primary key,email text);create table orgs(id uuid primary key default gen_random_uuid(),name text);
create table members(org_id uuid,user_id uuid,role text,primary key(org_id,user_id));
insert into auth.users values('00000000-0000-4000-8000-000000000001','allowed@audit.invalid'),('00000000-0000-4000-8000-000000000002','unrelated@audit.invalid');`);
await db.exec(await fs.readFile(path.join(root,'supabase/bootstrap.sql'),'utf8'));
const members=await db.query('select count(*)::int n from members');
report.cases.push({name:'bootstrap-membership',syntheticAuthUsers:2,membersAdded:members.rows[0].n,unrelatedUserEnrolled:(await db.query("select count(*)::int n from members where user_id='00000000-0000-4000-8000-000000000002'")).rows[0].n===1});
await db.close();
report.finished=new Date().toISOString();await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

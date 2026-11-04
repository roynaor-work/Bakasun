// Original family SQL + original client queue, local Postgres and synthetic data only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const runtime=process.env.PGLITE_RUNTIME||'/tmp/bakasun-audit-runtime/node_modules/@electric-sql/pglite/dist/';
const {PGlite}=await import(runtime+'index.js'),{pgcrypto}=await import(runtime+'contrib/pgcrypto.js');
const db=new PGlite({extensions:{pgcrypto}}),out=new URL('../iterations/13/',import.meta.url);await mkdir(out,{recursive:true});
const report={started:new Date().toISOString(),conditions:'Original supabase/family.sql without rewriting, PGlite with real pgcrypto extension, original workout cloud.js imported with synthetic storage/window/navigator and intercepted fetch; no remote request or real family code.',cases:[]};
try{
 await db.exec('create role anon;create role authenticated;');
 await db.exec(await readFile(new URL('../../../supabase/family.sql',import.meta.url),'utf8'));
 await db.query('select family_register($1),family_register($2)',['AUDITAA1','AUDITBB2']);
 const id='audit-session-collision';
 const first=await db.query('select family_push($1,$2::jsonb) n',['AUDITAA1',JSON.stringify([{id,kind:'basketball',payload:{revision:1,synthetic:true}}])]);
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});globalThis.window={addEventListener(){}};
 const rpc=[];globalThis.fetch=async(url,options)=>{
  if(!String(url).endsWith('/rest/v1/rpc/family_push'))throw Error('Unexpected endpoint; network forbidden');
  const {code,rows}=JSON.parse(options.body);const result=await db.query('select family_push($1,$2::jsonb) n',[code,JSON.stringify(rows)]);rpc.push({rowCount:rows.length,acknowledged:result.rows[0].n});
  return {ok:true,status:200,text:async()=>JSON.stringify(result.rows[0].n)};
 };
 const client=await import('../../../workout/js/cloud.js');
 const ok=await client.push('AUDITBB2','basketball',id,{revision:2,synthetic:true});
 const a=await db.query('select * from family_list($1,$2)',['AUDITAA1','basketball']);
 const b=await db.query('select * from family_list($1,$2)',['AUDITBB2','basketball']);
 const q=JSON.parse(values.get('kidfit.cloud.queue')||'[]');
 report.cases.push({name:'same-session-after-family-code-change',initialAck:first.rows[0].n,clientReportedSuccess:ok,clientPending:client.status.pending(),persistedQueueLength:q.length,rpc:rpc.slice(),oldFamilyRows:a.rows.length,oldFamilyRevision:a.rows[0]?.payload?.revision,newFamilyRows:b.rows.length,oldFamilyWasNotOverwritten:a.rows[0]?.payload?.revision===1});
 const valid=await client.push('AUDITBB2','basketball','audit-distinct-session',{revision:3,synthetic:true});
 const fresh=await db.query('select * from family_list($1,$2)',['AUDITBB2','basketball']);
 report.cases.push({name:'distinct-id-positive-control',clientReportedSuccess:valid,clientPending:client.status.pending(),newFamilyRows:fresh.rows.length,revision:fresh.rows[0]?.payload?.revision});
 navigator.onLine=false;
 await client.push('AUDITAA1','basketball','audit-pending-same-id',{revision:4,synthetic:true});
 const firstPending=client.status.pending();
 await client.push('AUDITBB2','basketball','audit-pending-same-id',{revision:5,synthetic:true});
 const queued=JSON.parse(values.get('kidfit.cloud.queue')||'[]');
 report.cases.push({name:'offline-queue-same-id-different-family',firstPending,afterSecondPending:client.status.pending(),queuedRows:queued.length,distinctFamilies:new Set(queued.map(x=>x.code)).size,firstFamilyEntryRetained:queued.some(x=>x.code==='AUDITAA1')});
}catch(e){report.harnessError=e.constructor.name+': '+e.message;}
finally{await db.close();}
report.finished=new Date().toISOString();await writeFile(new URL('family-sync.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createVideoCloud } from '../workout/js/vids-cloud.js';
import { EXERCISES } from '../workout/js/exercises.js';
const A='TESTAAAA', B='TESTBBBB', WRONG='WRONGXXX', BASE='https://storage.example.test';
const clip = (text='synthetic-video') => new Blob([text], {type:'video/mp4'});
const json = (data,status=200) => new Response(JSON.stringify(data), {status});
// A fetch contract double; actual SQL and HMAC are separately tested in PGlite.
function server() {
  const files=new Map(), calls=[], secret='fake-test-signing-secret-never-a-production-value';
  let now=Math.floor(Date.now()/1000);
  const sign = claims => {
    const header=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const payload=Buffer.from(JSON.stringify({...claims,iat:now,exp:now+120})).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256',secret).update(header+'.'+payload).digest('base64url')}`;
  };
  const request=async (url,opts={}) => {
    const u=new URL(url), method=opts.method || 'GET'; calls.push({url,method,opts});
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const {code,path,action}=JSON.parse(opts.body);
      if (![A,B].includes(code)) return json({message:'unknown family code'},401);
      if (u.pathname.endsWith('kidfit_vids_catalog')) {
        const latest=new Map();
        for (const [path,blob] of files) {
          if (!path.startsWith(code+'/')) continue;
          const [id,suffix]=path.split('/')[1].split('.'), version=Number(suffix || 0);
          if (!latest.has(id) || latest.get(id).version<version) latest.set(id,{id,path,mime:blob.type,updated:path,version});
        }
        return json([...latest.values()]);
      }
      if (!/^[A-Z0-9]{8,12}\/[a-z0-9][a-z0-9-]{0,79}(\.[0-9]{1,20})?$/.test(path) || path.split('/')[0]!==code) return json({message:'invalid family path'},403);
      if (!['download','upload'].includes(action)) return json({},400);
      if (action==='upload' && files.has(path)) return json({message:'video already exists',code:'23505'},409);
      if (action==='download' && !files.has(path)) return json({},404);
      const token=sign({url:'kidfit-vids/'+path,scope:action,...action==='upload'?{upsert:false}:{}});
      return json({path:`/storage/v1/object/${action==='upload'?'upload/sign':'sign'}/kidfit-vids/${path}?token=${token}`,expires:now+120});
    }
    const match=u.pathname.match(/^\/storage\/v1\/object\/(upload\/sign|sign)\/kidfit-vids\/(.+)$/);
    if (!match) return json({},403);
    const [,route,path]=match, token=u.searchParams.get('token') || '';
    const [header,payload,signature]=token.split('.'); let claims;
    try {
      if (signature!==createHmac('sha256',secret).update(header+'.'+payload).digest('base64url')) throw Error();
      claims=JSON.parse(Buffer.from(payload,'base64url'));
    } catch { return json({},403); }
    const action=route==='sign'?'download':'upload';
    if (claims.exp<=now || claims.url!=='kidfit-vids/'+path || claims.scope!==action) return json({},403);
    if (action==='upload') {
      if (method!=='PUT' || claims.upsert!==false) return json({},403);
      if (files.has(path)) return json({message:'video already exists'},409);
      files.set(path,opts.body); return json({});
    }
    if (method!=='GET') return json({},403);
    return new Response(files.get(path));
  };
  return { files,calls,fetch:request,advance:seconds=>{now+=seconds;},
    client:createVideoCloud({baseUrl:BASE,publicKey:'fake-public-key',fetch:request}) };
}
// Minimal asynchronous IndexedDB contract used by vids.js, with structured cloning.
function idb(records) {
  return {open() {
    const open={};
    setImmediate(()=>{ open.result={close(){}, transaction() {
      const transaction={}; let pending=0;
      const request=(fn)=>{ const req={}; pending++; setImmediate(()=>{
        try { req.result=structuredClone(fn()); req.onsuccess?.(); } catch(e) {transaction.error=e; transaction.onerror?.();}
        pending--; setImmediate(()=>{if(!pending) transaction.oncomplete?.();});
      }); return req; };
      transaction.objectStore=()=>({get:key=>request(()=>records.get(key)),getAllKeys:()=>request(()=>[...records.keys()]),
        put:(value,key)=>request(()=>{records.set(key,structuredClone(value));return key;}),delete:key=>request(()=>{records.delete(key);})});
      setImmediate(()=>{if(!pending) transaction.oncomplete?.();});
      return transaction;
    }}; open.onsuccess?.(); }); return open;
  }};
}
let serial=0;
async function moduleHarness(s, {records=new Map(),metadata}={}) {
  const memory=new Map(metadata ? [['kidfit.cloudVids',JSON.stringify(metadata)]]:[]);
  globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  globalThis.indexedDB=idb(records); globalThis.fetch=s.fetch;
  const vids=await import(`../workout/js/vids.js?vids-test=${++serial}`);
  return {vids,records,memory};
}
const nativeFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=nativeFetch;delete globalThis.localStorage;delete globalThis.indexedDB;});

test('catalog and signed GET/PUT never list, use public links, DELETE or x-upsert', async()=>{
  const s=server(); s.files.set(`${A}/squats`,clip('legacy'));
  const entry=await s.client.upload(A,'squats',clip('new'));
  assert.match(entry.path,/TESTAAAA\/squats\.\d+$/);
  assert.equal((await s.client.catalog(A))[0].path,entry.path);
  assert.equal(await (await s.client.download(A,entry.path)).text(),'new');
  assert.equal(await s.files.get(`${A}/squats`).text(),'legacy');
  assert.ok(s.calls.some(c=>c.method==='PUT'));
  for (const c of s.calls) {
    assert.doesNotMatch(c.url,/\/object\/(list|public)\//); assert.notEqual(c.method,'DELETE');
    assert.equal(Object.keys(c.opts.headers || {}).some(k=>k.toLowerCase()==='x-upsert'),false);
  }
});
test('wrong codes, foreign paths and malformed grants fail before sending media', async()=>{
  const s=server();
  await assert.rejects(s.client.catalog(WRONG),/לא רשום/);
  await assert.rejects(s.client.upload(WRONG,'squats',clip()),/לא רשום/);
  for (const path of [`${B}/squats.1`,`${A}/../squats`,`${A}/squats.mp4`]) await assert.rejects(s.client.access(A,path,'download'),/נתיב/);
  assert.equal(s.calls.some(c=>c.url.includes('/storage/')),false);
  await assert.rejects(s.client.access(A,`${A}/squats`,'delete'),/פעולת/);
  for (const grant of [
    {path:`/storage/v1/object/sign/kidfit-vids/${B}/squats?token=fake`,expires:Date.now()/1000+120},
    {path:`/storage/v1/object/sign/kidfit-vids/${A}/squats?token=fake`,expires:1},
    {path:'https://other.example.test/?token=fake',expires:Date.now()/1000+120}]) {
    const c=createVideoCloud({baseUrl:BASE,publicKey:'fake',fetch:async()=>json(grant)});
    await assert.rejects(c.access(A,`${A}/squats`,'download'),/הרשאת/);
  }
});
test('a capability is bound to path/action, expires at 120s and cannot overwrite even with concurrent grants',async()=>{
  const s=server();s.files.set(`${A}/squats`,clip('old'));
  const url=await s.client.access(A,`${A}/squats`,'download');
  assert.equal((await s.fetch(url.replace(A,B))).status,403);
  assert.equal((await s.fetch(url.replace('/object/sign/','/object/upload/sign/'),{method:'PUT',body:clip()})).status,403);
  const path=`${A}/squats.100`;
  const grants=await Promise.all([1,2].map(()=>s.client.access(A,path,'upload')));
  assert.equal((await s.fetch(grants[0],{method:'PUT',body:clip('winner')})).status,200);
  assert.equal((await s.fetch(grants[1],{method:'PUT',body:clip('loser')})).status,409);
  await assert.rejects(s.client.access(A,path,'upload'),/409/);
  assert.equal(await s.files.get(path).text(),'winner');
  s.advance(120);assert.equal((await s.fetch(url)).status,403);
});
test('new versions replace legacy cache and uploaded local copies on both phones',async()=>{
  const s=server();s.files.set(`${A}/squats`,clip('legacy'));
  const {vids,records}=await moduleHarness(s,{records:new Map([['c:squats',{blob:clip('unsafe'),updated:'old'}]]),metadata:{squats:{updated:'old'}}});
  assert.deepEqual(vids.cloudVideos(),{});
  await vids.refreshVideos();assert.equal(records.has('c:squats'),false);
  await vids.refreshCloud(A); const first=await vids.videoUrl('squats',A);
  assert.equal(await (await nativeFetch(first.url)).text(),'legacy');
  const local=clip('first upload');await vids.saveVideo('squats',local);await vids.cloudUpload(A,'squats',local);
  assert.equal(vids.sourceOf('squats'),'local');
  const old=vids.cloudVideos().squats.path;
  const newer=await s.client.upload(A,'squats',clip('second phone'),Number(old.split('.')[1]));
  await vids.refreshCloud(A);assert.equal(vids.cloudVideos().squats.path,newer.path);
  assert.equal(vids.sourceOf('squats'),'cloud');
  const media=await vids.videoUrl('squats',A);assert.equal(await (await nativeFetch(media.url)).text(),'second phone');
  const cached=records.get('c:squats');assert.equal(cached.code,A);assert.equal(cached.path,newer.path);
  const other=await moduleHarness(s);await other.vids.refreshCloud(A);
  assert.equal(await (await nativeFetch((await other.vids.videoUrl('squats',A)).url)).text(),'second phone');
  assert.ok(s.files.has(`${A}/squats`));assert.ok(s.files.has(old));
});
test('family switches and late responses never reveal an old family cache',async()=>{
  const s=server();s.files.set(`${A}/squats`,clip('A'));
  const {vids,memory,records}=await moduleHarness(s);
  await vids.refreshCloud(A);await vids.videoUrl('squats',A);
  assert.equal(await vids.videoUrl('squats',B),null);assert.deepEqual(vids.cloudVideos(),{});
  assert.equal(memory.has('kidfit.cloudVids'),false);
  await vids.refreshVideos();assert.equal(records.has('c:squats'),false);
  let release;const actual=s.fetch;
  globalThis.fetch=(url,options)=>new Promise(resolve=>{release=()=>resolve(actual(url,options));});
  const pending=vids.refreshCloud(A);vids.setVideoFamily(B);release();await pending;
  assert.deepEqual(vids.cloudVideos(),{});globalThis.fetch=s.fetch;
  await vids.refreshCloud(WRONG);assert.match(vids.vidStatus.error,/לא רשום/);
  assert.equal(await vids.cloudUpload(WRONG,'squats',clip()),false);
});
test('delete removes only device files and cached bytes; cloud source remains',async()=>{
  const s=server();s.files.set(`${A}/squats`,clip());
  const {vids,records}=await moduleHarness(s);await vids.refreshCloud(A);await vids.videoUrl('squats',A);
  await vids.saveVideo('squats',clip('local'));const calls=s.calls.length;
  await vids.deleteVideo('squats');assert.equal(s.calls.length,calls);
  assert.equal(records.has('squats'),false);assert.equal(records.has('c:squats'),false);
  assert.equal(vids.sourceOf('squats'),'cloud');assert.equal(s.files.size,1);
});
test('static migration guard forbids reserved role changes, Storage mutation and private-fence removal',async()=>{
  const raw=await readFile(new URL('../supabase/vids-signed.sql',import.meta.url),'utf8');
  const sql=raw.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,'');
  for (const prohibited of [/\bcreate\s+role\b/i,/\b(?:grant|revoke)\b[^;]*\b(?:supabase_\w*|authenticator)\b/i,
    /\balter\s+(?:table|schema)\s+(?:"?storage"?)[.\s]/i,/\bdrop\s+policy\b[^;]*\bkidfit_vids_private\b/i,
    /\b(?:update|insert\s+into|delete\s+from)\s+storage\./i,/service_role/i]) assert.doesNotMatch(sql,prohibited);
  assert.match(sql,/issued \+ 120/);assert.match(sql,/'upsert', false/);
  const app=await readFile(new URL('../workout/js/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/cloudDelete/);assert.match(app,/מחיקה מהענן נעשית בלוח הבקרה/);
  assert.doesNotMatch(app.split("$('#fam').oninput")[1].split('\n')[0],/cloud\.register/);
  for (const ex of EXERCISES) assert.match(ex.id,/^[a-z0-9][a-z0-9-]{0,79}$/);
});

test('current cache survives reload and late downloads cannot repopulate a switched family',async()=>{
  const s=server();s.files.set(`${A}/squats.100`,clip('cached A'));
  const first=await moduleHarness(s);await first.vids.refreshCloud(A);await first.vids.videoUrl('squats',A);
  const metadata=JSON.parse(first.memory.get('kidfit.cloudVids'));
  const second=await moduleHarness(s,{records:first.records,metadata});
  second.vids.setVideoFamily(A);await second.vids.refreshVideos();
  const before=s.calls.length;
  assert.equal(await (await nativeFetch((await second.vids.videoUrl('squats',A)).url)).text(),'cached A');
  assert.equal(s.calls.length,before);
  await second.vids.deleteVideo('squats');
  let release, started;const gate=new Promise(resolve=>{started=resolve;});
  globalThis.fetch=(url,options)=>url.includes('/object/sign/') ? new Promise(resolve=>{release=()=>resolve(s.fetch(url,options));started();}) : s.fetch(url,options);
  const pending=second.vids.videoUrl('squats',A);await gate;second.vids.setVideoFamily(B);release();
  assert.equal(await pending,null);await second.vids.refreshVideos();
  assert.equal(second.records.has('c:squats'),false);globalThis.fetch=s.fetch;
});

test('two clients uploading in the same second create distinct files after collision',async()=>{
  const s=server(), now=Date.now();
  const make=()=>createVideoCloud({baseUrl:BASE,publicKey:'fake',fetch:s.fetch,now:()=>now});
  const first=await make().upload(A,'squats',clip('one'));
  const second=await make().upload(A,'squats',clip('two'));
  assert.notEqual(first.path,second.path);assert.equal(s.files.size,2);
  assert.equal((await s.client.catalog(A))[0].path,second.path);
});

// Validate rejection atomicity using the real store and synthetic in-memory data.
import fs from 'node:fs/promises';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))};
const {db,setChangeHook}=await import('../../../js/store.js?audit-atomicity');
db.put('clients',{id:'audit-existing',name:'בדיקה סינתטית'});
await new Promise(r=>setTimeout(r,200));
const changes=[];setChangeHook(c=>changes.push({col:c.col,id:c.id}));
let error=null;
try{db.importJson(JSON.stringify({clients:[{id:'audit-first',name:'בדיקה סינתטית',updated:'2999-01-01'},{id:'audit-existing',name:'בדיקה סינתטית',updated:{toString:'not-callable'}}]}));}
catch(e){error=e.message;}
const report={at:new Date().toISOString(),conditions:'real store, in-memory localStorage and change hook; no cloud',importThrew:!!error,error,firstRowStillInMemory:!!db.get('clients','audit-first'),changeCallbacksBeforeRejection:changes,firstRowInPersistedBackup:!!JSON.parse(memory.get('bakasun.v1')).clients.find(x=>x.id==='audit-first')};
await fs.writeFile(new URL('../iterations/06/backup-atomicity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);

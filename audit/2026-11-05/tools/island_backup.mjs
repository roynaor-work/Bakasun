// Bounded adversarial corpus against the original import API; all data stays in memory.
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {loadData} from '../../../workout/island/engine/load-data.mjs';
import {createEngine} from '../../../workout/island/engine/engine.mjs';
const data=await loadData(new URL('../../../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture(){const values=new Map();let deny=false;const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(deny)throw new DOMException('synthetic quota','QuotaExceededError');values.set(k,String(v));}};return {engine:createEngine(data,{storage,now:()=>1000}),values,deny(){deny=true;}};}
const initial=JSON.parse(fixture().engine.exportJSON());
const cases=[['valid-control',null,true],['invalid-json','{synthetic',false],['null','null',false],['array','[]',false],['number','42',false],['string','"synthetic"',false]];
const mutations=[
 ['version',999999],['version',-1],['version','18'],['money',-1],['money',{}],['money','1'],
 ['resources',null],['world',null],['world.size',200000],['buildings',null],
 ['avatar.created','yes'],['avatar.name',{}],['avatar.shirtColor','javascript:synthetic'],
 ['tutorial.step',-1],['team',null],['team.colors',['javascript:synthetic']],['players',[null]],
 ['parts',{invalid:-1}],['claimedRewards',{}],['completedMissions',{}],['completedEpisodes',{}],
 ['nextId',0],['playSeconds',-1],['city',null],['city.claimedGoals',{}],['cityManagement',null],
 ['learning',null],['fireCertificates',null],['hangar',null],['hoops',null],['readyPlan',null],
 ];
for(const [path,value] of mutations){const x=structuredClone(initial),parts=path.split('.'),last=parts.pop();let o=x;for(const part of parts)o=o[part];o[last]=value;cases.push(['mutate-'+path+'-'+JSON.stringify(value),JSON.stringify(x),false]);}
{const x=structuredClone(initial);x.buildings.push({...x.buildings[0]});cases.push(['duplicate-building-id',JSON.stringify(x),false]);}
{const x=structuredClone(initial);Object.defineProperty(x,'__proto__',{enumerable:true,value:{auditPolluted:true}});cases.push(['unknown-root-prototype-property',JSON.stringify(x),null]);}
{const x=structuredClone(initial);x.parts.constructor=1;cases.push(['reserved-part-constructor',JSON.stringify(x),false]);}
{const x=structuredClone(initial);cases.push(['nonfinite-json-number',JSON.stringify(x).replace('"money":'+x.money,'"money":1e309'),false]);}
const rows=[];
for(const [name,text,expected] of cases){
 const f=fixture(),before=f.engine.exportJSON(),stored=JSON.stringify([...f.values]);let result,error;const start=performance.now();
 try{result=f.engine.importJSON(text??before);}catch(e){error=e.constructor.name+': '+e.message;}
 const unchanged=f.engine.exportJSON()===before,persisted=JSON.stringify([...f.values])===stored,clean=({}).auditPolluted===undefined;
 rows.push({name,bytes:Buffer.byteLength(text??before),expectedAccepted:expected,accepted:!!result?.ok,reason:result?.reason,thrown:error??null,stateUnchanged:unchanged,storageUnchanged:persisted,prototypeClean:clean,durationMs:+(performance.now()-start).toFixed(3),pass:!error&&clean&&(expected===null||!!result?.ok===expected)&&(result?.ok||(unchanged&&persisted))});
}
{
 const f=fixture(),before=f.engine.exportJSON(),stored=JSON.stringify([...f.values]);f.deny();const result=f.engine.importJSON(before);
 rows.push({name:'valid-import-storage-denied',accepted:!!result.ok,reason:result.reason,stateUnchanged:f.engine.exportJSON()===before,storageUnchanged:JSON.stringify([...f.values])===stored,pass:!result.ok&&f.engine.exportJSON()===before&&JSON.stringify([...f.values])===stored});
}
const report={at:new Date().toISOString(),conditions:'Original createEngine/importJSON, bundled data from local files, deterministic in-memory storage, bounded synthetic corpus; no customer save, browser permissions or network. Unknown JSON properties are not required to reject if they have no effect.',cases:rows,summary:{total:rows.length,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length}};
await writeFile(new URL('../iterations/10/island-backup-corpus.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));for(const row of rows.filter(x=>!x.pass))console.log(JSON.stringify(row));

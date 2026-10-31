import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadSoccerDesignContracts} from '../workout/island/minigames/soccer-design-contracts.mjs';
import {SoccerDracoLoader} from '../workout/island/minigames/soccer-design-loader.mjs';
import {DRACOLoader} from '../workout/island/vendor/DRACOLoader.js';

const documents=await Promise.all(['tactics/soccer.json','controls/soccer.json','controls/interaction.json'].map(name=>readFile(new URL('../workout/island/design/'+name,import.meta.url),'utf8').then(JSON.parse)));
const documentFor=url=>String(url).includes('/tactics/')?documents[0]:String(url).endsWith('/interaction.json')?documents[2]:documents[1];
test('soccer design contracts share successful immutable data across reopened sessions',async()=>{
 let count=0;const fetcher=async url=>(count++,{ok:true,json:async()=>structuredClone(documentFor(url))});
 const first=loadSoccerDesignContracts(fetcher),second=loadSoccerDesignContracts(fetcher);assert.equal(first,second);
 const a=await first,b=await loadSoccerDesignContracts(fetcher);assert.equal(a,b);assert.equal(count,3);assert.ok(Object.isFrozen(a.tactics.formations[0].phases));
});
test('soccer retries rejected contract requests instead of caching loading failure for the next opening',async()=>{
 let fail=true,count=0;const fetcher=async url=>{count++;return fail?{ok:false,status:503}:{ok:true,json:async()=>structuredClone(documentFor(url))};};
 await assert.rejects(loadSoccerDesignContracts(fetcher),/503/);fail=false;
 const retried=await loadSoccerDesignContracts(fetcher);assert.equal(retried.controls.game,'soccer');assert.equal(count,6);
});
test('invalid soccer data rejects and is retried, never marked ready',async()=>{
 let invalid=true;const fetcher=async url=>({ok:true,json:async()=>invalid?{}:structuredClone(documentFor(url))});
 await assert.rejects(loadSoccerDesignContracts(fetcher),/Invalid soccer/);invalid=false;
 assert.equal((await loadSoccerDesignContracts(fetcher)).tactics.sport,'soccer');
});
test('soccer decoder consumes the full response and balances load completion on success and error',async()=>{
 const original=globalThis.fetch,events=[];
 const manager={resolveURL:url=>url,itemStart:url=>events.push(['start',url]),itemEnd:url=>events.push(['end',url]),itemError:url=>events.push(['error',url])};
 const loader=new SoccerDracoLoader(manager);loader.setDecoderPath('/local/');
 try{
  let consumed=false;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>{consumed=true;return new ArrayBuffer(4);}});
  assert.equal((await loader._loadLibrary('decoder.wasm','arraybuffer')).byteLength,4);assert.ok(consumed);assert.deepEqual(events.map(e=>e[0]),['start','end']);
  events.length=0;globalThis.fetch=async()=>({ok:false,status:503});await assert.rejects(loader._loadLibrary('decoder.wasm','arraybuffer'),/503/);assert.deepEqual(events.map(e=>e[0]),['start','error','end']);
 }finally{globalThis.fetch=original;loader.dispose();}
});
test('soccer worker failure rejects every pending decode and future reuse instead of hanging asset readiness',async()=>{
 const original=DRACOLoader.prototype._getWorker,worker=new EventTarget(),rejections=[];
 worker._callbacks={1:{reject:error=>rejections.push(error)},2:{reject:error=>rejections.push(error)}};
 DRACOLoader.prototype._getWorker=async()=>worker;const loader=new SoccerDracoLoader();
 try{
  assert.equal(await loader._getWorker(1,1),worker);assert.equal(await loader._getWorker(2,1),worker);
  worker.dispatchEvent(new Event('error'));assert.equal(rejections.length,2);assert.ok(rejections.every(e=>/Soccer Draco worker/.test(e.message)));
  await assert.rejects(loader._getWorker(3,1),/Soccer Draco worker/);
 }finally{DRACOLoader.prototype._getWorker=original;loader.dispose();}
});

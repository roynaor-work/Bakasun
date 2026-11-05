// Duplicate module identity reproduction with a tiny in-memory manifest/cache.
// The product modules are imported unchanged. No real network/cache is used.
import fs from 'node:fs/promises';
const fetches=[];
const cache=new Map();
globalThis.caches={open:async()=>({match:async k=>cache.get(k),put:async(k,v)=>cache.set(k,v)})};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,serviceWorker:{register:async()=>null}}});
globalThis.location={protocol:'http:'};globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.fetch=async url=>{
  if(String(url).includes('offline-manifest.json'))return new Response(JSON.stringify({core:[],shell:[],games:{soccer:['design/audit-synthetic.glb']}}),{headers:{'Content-Type':'application/json'}});
  fetches.push(String(url));await new Promise(r=>setTimeout(r,60));return new Response('synthetic-audit-bytes');
};
const a=await import('../../../workout/island/ui/offline.mjs');
const b=await import('../../../workout/island/ui/offline.mjs?v=island-v2-20261104-3');
const one=a.downloadGames({games:['soccer']});const two=a.downloadGames({games:['soccer']});
await Promise.all([one,two]);
const control={samePromise:one===two,fetchCount:fetches.length};
cache.clear();fetches.length=0;
await Promise.all([a.downloadGames({games:['soccer']}),b.downloadGames({games:['soccer']})]);
const reproduction={distinctFunctionIdentities:a.downloadGames!==b.downloadGames,fetchCount:fetches.length,uniqueUrls:new Set(fetches).size};
const report={at:new Date().toISOString(),conditions:'same modules and URL identities as static graph; synthetic one-file manifest, Cache API and fetch; no remote request',control,reproduction};
await fs.writeFile(new URL('../iterations/04/offline-identity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);

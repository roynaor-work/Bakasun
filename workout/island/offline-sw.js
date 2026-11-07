/* Island asset cache (soccer, basketball, ski). The download itself runs in the page
 * (ui/offline.mjs fills the Cache API from offline-manifest.json, the one list of
 * files). This worker only serves those files from the device afterwards, so a phone
 * opens a game without re-downloading megabytes. Application code and ?v= tagged
 * data go to the network first (a new release always wins) and fall back to the
 * device copy when the network is gone or slow, so the island also opens offline.
 * A new release registers this worker with a new ?v= and the old cache is dropped. Game saves are never touched.
 * Plain classic worker: the island's script-src 'self' policy covers it; nothing is
 * evaluated from text. On a cache miss the network fetch has a timeout and one retry,
 * so a stalled connection ends in a clear failure the game can fall back from instead
 * of an endless wait. */
const VERSION=new URL(self.location.href).searchParams.get('v')||'dev';
const CACHE='island-assets-'+VERSION.replace(/[^\w.-]/g,'_');
let MISS_TIMEOUT_MS=45000;
const CODE_TIMEOUT_MS=6000;
const MANAGED=/\/(?:design|assets)\/.+\.(?:glb|webp|jpg|png|svg|ogg|mp3|json|wasm|mp4)$|\/vendor\/draco\/[^/]+\.(?:wasm|js)$/;
const SCOPE_PATH=new URL('./',self.location.href).pathname;
/** App shell: pages, modules, styles and data of the island, answered from the network
 * first (fresh code always wins) and from the device when the network is gone or slow. */
const SHELL=/\.(?:mjs|js|css|html|webmanifest)$|\/(?:data|episodes)\/[^/]+\.json$|\/offline-manifest\.json$/;
const shell=url=>url.origin===self.location.origin&&url.pathname.startsWith(SCOPE_PATH)&&!url.pathname.includes('..')&&url.pathname!==SCOPE_PATH+'offline-sw.js'&&url.pathname!==SCOPE_PATH+'release.json'&&(url.pathname===SCOPE_PATH||url.pathname===SCOPE_PATH+'index.html'||SHELL.test(url.pathname));
const bare=url=>url.origin+url.pathname;
const managed=url=>url.origin===self.location.origin&&!url.pathname.includes('..')&&MANAGED.test(url.pathname);
/** Media elements ask for byte ranges (Safari insists on a 206). Serve a slice of the cached copy. */
async function ranged(request,hit){
  const range=request.headers.get('range'),m=/^bytes=(\d*)-(\d*)$/.exec(range||'');
  if(!m||(m[1]===''&&m[2]===''))return hit;
  const blob=await hit.blob(),size=blob.size;let start=m[1]===''?Math.max(0,size-Number(m[2])):Number(m[1]),end=m[1]===''||m[2]===''?size-1:Math.min(Number(m[2]),size-1);
  if(start>=size||start>end)return new Response('',{status:416,headers:{'Content-Range':'bytes */'+size}});
  return new Response(blob.slice(start,end+1),{status:206,statusText:'Partial Content',headers:{'Content-Type':hit.headers.get('content-type')||'video/mp4','Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+size,'Accept-Ranges':'bytes'}});
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if((name.startsWith('island-assets-')||name.startsWith('island-soccer-'))&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
async function fetchWithTimeout(request,ms){
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),ms);
  try{return await fetch(request,{signal:control.signal});}finally{clearTimeout(timer);}
}
async function networkFirstTry(request){
  let last;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetchWithTimeout(request.clone(),MISS_TIMEOUT_MS);
      if(response.ok||response.status<500)return response;
      last=response;
    }catch(error){last=error;}
  }
  if(last instanceof Response)return last;
  const timedOut=last&&last.name==='AbortError';
  return timedOut?new Response('',{status:504,statusText:'island-asset-timeout'}):Response.error();
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  let url;try{url=new URL(request.url);}catch{return;}
  if(managed(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),hit=await cache.match(bare(url),{ignoreSearch:true});
      if(hit)return ranged(request,hit);
      const response=await networkFirstTry(request);
      if(response.status===200&&response.type==='basic'&&!request.headers.has('range'))cache.put(bare(url),response.clone()).catch(()=>{});
      return response;
    })());
    return;
  }
  if(!shell(url))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),key=bare(url).endsWith('/index.html')?bare(url).slice(0,-10):bare(url),hit=await cache.match(key,{ignoreSearch:true});
    try{
      const response=await fetchWithTimeout(request,hit?CODE_TIMEOUT_MS:MISS_TIMEOUT_MS);
      if(response.status===200&&response.type==='basic')cache.put(key,response.clone()).catch(()=>{});
      if(hit&&response.status>=500)return hit;
      return response;
    }catch(error){
      if(hit)return hit;
      return error&&error.name==='AbortError'?new Response('',{status:504,statusText:'island-asset-timeout'}):Response.error();
    }
  })());
});

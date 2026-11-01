/* Soccer asset cache: the match's characters, motion library, stadium, textures,
 * sounds and decoder are downloaded once and then served from the device, so a
 * phone opens the match in seconds instead of re-downloading megabytes every ten
 * minutes. Only the soccer asset paths below are intercepted; application code and
 * its ?v= tagged data always go to the network. A new release registers this worker
 * with a new ?v= so the old cache is dropped. Plain classic worker: the island's
 * script-src 'self' policy covers it; nothing is evaluated from text. */
const VERSION=new URL(self.location.href).searchParams.get('v')||'dev';
const CACHE='island-soccer-'+VERSION.replace(/[^\w.-]/g,'_');
const PATTERNS=[
  /\/design\/(characters2\/(soccer-player|goalkeeper)\.glb|characters2\/regions\.json|characters\/rig\.json|viewer\/retarget-map\.json)$/,
  /\/design\/(motion\/soccer\.json|motion2\/soccer\/[^/]+\.json)$/,
  /\/design\/(models2\/soccer-stadium\.glb|models\/soccer-(goal|ball)\.glb)$/,
  /\/design\/environment\/(textures|backgrounds)\/[^/]+\.webp$/,
  /\/design\/vfx\/(atlases|cameras)\/[^/]+\.(json|webp)$/,
  /\/design\/(tactics\/soccer\.json|controls\/(soccer|interaction)\.json|audio\/mix\.json|audio\/(soccer|scenes)\/[^/]+\.ogg)$/,
  /\/vendor\/draco\/[^/]+\.(wasm|js)$/,
  /\/assets\/(soccer-realism\/[^/]+\.jpg|athlete\/athlete\.glb|kid-full\.glb)$/,
];
const cached=url=>url.origin===self.location.origin&&!url.pathname.includes('..')&&PATTERNS.some(p=>p.test(url.pathname));
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('island-soccer-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  let url;try{url=new URL(request.url);}catch{return;}
  if(!cached(url))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),hit=await cache.match(url.href,{ignoreSearch:true});
    if(hit)return hit;
    const response=await fetch(request);
    if(response.ok&&response.type==='basic')cache.put(url.href,response.clone()).catch(()=>{});
    return response;
  })());
});
/** The soccer menu asks for the whole asset list; progress returns per file so the
 * download shows "12 of 46". Files already present are not fetched again. */
self.addEventListener('message',event=>{
  const data=event.data;if(!data||data.type!=='soccer-precache'||!Array.isArray(data.urls))return;
  const reply=message=>{event.source?.postMessage(message);};
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);let done=0,failed=[];
    for(const href of data.urls){
      try{
        let url;try{url=new URL(href,self.location.href);}catch{failed.push(href);continue;}
        if(!cached(url)){failed.push(href);continue;}
        if(!(await cache.match(url.href,{ignoreSearch:true}))){
          const response=await fetch(url.href,{cache:'no-cache'});
          if(!response.ok)throw Error(String(response.status));
          await cache.put(url.href,response);
        }
      }catch{failed.push(href);}
      done++;reply({type:'soccer-precache-progress',done,total:data.urls.length});
    }
    reply({type:'soccer-precache-done',total:data.urls.length,failed,version:VERSION});
  })());
});

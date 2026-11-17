const pending=new WeakMap();
const urls={tactics:new URL('../design/tactics/soccer.json',import.meta.url),controls:new URL('../design/controls/soccer.json',import.meta.url),interaction:new URL('../design/controls/interaction.json',import.meta.url)};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
/** Cache immutable data only. A failed/aborted request is evicted so a later
 * soccer session retries instead of inheriting a permanently rejected load. */
export function loadSoccerDesignContracts(fetcher=globalThis.fetch){
 if(typeof fetcher!=='function')return Promise.reject(new TypeError('Soccer design contracts require fetch'));
 if(pending.has(fetcher))return pending.get(fetcher);
 const request=Promise.all(Object.entries(urls).map(async([key,url])=>{
  const response=await fetcher(url);if(!response.ok)throw Error(`Soccer ${key} contract: HTTP ${response.status}`);
  return [key,await response.json()];
 })).then(entries=>{
  const data=Object.fromEntries(entries);
  if(data.tactics.sport!=='soccer'||!data.tactics.formations?.length||data.controls.game!=='soccer'||!data.controls.layouts||!data.interaction.gesture_thresholds)throw Error('Invalid soccer design contracts');
  return freeze(data);
 });
 pending.set(fetcher,request);request.catch(()=>{if(pending.get(fetcher)===request)pending.delete(fetcher);});
 return request;
}

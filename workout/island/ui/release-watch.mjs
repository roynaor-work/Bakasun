/** Refresh only from an idle, saved island. Never interrupt a round or editor. */
export function watchRelease({version,check,onPending=()=>{},canRefresh,save,refresh,listen=()=>()=>{},every=fn=>setInterval(fn,60000),cancel=clearInterval}){
  let pending=null,checking=false,reloading=false,disposed=false;
  function apply(){if(disposed||reloading||!pending||!canRefresh())return false;try{if(!save()?.ok)return false;reloading=true;refresh(pending);return true;}catch{reloading=false;return false;}}
  async function poll(){if(disposed||checking||reloading)return;checking=true;try{const next=await check();if(!disposed&&typeof next==='string'&&/^[a-z0-9-]{1,80}$/.test(next)&&next!==version&&next!==pending){pending=next;try{onPending(next);}catch{}}}catch{}finally{checking=false;}apply();}
  const timer=every(poll),unlisten=listen(poll);return {poll,apply,dispose(){if(disposed)return;disposed=true;cancel(timer);unlisten();}};
}

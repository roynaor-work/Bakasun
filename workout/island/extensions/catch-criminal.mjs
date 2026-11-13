import {runCatchSession} from '../minigames/catch-session.mjs?v=island-v2-20261107-11';
import {gameResult} from '../minigames/result.mjs?v=island-v2-20261107-11';

/** Catch the Criminal: a 3D car chase on a winding track, shooting the getaway car's tyres, then a bow-style
 * net shot at the thief on foot (v6). Switched off by the data flag `catchCriminal` (data/featureFlags.json)
 * or with ?catch=off. `?catchV6=0` plays v5 (the straight-street chase and the over-the-shoulder throw). */
export function install(registry,data) {
  const balance=data.config.minigames.catchCriminal;
  if(!balance||!data.extensions.catchCriminal)return;
  const params=new URLSearchParams(globalThis.location?.search||'');
  if(params.get('catch')==='off')return;
  const v6=params.get('catchV6')!=='0';
  registry.registerMinigame({...data.extensions.catchCriminal,
    start:ctx=>{
      if(!v6||!ctx.canvas)return runCatchSession({...ctx,balance});
      // v6 is loaded on demand so the island shell stays small; a load failure falls back to v5 (the proxy keeps the same session surface)
      return runCatchSession6Lazy({...ctx,balance});
    },
    onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});
}

/** A thin proxy around the v6 session so `start` can return synchronously while the module loads. */
function runCatchSession6Lazy(ctx){
  let inner=null,disposed=false,paused=false;
  const proxy={
    setPaused(v){paused=Boolean(v);inner?.setPaused(v);},
    dispose(){disposed=true;inner?.dispose();},
    get snapshot(){return inner?inner.snapshot:{ready:false,paused,disposed,error:null,mode:'loading',v2:true,phase:'loading',throwsLeft:null};},
    get engine(){return inner?.engine||null;},get chase(){return inner?.chase||null;},
    get debug(){return inner?.debug;},get city(){return inner?.city;},get v2(){return true;},get v6(){return Boolean(inner?.v6);},
  };
  import('../minigames/catch-session6.mjs?v=island-v2-20261107-11').then(({runCatchSession6})=>{
    if(disposed)return;inner=runCatchSession6(ctx);if(paused)inner.setPaused(true);
  }).catch(()=>{if(disposed)return;inner=runCatchSession(ctx);if(paused)inner.setPaused(true);});
  return proxy;
}

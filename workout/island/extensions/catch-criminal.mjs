import {runCatchSession} from '../minigames/catch-session.mjs?v=island-v2-20261107-5';
import {gameResult} from '../minigames/result.mjs?v=island-v2-20261107-5';

/** Catch the Criminal: throw a net or a lasso at a thief running through the city.
 * Switched off by the data flag `catchCriminal` (data/featureFlags.json) or with ?catch=off. */
export function install(registry,data) {
  const balance=data.config.minigames.catchCriminal;
  if(!balance||!data.extensions.catchCriminal)return;
  if(new URLSearchParams(globalThis.location?.search||'').get('catch')==='off')return;
  registry.registerMinigame({...data.extensions.catchCriminal,
    start:ctx=>runCatchSession({...ctx,balance}),
    onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});
}

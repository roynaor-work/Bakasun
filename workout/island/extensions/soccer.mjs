import {startSoccer} from '../minigames/soccer-session.mjs?v=island-v2-20261104-3';
import {soccerResult} from '../minigames/soccer-result.mjs?v=island-v2-20261104-3';

export function install(registry,data) {
  const balance=data.config.minigames.soccer;
  registry.registerMinigame({...data.extensions.soccer,
    start:ctx=>startSoccer({...ctx,balance}),onResult:(raw,ctx)=>soccerResult(raw,ctx,balance)});
}

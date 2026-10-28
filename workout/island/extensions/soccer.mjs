import {startSoccer} from '../minigames/soccer-session.mjs?v=island-naval-aim-20261028-1';
import {soccerResult} from '../minigames/soccer-result.mjs?v=island-naval-aim-20261028-1';

export function install(registry,data) {
  const balance=data.config.minigames.soccer;
  registry.registerMinigame({...data.extensions.soccer,
    start:ctx=>startSoccer({...ctx,balance}),onResult:(raw,ctx)=>soccerResult(raw,ctx,balance)});
}

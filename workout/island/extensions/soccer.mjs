import {startSoccer} from '../minigames/soccer-session.mjs?v=island-hoops-feel-20261027-1';
import {soccerResult} from '../minigames/soccer-result.mjs?v=island-hoops-feel-20261027-1';

export function install(registry,data) {
  const balance=data.config.minigames.soccer;
  registry.registerMinigame({...data.extensions.soccer,
    start:ctx=>startSoccer({...ctx,balance}),onResult:(raw,ctx)=>soccerResult(raw,ctx,balance)});
}

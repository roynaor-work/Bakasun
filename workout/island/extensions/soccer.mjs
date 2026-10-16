import {startSoccer} from '../minigames/soccer-session.mjs?v=task016-20261016-1';
import {soccerResult} from '../minigames/soccer-result.mjs?v=task016-20261016-1';
import {soccerAvailability} from '../activity/soccer-team.mjs?v=task016-20261016-1';

export function install(registry,data) {
  const balance=data.config.minigames.soccer;
  registry.registerMinigame({...data.extensions.soccer,availability:soccerAvailability,
    start:ctx=>startSoccer({...ctx,balance}),onResult:(raw,ctx)=>soccerResult(raw,ctx,balance)});
}

import {startHoops} from '../minigames/hoops-session.mjs?v=island-easy-city-20261027-1';
import {hoopsResult} from '../minigames/hoops-result.mjs?v=island-easy-city-20261027-1';

/** Island Pro Basketball: 5 on 5 in the island arena (game id kept as streetSlam for saves). */
export function install(registry,data) {
  const balance=data.config.minigames.streetSlam;
  if(!balance||!data.extensions.streetSlam)return;
  registry.registerMinigame({...data.extensions.streetSlam,
    start:ctx=>startHoops({...ctx,balance}),
    onResult:(raw,ctx)=>hoopsResult(raw,ctx,balance)});
}

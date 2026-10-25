import {startStreetSlam} from '../minigames/slam-session.mjs?v=island-citydetail-20261025-2';
import {streetSlamResult} from '../minigames/slam-result.mjs?v=island-citydetail-20261025-2';

/** Street Slam: 2 v 2 street basketball at the city's basketball court. */
export function install(registry,data) {
  const balance=data.config.minigames.streetSlam;
  if(!balance||!data.extensions.streetSlam)return;
  registry.registerMinigame({...data.extensions.streetSlam,
    start:ctx=>startStreetSlam({...ctx,balance}),
    onResult:(raw,ctx)=>streetSlamResult(raw,ctx,balance)});
}

import {runRacingSession} from '../minigames/racing-session.mjs?v=island-alpine-20261027-1';
import {racingResult} from '../minigames/racing-result.mjs?v=island-alpine-20261027-1';

/** Uses the same lifecycle and reward contract as the other island games. */
export function install(registry,data) {
  const balance=data.config.minigames.islandRacing;
  registry.registerMinigame({...data.extensions.islandRacing,
    start:ctx=>runRacingSession({...ctx,balance}),
    onResult:(raw,ctx)=>racingResult(raw,ctx,balance)});
}

import {runAlpineSession} from '../minigames/alpine-session.mjs?v=island-v2-20261107-26';
import {alpineResult} from '../minigames/alpine-result.mjs?v=island-v2-20261107-26';
import {balanceForPage} from '../minigames/alpine-v241.mjs?v=island-v2-20261107-26';

/** Alpine Rush snowboard race: same lifecycle and reward contract as the other island games.
 * v24.1: with ?alpineV241=0 the session and the result check both get the v24 balance (no physics.v241, no course content). */
export function install(registry,data) {
  const balance=balanceForPage(data.config.minigames.alpineRush);
  registry.registerMinigame({...data.extensions.alpineRush,
    start:ctx=>runAlpineSession({...ctx,balance}),
    onResult:(raw,ctx)=>alpineResult(raw,ctx,balance)});
}

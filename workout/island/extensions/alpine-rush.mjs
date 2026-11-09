import {runAlpineSession} from '../minigames/alpine-session.mjs?v=island-v2-20261107-7';
import {alpineResult} from '../minigames/alpine-result.mjs?v=island-v2-20261107-7';

/** Alpine Rush snowboard race: same lifecycle and reward contract as the other island games. */
export function install(registry,data) {
  const balance=data.config.minigames.alpineRush;
  registry.registerMinigame({...data.extensions.alpineRush,
    start:ctx=>runAlpineSession({...ctx,balance}),
    onResult:(raw,ctx)=>alpineResult(raw,ctx,balance)});
}

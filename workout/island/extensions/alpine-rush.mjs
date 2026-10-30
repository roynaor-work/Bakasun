import {runAlpineSession} from '../minigames/alpine-session.mjs?v=island-naval-aim-20261030-1';
import {alpineResult} from '../minigames/alpine-result.mjs?v=island-naval-aim-20261030-1';

/** Alpine Rush snowboard race: same lifecycle and reward contract as the other island games. */
export function install(registry,data) {
  const balance=data.config.minigames.alpineRush;
  registry.registerMinigame({...data.extensions.alpineRush,
    start:ctx=>runAlpineSession({...ctx,balance}),
    onResult:(raw,ctx)=>alpineResult(raw,ctx,balance)});
}

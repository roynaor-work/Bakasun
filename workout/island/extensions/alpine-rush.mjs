import {runAlpineSession} from '../minigames/alpine-session.mjs?v=island-boar-20261029-2';
import {alpineResult} from '../minigames/alpine-result.mjs?v=island-boar-20261029-2';

/** Alpine Rush snowboard race: same lifecycle and reward contract as the other island games. */
export function install(registry,data) {
  const balance=data.config.minigames.alpineRush;
  registry.registerMinigame({...data.extensions.alpineRush,
    start:ctx=>runAlpineSession({...ctx,balance}),
    onResult:(raw,ctx)=>alpineResult(raw,ctx,balance)});
}

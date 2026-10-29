import {runBoarSession} from '../minigames/boar-session.mjs?v=island-soccer-league-20261029-1';

/** The original Boar Island campaign owns its waves, garage and saved wallet.
 * Enter/leave through the island lifecycle without inventing duplicate rewards. */
export function install(registry,data) {
  registry.registerMinigame({...data.extensions.boarDefense,
    start:ctx=>runBoarSession(ctx),
    onResult:()=>null});
}

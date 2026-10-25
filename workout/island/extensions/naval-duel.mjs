import {navalDifficulty} from '../minigames/naval-upgrades.mjs?v=island-cityplay-20261025-1';
import {startNaval} from '../minigames/naval.mjs?v=island-cityplay-20261025-1';
import {gameResult} from '../minigames/result.mjs?v=island-cityplay-20261025-1';
export function install(registry,data){const balance=data.config.minigames.navalDuel;registry.registerMinigame({...data.extensions.navalDuel,start:ctx=>startNaval({...ctx,balance,difficulty:navalDifficulty(ctx.engine)}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

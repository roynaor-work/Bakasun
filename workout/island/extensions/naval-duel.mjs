import {navalDifficulty} from '../minigames/naval-upgrades.mjs?v=island-art-20261022-3';
import {startNaval} from '../minigames/naval.mjs?v=island-art-20261022-3';
import {gameResult} from '../minigames/result.mjs?v=island-art-20261022-3';
export function install(registry,data){const balance=data.config.minigames.navalDuel;registry.registerMinigame({...data.extensions.navalDuel,start:ctx=>startNaval({...ctx,balance,difficulty:navalDifficulty(ctx.engine)}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

import {navalDifficulty} from '../minigames/naval-upgrades.mjs?v=naval-art-20261022-2';
import {startNaval} from '../minigames/naval.mjs?v=naval-art-20261022-2';
import {gameResult} from '../minigames/result.mjs?v=naval-art-20261022-2';
export function install(registry,data){const balance=data.config.minigames.navalDuel;registry.registerMinigame({...data.extensions.navalDuel,start:ctx=>startNaval({...ctx,balance,difficulty:navalDifficulty(ctx.engine)}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

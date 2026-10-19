import {startNaval} from '../minigames/naval.mjs?v=g9-20261020-1';
import {gameResult} from '../minigames/result.mjs?v=g9-20261020-1';
export function install(registry,data){const balance=data.config.minigames.navalDuel;registry.registerMinigame({...data.extensions.navalDuel,start:ctx=>startNaval({...ctx,balance}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

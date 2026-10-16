import {startNaval} from '../minigames/naval.mjs?v=g2f-20261015-1';
import {gameResult} from '../minigames/result.mjs?v=g2f-20261015-1';
export function install(registry,data){const balance=data.config.minigames.navalDuel;registry.registerMinigame({...data.extensions.navalDuel,start:ctx=>startNaval({...ctx,balance}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

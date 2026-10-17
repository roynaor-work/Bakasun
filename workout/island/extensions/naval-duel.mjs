import {startNaval} from '../minigames/naval.mjs?v=g3f-20261018-2';
import {gameResult} from '../minigames/result.mjs?v=g3f-20261018-2';
export function install(registry,data){const balance=data.config.minigames.navalDuel;registry.registerMinigame({...data.extensions.navalDuel,start:ctx=>startNaval({...ctx,balance}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

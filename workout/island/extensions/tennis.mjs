import {startTennis} from '../minigames/tennis-session.mjs?v=g2j-20261019-1';
import {tennisResult} from '../minigames/tennis-result.mjs?v=g2j-20261019-1';
export function install(registry,data){const balance=data.config.minigames.tennis;registry.registerMinigame({...data.extensions.tennis,start:ctx=>startTennis({...ctx,balance}),onResult:(raw,ctx)=>tennisResult(raw,ctx,balance)});}

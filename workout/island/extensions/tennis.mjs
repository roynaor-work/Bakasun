import {startTennis} from '../minigames/tennis-session.mjs?v=island-art-20261022-3';
import {tennisResult} from '../minigames/tennis-result.mjs?v=island-art-20261022-3';
export function install(registry,data){const balance=data.config.minigames.tennis;registry.registerMinigame({...data.extensions.tennis,start:ctx=>startTennis({...ctx,balance}),onResult:(raw,ctx)=>tennisResult(raw,ctx,balance)});}

import {startTennis} from '../minigames/tennis-session.mjs?v=g3f-20261018-2';
import {tennisResult} from '../minigames/tennis-result.mjs?v=g3f-20261018-2';
export function install(registry,data){const balance=data.config.minigames.tennis;registry.registerMinigame({...data.extensions.tennis,start:ctx=>startTennis({...ctx,balance}),onResult:(raw,ctx)=>tennisResult(raw,ctx,balance)});}

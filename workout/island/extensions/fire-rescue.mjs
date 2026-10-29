import {startFire} from '../minigames/fire.mjs?v=island-boar-20261029-2';
import {gameResult} from '../minigames/result.mjs?v=island-boar-20261029-2';
export function install(registry,data){const balance=data.config.minigames.fireRescue;registry.registerMinigame({...data.extensions.fireRescue,start:ctx=>startFire({...ctx,balance}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

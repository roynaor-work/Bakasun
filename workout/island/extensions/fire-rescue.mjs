import {startFire} from '../minigames/fire.mjs?v=island-v2-20261107-15';
import {gameResult} from '../minigames/result.mjs?v=island-v2-20261107-15';
export function install(registry,data){const balance=data.config.minigames.fireRescue;registry.registerMinigame({...data.extensions.fireRescue,start:ctx=>startFire({...ctx,balance}),onResult:(raw,ctx)=>gameResult(raw,ctx,balance)});}

import {startFire} from '../minigames/fire.mjs?v=island-v2-20261107-23';
import {gameResult} from '../minigames/result.mjs?v=island-v2-20261107-23';
export function install(registry,data){
  const balance=data.config.minigames.fireRescue;
  registry.registerMinigame({...data.extensions.fireRescue,start:ctx=>startFire({...ctx,balance}),onResult(raw,ctx){
    const result=gameResult(raw,ctx,balance);
    if(result?.outcome==='lose'&&result.score===0&&raw.reason==='fireIdle')result.stars=1;
    return result;
  }});
}

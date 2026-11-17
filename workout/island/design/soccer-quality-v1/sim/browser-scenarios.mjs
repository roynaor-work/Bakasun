/** Shared deterministic evidence executed by Chromium against its loaded runtime.
 * The native controls/performance runner supplies independent UI/render evidence. */
import {measureKeeperScenarios} from './keeper-scenarios.mjs';
import {tacticalProbe,chaseProbe,returnMotionProbe} from './team-scenarios.mjs';
import {measureBallQuality} from './ball-scenarios.mjs';

export async function runBrowserScenarios({quality=false}={}){
  const at=file=>new URL('../../../minigames/'+file,import.meta.url);
  const names=['soccer.mjs','soccer-full.mjs','soccer-squad.mjs','soccer-teamplay.mjs','soccer-tactics-data.mjs','soccer-loft.mjs','soccer-assistance.mjs','soccer-physics.mjs','soccer-rules.mjs'];
  const modules=await Promise.all(names.map(file=>import(at(file))));
  const api=Object.assign({},...modules),response=await fetch(new URL('../../../data/config.json',import.meta.url));
  if(!response.ok)throw Error('Cannot read production soccer config');
  const base=(await response.json()).minigames.soccer,r={...api,base};
  const ballConfig={...base,quality:{loft:quality,passing:quality}};
  const keeperConfig=api.applySoccerFull(base,{v241:false});
  return {
    quality,method:'Production JavaScript runtime in Chromium; deterministic fixtures, same parameters as Node; category flags isolated.',
    ball:measureBallQuality(api,ballConfig),
    keeper:measureKeeperScenarios(api.createSoccer,keeperConfig,quality),
    team:{targets:tacticalProbe(r,{enabled:quality}),physicalReturn:returnMotionProbe(r,{enabled:quality})},
    difficulty:[2,5,12,30].flatMap(stage=>['easy','normal','hard'].map(difficulty=>chaseProbe(r,{enabled:quality,stage,difficulty}))),
  };
}

import {readFile} from 'node:fs/promises';
import {createTennis} from '../tennis.mjs';
export const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
// A child-like controller: moves toward the marker, taps 150ms early, no charge.
// It has no access to the RNG or AI decisions and never changes model state.
export function simulate(stage,seed=4107,ranks=config.player.defaults,options={}) {
  const game=createTennis({config,stage,seed,ranks}); let lastContact=-1, lastServe=-1;
  const dt=1/60;
  for(let frame=0;frame<60*2400;frame++) {
    const s=game.getState(); if(s.result)return {result:s.result,frames:frame};
    let swing=false;
    if(s.phase==='serve'&&s.server===0&&lastServe!==s.pointNumber){swing=true;lastServe=s.pointNumber;}
    if(s.phase==='rally'&&s.contact?.side===0&&s.contact.eta<=(options.early??0.15)&&lastContact!==s.contact.at){swing=true;lastContact=s.contact.at;}
    game.update(dt,{swing,targetX:options.center?0:s.contact?.side===0?s.contact.x:0});
  }
  throw Error(`Unfinished stage ${stage}, seed ${seed}: ${JSON.stringify(game.getState())}`);
}
if(process.argv[1]===new URL(import.meta.url).pathname) for(let stage=1;stage<=10;stage++)console.log(stage,simulate(stage).result);

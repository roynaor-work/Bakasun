import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const source=process.env.SOCCER_QUALITY_SOURCE,baseline=process.env.SOCCER_QUALITY_BASE;
if(!source||!baseline)throw Error('Set SOCCER_QUALITY_SOURCE to patched copy and SOCCER_QUALITY_BASE to unmodified baseline');
async function runtime(root){
  const at=name=>pathToFileURL(resolve(root,'workout/island/minigames',name));
  const [{createSoccer},{applySoccerFull}]=await Promise.all([import(at('soccer.mjs')),import(at('soccer-full.mjs'))]);
  const config=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;
  return {createSoccer,config:applySoccerFull(config,{v241:false})};
}
const [before,after]=await Promise.all([runtime(baseline),runtime(source)]);
const flags={enabled:false,loft:false,passing:false,keeper:false,team:false,difficulty:false,eleven:false};
for(const [seed,stage,difficulty] of [[17,1,'easy'],[31,5,'normal'],[43,10,'hard']]){
  test(`all quality flags off preserve paired full-match state and event stream (${difficulty}, stage ${stage})`,()=>{
    const opts={seed,stage,difficulty,aiVersion:'v2',rulesVersion:'v1',feelVersion:'v2',airVersion:'v23',v241:false};
    const a=before.createSoccer({...opts,config:structuredClone(before.config)});
    const b=after.createSoccer({...opts,config:{...structuredClone(after.config),quality:flags}});
    for(let tick=0;tick<2400;tick++){
      const cycle=tick%240,input={moveX:Math.sin(tick/70)*.8,moveZ:Math.cos(tick/111)*.65,
        passHeld:cycle>=40&&cycle<70,kickHeld:cycle>=120&&cycle<150,
        lobPressed:cycle===180,switchPlayer:cycle===220,sprintHeld:cycle<90,throughPass:true};
      a.update(1/60,input);b.update(1/60,input);
      if(tick%120===0){
        assert.deepEqual(b.snapshot(),a.snapshot(),`state at tick ${tick}`);
        assert.deepEqual(b.drainEvents(),a.drainEvents(),`events at tick ${tick}`);
      }
    }
    assert.deepEqual(b.snapshot(),a.snapshot());assert.deepEqual(b.drainEvents(),a.drainEvents());
  });
}

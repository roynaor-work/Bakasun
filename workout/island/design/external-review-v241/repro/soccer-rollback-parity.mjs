/** Compare merge #461 with its actual first parent, without checking out/writing source.
 * node workout/island/design/external-review-v241/repro/soccer-rollback-parity.mjs */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createSoccer} from '../../../minigames/soccer.mjs';
import {applySoccerFull} from '../../../minigames/soccer-full.mjs';
import {expandSoccerConfig} from '../../../minigames/soccer-squad.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../../../minigames/soccer-v23.mjs';
import {createHumanBot} from '../../../tools/soccer-gameplay-metrics.mjs';

const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const baseline='43b27dc235387e3cb737aee9558cdf9d5fd5a262^1';
const source=path=>execFileSync('git',['show',`${baseline}:${path}`],{cwd:repo,encoding:'utf8',maxBuffer:16e6});
async function oldModule(path){
  const own=pathToFileURL(repo+path);
  // All relative dependencies used here are unchanged except release tags;
  // use the checked-in versions, while retaining the exact old core/full source.
  const code=source(path).replace(/from\s+(['"])(\.[^'"]+)\1/g,(_m,q,p)=>'from '+q+new URL(p,own).href+q);
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const old=await oldModule('workout/island/minigames/soccer.mjs');
const oldFull=await oldModule('workout/island/minigames/soccer-full.mjs');
const currentBase=JSON.parse(readFileSync(new URL('../../../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const oldBase=JSON.parse(source('workout/island/data/config.json')).minigames.soccer;
assert.deepEqual(currentBase,oldBase,'soccer base config is unchanged');
globalThis.location={search:'?soccerV241=0'};
const build=(b,f)=>applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(f(b))),'v23');
const config=build(currentBase,applySoccerFull),oldConfig=build(oldBase,oldFull.applySoccerFull);
assert.deepEqual(JSON.parse(JSON.stringify(config)),JSON.parse(JSON.stringify(oldConfig)),'rollback config equals first parent');
const report=[];
for(const [seed,stage,role] of [[5,1,'field'],[7,4,'field'],[11,7,'keeper']]){
  const game=createSoccer({config,seed,stage,role,airVersion:'v23'}),before=old.createSoccer({config:oldConfig,seed,stage,role,airVersion:'v23'});
  const bot=createHumanBot(seed,{profile:'child'}),dt=config.match.fixedStep,hash=createHash('sha256');
  for(let i=0;i<1800;i++){
    const input=bot(before,dt,oldConfig);
    before.update(dt,input);game.update(dt,input);
    const a=before.snapshot(),b=game.snapshot();
    assert.deepEqual(b,a,`state diverged seed=${seed} stage=${stage} role=${role} tick=${i}`);
    assert.deepEqual(game.drainEvents(),before.drainEvents(),`events diverged tick=${i}`);
    hash.update(JSON.stringify(a));
  }
  report.push({seed,stage,role,ticks:1800,matchElapsed:game.getState().elapsed,sha256:hash.digest('hex')});
}
console.log(JSON.stringify({baseline,query:location.search,configEqual:true,cases:report},null,2));

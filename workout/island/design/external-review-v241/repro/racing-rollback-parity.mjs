import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRacing as newer} from '../../../minigames/racing-physics.mjs';
import {V24,pilot} from '../../../tools/racing-v24-sim.mjs';
import {playerInput,racingV24Flags} from '../../../minigames/racing-v24.mjs';
// Materialize only the comparison source in a disposable directory, never checkout or edit it.
const baseline=mkdtempSync(path.join(tmpdir(),'v241-racing-baseline-'));
process.on('exit',()=>rmSync(baseline,{recursive:true,force:true}));
const archive=execFileSync('git',['archive','43b27dc235387e3cb737aee9558cdf9d5fd5a262^1',
 'workout/island/minigames','workout/island/data/config.json','workout/island/design/racing-tracks-v2/tracks.mjs'],{maxBuffer:64*1024*1024});
execFileSync('tar',['-x','-C',baseline],{input:archive});
const {createRacing:old}=await import(pathToFileURL(path.join(baseline,'workout/island/minigames/racing-physics.mjs')).href);
const rows=[],flags=racingV24Flags('');
for(const stage of [1,7,13,19,25,30])for(const seed of [1,7]){
 const cfg={countdown:0,extraRivals:5,walls:false,offTrack:true,...V24,pitAuto:false},a=old({stage,seed,config:cfg}),b=newer({stage,seed,config:cfg}),st={};
 let frames=0,checksum=0;
 for(;frames<18000&&a.state.phase!=='finished';frames++){
  const p=a.state.player,input=p.pit?{steer:0,throttle:0,autoAccelerate:false}:playerInput(pilot(a,p,st,{aLat:24,aBrake:20}),flags);
  a.step(1/60,input);b.step(1/60,input);
  assert.deepEqual(b.state.cars.map(c=>[c.id,c.x,c.z,c.routeS,c.speed,c.lap,c.pits,c.tyre,c.finished]),a.state.cars.map(c=>[c.id,c.x,c.z,c.routeS,c.speed,c.lap,c.pits,c.tyre,c.finished]),`stage=${stage} seed=${seed} frame=${frames}`);
  if(frames%60===0)checksum+=b.state.player.routeS+b.state.player.speed;
 }
 assert.deepEqual(b.state.result,a.state.result);
 rows.push({stage,seed,frames,phase:b.state.phase,pits:b.state.player.pits,checksum});
 a.dispose();b.dispose();
}
console.log(JSON.stringify({baseline:'43b27dc^1',target:'43b27dc',flag:'?racingPitAuto=0',rows},null,2));

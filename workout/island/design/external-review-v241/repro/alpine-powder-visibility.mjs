import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlpineEngine} from '../../../minigames/alpine-engine.mjs';
import {leagueBalance} from '../../../minigames/alpine-league-stages.mjs';
import {engineStageOf} from '../../../minigames/alpine-league-core.mjs';
const base=JSON.parse(await readFile(new URL('../../../data/config.json',import.meta.url))).minigames.alpineRush;
let reproduced=null;
for(let n=1;n<=30&&!reproduced;n++){
 const b=structuredClone(leagueBalance(base,n));
 b.physics.grid=[{s:0,x:0},...Array.from({length:5},(_,i)=>({s:-400-i*5,x:i*2-4}))];
 const e=createAlpineEngine({balance:b,stage:engineStageOf(n),seed:7});
 const target=e.course.objects.find(o=>o.type==='powder'&&o.len>2*base.physics.viewBehind+2);
 if(!target)continue;
 e.command({type:'start'});
 while(e.phase!=='finished'){
  const d=e.debug()[0];
  e.command({type:'steer',value:Math.max(-1,Math.min(1,(target.x-d.x)*.8))});e.step(1/60);
  const s=e.snapshot(),p=s.player;
  const within=Math.abs(p.s-target.s)<target.len/2&&Math.abs(p.x-target.x)<target.w/2;
  if(within&&p.surface==='powder'&&!s.obstacles.some(o=>o.id===target.id)){
   reproduced={leagueStage:n,object:target,player:{s:p.s,x:p.x,surface:p.surface},distanceAfterPatchCentre:p.s-target.s,patchEnd:target.s+target.len/2,viewBehind:base.physics.viewBehind};break;
  }
  if(d.s>target.s+target.len)break;
 }
 e.dispose();
}
assert.ok(reproduced,'expected a generated patch to disappear while its physics still applies');
console.log(JSON.stringify({finding:'powder_invisible_but_active',...reproduced},null,2));

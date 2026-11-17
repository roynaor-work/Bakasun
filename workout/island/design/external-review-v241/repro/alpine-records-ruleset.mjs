import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlpineEngine} from '../../../minigames/alpine-engine.mjs';
import {leagueBalance} from '../../../minigames/alpine-league-stages.mjs';
import {engineStageOf} from '../../../minigames/alpine-league-core.mjs';
import {withoutV241} from '../../../minigames/alpine-v241.mjs';
import {createGhostRecorder,saveGhost,loadGhost,ghostAt} from '../../../minigames/alpine-league-ghost.mjs';
import {loadRecords,recordRun} from '../../../minigames/alpine-records.mjs';
import {createKidBot} from '../../../tools/alpine-league-bot.mjs';
const base=JSON.parse(await readFile(new URL('../../../data/config.json',import.meta.url))).minigames.alpineRush;
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const n=1,stage=engineStageOf(n),seed=7,oldBalance=leagueBalance(withoutV241(base),n),newBalance=leagueBalance(base,n);
function race(balance,raceSeed=seed){const e=createAlpineEngine({balance,stage,seed:raceSeed}),bot=createKidBot({seed:31,physics:balance.physics}),rec=createGhostRecorder();e.command({type:'start'});while(e.phase!=='finished'){const s=e.snapshot();if(s.phase==='racing'){const d=bot.decide(s);e.command({type:'steer',value:d.steer});if(d.boost)e.command({type:'boost'});if(d.trick)e.command({type:'trick',id:d.trick});}e.step(1/60);rec.record(e.snapshot());}return{e,result:e.snapshot().result,ghost:rec.encode(e.snapshot().result.elapsedMs)};}
const old=race(oldBalance);assert.ok(saveGhost(storage,n,old.ghost).saved);
const records=loadRecords(storage,oldBalance.records);assert.ok(recordRun(storage,oldBalance.records,records,old.result).recorded);
// Use a DIFFERENT session seed to exclude the older same-runId deduplication bug.
const newer=race(newBalance,seed+1),newLoad=loadRecords(storage,newBalance.records),staleGhost=loadGhost(storage,n);
const loadedBefore=structuredClone(newLoad.data.best[newer.result.trackId]);
const recording=recordRun(storage,newBalance.records,newLoad,newer.result);
assert.notDeepEqual(old.e.course.objects,newer.e.course.objects);
assert.equal(staleGhost.ms,old.result.elapsedMs);
assert.notEqual(old.result.runId,newer.result.runId);
assert.equal(recording.recorded,true);
const intersects=[];
for(const o of newer.e.course.objects.filter(o=>o.type==='rock'||o.type==='snowman')){
 for(let i=0;i<staleGhost.count;i++){if(Math.abs(staleGhost.s[i]-o.s)<1&&Math.abs(staleGhost.x[i]-o.x)<o.radius*newBalance.physics.rockHitScale+newBalance.physics.board.halfWidth&&staleGhost.h[i]<.3){intersects.push({object:o,ghost:{s:staleGhost.s[i],x:staleGhost.x[i],height:staleGhost.h[i]}});break;}}
}
assert.ok(intersects.length>0,'the old ghost crosses new course hazards');
console.log(JSON.stringify({old:{runId:old.result.runId,ms:old.result.elapsedMs,objects:old.e.course.objects.length},newer:{runId:newer.result.runId,ms:newer.result.elapsedMs,objects:newer.e.course.objects.length},loadedRecordFromOtherRules:loadedBefore,loadedGhostMs:staleGhost.ms,recording,ghostIntersectsNewHazards:intersects.slice(0,3),note:'Different session seeds: no duplicate-run rejection is attributed to v24.1.'},null,2));

// SPDX-License-Identifier: CC0-1.0
// Original basketball motion assembly. Run from any directory; writes only this package.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANON_BONES} from '../../../minigames/athletes-core.mjs';
import {createLocomotion} from './locomotion.mjs';
import {createBallActions} from './ball-actions.mjs';
import {createShotActions} from './shot-actions.mjs';

const base = new URL('../', import.meta.url);
await mkdir(new URL('runtime/clips/', base), {recursive:true});
await mkdir(new URL('verification/', base), {recursive:true});
const clips = [...await createLocomotion(), ...await createBallActions(), ...await createShotActions()];
const required = ['idle','idle_ball','jog','run','sprint','accelerate','stop','turn_45','turn_90','turn_180','cross','defensive_slide','defense_stance','dribble_stand','dribble_run','dribble_cross','dribble_behind','dribble_spin','dribble_low','pass_chest','pass_bounce','pass_overhead','pass_behind','jump_shot','set_shot','layup','dunk','fadeaway','block','steal_reach','celebrate_short','disappointed'];
if (clips.length !== required.length || new Set(clips.map(c=>c.id)).size !== required.length || required.some(id=>!clips.some(c=>c.id===id))) throw Error('Motion inventory must cover all 32 requested variants.');
clips.sort((a,b)=>required.indexOf(a.id)-required.indexOf(b.id));
for (const c of clips) {
  const duration=c.durationSeconds??c.duration;
  if (Math.abs(duration*30-Math.round(duration*30))>1e-7 || c.frames.length!==Math.round(duration*30)+1) throw Error(`${c.id}: duration/frame count differs from 30 Hz`);
  c.duration=c.durationSeconds=duration;c.frameCount=c.frames.length;c.nativeRate=30;c.rootMotion=false;
  for (const [i,f] of c.frames.entries()) {
    if (Math.abs(f.time-i/30)>1e-7 || f.hips.length!==3 || !f.hips.every(Number.isFinite)) throw Error(`${c.id}: invalid native sample ${i}`);
    if (Object.keys(f.rotations).length!==18 || CANON_BONES.some(b=>!f.rotations[b.name]?.every(Number.isFinite))) throw Error(`${c.id}: noncanonical rotations`);
  }
  if (c.id.startsWith('dribble_') && !c.events.some(e=>(e.type??e.name)==='bounce')) throw Error(`${c.id}: bounce event required`);
  if (c.id.startsWith('pass_') && !c.events.some(e=>(e.type??e.name)==='release')) throw Error(`${c.id}: release event required`);
}
// The brief asks for 24 clips but enumerates 32 independent variants. All variants
// are real assets. This grouping records the discrepancy without hiding any clip.
const families=required.filter(id=>!['idle_ball','turn_90','turn_180','pass_bounce','pass_overhead','pass_behind','set_shot','fadeaway'].includes(id)).map(id=>({id,variants:[id,...({idle:['idle_ball'],turn_45:['turn_90','turn_180'],pass_chest:['pass_bounce','pass_overhead','pass_behind'],jump_shot:['set_shot','fadeaway']}[id]??[])]}));
const data={schemaVersion:1,version:'hoops-motion-v13',fps:30,units:'metres',hipsConvention:'absolute local translation; subtract canonical rest .86 for athletes-core/tall offsets',rootMotion:false,skeleton:CANON_BONES,families,clips};
await writeFile(new URL('runtime/motions.json',base),JSON.stringify(data)+'\n');
await writeFile(new URL('verification/inventory.json',base),JSON.stringify({requestedCount:24,explicitVariants:32,familyCount:families.length,interpretation:'Preserve every explicitly requested action as a separate clip; 24 families and 8 additional variants.',families},null,2)+'\n');
const inputs=[
  ['main','../../../minigames/athletes-core.mjs'],
  ['main','../../soccer-header-v1/source/rig.mjs'],
  ['main','../../soccer-header-v1/source/glb.mjs'],
  ['main','../../soccer-header-v1/runtime/player.mjs'],
];
const provenance=[];
for(const [ref,relative]of inputs){const bytes=await readFile(new URL(relative,import.meta.url));provenance.push({ref,path:new URL(relative,import.meta.url).pathname.split('/Bakasun/')[1],sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
await writeFile(new URL('verification/author-provenance.json',base),JSON.stringify({license:'CC0-1.0',canonicalSources:provenance,soccerLocomotionReference:{commit:'ec6c73949fb5820826b4c082972f5d4f1136641f',path:'workout/island/design/soccer-locomotion-v2/source/author.mjs',license:'CC0-1.0'},qaCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24'},null,2)+'\n');
console.log(`Authored ${clips.length} clips in ${families.length} families at 30 Hz.`);
await import('./bake.mjs');

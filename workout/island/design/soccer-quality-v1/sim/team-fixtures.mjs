/** Deterministic, actual-engine paired probes. `source` is a repository root;
 * imports the source under test, never a model duplicated in the test. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function teamRuntime(source){
 const root=resolve(source),url=name=>pathToFileURL(resolve(root,'workout/island/minigames',name)).href;
 const [{createSoccer},{applySoccerFull,soccerFullAnchor},{expandSoccerConfig},{passLaneClearance},quality]=await Promise.all([import(url('soccer.mjs')),import(url('soccer-full.mjs')),import(url('soccer-squad.mjs')),import(url('soccer-teamplay.mjs')),import(url('soccer-quality-team.mjs')).catch(()=>({}))]);
 const {SOCCER_TACTICS_DATA}=await import(url('soccer-tactics-data.mjs'));
 const base=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;
 return {base,createSoccer,applySoccerFull,expandSoccerConfig,passLaneClearance,soccerFullAnchor,SOCCER_TACTICS_DATA,...quality};
}
export {tacticalProbe,chaseProbe,elevenProbe,returnMotionProbe} from './team-scenarios.mjs';

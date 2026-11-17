// Read-only reproduction: the live v24.1 dive must survive its second frame.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../../../vendor/three.module.js';
import {createSoccerDesignMotion} from '../../../minigames/soccer-design-character.mjs';
import {soccerV241ClipStates,SOCCER_V241_EXPECTED} from '../../../minigames/soccer-r241.mjs';
const config=JSON.parse(readFileSync(new URL('../../../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const pack=JSON.parse(readFileSync(new URL('../../../assets/soccer-v241/clips/tackle.json',import.meta.url),'utf8'));
globalThis.location={search:''};
const states=soccerV241ClipStates(pack,SOCCER_V241_EXPECTED.tackle);
for(const name of ['idle','run','v9_goalkeeper_ready'])states[name]={durationSeconds:1,loop:true};
const root=new T.Group(),mixer=new T.AnimationMixer(root);
const motion=createSoccerDesignMotion(mixer,Object.entries(states).map(([n,s])=>new T.AnimationClip(n,s.durationSeconds,[])),{initialState:'idle',transitions:[],states},config);
const p={id:0,team:0,role:'keeper',x:0,z:0,vx:0,vz:0,fx:1,fz:0,diveZ:-1,diveTime:.65};
const s={controlled:1,players:[p],ball:{x:1,z:1,y:1,owner:null},phase:'playing',mode:'defense'};
const rows=[];
for(let tick=0;tick<4;tick++){
 p.diveTime=.65-tick/60;
 motion.update(p,s,{mode:'dive'},1/60);
 rows.push({tick,diveTime:p.diveTime,state:motion.state,dive:motion.dive});
}
console.log(JSON.stringify(rows,null,2));
assert.ok(rows.every(r=>r.state.startsWith('v241_keeper_dive_')),'the keeper dive must continue while the simulation is diving');

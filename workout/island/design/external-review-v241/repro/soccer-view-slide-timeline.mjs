// Read-only reproduction: exercises the actual shipped motion controller.
// Run from the repository root with Node.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../../../vendor/three.module.js';
import {createSoccerDesignMotion} from '../../../minigames/soccer-design-character.mjs';
import {soccerV241ClipStates,SOCCER_V241_EXPECTED,soccerV241SlideTime} from '../../../minigames/soccer-r241.mjs';
const base=JSON.parse(readFileSync(new URL('../../../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const states=soccerV241ClipStates(JSON.parse(readFileSync(new URL('../../../assets/soccer-v241/clips/tackle.json',import.meta.url),'utf8')),SOCCER_V241_EXPECTED.tackle);
states.idle={durationSeconds:1,loop:true};states.run={durationSeconds:1,loop:true};
const data={initialState:'idle',transitions:[],states};
globalThis.location={search:''};
const mixer=new T.AnimationMixer(new T.Group());
const clips=Object.entries(states).map(([name,st])=>new T.AnimationClip(name,st.durationSeconds,[]));
const motion=createSoccerDesignMotion(mixer,clips,data,base);
const p={id:0,team:0,role:'striker',x:0,z:0,vx:0,vz:0,fx:1,fz:0,slideTime:.35,recover:0,slideKind:'straight'};
const s={controlled:0,players:[p],ball:{x:1,z:0,owner:null},phase:'playing',mode:'attack'};
const rows=[];
for(let tick=0;tick<5;tick++){
 p.slideTime=.35-tick/60;
 motion.update(p,s,{mode:'slide'},1/60);
 rows.push({tick,remaining:p.slideTime,expectedTime:soccerV241SlideTime('slide',1-p.slideTime/.35),actualTime:motion.actions.v241_slide.time,finite:Number.isFinite(motion.actions.v241_slide.time),slide:motion.slide});
}
console.log(JSON.stringify(rows,null,2));
assert.ok(rows.every(r=>r.finite),'every live slide action must retain a finite clip time');

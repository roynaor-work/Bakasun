import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.fireRescue;
const setup=level=>{const m=createFireModel({config,balance:b,level,random:seededRandom(3)}),r=m.rescues[0],t=m.truck;for(const f of m.flames)f.heat=0;t.x=r.world[0]-2;t.z=r.world[2]+2;m.cancelNavigation();for(let i=0;i<40;i++)m.update(.02,{});return {m,r,t};};
test('Fire v22: one tap opens the ladder, the rescue finishes by itself, and the ladder folds when done',()=>{
 const {m,r}=setup(3);assert.equal(m.ladder.extension,0,'stowed while driving/idle');assert.ok(m.ladder.available);
 m.update(.02,{rescue:true});m.update(.02,{});let maxExt=0,latchedSeen=false;
 for(let i=0;i<400;i++){m.update(.02,{});maxExt=Math.max(maxExt,m.ladder.extension);latchedSeen||=m.ladder.latched;}
 assert.ok(latchedSeen&&maxExt>.9,'the ladder opened after one tap');assert.equal(r.rescued,true,'rescued without holding the button');
 assert.equal(m.ladder.extension,0,'folded after the rescue');assert.equal(m.ladder.latched,false);
});
test('Fire v22: a second tap folds the ladder; driving off folds it; nothing opens without a tap',()=>{
 let {m}=setup(3);for(let i=0;i<60;i++)m.update(.02,{});assert.equal(m.ladder.extension,0,'closed without a tap');
 m.update(.02,{rescue:true});m.update(.02,{});for(let i=0;i<20;i++)m.update(.02,{});assert.equal(m.ladder.latched,true);
 m.update(.02,{rescue:true});m.update(.02,{});assert.equal(m.ladder.latched,false,'second tap closes');
 ({m}=setup(3));m.update(.02,{rescue:true});m.update(.02,{});for(let i=0;i<20;i++)m.update(.02,{});assert.equal(m.ladder.latched,true);
 for(let i=0;i<60;i++)m.update(.02,{moveX:-1,moveZ:0});assert.equal(m.ladder.latched,false,'driving away closes it');
});
test('Fire v22: wind stages keep the hold-and-balance control (a tap alone does not latch)',()=>{
 const {m}=setup(7);assert.equal(m.settings.ladderMode,'wind');m.update(.02,{rescue:true});m.update(.02,{});for(let i=0;i<30;i++)m.update(.02,{});assert.equal(m.ladder.latched,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/alien-flight-model.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames;
function fixture(kind=0,count=2){
 const balance=structuredClone(config.alienDefense);Object.assign(balance.levels[0],{rows:1,columns:count,waves:1,enemyRoster:[kind],enemyKinds:1});balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 const model=createAlienModel({config,balance,level:1,random:seededRandom(3),completion:'waves',roundChoices:false});
 return {model,balance};
}
function putShot(model,x,y,hp=4,kind=1){model.shots.push({x,y,vx:0,vy:-config.alienDefense.shotSpeed,hp,kind,damage:1,lastHit:-1,hitLo:0,hitHi:0,hitIds:new Set()});}
function place(a,x,y,hp=10){Object.assign(a,{x,y,baseX:x,baseY:y,originY:y,entry:0,hp,maxHp:hp,shield:0,diveAge:-1});}

test('review: production-speed laser pierces both legal side-by-side grazing contacts in one frame',()=>{
 const {model}=fixture();place(model.aliens[0],165,200);place(model.aliens[1],195,200);const before=model.aliens.reduce((n,a)=>n+a.hp,0);
 putShot(model,180,205);model.update(.04,{});
 assert.equal(before-model.aliens.reduce((n,a)=>n+a.hp,0),2,'The same 18.4px swept segment touches both enemies; one must not be skipped');
 assert.equal(model.snapshot().hits,2);
});

test('review: ordinary shot still stops after its first contact when a segment touches two enemies',()=>{
 const {model}=fixture();place(model.aliens[0],165,200);place(model.aliens[1],195,200);const before=model.aliens.reduce((n,a)=>n+a.hp,0);
 putShot(model,180,205,1,0);model.update(.04,{});
 assert.equal(before-model.aliens.reduce((n,a)=>n+a.hp,0),1);assert.equal(model.shots.length,0);
});

test('review: laser hit memory follows entity IDs when a splitter child reuses its parent pool slot',()=>{
 const {model}=fixture(3,1),parent=model.aliens[0],slot=parent.slot;place(parent,175,200,1);
 putShot(model,160,220);model.update(.04,{});
 const child=model.aliens.find(a=>a.child&&a.slot===slot);assert.ok(child,'Parent slot is reused by the left child');const childId=child.id;
 model.update(.04,{});
 assert.ok(!model.aliens.some(a=>a.id===childId),'The left child is a new target and the surviving laser crosses it');
});

test('review: repeated frames do not damage the same surviving target twice with one laser',()=>{
 const {model}=fixture(1,1),a=model.aliens[0];place(a,180,200,10);putShot(model,180,220);model.update(.04,{});model.update(.04,{});model.update(.04,{});
 assert.equal(a.hp,9);assert.equal(model.snapshot().hits,1);
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createFireModel} from '../workout/island/minigames/fire.mjs';

const {minigames:config}=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8'));
const balance=structuredClone(config.fireRescue);
balance.levels[0].wind=0;
const start=(fireLevels,equipment={})=>createFireModel({config,balance,level:1,fireLevels,equipment,random:()=>.5});

test('shorter range clamps the jet and prevents cooling at the old reach',()=>{
  const patched=start(true),original=start(false);
  assert.equal(patched.range,210);
  assert.equal(original.range,270);
  for(const [model,reachable] of [[patched,false],[original,true]]){
    const target=model.flames[0];
    target.x=model.nozzle.x+230;
    target.y=model.nozzle.y;
    model.update(.02,{firing:true,x:target.x,y:target.y});
    assert.equal(model.inRange,reachable);
    assert.equal(model.coolingTarget===0,reachable);
    assert.equal(model.impact.x-model.nozzle.x,reachable?230:210);
  }
});

test('range upgrades still scale reach and reticle radius',()=>{
  const multiplier=1.3,upgraded=start(true,{range:multiplier});
  assert.equal(upgraded.range,273);
  assert.equal(upgraded.aimRadius,balance.aimRadius*multiplier);
  assert.equal(upgraded.aimRadius,start(false,{range:multiplier}).aimRadius);
});

/* 20/11/2026 (integration): the shorter reach has its own kill switch. */
test('?fireRange=v24 keeps the v24 reach with the fire levels on',()=>{
  const saved=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{value:{search:'?fireRange=v24'},configurable:true});
  try{assert.equal(start(true).range,270);}
  finally{if(saved)Object.defineProperty(globalThis,'location',saved);else delete globalThis.location;}
  assert.equal(start(true).range,210);
});

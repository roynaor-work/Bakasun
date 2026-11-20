import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createInteriorModel} from '../workout/island/minigames/fire-v24-interior.mjs';
import {rescueAssetFiles} from '../workout/island/minigames/fire-levels-rescue.mjs';
import {createRescuePlayback} from '../workout/island/minigames/fire-levels-rescue-scene.mjs';
import {Group,Vector3} from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';

function play(friend,fireLevels=true){
  const plan={fireLevels,rescueActions:fireLevels,floorCount:1,seconds:30,tools:['water'],rooms:[{room:'living',floor:1,fires:['sofa'],friend}]};
  const model=createInteriorModel({plan});
  for(let i=0;i<10;i++)model.update(.1);
  model.update(.1,{skip:true});
  assert.equal(model.phase,'play');
  return model;
}

function cool(model){
  const spot=model.room.spots[0];
  for(let i=0;i<60&&!spot.done;i++)model.update(.1,{aim:spot.pos});
  assert.equal(spot.done,true);
}

function completeAction(model,id){
  assert.equal(model.rescueAction.id,id);
  assert.equal(model.rescueAction.active,false);
  model.update(.1,{rescueAction:id,aim:model.room.spots[0].pos});
  assert.equal(model.rescueAction.active,true);
  assert.equal(model.spraying,false);
  while(model.rescueAction?.id===id&&model.rescueAction.active){
    model.update(.1,{aim:model.room.spots[0].pos});
    assert.equal(model.spraying,false);
  }
}

test('the child needs three contextual actions and is credited once',()=>{
  const model=play('girl'),friend=model.room.friend;
  model.update(.1,{rescueAction:'lift-child'});
  assert.equal(model.rescueAction,null);
  cool(model);
  model.update(.1,{tap:friend.pos,aim:friend.pos,rescueAction:'set-down'});
  assert.equal(model.spraying,false);
  assert.equal(friend.state,'waiting');
  assert.equal(model.rescueAction.active,false);

  completeAction(model,'lift-child');
  assert.equal(friend.state,'waiting');
  assert.equal(model.rescuePose.id,'lift-child');
  completeAction(model,'carry-arms');
  assert.equal(friend.state,'waiting');
  completeAction(model,'set-down');
  assert.equal(friend.state,'out');
  assert.equal(model.events.filter(event=>event.kind==='rescue').length,1);
  assert.equal(model.rescueAction,null);
});

test('the button offers a lift for cats and clearing the path for dogs',()=>{
  for(const [friend,action]of [['cat','lift-cat'],['dog','clear-path']]){
    const model=play(friend);
    cool(model);
    completeAction(model,action);
    assert.equal(model.room.friend.state,'walking');
    for(let i=0;i<20;i++)model.update(.1);
    assert.equal(model.room.friend.state,'out');
    assert.equal(model.events.filter(event=>event.kind==='rescue').length,1);
  }
});

test('an unfinished rescue at the room deadline belongs to the team',()=>{
  const model=play('girl');
  cool(model);
  while(model.room.remaining>.4)model.update(.1);
  model.update(.1,{rescueAction:'lift-child'});
  assert.equal(model.rescueAction.active,true);
  for(let i=0;i<90&&!model.result;i++)model.update(.1);
  assert.equal(model.result.handovers,1);
  assert.equal(model.result.rescued,0);
  assert.equal(model.rescueAction,null);
  assert.equal(model.events.some(event=>event.kind==='rescue'),false);
});

test('legacy interiors retain their tap-based rescue',()=>{
  const model=play('girl',false);
  cool(model);
  model.update(.1,{tap:model.room.friend.pos});
  assert.equal(model.room.friend.state,'rescued');
  assert.equal(model.rescueAction,null);
});

test('runtime rescue assets cover the contextual buttons and canonical skeleton',()=>{
  const root=new URL('../workout/island/',import.meta.url);
  for (const file of rescueAssetFiles()) assert.ok(readFileSync(new URL(file,root)).length);
  function glb(name){
    const data=readFileSync(new URL('assets/fire-levels-v1/rescue/'+name,root));
    assert.equal(data.toString('ascii',0,4),'glTF');
    return JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
  }
  const model=glb('firefighter.glb'),motion=glb('fire-rescue-actions.glb');
  const characterBones=model.skins[0].joints.map(i=>model.nodes[i].name);
  const catalog=JSON.parse(readFileSync(new URL('assets/fire-levels-v1/rescue/catalog.json',root)));
  assert.equal(catalog.sampleRateHz,30);
  for(const {id,timer,propTracks}of catalog.actions){
    const clip=motion.animations.find(animation=>animation.name===id);
    assert.ok(clip,id);
    const targetNames=new Set(clip.channels.map(channel=>motion.nodes[channel.target.node].name));
    assert.deepEqual([...targetNames].sort(),characterBones.slice().sort());
    for(const track of Object.values(propTracks))assert.equal(track.length,timer.completesAtFrame+1);
  }
});

test('sampling the rescue action moves the canonical rig against the model clock',async()=>{
  const assets=new URL('../workout/island/assets/fire-levels-v1/rescue/',import.meta.url),loader=new GLTFLoader();
  function load(name){
    const data=readFileSync(new URL(name,assets));
    return loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  }
  const [character,motion]=await Promise.all([load('firefighter.glb'),load('fire-rescue-actions.glb')]);
  const catalog=JSON.parse(readFileSync(new URL('catalog.json',assets)));
  const stage=new Group(),crew=new Group();stage.add(crew);crew.add(character.scene);
  const playback=createRescuePlayback(crew,character.scene,motion.animations,catalog,()=>{});
  try{
    const model=play('girl');cool(model);
    model.update(.1,{rescueAction:'lift-child'});
    playback.update(model.rescuePose,model.room.friend,null);
    const hand=character.scene.getObjectByName('LeftHand'),start=hand.getWorldPosition(new Vector3());
    for(let i=0;i<13;i++)model.update(.1);
    playback.update(model.rescuePose,model.room.friend,null);
    assert.ok(start.distanceTo(hand.getWorldPosition(new Vector3()))>.15);
  }finally{playback.dispose();}
});

/* 20/11/2026 (integration): the rescue actions have their own kill switch, separate from ?fireLevels=0. */
test('?fireRescueActions=0 keeps the floors and goes back to tapping the friend',async()=>{
  const {fireRescueActionsEnabled}=await import('../workout/island/minigames/fire-levels-rescue.mjs');
  const {entryPlan}=await import('../workout/island/minigames/fire-v24.mjs');
  assert.equal(fireRescueActionsEnabled(''),true);
  assert.equal(fireRescueActionsEnabled('?fireRescueActions=0'),false);
  assert.equal(entryPlan(6,{fireLevels:true}).rescueActions,true);
  const off=entryPlan(6,{fireLevels:true,rescueActions:false});
  assert.equal(off.rescueActions,false);assert.equal(off.floorCount,4);
  assert.equal(entryPlan(6,{fireLevels:false}).rescueActions,undefined);
  const plan={fireLevels:true,rescueActions:false,floorCount:1,seconds:30,tools:['water'],rooms:[{room:'living',floor:1,fires:['sofa'],friend:'dog'}]};
  const model=createInteriorModel({plan});
  for(let i=0;i<10;i++)model.update(.1);
  model.update(.1,{skip:true});
  cool(model);
  assert.equal(model.rescueAction,null);
  const [x,,z]=model.room.friend.pos;
  model.update(.1,{tap:[x,.5,z]});
  assert.notEqual(model.room.friend.state,'waiting');
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createInteriorModel} from '../workout/island/minigames/fire-v24-interior.mjs';
import {entryPlan,entryStages,FLOOR_ASSET_PATH} from '../workout/island/minigames/fire-v24.mjs';

const assetHash='6d8bf9036c7e4b789c7345a67ad8c6a57ead8071530e024c8b38ac1f34992ee6';

async function loadFloorAsset(){
  const bytes=await readFile(new URL('../workout/island/minigames/'+FLOOR_ASSET_PATH,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),assetHash);
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const scene=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const nodes=new Map(scene.nodes.map(node=>[node.name,node]));
  assert.deepEqual(scene.scenes[0].nodes.map(index=>scene.nodes[index].name),[1,2,3].map(floor=>'building-floor-'+floor));
  assert.equal(nodes.size,483);
  return nodes;
}

function near(actual,expected,label){
  assert.equal(actual.length,3,label);
  assert.ok(actual.every((value,index)=>Math.abs(value-expected[index])<.002),label);
}

test('all enhanced floors use the source layouts and matching fire, rescue and exit anchors',async()=>{
  const asset=await loadFloorAsset();
  for(const stage of entryStages()){
    const plan=entryPlan(stage,{fireLevels:true});
    assert.equal(plan.floorCount,Math.min(10,stage/3+2));
    const model=createInteriorModel({plan});
    for(const [index,room] of model.rooms.entries()){
      assert.equal(room.floor,index+1);
      const prefix='f'+room.def.assetFloor+'_'+room.id;
      assert.ok(asset.has('room_'+prefix),prefix);
      near(room.friend.pos,asset.get('rescue_'+prefix).translation,prefix+' rescue');
      near(room.friend.exit,asset.get('door_exit_'+prefix).translation,prefix+' exit');
      for(const spot of room.spots){
        const id=prefix+'_'+spot.id;
        const item=asset.get('burn_'+id).translation,anchor=asset.get('fire_'+id).translation;
        near(spot.pos,item.map((value,axis)=>value+anchor[axis]),id);
      }
    }
  }
});

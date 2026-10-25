import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {configureBuilding} from '../workout/island/engine/registry.mjs';
import {createBuilding,disposeBuilding} from '../workout/island/view/buildings.mjs';

const root=new URL('../workout/island/data/',import.meta.url);
const [content,config]=await Promise.all(['buildings.json','config.json'].map(async path=>JSON.parse(await readFile(new URL(path,root),'utf8'))));
const definition=id=>configureBuilding(content.find(row=>row.id===id),config);

test('a family home has visible inset glass on all four sides after batching and rotation',()=>{
  const type=definition('house'),group=createBuilding(type,2),expected=new T.Color(type.levels[1].visual.windowColor);
  group.updateMatrixWorld(true);
  for(let side=0;side<4;side++) {
    const angle=side*Math.PI/2,axis=new T.Vector3(0,1,0),x=side%2?.04:-1.66/5+.04;
    const y=.08+1.56*1.4/2-.03;
    const origin=new T.Vector3(x,y,(side%2?1.66:1.24)/2+2).applyAxisAngle(axis,angle);
    const direction=new T.Vector3(0,0,-1).applyAxisAngle(axis,angle);
    const hit=new T.Raycaster(origin,direction).intersectObject(group,true)[0];
    assert.ok(hit,`facade ${side} is visible`);
    const actual=new T.Color().fromBufferAttribute(hit.object.geometry.attributes.color,hit.face.a);
    for(const channel of ['r','g','b'])assert.ok(Math.abs(actual[channel]-expected[channel])<1e-6,`facade ${side}: window is exposed`);
  }
  disposeBuilding(group);
});

test('decorated architecture keeps one draw, bounded geometry and unchanged definitions at every level',()=>{
  for(const id of ['house','school','cityHall','factory','police','prison']) {
    const type=definition(id),before=JSON.stringify(type);
    for(let level=1;level<=type.levels.length;level++) {
      const group=createBuilding(type,level),meshes=[];group.traverse(object=>{if(object.isMesh)meshes.push(object);});
      assert.equal(meshes.length,1,`${id} ${level} stays batched`);
      assert.ok(meshes[0].geometry.attributes.position.count<20000,`${id} ${level} retains a mobile geometry budget`);
      const bounds=new T.Box3().setFromObject(group);
      assert.ok(Number.isFinite(bounds.max.y-bounds.min.y));
      // Check each centered edge. Total width/depth can conceal an overhang
      // when the opposite edge of the building is inset from its plot boundary.
      for(const [axis,index]of [['x',0],['z',1]]) {
        const limit=type.footprint[index]/2,epsilon=1e-6;
        assert.ok(bounds.min[axis]>=-limit-epsilon,`${id} ${level}: minimum ${axis} stays in its plot`);
        assert.ok(bounds.max[axis]<=limit+epsilon,`${id} ${level}: maximum ${axis} stays in its plot`);
      }
      disposeBuilding(group);
    }
    assert.equal(JSON.stringify(type),before);
  }
});

test('authored models bypass the procedural facade kit and retain original resources',()=>{
  const geometry=new T.BoxGeometry(.7,1,.7),texture=new T.Texture(),material=new T.MeshStandardMaterial({color:'#789abc',map:texture});
  const source=new T.Group(),mesh=new T.Mesh(geometry,material);source.add(mesh);
  const vertices=Array.from(geometry.attributes.position.array),color=material.color.getHex(),type=definition('house');
  const created=createBuilding(type,1,{create(model){assert.equal(model.path,type.levels[0].model.path);return source;}});
  assert.equal(created,source);assert.equal(source.children.length,1);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
  assert.equal(material.map,texture);assert.equal(material.color.getHex(),color);assert.deepEqual(Array.from(geometry.attributes.position.array),vertices);
  let releases=0;for(const resource of [geometry,material,texture])resource.addEventListener('dispose',()=>releases++);
  disposeBuilding(created);assert.equal(releases,0);geometry.dispose();material.dispose();texture.dispose();
});

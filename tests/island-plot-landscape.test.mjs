import test from 'node:test';
import assert from 'node:assert/strict';
import {plotLandscape} from '../workout/island/view/plot-landscape.mjs';
import {CityStreets} from '../workout/island/view/city-streets.mjs';
import * as T from '../workout/island/vendor/three.module.js';

const fronts=[{dx:0,dz:1},{dx:0,dz:-1},{dx:1,dz:0},{dx:-1,dz:0}];
for(const [id,category]of [['house','basic'],['shop','basic'],['school','services'],['factory','basic']])for(const footprint of [[2,2],[3,2]]){
  test(`${id} ${footprint.join('x')} landscape stays inside its plot with a clear street entrance`,()=>{
    const building=Object.freeze({id:'plot',typeId:id,x:4,z:5,level:1}),type=Object.freeze({id,category,footprint}),before=JSON.stringify(building);
    for(const front of fronts){
      const a=plotLandscape(building,type,front),b=plotLandscape(building,type,front);assert.deepEqual(a,b);
      for(const [kind,items]of Object.entries({planes:a.planes,boxes:a.boxes,shrubs:a.shrubs}))for(const p of items){
        const depth=kind==='planes'?p.h:p.d;
        assert.ok(p.x-p.w/2>=building.x-.5-1e-8&&p.x+p.w/2<=building.x+footprint[0]-.5+1e-8,'X bounds');
        assert.ok(p.z-depth/2>=building.z-.5-1e-8&&p.z+depth/2<=building.z+footprint[1]-.5+1e-8,'Z bounds');
        if(kind!=='planes'){
          const cx=building.x+(footprint[0]-1)/2,cz=building.z+(footprint[1]-1)/2,u=(p.x-cx)*front.dz-(p.z-cz)*front.dx,v=(p.x-cx)*front.dx+(p.z-cz)*front.dz;
          const halfU=(Math.abs(front.dz)*p.w+Math.abs(front.dx)*p.d)/2,halfV=(Math.abs(front.dx)*p.w+Math.abs(front.dz)*p.d)/2,plotDepth=front.dx?footprint[0]:footprint[1];
          assert.ok(Math.abs(u)-halfU>=.32||v+halfV<=plotDepth/2-.52,'central entrance corridor remains free');
        }
      }
    }
    assert.equal(JSON.stringify(building),before);
  });
}

test('low quality drops ornaments while retaining the garden enclosure and clear gate',()=>{
  const building={x:2,z:3},type={id:'house',footprint:[2,2]},high=plotLandscape(building,type),low=plotLandscape(building,type,fronts[0],'low');
  assert.equal(low.gardens,1);assert.equal(low.shrubs.length,0);assert.ok(low.boxes.length<high.boxes.length);assert.ok(low.boxes.length>0);
  assert.deepEqual(plotLandscape(building,{id:'park',footprint:[3,3]}),{planes:[],boxes:[],shrubs:[],gardens:0,plazas:0,parking:0});
});

test('garden and plaza details reuse the existing three draw batches across city edits',()=>{
  const definitions=new Map([['house',{id:'house',footprint:[2,2],category:'basic',requiresRoad:true}],['shop',{id:'shop',footprint:[2,2],category:'basic',requiresRoad:true}],['road',{id:'road',isRoad:true,footprint:[1,1]}]]),rows=[{id:'home',typeId:'house',x:4,z:4,level:1},{id:'shop',typeId:'shop',x:7,z:4,level:1}];
  for(let x=4;x<=8;x++)rows.push({id:'road'+x,typeId:'road',x,z:6,level:1});
  const original=structuredClone(rows),scene=new T.Scene(),streets=new CityStreets(scene,.34,{create:()=>null});
  streets.rebuild(rows,16,id=>definitions.get(id));assert.equal(streets.metrics().gardens,1);assert.equal(streets.metrics().plazas,1);assert.equal(streets.metrics().parking,2);assert.equal(streets.metrics().draws,3);assert.equal(streets.metrics().entrances,2);
  const batches=[...streets.batches];streets.rebuild(rows,16,id=>definitions.get(id));assert.deepEqual(streets.batches,batches);assert.deepEqual(rows,original);
  streets.dispose();assert.equal(scene.children.length,0);
});

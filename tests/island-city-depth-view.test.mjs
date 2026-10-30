import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../workout/island/vendor/three.module.js';
import {CityDepthView} from '../workout/island/view/city-depth.mjs';

function fixture(){
  const buildings=[['home-a','house',2,2],['home-b','house',5,2],['factory-a','factory',9,2],['factory-b','factory',12,2],['water','waterTower',7,7],['port','harbor',0,12],['station','fireStation',8,10]].map(([id,typeId,x,z])=>({id,typeId,x,z,level:1}));
  const scene=new T.Scene(),geometry=new T.BoxGeometry(1,1,1),material=new T.MeshBasicMaterial(),groups=new Map(),radii=[];
  const definitions=new Map([...new Set(buildings.map(row=>row.typeId))].map(id=>[id,{id,footprint:id==='harbor'?[3,2]:[2,2]}]));
  for(const row of buildings){const group=new T.Group(),mesh=new T.Mesh(geometry,material);mesh.position.y=.6;mesh.scale.set(1,1.2,1);group.add(mesh);group.position.set(row.x,.34,row.z);scene.add(group);groups.set(row.id,{group});}
  const view={scene,groups,size:32,state:{buildings},definition:id=>definitions.get(id),worldPosition:(x,z)=>new T.Vector3(x,.34,z),showRadius:(...args)=>radii.push(args),data:{config:{events:{repairMarker:{radius:.15,height:.3,sides:4,color:'#e7a65f',offset:.2}}}}};
  const depth=new CityDepthView(view),report={buildings:[
    {id:'home-a',status:'unserved',water:{reason:'capacity'}},{id:'home-b',status:'unserved',water:{reason:'out-of-range'}},
    {id:'factory-a',status:'working',production:{tier:2}},{id:'factory-b',status:'working',production:{tier:3}},
    {id:'water',status:'working',service:{radius:6,serves:['home-a','home-b']}},{id:'port',status:'working'},{id:'station',status:'working'},
  ],port:{slots:[]}};
  return {view,depth,report,radii,dispose(){depth.dispose();for(const item of groups.values())if(item.repairMarker){item.repairMarker.geometry.dispose();item.repairMarker.material.dispose();}geometry.dispose();material.dispose();}};
}
function installCanvas(t){
  const previous=globalThis.document,context={beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},bezierCurveTo(){},lineTo(){},fillText(){}};
  globalThis.document={createElement:()=>({getContext:()=>context})};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
}
const badges=depth=>depth.root.children.filter(child=>child.isSprite);

test('unselected water and production reports create no floating signs or icon textures',()=>{
  const f=fixture(),before=JSON.stringify([f.view.state,f.report]);f.depth.update(f.report,null);
  assert.equal(f.depth.root.children.length,0);assert.equal(f.depth.icons.size,0);assert.equal(JSON.stringify([f.view.state,f.report]),before);
  f.depth.update(f.report,null);assert.equal(f.depth.root.children.length,0);f.dispose();
});

test('routine helper badges appear only for the selected home or factory and disappear when selection changes',t=>{
  installCanvas(t);const f=fixture();f.depth.update(f.report,'home-a');
  assert.deepEqual(badges(f.depth).map(marker=>marker.userData),[{cityKind:'water',buildingId:'home-a',reason:'capacity'}]);
  f.depth.update(f.report,'factory-b');assert.deepEqual(badges(f.depth).map(marker=>marker.userData),[{cityKind:'production',buildingId:'factory-b',tier:3}]);
  f.depth.update(f.report,'missing');assert.equal(badges(f.depth).length,0);f.depth.update(f.report,null);assert.equal(f.depth.root.children.length,0);
  let releases=0;for(const icon of f.depth.icons.values())for(const resource of [icon,icon.map])resource.addEventListener('dispose',()=>releases++);
  const expected=f.depth.icons.size*2;f.dispose();assert.equal(releases,expected);
});

test('physical port cargo and urgent repair geometry remain visible without routine helper signs',()=>{
  const f=fixture();f.report.buildings.find(row=>row.id==='station').status='damaged';f.report.port.slots=[{state:'offered',harborId:'port'},{state:'offered',harborId:'port'}];
  f.depth.update(f.report,null);assert.equal(badges(f.depth).length,0);assert.equal(f.depth.icons.size,0);
  const cargo=f.depth.root.children.filter(child=>child.userData.cityKind==='port');assert.equal(cargo.length,1);assert.equal(cargo[0].children.length,3);assert.ok(cargo[0].children.every(child=>child.isMesh));
  const station=f.view.groups.get('station');assert.ok(station.repairMarker?.visible);assert.equal(station.repairMarker.parent,station.group);
  f.report.buildings.find(row=>row.id==='station').status='working';f.report.port.slots=[];f.depth.update(f.report,null);
  assert.equal(station.repairMarker.visible,false);assert.equal(f.depth.root.children.length,0);f.dispose();
});

test('selected service radius and served-building overlays retain their behavior without background badges',()=>{
  const f=fixture();f.depth.update(f.report,'water');assert.equal(badges(f.depth).length,0);assert.equal(f.radii.at(-1)[0].radius,6);assert.equal(f.radii.at(-1)[1].id,'water');
  assert.deepEqual(f.depth.root.children.map(child=>child.userData.buildingId).sort(),['home-a','home-b']);
  assert.ok(f.depth.root.children.every(child=>child.userData.cityKind==='served'&&child.children.some(part=>part.isLineSegments)));assert.equal(f.view.cityRadius,true);
  f.depth.update(f.report,null);assert.deepEqual(f.radii.at(-1),[null]);assert.equal(f.view.cityRadius,false);assert.equal(f.depth.root.children.length,0);f.dispose();
});

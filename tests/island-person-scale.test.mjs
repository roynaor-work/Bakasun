import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {Avatar,Citizens as PrimitiveCitizens} from '../workout/island/view/avatar.mjs';
import {Citizens} from '../workout/island/view/city-citizens.mjs';
import {IslandView} from '../workout/island/view/island-view.mjs';
import {LocalModels} from '../workout/island/view/local-models.mjs';
import {GROUND} from '../workout/island/view/environment.mjs';
import {disposePath} from '../workout/island/view/city-life.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';

const base=new URL('../workout/island/',import.meta.url);
const data=await loadData(base,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
// Parse the real supplied geometry, rig and animation. Only material loading
// is replaced: image decoding and a GPU are unnecessary for vertex measures.
const loader=new GLTFLoader().register(()=>({name:'MEASURE_ORIGINAL_GEOMETRY',loadMaterial:()=>Promise.resolve(new T.MeshBasicMaterial())}));
async function source(path){
  const bytes=await readFile(new URL(path,base));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const modelLoader={loadAsync:url=>source(new URL(url).pathname.slice(base.pathname.length))};

/** Evaluate actual skinned/morphed vertices; transformed bounding boxes can
 * exaggerate the big head or report a shoe below its true animated sole. */
function visibleBounds(root){
  let top=root;while(top.parent)top=top.parent;top.updateMatrixWorld(true);
  const bounds=new T.Box3(),vertex=new T.Vector3(),instance=new T.Matrix4(),world=new T.Matrix4();
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    for(let n=0;n<(mesh.isInstancedMesh?mesh.count:1);n++){
      if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        mesh.getVertexPosition(i,vertex);bounds.expandByPoint(vertex.applyMatrix4(world));
      }
    }
  });
  return bounds;
}
const height=root=>visibleBounds(root).getSize(new T.Vector3()).y;
async function child(scene=new T.Scene()){
  const gltf=await source('assets/kid-full.glb'),avatar=new Avatar(scene);
  avatar.root=gltf.scene;avatar.root.getObjectByName('Ball')?.traverse(o=>{o.visible=false;});avatar.holder.add(avatar.root);
  avatar.mixer=new T.AnimationMixer(avatar.root);avatar.walkClip=gltf.animations.find(c=>c.name==='run');avatar.standClip=gltf.animations.find(c=>c.name==='stand');
  avatar.play(false);avatar.mixer.update(0);return avatar;
}
function releasePrimitive(citizens){for(const mesh of citizens.meshes){mesh.dispose();mesh.geometry.dispose();}citizens.root.removeFromParent();}
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} should be close to ${b}`);

test('the original child rig is shorter than original adults and the first house roof at city scale',async()=>{
  const avatar=await child(),models=new LocalModels({loader:modelLoader}),walker=data.config.cityView.meshyPilot.walker;
  const woman={...walker,path:'assets/models/adult-woman-rigged-512.glb'},house=data.buildings.find(b=>b.id==='house').levels[0].model;
  await Promise.all([walker,woman,house].map(spec=>models.load(spec)));
  const childHeight=height(avatar.holder),adults=[models.create(walker),models.create(woman)],roofHeight=height(models.create(house));
  for(const adult of adults){const ratio=childHeight/height(adult);assert.ok(ratio>=.7&&ratio<=.85,`child/adult height ratio ${ratio}`);}
  assert.ok(childHeight<roofHeight*.4,`child ${childHeight}, house roof ${roofHeight}`);
  // This is a geometry contract, independent of how the city chooses its scale.
  assert.ok(height(avatar.root)/avatar.holder.scale.y>2.6);
  for(const adult of adults)adult.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});
  avatar.dispose();models.dispose();
});

test('primitive fallback people match the original adult height through their walking poses',async()=>{
  const models=new LocalModels({loader:modelLoader}),spec=data.config.cityView.meshyPilot.walker;await models.load(spec);
  const adult=models.create(spec),adultHeight=height(adult),people=new PrimitiveCitizens(new T.Scene(),1);
  people.setPoints([{x:0,y:GROUND,z:0,neighbors:[1]},{x:2,y:GROUND,z:0,neighbors:[0]}],1);
  for(const time of [0,.25,.5,.75]){
    people.tick(.01,time);const ratio=height(people.root)/adultHeight;
    assert.ok(Math.abs(ratio-1)<.05,`fallback/adult height ratio ${ratio} at ${time}`);
  }
  releasePrimitive(people);adult.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});models.dispose();
});

test('the small child keeps its gait distance and stands on raised paths without changing source geometry',async()=>{
  const avatar=await child(),positions=[];
  avatar.root.traverse(o=>{if(o.isMesh)positions.push([o.geometry.attributes.position,o.geometry.attributes.position.array.slice()]);});
  const beforeHash=createHash('sha256').update(await readFile(new URL('assets/kid-full.glb',base))).digest('hex');
  const standingHeight=height(avatar.holder),pavement=GROUND+.158,route=[{x:2,y:pavement,z:0}];
  let minimumSole=Infinity;for(let i=0;i<120;i++){
    avatar.tick(1/120,i/120,route);
    if(i>80)minimumSole=Math.min(minimumSole,visibleBounds(avatar.holder).min.y);
  }
  const gaitCycle=avatar.walkClip.duration/avatar.action.getEffectiveTimeScale();
  const heightsPerCycle=avatar.holder.position.x*gaitCycle/standingHeight;
  assert.ok(heightsPerCycle>.8&&heightsPerCycle<1.05,`${heightsPerCycle} body heights per gait cycle`);
  close(avatar.holder.position.y,pavement,.0001);assert.ok(minimumSole>pavement-.003);
  assert.ok(route.length>0);for(const [attribute,original] of positions)assert.deepEqual(attribute.array,original);
  assert.equal(createHash('sha256').update(await readFile(new URL('assets/kid-full.glb',base))).digest('hex'),beforeHash);
  // Existing callers with X/Z-only waypoints still arrive at ordinary ground.
  const flat=[{x:avatar.holder.position.x+.05,z:0}];for(let i=0;i<80;i++)avatar.tick(.05,i*.05,flat);
  assert.equal(flat.length,0);close(avatar.holder.position.y,GROUND,.025);
  avatar.dispose();
});

test('the character editor still previews the full original rig and restores its city holder',async()=>{
  const avatar=await child(),cityHeight=height(avatar.holder),parent=avatar.root.parent,position=avatar.holder.position.clone();
  const scene=new T.Scene(),holder=new T.Group();scene.add(holder);let previewHeight=0;
  const view={avatar,preview:{scene,holder,camera:new T.Camera(),renderer:{render(){previewHeight=height(holder);}}}};
  IslandView.prototype.renderAvatarPreview.call(view);
  assert.ok(previewHeight>2.6&&previewHeight<2.7);assert.ok(previewHeight>cityHeight*5);
  assert.equal(avatar.root.parent,parent);assert.deepEqual(avatar.holder.position,position);close(height(avatar.holder),cityHeight);
  avatar.dispose();
});

test('child and animated adults share connected pavement points without spending or saving',async()=>{
  let saves=0;const engine=createEngine(data,{storage:{getItem:()=>null,setItem(){saves++;}},now:()=>1000});
  const saved=engine.exportJSON(),saveCount=saves,scene=new T.Scene(),avatar=await child(scene),citizens=new Citizens(scene,4,{loader:modelLoader});
  const view={scene,size:engine.state.world.size,quality:'high',state:engine.state,data:{...data,registry:engine.registry},avatar,citizens,
    definition:id=>engine.registry.buildings.get(id),worldPosition:IslandView.prototype.worldPosition,
    pilot:{sync(){},walker:null}};
  IslandView.prototype.refreshWalkers.call(view,engine.state.buildings);await citizens.ready;
  assert.equal(view.walkPoints,citizens.points);assert.ok(view.walkPoints.some(p=>p.y>GROUND+.1));
  assert.deepEqual(avatar.holder.position.toArray(),view.walkPoints[Math.floor(view.walkPoints.length/2)].toArray());
  const start=view.walkPoints[Math.floor(view.walkPoints.length/2)],next=view.walkPoints[start.neighbors[0]];
  assert.ok(next);const route=[{x:next.x,y:next.y,z:next.z}];
  for(let i=0;i<40;i++){
    avatar.tick(.05,i*.05,route);citizens.tick(.05,i*.05);
    for(let n=0;n<citizens.visuals.length;n++){
      const walker=citizens.visuals[n],person=citizens.people[n];close(walker.root.position.y,person.y);
      assert.ok(visibleBounds(walker.root).min.y>person.y-.02);
    }
  }
  assert.equal(engine.exportJSON(),saved);assert.equal(saves,saveCount);
  disposePath(view.pathsMesh);citizens.dispose();avatar.dispose();
});

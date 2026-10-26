import * as T from '../vendor/three.module.js';
import {batchMeshes} from './batch.mjs?v=island-clean-ui-20261026-1';
import {groundTexture,islandTerrain,releaseTerrain} from './ultra-island-terrain.mjs?v=island-clean-ui-20261026-1';
import {createIslandWater} from './ultra-island-water.mjs?v=island-clean-ui-20261026-1';
import {IslandFlora} from './ultra-island-flora.mjs?v=island-clean-ui-20261026-1';
import {createCoastalDetails,createNeighborScenery} from './ultra-island-scenery.mjs?v=island-clean-ui-20261026-1';

// All placement, walking and building code shares this unchanged ground plane.
export const GROUND=.34;
export const palette={grass:'#789f67',sand:'#e8d3a6',sea:'#237e87',stone:'#b5ab8e',cream:'#fff4dc',teal:'#287a83',coral:'#c68469'};
const geometries=new Map(),materials=new Map();
export function material(color,options={}){
  const key=`${color}:${JSON.stringify(options)}`;
  if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:.92,...options}));
  return materials.get(key);
}
export function primitive(parent,kind,color,position=[0,0,0],scale=[1,1,1],options={}){
  if(!geometries.has(kind))geometries.set(kind,kind==='box'?new T.BoxGeometry(1,1,1):kind==='cone'?new T.ConeGeometry(.5,1,6):kind==='sphere'?new T.IcosahedronGeometry(.5,1):kind==='cylinder'?new T.CylinderGeometry(.5,.5,1,12):new T.CylinderGeometry(.5,.5,1,8));
  const mesh=new T.Mesh(geometries.get(kind),material(color,options));mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
// Building-kit trees retain their established API. Coastal trees below use the
// original Meshy GLB, instanced without changing its geometry or texture maps.
export function makeTree(parent,x,z,scale=1,tone=0){
  const group=new T.Group();group.position.set(x,GROUND,z);group.scale.setScalar(scale);parent.add(group);
  primitive(group,'cylinder','#ad875b',[0,.46,0],[.17,.92,.17]);
  primitive(group,'sphere',['#4ba675','#67ae71','#87bd68'][tone%3],[0,1.2,0],[1.05,1.45,1.05]);return group;
}

export class Environment{
  constructor(scene,world={}){
    this.scene=scene;this.size=0;this.style=world.viewConfig;this.disposed=false;
    this.root=new T.Group();this.root.name='ultra-island-environment';scene.add(this.root);
    this.grassMap=groundTexture('grass');this.sandMap=groundTexture('sand');
    this.grassMaterial=new T.MeshStandardMaterial({map:this.grassMap,vertexColors:true,roughness:1});
    this.sandMaterial=new T.MeshStandardMaterial({map:this.sandMap,vertexColors:true,roughness:.98});
    this.water=createIslandWater(scene);this.sea=this.water.sea;
    this.scenery=createNeighborScenery(scene,world.neighbors||[],this.style?.neighbors,{primitive,material,batchMeshes});this.landmarks=this.scenery.landmarks;
    this.flora=new IslandFlora(this.root);this.modelsReady=this.flora.ready;
  }
  rebuild(size){
    if(this.disposed||this.size===size)return;this.size=size;releaseTerrain(this.land);
    const land=islandTerrain(size,GROUND,this.grassMaterial,this.sandMaterial);land.name='natural-island-shore';this.scene.add(land);this.land=land;
    const coast=createCoastalDetails(size,GROUND);land.add(coast.group);this.coastalDetails=coast.group;this.setQuality(this.quality||'high');
    this.scenery.position(size);this.water.setWorld(size,this.scenery.neighbors);
    const palms=[...coast.palms];
    for(const n of this.scenery.neighbors)if(n.record.kind!=='mountains')for(const [i,x]of [-2.8,2.9].entries())palms.push({x:n.x+x,y:n.root.position.y+.1,z:n.z-1.7,angle:i*2.1,scale:.58+i*.07});
    this.flora.rebuild(palms);
    const grid=new T.GridHelper(size,size,'#456f5d','#c2d5ad');grid.position.set(0,GROUND+.006,0);grid.material.transparent=true;grid.material.opacity=.26;grid.visible=Boolean(this.placementGrid);grid.material.depthWrite=false;land.add(grid);this.grid=grid;
  }
  showPlacementGrid(visible){this.placementGrid=visible;if(this.grid)this.grid.visible=visible;}
  tick(time){if(!this.disposed)this.water.update(time);}
  setQuality(quality){this.quality=quality;if(this.coastalDetails)for(const mesh of this.coastalDetails.children)if(mesh.isInstancedMesh)mesh.count=quality==='low'?Math.ceil(mesh.instanceMatrix.count*.65):mesh.instanceMatrix.count;}
  metrics(){return {coast:'outward-only',placementHeight:GROUND,flora:this.flora.metrics(),water:this.water.metrics()};}
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.flora.dispose();releaseTerrain(this.land);this.scenery.dispose();this.water.dispose();this.root.removeFromParent();
    for(const resource of [this.grassMap,this.sandMap,this.grassMaterial,this.sandMaterial])resource.dispose();
  }
}

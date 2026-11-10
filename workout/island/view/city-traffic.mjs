import * as T from '../vendor/three.module.js';
import {cityRoadNetwork,createCityTraffic} from './city-traffic-model.mjs?v=island-v2-20261107-8';

/** The original Meshy car keeps its geometry, materials and textures. Instanced
 * draws share the pilot's existing model cache; this layer never disposes it. */
export class CityTraffic{
  constructor(scene,models,carSpec,ground,variants=[]){Object.assign(this,{scene,models,carSpec,ground,variants});this.batches=[];this.quality='high';this.disposed=false;this.variantsRequested=false;}
  sync(buildings,size,definition,force=false){
    if(this.disposed)return;
    const signature=JSON.stringify([size,this.quality,buildings.filter(b=>definition(b.typeId||b.type)?.isRoad).map(b=>[b.x,b.z,b.typeId])]);
    if(!force&&signature===this.signature)return;this.signature=signature;this.clear();this.size=size;
    this.network=cityRoadNetwork(buildings,size,definition);this.model=createCityTraffic(this.network,{maxCars:this.quality==='low'?3:8});
    const capacity=this.model.cars.length;if(!capacity)return;
    if(this.variants.length&&!this.variantsRequested&&this.models.load){this.variantsRequested=true;Promise.all(this.variants.map(spec=>this.models.load(spec))).then(()=>{if(!this.disposed)this.sync(buildings,size,definition,true);});}
    // Cars are dealt out across the loaded models; a model that is not ready yet is skipped.
    const sources=[this.carSpec,...this.variants].map(spec=>spec&&this.models.create(spec)).filter(Boolean);if(!sources.length)return;
    sources.forEach((source,k)=>{
      const indices=this.model.cars.map((_,i)=>i).filter(i=>i%sources.length===k);if(!indices.length)return;
      source.updateMatrixWorld(true);
      source.traverse(part=>{if(!part.isMesh)return;const mesh=new T.InstancedMesh(part.geometry,part.material,indices.length);mesh.name='Meshy city traffic';mesh.castShadow=this.quality!=='low';mesh.receiveShadow=true;mesh.frustumCulled=false;this.scene.add(mesh);this.batches.push({mesh,local:part.matrixWorld.clone(),indices});});
    });
    this.update(0);
  }
  update(dt){
    if(this.disposed||!this.model)return;this.model.step(dt);
    const dummy=new T.Object3D(),matrix=new T.Matrix4(),offset=(this.size-1)/2;
    for(const {mesh,local,indices}of this.batches){
      for(const [slot,index]of indices.entries()){
        const c=this.model.cars[index];
        dummy.position.set(c.x-offset,this.ground+.122,c.z-offset);dummy.rotation.set(0,c.heading+Math.PI,0);dummy.updateMatrix();matrix.multiplyMatrices(dummy.matrix,local);mesh.setMatrixAt(slot,matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  clear(){for(const {mesh}of this.batches){mesh.removeFromParent();mesh.dispose();}this.batches=[];this.model?.dispose();}
  metrics(){return {...this.model?.metrics(),draws:this.batches.length,originalModel:true,disposed:this.disposed};}
  dispose(){if(this.disposed)return;this.clear();this.disposed=true;}
}

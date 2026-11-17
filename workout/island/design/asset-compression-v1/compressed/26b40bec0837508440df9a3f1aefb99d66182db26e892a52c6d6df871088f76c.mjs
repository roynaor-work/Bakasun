import * as T from '../vendor/three.module.js';

/** Flat, batched planning marks leave original building geometry and materials intact. */
export class CityOverlay{
  constructor(scene,ground){
    this.ground=ground;this.geometry=new T.PlaneGeometry(1,1);this.material=new T.MeshBasicMaterial({transparent:true,opacity:.46,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    this.mesh=new T.InstancedMesh(this.geometry,this.material,1024);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.mesh.userData.cityOverlay=true;scene.add(this.mesh);this.mode=null;
  }
  sync(state,definition,config,report){
    const plans=state.cityManagement?.zones||[],signature=JSON.stringify([this.mode,state.world.size,plans,state.buildings.map(row=>[row.id,row.typeId,row.x,row.z]),this.mode?report?.services[this.mode]?.homes:null]);
    if(signature===this.signature)return;this.signature=signature;
    const occupied=new Set(state.buildings.flatMap(row=>{const [w,d]=definition(row.typeId).footprint;return Array.from({length:w*d},(_,i)=>`${row.x+i%w},${row.z+Math.floor(i/w)}`);}));
    const marks=[];
    for(const zone of plans){
      const spec=config.cityManagement.zones[zone.kind],type=definition(spec.typeId),[w,d]=type.footprint;
      if(Array.from({length:w*d},(_,i)=>`${zone.x+i%w},${zone.z+Math.floor(i/w)}`).some(key=>occupied.has(key)))continue;
      marks.push({...zone,w,d,color:spec.color});
    }
    if(this.mode&&report){
      const coverage=report.services[this.mode]?.homes||{};
      for(const row of state.buildings){if(!Object.hasOwn(coverage,row.id))continue;const [w,d]=definition(row.typeId).footprint,value=coverage[row.id];marks.push({...row,w,d,expanded:.3,color:value>=80?'#3cb988':value>0?'#eebf50':'#e16e60'});}
    }
    const dummy=new T.Object3D();this.mesh.count=Math.min(marks.length,1024);
    for(const [index,mark]of marks.slice(0,1024).entries()){
      dummy.position.set(mark.x+(mark.w-1)/2-(state.world.size-1)/2,this.ground+.047,mark.z+(mark.d-1)/2-(state.world.size-1)/2);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(mark.w+(mark.expanded||0)-.08,mark.d+(mark.expanded||0)-.08,1);dummy.updateMatrix();this.mesh.setMatrixAt(index,dummy.matrix);this.mesh.setColorAt(index,new T.Color(mark.color));
    }
    this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();}
}

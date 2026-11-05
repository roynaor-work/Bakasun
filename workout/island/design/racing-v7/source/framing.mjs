// Serialized into the page by the authoring tools; no runtime dependency.
export async function readCarFraming(){
  const T=await import('./vendor/three.module.js'),api=window.__racingV7;
  const p=new T.Vector3(),instance=new T.Matrix4(),matrix=new T.Matrix4();
  const car={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};let vertices=0;
  api.hero.updateWorldMatrix(true,true);
  api.hero.traverseVisible(object=>{
    if(!object.isMesh)return;
    const positions=object.geometry.getAttribute('position');if(!positions)return;
    const index=object.geometry.getIndex(),draw=object.geometry.drawRange;
    const available=index?index.count:positions.count,start=draw.start||0,end=Math.min(available,Number.isFinite(draw.count)?start+draw.count:available);
    const used=new Set();for(let v=start;v<end;v++)used.add(index?index.getX(v):v);
    const count=object.isInstancedMesh?object.count:1;
    for(let i=0;i<count;i++){
      if(object.isInstancedMesh){object.getMatrixAt(i,instance);matrix.multiplyMatrices(object.matrixWorld,instance);}
      else matrix.copy(object.matrixWorld);
      for(const v of used){
        p.fromBufferAttribute(positions,v).applyMatrix4(matrix).project(api.camera);
        const x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;
        car.left=Math.min(car.left,x);car.right=Math.max(car.right,x);car.top=Math.min(car.top,y);car.bottom=Math.max(car.bottom,y);vertices++;
      }
    }
  });
  const overlays={};
  for(const selector of ['.view-tools','.garage','.destinations','.identity','.top-actions','.scene-caption']){
    const r=document.querySelector(selector).getBoundingClientRect();
    const overlapWidth=Math.max(0,Math.min(car.right,r.right)-Math.max(car.left,r.left));
    const overlapHeight=Math.max(0,Math.min(car.bottom,r.bottom)-Math.max(car.top,r.top));
    overlays[selector]={left:r.left,right:r.right,top:r.top,bottom:r.bottom,conservativeOverlapArea:overlapWidth*overlapHeight};
  }
  const origin=api.camera.getWorldPosition(new T.Vector3()),target=api.hero.localToWorld(new T.Vector3(0,1.05,0)),direction=target.clone().sub(origin);
  const distance=direction.length();direction.normalize();
  const ray=new T.Raycaster(origin,direction,.15,Math.max(.2,distance-.1)),worldMeshes=[];
  api.world.root.traverseVisible(o=>{if(o.isMesh&&o.name!=='Gradient sky')worldMeshes.push(o);});
  const foregroundOccluders=ray.intersectObjects(worldMeshes,false).slice(0,3).map(hit=>({name:hit.object.name,instance:hit.instanceId??null,distance:hit.distance}));
  return{car,overlays,vertices,foregroundOccluders,inspectionHiddenInstances:api.world.inspectionHiddenCount,method:'Projected indexed vertices of visible car meshes and instanced wheels, plus a camera-to-car center ray; rectangle intersections are conservative for curved silhouettes'};
}

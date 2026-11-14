// SPDX-License-Identifier: CC0-1.0
// The host provides its existing THREE namespace, actor and GLTFLoader result.
// This module does not patch the game's loader, skeleton, materials or animation loop.
export function mountEquipment(T, asset, actor, {width=1,depth=1,paintUnderlayer=true}={}) {
  const bones={},nodes={};actor.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  for(const name of ['Root','Hips','Spine','Chest','Head','RightHand'])if(!bones[name])throw Error('Missing canonical bone '+name);
  const scaleRoot=actor.getObjectByName('BodyScale')??actor;
  const underlayers=[];
  if(paintUnderlayer)actor.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    const region=o.geometry.attributes._region??o.geometry.attributes._REGION;if(!region)return;
    const original=o.geometry;o.geometry=original.clone();underlayers.push({mesh:o,original,painted:o.geometry});
    const colors=o.geometry.attributes.color;
    for(let i=0;i<region.count;i++){
      const id=region.getX(i),srgb=[1,2,3].includes(id)?'#ad2d29':[4,5,8].includes(id)?'#243747':null;
      if(srgb){const c=new T.Color(srgb);colors.setXYZ(i,c.r,c.g,c.b);}
    }
    colors.needsUpdate=true;
  });
  const meshes=[];asset.scene.traverse(o=>{if(o.isMesh||o.isLine)meshes.push(o);});
  const ownGeometries=[];
  for(const mesh of meshes){
    nodes[mesh.name]=mesh;
    const attach=mesh.userData.attachBone;
    if(mesh.isSkinnedMesh){
      mesh.geometry=mesh.geometry.clone();ownGeometries.push(mesh.geometry);mesh.geometry.scale(width,1,depth);
      const source=mesh.skeleton;
      const skeleton=new T.Skeleton(source.bones.map(b=>{if(!bones[b.name])throw Error('Missing '+b.name);return bones[b.name];}),source.boneInverses.map(m=>m.clone()));
      scaleRoot.add(mesh);mesh.bind(skeleton,new T.Matrix4());
    }else if(attach){bones[attach].add(mesh);mesh.scale.set(width,1,depth);}
    else scaleRoot.add(mesh);
    mesh.castShadow=mesh.isMesh;mesh.receiveShadow=mesh.isMesh;
  }
  const nozzle=nodes.nozzle,emitter=nozzle.getObjectByName('water_emitter'),surface=nodes.hose_surface,line=nodes.hose_centerline;
  const N=18,R=5,vertices=(N+1)*(R+1),indices=[];
  for(let k=0;k<N;k++)for(let r=0;r<R;r++){const a=k*(R+1)+r,b=a+R+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new T.BufferGeometry(),positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),color=new T.Color('#dba76c');
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));
  geometry.setAttribute('color',new T.BufferAttribute(Float32Array.from({length:vertices*3},(_,i)=>color.toArray()[i%3]),3));
  geometry.setAttribute('_region',new T.BufferAttribute(new Uint8Array(vertices).fill(9),1));geometry.setIndex(indices);
  surface.geometry=geometry;surface.frustumCulled=false;ownGeometries.push(geometry);
  const lineGeometry=new T.BufferGeometry();lineGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array((N+1)*3),3));line.geometry=lineGeometry;
  line.material=new T.LineBasicMaterial({color:'#fff0c2'});line.frustumCulled=false;line.visible=false;ownGeometries.push(lineGeometry);
  const temp=new T.Vector3(),up=new T.Vector3(0,1,0),binormal=new T.Vector3(),normal=new T.Vector3(),tangent=new T.Vector3();
  function localPoint(node,point){temp.set(...point);node.localToWorld(temp);return scaleRoot.worldToLocal(temp).clone();}
  let stowed=false;
  function update({time=0,spray=false,stow=false,mask=true,showLine=false}={}){
    if(stow!==stowed){(stow?bones.Chest:bones.RightHand).add(nozzle);stowed=stow;}
    nozzle.position.set(stow?.18:0,stow?-.12:0,stow?-.18:0);
    const amplitude=spray&&!stow?Math.sin(time*2*Math.PI*10):0;
    nozzle.position.y+=.0015*amplitude;nozzle.rotation.set(.65*Math.PI/180*amplitude,0,.4*Math.PI/180*amplitude);
    nodes.oxygen_mask.visible=mask;nodes.mask_regulator.visible=mask;line.visible=showLine;
    actor.updateMatrixWorld(true);
    const a=localPoint(bones.Chest,[0,-.24,-.24]),b=localPoint(nozzle,[0,-.045,.035]);
    const low=Math.max(.20,Math.min(a.y,b.y)-.48),side=Math.min(a.x,b.x)-.25;
    const control=[a,new T.Vector3(side,a.y-.11,a.z+.03),new T.Vector3(side-.05,low,(a.z+b.z)/2),new T.Vector3(b.x-.13,Math.max(low+.08,b.y-.20),b.z-.03),b];
    const curve=new T.CatmullRomCurve3(control);
    for(let k=0;k<=N;k++){
      const p=curve.getPoint(k/N);tangent.copy(curve.getTangent(k/N)).normalize();
      binormal.crossVectors(tangent,up);if(binormal.lengthSq()<1e-8)binormal.set(1,0,0);binormal.normalize();normal.crossVectors(binormal,tangent).normalize();
      line.geometry.attributes.position.setXYZ(k,p.x,p.y,p.z);
      for(let r=0;r<=R;r++){
        const angle=r/R*Math.PI*2,nx=Math.cos(angle),ny=Math.sin(angle),id=k*(R+1)+r;
        temp.copy(binormal).multiplyScalar(nx).addScaledVector(normal,ny);
        geometry.attributes.normal.setXYZ(id,temp.x,temp.y,temp.z);
        geometry.attributes.position.setXYZ(id,p.x+.014*temp.x,p.y+.014*temp.y,p.z+.014*temp.z);
      }
    }
    geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;line.geometry.attributes.position.needsUpdate=true;
    return {start:a.toArray(),end:b.toArray(),emitter:emitter.getWorldPosition(new T.Vector3()).toArray(),spraying:spray&&!stow};
  }
  function recolor(regionId,srgb){
    const color=new T.Color(srgb);
    for(const mesh of meshes){const region=mesh.geometry.attributes._region??mesh.geometry.attributes._REGION,c=mesh.geometry.attributes.color;if(!region||!c)continue;
      if(!ownGeometries.includes(mesh.geometry)){mesh.geometry=mesh.geometry.clone();ownGeometries.push(mesh.geometry);}
      const ownColor=mesh.geometry.attributes.color;
      for(let i=0;i<region.count;i++)if(region.getX(i)===regionId)ownColor.setXYZ(i,color.r,color.g,color.b);ownColor.needsUpdate=true;
    }
  }
  update();
  return {nodes,bones,scaleRoot,emitter,nozzle,update,recolor,
    dispose(){for(const mesh of meshes)mesh.removeFromParent();for(const g of ownGeometries)g.dispose();for(const u of underlayers){u.mesh.geometry=u.original;u.painted.dispose();}line.material.dispose();}};
}

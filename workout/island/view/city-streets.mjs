import * as T from '../vendor/three.module.js';
import {cityRoadNetwork} from './city-traffic-model.mjs?v=island-naval-aim-20261027-1';
import {streetFront} from '../engine/city-sites.mjs?v=island-naval-aim-20261027-1';
import {plotLandscape} from './plot-landscape.mjs?v=island-naval-aim-20261027-1';

/** Paving and street furniture are derived visuals inside existing footprints.
 * No saved building, authored GLB, construction rule or ground plane is changed. */
export class CityStreets{
  constructor(scene,ground,palmModels){
    Object.assign(this,{scene,ground,palmModels});this.batches=[];this.palms=[];this.quality='high';this.disposed=false;
    this.planeGeometry=new T.PlaneGeometry(1,1);this.boxGeometry=new T.BoxGeometry(1,1,1);this.shrubGeometry=new T.IcosahedronGeometry(.5,1);
    const pixels=new Uint8Array(64*64*4);let seed=11;
    for(let i=0;i<pixels.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=pixels[i+1]=pixels[i+2]=230+seed%25;pixels[i+3]=255;}
    this.texture=new T.DataTexture(pixels,64,64);this.texture.colorSpace=T.SRGBColorSpace;this.texture.wrapS=this.texture.wrapT=T.RepeatWrapping;this.texture.needsUpdate=true;
    this.material=new T.MeshStandardMaterial({color:'#ffffff',map:this.texture,roughness:.9});
  }
  rebuild(buildings,size,definition,force=false){
    if(this.disposed)return;const signature=JSON.stringify([size,this.quality,buildings.map(b=>[b.id,b.typeId,b.x,b.z,b.level])]);
    if(!force&&this.signature===signature)return;this.signature=signature;this.clear();
    const network=cityRoadNetwork(buildings,size,definition),planes=[],boxes=[],shrubs=[],palms=[],offset=(size-1)/2,roadCells=new Set(buildings.filter(b=>definition(b.typeId)?.isRoad).map(b=>`${b.x},${b.z}`));
    const plane=(x,z,w,d,color,y=.124)=>planes.push({x,y:this.ground+y,z,w,h:d,d:1,color,flat:true});
    const box=(x,y,z,w,h,d,color)=>boxes.push({x,y:this.ground+y,z,w,h,d,color});
    let lamps=0,crossings=0,plots=0,entrances=0,gardens=0,plazas=0,parking=0;
    for(const p of network.nodes){
      plane(p.x,p.z,.84,.84,'#45545b');
      for(const [dx,dz]of [[1,0],[0,1],[-1,0],[0,-1]]){
        const connected=network.byCell.has(`${p.x+dx},${p.z+dz}`);
        if(connected){plane(p.x+dx*.46,p.z+dz*.46,dx?.18:.84,dz?.18:.84,'#45545b');}
        else{
          box(p.x+dx*.46,.125,p.z+dz*.46,dx?.075:1,.06,dz?.075:1,'#c7c9bd');
          plane(p.x+dx*.43,p.z+dz*.43,dx?.12:.9,dz?.12:.9,'#cbd2c9',.158);
        }
      }
      const horizontal=p.neighbors.some(id=>network.byCell.get(id).x!==p.x),vertical=p.neighbors.some(id=>network.byCell.get(id).z!==p.z);
      if(p.neighbors.length<3){
        if(horizontal)plane(p.x,p.z,.22,.028,'#f4dfac',.127);
        if(vertical)plane(p.x,p.z,.028,.22,'#f4dfac',.128);
      }else{
        for(const id of p.neighbors){const q=network.byCell.get(id),dx=q.x-p.x,dz=q.z-p.z;
          for(let k=-2;k<=2;k++)plane(p.x+dx*.32+(dz?k*.11:0),p.z+dz*.32+(dx?k*.11:0),dx?.11:.065,dz?.11:.065,'#edf0e1',.129);
          crossings++;
        }
      }
      if((p.x+p.z*3)%4===0&&lamps<(this.quality==='low'?8:20)){
        const side=network.byCell.has(`${p.x+1},${p.z}`)?[0,-1]:[-1,0],x=p.x+side[0]*.43,z=p.z+side[1]*.43;
        box(x,.67,z,.035,1.05,.035,'#355665');box(x-side[0]*.065,1.21,z-side[1]*.065,.18,.045,.1,'#e5dfc2');
        box(x-side[0]*.065,1.183,z-side[1]*.065,.13,.012,.075,'#fff4be');lamps++;
      }
      if((p.x*3+p.z)%7===0&&palms.length<(this.quality==='low'?4:10)){
        const side=!network.byCell.has(`${p.x-1},${p.z}`)?[-1,0]:!network.byCell.has(`${p.x},${p.z+1}`)?[0,1]:null;
        if(side){const x=p.x+side[0]*.42,z=p.z+side[1]*.42;box(x,.18,z,.16,.12,.16,'#a9957d');palms.push({x:x-offset,y:this.ground+.21,z:z-offset,angle:(p.x+p.z)*1.3,scale:.17});}
      }
    }
    for(const b of buildings){
      const type=definition(b.typeId||b.type);if(!type||type.isRoad||type.requiresShore||type.category==='defense')continue;
      const [w,d]=type.footprint||[1,1],x=b.x+(w-1)/2,z=b.z+(d-1)/2;plots++;
      const green=type.visual?.kind==='park'||type.visual?.kind==='farm';
      const residential=type.id==='house',commercial=type.id==='shop';
      plane(x,z,w-.035,d-.035,green||residential?'#7f9d73':commercial?'#c5bdac':'#b6c0b5',.012);
      const front=streetFront(b,type,buildings,definition,roadCells,true),landscape=plotLandscape(b,type,front,this.quality);
      for(const [target,items]of [[planes,landscape.planes],[boxes,landscape.boxes],[shrubs,landscape.shrubs]])for(const piece of items)target.push({...piece,y:this.ground+piece.y});
      gardens+=landscape.gardens;plazas+=landscape.plazas;parking+=landscape.parking;
      // A narrow perimeter and planted corners leave every original model intact.
      if(w>=2&&d>=2&&type.category!=='sports'){
        for(const side of [-1,1]){
          plane(x+side*(w/2-.12),z,.12,d-.18,'#e3dfcb',.025);
          plane(x,z+side*(d/2-.12),w-.18,.12,'#e3dfcb',.026);
        }
        if(!landscape.gardens&&!landscape.plazas&&this.quality!=='low')for(const sx of [-1,1]){
          const px=x+sx*(w/2-.21),pz=z-d/2+.2;
          box(px,.08,pz,.21,.12,.26,'#a3977c');shrubs.push({x:px,y:this.ground+.19,z:pz,w:.21,h:.23,d:.24,color:'#507d5e'});
        }
        if(type.requiresRoad){
          const {angle,dx,dz,access}=front;if(!access)continue;
          const edge=(dx?w:d)/2;
          // An entrance apron meets the existing curb. Cross-joints give plazas
          // scale, while the original model keeps its own authored doorstep.
          plane(x+dx*(edge-.24),z+dz*(edge-.24),dx?.46:.58,dz?.46:.58,'#ded7c3',.12);entrances++;
          if(!residential&&!green)for(let joint=1;joint<Math.max(w,d)*3;joint++){
            const shift=-Math.max(w,d)/2+joint/3;
            if(Math.abs(shift)<(dx?d:w)/2-.14)plane(x+dx*(edge-.12)+(dz?shift:0),z+dz*(edge-.12)+(dx?shift:0),dx?.14:.015,dz?.14:.015,'#a8b4aa',.121);
          }
          if(residential&&palms.length<(this.quality==='low'?5:16))palms.push({x:x-dx*.68-dz*.72-offset,y:this.ground+.13,z:z-dz*.68+dx*.72-offset,angle,scale:.13});
        }
      }
    }
    const dummy=new T.Object3D();
    for(const [name,items,geometry]of [['paving',planes,this.planeGeometry],['furniture',boxes,this.boxGeometry],['planting',shrubs,this.shrubGeometry]]){
      if(!items.length)continue;const mesh=new T.InstancedMesh(geometry,this.material,items.length);mesh.name='City '+name;mesh.receiveShadow=true;mesh.castShadow=name!=='paving'&&this.quality!=='low';
      for(const [i,p]of items.entries()){dummy.position.set(p.x-offset,p.y,p.z-offset);dummy.rotation.set(p.flat?-Math.PI/2:0,0,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color(p.color));}
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.batches.push(mesh);this.scene.add(mesh);
    }
    const palm=this.palmModels.create('assets/models/palm-tree-512.glb',{height:3.8});
    if(palm&&palms.length){palm.updateMatrixWorld(true);const matrix=new T.Matrix4();palm.traverse(source=>{if(!source.isMesh)return;const mesh=new T.InstancedMesh(source.geometry,source.material,palms.length);mesh.name='Original Meshy street palms';mesh.castShadow=this.quality!=='low';mesh.receiveShadow=true;
      for(const [i,p]of palms.entries()){dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();matrix.multiplyMatrices(dummy.matrix,source.matrixWorld);mesh.setMatrixAt(i,matrix);}
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.palms.push(mesh);this.scene.add(mesh);
    });}
    this.stats={roads:network.nodes.length,plots,entrances,lamps,crossings,gardens,plazas,parking,streetTrees:this.palms.length?palms.length:0,draws:this.batches.length+this.palms.length};
  }
  clear(){for(const mesh of [...this.batches,...this.palms]){mesh.removeFromParent();mesh.dispose();}this.batches=[];this.palms=[];}
  metrics(){return {...this.stats,draws:this.batches.length+this.palms.length,disposed:this.disposed};}
  dispose(){if(this.disposed)return;this.clear();this.disposed=true;for(const resource of [this.planeGeometry,this.boxGeometry,this.shrubGeometry,this.material,this.texture])resource.dispose();}
}

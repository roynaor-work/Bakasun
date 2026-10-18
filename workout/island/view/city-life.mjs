import * as T from '../vendor/three.module.js';
import {GROUND,primitive,material} from './environment.mjs?v=g2j-20261019-1';
/** One instanced draw for the complete cosmetic path network. */
export function pathMesh(cells,size,config){
  const edges=cells.flatMap((p,i)=>p.neighbors.filter(j=>j>i).map(j=>[p,cells[j]])),mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),material(config.color),cells.length+edges.length),dummy=new T.Object3D();let at=0;
  function tile(x,z,w,d){dummy.position.set(x-(size-1)/2,GROUND+.018,z-(size-1)/2);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(w,d,1);dummy.updateMatrix();mesh.setMatrixAt(at++,dummy.matrix);}
  for(const p of cells)tile(p.x,p.z,config.width,config.width);
  for(const [a,b]of edges)tile((a.x+b.x)/2,(a.z+b.z)/2,a.x===b.x?config.width:1+config.width,a.z===b.z?config.width:1+config.width);
  mesh.receiveShadow=true;mesh.userData.ownedGeometry=true;return mesh;
}
export function beachDetails(land,size,config){
  for(let i=0;i<config.umbrellas;i++){
    const x=size/2+1.3,z=-size/3+i*1.7;
    primitive(land,'cylinder','#e4d4a9',[x,.65,z],[.07,1.2,.07]);
    primitive(land,'cone',['#df9271','#75aaa3','#ebcf85'][i%3],[x,1.35,z],[1.5,.42,1.5]);
    primitive(land,'box','#fcf4d9',[x+.4,.11,z+.35],[.35,.08,.9]);
  }
  for(let i=0;i<config.palms;i++){
    const x=size/2+.8,z=size/3+i*2;
    primitive(land,'cylinder','#ab875c',[x,1,z],[.18,2,.18]);
    for(let leaf=0;leaf<5;leaf++){const angle=leaf*Math.PI*2/5,p=primitive(land,'box','#5e9e72',[x+Math.sin(angle)*.45,2,z+Math.cos(angle)*.45],[.3,.07,1.3]);p.rotation.y=angle;p.rotation.x=.18;}
  }
}

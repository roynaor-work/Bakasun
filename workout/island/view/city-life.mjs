import * as T from '../vendor/three.module.js';
import {GROUND,primitive} from './environment.mjs?v=island-hoops-feel-20261027-1';
import {surfaceTexture} from '../presentation/surfaces.mjs?v=island-hoops-feel-20261027-1';
/** One instanced draw follows the engine's exact connected path network.
 * Shallow limestone paving changes neither routes nor walker positions. */
export function pathMesh(cells,size,config){
  const edges=cells.flatMap((p,i)=>p.neighbors.filter(j=>j>i).map(j=>[p,cells[j]]));
  const texture=surfaceTexture('sand',1.5);texture.anisotropy=2;
  const material=new T.MeshStandardMaterial({color:'#d9caaa',map:texture,roughness:.94});
  const geometry=new T.BoxGeometry(1,.035,1);
  const mesh=new T.InstancedMesh(geometry,material,cells.length+edges.length),dummy=new T.Object3D();let at=0;
  function tile(x,z,w,d){dummy.position.set(x-(size-1)/2,GROUND+.019,z-(size-1)/2);dummy.scale.set(w,1,d);dummy.updateMatrix();mesh.setMatrixAt(at++,dummy.matrix);}
  const width=config.width;
  for(const p of cells)tile(p.x,p.z,width,width);
  // Edges stop at the paving squares, avoiding coplanar overlaps.
  for(const [a,b]of edges)tile((a.x+b.x)/2,(a.z+b.z)/2,a.x===b.x?width:Math.max(.01,1-width),a.z===b.z?width:Math.max(.01,1-width));
  mesh.receiveShadow=true;mesh.userData.ownedGeometry=true;
  let disposed=false;mesh.userData.dispose=()=>{if(disposed)return;disposed=true;mesh.dispose();geometry.dispose();material.dispose();texture.dispose();};return mesh;
}
export function disposePath(mesh){mesh?.userData.dispose?.();}
/** Linen, timber and bronze furniture stays outside the buildable grid.
 * The environment owns the actual Meshy palms; no stand-in vegetation here. */
export function beachDetails(land,size,config){
  const count=Math.min(4,config.umbrellas||0),x=size/2+2.1,start=-size/3;
  if(!count)return;
  const length=(count-1)*1.72+1.8,center=start+(count-1)*.86;
  primitive(land,'box','#8b7560',[x+.25,.3,center],[2.35,.12,length]);
  for(let i=0;i<Math.ceil(length/.22);i++)primitive(land,'box',i%3===0?'#b49a7c':'#bda98c',[x+.25,.37,center-length/2+i*.22],[2.33,.045,.205]);
  for(const z of [start-.65,center,start+(count-1)*1.72+.65])for(const dx of [-.82,1.3])primitive(land,'cylinder','#776653',[x+dx,-.06,z],[.11,.83,.11]);
  for(let i=0;i<count;i++){
    const z=start+i*1.72;
    const pole=primitive(land,'cylinder','#76654e',[x,.96,z],[.045,1.28,.045]);pole.castShadow=false;
    const geometry=new T.ConeGeometry(.73,.22,16,1,true);
    const canopy=new T.Mesh(geometry,new T.MeshStandardMaterial({color:'#e9e1c8',roughness:1,side:T.DoubleSide}));
    canopy.position.set(x,1.64,z);canopy.castShadow=true;canopy.userData.ownedGeometry=true;canopy.userData.ownedMaterial=true;land.add(canopy);
    primitive(land,'sphere','#77624a',[x,1.77,z],[.08,.08,.08]);
    for(const side of [-1,1]){
      const cx=x+.79,cz=z+side*.38;
      primitive(land,'box','#796652',[cx,.41,cz],[.68,.07,.45]);
      primitive(land,'box','#e8dfc6',[cx,.46,cz],[.64,.04,.41]);
      const back=primitive(land,'box','#e7ddc3',[cx-.3,.57,cz],[.34,.055,.41]);back.rotation.z=-.56;
      for(const dz of [-.17,.17])for(const dx of [-.25,.25])primitive(land,'box','#796652',[cx+dx,.32,cz+dz],[.04,.2,.04]);
    }
    primitive(land,'cylinder','#8d7558',[x+.45,.53,z],[.29,.05,.29]);
    primitive(land,'cylinder','#8d7558',[x+.45,.4,z],[.035,.28,.035]);
  }
}

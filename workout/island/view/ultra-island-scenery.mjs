import * as T from '../vendor/three.module.js';
import {coastline,outcropGeometry,SEA_LEVEL} from './ultra-island-terrain.mjs?v=island-racing-20261024-1';

export function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

export function createCoastalDetails(size,ground){
  const group=new T.Group(),rand=seeded(83),dummy=new T.Object3D();
  const rockGeometry=new T.DodecahedronGeometry(.5,1),rockMaterial=new T.MeshStandardMaterial({color:'#c0bfa5',roughness:.98});
  const rocks=new T.InstancedMesh(rockGeometry,rockMaterial,54);rocks.castShadow=rocks.receiveShadow=true;rocks.userData.ownedGeometry=true;rocks.userData.ownedMaterial=true;
  for(let i=0;i<54;i++){
    const cluster=(Math.floor(i/3)*7)%18,a=cluster/18*Math.PI*2+(rand()-.5)*.13,r=coastline(a,size)+.1+(rand()-.5)*.9,h=.2+rand()*.7;
    dummy.position.set(Math.cos(a)*r,SEA_LEVEL+h*.26,Math.sin(a)*r);dummy.rotation.set(rand()*.6,rand()*6.28,rand()*.4);dummy.scale.set(.6+rand()*1.1,h,.5+rand()*.9);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);rocks.setColorAt(i,new T.Color().setHSL(.13,.08+rand()*.07,.47+rand()*.15));
  }
  group.add(rocks);
  const shrubGeometry=new T.IcosahedronGeometry(.5,1),shrubMaterial=new T.MeshStandardMaterial({color:'#ffffff',roughness:1});
  const shrubs=new T.InstancedMesh(shrubGeometry,shrubMaterial,66);shrubs.castShadow=shrubs.receiveShadow=true;shrubs.userData.ownedGeometry=true;shrubs.userData.ownedMaterial=true;
  for(let i=0;i<66;i++){
    const a=rand()*Math.PI*2,r=coastline(a,size,'grass')-.18-rand()*.25;
    dummy.position.set(Math.cos(a)*r,ground+.13,Math.sin(a)*r);dummy.rotation.set(0,rand()*6.28,0);dummy.scale.set(.4+rand()*.6,.2+rand()*.25,.4+rand()*.5);dummy.updateMatrix();shrubs.setMatrixAt(i,dummy.matrix);shrubs.setColorAt(i,new T.Color().setHSL(.22+rand()*.07,.25+rand()*.12,.24+rand()*.1));
  }
  group.add(shrubs);
  const palms=[];
  // Clustered groves leave the front beach and every buildable cell open.
  for(const [angle,count]of [[-.32,3],[-1.02,3],[-1.9,3],[-2.6,4],[2.65,3],[1.85,3],[.86,2]])for(let i=0;i<count;i++){
    const a=angle+(i-(count-1)*.5)*.11+(rand()-.5)*.05,r=coastline(a,size,'grass')-.15+rand()*.23;
    palms.push({x:Math.cos(a)*r,y:ground-.01,z:Math.sin(a)*r,angle:rand()*6.28,scale:.62+rand()*.28});
  }
  return {group,palms};
}

/** Authored harbor hamlets and a weathered citadel on natural coastal shelves. */
export function createNeighborScenery(scene,records,style,art){
  const {primitive:part,batchMeshes}=art,root=new T.Group(),neighbors=[],landmarks={};scene.add(root);
  const cliffMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1});
  for(const [index,record]of records.entries()){
    const kind=record.kind,island=new T.Group(),width=kind==='mountains'?6.4:4.4,depth=kind==='mountains'?4.6:3.5;root.add(island);
    const coast=new T.Mesh(outcropGeometry(width,depth,.14,index),cliffMaterial);coast.receiveShadow=true;coast.userData.ownedGeometry=true;island.add(coast);
    const architecture=new T.Group();island.add(architecture);
    if(kind==='castle'){
      part(architecture,'box','#b9b69b',[0,.65,0],[4.8,1.3,2.4]);
      for(const x of [-2.15,2.15])for(const z of [-1,1]){
        part(architecture,'cylinder','#a6aa97',[x,1.1,z],[1.05,2.5,1.05]);
        part(architecture,'cylinder','#d0c9ad',[x,2.37,z],[1.22,.18,1.22]);
        for(let k=0;k<5;k++){const a=k/5*Math.PI*2;part(architecture,'box','#c9c4a9',[x+Math.cos(a)*.46,2.57,z+Math.sin(a)*.46],[.22,.27,.22]);}
        part(architecture,'box','#49626a',[x,1.35,z+.52],[.2,.44,.025]);
      }
      part(architecture,'box','#e0d6b9',[0,1.9,-.25],[1.9,2.2,1.65]);part(architecture,'cone','#66858b',[0,3.7,-.25],[2.7,1.5,2.5]);
      part(architecture,'box','#526a6c',[0,.65,1.215],[.65,1.15,.03]);
      for(let x=-1.5;x<=1.5;x+=.5)part(architecture,'box','#d9ceb0',[x,1.43,1.14],[.28,.3,.25]);
      part(architecture,'cylinder','#917b57',[.12,4.6,-.25],[.045,1.4,.045]);part(architecture,'box','#dcac65',[.45,4.96,-.25],[.66,.37,.035]);
    }else if(kind==='fishing'){
      for(const [i,x]of [-2.1,-.65,1,2.15].entries()){
        const z=i%2?-.9:.25,h=1.1+(i%2)*.4;
        part(architecture,'box',['#e2d1a9','#d2ac88','#b7c4b0','#e4c4a2'][i],[x,h/2+.12,z],[1.2,h,1.1]);
        const roof=part(architecture,'cone',style?.roofColors?.[i%3]||'#a97d66',[x,h+.43,z],[1.85,.7,1.65]);roof.rotation.y=Math.PI/4;
        for(const sx of [-.27,.27])part(architecture,'box','#446b72',[x+sx,h*.62,z+.56],[.23,.35,.03]);
        part(architecture,'box','#d6c7a1',[x,1.2,z+.71],[1.3,.1,.35]);part(architecture,'cylinder','#89745b',[x+.32,h+.7,z-.2],[.13,.62,.13]);
      }
      part(architecture,'box','#ab936c',[.8,-.38,3.5],[2,.15,3.4]);
      for(let z=2;z<5.2;z+=.4)part(architecture,'box','#d1b889',[.8,-.29,z],[2,.035,.035]);
      for(const x of [-.15,1.75])for(const z of [2.1,4.8])part(architecture,'cylinder','#7d745c',[x,-.7,z],[.13,.85,.13]);
      // Slender moored sailboat, kept behind the game island.
      const hull=part(architecture,'sphere','#6b908e',[2.4,-.68,4.4],[.75,.36,1.7]);hull.rotation.y=.2;
      part(architecture,'cylinder','#ae9a73',[2.4,.1,4.4],[.04,1.9,.04]);const sail=part(architecture,'cone','#f1e6c6',[2.62,.43,4.4],[.82,1.4,.035]);sail.rotation.z=-.15;
    }else{
      for(const [x,z,w,h,c]of [[-3,.1,4.9,3.3,'#9bada0'],[.2,-.5,5.6,5.4,'#779493'],[3,.4,4.1,2.8,'#b0b7a2']]){
        const g=new T.DodecahedronGeometry(.5,1),p=g.attributes.position;
        for(let i=0;i<p.count;i++){const y=p.getY(i);p.setY(i,y*(y>0?1.35:1));}g.computeVertexNormals();
        const mesh=new T.Mesh(g,art.material(c));mesh.position.set(x,h*.32,z);mesh.scale.set(w,h,w*.8);mesh.rotation.y=x*.23;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.ownedGeometry=true;architecture.add(mesh);
      }
    }
    batchMeshes(architecture);island.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(island),radius=Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z)));
    neighbors.push({root:island,record,index,width,depth,radius});landmarks[record.id]=new T.Vector3();
  }
  let disposed=false;
  return {root,landmarks,neighbors,position(size){
    const placed=[],defaults=[[-18,.15,-3],[2,.15,-18],[-10,.15,-15]],margin=1.75;
    for(const n of neighbors){
      // Authored positions retain their bearing. Expansion moves scenery
      // outward, including its full underwater shelf and harbor furniture.
      const p=n.record.position||defaults[n.index%defaults.length],angle=Math.atan2(p[2],p[0]),ux=Math.cos(angle),uz=Math.sin(angle),clearance=n.radius+margin;
      let distance=Math.hypot(p[0],p[2]);
      for(let k=0;k<512;k++){
        const a=k/512*Math.PI*2,r=coastline(a,size)+1.25,along=r*Math.cos(a-angle),across=r*Math.sin(a-angle);
        if(Math.abs(across)<clearance)distance=Math.max(distance,along+Math.sqrt(clearance**2-across**2));
      }
      for(const other of placed){const along=other.x*ux+other.z*uz,across=other.x*uz-other.z*ux,gap=n.radius+other.radius+margin;if(Math.abs(across)<gap)distance=Math.max(distance,along+Math.sqrt(gap**2-across**2));}
      n.root.position.set(ux*distance,p[1],uz*distance);landmarks[n.record.id].copy(n.root.position);n.x=n.root.position.x;n.z=n.root.position.z;placed.push(n);
    }
  },dispose(){if(disposed)return;disposed=true;root.traverse(o=>{if(o.userData.ownedGeometry)o.geometry.dispose();});cliffMaterial.dispose();root.removeFromParent();}};
}

import * as T from '../vendor/three.module.js';
import { batchMeshes } from './batch.mjs?v=g6b-20261019-1';

export const GROUND = .34;
export const palette = { grass:'#91c75c', sand:'#f6d99a', sea:'#53cbd1', stone:'#dfb988', cream:'#fff4dc', teal:'#287a83', coral:'#ec9279' };
const geometries = new Map(), materials = new Map();
export function material(color, options = {}) {
  const key = `${color}:${JSON.stringify(options)}`;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness:.92, ...options }));
  return materials.get(key);
}
export function primitive(parent, kind, color, position=[0,0,0], scale=[1,1,1], options={}) {
  if (!geometries.has(kind)) geometries.set(kind, kind==='box' ? new T.BoxGeometry(1,1,1) : kind==='cone' ? new T.ConeGeometry(.5,1,6) : kind==='sphere' ? new T.IcosahedronGeometry(.5,1) : kind==='cylinder' ? new T.CylinderGeometry(.5,.5,1,12) : new T.CylinderGeometry(.5,.5,1,8));
  const mesh = new T.Mesh(geometries.get(kind), material(color,options));
  mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function roundedShape(width,depth,radius) {
  const x=-width/2,z=-depth/2,r=radius,s=new T.Shape();
  s.moveTo(x+r,z);s.lineTo(x+width-r,z);s.quadraticCurveTo(x+width,z,x+width,z+r);
  s.lineTo(x+width,z+depth-r);s.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);
  s.lineTo(x+r,z+depth);s.quadraticCurveTo(x,z+depth,x,z+depth-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;
}
function slab(parent,width,depth,height,y,color,radius=2) {
  const geom=new T.ExtrudeGeometry(roundedShape(width,depth,radius),{depth:height,bevelEnabled:false,curveSegments:5});
  geom.rotateX(-Math.PI/2);const mesh=new T.Mesh(geom,material(color));mesh.position.y=y;mesh.receiveShadow=true;mesh.castShadow=true;parent.add(mesh);return mesh;
}
function rng(seed) { return () => { seed = (seed*1664525+1013904223) >>> 0;return seed/4294967296; }; }
export function makeTree(parent,x,z,scale=1,tone=0) {
  const group=new T.Group();group.position.set(x,GROUND,z);group.scale.setScalar(scale);parent.add(group);
  primitive(group,'cylinder','#ad875b',[0,.46,0],[.17,.92,.17]);
  primitive(group,'sphere',['#4ba675','#67ae71','#87bd68'][tone%3],[0,1.2,0],[1.05,1.45,1.05]);return group;
}
function makeScenery(scene,neighbors=[],style) {
  const root=new T.Group();scene.add(root);
  const positions=[[-18,.2,-3],[2,.2,-18],[-10,-.4,-15]],landmarks={};
  for(const [index,record]of neighbors.entries()) {
    const kind=record.kind,p=new T.Vector3(...(record.position||positions[index%positions.length]));landmarks[record.id]=p;
    const island=new T.Group();island.position.copy(p);root.add(island);
    primitive(island,'cylinder','#d9c9a5',[0,-1.8,0],[kind==='mountains'?14:8,1.8,kind==='mountains'?9:6]);
    primitive(island,'cylinder',kind==='mountains'?'#bec6a7':'#a8ca84',[0,-.75,0],[kind==='mountains'?13.7:7.8,.5,kind==='mountains'?8.8:5.8]);
    if(kind==='castle') {
      for(const x of [-1.9,1.9]) { primitive(island,'cylinder',record.color||'#819ab4',[x,.6,0],[1.3,2.4,1.3]);primitive(island,'cone','#7286ad',[x,2.1,0],[1.7,1.1,1.7]); }
      primitive(island,'box','#a3b6c9',[0,.3,.2],[3,1.8,1.4]);primitive(island,'cone','#a6a1c7',[0,2,0],[2.3,2.4,2.3]);
      primitive(island,'box','#f1ca87',[0,3.6,0],[.8,.45,.08]);
    } else if(kind==='fishing') {
      for(const [x,c] of [[-1.7,'#ecb48b'],[.3,'#efc7b8'],[1.6,'#e99984']]) { primitive(island,'box',c,[x,0,0],[1.25,1.25,1.25]);primitive(island,'cone','#ce8d80',[x,.95,0],[1.8,.8,1.8]); }
      primitive(island,'box','#b59373',[0,-.5,3],[1,.22,3]);
      primitive(island,'box','#f9efd6',[1.1,.3,3.3],[.1,2.4,.1]);const sail=primitive(island,'cone','#fdf9e9',[1.1,.7,3.3],[1.2,1.7,.09]);sail.rotation.z=-.3;
    } else {
      for(const [x,h,c] of [[-3,3.2,'#a3abc9'],[0,4.5,'#8d9bbd'],[3,2.8,'#b9bad1']]) { primitive(island,'cone',c,[x,h/2-.4,0],[4,h,3.8]);primitive(island,'cone','#eef4e9',[x,h-.7,0],[1.1,1.2,1.05]); }
    }
    if(kind!=='mountains'&&style){
      for(let i=0;i<style.houses;i++){
        const x=-2.2+i*1.4,z=-1.5;
        primitive(island,'box','#efe0b9',[x,.2,z],[1,.9,.8]);primitive(island,'cone',style.roofColors[i%style.roofColors.length],[x,.95,z],[1.4,.7,1.2]);
        for(const side of [-1,1])primitive(island,'box','#a5cfcf',[x+side*.22,.3,z+.41],[.2,.23,.03]);
        primitive(island,'cylinder','#8e6b55',[x+.3,1.1,z-.15],[.13,.55,.13]);makeTree(island,x,-2.4,.45,i);
      }
    }
    batchMeshes(island);
  }
  // Slow clouds are intentionally just low polygon scenery, with no textures.
  const clouds=[];
  for(const [i,x,z,y] of [[0,-17,-13,10],[1,19,-28,10],[2,-4,-31,13],[3,27,5,12]]) {
    const cloud=new T.Group();cloud.position.set(x,y,z);root.add(cloud);
    for(let k=0;k<3;k++) primitive(cloud,'sphere','#f8fbeb',[(k-1)*1.7,k===1?.35:0,0],[2.8,1.25,1.6]);
    batchMeshes(cloud);clouds.push({root:cloud,x,phase:i});
  }
  return {root,landmarks,clouds};
}
export class Environment {
  constructor(scene,world={}) {
    this.scene=scene;this.size=0;this.root=new T.Group();scene.add(this.root);this.style=world.viewConfig;
    const sea=new T.Mesh(new T.PlaneGeometry(300,300),material(palette.sea,{roughness:.32}));sea.rotation.x=-Math.PI/2;sea.position.y=-1;sea.receiveShadow=true;scene.add(sea);this.sea=sea;
    const shimmer=new T.InstancedMesh(new T.PlaneGeometry(1,.07),new T.MeshBasicMaterial({color:'#c3f7eb',transparent:true,opacity:.36,depthWrite:false}),80);
    const rand=rng(21),dummy=new T.Object3D();
    for(let i=0;i<80;i++) { dummy.position.set((rand()-.5)*100,-.98,(rand()-.5)*80);dummy.rotation.x=-Math.PI/2;dummy.scale.set(.6+rand()*1.4,1,1);dummy.updateMatrix();shimmer.setMatrixAt(i,dummy.matrix); }
    scene.add(shimmer);this.shimmer=shimmer;Object.assign(this,makeScenery(scene,world.neighbors||[],this.style?.neighbors));
    const waveCount=this.style?.beach.waves||0;
    this.waves=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#fff7df',transparent:true,opacity:.55,depthWrite:false}),waveCount);scene.add(this.waves);
    this.smokeBases=(world.neighbors||[]).filter(n=>n.kind!=='mountains').map((n,i)=>n.position||[i===0?-18:2,.2,i===0?-3:-18]);
    this.smoke=new T.InstancedMesh(new T.IcosahedronGeometry(.3,0),new T.MeshBasicMaterial({color:'#f7f4df',transparent:true,opacity:.3,depthWrite:false}),this.smokeBases.length*3);scene.add(this.smoke);this.dummy=new T.Object3D();
  }
  rebuild(size) {
    if(this.size===size)return;this.size=size;
    if(this.land){this.scene.remove(this.land);this.land.traverse(o=>{if(o.geometry&&(o.userData.terrain||o.userData.ownedGeometry||o.isGridHelper))o.geometry.dispose();if(o.isGridHelper)o.material.dispose();});}
    const land=new T.Group();this.land=land;this.scene.add(land);
    for(const [w,d,h,y,c,r] of [[size+6.6,size+6.8,1.25,-1.7,'#be9e78',4],[size+6.2,size+6.4,.4,-.48,'#e9c792',3.8],[size+5.8,size+6,.32,-.1,palette.sand,3.6],[size+1.6,size+1.9,.22,.12,palette.grass,2.5]]) {
      const mesh=slab(land,w,d,h,y,c,r);mesh.userData.terrain=true;mesh.userData.ownedGeometry=true;
    }
    // A pale rim and darker grass patches give the island an authored diorama feel.
    const rand=rng(19);
    for(let i=0;i<28;i++) {
      const side=i%4,edge=size/2+1.4,x=side<2?(rand()-.5)*(size+2):(side===2?-edge:edge),z=side>=2?(rand()-.5)*(size+2):(side===0?-edge:edge);
      if(i%4!==0)makeTree(land,x,z,.65+rand()*.45,i);
      else primitive(land,'sphere','#dfc79a',[x,-.05,z],[.8,.5,.6]);
    }
    // A little beach on the front corner leaves the whole building grid open.
    for(let i=0;i<7;i++)primitive(land,'sphere','#eee4c2',[size/2+1+(i%2)*.4,-.03,-size/2+1+i*.48],[.5,.3,.45]);
    batchMeshes(land);
    const grid=new T.GridHelper(size,size,'#5d9e70','#aad58a');grid.position.set(0,GROUND+.006,0);grid.material.transparent=true;grid.material.opacity=.34;grid.material.depthWrite=false;land.add(grid);this.grid=grid;
  }
  tick(time) {
    for(const cloud of this.clouds)cloud.root.position.x=cloud.x+Math.sin(time*.035+cloud.phase)*.8;
    const dummy=this.dummy,beach=this.style?.beach;
    for(let i=0;i<this.waves.count;i++){const age=(time*beach.waveSpeed+i/this.waves.count)%1;dummy.position.set(this.size/2+3.4-age*.6,-.9,-this.size/2+i*1.6);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(.08,beach.waveWidth*(1-age*.3),1);dummy.updateMatrix();this.waves.setMatrixAt(i,dummy.matrix);}this.waves.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.smoke.count;i++){const age=(time*(this.style?.neighbors.smokeSpeed||.35)+i/3)%1,base=this.smokeBases[Math.floor(i/3)];dummy.position.set(base[0]+.3+age*.5,base[1]+1.5+age*1.7,base[2]-1.6);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.4+age);dummy.updateMatrix();this.smoke.setMatrixAt(i,dummy.matrix);}this.smoke.instanceMatrix.needsUpdate=true;
  }
  dispose() {this.sea.geometry.dispose();this.shimmer.geometry.dispose();for(const mesh of [this.waves,this.smoke]){mesh.geometry.dispose();mesh.material.dispose();}}
}

import * as T from "../../../vendor/three.module.js";
import {GLTFLoader} from "../../../vendor/GLTFLoader.js";
import {makeSeats} from './runtime/lod-policy.mjs';
export const {seats,placements,fitZ}=makeSeats();
export const environment = new T.Group();
function box(size,position,color) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color}));
  mesh.position.set(...position); environment.add(mesh); return mesh;
}
box([50,.12,60],[0,-.15,0],'#667c73');
box([15,.08,26],[0,-.04,0],'#55927d');
box([8.23,.04,18],[0,.03,0],'#527da0');
const linePoints = [];
function line(a,b) {linePoints.push(...a,...b);}
for(const x of [-4.115,4.115]) line([x,.065,-9],[x,.065,9]);
for(const z of [-9,9]) line([-4.115,.065,z],[4.115,.065,z]);
for(const z of [-5.3,5.3]) line([-4.115,.065,z],[4.115,.065,z]);
line([0,.065,-5.3],[0,.065,5.3]);
const lines = new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(linePoints,3));
environment.add(new T.LineSegments(lines,new T.LineBasicMaterial({color:'#e3e7d9'})));
box([10,.045,.045],[0,.91,0],'#e1e4d4');
box([.06,.91,.06],[-5,.455,0],'#2f4744');box([.06,.91,.06],[5,.455,0],'#2f4744');
for(let i=-24;i<=24;i++)box([.015,.85,.015],[i*.2,.43,0],'#3e5755');
export const ball = new T.Mesh(new T.IcosahedronGeometry(.13,1),new T.MeshBasicMaterial({color:'#eff58f'}));

const loader=new GLTFLoader(), existing=new URL("../../../assets/tennis-stadium-v1/",import.meta.url);
export async function loadStand() {
  const gltf = await loader.loadAsync(new URL('stand-10m.glb',existing).href);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(source=>{
    if(!source.isMesh)return;
    const mesh=new T.InstancedMesh(source.geometry,source.material,10),dummy=new T.Object3D(),m=new T.Matrix4();
    placements.forEach((p,i)=>{dummy.position.set(p.x,0,fitZ(p.z));dummy.rotation.y=p.yaw;dummy.updateMatrix();
      m.multiplyMatrices(dummy.matrix,source.matrixWorld);mesh.setMatrixAt(i,m);});
    mesh.frustumCulled=false;environment.add(mesh);
  });
}

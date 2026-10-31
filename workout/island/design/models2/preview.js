import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/DRACOLoader.js';

const assets={
 'basketball-arena':'אולם כדורסל','soccer-stadium':'אצטדיון כדורגל','ski-slope':'מדרון סקי · שני מקטעים',
 'fir-a':'אשוח רחב','fir-b':'אשוח גבוה','fir-c':'אשוח מלא','fir-sparse':'עצים · צפיפות נמוכה',
 'fir-medium':'עצים · צפיפות בינונית','fir-dense':'עצים · צפיפות גבוהה','rock-small':'סלע קטן',
 'rock':'סלע בינוני','rock-large':'סלע גדול','fence':'גדר בטיחות','slalom-gate':'שער סלאלום',
 'start-gate':'שער זינוק','finish-gate':'שער סיום','snow-sign':'שלט שלג','lift-tower':'מגדל מעלית'
};
const select=document.querySelector('select'), status=document.querySelector('#status');
for(const [value,label] of Object.entries(assets)) select.add(new Option(label,value));
const params=new URLSearchParams(location.search);
if(params.has('capture')) document.body.classList.add('capture');
const canvas=document.querySelector('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#e0e8ed');
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera();
scene.add(new THREE.HemisphereLight('#f6fcff','#657d83',1.25));
const sun=new THREE.DirectionalLight('#fff4dc',1.8);sun.position.set(-30,70,40);scene.add(sun);
const fill=new THREE.DirectionalLight('#bfdbe8',.7);fill.position.set(40,20,-30);scene.add(fill);
const draco=new DRACOLoader();draco.setDecoderPath('../../vendor/draco/');
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
let model,box,center=new THREE.Vector3(),extent=1,yaw=.62,pitch=.82,zoom=1,sequence=0;
const corners=[];
function frame(){
 if(!box)return;
 const width=canvas.clientWidth,height=canvas.clientHeight,aspect=width/height;
 renderer.setSize(width,height,false);
 const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
 camera.position.copy(center).addScaledVector(direction,extent*3);camera.lookAt(center);camera.updateMatrixWorld();
 let maxX=0,maxY=0;
 for(const point of corners){const p=point.clone().applyMatrix4(camera.matrixWorldInverse);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));}
 const half=Math.max(maxY,maxX/aspect)*1.10/zoom;
 camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
 camera.near=.01;camera.far=extent*8+100;camera.updateProjectionMatrix();
 renderer.render(scene,camera);
 window.previewMetrics={asset:select.value,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,width,height};
}
async function load(name){
 const ticket=++sequence;window.previewReady=false;status.textContent='טוען מודל…';select.value=name;
 const gltf=await loader.loadAsync(`${name}.glb`);
 if(ticket!==sequence)return;
 if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();});}
 model=gltf.scene;scene.add(model);box=new THREE.Box3().setFromObject(model);box.getCenter(center);
 extent=box.getSize(new THREE.Vector3()).length();corners.length=0;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z));
 yaw=name==='ski-slope'?.68:.62;pitch=name==='ski-slope'?.65:.82;zoom=1;
 frame();status.textContent=assets[name];window.previewReady=true;
}
select.addEventListener('change',()=>load(select.value).catch(fail));
document.querySelector('#reset').onclick=()=>{yaw=select.value==='ski-slope'?.68:.62;pitch=select.value==='ski-slope'?.65:.82;zoom=1;frame();};
const pointers=new Map();let distance;
canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);distance=undefined;};
canvas.onpointerup=canvas.onpointercancel=e=>{pointers.delete(e.pointerId);distance=undefined;};
canvas.onpointermove=e=>{
 if(!pointers.has(e.pointerId))return;
 const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);
 if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance)zoom=Math.max(.5,Math.min(4,zoom*d/distance));distance=d;}
 else {yaw-=(e.clientX-previous[0])*.006;pitch=Math.max(.12,Math.min(1.45,pitch+(e.clientY-previous[1])*.004));}
 frame();
};
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.5,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));frame();},{passive:false});
new ResizeObserver(frame).observe(canvas);
function fail(error){status.textContent='טעינת המודל נכשלה';window.previewError=String(error);console.error(error);}
load(Object.hasOwn(assets,params.get('asset'))?params.get('asset'):'basketball-arena').catch(fail);

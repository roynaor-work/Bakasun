import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.setScissorTest(true);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const loader=new GLTFLoader();
const manifest=await(await fetch('../manifest.json')).json();
const names={'rock-skerry':'סלע חופי','rock-stack':'עמוד בזלת','rock-split':'סלע מפוצל','rock-reef':'שונית נמוכה','float-can-buoy':'מצוף פח אדום','float-cone-buoy':'מצוף חרוט ירוק','float-driftwood':'עץ סחף קשור','float-supply-crate':'ארגז אספקה צף','lighthouse':'מגדלור על סלע'};
const order=['rock-skerry','rock-stack','rock-split','rock-reef','float-can-buoy','float-cone-buoy','float-driftwood','float-supply-crate','lighthouse'];
const views=[];
for(const id of order){
 const a=manifest.assets.find(a=>a.id===id),g=await loader.loadAsync('../'+a.path),scene=new THREE.Scene();
 scene.background=new THREE.Color(0x162e3b);scene.add(g.scene,new THREE.HemisphereLight(0xd4e1eb,0x344039,2.4));
 const sun=new THREE.DirectionalLight(0xffd6a5,3.2);sun.position.set(-9,16,10);scene.add(sun);
 const b=new THREE.Box3().setFromObject(g.scene),sphere=b.getBoundingSphere(new THREE.Sphere());
 const camera=new THREE.PerspectiveCamera(35,(innerWidth/3)/(innerHeight/3),.01,500);
 camera.position.copy(sphere.center).add(new THREE.Vector3(1,.48,1.8).normalize().multiplyScalar(sphere.radius*3.55));
 camera.lookAt(sphere.center);views.push({scene,camera});
 const label=document.createElement('div');label.className='label';
 const bText=document.createElement('b');bText.textContent=names[id];
 const span=document.createElement('span');span.textContent=a.triangles.toLocaleString('he-IL')+' משולשים · '+(a.bytes/1000).toFixed(1)+' ק״ב';
 label.append(bText,span);document.querySelector('#labels').append(label);
}
function render(){
 renderer.setSize(innerWidth,innerHeight);
 views.forEach(({scene,camera},i)=>{
  const w=innerWidth/3,h=innerHeight/3,x=(i%3)*w,y=innerHeight-(Math.floor(i/3)+1)*h;
  renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);
 });
}
render();addEventListener('resize',render);window.propsReady={count:views.length};

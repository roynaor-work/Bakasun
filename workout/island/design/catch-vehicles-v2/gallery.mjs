import * as T from './vendor/engine.mjs';
import {loadVehicle} from './vehicle-controller.mjs';
const manifest=await(await fetch('./manifest.json')).json();
const query=new URLSearchParams(location.search);
const chosen=manifest.assets.find(a=>a.id===query.get('states'));
const specs=chosen?['intact','damaged','crushed'].map(state=>({meta:chosen,state})):manifest.assets.map(meta=>({meta,state:'intact'}));
const names={intact:'שלם',damaged:'פגוע',crushed:'מעוך'};
if(chosen){document.body.classList.add('states');document.querySelector('#heading').textContent=chosen.label+' · שלושה מצבי נזק';document.querySelector('#foot').textContent='אותו קובץ · רשתות משותפות · חלקים נפרדים · צורת נזק שונה בכל מצב';}
const renderer=new T.WebGLRenderer({canvas:document.querySelector('#canvas'),antialias:true,alpha:true});
renderer.setPixelRatio(1);
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.2;
const pmrem=new T.PMREMGenerator(renderer);
const environmentScene=new T.RoomEnvironment();
const target=pmrem.fromScene(environmentScene,.04);
environmentScene.dispose();pmrem.dispose();
const views=[];
for(const [i,{meta,state}] of specs.entries()){
 const card=document.createElement('article');card.className='card';
 card.innerHTML=`<div class="view"></div><div class="label"><div><h2><span class="dot" style="background:${chosen?{intact:'#7ed7bb',damaged:'#edb66b',crushed:'#eb777a'}[state]:meta.colors[0]}"></span>${chosen?names[state]:meta.label}</h2><p>${meta.triangles[state].toLocaleString('he-IL')} משולשים · ${(meta.bytes/1000).toFixed(0)} KB</p></div><span class="index">${String(i+1).padStart(2,'0')}</span></div>`;
 document.querySelector('#cards').append(card);
 const vehicle=await loadVehicle(meta,new URL('./',import.meta.url),{effects:false});
 vehicle.setDamage(state);vehicle.update(.24);
 const scene=new T.Scene();scene.environment=target.texture;
 scene.add(vehicle.root,new T.HemisphereLight(0xdaebff,0x263442,2));
 const light=new T.DirectionalLight(0xffead3,3);light.position.set(-3,7,5);scene.add(light);
 const rim=new T.DirectionalLight(0x8bc6ff,2.1);rim.position.set(5,3,-5);scene.add(rim);
 const box=new T.Box3().setFromObject(vehicle.scenes.get('intact').scene,true);
 const center=box.getCenter(new T.Vector3());
 const camera=new T.PerspectiveCamera(36,1,.1,50);
 camera.position.copy(center).add(new T.Vector3(5,3.3,6.5));camera.lookAt(center);
 views.push({scene,camera,vehicle,element:card.querySelector('.view'),box,center});
}
function render(){
 const w=document.documentElement.clientWidth,h=document.documentElement.scrollHeight;
 renderer.setSize(w,h,false);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
 const v=new T.Vector3(),inverse=new T.Quaternion();
 for(const item of views){
  const rect=item.element.getBoundingClientRect();
  const x=rect.left,y=h-(rect.top+scrollY+rect.height);
  item.camera.aspect=rect.width/rect.height;
  item.camera.updateMatrixWorld();inverse.copy(item.camera.quaternion).invert();
  let width=0,height=0;
  for(let i=0;i<8;i++){
   v.set(i&1?item.box.max.x:item.box.min.x,i&2?item.box.max.y:item.box.min.y,i&4?item.box.max.z:item.box.min.z).sub(item.center).applyQuaternion(inverse);
   width=Math.max(width,Math.abs(v.x));height=Math.max(height,Math.abs(v.y));
  }
  const distance=Math.max(height,width/item.camera.aspect)/Math.tan(T.MathUtils.degToRad(18))*1.23;
  const direction=new T.Vector3(5,3.3,6.5).normalize();
  item.camera.position.copy(item.center).addScaledVector(direction,distance);item.camera.lookAt(item.center);item.camera.updateProjectionMatrix();
  renderer.setViewport(x,y,rect.width,rect.height);renderer.setScissor(x,y,rect.width,rect.height);renderer.render(item.scene,item.camera);
 }
}
render();window.addEventListener('resize',render);window.galleryReady=true;

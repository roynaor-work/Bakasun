import * as THREE from 'three';
import {GLTFLoader} from '../island/vendor/GLTFLoader.js';

const CATS=[['residential','מגורים'],['commerce','מסחר'],['industry','תעשייה'],['services','שירותים'],['nature','טבע'],['vehicles','רכבים'],['roads','דרכים']];
const $=id=>document.getElementById(id);
const cv=$('c'),status=$('status'),info=$('info'),progress=$('bar'),top=$('top');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9fd0ee);scene.fog=new THREE.Fog(0x9fd0ee,200,900);
const cam=new THREE.PerspectiveCamera(45,1,.5,2000);
scene.add(new THREE.HemisphereLight(0xffffff,0x5a6b4a,1.5));
const sun=new THREE.DirectionalLight(0xfff1d6,2.2);sun.position.set(60,120,80);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),new THREE.MeshStandardMaterial({color:0x7fae6a,roughness:1}));
ground.rotation.x=-Math.PI/2;scene.add(ground);
const grid=new THREE.GridHelper(1000,100,0x5c8a4a,0x6c9a5a);grid.position.y=.02;scene.add(grid);
const group=new THREE.Group();scene.add(group);

let catalog=null,mode='city',cat='residential',items=[],cache=new Map();
const view={yaw:.6,pitch:.55,dist:60,tx:0,tz:0};
let frameTarget={cx:0,cz:0,size:60};

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
addEventListener('resize',resize);resize();

function setCam(){const cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
  cam.position.set(view.tx+Math.sin(view.yaw)*cp*view.dist,sp*view.dist,view.tz+Math.cos(view.yaw)*cp*view.dist);
  cam.lookAt(view.tx,view.dist*.08,view.tz)}

function frame(){view.tx=frameTarget.cx;view.tz=frameTarget.cz;view.dist=Math.max(20,frameTarget.size*1.15);setCam()}
$('reset').onclick=frame;

// pointer: one finger rotate, two fingers pinch, tap to pick
const ptrs=new Map();let moved=0,pinch0=0,dist0=0;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);dist0=view.dist}});
cv.addEventListener('pointermove',e=>{const p=ptrs.get(e.pointerId);if(!p)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);
  if(ptrs.size===1){view.yaw-=dx*.006;view.pitch=Math.min(1.4,Math.max(.12,view.pitch+dy*.005))}
  else if(ptrs.size===2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0)view.dist=Math.min(900,Math.max(8,dist0*pinch0/d))}
  setCam()});
const up=e=>{const was=ptrs.size;ptrs.delete(e.pointerId);if(was===1&&moved<8)pick(e.clientX,e.clientY)};
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',e=>ptrs.delete(e.pointerId));
cv.addEventListener('wheel',e=>{e.preventDefault();view.dist=Math.min(900,Math.max(8,view.dist*(1+Math.sign(e.deltaY)*.1)));setCam()},{passive:false});

const ray=new THREE.Raycaster();
function pick(x,y){const v=new THREE.Vector2(x/innerWidth*2-1,-(y/innerHeight)*2+1);ray.setFromCamera(v,cam);
  const hit=ray.intersectObjects(group.children,true)[0];
  if(!hit){info.style.display='none';return}
  let o=hit.object;while(o&&!o.userData.m)o=o.parent;
  if(o)showInfo(o.userData.m)}
function showInfo(m){info.style.display='block';
  info.innerHTML=`<b>${m.id}. ${m.name_he}</b><br><span class="en">${m.name}</span><br>קטגוריה: ${m.category_he}<br>משולשים: ${m.triangles.toLocaleString('he-IL')} · משקל: ${(m.bytes/1e6).toFixed(1)}MB<br>גודל מוצע בעיר (הצלע הארוכה): ${m.suggested_longest_side_m} מ׳ (הצעה, לאישור)`}

const loader=new GLTFLoader();
function load(m){if(cache.has(m.id))return cache.get(m.id);
  const p=new Promise((res,rej)=>loader.load('models/'+m.path,g=>res(g.scene),undefined,rej));cache.set(m.id,p);return p}

function normalise(root,m){const b=new THREE.Box3().setFromObject(root);const s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
  const long=Math.max(s.x,s.z,s.y);const target=mode==='city'?m.suggested_longest_side_m:12;
  const k=target/long;const holder=new THREE.Group();root.position.set(-c.x,-b.min.y,-c.z);holder.add(root);holder.scale.setScalar(k);
  holder.userData.m=m;holder.userData.footprint=Math.max(s.x,s.z)*k;return holder}

let token=0;
async function show(){const my=++token;group.clear();info.style.display='none';
  const list=cat==='all'?catalog.models:catalog.models.filter(m=>m.category===cat);
  status.textContent='טוען '+list.length+' דגמים…';progress.style.width='0';let done=0;const objs=[];
  await Promise.all(list.map(async m=>{try{const root=(await load(m)).clone(true);if(my!==token)return;objs.push(normalise(root,m))}catch(e){console.error('failed',m.path,e);window.__failed=(window.__failed||[]).concat(m.id)}
    done++;progress.style.width=(done/list.length*100)+'%';if(my===token)status.textContent=`נטענו ${done} מתוך ${list.length}`}));
  if(my!==token)return;
  objs.sort((a,b)=>a.userData.m.id-b.userData.m.id);
  // lay out in rows
  const gap=mode==='city'?6:4;const cols=Math.max(3,Math.ceil(Math.sqrt(objs.length*1.4)));let x=0,z=0,rowH=0,rowW=0,maxX=0;const rows=[[]];
  const placed=[];
  for(const o of objs){const w=o.userData.footprint+gap;if(rows[rows.length-1].length>=cols){rows.push([])}rows[rows.length-1].push(o)}
  let zc=0;for(const r of rows){let xc=0,rh=0;for(const o of r){const w=o.userData.footprint+gap;o.position.set(xc+w/2,0,zc);xc+=w;rh=Math.max(rh,o.userData.footprint)}
    const off=xc/2;for(const o of r){o.position.x-=off;group.add(o)}maxX=Math.max(maxX,xc);zc+=rh+gap*2}
  group.position.z=-zc/2;
  frameTarget={cx:0,cz:0,size:Math.max(maxX,zc)};frame();
  status.textContent=`מוצגים ${objs.length} דגמים. גרור לסיבוב, צבוט לזום, הקש על דגם לפרטים`;window.__shown=objs.length;
  setTimeout(()=>{if(my===token)status.textContent=''},5000)}

function buildBar(){const mk=(k,t)=>{const b=document.createElement('button');b.textContent=t;b.setAttribute('aria-pressed',k===cat);b.dataset.k=k;b.onclick=()=>{cat=k;[...top.children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.k===k));if(k==='all'&&!confirm('טעינת כל 58 הדגמים היא כ-137MB. להמשיך?'))return;show()};top.appendChild(b)};
  CATS.forEach(([k,t])=>mk(k,t));mk('all','הכל (137MB)')}
function setMode(m){mode=m;$('m-city').setAttribute('aria-pressed',m==='city');$('m-even').setAttribute('aria-pressed',m==='even');show()}
$('m-city').onclick=()=>setMode('city');$('m-even').onclick=()=>setMode('even');

(async()=>{catalog=await (await fetch('catalog.json')).json();buildBar();await show();
  renderer.setAnimationLoop(()=>renderer.render(scene,cam));window.__ready=true})();

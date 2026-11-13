// Original CC0-1.0. Uses the repository's unchanged Three.js r160 (MIT).
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const instances = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const types = {building:'בניין',window:'חלון',target:'מטרה',door:'דלת',fire_anchor:'מוקד אש',
  state:'מצב חלון',effect:'להבה',architecture:'מבנה',entry_point:'נקודת כניסה',look_point:'נקודת מבט',mesh:'גאומטריה',group:'קבוצה'};
let active = null;

function isInteractive(object) {
  return ['window','target','door','fire_anchor'].includes(object.userData.kind);
}
function triangles(root, visibleOnly = false) {
  let result = 0;
  function visit(object, shown) {
    shown = shown && object.visible && object.scale.x !== 0 && object.scale.y !== 0 && object.scale.z !== 0;
    if (object.isMesh && (!visibleOnly || shown)) result += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const child of object.children) visit(child, shown);
  }
  visit(root, true);
  return result;
}
function currentState(object) {
  if (object.userData.previewState) return object.userData.previewState;
  if (object.userData.kind === 'window') return object.getObjectByName(object.userData.states.burnt).scale.x ? 'burnt' : 'intact';
  if (object.userData.kind === 'fire_anchor') return object.getObjectByName(object.userData.effectNode).scale.x ? 'on' : 'off';
  if (object.userData.kind === 'target') return object.userData.previewState ?? 'upright';
  if (object.userData.kind === 'door') return object.userData.previewState ?? 'closed';
  return object.userData.state ?? '—';
}
function fail(error) {
  $('load-status').textContent = `הטעינה נכשלה: ${error.message}. יש לפתוח דרך שרת HTTP מתיקיית המאגר.`;
  $('load-status').classList.add('error');
  console.error(error);
}

class BuildingView {
  constructor(meta) {
    this.meta = meta;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eceee1');
    this.scene.add(new THREE.HemisphereLight(0xfff8e8,0x899984,2.1));
    const sun = new THREE.DirectionalLight(0xffe2b4,2.9);
    sun.position.set(-8,18,14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-15,right:15,top:24,bottom:-15,near:.5,far:65});
    sun.shadow.bias = -.001;
    sun.shadow.normalBias = .035;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe1eff1,1.0);
    fill.position.set(10,9,-9);this.scene.add(fill);
    this.camera = new THREE.PerspectiveCamera(33,1,.06,180);
    this.renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.card = document.createElement('article');
    this.card.className = 'model-card';this.card.dataset.model = meta.id;
    this.card.innerHTML = `<div class="card-top"><h2>${meta.label}</h2><span class="number">0${meta.floors} / קומות</span></div>
      <div class="viewport"><div class="view-tools"><button class="front">מבט חזית</button><button class="exit" hidden>יציאה מהלובי</button></div></div>
      <div class="card-bottom"><div class="counts"><strong class="stored">…</strong><span>משולשים ארוזים / 8,000</span></div>
      <div class="model-info"><span>${meta.frontWindows} חלונות · <span class="visible-count">…</span> נראים</span><a href="${meta.path}" download>הורדת GLB ↓</a></div><div class="budget"><span style="width:${meta.trianglesAllStates / 80}%"></span></div></div>`;
    $('gallery').append(this.card);
    this.viewport = this.card.querySelector('.viewport');
    this.viewport.prepend(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label',`${meta.label}, ${meta.floors} קומות. גרירה לסיבוב; מקשי חצים לסיבוב וקירוב. הפעלת רכיבים זמינה גם בלוח הכפתורים.`);
    this.card.querySelector('.front').onclick = () => {this.front();select(this);};
    this.card.querySelector('.exit').onclick = () => this.exit();
    this.card.addEventListener('pointerdown', () => {if(this.root) select(this);});
    this.pending = new Map();
    this.pointer = null;
    this.inside = false;
    this.dirty = true;
    new ResizeObserver(() => this.resize()).observe(this.viewport);
    this.bindPointer();
    this.resize();
  }
  async load() {
    this.gltf = await new GLTFLoader().loadAsync(new URL(this.meta.path,import.meta.url).href);
    this.root = this.gltf.scene;
    this.scene.add(this.root);
    this.root.traverse(object => {if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    this.mixer = new THREE.AnimationMixer(this.root);
    this.interactive = [];
    this.root.traverse(object => {if(isInteractive(object))this.interactive.push(object);});
    this.total = triangles(this.root);
    if(this.total !== this.meta.trianglesAllStates || this.total > 8000) throw Error(`תקציב משולשים שגוי: ${this.meta.id}`);
    this.card.querySelector('.stored').textContent = this.total.toLocaleString('en');
    const max = this.meta.boundsDefault.max, min = this.meta.boundsDefault.min;
    this.height = max[1];
    this.focus = new THREE.Vector3(0,this.height*.46,.4);
    this.framingBounds = new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
    // Leave room for roof flames and the landing area in front of the balconies.
    this.framingBounds.max.y += 1.65;
    this.framingBounds.max.z += 2.0;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(130,130),new THREE.MeshStandardMaterial({color:'#eceee1',roughness:1}));
    ground.rotation.x = -Math.PI/2;ground.position.y=-.012;ground.receiveShadow=true;this.scene.add(ground);
    // Practical lobby light is a preview light; no lights or cameras in the GLB.
    const entry = this.root.getObjectByName('entry_spawn');
    const lobbyLight = new THREE.PointLight(0xffd5a0,17,8,2);
    lobbyLight.position.copy(entry.position).add(new THREE.Vector3(0,.55,-1.0));this.scene.add(lobbyLight);
    this.front();
    this.updateCounts();
  }
  resize() {
    const w = this.viewport.clientWidth,h = this.viewport.clientHeight;
    this.renderer.setSize(w,h,false);
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
    if(this.root&&!this.inside)this.orbit();
    this.dirty=true;
  }
  front() {
    this.inside=false;this.card.querySelector('.exit').hidden=true;
    this.yaw=.43;this.elevation=.27;this.zoom=1;
    this.orbit();
  }
  orbit() {
    if(!this.focus || this.inside)return;
    const direction = new THREE.Vector3(Math.sin(this.yaw)*Math.cos(this.elevation),
      Math.sin(this.elevation),Math.cos(this.yaw)*Math.cos(this.elevation));
    const right = new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    const up = new THREE.Vector3().crossVectors(direction,right);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    let fit = 1;
    for(const x of [this.framingBounds.min.x,this.framingBounds.max.x])
      for(const y of [this.framingBounds.min.y,this.framingBounds.max.y])
        for(const z of [this.framingBounds.min.z,this.framingBounds.max.z]){
          const point=new THREE.Vector3(x,y,z).sub(this.focus);
          fit=Math.max(fit,point.dot(direction)+Math.abs(point.dot(right))/(tan*this.camera.aspect)*1.08,
            point.dot(direction)+Math.abs(point.dot(up))/tan*1.08);
        }
    this.camera.position.copy(direction).multiplyScalar(fit*this.zoom).add(this.focus);
    this.camera.lookAt(this.focus);this.dirty=true;
  }
  bindPointer() {
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{
      this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:0};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      const p=this.pointer;if(!p||p.id!==event.pointerId||!this.root||this.inside)return;
      p.moved+=Math.abs(event.clientX-p.lastX)+Math.abs(event.clientY-p.lastY);
      this.yaw-=(event.clientX-p.lastX)*.009;
      this.elevation=THREE.MathUtils.clamp(this.elevation+(event.clientY-p.lastY)*.006,-.08,1.0);
      p.lastX=event.clientX;p.lastY=event.clientY;this.orbit();
    });
    canvas.addEventListener('pointerup',event=>{
      const p=this.pointer;this.pointer=null;
      if(p&&p.id===event.pointerId&&p.moved<7&&this.root&&!this.inside)this.pick(event);
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointercancel',()=>{this.pointer=null;});
    canvas.addEventListener('wheel',event=>{
      if(!this.root||this.inside)return;event.preventDefault();
      this.zoom=THREE.MathUtils.clamp(this.zoom*Math.exp(event.deltaY*.001),.55,1.7);this.orbit();
    },{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(!this.root)return;
      if(event.key==='Escape'){this.exit();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='ArrowLeft')this.yaw-=.13;
      if(event.key==='ArrowRight')this.yaw+=.13;
      if(event.key==='ArrowUp')this.elevation=Math.min(1,this.elevation+.08);
      if(event.key==='ArrowDown')this.elevation=Math.max(-.08,this.elevation-.08);
      if(event.key==='+')this.zoom=Math.max(.55,this.zoom*.9);
      if(event.key==='-')this.zoom=Math.min(1.7,this.zoom/ .9);
      this.orbit();
    });
  }
  pick(event) {
    this.root.updateMatrixWorld(true);
    const rect=this.renderer.domElement.getBoundingClientRect();
    const mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);
    const hits=ray.intersectObject(this.root,true).filter(hit=>{
      let object=hit.object;
      while(object){if(!object.visible||object.scale.lengthSq()===0)return false;object=object.parent;}
      return true;
    });
    for(const hit of hits){
      let object=hit.object;
      while(object&&object!==this.root){
        if(isInteractive(object)){this.activate(object);return;}
        object=object.parent;
      }
      // A static wall or balcony occludes targets behind it.
      if(hit.object.userData.kind==='architecture')break;
    }
  }
  play(object,state,instant=false) {
    const name=object.userData.clips?.[state];
    const clip=this.gltf.animations.find(c=>c.name===name);
    if(!clip)throw Error(`חסרה אנימציה: ${name}`);
    const previous=this.pending.get(object.name);
    if(previous)previous.action.stop();
    // Stop the previous action for this root before binding the new state.
    const action=this.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    object.userData.previewState=state;
    this.pending.set(object.name,{action,state});
    const discrete=['window','fire_anchor'].includes(object.userData.kind);
    if(instant||discrete||reducedMotion.matches){action.time=clip.duration;this.mixer.update(0);}else this.mixer.update(.0001);
    this.dirty=true;
    this.updateCounts();
  }
  setWindow(object,state,instant=false) {this.play(object,state,instant);}
  activate(object) {
    select(this);
    $('node-select').value=object.name;
    if(object.userData.kind==='window')this.play(object,currentState(object)==='intact'?'burnt':'intact');
    if(object.userData.kind==='fire_anchor')this.play(object,currentState(object)==='on'?'off':'on');
    if(object.userData.kind==='target')this.play(object,currentState(object)==='upright'?'fallen':'upright');
    if(object.userData.kind==='door'){this.enter();return;}
    $('action-status').textContent=`${object.name} → ${object.userData.previewState}`;
  }
  enter() {
    if(this.inside)return;
    const door=this.root.getObjectByName('door_main');this.play(door,'open',true);
    this.inside=true;this.card.querySelector('.exit').hidden=false;
    const entry=this.root.getObjectByName('entry_spawn').getWorldPosition(new THREE.Vector3());
    const look=this.root.getObjectByName('entry_focus').getWorldPosition(new THREE.Vector3());
    this.camera.position.copy(entry);this.camera.lookAt(look);this.dirty=true;
    $('action-status').textContent=`${this.meta.label}: בתוך הלובי. לחצו ״יציאה מהלובי״ לחזרה.`;
    refreshInventory();
  }
  exit() {
    if(!this.root)return;this.front();
    this.play(this.root.getObjectByName('door_main'),'closed',true);
    if(active===this)$('action-status').textContent='חזרתם לחזית הבניין.';
  }
  reset() {
    this.mixer.stopAllAction();this.pending.clear();
    for(const object of this.interactive){
      delete object.userData.previewState;
      if(object.userData.kind==='window'){
        object.getObjectByName(object.userData.states.intact).scale.setScalar(1);
        object.getObjectByName(object.userData.states.burnt).scale.setScalar(0);
      }else if(object.userData.kind==='target'){
        const state=object.userData.states.upright;
        object.position.fromArray(state.translation);object.quaternion.fromArray(state.rotation);
      }else if(object.userData.kind==='door')object.quaternion.identity();
      else if(object.userData.kind==='fire_anchor')object.getObjectByName(object.userData.effectNode).scale.setScalar(0);
    }
    this.front();this.updateCounts();refreshInventory();
  }
  updateCounts() {
    if(!this.root)return;
    this.card.querySelector('.visible-count').textContent=triangles(this.root,true).toLocaleString('en');
  }
  update(dt) {
    if(!this.root)return;
    let moving=false;
    for(const {action} of this.pending.values())if(action.isRunning())moving=true;
    if(moving){this.mixer.update(dt);this.dirty=true;this.updateCounts();if(active===this)refreshInventoryStates();}
    if(this.dirty){this.root.updateMatrixWorld(true);this.renderer.render(this.scene,this.camera);this.dirty=false;}
  }
}

function select(view) {
  if(!view.root)return;
  const changed=active!==view;
  active=view;$('model-select').value=view.meta.id;
  for(const instance of instances)instance.card.classList.toggle('active',instance===view);
  if(changed){
    $('node-select').replaceChildren(...view.interactive.map(object=>new Option(`${object.name} · ${types[object.userData.kind]}`,object.name)));
    refreshInventory();
  }
  refreshInventoryStates();
}
function refreshInventory() {
  if(!active)return;
  const fragment=document.createDocumentFragment();
  let shown=0;
  for(const meta of active.meta.nodes){
    const object=active.root.getObjectByName(meta.name);
    if(!object)throw Error(`צומת חסר: ${meta.name}`);
    if($('interactive-only').checked&&!isInteractive(object))continue;
    const row=document.createElement('tr');
    const name=document.createElement('td');
    if(isInteractive(object)){
      const button=document.createElement('button');button.textContent=meta.name;
      button.onclick=()=>active.activate(object);name.append(button);
    }else name.textContent=meta.name;
    const type=document.createElement('td');type.textContent=types[meta.kind]??meta.kind;
    const state=document.createElement('td');state.dataset.stateNode=meta.name;state.dir='ltr';state.textContent=currentState(object);
    row.append(name,type,state);fragment.append(row);shown++;
  }
  $('node-list').replaceChildren(fragment);
  $('node-count').textContent=`${shown} / ${active.meta.nodes.length}`;
  refreshInventoryStates();
}
function refreshInventoryStates() {
  if(!active)return;
  for(const cell of $('node-list').querySelectorAll('[data-state-node]'))cell.textContent=currentState(active.root.getObjectByName(cell.dataset.stateNode));
  const anyFire=active.interactive.some(object=>object.userData.kind==='fire_anchor'&&currentState(object)==='on');
  $('fire-toggle').setAttribute('aria-pressed',String(anyFire));
  $('fire-toggle').textContent=anyFire?'כיבוי הגג':'הדלקת הגג';
}

const ready=(async()=>{
  const response=await fetch(new URL('manifest.json',import.meta.url));
  if(!response.ok)throw Error(`manifest.json: ${response.status}`);
  const manifest=await response.json();
  for(const meta of manifest.models)instances.push(new BuildingView(meta));
  await Promise.all(instances.map(view=>view.load()));
  $('model-select').replaceChildren(...instances.map(view=>new Option(`${view.meta.label} · ${view.meta.floors} קומות`,view.meta.id)));
  $('inspector').hidden=false;select(instances.find(view=>view.meta.floors===3));
  $('load-status').textContent='כל שלושת הבניינים נטענו. לחצו על חלון, מטרה, אש או דלת כדי להפעיל אותם.';
  $('model-select').onchange=()=>select(instances.find(view=>view.meta.id===$('model-select').value));
  $('interactive-only').onchange=refreshInventory;
  $('activate-node').onclick=()=>active.activate(active.root.getObjectByName($('node-select').value));
  $('burn-all').onclick=()=>{for(const object of active.interactive)if(object.userData.kind==='window')active.play(object,'burnt');};
  $('repair-all').onclick=()=>{for(const object of active.interactive)if(object.userData.kind==='window')active.play(object,'intact');};
  $('fire-toggle').onclick=()=>{
    const state=active.interactive.some(object=>object.userData.kind==='fire_anchor'&&currentState(object)==='on')?'off':'on';
    for(const object of active.interactive)if(object.userData.kind==='fire_anchor')active.play(object,state);
  };
  $('fall-all').onclick=()=>{for(const object of active.interactive)if(object.userData.kind==='target')active.play(object,'fallen');};
  $('enter').onclick=()=>active.enter();
  $('reset').onclick=()=>{active.reset();$('action-status').textContent='הבניין אופס למצב ההתחלתי.';};
  return manifest;
})();
ready.catch(fail);
const clock=new THREE.Clock();
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),.25);
  for(const view of instances)view.update(dt);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{clock.getDelta();});
window.fireBuildingPreview={ready,instances,triangles,select,get active(){return active;}};

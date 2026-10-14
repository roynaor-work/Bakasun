import * as T from '../../../codex-lab/kid-full/vendor/three.module.js';
import { Environment, GROUND, primitive, material } from './environment.mjs';
import { Avatar, Citizens } from './avatar.mjs';

// View contains geometry and pointer interpretation only. Placement rules,
// resources, saves and all strings are owned by the engine and the UI.
export class IslandView {
  constructor({canvas,data={},onCell=()=>{},onHover=()=>{},onSelect=()=>{},onReady=()=>{},onError=()=>{}}) {
    Object.assign(this,{canvas,data,onCell,onHover,onSelect,onReady,onError});this.state=null;this.size=16;this.groups=new Map();this.pointers=new Map();this.route=[];this.disposed=false;
    this.angle=.69;this.elevation=.76;this.zoom=1;this.target=new T.Vector3(0,.4,0);this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.plane=new T.Plane(new T.Vector3(0,1,0),-GROUND);this.hit=new T.Vector3();
    this.scene=new T.Scene();this.scene.background=new T.Color('#c5edf0');this.scene.fog=new T.Fog('#c5edf0',65,150);
    try {this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});}catch(error){onError('error.webgl');return;}
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.camera=new T.OrthographicCamera(-14,14,14,-14,.1,180);
    this.scene.add(new T.HemisphereLight('#fcf5da','#8eaead',2.5));
    const sun=new T.DirectionalLight('#fff0d1',3);sun.position.set(-17,30,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.camera.near=1;sun.shadow.camera.far=85;sun.shadow.bias=-.00035;sun.shadow.normalBias=.07;this.scene.add(sun);this.sun=sun;
    this.environment=new Environment(this.scene);this.environment.rebuild(this.size);this.buildingRoot=new T.Group();this.scene.add(this.buildingRoot);
    this.avatar=new Avatar(this.scene);this.citizens=new Citizens(this.scene,30);
    this.avatar.load(data.avatar||{}).then(()=>{if(!this.disposed){this.avatar.holder.position.set(0,GROUND,0);this.onReady(this);}}).catch(()=>this.onError('error.avatar'));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.handlers={};this.bindEvents();this.resize();this.last=performance.now();this.samples=[];this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
  }
  definition(id) {const b=this.data.buildings;return b instanceof Map?b.get(id):Array.isArray(b)?b.find(r=>r.id===id):b?.[id]||this.data.registry?.buildings?.get(id);}
  worldPosition(x,z,footprint=[1,1]) {return new T.Vector3(x+(footprint[0]-1)/2-(this.size-1)/2,GROUND,z+(footprint[1]-1)/2-(this.size-1)/2);}
  makeBuilding(record,level=1) {
    const group=new T.Group(),[w,d]=record.footprint||[1,1];
    const visual=record.visual||{},height=visual.height||.8;
    primitive(group,'box',visual.color||'#e6bca0',[0,height/2,0],[w*.8,height,d*.8]);return group;
  }
  setBuildingFactory(factory) {this.buildingFactory=factory;if(this.state)this.setWorld(this.state,true);}
  setWorld(state,force=false) {
    this.state=state;if(!this.renderer)return;
    const previousSize=this.size;this.size=Number(state.world?.size||state.worldSize||16);this.environment.rebuild(this.size);
    const buildings=state.buildings||state.world?.buildings||[],ids=new Set(buildings.map(b=>b.id));
    for(const [id,item] of this.groups)if(!ids.has(id)||force){this.buildingRoot.remove(item.group);this.groups.delete(id);}
    for(const b of buildings) {
      const record=this.definition(b.typeId||b.type);if(!record)continue;
      let item=this.groups.get(b.id);
      if(!item||item.level!==b.level||item.typeId!==(b.typeId||b.type)) {
        if(item)this.buildingRoot.remove(item.group);
        const group=this.buildingFactory?this.buildingFactory(record,b.level||1):this.makeBuilding(record,b.level);
        group.userData.buildingId=b.id;group.traverse(o=>{if(o.isMesh)o.userData.buildingId=b.id;});this.buildingRoot.add(group);item={group,level:b.level,typeId:b.typeId||b.type};this.groups.set(b.id,item);
      }
      item.group.position.copy(this.worldPosition(b.x,b.z,record.footprint));
    }
    if(previousSize!==this.size)this.resize();
    this.setAvatar(state.avatar||state.character||{});this.refreshWalkers(buildings);
  }
  refreshWalkers(buildings) {
    const road=buildings.filter(b=>this.definition(b.typeId||b.type)?.visual?.kind==='road');
    const points=road.map(b=>this.worldPosition(b.x,b.z));
    if(!points.length)for(const b of buildings){const r=this.definition(b.typeId||b.type);if(r){const p=this.worldPosition(b.x,b.z,r.footprint);p.z+=(r.footprint?.[1]||1)/2+.22;points.push(p);}}
    this.walkPoints=points;this.citizens.setPoints(points,Math.min(30,Math.max(0,buildings.length*2)));
    if(points.length&&!this.avatarPositioned){this.avatar.holder.position.copy(points[Math.floor(points.length/2)]);this.avatarPositioned=true;}
  }
  setAvatar(record) {if(record)this.avatar?.setRecord(record);}
  setGhost(record,x,z,valid=true) {
    if(!this.renderer||!record)return;this.clearGhost();
    const [w,d]=record.footprint||[1,1],color=valid?'#39c88c':'#f06b77';
    const group=this.buildingFactory?this.buildingFactory(record,1):this.makeBuilding(record);
    group.traverse(o=>{if(o.isMesh){o.material=new T.MeshBasicMaterial({color,transparent:true,opacity:.42,depthWrite:false});o.castShadow=false;o.receiveShadow=false;}});
    const floor=new T.Mesh(new T.PlaneGeometry(w-.04,d-.04),new T.MeshBasicMaterial({color,transparent:true,opacity:.48,side:T.DoubleSide,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=.025;group.add(floor);
    const border=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w,.055,d)),new T.LineBasicMaterial({color,linewidth:2}));border.position.y=.035;group.add(border);
    group.position.copy(this.worldPosition(x,z,[w,d]));this.scene.add(group);this.ghost=group;this.canvas.dataset.ghost=valid?'valid':'invalid';
  }
  clearGhost() {if(this.ghost){this.scene.remove(this.ghost);this.ghost.traverse(o=>{if(o.material&&o.material.transparent)o.material.dispose();});this.ghost=null;}delete this.canvas.dataset.ghost;}
  showRadius(record,instance) {
    if(this.radius){this.scene.remove(this.radius);this.radius.geometry.dispose();this.radius.material.dispose();this.radius=null;}
    if(!record||!instance||!record.radius)return;
    this.radius=new T.Mesh(new T.RingGeometry(Math.max(0,record.radius-.05),record.radius+.05,64),new T.MeshBasicMaterial({color:'#fff7c8',transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));
    this.radius.rotation.x=-Math.PI/2;this.radius.position.copy(this.worldPosition(instance.x,instance.z,record.footprint));this.radius.position.y+=.05;this.scene.add(this.radius);
  }
  resize() {
    if(!this.renderer)return;const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),aspect=width/height;
    this.renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));this.renderer.setSize(width,height,false);
    const span=Math.max(this.size*.73, this.size*.72/aspect)/this.zoom;
    this.camera.left=-span*aspect;this.camera.right=span*aspect;this.camera.top=span;this.camera.bottom=-span;this.camera.updateProjectionMatrix();this.updateCamera();
  }
  updateCamera() {if(!this.camera)return;const r=45;this.camera.position.set(this.target.x+Math.sin(this.angle)*Math.cos(this.elevation)*r,this.target.y+Math.sin(this.elevation)*r,this.target.z+Math.cos(this.angle)*Math.cos(this.elevation)*r);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  home() {this.angle=.69;this.elevation=.76;this.zoom=1;this.target.set(0,.4,0);this.resize();}
  screenForCell(x,z) {const p=this.worldPosition(x,z);p.project(this.camera);const r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  screenForLandmark(id) {const p=this.environment?.landmarks[id]?.clone();if(!p)return null;p.project(this.camera);const r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1};}
  cellAt(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);this.ray.setFromCamera(this.pointer,this.camera);
    if(!this.ray.ray.intersectPlane(this.plane,this.hit))return null;
    const x=Math.floor(this.hit.x+this.size/2),z=Math.floor(this.hit.z+this.size/2);return x>=0&&z>=0&&x<this.size&&z<this.size?{x,z}:null;
  }
  bindEvents() {
    const listen=(type,handler,options)=>{this.handlers[type]=handler;this.canvas.addEventListener(type,handler,options);};this.canvas.style.touchAction='none';
    listen('pointerdown',e=>{this.canvas.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});this.dragged=false;if(this.pointers.size===2){const [a,b]=[...this.pointers.values()];this.pinch=Math.hypot(a.x-b.x,a.y-b.y);this.dragged=true;}});
    listen('pointermove',e=>{
      const p=this.pointers.get(e.pointerId);if(!p){const cell=this.cellAt(e.clientX,e.clientY);if(cell)this.onHover(cell);return;}
      const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
      if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(this.pinch)this.zoom=T.MathUtils.clamp(this.zoom*distance/this.pinch,.68,2.8);this.pinch=distance;this.dragged=true;this.resize();}
      else if(Math.hypot(p.x-p.startX,p.y-p.startY)>7||this.dragged){this.dragged=true;this.angle-=dx*.008;this.elevation=T.MathUtils.clamp(this.elevation+dy*.004,.42,1.2);this.updateCamera();}
    });
    listen('pointerup',e=>{
      const p=this.pointers.get(e.pointerId),tap=p&&!this.dragged&&this.pointers.size===1;this.pointers.delete(e.pointerId);this.pinch=0;if(!tap)return;
      const cell=this.cellAt(e.clientX,e.clientY);if(!cell)return;
      const buildings=this.state?.buildings||[];
      const selected=buildings.find(b=>{const f=this.definition(b.typeId||b.type)?.footprint||[1,1];return cell.x>=b.x&&cell.z>=b.z&&cell.x<b.x+f[0]&&cell.z<b.z+f[1];});
      if(selected)this.onSelect(selected.id);else this.onCell(cell);
    });
    listen('pointercancel',e=>{this.pointers.delete(e.pointerId);this.dragged=true;});
    listen('wheel',e=>{e.preventDefault();this.zoom=T.MathUtils.clamp(this.zoom*Math.exp(-e.deltaY*.001),.68,2.8);this.resize();},{passive:false});
    listen('webglcontextlost',e=>{e.preventDefault();this.onError('error.webgl');});
  }
  animate(now) {
    if(this.disposed)return;const delta=Math.min((now-this.last)/1000,.05),time=now/1000;this.last=now;
    if(!document.hidden){
      this.environment.tick(time);this.citizens.tick(delta,time);
      if(!this.route.length&&this.walkPoints?.length>1&&now>(this.nextWalk||0)){const p=this.walkPoints[Math.floor((now/3500)%this.walkPoints.length)];this.route.push({x:p.x,z:p.z});this.nextWalk=now+4000;}
      this.avatar.tick(delta,time,this.route);this.renderer.render(this.scene,this.camera);this.samples.push(now);while(this.samples[0]<now-1000)this.samples.shift();
    }
    this.frame=requestAnimationFrame(this.animate);
  }
  metrics() {return {triangles:this.renderer?.info.render.triangles||0,calls:this.renderer?.info.render.calls||0,fps:this.samples?.length||0,citizens:this.citizens?.people.length||0,pixelRatio:this.renderer?.getPixelRatio()||0,avatarLoaded:!!this.avatar?.root,renderer:this.renderer?.getContext().getParameter(this.renderer.getContext().VERSION)};}
  dispose() {this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver?.disconnect();for(const [type,handler]of Object.entries(this.handlers||{}))this.canvas.removeEventListener(type,handler);this.avatar?.dispose();this.environment?.dispose();this.renderer?.dispose();}
}

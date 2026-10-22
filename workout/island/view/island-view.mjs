import * as T from '../vendor/three.module.js';
import { Environment, GROUND, primitive, material } from './environment.mjs?v=naval-art-20261022-1';
import { Avatar, Citizens } from './avatar.mjs?v=naval-art-20261022-1';
import { createBuilding, disposeBuilding } from './buildings.mjs?v=naval-art-20261022-1';
import { levelValue } from '../engine/metrics.mjs?v=naval-art-20261022-1';
import { LocalModels } from './local-models.mjs?v=naval-art-20261022-1';
import {MeshyPilot} from './meshy-pilot.mjs?v=naval-art-20261022-1';
import {cityPaths} from '../engine/paths.mjs?v=naval-art-20261022-1';
import {shoreDirection} from '../engine/placement-help.mjs?v=naval-art-20261022-1';
import {pathMesh,beachDetails} from './city-life.mjs?v=naval-art-20261022-1';
import {batchMeshes} from './batch.mjs?v=naval-art-20261022-1';

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
    this.quality='high';this.started=performance.now();this.qualityCheckedAt=this.started;
    this.camera=new T.OrthographicCamera(-14,14,14,-14,.1,180);
    this.scene.add(new T.HemisphereLight('#fcf5da','#8eaead',2.5));
    const sun=new T.DirectionalLight('#fff0d1',3);sun.position.set(-17,30,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.camera.near=1;sun.shadow.camera.far=85;sun.shadow.bias=-.00035;sun.shadow.normalBias=.07;this.scene.add(sun);this.sun=sun;
    this.environment=new Environment(this.scene,{...data.world,viewConfig:data.config.cityView});this.environment.rebuild(this.size);this.decorateBeach();this.buildingRoot=new T.Group();this.scene.add(this.buildingRoot);
    this.models=new LocalModels();
    const records=data.buildings instanceof Map?[...data.buildings.values()]:data.buildings||[];
    this.modelsReady=Promise.all(records.flatMap(record=>[record.model,...(record.levels||[]).map(level=>level.model)]).filter(Boolean).map(spec=>this.models.load(spec))).then(()=>{if(!this.disposed&&this.state)this.setWorld(this.state,true);});
    this.avatar=new Avatar(this.scene);this.citizens=new Citizens(this.scene,data.config.cityView.citizens.max);
    this.pilot=new MeshyPilot(this.scene,data.config.cityView.meshyPilot);
    this.pilotReady=this.pilot.load().then(()=>{if(!this.disposed&&this.state){this.pathSignature=null;this.refreshWalkers(this.state.buildings);}});
    this.avatar.load({}).then(()=>{if(!this.disposed){if(!this.avatarPositioned)this.avatar.holder.position.set(0,GROUND,0);this.onReady(this);}}).catch(()=>this.onError('error.avatar'));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.handlers={};this.bindEvents();this.resize();this.last=performance.now();this.samples=[];this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
  }
  definition(id) {const registered=this.data.registry?.buildings?.get(id);if(registered)return registered;const b=this.data.buildings;return b instanceof Map?b.get(id):Array.isArray(b)?b.find(r=>r.id===id):b?.[id];}
  decorateBeach(){const group=new T.Group();beachDetails(group,this.size,this.data.config.cityView.beach);batchMeshes(group);this.environment.land.add(group);}
  worldPosition(x,z,footprint=[1,1]) {return new T.Vector3(x+(footprint[0]-1)/2-(this.size-1)/2,GROUND,z+(footprint[1]-1)/2-(this.size-1)/2);}
  makeBuilding(record,level=1) {return createBuilding(record,level,this.models);}
  setBuildingFactory(factory) {this.buildingFactory=factory;if(this.state)this.setWorld(this.state,true);}
  setWorld(state,force=false) {
    this.state=state;if(!this.renderer)return;
    const previousSize=this.size;this.size=Number(state.world?.size||state.worldSize||16);this.environment.rebuild(this.size);if(previousSize!==this.size)this.decorateBeach();
    const buildings=state.buildings||state.world?.buildings||[],ids=new Set(buildings.map(b=>b.id));
    for(const [id,item] of this.groups)if(!ids.has(id)||force){this.buildingRoot.remove(item.group);disposeBuilding(item.group);this.groups.delete(id);}
    for(const b of buildings) {
      const record=this.definition(b.typeId||b.type);if(!record)continue;
      let item=this.groups.get(b.id);
      if(!item||item.level!==b.level||item.typeId!==(b.typeId||b.type)) {
        if(item){this.buildingRoot.remove(item.group);disposeBuilding(item.group);}
        const group=this.buildingFactory?this.buildingFactory(record,b.level||1):this.makeBuilding(record,b.level);
        group.userData.buildingId=b.id;group.traverse(o=>{if(o.isMesh)o.userData.buildingId=b.id;});this.buildingRoot.add(group);item={group,level:b.level,typeId:b.typeId||b.type};this.groups.set(b.id,item);
      }
      item.group.position.copy(this.worldPosition(b.x,b.z,record.footprint));
      if(record.requiresShore){const outward=shoreDirection(state,record,b.x,b.z);item.group.rotation.y=outward?Math.atan2(outward.x,outward.z):0;}
      const repairing=state.events?.repairs?.[b.id]>state.updatedAt;
      if(repairing&&!item.repairMarker){
        const style=this.data.config.events.repairMarker;
        item.repairMarker=new T.Mesh(new T.ConeGeometry(style.radius,style.height,style.sides),new T.MeshBasicMaterial({color:style.color}));
        item.repairMarker.position.y=(record.levels?.[b.level-1]?.visual?.height??record.visual?.height??0)+style.offset;item.repairMarker.rotation.z=Math.PI;
        item.repairMarker.userData.ownedGeometry=true;item.repairMarker.userData.ownedMaterial=true;item.group.add(item.repairMarker);
      }
      if(item.repairMarker)item.repairMarker.visible=Boolean(repairing);
    }
    if(previousSize!==this.size)this.resize();
    this.setAvatar(state.avatar||state.character||{});this.refreshWalkers(buildings);
  }
  refreshWalkers(buildings) {
    const signature=JSON.stringify([this.size,this.quality,buildings.map(b=>[b.id,b.x,b.z,b.level])]);if(signature===this.pathSignature)return;this.pathSignature=signature;
    const paths=this.paths=cityPaths(this.state,this.data.registry),settings=this.data.config.cityView;
    if(this.pathsMesh){this.scene.remove(this.pathsMesh);this.pathsMesh.geometry.dispose();}this.pathsMesh=pathMesh(paths.cells,this.size,settings.paths);this.scene.add(this.pathsMesh);
    const points=paths.cells.map(p=>Object.assign(this.worldPosition(p.x,p.z),{neighbors:p.neighbors}));
    this.pilot.sync(buildings,paths,id=>this.definition(id),(x,z)=>this.worldPosition(x,z));
    if(this.data.featureFlags?.citizens===false&&this.pilot.walker)this.pilot.walker.root.visible=false;
    const count=Math.min(this.quality==='low'?settings.citizens.lowMax:settings.citizens.max,settings.citizens.minimum+buildings.filter(b=>!this.definition(b.typeId)?.isRoad).length*settings.citizens.perBuilding);
    this.walkPoints=points;this.citizens.setPoints(points,this.data.featureFlags?.citizens===false?0:count-(this.pilot.walker?.root.visible?1:0));
    if(points.length&&!this.avatarPositioned){this.avatar.holder.position.copy(points[Math.floor(points.length/2)]);this.avatarPositioned=true;}
  }
  setAvatar(record) {const key=JSON.stringify(record);if(record&&this.avatarKey!==key){this.avatarKey=key;this.avatar?.setRecord(record);}}
  attachAvatarPreview(canvas) {
    this.detachAvatarPreview();if(!canvas)return;
    try {
      const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor('#f9efda',0);
      const scene=new T.Scene(),holder=new T.Group();holder.rotation.y=-.3;scene.add(holder);scene.add(new T.HemisphereLight('#fff5da','#92bcb2',2));
      const camera=new T.OrthographicCamera(-1.5,1.5,1.4,-1.4,.1,20);camera.position.set(0,1.25,6);camera.lookAt(0,1.25,0);this.preview={canvas,renderer,scene,holder,camera};
      const resize=()=>{const rect=canvas.getBoundingClientRect(),aspect=Math.max(rect.width,1)/Math.max(rect.height,1);renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);camera.left=-1.4*aspect;camera.right=1.4*aspect;camera.top=1.4;camera.bottom=-1.4;camera.updateProjectionMatrix();};
      this.preview.resizeObserver=new ResizeObserver(resize);this.preview.resizeObserver.observe(canvas);resize();
    }catch{this.preview=null;this.onError('error.webgl');}
  }
  detachAvatarPreview() {if(this.preview){this.preview.resizeObserver?.disconnect();this.preview.renderer.dispose();this.preview=null;}}
  renderAvatarPreview() {
    const preview=this.preview,root=this.avatar?.root;if(!preview||!root)return;
    // Render sequentially: the real rig belongs to the preview only during its
    // draw and is restored before the next world frame. No skinned clone or
    // second animation mixer is required, and clothing stays exactly in sync.
    const parent=root.parent;preview.holder.add(root);preview.renderer.render(preview.scene,preview.camera);parent?.add(root);
  }
  setGhost(record,x,z,valid=true) {
    if(!this.renderer||!record)return;
    const level=record.previewLevel||1;
    const key=[record.id,level,x,z,valid].join(':');if(this.ghostKey===key)return;this.clearGhost();this.ghostKey=key;
    const [w,d]=record.footprint||[1,1],color=valid?'#39c88c':'#f06b77';
    const group=this.buildingFactory?this.buildingFactory(record,level):this.makeBuilding(record,level);
    group.traverse(o=>{if(o.isMesh||o.isLineSegments){if(o.userData.ownedMaterial)o.material.dispose();o.material=o.isLineSegments?new T.LineBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false}):new T.MeshBasicMaterial({color,transparent:true,opacity:.42,depthWrite:false});o.userData.ownedMaterial=false;o.userData.ghostMaterial=true;o.castShadow=false;o.receiveShadow=false;}});
    const floor=new T.Mesh(new T.PlaneGeometry(w-.04,d-.04),new T.MeshBasicMaterial({color,transparent:true,opacity:.48,side:T.DoubleSide,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=.025;floor.userData.ownedGeometry=true;floor.userData.ghostMaterial=true;group.add(floor);
    const box=new T.BoxGeometry(w,.055,d),border=new T.LineSegments(new T.EdgesGeometry(box),new T.LineBasicMaterial({color,linewidth:2}));box.dispose();border.position.y=.035;border.userData.ownedGeometry=true;border.userData.ghostMaterial=true;group.add(border);
    group.position.copy(this.worldPosition(x,z,[w,d]));this.scene.add(group);this.ghost=group;this.canvas.dataset.ghost=valid?'valid':'invalid';
    if(record.requiresShore){const outward=shoreDirection(this.state,record,x,z);group.rotation.y=outward?Math.atan2(outward.x,outward.z):0;}
  }
  clearGhost() {if(this.ghost){this.scene.remove(this.ghost);this.ghost.traverse(o=>{if(o.userData.ghostMaterial)o.material.dispose();});disposeBuilding(this.ghost);this.ghost=null;}this.ghostKey=null;delete this.canvas.dataset.ghost;}
  showRadius(record,instance) {
    if(this.radius){this.scene.remove(this.radius);this.radius.geometry.dispose();this.radius.material.dispose();this.radius=null;}
    if(!record||!instance||!record.radius)return;
    this.radius=new T.Mesh(new T.RingGeometry(Math.max(0,record.radius-.05),record.radius+.05,64),new T.MeshBasicMaterial({color:'#fff7c8',transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));
    this.radius.rotation.x=-Math.PI/2;this.radius.position.copy(this.worldPosition(instance.x,instance.z,record.footprint));this.radius.position.y+=.05;this.scene.add(this.radius);
  }
  resize() {
    if(!this.renderer)return;const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),aspect=width/height;
    this.renderer.setPixelRatio(Math.min(this.quality==='low'?1:1.5,window.devicePixelRatio||1));this.renderer.setSize(width,height,false);
    const compact=width>height&&height<=500;
    const c=this.data.config.cityView.camera;
    if(this.compact!==compact){this.elevation=compact?c.landscapeElevation:c.elevation;this.compact=compact;}
    const span=Math.max(this.size*(compact?c.landscapeSpanRatio:c.spanRatio),this.size*c.aspectRatio/aspect)/this.zoom,offset=compact?span*aspect*c.panelOffset:0;
    this.camera.left=-span*aspect+offset;this.camera.right=span*aspect+offset;this.camera.top=span;this.camera.bottom=-span;this.camera.updateProjectionMatrix();this.updateCamera();
  }
  updateCamera() {if(!this.camera)return;const r=45;this.camera.position.set(this.target.x+Math.sin(this.angle)*Math.cos(this.elevation)*r,this.target.y+Math.sin(this.elevation)*r,this.target.z+Math.cos(this.angle)*Math.cos(this.elevation)*r);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  home() {const c=this.data.config.cityView.camera;this.angle=c.angle;this.compact=undefined;this.zoom=1;this.target.set(0,.4,0);this.resize();}
  focusCell(x,z) {this.target.copy(this.worldPosition(x,z));this.updateCamera();}
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
      // A one-finger placement drag moves the ghost. Two fingers still control the camera.
      if(this.ghost&&this.pointers.size===1){const cell=this.cellAt(e.clientX,e.clientY);if(cell)this.onHover(cell);return;}
      if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(this.pinch)this.zoom=T.MathUtils.clamp(this.zoom*distance/this.pinch,.68,2.8);this.pinch=distance;this.dragged=true;this.resize();}
      else if(Math.hypot(p.x-p.startX,p.y-p.startY)>7||this.dragged){this.dragged=true;this.angle-=dx*.008;this.elevation=T.MathUtils.clamp(this.elevation+dy*.004,.42,1.2);this.updateCamera();}
    });
    listen('pointerup',e=>{
      const p=this.pointers.get(e.pointerId),tap=p&&!this.dragged&&this.pointers.size===1;this.pointers.delete(e.pointerId);this.pinch=0;if(!tap)return;
      const cell=this.cellAt(e.clientX,e.clientY);
      // During placement the ground grid is the target, even behind a roof.
      if(this.ghost&&cell){this.onCell(cell);return;}
      const picked=this.ray.intersectObjects([...this.groups.values()].map(item=>item.group),true).find(hit=>hit.object.userData.buildingId);
      if(picked){this.onSelect(picked.object.userData.buildingId);return;}if(!cell)return;
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
    if(!document.hidden&&!this.paused){
      this.environment.tick(time);this.citizens.tick(delta,time);this.pilot.tick(delta);
      if(!this.route.length&&this.walkPoints?.length>1&&now>(this.nextWalk||0)){const here=this.avatar.holder.position;let nearest=0;for(let i=0;i<this.walkPoints.length;i++)if(here.distanceTo(this.walkPoints[i])<here.distanceTo(this.walkPoints[nearest]))nearest=i;const p=this.walkPoints[nearest],next=this.walkPoints[p.neighbors?.[Math.floor(time)%p.neighbors.length]??nearest];this.route.push({x:p.x,z:p.z},{x:next.x,z:next.z});this.nextWalk=now+1500;}
      this.avatar.tick(delta,time,this.preview?[]:this.route);
      if(!this.preview||now-(this.lastWorldRender||0)>500){this.renderer.render(this.scene,this.camera);this.lastWorldRender=now;}
      this.renderAvatarPreview();this.samples.push(now);while(this.samples[0]<now-1000)this.samples.shift();
      if(!this.preview&&now-this.started>5000&&now-this.qualityCheckedAt>2000){
        this.qualityCheckedAt=now;
        if(this.quality==='high'&&this.samples.length<27){this.quality='low';this.renderer.shadowMap.enabled=false;this.resize();this.refreshWalkers(this.state.buildings);}
      }
    }
    this.frame=requestAnimationFrame(this.animate);
  }
  metrics() {return {triangles:this.renderer?.info.render.triangles||0,calls:this.renderer?.info.render.calls||0,fps:this.samples?.length||0,citizens:this.citizens?.people.length||0,paths:this.paths?.routes.map(r=>({id:r.id,connected:r.connected})),pixelRatio:this.renderer?.getPixelRatio()||0,quality:this.quality,avatarLoaded:!!this.avatar?.root,models:this.models?.metrics(),pilot:this.pilot?.metrics(),renderer:this.renderer?.getContext().getParameter(this.renderer.getContext().VERSION)};}
  dispose() {this.disposed=true;cancelAnimationFrame(this.frame);this.detachAvatarPreview();this.clearGhost();this.pathsMesh?.geometry.dispose();for(const item of this.groups.values())disposeBuilding(item.group);this.pilot?.dispose();this.models?.dispose();this.resizeObserver?.disconnect();for(const [type,handler]of Object.entries(this.handlers||{}))this.canvas.removeEventListener(type,handler);this.avatar?.dispose();this.environment?.dispose();this.renderer?.dispose();}
}

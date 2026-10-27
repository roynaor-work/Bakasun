import * as T from '../vendor/three.module.js';
import {CityDepthView} from './city-depth.mjs?v=island-city-finish-20261027-1';
import { Environment, GROUND, primitive, material } from './environment.mjs?v=island-city-finish-20261027-1';
import { Avatar } from './avatar.mjs?v=island-city-finish-20261027-1';
import { Citizens } from './city-citizens.mjs?v=island-city-finish-20261027-1';
import {cityLighting} from './city-lighting.mjs?v=island-city-finish-20261027-1';
import {CityOcclusion} from './city-occlusion.mjs?v=island-city-finish-20261027-1';
import { createBuilding, disposeBuilding } from './buildings.mjs?v=island-city-finish-20261027-1';
import { levelValue } from '../engine/metrics.mjs?v=island-city-finish-20261027-1';
import { LocalModels } from './local-models.mjs?v=island-city-finish-20261027-1';
import {MeshyPilot} from './meshy-pilot.mjs?v=island-city-finish-20261027-1';
import {cityPaths} from '../engine/paths.mjs?v=island-city-finish-20261027-1';
import {shoreDirection} from '../engine/placement-help.mjs?v=island-city-finish-20261027-1';
import {pathMesh,beachDetails,disposePath} from './city-life.mjs?v=island-city-finish-20261027-1';
import {batchMeshes} from './batch.mjs?v=island-city-finish-20261027-1';
import {IslandRoadBatch} from './ultra-island-roads.mjs?v=island-city-finish-20261027-1';
import {CityStreets} from './city-streets.mjs?v=island-city-finish-20261027-1';
import {CityTraffic} from './city-traffic.mjs?v=island-city-finish-20261027-1';
import {CityOverlay} from './city-overlay.mjs?v=island-city-finish-20261027-1';
import {CityGrowth} from './city-growth.mjs?v=island-city-finish-20261027-1';
import {planningFrame} from './planning-frame.mjs?v=island-city-finish-20261027-1';
import {CitySites} from './city-sites.mjs?v=island-city-finish-20261027-1';
import {ReadyPlotsView} from './ready-plots.mjs?v=island-city-finish-20261027-1';
import {streetFacing} from '../engine/city-sites.mjs?v=island-city-finish-20261027-1';
import {cityRoadNetwork,citySidewalkPoint} from './city-traffic-model.mjs?v=island-city-finish-20261027-1';
import {walkingRoute,cityCenter} from './city-navigation.mjs?v=island-city-finish-20261027-1';

// View contains geometry and pointer interpretation only. Placement rules,
// resources, saves and all strings are owned by the engine and the UI.
export class IslandView {
  constructor({canvas,data={},onCell=()=>{},onHover=()=>{},onSelect=()=>{},onReady=()=>{},onError=()=>{}}) {
    Object.assign(this,{canvas,data,onCell,onHover,onSelect,onReady,onError});this.state=null;this.size=16;this.groups=new Map();this.pointers=new Map();this.route=[];this.disposed=false;
    this.angle=.69;this.elevation=.76;this.zoom=1;this.target=new T.Vector3(0,.4,0);this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.plane=new T.Plane(new T.Vector3(0,1,0),-GROUND);this.hit=new T.Vector3();
    this.scene=new T.Scene();this.scene.background=new T.Color('#b2d9dc');this.scene.fog=new T.Fog('#b2d9dc',72,155);
    try {this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(error){onError('error.webgl');return;}
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.occlusion=new CityOcclusion(this.renderer);
    this.quality='high';this.started=performance.now();this.qualityCheckedAt=this.started;
    this.camera=new T.OrthographicCamera(-14,14,14,-14,.1,180);
    this.lighting=cityLighting(this.renderer,this.scene);
    this.scene.add(new T.HemisphereLight('#dfedf5','#52654e',.68));
    const sun=new T.DirectionalLight('#fff0d6',2.65);sun.position.set(-17,30,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.camera.near=1;sun.shadow.camera.far=100;sun.shadow.bias=-.00025;sun.shadow.normalBias=.022;this.scene.add(sun);this.sun=sun;
    if(canvas.clientWidth>=1000&&this.renderer.capabilities.maxTextureSize>=2048)sun.shadow.mapSize.set(2048,2048);
    this.contactShadows=this.createContactShadows();this.scene.add(this.contactShadows);
    this.environment=new Environment(this.scene,{...data.world,viewConfig:data.config.cityView});this.environment.rebuild(this.size);this.decorateBeach();this.buildingRoot=new T.Group();this.scene.add(this.buildingRoot);this.roadBatch=new IslandRoadBatch(this.scene);
    this.cityDepth = new CityDepthView(this);
    this.models=new LocalModels();
    const records=data.buildings instanceof Map?[...data.buildings.values()]:data.buildings||[];
    this.modelsReady=Promise.all(records.flatMap(record=>[record.model,...(record.levels||[]).map(level=>level.model)]).filter(Boolean).map(spec=>this.models.load(spec))).then(()=>{if(!this.disposed&&this.state)this.setWorld(this.state,true);});
    this.avatar=new Avatar(this.scene);
    this.pilot=new MeshyPilot(this.scene,data.config.cityView.meshyPilot);
    this.citizens=new Citizens(this.scene,data.config.cityView.citizens.max,{models:this.pilot.models,quality:this.quality,enabled:data.featureFlags?.citizens!==false});
    this.cityStreets=new CityStreets(this.scene,GROUND,this.environment.flora.models,{vehicleModels:this.pilot.models,carSpec:data.config.cityView.meshyPilot.car});
    this.cityTraffic=new CityTraffic(this.scene,this.pilot.models,data.config.cityView.meshyPilot.car,GROUND);
    this.cityOverlay=new CityOverlay(this.scene,GROUND);
    this.citySites=new CitySites(this.scene,GROUND);
    this.readyPlots=new ReadyPlotsView(this.scene,GROUND);
    this.cityGrowth=new CityGrowth(this.scene,GROUND,{reducedMotion:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
    this.cityReady=Promise.all([this.environment.modelsReady,this.cityStreets.surfaces.ready]).then(()=>{if(!this.disposed&&this.state)this.syncCity(this.state.buildings,true);});
    this.pilotReady=this.pilot.load().then(()=>{if(!this.disposed&&this.state){this.pathSignature=null;this.refreshWalkers(this.state.buildings);this.syncCity(this.state.buildings,true);}});
    this.avatar.load({}).then(()=>{if(!this.disposed){if(!this.avatarPositioned)this.avatar.holder.position.set(0,GROUND,0);this.onReady(this);}}).catch(()=>this.onError('error.avatar'));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.handlers={};this.bindEvents();this.resize();this.last=performance.now();this.samples=[];this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
  }
  definition(id) {const registered=this.data.registry?.buildings?.get(id);if(registered)return registered;const b=this.data.buildings;return b instanceof Map?b.get(id):Array.isArray(b)?b.find(r=>r.id===id):b?.[id];}
  createContactShadows(){
    const size=64,bytes=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const radius=Math.max(Math.abs((x/(size-1)-.5)*2),Math.abs((y/(size-1)-.5)*2)),i=(y*size+x)*4;
      bytes[i]=25;bytes[i+1]=43;bytes[i+2]=35;bytes[i+3]=Math.round((1-T.MathUtils.smoothstep(radius,.6,1))*100);
    }
    const map=new T.DataTexture(bytes,size,size);map.needsUpdate=true;
    const material=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false});
    const mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),material,1024);mesh.count=0;mesh.renderOrder=1;mesh.frustumCulled=false;return mesh;
  }
  updateContactShadows(buildings){
    const dummy=new T.Object3D(),mesh=this.contactShadows,bounds=new T.Box3(),extent=new T.Vector3();let count=0;
    for(const building of buildings){const record=this.definition(building.typeId||building.type);if(!record||record.isRoad||count>=1024)continue;
      const item=this.groups.get(building.id);if(!item)continue;
      item.group.updateWorldMatrix(true,true);bounds.setFromObject(item.group);if(bounds.isEmpty())continue;bounds.getSize(extent);bounds.getCenter(dummy.position);
      dummy.position.y=GROUND+.034;dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(Math.max(.3,extent.x+.35),Math.max(.3,extent.z+.35),1);dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
    }
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
  }
  decorateBeach(){const group=new T.Group();beachDetails(group,this.size,this.data.config.cityView.beach);batchMeshes(group);this.environment.land.add(group);}
  worldPosition(x,z,footprint=[1,1]) {return new T.Vector3(x+(footprint[0]-1)/2-(this.size-1)/2,GROUND,z+(footprint[1]-1)/2-(this.size-1)/2);}
  makeBuilding(record,level=1) {return createBuilding(record,level,this.models);}
  setBuildingFactory(factory) {this.buildingFactory=factory;if(this.state)this.setWorld(this.state,true);}
  setWorld(state,force=false) {
    this.state=state;if(!this.renderer)return;
    const previousSize=this.size;this.size=Number(state.world?.size||state.worldSize||16);this.environment.rebuild(this.size);if(previousSize!==this.size)this.decorateBeach();
    const buildings=state.buildings||state.world?.buildings||[],ids=new Set(buildings.map(b=>b.id));
    const roadCells=new Set(buildings.filter(b=>this.definition(b.typeId)?.isRoad).map(b=>`${b.x},${b.z}`));
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
      else if(record.requiresRoad)item.group.rotation.y=record.visual?.fixedFacing?0:streetFacing(b,record,buildings,id=>this.definition(id),roadCells);
    }
    if(previousSize!==this.size)this.resize();
    this.roadBatch.rebuild([...this.groups.values()],id=>Boolean(this.definition(id)?.isRoad),force);
    const shadowExtent=Math.max(18,this.size*.76+3);Object.assign(this.sun.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent});this.sun.shadow.camera.updateProjectionMatrix();
    this.updateContactShadows(buildings);this.setAvatar(state.avatar||state.character||{});this.refreshWalkers(buildings);this.syncCity(buildings);
    this.cityDepth.update(this.cityReport, this.citySelection);
    this.cityOverlay.sync(state,id=>this.definition(id),this.data.config,this.cityOverlayReport);
    if(!this.initialFramed){this.initialFramed=true;this.home();}
  }
  setCityOverlay(mode,report){if(!this.cityOverlay)return;this.cityOverlay.mode=mode;this.cityOverlayReport=report;if(this.state)this.cityOverlay.sync(this.state,id=>this.definition(id),this.data.config,report);}
  setCityReport(report, selectedId = null) {this.cityReport = report; this.citySelection = selectedId; this.cityDepth?.update(report, selectedId);}
  highlightCityBuildings(ids){this.cityGrowth?.highlight((this.state?.buildings||[]).filter(row=>ids.includes(row.id)),this.size,id=>this.definition(id));}
  setPlanningViewport(insets){if(JSON.stringify(insets)===JSON.stringify(this.planningInsets))return;this.planningInsets=insets;this.resize();}
  setCitySites(rows=[]){this.citySites?.show(rows,this.size);}
  setReadyPlots(rows=[]){this.readyPlots?.show(rows,this.size);this.readyPlots?.update(this.camera,this.canvas.getBoundingClientRect());}
  setReadyPlotSelection(id){this.readyPlots?.setSelection(id);}
  focusReadyPlot(row){this.flyToCell(row.x+(row.w-1)/2,row.z+(row.d-1)/2,Math.max(this.zoom,2.4));}
  syncCity(buildings,force=false){
    if(!this.cityStreets||!this.cityTraffic)return;
    this.cityStreets.quality=this.cityTraffic.quality=this.quality;
    const definition=id=>this.definition(id);
    this.cityStreets.rebuild(buildings,this.size,definition,force);this.cityTraffic.sync(buildings,this.size,definition,force);
    // The same original model now drives on the road network. Retain the
    // existing parked-car fallback when a small village has too few roads.
    if(this.pilot.car&&this.cityTraffic.batches.length)this.pilot.car.visible=false;
  }
  refreshWalkers(buildings) {
    const signature=JSON.stringify([this.size,this.quality,buildings.map(b=>[b.id,b.x,b.z,b.level])]);if(signature===this.pathSignature)return;this.pathSignature=signature;
    const paths=this.paths=cityPaths(this.state,this.data.registry),settings=this.data.config.cityView;
    if(this.pathsMesh){this.scene.remove(this.pathsMesh);disposePath(this.pathsMesh);}this.pathsMesh=pathMesh(paths.cells,this.size,settings.paths);this.scene.add(this.pathsMesh);
    const roadNetwork=cityRoadNetwork(buildings,this.size,id=>this.definition(id));
    const sidewalks=paths.cells.map(cell=>{const p=citySidewalkPoint(cell,roadNetwork),v=this.worldPosition(p.x,p.z);v.y+=p.height;return Object.assign(v,{neighbors:p.neighbors});});
    this.pilot.sync(buildings,paths,id=>this.definition(id),(x,z)=>this.worldPosition(x,z));
    if(this.data.featureFlags?.citizens===false&&this.pilot.walker)this.pilot.walker.root.visible=false;
    const count=Math.min(this.quality==='low'?settings.citizens.lowMax:settings.citizens.max,settings.citizens.minimum+buildings.filter(b=>!this.definition(b.typeId)?.isRoad).length*settings.citizens.perBuilding);
    this.walkPoints=sidewalks;this.citizens.setQuality(this.quality);this.citizens.setPoints(sidewalks,this.data.featureFlags?.citizens===false?0:count-(this.pilot.walker?.root.visible?1:0));
    if(sidewalks.length&&!this.avatarPositioned){const hall=buildings.find(b=>b.typeId==='cityHall'),home=hall?this.worldPosition(hall.x,hall.z):this.worldPosition(this.size/2,this.size/2),start=sidewalks.reduce((best,p)=>p.distanceTo(home)<best.distanceTo(home)?p:best,sidewalks[0]);this.avatar.holder.position.copy(start);this.avatarPositioned=true;}
    if(this.touring&&this.tourDestination)this.goWalk(this.tourDestination);
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
    const outward=record.requiresShore?shoreDirection(this.state,record,x,z):null;
    const facing=record.requiresShore?(outward?Math.atan2(outward.x,outward.z):0):record.requiresRoad&&!record.visual?.fixedFacing?streetFacing({typeId:record.id,x,z},record,this.state?.buildings||[],id=>this.definition(id)):0;
    const key=[record.id,level,x,z,valid,this.size,facing].join(':');if(this.ghostKey===key)return;this.clearGhost();this.ghostKey=key;
    const [w,d]=record.footprint||[1,1],color=valid?'#39c88c':'#f06b77';
    const group=this.buildingFactory?this.buildingFactory(record,level):this.makeBuilding(record,level);
    group.traverse(o=>{if(o.isMesh||o.isLineSegments){if(o.userData.ownedMaterial)o.material.dispose();o.material=o.isLineSegments?new T.LineBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false}):new T.MeshBasicMaterial({color,transparent:true,opacity:.42,depthWrite:false});o.userData.ownedMaterial=false;o.userData.ghostMaterial=true;o.castShadow=false;o.receiveShadow=false;}});
    const floor=new T.Mesh(new T.PlaneGeometry(w-.04,d-.04),new T.MeshBasicMaterial({color,transparent:true,opacity:.48,side:T.DoubleSide,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=.025;floor.userData.ownedGeometry=true;floor.userData.ghostMaterial=true;group.add(floor);
    const box=new T.BoxGeometry(w,.055,d),border=new T.LineSegments(new T.EdgesGeometry(box),new T.LineBasicMaterial({color,linewidth:2}));box.dispose();border.position.y=.035;border.userData.ownedGeometry=true;border.userData.ghostMaterial=true;group.add(border);
    group.position.copy(this.worldPosition(x,z,[w,d]));this.scene.add(group);this.ghost=group;this.environment.showPlacementGrid(true);this.canvas.dataset.ghost=valid?'valid':'invalid';
    group.rotation.y=facing;
  }
  clearGhost() {if(this.ghost){this.scene.remove(this.ghost);this.ghost.traverse(o=>{if(o.userData.ghostMaterial)o.material.dispose();});disposeBuilding(this.ghost);this.ghost=null;}this.ghostKey=null;this.environment?.showPlacementGrid(false);delete this.canvas.dataset.ghost;}
  showRadius(record,instance) {
    if(this.radius){this.scene.remove(this.radius);this.radius.geometry.dispose();this.radius.material.dispose();this.radius=null;}
    if(!record||!instance||!record.radius)return;
    this.radius=new T.Mesh(new T.RingGeometry(Math.max(0,record.radius-.05),record.radius+.05,64),new T.MeshBasicMaterial({color:'#fff7c8',transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));
    this.radius.rotation.x=-Math.PI/2;this.radius.position.copy(this.worldPosition(instance.x,instance.z,record.footprint));this.radius.position.y+=.05;this.scene.add(this.radius);
  }
  resize() {
    if(!this.renderer)return;const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),aspect=width/height;
    const pixelRatio=Math.min(this.quality==='low'?1:1.5,window.devicePixelRatio||1);
    if(this.appliedPixelRatio!==pixelRatio){this.appliedPixelRatio=pixelRatio;this.renderer.setPixelRatio(pixelRatio);}
    if(this.renderWidth!==width||this.renderHeight!==height){this.renderWidth=width;this.renderHeight=height;this.renderer.setSize(width,height,false);this.citySites?.resize(width,height);this.readyPlots?.resize(width,height);}
    const compact=width>height&&height<=500;
    const c=this.data.config.cityView.camera;
    if(this.compact!==compact){this.elevation=compact?c.landscapeElevation:c.elevation;this.compact=compact;}
    // Frame the coast as well as the building grid. The margin stays in world
    // units so expanded islands retain a useful scale in the available space.
    const span=Math.max(this.size*(compact?c.landscapeSpanRatio:c.spanRatio)+2.8,this.size*c.aspectRatio/aspect)/this.zoom,offset=compact?span*aspect*c.panelOffset:0;
    const frame=this.planningInsets?planningFrame(width,height,this.size,this.zoom,this.planningInsets):{left:-span*aspect+offset,right:span*aspect+offset,top:span,bottom:-span};
    Object.assign(this.camera,{left:frame.left,right:frame.right,top:frame.top,bottom:frame.bottom});this.camera.updateProjectionMatrix();this.updateCamera();
    // Resizing clears the canvas. A paused library keeps a still frame of the
    // world behind it without advancing citizens, routes or game state.
    if(this.paused)this.renderWorld();
  }
  updateCamera() {if(!this.camera)return;const r=45;this.camera.position.set(this.target.x+Math.sin(this.angle)*Math.cos(this.elevation)*r,this.target.y+Math.sin(this.elevation)*r,this.target.z+Math.cos(this.angle)*Math.cos(this.elevation)*r);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();this.readyPlots?.update(this.camera,this.canvas.getBoundingClientRect());}
  renderWorld(){
    try{if(this.occlusion?.render(this.scene,this.camera,this.quality))return;}
    catch{if(this.occlusion){this.occlusion.enabled=false;this.occlusion.dispose();}}
    this.renderer.render(this.scene,this.camera);
  }
  home() {this.setTour(false);this.cameraFlight=null;const c=this.data.config.cityView.camera,center=cityCenter(this.state?.buildings||[],id=>this.definition(id),this.size);this.angle=c.angle;this.compact=undefined;this.zoom=T.MathUtils.clamp(this.size/center.span*1.4,1.8,4.2);this.target.copy(this.worldPosition(center.x,center.z));this.target.y=.4;this.resize();}
  overview(){this.setTour(false);this.cameraFlight=null;this.zoom=1;this.target.set(0,.4,0);this.resize();}
  focusCell(x,z) {this.setTour(false);this.cameraFlight=null;this.target.copy(this.worldPosition(x,z));this.updateCamera();}
  flyToCell(x,z,zoom=this.zoom){this.setTour(false);const position=this.worldPosition(T.MathUtils.clamp(x,0,this.size-1),T.MathUtils.clamp(z,0,this.size-1));position.y=.4;if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){this.target.copy(position);this.zoom=zoom;this.resize();}else this.cameraFlight={position,zoom:T.MathUtils.clamp(zoom,.68,4.8)};}
  zoomCenter(factor){const r=this.canvas.getBoundingClientRect();this.zoomAt(factor,r.left+r.width/2,r.top+r.height/2);}
  panMap(from,to){this.cameraFlight=null;if(this.touring)this.setTour(false);const anchor=this.groundAt(from.x,from.y),next=this.groundAt(to.x,to.y);if(anchor&&next){this.target.add(anchor.sub(next));for(const key of ['x','z'])this.target[key]=T.MathUtils.clamp(this.target[key],-this.size*.65,this.size*.65);this.updateCamera();if(this.paused)this.renderWorld();}}
  clearTourPath(){if(!this.tourPath)return;this.tourPath.removeFromParent();this.tourPath.geometry.dispose();this.tourPath.material.dispose();this.tourPath=null;}
  clearTourMarker(){if(!this.tourMarker)return;this.tourMarker.removeFromParent();this.tourMarker.geometry.dispose();this.tourMarker.material.dispose();this.tourMarker=null;}
  setTour(active){this.touring=Boolean(active&&this.walkPoints?.length);this.cameraFlight=null;this.tourDestination=null;this.route=[];this.clearTourPath();this.clearTourMarker();if(this.avatar){this.avatarBaseSpeed??=this.avatar.speed;this.avatar.speed=this.touring?.75:this.avatarBaseSpeed;}if(this.canvas.dataset)this.canvas.dataset.tour=String(this.touring);if(this.touring){this.tourPreviousElevation??=this.elevation;this.elevation=Math.max(this.elevation,.95);this.tourMarker=new T.Mesh(new T.RingGeometry(.16,.23,32),new T.MeshBasicMaterial({color:'#ffe4a4',side:T.DoubleSide,depthWrite:false}));this.tourMarker.rotation.x=-Math.PI/2;this.scene.add(this.tourMarker);this.zoom=Math.max(this.zoom,3.3);this.resize();}else if(this.tourPreviousElevation!==undefined){this.elevation=this.tourPreviousElevation;delete this.tourPreviousElevation;this.updateCamera();}}
  goWalk(destination){if(!this.walkPoints?.some(p=>Math.hypot(p.x-destination.x,p.z-destination.z)<=2.5))return false;const route=walkingRoute(this.walkPoints||[],this.avatar.holder.position,destination);if(!route.length)return false;this.tourDestination={...destination};this.route=route;this.clearTourPath();const geometry=new T.BufferGeometry().setFromPoints(route.map(p=>new T.Vector3(p.x,(p.y??GROUND)+.08,p.z)));this.tourPath=new T.Line(geometry,new T.LineBasicMaterial({color:'#f1d58a',transparent:true,opacity:.9,depthWrite:false}));this.scene.add(this.tourPath);return true;}
  screenForCell(x,z) {const p=this.worldPosition(x,z);p.project(this.camera);const r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  screenForLandmark(id) {const p=this.environment?.landmarks[id]?.clone();if(!p)return null;p.project(this.camera);const r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1};}
  groundAt(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);this.ray.setFromCamera(this.pointer,this.camera);
    return this.ray.ray.intersectPlane(this.plane,this.hit)?this.hit.clone():null;
  }
  zoomAt(factor,clientX,clientY,previous={x:clientX,y:clientY}){
    this.cameraFlight=null;
    const anchor=this.groundAt(previous.x,previous.y);this.zoom=T.MathUtils.clamp(this.zoom*factor,.68,4.8);this.resize();
    const next=this.groundAt(clientX,clientY);if(anchor&&next){this.target.add(anchor.sub(next));this.updateCamera();if(this.paused)this.renderWorld();}
  }
  cellAt(clientX,clientY) {
    const hit=this.groundAt(clientX,clientY);if(!hit)return null;
    const x=Math.floor(hit.x+this.size/2),z=Math.floor(hit.z+this.size/2);return x>=0&&z>=0&&x<this.size&&z<this.size?{x,z}:null;
  }
  bindEvents() {
    const listen=(type,handler,options)=>{this.handlers[type]=handler;this.canvas.addEventListener(type,handler,options);};this.canvas.style.touchAction='none';
    this.canvas.tabIndex=0;this.canvas.setAttribute?.('aria-label','מפת העיר. גרירה או חצים לתנועה, פלוס ומינוס לזום.');
    listen('keydown',e=>{const direction={ArrowLeft:[-65,0],ArrowRight:[65,0],ArrowUp:[0,-65],ArrowDown:[0,65]}[e.key];if(direction){e.preventDefault();const r=this.canvas.getBoundingClientRect(),p={x:r.left+r.width/2,y:r.top+r.height/2};this.panMap(p,{x:p.x-direction[0],y:p.y-direction[1]});}else if(['+','=','-','_'].includes(e.key)){e.preventDefault();this.zoomCenter(['+','='].includes(e.key)?1.2:1/1.2);}else if(e.key==='Home'){e.preventDefault();this.home();}else if(e.key==='Escape'&&this.touring)this.setTour(false);});
    listen('pointerdown',e=>{this.cameraFlight=null;this.canvas.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});this.dragged=this.pointers.size>1;if(this.pointers.size===2){if(this.touring)this.setTour(false);const [a,b]=[...this.pointers.values()];this.pinch=Math.hypot(a.x-b.x,a.y-b.y);this.gestureMidpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};this.dragged=true;}});
    listen('pointermove',e=>{
      const p=this.pointers.get(e.pointerId);if(!p){const cell=this.cellAt(e.clientX,e.clientY);if(cell)this.onHover(cell);return;}
      const previous={x:p.x,y:p.y},dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
      // A one-finger placement drag moves the ghost. Two fingers still control the camera.
      if(this.ghost&&this.pointers.size===1){const cell=this.cellAt(e.clientX,e.clientY);if(cell)this.onHover(cell);return;}
      if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(this.pinch)this.zoomAt(distance/this.pinch,mid.x,mid.y,this.gestureMidpoint||mid);this.pinch=distance;this.gestureMidpoint=mid;this.dragged=true;}
      else if(Math.hypot(p.x-p.startX,p.y-p.startY)>7||this.dragged){this.dragged=true;if(e.shiftKey||this.cameraMode==='orbit'){this.cameraFlight=null;this.angle-=dx*.008;this.elevation=T.MathUtils.clamp(this.elevation+dy*.004,.42,1.2);this.updateCamera();}else this.panMap(previous,{x:p.x,y:p.y});}
    });
    listen('pointerup',e=>{
      const p=this.pointers.get(e.pointerId),tap=p&&!this.dragged&&this.pointers.size===1;this.pointers.delete(e.pointerId);this.pinch=0;this.gestureMidpoint=null;if(!tap)return;
      const cell=this.cellAt(e.clientX,e.clientY);
      if(this.touring&&cell){if(!this.goWalk(this.worldPosition(cell.x,cell.z)))this.onError('navigation.noRoute');return;}
      const site=this.citySites?.pick(e.clientX,e.clientY,this.camera,this.canvas.getBoundingClientRect());if(site){this.onCell(site);return;}
      // During placement the ground grid is the target, even behind a roof.
      if(this.ghost&&cell){this.onCell(cell);return;}
      // Ready labels are screen-space controls. Their ground footprints also
      // win over an adjoining roof or a road behind a visible badge.
      const ready=this.readyPlots?.pick(e.clientX,e.clientY,this.camera,this.canvas.getBoundingClientRect())||this.readyPlots?.pickCell(cell);if(ready){this.onCell(ready);return;}
      const picked=this.ray.intersectObjects([...this.groups.values()].map(item=>item.group),true).find(hit=>hit.object.userData.buildingId);
      if(picked){this.onSelect(picked.object.userData.buildingId);return;}if(!cell)return;
      const buildings=this.state?.buildings||[];
      const selected=buildings.find(b=>{const f=this.definition(b.typeId||b.type)?.footprint||[1,1];return cell.x>=b.x&&cell.z>=b.z&&cell.x<b.x+f[0]&&cell.z<b.z+f[1];});
      if(selected)this.onSelect(selected.id);else this.onCell(cell);
    });
    listen('pointercancel',e=>{this.pointers.delete(e.pointerId);this.dragged=true;this.pinch=0;this.gestureMidpoint=null;});
    listen('wheel',e=>{e.preventDefault();this.zoomAt(Math.exp(-e.deltaY*.001),e.clientX,e.clientY);},{passive:false});
    listen('webglcontextlost',e=>{e.preventDefault();this.onError('error.webgl');});
  }
  animate(now) {
    if(this.disposed)return;const delta=Math.min((now-this.last)/1000,.05),time=now/1000;this.last=now;
    if(!document.hidden&&!this.paused){
      this.environment.tick(time);this.citizens.tick(delta,time);this.pilot.tick(delta);this.cityTraffic?.update(delta);this.cityGrowth?.update(delta);
      if(!this.touring&&!this.route.length&&this.walkPoints?.length>1&&now>(this.nextWalk||0)){const here=this.avatar.holder.position;let nearest=0;for(let i=0;i<this.walkPoints.length;i++)if(here.distanceTo(this.walkPoints[i])<here.distanceTo(this.walkPoints[nearest]))nearest=i;const p=this.walkPoints[nearest],next=this.walkPoints[p.neighbors?.[Math.floor(time)%p.neighbors.length]??nearest];this.route.push({x:p.x,y:p.y,z:p.z},{x:next.x,y:next.y,z:next.z});this.nextWalk=now+1500;}
      this.avatar.tick(delta,time,this.preview?[]:this.route);
      if(this.cameraFlight){const flight=this.cameraFlight;this.target.lerp(flight.position,1-Math.exp(-delta*8));this.zoom+=(flight.zoom-this.zoom)*(1-Math.exp(-delta*8));if(this.target.distanceTo(flight.position)<.01&&Math.abs(this.zoom-flight.zoom)<.005){this.target.copy(flight.position);this.zoom=flight.zoom;this.cameraFlight=null;}this.resize();}
      else if(this.touring){this.followTarget??=new T.Vector3();this.followTarget.copy(this.avatar.holder.position);this.followTarget.y=.4;this.target.lerp(this.followTarget,1-Math.exp(-delta*4));if(this.tourMarker){this.tourMarker.position.copy(this.avatar.holder.position);this.tourMarker.position.y+=.035;}this.updateCamera();if(!this.route.length)this.clearTourPath();}
      if(!this.preview||now-(this.lastWorldRender||0)>500){this.renderWorld();this.lastWorldRender=now;}
      this.renderAvatarPreview();this.samples.push(now);while(this.samples[0]<now-1000)this.samples.shift();
      if(!this.preview&&now-this.started>5000&&now-this.qualityCheckedAt>2000){
        this.qualityCheckedAt=now;
        if(this.quality==='high'&&this.samples.length<27){
          if(this.occlusion?.enabled){this.occlusion.enabled=false;this.occlusion.dispose();this.samples=[];}
          else{this.quality='low';this.renderer.shadowMap.enabled=false;this.sun.castShadow=false;this.environment.setQuality?.('low');this.resize();this.refreshWalkers(this.state.buildings);this.syncCity(this.state.buildings,true);}
        }
      }
    }
    this.frame=requestAnimationFrame(this.animate);
  }
  metrics() {return {triangles:this.renderer?.info.render.triangles||0,calls:this.renderer?.info.render.calls||0,fps:this.samples?.length||0,citizens:this.citizens?.people.length||0,pedestrians:this.citizens?.metrics(),paths:this.paths?.routes.map(r=>({id:r.id,connected:r.connected})),roads:this.roadBatch?.metrics(),streets:this.cityStreets?.metrics(),readyPlots:this.readyPlots?.metrics(),traffic:this.cityTraffic?.metrics(),pixelRatio:this.renderer?.getPixelRatio()||0,quality:this.quality,occlusion:this.occlusion?.metrics(),avatarLoaded:!!this.avatar?.root,models:this.models?.metrics(),pilot:this.pilot?.metrics(),renderer:this.renderer?.getContext().getParameter(this.renderer.getContext().VERSION)};}
  dispose() {if(this.disposed)return;this.disposed=true;this.clearTourPath();this.clearTourMarker();cancelAnimationFrame(this.frame);this.detachAvatarPreview();this.clearGhost();this.cityDepth?.dispose();disposePath(this.pathsMesh);this.cityGrowth?.dispose();this.citySites?.dispose();this.readyPlots?.dispose();this.cityOverlay?.dispose();this.roadBatch?.dispose();this.cityStreets?.dispose();this.cityTraffic?.dispose();this.contactShadows?.dispose();this.contactShadows?.geometry.dispose();this.contactShadows?.material.map.dispose();this.contactShadows?.material.dispose();this.radius?.geometry.dispose();this.radius?.material.dispose();for(const item of this.groups.values())disposeBuilding(item.group);this.citizens?.dispose();this.pilot?.dispose();this.models?.dispose();this.resizeObserver?.disconnect();for(const [type,handler]of Object.entries(this.handlers||{}))this.canvas.removeEventListener(type,handler);this.avatar?.dispose();this.environment?.dispose();this.sun?.shadow.dispose();this.lighting?.dispose();this.occlusion?.dispose();this.renderer?.dispose();}
}

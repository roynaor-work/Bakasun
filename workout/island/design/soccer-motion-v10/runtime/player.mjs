/** Original v10 deterministic presentation player. CC0-1.0.
 * Native GLBs remain in place (rootMotion:false), without IK. The optional
 * reference-only trajectory is applied once to an outer presentation group;
 * ball/support samples are already in that reference-world coordinate frame.
 * Existing v8 three.js is a repository dependency, not copied into this pack.
 */
import * as THREE from 'three';
import {GLTFLoader} from '../../soccer-motion-v8/runtime/vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from '../../soccer-motion-v8/runtime/vendor/SkeletonUtils.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>(x=clamp(x,0,1),x*x*(3-2*x));
const DEG=Math.PI/180;
const lerp=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const rotate=(p,yaw)=>[p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),p[1],-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw)];
const sampleTrack=(samples,time)=>{
  if(!samples?.length)return {time,position:[0,0,0],yaw:0};
  if(time<=samples[0].time)return samples[0];
  for(let i=1;i<samples.length;i++)if(time<=samples[i].time){const a=samples[i-1],b=samples[i],u=(time-a.time)/(b.time-a.time||1);return {time,position:lerp(a.position,b.position,u),yaw:(a.yaw??0)+((b.yaw??0)-(a.yaw??0))*u};}
  return samples.at(-1);
};
const boneNames=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];

export class MotionPlayer {
  constructor(container,{onChange=()=>{}}={}){
    this.container=container;this.onChange=onChange;this.assets=new Map();this.clips=[];this.mode='loop';this.playing=true;this.speed=1;this.time=0;this.view='three-quarter';this.loaded=false;this.errors=[];this.inPlace=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#344e34');this.scene.fog=new THREE.Fog('#344e34',11,32);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(36,1,.05,70);
    this.scene.add(new THREE.HemisphereLight(0xc5d6ed,0x41502e,2.5));const sun=new THREE.DirectionalLight(0xffecd2,3.1);sun.position.set(4,7,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.bias=-.0003;sun.shadow.normalBias=.02;this.scene.add(sun);this.sun=sun;this.scene.add(sun.target);
    const fill=new THREE.DirectionalLight(0xc4ddff,1.1);fill.position.set(-4,2,-2);this.scene.add(fill);
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x385b32,roughness:1}));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.008;this.floor.receiveShadow=true;this.scene.add(this.floor);
    this.grid=new THREE.GridHelper(60,120,0x70885e,0x4d7045);this.grid.position.y=-.005;this.grid.material.opacity=.26;this.grid.material.transparent=true;this.scene.add(this.grid);
    this.root=new THREE.Group();this.scene.add(this.root);
    this.ball=new THREE.Mesh(new THREE.SphereGeometry(.11,24,16),new THREE.MeshStandardMaterial({color:0xf3edd9,roughness:.74,metalness:0}));this.ball.castShadow=true;this.scene.add(this.ball);
    const seamMaterial=new THREE.MeshStandardMaterial({color:0x28342b,roughness:.8});for(let i=0;i<3;i++){const seam=new THREE.Mesh(new THREE.TorusGeometry(.1105,.003,4,48),seamMaterial);seam.rotation.set(i===1?Math.PI/2:0,i===2?Math.PI/2:0,0);this.ball.add(seam);}
    this.anchorGroup=new THREE.Group();this.scene.add(this.anchorGroup);this.path=new THREE.Group();this.scene.add(this.path);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.lastTimestamp=null;this.raf=requestAnimationFrame(t=>this.animate(t));
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.loaded&&this.current)this.sample(this.time);}
  async loadAll(){
    if(this.loadPromise)return this.loadPromise;
    this.loadPromise=(async()=>{
      const response=await fetch(new URL('catalog.json',import.meta.url));if(!response.ok)throw Error(`catalog.json: HTTP ${response.status}`);this.catalog=await response.json();this.clips=Array.isArray(this.catalog)?this.catalog:this.catalog.clips;
      if(!this.clips?.length)throw Error('Empty motion catalog');
      const manager=new THREE.LoadingManager();manager.onError=url=>this.errors.push({id:url,message:'Resource failed to load'});const loader=new GLTFLoader(manager); // Deliberately no Draco or meshopt decoder.
      const list=[...this.clips.map(c=>({id:c.id,url:new URL(c.asset??`clips/${c.id}.glb`,import.meta.url)})),...['run','jog','idle_relaxed'].map(id=>({id:`reference:${id}`,url:new URL(`reference/${id}.glb`,import.meta.url)}))];
      // Bound concurrency to avoid peak texture/geometry decoding memory spikes.
      let cursor=0;const worker=async()=>{while(cursor<list.length){const record=list[cursor++];try{const response=await fetch(record.url);if(!response.ok)throw Error(`${record.id}: HTTP ${response.status}`);const gltf=await loader.parseAsync(await response.arrayBuffer(),new URL('.',record.url).href);if(gltf.animations.length!==1)throw Error(`Expected one animation: ${record.id}`);const mixer=new THREE.AnimationMixer(gltf.scene),clip=gltf.animations[0],action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();const nodes=Object.fromEntries(boneNames.map(name=>[name,gltf.scene.getObjectByName(name)]));for(const name of boneNames)if(!nodes[name])throw Error(`${record.id}: missing ${name}`);gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;}});this.assets.set(record.id,{gltf,mixer,action,nodes,duration:clip.duration});this.onChange({loading:true,loaded:this.assets.size,total:list.length});}catch(e){this.errors.push({id:record.id,message:e.message});throw e;}}};
      await Promise.all([worker(),worker()]);if(this.errors.length)throw Error(`Failed to load ${this.errors.length} embedded resources`);this.loaded=true;this.select(this.clips[0].id);return {loaded:this.assets.size,total:list.length,ids:[...this.assets.keys()],errors:this.errors};
    })();return this.loadPromise;
  }
  select(id){const c=this.clips.find(c=>c.id===id);if(!c)throw Error(`Unknown clip: ${id}`);this.current=c;this.time=0;this.root.clear();const a=this.assets.get(id);a.display??=cloneSkeleton(a.gltf.scene);this.root.add(a.display);this.displayNodes=Object.fromEntries(boneNames.map(name=>[name,a.display.getObjectByName(name)]));this.makeGuides();this.sample(0);return this.snapshot();}
  setMode(mode){if(!['loop','transition'].includes(mode))throw Error(`Unknown playback mode: ${mode}`);this.mode=mode;this.time=0;if(this.current)this.sample(0);return this.snapshot();}
  setView(view){this.view=view;if(this.current)this.sample(this.time);}
  get entryReference(){return this.current?.entry?.reference??'run';}
  get exitReference(){return this.current?.exit?.reference??'run';}
  get entryMoving(){return this.entryIdle?'run':this.entryReference;}
  get exitMoving(){return this.exitIdle?'run':this.exitReference;}
  get lead(){return this.assets.get(`reference:${this.entryMoving}`)?.duration??.6;}
  get tail(){return this.assets.get(`reference:${this.exitMoving}`)?.duration??.6;}
  speedFor(reference){return reference==='jog'?2.6:reference==='run'?4.5:0;}
  get entryIdle(){return this.entryReference.startsWith('idle_');}
  get exitIdle(){return this.exitReference.startsWith('idle_');}
  get entryBridge(){return this.entryIdle?(this.current.entry.editedReference?this.current.entry.blendSeconds??.2:.4):0;}
  get entryClipBlend(){return !this.entryIdle&&this.current?.entry?.editedReference?this.current.entry.blendSeconds??.1:0;}
  get exitBlend(){return this.exitIdle?(this.current.exit.continuation||this.current.exit.editedReference?this.current.exit.blendSeconds??.2:.4):(this.current?.exit?.continuation||this.current?.exit?.editedReference?this.current.exit.blendSeconds??.2:0);}
  get actionStart(){return this.mode==='transition'?this.lead+this.entryBridge:0;}
  get totalDuration(){return !this.current?0:this.mode==='transition'?this.actionStart+this.current.duration+this.exitBlend+this.tail:this.current.duration;}
  pose(id,time){
    const a=this.assets.get(id);if(!a)throw Error(`Asset not loaded: ${id}`);const t=clamp(time,0,a.duration);a.action.reset().play();a.mixer.setTime(0);a.mixer.update(t);a.gltf.scene.updateMatrixWorld(true);
    return Object.fromEntries(boneNames.map(name=>[name,{position:a.nodes[name].position.toArray(),rotation:a.nodes[name].quaternion.toArray(),scale:a.nodes[name].scale.toArray()}]));
  }
  blend(a,b,u){const q=new THREE.Quaternion();return Object.fromEntries(boneNames.map(name=>[name,{position:lerp(a[name].position,b[name].position,u),rotation:q.fromArray(a[name].rotation).slerp(new THREE.Quaternion().fromArray(b[name].rotation),u).toArray(),scale:lerp(a[name].scale,b[name].scale,u)}]));}
  reference(name,time){const key=this.assets.has(`reference:${name}`)?`reference:${name}`:name,a=this.assets.get(key);if(!a)throw Error(`Reference not loaded: ${name}`);return this.pose(key,((time%a.duration)+a.duration)%a.duration);}
  timeline(time){
    const c=this.current,D=c.duration,rootTrack=c.referenceRootMotion,end=sampleTrack(rootTrack?.samples,D),endYaw=(end.yaw??0)*(rootTrack?.yawUnit==='radians'?1:DEG),entryPhase=c.entry?.phase??0,exitPhase=c.exit?.phase??0,entrySpeed=this.speedFor(this.entryMoving),exitSpeed=this.speedFor(this.exitMoving);
    if(this.mode==='loop')return {segment:'clip',phase:'קליפ · לולאה',clipTime:clamp(time,0,D),pose:this.pose(c.id,clamp(time,0,D)),root:sampleTrack(rootTrack?.samples,clamp(time,0,D)),shift:[0,0,0]};
    const start=this.actionStart,after=start+D;
    if(time<start){
      if(this.entryIdle&&time>=this.lead){const t=time-this.lead,B=this.entryBridge,u=t/B,target=c.entry.editedReference?this.pose(c.id,0):this.reference(this.entryReference,entryPhase);return {segment:'entry-bridge',phase:'מעבר מריצה לעמידה',clipTime:0,pose:this.blend(this.reference(this.entryMoving,0),target,smooth(u)),root:{position:[0,0,-entrySpeed*B/2+entrySpeed*(t-t*t/(2*B))],yaw:0},shift:[0,0,0]};}
      const remaining=this.lead-time;return {segment:'incoming-run',phase:'ריצת כניסה',clipTime:0,pose:this.reference(this.entryMoving,time+(this.entryIdle?0:entryPhase)),root:{position:[0,0,-entrySpeed*remaining-entrySpeed*this.entryBridge/2],yaw:0},shift:[0,0,0]};
    }
    if(time<=after){const local=time-start,native=this.pose(c.id,local),blending=local<this.entryClipBlend;return {segment:'clip',phase:blending?'ערבוב כניסה לקליפ מתוקן':'קליפ · בין ריצות',clipTime:local,pose:blending?this.blend(this.reference(this.entryReference,entryPhase+local),native,smooth(local/this.entryClipBlend)):native,root:sampleTrack(rootTrack?.samples,local),shift:[0,0,0]};}
    let t=time-after;
    if(this.exitIdle&&t<this.exitBlend){return {segment:'exit-bridge',phase:c.exit.continuation?'המשך מתנועת המגע לריצה':'מעבר מעמידה לריצה',clipTime:D,pose:this.blend(this.pose(c.id,D),this.reference('run',t),smooth(t/this.exitBlend)),root:{position:plus(end.position,rotate([0,0,exitSpeed*t*t/(2*this.exitBlend)],endYaw)),yaw:end.yaw},shift:[0,0,0]};}
    if(!this.exitIdle&&t<this.exitBlend){return {segment:'continuation-bridge',phase:'המשך מתנועת המגע לריצה',clipTime:D,pose:this.blend(this.pose(c.id,D),this.reference(this.exitMoving,exitPhase+t),smooth(t/this.exitBlend)),root:{position:plus(end.position,rotate([0,0,exitSpeed*t],endYaw)),yaw:end.yaw},shift:[0,0,0]};}
    const travel=this.exitIdle?exitSpeed*(t-this.exitBlend/2):exitSpeed*t,phase=this.exitIdle?t:exitPhase+t;
    return {segment:'outgoing-run',phase:'ריצת יציאה',clipTime:D,pose:this.reference(this.exitMoving,phase),root:{position:plus(end.position,rotate([0,0,travel],endYaw)),yaw:end.yaw},shift:[0,0,0]};
  }
  sample(time){
    if(!this.current)return null;this.time=clamp(time,0,this.totalDuration);const state=this.timeline(this.time);this.applyPose(state);
    const ballSamples=this.current.ball?.samples;this.ball.visible=state.segment==='clip'&&!!ballSamples?.length;if(this.ball.visible){const p=sampleTrack(ballSamples,state.clipTime).position;this.ball.position.fromArray(this.presentationPoint(p,state.root));const r=this.current.ball.radius??.11;this.ball.scale.setScalar(r/.11);this.ball.rotation.set(state.clipTime*4,0,state.clipTime*2);}
    const supports=(this.current.supports??[]).filter(s=>state.segment==='clip'&&state.clipTime>=s.start-1e-7&&state.clipTime<=s.end+1e-7);for(const ring of this.anchorGroup.children){ring.visible=supports.includes(ring.userData.support);ring.position.fromArray(this.presentationPoint(ring.userData.support.anchor,state.root));ring.position.y+=.006;}this.path.visible=!this.inPlace;
    const target=new THREE.Vector3(this.root.position.x,.75,this.root.position.z);const offsets={side:[4,1.15,0],front:[0,1.15,4.2],top:[.01,5,.5],'three-quarter':[2.8,1.65,3.5]},offset=offsets[this.view]??offsets['three-quarter'];this.camera.position.copy(target).add(new THREE.Vector3(...offset));this.camera.lookAt(target);this.sun.position.set(this.root.position.x+4,7,this.root.position.z+5);this.sun.target.position.set(this.root.position.x,0,this.root.position.z);this.sun.target.updateMatrixWorld();this.renderer.render(this.scene,this.camera);this.lastState=state;this.onChange(this.snapshot());return this.snapshot();
  }
  applyPose(state){
    for(const name of boneNames){const n=this.displayNodes[name],p=state.pose[name];n.position.fromArray(p.position);n.quaternion.fromArray(p.rotation);n.scale.fromArray(p.scale);}
    this.root.position.fromArray(this.inPlace?[0,0,0]:state.root.position);this.root.rotation.set(0,this.inPlace?0:this.referenceYaw(state.root),0);this.root.updateMatrixWorld(true);
  }
  referenceYaw(root){return (root.yaw??0)*(this.current.referenceRootMotion?.yawUnit==='radians'?1:DEG);}
  presentationPoint(point,root){return this.inPlace?rotate(point.map((v,i)=>v-root.position[i]),-this.referenceYaw(root)):point;}
  transitionAudit(id=this.current.id){
    const previous={id:this.current.id,time:this.time,mode:this.mode,inPlace:this.inPlace,playing:this.playing};this.playing=false;this.inPlace=false;this.select(id);this.setMode('transition');
    const positions=time=>{const state=this.timeline(clamp(time,0,this.totalDuration));this.applyPose(state);return {segment:state.segment,joints:Object.fromEntries(boneNames.map(name=>[name,this.displayNodes[name].getWorldPosition(new THREE.Vector3()).toArray()]))};};
    const points=[this.lead,this.actionStart,this.actionStart+this.entryClipBlend,this.actionStart+this.current.duration,this.actionStart+this.current.duration+this.exitBlend].filter((t,i,a)=>t>0&&t<this.totalDuration&&a.indexOf(t)===i),boundaries=[];let maxPoseJumpMeters=0;
    for(const time of points){const before=positions(time-1e-7),at=positions(time),after=positions(time+1e-7);let jump=0;for(const name of boneNames)for(const pair of [[before,at],[at,after]])jump=Math.max(jump,Math.hypot(...pair[0].joints[name].map((v,i)=>v-pair[1].joints[name][i])));maxPoseJumpMeters=Math.max(maxPoseJumpMeters,jump);boundaries.push({time,before:before.segment,at:at.segment,after:after.segment,maxPoseJumpMeters:jump});}
    let framesProcessed=0,finite=true;for(let t=0;t<this.totalDuration+1/120;t+=1/120){const p=positions(Math.min(t,this.totalDuration));framesProcessed++;for(const name of boneNames)finite&&=p.joints[name].every(Number.isFinite);}
    const result={id,maxPoseJumpMeters,boundaries,framesProcessed,samplingHz:120,finite,continuationBlendSeconds:this.current.exit?.continuation?this.exitBlend:0,measures:'displayed FK positions at boundary ±0.1 microseconds; explicit transition blends, no IK'};
    this.select(previous.id);this.setMode(previous.mode);this.inPlace=previous.inPlace;this.playing=previous.playing;this.sample(previous.time);return result;
  }
  makeGuides(){
    for(const group of [this.anchorGroup,this.path]){group.traverse(o=>{o.geometry?.dispose();if(o.material)Array.isArray(o.material)?o.material.forEach(m=>m.dispose()):o.material.dispose();});group.clear();}
    for(const support of this.current.supports??[]){if(!support.anchor)continue;const ring=new THREE.Mesh(new THREE.RingGeometry(.055,.075,24),new THREE.MeshBasicMaterial({color:0xb9f5c6,side:THREE.DoubleSide,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.fromArray(support.anchor);ring.position.y=.006;ring.userData.support=support;this.anchorGroup.add(ring);}
    const samples=this.current.referenceRootMotion?.samples;if(samples?.length>1){const geometry=new THREE.BufferGeometry().setFromPoints(samples.map(s=>new THREE.Vector3(s.position[0],.008,s.position[2])));this.path.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xe8c77f,transparent:true,opacity:.7})));}
  }
  seek(time){this.playing=false;return this.sample(Number(time));}
  tick(delta){return this.sample(clamp(this.time+delta,0,this.totalDuration));}
  snapshot(){
    const c=this.current,s=this.lastState;if(!c)return {loaded:this.assets.size,total:this.clips.length+3,errors:this.errors};const clipTime=s?.clipTime??0,events=c.events??(c.event?[c.event]:[]),eventTime=e=>e?(e.time??e.frame/30):Infinity,nearest=events.reduce((best,e)=>Math.abs(eventTime(e)-clipTime)<Math.abs(eventTime(best)-clipTime)?e:best,null),activeEvents=s?.segment==='clip'?events.filter(e=>Math.abs(eventTime(e)-clipTime)<=1/30+1e-6):[];
    return {id:c.id,label:c.label,category:c.category,duration:c.duration,totalDuration:this.totalDuration,time:this.time,clipTime,frame:Math.round(clipTime*30),frameCount:Math.round(c.duration*30),mode:this.mode,segment:s?.segment??'clip',phase:s?.phase??'קליפ',playing:this.playing,speed:this.speed,inPlace:this.inPlace,loaded:this.assets.size,total:this.clips.length+3,errors:this.errors,event:nearest,activeEvents,supports:s?.segment==='clip'?(c.supports??[]).filter(w=>clipTime>=w.start-1e-7&&clipTime<=w.end+1e-7).map(w=>w.bone):[],root:s?.root??{position:[0,0,0],yaw:0},actionStart:this.actionStart,ballVisible:this.ball.visible,webAssemblyRequired:false,rootMotion:false};
  }
  animate(timestamp){this.raf=requestAnimationFrame(t=>this.animate(t));const delta=this.lastTimestamp===null?0:Math.min(.08,(timestamp-this.lastTimestamp)/1000);this.lastTimestamp=timestamp;if(this.loaded&&this.playing&&this.current){let t=this.time+delta*this.speed;if(t>this.totalDuration)t%=this.totalDuration;this.sample(t);}}
  dispose(){cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.renderer.dispose();}
}

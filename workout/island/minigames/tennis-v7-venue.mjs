/** Island Tennis — loads the tennis v7 venue (assets/tennis-v7, copied from design/tennis-v7) into the scene the view already built.
 * Nothing becomes visible until every file has loaded and passed the name check, so a failure leaves the caller free to build the
 * previous court and crowd untouched. The simulation, the camera and the players are never touched: the court is the game court
 * (singles lines on the rules' lines, net at z = 0, floor at the height the players already stand on). */
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {TennisDRACOLoader,loadTennisGLTF} from './tennis-draco.mjs?v=island-v2-20261107-1';
import {V7_FILES,V7_REQUIRED,REAL,courtWarpZ,sceneWarpZ,crowdKeeps,cheerRole,crowdStartLevel,createCrowdGovernor} from './tennis-v7.mjs?v=island-v2-20261107-1';

const FLOOR=0.08;            // the court surface sits at y 0.01 in the package; the view's players, ball and shadows are calibrated to 0.09
const CROWD_SCALE=0.91;      // the package's own preview scale
const PALETTE=['#E8E2CA','#8BA290','#BD8A6A','#53746E','#C9B783','#8E9CAC','#C5B7A3','#728273'];
const ALLEY=4.3;             // singles court only: the doubles alleys are not in play, so their lines are not drawn
const SINGLES=REAL.singlesHalf+0.025;

/** Move every vertex of `geometry` along z by `map`. */
export function warpGeometry(geometry,map){
 const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++)p.setZ(i,map(p.getZ(i)));
 p.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
/** Keep the singles court: drop every triangle whose centre is in a doubles alley and pull the ends of the baselines in. */
export function trimAlleys(geometry){
 const p=geometry.attributes.position,index=geometry.index,keep=[];
 for(let t=0;t<index.count;t+=3){
  const a=index.getX(t),b=index.getX(t+1),c=index.getX(t+2);
  if(Math.abs((p.getX(a)+p.getX(b)+p.getX(c))/3)<=ALLEY)keep.push(a,b,c);
 }
 for(let i=0;i<p.count;i++){const x=p.getX(i);if(Math.abs(x)>SINGLES)p.setX(i,Math.sign(x)*SINGLES);}
 geometry.setIndex(keep);p.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
/** Connected pieces of an indexed mesh (union-find over the triangles): people are moved as pieces, never stretched. */
export function connectedPieces(geometry){
 const index=geometry.index,count=geometry.attributes.position.count,parent=new Int32Array(count).map((_,i)=>i);
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let t=0;t<index.count;t+=3){const a=find(index.getX(t)),b=find(index.getX(t+1)),c=find(index.getX(t+2));parent[b]=a;parent[find(c)]=a;}
 const pieces=new Map();for(let i=0;i<count;i++){const r=find(i);if(!pieces.has(r))pieces.set(r,[]);pieces.get(r).push(i);}
 return [...pieces.values()];
}
/** Move each connected piece along z by `map` of its own centre (a person keeps their shape, and stands where the line is). */
export function warpPieces(geometry,map){
 const p=geometry.attributes.position;
 for(const piece of connectedPieces(geometry)){
  let lo=Infinity,hi=-Infinity;for(const i of piece){const z=p.getZ(i);if(z<lo)lo=z;if(z>hi)hi=z;}
  const centre=(lo+hi)/2,delta=map(centre)-centre;for(const i of piece)p.setZ(i,p.getZ(i)+delta);
 }
 p.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function firstMesh(root,name){let found=null;root.traverse(o=>{if(!found&&o.isMesh&&o.name===name)found=o;});return found;}
function namesOf(root){const names=new Set();root.traverse(o=>names.add(o.name));return names;}
function lambertOf(source,extra={}){
 return new T.MeshLambertMaterial({vertexColors:!!source.vertexColors,color:source.color?.clone?.()||0xffffff,side:source.side,...extra});
}

/** @returns {Promise<object>} the v7 controller: ball, setQuality, setCrowdLevel, observe, render, metrics, courtMetrics, look, dispose */
export async function createTennisV7({scene,config,keep,params,surface,quality=0,timeoutMs=15000,fetcher,camera=null}){
 const env=config.environment,v7=env.v7,court=config.court,e=config.render.environment;
 const base=new URL('../'+v7.base,import.meta.url),version=new URL(import.meta.url).searchParams.get('v'),abort=new AbortController();
 const urlOf=file=>{const u=new URL(file,base);if(version)u.searchParams.set('v',version);return u.href;};
 const draco=new TennisDRACOLoader();draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(1);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const files={court:V7_FILES.courts[surface],venue:V7_FILES.venue,net:V7_FILES.net,ball:V7_FILES.ball,crowd:V7_FILES.crowd,crew:V7_FILES.crew};
 const get=fetcher||globalThis.fetch,timer=setTimeout(()=>abort.abort(Error('tennis v7 load timeout')),timeoutMs);
 let loaded,layout;
 try{
  const entries=Object.entries(files);
  const [gltfs,json]=await Promise.all([
   Promise.all(entries.map(([,file])=>loadTennisGLTF(loader,urlOf(file),{signal:abort.signal,fetcher:get}))),
   get(urlOf(V7_FILES.layout),{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('tennis v7 layout HTTP '+r.status);return r.json();})
  ]);
  loaded=Object.fromEntries(entries.map(([role],i)=>[role,gltfs[i].scene]));layout=json;
 }catch(error){abort.abort();throw error;}finally{clearTimeout(timer);draco.dispose();}
 // every name the view needs, checked before anything is built or shown
 for(const [role,names] of Object.entries(V7_REQUIRED)){
  const have=namesOf(loaded[role]);
  for(const name of names)if(!have.has(name))throw Error(`tennis v7 ${files[role]} is missing ${name}`);
 }
 if(!Array.isArray(layout?.instances)||layout.instances.length!==layout.count||!layout.count)throw Error('tennis v7 crowd layout is not valid');

 const root=new T.Group();root.name='tennis-v7';root.position.y=FLOOR;
 const courtMap=z=>courtWarpZ(z,court),sceneMap=z=>sceneWarpZ(z,court);
 // --- court: surface and lines on the rules' lines, the apron and the stands moved in by the missing length
 const surfaceMesh=firstMesh(loaded.court,'Court_surface'),linesMesh=firstMesh(loaded.court,'Ivory_court_lines'),surroundMesh=firstMesh(loaded.court,'Court_surround');
 warpGeometry(surfaceMesh.geometry,courtMap);warpGeometry(linesMesh.geometry,courtMap);trimAlleys(linesMesh.geometry);warpGeometry(surroundMesh.geometry,sceneMap);
 surfaceMesh.receiveShadow=true;
 for(const m of [surfaceMesh,linesMesh,surroundMesh]){m.castShadow=false;m.frustumCulled=true;}
 if(surfaceMesh.material.map)surfaceMesh.material.map.anisotropy=4;
 root.add(loaded.court);
 // --- venue and officials: one Lambert material each, no shadows, moved with the scenery map / the court map
 const venueMesh=firstMesh(loaded.venue,'Venue_vertex_palette'),glassMesh=firstMesh(loaded.venue,'Floodlight_glass');
 for(const m of [venueMesh,glassMesh]){warpGeometry(m.geometry,sceneMap);m.material=lambertOf(m.material);m.castShadow=false;m.receiveShadow=false;}
 const crewMesh=firstMesh(loaded.crew,'People');
 warpPieces(crewMesh.geometry,courtMap);crewMesh.material=lambertOf(crewMesh.material);crewMesh.castShadow=false;crewMesh.receiveShadow=false;
 root.add(loaded.venue,loaded.crew);
 // --- a ground under everything (the package ends at its terraces)
 const ground=new T.Mesh(new T.PlaneGeometry(500,500),new T.MeshLambertMaterial({color:'#DBDDC8'}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.82;root.add(ground);
 // --- net: regulation net as shipped (posts at the doubles sticks), felt-ball: both lack metallicFactor, which glTF defaults to 1 (black without a reflection map)
 const netRoot=loaded.net;
 netRoot.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;if(o.material){o.material.metalness=0;}}});
 const wovenNet=firstMesh(netRoot,'Net_woven_mesh');
 // The 1.8 mm cords are far below a pixel from the game camera (25 m away): the woven mesh shimmers as a moire on a phone, so by
 // default the net body is a mipmapped cord texture on one band that follows the same sag, under the package's own tape, posts and strap.
 if(v7.netMesh!==true){
  wovenNet.visible=false;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(18,30,22,.10)';ctx.fillRect(0,0,64,64);ctx.fillStyle='rgba(18,30,22,.85)';ctx.fillRect(0,0,64,2);ctx.fillRect(0,0,2,64);
  const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(12.8/(4*.045),.82/(4*.045));texture.anisotropy=4;
  const band=new T.PlaneGeometry(12.8,.82,64,1),bp=band.attributes.position;
  for(let i=0;i<bp.count;i++){const x=bp.getX(i),top=.85+.156*(x/6.4)**2,t=(bp.getY(i)+.41)/.82;bp.setY(i,.04+t*(top-.04));}
  band.computeVertexNormals();
  const mesh=new T.Mesh(band,new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.02,side:T.DoubleSide,depthWrite:false}));mesh.name='Net_cord_band';mesh.castShadow=false;netRoot.add(mesh);
 }
 root.add(netRoot);
 // --- ball: 67 mm in the package, the game ball is 0.13 m of radius (visible from the camera), same as the previous sphere
 const ball=loaded.ball,ballScale=config.ball.radius/0.0335;ball.scale.setScalar(ballScale);
 ball.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.material.metalness=0;if(/felt/i.test(o.material.name)){o.material.emissive.set('#ABC43E');o.material.emissiveIntensity=.13;}}});
 ball.visible=true;
 // --- crowd: prototypes + 480 instanced placements; the level decides which model and how many
 const proto={lod0:firstMesh(loaded.crowd,'Crowd_LOD0'),cheer:firstMesh(loaded.crowd,'Crowd_Cheer'),lod1:firstMesh(loaded.crowd,'Crowd_LOD1')};
 const timeUniform={value:0},cheerAmount={value:0};
 const seatsPoints=[[-.27,.49,.28],[.27,.49,.28],[.27,.49,-.23],[-.27,.49,-.23],[-.27,.49,-.23],[.27,.49,-.23],[.27,.97,-.23],[-.27,.97,-.23]];
 const seatGeometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(seatsPoints.flat(),3)).setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);seatGeometry.computeVertexNormals();
 const spectators=layout.instances.map((row,id)=>({id,x:row[0],y:row[1],z:sceneMap(row[2]),yaw:row[3],row:row[4],section:layout.sections[row[5]],sec:row[5]}));
 function crowdMaterial(source){
  const mat=lambertOf(source.material,{side:T.DoubleSide});
  mat.onBeforeCompile=shader=>{
   shader.uniforms.crowdTime=timeUniform;
   shader.vertexShader='attribute vec3 instanceTint; attribute float instancePhase; uniform float crowdTime;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nfloat clothMask = step(0.63, position.y) * (1.0-step(1.10, position.y));\nvColor.xyz *= mix(vec3(1.0), instanceTint, clothMask);');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(crowdTime*1.1+instancePhase)*0.018*smoothstep(0.48,1.0,position.y);');
  };
  return mat;
 }
 function crowdMesh(name,source,capacity){
  const geometry=source.geometry.clone();
  geometry.setAttribute('instanceTint',new T.InstancedBufferAttribute(new Float32Array(capacity*3),3));
  geometry.setAttribute('instancePhase',new T.InstancedBufferAttribute(new Float32Array(capacity),1));
  const mesh=new T.InstancedMesh(geometry,crowdMaterial(source),capacity);mesh.name=name;mesh.frustumCulled=false;mesh.count=0;mesh.castShadow=false;mesh.receiveShadow=false;return mesh;
 }
 const detailRows=spectators.filter(s=>s.row===0);
 const meshes={lod1:crowdMesh('Crowd_LOD1',proto.lod1,spectators.length),lod0:crowdMesh('Crowd_LOD0',proto.lod0,detailRows.length),cheer:crowdMesh('Crowd_Cheer',proto.cheer,detailRows.length)};
 const seats=new T.InstancedMesh(seatGeometry,new T.MeshLambertMaterial({color:'#4B6B56',side:T.DoubleSide}),spectators.length);seats.name='Seats';seats.frustumCulled=false;seats.count=0;
 root.add(meshes.lod1,meshes.lod0,meshes.cheer,seats);
 const matrix=new T.Matrix4(),quaternion=new T.Quaternion(),axis=new T.Vector3(0,1,0),one=new T.Vector3(1,1,1),scaleVector=new T.Vector3(CROWD_SCALE,CROWD_SCALE,CROWD_SCALE),position=new T.Vector3(),tint=new T.Color();
 function put(mesh,slot,s,scaled){
  quaternion.setFromAxisAngle(axis,s.yaw);position.set(s.x,s.y,s.z);
  matrix.compose(position,quaternion,scaled?scaleVector:one);mesh.setMatrixAt(slot,matrix);
  if(scaled){tint.set(PALETTE[s.id%PALETTE.length]);mesh.geometry.attributes.instanceTint.setXYZ(slot,tint.r,tint.g,tint.b);mesh.geometry.attributes.instancePhase.setX(slot,s.id*.713);}
 }
 const sets={always:0,burst:0,seatedDetail:0};
 let level=-1,detail=false,clapLeft=0,lastEvent=-1,seatCount=0,crowdKept=0,crowdDrawn=0,time=0;
 // Stands that are wholly outside the camera are not drawn (a portrait phone sees a 10 m wide strip: the side stands are never in it).
 // An InstancedMesh is culled whole, so instead of three draws per stand the lists are rebuilt (480 matrices) when the set of visible
 // stands changes, which happens on a rotation or a resize, not during play.
 const sectionBoxes=layout.sections.map((name,index)=>{
  const box=new T.Box3();for(const s of spectators)if(s.sec===index)box.expandByPoint(position.set(s.x,s.y+FLOOR,s.z));
  box.min.add(position.set(-1.5,-.2,-1.5));box.max.add(position.set(1.5,2.4,1.5));return box;
 });
 const inView=layout.sections.map(()=>true),frustum=new T.Frustum(),projection=new T.Matrix4();
 function cullSections(){
  if(!camera||level<0)return;
  camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
  let changed=false;sectionBoxes.forEach((box,i)=>{const visible=frustum.intersectsBox(box);if(visible!==inView[i]){inView[i]=visible;changed=true;}});
  if(changed)setCrowdLevel(level);
 }
 /** Rebuild the instance lists for `next` (-1 = none). Cheap (480 matrices) and only on a level or visibility change. */
 function setCrowdLevel(next){
  level=next;const on=next>=0,showDetail=next>=2;detail=showDetail;
  const kept=on?spectators.filter(s=>crowdKeeps(next,s.id)):[],drawn=kept.filter(s=>inView[s.sec]);crowdKept=kept.length;
  let slot1=0,seated=[],burst=[],always=[],seatSlot=0;
  for(const s of drawn){
   put(seats,seatSlot++,s,false);
   if(showDetail&&s.row===0){(cheerRole(s.id)==='always'?always:cheerRole(s.id)==='burst'?burst:seated).push(s);}
   else put(meshes.lod1,slot1++,s,true);
  }
  seated.forEach((s,i)=>put(meshes.lod0,i,s,true));burst.forEach((s,i)=>put(meshes.lod0,seated.length+i,s,true));
  always.forEach((s,i)=>put(meshes.cheer,i,s,true));burst.forEach((s,i)=>put(meshes.cheer,always.length+i,s,true));
  Object.assign(sets,{always:always.length,burst:burst.length,seatedDetail:seated.length});
  meshes.lod1.count=slot1;seatCount=seatSlot;seats.count=seatSlot;
  for(const m of [meshes.lod1,meshes.lod0,meshes.cheer,seats])m.instanceMatrix.needsUpdate=true;
  for(const m of [meshes.lod1,meshes.lod0,meshes.cheer]){m.geometry.attributes.instanceTint.needsUpdate=true;m.geometry.attributes.instancePhase.needsUpdate=true;}
  crowdDrawn=drawn.length;applyCheer();
 }
 function applyCheer(){
  const cheering=clapLeft>0;
  meshes.lod0.count=sets.seatedDetail+(cheering?0:sets.burst);
  meshes.cheer.count=sets.always+(cheering?sets.burst:0);
 }
 // --- quality tiers and the frame-time governor (crowd first: it is the cheapest thing to thin)
 const start=crowdStartLevel(v7,quality,params),governor=createCrowdGovernor({level:Math.max(0,start.level),pinned:start.pinned});
 let tier=quality;
 function setQuality(q){
  tier=q;const wanted=crowdStartLevel(v7,q,params);
  const target=wanted.level<0?-1:wanted.pinned?wanted.level:Math.min(wanted.level,governor.level);
  if(target!==level)setCrowdLevel(target);
  crewMesh.visible=q<=(v7.crewMaxQuality??0);
  loaded.venue.visible=true;
 }
 function observe(milliseconds){
  const stepped=governor.observe(milliseconds);
  if(stepped!==null&&level>stepped&&!(crowdStartLevel(v7,tier,params).level<0))setCrowdLevel(stepped);
 }
 function render(state,dt){
  if(state.event.id!==lastEvent){lastEvent=state.event.id;if(['point','game','complete'].includes(state.event.type)&&detail)clapLeft=e.clapSeconds;}
  if(clapLeft>0){clapLeft=Math.max(0,clapLeft-dt);applyCheer();}
  time+=dt;timeUniform.value=level>=1?time:0;
  cullSections();
 }
 const loadedNames=Object.values(files).concat([V7_FILES.layout]).sort();
 function metrics(){
  return {tennisV7:true,v7Surface:surface,surface,crowdLevel:level,crowdGovernorLevel:governor.level,crowd:crowdKept,crowdDrawn,standsInView:inView.filter(Boolean).length,seats:seatCount,
   fullCrowd:detail?sets.seatedDetail+sets.always+sets.burst:0,spriteCrowd:0,crowdDraws:[meshes.lod1,meshes.lod0,meshes.cheer].filter(m=>m.count>0).length+(seats.count>0?1:0),
   loadedModels:loadedNames,missingModels:[],applauding:clapLeft>0,crew:crewMesh.visible,venue:'tennis-v7',venueExternalAssets:0,staticArchitecture:true,
   courtSurface:'tennis-v7-'+surface,courtTexture:[1024,1024],courtPlanar:true,netSag:.914,staticCourtBatches:3,atlasFromFullModels:false};
 }
 /** The lighting the package was designed under (its preview), applied by the view after a successful load. */
 const look={background:'#E7E5D7',fog:'#E7E5D7',hemi:['#EEF4E9','#9E9A77',1.35],sun:['#FFF0D4',2.7,[-13,22,9]],exposure:1.1};
 setQuality(quality);
 return {root,ball,look,setQuality,setCrowdLevel,observe,render,metrics,courtMetrics:()=>({courtSurface:'tennis-v7-'+surface,courtTexture:[1024,1024],courtPlanar:true,netSag:.914,staticCourtBatches:3}),
  get level(){return level;},get governor(){return governor;},
  dispose(){for(const m of [meshes.lod1,meshes.lod0,meshes.cheer,seats])m.dispose?.();}};
}

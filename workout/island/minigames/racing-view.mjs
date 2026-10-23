import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {createRacingScenery} from './racing-scenery.mjs?v=island-play-20261024-1';

const PALETTES={
 coast:{sky:'#b7dfed',fog:'#b9dfe7',sea:'#1eafa9',land:'#68a879',sand:'#e4cda1',curb:'#e77950',rock:'#b8a98a'},
 jungle:{sky:'#b4d7cb',fog:'#9fcbc0',sea:'#318f92',land:'#3b7754',sand:'#829660',curb:'#e4bc63',rock:'#667c60'},
 volcano:{sky:'#d9c6bc',fog:'#cdb5a5',sea:'#346a76',land:'#606455',sand:'#857460',curb:'#f0974c',rock:'#615b55'},
 harbor:{sky:'#b9dfe7',fog:'#bad9df',sea:'#398fba',land:'#80a88a',sand:'#cbc6af',curb:'#58adb8',rock:'#9aa39a'},
 summit:{sky:'#b4d5e5',fog:'#c3dce4',sea:'#547eab',land:'#7f9c84',sand:'#b8c3af',curb:'#628bb6',rock:'#899e9a'},
 ruins:{sky:'#d6dfcc',fog:'#cdd9bd',sea:'#579f9c',land:'#8fa069',sand:'#d3b890',curb:'#c97f58',rock:'#b8a17d'}
};
const rngFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

/** All models and textures stay local. No asset is rewritten or recolored. */
export async function createRacingView(canvas,track,{stage=track.stage,seed=1}={}){
 const colors=PALETTES[track.theme]||PALETTES.coast,night=stage?.timeOfDay==='night',golden=['golden','sunset'].includes(stage?.timeOfDay);
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=night?1.35:1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.info.autoReset=false;
 const scene=new T.Scene(),sky=night?'#263c58':golden?'#e2d3b7':colors.sky;scene.background=new T.Color(sky);scene.fog=new T.Fog(sky,95,360);
 const camera=new T.PerspectiveCamera(64,1,.15,750),resources=new Set(),rnd=rngFor(seed),cars=[],pickups=[],flames=[],foliageParts=[];
 let disposed=false,quality=canvas.clientHeight<500&&(globalThis.devicePixelRatio||1)>1.5?1:0,slow=0,qualityAge=0,frames=0,observer,ready=false,modelLoaded=false,frameMilliseconds=0,cameraReady=false;
 renderer.shadowMap.enabled=quality===0;
 const keep=o=>(resources.add(o),o);
 const mat=(color,extra={})=>keep(new T.MeshStandardMaterial({color,roughness:.82,...extra}));
 const basic=(color,extra={})=>keep(new T.MeshBasicMaterial({color,...extra}));
 const mesh=(g,m,x=0,y=0,z=0,parent=scene)=>{const o=new T.Mesh(keep(g),m);o.position.set(x,y,z);o.receiveShadow=true;parent.add(o);return o;};
 const trackMat=mat('#929b95',{roughness:.96}),ivory=mat('#fff1ce'),curb=mat(colors.curb),steel=mat('#586d6b',{metalness:.55,roughness:.4}),gold=mat('#dfbd70',{metalness:.42,roughness:.35});
 scene.add(new T.HemisphereLight(night?'#9ebbe8':'#eff6f1',colors.land,night?1.7:2.1));
 const sun=new T.DirectionalLight(golden?'#ffcf8e':night?'#c5dbff':'#fff0d4',night?1.8:3.2);sun.position.set(-35,60,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:140});sun.shadow.bias=-.0004;sun.shadow.normalBias=.09;scene.add(sun,sun.target);
 // Real asphalt grain and long directional brush marks, generated once.
 const texCanvas=document.createElement('canvas');texCanvas.width=texCanvas.height=256;const tc=texCanvas.getContext('2d');tc.fillStyle='#778082';tc.fillRect(0,0,256,256);
 for(let i=0;i<5500;i++){const c=80+Math.floor(rnd()*80);tc.fillStyle=`rgba(${c},${c+5},${c+6},.28)`;tc.fillRect(rnd()*256,rnd()*256,1,1+rnd()*3);}
 const asphalt=keep(new T.CanvasTexture(texCanvas));asphalt.wrapS=asphalt.wrapT=T.RepeatWrapping;asphalt.repeat.set(3,track.length/12);asphalt.colorSpace=T.SRGBColorSpace;asphalt.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());trackMat.map=asphalt;
 const steps=Math.ceil(track.length/2),bounds=new T.Box3();track.points.forEach(p=>bounds.expandByPoint(new T.Vector3(p.x,p.y,p.z)));const center=bounds.getCenter(new T.Vector3());
 const scenery=createRacingScenery({T,scene,track,colors,keep,mat,seed,center});scenery.setQuality(quality);
 function ribbon(left,right,material,offset=.02,berm=false){const pos=[],uv=[],ind=[];for(let i=0;i<=steps;i++){const p=track.sample(i/steps*track.length);for(const lane of [left,right]){const y=berm?Math.max(-.6,p.y-3-Math.abs(lane)*.045):p.y+offset;pos.push(p.x+p.normal.x*lane,y,p.z+p.normal.z*lane);uv.push((lane-left)/(right-left),i/steps);}}for(let i=0;i<steps;i++){const j=i*2;ind.push(j,j+2,j+1,j+1,j+2,j+3);}const g=keep(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeVertexNormals();const o=new T.Mesh(g,material);o.receiveShadow=true;scene.add(o);return o;}
 // Banked verges blend the elevated road into an island, with readable edges.
 ribbon(-track.width/2-25,track.width/2+25,scenery.grassMaterial,-.2,true);
 ribbon(-track.width/2-2.1,track.width/2+2.1,mat(colors.sand),-.035);
 ribbon(-track.width/2,track.width/2,trackMat);
 ribbon(-track.width/2+.15,-track.width/2+.30,ivory,.055);ribbon(track.width/2-.30,track.width/2-.15,ivory,.055);
 const sea=mesh(new T.PlaneGeometry(2400,2400),mat(colors.sea,{roughness:.3,metalness:.22}),center.x,-2.2,center.z);sea.rotation.x=-Math.PI/2;
 const shore=mesh(new T.CylinderGeometry(190,205,6,80),mat(colors.sand),center.x,-4,center.z);shore.scale.z=.85;
 const inland=mesh(new T.CylinderGeometry(170,189,4,80),scenery.grassMaterial,center.x,-2.5,center.z);inland.scale.z=.82;
 const terrainGeometry=new T.PlaneGeometry(bounds.max.x-bounds.min.x+100,bounds.max.z-bounds.min.z+100,64,64);terrainGeometry.rotateX(-Math.PI/2);terrainGeometry.translate(center.x,0,center.z);const terrainPosition=terrainGeometry.attributes.position;
 for(let i=0;i<terrainPosition.count;i++){const x=terrainPosition.getX(i),z=terrainPosition.getZ(i),p=track.project(x,z);terrainPosition.setY(i,Math.max(-1.2,p.y-1.2-Math.max(0,p.distance-track.width/2)*.2));}terrainGeometry.computeVertexNormals();const terrain=mesh(terrainGeometry,scenery.grassMaterial);
 const dummy=new T.Object3D();
 function instances(geometry,material,rows){const o=new T.InstancedMesh(keep(geometry),material,rows.length);for(let i=0;i<rows.length;i++){const p=rows[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx||0,p.heading||0,p.rz||0);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);}o.receiveShadow=true;o.castShadow=true;scene.add(o);return o;}
 const curbRows=[[],[]],dashes=[],rails=[],posts=[];
 for(let s=0;s<track.length;s+=3){const p=track.sample(s);for(const sign of [-1,1]){const lane=sign*(track.width/2+.42);curbRows[Math.floor(s/3)%2].push({x:p.x+p.normal.x*lane,y:p.y+.11,z:p.z+p.normal.z*lane,heading:p.heading});if(Math.abs(p.tangent.y)>.027||track.theme==='harbor'){const out=sign*(track.width/2+2.4);rails.push({x:p.x+p.normal.x*out,y:p.y+.95,z:p.z+p.normal.z*out,heading:p.heading});if(Math.floor(s)%9<3)posts.push({x:p.x+p.normal.x*out,y:p.y+.4,z:p.z+p.normal.z*out});}}if(Math.floor(s/3)%3===0)dashes.push({x:p.x,y:p.y+.07,z:p.z,heading:p.heading});}
 curbRows.forEach((rows,i)=>instances(new T.BoxGeometry(.8,.18,3.04),i?ivory:curb,rows));instances(new T.BoxGeometry(.14,.025,3),ivory,dashes);
 instances(new T.BoxGeometry(.15,.28,3.05),steel,rails);instances(new T.CylinderGeometry(.07,.1,.9,5),steel,posts);
 const padMat=mat('#83e2db',{emissive:'#24998d',emissiveIntensity:.6,roughness:.45}),pads=[];
 for(const p of track.boostPads){const root=new T.Group();root.position.set(p.x,p.y+.09,p.z);root.rotation.y=p.heading;scene.add(root);mesh(new T.BoxGeometry(track.width*.52,.06,p.length),padMat,0,0,0,root);for(let j=-1;j<=1;j++){const shape=new T.Shape();shape.moveTo(-2,-.7+j*2.6);shape.lineTo(0,.7+j*2.6);shape.lineTo(2,-.7+j*2.6);shape.lineTo(2,-.05+j*2.6);shape.lineTo(0,1.35+j*2.6);shape.lineTo(-2,-.05+j*2.6);shape.closePath();const a=mesh(new T.ShapeGeometry(shape),ivory,0,.05,0,root);a.rotation.x=-Math.PI/2;}pads.push(root);}
 const cellMat=mat('#ffcd64',{emissive:'#ef9d31',emissiveIntensity:.45,metalness:.6,roughness:.25});
 for(const p of track.pickups){const root=new T.Group();root.position.set(p.x+p.normal.x*p.lane,p.y+1.3,p.z+p.normal.z*p.lane);const cell=mesh(new T.TorusGeometry(.47,.13,6,16),cellMat,0,0,0,root);mesh(new T.OctahedronGeometry(.21),ivory,0,0,0,root);scene.add(root);pickups.push({root,id:p.id,base:root.position.y,cell});}
 function arch(at,label,color='#294f4d'){const p=track.sample(at),root=new T.Group();root.position.set(p.x,p.y,p.z);root.rotation.y=p.heading;scene.add(root);const archMat=mat(color,{roughness:.48,metalness:.2});for(const x of [-track.width/2-.8,track.width/2+.8])mesh(new T.CylinderGeometry(.35,.48,7,8),archMat,x,3.5,0,root);mesh(new T.BoxGeometry(track.width+3,1.4,.7),archMat,0,7,0,root);const c=document.createElement('canvas');c.width=768;c.height=128;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,768,128);g.fillStyle='#fff0ce';g.textAlign='center';g.textBaseline='middle';g.font='bold 64px Arial';g.fillText(label,384,67);const texture=keep(new T.CanvasTexture(c));texture.colorSpace=T.SRGBColorSpace;const sign=mesh(new T.PlaneGeometry(track.width+1,1.5),basic('#fff',{map:texture,side:T.DoubleSide}),0,7,-.4,root);sign.rotation.y=Math.PI;return root;}
 arch(0,'מרוצי האי');arch(track.length*.48,track.name,colors.curb);
 const p0=track.sample(0);for(let i=0;i<12;i++)for(let j=0;j<3;j++){const lane=(i/12-.5)*track.width;const s=track.sample(j*.65);const box=mesh(new T.BoxGeometry(track.width/12,.025,.65),(i+j)%2?ivory:trackMat,s.x+s.normal.x*lane,s.y+.08,s.z+s.normal.z*lane);box.rotation.y=s.heading;}
 // Inland silhouettes establish a coherent island beyond the racing ribbon.
 const rockMat=mat(colors.rock);for(let i=0;i<17;i++){const angle=rnd()*Math.PI*2,radius=80+rnd()*210;const x=center.x+Math.cos(angle)*radius,z=center.z+Math.sin(angle)*radius;if(track.project(x,z).distance<40)continue;const o=mesh(new T.IcosahedronGeometry(1,1),rockMat,x,-2,z);o.scale.set(10+rnd()*16,10+rnd()*27,10+rnd()*15);o.rotation.y=rnd()*6;}
 // Six deliberately different built landmarks, all simple scenic geometry.
 const lm=track.sample(track.length*.28),lx=lm.x+lm.normal.x*29,lz=lm.z+lm.normal.z*29,ly=Math.max(0,lm.y-2),landmark=new T.Group();landmark.position.set(lx,ly,lz);scene.add(landmark);
 if(track.theme==='coast'){
  const tower=mesh(new T.CylinderGeometry(2.5,3.6,24,20),ivory,0,12,0,landmark);tower.castShadow=true;for(const y of [8,17])mesh(new T.CylinderGeometry(2.8-y*.012,3-y*.012,2,20),curb,0,y,0,landmark);mesh(new T.CylinderGeometry(4.3,4.3,.6,20),gold,0,24,0,landmark);mesh(new T.CylinderGeometry(2.5,2.5,4,12),mat('#aadeda',{transparent:true,opacity:.65}),0,26,0,landmark);mesh(new T.ConeGeometry(4,3,20),curb,0,29,0,landmark);
 }else if(track.theme==='jungle'){
  mesh(new T.BoxGeometry(15,22,10),rockMat,0,7,0,landmark);const waterfall=mesh(new T.PlaneGeometry(6,21,1,12),mat('#84dfd6',{transparent:true,opacity:.8,metalness:.28,roughness:.28}),0,8,5.05,landmark);waterfall.rotation.y=.1;mesh(new T.CylinderGeometry(10,12,.5,32),mat('#45b8a5',{roughness:.25}),0,-2,8,landmark);
 }else if(track.theme==='volcano'){
  const volcano=mesh(new T.CylinderGeometry(6,26,32,28,1,true),rockMat,0,11,0,landmark);volcano.castShadow=true;mesh(new T.TorusGeometry(6,1,8,32),mat('#ed8e46',{emissive:'#d55226',emissiveIntensity:.5}),0,27,0,landmark).rotation.x=Math.PI/2;for(let i=0;i<4;i++){const smoke=mesh(new T.SphereGeometry(3+i*1.4,10,8),mat('#a9a298',{transparent:true,opacity:.25-i*.035,depthWrite:false}),i*2,31+i*6,0,landmark);smoke.scale.y=.7;}
 }else if(track.theme==='harbor'){
  for(const x of [-5,5])mesh(new T.BoxGeometry(.8,24,.8),gold,x,12,0,landmark);mesh(new T.BoxGeometry(31,.8,.8),gold,5,24,0,landmark);mesh(new T.BoxGeometry(.8,7,.8),steel,18,20,0,landmark);for(let i=0;i<7;i++){const container=mesh(new T.BoxGeometry(9,3.4,4),mat(['#b66e50','#6d9898','#d4b65a'][i%3]),(i%3)*10-9,1.7+Math.floor(i/3)*3.5,-9,landmark);container.castShadow=true;}
 }else if(track.theme==='summit'){
  for(let i=0;i<3;i++){mesh(new T.BoxGeometry(2,25,2),ivory,(i-1)*13,8,-6,landmark);mesh(new T.BoxGeometry(13,1,4),steel,(i-1)*13,21,-6,landmark);}const peak=mesh(new T.ConeGeometry(27,58,7),rockMat,20,20,-25,landmark);mesh(new T.ConeGeometry(12,24,7),ivory,20,37,-25,landmark);
 }else{
  for(let i=0;i<6;i++)mesh(new T.CylinderGeometry(.8,1.1,10,12),ivory,(i%3)*5-5,5,Math.floor(i/3)*7-3.5,landmark);mesh(new T.BoxGeometry(14,1.1,12),mat('#bd9064'),0,10.5,0,landmark);const roof=mesh(new T.ConeGeometry(10,4,4),curb,0,13,0,landmark);roof.rotation.y=Math.PI/4;mesh(new T.BoxGeometry(17,.8,15),rockMat,0,.4,0,landmark);
 }
 // Reuse GLB meshes with instancing: texture/material identity is retained.
 function ownAsset(root){root.updateMatrixWorld(true);root.traverse(o=>{if(o.isMesh){keep(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){keep(m);for(const v of Object.values(m))if(v?.isTexture)keep(v);}}});}
 async function loadAsset(path){const asset=await new GLTFLoader().loadAsync(new URL(path+'?v=island-play-20261024-1',import.meta.url).href);ownAsset(asset.scene);return asset.scene;}
 function plant(source,rows,height){const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=height/size.y,base=new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);source.traverse(o=>{if(!o.isMesh)return;const inst=new T.InstancedMesh(o.geometry,o.material,rows.length),part=o.matrixWorld.clone(),matrices=[];for(let i=0;i<rows.length;i++){const p=rows[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.heading,0);dummy.scale.setScalar(1);dummy.updateMatrix();const fit=new T.Matrix4().makeScale(scale*p.size,scale*p.size,scale*p.size).multiply(base).multiply(part);matrices.push(dummy.matrix.clone().multiply(fit));}inst.count=0;inst.frustumCulled=false;inst.castShadow=true;inst.receiveShadow=true;foliageParts.push({inst,matrices});scene.add(inst);});}
 const treeRows=[];for(let s=14;s<track.length;s+=17){const p=track.sample(s);for(const sign of [-1,1]){const lane=sign*(track.width/2+5+rnd()*10);treeRows.push({x:p.x+p.normal.x*lane,y:p.y-1.6,z:p.z+p.normal.z*lane,heading:rnd()*6.28,size:.7+rnd()*.6});}}
 const failures=[];
 const [carAsset,treeAsset]=await Promise.all([
  loadAsset('../assets/models/car-a-512.glb').catch(e=>{failures.push('car');return null;}),
  loadAsset(track.theme==='jungle'||track.theme==='summit'?'../assets/ultra-fire/tree-a-512.glb':'../assets/models/palm-tree-512.glb').catch(e=>{failures.push('vegetation');return null;})
 ]);
 if(disposed){for(const r of resources)r.dispose?.();renderer.dispose();return {dispose(){},render(){},metrics:()=>({disposed:true})};}
 if(treeAsset)plant(treeAsset,treeRows,track.theme==='jungle'?11:8);
 // Car original GLB keeps its baked PBR surface. Racing identity comes from
 // independent number plates, tail lamps, working rolling wheels and exhaust.
 const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=64;const cc=contactCanvas.getContext('2d'),gr=cc.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(13,29,29,.6)');gr.addColorStop(1,'rgba(13,29,29,0)');cc.fillStyle=gr;cc.fillRect(0,0,64,64);const contactMap=keep(new T.CanvasTexture(contactCanvas));
 const carColors=['#f3c65d','#5ecab6','#cc6c62','#8e9bdb','#e7e2c8'];
 for(let i=0;i<5;i++){
  const root=new T.Group(),body=new T.Group();root.add(body);scene.add(root);const wheels=[];
  if(carAsset){const original=carAsset.clone(true);original.rotation.y=Math.PI/2;const box=new T.Box3().setFromObject(original),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3()),fit=new T.Group();original.position.set(-c.x,-box.min.y,-c.z);fit.scale.set(2.25/size.x,1.5/size.y,4.2/size.z);fit.add(original);body.add(fit);original.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});modelLoaded=true;}
  else{const shell=mesh(new T.CapsuleGeometry(.85,2.1,6,12),mat(carColors[i],{metalness:.4,roughness:.28}),0,.8,0,body);shell.rotation.x=Math.PI/2;mesh(new T.SphereGeometry(.8,16,10),mat('#294c58',{metalness:.3,roughness:.2}),0,1.3,-.1,body);}
  const accent=mat(carColors[i],{metalness:.3,roughness:.35});mesh(new T.BoxGeometry(2.45,.12,.48),accent,0,1.3,-1.65,body);for(const x of [-.75,.75])mesh(new T.BoxGeometry(.10,.48,.14),steel,x,1.04,-1.65,body);mesh(new T.BoxGeometry(2.2,.12,.32),accent,0,.23,1.95,body);for(const x of [-.85,.85]){mesh(new T.BoxGeometry(.36,.17,.08),mat('#fe6d48',{emissive:'#ff3924',emissiveIntensity:.6}),x,.66,-2.13,body);const f=mesh(new T.ConeGeometry(.19,1.05,6),basic('#73ebdf',{transparent:true,opacity:.85}),x*.6,.38,-2.55,body);f.rotation.x=-Math.PI/2;f.visible=false;flames.push({mesh:f,index:i});}
  // Small wheel sidewalls roll around X. Existing GLB wheels remain intact.
  const tire=mat('#263339'),rim=mat('#d9dfda',{metalness:.85,roughness:.24});for(const x of [-1.05,1.05])for(const z of [-1.27,1.26]){const wheel=new T.Group();wheel.position.set(x,.4,z);const t=mesh(new T.CylinderGeometry(.38,.38,.14,18),tire,0,0,0,wheel);t.rotation.z=Math.PI/2;const hub=mesh(new T.TorusGeometry(.24,.035,4,12),rim,x>0?.09:-.09,0,0,wheel);hub.rotation.y=Math.PI/2;for(let j=0;j<5;j++){const spoke=mesh(new T.BoxGeometry(.04,.045,.44),rim,x>0?.1:-.1,0,0,wheel);spoke.rotation.x=j*Math.PI/5;}root.add(wheel);wheels.push(wheel);}
  const plate=mesh(new T.PlaneGeometry(.68,.35),basic(carColors[i],{side:T.DoubleSide}),0,1.2,-2.14,body);plate.rotation.y=Math.PI;
  const shadow=mesh(new T.PlaneGeometry(4,6),basic('#fff',{map:contactMap,transparent:true,depthWrite:false}),0,0,0);shadow.rotation.x=-Math.PI/2;
  const beacon=mesh(new T.ConeGeometry(.18,.35,4),basic(carColors[i]),0,3,0,root);beacon.rotation.z=Math.PI;
  cars.push({root,body,wheels,shadow,beacon});
 }
 const camTarget=new T.Vector3(),desired=new T.Vector3(),look=new T.Vector3(),carPosition=new T.Vector3(),cameraOffset=new T.Vector3(),lookOffset=new T.Vector3();
 function resize(){if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,[1.7,1.25,1][quality]));renderer.setSize(w,h,false);}
 observer=new ResizeObserver(resize);observer.observe(canvas);resize();ready=true;
 function observeFrame(ms){if(!ms||ms>250)return;frameMilliseconds=ms;qualityAge+=ms;slow=ms>30?slow+1:Math.max(0,slow-1);if(slow>65&&qualityAge>6000&&quality<2){quality++;slow=0;qualityAge=0;renderer.shadowMap.enabled=quality===0;scenery.setQuality(quality);resize();}}
 function updateVegetation(player){const forwardX=Math.sin(player.heading),forwardZ=Math.cos(player.heading),radius=[140,110,85][quality];const selected=treeRows.map((p,index)=>({index,distance:Math.hypot(p.x-player.x,p.z-player.z),forward:(p.x-player.x)*forwardX+(p.z-player.z)*forwardZ})).filter(p=>p.distance<radius&&p.forward>-16).sort((a,b)=>a.distance-b.distance).slice(0,[28,18,10][quality]);for(const {inst,matrices}of foliageParts){selected.forEach((p,index)=>inst.setMatrixAt(index,matrices[p.index]));inst.count=selected.length;inst.instanceMatrix.needsUpdate=true;}}
 function render(state,dt=0){if(disposed||!ready)return;frames++;const data=state.cars||[state.player];data.forEach((c,i)=>{const car=cars[i];if(!car)return;car.root.visible=i===0||(c.x-state.player.x)*Math.sin(state.player.heading)+(c.z-state.player.z)*Math.cos(state.player.heading)>-3.5;car.shadow.visible=car.root.visible;car.root.position.set(c.x,c.y+.10,c.z);car.root.rotation.y=c.heading;car.body.rotation.z=-(c.steer||0)*Math.min(c.speed/100,.13);car.body.rotation.y=(c.driftCharge>0?(c.steer||0)*.16:0);car.wheels.forEach(w=>w.rotation.x-=c.speed*dt/.38);car.shadow.position.set(c.x,c.y+.07,c.z);car.shadow.rotation.z=c.heading;car.beacon.visible=i>0;});flames.forEach(f=>{const c=data[f.index];f.mesh.visible=!!c?.boosting;f.mesh.scale.y=.8+Math.sin(state.time*38)*.2;});
  const player=state.player||data[0],p=track.sample(player.s||0),forward=new T.Vector3(Math.sin(player.heading),0,Math.cos(player.heading)),speed=Math.min(1,player.speed/45),ahead=track.sample((player.s||0)+15);
  desired.set(player.x-forward.x*(7.1+speed*.5),player.y+3.1+speed*.15,player.z-forward.z*(7.1+speed*.5));const ground=track.project(desired.x,desired.z);desired.y=Math.max(desired.y,ground.y+1.7);
  look.set(player.x+forward.x*(6+speed*.7),player.y+1.25,player.z+forward.z*(6+speed*.7));look.x=look.x*.94+ahead.x*.06;look.z=look.z*.94+ahead.z*.06;
  // Follow translation without speed-dependent lag; smooth only the relative
  // boom/aim. A world-position lerp moved the camera six metres back at speed.
  carPosition.set(player.x,player.y,player.z);desired.sub(carPosition);look.sub(carPosition);
  if(!cameraReady){cameraOffset.copy(desired);lookOffset.copy(look);cameraReady=true;}else{cameraOffset.lerp(desired,1-Math.exp(-dt*7));lookOffset.lerp(look,1-Math.exp(-dt*9));}camera.position.copy(carPosition).add(cameraOffset);camTarget.copy(carPosition).add(lookOffset);camera.lookAt(camTarget);camera.fov=64+speed*5+(player.boosting?3:0);camera.updateProjectionMatrix();sun.position.set(player.x-35,player.y+60,player.z+25);sun.target.position.set(player.x,player.y,player.z);
  updateVegetation(player);pickups.forEach((p,i)=>{const live=state.collectibles?.find?.(x=>x.id===p.id);p.root.visible=!live||!(live.cooldown>0||live.active===false);p.root.rotation.y=state.time*1.6+i;p.root.position.y=p.base+Math.sin(state.time*2+i)*.15;});renderer.info.reset();renderer.render(scene,camera);
 }
 function dispose(){if(disposed)return;disposed=true;observer?.disconnect();sun.shadow.dispose();scenery.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const r of resources)r.dispose?.();resources.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();}
 return {render,observeFrame,dispose,metrics:()=>({mode:'webgl',quality,frames,frameMilliseconds,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,countsIncludeShadowPasses:true,shadowsEnabled:renderer.shadowMap.enabled,visibleTrees:foliageParts[0]?.inst.count||0,treeLimit:[28,18,10][quality],scenery:scenery.metrics(),modelLoaded,vegetationLoaded:!!treeAsset,failures,disposed,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures})};
}

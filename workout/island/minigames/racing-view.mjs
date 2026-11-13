import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {createRacingScenery} from './racing-scenery.mjs?v=island-v2-20261107-12';
import {createRacingEffects} from './racing-effects.mjs?v=island-v2-20261107-12';
import {v7Enabled} from './racing-v7.mjs';
import {createRacingF1, racingLookEnabled} from './racing-f1.mjs';
import {envV2Enabled, loadEnvV2, buildEnvV2, bake as envBake} from './racing-env-v2.mjs';
import {tunePaint, tuneMaterial, dressCar, createStandIn, createSpeedLines, CAR_COLORS, CAR_NUMBERS, teamOf} from './racing-car-look.mjs';

const PALETTES={
 coast:{sky:'#b7dfed',fog:'#b9dfe7',sea:'#1eafa9',land:'#68a879',sand:'#e4cda1',curb:'#e77950',rock:'#b8a98a'},
 jungle:{sky:'#b4d7cb',fog:'#9fcbc0',sea:'#318f92',land:'#3b7754',sand:'#829660',curb:'#e4bc63',rock:'#667c60'},
 volcano:{sky:'#d9c6bc',fog:'#cdb5a5',sea:'#346a76',land:'#606455',sand:'#857460',curb:'#f0974c',rock:'#615b55'},
 harbor:{sky:'#b9dfe7',fog:'#bad9df',sea:'#398fba',land:'#80a88a',sand:'#cbc6af',curb:'#58adb8',rock:'#9aa39a'},
 summit:{sky:'#b4d5e5',fog:'#c3dce4',sea:'#547eab',land:'#7f9c84',sand:'#b8c3af',curb:'#628bb6',rock:'#899e9a'},
 ruins:{sky:'#d6dfcc',fog:'#cdd9bd',sea:'#579f9c',land:'#8fa069',sand:'#d3b890',curb:'#c97f58',rock:'#b8a17d'}
};
const rngFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

/** Local assets only. Meshy originals stay unchanged; the attributed sports
 * coupe has prepared geometry and separate paint materials for each racer. */
export async function createRacingView(canvas,track,{stage=track.stage,seed=1,v7:v7Config=null,lite=false,cars:carInfo=null}={}){
 // v7 (design/racing-v7): five cars with LODs, spectators, props, asphalt maps, tire-smoke sprite. Off with ?racingV7=0 or v7.enabled=false;
 // any load problem keeps the previous coupe, trees and procedural textures (see the v7 block below the ribbons).
 const v7On=v7Enabled(v7Config,new URLSearchParams(globalThis.location?.search||''));let v7=null,v7Reason=v7On?'':'off';
 const colors=PALETTES[track.theme]||PALETTES.coast,night=stage?.timeOfDay==='night',golden=['golden','sunset'].includes(stage?.timeOfDay);
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=night?1.12:1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.info.autoReset=false;
 const scene=new T.Scene(),sky=night?'#233649':golden?'#c6bbab':colors.sky;scene.background=new T.Color(sky);scene.fog=new T.Fog(sky,135,480);
 const camera=new T.PerspectiveCamera(64,1,.15,750),resources=new Set(),rnd=rngFor(seed),cars=[],pickups=[],flames=[],foliageParts=[];
 let disposed=false,quality=canvas.clientHeight<500&&(globalThis.devicePixelRatio||1)>1.5?1:0,slow=0,qualityAge=0,frames=0,observer,ready=false,modelLoaded=false,frameMilliseconds=0,cameraReady=false,previousSpeed=0,cameraKick=0,carAssetName='fallback';
 let shakeT=0,shakeA=0;const lowCamera=new URLSearchParams(globalThis.location?.search||'').get('racingCam')!=='0';const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
 renderer.shadowMap.enabled=quality===0;
 const keep=o=>(resources.add(o),o);
 const mat=(color,extra={})=>keep(new T.MeshStandardMaterial({color,roughness:.82,...extra}));
 const basic=(color,extra={})=>keep(new T.MeshBasicMaterial({color,...extra}));
 const mesh=(g,m,x=0,y=0,z=0,parent=scene)=>{const o=new T.Mesh(keep(g),m);o.position.set(x,y,z);o.receiveShadow=true;parent.add(o);return o;};
 const trackMat=mat('#aab2b7',{roughness:night?.63:.86,metalness:.04}),ivory=mat('#e3e7e5'),curb=mat(new URLSearchParams(globalThis.location?.search||'').get('racingLook')!=='0'&&track.f1?'#d3232b':colors.curb),steel=mat('#58646b',{metalness:.65,roughness:.36}),gold=mat('#d0b26d',{metalness:.42,roughness:.35});
 scene.add(new T.HemisphereLight(night?'#91a9d4':'#d4e6f1',night?'#253344':'#495b43',night?.75:.95));
 const sun=new T.DirectionalLight(golden?'#ffd0a0':night?'#b6d5ff':'#fff0dc',night?1.15:2.4);sun.position.set(-35,60,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:140});sun.shadow.bias=-.0004;sun.shadow.normalBias=.09;scene.add(sun,sun.target);
 // A local environment map gives the coupe real PBR reflections, without an
 // external HDR dependency or another scene render on every frame.
 const environmentCanvas=document.createElement('canvas');environmentCanvas.width=512;environmentCanvas.height=256;const ec=environmentCanvas.getContext('2d'),eg=ec.createLinearGradient(0,0,0,256);eg.addColorStop(0,night?'#15253f':golden?'#668498':'#6e9ab5');eg.addColorStop(.45,night?'#607da0':golden?'#f2d1a8':'#daedf2');eg.addColorStop(.5,night?'#344458':'#d1d7d2');eg.addColorStop(.57,night?'#111820':'#4e5e52');eg.addColorStop(1,'#141d23');ec.fillStyle=eg;ec.fillRect(0,0,512,256);ec.fillStyle=night?'#bedfff':'#fff3d7';ec.fillRect(90,55,58,15);ec.fillStyle=night?'#597c96':'#d3dfe2';ec.fillRect(350,75,35,25);
 const environmentMap=new T.CanvasTexture(environmentCanvas);environmentMap.colorSpace=T.SRGBColorSpace;environmentMap.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer),environmentTarget=keep(pmrem.fromEquirectangular(environmentMap));scene.environment=environmentTarget.texture;environmentMap.dispose();pmrem.dispose();
 const backdropCanvas=document.createElement('canvas');backdropCanvas.width=8;backdropCanvas.height=256;const bc=backdropCanvas.getContext('2d'),bg=bc.createLinearGradient(0,0,0,256);bg.addColorStop(0,night?'#091729':golden?'#647c90':'#6699b8');bg.addColorStop(.72,sky);bg.addColorStop(1,sky);bc.fillStyle=bg;bc.fillRect(0,0,8,256);const backdrop=keep(new T.CanvasTexture(backdropCanvas));backdrop.colorSpace=T.SRGBColorSpace;const skyMaterial=basic('#ffffff',{map:backdrop,depthTest:false,depthWrite:false,fog:false});skyMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','gl_Position = vec4(position.xy, 0.999999, 1.0);');};const skyPlane=mesh(new T.PlaneGeometry(2,2),skyMaterial);skyPlane.frustumCulled=false;skyPlane.renderOrder=-1000;
 // Real asphalt grain and long directional brush marks, generated once (skipped when the v7 asphalt maps replace it).
 function canvasAsphalt(random){
 const texCanvas=document.createElement('canvas');texCanvas.width=texCanvas.height=256;const tc=texCanvas.getContext('2d');tc.fillStyle='#51575b';tc.fillRect(0,0,256,256);
 for(let i=0;i<14000;i++){const c=50+Math.floor(random()*100);tc.fillStyle=`rgba(${c},${c+2},${c+4},.48)`;tc.fillRect(random()*256,random()*256,1,1+random()*2);}
 const asphalt=keep(new T.CanvasTexture(texCanvas));asphalt.wrapS=asphalt.wrapT=T.RepeatWrapping;asphalt.repeat.set(3,track.length/12);asphalt.colorSpace=T.SRGBColorSpace;asphalt.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());trackMat.map=asphalt;
 trackMat.bumpMap=asphalt;trackMat.bumpScale=.022;
 }
 // the island's rocks and trees draw from the same sequence: v7 skips the grain but burns its draws, so the layout stays the same
 if(!v7On)canvasAsphalt(rnd);else for(let i=0;i<56000;i++)rnd();
 const steps=Math.ceil(track.length/2),bounds=new T.Box3();track.points.forEach(p=>bounds.expandByPoint(new T.Vector3(p.x,p.y,p.z)));const center=bounds.getCenter(new T.Vector3());
 const scenery=createRacingScenery({T,scene,track,colors,keep,mat,seed,center});scenery.setQuality(quality);
 // racing-deep-m7: the crash show flag (?racingCrashFx=0 = the m2 roll on the spot, no debris, no camera pull-back)
 const crashFxOn=new URLSearchParams(globalThis.location?.search||'').get('racingCrashFx')!=='0';let crashZoom=0;
 const effects=createRacingEffects({T,scene,track,keep,night,carColors:CAR_COLORS,crashFx:crashFxOn});
 // racing-look-v1: Formula 1 trackside (run-off, gravel, tyre walls, pit building, start lights) on the F1 circuits only; ?racingLook=0 skips it
 const lookOn=racingLookEnabled(),f1Look=lookOn&&track.f1?createRacingF1({T,scene,track,keep,night}):null;
 const vergeHeight=(y,distance)=>Math.max(-1.2,y-.07-Math.max(0,distance-track.width/2-2.1)*.18);
 const carGround=c=>Math.abs(c.lateral||0)>track.width/2+2.1?vergeHeight(c.y,Math.abs(c.lateral)):c.y;
 function ribbon(left,right,material,offset=.02,berm=false){const pos=[],uv=[],ind=[];for(let i=0;i<=steps;i++){const p=track.sample(i/steps*track.length);for(const lane of [left,right]){const y=berm?vergeHeight(p.y,Math.abs(lane)):p.y+offset;pos.push(p.x+p.normal.x*lane,y,p.z+p.normal.z*lane);uv.push((lane-left)/(right-left),i/steps);}}for(let i=0;i<steps;i++){const j=i*2;ind.push(j,j+2,j+1,j+1,j+2,j+3);}const g=keep(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeVertexNormals();const o=new T.Mesh(g,material);o.receiveShadow=true;scene.add(o);return o;}
 // Banked verges blend the elevated road into an island, with readable edges.
 ribbon(-track.width/2-25,-track.width/2-2.1,scenery.grassMaterial,-.2,true);ribbon(track.width/2+2.1,track.width/2+25,scenery.grassMaterial,-.2,true);
 ribbon(-track.width/2-2.1,track.width/2+2.1,mat(colors.sand),-.035);
 ribbon(-track.width/2,track.width/2,trackMat);
 ribbon(-track.width/2+.15,-track.width/2+.30,ivory,.055);ribbon(track.width/2-.30,track.width/2-.15,ivory,.055);
 const sea=mesh(new T.PlaneGeometry(2400,2400),mat(colors.sea,{roughness:.3,metalness:.22}),center.x,-2.2,center.z);sea.rotation.x=-Math.PI/2;
 // Keep the island under the complete longer circuit, including its verges
 // and roadside buildings; the road width and car scale stay in real metres.
 const shoreRadius=Math.max(190,...track.points.map(p=>Math.hypot(p.x-center.x,(p.z-center.z)/.85)+50)),inlandRadius=Math.max(170,...track.points.map(p=>Math.hypot(p.x-center.x,(p.z-center.z)/.82)+26));
 const shore=mesh(new T.CylinderGeometry(shoreRadius,shoreRadius+15,6,80),mat(colors.sand),center.x,-4,center.z);shore.scale.z=.85;
 const inland=mesh(new T.CylinderGeometry(inlandRadius,inlandRadius+19,4,80),scenery.grassMaterial,center.x,-2.5,center.z);inland.scale.z=.82;
 const terrainGeometry=new T.PlaneGeometry(bounds.max.x-bounds.min.x+100,bounds.max.z-bounds.min.z+100,64,64);terrainGeometry.rotateX(-Math.PI/2);terrainGeometry.translate(center.x,0,center.z);const terrainPosition=terrainGeometry.attributes.position;
 for(let i=0;i<terrainPosition.count;i++){const x=terrainPosition.getX(i),z=terrainPosition.getZ(i),p=track.project(x,z);terrainPosition.setY(i,vergeHeight(p.y,p.distance)-.2);}terrainGeometry.computeVertexNormals();const terrain=mesh(terrainGeometry,scenery.grassMaterial);
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
 arch(0,'מרוצי העיר');arch(track.length*.48,track.name,colors.curb);
 const p0=track.sample(0);for(let i=0;i<12;i++)for(let j=0;j<3;j++){const lane=(i/12-.5)*track.width;const s=track.sample(j*.65);const box=mesh(new T.BoxGeometry(track.width/12,.025,.65),(i+j)%2?ivory:trackMat,s.x+s.normal.x*lane,s.y+.08,s.z+s.normal.z*lane);box.rotation.y=s.heading;}
 // racing-deep-m2 grid markings: for every car a painted slot (a bar across the front and a bar along the inner side, one instanced mesh) and a "P1".."P12" label from one
 // canvas atlas (one merged mesh): two draw calls for the whole grid. ?racingGrid=0 (the old line-up) paints nothing.
 const gridCount=Math.max(5,Math.min(12,carInfo?.length||5));
 if(new URLSearchParams(globalThis.location?.search||'').get('racingGrid')!=='0'&&track.gridSlots){
  const slots=track.gridSlots(gridCount),bars=[],atlas=document.createElement('canvas');atlas.width=1024;atlas.height=64;const ac=atlas.getContext('2d');ac.fillStyle='#f4f5f2';ac.font='bold 48px system-ui,sans-serif';ac.textAlign='center';ac.textBaseline='middle';
  const labelGeo=[],labelPos=[],labelUv=[],labelIdx=[];
  slots.forEach((slot,i)=>{const q=track.sample(slot.s+2.6),inner=-Math.sign(slot.lane)||1;
   bars.push({x:q.x+q.normal.x*slot.lane,y:q.y+.065,z:q.z+q.normal.z*slot.lane,heading:q.heading,sx:2.6,sy:.02,sz:.16});
   const along=track.sample(slot.s+.6);bars.push({x:along.x+along.normal.x*(slot.lane+inner*1.3),y:along.y+.065,z:along.z+along.normal.z*(slot.lane+inner*1.3),heading:along.heading,sx:.16,sy:.02,sz:4});
   ac.fillText('P'+(i+1),(i%12)*85+42,32);
   const l=track.sample(slot.s-1.9),cx=l.x+l.normal.x*slot.lane,cz=l.z+l.normal.z*slot.lane,hx=l.normal.x,hz=l.normal.z,fx=l.tangent.x,fz=l.tangent.z,w=1.1,h=.75,base=labelPos.length/3;
   // quad in the road plane, text reading toward the driver (nose forward = +tangent)
   for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){labelPos.push(cx+hx*u*w/2*-1+fx*v*h/2,l.y+.07,cz+hz*u*w/2*-1+fz*v*h/2);labelUv.push(((i%12)*85+42+u*40)/1024,(1+v)/2);}
   labelIdx.push(base,base+1,base+2,base,base+2,base+3);});
  instances(new T.BoxGeometry(1,1,1),ivory,bars);
  const lg=keep(new T.BufferGeometry());lg.setAttribute('position',new T.Float32BufferAttribute(labelPos,3));lg.setAttribute('uv',new T.Float32BufferAttribute(labelUv,2));lg.setIndex(labelIdx);lg.computeVertexNormals();
  const at=keep(new T.CanvasTexture(atlas));at.colorSpace=T.SRGBColorSpace;const labels=new T.Mesh(lg,basic('#fff',{map:at,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));labels.renderOrder=2;scene.add(labels);
 }
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
 async function loadAsset(path){const asset=await new GLTFLoader().loadAsync(new URL(path+'?v=island-v2-20261107-12',import.meta.url).href);ownAsset(asset.scene);return asset.scene;}
 function plant(source,rows,height){const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=height/size.y,base=new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);source.traverse(o=>{if(!o.isMesh)return;const inst=new T.InstancedMesh(o.geometry,o.material,rows.length),part=o.matrixWorld.clone(),matrices=[];for(let i=0;i<rows.length;i++){const p=rows[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.heading,0);dummy.scale.setScalar(1);dummy.updateMatrix();const fit=new T.Matrix4().makeScale(scale*p.size,scale*p.size,scale*p.size).multiply(base).multiply(part);matrices.push(dummy.matrix.clone().multiply(fit));}inst.count=0;inst.frustumCulled=false;inst.castShadow=true;inst.receiveShadow=true;foliageParts.push({inst,matrices});scene.add(inst);});}
 const treeRows=[];for(let s=14;s<track.length;s+=17){const p=track.sample(s);for(const sign of [-1,1]){const lane=sign*(track.width/2+5+rnd()*10);treeRows.push({x:p.x+p.normal.x*lane,y:p.y-1.6,z:p.z+p.normal.z*lane,heading:rnd()*6.28,size:.7+rnd()*.6});}}
 const failures=[];
 // v7: load and check everything first (all or nothing), build detached from the scene, and only then attach. Any failure here
 // leaves the scene exactly as the previous assets expect it.
 if(v7On){
  let pack=null,assets=null;
  try{
   assets=await import('./racing-v7-assets.mjs');
   pack=await assets.loadRacingV7Pack({base:new URL(v7Config.base||'assets/racing-v7/',new URL('../',import.meta.url)),anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
   if(disposed){assets.disposePack(pack);pack=null;}
   else{
    const parts=assets.buildRacingV7(pack,{track,seed,groundAt:(x,z)=>{const p=track.project(x,z);return vergeHeight(p.y,p.distance)-.08;}});
    for(const r of parts.resources())keep(r);
    v7={assets,pack,parts};
   }
  }catch(error){
   v7=null;v7Reason=String(error?.message||error).slice(0,200);failures.push('v7');
   if(pack)assets.disposePack(pack);
  }
  if(v7){
   assets.applyAsphalt(trackMat,pack,track,{night,normal:quality===0});
   effects.setSmokeMap(v7.parts.smokeMap);
   scene.add(v7.parts.standGroup,v7.parts.crowd.group);carAssetName='racing-v7';
  }else if(!disposed)canvasAsphalt(rngFor(seed^0xa5a5));
 }
 // racing-env-v2: Codex trackside models and textures on the F1 circuits (?racingEnv=v1 or any load problem keeps the procedural trackside)
 let envV2=null,gantry=null,gantryModel=null,artMod=null;
 // racing-broadcast-v1: Codex start gantry (five lamps that follow the start lights). ?racingBroadcastArt=0 or any load problem keeps the env-v2 gantry.
 if(f1Look&&envV2Enabled()&&!disposed){try{artMod=await import('./racing-broadcast-art.mjs?v=island-v2-20261107-12');if(artMod.broadcastArtEnabled())gantryModel=await artMod.loadGantry({GLTFLoader});}catch(e){gantryModel=null;failures.push('broadcast-art');console.warn('broadcast art',e?.message||e);}}
 if(f1Look&&envV2Enabled()&&!disposed){try{const kit=await loadEnvV2({T,GLTFLoader,anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy())});if(!disposed){envV2=buildEnvV2({T,scene,track,keep,f1:f1Look,kit,night,skip:gantryModel?['start-gantry']:[]});if(gantryModel)try{gantry=artMod.buildGantry({T,scene,track,keep,f1:f1Look,model:gantryModel,bake:envBake});}catch(e){failures.push('gantry');console.warn('gantry',e?.message||e);}}}catch(e){failures.push('env-v2');console.warn('env v2',e?.message||e);}}
 // racing-crash-fx-v1: Codex spark and dust atlases, six body fragments and a formula tyre for the crash show (?racingCrashAssets=0 or any load problem keeps the boxes and cylinder)
 let crashAssets=false;
 if(crashFxOn&&!disposed){const crashMod=await import('./racing-crash-assets.mjs?v=island-v2-20261107-12');if(crashMod.crashAssetsEnabled()){try{const pack=await crashMod.loadCrashAssets({T,GLTFLoader});if(!disposed)crashAssets=effects.setCrashAssets(pack);}catch(e){failures.push('crash-fx');console.warn('crash fx',e?.message||e);}}}
 let carAsset=null,lowCarAsset=null,treeAsset=null;
 // racing-v11 formula car (Codex asset, 11,868 triangles, no Draco): all five cars, or the player only at low quality. ?racingFormulaCar=0 disables it; any failure keeps the previous cars.
 // Weak device or lite restart (ctx.lite): the previous cars, no 11.8K-triangle formula model at all. ?racingFormulaCar=1 forces it back on, =0 off.
const formulaFlag=new URLSearchParams(globalThis.location?.search||'').get('racingFormulaCar');
const formulaOn=formulaFlag==='1'||(formulaFlag!=='0'&&!lite);
const FORMULA_CARS=3; // the player and the two nearest rivals; the other cars keep the light model (fewer triangles and draw calls)
 const formulaAsset=formulaOn&&!disposed?await loadAsset('../assets/racing-formula/formula.glb').then(mergeFormula).catch(e=>{console.warn('formula',e?.message||e);failures.push('formula');return null;}):null;
 // 40 primitives per car would cost 200 draw calls for five cars: every static part is merged per material once (wheels stay separate nodes so they can spin and steer).
 function mergeFormula(scene){
  scene.updateMatrixWorld(true);const groups=new Map(),wheelsList=[],out=new T.Group();out.name='Formula';
  scene.traverse(o=>{if(/^Wheel(Front|Rear)[LR]$/.test(o.name))wheelsList.push(o);});
  const inWheel=o=>{for(let n=o;n;n=n.parent)if(wheelsList.includes(n))return true;return false;};
  scene.traverse(o=>{if(!o.isMesh||inWheel(o))return;
   const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);const mats=Array.isArray(o.material)?o.material:[o.material];
   if(Array.isArray(o.material)){for(const group of geometry.groups||[]){}}
   const key=mats[0].uuid;let entry=groups.get(key);if(!entry){entry={material:mats[0],parts:[]};groups.set(key,entry);}entry.parts.push(geometry);});
  for(const {material,parts} of groups.values()){
   const merged=new T.BufferGeometry(),indexed=parts.every(g=>g.index);let offset=0;const position=[],normal=[],uv=[],index=[];
   for(const g of parts){const pos=g.attributes.position,nor=g.attributes.normal,tex=g.attributes.uv;for(let i=0;i<pos.count;i++){position.push(pos.getX(i),pos.getY(i),pos.getZ(i));if(nor)normal.push(nor.getX(i),nor.getY(i),nor.getZ(i));if(tex)uv.push(tex.getX(i),tex.getY(i));}
    if(g.index)for(let i=0;i<g.index.count;i++)index.push(g.index.getX(i)+offset);else for(let i=0;i<pos.count;i++)index.push(i+offset);offset+=pos.count;}
   merged.setAttribute('position',new T.Float32BufferAttribute(position,3));if(normal.length)merged.setAttribute('normal',new T.Float32BufferAttribute(normal,3));else merged.computeVertexNormals();if(uv.length===position.length/3*2)merged.setAttribute('uv',new T.Float32BufferAttribute(uv,2));merged.setIndex(index);
   const mesh=new T.Mesh(merged,material);mesh.name='FormulaPart';out.add(mesh);keep(merged);
  }
  for(const w of wheelsList){const c=w.clone(true);c.name=w.name;out.add(c);}
  if(!wheelsList.length||!groups.size)throw new Error('formula asset shape');
  return out;
 }
 if(v7)treeAsset=v7.parts.tree(track.theme);
 else if(!disposed)[carAsset,lowCarAsset,treeAsset]=await Promise.all([
  loadAsset('../assets/racing/sport-coupe.glb').then(asset=>{carAssetName='sport-coupe';return asset;}).catch(()=>loadAsset('../assets/models/car-a-512.glb').then(asset=>{carAssetName='original-meshy';failures.push('sport-coupe');return asset;}).catch(()=>{failures.push('car');return null;})),
  loadAsset('../assets/racing/sport-coupe-low.glb').catch(()=>null),
  loadAsset(track.theme==='jungle'||track.theme==='summit'?'../assets/ultra-fire/tree-a-512.glb':'../assets/models/palm-tree-512.glb').catch(e=>{failures.push('vegetation');return null;})
 ]);
 if(!v7&&carAssetName!=='sport-coupe'&&lowCarAsset){carAsset=lowCarAsset;carAssetName='sport-coupe';}
 if(disposed){for(const r of resources)r.dispose?.();renderer.dispose();return {dispose(){},render(){},metrics:()=>({disposed:true})};}
 if(treeAsset)plant(treeAsset,treeRows,track.theme==='jungle'?11:8);
 // The original Meshy file remains unchanged as the loading fallback. The new
 // attributed coupe supplies authored body panels, PBR paint and real wheels.
 const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=64;const cc=contactCanvas.getContext('2d'),gr=cc.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(13,29,29,.6)');gr.addColorStop(1,'rgba(13,29,29,0)');cc.fillStyle=gr;cc.fillRect(0,0,64,64);const contactMap=keep(new T.CanvasTexture(contactCanvas));
 const blurMaterial=keep(new T.MeshBasicMaterial({color:'#15191d',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide})),blurDiscs=[],speedLines=lookOn?createSpeedLines(T,camera,scene,keep):null;
 const carColors=CAR_COLORS,paints=[],carCount=gridCount;
 for(let i=0;i<carCount;i++){
  const root=new T.Group(),body=new T.Group();root.add(body);scene.add(root);const wheels=[];
  const models=[];let dress=null,standIn=null,lightOnly=false;
  const rig=v7?.parts.cars[i],useFormula=!!formulaAsset&&(i===0||(quality<2&&i<FORMULA_CARS));
  if(useFormula){
   const car=formulaAsset.clone(true);car.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const list=Array.isArray(o.material)?o.material:[o.material],tinted=list.map(m=>{if(lookOn&&!/^Paint 1/.test(m.name)){tuneMaterial(m);return m;}if(!/^Paint 1/.test(m.name))return m;if(lookOn)return paints[i]||(paints[i]=tunePaint(T,m,carColors[i],keep));const copy=keep(m.clone());copy.color.set(carColors[i]);copy.envMapIntensity=1;return copy;});o.material=Array.isArray(o.material)?tinted:tinted[0];}
    if(/^Wheel(Front|Rear)[LR]$/.test(o.name)){o.rotation.order='YXZ';wheels.push(o);}});
   body.add(car);modelLoaded=true;
   if(lookOn){dress=dressCar(T,car,{index:i,color:carColors[i],keep,player:i===0,number:CAR_NUMBERS[i]});
    for(const w of wheels){const d=new T.Mesh(keep(new T.CircleGeometry(.33,12)),blurMaterial);d.rotation.y=Math.PI/2;w.add(d);blurDiscs.push(d);}
    if(i>0){standIn=createStandIn(T,carColors[i],keep,teamOf(i).accent);root.add(standIn);}}
  }
  // racing-grid-v1 extra rivals: the light model only. racing-deep-m2: with the formula asset loaded, every rival beyond the two nearest full models is the light formula
  // silhouette too (the v7 sports coupes next to formula cars broke the Formula 1 look); ?racingF1Field=0 brings the coupes back for cars 3-4.
  else if((i>=5&&carCount>5)||(formulaAsset&&new URLSearchParams(globalThis.location?.search||'').get('racingF1Field')!=='0')){lightOnly=true;standIn=createStandIn(T,carColors[i],keep,teamOf(i).accent);standIn.visible=true;body.add(standIn);}
  else if(rig){body.add(rig.root);modelLoaded=true;}
  else if(carAsset){
   function fitCar(source){const original=source.clone(true);original.rotation.y=carAssetName==='original-meshy'?Math.PI/2:0;const box=new T.Box3().setFromObject(original),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3()),fit=new T.Group();original.position.set(-c.x,-box.min.y,-c.z);if(carAssetName==='sport-coupe')fit.scale.setScalar(4.6/size.z);else fit.scale.set(2.25/size.x,1.5/size.y,4.2/size.z);fit.add(original);body.add(fit);original.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(carAssetName==='sport-coupe'){const materials=Array.isArray(o.material)?o.material:[o.material];const tinted=materials.map(m=>{if(!/^Paint 1/.test(m.name))return m;const copy=keep(m.clone());copy.color.set(carColors[i]);copy.envMapIntensity=1;return copy;});o.material=Array.isArray(o.material)?tinted:tinted[0];}}if(/^Wheel(Front|Rear)[LR]$/.test(o.name))wheels.push(o);});models.push(fit);return fit;}
   fitCar(i===0?carAsset:(lowCarAsset||carAsset));if(i===0&&lowCarAsset)fitCar(lowCarAsset).visible=false;modelLoaded=true;
  }
  else{const shell=mesh(new T.CapsuleGeometry(.85,2.1,6,12),mat(carColors[i],{metalness:.4,roughness:.28}),0,.8,0,body);shell.rotation.x=Math.PI/2;mesh(new T.SphereGeometry(.8,16,10),mat('#294c58',{metalness:.3,roughness:.2}),0,1.3,-.1,body);}
  const detailed=useFormula||carAssetName==='sport-coupe'||carAssetName==='racing-v7',accent=mat(carColors[i],{metalness:.3,roughness:.35});if(!detailed){mesh(new T.BoxGeometry(2.45,.12,.48),accent,0,1.3,-1.65,body);for(const x of [-.75,.75])mesh(new T.BoxGeometry(.10,.48,.14),steel,x,1.04,-1.65,body);mesh(new T.BoxGeometry(2.2,.12,.32),accent,0,.23,1.95,body);}
  for(const x of [-.78,.78]){if(!detailed)mesh(new T.BoxGeometry(.36,.17,.08),mat('#fe6d48',{emissive:'#ff3924',emissiveIntensity:.6}),x,.66,-2.13,body);const f=mesh(new T.ConeGeometry(.11,.85,8),basic('#71ceff',{transparent:true,opacity:.8,depthWrite:false}),x*.78,.35,-2.48,body);f.rotation.x=-Math.PI/2;f.visible=false;flames.push({mesh:f,index:i});}
  // Small wheel sidewalls roll around X. Existing GLB wheels remain intact.
  if(!detailed){const tire=mat('#263339'),rim=mat('#d9dfda',{metalness:.85,roughness:.24});for(const x of [-1.05,1.05])for(const z of [-1.27,1.26]){const wheel=new T.Group();wheel.position.set(x,.4,z);const t=mesh(new T.CylinderGeometry(.38,.38,.14,18),tire,0,0,0,wheel);t.rotation.z=Math.PI/2;const hub=mesh(new T.TorusGeometry(.24,.035,4,12),rim,x>0?.09:-.09,0,0,wheel);hub.rotation.y=Math.PI/2;for(let j=0;j<5;j++){const spoke=mesh(new T.BoxGeometry(.04,.045,.44),rim,x>0?.1:-.1,0,0,wheel);spoke.rotation.x=j*Math.PI/5;}root.add(wheel);wheels.push(wheel);}}
  const shadow=mesh(new T.PlaneGeometry(4,6),basic('#fff',{map:contactMap,transparent:true,depthWrite:false}),0,0,0);shadow.rotation.x=-Math.PI/2;
  const beacon=mesh(new T.ConeGeometry(.18,.35,4),basic(carColors[i]),0,3,0,root);beacon.rotation.z=Math.PI;
  cars.push({root,body,wheels,shadow,beacon,models,dress,standIn,lightOnly,prev:null,v7:useFormula?null:rig||null,formula:useFormula,spin:0,steerVis:0});
 }
 const nearRank=new Map(),FULL_RIVALS=4;
 const camTarget=new T.Vector3(),desired=new T.Vector3(),look=new T.Vector3(),carPosition=new T.Vector3(),cameraOffset=new T.Vector3(),lookOffset=new T.Vector3();
 function resize(){if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,[1.7,1.25,1][quality]));renderer.setSize(w,h,false);}
 observer=new ResizeObserver(resize);observer.observe(canvas);resize();ready=true;
 function observeFrame(ms){if(!ms||ms>250)return;frameMilliseconds=ms;qualityAge+=ms;slow=ms>30?slow+1:Math.max(0,slow-1);if(slow>65&&qualityAge>6000&&quality<2){quality++;slow=0;qualityAge=0;renderer.shadowMap.enabled=quality===0;scenery.setQuality(quality);resize();}}
 function updateVegetation(player){const forwardX=Math.sin(player.heading),forwardZ=Math.cos(player.heading),radius=[140,110,85][quality];const selected=treeRows.map((p,index)=>({index,distance:Math.hypot(p.x-player.x,p.z-player.z),forward:(p.x-player.x)*forwardX+(p.z-player.z)*forwardZ})).filter(p=>p.distance<radius&&p.forward>-16).sort((a,b)=>a.distance-b.distance).slice(0,[28,18,10][quality]);for(const {inst,matrices}of foliageParts){selected.forEach((p,index)=>inst.setMatrixAt(index,matrices[p.index]));inst.count=selected.length;inst.instanceMatrix.needsUpdate=true;}}
 function render(state,dt=0){if(disposed||!ready)return;frames++;const data=state.cars||[state.player];if(carCount>5){nearRank.clear();cars.map((c,i)=>({c,d:i?Math.hypot(data[i].x-state.player.x,data[i].z-state.player.z):-1})).sort((a,b)=>a.d-b.d).forEach((e,k)=>nearRank.set(e.c,k));}data.forEach((c,i)=>{const car=cars[i];if(!car)return;car.root.visible=i===0||((c.x-state.player.x)*Math.sin(state.player.heading)+(c.z-state.player.z)*Math.cos(state.player.heading)>-3.5&&Math.hypot(c.x-state.player.x,c.z-state.player.z)<320);car.shadow.visible=car.root.visible;car.root.position.set(c.x,carGround(c)+.04,c.z);car.root.rotation.y=c.heading;const response=dt?1-Math.exp(-dt*10):0;if(c.crashT>0){if(crashFxOn&&c.crashDur>0){/* racing-deep-m7: the arc from the model (crashAir), 1-2 full rolls about the long axis (crashSpin) eased over the flight, a nose-up then nose-down pitch and a small yaw wobble; the contact shadow stays on the road and shrinks with the height */const q=1-c.crashT/c.crashDur,e=q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2;car.body.rotation.z=e*Math.PI*2*(c.crashSpin||1)*(i%2?1:-1);car.body.rotation.x=Math.sin(q*Math.PI*2)*.3*(i%3?1:-1);car.body.position.y=c.crashAir||0;car.body.rotation.y=Math.sin(q*Math.PI*2)*.12;car.shadow.scale.setScalar(1-.3*Math.min(1,(c.crashAir||0)/1.6));}else{const q=1-c.crashT/.55,e=q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2;car.body.rotation.z=e*Math.PI*2*(i%2?1:-1);car.body.rotation.x=Math.sin(q*Math.PI)*.45;car.body.position.y=Math.sin(q*Math.PI)*1.3;car.body.rotation.y=Math.sin(q*Math.PI*2)*.18;}if(car.standIn&&car.standIn.parent===car.root){car.standIn.rotation.copy(car.body.rotation);car.standIn.position.y=car.body.position.y;car.standInRolled=true;}}else{car.body.position.y=0;car.body.rotation.x=0;car.body.rotation.y=0;car.body.rotation.z+=(-(c.steer||0)*Math.min(c.speed/400,.065)-car.body.rotation.z)*response;if(car.standInRolled){car.standIn.rotation.set(0,0,0);car.standIn.position.y=0;car.shadow.scale.setScalar(1);car.standInRolled=false;}if(car.shadow.scale.x!==1)car.shadow.scale.setScalar(1);}if(car.dress){const dec=dt>0&&car.prev!=null?(c.speed-car.prev)/dt:0;car.dress.brake(dec<-4||(c.braking===true));car.prev=c.speed;}if(car.standIn&&!car.lightOnly){const far=car.root.position.distanceTo(camera.position)>70||(nearRank.get(car)||0)>FULL_RIVALS;car.body.visible=!far;car.standIn.visible=far;}car.wheels.forEach(w=>{w.rotation.x+=(car.formula?1:carAssetName==='sport-coupe'?1:-1)*c.speed*dt/(car.formula?.35:.4054);if(w.name.startsWith('WheelFront'))w.rotation.y=(c.steer||0)*.25;});if(car.v7){car.spin=(car.spin+c.speed*dt/car.v7.wheelRadius)%car.v7.TAU;car.steerVis=(c.steer||0)*.25;}if(car.models.length>1){car.models[0].visible=quality<2;car.models[1].visible=quality===2;}car.shadow.position.set(c.x,carGround(c)+.07,c.z);car.shadow.rotation.z=c.heading;car.beacon.visible=i>0;});flames.forEach(f=>{const c=data[f.index];f.mesh.visible=!!c?.boosting;f.mesh.scale.y=.8+Math.sin(state.time*38)*.2;});
  const player=state.player||data[0],p=track.sample(player.s||0),forward=new T.Vector3(Math.sin(player.heading-(player.slipAngle||0)),0,Math.cos(player.heading-(player.slipAngle||0))),speed=Math.min(1,player.speed/45),ahead=track.sample((player.s||0)+15);
  const acceleration=dt>0?(player.speed-previousSpeed)/dt:0;previousSpeed=player.speed;cameraKick+=((player.boosting?.24:0)+Math.min(.16,Math.max(0,acceleration)*.008)-cameraKick)*(dt?1-Math.exp(-dt*7):0);
  // racing-deep-m7: while the player flies the camera pulls back 15% and rises 20% (fast in, slow out), the field widens 5 degrees, and it keeps shaking until the landing
  const flying=crashFxOn&&player.crashT>0&&player.crashDur>0?1:0;crashZoom+=(flying-crashZoom)*(dt?1-Math.exp(-dt*(flying?9:3.5)):0);if(crashZoom<.001)crashZoom=0;
  const boom=(6.4+speed*.3+cameraKick)*(1+.15*crashZoom),height=((lowCamera?1.95:2.45)+speed*.1)*(1+.2*crashZoom);
  desired.set(player.x-forward.x*boom,player.y+height,player.z-forward.z*boom);const ground=track.project(desired.x,desired.z);desired.y=Math.max(desired.y,ground.y+(lowCamera?1.3:1.55));
  look.set(player.x+forward.x*(8+speed*2),player.y+1.2+(flying?(player.crashAir||0)*.5:0),player.z+forward.z*(8+speed*2));look.x=look.x*.91+ahead.x*.09;look.z=look.z*.91+ahead.z*.09;
  // Follow translation without speed-dependent lag; smooth only the relative
  // boom/aim. A world-position lerp moved the camera six metres back at speed.
  carPosition.set(player.x,player.y,player.z);desired.sub(carPosition);look.sub(carPosition);
  if(!cameraReady){cameraOffset.copy(desired);lookOffset.copy(look);cameraReady=true;}else{cameraOffset.lerp(desired,1-Math.exp(-dt*8));lookOffset.lerp(look,1-Math.exp(-dt*10));}camera.position.copy(carPosition).add(cameraOffset);if((shakeT>0||flying)&&!reducedMotion){shakeT=Math.max(0,shakeT-dt);const k=Math.max(shakeT/.28*shakeA,flying*.09*(player.crashT/player.crashDur));camera.position.x+=(Math.random()-.5)*k;camera.position.y+=(Math.random()-.5)*k*.6;}camTarget.copy(carPosition).add(lookOffset);camera.lookAt(camTarget);if(!reducedMotion)camera.rotateZ((player.steer||0)*speed*.012);const targetFov=63+speed*8+(player.boosting&&!reducedMotion?4:0)+5*crashZoom;camera.fov+=(targetFov-camera.fov)*(dt?1-Math.exp(-dt*5):1);camera.updateProjectionMatrix();sun.position.set(player.x-35,player.y+60,player.z+25);sun.target.position.set(player.x,player.y,player.z);
  updateVegetation(player);pickups.forEach((p,i)=>{const live=state.collectibles?.find?.(x=>x.id===p.id);p.root.visible=!live||!(live.cooldown>0||live.active===false);p.root.rotation.y=state.time*1.6+i;p.root.position.y=p.base+Math.sin(state.time*2+i)*.15;});effects.update(state,dt,camera,quality);
  if(v7){for(const car of cars){if(!car.v7||!car.root.visible)continue;car.v7.frame(car.root.position.distanceTo(camera.position),quality);car.v7.wheels(car.spin,car.steerVis);}v7.parts.crowd.update(player,quality,state.time);}
  if(lookOn){blurMaterial.opacity=Math.min(.5,Math.max(0,(player.speed-14)/50));speedLines?.update(dt,player.speed/45,player.boosting);}
  renderer.info.reset();renderer.render(scene,camera);
 }
 function dispose(){if(disposed)return;disposed=true;observer?.disconnect();sun.shadow.dispose();scenery.dispose();effects.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const r of resources)r.dispose?.();resources.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();}
 return {render,observeFrame,dispose,setStartLamps(n){gantry?.light(n,night);},kick(a=.5){shakeA=.3+Math.max(0,Math.min(1,a))*.5;shakeT=.28;},metrics:()=>({mode:'webgl',quality,frames,frameMilliseconds,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,countsIncludeShadowPasses:true,shadowsEnabled:renderer.shadowMap.enabled,visibleTrees:foliageParts[0]?.inst.count||0,treeLimit:[28,18,10][quality],scenery:scenery.metrics(),effects:effects.metrics(),crashAssets,gantry:gantry?gantry.metrics():null,f1:f1Look?.metrics?.()||null,envV2:envV2?.metrics()||null,v7:{enabled:v7On,active:!!v7,reason:v7Reason,lods:cars.map(c=>c.v7?c.v7.lod:-1),spectators:v7?{visible:v7.parts.crowd.visible,capacity:v7.parts.crowd.capacity,triangles:Math.round(v7.parts.crowd.triangles())}:null},modelLoaded,carAsset:carAssetName,vegetationLoaded:!!treeAsset,failures,disposed,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures})};
}

import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

// Presentation only. World positions, race rules and outcomes belong to the engine.
export async function createSkiView(host,{modelUrl=new URL('./assets/rider.glb',import.meta.url).href}={}){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#a9dcf2');scene.fog=new THREE.Fog('#c5e4ef',65,240);
 const camera=new THREE.PerspectiveCamera(48,1,.1,500);let quality='high',disposed=false;
 const hemi=new THREE.HemisphereLight('#e2f8ff','#8094a8',2.6);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#fff3db',3.5);sun.position.set(-22,36,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:55,bottom:-90,near:1,far:130});sun.shadow.bias=-.0004;scene.add(sun);scene.add(sun.target);sun.target.position.set(0,0,-30);
 const mat=(c,roughness=.8)=>new THREE.MeshStandardMaterial({color:c,roughness});
 const snow=mat('#effaff'),ice=mat('#88d7f1',.3),navy=mat('#123d59'),orange=mat('#ff643b'),white=mat('#ffffff'),stone=mat('#7590a1'),green=mat('#254e60');
 const resources=new Set();
 function mesh(geo,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);resources.add(geo);return m;}
 const box=(w,h,d,m,p,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),m,p,x,y,z);
 const ground=mesh(new THREE.PlaneGeometry(700,700),snow,scene,0,-.08,-120);ground.rotation.x=-Math.PI/2;
 const piste=new THREE.Group();scene.add(piste);
 const pisteMat=mat('#d4eef9',.48);box(19,.08,600,pisteMat,piste,0,-.02,-200);
 // Wide icy shoulders and a soft snowbank read clearly at speed.
 for(const x of [-10,10]){box(.65,.28,600,ice,piste,x,.08,-200);box(1,.44,600,snow,piste,x*1.06,.05,-200);}
 const mountains=new THREE.Group();scene.add(mountains);
 for(let i=0;i<28;i++){
  const side=i%2?-1:1,dist=45+(i%7)*15,h=13+(i*17%27),z=15-i*11;
  const m=mesh(new THREE.ConeGeometry(h*.83,h,5,1),i%3===0?stone:mat(['#bed4df','#d4e7ee','#9ebaca'][i%3]),mountains,side*dist,h*.5-2,z);m.rotation.y=i*.7;
  const cap=mesh(new THREE.ConeGeometry(h*.419,h*.5,5,1),snow,mountains,side*dist,h*.75-1.98,z);cap.rotation.y=i*.7;
 }
 // The pines are original environment geometry; the human figure is an existing skinned GLB.
 function pine(x,z,s){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);box(.16,1,.16,stone,g,0,.5,0);for(let k=0;k<4;k++){const h=1.1-k*.12,y=.9+k*.52,r=.88-k*.16;mesh(new THREE.ConeGeometry(r,h,7),green,g,0,y,0);mesh(new THREE.ConeGeometry(r*.96,h*.7,7),snow,g,0,y+.19,0);}return g;}
 const scrollables=[];
 for(let i=0;i<64;i++){const side=i%2?1:-1;const tree=pine(side*(13+(i*7%17)),-(i*7%225),1+(i*13%12)/10);scene.add(tree);scrollables.push({object:tree,z:tree.position.z,range:240});}
 function textTexture(label,bg='#ff643b',fg='#ffffff') {const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,256,512);ctx.fillStyle=fg;ctx.font='900 43px Arial';ctx.textAlign='center';ctx.save();ctx.translate(128,310);ctx.rotate(-Math.PI/2);ctx.fillText(label,0,0);ctx.restore();ctx.font='900 110px Arial';ctx.fillText('A',128,110);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;resources.add(tex);return tex;}
 const flagMaterial=new THREE.MeshStandardMaterial({map:textTexture('ALPINE / 01'),side:THREE.DoubleSide,roughness:.8});
 for(let i=0;i<18;i++){const side=i%2?-1:1,z=-i*15;const group=new THREE.Group();box(.07,5,.07,white,group,0,2.5,0);box(1,3,.025,flagMaterial,group,side*.48,3.4,0);group.position.set(side*11.4,0,z);scene.add(group);scrollables.push({object:group,z,range:270});}
 // Soft etched corduroy lines, drawn as world-space ribbons.
 const lines=new THREE.Group();scene.add(lines);const lineMat=new THREE.MeshBasicMaterial({color:'#c2e4f3',transparent:true,opacity:.35});for(let x=-9;x<9;x+=.36){const line=mesh(new THREE.PlaneGeometry(.016,280),lineMat,lines,x,.032,-115);line.rotation.x=-Math.PI/2;}
 const boostMat=new THREE.MeshStandardMaterial({color:'#26d8e5',emissive:'#06c8dc',emissiveIntensity:.6,roughness:.3});
 function pad(){const g=new THREE.Group();box(3.3,.08,5.5,ice,g,0,.07,0);for(let i=0;i<3;i++)for(const side of [-1,1]){const a=box(1.22,.04,.25,boostMat,g,side*.39,.14,i*1.25-1.5);a.rotation.y=side*.6;}return g;}
 function ramp(){const g=new THREE.Group(),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-2,0,3,2,0,3,-2,1.2,-3,2,0,3,2,1.2,-3,-2,1.2,-3],3));geo.computeVertexNormals();mesh(geo,ice,g);for(const x of [-2,2]){const edge=box(.12,.08,6.12,orange,g,x,.6,0);edge.rotation.x=.197;}return g;}
 const props=new Map();
 function obstacle(o){let g=new THREE.Group();if(o.type==='boost')g=pad();else if(o.type==='ramp')g=ramp();else if(o.type==='gate'){for(const x of [-2.2,2.2])box(.18,2.2,.2,orange,g,x,1.1,0);box(4.6,.55,.2,navy,g,0,2.2,0);}else{const rock=mesh(new THREE.DodecahedronGeometry(o.radius??.7,0),stone,g,0,.4,0);rock.scale.set(1,.65,1);mesh(new THREE.SphereGeometry((o.radius??.7)*.85,8,5),snow,g,0,.68,0).scale.y=.35;}scene.add(g);props.set(o.id,g);return g;}
 const gltf=await new GLTFLoader().loadAsync(modelUrl);const riders=new Map();
 // Clone skeletons without importing an additional runtime dependency.
 function cloneSkinned(source){const clone=source.clone(true),orig=[],copies=[],boneMap=new Map();source.traverse(n=>orig.push(n));clone.traverse(n=>copies.push(n));for(let i=0;i<orig.length;i++)if(orig[i].isBone)boneMap.set(orig[i],copies[i]);for(let i=0;i<orig.length;i++)if(orig[i].isSkinnedMesh){copies[i].skeleton=orig[i].skeleton.clone();copies[i].skeleton.bones=orig[i].skeleton.bones.map(b=>boneMap.get(b));copies[i].bindMatrix.copy(orig[i].bindMatrix);}return clone;}
 function rider(id,color){const root=new THREE.Group(),body=cloneSkinned(gltf.scene);root.add(body);body.rotation.y=Math.PI/2;body.position.y=.14;
  body.traverse(n=>{if(n.isMesh){n.castShadow=true;n.frustumCulled=false;if(n.name==='Ball'||n.name==='Skin_2')n.visible=false;
   if(n.name==='Skin_1'||n.name.startsWith('ShoeSurface')){n.geometry=n.geometry.clone();const pos=n.geometry.attributes.position,cols=n.geometry.attributes.color,coat=new THREE.Color(color),pants=new THREE.Color('#1a344b');for(let i=0;i<cols.count;i++){const shade=THREE.MathUtils.clamp((cols.getX(i)+cols.getY(i)+cols.getZ(i))*.9,.6,1);const c=n.name==='Skin_1'&&pos.getY(i)>.85&&Math.abs(pos.getX(i))<.48?coat:pants;cols.setXYZ(i,c.r*shade,c.g*shade,c.b*shade);}cols.needsUpdate=true;}
  }});
  const bones={};body.traverse(n=>{if(n.isBone)bones[n.name]=n;});
  for(const side of ['L','R']){bones['UpperLeg_'+side].rotation.x=-.33;bones['LowerLeg_'+side].rotation.x=.68;bones['Foot_'+side].rotation.x=-.35;bones['UpperArm_'+side].rotation.z=side==='L'?-.65:.65;bones['LowerArm_'+side].rotation.x=-.5;}
  bones.Hips.position.y-=.06;bones.Spine.rotation.x=.18;
  const head=bones.Head;const helmet=mesh(new THREE.SphereGeometry(.55,24,16,0,Math.PI*2,0,Math.PI*.6),mat(color,.35),head,0,.53,-.01);helmet.scale.set(1,1,.99);
  const goggles=mesh(new THREE.SphereGeometry(.48,20,10,0,Math.PI),mat('#193b54',.13),head,0,.4,.18);goggles.scale.set(.97,.28,.91);
  const strap=box(1.03,.095,.22,navy,head,0,.4,-.03);strap.rotation.y=.04;
  const board=mesh(new THREE.CapsuleGeometry(.21,1.45,6,12),navy,root,0,.14,0);board.rotation.z=Math.PI/2;board.scale.z=.25;board.rotation.y=.12;
  const deck=box(1.5,.025,.29,mat(color,.4),root,0,.195,0);deck.rotation.y=.12;
  for(const x of [-.35,.35])box(.18,.1,.28,navy,root,x,.25,0);
  const scarf=new THREE.Group();root.add(scarf);scarf.position.set(.1,1.48,.12);const sf=mesh(new THREE.PlaneGeometry(.18,1.3,1,10),new THREE.MeshStandardMaterial({color:'#ff593d',side:THREE.DoubleSide}),scarf);sf.rotation.x=-Math.PI/2;sf.position.z=.6;
  const shadow=mesh(new THREE.CircleGeometry(.8,24),new THREE.MeshBasicMaterial({color:'#386483',transparent:true,opacity:.17,depthWrite:false}),scene);shadow.rotation.x=-Math.PI/2;shadow.scale.set(.8,1.5,1);scene.add(root);const r={root,body,bones,scarf,sf,shadow};riders.set(id,r);return r;
 }
 rider('player','#ff6b3d');rider('rival-1','#ffc540');rider('rival-2','#59cad5');rider('rival-3','#ab8cdb');rider('rival-4','#df5368');rider('rival-5','#a7d54d');
 // A few airborne snow flecks catch the sunlight without hiding the track.
 const pointGeo=new THREE.BufferGeometry(),points=new Float32Array(210*3);for(let i=0;i<210;i++){points[i*3]=Math.sin(i*92.1)*35;points[i*3+1]=1+(i*17%65)*.2;points[i*3+2]=-(i*37%130);}pointGeo.setAttribute('position',new THREE.BufferAttribute(points,3));const pointMat=new THREE.PointsMaterial({color:'#ffffff',size:.055,transparent:true,opacity:.75});const flakes=new THREE.Points(pointGeo,pointMat);scene.add(flakes);resources.add(pointGeo);
 const trailGeo=new THREE.BufferGeometry();const trailPositions=new Float32Array(140*3);trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPositions,3));const trailMat=new THREE.PointsMaterial({color:'#ffffff',size:.13,transparent:true,opacity:.8,depthWrite:false});const spray=new THREE.Points(trailGeo,trailMat);scene.add(spray);resources.add(trailGeo);
 const target=new THREE.Vector3();const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}const ro=new ResizeObserver(resize);ro.observe(host);resize();
 function render(state){if(disposed)return;const t=state.timeMs/1000,d=state.distanceM,playing=state.phase!=='menu',portrait=camera.aspect<.9;
  for(const item of scrollables){item.object.position.z=((item.z+d*.75+240)%item.range)-item.range+12;}
  for(const [id,r]of riders){const s=id==='player'?state.player:state.rivals.find(x=>x.id===id);r.root.visible=!!s;r.shadow.visible=!!s;if(!s)continue;const x=s.x,z=id==='player'?0:s.z;
   r.root.position.set(x,.03+(s.height??0),z);r.root.rotation.z=-(s.lean??0)*.25;r.root.rotation.y=(s.lean??0)*.24;
   r.body.position.y=.14+Math.sin(t*5+(id==='player'?0:3))*.018;r.shadow.position.set(x,.04,z);r.shadow.material.opacity=.17/(1+(s.height??0));
   const a=r.sf.geometry.attributes.position;for(let i=0;i<a.count;i++){a.setZ(i,Math.sin(i*.9+t*10)*.05*(i%11/10));}a.needsUpdate=true;
  }
  for(const p of props.values())p.visible=false;for(const o of state.obstacles??[]){const p=props.get(o.id)??obstacle(o);p.visible=true;p.position.set(o.x,0,o.z);}
  const px=state.player.x,boost=state.player.boosting;
  camera.fov=48+(boost&&!reduced?5:0);camera.updateProjectionMatrix();
  if(playing){camera.position.set(px*.25,portrait?3.65:3.8,portrait?9:9.8);target.set(px*.5,.9,-15);}
  else{camera.position.set(portrait?4:8.5,portrait?3:3.4,portrait?8:8.2);target.set(portrait?0:-4,.7,-8);}
  if(state.player.hit&&!reduced)camera.position.x+=Math.sin(t*65)*.07;camera.lookAt(target);
  const pr=riders.get('player');if(!playing){pr.root.position.set(portrait?1.8:3.8,0,portrait?-4:-.4);pr.root.rotation.y=-.38;pr.shadow.position.set(pr.root.position.x,.04,pr.root.position.z);}
  for(let i=0;i<140;i++){const life=((t*1.8+i/140)%1);trailPositions[i*3]=px+Math.sin(i*3.7)*life*.5;trailPositions[i*3+1]=.1+Math.sin(life*Math.PI)*.4;trailPositions[i*3+2]=.3+life*4;}trailGeo.attributes.position.needsUpdate=true;spray.visible=playing&&(Math.abs(state.player.lean)>.12||boost);flakes.rotation.y=Math.sin(t*.1)*.02;
  renderer.render(scene,camera);
 }
 function setQuality(value){quality=value;renderer.setPixelRatio(Math.min(devicePixelRatio,value==='low'?1:1.7));renderer.shadowMap.enabled=value!=='low';flakes.visible=value!=='low';resize();}
 function dispose(){if(disposed)return;disposed=true;ro.disconnect();const materials=new Set(),geometries=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material))materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();});resources.forEach(r=>r.dispose?.());sun.shadow.dispose();renderer.dispose();renderer.domElement.remove();}
 return {render,setQuality,dispose,canvas:renderer.domElement};
}

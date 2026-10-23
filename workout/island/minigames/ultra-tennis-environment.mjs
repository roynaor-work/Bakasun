import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

// Tournament architecture is presentation only. Seat origins remain the exact
// tennisSeats coordinates; the complete source spectators still sit on them.
export function createUltraTennisVenue(scene,config,keep,seats){
 const groups=new Map(),staticMeshes=[],detailMeshes=[],e=config.render.environment;
 const mat=(color,roughness=.86,extra={})=>keep(new T.MeshStandardMaterial({color,roughness,metalness:0,...extra}));
 const stone=mat('#b8b3a0'),edge=mat('#d6d0bc'),wood=mat('#75634e'),green=mat('#234e49',.86,{side:T.DoubleSide}),seat=mat('#476760',.86,{side:T.DoubleSide}),ivory=mat('#e9e4d4'),metal=mat('#344f4a',.52,{metalness:.35}),leaf=mat('#496b4a'),gold=mat('#b4a170',.6,{metalness:.15});
 function bake(g,m,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
  const o=new T.Object3D();o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);o.updateMatrix();g.applyMatrix4(o.matrix);
  if(!groups.has(m))groups.set(m,[]);groups.get(m).push(g);
 }
 const box=(m,x,y,z,w,h,d,ry=0)=>bake(new T.BoxGeometry(w,h,d),m,x,y,z,1,1,1,0,ry);
 const cylinder=(m,x,y,z,r,h,n=10)=>bake(new T.CylinderGeometry(r,r,h,n),m,x,y,z);
 // Subtle mineral pores and turf detail use tiny original data textures.
 function grain(base,amount,repeat){
  const data=new Uint8Array(128*128*4);let seed=8427;
  for(let i=0;i<128*128;i++){seed=Math.imul(seed,1664525)+1013904223>>>0;const shade=1+(seed/4294967296-.5)*amount;for(let c=0;c<3;c++)data[i*4+c]=Math.min(255,Math.round(base[c]*shade));data[i*4+3]=255;}
  const texture=keep(new T.DataTexture(data,128,128));texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
 }
 const mineral=grain([231,230,223],.13,3);stone.map=mineral;edge.map=mineral;
 const turf=mat('#6b8054',1,{map:grain([208,218,187],.25,.43),vertexColors:true}),earth=mat('#857c64');
 earth.onBeforeCompile=shader=>{
  shader.vertexShader='varying float tennisBankHeight;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntennisBankHeight=(modelMatrix*vec4(transformed,1.0)).y;');
  shader.fragmentShader='varying float tennisBankHeight;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat shore=1.0-smoothstep(.025,.13,abs(tennisBankHeight+.39));\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.57,.43),shore*.65);');
 };
 // The court belongs to a landscaped island, with an actual bank meeting the
 // water. Paved walks occupy the circulation routes instead of a giant slab.
 const shoreline=[[-21,-16],[-20,-23],[-14,-28],[-3,-30],[10,-28],[18,-25],[22,-17],[22,-5],[21,10],[19,22],[12,27],[0,29],[-12,27],[-20,20],[-23,9],[-23,-4]];
 const landShape=new T.Shape();shoreline.forEach(([x,z],i)=>i?landShape.lineTo(x,z):landShape.moveTo(x,z));landShape.closePath();
 const bankGeometry=keep(new T.ExtrudeGeometry(landShape,{depth:.8,steps:1,bevelEnabled:true,bevelSize:.7,bevelThickness:.25,bevelSegments:1,curveSegments:1}));
 const landColor=new Float32Array(bankGeometry.attributes.position.count*3),lp=bankGeometry.attributes.position;
 for(let i=0;i<lp.count;i++){const n=.92+.06*Math.sin(lp.getX(i)*.4+lp.getY(i)*.31);landColor.set([n,n,n],i*3);}bankGeometry.setAttribute('color',new T.BufferAttribute(landColor,3));
 const bank=new T.Mesh(bankGeometry,[turf,earth]);bank.rotation.x=-Math.PI/2;bank.position.y=-1.08;bank.receiveShadow=true;scene.add(bank);staticMeshes.push(bank);
 for(const sign of [-1,1]){
  box(stone,sign*11.9,-.004,0,1.65,.035,36.2);
  box(edge,sign*12.78,.008,0,.09,.04,36.2);
  box(stone,0,-.004,sign*18.4,25.5,.035,1.8);
  box(edge,0,.008,sign*19.35,25.5,.04,.09);
 }
 function bar(m,from,to,r=.025){
  const a=new T.Vector3(...from),b=new T.Vector3(...to),delta=b.clone().sub(a),g=new T.CylinderGeometry(r,r,delta.length(),6);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());
  if(!groups.has(m))groups.set(m,[]);groups.get(m).push(g);
 }
 // Broad, grounded stone risers and individually separated upholstered seats.
 // End stair aisles are beyond the spectator grid, keeping the court uncluttered.
 for(const sign of [-1,1]){
  for(let row=0;row<e.crowdRows;row++){
   const y=e.crowdFloor+row*e.crowdRise;
   box(stone,sign*(e.crowdSideX+row*e.crowdRowGap),y/2-.06,0,1.08,y+.12,17.2);
   box(edge,sign*(e.crowdSideX+row*e.crowdRowGap-.43),y+.017,0,.10,.034,17.2);
   box(stone,0,y/2-.06,sign*(e.crowdEndZ+row*e.crowdEndRowGap),17.2,y+.12,1.08);
   box(edge,0,y+.017,sign*(e.crowdEndZ+row*e.crowdEndRowGap-.43),17.2,.034,.10);
   box(metal,sign*(e.crowdSideX+row*e.crowdRowGap+.12),y+.20,0,.07,.40,16.1);
   box(metal,0,y+.20,sign*(e.crowdEndZ+row*e.crowdEndRowGap+.12),16.1,.40,.07);
  }
  box(stone,sign*10.73,1,0,.28,2.1,18.1);
  box(edge,sign*10.73,2.08,0,.46,.14,18.25);
  box(stone,0,1,sign*16.53,18.1,2.1,.28);
  box(edge,0,2.08,sign*16.53,18.25,.14,.46);
  for(const along of [-9.15,9.15])for(let step=0;step<6;step++){
   const rise=(step+1)*.24;
   box(edge,sign*(7.6+step*.5),rise/2-.04,along,.51,rise+.08,.95);
   box(edge,along,rise/2-.04,sign*(13.4+step*.5),.95,rise+.08,.51);
  }
  // Slim upper guardrails leave the textured palms and sky visible.
  for(let z=-9;z<=9;z+=1.8)box(metal,sign*10.78,2.43,z,.044,.72,.044);
  bar(metal,[sign*10.78,2.78,-9],[sign*10.78,2.78,9]);
  for(let x=-9;x<=9;x+=1.8)box(metal,x,2.43,sign*16.58,.044,.72,.044);
  bar(metal,[-9,2.78,sign*16.58],[9,2.78,sign*16.58]);
 }
 seats.forEach(s=>{
  const dx=Math.sin(s.facing),dz=Math.cos(s.facing);
  const cushion=new T.PlaneGeometry(.62,.58);cushion.rotateX(-Math.PI/2);bake(cushion,seat,s.x,s.y+.48,s.z,1,1,1,0,s.facing);
  // Two folded panels give each chair a concave back, like a moulded stadium
  // shell, while spending six triangles on the whole chair rather than 24.
  const shell=new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute([-.32,-.29,.03,-.32,.29,.03,0,-.29,-.035,0,.29,-.035,.32,-.29,.03,.32,.29,.03],3));shell.setIndex([0,2,1,2,3,1,2,4,3,4,5,3]);shell.computeVertexNormals();
  // All static batches share position/normal/UV attributes.
  shell.setAttribute('uv',new T.Float32BufferAttribute([0,0,0,1,.5,0,.5,1,1,0,1,1],2));
  bake(shell,green,s.x-dx*.25,s.y+.78,s.z-dz*.25,1,1,1,0,s.facing);
 });
 // Quiet deep-green windscreens use fine open mesh above a low padded band.
 const meshCanvas=document.createElement('canvas');meshCanvas.width=meshCanvas.height=64;
 const mc=meshCanvas.getContext('2d');mc.strokeStyle='rgba(31,59,51,.44)';mc.lineWidth=.8;
 for(let n=-64;n<128;n+=8){mc.beginPath();mc.moveTo(n,0);mc.lineTo(n+64,64);mc.stroke();mc.beginPath();mc.moveTo(n,0);mc.lineTo(n-64,64);mc.stroke();}
 const meshMap=keep(new T.CanvasTexture(meshCanvas));meshMap.wrapS=meshMap.wrapT=T.RepeatWrapping;meshMap.repeat.set(18,1);
 const meshMaterial=keep(new T.MeshStandardMaterial({map:meshMap,transparent:true,alphaTest:.08,side:T.DoubleSide,roughness:1,depthWrite:false}));
 for(const sign of [-1,1]){
  box(green,sign*6.7,.4,0,.10,.64,24.6);
  box(edge,sign*6.7,.075,0,.34,.09,24.9);
  for(let z=-12.3;z<=12.31;z+=2.05)box(metal,sign*6.7,.88,z,.054,1.62,.054);
  bar(metal,[sign*6.7,1.68,-12.3],[sign*6.7,1.68,12.3],.027);
  bake(new T.PlaneGeometry(24.6,.96),meshMaterial,sign*6.7,1.2,0,1,1,1,0,Math.PI/2);
  box(green,0,.4,sign*12.5,13.4,.64,.10);
  box(edge,0,.075,sign*12.5,13.6,.09,.34);
  for(let x=-6.7;x<=6.71;x+=1.34)box(metal,x,.88,sign*12.5,.054,1.62,.054);
  bar(metal,[-6.7,1.68,sign*12.5],[6.7,1.68,sign*12.5],.027);
  bake(new T.PlaneGeometry(13.4,.96),meshMaterial,0,1.2,sign*12.5);
 }
 // Court identity is part of the venue, with restrained cream typography.
 const brandCanvas=document.createElement('canvas');brandCanvas.width=1024;brandCanvas.height=128;
 const bc=brandCanvas.getContext('2d');bc.fillStyle='#244c45';bc.fillRect(0,0,1024,128);bc.textAlign='center';bc.textBaseline='middle';bc.fillStyle='#ded9c6';bc.font='500 47px Georgia, serif';bc.fillText('I S L A N D   O P E N',512,58);bc.font='18px Arial, sans-serif';bc.fillStyle='#b7b79c';bc.fillText('T E N N I S   C L U B     /     C O U R T   0 1',512,106);
 const brandMap=keep(new T.CanvasTexture(brandCanvas));brandMap.colorSpace=T.SRGBColorSpace;brandMap.anisotropy=4;
 const brandMaterial=keep(new T.MeshStandardMaterial({map:brandMap,roughness:1}));
 bake(new T.PlaneGeometry(7,.88),brandMaterial,0,.66,-12.43);
 bake(new T.PlaneGeometry(7,.88),brandMaterial,0,.66,12.43,1,1,1,0,Math.PI);
 // Cantilevered timber pavilion sits behind the far stand, away from play.
 box(edge,0,.025,-20.1,14,.16,4.4);
 box(green,0,1.15,-21.4,12.8,2.3,.22);
 box(wood,0,2.72,-20.1,14.2,.18,4.8);
 box(edge,0,2.84,-20.1,14.5,.10,5.1);
 box(metal,0,2.59,-17.88,14.2,.09,.12);
 for(const x of [-6.2,-3.1,3.1,6.2])cylinder(metal,x,1.32,-18,.055,2.65,8);
 for(let x=-6.1;x<=6.11;x+=.44)box(wood,x,1.18,-21.2,.075,2.25,.075);
 for(const x of [-4.8,4.8]){box(green,x,.70,-20.85,2.2,1.3,.12);box(ivory,x,1.4,-20.85,2.2,.08,.17);}
 // Complete umpire chair keeps the original official and seat alignment.
 for(const x of [-5.60,-4.70])for(const z of [-.4,.4]){
  cylinder(metal,x,1.12,z,.033,2.24,8);
  cylinder(metal,x,.12,z,.095,.08,10);
 }
 for(const z of [-.4,.4])bar(metal,[-5.60,.28,z],[-4.70,1.94,z]);
 box(ivory,-5.15,2.10,0,1.12,.12,.92);
 box(green,-5.15,2.55,-.43,1.12,.80,.09);
 for(const x of [-5.67,-4.63])bar(metal,[x,2.12,-.4],[x,2.62,.32]);
 for(let i=0;i<6;i++)box(metal,-4.64,.28+i*.34,.31,.08,.055,.81);
 // Players' equipment stays outside the playing apron.
 for(const sign of [-1,1]){
  box(wood,sign*8.05,.48,10.4,2.25,.11,.64);
  box(wood,sign*8.05,.85,10.12,2.25,.68,.09);
  for(const x of [-.86,.86])box(metal,sign*8.05+x,.25,10.4,.08,.50,.46);
  box(green,sign*9.53,.43,10.5,.70,.78,.61);
  box(ivory,sign*9.53,.84,10.5,.75,.06,.66);
  cylinder(ivory,sign*9.5,1.02,10.5,.07,.30,10);
  cylinder(gold,sign*9.5,1.18,10.5,.048,.04,10);
 }
 // Limestone planters frame the original Meshy palms, never replacing them.
 for(const [x,z] of e.treePositions){
  const g=new T.CylinderGeometry(.86,.95,.35,12);bake(g,edge,x,.08,z);
  bake(new T.CylinderGeometry(.78,.78,.03,12),wood,x,.265,z);
 }
 for(const sign of [-1,1])for(const z of [-18.2,-10,5.2,16.5]){
  box(edge,sign*13,.22,z,1.1,.48,2.4);
  box(wood,sign*13,.47,z,.91,.03,2.19);
  for(let n=0;n<3;n++)bake(new T.SphereGeometry(.60,6,3),leaf,sign*13,.72,z+(n-1)*.66,.78,.80,1.12);
 }
 // Very distant islands and a calm water horizon give the court an island place.
 const seaGrain=grain([225,234,236],.025,10),sea=mat('#4f8f9e',.36,{metalness:.08,map:seaGrain,bumpMap:seaGrain,bumpScale:.006});
 const seaMesh=new T.Mesh(keep(new T.PlaneGeometry(420,420)),sea);seaMesh.rotation.x=-Math.PI/2;seaMesh.position.set(0,-.45,-30);scene.add(seaMesh);staticMeshes.push(seaMesh);
 for(const [x,z,w,h] of [[-42,-62,17,4.6],[30,-80,27,5.4],[70,-56,13,3.2]]){
  bake(new T.SphereGeometry(1,12,5),leaf,x,-h*.30,z,w,h,w*.38);
 }
 let architectureTriangles=0;
 for(const [material,parts] of groups){
  const geometry=keep(mergeGeometries(parts,false));parts.forEach(g=>g.dispose());
  architectureTriangles+=geometry.index.count/3;
  const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;mesh.castShadow=material===wood||material===stone;
  scene.add(mesh);staticMeshes.push(mesh);if(material===leaf)detailMeshes.push(mesh);
 }
 groups.clear();
 return {
  setQuality(q){detailMeshes.forEach(m=>m.visible=q<2);},
  metrics(){return {venue:'island-open',architectureTriangles:architectureTriangles+126,architectureDrawCalls:staticMeshes.length+1,seatArchitecture:seats.length,staticArchitecture:true,venueExternalAssets:0};}
 };
}

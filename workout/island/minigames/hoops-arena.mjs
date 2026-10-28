/** Island Pro Basketball — the arena: hardwood court with real markings (FIBA/NBA-size
 * pro court in metres), padded stanchions, glass boards, rims and nets, shot clocks,
 * scorer's table, benches, tiered stands with an instanced crowd, LED ribbons, the centre
 * scoreboard and the light rig. Built once from the court geometry; nothing here decides play. */
import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {parquetTextures,centerLogo,ledTexture,displayCanvas} from './hoops-textures.mjs?v=island-hoops-feel-20261027-1';

const LINE=0.05;

function stripGeo(points,width){
 // a flat ribbon along a polyline (y=0), for court lines
 const pos=[],idx=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  let dx=b.x-a.x,dz=b.z-a.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
  const nx=-dz*width/2,nz=dx*width/2;
  pos.push(p.x+nx,0,p.z+nz,p.x-nx,0,p.z-nz);
  if(i<points.length-1){const k=i*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const n=g.attributes.normal;for(let i=0;i<n.count;i++)n.setXYZ(i,0,1,0);
 return g;
}
const arc=(cx,cz,r,a0,a1,n=64)=>Array.from({length:n+1},(_,i)=>{const a=a0+(a1-a0)*i/n;return {x:cx+Math.cos(a)*r,z:cz+Math.sin(a)*r};});
const seg=(x0,z0,x1,z1)=>[{x:x0,z:z0},{x:x1,z:z1}];

export function buildArena(court,{home,away,quality=2,anisotropy=8}){
 const root=new THREE.Group();root.name='arena';
 const dyn={};                      // things the view updates every frame
 const {hx,hz,rimX}=court;

 // ---------- floor ----------
 const wood=parquetTextures(quality>=2?1024:512);
 wood.map.anisotropy=anisotropy;wood.roughness.anisotropy=anisotropy;
 const apronX=hx+4.2,apronZ=hz+3.4;
 const floorMat=new THREE.MeshPhysicalMaterial({map:wood.map,roughnessMap:wood.roughness,roughness:0.55,metalness:0,clearcoat:0.85,clearcoatRoughness:0.12,color:0xffffff});
 wood.map.repeat.set((hx*2)/1.6,(hz*2)/1.6);wood.roughness.repeat.copy(wood.map.repeat);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(hx*2,hz*2),floorMat);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.name='court';
 root.add(floor);
 const apronMap=wood.map.clone();apronMap.repeat.set(apronX*2/1.6,apronZ*2/1.6);apronMap.needsUpdate=true;
 const apron=new THREE.Mesh(new THREE.PlaneGeometry(apronX*2,apronZ*2),new THREE.MeshPhysicalMaterial({map:apronMap,color:new THREE.Color(home.secondaryDark||'#5a2f1a'),roughness:0.6,clearcoat:0.6,clearcoatRoughness:0.2}));
 apron.rotation.x=-Math.PI/2;apron.position.y=-0.004;apron.receiveShadow=true;root.add(apron);

 // painted areas (team colour, slightly glossy), centre logo
 const paintMat=new THREE.MeshPhysicalMaterial({color:new THREE.Color(home.primary),roughness:0.5,clearcoat:0.8,clearcoatRoughness:0.15,transparent:true,opacity:0.92});
 for(const s of [1,-1]){
  const key=new THREE.Mesh(new THREE.PlaneGeometry(court.ftDist,court.keyW),paintMat);key.rotation.x=-Math.PI/2;key.position.set(s*(hx-court.ftDist/2),0.002,0);key.receiveShadow=true;root.add(key);
 }
 const logo=new THREE.Mesh(new THREE.CircleGeometry(court.centerR-0.02,64),new THREE.MeshPhysicalMaterial({map:centerLogo(home.primary,home.secondary),transparent:true,roughness:0.5,clearcoat:0.8}));
 logo.rotation.x=-Math.PI/2;logo.position.y=0.003;logo.receiveShadow=true;root.add(logo);

 // court lines
 const lines=[];
 lines.push([...seg(-hx,-hz,hx,-hz)],[...seg(-hx,hz,hx,hz)],[...seg(-hx,-hz,-hx,hz)],[...seg(hx,-hz,hx,hz)],[...seg(0,-hz,0,hz)]);
 lines.push(arc(0,0,court.centerR,0,Math.PI*2,96));
 for(const s of [1,-1]){
  const bx=s*hx,fx=s*(hx-court.ftDist),kw=court.keyW/2;
  lines.push(seg(bx,-kw,fx,-kw),seg(bx,kw,fx,kw),seg(fx,-kw,fx,kw));
  lines.push(s>0?arc(fx,0,1.8,Math.PI/2,Math.PI*1.5,48):arc(fx,0,1.8,-Math.PI/2,Math.PI/2,48));
  const cz=court.threeCornerZ,along=Math.sqrt(court.threeR**2-cz**2),rx=s*rimX;
  lines.push(seg(bx,cz,rx-s*along,cz),seg(bx,-cz,rx-s*along,-cz));
  const a=Math.asin(cz/court.threeR);
  lines.push(s>0?arc(rx,0,court.threeR,Math.PI-a,Math.PI+a,96):arc(rx,0,court.threeR,-a,a,96));
  lines.push(s>0?arc(rx,0,court.restrictedR,Math.PI/2,Math.PI*1.5,40):arc(rx,0,court.restrictedR,-Math.PI/2,Math.PI/2,40));
  // lane hash marks
  for(const d of [2.1,3.0,3.9])for(const z of [kw,-kw])lines.push(seg(s*(hx-d),z,s*(hx-d),z+(z>0?0.2:-0.2)));
 }
 const lineGeo=mergeGeometries(lines.map(p=>stripGeo(p,LINE)));
 const lineMesh=new THREE.Mesh(lineGeo,new THREE.MeshStandardMaterial({color:0xf7f3ea,roughness:0.45,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));
 lineMesh.position.y=0.004;lineMesh.receiveShadow=true;root.add(lineMesh);

 // ---------- baskets ----------
 const padMat=new THREE.MeshStandardMaterial({color:new THREE.Color(home.primary).multiplyScalar(0.8),roughness:0.75});
 const steel=new THREE.MeshStandardMaterial({color:0x2a2e36,roughness:0.35,metalness:0.7});
 const glass=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:0.05,metalness:0,transparent:true,opacity:0.18,clearcoat:1,side:THREE.DoubleSide,depthWrite:false});
 const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.4});
 const orange=new THREE.MeshStandardMaterial({color:0xe2541a,roughness:0.35,metalness:0.55});
 dyn.nets=[];dyn.shotClocks=[];
 for(const s of [1,-1]){
  const g=new THREE.Group();
  const baseX=s*(hx+1.6);
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.05,1.5),padMat);base.position.set(baseX+s*0.3,0.52,0);base.castShadow=true;base.receiveShadow=true;g.add(base);
  const padFront=new THREE.Mesh(new THREE.BoxGeometry(0.35,1.0,1.4),padMat);padFront.position.set(baseX-s*0.5,0.5,0);padFront.castShadow=true;g.add(padFront);
  const post=new THREE.Mesh(new THREE.BoxGeometry(0.28,2.4,0.32),padMat);post.position.set(baseX,2.15,0);post.castShadow=true;g.add(post);
  const armLen=Math.abs(baseX-s*court.boardX)-0.1;
  const arm=new THREE.Mesh(new THREE.BoxGeometry(armLen,0.16,0.22),steel);arm.position.set((baseX+s*court.boardX)/2,3.32,0);arm.castShadow=true;g.add(arm);
  const brace=new THREE.Mesh(new THREE.BoxGeometry(armLen*0.9,0.08,0.12),steel);brace.position.set((baseX+s*court.boardX)/2+s*0.1,2.85,0);brace.rotation.z=s*0.22;g.add(brace);
  // backboard glass + frame + target square
  const bw=court.boardW,bh=court.boardH,by=court.boardBottom+bh/2,bx=s*court.boardX;
  const board=new THREE.Mesh(new THREE.BoxGeometry(0.03,bh,bw),glass);board.position.set(bx,by,0);g.add(board);
  const frameParts=[[0.05,0.05,bw,by+bh/2],[0.05,0.05,bw,by-bh/2]];
  for(const [w,h,d,y] of frameParts){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),steel);m.position.set(bx+s*0.02,y,0);g.add(m);}
  for(const z of [bw/2,-bw/2]){const m=new THREE.Mesh(new THREE.BoxGeometry(0.05,bh,0.05),steel);m.position.set(bx+s*0.02,by,z);g.add(m);}
  const sq=[[0.59,0.05,court.boardBottom+0.15],[0.59,0.05,court.boardBottom+0.6]];
  for(const [w,h,y] of sq){const m=new THREE.Mesh(new THREE.BoxGeometry(0.012,h,w),white);m.position.set(bx-s*0.02,y,0);g.add(m);}
  for(const z of [0.295,-0.295]){const m=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.45,0.05),white);m.position.set(bx-s*0.02,court.boardBottom+0.375,z);g.add(m);}
  const edgePad=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.12,bw+0.06),padMat);edgePad.position.set(bx,court.boardBottom-0.04,0);g.add(edgePad);
  // rim + bracket
  const rim=new THREE.Mesh(new THREE.TorusGeometry(court.rimR,0.011,10,40),orange);rim.rotation.x=Math.PI/2;rim.position.set(s*rimX,court.rimY,0);rim.castShadow=true;g.add(rim);
  const bracket=new THREE.Mesh(new THREE.BoxGeometry(Math.abs(rimX-court.boardX)-court.rimR+0.02,0.04,0.12),orange);bracket.position.set(s*(court.boardX+rimX-court.rimR)/2-s*0.0,court.rimY-0.02,0);g.add(bracket);
  // net: a lathe of strings that the view can swing
  const net=buildNet(court.rimR,0.42);net.position.set(s*rimX,court.rimY,0);g.add(net);dyn.nets.push({mesh:net,side:s,swing:0,base:net.geometry.attributes.position.array.slice()});
  // shot clock on top of the board
  const sc=displayCanvas(256,96);
  const scBox=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.36,0.9),steel);scBox.position.set(bx+s*0.05,court.boardBottom+bh+0.24,0);g.add(scBox);
  const scFace=new THREE.Mesh(new THREE.PlaneGeometry(0.84,0.3),new THREE.MeshBasicMaterial({map:sc.texture,toneMapped:false}));
  scFace.position.set(bx-s*0.035,court.boardBottom+bh+0.24,0);scFace.rotation.y=s>0?-Math.PI/2:Math.PI/2;g.add(scFace);
  dyn.shotClocks.push(sc);
  root.add(g);
 }

 // ---------- table, benches, boards ----------
 const tableZ=-(hz+2.6);
 const table=new THREE.Mesh(new THREE.BoxGeometry(9,0.75,0.6),new THREE.MeshStandardMaterial({color:0x14161c,roughness:0.6}));table.position.set(0,0.4,tableZ);table.castShadow=true;root.add(table);
 const led=ledTexture([home.primary,'#ffffff',away.primary,home.secondary]);
 const ledMat=new THREE.MeshBasicMaterial({map:led,toneMapped:false});dyn.led=led;
 const tableLed=new THREE.Mesh(new THREE.PlaneGeometry(9,0.5),ledMat);tableLed.position.set(0,0.4,tableZ+0.31);root.add(tableLed);
 const chairMat=new THREE.MeshStandardMaterial({color:0x22252d,roughness:0.7});
 const chairGeo=mergeGeometries([new THREE.BoxGeometry(0.5,0.08,0.48).translate(0,0.45,0),new THREE.BoxGeometry(0.5,0.55,0.06).translate(0,0.75,-0.22)]);
 const chairs=new THREE.InstancedMesh(chairGeo,chairMat,24);let ci=0;const m4=new THREE.Matrix4();
 for(const s of [1,-1])for(let i=0;i<12;i++){m4.makeTranslation(s*(5.5+i*0.62),0,-(hz+2.6));chairs.setMatrixAt(ci++,m4);}
 chairs.castShadow=true;root.add(chairs);
 // ribbon boards around the court edge (behind the baselines)
 for(const s of [1,-1]){const rb=new THREE.Mesh(new THREE.PlaneGeometry(apronZ*2,0.9),ledMat);rb.position.set(s*(apronX+0.2),0.45,0);rb.rotation.y=s>0?-Math.PI/2:Math.PI/2;root.add(rb);}

 // ---------- stands and crowd ----------
 const stands=new THREE.Group();
 const stepMat=new THREE.MeshStandardMaterial({color:0x1b1e26,roughness:0.85});
 const seatMat=new THREE.MeshStandardMaterial({color:new THREE.Color(home.primary).multiplyScalar(0.55),roughness:0.7});
 // lower bowl plus an upper deck behind a fascia, so no dark wall shows above the crowd
 const rows=quality>=2?14:9,upper=quality>=2?10:6,rowD=0.85,rowH=0.42,deckGap=1.4,deckRise=1.8;
 const tiers=[];
 // sides (long) and ends
 const sectors=[{axis:'z',sgn:1,len:hx*2+8,off:hz+4.2},{axis:'z',sgn:-1,len:hx*2+8,off:hz+4.6},{axis:'x',sgn:1,len:hz*2+6,off:hx+5.0},{axis:'x',sgn:-1,len:hz*2+6,off:hx+5.0}];
 const seatGeos=[],stepGeos=[],crowdSpots=[];
 for(const sec of sectors){
  for(let r=0;r<rows+upper;r++){
   const deck=r>=rows,d=sec.off+r*rowD+(deck?deckGap:0),y=0.6+r*rowH+(deck?deckRise:0);
   const step=new THREE.BoxGeometry(sec.axis==='z'?sec.len:rowD,y,sec.axis==='z'?rowD:sec.len);
   step.translate(sec.axis==='z'?0:sec.sgn*d,y/2,sec.axis==='z'?sec.sgn*d:0);stepGeos.push(step);
   const n=Math.floor(sec.len/0.55);
   for(let i=0;i<n;i++){
    const u=-sec.len/2+0.28+i*0.55;
    const x=sec.axis==='z'?u:sec.sgn*d,z=sec.axis==='z'?sec.sgn*d:u;
    crowdSpots.push({x,y,z,face:sec.axis==='z'?(sec.sgn>0?Math.PI:0):(sec.sgn>0?-Math.PI/2:Math.PI/2),row:r});
   }
  }
 }
 stands.add(new THREE.Mesh(mergeGeometries(stepGeos),stepMat));
 root.add(stands);
 dyn.crowdSpots=crowdSpots;

 // walls, ceiling, light rig, centre-hung scoreboard
 const shell=new THREE.Mesh(new THREE.CylinderGeometry(42,42,26,48,1,true),new THREE.MeshStandardMaterial({color:0x07080c,roughness:0.95,side:THREE.BackSide}));shell.position.y=12;shell.scale.set(1,1,0.72);root.add(shell);
 const ceil=new THREE.Mesh(new THREE.CircleGeometry(42,48),new THREE.MeshStandardMaterial({color:0x050608,roughness:1,side:THREE.BackSide}));ceil.rotation.x=-Math.PI/2;ceil.position.y=24;ceil.scale.set(1,0.72,1);root.add(ceil);
 const fixtureMat=new THREE.MeshBasicMaterial({color:0xfff6e8,toneMapped:false});
 const fixtures=new THREE.InstancedMesh(new THREE.BoxGeometry(1.2,0.15,0.5),fixtureMat,32);
 for(let i=0;i<32;i++){const a=i/32*Math.PI*2;m4.makeTranslation(Math.cos(a)*16,19.5,Math.sin(a)*11);fixtures.setMatrixAt(i,m4);}
 root.add(fixtures);
 const sb=displayCanvas(512,256);dyn.scoreboard=sb;
 const cube=new THREE.Group();cube.position.set(0,13.5,0);
 const cubeBody=new THREE.Mesh(new THREE.BoxGeometry(4.8,2.8,4.8),new THREE.MeshStandardMaterial({color:0x101218,roughness:0.5,metalness:0.4}));cube.add(cubeBody);
 for(let i=0;i<4;i++){const f=new THREE.Mesh(new THREE.PlaneGeometry(4.4,2.2),new THREE.MeshBasicMaterial({map:sb.texture,toneMapped:false}));f.position.set(Math.sin(i*Math.PI/2)*2.42,0,Math.cos(i*Math.PI/2)*2.42);f.rotation.y=i*Math.PI/2;cube.add(f);}
 const ring=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,0.5,48,1,true),ledMat);ring.position.y=-1.8;cube.add(ring);
 root.add(cube);

 // ---------- lights ----------
 const lights=new THREE.Group();
 lights.add(new THREE.HemisphereLight(0xfff4e6,0x2a1a10,0.55));
 const key=new THREE.DirectionalLight(0xfff3e2,2.6);key.position.set(4,22,6);key.target.position.set(0,0,0);
 key.castShadow=true;key.shadow.mapSize.set(quality>=2?2048:1024,quality>=2?2048:1024);
 Object.assign(key.shadow.camera,{left:-hx-2,right:hx+2,top:hz+2,bottom:-hz-2,near:5,far:40});key.shadow.bias=-0.0004;key.shadow.normalBias=0.02;
 lights.add(key,key.target);
 const fill=new THREE.DirectionalLight(0xdbe6ff,0.8);fill.position.set(-8,14,-10);lights.add(fill);
 const back=new THREE.DirectionalLight(0xffe2c0,0.6);back.position.set(10,12,12);lights.add(back);
 root.add(lights);
 dyn.key=key;

 return {root,dyn};
}

function buildNet(r,depth){
 // 12 strings x 7 knots, drawn as line segments (diamond mesh) - light and readable
 const strings=12,knots=7,pos=[],idx=[];
 for(let k=0;k<knots;k++){
  const t=k/(knots-1),rad=r*(1-0.45*t),y=-depth*t;
  for(let i=0;i<strings;i++){const a=(i+(k%2)*0.5)/strings*Math.PI*2;pos.push(Math.cos(a)*rad,y,Math.sin(a)*rad);}
 }
 for(let k=0;k<knots-1;k++)for(let i=0;i<strings;i++){
  const a=k*strings+i,b=(k+1)*strings+i,c=(k+1)*strings+((i+(k%2?1:strings-1))%strings);
  idx.push(a,b,a,c);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);
 const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xf4f4f4,transparent:true,opacity:0.9}));
 m.userData.knots=knots;m.userData.strings=strings;
 return m;
}

/** Redraw the shot clocks and the centre scoreboard (only when the values change). */
export function drawDisplays(dyn,s,colors){
 const sc=Math.ceil(s.shotClock),key=`${sc}|${s.shotClockOn}`;
 if(dyn._sc!==key){dyn._sc=key;for(const d of dyn.shotClocks){const g=d.ctx;g.fillStyle='#050505';g.fillRect(0,0,256,96);g.fillStyle=sc<=5?'#ff3b30':'#ffb020';g.font='bold 80px monospace';g.textAlign='center';g.textBaseline='middle';g.fillText(s.shotClockOn||s.phase==='live'?String(Math.max(0,sc)).padStart(2,'0'):'--',128,52);d.texture.needsUpdate=true;}}
 const clock=Math.max(0,s.clock),mm=Math.floor(clock/60),ss=Math.floor(clock%60),tenth=clock<60?`.${Math.floor((clock*10)%10)}`:'';
 const bkey=`${s.score[0]}|${s.score[1]}|${s.quarter}|${mm}:${ss}${tenth}`;
 if(dyn._sb!==bkey){dyn._sb=bkey;const g=dyn.scoreboard.ctx;g.fillStyle='#04060b';g.fillRect(0,0,512,256);
  g.fillStyle=colors[0];g.fillRect(16,20,200,120);g.fillStyle=colors[1];g.fillRect(296,20,200,120);
  g.fillStyle='#fff';g.font='bold 96px monospace';g.textAlign='center';g.textBaseline='middle';g.fillText(String(s.score[0]),116,84);g.fillText(String(s.score[1]),396,84);
  g.fillStyle='#ffb020';g.font='bold 54px monospace';g.fillText(clock<60?`${ss}${tenth}`:`${mm}:${String(ss).padStart(2,'0')}`,256,200);
  for(let i=0;i<4;i++){g.fillStyle=i<Math.min(4,s.quarter)?'#ffb020':'#2a3040';g.beginPath();g.arc(226+i*20,84,7,0,Math.PI*2);g.fill();}dyn.scoreboard.texture.needsUpdate=true;}
}

/** Street Slam 3D presentation. Fed by engine snapshots and events only; it
 * never awards points or changes the match. Built from the Codex design scene
 * (Sunset Court): same palette, light, camera direction and Kenney rig. */
import {THREE,loadCharacter} from '../../js/char3d.js';
import {slamPose,blendPose} from './slam-poses.mjs?v=island-citydetail-20261025-2';

const lerp=(a,b,t)=>a+(b-a)*t;
function lerpAngle(a,b,t){const d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;}

/** Bake every static mesh of a group into one mesh per material (draw-call budget). */
function mergeStatic(root,scene){
 root.updateMatrixWorld(true);const groups=new Map();
 root.traverse(o=>{if(o.isMesh&&!o.userData.dynamic){const key=o.material.uuid+(o.castShadow?'c':'')+(o.receiveShadow?'r':'');if(!groups.has(key))groups.set(key,{material:o.material,cast:o.castShadow,receive:o.receiveShadow,list:[]});groups.get(key).list.push(o);}});
 const merged=[];
 for(const g of groups.values()){
  let count=0,icount=0;const parts=[];
  for(const m of g.list){const geo=m.geometry.index?m.geometry:m.geometry;const p=geo.attributes.position.count;parts.push({m,geo});count+=p;icount+=geo.index?geo.index.count:p;}
  const pos=new Float32Array(count*3),nor=new Float32Array(count*3),idx=new Uint32Array(icount);let vo=0,io=0;
  const v=new THREE.Vector3(),nm=new THREE.Matrix3();
  for(const {m,geo} of parts){
   const P=geo.attributes.position,N=geo.attributes.normal;nm.getNormalMatrix(m.matrixWorld);
   for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);pos.set([v.x,v.y,v.z],(vo+i)*3);v.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();nor.set([v.x,v.y,v.z],(vo+i)*3);}
   if(geo.index)for(let i=0;i<geo.index.count;i++)idx[io+i]=geo.index.getX(i)+vo;else for(let i=0;i<P.count;i++)idx[io+i]=vo+i;
   io+=geo.index?geo.index.count:P.count;vo+=P.count;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,g.material);mesh.castShadow=g.cast;mesh.receiveShadow=g.receive;merged.push(mesh);
 }
 for(const g of groups.values())for(const m of g.list){m.removeFromParent();m.geometry.dispose();}
 for(const m of merged)scene.add(m);
 return merged;
}

function bakeLocal(meshes,material){
 let count=0,icount=0;for(const m of meshes){count+=m.geometry.attributes.position.count;icount+=m.geometry.index.count;}
 const pos=new Float32Array(count*3),nor=new Float32Array(count*3),idx=new Uint32Array(icount),v=new THREE.Vector3(),nm=new THREE.Matrix3();let vo=0,io=0;
 for(const m of meshes){const P=m.geometry.attributes.position,N=m.geometry.attributes.normal,I=m.geometry.index;nm.getNormalMatrix(m.matrix);
  for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(m.matrix);pos[(vo+i)*3]=v.x;pos[(vo+i)*3+1]=v.y;pos[(vo+i)*3+2]=v.z;v.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();nor[(vo+i)*3]=v.x;nor[(vo+i)*3+1]=v.y;nor[(vo+i)*3+2]=v.z;}
  for(let i=0;i<I.count;i++)idx[io+i]=I.getX(i)+vo;vo+=P.count;io+=I.count;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setIndex(new THREE.BufferAttribute(idx,1));g.computeBoundingSphere();
 return new THREE.Mesh(g,material);
}

function buildCourt(scene,config){
 const c=config.court,col=config.render.colors,mats=new Map(),root=new THREE.Group();scene.add(root);
 const mat=color=>{if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.87}));return mats.get(color);};
 const cube=(w,h,d,color,x,y,z,parent=root)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
 const sphere=(r,color,x,y,z,parent=root)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),mat(color));o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;};
 // Props on the +X side sit between a landscape camera and the court; they are
 // merged separately so that view can hide them.
 const near=new THREE.Group();scene.add(near);
 const pipe=(a,b,r,color,parent=root,seg=8)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),v=B.clone().sub(A);const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),seg),mat(color));o.position.copy(A.add(B).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());o.castShadow=parent===root;o.receiveShadow=true;parent.add(o);return o;};
 const line=(pts,color=col.courtLines,w=.026,parent=root)=>{for(let i=1;i<pts.length;i++)pipe(pts[i-1],pts[i],w,color,parent,6);};
 const arc=(cx,cz,r,a0,a1,y=.13,n=56)=>{const pts=[];for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;pts.push([cx+Math.cos(a)*r,y,cz+Math.sin(a)*r]);}line(pts);};
 const hw=c.width/2,hl=c.length/2;
 cube(70,.2,70,'#b3b9a5',0,-.35,0);cube(17,.3,22,'#ded0b0',0,-.16,0);cube(c.width+.7,.08,c.length+.7,col.court,0,.02,0);
 for(const s of [-1,1])cube(c.paintWidth,.09,c.paintLength,col.paint,0,.075,s*(hl+.35-c.paintLength/2));
 line([[-hw,.13,-hl],[hw,.13,-hl],[hw,.13,hl],[-hw,.13,hl],[-hw,.13,-hl]]);line([[-hw,.13,0],[hw,.13,0]]);arc(0,0,c.centerRadius,0,Math.PI*2);
 for(const s of [-1,1]){
  const z=s*hl,pw=c.paintWidth/2;line([[-pw,.13,z],[-pw,.13,s*c.freeThrowZ],[pw,.13,s*c.freeThrowZ],[pw,.13,z]]);
  arc(0,s*c.freeThrowZ,c.keyRadius,s<0?0:Math.PI,s<0?Math.PI:Math.PI*2);
  // The rule line: the same centre and radius the engine uses for 3 points.
  arc(0,s*c.threeCenterZ,c.threeRadius,s<0?0:Math.PI,s<0?Math.PI:Math.PI*2,.13,80);
 }
 const hoops={};
 for(const [team,s] of [['home',-1],['away',1]]){
  const poleZ=s*c.poleZ,boardZ=s*c.boardZ,ringZ=s*c.hoopZ,toward=-s;
  cube(.2,4.8,.22,'#153a44',0,2.4,poleZ);pipe([0,4.4,poleZ],[0,3.7,boardZ+s*.06],.12,'#173b44');
  cube(c.boardWidth,c.boardTop-c.boardBottom,c.boardThickness,'#e8ede2',0,(c.boardTop+c.boardBottom)/2,boardZ);
  cube(1.04,.69,.115,'#e0703c',0,c.hoopHeight+.43,boardZ+toward*.01);cube(.87,.53,.13,'#e8ede2',0,c.hoopHeight+.43,boardZ+toward*.03);
  cube(.6,1.3,.62,'#307b85',0,.66,poleZ);
  // Ring and net are dynamic so a made shot can swish and a rim hit can shake.
  const hoop=new THREE.Group();hoop.position.set(0,c.hoopHeight,ringZ);scene.add(hoop);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(c.ringRadius,c.ringTube,8,40),new THREE.MeshStandardMaterial({color:'#f68a45',roughness:.5,metalness:.2}));ring.rotation.x=Math.PI/2;ring.castShadow=true;ring.userData.dynamic=true;hoop.add(ring);
  const net=new THREE.Group();net.userData.dynamic=true;hoop.add(net);const netMat=new THREE.MeshStandardMaterial({color:'#e6ece1',roughness:.9});
  const strand=(a,b)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),v=B.clone().sub(A);const o=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,v.length(),4),netMat);o.position.copy(A.add(B).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());o.userData.dynamic=true;net.add(o);};
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=a+.38;strand([Math.cos(a)*c.ringRadius,-.02,Math.sin(a)*c.ringRadius],[Math.cos(b)*.27,-c.netDepth,Math.sin(b)*.27]);}
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2,b=(i+1)/24*Math.PI*2;strand([Math.cos(a)*.27,-c.netDepth,Math.sin(a)*.27],[Math.cos(b)*.27,-c.netDepth,Math.sin(b)*.27]);}
  // One draw call per net: bake the strands in the net's own space.
  const strands=[...net.children];for(const m of strands)m.updateMatrix();
  const baked=bakeLocal(strands,netMat);for(const m of strands){m.removeFromParent();m.geometry.dispose();}baked.userData.dynamic=true;net.add(baked);
  hoops[team]={hoop,ring,net,shake:0,swish:0};
 }
 // Surroundings: fence, buildings, trees, benches (broad silhouettes, bounded detail).
 for(const x of [-8,8]){for(let z=-10;z<=10;z+=2.5)pipe([x,0,z],[x,2.3,z],.04,'#405e59');for(const y of [.6,1.35,2.25])pipe([x,y,-10],[x,y,10],.025,'#708b79');for(let z=-9.6;z<10;z+=.45)pipe([x,.2,z],[x,2.2,z+.7],.009,'#7a9280',root,4);}
 for(let i=0;i<9;i++){const x=-17+i*4.1,z=-16-(i%2)*2,h=5+i%4*1.6;cube(3.7,h,5,['#d6bfa0','#7b9a9b','#b8ad8e'][i%3],x,h/2,z);cube(4,.22,5.3,'#e8d7b4',x,h+.1,z);for(let y=1;y<h-.5;y+=1.3)for(let j=-1;j<=1;j++)cube(.53,.72,.06,'#496b73',x+j,y,z+2.54);}
 for(const x of [-11.8,11.8])for(let z=-11;z<12;z+=6){const g=x>0?near:root;pipe([x,0,z],[x,3,z],.18,'#71694e',g);for(let j=0;j<3;j++)sphere(1.25+j*.13,['#577c55','#628553','#8b9a5e'][j],x+(j-1)*.45,3.7+j*.5,z,g);cube(2.6,.5,2.6,'#d2c19f',x,.1,z,g);}
 for(const x of [-10,10])for(const z of [-5,5]){const g=x>0?near:root;cube(1.1,.2,3.2,'#b79565',x,.7,z,g);for(const dz of [-1.2,1.2])cube(.12,.65,.12,'#26464a',x,.35,z+dz,g);}
 const draws=mergeStatic(root,scene).length,nearSide=mergeStatic(near,scene);root.removeFromParent();near.removeFromParent();
 return {hoops,draws:draws+nearSide.length,nearSide,materials:mats};
}

function ballMesh(config){
 const r=config.court.ballRadius,g=new THREE.Group();
 const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),new THREE.MeshStandardMaterial({color:'#f28a35',roughness:.7}));m.castShadow=true;g.add(m);
 const seamMat=new THREE.MeshStandardMaterial({color:'#402e2a'});
 for(const rot of [0,Math.PI/2]){const s=new THREE.Mesh(new THREE.TorusGeometry(r*1.012,.008,4,40),seamMat);s.rotation.y=rot;g.add(s);}
 const s=new THREE.Mesh(new THREE.TorusGeometry(r*1.012,.008,4,40),seamMat);s.rotation.x=Math.PI/2;g.add(s);
 return g;
}

/** Camera rig: the design's high diagonal in portrait, a broadcast side view in
 * landscape. The distance is solved once per size so a window of the court
 * fits between the HUD bands; the target then follows play along the court. */
function cameraFor(width,height,config,insets){
 const aspect=width/Math.max(1,height),c=config.court;
 const t=Math.max(0,Math.min(1,(aspect-.8)/(1.5-.8)));
 const dirP=new THREE.Vector3(10.8,16.4,20.9).normalize(),dirL=new THREE.Vector3(17,15.5,3.2).normalize();
 const dir=dirP.clone().lerp(dirL,t).normalize(),fov=lerp(config.render.fov,36,t);
 const cam=new THREE.PerspectiveCamera(fov,aspect,.1,140);
 const hw=lerp(c.width*.36,c.width/2+.2,t),dz=lerp(c.length*.27,c.length*.3,t);
 const pts=[[-hw,0,-dz],[hw,0,-dz],[-hw,0,dz],[hw,0,dz],[0,1.9,-dz],[0,1.9,dz]].map(p=>new THREE.Vector3(...p));
 const top=1-2*insets.top/height,bottom=-1+2*insets.bottom/height,side=1-2*insets.side/width,mid=(top+bottom)/2;
 const target=new THREE.Vector3();
 cam.setViewOffset(width,height,0,mid*height/2,width,height);
 const fits=d=>{cam.position.copy(target).addScaledVector(dir,d);cam.lookAt(target);cam.updateMatrixWorld();cam.updateProjectionMatrix();
  return pts.every(p=>{const v=p.clone().project(cam);return v.x>-side&&v.x<side&&v.y<top&&v.y>bottom;});};
 let lo=6,hi=90;for(let i=0;i<28;i++){const m=(lo+hi)/2;if(fits(m))hi=m;else lo=m;}
 const offset=dir.clone().multiplyScalar(hi);cam.position.copy(offset);cam.lookAt(target);cam.updateMatrixWorld();cam.updateProjectionMatrix();
 return {camera:cam,offset,distance:hi,follow:Math.max(0,c.length/2-dz+2),followX:lerp(c.width*.16,0,t),landscape:t};
}

export async function createSlamView(canvas,config,{quality='high',insets=()=>({top:96,bottom:150,side:12}),document:doc=canvas.ownerDocument}={}){
 const r=config.render,col=r.colors,win=doc.defaultView,reduced=!!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const mobile=Math.min(win.screen?.width||1e4,win.screen?.height||1e4)<700;
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:quality==='high',alpha:false,powerPreference:'high-performance'});}
 catch(e){throw new Error('webgl-unavailable');}
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=r.exposure;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#afc8c5');scene.fog=new THREE.Fog('#afc8c5',30,80);
 scene.add(new THREE.HemisphereLight('#daefff','#b39367',2.1));
 const sun=new THREE.DirectionalLight('#ffe0aa',3.5);sun.position.set(-9,16,5);sun.castShadow=true;const sm=mobile?r.mobileShadowMap:r.shadowMap;sun.shadow.mapSize.set(sm,sm);
 Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:.5,far:50});sun.shadow.bias=-.00025;scene.add(sun);
 const court=buildCourt(scene,config);
 const ball=ballMesh(config);scene.add(ball);
 const marker=new THREE.Mesh(new THREE.RingGeometry(.62,.72,48),new THREE.MeshBasicMaterial({color:'#e9f7d6',side:THREE.DoubleSide,transparent:true,opacity:.92,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.y=.15;scene.add(marker);
 const markerArrow=new THREE.Mesh(new THREE.ConeGeometry(.16,.3,3),new THREE.MeshBasicMaterial({color:'#e9f7d6',transparent:true,opacity:.92,depthWrite:false}));markerArrow.rotation.x=Math.PI/2;scene.add(markerArrow);
 const target=new THREE.Mesh(new THREE.RingGeometry(.7,.9,48),new THREE.MeshBasicMaterial({color:col.energy,side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false}));target.rotation.x=-Math.PI/2;target.position.y=.16;target.visible=false;scene.add(target);
 const burst=new THREE.Mesh(new THREE.RingGeometry(.4,.5,40),new THREE.MeshBasicMaterial({color:'#fff3c4',side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));burst.rotation.x=-Math.PI/2;scene.add(burst);

 // Characters: the shared Kenney rig, team colour and number on the back.
 const actors=new Map();
 const ids=['h1','h2','a1','a2'];
 const loaded=await Promise.all(ids.map(id=>{const home=id[0]==='h',shirt=home?col.home:col.away;
  return loadCharacter({shirt,shirt2:shirt,shorts:home?col.shortsHome:col.shortsAway,number:r.numbers[id],numberColor:home?'#ffffff':'#fff6dd',face:false});}));
 loaded.forEach((ch,i)=>{const wrap=new THREE.Group();wrap.scale.setScalar(.019);wrap.add(ch.model);scene.add(wrap);ch.outline.visible=false;
  const map=ch.mesh.material.map;ch.mesh.material.dispose();ch.mesh.material=new THREE.MeshStandardMaterial({map,roughness:.8});ch.mesh.castShadow=true;
  actors.set(ids[i],{ch,wrap,pose:null,phase:i*.25,hand:ch.rig.b.LeftHand,other:ch.rig.b.RightHand});});

 let inspect=null,camera,rig=null,focus=new THREE.Vector3(),width=1,height=1,dpr=1,shake=0,frames=0,slow=0,lowered=quality!=='high';
 const seen=new Set(),pending=[];
 function resize(w,h,ratio){width=Math.max(1,w);height=Math.max(1,h);dpr=Math.min(ratio,mobile?r.mobileDprCap:r.dprCap)*(lowered?.75:1);renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);rig=cameraFor(width,height,config,insets());camera=rig.camera;scene.fog.near=rig.distance*.95;scene.fog.far=rig.distance*2.4;for(const m of court.nearSide)m.visible=rig.landscape<.5;}
 const v3=new THREE.Vector3(),v4=new THREE.Vector3();

 function poseActor(a,p){
  const {ch,wrap}=a,pos=wrap.position.clone(),rot=wrap.quaternion.clone(),scale=wrap.scale.clone();
  wrap.position.set(0,0,0);wrap.quaternion.identity();wrap.scale.setScalar(1);wrap.updateMatrixWorld(true);ch.rig.apply(p,true);
  wrap.position.copy(pos);wrap.quaternion.copy(rot);wrap.scale.copy(scale);wrap.updateMatrixWorld(true);
 }

 function render(prev,cur,alpha,dt=1/60){
  if(!camera)return;
  const k=1-Math.exp(-dt*16);
  const defendingTeam=cur.ball.ownerId?(cur.ball.ownerId[0]==='h'?'away':'home'):null;
  for(const p of cur.players){
   const q=prev.players.find(x=>x.id===p.id)||p,a=actors.get(p.id);
   const x=lerp(q.position.x,p.position.x,alpha),y=lerp(q.position.y,p.position.y,alpha),z=lerp(q.position.z,p.position.z,alpha);
   a.wrap.position.set(x,.14+y,z);a.wrap.rotation.y=lerpAngle(q.yaw,p.yaw,alpha);
   a.phase=(a.phase+dt*Math.max(.6,p.speed)*.55)%1;
   const target=slamPose(p.animation,{t:p.animationT,phase:a.phase,speed:p.speed,dribble:cur.ball.dribble,defending:defendingTeam===p.team,airborne:p.position.y>.02,hasBall:p.hasBall});
   a.pose=blendPose(a.pose,target,p.animation==='dribble'||p.animation==='run'?Math.min(1,k*1.6):k);
   poseActor(a,a.pose);
  }
  // Ball: physics position when free, the hand when held.
  const owner=cur.ball.ownerId&&actors.get(cur.ball.ownerId);
  if(owner){
   const p=cur.players.find(x=>x.id===cur.ball.ownerId);owner.hand.getWorldPosition(v3);owner.other.getWorldPosition(v4);
   if(p.animation==='dribble'||p.animation==='run'){const h=Math.abs(Math.sin(cur.ball.dribble*Math.PI));ball.position.set(v3.x,lerp(config.court.ballRadius+.14,v3.y-.12,h),v3.z);}
   else if(p.animation==='dunk'&&p.position.y>.05){ball.position.copy(v3);ball.position.y+=.16;}
   else {ball.position.copy(v3).add(v4).multiplyScalar(.5);const f=new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw));ball.position.addScaledVector(f,.2);}
  } else {const a0=prev.ball.position,b0=cur.ball.position;ball.position.set(lerp(a0.x,b0.x,alpha),lerp(a0.y,b0.y,alpha)+.14,lerp(a0.z,b0.z,alpha));}
  ball.rotation.x+=dt*(owner?6:Math.hypot(cur.ball.velocity.x,cur.ball.velocity.z)*3);
  const ctrl=actors.get(cur.controlledPlayerId);
  marker.visible=markerArrow.visible=!!ctrl&&cur.phase!=='finished';
  if(ctrl){marker.position.set(ctrl.wrap.position.x,.15,ctrl.wrap.position.z);const pulse=1+Math.sin(cur.tick*.12)*.05;marker.scale.setScalar(pulse);
   const yaw=ctrl.wrap.rotation.y;markerArrow.position.set(ctrl.wrap.position.x+Math.sin(yaw)*.95,.17,ctrl.wrap.position.z+Math.cos(yaw)*.95);markerArrow.rotation.set(Math.PI/2,0,-yaw+Math.PI);}
  if(cur.practice&&cur.practice.step===0){target.visible=true;target.position.set(cur.practice.target.x,.16,cur.practice.target.z);target.scale.setScalar(1+Math.sin(cur.tick*.1)*.08);}else target.visible=false;
  for(const h of Object.values(court.hoops)){
   h.shake=Math.max(0,h.shake-dt*3);h.swish=Math.max(0,h.swish-dt*2.2);
   h.hoop.rotation.x=reduced?0:Math.sin(cur.tick*.9)*.05*h.shake;
   h.net.scale.set(1-h.swish*.18,1+h.swish*.35,1-h.swish*.18);
  }
  if(burst.material.opacity>0){burst.material.opacity=Math.max(0,burst.material.opacity-dt*1.6);burst.scale.multiplyScalar(1+dt*3);}
  shake=Math.max(0,shake-dt*2.5);
  // Follow play along the court length, toward the attacked basket.
  const bz=ball.position.z,bx=ball.position.x,attack=cur.attackTeam==='home'?-1:1;
  let fz=Math.max(-rig.follow,Math.min(rig.follow,bz*.8+attack*.8)),fx=Math.max(-rig.followX,Math.min(rig.followX,bx*.5));
  if(inspect){const a=actors.get(inspect.id||cur.controlledPlayerId);if(a){fx=a.wrap.position.x;fz=a.wrap.position.z;}}
  const ease=dt?1-Math.exp(-dt*(reduced?1.5:3)):1;focus.x+=(fx-focus.x)*ease;focus.z+=(fz-focus.z)*ease;
  camera.position.copy(focus).add(inspect?rig.offset.clone().multiplyScalar(inspect.zoom||.35):rig.offset);camera.lookAt(focus.x,inspect?(inspect.y??1):0,focus.z);
  const base=camera.position.clone();
  if(shake>0&&!reduced)camera.position.add(new THREE.Vector3(Math.sin(cur.tick*1.7)*.08*shake,Math.cos(cur.tick*2.3)*.06*shake,0));
  renderer.render(scene,camera);camera.position.copy(base);frames++;
 }

 function effects(events){
  for(const e of events){if(seen.has(e.seq))continue;seen.add(e.seq);
   if(seen.size>400){const first=seen.values().next().value;seen.delete(first);}
   if(e.type==='score'){const h=court.hoops[e.team];h.swish=1;burst.position.set(0,.17,h.hoop.position.z);burst.scale.setScalar(1);burst.material.opacity=.9;if(e.kind==='dunk'){h.shake=1;shake=1;}}
   else if(e.type==='rim'){const near=Object.values(court.hoops).reduce((m,h)=>Math.abs(h.hoop.position.z-ball.position.z)<Math.abs(m.hoop.position.z-ball.position.z)?h:m);near.shake=Math.min(1,.4+e.speed*.12);}
   else if(e.type==='block')shake=Math.max(shake,.5);
  }
 }

 /** Screen joystick -> court direction for the current camera. */
 function screenBasis(){
  if(!camera)return {rx:1,rz:0,ux:0,uz:-1};
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);right.y=0;right.normalize();
  const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);fwd.y=0;fwd.normalize();
  return {rx:right.x,rz:right.z,ux:fwd.x,uz:fwd.z};
 }
 function project(x,y,z){if(!camera)return null;const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x+1)/2*width,y:(1-v.y)/2*height,visible:v.z<1};}
 function actorScreen(id,h=2.3){const a=actors.get(id);if(!a)return null;return project(a.wrap.position.x,a.wrap.position.y+h,a.wrap.position.z);}
 function observeFrame(ms){if(!ms)return;if(ms>r.slowFrameMs)slow++;else slow=Math.max(0,slow-1);if(slow>r.qualitySampleFrames&&!lowered){lowered=true;sun.shadow.mapSize.set(512,512);sun.shadow.map?.dispose();sun.shadow.map=null;resize(width,height,dpr/.75);}}
 function metrics(){const info=renderer.info;return {mode:'webgl',quality:lowered?'low':'high',drawCalls:info.render.calls,triangles:info.render.triangles,frames,dpr,width,height,staticDraws:court.draws,textures:info.memory.textures,geometries:info.memory.geometries};}
 function dispose(){
  scene.traverse(o=>{if(o.geometry)o.geometry.dispose();const ms=o.material?Array.isArray(o.material)?o.material:[o.material]:[];for(const m of ms){m.map?.dispose();m.gradientMap?.dispose?.();m.dispose();}});
  for(const a of actors.values())a.ch.mesh?.skeleton?.dispose?.();
  sun.shadow.map?.dispose();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss?.();
 }
 return {setInspect(v){inspect=v||null;},render,effects,resize,dispose,screenBasis,project,actorScreen,observeFrame,metrics,get camera(){return camera;},get lowered(){return lowered;}};
}

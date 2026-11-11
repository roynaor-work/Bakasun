/** Bounded, original race effects. No effect participates in race progress. */
export function createRacingEffects({T,scene,track,keep,night=false,carColors=null,crashFx=true}){
 const root=new T.Group();root.name='racing-effects';scene.add(root);
 const dummy=new T.Object3D(),smoke=[],marks=[],sparks=[];let disposed=false,smokeCursor=0,markCursor=0,sparkCursor=0,emitAge=0,markAge=0,lastImpact=-1;
 const own=value=>(keep(value),value);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,1,32,32,31);gradient.addColorStop(0,'rgba(220,230,235,.28)');gradient.addColorStop(.4,'rgba(205,220,230,.18)');gradient.addColorStop(1,'rgba(200,220,235,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
 const smokeMap=own(new T.CanvasTexture(canvas));smokeMap.colorSpace=T.SRGBColorSpace;
 const smokeMaterial=own(new T.MeshBasicMaterial({map:smokeMap,color:night?'#9db7c7':'#ebeff0',transparent:true,depthWrite:false,opacity:.6}));
 const smokeMesh=new T.InstancedMesh(own(new T.PlaneGeometry(1,1)),smokeMaterial,32);smokeMesh.frustumCulled=false;smokeMesh.count=0;root.add(smokeMesh);
 const markMaterial=own(new T.MeshBasicMaterial({color:'#17202a',transparent:true,opacity:.32,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const markMesh=new T.InstancedMesh(own(new T.PlaneGeometry(.23,.88)),markMaterial,128);markMesh.count=0;markMesh.frustumCulled=false;root.add(markMesh);
 const sparkMaterial=own(new T.MeshBasicMaterial({color:'#ffc46a',transparent:true,opacity:.85,depthWrite:false}));
 const sparkMesh=new T.InstancedMesh(own(new T.BoxGeometry(.035,.035,.32)),sparkMaterial,20);sparkMesh.count=0;sparkMesh.frustumCulled=false;root.add(sparkMesh);
 // racing-deep-m7 crash show (Roy: "more impressive, not just a flip on the spot"): debris in the car's paint, one flying tyre, a smoke trail along the arc and dust with
 // sparks on landing. Fixed pools mutated in place (no allocation after the first fill); particles only for cars within NEAR metres of the player (far stand-ins roll only).
 // Two instanced meshes = at most two extra draw calls, and none while no car is flipping. crashFx=false (?racingCrashFx=0) keeps the m2 dust and sparks only.
 const DEBRIS=24,TYRES=4,NEAR=70,paint=new T.Color();
 const debrisMaterial=own(new T.MeshStandardMaterial({color:'#ffffff',roughness:.5,metalness:.25}));
 const debrisMesh=new T.InstancedMesh(own(new T.BoxGeometry(.3,.1,.42)),debrisMaterial,DEBRIS);debrisMesh.count=0;debrisMesh.frustumCulled=false;root.add(debrisMesh);
 for(let i=0;i<DEBRIS;i++)debrisMesh.setColorAt(i,paint.set('#9aa4aa'));   // creates the per-instance colour buffer once
 const tyreMaterial=own(new T.MeshStandardMaterial({color:'#1b2226',roughness:.92}));
 const tyreMesh=new T.InstancedMesh(own(new T.CylinderGeometry(.33,.33,.3,10)),tyreMaterial,TYRES);tyreMesh.count=0;tyreMesh.frustumCulled=false;root.add(tyreMesh);
 const debris=Array.from({length:DEBRIS},()=>({on:false,x:0,y:0,z:0,dx:0,dy:0,dz:0,age:0,life:1,spin:0,ground:0}));
 const tyres=Array.from({length:TYRES},()=>({on:false,x:0,y:0,z:0,dx:0,dy:0,dz:0,age:0,roll:0,heading:0,ground:0}));
 let debrisCursor=0,tyreCursor=0;const trail=new Float64Array(16),tyreDummy=new T.Object3D();tyreDummy.rotation.order='YXZ';   // yaw, then roll about the axle, then the cylinder laid on its side
 // reuse a pool entry instead of allocating a new object (the m2 emitters above allocate per emission; the crash show emits every frame of the flight)
 function smokeAt(x,y,z,dx,dz,size,life){const i=smokeCursor++%32,s=smoke[i]||(smoke[i]={});s.x=x;s.y=y;s.z=z;s.dx=dx;s.dz=dz;s.size=size;s.life=life;s.age=0;}
 function sparkAt(x,y,z,dx,dy,dz){const i=sparkCursor++%20,s=sparks[i]||(sparks[i]={});s.x=x;s.y=y;s.z=z;s.dx=dx;s.dy=dy;s.dz=dz;s.age=0;}
 function crashStart(c,index){
  if(carColors&&carColors[index])paint.set(carColors[index]);else paint.set('#9aa4aa');
  for(let i=0;i<5;i++){const d=debris[debrisCursor%DEBRIS],a=c.heading+1.1+i*1.25;d.on=true;d.x=c.x;d.y=c.y+.5;d.z=c.z;d.dx=Math.sin(a)*(2.5+i*.6)+Math.sin(c.heading)*c.speed*.25;d.dz=Math.cos(a)*(2.5+i*.6)+Math.cos(c.heading)*c.speed*.25;d.dy=3.2+i*.55;d.age=0;d.life=1.05+i*.07;d.spin=4+i*1.7;d.ground=c.y;
   debrisMesh.setColorAt(debrisCursor%DEBRIS,paint);debrisCursor++;}
  debrisMesh.instanceColor.needsUpdate=true;
  const t=tyres[tyreCursor++%TYRES],side=c.lateral>0?-1:1,a=c.heading+side*1.3;t.on=true;t.x=c.x+Math.cos(c.heading)*side*.9;t.y=c.y+.4;t.z=c.z-Math.sin(c.heading)*side*.9;t.dx=Math.sin(a)*3.4+Math.sin(c.heading)*c.speed*.35;t.dz=Math.cos(a)*3.4+Math.cos(c.heading)*c.speed*.35;t.dy=4.2;t.age=0;t.roll=0;t.heading=c.heading;t.ground=c.y;
 }
 function crashLand(c){for(let i=0;i<5;i++){const a=i*1.26;smokeAt(c.x+Math.sin(a)*.7,c.y+.3,c.z+Math.cos(a)*.7,Math.sin(a)*2.2,Math.cos(a)*2.2,1.0,.9);}for(let i=0;i<8;i++)sparkAt(c.x,c.y+.3,c.z,Math.sin(c.heading+i*.79)*3,1.2+(i%2)*.6,Math.cos(c.heading+i*.79)*3);}
 function putSmoke(p,side){const x=p.x+Math.cos(p.heading)*side-Math.sin(p.heading)*1.55,z=p.z-Math.sin(p.heading)*side-Math.cos(p.heading)*1.55;smoke[smokeCursor++%32]={x,y:p.y+.26,z,age:0,life:.9,size:.55,dx:Math.sin(p.heading)*-1.8+side*.25,dz:Math.cos(p.heading)*-1.8};}
 function putMark(p,side){const x=p.x+Math.cos(p.heading)*side-Math.sin(p.heading)*1.4,z=p.z-Math.sin(p.heading)*side-Math.cos(p.heading)*1.4;marks[markCursor++%128]={x,y:track.project(x,z,p.s).y+.065,z,heading:p.heading,age:0};}
 function update(state,dt,camera,quality=0){if(disposed)return;const p=state.player;
  if(dt>0){emitAge+=dt;markAge+=dt;if(p.drifting&&p.speed>12){if(emitAge>.065){emitAge=0;putSmoke(p,-.88);putSmoke(p,.88);}if(markAge>.025){markAge=0;putMark(p,-.88);putMark(p,.88);}}else if(p.offroad&&p.speed>12&&emitAge>.12){emitAge=0;putSmoke(p,-.88);putSmoke(p,.88);}
   for(const e of state.events||[]){
    // racing-deep-m2: a flip (any car) throws dust and sparks from where it happened
    if(e.type==='crash'){const list=state.cars||[],index=list.findIndex(x=>x.id===e.car),c=index>=0?list[index]:(e.car==='player'?p:null);if(!c)continue;for(let i=0;i<6;i++)smoke[smokeCursor++%32]={x:c.x+Math.sin(i*1.05)*.8,y:c.y+.4,z:c.z+Math.cos(i*1.05)*.8,age:0,life:1.4,size:1.1,dx:Math.sin(i*1.05)*1.6,dz:Math.cos(i*1.05)*1.6};for(let i=0;i<10;i++)sparks[sparkCursor++%20]={x:c.x,y:c.y+.4,z:c.z,age:0,dx:Math.sin(c.heading+i*.63)*3.5,dz:Math.cos(c.heading+i*.63)*3.5,dy:1.5+(i%3)*.6};
     if(crashFx&&c.crashDur>0&&(c===p||Math.hypot(c.x-p.x,c.z-p.z)<NEAR))crashStart(c,Math.max(0,index));continue;}
    if(e.type==='crashRecover'&&crashFx){const c=(state.cars||[]).find(x=>x.id===e.car)||(e.car==='player'?p:null);if(c&&(c===p||Math.hypot(c.x-p.x,c.z-p.z)<NEAR))crashLand(c);continue;}
    if(e.car!=='player'||(e.type!=='bump'&&e.type!=='wall')||state.time===lastImpact)continue;lastImpact=state.time;for(let i=0;i<(e.type==='wall'?14:8);i++)sparks[sparkCursor++%20]={x:p.x,y:p.y+.25,z:p.z,age:0,dx:Math.sin(p.heading+i*.73)*3,dz:Math.cos(p.heading+i*.73)*3,dy:1+(i%3)*.5};}
   // the smoke trail of a flying car (every 70 ms, from the car's height in the arc)
   if(crashFx&&state.cars)for(let i=0;i<state.cars.length&&i<16;i++){const c=state.cars[i];if(!(c.crashT>0&&c.crashDur>0)||!(c===p||Math.hypot(c.x-p.x,c.z-p.z)<NEAR)){trail[i]=0;continue;}trail[i]+=dt;if(trail[i]>.07){trail[i]=0;smokeAt(c.x,c.y+.45+(c.crashAir||0),c.z,-Math.sin(c.heading)*1.2,-Math.cos(c.heading)*1.2,.7,.8);}}
  }
  let count=0;for(const s of smoke){if(!s)continue;s.age+=dt;if(s.age>s.life)continue;s.x+=s.dx*dt;s.z+=s.dz*dt;s.y+=dt*.7;dummy.position.set(s.x,s.y,s.z);dummy.quaternion.copy(camera.quaternion);dummy.scale.setScalar((s.size+s.age*2)*(1-s.age/s.life));dummy.updateMatrix();if(count<[24,16,8][quality])smokeMesh.setMatrixAt(count++,dummy.matrix);}smokeMesh.count=count;smokeMesh.instanceMatrix.needsUpdate=true;
  count=0;for(const m of marks){if(!m)continue;m.age+=dt;if(m.age>12)continue;dummy.position.set(m.x,m.y,m.z);dummy.rotation.set(-Math.PI/2,0,m.heading);dummy.scale.set(1,1,1);dummy.updateMatrix();if(count<[128,96,64][quality])markMesh.setMatrixAt(count++,dummy.matrix);}markMesh.count=count;markMesh.instanceMatrix.needsUpdate=true;
  count=0;for(const s of sparks){if(!s)continue;s.age+=dt;if(s.age>.35)continue;s.x+=s.dx*dt;s.z+=s.dz*dt;s.y+=s.dy*dt;s.dy-=8*dt;dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(s.age*7,s.age*11,0);dummy.scale.setScalar(1-s.age/.35);dummy.updateMatrix();sparkMesh.setMatrixAt(count++,dummy.matrix);}sparkMesh.count=count;sparkMesh.instanceMatrix.needsUpdate=true;
  // debris tumbles under gravity, bounces once on the road and shrinks away; the tyre bounces and rolls on until it fades
  count=0;const debrisCap=[DEBRIS,16,8][quality];for(const d of debris){if(!d.on)continue;d.age+=dt;if(d.age>d.life){d.on=false;continue;}d.x+=d.dx*dt;d.z+=d.dz*dt;d.y+=d.dy*dt;d.dy-=9.8*dt;if(d.y<d.ground+.05){d.y=d.ground+.05;d.dy=Math.abs(d.dy)*.35;d.dx*=.6;d.dz*=.6;d.spin*=.5;}
   if(count<debrisCap){dummy.position.set(d.x,d.y,d.z);dummy.rotation.set(d.age*d.spin,d.age*d.spin*.7,d.age*d.spin*1.3);const k=d.age>d.life-.25?Math.max(0,(d.life-d.age)/.25):1;dummy.scale.setScalar(k);dummy.updateMatrix();debrisMesh.setMatrixAt(count++,dummy.matrix);}}
  if(count||debrisMesh.count){debrisMesh.count=count;debrisMesh.instanceMatrix.needsUpdate=true;}
  count=0;for(const t of tyres){if(!t.on)continue;t.age+=dt;if(t.age>1.5){t.on=false;continue;}t.x+=t.dx*dt;t.z+=t.dz*dt;t.y+=t.dy*dt;t.dy-=9.8*dt;if(t.y<t.ground+.33){t.y=t.ground+.33;t.dy=Math.abs(t.dy)*.45;t.dx*=.8;t.dz*=.8;}const v=Math.hypot(t.dx,t.dz);t.roll+=v*dt/.33;
   tyreDummy.position.set(t.x,t.y,t.z);tyreDummy.rotation.set(t.roll,Math.atan2(t.dx,t.dz),Math.PI/2);const k=t.age>1.2?Math.max(0,(1.5-t.age)/.3):1;tyreDummy.scale.setScalar(k);tyreDummy.updateMatrix();tyreMesh.setMatrixAt(count++,tyreDummy.matrix);}
  if(count||tyreMesh.count){tyreMesh.count=count;tyreMesh.instanceMatrix.needsUpdate=true;}
 }
 /** v7: the package's tire-smoke sprite replaces the generated gradient (same pool, same capacity), and the impact sparks glow additively. */
 function setSmokeMap(map){if(disposed||!map)return;smokeMaterial.map=map;smokeMaterial.opacity=.32;smokeMaterial.needsUpdate=true;sparkMaterial.blending=T.AdditiveBlending;sparkMaterial.needsUpdate=true;}
 return {update,setSmokeMap,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const mesh of [smokeMesh,markMesh,sparkMesh,debrisMesh,tyreMesh])mesh.dispose();},metrics:()=>({smoke:smokeMesh.count,skidMarks:markMesh.count,sparks:sparkMesh.count,debris:debrisMesh.count,tyres:tyreMesh.count,capacity:{smoke:32,skidMarks:128,sparks:20,debris:DEBRIS,tyres:TYRES},disposed})};
}

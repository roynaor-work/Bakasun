/** Bounded, original race effects. No effect participates in race progress. */
export function createRacingEffects({T,scene,track,keep,night=false}){
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
 function putSmoke(p,side){const x=p.x+Math.cos(p.heading)*side-Math.sin(p.heading)*1.55,z=p.z-Math.sin(p.heading)*side-Math.cos(p.heading)*1.55;smoke[smokeCursor++%32]={x,y:p.y+.26,z,age:0,life:.9,size:.55,dx:Math.sin(p.heading)*-1.8+side*.25,dz:Math.cos(p.heading)*-1.8};}
 function putMark(p,side){const x=p.x+Math.cos(p.heading)*side-Math.sin(p.heading)*1.4,z=p.z-Math.sin(p.heading)*side-Math.cos(p.heading)*1.4;marks[markCursor++%128]={x,y:track.project(x,z,p.s).y+.065,z,heading:p.heading,age:0};}
 function update(state,dt,camera,quality=0){if(disposed)return;const p=state.player;
  if(dt>0){emitAge+=dt;markAge+=dt;if(p.drifting&&p.speed>12){if(emitAge>.065){emitAge=0;putSmoke(p,-.88);putSmoke(p,.88);}if(markAge>.025){markAge=0;putMark(p,-.88);putMark(p,.88);}}else if(p.offroad&&p.speed>12&&emitAge>.12){emitAge=0;putSmoke(p,-.88);putSmoke(p,.88);}
   for(const e of state.events||[]){if(e.car!=='player'||e.type!=='bump'||state.time===lastImpact)continue;lastImpact=state.time;for(let i=0;i<8;i++)sparks[sparkCursor++%20]={x:p.x,y:p.y+.25,z:p.z,age:0,dx:Math.sin(p.heading+i*.73)*3,dz:Math.cos(p.heading+i*.73)*3,dy:1+(i%3)*.5};}
  }
  let count=0;for(const s of smoke){if(!s)continue;s.age+=dt;if(s.age>s.life)continue;s.x+=s.dx*dt;s.z+=s.dz*dt;s.y+=dt*.7;dummy.position.set(s.x,s.y,s.z);dummy.quaternion.copy(camera.quaternion);dummy.scale.setScalar((s.size+s.age*2)*(1-s.age/s.life));dummy.updateMatrix();if(count<[24,16,8][quality])smokeMesh.setMatrixAt(count++,dummy.matrix);}smokeMesh.count=count;smokeMesh.instanceMatrix.needsUpdate=true;
  count=0;for(const m of marks){if(!m)continue;m.age+=dt;if(m.age>12)continue;dummy.position.set(m.x,m.y,m.z);dummy.rotation.set(-Math.PI/2,0,m.heading);dummy.scale.set(1,1,1);dummy.updateMatrix();if(count<[128,96,64][quality])markMesh.setMatrixAt(count++,dummy.matrix);}markMesh.count=count;markMesh.instanceMatrix.needsUpdate=true;
  count=0;for(const s of sparks){if(!s)continue;s.age+=dt;if(s.age>.35)continue;s.x+=s.dx*dt;s.z+=s.dz*dt;s.y+=s.dy*dt;s.dy-=8*dt;dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(s.age*7,s.age*11,0);dummy.scale.setScalar(1-s.age/.35);dummy.updateMatrix();sparkMesh.setMatrixAt(count++,dummy.matrix);}sparkMesh.count=count;sparkMesh.instanceMatrix.needsUpdate=true;
 }
 return {update,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const mesh of [smokeMesh,markMesh,sparkMesh])mesh.dispose();},metrics:()=>({smoke:smokeMesh.count,skidMarks:markMesh.count,sparks:sparkMesh.count,capacity:{smoke:32,skidMarks:128,sparks:20},disposed})};
}

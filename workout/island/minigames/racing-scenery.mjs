/** Original, instanced roadside scenery. The view owns every registered resource. */
export function createRacingScenery({T,scene,track,colors,keep,mat,seed=1,center}){
 let word=(seed>>>0)^0x734af21;const random=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);
 const root=new T.Group();root.name='racing-original-scenery';scene.add(root);
 const material=(color,options={})=>keep(mat(color,options)),dummy=new T.Object3D(),batches=[];let disposed=false,quality=0;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
 ctx.fillStyle=colors.land;ctx.fillRect(0,0,256,256);
 for(let i=0;i<36;i++){ctx.fillStyle=i%3?'rgba(234,224,153,.045)':'rgba(15,55,35,.045)';ctx.beginPath();ctx.ellipse(random()*256,random()*256,12+random()*28,5+random()*14,random()*6.28,0,Math.PI*2);ctx.fill();}
 for(let i=0;i<4300;i++){ctx.strokeStyle=i%3?'rgba(238,244,207,.10)':'rgba(20,52,28,.10)';const x=random()*256,y=random()*256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(random()-.5)*2,y-1-random()*3);ctx.stroke();}
 const grassMap=keep(new T.CanvasTexture(canvas));grassMap.colorSpace=T.SRGBColorSpace;grassMap.wrapS=grassMap.wrapT=T.RepeatWrapping;grassMap.repeat.set(20,20);grassMap.anisotropy=4;
 const grassMaterial=material('#ffffff',{map:grassMap,roughness:1}),stone=material(colors.rock,{roughness:1}),leaf=material(track.theme==='volcano'?'#707851':'#4e8155',{roughness:1});
 const tuftMaterial=material(track.theme==='ruins'?'#a7b46b':'#91ae69',{roughness:1}),flowerMaterial=material('#ffffff',{roughness:.88}),sand=material(colors.sand,{roughness:1});
 const limit=(rows,count)=>rows.length<=count?rows:Array.from({length:count},(_,i)=>rows[Math.floor(i*rows.length/count)]);
 function batch(geometry,mat,rows,{decorative=false,shadow=false,factors=[1,.72,.25]}={}){
  keep(geometry);const inst=new T.InstancedMesh(geometry,mat,rows.length);inst.name='racing-scenery-batch';inst.castShadow=shadow;inst.receiveShadow=true;
  for(let i=0;i<rows.length;i++){const p=rows[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx||0,p.angle||0,p.rz||0);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);if(p.color)inst.setColorAt(i,new T.Color(p.color));}
  inst.instanceMatrix.needsUpdate=true;if(inst.instanceColor)inst.instanceColor.needsUpdate=true;inst.computeBoundingSphere();root.add(inst);batches.push({inst,total:rows.length,decorative,factors,triangles:(geometry.index?.count||geometry.attributes.position.count)/3});return inst;
 }
 const ground=(x,z)=>{const p=track.project(x,z);return Math.max(-1.2,p.y-1.2-Math.max(0,p.distance-track.width/2)*.2);};
 const moundRows=[],rockRows=[],bushRows=[],tuftRows=[],flowerRows=[],bollards=[],caps=[],signBoards=[],signPosts=[],chevrons=[];
 const safe=(x,z,margin)=>track.project(x,z).distance>track.width/2+margin;
 for(let distance=12;distance<track.length;distance+=18){const p=track.sample(distance);
  for(const sign of [-1,1]){
   const lane=sign*(track.width/2+3.8+random()*7),x=p.x+p.normal.x*lane,z=p.z+p.normal.z*lane;if(!safe(x,z,2.8))continue;
   const y=ground(x,z),spread=.7+random()*1.2;
   if(Math.floor(distance/18)%3===0){bushRows.push({x,y:y+.28,z,sx:1+random()*.8,sy:.5+random()*.4,sz:.8+random()*.9,angle:random()*6.28});rockRows.push({x:x+sign*2,y:y+.22,z:z+1,sx:.4+random()*.8,sy:.3+random()*.5,sz:.5+random()*.9,angle:random()*6.28});}
   for(let i=0;i<2;i++){const tx=x+(random()-.5)*spread,tz=z+(random()-.5)*spread;tuftRows.push({x:tx,y:ground(tx,tz)+.03,z:tz,sx:.7+random()*.6,sy:.45+random()*.65,sz:.7+random()*.6,angle:random()*6.28});if(i===0&&track.theme!=='volcano')flowerRows.push({x:tx,y:ground(tx,tz)+.35+random()*.2,z:tz,sx:.8,sy:1,sz:.8,color:['#f4d78c','#e5aa9d','#f0e5bc'][Math.floor(random()*3)]});}
  }
  if(Math.floor(distance/18)%4===0){const sign=random()<.5?-1:1,lane=sign*(track.width/2+19+random()*23),x=p.x+p.normal.x*lane,z=p.z+p.normal.z*lane;if(safe(x,z,15))moundRows.push({x,y:ground(x,z)-.15,z,sx:5+random()*7,sy:1.2+random()*3,sz:5+random()*10,angle:random()*6.28});}
 }
 // Place paired reflector posts on the approach to readable corners, outside the shoulder.
 for(let distance=20;distance<track.length;distance+=24){const p=track.sample(distance),next=track.sample(distance+22),turn=Math.atan2(Math.sin(next.heading-p.heading),Math.cos(next.heading-p.heading));if(Math.abs(turn)<.15)continue;
  for(const side of [-1,1]){const lane=side*(track.width/2+1.5),x=p.x+p.normal.x*lane,z=p.z+p.normal.z*lane;if(!safe(x,z,1.1))continue;const y=p.y-.035;bollards.push({x,y:y+.62,z,angle:p.heading});caps.push({x,y:y+1.03,z,angle:p.heading});}
  if(Math.abs(turn)<.35||Math.floor(distance/24)%2||signBoards.length>=12)continue;
  const outside=turn>0?-1:1,lane=outside*(track.width/2+4.6),x=p.x+p.normal.x*lane,z=p.z+p.normal.z*lane;if(!safe(x,z,4))continue;const y=ground(x,z),angle=p.heading;
  signBoards.push({x,y:y+3.05,z,angle});signPosts.push({x,y:y+1.6,z,angle});
  const facing=turn>0?1:-1;for(const offset of [-.6,.6])for(const arm of [-1,1]){const localX=offset+facing*.15,localZ=-.13;chevrons.push({x:x+Math.cos(angle)*localX+Math.sin(angle)*localZ,y:y+3.05+arm*.2,z:z-Math.sin(angle)*localX+Math.cos(angle)*localZ,angle,rz:arm*facing*Math.PI/4});}
 }
 const hemisphere=new T.SphereGeometry(1,10,4,0,Math.PI*2,0,Math.PI/2);
 batch(hemisphere,grassMaterial,limit(moundRows,16));
 const rockGeometry=new T.IcosahedronGeometry(1,0),positions=rockGeometry.attributes.position;for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),scale=.97+.06*Math.sin(x*7.1+y*5.7+z*3.9);positions.setXYZ(i,x*scale,y*scale,z*scale);}rockGeometry.computeVertexNormals();
 batch(rockGeometry,stone,limit(rockRows,50),{decorative:true});batch(new T.SphereGeometry(1,6,4),leaf,limit(bushRows,44),{decorative:true,factors:[1,.5,0]});batch(new T.ConeGeometry(.22,.7,3),tuftMaterial,limit(tuftRows,200),{decorative:true,factors:[1,.45,0]});batch(new T.IcosahedronGeometry(.13,0),flowerMaterial,limit(flowerRows,96),{decorative:true,factors:[1,.4,0]});
 batch(new T.CylinderGeometry(.09,.13,1.2,6),material('#e7e2cc'),limit(bollards,64),{decorative:true,factors:[1,.7,.35]});batch(new T.BoxGeometry(.21,.12,.21),material('#eebc65',{emissive:'#ba8236',emissiveIntensity:.12}),limit(caps,64),{decorative:true,factors:[1,.7,.35]});
 batch(new T.BoxGeometry(2.65,1.15,.16),material('#294c4a'),limit(signBoards,12));batch(new T.CylinderGeometry(.06,.08,3.2,6),material('#8c9b8f'),limit(signPosts,12));batch(new T.BoxGeometry(.12,.58,.08),material('#f0d68f'),limit(chevrons,48));
 // Low, curved islands beyond the route create depth without enclosing the sea.
 const farSand=[],farGreen=[];for(let i=0;i<8;i++){const angle=i*Math.PI*.25+.18+random()*.25,radius=360+random()*110,x=center.x+Math.cos(angle)*radius,z=center.z+Math.sin(angle)*radius,sx=25+random()*35,sz=12+random()*20;farSand.push({x,y:-3,z,sx:sx+5,sy:5+random()*3,sz:sz+5,angle:angle+.6});farGreen.push({x,y:-1.5,z,sx,sy:6+random()*12,sz,angle:angle+.6});}
 batch(new T.SphereGeometry(1,12,5,0,Math.PI*2,0,Math.PI/2),sand,farSand);batch(new T.SphereGeometry(1,12,5,0,Math.PI*2,0,Math.PI/2),grassMaterial,farGreen);
 function setQuality(q){quality=Math.max(0,Math.min(2,q|0));for(const b of batches)if(b.decorative){b.inst.count=Math.ceil(b.total*b.factors[quality]);b.inst.visible=b.inst.count>0;}}
 // Source GPU resources belong to the view's Set; only detach this scenery here.
 function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const b of batches)b.inst.dispose();root.clear();}
 return {grassMaterial,setQuality,dispose,metrics:()=>({quality,draws:batches.filter(b=>b.inst.visible&&b.inst.count>0).length,instances:batches.reduce((sum,b)=>sum+b.inst.count,0),triangles:batches.reduce((sum,b)=>sum+b.triangles*b.inst.count,0),triangleBudget:quality===2?5000:12000,mounds:Math.min(16,moundRows.length),cornerSigns:Math.min(12,signBoards.length),disposed})};
}

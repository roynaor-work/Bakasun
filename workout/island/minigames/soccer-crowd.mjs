/** Low-poly 3D heads, shirts, articulated arms and flags: four shared calls. */
export function soccerCrowd(T,scene,config,track){
 const c=config.view.crowd,n=c.count,dummy=new T.Object3D(),color=new T.Color(),material=()=>track(new T.MeshLambertMaterial()),parts={body:new T.InstancedMesh(track(new T.BoxGeometry(c.bodyWidth,c.bodyHeight,.18)),material(),n),head:new T.InstancedMesh(track(new T.IcosahedronGeometry(c.headRadius,0)),material(),n),arms:new T.InstancedMesh(track(new T.BoxGeometry(.08,c.armLength,.08)),material(),n*2),flags:new T.InstancedMesh(track(new T.BoxGeometry(.3,.2,.035)),material(),Math.ceil(n/c.flagEvery))};
 for(const mesh of Object.values(parts)){scene.add(mesh);mesh.frustumCulled=false;}
 let count=n;
 const put=(mesh,i,x,y,z,rz=0)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,0,rz);dummy.scale.setScalar(1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
 for(let i=0;i<n;i++){const shirt=c.colors[i%c.colors.length];parts.body.setColorAt(i,color.set(shirt));parts.head.setColorAt(i,color.set(i%2?'#b78161':'#efbc8e'));for(const side of [0,1])parts.arms.setColorAt(i*2+side,color.set(shirt));if(i%c.flagEvery===0)parts.flags.setColorAt(i/c.flagEvery,color.set(shirt));}
 function update(time,cheering){let f=0;for(let i=0;i<count;i++){const x=-14.8+(i%48)*.63,z=-config.pitch.width/2-2.6-Math.floor(i/48)*1.1,y=.95+Math.floor(i/48)*.43+(cheering?Math.max(0,Math.sin(time*9+i))*c.cheerHeight:0);put(parts.body,i,x,y,z);put(parts.head,i,x,y+c.bodyHeight/2+c.headRadius,z);for(const side of [-1,1])put(parts.arms,i*2+(side>0?1:0),x+side*.2,y+(cheering?.17:0),z,side*(cheering?1.8+Math.sin(time*8+i)*.3:.2));if(i%c.flagEvery===0)put(parts.flags,f++,x+.25,y+.65,z,Math.sin(time*3+i)*.2);}for(const mesh of Object.values(parts))mesh.instanceMatrix.needsUpdate=true;}
 update(0,false);
 return {get count(){return count;},set count(value){count=value;parts.body.count=parts.head.count=value;parts.arms.count=value*2;parts.flags.count=Math.ceil(value/c.flagEvery);},update};
}

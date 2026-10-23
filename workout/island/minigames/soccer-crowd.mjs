/**
 * Seated supporters, shared in five instanced batches (3,088 triangles at 96).
 * Audience geometry is deliberately small; the rigged players retain the budget.
 */
export function soccerCrowd(T,scene,config,track){
 const c=config.view.crowd,capacity=Math.max(0,Math.floor(c.count)),dummy=new T.Object3D(),color=new T.Color(),hx=config.pitch.length/2,hz=config.pitch.width/2;
 const bw=c.bodyWidth,bh=c.bodyHeight,hr=c.headRadius,armLength=c.armLength,flagEvery=Math.max(1,Math.floor(c.flagEvery));
 const geometry=(vertices,indices,reverse=false)=>{if(reverse)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];const g=track(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;};
 // A tapered jacket has shoulders and a quiet, broad chest rather than a cube.
 const bodyGeometry=geometry([
  -bw*.48,-bh/2,-.10,bw*.48,-bh/2,-.10,bw*.66,bh/2,-.08,-bw*.66,bh/2,-.08,
  -bw*.48,-bh/2,.10,bw*.48,-bh/2,.10,bw*.66,bh/2,.09,-bw*.66,bh/2,.09,
  -bw*.47,-bh/2-.04,.08,bw*.47,-bh/2-.04,.08,-bw*.48,-bh/2-.12,.25,bw*.48,-bh/2-.12,.25
 ],[0,1,2,0,2,3,4,7,6,4,6,5,0,3,7,0,7,4,1,5,6,1,6,2,3,2,6,3,6,7,8,11,10,8,9,11],true);
 const bodyColors=Array.from({length:12},(_,i)=>i<8?[1,1,1]:[.20,.25,.29]).flat();bodyGeometry.setAttribute('color',new T.Float32BufferAttribute(bodyColors,3));
 // A low silhouette cap leaves the face visible, with its own hair palette.
 const hairGeometry=geometry([
  -hr*.86,0,-hr*.60,hr*.86,0,-hr*.60,hr*.86,0,hr*.46,-hr*.86,0,hr*.46,0,hr*.78,-hr*.10
 ],[0,4,1,1,4,2,2,4,3,3,4,0]);
 const headGeometry=geometry([0,hr,0,-hr,0,0,0,0,hr,hr,0,0,0,0,-hr,0,-hr,0],[0,2,1,0,3,2,0,4,3,0,1,4,5,1,2,5,2,3,5,3,4,5,4,1],true);
 const armGeometry=geometry([-.05,-armLength/2,-.035,.05,-armLength/2,-.035,0,-armLength/2,.05,-.05,armLength/2,-.035,.05,armLength/2,-.035,0,armLength/2,.05],[0,3,5,0,5,2,2,5,4,2,4,1],true);
 const material=()=>track(new T.MeshLambertMaterial());
 const make=(g,n)=>{const mesh=new T.InstancedMesh(g,material(),n);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);return mesh;};
 const parts={
  body:make(bodyGeometry,capacity),
  head:make(headGeometry,capacity),
  hair:make(hairGeometry,capacity),
  arms:make(armGeometry,capacity*2),
  flags:make(track(new T.PlaneGeometry(.34,.21)),Math.ceil(capacity/flagEvery))
 };
 parts.body.material.vertexColors=true;parts.arms.material.side=T.DoubleSide;parts.flags.material.side=T.DoubleSide;
 const shirts=['#244f75','#d0b97b','#385d62','#9d5c4c','#d6d3c5','#233d54','#60716f','#567b9b'];
 const skins=['#ebbd98','#dba57d','#bd835e','#9a6247','#744d3b','#edc5aa'];
 const hairs=['#302923','#4a3325','#78614a','#1f2527','#a18d6c','#514b48'];
 // Far stand carries most of the crowd. The order interleaves all sections so
 // adaptive quality removes people evenly, preserving the stadium composition.
 const sectionSizes=[Math.round(capacity*.60),Math.round(capacity*.20),Math.round(capacity*.10)];sectionSizes.push(capacity-sectionSizes.reduce((a,b)=>a+b,0));
 const sections=sectionSizes.map((size,section)=>Array.from({length:size},(_,i)=>{
  const row=i%3,column=Math.floor(i/3),columns=Math.ceil((size-row)/3),fraction=(column+.5)/Math.max(1,columns),span=(section<2?hx:hz)-.6;
  const along=(fraction*2-1)*span,offset=.035*Math.sin(i*2.17+section);
  return section===0?{x:along,z:-hz-3.2-row*1.15,y:.24+row*.65,yaw:0,offset}:
   section===1?{x:along,z:hz+3.2+row*1.15,y:.24+row*.65,yaw:Math.PI,offset}:
   {x:(section===2?-1:1)*(hx+4.5+row*1.1),z:along,y:.24+row*.65,yaw:section===2?Math.PI/2:-Math.PI/2,offset};
 }));
 const supporters=[];
 for(let i=0;supporters.length<capacity;i++)for(let section=0;section<sections.length;section++)if(sections[section][i])supporters.push(sections[section][i]);
 for(let i=0;i<capacity;i++){
  const supporter=supporters[i],shirt=shirts[(i*7+Math.floor(i/9))%shirts.length];
  supporter.cos=Math.cos(supporter.yaw);supporter.sin=Math.sin(supporter.yaw);supporter.scale=.91+(i%7)*.025;
  parts.body.setColorAt(i,color.set(shirt));parts.head.setColorAt(i,color.set(skins[(i*5+Math.floor(i/8))%skins.length]));parts.hair.setColorAt(i,color.set(hairs[(i*3+Math.floor(i/5))%hairs.length]));
  parts.arms.setColorAt(i*2,color.set(shirt));parts.arms.setColorAt(i*2+1,color.set(shirt));
  if(i%flagEvery===0)parts.flags.setColorAt(i/flagEvery,color.set(i%24===0?'#d0b97b':'#3b7191'));
 }
 for(const mesh of Object.values(parts))if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 let count=capacity,lastFrame=-1,lastCheering=false;
 const put=(mesh,i,p,x,y,z,rz=0,sx=1,sy=1,sz=1)=>{
  const scale=p.scale;dummy.position.set(p.x+(x*p.cos+z*p.sin)*scale,p.y+y*scale,p.z+(z*p.cos-x*p.sin)*scale);dummy.rotation.set(0,p.yaw,rz);dummy.scale.set(scale*sx,scale*sy,scale*sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
 };
 function update(time,cheering){
  // Supporters do not require the simulation's frame rate. Twenty updates per
  // second keep calm rows still and celebration waves smooth on mobile.
  const frame=Math.floor(time*(cheering?24:12));if(frame===lastFrame&&cheering===lastCheering)return;lastFrame=frame;lastCheering=cheering;
  let flagIndex=0;
  for(let i=0;i<count;i++){
   const p=supporters[i],wave=Math.sin(time*6.1+i*.79),bounce=cheering?Math.max(0,wave)*Math.min(c.cheerHeight,.25)*.36:Math.sin(time*1.5+i)*.005;
   const hip=.38+p.offset+bounce,bodyY=hip+bh/2;
   put(parts.body,i,p,0,bodyY,0,cheering?Math.sin(time*4+i)*.035:0);
   put(parts.head,i,p,0,hip+bh+hr,.015);
   put(parts.hair,i,p,0,hip+bh+hr*1.22,.009);
   for(const side of [-1,1]){
    const angle=side*(cheering?2.35+wave*.16:.19+Math.sin(time*1.8+i)*.025),shoulderX=side*bw*.61,shoulderY=hip+bh*.86;
    put(parts.arms,i*2+(side>0?1:0),p,shoulderX+Math.sin(angle)*armLength/2,shoulderY-Math.cos(angle)*armLength/2,0,angle);
   }
   if(i%flagEvery===0)put(parts.flags,flagIndex++,p,bw*.92,hip+bh+(cheering?.42:.23),.01,Math.sin(time*2.7+i)*.16);
  }
  for(const mesh of Object.values(parts))mesh.instanceMatrix.needsUpdate=true;
 }
 update(0,false);
 return {get count(){return count;},set count(value){const next=Number.isFinite(value)?Math.min(capacity,Math.max(0,Math.floor(value))):0;if(next===count)return;count=next;for(const key of ['body','head','hair'])parts[key].count=count;parts.arms.count=count*2;parts.flags.count=Math.ceil(count/flagEvery);lastFrame=-1;},update};
}

/** Original CC0 ski-groove geometry, independent of any renderer/game.
 * World axes: +Y up, metres; heading radians: 0=+Z, positive turns toward +X.
 * sampleSurface(x,z,out) writes out.height and out.normal[0..2] (unit normal),
 * returning out, a height number, or nothing. Reuse the supplied out object.
 * add() has positional numeric arguments, so callers need not allocate inputs.
 * Call breakPath(id) while airborne/teleporting, then add() on ground again.
 * Every returned object and typed array is stable until the helper is discarded.
 * update() returns upload ranges in attribute ELEMENTS, not vertices/bytes;
 * consume them before the next update(). Indices are static; UV edits are
 * included in changes.uv. Disable frustum culling for a single ring-buffer mesh
 * or maintain its bounds in the renderer adapter as the course window moves.
 */
export function createTrackDecals({sampleSurface,capacity=512,pathCount=8,spacing=.12,skiSpacing=.34,grooveWidth=.055,normalOffset=.006,maxConnectionMeters=3,opacity=.45,lifeSeconds=0,color=[130,155,170],uvMeters=.4}={}){
 if(typeof sampleSurface!=='function')throw Error('track-decals: sampleSurface required');
 capacity=Math.max(8,Math.min(8192,Math.floor(Number.isFinite(capacity)?capacity:512)));pathCount=Math.max(1,Math.min(32,Math.floor(Number.isFinite(pathCount)?pathCount:8)));
 spacing=Math.max(.035,Number(spacing)||.12);skiSpacing=Math.max(.12,Number(skiSpacing)||.34);grooveWidth=Math.max(.012,Number(grooveWidth)||.055);
 normalOffset=Math.max(.001,Math.min(.03,Number(normalOffset)||.006));maxConnectionMeters=Math.min(12,Math.max(spacing*2,Number(maxConnectionMeters)||3));uvMeters=Math.max(.05,Number(uvMeters)||.4);
 opacity=Math.max(0,Math.min(1,opacity));lifeSeconds=Math.max(0,Number(lifeSeconds)||0);
 const vertices=capacity*8,positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),uvs=new Float32Array(vertices*2),colors=new Uint8Array(vertices*4);
 const indices=vertices>65535?new Uint32Array(capacity*12):new Uint16Array(capacity*12),born=new Float64Array(capacity),strength=new Float32Array(capacity);
 // Each path stores centre X/Y/Z, heading, both ski X/Z centres, right X/Z,
 // and cumulative physical distance. A lane owns its continuity independently.
 const STRIDE=11,paths=new Float64Array(pathCount*STRIDE),valid=new Uint8Array(pathCount);
 const surface={height:0,normal:new Float64Array([0,1,0])};
 let height=0,nx=0,ny=1,nz=0,rx=1,rz=0,lx=0,lz=0,qx=0,qz=0;
 let next=0,count=0,written=0,now=0,dirtyStart=vertices,dirtyEnd=0,colorStart=vertices,colorEnd=0;
 for(let s=0;s<capacity;s++){
  const v=s*8,i=s*12;
  for(let ski=0;ski<2;ski++){const o=i+ski*6,b=v+ski*4;indices[o]=b;indices[o+1]=b+1;indices[o+2]=b+2;indices[o+3]=b;indices[o+4]=b+2;indices[o+5]=b+3;}
 }
 const state={positions,normals,uvs,colors,indices,capacity,pathCount,segmentCount:0,writtenSegments:0,nextSegment:0,drawRange:{start:0,count:0},
  changes:{position:{offset:0,count:0},normal:{offset:0,count:0},uv:{offset:0,count:0},color:{offset:0,count:0}},
  attributes:{position:{array:positions,itemSize:3},normal:{array:normals,itemSize:3},uv:{array:uvs,itemSize:2},color:{array:colors,itemSize:4,normalized:true}}};
 function sample(x,z){
  surface.height=0;surface.normal[0]=0;surface.normal[1]=1;surface.normal[2]=0;
  const result=sampleSurface(x,z,surface),value=result&&typeof result==='object'?result:surface;
  height=typeof result==='number'?result:Number(value.height);if(!Number.isFinite(height))height=0;
  const normal=value.normal||surface.normal;
  nx=Number(normal[0]);ny=Number(normal[1]);nz=Number(normal[2]);
  const length=Math.hypot(nx,ny,nz);if(!Number.isFinite(length)||length<1e-8){nx=0;ny=1;nz=0;}else{nx/=length;ny/=length;nz/=length;if(ny<0){nx=-nx;ny=-ny;nz=-nz;}}
 }
 function frame(x,z,heading){
  sample(x,z);const fx=Math.sin(heading),fz=Math.cos(heading),dot=fx*nx+fz*nz;
  let tx=fx-dot*nx,ty=-dot*ny,tz=fz-dot*nz;const length=Math.hypot(tx,ty,tz);
  if(length<1e-8){tx=0;ty=-nz;tz=ny;}else{tx/=length;ty/=length;tz/=length;}
  let rightX=ny*tz-nz*ty,rightZ=nx*ty-ny*tx;const rightY=nz*tx-nx*tz,rightLength=Math.hypot(rightX,rightY,rightZ)||1;
  rx=rightX/rightLength;rz=rightZ/rightLength;
  lx=x-rx*skiSpacing*.5;lz=z-rz*skiSpacing*.5;qx=x+rx*skiSpacing*.5;qz=z+rz*skiSpacing*.5;
 }
 function vertex(index,x,z,u,v,alpha){
  sample(x,z);const p=index*3,c=index*4,t=index*2;
  positions[p]=x+nx*normalOffset;positions[p+1]=height+ny*normalOffset;positions[p+2]=z+nz*normalOffset;
  normals[p]=nx;normals[p+1]=ny;normals[p+2]=nz;uvs[t]=u;uvs[t+1]=v;
  colors[c]=color[0];colors[c+1]=color[1];colors[c+2]=color[2];colors[c+3]=alpha;
 }
 function strip(index,ax,az,arx,arz,bx,bz,brx,brz,va,vb,alpha){
  const half=grooveWidth*.5;
  vertex(index,ax-arx*half,az-arz*half,0,va,alpha);vertex(index+1,bx-brx*half,bz-brz*half,0,vb,alpha);
  vertex(index+2,bx+brx*half,bz+brz*half,1,vb,alpha);vertex(index+3,ax+arx*half,az+arz*half,1,va,alpha);
 }
 function store(o,x,y,z,heading,leftX,leftZ,rightX,rightZ,widthX,widthZ,distance){
  paths[o]=x;paths[o+1]=y;paths[o+2]=z;paths[o+3]=heading;paths[o+4]=leftX;paths[o+5]=leftZ;paths[o+6]=rightX;paths[o+7]=rightZ;paths[o+8]=widthX;paths[o+9]=widthZ;paths[o+10]=distance;
 }
 function add(x,z,heading,pressure=1,pathId=0){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(heading))return 0;
  pathId=Math.max(0,Math.min(pathCount-1,pathId|0));pressure=Math.max(0,Math.min(1,Number(pressure)||0));const o=pathId*STRIDE;
  frame(x,z,heading);const targetHeight=height;
  if(!valid[pathId]||!pressure){store(o,x,targetHeight,z,heading,lx,lz,qx,qz,rx,rz,0);valid[pathId]=pressure?1:0;return 0;}
  const ax=paths[o],ay=paths[o+1],az=paths[o+2],angle=paths[o+3],dx=x-ax,dz=z-az,distance=Math.hypot(dx,targetHeight-ay,dz);
  if(distance>maxConnectionMeters){store(o,x,targetHeight,z,heading,lx,lz,qx,qz,rx,rz,0);return 0;}
  const steps=Math.floor(distance/spacing);if(!steps)return 0;
  const angleDelta=Math.atan2(Math.sin(heading-angle),Math.cos(heading-angle));let emitted=0;
  for(let k=1;k<=steps;k++){
   const t=k*spacing/distance,bx=ax+dx*t,bz=az+dz*t,bHeading=angle+angleDelta*t;
   frame(bx,bz,bHeading);const by=height,leftX=lx,leftZ=lz,rightX=qx,rightZ=qz,widthX=rx,widthZ=rz,along=paths[o+10],v=next*8;
   const alpha=Math.round(opacity*pressure*255);
   strip(v,paths[o+4],paths[o+5],paths[o+8],paths[o+9],leftX,leftZ,widthX,widthZ,along/uvMeters,(along+spacing)/uvMeters,alpha);
   strip(v+4,paths[o+6],paths[o+7],paths[o+8],paths[o+9],rightX,rightZ,widthX,widthZ,along/uvMeters,(along+spacing)/uvMeters,alpha);
   born[next]=now;strength[next]=alpha;dirtyStart=Math.min(dirtyStart,v);dirtyEnd=Math.max(dirtyEnd,v+8);colorStart=Math.min(colorStart,v);colorEnd=Math.max(colorEnd,v+8);
   next=(next+1)%capacity;count=Math.min(capacity,count+1);written++;emitted++;
   store(o,bx,by,bz,bHeading,leftX,leftZ,rightX,rightZ,widthX,widthZ,along+spacing);
  }
  return emitted;
 }
 function update(timeSeconds=now){
  if(Number.isFinite(timeSeconds))now=timeSeconds;
  if(lifeSeconds>0)for(let s=0;s<count;s++){
   const left=Math.max(0,Math.min(1,1-(now-born[s])/lifeSeconds)),alpha=Math.round(strength[s]*left),v=s*8;
   if(colors[v*4+3]!==alpha){for(let k=0;k<8;k++)colors[(v+k)*4+3]=alpha;colorStart=Math.min(colorStart,v);colorEnd=Math.max(colorEnd,v+8);}
  }
  const n=Math.max(0,dirtyEnd-dirtyStart),c=Math.max(0,colorEnd-colorStart),changes=state.changes;
  changes.position.offset=n?dirtyStart*3:0;changes.position.count=n*3;changes.normal.offset=changes.position.offset;changes.normal.count=n*3;
  changes.uv.offset=n?dirtyStart*2:0;changes.uv.count=n*2;changes.color.offset=c?colorStart*4:0;changes.color.count=c*4;
  state.segmentCount=count;state.writtenSegments=written;state.nextSegment=next;state.drawRange.count=count*12;
  dirtyStart=colorStart=vertices;dirtyEnd=colorEnd=0;return state;
 }
 function breakPath(pathId=0){if(pathId<0)valid.fill(0);else valid[Math.max(0,Math.min(pathCount-1,pathId|0))]=0;}
 function reset(){valid.fill(0);next=count=written=0;now=0;colors.fill(0);strength.fill(0);dirtyStart=vertices;dirtyEnd=0;colorStart=0;colorEnd=vertices;return update(0);}
 return {buffers:state,add,update,breakPath,reset};
}

/** Portable contract validation; Node built-ins only, no browser/game state. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createTrackDecals} from '../decals/track-decals.mjs';
const root=new URL('../',import.meta.url),proof={schemaVersion:1,scope:'Original effects and standalone decal helper only',checks:[],atlases:[],decals:[],helper:{}};
const record=(name,details)=>proof.checks.push({name,passed:true,...details});
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b} within ${e}`);
function decodePNG(bytes){
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');let width,height,depth,type;const parts=[];
 for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),tag=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+n);if(tag==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];}if(tag==='IDAT')parts.push(data);at+=n+12;}
 assert.equal(depth,8);assert.equal(type,6);const raw=inflateSync(Buffer.concat(parts)),stride=width*4,pixels=Buffer.alloc(stride*height);assert.equal(raw.length,(stride+1)*height);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
  const filter=raw[y*(stride+1)],a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
  assert.ok(filter>=0&&filter<=4);pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
 }return {width,height,pixels};
}
for(const name of ['cloud-atlas','ski-powder-atlas']){
 const bytes=await readFile(new URL(`vfx/${name}.png`,root)),image=decodePNG(bytes),meta=JSON.parse(await readFile(new URL(`vfx/${name}.json`,root),'utf8'));
 assert.ok(image.width<=512&&image.height<=512);assert.equal(meta.columns,4);assert.equal(meta.rows,4);assert.equal(meta.frameCount,16);assert.equal(meta.frames.length,16);assert.equal(meta.alphaMode,'straight');assert.equal(meta.uvOrigin,'bottom-left');assert.equal(meta.imageOrigin,'top-left');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);assert.equal(bytes.length,meta.fileBytes);
 const cell=meta.frameSize.width,gutter=meta.paddingPixels,alphaCounts=[];let gutterPixels=0,maxAlpha=0;
 for(let f=0;f<16;f++){
  const cx=f%4*cell,cy=Math.floor(f/4)*cell;let count=0;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
   const a=image.pixels[((cy+y)*image.width+cx+x)*4+3];maxAlpha=Math.max(maxAlpha,a);if(a)count++;
   if(x<gutter||y<gutter||x>=cell-gutter||y>=cell-gutter){assert.equal(a,0,`${name} gutter frame${f}/${x},${y}`);gutterPixels++;}
  }alphaCounts.push(count);const uv=meta.frames[f].uv;assert.ok(uv.u0>=0&&uv.u1<=1&&uv.v0>=0&&uv.v1<=1&&uv.u0<uv.u1&&uv.v0<uv.v1);
 }
 if(meta.loop){for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)for(let c=0;c<4;c++)assert.equal(image.pixels[(y*image.width+x)*4+c],image.pixels[((y+3*cell)*image.width+x+3*cell)*4+c]);assert.ok(alphaCounts.every(n=>n>0));}
 else{assert.equal(alphaCounts[0],0);assert.equal(alphaCounts[15],0);assert.ok(alphaCounts.slice(1,15).every(n=>n>0));}
 proof.atlases.push({name,width:image.width,height:image.height,frames:16,gutterPixelsChecked:gutterPixels,allGutterAlphaZero:true,maxAlpha,nonzeroAlphaPixelsPerFrame:alphaCounts,loop:meta.loop,firstLastIdentical:meta.loop?true:undefined,firstLastTransparent:!meta.loop?true:undefined,hashMatches:true});
}
record('atlas RGBA, dimensions, gutters, UV ranges, lifecycle and hashes');
for(const name of ['footprint-treads','snow-groove']){
 const bytes=await readFile(new URL(`decals/${name}.png`,root)),image=decodePNG(bytes),meta=JSON.parse(await readFile(new URL(`decals/${name}.json`,root),'utf8'));
 assert.ok(image.width<=256&&image.height<=256);assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);let ink=0;
 for(let i=3;i<image.pixels.length;i+=4)if(image.pixels[i])ink++;assert.ok(ink>100&&ink<image.width*image.height);
 if(name==='snow-groove')for(let x=0;x<image.width;x++)for(let c=0;c<4;c++)assert.equal(image.pixels[x*4+c],image.pixels[((image.height-1)*image.width+x)*4+c]);
 proof.decals.push({name,width:image.width,height:image.height,nonzeroAlphaPixels:ink,hashMatches:true,periodicY:name==='snow-groove'});
}
record('decal RGBA, size, transparency, groove seam and hashes');
const curved=(x,z,out)=>{const dx=.315*Math.cos(.7*x),dz=-.036*Math.sin(.3*z)+.006*z,length=Math.hypot(dx,1,dz);out.height=.45*Math.sin(.7*x)+.12*Math.cos(.3*z)+.003*z*z;out.normal[0]=-dx/length;out.normal[1]=1/length;out.normal[2]=-dz/length;};
const pool=createTrackDecals({sampleSurface:curved,capacity:48,pathCount:2}),buffers=pool.buffers,identity={positions:buffers.positions,normals:buffers.normals,uvs:buffers.uvs,colors:buffers.colors,indices:buffers.indices,attributes:buffers.attributes,changes:buffers.changes,positionRange:buffers.changes.position};
for(let k=0;k<220;k++){const x=Math.sin(k*.015)*2,z=k*.055,h=Math.atan2(.03*Math.cos(k*.015),.055);pool.add(x,z,h,.8,0);pool.add(x+3,z+1,h,.65,1);}
let current=pool.update(1);assert.equal(current.segmentCount,48);assert.equal(current.drawRange.count,48*12);assert.ok(current.writtenSegments>48);let maxResidual=0,maxNormalError=0;const scratch={height:0,normal:new Float64Array(3)};
for(let i=0;i<current.positions.length;i+=3){
 const nx=current.normals[i],ny=current.normals[i+1],nz=current.normals[i+2],x=current.positions[i]-nx*.006,y=current.positions[i+1]-ny*.006,z=current.positions[i+2]-nz*.006;
 curved(x,z,scratch);const residual=Math.abs(y-scratch.height);maxResidual=Math.max(maxResidual,residual);assert.ok(residual<2e-5);near(Math.hypot(nx,ny,nz),1,2e-6);
 for(let c=0;c<3;c++)maxNormalError=Math.max(maxNormalError,Math.abs(current.normals[i+c]-scratch.normal[c]));
 assert.ok(Number.isFinite(x+y+z));
}assert.ok(maxNormalError<2e-5);assert.ok(current.indices.every(i=>i<48*8));
function ranges(){for(const [key,field]of [['position','positions'],['normal','normals'],['uv','uvs'],['color','colors']]){const r=current.changes[key];assert.ok(r.offset>=0&&r.count>=0&&r.offset+r.count<=current[field].length);}}
ranges();for(const key of ['positions','normals','uvs','colors','indices','attributes','changes'])assert.equal(current[key],identity[key]);assert.equal(current.changes.position,identity.positionRange);
current=pool.update(1);ranges();for(const range of Object.values(current.changes))assert.equal(range.count,0);
const written=current.writtenSegments;pool.breakPath(0);assert.equal(pool.add(50,30,0,1,0),0);assert.equal(pool.update().writtenSegments,written);assert.ok(pool.add(50,30.3,0,1,0)>0);current=pool.update();ranges();
for(let v=current.changes.position.offset;v<current.changes.position.offset+current.changes.position.count;v+=3)assert.ok(current.positions[v]>49,'breakPath must not bridge to old point');
const beforeTeleport=current.writtenSegments;assert.equal(pool.add(1000,1000,0,1,0),0);assert.equal(pool.update().writtenSegments,beforeTeleport);
pool.reset();current=pool.update();assert.equal(current.drawRange.count,0);assert.equal(current.segmentCount,0);for(const key of ['positions','normals','uvs','colors','indices','attributes','changes'])assert.equal(current[key],identity[key]);
record('curved per-corner height/normal projection, independent paths, ring overwrite, stable buffers/ranges, break/teleport and reset');
const flat=createTrackDecals({sampleSurface:(x,z,o)=>{o.height=0;},capacity:8,skiSpacing:.34,grooveWidth:.055});flat.add(0,0,0);assert.equal(flat.add(0,.24,0),2);const f=flat.update();near((f.positions[0]+f.positions[9])*.5,-.17);near((f.positions[12]+f.positions[21])*.5,.17);near(f.positions[9]-f.positions[0],.055);near(f.positions[5]-f.positions[2],.12);near(f.uvs[3],.3);near(f.positions[1],.006);
const fade=createTrackDecals({sampleSurface:(x,z,o)=>{o.height=0;},capacity:8,lifeSeconds:2});fade.update(10);fade.add(0,0,0);fade.add(0,.3,0);const full=fade.update(10).colors[3];assert.ok(full>0);near(fade.update(11).colors[3],Math.round(full*.5),0);assert.equal(fade.update(12).colors[3],0);
record('physical ski separation/width/spacing/normal offset, UV metres and optional fade');
proof.helper={maxCurveHeightResidualMeters:maxResidual,maxCurveNormalError:maxNormalError,capacityPairedSegments:48,vertices:48*8,triangles:48*4,stableTypedArraysAndDescriptors:true,uploadRangesWithinBounds:true,breakAndTeleportDoNotBridge:true,resetReusesBuffers:true,perFrameAllocationContract:'Numeric add arguments; all helper-owned typed arrays, return state and range descriptors allocated only at construction. Stable identities validated.'};
const owned=['vfx/cloud-atlas.png','vfx/cloud-atlas.json','vfx/ski-powder-atlas.png','vfx/ski-powder-atlas.json','decals/footprint-treads.png','decals/footprint-treads.json','decals/snow-groove.png','decals/snow-groove.json','decals/track-decals.mjs','tools/build-effects.mjs','tools/build-effects.test.mjs'];
proof.sourceAndAssetBytes=0;for(const file of owned)proof.sourceAndAssetBytes+=(await stat(new URL(file,root))).size;
assert.ok(proof.sourceAndAssetBytes<145000);proof.passed=true;
await writeFile(new URL('tools/build-effects.validation.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:proof.checks.length,sourceAndAssetBytes:proof.sourceAndAssetBytes,maxCurveHeightResidualMeters:maxResidual,maxCurveNormalError:maxNormalError}));

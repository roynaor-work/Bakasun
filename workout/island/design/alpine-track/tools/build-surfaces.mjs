// Technical packaging of the original generated atlas: crop, resize, exact
// periodic boundaries and lossless WebP. The source prompt is in PROMPTS.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),at=k=>args[args.indexOf(k)+1];
if(!args.includes('--input')||!args.includes('--modules'))throw Error('--input original-atlas.png --modules /tooling/node_modules required');
const require=createRequire(path.resolve(at('--modules'),'../package.json')),sharp=require('sharp');
const root=path.resolve(import.meta.dirname,'..'),source=await fs.readFile(at('--input'));
const info=await sharp(source).metadata(),halfW=Math.floor(info.width/2),halfH=Math.floor(info.height/2);
await fs.mkdir(path.join(root,'textures'),{recursive:true});
const surfaces=[];
function periodic(data,n,channels){
  const a=new Float64Array(data),b=new Float64Array(a),band=Math.round(n/8);
  // Symmetric cosine boundary correction. Pixel 0 and N-1 become identical;
  // the interior material is preserved. Apply axes sequentially, including corners.
  for(let y=0;y<n;y++)for(let c=0;c<channels;c++){
    const delta=a[(y*n+n-1)*channels+c]-a[y*n*channels+c];
    for(let x=0;x<band;x++){const w=.5*(1+Math.cos(Math.PI*x/band));b[(y*n+x)*channels+c]+=delta*.5*w;b[(y*n+n-1-x)*channels+c]-=delta*.5*w;}
  }
  a.set(b);
  for(let x=0;x<n;x++)for(let c=0;c<channels;c++){
    const delta=a[((n-1)*n+x)*channels+c]-a[x*channels+c];
    for(let y=0;y<band;y++){const w=.5*(1+Math.cos(Math.PI*y/band));b[(y*n+x)*channels+c]+=delta*.5*w;b[((n-1-y)*n+x)*channels+c]-=delta*.5*w;}
  }
  return Buffer.from(b.map(v=>Math.max(0,Math.min(255,Math.round(v)))));
}
const defs=[['groomed-snow',0,0,[4,4],.94],['deep-snow',1,0,[2.5,2.5],1],['halfpipe-ice',0,1,[5,5],.28],['snow-ripples',1,1,[6,6],.96]];
for(const [id,qx,qy,tileMeters,roughness]of defs){
  const {data}=await sharp(source).extract({left:qx*halfW,top:qy*halfH,width:halfW,height:halfH}).resize(256,256).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pixels=periodic(data,256,3),file=`textures/${id}.webp`;
  await sharp(pixels,{raw:{width:256,height:256,channels:3}}).webp({lossless:true,effort:6}).toFile(path.join(root,file));
  surfaces.push({id,file,width:256,height:256,colorSpace:'srgb',channels:'RGB',tileMeters,roughness,metalness:0,wrap:'repeat',mipmaps:true,minFilter:'linear-mipmap-linear',magFilter:'linear',anisotropyMax:4,flipYForGltf:false,edgeMaxError:0});
}
for(const [id,target]of [['groomed-normal','groomed-snow'],['ice-normal','halfpipe-ice']]){
  const n=128,data=Buffer.alloc(n*n*3),tau=Math.PI*2;
  const height=(u,v)=>id==='groomed-normal'?.005*Math.cos(tau*(40*u+.16*Math.sin(tau*v)))+.0007*Math.sin(tau*(7*u+9*v)):.0015*Math.sin(tau*(6*u+3*v))+.0007*Math.cos(tau*(17*u-8*v));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=x/(n-1),v=y/(n-1),e=1/1024,dx=(height(u+e,v)-height(u-e,v))/(2*e),dy=(height(u,v+e)-height(u,v-e))/(2*e),inv=1/Math.hypot(dx,dy,1),p=(y*n+x)*3;
    data[p]=Math.round(127.5*(1-dx*inv));data[p+1]=Math.round(127.5*(1-dy*inv));data[p+2]=Math.round(127.5*(1+inv));
  }
  const file=`textures/${id}.webp`;
  await sharp(data,{raw:{width:n,height:n,channels:3}}).webp({lossless:true,effort:6}).toFile(path.join(root,file));
  surfaces.find(s=>s.id===target).normal={file,width:n,height:n,colorSpace:'linear-data',convention:'OpenGL +Y tangent space',scale:.18,optional:true,edgeMaxError:0};
}
for(const s of surfaces){for(const f of [s,s.normal].filter(Boolean)){const bytes=await fs.readFile(path.join(root,f.file));f.bytes=bytes.length;f.sha256=createHash('sha256').update(bytes).digest('hex');}}
await fs.writeFile(path.join(root,'surfaces.json'),JSON.stringify({schemaVersion:1,originalSourceSha256:createHash('sha256').update(source).digest('hex'),uvConvention:'UV0: u across piste +X, v downhill +Z; one repeat covers tileMeters. Apply flipY=false for glTF.',surfaces},null,2)+'\n');
console.log(JSON.stringify({surfaces:surfaces.map(s=>({id:s.id,bytes:s.bytes,normalBytes:s.normal?.bytes})),source:info}));

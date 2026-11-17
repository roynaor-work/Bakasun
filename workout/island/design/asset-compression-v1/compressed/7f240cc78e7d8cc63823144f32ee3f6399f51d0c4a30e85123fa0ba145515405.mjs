/** Basketball-only, one-time transfer of the original bake onto preserved v2 parts.
 * V2 has a new UV layout: never attach the v1 atlas to arbitrary v2 UVs. */
import * as THREE from '../vendor/three.module.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function sampleLinear(image,u,v){
 const x=clamp(u,0,1)*(image.width-1),y=clamp(v,0,1)*(image.height-1),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const at=(a,b)=>image.data[(b*image.width+a)*4]/255;
 return (at(ix,iy)*(1-fx)+at(Math.min(ix+1,image.width-1),iy)*fx)*(1-fy)+(at(ix,Math.min(iy+1,image.height-1))*(1-fx)+at(Math.min(ix+1,image.width-1),Math.min(iy+1,image.height-1))*fx)*fy;
}
export function imagePixels(image,doc=globalThis.document){const c=doc.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height);}
/** Positions and normals identify original faces, including their UV seams.
 * The v2 package moves the roof/beams outwards; undo only that documented move.
 * Any unmatched part keeps its own v2 face AO, rather than guessing an atlas. */
export function transferBasketballBake(target,source,ao,light,{expanded=false,tolerance=.065}={}){
 const a=target.attributes,b=source.attributes;if(!a.position||!b.uv||!b.color)return {matched:0,total:a.position?.count||0};
 const output=new Float32Array(a.position.count*3);let matched=0;
 for(let i=0;i<a.position.count;i++){
  let x=a.position.getX(i),y=a.position.getY(i),z=a.position.getZ(i);
  if(expanded){if(Math.abs(x)>=10)x-=Math.sign(x)*2.4;if(Math.abs(z)>=16)z-=Math.sign(z)*1.8;}
  let best=-1,distance=tolerance*tolerance;
  for(let j=0;j<b.position.count;j++){
   if(a.normal&&b.normal&&a.normal.getX(i)*b.normal.getX(j)+a.normal.getY(i)*b.normal.getY(j)+a.normal.getZ(i)*b.normal.getZ(j)<.9)continue;
   const d=(b.position.getX(j)-x)**2+(b.position.getY(j)-y)**2+(b.position.getZ(j)-z)**2;if(d<distance){best=j;distance=d;}
  }
  if(best>=0){const u=b.uv.getX(best),v=b.uv.getY(best),shade=sampleLinear(ao,u,v)*sampleLinear(light,u,v);output.set([b.color.getX(best)*shade,b.color.getY(best)*shade,b.color.getZ(best)*shade],i*3);matched++;}
  else output.set(a.color?[a.color.getX(i),a.color.getY(i),a.color.getZ(i)]:[1,1,1],i*3);
 }
 // Keep a whole part on one lighting route. Never partially double-bake it.
 if(matched===a.position.count)target.setAttribute('color',new THREE.BufferAttribute(output,3));
 return {matched,total:a.position.count,applied:matched===a.position.count};
}
export function planarCourtUV(geometry){const p=geometry.attributes.position,uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)/15+.5;uv[i*2+1]=p.getZ(i)/28+.5;}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
/** Preserve every triangle, but draw raised boards before the original backing
 * plane so early depth rejection avoids shading the whole floor twice. */
export function frontLoadCourtSurface(geometry){const p=geometry.attributes.position,index=geometry.index,top=[],base=[],count=index?.count??p.count;for(let i=0;i<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;const row=Math.max(p.getY(a),p.getY(b),p.getY(c))>.004?top:base;row.push(a,b,c);}geometry.setIndex([...top,...base]);return {boards:top.length/3,backing:base.length/3};}
/** Static v2 face AO already exists in COLOR_0; add broad directional lighting
 * once, then use an unlit material so lights and AO are not counted twice. */
export function lightStaticGeometry(geometry){const c=geometry.attributes.color,n=geometry.attributes.normal;if(!c||!n)return;const sun=new THREE.Vector3(-1,2,1).normalize();for(let i=0;i<c.count;i++){const diffuse=Math.max(0,n.getX(i)*sun.x+n.getY(i)*sun.y+n.getZ(i)*sun.z),k=.61+.39*diffuse;c.setXYZ(i,c.getX(i)*k,c.getY(i)*k,c.getZ(i)*k);}c.needsUpdate=true;}

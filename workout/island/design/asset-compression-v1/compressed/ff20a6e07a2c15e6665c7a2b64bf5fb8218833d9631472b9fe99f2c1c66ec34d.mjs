import * as T from '../vendor/three.module.js';

export const SEA_LEVEL=-1;
const TAU=Math.PI*2;
// Stable world-space patches. Unlike a repeated sine texture these have no
// visible stripes, and expanding an island does not move the existing lawn.
function hash(x,z){let n=Math.imul(x,374761393)^Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
export function terrainNoise(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,s=u*u*(3-2*u),t=v*v*(3-2*v);
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),s),T.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),s),t);
}
/** An outward-only coastline: the complete square placement grid stays level. */
export function coastline(angle,size,edge='sand'){
  const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  // A smooth envelope rounds the grid corners without ever cutting a cell.
  const square=size*.5/Math.max(c,s),envelope=(size*.5+1.35)/Math.pow(c**6+s**6,1/6);
  const base=Math.max(square+.78,envelope);
  const grass=base+.22*Math.sin(angle*5+.8)+.16*Math.cos(angle*9);
  const outer=(size*.5*1.19+.9)/Math.pow(c**4+s**4,.25);
  return edge==='grass'?grass:outer+1.35+.62*Math.sin(angle*3+.5)+.38*Math.sin(angle*7-1.1);
}

export function groundTexture(kind){
  const n=256,bytes=new Uint8Array(n*n*4),base=kind==='sand'?[214,195,155]:[94,130,76];let seed=629;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const grain=(seed/4294967296-.5)*(kind==='sand'?.055:.075);
    const at=(y*n+x)*4;for(let c=0;c<3;c++)bytes[at+c]=base[c]*(1+grain);bytes[at+3]=255;
  }
  const texture=new T.DataTexture(bytes,n,n);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

function radialGeometry(rings,segments=128,tint){
  const positions=[],uvs=[],colors=[],indices=[],color=new T.Color();
  for(const ring of rings)for(let j=0;j<=segments;j++){
    const a=j/segments*TAU,r=ring.radius(a),y=typeof ring.y==='function'?ring.y(a):ring.y,x=Math.cos(a)*r,z=Math.sin(a)*r;
    positions.push(x,y,z);uvs.push(x*.3,z*.3);color.set(ring.color||'#ffffff');
    if(tint)tint(color,x,z,ring);
    colors.push(color.r,color.g,color.b);
  }
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<segments;j++){const a=k*(segments+1)+j,b=a+1,c=a+segments+1,d=c+1;indices.push(a,b,c,b,d,c);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function islandTerrain(size,ground,grassMaterial,sandMaterial){
  const root=new T.Group(),grass=a=>coastline(a,size,'grass'),shore=a=>coastline(a,size);
  const rings=Array.from({length:25},(_,i)=>({radius:a=>(grass(a)-.16)*i/24,y:ground}));
  rings.push({radius:grass,y:ground-.035,color:'#bfc59b'});
  const dry=new T.Color('#c5bb8b');
  const lawn=new T.Mesh(radialGeometry(rings,128,(color,x,z)=>{
    const patch=terrainNoise(x*.18,z*.18)*.68+terrainNoise(x*.49+31,z*.49-17)*.32;
    color.multiplyScalar(.87+patch*.21);
    const a=Math.atan2(z,x),edge=grass(a)-Math.hypot(x,z);
    color.lerp(dry,(1-T.MathUtils.smoothstep(edge,.12,1.3+terrainNoise(x*.6,z*.6)*.8))*.36);
  }),grassMaterial);lawn.name='continuous coastal lawn';lawn.receiveShadow=true;lawn.userData.ownedGeometry=true;root.add(lawn);
  const beach=new T.Mesh(radialGeometry([
    {radius:a=>grass(a)-.025,y:ground-.04,color:'#dbd5b6'},
    {radius:a=>grass(a)+.32,y:ground-.12,color:'#fff2d3'},
    {radius:a=>T.MathUtils.lerp(grass(a),shore(a),.38),y:a=>-.28+.055*Math.sin(a*11),color:'#fff2d3'},
    {radius:a=>T.MathUtils.lerp(grass(a),shore(a),.73),y:-.62,color:'#e1d4b0'},
    {radius:a=>shore(a)-.28,y:SEA_LEVEL+.04,color:'#a8b6a1'},
    {radius:shore,y:SEA_LEVEL-.045,color:'#8aab99'},
    {radius:a=>shore(a)+1.25,y:SEA_LEVEL-1.1,color:'#639e92'}
  ],128,(color,x,z)=>color.multiplyScalar(.94+terrainNoise(x*.7,z*.7)*.1)),sandMaterial);beach.name='dry sand and tidal shelf';beach.receiveShadow=true;beach.userData.ownedGeometry=true;root.add(beach);
  return root;
}

/** Small offshore landforms use ellipses and uneven cliffs, never flat discs. */
export function outcropGeometry(width,depth,height=1,seed=0){
  const radius=a=>1+.12*Math.sin(a*3+seed)+.08*Math.cos(a*5-seed),ellipse=a=>1/Math.sqrt((Math.cos(a)/width)**2+(Math.sin(a)/depth)**2);
  return radialGeometry([
    {radius:()=>0,y:height,color:'#8b9e6e'},
    {radius:a=>ellipse(a)*radius(a)*.62,y:a=>height+.12*Math.sin(a*4+seed),color:'#a8b885'},
    {radius:a=>ellipse(a)*radius(a)*.88,y:height*.64,color:'#9ca284'},
    {radius:a=>ellipse(a)*radius(a),y:-.18,color:'#c5bc97'},
    {radius:a=>ellipse(a)*radius(a)*1.16,y:SEA_LEVEL+.04,color:'#c7d0b0'},
    {radius:a=>ellipse(a)*radius(a)*1.3,y:SEA_LEVEL-.6,color:'#61998b'}
  ],64);
}

export function releaseTerrain(root){
  const materials=new Set();root?.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&(o.userData.ownedGeometry||o.isGridHelper))o.geometry.dispose();if(o.isGridHelper||o.userData.ownedMaterial)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});for(const material of materials)material.dispose();
  root?.removeFromParent();
}

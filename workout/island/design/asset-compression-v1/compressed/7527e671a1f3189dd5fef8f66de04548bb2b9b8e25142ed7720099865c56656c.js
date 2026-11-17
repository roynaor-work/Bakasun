// Reference implementation for this design package; not imported by a game.
import * as THREE from '../../vendor/three.module.js';

export function regionForTriangle(rgb,centroid,spec,tolerance=.000002){
 const source=spec.sources.find(s=>s.linearRGB.every((v,i)=>Math.abs(v-rgb[i])<=tolerance));
 if(!source)throw Error('Source color differs from regions.json; rebuild the region map for this GLB.');
 const [x,y]=centroid;
 const rule=source.rules.find(r=>(r.yMin===undefined||y>=r.yMin)&&(r.yMax===undefined||y<r.yMax)
  &&(r.absXMin===undefined||Math.abs(x)>=r.absXMin)&&(r.absXMax===undefined||Math.abs(x)<r.absXMax));
 if(!rule)throw Error(`No region rule for ${source.hex}.`);
 return rule.region;
}

// Call once per actor, before posing. The source GLB's geometry/material remain shared and untouched.
export function prepareVariant(mesh,modelId,regionMap){
 const spec=regionMap.models[modelId];
 if(!spec||!mesh?.isMesh||Array.isArray(mesh.material))throw Error('Expected a supported single-material character mesh.');
 const originalGeometry=mesh.geometry,originalMaterial=mesh.material;
 const sourceColor=originalGeometry.getAttribute('color');
 if(originalGeometry.getAttribute('position').count!==spec.vertexCount||!sourceColor||sourceColor.itemSize!==3)
  throw Error('Character geometry differs from regions.json.');
 const geometry=originalGeometry.index?originalGeometry.toNonIndexed():originalGeometry.clone();
 const position=geometry.getAttribute('position'),color=geometry.getAttribute('color');
 if(position.count!==spec.triangles*3){geometry.dispose();throw Error('Character triangle count differs from regions.json.');}
 const originalColors=new Float32Array(color.array),uv=new Float32Array(position.count*2),regions=[];
 const counts={};
 try{
  for(let first=0;first<position.count;first+=3){
   const centroid=[0,0,0],rgb=[color.getX(first),color.getY(first),color.getZ(first)];
   for(let k=0;k<3;k++){
    const i=first+k;
    if([color.getX(i),color.getY(i),color.getZ(i)].some((v,c)=>Math.abs(v-rgb[c])>regionMap.maxColorError))
     throw Error('Mixed source colors in a triangle are unsupported.');
    centroid[0]+=position.getX(i)/3;centroid[1]+=position.getY(i)/3;centroid[2]+=position.getZ(i)/3;
   }
   const region=regionForTriangle(rgb,centroid,spec,regionMap.maxColorError);
   counts[region]=(counts[region]||0)+1;
   for(let k=0;k<3;k++){
    const i=first+k;regions[i]=region;
    let px,py;
    if(region==='shirt'||region==='shorts'){
     const p=regionMap.atlas.uvProjection[region];
     const clamp=v=>Math.max(2,Math.min(253,v));
     px=clamp(position.getX(i)*p.xScale+p.xOffset)/2+(region==='shorts'?128:0);
     py=clamp(position.getY(i)*p.yScale+p.yOffset)/2;
    }else{
     const slot=regionMap.atlas.swatches.indexOf(['skin','hair','preserve'].includes(region)?'white':region);
     if(slot<0)throw Error(`Unknown atlas region: ${region}`);
     px=slot*32+16;py=192;
    }
    uv[i*2]=px/256;uv[i*2+1]=1-py/256;
   }
  }
 }catch(error){geometry.dispose();throw error;}
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(originalColors.slice(),3));
 const material=originalMaterial.clone();
 material.color.set(0xffffff);material.vertexColors=true;
 mesh.geometry=geometry;mesh.material=material;
 let disposed=false;
 return {
  modelId,counts:Object.freeze({...counts}),
  apply(outfit,texture,{skin='#BF8054',hair='#222B38'}={}){
   if(disposed)throw Error('Variant actor has been disposed.');
   if(outfit.modelId!==modelId)throw Error('Outfit belongs to a different character.');
   if(!texture?.isTexture||texture.image?.width!==256||texture.image?.height!==256)throw Error('Expected the outfit 256×256 texture.');
   for(const hex of [skin,hair])if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Skin/hair must be sRGB #RRGGBB.');
   const palette={skin:new THREE.Color(skin),hair:new THREE.Color(hair)};
   const target=geometry.getAttribute('color');
   for(let i=0;i<regions.length;i++){
    const region=regions[i],p=palette[region];
    if(p)target.setXYZ(i,p.r,p.g,p.b);
    else if(region==='preserve')target.setXYZ(i,originalColors[i*3],originalColors[i*3+1],originalColors[i*3+2]);
    else target.setXYZ(i,1,1,1);
   }
   target.needsUpdate=true;
   texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;
   texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
   // Swatches must never bleed into another region at small sizes.
   texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
   texture.offset.set(0,0);texture.repeat.set(1,1);texture.rotation=0;texture.needsUpdate=true;
   material.map=texture;material.needsUpdate=true;
  },
  dispose(){
   if(disposed)return;
   mesh.geometry=originalGeometry;mesh.material=originalMaterial;
   geometry.dispose();material.dispose();disposed=true;
   // Texture ownership stays with the caller/cache. Never dispose shared textures here.
  }
 };
}

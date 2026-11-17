import * as T from '../vendor/three.module.js';

/** Local photographic detail on the terrain only. Every original GLB keeps its
 * own materials. Procedural maps stay usable if a bundled image fails. */
export function loadCoastalSurfaces(owner,loader=new T.TextureLoader()){
  if(!globalThis.document)return Promise.resolve(false);
  const maps=[['grassMap','grassMaterial','coastal-grass.jpg',.10],['sandMap','sandMaterial','coastal-sand.jpg',.075]];
  return Promise.all(maps.map(([key,materialKey,file,scale])=>new Promise(resolve=>{
    loader.load(new URL('../assets/textures/'+file,import.meta.url).href,map=>{
      if(owner.disposed){map.dispose();resolve(false);return;}
      map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;
      // Terrain UVs are shared world coordinates, including across expansions.
      map.repeat.setScalar(scale/.3);map.anisotropy=4;
      const material=owner[materialKey],previous=owner[key];owner[key]=map;material.map=map;
      {
        const grass=key==='grassMap';material.color.set(grass?'#6b9255':'#e0c598');
        material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          #ifdef USE_MAP
            float turfDetail=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
            diffuseColor.rgb=diffuse*(${grass?'.68+min(turfDetail,.65)*2.1':'.66+min(turfDetail,.65)*1.3'});
          #endif
        `);};
        material.customProgramCacheKey=()=> 'coastal-detail-'+key+'-v1';
      }
      material.needsUpdate=true;previous.dispose();resolve(true);
    },undefined,()=>resolve(false));
  }))).then(results=>results.every(Boolean));
}

import * as T from '../vendor/three.module.js';

export const STREET_SURFACE={plain:0,asphalt:1,stone:2};
/** World coordinates keep the photographed grain and joints continuous across
 * road tiles and plaza pieces. Markings stay plain in the same instance draw. */
export function streetSurfaces(loader=globalThis.document?new T.TextureLoader():null){
  let disposed=false;const maps=[],uniforms={};
  for(const key of ['streetAsphalt','streetStone']){
    const map=new T.DataTexture(new Uint8Array([128,128,128,255]),1,1);map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;maps.push(map);uniforms[key]={value:map};
  }
  const material=new T.MeshStandardMaterial({color:'#ffffff',roughness:.94});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute float streetSurface; varying float vStreetSurface; varying vec2 vStreetWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 streetPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        streetPosition=instanceMatrix*streetPosition;
      #endif
      vStreetWorld=(modelMatrix*streetPosition).xz;vStreetSurface=streetSurface;
    `);
    shader.fragmentShader='uniform sampler2D streetAsphalt;uniform sampler2D streetStone;varying float vStreetSurface;varying vec2 vStreetWorld;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(vStreetSurface>.5){
        vec3 photograph=vStreetSurface<1.5?texture2D(streetAsphalt,vStreetWorld*.8).rgb:texture2D(streetStone,vStreetWorld*1.25).rgb;
        float grain=dot(photograph,vec3(.2126,.7152,.0722));
        diffuseColor.rgb*=clamp(.64+grain*2.3,.68,1.36);
      }
    `);
  };
  material.customProgramCacheKey=()=> 'city-street-photographs-v1';
  const ready=loader?Promise.all([['streetAsphalt','city-asphalt.jpg'],['streetStone','city-pavers.jpg']].map(([key,file])=>new Promise(resolve=>{
    try{loader.load(new URL('../assets/textures/'+file,import.meta.url).href,map=>{
      if(disposed){map.dispose();resolve(false);return;}
      map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;maps.push(map);uniforms[key].value=map;resolve(true);
    },undefined,()=>resolve(false));}catch{resolve(false);}
  }))).then(result=>result.every(Boolean)):Promise.resolve(false);
  return {material,ready,dispose(){if(disposed)return;disposed=true;maps.forEach(map=>map.dispose());material.dispose();}};
}

import * as T from '../vendor/three.module.js';

// Original deterministic masks; smoke, foam and exhaust share one transparent batch.
export function navalEffectAtlas(){
  const size=64,width=size*3,data=new Uint8Array(width*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<width;x++){
    const style=Math.floor(x/size),u=((x%size)+.5)/size*2-1,v=(y+.5)/size*2-1;
    const radius=Math.hypot(u,v),grain=.5+.22*Math.sin(u*27+v*17)+.17*Math.sin(u*61-v*43)+.11*Math.cos(u*97+v*83);
    let alpha;
    if(style===0)alpha=Math.pow(Math.max(0,1-radius),2.2);
    else if(style===1){const edge=radius+.055*Math.sin(u*13+v*9)+.04*Math.cos(v*21-u*8);alpha=Math.pow(Math.max(0,1-edge),1.35)*(.58+grain*.42);}
    else{const edge=Math.max(0,1-Math.abs(u)*1.08),ribbon=Math.pow(edge,1.3)*Math.pow(Math.max(0,1-v*v),.65);alpha=ribbon*(.24+.76*Math.pow(Math.max(0,grain),1.5));}
    const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.min(1,alpha)*255);
  }
  const map=new T.DataTexture(data,width,size);map.needsUpdate=true;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;return map;
}

export function navalParticleGeometry(capacity){
  const geometry=new T.PlaneGeometry(1,1);
  geometry.setAttribute('fxStyle',new T.InstancedBufferAttribute(new Float32Array(capacity),1));
  geometry.setAttribute('fxOpacity',new T.InstancedBufferAttribute(new Float32Array(capacity),1));return geometry;
}

export function navalParticleMaterial(map,options={}){
  const material=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,toneMapped:false,...options});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float fxStyle; attribute float fxOpacity; varying float vFxStyle; varying float vFxOpacity;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFxStyle=fxStyle; vFxOpacity=fxOpacity;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFxStyle; varying float vFxOpacity;').replace('#include <map_fragment>',`#ifdef USE_MAP
      vec2 atlasUv=vec2((vMapUv.x+vFxStyle)/3.0,vMapUv.y);
      diffuseColor*=texture2D(map,atlasUv);
      diffuseColor.a*=vFxOpacity;
    #endif`);
  };
  material.customProgramCacheKey=()=> 'ultra-naval-particles-1';return material;
}

export function writeNavalParticle(mesh,index,dummy,color,style,opacity){
  dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);mesh.setColorAt(index,color);
  mesh.geometry.attributes.fxStyle.array[index]=style;mesh.geometry.attributes.fxOpacity.array[index]=Math.max(0,Math.min(1,opacity));
}

export function finishNavalParticles(mesh,count){
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.geometry.attributes.fxStyle.needsUpdate=true;mesh.geometry.attributes.fxOpacity.needsUpdate=true;
}

import * as T from '../vendor/three.module.js';
import {SEA_LEVEL} from './ultra-island-terrain.mjs?v=island-c2-20261025-1';

function fallbackNormals(){
  const n=64,bytes=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const at=(y*n+x)*4,u=x/n*Math.PI*2,v=y/n*Math.PI*2;bytes[at]=128+32*Math.sin(u*5+v*2);bytes[at+1]=128+29*Math.cos(v*7-u*3);bytes[at+2]=246;bytes[at+3]=255;}
  const t=new T.DataTexture(bytes,n,n);t.wrapS=t.wrapT=T.RepeatWrapping;t.needsUpdate=true;return t;
}

/** One draw, two moving normal samples; no reflection render target or scene pass. */
export function createIslandWater(scene){
  let disposed=false,detailed=false;const normal=fallbackNormals();
  const uniforms={...T.UniformsUtils.clone(T.UniformsLib.fog),clock:{value:0},islandSize:{value:16},normalMap:{value:normal},neighbors:{value:[new T.Vector4(500,500,1,1),new T.Vector4(500,500,1,1),new T.Vector4(500,500,1,1)]}};
  const material=new T.ShaderMaterial({uniforms,fog:true,vertexShader:`
    varying vec3 seaPosition;varying vec3 eyeVector;
    #include <common>
    #include <fog_pars_vertex>
    void main(){vec4 world=modelMatrix*vec4(position,1.);seaPosition=world.xyz;eyeVector=cameraPosition-world.xyz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,fragmentShader:`
    uniform float clock;uniform float islandSize;uniform sampler2D normalMap;uniform vec4 neighbors[3];varying vec3 seaPosition;varying vec3 eyeVector;
    #include <common>
    #include <fog_pars_fragment>
    float shore(vec2 p){float a=atan(p.y,p.x),c=abs(cos(a)),s=abs(sin(a));float r=(islandSize*.5*1.19+.9)/pow(pow(c,4.)+pow(s,4.),.25);r+=1.35+.62*sin(a*3.+.5)+.38*sin(a*7.-1.1);return length(p)-r;}
    void main(){
      vec2 p=seaPosition.xz;float t=clock;vec3 a=texture2D(normalMap,p*.075+vec2(t*.012,-t*.008)).xyz*2.-1.;vec3 b=texture2D(normalMap,p.yx*.13+vec2(-t*.009,t*.006)).xyz*2.-1.;
      vec3 n=normalize(vec3((a.x+b.x)*.23,1.,(a.y+b.y)*.23));vec3 viewDir=normalize(eyeVector);float fresnel=pow(1.-max(dot(n,viewDir),0.),3.);
      float distanceToShore=shore(p);
      for(int i=0;i<3;i++){vec2 q=(p-neighbors[i].xy)/neighbors[i].zw;float theta=atan(q.y,q.x);float rr=1.+.12*sin(theta*3.+float(i))+.08*cos(theta*5.-float(i));distanceToShore=min(distanceToShore,(length(q)-rr*1.16)*min(neighbors[i].z,neighbors[i].w));}
      float depth=smoothstep(.0,10.,distanceToShore);vec3 color=mix(vec3(.09,.53,.47),vec3(.025,.24,.31),depth);
      float ripple=dot(a.xy,b.yx)*.5+.5;color*=.88+ripple*.18;
      float caustic=pow(max(0.,sin(p.x*5.+a.y*2.+t*.4)*sin(p.y*4.+b.x*2.-t*.3)),8.);color+=vec3(.12,.28,.18)*caustic*(1.-depth)*.38;
      color=mix(color,vec3(.48,.68,.68),fresnel*.48);
      vec3 light=normalize(vec3(-.46,.81,.33));float spec=pow(max(0.,dot(n,normalize(light+viewDir))),130.);color+=vec3(1.,.87,.62)*spec*.5;
      float foamBand=1.-smoothstep(.06,.22,abs(distanceToShore-.12-sin(t*.7+p.x*.65+p.y*.55)*.12));float breaker=pow(max(0.,sin(distanceToShore*5.-t*1.4+a.x*1.8)),10.)*(1.-smoothstep(.5,1.8,distanceToShore))*smoothstep(-.1,.1,distanceToShore);
      float foam=(foamBand*.48+breaker*.19)*(.62+ripple*.38);color=mix(color,vec3(.79,.91,.82),foam);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`});
  const sea=new T.Mesh(new T.PlaneGeometry(350,350),material);sea.rotation.x=-Math.PI/2;sea.position.y=SEA_LEVEL;sea.name='ultra-island-water';scene.add(sea);
  if(globalThis.document){try{new T.TextureLoader().load(new URL('../assets/textures/naval-waternormals.jpg',import.meta.url).href,texture=>{if(disposed){texture.dispose();return;}texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;uniforms.normalMap.value=texture;detailed=true;},undefined,()=>{});}catch{}}
  return {sea,material,update(time){uniforms.clock.value=time;},setWorld(size,neighbors){uniforms.islandSize.value=size;neighbors.slice(0,3).forEach((n,i)=>uniforms.neighbors.value[i].set(n.x,n.z,n.width,n.depth));},metrics(){return {draws:1,reflectionPasses:0,detailedNormals:detailed};},dispose(){if(disposed)return;disposed=true;scene.remove(sea);sea.geometry.dispose();material.dispose();if(uniforms.normalMap.value!==normal)uniforms.normalMap.value.dispose();normal.dispose();}};
}

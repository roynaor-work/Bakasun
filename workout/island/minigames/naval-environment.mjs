import * as THREE from '../vendor/three.module.js';
import {Water} from './naval-water.mjs?v=island-ski-20261031-1';
import {NAVAL_SHORES} from './ultra-naval-environment-layout.mjs';

const SUN=new THREE.Vector3(-.58,.52,-.64).normalize();

/** A repeatable normal field built once; no downloaded texture or render clock. */
export function navalWaterNormals(size=128){
  const bytes=new Uint8Array(size*size*4),tau=Math.PI*2;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*tau,v=y/size*tau;
    const dx=.65*Math.cos(u*3+v*2)+.28*Math.cos(u*7-v*5)+.13*Math.cos(u*13+v*11);
    const dy=.6*Math.cos(v*4-u*2)+.3*Math.cos(u*5+v*7)+.12*Math.cos(v*17-u*9);
    const normal=new THREE.Vector3(-dx,-dy,1.6).normalize(),i=(y*size+x)*4;
    bytes[i]=Math.round((normal.x*.5+.5)*255);bytes[i+1]=Math.round((normal.y*.5+.5)*255);
    bytes[i+2]=Math.round((normal.z*.5+.5)*255);bytes[i+3]=255;
  }
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

/** Presentation only. Simulation time/camera remain owned by the existing model. */
export function createNavalEnvironment(scene,renderer,fallbackSea,sunDisk,adapters={}){
  let disposed=false,reflecting=true,captures=0,lastCapture=-Infinity,clock=0;const mirror={calls:0,triangles:0,peakCalls:0,peakTriangles:0};
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  scene.background=new THREE.Color('#8fc7df');scene.fog=new THREE.FogExp2('#9cc7d7',.00115);
  const hemisphere=new THREE.HemisphereLight('#dcf1fb','#507b7c',1.65);
  const sunlight=new THREE.DirectionalLight('#fff0cf',2.5);sunlight.position.copy(SUN).multiplyScalar(60);
  const rim=new THREE.DirectionalLight('#c7efff',.65);rim.position.set(24,9,14);
  scene.add(hemisphere,sunlight,rim);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{sunDirection:{value:SUN}},
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vDirection;uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);
        vec3 color=mix(vec3(.16,.43,.65),vec3(.042,.23,.49),pow(h,.52));
        float sun=max(0.,dot(d,sunDirection));color+=vec3(1.,.78,.41)*pow(sun,14.)*.21;
        color=mix(color,vec3(.38,.58,.67),pow(1.-h,18.)*.12);
        color=mix(color,vec3(1.,.95,.78),smoothstep(.9992,.99972,sun));gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(310,24,12),skyMaterial);scene.add(sky);
  const normals=navalWaterNormals();let detailedNormals=null;
  const normalLoader=adapters.normalLoader||(typeof document==='undefined'?null:new THREE.TextureLoader());
  const water=new Water(new THREE.PlaneGeometry(900,900),{
    textureWidth:256,textureHeight:256,waterNormals:normals,sunDirection:SUN,
    sunColor:'#fff0d0',waterColor:'#008b9f',distortionScale:2.15,fog:true,
  });
  water.rotation.x=-Math.PI/2;water.position.y=-.13;water.material.uniforms.size.value=4.05;
  water.material.uniforms.shores={value:NAVAL_SHORES.map(s=>new THREE.Vector4(s.x,s.z,s.rx,s.rz))};
  // The fallback keeps the same palette and moving glints when reflection is shed.
  const fallbackTime={value:0},fallbackNormals={value:normals},fallbackEye={value:new THREE.Vector3()},fallbackMaterial=fallbackSea.material;
  const previousCompile=fallbackMaterial?.onBeforeCompile,previousKey=fallbackMaterial?.customProgramCacheKey;
  if(fallbackMaterial){
    fallbackMaterial.roughness=.96;fallbackMaterial.metalness=0;
    fallbackMaterial.onBeforeCompile=shader=>{
      shader.uniforms.ultraSeaTime=fallbackTime;shader.uniforms.ultraSeaNormals=fallbackNormals;shader.uniforms.ultraSeaEye=fallbackEye;
      shader.uniforms.ultraSeaSun={value:SUN};shader.uniforms.ultraSeaShores=water.material.uniforms.shores;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 ultraSeaPoint;').replace('#include <begin_vertex>','#include <begin_vertex>\nultraSeaPoint=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        uniform float ultraSeaTime;uniform sampler2D ultraSeaNormals;
        uniform vec3 ultraSeaEye;uniform vec3 ultraSeaSun;uniform vec4 ultraSeaShores[3];varying vec3 ultraSeaPoint;`)
        // The coarse fallback grid contributes silhouette only. Its faceted
        // StandardMaterial specular must not become broad white polygon bands.
        .replace('#include <opaque_fragment>',`
        vec2 seaPoint=ultraSeaPoint.xz;float seaClock=ultraSeaTime;
        vec2 seaUv0=seaPoint*.039+vec2(seaClock*.006,-seaClock*.004);
        vec2 seaUv1=mat2(.8,-.6,.6,.8)*seaPoint*.043+vec2(-seaClock*.004,seaClock*.005);
        vec3 seaWave=texture2D(ultraSeaNormals,seaUv0).xyz+texture2D(ultraSeaNormals,seaUv1).xyz-1.;
        vec3 seaNormal=normalize(vec3(seaWave.x*1.12,max(.48,seaWave.z),seaWave.y*1.12));
        vec3 seaEye=normalize(ultraSeaEye-ultraSeaPoint);float seaFacing=max(0.,dot(seaNormal,seaEye));
        float seaBank=0.;for(int i=0;i<3;i++){
          float shoreDistance=length((seaPoint-ultraSeaShores[i].xy)/ultraSeaShores[i].zw);
          seaBank=max(seaBank,exp(-max(0.,shoreDistance-.82)*3.2));
        }
        float seaDepth=.5+.5*sin(seaPoint.x*.027+sin(seaPoint.y*.041)*1.7);
        vec3 seaDeep=mix(vec3(.006,.135,.205),vec3(.012,.24,.29),seaDepth*.56);
        vec3 seaLagoon=mix(seaDeep,vec3(.035,.36,.33),seaBank*.77);
        float seaFresnel=.065+.935*pow(1.-seaFacing,5.);
        vec3 seaColor=mix(seaLagoon*(.22+seaFacing*1.52),vec3(.13,.29,.35),seaFresnel*.29);
        float seaSun=max(0.,dot(normalize(reflect(-ultraSeaSun,seaNormal)),seaEye));
        outgoingLight=seaColor+vec3(1.,.88,.69)*(pow(seaSun,88.)*.079+pow(seaSun,18.)*.009);
        #include <opaque_fragment>`);
    };
    fallbackMaterial.customProgramCacheKey=()=> 'ultra-naval-fallback-sea-2';fallbackMaterial.needsUpdate=true;
  }
  // Refresh reflections at up to 12 Hz; animate the surface every model frame.
  const capture=water.onBeforeRender;
  water.onBeforeRender=function(...args){if(clock-lastCapture<1/12&&clock>=lastCapture)return;lastCapture=clock;const info=args[0]?.info?.render,c0=info?.calls??0,t0=info?.triangles??0;
    // Aim marks, shells, hit effects, smoke and foam are left out of the 12 Hz reflection pass: they read in the main view, and drawing them twice broke the stage-10 budget when aiming over a live hit (28/10).
    const hidden=[];for(const child of args[1]?.children||[])if(child.userData?.noReflect&&child.visible){child.visible=false;hidden.push(child);}
    try{capture.apply(this,args);}finally{for(const child of hidden)child.visible=true;}captures++;if(info){mirror.calls=info.calls-c0;mirror.triangles=info.triangles-t0;mirror.peakCalls=Math.max(mirror.peakCalls,mirror.calls);mirror.peakTriangles=Math.max(mirror.peakTriangles,mirror.triangles);}};
  scene.add(water);fallbackSea.visible=false;sunDisk.visible=false;
  normalLoader?.load(new URL('../assets/textures/naval-waternormals.jpg',import.meta.url).href,texture=>{
    if(disposed){texture.dispose();return;}
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;
    detailedNormals=texture;water.material.uniforms.normalSampler.value=texture;fallbackNormals.value=texture;
  },undefined,()=>{});
  return {
    update(time,camera){if(disposed)return;clock=time;fallbackTime.value=time;fallbackEye.value.copy(camera.position);water.material.uniforms.time.value=time*.45;sky.position.copy(camera.position);},
    degrade(){if(disposed||!reflecting)return;reflecting=false;water.visible=false;fallbackSea.visible=true;},
    metrics(){return {revision:'ultra-naval-3',detailedNormals:Boolean(detailedNormals),water:reflecting?'reflective':'light',reflectionSize:256,reflectionCaptures:captures,mirror:{...mirror},waterTime:water.material.uniforms.time.value,shallowBanks:NAVAL_SHORES.length,fallbackRipples:Boolean(fallbackMaterial),disposed};},
    dispose(){if(disposed)return;disposed=true;scene.remove(water,sky,hemisphere,sunlight,rim);normals.dispose();detailedNormals?.dispose();water.dispose();sky.geometry.dispose();skyMaterial.dispose();if(fallbackMaterial){fallbackMaterial.onBeforeCompile=previousCompile;fallbackMaterial.customProgramCacheKey=previousKey;}},
  };
}

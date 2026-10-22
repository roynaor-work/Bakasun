import * as THREE from '../vendor/three.module.js';
import {Water} from './naval-water.mjs?v=naval-art-20261022-1';

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
export function createNavalEnvironment(scene,renderer,fallbackSea,sunDisk){
  let disposed=false,reflecting=true,captures=0,lastCapture=-Infinity,clock=0;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  scene.background=new THREE.Color('#8fc7df');scene.fog=new THREE.Fog('#8fc7df',65,160);
  const hemisphere=new THREE.HemisphereLight('#dff5ff','#426b7e',1.45);
  const sunlight=new THREE.DirectionalLight('#ffe4b0',2.3);sunlight.position.copy(SUN).multiplyScalar(60);
  const rim=new THREE.DirectionalLight('#a9e5ff',.85);rim.position.set(24,9,14);
  scene.add(hemisphere,sunlight,rim);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{sunDirection:{value:SUN}},
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vDirection;uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);
        vec3 color=mix(vec3(.13,.39,.65),vec3(.035,.19,.48),pow(h,.55));
        float sun=max(0.,dot(d,sunDirection));color+=vec3(1.,.65,.28)*pow(sun,9.)*.28;
        color=mix(color,vec3(1.,.94,.72),smoothstep(.9991,.9997,sun));gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(185,24,12),skyMaterial);scene.add(sky);
  const normals=navalWaterNormals();
  const water=new Water(new THREE.PlaneGeometry(900,900),{
    textureWidth:256,textureHeight:256,waterNormals:normals,sunDirection:SUN,
    sunColor:'#ffe9c4',waterColor:'#008b9f',distortionScale:2.8,fog:true,
  });
  water.rotation.x=-Math.PI/2;water.position.y=-.13;water.material.uniforms.size.value=3.8;
  water.material.fragmentShader=water.material.fragmentShader
    .replace('float rf0 = 0.3;','float rf0 = 0.075;')
    .replace('vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',
      'vec3 albedo = mix((sunColor * diffuseLight * 0.10 + scatter * 1.7) * getShadowMask(), reflectionSample, reflectance * 0.28) + specularLight * 0.18;');
  // Refresh reflections at up to 12 Hz; animate the surface every model frame.
  const capture=water.onBeforeRender;
  water.onBeforeRender=function(...args){if(clock-lastCapture<1/12&&clock>=lastCapture)return;lastCapture=clock;capture.apply(this,args);captures++;};
  scene.add(water);fallbackSea.visible=false;sunDisk.visible=false;
  return {
    update(time,camera){if(disposed)return;clock=time;water.material.uniforms.time.value=time*.45;sky.position.copy(camera.position);},
    degrade(){if(disposed||!reflecting)return;reflecting=false;water.visible=false;fallbackSea.visible=true;},
    metrics(){return {revision:'naval-art-1',water:reflecting?'reflective':'light',reflectionSize:256,reflectionCaptures:captures,waterTime:water.material.uniforms.time.value,disposed};},
    dispose(){if(disposed)return;disposed=true;scene.remove(water,sky,hemisphere,sunlight,rim);normals.dispose();water.dispose();sky.geometry.dispose();skyMaterial.dispose();},
  };
}

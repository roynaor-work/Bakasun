import * as THREE from '../vendor/three.module.js';

// Shared analytic sea surface: effects and wake vertices use the same phase.
export const waveGLSL=`
float sea(vec2 p,float t){
 return sin(dot(p,vec2(.105,.074))-t*.85)*.48
       +sin(dot(p,vec2(-.17,.21))-t*1.12)*.22
       +sin(dot(p,vec2(.41,.13))+t*1.42)*.08;
}
vec2 seaSlope(vec2 p,float t){
 return cos(dot(p,vec2(.105,.074))-t*.85)*.48*vec2(.105,.074)
       +cos(dot(p,vec2(-.17,.21))-t*1.12)*.22*vec2(-.17,.21)
       +cos(dot(p,vec2(.41,.13))+t*1.42)*.08*vec2(.41,.13);
}`;
const noiseGLSL=`
uniform sampler2D uNoise;
float noise(vec2 p){return texture2D(uNoise,(p+.5)/128.).r;}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.04+7.2)*.28+noise(p*4.1-3.7)*.15;}
`;
const skyGLSL=`
vec3 skyColor(vec3 d,float storm,float t){
 float h=max(0.,d.y);
 vec3 warm=mix(vec3(.30,.105,.04),vec3(.48,.31,.16),smoothstep(-.04,.12,d.y));
 vec3 cool=mix(vec3(.07,.135,.18),vec3(.008,.024,.046),smoothstep(.03,.75,h));
 vec3 c=mix(warm,cool,smoothstep(0.,.44,h));
 vec3 sun=normalize(vec3(-.66,.14,-.53));float glow=max(0.,dot(d,sun));
 c+=vec3(.38,.11,.025)*pow(glow,24.)*(1.-storm*.8);
 c+=vec3(2.8,1.8,.68)*smoothstep(.99955,.99984,glow)*(1.-storm*.95);
 return mix(c,mix(vec3(.09,.13,.15),vec3(.018,.043,.066),smoothstep(0.,.6,h)),storm*.78);
}`;

export function createAtmosphere(scene){
 const uniforms={uTime:{value:0},uStorm:{value:0},uNoise:{value:null}};
 const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,
  vertexShader:`varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader:`uniform float uTime,uStorm;varying vec3 vDir;${noiseGLSL}${skyGLSL}
  void main(){
   vec3 d=normalize(vDir);vec3 c=skyColor(d,uStorm,uTime);
   vec2 p=d.xz/(max(.04,d.y)+.11)*2.8+vec2(uTime*.006,-uTime*.004);
   float cloud=fbm(p);float layer=smoothstep(.46-uStorm*.12,.74-uStorm*.08,cloud);
   layer*=smoothstep(-.025,.16,d.y)*(1.-smoothstep(.8,1.,d.y));
   vec3 cloudColor=mix(vec3(.075,.105,.14),vec3(.018,.035,.055),uStorm*.8);
   cloudColor+=vec3(.12,.045,.012)*(1.-cloud)*(1.-uStorm);
   c=mix(c,cloudColor,layer*(.58+uStorm*.34));
   float shelf=fbm(p*.47+vec2(5.,uTime*.001));
   c=mix(c,vec3(.023,.048,.075),smoothstep(.56,.76,shelf)*smoothstep(.07,.3,d.y)*(.18+.6*uStorm));
   float angle=atan(d.x,d.z);
   float underside=.07+noise(vec2(angle*4.2,uTime*.002))*.065;
   float bank=smoothstep(underside,underside+.035,d.y)*smoothstep(.34,.64,fbm(vec2(angle*4.,d.y*12.)+vec2(uTime*.004,3.)));
   vec3 bankColor=mix(vec3(.028,.049,.070),vec3(.012,.028,.046),uStorm);
   bankColor+=vec3(.09,.046,.018)*(1.-uStorm)*(1.-smoothstep(.36,.64,cloud));
   c=mix(c,bankColor,bank*(.68+uStorm*.25));
   gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 // Opaque sky last: depth rejects pixels already occupied by sea/ships. This
 // avoids evaluating all cloud layers behind the entire ocean on mobile GPUs.
 const sky=new THREE.Mesh(new THREE.SphereGeometry(1500,24,12),material);sky.frustumCulled=false;sky.renderOrder=100;scene.add(sky);
 return {uniforms,sky,dispose(){sky.geometry.dispose();material.dispose();}};
}

export function createOcean(scene,normalMap,noiseMap){
 normalMap.wrapS=normalMap.wrapT=THREE.RepeatWrapping;normalMap.colorSpace=THREE.NoColorSpace;
 const uniforms={uTime:{value:0},uStorm:{value:0},uNormal:{value:normalMap},uNoise:{value:noiseMap},uAmplitude:{value:1},uQuality:{value:1},uIsland:{value:new THREE.Vector3(83,-93,40)}};
 const material=new THREE.ShaderMaterial({uniforms,
  vertexShader:`uniform float uTime,uAmplitude;varying vec3 vWorld;varying float vCrest;${waveGLSL}
   void main(){vec3 p=position;float h=sea(p.xz,uTime)*uAmplitude*(1.-smoothstep(85.,119.,length(p.xz)));p.y=h;vWorld=p;vCrest=h;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`uniform float uTime,uStorm,uAmplitude,uQuality;uniform sampler2D uNormal;uniform vec3 uIsland;varying vec3 vWorld;varying float vCrest;${waveGLSL}${noiseGLSL}${skyGLSL}
   void main(){
    vec2 p=vWorld.xz;vec2 slope=seaSlope(p,uTime)*uAmplitude;
    vec3 n1=texture2D(uNormal,p*.009+vec2(uTime*.004,-uTime*.002)).xyz*2.-1.;
    vec3 n2=texture2D(uNormal,mat2(.8,-.6,.6,.8)*p*.017+vec2(-uTime*.003,uTime*.004)).xyz*2.-1.;
    vec3 N=normalize(vec3(-slope.x*.35+(n1.x+n2.y)*.024,1.,-slope.y*.35+(n1.y+n2.x)*.024));
    vec3 V=normalize(cameraPosition-vWorld);vec3 R=reflect(-V,N);
    float fresnel=.035+.43*pow(1.-max(0.,dot(V,N)),4.);
    vec3 deep=mix(vec3(.018,.105,.145),vec3(.025,.095,.13),uStorm);
    vec3 shallow=vec3(.045,.22,.235);
    float dist=length(vWorld.xz-uIsland.xy);float shoal=(1.-smoothstep(uIsland.z*.75,uIsland.z+17.,dist));
    float flow=fbm(p*.065+vec2(uTime*.018));
    vec3 water=mix(deep,shallow,shoal*.65)*(.76+flow*.4+vCrest*.12)+vec3(.006,.018,.018)*(N.y*.5+.5);
    vec3 reflected=skyColor(R,uStorm,uTime);
    vec3 c=mix(water,reflected,fresnel);
    vec3 sun=normalize(vec3(-.66,.14,-.53));vec3 H=normalize(sun+V);
    float spec=pow(max(0.,dot(N,H)),150.);c+=vec3(.8,.40,.12)*spec*(1.-uStorm*.9);
    float grain=noise(p*.7+vec2(uTime*.16));
    float crest=smoothstep(.57,.72,vCrest/uAmplitude)*smoothstep(.57,.8,grain)*(.18+.4*uStorm);
    float shore=1.-smoothstep(.0,3.2,abs(dist-uIsland.z+sin(atan(p.y-uIsland.y,p.x-uIsland.x)*5.)*2.5));
    shore*=smoothstep(.2,.7,grain+sin(dist*2.-uTime*1.4)*.22)*.7;
    float foam=clamp((crest+shore)*(.5+grain*.5),0.,.85);
    c=mix(c,vec3(.63,.76,.74),foam);
    float fog=smoothstep(1050.,2300.,length(vWorld-cameraPosition));c=mix(c,skyColor(normalize(vec3(vWorld.x-cameraPosition.x,.006,vWorld.z-cameraPosition.z)),uStorm,uTime),fog);
    gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 // Central patch is dense; outer ring has long waves and avoids a 2400m dense grid.
 const geometry=new THREE.PlaneGeometry(240,240,64,64);geometry.rotateX(-Math.PI/2);
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
 // A ring leaves the central patch open: no overlapping waves / z fighting.
 const outerGeometry=new THREE.BufferGeometry();
 outerGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-1500,0,-1500,1500,0,-1500,1500,0,1500,-1500,0,1500,-120,0,-120,120,0,-120,120,0,120,-120,0,120],3));
 outerGeometry.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);
 const outer=new THREE.Mesh(outerGeometry,material);outer.renderOrder=-1;outer.frustumCulled=false;scene.add(outer);
 return {mesh,uniforms,material,dispose(){geometry.dispose();outerGeometry.dispose();material.dispose();}};
}

export function createWake(scene,length,beam,noiseMap){
 const uniforms={uTime:{value:0},uLength:{value:length},uBeam:{value:beam},uStrength:{value:1},uAmplitude:{value:1},uNoise:{value:noiseMap}};
 const geo=new THREE.PlaneGeometry(beam*5,length*2.3,1,28);geo.rotateX(-Math.PI/2);geo.translate(0,0,-length*.25);
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms,
  vertexShader:`uniform float uTime,uAmplitude;varying vec3 vLocal;varying vec3 vWorld;${waveGLSL}
   void main(){vLocal=position;vec4 w=modelMatrix*vec4(position,1.);w.y=sea(w.xz,uTime)*uAmplitude+.055;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uTime,uLength,uBeam,uStrength;varying vec3 vLocal;varying vec3 vWorld;${noiseGLSL}
   void main(){
    float x=abs(vLocal.x),z=vLocal.z;float stern=-uLength*.47;
    float behind=max(0.,stern-z);float trail=1.-smoothstep(0.,uLength*.9,behind);
    float spread=uBeam*.45+behind*.28;
    float v=1.-smoothstep(.15,1.1,abs(x-spread));
    float churn=(1.-smoothstep(uBeam*.2,uBeam*.63,x))*trail*.45;
    float wake=(v*trail*.65+churn)*step(z,stern);
    float hull=(1.-smoothstep(.25,1.15,abs(x-uBeam*.49)))*(1.-smoothstep(uLength*.30,uLength*.48,abs(z)));
    float bow=1.-smoothstep(.2,1.2,abs(length(vec2(vLocal.x*1.7,(z-uLength*.27)*.65))-uBeam*.54));
    bow*=step(uLength*.25,z);wake+=hull*.45+bow*.65;
    float grit=fbm(vWorld.xz*.65+vec2(0,uTime*.9));
    float a=clamp(wake*mix(.2,1.,grit)*uStrength,0.,.72);
    gl_FragColor=vec4(mix(vec3(.32,.54,.55),vec3(.78,.84,.76),grit),a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const wake=new THREE.Mesh(geo,mat);wake.renderOrder=2;scene.add(wake);
 return {mesh:wake,uniforms,dispose(){geo.dispose();mat.dispose();}};
}

export function waveHeight(x,z,t,amplitude=1){
 return (Math.sin(x*.105+z*.074-t*.85)*.48+Math.sin(-x*.17+z*.21-t*1.12)*.22+Math.sin(x*.41+z*.13+t*1.42)*.08)*amplitude;
}

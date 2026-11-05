import * as THREE from '../vendor/three.module.js';

export function createEffects(scene){
 const capacity=320,geo=new THREE.PlaneGeometry(1,1),dummy=new THREE.Object3D();let budget=160;
 const starts=new Float32Array(capacity).fill(-1000),lives=new Float32Array(capacity).fill(1),types=new Float32Array(capacity),seeds=new Float32Array(capacity),velocity=new Float32Array(capacity*3),sizes=new Float32Array(capacity);
 for(const [n,a,size]of [['aStart',starts,1],['aLife',lives,1],['aType',types,1],['aSeed',seeds,1],['aVelocity',velocity,3],['aSize',sizes,1]])geo.setAttribute(n,new THREE.InstancedBufferAttribute(a,size));
 const uniforms={uTime:{value:0},uWind:{value:new THREE.Vector2(1.3,.4)},uOpacity:{value:1}};
 const mat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
  vertexShader:`attribute float aStart,aLife,aType,aSeed,aSize;attribute vec3 aVelocity;uniform float uTime;uniform vec2 uWind;varying vec2 vUv;varying float vAge,vType,vSeed;
   void main(){
    float age=uTime-aStart;float u=clamp(age/aLife,0.,1.);vAge=u;vType=aType;vSeed=aSeed;vUv=uv;
    vec3 origin=vec3(instanceMatrix[3]);vec3 p=origin+aVelocity*age;
    if(aType>1.5&&aType<3.5)p.y-=4.2*age*age;
    else {p.xz+=uWind*age*age*.12;p.y+=age*age*.17;}
    float scale=aSize*(aType<.5?(.4+u*2.2):aType<1.5?(.5+sin(u*3.14)*.9):(1.-u*.75));
    if(age<0.||age>aLife)scale=0.;
    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    float cs=cos(aSeed*6.),sn=sin(aSeed*6.);vec2 q=mat2(cs,-sn,sn,cs)*position.xy;
    p+=(right*q.x+up*q.y)*scale;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
   }`,
  fragmentShader:`uniform float uOpacity;varying vec2 vUv;varying float vAge,vType,vSeed;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
   void main(){
    vec2 p=vUv*2.-1.;float n=noise(p*4.+vSeed*32.+vAge*2.);float r=length(p);
    float edge=1.-smoothstep(.35+n*.22,1.,r);float fade=sin(vAge*3.14159);vec3 c;float alpha;
    if(vType<.5){c=mix(vec3(.11,.14,.16),vec3(.38,.39,.35),n*.7+vAge*.2);alpha=edge*fade*.66;}
    else if(vType<1.5){c=mix(vec3(.93,.16,.015),vec3(3.1,1.9,.48),clamp((1.-r)*1.1-vAge*.4,0.,1.));alpha=edge*fade*.9;}
    else if(vType<2.5){c=mix(vec3(.32,.55,.59),vec3(.84,.9,.82),n);alpha=edge*fade*.78;}
    else if(vType<3.5){c=vec3(2.8,1.2,.16);alpha=(1.-smoothstep(.0,.75,r))*fade;}
    else {c=vec3(5.,2.9,1.1);alpha=pow(max(0.,1.-r),2.)*(1.-vAge);}
    if(alpha<.01)discard;gl_FragColor=vec4(c,alpha*uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const mesh=new THREE.InstancedMesh(geo,mat,capacity);mesh.count=budget;mesh.frustumCulled=false;mesh.renderOrder=5;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
 // Three recyclable continuous water plumes, independent of the droplet pool.
 const columnGeometry=new THREE.CylinderGeometry(1,1,1,14,10,true);
 const columnStarts=new Float32Array(3).fill(-1000);columnGeometry.setAttribute('aStart',new THREE.InstancedBufferAttribute(columnStarts,1));
 const columnMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:uniforms.uTime},
  vertexShader:`attribute float aStart;uniform float uTime;varying float vHeight,vAge;varying vec2 vUv;
   void main(){
    float age=uTime-aStart,u=clamp(age/1.7,0.,1.);vAge=u;vUv=uv;float h=position.y+.5;vHeight=h;
    float height=sin(u*3.14159)*19.;if(age<0.||age>1.7)height=0.;
    float radius=(.25+pow(1.-h,.8)*1.55)*(.8+u*.9);
    radius*=1.+sin(h*27.+uv.x*38.-uTime*9.)*.14;
    vec3 p=vec3(position.x*radius,h*height,position.z*radius);
    gl_Position=projectionMatrix*viewMatrix*instanceMatrix*vec4(p,1.);
   }`,
  fragmentShader:`varying float vHeight,vAge;varying vec2 vUv;
   void main(){
    float ribs=.65+.35*sin(vUv.x*95.+vHeight*19.);
    float a=sin(vAge*3.14159)*(.7-vHeight*.25)*ribs;
    vec3 c=mix(vec3(.17,.36,.39),vec3(.68,.79,.75),vHeight*.75+ribs*.2);
    gl_FragColor=vec4(c,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const columns=new THREE.InstancedMesh(columnGeometry,columnMaterial,3);columns.frustumCulled=false;columns.renderOrder=3;scene.add(columns);let columnCursor=0;
 let cursor=0,time=0,seed=708;
 const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 function particle(origin,type,life,size,v){
  const i=cursor++%budget;dummy.position.copy(origin);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  starts[i]=time;lives[i]=life;types[i]=type;seeds[i]=rand();sizes[i]=size;velocity.set(v,i*3);
 }
 function commit(){mesh.instanceMatrix.needsUpdate=true;for(const n of ['aStart','aLife','aType','aSeed','aVelocity','aSize'])geo.attributes[n].needsUpdate=true;}
 const origin=new THREE.Vector3();
 function explosion(p,scale=1){
  for(let i=0;i<30;i++){const a=rand()*Math.PI*2,s=rand()*4;origin.copy(p);origin.x+=(rand()-.5)*2;origin.z+=(rand()-.5)*2;
   particle(origin,i<12?1:0,(i<12?.65+rand()*.7:2.6+rand()*1.5),scale*(i<12?4:5),[Math.cos(a)*s,1.5+rand()*4,Math.sin(a)*s]);}
  for(let i=0;i<18;i++){const a=rand()*Math.PI*2;particle(p,3,.7+rand(),scale*.42,[Math.cos(a)*10,4+rand()*10,Math.sin(a)*10]);}
  particle(p,4,.24,scale*15,[0,0,0]);commit();
 }
 function splash(p,scale=1){
  const ci=columnCursor++%3;dummy.position.copy(p);dummy.updateMatrix();columns.setMatrixAt(ci,dummy.matrix);columnStarts[ci]=time;columnGeometry.attributes.aStart.needsUpdate=true;columns.instanceMatrix.needsUpdate=true;
  for(let i=0;i<44;i++){const a=rand()*Math.PI*2,s=rand()*4.4;origin.copy(p);origin.y+=.4;
   particle(origin,2,1.2+rand()*.75,scale*(i<12?3.7:1.1),[Math.cos(a)*s,scale*(8+rand()*9),Math.sin(a)*s]);}
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2;origin.copy(p);origin.x+=Math.cos(a)*2;origin.z+=Math.sin(a)*2;particle(origin,2,1.5,scale*2.2,[Math.cos(a)*3,1,Math.sin(a)*3]);}commit();
 }
 function burning(p,scale=1){
  origin.copy(p);origin.x+=(rand()-.5)*1.8;origin.z+=(rand()-.5)*1.5;
  particle(origin,1,.65+rand()*.5,scale*(2+rand()*2),[(rand()-.5),2+rand()*3,(rand()-.5)]);
  particle(origin,0,3+rand()*2,scale*(3+rand()*2),[.4,2+rand()*2,.2]);commit();
 }
 return {mesh,explosion,splash,burning,setBudget(value){budget=Math.max(48,Math.min(capacity,value));mesh.count=budget;},update(t,opacity=1){time=t;uniforms.uTime.value=t;uniforms.uOpacity.value=opacity;},clear(){starts.fill(-1000);columnStarts.fill(-1000);seed=708;geo.attributes.aStart.needsUpdate=true;columnGeometry.attributes.aStart.needsUpdate=true;},stats(){let active=0;for(let i=0;i<budget;i++)if(time>=starts[i]&&time-starts[i]<lives[i])active++;return{capacity:budget,allocatedCapacity:capacity,active,waterColumnCapacity:3};},dispose(){geo.dispose();mat.dispose();columnGeometry.dispose();columnMaterial.dispose();}};
}

export function createRain(scene){
 const n=560,a=new Float32Array(n*2*3),tail=new Float32Array(n*2);let s=17;const rand=()=>{s=(s*16807)%2147483647;return s/2147483647;};
 for(let i=0;i<n;i++){const x=(rand()-.5)*190,y=rand()*65,z=(rand()-.5)*190;a.set([x,y,z,x,y,z],i*6);tail[i*2+1]=1;}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(a,3));geo.setAttribute('aTail',new THREE.BufferAttribute(tail,1));
 const uniforms={uTime:{value:0},uAmount:{value:0},uCenter:{value:new THREE.Vector3()}};
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms,
  vertexShader:`attribute float aTail;uniform float uTime;uniform vec3 uCenter;void main(){vec3 p=position;p.y=mod(p.y-uTime*28.,65.)-aTail*1.4;p.x-=mod(uTime*4.,30.)+aTail*.48;p.z+=aTail*.12;p+=uCenter;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
  fragmentShader:`uniform float uAmount;void main(){gl_FragColor=vec4(.65,.77,.8,uAmount*.23);}`});
 const lines=new THREE.LineSegments(geo,mat);lines.frustumCulled=false;lines.renderOrder=4;scene.add(lines);
 return{lines,uniforms,dispose(){geo.dispose();mat.dispose();}};
}

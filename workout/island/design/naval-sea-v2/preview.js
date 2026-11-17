import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

const $=s=>document.querySelector(s), canvas=$('#sea');
const state={mode:'sunset',wave:'breeze',time:0,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,ready:false,impact:0};
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,.3,5000);
camera.position.set(47,25,67);camera.lookAt(-7,3,-67);
const hemi=new THREE.HemisphereLight(0xc7c9ed,0x183f45,2.5);scene.add(hemi);
const sunLight=new THREE.DirectionalLight(0xffcc9b,3.1);sunLight.position.set(-140,70,-200);scene.add(sunLight);
const fill=new THREE.DirectionalLight(0xa2c5d0,.8);fill.position.set(90,70,40);scene.add(fill);
const textureLoader=new THREE.TextureLoader(),modelLoader=new GLTFLoader();
const textures=new Map(),assets=new Map(),models=new Map(),effects=[];
let manifest,water,ship,lighthouse,beacon,sun,horizon,stars,wake;
const floaters=[],foam=[];
const v4=a=>new THREE.Vector4(...a);
const modes={
 day:{fog:0xaecbd1,deep:0x053449,shallow:0x1e7885,sky:0xc0d9dc,sun:0xffebbd,ambient:2.9,key:2.8,fogDensity:.00155,reflection:.43},
 sunset:{fog:0xd5a9a0,deep:0x092f41,shallow:0x366777,sky:0xd59a91,sun:0xffbb77,ambient:2.15,key:3.3,fogDensity:.00165,reflection:.95},
 night:{fog:0x23364c,deep:0x051725,shallow:0x173b50,sky:0x52637e,sun:0xacc9ed,ambient:.98,key:.72,fogDensity:.0019,reflection:.37}
};

async function texture(id){
 if(textures.has(id))return textures.get(id);
 const a=assets.get(id),t=await textureLoader.loadAsync(a.path);
 t.colorSpace=a.colorSpace==='linear'?THREE.NoColorSpace:THREE.SRGBColorSpace;
 t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
 textures.set(id,t);return t;
}
function mesh(geometry,material,parent=scene){const m=new THREE.Mesh(geometry,material);parent.add(m);return m;}
function frameUV(id,index){return v4(assets.get(id).frames[index].uv);}

const waterVertex=`
 uniform float time;uniform float strength;varying vec3 world;varying vec3 viewDir;
 void main(){
  vec3 p=position;float phase=time*1.57079632679;
  p.z+=strength*(sin(p.x*.06+p.y*.035-phase)*.36+sin(p.y*.092-p.x*.018-phase*2.)*.16);
  vec4 w=modelMatrix*vec4(p,1.);world=w.xyz;viewDir=cameraPosition-world;
  gl_Position=projectionMatrix*viewMatrix*w;
 }`;
const waterFragment=`
 uniform sampler2D colorMap;uniform sampler2D normalMap;
 uniform float time;uniform float strength;uniform vec3 deep;uniform vec3 shallow;
 uniform vec3 sky;uniform vec3 sunlight;uniform vec3 fogColor;uniform float fogDensity;uniform float reflection;
 varying vec3 world;varying vec3 viewDir;
 vec4 tile(sampler2D atlas,vec2 local,float f){
  vec2 cell=vec2(mod(f,4.),3.-floor(f/4.));
  return texture2D(atlas,(cell*260.+2.5+fract(local)*255.)/1040.);
 }
 vec4 animated(sampler2D atlas,vec2 uv){
  float ph=mod(time,4.)*4.;float f=floor(ph);
  return mix(tile(atlas,uv,f),tile(atlas,uv,mod(f+1.,16.)),fract(ph));
 }
 void main(){
  vec2 uv=world.xz/32.+vec2(sin(world.z*.017),sin(world.x*.014))*.34;
  vec3 a=animated(normalMap,uv).rgb*2.-1.;
  vec3 b=animated(normalMap,uv*1.91+vec2(.31,.17)).rgb*2.-1.;
  vec3 n=normalize(vec3(a.x+b.x*.56,1.6,a.y+b.y*.56));
  vec3 v=normalize(viewDir),l=normalize(vec3(-.6,.12,-.8));
  float fresnel=.035+.68*pow(1.-max(dot(n,v),0.),4.);
  float ridge=clamp(a.y*.5+.5,0.,1.);
  vec3 color=mix(deep,shallow,.23+ridge*.17);
  vec3 albedo=animated(colorMap,uv).rgb;
  color*=.92+albedo*.3;
  color=mix(color,sky,fresnel*.42);
  float glint=pow(max(dot(n,normalize(l+v)),0.),95.);
  float path=exp(-pow((world.x+65.)/(24.+max(0.,-world.z)*.11),2.));
  color+=sunlight*(glint*.7+path*pow(max(0.,a.y*.6+.5),10.)*.28)*reflection;
  float caps=smoothstep(.65,.94,a.y)*.085*strength;
  color=mix(color,vec3(.67,.82,.82),caps);
  float fog=1.-exp(-pow(length(viewDir)*fogDensity,1.6));
  color=mix(color,fogColor,clamp(fog,0.,.98));
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;

function spriteMaterial(id){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{
  map:{value:textures.get(id)},rect0:{value:frameUV(id,0)},rect1:{value:frameUV(id,0)},blend:{value:0},opacity:{value:1},tint:{value:new THREE.Color(0xffffff)}
 },vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D map;uniform vec4 rect0;uniform vec4 rect1;uniform float blend;uniform float opacity;uniform vec3 tint;varying vec2 vUv;
 void main(){vec4 a=texture2D(map,rect0.xy+vUv*rect0.zw);vec4 b=texture2D(map,rect1.xy+vUv*rect1.zw);vec4 c=mix(a,b,blend);gl_FragColor=vec4(c.rgb*tint,c.a*opacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
}
function setFrame(m,id,value,start=0,count=assets.get(id).frameCount,loop=true){
 const frame=loop?((value%count)+count)%count:Math.min(value,count-1),lo=Math.floor(frame);
 m.uniforms.rect0.value.copy(frameUV(id,start+lo));
 m.uniforms.rect1.value.copy(frameUV(id,start+(loop?(lo+1)%count:Math.min(lo+1,count-1))));
 m.uniforms.blend.value=frame-lo;
}
function decal(id,x,z,sx,sz,opacity=.7){
 const m=mesh(new THREE.PlaneGeometry(sx,sz),new THREE.MeshBasicMaterial({map:textures.get(id),transparent:true,depthWrite:false,opacity,polygonOffset:true,polygonOffsetFactor:-1}));
 m.rotation.x=-Math.PI/2;m.position.set(x,.25,z);m.renderOrder=2;return m;
}
function placeModel(id,x,z,scale=1,angle=0){
 const o=models.get(id).clone(true);o.position.set(x,0,z);o.rotation.y=angle;o.scale.setScalar(scale);scene.add(o);return o;
}

function setupSea(){
 const p=modes.sunset;
 const uniforms={time:{value:0},strength:{value:.82},colorMap:{value:textures.get('water-breeze')},normalMap:{value:textures.get('water-breeze-normal')}};
 for(const name of ['deep','shallow','sky','sunlight','fogColor'])uniforms[name]={value:new THREE.Color(name==='sunlight'?p.sun:name==='fogColor'?p.fog:p[name])};
 for(const name of ['fogDensity','reflection'])uniforms[name]={value:p[name]};
 water=mesh(new THREE.PlaneGeometry(6000,6000,120,120),new THREE.ShaderMaterial({uniforms,vertexShader:waterVertex,fragmentShader:waterFragment}));
 water.rotation.x=-Math.PI/2;
 horizon=mesh(new THREE.PlaneGeometry(6000,110),new THREE.MeshBasicMaterial({map:textures.get('horizon-fog'),transparent:true,depthWrite:false,opacity:.4,color:p.fog}));
 horizon.position.set(0,0,-1100);
 sun=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.get('sun-disc'),color:0xffddbb,transparent:true,depthWrite:false,fog:false}));
 sun.position.set(-280,39,-800);sun.scale.set(95,95,1);scene.add(sun);
 // Quiet distant silhouettes, with the four actual GLBs repeated at reduced scale.
 for(let i=0;i<8;i++)placeModel(['rock-skerry','rock-stack','rock-split','rock-reef'][i%4],-230+i*64,-390-(i%3)*22,2.2+i%2, i*.79);
 const points=[];let seed=67;const rand=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
 for(let i=0;i<230;i++)points.push((rand()-.5)*1500,100+rand()*430,-600-rand()*220);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
 stars=new THREE.Points(g,new THREE.PointsMaterial({color:0xc9dcf4,size:1.25,sizeAttenuation:false,transparent:true,opacity:.8,fog:false}));scene.add(stars);
}

function setupProps(){
 lighthouse=placeModel('lighthouse',-69,-142,2.4,.2);
 for(const [id,x,z,scale,a] of [
  ['rock-skerry',-56,-130,2.8,.4],['rock-stack',-91,-161,2.6,.2],['rock-split',82,-111,2.9,.5],['rock-reef',69,-91,2.7,1.7],
  ['rock-skerry',-118,-177,2.1,2],['rock-reef',103,-138,2.6,2],['rock-split',-43,-137,1.7,2.8]
 ]){placeModel(id,x,z,scale,a);const ring=decal('foam-ring',x,z,scale*15,scale*10,.42);foam.push(ring);}
 for(const [id,x,z,s] of [['float-can-buoy',-20,-48,2.2],['float-cone-buoy',37,-31,2],['float-driftwood',-29,1,1.6],['float-supply-crate',40,-6,1.7]]){
  const o=placeModel(id,x,z,s,x*.1);floaters.push(o);foam.push(decal('foam-ring',x,z,s*3.3,s*3,.24));
 }
 ship=models.get('reference-corvette').clone(true);scene.add(ship);ship.position.set(2,.35,-7);ship.rotation.y=Math.PI-.09;
 // The reference GLB points +Z. Turn it toward -Z; its stern is now toward +Z.
 const bounds=new THREE.Box3().setFromObject(ship),size=bounds.getSize(new THREE.Vector3());
 ship.userData.length=size.z;ship.userData.referenceBounds=size.toArray();
 wake=mesh(new THREE.PlaneGeometry(25,67),spriteMaterial('wake-8'));
 wake.rotation.x=-Math.PI/2;wake.position.set(-2.5,.35,42.3);wake.rotation.z=.09;wake.renderOrder=3;
 for(let i=0;i<5;i++)foam.push(decal('foam-patch',.6-i*.8,11+i*9,5+i*1.6,13,.28-i*.035));
 beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.get('sun-disc'),color:0xffd093,transparent:true,depthWrite:false,fog:false}));
 beacon.position.set(-69,39.7,-138.9);beacon.scale.set(10,10,1);scene.add(beacon);
}

function setMode(mode){
 state.mode=mode;const p=modes[mode];scene.background=textures.get('sky-'+mode);scene.fog=new THREE.FogExp2(p.fog,p.fogDensity);
 for(const name of ['deep','shallow','sky'])water.material.uniforms[name].value.set(p[name]);
 water.material.uniforms.sunlight.value.set(p.sun);water.material.uniforms.fogColor.value.set(p.fog);
 water.material.uniforms.fogDensity.value=p.fogDensity;water.material.uniforms.reflection.value=p.reflection;
 hemi.intensity=p.ambient;sunLight.intensity=p.key;sunLight.color.set(p.sun);
 horizon.material.color.set(p.fog);horizon.material.opacity=mode==='night'?.18:.42;
 sun.material.color.set(mode==='night'?0xb5ccee:0xffc68e);sun.scale.setScalar(mode==='night'?49:95);sun.scale.z=1;
 sun.position.y=mode==='day'?180:mode==='night'?175:39;
 sun.position.x=mode==='night'?-130:-280;stars.visible=mode==='night';beacon.visible=mode!=='day';
 for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
 $('#stage').dataset.mode=mode;
}
function setWave(wave){
 state.wave=wave;water.material.uniforms.colorMap.value=textures.get('water-'+wave);
 water.material.uniforms.normalMap.value=textures.get('water-'+wave+'-normal');
 water.material.uniforms.strength.value={calm:.38,breeze:.82,rough:1.42}[wave];
 for(const b of document.querySelectorAll('[data-wave]'))b.setAttribute('aria-pressed',String(b.dataset.wave===wave));
 $('#stage').dataset.wave=wave;
}
function impact(column=false,variant){
 const id=column?'near-miss-column-12':'impact-4x8';
 const v=variant??state.impact++%4,mat=spriteMaterial(id);
 const s=column?[9,18]:[12,12];
 const m=mesh(new THREE.PlaneGeometry(...s),mat);
 const positions=[[-11,-15],[17,-25],[-8,-33],[23,-10]],pos=positions[v%4];
 m.position.set(pos[0],s[1]/2+.15,pos[1]);m.rotation.y=Math.atan2(camera.position.x-pos[0],camera.position.z-pos[1]);m.renderOrder=4;
 const ring=decal('foam-ring',pos[0],pos[1],3,3,.65);
 effects.push({mesh:m,ring,id,start:state.time,offset:column?0:v*8,count:column?12:8,duration:column?1.2:.8});
 if(effects.length>12){const old=effects.shift();disposeEffect(old);}
 if(state.paused){state.time+=column?.38:.24;update(0);}
 notice(column?'עמוד מים לצד הספינה':'נתז '+(v+1)+' מתוך 4');
 return v;
}
function disposeEffect(e){scene.remove(e.mesh,e.ring);e.mesh.geometry.dispose();e.mesh.material.dispose();e.ring.geometry.dispose();e.ring.material.dispose();}
let noticeTimer;
function notice(text){$('#notice').textContent=text;$('#notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),1600);}
function pause(value=!state.paused){state.paused=value;$('#pause').setAttribute('aria-pressed',String(value));$('#pause').setAttribute('aria-label',value?'המשך התנועה':'השהיית התנועה');$('#pause').innerHTML=value?'<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 8 5-8 5z" fill="currentColor"/></svg>':'<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" stroke-width="2"/></svg>';}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<1.4?59:48;camera.updateProjectionMatrix();}

function update(dt){
 if(!state.ready)return;
 water.material.uniforms.time.value=state.time%4;
 const amount={calm:.38,breeze:.82,rough:1.42}[state.wave],t=state.time;
 ship.position.y=.35+Math.sin(t*Math.PI/2)*.13*amount;
 ship.rotation.z=Math.sin(t*Math.PI/2)*.012*amount;ship.rotation.x=Math.sin(t*Math.PI)*.009*amount;
 for(let i=0;i<floaters.length;i++){
  const o=floaters[i];o.position.y=Math.sin(t*Math.PI/2+i)*.16*amount;
  o.rotation.z=Math.sin(t*Math.PI/2+i)*.055*amount;o.rotation.x=Math.sin(t*Math.PI+i)*.035*amount;
 }
 setFrame(wake.material,'wake-8',t*8);wake.material.uniforms.opacity.value=state.mode==='night'?.45:.7;
 for(let i=0;i<foam.length;i++)foam[i].material.opacity=(.3+.08*Math.sin(t*Math.PI/2+i))*(state.mode==='night'?.55:1);
 beacon.material.opacity=.45+.4*Math.max(0,Math.sin(t*.9));
 for(let i=effects.length-1;i>=0;i--){
  const e=effects[i],age=t-e.start;
  if(age>=e.duration){disposeEffect(e);effects.splice(i,1);continue;}
  setFrame(e.mesh.material,e.id,age/e.duration*e.count,e.offset,e.count,false);
  e.ring.scale.setScalar(1+age*6);e.ring.material.opacity=.6*(1-age/e.duration);
 }
 renderer.render(scene,camera);
}
let last=0;
function animate(now){const dt=last?Math.min((now-last)/1000,.08):0;last=now;if(!state.paused&&!document.hidden)state.time+=dt;update(dt);requestAnimationFrame(animate);}

function catalog(){
 const cards=[['water-breeze-tile','מים אריחיים'],['wake','שובל ספינה'],['foam-strip','רצועת קצף'],['foam-ring','קצף סביב סלע'],['impact-4x8','ארבעה נתזים · 8 פריימים'],['near-miss-column-12','עמוד מים · 12 פריימים'],['sky-sunset','גרדיאנט שקיעה'],['sky-night','גרדיאנט לילה']];
 for(const [id,label] of cards){const a=assets.get(id),el=document.createElement('article');el.className='asset-card';const img=document.createElement('img');img.src=a.path;img.alt=label;const p=document.createElement('p');p.textContent=label;const link=document.createElement('a');link.href=a.path;link.download='';link.textContent='הורדה';el.append(img,p,link);$('#asset-grid').append(el);}
}
function showCatalog(open){$('#asset-panel').hidden=!open;$('#catalog').setAttribute('aria-expanded',String(open));if(open)$('#close-catalog').focus();else $('#catalog').focus();}

try{
 const response=await fetch('./manifest.json');if(!response.ok)throw new Error('manifest HTTP '+response.status);manifest=await response.json();
 for(const a of manifest.assets)assets.set(a.id,a);
 await Promise.all(manifest.assets.filter(a=>['atlas','texture','sky'].includes(a.kind)).map(a=>texture(a.id)));
 await Promise.all(manifest.assets.filter(a=>['model','reference-model'].includes(a.kind)).map(async a=>{const g=await modelLoader.loadAsync(a.path);models.set(a.id,g.scene);}));
 setupSea();setupProps();state.ready=true;setMode('sunset');setWave('breeze');pause(state.paused);resize();catalog();
 for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>setMode(b.dataset.mode));
 for(const b of document.querySelectorAll('[data-wave]'))b.addEventListener('click',()=>setWave(b.dataset.wave));
 $('#splash').addEventListener('click',()=>impact());$('#column').addEventListener('click',()=>impact(true));$('#pause').addEventListener('click',()=>pause());
 $('#catalog').addEventListener('click',()=>showCatalog($('#asset-panel').hidden));$('#close-catalog').addEventListener('click',()=>showCatalog(false));
 addEventListener('keydown',e=>{if(e.code==='Space'&&!['BUTTON','A'].includes(document.activeElement.tagName)){e.preventDefault();pause();}if(e.key==='Escape'&&!$('#asset-panel').hidden)showCatalog(false);});
 addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;});
 $('#loading').hidden=true;update(0);requestAnimationFrame(animate);
 // Deterministic inspection API used by the saved browser checks.
 window.seaPreview={state,manifest,setMode,setWave,pause,impact,
  at(t){if(!Number.isFinite(t)||t<0)throw new RangeError('Non-negative time required');for(const e of effects)disposeEffect(e);effects.length=0;state.time=t;pause(true);update(0);},
  advance(dt){state.time+=dt;pause(true);update(0);},
  inspect(){return {state:{...state},viewport:[innerWidth,innerHeight],canvas:[canvas.width,canvas.height],
    renderer:renderer.info.render,memory:renderer.info.memory,effects:effects.length,models:[...models.keys()],shipBounds:ship.userData.referenceBounds,
    activeWaterFrames:[Math.floor(state.time%4*4),(Math.floor(state.time%4*4)+1)%16],wakeFrame:Math.floor(state.time%1*8)};}
 };
}catch(error){console.error(error);$('#loading').textContent='לא ניתן לטעון את המפרץ. יש לפתוח דרך שרת מקומי; הוראות בדוח.';$('#loading').setAttribute('role','alert');}

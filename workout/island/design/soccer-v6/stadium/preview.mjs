import * as T from '../../../vendor/three.module.js';
import {GLTFLoader} from '../../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../../vendor/DRACOLoader.js';
import {clone as cloneSkeleton} from '../../../vendor/SkeletonUtils.js';

const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const params=new URLSearchParams(location.search),capture=params.has('capture');
const state={mode:params.get('mode')==='day'?'day':'evening',view:'broadcast',wet:false,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,time:12,frames:[],errors:[]};
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
$('#stage').append(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.07,550);
const sun=new T.DirectionalLight(0xe0eaff,2.6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-66,right:66,top:75,bottom:-75,near:1,far:180});sun.shadow.bias=-.00035;sun.shadow.normalBias=.035;sun.shadow.blurSamples=8;
scene.add(sun,sun.target);const ambient=new T.HemisphereLight(0xb4d2ee,0x34402a,.75);scene.add(ambient);
const floodlights=[];
for(const x of[-38,38])for(const z of[-47,47]){const light=new T.SpotLight(0xddeeff,2100,170,.98,.65,2);light.position.set(x,25,z);light.target.position.set(-x*.12,0,-z*.12);scene.add(light,light.target);floodlights.push(light);}
const target=new T.Vector3(),wantedTarget=new T.Vector3(),wantedCamera=new T.Vector3();
const uTime={value:12},uWet={value:0},uCrowdTime={value:12};
let frame=0,last=0,lastRendered=0,accumulator=0,burstTime=-100,ready=false,disposed=false;
const resources=[],mixers=[],players=[],lamps=new T.Group();scene.add(lamps);

// One inexpensive sky draw; a matching 512px environment supplies PBR reflections.
const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{uDay:{value:0}},vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`
varying vec3 vDir;uniform float uDay;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){vec3 d=normalize(vDir);float h=max(d.y,0.0);vec3 night=mix(vec3(.10,.16,.24),vec3(.005,.014,.04),pow(h,.4));vec3 day=mix(vec3(.71,.78,.77),vec3(.16,.39,.59),pow(h,.4));vec3 color=mix(night,day,uDay);float n=noise(d.xz/(h+.18)*2.8)*.65+noise(d.xz/(h+.18)*6.0)*.35;float cloud=smoothstep(.46,.73,n)*(1.0-smoothstep(.1,.85,h));color=mix(color,mix(vec3(.08,.12,.18),vec3(.82,.84,.8),uDay),cloud*.65);gl_FragColor=vec4(color,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
const sky=new T.Mesh(new T.SphereGeometry(440,24,12),skyMaterial);scene.add(sky);
function environment(day){
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,256);gradient.addColorStop(0,day?'#6896b5':'#1d3758');gradient.addColorStop(.48,day?'#c7d4cf':'#879baf');gradient.addColorStop(.53,day?'#a1af94':'#53677b');gradient.addColorStop(1,'#16241b');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  if(!day){for(const x of[60,190,318,446]){const g=ctx.createRadialGradient(x,88,0,x,88,35);g.addColorStop(0,'#e2f2ff');g.addColorStop(.12,'#b1cee6');g.addColorStop(1,'#43586e00');ctx.fillStyle=g;ctx.fillRect(x-35,53,70,70);}}
  const tex=new T.CanvasTexture(c);tex.mapping=T.EquirectangularReflectionMapping;tex.colorSpace=T.SRGBColorSpace;
  const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(tex);tex.dispose();pmrem.dispose();resources.push(env);return env.texture;
}
const environments={day:environment(true),evening:environment(false)};
const draco=new DRACOLoader();draco.setDecoderPath('../../../vendor/draco/');draco.setWorkerLimit(2);
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
const load=p=>loader.loadAsync('assets/'+p);
const textures=new T.TextureLoader();
function addRoot(gltf){scene.add(gltf.scene);gltf.scene.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.frustumCulled=true;if(o.material)o.material.envMapIntensity=.65;}});return gltf.scene;}
function animatedMaterial(material,phase=false){
  const m=material.clone();m.onBeforeCompile=shader=>{shader.uniforms.uCrowdTime=uCrowdTime;
    shader.vertexShader=`uniform float uCrowdTime;attribute float crowdPhase;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat wave=sin(uCrowdTime*3.2+crowdPhase*6.28318);float jump=pow(max(wave,0.0),2.0)*.26;transformed.y+=jump;transformed.x+=sin(uCrowdTime*1.6+crowdPhase*6.28318)*.02*smoothstep(.8,1.8,position.y);`);
  };m.customProgramCacheKey=()=>phase?'crowd-six-jump-v1':'crowd-six-v1';return m;
}
function makeCrowd(gltf,layout,atlas){
  const source=[];gltf.scene.traverse(o=>{if(o.isMesh)source[Number(o.name.match(/\d+$/)?.[0])]=o;});
  for(let variant=0;variant<6;variant++){
    const points=layout.crowd.filter(p=>p.near&&p.variant===variant),src=source[variant],geo=src.geometry.clone();
    geo.setAttribute('crowdPhase',new T.InstancedBufferAttribute(new Float32Array(points.map(p=>p.phase)),1));
    const near=new T.InstancedMesh(geo,animatedMaterial(src.material,true),points.length),dummy=new T.Object3D();
    points.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.yaw;dummy.scale.setScalar(p.scale);dummy.updateMatrix();near.setMatrixAt(i,dummy.matrix);});
    near.name='near_crowd_'+variant;near.frustumCulled=false;scene.add(near);
  }
  const points=layout.crowd.filter(p=>!p.near),geo=new T.PlaneGeometry(1.09,2.18);geo.translate(0,.92,0);
  geo.setAttribute('crowdVariant',new T.InstancedBufferAttribute(new Float32Array(points.map(p=>p.variant)),1));
  geo.setAttribute('crowdPhase',new T.InstancedBufferAttribute(new Float32Array(points.map(p=>p.phase)),1));
  atlas.colorSpace=T.SRGBColorSpace;atlas.generateMipmaps=true;atlas.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const mat=new T.ShaderMaterial({uniforms:{map:{value:atlas},uTime:uCrowdTime,uLight:{value:.85}},side:T.DoubleSide,vertexShader:`
attribute float crowdVariant;attribute float crowdPhase;uniform float uTime;varying vec2 vUv;
void main(){vUv=vec2((uv.x+crowdVariant)/8.0,uv.y);float scale=length(instanceMatrix[0].xyz);vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);vec3 world=instanceMatrix[3].xyz+right*position.x*scale+vec3(0.,position.y*scale,0.);world.y+=pow(max(sin(uTime*3.2+crowdPhase*6.28318),0.),2.)*.26;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,fragmentShader:`
uniform sampler2D map;uniform float uLight;varying vec2 vUv;void main(){vec4 c=texture2D(map,vUv);if(c.a<.35)discard;gl_FragColor=vec4(c.rgb*uLight,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
  const far=new T.InstancedMesh(geo,mat,points.length),dummy=new T.Object3D();
  points.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.setScalar(p.scale);dummy.updateMatrix();far.setMatrixAt(i,dummy.matrix);});far.frustumCulled=false;far.name='far_crowd';scene.add(far);return mat;
}
function grass(){
  const vertices=[],normals=[];
  for(let i=0;i<3;i++){const a=i*Math.PI/3,c=Math.cos(a),s=Math.sin(a),h=.05+i*.004;
    const points=[[-.007,0,0],[.007,0,0],[.004,h*.6,.003],[-.004,h*.6,.003],[0,h,.008]];
    for(const n of[0,1,2,0,2,3,3,2,4]){const p=points[n];vertices.push(p[0]*c-p[2]*s,p[1],p[0]*s+p[2]*c);normals.push(.35*s,.94,.35*c);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  const m=new T.MeshStandardMaterial({color:0x647b33,roughness:.95,side:T.DoubleSide});
  m.onBeforeCompile=shader=>{shader.uniforms.uTime=uTime;shader.vertexShader='uniform float uTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed.x+=sin(uTime*2.0+instanceMatrix[3].x*1.7+instanceMatrix[3].z)*.008*position.y/.06;`);};
  const inst=new T.InstancedMesh(g,m,1900),o=new T.Object3D();let seed=20261104;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1900;i++){const close=i<1200;o.position.set((rnd()-.5)*(close?16:67),.02,(rnd()-.5)*(close?20:104)+(close?5:0));o.rotation.y=rnd()*Math.PI;o.scale.setScalar(.7+rnd()*.6);o.updateMatrix();inst.setMatrixAt(i,o.matrix);}inst.name='grass_blades';scene.add(inst);
}
let particleMat,crowdMat;
function particles(atlas){
  atlas.colorSpace=T.SRGBColorSpace;const geo=new T.PlaneGeometry(1,1);
  const ids=Float32Array.from({length:128},(_,i)=>i);geo.setAttribute('particleId',new T.InstancedBufferAttribute(ids,1));
  particleMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:atlas},uTime,uWet,uBurst:{value:-100}},vertexShader:`
attribute float particleId;uniform float uTime,uWet,uBurst;varying vec2 vUv;varying float vAlpha;
float hash(float x){return fract(sin(x*127.1)*43758.5453);}
void main(){float id=particleId;float age=mod(uTime+hash(id+2.)*5.5,5.5);float burst=uTime-uBurst;if(burst>=0.&&burst<1.5)age=burst+hash(id)*.16;float duration=mix(1.3,.8,uWet);float alive=1.-smoothstep(duration*.25,duration,age);vAlpha=alive*mix(.32,.7,uWet);float cell=uWet;vUv=vec2((uv.x+cell)/2.,(uv.y+1.)/2.);vec3 base=instanceMatrix[3].xyz;float speed=mix(.65,1.7,uWet);base+=vec3((hash(id+4.)-.5)*age*2.0,max(0.,speed*age-age*age*.9), (hash(id+7.)-.5)*age*2.);vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);float size=mix(.48,.22,uWet)*(1.+age*.5);gl_Position=projectionMatrix*viewMatrix*vec4(base+(right*position.x+up*position.y)*size,1.);}`,fragmentShader:`
uniform sampler2D map;varying vec2 vUv;varying float vAlpha;void main(){vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb,c.a*vAlpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
  const inst=new T.InstancedMesh(geo,particleMat,128),o=new T.Object3D();
  for(let i=0;i<128;i++){const a=i*2.39996;o.position.set(Math.cos(a)*(i%11)*.24,.035,5+Math.sin(a)*(i%7)*.24);o.updateMatrix();inst.setMatrixAt(i,o.matrix);}inst.frustumCulled=false;inst.name='dust_water_particles';scene.add(inst);
}
function makeLamps(layout,atlas){
  const map=atlas.clone();map.repeat.set(.5,.5);map.offset.set(0,0);map.needsUpdate=true;
  const material=new T.SpriteMaterial({map,color:0xd7eaff,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending});
  for(const p of layout.lights){const s=new T.Sprite(material);s.position.fromArray(p.position);s.scale.set(p.size,p.size,1);lamps.add(s);}
}
function makePlayers(gltf){
  const box=new T.Box3().setFromObject(gltf.scene),scale=1.8/(box.max.y-box.min.y);
  for(let i=0;i<12;i++){
    const root=cloneSkeleton(gltf.scene);root.scale.setScalar(scale);root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.material=o.material.clone();o.material.roughness=.82;
      if(i>=6)o.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n#ifdef USE_COLOR\nif(vColor.g>vColor.r*1.3&&vColor.b>vColor.r*1.2)diffuseColor.rgb=vec3(.45,.29,.075);\n#endif`);};
    });
    const row=i%6,base=[(i<6?-1:1)*(9+(row%2)*8),-34+row*13];
    root.position.set(base[0],-box.min.y*scale+.04,base[1]);scene.add(root);
    const mixer=new T.AnimationMixer(root),clip=gltf.animations.find(a=>a.name==='run')||gltf.animations[0],action=mixer.clipAction(clip);action.play();mixer.setTime(i*.071);mixers.push(mixer);players.push({root,base,phase:i*.83,y:root.position.y});
  }
  // One neutral match ball, shared low-cost sphere.
  const ball=new T.Mesh(new T.SphereGeometry(.11,12,8),new T.MeshStandardMaterial({color:0xe1dfd3,roughness:.55}));ball.position.set(8,.12,10);ball.castShadow=true;scene.add(ball);
}
function pitchMaterial(root){root.traverse(o=>{if(o.name!=='pitch_surface')return;o.material.envMapIntensity=.9;o.material.onBeforeCompile=shader=>{
  shader.uniforms.uWet=uWet;shader.vertexShader='varying vec3 vField;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvField=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader='uniform float uWet;varying vec3 vField;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nvec2 q=(vField.xz-vec2(0.,5.))/vec2(7.,4.);float water=exp(-dot(q,q))*uWet;roughnessFactor=mix(roughnessFactor,.17,water);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 goalQ=vec2(vField.x/5.0,(abs(vField.z)-50.3)/2.1);float goalWear=exp(-dot(goalQ,goalQ));
vec2 spotQ=vec2(vField.x/1.1,(abs(vField.z)-41.5)/1.1);float spotWear=exp(-dot(spotQ,spotQ));
float centerWear=exp(-dot(vField.xz,vField.xz)/1.4);
float dirt=clamp((goalWear*.72+spotWear*.5+centerWear*.3-.24)*1.3,0.0,.6);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.125,.095,.05),dirt);diffuseColor.rgb*=1.-uWet*.12;`);
};});}

function setMode(mode){state.mode=mode;const day=mode==='day';sun.position.set(...(day?[-50,85,-35]:[-18,60,12]));sun.color.set(day?0xffedd4:0xd2e7ff);sun.intensity=day?3.4:1.1;ambient.intensity=day?1.1:.42;ambient.color.set(day?0xc1d8eb:0x9dbadd);floodlights.forEach(l=>l.visible=!day);renderer.toneMappingExposure=day?1.05:1.15;scene.environment=environments[mode];scene.fog=new T.Fog(day?0xb7c7c4:0x263b50,135,340);skyMaterial.uniforms.uDay.value=day?1:0;lamps.visible=!day;if(crowdMat)crowdMat.uniforms.uLight.value=day?1.1:.72;
  $('#light-label').textContent=day?'תאורת יום':'תאורת ערב';$('.live').lastChild.textContent=day?' יום של כדורגל':' ערב של כדורגל';all('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));return mode;
}
function setView(view,instant=false){
  if(!['broadcast','goal','turf','stands'].includes(view))view='broadcast';
  state.view=view;const portrait=innerWidth<innerHeight;
  const specs={broadcast:portrait?[[20,116,170],[0,0,8],55]:[[65,44,35],[0,1,1],47],goal:portrait?[[10,8,57],[0,1.3,52.4],70]:[[5,3.6,56.3],[0,1.2,51.7],50],turf:portrait?[[4.8,2.3,12],[0,.1,3],47]:[[5.4,1.65,11],[0,.12,2],44],stands:portrait?[[20,6,18],[-25,11,-48],53]:[[18,7,13],[-32,11,-40],48]};
  const spec=specs[view]||specs.broadcast;wantedCamera.fromArray(spec[0]);wantedTarget.fromArray(spec[1]);camera.fov=spec[2];camera.updateProjectionMatrix();if(instant||capture){camera.position.copy(wantedCamera);target.copy(wantedTarget);camera.lookAt(target);}
  const labels={broadcast:'מצלמת שידור',goal:'מאחורי השער',turf:'על הדשא',stands:'מבט ליציעים'};$('#view-label').textContent=labels[view];all('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));$('.caption').hidden=view!=='broadcast';return view;
}
function setWet(wet){state.wet=Boolean(wet);uWet.value=state.wet?1:0;$('#wet').setAttribute('aria-pressed',state.wet);$('#condition-label').textContent=state.wet?'מגרש רטוב':'מגרש יבש';$('#burst').textContent=state.wet?'התזה':'אבק';return state.wet;}
function setPaused(value){state.paused=Boolean(value);$('#pause').setAttribute('aria-pressed',state.paused);$('#pause').setAttribute('aria-label',state.paused?'הפעלת התנועה':'עצירת התנועה');$('#pause').textContent=state.paused?'ניגון':'עצירה';return state.paused;}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();setView(state.view,true);}
function snapshot(){const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {ready,threeRevision:T.REVISION,mode:state.mode,view:state.view,wet:state.wet,time:state.time,paused:state.paused,viewport:[innerWidth,innerHeight],camera:camera.position.toArray(),pixelRatio:renderer.getPixelRatio(),canvas:[renderer.domElement.width,renderer.domElement.height],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,players:players.length,crowd:window.stadiumV6.crowd,frameTimes:state.frames.slice(-180),errors:state.errors};}
function render(now){if(disposed)return;requestAnimationFrame(render);if(document.hidden){last=now;return;}const elapsed=last?now-last:33.333;last=now;accumulator+=elapsed;if(accumulator<32.8)return;const dt=Math.min(accumulator/1000,.075);accumulator%=1000/30;
  if(ready&&lastRendered)state.frames.push(now-lastRendered);lastRendered=now;if(state.frames.length>360)state.frames.shift();
  if(!state.paused&&!capture){state.time+=dt;uTime.value=state.time;uCrowdTime.value=state.time;for(const m of mixers)m.update(dt);players.forEach((p,i)=>{const t=state.time*.22+p.phase;p.root.position.set(p.base[0]+Math.sin(t)*1.25,p.y,p.base[1]+Math.cos(t)*1.8);p.root.rotation.y=Math.atan2(Math.cos(t)*1.25,-Math.sin(t)*1.8);});}
  const a=1-Math.exp(-dt*4);camera.position.lerp(wantedCamera,a);target.lerp(wantedTarget,a);camera.lookAt(target);sky.position.copy(camera.position);renderer.render(scene,camera);frame++;
}
window.stadiumV6={setMode,setView,setWet,setPaused,snapshot,resetFrameStats:()=>{state.frames.length=0;lastRendered=0;},sample:(time)=>{if(!Number.isFinite(time)||time<0)return;state.time=time;uTime.value=time;uCrowdTime.value=time;mixers.forEach(m=>m.setTime(time));},burst:()=>{particleMat.uniforms.uBurst.value=state.time;burstTime=state.time;},crowd:0};
window.stadiumV6.ready=(async()=>{
  const [shell,pitch,goals,crowd,athlete,layout,atlas,particleAtlas]=await Promise.all([load('stadium-shell.glb'),load('pitch.glb'),load('goals.glb'),load('crowd-six.glb'),load('scale-athlete-lod1.glb'),fetch('layout.json').then(r=>{if(!r.ok)throw Error('layout unavailable');return r.json();}),textures.loadAsync('textures/crowd-atlas.png'),textures.loadAsync('textures/particles-atlas.png')]);
  layout.crowd=layout.crowd.map(p=>Array.isArray(p)?Object.fromEntries(layout.crowdFields.map((key,i)=>[key,p[i]])):p);
  addRoot(shell).traverse(o=>{if(o.isMesh&&(o.name==='canopy'||o.name==='roof_trusses'))o.castShadow=true;});
  pitchMaterial(addRoot(pitch));addRoot(goals).traverse(o=>{if(o.name==='goal_frames')o.castShadow=true;});crowdMat=makeCrowd(crowd,layout,atlas);window.stadiumV6.crowd=layout.crowd.length;makeLamps(layout,particleAtlas);makePlayers(athlete);grass();particles(particleAtlas);
  setMode(state.mode);setView(params.get('view')||'broadcast',true);setWet(params.get('wet')==='1');setPaused(state.paused);resize();renderer.compile(scene,camera);renderer.render(scene,camera);ready=true;$('#loading').hidden=true;return snapshot();
})().catch(e=>{state.errors.push(String(e));$('#loading').textContent='הטעינה נכשלה. יש לפתוח את התצוגה דרך שרת HTTP מקומי.';throw e;});
all('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
all('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#wet').addEventListener('click',()=>{setWet(!state.wet);window.stadiumV6.burst();});$('#burst').addEventListener('click',()=>window.stadiumV6.burst());$('#pause').addEventListener('click',()=>setPaused(!state.paused));
let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag[0],dy=e.clientY-drag[1];const offset=wantedCamera.clone().sub(wantedTarget),spherical=new T.Spherical().setFromVector3(offset);spherical.theta-=dx*.004;spherical.phi=T.MathUtils.clamp(spherical.phi-dy*.004,.2,Math.PI*.49);wantedCamera.copy(wantedTarget).add(new T.Vector3().setFromSpherical(spherical));drag=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',()=>drag=null);renderer.domElement.addEventListener('pointercancel',()=>drag=null);
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();const offset=wantedCamera.clone().sub(wantedTarget).multiplyScalar(e.deltaY>0?1.06:.94);offset.clampLength(2,330);wantedCamera.copy(wantedTarget).add(offset);},{passive:false});
addEventListener('resize',resize);addEventListener('pagehide',()=>{disposed=true;draco.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});resources.forEach(r=>r.dispose());renderer.dispose();});resize();requestAnimationFrame(render);

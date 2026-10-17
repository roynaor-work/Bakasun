import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {seededRandom} from './tennis.mjs?v=g6b-20261019-1';

export async function createTennisView(canvas,config,{onQuality=()=>{},characterUrl=new URL('../assets/kid-full.glb?v=g6b-20261019-1',import.meta.url)}={}) {
  const r=config.render, colors=r.colors, scene=new T.Scene();
  scene.background=new T.Color(colors.sky);scene.fog=new T.Fog(colors.sky,38,75);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const camera=new T.PerspectiveCamera(r.cameraFov,1,0.1,100), resources=new Set(), groups=new Map();
  let observer;
  let disposed=false,quality=0,slow=0,qualityAge=0,frameCount=0,lastEvent=0,characterLoaded=false;
  const keep=x=>(resources.add(x),x);
  const material=(color,extra={})=>keep(new T.MeshStandardMaterial({color,roughness:0.9,...extra}));
  const basic=(color,extra={})=>keep(new T.MeshBasicMaterial({color,...extra}));
  // Static primitives are baked and merged by material once, never in render().
  function bake(geometry,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    const o=new T.Object3D();o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);o.updateMatrix();geometry.applyMatrix4(o.matrix);
    if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(geometry);
  }
  const box=(mat,x,y,z,w,h,d)=>bake(new T.BoxGeometry(w,h,d),mat,x,y,z);
  const ground=material(colors.island),apron=material(colors.apron),court=material(colors.court),white=material(colors.line),dark=material(colors.dark),wood=material('#bc8356'),metal=material('#3f6064'),seat=material('#f5bc69');
  scene.add(new T.HemisphereLight('#fff6d5','#6c9c98',2.5));
  const sun=new T.DirectionalLight('#fff0ca',3.2);sun.position.set(-9,18,8);sun.castShadow=true;
  sun.shadow.mapSize.set(r.shadowMapSize,r.shadowMapSize);Object.assign(sun.shadow.camera,{left:-12,right:12,top:14,bottom:-14,near:1,far:50});sun.shadow.bias=-0.001;scene.add(sun);
  box(material(colors.sea),0,-0.65,0,200,0.1,200);
  bake(new T.CylinderGeometry(18,19,0.65,48),ground,0,-0.33,0,1,1,1.1);
  box(apron,0,-0.02,0,13.2,0.12,23.6);box(court,0,0.05,0,courtWidth(),0.05,config.court.halfLength*2);
  function courtWidth(){return config.court.halfWidth*2;}
  const cw=config.court.halfWidth,cl=config.court.halfLength,sl=config.court.serviceLength;
  for(const x of [-cw,cw])box(white,x,.086,0,.065,.012,cl*2);
  for(const z of [-cl,cl,-sl,sl])box(white,0,.086,z,cw*2,.012,.065);
  box(white,0,.086,0,.065,.012,sl*2);
  for(const z of [-cl,cl])box(white,0,.088,z+(z>0?-.15:.15),.065,.012,.3);
  // Lightweight net: alpha texture created locally once; no external image.
  const netCanvas=document.createElement('canvas');netCanvas.width=netCanvas.height=128;
  const ctx=netCanvas.getContext('2d');ctx.strokeStyle='#163b3f';ctx.lineWidth=2;
  for(let n=0;n<=128;n+=16){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,128);ctx.moveTo(0,n);ctx.lineTo(128,n);ctx.stroke();}
  const netTexture=keep(new T.CanvasTexture(netCanvas));netTexture.wrapS=netTexture.wrapT=T.RepeatWrapping;netTexture.repeat.set(9,1);
  const net=new T.Mesh(keep(new T.PlaneGeometry(cw*2+.8,config.court.netHeight)),basic('#ffffff',{map:netTexture,transparent:true,side:T.DoubleSide,alphaTest:.2}));net.position.set(0,config.court.netHeight/2+.09,0);scene.add(net);
  box(white,0,config.court.netHeight+.09,0,cw*2+.8,.055,.06);
  for(const x of [-cw-.45,cw+.45])box(dark,x,.62,0,.1,1.25,.1);
  // Stands, fence and umpire chair; simple original geometry.
  for(const side of [-1,1]){
    for(let row=0;row<3;row++)box(wood,side*(7.3+row*.6),.18+row*.26,-3,1,.25,12);
    box(dark,side*9.3,.6,-3,.12,1.2,13);
    for(let z=-10;z<=10;z+=2)box(metal,side*6.3,.65,z,.055,1.3,.055);
    for(const y of [.2,1.25])box(metal,side*6.3,y,0,.035,.035,21);
  }
  for(const z of [-11,11])box(dark,0,.55,z,12.7,1.1,.16);
  for(const x of [-.45,.45])for(const z of [-.4,.4])box(metal,-5.15+x,1.2,z,.09,2.4,.09);
  box(seat,-5.15,2.1,0,1.1,.12,.95);box(seat,-5.15,2.6,-.45,1.1,.8,.1);
  for(let i=0;i<5;i++)box(metal,-4.64,.25+i*.37,.37,.08,.06,.8);
  const skin=material('#d39973'),shirt=material('#f6efd7');
  bake(new T.SphereGeometry(.19,10,8),skin,-5.15,3,0);
  box(shirt,-5.15,2.6,0,.44,.5,.3);box(dark,-5.15,2.22,.3,.5,.12,.55);
  // Palms and distant islands use few polygons and the same static materials.
  const leaves=material('#326e5a');
  for(const [x,z]of [[-10,9],[10,9],[-11,-10],[11,-10]]){
    bake(new T.CylinderGeometry(.12,.2,3.8,6),wood,x,1.9,z,1,1,1,0,0,.15);
    for(let a=0;a<6;a++)bake(new T.ConeGeometry(.65,2.8,4),leaves,x+Math.cos(a)*.8,3.65,z+Math.sin(a)*.8,1,.25,1,0,a,Math.PI/2);
  }
  for(const mat of groups.keys()){
    const parts=groups.get(mat),merged=keep(mergeGeometries(parts,false));parts.forEach(g=>g.dispose());
    const mesh=new T.Mesh(merged,mat);mesh.receiveShadow=true;scene.add(mesh);
  }
  groups.clear();
  // Two instanced crowd meshes: fixed capacity, recolored per spectator.
  const crowdRoot=new T.Group();scene.add(crowdRoot);
  const crowdBody=new T.InstancedMesh(keep(new T.CylinderGeometry(.18,.23,.5,6)),material('#ffffff'),r.crowdCounts[0]);
  const crowdHead=new T.InstancedMesh(keep(new T.SphereGeometry(.16,7,5)),skin,r.crowdCounts[0]);
  crowdBody.castShadow=true;crowdHead.castShadow=true;crowdRoot.add(crowdBody,crowdHead);const dummy=new T.Object3D(),rand=seededRandom(config.seed),palette=['#f2ad59','#e77b6d','#f5efd7','#5c98d0','#8d6fba'];
  for(let i=0;i<r.crowdCounts[0];i++){
    const edge=i%4,row=Math.floor(i/24),along=(Math.floor(i/4)%6-2.5)*1.6,x=edge<2?(edge===0?-1:1)*(7.3+row*.6):along,z=edge<2?along:(edge===2?-1:1)*(11.7+row*.4);
    dummy.position.set(x,.7+row*.26,z);dummy.updateMatrix();crowdBody.setMatrixAt(i,dummy.matrix);crowdBody.setColorAt(i,new T.Color(palette[Math.floor(rand()*palette.length)]));
    dummy.position.y+=.4;dummy.updateMatrix();crowdHead.setMatrixAt(i,dummy.matrix);
  }
  const ball=new T.Mesh(keep(new T.SphereGeometry(config.ball.radius,14,10)),basic(colors.ball));scene.add(ball);
  const shadow=new T.Mesh(keep(new T.CircleGeometry(.26,20)),basic('#123d36',{transparent:true,opacity:.5,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const ring=new T.Mesh(keep(new T.RingGeometry(.45,.55,40)),basic('#dfff55',{side:T.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  // Fixed particle pool: one draw, no geometry creation during play.
  const positions=new Float32Array(r.particles*3),particleData=Array.from({length:r.particles},()=>({vx:0,vy:0,vz:0,life:0}));
  const particleGeometry=keep(new T.BufferGeometry());particleGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const particles=new T.Points(particleGeometry,keep(new T.PointsMaterial({color:colors.accent,size:.13,transparent:true,depthWrite:false})));particles.visible=false;scene.add(particles);
  const holders=[new T.Group(),new T.Group()];holders.forEach(h=>scene.add(h));const characters=[];
  // Parse the same existing GLB twice to get independent skeletons, without a new helper dependency.
  try{
    const buffer=await (await fetch(characterUrl)).arrayBuffer();
    for(let index=0;index<2;index++){
      const gltf=await new GLTFLoader().parseAsync(buffer.slice(0),'');
      if(disposed){gltf.scene.traverse(disposeObject);continue;}
      const root=gltf.scene;const oldBall=root.getObjectByName('Ball');if(oldBall){oldBall.removeFromParent();disposeObject(oldBall);}root.scale.setScalar(r.characterScale);holders[index].add(root);
      const mixer=new T.AnimationMixer(root),actions={};for(const name of ['stand','run']){const clip=gltf.animations.find(c=>c.name===name);if(clip)actions[name]=mixer.clipAction(clip).play();}
      if(actions.run)actions.run.setEffectiveWeight(0);
      root.traverse(o=>{if(o.isMesh){o.castShadow=false;if(o.material){const original=o.material;o.material=keep(original.clone());const shirt=new T.Color(index===0?r.shirtColor:config.opponentShirtColor);o.material.onBeforeCompile=shader=>{shader.uniforms.tennisShirt={value:shirt};shader.fragmentShader='uniform vec3 tennisShirt;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(diffuseColor.b>diffuseColor.r*1.4&&diffuseColor.b>diffuseColor.g*1.1) diffuseColor.rgb=tennisShirt;');};original.dispose();}}});
      characters.push({root,mixer,actions,arm:root.getObjectByName('UpperArm_R'),forearm:root.getObjectByName('LowerArm_R'),chest:root.getObjectByName('Chest'),hand:root.getObjectByName('Hand_R')});
      const racket=new T.Group(),frameMat=material(index===0?'#ffcc65':'#f8f3df');
      const frame=new T.Mesh(keep(new T.TorusGeometry(.26,.028,5,20)),frameMat);frame.scale.y=1.3;frame.position.y=-.53;racket.add(frame);
      const handle=new T.Mesh(keep(new T.CylinderGeometry(.032,.036,.3,6)),dark);handle.position.y=-.2;racket.add(handle);
      const strings=[];for(let n=-3;n<=3;n++){const t=n*.06,len=Math.sqrt(.24**2-t*t);strings.push(t,-.53-len*1.3,0,t,-.53+len*1.3,0,-len,-.53+t*1.3,0,len,-.53+t*1.3,0);}
      const wireGeometry=keep(new T.BufferGeometry());wireGeometry.setAttribute('position',new T.Float32BufferAttribute(strings,3));racket.add(new T.LineSegments(wireGeometry,keep(new T.LineBasicMaterial({color:'#edf0d1'}))));
      characters[index].hand?.add(racket);racket.rotation.x=.3;
    }
    characterLoaded=characters.length===2;
  }catch(error){dispose();throw error;}
  function disposeObject(o){if(o.isSkinnedMesh)o.skeleton?.dispose();o.geometry?.dispose();for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}}
  observer=new ResizeObserver(resize);observer.observe(canvas);
  function resize(){if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.position.fromArray(w>h?r.cameraLandscape:r.cameraPortrait);camera.lookAt(...r.cameraTarget);camera.updateProjectionMatrix();renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio||1,r.pixelRatios[quality]));}
  function setQuality(q){quality=Math.min(r.pixelRatios.length-1,q);renderer.shadowMap.enabled=r.shadowEnabled[quality];sun.castShadow=r.shadowEnabled[quality];crowdBody.count=crowdHead.count=r.crowdCounts[quality];resize();onQuality(quality);}
  function observeFrame(milliseconds){if(disposed)return;qualityAge+=milliseconds/1000;if(milliseconds>r.slowFrameMs)slow++;else slow=Math.max(0,slow-1);if(slow>=r.slowSamples&&qualityAge>=r.qualityCooldown&&quality<r.pixelRatios.length-1){slow=0;qualityAge=0;setQuality(quality+1);}}
  function burst(x,z){for(let i=0;i<r.particles;i++){const p=particleData[i];p.life=r.particleSeconds;p.vx=(rand()-.5)*5;p.vy=2+rand()*4;p.vz=(rand()-.5)*5;positions.set([x,.4,z],i*3);}particles.visible=true;}
  function render(state,dt=0){
    if(disposed)return;
    ball.position.set(state.ball.x,state.ball.y,state.ball.z);ball.visible=state.phase!=='complete';
    shadow.position.set(state.ball.x,.11,state.ball.z);shadow.scale.setScalar(1+state.ball.y*.12);shadow.material.opacity=.6/(1+state.ball.y*.15);shadow.visible=ball.visible;
    ring.visible=Boolean(state.landing&&state.phase==='rally');
    if(ring.visible){ring.position.set(state.landing.x,.115,state.landing.z);ring.material.color.set(state.landing.valid?(state.contact?.side===0&&Math.abs(state.contact.eta)<state.timingWindow/2?'#dfff55':'#ffd16f'):'#ff7262');ring.scale.setScalar(1+Math.sin(state.elapsed*5)*.05);}
    characters.forEach((ch,i)=>{
      const p=state.players[i];holders[i].position.set(p.x,.09,p.z);holders[i].rotation.y=i===0?Math.PI:0;
      ch.actions.run?.setEffectiveWeight(p.running?1:0);ch.actions.stand?.setEffectiveWeight(p.running?0:1);ch.mixer.update(dt);
      if(p.swing>0){const u=1-p.swing/config.player.swingSeconds,arc=Math.sin(u*Math.PI),sign=p.stroke==='backhand'?-1:1;if(ch.arm){ch.arm.rotation.x-=arc*(p.lob?1.85:1.35);ch.arm.rotation.z-=arc*.8*sign;}if(ch.forearm)ch.forearm.rotation.x-=arc*.6;if(ch.chest)ch.chest.rotation.y+=Math.sin(u*Math.PI*2)*.4;}
    });
    if(state.event.id!==lastEvent){lastEvent=state.event.id;if(state.event.ace||state.event.type==='complete'&&state.result?.won)burst(state.players[0].x,state.players[0].z);}
    let active=0;for(let i=0;i<particleData.length;i++){const p=particleData[i];if(p.life>0){p.life-=dt;positions[i*3]+=p.vx*dt;positions[i*3+1]+=p.vy*dt;positions[i*3+2]+=p.vz*dt;p.vy-=5*dt;active++;}else positions[i*3+1]=-10;}
    particles.visible=active>0;if(active)particleGeometry.attributes.position.needsUpdate=true;
    renderer.render(scene,camera);frameCount++;
  }
  function metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,quality,pixelRatio:renderer.getPixelRatio(),crowd:crowdBody.count,shadows:renderer.shadowMap.enabled,characterLoaded,shirtColors:[r.shirtColor,config.opponentShirtColor],frames:frameCount,disposed,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}
  function dispose(){if(disposed)return;disposed=true;observer?.disconnect();characters.forEach(c=>{c.mixer.stopAllAction();c.mixer.uncacheRoot(c.root);});scene.traverse(disposeObject);resources.forEach(o=>o.dispose?.());resources.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear();}
  setQuality(0);resize();
  return {render,observeFrame,metrics,dispose};
}

/** Keep the same round alive when a GPU context cannot be used. */
export function createTennisFallback(canvas,config){
 const surface=canvas.cloneNode();surface.classList.add('tennis-fallback');canvas.hidden=true;canvas.after(surface);const p=surface.getContext('2d');let disposed=false;
 return {metrics(){return {mode:'canvas',triangles:0,drawCalls:0,characterLoaded:false,shirtColors:[config.render.shirtColor,config.opponentShirtColor],disposed};},observeFrame(){},dispose(){if(disposed)return;disposed=true;surface.remove();canvas.hidden=false;},render(s){if(disposed)return;const w=surface.clientWidth,h=surface.clientHeight;surface.width=w;surface.height=h;p.fillStyle=config.render.colors.apron;p.fillRect(0,0,w,h);const scale=Math.min(w/(config.court.halfWidth*3),h/(config.court.halfLength*2.5)),project=(x,z)=>[w/2+x*scale,h/2+z*scale];p.strokeStyle=config.render.colors.line;p.lineWidth=2;const [x,y]=project(-config.court.halfWidth,-config.court.halfLength);p.strokeRect(x,y,config.court.halfWidth*2*scale,config.court.halfLength*2*scale);p.beginPath();p.moveTo(x,h/2);p.lineTo(w-x,h/2);p.stroke();s.players.forEach((v,i)=>{const [x,z]=project(v.x,v.z);p.fillStyle=i?config.opponentShirtColor:config.render.shirtColor;p.fillRect(x-8,z-14,16,22);p.fillStyle='#edac78';p.beginPath();p.arc(x,z-20,7,0,Math.PI*2);p.fill();});const [bx,bz]=project(s.ball.x,s.ball.z);p.fillStyle=config.render.colors.ball;p.beginPath();p.arc(bx,bz-s.ball.y*scale,Math.max(3,config.ball.radius*scale),0,Math.PI*2);p.fill();}};
}

import {surfaceTexture} from '../presentation/surfaces.mjs?v=island-art-20261022-3';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {seededRandom} from './tennis.mjs?v=island-art-20261022-3';
import {tennisPose} from './tennis-pose.mjs?v=island-art-20261022-3';
import {createTennisEnvironment} from './tennis-environment.mjs?v=island-art-20261022-3';

export async function createTennisView(canvas,config,{onQuality=()=>{},characterUrl=new URL('../assets/kid-full.glb?v=island-art-20261022-3',import.meta.url)}={}) {
  const r=config.render, colors=r.colors, scene=new T.Scene();
  scene.background=new T.Color(colors.sky);scene.fog=new T.Fog(colors.sky,r.environment.fogNear,r.environment.fogFar);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const camera=new T.PerspectiveCamera(r.cameraFov,1,0.1,300), resources=new Set(), groups=new Map();
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
  const grassMap=keep(surfaceTexture('grass',32)),clayMap=keep(surfaceTexture('clay',6)),ground=material('#d4e6b7',{map:grassMap}),apron=material('#cbd9bc',{map:grassMap}),court=material('#ffffff',{map:clayMap}),white=material(colors.line),dark=material(colors.dark),wood=material('#bc8356'),metal=material('#3f6064'),seat=material('#f5bc69');
  scene.add(new T.HemisphereLight('#fff6d5','#426b62',1.65));
  const sun=new T.DirectionalLight('#fff0ca',2.8);sun.position.set(-9,18,8);sun.castShadow=true;
  sun.shadow.mapSize.set(r.shadowMapSize,r.shadowMapSize);Object.assign(sun.shadow.camera,{left:-12,right:12,top:14,bottom:-14,near:1,far:50});sun.shadow.bias=-0.001;scene.add(sun);
  box(ground,0,-.2,0,500,.35,500);
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
  // Continuous terraces behind all four fences, with a distant perimeter wall.
  const env=r.environment;
  for(const side of [-1,1]){
    for(let row=0;row<env.crowdRows;row++){
      const y=env.crowdFloor+row*env.crowdRise;
      box(wood,side*(env.crowdSideX+row*env.crowdRowGap),y-.12,0,1,.24,17);
      box(wood,0,y-.12,side*(env.crowdEndZ+row*env.crowdEndRowGap),17,.24,1);
      box(seat,side*(env.crowdSideX+row*env.crowdRowGap),y+.46,0,.55,.12,17);
      box(seat,0,y+.46,side*(env.crowdEndZ+row*env.crowdEndRowGap),17,.12,.55);
      box(wood,side*(env.crowdSideX+row*env.crowdRowGap+.32),y+.84,0,.10,.64,17);
      box(wood,0,y+.84,side*(env.crowdEndZ+row*env.crowdEndRowGap+.32),17,.64,.10);
    }
    for(let z=-12;z<=12;z+=2)box(metal,side*6.5,.8,z,.055,1.6,.055);
    for(const y of [.25,1.55])box(metal,side*6.5,y,0,.035,.035,24);
    for(let x=-6.5;x<=6.5;x+=1.3)box(metal,x,.8,side*12.3,.055,1.6,.055);
    for(const y of [.25,1.55])box(metal,0,y,side*12.3,13,.035,.035);
    box(material('#b5b6a2'),side*27,2,0,.5,4,55);
    box(material('#b5b6a2'),0,2,side*27,54,4,.5);
  }
  for(const x of [-.45,.45])for(const z of [-.4,.4])box(metal,-5.15+x,1.2,z,.09,2.4,.09);
  box(seat,-5.15,2.1,0,1.1,.12,.95);box(seat,-5.15,2.6,-.45,1.1,.8,.1);
  for(let i=0;i<5;i++)box(metal,-4.64,.25+i*.37,.37,.08,.06,.8);
  for(const mat of groups.keys()){
    const parts=groups.get(mat),merged=keep(mergeGeometries(parts,false));parts.forEach(g=>g.dispose());
    const mesh=new T.Mesh(merged,mat);mesh.receiveShadow=true;scene.add(mesh);
  }
  groups.clear();
  const environment=await createTennisEnvironment(scene,config,keep,renderer,camera),rand=seededRandom(config.seed);
  const ball=new T.Mesh(keep(new T.SphereGeometry(config.ball.radius,14,10)),basic(colors.ball));scene.add(ball);
  const shadow=new T.Mesh(keep(new T.CircleGeometry(.26,20)),basic('#123d36',{transparent:true,opacity:.5,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const ring=new T.Mesh(keep(new T.RingGeometry(.45,.55,40)),basic('#dfff55',{side:T.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  const faultMark=new T.Group(),faultMat=basic('#ff604f');
  for(const angle of [-Math.PI/4,Math.PI/4]){const bar=new T.Mesh(keep(new T.BoxGeometry(.75,.035,.10)),faultMat);bar.rotation.y=angle;faultMark.add(bar);}
  const faultRing=new T.Mesh(keep(new T.RingGeometry(.45,.51,24)),faultMat);faultRing.rotation.x=-Math.PI/2;faultMark.add(faultRing);scene.add(faultMark);
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
      const mixer=new T.AnimationMixer(root),actions={};for(const name of ['stand','run']){const clip=gltf.animations.find(c=>c.name===name);if(clip){const legs=clip.tracks.filter(track=>/^(UpperLeg|LowerLeg|Foot|Toe)_/.test(track.name));actions[name]=mixer.clipAction(new T.AnimationClip(name,clip.duration,legs)).play();}}
      if(actions.run)actions.run.setEffectiveWeight(0);
      root.traverse(o=>{if(o.isMesh){o.castShadow=false;if(o.material){const original=o.material;o.material=keep(original.clone());const shirt=new T.Color(index===0?r.shirtColor:config.opponentShirtColor);o.material.onBeforeCompile=shader=>{shader.uniforms.tennisShirt={value:shirt};shader.fragmentShader='uniform vec3 tennisShirt;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(diffuseColor.b>diffuseColor.r*1.4&&diffuseColor.b>diffuseColor.g*1.1) diffuseColor.rgb=tennisShirt;');};original.dispose();}}});
      const bones=Object.fromEntries(['Hips','Chest','UpperArm_R','LowerArm_R','Hand_R','UpperArm_L','LowerArm_L','Hand_L','UpperLeg_L','LowerLeg_L','Foot_L','Toe_L','UpperLeg_R','LowerLeg_R','Foot_R','Toe_R'].map(name=>[name,root.getObjectByName(name)]));
      characters.push({bodyHeight:new T.Box3().setFromObject(root).getSize(new T.Vector3()).y,root,mixer,actions,bones,hand:bones.Hand_R,rest:Object.fromEntries(Object.entries(bones).filter(([,b])=>b).map(([name,b])=>[name,b.quaternion.clone()]))});
      const rk=config.animation.racket,racket=new T.Group(),frameMat=material(index===0?'#ffcc65':'#f8f3df');
      const frame=new T.Mesh(keep(new T.TorusGeometry(rk.radius,rk.tube,rk.tubeSegments,rk.frameSegments)),frameMat);frame.scale.fromArray(rk.headScale);frame.position.fromArray(rk.headOffset);racket.add(frame);
      const handle=new T.Mesh(keep(new T.CylinderGeometry(.032,.036,rk.handleLength,rk.handleSegments)),dark);handle.position.y=rk.handleOffset;racket.add(handle);
      const strings=[];for(let n=-rk.stringsPerHalf;n<=rk.stringsPerHalf;n++){const t=n*rk.stringGap,len=Math.sqrt(rk.stringRadius**2-t*t),y=rk.headOffset[1],stretch=rk.headScale[1];strings.push(t,y-len*stretch,0,t,y+len*stretch,0,-len,y+t*stretch,0,len,y+t*stretch,0);}
      const wireGeometry=keep(new T.BufferGeometry());wireGeometry.setAttribute('position',new T.Float32BufferAttribute(strings,3));racket.add(new T.LineSegments(wireGeometry,keep(new T.LineBasicMaterial({color:'#edf0d1'}))));
      characters[index].hand?.add(racket);characters[index].racketHead=frame;
    }
    characterLoaded=characters.length===2;
  }catch(error){dispose();throw error;}
  function disposeObject(o){if(o.isSkinnedMesh)o.skeleton?.dispose();o.geometry?.dispose();for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}}
  observer=new ResizeObserver(resize);observer.observe(canvas);
  function resize(){if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.position.fromArray(w>h?r.cameraLandscape:r.cameraPortrait);camera.lookAt(...r.cameraTarget);camera.updateProjectionMatrix();renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio||1,r.pixelRatios[quality]));}
  function setQuality(q){quality=Math.min(r.pixelRatios.length-1,q);renderer.shadowMap.enabled=r.shadowEnabled[quality];sun.castShadow=r.shadowEnabled[quality];environment.setQuality(quality);resize();onQuality(quality);}
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
      // Only leg tracks are played. Hips keep their bind orientation toward the
      // net, and every upper-body pose starts from bind to prevent accumulation.
      for(const [name,bone]of Object.entries(ch.bones))if(bone)bone.quaternion.copy(ch.rest[name]);
      ch.actions.run?.setEffectiveWeight(p.running?1:0);ch.actions.stand?.setEffectiveWeight(0);if(p.running)ch.mixer.update(dt);
      const pose=tennisPose(p,config,{toss:state.phase==='toss'&&state.server===i,tossProgress:state.tossProgress||0});
      ch.root.position.z=pose.step;
      if(!p.running){ch.bones.UpperLeg_L.rotation.x-=pose.step*1.6;ch.bones.LowerLeg_L.rotation.x+=pose.knee;ch.bones.Foot_L.rotation.x-=pose.knee*.5;ch.bones.LowerLeg_R.rotation.x+=pose.knee*.5;}
      ch.bones.Chest.rotation.y+=pose.chest;ch.root.updateWorldMatrix(true,true);
      const rk=config.animation.racket,u=1-p.swing/(p.swingDuration||config.player.swingSeconds);
      const base=p.serving||state.phase==='toss'&&state.server===i?rk.serveRotation:p.stroke==='backhand'?rk.backhandRotation:rk.handRotation,rotation=[...base];
      if(p.swing>0){let follow=T.MathUtils.clamp((u-config.animation.contactFraction)/(config.animation.recoveryFraction-config.animation.contactFraction),0,1);follow=follow*follow*(3-2*follow);const end=p.serving?rk.serveFollowAngle:(p.stroke==='backhand'?-1:1)*rk.followAngle;rotation[2]=T.MathUtils.lerp(base[2],end,follow);}
      const handRotation=new T.Quaternion().setFromEuler(new T.Euler(...rotation));
      const contactWeight=p.swing>0&&p.contactPoint?Math.max(0,1-Math.abs(u-config.animation.contactFraction)/config.animation.contactBlend):0;
      for(const [suffix,elbow,hand]of [['R',pose.rightElbow,pose.rightHand],['L',pose.leftElbow,pose.leftHand]]){
        const wrist=new T.Vector3(...hand);
        if(suffix==='R'&&contactWeight>0){
          const hit=ch.root.worldToLocal(new T.Vector3(p.contactPoint.x,p.contactPoint.y,p.contactPoint.z));
          const offset=new T.Vector3(...rk.headOffset).applyQuaternion(handRotation);
          wrist.lerp(hit.sub(offset),contactWeight);
        }
        poseArm(ch.bones['UpperArm_'+suffix],ch.bones['LowerArm_'+suffix],ch.bones['Hand_'+suffix],ch.root.localToWorld(new T.Vector3(...elbow)),ch.root.localToWorld(wrist));
      }
      const world=ch.root.getWorldQuaternion(new T.Quaternion()).multiply(handRotation),parent=ch.hand.parent.getWorldQuaternion(new T.Quaternion());
      ch.hand.quaternion.copy(parent.invert().multiply(world));ch.root.updateWorldMatrix(true,true);ch.contactWeight=contactWeight;ch.contactDistance=p.contactPoint?ch.racketHead.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(p.contactPoint.x,p.contactPoint.y,p.contactPoint.z)):null;
    });
    faultMark.visible=Boolean(state.faultMark);if(state.faultMark)faultMark.position.set(state.faultMark.x,.13,state.faultMark.z);
    environment.render(state,dt);
    if(state.event.id!==lastEvent){lastEvent=state.event.id;if(state.event.ace||state.event.type==='complete'&&state.result?.won)burst(state.players[0].x,state.players[0].z);}
    let active=0;for(let i=0;i<particleData.length;i++){const p=particleData[i];if(p.life>0){p.life-=dt;positions[i*3]+=p.vx*dt;positions[i*3+1]+=p.vy*dt;positions[i*3+2]+=p.vz*dt;p.vy-=5*dt;active++;}else positions[i*3+1]=-10;}
    particles.visible=active>0;if(active)particleGeometry.attributes.position.needsUpdate=true;
    renderer.render(scene,camera);frameCount++;
  }
  function poseArm(arm,forearm,hand,guide,wrist){
    const shoulder=arm.getWorldPosition(new T.Vector3()),elbow=forearm.getWorldPosition(new T.Vector3()),palm=hand.getWorldPosition(new T.Vector3());
    const upper=shoulder.distanceTo(elbow),lower=elbow.distanceTo(palm),epsilon=config.animation.ikEpsilon;
    const axis=wrist.clone().sub(shoulder),distance=T.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+epsilon,upper+lower-epsilon);axis.normalize();
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
    const bend=guide.sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<epsilon)bend.set(0,0,1).addScaledVector(axis,-axis.z);bend.normalize();
    const target=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
    aimBone(arm,forearm,target);aimBone(forearm,hand,shoulder.addScaledVector(axis,distance));
  }
  function aimBone(bone,child,target){
    if(!bone||!child)return;
    const origin=bone.getWorldPosition(new T.Vector3()),parent=bone.parent.getWorldQuaternion(new T.Quaternion());
    const direction=target.sub(origin).normalize().applyQuaternion(parent.invert());
    bone.quaternion.setFromUnitVectors(child.position.clone().normalize(),direction);bone.updateWorldMatrix(false,true);
  }
  function metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,quality,pixelRatio:renderer.getPixelRatio(),...environment.metrics(),shadows:renderer.shadowMap.enabled,characterLoaded,shirtColors:[r.shirtColor,config.opponentShirtColor],frames:frameCount,disposed,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,rig:characters.map((ch,i)=>({bodyHeight:ch.bodyHeight,facing:holders[i].rotation.y,hips:ch.bones.Hips.rotation.toArray().slice(0,3),chest:ch.bones.Chest.rotation.toArray().slice(0,3),rightArm:ch.bones.UpperArm_R.quaternion.toArray(),legs:['UpperLeg_L','LowerLeg_L','Foot_L','UpperLeg_R','LowerLeg_R','Foot_R'].map(n=>ch.bones[n].quaternion.toArray()),step:ch.root.position.z,contactWeight:ch.contactWeight,contactDistance:ch.contactDistance,rightHand:ch.hand.getWorldPosition(new T.Vector3()).toArray(),racketHead:ch.racketHead.getWorldPosition(new T.Vector3()).toArray()}))};}
  function dispose(){if(disposed)return;disposed=true;observer?.disconnect();characters.forEach(c=>{c.mixer.stopAllAction();c.mixer.uncacheRoot(c.root);});scene.traverse(disposeObject);resources.forEach(o=>o.dispose?.());resources.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear();}
  setQuality(0);resize();
  return {render,observeFrame,metrics,dispose,playerScreenPosition(s){const v=new T.Vector3(s.players[0].x,1.2,s.players[0].z).project(camera);return {x:(v.x+1)*canvas.clientWidth/2,y:(1-v.y)*canvas.clientHeight/2};},inspectCamera(position,target){camera.position.fromArray(position);camera.lookAt(...target);camera.updateProjectionMatrix();}};
}

/** Keep the same round alive when a GPU context cannot be used. */
export function createTennisFallback(canvas,config){
 const surface=canvas.cloneNode();surface.classList.add('tennis-fallback');canvas.hidden=true;canvas.after(surface);const p=surface.getContext('2d');let disposed=false;
 return {playerScreenPosition(s){const scale=Math.min(surface.clientWidth/(config.court.halfWidth*3),surface.clientHeight/(config.court.halfLength*2.5));return {x:surface.clientWidth/2+s.players[0].x*scale,y:surface.clientHeight/2+s.players[0].z*scale-1.2*scale};},metrics(){return {mode:'canvas',triangles:0,drawCalls:0,characterLoaded:false,shirtColors:[config.render.shirtColor,config.opponentShirtColor],disposed};},observeFrame(){},dispose(){if(disposed)return;disposed=true;surface.remove();canvas.hidden=false;},render(s){if(disposed)return;const w=surface.clientWidth,h=surface.clientHeight;surface.width=w;surface.height=h;p.fillStyle=config.render.colors.apron;p.fillRect(0,0,w,h);const scale=Math.min(w/(config.court.halfWidth*3),h/(config.court.halfLength*2.5)),project=(x,z)=>[w/2+x*scale,h/2+z*scale];p.strokeStyle=config.render.colors.line;p.lineWidth=2;const [x,y]=project(-config.court.halfWidth,-config.court.halfLength);p.strokeRect(x,y,config.court.halfWidth*2*scale,config.court.halfLength*2*scale);p.beginPath();p.moveTo(x,h/2);p.lineTo(w-x,h/2);p.stroke();s.players.forEach((v,i)=>{const [x,z]=project(v.x,v.z);p.fillStyle=i?config.opponentShirtColor:config.render.shirtColor;p.fillRect(x-8,z-14,16,22);p.fillStyle='#edac78';p.beginPath();p.arc(x,z-20,7,0,Math.PI*2);p.fill();});const [bx,bz]=project(s.ball.x,s.ball.z);p.fillStyle=config.render.colors.ball;p.beginPath();p.arc(bx,bz-s.ball.y*scale,Math.max(3,config.ball.radius*scale),0,Math.PI*2);p.fill();}};
}

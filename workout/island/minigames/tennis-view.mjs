import {createUltraTennisCourt,createUltraTennisEffects} from './ultra-tennis-court.mjs?v=island-people-scale-20261026-1';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {seededRandom} from './tennis.mjs?v=island-people-scale-20261026-1';
import {tennisPose} from './tennis-pose.mjs?v=island-people-scale-20261026-1';
import {createTennisEnvironment} from './tennis-environment.mjs?v=island-people-scale-20261026-1';

export async function createTennisView(canvas,config,{onQuality=()=>{},characterUrl=new URL('../assets/kid-full.glb?v=island-people-scale-20261026-1',import.meta.url)}={}) {
  const r=config.render, colors=r.colors, scene=new T.Scene();
  scene.background=new T.Color('#c4dcdf');scene.fog=new T.Fog('#c4dcdf',r.environment.fogNear,r.environment.fogFar);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const camera=new T.PerspectiveCamera(r.cameraFov,1,0.1,300),cameraBase=new T.Vector3(),resources=new Set();
  let cameraFollow=0,cameraInspected=false;
  let observer;
  let disposed=false,quality=0,slow=0,qualityAge=0,frameCount=0,lastEvent=0,characterLoaded=false;
  const keep=x=>(resources.add(x),x);
  const material=(color,extra={})=>keep(new T.MeshStandardMaterial({color,roughness:0.9,...extra}));
  const basic=(color,extra={})=>keep(new T.MeshBasicMaterial({color,...extra}));
  scene.add(new T.HemisphereLight('#e9f1f1','#5b6850',1.08));
  const sun=new T.DirectionalLight('#fff1d3',2.55);sun.position.set(-9,18,8);sun.castShadow=true;
  sun.shadow.mapSize.set(r.shadowMapSize,r.shadowMapSize);Object.assign(sun.shadow.camera,{left:-12,right:12,top:15,bottom:-15,near:1,far:50});sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun);
  const dark=material('#253e38',{roughness:.65,metalness:.15});
  const courtPresentation=createUltraTennisCourt(scene,config,keep,renderer),effects=createUltraTennisEffects(scene,keep);
  const environment=await createTennisEnvironment(scene,config,keep,renderer,camera),rand=seededRandom(config.seed);
  const ball=new T.Mesh(keep(new T.SphereGeometry(config.ball.radius,20,12)),material(colors.ball,{roughness:.97,emissive:colors.ball,emissiveIntensity:.16}));scene.add(ball);
  // Recessed ivory seams retain the exact physical radius and silhouette.
  for(const angle of [0,Math.PI]){const pts=[];for(let i=0;i<=48;i++){const t=i/48*Math.PI*2,phi=.55*Math.sin(2*t)+angle;pts.push(new T.Vector3(Math.cos(t)*Math.cos(phi),Math.sin(t),Math.cos(t)*Math.sin(phi)).multiplyScalar(config.ball.radius*1.006));}const seam=new T.Mesh(keep(new T.TubeGeometry(new T.CatmullRomCurve3(pts),48,.005,3,false)),material('#ececc7'));ball.add(seam);}
  // Contact shadows remain at every tier, including devices without shadow maps.
  const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=64;const shadeCtx=shadeCanvas.getContext('2d'),gradient=shadeCtx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(16,28,23,.48)');gradient.addColorStop(.45,'rgba(16,28,23,.22)');gradient.addColorStop(1,'rgba(16,28,23,0)');shadeCtx.fillStyle=gradient;shadeCtx.fillRect(0,0,64,64);const shadeMap=keep(new T.CanvasTexture(shadeCanvas));
  const playerShadows=[0,1].map(()=>{const m=new T.Mesh(keep(new T.PlaneGeometry(1.05,.78)),basic('#ffffff',{map:shadeMap,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;scene.add(m);return m;});
  const shadow=new T.Mesh(keep(new T.CircleGeometry(.26,20)),basic('#ffffff',{map:shadeMap,transparent:true,opacity:.8,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
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
      root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material){const original=o.material;o.material=keep(original.clone());const shirt=new T.Color(index===0?r.shirtColor:config.opponentShirtColor);o.material.onBeforeCompile=shader=>{shader.uniforms.tennisShirt={value:shirt};shader.fragmentShader='uniform vec3 tennisShirt;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(diffuseColor.b>diffuseColor.r*1.4&&diffuseColor.b>diffuseColor.g*1.1) {float fabricLight=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/.22,.45,1.35);diffuseColor.rgb=tennisShirt*fabricLight;}');};original.dispose();}}});
      const bones=Object.fromEntries(['Hips','Chest','UpperArm_R','LowerArm_R','Hand_R','UpperArm_L','LowerArm_L','Hand_L','UpperLeg_L','LowerLeg_L','Foot_L','Toe_L','UpperLeg_R','LowerLeg_R','Foot_R','Toe_R'].map(name=>[name,root.getObjectByName(name)]));
      characters.push({bodyHeight:new T.Box3().setFromObject(root).getSize(new T.Vector3()).y,root,mixer,actions,bones,hand:bones.Hand_R,reachOffset:new T.Vector3(),reachSpeed:0,racketPitch:0,rest:Object.fromEntries(Object.entries(bones).filter(([,b])=>b).map(([name,b])=>[name,b.quaternion.clone()]))});
      const rk=config.animation.racket,racket=new T.Group(),frameMat=material(index===0?'#c7a367':'#e6e2cf',{roughness:.38,metalness:.35});
      const frame=new T.Mesh(keep(new T.TorusGeometry(rk.radius,rk.tube,rk.tubeSegments,rk.frameSegments)),frameMat);frame.scale.fromArray(rk.headScale);frame.position.fromArray(rk.headOffset);racket.add(frame);
      const handle=new T.Mesh(keep(new T.CylinderGeometry(.032,.036,rk.handleLength,rk.handleSegments)),dark);handle.position.y=rk.handleOffset;racket.add(handle);
      const strings=[];for(let n=-rk.stringsPerHalf;n<=rk.stringsPerHalf;n++){const t=n*rk.stringGap,len=Math.sqrt(rk.stringRadius**2-t*t),y=rk.headOffset[1],stretch=rk.headScale[1];strings.push(t,y-len*stretch,0,t,y+len*stretch,0,-len,y+t*stretch,0,len,y+t*stretch,0);}
      const wireGeometry=keep(new T.BufferGeometry());wireGeometry.setAttribute('position',new T.Float32BufferAttribute(strings,3));racket.add(new T.LineSegments(wireGeometry,keep(new T.LineBasicMaterial({color:'#edf0d1'}))));
      // Batch the detailed throat and wrapped grip into two extra draws.
      const throatParts=[];for(const sign of [-1,1]){const g=new T.CylinderGeometry(.018,.022,.29,6);g.rotateZ(sign*-.34);g.translate(sign*.065,-.63,0);throatParts.push(g);}
      const cap=new T.CylinderGeometry(.044,.04,.038,8);cap.translate(0,-.025,0);throatParts.push(cap);
      const throatGeometry=keep(mergeGeometries(throatParts,false));throatParts.forEach(g=>g.dispose());racket.add(new T.Mesh(throatGeometry,frameMat));
      const gripParts=[];for(let n=0;n<8;n++){const g=new T.TorusGeometry(.037,.006,3,8);g.rotateX(Math.PI/2);g.translate(0,-.09-n*.034,0);gripParts.push(g);}
      const gripGeometry=keep(mergeGeometries(gripParts,false));gripParts.forEach(g=>g.dispose());racket.add(new T.Mesh(gripGeometry,material('#ddd7be')));
      characters[index].hand?.add(racket);characters[index].racketHead=frame;
    }
    characterLoaded=characters.length===2;
  }catch(error){dispose();throw error;}
  function disposeObject(o){if(o.isSkinnedMesh)o.skeleton?.dispose();o.geometry?.dispose();for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}}
  observer=new ResizeObserver(resize);observer.observe(canvas);
  function positionCamera(){camera.position.copy(cameraBase);camera.position.x+=cameraFollow;camera.lookAt(r.cameraTarget[0]+cameraFollow*.45,r.cameraTarget[1],r.cameraTarget[2]);}
  function resize(){if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;camera.aspect=w/h;cameraBase.fromArray(w>h?r.cameraLandscape:r.cameraPortrait);if(!cameraInspected)positionCamera();camera.updateProjectionMatrix();renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio||1,r.pixelRatios[quality]));}
  function setQuality(q){quality=Math.min(r.pixelRatios.length-1,q);renderer.shadowMap.enabled=r.shadowEnabled[quality];sun.castShadow=r.shadowEnabled[quality];environment.setQuality(quality);resize();onQuality(quality);}
  function observeFrame(milliseconds){if(disposed)return;qualityAge+=milliseconds/1000;if(milliseconds>r.slowFrameMs)slow++;else slow=Math.max(0,slow-1);if(slow>=r.slowSamples&&qualityAge>=r.qualityCooldown&&quality<r.pixelRatios.length-1){slow=0;qualityAge=0;setQuality(quality+1);}}
  function burst(x,z){for(let i=0;i<r.particles;i++){const p=particleData[i];p.life=r.particleSeconds;p.vx=(rand()-.5)*5;p.vy=2+rand()*4;p.vz=(rand()-.5)*5;positions.set([x,.4,z],i*3);}particles.visible=true;}
  function render(state,dt=0){
    if(disposed)return;
    if(!cameraInspected&&dt>0){const target=T.MathUtils.clamp(state.players[0].x*.35+state.ball.x*.12,-.65,.65),change=(target-cameraFollow)*(1-Math.exp(-dt*2.8));cameraFollow+=T.MathUtils.clamp(change,-dt*.8,dt*.8);positionCamera();}
    ball.position.set(state.ball.x,state.ball.y+.09,state.ball.z);ball.visible=state.phase!=='complete';
    const flightSpeed=Math.hypot(state.ball.vx||0,state.ball.vz||0),spinRate=T.MathUtils.clamp(state.ball.spin??.3,-1,1)*28;
    if(flightSpeed>.01){ball.rotation.x+=dt*state.ball.vz/flightSpeed*spinRate;ball.rotation.z-=dt*state.ball.vx/flightSpeed*spinRate;}
    shadow.position.set(state.ball.x,.11,state.ball.z);shadow.scale.setScalar(1+state.ball.y*.12);shadow.material.opacity=.6/(1+state.ball.y*.15);shadow.visible=ball.visible;
    ring.visible=Boolean(state.landing&&state.phase==='rally');
    if(ring.visible){const incoming=state.contact?.side===0&&state.ball.lastHitter===1,ready=incoming&&state.contactWindow?.eligible,prepared=incoming&&state.players[0].preparing,cue=incoming&&state.ball.bounces===1?state.contact:state.landing;
      ring.position.set(cue.x,.115,cue.z);ring.material.color.set(!state.landing.valid?'#e69077':ready?'#e7efb4':prepared?'#f5e7a5':'#e3cea0');ring.material.opacity=incoming?(ready?.96:prepared?.85:.65):.32;
      const anticipation=incoming?T.MathUtils.clamp(state.contact.eta,0,1)*.18:0;ring.scale.setScalar(1+anticipation+(ready||prepared?Math.sin(state.elapsed*7)*.035:0));}
    characters.forEach((ch,i)=>{
      const p=state.players[i];holders[i].position.set(p.x,.09,p.z);holders[i].rotation.y=i===0?Math.PI:0;playerShadows[i].position.set(p.x,.093,p.z);
      // Only leg tracks are played. Hips keep their bind orientation toward the
      // net, and every upper-body pose starts from bind to prevent accumulation.
      for(const [name,bone]of Object.entries(ch.bones))if(bone)bone.quaternion.copy(ch.rest[name]);
      const reachGait=Math.min(.4,ch.reachSpeed/3.2*.4);ch.actions.run?.setEffectiveWeight(p.running?1:reachGait);ch.actions.stand?.setEffectiveWeight(0);if(p.running||reachGait>.01)ch.mixer.update(dt);
      const pose=tennisPose(p,config,{toss:state.phase==='toss'&&state.server===i,tossProgress:state.tossProgress||0});
      ch.root.position.set(0,0,pose.step);
      if(!p.running){ch.bones.UpperLeg_L.rotation.x-=pose.step*1.6;ch.bones.LowerLeg_L.rotation.x+=pose.knee;ch.bones.Foot_L.rotation.x-=pose.knee*.5;ch.bones.LowerLeg_R.rotation.x+=pose.knee*.5;}
      ch.bones.Chest.rotation.y+=pose.chest;ch.root.updateWorldMatrix(true,true);
      const rk=config.animation.racket,u=1-p.swing/(p.swingDuration||config.player.swingSeconds);
      const base=p.serving||state.phase==='toss'&&state.server===i?rk.serveRotation:p.stroke==='backhand'?rk.backhandRotation:rk.handRotation,rotation=[...base];
      if(p.swing>0){let follow=T.MathUtils.clamp((u-config.animation.contactFraction)/(config.animation.recoveryFraction-config.animation.contactFraction),0,1);follow=follow*follow*(3-2*follow);const end=p.serving?rk.serveFollowAngle:(p.stroke==='backhand'?-1:1)*rk.followAngle;rotation[2]=T.MathUtils.lerp(base[2],end,follow);}
      const contactWeight=p.swing>0&&p.contactPoint?Math.max(0,1-Math.abs(u-config.animation.contactFraction)/config.animation.contactBlend):0,contactIKWeight=T.MathUtils.smoothstep(contactWeight,0,.75);
      // Begin a small stride while the incoming ball is nearby, then recover at
      // the same bounded speed. World-space presentation offsets never alter
      // player coordinates, and are applied BEFORE the original arm IK.
      const reachTarget=new T.Vector3(),incoming=state.phase==='rally'&&state.contact?.side===i&&state.ball.lastHitter!==i,eta=state.contact?.eta;
      const anticipating=incoming&&eta>=0&&eta<=.45&&Math.hypot(state.contact.x-p.x,state.contact.z-p.z)<=(i===0?state.attributes.reach:config.player.reach*1.25)+.55;
      const contact=contactWeight>0&&!p.serving?p.contactPoint:anticipating?state.contact:null;
      // A slight wrist pitch uses the existing racket shaft to cover depth;
      // a purely vertical racket would force even a legal low ball beyond the
      // original forearm's reach. Anticipate/recover this rotation continuously.
      const localDepth=contact?ch.root.worldToLocal(new T.Vector3(contact.x,(contact.y??config.ball.hitHeight)+.09,contact.z)).z:0,targetPitch=contact?-T.MathUtils.clamp((localDepth-.3)*.32,0,.35):0,pitchChange=(targetPitch-ch.racketPitch)*(1-Math.exp(-Math.max(0,dt)*18));
      ch.racketPitch+=T.MathUtils.clamp(pitchChange,-Math.max(0,dt)*2,Math.max(0,dt)*2);rotation[0]+=ch.racketPitch;
      const handRotation=new T.Quaternion().setFromEuler(new T.Euler(...rotation));
      if(contact){
        // The wrist target must be reachable by the original arm lengths.
        // Solve the horizontal deficit at this height, including the racket
        // head offset, instead of estimating a step from the authored pose.
        const shoulder=ch.bones.UpperArm_R.getWorldPosition(new T.Vector3()),elbow=ch.bones.LowerArm_R.getWorldPosition(new T.Vector3()),palm=ch.hand.getWorldPosition(new T.Vector3()),armLength=shoulder.distanceTo(elbow)+elbow.distanceTo(palm)-config.animation.ikEpsilon;
        const wristLocal=ch.root.worldToLocal(new T.Vector3(contact.x,(contact.y??config.ball.hitHeight)+.09,contact.z)).sub(new T.Vector3(...rk.headOffset).applyQuaternion(handRotation)),wrist=ch.root.localToWorld(wristLocal),dy=wrist.y-shoulder.y;
        const horizontal=Math.hypot(wrist.x-shoulder.x,wrist.z-shoulder.z),available=Math.sqrt(Math.max(0,armLength*armLength-dy*dy)),deficit=Math.max(0,horizontal-available);
        if(deficit>.005)reachTarget.set(wrist.x-shoulder.x,0,wrist.z-shoulder.z).setLength(Math.min(.55,deficit+.065));
      }
      const reachChange=reachTarget.sub(ch.reachOffset),reachDistance=reachChange.length(),reachStep=Math.min(reachDistance*(1-Math.exp(-Math.max(0,dt)*18)),Math.max(0,dt)*3.2);
      if(reachDistance>1e-6)ch.reachOffset.addScaledVector(reachChange,reachStep/reachDistance);ch.reachSpeed=dt>0?reachStep/dt:0;
      const localReach=ch.reachOffset.clone().applyQuaternion(holders[i].getWorldQuaternion(new T.Quaternion()).invert());ch.root.position.add(localReach);ch.root.updateWorldMatrix(true,true);
      playerShadows[i].position.x+=ch.reachOffset.x;playerShadows[i].position.z+=ch.reachOffset.z;ch.displayLunge=ch.reachOffset.length();
      for(const [suffix,elbow,hand]of [['R',pose.rightElbow,pose.rightHand],['L',pose.leftElbow,pose.leftHand]]){
        const wrist=new T.Vector3(...hand);
        if(suffix==='R'&&contactWeight>0){
          const hit=ch.root.worldToLocal(new T.Vector3(p.contactPoint.x,p.contactPoint.y+.09,p.contactPoint.z));
          const offset=new T.Vector3(...rk.headOffset).applyQuaternion(handRotation);
          wrist.lerp(hit.sub(offset),contactIKWeight);
        }
        poseArm(ch.bones['UpperArm_'+suffix],ch.bones['LowerArm_'+suffix],ch.bones['Hand_'+suffix],ch.root.localToWorld(new T.Vector3(...elbow)),ch.root.localToWorld(wrist));
      }
      const world=ch.root.getWorldQuaternion(new T.Quaternion()).multiply(handRotation),parent=ch.hand.parent.getWorldQuaternion(new T.Quaternion());
      ch.hand.quaternion.copy(parent.invert().multiply(world));ch.root.updateWorldMatrix(true,true);
      ch.contactWeight=contactWeight;ch.contactIKWeight=contactIKWeight;ch.contactDistance=p.contactPoint?ch.racketHead.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(p.contactPoint.x,p.contactPoint.y+.09,p.contactPoint.z)):null;
    });
    // The ball rests in the original off-hand before the real toss begins.
    // Rally/toss coordinates, contact IK and all shot timing stay model-owned.
    if(state.phase==='serve'&&characters[state.server]){characters[state.server].bones.Hand_L.getWorldPosition(ball.position);ball.position.y+=config.ball.radius*.65;}
    faultMark.visible=Boolean(state.faultMark);if(state.faultMark)faultMark.position.set(state.faultMark.x,.13,state.faultMark.z);
    environment.render(state,dt);effects.update(state,dt,camera);
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
  function metrics(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,quality,pixelRatio:renderer.getPixelRatio(),...environment.metrics(),...courtPresentation.metrics(),...effects.metrics(),ballSurfaceOffset:.09,cameraFollow,cameraInspected,reachOffsetLimit:.55,reachSpeedLimit:3.2,shadows:renderer.shadowMap.enabled,characterLoaded,shirtColors:[r.shirtColor,config.opponentShirtColor],frames:frameCount,disposed,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,rig:characters.map((ch,i)=>({bodyHeight:ch.bodyHeight,facing:holders[i].rotation.y,hips:ch.bones.Hips.rotation.toArray().slice(0,3),chest:ch.bones.Chest.rotation.toArray().slice(0,3),rightArm:ch.bones.UpperArm_R.quaternion.toArray(),legs:['UpperLeg_L','LowerLeg_L','Foot_L','UpperLeg_R','LowerLeg_R','Foot_R'].map(n=>ch.bones[n].quaternion.toArray()),step:ch.root.position.z,reachOffset:ch.reachOffset.toArray(),reachSpeed:ch.reachSpeed,displayLunge:ch.displayLunge,contactWeight:ch.contactWeight,contactIKWeight:ch.contactIKWeight,contactDistance:ch.contactDistance,rightHand:ch.hand.getWorldPosition(new T.Vector3()).toArray(),racketHead:ch.racketHead.getWorldPosition(new T.Vector3()).toArray()}))};}
  function dispose(){if(disposed)return;disposed=true;observer?.disconnect();sun.shadow.dispose?.();characters.forEach(c=>{c.mixer.stopAllAction();c.mixer.uncacheRoot(c.root);});scene.traverse(disposeObject);resources.forEach(o=>o.dispose?.());resources.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear();}
  setQuality(0);resize();
  return {render,observeFrame,metrics,dispose,playerScreenPosition(s){const v=new T.Vector3(s.players[0].x,1.2,s.players[0].z).project(camera);return {x:(v.x+1)*canvas.clientWidth/2,y:(1-v.y)*canvas.clientHeight/2};},inspectCamera(position,target){cameraInspected=Boolean(position);if(position){camera.position.fromArray(position);camera.lookAt(...target);}else positionCamera();camera.updateProjectionMatrix();}};
}

/** Keep the same round alive when a GPU context cannot be used. */
export function createTennisFallback(canvas,config){
 const surface=canvas.cloneNode();surface.classList.add('tennis-fallback');canvas.hidden=true;canvas.after(surface);const p=surface.getContext('2d');let disposed=false;
 return {playerScreenPosition(s){const scale=Math.min(surface.clientWidth/(config.court.halfWidth*3),surface.clientHeight/(config.court.halfLength*2.5));return {x:surface.clientWidth/2+s.players[0].x*scale,y:surface.clientHeight/2+s.players[0].z*scale-1.2*scale};},metrics(){return {mode:'canvas',triangles:0,drawCalls:0,characterLoaded:false,shirtColors:[config.render.shirtColor,config.opponentShirtColor],disposed};},observeFrame(){},dispose(){if(disposed)return;disposed=true;surface.remove();canvas.hidden=false;},render(s){if(disposed)return;const w=surface.clientWidth,h=surface.clientHeight;surface.width=w;surface.height=h;p.fillStyle=config.render.colors.apron;p.fillRect(0,0,w,h);const scale=Math.min(w/(config.court.halfWidth*3),h/(config.court.halfLength*2.5)),project=(x,z)=>[w/2+x*scale,h/2+z*scale];p.strokeStyle=config.render.colors.line;p.lineWidth=2;const [x,y]=project(-config.court.halfWidth,-config.court.halfLength);p.strokeRect(x,y,config.court.halfWidth*2*scale,config.court.halfLength*2*scale);p.beginPath();p.moveTo(x,h/2);p.lineTo(w-x,h/2);p.stroke();s.players.forEach((v,i)=>{const [x,z]=project(v.x,v.z);p.fillStyle=i?config.opponentShirtColor:config.render.shirtColor;p.fillRect(x-8,z-14,16,22);p.fillStyle='#edac78';p.beginPath();p.arc(x,z-20,7,0,Math.PI*2);p.fill();});const [bx,bz]=project(s.ball.x,s.ball.z);p.fillStyle=config.render.colors.ball;p.beginPath();p.arc(bx,bz-s.ball.y*scale,Math.max(3,config.ball.radius*scale),0,Math.PI*2);p.fill();}};
}

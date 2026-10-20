import {soccerCrowd} from './soccer-crowd.mjs?v=g9-20261020-1';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {cloneSoccerRig} from './soccer-rig.mjs?v=g9-20261020-1';
import {playerAnimation,passReceiver,soccerCamera,projectSoccerPoint,slideWeight} from './soccer-presentation.mjs?v=g9-20261020-1';
import {shotHeight,safeShotAim} from './soccer-shot.mjs';
import {holdSoccerBall} from './soccer-poses.mjs';

export function createSoccerView({canvas,config,playArea,layoutNodes=[],onAsset=()=>{},onEdge=()=>{},onContextLost=()=>{}}) {
  const roster=config.players.roster;let poseFocus=null,poseMode=null,poses=[];
  const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,config.view.maxPixelRatio));renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();scene.background=new T.Color('#92c5cc');
  const camera=new T.PerspectiveCamera(config.view.camera.fovDegrees,1,config.view.camera.nearPlane,config.view.camera.farPlane),target=new T.Vector3(),dummy=new T.Object3D(),color=new T.Color();
  const resources=new Set(),track=o=>(resources.add(o),o);
  const mat=(c,extra={})=>track(new T.MeshLambertMaterial({color:c,...extra}));
  scene.add(new T.HemisphereLight('#ffefda','#536f70',2.3));const sun=new T.DirectionalLight('#fff2c7',2.3);sun.position.set(-12,24,8);scene.add(sun);
  // One geometry per material for all static scenery. No per-frame construction.
  const batches=new Map();
  function addStatic(geometry,material,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
    dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(1,1,1);dummy.updateMatrix();geometry.applyMatrix4(dummy.matrix);
    if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geometry);
  }
  const grass=mat('#428757'),stripe=mat('#489260'),white=mat('#fff7de'),dark=mat('#234a50'),sand=mat('#d6c49b'),concrete=mat('#688c8a'),seat=mat('#325c67'),blue=mat('#2868ee'),red=mat('#e94d51');
  const hx=config.pitch.length/2,hz=config.pitch.width/2,gw=config.pitch.goalWidth,gh=config.pitch.goalHeight,gd=config.pitch.goalDepth;
  addStatic(new T.BoxGeometry(39,.65,29),dark,0,-.55,0);addStatic(new T.BoxGeometry(37,.12,27),sand,0,-.17,0);
  addStatic(new T.PlaneGeometry(config.pitch.length,config.pitch.width),grass,0,0,0,-Math.PI/2);
  for(let x=-hx;x<hx;x+=3)if(Math.round((x+hx)/3)%2===0)addStatic(new T.PlaneGeometry(3,config.pitch.width),stripe,x+1.5,.006,0,-Math.PI/2);
  const line=(x,z,w,d)=>addStatic(new T.PlaneGeometry(w,d),white,x,.018,z,-Math.PI/2);
  line(0,0,.08,config.pitch.width);line(0,-hz,config.pitch.length,.08);line(0,hz,config.pitch.length,.08);line(-hx,0,.08,config.pitch.width);line(hx,0,.08,config.pitch.width);
  addStatic(new T.RingGeometry(2.45,2.53,64),white,0,.02,0,-Math.PI/2);addStatic(new T.CircleGeometry(.12,16),white,0,.02,0,-Math.PI/2);
  for(const d of [-1,1]){
    const depth=config.pitch.penaltyDepth,width=config.pitch.penaltyWidth;line(d*(hx-depth),0,.08,width);line(d*(hx-depth/2),-width/2,depth,.08);line(d*(hx-depth/2),width/2,depth,.08);
    line(d*(hx-1.7),0,.08,5.8);line(d*(hx-.85),-2.9,1.7,.08);line(d*(hx-.85),2.9,1.7,.08);
    addStatic(new T.CircleGeometry(.1,12),white,d*(hx-config.pitch.penaltySpot),.025,0,-Math.PI/2);
    for(const z of [-gw/2,gw/2])addStatic(new T.CylinderGeometry(config.pitch.postRadius,config.pitch.postRadius,gh,8),white,d*hx,gh/2,z);
    addStatic(new T.CylinderGeometry(config.pitch.postRadius,config.pitch.postRadius,gw,8),white,d*hx,gh,0,Math.PI/2);
    addStatic(new T.BoxGeometry(gd,.06,gw),white,d*(hx+gd/2),.04,0);
    for(let row=0;row<3;row++)addStatic(new T.BoxGeometry(32,.38,1.1),row===2?seat:concrete,0,.1+row*.43,-hz-2.6-row*1.1);
    addStatic(new T.BoxGeometry(31,.7,.12),dark,0,.3,d*(hz+1.3));
    for(let j=0;j<9;j++)addStatic(new T.BoxGeometry(3.1,.52,.03),j%2?blue:red,-13+j*3.25,.5,d*(hz+1.38));
    for(const z of [-hz-1.7,hz+1.7]){addStatic(new T.CylinderGeometry(.12,.15,5.5,6),dark,d*(hx+2),2.6,z);addStatic(new T.BoxGeometry(1,.55,.6),white,d*(hx+2),5.5,z);}
  }
  for(const [material,geometries] of batches){const merged=track(mergeGeometries(geometries));scene.add(new T.Mesh(merged,material));geometries.forEach(g=>g.dispose());}batches.clear();
  // Goal nets are fixed buffers, displaced on a goal.
  const nets=[];
  for(const d of [-1,1]){
    const vertices=[];const segment=(a,b)=>vertices.push(...a,...b);
    for(let z=-gw/2;z<=gw/2+.01;z+=gw/18){segment([d*(hx+gd),0,z],[d*(hx+gd),gh,z]);segment([d*hx,gh,z],[d*(hx+gd),gh,z]);}
    for(let y=0;y<=gh+.01;y+=gh/8){segment([d*(hx+gd),y,-gw/2],[d*(hx+gd),y,gw/2]);for(const z of [-gw/2,gw/2])segment([d*hx,y,z],[d*(hx+gd),y,z]);}
    const geometry=track(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    const net=new T.LineSegments(geometry,track(new T.LineBasicMaterial({color:'#f4f4dc',transparent:true,opacity:.6})));scene.add(net);nets.push({geometry,base:new Float32Array(vertices),direction:d});
  }
  const count=config.view.crowd.count,crowd=soccerCrowd(T,scene,config,track);
  const numberCanvas=document.createElement('canvas');numberCanvas.width=512;numberCanvas.height=64;const numberContext=numberCanvas.getContext('2d'),numberTexture=track(new T.CanvasTexture(numberCanvas));numberTexture.colorSpace=T.SRGBColorSpace;
  const shirtGeometry=track(new T.PlaneGeometry(config.view.shirts.width,config.view.shirts.height)),shirtNumbers=roster.map((_,i)=>{const texture=track(numberTexture.clone());texture.repeat.x=1/8;texture.offset.x=i/8;texture.needsUpdate=true;const mesh=new T.Mesh(shirtGeometry,track(new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.25,side:T.DoubleSide,depthWrite:false})));scene.add(mesh);return mesh;});let numberSignature='';
  const practiceTarget=new T.Mesh(track(new T.RingGeometry(.55,.7,20)),mat('#ffdc70',{side:T.DoubleSide}));scene.add(practiceTarget);
  const practiceCones=new T.InstancedMesh(track(new T.ConeGeometry(.22,.6,6)),mat('#f0a947'),2);scene.add(practiceCones);
  const boxes=new T.InstancedMesh(track(new T.BoxGeometry(1,1,1)),track(new T.MeshLambertMaterial()),108);
  const spheres=new T.InstancedMesh(track(new T.SphereGeometry(1,10,7)),track(new T.MeshLambertMaterial()),roster.length*2);boxes.frustumCulled=spheres.frustumCulled=false;scene.add(boxes,spheres);
  const shadows=new T.InstancedMesh(track(new T.CircleGeometry(.52,20)),track(new T.MeshBasicMaterial({color:'#153b36',transparent:true,opacity:.25,depthWrite:false})),roster.length+1);shadows.frustumCulled=false;scene.add(shadows);
  const selector=new T.Mesh(track(new T.RingGeometry(.68,.8,40)),track(new T.MeshBasicMaterial({color:config.team.colors[0],side:T.DoubleSide})));selector.rotation.x=-Math.PI/2;scene.add(selector);
  const arrow=new T.Mesh(track(new T.ConeGeometry(.25,.42,3)),track(new T.MeshBasicMaterial({color:'#fff49c'})));arrow.rotation.z=Math.PI;scene.add(arrow);
  const aimArrow=new T.Group(),aimMaterial=track(new T.MeshBasicMaterial({color:config.team.colors[0],side:T.DoubleSide}));
  const shaft=new T.Mesh(track(new T.PlaneGeometry(config.view.aimArrowWidth,config.view.aimArrowLength)),aimMaterial);shaft.position.z=config.view.aimArrowLength/2;shaft.rotation.x=-Math.PI/2;aimArrow.add(shaft);
  const head=new T.Mesh(track(new T.ConeGeometry(.13,.32,3)),aimMaterial);head.rotation.x=Math.PI/2;head.position.z=config.view.aimArrowLength;aimArrow.add(head);scene.add(aimArrow);
  const requests=new T.InstancedMesh(track(new T.RingGeometry(.14,.22,12)),track(new T.MeshBasicMaterial({color:'#dfffac',side:T.DoubleSide})),roster.length);requests.frustumCulled=false;scene.add(requests);
  const landing=new T.Mesh(track(new T.RingGeometry(.65,.74,32)),track(new T.MeshBasicMaterial({color:config.passing.landingColor,side:T.DoubleSide,transparent:true,opacity:.9})));landing.rotation.x=-Math.PI/2;scene.add(landing);
  const turfPositions=new Float32Array(roster.length*config.view.animation.turfPerPlayer*3),turfG=track(new T.BufferGeometry());turfG.setAttribute('position',new T.BufferAttribute(turfPositions,3));const turf=new T.Points(turfG,track(new T.PointsMaterial({color:config.view.animation.turfColor,size:.12,transparent:true,opacity:.65})));scene.add(turf);
  const ballRoot=new T.Group();const fallbackBall=new T.Mesh(track(new T.IcosahedronGeometry(config.physics.ballRadius,1)),mat('#fff3da'));ballRoot.add(fallbackBall);scene.add(ballRoot);
  const particleCount=config.view.confettiCount,particles=Array.from({length:particleCount},()=>({x:0,y:-10,z:0,vx:0,vy:0,vz:0,life:0,rotation:0}));
  const confetti=new T.InstancedMesh(track(new T.PlaneGeometry(.12,.23)),track(new T.MeshBasicMaterial({side:T.DoubleSide})),particleCount);confetti.frustumCulled=false;scene.add(confetti);
  const trailConfig=config.view.trail,trail=new T.InstancedMesh(track(new T.SphereGeometry(trailConfig.radius,trailConfig.radialSegments,trailConfig.heightSegments)),track(new T.MeshBasicMaterial({color:'#fff8d6',transparent:true,opacity:trailConfig.opacity,depthWrite:false})),trailConfig.count);trail.frustumCulled=false;scene.add(trail);
  let disposed=false,lastEvent=0,time=0,goalPulse=0,goalTeam=0,quality=0,qualitySeconds=0,frameSum=0,frameCount=0,lastWidth=0,lastHeight=0,assetStatus='loading',assetStats=null,cameraState=null,framing=null;
  const characters=[],kitMaterials=[],keeperGeometries=new Map(),bounds=new T.Box3(),size=new T.Vector3();
  const ready=new GLTFLoader().loadAsync(new URL('../assets/kid-full.glb',import.meta.url).href).then(data=>{
    if(disposed){disposeObject(data.scene);return;}
    const source=data.scene,embeddedBall=source.getObjectByName('Ball');
    if(embeddedBall){
      embeddedBall.removeFromParent();const mesh=new T.Mesh(track(embeddedBall.geometry),track(embeddedBall.material));mesh.geometry.computeBoundingBox();mesh.geometry.boundingBox.getCenter(target);mesh.geometry=track(mesh.geometry.clone());mesh.geometry.translate(-target.x,-target.y,-target.z);mesh.geometry.computeBoundingSphere();mesh.scale.setScalar(config.physics.ballRadius/mesh.geometry.boundingSphere.radius);ballRoot.remove(fallbackBall);ballRoot.add(mesh);
    }
    bounds.setFromObject(source);bounds.getSize(size);const scale=config.view.animation.characterHeight/size.y;source.scale.setScalar(scale);source.position.y=-bounds.min.y*scale;
    let faceMap=null,triangles=0,meshes=0;
    source.traverse(o=>{if(!o.isMesh)return;track(o.geometry);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;meshes++;
      const material=Array.isArray(o.material)?o.material[0]:o.material;track(material);if(material.map){faceMap=material.map;track(faceMap);}
      const count=o.geometry.attributes.position.count;
      o.geometry.setAttribute('soccerKeeper',new T.BufferAttribute(new Float32Array(count),1));
      o.geometry.setAttribute('soccerFace',new T.BufferAttribute(new Float32Array(count).fill(material.map?1:0),1));
      o.geometry.setAttribute('soccerUv',o.geometry.attributes.uv||new T.BufferAttribute(new Float32Array(count*2),2));
    });
    for(const kit of [config.team,config.opponent]){
      const material=track(new T.MeshLambertMaterial({vertexColors:true,transparent:true,alphaTest:.1}));
      const shirt=new T.Color(kit.colors[0]),keeper=shirt.clone().lerp(new T.Color(kit.colors[1]),config.view.animation.keeperMix);
      material.onBeforeCompile=shader=>{
        shader.uniforms.soccerShirt={value:shirt};shader.uniforms.soccerKeeperColor={value:keeper};shader.uniforms.soccerFaceMap={value:faceMap};
        shader.vertexShader='attribute float soccerKeeper; attribute float soccerFace; attribute vec2 soccerUv; varying float vSoccerKeeper; varying float vSoccerFace; varying vec2 vSoccerUv;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSoccerKeeper=soccerKeeper;vSoccerFace=soccerFace;vSoccerUv=soccerUv;');
        shader.fragmentShader='uniform vec3 soccerShirt;uniform vec3 soccerKeeperColor;uniform sampler2D soccerFaceMap;varying float vSoccerKeeper;varying float vSoccerFace;varying vec2 vSoccerUv;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(diffuseColor.b>diffuseColor.r*1.4 && diffuseColor.b>diffuseColor.g*1.1) diffuseColor.rgb=mix(soccerShirt,soccerKeeperColor,vSoccerKeeper);\nif(vSoccerFace>.5) diffuseColor*=texture2D(soccerFaceMap,vSoccerUv);');
      };kitMaterials.push(material);
    }
    for(let id=0;id<roster.length;id++){
      const root=cloneSoccerRig(source),pivot=new T.Group();pivot.add(root);scene.add(pivot);
      const appearance=config.view.appearance,identity=id;
      root.traverse(o=>{if(!o.isMesh)return;o.material=kitMaterials[roster[id].team];o.frustumCulled=false;
        const original=o.geometry,geometry=track(original.clone()),colors=geometry.attributes.color?.clone();
        if(colors){const skin=new T.Color(appearance.skin[identity]),hair=new T.Color(appearance.hair[identity]),sock=new T.Color(appearance.socks[identity]);
          for(let i=0;i<colors.count;i++){const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i),y=geometry.attributes.position.getY(i);
            if(r>g*1.15&&g>b*1.05){const tint=r<.25?hair:skin;colors.setXYZ(i,tint.r,tint.g,tint.b);}
            else if(r<.15&&g<.12&&b<.12&&/Head/.test(o.name))colors.setXYZ(i,hair.r,hair.g,hair.b);
            else if(r>.7&&g>.7&&b>.6&&y<.55)colors.setXYZ(i,sock.r,sock.g,sock.b);
          }geometry.setAttribute('color',colors);
        }o.geometry=geometry;
        if(roster[id].role==='keeper'){if(!keeperGeometries.has(o.geometry)){const geometry=track(o.geometry.clone());geometry.setAttribute('soccerKeeper',new T.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1),1));keeperGeometries.set(o.geometry,geometry);}o.geometry=keeperGeometries.get(o.geometry);}
      });
      const mixer=new T.AnimationMixer(root),actions={};
      for(const clip of data.animations)if(['stand','run','kick','jumping-jacks'].includes(clip.name))actions[clip.name]=mixer.clipAction(clip);
      actions.kick.setLoop(T.LoopOnce,1);actions.kick.clampWhenFinished=true;actions.stand.play();const bones=Object.fromEntries(['UpperLeg_R','LowerLeg_R','UpperLeg_L','LowerLeg_L','Head','Neck','Chest','Hips','Spine','UpperArm_L','UpperArm_R','LowerArm_L','LowerArm_R','Hand_L','Hand_R','Foot_L','Foot_R'].map(name=>{const bone=root.getObjectByName(name);return [name,{bone,rest:bone?.quaternion.clone()}];}));characters.push({root,pivot,mixer,actions,bones,headPoint:new T.Vector3(),chestPoint:new T.Vector3(),feetPoints:[new T.Vector3(),new T.Vector3()],active:'stand',mode:'idle',kickTime:0,stealTime:0,yaw:null});
    }
    const sourceTriangles=triangles+(embeddedBall?(embeddedBall.geometry.index?.count||embeddedBall.geometry.attributes.position.count)/3:0);
    assetStats={triangles,sourceTriangles,meshes,sixCharacterTriangles:triangles*6,sharedTeamMaterials:kitMaterials.length,independentSkeletons:true,eightCharacterTriangles:triangles*roster.length};assetStatus='ready';onAsset('ready');
  }).catch(()=>{if(!disposed){assetStatus='fallback';onAsset('fallback');}});
  function disposeObject(root){root.traverse(o=>{o.geometry?.dispose();o.skeleton?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){m.map?.dispose();m.dispose();}});}
  const observer=new ResizeObserver(resize);for(const node of [canvas,...layoutNodes])observer.observe(node);
  function resize(){if(disposed)return;const rect=canvas.getBoundingClientRect(),area=playArea?.()||{x:0,y:0,width:rect.width,height:rect.height};lastWidth=area.width;lastHeight=area.height;renderer.setSize(rect.width,rect.height,false);renderer.setViewport(area.x,rect.height-area.y-area.height,area.width,area.height);camera.aspect=lastWidth/Math.max(1,lastHeight);camera.updateProjectionMatrix();}
  resize();
  function qualitySample(frameMs,dt) {
    if(!Number.isFinite(frameMs)||frameMs<=0)return;frameSum+=frameMs;frameCount++;qualitySeconds+=dt;
    if(qualitySeconds>=config.view.qualityWindowSeconds){if(frameSum/frameCount>config.view.slowFrameMs&&quality<3)lowerQuality();qualitySeconds=frameSum=frameCount=0;}
  }
  function lowerQuality(){
    quality++;renderer.setPixelRatio(quality===1?1:config.view.lowPixelRatio);crowd.count=Math.floor(count/config.view.crowd.lowDivisor**Math.min(quality,2));shadows.visible=false;confetti.visible=quality<2;resize();
  }
  function render(s,dt=0,frameMs=0) {
    if(disposed)return;time+=dt;qualitySample(frameMs,dt);
    crowd.update(time,s.phase==='goal');
    const signature=s.players.map(p=>p.card.number).join(',');if(signature!==numberSignature){numberSignature=signature;numberContext.clearRect(0,0,512,64);numberContext.font='bold 46px sans-serif';numberContext.textAlign='center';numberContext.textBaseline='middle';numberContext.fillStyle='#fff7da';numberContext.strokeStyle='#243d59';numberContext.lineWidth=5;for(const p of s.players){numberContext.strokeText(String(p.card.number),p.id*64+32,32);numberContext.fillText(String(p.card.number),p.id*64+32,32);}numberTexture.needsUpdate=true;for(const mesh of shirtNumbers)mesh.material.map.needsUpdate=true;}
    const c=config.view.camera,angle=c.elevationDegrees*Math.PI/180;
    cameraState=soccerCamera(s,camera.aspect,config,cameraState,dt);
    camera.position.set(cameraState.x,cameraState.distance*Math.sin(angle),cameraState.z+s.attackDir*cameraState.distance*Math.cos(angle));camera.lookAt(cameraState.x,0,cameraState.z);camera.updateMatrixWorld();if(poseFocus!==null){const p=s.players[poseFocus];camera.position.set(p.x,1.9,p.z+5.5);camera.lookAt(p.x,.8,p.z);camera.updateMatrixWorld();}
    const ballProjection=projectSoccerPoint(s.ball,cameraState,camera.aspect,config),playerProjection=projectSoccerPoint(s.players[s.controlled],cameraState,camera.aspect,config);
    framing={ball:ballProjection,controlled:playerProjection,camera:{...cameraState},elevationDegrees:c.elevationDegrees};
    if(Math.abs(playerProjection.x)>1||Math.abs(playerProjection.y)>1){
      const x=playerProjection.x,y=-playerProjection.y,r=Math.max(Math.abs(x),Math.abs(y));
      onEdge({x:Math.max(c.edgeInset,Math.min(lastWidth-c.edgeInset,(x/r+1)*lastWidth/2)),y:Math.max(c.edgeInset,Math.min(lastHeight-c.edgeInset,(y/r+1)*lastHeight/2)),angle:Math.atan2(y,x)});
    }else onEdge(null);
    if(s.eventId!==lastEvent){lastEvent=s.eventId;if(s.event?.type==='goal'){
      goalPulse=1;goalTeam=s.event.team;
      for(let i=0;i<particles.length;i++){const p=particles[i];p.x=s.ball.x;p.z=s.ball.z;p.y=.6+(i%4)*.2;p.vx=Math.sin(i*2.39)*5;p.vz=Math.cos(i*2.39)*6;p.vy=5+(i%7)*.55;p.life=2+(i%5)*.15;p.rotation=i;confetti.setColorAt(i,color.set(i%3===0?'#ffe48b':goalTeam===0?'#3a8dff':'#ff5c65'));}confetti.instanceColor.needsUpdate=true;
    }}
    goalPulse=Math.max(0,goalPulse-dt*.7);
    let boxIndex=0,sphereIndex=0;
    function box(x,y,z,sx,sy,sz,c,angle=0){dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();boxes.setMatrixAt(boxIndex,dummy.matrix);boxes.setColorAt(boxIndex++,color.set(c));}
    function sphere(x,y,z,sx,sy,sz,c){dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();spheres.setMatrixAt(sphereIndex,dummy.matrix);spheres.setColorAt(sphereIndex++,color.set(c));}
    const receiver=passReceiver(s,config);poses=[];let turfAt=0;
    for(const p of s.players){
      const character=characters[p.id],useModel=character&&(quality<3||p.id===s.controlled||Math.hypot(p.x-s.players[s.controlled].x,p.z-s.players[s.controlled].z)<=config.view.farModelDistance);
      if(character)character.pivot.visible=Boolean(useModel);
      if(useModel){
        const {pivot,actions,mixer,bones}=character,animation=playerAnimation(p,s,config),wanted=Math.atan2(p.fx,p.fz);if(character.yaw===null||['slide','kick','throw'].includes(animation.mode))character.yaw=wanted;else character.yaw+=Math.atan2(Math.sin(wanted-character.yaw),Math.cos(wanted-character.yaw))*(1-Math.exp(-config.view.animation.turnSmoothing*dt));
        pivot.position.set(p.x,animation.height,p.z);pivot.rotation.set(0,character.yaw,0);pivot.rotateX(animation.lean);pivot.rotateZ(animation.roll);
        const retrigger=animation.clip==='kick'&&(p.kickTime>character.kickTime||p.stealTime>character.stealTime);
        if(animation.clip!==character.active||retrigger){actions[character.active].fadeOut(config.view.animation.fadeSeconds);actions[animation.clip].reset().fadeIn(config.view.animation.fadeSeconds).play();character.active=animation.clip;}
        actions[animation.clip].setEffectiveTimeScale(animation.speed);character.mode=animation.mode;character.kickTime=p.kickTime;character.stealTime=p.stealTime;
        for(const {bone,rest}of Object.values(bones))if(bone)bone.quaternion.copy(rest);
        mixer.update(dt*(s.phase==='goal'&&animation.mode!=='celebrate'?config.rules.goalSlowMotion:1));
        const a=config.view.animation,rotate=(name,axis,amount)=>{if(bones[name]?.bone)bones[name].bone.rotation[axis]+=amount;};
        if(animation.mode==='slide'||animation.mode==='recover'){const u=slideWeight(p,config);for(const {bone,rest}of Object.values(bones))if(bone)bone.quaternion.copy(rest);rotate('Hips','x',a.slideHip*u);rotate('Spine','x',a.slideSpine*u);rotate('UpperLeg_R','x',a.slideStraightHip*u);rotate('LowerLeg_R','x',a.slideStraightKnee*u);rotate('UpperLeg_L','x',a.slideBentHip*u);rotate('LowerLeg_L','x',-a.slideKnee*u);rotate('UpperArm_L','x',a.slideSupportArm*u);rotate('LowerArm_L','x',a.slideSpine*u);}
        else if(animation.mode==='steal'){rotate('UpperLeg_R','x',-animation.leg);rotate('LowerLeg_R','x',animation.leg/2);rotate('Spine','x',a.stealLean);}
        if(animation.mode==='throw'){for(const side of ['L','R']){rotate('UpperArm_'+side,'x',a.throwArm);rotate('LowerArm_'+side,'x',a.throwElbow);}rotate('Spine','x',-a.headerLean);}
        if(animation.mode==='dive'||animation.mode==='catch'){for(const side of ['L','R'])rotate('UpperArm_'+side,'x',a.catchArm);}
        if(p.hands)holdSoccerBall(T,character,p,config);
        if(animation.head)bones.Head.bone.rotation.x-=animation.head;
        pivot.updateMatrixWorld(true);const headWorld=bones.Head.bone.getWorldPosition(character.headPoint),feet=character.feetPoints;bones.Foot_L.bone.getWorldPosition(feet[0]);bones.Foot_R.bone.getWorldPosition(feet[1]);const along=v=>(v.x-p.x)*p.fx+(v.z-p.z)*p.fz;
        const ballDistance=v=>Math.hypot(v.x-s.ball.x,v.y-s.ball.y,v.z-s.ball.z),handRadii=p.hands?['L','R'].map(side=>ballDistance(bones['Hand_'+side].bone.getWorldPosition(target))):null;
        poses.push({id:p.id,mode:animation.mode,clip:animation.clip,headAlong:along(headWorld),footAlong:Math.max(...feet.map(along)),headHeight:headWorld.y,lean:animation.lean,footDistance:s.ball.owner===p.id&&!p.hands?Math.min(...feet.map(ballDistance)):null,handRadii});
      }else{
        const angle=Math.atan2(p.fx,p.fz),cos=Math.cos(angle),sin=Math.sin(angle),kit=p.team===0?config.team.colors:config.opponent.colors,shirt=p.role==='keeper'?kit[1]:kit[0];
        const point=(x,z)=>({x:p.x+x*cos+z*sin,z:p.z-x*sin+z*cos});
        const speed=Math.hypot(p.vx,p.vz),swing=Math.sin(time*12+p.id)*Math.min(.18,speed*.045);
        box(p.x,.99,p.z,.58,.63,.34,shirt,angle);sphere(p.x,1.55,p.z,.29,.33,.28,config.view.appearance.skin[p.id]);sphere(p.x,1.74,p.z-.02,.3,.16,.28,config.view.appearance.hair[p.id]);
        for(const side of [-1,1]){let q=point(side*.17,swing*side);box(q.x,.48,q.z,.21,.48,.24,config.view.appearance.socks[p.id],angle);q=point(side*.17,.1+swing*side);box(q.x,.13,q.z,.24,.18,.42,'#293b54',angle);q=point(side*.38,-swing*side);box(q.x,.93,q.z,.16,.55,.18,config.view.appearance.skin[p.id],angle);q=point(side*.11,.265);box(q.x,1.6,q.z,.065,.065,.035,'#273345',angle);}
        const number=point(0,.176);box(number.x,1.02,number.z,.065,.22,.018,kit[1],angle);
      }
      const shirt=shirtNumbers[p.id],style=config.view.shirts;if(character&&useModel){const torso=character.bones.Chest.bone;torso.getWorldPosition(shirt.position);torso.getWorldQuaternion(shirt.quaternion);target.set(0,style.heightOffset,-style.offset).applyQuaternion(shirt.quaternion);shirt.position.add(target);shirt.rotateY(Math.PI);}else{shirt.position.set(p.x-p.fx*style.offset,1.14,p.z-p.fz*style.offset);shirt.rotation.set(0,Math.atan2(-p.fx,-p.fz),0);}

      for(let i=0;i<config.view.animation.turfPerPlayer;i++){const moving=p.slideTime>0,age=(time*3+i/config.view.animation.turfPerPlayer)%1;turfPositions.set([p.x-p.fx*age*.8+Math.sin(i*4)*.2,moving?.08+age*.2:-10,p.z-p.fz*age*.8+Math.cos(i*4)*.2],turfAt);turfAt+=3;}
      dummy.position.set(p.x,.03,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(1.15,.75,1);dummy.updateMatrix();shadows.setMatrixAt(p.id,dummy.matrix);
      dummy.position.set(p.x,2.15,p.z);dummy.rotation.set(Math.PI/2-.6,0,0);dummy.scale.setScalar(p.request||receiver===p.id?1:0);dummy.updateMatrix();requests.setMatrixAt(p.id,dummy.matrix);
    }
    practiceTarget.visible=!!s.practiceTarget;practiceCones.count=s.practiceTarget?.cones?2:0;if(s.practiceTarget){const p=s.practiceTarget;practiceTarget.position.set(p.x,p.cones ? .05 : 1,p.z);practiceTarget.rotation.set(p.cones?-Math.PI/2:0,p.cones?0:Math.PI/2,0);for(let i=0;i<practiceCones.count;i++){dummy.position.set(p.x,.3,p.z+(i?1:-1)*config.training.coneWidth/2);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();practiceCones.setMatrixAt(i,dummy.matrix);}practiceCones.instanceMatrix.needsUpdate=true;}
    turfG.attributes.position.needsUpdate=true;landing.visible=Boolean(s.ball.flight);if(s.ball.flight)landing.position.set(s.ball.flight.x,.04,s.ball.flight.z);
    boxes.count=boxIndex;spheres.count=sphereIndex;boxes.instanceMatrix.needsUpdate=true;spheres.instanceMatrix.needsUpdate=true;if(boxes.instanceColor)boxes.instanceColor.needsUpdate=true;if(spheres.instanceColor)spheres.instanceColor.needsUpdate=true;requests.instanceMatrix.needsUpdate=true;
    const controlled=s.players[s.controlled];selector.position.set(controlled.x,.055,controlled.z);arrow.position.set(controlled.x,2.4+Math.sin(time*4)*.08,controlled.z);
    const aim=s.chargeKind==='pass'?s.passAim||s.aim:safeShotAim(s.actionAim||s.kickAim||s.aim,s.kickAim,s.attackDir,s.charge/config.physics.chargeSeconds,config);
    aimArrow.visible=s.charging;aimArrow.position.set(controlled.x,.065,controlled.z);aimArrow.rotation.y=Math.atan2(aim.x,aim.z);
    const chargeLimit=s.chargeKind==='pass'?config.passing.chargeSeconds:config.physics.chargeSeconds;aimArrow.scale.z=(config.view.aimArrowMinLength+(config.view.aimArrowMaxLength-config.view.aimArrowMinLength)*s.charge/chargeLimit)/config.view.aimArrowLength;
    const height=shotHeight(s.charge/config.physics.chargeSeconds,s.kickAim?.height,config);aimMaterial.color.set(s.chargeKind==='pass'?config.passing.landingColor:height>config.pitch.goalHeight?config.shooting.arrowHighColor:height>config.aerial.minHeight?config.shooting.arrowMidColor:config.shooting.arrowLowColor);
    ballRoot.position.set(s.ball.x,s.ball.y,s.ball.z);{ballRoot.rotation.z-=s.ball.vx*dt/config.ball.spinRadius;ballRoot.rotation.x+=s.ball.vz*dt/config.ball.spinRadius;}
    const fast=s.ball.owner===null&&Math.hypot(s.ball.vx,s.ball.vz)>=trailConfig.speed;
    trail.count=fast&&quality<2?trailConfig.count:0;
    for(let i=0;i<trail.count;i++){dummy.position.set(s.ball.x-s.ball.vx*trailConfig.spacingSeconds*(i+1),s.ball.y,s.ball.z-s.ball.vz*trailConfig.spacingSeconds*(i+1));dummy.rotation.set(0,0,0);dummy.scale.setScalar(1-i/trailConfig.count);dummy.updateMatrix();trail.setMatrixAt(i,dummy.matrix);}trail.instanceMatrix.needsUpdate=true;
    dummy.position.set(s.ball.x,.032,s.ball.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(config.view.ballShadowScale+Math.min(s.ball.y,config.pitch.goalHeight)*config.view.ballShadowHeightScale);dummy.updateMatrix();shadows.setMatrixAt(roster.length,dummy.matrix);shadows.instanceMatrix.needsUpdate=true;
    for(const net of nets){const array=net.geometry.attributes.position.array;for(let i=0;i<array.length;i+=3){array[i]=net.base[i]+(net.direction*s.attackDir===(goalTeam===0?1:-1)?net.direction*Math.sin(time*27+net.base[i+2]*2)*goalPulse*.22:0);}net.geometry.attributes.position.needsUpdate=true;}
    for(let i=0;i<particles.length;i++){const p=particles[i];p.life-=dt;if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=8*dt;p.rotation+=dt*6;}dummy.position.set(p.x,p.life>0?p.y:-10,p.z);dummy.rotation.set(p.rotation,p.rotation*.4,0);dummy.scale.setScalar(p.life>0?1:0);dummy.updateMatrix();confetti.setMatrixAt(i,dummy.matrix);}confetti.instanceMatrix.needsUpdate=true;
    if(poseMode==='split'&&poseFocus!==null){const p=s.players[poseFocus];camera.aspect=lastWidth/2/lastHeight;camera.updateProjectionMatrix();renderer.setScissorTest(true);renderer.setViewport(0,0,lastWidth/2,lastHeight);renderer.setScissor(0,0,lastWidth/2,lastHeight);renderer.render(scene,camera);camera.position.set(p.x,6,p.z+.1);camera.lookAt(p.x,0,p.z);camera.updateMatrixWorld();renderer.setViewport(lastWidth/2,0,lastWidth/2,lastHeight);renderer.setScissor(lastWidth/2,0,lastWidth/2,lastHeight);renderer.render(scene,camera);renderer.setScissorTest(false);renderer.setViewport(0,0,lastWidth,lastHeight);camera.aspect=lastWidth/lastHeight;camera.updateProjectionMatrix();}else renderer.render(scene,camera);
    if(quality<2&&(renderer.info.render.triangles>config.view.maxTriangles||renderer.info.render.calls>config.view.maxDrawCalls))lowerQuality();
  }
  const lost=event=>{event.preventDefault();onContextLost();};canvas.addEventListener('webglcontextlost',lost);
  function pitchBounds(){
    const points=[];for(const x of [-hx,hx])for(const z of [-hz,hz]){target.set(x,0,z).project(camera);points.push({x:(target.x+1)*lastWidth/2,y:(1-target.y)*lastHeight/2});}
    return {width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};
  }
  return {ready,render,qualitySample,
    poseCamera(id,mode){poseFocus=id;poseMode=mode;},
    metrics:()=>({triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,quality,pixelRatio:renderer.getPixelRatio(),crowdCount:crowd.count,shadows:shadows.visible,assetStatus,assetStats,modelCount:characters.filter(c=>c.pivot.visible).length,fallbackCount:roster.length-characters.filter(c=>c.pivot.visible).length,shirtNumbers:numberSignature.split(',').map(Number),appearances:config.view.appearance,aimVisible:aimArrow.visible,aimColor:aimMaterial.color.getHexString(),crowd3D:true,animations:characters.map(c=>c.mode),poses,landingVisible:landing.visible,framing,pitchBounds:pitchBounds(),width:lastWidth,height:lastHeight}),
    dispose(){if(disposed)return;disposed=true;observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);for(const c of characters){c.mixer.stopAllAction();c.mixer.uncacheRoot(c.root);c.root.traverse(o=>o.skeleton?.dispose());}characters.length=0;for(const resource of resources)resource.dispose();resources.clear();scene.clear();renderer.dispose();renderer.forceContextLoss();}
  };
}

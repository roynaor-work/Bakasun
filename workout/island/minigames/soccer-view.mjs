import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

export function createSoccerView({canvas,config,onAsset=()=>{},onContextLost=()=>{}}) {
  const teamShirtColor=new T.Color(config.team.colors[0]);
  const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,config.view.maxPixelRatio));renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();scene.background=new T.Color('#92c5cc');
  const camera=new T.PerspectiveCamera(40,1,.1,140),target=new T.Vector3(),dummy=new T.Object3D(),color=new T.Color();
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
    line(d*(hx-4.1),0,.08,9);line(d*(hx-2.05),-4.5,4.1,.08);line(d*(hx-2.05),4.5,4.1,.08);
    line(d*(hx-1.7),0,.08,5.8);line(d*(hx-.85),-2.9,1.7,.08);line(d*(hx-.85),2.9,1.7,.08);
    addStatic(new T.CircleGeometry(.1,12),white,d*(hx-3),.025,0,-Math.PI/2);
    for(const z of [-gw/2,gw/2])addStatic(new T.CylinderGeometry(.075,.075,gh,8),white,d*hx,gh/2,z);
    addStatic(new T.CylinderGeometry(.075,.075,gw,8),white,d*hx,gh,0,Math.PI/2);
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
  // Original crowd art on a single atlas, instanced in one call.
  const crowdCanvas=document.createElement('canvas');crowdCanvas.width=512;crowdCanvas.height=128;const ctx=crowdCanvas.getContext('2d');
  for(let i=0;i<8;i++){
    const x=i*64;ctx.fillStyle=i%2?'#f5bd8d':'#d49470';ctx.beginPath();ctx.arc(x+32,23,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=i%3===0?'#f6cf6a':i%2?'#2868ee':'#e94d51';ctx.beginPath();ctx.roundRect(x+16,37,32,40,9);ctx.fill();
    ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+20,44);ctx.lineTo(x+7,i%2?19:56);ctx.moveTo(x+44,44);ctx.lineTo(x+57,i%2?19:56);ctx.stroke();
    ctx.fillStyle='#263c50';ctx.fillRect(x+18,77,11,29);ctx.fillRect(x+35,77,11,29);ctx.fillStyle='#292b35';ctx.fillRect(x+23,18,18,5);
  }
  const crowdTexture=track(new T.CanvasTexture(crowdCanvas));crowdTexture.colorSpace=T.SRGBColorSpace;
  const crowdGeometry=track(new T.PlaneGeometry(.9,1.8));
  const count=config.view.crowdCount,crowdMaterial=track(new T.MeshBasicMaterial({map:crowdTexture,transparent:true,alphaTest:.3,side:T.DoubleSide}));
  crowdMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute float atlas; varying float vAtlas;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAtlas=atlas;');shader.fragmentShader='varying float vAtlas;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('texture2D( map, vMapUv )','texture2D( map, vec2((vMapUv.x+vAtlas)/8.0,vMapUv.y) )');};
  crowdGeometry.setAttribute('atlas',new T.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i%8),1));
  const crowd=new T.InstancedMesh(crowdGeometry,crowdMaterial,count);crowd.frustumCulled=false;scene.add(crowd);
  for(let i=0;i<count;i++){dummy.position.set(-14.8+(i%48)*.63,1.2+Math.floor(i/48)*.43,-hz-2.6-Math.floor(i/48)*1.1);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.8+(i%3)*.06);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);}
  const boxes=new T.InstancedMesh(track(new T.BoxGeometry(1,1,1)),track(new T.MeshLambertMaterial()),108);
  const spheres=new T.InstancedMesh(track(new T.SphereGeometry(1,10,7)),track(new T.MeshLambertMaterial()),12);boxes.frustumCulled=spheres.frustumCulled=false;scene.add(boxes,spheres);
  const shadows=new T.InstancedMesh(track(new T.CircleGeometry(.52,20)),track(new T.MeshBasicMaterial({color:'#153b36',transparent:true,opacity:.25,depthWrite:false})),7);shadows.frustumCulled=false;scene.add(shadows);
  const selector=new T.Mesh(track(new T.RingGeometry(.68,.8,40)),track(new T.MeshBasicMaterial({color:'#fff49c',side:T.DoubleSide})));selector.rotation.x=-Math.PI/2;scene.add(selector);
  const arrow=new T.Mesh(track(new T.ConeGeometry(.25,.42,3)),track(new T.MeshBasicMaterial({color:'#fff49c'})));arrow.rotation.z=Math.PI;scene.add(arrow);
  const requests=new T.InstancedMesh(track(new T.RingGeometry(.14,.22,12)),track(new T.MeshBasicMaterial({color:'#dfffac',side:T.DoubleSide})),6);requests.frustumCulled=false;scene.add(requests);
  const ballRoot=new T.Group();const fallbackBall=new T.Mesh(track(new T.IcosahedronGeometry(config.physics.ballRadius,1)),mat('#fff3da'));ballRoot.add(fallbackBall);scene.add(ballRoot);
  const particleCount=config.view.confettiCount,particles=Array.from({length:particleCount},()=>({x:0,y:-10,z:0,vx:0,vy:0,vz:0,life:0,rotation:0}));
  const confetti=new T.InstancedMesh(track(new T.PlaneGeometry(.12,.23)),track(new T.MeshBasicMaterial({side:T.DoubleSide})),particleCount);confetti.frustumCulled=false;scene.add(confetti);
  let disposed=false,glb=null,mixer=null,actions=null,activeAction=null,lastEvent=0,time=0,goalPulse=0,goalTeam=0,quality=0,qualitySeconds=0,frameSum=0,frameCount=0,lastWidth=0,lastHeight=0,assetStatus='loading',assetStats=null;
  const bounds=new T.Box3(),size=new T.Vector3();
  const ready=new GLTFLoader().loadAsync(new URL('../assets/kid-full.glb',import.meta.url).href).then(data=>{
    if(disposed){disposeObject(data.scene);return;}
    glb=new T.Group();const root=data.scene;glb.add(root);scene.add(glb);
    const embeddedBall=root.getObjectByName('Ball');
    if(embeddedBall){embeddedBall.visible=false;const mesh=new T.Mesh(track(embeddedBall.geometry.clone()),embeddedBall.material);mesh.geometry.computeBoundingBox();mesh.geometry.boundingBox.getCenter(target);mesh.geometry.translate(-target.x,-target.y,-target.z);mesh.geometry.computeBoundingSphere();mesh.scale.setScalar(config.physics.ballRadius/mesh.geometry.boundingSphere.radius);ballRoot.remove(fallbackBall);ballRoot.add(mesh);}
    bounds.setFromObject(root);bounds.getSize(size);const scale=1.8/size.y;root.scale.setScalar(scale);root.position.y=-bounds.min.y*scale;
    // Recolor only the blue vertex-color range in a material shader, retaining skin.
    root.traverse(o=>{if(o.isMesh){track(o.geometry);const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials){track(material);if(material.map)track(material.map);material.onBeforeCompile=shader=>{shader.uniforms.soccerShirtColor={value:teamShirtColor};shader.fragmentShader='uniform vec3 soccerShirtColor;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(diffuseColor.b>diffuseColor.r*1.4 && diffuseColor.b>diffuseColor.g*1.1) diffuseColor.rgb=soccerShirtColor;');};}}});
    mixer=new T.AnimationMixer(root);actions={};for(const clip of data.animations)if(['stand','run','kick'].includes(clip.name)){actions[clip.name]=mixer.clipAction(clip);}
    actions.kick.setLoop(T.LoopOnce,1);actions.kick.clampWhenFinished=true;actions.stand.play();activeAction='stand';
    let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;meshes++;}});
    assetStats={triangles,meshes,sixCharacterTriangles:triangles*6};assetStatus='ready';onAsset('ready');
  }).catch(()=>{if(!disposed){assetStatus='fallback';onAsset('fallback');}});
  function disposeObject(root){root.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){m.map?.dispose();m.dispose();}});}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function resize(){if(disposed)return;const rect=canvas.getBoundingClientRect();lastWidth=rect.width;lastHeight=rect.height;renderer.setSize(lastWidth,lastHeight,false);camera.aspect=lastWidth/Math.max(1,lastHeight);camera.updateProjectionMatrix();}
  resize();
  function qualitySample(frameMs,dt) {
    if(!Number.isFinite(frameMs)||frameMs<=0)return;frameSum+=frameMs;frameCount++;qualitySeconds+=dt;
    if(qualitySeconds>=config.view.qualityWindowSeconds){if(frameSum/frameCount>config.view.slowFrameMs && quality<2){quality++;renderer.setPixelRatio(quality===1?1:config.view.lowPixelRatio);crowd.count=quality===1?Math.floor(count/2):Math.floor(count/4);shadows.visible=quality<2;resize();}qualitySeconds=frameSum=frameCount=0;}
  }
  function render(s,dt=0,frameMs=0) {
    if(disposed)return;time+=dt;qualitySample(frameMs,dt);
    const dir=s.attackDir;
    // The whole pitch remains visible; the second-half camera keeps attack right.
    const distance=lastWidth<600?48:39;
    const visibleWidth=2*distance*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
    const cameraDistance=distance*Math.max(1,36/Math.max(1,visibleWidth));
    camera.position.set(0,cameraDistance*.79,cameraDistance*.61*dir);camera.lookAt(0,0,0);
    if(s.eventId!==lastEvent){lastEvent=s.eventId;if(s.event?.type==='goal'){
      goalPulse=1;goalTeam=s.event.team;
      for(let i=0;i<particles.length;i++){const p=particles[i];p.x=s.ball.x;p.z=s.ball.z;p.y=.6+(i%4)*.2;p.vx=Math.sin(i*2.39)*5;p.vz=Math.cos(i*2.39)*6;p.vy=5+(i%7)*.55;p.life=2+(i%5)*.15;p.rotation=i;confetti.setColorAt(i,color.set(i%3===0?'#ffe48b':goalTeam===0?'#3a8dff':'#ff5c65'));}confetti.instanceColor.needsUpdate=true;
    }}
    goalPulse=Math.max(0,goalPulse-dt*.7);
    let boxIndex=0,sphereIndex=0;
    function box(x,y,z,sx,sy,sz,c,angle=0){dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();boxes.setMatrixAt(boxIndex,dummy.matrix);boxes.setColorAt(boxIndex++,color.set(c));}
    function sphere(x,y,z,sx,sy,sz,c){dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();spheres.setMatrixAt(sphereIndex,dummy.matrix);spheres.setColorAt(sphereIndex++,color.set(c));}
    for(const p of s.players){
      if(glb && p.id===s.controlled){
        glb.position.set(p.x,0,p.z);glb.rotation.y=Math.atan2(p.fx,p.fz);
        const action=p.kickTime>0?'kick':Math.hypot(p.vx,p.vz)>.2?'run':'stand';
        if(action!==activeAction){actions[activeAction].fadeOut(.12);actions[action].reset().fadeIn(.12).play();activeAction=action;}
        mixer.update(dt*(s.phase==='goal'?.18:1));
      } else {
        const angle=Math.atan2(p.fx,p.fz),cos=Math.cos(angle),sin=Math.sin(angle),kit=p.team===0?config.team.colors:config.opponent.colors,shirt=kit[0];
        const point=(x,z)=>({x:p.x+x*cos+z*sin,z:p.z-x*sin+z*cos});
        const speed=Math.hypot(p.vx,p.vz),swing=Math.sin(time*12+p.id)*Math.min(.18,speed*.045);
        box(p.x,.99,p.z,.58,.63,.34,shirt,angle);sphere(p.x,1.55,p.z,.29,.33,.28,'#edac78');sphere(p.x,1.74,p.z-.02,.3,.16,.28,p.id%2?'#50382e':'#302d35');
        for(const side of [-1,1]){let q=point(side*.17,swing*side);box(q.x,.48,q.z,.21,.48,.24,'#fff4d9',angle);q=point(side*.17,.1+swing*side);box(q.x,.13,q.z,.24,.18,.42,'#293b54',angle);q=point(side*.38,-swing*side);box(q.x,.93,q.z,.16,.55,.18,'#edac78',angle);q=point(side*.11,.265);box(q.x,1.6,q.z,.065,.065,.035,'#273345',angle);}
        const number=point(0,.176);box(number.x,1.02,number.z,.065,.22,.018,kit[1],angle);
      }
      dummy.position.set(p.x,.03,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(1.15,.75,1);dummy.updateMatrix();shadows.setMatrixAt(p.id,dummy.matrix);
      dummy.position.set(p.x,2.15,p.z);dummy.rotation.set(Math.PI/2-.6,0,0);dummy.scale.setScalar(p.request?1:0);dummy.updateMatrix();requests.setMatrixAt(p.id,dummy.matrix);
    }
    boxes.count=boxIndex;spheres.count=sphereIndex;boxes.instanceMatrix.needsUpdate=true;spheres.instanceMatrix.needsUpdate=true;if(boxes.instanceColor)boxes.instanceColor.needsUpdate=true;if(spheres.instanceColor)spheres.instanceColor.needsUpdate=true;requests.instanceMatrix.needsUpdate=true;
    const controlled=s.players[s.controlled];selector.position.set(controlled.x,.055,controlled.z);arrow.position.set(controlled.x,2.4+Math.sin(time*4)*.08,controlled.z);
    ballRoot.position.set(s.ball.x,s.ball.y,s.ball.z);if(s.ball.owner===null){ballRoot.rotation.z-=s.ball.vx*dt*2;ballRoot.rotation.x+=s.ball.vz*dt*2;}
    dummy.position.set(s.ball.x,.032,s.ball.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(.5);dummy.updateMatrix();shadows.setMatrixAt(6,dummy.matrix);shadows.instanceMatrix.needsUpdate=true;
    for(const net of nets){const array=net.geometry.attributes.position.array;for(let i=0;i<array.length;i+=3){array[i]=net.base[i]+(net.direction*s.attackDir===(goalTeam===0?1:-1)?net.direction*Math.sin(time*27+net.base[i+2]*2)*goalPulse*.22:0);}net.geometry.attributes.position.needsUpdate=true;}
    for(let i=0;i<particles.length;i++){const p=particles[i];p.life-=dt;if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=8*dt;p.rotation+=dt*6;}dummy.position.set(p.x,p.life>0?p.y:-10,p.z);dummy.rotation.set(p.rotation,p.rotation*.4,0);dummy.scale.setScalar(p.life>0?1:0);dummy.updateMatrix();confetti.setMatrixAt(i,dummy.matrix);}confetti.instanceMatrix.needsUpdate=true;
    renderer.render(scene,camera);
  }
  const lost=event=>{event.preventDefault();onContextLost();};canvas.addEventListener('webglcontextlost',lost);
  return {ready,render,qualitySample,
    metrics:()=>({triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,quality,pixelRatio:renderer.getPixelRatio(),crowdCount:crowd.count,shadows:shadows.visible,assetStatus,assetStats,width:lastWidth,height:lastHeight}),
    dispose(){if(disposed)return;disposed=true;observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);mixer?.stopAllAction();if(mixer&&glb)mixer.uncacheRoot(glb.children[0]);glb?.traverse(o=>o.skeleton?.dispose());for(const resource of resources)resource.dispose();resources.clear();scene.clear();glb=mixer=actions=null;renderer.dispose();renderer.forceContextLoss();}
  };
}

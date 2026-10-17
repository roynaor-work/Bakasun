import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {palette} from '../view/environment.mjs?v=task017-20261017-1';
import {loadFireTruck} from './fire-truck.mjs?v=task017-20261017-1';
import {Avatar} from '../view/avatar.mjs?v=task017-20261017-1';
import {LocalModels} from '../view/local-models.mjs?v=task017-20261017-1';

/** Own everything in this round. Static colored parts share a material and are
 * merged at setup; particles, stream vertices and scratch vectors are fixed. */
export function createFireScene(ctx,model,adapters={}) {
  const {config,balance}=ctx,r=balance.render,colors=config.visuals.palette;
  const scene=new T.Scene(),geometries=new Set(),materials=new Set(),textures=new Set();
  let disposed=false,truckVisual=null,hydrantVisual=null;
  const models=new LocalModels(adapters);
  const ownG=g=>(geometries.add(g),g),ownM=m=>(materials.add(m),m);
  const solid=ownM(new T.MeshStandardMaterial({vertexColors:true,roughness:.82}));
  scene.background=new T.Color(r.sky);scene.fog=new T.Fog(r.sky,r.fogNear,r.fogFar);
  scene.add(new T.HemisphereLight(r.sun,palette.teal,r.hemisphereIntensity));
  const sun=new T.DirectionalLight(r.sun,r.sunIntensity);sun.position.set(-12,30,20);scene.add(sun);
  const camera=new T.PerspectiveCamera(r.fov,config.width/config.height,.1,180);
  camera.position.fromArray(r.camera);camera.lookAt(...r.lookAt);camera.updateMatrixWorld();
  const fixed=new T.Group(),truckBase=new T.Group();scene.add(fixed,truckBase);let defaultParent=fixed;
  function part(g,color,x,y,z,sx=1,sy=1,sz=1,parent=defaultParent){
    ownG(g);const tint=new T.Color(color),array=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<array.length;i+=3){array[i]=tint.r;array[i+1]=tint.g;array[i+2]=tint.b;}
    g.setAttribute('color',new T.BufferAttribute(array,3));
    const mesh=new T.Mesh(g,solid);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
  }
  const box=(w,h,d,c,x,y,z,parent=defaultParent)=>part(new T.BoxGeometry(w,h,d),c,x,y,z,1,1,1,parent);
  const round=(rad,h,c,x,y,z,parent=defaultParent)=>part(new T.CylinderGeometry(rad,rad,h,8),c,x,y,z,1,1,1,parent);
  function merge(root){
    const parts=[];
    for(const mesh of root.children){mesh.updateMatrix();const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();g.applyMatrix4(mesh.matrix);g.deleteAttribute('uv');parts.push(g);mesh.geometry.dispose();geometries.delete(mesh.geometry);}
    root.clear();const g=ownG(mergeGeometries(parts));for(const p of parts)p.dispose();root.add(new T.Mesh(g,solid));
  }
  box(34,.45,42,palette.sand,0,-.4,-2);box(32,.12,40,palette.grass,0,-.1,-2);
  box(24,.14,24,palette.stone,0,0,0);box(24,.1,3.6,palette.teal,0,.09,10.8);
  box(3.3,.1,27,palette.teal,4.1,.09,-1);
  for(let i=0;i<8;i++)box(.1,.02,1.1,palette.cream,4.1,.16,-12+i*3.2);
  for(let i=0;i<6;i++)box(1,.02,.12,palette.cream,-10+i*4,.16,11);
  for(const [x,z,h,tone]of r.buildings){
    const color=[palette.coral,palette.cream,palette.stone][tone];
    box(4.2,h,3.2,color,x,h/2,z);box(4.6,.22,3.6,palette.cream,x,h+.1,z);
    // Flat island roofs, cornices, recessed windows and balconies.
    box(4.4,.3,.16,palette.teal,x,h+.32,z+1.7);
    for(let floor=0;floor<2;floor++)for(let side=-1;side<=1;side+=2){
      const y=1.2+floor*(h-1.6)/2;box(1.18,1.05,.12,palette.teal,x+side*1.02,y,z+1.64);
      box(.84,.7,.14,colors.cabinGlass,x+side*1.02,y+.06,z+1.72);
      box(1.4,.12,.48,palette.cream,x+side*1.02,y-.59,z+1.86);
    }
    box(.8,1.45,.14,palette.teal,x,.73,z+1.7);
    box(1,.7,.9,palette.coral,x-1.1,h+.5,z-.8);
  }
  for(const [x,z]of [[7,-7],[7,0],[-11,-11],[11,7]]){
    round(.18,2.3,colors.bark,x,1,z);part(new T.IcosahedronGeometry(1.5,1),colors.leaf,x,3,z,1,1.3,1);
    part(new T.IcosahedronGeometry(1,0),colors.leafLight,x-.7,3.1,z+.2);
  }
  for(const [x,z]of [[-6,0],[7,6]]){
    box(2.8,.65,1.5,colors.carBody,x,.65,z);box(1.4,.65,1.35,colors.carGlass,x,.99,z);
    for(const dx of [-.9,.9])for(const dz of [-.7,.7])round(.32,.25,colors.tire,x+dx,.3,z+dz).rotation.x=Math.PI/2;
  }
  const [tx,,tz]=r.truckPosition;defaultParent=truckBase;
  box(5.3,1.2,2.2,r.truck,tx,1.03,tz);box(1.7,1.1,2.2,r.truck,tx+1.65,1.95,tz);
  box(1.65,.65,2.24,colors.cabinGlass,tx+1.7,2.07,tz);box(5.4,.2,2.23,palette.cream,tx,1.1,tz);
  for(const side of [-1,1])for(const dx of [-1.65,1.65]){
    const tire=round(.59,.3,colors.tire,tx+dx,.58,tz+side*1.13);tire.rotation.x=Math.PI/2;
    const hub=round(.26,.32,palette.cream,tx+dx,.58,tz+side*1.15);hub.rotation.x=Math.PI/2;
  }
  for(let i=0;i<4;i++)box(.8,.67,.07,palette.stone,tx-1.8+i*.8,1.22,tz+1.15);
  box(1.2,.2,1.7,palette.cream,tx+1.6,2.59,tz);box(.4,.23,1.4,colors.shipBlue,tx+1.6,2.8,tz);
  merge(truckBase);truckBase.children[0].geometry.translate(-tx,0,-tz);truckBase.rotation.y=Math.PI/2;truckBase.position.set(model.truck.x,0,model.truck.z);defaultParent=fixed;
  const hydrantBase=new T.Group();scene.add(hydrantBase);
  round(.24,1,r.truck,7.3,.6,10,hydrantBase);round(.37,.16,palette.cream,7.3,1.07,10,hydrantBase);
  box(1,.17,.17,r.truck,7.3,.9,10,hydrantBase);merge(hydrantBase);
  const nozzle=new T.Vector3(),hoseStart=new T.Vector3();let handHose=false;
  merge(fixed);
  const hoseArray=new Float32Array(9),hoseGeometry=ownG(new T.BufferGeometry());hoseGeometry.setAttribute('position',new T.BufferAttribute(hoseArray,3));const hydrantHose=new T.Line(hoseGeometry,ownM(new T.LineBasicMaterial({color:balance.hydrant.hoseColor})));scene.add(hydrantHose);
  const cannon=new T.Group(),barrel=new T.Group(),cannonMuzzle=new T.Object3D();scene.add(cannon);cannon.add(barrel);
  const cap=new T.Group();cannon.add(cap);round(.4,.25,colors.cannon,0,0,0,cap);merge(cap);
  // The barrel is a separate pivot; no geometry is made when its aim changes.
  box(.2,.2,balance.vehicle.muzzleLength,colors.nozzle,0,balance.vehicle.muzzleHeight,-balance.vehicle.muzzleLength/2,barrel);
  merge(barrel);cannonMuzzle.position.set(0,balance.vehicle.muzzleHeight,-balance.vehicle.muzzleLength);barrel.add(cannonMuzzle);

  function person(helmet=false){
    const group=new T.Group();box(.55,.72,.36,helmet?colors.uniform:palette.coral,0,.94,0,group);
    part(new T.IcosahedronGeometry(.26,1),colors.skin,0,1.6,0,1,1,1,group);
    for(const side of [-1,1]){box(.18,.55,.23,palette.teal,side*.18,.32,0,group);box(.17,.65,.2,colors.skin,side*.38,.96,0,group);}
    if(helmet){round(.34,.17,colors.helmet,0,1.84,0,group);box(.75,.06,.57,colors.helmet,0,1.77,0,group);}
    else part(new T.IcosahedronGeometry(.28,0),colors.bark,0,1.73,-.05,1,.55,1,group);
    merge(group);scene.add(group);return group;
  }
  const firefighter=person(true);firefighter.position.fromArray(r.avatarPosition);
  const citizens=model.rescues.map(rescue=>{const personRoot=person();personRoot.position.fromArray(rescue.world);return personRoot;});
  const ladder=new T.Group();scene.add(ladder);
  for(const side of [-1,1])box(.09,1,.1,palette.cream,side*.3,.5,0,ladder);
  for(let i=0;i<18;i++)box(.67,.016,.09,palette.stone,0,i/18,0,ladder);
  merge(ladder);ladder.position.set(tx,2,tz);ladder.visible=false;

  function texture(flame){
    let tex;
    if(globalThis.document){
      const c=document.createElement('canvas');c.width=c.height=64;const p=c.getContext('2d');
      if(flame){const g=p.createRadialGradient(32,43,2,32,35,31);g.addColorStop(0,'#fffbe0');g.addColorStop(.28,'#fff087');g.addColorStop(.58,'#ff982c');g.addColorStop(1,'#ff510000');p.fillStyle=g;p.beginPath();p.moveTo(8,59);p.bezierCurveTo(-1,38,29,22,34,0);p.bezierCurveTo(42,32,61,38,56,59);p.closePath();p.fill();}
      else{const g=p.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffffb0');g.addColorStop(1,'#ffffff00');p.fillStyle=g;p.fillRect(0,0,64,64);}
      tex=new T.CanvasTexture(c);
    }else tex=new T.Texture();
    textures.add(tex);tex.colorSpace=T.SRGBColorSpace;return tex;
  }
  const plane=ownG(new T.PlaneGeometry(1,1)),flameMat=ownM(new T.MeshBasicMaterial({map:texture(true),transparent:true,depthWrite:false}));
  const glowMat=ownM(new T.MeshBasicMaterial({map:texture(false),color:balance.fireTypes[0].color,transparent:true,depthWrite:false,opacity:.18,blending:T.AdditiveBlending}));
  const smokeMat=ownM(new T.MeshBasicMaterial({map:texture(false),transparent:true,depthWrite:false,opacity:.5}));
  function instances(g,mat,count){const mesh=new T.InstancedMesh(g,mat,count);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);return mesh;}
  const glow=instances(plane,glowMat,model.flames.length);
  const flames=instances(plane,flameMat,model.flames.length*r.flameLobes),smoke=instances(plane,smokeMat,model.flames.length*r.smokePerSite+model.rescues.length);
  const ash=instances(ownG(new T.IcosahedronGeometry(.04,0)),ownM(new T.MeshBasicMaterial({color:colors.embers})),model.flames.length*r.ashPerSite);
  const drops=instances(ownG(new T.IcosahedronGeometry(.07,0)),ownM(new T.MeshBasicMaterial({color:r.water})),r.splashCount);
  // Tube topology is immutable; only its warmed vertex array changes each frame.
  const streamG=ownG(new T.BufferGeometry()),streamArray=new Float32Array((r.streamSegments+1)*r.streamSides*3),indices=[];
  for(let i=0;i<r.streamSegments;i++)for(let j=0;j<r.streamSides;j++){const a=i*r.streamSides+j,b=i*r.streamSides+(j+1)%r.streamSides,c=a+r.streamSides,d=b+r.streamSides;indices.push(a,b,c,b,d,c);}
  streamG.setAttribute('position',new T.BufferAttribute(streamArray,3).setUsage(T.DynamicDrawUsage));streamG.setIndex(indices);
  const streamM=ownM(new T.MeshBasicMaterial({color:r.water,transparent:true,opacity:.85})),stream=new T.Mesh(streamG,streamM),secondStream=new T.Mesh(streamG,streamM);stream.frustumCulled=secondStream.frustumCulled=false;scene.add(stream,secondStream);
  const dummy=new T.Object3D(),point=new T.Vector3(),impact=new T.Vector3(),direction=new T.Vector3(),up=new T.Vector3(0,1,0),projected=new T.Vector3(),scratch={x:0,y:0};
  const sites=r.sites.map(world=>new T.Vector3(...world)),rescuePoints=model.rescues.map(rescue=>new T.Vector3(...rescue.world));
  const anchors=[...model.flames.map((f,i)=>({x:f.x,y:f.y,world:sites[i],rescue:null})),...model.rescues.map((rescue,i)=>({x:rescue.x,y:rescue.y,world:rescuePoints[i],rescue}))];
  function worldPoint(x,y,out){
    let nearest=null,distance=Infinity;
    for(const a of anchors){const d=Math.hypot(x-a.x,y-a.y);if(d<distance){distance=d;nearest=a;}}
    if(nearest&&distance<balance.aimRadius){out.copy(nearest.world);out.x+=(x-nearest.x)*r.worldScale;out.z+=(y-nearest.y)*r.worldScale;}
    else out.set((x-r.logicalCenter[0])*r.worldScale,0,(y-r.logicalCenter[1])*r.worldScale);
    return out;
  }
  function project(world,out){projected.copy(world).project(camera);out.x=(projected.x+1)*config.width/2;out.y=(1-projected.y)*config.height/2;return out;}
  function put(mesh,index,x,y,z,sx,sy= sx,sz=sx,billboard=false){dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);if(billboard)dummy.quaternion.copy(camera.quaternion);else dummy.quaternion.identity();dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
  function animate(){
    if(disposed)return;
    hydrantHose.visible=model.atHydrant;const hp=balance.hydrant.position;hoseArray.set([hp[0],.35,hp[2],(hp[0]+model.truck.x)/2,.12,(hp[2]+model.truck.z)/2,model.truck.x,.7,model.truck.z]);hoseGeometry.attributes.position.needsUpdate=true;
    truckBase.position.set(model.truck.x,0,model.truck.z);firefighter.position.set(model.truck.x+balance.crew.followX,0,model.truck.z+balance.crew.followZ);firefighter.rotation.y=Math.atan2(model.aim.x-model.nozzle.x,model.aim.y-model.nozzle.y);firefighter.rotation.x=model.spraying?balance.crew.sprayLean:0;
    ladder.position.set(model.truck.x,2,model.truck.z);
    worldPoint(model.aim.x,model.aim.y,impact);
    cannon.position.set(model.truck.x,balance.vehicle.cannonPivot[1],model.truck.z);
    const dx=impact.x-cannon.position.x,dz=impact.z-cannon.position.z;
    cannon.rotation.y=Math.atan2(-dx,-dz);barrel.rotation.x=Math.atan2(impact.y-cannon.position.y,Math.hypot(dx,dz));
    if(truckVisual){truckVisual.root.position.set(model.truck.x,0,model.truck.z);truckVisual.turret.rotation.y=cannon.rotation.y+T.MathUtils.degToRad(balance.vehicle.cannonYawOffset);truckVisual.root.updateMatrixWorld(true);truckVisual.muzzle.getWorldPosition(nozzle);}
    else{cannon.updateMatrixWorld(true);cannonMuzzle.getWorldPosition(nozzle);}
    let flameAt=0,smokeAt=0,ashAt=0;
    for(let i=0;i<model.flames.length;i++){
      const f=model.flames[i],site=sites[i],alive=f.active&&f.heat>0&&!f.warning;
      const tier=f.heat<r.heatThresholds[0]?0:f.heat<r.heatThresholds[1]?1:2,scale=alive?r.heatScales[tier]:0;
      put(glow,i,site.x,site.y+scale,site.z+.1,scale*2.7,scale*3.2,1,true);
      for(let j=0;j<r.flameLobes;j++){const wave=.85+.15*Math.sin(model.time*9+f.phase+j);put(flames,flameAt++,site.x+(j-1)*.37,site.y+scale,site.z,scale*1.15,scale*3.2*wave,1,true);}
      for(let j=0;j<r.smokePerSite;j++){const age=(model.time*.35+j/r.smokePerSite+f.phase)%1;put(smoke,smokeAt,site.x+Math.sin(age*4)*.5,site.y+1+age*3,site.z,alive?1+age*1.7:0,alive?1+age*1.7:0,1,true);smoke.setColorAt(smokeAt++,newColorSmoke);}
      for(let j=0;j<r.ashPerSite;j++){const age=(model.time*.8+j/r.ashPerSite+f.phase)%1;put(ash,ashAt++,site.x+Math.sin(j*4+age)*.65,site.y+age*3,site.z,alive?(1-age)*1.6:0);}
    }
    let ladderTarget=null;
    for(let i=0;i<model.rescues.length;i++){
      const rescue=model.rescues[i],citizen=citizens[i],start=rescuePoints[i];
      citizen.visible=!rescue.expired&&(!rescue.rescued||rescue.descent<1);
      citizen.position.copy(start);
      if(rescue.rescued){citizen.position.lerp(ladder.position,rescue.descent);citizen.position.y-=.8*rescue.descent;}
      if(rescue.progress>0&&!rescue.expired&&(!rescue.rescued||rescue.descent<1))ladderTarget=i;
      const age=1-rescue.feedback/rescue.feedbackSeconds;
      put(smoke,smokeAt,start.x,start.y+age*2,start.z,rescue.expired&&rescue.feedback>0?1+age*2:0,2,1,true);smoke.setColorAt(smokeAt++,newColorSmoke);
    }
    ladder.visible=true;
    if(ladderTarget!==null){const rescue=model.rescues[ladderTarget];direction.copy(rescuePoints[ladderTarget]).sub(ladder.position);const length=direction.length();ladder.quaternion.setFromUnitVectors(up,direction.normalize());ladder.scale.set(1,length*Math.min(1,rescue.progress/rescue.seconds),1);}else{ladder.rotation.set(-Math.PI/2,0,0);ladder.scale.set(1,3.7,1);}
    worldPoint(model.impact.x,model.impact.y,impact);
    stream.visible=model.spraying;secondStream.visible=model.spraying&&model.extraHose>0;secondStream.position.x=.45;
    if(model.spraying){
      const radius=r.streamRadius*Math.max(.25,model.pressure)*(1+model.charge);
      for(let i=0;i<=r.streamSegments;i++){const t=i/r.streamSegments,u=1-t,cx=u*(handHose?hoseStart.x:nozzle.x)+t*impact.x,cy=u*(handHose?hoseStart.y:nozzle.y)+t*impact.y+4*u*t*r.streamRise,cz=u*(handHose?hoseStart.z:nozzle.z)+t*impact.z;
        for(let j=0;j<r.streamSides;j++){const angle=j/r.streamSides*Math.PI*2,index=(i*r.streamSides+j)*3;streamArray[index]=cx+Math.cos(angle)*radius;streamArray[index+1]=cy+Math.sin(angle)*radius;streamArray[index+2]=cz;}}
      streamG.attributes.position.needsUpdate=true;
    }
    drops.visible=model.spraying;
    for(let i=0;i<r.splashCount;i++){const age=(model.time*2.5+i/r.splashCount)%1,angle=i*2.4;put(drops,i,impact.x+Math.cos(angle)*age*.9,impact.y+Math.sin(age*Math.PI)*.8,impact.z+Math.sin(angle)*age*.9,(1-age)*1.3);}
    // Steam shares the smoke pool and uses the exact model impact.
    if(model.spraying)for(let i=0;i<model.flames.length;i++)if(model.flames[i].heat>0&&Math.hypot(model.flames[i].x-model.impact.x,model.flames[i].y-model.impact.y)<=model.aimRadius){put(smoke,i*r.smokePerSite,impact.x,impact.y+1,impact.z,1.4,1.8,1,true);smoke.setColorAt(i*r.smokePerSite,newColorSteam);}
    for(const mesh of [flames,glow,smoke,ash,drops])mesh.instanceMatrix.needsUpdate=true;
    smoke.instanceColor.needsUpdate=true;
  }
  const newColorSmoke=new T.Color(r.smoke),newColorSteam=new T.Color(colors.pearl);
  function dispose(){if(disposed)return;disposed=true;truckVisual?.dispose();models.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();if(t.image?.getContext)t.image.width=t.image.height=0;}scene.clear();geometries.clear();materials.clear();textures.clear();}
  function metrics(){let triangles=0,drawCalls=0;scene.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);drawCalls+=Array.isArray(o.material)?o.material.length:1;});return {triangles,drawCalls,geometries:geometries.size,materials:materials.size,textures:textures.size,disposed};}
  animate();
  return {scene,camera,firefighter,truckBase,cannon,nozzle,setHoseStart(v){handHose=Boolean(v);if(v)hoseStart.copy(v);},
    async loadHydrant(){const spec=balance.hydrant;if(!await models.load(spec)||disposed)return false;const visual=models.create(spec,{height:spec.height});if(!visual)return false;visual.position.fromArray(spec.position);scene.add(visual);hydrantVisual=visual;hydrantBase.visible=false;return true;},
    hydrantMetrics(){return {loaded:Boolean(hydrantVisual),art:models.metrics()};},
    setTruck(visual){if(disposed){visual.dispose();return false;}scene.add(visual.root);if(metrics().triangles>r.maxTriangles||metrics().drawCalls>r.maxDrawCalls||visual.cannonFaces===0){visual.dispose();return false;}truckVisual=visual;truckBase.visible=cannon.visible=false;return true;},
    truckMetrics(){return {loaded:Boolean(truckVisual),cannonFaces:truckVisual?.cannonFaces||0,yaw:truckVisual?.turret.rotation.y??cannon.rotation.y,muzzle:{x:nozzle.x,y:nozzle.y,z:nozzle.z},hydrantHose:model.atHydrant,hoseEnd:{x:model.truck.x,z:model.truck.z}};},worldPoint,project,animate,metrics,dispose,anchors,point,scratch};
}

/** Same two-stage degradation contract as naval-view; the model never changes. */
export function createFireView(ctx,model,createRenderer=options=>new T.WebGLRenderer(options)) {
  const r=ctx.balance.render,canvas=globalThis.document?.createElement('canvas');
  let renderer;
  try{renderer=createRenderer({canvas,antialias:false,alpha:false,powerPreference:'low-power'});}catch{return null;}
  const surface=renderer.domElement||canvas;
  let world,disposed=false,low=false,failed=false,avatar,avatarReady=false,lastTime=model.time,avatarResourcesDisposed=false;
  function disposeAvatar(){if(!avatar||avatarResourcesDisposed)return;avatarResourcesDisposed=Boolean(avatar.root);avatar.mixer?.stopAllAction();if(avatar.root)avatar.mixer?.uncacheRoot(avatar.root);avatar.holder.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});avatar.holder.removeFromParent();}
  const onLost=event=>{event.preventDefault();failed=true;dispose();};
  function dispose(){if(disposed)return;disposed=true;surface.removeEventListener('webglcontextlost',onLost);disposeAvatar();world?.dispose();renderer.dispose();renderer.forceContextLoss();surface.width=surface.height=0;}
  try{
    renderer.setPixelRatio(r.dpr);renderer.setSize(r.width,r.height,false);renderer.outputColorSpace=T.SRGBColorSpace;
    world=createFireScene(ctx,model);surface.addEventListener('webglcontextlost',onLost);
    if(globalThis.document){
      void loadFireTruck(ctx.balance).then(visual=>{if(visual)world.setTruck(visual);}).catch(()=>{});
      void world.loadHydrant();
      avatar=new Avatar(world.scene);avatar.holder.position.fromArray(r.avatarPosition);avatar.holder.scale.setScalar(r.avatarScale);avatar.holder.visible=false;
      // Reuse the island loader and rig; never copy city character logic here.
      void avatar.load({shirtColor:ctx.config.visuals.palette.uniform,pantsColor:palette.teal,hairstyle:'short'}).then(()=>{
        if(disposed||low){disposeAvatar();return;}
        if(world.metrics().triangles>r.maxTriangles||world.metrics().drawCalls>r.maxDrawCalls){disposeAvatar();return;}
        const head=avatar.root.getObjectByName('Head');if(head){const helmet=new T.Mesh(new T.SphereGeometry(.36,10,6),new T.MeshStandardMaterial({color:ctx.config.visuals.palette.helmet}));helmet.scale.y=.4;helmet.position.y=.24;head.add(helmet);}const chest=avatar.root.getObjectByName('Chest');if(chest){const stripe=new T.Mesh(new T.BoxGeometry(.7,.08,.12),new T.MeshBasicMaterial({color:0xffff99}));stripe.position.set(0,.2,.22);chest.add(stripe);}
        avatarReady=true;avatar.holder.visible=true;world.firefighter.visible=false;
      }).catch(()=>{disposeAvatar();});
    }
  }catch{failed=true;dispose();return null;}
  const pointer=new T.Vector2(),ray=new T.Raycaster(),ground=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3(),point=new T.Vector3(),screen={x:0,y:0};
  const view={get mode(){return failed?'canvas':'three';},
    metrics(){return {...world.metrics(),low,avatarLoaded:avatarReady,avatarPosition:avatarReady?{x:avatar.holder.position.x,y:avatar.holder.position.y,z:avatar.holder.position.z}:null,rendererTriangles:renderer.info?.render.triangles||0,rendererDrawCalls:renderer.info?.render.calls||0,truck:world.truckMetrics(),hydrant:world.hydrantMetrics()};},
    degrade(fallback=false){if(disposed)return;if(fallback){failed=true;dispose();}else if(!low){low=true;renderer.setSize(r.width*r.resolutionScale,r.height*r.resolutionScale,false);if(avatar){disposeAvatar();avatarReady=false;world.firefighter.visible=true;}}},dispose,
    resize(w=ctx.config.width,h=ctx.config.height){if(disposed)return;renderer.setSize(w*(low?r.resolutionScale:1),h*(low?r.resolutionScale:1),false);world.camera.aspect=w/h;const factor=Math.max(1,(r.width/r.height)/(w/h));world.camera.position.fromArray(r.camera);world.camera.position.sub(new T.Vector3(...r.lookAt)).multiplyScalar(factor).add(new T.Vector3(...r.lookAt));world.camera.lookAt(...r.lookAt);world.camera.updateProjectionMatrix();},
    projectTarget(x,y){if(disposed)return null;world.worldPoint(x,y,point);world.project(point,screen);return {x:screen.x,y:screen.y};},
    truckScreen(){if(disposed)return null;point.set(model.truck.x,1.5,model.truck.z);world.project(point,screen);return {x:screen.x,y:screen.y};},
    isTruckAt(x,y){if(disposed)return undefined;const pos=view.truckScreen();return Math.hypot(x-pos.x,y-pos.y)<ctx.balance.vehicle.hitRadius;},
    truckTargetAt(x,y){if(disposed)return null;pointer.set(x/ctx.config.width*2-1,1-y/ctx.config.height*2);ray.setFromCamera(pointer,world.camera);if(!ray.ray.intersectPlane(ground,hit))return null;return {x:hit.x,z:hit.z};},
    targetAt(x,y){
      if(disposed)return null;
      let nearest=null,distance=r.targetRadius;
      for(const a of world.anchors){if(a.rescue&&(a.rescue.expired||a.rescue.rescued))continue;world.project(a.world,screen);const d=Math.hypot(x-screen.x,y-screen.y);if(d<distance){distance=d;nearest=a;}}
      if(nearest)return {x:nearest.x,y:nearest.y};
      pointer.set(x/ctx.config.width*2-1,1-y/ctx.config.height*2);ray.setFromCamera(pointer,world.camera);
      if(!ray.ray.intersectPlane(ground,hit))return null;
      return {x:hit.x/r.worldScale+r.logicalCenter[0],y:hit.z/r.worldScale+r.logicalCenter[1]};
    },
    draw(p){
      if(disposed||failed)return false;
      try{
        if(avatarReady){const delta=Math.max(0,model.time-lastTime),driving=Math.hypot(model.truck.targetX-model.truck.x,model.truck.targetZ-model.truck.z)>.05;avatar.play(driving);avatar.mixer?.update(delta);avatar.holder.position.set(model.truck.x+ctx.balance.crew.followX,driving?1.1:0,model.truck.z+ctx.balance.crew.followZ);world.worldPoint(model.aim.x,model.aim.y,point);avatar.holder.rotation.y=Math.atan2(point.x-avatar.holder.position.x,point.z-avatar.holder.position.z);avatar.holder.rotation.x=model.atHydrant&&model.connection<ctx.balance.hydrant.connectSeconds?ctx.balance.crew.connectLean:model.spraying?ctx.balance.crew.sprayLean:0;const rescue=model.rescues.find(r=>r.progress>0&&(!r.rescued||r.descent<1));if(rescue){const u=rescue.rescued?1-rescue.descent:rescue.progress/rescue.seconds;point.fromArray(rescue.world);avatar.holder.position.lerp(point,u);}for(const side of ['L','R']){const arm=avatar.root.getObjectByName('UpperArm_'+side),fore=avatar.root.getObjectByName('LowerArm_'+side);if(arm&&(model.spraying||model.atHydrant||rescue)){arm.rotation.x-=ctx.balance.crew.armRaise;arm.rotation.z+=(side==='L'?1:-1)*ctx.balance.crew.sprayLean;}if(fore&&(model.spraying||model.atHydrant))fore.rotation.x-=ctx.balance.crew.forearmBend;}avatar.root.getObjectByName('Ball')?.traverse(o=>o.visible=false);avatar.holder.updateMatrixWorld(true);const hand=avatar.root.getObjectByName('Hand_R');if(hand){hand.getWorldPosition(point);world.setHoseStart(point);}}else world.setHoseStart(null);world.animate();lastTime=model.time;
        renderer.render(world.scene,world.camera);p.drawImage(surface,0,0,ctx.config.width,ctx.config.height);
        const {palette:colors}=ctx.config.visuals;p.font=r.markerFont;p.textAlign='center';
        for(const f of model.flames){if(!f.active)continue;world.worldPoint(f.x,f.y,point);point.y+=1.8;world.project(point,screen);
          if(f.warning>0){p.globalAlpha=.4+.6*Math.abs(Math.sin(model.time*14));p.strokeStyle=colors.embers;p.lineWidth=3;p.beginPath();p.arc(screen.x,screen.y+15,16,0,Math.PI*2);p.stroke();p.globalAlpha=1;}
          else if(f.heat>0){p.fillStyle=palette.teal;p.fillRect(screen.x-r.barWidth/2,screen.y,r.barWidth,r.barHeight);p.fillStyle=f.heat>r.heatThresholds[1]?ctx.balance.fireTypes[0].color:colors.gold;p.fillRect(screen.x-r.barWidth/2,screen.y,r.barWidth*f.heat,r.barHeight);}
        }
        if(model.hintId){point.set(model.truck.x,3.5,model.truck.z);world.project(point,screen);p.fillStyle=colors.white;p.fillText(ctx.t(model.hintId),Math.max(70,Math.min(ctx.config.width-70,screen.x)),Math.max(80,screen.y));}
        for(const rescue of model.rescues){if(rescue.expired)continue;point.fromArray(rescue.world);point.y+=2.2;world.project(point,screen);
          if(!rescue.rescued){p.fillStyle=colors.white;p.fillText(ctx.t('minigame.rescueMarker'),screen.x,screen.y);p.fillStyle=palette.teal;p.fillRect(screen.x-r.timerWidth/2,screen.y+5,r.timerWidth,4);p.fillStyle=colors.white;p.fillRect(screen.x-r.timerWidth/2,screen.y+5,r.timerWidth*rescue.remaining/rescue.timeoutSeconds,4);}
          else if(rescue.feedback>0){p.fillStyle=r.success;p.fillText(ctx.t('minigame.rescueHeart'),screen.x,screen.y-rescue.descent*12);}
        }
        if(model.water/model.maxWater<=ctx.balance.hydrant.lowWaterRatio){point.fromArray(ctx.balance.hydrant.position);point.y+=2;world.project(point,screen);p.fillStyle=ctx.balance.hydrant.hoseColor;p.fillText(ctx.t('minigame.hydrantArrow'),Math.max(30,Math.min(ctx.config.width-30,screen.x)),Math.max(100,Math.min(ctx.config.height-25,screen.y)));}
        world.worldPoint(model.aim.x,model.aim.y,point);world.project(point,screen);p.strokeStyle=model.rescuing?r.success:colors.streamSpray;p.lineWidth=2;p.beginPath();p.arc(screen.x,screen.y,13,0,Math.PI*2);p.stroke();p.fillStyle=colors.pearl;p.fillRect(screen.x-2,screen.y-2,4,4);
        return true;
      }catch{failed=true;dispose();return false;}
    }
  };return view;
}

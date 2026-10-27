import {createUltraFireCity} from './ultra-fire-city.mjs';
import {createUltraFireEffects} from './ultra-fire-effects.mjs';
import {createUltraFireScenery} from './ultra-fire-scenery.mjs';
import {fireScreenMovement} from './fire-navigation.mjs?v=island-easy-city-20261027-1';
import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {palette} from '../view/environment.mjs?v=island-easy-city-20261027-1';
import {loadFireTruck} from './fire-truck.mjs?v=island-easy-city-20261027-1';
import {drawWaterDrop,drawFireArrow,drawFireFeedback,pickFireObjective} from './fire-canvas.mjs?v=island-easy-city-20261027-1';
import {LocalModels,fitModel} from '../view/local-models.mjs?v=island-easy-city-20261027-1';
import {cloneFireCharacter,createFireCrewRig} from './fire-crew.mjs?v=island-easy-city-20261027-1';

/** Own everything in this round. Static colored parts share a material and are
 * merged at setup; particles, stream vertices and scratch vectors are fixed. */
export function createFireScene(ctx,model,adapters={}) {
  const {config,balance}=ctx,r=balance.render,colors=config.visuals.palette;
  const scene=new T.Scene(),geometries=new Set(),materials=new Set(),textures=new Set();
  let disposed=false,truckVisual=null,hydrantVisual=null,crewVisual=null,crewRig=null;const cityVisuals=[],citizenVisuals=[];
  const models=new LocalModels(adapters),loader=models.loader;
  models.loader={async loadAsync(url){const asset=await loader.loadAsync(url);asset.scene.animations=asset.animations||[];return asset;}};
  const ownG=g=>(geometries.add(g),g),ownM=m=>(materials.add(m),m);
  const solid=ownM(new T.MeshStandardMaterial({vertexColors:true,roughness:.82}));
  scene.background=new T.Color('#b1bdbe');scene.fog=new T.Fog('#b1bdbe',65,125);
  scene.add(new T.HemisphereLight('#dfe9ed','#5b6453',1.45));
  const sun=new T.DirectionalLight('#ffe4bc',2.6);sun.position.set(-24,38,18);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:110});sun.shadow.bias=-.00045;sun.shadow.normalBias=.06;sun.shadow.radius=2;scene.add(sun,sun.target);
  const rim=new T.DirectionalLight('#c6dce9',.65);rim.position.set(20,16,-25);scene.add(rim);
  const camera=new T.OrthographicCamera(-balance.city.extent/2,balance.city.extent/2,20,-20,.1,180);
  const focus=new T.Vector3(model.truck.x,0,model.truck.z);let lastAnimate=model.time;
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
  const city=balance.city,cityColors=city.colors;
  const cityArt=createUltraFireCity(scene,city),lotBases=cityArt.lots;
  const scenery=createUltraFireScenery({scene,adapters,canAdd:()=>{const m=metrics();return m.triangles<=r.maxTriangles&&m.drawCalls<=r.maxDrawCalls;}});
  // Window frames follow the changing floor; the first two stay visibly paired.
  const windows=model.ladder.targets.map(target=>{const moving=model.ladder.mode==='moving',group=moving?new T.Group():fixed;if(moving)scene.add(group);const [wx,wy,wz]=moving?[0,0,0]:target.world;
    box(1.2,1.6,.12,palette.teal,wx,wy+.7,wz,group);for(const side of [-1,1])box(.1,1.8,.2,palette.cream,wx+side*.65,wy+.7,wz+.05,group);box(1.5,.14,.5,palette.cream,wx,wy-.12,wz+.15,group);box(1.5,.1,.2,palette.cream,wx,wy+1.55,wz+.05,group);if(moving){merge(group);group.position.fromArray(target.world);return group;}return null;});
  const tx=0,tz=0;defaultParent=truckBase;
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
  for(const [x,,z]of city.hydrants){round(.4,1.65,'#dd302a',x,.95,z,hydrantBase);round(.5,.28,'#e84a37',x,1.85,z,hydrantBase);box(1.5,.3,.3,'#dd302a',x,1.35,z,hydrantBase);}merge(hydrantBase);
  for(const [x,,z]of city.hydrants){const mesh=part(new T.RingGeometry(balance.hydrant.radius-.16,balance.hydrant.radius,48),'#168fff',x,.16,z);mesh.rotation.x=-Math.PI/2;}
  const nozzle=new T.Vector3(),hoseStart=new T.Vector3();let handHose=false;
  merge(fixed);
  const hoseArray=new Float32Array(12*6*3),hoseGeometry=ownG(new T.BufferGeometry()),hoseIndices=[];
  for(let i=0;i<11;i++)for(let j=0;j<6;j++){const a=i*6+j,b=i*6+(j+1)%6;hoseIndices.push(a,b,a+6,b,b+6,a+6);}
  hoseGeometry.setAttribute('position',new T.BufferAttribute(hoseArray,3).setUsage(T.DynamicDrawUsage));hoseGeometry.setIndex(hoseIndices);const hydrantHose=new T.Mesh(hoseGeometry,ownM(new T.MeshBasicMaterial({color:balance.hydrant.hoseColor})));hydrantHose.frustumCulled=false;scene.add(hydrantHose);
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
  const firefighter=person(true);firefighter.position.set(model.truck.x,0,model.truck.z);
  const beacons=new T.Group();scene.add(beacons);const beaconLights=[new T.PointLight('#5bafff',0,5,2),new T.PointLight('#ff6147',0,5,2)];for(let i=0;i<2;i++){beaconLights[i].position.set(i? .52:-.52,2.2,-1.25);beacons.add(beaconLights[i]);}
  for(const side of [-1,1]){const lamp=new T.Mesh(ownG(new T.SphereGeometry(.18,8,4)),ownM(new T.MeshBasicMaterial({color:side<0?'#74d8ff':'#ff7368'})));lamp.position.set(side*.52,2.2,-1.25);beacons.add(lamp);}
  const attackArray=new Float32Array(12*6*3),attackG=ownG(new T.BufferGeometry()),attackIndices=[];
  for(let i=0;i<11;i++)for(let j=0;j<6;j++){const a=i*6+j,b=i*6+(j+1)%6;attackIndices.push(a,b,a+6,b,b+6,a+6);}
  attackG.setAttribute('position',new T.BufferAttribute(attackArray,3).setUsage(T.DynamicDrawUsage));attackG.setIndex(attackIndices);
  const attackHose=new T.Mesh(attackG,ownM(new T.MeshBasicMaterial({color:balance.crew.hoseColor})));attackHose.frustumCulled=false;scene.add(attackHose);
  const citizens=model.rescues.map(rescue=>{const personRoot=person();personRoot.position.fromArray(rescue.world);return personRoot;});
  const ladder=new T.Group();scene.add(ladder);
  for(const side of [-1,1])box(.13,1,.13,'#eff8ff',side*.4,.5,0,ladder);
  for(let i=0;i<18;i++)box(.93,.022,.12,'#88a1ad',0,i/18,0,ladder);
  merge(ladder);ladder.children[0].material=ownM(new T.MeshStandardMaterial({vertexColors:true,metalness:.65,roughness:.3}));ladder.children[0].castShadow=true;ladder.position.set(tx,2.8,tz);

  const ultraEffects=createUltraFireEffects({scene,model,balance});
  // Tube topology is immutable; only its warmed vertex array changes each frame.
  const streamG=ownG(new T.BufferGeometry()),streamArray=new Float32Array((r.streamSegments+1)*r.streamSides*3),indices=[];
  for(let i=0;i<r.streamSegments;i++)for(let j=0;j<r.streamSides;j++){const a=i*r.streamSides+j,b=i*r.streamSides+(j+1)%r.streamSides,c=a+r.streamSides,d=b+r.streamSides;indices.push(a,b,c,b,d,c);}
  streamG.setAttribute('position',new T.BufferAttribute(streamArray,3).setUsage(T.DynamicDrawUsage));streamG.setIndex(indices);
  const streamM=ownM(new T.MeshBasicMaterial({color:'#c5ecf7',transparent:true,opacity:.78})),stream=new T.Mesh(streamG,streamM),secondStream=new T.Mesh(streamG,streamM);stream.frustumCulled=secondStream.frustumCulled=false;scene.add(stream,secondStream);
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
    hydrantHose.visible=model.atHydrant;for(let i=0;i<windows.length;i++)windows[i]?.position.fromArray(model.ladder.targets[i].world);for(let i=0;i<rescuePoints.length;i++)rescuePoints[i].fromArray(model.rescues[i].world);const hp=[...city.hydrants].sort((a,b)=>Math.hypot(a[0]-model.truck.x,a[2]-model.truck.z)-Math.hypot(b[0]-model.truck.x,b[2]-model.truck.z))[0];for(let i=0;i<12;i++){const t=i/11,u=1-t,x=hp[0]*u+model.truck.x*t,z=hp[2]*u+model.truck.z*t+Math.sin(t*Math.PI)*.7,y=.7-Math.sin(t*Math.PI)*.5;for(let j=0;j<6;j++){const at=(i*6+j)*3,angle=j/6*Math.PI*2;hoseArray[at]=x;hoseArray[at+1]=y+Math.cos(angle)*.09;hoseArray[at+2]=z+Math.sin(angle)*.09;}}hoseGeometry.attributes.position.needsUpdate=true;
    const elapsed=Math.max(0,model.time-lastAnimate);lastAnimate=model.time;
    const ladderFocus=model.ladder.engaged||model.ladder.extension>0,targetX=ladderFocus?model.truck.x:model.camera.x,targetZ=ladderFocus?(model.truck.z+(model.ladder.target?.world[2]??model.truck.z))/2:model.camera.z;
    const blend=1-Math.exp(-city.cameraFollow*elapsed);if(ladderFocus){focus.x+=(targetX-focus.x)*blend;focus.z+=(targetZ-focus.z)*blend;}else{focus.x=targetX;focus.z=targetZ;}
    camera.zoom+=((ladderFocus?1.45:1.08)-camera.zoom)*blend;camera.updateProjectionMatrix();
    camera.position.set(focus.x,city.cameraHeight*.82,focus.z+city.cameraBack*1.3);point.set(focus.x,0,focus.z-2.4);camera.lookAt(point);camera.updateMatrixWorld();
    truckBase.position.set(model.truck.x,0,model.truck.z);truckBase.rotation.y=Math.PI/2+model.truck.yaw;
    firefighter.position.set(model.firefighter.x,0,model.firefighter.z);firefighter.visible=model.firefighter.visible&&!crewVisual;firefighter.rotation.y=Math.atan2(model.aim.x-model.nozzle.x,model.aim.y-model.nozzle.y);firefighter.rotation.x=model.spraying?balance.crew.sprayLean:0;
    if(crewVisual){crewVisual.visible=model.firefighter.visible;crewVisual.position.copy(firefighter.position);crewVisual.rotation.copy(firefighter.rotation);crewVisual.scale.y=1;crewRig?.update(elapsed,model.firefighter.state==='exiting');}
    beacons.visible=model.truck.driving||model.spraying||model.refilling||model.ladder.extension>0;beacons.position.set(model.truck.x,0,model.truck.z);beacons.rotation.y=model.truck.yaw;for(let i=0;i<beacons.children.length;i++){const pulse=Math.max(0,Math.sin(model.time*7+i*Math.PI));if(beacons.children[i].isLight)beacons.children[i].intensity=beacons.visible?pulse*5:0;else beacons.children[i].scale.setScalar(.7+pulse*.5);}
    attackHose.visible=model.hose.connected;
    const hs=model.hose.start;let he=model.hose.end;
    if(crewRig&&model.hose.connected&&crewRig.hand(hoseStart))he=hoseStart;
    if(hs&&he){for(let i=0;i<12;i++){const t=i/11,u=1-t,x=hs.x*u+he.x*t,z=hs.z*u+he.z*t+Math.sin(t*Math.PI)*.8,y=(hs.y*u+he.y*t)*(1-Math.sin(t*Math.PI)*.85);for(let j=0;j<6;j++){const at=(i*6+j)*3,angle=j/6*Math.PI*2;attackArray[at]=x;attackArray[at+1]=y+Math.cos(angle)*.07;attackArray[at+2]=z+Math.sin(angle)*.07;}}attackG.attributes.position.needsUpdate=true;}
    if(model.hose.connected){hoseStart.set(he.x,he.y,he.z);handHose=true;}else handHose=false;
    ladder.position.set(model.truck.x,2.8,model.truck.z);
    worldPoint(model.aim.x,model.aim.y,impact);
    cannon.position.set(model.truck.x,balance.vehicle.cannonPivot[1],model.truck.z);
    const dx=impact.x-cannon.position.x,dz=impact.z-cannon.position.z;
    cannon.rotation.y=Math.atan2(-dx,-dz);barrel.rotation.x=Math.atan2(impact.y-cannon.position.y,Math.hypot(dx,dz));
    if(truckVisual){truckVisual.root.position.set(model.truck.x,0,model.truck.z);truckVisual.root.rotation.y=model.truck.yaw+T.MathUtils.degToRad(balance.vehicle.headingOffset);for(const wheel of truckVisual.wheels||[])wheel.rotation.x=model.truck.wheelRotation;truckVisual.turret.rotation.y=cannon.rotation.y-truckVisual.root.rotation.y+T.MathUtils.degToRad(balance.vehicle.cannonYawOffset);truckVisual.root.updateMatrixWorld(true);truckVisual.muzzle.getWorldPosition(nozzle);}
    else{cannon.updateMatrixWorld(true);cannonMuzzle.getWorldPosition(nozzle);}
    for(let i=0;i<model.rescues.length;i++){
      const rescue=model.rescues[i],citizen=citizenVisuals[i]||citizens[i],start=rescuePoints[i];
      citizens[i].visible=!citizenVisuals[i];
      citizen.visible=!rescue.expired&&(!rescue.rescued||rescue.descent<1);
      citizen.position.copy(start);citizen.rotation.z=!rescue.rescued?Math.sin(model.time*2+i)*.08:0;
      if(rescue.rescued){citizen.position.lerp(ladder.position,rescue.descent);citizen.position.y-=.8*rescue.descent;}

    }
    ladder.visible=true;
    const target=model.ladder.target,extension=model.ladder.extension;
    if(target&&extension>0){direction.set(target.world[0]+model.ladder.sway*2,target.world[1]+.85,target.world[2]).sub(ladder.position);const length=direction.length();ladder.quaternion.setFromUnitVectors(up,direction.normalize());ladder.scale.set(1,length*extension,1);}
    else{ladder.rotation.set(-Math.PI/2,0,model.truck.yaw);ladder.scale.set(1,3.7,1);}

    worldPoint(model.impact.x,model.impact.y,impact);
    stream.visible=model.spraying;secondStream.visible=model.spraying&&model.extraHose>0;secondStream.position.x=.45;
    if(model.spraying){
      const radius=r.streamRadius*1.45*Math.max(.25,model.pressure)*(1+model.charge);
      for(let i=0;i<=r.streamSegments;i++){const t=i/r.streamSegments,u=1-t,cx=u*(handHose?hoseStart.x:nozzle.x)+t*impact.x,cy=u*(handHose?hoseStart.y:nozzle.y)+t*impact.y+4*u*t*r.streamRise,cz=u*(handHose?hoseStart.z:nozzle.z)+t*impact.z;
        for(let j=0;j<r.streamSides;j++){const angle=j/r.streamSides*Math.PI*2,index=(i*r.streamSides+j)*3;streamArray[index]=cx+Math.cos(angle)*radius;streamArray[index+1]=cy+Math.sin(angle)*radius;streamArray[index+2]=cz;}}
      streamG.attributes.position.needsUpdate=true;
    }
    ultraEffects.update({camera,nozzle,impact,handHose,hoseStart});
  }

  function dispose(){if(disposed)return;disposed=true;ultraEffects.dispose();cityArt.dispose();scenery.dispose();sun.shadow.map?.dispose();truckVisual?.dispose();crewRig?.dispose();const skeletons=new Set();scene.traverse(o=>{if(o.skeleton)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();models.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();if(t.image?.getContext)t.image.width=t.image.height=0;}scene.clear();geometries.clear();materials.clear();textures.clear();}
  function metrics(){let triangles=0,drawCalls=0;scene.traverseVisible(o=>{if(o.isLine||o.isPoints){drawCalls++;return;}if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);drawCalls+=Array.isArray(o.material)?o.material.length:1;});return {triangles,drawCalls,geometries:geometries.size+cityArt.metrics().geometries,materials:materials.size+cityArt.metrics().materials,textures:textures.size+cityArt.metrics().textures,disposed};}
  animate();
  return {scene,camera,firefighter,truckBase,cannon,nozzle,
    resize(w,h){const half=city.extent/2;camera.left=-half;camera.right=half;camera.top=half/(w/h);camera.bottom=-camera.top;camera.updateProjectionMatrix();},
    async loadCity(){
      for(const [i,key]of [...city.modelLots.map(i=>[i,city.buildings[i].style]),[-1,'firefighter'],...(model.rescues.length?[[-2,'citizen']]:[])]){
        const spec=city.models[key];if(disposed||!await models.load(spec)||disposed)continue;
        if(i>=0){const lot=city.buildings[i],visual=models.create(spec,{width:lot.width});if(!visual)continue;const bounds=new T.Box3().setFromObject(visual),size=bounds.getSize(new T.Vector3()),factor=Math.min(1,lot.depth/size.z,lot.height/size.y);visual.scale.multiplyScalar(factor);visual.position.set(lot.x,.16,lot.z);visual.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(visual);if(metrics().triangles>r.maxTriangles||metrics().drawCalls>r.maxDrawCalls){visual.removeFromParent();continue;}lotBases[i].visible=false;cityVisuals.push(visual);}
        else if(i===-1){const source=models.assets.get(spec.path),visual=source&&fitModel(cloneFireCharacter(source),spec,{height:city.crewHeight});if(!visual)continue;scene.add(visual);if(metrics().triangles>r.maxTriangles||metrics().drawCalls>r.maxDrawCalls){visual.removeFromParent();continue;}visual.traverse(o=>{if(o.isMesh)o.castShadow=true;});crewVisual=visual;crewRig=createFireCrewRig(visual,source.animations,city.grip);firefighter.visible=false;}
        else for(let j=0;j<model.rescues.length;j++){const source=models.assets.get(spec.path),visual=source&&fitModel(cloneFireCharacter(source),spec,{height:city.citizenHeight});if(!visual)continue;scene.add(visual);if(metrics().triangles>r.maxTriangles||metrics().drawCalls>r.maxDrawCalls){visual.removeFromParent();continue;}citizens[j].visible=false;citizenVisuals[j]=visual;}
      }
      await scenery.load();
    },
    cityMetrics(){return {buildings:cityVisuals.length,firefighterLoaded:Boolean(crewVisual),crewRigged:Boolean(crewRig),citizens:citizenVisuals.length,roads:city.roadsX.length+city.roadsZ.length,intersections:model.roads.nodes.length,crewVisible:crewVisual?.visible||firefighter.visible,hoseConnected:attackHose.visible,camera:{x:focus.x,z:focus.z},models:models.metrics(),scenery:scenery.metrics()};},
    setHoseStart(v){handHose=Boolean(v);if(v)hoseStart.copy(v);},
    async loadHydrant(){const spec=balance.hydrant;if(!await models.load(spec)||disposed)return false;const visuals=[];for(const p of city.hydrants){const visual=models.create(spec,{height:spec.height});if(!visual)continue;visual.position.fromArray(p);scene.add(visual);if(metrics().triangles>r.maxTriangles||metrics().drawCalls>r.maxDrawCalls){visual.removeFromParent();continue;}visuals.push(visual);}hydrantVisual=visuals[0];if(visuals.length===city.hydrants.length)hydrantBase.visible=false;return Boolean(hydrantVisual);},
    hydrantMetrics(){return {loaded:Boolean(hydrantVisual),height:balance.hydrant.height,ringRadius:balance.hydrant.radius,connected:model.atHydrant,art:models.metrics()};},
    setTruck(visual){if(disposed){visual.dispose();return false;}scene.add(visual.root);if(metrics().triangles>r.maxTriangles||metrics().drawCalls>r.maxDrawCalls||visual.cannonFaces===0){visual.dispose();return false;}visual.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});truckVisual=visual;truckBase.visible=cannon.visible=false;return true;},
    truckMetrics(){return {loaded:Boolean(truckVisual),cannonFaces:truckVisual?.cannonFaces||0,yaw:truckVisual?.turret.rotation.y??cannon.rotation.y,muzzle:{x:nozzle.x,y:nozzle.y,z:nozzle.z},hydrantHose:model.atHydrant,hoseEnd:{x:model.truck.x,z:model.truck.z}};},worldPoint,project,animate,metrics,dispose,anchors,point,scratch};
}

/** Same two-stage degradation contract as naval-view; the model never changes. */
export function createFireView(ctx,model,createRenderer=options=>new T.WebGLRenderer(options)) {
  const r=ctx.balance.render,canvas=globalThis.document?.createElement('canvas');
  let renderer;
  try{renderer=createRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});}catch{return null;}
  const surface=renderer.domElement||canvas;
  let world,disposed=false,low=false,failed=false;
  const onLost=event=>{event.preventDefault();failed=true;dispose();};
  function dispose(){if(disposed)return;disposed=true;surface.removeEventListener('webglcontextlost',onLost);world?.dispose();renderer.dispose();renderer.forceContextLoss();surface.width=surface.height=0;}
  try{
    renderer.setPixelRatio(r.dpr);renderer.setSize(r.width,r.height,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;}
    world=createFireScene(ctx,model);surface.addEventListener('webglcontextlost',onLost);
    if(globalThis.document){
      void loadFireTruck(ctx.balance).then(visual=>{if(visual)world.setTruck(visual);}).catch(()=>{});
      void world.loadHydrant();
      void world.loadCity();
    }
  }catch{failed=true;dispose();return null;}
  const pointer=new T.Vector2(),ray=new T.Raycaster(),ground=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3(),point=new T.Vector3(),screen={x:0,y:0};
  const view={get mode(){return failed?'canvas':'three';},
    metrics(){return {...world.metrics(),low,avatarLoaded:world.cityMetrics().firefighterLoaded,avatarPosition:model.firefighter.visible?{x:model.firefighter.x,y:0,z:model.firefighter.z}:null,ladder:{stowed:model.ladder.extension===0,extension:model.ladder.extension,sway:model.ladder.sway,mode:model.ladder.mode},city:world.cityMetrics(),rendererTriangles:renderer.info?.render.triangles||0,rendererDrawCalls:renderer.info?.render.calls||0,truck:world.truckMetrics(),hydrant:world.hydrantMetrics()};},
    capturePreview({hero=false}={}){if(disposed)return null;world.animate();const camera=hero?world.camera.clone():world.camera;if(hero){camera.position.x+=3;camera.position.z-=1;camera.zoom*=1.85;camera.updateProjectionMatrix();camera.updateMatrixWorld();}renderer.render(world.scene,camera);return surface.toDataURL('image/png');},
    degrade(fallback=false){if(disposed)return;if(fallback){failed=true;dispose();}else if(!low){low=true;renderer.setSize(r.width*r.resolutionScale,r.height*r.resolutionScale,false);}},dispose,
    resize(w=ctx.config.width,h=ctx.config.height){if(disposed)return;renderer.setSize(w*(low?r.resolutionScale:1),h*(low?r.resolutionScale:1),false);world.resize(w,h);},
    projectTarget(x,y){if(disposed)return null;world.worldPoint(x,y,point);world.project(point,screen);return {x:screen.x,y:screen.y};},
    projectWorld(worldPosition){if(disposed)return null;point.fromArray(worldPosition);world.project(point,screen);return {x:screen.x,y:screen.y};},
    pickObjectiveAt(x,y){if(disposed)return null;return pickFireObjective(x,y,model,ctx,w=>view.projectWorld(w),(x,y)=>view.projectTarget(x,y),()=>view.truckScreen());},
    truckScreen(){if(disposed)return null;point.set(model.truck.x,1.5,model.truck.z);world.project(point,screen);return {x:screen.x,y:screen.y};},
    isTruckAt(x,y){if(disposed)return undefined;const pos=view.truckScreen();return Math.hypot(x-pos.x,y-pos.y)<ctx.balance.vehicle.hitRadius;},
    movementAt(x,z){return fireScreenMovement(x,z,ctx.balance.city.cameraHeight*.82/Math.hypot(ctx.balance.city.cameraHeight*.82,ctx.balance.city.cameraBack*1.3+2.4));},
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
        world.animate();
        renderer.render(world.scene,world.camera);p.drawImage(surface,0,0,ctx.config.width,ctx.config.height);
        const {palette:colors}=ctx.config.visuals;p.font=r.markerFont;p.textAlign='center';
        for(const f of model.flames){if(!f.active)continue;world.worldPoint(f.x,f.y,point);point.y+=1.8;world.project(point,screen);
          if(f.warning>0){p.globalAlpha=.4+.6*Math.abs(Math.sin(model.time*14));p.strokeStyle=colors.embers;p.lineWidth=3;p.beginPath();p.arc(screen.x,screen.y+15,16,0,Math.PI*2);p.stroke();p.globalAlpha=1;}
        }
        for(const rescue of model.rescues){if(rescue.expired||rescue.rescued)continue;point.fromArray(rescue.world);point.y+=2;world.project(point,screen);p.strokeStyle=rescue.safe?r.success:colors.embers;p.lineWidth=3;p.beginPath();p.arc(screen.x,screen.y,12,-Math.PI/2,-Math.PI/2+Math.PI*2*rescue.remaining/rescue.timeoutSeconds);p.stroke();p.fillStyle=colors.white;p.beginPath();p.arc(screen.x,screen.y-3,3,0,Math.PI*2);p.fill();p.fillRect(screen.x-3,screen.y+1,6,7);}
        for(const hp of ctx.balance.city.hydrants){point.fromArray(hp);point.y+=ctx.balance.hydrant.height+1.2+Math.sin(model.time*3)*.18;world.project(point,screen);drawWaterDrop(p,screen.x,screen.y,12);}

        drawFireArrow(p,model,ctx,(x,y)=>view.projectTarget(x,y),()=>view.truckScreen());
        drawFireFeedback(p,model,ctx,w=>view.projectWorld(w),(x,y)=>view.projectTarget(x,y),()=>view.truckScreen());
        return true;
      }catch{failed=true;dispose();return false;}
    }
  };return view;
}

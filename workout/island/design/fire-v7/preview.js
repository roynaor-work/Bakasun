/* Fire v7 · local file:// showcase. No analytics, storage, network or build. */
(async function(){
  'use strict';
  const {THREE,GLTFLoader,DRACOLoader,OrbitControls,cloneSkeleton,mergeGeometries}=window.FireCore;
  const data=window.FireData,$=id=>document.getElementById(id);
  const ASSET_TYPES=['row-house','corner-store','warehouse','apartment','workshop'];
  const FLEET=['engine-pumper','engine-ladder','response-unit'],CREW=['crew-nozzle','crew-tool','crew-command'];
  const LABELS={
    'engine-pumper':['כבאית משאבה','משאבה, מכל, זרנוקים וארגזי ציוד'],
    'engine-ladder':['כבאית סולם','שלושה סרנים, סולם כפול וסל חילוץ'],
    'response-unit':['רכב תגובה','ציוד חילוץ ותאורת שטח ניידת'],
    'crew-nozzle':['מפעיל הסילון','מסכת נשימה, מכל אוויר וזרנוק'],
    'crew-tool':['כבאי חילוץ','גרזן חילוץ, כלי פריצה וציוד מגן'],
    'crew-command':['מפקד הצוות','מכשיר קשר וציוד נשימה'],
    'row-house':['בית שורה','גג רעפים, ארובה וחזית לבנים'],
    'corner-store':['חנות פינתית','ויטרינה, סוכך וחזית מסחרית'],
    'warehouse':['מחסן','גג דו־שיפועי ודלת גלילה רחבה'],
    'apartment':['בניין דירות','ארבע קומות, מרפסות ומערכות גג'],
    'workshop':['בית מלאכה','שער עבודה ועמדת שירות'],
    flame:['להבות','16 פריימים · אטלס עם שוליים שקופים'],
    smoke:['עשן','נפח רך עם עלייה, פיזור ורוח'],
    water:['מים','סילון רציף, טיפות והתזה'],
    steam:['אדים','מפגש מים וחום'],ember:['גיצים','חלקיקים זעירים עם דעיכה'],
  };
  const errors=[],loadedIds=new Set(),modelPromises=new Map(),materialCache=new Map(),sourceMaterials=new WeakMap(),lambertCache=new Map();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const state={view:'scene',camera:'near',index:0,damage:'burning',clip:'role',quality:'mobile',atlas:512,dirty:true,adaptiveLevel:0,slowWindows:0,
    playing:!reduced.matches,time:0,autoRotate:false,galleryToken:0,ready:false,water:false,frames:0,frameMs:[],simulationSteps:0};
  const sim=new window.FireSimulation();
  const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance',alpha:false,preserveDrawingBuffer:true});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.setClearColor(0x273341,1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.08,420);
  const controls=new OrbitControls(camera,$('scene'));controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI*.49;
  controls.minDistance=2.2;controls.maxDistance=200;controls.enablePan=true;controls.screenSpacePanning=true;
  const district=new THREE.Group(),gallery=new THREE.Group(),galleryAsset=new THREE.Group(),backgroundCity=new THREE.Group();scene.add(backgroundCity);
  district.name='district';gallery.name='gallery';gallery.add(galleryAsset);scene.add(district,gallery);gallery.visible=false;
  scene.fog=new THREE.FogExp2(0x5a5661,.009);
  const hemi=new THREE.HemisphereLight(0xabc7e3,0x49403b,2.3);scene.add(hemi);
  const key=new THREE.DirectionalLight(0xffd6ae,3.0);key.position.set(-12,23,18);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-26;key.shadow.camera.right=26;key.shadow.camera.top=20;key.shadow.camera.bottom=-24;
  key.shadow.camera.near=1;key.shadow.camera.far=70;key.shadow.bias=-.001;key.shadow.normalBias=.055;scene.add(key);
  const cool=new THREE.DirectionalLight(0x86afcd,1.3);cool.position.set(13,9,-15);scene.add(cool);
  const studioFill=new THREE.DirectionalLight(0xb4d5e1,1.8);studioFill.position.set(4,5,8);studioFill.visible=false;scene.add(studioFill);
  const fireLight=new THREE.PointLight(0xff793d,95,18,1.7);fireLight.position.set(0,3.4,-4.8);scene.add(fireLight);
  const warningLight=new THREE.PointLight(0xef414c,18,7,1.5);warningLight.position.set(-7,2.8,2);scene.add(warningLight);
  const loaderManager=new THREE.LoadingManager();loaderManager.setURLModifier(url=>url.startsWith('fire-atlas:')?data.maps[url.slice(11)]:url);
  THREE.Cache.enabled=true;
  const decoder=new DRACOLoader(loaderManager).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
  const binary=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer;
  decoder._loadLibrary=(url,type)=>Promise.resolve(type==='text'?data.decoder.wrapper:binary(data.decoder.wasm));
  const loader=new GLTFLoader(loaderManager).setDRACOLoader(decoder);
  function load(id){
    if(modelPromises.has(id))return modelPromises.get(id);
    const promise=new Promise((resolve,reject)=>{
      if(!data.models[id])return reject(new Error('Missing local asset: '+id));
      loader.parse(binary(data.models[id]),'',gltf=>{
        gltf.scene.traverse(o=>{
          if(!o.isMesh)return;
          o.castShadow=true;o.receiveShadow=true;
          const materials=Array.isArray(o.material)?o.material:[o.material];
          for(let i=0;i<materials.length;i++){
            const mat=materials[i],name=mat.name;
            if(materialCache.has(name))materials[i]=materialCache.get(name);
            else{mat.envMapIntensity=.25;materialCache.set(name,mat);}
          }
          o.material=Array.isArray(o.material)?materials:materials[0];
        });
        loadedIds.add(id);resolve(gltf);
      },reject);
    });modelPromises.set(id,promise);return promise;
  }
  const metadata=Object.fromEntries(data.manifest.assets.map(a=>[a.id,a]));
  const mixers=[],lods=[],mainActors=[],mainTrucks=[],buildingNodes=[],beacons=[];
  let beaconInstances,skyShell,groundPlane,flexHose,flexCurve;
  const contactMeshes=[];let districtBatch=null,districtBatchKey='';
  const beaconDummy=new THREE.Object3D(),beaconPosition=new THREE.Vector3(),beaconColor=new THREE.Color(),crowdShaders=[];
  function cheapShading(){return state.quality==='low'||state.view==='scene'&&state.quality==='mobile'&&state.adaptiveLevel>0;}
  function configureLighting(){
    const cheap=cheapShading(),street=state.view==='scene';
    cool.visible=!cheap;studioFill.visible=!street&&!cheap;fireLight.visible=street&&!cheap;warningLight.visible=street&&!cheap;
    hemi.intensity=cheap?2.1:2.3;key.intensity=cheap?2.6:3.0;
  }
  function simplifiedMaterial(original){
    if(!original.isMeshStandardMaterial)return original;
    if(lambertCache.has(original.uuid))return lambertCache.get(original.uuid);
    const mat=new THREE.MeshLambertMaterial({map:original.map,color:original.color,vertexColors:original.vertexColors,
      transparent:original.transparent,opacity:original.opacity,side:original.side,depthWrite:original.depthWrite,
      alphaTest:original.alphaTest,fog:original.fog,toneMapped:original.toneMapped});
    mat.name=original.name+' / mobile';mat.onBeforeCompile=original.onBeforeCompile;
    mat.customProgramCacheKey=original.customProgramCacheKey.bind(original);lambertCache.set(original.uuid,mat);return mat;
  }
  function applyShading(root,cheap){
    root.traverse(o=>{if(!o.isMesh)return;
      if(!sourceMaterials.has(o))sourceMaterials.set(o,o.material);const original=sourceMaterials.get(o);
      o.material=cheap?(Array.isArray(original)?original.map(simplifiedMaterial):simplifiedMaterial(original)):original;
    });
  }
  function instance(gltf){const object=gltf.scene.getObjectByProperty('isSkinnedMesh',true)?cloneSkeleton(gltf.scene):gltf.scene.clone(true);if(cheapShading())applyShading(object,true);return object;}
  function playActor(object,gltf,role){
    const mixer=new THREE.AnimationMixer(object),clips=Object.fromEntries(gltf.animations.map(c=>[c.name,c]));
    const entry={mixer,object,clips,role,action:null};mixers.push(entry);setClip(entry,'role');return entry;
  }
  function setClip(entry,clip){
    const name=clip==='role'?entry.role==='crew-nozzle'?'hose':entry.role==='crew-tool'?'tool':'command':clip;
    entry.mixer.stopAllAction();const action=entry.mixer.clipAction(entry.clips[name]||entry.clips.idle);action.play();entry.action=action;
  }
  async function makeLOD(id,pos,yaw=0,threshold=30,register=true){
    const [high,low]=await Promise.all([load(id),load(id+'-lod')]);
    const lod=new THREE.LOD();lod.autoUpdate=false;lod.name=id+' / LOD';lod.position.set(...pos);lod.rotation.y=yaw;
    const hi=instance(high),lo=instance(low);lod.addLevel(hi,0);lod.addLevel(lo,threshold,.12);
    if(metadata[id].category==='crew'){
      const entry=playActor(hi,high,id),lowEntry=playActor(lo,low,id);lod.userData.actors=[entry,lowEntry];
    }
    lod.userData.id=id;if(register)lods.push(lod);return lod;
  }
  const textureLoader=new THREE.TextureLoader();
  async function texture(url){return new Promise((resolve,reject)=>textureLoader.load(url,t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;resolve(t);},undefined,reject));}
  function radialTexture(){
    const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,31);
    g.addColorStop(0,'rgba(2,9,16,.64)');g.addColorStop(.5,'rgba(2,9,16,.28)');g.addColorStop(1,'rgba(2,9,16,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);
  }
  const contactTexture=radialTexture();
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;
  const glowContext=glowCanvas.getContext('2d'),glowGradient=glowContext.createRadialGradient(32,32,0,32,32,31);
  glowGradient.addColorStop(0,'rgba(255,255,255,1)');glowGradient.addColorStop(.25,'rgba(255,255,255,.6)');glowGradient.addColorStop(1,'rgba(255,255,255,0)');
  glowContext.fillStyle=glowGradient;glowContext.fillRect(0,0,64,64);const glowTexture=new THREE.CanvasTexture(glowCanvas);
  function contact(parent,x,z,w,d,opacity=.6,y=.04){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,opacity,depthWrite:false,toneMapped:false}));
    p.rotation.x=-Math.PI/2;p.position.set(x,y,z);parent.add(p);if(parent===district)contactMeshes.push(p);return p;
  }
  function mergeContactShadows(){
    const geometries=[];
    for(const mesh of contactMeshes){
      mesh.updateMatrixWorld(true);const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),count=geometry.attributes.position.count;
      const colors=new Float32Array(count*4);for(let i=0;i<count;i++)colors.set([1,1,1,mesh.material.opacity],i*4);
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));geometries.push(geometry);
      district.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();
    }
    const geometry=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();
    const material=new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,vertexColors:true,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='eleven contact shadows / one draw';district.add(mesh);contactMeshes.length=0;
  }
  function batchStaticDistrict(){
    const entries=lods.filter(l=>['building','vehicle'].includes(metadata[l.userData.id].category));
    const key=entries.map(l=>l.userData.id+':'+l.levels.findIndex(level=>level.object.visible)).join('|');
    if(key===districtBatchKey)return;districtBatchKey=key;
    const buckets=new Map();
    for(const lod of entries){
      const active=lod.levels.find(l=>l.object.visible)?.object||lod.levels[0].object;
      active.traverse(o=>{if(!o.isMesh)return;
        const source=sourceMaterials.get(o)||o.material,name=source.name;
        if(!buckets.has(name))buckets.set(name,{material:source,geometry:[]});
        buckets.get(name).geometry.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
      });
      for(const level of lod.levels)level.object.traverse(o=>{if(o.isMesh)o.visible=false;});
    }
    if(districtBatch){district.remove(districtBatch);districtBatch.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
    districtBatch=new THREE.Group();districtBatch.name='batched static district at current LOD';
    for(const [name,bucket]of buckets){
      const geometry=mergeGeometries(bucket.geometry,false);for(const g of bucket.geometry)g.dispose();
      const mesh=new THREE.Mesh(geometry,bucket.material);mesh.name='district / '+name;mesh.castShadow=true;mesh.receiveShadow=true;districtBatch.add(mesh);
    }
    applyShading(districtBatch,cheapShading());district.add(districtBatch);renderer.shadowMap.needsUpdate=true;
  }
  function beacon(parent,x,y,z,phase){
    const socket=new THREE.Object3D();socket.position.set(x,y,z);parent.add(socket);beacons.push({socket,phase});
  }
  function hose(points,radius=.044,color=0xc7a970){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),geometry=new THREE.TubeGeometry(curve,Math.max(12,points.length*5),radius,6,false);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.9}));mesh.receiveShadow=true;district.add(mesh);return mesh;
  }
  let effects,particleTextures={},crowdHigh,crowdLow,selectedObject=null,galleryActor=null;
  async function instancedProp(id,positions){
    const asset=await load(id);asset.scene.updateMatrixWorld(true);const buckets=new Map();
    asset.scene.traverse(o=>{if(!o.isMesh)return;const key=o.material.name;if(!buckets.has(key))buckets.set(key,{material:o.material,geometries:[]});buckets.get(key).geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));});
    const dummy=new THREE.Object3D();
    for(const [name,bucket]of buckets){
      const geometry=mergeGeometries(bucket.geometries,false);for(const g of bucket.geometries)g.dispose();
      const mesh=new THREE.InstancedMesh(geometry,bucket.material,positions.length);mesh.name=id+' / '+name+' / instanced';mesh.receiveShadow=true;mesh.castShadow=true;
      for(let i=0;i<positions.length;i++){dummy.position.set(...positions[i]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
      mesh.instanceMatrix.needsUpdate=true;district.add(mesh);
    }
  }
  async function setup(){
    const all=['street-block',...FLEET,...CREW,...ASSET_TYPES.map((t,i)=>t+'-'+['intact','scorched','burning','scorched','intact'][i]),
      'hydrant','street-barrier','traffic-cone','street-lamp','bystander','bystander-lod'];
    let progress=0;
    await Promise.all(all.map(async id=>{await load(id);progress++;$('load-progress').textContent=`${progress} / ${all.length} נכסים מקומיים`;}));
    const street=instance(await load('street-block'));district.add(street);
    for(let i=0;i<5;i++){
      const type=ASSET_TYPES[i],stage=['intact','scorched','burning','scorched','intact'][i];
      const root=new THREE.Group();root.position.set([-14,-7,0,7.2,13.7][i],.04,-8.2);district.add(root);
      const object=await makeLOD(type+'-'+stage,[0,0,0],0,45);root.add(object);
      buildingNodes.push({type,root,object,stage,token:0,position:root.position.toArray()});
      contact(district,root.position.x,-7.8,metadata[type+'-'+stage].dimensions[0]+2,7.5,.65,.23);
    }
    for(let i=0;i<3;i++){
      const id=FLEET[i],positions=[[-6.8,.016,1.5],[6.5,.016,.60],[-14,.016,1.4]],yaws=[1.1,1.55,1.0];
      const object=await makeLOD(id,positions[i],yaws[i],35);district.add(object);mainTrucks.push(object);
      const shadow=contact(district,positions[i][0],positions[i][2],3.6,i===1?8.6:6.6,.82,.019);shadow.rotation.z=-yaws[i];
      const front=i===1?4.03:i===0?3.18:2.39,length=i===1?2.28:i===0?2.15:2.07,width=i===2?2.02:i===0?2.34:2.4;
      for(const side of [-1,1])beacon(object,side*width*.25,2.72-metadata[id].originShiftMeters,front-length*.65,i*.74+(side>0?0:.45));
    }
    beaconInstances=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,8,5),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),beacons.length);
    beaconInstances.name='six emergency lenses / one draw';beaconInstances.frustumCulled=false;district.add(beaconInstances);
    for(let i=0;i<3;i++){
      const positions=[[.8,.016,3.6],[-1.2,.016,3.1],[3.5,.016,3.8]],yaws=[Math.PI,Math.PI-.3,Math.PI+.5];
      const object=await makeLOD(CREW[i],positions[i],yaws[i],24);district.add(object);mainActors.push(object);
      contact(district,positions[i][0],positions[i][2],1.2,1.0,.6,.019);
    }
    mergeContactShadows();
    for(const [id,positions]of [
      ['hydrant',[[-11,.271,-4.9],[11,.271,7.1]]],
      ['street-barrier',[[-5,.271,7.2],[-2.5,.271,7.2],[0,.271,7.2],[2.5,.271,7.2],[5,.271,7.2]]],
      ['traffic-cone',[[-9,.016,4.7],[-7,.016,5.5],[-5,.016,5.8],[7,.016,4.7],[9,.016,3.9]]],
      ['street-lamp',[[-19,.271,-4.8],[18,.271,-4.8],[-13,.271,7.3],[13,.271,7.3]]],
    ]){
      await instancedProp(id,positions);
    }
    district.updateMatrixWorld(true);
    const intake=worldSocket(mainTrucks[0],'waterInlet'),outlet=worldSocket(mainTrucks[0],'waterOutlet');
    hose([[-10.69,.731,-4.9],[-10.5,.071,-4],[-9.9,.071,-3],[-9,.071,-1.8],[-8.1,.071,.2],[-7.6,.071,1.8],intake],.055);
    hose([outlet,[-5.4,.059,1.2],[-4.2,.059,3.4],[-2,.059,4.1],[.3,.059,4]],.043);
    flexCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.3,.059,4),new THREE.Vector3(.7,.5,3.7),new THREE.Vector3(.8,1.2,3.3)]);
    flexHose=new THREE.Mesh(new THREE.TubeGeometry(flexCurve,14,.043,6,false),new THREE.MeshStandardMaterial({color:0xc7a970,roughness:.9}));
    flexHose.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);flexHose.receiveShadow=true;district.add(flexHose);
    hose([[6.5,.8,1.8],[7.2,.059,3.5],[6.7,.059,4.6],[5.2,.059,4.7],[4.2,.059,4.1]],.043,0x8b4c43);
    await makeCrowd();
    groundPlane=new THREE.Mesh(new THREE.CircleGeometry(600,64),new THREE.MeshStandardMaterial({color:0x273440,roughness:1}));
    groundPlane.rotation.x=-Math.PI/2;groundPlane.position.y=-.81;groundPlane.receiveShadow=true;scene.add(groundPlane);
    const skyMap=await texture(data.sky);skyMap.wrapS=THREE.RepeatWrapping;
    skyShell=new THREE.Mesh(new THREE.SphereGeometry(185,32,16),new THREE.MeshBasicMaterial({map:skyMap,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false}));scene.add(skyShell);
    // Distant silhouettes are batched boxes, with no distant texture allocations.
    const silhouettes=[];for(let i=0;i<22;i++){
      const h=3+(i*7%8),w=2.5+(i*11%4);const g=new THREE.BoxGeometry(w,h,3.5);g.translate(-56+i*5.2,h/2-1,-31-(i%3)*4);silhouettes.push(g);
    }
    const horizon=new THREE.Mesh(mergeGeometries(silhouettes,false),new THREE.MeshBasicMaterial({color:0x2d3948,fog:true}));backgroundCity.add(horizon);horizon.name='batched distant silhouettes';
    for(const kind of ['flame','smoke','steam','water','ember']){
      particleTextures[kind]={};await Promise.all([256,512,1024].map(async size=>particleTextures[kind][size]=await texture(data.particles[kind+'-'+size])));
    }
    const beaconCanvas=document.createElement('canvas');beaconCanvas.width=beaconCanvas.height=256;const bctx=beaconCanvas.getContext('2d');
    for(let i=0;i<16;i++)bctx.drawImage(glowCanvas,i%4*64,Math.floor(i/4)*64);
    const beaconAtlas=new THREE.CanvasTexture(beaconCanvas);beaconAtlas.colorSpace=THREE.SRGBColorSpace;
    particleTextures.beacon={256:beaconAtlas,512:beaconAtlas,1024:beaconAtlas};
    effects=new window.FireEffects(scene,particleTextures);
    const podium=new THREE.Mesh(new THREE.CylinderGeometry(5.4,5.7,.28,64),new THREE.MeshStandardMaterial({color:0x354756,roughness:.9}));
    podium.position.y=-.14;podium.receiveShadow=true;gallery.add(podium);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(5.45,.024,5,96),new THREE.MeshBasicMaterial({color:0xd9a376}));rim.rotation.x=Math.PI/2;rim.position.y=-.04;gallery.add(rim);
    contact(gallery,0,0,9,9,.55,.0015);
    frameCamera(true);renderer.shadowMap.needsUpdate=true;state.ready=true;$('loading').hidden=true;publish();
  }
  async function makeCrowd(){
    const high=await load('bystander'),low=await load('bystander-lod');
    const getMesh=g=>g.scene.getObjectByProperty('isMesh',true);
    const h=getMesh(high),l=getMesh(low),count=28;
    crowdHigh=new THREE.InstancedMesh(h.geometry,h.material,count);crowdLow=new THREE.InstancedMesh(l.geometry,l.material,count);
    crowdHigh.name='28 instanced bystanders';crowdLow.name='28 bystanders LOD';
    crowdHigh.castShadow=false;crowdLow.castShadow=false;crowdHigh.receiveShadow=true;crowdLow.receiveShadow=true;
    // A single shader bends upper bodies slightly with independent seeded phase.
    // No extra skeleton, matrix uploads or draw calls are used for the crowd.
    for(const mesh of [crowdHigh,crowdLow]){
      mesh.material=mesh.material.clone();mesh.material.onBeforeCompile=shader=>{
        shader.uniforms.uCrowdTime={value:0};crowdShaders.push(shader);
        shader.vertexShader='uniform float uCrowdTime;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float phase=instanceMatrix[3].x*.71+instanceMatrix[3].z*2.1;
          float weight=smoothstep(.65,1.5,position.y);
          transformed.x+=sin(uCrowdTime*.8+phase)*.018*weight;
          transformed.z+=sin(uCrowdTime*.65+phase*1.4)*.012*weight;`);
      };mesh.material.customProgramCacheKey=()=> 'fire-v7-instanced-crowd-sway';
    }
    const dummy=new THREE.Object3D(),palette=[0xa8bdb0,0x8f9bc0,0xb99c87,0x7493aa,0xc1b38b];
    for(let i=0;i<count;i++){
      dummy.position.set(-10.4+(i%14)*1.59,.271,8.25+Math.floor(i/14)*.80);
      dummy.rotation.y=Math.PI+(i%5-2)*.12;const s=.88+(i*7%11)*.018;dummy.scale.set(s,s,s);dummy.updateMatrix();
      crowdHigh.setMatrixAt(i,dummy.matrix);crowdLow.setMatrixAt(i,dummy.matrix);
      const c=new THREE.Color(palette[i%palette.length]);crowdHigh.setColorAt(i,c);crowdLow.setColorAt(i,c);
    }
    crowdHigh.instanceMatrix.needsUpdate=true;crowdLow.instanceMatrix.needsUpdate=true;district.add(crowdHigh,crowdLow);crowdLow.visible=false;
  }
  function dimensions(){return {width:innerWidth,height:innerHeight,narrow:innerWidth/innerHeight<.8};}
  function frameCamera(immediate=false){
    const {narrow}=dimensions(),far=state.camera==='far';let target,position;
    if(state.view==='scene'){
      target=narrow?(far?[0,1.3,-.7]:[.2,1.4,-1.6]):(far?[0,1,-1]:[1,1.1,-1.8]);
      position=narrow?(far?[82,76,106]:[20,18,33]):(far?[31,24,36]:[17,13,24]);
      scene.fog.density=narrow&&far?.0045:.009;
    }else if(state.view==='fleet'){
      target=[0,1.15,0];const r=far?1.45:1;const fit=state.index===1?1.17:state.index===2?.85:1;
      position=[(narrow?11.5:6.8)*r*fit,5.3*r*fit,(narrow?15.5:9.2)*r*fit];
    }else if(state.view==='crew'){
      target=[0,.95,0];const r=far?1.65:1;position=[(narrow?2.4:2.1)*r,1.85*r,(narrow?4.6:3.6)*r];
    }else if(state.view==='buildings'){
      target=[0,state.index===3?3.5:1.9,0];const r=far?1.55:1;position=[(narrow?12.2:9.5)*r,(state.index===3?9.5:7.2)*r,(narrow?17.5:13.5)*r];
      if(narrow){const fit=[1.04,1.13,1.23,1.06,1.10][state.index];position=position.map((v,i)=>target[i]+(v-target[i])*fit);}
    }else{
      target=[0,1.9,0];const r=far?1.5:1;position=[(narrow?5.5:4.5)*r,4.3*r,(narrow?9.4:7.2)*r];
    }
    // Leave lower controls clear by lifting the principal point rather than
    // cropping a separate viewport. Screenshot dimensions remain exact.
    camera.position.set(...position);controls.target.set(...target);controls.update();
      const landscape=innerWidth>innerHeight&&innerHeight<540;
      camera.setViewOffset(innerWidth,innerHeight,landscape?Math.round(innerWidth*.18):0,Math.round(innerHeight*(narrow?.095:landscape?.015:.11)),innerWidth,innerHeight);
    renderer.shadowMap.needsUpdate=true;
  }
  function resize(reframe=true){
    const {width,height}=dimensions(),scale=state.quality==='low'?.75:state.quality==='detail'?1.75:state.view==='scene'?[1.25,1,.8,.65,.5][state.adaptiveLevel]:1.25;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,scale));state.dirty=true;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(state.ready&&reframe)frameCamera(true);
  }
  async function showGallery(){
    state.dirty=true;
    const token=++state.galleryToken;
    const old=galleryAsset.children.slice();for(const child of old)galleryAsset.remove(child);
    // Detach old gallery mixers so repeated browsing does not retain skeletons.
    for(let i=mixers.length-1;i>=0;i--)if(mixers[i].gallery){mixers[i].mixer.stopAllAction();mixers[i].mixer.uncacheRoot(mixers[i].object);mixers.splice(i,1);}
    galleryActor=null;selectedObject=null;
    if(state.view==='scene')return;
    if(state.view==='effects'){updateAssetCaption();frameCamera();return;}
    const list=state.view==='fleet'?FLEET:state.view==='crew'?CREW:ASSET_TYPES,id=list[state.index%list.length];
    const modelId=state.view==='buildings'?id+'-'+state.damage:id;
    $('load-progress').textContent='מכינים תקריב';
    const asset=await load(modelId);if(token!==state.galleryToken)return;
    selectedObject=instance(asset);galleryAsset.add(selectedObject);
    if(state.view==='crew'){
      galleryActor=playActor(selectedObject,asset,id);galleryActor.gallery=true;setClip(galleryActor,state.clip);
    }
    updateAssetCaption();frameCamera();renderer.shadowMap.needsUpdate=true;publish();
  }
  function updateAssetCaption(){
    const list=state.view==='fleet'?FLEET:state.view==='crew'?CREW:state.view==='buildings'?ASSET_TYPES:['flame','smoke','water','steam','ember'];
    const id=list[state.index%list.length],label=LABELS[id];
    $('asset-index').textContent=String(state.index%list.length+1).padStart(2,'0')+' / '+String(list.length).padStart(2,'0');
    $('asset-name').textContent=label[0];$('asset-description').textContent=label[1];
    $('damage-label').hidden=state.view!=='buildings';$('clip-label').hidden=state.view!=='crew';$('atlas-label').hidden=state.view!=='effects';
    $('scene-title').textContent=state.view==='scene'?'מבט מבצעי':label[0];
    $('scene-subtitle').textContent=state.view==='scene'?'חמישה מבנים · שלושה צוותים':state.view==='crew'?'שלד קנוני · 18 עצמות':state.view==='effects'?'חלקיקים חסכוניים לטלפון':'גאומטריה מקורית · פרטי ציוד';
  }
  async function setView(view){
    if(!['scene','fleet','crew','buildings','effects'].includes(view))return;
    state.view=view;state.dirty=true;state.index=0;state.camera='near';controls.autoRotate=false;state.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');
    district.visible=view==='scene';backgroundCity.visible=view==='scene';gallery.visible=view!=='scene';applyShading(scene,cheapShading());configureLighting();
    effects?.setQuality(state.quality==='mobile'&&view==='scene'&&state.adaptiveLevel>=2?'low':state.quality);resize(false);
    scene.fog.density=view==='scene'?.009:.015;scene.fog.color.set(view==='scene'?0x5a5661:0x273c4c);
    scene.background=view==='scene'?null:new THREE.Color(0x273c4c);if(skyShell)skyShell.visible=view==='scene';
    if(groundPlane){groundPlane.material.color.set(view==='scene'?0x273440:0x213747);groundPlane.position.y=view==='scene'?-.81:-.28;}
    $('scene-panel').hidden=view!=='scene';$('asset-panel').hidden=view==='scene';
    for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
    setCamera('near');if(view==='scene'){state.galleryToken++;updateAssetCaption();}else await showGallery();
    publish();
  }
  function setCamera(name){state.camera=name;state.dirty=true;for(const id of ['near','far'])$(id).setAttribute('aria-pressed',String(id===name));frameCamera(true);publish();}
  async function setIndex(index){const n=state.view==='fleet'||state.view==='crew'?3:5;state.index=(index+n)%n;await showGallery();}
  async function setDamage(stage){state.damage=stage;$('damage').value=stage;if(state.view==='buildings')await showGallery();}
  function setQuality(value){state.quality=value;state.adaptiveLevel=0;state.slowWindows=0;state.dirty=true;$('quality').value=value;
    effects?.setQuality(value);applyShading(scene,cheapShading());configureLighting();renderer.shadowMap.enabled=value!=='low';resize(false);publish();}
  function adapt(fps){
    if(state.quality!=='mobile'||!state.playing||state.view!=='scene')return;
    state.slowWindows=fps<24?state.slowWindows+1:0;
    if(state.slowWindows<3||state.adaptiveLevel>=4)return;
    state.adaptiveLevel++;state.slowWindows=0;applyShading(scene,cheapShading());configureLighting();
    effects.setQuality(state.adaptiveLevel>=2?'low':'mobile');renderer.shadowMap.enabled=state.adaptiveLevel<2;
    resize(false);renderer.shadowMap.needsUpdate=true;publish();
  }
  function setPlaying(playing){state.playing=playing;$('pause').setAttribute('aria-pressed',String(!playing));$('pause').innerHTML=playing?'השהיה <span aria-hidden="true">Ⅱ</span>':'המשך <span aria-hidden="true">▷</span>';publish();}
  function setWater(enabled){sim.water=enabled;state.water=enabled;state.dirty=true;$('water').setAttribute('aria-pressed',String(enabled));$('water').querySelector('span').textContent=enabled?'עצירת מים':'הפעלת מים';publish();}
  async function reset(){sim.reset();state.time=0;setWater(false);$('spread').setAttribute('aria-pressed','true');$('target').value='2';await updateBuildingStages();renderStill();updateHud();publish();}
  function updateHud(){
    const target=sim.buildings[sim.target],heat=Math.round(target.heat*100),count=sim.buildings.filter(b=>b.burning).length;
    $('active-fires').innerHTML=count+'<span>/5</span>';$('heat-value').textContent=heat+'%';$('heat-bar').style.width=heat+'%';
  }
  async function updateBuildingStages(){
    await Promise.all(buildingNodes.map(async(entry,i)=>{
      const b=sim.buildings[i];
      const stage=b.damage>.88?'ruined':b.burning?'burning':b.damage>.08?'scorched':'intact';
      entry.desired=stage;
      if(stage===entry.stage){if(entry.requested){entry.token++;entry.requested=null;entry.pending=null;}return;}
      if(entry.requested===stage)return entry.pending;
      entry.requested=stage;const token=++entry.token;
      entry.pending=(async()=>{
        const obj=await makeLOD(entry.type+'-'+stage,[0,0,0],0,45,false);
        if(token!==entry.token||entry.desired!==stage)return;
        const oldIndex=lods.indexOf(entry.object);if(oldIndex>=0)lods.splice(oldIndex,1);
        entry.root.remove(entry.object);entry.object=obj;entry.root.add(obj);lods.push(obj);entry.stage=stage;entry.requested=null;entry.pending=null;
        state.dirty=true;renderer.shadowMap.needsUpdate=true;
      })();return entry.pending;
    }));
  }
  function worldSocket(object,name){
    const active=object.isLOD?(object.levels.find(l=>l.object.visible)||object.levels[0]).object:object;
    const socket=active.getObjectByName(name);if(!socket)return null;
    return socket.getWorldPosition(new THREE.Vector3()).toArray();
  }
  function sources(){
    const list=[];
    for(let i=0;i<5;i++){
      const b=sim.buildings[i],entry=buildingNodes[i];if(!entry)continue;
      const dims=metadata[entry.type+'-intact'].dimensions,x=entry.position[0],z=entry.position[2]+dims[2]/2+.24;
      if(!b.burning){if(b.damage>.08&&b.wet>.05)list.push({id:i*4+3,position:[x,Math.min(dims[1]*.6,3),z],heat:Math.min(.40,b.wet),scale:.65,smokeOnly:true});continue;}
      const ruined=entry.stage==='ruined';
      list.push({id:i*4,position:[x-dims[0]*.20,ruined?.55:1.1,z],heat:b.heat,scale:ruined?.70:.95},
        {id:i*4+1,position:[x+dims[0]*.22,ruined?Math.min(1.8,dims[1]*.30):Math.max(1.65,dims[1]*.67),z],heat:b.heat,scale:.95},
        {id:i*4+2,position:[x,ruined?dims[1]*.36+.20:dims[1]+.45,entry.position[2]],heat:b.heat,scale:1.25});
    }
    return list;
  }
  function updateEffects(){
    effects.clear();
    if(state.view==='scene'){
      effects.fire(state.time,sources());
      const target=buildingNodes[sim.target],dims=metadata[target.type+'-intact'].dimensions;
      const start=worldSocket(mainActors[0],'waterNozzle')||[.75,1.2,3.2];
      const impactHeight=target.stage==='ruined'?Math.min(1.2,dims[1]*.25):Math.min(dims[1]*.65,3.2);
      effects.water(state.time,start,[target.position[0],impactHeight,target.position[2]+dims[2]/2+.22],sim.water);
    }else if(state.view==='buildings'&&state.damage==='burning'){
      const dims=metadata[ASSET_TYPES[state.index]+'-intact'].dimensions;
      effects.fire(state.time,[{position:[-dims[0]*.20,1.2,dims[2]/2+.20],heat:.85,scale:.90},
        {position:[dims[0]*.24,dims[1]*.69,dims[2]/2+.22],heat:.85,scale:.85},{position:[0,dims[1]+.4,0],heat:.80,scale:1.1}]);
    }else if(state.view==='effects'){
      const kind=['flame','smoke','water','steam','ember'][state.index];
      if(kind==='water')effects.water(state.time,[-2.2,1.2,.6],[1.5,.03,-1.2],true);
      else{
        effects.fire(state.time,[{position:[0,.10,0],heat:.9,scale:1.2}]);
        for(const [name,batch]of Object.entries(effects.batches))if(name!==kind)batch.clear();
        if(kind==='steam'){
          effects.batches.steam.put(0,1.6,0,2.3,2.5,Math.floor(state.time*4)%16,.75,state.time*.1,1.6);
        }
      }
    }else if(state.view==='crew'&&CREW[state.index]==='crew-nozzle'&&state.clip==='role'){
      effects.water(state.time,worldSocket(selectedObject,'waterNozzle'),[0,1.05,2.65],state.water);
    }
    if(state.view==='scene'){
      const pulse=p=>!reduced.matches?(Math.sin((state.time+p)*Math.PI*4)>.25?1:.08):.45;
      for(const b of beacons){b.socket.getWorldPosition(beaconPosition);effects.batches.beacon.put(beaconPosition.x,beaconPosition.y,beaconPosition.z,.9,.9,0,pulse(b.phase)*.45,0,1.2);}
    }
    effects.commit();
  }
  const flexPoint=new THREE.Vector3(),flexTangent=new THREE.Vector3(),flexNormal=new THREE.Vector3(),flexBinormal=new THREE.Vector3(),axisY=new THREE.Vector3(0,1,0);
  function updateFlexHose(){
    if(!flexHose||!district.visible)return;
    const target=buildingNodes[sim.target],actor=mainActors[0];
    actor.rotation.y=Math.atan2(target.position[0]-actor.position.x,target.position[2]-actor.position.z);actor.updateMatrixWorld(true);
    const inlet=worldSocket(actor,'hoseInlet');if(!inlet)return;
    flexCurve.points[2].fromArray(inlet);flexCurve.points[1].set((.3+inlet[0])*.5,.53,(4+inlet[2])*.5);
    const position=flexHose.geometry.attributes.position,normals=flexHose.geometry.attributes.normal;
    for(let i=0;i<=14;i++){
      const t=i/14;flexCurve.getPoint(t,flexPoint);flexCurve.getTangent(t,flexTangent);flexNormal.crossVectors(flexTangent,axisY).normalize();flexBinormal.crossVectors(flexTangent,flexNormal).normalize();
      for(let j=0;j<=6;j++){
        const a=j/6*Math.PI*2,c=Math.cos(a)*.043,s=Math.sin(a)*.043,index=i*7+j;
        position.setXYZ(index,flexPoint.x+flexNormal.x*c+flexBinormal.x*s,flexPoint.y+flexNormal.y*c+flexBinormal.y*s,flexPoint.z+flexNormal.z*c+flexBinormal.z*s);
        normals.setXYZ(index,(flexNormal.x*c+flexBinormal.x*s)/.043,(flexNormal.y*c+flexBinormal.y*s)/.043,(flexNormal.z*c+flexBinormal.z*s)/.043);
      }
    }
    position.needsUpdate=true;normals.needsUpdate=true;
  }
  function updateLods(){
    let high=0,low=0;camera.updateMatrixWorld(true);
    for(const lod of lods){
      if(!district.visible)continue;
      if(state.quality==='low'||state.quality==='mobile'&&state.adaptiveLevel>0){
        lod.levels[0].object.visible=false;lod.levels[1].object.visible=true;low++;
      }else{lod.update(camera);if(lod.getCurrentLevel())low++;else high++;}
    }
    if(crowdHigh){const lowCrowd=state.quality==='low'||state.quality==='mobile'&&state.adaptiveLevel>0||camera.position.distanceTo(controls.target)>42;
      crowdLow.count=state.quality==='low'||state.quality==='mobile'&&state.adaptiveLevel>=3?14:28;
      crowdHigh.visible=district.visible&&!lowCrowd;crowdLow.visible=district.visible&&lowCrowd;}
    if(district.visible)batchStaticDistrict();
    $('lod-value').textContent=high+' קרוב / '+low+' רחוק';return {high,low};
  }
  function updateLights(){
    const t=state.time,enabled=!reduced.matches;
    const pulse=p=>enabled?(Math.sin((t+p)*Math.PI*4)>.25?1:.08):.45;
    if(beaconInstances){
      for(let i=0;i<beacons.length;i++){
        const b=beacons[i],value=pulse(b.phase);b.socket.getWorldPosition(beaconPosition);beaconDummy.position.copy(beaconPosition);beaconDummy.updateMatrix();
        beaconInstances.setMatrixAt(i,beaconDummy.matrix);beaconColor.setRGB(value,.025,.022);beaconInstances.setColorAt(i,beaconColor);
      }
      beaconInstances.instanceMatrix.needsUpdate=true;beaconInstances.instanceColor.needsUpdate=true;
    }
    for(const shader of crowdShaders)shader.uniforms.uCrowdTime.value=reduced.matches?0:t;
    const heat=sim.buildings.reduce((n,b)=>n+(b.burning?b.heat:0),0);
    fireLight.intensity=state.view==='scene'?heat*(24+(enabled?Math.sin(t*9)*3:0)):0;
    warningLight.intensity=state.view==='scene'?pulse(.2)*14:0;
  }
  function renderStill(){
    for(const entry of mixers)if(state.view==='scene'?!entry.gallery:entry.gallery)entry.mixer.setTime(state.time);
    scene.updateMatrixWorld(true);updateLods();updateFlexHose();updateLights();updateEffects();renderer.render(scene,camera);publish();
  }
  async function auditActor(role,clip='walk',low=false,samples=121){
    const id=role+(low?'-lod':''),asset=await load(id),object=instance(asset),mixer=new THREE.AnimationMixer(object);
    const animation=asset.animations.find(c=>c.name===clip);if(!animation)throw Error('Unknown clip '+clip);
    const action=mixer.clipAction(animation);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const meshes=[];object.updateMatrixWorld(true);object.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    const soleSets=[];
    for(const mesh of meshes){
      const p=mesh.geometry.attributes.position,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
      for(let i=0;i<p.count;i++){
        if(p.getY(i)>.026)continue;
        for(let k=0;k<4;k++){
          const joint=j.getComponent(i,k),weight=w.getComponent(i,k);
          if(weight>.95&&(joint===14||joint===17))soleSets.push({mesh,index:i,side:joint===14?'left':'right'});
        }
      }
    }
    const v=new THREE.Vector3(),records=[],starts=[],ends=[];let nonFinite=0;
    for(let sample=0;sample<samples;sample++){
      const time=animation.duration*sample/(samples-1);mixer.setTime(time);object.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();
      const min={left:Infinity,right:Infinity},max={left:-Infinity,right:-Infinity};
      for(const item of soleSets){
        v.fromBufferAttribute(item.mesh.geometry.attributes.position,item.index);item.mesh.applyBoneTransform(item.index,v);v.applyMatrix4(item.mesh.matrixWorld);
        if(!Number.isFinite(v.x+v.y+v.z))nonFinite++;min[item.side]=Math.min(min[item.side],v.y);max[item.side]=Math.max(max[item.side],v.y);
        if(sample===0)starts.push(v.toArray());if(sample===samples-1)ends.push(v.toArray());
      }
      records.push({time,min,max});
    }
    mixer.stopAllAction();mixer.uncacheRoot(object);
    const loopDelta=Math.max(0,...starts.map((p,i)=>Math.hypot(...p.map((v,k)=>v-ends[i][k]))));
    return {id,clip,duration:animation.duration,samples,soleVertices:soleSets.length,nonFinite,loopDelta,
      minSoleY:Math.min(...records.flatMap(r=>[r.min.left,r.min.right])),
      maxLowerSoleY:Math.max(...records.map(r=>Math.min(r.min.left,r.min.right))),records};
  }
  let hudTimer=0,buildingTimer=0,last=performance.now(),lastRender=0,fpsTime=0,fpsFrames=0,measuredFps=0;
  function animate(now){
    requestAnimationFrame(animate);if(!state.ready)return;
    last=now;
    // Cap mobile presentation at 30fps. Simulation remains at fixed 30Hz.
    if(now-lastRender<(state.quality==='detail'?0:31))return;
    const actualDelta=(now-lastRender)/1000,renderDelta=Math.min(actualDelta,.12);lastRender=now;
    if(state.playing&&!document.hidden){state.time+=renderDelta;sim.advance(renderDelta);}
    controls.autoRotate=state.autoRotate&&!reduced.matches&&state.view!=='scene';controls.autoRotateSpeed=.55;const moved=controls.update();
    if(!state.playing&&!moved&&!state.dirty)return;state.dirty=false;
    for(const entry of mixers)if(state.view==='scene'?!entry.gallery:entry.gallery)entry.mixer.setTime(state.time);
    scene.updateMatrixWorld(true);updateLods();updateFlexHose();updateLights();updateEffects();renderer.render(scene,camera);
    state.frames++;state.frameMs.push(actualDelta*1000);if(state.frameMs.length>300)state.frameMs.shift();
    fpsFrames++;fpsTime+=actualDelta;if(fpsTime>.9){measuredFps=fpsFrames/fpsTime;fpsFrames=0;fpsTime=0;$('fps-value').textContent=Math.round(measuredFps);adapt(measuredFps);}
    hudTimer+=renderDelta;buildingTimer+=renderDelta;
    if(hudTimer>.3){updateHud();publish();hudTimer=0;}
    if(buildingTimer>1){updateBuildingStages().catch(fail);buildingTimer=0;}
  }
  function publish(){
    if(!window.firePreview)window.firePreview={};
    Object.assign(window.firePreview,{ready:state.ready,error:errors[0]||null,errors:[...errors],view:state.view,camera:state.camera,index:state.index,
      quality:state.quality,adaptiveLevel:state.adaptiveLevel,renderScale:renderer.getPixelRatio(),cheapShading:cheapShading(),atlasSize:state.atlas,playing:state.playing,time:state.time,water:sim.water,simulation:sim.snapshot(),
      loadedAssets:[...loadedIds],engineRevision:THREE.REVISION,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      particles:effects?.count||0,crowdCount:district.visible?(crowdHigh?.visible?crowdHigh.count:crowdLow?.count||0):0,fps:measuredFps,frames:state.frames,
      memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},frameIntervalsMs:[...state.frameMs],
      lod:{high:lods.filter(l=>l.levels[0].object.visible).length,low:lods.filter(l=>l.levels[1].object.visible).length},
      cameraPosition:camera.position.toArray(),target:controls.target.toArray(),reducedMotion:reduced.matches,
      setView,setCamera,setIndex,setDamage,setQuality,setWater,setPlaying,reset,
      seek:async time=>{state.time=Math.max(0,Math.min(240,time));sim.seek(state.time);await updateBuildingStages();renderStill();updateHud();return sim.snapshot();},
      setClip:clip=>{state.clip=clip;$('clip').value=clip;if(galleryActor)setClip(galleryActor,clip);renderStill();},
      orbit:(yaw,pitch=0)=>{const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);s.theta+=yaw;s.phi=THREE.MathUtils.clamp(s.phi+pitch,.10,Math.PI*.49);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();renderStill();},
      capture:renderStill,auditActor,
    });
    $('triangles-value').textContent=renderer.info.render.triangles.toLocaleString('en-US');$('draws-value').textContent=String(renderer.info.render.calls);
    $('particles-value').textContent=String(effects?.count||0);$('crowd-value').textContent=district.visible?(crowdHigh?.visible?crowdHigh.count:crowdLow?.count||0)+' / instanced':'0';
  }
  function fail(error){errors.push(String(error.stack||error));$('error').hidden=false;$('error').textContent='התצוגה לא נטענה. נדרש דפדפן עם WebGL 2 וקובצי החבילה המלאים.';$('loading').hidden=true;console.error(error);publish();}
  controls.addEventListener('change',()=>{state.dirty=true;});
  $('water').addEventListener('click',()=>setWater(!sim.water));$('target').addEventListener('change',()=>{sim.target=Number($('target').value);state.dirty=true;updateHud();});
  $('spread').addEventListener('click',()=>{sim.enabled=!sim.enabled;$('spread').setAttribute('aria-pressed',String(sim.enabled));});
  $('pause').addEventListener('click',()=>setPlaying(!state.playing));$('reset').addEventListener('click',()=>reset().catch(fail));
  $('near').addEventListener('click',()=>setCamera('near'));$('far').addEventListener('click',()=>setCamera('far'));$('home').addEventListener('click',()=>frameCamera(true));
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>setView(button.dataset.view).catch(fail));
  $('previous').addEventListener('click',()=>setIndex(state.index-1).catch(fail));$('next').addEventListener('click',()=>setIndex(state.index+1).catch(fail));
  $('damage').addEventListener('change',()=>setDamage($('damage').value).catch(fail));$('clip').addEventListener('change',()=>{state.clip=$('clip').value;state.dirty=true;if(galleryActor)setClip(galleryActor,state.clip);});
  $('quality').addEventListener('change',()=>setQuality($('quality').value));
  $('atlas-size').addEventListener('change',()=>{state.atlas=Number($('atlas-size').value);state.dirty=true;effects.setAtlasSize(state.atlas);publish();});
  $('rotate').addEventListener('click',()=>{state.autoRotate=!state.autoRotate;$('rotate').setAttribute('aria-pressed',String(state.autoRotate));});
  $('metrics-toggle').addEventListener('click',()=>{$('metrics').hidden=!$('metrics').hidden;$('metrics-toggle').setAttribute('aria-pressed',String(!$('metrics').hidden));});
  $('info').addEventListener('click',()=>$('about').showModal());$('close-info').addEventListener('click',()=>$('about').close());
  $('scene').addEventListener('keydown',event=>{const mapping={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]};if(mapping[event.key]){event.preventDefault();window.firePreview.orbit(...mapping[event.key]);}if(event.key===' '){event.preventDefault();setPlaying(!state.playing);}if(event.key==='Home')frameCamera();});
  document.addEventListener('visibilitychange',()=>{last=performance.now();lastRender=performance.now();});
  $('scene').addEventListener('webglcontextrestored',()=>{state.dirty=true;renderer.shadowMap.needsUpdate=true;});
  reduced.addEventListener('change',()=>{if(reduced.matches){setPlaying(false);state.autoRotate=false;}publish();});
  window.addEventListener('resize',()=>resize(true));resize();
  try{await setup();setPlaying(!reduced.matches);last=performance.now();lastRender=last;requestAnimationFrame(animate);renderStill();}
  catch(error){fail(error);}
})().catch(error=>{
  document.getElementById('loading').hidden=true;const box=document.getElementById('error');box.hidden=false;
  box.textContent='לא ניתן להפעיל תלת־ממד בדפדפן הזה. נדרש WebGL ותוכן התיקייה המלא.';
  window.firePreview={ready:false,error:String(error)};console.error(error);
});

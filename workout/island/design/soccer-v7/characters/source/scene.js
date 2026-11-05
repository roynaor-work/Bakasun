/**
 * Offline lighting and two small presentation environments. Three.js r160.
 * All artwork is synthetic; no external textures, fonts, logos or likenesses.
 * Coordinates are metres, Y up, Z forward. The floor stays fixed in world space.
 */
export function createScene(THREE, scene, renderer) {
  const geometry = new Set(), materials = new Set(), textures = new Set();
  const G = g => (geometry.add(g), g);
  const M = m => (materials.add(m), m);
  const T = t => (textures.add(t), t);
  const old = { background:scene.background, environment:scene.environment, fog:scene.fog };
  const studio = new THREE.Group(), stadium = new THREE.Group(), lights = new THREE.Group(), contactGroup = new THREE.Group();
  studio.name = 'Neutral portrait studio';
  stadium.name = 'Small evening football ground';
  lights.name = 'Camera-following light rig';
  contactGroup.name='Subtle sole contact penumbrae';
  scene.add(studio, stadium, lights, contactGroup);
  let mode = 'studio', view = 'body', seed = 70717, target = null;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const c = (w,h=w) => Object.assign(document.createElement('canvas'),{width:w,height:h});
  const map = (canvas,color=true) => {
    const t=T(new THREE.CanvasTexture(canvas));
    if(color)t.colorSpace=THREE.SRGBColorSpace;
    t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const mesh = (group,g,m,name,x=0,y=0,z=0) => {
    const o=new THREE.Mesh(g,m);o.name=name;o.position.set(x,y,z);group.add(o);return o;
  };
  const matrix=new THREE.Matrix4(), quat=new THREE.Quaternion(), pos=new THREE.Vector3(), scale=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0);
  const color=new THREE.Color();

  // The low-contrast studio floor has world-fixed 2 m grain. Its receiver plane
  // follows the actor to avoid an edge on an unbounded tracking shot, while the
  // UV offsets exactly cancel the translation. Foot anchors therefore stay
  // fixed against a moving camera rather than sliding with the floor.
  const grain=c(512), gc=grain.getContext('2d');
  gc.fillStyle='#393a38';gc.fillRect(0,0,512,512);
  for(let i=0;i<32000;i++) {
    const tone=45+Math.floor(random()*35);
    gc.fillStyle=`rgba(${tone},${tone},${tone},.13)`;
    gc.fillRect(random()*512,random()*512,.55+random()*.8,.55+random()*.8);
  }
  gc.strokeStyle='rgba(255,255,255,.04)';gc.lineWidth=.7;
  gc.strokeRect(.5,.5,511,511);
  const floorMap=map(grain);floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;
  const studioWidth=160, grainSpan=2;
  floorMap.repeat.set(studioWidth/grainSpan,studioWidth/grainSpan);
  const floor=mesh(studio,G(new THREE.PlaneGeometry(studioWidth,studioWidth)),
    M(new THREE.MeshStandardMaterial({map:floorMap,roughness:.94,metalness:0})),
    'World-aligned textured shadow receiver');
  floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;

  // A calm photographic background keeps every complexion readable without
  // hiding silhouette errors in darkness. Background textures are <=1024 px.
  function background(stadiumMode) {
    const canvas=c(512,256), ctx=canvas.getContext('2d'), grad=ctx.createLinearGradient(0,0,0,256);
    if(stadiumMode) {
      grad.addColorStop(0,'#0a1529');grad.addColorStop(.47,'#34455b');
      grad.addColorStop(.57,'#7b8080');grad.addColorStop(.65,'#394956');grad.addColorStop(1,'#111a26');
    } else {
      grad.addColorStop(0,'#171d24');grad.addColorStop(.43,'#2c3339');
      grad.addColorStop(.56,'#505151');grad.addColorStop(.70,'#363b3d');grad.addColorStop(1,'#222a2e');
    }
    ctx.fillStyle=grad;ctx.fillRect(0,0,512,256);
    const t=map(canvas);t.mapping=THREE.EquirectangularReflectionMapping;return t;
  }
  const studioBackground=background(false), stadiumBackground=background(true);
  const studioFog=new THREE.Fog(0x404446,10,72), stadiumFog=new THREE.Fog(0x31414e,42,150);

  // Actual key shadows provide the silhouette. These faint, height-dependent
  // discs add only the missing short-range penumbra at the soles; they never
  // replace the caster, alter geometry, or hide floor penetration. The caller
  // supplies sole centres after its skinning/IK pass, in world metres.
  const penumbraCanvas=c(96), pc=penumbraCanvas.getContext('2d');
  const radial=pc.createRadialGradient(48,48,0,48,48,47);
  radial.addColorStop(0,'rgba(0,0,0,.54)');radial.addColorStop(.28,'rgba(0,0,0,.37)');
  radial.addColorStop(.62,'rgba(0,0,0,.13)');radial.addColorStop(1,'rgba(0,0,0,0)');
  pc.fillStyle=radial;pc.fillRect(0,0,96,96);
  const penumbraMap=map(penumbraCanvas), contactGeometry=G(new THREE.PlaneGeometry(1,1));
  const contactDiscs=[];
  for(let n=0;n<2;n++) {
    const material=M(new THREE.MeshBasicMaterial({map:penumbraMap,transparent:true,depthWrite:false,opacity:.32,toneMapped:false}));
    const disc=mesh(contactGroup,contactGeometry,material,'Sole contact penumbra');
    disc.rotation.x=-Math.PI/2;disc.visible=false;disc.renderOrder=1;contactDiscs.push(disc);
  }

  // Single generated reflection map, shared by skin, fabric, hair and boots.
  // Broad panels make corneas and PBR curvature legible without additional
  // per-pixel lights. PMREM scratch geometry/materials are disposed immediately.
  const reflectionSettings={frontStrength:8,sigma:0};
  function setReflection(frontStrength=8,sigma=0){
  reflectionSettings.frontStrength=frontStrength;reflectionSettings.sigma=sigma;
  const reflection=new THREE.Scene();reflection.background=new THREE.Color(.15,.17,.20);
  const panelGeometry=new THREE.PlaneGeometry(1,1);
  const panelMaterials=[];
  const panels=[
    {p:[-3.6,3.1,3.5],s:[3.3,4.6],rgb:[5.2,4.6,3.9]},
    {p:[4.2,2.7,1.8],s:[2.2,3.8],rgb:[1.8,2.2,2.9]},
    {p:[2.5,4.0,-3.7],s:[2.3,4.2],rgb:[3.7,4.3,5.3]},
    {p:[0,7,0],s:[5,5],rgb:[1.5,1.7,2.0]}
  ];
  if(frontStrength>0)panels.push({p:[.7,.15,4.0],s:[.80,.80],rgb:[frontStrength,frontStrength*.98,frontStrength*.95],front:true});
  for(const spec of panels) {
    const m=new THREE.MeshBasicMaterial({color:new THREE.Color(...spec.rgb),side:THREE.DoubleSide,toneMapped:false});
    panelMaterials.push(m);const panel=new THREE.Mesh(panelGeometry,m);
    panel.position.fromArray(spec.p);panel.scale.set(...spec.s,1);panel.lookAt(0,spec.front?0:1.0,0);reflection.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileCubemapShader();
  target?.dispose();target=pmrem.fromScene(reflection,sigma,.1,35);scene.environment=target.texture;
  pmrem.dispose();panelGeometry.dispose();panelMaterials.forEach(m=>m.dispose());
  }
  setReflection();

  const hemi=new THREE.HemisphereLight(0xd4dce8,0x514c40,.75);lights.add(hemi);
  const key=new THREE.DirectionalLight(0xffeddc,3.0);key.position.set(-3.0,4.7,4.5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.near=.1;key.shadow.camera.far=18;
  key.shadow.bias=-.00014;key.shadow.normalBias=.0022;key.shadow.radius=2.5;
  key.target.position.set(0,.85,0);lights.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xd7e6ff,.70);fill.position.set(3.5,2.6,4.5);lights.add(fill);
  const rim=new THREE.DirectionalLight(0xd1e0ff,2.2);rim.position.set(2.4,4,-4);lights.add(rim);
  const bounce=new THREE.DirectionalLight(0xffe6c4,.20);bounce.position.set(0,.2,4);lights.add(bounce);

  // The playing surface: one 1024 colour map and one subtle 512 normal map.
  // Lines remain fixed to the real pitch, including the centre circle and boxes.
  const turfCanvas=c(1024), ctx=turfCanvas.getContext('2d');
  ctx.fillStyle='#334d31';ctx.fillRect(0,0,1024,1024);
  const pitchW=44,pitchL=66;
  for(let n=0;n<12;n++) {
    ctx.fillStyle=n%2?'#355b36':'#3d633a';
    ctx.fillRect(0,n*1024/12,1024,1024/12+1);
  }
  for(let i=0;i<68000;i++) {
    const x=random()*1024,y=random()*1024,v=random();
    ctx.strokeStyle=v<.45?'rgba(16,38,20,.24)':v<.9?'rgba(146,166,87,.17)':'rgba(210,212,132,.13)';
    ctx.lineWidth=.35+random()*.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.35-random()*.7,y-1.4-random()*2.4);ctx.stroke();
  }
  ctx.save();ctx.translate(512,512);ctx.scale(1024/pitchW,1024/pitchL);
  ctx.strokeStyle='#d6ddcf';ctx.fillStyle='#d6ddcf';ctx.lineWidth=.1;
  ctx.strokeRect(-18,-28,36,56);ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(18,0);ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();
  const dot=(x,z,r=.11)=>{ctx.beginPath();ctx.arc(x,z,r,0,Math.PI*2);ctx.fill();};dot(0,0);
  for(const s of [-1,1]) {
    ctx.strokeRect(-8,s<0?-28:20,16,8);ctx.strokeRect(-3.5,s<0?-28:25.5,7,2.5);dot(0,s*22.5);
    ctx.beginPath();ctx.arc(0,s*22.5,5,s<0?Math.asin(.5):Math.PI+Math.asin(.5),s<0?Math.PI-Math.asin(.5):Math.PI*2-Math.asin(.5));ctx.stroke();
  }
  ctx.restore();
  const turfMap=map(turfCanvas);
  const normalCanvas=c(512), nc=normalCanvas.getContext('2d');nc.fillStyle='#8080ff';nc.fillRect(0,0,512,512);
  for(let i=0;i<30000;i++) {
    const n=112+Math.floor(random()*33);nc.fillStyle=`rgb(${n},${128+Math.floor(random()*12)},252)`;
    nc.fillRect(random()*512,random()*512,.5,1+random()*2);
  }
  const turfNormal=map(normalCanvas,false);
  const turf=mesh(stadium,G(new THREE.PlaneGeometry(pitchW,pitchL)),
    M(new THREE.MeshStandardMaterial({map:turfMap,normalMap:turfNormal,normalScale:new THREE.Vector2(.22,.22),roughness:.98})),
    'Football turf and fixed line markings',0,.001,0);
  turf.rotation.x=-Math.PI/2;turf.receiveShadow=true;
  const apron=mesh(stadium,G(new THREE.PlaneGeometry(120,120)),
    M(new THREE.MeshStandardMaterial({color:0x222f2e,roughness:.98})),
    'Muted stadium surround',0,-.02,0);apron.rotation.x=-Math.PI/2;apron.receiveShadow=true;

  // Sparse instanced architecture: a continuous low terrace rather than a
  // collection of box props. All dimensions are deliberately secondary to faces.
  const boxGeometry=G(new THREE.BoxGeometry(1,1,1));
  const concrete=M(new THREE.MeshStandardMaterial({color:0x555d62,roughness:.95}));
  const terraces=new THREE.InstancedMesh(boxGeometry,concrete,10);terraces.name='Instanced low terraces';
  for(let side=0;side<2;side++)for(let row=0;row<5;row++) {
    pos.set((side?1:-1)*(23.5+row*.85),row*.38,0);scale.set(.9,.38*(row+1),57);
    matrix.compose(pos,quat.identity(),scale);terraces.setMatrixAt(side*5+row,matrix);
  }
  terraces.receiveShadow=true;stadium.add(terraces);
  const seats=new THREE.InstancedMesh(boxGeometry,M(new THREE.MeshStandardMaterial({roughness:.87,metalness:0})),360);
  seats.name='Instanced muted seats';
  const bodies=new THREE.InstancedMesh(G(new THREE.CylinderGeometry(.145,.19,.49,5,1)),
    M(new THREE.MeshStandardMaterial({roughness:.97})),360);
  bodies.name='Instanced distant spectators';
  const heads=new THREE.InstancedMesh(G(new THREE.IcosahedronGeometry(.105,0)),
    M(new THREE.MeshStandardMaterial({roughness:.86})),360);
  heads.name='Instanced spectator heads';
  const shirts=[0x384d55,0x49615b,0x9a947e,0x7a6657,0x445169,0x5f7777,0x9f9a87];
  const skin=[0xb58c6b,0x77543f,0xd1a184,0x8b6654,0xa97958,0xc38f6c];
  for(let i=0;i<360;i++) {
    const side=i<180?-1:1,row=Math.floor((i%180)/36),column=i%36;
    const x=side*(23.5+row*.85),z=(column-17.5)*1.4+(random()-.5)*.15;
    const baseY=(row+1)*.38+.10;
    quat.setFromAxisAngle(up,-side*Math.PI/2);
    matrix.compose(pos.set(x,baseY,z),quat,scale.set(.42,.12,.41));seats.setMatrixAt(i,matrix);
    seats.setColorAt(i,color.set(i%4?0x3c6262:0x606c77));
    matrix.compose(pos.set(x,baseY+.30,z),quat,scale.set(.84+random()*.18,.86+random()*.19,.85));bodies.setMatrixAt(i,matrix);
    bodies.setColorAt(i,color.set(shirts[Math.floor(random()*shirts.length)]));
    matrix.compose(pos.set(x,baseY+.66,z),quat,scale.set(1,1.08,1));heads.setMatrixAt(i,matrix);
    heads.setColorAt(i,color.set(skin[Math.floor(random()*skin.length)]));
  }
  for(const o of [seats,bodies,heads]) {o.instanceMatrix.needsUpdate=true;o.instanceColor.needsUpdate=true;stadium.add(o);}

  const metal=M(new THREE.MeshStandardMaterial({color:0xe2e5df,roughness:.43,metalness:.18}));
  const poleGeometry=G(new THREE.CylinderGeometry(1,1,1,8,1));
  const poles=new THREE.InstancedMesh(poleGeometry,metal,20);poles.name='Instanced goal frames';
  let p=0;
  function pole(a,b,r) {
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=to.clone().sub(from);
    quat.setFromUnitVectors(up,d.clone().normalize());matrix.compose(from.add(to).multiplyScalar(.5),quat,scale.set(r,d.length(),r));poles.setMatrixAt(p++,matrix);
  }
  // Nets use lines rather than overdraw-heavy transparent planes.
  const netPoints=[];
  for(const s of [-1,1]) {
    const z=s*28,back=s*29.5;
    pole([-2.5,.04,z],[-2.5,2.05,z],.05);pole([2.5,.04,z],[2.5,2.05,z],.05);pole([-2.5,2.05,z],[2.5,2.05,z],.05);
    pole([-2.5,1.85,back],[2.5,1.85,back],.021);
    for(const x of [-2.5,2.5]) {pole([x,.03,z],[x,.03,back],.021);pole([x,.03,back],[x,1.85,back],.021);pole([x,2.05,z],[x,1.85,back],.018);}
    for(let i=0;i<=25;i++) {const x=-2.5+i*.2;netPoints.push(x,.04,back,x,1.85,back,x,1.85,back,x,2.05,z);}
    for(let i=0;i<=10;i++) {const y=.04+i*.18;netPoints.push(-2.5,y,back,2.5,y,back);for(const x of [-2.5,2.5])netPoints.push(x,y,z,x,y,back);}
  }
  poles.count=p;poles.instanceMatrix.needsUpdate=true;stadium.add(poles);
  const netGeometry=G(new THREE.BufferGeometry());netGeometry.setAttribute('position',new THREE.Float32BufferAttribute(netPoints,3));
  const net=new THREE.LineSegments(netGeometry,M(new THREE.LineBasicMaterial({color:0x9daea5,transparent:true,opacity:.37})));net.name='Fine goal net';stadium.add(net);

  const lampMaterial=M(new THREE.MeshBasicMaterial({color:0xc4d6e4,toneMapped:false}));
  const lamps=new THREE.InstancedMesh(boxGeometry,lampMaterial,8);lamps.name='Instanced distant light panels';
  for(let i=0;i<8;i++) {
    const side=i<4?-1:1,z=((i%4)-1.5)*15;
    matrix.compose(pos.set(side*27,7.4,z),quat.setFromAxisAngle(up,-side*.34),scale.set(.3,.4,2.2));lamps.setMatrixAt(i,matrix);
  }
  stadium.add(lamps);

  function setMode(nextMode='studio', nextView='body') {
    mode=nextMode==='stadium'?'stadium':'studio';view=nextView;
    studio.visible=mode==='studio';stadium.visible=mode==='stadium';
    contactGroup.visible=view!=='pitch';
    scene.background=mode==='studio'?studioBackground:stadiumBackground;
    scene.fog=mode==='studio'?studioFog:stadiumFog;
    const pitch=view==='pitch';
    key.shadow.mapSize.set(pitch?512:1024,pitch?512:1024);
    if(key.shadow.map) {key.shadow.map.dispose();key.shadow.map=null;}
    const cam=key.shadow.camera;
    cam.left=pitch?-23:-2.25;cam.right=pitch?23:2.25;
    cam.bottom=pitch?-32:-2.0;cam.top=pitch?32:3.0;cam.far=pitch?90:18;cam.updateProjectionMatrix();
    key.position.set(...(pitch?[-12,22,16]:[-3,4.7,4.5]));
    key.shadow.normalBias=pitch?.025:.0022;
    key.intensity=mode==='studio'?3.0:3.35;
    fill.intensity=mode==='studio'?.70:.84;
    rim.intensity=mode==='studio'?2.2:2.4;
    hemi.intensity=mode==='studio'?.75:.88;
    return api;
  }
  function update(_time, rootOffset) {
    const x=rootOffset?.x??rootOffset?.[0]??0,z=rootOffset?.z??rootOffset?.[2]??0;
    floor.position.x=x;floor.position.z=z;
    floorMap.offset.set(x/grainSpan,-z/grainSpan);
    if(view==='pitch') lights.position.set(0,0,0);
    else lights.position.set(x,0,z);
  }
  function setContacts(soleCentres=[]) {
    for(let n=0;n<contactDiscs.length;n++) {
      const disc=contactDiscs[n], point=soleCentres[n];
      if(!point) {disc.visible=false;continue;}
      const x=point.x??point[0],y=point.y??point[1],z=point.z??point[2];
      const height=Math.max(0,y);
      disc.visible=Number.isFinite(x+y+z)&&height<.28;
      disc.position.set(x,mode==='studio'?.0015:.0035,z);
      disc.scale.set(.33+height*.7,.24+height*.7,1);
      disc.material.opacity=.32*Math.exp(-height/0.075);
    }
  }
  const metrics={
    generatedTextureSizes:[[512,512],[512,256],[512,256],[96,96],[1024,1024],[512,512]],
    crowdInstances:360,crowdDrawCalls:2,seatInstances:360,environmentTriangles:0,
    shadowMapHero:1024,shadowMapPitch:512,environmentGeneratedLocally:true,reflectionSettings
  };
  stadium.traverse(o=>{if(o.isMesh)metrics.environmentTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
  const api={studio,stadium,lights,keyLight:key,floor,metrics,setMode,update,setContacts,setReflection,dispose() {
    scene.remove(studio,stadium,lights,contactGroup);
    stadium.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    if(key.shadow.map)key.shadow.map.dispose();target?.dispose();
    scene.background=old.background;scene.environment=old.environment;scene.fog=old.fog;
  }};
  setMode();update(0,[0,0,0]);return api;
}

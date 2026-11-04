/* Original unbranded arena presentation, metres, +Y up, court long axis X.
 * Only three r160 is required. Crowd uses a read-only repository render source;
 * see arena-provenance.json. No remote resources, build, or render-to-texture pass.
 */
export function createArena(THREE) {
  const group = new THREE.Group(); group.name = 'hoops_arena_v6';
  const staticGroup = new THREE.Group(); staticGroup.name = 'arena_static_export';
  const dynamicGroup = new THREE.Group(); dynamicGroup.name = 'arena_runtime_presentation';
  const roofGroup = new THREE.Group(); roofGroup.name='roof_trusses_camera_optional';staticGroup.add(roofGroup);
  group.add(staticGroup, dynamicGroup);
  const resources = [], loads = [], batches = new Map();
  const loader = new THREE.TextureLoader();
  function texture(name, color = false) {
    let resolve, reject; loads.push(new Promise((a,b) => {resolve=a;reject=b;}));
    const t=loader.load(new URL(name,import.meta.url).href,()=>resolve(),undefined,reject);
    if(color)t.colorSpace=THREE.SRGBColorSpace;
    t.anisotropy=4; resources.push(t); return t;
  }
  const mats={
    structure: new THREE.MeshStandardMaterial({color:0x101721,roughness:.74,metalness:.38}),
    concrete: new THREE.MeshStandardMaterial({color:0x282d34,roughness:.95}),
    steel: new THREE.MeshStandardMaterial({color:0x637078,roughness:.35,metalness:.75}),
    white: new THREE.MeshStandardMaterial({color:0xdcdcd3,roughness:.48,metalness:.12}),
    amber: new THREE.MeshStandardMaterial({color:0xbb6840,roughness:.48}),
    teal: new THREE.MeshStandardMaterial({color:0x1e5962,roughness:.5}),
    rubber: new THREE.MeshStandardMaterial({color:0x101820,roughness:.9}),
    rim: new THREE.MeshStandardMaterial({color:0xd35a24,roughness:.29,metalness:.6}),
    net: new THREE.MeshStandardMaterial({color:0xe1d8c3,roughness:.85}),
    glass: new THREE.MeshStandardMaterial({color:0xdce7e7,roughness:.1,metalness:.16,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}),
    lamps: new THREE.MeshBasicMaterial({color:0xffedce,toneMapped:false}),
    ledAmber: new THREE.MeshBasicMaterial({color:0xd17b47,toneMapped:false}),
    ledTeal: new THREE.MeshBasicMaterial({color:0x4b9298,toneMapped:false}),
  };
  mats.roofSteel=mats.steel;mats.roofHousing=mats.structure;mats.roofLamps=mats.lamps;
  const dummy=new THREE.Object3D();
  function collect(key, geo, p=[0,0,0], scale=[1,1,1], rot=[0,0,0]) {
    dummy.position.set(...p);dummy.scale.set(...scale);dummy.rotation.set(...rot);dummy.updateMatrix();
    geo=geo.index?geo.toNonIndexed():geo;geo.applyMatrix4(dummy.matrix);
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geo);
  }
  function box(key,p,size,rot=[0,0,0]) {collect(key,new THREE.BoxGeometry(1,1,1),p,size,rot);}
  function rod(key,a,b,r=.04,segments=6) {
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
    const geo=new THREE.CylinderGeometry(r,r,delta.length(),segments,1);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    geo.translate(...av.add(bv).multiplyScalar(.5).toArray());collect(key,geo);
  }
  function merge(list) {
    const result=new THREE.BufferGeometry();
    for(const name of ['position','normal','uv']) {
      const size=name==='uv'?2:3, total=list.reduce((n,g)=>n+g.attributes.position.count,0),data=new Float32Array(total*size);
      let at=0;for(const g of list){const attr=g.attributes[name];if(attr)data.set(attr.array,at);at+=g.attributes.position.count*size;}
      result.setAttribute(name,new THREE.BufferAttribute(data,size));
    }
    result.computeBoundingSphere();list.forEach(g=>g.dispose());return result;
  }
  // The full court including runoff is a single PBR draw. The normal is restrained
  // maple grain; a worn-lane roughness map breaks up ceiling-light reflections.
  const floorMat=new THREE.MeshPhysicalMaterial({clearcoat:.6,clearcoatRoughness:.24,map:texture('parquet-albedo.webp',true),normalMap:texture('parquet-normal.webp'),roughnessMap:texture('parquet-roughness.webp'),normalScale:new THREE.Vector2(.28,.28),roughness:.93,metalness:.12,envMapIntensity:1.1});
  const floorGeometry=new THREE.PlaneGeometry(32,19);floorGeometry.computeTangents();
  const floor=new THREE.Mesh(floorGeometry,floorMat);floor.name='regulation_court_28x15_parquet';floor.rotation.x=-Math.PI/2;floor.position.y=.012;floor.receiveShadow=true;staticGroup.add(floor);
  // A baked soft strip-light sheen breaks up the varnish at broadcast distances.
  // This is a one-draw highlight layer, not a screen-space or planar mirror.
  const sheenCanvas=document.createElement('canvas');sheenCanvas.width=512;sheenCanvas.height=512;
  const sh=sheenCanvas.getContext('2d');sh.clearRect(0,0,512,512);sh.filter='blur(7px)';
  for(const [x,z] of [[-9,3.8],[-3,3.8],[3,3.8],[9,3.8],[-9,-4],[3,-4]]){
    const px=(x+16)/32*512,pz=(z+9.5)/19*512;
    sh.fillStyle='rgba(255,245,221,.52)';sh.fillRect(px-28,pz-3,56,6);
  }
  const sheenTexture=new THREE.CanvasTexture(sheenCanvas);sheenTexture.colorSpace=THREE.SRGBColorSpace;resources.push(sheenTexture);
  const sheen=new THREE.Mesh(new THREE.PlaneGeometry(32,19),new THREE.MeshBasicMaterial({map:sheenTexture,transparent:true,opacity:.19,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  sheen.rotation.x=-Math.PI/2;sheen.position.y=.015;sheen.name='baked_lacquer_light_sheen';staticGroup.add(sheen);
  box('structure',[0,-.16,0],[33,.3,20]);
  box('rubber',[0,-.09,0],[45,.1,32]);
  // Bowl: steep, close seating; the lit court and dark upper bowl make the
  // broadcast eye travel to the play without oversaturated coloured spotlights.
  const rows=9;
  for(let row=0;row<rows;row++){
    const y=.15+row*.53,z=10.35+row*.84,x=16.9+row*.84;
    for(const sign of [-1,1]){
      box('concrete',[0,y,sign*z],[35,.32,.92]);
      box('concrete',[sign*x,y,0],[.92,.32,20]);
      if(row===0||row===rows-1){
        rod('steel',[-17,y+.75,sign*(z+.43)],[17,y+.75,sign*(z+.43)],.025);
        rod('steel',[sign*(x+.43),y+.75,-10],[sign*(x+.43),y+.75,10],.025);
      }
    }
  }
  // Dark acoustic wall, ribbon LED and inset vomitories.
  for(const sign of [-1,1]){
    box('structure',[0,5.8,sign*18.2],[49,3,.36]);
    box('structure',[sign*24.2,5.8,0],[.36,3,36]);
    box('ledTeal',[0,5.5,sign*18.01],[46,.13,.04]);
    box('ledAmber',[sign*24.01,5.5,0],[.04,.13,34]);
    for(let x=-21;x<=21;x+=7){
      box('steel',[x,6.5,sign*18.05],[.12,3,.12]);
      box('rubber',[x,3.7,sign*17.85],[1.45,2.2,.05]);
    }
  }
  // Upper roof and suspended trusses. Thin beams, not an opaque roof, retain a
  // visible rafter silhouette and allow the live camera to see the video cube.
  for(const z of [-7.1,7.1]){
    rod('roofSteel',[-20,10.45,z],[20,10.45,z],.065);
    rod('roofSteel',[-20,11.05,z],[20,11.05,z],.065);
    for(let x=-20;x<20;x+=2){
      rod('roofSteel',[x,10.45,z],[x+2,11.05,z],.025);
      rod('roofSteel',[x,11.05,z],[x+2,10.45,z],.025);
    }
    for(const x of [-12,-6,0,6,12]){
      box('roofHousing',[x,10.28,z],[1.5,.25,.75]);
      box('roofLamps',[x,10.12,z],[1.28,.035,.55]);
    }
  }
  for(const x of [-17,17])rod('roofSteel',[x,10.75,-12],[x,10.75,12],.06);
  // Four thick, padded professional stanchions; hoop units are in metres.
  for(const sign of [-1,1]){
    const rimX=sign*12.425,boardX=sign*12.85;
    box(sign>0?'amber':'teal',[sign*15.35,.4,0],[1.25,.8,1.55]);
    box('rubber',[sign*15.35,.06,0],[1.35,.1,1.65]);
    rod('steel',[sign*15.5,.65,0],[sign*15.25,4.2,0],.12,8);
    rod('steel',[sign*15.25,4.2,0],[boardX,3.8,0],.10,8);
    box('glass',[boardX,3.675,0],[.035,1.05,1.8]);
    for(const z of [-.91,.91])box('white',[boardX,3.675,z],[.05,1.1,.04]);
    for(const y of [3.14,4.21])box('white',[boardX,y,0],[.05,.04,1.86]);
    for(const z of [-.295,.295])box('white',[boardX-sign*.025,3.36,z],[.045,.45,.027]);
    for(const y of [3.145,3.58])box('white',[boardX-sign*.025,y,0],[.045,.027,.62]);
    box('rubber',[boardX,3.12,0],[.10,.12,1.86]);
    const rim=new THREE.TorusGeometry(.244,.019,6,40);collect('rim',rim,[rimX,3.05,0],[1,1,1],[Math.PI/2,0,0]);
    rod('rim',[rimX,3.05,0],[boardX,3.05,0],.027,6);
    // Crossed diamond cords plus two net bands: actual open geometry.
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2,b=a+Math.PI/6;
      const top=[rimX+.23*Math.cos(a),3.03,.23*Math.sin(a)];
      const mid=[rimX+.16*Math.cos(b),2.78,.16*Math.sin(b)];
      const low=[rimX+.12*Math.cos(a),2.60,.12*Math.sin(a)];
      rod('net',top,mid,.0038,4);rod('net',mid,low,.0038,4);
      rod('net',top,[rimX+.16*Math.cos(a-Math.PI/6),2.78,.16*Math.sin(a-Math.PI/6)],.0038,4);
    }
    for(const [r,y] of [[.16,2.78],[.12,2.60]])collect('net',new THREE.TorusGeometry(r,.0038,4,24),[rimX,y,0],[1,1,1],[Math.PI/2,0,0]);
    box('structure',[boardX,4.55,0],[.12,.42,.67]);
  }
  // Benches, scorer's desk, equipment trolleys and floor-level lens positions.
  const chairPositions=[];
  for(const side of [-1,1]){
    for(let i=0;i<8;i++){
      const x=side*(3+i*.76),z=-9.12;
      box(side<0?'teal':'amber',[x,.51,z],[.52,.12,.49]);
      box(side<0?'teal':'amber',[x,.91,z-.22],[.52,.65,.08]);
      for(const ox of [-.2,.2])for(const oz of [-.16,.16])rod('steel',[x+ox,.04,z+oz],[x+ox,.48,z+oz],.018,4);
    }
    box('rubber',[side*10.5,.46,-9.06],[1.22,.9,.72]);
    box('white',[side*10.5,.97,-9.06],[1.22,.12,.72]);
    for(let i=0;i<4;i++)box('white',[side*(10.1+i*.2),1.1,-9.06],[.075,.22,.075]);
  }
  box('structure',[0,.45,-9.14],[4.2,.9,.72]);
  box('ledTeal',[0,.52,-8.76],[3.95,.44,.02]);
  for(const x of [-1.3,0,1.3]){box('rubber',[x,1.04,-9.13],[.65,.40,.07],[.25,0,0]);rod('steel',[x,.88,-9.12],[x,1.04,-9.12],.02);}
  // Camera bodies and low stools; foreground people are supplied by the actor
  // system. These lenses remain unbranded and do not add point lights.
  for(const sign of [-1,1])for(const z of [-4,-2.1,2.2,4.2]){
    const x=sign*14.9;
    box('rubber',[x,.63,z],[.40,.24,.22]);
    const lens=new THREE.CylinderGeometry(.09,.09,.24,8);collect('structure',lens,[x-sign*.26,.64,z],[1,1,1],[0,0,Math.PI/2]);
    rod('steel',[x,.10,z],[x,.55,z],.025);
    for(const dz of [-.2,.2])rod('steel',[x,.3,z],[x-sign*.2,.03,z+dz],.018,4);
    box('rubber',[x+sign*.4,.21,z],[.27,.12,.28]);
  }
  // Flush the static batches. Exporting staticGroup produces a conventional
  // glTF scene with PBR maps; all animations and crowd instancing remain runtime.
  for(const [name,geos] of batches){
    const mesh=new THREE.Mesh(merge(geos),mats[name]);mesh.name='arena_'+name;mesh.castShadow=!['lamps','ledAmber','ledTeal','glass','net'].includes(name);mesh.receiveShadow=['concrete','rubber','structure'].includes(name);(name.startsWith('roof')?roofGroup:staticGroup).add(mesh);
  }
  // Nine rows of physical seats, one geometry/material draw and per-seat tint.
  const crowdSpots=[];
  for(let row=0;row<rows;row++){
    const y=.35+row*.53;
    for(const side of [-1,1]){
      for(let i=0;i<53;i++){
        const x=(i-26)*.63;if(Math.abs(x)%6.5<.48)continue;
        crowdSpots.push({x,y,z:side*(10.40+row*.84),yaw:side>0?Math.PI:0,row});
      }
      for(let i=0;i<30;i++){
        const z=(i-14.5)*.62;if(Math.abs(z)<.55)continue;
        crowdSpots.push({x:side*(17.0+row*.84),y,z,yaw:side>0?-Math.PI/2:Math.PI/2,row});
      }
    }
  }
  const seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.46,.15,.46),new THREE.MeshStandardMaterial({color:0x53606a,roughness:.74}),crowdSpots.length);seats.name='instanced_seat_pads';
  const tint=new THREE.Color();
  crowdSpots.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(i,dummy.matrix);seats.setColorAt(i,tint.setHex(i%7===0?0x775748:0x344450));});
  dynamicGroup.add(seats);
  const atlas=texture('crowd-atlas.webp',true);atlas.magFilter=THREE.LinearFilter;atlas.minFilter=THREE.LinearMipmapLinearFilter;
  const crowdMat=new THREE.MeshBasicMaterial({map:atlas,alphaTest:.35,side:THREE.DoubleSide,color:0xe0e3e6});
  const crowdGeo=new THREE.PlaneGeometry(.81,1.42,1,2),cells=new Float32Array(crowdSpots.length*2),phases=new Float32Array(crowdSpots.length);
  crowdSpots.forEach((p,i)=>{cells[i*2]=(i*7%4)*2;cells[i*2+1]=(i*17)%6;phases[i]=i*1.618;});
  crowdGeo.setAttribute('atlasCell',new THREE.InstancedBufferAttribute(cells,2));crowdGeo.setAttribute('crowdPhase',new THREE.InstancedBufferAttribute(phases,1));
  const crowdUniform={value:0};
  crowdMat.onBeforeCompile=shader=>{
    shader.uniforms.arenaTime=crowdUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 atlasCell;\nattribute float crowdPhase;\nuniform float arenaTime;\nvarying vec2 vArenaCell;\nvarying float vArenaPose;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArenaCell=atlasCell;\nvArenaPose=step(0.35,sin(arenaTime*1.3+crowdPhase));\ntransformed.x += sin(arenaTime*1.6+crowdPhase)*0.018*max(0.0,position.y);');
    shader.fragmentShader='varying vec2 vArenaCell;\nvarying float vArenaPose;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, (vMapUv + vec2(vArenaCell.x+vArenaPose, 5.0-vArenaCell.y))/vec2(8.0,6.0) )'));
  };
  crowdMat.customProgramCacheKey=()=> 'arena-v6-atlas-crowd-1';
  const crowd=new THREE.InstancedMesh(crowdGeo,crowdMat,crowdSpots.length);crowd.name='instanced_animated_fictional_crowd';
  crowdSpots.forEach((p,i)=>{
    const height=.94+(i%9)*.016;
    dummy.position.set(p.x,p.y+.72*height,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(1,height,1);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);
  });crowd.frustumCulled=false;dynamicGroup.add(crowd);
  // Four synchronized video faces use ONE 768×384 canvas updated at only 6 Hz.
  const video=document.createElement('canvas');video.width=768;video.height=384;
  const ctx=video.getContext('2d',{alpha:false}),videoTexture=new THREE.CanvasTexture(video);videoTexture.colorSpace=THREE.SRGBColorSpace;resources.push(videoTexture);
  const videoMat=new THREE.MeshBasicMaterial({map:videoTexture,toneMapped:false});
  const cube=new THREE.Group();cube.name='animated_centre_video_cube';cube.position.y=7.4;dynamicGroup.add(cube);
  const cubeBody=new THREE.Mesh(new THREE.BoxGeometry(4.8,2.7,4.8),mats.structure);cubeBody.name='video_cube_housing';cube.add(cubeBody);
  for(let i=0;i<4;i++){
    const face=new THREE.Mesh(new THREE.PlaneGeometry(4.55,2.28),videoMat),a=i*Math.PI/2;
    face.position.set(Math.sin(a)*2.415,0,Math.cos(a)*2.415);face.rotation.y=a;face.name='video_face_'+i;cube.add(face);
  }
  // Suspension is static geometry, therefore available to static GLB export.
  for(const x of [-1.8,1.8])for(const z of [-1.8,1.8]){
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,3.2,4),mats.steel);cable.position.set(x,10.3,z);cable.name='video_cube_suspension';roofGroup.add(cable);
  }
  // A small equirectangular ceiling-light probe provides genuine PBR specular
  // response without a costly planar mirror. The caller can PMREM this texture.
  const probe=document.createElement('canvas');probe.width=1024;probe.height=512;
  const pc=probe.getContext('2d');pc.fillStyle='#101923';pc.fillRect(0,0,1024,512);
  for(const x of [70,210,350,490,630,770,910]){
    const gradient=pc.createRadialGradient(x,120,2,x,120,70);gradient.addColorStop(0,'#fff4d8');gradient.addColorStop(.2,'#e7ded0');gradient.addColorStop(.55,'#4a4c4e');gradient.addColorStop(1,'#101923');pc.fillStyle=gradient;pc.fillRect(x-70,30,140,180);
    pc.fillStyle='#fff4db';pc.fillRect(x-17,111,34,9);
  }
  const environment=new THREE.CanvasTexture(probe);environment.mapping=THREE.EquirectangularReflectionMapping;environment.colorSpace=THREE.SRGBColorSpace;resources.push(environment);
  const hemi=new THREE.HemisphereLight(0xb8c9de,0x3b271c,.72);group.add(hemi);
  const key=new THREE.DirectionalLight(0xffedce,3.2);key.position.set(-6,16,8);key.target.position.set(0,0,0);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-18,right:18,top:13,bottom:-13,near:.1,far:45});key.shadow.bias=-.00035;key.shadow.normalBias=.035;key.shadow.radius=3;group.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xc4d9ef,.65);fill.position.set(10,8,-10);group.add(fill);
  // Analytic pools illuminate the court while keeping the seating bowl darker.
  for(const x of [-9,9]){
    const light=new THREE.SpotLight(0xffedda,180,.0,Math.PI*.36,.7,1.7);light.position.set(x,10,5);light.target.position.set(x,0,-1);group.add(light,light.target);
  }
  let frame=-1;
  function update(t=0){
    crowdUniform.value=t;
    const tick=Math.floor(t*6);if(tick===frame)return;frame=tick;
    const phase=(t%10)/10;
    ctx.fillStyle='#09151d';ctx.fillRect(0,0,768,384);
    const grad=ctx.createLinearGradient(0,0,768,0);grad.addColorStop(0,'#13373f');grad.addColorStop(.49,'#0d1c26');grad.addColorStop(1,'#5c3425');ctx.fillStyle=grad;ctx.fillRect(0,0,768,384);
    ctx.strokeStyle='#39606a';ctx.lineWidth=2;
    for(let i=-6;i<18;i++){const x=i*80+phase*80;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-260,384);ctx.stroke();}
    ctx.fillStyle='#b5bdbb';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText('H O O P S   /   N I G H T   S E S S I O N',384,45);
    ctx.fillStyle='#f3e8d5';ctx.font='bold 100px sans-serif';ctx.fillText('64  :  61',384,185);
    ctx.font='27px sans-serif';ctx.fillStyle='#d5ac72';ctx.fillText('EMBER                 TIDE',384,235);
    ctx.font='bold 27px monospace';ctx.fillStyle='#c4d5d8';ctx.fillText('Q4   /   02:36   /   LIVE',384,303);
    ctx.fillStyle='#ca8751';ctx.fillRect(0,365,768*phase,4);
    for(let y=0;y<384;y+=4){ctx.fillStyle='rgba(0,0,0,.08)';ctx.fillRect(0,y,768,1);}
    videoTexture.needsUpdate=true;
  }
  update(0);
  function counts(root){let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh){const g=o.geometry;triangles+=(g.index?g.index.count:g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);meshes++;}});return {triangles:Math.round(triangles),meshDraws:meshes};}
  const stats={...counts(group),static:counts(staticGroup),dynamic:counts(dynamicGroup),crowdSpectators:crowdSpots.length,crowdDrawCalls:1,seatDrawCalls:1,textureMaxDimension:1024,courtMetres:[28,15],rimHeightMetres:3.05,reflection:'PBR ceiling probe + normal/roughness; no second scene render',jumbotronCanvas:[768,384],jumbotronUpdatesHz:6};
  const anchors={courtCenter:[0,.012,0],rimHome:[-12.425,3.05,0],rimAway:[12.425,3.05,0],photographers:[[-15,.05,-4],[-15,.05,2.2],[15,.05,-4],[15,.05,2.2]],homeBench:[-6,.05,-9.1],awayBench:[6,.05,-9.1],videoCube:[0,7.4,0]};
  const ready=Promise.all(loads).then(()=>true);
  function dispose(){group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)for(const m of [].concat(o.material))m.dispose();});resources.forEach(t=>t.dispose());}
  return {group,staticGroup,dynamicGroup,roofGroup,environment,ready,update,stats,anchors,dispose};
}

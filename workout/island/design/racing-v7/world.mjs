import * as T from 'three';
import {loadGLB,loadTexture,loadSpectator} from './loader.mjs';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

export const themes={
  coast:{name:'דרך החוף',english:'SOLSTICE COAST',description:'האופק פתוח. הדרך שלך.',sky:'#4b7896',horizon:'#f5ce9c',fog:'#d9c3a4',sun:'#ffe0ad',ambient:2.05,sunPower:3.0,exposure:1.06,accent:'#ffb66b'},
  neon:{name:'רובע הלילה',english:'NEON QUARTER',description:'אורות העיר. קצב אחר.',sky:'#081428',horizon:'#29364e',fog:'#172b42',sun:'#8bb7fa',ambient:1.45,sunPower:1.3,exposure:1.22,accent:'#d6f34a'},
  ridge:{name:'מעבר הפסגה',english:'CLOUDLINE RIDGE',description:'עוד פנייה. עוד קצת שמיים.',sky:'#7096af',horizon:'#dce1da',fog:'#b2c5cd',sun:'#ffe7c0',ambient:2.05,sunPower:2.45,exposure:1.04,accent:'#87c7ff'},
};
const scratch=new T.Object3D(),v=new T.Vector3();

export function sampleTrack(track,distance){
  const a=track.samples,n=a.length-1,len=track.length;
  const d=((distance%len)+len)%len;
  let lo=0,hi=n;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(a[mid].s<=d)lo=mid;else hi=mid;}
  const f=(d-a[lo].s)/Math.max(.00001,a[hi].s-a[lo].s);
  const p=new T.Vector3().fromArray(a[lo].p).lerp(v.fromArray(a[hi].p),f);
  const t=new T.Vector3().fromArray(a[lo].t).lerp(v.fromArray(a[hi].t),f).normalize();
  const normal=new T.Vector3().fromArray(a[lo].n).lerp(v.fromArray(a[hi].n),f).normalize();
  return{p,t,n:normal,yaw:Math.atan2(t.x,t.z)};
}
function seeded(seed){let state=seed;return()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};}
function standard(color,extras={}){return new T.MeshStandardMaterial({color,roughness:.8,...extras});}
function basic(color,extras={}){return new T.MeshBasicMaterial({color,...extras});}

function instances(root,name,geometry,material,rows,{shadow=false,split=true}={}){
  if(!rows.length)return null;
  if(split&&rows.length>24&&name!=='Instanced spectators'){
    const cells=new Map(),group=new T.Group();group.name=name+' spatial batches';group.count=rows.length;root.add(group);
    for(const row of rows){const p=row.p||new T.Vector3(row.x||0,row.y||0,row.z||0);const key=`${Math.floor(p.x/96)},${Math.floor(p.z/96)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(row);}
    for(const cell of cells.values())instances(group,name,geometry,material,cell,{shadow,split:false});
    return group;
  }
  const mesh=new T.InstancedMesh(geometry,material,rows.length);mesh.name=name;
  for(let i=0;i<rows.length;i++){
    const r=rows[i];scratch.position.copy(r.p||new T.Vector3(r.x||0,r.y||0,r.z||0));
    scratch.rotation.set(r.rx||0,r.yaw||0,r.rz||0);
    if(r.quaternion)scratch.quaternion.copy(r.quaternion);
    const s=r.scale||1;scratch.scale.set(r.sx||s,r.sy||s,r.sz||s);
    scratch.updateMatrix();mesh.setMatrixAt(i,scratch.matrix);
    if(r.color)mesh.setColorAt(i,new T.Color(r.color));
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=shadow;mesh.receiveShadow=true;
  mesh.computeBoundingSphere();root.add(mesh);return mesh;
}

function labelTexture(text,{color='#d6f34a',bg='#14242d',small=''}={}){
  const c=document.createElement('canvas');c.width=512;c.height=128;
  const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,512,128);
  g.strokeStyle=color;g.lineWidth=3;g.strokeRect(5,5,502,118);
  g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';g.font='bold 43px Arial';g.fillText(text,256,small?50:65);
  if(small){g.font='14px Arial';g.fillStyle='#d7e4e5';g.fillText(small,256,99);}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}

function makeEnvironment(renderer,key){
  const theme=themes[key];
  const c=document.createElement('canvas');c.width=1024;c.height=512;
  const g=c.getContext('2d'),grad=g.createLinearGradient(0,0,0,512);
  grad.addColorStop(0,theme.sky);grad.addColorStop(.45,theme.horizon);grad.addColorStop(.52,key==='neon'?'#10243b':'#d7ccb5');grad.addColorStop(.59,'#31434c');grad.addColorStop(1,'#172632');
  g.fillStyle=grad;g.fillRect(0,0,1024,512);
  // Locally authored large light sources make the paint and glazing readable.
  for(const [x,y,w,h,color] of key==='neon'?[[70,160,10,94,'#73b5ef'],[380,105,29,123,'#eadaae'],[680,139,13,95,'#de6799'],[880,110,17,135,'#73dece']]:[[40,113,320,74,'#fff0d0'],[560,158,280,46,'#e4f2f2']]){
    g.fillStyle=color;g.fillRect(x,y,w,h);
  }
  const tex=new T.CanvasTexture(c);tex.mapping=T.EquirectangularReflectionMapping;tex.colorSpace=T.SRGBColorSpace;
  const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(tex);
  pmrem.dispose();tex.dispose();return target;
}

function makeSky(key){
  const theme=themes[key];
  const uniforms={top:{value:new T.Color(theme.sky)},bottom:{value:new T.Color(theme.horizon)}};
  const material=new T.ShaderMaterial({uniforms,side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 top;uniform vec3 bottom;varying vec3 vDir;
    void main(){float h=normalize(vDir).y;vec3 c=mix(bottom,top,pow(clamp(h*.8+.10,0.,1.),.7));gl_FragColor=vec4(c,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include'),
  });
  const sky=new T.Mesh(new T.SphereGeometry(1400,24,16),material);sky.name='Gradient sky';sky.frustumCulled=false;sky.renderOrder=-10;
  return sky;
}

function preparePrototype(root,name){
  const object=root.getObjectByName(name),parts=[];
  object.updateWorldMatrix(true,true);
  object.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);
    parts.push({geometry,material:o.material});
  });
  if(parts.length>1){
    // Background props share one material and draw per spatial batch. Window
    // emission is encoded separately from the daylight vertex colors.
    for(const part of parts){
      const count=part.geometry.attributes.position.count,colors=new Float32Array(count*3),glow=new Float32Array(count);
      const emitting=part.material.emissiveIntensity>0&&part.material.emissive?.getHex()!==0;
      const color=emitting?part.material.emissive.clone().multiplyScalar(Math.max(.7,part.material.emissiveIntensity)):part.material.color;
      for(let i=0;i<count;i++){color.toArray(colors,i*3);glow[i]=emitting?1:0;}
      part.geometry.setAttribute('color',new T.BufferAttribute(colors,3));part.geometry.setAttribute('glow',new T.BufferAttribute(glow,1));
      for(const attr of Object.keys(part.geometry.attributes))if(!['position','normal','color','glow'].includes(attr))part.geometry.deleteAttribute(attr);
    }
    const geometry=mergeGeometries(parts.map(p=>p.geometry),false);
    for(const part of parts)part.geometry.dispose();
    const material=new T.MeshLambertMaterial({color:'#ffffff',vertexColors:true});
    material.name='Shared prop palette';
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float glow;varying float vGlow;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGlow=glow;');
      shader.fragmentShader='varying float vGlow;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;','vec3 outgoingLight = mix(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance, vColor * 1.15, vGlow);');
    };
    material.customProgramCacheKey=()=> 'racing-v7-prop-palette-1';
    return[{geometry,material}];
  }
  return parts;
}
function placePrototype(group,prototypes,name,rows,opts){
  const meshes=[];
  for(const part of prototypes[name]){
    const material=part.material.clone();material.onBeforeCompile=part.material.onBeforeCompile;material.customProgramCacheKey=part.material.customProgramCacheKey;
    meshes.push(instances(group,name,part.geometry,material,rows,opts));
  }
  return meshes;
}

async function crowdGeometry(pose,shirt){
  const model=await loadSpectator();
  for(const side of ['Left','Right']){
    const arm=model.getObjectByName(side+'Arm'),fore=model.getObjectByName(side+'ForeArm');
    if(pose){arm.rotation.z=side==='Left'?-2.35:2.35;fore.rotation.z=side==='Left'?-.48:.48;}
    else{arm.rotation.z=side==='Left'?-.25:.25;}
  }
  model.updateMatrixWorld(true);
  const geometries=[];let material;
  model.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    o.skeleton.update();const geo=o.geometry.clone();const pos=geo.attributes.position,normal=geo.attributes.normal,uv=geo.attributes.uv;
    const src=new T.Vector3();
    for(let i=0;i<pos.count;i++){
      src.fromBufferAttribute(pos,i);o.applyBoneTransform(i,src);src.applyMatrix4(o.matrixWorld);pos.setXYZ(i,src.x,src.y,src.z);
      if(uv.getX(i)<.125)uv.setX(i,shirt/8+.065);
    }
    for(const name of ['skinIndex','skinWeight'])geo.deleteAttribute(name);
    geo.computeVertexNormals();geometries.push(geo);material=o.material.clone();
  });
  return{geometry:geometries.length===1?geometries[0]:mergeGeometries(geometries),material};
}

export async function createWorld(renderer,key){
  const root=new T.Group();root.name=`Environment • ${key}`;
  const ownedTextures=[];const random=seeded({coast:912,neon:712,ridge:121}[key]);
  const [track,terrain,props,asphalt,normal,orm]=await Promise.all([
    fetch(`./assets/tracks/${key}.json`).then(r=>{if(!r.ok)throw new Error('Track data unavailable');return r.json();}),
    loadGLB(`./assets/tracks/${key}.glb`),loadGLB('./assets/tracks/props.glb'),
    loadTexture('./textures/asphalt-color.webp',true),loadTexture('./textures/asphalt-normal.png'),loadTexture('./textures/asphalt-orm.webp'),
  ]);
  const theme=themes[key];
  const scene=terrain.scene.clone(true);root.add(scene);
  scene.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.receiveShadow=true;if(o.name==='Road'){
    const m=o.material;m.map=asphalt;m.normalMap=normal;m.roughnessMap=orm;m.metalnessMap=orm;m.normalScale.set(.38,.38);
    m.color.set(key==='neon'?'#697a8a':'#acacaa');m.roughness=key==='neon'?.43:.92;m.metalness=key==='neon'?.28:.04;
  }}});
  for(const t of [asphalt,normal,orm]){t.wrapS=t.wrapT=T.RepeatWrapping;t.needsUpdate=true;}
  const environment=makeEnvironment(renderer,key),sky=makeSky(key);root.add(sky);
  const hemisphere=new T.HemisphereLight(key==='neon'?'#8bb6e7':'#c0d4df',key==='coast'?'#b19e79':'#425566',theme.ambient);root.add(hemisphere);
  const sun=new T.DirectionalLight(theme.sun,theme.sunPower);sun.position.set(60,85,-50);root.add(sun);root.add(sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.camera.near=1;sun.shadow.camera.far=180;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=2;
  const rim=new T.DirectionalLight(key==='neon'?'#bb83e5':'#e9f7ff',key==='neon'?1.15:.6);rim.position.set(-30,16,40);root.add(rim);
  const prototypes={};for(const name of ['Palm','Pine','Rock','Guardrail','Streetlamp','Building0','Building1','Building2','Lighthouse','Grandstand'])prototypes[name]=preparePrototype(props.scene,name);

  const ivory=standard('#e8e6ce',{roughness:.82}),curb=standard(key==='neon'?'#6176aa':key==='coast'?'#d16d51':'#5a8396'),yellow=standard('#eac47b',{roughness:.85});
  const edgeRows=[[],[]],dashRows=[],railRows=[],lampRows=[],palmRows=[],pineRows=[],rockRows=[],towerRows=[[],[],[]],pools=[],reflectors=[];
  const L=track.length,W=track.width;
  function at(distance,offset=0,lift=0){const a=sampleTrack(track,distance);return{p:a.p.addScaledVector(a.n,offset).add(new T.Vector3(0,lift,0)),yaw:a.yaw,sample:a};}
  for(let s=0;s<L;s+=3.5){
    const a=sampleTrack(track,s),up=new T.Vector3(0,1,0);
    const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(a.n,up,a.t));
    for(const sign of [-1,1]){
      edgeRows[Math.floor(s/3.5)%2].push({...at(s,sign*(W/2+.32),.052),quaternion:q});
      if(Math.floor(s/3.5)%3===0)reflectors.push(at(s,sign*(W/2+1.2),.72));
    }
  }
  for(let s=0;s<L;s+=9)dashRows.push(at(s,0,.052));
  for(let s=0;s<L;s+=4.2){
    for(const sign of [-1,1])railRows.push(at(s,sign*(W/2+2.05),0));
  }
  for(let s=0;s<L;s+=31){
    const r=at(s,W/2+2.55);r.yaw-=Math.PI/2;lampRows.push(r);
    pools.push(at(s,W/2-1.1,.044));
  }
  for(let s=10;s<L;s+=key==='neon'?17:11){
    for(const sign of [-1,1]){
      const offset=sign*(W/2+8+random()*20),r=at(s,offset,-.4);
      r.scale=.72+random()*.65;r.yaw=random()*Math.PI*2;
      if(key==='coast'&&sign<0)palmRows.push(r);
      if(key==='ridge')pineRows.push(r);
      if(random()>.4&&(key!=='coast'||sign<0))rockRows.push({...at(s+4,offset*.75,-.5),scale:.7+random()*1.7,yaw:random()*6});
    }
  }
  if(key==='neon')for(let s=0;s<L;s+=17){
    for(const sign of [-1,1]){
      const r=at(s,sign*(W/2+24+random()*27),-1);r.sy=.55+random()*1.1;r.sx=r.sz=.65+random()*.55;
      towerRows[Math.floor(random()*3)].push(r);
    }
  }
  edgeRows.forEach((rows,i)=>instances(root,`Curb ${i}`,new T.BoxGeometry(.55,.1,3.48),i?ivory:curb,rows));
  instances(root,'Center lane dashes',new T.BoxGeometry(.12,.018,3.0),key==='ridge'?yellow:ivory,dashRows);
  // Continuous edge markings follow the same sampled road, including vertical grade.
  for(const sign of [-1,1]){
    const verts=[],indices=[];
    for(let i=0;i<track.samples.length;i++){
      const a=track.samples[i];
      for(const off of [sign*(W/2-.24),sign*(W/2-.36)])verts.push(a.p[0]+a.n[0]*off,a.p[1]+.046,a.p[2]+a.n[2]*off);
      if(i){const j=(i-1)*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();root.add(new T.Mesh(g,ivory));
  }
  placePrototype(root,prototypes,'Guardrail',railRows);
  placePrototype(root,prototypes,'Streetlamp',lampRows);
  placePrototype(root,prototypes,'Palm',palmRows,{shadow:false});
  placePrototype(root,prototypes,'Pine',pineRows,{shadow:false});
  placePrototype(root,prototypes,'Rock',rockRows);
  for(let i=0;i<3;i++)placePrototype(root,prototypes,`Building${i}`,towerRows[i]);
  instances(root,'Guardrail reflectors',new T.BoxGeometry(.07,.12,.11),basic(key==='neon'?'#9fd1ff':'#f8d990'),reflectors);

  // Light pools do not require dozens of dynamic shadow-casting point lights.
  const poolCanvas=document.createElement('canvas');poolCanvas.width=128;poolCanvas.height=128;
  const pg=poolCanvas.getContext('2d'),grad=pg.createRadialGradient(64,64,1,64,64,64);grad.addColorStop(0,'rgba(255,225,168,.50)');grad.addColorStop(.35,'rgba(255,220,150,.20)');grad.addColorStop(1,'rgba(255,210,135,0)');pg.fillStyle=grad;pg.fillRect(0,0,128,128);
  const poolTexture=new T.CanvasTexture(poolCanvas);poolTexture.colorSpace=T.SRGBColorSpace;ownedTextures.push(poolTexture);
  const poolMat=basic('#fff2d9',{map:poolTexture,transparent:true,opacity:key==='neon'?.7:.06,depthWrite:false,blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-1});
  for(const r of pools){r.rx=-Math.PI/2;r.yaw=0;r.sx=7;r.sy=11;}
  instances(root,'Ground illumination',new T.PlaneGeometry(1,1),poolMat,pools);

  const signMap=labelTexture(key==='neon'?'NIGHT / 02':key==='coast'?'COAST / 01':'RIDGE / 03',{color:theme.accent,small:'OPEN CIRCUIT   •   KEEP THE LINE'});ownedTextures.push(signMap);
  const turnMap=labelTexture('› › ›',{color:'#f4dfab',bg:'#203441'});ownedTextures.push(turnMap);
  const signMat=basic('#ffffff',{map:signMap,side:T.DoubleSide}),turnMat=basic('#ffffff',{map:turnMap,side:T.DoubleSide});
  const gantries=[],signRows=[],turnRows=[],gantryPoles=[],gantryCross=[];
  for(let s=65;s<L;s+=210){
    const a=at(s);gantries.push(a);
    for(const sign of [-1,1]){
      const p=at(s,sign*(W/2+1.0),3.3);
      gantryPoles.push(p);
    }
    gantryCross.push({...a,p:a.p.clone().add(new T.Vector3(0,6.2,0))});
    const face=at(s,0,6.35);face.yaw+=Math.PI;signRows.push(face);
  }
  instances(root,'Gantry supports',new T.CylinderGeometry(.13,.18,6.6,7),standard('#3c4f5a',{metalness:.5}),gantryPoles);
  instances(root,'Gantry crossbars',new T.BoxGeometry(W+2.3,.32,.34),standard('#304957',{metalness:.5}),gantryCross);
  for(let s=30;s<L;s+=67){
    const a=at(s,-W/2-2.5,1.55);a.yaw+=Math.PI;turnRows.push(a);
  }
  instances(root,'Overhead route signs',new T.PlaneGeometry(7.8,1.80),signMat,signRows);
  instances(root,'Chevron turn signs',new T.PlaneGeometry(2.25,.72),turnMat,turnRows);
  const signPosts=turnRows.map(r=>({p:r.p.clone().add(new T.Vector3(0,-.95,0)),yaw:r.yaw}));
  instances(root,'Turn sign posts',new T.BoxGeometry(.08,1.45,.08),standard('#344755',{metalness:.65,roughness:.6}),signPosts);
  // Finish line and grid stripes, authored without a manufacturer or event identity.
  const gridRows=[[],[]];
  for(let x=0;x<12;x++)for(let z=0;z<3;z++)gridRows[(x+z)%2].push(at(7+z*.65,(x/12-.5)*W+W/24,.06));
  gridRows.forEach((rows,i)=>instances(root,`Start grid ${i}`,new T.BoxGeometry(W/12,.018,.65),i?ivory:standard('#263743'),rows));

  const landmarks=[];
  if(key==='coast'){
    const beacon=at(L*.19,25,0);beacon.p.y=.8;
    placePrototype(root,prototypes,'Lighthouse',[{...beacon,scale:1.0}]);
    const beaconBase=new T.Mesh(new T.CylinderGeometry(7,10,7,12),standard('#7b8378'));
    beaconBase.position.copy(beacon.p);beaconBase.position.y=-2.7;root.add(beaconBase);
    const sea=new T.Mesh(new T.PlaneGeometry(2600,2600,1,1),new T.ShaderMaterial({
      uniforms:{time:{value:0},color:{value:new T.Color('#3f91a2')},fogColor:{value:new T.Color(theme.fog)}},
      vertexShader:'varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
      fragmentShader:`uniform float time;uniform vec3 color;uniform vec3 fogColor;varying vec3 vWorld;
      void main(){float w=sin(vWorld.x*.44+time*.35+sin(vWorld.z*.08))*sin(vWorld.z*.81-time*.4);float glow=pow(max(0.,sin(vWorld.x*.10+vWorld.z*.3+time*.25)),22.);vec3 c=color*(.88+w*.06)+vec3(.13,.19,.17)*glow;float d=length(vWorld.xz-cameraPosition.xz);c=mix(c,fogColor,smoothstep(140.,700.,d));gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
    }));sea.rotation.x=-Math.PI/2;sea.position.y=-4.8;sea.name='Ocean';root.add(sea);landmarks.push(sea);
    // Long soft beach shapes add a readable shoreline in wide shots.
    const sand=standard('#d4bd90',{roughness:1});
    for(let i=0;i<12;i++){
      const a=at(i*L/12,24,0),o=new T.Mesh(new T.SphereGeometry(1,14,8),sand);o.position.copy(a.p);o.position.y=-5.4;o.scale.set(12,2.4,43);o.rotation.y=a.yaw;root.add(o);
    }
  }
  if(key==='ridge'){
    const mountainMaterials=[standard('#879b9b'),standard('#91a6ad'),standard('#a5b8bd')];
    for(let i=0;i<23;i++){
      const angle=i*Math.PI*2/23,r=210+random()*160;
      const h=35+random()*83;
      const m=new T.Mesh(new T.ConeGeometry(50+random()*45,h,5,1),mountainMaterials[i%3]);
      m.position.set(Math.cos(angle)*r,h/2-9,Math.sin(angle)*r);m.rotation.y=random()*6;m.scale.z=.8+random()*.8;root.add(m);
      if(h>87){const cap=new T.Mesh(new T.ConeGeometry(17,h*.24,5),standard('#e5e9df'));cap.position.copy(m.position).add(new T.Vector3(0,h*.38,0));cap.rotation.copy(m.rotation);root.add(cap);}
    }
  }
  if(key==='neon'){
    const neonColors=['#74cde9','#d47ba9','#cadf71'];
    const bands=[];
    towerRows.forEach((rows,i)=>{
      for(const r of rows.slice(0,22)){const p=r.p.clone();p.y+=5+random()*12;bands.push({p,yaw:r.yaw,sx:(i===1?8:11)*r.sx,color:neonColors[i]});}
    });
    instances(root,'Facade neon accents',new T.BoxGeometry(1,.11,.11),basic('#ffffff'),bands);
  }
  // Canonical spectators are baked into reusable cheering geometries, then instanced.
  const crowdUniform={value:0};const crowdMeshes=[];
  const stands=at(38,W/2+8.1,.1);stands.yaw+=Math.PI/2;
  placePrototype(root,prototypes,'Grandstand',[stands]);
  for(let variant=0;variant<3;variant++){
    const data=await crowdGeometry(variant%2,[0,6,7][variant]);
    const rows=[];
    for(let row=0;row<3;row++)for(let col=0;col<8;col++){
      const offset=new T.Vector3((col-3.5)*2.5,.80+row*.6,-row*1.3).applyAxisAngle(T.Object3D.DEFAULT_UP,stands.yaw);
      rows.push({p:stands.p.clone().add(offset),yaw:stands.yaw+Math.PI,scale:.92+random()*.13});
    }
    // Interleave variants along the stand rather than overlapping three full stands.
    rows.forEach((r,i)=>{const localOffset=new T.Vector3((variant-1)*.72,0,0).applyAxisAngle(T.Object3D.DEFAULT_UP,stands.yaw);r.p.add(localOffset);});
    data.material.onBeforeCompile=shader=>{
      shader.uniforms.crowdTime=crowdUniform;
      shader.vertexShader='uniform float crowdTime;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed.x+=sin(crowdTime*2.4+instanceMatrix[3].x)*.028*max(0.,position.y-.3);`);
    };
    crowdMeshes.push(instances(root,'Instanced spectators',data.geometry,data.material,rows));
  }
  const lights=[];
  if(key==='neon')for(let i=0;i<3;i++){const light=new T.PointLight(['#6fb8ee','#f4b86b','#cc7bba'][i],12,20,2);root.add(light);lights.push(light);}
  const cullMeshes=[],inspectionMeshes=[];let instanceCount=0;
  root.traverse(o=>{
    if(o.isInstancedMesh){instanceCount+=o.count;if(o.name!=='Instanced spectators')cullMeshes.push(o);}
    if(o.isInstancedMesh&&/^(Palm|Pine|Rock|Streetlamp|Grandstand|Instanced spectators)$/.test(o.name)){
      o.userData.inspectionBase=new Float32Array(o.instanceMatrix.array);
      o.userData.inspectionAllHidden=false;inspectionMeshes.push(o);
    }
    if(!o.isLight&&o!==sky&&o!==sun.target){o.updateMatrix();o.matrixAutoUpdate=false;}
  });
  let inspecting=false,inspectionHiddenCount=0;const inspectionAnchor=new T.Vector3();
  function update(time,carPosition,{overview=false,inspection=false}={}){
    if(inspection!==inspecting||(inspection&&inspectionAnchor.distanceToSquared(carPosition)>1)){
      inspecting=inspection;inspectionAnchor.copy(carPosition);inspectionHiddenCount=0;
      for(const mesh of inspectionMeshes){
        const base=mesh.userData.inspectionBase,array=mesh.instanceMatrix.array;
        array.set(base);let hidden=0;
        if(inspection)for(let i=0;i<mesh.count;i++){
          const a=i*16,scale=Math.max(Math.hypot(base[a],base[a+1],base[a+2]),Math.hypot(base[a+4],base[a+5],base[a+6]),Math.hypot(base[a+8],base[a+9],base[a+10]));
          const radius=24+mesh.geometry.boundingSphere.radius*scale;
          if(Math.hypot(base[a+12]-carPosition.x,base[a+14]-carPosition.z)<radius){array[a+13]=-10000;hidden++;}
        }
        mesh.userData.inspectionAllHidden=hidden===mesh.count;
        inspectionHiddenCount+=hidden;mesh.instanceMatrix.needsUpdate=true;
      }
    }
    sky.position.copy(carPosition);crowdUniform.value=time;
    for(const o of landmarks)if(o.material.uniforms?.time)o.material.uniforms.time.value=time;
    sun.target.position.copy(carPosition);sun.position.copy(carPosition).add(new T.Vector3(45,75,-45));
    for(let i=0;i<lights.length;i++)lights[i].position.copy(carPosition).add(new T.Vector3(Math.sin(i*2.1)*6,4,Math.cos(i*2.1)*6));
    for(const mesh of cullMeshes){const sphere=mesh.boundingSphere;if(sphere)mesh.visible=(overview||Math.hypot(sphere.center.x-carPosition.x,sphere.center.z-carPosition.z)<170+sphere.radius)&&!mesh.userData.inspectionAllHidden;}
    for(const mesh of crowdMeshes)mesh.visible=!mesh.userData.inspectionAllHidden;
  }
  function dispose(){
    // GLB prototype geometries and source maps are cached; only per-world clones are released here.
    const materials=new Set(),geometries=new Set();
    root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
    root.traverse(o=>{if(o.isLight)o.dispose?.();});
    for(const m of materials)m.dispose();
    // The next world rebuilds its prototype geometry clones and generated meshes.
    for(const g of geometries)if(!scene.getObjectByProperty('geometry',g))g.dispose();
    for(const t of ownedTextures)t.dispose();environment.dispose();
  }
  return{root,track,theme,environment,sun,update,dispose,crowdCount:crowdMeshes.reduce((n,m)=>n+m.count,0),instanceCount,get inspectionHiddenCount(){return inspectionHiddenCount;}};
}

// racing-v24 (Roy after v23: "only three cars including mine look normal, all the rest look like a toy; they all have to look like formula cars"). Until v23 the player
// and the cars with index 1 and 2 had the formula model and every other rival the 150-triangle box silhouette (racing-car-look createStandIn), whatever its distance.
// Now every rival is the Codex formula car (design/racing-formula-cars-v1, CC0, assets/racing-formula-cars-v1: long nose, open cockpit with a helmet, sidepods,
// raised engine cover, front and rear wing, four exposed wheels) in three levels of detail picked by the distance to the camera (18 m and 42 m with 3 m of
// hysteresis: 4,608 / 1,604 / 472 triangles). Each level is one merged geometry shared by all the cars, with the seven paint parts as a vertex attribute and the
// colours as per-car uniforms: one draw call per car (plus the four spinning wheels of a near car). Scaled to the player's car (4.6 m). ?racingFormulaAll=0 keeps
// the old models; any load problem too (the view records 'formula-all' in failures).
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
export const formulaAllEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingFormulaAll')!=='0';
export const FA=Object.freeze({near:18,far:42,hysteresis:3,scale:4.6/5.2,triangles:[4608,1604,472]});
export const FA_PARTS=Object.freeze(['body_team','wing_team','secondary','tire','alloy','helmet','visor']);
const WHEELS=['wheel_fl','wheel_fr','wheel_rl','wheel_rr'];
// roughness, metalness per part (the package's materials; the paint a little glossier, like the player's clear-coated car)
const RM=[[.22,.5],[.3,.32],[.48,.25],[.92,0],[.27,.82],[.3,.15],[.13,.65]];
const FIXED={secondary:'#1d2530',tire:'#16191d',alloy:'#9fb0c0',helmet:'#e4e9ec',visor:'#10202c'};

/** Pure: the level of detail for a car `distance` metres from the camera, given its level now (-1 = none yet). Inside the hysteresis band around a boundary the
 * current level stays, so a car driving at 18 m does not flicker between two models. minLod caps the detail (a weak device never draws level 0). */
export function pickLod(distance,current=-1,{near=FA.near,far=FA.far,hysteresis=FA.hysteresis,minLod=0}={}){
 const d=Number.isFinite(distance)?distance:Infinity;let lod=d<near?0:d<far?1:2;
 if(current>=0&&lod!==current&&Math.abs(lod-current)===1){const edge=Math.min(lod,current)===0?near:far;if(Math.abs(d-edge)<hysteresis)lod=current;}
 return Math.max(minLod,lod);
}

/** Merge every mesh under `root` (optionally skipping the wheel branches) into one geometry with position, normal and aPart (the paint part). */
function mergeParts(T,root,skipWheels,scale){
 const parts=[],inWheel=o=>{for(let n=o;n&&n!==root;n=n.parent)if(WHEELS.includes(n.name))return true;return false;};
 root.updateMatrixWorld(true);const inv=new T.Matrix4().copy(root.matrixWorld).invert(),scaleM=new T.Matrix4().makeScale(scale,scale,scale);
 root.traverse(o=>{if(!o.isMesh||(skipWheels&&inWheel(o)))return;const m=Array.isArray(o.material)?o.material[0]:o.material,part=Math.max(0,FA_PARTS.indexOf(m?.name));
  const g=new T.BufferGeometry();g.setAttribute('position',o.geometry.attributes.position.clone());if(o.geometry.attributes.normal)g.setAttribute('normal',o.geometry.attributes.normal.clone());if(o.geometry.index)g.setIndex(o.geometry.index.clone());
  if(!g.attributes.normal)g.computeVertexNormals();g.applyMatrix4(new T.Matrix4().multiplyMatrices(scaleM,new T.Matrix4().multiplyMatrices(inv,o.matrixWorld)));
  const n=g.attributes.position.count;g.setAttribute('aPart',new T.Float32BufferAttribute(new Float32Array(n).fill(part),1));if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));parts.push(g);});
 const merged=mergeGeometries(parts);for(const g of parts)g.dispose();if(!merged)throw new Error('formula-all merge');merged.computeBoundingSphere();return merged;
}
/** One wheel: its meshes merged about the wheel's own centre (so it spins about its axle), and where that centre sits in the car. */
function wheelPart(T,root,name,scale){
 const node=root.getObjectByName(name);if(!node)throw new Error('formula-all wheel '+name);root.updateMatrixWorld(true);
 const centre=new T.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(new T.Matrix4().copy(root.matrixWorld).invert());
 // mergeParts measures from the wheel node's own frame (its world matrix inverted), so the geometry is centred on the axle and spins about local X
 const geo=mergeParts(T,node,false,scale);
 return {name,geometry:geo,position:centre.multiplyScalar(scale),radius:(name[6]==='r'?.375:.355)*scale};
}
/** The paint material: a standard material whose colour, roughness and metalness come from the part attribute (one program for every car, the colours per car). */
function partMaterial(T,colors){
 const uColors=colors.map(c=>new T.Color(c)),uRM=RM.map(([r,m])=>new T.Vector2(r,m));
 const material=new T.MeshStandardMaterial({color:'#ffffff',roughness:.4,metalness:.3,envMapIntensity:1.25});
 material.onBeforeCompile=shader=>{shader.uniforms.faColor={value:uColors};shader.uniforms.faRM={value:uRM};
  shader.vertexShader='attribute float aPart;\nvarying float vFaPart;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFaPart=aPart;');
  const pick=['int faI=int(vFaPart+.5);vec3 faC=faColor[0];vec2 faR=faRM[0];',...[1,2,3,4,5,6].map(i=>`if(faI==${i}){faC=faColor[${i}];faR=faRM[${i}];}`)].join('');
  shader.fragmentShader='uniform vec3 faColor[7];\nuniform vec2 faRM[7];\nvarying float vFaPart;\n'+shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',pick+'vec4 diffuseColor = vec4( faC, opacity );').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nroughnessFactor=faR.x;metalnessFactor=faR.y;');};
 material.customProgramCacheKey=()=>'racing-formula-all-parts';
 return {material,setColor(i,c){uColors[i].set(c);}};
}

/** Loads the three levels (GLTFLoader passed in, like the other trackside loaders) and builds the shared geometries. */
export async function loadFormulaAll({T,GLTFLoader,base=new URL('../assets/racing-formula-cars-v1/',import.meta.url),version='island-v2-20261107-18'}){
 const loader=new GLTFLoader(),scale=FA.scale;
 const levels=await Promise.all([0,1,2].map(async level=>{const gltf=await loader.loadAsync(new URL(`formula-lod${level}.glb?v=${version}`,base).href);const root=gltf.scene.getObjectByName('formula_car')||gltf.scene;return root;}));
 return levels.map((root,level)=>{
  const body=mergeParts(T,root,level===0,scale),wheels=level===0?WHEELS.map(name=>wheelPart(T,root,name,scale)):[];
  const triangles=(body.index.count+wheels.reduce((n,w)=>n+w.geometry.index.count,0))/3;
  // the source scene's own geometries and materials are not used after the merge
  root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m?.dispose?.();}});
  return {level,body,wheels,triangles};});
}

/** Replaces the rival cars' models in the view (index 1..n-1; the player keeps the formula car) with the three levels. `cars` are the view's car records
 * ({root, body, wheels, standIn, dress, models, v7, formula, lightOnly}); colours per car index. Returns update(camera, data, dt) and metrics(). */
export function attachFormulaAll({T,cars,templates,colors,accents,keep=x=>x,minLod=0,shadows=true}){
 const own=x=>(keep(x),x);for(const t of templates){own(t.body);for(const w of t.wheels)own(w.geometry);}
 const rivals=[];
 cars.forEach((car,i)=>{if(i===0)return;
  // the old model goes out of the scene (its resources stay with the view, which disposes them at the end)
  // (the boost flames are cones on the body and stay; so does the beacon on the root)
  for(const child of [...car.body.children])if(!child.isMesh||child.geometry?.type!=='ConeGeometry')car.body.remove(child);
  if(car.standIn?.parent)car.standIn.parent.remove(car.standIn);
  for(const w of car.wheels||[])if(w.parent===car.root)car.root.remove(w);   // the procedural wheels of the fallback model hang on the root
  const paint=partMaterial(T,[colors[i]||'#d93228',accents[i]||'#f4f5f2',FIXED.secondary,FIXED.tire,FIXED.alloy,FIXED.helmet,FIXED.visor]);own(paint.material);
  const group=new T.Group();group.name='formula-all';car.body.add(group);
  const lods=templates.map(t=>{const g=new T.Group();g.visible=false;const mesh=new T.Mesh(t.body,paint.material);mesh.castShadow=shadows&&t.level<2;mesh.receiveShadow=true;g.add(mesh);
   const wheels=t.wheels.map(w=>{const wm=new T.Mesh(w.geometry,paint.material);wm.position.copy(w.position);wm.castShadow=shadows;wm.receiveShadow=true;wm.rotation.order='YXZ';g.add(wm);return {mesh:wm,radius:w.radius,front:w.name[6]==='f'};});
   group.add(g);return {group:g,wheels};});
  Object.assign(car,{standIn:null,dress:null,wheels:[],models:[],v7:null,formula:false,lightOnly:true,formulaAll:true});
  rivals.push({i,car,lods,lod:-1,spin:0,paint});
 });
 const counts=[0,0,0];let triangles=0;
 return {
  update(camera,data,dt=0){counts[0]=counts[1]=counts[2]=0;triangles=0;
   for(const r of rivals){const c=data[r.i];if(!c)continue;const d=r.car.root.position.distanceTo(camera.position),lod=pickLod(d,r.lod,{minLod});
    if(lod!==r.lod){if(r.lod>=0)r.lods[r.lod].group.visible=false;r.lods[lod].group.visible=true;r.lod=lod;}
    if(r.car.root.visible){counts[lod]++;triangles+=templates[lod].triangles;}
    if(lod===0&&dt>0){r.spin+=(c.speed||0)*dt;for(const w of r.lods[0].wheels){w.mesh.rotation.x=r.spin/w.radius;if(w.front)w.mesh.rotation.y=(c.steer||0)*.25;}}}
  },
  setColor(i,color,accent){const r=rivals.find(x=>x.i===i);if(!r)return;if(color)r.paint.setColor(0,color);if(accent)r.paint.setColor(1,accent);},
  lodOf:i=>rivals.find(x=>x.i===i)?.lod??-1,
  metrics:()=>({cars:rivals.length,lods:[...counts],triangles,minLod,levels:templates.map(t=>t.triangles)})
 };
}

/** Load-time levels of detail for the shared athlete body (athlete-body-v22 / soccer-v24 body v2) in the full match: 22 bodies of about
 * 5.2K triangles do not fit the 130K-triangle budget, so players away from the camera wear a 1.5K or a 0.4K copy of the same body.
 * Same skeleton, same skin, same per-player colours and the same v2 material (numbers, gloves): only the mesh is coarser.
 * Vertex clustering, keyed so it cannot tear the body apart: a cluster never mixes colour regions (shirt, shorts, skin...), body parts
 * (a hand hanging by the hip stays the hand) or, at the middle level, facing (the front and back of a thin limb are not averaged into a
 * flat strip). Skin weights are summed per joint over the cluster and the four largest kept. Each level searches its cell size for the
 * wanted triangle count. `T` is three.js (BufferGeometry and attributes only); pure otherwise, so node tests run it on the real GLB. */
const getters=['getX','getY','getZ','getW'],setters=['setX','setY','setZ','setW'];
/** Body parts of the canonical 18-bone rig (athlete-body-v22 CANON18 order): clusters stay inside one part. */
const CANON18=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
export const SOCCER_LOD_PARTS=Object.freeze({fine:Object.freeze(CANON18.map((_,i)=>i)),
  coarse:Object.freeze([0,0,0,0,1,1,2,2,3,4,4,5,6,6,7,8,8,9])});

function axisBucket(nx,ny,nz,buckets){
  if(buckets>=6){const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);return ax>=ay&&ax>=az?(nx>=0?0:1):ay>=az?(ny>=0?2:3):(nz>=0?4:5);}
  if(buckets>=2)return nz>=0?0:1;
  return 0;
}
/** Per-vertex keys of a source, computed once (positions, region, dominant joint, normal). */
const prepared=new WeakMap();
function prepare(source){
  let p=prepared.get(source);if(p)return p;
  const position=source.getAttribute('position'),normal=source.getAttribute('normal'),skinIndex=source.getAttribute('skinIndex'),skinWeight=source.getAttribute('skinWeight'),region=source.getAttribute('_region')||source.getAttribute('_REGION');
  const n=position.count,xyz=new Float32Array(n*3),nrm=new Float32Array(n*3),reg=new Uint8Array(n),joint=new Int16Array(n).fill(-1);
  for(let i=0;i<n;i++){
    xyz[i*3]=position.getX(i);xyz[i*3+1]=position.getY(i);xyz[i*3+2]=position.getZ(i);
    if(normal){nrm[i*3]=normal.getX(i);nrm[i*3+1]=normal.getY(i);nrm[i*3+2]=normal.getZ(i);}
    if(region)reg[i]=region.getX(i);
    if(skinIndex&&skinWeight){let best=-1;for(let k=0;k<4;k++){const w=skinWeight[getters[k]](i);if(w>best){best=w;joint[i]=skinIndex[getters[k]](i);}}}
  }
  const index=source.index,tri=new Uint32Array(index?index.count:n);for(let i=0;i<tri.length;i++)tri[i]=index?index.getX(i):i;
  const box={min:[Infinity,Infinity,Infinity]};for(let i=0;i<n;i++)for(let k=0;k<3;k++)box.min[k]=Math.min(box.min[k],xyz[i*3+k]);
  // every other attribute as a flat array (interleaved byte attributes included), and the skin as flat arrays: the clustering loop reads only these
  const names=Object.keys(source.attributes).filter(k=>k!=='skinIndex'&&k!=='skinWeight'),flat=names.map(k=>{const a=source.getAttribute(k),f=new Float64Array(n*a.itemSize);for(let i=0;i<n;i++)for(let c=0;c<a.itemSize;c++)f[i*a.itemSize+c]=a[getters[c]](i);return f;});
  const si=skinIndex?new Int32Array(n*4):null,sw=skinWeight?new Float64Array(n*4):null;if(si&&sw)for(let i=0;i<n;i++)for(let c=0;c<4;c++){si[i*4+c]=skinIndex[getters[c]](i);sw[i*4+c]=skinWeight[getters[c]](i);}
  p={n,xyz,nrm,reg,joint,tri,box,skinIndex,skinWeight,names,flat,si,sw};prepared.set(source,p);return p;
}

/** One clustered copy of `source` with cubic cells of `cell` metres (source units). `facing`: 6 (axis and sign), 2 (front/back) or 0
 * normal buckets; `parts`: the joint-to-part table of the merge key. Returns a new BufferGeometry (no morph targets). */
export function clusterGeometry(T,source,cell,{facing=6,parts=SOCCER_LOD_PARTS.fine}={}){
  if(!(cell>0))throw new RangeError('LOD cell must be positive');
  if(!source.getAttribute('position'))throw new TypeError('LOD needs positions');
  const P=prepare(source),{n,xyz,nrm,reg,joint,tri,box,skinIndex,skinWeight,names,flat,si:srcIndex,sw:srcWeight}=P;
  const attrs=names.map(k=>source.getAttribute(k)),sizes=attrs.map(a=>a.itemSize);
  const remap=new Int32Array(n),lookup=new Map();let groups=0;
  const counts=[],sums=attrs.map(()=>[]),joints=[];
  for(let i=0;i<n;i++){
    const cx=Math.floor((xyz[i*3]-box.min[0])/cell),cy=Math.floor((xyz[i*3+1]-box.min[1])/cell),cz=Math.floor((xyz[i*3+2]-box.min[2])/cell);
    const part=joint[i]<0?31:(parts[joint[i]]??joint[i]&31),f=axisBucket(nrm[i*3],nrm[i*3+1],nrm[i*3+2],facing);
    const key=((((cx*1024+cy)*1024+cz)*16+(reg[i]&15))*32+part)*8+f;
    let g=lookup.get(key);
    if(g===undefined){g=groups++;lookup.set(key,g);counts.push(0);for(let a=0;a<attrs.length;a++)sums[a].push(new Float64Array(attrs[a].itemSize));joints.push(new Map());}
    remap[i]=g;counts[g]++;
    for(let a=0;a<attrs.length;a++){const size=sizes[a],s=sums[a][g],f=flat[a],o=i*size;for(let k=0;k<size;k++)s[k]+=f[o+k];}
    if(srcIndex&&srcWeight){const m=joints[g];for(let k=0;k<4;k++){const w=srcWeight[i*4+k];if(w>0){const j=srcIndex[i*4+k];m.set(j,(m.get(j)||0)+w);}}}
  }
  const out=[],seen=new Set();
  for(let t=0;t<tri.length;t+=3){
    const a=remap[tri[t]],b=remap[tri[t+1]],c=remap[tri[t+2]];
    if(a===b||b===c||a===c)continue;
    // dedupe by the rotation-normalised triple: keeps both windings of a thin double-sided part
    const m=Math.min(a,b,c),key=m===a?(a*65536+b)*65536+c:m===b?(b*65536+c)*65536+a:(c*65536+a)*65536+b;
    if(seen.has(key))continue;seen.add(key);out.push(a,b,c);
  }
  const result=new T.BufferGeometry();
  for(let a=0;a<attrs.length;a++){
    const input=attrs[a],name=names[a],size=input.itemSize,array=new input.array.constructor(groups*size),attribute=new T.BufferAttribute(array,size,input.normalized);
    for(let g=0;g<groups;g++){
      const s=sums[a][g],v=[0,0,0,0];for(let k=0;k<size;k++)v[k]=s[k]/counts[g];
      if(name==='normal'){const l=Math.hypot(v[0],v[1],v[2])||1;v[0]/=l;v[1]/=l;v[2]/=l;}
      if(name==='_region'||name==='_REGION')v[0]=Math.round(v[0]);
      for(let k=0;k<size;k++)attribute[setters[k]](g,v[k]);
    }
    result.setAttribute(name,attribute);
  }
  if(skinIndex&&skinWeight){
    const si=new skinIndex.array.constructor(groups*4),sw=new Float32Array(groups*4);
    for(let g=0;g<groups;g++){
      const top=[...joints[g]].sort((p,q)=>q[1]-p[1]||p[0]-q[0]).slice(0,4),sum=top.reduce((s,[,w])=>s+w,0)||1;
      for(let k=0;k<4;k++){si[g*4+k]=top[k]?.[0]??0;sw[g*4+k]=top[k]?top[k][1]/sum:0;}
    }
    result.setAttribute('skinIndex',new T.BufferAttribute(si,4));result.setAttribute('skinWeight',new T.BufferAttribute(sw,4));
  }
  result.setIndex(out);result.computeBoundingBox();result.computeBoundingSphere();
  result.userData.soccerFullLod={sourceTriangles:tri.length/3,triangles:out.length/3,vertices:groups,cell,facing};
  return result;
}

/** The clustered copy whose triangle count is closest to `target` without passing `target * slack`. A `hint` cell (measured on the shipped
 * body) is tried first and kept when it lands within [accept, slack] of the target (one pass instead of a search on a phone); otherwise
 * a bisection on the cell size. */
export function lodForTriangles(T,source,target,{min=.01,max=.6,steps=9,slack=1.08,accept=.8,hint=null,...key}={}){
  if(hint>0){const geometry=clusterGeometry(T,source,hint,key),count=geometry.userData.soccerFullLod.triangles;if(count<=target*slack&&count>=target*accept)return geometry;geometry.dispose();}
  let lo=Math.log(min),hi=Math.log(max),best=null,bestScore=Infinity;
  for(let i=0;i<steps;i++){
    const mid=(lo+hi)/2,geometry=clusterGeometry(T,source,Math.exp(mid),key),count=geometry.userData.soccerFullLod.triangles;
    const score=count>target*slack?Infinity:Math.abs(count-target);
    if(score<bestScore){best?.dispose();best=geometry;bestScore=score;}else geometry.dispose();
    if(count>target)lo=mid;else hi=mid;
  }
  if(!best)best=clusterGeometry(T,source,max,key);
  return best;
}

/** Wanted triangles and merge keys of the two levels: the middle level keeps the six facings and every joint, the far one front/back and
 * ten body parts (a far body is a few pixels tall: only the silhouette and the kit colours matter). `hint`: the cell that gives the count
 * on the shipped soccer body (v22 and v2: 1,470-1,500 and 395-400 triangles; the hair caps 92-114). */
export const SOCCER_FULL_LOD_TARGETS=Object.freeze({
  body:Object.freeze([Object.freeze({triangles:1500,facing:6,parts:SOCCER_LOD_PARTS.fine,hint:.095}),Object.freeze({triangles:400,facing:2,parts:SOCCER_LOD_PARTS.coarse,hint:.188})]),
  hair:Object.freeze([Object.freeze({triangles:110,facing:6,parts:SOCCER_LOD_PARTS.fine,hint:.053}),null]),
});
const cache=new WeakMap();
/** [middle, far] geometries of one body or hair cap (null where the level has none), cached per source geometry. */
export function athleteLodGeometries(T,source,kind='body',levels=SOCCER_FULL_LOD_TARGETS[kind]){
  let entry=cache.get(source);if(entry)return entry;
  entry=levels.map(level=>level?lodForTriangles(T,source,level.triangles,{facing:level.facing,parts:level.parts,hint:level.hint}):null);cache.set(source,entry);return entry;
}

// ---- Codex athlete-lod-v1 (design/athlete-lod-v1, 14/11/2026) ---------------------------------------------------------------------------
/** The authored soccer-body LODs: LOD1 1,400 body triangles (meshoptimizer with UV seams, colour regions and the 18 joints kept, every
 * vertex an exact sample of the v22 body) and LOD2 374 (simple anatomical volumes, mitten hands, simple UVs so the face is not smeared),
 * on the very same skeleton (names, order, inverse binds and bind matrix equal to the v22 and v24 v2 bodies; checked in the tests). They
 * replace the runtime clustering above, which stays the fallback if the files cannot be loaded. The pack's back-number primitive is not
 * used: the v2 shader already draws the numbers on the body (one draw call per body, not two). `_glove` is added from the dominant joint
 * (the hands), so a keeper's gloves keep their colour at the middle distance. Loaded from design/ (the GLBs reference the v22 atlas and the
 * pack's mask by relative paths); once per page, a failure is forgotten so the next match retries. */
export const SOCCER_FULL_LOD_ASSETS=Object.freeze({id:'athlete-lod-v1',files:Object.freeze(['../design/athlete-lod-v1/models/soccer-lod1.glb','../design/athlete-lod-v1/models/soccer-lod2.glb'])});
const HAND_JOINTS=new Set(['LeftHand','RightHand']);
/** Pure: a `_glove` attribute (1 where the dominant joint is a hand) for a geometry skinned to `boneNames`. Returns the count marked. */
export function addHandGloveAttribute(T,geometry,boneNames){
  const si=geometry.getAttribute('skinIndex'),sw=geometry.getAttribute('skinWeight'),n=si.count,glove=new Float32Array(n);let marked=0;
  for(let i=0;i<n;i++){let best=-1,joint=-1;for(let k=0;k<4;k++){const w=sw[getters[k]](i);if(w>best){best=w;joint=si[getters[k]](i);}}if(HAND_JOINTS.has(boneNames[joint])){glove[i]=1;marked++;}}
  geometry.setAttribute('_glove',new T.BufferAttribute(glove,1));return marked;
}
let codexLods=null;
export function loadAthleteLodAssets({T,GLTFLoader,retry=fn=>fn(),base=import.meta.url}){
  if(codexLods)return codexLods;
  const loader=new GLTFLoader();
  codexLods=Promise.all(SOCCER_FULL_LOD_ASSETS.files.map(file=>retry(()=>loader.loadAsync(new URL(file,base).href)))).then(list=>list.map((gltf,level)=>{
    let body=null;gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&o.material?.name==='athlete_shared'&&(!body||o.geometry.index.count>body.geometry.index.count))body=o;});
    if(!body)throw Error('athlete-lod-v1: no body primitive in LOD'+(level+1));
    const names=body.skeleton.bones.map(b=>b.name);
    if(names.join()!==CANON18.join())throw Error('athlete-lod-v1: the skeleton is not the canonical 18-bone rig');
    const geometry=body.geometry;addHandGloveAttribute(T,geometry,names);
    geometry.userData.soccerFullLod={source:SOCCER_FULL_LOD_ASSETS.id,level:level+1,triangles:geometry.index.count/3};
    // the pack's materials, textures and number primitive are not used (each player keeps his own v2 material)
    gltf.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){m?.map?.dispose?.();m?.dispose?.();}if(o!==body)o.geometry.dispose();});
    return geometry;
  }));
  codexLods.catch(()=>{codexLods=null;});
  return codexLods;
}

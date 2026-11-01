import * as T from '../vendor/three.module.js';

// The simulation and all render paths use metres. A 22 cm ball is a diameter,
// while physics.ballRadius and SphereGeometry both accept a radius.
export const SOCCER_BALL_DIAMETER_METRES=.22;
export const SOCCER_PLAYER_HEIGHT_METRES=1.8;

export function soccerMetreScale(sourceSpan,targetSpan){
  if(!Number.isFinite(sourceSpan)||sourceSpan<=0||!Number.isFinite(targetSpan)||targetSpan<=0)throw new RangeError('Soccer asset spans must be finite positive metres');
  return targetSpan/sourceSpan;
}

/** Centre a decoded ball and fit its actual outer radius. No camera-dependent
 * enlargement is allowed: perspective affects the ball and actor equally. */
export function normalizeSoccerBallGeometry(geometry,radius=SOCCER_BALL_DIAMETER_METRES/2){
  geometry.computeBoundingSphere();const sphere=geometry.boundingSphere;
  const scale=soccerMetreScale(sphere.radius,radius);
  geometry.translate(-sphere.center.x,-sphere.center.y,-sphere.center.z);
  geometry.scale(scale,scale,scale);geometry.computeBoundingSphere();geometry.computeBoundingBox();
  return geometry;
}

/** models2 uses its own atlas UVs. The full-field environment grass must span
 * the actual playable rectangle rather than sampling one tiny atlas patch. */
export function soccerPitchUv(geometry,length,width){
  soccerMetreScale(length,width);
  const positions=geometry.getAttribute('position'),uv=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++){uv[i*2]=positions.getX(i)/length+.5;uv[i*2+1]=positions.getZ(i)/width+.5;}
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));return geometry;
}

/** Mobile-distance representation of the authored upper chairs. Each chair is
 * still present: retain its exact top and field-facing pan/back faces. Omit
 * undersides, outward faces and thin row ends; full quality keeps the source.
 * This filters original faces, so there is no invented seat position or colour. */
export function createSoccerStadiumSeatLod(source,{pitchLength=105,pitchWidth=68}={}){
  soccerMetreScale(pitchLength,pitchWidth);
  const position=source.getAttribute('position'),normal=source.getAttribute('normal');
  if(!position||!normal)throw new TypeError('Soccer chair LOD needs source positions and normals');
  const index=source.index,selected=[],vertices=new Map();
  for(let first=0;first<(index?.count||position.count);first+=3){
    const face=[0,1,2].map(offset=>index?index.getX(first+offset):first+offset);
    let x=0,z=0,nx=0,ny=0,nz=0;
    for(const vertex of face){x+=position.getX(vertex)/3;z+=position.getZ(vertex)/3;nx+=normal.getX(vertex)/3;ny+=normal.getY(vertex)/3;nz+=normal.getZ(vertex)/3;}
    const sideBank=Math.abs(x)/pitchWidth>Math.abs(z)/pitchLength;
    const fieldFacing=sideBank?nx*Math.sign(x)<-.5:nz*Math.sign(z)<-.5;
    if(ny<=.5&&!fieldFacing)continue;
    for(const vertex of face){if(!vertices.has(vertex))vertices.set(vertex,vertices.size);selected.push(vertices.get(vertex));}
  }
  if(!selected.length)throw new Error('Soccer chair LOD would remove every seat');
  const result=new T.BufferGeometry();
  for(const [name,input]of Object.entries(source.attributes)){
    if(input.isInterleavedBufferAttribute)throw new TypeError('Soccer chair LOD expects decoded standalone attributes');
    const array=new input.array.constructor(vertices.size*input.itemSize);
    for(const [oldVertex,newVertex]of vertices)for(let axis=0;axis<input.itemSize;axis++)array[newVertex*input.itemSize+axis]=input.array[oldVertex*input.itemSize+axis];
    result.setAttribute(name,new T.BufferAttribute(array,input.itemSize,input.normalized));
  }
  result.setIndex(selected);result.computeBoundingBox();result.computeBoundingSphere();
  result.userData.soccerSeatLod={sourceTriangles:(index?.count||position.count)/3,triangles:selected.length/3,sourcePositionsPreserved:true,faces:'top-and-field-facing'};
  return result;
}

/** A load-time LOD of the authored v2 mesh, retaining its skin and colour
 * boundaries. Weld only spatial neighbours with the same joint palette and
 * source colour; never discard arbitrary triangles (which would leave holes).
 * Extremal vertices remain extremal, keeping the 1.8 m scale identical at LOD. */
export function createSoccerCharacterLod(source,cellSize){
  if(!Number.isFinite(cellSize)||cellSize<=0)throw new RangeError('Soccer LOD cell must be positive metres');
  const position=source.getAttribute('position');
  if(!position||position.itemSize!==3)throw new TypeError('Soccer LOD needs positions');
  const names=Object.keys(source.attributes),attributes=names.map(name=>source.getAttribute(name));
  const skinIndex=source.getAttribute('skinIndex'),skinWeight=source.getAttribute('skinWeight'),color=source.getAttribute('color'),region=source.getAttribute('soccerRegion');
  if(!skinIndex||!skinWeight||skinIndex.itemSize!==4||skinWeight.itemSize!==4)throw new TypeError('Soccer LOD needs four-component skin attributes');
  source.computeBoundingBox();const bounds=source.boundingBox;
  const groups=[],lookup=new Map(),remap=new Uint32Array(position.count);
  const getters=['getX','getY','getZ','getW'],setters=['setX','setY','setZ','setW'];
  const value=(attribute,vertex,axis)=>attribute[getters[axis]](vertex);
  for(let vertex=0;vertex<position.count;vertex++){
    const xyz=[position.getX(vertex),position.getY(vertex),position.getZ(vertex)];
    const key=[...xyz.map(n=>Math.floor(n/cellSize)),...xyz.map((n,axis)=>Math.abs(n-bounds.min.getComponent(axis))<1e-7?-1:Math.abs(n-bounds.max.getComponent(axis))<1e-7?1:0),
      ...Array.from({length:4},(_,axis)=>value(skinIndex,vertex,axis)),...Array.from({length:4},(_,axis)=>Math.round(value(skinWeight,vertex,axis)*16)),
      ...(color?Array.from({length:color.itemSize},(_,axis)=>Math.round(value(color,vertex,axis)*100000)):[]),region?.getX(vertex)??''].join(',');
    let group=lookup.get(key);
    if(group===undefined){group=groups.length;lookup.set(key,group);groups.push({count:0,sums:attributes.map(a=>new Array(a.itemSize).fill(0))});}
    remap[vertex]=group;const entry=groups[group];entry.count++;
    for(let attribute=0;attribute<attributes.length;attribute++)for(let axis=0;axis<attributes[attribute].itemSize;axis++)entry.sums[attribute][axis]+=value(attributes[attribute],vertex,axis);
  }
  const index=source.index,indices=[],seen=new Set();
  for(let first=0;first<(index?.count||position.count);first+=3){
    const face=[0,1,2].map(offset=>remap[index?index.getX(first+offset):first+offset]);
    if(face[0]===face[1]||face[1]===face[2]||face[2]===face[0])continue;
    const key=[...face].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);indices.push(...face);
  }
  const result=new T.BufferGeometry();
  for(let attribute=0;attribute<attributes.length;attribute++){
    const input=attributes[attribute],array=new input.array.constructor(groups.length*input.itemSize);
    const output=new T.BufferAttribute(array,input.itemSize,input.normalized);
    for(let group=0;group<groups.length;group++){
      const entry=groups[group],average=entry.sums[attribute].map(v=>v/entry.count);
      if(names[attribute]==='skinIndex')for(let axis=0;axis<average.length;axis++)average[axis]=Math.round(average[axis]);
      if(names[attribute]==='skinWeight'){
        const sum=average.reduce((total,n)=>total+n,0);for(let axis=0;axis<average.length;axis++)average[axis]=sum?average[axis]/sum:axis===0?1:0;
      }
      if(names[attribute]==='normal'){
        const length=Math.hypot(...average);if(length)for(let axis=0;axis<average.length;axis++)average[axis]/=length;
      }
      for(let axis=0;axis<average.length;axis++)output[setters[axis]](group,average[axis]);
    }
    result.setAttribute(names[attribute],output);
  }
  result.setIndex(indices);result.computeBoundingBox();result.computeBoundingSphere();
  result.userData.soccerLod={sourceTriangles:(source.index?.count||position.count)/3,triangles:indices.length/3,cellSize,maxVertexDisplacement:Math.sqrt(3)*cellSize};
  return result;
}

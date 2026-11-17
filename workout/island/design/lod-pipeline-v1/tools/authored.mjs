// Reuse an authored crowd topology when one is already present in the source.
// Geometry is retargeted only after exact bind-pose and keyframe comparisons.
// Missing joint support is restored with unchanged triangles from LOD0.
import {parseGLB,rawAccessor,accessor,addAccessor,writeGLB,sceneTriangleCount,triangleCount,invariantFingerprint,sha256,widths} from './glb.mjs';
import {simplifyPrimitive} from './simplify.mjs';

function rig(doc,skinIndex) {
  const j=doc.json,s=j.skins[skinIndex],parents=new Map();
  j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  const data=index=>{const a=rawAccessor(doc,index);return sha256(Buffer.from(a.buffer,a.byteOffset,a.byteLength));};
  return JSON.stringify({
    joints:s.joints.map(id=>{const n=j.nodes[id];return {name:n.name.replace(/^L[012]_/,'').replace(/_LOD[012]$/,''),parent:s.joints.indexOf(parents.get(id)),translation:n.translation,rotation:n.rotation,scale:n.scale,matrix:n.matrix};}),
    binds:data(s.inverseBindMatrices),
    animations:(j.animations||[]).map(a=>({name:a.name,channels:a.channels.filter(c=>s.joints.includes(c.target.node)).map(c=>{const sampler=a.samplers[c.sampler];return {bone:s.joints.indexOf(c.target.node),path:c.target.path,interpolation:sampler.interpolation||'LINEAR',input:data(sampler.input),output:data(sampler.output)};}).sort((a,b)=>a.bone-b.bone||a.path.localeCompare(b.path,'en'))}))
  });
}

function support(doc,primitive,vertices=null) {
  const result=new Set(),count=doc.json.accessors[primitive.attributes.POSITION].count;
  const ids=vertices||Array.from({length:count},(_,i)=>i);
  for(let set=0;primitive.attributes[`JOINTS_${set}`]!==undefined;set++) {
    const js=accessor(doc,primitive.attributes[`JOINTS_${set}`]),ws=accessor(doc,primitive.attributes[`WEIGHTS_${set}`]);
    for(const v of ids)for(let k=0;k<4;k++)if(ws[v*4+k]>0)result.add(js[v*4+k]);
  }
  return result;
}

function supportTriangles(source,primitive,guide,guidePrimitive) {
  const missing=new Set([...support(source,primitive)].filter(b=>!support(guide,guidePrimitive).has(b))),selected=[];
  const indices=primitive.indices===undefined?Uint32Array.from({length:source.json.accessors[primitive.attributes.POSITION].count},(_,i)=>i):rawAccessor(source,primitive.indices);
  const pos=accessor(source,primitive.attributes.POSITION);
  while(missing.size) {
    let best=null,bestScore=-1;
    for(let i=0;i<indices.length;i+=3) {
      const vertices=Array.from(indices.subarray(i,i+3)),bones=support(source,primitive,vertices),coverage=[...missing].filter(b=>bones.has(b));
      if(!coverage.length)continue;
      const [a,b,c]=vertices.map(v=>Array.from(pos.subarray(v*3,v*3+3))),u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);
      const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
      const score=coverage.length*1e6+area;
      if(score>bestScore){bestScore=score;best={vertices,coverage};}
    }
    if(!best)throw Error('Cannot preserve the original joint support');
    selected.push(best.vertices);best.coverage.forEach(b=>missing.delete(b));
  }
  return selected;
}

export function authoredVariant(sourceBytes,guideBytes,ratio,{sourceMesh=0,sourceScene=0}={}) {
  const source=parseGLB(sourceBytes),guide=parseGLB(guideBytes),doc=parseGLB(sourceBytes);
  const guidePrimitive=guide.json.meshes[sourceMesh].primitives[0];
  if(guide.json.meshes[sourceMesh].primitives.length!==1||guidePrimitive.targets?.length)throw Error('Authored guide must be a single, non-morph crowd primitive');
  const guideNode=guide.json.nodes.find(n=>n.mesh===sourceMesh&&n.skin!==undefined);
  if(!guideNode)throw Error('Authored guide has no skin');
  const contract=rig(guide,guideNode.skin),maps=[],stats=[],cache=new Map();
  const primaryTarget=Math.round(sceneTriangleCount(source)*ratio);
  const guideTriangles=(guidePrimitive.indices===undefined?guide.json.accessors[guidePrimitive.attributes.POSITION].count:guide.json.accessors[guidePrimitive.indices].count)/3;
  for(let mi=0;mi<doc.json.meshes.length;mi++) {
    const mesh=doc.json.meshes[mi],original=source.json.meshes[mi].primitives[0],node=source.json.nodes.find(n=>n.mesh===mi&&n.skin!==undefined);
    if(mesh.primitives.length!==1||!node||rig(source,node.skin)!==contract)throw Error('Authored topology has an incompatible skeleton or animation payload');
    if(JSON.stringify(Object.keys(original.attributes))!==JSON.stringify(Object.keys(guidePrimitive.attributes)))throw Error('Guide attribute contract mismatch');
    if(JSON.stringify(source.json.materials[original.material])!==JSON.stringify(guide.json.materials[guidePrimitive.material]))throw Error('Guide material differs from source');
    const imageHashes=d=>(d.json.images||[]).map(i=>{const v=d.json.bufferViews[i.bufferView];return sha256(d.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));});
    if(JSON.stringify(imageHashes(source))!==JSON.stringify(imageHashes(guide)))throw Error('Guide texture differs from source');
    const anchors=supportTriangles(source,original,guide,guidePrimitive);
    const desired=Math.max(1,primaryTarget-anchors.length),guideRatio=Math.min(.999999,desired/guideTriangles);
    const selected=desired>=guideTriangles?{sourceVertices:Array.from({length:guide.json.accessors[guidePrimitive.attributes.POSITION].count},(_,i)=>i),indices:guidePrimitive.indices===undefined?Array.from({length:guide.json.accessors[guidePrimitive.attributes.POSITION].count},(_,i)=>i):Array.from(rawAccessor(guide,guidePrimitive.indices))}:simplifyPrimitive(guide,guidePrimitive,guideRatio);
    const vertexMap=[...selected.sourceVertices,...anchors.flat()],references=[...selected.sourceVertices.map(()=>1),...anchors.flat().map(()=>0)];
    vertexMap.references=references;vertexMap.sourceMesh=sourceMesh;vertexMap.sourcePrimitive=0;
    const indices=[...selected.indices,...anchors.flatMap((face,i)=>[0,1,2].map(k=>selected.sourceVertices.length+i*3+k))];
    const key=JSON.stringify({vertices:selected.sourceVertices,indices:selected.indices,anchors:anchors.length?{mi,anchors}:null});
    let geometry=cache.get(key);
    if(!geometry) {
      geometry={attributes:{}};
      for(const attribute of Object.keys(original.attributes)) {
        const ga=guide.json.accessors[guidePrimitive.attributes[attribute]],sa=source.json.accessors[original.attributes[attribute]];
        if(ga.type!==sa.type||ga.componentType!==sa.componentType||!!ga.normalized!==!!sa.normalized)throw Error('Guide attribute storage mismatch');
        const g=rawAccessor(guide,guidePrimitive.attributes[attribute]),s=rawAccessor(source,original.attributes[attribute]),width=widths[ga.type],values=new g.constructor(vertexMap.length*width);
        vertexMap.forEach((v,i)=>{const input=references[i]?g:s;values.set(input.subarray(v*width,(v+1)*width),i*width);});
        geometry.attributes[attribute]=addAccessor(doc,ga,values);
      }
      geometry.indices=addAccessor(doc,{type:'SCALAR',componentType:5123},Uint16Array.from(indices));cache.set(key,geometry);
    }
    Object.assign(mesh.primitives[0],geometry);maps.push([vertexMap]);
    stats.push({originalTriangles:(original.indices===undefined?source.json.accessors[original.attributes.POSITION].count:source.json.accessors[original.indices].count)/3,target:primaryTarget,triangles:indices.length/3,guideTriangles,jointSupportTriangles:anchors.length,method:'authored-topology-with-LOD0-joint-support'});
    const finalSupport=new Set([...support(guide,guidePrimitive,selected.sourceVertices),...support(source,original,anchors.flat())]);
    if([...support(source,original)].some(b=>!finalSupport.has(b)))throw Error('Authored result lost original bone support');
  }
  const bytes=writeGLB(doc),parsed=parseGLB(bytes);
  if(invariantFingerprint(source)!==invariantFingerprint(parsed))throw Error('Authored topology changed the original animation/scene contract');
  return {doc:parsed,bytes,maps,stats,referenceDoc:guide,referenceScene:sourceScene,count:triangleCount(parsed),primaryCount:sceneTriangleCount(parsed),target:primaryTarget,passes:1,internalRatio:ratio,method:'authored-topology-with-LOD0-joint-support'};
}

import {io,fs,path,out,root,T} from './mesh.mjs';
const label=process.argv.includes('--before')?'winding-before':'winding',rows=[];
for(const filename of (await fs.readdir(out)).filter(n=>n.endsWith('.glb')).sort()){
 const doc=await io.read(path.join(out,filename));let tested=0,opposed=0,degenerate=0,perpendicular=0;
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),face=new T.Vector3(),normal=new T.Vector3(),n=new T.Vector3();
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  const positions=p.getAttribute('POSITION'),normals=p.getAttribute('NORMAL'),index=p.getIndices(),count=index?.getCount()||positions.getCount();
  if(!normals)throw Error(filename+' lacks normals');
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(k=>index?index.getScalar(i+k):i+k);
   a.fromArray(positions.getElement(ids[0],[]));b.fromArray(positions.getElement(ids[1],[]));c.fromArray(positions.getElement(ids[2],[]));
   face.crossVectors(b.sub(a),c.sub(a));if(face.lengthSq()<1e-16){degenerate++;continue;}face.normalize();
   normal.set(0,0,0);for(const id of ids)normal.add(n.fromArray(normals.getElement(id,[])));if(normal.lengthSq()<1e-12)continue;normal.normalize();
   const alignment=face.dot(normal);tested++;if(alignment<-.15)opposed++;else if(Math.abs(alignment)<.15)perpendicular++;
  }
 }
 rows.push({filename,testedTriangles:tested,opposedTriangles:opposed,opposedRatio:opposed/Math.max(1,tested),degenerateTriangles:degenerate,perpendicularTriangles:perpendicular});
}
const report={generatedUTC:new Date().toISOString(),method:'Decoded GLB: triangle cross product against mean vertex normal. Ignore collapsed triangles; opposed if dot < -0.15. This detects reversed tube winding missed by file-format validation.',rows,pass:rows.every(r=>r.opposedTriangles===0)};
await fs.writeFile(path.join(root,'verification',label+'.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,opposed:rows.reduce((s,r)=>s+r.opposedTriangles,0),affected:rows.filter(r=>r.opposedTriangles).map(r=>({file:r.filename,n:r.opposedTriangles}))}));
if(label!=='winding-before'&&!report.pass)process.exitCode=1;

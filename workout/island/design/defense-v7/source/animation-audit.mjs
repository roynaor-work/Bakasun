import {io,fs,path,out,root,T} from './mesh.mjs';
import {actorScene} from './pose.mjs';
const records=[],failures=[];
for(const id of ['guard-ranger','guard-lookout','guard-keeper','guard-ranger-lod1','guard-lookout-lod1','guard-keeper-lod1','boar-amber','boar-ash','boar-striped','boar-amber-lod1','boar-ash-lod1','boar-striped-lod1']){
  const doc=await io.read(path.join(out,id+'.glb')),actor=actorScene(doc);
  for(const clip of actor.clips){
    const grounded=clip.name==='idle'||clip.name==='alert'||clip.name==='trot';let minimum=Infinity,maximumFloor=0,nonFinite=0,maxIdleDrift=0,firstFoot=null;
    const supports=actor.meshes.map(({mesh})=>{
      const positions=mesh.geometry.attributes.position,list=[];
      for(let i=0;i<positions.count;i++)if(positions.getY(i)<(mesh.isSkinnedMesh ? .18 : .22))list.push(i);
      return {mesh,list};
    });
    const frames=Math.ceil(clip.duration*30)+1;
    for(let frame=0;frame<frames;frame++){
      actor.pose(clip.name,Math.min(clip.duration,frame/30));let low=Infinity;const centroid=new T.Vector3();let count=0;
      for(const {mesh,list}of supports)for(const i of list){
        const p=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld);
        if(!p.toArray().every(Number.isFinite))nonFinite++;low=Math.min(low,p.y);centroid.add(p);count++;
      }
      minimum=Math.min(minimum,low);maximumFloor=Math.max(maximumFloor,low);
      if(count){centroid.multiplyScalar(1/count);if(!firstFoot)firstFoot=centroid.clone();maxIdleDrift=Math.max(maxIdleDrift,Math.hypot(centroid.x-firstFoot.x,centroid.z-firstFoot.z));}
    }
    const looping=['idle','trot','patrol'].includes(clip.name);let seamError=0;
    if(looping)for(const track of clip.tracks){const n=track.getValueSize();for(let k=0;k<n;k++)seamError=Math.max(seamError,Math.abs(track.values[k]-track.values[track.values.length-n+k]));}
    const record={id,clip:clip.name,duration:clip.duration,frames,minimumY:minimum,maximumLowestPointY:maximumFloor,nonFinite,looping,seamError,maxSupportCentroidDriftXZ:maxIdleDrift};records.push(record);
    if(nonFinite||minimum<-.025||(grounded&&maximumFloor>.04)||(looping&&seamError>1e-4)||(['idle','alert'].includes(clip.name)&&maxIdleDrift>.025))failures.push(record);
  }
}
const result={generatedUTC:new Date().toISOString(),method:'Independent Three CPU skinning reconstruction from final decoded GLB, 30Hz; support vertices under 18cm for guards and 22cm for boars.',limits:{penetrationMeters:.025,groundedGapMeters:.04,idleSupportDriftMeters:.025,loopSeamComponentError:1e-4},records,failures};
await fs.writeFile(path.join(root,'verification/animations.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({clips:records.length,frames:records.reduce((s,r)=>s+r.frames,0),failures},null,2));if(failures.length)process.exitCode=1;

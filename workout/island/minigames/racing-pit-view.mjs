// racing-v24 pits, the view part: a painted box for every car in the working lane of the pit lane (racing-v24 pitLane: where racing-pit.mjs stops each car),
// two side lines and a back line in the car's colour and a white stop bar. One instanced mesh: one draw call, 48 boxes of 12 triangles.
// Drawn only when the race has stops (3 laps and more, unless ?racingPit=0) on the circuits with the Formula 1 trackside (the painted pit lane of racing-f1.mjs).
import {pitLane,PIT,racingV24Flags} from './racing-v24.mjs?v=island-v2-20261107-23';
export function pitBoxesOn(stage,search){return racingV24Flags(search).pit&&(stage?.laps||0)>=PIT.minLaps;}
export function paintPitBoxes({T,scene,track,keep=x=>x,count=12,colors=[]}){
 const lane=pitLane(track),rows=[],white='#f2f2ee';
 for(let i=0;i<count;i++){const s=lane.boxS(i,count),color=colors[i]||'#f5cf42';
  const at=(ds,dl)=>{const p=track.sample(s+ds);return {x:p.x+p.normal.x*(lane.boxLat+dl),y:p.y+.06,z:p.z+p.normal.z*(lane.boxLat+dl),heading:p.heading};};
  for(const side of [-1,1])rows.push({...at(0,side*1.35),sx:.12,sz:5.4,color});   // the two side lines along the car
  rows.push({...at(2.75,0),sx:2.82,sz:.14,color:white});                            // the stop bar at the nose
  rows.push({...at(-2.75,0),sx:2.82,sz:.12,color});}                                 // the back line
 const mesh=new T.InstancedMesh(keep(new T.BoxGeometry(1,.02,1)),keep(new T.MeshStandardMaterial({color:'#ffffff',roughness:.6})),rows.length),dummy=new T.Object3D(),c=new T.Color();
 rows.forEach((r,k)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.heading,0);dummy.scale.set(r.sx,1,r.sz);dummy.updateMatrix();mesh.setMatrixAt(k,dummy.matrix);mesh.setColorAt(k,c.set(r.color));});
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.name='racing-pit-boxes';scene.add(mesh);keep(mesh);
 return {mesh,boxes:count,metrics:()=>({boxes:count,instances:rows.length})};
}

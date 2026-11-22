/** Soccer v24.9 evidence: proportions of an athlete body GLB (joint rest positions, widths by height band). Usage: node workout/island/tools/soccer-v249-body-measure.mjs <file.glb> */
import {readFileSync} from 'node:fs';
const buf=readFileSync(process.argv[2]),jsonLen=buf.readUInt32LE(12),json=JSON.parse(buf.slice(20,20+jsonLen).toString('utf8')),bin=buf.slice(20+jsonLen+8);
const nodes=json.nodes,parent=new Map();nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
const world=i=>{let p=[0,0,0],k=i;const chain=[];while(k!==undefined){chain.push(k);k=parent.get(k);}
  // translation only (rest rotations are identity on the canonical rig; verified below)
  for(const j of chain){const t=nodes[j].translation||[0,0,0];p=[p[0]+t[0],p[1]+t[1],p[2]+t[2]];}return p;};
const rot=nodes.filter(n=>n.rotation&&Math.abs(n.rotation[3])<.999).map(n=>n.name);
const J={};nodes.forEach((n,i)=>{if(n.name)J[n.name]=world(i).map(v=>+v.toFixed(3));});
const acc=(i)=>{const a=json.accessors[i],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],stride=v.byteStride||n*4,off=(v.byteOffset||0)+(a.byteOffset||0),out=[];for(let k=0;k<a.count;k++){const r=[];for(let c=0;c<n;c++)r.push(bin.readFloatLE(off+k*stride+c*4));out.push(r);}return out;};
const prim=json.meshes[0].primitives[0],pos=acc(prim.attributes.POSITION);
let min=[9,9,9],max=[-9,-9,-9];for(const p of pos)for(let c=0;c<3;c++){min[c]=Math.min(min[c],p[c]);max[c]=Math.max(max[c],p[c]);}
const H=max[1]-min[1],band=(a,b)=>{let w=0,d=0,x0=9,x1=-9,z0=9,z1=-9;for(const p of pos){const u=(p[1]-min[1])/H;if(u>=a&&u<b){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[2]);z1=Math.max(z1,p[2]);}}return {w:+(x1-x0).toFixed(3),d:+(z1-z0).toFixed(3)};};
const d=(a,b)=>+Math.hypot(J[a][0]-J[b][0],J[a][1]-J[b][1],J[a][2]-J[b][2]).toFixed(3);
console.log(JSON.stringify({bones:Object.keys(J).filter(k=>json.skins[0].joints.some(j=>nodes[j].name===k)).length,rotatedRest:rot,height:+H.toFixed(3),min,max,
 headTop:+max[1].toFixed(3),neckY:J.Neck?.[1],headY:J.Head?.[1],hipsY:J.Hips?.[1],kneeY:J.LeftLeg?.[1],ankleY:J.LeftFoot?.[1],shoulderY:J.LeftArm?.[1],
 headHeight:+(max[1]-J.Head[1]).toFixed(3),headsTall:+(H/((max[1]-J.Head[1])*1.18)).toFixed(2),shoulderWidth:d('LeftArm','RightArm'),hipWidth:d('LeftUpLeg','RightUpLeg'),
 upperArm:d('LeftArm','LeftForeArm'),foreArm:d('LeftForeArm','LeftHand'),thigh:d('LeftUpLeg','LeftLeg'),shin:d('LeftLeg','LeftFoot'),legShare:+((J.LeftUpLeg[1]-min[1])/H).toFixed(3),
 bands:{head:band(.88,1),chest:band(.68,.8),waist:band(.56,.62),hips:band(.48,.54),thigh:band(.36,.44),calf:band(.14,.22),foot:band(0,.05)},
 attrs:Object.keys(prim.attributes),tris:json.accessors[prim.indices].count/3,targets:(prim.targets||[]).length,materials:json.materials?.map(m=>m.name),images:json.images?.length,textures:json.textures?.length},null,1));

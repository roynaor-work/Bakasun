import {Color} from './vendor/three.module.js';

/** Attach exactly one of 1..11 to a loaded kit, in bind space. Library geometry
 * stays shared and read-only. Each actor owns only the number's material.
 * Run before rendering, then drive the kit's existing skeleton normally.
 * Requires a separately cloned skeleton per actor (SkeletonUtils.clone).
 */
export function applyKitNumber(actor, numberLibrary, number, color = '#F5F3E9') {
  if (!Number.isInteger(number) || number < 1 || number > 11) throw RangeError('Number must be an integer from 1 to 11.');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw TypeError('Number color must be sRGB #RRGGBB.');
  let body;
  const previous=[];
  actor.traverse(node=>{
    if (node.isSkinnedMesh && node.userData.role!=='back-number' && !node.name.startsWith('BackNumber_')) body ||= node;
    if (node.userData.role==='back-number' || node.name.startsWith('BackNumber_')) previous.push(node);
  });
  if (!body || body.skeleton.bones.length!==18) throw Error('Expected a canonical 18-joint kit.');
  const template=numberLibrary.getObjectByName(`BackNumber_${String(number).padStart(2,'0')}`);
  if (!template?.isSkinnedMesh) throw Error('Missing numeral geometry.');
  const sourceNames=template.skeleton.bones.map(b=>b.name);
  if (sourceNames.some((name,i)=>body.skeleton.bones[i].name!==name)) throw Error('Number and kit joint order differ.');
  for(let i=0;i<18;i++)if(template.skeleton.boneInverses[i].elements.some((v,k)=>Math.abs(v-body.skeleton.boneInverses[i].elements[k])>1e-5))
    throw Error('Number and kit inverse binds differ.');
  for(const node of previous){node.removeFromParent();if(node.userData.ownedNumberMaterial)node.material.dispose();}
  const mesh=template.clone(false);
  mesh.material=template.material.clone();
  // The library has white linear vertex colors; material tint supplies the kit color.
  mesh.material.color.copy(new Color(color));
  mesh.material.vertexColors=true;
  mesh.userData={...mesh.userData,role:'back-number',number,ownedNumberMaterial:true};
  mesh.frustumCulled=false;
  mesh.bind(body.skeleton,body.bindMatrix.clone());
  actor.add(mesh);
  return mesh;
}

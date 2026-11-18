/** Original CC0-1.0 skeletal repair mathematics. Units: metres; quaternions: xyzw.
 * Every operation acts on local rotations and fixed bind translations; FK is
 * recomputed afterwards. No joint-marker stretching is used to improve QA.
 */
export const vadd=(a,b)=>a.map((x,i)=>x+b[i]);
export const vsub=(a,b)=>a.map((x,i)=>x-b[i]);
export const vmul=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const length=a=>Math.hypot(...a);
export const unit=a=>length(a)>1e-12?vmul(a,1/length(a)):[0,0,1];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const qnorm=q=>vmul(q,1/(length(q)||1));
export const qinv=q=>{const d=dot(q,q)||1;return [-q[0]/d,-q[1]/d,-q[2]/d,q[3]/d];};
export function qmul(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
export const rotate=(v,q)=>qmul(qmul(q,[...v,0]),qinv(q)).slice(0,3);
export function slerp(a,b,t){a=qnorm(a);b=qnorm(b);let d=dot(a,b);if(d<0){b=vmul(b,-1);d=-d;}d=Math.min(1,d);if(d>.9995)return qnorm(a.map((v,i)=>v+(b[i]-v)*t));const angle=Math.acos(d),s=Math.sin(angle);return a.map((v,i)=>(Math.sin((1-t)*angle)*v+Math.sin(t*angle)*b[i])/s);}
export function swing(from,to){const a=unit(from),b=unit(to),d=dot(a,b);if(d<-.999999){let axis=cross(a,[1,0,0]);if(length(axis)<1e-6)axis=cross(a,[0,1,0]);return [...unit(axis),0];}return qnorm([...cross(a,b),1+d]);}
export const smoothstep=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const I=[0,0,0,1],ZERO=[0,0,0],ONE=[1,1,1];
const clone=v=>JSON.parse(JSON.stringify(v));

function matrixTRS(m){
 const translation=m.slice(12,15),scale=[Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10])];
 const a=m[0]/scale[0],b=m[4]/scale[1],c=m[8]/scale[2],d=m[1]/scale[0],e=m[5]/scale[1],f=m[9]/scale[2],g=m[2]/scale[0],h=m[6]/scale[1],j=m[10]/scale[2],trace=a+e+j;let rotation;
 if(trace>0){const s=2*Math.sqrt(trace+1);rotation=[(h-f)/s,(c-g)/s,(d-b)/s,s/4];}
 else if(a>e&&a>j){const s=2*Math.sqrt(1+a-e-j);rotation=[s/4,(b+d)/s,(c+g)/s,(h-f)/s];}
 else if(e>j){const s=2*Math.sqrt(1+e-a-j);rotation=[(b+d)/s,s/4,(f+h)/s,(c-g)/s];}
 else {const s=2*Math.sqrt(1+j-a-e);rotation=[(c+g)/s,(f+h)/s,s/4,(d-b)/s];}
 return {translation,rotation:qnorm(rotation),scale};
}

/** Extract the actual skeleton and its non-mesh ancestors from a source GLB.
 * Parent order is topological, independent of the source node index order.
 */
export function rigFromGLB(json){
 const source=json.nodes??[],parents=new Map();source.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
 const canonical=/^(Root|Hips|Spine\d*|Chest|UpperChest|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|Toes))$/;
 const selected=new Set((json.skins??[]).flatMap(s=>s.joints??[]));source.forEach((n,i)=>{if(canonical.test(n.name??'')||/^ball$/i.test(n.name??''))selected.add(i);});
 for(const i of [...selected]){let p=parents.get(i);while(p!==undefined){selected.add(p);p=parents.get(p);}}
 const nodes=[],names=new Set();function visit(i,parent=null){if(!selected.has(i))return;const n=source[i],name=n.name??`node_${i}`;if(names.has(name))throw new Error(`Duplicate skeleton name: ${name}`);names.add(name);const trs=n.matrix?matrixTRS(n.matrix):{translation:n.translation??ZERO,rotation:n.rotation??I,scale:n.scale??ONE};nodes.push({name,parent,...clone(trs),sourceIndex:i});for(const child of n.children??[])visit(child,name);}
 source.forEach((_,i)=>{if(!parents.has(i)&&selected.has(i))visit(i);});
 return {nodes,nameToIndex:Object.fromEntries(nodes.map((n,i)=>[n.name,i]))};
}
export function rigFromProfile(profile){const nodes=profile.joints.map(n=>({name:n.name,parent:n.parent??null,translation:[...n.translation],rotation:[...I],scale:[...ONE]}));return {nodes,nameToIndex:Object.fromEntries(nodes.map((n,i)=>[n.name,i]))};}
export function restPose(rig,t=0){return {t,rotations:Object.fromEntries(rig.nodes.map(n=>[n.name,[...(n.rotation??I)]])),translations:Object.fromEntries(rig.nodes.map(n=>[n.name,[...n.translation]]))};}
export function forward(rig,pose){
 const joints={},rotations={},scales={};
 for(const n of rig.nodes){const q=pose.rotations?.[n.name]??n.rotation??I,p=pose.translations?.[n.name]??n.translation,s=pose.scales?.[n.name]??n.scale??ONE;
  if(n.parent&&joints[n.parent]){joints[n.name]=vadd(joints[n.parent],rotate(p.map((v,i)=>v*scales[n.parent][i]),rotations[n.parent]));rotations[n.name]=qnorm(qmul(rotations[n.parent],q));scales[n.name]=s.map((v,i)=>v*scales[n.parent][i]);}
  else {joints[n.name]=[...p];rotations[n.name]=qnorm(q);scales[n.name]=[...s];}
 }
 return {t:pose.t,joints,rotations,scales,localRotations:clone(pose.rotations),root:joints.Root??ZERO,ball:joints.Ball??joints.ball??null};
}
/** Recover local pose from measured world transforms, applying any authored
 * external world trajectory exactly once. Only Root/Hips translation channels
 * vary; all other skeletal bind translations remain fixed.
 */
export function poseFromWorldFrame(frame,rig){
 const pose=restPose(rig,frame.t);let fk=forward(rig,pose);
 for(const n of rig.nodes){const parentQ=n.parent?fk.rotations[n.parent]:I;
  if(frame.rotations?.[n.name])pose.rotations[n.name]=qnorm(qmul(qinv(parentQ),frame.rotations[n.name]));
  else if(frame.localRotations?.[n.name])pose.rotations[n.name]=[...frame.localRotations[n.name]];
  if(/^(Root|Hips|ball)$/i.test(n.name)&&frame.joints?.[n.name]){const p=n.parent?fk.joints[n.parent]:ZERO,s=n.parent?fk.scales[n.parent]:ONE;pose.translations[n.name]=rotate(vsub(frame.joints[n.name],p),qinv(parentQ)).map((v,i)=>v/s[i]);}
  fk=forward(rig,pose);
 }
 return pose;
}
export function blendPose(a,b,alpha,{alignRoot=true}={}){
 const p=clone(a);for(const name of Object.keys(p.rotations))if(b.rotations?.[name])p.rotations[name]=slerp(a.rotations[name],b.rotations[name],alpha);
 for(const name of Object.keys(p.translations))if(b.translations?.[name])p.translations[name]=a.translations[name].map((v,i)=>alignRoot&&name==='Root'&&i!==1?v:v+(b.translations[name][i]-v)*alpha);
 return p;
}
/** Finite symmetric quaternion filter; endpoints can be left to idle handles. */
export function smoothPoses(poses,{passes=1,radius=2,translation=true,interval=1/60}={}){
 let out=clone(poses);for(let pass=0;pass<passes;pass++){const src=out;
 const at=t=>{if(t<=src[0].t)return src[0];if(t>=src.at(-1).t)return src.at(-1);let lo=0,hi=src.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(src[mid].t<=t)lo=mid;else hi=mid;}return blendPose(src[lo],src[hi],(t-src[lo].t)/(src[hi].t-src[lo].t),{alignRoot:false});};
 out=src.map(p=>{const next=clone(p),samples=Array.from({length:2*radius+1},(_,i)=>({p:at(p.t+(i-radius)*interval),weight:radius+1-Math.abs(i-radius)}));
 for(const name of Object.keys(p.rotations)){let q=null,total=0;for(const {p:sample,weight:w} of samples){if(!sample.rotations[name])continue;q=q?slerp(q,sample.rotations[name],w/(total+w)):sample.rotations[name];total+=w;}next.rotations[name]=q;}
 if(translation)for(const name of Object.keys(p.translations)){let total=0,v=[0,0,0];for(const {p:sample,weight:w} of samples){v=vadd(v,vmul(sample.translations[name],w));total+=w;}next.translations[name]=vmul(v,1/total);}return next;});}return out;
}
/** Add smooth compatible idle endpoint handles without changing clip duration.
 * The idle poses must use the same rig and ball/role context as the source.
 */
export function blendIdleEndpoints(poses,idleEntry,idleExit,{seconds=.22}={}){const D=poses.at(-1).t;return poses.map(p=>{let result=p;if(p.t<seconds)result=blendPose(result,idleEntry,1-smoothstep(p.t/seconds));if(D-p.t<seconds)result=blendPose(result,idleExit,1-smoothstep((D-p.t)/seconds));return result;});}

/** Analytic two-bone IK. Target is the effector JOINT; use lockFoot for soles.
 * Keeps original axial twist where possible, fixes lengths, and uses a forward
 * knee pole when the original hinge is reversed. Unreachable error is returned
 * explicitly so the caller can lower/adjust the pelvis or block the clip.
 */
export function solveTwoBone(rig,pose,{effector,target,worldRotation,weight=1,pole,hingeAngle}){
 const end=rig.nodes[rig.nameToIndex[effector]],lower=end&&rig.nodes[rig.nameToIndex[end.parent]],upper=lower&&rig.nodes[rig.nameToIndex[lower.parent]];
 if(!end||!lower||!upper)throw new Error(`Missing IK chain for ${effector}`);
 let fk=forward(rig,pose),a=fk.joints[upper.name],b=fk.joints[lower.name],c=fk.joints[end.name];
 if(weight<=1e-8)return {effector,reachError:0,targetError:0,knee:b};
 const original=Object.fromEntries([upper.name,lower.name,end.name].map(name=>[name,[...(pose.rotations[name]??I)]])),weightedTarget=vadd(c,vmul(vsub(target,c),weight));
 const l1=length(vsub(b,a)),l2=length(vsub(c,b)),rawDistance=length(vsub(target,a)),d=Math.max(Math.abs(l1-l2)+1e-6,Math.min(l1+l2-1e-6,rawDistance)),axis=unit(vsub(target,a));
 let bend=vsub(vsub(b,a),vmul(axis,dot(vsub(b,a),axis)));
 const forwardPole=pole??rotate([0,0,1],fk.rotations.Root??I),preferred=vsub(forwardPole,vmul(axis,dot(forwardPole,axis)));
 if(length(bend)<1e-5||effector.endsWith('Foot')||effector.endsWith('Hand'))bend=preferred;
 if(length(bend)<1e-6)bend=cross(axis,[1,0,0]);bend=unit(bend);
 const x=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-x*x)),knee=vadd(a,vadd(vmul(axis,x),vmul(bend,height))),ankle=vadd(a,vmul(axis,d));
 let upperWorld=qnorm(qmul(swing(vsub(b,a),vsub(knee,a)),fk.rotations[upper.name]));
 // The canonical knee flexes about local +X. Align its hinge plane to the
 // solved bend plane, avoiding a copied source axial twist reversing a knee.
 if(effector.endsWith('Foot')&&height>1e-6){const axisUpper=unit(vsub(knee,a)),hinge=unit(cross(vsub(knee,a),vsub(ankle,knee))),lateral=rotate([1,0,0],upperWorld),projected=unit(vsub(lateral,vmul(axisUpper,dot(lateral,axisUpper))));
  // Preserve valid source axial twist, including rigs whose authored hinge is
  // local Z. Correct only an actual reversed signed hinge. Rotating every valid
  // leg into a new canonical plane would introduce 90-degree IK-on/off pops.
  if(Number.isFinite(hingeAngle)||dot(projected,hinge)<.02){const angle=Math.atan2(dot(axisUpper,cross(projected,hinge)),dot(projected,hinge)),allowed=Math.acos(.02),correction=Number.isFinite(hingeAngle)?angle-hingeAngle:angle-Math.sign(angle)*Math.min(Math.abs(angle),allowed),twist=[...vmul(axisUpper,Math.sin(correction/2)),Math.cos(correction/2)];upperWorld=qnorm(qmul(twist,upperWorld));}
 }
 const upperParent=upper.parent?fk.rotations[upper.parent]:I;
 pose.rotations[upper.name]=qnorm(qmul(qinv(upperParent),upperWorld));fk=forward(rig,pose);
 const lowerWorld=qnorm(qmul(swing(vsub(fk.joints[end.name],fk.joints[lower.name]),vsub(ankle,fk.joints[lower.name])),fk.rotations[lower.name]));
 pose.rotations[lower.name]=qnorm(qmul(qinv(fk.rotations[upper.name]),lowerWorld));fk=forward(rig,pose);
 if(worldRotation)pose.rotations[end.name]=qnorm(qmul(qinv(fk.rotations[lower.name]),worldRotation));
 if(weight<1)for(const name of [upper.name,lower.name,end.name])pose.rotations[name]=slerp(original[name],pose.rotations[name],weight);
 fk=forward(rig,pose);return {effector,reachError:Math.max(0,rawDistance-l1-l2),targetError:length(vsub(fk.joints[end.name],weightedTarget)),knee:knee};
}
export function lockFoot(rig,pose,{bone,anchor,soleLocal=[0,-.08,0],weight=1,worldRotation,hingeAngle}){
 const fk=forward(rig,pose),q=worldRotation??fk.rotations[bone],scaled=soleLocal.map((v,i)=>v*(fk.scales[bone]?.[i]??1)),target=vsub(anchor,rotate(scaled,q));
 return solveTwoBone(rig,pose,{effector:bone,target,worldRotation:q,weight,hingeAngle});
}
export function solePoint(rig,pose,bone,local=[0,-.08,0]){const fk=forward(rig,pose);return vadd(fk.joints[bone],rotate(local.map((v,i)=>v*fk.scales[bone][i]),fk.rotations[bone]));}

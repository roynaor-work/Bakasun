import * as T from '../vendor/three.module.js';

// Locally adapted from the continuous surface-projection rig in kid-head.
// The six fixed-topology endpoint shapes are built once, then blended by the
// GPU. Every endpoint is also an ordinary named relative glTF morph target.
export const DEFAULT_PARAMETERS=Object.freeze({
 eyeOpen:.94,wink:0,gazeX:0,gazeY:0,browRaise:0,browTilt:0,browAsym:0,
 cheekPuff:.12,cheekLift:.12,jawOpen:0,chinTight:0,
 mouthOpen:.010,mouthWidth:.22,smile:.55,mouthShift:0,clench:0,tongue:0
});
const entry=(id,label,description,parameters)=>Object.freeze({id,label,description,parameters:Object.freeze({...DEFAULT_PARAMETERS,...parameters})});
export const EXPRESSION_LIST=Object.freeze([
 entry('happy','שמח','עיניים פתוחות, לחיים מורמות וחיוך סגור ורך.',
  {eyeOpen:.97,browRaise:.18,cheekPuff:.30,cheekLift:.58,mouthOpen:.010,mouthWidth:.26,smile:.95}),
 entry('effort','מאמץ','עיניים מכווצות, גבות מתכנסות ושיניים מהודקות.',
  {eyeOpen:.58,browRaise:-.32,browTilt:.95,cheekPuff:.68,cheekLift:.24,jawOpen:.08,chinTight:.85,mouthOpen:.072,mouthWidth:.225,smile:-.18,clench:1}),
 entry('surprised','מופתע','עיניים רחבות, גבות גבוהות ופה עגול עם ירידת לסת.',
  {eyeOpen:1.16,browRaise:.87,browTilt:-.05,cheekPuff:.04,cheekLift:0,jawOpen:.68,mouthOpen:.265,mouthWidth:.135,smile:0,tongue:.18}),
 entry('victory','ניצחון','קריצה וחיוך פתוח, רחב ואסימטרי.',
  {eyeOpen:.94,wink:.88,browRaise:.34,browAsym:.55,cheekPuff:.43,cheekLift:.88,jawOpen:.32,mouthOpen:.185,mouthWidth:.29,smile:1,mouthShift:.012,tongue:.70}),
 entry('tired','עייף ומרוצה','עפעפיים כבדים, מבט נמוך וחיוך סגור של סיפוק.',
  {eyeOpen:.49,gazeY:-.30,browRaise:-.23,browTilt:-.23,cheekPuff:.18,cheekLift:.25,mouthOpen:.008,mouthWidth:.205,smile:.62}),
 entry('thinking','מחשבה','מבט הצידה ולמעלה, גבה מורמת ופה קטן משוך הצידה.',
  {eyeOpen:.79,gazeX:-.72,gazeY:.47,browRaise:.10,browTilt:-.26,browAsym:.90,cheekPuff:.26,cheekLift:.06,chinTight:.26,mouthOpen:.008,mouthWidth:.15,smile:-.30,mouthShift:.041})
]);
export const EXPRESSION_IDS=Object.freeze(EXPRESSION_LIST.map(e=>e.id));
export const EXPRESSIONS=Object.freeze(Object.fromEntries(EXPRESSION_LIST.map(e=>[e.id,e])));
export const POSE_EXPRESSIONS=Object.freeze({stand:'happy',run:'effort',kick:'victory'});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function assertId(id){if(id!=='neutral'&&!EXPRESSIONS[id])throw new RangeError('Unknown expression: '+id);}

export function getExpressionWeights(root){
 const weights=Object.fromEntries(EXPRESSION_IDS.map(id=>[id,0]));
 let found=false;
 root.traverse(mesh=>{if(found||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;
  if(!EXPRESSION_IDS.every(id=>Number.isInteger(mesh.morphTargetDictionary[id])))return;
  for(const id of EXPRESSION_IDS)weights[id]=mesh.morphTargetInfluences[mesh.morphTargetDictionary[id]];
  found=true;
 });
 return weights;
}
export function setExpressionWeights(root,weights){
 const values=EXPRESSION_IDS.map((id,i)=>{
  const value=Number((Array.isArray(weights)||ArrayBuffer.isView(weights)?weights[i]:weights[id])??0);if(!Number.isFinite(value))throw new TypeError('Non-finite expression weight: '+id);
  return clamp(value,0,1);
 });
 const total=values.reduce((a,b)=>a+b,0);if(total>1+1e-8)for(let i=0;i<values.length;i++)values[i]/=total;
 let meshes=0;
 root.traverse(mesh=>{if(!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;
  if(!EXPRESSION_IDS.every(id=>Number.isInteger(mesh.morphTargetDictionary[id])))return;
  for(let i=0;i<EXPRESSION_IDS.length;i++)mesh.morphTargetInfluences[mesh.morphTargetDictionary[EXPRESSION_IDS[i]]]=values[i];
  meshes++;
 });
 root.userData.expressionWeights=Object.fromEntries(EXPRESSION_IDS.map((id,i)=>[id,values[i]]));
 return meshes;
}
export function applyExpression(root,id='happy'){
 assertId(id);setExpressionWeights(root,id==='neutral'?{}:{[id]:1});root.userData.expression=id;return id;
}
export function blendExpression(root,from,to,t){
 assertId(from);assertId(to);if(!Number.isFinite(t))throw new TypeError('Expression blend factor must be finite');
 const blend=clamp(t,0,1),weights={[from]:1-blend};weights[to]=(weights[to]??0)+blend;
 setExpressionWeights(root,weights);root.userData.expression=blend===0?from:blend===1?to:`${from} → ${to}`;
 return weights;
}

export function installExpressions({root,face,surfaceZ,skin,innerEar,detail,p={}}){
 if(!root?.isObject3D||!face?.isMesh||typeof surfaceZ!=='function')throw new TypeError('Expressions require the unbatched head and its surface projection');
 const mobile=p.detail==='mobile',patchSegments=mobile?20:detail.patch[1],patchRings=mobile?2:Math.max(3,detail.patch[0]);
 const tubeSegments=mobile?10:detail.line[0],tubeSides=mobile?6:detail.line[1];
 const specifications=[];
 const material=(color,roughness=.65)=>new T.MeshStandardMaterial({color,roughness,metalness:0});
 const lip=innerEar||material('#c47a58'),dark=material('#633527'),brow=material('#60402d');
 const sclera=material('#fffaf4',.30),iris=material('#9a643b',.35),pupil=material('#251b17',.35);
 iris.vertexColors=true;
 const mouth=material('#512624'),teeth=material('#fff7e7',.38),tongue=material('#dc7d7b',.50);
 const fw=p.faceWidth??1,fh=p.faceHeight??1;
 const vector=new T.Vector3(),delta=[0,0,0];
 function displacement(x,y,z,parameters,out){
  const xx=x/fw,yy=y/fh,front=smooth(.05,.42,z);
  const cheek=Math.exp(-(((Math.abs(xx)-.46)/.26)**2+((yy+.40)/.22)**2))*front;
  const jaw=smooth(-.38,-.87,yy),chin=Math.exp(-((xx/.35)**2+((yy+.78)/.18)**2))*front;
  // The continuous centerline replaces Math.sign, which made shifted mouths
  // jump as they crossed x=0 in the earlier isolated-head experiment.
  out[0]=fw*(xx/Math.sqrt(xx*xx+.10*.10))*(.045*parameters.cheekPuff*cheek+.016*parameters.cheekLift*cheek-.010*parameters.chinTight*chin);
  out[1]=fh*(.042*parameters.cheekLift*cheek-.100*parameters.jawOpen*jaw+.016*parameters.chinTight*chin);
  out[2]=.058*parameters.cheekPuff*cheek+.020*parameters.cheekLift*cheek-.019*parameters.jawOpen*jaw*front+.020*parameters.chinTight*chin;
 }
 function surface(x,y,depth,parameters,out){
  const xx=x*fw,yy=y*fh,z=surfaceZ(xx,yy);displacement(xx,yy,z,parameters,delta);
  out.set(xx+delta[0],yy+delta[1],z+delta[2]+depth);return out;
 }
 function register(name,geometry,mat,evaluate){
  const mesh=new T.Mesh(geometry,mat);mesh.name=name;mesh.userData.expressionFeature=name;root.add(mesh);
  specifications.push({mesh,evaluate});return mesh;
 }
 function patch(name,mat,fn,rings=patchRings,segments=patchSegments){
  const ps=new Float32Array((1+rings*segments)*3),ix=[],samples=[[0,0]];
  for(let j=1;j<=rings;j++)for(let i=0;i<segments;i++)samples.push([j/rings,i/segments*Math.PI*2]);
  for(let i=0;i<segments;i++)ix.push(0,1+i,1+(i+1)%segments);
  for(let j=0;j<rings-1;j++)for(let i=0;i<segments;i++){
   const a=1+j*segments+i,b=1+j*segments+(i+1)%segments,c=a+segments,d=b+segments;ix.push(a,c,b,b,c,d);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(ps,3));g.setIndex(ix);
  if(mat.vertexColors){const colors=[];for(const [r]of samples){const tint=1-.34*r*r;colors.push(tint,tint,tint);}g.setAttribute('color',new T.Float32BufferAttribute(colors,3));}
  return register(name,g,mat,parameters=>{
   for(let i=0;i<samples.length;i++){fn(samples[i][0],samples[i][1],parameters,vector);ps.set(vector.toArray(),i*3);}
  });
 }
 function tube(name,mat,radius,fn,segments=tubeSegments,sides=tubeSides,taper=.55){
  const ps=new Float32Array((segments+1)*sides*3),ix=[];
  for(let j=0;j<segments;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides;ix.push(a,b,a+sides,b,b+sides,a+sides);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(ps,3));g.setIndex(ix);
  const before=new T.Vector3(),after=new T.Vector3(),center=new T.Vector3();
  return register(name,g,mat,parameters=>{
   for(let j=0;j<=segments;j++){
    const t=j/segments;fn(t,parameters,center);fn(Math.max(0,t-.001),parameters,before);fn(Math.min(1,t+.001),parameters,after);
    const dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
    const r=radius*(taper+(1-taper)*Math.sin(Math.PI*t));
    for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a);ps.set([center.x+nx*c*r,center.y+ny*c*r,center.z+s*r],(j*sides+k)*3);}
   }
  });
 }
 function ball(name,mat,scale,x,y,depth){
  const g=new T.SphereGeometry(1,...detail.sphere),base=g.attributes.position.array.slice();
  register(name,g,mat,parameters=>{
   const center=surface(x,y,depth,parameters,new T.Vector3()),positions=g.attributes.position.array;
   for(let i=0;i<positions.length;i+=3){positions[i]=base[i]*scale[0]+center.x;positions[i+1]=base[i+1]*scale[1]+center.y;positions[i+2]=base[i+2]*scale[2]+center.z;}
  });
 }
 const eyeY=-.215,eyeWidth=.231;
 function openness(side,parameters){return parameters.eyeOpen*(side===1?1-.92*parameters.wink:1);}
 function aperture(side,u,top,parameters){
  const arc=Math.pow(Math.max(0,1-u*u),.57);
  return eyeY+(top?.248:-.224)*openness(side,parameters)*arc+.013*u*side;
 }
 function eyePoint(side,x,y,depth,parameters,out){
  const cx=side*.323,u=clamp((x-cx)/eyeWidth,-1,1),top=aperture(side,u,true,parameters),bottom=aperture(side,u,false,parameters);
  y=clamp(y,bottom+.0005,top-.0005);
  const radial=clamp(((x-cx)/eyeWidth)**2+((y-eyeY)/(.242*Math.max(.10,openness(side,parameters))))**2,0,1);
  return surface(x,y,.017+.047*(1-radial)+depth,parameters,out);
 }
 for(const side of [-1,1]){
  const cx=side*.323;
  patch(`eye-white-${side}`,sclera,(r,a,parameters,out)=>{
   const u=r*Math.cos(a),y=eyeY+(Math.sin(a)>=0?.248:-.224)*openness(side,parameters)*r*Math.abs(Math.sin(a))+.013*u*side;
   eyePoint(side,cx+eyeWidth*u,y,0,parameters,out);
  });
  for(const [name,mat,rx,ry,depth]of [['iris',iris,.148,.184,.009],['pupil',pupil,.080,.124,.016]]){
   patch(`eye-${name}-${side}`,mat,(r,a,parameters,out)=>{
    const x=cx-side*.007+parameters.gazeX*.054+rx*r*Math.cos(a),y=eyeY-.009+parameters.gazeY*.052+ry*r*Math.sin(a);
    eyePoint(side,x,y,depth,parameters,out);
   },mobile?2:patchRings);
  }
  for(const [name,x,y,rx,ry]of [['large',-.044,.072,.031,.039],['small',.039,-.064,.013,.016]]){
   patch(`eye-highlight-${name}-${side}`,sclera,(r,a,parameters,out)=>{
    const open=openness(side,parameters),fade=smooth(.14,.44,open),gx=cx+parameters.gazeX*.054+x,gy=eyeY-.009+parameters.gazeY*.052+y;
    const bottom=aperture(side,(gx-cx)/eyeWidth,false,parameters),top=aperture(side,(gx-cx)/eyeWidth,true,parameters);
    const fit=smooth(bottom,bottom+.03,gy)*(1-smooth(top-.03,top,gy))*fade;
    eyePoint(side,gx+rx*r*Math.cos(a)*Math.max(.015,fit),gy+ry*r*Math.sin(a)*Math.max(.015,fit),fit>.05?.026:-.065,parameters,out);
   },1,mobile?12:patchSegments);
  }
  tube(`upper-lid-${side}`,dark,.012,(t,parameters,out)=>{const u=t*2-1;eyePoint(side,cx+eyeWidth*u,aperture(side,u,true,parameters),.012,parameters,out);});
  tube(`lower-lid-${side}`,lip,.007,(t,parameters,out)=>{const u=t*2-1;eyePoint(side,cx+eyeWidth*u,aperture(side,u,false,parameters),.006,parameters,out);});
  tube(`brow-${side}`,brow,.030,(t,parameters,out)=>{
   const x=side*(.135+.405*t),y=.122+.057*Math.sin(Math.PI*t)+.067*parameters.browRaise+.072*parameters.browTilt*(t-.5)+side*.041*parameters.browAsym;
   surface(x,y,.024,parameters,out);
  },tubeSegments,tubeSides,.40);
 }
 ball('nose-tip',skin,[.090,.066,.068],0,-.435,.029);
 ball('nostril-left',lip,[.016,.009,.009],-.045,-.468,.075);
 ball('nostril-right',lip,[.016,.009,.009],.045,-.468,.075);
 function mouthY(u,top,parameters){
  const arc=Math.pow(Math.max(0,1-u*u),.62),smile=parameters.smile*.079*(u*u-.38);
  return -.622+smile+(top?.30:-.70)*parameters.mouthOpen*arc;
 }
 const mouthPoint=(x,y,depth,parameters,out)=>surface(x,y,depth,parameters,out);
 patch('mouth-cavity',mouth,(r,a,parameters,out)=>{
  const u=r*Math.cos(a),top=mouthY(u,true,parameters),bottom=mouthY(u,false,parameters),cy=(top+bottom)/2;
  mouthPoint(parameters.mouthShift+parameters.mouthWidth*u,cy+Math.sin(a)*r*(top-bottom)/2,.018,parameters,out);
 });
 for(const [top,radius]of [[true,.008],[false,.012]])tube(top?'upper-lip':'lower-lip',lip,radius,(t,parameters,out)=>{
  const u=t*2-1;mouthPoint(parameters.mouthShift+parameters.mouthWidth*u,mouthY(u,top,parameters),.027,parameters,out);
 },tubeSegments,tubeSides,.36);
 patch('upper-teeth',teeth,(r,a,parameters,out)=>{
  const u=.87*r*Math.cos(a),upper=mouthY(u,true,parameters)-.007,lower=mouthY(u,false,parameters)+.009,gap=Math.max(.001,upper-lower);
  const bottom=Math.max(lower,upper-Math.min(.075,gap*(.38+.54*parameters.clench))),cy=(upper+bottom)/2;
  mouthPoint(parameters.mouthShift+parameters.mouthWidth*u,cy+Math.sin(a)*r*(upper-bottom)/2,parameters.mouthOpen>.03&&parameters.mouthWidth>=.16?.030:-.055,parameters,out);
 });
 patch('tongue',tongue,(r,a,parameters,out)=>{
  const u=.50*r*Math.cos(a),lower=mouthY(u,false,parameters),top=mouthY(u,true,parameters),height=(top-lower)*.20*parameters.tongue;
  mouthPoint(parameters.mouthShift+parameters.mouthWidth*u,lower+height+.012+Math.sin(a)*r*Math.max(.001,height),parameters.tongue>.05&&parameters.mouthOpen>.03?.032:-.065,parameters,out);
 });
 tube('clenched-teeth-line',lip,.0027,(t,parameters,out)=>{
  const u=(t*2-1)*.75;mouthPoint(parameters.mouthShift+parameters.mouthWidth*u,(mouthY(u,true,parameters)+mouthY(u,false,parameters))*.5+.009,parameters.clench>.10?.034:-.070,parameters,out);
 },mobile?8:tubeSegments,tubeSides,.45);

 // Face endpoint deltas are relative to the existing r9 skin. Feature geometry
 // uses the same displaced surface, so mouths/eyes follow cheeks and jaw.
 const faceBase=face.geometry.attributes.position.array.slice(),faceCount=face.geometry.attributes.position.count;
 specifications.unshift({mesh:face,evaluate:parameters=>{
  const values=face.geometry.attributes.position.array;
  for(let i=0;i<faceCount;i++){
   const x=faceBase[i*3],y=faceBase[i*3+1],z=faceBase[i*3+2];displacement(x,y,z,parameters,delta);
   values[i*3]=x+delta[0];values[i*3+1]=y+delta[1];values[i*3+2]=z+delta[2];
  }
 }});
 for(const {mesh,evaluate}of specifications){
  const g=mesh.geometry,authoredNormal=mesh===face?g.attributes.normal.array.slice():null;
  evaluate(DEFAULT_PARAMETERS);g.computeVertexNormals();
  const basePositions=g.attributes.position.array.slice(),computedBaseNormals=g.attributes.normal.array.slice();
  // Preserve the low-resolution face's analytic normals; use the change in
  // computed normals for endpoint differences rather than replacing r9.
  if(authoredNormal)g.attributes.normal.array.set(authoredNormal);
  const baseNormals=g.attributes.normal.array.slice();
  g.morphTargetsRelative=true;g.morphAttributes.position=[];g.morphAttributes.normal=[];
  for(const id of EXPRESSION_IDS){
   evaluate(EXPRESSIONS[id].parameters);g.computeVertexNormals();
   const posDelta=new Float32Array(basePositions.length),normalDelta=new Float32Array(baseNormals.length);
   for(let i=0;i<posDelta.length;i++){
    posDelta[i]=g.attributes.position.array[i]-basePositions[i];
    normalDelta[i]=g.attributes.normal.array[i]-computedBaseNormals[i];
   }
   const positions=new T.BufferAttribute(posDelta,3);positions.name=id;g.morphAttributes.position.push(positions);
   const normals=new T.BufferAttribute(normalDelta,3);normals.name=id;g.morphAttributes.normal.push(normals);
  }
  g.attributes.position.array.set(basePositions);g.attributes.normal.array.set(baseNormals);
  mesh.updateMorphTargets();mesh.frustumCulled=false;g.computeBoundingBox();g.computeBoundingSphere();
 }
 root.userData.expressionIds=[...EXPRESSION_IDS];root.userData.expressionMethod='six named relative position/normal morph targets; fixed topology; shared curved face surface';
 applyExpression(root,'happy');
 return {features:specifications.map(s=>s.mesh),expressionIds:EXPRESSION_IDS};
}

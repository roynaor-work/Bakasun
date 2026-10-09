import * as T from './vendor/three.module.js';
import {DEFAULT_PARAMETERS,EXPRESSION_LIST,EXPRESSION_IDS} from './expressions.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

// All shapes are sampled once. Runtime expression changes only six GPU morph
// weights, including eyes, brows, teeth and tongue; topology never changes.
export function installFacialMorphs(head,{detail='mobile'}={}){
 const {face,faceGeometry,surfaceZ,skin,innerEar}=head.faceRig;
 const mobile=detail==='mobile',segments=mobile?20:detail==='balanced'?32:48,rings=mobile?3:detail==='balanced'?4:6;
 const lineSteps=mobile?10:detail==='balanced'?20:32,lineSides=mobile?4:8;
 let parameters=DEFAULT_PARAMETERS;
 const mat=color=>new T.MeshStandardMaterial({color,roughness:.58});
 const white=mat('#fffaf4'),irisRim=mat('#583520'),iris=mat('#a97542'),pupil=mat('#241a15'),browMat=mat('#65432f');
 iris.vertexColors=true;
 const mouthDark=mat('#492022'),teeth=mat('#fff4dd'),tongue=mat('#d67a77'),lid=mat('#48291f');
 const descriptors=[];
 const p=[0,0,0],da=[0,0,0],db=[0,0,0],dc=[0,0,0],delta=[0,0,0];
 function deform(x,y,z,out){
  const front=smooth(.05,.42,z),cheek=Math.exp(-(((Math.abs(x)-.46)/.26)**2+((y+.40)/.22)**2))*front;
  const jaw=smooth(-.38,-.87,y),chin=Math.exp(-((x/.35)**2+((y+.78)/.18)**2))*front;
  const puff=parameters.cheekPuff-DEFAULT_PARAMETERS.cheekPuff,lift=parameters.cheekLift-DEFAULT_PARAMETERS.cheekLift;
  const open=parameters.jawOpen-DEFAULT_PARAMETERS.jawOpen,tight=parameters.chinTight;
  out[0]=(x/Math.sqrt(x*x+.10*.10))*(.052*puff*cheek+.018*lift*cheek-.012*tight*chin);
  out[1]=.048*lift*cheek-.115*open*jaw+.018*tight*chin;
  out[2]=.070*puff*cheek+.025*lift*cheek-.022*open*jaw*front+.023*tight*chin;
 }
 function surface(x,y,depth,out){const z=surfaceZ(x,y);deform(x,y,z,delta);out[0]=x+delta[0];out[1]=y+delta[1];out[2]=z+delta[2]+depth;}
 function mesh(g,material,name,sample){const m=new T.Mesh(g,material);m.name=name;head.add(m);descriptors.push({mesh:m,sample});return m;}
 function patch(name,material,fn,ringCount=rings,segmentCount=segments){
  const coords=[[0,0]],ix=[];
  for(let j=1;j<=ringCount;j++)for(let i=0;i<segmentCount;i++)coords.push([j/ringCount,i/segmentCount*Math.PI*2]);
  for(let i=0;i<segmentCount;i++)ix.push(0,1+i,1+(i+1)%segmentCount);
  for(let j=0;j<ringCount-1;j++)for(let i=0;i<segmentCount;i++){const a=1+j*segmentCount+i,b=1+j*segmentCount+(i+1)%segmentCount,c=a+segmentCount,d=b+segmentCount;ix.push(a,c,b,b,c,d);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(coords.length*3),3));g.setIndex(ix);
  if(material.vertexColors){const colors=[];for(const [r]of coords){const tint=1-.34*r*r;colors.push(tint,tint,tint);}g.setAttribute('color',new T.Float32BufferAttribute(colors,3));}
  return mesh(g,material,name,()=>{const pos=g.attributes.position;for(let i=0;i<coords.length;i++){fn(...coords[i],p);pos.setXYZ(i,...p);}g.computeVertexNormals();});
 }
 function tube(name,material,radius,fn,taper=.5,steps=lineSteps){
  const g=new T.BufferGeometry(),ix=[];g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array((steps+1)*lineSides*3),3));
  for(let j=0;j<steps;j++)for(let k=0;k<lineSides;k++){const a=j*lineSides+k,b=j*lineSides+(k+1)%lineSides;ix.push(a,b,a+lineSides,b,b+lineSides,a+lineSides);}
  g.setIndex(ix);
  return mesh(g,material,name,()=>{
   const pos=g.attributes.position;
   for(let j=0;j<=steps;j++){
    const t=j/steps;fn(t,dc);fn(Math.max(0,t-.001),da);fn(Math.min(1,t+.001),db);
    const dx=db[0]-da[0],dy=db[1]-da[1],length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
    const r=radius*(taper+(1-taper)*Math.sin(Math.PI*t));
    for(let k=0;k<lineSides;k++){const a=k/lineSides*Math.PI*2;pos.setXYZ(j*lineSides+k,dc[0]+nx*Math.cos(a)*r,dc[1]+ny*Math.cos(a)*r,dc[2]+Math.sin(a)*r);}
   }
   g.computeVertexNormals();
  });
 }
 const faceBase=faceGeometry.attributes.position.array.slice(),faceNormalBase=faceGeometry.attributes.normal.array.slice();
 const jacobian=new T.Matrix3(),normalTransform=new T.Matrix3(),normal=new T.Vector3(),epsilon=.0001;
 descriptors.push({mesh:face,sample:()=>{
  const ps=faceGeometry.attributes.position,ns=faceGeometry.attributes.normal;
  for(let i=0;i<ps.count;i++){
   const x=faceBase[i*3],y=faceBase[i*3+1],z=faceBase[i*3+2];deform(x,y,z,delta);ps.setXYZ(i,x+delta[0],y+delta[1],z+delta[2]);
   const derivatives=[];
   for(let axis=0;axis<3;axis++){
    const lo=[x,y,z],hi=[x,y,z];lo[axis]-=epsilon;hi[axis]+=epsilon;deform(...lo,da);deform(...hi,db);
    derivatives.push(db.map((v,j)=>(v-da[j])/(2*epsilon)));
   }
   jacobian.set(1+derivatives[0][0],derivatives[1][0],derivatives[2][0],derivatives[0][1],1+derivatives[1][1],derivatives[2][1],derivatives[0][2],derivatives[1][2],1+derivatives[2][2]);
   normalTransform.copy(jacobian).invert().transpose();normal.fromArray(faceNormalBase,i*3).applyMatrix3(normalTransform).normalize();ns.setXYZ(i,normal.x,normal.y,normal.z);
  }
 }});
 function aperture(side,u,top){
  const openness=parameters.eyeOpen*(side===1?1-.92*parameters.wink:1),arc=Math.pow(Math.max(0,1-u*u),.57);
  return -.215+(top?.248:-.224)*openness*arc+.014*u*side;
 }
 function eyePoint(side,x,y,depth,out){
  const cx=side*.323,u=clamp((x-cx)/.235,-1,1),top=aperture(side,u,true),bottom=aperture(side,u,false);
  y=clamp(y,bottom+.001,top-.001);
  const radial=clamp(((x-cx)/.235)**2+((y+.215)/(.242*Math.max(.1,parameters.eyeOpen)))**2,0,1);
  surface(x,y,.012+.041*(1-radial)+depth,out);
 }
 for(const side of [-1,1]){
  const cx=side*.323;
  patch('sclera-'+side,white,(r,a,out)=>{
   const u=r*Math.cos(a),openness=parameters.eyeOpen*(side===1?1-.92*parameters.wink:1);
   eyePoint(side,cx+.235*u,-.215+(Math.sin(a)>=0?.248:-.224)*openness*r*Math.abs(Math.sin(a))+.014*u*side,0,out);
  });
  for(const [name,material,rx,ry,depth]of [['iris-rim',irisRim,.149,.183,.006],['iris',iris,.135,.171,.011],['pupil',pupil,.081,.121,.017]]){
   // The rim's center is covered by the iris; one fan retains its visible
   // perimeter with fewer hidden vertices. Iris and pupil retain two rings.
   patch(name+'-'+side,material,(r,a,out)=>eyePoint(side,cx+parameters.gazeX*.056+rx*r*Math.cos(a),-.224+parameters.gazeY*.052+ry*r*Math.sin(a),depth,out),mobile?(name==='iris-rim'?1:2):rings);
  }
  for(const [name,x,y,rx,ry]of [['large',-.045,.074,.029,.038],['small',.043,-.067,.012,.016]]){
   patch('eye-highlight-'+name+'-'+side,white,(r,a,out)=>eyePoint(side,cx+parameters.gazeX*.056+x+rx*r*Math.cos(a),-.224+parameters.gazeY*.052+y+ry*r*Math.sin(a),.024,out),1,mobile?8:segments);
  }
  tube('upper-lid-'+side,lid,.011,(t,out)=>{const u=t*2-1;eyePoint(side,cx+.235*u,aperture(side,u,true),.022,out);},.4);
  tube('lower-lid-'+side,innerEar,.005,(t,out)=>{const u=t*2-1;eyePoint(side,cx+.235*u,aperture(side,u,false),.010,out);},.4,mobile?6:lineSteps);
  tube('brow-'+side,browMat,.030,(t,out)=>{
   const x=side*(.135+.405*t),y=.122+.057*Math.sin(Math.PI*t)+.067*parameters.browRaise+.072*parameters.browTilt*(t-.5)+side*.041*parameters.browAsym;
   surface(x,y,.022,out);
  },.46);
 }
 function mouthY(u,top){const arc=Math.pow(Math.max(0,1-u*u),.62),smile=parameters.smile*.090*(u*u-.38);return -.643+smile+(top?.30:-.70)*parameters.mouthOpen*arc;}
 function mouthPoint(u,y,depth,out){surface(parameters.mouthShift+parameters.mouthWidth*u,y,depth,out);}
 patch('mouth-cavity',mouthDark,(r,a,out)=>{const u=r*Math.cos(a),top=mouthY(u,true),bottom=mouthY(u,false);mouthPoint(u,(top+bottom)/2+Math.sin(a)*r*(top-bottom)/2,.018,out);},mobile?2:rings);
 for(const [top,name,radius]of [[true,'upper-lip',.006],[false,'lower-lip',.010]])tube(name,innerEar,radius,(t,out)=>{const u=t*2-1;mouthPoint(u,mouthY(u,top),.033,out);},.38);
 patch('upper-teeth',teeth,(r,a,out)=>{
  const u=.87*r*Math.cos(a),upper=mouthY(u,true)-.007,lower=mouthY(u,false)+.007,gap=Math.max(.001,upper-lower);
  const bottom=Math.max(lower,upper-Math.min(.085,gap*(.35+.54*parameters.clench))),visible=smooth(.02,.07,parameters.mouthOpen)*smooth(.16,.25,parameters.mouthWidth);
  mouthPoint(u,(upper+bottom)/2+Math.sin(a)*r*(upper-bottom)/2,visible>.01?.026:-.045,out);
 },mobile?2:rings,mobile?16:segments);
 patch('tongue',tongue,(r,a,out)=>{
  const u=.51*r*Math.cos(a),lower=mouthY(u,false),top=mouthY(u,true),height=(top-lower)*.20*parameters.tongue;
  mouthPoint(u,lower+height+.009+Math.sin(a)*r*Math.max(.002,height),parameters.tongue>.2&&parameters.mouthOpen>.04?.029:-.05,out);
 },mobile?2:rings,mobile?16:segments);
 tube('clenched-teeth-line',innerEar,.002,(t,out)=>{
  const u=(t*2-1)*.77;mouthPoint(u,(mouthY(u,true)+mouthY(u,false))*.5+.006,parameters.clench>.5?.030:-.05,out);
 },.3,mobile?6:lineSteps);
 function sphere(name,material,rx,ry,rz,x,y,depth){
  const g=new T.SphereGeometry(1,mobile?8:20,mobile?6:12),base=g.attributes.position.array.slice();
  return mesh(g,material,name,()=>{surface(x,y,depth,p);const ps=g.attributes.position;for(let i=0;i<ps.count;i++)ps.setXYZ(i,p[0]+base[i*3]*rx,p[1]+base[i*3+1]*ry,p[2]+base[i*3+2]*rz);g.computeVertexNormals();});
 }
 sphere('nose-tip',skin,.090,.066,.068,0,-.435,.029);
 for(const side of [-1,1])sphere('nostril-'+side,innerEar,.016,.009,.009,side*.045,-.468,.075);
 for(const descriptor of descriptors){
  parameters=DEFAULT_PARAMETERS;descriptor.sample();const geometry=descriptor.mesh.geometry;
  const basePositions=geometry.attributes.position.array.slice(),baseNormals=geometry.attributes.normal.array.slice();
  geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[];geometry.morphAttributes.normal=[];
  for(const expression of EXPRESSION_LIST){
   parameters=expression.parameters;descriptor.sample();
   const positions=geometry.attributes.position.array,normals=geometry.attributes.normal.array,dp=new Float32Array(positions.length),dn=new Float32Array(normals.length);
   for(let i=0;i<dp.length;i++){dp[i]=positions[i]-basePositions[i];dn[i]=normals[i]-baseNormals[i];}
   const position=new T.Float32BufferAttribute(dp,3),normal=new T.Float32BufferAttribute(dn,3);position.name=normal.name=expression.id;
   geometry.morphAttributes.position.push(position);geometry.morphAttributes.normal.push(normal);
  }
  geometry.attributes.position.array.set(basePositions);geometry.attributes.normal.array.set(baseNormals);
  descriptor.mesh.updateMorphTargets();descriptor.mesh.frustumCulled=false;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
 }
 head.userData.stats.triangles=head.children.reduce((sum,m)=>sum+(m.geometry?.index?.count||0)/3,0);
 head.userData.expressionIds=[...EXPRESSION_IDS];
 // Keep closures out of userData: the exported file carries target data only.
 delete head.faceRig;
 return head;
}

// Three r160 applyMatrix4 transforms the base attributes only. Relative
// positions need the linear part; normal deltas must transform endpoints
// separately before subtracting the transformed base normal.
export function transformMorphGeometry(geometry,matrix){
 const sourceNormals=geometry.attributes.normal?.array.slice();
 geometry.applyMatrix4(matrix);
 if(!geometry.morphAttributes.position?.length)return geometry;
 const linear=new T.Matrix3().setFromMatrix4(matrix),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),v=new T.Vector3(),n=new T.Vector3();
 for(const attribute of geometry.morphAttributes.position)for(let i=0;i<attribute.count;i++){v.fromBufferAttribute(attribute,i).applyMatrix3(linear);attribute.setXYZ(i,v.x,v.y,v.z);}
 for(const attribute of geometry.morphAttributes.normal||[])for(let i=0;i<attribute.count;i++){
  v.fromBufferAttribute(attribute,i).add(n.fromArray(sourceNormals,i*3)).applyMatrix3(normalMatrix).normalize();
  n.fromBufferAttribute(geometry.attributes.normal,i);v.sub(n);attribute.setXYZ(i,v.x,v.y,v.z);
 }
 return geometry;
}

export function nameExpressionTargets(geometry){
 if(geometry.morphAttributes.position?.length){geometry.morphTargetsRelative=true;for(const kind of ['position','normal'])geometry.morphAttributes[kind]?.forEach((a,i)=>{a.name=EXPRESSION_IDS[i];});}
 return geometry;
}

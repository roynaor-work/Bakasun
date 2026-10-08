import * as T from './three.module.js';
import {targetModel} from './model.mjs';
import {DEFAULT_PARAMETERS,PARAMETER_RANGES,resolveExpression} from './expressions.mjs';

// The winner is the starting shape. The archived targetModel() path is intact.
export const ROUND9_PARAMETERS=Object.freeze({
 faceWidth:.99,faceHeight:1,jawDepth:1,hairWidth:1.07,hairDepth:1.10,
 crownHeight:.98,fringeSweep:1,lockWidth:1,spikeHeight:.90,
 napeLength:1,eyeInset:0,mouthInset:0,strandJitter:0,hair:'ribbons'
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const parameterKeys=Object.keys(PARAMETER_RANGES);

export function expressionModel({expression='happy',...options}={}){
 const base=targetModel({...ROUND9_PARAMETERS,faceRig:true,hairFlow:'swept',detail:'expressions'});
 const {root,body,face,faceGeometry,faceRings,ears,materials}=base;
 root.userData.model='expressive-r9';
 const parameters={...DEFAULT_PARAMETERS};
 const simple=(color,extra={})=>new T.MeshPhongMaterial({color,shininess:32,specular:'#352719',...extra});
 const dark=simple('#352018',{shininess:10}),lip=simple('#bd714e',{shininess:15}),brow=simple('#543423',{shininess:8});
 const sclera=simple('#fff9ef',{shininess:95,specular:'#ffffff'}),irisMat=simple('#a66a32',{shininess:100,specular:'#d4bda0'});
 const irisRim=simple('#57321d',{shininess:90}),pupilMat=new T.MeshBasicMaterial({color:'#21150f'}),glintMat=new T.MeshBasicMaterial({color:'#ffffff',transparent:true,depthWrite:false});
 const mouthMat=new T.MeshBasicMaterial({color:'#542824'}),teethMat=simple('#fff7df',{shininess:45,transparent:true,depthWrite:false}),tongueMat=simple('#d67a77',{shininess:65,transparent:true,depthWrite:false});
 const dimpleMat=simple('#bd714e',{shininess:15,transparent:true,depthWrite:false}),clenchMat=dimpleMat.clone();
 const blushMat=new T.MeshBasicMaterial({color:'#df886f',transparent:true,opacity:.18,depthWrite:false});

 function mesh(geometry,material,name){const m=new T.Mesh(geometry,material);m.name=name;root.add(m);return m;}
 function ball(position,scale,material,name){const m=mesh(new T.SphereGeometry(1,24,16),material,name);m.position.set(...position);m.scale.set(...scale);return m;}
 function baseSurface(x,y){
  let a=faceRings[0],b=faceRings.at(-1);
  for(let i=1;i<faceRings.length;i++)if(y<=faceRings[i].y){a=faceRings[i-1];b=faceRings[i];break;}
  const t=clamp((y-a.y)/(b.y-a.y||1),0,1),rx=a.rx+(b.rx-a.rx)*t,rz=a.rz+(b.rz-a.rz)*t,cz=a.cz+(b.cz-a.cz)*t;
  let z=cz+rz*Math.sqrt(Math.max(.005,1-(x/Math.max(.01,rx))**2));
  if(y<-.5)z=.1+(z-.1)*ROUND9_PARAMETERS.jawDepth;
  return z;
 }
 function deformation(x,y,z,out,mode=null){
  const front=smooth(.05,.42,z),cheek=Math.exp(-(((Math.abs(x)-.46)/.26)**2+((y+.40)/.22)**2))*front;
  const jaw=smooth(-.38,-.87,y),chin=Math.exp(-((x/.35)**2+((y+.78)/.18)**2))*front;
  const puff=mode==='cheekPuff'?1:mode?0:parameters.cheekPuff;
  const lift=mode==='cheekLift'?1:mode?0:parameters.cheekLift;
  const open=mode==='jawOpen'?1:mode?0:parameters.jawOpen;
  const tight=mode==='chinTight'?1:mode?0:parameters.chinTight;
  // Taper lateral displacement through the centerline; Math.sign would make
  // mouth vertices jump when an asymmetric smile crosses x=0 during a blend.
  out[0]=(x/Math.sqrt(x*x+.10*.10))*(.052*puff*cheek+.018*lift*cheek-.012*tight*chin);
  out[1]=.048*lift*cheek-.115*open*jaw+.018*tight*chin;
  out[2]=.070*puff*cheek+.025*lift*cheek-.022*open*jaw*front+.023*tight*chin;
 }
 const delta=[0,0,0];
 function surfacePoint(x,y,offset,out){const z=baseSurface(x,y);deformation(x,y,z,delta);out[0]=x+delta[0];out[1]=y+delta[1];out[2]=z+delta[2]+offset;}

 // Actual cheek, jaw and chin morph targets share the original head topology.
 // Normals are precomputed once; Three performs the interpolation in the GPU.
 const morphNames=['cheekPuff','cheekLift','jawOpen','chinTight'];
 faceGeometry.morphTargetsRelative=true;
 faceGeometry.morphAttributes.position=[];faceGeometry.morphAttributes.normal=[];
 const positions=faceGeometry.attributes.position,originalNormals=faceGeometry.attributes.normal;
 for(const name of morphNames){
  const values=new Float32Array(positions.array.length);
  for(let i=0;i<positions.count;i++){deformation(positions.getX(i),positions.getY(i),positions.getZ(i),delta,name);values.set(delta,i*3);}
  const attr=new T.Float32BufferAttribute(values,3);attr.name=name;faceGeometry.morphAttributes.position.push(attr);
  const copy=faceGeometry.clone(),p=copy.attributes.position;
  for(let i=0;i<p.array.length;i++)p.array[i]+=values[i];
  copy.computeVertexNormals();const normals=new Float32Array(originalNormals.array.length);
  for(let i=0;i<normals.length;i++)normals[i]=copy.attributes.normal.array[i]-originalNormals.array[i];
  faceGeometry.morphAttributes.normal.push(new T.Float32BufferAttribute(normals,3));copy.dispose();
 }
 const faceMeshes=[];face.traverse(m=>{if(m.isMesh&&m.geometry===faceGeometry){m.updateMorphTargets();faceMeshes.push(m);}});
 faceGeometry.computeBoundingSphere();faceGeometry.boundingSphere.radius+=.15;

 // Stable radial patches follow the curved skin instead of floating flat discs.
 function patch(name,material,rings=8,segments=64){
  const ps=new Float32Array((rings+1)*(segments+1)*3),uv=new Float32Array((rings+1)*(segments+1)*2),ix=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const k=j*(segments+1)+i;uv[k*2]=i/segments;uv[k*2+1]=j/rings;}
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+1,c=a+segments+1;ix.push(a,c,b,b,c,c+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(ps,3).setUsage(T.DynamicDrawUsage));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(ix);
  const m=mesh(g,material,name);m.userData.patch={rings,segments};m.frustumCulled=false;return m;
 }
 const point=[0,0,0];
 function updatePatch(m,fn){
  const {rings,segments}=m.userData.patch,ps=m.geometry.attributes.position;
  let index=0;
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){fn(j/rings,i/segments*Math.PI*2,point);ps.setXYZ(index++,...point);}
  ps.needsUpdate=true;m.geometry.computeVertexNormals();
 }
 function tube(name,material,radius,segments=40,sides=8){
  const ps=new Float32Array((segments+1)*sides*3),normals=new Float32Array(ps.length),ix=[];
  for(let j=0;j<segments;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides;ix.push(a,b,a+sides,b,b+sides,a+sides);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(ps,3).setUsage(T.DynamicDrawUsage));g.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));g.setIndex(ix);
  const m=mesh(g,material,name);m.userData.tube={radius,segments,sides};m.frustumCulled=false;return m;
 }
 const ta=[0,0,0],tb=[0,0,0],tc=[0,0,0];
 function updateTube(m,fn,taper=.7){
  const {radius,segments,sides}=m.userData.tube,ps=m.geometry.attributes.position,ns=m.geometry.attributes.normal;
  for(let j=0;j<=segments;j++){
   const t=j/segments;fn(t,tc);fn(Math.max(0,t-.001),ta);fn(Math.min(1,t+.001),tb);
   const dx=tb[0]-ta[0],dy=tb[1]-ta[1],length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
   const r=radius*(taper+(1-taper)*Math.sin(Math.PI*t));
   for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a),index=j*sides+k;ps.setXYZ(index,tc[0]+nx*c*r,tc[1]+ny*c*r,tc[2]+s*r);ns.setXYZ(index,nx*c,ny*c,s);}
  }
  ps.needsUpdate=true;ns.needsUpdate=true;
 }

 for(const e of ears)e.scale.set(.92,.96,.92);
 const nose=ball([0,0,0],[.090,.068,.065],materials.skin,'nose-tip');
 const bridge=ball([0,0,0],[.050,.055,.031],materials.skin,'nose-bridge');
 const nostrils=[-1,1].map(s=>ball([0,0,0],[.016,.009,.008],lip,`nostril-${s}`));
 const cheeks=[-1,1].map(s=>patch(`cheek-blush-${s}`,blushMat,3,40));
 const dimples=[-1,1].map(s=>tube(`smile-dimple-${s}`,dimpleMat,.006,12,6));
 const eyes=[-1,1].map(s=>({s,
  white:patch(`sclera-${s}`,sclera),irisRim:patch(`iris-rim-${s}`,irisRim,5,48),iris:patch(`iris-${s}`,irisMat,6,48),pupil:patch(`pupil-${s}`,pupilMat,4,40),
  upperLid:tube(`upper-lid-${s}`,dark,.017),lowerLid:tube(`lower-lid-${s}`,lip,.009),
  glints:[ball([0,0,0],[.025,.034,.007],glintMat.clone(),`eye-glint-large-${s}`),ball([0,0,0],[.011,.014,.005],glintMat.clone(),`eye-glint-small-${s}`)]
 }));
 const brows=[-1,1].map(s=>tube(`brow-${s}`,brow,.032,36,10));
 const mouth={cavity:patch('mouth-cavity',mouthMat,7,64),upperLip:tube('upper-lip',lip,.009),lowerLip:tube('lower-lip',lip,.014),
  teeth:patch('upper-teeth',teethMat,5,64),tongue:patch('tongue',tongueMat,5,48),clenchLine:tube('clenched-teeth-line',clenchMat,.003,32,6)};

 function aperture(eye,u,top){
  const openness=parameters.eyeOpen*(eye.s===1?1-.92*parameters.wink:1),arc=Math.pow(Math.max(0,1-u*u),.57);
  return -.215+(top?.248:-.224)*openness*arc+.014*u*eye.s;
 }
 function eyePoint(eye,x,y,depth,out){
  const cx=eye.s*.323,u=clamp((x-cx)/.235,-1,1),top=aperture(eye,u,true),bottom=aperture(eye,u,false);
  y=clamp(y,bottom+.001,top-.001);
  const radial=clamp(((x-cx)/.235)**2+((y+.215)/(.242*Math.max(.1,parameters.eyeOpen)))**2,0,1);
  surfacePoint(x,y,.010+.041*(1-radial)+depth,out);
 }
 function updateEyes(){
  for(const eye of eyes){
   const cx=eye.s*.323,openness=parameters.eyeOpen*(eye.s===1?1-.92*parameters.wink:1);
   updatePatch(eye.white,(r,a,out)=>{
    const u=r*Math.cos(a),y=-.215+(Math.sin(a)>=0?.248:-.224)*openness*r*Math.abs(Math.sin(a))+.014*u*eye.s;
    eyePoint(eye,cx+.235*u,y,0,out);
   });
   const gazeX=parameters.gazeX*.056,gazeY=parameters.gazeY*.052,irisX=cx+gazeX,irisY=-.22+gazeY;
   const renderIris=(m,rx,ry,depth)=>updatePatch(m,(r,a,out)=>eyePoint(eye,irisX+rx*r*Math.cos(a),irisY+ry*r*Math.sin(a),depth,out));
   renderIris(eye.irisRim,.139,.174,.005);renderIris(eye.iris,.124,.162,.008);renderIris(eye.pupil,.075,.113,.012);
   const glintPositions=[[-.042,.074],[.037,-.064]];
   for(let i=0;i<eye.glints.length;i++){
    const g=eye.glints[i],gx=irisX+glintPositions[i][0],gy=irisY+glintPositions[i][1];
    eyePoint(eye,gx,gy,.023,point);g.position.set(...point);
    const bottom=aperture(eye,(gx-cx)/.235,false),top=aperture(eye,(gx-cx)/.235,true);
    g.material.opacity=smooth(bottom,bottom+.035,gy)*(1-smooth(top-.035,top,gy));
    g.visible=g.material.opacity>0;
   }
   updateTube(eye.upperLid,(t,out)=>{const u=t*2-1;eyePoint(eye,cx+.235*u,aperture(eye,u,true),.015,out);},.55);
   updateTube(eye.lowerLid,(t,out)=>{const u=t*2-1;eyePoint(eye,cx+.235*u,aperture(eye,u,false),.006,out);},.60);
  }
  for(let i=0;i<brows.length;i++){
   const s=i===0?-1:1;
   updateTube(brows[i],(t,out)=>{
    const x=s*(.135+.405*t),y=.122+.057*Math.sin(Math.PI*t)+.067*parameters.browRaise+.072*parameters.browTilt*(t-.5)+s*.041*parameters.browAsym;
    surfacePoint(x,y,.019,out);
   },.46);
  }
 }

 function mouthY(u,top){
  const arc=Math.pow(Math.max(0,1-u*u),.62),smile=parameters.smile*.090*(u*u-.38);
  return -.643+smile+(top?.30:-.70)*parameters.mouthOpen*arc;
 }
 function mouthPoint(x,y,depth,out){surfacePoint(x,y,depth,out);}
 function updateMouth(){
  const width=parameters.mouthWidth,cx=parameters.mouthShift;
  updatePatch(mouth.cavity,(r,a,out)=>{
   const u=r*Math.cos(a),arcTop=mouthY(u,true),arcBottom=mouthY(u,false),center=(arcTop+arcBottom)/2;
   mouthPoint(cx+width*u,center+Math.sin(a)*r*(arcTop-arcBottom)/2,.016,out);
  });
  const outline=(top)=>(t,out)=>{const u=t*2-1;mouthPoint(cx+width*u,mouthY(u,top),.025,out);};
  updateTube(mouth.upperLip,outline(true),.38);updateTube(mouth.lowerLip,outline(false),.40);
  teethMat.opacity=smooth(.006,.060,parameters.mouthOpen);mouth.teeth.visible=teethMat.opacity>0;
  updatePatch(mouth.teeth,(r,a,out)=>{
   const u=.87*r*Math.cos(a),upper=mouthY(u,true)-.006,lower=mouthY(u,false)+.009,gap=upper-lower;
   const bottom=Math.max(lower,upper-Math.min(.085,gap*(.35+.54*parameters.clench))),center=(upper+bottom)/2;
   mouthPoint(cx+width*u,center+Math.sin(a)*r*(upper-bottom)/2,.025,out);
  });
  tongueMat.opacity=parameters.tongue*smooth(.015,.090,parameters.mouthOpen);mouth.tongue.visible=tongueMat.opacity>0;
  updatePatch(mouth.tongue,(r,a,out)=>{
   const u=.51*r*Math.cos(a),lower=mouthY(u,false),top=mouthY(u,true),height=(top-lower)*.20*parameters.tongue;
   mouthPoint(cx+width*u,lower+height+.013+Math.sin(a)*r*height,.030,out);
  });
  clenchMat.opacity=parameters.clench*smooth(.015,.080,parameters.mouthOpen);mouth.clenchLine.visible=clenchMat.opacity>0;
  updateTube(mouth.clenchLine,(t,out)=>{const u=(t*2-1)*.77;mouthPoint(cx+width*u,(mouthY(u,true)+mouthY(u,false))*.5+.010,.031,out);},.5);
  for(let i=0;i<dimples.length;i++){
   const s=i===0?-1:1;dimpleMat.opacity=smooth(.25,.65,parameters.smile);dimples[i].visible=dimpleMat.opacity>0;
   updateTube(dimples[i],(t,out)=>mouthPoint(cx+s*(width+.018+.008*Math.sin(Math.PI*t)),mouthY(s,true)-.010+(t-.5)*.037,.009,out),.2);
  }
 }
 function update(){
  for(const m of faceMeshes)for(let i=0;i<morphNames.length;i++)m.morphTargetInfluences[i]=parameters[morphNames[i]];
  surfacePoint(0,-.412,.043,point);nose.position.set(...point);
  surfacePoint(0,-.370,.012,point);bridge.position.set(...point);
  for(let i=0;i<nostrils.length;i++){surfacePoint((i===0?-1:1)*.045,-.449,.078,point);nostrils[i].position.set(...point);}
  for(let i=0;i<cheeks.length;i++){const s=i===0?-1:1;updatePatch(cheeks[i],(r,a,out)=>surfacePoint(s*.52+.095*r*Math.cos(a),-.450+.041*r*Math.sin(a),.008,out));}
  updateEyes();updateMouth();
 }
 function setExpression(value){const resolved=resolveExpression(value);for(const key of parameterKeys)parameters[key]=resolved[key];update();return parameters;}
 function setBlend(from,to,t){
  if(!Number.isFinite(t))throw new TypeError('Blend factor must be finite');
  const a=resolveExpression(from),b=resolveExpression(to),blend=clamp(t,0,1);
  for(const key of parameterKeys)parameters[key]=a[key]+(b[key]-a[key])*blend;
  update();return parameters;
 }
 function dispose(){
  const geometries=new Set(),materialSet=new Set([glintMat]),textures=new Set();
  root.traverse(m=>{if(m.isMesh){geometries.add(m.geometry);for(const material of Array.isArray(m.material)?m.material:[m.material])materialSet.add(material);}});
  for(const material of materialSet)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  for(const geometry of geometries)geometry.dispose();for(const material of materialSet)material.dispose();for(const texture of textures)texture.dispose();
  root.removeFromParent();
 }
 setExpression(expression);
 return {root,body,face,faceGeometry,parameters,baseParameters:ROUND9_PARAMETERS,setExpression,setBlend,dispose,
  features:{eyes,brows,mouth,nose,bridge,nostrils,cheeks,dimples,ears},options};
}

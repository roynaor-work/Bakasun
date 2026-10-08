import * as T from '../vendor/three.module.js';

// Copied and adapted from kid-head/model.mjs (r9 geometry); original is read-only.
export const targetDefaults={faceWidth:1,faceHeight:1,jawDepth:1,hairWidth:1,hairDepth:1,crownHeight:1,fringeSweep:1,lockWidth:1,spikeHeight:1,napeLength:1,eyeInset:0,mouthInset:0,strandJitter:0,hair:'ribbons'};
export const HEAD_DETAIL = Object.freeze({
 dense: { sphere:[32,24], line:[32,10], face:[64,96], cap:[40,80], lock:[20,12], patch:[8,48] },
 balanced: { sphere:[16,10], line:[16,6], face:[24,40], cap:[16,40], lock:[8,6], patch:[4,24] },
 mobile: { sphere:[8,6], line:[10,5], face:[12,24], cap:[8,16], lock:[4,4], patch:[3,16] }
});
export function targetModel(parameters={}){
 const p={...targetDefaults,...parameters},root=new T.Group(),body=[],ears=[];
 const detail=HEAD_DETAIL[p.detail] || HEAD_DETAIL.mobile;
 // Standard glTF materials: shells and toon ramps are deliberately absent.
 const toon=c=>new T.MeshStandardMaterial({color:c,roughness:.70,metalness:0});
 const skin=toon('#edac78'),innerEar=toon('#cd784d'),white=toon('#fffaf0'),iris=toon('#9b6335'),pupil=toon('#241a14'),hair=toon('#573723');
 white.roughness=.30;iris.roughness=.35;pupil.roughness=.35;skin.roughness=.60;
 const hairShades=['#62402b','#694631','#5b3926','#71503a','#60402c'].map(toon);
 const skinEdge=null,hairEdge=null;
 function mesh(g,m,parent=root,edge=null){const o=new T.Mesh(g,m);parent.add(o);return o;}
 function ellipse(position,scale,m,parent=root,edge=null){const o=mesh(new T.SphereGeometry(1,...detail.sphere),m,parent);o.position.set(...position);o.scale.set(...scale);return o;}
 function line(points,r,m,parent=root,edge=null){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),detail.line[0],r,detail.line[1],false),m,parent);}
 // Rounded chin and broad cheeks. Cubic interpolation eliminates the old ring facets.
 const profile=[[-.89,.24,.26,.15],[-.84,.44,.37,.12],[-.72,.60,.45,.08],[-.52,.72,.52,.035],[-.25,.77,.61,-.025],[.12,.76,.66,-.045],[.45,.73,.65,-.05],[.74,.65,.59,-.07],[.96,.46,.44,-.08],[1.06,.02,.025,-.08]];
 const yMin=profile[0][0],yMax=profile.at(-1)[0];
 const profileCurve=new T.CatmullRomCurve3(profile.map(r=>new T.Vector3(r[1],r[0],r[2])),false,'centripetal');
 const centerCurve=new T.CatmullRomCurve3(profile.map(r=>new T.Vector3(r[3],r[0],0)),false,'centripetal');
 const vertices=[],faceNormals=[],faces=[],N=detail.face[1],R=detail.face[0],faceRings=[];
 for(let j=0;j<=R;j++){const t=j/R,v=profileCurve.getPoint(t),center=centerCurve.getPoint(t);faceRings.push({y:v.y*p.faceHeight,rx:v.x*p.faceWidth,rz:v.z,cz:center.x});for(let i=0;i<N;i++){const a=i/N*Math.PI*2,c=Math.cos(a);let z=center.x+v.z*c;
 // Slightly flatten the lower face without pointing the chin out in profile.
 if(v.y<-.5&&c>0)z=.10+(z-.10)*p.jawDepth;
 vertices.push(v.x*Math.sin(a)*p.faceWidth,v.y*p.faceHeight,z);
 if(p.detail==='mobile'){const lo=Math.max(0,t-.0001),hi=Math.min(1,t+.0001),vl=profileCurve.getPoint(lo),vh=profileCurve.getPoint(hi),cl=centerCurve.getPoint(lo),ch=centerCurve.getPoint(hi);
 const dy=(vh.y-vl.y)*p.faceHeight,drx=(vh.x-vl.x)*p.faceWidth,drz=vh.z-vl.z,dcz=ch.x-cl.x;
 const normal=new T.Vector3(v.z*Math.sin(a)*dy,-v.z*Math.sin(a)*drx*Math.sin(a)-v.x*p.faceWidth*c*(dcz+drz*c),v.x*p.faceWidth*c*dy).normalize();
 faceNormals.push(normal.x,normal.y,normal.z);}}}
 for(let j=0;j<R;j++)for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N;faces.push(a,b,a+N,b,b+N,a+N);}
 for(let i=1;i<N-1;i++)faces.push(0,i+1,i,R*N,R*N+i,R*N+i+1);
 const faceGeometry=new T.BufferGeometry();faceGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));faceGeometry.setIndex(faces);if(p.detail==='mobile')faceGeometry.setAttribute('normal',new T.Float32BufferAttribute(faceNormals,3));else faceGeometry.computeVertexNormals();const face=mesh(faceGeometry,skin);
 for(const s of [-1,1]){
  const earGroup=new T.Group();root.add(earGroup);earGroup.position.set(s*.78*p.faceWidth,-.45*p.faceHeight,-.025);earGroup.rotation.z=s*-.17;
  ears.push(earGroup);
  ellipse([s*.04,0,0],[.205,.23,.135],skin,earGroup);ellipse([s*.045,.005,.105],[.115,.145,.034],innerEar,earGroup,null);ellipse([s*.037,-.034,.13],[.06,.09,.022],skin,earGroup,null);
  earGroup.scale.set(.92,.96,.92);
 }
 // Project eye/mouth patches onto the same profile as the skin: avoids the
 // original spherical eye silhouette that protruded in the side view.
 function surfaceZ(x,y){
  let a=faceRings[0],b=faceRings.at(-1);
  for(let i=1;i<faceRings.length;i++)if(y<=faceRings[i].y){a=faceRings[i-1];b=faceRings[i];break;}
  const t=T.MathUtils.clamp((y-a.y)/(b.y-a.y||1),0,1),rx=T.MathUtils.lerp(a.rx,b.rx,t),rz=T.MathUtils.lerp(a.rz,b.rz,t),cz=T.MathUtils.lerp(a.cz,b.cz,t);
  const z=cz+rz*Math.sqrt(Math.max(.005,1-(x/Math.max(.01,rx))**2));
  return y<-.5?.10+(z-.10)*p.jawDepth:z;
 }
 function patch(cx,cy,rx,ry,offset,m,bump=0,name='face-patch',eyeCenter=null){
  const [defaultRings,segments]=detail.patch,rings=p.detail==='mobile'?(name.includes('highlight')?1:name.includes('iris')||name.includes('pupil')?2:defaultRings):defaultRings,ps=[],ix=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
   const r=j/rings,a=i/segments*Math.PI*2,x=cx+rx*r*Math.cos(a),y=cy+ry*r*Math.sin(a);
   const dome=eyeCenter ? .042*Math.max(0,1-((x-eyeCenter[0])/.232)**2-((y-eyeCenter[1])/.244)**2):bump*(1-r*r);
   ps.push(x,y,surfaceZ(x,y)+offset+dome);
  }
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,c=a+segments+1;ix.push(a,c,a+1,a+1,c,c+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setIndex(ix);g.computeVertexNormals();const result=mesh(g,m);result.name=name;return result;
 }
 for(const side of [-1,1]){
  const x=side*.323,y=-.215;
  patch(x,y,.232,.244,.011,pupil,0,'eye-rim',[x,y]);
  patch(x,y-.006,.219,.229,.016,white,0,'eye-white',[x,y]);
  patch(x-side*.007,y-.009,.126,.165,.021,iris,0,'eye-iris',[x,y]);
  patch(x-side*.009,y-.009,.073,.116,.027,pupil,0,'eye-pupil',[x,y]);
  patch(x-.043,y+.065,.030,.037,.035,white,0,'eye-highlight-large',[x,y]);
  patch(x+.041,y-.068,.012,.015,.035,white,0,'eye-highlight-small',[x,y]);
  const browPoints=[[side*.13,.138],[side*.27,.186],[side*.43,.17],[side*.54,.107]].map(([x,y])=>[x,y,surfaceZ(x,y)+.026]);
  line(browPoints,.032,hair);
 }
 ellipse([0,-.435*p.faceHeight,surfaceZ(0,-.435)+.029],[.090,.066,.068],skin);
 ellipse([-.045,-.468*p.faceHeight,surfaceZ(-.045,-.468)+.075],[.016,.009,.009],innerEar);
 ellipse([.045,-.468*p.faceHeight,surfaceZ(.045,-.468)+.075],[.016,.009,.009],innerEar);
 // A quiet smile stays readable at full-body scale without expression meshes.
 line([[-.195,-.586],[-.095,-.625],[.055,-.631],[.197,-.586]].map(([x,y])=>[x,y*p.faceHeight,surfaceZ(x,y*p.faceHeight)+.016]),.012,innerEar);
 // Continuous scalp under every lock. The front has a high hairline while the
 // rear extends to the nape; no root or tip can reveal an empty scalp seam.
 const scalpPoint=(a,t,offset=0)=>new T.Vector3((.92*p.hairWidth+offset)*Math.sin(t)*Math.sin(a),.12+(1.05*p.crownHeight+offset)*Math.cos(t),-.10+(.88*p.hairDepth+offset)*Math.sin(t)*Math.cos(a));
 function maxTheta(a){const c=Math.cos(a);return c>=0?1.31+.66*(1-c):1.97+.61*p.napeLength*(-c);}
 const capV=[],capNormals=[],capF=[],capR=detail.cap[0],capN=detail.cap[1];
 for(let j=0;j<=capR;j++)for(let i=0;i<=capN;i++){const a=i/capN*Math.PI*2,v=scalpPoint(a,.003+(maxTheta(a)-.003)*j/capR);capV.push(v.x,v.y,v.z);if(p.detail==='mobile'){const normal=new T.Vector3(v.x/(.92*p.hairWidth)**2,(v.y-.12)/(1.05*p.crownHeight)**2,(v.z+.10)/(.88*p.hairDepth)**2).normalize();capNormals.push(normal.x,normal.y,normal.z);}}
 for(let j=0;j<capR;j++)for(let i=0;i<capN;i++){const a=j*(capN+1)+i,b=a+1,c=a+capN+1;capF.push(a,c,b,b,c,c+1);}
 const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(capV,3));cap.setIndex(capF);if(p.detail==='mobile')cap.setAttribute('normal',new T.Float32BufferAttribute(capNormals,3));else cap.computeVertexNormals();mesh(cap,hair,root,hairEdge);
 let lockNumber=0;
 function lock(points,width){
  const path=new T.CatmullRomCurve3(points.map(v=>v.isVector3?v:new T.Vector3(...v)),false,'centripetal');const steps=detail.lock[0],sides=detail.lock[1],ps=[],ns=[],ix=[];
  for(let j=0;j<=steps;j++){const t=j/steps,point=path.getPoint(t),tangent=path.getTangent(t);
   let normal=new T.Vector3(point.x/(.92*p.hairWidth)**2,(point.y-.12)/(1.05*p.crownHeight)**2,(point.z+.10)/(.88*p.hairDepth)**2).normalize();
   const side=new T.Vector3().crossVectors(normal,tangent).normalize();normal=new T.Vector3().crossVectors(tangent,side).normalize();
   const w=width*p.lockWidth*(.018+.98*Math.pow(Math.sin(Math.PI*(.12+.88*t)),.78));
   for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,depth=p.hair==='tubes'?.82:.38;const v=point.clone().addScaledVector(side,Math.cos(a)*w).addScaledVector(normal,Math.sin(a)*w*depth);ps.push(v.x,v.y,v.z);if(p.detail==='mobile'){const n=side.clone().multiplyScalar(Math.cos(a)).addScaledVector(normal,Math.sin(a)/depth).normalize();ns.push(n.x,n.y,n.z);}}}
  for(let j=0;j<steps;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides;ix.push(a,b,a+sides,b,b+sides,a+sides);}
  for(let k=1;k<sides-1;k++)ix.push(0,k+1,k,steps*sides,steps*sides+k,steps*sides+k+1);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setIndex(ix);if(p.detail==='mobile')g.setAttribute('normal',new T.Float32BufferAttribute(ns,3));else g.computeVertexNormals();mesh(g,hairShades[lockNumber++%hairShades.length],root,hairEdge);
 }
 // Layered lateral and rear locks follow the scalp tangents and overlap like
 // thick leaves. Their tips stay outside the cap and sweep rather than stand up.
 for(let row=0;row<4;row++){
  const theta=.46+row*.42,count=11+row*2;
  for(let i=0;i<count;i++){if(p.detail==='mobile'&&row>0&&row<3&&i%2===1)continue;const a=.66+(Math.PI*2-1.32)*(i+.2*(row%2))/(count-1);const startTheta=theta+p.strandJitter*Math.sin(i*2.7+row)*.13;const end=Math.min(startTheta+.60+p.strandJitter*Math.cos(i*1.9)*.12,maxTheta(a)+.035);
   if(theta>maxTheta(a)-.22)continue;
   const swing=(a<Math.PI?1:-1)*(.20+row*.015);
   lock([scalpPoint(a,startTheta,.005),scalpPoint(a+swing*.35,startTheta+.22,.073),scalpPoint(a+swing,end-.13,.075),scalpPoint(a+swing*1.15,end,.025)],.19+(row===0?.035:0));
  }
 }
 // Seven asymmetric forehead locks: broad at the root, pointed along the cheek.
 const bangs=[
  [[.34,.94,.48],[.11,.93,.71],[-.19,.64,.85],[-.44,.33,.82]],
  [[.11,.96,.49],[-.16,.88,.72],[-.45,.58,.80],[-.60,.26,.68]],
  [[-.16,.94,.40],[-.43,.83,.62],[-.68,.57,.65],[-.79,.25,.47]],
  [[-.38,.91,.24],[-.61,.77,.43],[-.84,.49,.44],[-.88,.12,.27]],
  [[.45,.92,.43],[.67,.77,.61],[.73,.50,.64],[.78,.20,.50]],
  [[.57,.86,.27],[.82,.67,.43],[.88,.31,.40],[.90,.07,.23]],
  [[.68,.76,.07],[.89,.45,.22],[.93,.02,.21],[.79,-.38,.13]]
 ];
 bangs.forEach((points,i)=>lock(points.map(([x,y,z])=>[x*p.hairWidth+(i<4?(1-p.fringeSweep)*.13:0),.12+(y-.12)*p.crownHeight,z*p.hairDepth]),i===0?.20:.185));
 // Horizontally swept crown wisps produce the small irregular upper silhouette.
 const crown=p.hairFlow==='swept'?[
  [[[.46,1.01,-.20],[.27,1.22,.02],[-.05,1.23,.27],[-.33,1.10,.45]],.15],
  [[[.12,1.10,-.42],[-.13,1.23,-.22],[-.39,1.22,.08],[-.59,1.09,.29]],.15],
  [[[-.20,1.02,-.11],[-.48,1.11,.12],[-.74,1.08,.24],[-.87,.97,.32]],.14],
  [[[.43,1.03,-.35],[.18,1.19,-.12],[-.19,1.22,.12],[-.54,1.10,.32]],.13],
  [[[.55,.99,-.47],[.23,1.15,-.27],[-.10,1.18,-.05],[-.39,1.07,.13]],.11]
 ]:[
  [[[.46,1.01,.15],[.27,1.23,.15],[-.05,1.27,.13],[-.33,1.26,.09]],.15],
  [[[.12,1.10,-.15],[-.13,1.23,-.18],[-.39,1.25,-.19],[-.59,1.21,-.23]],.15],
  [[[-.20,1.05,.10],[-.48,1.10,.15],[-.74,1.05,.13],[-.87,1.13,.06]],.14],
  [[[.30,1.02,-.10],[.48,1.15,-.19],[.46,1.30,-.24],[.32,1.34,-.27]],.13],
  [[[.50,.97,-.25],[.78,.98,-.29],[.94,.91,-.31],[1.01,.98,-.34]],.11]
 ];
 for(const [points,width] of crown)lock(points.map(([x,y,z])=>[x*p.hairWidth,.12+(y-.12)*p.crownHeight+(y>1.1?(p.spikeHeight-1)*.18:0),z*p.hairDepth]),width);
 // Batch every static head surface by material, baking local transforms. This
 // changes draw-call count but preserves triangles, smooth normals and shape.
 const groups=new Map(),sources=[];root.updateMatrixWorld(true);
 root.traverse(source=>{if(!source.isMesh)return;sources.push(source);const g=source.geometry,m=source.material;
  let batch=groups.get(m);if(!batch){batch={positions:[],normals:[],indices:[]};groups.set(m,batch);}
  const offset=batch.positions.length/3,normMatrix=new T.Matrix3().getNormalMatrix(source.matrixWorld),v=new T.Vector3(),n=new T.Vector3();
  for(let i=0;i<g.attributes.position.count;i++){
   v.fromBufferAttribute(g.attributes.position,i).applyMatrix4(source.matrixWorld);n.fromBufferAttribute(g.attributes.normal,i).applyMatrix3(normMatrix).normalize();
   batch.positions.push(v.x,v.y,v.z);batch.normals.push(n.x,n.y,n.z);
  }
  const indices=g.index?g.index.array:Array.from({length:g.attributes.position.count},(_,i)=>i);
  for(const index of indices)batch.indices.push(index+offset);
 });
 root.clear();
 for(const [material,batch] of groups){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(batch.positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(batch.normals,3));g.setIndex(batch.indices);const part=mesh(g,material);part.name='head-'+material.color.getHexString();}
 for(const source of sources)source.geometry.dispose();
 root.name='kid-head-r9-'+p.detail;root.userData.source='kid-head/model.mjs:targetModel + expression-model.mjs:surface projection';
 root.userData.detail=p.detail;root.userData.headParameters={...p};
 return {root,body};
}
export function buildHead({detail='mobile'}={}){
 if(!HEAD_DETAIL[detail])throw new Error('Unknown head detail '+detail);
 return targetModel({faceWidth:.99,faceHeight:1,jawDepth:1,hairWidth:1.07,hairDepth:1.10,crownHeight:.98,fringeSweep:1,lockWidth:1,spikeHeight:.90,napeLength:1,hair:'ribbons',hairFlow:'swept',detail}).root;
}

import * as T from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { transformGeometry, nameMorphs } from '../geometry-morphs.mjs';
import { installExpressions, EXPRESSION_IDS } from './expressions.mjs';

// Copied and adapted from kid-head/model.mjs (r9 geometry); original is read-only.
export const targetDefaults={faceWidth:1,faceHeight:1,jawDepth:1,hairWidth:1,hairDepth:1,crownHeight:1,fringeSweep:1,lockWidth:1,spikeHeight:1,napeLength:1,eyeInset:0,mouthInset:0,strandJitter:0,hair:'ribbons'};
export const HEAD_DETAIL = Object.freeze({
 dense: { sphere:[32,24], line:[32,10], face:[64,96], cap:[40,80], lock:[20,12], patch:[8,48] },
 balanced: { sphere:[16,10], line:[16,6], face:[24,40], cap:[16,40], lock:[8,6], patch:[4,24] },
 mobile: { sphere:[8,6], line:[10,6], face:[14,32], cap:[9,32], lock:[6,8], patch:[3,20] }
});
export function targetModel(parameters={}){
 const p={...targetDefaults,...parameters},root=new T.Group(),body=[],ears=[];
 const detail=HEAD_DETAIL[p.detail] || HEAD_DETAIL.mobile;
 // Standard glTF materials: shells and toon ramps are deliberately absent.
 const toon=c=>new T.MeshStandardMaterial({color:c,roughness:.70,metalness:0});
 const skin=toon('#f3ba92'),innerEar=toon('#cf805f'),white=toon('#fffaf4'),iris=toon('#9a643b'),pupil=toon('#251b17'),hair=toon('#593a29');
 skin.vertexColors=true;
 iris.vertexColors=true;
 white.roughness=.30;iris.roughness=.35;pupil.roughness=.35;skin.roughness=.60;
 const hairShades=['#60402d','#63422f','#5b3b29','#684633','#60402d'].map(toon);
 const brow=toon('#65432f');
 const skinEdge=null,hairEdge=null;
 function mesh(g,m,parent=root,edge=null){const o=new T.Mesh(g,m);parent.add(o);return o;}
 function ellipse(position,scale,m,parent=root,edge=null){const o=mesh(new T.SphereGeometry(1,...detail.sphere),m,parent);o.position.set(...position);o.scale.set(...scale);return o;}
 function line(points,r,m,parent=root,edge=null){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),detail.line[0],r,detail.line[1],false),m,parent);}
 // Rounded chin and broad cheeks. Cubic interpolation eliminates the old ring facets.
 const profile=[[-.89,.24,.26,.15],[-.84,.44,.37,.12],[-.72,.63,.47,.08],[-.52,.755,.55,.035],[-.25,.78,.61,-.025],[.12,.76,.66,-.045],[.45,.73,.65,-.05],[.74,.65,.59,-.07],[.96,.46,.44,-.08],[1.06,.02,.025,-.08]];
 const yMin=profile[0][0],yMax=profile.at(-1)[0];
 const profileCurve=new T.CatmullRomCurve3(profile.map(r=>new T.Vector3(r[1],r[0],r[2])),false,'centripetal');
 const centerCurve=new T.CatmullRomCurve3(profile.map(r=>new T.Vector3(r[3],r[0],0)),false,'centripetal');
 // Cheek volume is part of the face surface, rather than two visible spheres.
 function cheekVolume(x,y){return .042*Math.exp(-(((Math.abs(x)-.46)/.23)**2)-(((y+.51)/.20)**2));}
 function facePoint(t,a){const v=profileCurve.getPoint(t),center=centerCurve.getPoint(t),c=Math.cos(a),x=v.x*Math.sin(a)*p.faceWidth,y=v.y*p.faceHeight;let z=center.x+v.z*c;
  if(v.y<-.5&&c>0)z=.10+(z-.10)*p.jawDepth;
  z+=cheekVolume(x,y)*Math.max(0,c)**3;
  return new T.Vector3(x,y,z);
 }
 const vertices=[],faceNormals=[],faceColors=[],faces=[],N=detail.face[1],R=detail.face[0];
 const cheekTint=new T.Color('#f07e88'),cheekMultiplier=new T.Color(cheekTint.r/skin.color.r,cheekTint.g/skin.color.g,cheekTint.b/skin.color.b);
 for(let j=0;j<=R;j++)for(let i=0;i<N;i++){
  const t=j/R,a=i/N*Math.PI*2,v=facePoint(t,a),lo=Math.max(0,t-.0001),hi=Math.min(1,t+.0001);
  const da=facePoint(t,a+.0001).sub(facePoint(t,a-.0001)),dt=facePoint(hi,a).sub(facePoint(lo,a));
  const normal=da.cross(dt).normalize();vertices.push(v.x,v.y,v.z);faceNormals.push(normal.x,normal.y,normal.z);
  const blush=.88*Math.exp(-(((Math.abs(v.x)-.49)/.24)**2)-(((v.y+.51)/.19)**2))*Math.max(0,Math.cos(a));
  faceColors.push(T.MathUtils.lerp(1,cheekMultiplier.r,blush),T.MathUtils.lerp(1,cheekMultiplier.g,blush),T.MathUtils.lerp(1,cheekMultiplier.b,blush));
 }
 for(let j=0;j<R;j++)for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N;faces.push(a,b,a+N,b,b+N,a+N);}
 for(let i=1;i<N-1;i++)faces.push(0,i+1,i,R*N,R*N+i,R*N+i+1);
 const faceGeometry=new T.BufferGeometry();faceGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));faceGeometry.setAttribute('color',new T.Float32BufferAttribute(faceColors,3));faceGeometry.setIndex(faces);faceGeometry.setAttribute('normal',new T.Float32BufferAttribute(faceNormals,3));const face=mesh(faceGeometry,skin);
 for(const s of [-1,1]){
  const earGroup=new T.Group();root.add(earGroup);earGroup.position.set(s*.78*p.faceWidth,-.45*p.faceHeight,-.025);earGroup.rotation.z=s*-.17;
  ears.push(earGroup);
  ellipse([s*.04,0,0],[.205,.23,.135],skin,earGroup);ellipse([s*.045,.005,.105],[.115,.145,.034],innerEar,earGroup,null);ellipse([s*.037,-.034,.13],[.06,.09,.022],skin,earGroup,null);
  earGroup.scale.set(.92,.96,.92);
 }
 // Project eye/mouth patches onto the same profile as the skin: avoids the
 // original spherical eye silhouette that protruded in the side view.
 function surfaceZ(x,y){
  let lo=0,hi=1;for(let i=0;i<16;i++){const mid=(lo+hi)/2;if(profileCurve.getPoint(mid).y*p.faceHeight<y)lo=mid;else hi=mid;}
  const t=(lo+hi)/2,v=profileCurve.getPoint(t),a=Math.asin(T.MathUtils.clamp(x/Math.max(.01,v.x*p.faceWidth),-.997,.997));
  return facePoint(t,a).z;
 }
 function patch(cx,cy,rx,ry,offset,m,bump=0,name='face-patch',eyeCenter=null){
  const [defaultRings,segments]=detail.patch,rings=p.detail==='mobile'?(name.includes('highlight')?1:name.includes('iris')||name.includes('pupil')?2:defaultRings):defaultRings,ps=[],colors=[],ix=[];
  // One shared center forms a fan. The former center ring duplicated the same
  // point for every segment and generated a zero-area triangle beside each
  // visible fan triangle. The surface and silhouette remain the same.
  const point=(r,a)=>{
   const x=cx+rx*r*Math.cos(a),y=cy+ry*r*Math.sin(a);
   const dome=eyeCenter ? .047*Math.max(0,1-((x-eyeCenter[0])/.247)**2-((y-eyeCenter[1])/.263)**2):bump*(1-r*r);
   ps.push(x,y,surfaceZ(x,y)+offset+dome);
   const tint=name.includes('iris')?1-.38*r*r:1;colors.push(tint,tint,tint);
  };
  point(0,0);
  for(let j=1;j<=rings;j++)for(let i=0;i<segments;i++)point(j/rings,i/segments*Math.PI*2);
  for(let i=0;i<segments;i++)ix.push(0,1+i,1+(i+1)%segments);
  for(let j=0;j<rings-1;j++)for(let i=0;i<segments;i++){
   const a=1+j*segments+i,b=1+j*segments+(i+1)%segments,c=a+segments,d=b+segments;ix.push(a,c,b,b,c,d);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));if(m.vertexColors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();const result=mesh(g,m);result.name=name;return result;
 }
 installExpressions({root,face,surfaceZ,skin,innerEar,detail,p});
 // Continuous scalp under every lock. The front has a high hairline while the
 // rear extends to the nape; no root or tip can reveal an empty scalp seam.
 const scalpPoint=(a,t,offset=0)=>new T.Vector3((.92*p.hairWidth+offset)*Math.sin(t)*Math.sin(a),.12+(1.05*p.crownHeight+offset)*Math.cos(t),-.10+(.88*p.hairDepth+offset)*Math.sin(t)*Math.cos(a));
 function maxTheta(a){const c=Math.cos(a);return c>=0?1.31+.66*(1-c):1.97+.61*p.napeLength*(-c);}
 const capV=[],capNormals=[],capF=[],capR=detail.cap[0],capN=detail.cap[1];
 for(let j=0;j<=capR;j++)for(let i=0;i<=capN;i++){const a=i/capN*Math.PI*2,v=scalpPoint(a,.003+(maxTheta(a)-.003)*j/capR);capV.push(v.x,v.y,v.z);if(p.detail==='mobile'){const normal=new T.Vector3(v.x/(.92*p.hairWidth)**2,(v.y-.12)/(1.05*p.crownHeight)**2,(v.z+.10)/(.88*p.hairDepth)**2).normalize();capNormals.push(normal.x,normal.y,normal.z);}}
 for(let j=0;j<capR;j++)for(let i=0;i<capN;i++){const a=j*(capN+1)+i,b=a+1,c=a+capN+1;capF.push(a,c,b,b,c,c+1);}
 const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(capV,3));cap.setIndex(capF);if(p.detail==='mobile')cap.setAttribute('normal',new T.Float32BufferAttribute(capNormals,3));else cap.computeVertexNormals();mesh(cap,hair,root,hairEdge);
 const capPlanes=[];
 if(p.detail==='mobile')for(let i=0;i<capF.length;i+=3){
  const a=new T.Vector3().fromArray(capV,capF[i]*3),b=new T.Vector3().fromArray(capV,capF[i+1]*3),c=new T.Vector3().fromArray(capV,capF[i+2]*3),n=b.sub(a).cross(c.sub(a)).normalize();
  capPlanes.push([n.x,n.y,n.z,n.dot(a)-.002]);
 }
 let lockNumber=0,buriedTriangles=0;
 // Authored tones break the old five-lock color cycle without changing flow.
 const lockTones=[1,3,0,2,1,4,2,0,3,1,2,4,0,1,3,2,0,4,1,3,0,2,3,1,4,0,2,1,4,3,0,1,2,0,3,4,1,2,3,0,1];
 // Every discarded vertex is inside all outward planes of the actual coarse
 // cap, with a .002 margin, and away from its open hairline by .10 radians.
 // Their triangle is therefore inside the same convex region. The angular
 // guard keeps ear/hairline edges, including the sides of the descending locks.
 const buriedInCap=v=>{
  if(p.detail!=='mobile')return false;
  const q=new T.Vector3(v.x/(.92*p.hairWidth),(v.y-.12)/(1.05*p.crownHeight),(v.z+.10)/(.88*p.hairDepth)),r=q.length();
  return r<1&&Math.acos(T.MathUtils.clamp(q.y/r,-1,1))<maxTheta(Math.atan2(q.x,q.z))-.10&&capPlanes.every(([x,y,z,d])=>x*v.x+y*v.y+z*v.z<d);
 };
 function lock(points,width,interior=false){
  const path=new T.CatmullRomCurve3(points.map(v=>v.isVector3?v:new T.Vector3(...v)),false,'centripetal');const steps=p.detail==='mobile'?(interior?7:5):detail.lock[0],sides=detail.lock[1],ps=[],ns=[],ix=[],buried=[];
  // A fuller elliptical section and gradual taper make rounded locks with a
  // small pointed end. Eight sides in mobile retain that round silhouette.
  const lockRadius=t=>{const taper=T.MathUtils.smoothstep(t,.38,1);return width*p.lockWidth*(.55+.45*Math.sin(Math.PI*t))*(1-.965*taper);};
  for(let j=0;j<=steps;j++){const t=j/steps,point=path.getPoint(t),tangent=path.getTangent(t);
   let normal=new T.Vector3(point.x/(.92*p.hairWidth)**2,(point.y-.12)/(1.05*p.crownHeight)**2,(point.z+.10)/(.88*p.hairDepth)**2).normalize();
   const side=new T.Vector3().crossVectors(normal,tangent).normalize();normal=new T.Vector3().crossVectors(tangent,side).normalize();
   const w=lockRadius(t),lo=Math.max(0,t-.0001),hi=Math.min(1,t+.0001),distance=path.getPoint(hi).distanceTo(path.getPoint(lo));
   const taper=(lockRadius(hi)-lockRadius(lo))/Math.max(.000001,distance);
   for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,depth=p.hair==='tubes'?.82:.56;const v=point.clone().addScaledVector(side,Math.cos(a)*w).addScaledVector(normal,Math.sin(a)*w*depth);ps.push(v.x,v.y,v.z);buried.push(buriedInCap(v));if(p.detail==='mobile'){const n=side.clone().multiplyScalar(Math.cos(a)).addScaledVector(normal,Math.sin(a)/depth).addScaledVector(tangent,-taper).normalize();ns.push(n.x,n.y,n.z);}}}
  const triangle=(a,b,c)=>{if(p.detail==='mobile'&&buried[a]&&buried[b]&&buried[c]){buriedTriangles++;return;}ix.push(a,b,c);};
  for(let j=0;j<steps;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides;triangle(a,b,a+sides);triangle(b,b+sides,a+sides);}
  for(let k=1;k<sides-1;k++){triangle(0,k+1,k);triangle(steps*sides,steps*sides+k,steps*sides+k+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setIndex(ix);if(p.detail==='mobile')g.setAttribute('normal',new T.Float32BufferAttribute(ns,3));else g.computeVertexNormals();mesh(g,hairShades[lockTones[lockNumber++]??1],root,hairEdge);
 }
 // The rear is authored as one swept field, with long overlapping locks.
 // Roots and ends are explicitly distributed over the scalp, not copied rows.
 // All azimuths turn clockwise and descend; varied arc lengths avoid scales.
 const rearFlow=[
  // azimuth, root theta, end theta, sweep, half-width, surface lift
  [.76,.31,1.48,.32,.194,.030],[1.35,.15,1.40,.34,.209,.024],
  [2.03,.25,1.64,.29,.220,.032],[2.62,.12,1.56,.32,.215,.029],
  [3.28,.20,1.73,.27,.208,.031],[3.96,.30,1.58,.31,.198,.025],
  [4.58,.18,1.39,.28,.204,.028],[5.18,.35,1.42,.23,.190,.022],
  [.90,.93,1.91,.25,.181,.034],[1.56,.74,2.01,.27,.206,.039],
  [2.24,.98,2.22,.24,.218,.034],[2.91,.76,2.19,.24,.222,.043],
  [3.54,.97,2.34,.28,.210,.030],[4.23,.81,2.05,.24,.204,.034],
  [4.91,.96,1.91,.21,.178,.029],[5.42,.70,1.50,.15,.169,.025],
  [1.10,1.47,2.16,.18,.160,.018],[1.84,1.55,2.36,.17,.188,.024],
  [2.49,1.61,2.56,.20,.179,.023],[3.20,1.42,2.60,.19,.190,.028],
  [3.89,1.63,2.45,.20,.173,.024],[4.52,1.43,2.14,.19,.181,.019],
  [5.06,1.48,1.96,.16,.140,.017],
  [2.16,2.05,2.55,.12,.140,.012],[2.83,2.10,2.64,.16,.139,.014],
  [3.55,2.02,2.61,.13,.145,.013],[4.13,1.96,2.45,.13,.135,.012],
 ];
 for(const [a,start,end,sweep,width,lift] of rearFlow){
  const finish=Math.min(end,maxTheta(a+sweep)-.018),span=finish-start;
  lock([scalpPoint(a,start,-.055),
   scalpPoint(a+sweep*.27,start+span*.32,lift),
   scalpPoint(a+sweep*.73,start+span*.73,lift*.80),
   scalpPoint(a+sweep,finish,.008)],width,true);
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
 // Side locks descend in front of the ear on both sides, as in the profile
 // reference. Their narrow tips leave the lower ear and cheek unobscured.
 for(const side of [-1,1])lock([[side*.73,.40,.36],[side*.86,.13,.36],[side*.85,-.20,.28],[side*.77,-.44,.18]].map(([x,y,z])=>[x*p.hairWidth,y*p.crownHeight,z*p.hairDepth]),.125);
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
 // Keep animated face separate from static hair: the hair needs no morph
 // texture fetches, while every facial batch retains six standard GLB targets.
 const groups=new Map(),sources=[];root.updateMatrixWorld(true);
 root.traverse(source=>{if(!source.isMesh)return;sources.push(source);
  const animated=!!source.geometry.morphAttributes.position?.length;
  const key=source.material.uuid+':'+animated;
  if(!groups.has(key))groups.set(key,{material:source.material,animated,geometries:[]});
  const g=transformGeometry(source.geometry.clone(),source.matrixWorld);
  if(!g.attributes.color)g.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
  g.deleteAttribute('uv');groups.get(key).geometries.push(g);
 });
 root.clear();
 for(const batch of groups.values()){
  const g=mergeGeometries(batch.geometries,false);batch.geometries.forEach(x=>x.dispose());
  if(batch.animated)nameMorphs(g,EXPRESSION_IDS);
  if(!batch.material.vertexColors)g.deleteAttribute('color');
  const part=mesh(g,batch.material);part.name='head-'+batch.material.color.getHexString()+(batch.animated?'-expressions':'');
 }
 for(const source of sources)source.geometry.dispose();
 root.name='kid-head-r9-'+p.detail;root.userData.source='kid-head/model.mjs:targetModel + expression-model.mjs:surface projection';
 root.userData.detail=p.detail;root.userData.headParameters={...p};
 root.userData.stats={triangles:root.children.reduce((sum,o)=>sum+(o.geometry?.index?.count||0)/3,0),locks:lockNumber,buriedTriangles};
 return {root,body};
}
export function buildHead({detail='mobile'}={}){
 if(!HEAD_DETAIL[detail])throw new Error('Unknown head detail '+detail);
 return targetModel({faceWidth:.99,faceHeight:1,jawDepth:1,hairWidth:1.07,hairDepth:1.10,crownHeight:.98,fringeSweep:1,lockWidth:1,spikeHeight:.90,napeLength:1,hair:'ribbons',hairFlow:'swept',detail}).root;
}

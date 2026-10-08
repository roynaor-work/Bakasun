import * as T from './three.module.js';

// The target model is kept separate so r1–r6 remain reproducible.
export const targetDefaults={faceWidth:1,faceHeight:1,jawDepth:1,hairWidth:1,hairDepth:1,crownHeight:1,fringeSweep:1,lockWidth:1,spikeHeight:1,napeLength:1,eyeInset:0,mouthInset:0,strandJitter:0,hair:'ribbons'};
export function targetModel(parameters={}){
 const p={...targetDefaults,...parameters},root=new T.Group(),body=[];
 const ramp=new T.DataTexture(new Uint8Array([90,160,218,255]),4,1,T.RedFormat);ramp.needsUpdate=true;ramp.minFilter=ramp.magFilter=T.NearestFilter;
 const toon=c=>new T.MeshToonMaterial({color:c,gradientMap:ramp});
 const skin=toon('#efad75'),innerEar=toon('#cd784d'),white=toon('#fffaf0'),iris=toon('#75411d'),pupil=toon('#170f0a'),shirt=toon('#164bc8'),hair=toon('#573723');
 const hairShades=['#62402b','#694631','#5b3926','#71503a','#60402c'].map(toon);
 const skinEdge=new T.MeshBasicMaterial({color:'#704732',side:T.BackSide});
 const hairEdge=new T.MeshBasicMaterial({color:'#352318',side:T.BackSide});
 function mesh(g,m,parent=root,edge=skinEdge){const o=new T.Mesh(g,m);parent.add(o);if(edge){const shell=new T.Mesh(g,edge);shell.scale.setScalar(edge===hairEdge?1.009:1.006);o.add(shell);}return o;}
 function ellipse(position,scale,m,parent=root,edge=skinEdge){const o=mesh(new T.SphereGeometry(1,56,40),m,parent,edge);o.position.set(...position);o.scale.set(...scale);return o;}
 function line(points,r,m,parent=root,edge=null){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),32,r,10,false),m,parent,edge);}
 // Rounded chin and broad cheeks. Cubic interpolation eliminates the old ring facets.
 const profile=[[-.89,.24,.26,.15],[-.84,.44,.37,.12],[-.72,.60,.45,.08],[-.52,.72,.52,.035],[-.25,.77,.61,-.025],[.12,.76,.66,-.045],[.45,.73,.65,-.05],[.74,.65,.59,-.07],[.96,.46,.44,-.08],[1.06,.02,.025,-.08]];
 const yMin=profile[0][0],yMax=profile.at(-1)[0];
 const profileCurve=new T.CatmullRomCurve3(profile.map(r=>new T.Vector3(r[1],r[0],r[2])),false,'centripetal');
 const centerCurve=new T.CatmullRomCurve3(profile.map(r=>new T.Vector3(r[3],r[0],0)),false,'centripetal');
 const vertices=[],faces=[],N=112,R=76;
 for(let j=0;j<=R;j++){const t=j/R,v=profileCurve.getPoint(t),center=centerCurve.getPoint(t);for(let i=0;i<N;i++){const a=i/N*Math.PI*2,c=Math.cos(a);let z=center.x+v.z*c;
 // Slightly flatten the lower face without pointing the chin out in profile.
 if(v.y<-.5&&c>0)z=.10+(z-.10)*p.jawDepth;
 vertices.push(v.x*Math.sin(a)*p.faceWidth,v.y*p.faceHeight,z);}}
 for(let j=0;j<R;j++)for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N;faces.push(a,b,a+N,b,b+N,a+N);}
 for(let i=1;i<N-1;i++)faces.push(0,i+1,i,R*N,R*N+i,R*N+i+1);
 const faceGeometry=new T.BufferGeometry();faceGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));faceGeometry.setIndex(faces);faceGeometry.computeVertexNormals();mesh(faceGeometry,skin);
 body.push(ellipse([0,-1.1,-.075],[.225,.35,.23],skin));
 body.push(ellipse([0,-1.55,-.08],[.89,.29,.43],shirt));
 // A visible collar fixes the scale of the head without introducing a full torso.
 body.push(line([[-.31,-1.32,.32],[0,-1.47,.43],[.31,-1.32,.32]],.045,white));
 for(const s of [-1,1]){
  const earGroup=new T.Group();root.add(earGroup);earGroup.position.set(s*.78*p.faceWidth,-.45*p.faceHeight,-.025);earGroup.rotation.z=s*-.17;
  ellipse([s*.04,0,0],[.205,.23,.135],skin,earGroup);ellipse([s*.045,.005,.105],[.115,.145,.034],innerEar,earGroup,null);ellipse([s*.037,-.034,.13],[.06,.09,.022],skin,earGroup,null);
  const eye=new T.Group();root.add(eye);eye.position.set(s*.335*p.faceWidth,-.23*p.faceHeight,.575-p.eyeInset);eye.rotation.y=s*.21;
  ellipse([0,0,0],[.226,.249,.078],pupil,eye,null);ellipse([0,-.01,.014],[.208,.228,.075],white,eye,null);
  ellipse([-s*.012,-.014,.081],[.122,.164,.029],iris,eye,null);ellipse([-s*.014,-.014,.108],[.071,.116,.018],pupil,eye,null);
  ellipse([-.042,.056,.125],[.037,.047,.01],white,eye,null);ellipse([.041,-.057,.126],[.014,.017,.008],white,eye,null);
  line([[s*.13,.115,.649],[s*.27,.16,.649],[s*.43,.147,.61],[s*.54,.083,.565]],.038,hair,root,null);
 }
 ellipse([0,-.435*p.faceHeight,.654],[.095,.073,.105],skin,root,null);
 ellipse([-.05,-.467*p.faceHeight,.690],[.021,.012,.014],innerEar,root,null);ellipse([.05,-.467*p.faceHeight,.690],[.021,.012,.014],innerEar,root,null);
 line([[-.185,-.591*p.faceHeight,.57-p.mouthInset],[-.08,-.624*p.faceHeight,.605-p.mouthInset],[.045,-.627*p.faceHeight,.609-p.mouthInset],[.19,-.588*p.faceHeight,.57-p.mouthInset]],.012,innerEar);
 // Continuous scalp under every lock. The front has a high hairline while the
 // rear extends to the nape; no root or tip can reveal an empty scalp seam.
 const scalpPoint=(a,t,offset=0)=>new T.Vector3((.92*p.hairWidth+offset)*Math.sin(t)*Math.sin(a),.12+(1.05*p.crownHeight+offset)*Math.cos(t),-.10+(.88*p.hairDepth+offset)*Math.sin(t)*Math.cos(a));
 function maxTheta(a){const c=Math.cos(a);return c>=0?1.31+.66*(1-c):1.97+.61*p.napeLength*(-c);}
 const capV=[],capF=[],capR=52,capN=112;
 for(let j=0;j<=capR;j++)for(let i=0;i<=capN;i++){const a=i/capN*Math.PI*2,v=scalpPoint(a,.003+(maxTheta(a)-.003)*j/capR);capV.push(v.x,v.y,v.z);}
 for(let j=0;j<capR;j++)for(let i=0;i<capN;i++){const a=j*(capN+1)+i,b=a+1,c=a+capN+1;capF.push(a,c,b,b,c,c+1);}
 const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(capV,3));cap.setIndex(capF);cap.computeVertexNormals();mesh(cap,hair,root,hairEdge);
 let lockNumber=0;
 function lock(points,width){
  const path=new T.CatmullRomCurve3(points.map(v=>v.isVector3?v:new T.Vector3(...v)),false,'centripetal');const steps=28,sides=p.hair==='tubes'?12:18,ps=[],ix=[];
  for(let j=0;j<=steps;j++){const t=j/steps,point=path.getPoint(t),tangent=path.getTangent(t);
   let normal=new T.Vector3(point.x/(.92*p.hairWidth)**2,(point.y-.12)/(1.05*p.crownHeight)**2,(point.z+.10)/(.88*p.hairDepth)**2).normalize();
   const side=new T.Vector3().crossVectors(normal,tangent).normalize();normal=new T.Vector3().crossVectors(tangent,side).normalize();
   const w=width*p.lockWidth*(.018+.98*Math.pow(Math.sin(Math.PI*(.12+.88*t)),.78));
   for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,depth=p.hair==='tubes'?.82:.38;const v=point.clone().addScaledVector(side,Math.cos(a)*w).addScaledVector(normal,Math.sin(a)*w*depth);ps.push(v.x,v.y,v.z);}}
  for(let j=0;j<steps;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides;ix.push(a,b,a+sides,b,b+sides,a+sides);}
  for(let k=1;k<sides-1;k++)ix.push(0,k+1,k,steps*sides,steps*sides+k,steps*sides+k+1);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setIndex(ix);g.computeVertexNormals();mesh(g,hairShades[lockNumber++%hairShades.length],root,hairEdge);
 }
 // Layered lateral and rear locks follow the scalp tangents and overlap like
 // thick leaves. Their tips stay outside the cap and sweep rather than stand up.
 for(let row=0;row<4;row++){
  const theta=.46+row*.42,count=11+row*2;
  for(let i=0;i<count;i++){const a=.66+(Math.PI*2-1.32)*(i+.2*(row%2))/(count-1);const startTheta=theta+p.strandJitter*Math.sin(i*2.7+row)*.13;const end=Math.min(startTheta+.60+p.strandJitter*Math.cos(i*1.9)*.12,maxTheta(a)+.035);
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
 for(const [points,width] of [
  [[[.46,1.01,.15],[.27,1.23,.15],[-.05,1.27,.13],[-.33,1.26,.09]],.15],
  [[[.12,1.10,-.15],[-.13,1.23,-.18],[-.39,1.25,-.19],[-.59,1.21,-.23]],.15],
  [[[-.20,1.05,.10],[-.48,1.10,.15],[-.74,1.05,.13],[-.87,1.13,.06]],.14],
  [[[.30,1.02,-.10],[.48,1.15,-.19],[.46,1.30,-.24],[.32,1.34,-.27]],.13],
  [[[.50,.97,-.25],[.78,.98,-.29],[.94,.91,-.31],[1.01,.98,-.34]],.11]
 ])lock(points.map(([x,y,z])=>[x*p.hairWidth,.12+(y-.12)*p.crownHeight+(y>1.1?(p.spikeHeight-1)*.18:0),z*p.hairDepth]),width);
 root.position.y=.25;return {root,body};
}

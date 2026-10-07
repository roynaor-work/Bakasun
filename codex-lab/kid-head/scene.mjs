import * as T from './three.module.js';
const rounds=await (await fetch('./rounds.json')).json();
const query=new URLSearchParams(location.search);
const scene=new T.Scene(); scene.background=new T.Color('#f1eee7');
const camera=new T.OrthographicCamera(-2.25,2.25,2.25,-2.25,0.1,100);
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
scene.add(new T.HemisphereLight(0xffffff,0x877f95,2.0));
const key=new T.DirectionalLight(0xffeed8,3);key.position.set(-3,6,5);scene.add(key);
const fill=new T.DirectionalLight(0xc8d9ff,1);fill.position.set(4,2,-3);scene.add(fill);
const gradient=new T.DataTexture(new Uint8Array([65,140,220,255]),4,1,T.RedFormat);gradient.needsUpdate=true;gradient.minFilter=gradient.magFilter=T.NearestFilter;
const mat=c=>new T.MeshToonMaterial({color:c,gradientMap:gradient});
const skin=mat('#f3b87f'),ear=mat('#de936d'),hair=mat('#63402b'),hairHi=mat('#785035'),white=mat('#fff9e9'),iris=mat('#46877c'),black=mat('#25222d'),shirt=mat('#50999a');
let root; let body=[]; let azimuth=0,elevation=0.08,zoom=1;
function mesh(g,m,parent=root,outline=true){const o=new T.Mesh(g,m);parent.add(o);if(outline){const shell=new T.Mesh(g,new T.MeshBasicMaterial({color:0x302630,side:T.BackSide}));shell.scale.setScalar(1.018);o.add(shell);}return o;}
function ellipsoid(pos,scale,m,parent=root){const o=mesh(new T.SphereGeometry(1,48,32),m,parent);o.position.set(...pos);o.scale.set(...scale);return o;}
function curve(points,r,m){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),36,r,8,false),m);}
function build(p){if(root){scene.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose();});}root=new T.Group();scene.add(root);body=[];
 // Continuous ring loft: chin -> jaw -> cheek -> temple -> cranium.
 const rings=[[-1.05*p.jaw,.16,.23,.18],[-.91*p.jaw,.39,.35,.11],[-.65*p.jaw,.58,.48,.02],[-.30,.74,.61,0],[.05,.79,.68,0],[.40,.76,.69,-.015],[.75,.68,.62,-.02],[.99,.49,.48,-.02],[1.13,.07,.09,-.02]];
 const positions=[],indices=[],N=96;
 for(const [y,w,d,z] of rings)for(let i=0;i<N;i++){const a=i/N*Math.PI*2;positions.push(Math.sin(a)*w*p.width,y,Math.cos(a)*d+z);}
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<N;i++){let a=j*N+i,b=j*N+(i+1)%N,c=a+N,d=b+N;indices.push(a,b,c,b,d,c);}
 indices.push(...Array.from({length:N-2},(_,i)=>[0,i+2,i+1]).flat());
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,skin);
 body.push(ellipsoid([0,-1.49,.0],[.28,.53,.27],skin),ellipsoid([0,-1.96,-.08],[1.04,.42,.45],shirt));
 for(const sign of [-1,1]){ellipsoid([sign*.76,-.15,0],[.19,.31,.14],skin);ellipsoid([sign*.83,-.15,.105],[.09,.19,.045],ear);
 const eye=new T.Group();root.add(eye);eye.position.set(sign*.32,.04,.605);eye.rotation.y=sign*.25;
 ellipsoid([0,0,0],[.245,.30,.095],white,eye);ellipsoid([-sign*.028,-.015,.084],[.12,.17,.035],iris,eye);ellipsoid([-sign*.028,-.015,.112],[.061,.113,.02],black,eye);ellipsoid([-.052,.062,.13],[.036,.047,.012],white,eye);
 curve([[sign*.12,.44,.64],[sign*.32,.48,.64],[sign*.52,.40,.58]],.028,hair);
 }
 ellipsoid([0,-.29,.68],[.105,.145,.14],skin);curve([[-.19,-.62,.50],[0,-.66,.55],[.18,-.62,.50]],.017,black);
 // Scalp shell with a latitude-dependent hairline; back and ear volume are continuous.
 const hp=[],hi=[],rows=32,cols=96;
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){let a=i/cols*Math.PI*2;let front=(Math.cos(a)+1)/2;let maxTheta=2.12-.88*front;let th=.015+j/rows*maxTheta;hp.push(.86*Math.sin(th)*Math.sin(a),.26+1.04*p.crown*Math.cos(th),-.055+.78*Math.sin(th)*Math.cos(a));}
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){let a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;hi.push(a,c,b,b,c,d);}
 const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(hp,3));cap.setIndex(hi);cap.computeVertexNormals();mesh(cap,hair);
 function lock(points,width){const path=new T.CatmullRomCurve3(points.map(q=>new T.Vector3(...q)));
 if(p.hair==='tubes'){const geo=new T.TubeGeometry(path,32,width,10,false);const v=geo.attributes.position;for(let i=0;i<v.count;i++){let t=Math.floor(i/11)/32,center=path.getPoint(t);let taper=.10+.90*Math.pow(1-t,.5);v.setXYZ(i,center.x+(v.getX(i)-center.x)*taper,center.y+(v.getY(i)-center.y)*taper,center.z+(v.getZ(i)-center.z)*taper);}geo.computeVertexNormals();mesh(geo,hairHi);return;}
 // Closed lenticular ribbon: smooth broad middle, tapered end, roots embedded in cap.
 const ps=[],ix=[],steps=32,sides=12;
 for(let j=0;j<=steps;j++){let t=j/steps,pt=path.getPoint(t),tangent=path.getTangent(t);let side=new T.Vector3(0,0,1).cross(tangent).normalize();if(side.length()<.1)side.set(1,0,0);let normal=new T.Vector3().crossVectors(tangent,side).normalize();let w=width*(.025+.975*Math.pow(1-t,.65));for(let k=0;k<sides;k++){let a=k/sides*Math.PI*2;let v=pt.clone().addScaledVector(side,Math.cos(a)*w).addScaledVector(normal,Math.sin(a)*w*.33);ps.push(v.x,v.y,v.z);}}
 for(let j=0;j<steps;j++)for(let k=0;k<sides;k++){let a=j*sides+k,b=j*sides+(k+1)%sides;ix.push(a,b,a+sides,b,b+sides,a+sides);}for(let k=1;k<sides-1;k++)ix.push(0,k+1,k,steps*sides,steps*sides+k,steps*sides+k+1);
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(ps,3));geo.setIndex(ix);geo.computeVertexNormals();mesh(geo,hairHi);
 }
 for(let i=0;i<7;i++){let x=-.66+i*.20;lock([[x*.75,1.04,.40],[x, .89,.62],[x+.20,.56,.72],[x+.27,.26+p.fringe+(i*.025),.69]],.15);}
 for(let i=0;i<7;i++){let x=-.68+i*.22;lock([[x*.7,1.09,-.06],[x,1.27*p.crown,-.04],[x-.15,1.43*p.crown+(i%2)*.09,-.07]],.16);}
 for(let sign of [-1,1])for(let i=0;i<3;i++)lock([[sign*.70,.72,-.28-i*.10],[sign*.86,.24,-.30-i*.13],[sign*.76,-.44,-.34-i*.15]],.15);
 root.position.y=.25;
}
function render(){camera.position.set(Math.sin(azimuth)*8,elevation*8,Math.cos(azimuth)*8);camera.lookAt(0,.13,0);let aspect=innerWidth/innerHeight;camera.left=-2.25*aspect/zoom;camera.right=2.25*aspect/zoom;camera.top=2.25/zoom;camera.bottom=-2.25/zoom;camera.updateProjectionMatrix();renderer.render(scene,camera);}
const views={front:0,threeQuarter:Math.PI/4,side:Math.PI/2,back:Math.PI};
window.lab={headOnly(value){body.forEach(o=>o.visible=!value);render();},setRound(n){build(rounds[n-1]);render();},setView(v){azimuth=views[v];elevation=.08;zoom=1;render();},ready:true};
const select=document.querySelector('#round');rounds.forEach(p=>select.add(new Option(`סבב ${p.round} · ${p.hair}`,p.round)));let preferred=6;try{const metrics=await (await fetch('./shots/metrics.json')).json();if(metrics.status==='measured')preferred=metrics.bestRound;}catch{}select.value=query.get('round')||String(preferred);select.onchange=()=>window.lab.setRound(+select.value);window.lab.setRound(+select.value);
for(const [v,label] of Object.entries({front:'חזית',threeQuarter:'¾',side:'צד',back:'גב'})){const b=document.createElement('button');b.textContent=label;b.onclick=()=>window.lab.setView(v);document.querySelector('#views').append(b);}
if(query.has('capture'))document.querySelector('aside').style.display='none';window.lab.setView(query.get('view')||'threeQuarter');
let down=false,last;renderer.domElement.onpointerdown=e=>{down=true;last=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);};renderer.domElement.onpointerup=()=>down=false;renderer.domElement.onpointermove=e=>{if(!down)return;azimuth-=(e.clientX-last[0])*.008;elevation=T.MathUtils.clamp(elevation+(e.clientY-last[1])*.004,-.35,.45);last=[e.clientX,e.clientY];render();};renderer.domElement.onwheel=e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom-e.deltaY*.001,.65,1.7);render();};onresize=()=>{renderer.setSize(innerWidth,innerHeight);render();};

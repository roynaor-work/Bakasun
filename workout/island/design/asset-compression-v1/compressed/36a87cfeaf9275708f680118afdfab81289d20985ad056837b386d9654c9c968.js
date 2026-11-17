// The beach: sky, light, sea, sand, rocks, vegetation, defence line and the horizon.
import * as THREE from './vendor/three.module.js';
import {rand,clamp,shoreZ,groundY,HIGH,mat,geo,rb,cyl,sph,torus,mesh,canvasTex,T,worn,mergeStatic} from './kit.js';

export const SUN_POS=new THREE.Vector3(-70,72,28);
const wind={value:0};
const tmp=new THREE.Vector3();

// value noise for rock shapes
function hash(x,y,z){let h=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return h-Math.floor(h);}
function vnoise(x,y,z){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi;const s=t=>t*t*(3-2*t);const u=s(xf),v=s(yf),w=s(zf);
  const L=(a,b,t)=>a+(b-a)*t;const c=(i,j,k)=>hash(xi+i,yi+j,zi+k);
  return L(L(L(c(0,0,0),c(1,0,0),u),L(c(0,1,0),c(1,1,0),u),v),L(L(c(0,0,1),c(1,0,1),u),L(c(0,1,1),c(1,1,1),u),v),w);}
function fbm(x,y,z){let a=0,f=1,amp=.5;for(let i=0;i<4;i++){a+=vnoise(x*f,y*f,z*f)*amp;f*=2.1;amp*=.5;}return a;}

// Gentle wind on leaves, grass and flags: displacement grows toward the tip (uv.y).
function sway(m,strength,axis='y'){m.onBeforeCompile=s=>{s.uniforms.uWind=wind;s.vertexShader='uniform float uWind;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  float along=${axis==='x'?'uv.x':'uv.y'};float ph=transformed.x*.13+transformed.z*.11;
  transformed.x+=sin(uWind*1.7+ph)*along*along*${strength.toFixed(3)};transformed.z+=cos(uWind*1.3+ph*1.3)*along*along*${(strength*.6).toFixed(3)};transformed.y+=sin(uWind*2.3+ph)*along*${(strength*.25).toFixed(3)};`);};m.customProgramCacheKey=()=>'sway'+strength+axis;return m;}
function cutout(map,color,{side=THREE.DoubleSide,swayK=0,rough=.75}={}){const m=new THREE.MeshStandardMaterial({color,map,alphaTest:.45,side,roughness:rough,metalness:0});if(swayK)sway(m,swayK);return m;}
function cutoutDepth(map){return new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map,alphaTest:.45});}

export function createWorld(scene,renderer){
  const W=new THREE.Group(); // static props, merged at the end
  const out={};
  // ---------- light ----------
  const hemi=new THREE.HemisphereLight('#d3ecff','#c4a87a',1.05);scene.add(hemi);out.hemi=hemi;
  const sun=new THREE.DirectionalLight('#ffe8c2',3.4);sun.position.copy(SUN_POS);sun.castShadow=true;const sm=HIGH?2048:1024;sun.shadow.mapSize.set(sm,sm);
  Object.assign(sun.shadow.camera,{left:-80,right:80,top:95,bottom:-95,near:1,far:300});sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;if(HIGH)sun.shadow.radius=2.5;sun.target.position.set(0,0,-40);scene.add(sun,sun.target);out.sun=sun;
  scene.fog=new THREE.FogExp2('#a9d6df',.0024);
  // ---------- sky ----------
  const sunDir=SUN_POS.clone().normalize();
  const skyMat=()=>new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new THREE.Color('#2b86c2')},mid:{value:new THREE.Color('#7fc0dc')},horizon:{value:new THREE.Color('#d8f0ee')},ground:{value:new THREE.Color('#c9b48a')},sunDir:{value:new THREE.Vector3(-.55,.3,-.78).normalize()}},
    vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vP;uniform vec3 top,mid,horizon,ground,sunDir;void main(){vec3 d=normalize(vP);float h=d.y;vec3 c;
      if(h>0.){c=mix(horizon,mid,smoothstep(0.,.18,h));c=mix(c,top,smoothstep(.15,.7,h));}else c=mix(horizon,ground,pow(min(1.,-h*3.),.6));
      float s=max(dot(d,sunDir),0.);c+=vec3(1.,.9,.7)*(pow(s,900.)*3.+pow(s,24.)*.22+pow(s,4.)*.06);gl_FragColor=vec4(c,1.);}`});
  const skyM=skyMat();scene.add(new THREE.Mesh(new THREE.SphereGeometry(1100,32,16),skyM));out.sky=skyM.uniforms;
  const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),skyMat()));
  const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(envScene,.025).texture;scene.environmentIntensity=.6;pm.dispose();
  const cloudTex=canvasTex(256,(x)=>{for(let i=0;i<16;i++){const cx=rand(40,216),cy=rand(110,160)-Math.abs(128-cx)*.28,r=rand(24,54);const g=x.createRadialGradient(cx,cy-r*.2,0,cx,cy,r);g.addColorStop(0,'rgba(255,255,255,.97)');g.addColorStop(.55,'rgba(244,249,253,.65)');g.addColorStop(1,'rgba(225,238,248,0)');x.fillStyle=g;x.fillRect(0,0,256,256);}});
  for(let i=0;i<18;i++){const c=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex,transparent:true,depthWrite:false,fog:false,opacity:rand(.7,.95),rotation:rand(-.08,.08)}));const w=rand(150,300);c.scale.set(w,w*.42,1);c.position.set(rand(-700,700),rand(110,210),rand(-950,-560));scene.add(c);(out.clouds||=[]).push(c);}

  // ---------- sea ----------
  const nTex=T('waterNormal'),fTex=T('foam');
  const seaMat=new THREE.ShaderMaterial({transparent:true,uniforms:{time:{value:0},fogColor:{value:new THREE.Color('#a9d6df')},sunDir:{value:sunDir.clone()},nmap:{value:nTex},fmap:{value:fTex},skyTop:{value:new THREE.Color('#5aa9d6')},skyHor:{value:new THREE.Color('#d8f0ee')},uDim:{value:1},uFog:{value:.0024},uChop:{value:0}},
    vertexShader:`uniform float time;varying vec3 vP;varying float vH;void main(){vec3 p=(modelMatrix*vec4(position,1.)).xyz;float h=sin(p.x*.14+time*1.3)*.22+cos(p.z*.18-time)*.2+sin(p.x*.4+p.z*.24+time*1.9)*.06;p.y+=h;vH=h;vP=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float time;uniform vec3 fogColor,sunDir,skyTop,skyHor;uniform float uDim,uFog,uChop;uniform sampler2D nmap,fmap;varying vec3 vP;varying float vH;
      float shoreZ(float x){return -12.+sin(x*.07)*3.+sin(x*.19+1.3)*1.2;}
      void main(){
        float t=time;float a=vP.x*.14+t*1.3,b=vP.z*.18-t,c2=vP.x*.4+vP.z*.24+t*1.9;
        vec3 n=normalize(vec3(-(.14*.22*cos(a)+.4*.06*cos(c2)),1.,-(-.18*.2*sin(b)+.24*.06*cos(c2))));
        vec3 n1=texture2D(nmap,vP.xz*.045+vec2(t*.013,t*.009)).xyz*2.-1.;vec3 n2=texture2D(nmap,vP.xz*.11+vec2(-t*.017,t*.021)).xyz*2.-1.;
        float dist=length(vP.xz-cameraPosition.xz);float detail=mix(.55,.12,smoothstep(20.,220.,dist))*(1.+uChop*.9);
        n=normalize(n+vec3(n1.x+n2.x,0.,n1.y+n2.y)*detail);
        float d=shoreZ(vP.x)-vP.z;float depth=max(d,0.)*.09;
        vec3 V=normalize(cameraPosition-vP);vec3 R=reflect(-V,n);
        vec3 shallow=vec3(.27,.86,.78),mid=vec3(.05,.55,.64),deep=vec3(.02,.27,.46);
        vec3 col=mix(shallow,mid,smoothstep(.0,1.4,depth));col=mix(col,deep,smoothstep(1.4,10.,depth));
        col+=vec3(.05,.12,.08)*smoothstep(.1,.35,vH); // light through wave crests
        col=mix(col,col*vec3(.62,.7,.72),1.-uDim);
        float fres=.04+.96*pow(1.-max(dot(n,V),0.),5.);vec3 sky=mix(skyHor,skyTop,pow(max(R.y,0.),.45));col=mix(col,sky,clamp(fres*1.1,0.,.85));
        vec3 H=normalize(V+sunDir);col+=uDim*uDim*vec3(1.,.93,.78)*(pow(max(dot(n,H),0.),420.)*3.+pow(max(dot(n,H),0.),40.)*.12);
        // foam: shore swash, incoming wave lines, and soft patches
        float fp=texture2D(fmap,vP.xz*.08+vec2(t*.02,-t*.03)).r,fp2=texture2D(fmap,vP.xz*.23-vec2(t*.04,t*.01)).r;
        float swash=1.2+sin(t*.8+vP.x*.04)*1.1;float shoreFoam=(1.-smoothstep(0.,1.5,abs(d-swash)))*smoothstep(.25,.6,fp*.6+fp2*.5);
        float edge=(1.-smoothstep(0.,2.2,d))*smoothstep(.3,.7,fp2);
        float band=fract((d+t*2.2)/11.);float lines=smoothstep(.0,.04,band)*(1.-smoothstep(.04,.13,band))*(1.-smoothstep(10.,34.,d))*smoothstep(.35,.7,fp);
        float caps=uChop*smoothstep(.6,.78,fp*.7+fp2*.6)*smoothstep(.02,.3,vH);float foam=clamp(shoreFoam*1.1+edge*.8+lines*.8+caps*.7,0.,1.);
        col=mix(col,vec3(.95,.99,.98),foam);
        float alpha=mix(.38,.97,smoothstep(.0,1.3,depth));alpha=max(alpha,foam);
        float fog=1.-exp(-dist*uFog);gl_FragColor=vec4(mix(col,fogColor,fog),alpha);
      }`});
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800,200,200).rotateX(-Math.PI/2),seaMat);sea.position.set(0,0,-500);sea.renderOrder=2;scene.add(sea);out.sea=sea;out.seaU=seaMat.uniforms;

  // ---------- sand ----------
  const g=new THREE.PlaneGeometry(360,150,180,75).rotateX(-Math.PI/2);g.translate(0,0,28);
  const p=g.attributes.position,colors=[];const dry=new THREE.Color('#ead4a2'),dryB=new THREE.Color('#dcc08a'),wet=new THREE.Color('#ad8f5f'),under=new THREE.Color('#8f8664'),c=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,groundY(x,z)+rand(-.025,.025));const d=z-shoreZ(x);
    if(d<0)c.copy(under).lerp(wet,clamp(1+d/3,0,1));else if(d<5)c.copy(wet).lerp(dry,Math.pow(d/5,.7));else c.copy(dry).lerp(dryB,clamp((z-8)/35,0,1)*.8+Math.sin(x*.05+z*.08)*.1);
    c.offsetHSL(0,0,rand(-.015,.015));colors.push(c.r,c.g,c.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const sMap=T('sandMap').clone();sMap.needsUpdate=true;sMap.repeat.set(46,19);const sN=T('sandNormal').clone();sN.needsUpdate=true;sN.repeat.set(26,11);
  let sandMat;
  if(HIGH){sandMat=new THREE.MeshStandardMaterial({vertexColors:true,map:sMap,normalMap:sN,normalScale:new THREE.Vector2(.55,.55),roughness:.95,metalness:0});
    sandMat.onBeforeCompile=s=>{s.vertexShader='varying vec3 vWp;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWp=(modelMatrix*vec4(transformed,1.)).xyz;');
      s.fragmentShader='varying vec3 vWp;\nfloat shoreZ(float x){return -12.+sin(x*.07)*3.+sin(x*.19+1.3)*1.2;}\n'+s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nfloat dS=vWp.z-shoreZ(vWp.x);roughnessFactor=mix(.22,roughnessFactor,smoothstep(.2,4.5,dS));');};
    sandMat.customProgramCacheKey=()=>'wetsand';}
  else sandMat=new THREE.MeshLambertMaterial({vertexColors:true,map:sMap});
  const sand=new THREE.Mesh(g,sandMat);sand.receiveShadow=true;scene.add(sand);

  // ---------- rocks ----------
  const rockGeos=[0,1,2,3].map(k=>{const r=new THREE.IcosahedronGeometry(1,HIGH?4:3);const q=r.attributes.position;const col=[];const cc=new THREE.Color();
    for(let i=0;i<q.count;i++){tmp.fromBufferAttribute(q,i);const n=fbm(tmp.x*1.3+k*7,tmp.y*1.3,tmp.z*1.3+k*3);const flat=tmp.y>.45?.75:1;tmp.multiplyScalar((.72+n*.62));tmp.y*=.72*flat;q.setXYZ(i,tmp.x,tmp.y,tmp.z);}
    r.computeVertexNormals();const nr=r.attributes.normal;
    for(let i=0;i<q.count;i++){const y=q.getY(i),ny=nr.getY(i);cc.set('#8d877a');cc.lerp(new THREE.Color('#6d6a62'),fbm(q.getX(i)*3,y*3,q.getZ(i)*3));if(ny>.55)cc.lerp(new THREE.Color('#7f8d5a'),clamp((ny-.55)*2,0,1)*.55);if(y<-.15)cc.lerp(new THREE.Color('#4a4a44'),clamp(-y*2,0,1)*.6);col.push(cc.r,cc.g,cc.b);}
    r.setAttribute('color',new THREE.Float32BufferAttribute(col,3));return r;});
  const rMap=T('rockMap').clone();rMap.needsUpdate=true;rMap.repeat.set(2,2);const rN=T('rockNormal').clone();rN.needsUpdate=true;rN.repeat.set(2,2);
  const rockMat=new THREE.MeshStandardMaterial({vertexColors:true,map:rMap,normalMap:rN,normalScale:new THREE.Vector2(.9,.9),roughness:.88,metalness:0});
  const rocksInWater=[];
  const rock=(x,z,s,sy=1,ry=rand(0,6),sink=.25)=>{const m=mesh(W,rockGeos[Math.floor(rand(0,4))],rockMat,[x,groundY(x,z)-s*sink,z],[s*rand(.85,1.2),s*sy,s*rand(.85,1.2)],[rand(-.15,.15),ry,rand(-.15,.15)]);if(groundY(x,z)<0)rocksInWater.push([x,z,s]);return m;};
  // headland outcrops framing the bay
  for(const side of [-1,1]){for(let i=0;i<9;i++){const x=side*(36+i*2.6+rand(-2,2)),z=-16+i*3.4+rand(-2,2);rock(x,z,rand(3.5,6.5),rand(.9,1.5));}for(let i=0;i<6;i++)rock(side*(30+rand(0,10)),rand(-24,-12),rand(1.4,3.2),rand(.6,1));}
  for(const [x,z,s] of [[-24,-8,2.6],[-29,-4,1.6],[26,-11,3],[31,-6,1.8],[-18,6,1.1],[19,5,1.2],[-12,-15,1.5],[14,-17,2],[-6,-20,1.2],[9,-24,1.6],[-20,-26,2.2],[22,-30,2.6]])rock(x,z,s,rand(.6,1));
  for(let i=0;i<90;i++){const x=rand(-60,60),z=rand(-8,32);if(Math.abs(x)<7&&z>8)continue;const s=rand(.1,.32);const m=mesh(W,rockGeos[i%4],rockMat,[x,groundY(x,z)+s*.2,z],[s,s*.7,s],[0,rand(0,6),0]);m.castShadow=false;}
  // foam rings around rocks that stand in the water
  const ringMat=new THREE.MeshBasicMaterial({color:'#f3fbfa',transparent:true,opacity:.6,depthWrite:false,map:T('foam'),alphaMap:T('foam')});
  out.rings=rocksInWater.map(([x,z,s],i)=>{const m=new THREE.Mesh(geo('foamring',()=>new THREE.RingGeometry(.85,1.35,40,1).rotateX(-Math.PI/2)),ringMat.clone());m.position.set(x,.1,z);m.scale.setScalar(s*1.05);m.userData={s,ph:i*1.7};m.renderOrder=3;scene.add(m);return m;});

  // ---------- vegetation ----------
  const frondMat=cutout(T('frond'),'#ffffff',{swayK:.32});const frondDepth=cutoutDepth(T('frond'));
  const grassMat=cutout(T('grass'),'#e9f2d8',{swayK:.18});const leafMat=cutout(T('leaves'),'#ffffff',{swayK:.06});const leafDepth=cutoutDepth(T('leaves'));
  const barkTex=canvasTex(128,(x,s)=>{x.fillStyle='#8e7454';x.fillRect(0,0,s,s);for(let y=0;y<s;y+=10){x.fillStyle=`rgba(60,42,25,${rand(.35,.6)})`;x.fillRect(0,y,s,rand(2,4));x.fillStyle='rgba(190,165,120,.25)';x.fillRect(0,y+4,s,2);}for(let i=0;i<300;i++){x.fillStyle=`rgba(50,35,20,${rand(.1,.3)})`;x.fillRect(rand(0,s),rand(0,s),rand(1,3),rand(3,8));}},{repeat:true});
  barkTex.repeat.set(2,3);const barkMat=new THREE.MeshStandardMaterial({color:'#ffffff',map:barkTex,roughness:.92});
  const frondGeo=geo('frond',()=>{const seg=10,L=5.2;const pos=[],uv=[],idx=[];for(let i=0;i<=seg;i++){const t=i/seg,w=(Math.sin(Math.min(1,t*1.15)*Math.PI)*.95+.12)*1.25,z=-t*L,y=-t*t*1.9+t*.45;for(let j=0;j<=2;j++){const u=j/2,x=(u-.5)*w;pos.push(x,y+(j===1?.12*Math.sin(t*Math.PI):-.02),z);uv.push(u,t);}}
    for(let i=0;i<seg;i++)for(let j=0;j<2;j++){const a=i*3+j,b=a+1,c=a+3,d=a+4;idx.push(a,c,b,b,c,d);}const g2=new THREE.BufferGeometry();g2.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g2.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g2.setIndex(idx);g2.computeVertexNormals();return g2;});
  const nutMat=mat('#5b4426',.1,.6);
  function palm(x,z,h,baseY=null,parent=W){
    const P=new THREE.Group();const seg=9,lean=rand(.35,.9)*(x<0?1:-1);let px=0,py=0,ang=0;
    for(let i=0;i<seg;i++){const t=i/seg,r=.5-t*.2;ang=-lean*.13*t;const s=mesh(P,cyl(r*.9,r,h/seg+.06,10),barkMat,[px,py+h/seg/2,0]);s.rotation.z=ang;px+=-Math.sin(ang)*h/seg;py+=Math.cos(ang)*h/seg;
      mesh(P,cyl(r*1.04,r*1.04,.12,10),barkMat,[px,py,0]).castShadow=false;}
    const top=new THREE.Vector3(px,py,0);mesh(P,sph(.55,10,8),mat('#6d6a35',0,.8),[px,py+.1,0],[1,.8,1]);
    for(let j=0;j<11;j++){const l=new THREE.Mesh(frondGeo,frondMat);l.customDepthMaterial=frondDepth;l.position.copy(top);l.rotation.set(rand(-.35,.05)+(j>8?-.6:0),j*Math.PI*2/8+rand(-.2,.2),rand(-.15,.15),'YXZ');l.scale.setScalar(j>8?.6:rand(.85,1.1));l.castShadow=true;P.add(l);}
    for(let k=0;k<5;k++)mesh(P,sph(.3,10,8),nutMat,[px+Math.cos(k*1.3)*.38,py-.3-(k%2)*.12,Math.sin(k*1.3)*.38]);
    P.position.set(x,baseY??groundY(x,z)-.2,z);P.rotation.y=rand(0,6);parent.add(P);
  }
  for(const [x,z,h] of [[-22,-1,13],[-27,4,16],[-34,-5,14],[24,-3,15],[30,2,17],[37,-7,13],[-46,9,15],[48,7,16],[-15,19,12],[16,21,13],[-40,22,17],[41,24,15]])palm(x,z,h);
  const cardGeo=geo('card',()=>new THREE.PlaneGeometry(1,1).translate(0,.5,0));
  function tuft(x,z,s=1){for(let k=0;k<3;k++){const m=new THREE.Mesh(cardGeo,grassMat);m.position.set(x,groundY(x,z)-.03,z);m.rotation.y=k*1.05+rand(0,1);m.scale.set(1.3*s,rand(.7,1.1)*s,1);W.add(m);}}
  for(let i=0;i<70;i++){const side=Math.random()<.5?-1:1;const x=side*rand(9,58),z=rand(5,36);tuft(x,z,rand(.8,1.5));}
  for(let i=0;i<14;i++){const x=rand(-7,7),z=rand(26,36);tuft(x,z,.9);}
  const bushCore=mat('#3d6a3a',0,.85);const flower=[mat('#f06a8a',0,.6),mat('#ffb340',0,.6),mat('#f4f0e6',0,.6)];
  function bush(x,z,s){const B=new THREE.Group();mesh(B,sph(1,10,8),bushCore,[0,.45,0],[.9,.6,.9]);for(let k=0;k<9;k++){const m=new THREE.Mesh(cardGeo,leafMat);m.customDepthMaterial=leafDepth;m.castShadow=true;m.position.set(rand(-.4,.4),rand(-.1,.3),rand(-.4,.4));m.rotation.set(rand(-.5,.5),rand(0,6),rand(-.4,.4));m.scale.set(rand(1.6,2.2),rand(1.3,1.8),1);B.add(m);}
    for(let k=0;k<5;k++)mesh(B,sph(.09,6,5),flower[k%3],[rand(-.9,.9),rand(.6,1.2),rand(-.9,.9)]).castShadow=false;B.position.set(x,groundY(x,z),z);B.scale.setScalar(s);W.add(B);}
  for(const [x,z,s] of [[-20,12,1.5],[-25,16,1.9],[22,13,1.6],[28,18,2],[-38,16,2.3],[40,18,2.2],[-15,26,1.4],[17,27,1.6],[-31,8,1.2],[33,9,1.3],[-8,30,1.2],[9,31,1.3]])bush(x,z,s);
  // beach detail: wrack line of seaweed, shells, starfish, driftwood
  const weed=mat('#3f4f2a',0,.9),weed2=mat('#5a5a2c',0,.9),shellM=[mat('#f1e3cf',.1,.5),mat('#e8b9a2',.1,.5)],star=mat('#e0753b',0,.7),wood=new THREE.MeshStandardMaterial({color:'#b59a78',map:T('wood'),roughness:.9});
  for(let i=0;i<120;i++){const x=rand(-46,46),z=shoreZ(x)+rand(3,5.5);mesh(W,sph(1,6,4),i%2?weed:weed2,[x,groundY(x,z)+.02,z],[rand(.15,.45),.04,rand(.06,.14)],[0,rand(0,6),0]).castShadow=false;}
  for(let i=0;i<40;i++){const x=rand(-40,40),z=rand(-6,10);mesh(W,geo('shell',()=>new THREE.SphereGeometry(.1,8,6,0,6.28,0,1.6)),shellM[i%2],[x,groundY(x,z)+.01,z],[1,.6,1.3],[0,rand(0,6),0]).castShadow=false;}
  const starGeo=geo('star',()=>{const s=new THREE.Shape();for(let i=0;i<10;i++){const a=i/10*Math.PI*2+Math.PI/2,r=i%2?.07:.2;i?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}const g2=new THREE.ExtrudeGeometry(s,{depth:.04,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:1});g2.rotateX(-Math.PI/2);return g2;});
  for(let i=0;i<9;i++){const x=rand(-30,30),z=rand(-7,6);mesh(W,starGeo,star,[x,groundY(x,z)+.02,z],null,[0,rand(0,6),0]).castShadow=false;}
  for(const [x,z,l,r] of [[-14,1,3.2,.14],[12,-2,2.6,.12],[-33,12,4,.2],[35,14,3.5,.18]]){const D=new THREE.Group();mesh(D,cyl(r*.8,r,l,8),wood,[0,0,0],null,[0,0,Math.PI/2]);mesh(D,cyl(r*.3,r*.5,l*.35,6),wood,[l*.2,.15,.15],null,[.5,0,Math.PI/2.8]);D.position.set(x,groundY(x,z)+r*.7,z);D.rotation.y=rand(0,3);W.add(D);}

  // ---------- defence line ----------
  const rust=worn('#6e4f3c',.6,.62,{ns:.6}),rust2=worn('#5a4636',.65,.58,{ns:.6});
  for(const x of [-22,-15,-9,9,15,22]){const z=3.2+rand(-.6,.6),H=new THREE.Group();for(let k=0;k<3;k++){const b=mesh(H,rb(.26,2.7,.26,.04),k%2?rust:rust2,[0,0,0]);b.rotation.set(k===0?.95:k===1?-.95:0,k*1.05,k===2?.95:0);}
    for(let k=0;k<6;k++)mesh(H,cyl(.035,.035,.18,6),mat('#4c3a2c',.6,.5),[rand(-.6,.6),rand(-.6,.6),rand(-.6,.6)]);H.position.set(x,groundY(x,z)+.75,z);H.rotation.y=rand(0,3);W.add(H);}
  // barbed wire coils on posts
  const wire=mat('#9a9c98',.85,.4),post=new THREE.MeshStandardMaterial({color:'#8b6b4a',map:T('wood'),roughness:.85});
  for(const side of [-1,1])for(let i=0;i<6;i++){const x=side*(5.5+i*3.4),z=6.5+Math.sin(i)*.4;mesh(W,cyl(.07,.08,1.4,6),post,[x,groundY(x,z)+.6,z]);
    if(i<5){const x2=side*(5.5+(i+1)*3.4);for(let k=0;k<7;k++){const t=k/6,xx=x+(x2-x)*t;mesh(W,torus(.4,.011,4,14),wire,[xx,groundY(xx,z)+.5,z],null,[0,Math.PI/2+rand(-.2,.2),0]).castShadow=false;}}}
  // sandbags
  const bN=T('burlapNormal').clone();bN.needsUpdate=true;bN.repeat.set(5,2);const burl=new THREE.MeshStandardMaterial({color:'#c2ad80',map:T('sandMap'),normalMap:bN,normalScale:new THREE.Vector2(.3,.3),roughness:.95});
  const burl2=burl.clone();burl2.color.set('#ad9a6e');
  const bag=rb(1.9,.62,1.05,.27);
  for(let row=0;row<3;row++)for(let j=-7;j<=7;j++){const x=j*1.85+(row%2?.9:0);if(Math.abs(x)>13.6)continue;const z=12.5+row*.05;mesh(W,bag,(j+row)%2?burl:burl2,[x,groundY(x,z)+.3+row*.56,z],[1,1,1],[rand(-.04,.04),rand(-.08,.08),rand(-.04,.04)]);}
  const crate=new THREE.MeshStandardMaterial({color:'#c39a6a',map:T('wood'),roughness:.82}),strap=worn('#3b4446',.8,.45);
  for(const [x,z,s] of [[-16,14,1.4],[-17.6,15.2,1],[16.5,14.5,1.3],[18,13.4,.9]]){const C=new THREE.Group();mesh(C,rb(s*1.6,s,s,.05),crate,[0,0,0]);for(const sx of [-.6,.6])mesh(C,rb(.08,s*1.02,s*1.02,.02),strap,[sx*s,0,0]);C.position.set(x,groundY(x,z)+s/2,z);C.rotation.y=rand(-.3,.3);W.add(C);}
  const ammo=worn('#56604a',.35,.62),haz=new THREE.MeshStandardMaterial({map:T('hazard'),roughness:.6});
  for(const [x,z] of [[-11,17],[11.5,17.5],[-12.4,17.6]]){const A=new THREE.Group();mesh(A,rb(1.5,.8,.85,.07),ammo);mesh(A,rb(1.52,.12,.3,.03),haz,[0,.12,.44]);mesh(A,rb(.5,.1,.16,.04),worn('#2f3536',.8,.4),[0,.46,0]);A.position.set(x,groundY(x,z)+.4,z);A.rotation.y=rand(-.2,.2);W.add(A);}
  // flag
  const flagTex=canvasTex(128,(x,s)=>{x.fillStyle='#e9a63a';x.fillRect(0,0,s,s);x.fillStyle='#2c5f73';x.fillRect(0,s*.36,s,s*.28);x.fillStyle='#fff6df';x.beginPath();x.arc(s*.5,s*.5,s*.17,0,7);x.fill();x.fillStyle='#2c5f73';x.beginPath();x.ellipse(s*.5,s*.52,s*.08,s*.06,0,0,7);x.fill();});
  const flagMat=new THREE.MeshStandardMaterial({map:flagTex,side:THREE.DoubleSide,roughness:.8});sway(flagMat,.55,'x');
  const flag=new THREE.Mesh(geo('flag',()=>new THREE.PlaneGeometry(2.4,1.5,12,4).translate(1.2,0,0)),flagMat);
  const fx=-19,fz=19;mesh(scene,cyl(.06,.08,7,8),worn('#9aa3a3',.9,.3),[fx,groundY(fx,fz)+3.5,fz]);flag.position.set(fx,groundY(fx,fz)+6.2,fz);flag.rotation.y=-.6;flag.castShadow=true;scene.add(flag);
  // gun deck: grating on a frame
  const grate=canvasTex(128,(x,s)=>{x.fillStyle='#4a5556';x.fillRect(0,0,s,s);x.fillStyle='#222a2c';for(let i=0;i<s;i+=16)for(let j=0;j<s;j+=16)x.fillRect(i+3,j+3,10,10);},{repeat:true});grate.repeat.set(6,5);
  mesh(W,rb(9,.4,8,.1),new THREE.MeshStandardMaterial({map:grate,metalness:.7,roughness:.5}),[0,groundY(0,22)+.2,22]);

  // ---------- horizon ----------
  function island(x,z,size,height,lighthouse=false){const root=new THREE.Group();const rg=new THREE.ConeGeometry(size,height,14,5);const q=rg.attributes.position;for(let i=0;i<q.count;i++){tmp.fromBufferAttribute(q,i);if(tmp.y<height/2-.1){const n=fbm(tmp.x*.05,tmp.y*.05,tmp.z*.05);q.setXYZ(i,tmp.x*(.85+n*.35),tmp.y,tmp.z*(.85+n*.35));}}rg.computeVertexNormals();
    mesh(root,rg,new THREE.MeshStandardMaterial({color:'#6b8a6e',roughness:1,flatShading:true}),[0,height*.3,0]).castShadow=false;
    mesh(root,sph(1,24,10),mat('#e2cf9e',0,1),[0,0,0],[size*.95,2.4,size*.65]).castShadow=false;
    mesh(root,sph(1,18,10),new THREE.MeshStandardMaterial({color:'#4b7d5f',roughness:1,flatShading:true}),[0,height*.25,0],[size*.68,height*.36,size*.5]).castShadow=false;
    if(lighthouse){const L=new THREE.Group();for(let i=0;i<5;i++)mesh(L,cyl(2.4-i*.25,2.6-i*.25,4,16),mat(i%2?'#c4473a':'#f1ece0',.1,.6),[0,i*4,0]);mesh(L,cyl(1.6,1.6,2.4,16),mat('#ffe9a8',.1,.3,'#ffd76a',2),[0,21,0]);mesh(L,geo('lhroof',()=>new THREE.ConeGeometry(2,2.4,16)),mat('#2f3c45',.4,.5),[0,23.4,0]);L.position.set(size*.25,height*.55,0);root.add(L);}
    root.position.set(x,-1.2,z);W.add(root);for(let i=0;i<5;i++)palm(x+rand(-size*.5,size*.5),z+rand(-size*.3,size*.2),rand(10,16),root.position.y+height*.15);}
  island(-140,-210,52,26);island(170,-260,74,32,true);island(25,-520,85,30);island(-330,-380,60,22);
  const mtn=new THREE.MeshBasicMaterial({color:'#b9d9dc',fog:false});for(const [x,z,s,h] of [[-560,-950,300,62],[-210,-1000,360,78],[280,-980,320,66],[640,-920,260,52]]){out.mountain=mtn;const m=new THREE.Mesh(new THREE.ConeGeometry(s,h,24,1),mtn);m.position.set(x,h/2-12,z);scene.add(m);}

  mergeStatic(W,scene);
  out.update=(t)=>{seaMat.uniforms.time.value=t;wind.value=t;for(const r of out.rings){const k=(Math.sin(t*1.3+r.userData.ph)+1)/2;r.scale.setScalar(r.userData.s*(1+k*.35));r.material.opacity=.55-k*.35;}};
  return out;
}

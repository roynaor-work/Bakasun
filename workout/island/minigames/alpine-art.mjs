import * as T from '../vendor/three.module.js';
import {mergeVertices} from '../vendor/BufferGeometryUtils.js?v=island-soccer-league-20261029-1';
import {createFirForest} from './alpine-fir.mjs?v=island-soccer-league-20261029-1';

// Original, real-time art. Every solid surface has depth; no photo cards or scenery colliders.
const noiseGLSL=`
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float snoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return snoise(p)*.55+snoise(p*2.03)*.27+snoise(p*4.11)*.12+snoise(p*8.13)*.06;}
`;
function worldShader(m,code,key){m.onBeforeCompile=s=>{s.vertexShader='varying vec3 artWorld; varying vec3 artNormal;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n artWorld=(modelMatrix*vec4(transformed,1.)).xyz; artNormal=normalize(inverseTransformDirection(transformedNormal,viewMatrix));');s.fragmentShader='varying vec3 artWorld; varying vec3 artNormal;\n'+noiseGLSL+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+code);};m.customProgramCacheKey=()=>key;return m;}
export function snowMaterial({powder=false}={}){const m=worldShader(new T.MeshStandardMaterial({color:powder?'#e2e8eb':'#dbe6e9',roughness:powder?.96:.84,envMapIntensity:.16}),`
 float n=fbm(artWorld*.34), crystal=snoise(artWorld*48.);float fineFade=1.-smoothstep(.015,.12,length(fwidth(artWorld)));
 float wind=sin(artWorld.x*4.8+artWorld.z*.45+snoise(artWorld*.7)*2.4)*.5+.5;
 diffuseColor.rgb*=.89+n*.18+(crystal-.5)*.04*fineFade+wind*.012;
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.69,.79),smoothstep(.25,.8,1.-artNormal.y)*.16);
 `,powder?'alpine-powder-snow-v8':'alpine-track-snow-v8');const base=m.onBeforeCompile;m.onBeforeCompile=s=>{base(s);s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 float detailFade=1.-smoothstep(.02,.15,length(fwidth(artWorld)));float relief=fbm(artWorld*1.5)*${powder?.035:.018}+snoise(artWorld*65.)*.0007*detailFade+sin(artWorld.x*11.+artWorld.z*.4+fbm(artWorld*.4)*4.)*.002;
 vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition),ss0=cross(q1,normal),ss1=cross(normal,q0);float det=dot(q0,ss0);
 normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*ss0+dFdy(relief)*ss1));`);};return m;}
export function rockMaterial(){const m=worldShader(new T.MeshStandardMaterial({color:'#6d8392',roughness:.96,envMapIntensity:.18}),`
 float n=fbm(artWorld*1.7),strata=sin(artWorld.y*6.+snoise(artWorld*2.)*3.)*.5+.5;
 float cover=smoothstep(.48,.79,artNormal.y+snoise(artWorld*1.6)*.18);
 vec3 rock=diffuseColor.rgb*(.47+n*.75+strata*.12);
 diffuseColor.rgb=mix(rock,vec3(.72,.81,.85),cover);
 `,'alpine-rock-snow-v6');const base=m.onBeforeCompile;m.onBeforeCompile=s=>{base(s);if(m.userData.granite){s.uniforms.artGranite={value:m.userData.granite};s.fragmentShader='uniform sampler2D artGranite;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('vec3 rock=diffuseColor.rgb*(.47+n*.75+strata*.12);',`vec3 w=pow(abs(artNormal),vec3(5.));w/=w.x+w.y+w.z;vec3 detail=texture2D(artGranite,artWorld.yz*.17).rgb*w.x+texture2D(artGranite,artWorld.xz*.17).rgb*w.y+texture2D(artGranite,artWorld.xy*.17).rgb*w.z;vec3 rock=detail*vec3(.65,.76,.85)*(.8+n*.30+strata*.16);`);}};return m;}
export function createArtWorld(scene,{course,deckEdge,terrainY,place,frameAt,snow,stone,dusk,mobile=false,density=1}){
 let seed=82317;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
 const rocks=[],posts=[];const uprightFrame={};
 const upright=(obj,s,x,y,roll=0,yaw=0)=>{frameAt(s,uprightFrame);place(obj,s,x,y,roll,yaw,Math.atan(uprightFrame.grade));};
 const forest=createFirForest(scene,{course,deckEdge,terrainY,place:upright,density,dusk,mobile});
 const rawRock=new T.IcosahedronGeometry(1,5);rawRock.deleteAttribute('uv');const rockGeo=mergeVertices(rawRock);rawRock.dispose();const rp=rockGeo.attributes.position;
 for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),n=1+.09*Math.sin(x*12+z*5)*Math.cos(y*7-z*3),skirt=y<0?1/Math.max(.08,Math.sqrt(Math.max(0,1-y*y))):1;rp.setXYZ(i,x*n*skirt,y*(y<0?8:1)*n,z*n*skirt);}rockGeo.computeVertexNormals();
 // Rock mass and snow cornices start beyond the lip and deck, never over the rideable pipe.
 for(let s=-20,i=0;s<course.length+100;s+=17,i++){const side=i%2?1:-1,h=3+rnd()*7,wx=3+rnd()*4,wz=5+rnd()*5,yaw=rnd()*2,footprint=Math.hypot(wx*Math.cos(yaw),wz*Math.sin(yaw))*1.23,x=side*(deckEdge+footprint+1+rnd()*3);const rock=new T.Mesh(rockGeo,stone);rock.scale.set(wx,h,wz);upright(rock,s,x,terrainY(s,Math.abs(x),side)+h*.05,0,yaw);rock.castShadow=rock.receiveShadow=true;rock.userData.perf='rocks';scene.add(rock);rocks.push({s,mesh:rock});}
 // Sparse rope markers replace the continuous red safety net, retaining clear boundary cues.
 const poleMat=new T.MeshStandardMaterial({color:'#c87550',roughness:.8});
 const poleGeo=new T.CylinderGeometry(.045,.075,1.6,7).translate(0,.8,0),poles=new T.InstancedMesh(poleGeo,poleMat,70);scene.add(poles);poles.frustumCulled=false;poles.castShadow=true;poles.userData.perf='poles';
 for(let s=-20;s<course.length+80;s+=17)for(const side of [-1,1])posts.push({s,x:side*(deckEdge-.4)});
 const matrix=new T.Matrix4(),dummy=new T.Object3D();let count=0;
 const ridge=new T.Group();ridge.userData.perf='ridge';scene.add(ridge);
 const distantStone=worldShader(new T.MeshStandardMaterial({color:'#a0b9c8',roughness:1,fog:false,envMapIntensity:.1}),`
 float n=fbm(artWorld*.028),cover=smoothstep(.76,.88,artNormal.y+(n-.5)*.25);
 float gully=smoothstep(.61,.75,fbm(vec3(artWorld.x*.045,artWorld.y*.008,artWorld.z*.045)))*smoothstep(.38,.65,artNormal.y);cover=max(cover,gully*.86);
 diffuseColor.rgb=mix(vec3(.21,.31,.38),vec3(.74,.83,.87),cover)*(.86+n*.2);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.51,.64,.72),.15);
 `,'alpine-distant-v6');const distantCompile=distantStone.onBeforeCompile;distantStone.onBeforeCompile=s=>{distantCompile(s);s.vertexShader=s.vertexShader.replace('artWorld=(modelMatrix*vec4(transformed,1.)).xyz;','artWorld=transformed;');s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight,vec3(.43,.57,.65),.32);\n#include <opaque_fragment>');};
 const hash=(x,y)=>{const a=Math.sin(x*127.1+y*311.7)*43758.5453;return a-Math.floor(a);};
 const noise=(x,y)=>{const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,U=u*u*(3-2*u),V=v*v*(3-2*v);return (hash(a,b)*(1-U)+hash(a+1,b)*U)*(1-V)+(hash(a,b+1)*(1-U)+hash(a+1,b+1)*U)*V;};
 for(let k=0;k<2;k++){const p=[],ix=[],NX=mobile?210:420,NZ=mobile?45:90,peaks=[];for(let i=0;i<16;i++)peaks.push({x:-1450+i*190+hash(i,k)*100,z:-610-k*290+hash(i,k+2)*130,h:120+hash(i,k+5)*145});
  for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){const x=-1600+i/NX*3200,z=-330-k*250-j/NZ*700;let y=-85;for(const q of peaks){const dx=x-q.x,dz=z-q.z,angle=Math.atan2(dz,dx),dist=Math.hypot(dx,dz);y=Math.max(y,q.h-dist*(1.12+.20*Math.sin(angle*5+q.x)+.10*Math.sin(angle*11)));}const texture=(1-Math.abs(noise(x*.012,z*.012)*2-1))*23+noise(x*.037,z*.037)*12+noise(x*.09,z*.09)*4;y+=texture;const edge=Math.min(1,j/12,(NZ-j)/12);y=y*edge-180*(1-edge);p.push(x,y-40,z);}
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const a=j*(NX+1)+i,b=a+NX+1;ix.push(a,a+1,b,b,a+1,b+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();const material=distantStone.clone();material.onBeforeCompile=distantStone.onBeforeCompile;material.customProgramCacheKey=distantStone.customProgramCacheKey;material.color.lerp(new T.Color('#c2d4dc'),k*.27);const m=new T.Mesh(g,material);ridge.add(m);
 }
 ridge.scale.y=.95;
 const sky=new T.Mesh(new T.SphereGeometry(850,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{dusk:{value:dusk?1:0}},vertexShader:'varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 dir;uniform float dusk;${noiseGLSL}void main(){vec3 d=normalize(dir);float h=max(0.,d.y);vec3 c=mix(mix(vec3(.79,.83,.82),vec3(.67,.57,.62),dusk),mix(vec3(.22,.46,.59),vec3(.15,.23,.37),dusk),pow(h,.42));float cloud=smoothstep(.50,.72,fbm(vec3(d.x*5.,d.y*16.,d.z*5.)));c=mix(c,vec3(.85,.85,.80),cloud*.38*(1.-smoothstep(.05,.8,h)));vec3 sun=normalize(vec3(-.48,.33,-.71));float disk=dot(d,sun);c+=vec3(.6,.35,.13)*pow(max(0.,disk),24.)*.35;c=mix(c,c*vec3(.85,.88,1.),dusk*.22);gl_FragColor=vec4(c,1.);}` }));sky.renderOrder=-10;sky.userData.perf='sky';scene.add(sky);
 return {update(ps,far,camera,quality){forest.update(ps,far,quality);far=Math.min(far,quality==='low'?165:285);let n=0;
  for(const r of rocks)r.mesh.visible=r.s>ps-55&&r.s<ps+far;
  n=0;for(const p of posts){if(p.s<ps-20||p.s>ps+far||n>=70)continue;upright(dummy,p.s,p.x,terrainY(p.s,Math.abs(p.x),Math.sign(p.x)));dummy.scale.setScalar(1);dummy.updateMatrix();poles.setMatrixAt(n++,dummy.matrix);}poles.count=n;poles.instanceMatrix.needsUpdate=true;
  sky.position.copy(camera.position);ridge.position.set(camera.position.x,camera.position.y-14,camera.position.z);frameAt(ps,uprightFrame);ridge.rotation.y=-uprightFrame.theta;
 },
 /** Low preset: scenery stops casting shadows (the forest already drops to its far tier); no shader changes. */
 setQuality(quality){const cast=quality!=='low';for(const r of rocks)r.mesh.castShadow=cast;poles.castShadow=cast;},
 metrics(){return {...forest.metrics(),rocks:rocks.length};},dispose(){forest.dispose();}};
}

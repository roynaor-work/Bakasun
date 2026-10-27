import * as T from '../vendor/three.module.js';
/** Visual-only scenery placed in the engine's world coordinate frame, outside the pipe. */
export function createAlpineScenery(scene,{course,deckEdge,terrainY,place,granite,dusk=false}){
 let seed=91321;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
 const material=new T.MeshStandardMaterial({color:'#e5ebf1',map:granite,roughness:.94});
 material.onBeforeCompile=s=>{
  s.vertexShader='varying vec3 vStoneWorld;varying vec3 vStoneNormal;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStoneWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vStoneNormal=normalize(inverseTransformDirection(normalize(normalMatrix*objectNormal),viewMatrix));');
  s.fragmentShader='varying vec3 vStoneWorld;varying vec3 vStoneNormal;\n'+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`vec3 aw=pow(abs(normalize(vStoneNormal)),vec3(4.));aw/=aw.x+aw.y+aw.z;
  vec3 stone=texture2D(map,vStoneWorld.yz*.14).rgb*aw.x+texture2D(map,vStoneWorld.xz*.14).rgb*aw.y+texture2D(map,vStoneWorld.xy*.14).rgb*aw.z;
  float cover=smoothstep(.3,.78,vStoneNormal.y);diffuseColor.rgb*=mix(stone,vec3(.88,.94,.99),cover);`);
 };material.customProgramCacheKey=()=> 'alpine-granite-triplanar-v5';
 const geometries=[];for(let k=0;k<5;k++){const g=new T.IcosahedronGeometry(1,7),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=1+.11*Math.sin(x*9+k)*Math.sin(z*7-k)+.055*Math.sin(y*11+x*3),skirt=y<0?1/Math.max(.1,Math.sqrt(Math.max(0,1-y*y))):1;p.setXYZ(i,x*r*skirt,y*(y<0?3:1),z*r*skirt);}g.computeVertexNormals();
  const n=g.attributes.normal,groups=new Map(),keys=[];for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(4)).join(',');keys.push(key);const a=groups.get(key)||new T.Vector3();a.add(new T.Vector3().fromBufferAttribute(n,i));groups.set(key,a);}for(const a of groups.values())a.normalize();for(let i=0;i<p.count;i++){const a=groups.get(keys[i]);n.setXYZ(i,a.x,a.y,a.z);}geometries.push(g);
 }
 const objects=[];for(let s=8,i=0;s<course.length+80;s+=27,i++){const side=i%2?1:-1,x=side*(deckEdge+12+rnd()*16),height=3+rnd()*7,rock=new T.Mesh(geometries[i%5],material);rock.castShadow=true;rock.receiveShadow=true;rock.scale.set(3+rnd()*5,height,4+rnd()*7);place(rock,s,x,terrainY(s,Math.abs(x),side)-height*.14,0,rnd()*2);scene.add(rock);objects.push({object:rock,s});}
 const wood=new T.MeshStandardMaterial({color:'#654535',roughness:.9}),roof=new T.MeshStandardMaterial({color:'#dde9ef',roughness:.85}),glass=new T.MeshStandardMaterial({color:'#e8b35b',emissive:'#d68c32',emissiveIntensity:dusk?1.2:.4,roughness:.32});
 const box=(a,b,c,m,parent,x,y,z)=>{const mesh=new T.Mesh(new T.BoxGeometry(a,b,c),m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 for(let i=0;i<4;i++){const s=90+i*340,side=i%2?1:-1,x=side*(deckEdge+8),g=new T.Group();box(5.2,3,4,wood,g,0,1.4,0);const top=new T.Mesh(new T.ConeGeometry(4.1,2,4),roof);top.rotation.y=Math.PI/4;top.scale.z=.85;top.position.y=3.65;g.add(top);for(const x of [-1.5,1.5]){box(1.05,1.1,.1,glass,g,x,1.65,2.04);box(.055,1.15,.12,wood,g,x,1.65,2.10);}place(g,s,x,terrainY(s,Math.abs(x),side)-.2);scene.add(g);objects.push({object:g,s});}
 return {update(ps,far){for(const x of objects)x.object.visible=x.s>ps-45&&x.s<ps+far+30;},dispose(){granite.dispose();}};
}

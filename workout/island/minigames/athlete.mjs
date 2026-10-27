import * as T from '../vendor/three.module.js';

// Remove disconnected utility-belt geometry from the source outfit, retaining the cloth body.
function removeUtilityGear(g){const p=g.attributes.position,index=g.index;if(!index)return;const parents=Array.from({length:p.count},(_,i)=>i),seen=new Map();const root=i=>parents[i]===i?i:parents[i]=root(parents[i]);const join=(a,b)=>parents[root(a)]=root(b);
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(3)).join(',');if(seen.has(key))join(i,seen.get(key));else seen.set(key,i);}
 for(let i=0;i<index.count;i+=3){join(index.getX(i),index.getX(i+1));join(index.getX(i),index.getX(i+2));}
 const groups=new Map();for(let i=0;i<p.count;i++){const r=root(i),z=p.getZ(i),b=groups.get(r)||[Infinity,-Infinity];b[0]=Math.min(b[0],z);b[1]=Math.max(b[1],z);groups.set(r,b);}const kept=[];for(let i=0;i<index.count;i+=3){const bounds=groups.get(root(index.getX(i)));if((bounds[0]>65&&bounds[1]<125)||bounds[0]>154)continue;kept.push(index.getX(i),index.getX(i+1),index.getX(i+2));}g.setIndex(kept);
}

// Detailed Mixamo character supplied in the Three.js example collection.
// Winter suit colours and the planted snowboard pose are original adaptations.
export function createProRider(gltf,id,color,scene,kit){
 const {cloneSkinned,mesh,geo,mat,basic,box,dark,silver,snowboard,contactTex,profile,materials}=kit;
 const root=new T.Group(),body=cloneSkinned(gltf.scene);root.add(body);body.rotation.y=-Math.PI/2;
 const tp=gltf.animations.find(c=>c.name==='TPose');if(tp){const m=new T.AnimationMixer(body);m.clipAction(tp).play();m.update(0);}root.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(body);const h=bounds.max.y-bounds.min.y;body.scale.setScalar(1.88/h);body.position.y=.12-bounds.min.y*body.scale.x;root.updateMatrixWorld(true);
 const nodes=[];body.traverse(n=>{if(n.isBone)nodes.push(n);});const find=suffix=>{const n=nodes.find(n=>n.name.replaceAll(':','').endsWith(suffix));if(!n)throw Error('Athlete joint missing: '+suffix);return n;};
 const hips=find('Hips'),spine=find('Spine'),chest=find('Spine2');
 const legs={L:[find('LeftUpLeg'),find('LeftLeg'),find('LeftFoot')],R:[find('RightUpLeg'),find('RightLeg'),find('RightFoot')]};
 const arms={L:[find('LeftArm'),find('LeftForeArm'),find('LeftHand')],R:[find('RightArm'),find('RightForeArm'),find('RightHand')]};
 const wp=n=>n.getWorldPosition(new T.Vector3());
 function setWorldQ(n,q){n.quaternion.copy(n.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));root.updateMatrixWorld(true);}
 function pointBone(n,child,target){const p=wp(n),from=wp(child).sub(p).normalize(),to=target.clone().sub(p).normalize();setWorldQ(n,new T.Quaternion().setFromUnitVectors(from,to).multiply(n.getWorldQuaternion(new T.Quaternion())));}
 function ik(chain,target,pole){const [a,b,c]=chain,H=wp(a),l1=H.distanceTo(wp(b)),l2=wp(b).distanceTo(wp(c)),delta=target.clone().sub(H),d=T.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.001),forward=delta.normalize(),up=pole.clone().sub(H);up.addScaledVector(forward,-up.dot(forward)).normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),offset=Math.sqrt(Math.max(0,l1*l1-along*along)),K=H.clone().addScaledVector(forward,along).addScaledVector(up,offset),C=H.clone().addScaledVector(forward,d),q=c.getWorldQuaternion(new T.Quaternion());pointBone(a,b,K);pointBone(b,c,C);setWorldQ(c,q);}
 hips.position.copy(hips.parent.worldToLocal(new T.Vector3(0,.93,0)));root.updateMatrixWorld(true);
 setWorldQ(spine,new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-.17).multiply(spine.getWorldQuaternion(new T.Quaternion())));
 const sign=wp(legs.L[0]).z<wp(legs.R[0]).z?{L:-1,R:1}:{L:1,R:-1};
 for(const side of ['L','R']){const z=sign[side];ik(legs[side],new T.Vector3(.015,.24,z*.33),new T.Vector3(.7,.55,z*.3));ik(arms[side],new T.Vector3(z<0?.34:.19,z<0?1.05:1.14,z*.47),new T.Vector3(.65,1.18,z*.34));}
 const read=(a,i,k)=>a[['getX','getY','getZ','getW'][k]](i);
 // Keep the source's detailed fabric shading while replacing the military palette.
 body.traverse(n=>{if(!n.isMesh)return;n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;const original=n.material;
  if(original.name.toLowerCase().includes('visor')){n.visible=false;return;}
  n.geometry=geo(n.geometry.clone());removeUtilityGear(n.geometry);const p=n.geometry.attributes.position,j=n.geometry.attributes.skinIndex,w=n.geometry.attributes.skinWeight,c=new Float32Array(p.count*3),coat=new T.Color(color),white=new T.Color('#dde8eb'),pants=new T.Color('#192733'),helmet=new T.Color('#203743'),gloves=new T.Color('#101b28');
  for(let i=0;i<p.count;i++){let k=0;for(let t=1;t<4;t++)if(read(w,i,t)>read(w,i,k))k=t;const b=n.skeleton.bones[read(j,i,k)]?.name??'';let v=coat;if(/Leg|Foot|Toe|Hips/.test(b))v=pants;else if(/Hand|Thumb|Index|Middle|Ring|Pinky/.test(b))v=gloves;else if(/Head|Neck/.test(b))v=helmet;else if(/Spine2|Shoulder|Arm/.test(b)&&!/ForeArm/.test(b))v=white;c.set([v.r,v.g,v.b],i*3);}n.geometry.setAttribute('color',new T.BufferAttribute(c,3));
  const material=mat('#ffffff',{map:original.map,normalMap:original.normalMap,vertexColors:true,roughness:.8,metalness:.02});material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
 vec4 winterTexel=texture2D(map,vMapUv);
 float winterDetail=dot(winterTexel.rgb,vec3(.2126,.7152,.0722));
 diffuseColor*=vec4(vec3(.62+.55*winterDetail),winterTexel.a);
 #endif`);};material.customProgramCacheKey=()=> 'alpine-winter-suit-v3';n.material=material;
 });
 snowboard(color,root);const shadow=mesh(new T.PlaneGeometry(1.3,2.7),basic({map:contactTex,transparent:true,depthWrite:false,opacity:.55}),scene);shadow.rotation.x=-Math.PI/2-Math.atan(profile.slope);shadow.castShadow=false;shadow.receiveShadow=false;scene.add(root);
 const chestBase=chest.quaternion.clone(),head=find('Head'),headBase=head.quaternion.clone(),helmetRig=new T.Group();root.add(helmetRig);helmetRig.position.copy(wp(head));
 const shell=mat('#e5ecee',{roughness:.28,metalness:.12}),rubber=mat('#13202c',{roughness:.8}),lens=mat('#f5bd54',{metalness:.4,roughness:.14,emissive:'#c27a1b',emissiveIntensity:.35});
 const mask=mesh(new T.SphereGeometry(1,20,14),rubber,helmetRig,.005,.065,0);mask.scale.set(.105,.12,.10);
 const helmet=mesh(new T.SphereGeometry(.145,28,18,0,Math.PI*2,0,Math.PI*.68),shell,helmetRig,0,.13,0);helmet.scale.set(.94,1,.81);
 const band=mesh(new T.TorusGeometry(.124,.012,6,36),rubber,helmetRig,0,.14,0);band.rotation.x=Math.PI/2;
 const rim=mesh(new T.CylinderGeometry(.129,.129,.084,24,1,true,Math.PI/2-.89,1.78),rubber,helmetRig,0,.145,0);rim.material.side=T.DoubleSide;
 const glass=mesh(new T.CylinderGeometry(.132,.132,.060,24,1,true,Math.PI/2-.85,1.7),lens,helmetRig,0,.145,0);glass.material.side=T.DoubleSide;
 for(const z of [-.065,-.022,.022,.065]){const vent=box(.065,.007,.011,rubber,helmetRig,-.015,.271,z);vent.rotation.z=.04;}
 root.updateMatrixWorld(true);head.attach(helmetRig);
 const chestRest=chest.quaternion.clone(),spineRest=spine.quaternion.clone(),hipsRest=hips.position.clone(),footQ={L:legs.L[2].getWorldQuaternion(new T.Quaternion()),R:legs.R[2].getWorldQuaternion(new T.Quaternion())},worldTarget=new T.Vector3(),worldPole=new T.Vector3(),qRoot=new T.Quaternion();let lastPose=-Infinity;
 const localWorld=(x,y,z)=>root.localToWorld(new T.Vector3(x,y,z));
 return {root,body,shadow,pose(time,lean,air,impact=0,grab=0){
  if(id!=='player'&&time>=lastPose&&time-lastPose<1/30)return;lastPose=time;
  const tuck=air>0?.18:0,compression=Math.max(0,impact)*.13+Math.abs(lean)*.055;
  body.position.y=.12;hips.position.copy(hipsRest);chest.quaternion.copy(chestRest);spine.quaternion.copy(spineRest);root.updateMatrixWorld(true);
  hips.position.copy(hips.parent.worldToLocal(localWorld(.02,.93-compression-tuck*.35-grab*.15,0)));root.updateMatrixWorld(true);qRoot.copy(root.getWorldQuaternion(new T.Quaternion()));
  for(const side of ['L','R']){const z=sign[side];ik(legs[side],localWorld(.015,.24+tuck*.15,z*.33),localWorld(.7,.55-compression,z*.3));setWorldQ(legs[side][2],qRoot.clone().multiply(footQ[side]));const reach=z>0?grab:0;ik(arms[side],localWorld((.3+Math.abs(lean)*.09)*(1-reach)+.13*reach,(air>0?1.23:1.03+z*lean*.14)*(1-reach)+.30*reach,z*(air>0?.62:.46)*(1-reach)+.24*reach),localWorld(.7,1.15-reach*.36,z*.4));}
  chest.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),lean*.2));head.quaternion.copy(headBase).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-.4+lean*.12));
 }};
}

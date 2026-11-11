// racing-look-v1: Formula 1 trackside for the three F1 circuits (track.f1): red/white kerb paint is in racing-view, this adds run-off asphalt and gravel,
// tyre barriers on the outside of corners, a pit building with a pit wall and pit lane, marshal posts and the start-gantry lights.
// Five draw calls, about 6K triangles, no textures, no brands. ?racingLook=0 (or config.racingLook.enabled=false) never creates it.
export function racingLookEnabled(search=globalThis.location?.search||''){return new URLSearchParams(search).get('racingLook')!=='0';}

export function createRacingF1({T,scene,track,keep,night=false}){
 const root=new T.Group();root.name='racing-f1';scene.add(root);
 const half=track.width/2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 // curvature every 6 m: which side is the outside of a corner, and how sharp
 const step=6,n=Math.floor(track.length/step),turn=[];
 for(let i=0;i<n;i++){const a=track.sample(i*step),b=track.sample(i*step+step);turn.push(wrap(b.heading-a.heading));}
 const at=(s,lane,y=0)=>{const p=track.sample(s);return {x:p.x+p.normal.x*lane,y:p.y+y,z:p.z+p.normal.z*lane,heading:p.heading,p};};
 // ribbons: run-off (asphalt, dark) and gravel trap, both sides, sampled every 6 m (about 750 triangles each)
 function ribbon(inner,outer,color,offset,roughness=.95,range=null,onlySide=0){
  const pos=[],uv=[],ind=[],i0=range?Math.floor(range[0]/step):0,i1=range?Math.floor(range[1]/step):n;for(let i=i0;i<=i1;i++){const s=i*step;for(const side of [-1,1]){const a=at(s,side*inner),b=at(s,side*outer);pos.push(a.x,a.y+offset,a.z,b.x,b.y+offset-.05,b.z);uv.push(inner/4,s/4,outer/4,s/4);}}
  // vertex layout per step: [left-inner,left-outer,right-inner,right-outer]
  for(let i=0;i<i1-i0;i++){const j=i*4;for(const o of onlySide===0?[0,2]:onlySide<0?[0]:[2]){const a=j+o,b=j+o+1,c=j+4+o,d=j+5+o;ind.push(a,b,c,b,d,c);}}
  const g=keep(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeVertexNormals();
  const m=keep(new T.MeshStandardMaterial({color,roughness,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  const o=new T.Mesh(g,m);o.receiveShadow=true;root.add(o);return o;
 }
 const ribbons={runoff:ribbon(half+.9,half+4.6,night?'#4d5156':'#767b80',-.012),gravel:ribbon(half+4.6,half+9.5,night?'#8f8368':'#c9b98e',-.03)};
 // one instanced mesh of unit boxes (pit building, wall, doors, towers) and one of tyre stacks
 const unit=keep(new T.BoxGeometry(1,1,1)),tyreGeo=keep(new T.CylinderGeometry(.5,.5,1,8));
 const boxes=[],tyres=[],lights=[];
 let tag=null;const box=(s,lane,y,w,h,d,color,rot=0)=>{const q=at(s,lane,y);boxes.push({x:q.x,y:q.y,z:q.z,rot:q.heading+rot,w,h,d,color,tag});};
 // pit building along the start straight on the side opposite to the first grandstand, behind a pit wall. racing-deep-m2: along the circuit's main straight when
 // createTrack found one (the Codex circuits: 230-300 m, the line at 62% of it), otherwise s = -60 .. 150 m as before.
 const main=track.mainStraight&&track.mainStraight.length>=150?track.mainStraight:null;
 const side=-1,toward=-side,len=main?Math.min(260,main.length-24):210,S0=main?(main.from+12+track.length)%track.length:track.length-60,lane=side*(half+34);
 const buildingCentre=(S0+len/2)%track.length;
 tag='pit';
 box(buildingCentre,lane,3,9,6,len,'#cfd5d8');                    // body
 box(buildingCentre,lane+toward*4.6,6.4,3.4,.5,len,'#2b3338');     // roof overhang toward the track
 box(buildingCentre,lane+toward*4.55,3.6,.3,1.5,len*.97,'#25465a'); // glass band
 for(let k=0;k<10;k++){const s=(S0+12+k*(len-24)/9)%track.length,colors=['#c9473f','#2f6c8f','#e0b23a','#3f8d6a','#8a5aa6'];box(s,lane+toward*4.55,1.5,.3,2.6,12,colors[k%5]);} // garage doors
 tag=null;
 box(buildingCentre,side*(half+11.5),.55,.6,1.1,len,'#d9dcda');       // pit wall
 box(buildingCentre,side*(half+11.5),1.35,.5,.5,len,'#a9262d');      // wall stripe
 for(const s of [S0+30,S0+110,S0+190]){box(s%track.length,side*(half+10.7),2.2,1.2,2.4,1.2,'#e8e8e6');box(s%track.length,side*(half+10.7),3.6,2.2,.35,2.2,'#25465a');} // signal gantry posts
 ribbons.pit=ribbon(half+4.8,half+10.4,night?'#5b6065':'#9aa0a4',.0,.9,[S0-12,S0+len+12],-1);   // pit lane (one side), lies over the gravel
 box(buildingCentre,-(half+7.6),.01,.35,.02,len,'#f2f2ee');   // pit lane line
 // marshal posts and a judges' tower on the opposite side of the start
 for(const [s,l] of [[track.length*.25,half+11],[track.length*.5,-(half+11)],[track.length*.75,half+11]]){box(s,l,1.6,3,3.2,3,'#e8e8e6');box(s,l,3.5,3.6,.4,3.6,'#a9262d');}
 tag='tower';box(30,-side*(half+20),6,6,12,10,'#cfd5d8');box(30,-side*(half+20),12.4,7,.6,11,'#2b3338');tag=null;
 // tyre barriers on the outside of every corner that turns more than 0.2 rad over 36 m
 const palette=['#a9262d','#f2f2ee','#2f6c8f'];let tyreCount=0;
 for(let i=2;i<n-6&&tyreCount<150;i+=3){let sum=0;for(let j=0;j<6;j++)sum+=turn[(i+j)%n];if(Math.abs(sum)<.2)continue;
  const out=sum>0?-1:1,q=at(i*step+3,out*(half+3.4));if(buildingCentre&&Math.abs(((i*step-buildingCentre+track.length*1.5)%track.length)-track.length/2)<len/2+20)continue;
  for(let k=0;k<2;k++)tyres.push({x:q.x+q.p.tangent.x*k*1.0,y:q.y,z:q.z+q.p.tangent.z*k*1.0,h:.5+k*.45,color:palette[(tyreCount+k)%3]});tyreCount++;}
 // racing-deep-m2: pit entry and exit kerbs (short white blocks on the pit side) so the lane reads as a pit lane from the road
 for(const s of [S0-6,S0+len+6]){box((s+track.length)%track.length,side*(half+5.2),.12,.4,.24,10,'#f2f2ee');}
 // start gantry lights: five red lamps over the line, 6.4 m up (emissive, the only lit items)
 for(let k=-2;k<=2;k++){const q=at(0,k*3.2,6.4);lights.push({x:q.x,y:q.y,z:q.z,rot:q.heading});}
 const dummy=new T.Object3D(),color=new T.Color();
 const boxMesh=new T.InstancedMesh(unit,keep(new T.MeshStandardMaterial({color:'#ffffff',roughness:.8})),boxes.length);
 boxes.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(0,b.rot,0);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();boxMesh.setMatrixAt(i,dummy.matrix);boxMesh.setColorAt(i,color.set(b.color));});
 const tyreMesh=new T.InstancedMesh(tyreGeo,keep(new T.MeshStandardMaterial({color:'#ffffff',roughness:.7})),tyres.length);
 tyres.forEach((t,i)=>{dummy.position.set(t.x,t.y+t.h/2,t.z);dummy.rotation.set(0,0,0);dummy.scale.set(.95,t.h,.95);dummy.updateMatrix();tyreMesh.setMatrixAt(i,dummy.matrix);tyreMesh.setColorAt(i,color.set(t.color));});
 const lampMesh=new T.InstancedMesh(unit,keep(new T.MeshStandardMaterial({color:'#401010',emissive:'#ff2a1a',emissiveIntensity:night?1.6:.9})),lights.length);
 lights.forEach((l,i)=>{dummy.position.set(l.x,l.y,l.z);dummy.rotation.set(0,l.rot,0);dummy.scale.set(1.1,.7,.5);dummy.updateMatrix();lampMesh.setMatrixAt(i,dummy.matrix);});
 for(const m of [boxMesh,tyreMesh,lampMesh]){m.castShadow=false;m.receiveShadow=true;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();root.add(m);}
 boxMesh.castShadow=true;
 keep(boxMesh);keep(tyreMesh);keep(lampMesh);
 const triangles=root.children.reduce((t,o)=>t+(o.isInstancedMesh?o.count:1)*((o.geometry.index?.count??o.geometry.attributes.position.count)/3),0);
 /** racing-env-v2: the Codex GLB models replace the procedural pit building, judges' tower and start lamps (their instances are scaled to zero / hidden). */
 function useModels(){boxes.forEach((b,i)=>{if(b.tag){dummy.position.set(0,-50,0);dummy.rotation.set(0,0,0);dummy.scale.set(0,0,0);dummy.updateMatrix();boxMesh.setMatrixAt(i,dummy.matrix);}});boxMesh.instanceMatrix.needsUpdate=true;lampMesh.visible=false;}
 return {root,at,half,turn,step,n,useModels,ribbons,pitSpan:[S0,len],metrics:()=>({triangles,draws:root.children.length,boxes:boxes.length,tyreStacks:tyres.length}),dispose(){root.removeFromParent();for(const m of [boxMesh,tyreMesh,lampMesh])m.dispose?.();}};
}

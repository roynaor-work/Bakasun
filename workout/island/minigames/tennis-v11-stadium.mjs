/** Tennis v11 stadium dressing: evening sky, lit city blocks and trees, brand-free sponsor boards, floodlight glow and a second, cheap
 * layer of billboard fans between the 3D spectators (about 450 quads = under 1k triangles, no download: every texture is painted
 * on a canvas). It is an upgrade, never a requirement: ?tennisStadium=0, a missing canvas or any error leaves the v7 venue as it was.
 * Pure helper (fanSlots) takes no three.js so node tests can run them. */
export function seededRandom(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
/** Midpoints between neighbours of the same row: new fans stand in the gaps the 3D crowd leaves. */
export function fanSlots(spectators,{maxGap=1.25,minGap=.55}={}){
 const rows=new Map();for(const s of spectators){const key=s.sec+':'+s.row+':'+s.y.toFixed(2);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(s);}
 const slots=[];
 for(const list of rows.values()){
  // along the row = the axis with the larger spread
  const sx=Math.max(...list.map(s=>s.x))-Math.min(...list.map(s=>s.x)),sz=Math.max(...list.map(s=>s.z))-Math.min(...list.map(s=>s.z)),axis=sx>=sz?'x':'z';
  list.sort((a,b)=>a[axis]-b[axis]);
  for(let i=0;i+1<list.length;i++){const a=list[i],b=list[i+1],gap=Math.hypot(a.x-b.x,a.z-b.z);
   if(gap>=minGap&&gap<=maxGap)slots.push({x:(a.x+b.x)/2,y:a.y,z:(a.z+b.z)/2,yaw:a.yaw,id:a.id*31+b.id});}
 }
 return slots;
}
const SPONSORS=['CITY CUP','NORTH BANK','TENNIS ISLAND','SUN & SEA','ISLAND OPEN','GRAND COURT'];
export async function createTennisV11Stadium({T,scene,renderer,hemi,sun,keep,v7,params,config}){
 if(params?.get?.('tennisStadium')==='0'||!v7?.spectators||typeof document==='undefined')return null;
 const group=new T.Group();group.name='tennis-v11-stadium';const disposables=[];
 const track=o=>{disposables.push(o);return o;};
 const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 const r=seededRandom(config.seed||4107);
 // 1. Evening sky and soft warm light.
 const sky=canvas(8,256),sg=sky.getContext('2d'),grad=sg.createLinearGradient(0,0,0,256);
 grad.addColorStop(0,'#26366a');grad.addColorStop(.45,'#6b78b0');grad.addColorStop(.75,'#e8a98a');grad.addColorStop(1,'#f6d6a8');sg.fillStyle=grad;sg.fillRect(0,0,8,256);
 const skyTexture=track(new T.CanvasTexture(sky));skyTexture.colorSpace=T.SRGBColorSpace;scene.background=skyTexture;
 scene.fog?.color.set('#d9c0b0');
 hemi.color.set('#d6def2');hemi.groundColor.set('#8c7457');hemi.intensity=1.25;sun.color.set('#ffd7a6');sun.intensity=2.35;sun.position.set(-13,15,9);renderer.toneMappingExposure=1.05;
 // 2. City blocks and trees on the ground beyond the stands (the camera looks down, so a sky-high backdrop would never be seen).
 const wt=canvas(64,128),wg=wt.getContext('2d');wg.fillStyle='#39425f';wg.fillRect(0,0,64,128);
 for(let y=6;y<124;y+=12)for(let x=5;x<60;x+=11){wg.fillStyle=r()<.34?(r()<.8?'#ffd98a':'#fff1c4'):'#2b324d';wg.fillRect(x,y,6,7);}
 const windowTexture=track(new T.CanvasTexture(wt));windowTexture.colorSpace=T.SRGBColorSpace;windowTexture.wrapS=windowTexture.wrapT=T.RepeatWrapping;
 const blockCount=40,blocks=new T.InstancedMesh(track(new T.BoxGeometry(1,1,1)),track(new T.MeshLambertMaterial({map:windowTexture,emissive:'#ffffff',emissiveMap:windowTexture,emissiveIntensity:.35})),blockCount),m4=new T.Matrix4(),q=new T.Quaternion(),col=new T.Color();
 const onRing=(i,n)=>{const a=-Math.PI*.95+(i/n)*Math.PI*1.9,rad=44+r()*16;return [Math.sin(a)*rad*1.15,-Math.cos(a)*rad];};
 for(let i=0;i<blockCount;i++){const [x,z]=onRing(i,blockCount),w=3+r()*4,h=7+r()*16,d=3+r()*4;m4.compose(new T.Vector3(x,h/2-1,z),q.setFromAxisAngle(new T.Vector3(0,1,0),r()*3),new T.Vector3(w,h,d));blocks.setMatrixAt(i,m4);blocks.setColorAt(i,col.setHSL(.6+r()*.08,.18,.55+r()*.25));}
 blocks.frustumCulled=false;group.add(blocks);
 const treeCount=36,trunks=new T.InstancedMesh(track(new T.CylinderGeometry(.25,.35,2,4)),track(new T.MeshLambertMaterial({color:'#6b4a33'})),treeCount),crowns=new T.InstancedMesh(track(new T.ConeGeometry(1.5,4.2,5)),track(new T.MeshLambertMaterial({color:'#2f6a49'})),treeCount);
 for(let i=0;i<treeCount;i++){const a=r()*Math.PI*2,rad=36+r()*12,x=Math.sin(a)*rad*1.2,z=-Math.cos(a)*rad,sc=.55+r()*.5;
  m4.compose(new T.Vector3(x,1*sc,z),q.identity(),new T.Vector3(sc,sc,sc));trunks.setMatrixAt(i,m4);m4.compose(new T.Vector3(x,(2+2.5)*sc,z),q.identity(),new T.Vector3(sc,sc,sc));crowns.setMatrixAt(i,m4);crowns.setColorAt(i,col.setHSL(.36+r()*.05,.4,.22+r()*.12));}
 trunks.frustumCulled=crowns.frustumCulled=false;group.add(trunks,crowns);
 // 3. Sponsor boards: invented names only.
 const bt=canvas(1024,128),bg=bt.getContext('2d');bg.fillStyle='#143d41';bg.fillRect(0,0,1024,128);bg.font='700 64px sans-serif';bg.textAlign='center';bg.textBaseline='middle';
 SPONSORS.forEach((name,i)=>{const x=i*170+85;bg.fillStyle=i%2?'#ffd16f':'#f3f4dc';bg.fillText(name.length>10?name.slice(0,10):name,x,66,160);bg.fillStyle='#ffffff40';bg.fillRect(i*170+168,12,3,104);});
 const boardTexture=track(new T.CanvasTexture(bt));boardTexture.colorSpace=T.SRGBColorSpace;
 const boardMaterial=track(new T.MeshBasicMaterial({map:boardTexture,fog:false}));
 const boardGeometry=track(new T.PlaneGeometry(6,.8));
 const e=config.render.environment;
 for(let i=0;i<4;i++){const board=new T.Mesh(boardGeometry,boardMaterial);board.position.set((i-1.5)*6.1,.5,-(e.crowdEndZ-3.1));board.rotation.y=0;board.material.map.repeat.set(1,1);group.add(board);}
 // 4. Floodlight glow.
 const gl=canvas(64,64),gx=gl.getContext('2d'),gg=gx.createRadialGradient(32,32,0,32,32,32);gg.addColorStop(0,'rgba(255,244,214,.95)');gg.addColorStop(.3,'rgba(255,226,170,.45)');gg.addColorStop(1,'rgba(255,220,160,0)');gx.fillStyle=gg;gx.fillRect(0,0,64,64);
 const glowTexture=track(new T.CanvasTexture(gl)),glowMaterial=track(new T.SpriteMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false}));
 for(const [x,z] of [[-12,-14],[12,-14],[-12,13],[12,13]]){const s=new T.Sprite(glowMaterial);s.position.set(x,17,z);s.scale.setScalar(9);group.add(s);}
 // 5. Billboard fans between the 3D spectators.
 const slots=fanSlots(v7.spectators),floor=v7.floorOffset??.08;
 if(slots.length){
  const atlas=canvas(512,128),ag=atlas.getContext('2d'),shirts=['#d9534f','#f0b429','#3b8fd1','#5aa87a','#9b6fb5','#f3f1e4','#e07b39','#2f7d7a'];
  shirts.forEach((shirt,i)=>{const cx=i*64+32,up=i%3===0;
   ag.fillStyle='#00000000';ag.fillStyle=['#5a3b28','#2c2118','#8a6a3f','#c7a46a','#40291c'][i%5];ag.beginPath();ag.arc(cx,36,14,0,Math.PI*2);ag.fill();
   ag.fillStyle=['#f1c9a1','#d9a47a','#b97c55','#8a5a3a'][i%4];ag.beginPath();ag.arc(cx,40,12,0,Math.PI*2);ag.fill();
   ag.fillStyle=shirt;ag.beginPath();ag.moveTo(cx-24,128);ag.quadraticCurveTo(cx-24,62,cx,60);ag.quadraticCurveTo(cx+24,62,cx+24,128);ag.fill();
   if(up){ag.strokeStyle=shirt;ag.lineWidth=7;ag.lineCap='round';ag.beginPath();ag.moveTo(cx-18,84);ag.lineTo(cx-22,40);ag.moveTo(cx+18,84);ag.lineTo(cx+22,40);ag.stroke();}});
  const atlasTexture=track(new T.CanvasTexture(atlas));atlasTexture.colorSpace=T.SRGBColorSpace;
  const positions=new Float32Array(slots.length*12),uvs=new Float32Array(slots.length*8),indices=new Uint32Array(slots.length*6),w=.62,h=1.1;
  slots.forEach((s,i)=>{const cell=(s.id%8+8)%8,u0=cell/8,u1=(cell+1)/8,c=Math.cos(s.yaw),sn=Math.sin(s.yaw),y0=s.y+floor-.12;
   const corner=(dx,dy)=>[s.x+dx*c,y0+dy,s.z-dx*sn];
   const pts=[corner(-w/2,0),corner(w/2,0),corner(w/2,h),corner(-w/2,h)];
   pts.forEach((p,k)=>positions.set(p,i*12+k*3));uvs.set([u0,0,u1,0,u1,1,u0,1],i*8);indices.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);});
  const geometry=track(new T.BufferGeometry());geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setIndex(new T.BufferAttribute(indices,1));
  const material=track(new T.MeshLambertMaterial({map:atlasTexture,transparent:true,alphaTest:.4,side:T.DoubleSide}));
  const fans=new T.Mesh(geometry,material);fans.frustumCulled=false;fans.name='Fans_v11';group.add(fans);
 }
 scene.add(group);
 const metrics={fans:slots.length,triangles:slots.length*2+blockCount*12+treeCount*(8+10)};
 return {group,metrics,dispose(){scene.remove(group);for(const d of disposables)d.dispose?.();}};
}

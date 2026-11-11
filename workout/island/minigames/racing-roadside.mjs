/** Original roadside architecture; all dimensions are world metres. No model assets. */
export function createRacingRoadside({T,parent,track,colors,keep,material,ground,seed=1}){
 const themes={
  coast:{wall:'#d9cbb0',roof:'#a26c54',trim:'#577f80',glass:'#315c66',barrier:'#a7afa0'},
  jungle:{wall:'#73806a',roof:'#4e6854',trim:'#927d58',glass:'#294943',barrier:'#727c68'},
  volcano:{wall:'#89837a',roof:'#424c52',trim:'#d69547',glass:'#344b52',barrier:'#8b8273'},
  harbor:{wall:'#aab9b5',roof:'#607c87',trim:'#397387',glass:'#294b5b',barrier:'#a7b1aa'},
  summit:{wall:'#c3c9bf',roof:'#5d707a',trim:'#728b92',glass:'#355469',barrier:'#acb7b3'},
  ruins:{wall:'#bba98b',roof:'#8f7e65',trim:'#988064',glass:'#5d6656',barrier:'#b7a58a'}
 },palette=themes[track.theme]||themes.coast,root=new T.Group();root.name='racing-roadside';parent.add(root);
 let word=(seed>>>0)^0x5ca1e9,quality=0,disposed=false;const random=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);
 const rows={masonry:[],metal:[],glass:[],light:[],round:[],roof:[],pool:[]},batches=[],dummy=new T.Object3D();let buildings=0,galleries=0,lamps=0,guardrailSections=0,cornerSigns=0,barrierSections=0;
 const box=(bucket,site,x,y,z,w,h,d,color,detail=0,rz=0)=>{
  const ca=Math.cos(site.angle),sa=Math.sin(site.angle);rows[bucket].push({x:site.x+ca*x+sa*z,y:site.y+y,z:site.z-sa*x+ca*z,sx:w,sy:h,sz:d,angle:site.angle,rz,color,detail});
 };
 const round=(site,x,y,z,w,h,color,detail=0)=>box('round',site,x,y,z,w,h,w,color,detail);
 const valid=(site,radius)=>track.project(site.x,site.z).distance>track.width/2+radius+1;
 const clear=(site,hx,hz,margin)=>{const ca=Math.cos(site.angle),sa=Math.sin(site.angle);return [[-hx,-hz],[hx,-hz],[-hx,hz],[hx,hz]].every(([x,z])=>track.project(site.x+ca*x+sa*z,site.z-sa*x+ca*z).distance>track.width/2+margin);};
 const siteAt=(s,lane,angleOffset=0)=>{const p=track.sample(s);return {x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,angle:p.heading+angleOffset,p};};
 // Buildings face the road. Their complete footprints stay beyond its shoulder.
 for(const [index,fraction]of [.075,.235,.415,.635,.865].entries()){
  const side=index%2?1:-1,site=siteAt(track.length*fraction,side*(track.width/2+19+random()*5),side*Math.PI/2);
  const large=track.theme==='harbor',w=large?17:track.theme==='jungle'?8.5:11,d=large?9:7,h=large?6.6:track.theme==='summit'?5.1:4.2;
  if(!valid(site,Math.hypot(w/2+1,d/2+4)))continue;site.y=ground(site.x,site.z);buildings++;
  box('masonry',site,0,.25,0,w+1,.5,d+1,palette.barrier);
  if(track.theme==='ruins'){
   box('masonry',site,0,1.5,d*.35,w,3,.7,palette.wall);for(const x of [-w*.42,0,w*.42])round(site,x,2.7,-d*.28,.7,5.4,palette.wall);
   box('masonry',site,0,5.5,0,w+1,.7,d+1,palette.wall);box('roof',site,0,6.2,0,w+1.7,1.2,d+1.8,palette.roof);
  }else{
   box('masonry',site,0,h/2+.5,0,w,h,d,palette.wall);
   if(track.theme==='volcano')box('metal',site,0,h+.65,0,w+1,.3,d+1,palette.roof);
   else box('roof',site,0,h+1.1,0,w+1.8,track.theme==='summit'?2.4:1.6,d+1.8,palette.roof);
   const paneCount=large?5:4;for(let i=0;i<paneCount;i++){
    const x=(i-(paneCount-1)/2)*w/(paneCount+.5);box('glass',site,x,h*.65,-d/2-.035,w/(paneCount+1.8),1.35,.07,palette.glass);
    box('metal',site,x,h*.65+.73,-d/2-.09,w/(paneCount+1.6),.09,.11,palette.trim,1);
   }
   box('metal',site,0,1.8,-d/2-.09,large?4.3:1.5,2.7,.12,palette.trim);
   if(track.theme==='coast'||track.theme==='jungle'){
    box('roof',site,0,3.55,-d/2-1.45,w+1,.35,3.2,palette.roof);
    for(const x of [-w*.43,w*.43])round(site,x,1.9,-d/2-2.5,.17,3.3,palette.trim);
    box('metal',site,0,.9,-d/2-2.7,w,.12,.16,palette.trim,1);
   }
   if(track.theme==='volcano'){
    for(const x of [-3,0,3]){box('metal',site,x,h+1.1,1,1.6,.7,1.7,palette.roof,1);round(site,x,h+1.7,1,.6,1,palette.trim,1);}
    for(let i=0;i<5;i++)box('light',site,-1.7+i*.85,3.35,-d/2-.18,.45,.17,.05,'#edbf71',1);
   }
   if(large){
    box('metal',site,0,4.6,-d/2-2.3,w+3,.25,4.7,palette.roof);
    for(const x of [-w*.51,w*.51])round(site,x,2.5,-d/2-3.7,.26,4.8,palette.trim);
    for(const x of [-w*.35,w*.35])box('masonry',site,x,1.3,d/2+2,3,2,3,palette.trim,1);
   }
  }
  // Cornices and service bays give the flat surfaces a readable human scale.
  box('metal',site,0,.65,-d/2-.1,w,.18,.17,palette.trim);
  for(const x of [-w/2,w/2])box('masonry',site,x,1.15,-d/2-1,1.1,1.3,1.1,palette.barrier,1);
  box('light',site,0,3.8,-d/2-.16,1.3,.12,.08,'#f5d7a1',1);
 }
 // racing-deep-m2: the Codex circuits are 2.1-2.35 km with many bends; barrier and guardrail spacing stretch with the length over 1.9 km so the scenery stays
 // inside its triangle budget (30K at quality 0, 12K at quality 2) on every circuit.
 const stretch=Math.max(1,track.length/1750);
 // racing-v9: a continuous low barrier on both edges (inner face 1.2 m from the asphalt) is the wall the car bounces off.
 for(let s=2;s<track.length;s+=8.4*stretch)for(const side of [-1,1]){const site=siteAt(s,side*(track.width/2+1.45)),base=ground(site.x,site.z);
  if(!valid(site,.3))continue;
  // all four corners of the beam must stay beyond the shoulder, so a tight bend never pushes it onto the asphalt
  const beam=8.5*stretch,ca=Math.cos(site.angle),sa=Math.sin(site.angle);if([[-.25,-beam/2],[.25,-beam/2],[-.25,beam/2],[.25,beam/2]].some(([x,z])=>track.project(site.x+ca*x+sa*z,site.z-sa*x+ca*z).distance<=track.width/2+.65))continue;
  site.y=site.p.y;barrierSections++;
  box('masonry',site,0,.45,0,.5,.9,beam,palette.barrier,1);if(base<site.p.y-.3)box('masonry',site,0,(base-site.p.y)/2+.2,0,.45,site.p.y-base,beam,palette.barrier,1);
 }
 // racing-v10 Formula 1 circuits: a stepped grandstand with a roof on each side of the start straight and colour boards (no brands) behind the barrier.
 if(track.f1){
  const rowColors=['#c9473f','#e8d8a6','#2f6c8f','#e8d8a6'];
  for(const [side,from] of [[1,-30],[-1,40]]){
   const site=siteAt((from+track.length)%track.length,side*(track.width/2+17),side>0?-Math.PI/2:Math.PI/2);if(!clear(site,8,36,4))continue;
   for(let row=0;row<4;row++)box('masonry',site,0,.6+row*1.1,-row*1.6,5.2,1.2+row*1.1,70,rowColors[row],1);
   box('roof',site,0,7.4,-5.4,8.5,1.2,72,palette.roof,1);box('metal',site,0,4,-7.6,.3,8,72,palette.trim,1);
  }
  const boards=['#2f6c8f','#c9473f','#e0b23a','#3f8d6a','#8a5aa6'];
  for(let i=0;i<10;i++){const s=(track.length-70+i*16)%track.length,side=i%2?1:-1,site=siteAt(s,side*(track.width/2+2.3));if(!clear(site,.2,6,.9))continue;site.y=site.p.y;box('masonry',site,0,1.5,0,.18,1.3,12,boards[i%boards.length],1);}
 }
 // Retaining walls and two-height steel rails follow the outside of risky bends.
 for(let s=8;s<track.length;s+=6*stretch){const p=track.sample(s),next=track.sample(s+17),turn=Math.atan2(Math.sin(next.heading-p.heading),Math.cos(next.heading-p.heading));
  if(Math.abs(turn)<.16&&Math.abs(p.tangent.y)<.044)continue;
  const side=turn>.04?-1:turn<-.04?1:Math.floor(s/6)%2?1:-1,site=siteAt(s,side*(track.width/2+2.65));if(!valid(site,.25))continue;
  // racing-deep-m2: the chicanes of the Codex circuits bend down to a 7 m radius; the ends of a straight 6 m beam placed on such a bend reached the asphalt, so every corner is checked
  {const ca=Math.cos(site.angle),sa=Math.sin(site.angle);if([[-.3,-3.1],[.3,-3.1],[-.3,3.1],[.3,3.1]].some(([x,z])=>track.project(site.x+ca*x+sa*z,site.z-sa*x+ca*z).distance<=track.width/2+.65))continue;}
  const base=ground(site.x,site.z),height=Math.max(1.1,p.y+.5-base);site.y=p.y;guardrailSections++;
  box('masonry',site,0,base-p.y+height/2,0,.55,height,6.15,palette.barrier,Math.floor(s/6)%2?1:0);
  for(const y of [.78,1.16])box('metal',site,0,y,0,.16,.18,6.2,palette.trim);
  round(site,0,.52,0,.14,1.8,palette.trim,Math.floor(s/6)%2?1:0);
  box('light',site,-side*.12,1.16,0,.06,.12,.7,'#e9d195',1);
 }
 // Large, properly supported chevrons read before a corner reaches the camera.
 for(let s=24;s<track.length&&cornerSigns<10;s+=42){const p=track.sample(s),next=track.sample(s+24),turn=Math.atan2(Math.sin(next.heading-p.heading),Math.cos(next.heading-p.heading));if(Math.abs(turn)<.28)continue;
  const side=turn>0?-1:1,site=siteAt(s,side*(track.width/2+4.8));if(!valid(site,1.8))continue;cornerSigns++;site.y=p.y;
  box('masonry',site,0,3.8,0,5.2,1.85,.22,'#244249');const bottom=ground(site.x,site.z)-p.y,height=4.3-bottom;
  for(const x of [-2.05,2.05])round(site,x,bottom+height/2,0,.16,height,palette.trim);
  for(const x of [-1.55,0,1.55])for(const arm of [-1,1])box('light',site,x+side*.2,3.8+arm*.28,-.16,.19,1.02,.07,'#f2d28b',0,arm*-side*Math.PI/4);
 }
 // Repeated lampposts provide near-road motion and a useful night-time silhouette.
 const night=track.stage?.timeOfDay==='night';for(let index=0;index<32;index++){
  const s=(index+.5)*track.length/32;
  // racing-deep-m2: on a tight bend a post 3.6 m off the centre line projects to a different s (up to 12 m away on the Codex chicanes); take the side, or a small shift
  // along the road, where the post really stands at its station, so the 32 lamps keep their uniform spacing
  let side=index%2?1:-1,site=null;
  for(const [ds,sd] of [[0,side],[0,-side],[3,side],[-3,side],[3,-side],[-3,-side],[6,side],[-6,side]]){const c=siteAt(s+ds,sd*(track.width/2+3.6));if(valid(c,.5)&&Math.abs(((track.project(c.x,c.z).s-s+track.length*1.5)%track.length)-track.length/2)<2.5){site=c;side=sd;break;}}
  if(!site)continue;site.y=site.p.y;lamps++;
  const detail=index%2?1:0,base=ground(site.x,site.z)-site.y,height=Math.max(7.2,7.2-base);
  round(site,0,base+height/2,0,.19,height,palette.trim,detail);round(site,0,base+.23,0,.55,.46,palette.barrier,detail);
  box('metal',site,-side*1.1,7.15,0,2.4,.16,.22,palette.trim,detail);
  box('metal',site,-side*2.1,7.02,0,1.3,.21,.8,palette.roof,detail);
  box('light',site,-side*2.1,6.9,0,1.12,.08,.66,'#ffe4b2',detail);
  if(night)box('pool',site,-side*4,.095,0,5.7,1,8.2,'#f6d9a2',1);
 }
 // Open galleries are tall enough for the race camera and never seal the route.
 if(track.theme==='summit'||track.theme==='volcano'||track.theme==='ruins'){
  const start=track.length*(track.theme==='summit'?.57:track.theme==='volcano'?.39:.68),segments=track.theme==='summit'?5:3;
  for(let i=0;i<segments;i++){const site=siteAt(start+i*7.3,0),half=track.width/2+2.5;
   for(const side of [-1,1])box('masonry',site,side*half,3.8,0,.65,7.6,.9,palette.wall);
   box('metal',site,0,7.8,0,track.width+5.8,.45,.8,palette.trim);
   if(track.theme==='summit')box('masonry',site,0,8.2,0,track.width+6.3,.48,7.5,palette.wall,1);
   if(i%2===0)box('light',site,0,7.5,-.45,track.width*.8,.09,.08,'#efdbb1',1);
  }galleries=1;
 }
 const unitBox=keep(new T.BoxGeometry(1,1,1)),unitRound=keep(new T.CylinderGeometry(.5,.5,1,6));
 const roof=keep(new T.BufferGeometry()),vertices=[[-.5,-.5,.5],[.5,-.5,.5],[0,.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5],[0,.5,-.5]],faces=[0,1,2,3,4,5,4,0,2,4,2,5,1,3,5,1,5,2,4,3,1,4,1,0];
 roof.setAttribute('position',new T.Float32BufferAttribute(faces.flatMap(index=>vertices[index]),3));roof.computeVertexNormals();
 const pool=keep(new T.CircleGeometry(1,16));pool.rotateX(-Math.PI/2);
 const specs={
  masonry:[unitBox,material('#ffffff',{roughness:.94}),true],metal:[unitBox,material('#ffffff',{roughness:.55,metalness:.35}),false],glass:[unitBox,material('#ffffff',{roughness:.26,metalness:.48}),false],
  light:[unitBox,material('#ffffff',{emissive:'#c89b58',emissiveIntensity:night?.65:.18,roughness:.5}),false],round:[unitRound,material('#ffffff',{roughness:.65,metalness:.18}),true],roof:[roof,material('#ffffff',{roughness:.85}),true],
  pool:[pool,material('#f6d9a2',{transparent:true,opacity:.10,depthWrite:false,emissive:'#d4ad76',emissiveIntensity:.25,side:T.DoubleSide}),false]
 };
 for(const [name,list]of Object.entries(rows)){
  list.sort((a,b)=>a.detail-b.detail);const [geometry,mat,shadow]=specs[name],inst=new T.InstancedMesh(geometry,mat,list.length);inst.name='racing-roadside-'+name;inst.castShadow=shadow;inst.receiveShadow=name!=='pool';
  list.forEach((p,index)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,p.rz||0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();inst.setMatrixAt(index,dummy.matrix);inst.setColorAt(index,new T.Color(p.color));});inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();root.add(inst);
  batches.push({inst,rows:list,triangles:(geometry.index?.count||geometry.attributes.position.count)/3});
 }
 function setQuality(value){quality=Math.max(0,Math.min(2,value|0));for(const b of batches){const first=b.rows.findIndex(p=>p.detail>2-quality);b.inst.count=first<0?b.rows.length:first;b.inst.visible=b.inst.count>0;}}
 function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const b of batches)b.inst.dispose();root.clear();}
 function metrics(){return {quality,triangles:batches.reduce((n,b)=>n+b.triangles*b.inst.count,0),draws:batches.filter(b=>b.inst.visible&&b.inst.count>0).length,instances:batches.reduce((n,b)=>n+b.inst.count,0),buildings,galleries,lamps,guardrailSections,barrierSections,cornerSigns,disposed};}
 return {setQuality,dispose,metrics};
}

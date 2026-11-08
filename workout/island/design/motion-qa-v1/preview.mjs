// SPDX-License-Identifier: CC0-1.0 — original report controls and diagnostic viewer.
import { bonesFor } from './sheets.mjs';
const $ = id => document.getElementById(id);
function initTables() {
  const body=$('clipTable')?.tBodies[0];
  if(!body) return;
  const rows=[...body.rows];
  const update=()=>{
    const term=($('search')?.value??'').trim().toLowerCase(), library=$('libraryFilter')?.value??'',sort=$('sort')?.value??'score-asc';
    const sorted=[...rows].sort((a,b)=>sort==='score-desc'?Number(b.dataset.score)-Number(a.dataset.score):sort==='name'?a.cells[0].textContent.localeCompare(b.cells[0].textContent):sort==='library'?a.dataset.library.localeCompare(b.dataset.library):Number(a.dataset.score)-Number(b.dataset.score));
    let count=0;
    for(const row of sorted){row.hidden=Boolean(library&&row.dataset.library!==library)||Boolean(term&&!row.dataset.search.toLowerCase().includes(term));if(!row.hidden)count++;body.append(row);}
    if($('visibleCount'))$('visibleCount').textContent=`${count} קליפים`;
    if($('empty'))$('empty').hidden=count!==0;
  };
  for(const id of ['search','libraryFilter','sort']) $(id)?.addEventListener('input',update);
  $('regressionsOnly')?.addEventListener('change',()=>{
    for(const row of $('compareTable').tBodies[0].rows) row.hidden=$('regressionsOnly').checked&&!(row.dataset.delta!==''&&Number(row.dataset.delta)<0);
  });
  update();
}
initTables();

async function initViewer() {
  if(!$('viewer'))return;
  const params=new URLSearchParams(location.search);
  const reportUrl=new URL(params.get('report')??'./output/report.json',location.href);
  if(reportUrl.origin!==location.origin)throw new Error('דוח התצוגה חייב להיות מקומי מאותו מקור.');
  $('reportLink').href=new URL('report.html',reportUrl).href;
  const response=await fetch(reportUrl);
  if(!response.ok)throw new Error(`לא נמצא דוח מקומי (${response.status}). הריצו תחילה את פקודת ההפקה המתועדת בהוראות.`);
  const report=await response.json();
  const libraries=report.libraries??[];
  if(!libraries.some(l=>l.clips?.length))throw new Error('הדוח אינו מכיל קליפים.');
  // Existing local Three.js module; no decoder, worker, WebAssembly or CDN.
  const THREE=await import('../soccer-motion-v8/runtime/vendor/three.module.js');
  const stage=$('stage');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor('#101d28');
  renderer.domElement.setAttribute('aria-label','שלד אבחוני תלת־ממדי של הפריים הנבחר');
  renderer.domElement.setAttribute('role','img');
  stage.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,100);
  const grid=new THREE.GridHelper(12,24,0x59768b,0x2b4052);scene.add(grid);
  const lineMaterial=new THREE.LineBasicMaterial({vertexColors:true});
  const lineGeometry=new THREE.BufferGeometry();
  const skeleton=new THREE.LineSegments(lineGeometry,lineMaterial);scene.add(skeleton);
  const jointGeometry=new THREE.BufferGeometry(),jointMaterial=new THREE.PointsMaterial({size:.035,vertexColors:true,sizeAttenuation:true});
  const points=new THREE.Points(jointGeometry,jointMaterial);scene.add(points);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({color:0xffb66b}));scene.add(ball);
  const rootMarker=new THREE.Mesh(new THREE.RingGeometry(.06,.085,24),new THREE.MeshBasicMaterial({color:0xe6d27d,side:THREE.DoubleSide}));rootMarker.rotation.x=-Math.PI/2;scene.add(rootMarker);
  let library,clip,frames=[],frameIndex=0,playing=false,lastTime=0,clock=0,loadToken=0,bounds={minX:0,maxX:0,minY:0,maxY:1.8,minZ:0,maxZ:0};
  const colors={left:new THREE.Color(0x53c3e8),right:new THREE.Color(0xbb9cf7),center:new THREE.Color(0xdce6ee),red:new THREE.Color(0xff7777)};
  const colorFor=(name,p)=>p[1]<-.005?colors.red:name.startsWith('Left')?colors.left:name.startsWith('Right')?colors.right:colors.center;
  const valid=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();renderFrame(frameIndex);}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function renderFrame(index) {
    if(!frames.length)return;
    frameIndex=Math.max(0,Math.min(frames.length-1,index));
    const frame=frames[frameIndex],joints=frame.joints??{},root=valid(frame.root)?frame.root:valid(joints.Hips)?joints.Hips:[0,0,0];
    const positions=[],lineColors=[];
    for(const [a,b] of bonesFor(joints)){positions.push(...joints[a],...joints[b]);lineColors.push(...colorFor(a,joints[a]).toArray(),...colorFor(b,joints[b]).toArray());}
    lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));lineGeometry.setAttribute('color',new THREE.Float32BufferAttribute(lineColors,3));lineGeometry.computeBoundingSphere();
    const jointPositions=[],jointColors=[];for(const [name,p] of Object.entries(joints)){if(!valid(p))continue;jointPositions.push(...p);jointColors.push(...colorFor(name,p).toArray());}
    jointGeometry.setAttribute('position',new THREE.Float32BufferAttribute(jointPositions,3));jointGeometry.setAttribute('color',new THREE.Float32BufferAttribute(jointColors,3));jointGeometry.computeBoundingSphere();
    ball.visible=valid(frame.ball);if(ball.visible){ball.position.fromArray(frame.ball);ball.scale.setScalar(clip.ballRadius??.12);}
    rootMarker.position.set(root[0],.002,root[2]);
    const follow=$('followRoot').checked,center=new THREE.Vector3(follow?root[0]:(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2,follow?root[2]:(bounds.minZ+bounds.maxZ)/2);
    const span=Math.max(clip.height??1.8,bounds.maxY-bounds.minY,follow?0:bounds.maxX-bounds.minX,follow?0:bounds.maxZ-bounds.minZ),distance=span*2.2;
    const angle=$('viewerAngle').value;
    const offset=angle==='front'?new THREE.Vector3(0,.18,1):angle==='side'?new THREE.Vector3(1,.18,0):new THREE.Vector3(.8,.35,.9);
    camera.position.copy(center).add(offset.normalize().multiplyScalar(distance));camera.lookAt(center);
    grid.position.set(center.x,0,center.z);
    renderer.render(scene,camera);
    $('timeline').value=String(frameIndex);$('time').textContent=`${Number(frame.t??0).toFixed(3)} / ${Number(clip.duration??frames.at(-1)?.t??0).toFixed(3)} s`;
  }
  function fillClips(){
    $('viewerClip').replaceChildren(...library.clips.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.id} · ${Number.isFinite(c.score)?Math.round(c.score):'—'}`;return o;}));
  }
  async function loadClip(id) {
    const token=++loadToken;playing=false;$('play').textContent='נגן';$('play').disabled=true;$('timeline').disabled=true;
    const summary=library.clips.find(c=>c.id===id)??library.clips[0];
    if(!summary)return;
    const path=summary.jsonPath??`clips/${library.id}--${summary.id}.json`,url=new URL(path,reportUrl);
    if(url.origin!==location.origin)throw new Error('נתוני קליפ חייבים להיות מקומיים.');
    const res=await fetch(url);if(!res.ok)throw new Error(`טעינת קליפ נכשלה: ${res.status}`);
    const detail=await res.json();if(token!==loadToken)return;clip={...summary,...detail};frames=clip.frames??clip.sheetFrames??[];
    if(!frames.length)throw new Error('אין דגימות שלד בנתוני הקליפ.');
    frames=frames.filter(f=>f&&Number.isFinite(f.t));if(!frames.length)throw new Error('דגימות הזמן אינן תקינות.');
    const measuredPoints=frames.flatMap(f=>[...Object.values(f.joints??{}),f.ball].filter(valid));
    if(measuredPoints.length)bounds={minX:Math.min(...measuredPoints.map(p=>p[0])),maxX:Math.max(...measuredPoints.map(p=>p[0])),minY:Math.min(0,...measuredPoints.map(p=>p[1])),maxY:Math.max(clip.height??1.8,...measuredPoints.map(p=>p[1])),minZ:Math.min(...measuredPoints.map(p=>p[2])),maxZ:Math.max(...measuredPoints.map(p=>p[2]))};
    $('timeline').max=String(frames.length-1);$('timeline').disabled=false;$('play').disabled=false;$('viewerStatus').hidden=true;
    $('sampleNote').textContent=`${frames.length} דגימות זמינות · מעבר בין פוזות מדודות בלבד, ללא המצאת פריימי ביניים.`;
    const metrics=$('viewerMetrics');metrics.replaceChildren();const title=document.createElement('strong');title.textContent=`ציון: ${Number.isFinite(clip.score)?Math.round(clip.score):'—'} מתוך 100`;metrics.append(title);
    for(const reason of (clip.reasons??[]).slice(0,5)){const p=document.createElement('p');p.textContent=typeof reason==='string'?reason:reason.message??(reason.label?`${reason.label}: ${reason.value===null?'אין די נתונים':reason.value} ${reason.unit??''}`:reason.reason??JSON.stringify(reason));metrics.append(p);}
    const links=$('viewerLinks');links.replaceChildren();for(const [label,path] of [['דוח הקליפ',summary.htmlPath??`clips/${library.id}--${summary.id}.html`],['8 פריימים',summary.sheetPath??`sheets/${library.id}--${summary.id}.svg`]]){const a=document.createElement('a');a.textContent=label;a.href=new URL(path,reportUrl).href;links.append(a);}
    frameIndex=0;clock=frames[0].t;renderFrame(0);
  }
  $('viewerLibrary').replaceChildren(...libraries.map(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=l.id;return o;}));
  const wanted=params.get('clip')??'';library=libraries.find(l=>wanted.startsWith(l.id+'--'))??libraries.find(l=>l.clips?.length);$('viewerLibrary').value=library.id;fillClips();
  const initial=library.clips.find(c=>wanted===`${library.id}--${c.id}`)??library.clips[0];$('viewerClip').value=initial.id;
  const onError=error=>{$('viewerStatus').hidden=false;$('viewerStatus').textContent=error.message;$('play').disabled=true;$('timeline').disabled=true;};
  $('viewerLibrary').addEventListener('change',()=>{library=libraries.find(l=>l.id===$('viewerLibrary').value);fillClips();loadClip($('viewerClip').value).catch(onError);});
  $('viewerClip').addEventListener('change',()=>loadClip($('viewerClip').value).catch(onError));
  for(const id of ['viewerAngle','followRoot'])$(id).addEventListener('change',()=>renderFrame(frameIndex));
  $('timeline').addEventListener('input',()=>{playing=false;$('play').textContent='נגן';renderFrame(Number($('timeline').value));clock=frames[frameIndex]?.t??0;});
  $('play').addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?'עצור':'נגן';clock=frames[frameIndex]?.t??0;lastTime=performance.now();});
  function tick(now){if(playing&&frames.length){clock+=(now-lastTime)/1000;const end=frames.at(-1).t,start=frames[0].t;if(clock>end)clock=start;let index=frameIndex;if(clock<frames[index].t)index=0;while(index<frames.length-1&&frames[index+1].t<=clock)index++;renderFrame(index);}lastTime=now;requestAnimationFrame(tick);}
  requestAnimationFrame(tick);await loadClip(initial.id);
  addEventListener('pagehide',()=>{playing=false;observer.disconnect();renderer.dispose();lineGeometry.dispose();jointGeometry.dispose();lineMaterial.dispose();jointMaterial.dispose();ball.geometry.dispose();ball.material.dispose();},{once:true});
}
initViewer().catch(error=>{if($('viewerStatus'))$('viewerStatus').textContent=error.message;console.error(error);});

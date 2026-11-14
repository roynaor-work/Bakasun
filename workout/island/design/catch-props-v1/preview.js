// Original CC0-1.0. Geometry and assets contain no text. See LICENSES.md.
const $ = id => document.getElementById(id);

async function start() {
  if (location.protocol === 'file:') throw Error('יש לפתוח דרך שרת HTTP מקומי של המאגר; הוראות בדוח.');
  const [THREE, {GLTFLoader}, response] = await Promise.all([
    import('../../vendor/three.module.js'),
    import('../../vendor/GLTFLoader.js'),
    fetch('./manifest.json')
  ]);
  if (!response.ok) throw Error(`manifest.json: ${response.status}`);
  const manifest = await response.json();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7e7cf');
  scene.fog = new THREE.Fog('#e7e7cf', 110, 235);
  const camera = new THREE.PerspectiveCamera(43, 1, .05, 280);
  const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'כל נכסי המרדף על כביש רחב. אפשר לבחור נכס בקטלוג; גרירה לסיבוב וגלילה לקירוב.');
  $('stage').prepend(canvas);
  scene.add(new THREE.HemisphereLight('#fff4d4', '#859b86', 2.4));
  const sun = new THREE.DirectionalLight('#ffe4b4', 2.7);
  sun.position.set(-18, 38, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left:-40,right:40,top:55,bottom:-28,near:1,far:140});
  sun.shadow.bias = -.0002;
  sun.shadow.normalBias = .025;
  sun.target.position.set(0,0,20);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#deefde', .7);
  fill.position.set(12,10,30);scene.add(fill);

  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({color, roughness:1, flatShading:true}));
    return materials.get(color);
  }
  function box(x,y,z,w,h,d,color,shadow=false) {
    const object = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material(color));
    object.position.set(x,y,z);object.receiveShadow=true;object.castShadow=shadow;scene.add(object);return object;
  }
  // All road dressing is original preview geometry, separate from the GLB count.
  box(0,-.59,20,28,1,72,'#c7b98c');
  box(0,-.08,20,27.7,.08,71.7,'#b7c49a');
  box(0,-.02,20,14.4,.02,60,'#6a7772');
  for (const side of [-1,1]) {
    box(side*7.28,.015,20,.20,.07,60,'#f2dfb2');
    box(side*7.8,-.005,20,.85,.035,60,'#d1bd91');
    box(side*6.9,.001,20,.075,.008,59,'#f6e8c5');
    for (let z=-9; z<50; z+=2.4) box(side*7.3,.055,z,.22,.045,.85,'#df9a61');
  }
  for (const x of [-2.3,2.3]) for (let z=-8;z<49;z+=4) box(x,.001,z,.08,.008,1.65,'#e8dfbf');
  // Soft polygonal trees frame the road without obscuring the rear view.
  function tree(x,z,scale=1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12,.17,1.45,6), material('#9b8058'));
    trunk.position.set(x,.65,z);scene.add(trunk);trunk.castShadow=true;
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.14,0),material('#729d85'));
    crown.position.set(x,1.85,z);crown.scale.set(.9*scale,1.18*scale,.83*scale);scene.add(crown);crown.castShadow=true;
    const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(.64,0),material('#9bb58b'));
    crown2.position.set(x-.50,1.65,z+.28);scene.add(crown2);crown2.castShadow=true;
  }
  for (const [x,z,s] of [[-10,-5,.8],[11,7,1],[-10,21,1.1],[10.5,35,.8],[-10.4,45,1],[9,50,.7],[-8,53,.9]]) tree(x,z,s);
  for (let i=0;i<22;i++) {
    const side=i%2?1:-1, z=-9+(i*17%63),x=side*(9.2+(i%3)*1.3);
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.26+(i%4)*.1,0), material(i%2?'#e0cda3':'#a7b68b'));
    rock.position.set(x,.16,z);rock.scale.set(1.5,.65,1);scene.add(rock);rock.castShadow=true;
  }
  for (const [x,z,s,c] of [[-20,80,20,'#b4c7ab'],[16,91,29,'#bfcdb0'],[4,110,24,'#cfdbbe']]) {
    const hill=new THREE.Mesh(new THREE.IcosahedronGeometry(s,0),material(c));hill.position.set(x,-s*.30,z);hill.scale.set(1.2,.43,.6);scene.add(hill);
  }

  const sharedTexture=await new THREE.TextureLoader().loadAsync('./atlas-1024.png');
  sharedTexture.colorSpace=THREE.SRGBColorSpace;sharedTexture.flipY=false;
  sharedTexture.magFilter=THREE.NearestFilter;sharedTexture.minFilter=THREE.NearestFilter;
  sharedTexture.generateMipmaps=false;
  const loader=new GLTFLoader();
  const loaded=[];
  function triangleCount(object) {
    let count=0;
    object.traverse(child=>{if(child.isMesh) count+=(child.geometry.index?.count??child.geometry.attributes.position.count)/3;});
    return count;
  }
  // Load four at a time to keep the temporary embedded textures bounded.
  for(let i=0;i<manifest.assets.length;i+=4) {
    const batch=await Promise.all(manifest.assets.slice(i,i+4).map(async asset=>{
      const gltf=await loader.loadAsync(asset.path);
      const object=gltf.scene;
      object.position.fromArray(asset.previewPosition);
      object.traverse(child=>{
        if(!child.isMesh)return;
        child.castShadow=!asset.decal;child.receiveShadow=true;
        const oldMap=child.material.map;
        child.material.map=sharedTexture;
        if(oldMap && oldMap!==sharedTexture)oldMap.dispose();
        if(asset.decal) {
          child.material.depthWrite=false;child.material.polygonOffset=true;
          child.material.polygonOffsetFactor=-2;child.material.polygonOffsetUnits=-2;
          child.renderOrder=3;
        }
      });
      const triangles=triangleCount(object);
      if(triangles!==asset.triangles || triangles>1500)throw Error(`${asset.id}: ספירת המשולשים אינה תקינה`);
      scene.add(object);
      return {asset,object,triangles};
    }));
    loaded.push(...batch);
    $('status').textContent=`נטענו ${loaded.length} מתוך ${manifest.assets.length} נכסים…`;
  }
  // A few instances demonstrate cones/guardrails as repeatable roadside pieces.
  const instances=[];
  function repeat(id,positions) {
    const original=loaded.find(item=>item.asset.id===id);
    for(const position of positions) {
      const clone=original.object.clone(true);clone.position.fromArray(position);scene.add(clone);
      instances.push(clone);
    }
  }
  repeat('traffic-cone',[[5.1,0,-1.8],[5.1,0,.2],[5.8,0,35.8],[5.8,0,37.4],[5.8,0,39]]);
  repeat('guardrail',[[-6.4,0,16.2],[-6.4,0,21.4]]);
  const total=loaded.reduce((sum,item)=>sum+item.triangles,0);
  $('asset-count').textContent=loaded.length;
  $('triangle-count').textContent=total.toLocaleString('he-IL');
  $('status').textContent='';
  const rotor=loaded.find(item=>item.asset.id==='police-helicopter').object.getObjectByName('rotor');
  if(!rotor)throw Error('לא נמצא צומת rotor במסוק');

  const groups={pickups:['עזרה בדרך','#75aa94'],hazards:['לשים לב','#95b3b7'],jumps:['ממריאים','#d4a16b'],
    vehicles:['תנועה בכביש','#879db1'],barriers:['עוצרים רגע','#d49672'],roadside:['לצד הדרך','#aaa185']};
  const buttons=new Map();
  for(const [group,[label,color]] of Object.entries(groups)) {
    const heading=document.createElement('div');heading.className='group-title';heading.textContent=label;$('catalog').append(heading);
    for(const item of loaded.filter(item=>item.asset.group===group)) {
      const button=document.createElement('button');button.className='asset';button.dataset.asset=item.asset.id;
      button.setAttribute('aria-pressed','false');
      const swatch=document.createElement('span');swatch.className='swatch';swatch.style.setProperty('--swatch',color);
      const name=document.createElement('span');name.textContent=item.asset.label;
      const count=document.createElement('span');count.className='count';count.textContent=`${item.triangles} △`;
      button.append(swatch,name,count);button.onclick=()=>select(item.asset.id);buttons.set(item.asset.id,button);$('catalog').append(button);
    }
  }
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced)$('rotor-motion').checked=false;
  let selected=null,view='chase',orbit=false;
  let target=new THREE.Vector3(0,0,21),yaw=0,pitch=.53,distance=66;
  function applyCamera() {
    camera.position.set(target.x+Math.sin(yaw)*Math.cos(pitch)*distance,
      target.y+Math.sin(pitch)*distance,target.z-Math.cos(yaw)*Math.cos(pitch)*distance);
    camera.lookAt(target);
  }
  function markView() {
    for(const name of ['chase','overview']) {
      const active=view===name;$(name).classList.toggle('active',active);$(name).setAttribute('aria-pressed',String(active));
    }
    $('rotate').disabled=!selected;
    $('rotate').classList.toggle('active',orbit);$('rotate').setAttribute('aria-pressed',String(orbit));
    for(const [id,button] of buttons) {
      button.classList.toggle('selected',selected===id);button.setAttribute('aria-pressed',String(selected===id));
    }
  }
  function setView(mode) {
    selected=null;orbit=false;view=mode;
    target.set(0,0,21);
    yaw=mode==='overview'?-.48:.10;pitch=mode==='overview'?.88:.53;distance=mode==='overview'?64:66;
    if(camera.aspect<.8){distance*=1.40;pitch=mode==='overview'?.98:.68;}
    $('selected-label').textContent='כל הערכה על הכביש';
    $('details').textContent='כל נכס עד 1,500 משולשים · יחידות במטרים';
    markView();applyCamera();render();
  }
  function select(id) {
    const item=loaded.find(item=>item.asset.id===id);if(!item)return;
    selected=id;view='detail';orbit=false;
    const bounds=new THREE.Box3().setFromObject(item.object),size=bounds.getSize(new THREE.Vector3());
    target.copy(bounds.getCenter(new THREE.Vector3()));
    yaw=-.52;pitch=item.asset.decal?.96:.40;
    distance=Math.max(2.0,Math.max(size.x,size.y,size.z)*1.95);
    if(camera.aspect<.8)distance*=1.65;
    $('selected-label').textContent=item.asset.label;
    $('details').textContent=`${item.triangles.toLocaleString('he-IL')} משולשים · ${(item.asset.bytes/1024).toFixed(1)} KiB · ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} מ׳`;
    markView();applyCamera();render();
  }
  function render() {
    renderer.render(scene,camera);
    $('render-count').textContent=`${renderer.info.render.triangles.toLocaleString('he-IL')} משולשים בפריים כולל הכביש`;
  }
  function resize() {
    const stage=$('stage');renderer.setSize(stage.clientWidth,stage.clientHeight);
    camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();
    if(selected)select(selected);else setView(view==='overview'?'overview':'chase');
  }
  $('chase').onclick=()=>setView('chase');$('overview').onclick=()=>setView('overview');
  $('rotate').onclick=()=>{orbit=!orbit;markView();};
  $('wireframe').onchange=()=>{loaded.forEach(item=>item.object.traverse(child=>{if(child.isMesh)child.material.wireframe=$('wireframe').checked;}));render();};
  $('rotor-motion').onchange=()=>render();
  let drag=null;
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;orbit=false;markView();drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;
    yaw-=(event.clientX-drag.x)*.006;pitch=THREE.MathUtils.clamp(pitch+(event.clientY-drag.y)*.004,.10,1.50);
    drag={x:event.clientX,y:event.clientY};applyCamera();render();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),1,150);applyCamera();render();},{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home'){setView('chase');return;}
    if(event.key==='ArrowLeft')yaw-=.10;if(event.key==='ArrowRight')yaw+=.10;
    if(event.key==='ArrowUp')pitch=Math.min(1.50,pitch+.08);if(event.key==='ArrowDown')pitch=Math.max(.10,pitch-.08);
    if(['+','='].includes(event.key))distance=Math.max(1,distance*.9);if(event.key==='-')distance=Math.min(150,distance/ .9);
    applyCamera();render();
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();$('status').textContent='תצוגת התלת ממד נעצרה. יש לרענן את הדף.';});
  let last=0;
  function animate(ms) {
    requestAnimationFrame(animate);
    const dt=last?Math.min((ms-last)/1000,.05):0;last=ms;
    if(document.hidden)return;
    let dirty=false;
    if($('rotor-motion').checked){rotor.rotation.y+=dt*6;dirty=true;}
    if(orbit && selected){yaw+=dt*.25;applyCamera();dirty=true;}
    if(dirty)render();
  }
  new ResizeObserver(resize).observe($('stage'));
  resize();requestAnimationFrame(animate);
  window.catchProps={manifest,loaded,instances,scene,camera,renderer,rotor,select,setView,render,
    get selected(){return selected;},summary:{assets:loaded.length,triangles:total,sharedTextures:1}};
}
start().catch(error=>{
  $('status').textContent=`לא ניתן להציג את הערכה: ${error.message}`;
  console.error(error);
});

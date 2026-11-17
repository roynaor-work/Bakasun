/* Original 3D comparison scenes and controls. MIT; see LICENSES.md. */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const pack = globalThis.LIGHTING_PACK;
  const THREE = globalThis.THREE;
  const status = $('status');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const worlds = [];
  let selected = pack.presets.find(p=>p.id==='sunset');
  let renderer, textures, ready=false, playing=false, elapsed=0, lastTime=0, frame=0, raf=0;
  const materials = new Map();
  const geometries = new Map();

  function material(color) {
    if (!materials.has(color)) materials.set(color,new THREE.MeshLambertMaterial({ color }));
    return materials.get(color);
  }
  function boxGeometry(x,y,z) {
    const key=[x,y,z].join('/');
    if (!geometries.has(key)) geometries.set(key,new THREE.BoxGeometry(x,y,z));
    return geometries.get(key);
  }
  function mesh(parent,geometry,color,position=[0,0,0],scale=[1,1,1]) {
    const object = new THREE.Mesh(geometry,typeof color==='string' ? material(color) : color);
    object.position.fromArray(position);
    object.scale.fromArray(scale);
    object.castShadow=true;
    object.receiveShadow=true;
    parent.add(object);
    return object;
  }
  function box(parent,size,color,position) { return mesh(parent,boxGeometry(...size),color,position); }
  function cylinder(parent,top,bottom,height,color,position,segments=10) {
    return mesh(parent,new THREE.CylinderGeometry(top,bottom,height,segments),color,position);
  }
  function beam(parent,from,to,radius,color) {
    const a=new THREE.Vector3(...from), b=new THREE.Vector3(...to), delta=b.clone().sub(a);
    const m=cylinder(parent,radius,radius,delta.length(),color,a.clone().add(b).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    return m;
  }

  function palm(parent,x,z,height=7,rotation=0) {
    const group=new THREE.Group();
    group.position.set(x,1,z);
    group.rotation.y=rotation;
    parent.add(group);
    const trunk=cylinder(group,.22,.45,height,'#a58866',[.3,height/2,0],9);
    trunk.rotation.z=-.09;
    for (let n=0; n<7; n++) {
      const vertices=[], indices=[];
      for (let i=0;i<=6;i++) {
        const t=i/6, width=Math.sin(t*Math.PI)*.65;
        const xx=t*5.7, yy=Math.sin(t*Math.PI)*.5-t*t*1.9;
        vertices.push(xx,yy,-width,xx,yy+.1,width);
        if (i<6) { const j=i*2; indices.push(j,j+1,j+2,j+1,j+3,j+2); }
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geo.setIndex(indices);geo.computeVertexNormals();
      const mat=new THREE.MeshLambertMaterial({ color:n%2?'#4c854e':'#6e9855',side:THREE.DoubleSide });
      const leaf=mesh(group,geo,mat,[height*.09,height,0]);
      leaf.rotation.y=n*Math.PI*2/7;
    }
    for(let n=0;n<3;n++) mesh(group,new THREE.IcosahedronGeometry(.35,0),'#8c7b45',[.4+n*.23,height-.15,.1]);
  }

  function coast(scene) {
    const group=new THREE.Group();scene.add(group);
    const oceanMaterial=new THREE.MeshPhongMaterial({ color:'#3a9fba',shininess:70,specular:'#8bbac4' });
    mesh(group,new THREE.PlaneGeometry(700,700),oceanMaterial,[0,-1.2,0]).rotation.x=-Math.PI/2;
    cylinder(group,17.3,18.4,2.2,'#d8bd83',[0,-.1,0],64);
    cylinder(group,13,15.8,1.1,'#82925a',[-1,.55,-2],64);
    for (const [x,z,h,r] of [[-10,-5,8,.5],[7,-7,7.4,2],[8,4,6.5,1.3],[-7,-9,6,.1]]) palm(group,x,z,h,r);
    // A small outdoor workout frame: original geometry, no character assets.
    for(const x of [-4,1]) {
      cylinder(group,.14,.14,4.4,'#4e676b',[x,3.2,-4],8);
      cylinder(group,.14,.14,3.2,'#4e676b',[x,2.6,0],8);
    }
    beam(group,[-4,5.4,-4],[1,5.4,-4],.16,'#e4b16d');
    beam(group,[-4,4.2,0],[1,4.2,0],.16,'#e4b16d');
    for (let i=0;i<7;i++) {
      const rock=mesh(group,new THREE.DodecahedronGeometry(1,0),i%2?'#b7b4a0':'#9b9e90',
        [-12+i*.9,.8,5+(i%3)*1.3],[1.1,.65,.85]);
      rock.rotation.set(.3,i*1.7,.2);
    }
    for(let n=0;n<5;n++) box(group,[1.8,.12,1.25],'#d6d1b5',[-2+Math.sin(n*.7)*1.2,1.17,1+n*2]);
    for(let n=0;n<12;n++) box(group,[4.3,.22,.65],'#ae8c63',[3,.5,12+n*.72]);
    for(const x of [1.2,4.8]) for(const z of [12.2,19.6]) cylinder(group,.13,.17,2.7,'#796c53',[x,-.55,z]);
    const rippleMaterial=new THREE.MeshLambertMaterial({ color:'#c4d9cc',transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide });
    for(let n=0;n<3;n++) {
      const ring=mesh(group,new THREE.RingGeometry(18.6+n*2.5,18.78+n*2.5,80),rippleMaterial,[0,-1.15,0],[1,1,1]);
      ring.rotation.x=-Math.PI/2;ring.castShadow=false;
    }
    for(const [x,z,r] of [[-64,-65,13],[50,-90,22],[-48,-130,16]]) {
      cylinder(group,r,r*1.4,2,'#93a17c',[x,-.8,z],18);
      mesh(group,new THREE.ConeGeometry(r*.65,r*.6,7),'#799578',[x,r*.2,z]);
    }
    return group;
  }

  function goal(parent,z) {
    const sign=Math.sign(z);
    for(const x of [-4,4]) beam(parent,[x,.2,z],[x,3.2,z],.12,'#f3f0db');
    beam(parent,[-4,3.2,z],[4,3.2,z],.12,'#f3f0db');
    const lines=[];
    const back=z+sign*2;
    for(let x=-4;x<=4;x+=.4) lines.push(x,.2,back,x,3.1,z);
    for(let y=.3;y<=3;y+=.35) {
      const zz=back-(y/3)*sign*2;
      lines.push(-4,y,zz,4,y,zz);
    }
    for(const x of [-4,4]) {
      beam(parent,[x,.2,back],[x,3.2,z],.06,'#d8dfd5');
      for(let y=.2;y<3.2;y+=.4) lines.push(x,y,z,x,y,back-y/3*sign*2);
    }
    const net=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),
      new THREE.LineBasicMaterial({ color:'#e5e4d5',transparent:true,opacity:.54 }));
    parent.add(net);
  }

  function stadium(scene) {
    const group=new THREE.Group();scene.add(group);
    mesh(group,new THREE.PlaneGeometry(700,700),'#829c89',[0,-.5,0]).rotation.x=-Math.PI/2;
    box(group,[48,.6,54],'#a0a69d',[0,-.15,0]);
    box(group,[37,.15,46],'#bb8f70',[0,.15,0]);
    for(let n=0;n<14;n++) box(group,[28,.12,38/14],n%2?'#6d9d62':'#7da969',[0,.3,-19+(n+.5)*38/14]);
    const line='#f1eed4';
    for(const x of [-13.8,13.8]) box(group,[.12,.025,37.6],line,[x,.38,0]);
    for(const z of [-18.8,18.8,0]) box(group,[27.6,.025,.12],line,[0,.38,z]);
    const center=mesh(group,new THREE.RingGeometry(4.7,4.83,64),line,[0,.39,0]);
    center.rotation.x=-Math.PI/2;center.castShadow=false;
    cylinder(group,.18,.18,.03,line,[0,.4,0],16);
    for(const sign of [-1,1]) {
      const z=sign*14.3;
      for(const x of [-8.3,8.3]) box(group,[.12,.02,9],line,[x,.39,z]);
      box(group,[16.6,.02,.12],line,[0,.39,sign*9.8]);
      goal(group,sign*18.7);
    }
    const chairGeometry=boxGeometry(.8,.6,.75);
    const chairs=new THREE.InstancedMesh(chairGeometry,material('#ffffff'),2*4*30);
    const matrix=new THREE.Matrix4(), color=new THREE.Color();let index=0;
    for(const sign of [-1,1]) {
      for(let row=0;row<4;row++) {
        const x=sign*(18.8+row*1.15), y=.6+row*.8;
        box(group,[1.2,y+1,42],'#adb4ab',[x,(y-1)/2,0]);
        for(let n=0;n<30;n++) {
          matrix.makeTranslation(x,y+.6,-19.5+n*1.34);
          chairs.setMatrixAt(index,matrix);
          color.set((n%10<7) ? '#4d858b' : '#c99772');
          chairs.setColorAt(index,color);index++;
        }
      }
      box(group,[.22,1.4,44],'#697b7f',[sign*23,3.4,0]);
    }
    chairs.castShadow=true;chairs.receiveShadow=true;group.add(chairs);
    for(let n=0;n<10;n++) {
      const x=-50+n*11;
      box(group,[6+(n%3)*2,4+(n%4)*2,5],'#7d9694',[x,2,-56-(n%3)*4]);
    }
    const ball=mesh(group,new THREE.IcosahedronGeometry(.58,1),'#eee8d5',[3,.98,4]);
    const seams=new THREE.LineSegments(new THREE.EdgesGeometry(ball.geometry,12),new THREE.LineBasicMaterial({color:'#4c595a'}));
    ball.add(seams);
    return group;
  }

  function alpine(scene) {
    const group=new THREE.Group();scene.add(group);
    const height=(x,z)=>Math.max(0,(-z-4)*.18)+Math.sin(x*.11)*.45+Math.cos(z*.1)*.3;
    const ground=new THREE.PlaneGeometry(180,190,35,35);
    ground.rotateX(-Math.PI/2);
    const positions=ground.attributes.position;
    for(let i=0;i<positions.count;i++) positions.setY(i,height(positions.getX(i),positions.getZ(i)));
    ground.computeVertexNormals();mesh(group,ground,'#d8e5e7');
    for(const [x,z,r,h] of [[-35,-48,24,30],[0,-72,31,42],[35,-63,30,37],[-65,-91,35,40]]) {
      const base=height(x,z);
      mesh(group,new THREE.ConeGeometry(r,h,7),'#8c9caa',[x,base+h*.4,z]);
      mesh(group,new THREE.ConeGeometry(r*.61,h*.62,7),'#e6ebed',[x,base+h*.59,z]);
    }
    for(let n=0;n<24;n++) {
      const sign=n%2?1:-1, x=sign*(10+(n%4)*4), z=-42+Math.floor(n/2)*6.5;
      const h=4+(n%4)*.7, y=height(x,z);
      cylinder(group,.18,.28,h,'#8c8075',[x,y+h/2,z],7);
      for(let t=0;t<3;t++) {
        const level=y+1.5+t*.95;
        mesh(group,new THREE.ConeGeometry((2.2-t*.46),2.8,7),t%2?'#6a8a86':'#537b76',[x,level,z]);
        mesh(group,new THREE.ConeGeometry((1.8-t*.38),2,7),'#dce9e9',[x,level+.55,z]);
      }
    }
    for(const z of [9,-8,-24]) {
      const cx=Math.sin(z*.07)*2.5;
      for(const side of [-1,1]) {
        const x=cx+side*4,y=height(x,z);
        cylinder(group,.085,.085,2.8,'#c98a65',[x,y+1.4,z],7);
        const flag=box(group,[1.35,.7,.06],side===1?'#ca795b':'#7b9eae',[x-side*.65,y+2.15,z]);
        flag.rotation.z=side*.04;
      }
    }
    for(let n=0;n<5;n++) {
      const x=-9-n*.8,z=15-n*1.2;
      const rock=mesh(group,new THREE.DodecahedronGeometry(1.3,0),'#92a1aa',[x,height(x,z)+.5,z],[1.3,.7,1]);
      rock.rotation.y=n*1.6;
    }
    // Curved route markers remain legible in every lighting preset.
    for(let n=0;n<20;n++) {
      const z=-35+n*2.6,x=Math.sin(z*.07)*2.5;
      for(const side of [-1,1]) {
        const xx=x+side*5.7;
        const marker=box(group,[.16,.22,.75],'#b68c64',[xx,height(xx,z)+.14,z]);
        marker.rotation.y=Math.cos(z*.07)*.18;
      }
    }
    return group;
  }

  function makeWorld(id,builder,radius,pitch,yaw,targetY) {
    const scene=new THREE.Scene();scene.name=id;
    const content=builder(scene);
    const camera=new THREE.PerspectiveCamera(52,1,.1,800);
    const rig=IslandLighting.create(THREE,scene,textures,{shadowMapSize:pack.renderer.shadowMapSize});
    const item={id,scene,content,camera,rig,radius,pitch,yaw,baseYaw:yaw,targetY,
      pane:document.querySelector(`[data-scene="${id}"]`)};
    worlds.push(item);
    function moveCamera() {
      camera.position.set(Math.sin(item.yaw)*radius*Math.cos(pitch),targetY+Math.sin(pitch)*radius,
        Math.cos(item.yaw)*radius*Math.cos(pitch));
      camera.lookAt(0,targetY,0);
    }
    item.moveCamera=moveCamera;
    moveCamera();
    let pointer=null, originX=0, originYaw=0;
    item.pane.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      pointer=event.pointerId;originX=event.clientX;originYaw=item.yaw;
      item.pane.setPointerCapture(event.pointerId);
    });
    item.pane.addEventListener('pointermove',event=>{
      if(event.pointerId!==pointer)return;
      item.yaw=Math.max(item.baseYaw-1.2,Math.min(item.baseYaw+1.2,originYaw-(event.clientX-originX)*.008));
      moveCamera();requestDraw();
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture']) item.pane.addEventListener(name,()=>{pointer=null;});
    item.pane.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
      event.preventDefault();
      item.yaw=event.key==='Home' ? item.baseYaw : Math.max(item.baseYaw-1.2,Math.min(item.baseYaw+1.2,item.yaw+(event.key==='ArrowLeft'?.13:-.13)));
      moveCamera();requestDraw();
    });
  }

  function setPreset(preset,announce=true) {
    selected=preset;
    document.querySelectorAll('.preset').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset===preset.id)));
    $('preset-counter').textContent=String(pack.presets.indexOf(preset)+1).padStart(2,'0')+' / 10';
    $('preset-name').textContent=preset.name;
    $('preset-description').textContent=preset.description;
    for(const [name,color] of [['sun',preset.sun.color],['ambient',preset.ambient.color],['fog',preset.fog.color]]) {
      $(name+'-swatch').style.background=color;
      $(name+'-swatch').setAttribute('aria-label',name+' '+color);
    }
    $('metrics').replaceChildren();
    const light=document.createElement('span'),fog=document.createElement('span');
    light.textContent='עוצמת אור '+preset.sun.intensity.toFixed(2);
    fog.textContent='ערפל '+preset.fog.start+'–'+preset.fog.end+' מ׳';
    $('metrics').append(light,fog);
    worlds.forEach(world=>world.rig.apply(preset));
    if(announce) status.textContent=preset.name+' · '+preset.description;
    requestDraw();
  }

  pack.presets.forEach((preset,index)=>{
    const button=document.createElement('button');
    button.type='button';button.className='preset'+(['fog','rain','snow'].includes(preset.id)?' weather':'');
    button.dataset.preset=preset.id;button.setAttribute('aria-label',preset.name);
    button.setAttribute('aria-pressed',String(preset===selected));
    const sky=document.createElement('span');sky.className='preset-sky';sky.setAttribute('aria-hidden','true');
    sky.style.setProperty('--sky-top',preset.sky.gradient.zenith);
    sky.style.setProperty('--sky-bottom',preset.sky.gradient.horizon);
    sky.style.setProperty('--sun',preset.sun.color);
    const sun=document.createElement('span');sun.className='preset-sun';
    const number=document.createElement('span');number.className='preset-number';number.textContent=String(index+1).padStart(2,'0');
    sky.append(sun,number);
    const label=document.createElement('span');label.className='preset-label';label.textContent=preset.id==='stadium'?'אצטדיון':preset.name;
    button.append(sky,label);
    button.addEventListener('click',()=>setPreset(preset));
    $('presets').append(button);
  });

  function draw() {
    if(!ready)return;
    const rect=$('views').getBoundingClientRect();
    const width=Math.round(rect.width),height=Math.round(rect.height);
    if(renderer.domElement.width!==Math.round(width*renderer.getPixelRatio()) ||
       renderer.domElement.height!==Math.round(height*renderer.getPixelRatio())) renderer.setSize(width,height,false);
    renderer.setScissorTest(false);renderer.setClearColor('#101719');renderer.clear();
    renderer.setScissorTest(true);
    for(const world of worlds) {
      const r=world.pane.getBoundingClientRect();
      const left=Math.round(r.left-rect.left),bottom=Math.round(rect.bottom-r.bottom);
      const w=Math.round(r.width),h=Math.round(r.height);
      world.camera.aspect=w/h;world.camera.updateProjectionMatrix();
      world.rig.update(elapsed,world.camera);
      renderer.setViewport(left,bottom,w,h);renderer.setScissor(left,bottom,w,h);
      renderer.render(world.scene,world.camera);
    }
    renderer.setScissorTest(false);frame++;
  }
  function tick(time) {
    raf=0;
    if(playing && !document.hidden) {
      if(lastTime) elapsed+=Math.min((time-lastTime)/1000,.1);
      lastTime=time;
      draw();
      raf=requestAnimationFrame(tick);
    } else { lastTime=0;draw(); }
  }
  function requestDraw() { if(ready && !raf) raf=requestAnimationFrame(tick); }
  function setMotion(value) {
    playing=!!value;
    $('motion').setAttribute('aria-pressed',String(playing));
    $('motion').setAttribute('aria-label',playing?'עצירת התנועה':'הפעלת תנועה בעננים ובמזג האוויר');
    $('motion').querySelector('path').setAttribute('d',playing?'M7 5h4v14H7zm7 0h4v14h-4Z':'m9 5 10 7-10 7Z');
    lastTime=0;requestDraw();
  }
  $('motion').addEventListener('click',()=>setMotion(!playing));
  motionPreference.addEventListener('change',event=>{if(event.matches)setMotion(false);});
  document.addEventListener('visibilitychange',()=>{lastTime=0;requestDraw();});
  new ResizeObserver(requestDraw).observe($('views'));

  $('copy').addEventListener('click',async()=>{
    const text=JSON.stringify(selected,null,2);
    try {
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const previous=document.activeElement;
        const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');
        area.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
        document.body.append(area);area.select();
        const copied=document.execCommand('copy');area.remove();previous?.focus();
        if(!copied)throw new Error('Copy unavailable');
      }
      status.textContent='ערכת '+selected.name+' הועתקה כ־JSON.';
    } catch {
      status.textContent='הדפדפן חסם העתקה. אפשר להוריד את קובץ כל הערכות.';
      $('download').focus();
    }
  });

  function fail(message) {
    ready=false;setMotion(false);$('motion').disabled=true;
    $('loading').hidden=false;$('loading').textContent=message;
    status.textContent='קובץ הערכות זמין להורדה גם בלי תלת־ממד.';
  }

  try {
    renderer=new THREE.WebGLRenderer({canvas:$('viewport'),antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,pack.renderer.maxPixelRatio));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=pack.renderer.exposure;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.autoClear=true;
    textures=await IslandLighting.loadTextures(THREE,pack,globalThis.LIGHTING_TEXTURES);
    makeWorld('coast',coast,49,.24,.65,1.8);
    makeWorld('stadium',stadium,63,.30,.63,1.1);
    makeWorld('alpine',alpine,56,.27,.39,3.5);
    ready=true;setPreset(selected,false);draw();
    $('loading').hidden=true;$('copy').disabled=false;
    if(motionPreference.matches)status.textContent='תנועה מופחתת פעילה. אפשר לבחור ערכה ולסובב כל זירה בנפרד.';
    $('viewport').addEventListener('webglcontextlost',event=>{event.preventDefault();fail('תצוגת התלת־ממד נעצרה. רעננו את הדף כדי לנסות שוב.');});
    // Small diagnostics surface for reproducible browser verification and handoff.
    globalThis.lightingPreview=Object.freeze({
      snapshot:()=>({ready,selected:selected.id,playing,time:elapsed,frame,
        renderer:{revision:THREE.REVISION,pixelRatio:renderer.getPixelRatio(),memory:{...renderer.info.memory}},
        scenes:worlds.map(w=>({id:w.id,preset:w.rig.presetId,sunColor:w.rig.sun.color.getHexString(),
          intensity:w.rig.sun.intensity,ambient:w.rig.ambient.color.getHexString(),
          fog:w.scene.fog ? [w.scene.fog.near,w.scene.fog.far] : null,stars:w.rig.stars.geometry.drawRange.count,
          visibleClouds:w.rig.clouds.children.filter(c=>c.visible).length,
          rain:w.rig.rain.visible,snow:w.rig.snow.visible,spots:w.rig.spots.filter(s=>s.light.visible).length,
          camera:w.camera.position.toArray()}))}),
      render:draw,
      dispose:()=>{
        if(!ready)return;
        ready=false;playing=false;cancelAnimationFrame(raf);
        const geos=new Set(),mats=new Set();
        worlds.forEach(w=>{w.rig.dispose();w.content.traverse(o=>{
          if(o.geometry)geos.add(o.geometry);
          if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));
          if(o.isInstancedMesh)o.dispose();
        });});
        geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
        Object.values(textures).forEach(t=>t.dispose());renderer.dispose();
      },
    });
  } catch(error) {
    console.error(error);
    fail('לא ניתן להפעיל WebGL בדפדפן הזה. הורדת ערכות התאורה עדיין זמינה.');
  }
})();

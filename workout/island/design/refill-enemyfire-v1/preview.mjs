// Original, dependency-free review surface. SPDX-License-Identifier: CC0-1.0
const $ = id => document.getElementById(id);
const types = ['coolant', 'vulcan-magazine', 'energy'];
const labels = ['מצנן', 'מחסנית וולקן', 'אנרגיה'];
const descriptions = ['מוריד חום. מחזיר את הוולקן לקצב.', 'מחדשת תחמושת למאבק במסוקים ובמטוסים.', 'תא כוח זוהר להמשך הקרב.'];
const effectLabels = {'pickup-burst':'איסוף מילוי','refill-ring':'טבעת מילוי','enemy-shell':'פגז אויב','water-target':'נקודת נחיתה','edge-warning':'אזהרה בקצה המסך','muzzle-flash':'הבזק לוע','shockwave':'גל הלם'};
const audioLabels = {'refill-pickup':'איסוף מילוי','incoming-shell':'פגז נכנס','enemy-cannon':'ירי תותח אויב'};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches, audible = false, time = 0, previous = 0, selection = 0;
let selectedManually = false;
const images = new Map(), modelViews = [], effectViews = [], sounds = new Map();
const fail = error => { $('error').hidden=false; $('error').textContent=`לא ניתן לטעון את התצוגה. פתחו אותה דרך שרת HTTP מקומי משורש המאגר, לפי REPORT.md. ${error.message}`; };
const loadImage = path => new Promise((resolve,reject) => {
  const im=new Image(); im.onload=()=>{ images.set(path,im); resolve(im); };
  im.onerror=()=>reject(new Error(`תמונה חסרה: ${path}`)); im.src=path;
});

function select(index,manual=false){
  selection=index;
  if(manual) selectedManually=true;
  $('active-icon').src=`icons/${types[index]}.png`;
  $('active-icon').alt=labels[index];
  $('active-label').textContent=labels[index];
  $('active-description').textContent=descriptions[index];
  [...$('carousel').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
}

function fill(value){
  $('fill-output').value=`${value} / 11`;
  $('active-ring').src=`vfx/frames/refill-ring/${String(value).padStart(2,'0')}.png`;
}
$('fill').addEventListener('input',event=>fill(event.target.value));
function syncPause(){
  $('pause').textContent=paused?'הפעלה':'השהיה';
  $('pause').setAttribute('aria-pressed',String(paused));
}
$('pause').addEventListener('click',()=>{ paused=!paused; syncPause(); });
reduced.addEventListener('change',event=>{ if(event.matches){paused=true;syncPause();} });
$('sound').addEventListener('click',()=>{
  audible=!audible; $('sound').textContent=audible?'צליל פועל':'צליל כבוי';
  $('sound').setAttribute('aria-pressed',String(audible));
  if(!audible) for(const sound of sounds.values()){sound.pause();sound.currentTime=0;}
});
syncPause();

function play(id){
  if(!audible) return;
  const sound=sounds.get(id); sound.currentTime=0;
  sound.play().catch(()=>{});
}

function sprite(ctx,manifest,id,frame,x,y,size=1,angle=0,squash=1){
  const s=manifest.sprites[id], image=images.get(s.file);
  const i=Math.max(0,Math.min(s.frameCount-1,Math.floor(frame)));
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size*squash);
  ctx.drawImage(image,i*s.frameWidth,0,s.frameWidth,s.frameHeight,-s.frameWidth*s.anchor[0],-s.frameHeight*s.anchor[1],s.frameWidth,s.frameHeight);
  ctx.restore();
}

// Reads the delivered GLB geometry itself. No external libraries; intentionally
// supports this pack's static glTF subset. WebGL with a Canvas fallback.
async function loadGLB(path){
  const response=await fetch(path); if(!response.ok) throw new Error(path);
  const buffer=await response.arrayBuffer(), view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67) throw new Error('GLB header');
  const jsonLength=view.getUint32(12,true);
  const gltf=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)));
  const binaryStart=20+jsonLength+8;
  function accessor(index){
    const a=gltf.accessors[index], b=gltf.bufferViews[a.bufferView];
    const count=a.count*({VEC3:3,VEC4:4,SCALAR:1}[a.type]);
    const Type=a.componentType===5126?Float32Array:Uint16Array;
    return new Type(buffer,binaryStart+(b.byteOffset||0)+(a.byteOffset||0),count);
  }
  const triangles=[];
  for(const p of gltf.meshes[0].primitives){
    const positions=accessor(p.attributes.POSITION), normals=accessor(p.attributes.NORMAL), colors=accessor(p.attributes.COLOR_0), indices=accessor(p.indices);
    for(let i=0;i<indices.length;i+=3){
      const ids=[indices[i],indices[i+1],indices[i+2]], k=ids[0];
      triangles.push({points:ids.map(j=>[...positions.slice(j*3,j*3+3)]),normal:[...normals.slice(k*3,k*3+3)],color:[...colors.slice(k*4,k*4+3)],emissive:p.material===1});
    }
  }
  return triangles;
}

const srgb = v => Math.round(255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055));
function initGL(canvas,triangles){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});
  if(!gl)return null;
  const vertex=`attribute vec3 position,normal,color;attribute float emissive;
    uniform float yaw,bob;varying vec3 rgb;
    vec3 rotate(vec3 p){float c=cos(yaw),s=sin(yaw);vec3 q=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);return vec3(q.x,q.y*.9359-q.z*.3523,q.y*.3523+q.z*.9359);}
    void main(){vec3 p=rotate(position+vec3(0.,-.34+bob,0.));float depth=3.-p.z;
      gl_Position=vec4(p.x*4.7/1.61538,p.y*4.7,(10.1/9.9)*depth-2./9.9,depth);
      float shade=emissive>.5?1.12:.42+.58*max(0.,dot(rotate(normal),normalize(vec3(-.35,.75,.56))));rgb=color*shade;}`;
  const fragment=`precision mediump float;varying vec3 rgb;
    void main(){vec3 c=clamp(rgb,0.,1.);gl_FragColor=vec4(mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c)),1.);}`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const vertices=[];for(const f of triangles)for(const p of f.points)vertices.push(...p,...f.normal,...f.color,f.emissive?1:0);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  gl.useProgram(program);let offset=0;for(const [name,size] of [['position',3],['normal',3],['color',3],['emissive',1]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset*4);offset+=size;}
  gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  return {gl,program,yaw:gl.getUniformLocation(program,'yaw'),bob:gl.getUniformLocation(program,'bob'),count:vertices.length/10};
}
function renderModel(item,t){
  if(item.contextLost)return;
  if(item.gpu){
    const {gl,program,yaw,bob,count}=item.gpu;gl.useProgram(program);gl.viewport(0,0,420,260);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(yaw,item.yaw+t*.24);gl.uniform1f(bob,Math.sin(t*Math.PI*1.6)*.035);gl.drawArrays(gl.TRIANGLES,0,count);return;
  }
  const ctx=item.ctx, w=420,h=260;
  const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#102a3d');bg.addColorStop(.6,'#12384a');bg.addColorStop(1,'#0c2738');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#43778735';ctx.lineWidth=1;
  for(let i=0;i<11;i++){
    const y=105+i*17;ctx.beginPath();
    for(let x=0;x<=w;x+=8){const yy=y+Math.sin(x*.035+t*.7+i)*2; x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}
    ctx.stroke();
  }
  const yaw=item.yaw+t*.24, pitch=.36, bob=Math.sin(t*Math.PI*1.6)*.035;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  function rotate([x,y,z]){const xx=x*cy+z*sy,zz=-x*sy+z*cy;return [xx,y*cp-zz*sp,y*sp+zz*cp];}
  function project(p){const r=rotate([p[0],p[1]-.34+bob,p[2]]),s=610/(3-r[2]);return [w/2+r[0]*s,h*.52-r[1]*s,r[2]];}
  const water=project([0,0,0]);
  const halo=ctx.createRadialGradient(water[0],water[1],5,water[0],water[1],125);halo.addColorStop(0,item.color+'38');halo.addColorStop(1,item.color+'00');ctx.save();ctx.translate(water[0],water[1]);ctx.scale(1,.38);ctx.fillStyle=halo;ctx.translate(-water[0],-water[1]);ctx.fillRect(water[0]-140,water[1]-140,280,280);ctx.restore();
  ctx.fillStyle='#06192365';ctx.beginPath();ctx.ellipse(water[0],water[1]+7,91,25,0,0,Math.PI*2);ctx.fill();
  const faces=item.triangles.map(face=>({...face,projected:face.points.map(project),n:rotate(face.normal)}));
  faces.sort((a,b)=>a.projected.reduce((s,p)=>s+p[2],0)-b.projected.reduce((s,p)=>s+p[2],0));
  for(const f of faces){
    const shade=f.emissive?1.12:.42+.58*Math.max(0,f.n[0]*-.35+f.n[1]*.75+f.n[2]*.56);
    const color=f.color.map(c=>srgb(Math.min(1,c*shade)));
    ctx.fillStyle=`rgb(${color.join(',')})`;ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.45;
    ctx.beginPath();f.projected.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.strokeStyle=item.color+'55';ctx.lineWidth=1;
  for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(water[0],water[1]+6,104+i*16+Math.sin(t*2)*3,28+i*5,0,0,Math.PI*2);ctx.stroke();}
}

function polygon(ctx,points,fill){ctx.fillStyle=fill;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();}
function vessel(ctx,x,y,angle=0,friendly=false){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle='#08213180';ctx.beginPath();ctx.ellipse(6,9,53,21,0,0,Math.PI*2);ctx.fill();
  polygon(ctx,[[-48,-16],[22,-20],[56,0],[22,20],[-48,16]],friendly?'#7498a6':'#896e67');
  polygon(ctx,[[-42,-12],[22,-14],[47,0],[22,14],[-42,12]],friendly?'#294b60':'#3e414b');
  ctx.fillStyle=friendly?'#9ed2dd':'#bc9c88';ctx.fillRect(-22,-10,30,20);
  ctx.fillStyle='#223441';ctx.fillRect(-18,-7,18,14);ctx.fillStyle=friendly?'#6deaff':'#ff8776';ctx.fillRect(-17,-7,16,3);
  ctx.fillStyle='#92a3a5';ctx.beginPath();ctx.arc(22,0,9,0,Math.PI*2);ctx.fill();ctx.fillRect(22,-3,22,6);ctx.restore();
}

function battle(manifest,t,prev){
  const ctx=$('battle').getContext('2d'), w=1000,h=520;
  const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#10283a');bg.addColorStop(.45,'#104054');bg.addColorStop(1,'#0a273d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  ctx.lineWidth=1;
  for(let j=0;j<18;j++){
    ctx.strokeStyle=j%3===0?'#6da6b322':'#39788b25';ctx.beginPath();
    for(let x=0;x<=w;x+=10){const y=40+j*28+Math.sin(x*.016+j+t*.5)*(3+j*.3);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
  }
  // Abstract demo base and ship markers; all deliverable sprites remain text-free.
  polygon(ctx,[[0,78],[76,81],[150,119],[167,165],[115,204],[0,216]],'#2e4a4b');
  polygon(ctx,[[0,70],[69,77],[135,114],[150,154],[104,186],[0,203]],'#69746a');
  ctx.fillStyle='#253b44';ctx.fillRect(61,110,70,50);ctx.fillStyle='#8b9b97';ctx.fillRect(69,103,60,43);
  ctx.fillStyle='#344651';ctx.beginPath();ctx.arc(109,134,20,0,Math.PI*2);ctx.fill();ctx.fillStyle='#97a6a3';ctx.fillRect(112,128,43,12);
  vessel(ctx,884,183,Math.PI,false);
  const cycle=Math.floor(t/4), local=t%4, side=cycle%2===0?'left':'right';
  const origin=side==='left'?[155,134]:[840,183];
  const target=[480+(cycle%3-1)*95,330];
  const moving=local<.5?0:Math.sin(Math.min(1,(local-.5)/2)*Math.PI/2)*100;
  vessel(ctx,target[0]+moving,target[1]+12,-.2,true);
  const phase=local<.35?'ממתין לירי':local<1.15?'אזהרה: פגז נכנס':local<2.35?'הפגז בדרך':local<2.95?'פגיעה במים':'איסוף מילוי';
  $('phase').textContent=phase;$('time-progress').style.width=`${local/4*100}%`;
  if(local>=.35&&local<2.35){
    sprite(ctx,manifest,'water-target',(local-.35)*8%8,...target,1.5,0,.48);
    sprite(ctx,manifest,'edge-warning',local*8%8,side==='left'?50:950,260,1,side==='left'?0:Math.PI);
  }
  if(local>=1.15&&local<1.35) sprite(ctx,manifest,'muzzle-flash',(local-1.15)*30,...origin,.9);
  if(local>=1.15&&local<2.35){
    const p=(local-1.15)/1.2,x=origin[0]+(target[0]-origin[0])*p,y=origin[1]+(target[1]-origin[1])*p-Math.sin(p*Math.PI)*75;
    const dy=target[1]-origin[1]-75*Math.PI*Math.cos(p*Math.PI);
    sprite(ctx,manifest,'enemy-shell',local*16%4,x,y,.9,Math.atan2(dy,target[0]-origin[0]));
  }
  if(local>=2.35&&local<2.75) sprite(ctx,manifest,'shockwave',(local-2.35)*20,...target,1.8,0,.5);
  if(local>=2.75){
    const im=images.get(`icons/${types[selection]}.png`), alpha=local<2.95?1:Math.max(0,1-(local-2.95)*5);
    ctx.globalAlpha=alpha;ctx.drawImage(im,target[0]+moving-36,target[1]-95,72,72);ctx.globalAlpha=1;
  }
  if(local>=2.95&&local<3.25) sprite(ctx,manifest,'pickup-burst',(local-2.95)*20,target[0]+moving,target[1]-40,1.4);
  for(const [at,id] of [[.35,'incoming-shell'],[1.15,'enemy-cannon'],[2.95,'refill-pickup']]){
    if(Math.floor((prev-at)/4)<Math.floor((t-at)/4)) play(id);
  }
}

async function start(){
  const response=await fetch('manifest.json');if(!response.ok) throw new Error('manifest.json');
  const manifest=await response.json();
  await Promise.all([...Object.values(manifest.sprites).map(s=>s.file),...types.map(k=>`icons/${k}.png`)].map(loadImage));
  types.forEach((kind,i)=>{
    const button=document.createElement('button');button.setAttribute('aria-label',labels[i]);button.setAttribute('aria-pressed',String(i===0));
    const icon=document.createElement('img');icon.src=`icons/${kind}.png`;icon.alt='';button.append(icon);button.addEventListener('click',()=>select(i,true));$('carousel').append(button);
  });
  await Promise.all(types.map(async(kind,i)=>{
    const card=document.createElement('article');card.className='model-card';
    card.innerHTML=`<canvas width="420" height="260" tabindex="0" role="img" aria-label="${labels[i]} בתלת ממד. חצים לסיבוב."></canvas><div class="model-caption"><div><h3>${labels[i]}</h3><p>600 TRI · ${(manifest.models[kind].bytes/1024).toFixed(1)} KB · GLB</p></div><a href="models/${kind}.glb" download>הורדה</a></div>`;
    // Append before awaiting so card order is stable across load speeds.
    $('models').append(card);
    const canvas=card.querySelector('canvas'),triangles=await loadGLB(`models/${kind}.glb`),gpu=initGL(canvas,triangles),item={gpu,ctx:gpu?null:canvas.getContext('2d'),triangles,yaw:-.4,color:manifest.palette[kind]};
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();item.contextLost=true;});
    canvas.addEventListener('webglcontextrestored',()=>{item.gpu=initGL(canvas,triangles);item.contextLost=false;});
    modelViews.push(item);let drag=null;
    canvas.addEventListener('pointerdown',e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(drag!==null){item.yaw+=(e.clientX-drag)*.015;drag=e.clientX;}});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
    canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();item.yaw+=e.key==='ArrowLeft'?-.2:.2;}});
  }));
  for(const [id,s] of Object.entries(manifest.sprites)){
    const card=document.createElement('article');card.className='effect-card';
    card.innerHTML=`<div class="effect-stage"><canvas width="128" height="128" role="img" aria-label="${effectLabels[id]}"></canvas></div><div class="effect-caption"><h3>${effectLabels[id]}</h3><span>${s.frameCount} ${s.mode==='state'?'STATES':'FRAMES'}</span></div><a href="${s.file}" download aria-label="הורדת אטלס ${effectLabels[id]}"><img class="frame-strip" src="${s.file}" alt="כל הפריימים של ${effectLabels[id]}"></a>`;
    $('effects').append(card);effectViews.push({ctx:card.querySelector('canvas').getContext('2d'),id,s});
  }
  for(const [id,info] of Object.entries(manifest.audio)){
    const card=document.createElement('article');card.className='audio-card';
    const file=info.files;
    card.innerHTML=`<div class="audio-head"><h3>${audioLabels[id]}</h3><button aria-label="השמעת ${audioLabels[id]}">▷</button></div><div class="waveform" aria-hidden="true">${Array.from({length:38},(_,i)=>`<i style="height:${5+Math.abs(Math.sin(i*1.8)*Math.cos(i*.15))*23}px"></i>`).join('')}</div><p>סינתזה מקורית · ללא דיבור או דגימות</p><audio controls preload="none" aria-label="${audioLabels[id]}"><source src="${file.ogg.file}" type="audio/ogg"><source src="${file.mp3.file}" type="audio/mpeg"></audio><div class="audio-links"><a href="${file.ogg.file}" download>OGG</a><a href="${file.mp3.file}" download>MP3</a><span>${file.ogg.integratedLUFS.toFixed(2)} LUFS</span></div>`;
    const audio=card.querySelector('audio');audio.volume=.65;
    card.querySelector('button').addEventListener('click',()=>{audio.currentTime=0;audio.play().catch(fail);});
    $('audio').append(card);
    const sceneAudio=new Audio();sceneAudio.src=sceneAudio.canPlayType('audio/ogg')?file.ogg.file:file.mp3.file;sceneAudio.volume=.5;sounds.set(id,sceneAudio);
  }
  let last=performance.now();
  function tick(now){
    const delta=document.hidden?0:Math.max(0,Math.min(.05,(now-last)/1000));last=now;previous=time;if(!paused)time+=delta;
    if(!selectedManually&&Math.floor(time/4)%3!==selection)select(Math.floor(time/4)%3);
    battle(manifest,time,previous);
    for(const item of modelViews)renderModel(item,time);
    for(const {ctx,id,s} of effectViews){
      ctx.clearRect(0,0,128,128);
      const frame=s.mode==='state'?Number($('fill').value):Math.floor(time*(s.fps||8))%s.frameCount;
      const angle=id==='edge-warning'?Math.floor(time/2)%4*Math.PI/2:0;
      sprite(ctx,manifest,id,frame,64,64,1,angle);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
start().catch(fail);

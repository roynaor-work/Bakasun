// Original CC0 preview. Uses the repository's existing MIT Three.js without decoders.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const $ = selector => document.querySelector(selector);
const manifest = await fetch('manifest.json').then(response => {
  if (!response.ok) throw new Error('manifest.json');
  return response.json();
});
const images = new Map();
await Promise.all(manifest.sprites.map(async asset => {
  const img = new Image(); img.src = asset.file; await img.decode(); images.set(asset.id, img);
}));
const effectsNames = {
  'bubble-trail': 'שובל בועות חוזר', 'bubbles-rise': 'בועות עולות',
  'sonar-ring': 'טבעת סונאר', 'underwater-explosion': 'פיצוץ מתחת למים',
  'launch-flash': 'הבזק שיגור', 'submarine-shadow': 'צללית צוללת',
  'enemy-warning-line': 'קו אזהרה לאויב'
};
const effectCanvases = new Map();
for (const asset of manifest.sprites) {
  const card = document.createElement('article'); card.className = 'effect';
  card.innerHTML = `<canvas width="420" height="280" aria-label="${effectsNames[asset.id]}"></canvas>
    <div class="effect-info"><h3>${effectsNames[asset.id]}</h3><small>${asset.frameCount} פריימים · <bdi>${asset.imageSize.join(' × ')}</bdi></small>
    <a href="${asset.file}" download>הורדת PNG ↗</a></div>`;
  $('#effects').append(card); effectCanvases.set(asset.id, card.querySelector('canvas'));
}

function drawAsset(ctx, id, frame, x, y, width, height, alpha = 1) {
  const asset = manifest.sprites.find(item => item.id === id);
  const [fw, fh] = asset.frameSize, [cols] = asset.grid;
  const index = Math.max(0, Math.min(asset.frameCount - 1, frame));
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.drawImage(images.get(id), index % cols * fw, Math.floor(index / cols) * fh, fw, fh, x, y, width, height);
  ctx.restore();
}

let renderer, scene, camera, current, mixer, propAction;
let angle = .83, elevation = .42, distance = 5.7, spinning = true;
const models = new Map();
try {
  renderer = new THREE.WebGLRenderer({canvas: $('#model-view'), antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(36, 1, .1, 60);
  scene.add(new THREE.HemisphereLight(0xffedca, 0x286d79, 2.3));
  const sun = new THREE.DirectionalLight(0xffe3a7, 3.0); sun.position.set(1, 5, 3); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x90e4dc, 1.6); fill.position.set(-4, 1, -3); scene.add(fill);
  const loader = new GLTFLoader();
  await Promise.all(manifest.models.map(async asset => {
    const gltf = await loader.loadAsync(asset.file);
    models.set(asset.id, gltf);
  }));
  function choose(id) {
    if (current) { mixer.stopAllAction(); scene.remove(current); }
    const gltf = models.get(id); current = gltf.scene; scene.add(current);
    mixer = new THREE.AnimationMixer(current); propAction = mixer.clipAction(gltf.animations[0]);
    propAction.play(); propAction.paused = !spinning;
    const enemy = id === 'torpedo-enemy';
    $('#player').setAttribute('aria-pressed', String(!enemy)); $('#enemy').setAttribute('aria-pressed', String(enemy));
    $('#model-label').textContent = enemy ? 'טורפדו אויב' : 'טורפדו שחקן';
    const asset = manifest.models.find(item => item.id === id);
    $('#model-detail').textContent = `${asset.triangles} triangles · ${(asset.bytes / 1024).toFixed(1)} KiB · no compression`;
  }
  choose('torpedo-player'); $('#model-status').textContent = '';
  $('#player').onclick = () => choose('torpedo-player'); $('#enemy').onclick = () => choose('torpedo-enemy');
  $('#spin').onclick = () => {
    spinning = !spinning; propAction.paused = !spinning;
    $('#spin').setAttribute('aria-pressed', String(spinning));
    $('#spin').textContent = spinning ? 'עצירת המדחף' : 'סיבוב המדחף';
  };
  $('#reset-view').onclick = () => { angle = .83; elevation = .42; distance = 5.7; };
  let pointer = null;
  const canvas = $('#model-view');
  canvas.onpointerdown = event => { pointer = [event.clientX,event.clientY]; canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = event => {
    if (!pointer) return;
    angle -= (event.clientX - pointer[0]) * .008;
    elevation = Math.max(-1.1, Math.min(1.1, elevation + (event.clientY - pointer[1]) * .006));
    pointer = [event.clientX,event.clientY];
  };
  canvas.onpointerup = canvas.onpointercancel = () => { pointer = null; };
  canvas.addEventListener('wheel', event => {
    event.preventDefault(); distance = Math.max(3.4, Math.min(11, distance + event.deltaY * .004));
  }, {passive: false});
  new ResizeObserver(() => {
    const {width,height} = canvas.getBoundingClientRect();
    renderer.setSize(width,height,false); camera.aspect = width/height; camera.updateProjectionMatrix();
  }).observe(canvas);
} catch (error) {
  $('#model-status').textContent = 'טעינת התלת־ממד נכשלה. קובצי ההורדה זמינים לצד התצוגה.';
  console.error(error);
}

let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let time = 0, sequenceTime = 0, previous = performance.now();
function pauseLabel() { $('#pause').setAttribute('aria-pressed', String(paused)); $('#pause').textContent = paused ? 'הפעלת האפקטים' : 'השהיית האפקטים'; }
pauseLabel();
$('#pause').onclick = () => { paused = !paused; pauseLabel(); };
$('#scrub').oninput = event => { paused = true; time = Number(event.target.value)/20; pauseLabel(); };
$('#replay').onclick = () => { sequenceTime = 0; paused = false; pauseLabel(); };

function sequence(t) {
  const canvas = $('#sequence'), rect = canvas.getBoundingClientRect(), w = 1000;
  const h = Math.round(w * rect.height / rect.width);
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,w,h);
  const gradient = ctx.createLinearGradient(0,0,0,h); gradient.addColorStop(0,'#367a82'); gradient.addColorStop(1,'#174b5b');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#bbdcca16'; ctx.lineWidth = 2;
  for (let j=0; j<8; j++) {
    ctx.beginPath();
    for (let x=0; x<=w; x+=10) { const y=(j+.6)*h/8+Math.sin(x*.013+t*.5+j)*5; x ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }
    ctx.stroke();
  }
  const x0=760, end=230, y=h*.54, phase=t%7.3;
  ctx.save(); ctx.translate(x0,y); ctx.rotate(-Math.PI/2);
  drawAsset(ctx,'submarine-shadow',0,-38,-90,76,180,.9); ctx.restore();
  drawAsset(ctx,'sonar-ring',Math.floor(t*12)%12,x0-102,y-102,204,204,.8);
  let text = 'הצוללת נשארת שקועה';
  if (phase<1.25) {
    for (let x=end; x<x0-65; x+=128) drawAsset(ctx,'enemy-warning-line',0,x,y-10,128,20,.85);
    text = 'אזהרת שיגור · קו נקודות על המים';
  } else if (phase<4.3) {
    const travel=(phase-1.25)/3.05, x=x0-60-(x0-60-end)*travel;
    ctx.save(); ctx.translate(x+43,y); ctx.rotate(Math.PI);
    drawAsset(ctx,'bubble-trail',Math.floor(t*12)%8,-70,-30,170,60); ctx.restore();
    if (phase<1.58) drawAsset(ctx,'launch-flash',Math.min(7,Math.floor((phase-1.25)*24)),x0-94,y-34,68,68);
    text = 'טורפדו נע מתחת למים · שובל בועות';
  } else if (phase<5.9) {
    drawAsset(ctx,'underwater-explosion',Math.min(31,Math.floor((phase-4.3)*20)),end-60,y-154,120,240);
    text = 'פגיעה מתחת למים · עמוד מים ובועות';
  }
  $('#sequence-state').textContent=text;
}

let audioContext;
const soundNames = {'torpedo-launch':'שיגור טורפדו','torpedo-engine-loop':'מנוע טורפדו · לופ','underwater-explosion':'פיצוץ מתחת למים','sonar-ping':'סונאר פינג','bubbles':'בועות'};
const activeSources = new Set();
function stopAudio() {
  for (const source of activeSources) { source.stop(); source.disconnect(); }
  activeSources.clear(); $('#audio-status').textContent = 'הצלילים נעצרו';
}
let audioRequest = 0;
$('#stop-audio').onclick = () => { audioRequest++; stopAudio(); };
for (const sound of manifest.audio) {
  const card = document.createElement('article'); card.className='sound';
  card.innerHTML = `<h3>${soundNames[sound.id]}</h3><small><bdi>${sound.durationSeconds}s · −16 LUFS · 48 kHz</bdi></small>
    <button>${sound.loop?'ניגון לופ רציף':'ניגון'}</button><a href="${sound.formats[0].file}" download>OGG</a><a href="${sound.formats[1].file}" download>MP3</a>`;
  card.querySelector('button').onclick = async () => {
    const request = ++audioRequest; stopAudio(); $('#audio-status').textContent = 'טוען צליל…';
    try {
      audioContext ??= new AudioContext(); await audioContext.resume();
      let buffer;
      for (const format of sound.formats) {
        try {
          const response=await fetch(format.file); if(!response.ok) throw new Error(format.file);
          buffer=await audioContext.decodeAudioData(await response.arrayBuffer()); break;
        } catch (error) { if(format===sound.formats.at(-1)) throw error; }
      }
      if(request!==audioRequest) return;
      const source=audioContext.createBufferSource(), gain=audioContext.createGain();
      source.buffer=buffer; source.loop=sound.loop; source.loopEnd=Math.min(buffer.duration,sound.durationSeconds);
      gain.gain.value=.55; source.connect(gain).connect(audioContext.destination);
      activeSources.add(source);
      source.onended=()=>{ activeSources.delete(source); source.disconnect(); gain.disconnect(); if(!activeSources.size) $('#audio-status').textContent='הניגון הסתיים'; };
      source.start(); $('#audio-status').textContent=sound.loop?'המנוע מתנגן בלולאה. לעצירה לחצו על עצירת צלילים.':soundNames[sound.id];
    } catch(error) { $('#audio-status').textContent='לא ניתן לנגן. אפשר להוריד את קובץ הצליל.'; console.error(error); }
  };
  $('#sounds').append(card);
}

function animate(now) {
  const dt=Math.min(.05,(now-previous)/1000); previous=now;
  if(!paused && !document.hidden) { time+=dt; sequenceTime+=dt; }
  if(mixer && !document.hidden) mixer.update(dt);
  if(renderer && scene && camera) {
    camera.position.set(Math.sin(angle)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,Math.cos(angle)*Math.cos(elevation)*distance);
    camera.lookAt(0,0,0); renderer.render(scene,camera);
  }
  for (const asset of manifest.sprites) {
    const canvas=effectCanvases.get(asset.id), ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const frame=asset.frameCount>1?Math.floor(time*(asset.fps||12))%asset.frameCount:0;
    const aspect=asset.frameSize[0]/asset.frameSize[1];
    let height=235, width=height*aspect;
    if(width>390) { width=390; height=width/aspect; }
    drawAsset(ctx,asset.id,frame,(420-width)/2,(280-height)/2,width,height);
  }
  sequence(sequenceTime);
  if(!paused) $('#scrub').value=Math.floor(time*20)%32;
  $('#frame-number').textContent=`${Math.floor(time*20)%32} / 31`;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
document.addEventListener('visibilitychange',()=>{ previous=performance.now(); if(document.hidden) { audioRequest++; stopAudio(); } });
window.addEventListener('pagehide',()=>{ audioRequest++; stopAudio(); audioContext?.close(); renderer?.dispose(); });

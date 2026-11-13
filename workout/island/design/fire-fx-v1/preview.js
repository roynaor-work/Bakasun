// SPDX-License-Identifier: CC0-1.0
'use strict';
(() => {
  const assets = window.FIRE_FX_PREVIEW;
  const gallery = document.querySelector('#gallery');
  const status = document.querySelector('#status');
  const play = document.querySelector('#play');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches, time = 0, previous = null, speed = 1;
  let showAnchors = false, repeatOnce = true;
  const entries = [];
  const setPlaying = value => {
    playing = value;
    play.textContent = value ? 'השהיה' : 'הפעלה';
    play.setAttribute('aria-pressed', String(value));
  };
  setPlaying(playing);

  function frameAt(asset) {
    if (asset.frameCount === 1) return 0;
    const elapsed = Math.floor(time * asset.recommendedFps);
    if (asset.loop) return elapsed % asset.frameCount;
    const onceFrame = repeatOnce ? elapsed % (asset.frameCount + Math.round(asset.recommendedFps * .8)) : elapsed;
    return Math.min(onceFrame, asset.frameCount - 1);
  }

  function draw(entry) {
    const {asset:a, image, stages, counter} = entry;
    if (!image.complete || !image.naturalWidth) return;
    const index = entry.manualFrame ?? frameAt(a);
    counter.textContent = `${index + 1} / ${a.frameCount}`;
    for (const {canvas, light} of stages) {
      const ctx = canvas.getContext('2d');
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
      if (canvas.width !== pw || canvas.height !== ph) {canvas.width = pw; canvas.height = ph;}
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = light ? '#eff3ed' : '#101c28';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = light ? '#dfe6e3' : '#1e2d3b';
      ctx.lineWidth = .6;
      for (let x = 0; x < width; x += 24) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
      for (let y = 0; y < height; y += 24) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
      ctx.globalCompositeOperation = a.blending === 'AdditiveBlending' ? 'lighter' : 'source-over';
      if (a.repeatX) {
        const offset = (time * a.recommendedScrollPixelsPerSecond) % a.frameWidth;
        for (let x = -offset; x < width; x += a.frameWidth) ctx.drawImage(image, x, height / 2 - 16);
      } else {
        // Keep all flame canvases at the same scale so the three sizes compare honestly.
        const scale = Math.min((width - 24) / a.frameWidth, (height - 32) / a.frameHeight, 1.4);
        const w = a.frameWidth * scale, h = a.frameHeight * scale;
        const x = (width - w) / 2, y = (height - h) / 2 + 9;
        const sx = index % a.columns * a.frameWidth;
        const sy = Math.floor(index / a.columns) * a.frameHeight;
        ctx.drawImage(image,sx,sy,a.frameWidth,a.frameHeight,x,y,w,h);
        if (showAnchors) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = light ? '#a23157' : '#ff8db4';
          ctx.lineWidth = 1;
          const ax = x + a.anchorPixels.x * scale, ay = y + a.anchorPixels.y * scale;
          ctx.beginPath();ctx.moveTo(ax-5,ay);ctx.lineTo(ax+5,ay);ctx.moveTo(ax,ay-5);ctx.lineTo(ax,ay+5);ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  async function start() {
    if (!assets) throw new Error('חסרים נתוני תצוגה');
    for (const a of assets) {
      const card = document.createElement('article');card.className = 'card';card.dataset.id = a.id;
      const head = document.createElement('div');head.className = 'card-head';
      const title = document.createElement('h2');title.textContent = a.name;
      const counter = document.createElement('span');counter.className = 'counter';
      head.append(title,counter);
      const pair = document.createElement('div');pair.className = 'stages';
      const stages = [false,true].map(light => {
        const stage = document.createElement('div');stage.className = `stage ${light ? 'light' : 'dark'}`;
        const label = document.createElement('span');label.className = 'badge';label.textContent = light ? 'LIGHT' : 'DARK';
        const canvas = document.createElement('canvas');canvas.setAttribute('role','img');
        canvas.setAttribute('aria-label',`${a.name} על רקע ${light ? 'בהיר' : 'כהה'}`);
        stage.append(canvas,label);pair.append(stage);return {canvas,light};
      });
      const meta = document.createElement('div');meta.className = 'meta';
      for (const text of [`${a.frameWidth}×${a.frameHeight}`, `${a.frameCount}f · ${a.recommendedFps}fps`, a.blending === 'AdditiveBlending' ? 'ADD' : 'ALPHA', a.repeatX ? 'TILE X' : a.playback.toUpperCase()]) {
        const tag = document.createElement('span');tag.className = 'tag';tag.textContent = text;meta.append(tag);
      }
      const details = document.createElement('details');
      const summary = document.createElement('summary');summary.textContent = `הגיליון המלא · ${(a.bytes/1000).toFixed(1)} KB`;
      const link = document.createElement('a');link.href = a.file;link.download = a.file;link.textContent = a.file;link.dir = 'ltr';
      const atlas = document.createElement('img');atlas.src = a.file;atlas.alt = a.name;atlas.loading = 'lazy';
      details.append(summary,link,atlas);card.append(head,pair,meta,details);gallery.append(card);
      const image = new Image();image.src = a.file;
      entries.push({asset:a,image,stages,counter,manualFrame:null});
    }
    await Promise.all(entries.map(e => e.image.decode()));
    status.textContent = `${assets.length} אפקטים · ${(assets.reduce((n,a)=>n+a.bytes,0)/1000).toFixed(1)} KB תמונות`;
    gallery.dataset.ready = 'true';
    requestAnimationFrame(tick);
  }
  function tick(now) {
    if (previous !== null && playing && !document.hidden) time += Math.min((now - previous) / 1000,.1) * speed;
    previous = now;
    entries.forEach(draw);
    requestAnimationFrame(tick);
  }
  play.addEventListener('click',() => {entries.forEach(e=>{e.manualFrame=null;});setPlaying(!playing);});
  document.querySelector('#restart').addEventListener('click',() => {time=0;entries.forEach(e=>{e.manualFrame=null;});});
  document.querySelector('#step').addEventListener('click',() => {
    setPlaying(false);
    entries.forEach(e=>{e.manualFrame=((e.manualFrame ?? frameAt(e.asset))+1)%e.asset.frameCount;});
  });
  document.querySelector('#speed').addEventListener('change',e=>{speed=Number(e.target.value);});
  document.querySelector('#anchors').addEventListener('change',e=>{showAnchors=e.target.checked;});
  document.querySelector('#repeat').addEventListener('change',e=>{repeatOnce=e.target.checked;});
  document.addEventListener('visibilitychange',()=>{previous=null;});
  motion.addEventListener('change',e=>{if(e.matches)setPlaying(false);});
  start().catch(error=>{status.classList.add('error');status.textContent=`טעינת התמונות נכשלה: ${error.message}`;});
})();

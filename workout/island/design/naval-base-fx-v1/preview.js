const $ = id => document.getElementById(id);
const scene = $('scene');
const ctx = scene.getContext('2d');
const audio = $('audio');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = 6.4;
let manifest, images, elapsed = reduced ? .3 : 0, playing = !reduced, last = 0;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

function frameIndex(spec, time) {
  const index = Math.floor(Math.max(0, time) * spec.fps + 1e-8);
  return spec.loop ? index % spec.frames : Math.min(index, spec.frames - 1);
}

function sprite(context, name, time, x, y, size, opacity = 1) {
  const spec = manifest.sprites[name];
  if (time < 0 || opacity <= 0 || (!spec.loop && time >= spec.durationSeconds)) return;
  const frame = frameIndex(spec, time);
  context.save();
  context.globalAlpha = clamp(opacity);
  context.globalCompositeOperation = name === 'sparks' ? 'lighter' : 'source-over';
  context.drawImage(images[name], frame % spec.columns * spec.frameWidth,
    Math.floor(frame / spec.columns) * spec.frameHeight, spec.frameWidth, spec.frameHeight,
    x - size * spec.pivot[0], y - size * spec.pivot[1], size, size);
  context.restore();
}

function harbor(time) {
  const water = ctx.createLinearGradient(0, 0, 0, 540);
  water.addColorStop(0, '#1c3e50'); water.addColorStop(1, '#102c3b');
  ctx.fillStyle = water; ctx.fillRect(0, 0, 960, 540);
  ctx.strokeStyle = '#8ebacc12'; ctx.lineWidth = 1;
  for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 12; col++) {
      const x = col * 94 + (row % 2) * 47;
      const y = row * 33 + 8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y - 2); ctx.stroke();
    }
  }
  ctx.fillStyle = '#19222a'; ctx.fillRect(280, 354, 400, 38);
  ctx.fillStyle = '#46525b'; ctx.fillRect(280, 342, 400, 14);
  ctx.fillStyle = '#68737a'; ctx.fillRect(280, 339, 400, 3);
  for (const x of [302, 342, 618, 658]) { ctx.fillStyle = '#b7a075'; ctx.fillRect(x, 331, 7, 15); }
  // A small neutral warehouse silhouette supplies scale; it is preview scenery.
  ctx.save(); ctx.globalAlpha = 1 - smooth(time / .48);
  ctx.fillStyle = '#71808b'; ctx.fillRect(414, 284, 132, 55);
  ctx.fillStyle = '#4f606e'; ctx.beginPath(); ctx.moveTo(402, 286); ctx.lineTo(480, 251); ctx.lineTo(558, 286); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#22313c'; ctx.fillRect(463, 302, 34, 37);
  for (const x of [428, 516]) { ctx.fillStyle = '#9ca591'; ctx.fillRect(x, 302, 15, 13); }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = smooth(time / .48);
  ctx.fillStyle = '#24262a'; ctx.fillRect(420, 330, 120, 9);
  for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#383d40' : '#1d252d'; ctx.fillRect(424 + i * 13, 323 + i % 3 * 3, 12, 10); }
  ctx.restore();
}

function draw(time) {
  ctx.clearRect(0, 0, 960, 540);
  if ($('background').value === 'sea') harbor(time);
  const smoke = manifest.sprites.smoke;
  if ($('layer-smoke').checked) {
    sprite(ctx, 'smoke', time - smoke.startSeconds, 480, 339, 370,
      smooth((time - smoke.startSeconds) / smoke.fadeInSeconds) * (1 - smooth((time - 5.7) / smoke.fadeOutSeconds)));
  }
  if ($('layer-explosion').checked) sprite(ctx, 'explosion', time, 480, 339, 350);
  if ($('layer-sparks').checked) sprite(ctx, 'sparks', time, 480, 339, 350);
  for (const name of ['explosion', 'smoke', 'sparks']) {
    const solo = $(`solo-${name}`).getContext('2d');
    solo.clearRect(0, 0, 256, 256);
    // Isolated one-shots repeat only with the main timeline, keeping pause/scrub exact.
    const spec = manifest.sprites[name];
    sprite(solo, name, time, 128, 128 + 224 * (spec.pivot[1] - .5), 224);
  }
  $('clock').textContent = `${time.toFixed(2).padStart(5, '0')} s`;
  $('timeline').value = time;
  $('time-label').textContent = `${time.toFixed(2)} / 6.40 s`;
  $('pause').textContent = playing ? 'השהיה' : 'המשך';
}

function stopSound() { audio.pause(); audio.currentTime = 0; }
async function replay() {
  elapsed = 0; last = performance.now(); playing = true;
  stopSound(); draw(elapsed);
  if ($('sound').checked) {
    try { await audio.play(); }
    catch { $('status').textContent = 'הצליל לא הופעל. אפשר להשתמש בנגן ההאזנה למטה.'; }
  }
}

function tick(now) {
  if (playing && !document.hidden) {
    elapsed += Math.min((now - last) / 1000, .1) * Number($('speed').value);
    if (elapsed >= duration) {
      if ($('repeat').checked) elapsed %= duration;
      else { elapsed = duration; playing = false; }
    }
    draw(elapsed);
  }
  last = now;
  requestAnimationFrame(tick);
}

try {
  const response = await fetch('manifest.json');
  if (!response.ok) throw new Error('manifest');
  manifest = await response.json();
  images = Object.fromEntries(await Promise.all(Object.entries(manifest.sprites).map(async ([name, spec]) => {
    const image = new Image(); image.src = spec.image; await image.decode();
    if (image.naturalWidth !== spec.width || image.naturalHeight !== spec.height) throw new Error('atlas size');
    return [name, image];
  })));
  for (const id of ['replay', 'pause', 'timeline']) $(id).disabled = false;
  audio.volume = Number($('volume').value);
  $('status').textContent = reduced ? 'הפחתת תנועה פעילה. אפשר להפעיל את התצוגה בלחיצה.' : 'מוכן. הצליל מופעל רק בלחיצה; החזרה החזותית שקטה.';
  $('replay').addEventListener('click', replay);
  $('pause').addEventListener('click', () => {
    if (elapsed >= duration) elapsed = 0;
    playing = !playing; last = performance.now();
    // Pausing never queues a delayed impact sound.
    audio.pause(); draw(elapsed);
  });
  $('timeline').addEventListener('input', () => { elapsed = Number($('timeline').value); playing = false; stopSound(); draw(elapsed); });
  for (const id of ['layer-explosion', 'layer-smoke', 'layer-sparks', 'background']) {
    $(id).addEventListener('change', () => { scene.parentElement.dataset.background = $('background').value; draw(elapsed); });
  }
  $('volume').addEventListener('input', () => { audio.volume = Number($('volume').value); });
  $('sound').addEventListener('change', () => { if (!$('sound').checked) audio.pause(); });
  $('speed').addEventListener('change', () => { audio.pause(); last = performance.now(); });
  $('audio-format').addEventListener('change', () => {
    audio.pause();
    const format = $('audio-format').value;
    if (format === 'auto') audio.removeAttribute('src');
    else audio.src = manifest.audio.sources.find(source => source.file.endsWith(`.${format}`)).file;
    audio.load();
  });
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden) audio.pause(); });
  audio.addEventListener('error', () => { $('status').textContent = 'לא ניתן לטעון את הצליל. אפשר לבחור פורמט אחר או להוריד את הקובץ.'; });
  draw(elapsed); last = performance.now(); requestAnimationFrame(tick);
} catch (error) {
  $('status').classList.add('error');
  $('status').textContent = 'טעינת התצוגה נכשלה. יש לפתוח דרך שרת מקומי; הקבצים זמינים להורדה למטה.';
  console.error('Naval FX preview:', error);
}

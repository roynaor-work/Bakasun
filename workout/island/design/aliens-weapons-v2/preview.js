/* Standalone asset demonstration. It does not import or change game logic. */
'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const manifest = await fetch('manifest.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); });
  const canvas = $('range'), ctx = canvas.getContext('2d');
  const atlases = await Promise.all(manifest.weapons.map(w => new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error(w.atlas)); img.src = w.atlas;
  })));
  let selected = 0, soundOn = false, paused = false, auto = true, started = performance.now(), pauseAt = 0;
  let lastCycle = -1, impactPlayed = false, ammo = 3, manual = false, generation = 0, lastFrame = 0;
  let activeAudio = [];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) { auto = false; $('auto').checked = false; }
  const W = 516, H = 215, launch = { x: 258, y: 153 }, target = { x: 311, y: 56 };

  const fit = () => {
    const scale = Math.min(1, innerWidth / 844);
    document.querySelector('.armory').style.transform = `scale(${scale})`;
    document.querySelector('.viewport').style.height = `${390 * scale}px`;
  };
  addEventListener('resize', fit); fit();

  function stopAudio() {
    for (const audio of activeAudio) { audio.pause(); audio.currentTime = 0; }
    activeAudio = [];
  }
  function play(event, explicit = false) {
    if ((!soundOn && !explicit) || paused || document.hidden) return;
    const paths = manifest.weapons[selected].audio[event];
    const audio = new Audio();
    audio.src = audio.canPlayType('audio/ogg; codecs="vorbis"') ? paths.ogg : paths.mp3;
    audio.volume = 0.5;
    activeAudio.push(audio);
    audio.addEventListener('ended', () => { activeAudio = activeAudio.filter(a => a !== audio); });
    audio.play().catch(() => { $('status').textContent = 'לחצו על קול כדי לאפשר שמע'; });
  }
  function frame(role, age, x, y, width, height, rotation = 0, forceIndex = null) {
    const weapon = manifest.weapons[selected], animation = weapon.animations[role];
    let index = forceIndex ?? Math.floor(age / animation.frameMs);
    index = animation.loop ? index % animation.frames.length : Math.min(animation.frames.length - 1, index);
    const f = weapon.frames[animation.frames[Math.max(0, index)]];
    const [sx, sy, sw, sh] = f.rect;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    ctx.drawImage(atlases[selected], sx, sy, sw, sh, -f.pivotPx[0] * width / sw, -f.pivotPx[1] * height / sh, width, height);
    ctx.restore();
  }
  function back(time) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(258, 100, 0, 258, 100, 280); g.addColorStop(0, '#152b43'); g.addColorStop(1, '#0a1323');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 49; i++) {
      ctx.fillStyle = i % 5 ? '#526e8e55' : '#b7d5e8aa';
      ctx.fillRect((i * 83 + 37) % W, (i * 59 + 19) % 175, i % 5 ? 1 : 1.5, i % 5 ? 1 : 1.5);
    }
    ctx.strokeStyle = '#516d8d22'; ctx.lineWidth = 1;
    for (let y = 47; y < 180; y += 35) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(502, y); ctx.stroke(); }
    ctx.strokeStyle = '#607c9d44'; ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.moveTo(258, 35); ctx.lineTo(258, 175); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#6b849f'; ctx.font = '8px monospace'; ctx.fillText('TEST SECTOR 07', 17, 161); ctx.fillText('RANGE / 250 M', 403, 161);
    const color = manifest.weapons[selected].color;
    for (const [x,y] of [[target.x,target.y],[258,93],[258,129]]) {
      ctx.strokeStyle = '#6e87a55c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-16,y); ctx.lineTo(x-7,y); ctx.moveTo(x+7,y); ctx.lineTo(x+16,y); ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.fillStyle = '#0a1728'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(launch.x, launch.y+4, 20, 7, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(launch.x, launch.y-2, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(launch.x-2,launch.y-12,4,5);
  }
  function draw(age) {
    const w = manifest.weapons[selected], id = w.id;
    back(age);
    if (age > 1350 || age < 0) { $('phase').textContent = 'מוכן לירי'; return; }
    const flightEnd = id === 'piercing-laser' ? 450 : id === 'shield' ? 600 : 700;
    $('phase').textContent = age < flightEnd ? (id === 'shield' ? 'הגנה פעילה' : 'ירי') : 'פגיעה';
    if (age < 160) frame('fire', age, launch.x, launch.y-10, 67, 67);
    if (id === 'piercing-laser' && age < flightEnd) {
      frame('projectile', age, launch.x, launch.y-10, 36, 136);
      for (const y of [53,93,126]) frame('impact', age % 320, launch.x, y, 39, 39);
    } else if (id === 'shield' && age < flightEnd) {
      frame('projectile', age, launch.x, launch.y-24, 92, 92);
    } else if (id === 'electric-pulse' && age < flightEnd) {
      frame('projectile', age, launch.x, launch.y-35, 154, 154, 0, Math.min(3, Math.floor(age / flightEnd * 4)));
    } else if (age < flightEnd && id !== 'piercing-laser') {
      const progress = Math.max(0, (age - (id === 'charge-bomb' ? 220 : 0)) / (flightEnd - (id === 'charge-bomb' ? 220 : 0)));
      const x = launch.x + (target.x-launch.x)*progress + Math.sin(progress*Math.PI)*(id==='guided-missile' ? -53 : 0);
      const y = launch.y + (target.y-launch.y)*progress;
      const rotation = id === 'guided-missile' ? Math.atan2((target.x-launch.x)-53*Math.PI*Math.cos(progress*Math.PI), launch.y-target.y) : 0;
      frame('trail', age, x, y+12, 40, 52, rotation);
      frame('projectile', age, x, y, id==='double-missile' ? 53 : 42, id==='double-missile' ? 53 : 42, rotation);
      if (id === 'charge-bomb' && age < 220) frame('fire', age%160, launch.x, launch.y, 75, 75);
    }
    if (age >= flightEnd && age < flightEnd+320) {
      const x = id==='shield' || id==='electric-pulse' ? launch.x : id==='piercing-laser' ? launch.x : target.x;
      const y = id==='shield' || id==='electric-pulse' ? launch.y-35 : target.y;
      const size = id==='charge-bomb' ? 153 : id==='electric-pulse' ? 144 : 90;
      frame('impact',age-flightEnd,x,y,size,size);
      if (!impactPlayed) { play('impact'); impactPlayed = true; }
    }
  }
  function updateAmmo() {
    $('ammo').textContent = ammo;
    $('fire').disabled = ammo === 0;
    $('state-ready').src = manifest.weapons[selected].button[ammo ? 'ready' : 'disabled'].svg;
  }
  function select(index) {
    generation++; stopAudio(); selected = index; ammo = 3; manual = false;
    const w = manifest.weapons[index];
    document.querySelector('.armory').style.setProperty('--accent', w.color);
    $('callsign').textContent = w.callsign; $('weapon-name').textContent = w.nameHe;
    $('description').textContent = w.descriptionHe; $('weapon-number').textContent = `0${index+1} / 06`;
    for (const state of ['ready','pressed','disabled']) $('state-'+state).src = w.button[state].svg;
    $('refill-icon').src = w.refill.png; $('atlas-link').href = w.atlas;
    $('frames').replaceChildren(...w.animations.impact.frames.map(id => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      c.setAttribute('aria-label', `פריים פגיעה ${id.slice(-1)*1+1}`);
      c.getContext('2d').drawImage(atlases[index], ...w.frames[id].rect, 0, 0, 64, 64); return c;
    }));
    document.querySelectorAll('#weapons button').forEach((button,i) => button.setAttribute('aria-pressed', String(i===index)));
    started = performance.now(); if (paused) pauseAt = started;
    lastCycle = -1; impactPlayed = false; updateAmmo(); draw(auto ? 180 : 1400);
    $('status').textContent = 'כל הנכסים נטענו · צלילים מקוריים';
  }
  $('weapons').replaceChildren(...manifest.weapons.map((w,i) => {
    const b = document.createElement('button'); b.dataset.weapon = w.id; b.style.setProperty('--accent',w.color);
    const img = document.createElement('img'); img.src = w.button.ready.png; img.alt = '';
    const text = document.createElement('span'), name = document.createElement('b'), call = document.createElement('small');
    name.textContent = w.nameHe; call.textContent = w.callsign; text.append(name,call); b.append(img,text);
    b.addEventListener('click',() => select(i)); return b;
  }));
  $('fire').addEventListener('click',() => {
    if (!ammo) return;
    ammo--; updateAmmo(); started = performance.now(); if (paused) pauseAt = started;
    lastCycle = 0; impactPlayed = false; manual = true; play('fire');
    if (paused) draw(180);
  });
  $('refill').addEventListener('click',() => { ammo = 3; updateAmmo(); $('status').textContent = 'המחסנית התמלאה'; });
  $('sound').addEventListener('click',() => {
    soundOn = !soundOn; $('sound').textContent = soundOn ? 'קול פעיל' : 'קול כבוי'; $('sound').setAttribute('aria-pressed',String(soundOn));
    if (soundOn) play('fire'); else stopAudio();
  });
  $('pause').addEventListener('click',() => {
    paused = !paused; if (paused) { pauseAt = performance.now(); stopAudio(); } else started += performance.now()-pauseAt;
    $('pause').textContent = paused ? 'המשך' : 'השהיה'; $('pause').setAttribute('aria-pressed',String(paused));
  });
  $('auto').addEventListener('change',() => { auto = $('auto').checked; manual = false; started = performance.now(); lastCycle = -1; });
  document.querySelectorAll('[data-audition]').forEach(b => b.addEventListener('click',() => { stopAudio(); play(b.dataset.audition,true); }));
  addEventListener('keydown',e => {
    if (e.target.matches('button,input,a') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[1-6]$/.test(e.key)) select(Number(e.key)-1);
    if (e.code==='Space') { e.preventDefault(); $('fire').click(); }
    if (e.key.toLowerCase()==='m') $('sound').click();
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) { stopAudio(); if (!paused) pauseAt = performance.now(); }
    else if (!paused) started += performance.now()-pauseAt;
  });
  // A bounded 30 Hz preview, with no timers or audio playing in a hidden tab.
  function tick(now) {
    if (!paused && !document.hidden && now-lastFrame >= 1000/30) {
      lastFrame = now; const elapsed = now-started;
      const cycle = Math.floor(elapsed/2100), age = auto ? elapsed%2100 : manual ? elapsed : 1400;
      if (cycle!==lastCycle) { lastCycle = cycle; impactPlayed = false; if (auto && cycle>0) play('fire'); }
      draw(age);
    }
    requestAnimationFrame(tick);
  }
  select(0); requestAnimationFrame(tick);
  // Deterministic inspection hook used by check-browser.cjs; no game state.
  window.__armory = {
    select, render: age => { if (!paused) $('pause').click(); draw(age); },
    snapshot: () => ({ selected, paused, auto, ammo, generation, weapons:manifest.weapons.length, width:844, height:390 }),
    manifest
  };
})().catch(error => {
  document.getElementById('status').textContent = 'טעינה נכשלה. יש לפתוח דרך שרת מקומי; פרטים בדוח.';
  console.error(error);
});

// מקבץ 3 (29/09): הרץ הקופץ, צפרדע חוצה כביש, מבוך הנקודות, קפיצות לשמיים, יהלומים. שופרו מראש לפי ההנחיה של רועי: מראה, רעיונות ממשחקים דומים, חוקי פסילה, רמות, שמירת התקדמות, והדגמה (peek).
import { POSE, S as SP, KITS } from './sprites.js';
const G = [];

// ---- הרץ הקופץ: כמו הדינוזאור של כרום אבל עם ילד: קופצים (פעמיים באוויר) ומחליקים (החלקה למטה) מתחת לציפורים וענפים. מטבעות, אזורים שמתחלפים (פארק → חוף בשקיעה → עיר בלילה), 3 חיים, האזור נשמר ----
G.push({ id: 'runner', name: 'הרץ הקופץ', emoji: '🏃', how: 'נוגעים כדי לקפוץ (גם פעמיים באוויר), מחליקים למטה כדי להחליק מתחת לציפורים ולענפים. אוספים מטבעות 🪙. הריצה מתגברת, הנוף מתחלף כל 500 מטר. 3 חיים. האזור שהגעת אליו נשמר!',
  make(r, progress) {
    const GY = r.H - 90, PX = 70, ZONE = 5000; /* פיקסלים; 10 פיקסלים = מטר, אזור כל 500 מטר */ let level = Math.max(1, (progress && progress.level) || 1);
    let y = GY, vy = 0, obs = [], coins = [], t = 0, ct = 0, speed = 200 + (level - 1) * 30, dist = (level - 1) * ZONE, jumps = 0, run = 0, duck = 0, lives = 3, inv = 0, tt = 0, stumble = 0, gotCoins = 0;
    const clouds = [{ x: 60, y: 60 }, { x: 250, y: 100 }, { x: 160, y: 40 }];
    const zone = () => 1 + Math.floor(dist / ZONE); const theme = () => ['park', 'beach', 'night'][(zone() - 1) % 3];
    const KINDS = [['poop', 30, 24], ['dog', 44, 30], ['fence', 26, 56], ['puddle', 70, 8], ['bird', 30, 24], ['branch', 60, 22]]; /* שם, רוחב, גובה. bird/branch = גבוהים: מחליקים מתחת */
    const spawn = () => { const pool = KINDS.filter(k => zone() >= 2 || (k[0] !== 'bird' && k[0] !== 'branch')); const [kind, w, h] = r.pick(pool); const high = kind === 'bird' || kind === 'branch'; obs.push({ x: r.W + 30, w, h, kind, y: high ? GY - 62 : GY - h, ph: Math.random() * 6 }); if (Math.random() < .5) { const cx0 = r.W + 30 + r.rnd(120, 220); for (let i = 0; i < 5; i++) coins.push({ x: cx0 + i * 26, y: GY - 70 - Math.sin(i / 4 * Math.PI) * 50 }); } };
    const hurt = () => { if (inv > 0) return; lives--; inv = 1.6; stumble = .5; r.shake(300); r.sfx('over'); if (lives <= 0) return r.over('נתקלת! נגמרו החיים'); r.pop(`אאוץ׳! נשארו ${lives} ❤️`, r.W / 2, GY - 160, '#fff', 22); };
    const box = () => duck > 0 ? [PX - 14, GY - 24, 28, 24] : [PX - 12, y - 44, 24, 44];
    return {
      tap() { if (duck > 0) { duck = 0; } if (y >= GY - 1 || jumps < 2) { vy = -520; jumps++; r.sfx('bounce'); } },
      swipe(d) { if (d === 'down') { if (y < GY - 1) { vy = 900; } duck = .7; r.sfx('tick'); } else if (d === 'up') this.tap(); },
      save() { return { level: Math.max(level, zone()) }; }, revive() { lives = 3; inv = 2; obs = obs.filter(o => o.x > PX + 120); },
      peek() { return { y, GY, PX, obs, coins, duck: duck > 0, speed, box: box() }; },
      update(dt) { tt += dt; inv = Math.max(0, inv - dt); stumble = Math.max(0, stumble - dt); duck = Math.max(0, duck - dt); vy += 1300 * dt; y = Math.min(GY, y + vy * dt); if (y >= GY) { vy = 0; jumps = 0; }
        speed += 5 * dt; t += dt; ct += dt; const step = speed * dt; dist += step; run += dt * speed / 220; clouds.forEach(c => { c.x -= 15 * dt; if (c.x < -50) c.x = r.W + 50; });
        if (t > Math.max(.7, 1.5 - zone() * .1) + r.rnd(0, .5)) { t = 0; spawn(); }
        obs.forEach(o => o.x -= step); obs = obs.filter(o => o.x > -80); coins.forEach(c => c.x -= step); coins = coins.filter(c => c.x > -20 && !c.got);
        if (Math.floor(dist / 50) !== Math.floor((dist - step) / 50)) r.addScore(1);
        if (Math.floor(dist / ZONE) !== Math.floor((dist - step) / ZONE)) { level = Math.max(level, zone()); r.pop(`${theme() === 'beach' ? 'החוף! 🌅' : theme() === 'night' ? 'העיר בלילה 🌃' : 'הפארק 🌳'} · ${Math.floor(dist / 10)} מטר`, r.W / 2, GY - 180, '#fff', 22); r.sfx('win'); }
        const [bx, by, bw, bh] = box();
        for (const c of coins) if (!c.got && r.hit(bx, by, bw, bh, c.x - 10, c.y - 10, 20, 20)) { c.got = true; gotCoins++; r.addScore(5); r.pop('+5', c.x, c.y - 16, r.C.gold, 14); r.sfx('ching'); }
        const hitO = obs.find(o => !o.hit && r.hit(bx + 4, by + 4, bw - 8, bh - 8, o.x, o.y + (o.kind === 'bird' ? Math.sin(tt * 6 + o.ph) * 6 : 0), o.w, o.h)); if (hitO) { hitO.hit = true; const res = hurt(); if (res !== undefined) return res; } },
      draw() { const c = r.ctx, th = theme();
        const sky = c.createLinearGradient(0, 0, 0, GY); if (th === 'park') { sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(1, '#fef3c7'); } else if (th === 'beach') { sky.addColorStop(0, '#f472b6'); sky.addColorStop(.6, '#fb923c'); sky.addColorStop(1, '#fde68a'); } else { sky.addColorStop(0, '#0f172a'); sky.addColorStop(1, '#312e81'); } c.fillStyle = sky; c.fillRect(0, 0, r.W, GY);
        if (th === 'night') { for (let i = 0; i < 30; i++) r.circle((i * 97 + 13) % r.W, (i * 53) % (GY - 120), i % 3 ? 1 : 1.8, `rgba(255,255,255,${.4 + (i % 3) * .2})`); r.circle(300, 60, 22, '#fef3c7'); } else r.circle(300, 60, 26, th === 'beach' ? '#f97316' : '#FBBF24');
        clouds.forEach(cl => SP.cloud(r, cl.x, cl.y));
        /* פרלקסה: גבעות/גלים/בניינים */
        const off = (dist * .3) % 200; c.fillStyle = th === 'park' ? '#86efac' : th === 'beach' ? '#38bdf8' : '#1e1b4b'; if (th === 'night') { for (let i = -1; i < 6; i++) { const bx = i * 80 - off * 1.3 % 80 + 80; const bh = 60 + ((i * 37) % 50); c.fillRect(bx, GY - bh, 50, bh); c.fillStyle = '#fde68a'; for (let wy = GY - bh + 8; wy < GY - 6; wy += 12) for (let wx = bx + 6; wx < bx + 44; wx += 12) if ((wx + wy) % 5 < 3) c.fillRect(wx, wy, 5, 6); c.fillStyle = '#1e1b4b'; } } else { c.beginPath(); c.moveTo(0, GY); for (let x = -20; x <= r.W + 20; x += 10) c.lineTo(x, GY - 30 - Math.sin((x + off * 2) / 60) * 18 - Math.sin((x + off) / 23) * 6); c.lineTo(r.W, GY); c.fill(); }
        const ground = th === 'park' ? '#65a30d' : th === 'beach' ? '#fcd34d' : '#374151'; r.rect(0, GY, r.W, r.H - GY, ground); r.rect(0, GY, r.W, 6, th === 'park' ? '#4d7c0f' : th === 'beach' ? '#f59e0b' : '#6b7280'); for (let i = 0; i < 8; i++) r.rect(((i * 50 - dist) % (r.W + 50) + r.W + 50) % (r.W + 50) - 25, GY + 22, 30, 3, 'rgba(0,0,0,.18)');
        coins.forEach(co => { r.circle(co.x, co.y, 9, '#f59e0b'); r.circle(co.x, co.y, 6, '#fde047'); r.text('₪', co.x, co.y + 1, { size: 9, color: '#b45309' }); });
        obs.forEach(o => { const oy = o.y + (o.kind === 'bird' ? Math.sin(tt * 6 + o.ph) * 6 : 0);
          if (o.kind === 'poop') SP.poop(r, o.x + o.w / 2, GY - 2, .9); else if (o.kind === 'dog') { r.rect(o.x, GY - 22, o.w, 22, '#b45309', 10); r.circle(o.x + o.w - 4, GY - 26, 12, '#b45309'); r.circle(o.x + o.w + 2, GY - 30, 3, '#111'); r.rect(o.x + o.w - 16, GY - 40, 8, 14, '#92400e', 4); r.text('z', o.x + o.w + 12, GY - 44 - Math.sin(tt * 2) * 4, { size: 12, color: '#fff' }); }
          else if (o.kind === 'fence') { for (let i = 0; i < 3; i++) r.rect(o.x + i * 10, GY - o.h + (i === 1 ? -6 : 0), 6, o.h + (i === 1 ? 6 : 0), '#a16207', 2); r.rect(o.x - 4, GY - o.h + 14, o.w + 8, 5, '#ca8a04'); r.rect(o.x - 4, GY - o.h + 34, o.w + 8, 5, '#ca8a04'); }
          else if (o.kind === 'puddle') { c.fillStyle = '#38bdf8'; c.beginPath(); c.ellipse(o.x + o.w / 2, GY, o.w / 2, 7, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(o.x + o.w / 2 - 10, GY - 2, 12, 2.5, 0, 0, Math.PI * 2); c.fill(); }
          else if (o.kind === 'bird') SP.bird(r, o.x + o.w / 2, oy + o.h / 2, Math.sin(tt * 12) * 8, '#f472b6');
          else { r.rect(o.x, oy, o.w, 8, '#78350f', 4); r.circle(o.x + 12, oy + 4, 10, '#16a34a'); r.circle(o.x + 34, oy + 2, 12, '#15803d'); r.circle(o.x + 52, oy + 6, 9, '#16a34a'); } });
        if (!(inv > 0 && Math.sin(tt * 30) > 0)) { if (duck > 0) { c.save(); c.translate(PX, GY); c.scale(1.15, .55); r.player(POSE.squat, 0, 0, 0.5, KITS.orange); c.restore(); } else r.player(y < GY - 2 ? POSE.leap : r.anim(POSE.run, run * 1000), PX, y, 0.5, KITS.orange); }
        if (stumble > 0) r.emoji('💫', PX, y - 60, 22);
        r.text(`${Math.floor(dist / 10)} מ׳ · ${'❤️'.repeat(Math.max(0, lives))} · 🪙 ${gotCoins}`, r.W / 2, 24, { size: 14, color: th === 'night' ? '#e2e8f0' : '#78350f' }); },
    };
  } });

// ---- צפרדע חוצה כביש: כמו פרוגר המקורי: 4 נתיבי כביש (מכוניות ומשאיות), מדרכה, נהר עם בולי עץ וצבים (רוכבים עליהם, במים נופלים), 5 בתים בחבצלות למעלה + זבוב בונוס. רמות, 3 חיים, הרמה נשמרת ----
G.push({ id: 'frogger', name: 'צפרדע חוצה כביש', emoji: '🐸', how: 'מחליקים למעלה, למטה, ימינה או שמאלה. חוצים את הכביש בין המכוניות, ואז את הנהר על בולי עץ וצבים (במים נופלים!). ממלאים את 5 הבתים למעלה. זבוב 🪰 = בונוס. 3 חיים, הרמה נשמרת.',
  make(r, progress) {
    const S = 40, COLS = 9, ROWS = 14, OY = r.H - ROWS * S; let level = Math.max(1, (progress && progress.level) || 1);
    let fx = 4, fy = ROWS - 1, lanes = [], homes = [false, false, false, false, false], lives = 3, hop = 0, tt = 0, fly = { home: 1, t: 0 }, ride = null, dead = 0, msg = '', msgT = 0;
    /* שורות: 13 דשא התחלה, 9-12 כביש, 8 מדרכה, 3-7 נהר, 2 גדה עם הבתים, 0-1 שמיים/דשא */
    const ROAD = [9, 10, 11, 12], RIVER = [3, 4, 5, 6, 7], HOME_ROW = 2, homeX = i => 1 + i * 1.75;
    const build = () => { lanes = []; const k = 1 + (level - 1) * .15;
      ROAD.forEach((y, i) => { const dir = i % 2 ? 1 : -1, sp = (55 + i * 18 + r.rnd(0, 30)) * k, truck = i === 1 || (level >= 3 && i === 3); const n = 2 + (level >= 2 ? 1 : 0); const items = []; for (let j = 0; j < n; j++) items.push({ x: j * (r.W + 80) / n + r.rnd(0, 40), w: truck ? 84 : 46, color: r.pick(['#EF4444', '#3B82F6', '#F59E0B', '#22C55E', '#A855F7', '#ec4899']), truck }); lanes.push({ y, dir, sp, items, kind: 'road' }); });
      RIVER.forEach((y, i) => { const dir = i % 2 ? -1 : 1, sp = (40 + i * 12 + r.rnd(0, 20)) * k, turtle = i === 1 || i === 3; const items = []; const n = 3; for (let j = 0; j < n; j++) items.push({ x: j * (r.W + 100) / n + r.rnd(0, 30), w: turtle ? 100 : r.pick([90, 130, 160]), turtle, dive: turtle && level >= 2 && j === 0 ? Math.random() * 6 : -1 }); lanes.push({ y, dir, sp, items, kind: 'river' }); }); };
    build();
    const respawn = () => { fx = 4; fy = ROWS - 1; ride = null; };
    const die = why => { lives--; dead = .9; r.shake(300); r.burst(fx * S + S / 2, OY + fy * S + S / 2, why === 'water' ? '#38bdf8' : '#22c55e', 16, 200); r.sfx('over'); if (lives <= 0) return r.over(why === 'water' ? 'נפלת למים!' : 'נדרסת!'); r.pop(`${why === 'water' ? 'פלופ! 💦' : 'אאוץ׳!'} נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); respawn(); };
    const frogPx = () => fx * S + S / 2;
    return {
      swipe(d) { if (dead > 0) return; ride = null; if (d === 'up') fy--; if (d === 'down') fy = Math.min(ROWS - 1, fy + 1); if (d === 'left') fx = Math.max(0, fx - 1); if (d === 'right') fx = Math.min(COLS - 1, fx + 1); hop = .18; r.sfx('tick');
        if (d === 'up') r.addScore(10);
        if (fy === HOME_ROW) { const i = [0, 1, 2, 3, 4].find(i => Math.abs(homeX(i) + .5 - (fx + .5)) < .9); if (i == null || homes[i]) { return die('water'); } homes[i] = true; let pts = 50; if (fly.home === i && fly.t > 0) { pts += 100; r.pop('זבוב! +100 🪰', frogPx(), OY + HOME_ROW * S, r.C.gold, 22); fly.t = 0; } r.addScore(pts); r.sfx('score'); r.burst(frogPx(), OY + HOME_ROW * S + 20, '#22c55e', 14, 200);
          if (homes.every(Boolean)) { level++; r.addScore(200); homes = [false, false, false, false, false]; build(); respawn(); r.win(`כל הבתים מלאים! רמה ${level}`, 0); return; } respawn(); } },
      save() { return { level }; }, revive() { lives = 3; dead = 0; respawn(); },
      peek() { return { fx, fy, S, OY, lanes, homes, HOME_ROW, homeX, ROWS, dead: dead > 0 }; },
      update(dt) { tt += dt; hop = Math.max(0, hop - dt); msgT -= dt; dead = Math.max(0, dead - dt); fly.t -= dt; if (fly.t < -6) { fly.home = r.rint(0, 4); fly.t = 7; }
        for (const l of lanes) for (const it of l.items) { it.x += l.dir * l.sp * dt; if (it.x > r.W + it.w) it.x = -it.w; if (it.x < -it.w) it.x = r.W + it.w; if (it.dive >= 0) { it.dive += dt; if (it.dive > 7) it.dive = 0; } }
        if (dead > 0) return;
        const lane = lanes.find(l => l.y === fy);
        if (lane && lane.kind === 'road') { const px = frogPx(); if (lane.items.some(it => px > it.x - it.w / 2 - 14 && px < it.x + it.w / 2 + 14)) return die('car'); }
        if (lane && lane.kind === 'river') { const px = frogPx(); const on = lane.items.find(it => px > it.x - it.w / 2 - 6 && px < it.x + it.w / 2 + 6 && !(it.dive >= 0 && it.dive > 5)); if (!on) return die('water'); ride = { lane, it: on }; const nx = px + lane.dir * lane.sp * dt; fx = r.clamp((nx - S / 2) / S, 0, COLS - 1); if (nx < 10 || nx > r.W - 10) return die('water'); } },
      draw() { const c = r.ctx; r.clear('#65a30d');
        r.rect(0, OY + 8 * S, r.W, S, '#a8a29e'); r.rect(0, OY + 8 * S + S - 4, r.W, 4, '#78716c'); /* מדרכה */
        r.rect(0, OY + 9 * S, r.W, 4 * S, '#374151'); for (let j = 10; j < 13; j++) for (let x = 0; x < r.W; x += 30) r.rect(x, OY + j * S - 1, 16, 2, '#fde68a'); r.rect(0, OY + 9 * S, r.W, 3, '#fff'); r.rect(0, OY + 13 * S - 3, r.W, 3, '#fff');
        const wg = c.createLinearGradient(0, OY + 3 * S, 0, OY + 8 * S); wg.addColorStop(0, '#1d4ed8'); wg.addColorStop(1, '#38bdf8'); c.fillStyle = wg; c.fillRect(0, OY + 3 * S, r.W, 5 * S); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; for (let j = 3; j < 8; j++) { c.beginPath(); for (let x = 0; x <= r.W; x += 8) c.lineTo(x, OY + j * S + S / 2 + Math.sin((x + tt * 40) / 18 + j) * 3); c.stroke(); }
        r.rect(0, OY + 2 * S, r.W, S, '#15803d'); [0, 1, 2, 3, 4].forEach(i => { const hx = homeX(i) * S + S / 2; r.rect(hx - 18, OY + 2 * S + 4, 36, S - 8, '#1d4ed8', 6); r.circle(hx, OY + 2 * S + S / 2, 15, '#4ade80'); c.fillStyle = '#1d4ed8'; c.beginPath(); c.moveTo(hx, OY + 2 * S + S / 2); c.arc(hx, OY + 2 * S + S / 2, 15, -.3, .3); c.fill(); if (homes[i]) SP.frog(r, hx, OY + 2 * S + S / 2 + 2); else if (fly.home === i && fly.t > 0) r.emoji('🪰', hx, OY + 2 * S + S / 2, 18); });
        lanes.forEach(l => { const cy = OY + l.y * S + S / 2; l.items.forEach(it => { if (l.kind === 'road') { c.save(); c.translate(it.x, cy); c.rotate(l.dir > 0 ? -Math.PI / 2 : Math.PI / 2); SP.car(r, 0, 0, 28, it.w, it.color, 1); c.restore(); if (it.truck) r.rect(it.x - it.w / 2 + 6, cy - 12, it.w - 30, 24, '#e5e7eb', 4); }
            else if (it.turtle) { const under = it.dive >= 0 && it.dive > 5; for (let k = -1; k <= 1; k++) { const tx = it.x + k * 32; if (under) { r.circle(tx, cy, 12, 'rgba(34,197,94,.35)'); continue; } r.circle(tx, cy, 14, '#15803d'); r.circle(tx, cy, 9, '#22c55e'); r.circle(tx + l.dir * 15, cy, 5, '#4ade80'); } if (it.dive >= 0 && it.dive > 4 && !under) r.text('~', it.x, cy - 18, { size: 12, color: '#fff' }); }
            else { r.rect(it.x - it.w / 2, cy - 13, it.w, 26, '#92400e', 12); r.rect(it.x - it.w / 2 + 6, cy - 8, it.w - 12, 4, '#b45309', 2); r.circle(it.x - it.w / 2 + 8, cy, 8, '#a16207'); r.circle(it.x + it.w / 2 - 8, cy, 8, '#a16207'); } }); });
        if (dead <= 0) { c.save(); c.translate(frogPx(), OY + fy * S + S / 2); const k = 1 + hop * 2; c.scale(k, k); SP.frog(r, 0, 0); c.restore(); }
        r.text(`רמה ${level} · ${'❤️'.repeat(Math.max(0, lives))} · בתים ${homes.filter(Boolean).length}/5`, r.W / 2, OY + 14 * S - 12, { size: 13, color: '#fff' }); },
    };
  } });

// ---- מבוך הנקודות: כמו פקמן: תנועה חלקה, 4 רוחות בצבעים עם אישיות (רודף, חוסם, אקראי, עצלן), גלולות כוח שהופכות את הרוחות לכחולות ואוכלות אותן, פירות בונוס, מעברים בצדדים, 3 מבוכים לפי רמה, 3 חיים, הרמה נשמרת ----
G.push({ id: 'dots-maze', name: 'מבוך הנקודות', emoji: '🟡', how: 'מחליקים לכיוון. אוכלים את כל הנקודות ובורחים מהרוחות. גלולה גדולה = הרוחות נהיות כחולות ואפשר לאכול אותן! פרי 🍒 = בונוס. המעברים בצדדים מעבירים לצד השני. 3 חיים, הרמה נשמרת.',
  make(r, progress) {
    const MAZES = [
      ['###########', '#....#....#', '#O##.#.##O#', '#.........#', '#.#.###.#.#', '....#g#....', '#.#.###.#.#', '#.........#', '#.##.#.##.#', '#O...#...O#', '#.##.#.##.#', '#.........#', '###########'],
      ['###########', '#O.......O#', '#.##.#.##.#', '#.#.....#.#', '#.#.###.#.#', '#...#g#...#', '....###....', '#.#.....#.#', '#.#.#.#.#.#', '#O..#.#..O#', '#.#.....#.#', '#.........#', '###########'],
      ['###########', '#.........#', '#O#.#.#.#O#', '#.#.....#.#', '#...###...#', '....#g#....', '#.#.###.#.#', '#.#.....#.#', '#.###.###.#', '#O...#...O#', '#.#.#.#.#.#', '#.........#', '###########'],
    ];
    let level = Math.max(1, (progress && progress.level) || 1); const M = MAZES[(level - 1) % MAZES.length].map(s => s.split(''));
    const COLS = 11, ROWS = 13, S = 32, OX = (r.W - COLS * S) / 2, OY = 46;
    const cell = (x, y) => (M[y] && M[y][((x % COLS) + COLS) % COLS]) || '#'; const free = (x, y) => cell(x, y) !== '#';
    const dots = new Set(), power = new Set(); let gate = { x: 5, y: 5 }; M.forEach((row, y) => row.forEach((ch, x) => { if (ch === '.') dots.add(x + ',' + y); if (ch === 'O') power.add(x + ',' + y); if (ch === 'g') gate = { x, y }; }));
    const totalDots = dots.size + power.size;
    const GHOSTS = [['#ef4444', 'chase'], ['#f472b6', 'ambush'], ['#22d3ee', 'random'], ['#fb923c', 'lazy']];
    let p, ghosts, fright = 0, lives = 3, tt = 0, fruit = null, fruitT = 0, eaten = 0, dying = 0, combo = 0;
    const speed = () => 5 + level * .6, gspeed = () => 3.6 + level * .5;
    const resetPos = () => { p = { x: 5, y: 11, tx: 5, ty: 11, k: 1, d: [0, 0], want: [0, 0], face: [1, 0] }; ghosts = GHOSTS.map(([c, ai], i) => ({ x: gate.x, y: gate.y - 1, tx: gate.x, ty: gate.y - 1, k: 1, d: [i % 2 ? 1 : -1, 0], c, ai, dead: 0, wait: i * 1.2 })); fright = 0; };
    resetPos(); dots.delete('5,11');
    const nextCell = (o) => [o.tx, o.ty];
    const move = (o, sp, dt, choose) => { if (o.k < 1) { o.k = Math.min(1, o.k + sp * dt); o.x = o.fx + (o.tx - o.fx) * o.k; o.y = o.fy + (o.ty - o.fy) * o.k; if (o.k >= 1) { o.x = ((o.tx % COLS) + COLS) % COLS; o.y = o.ty; o.tx = o.x; o.ty = o.y; } return; }
      const d = choose(o); if (!d) return; o.d = d; o.fx = o.x; o.fy = o.y; o.tx = o.x + d[0]; o.ty = o.y + d[1]; o.k = 0; };
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const ghostChoose = g => { const opts = dirs.filter(d => free(g.x + d[0], g.y + d[1]) && !(d[0] === -g.d[0] && d[1] === -g.d[1])); if (!opts.length) return [-g.d[0], -g.d[1]];
      const tgt = fright > 0 ? { x: g.x + (g.x - p.x) * 3, y: g.y + (g.y - p.y) * 3 } : g.ai === 'chase' ? p : g.ai === 'ambush' ? { x: p.x + p.face[0] * 3, y: p.y + p.face[1] * 3 } : g.ai === 'lazy' ? (r.dist(g.x, g.y, p.x, p.y) < 5 ? p : { x: 1, y: 11 }) : null;
      if (!tgt || Math.random() < .2) return r.pick(opts); return opts.sort((a, b) => r.dist(g.x + a[0], g.y + a[1], tgt.x, tgt.y) - r.dist(g.x + b[0], g.y + b[1], tgt.x, tgt.y))[0]; };
    const loseLife = () => { lives--; dying = 1; r.shake(300); r.sfx('over'); r.burst(OX + (p.x + .5) * S, OY + (p.y + .5) * S, r.C.gold, 20, 200); if (lives <= 0) return r.over('הרוחות תפסו אותך!'); r.pop(`נתפסת! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); };
    return {
      swipe(d) { p.want = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d]; },
      save() { return { level }; }, revive() { lives = 3; dying = 0; resetPos(); },
      peek() { return { p, ghosts, dots, power, fright: fright > 0, S, OX, OY, COLS, ROWS, free, fruit }; },
      update(dt) { tt += dt; fright = Math.max(0, fright - dt); fruitT -= dt; if (dying > 0) { dying -= dt; if (dying <= 0) resetPos(); return; }
        move(p, speed(), dt, o => { if (free(o.x + o.want[0], o.y + o.want[1]) && (o.want[0] || o.want[1])) { o.face = o.want; return o.want; } if ((o.d[0] || o.d[1]) && free(o.x + o.d[0], o.y + o.d[1])) return o.d; return null; });
        const key = p.x + ',' + p.y; if (p.k >= 1) { if (dots.has(key)) { dots.delete(key); eaten++; r.addScore(10); if (eaten % 25 === 0 && !fruit) { fruit = { x: gate.x, y: gate.y + 2, e: r.pick(['🍒', '🍓', '🍌', '🍉']) }; fruitT = 9; } } if (power.has(key)) { power.delete(key); eaten++; fright = 7; combo = 0; r.addScore(50); r.pop('כוח! אוכלים רוחות 💪', r.W / 2, OY - 14, r.C.gold, 18); r.sfx('score'); ghosts.forEach(g => { if (!g.dead) g.d = [-g.d[0], -g.d[1]]; }); }
          if (fruit && fruit.x === p.x && fruit.y === p.y) { r.addScore(100 * level); r.pop(`${fruit.e} +${100 * level}`, OX + (p.x + .5) * S, OY + p.y * S, r.C.gold, 22); fruit = null; r.sfx('ching'); } }
        if (fruit && fruitT <= 0) fruit = null;
        for (const g of ghosts) { if (g.wait > 0) { g.wait -= dt; continue; } if (g.dead > 0) { g.dead -= dt; if (g.dead <= 0) { g.x = g.tx = gate.x; g.y = g.ty = gate.y - 1; g.k = 1; } continue; } move(g, fright > 0 ? gspeed() * .6 : gspeed(), dt, ghostChoose);
          if (r.dist(g.x, g.y, p.x, p.y) < .6) { if (fright > 0) { combo++; const pts = 200 * combo; r.addScore(pts); r.pop(`+${pts} 👻`, OX + (g.x + .5) * S, OY + g.y * S, r.C.sky, 20); r.sfx('hit'); g.dead = 3; g.x = g.tx = -9; g.y = g.ty = -9; g.k = 1; } else { const res = loseLife(); if (res !== undefined) return res; return; } } }
        if (!dots.size && !power.size) { level++; r.addScore(500); r.win(`אכלת הכול! רמה ${level}`, 0); const NM = MAZES[(level - 1) % MAZES.length]; NM.forEach((row, y) => [...row].forEach((ch, x) => { M[y][x] = ch; if (ch === '.') dots.add(x + ',' + y); if (ch === 'O') power.add(x + ',' + y); if (ch === 'g') gate = { x, y }; })); resetPos(); dots.delete('5,11'); } },
      draw() { const c = r.ctx; r.clear('#0B1026');
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (M[y][x] === '#') { const px = OX + x * S, py = OY + y * S; c.fillStyle = '#1e3a8a'; c.fillRect(px, py, S, S); c.strokeStyle = '#60a5fa'; c.lineWidth = 2; if (!free(x, y - 1) === false) c.beginPath(), c.moveTo(px, py + 1), c.lineTo(px + S, py + 1), c.stroke(); if (free(x, y + 1)) c.beginPath(), c.moveTo(px, py + S - 1), c.lineTo(px + S, py + S - 1), c.stroke(); if (free(x - 1, y) && x > 0) c.beginPath(), c.moveTo(px + 1, py), c.lineTo(px + 1, py + S), c.stroke(); if (free(x + 1, y) && x < COLS - 1) c.beginPath(), c.moveTo(px + S - 1, py), c.lineTo(px + S - 1, py + S), c.stroke(); }
        dots.forEach(k => { const [x, y] = k.split(',').map(Number); r.circle(OX + x * S + S / 2, OY + y * S + S / 2, 3.5, '#fde68a'); }); power.forEach(k => { const [x, y] = k.split(',').map(Number); r.circle(OX + x * S + S / 2, OY + y * S + S / 2, 8 + Math.sin(tt * 6) * 2, r.C.gold); });
        if (fruit) r.emoji(fruit.e, OX + fruit.x * S + S / 2, OY + fruit.y * S + S / 2, 24);
        ghosts.forEach(g => { if (g.dead > 0 || g.wait > 0 && g.x < 0) return; const gx = OX + (g.x + .5) * S, gy = OY + (g.y + .5) * S; const col = fright > 0 ? (fright < 2 && Math.sin(tt * 14) > 0 ? '#e2e8f0' : '#3b82f6') : g.c; c.fillStyle = col; c.beginPath(); c.arc(gx, gy - 2, 13, Math.PI, 0); c.lineTo(gx + 13, gy + 10); for (let i = 0; i < 3; i++) c.quadraticCurveTo(gx + 13 - (i * 2 + 1) * 13 / 3, gy + 6 + Math.sin(tt * 12 + i) * 3, gx + 13 - (i + 1) * 26 / 3, gy + 10); c.closePath(); c.fill(); if (fright > 0) { r.circle(gx - 5, gy - 3, 2, '#fff'); r.circle(gx + 5, gy - 3, 2, '#fff'); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx - 7, gy + 5); for (let i = 0; i < 4; i++) c.lineTo(gx - 7 + (i + 1) * 3.5, gy + 5 + (i % 2 ? 0 : -3)); c.stroke(); } else { for (const ex of [-5, 5]) { r.circle(gx + ex, gy - 4, 4, '#fff'); r.circle(gx + ex + g.d[0] * 2, gy - 4 + g.d[1] * 2, 2, '#1e3a8a'); } } });
        if (dying <= 0) { const px = OX + (p.x + .5) * S, py = OY + (p.y + .5) * S; const ang = Math.atan2(p.face[1], p.face[0]); const mouth = .25 + Math.abs(Math.sin(tt * 12)) * .55; c.fillStyle = r.C.gold; c.beginPath(); c.moveTo(px, py); c.arc(px, py, 14, ang + mouth, ang - mouth + Math.PI * 2); c.closePath(); c.fill(); r.circle(px + Math.cos(ang - 1.3) * 7, py + Math.sin(ang - 1.3) * 7, 2.2, '#1B1740'); }
        r.text(`רמה ${level} · ${'❤️'.repeat(Math.max(0, lives))} · ${Math.round((1 - (dots.size + power.size) / totalDots) * 100)}%`, r.W / 2, 22, { size: 14, color: '#c4b5fd' }); },
    };
  } });

// ---- קפיצות לשמיים: כמו דודל ג'אמפ: פלטפורמות רגילות/נעות/מתפרקות/עננים, קפיץ, טרמפולינה, מפלצות (קופצים עליהן = +50, מהצד = חיים), ג'טפק 🚀 וכובע פרופלור. השמיים משתנים עם הגובה (שמיים → שקיעה → חלל). 3 חיים, נקודת ביקורת כל 1500 מטר נשמרת ----
G.push({ id: 'doodle', name: 'קפיצות לשמיים', emoji: '🐰', how: 'הקופץ קופץ לבד. מזיזים אותו ימינה ושמאלה עם האצבע (יוצאים מצד אחד ונכנסים מהשני). פלטפורמות ירוקות רגילות, כחולות זזות, חומות מתפרקות, עננים נעלמים. קפיץ וטרמפולינה מעיפים, 🚀 ג׳טפק טס. מפלצות: קופצים עליהן מלמעלה! 3 חיים. כל 1500 מטר נקודת ביקורת שנשמרת.',
  make(r, progress) {
    const ZONE = 1500; let level = Math.max(1, (progress && progress.level) || 1);
    let x = r.W / 2, y = r.H - 100, vy = -600, plats = [], height = (level - 1) * ZONE, lives = 3, inv = 0, tt = 0, jet = 0, prop = 0, monsters = [], items = [], face = 1, best = 0;
    const mkPlat = (py) => { const L = 1 + Math.floor(height / ZONE); const roll = Math.random(); const kind = roll < .12 + L * .02 ? 'moving' : roll < .22 + L * .03 ? 'break' : roll < .28 + L * .02 ? 'cloud' : 'normal'; const p = { x: r.rnd(40, r.W - 40), y: py, kind, vx: kind === 'moving' ? r.pick([-1, 1]) * (50 + L * 12) : 0, spring: kind === 'normal' && Math.random() < .1, tramp: kind === 'normal' && Math.random() < .04, gone: 0 }; if (kind === 'normal' && Math.random() < .05) items.push({ x: p.x, y: py - 22, kind: Math.random() < .5 ? 'jet' : 'prop' }); if (L >= 2 && kind === 'normal' && Math.random() < .08 + L * .015 && !p.spring) monsters.push({ x: p.x, y: py - 26, vx: r.pick([-1, 1]) * 40, ph: Math.random() * 6 }); return p; };
    for (let i = 0; i < 9; i++) plats.push({ ...mkPlat(r.H - 40 - i * 65), kind: i < 2 ? 'normal' : undefined }); plats.forEach((p, i) => { if (!p.kind) plats[i] = mkPlat(p.y); }); plats[0].x = r.W / 2; plats[0].kind = 'normal';
    const hurt = () => { if (inv > 0) return; lives--; inv = 2; r.shake(300); r.sfx('over'); if (lives <= 0) return r.over('נפלת!'); const top = plats.filter(p => p.y > 80 && p.y < r.H - 60 && p.kind !== 'break' && p.kind !== 'cloud').sort((a, b) => a.y - b.y)[0] || plats[0]; x = top.x; y = top.y - 30; vy = -620; monsters = []; r.pop(`אופס! נשארו ${lives} ❤️`, r.W / 2, r.H / 2, '#fff', 22); };
    return {
      move(px) { face = px < x ? -1 : 1; x = px; }, down(px) { this.move(px); },
      save() { return { level: Math.max(level, 1 + Math.floor(height / ZONE)) }; }, revive() { lives = 3; inv = 2.5; monsters = []; const top = plats.filter(p => p.y > 60 && p.y < r.H - 40).sort((a, b) => a.y - b.y)[0]; if (top) { x = top.x; y = top.y - 30; } vy = -700; },
      peek() { return { x, y, vy, plats, monsters, items, jet: jet > 0 }; },
      update(dt) { tt += dt; inv = Math.max(0, inv - dt); jet = Math.max(0, jet - dt); prop = Math.max(0, prop - dt);
        if (jet > 0) vy = -900; else if (prop > 0) vy = -420; else vy += 1000 * dt; y += vy * dt; if (x < -10) x = r.W + 10; if (x > r.W + 10) x = -10;
        plats.forEach(p => { if (p.kind === 'moving') { p.x += p.vx * dt; if (p.x < 40 || p.x > r.W - 40) p.vx *= -1; } if (p.gone > 0) p.gone += dt; }); monsters.forEach(m => { m.x += m.vx * dt; if (m.x < 30 || m.x > r.W - 30) m.vx *= -1; });
        if (vy > 0 && jet <= 0) for (const p of plats) { if (p.gone > 0) continue; if (Math.abs(x - p.x) < 40 && y + 16 > p.y - 6 && y + 16 < p.y + 12) { if (p.kind === 'break') { p.gone = .01; r.sfx('tick'); continue; } if (p.kind === 'cloud') p.gone = .01; vy = p.tramp ? -1150 : p.spring ? -900 : -620; r.sfx(p.spring || p.tramp ? 'score' : 'bounce'); if (p.tramp) r.pop('טרמפולינה! 🤸', x, y - 40, r.C.hot, 20); else if (p.spring) r.pop('קפיץ!', x, y - 40, r.C.hot); break; } }
        for (const it of items) if (!it.got && r.dist(it.x, it.y, x, y) < 30) { it.got = true; if (it.kind === 'jet') { jet = 2.2; r.pop('ג׳טפק! 🚀', x, y - 40, r.C.gold, 22); r.sfx('roar'); } else { prop = 2.5; r.pop('כובע פרופלור! 🧢', x, y - 40, r.C.sky, 22); r.sfx('score'); } }
        for (const m of monsters) { if (m.dead) continue; const d = Math.abs(x - m.x); if (d < 26 && Math.abs(y - m.y) < 30) { if (jet > 0 || (vy > 0 && y < m.y - 4)) { m.dead = true; vy = -620; r.addScore(50); r.pop('+50 👾', m.x, m.y - 30, r.C.gold, 20); r.burst(m.x, m.y, '#a855f7', 14, 200); r.sfx('hit'); } else { const res = hurt(); if (res !== undefined) return res; m.dead = true; } } }
        if (y < r.H / 2) { const d = r.H / 2 - y; y = r.H / 2; height += d; plats.forEach(p => p.y += d); monsters.forEach(m => m.y += d); items.forEach(it => it.y += d); r.setScore(Math.floor(height / 10) + monsters.filter(m => m.dead).length * 5); if (Math.floor(height / ZONE) !== Math.floor((height - d) / ZONE)) { level = Math.max(level, 1 + Math.floor(height / ZONE)); r.pop(`נקודת ביקורת! ${Math.floor(height)} מטר 🏁`, r.W / 2, 140, '#fff', 22); r.sfx('win'); } }
        plats = plats.filter(p => p.y < r.H + 20 && !(p.gone > 1)); monsters = monsters.filter(m => m.y < r.H + 40 && !m.dead); items = items.filter(it => it.y < r.H + 20 && !it.got);
        while (plats.length < 9) { const top = Math.min(...plats.map(p => p.y)); plats.push(mkPlat(top - r.rnd(55, 80 + Math.min(30, height / 400)))); }
        if (y > r.H + 20) { const res = hurt(); if (res !== undefined) return res; } },
      draw() { const c = r.ctx; const k = Math.min(1, height / 4500); const sky = c.createLinearGradient(0, 0, 0, r.H); if (k < .5) { const u = k / .5; sky.addColorStop(0, u < .5 ? '#7dd3fc' : '#c084fc'); sky.addColorStop(1, u < .5 ? '#e0f2fe' : '#fdba74'); } else { sky.addColorStop(0, '#020617'); sky.addColorStop(1, '#312e81'); } c.fillStyle = sky; c.fillRect(0, 0, r.W, r.H);
        if (k >= .5) for (let i = 0; i < 40; i++) r.circle((i * 97) % r.W, ((i * 173) + height * .2) % r.H, i % 3 ? 1 : 1.8, `rgba(255,255,255,${.3 + (i % 4) * .15})`); else for (let i = 0; i < 4; i++) SP.cloud(r, (i * 110 + height * .1) % (r.W + 60) - 30, (i * 130 + height * .05) % r.H, 1.2);
        plats.forEach(p => { const a = p.gone > 0 ? Math.max(0, 1 - p.gone) : 1; c.globalAlpha = a; if (p.kind === 'cloud') { SP.cloud(r, p.x, p.y + 6, .9); } else { const col = p.kind === 'moving' ? '#0ea5e9' : p.kind === 'break' ? '#a16207' : '#16A34A'; r.rect(p.x - 36, p.y + (p.gone > 0 ? p.gone * 40 : 0), 72, 12, col, 6); r.rect(p.x - 30, p.y + 2 + (p.gone > 0 ? p.gone * 40 : 0), 60, 3, p.kind === 'moving' ? '#7dd3fc' : p.kind === 'break' ? '#fbbf24' : '#4ADE80', 2); if (p.kind === 'break') { c.strokeStyle = '#78350f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p.x - 10, p.y); c.lineTo(p.x - 4, p.y + 7); c.lineTo(p.x + 4, p.y + 4); c.lineTo(p.x + 9, p.y + 12); c.stroke(); } if (p.spring) { r.rect(p.x - 10, p.y - 8, 20, 8, r.C.hot, 3); r.rect(p.x - 6, p.y - 4, 12, 4, '#fff8', 2); } if (p.tramp) { r.rect(p.x - 22, p.y - 6, 44, 6, '#1f2937', 3); r.line(p.x - 20, p.y - 6, p.x + 20, p.y - 6, '#facc15', 2); } } c.globalAlpha = 1; });
        items.forEach(it => r.emoji(it.kind === 'jet' ? '🚀' : '🧢', it.x, it.y, 22));
        monsters.forEach(m => { r.circle(m.x, m.y + 3, 18, 'rgba(0,0,0,.2)'); c.fillStyle = '#a855f7'; c.beginPath(); c.arc(m.x, m.y, 16, Math.PI, 0); c.lineTo(m.x + 16, m.y + 10); for (let i = 0; i < 4; i++) c.lineTo(m.x + 16 - (i + .5) * 8, m.y + 6 + Math.sin(tt * 10 + i) * 3), c.lineTo(m.x + 16 - (i + 1) * 8, m.y + 10); c.closePath(); c.fill(); r.circle(m.x - 5, m.y - 4, 5, '#fff'); r.circle(m.x + 5, m.y - 4, 5, '#fff'); r.circle(m.x - 5 + Math.sign(m.vx) * 2, m.y - 4, 2.5, '#111'); r.circle(m.x + 5 + Math.sign(m.vx) * 2, m.y - 4, 2.5, '#111'); c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.arc(m.x, m.y + 4, 6, .2, Math.PI - .2); c.stroke(); });
        if (!(inv > 0 && Math.sin(tt * 30) > 0)) { c.save(); c.translate(x, 0); if (face < 0) c.scale(-1, 1); r.player(vy < 0 ? POSE.hop : POSE.front, 0, y + 16, 0.36, KITS.blue); c.restore(); if (jet > 0) { r.emoji('🚀', x, y + 22, 22); for (let i = 0; i < 3; i++) r.circle(x + r.rnd(-6, 6), y + 34 + i * 10, 5 - i, i ? '#fb923c' : '#fde047'); } if (prop > 0) { r.rect(x - 14, y - 44, 28, 6, '#ef4444', 3); r.rect(x - 2, y - 50, 4, 8, '#1f2937'); r.rect(x - 16 * Math.abs(Math.sin(tt * 30)), y - 52, 32 * Math.abs(Math.sin(tt * 30)), 3, '#e5e7eb'); } }
        r.text(`${Math.floor(height)} מ׳ · ${'❤️'.repeat(Math.max(0, lives))}${jet > 0 ? ' · 🚀' : prop > 0 ? ' · 🧢' : ''}`, r.W / 2, 22, { size: 14, color: k >= .5 ? '#e2e8f0' : '#1e3a8a' }); },
    };
  } });

// ---- יהלומים (Columns): טור של 3 יהלומים נופל; יהלומים מלוטשים בצורות שונות, צל של מקום הנחיתה, הטור הבא, קומבו, פלאש במחיקה, רמה כל 8 מחיקות (מהר יותר, נשמר). נפסלים כשהלוח מלא; "להמשיך" מנקה את החצי העליון ----
G.push({ id: 'gems', name: 'יהלומים', emoji: '💎', how: 'טור של שלושה יהלומים נופל. מחליקים להזיז, נוגעים להחליף סדר, מחליקים למטה להפיל. 3 זהים בשורה, בטור או באלכסון נעלמים. שרשרת = קומבו. כל 8 מחיקות רמה (מהר יותר). הלוח מלא = נפסלת. הרמה נשמרת.',
  make(r, progress) {
    const COLS = 6, ROWS = 13, S = 36, OX = (r.W - COLS * S) / 2, OY = 44, COLORS = ['#f472b6', '#fbbf24', '#38bdf8', '#a3e635', '#c084fc', '#fb7185'];
    let level = Math.max(1, (progress && progress.level) || 1); const NCOL = () => Math.min(6, 4 + Math.floor(level / 3));
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0)); let cur, next, t = 0, clears = 0, tt = 0, flash = [], flashT = 0, combo = 0, lastCombo = 0;
    const speed = () => Math.max(.14, .55 - (level - 1) * .05);
    const mk = () => ({ x: 2, y: -2, c: [0, 1, 2].map(() => r.rint(1, NCOL())) });
    const spawn = () => { cur = next || mk(); next = mk(); if (grid[0][2] || grid[1][2]) { cur = null; return r.over('הלוח מלא!'); } };
    const free = (x, y) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !grid[y][x]);
    const canBe = (x, y) => [0, 1, 2].every(k => free(x, y + k) || y + k < 0);
    const landY = () => { let y = cur.y; while (canBe(cur.x, y + 1)) y++; return y; };
    const lock = () => { cur.c.forEach((c, k) => { const y = cur.y + k; if (y >= 0 && y < ROWS) grid[y][cur.x] = c; }); combo = 0; clear(); };
    const clear = () => { const kill = new Set();
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const c = grid[y][x]; if (!c) continue; for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { let n = 1; while (grid[y + dy * n]?.[x + dx * n] === c) n++; if (n >= 3) for (let k = 0; k < n; k++) kill.add((y + dy * k) * COLS + x + dx * k); } }
      if (kill.size) { combo++; lastCombo = combo; flash = [...kill]; flashT = .28; const pts = kill.size * 10 * combo * level; r.addScore(pts); r.pop(combo > 1 ? `קומבו ×${combo}! +${pts}` : '+' + pts, r.W / 2, 240, r.C.gold, combo > 1 ? 28 : 22); r.sfx(kill.size >= 5 || combo > 1 ? 'win' : 'score'); kill.forEach(i => r.burst(OX + (i % COLS) * S + S / 2, OY + Math.floor(i / COLS) * S + S / 2, COLORS[grid[Math.floor(i / COLS)][i % COLS] - 1], 4, 120));
        clears++; if (clears % 8 === 0) { level++; r.pop(`רמה ${level}! מהר יותר ⚡`, r.W / 2, 300, '#fff', 24); }
        cur = null; /* מחכים שהפלאש יגמר, ואז מוחקים ומפילים */ return; }
      r.sfx('tick'); spawn(); };
    const collapse = () => { flash.forEach(i => { grid[Math.floor(i / COLS)][i % COLS] = 0; }); flash = []; for (let x = 0; x < COLS; x++) { let w = ROWS - 1; for (let y = ROWS - 1; y >= 0; y--) if (grid[y][x]) { const v = grid[y][x]; grid[y][x] = 0; grid[w--][x] = v; } } clear(); };
    spawn();
    const gem = (x, y, ci, size = S - 6, glow = false) => { const c = r.ctx, col = COLORS[ci - 1], h = size / 2; c.save(); c.translate(x, y); if (glow) { c.shadowColor = '#fff'; c.shadowBlur = 14; }
      c.fillStyle = col; c.beginPath(); if (ci === 1) { c.moveTo(0, -h); c.lineTo(h, 0); c.lineTo(0, h); c.lineTo(-h, 0); } else if (ci === 2) { c.arc(0, 0, h, 0, Math.PI * 2); } else if (ci === 3) { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? c.lineTo(Math.cos(a) * h, Math.sin(a) * h) : c.moveTo(h, 0); } } else if (ci === 4) { c.moveTo(0, -h); c.lineTo(h, h * .8); c.lineTo(-h, h * .8); } else if (ci === 5) { c.roundRect(-h, -h, h * 2, h * 2, 5); } else { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? h * .5 : h; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } } c.closePath(); c.fill(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.stroke();
      c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(-h * .45, -h * .2); c.lineTo(-h * .15, -h * .55); c.lineTo(h * .05, -h * .3); c.lineTo(-h * .3, h * .05); c.closePath(); c.fill(); c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.moveTo(h * .1, h * .15); c.lineTo(h * .45, -h * .1); c.lineTo(h * .35, h * .45); c.closePath(); c.fill(); c.restore(); };
    return {
      save() { return { level }; }, revive() { for (let y = 0; y < Math.floor(ROWS * .6); y++) grid[y].fill(0); flash = []; combo = 0; spawn(); },
      peek() { const heights = []; for (let i = 0; i < COLS; i++) { let h = 0; for (let j = 0; j < ROWS; j++) if (grid[j][i]) { h = ROWS - j; break; } heights.push(h); } return { cur, next, grid, heights, COLS, ROWS, S, OX, OY }; },
      update(dt) { tt += dt; if (flashT > 0) { flashT -= dt; if (flashT <= 0) collapse(); return; } if (!cur) return; t += dt; if (t > speed()) { t = 0; if (canBe(cur.x, cur.y + 1)) cur.y++; else lock(); } },
      swipe(d) { if (!cur) return; if (d === 'left' && canBe(cur.x - 1, cur.y)) cur.x--; if (d === 'right' && canBe(cur.x + 1, cur.y)) cur.x++; if (d === 'down') { cur.y = landY(); lock(); } if (d === 'up') this.tap(); },
      tap() { if (cur) cur.c.unshift(cur.c.pop()); },
      draw() { const c = r.ctx; const bg = c.createLinearGradient(0, 0, 0, r.H); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#0f0a2e'); c.fillStyle = bg; c.fillRect(0, 0, r.W, r.H); r.rect(OX - 4, OY - 4, COLS * S + 8, ROWS * S + 8, '#312E81', 8); r.rect(OX, OY, COLS * S, ROWS * S, '#0b1026', 4);
        for (let x = 1; x < COLS; x++) r.line(OX + x * S, OY, OX + x * S, OY + ROWS * S, 'rgba(255,255,255,.05)', 1);
        if (cur) { const ly = landY(); r.rect(OX + cur.x * S + 2, OY + Math.max(0, ly) * S, S - 4, 3 * S, 'rgba(255,255,255,.08)', 6); }
        grid.forEach((row, y) => row.forEach((ci, x) => { if (ci) gem(OX + x * S + S / 2, OY + y * S + S / 2, ci, S - 6, flash.includes(y * COLS + x)); }));
        if (cur) cur.c.forEach((ci, k) => { const y = cur.y + k; if (y >= 0) gem(OX + cur.x * S + S / 2, OY + y * S + S / 2, ci); });
        /* הבא */ r.text('הבא', r.W - 26, OY + 8, { size: 11, color: '#c4b5fd' }); if (next) next.c.forEach((ci, k) => gem(r.W - 26, OY + 30 + k * 24, ci, 18));
        r.text(`רמה ${level}`, 26, OY + 70, { size: 12, color: '#c4b5fd' }); r.text(`${clears % 8}/8`, 26, OY + 88, { size: 11, color: '#818cf8' }); if (lastCombo > 1) r.text(`×${lastCombo}`, 26, OY + 112, { size: 16, color: r.C.gold }); },
    };
  } });

export default G;

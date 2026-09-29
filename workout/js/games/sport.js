// משחקי ספורט וקפיצה, עם דמויות מקלות אמיתיות (שוער שקופץ, רץ, קופץ), אפקטים וצלילים.
import { POSE, GK, S, KITS } from './sprites.js';
const SP = S;
const G = [];

// עזר: גרירה מהכדור לקביעת כיוון וכוח
const dragShot = (r, getOrigin, onShoot, maxLen = 150) => {
  let sx = 0, sy = 0, dragging = false, cx = 0, cy = 0;
  return {
    down(x, y) { const [ox, oy] = getOrigin(); if (r.dist(x, y, ox, oy) < 70) { dragging = true; sx = x; sy = y; cx = x; cy = y; } },
    move(x, y) { if (dragging) { cx = x; cy = y; } },
    up(x, y) { if (!dragging) return; dragging = false; const dx = sx - x, dy = sy - y, len = Math.min(maxLen, Math.hypot(dx, dy)); if (len > 10) onShoot(dx / Math.hypot(dx, dy) * len, dy / Math.hypot(dx, dy) * len, len / maxLen); },
    drawAim() { if (!dragging) return; const [ox, oy] = getOrigin(); const dx = sx - cx, dy = sy - cy; const l = Math.min(maxLen, Math.hypot(dx, dy)); if (l < 6) return; const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy); for (let k = 1; k <= 6; k++) r.circle(ox + ux * l * k / 6, oy + uy * l * k / 6, 3 + k * 0.6, `rgba(255,255,255,${0.9 - k * 0.12})`); r.rect(ox - 30, oy + 30, 60, 8, '#00000044', 4); r.rect(ox - 30, oy + 30, 60 * l / maxLen, 8, l / maxLen > 0.8 ? '#EF4444' : '#22C55E', 4); },
    get active() { return dragging; },
  };
};

// ---- פנדלים: 9 אזורים בשער (שמאל/אמצע/ימין × למעלה/אמצע/למטה). השוער בוחר צד וגובה, ועוצר רק אם שניהם נכונים.
// אותו מנוע משמש גם את "אני השוער": שם הילד בוחר לאן לקפוץ והבועט הוא המחשב. ----
function penaltyGame(role) {
  return function make(r) {
    const goal = { x: 40, y: 70, w: 280, h: 120 }, GL = goal.y + goal.h, BX = r.W / 2, BY = r.H - 90;
    const colOf = x => x < goal.x + goal.w / 3 ? -1 : x > goal.x + goal.w * 2 / 3 ? 1 : 0, rowOf = y => y < goal.y + goal.h / 3 ? 0 : y > goal.y + goal.h * 2 / 3 ? 2 : 1;
    const zoneCenter = (c, rw) => [goal.x + goal.w / 2 + c * goal.w / 3, goal.y + goal.h / 6 + rw * goal.h / 3];
    // phase: 'aim' (מחכים לבחירה), 'run' (הבועט רץ), 'fly' (הכדור בדרך), 'after' (תוצאה)
    let phase = 'aim', ph = 0, shot = null, gk = { x: BX, dy: 0, col: 0, row: 1, dive: false, laugh: 0, reach: 1 }, msg = '', streak = 0, tt = 0, goals = 0, saves = 0, rot = 0, bulge = 0, ready = 1, pick = null, kicks = 0, fails = 0; const MAXF = 3; // 3 פספוסים (בועט) או 3 שערים נגד (שוער) = נפסלים
    const fans = r.crowdGen(16, r.W, 2, 14, 20);
    const resetBall = () => { phase = 'aim'; ph = 0; shot = null; pick = null; gk.dive = false; gk.dy = 0; ready = 0; };
    // השוער בוחר צד וגובה. ככל שיש יותר שערים הוא חכם יותר
    const keeperGuess = (col, row) => { const smart = Math.min(0.85, 0.6 + goals * 0.04); const c = Math.random() < smart ? col : r.pick([-1, 0, 1].filter(v => v !== col)); const rw = Math.random() < 0.55 ? row : r.pick([0, 1, 2].filter(v => v !== row)); return { col: c, row: rw, reach: r.rnd(0.5 + Math.min(0.3, goals * 0.03), 1) }; };
    const startKick = (tx, ty) => { shot = { tx, ty, col: colOf(tx), row: rowOf(ty) }; phase = 'run'; ph = 0; kicks++; };
    // תוצאה: השוער עוצר אם הצד והגובה נכונים (בשורה סמוכה יש לו 35% להגיע)
    const keeperStops = () => { if (gk.col !== shot.col) return false; if (gk.row === shot.row) return gk.reach > .5 || Math.abs(shot.tx - BX) < 100; return Math.abs(gk.row - shot.row) === 1 && Math.random() < .35; };
    return {
      tap(x, y) { if (phase !== 'aim' || ready < 1) return;
        if (role === 'kicker') { let tx = r.clamp(x, 20, r.W - 20), ty = r.clamp(y, 40, r.H - 220); const edge = Math.min(Math.abs(tx - goal.x), Math.abs(tx - goal.x - goal.w), Math.abs(ty - goal.y)); const wobble = edge < 40 ? (40 - edge) * .55 : 0; tx += r.rnd(-wobble, wobble); ty += r.rnd(-wobble, wobble); startKick(tx, ty); const g = keeperGuess(shot.col, shot.row); gk.col = g.col; gk.row = g.row; gk.reach = g.reach; }
        else { // אני השוער: הבועט כבר רץ, לוחצים על אזור בשער כדי לקפוץ אליו
          if (y > GL + 10 || y < goal.y - 30) return; pick = { col: colOf(r.clamp(x, goal.x, goal.x + goal.w)), row: rowOf(r.clamp(y, goal.y, GL)) }; gk.col = pick.col; gk.row = pick.row; gk.reach = 1; } },
      peek() { return { phase, ready, shot: shot ? { col: shot.col, row: shot.row, tx: shot.tx, ty: shot.ty } : null, zoneCenter, goal, GL }; },
      down(x, y) { if (role === 'keeper' && (phase === 'run' || (phase === 'fly' && ph < .22)) && !pick && y < GL + 10 && y > goal.y - 30) { /* אפשר לבחור גם רגע אחרי הבעיטה (תגובה מאוחרת) */ pick = { col: colOf(r.clamp(x, goal.x, goal.x + goal.w)), row: rowOf(r.clamp(y, goal.y, GL)) }; gk.col = pick.col; gk.row = pick.row; gk.reach = 1; } },
      update(dt) { tt += dt; bulge = Math.max(0, bulge - dt * 1.4); gk.laugh = Math.max(0, gk.laugh - dt);
        if (phase === 'aim') { ready = Math.min(1, ready + dt * 1.6); gk.x += (BX - gk.x) * Math.min(1, dt * 6); if (Math.abs(gk.x - BX) < 2) gk.x = BX;
          // אני השוער: כשהשוער חזר למרכז, המחשב בועט. פינות שכיחות יותר
          if (role === 'keeper' && ready >= 1) { const col = r.pick([-1, -1, 1, 1, 0]), row = r.pick([0, 1, 2, 2, 0]); const [zx, zy] = zoneCenter(col, row); startKick(zx + r.rnd(-25, 25), zy + r.rnd(-12, 12)); gk.col = 0; gk.row = 1; gk.reach = 1; pick = null; }
          return; }
        ph += dt;
        if (phase === 'run') { if (ph >= (role === 'keeper' ? 1.0 : .55)) { phase = 'fly'; ph = 0; gk.dive = true; r.sfx('bounce'); } return; }
        if (phase === 'fly') { const k = Math.min(1, ph / .5); rot += dt * 14;
          if (gk.dive) { const targetX = BX + gk.col * 92 * gk.reach, targetDy = gk.col === 0 ? [-40, 0, 12][gk.row] : [-34, -6, 14][gk.row]; gk.x += (targetX - gk.x) * Math.min(1, dt * 7); gk.dy += (targetDy - gk.dy) * Math.min(1, dt * 7); }
          if (k >= 1) { const post = (Math.abs(shot.tx - goal.x) < 9 || Math.abs(shot.tx - goal.x - goal.w) < 9) && shot.ty > goal.y - 6 && shot.ty < GL || (Math.abs(shot.ty - goal.y) < 8 && shot.tx > goal.x - 6 && shot.tx < goal.x + goal.w + 6); const inGoal = !post && shot.tx > goal.x + 8 && shot.tx < goal.x + goal.w - 8 && shot.ty > goal.y + 6 && shot.ty < GL; const stopped = inGoal && keeperStops(); const corner = shot.col !== 0 && shot.row !== 1;
            if (role === 'kicker') {
              if (inGoal && !stopped) { streak++; goals++; const pts = 10 * Math.min(3, streak) + (corner ? 5 : 0) + Math.floor(goals / 3) * 5; r.addScore(pts); r.sparkle(shot.tx, shot.ty, 34, 10); r.pop('+' + pts, shot.tx, shot.ty - 20, '#FDE047', 28); r.burst(shot.tx, shot.ty, '#fff', 20, 260); r.sfx('goal'); msg = streak >= 3 ? `גול! רצף ${streak} 🔥` : 'גוווול! ⚽'; bulge = 1; }
              else { streak = 0; fails++; msg = (post ? 'קורה! 😱' : inGoal ? 'השוער עצר! 🧤' : 'החוצה... 😂') + ` (${fails}/${MAXF})`; if (post) { r.sfx('post'); r.shake(220); r.burst(shot.tx, shot.ty, '#fff', 14, 220); shot.bounce = { x: shot.tx, y: shot.ty, vx: (shot.tx < BX ? -1 : 1) * r.rnd(120, 220), vy: r.rnd(-60, 160), stuck: Math.random() < .25 }; } else if (inGoal) { r.sfx('hit'); shot.bounce = { x: gk.x + (shot.tx < gk.x ? -20 : 20), y: shot.ty, vx: (shot.tx < gk.x ? -1 : 1) * r.rnd(140, 260), vy: r.rnd(-80, 40), stuck: false }; } else r.sfx('laugh'); if (!inGoal) { r.sfx('ohh'); setTimeout(() => r.sfx('laugh'), 450); } gk.laugh = 1.5; if (inGoal) r.shake(180); }
            } else { // אני השוער: עצירה = נקודות
              if (inGoal && !stopped) { streak = 0; goals++; fails++; msg = `גול נגדך... 😬 (${fails}/${MAXF})`; bulge = 1; r.sfx('ohh'); }
              else if (stopped) { streak++; saves++; const pts = 10 * Math.min(3, streak) + (corner ? 5 : 0) + Math.floor(saves / 3) * 5; r.addScore(pts); r.pop('עצירה! +' + pts, gk.x, GL - 90, '#FDE047', 28); r.burst(gk.x, GL - 60, '#fff', 20, 260); r.sfx('roar'); msg = streak >= 3 ? `עצירה! רצף ${streak} 🧤🔥` : 'עצירה! 🧤'; r.shake(160); shot.bounce = { x: gk.x + (shot.tx < gk.x ? -20 : 20), y: shot.ty, vx: (shot.tx < gk.x ? -1 : 1) * r.rnd(140, 260), vy: r.rnd(-80, 40), stuck: false }; }
              else { const pts = 5; r.addScore(pts); msg = post ? 'קורה! מזל 😅 +5' : 'החוצה! +5'; if (post) { r.sfx('post'); shot.bounce = { x: shot.tx, y: shot.ty, vx: (shot.tx < BX ? -1 : 1) * r.rnd(120, 220), vy: r.rnd(-60, 160), stuck: false }; } else r.sfx('score'); }
            }
            phase = 'after'; ph = 0; } return; }
        if (phase === 'after' && shot.bounce && !shot.bounce.stuck) { const b = shot.bounce; b.vy += 520 * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y > GL + 30 && b.vy > 0) { b.y = GL + 30; b.vy = -b.vy * .45; b.vx *= .8; if (Math.abs(b.vy) > 40) r.sfx('bounce'); } }
        if (phase === 'after' && ph > 1.5) { if (fails >= MAXF) return r.over(role === 'kicker' ? 'שלושה פספוסים!' : 'שלושה שערים נגדך!'); resetBall(); } },
      revive() { fails = 0; resetBall(); },
      draw() { r.clear('#15803D'); for (let i = 0; i < 6; i++) r.rect(0, 200 + i * 60, r.W, 30, '#16A34A');
        r.rect(0, 0, r.W, goal.y - 4, '#1F2937'); r.crowd(fans, tt, phase === 'after' && (role === 'kicker' ? msg.startsWith('ג') : msg.startsWith('עצירה')));
        // שער עם עומק: רשת אחורית מתנפחת בשער
        const d = 18; r.rect(goal.x, goal.y, goal.w, goal.h, 'rgba(15,23,42,.45)'); const c = r.ctx; c.save(); c.strokeStyle = '#ffffffaa'; c.lineWidth = 1; for (let i = 0; i <= 16; i++) { const x0 = goal.x + d + (goal.w - 2 * d) * i / 16; c.beginPath(); c.moveTo(x0, goal.y + d * .6); if (bulge > 0 && shot) { const dd = Math.abs(x0 - shot.tx), off = Math.max(0, 1 - dd / 70) * 12 * bulge * Math.abs(Math.cos(tt * 14)); c.quadraticCurveTo(x0 + (x0 > shot.tx ? off : -off), (goal.y + GL) / 2 + off, x0, GL); } else c.lineTo(x0, GL); c.stroke(); } for (let j = 0; j <= 7; j++) { const yy = goal.y + d * .6 + (goal.h - d * .6) * j / 7; c.beginPath(); c.moveTo(goal.x + d, yy); c.lineTo(goal.x + goal.w - d, yy); c.stroke(); } c.strokeStyle = '#ffffff55'; for (let i = 0; i <= 6; i++) { const k = i / 6; c.beginPath(); c.moveTo(goal.x, goal.y + goal.h * k); c.lineTo(goal.x + d, goal.y + d * .6 + (goal.h - d * .6) * k); c.stroke(); c.beginPath(); c.moveTo(goal.x + goal.w, goal.y + goal.h * k); c.lineTo(goal.x + goal.w - d, goal.y + d * .6 + (goal.h - d * .6) * k); c.stroke(); } c.restore();
        // אני השוער: 9 האזורים מסומנים בעדינות בזמן הריצה, והבחירה מודגשת
        if (role === 'keeper' && (phase === 'run' || phase === 'fly')) { for (let ci = -1; ci <= 1; ci++) for (let ri = 0; ri < 3; ri++) { const [zx, zy] = zoneCenter(ci, ri); const mine = pick && pick.col === ci && pick.row === ri; r.rect(zx - goal.w / 6 + 3, zy - goal.h / 6 + 3, goal.w / 3 - 6, goal.h / 3 - 6, mine ? 'rgba(253,224,71,.5)' : 'rgba(255,255,255,.16)', 6); r.ctx.strokeStyle = mine ? '#FDE047' : 'rgba(255,255,255,.5)'; r.ctx.lineWidth = mine ? 3 : 1.5; r.ctx.strokeRect(zx - goal.w / 6 + 3, zy - goal.h / 6 + 3, goal.w / 3 - 6, goal.h / 3 - 6); } if (!pick && phase === 'run') r.text('לאן לקפוץ? לוחצים בשער!', r.W / 2, GL + 40, { size: 18, color: '#FDE047' }); }
        r.line(goal.x, goal.y, goal.x + goal.w, goal.y, '#fff', 6); r.line(goal.x, goal.y, goal.x, GL, '#fff', 6); r.line(goal.x + goal.w, goal.y, goal.x + goal.w, GL, '#fff', 6);
        r.rect(0, GL, r.W, 4, '#fff'); r.ctx.fillStyle = 'rgba(255,255,255,.35)'; r.ctx.beginPath(); r.ctx.ellipse(BX, BY + 6, 9, 3, 0, 0, Math.PI * 2); r.ctx.fill();
        // השוער: פוזה לפי צד וגובה. צוחק כשהבועט מחטיא (רק כשאני הבועט), שוכב אחרי שער
        const laughing = role === 'kicker' && gk.laugh > 0 && (msg.startsWith('החוצה') || msg.startsWith('קורה'));
        let pose = GK.ready; if (gk.dive || phase === 'after') { const dl = gk.col < 0, side = gk.col === 0 ? null : (dl ? 'L' : 'R'); if (phase === 'after' && msg.startsWith('ג') && side) pose = dl ? GK.lyingL : GK.lyingR; else if (side) pose = GK[`dive${side}${['H', '', 'L'][gk.row]}`] || GK[`dive${side}`]; else pose = gk.row === 0 ? GK.up : gk.row === 2 ? GK.crouch : GK.ready; }
        if (phase === 'aim') pose = laughing ? GK.ready : GK.ready;
        const air = phase === 'fly' && gk.col !== 0 ? Math.sin(Math.min(1, ph / .5) * Math.PI) * 26 : 0; const gy = GL - 2 - air + (phase === 'fly' || phase === 'after' ? gk.dy : 0) - (laughing ? Math.abs(Math.sin(tt * 14)) * 10 : 0);
        r.player(pose, gk.x, gy, 0.62, KITS.keeper, { happy: role === 'keeper' ? !(phase === 'after' && msg.startsWith('גול')) : !gk.dive }); if (laughing) r.text('חה חה חה!', gk.x, GL - 100, { size: 18, color: '#fff' });
        if (phase === 'aim' && ready < 1) r.text(role === 'keeper' ? 'הבועט מתכונן...' : 'השוער מתמקם...', r.W / 2, GL + 40, { size: 14, color: '#bbf7d0' });
        // הבועט: רץ מהצד אל הכדור ובועט
        let px = BX - 110, py = BY + 30, kpose = POSE.stand; const runDur = role === 'keeper' ? 1.0 : .55;
        if (phase === 'run') { const k = ph / runDur; px = BX - 110 + 84 * k; py = BY + 30 - 8 * Math.sin(k * Math.PI); kpose = POSE.run[Math.floor(k * 6) % POSE.run.length][0]; } else if (phase === 'fly' || (phase === 'after' && ph < .4)) { px = BX - 26; py = BY + 30; kpose = POSE.leap; } else if (phase === 'after') { const scored = role === 'kicker' ? msg.startsWith('ג') : msg.startsWith('גול'); px = BX - 26; py = BY + 30 - (scored ? Math.abs(Math.sin(tt * 8)) * 22 : 0); kpose = scored ? POSE.armsUp : POSE.stand; }
        r.player(kpose, px, py, 0.55, role === 'keeper' ? KITS.red : KITS.blue);
        // הכדור: על הנקודה, בטיסה (מתקטן, מסתובב, צל), ברשת, או נהדף
        if (phase === 'fly') { const k = Math.min(1, ph / .5); const bx = BX + (shot.tx - BX) * k, by = BY + (shot.ty - BY) * k - Math.sin(k * Math.PI) * 40; SP.groundShadow(r, bx, BY + (GL + 4 - BY) * k, 16 - k * 8, BY + (GL + 4 - BY) * k - by); SP.soccer(r, bx, by, 16 - k * 8, rot); }
        else if (phase === 'after') { if (msg.startsWith('ג')) SP.soccer(r, shot.tx, shot.ty + Math.min(20, ph * 40), 8, rot); else if (shot.bounce) { const b = shot.bounce; if (!b.stuck) rot += .12; SP.groundShadow(r, b.x, GL + 32, 9, Math.max(0, GL + 30 - b.y)); SP.soccer(r, b.x, b.y, b.stuck ? 8 : 9, rot); } }
        else { SP.groundShadow(r, BX, BY + 2, 16, 0); SP.soccer(r, BX, BY, 16, rot); }
        if (streak > 1 && phase === 'aim') r.text(`רצף: ${streak} 🔥`, r.W / 2, r.H - 30, { size: 18, color: '#FDE047' });
        if (role === 'keeper') r.text(`עצירות ${saves} · שערים ${goals}`, r.W / 2, r.H - 12, { size: 13, color: '#bbf7d0' });
        if (phase === 'after') r.text(msg, r.W / 2, r.H / 2 + 20, { size: 32, color: '#FDE047' }); },
    };
  };
}
G.push({ id: 'penalty', name: 'פנדלים', emoji: '⚽', how: 'שלושה פספוסים = נפסלת. נוגעים איפה בשער לבעוט: שמאל, אמצע או ימין, ולמעלה, אמצע או למטה. השוער מנחש צד וגובה, ועוצר רק אם ניחש את שניהם. פינות = בונוס, אבל אפשר לפגוע בקורה. רצף שערים מכפיל נקודות.', make: penaltyGame('kicker') });
G.push({ id: 'keeper', name: 'אני השוער', emoji: '🧤', how: 'שלושה שערים נגדך = נפסלת. הבועט רץ לכדור. לוחצים על אחד מתשעת האזורים בשער כדי לקפוץ אליו לפני הבעיטה. עצירה = נקודות, רצף עצירות מכפיל. לא לחצת? השוער נשאר באמצע.', make: penaltyGame('keeper') });

// ---- כדורסל ----
G.push({ id: 'basketball', name: 'כדורסל', emoji: '🏀', how: 'גוררים מהכדור אחורה ומשחררים כדי לזרוק. הסל זז אחרי כל קליעה. סוויש (בלי לגעת בברזל) = בונוס.',
  make(r) {
    let ball = { x: 80, y: r.H - 110, vx: 0, vy: 0, fly: false, rim: false, t: 0 }, hoop = { x: 260, y: 220 }, streak = 0, shooterT = 0, trail = [];
    const reset = () => { ball = { x: r.rnd(60, 130), y: r.H - 110, vx: 0, vy: 0, fly: false, rim: false, t: 0 }; trail = []; };
    const d = dragShot(r, () => [ball.x, ball.y], (dx, dy) => { ball.vx = dx * 5; ball.vy = dy * 5; ball.fly = true; shooterT = 0.5; r.sfx('bounce'); }, 140);
    return {
      down: d.down, move: d.move, up: d.up,
      update(dt) { shooterT -= dt; if (!ball.fly) return; ball.vy += 800 * dt; const py = ball.y; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.t += dt; if (ball.t % 0.05 < dt) trail.push({ x: ball.x, y: ball.y }); if (trail.length > 12) trail.shift();
        // ברזל
        for (const rx of [hoop.x - 26, hoop.x + 26]) if (r.dist(ball.x, ball.y, rx, hoop.y) < 16) { ball.vy = -Math.abs(ball.vy) * 0.5; ball.vx += (ball.x - rx) * 4; ball.rim = true; r.sfx('hit'); }
        if (ball.vy > 0 && py < hoop.y && ball.y >= hoop.y && Math.abs(ball.x - hoop.x) < 22) { streak++; const pts = ball.rim ? 20 : 30; r.addScore(pts + Math.min(streak - 1, 3) * 5); r.pop(ball.rim ? '+20' : 'סוויש! +30', hoop.x, hoop.y - 40, '#FDE047', 26); r.burst(hoop.x, hoop.y + 10, '#F97316', 18); r.sfx('score'); hoop = { x: r.rnd(200, 320), y: r.rnd(160, 280) }; reset(); return; }
        if (ball.x > r.W + 30 || ball.y > r.H + 30 || ball.x < -30) { streak = 0; reset(); } },
      draw() { r.clear('#FDE68A'); r.rect(0, r.H - 40, r.W, 40, '#B45309'); r.line(0, r.H - 40, r.W, r.H - 40, '#fff', 2); S.hoop(r, hoop.x, hoop.y);
        r.player(shooterT > 0 ? POSE.jumpUp : POSE.stand, ball.fly ? 100 : ball.x, r.H - 40, 0.5, KITS.purple);
        trail.forEach((t, i) => r.circle(t.x, t.y, 3 + i * 0.4, `rgba(249,115,22,${i / 24})`)); d.drawAim(); S.ball(r, ball.x, ball.y, 14);
        if (streak > 1) r.text(`רצף ${streak} 🔥`, r.W / 2, 40, { size: 20, color: '#92400E' }); },
    };
  } });

// ---- מיני גולף ----
G.push({ id: 'golf', name: 'מיני גולף', emoji: '⛳', how: 'גוררים מהכדור ומשחררים. קירות, חול שמאט, וגומה. פחות חבטות = יותר נקודות.',
  make(r) {
    let ball = { x: 80, y: r.H - 80, vx: 0, vy: 0 }, hole = { x: 280, y: 120 }, walls = [], sand = null, strokes = 0, holes = 0, msgT = 0, msg = '';
    const layout = () => { walls = [{ x: r.rnd(60, 200), y: r.rnd(200, 380), w: r.rnd(80, 160), h: 14 }, { x: r.rnd(100, 300), y: r.rnd(150, 300), w: 14, h: r.rnd(60, 140) }]; hole = { x: r.rnd(40, r.W - 40), y: r.rnd(60, 160) }; sand = Math.random() < 0.7 ? { x: r.rnd(40, r.W - 40), y: r.rnd(200, 400), rad: r.rnd(30, 50) } : null; };
    layout();
    const d = dragShot(r, () => [ball.x, ball.y], (dx, dy) => { if (Math.hypot(ball.vx, ball.vy) < 5) { ball.vx = dx * 4; ball.vy = dy * 4; strokes++; r.sfx('bounce'); } }, 150);
    return {
      down: d.down, move: d.move, up: d.up,
      update(dt) { msgT -= dt; const inSand = sand && r.dist(ball.x, ball.y, sand.x, sand.y) < sand.rad; const fr = inSand ? 4 : 1.4; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= 1 - fr * dt; ball.vy *= 1 - fr * dt;
        if (ball.x < 10) { ball.x = 10; ball.vx *= -0.8; } if (ball.x > r.W - 10) { ball.x = r.W - 10; ball.vx *= -0.8; } if (ball.y < 10) { ball.y = 10; ball.vy *= -0.8; } if (ball.y > r.H - 10) { ball.y = r.H - 10; ball.vy *= -0.8; }
        for (const w of walls) if (r.hit(ball.x - 8, ball.y - 8, 16, 16, w.x, w.y, w.w, w.h)) { if (w.w > w.h) { ball.vy *= -0.8; ball.y += ball.vy > 0 ? 6 : -6; } else { ball.vx *= -0.8; ball.x += ball.vx > 0 ? 6 : -6; } r.sfx('tick'); }
        if (r.dist(ball.x, ball.y, hole.x, hole.y) < 14 && Math.hypot(ball.vx, ball.vy) < 260) { const pts = Math.max(10, 60 - strokes * 10); r.addScore(pts); holes++; msg = strokes === 1 ? 'הול אין וואן! 🤩' : `בגומה ב-${strokes}`; msgT = 1.2; r.pop('+' + pts, hole.x, hole.y - 30, '#fff', 26); r.burst(hole.x, hole.y, '#FDE047', 16); r.sfx('score'); strokes = 0; ball = { x: r.rnd(40, r.W - 40), y: r.H - 80, vx: 0, vy: 0 }; layout(); } },
      draw() { r.clear('#16A34A'); for (let i = 0; i < 10; i++) r.rect(0, i * 60, r.W, 30, '#15803D22'); if (sand) r.circle(sand.x, sand.y, sand.rad, '#FDE68A'); walls.forEach(w => r.rect(w.x, w.y, w.w, w.h, '#78350F', 4)); r.circle(hole.x, hole.y, 14, '#052E16'); S.flag(r, hole.x + 10, hole.y); d.drawAim(); r.circle(ball.x, ball.y, 8, '#fff'); r.circle(ball.x - 2, ball.y - 2, 2.5, '#00000022');
        r.text(`חבטות: ${strokes} · גומות: ${holes}`, r.W / 2, r.H - 20, { size: 16, color: '#ffffffcc' }); if (msgT > 0) r.text(msg, r.W / 2, r.H / 2, { size: 28 }); },
    };
  } });

// ---- באולינג ----
G.push({ id: 'bowling', name: 'באולינג', emoji: '🎳', how: 'מחליקים את הכדור למעלה לכיוון הפינים. סטרייק (כל העשרה) = 50 בונוס.',
  make(r) {
    let pins = [], ball = null, cooldown = 0, msg = '', frames = 0;
    const setPins = () => { pins = []; [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3]].forEach((row, j) => row.forEach(i => pins.push({ x: r.W / 2 + i * 20, y: 130 - j * 24, up: true, vx: 0, vy: 0 }))); };
    setPins();
    return {
      swipe(d, dx, dy) { if (ball || cooldown > 0 || dy >= 0) return; const len = Math.hypot(dx, dy); ball = { x: r.W / 2 + r.clamp(dx, -60, 60), y: r.H - 60, vx: dx / len * 200, vy: -Math.max(450, Math.min(800, len * 4)), spin: r.rnd(-1, 1) }; r.sfx('bounce'); },
      update(dt) { pins.forEach(p => { if (!p.up) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; } });
        if (cooldown > 0) { cooldown -= dt; if (cooldown <= 0) { const down = pins.filter(p => !p.up).length; if (down === 10) { r.addScore(50); msg = 'סטרייק! 🎳'; r.burst(r.W / 2, 110, '#FDE047', 30, 300); r.sfx('win'); } else msg = `${down} פינים`; frames++; setPins(); } return; }
        if (!ball) return; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx += ball.spin * 40 * dt; if (ball.x < 60 || ball.x > r.W - 60) ball.vx *= -1;
        for (const p of pins) if (p.up && r.dist(ball.x, ball.y, p.x, p.y) < 22) { p.up = false; p.vx = (p.x - ball.x) * 8 + ball.vx * 0.3; p.vy = -200; r.addScore(10); r.sfx('hit'); for (const q of pins) if (q.up && q !== p && r.dist(p.x, p.y, q.x, q.y) < 30 && Math.random() < 0.6) { q.up = false; q.vx = (q.x - p.x) * 8; q.vy = -180; r.addScore(10); } }
        if (ball.y < -20) { ball = null; cooldown = 1.1; } },
      draw() { r.clear('#7C2D12'); r.rect(40, 0, r.W - 80, r.H, '#D6A66B'); for (let i = 0; i < 8; i++) r.rect(40 + i * 35, 0, 2, r.H, '#B8895A'); r.line(40, 0, 40, r.H, '#1F2937', 8); r.line(r.W - 40, 0, r.W - 40, r.H, '#1F2937', 8); r.rect(60, r.H - 30, r.W - 120, 4, '#fff');
        pins.forEach(p => { if (p.up) S.pin(r, p.x, p.y); else if (p.y > -30) { r.ctx.save(); r.ctx.translate(p.x, p.y); r.ctx.rotate(1.3); S.pin(r, 0, 0); r.ctx.restore(); } });
        const bx = ball ? ball.x : r.W / 2, by = ball ? ball.y : r.H - 60; r.circle(bx, by, 14, '#1D4ED8'); r.circle(bx - 4, by - 4, 2, '#93C5FD'); r.circle(bx + 3, by - 5, 2, '#93C5FD'); r.circle(bx, by + 2, 2, '#93C5FD');
        r.text(msg || 'החלק למעלה ↑', r.W / 2, r.H - 45, { size: 16, color: '#fff' }); },
    };
  } });

// ---- חץ וקשת ----
G.push({ id: 'archery', name: 'חץ וקשת', emoji: '🏹', how: 'המטרה זזה. מחזיקים כדי לדרוך את הקשת (חץ מהיר יותר), ומשחררים לירות. מרכז = 10.',
  make(r) {
    let tx = r.W / 2, dir = 1, sp = 120, arrows = [], hits = [], shots = 0, draw = 0, wind = 0, t = 0;
    return {
      down() { draw = 0.01; },
      update(dt) { t += dt; if (draw > 0 && r.isDown) draw = Math.min(1, draw + dt * 1.5); tx += dir * sp * dt; if (tx < 50 || tx > r.W - 50) dir *= -1; wind = Math.sin(t * 0.7) * 40;
        arrows.forEach(a => { a.y -= a.v * dt; a.x += wind * dt * 0.6; });
        for (const a of arrows) if (a.y <= 110) { const d = Math.abs(a.x - tx); const pts = d < 8 ? 10 : d < 20 ? 7 : d < 34 ? 4 : d < 48 ? 1 : 0; r.addScore(pts); hits.push({ x: a.x - tx, t: 1.5, pts }); if (pts === 10) { r.pop('בול! +10', a.x, 60, '#EF4444', 26); r.burst(a.x, 110, '#FDE047'); r.sfx('score'); } else if (pts) { r.pop('+' + pts, a.x, 70, '#1E3A8A'); r.sfx('tick'); } else r.sfx('hit'); a.y = -99; shots++; if (shots % 5 === 0) sp += 25; }
        arrows = arrows.filter(a => a.y > 0); hits.forEach(h => h.t -= dt); hits = hits.filter(h => h.t > 0); },
      up() { if (draw <= 0) return; arrows.push({ x: r.W / 2, y: r.H - 90, v: 300 + draw * 500 }); r.sfx('bounce'); draw = 0; },
      draw() { r.clear('#BFDBFE'); S.cloud(r, 60, 60, 1); S.cloud(r, 300, 40, 0.8); r.rect(0, r.H - 40, r.W, 40, '#65A30D'); [[48, '#fff'], [34, '#111'], [20, '#3B82F6'], [8, '#EF4444']].forEach(([rad, c]) => r.circle(tx, 110, rad, c)); r.circle(tx, 110, 3, '#FDE047'); r.rect(tx - 4, 158, 8, 40, '#78350F');
        hits.forEach(h => { r.line(tx + h.x, 118, tx + h.x, 100, '#78350F', 3); r.line(tx + h.x - 3, 118, tx + h.x + 3, 118, '#EF4444', 3); }); arrows.forEach(a => { r.line(a.x, a.y, a.x, a.y + 30, '#78350F', 3); r.line(a.x - 4, a.y + 30, a.x, a.y + 24, '#EF4444', 2); r.line(a.x + 4, a.y + 30, a.x, a.y + 24, '#EF4444', 2); });
        // הקשת
        const c = r.ctx; c.strokeStyle = '#78350F'; c.lineWidth = 5; c.beginPath(); c.arc(r.W / 2, r.H - 80, 40, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.strokeStyle = '#E5E7EB'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(r.W / 2 - 38, r.H - 92); c.lineTo(r.W / 2, r.H - 80 + draw * 30); c.lineTo(r.W / 2 + 38, r.H - 92); c.stroke(); if (draw > 0) r.line(r.W / 2, r.H - 80 + draw * 30, r.W / 2, r.H - 125 + draw * 30, '#78350F', 3);
        r.text(`רוח ${wind > 0 ? '→' : '←'} ${Math.abs(Math.round(wind / 10))}`, 60, r.H - 60, { size: 14, color: '#1E3A8A' }); if (draw > 0) { r.rect(r.W - 60, r.H - 100, 12, 60, '#00000033', 4); r.rect(r.W - 60, r.H - 40 - 60 * draw, 12, 60 * draw, draw > 0.9 ? '#EF4444' : '#22C55E', 4); } },
    };
  } });

// ---- כביש מהיר ----
G.push({ id: 'racing', name: 'כביש מהיר', emoji: '🏎️', how: 'נוגעים בצד שמאל או ימין כדי לעבור נתיב. מתחמקים מהמכוניות, אוספים מטבעות. שמן = מחליקים.',
  make(r) {
    const L = [70, 180, 290]; let lane = 1, x = L[1], cars = [], t = 0, speed = 260, roadY = 0, slip = 0, dist = 0;
    return {
      tap(px) { if (slip > 0) return; lane = r.clamp(lane + (px < r.W / 2 ? -1 : 1), 0, 2); r.sfx('tick'); }, swipe(d) { if (slip > 0) return; if (d === 'left') lane = Math.max(0, lane - 1); if (d === 'right') lane = Math.min(2, lane + 1); },
      update(dt) { speed += 5 * dt; roadY = (roadY + speed * dt) % 60; t += dt; slip -= dt; dist += speed * dt; x += (L[lane] - x) * Math.min(1, dt * 10);
        if (t > 0.9) { t = 0; const l = r.rint(0, 2); const k = Math.random(); cars.push({ l, y: -60, kind: k < 0.3 ? 'coin' : k < 0.4 ? 'oil' : 'car', color: r.pick(['#EF4444', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7']) }); }
        cars.forEach(c => c.y += speed * dt * (c.kind === 'car' ? 0.7 : 1)); cars = cars.filter(c => c.y < r.H + 60);
        for (const c of cars) if (c.l === lane && Math.abs(c.y - (r.H - 90)) < 45 && !c.hit) { c.hit = true; if (c.kind === 'coin') { r.addScore(10); r.pop('+10', L[c.l], c.y - 20); r.sfx('score'); c.y = r.H + 100; } else if (c.kind === 'oil') { slip = 1; r.sfx('hit'); lane = r.clamp(lane + r.pick([-1, 1]), 0, 2); } else { return r.over('התנגשות!'); } }
        if (Math.floor(dist / 100) !== Math.floor((dist - speed * dt) / 100)) r.addScore(1); },
      draw() { r.clear('#111827'); r.rect(20, 0, r.W - 40, r.H, '#374151'); for (let y = -60 + roadY; y < r.H; y += 60) { r.rect(123, y, 6, 30, '#FDE047'); r.rect(233, y, 6, 30, '#FDE047'); } r.rect(20, 0, 6, r.H, '#fff'); r.rect(r.W - 26, 0, 6, r.H, '#fff');
        cars.forEach(c => { if (c.kind === 'coin') { r.circle(L[c.l], c.y, 12, '#FDE047'); r.circle(L[c.l], c.y, 7, '#F59E0B'); } else if (c.kind === 'oil') { r.ctx.fillStyle = '#0B0B0B'; r.ctx.beginPath(); r.ctx.ellipse(L[c.l], c.y, 26, 16, 0, 0, Math.PI * 2); r.ctx.fill(); } else S.car(r, L[c.l], c.y, 44, 76, c.color, -1); });
        r.ctx.save(); if (slip > 0) { r.ctx.translate(x, r.H - 90); r.ctx.rotate(Math.sin(slip * 20) * 0.3); r.ctx.translate(-x, -(r.H - 90)); } S.car(r, x, r.H - 90, 44, 76, '#F472B6', 1); r.ctx.restore();
        r.text(`${Math.round(speed)} קמ״ש`, r.W / 2, 30, { size: 16, color: '#9CA3AF' }); },
    };
  } });

// ---- מסוק במערה ----
G.push({ id: 'heli', name: 'מסוק במערה', emoji: '🚁', how: 'מחזיקים את האצבע כדי לעלות, משחררים כדי לרדת. לא לגעת בקירות. אוספים כוכבים.',
  make(r) {
    let y = r.H / 2, vy = 0, segs = [], dist = 0, gap = 260, t = 0, stars = [];
    for (let i = 0; i < 12; i++) segs.push({ x: i * 40, top: 60 + Math.sin(i / 2) * 40 });
    return {
      update(dt) { t += dt; vy += (r.isDown ? -900 : 900) * dt; vy = r.clamp(vy, -300, 300); y += vy * dt; dist += 180 * dt;
        segs.forEach(s => s.x -= 180 * dt); stars.forEach(s => s.x -= 180 * dt); stars = stars.filter(s => s.x > -20);
        if (segs[0].x < -40) { segs.shift(); const last = segs[segs.length - 1]; segs.push({ x: last.x + 40, top: r.clamp(last.top + r.rnd(-40, 40), 30, r.H - gap - 30) }); gap = Math.max(150, gap - 0.5); r.addScore(1); if (Math.random() < 0.25) stars.push({ x: last.x + 40, y: last.top + r.rnd(30, gap - 30) }); }
        for (const s of stars) if (r.dist(s.x, s.y, 90, y) < 24) { r.addScore(10); r.pop('+10', s.x, s.y - 16); r.sfx('score'); s.x = -99; }
        const s = segs.find(s => s.x <= 90 && s.x + 40 > 90); if (s && (y - 14 < s.top || y + 14 > s.top + gap)) r.over('פגעת בקיר!'); },
      draw() { r.clear('#1F2937'); segs.forEach(s => { r.rect(s.x, 0, 41, s.top, '#78350F'); r.rect(s.x, s.top - 6, 41, 6, '#A16207'); r.rect(s.x, s.top + gap, 41, r.H, '#78350F'); r.rect(s.x, s.top + gap, 41, 6, '#A16207'); }); stars.forEach(s => r.emoji('⭐', s.x, s.y, 20)); S.heli(r, 90, y, t); },
    };
  } });

// ---- ארטילריה ----
G.push({ id: 'tanks', name: 'ארטילריה', emoji: '💣', how: 'גוררים מהטנק כדי לכוון ולקבוע כוח, ומשחררים. הרוח משנה את המסלול. פגיעה ישירה = 50.',
  make(r) {
    let me = { x: 50, y: r.H - 70 }, foe = { x: r.rnd(220, 330), y: r.H - 70 }, shell = null, wind = r.rnd(-60, 60), hills = [], trail = [], hits = 0;
    const terrain = () => { hills = []; for (let x = 0; x <= r.W; x += 20) hills.push(r.H - 60 - Math.max(0, Math.sin(x / 60) * 30 + (x > 120 && x < 220 ? 40 : 0))); };
    terrain();
    const gy = x => { const i = r.clamp(Math.floor(x / 20), 0, hills.length - 2); const k = (x - i * 20) / 20; return hills[i] + (hills[i + 1] - hills[i]) * k; };
    me.y = gy(me.x) - 10; foe.y = gy(foe.x) - 10;
    const d = dragShot(r, () => [me.x, me.y], (dx, dy) => { if (!shell) { shell = { x: me.x, y: me.y - 10, vx: dx * 4.5, vy: dy * 4.5 }; trail = []; r.sfx('hit'); } }, 160);
    return {
      down: d.down, move: d.move, up: d.up,
      update(dt) { if (!shell) return; shell.vy += 600 * dt; shell.vx += wind * dt; shell.x += shell.vx * dt; shell.y += shell.vy * dt; trail.push({ x: shell.x, y: shell.y });
        if (r.dist(shell.x, shell.y, foe.x, foe.y) < 26) { hits++; r.addScore(50); r.pop('פגיעה! +50', foe.x, foe.y - 40, '#FDE047', 26); r.burst(foe.x, foe.y, '#F97316', 26, 300); r.shake(); r.sfx('win'); foe = { x: r.rnd(200, 340), y: 0 }; foe.y = gy(foe.x) - 10; wind = r.rnd(-80, 80); shell = null; }
        else if (shell.y > gy(shell.x) || shell.x > r.W + 50 || shell.x < -50) { if (shell.x > 0 && shell.x < r.W) { r.burst(shell.x, shell.y, '#78716C', 10, 150); const near = r.dist(shell.x, shell.y, foe.x, foe.y); if (near < 60) { r.addScore(10); r.pop('קרוב! +10', shell.x, shell.y - 30); } } shell = null; } },
      draw() { r.clear('#7DD3FC'); S.cloud(r, 80, 50, 1); S.cloud(r, 260, 80, 0.7); const c = r.ctx; c.fillStyle = '#65A30D'; c.beginPath(); c.moveTo(0, r.H); hills.forEach((h, i) => c.lineTo(i * 20, h)); c.lineTo(r.W, r.H); c.fill();
        r.text(`רוח ${wind > 0 ? '→' : '←'} ${Math.abs(Math.round(wind / 10))}`, r.W / 2, 30, { size: 16, color: '#1E3A8A' }); for (let i = 0; i < Math.abs(Math.round(wind / 20)); i++) r.text(wind > 0 ? '→' : '←', r.W / 2 + (wind > 0 ? 50 : -50) + i * (wind > 0 ? 14 : -14), 30, { size: 14, color: '#1E3A8A' });
        r.rect(me.x - 20, me.y - 6, 40, 16, '#166534', 6); r.circle(me.x, me.y - 8, 10, '#166534'); r.rect(me.x - 22, me.y + 8, 44, 8, '#111', 4); r.rect(foe.x - 20, foe.y - 6, 40, 16, '#7F1D1D', 6); r.circle(foe.x, foe.y - 8, 10, '#7F1D1D'); r.rect(foe.x - 22, foe.y + 8, 44, 8, '#111', 4);
        trail.forEach((p, i) => r.circle(p.x, p.y, 2, `rgba(255,255,255,${i / trail.length * 0.6})`)); d.drawAim(); if (shell) r.circle(shell.x, shell.y, 6, '#111'); },
    };
  } });

// ---- תותח ----
G.push({ id: 'cannon', name: 'תותח נגד מגדל', emoji: '🏰', how: 'נוגעים איפה לירות. כדור התותח מפיל בלוקים והם נופלים. מפילים את כל המגדל.',
  make(r) {
    let blocks = [], balls = [], cd = 0, ang = -0.6;
    const build = () => { blocks = []; const cols = r.rint(2, 3); for (let i = 0; i < cols; i++) for (let j = 0; j < r.rint(4, 7); j++) blocks.push({ x: 220 + i * 34, y: r.H - 60 - j * 30, w: 30, h: 28, c: r.pick([r.C.hot, r.C.gold, r.C.pink, r.C.teal]) }); };
    build();
    return {
      tap(x, y) { if (cd > 0) return; cd = 0.5; const dx = x - 40, dy = y - (r.H - 80), len = Math.hypot(dx, dy); ang = Math.atan2(dy, dx); balls.push({ x: 40, y: r.H - 80, vx: dx / len * 520, vy: dy / len * 520 }); r.burst(40 + Math.cos(ang) * 44, r.H - 80 + Math.sin(ang) * 44, '#9CA3AF', 8, 120); r.sfx('hit'); },
      update(dt) { cd -= dt; balls.forEach(b => { b.vy += 500 * dt; b.x += b.vx * dt; b.y += b.vy * dt; });
        for (const b of balls) { const i = blocks.findIndex(k => r.hit(b.x - 7, b.y - 7, 14, 14, k.x, k.y, k.w, k.h)); if (i >= 0) { r.burst(blocks[i].x + 15, blocks[i].y + 14, blocks[i].c, 10, 160); blocks.splice(i, 1); r.addScore(10); r.sfx('tick'); b.vx *= 0.6; b.vy = -Math.abs(b.vy) * 0.3; } }
        blocks.sort((a, b) => b.y - a.y).forEach(k => { const below = blocks.find(o => o !== k && o.x === k.x && Math.abs(o.y - (k.y + 30)) < 2); if (!below && k.y < r.H - 60) k.y += 300 * dt; if (k.y > r.H - 60) k.y = r.H - 60; });
        balls = balls.filter(b => b.y < r.H + 20 && b.x < r.W + 20); if (!blocks.length) { build(); r.win('המגדל נפל!', 50); } },
      draw() { r.clear('#FEF3C7'); S.cloud(r, 250, 60, 1); r.rect(0, r.H - 32, r.W, 32, '#78350F'); blocks.forEach(k => { r.rect(k.x, k.y, k.w, k.h, k.c, 3); r.rect(k.x + 3, k.y + 3, k.w - 6, 6, '#ffffff44', 2); }); balls.forEach(b => r.circle(b.x, b.y, 7, '#111')); S.cannon(r, 40, r.H - 80, ang); },
    };
  } });

// ---- דיג ----
G.push({ id: 'fishing', name: 'דיג', emoji: '🎣', how: 'מחזיקים כדי להוריד את הקרס, משחררים כדי להעלות. דג גדול שווה יותר. זהירות ממדוזות!',
  make(r) {
    let hy = 80, fish = [], caught = null, t = 0, wave = 0;
    return {
      update(dt) { wave += dt; hy = r.clamp(hy + (r.isDown && !caught ? 220 : -260) * dt, 80, r.H - 20); t += dt;
        if (t > 0.8 && fish.length < 7) { t = 0; const dir = r.pick([-1, 1]); fish.push({ x: dir > 0 ? -30 : r.W + 30, y: r.rnd(160, r.H - 40), dir, s: r.rint(1, 3), jelly: Math.random() < 0.15, hue: r.pick(['#F97316', '#38BDF8', '#F472B6', '#A3E635', '#FACC15']) }); }
        fish.forEach(f => { f.x += f.dir * (60 + 30 * (4 - f.s)) * dt; f.y += Math.sin(wave * 3 + f.x / 30) * 10 * dt; }); fish = fish.filter(f => f.x > -60 && f.x < r.W + 60);
        if (!caught) { const i = fish.findIndex(f => r.dist(f.x, f.y, r.W / 2, hy) < 18 + f.s * 3); if (i >= 0) { if (fish[i].jelly) { r.addScore(-10); r.pop('אאוץ׳! -10', r.W / 2, hy - 20, '#EF4444'); r.sfx('hit'); fish.splice(i, 1); } else { caught = fish[i]; fish.splice(i, 1); r.sfx('tick'); } } }
        if (caught) { caught.x = r.W / 2; caught.y = hy + 10; if (hy <= 81) { const pts = caught.s * 10; r.addScore(pts); r.pop('+' + pts, r.W / 2, 60, '#FDE047'); r.sfx('score'); caught = null; } } },
      draw() { r.clear('#0EA5E9'); r.rect(0, 0, r.W, 80, '#7DD3FC'); S.cloud(r, 70, 30, 0.8); const c = r.ctx; c.fillStyle = '#0369A1'; c.beginPath(); c.moveTo(0, 130); for (let x = 0; x <= r.W; x += 10) c.lineTo(x, 130 + Math.sin(wave * 2 + x / 30) * 4); c.lineTo(r.W, r.H); c.lineTo(0, r.H); c.fill();
        // סירה ודייג
        c.fillStyle = '#92400E'; c.beginPath(); c.moveTo(r.W / 2 - 60, 100); c.lineTo(r.W / 2 + 30, 100); c.lineTo(r.W / 2 + 18, 120); c.lineTo(r.W / 2 - 48, 120); c.fill(); r.player(POSE.sit, r.W / 2 - 20, 104, 0.32, KITS.blue); r.line(r.W / 2 - 12, 82, r.W / 2, 70, '#78350F', 3); r.line(r.W / 2, 70, r.W / 2, hy, '#fff', 1.5); r.line(r.W / 2, hy, r.W / 2 - 5, hy + 6, '#9CA3AF', 2);
        const drawFish = f => { if (f.jelly) { r.circle(f.x, f.y, 12, '#F0ABFCAA'); for (let k = -1; k <= 1; k++) r.line(f.x + k * 6, f.y + 8, f.x + k * 8, f.y + 22 + Math.sin(wave * 6 + k) * 3, '#F0ABFC', 2); return; } const sz = 10 + f.s * 6; c.fillStyle = f.hue; c.beginPath(); c.ellipse(f.x, f.y, sz, sz * 0.55, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(f.x - f.dir * sz, f.y); c.lineTo(f.x - f.dir * sz * 1.6, f.y - sz * 0.5); c.lineTo(f.x - f.dir * sz * 1.6, f.y + sz * 0.5); c.fill(); r.circle(f.x + f.dir * sz * 0.5, f.y - 2, 2.5, '#111'); };
        fish.forEach(drawFish); if (caught) drawFish(caught); },
    };
  } });

// ---- קפיצה בחבל ----
G.push({ id: 'rope-timing', name: 'קפיצה בחבל בזמן', emoji: '🪢', how: 'החבל מסתובב. נוגעים בדיוק כשהוא מגיע למטה כדי לקפוץ. החבל מתגבר.',
  make(r) {
    let ang = 0, sp = 3.2, jy = 0, vy = 0, jumped = false, combo = 0;
    return {
      tap() { if (jy === 0) { vy = -420; r.sfx('bounce'); } },
      update(dt) { ang += sp * dt; vy += 1200 * dt; jy = Math.min(0, jy + vy * dt); if (jy === 0) vy = 0;
        const bottom = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (bottom > Math.PI - 0.2 && bottom < Math.PI + 0.2) { if (jy < -10) { if (!jumped) { jumped = true; combo++; const pts = 5 + Math.min(combo, 10); r.addScore(pts); r.pop('+' + pts, r.W / 2 + 60, r.H - 260, '#7C3AED'); if (combo % 5 === 0) { sp += 0.5; r.pop('מהר יותר!', r.W / 2, 90, '#EF4444', 24); } } } else return r.over('החבל תפס את הרגליים!'); }
        else jumped = false; },
      draw() { r.clear('#FDF2F8'); r.rect(0, r.H - 60, r.W, 60, '#F9A8D4'); const cx = r.W / 2, cy = r.H - 200; const ry = 150 * Math.sin(ang), rx = 120;
        r.ctx.strokeStyle = '#7C3AED'; r.ctx.lineWidth = 4; r.ctx.beginPath(); r.ctx.ellipse(cx, cy, rx, Math.abs(ry), 0, ry > 0 ? 0 : Math.PI, ry > 0 ? Math.PI : Math.PI * 2); r.ctx.stroke();
        r.player(jy < -5 ? POSE.hop : POSE.front, cx, r.H - 60 + jy, 0.75, KITS.red); r.text(`רצף: ${combo}`, cx, 40, { size: 20, color: '#7C3AED' }); },
    };
  } });

// ---- סקי ----
G.push({ id: 'ski', name: 'סקי סלאלום', emoji: '⛷️', how: 'מזיזים את הגולש עם האצבע. עוברים בין הדגלים, מתחמקים מהעצים, קופצים על הרמפות.',
  make(r) {
    let x = r.W / 2, items = [], t = 0, sp = 200, air = 0, snow = [];
    for (let i = 0; i < 40; i++) snow.push({ x: r.rnd(0, r.W), y: r.rnd(0, r.H) });
    return {
      move(px) { x = r.clamp(px, 16, r.W - 16); }, down(px) { this.move(px); },
      update(dt) { sp += 4 * dt; t += dt; air = Math.max(0, air - dt); snow.forEach(s => { s.y -= sp * dt * 0.5; if (s.y < 0) { s.y = r.H; s.x = r.rnd(0, r.W); } });
        if (t > 0.7) { t = 0; const k = Math.random(); if (k < 0.5) items.push({ k: 'gate', x: r.rnd(70, r.W - 70), y: r.H + 20, passed: false }); else if (k < 0.85) items.push({ k: 'tree', x: r.rnd(20, r.W - 20), y: r.H + 20 }); else items.push({ k: 'ramp', x: r.rnd(40, r.W - 40), y: r.H + 20 }); }
        items.forEach(i => i.y -= sp * dt); items = items.filter(i => i.y > -40);
        for (const i of items) { if (i.k === 'gate' && !i.passed && i.y < 120) { i.passed = true; if (Math.abs(x - i.x) < 50) { r.addScore(10); r.pop('+10', x, 90, '#1D4ED8'); r.sfx('score'); } else { r.pop('פספוס', x, 90, '#9CA3AF'); } }
          if (i.k === 'ramp' && !i.passed && Math.abs(i.y - 120) < 10 && Math.abs(x - i.x) < 30) { i.passed = true; air = 0.8; r.addScore(15); r.pop('קפיצה! +15', x, 80, '#F59E0B', 24); r.sfx('win'); }
          if (i.k === 'tree' && air <= 0 && r.dist(i.x, i.y, x, 120) < 24) return r.over('נכנסת בעץ!'); } },
      draw() { r.clear('#F8FAFC'); snow.forEach(s => r.circle(s.x, s.y, 1.5, '#CBD5E1')); items.forEach(i => { if (i.k === 'gate') { r.rect(i.x - 52, i.y - 20, 4, 40, '#EF4444'); r.rect(i.x - 52, i.y - 20, 16, 12, '#EF4444'); r.rect(i.x + 48, i.y - 20, 4, 40, '#1D4ED8'); r.rect(i.x + 48, i.y - 20, 16, 12, '#1D4ED8'); } else if (i.k === 'tree') S.tree(r, i.x, i.y); else r.rect(i.x - 30, i.y - 10, 60, 20, '#94A3B8', 6); });
        const sc = 0.45 + air * 0.15; S.skis(r, x, 120 + (air > 0 ? -20 : 0)); r.player(air > 0 ? POSE.leap : POSE.squat, x, 122 - (air > 0 ? 20 : 0), sc, KITS.blue); },
    };
  } });

// ---- משוכות ----
G.push({ id: 'hurdles', name: 'ריצת משוכות', emoji: '🏃‍♂️', how: 'נוגעים בזמן כדי לקפוץ מעל כל משוכה. פגיעה מאיטה אותך. המתחרה לא מחכה!',
  make(r) {
    const GY = r.H - 100; let y = GY, vy = 0, hs = [], t = 0, sp = 240, cleared = 0, run = 0, rival = -80, clouds = [{ x: 60, y: 70 }, { x: 280, y: 110 }];
    return {
      tap() { if (y >= GY - 1) { vy = -560; r.sfx('bounce'); } },
      update(dt) { run += dt * (sp / 240); vy += 1400 * dt; y = Math.min(GY, y + vy * dt); sp = Math.min(420, sp + 8 * dt); t += dt; rival += (sp * 0.92 - sp) * dt + 6 * dt; rival = r.clamp(rival, -120, r.W + 40); clouds.forEach(c => { c.x -= 20 * dt; if (c.x < -60) c.x = r.W + 60; });
        if (t > 1.1) { t = 0; hs.push({ x: r.W + 20, hit: false, passed: false }); }
        hs.forEach(h => h.x -= sp * dt); hs = hs.filter(h => h.x > -40);
        for (const h of hs) { if (!h.hit && !h.passed && Math.abs(h.x - 70) < 16) { if (y > GY - 40) { h.hit = true; sp = 200; r.addScore(-5); r.pop('אאוץ׳', 70, GY - 70, '#EF4444'); r.shake(150); r.sfx('hit'); } } if (!h.passed && h.x < 50) { h.passed = true; if (!h.hit) { cleared++; r.addScore(10); r.pop('+10', 70, GY - 90, '#22C55E'); r.sfx('tick'); } } } },
      draw() { r.clear('#DBEAFE'); clouds.forEach(c => S.cloud(r, c.x, c.y)); r.rect(0, GY, r.W, r.H - GY, '#B45309'); for (let i = 0; i < 8; i++) r.rect(((i * 50 - run * 120) % (r.W + 50) + r.W + 50) % (r.W + 50) - 25, GY + 20, 40, 4, '#fff');
        hs.forEach(h => { r.rect(h.x - 3, GY - 44, 6, 44, h.hit ? '#9CA3AF' : '#fff'); r.rect(h.x - 22, GY - 44, 44, 6, h.hit ? '#9CA3AF' : '#EF4444'); r.rect(h.x - 22, GY - 22, 44, 4, h.hit ? '#9CA3AF' : '#fff'); });
        r.player(r.anim(POSE.run, run * 1000), rival, GY, 0.5, KITS.grey);
        r.player(y < GY - 2 ? POSE.leap : r.anim(POSE.run, run * 1000), 70, y, 0.55, KITS.purple); r.text(`משוכות: ${cleared}`, r.W / 2, 40, { size: 18, color: '#1E3A8A' }); },
    };
  } });

// ---- קפיצה לרוחק ----
G.push({ id: 'long-jump', name: 'קפיצה לרוחק', emoji: '🥇', how: 'נוגעים מהר כדי לצבור מהירות, וכשמגיעים לקו הלבן מחזיקים כדי לקפוץ. מי קופץ הכי רחוק?',
  make(r) {
    let x = 20, sp = 0, phase = 'run', jy = 0, vy = 0, res = '', rt = 0, best = 0, run = 0; const LINE = 230;
    return {
      tap() { if (phase === 'run') { sp = Math.min(320, sp + 28); r.sfx('tick'); } },
      down() { if (phase === 'run' && x > LINE - 40 && x <= LINE + 6) { phase = 'air'; vy = -380; r.sfx('bounce'); } },
      update(dt) { rt -= dt; run += dt * sp / 100; if (phase === 'run') { sp = Math.max(0, sp - 40 * dt); x += sp * dt; if (x > LINE + 6) { phase = 'foul'; res = 'פסול! קפצת אחרי הקו'; rt = 1.5; r.sfx('over'); } }
        if (phase === 'air') { vy += 700 * dt; jy += vy * dt; x += sp * dt; if (jy >= 0) { jy = 0; const m = Math.max(0, (x - LINE) / 40); res = `${m.toFixed(2)} מטר!`; r.addScore(Math.round(m * 10)); r.burst(x, r.H - 120, '#FBBF24', 16); r.sfx(m > best ? 'win' : 'score'); phase = 'done'; rt = 1.5; if (m > best) { best = m; if (best > 0.5) r.pop('שיא חדש!', x, r.H - 200, '#EF4444', 26); } } }
        if ((phase === 'done' || phase === 'foul') && rt <= 0) { phase = 'run'; x = 20; sp = 0; jy = 0; } },
      draw() { r.clear('#FCE7F3'); r.rect(0, r.H - 120, r.W, 120, '#DC2626'); for (let i = 0; i < 6; i++) r.rect(i * 60, r.H - 118, 40, 2, '#fff'); r.rect(LINE, r.H - 120, 4, 120, '#fff'); r.rect(LINE + 4, r.H - 120, r.W, 120, '#FBBF24'); for (let m = 1; m <= 3; m++) { r.line(LINE + m * 40, r.H - 120, LINE + m * 40, r.H - 100, '#fff', 2); r.text(m + 'מ', LINE + m * 40, r.H - 85, { size: 12, color: '#7C2D12' }); }
        const pose = phase === 'air' ? POSE.leap : phase === 'done' ? POSE.squat : phase === 'foul' ? POSE.stand : sp > 5 ? r.anim(POSE.run, run * 1000) : POSE.ready; r.player(pose, x, r.H - 120 + jy, 0.5, KITS.red);
        r.rect(20, 30, r.W - 40, 14, '#00000022', 7); r.rect(20, 30, (r.W - 40) * sp / 320, 14, sp > 250 ? '#22C55E' : '#F59E0B', 7); r.text('מהירות', r.W / 2, 60, { size: 14, color: '#831843' });
        if (rt > 0) r.text(res, r.W / 2, r.H / 2 - 40, { size: 26, color: '#831843' }); if (best) r.text(`השיא: ${best.toFixed(2)} מ׳`, r.W / 2, 90, { size: 16, color: '#831843' }); },
    };
  } });

export default G;

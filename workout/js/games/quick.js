// משחקי מהירות, תגובה וקצב
import { POSE, S, KITS } from './sprites.js';
const G = [];

// ---- אולה! (במקום חפרפרות): כדורים קופצים מחורים במגרש, נוגעים = בעיטה + "אולה" של הקהל. קקי = פלוץ ורעידה ----
G.push({ id: 'moles', name: 'אולה!', emoji: '⚽', how: 'כדור קופץ מהחור? נוגעים בו מהר, זה בעיטה והקהל צועק אולה! לא לגעת בקקי.',
  make(r) {
    const holes = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) holes.push({ x: 70 + i * 110, y: 150 + j * 105, up: 0, poop: false, rot: 0 });
    let t = 0, rate = 1.15, tt = 0, combo = 0, kicks = [], oleT = 0;
    const fans = r.crowdGen(14, r.W, 2, 12, 18);
    return {
      update(dt) { t += dt; tt += dt; oleT -= dt; if (t > rate) { t = 0; rate = Math.max(0.55, rate - 0.008); const h = r.pick(holes.filter(h => h.up <= 0)); if (h) { h.up = 1.4; h.poop = Math.random() < 0.18; h.rot = 0; } } holes.forEach(h => { h.up -= dt; h.rot += dt * 2; }); kicks.forEach(k => { k.t += dt * 1.6; }); kicks = kicks.filter(k => k.t < 1); },
      down(x, y) { const h = holes.find(h => r.dist(x, y, h.x, h.y - 20) < 44); if (h && h.up > 0) { h.up = 0; if (h.poop) { combo = 0; r.addScore(-10); r.pop('איכס! -10', h.x, h.y - 50, '#a3e635', 22); r.burst(h.x, h.y - 20, '#7c4a1e', 14, 200); r.shake(260); r.sfx('fart'); } else { combo++; const pts = 10 + Math.min(combo, 5) * 2; r.addScore(pts); r.pop('אולה! +' + pts, h.x, h.y - 50, '#FDE047', 24); r.burst(h.x, h.y - 20, '#fff', 8, 120); kicks.push({ x: h.x, y: h.y - 20, t: 0, tx: r.rnd(60, r.W - 60) }); r.sfx('ole'); oleT = .9; } } else if (h) { combo = 0; } },
      draw() { r.clear('#15803D'); r.rect(0, 0, r.W, 60, '#1F2937'); r.crowd(fans, tt, oleT > 0); for (let i = 0; i < 5; i++) r.rect(0, 100 + i * 100, r.W, 50, '#16A34A'); r.line(0, 62, r.W, 62, '#fff', 3);
        holes.forEach(h => { r.ctx.fillStyle = '#3f2a12'; r.ctx.beginPath(); r.ctx.ellipse(h.x, h.y + 10, 36, 16, 0, 0, Math.PI * 2); r.ctx.fill(); r.ctx.fillStyle = '#1c1007'; r.ctx.beginPath(); r.ctx.ellipse(h.x, h.y + 10, 28, 11, 0, 0, Math.PI * 2); r.ctx.fill();
          if (h.up > 0) { const rise = Math.min(1, (1.4 - h.up) * 5, h.up * 5); r.ctx.save(); r.ctx.beginPath(); r.ctx.rect(h.x - 44, h.y - 64, 88, 74); r.ctx.clip(); if (h.poop) S.poop(r, h.x, h.y + 14 - rise * 34, tt); else S.soccer(r, h.x, h.y + 24 - rise * 42, 20, h.rot); r.ctx.restore(); } });
        kicks.forEach(k => { const p = k.t; S.soccer(r, k.x + (k.tx - k.x) * p, k.y - p * (k.y + 20) - Math.sin(p * Math.PI) * 60, 20 - p * 12, p * 10); });
        if (oleT > 0) r.text('OLÉ!', r.W / 2, 90, { size: 34, color: '#FDE047' }); if (combo > 2) r.text(`רצף ${combo} 🔥`, r.W / 2, 125, { size: 18, color: '#fff' }); },
    };
  } });

// ---- תפוס פירות ----
G.push({ id: 'catch', name: 'תפוס את הפירות', emoji: '🧺', how: 'מזיזים את הסל עם האצבע. תופסים פירות, לא תופסים פצצות.',
  make(r) {
    let bx = r.W / 2, items = [], t = 0, sp = 180;
    return {
      move(x) { bx = r.clamp(x, 30, r.W - 30); }, down(x) { this.move(x); },
      update(dt) { t += dt; sp += 4 * dt; if (t > 0.7) { t = 0; items.push({ x: r.rnd(20, r.W - 20), y: -20, e: Math.random() < 0.2 ? '💣' : r.pick(['🍎', '🍌', '🍓', '🍇', '🍉']) }); }
        items.forEach(i => i.y += sp * dt); for (const i of items) if (i.y > r.H - 70 && i.y < r.H - 30 && Math.abs(i.x - bx) < 40) { if (i.e === '💣') { r.addScore(-20); r.pop('-20', bx, r.H - 90, '#EF4444'); r.shake(); r.sfx('over'); } else { r.addScore(10); r.pop('+10', bx, r.H - 90, '#16A34A'); r.sfx('score'); } i.y = r.H + 50; } items = items.filter(i => i.y < r.H + 20); },
      draw() { r.clear('#FEF9C3'); S.cloud(r, 80, 50); S.cloud(r, 280, 90, 0.7); items.forEach(i => r.emoji(i.e, i.x, i.y, 30)); S.basket(r, bx, r.H - 40); },
    };
  } });

// ---- התחמק ----
G.push({ id: 'dodge', name: 'התחמק מהסלעים', emoji: '🪨', how: 'מזיזים את הדמות עם האצבע. הסלעים נופלים, אתה מתחמק. כל שנייה נקודה.',
  make(r) {
    let px = r.W / 2, rocks = [], t = 0, alive = 0;
    return {
      move(x) { px = r.clamp(x, 16, r.W - 16); }, down(x) { this.move(x); },
      update(dt) { alive += dt; t += dt; if (t > Math.max(0.25, 0.7 - alive / 100)) { t = 0; rocks.push({ x: r.rnd(10, r.W - 10), y: -20, vy: r.rnd(200, 360), s: r.rnd(10, 22) }); }
        rocks.forEach(k => k.y += k.vy * dt); for (const k of rocks) if (k.y > r.H - 20 && !k.hit) { k.hit = true; r.burst(k.x, r.H - 20, '#78716C', 6, 100); } rocks = rocks.filter(k => k.y < r.H + 30); if (rocks.some(k => r.dist(k.x, k.y, px, r.H - 60) < k.s + 14)) return r.over('סלע נפל עליך!'); if (Math.floor(alive) !== Math.floor(alive - dt)) { r.addScore(2); if (Math.floor(alive) % 10 === 0) { r.pop(`${Math.floor(alive)} שניות!`, r.W / 2, 100, '#57534E', 24); r.sfx('score'); } } },
      draw() { r.clear('#E7E5E4'); r.rect(0, r.H - 20, r.W, 20, '#A8A29E'); rocks.forEach((k, i) => S.rock(r, k.x, k.y, k.s, i)); r.player(POSE.shuffle, px, r.H - 20, 0.42, KITS.green); },
    };
  } });

// ---- מגדל ----
G.push({ id: 'stacker', name: 'בונה מגדלים', emoji: '🏗️', how: 'הבלוק זז מצד לצד. נוגעים כדי להניח אותו בדיוק על הקודם. כמה גבוה תבנה?',
  make(r) {
    let stack = [{ x: r.W / 2 - 60, w: 120 }], cur = { x: 0, w: 120, dir: 1 }, sp = 200, off = 0;
    return {
      tap() { const top = stack[stack.length - 1]; const l = Math.max(cur.x, top.x), rgt = Math.min(cur.x + cur.w, top.x + top.w); const w = rgt - l; if (w <= 8) return r.over('הבלוק נפל!'); const perfect = Math.abs(cur.x - top.x) < 4; stack.push({ x: perfect ? top.x : l, w: perfect ? top.w : w }); r.addScore(perfect ? 20 : 10); if (perfect) { r.pop('מושלם! +20', r.W / 2, r.H - 60 - stack.length * 28 + off, r.C.gold, 24); r.burst(top.x + top.w / 2, r.H - 40 - stack.length * 28 + off, '#fff', 12); r.sfx('score'); } else r.sfx('tick'); cur = { x: 0, w: perfect ? top.w : w, dir: 1 }; sp += 12; if (stack.length > 10) off += 28; },
      update(dt) { cur.x += cur.dir * sp * dt; if (cur.x < 0 || cur.x + cur.w > r.W) cur.dir *= -1; },
      draw() { r.clear('#BFDBFE'); stack.forEach((b, i) => r.rect(b.x, r.H - 40 - i * 28 + off, b.w, 26, ['#F472B6', '#FB923C', '#FACC15', '#4ADE80', '#38BDF8', '#A78BFA'][i % 6], 4)); r.rect(cur.x, r.H - 40 - stack.length * 28 + off, cur.w, 26, '#1E293B', 4); r.text(`קומות: ${stack.length - 1}`, r.W / 2, 40, { size: 22, color: '#1E3A8A' }); },
    };
  } });

// ---- בועות ----
G.push({ id: 'bubbles', name: 'פיצוץ בועות', emoji: '🫧', how: 'בועות עולות. נוגעים בהן לפני שהן בורחות. קטנות שוות יותר.',
  make(r) {
    let bs = [], t = 0;
    return {
      update(dt) { t += dt; if (t > 0.45) { t = 0; const s = r.rnd(14, 40); bs.push({ x: r.rnd(40, r.W - 40), y: r.H + 40, s, vy: r.rnd(60, 140) + (40 - s) * 2, vx: r.rnd(-30, 30) }); } bs.forEach(b => { b.y -= b.vy * dt; b.x += b.vx * dt; }); bs = bs.filter(b => b.y > -50); },
      down(x, y) { const i = bs.findIndex(b => r.dist(x, y, b.x, b.y) < b.s + 6); if (i >= 0) { const b = bs[i], pts = Math.round(50 / b.s) + 1; r.addScore(pts); r.pop('+' + pts, b.x, b.y - b.s, '#fff'); r.burst(b.x, b.y, '#ffffffaa', 8, 120); r.sfx('tick'); bs.splice(i, 1); } },
      draw() { r.clear('#0EA5E9'); bs.forEach(b => { r.circle(b.x, b.y, b.s, '#ffffff55'); r.circle(b.x - b.s / 3, b.y - b.s / 3, b.s / 4, '#ffffffaa'); }); },
    };
  } });

// ---- חיתוך פירות ----
G.push({ id: 'slice', name: 'נינג׳ת פירות', emoji: '🍉', how: 'פירות עפים באוויר. מעבירים עליהם את האצבע כדי לחתוך. לא לחתוך פצצות!',
  make(r) {
    let fs = [], t = 0, trail = [];
    return {
      update(dt) { t += dt; if (t > 0.8) { t = 0; for (let k = 0; k < r.rint(1, 3); k++) fs.push({ x: r.rnd(60, r.W - 60), y: r.H + 20, vy: r.rnd(-620, -500), vx: r.rnd(-80, 80), e: Math.random() < 0.15 ? '💣' : r.pick(['🍉', '🍊', '🍎', '🍋', '🥝', '🍑']) }); }
        fs.forEach(f => { f.vy += 700 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }); fs = fs.filter(f => f.y < r.H + 60); trail.forEach(p => p.t -= dt); trail = trail.filter(p => p.t > 0); },
      move(x, y) { trail.push({ x, y, t: 0.25 }); for (let i = fs.length - 1; i >= 0; i--) if (r.dist(x, y, fs[i].x, fs[i].y) < 26) { const f = fs[i]; if (f.e === '💣') { r.addScore(-25); r.burst(f.x, f.y, '#374151', 20, 260); r.shake(); r.sfx('over'); } else { r.addScore(10); r.pop('+10', f.x, f.y - 30, '#fff'); r.burst(f.x, f.y, { '🍉': '#EF4444', '🍊': '#F97316', '🍎': '#DC2626', '🍋': '#FACC15', '🥝': '#84CC16', '🍑': '#FB923C' }[f.e] || '#fff', 10, 180); r.sfx('tick'); } fs.splice(i, 1); } },
      draw() { r.clear('#1C1917'); for (let i = 1; i < trail.length; i++) r.line(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y, '#ffffffcc', 4); fs.forEach(f => r.emoji(f.e, f.x, f.y, 40)); },
    };
  } });

// ---- סיימון ----
G.push({ id: 'simon', name: 'סיימון', emoji: '🎨', how: 'צופים בסדר שהכפתורים נדלקים, ואז חוזרים עליו. כל סבב מתארך באחד.',
  make(r) {
    const cols = ['#EF4444', '#22C55E', '#3B82F6', '#FACC15']; let seq = [], idx = 0, showing = true, st = 0, lit = -1, input = 0;
    const pos = i => [i % 2 ? 190 : 20, i < 2 ? 130 : 300];
    const next = () => { seq.push(r.rint(0, 3)); idx = 0; showing = true; st = 0; input = 0; };
    next();
    return {
      update(dt) { if (!showing) { if (lit >= 0) { st += dt; if (st > 0.2) lit = -1; } return; } st += dt; if (st > 0.55) { st = 0; if (idx < seq.length) { lit = seq[idx++]; } else { lit = -1; showing = false; } } else if (st > 0.4) lit = -1; },
      tap(x, y) { if (showing) return; const i = (x > r.W / 2 ? 1 : 0) + (y > 260 ? 2 : 0); lit = i; st = 0; r.sfx('tick'); if (seq[input] === i) { input++; if (input === seq.length) { r.addScore(seq.length * 10); r.pop(`סבב ${seq.length} ✓`, r.W / 2, 240, '#fff', 26); r.sfx('score'); setTimeout(next, 500); showing = true; } } else r.over(`נפלת בסבב ${seq.length}`); },
      draw() { r.clear('#111827'); for (let i = 0; i < 4; i++) { const [x, y] = pos(i); r.rect(x, y, 150, 150, lit === i ? cols[i] : cols[i] + '55', 16); } r.text(showing ? 'תראה...' : 'עכשיו אתה!', r.W / 2, 80, { size: 24 }); r.text(`סבב ${seq.length}`, r.W / 2, 490, { size: 20, color: r.C.muted }); },
    };
  } });

// ---- זמן תגובה ----
G.push({ id: 'reaction', name: 'זמן תגובה', emoji: '🚦', how: 'המסך אדום, מחכים. כשהוא נהיה ירוק, נוגעים הכי מהר שאפשר. נגיעה מוקדמת מאפסת.',
  make(r) {
    let phase = 'wait', t = 0, wait = r.rnd(1.2, 3.5), react = 0, msg = 'חכה לירוק...';
    return {
      update(dt) { t += dt; if (phase === 'wait' && t > wait) { phase = 'go'; t = 0; } if (phase === 'go') react = t; if (phase === 'done' && t > 1.4) { phase = 'wait'; t = 0; wait = r.rnd(1.2, 3.5); msg = 'חכה לירוק...'; } },
      down() { if (phase === 'wait') { msg = 'מוקדם מדי! מתחילים שוב'; t = 0; wait = r.rnd(1.2, 3.5); } else if (phase === 'go') { phase = 'done'; t = 0; const ms = Math.round(react * 1000); msg = `${ms} אלפיות שנייה`; const pts = Math.max(1, Math.round((600 - ms) / 20)); r.addScore(pts); r.pop((ms < 250 ? 'מהיר כמו ברק! ' : '') + '+' + pts, r.W / 2, 120, '#FDE047', 26); r.sfx(ms < 250 ? 'win' : 'score'); } },
      draw() { r.clear(phase === 'wait' ? '#DC2626' : phase === 'go' ? '#16A34A' : '#1F2937'); r.emoji(phase === 'go' ? '🟢' : phase === 'wait' ? '🔴' : '⏱️', r.W / 2, 200, 90); r.text(msg, r.W / 2, 330, { size: 26 }); },
    };
  } });

// ---- צבע או מילה ----
G.push({ id: 'stroop', name: 'צבע או מילה', emoji: '🎨', how: 'כתובה מילה של צבע, אבל בצבע אחר. נוגעים בכפתור של הצבע שבו המילה כתובה, לא מה שכתוב.',
  make(r) {
    const C = [['אדום', '#EF4444'], ['ירוק', '#22C55E'], ['כחול', '#3B82F6'], ['צהוב', '#FACC15']]; let word, color, streak = 0, t = 0;
    const make = () => { word = r.rint(0, 3); color = Math.random() < 0.3 ? word : r.rint(0, 3); t = 0; };
    make();
    return {
      update(dt) { t += dt; if (t > 3) { streak = 0; r.addScore(-2); make(); } },
      tap(x, y) { if (y < 330) return; const i = (x > r.W / 2 ? 1 : 0) + (y > 440 ? 2 : 0); if (i === color) { streak++; const pts = 5 + Math.min(streak, 10); r.addScore(pts); r.pop('+' + pts, r.W / 2, 240, '#16A34A'); r.sfx('score'); } else { streak = 0; r.addScore(-3); r.pop('לא!', r.W / 2, 240, '#EF4444'); r.sfx('hit'); } make(); },
      draw() { r.clear('#F5F5F4'); r.text(C[word][0], r.W / 2, 180, { size: 56, color: C[color][1] }); r.rect(20, 40, r.W - 40, 10, '#E7E5E4', 5); r.rect(20, 40, (r.W - 40) * Math.max(0, 1 - t / 3), 10, r.C.accent, 5);
        C.forEach(([n, c], i) => { const x = i % 2 ? r.W / 2 + 10 : 20, y = i < 2 ? 340 : 450; r.rect(x, y, r.W / 2 - 30, 100, c, 14); r.text(n, x + r.W / 4 - 15, y + 50, { size: 26 }); }); },
    };
  } });

// ---- חשבון מהיר ----
G.push({ id: 'math', name: 'חשבון מהיר', emoji: '🧮', how: 'תרגיל חשבון וארבע תשובות. בוחרים מהר. רצף נכון מכפיל נקודות.',
  make(r) {
    let q, ans, opts, streak = 0, t = 0;
    const make = () => { const k = r.rint(0, 2); let a, b; if (k === 0) { a = r.rint(3, 40); b = r.rint(3, 40); q = `${a} + ${b}`; ans = a + b; } else if (k === 1) { a = r.rint(10, 60); b = r.rint(1, a); q = `${a} − ${b}`; ans = a - b; } else { a = r.rint(2, 9); b = r.rint(2, 9); q = `${a} × ${b}`; ans = a * b; }
      const s = new Set([ans]); while (s.size < 4) s.add(Math.max(0, ans + r.pick([-1, 1]) * r.rint(1, 6))); opts = r.shuffle([...s]); t = 0; };
    make();
    return {
      update(dt) { t += dt; if (t > 6) { streak = 0; make(); } },
      tap(x, y) { if (y < 300) return; const i = (x > r.W / 2 ? 1 : 0) + (y > 420 ? 2 : 0); if (opts[i] === ans) { streak++; r.addScore(10 + streak * 2); r.pop('נכון! +' + (10 + streak * 2), r.W / 2, 230, '#065F46', 24); r.sfx('score'); } else { streak = 0; r.addScore(-5); r.pop(`${ans}`, r.W / 2, 230, '#DC2626', 30); r.sfx('hit'); } make(); },
      draw() { r.clear('#ECFDF5'); r.ctx.direction = 'ltr'; r.text(q + ' = ?', r.W / 2, 160, { size: 44, color: '#065F46' }); opts.forEach((o, i) => { const x = i % 2 ? r.W / 2 + 8 : 16, y = i < 2 ? 310 : 430; r.rect(x, y, r.W / 2 - 24, 100, '#10B981', 14); r.text(o, x + r.W / 4 - 12, y + 50, { size: 34 }); }); r.text(`רצף: ${streak}`, r.W / 2, 60, { size: 18, color: '#065F46' }); },
    };
  } });

// ---- מטרות ----
G.push({ id: 'aim', name: 'מטווח מטרות', emoji: '🎯', how: 'מטרות מופיעות ונעלמות. נוגעים בהן מהר. קטנות שוות יותר.',
  make(r) {
    let ts = [], t = 0;
    return {
      update(dt) { t += dt; if (t > 0.6) { t = 0; ts.push({ x: r.rnd(40, r.W - 40), y: r.rnd(80, r.H - 40), s: r.rnd(18, 40), life: 1.6, vx: r.rnd(-60, 60), vy: r.rnd(-60, 60) }); } ts.forEach(k => { k.life -= dt; k.x = r.clamp(k.x + k.vx * dt, 20, r.W - 20); k.y = r.clamp(k.y + k.vy * dt, 60, r.H - 20); }); ts = ts.filter(k => k.life > 0); },
      down(x, y) { const i = ts.findIndex(k => r.dist(x, y, k.x, k.y) < k.s); if (i >= 0) { const k = ts[i], pts = Math.round(60 / k.s) * 3; r.addScore(pts); r.pop('+' + pts, k.x, k.y - k.s - 10, '#EF4444'); r.burst(k.x, k.y, '#EF4444', 10, 160); r.sfx('tick'); ts.splice(i, 1); } else r.addScore(-1); },
      draw() { r.clear('#F8FAFC'); ts.forEach(k => { r.circle(k.x, k.y, k.s, '#EF4444'); r.circle(k.x, k.y, k.s * 0.66, '#fff'); r.circle(k.x, k.y, k.s * 0.33, '#EF4444'); }); },
    };
  } });

// ---- אריחי פסנתר ----
G.push({ id: 'piano', name: 'אריחי פסנתר', emoji: '🎹', how: 'אריחים שחורים יורדים בארבעה טורים. נוגעים בכל אריח שחור לפני שהוא יוצא מהמסך.',
  make(r) {
    let tiles = [], sp = 200, next = -80;
    for (let i = 0; i < 6; i++) tiles.push({ c: r.rint(0, 3), y: -i * 100 - 80, hit: false });
    return {
      update(dt) { sp += 3 * dt; tiles.forEach(t => t.y += sp * dt); if (tiles.some(t => t.y > r.H && !t.hit)) return r.over('פספסת אריח!'); tiles = tiles.filter(t => t.y < r.H + 100); while (tiles.length < 7) { const last = Math.min(...tiles.map(t => t.y)); tiles.push({ c: r.rint(0, 3), y: last - 100, hit: false }); } },
      down(x, y) { const c = Math.floor(x / (r.W / 4)); const t = tiles.find(t => t.c === c && !t.hit && y > t.y && y < t.y + 100); if (t) { t.hit = true; r.addScore(5); r.sfx('tick'); } else r.over('לחצת על אריח לבן!'); },
      draw() { r.clear('#fff'); for (let i = 1; i < 4; i++) r.line(i * r.W / 4, 0, i * r.W / 4, r.H, '#E5E7EB', 2); tiles.forEach(t => r.rect(t.c * r.W / 4 + 2, t.y, r.W / 4 - 4, 98, t.hit ? '#D1D5DB' : '#111827', 4)); },
    };
  } });

// ---- קצב ----
G.push({ id: 'rhythm', name: 'משחק הקצב', emoji: '🥁', how: 'עיגולים מתקרבים לקו. נוגעים בדיוק כשהעיגול על הקו. מושלם = 10, קרוב = 5.',
  make(r) {
    let notes = [], t = 0, msg = '', mt = 0, bpm = 0.8;
    return {
      update(dt) { t += dt; mt -= dt; if (t > bpm) { t = 0; bpm = Math.max(0.45, bpm - 0.005); notes.push({ y: -20 }); } notes.forEach(n => n.y += 260 * dt); if (notes.some(n => n.y > r.H - 60)) { notes = notes.filter(n => n.y <= r.H - 60); msg = 'פספוס'; mt = 0.5; r.addScore(-3); } },
      down() { const LINE = r.H - 120; let best = -1, bd = 999; notes.forEach((n, i) => { const d = Math.abs(n.y - LINE); if (d < bd) { bd = d; best = i; } }); if (best >= 0 && bd < 50) { notes.splice(best, 1); const pts = bd < 15 ? 10 : 5; r.addScore(pts); msg = pts === 10 ? 'מושלם!' : 'טוב'; mt = 0.5; r.burst(r.W / 2, LINE, pts === 10 ? '#FDE047' : '#F472B6', pts === 10 ? 14 : 6, 160); r.sfx(pts === 10 ? 'score' : 'tick'); } else { msg = 'מוקדם'; mt = 0.5; } },
      draw() { r.clear('#312E81'); const LINE = r.H - 120; r.line(20, LINE, r.W - 20, LINE, '#F472B6', 6); notes.forEach(n => r.circle(r.W / 2, n.y, 22, '#FDE047')); if (mt > 0) r.text(msg, r.W / 2, LINE + 60, { size: 26 }); },
    };
  } });

// ---- גולה במבוך ----
G.push({ id: 'marble', name: 'גולה במבוך', emoji: '🔮', how: 'האצבע מושכת את הגולה כמו מגנט. מובילים אותה לכוכב בלי לגעת בקירות.',
  make(r) {
    let ball, walls, star, level = 0;
    const make = () => { ball = { x: 40, y: r.H - 60, vx: 0, vy: 0 }; star = { x: r.W - 40, y: 80 }; walls = []; for (let k = 0; k < 4 + level; k++) walls.push({ x: r.rnd(40, r.W - 120), y: r.rnd(120, r.H - 140), w: r.rnd(50, 130), h: 12 }); walls = walls.filter(w => !r.hit(w.x, w.y, w.w, w.h, 10, r.H - 90, 60, 60) && !r.hit(w.x, w.y, w.w, w.h, r.W - 70, 50, 60, 60)); };
    make();
    return {
      update(dt) { if (r.isDown) { ball.vx += (r.px - ball.x) * 4 * dt; ball.vy += (r.py - ball.y) * 4 * dt; } ball.vx *= 0.985; ball.vy *= 0.985; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 12 || ball.x > r.W - 12 || ball.y < 12 || ball.y > r.H - 12 || walls.some(w => r.hit(ball.x - 10, ball.y - 10, 20, 20, w.x, w.y, w.w, w.h))) return r.over('נגעת בקיר!');
        if (r.dist(ball.x, ball.y, star.x, star.y) < 22) { level++; r.addScore(30 + level * 5); r.pop(`שלב ${level} ✓`, r.W / 2, 60, r.C.gold, 26); r.burst(star.x, star.y, r.C.gold, 16); r.sfx('score'); make(); } },
      draw() { r.clear('#0F172A'); r.rect(0, 0, r.W, 4, r.C.hot); r.rect(0, r.H - 4, r.W, 4, r.C.hot); r.rect(0, 0, 4, r.H, r.C.hot); r.rect(r.W - 4, 0, 4, r.H, r.C.hot); walls.forEach(w => r.rect(w.x, w.y, w.w, w.h, r.C.hot, 4)); r.emoji('⭐', star.x, star.y, 30); r.circle(ball.x, ball.y, 10, '#A5F3FC'); },
    };
  } });

// ---- הגנה מטילים ----
G.push({ id: 'defense', name: 'מגן העיר', emoji: '🏙️', how: 'טילים נופלים על הבתים. נוגעים על טיל כדי לפוצץ אותו באוויר. שלושה בתים נפגעו, נגמר.',
  make(r) {
    let ms = [], t = 0, houses = [1, 1, 1, 1, 1], booms = [];
    return {
      update(dt) { t += dt; if (t > 1) { t = 0; const target = r.rint(0, 4); ms.push({ x: r.rnd(20, r.W - 20), y: -10, tx: 36 + target * 72, target, sp: r.rnd(70, 130) }); }
        ms.forEach(m => { const dx = m.tx - m.x, dy = r.H - 40 - m.y, l = Math.hypot(dx, dy); m.x += dx / l * m.sp * dt; m.y += dy / l * m.sp * dt; if (m.y >= r.H - 50) { if (houses[m.target]) { r.shake(); r.sfx('hit'); } houses[m.target] = 0; m.dead = true; booms.push({ x: m.x, y: m.y, t: 0.5 }); } });
        ms = ms.filter(m => !m.dead); booms.forEach(b => b.t -= dt); booms = booms.filter(b => b.t > 0); if (houses.filter(Boolean).length <= 2) r.over('העיר נפלה!'); },
      down(x, y) { const i = ms.findIndex(m => r.dist(x, y, m.x, m.y) < 30); if (i >= 0) { booms.push({ x: ms[i].x, y: ms[i].y, t: 0.5 }); r.burst(ms[i].x, ms[i].y, '#FDE047', 12, 180); r.pop('+10', ms[i].x, ms[i].y - 30, '#fff'); r.sfx('tick'); ms.splice(i, 1); r.addScore(10); } },
      draw() { r.clear('#0B1026'); for (let i = 0; i < 25; i++) r.circle((i * 97) % r.W, (i * 61) % (r.H - 100), 1, '#ffffff66'); r.rect(0, r.H - 20, r.W, 20, '#1E293B'); houses.forEach((h, i) => S.house(r, 36 + i * 72, r.H - 30, !h, t)); ms.forEach(m => { r.line(m.x, m.y - 14, m.x, m.y, '#FCA5A5', 3); r.emoji('🚀', m.x, m.y, 20); }); booms.forEach(b => r.circle(b.x, b.y, 30 * (1 - b.t), '#FDE047aa')); },
    };
  } });

// ---- אבן נייר ומספריים ----
G.push({ id: 'rps', name: 'אבן נייר ומספריים', emoji: '✂️', how: 'בוחרים אבן, נייר או מספריים נגד המחשב. ניצחון 10, תיקו 3.',
  make(r) {
    const E = ['🪨', '📄', '✂️'], N = ['אבן', 'נייר', 'מספריים']; let me = -1, cpu = -1, msg = 'בחר!', mt = 0, streak = 0;
    return {
      tap(x, y) { if (mt > 0 || y < 380) return; me = Math.floor((r.W - x) / (r.W / 3)); cpu = r.rint(0, 2); const w = (me - cpu + 3) % 3; msg = w === 0 ? 'תיקו' : w === 1 ? 'ניצחת! 🎉' : 'הפסדת'; if (w === 1) { streak++; r.addScore(10 + streak * 2); r.burst(r.W / 2, 240, '#F59E0B', 14); r.sfx('score'); } else if (w === 0) { r.addScore(3); r.sfx('tick'); } else { streak = 0; r.sfx('hit'); } mt = 1.2; },
      update(dt) { if (mt > 0) { mt -= dt; if (mt <= 0) { me = cpu = -1; msg = 'בחר!'; } } },
      draw() { r.clear('#FFFBEB'); r.emoji(cpu >= 0 ? E[cpu] : '🤖', r.W / 2, 130, 80); r.text(msg, r.W / 2, 240, { size: 30, color: '#92400E' }); r.emoji(me >= 0 ? E[me] : '❔', r.W / 2, 320, 60); E.forEach((e, i) => { const x = r.W - i * r.W / 3 - r.W / 6; r.rect(x - 50, 400, 100, 110, '#F59E0B', 14); r.emoji(e, x, 440, 44); r.text(N[i], x, 490, { size: 16 }); }); },
    };
  } });

export default G;

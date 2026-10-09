// פנדלים ו"אני השוער" בתלת-ממד (01/10/2026): אותו אצטדיון, דמות מצוירת, פוזות בעיטה ושוער כמו בחגיגות (celebrate3d), אותם חוקים
// כמו הגרסה הדו-ממדית (9 אזורים, השוער מנחש צד וגובה, 3 פספוסים = נפסלת). בלי WebGL חוזרים לגרסה הדו-ממדית מ-sport.js.
import { layer3d } from './layer3d.js?v=20261009-companion-1';
import { loadCharacter, KITS3D, soccerBallMesh } from '../char3d.js?v=20261009-companion-1';
import { stadium, pose, face, ballShadow, KICKP, GK_SET, FIST, CROUCH_F } from './celebrate3d.js?v=20261009-companion-1';
import { SPRINT, poseAt } from './celebrate.js?v=20261009-companion-1';
import { penaltyGame } from './sport.js?v=20261009-companion-1';

const GZ = -600, GW = 690, GH = 230, SZ = GZ + 640, BALL_R = 11, FLY_T = .55;
// פוזות מלפנים (200x200): ידיים למעלה (חגיגה), זינוק (ידיים מעל הראש, הגוף מסתובב בעולם), כריעה נמוכה, שכיבה
const ARMS_UP = { head: [100, 50], neck: [100, 66], hip: [100, 112], le: [84, 42], lh: [80, 14], re: [116, 42], rh: [120, 14], lk: [92, 148], lf: [88, 182], rk: [108, 148], rf: [112, 182] };
const DIVE = { head: [100, 52], neck: [100, 68], hip: [100, 114], le: [90, 40], lh: [88, 12], re: [110, 40], rh: [112, 12], lk: [94, 150], lf: [88, 180], rk: [108, 146], rf: [118, 176] };
const LOW = { head: [100, 84], neck: [100, 100], hip: [100, 140], le: [76, 128], lh: [66, 158], re: [124, 128], rh: [134, 158], lk: [76, 160], lf: [68, 182], rk: [124, 160], rf: [132, 182] };
const runPose = (dist, stride = 90) => { const p = poseAt(SPRINT, ((dist / stride) % 1) * 8); p.lat = .1; return p; };

function penalty3d(role) {
  return function make(r, progress) {
    const L = layer3d(r, { fov: 54 }); if (!L.ok) { L.dispose(); return penaltyGame(role)(r, progress); }
    const { sc, cam, THREE } = L;
    const world = stadium(sc, GZ); const fans = world.fans, net = world.g;
    // נקודת הפנדל + קשת הרחבה הקטנה
    const spot = new THREE.Mesh(new THREE.CircleGeometry(7, 16), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); spot.rotation.x = -Math.PI / 2; spot.position.set(0, .7, SZ); sc.add(spot);
    cam.position.set(80, 320, SZ + 600); cam.lookAt(0, 80, GZ + 40); /* מאחורי הבועט ומעט מעליו, הבועט לא מסתיר את השער */
    const ballM = soccerBallMesh(BALL_R); sc.add(ballM); const shadow = ballShadow(sc);
    let kicker = null, keeper = null; const kKit = role === 'kicker' ? KITS3D.maccabi : KITS3D.red;
    loadCharacter(kKit).then(ch => { kicker = ch; sc.add(ch.model); }).catch(() => {});
    loadCharacter(KITS3D.keeper).then(ch => { keeper = ch; sc.add(ch.model); }).catch(() => {});
    // 9 אזורים בעולם: עמודות שלישי השער, שורות שלישי הגובה
    const zoneWorld = (c, rw) => [c * GW / 3, GH - GH / 6 - rw * GH / 3];
    const colOfX = x => x < -GW / 6 ? -1 : x > GW / 6 ? 1 : 0, rowOfY = y => y > GH * 2 / 3 ? 0 : y < GH / 3 ? 2 : 1;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const toGoalPlane = (sx, sy) => { ndc.set(sx / r.W * 2 - 1, -(sy / r.H) * 2 + 1); ray.setFromCamera(ndc, cam); const o = ray.ray.origin, d = ray.ray.direction; const t = (GZ - o.z) / (d.z || -1e-6); return [o.x + d.x * t, o.y + d.y * t]; };
    // מצב המשחק (אותם חוקים כמו בדו-ממד)
    let phase = 'aim', ph = 0, shot = null, gk = { col: 0, row: 1, reach: 1, dive: false, laugh: 0 }, msg = '', streak = 0, tt = 0, goals = 0, saves = 0, bulge = 0, ready = 1, pick = null, kicks = 0, fails = 0; const MAXF = 3;
    const ball = { p: new THREE.Vector3(0, BALL_R, SZ), v: new THREE.Vector3(), rot: 0, state: 'spot' }; /* spot | fly | net | loose | stuck */
    const K0 = new THREE.Vector3(-118, 0, SZ + 150), K1 = new THREE.Vector3(-24, 0, SZ + 34); /* ריצה אלכסונית אל הכדור */
    const kick = { pos: K0.clone(), yaw: Math.atan2(K1.x - K0.x, K1.z - K0.z), dist: 0 };
    const keep = { x: 0, y: 0, rotZ: 0, tx: 0, ty: 0, tRot: 0 };
    const runDur = role === 'keeper' ? 1.0 : .62, KICK_T = .34; /* ריצה, ואז תנופה-פגיעה-מעקב */
    const resetBall = () => { phase = 'aim'; ph = 0; shot = null; pick = null; gk.dive = false; ready = 0; ball.state = 'spot'; ball.p.set(0, BALL_R, SZ); ball.v.set(0, 0, 0); kick.pos.copy(K0); kick.dist = 0; keep.tx = 0; keep.ty = 0; keep.tRot = 0; };
    const keeperGuess = (col, row) => { const smart = Math.min(0.85, 0.6 + goals * 0.04); const c = Math.random() < smart ? col : r.pick([-1, 0, 1].filter(v => v !== col)); const rw = Math.random() < 0.55 ? row : r.pick([0, 1, 2].filter(v => v !== row)); return { col: c, row: rw, reach: r.rnd(0.5 + Math.min(0.3, goals * 0.03), 1) }; };
    const startKick = (tx, ty) => { shot = { tx, ty, col: colOfX(tx), row: rowOfY(ty) }; phase = 'run'; ph = 0; kicks++; };
    const keeperStops = () => { if (gk.col !== shot.col) return false; if (gk.row === shot.row) return gk.reach > .5 || Math.abs(shot.tx) < 230; return Math.abs(gk.row - shot.row) === 1 && Math.random() < .35; };
    const proj = (x, y, z) => L.project(x, y, z);
    const aimTap = (x, y) => { let [wx, wy] = toGoalPlane(x, y); wx = r.clamp(wx, -460, 460); wy = r.clamp(wy, 6, 330); const edge = Math.min(Math.abs(Math.abs(wx) - GW / 2), Math.abs(wy - GH)); const wobble = edge < 60 ? (60 - edge) * .5 : 0; wx += r.rnd(-wobble, wobble); wy += r.rnd(-wobble, wobble); return [wx, wy]; };
    const pickZone = (x, y) => { const [wx, wy] = toGoalPlane(x, y); if (wy < -40 || wy > GH + 90 || Math.abs(wx) > GW / 2 + 90) return null; return { col: colOfX(r.clamp(wx, -GW / 2, GW / 2)), row: rowOfY(r.clamp(wy, 0, GH)) }; };
    const judge = () => { const { tx, ty } = shot; const post = (Math.abs(Math.abs(tx) - GW / 2) < 9 && ty < GH + 6) || (Math.abs(ty - GH) < 8 && Math.abs(tx) < GW / 2 + 6); const inGoal = !post && Math.abs(tx) < GW / 2 - 8 && ty < GH - 6; const stopped = inGoal && keeperStops(); const corner = shot.col !== 0 && shot.row !== 1; const [sx, sy] = proj(tx, ty, GZ);
      if (role === 'kicker') {
        if (inGoal && !stopped) { streak++; goals++; const pts = 10 * Math.min(3, streak) + (corner ? 5 : 0) + Math.floor(goals / 3) * 5; r.addScore(pts); r.sparkle(sx, sy, 34, 10); r.pop('+' + pts, sx, sy - 20, '#FDE047', 28); r.burst(sx, sy, '#fff', 20, 260); r.sfx('goal'); msg = streak >= 3 ? `גול! רצף ${streak} 🔥` : 'גוווול! ⚽'; bulge = 1; ball.state = 'net'; }
        else { streak = 0; fails++; msg = (post ? 'קורה! 😱' : inGoal ? 'השוער עצר! 🧤' : 'החוצה... 😂') + ` (${fails}/${MAXF})`; if (post) { r.sfx('post'); r.shake(220); r.burst(sx, sy, '#fff', 14, 220); ball.state = Math.random() < .25 ? 'stuck' : 'loose'; ball.v.set((tx < 0 ? -1 : 1) * r.rnd(60, 160), r.rnd(80, 220), r.rnd(260, 420)); } else if (inGoal) { r.sfx('hit'); ball.state = 'loose'; ball.v.set((tx < 0 ? -1 : 1) * r.rnd(160, 300), r.rnd(60, 180), r.rnd(160, 300)); } else { r.sfx('laugh'); gk.laugh = 1.4; ball.state = 'loose'; ball.v.set((tx < 0 ? -1 : 1) * 40, 0, -220); } }
      } else {
        if (inGoal && !stopped) { streak = 0; goals++; fails++; msg = `גול נגדך... 😬 (${fails}/${MAXF})`; bulge = 1; r.sfx('ohh'); ball.state = 'net'; }
        else if (stopped) { streak++; saves++; const pts = 10 * Math.min(3, streak) + (corner ? 5 : 0) + Math.floor(saves / 3) * 5; r.addScore(pts); const [kx, ky] = proj(keep.x, 150, GZ + 40); r.pop('עצירה! +' + pts, kx, ky - 40, '#FDE047', 28); r.burst(kx, ky, '#fff', 20, 260); r.sfx('roar'); msg = streak >= 3 ? `עצירה! רצף ${streak} 🧤🔥` : 'עצירה! 🧤'; r.shake(160); ball.state = 'loose'; ball.v.set((tx < 0 ? -1 : 1) * r.rnd(160, 300), r.rnd(60, 180), r.rnd(160, 300)); }
        else { r.addScore(5); msg = post ? 'קורה! מזל 😅 +5' : 'החוצה! +5'; if (post) { r.sfx('post'); ball.state = 'loose'; ball.v.set((tx < 0 ? -1 : 1) * r.rnd(60, 160), r.rnd(80, 220), r.rnd(260, 420)); } else { r.sfx('score'); ball.state = 'loose'; ball.v.set((tx < 0 ? -1 : 1) * 40, 0, -220); } }
      }
      phase = 'after'; ph = 0; };
    const scoredNow = () => role === 'kicker' ? msg.startsWith('ג') : msg.startsWith('גול');
    const zoneRect = (c, rw) => { const [zx, zy] = zoneWorld(c, rw); const hw = GW / 6 - 4, hh = GH / 6 - 3; return [proj(zx - hw, zy + hh, GZ), proj(zx + hw, zy + hh, GZ), proj(zx + hw, zy - hh, GZ), proj(zx - hw, zy - hh, GZ)]; };
    return {
      tap(x, y) { if (phase !== 'aim' || ready < 1) return;
        if (role === 'kicker') { const [wx, wy] = aimTap(x, y); startKick(wx, wy); const g = keeperGuess(shot.col, shot.row); gk.col = g.col; gk.row = g.row; gk.reach = g.reach; }
        else { const z = pickZone(x, y); if (!z) return; pick = z; gk.col = z.col; gk.row = z.row; gk.reach = 1; } },
      down(x, y) { if (role === 'keeper' && (phase === 'run' || phase === 'kick' || (phase === 'fly' && ph < .22)) && !pick) { const z = pickZone(x, y); if (!z) return; pick = z; gk.col = z.col; gk.row = z.row; gk.reach = 1; } },
      peek() { const goalPx = (() => { const [x0, y0] = proj(-GW / 2, GH, GZ), [x1, y1] = proj(GW / 2, 0, GZ); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; })(); return { phase, ready, shot: shot ? { col: shot.col, row: shot.row, tx: shot.tx, ty: shot.ty } : null, zoneCenter: (c, rw) => { const [zx, zy] = zoneWorld(c, rw); const [px, py] = proj(zx, zy, GZ); return [px, py]; }, goal: goalPx, GL: goalPx.y + goalPx.h, keeper: { x: keep.x, y: keep.y, rotZ: keep.rotZ }, ball: { x: ball.p.x, y: ball.p.y, z: ball.p.z, state: ball.state } }; },
      dbg(o) { if (o.goals != null) goals = o.goals; if (o.streak != null) streak = o.streak; },
      dispose() { L.dispose(); },
      revive() { fails = 0; resetBall(); },
      update(dt) { tt += dt; bulge = Math.max(0, bulge - dt * 1.4); gk.laugh = Math.max(0, gk.laugh - dt); ball.rot += dt * (ball.state === 'fly' ? 14 : ball.state === 'loose' ? 6 : 0);
        if (phase === 'aim') { ready = Math.min(1, ready + dt * 1.6);
          if (role === 'keeper' && ready >= 1) { const col = r.pick([-1, -1, 1, 1, 0]), row = r.pick([0, 1, 2, 2, 0]); const [zx, zy] = zoneWorld(col, row); startKick(zx + r.rnd(-60, 60), zy + r.rnd(-24, 24)); gk.col = 0; gk.row = 1; gk.reach = 1; pick = null; } }
        else ph += dt;
        if (phase === 'run') { const k = Math.min(1, ph / runDur); kick.pos.lerpVectors(K0, K1, k); kick.dist = K0.distanceTo(kick.pos); if (ph >= runDur) { phase = 'kick'; ph = 0; } }
        if (phase === 'kick') { if (ph >= KICK_T * .45 && ball.state === 'spot') { ball.state = 'fly'; ball.t0 = tt; gk.dive = true; r.sfx('bounce'); } if (ph >= KICK_T) { phase = 'fly'; ph = 0; } }
        if (ball.state === 'fly') { const k = Math.min(1, (tt - ball.t0) / FLY_T); ball.p.set(shot.tx * k, BALL_R + (shot.ty - BALL_R) * k + Math.sin(k * Math.PI) * 36, SZ + (GZ - SZ) * k); if (k >= 1) judge(); }
        if (gk.dive) { const reach = gk.reach; keep.tx = gk.col * (GW / 2 - 60) * (0.55 + 0.45 * reach); keep.ty = gk.col === 0 ? [40, 0, 0][gk.row] : [78, 36, 6][gk.row]; keep.tRot = gk.col === 0 ? 0 : -gk.col * [1.15, 1.0, 1.4][gk.row]; }
        if (phase === 'after' && scoredNow() && gk.col !== 0) { keep.ty = 6; keep.tRot = -gk.col * 1.5; } /* השוער שוכב על הדשא אחרי שער */
        const kk = Math.min(1, dt * (gk.dive ? 7 : 4)); keep.x += (keep.tx - keep.x) * kk; keep.y += (keep.ty - keep.y) * kk; keep.rotZ += (keep.tRot - keep.rotZ) * kk;
        // כדור חופשי: כבידה, קרקע, נעצר
        if (ball.state === 'loose') { ball.v.y -= 900 * dt; ball.p.addScaledVector(ball.v, dt); if (ball.p.y < BALL_R) { ball.p.y = BALL_R; ball.v.y = -ball.v.y * .45; ball.v.x *= .8; ball.v.z *= .8; if (Math.abs(ball.v.y) > 60) r.sfx('bounce'); } }
        else if (ball.state === 'net') { ball.p.z = Math.max(GZ - 110, ball.p.z - dt * 260); ball.p.y = Math.max(BALL_R, ball.p.y - dt * 120); }
        if (net && net.bulge) net.bulge(bulge * Math.abs(Math.cos(tt * 12)));
        if (phase === 'after' && ph > 1.6) { if (fails >= MAXF) return r.over(role === 'kicker' ? 'שלושה פספוסים!' : 'שלושה שערים נגדך!'); resetBall(); }
        // דמויות
        if (kicker) { const m = kicker.model; const pos = kick.pos.clone(); let target, front = false, yaw = kick.yaw;
          if (phase === 'run') target = runPose(kick.dist);
          else if (phase === 'kick') { const u = ph / KICK_T; target = u < .3 ? KICKP.back : u < .55 ? KICKP.hit : KICKP.follow; yaw = Math.atan2(0 - pos.x, GZ - pos.z); }
          else if (phase === 'fly') { target = KICKP.follow; yaw = Math.atan2(0 - pos.x, GZ - pos.z); }
          else if (phase === 'after') { const sc2 = scoredNow(); if (sc2 === (role === 'kicker')) { front = true; yaw = 0; pos.y = Math.abs(Math.sin(tt * 7)) * 18; target = ARMS_UP; } else { front = true; yaw = Math.PI; target = CROUCH_F; } }
          else { front = true; yaw = Math.PI; target = ph > 0 ? CROUCH_F : CROUCH_F; target = CROUCH_F; }
          m.rotation.y = yaw; pose(kicker, target, front, pos, dt, phase === 'kick' ? 22 : 10); }
        if (keeper) { const m = keeper.model; m.rotation.y = 0; m.rotation.z = keep.rotZ; const pos = new THREE.Vector3(keep.x, keep.y, GZ + 44); let target = GK_SET;
          if (gk.dive || (phase === 'after' && Math.abs(keep.rotZ) > .3)) target = gk.col === 0 ? (gk.row === 0 ? ARMS_UP : gk.row === 2 ? LOW : GK_SET) : DIVE;
          if (gk.laugh > 0) { target = ARMS_UP; pos.y = Math.abs(Math.sin(tt * 14)) * 10; }
          pose(keeper, target, true, pos, dt, gk.dive ? 14 : 8); }
        ballM.position.copy(ball.p); ballM.rotation.x = -ball.rot; shadow(ballM);
        if (fans && fans.update) fans.update(tt, phase === 'after' && (role === 'kicker' ? msg.startsWith('ג') : msg.startsWith('עצירה'))); },
      draw() { const c = r.ctx; c.clearRect(0, 0, r.W, r.H); L.render();
        // 9 האזורים: בכיוון (קל יותר לילד), ובזמן הריצה כשאני השוער
        const showGrid = (role === 'kicker' && phase === 'aim' && ready >= 1) || (role === 'keeper' && (phase === 'run' || phase === 'kick' || phase === 'fly'));
        // סימוני כיוון עדינים במקום 9 מלבנים (רועי 05/10: "רואים קוביות של השער, צריך לראות שער רגיל לגמרי"): נקודה קטנה במרכז כל אזור, והאזור שנבחר = טבעת מטרה צהובה
        if (showGrid) for (let ci = -1; ci <= 1; ci++) for (let ri = 0; ri < 3; ri++) { const [zx, zy] = zoneWorld(ci, ri); const [px, py] = proj(zx, zy, GZ); const mine = pick && pick.col === ci && pick.row === ri;
          if (mine) { c.beginPath(); c.arc(px, py, 16, 0, Math.PI * 2); c.strokeStyle = '#FDE047'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fillStyle = '#FDE047'; c.fill(); }
          else { c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(); } }
        if (role === 'keeper' && !pick && (phase === 'run' || phase === 'kick')) { const [gx, gy] = proj(0, GH + 40, GZ); r.text('לאן לקפוץ? לחץ בשער', gx, gy, { size: 16, color: '#FDE047' }); }
        if (phase === 'aim' && ready < 1) r.text(role === 'keeper' ? 'הבועט מתכונן...' : 'השוער מתמקם...', r.W / 2, r.H - 60, { size: 14, color: '#bbf7d0' });
        if (gk.laugh > 0) { const [hx, hy] = proj(keep.x, 200, GZ + 44); r.text('חה חה חה!', hx, hy - 30, { size: 18, color: '#fff' }); }
        if (streak > 1 && phase === 'aim') r.text(`רצף: ${streak} 🔥`, r.W / 2, r.H - 30, { size: 18, color: '#FDE047' });
        if (role === 'keeper') r.text(`עצירות ${saves} · שערים ${goals}`, r.W / 2, r.H - 12, { size: 13, color: '#bbf7d0' });
        if (phase === 'after') r.text(msg, r.W / 2, r.H / 2 - 40, { size: 30, color: '#FDE047' }); },
    };
  };
}
export const UPGRADE3D = { penalty: penalty3d('kicker'), keeper: penalty3d('keeper') };

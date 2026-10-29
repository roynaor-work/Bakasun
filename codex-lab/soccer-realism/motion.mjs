import {createSoccerView} from '../../workout/island/minigames/soccer-view.mjs';
import {createSoccer} from '../../workout/island/minigames/soccer.mjs';
// Scripted, frame-exact action replays rendered by the production view (no simulation input).
const read = path => fetch(new URL('../../workout/island/' + path, import.meta.url)).then(r => r.json());
const config = (await read('data/config.json')).minigames.soccer;
config.opponent = {...config.opponentDefaults, colors: config.opponents.teams[0].colors};
const canvas = document.querySelector('canvas'), out = document.querySelector('#out');
const view = createSoccerView({canvas, config});
await view.ready;
const base = createSoccer({config, seed: 41, stage: 1}).getState();
const clone = o => JSON.parse(JSON.stringify(o));
const DT = 1 / 60;
function scene(name) {
  const s = clone(base); s.phase = 'playing'; s.charging = false; s.charge = 0; s.chargeKind = null;
  const p = s.players[0]; Object.assign(p, {x: -4, z: 0, fx: 1, fz: 0, vx: 0, vz: 0});
  s.ball = {...s.ball, owner: 0, x: p.x + 0.5, z: 0, y: config.physics.ballRadius, vx: 0, vz: 0, vy: 0, lastPlayer: 0, shot: null, flight: null};
  for (const q of s.players) if (q.id) { q.x = q.team ? 9 + q.id : -9 - q.id; q.z = (q.id % 3 - 1) * 6; q.vx = q.vz = 0; }
  return s;
}
const timeline = {
  run: t => ({speed: t < 1 ? 2.8 : t < 2 ? 5 : 7.6, sprint: t >= 2}),
  shot: t => ({speed: t < 1.2 ? 4.5 : Math.max(0, 4.5 - (t - 1.2) * 8), charge: t >= 0.8 && t < 1.2 ? (t - 0.8) / 0.4 : 0, kind: 'shot', kickAt: 1.2, ballSpeed: 19}),
  pass: t => ({speed: t < 1.2 ? 3.5 : Math.max(0, 3.5 - (t - 1.2) * 6), charge: t >= 0.95 && t < 1.2 ? (t - 0.95) / 0.25 : 0, kind: 'pass', kickAt: 1.2, ballSpeed: 10}),
  header: t => ({speed: 1, headerAt: 0.6}),
  slide: t => ({speed: t < 0.8 ? 5 : t < 1.15 ? 4 : 0, slideAt: 0.8}),
  dive: t => ({speed: 0, keeper: true, diveAt: 0.5}),
  throw: t => ({speed: 0, keeper: true, throwAt: 0.5}),
  celebrate: t => ({speed: t < 0.6 ? 4 : 0, goalAt: 0.6}),
  // Joystick scenes: the same movement response as the simulation (players.* in config).
  startstop: t => ({dir: t > 0.3 && t < 1.8 ? [1, 0] : [0, 0]}),
  reverse: t => ({dir: t > 0.2 && t < 1.3 ? [1, 0] : t < 2.6 ? [-1, 0] : [0, 0]}),
  cut: t => ({dir: t > 0.2 && t < 1.2 ? [1, 0] : t < 2.4 ? [0, -1] : [0, 0]}),
  sprintturn: t => ({dir: t > 0.2 && t < 1.6 ? [1, 0] : t < 2.8 ? [0, 1] : [0, 0], sprint: t > 0.2 && t < 2.8}),
  turnspot: t => ({dir: t > 0.3 && t < 0.42 ? [-1, 0] : t > 1.4 && t < 1.5 ? [0, 1] : [0, 0]}),
};
function drive(p, dir, sprint) {
  // mirror of the controlled-player movement in soccer.mjs (move)
  const c = config.players, [dx, dz] = dir, length = Math.hypot(dx, dz), speed = c.speed * (sprint ? config.sprint.multiplier : 1);
  let alignment = 1;
  if (length > 0) {
    const current = Math.atan2(p.fx, p.fz), wanted = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
    const turn = c.turnRate * (1 + c.lowSpeedTurnBoost * (1 - Math.min(1, Math.hypot(p.vx, p.vz) / speed)));
    const angle = current + delta * (1 - Math.exp(-turn * DT)); p.fx = Math.sin(angle); p.fz = Math.cos(angle);
    alignment = c.turnDrive + (1 - c.turnDrive) * Math.max(0, (p.fx * dx + p.fz * dz) / length);
  }
  const blend = 1 - Math.exp(-DT * (length > 0 ? c.acceleration : c.deceleration));
  p.vx += (dx * speed * alignment - p.vx) * blend; p.vz += (dz * speed * alignment - p.vz) * blend;
  p.x += p.vx * DT; p.z += p.vz * DT;
}
let state = null, clock = 0, active = 'run';
window.motionLab = {
  start(name) { active = name; state = scene(name); clock = 0; view.poseCamera(0); },
  /** Advance the scripted action by seconds (rendering every 1/60 s). */
  step(seconds) {
    const end = clock + seconds;
    while (clock < end - 1e-9) {
      const s = state, p = s.players[0], k = timeline[active](clock);
      if (k.keeper) { p.role = 'keeper'; }
      if (k.dir) drive(p, k.dir, k.sprint); else { p.vx = k.speed; p.x += p.vx * DT; } s.sprint = {...s.sprint, active: !!k.sprint}; p.sprinting = !!k.sprint;
      s.charging = (k.charge || 0) > 0; s.charge = (k.charge || 0) * (k.kind === 'pass' ? config.passing.chargeSeconds : config.physics.chargeSeconds); s.chargeKind = s.charging ? k.kind : null;
      const at = x => x !== undefined && clock >= x && clock < x + DT;
      if (at(k.kickAt)) { p.kickTime = config.ai.kickAnimationSeconds; s.ball.owner = null; s.ball.vx = k.ballSpeed; s.ball.shot = k.kind === 'shot' ? {shooter: 0, speed: k.ballSpeed} : null; }
      if (at(k.headerAt)) { p.headerTime = config.aerial.seconds; s.ball.owner = null; s.ball.y = 1.8; }
      if (at(k.slideAt)) p.slideTime = config.slide.seconds;
      if (at(k.diveAt)) { p.diveTime = config.goalkeeping.diveSeconds; p.diveZ = 1; s.ball.owner = null; }
      if (at(k.throwAt)) { p.throwTime = config.restarts.throwSeconds; p.hands = false; }
      if (at(k.goalAt)) { s.phase = 'goal'; s.ball.lastPlayer = 0; }
      // timers as the simulation runs them
      for (const key of ['kickTime', 'headerTime', 'diveTime', 'throwTime', 'stealTime', 'catchTime']) p[key] = Math.max(0, (p[key] || 0) - DT);
      if (p.slideTime > 0) { p.slideTime = Math.max(0, p.slideTime - DT); if (p.slideTime <= 0) p.recover = config.slide.recoverSeconds; } else p.recover = Math.max(0, (p.recover || 0) - DT);
      if (s.ball.owner === 0) { s.ball.x = p.x + p.fx * config.physics.dribbleOffset; s.ball.z = p.z + p.fz * config.physics.dribbleOffset; } else { s.ball.x += s.ball.vx * DT; s.ball.vx *= 0.99; }
      view.render(s, DT, 16.7); clock += DT;
    }
    const m = view.metrics(), pose = m.poses.find(x => x.id === 0);
    const info = {t: +clock.toFixed(3), mode: pose?.mode, clip: pose?.clip, weights: Object.fromEntries(Object.entries(pose?.weights || {}).filter(([, v]) => v > 0.04).map(([k, v]) => [k, +v.toFixed(2)])), footDistance: pose?.footDistance};
    out.textContent = `${active} · ${info.t}s · ${info.clip}`; return info;
  },
};
for (const b of document.querySelectorAll('[data-s]')) b.onclick = () => { motionLab.start(b.dataset.s); let n = 0; const loop = () => { motionLab.step(DT); if (++n < 150) requestAnimationFrame(loop); }; loop(); };
motionLab.start('run'); motionLab.step(0.1);
window.motionReady = true;

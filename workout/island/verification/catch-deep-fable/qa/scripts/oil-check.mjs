import {readFile} from 'node:fs/promises';
import {createChaseEngine6} from '/home/user/Bakasun/workout/island/minigames/catch-chase6.mjs';
const config = JSON.parse(await readFile('/home/user/Bakasun/workout/island/data/config.json', 'utf8'));
const balance = config.minigames.catchCriminal;
for (const stage of [2, 3, 7, 8, 9, 10]) for (const tAt of [0, 11, 25]) {
  const ch = createChaseEngine6({balance, stage, seed: 3, equipment: {}});
  const st = ch.state, obs = ch.obstacles; const oils = obs.filter(o => o.kind === 'oil');
  if (!oils.length) { console.log('stage', stage, 'no oil'); break; }
  const o = oils[0];
  // run the countdown and tAt seconds of straight driving, then teleport 24 m before the slick in its lane, wheel centred
  while (st.phase !== 'run') ch.step(1 / 60); ch.drainEvents();
  for (let i = 0; i < tAt * 60; i++) { ch.setSteer(0); ch.step(1 / 60); } ch.drainEvents();
  st.s = o.s - 24; st.d = o.d; st.steer = 0; st.v = 22; st.stun = 0; st.oil = 0; st.crim.s = st.s + 30; st.crim.d = -o.d; st.crim.v = 22;
  let hit = null, events = [];
  for (let i = 0; i < 60 * 3 && !hit; i++) { ch.setSteer(0); ch.setBoost(false); ch.step(1 / 60); for (const e of ch.drainEvents()) events.push(e.type); if (st.oil > 0) hit = {frame: i, s: +st.s.toFixed(1), d: +st.d.toFixed(2), oil: +st.oil.toFixed(2)}; }
  // which obstacle breaks the loop when the officer is at the slick?
  const sAt = o.s, cAt = o.s + 30, t = st.t; let breaker = null;
  for (const q of obs) { const os = q.kind === 'traffic' ? q.s + q.v * t : q.s; if (os < sAt - 12 && os < cAt - 12) continue; if (os > cAt + 20 && os > sAt + 20) { breaker = {id: q.id, kind: q.kind, s0: Math.round(q.s), osNow: Math.round(os), beforeOilInList: q.id < o.id}; break; } if (q === o) { breaker = {reached: true}; break; } }
  console.log('stage', stage, 'tAt', tAt, 'oil@', Math.round(o.s), 'd', o.d, 'id', o.id, 'hit', JSON.stringify(hit), 'dAtOil?', 'breaker', JSON.stringify(breaker), 'events', events.join(','));
}

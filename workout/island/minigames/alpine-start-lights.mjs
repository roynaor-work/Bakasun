/** Alpine Rush start lights, as in Formula 1: a gantry of five red lamps above the slope lights up one lamp at a time during the
 * countdown, then every lamp goes out to green and the riders go. A small 3-2-1 stays under the lamps for a child who reads numbers
 * more easily than lights. Every stage (the three ski stages and the league) uses it; `?alpineStartLights=0` brings back the big
 * number countdown. Timing comes from the engine (snapshot.countdownMs during the countdown, snapshot.timeMs after the start), so
 * a pause, a slow frame or a restart never desynchronises the lamps; the engine itself is unchanged. */
export const LAMPS = 5;
export const GREEN_MS = 900;
export const startLightsEnabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get('alpineStartLights') !== '0';

/** Pure state of the gantry: {state: 'off'|'count'|'green', lit: 0..5, count: '3'|'2'|'1'|''}. During a countdown of totalMs the
 * lamps light at even steps of totalMs / 6, starting half a step in (3 s: 0.25, 0.75, 1.25, 1.75, 2.25 s), so all five glow for the
 * last 0.75 s; at the start they all go out and the gantry is green for GREEN_MS of race time. */
export function lightsState({phase, countdownMs = 0, totalMs = 3000, timeMs = 0}) {
  if (phase === 'countdown') {
    const elapsed = Math.max(0, totalMs - countdownMs), step = totalMs / (LAMPS + 1);
    return {state: 'count', lit: Math.max(0, Math.min(LAMPS, Math.floor((elapsed - step / 2) / step) + 1)), count: String(Math.max(1, Math.ceil(countdownMs / 1000 - 1e-9)))};
  }
  if (phase === 'racing' && timeMs < GREEN_MS) return {state: 'green', lit: 0, count: ''};
  return {state: 'off', lit: 0, count: ''};
}

/** The gantry DOM. onLamp(n) fires when lamp n lights (a beep each), onGreen() at the start. update(snapshot) every frame. */
export function createStartLights(doc, {totalMs = 3000, onLamp = () => {}, onGreen = () => {}} = {}) {
  const el = (tag, cls, text = '') => { const n = doc.createElement(tag); n.className = cls; if (text) n.textContent = text; return n; };
  const node = el('div', 'alpine-lights'); node.dataset.state = 'off'; node.dataset.lit = '0'; node.hidden = true;
  const gantry = el('div', 'alpine-lights-gantry'), lamps = [];
  for (let i = 0; i < LAMPS; i++) { const lamp = el('span', 'alpine-lamp'); lamp.dataset.on = 'false'; lamps.push(lamp); gantry.append(lamp); }
  gantry.setAttribute('aria-hidden', 'true');
  const count = el('b', 'alpine-lights-count'), go = el('b', 'alpine-lights-go', 'יוצאים');
  // Screen readers hear the numbers and the start, not the lamps.
  const spoken = el('span', 'alpine-lights-spoken'); spoken.setAttribute('aria-live', 'assertive');
  node.append(gantry, count, go, spoken);
  let shown = {state: 'off', lit: 0, count: ''};
  return {
    node,
    update(snap) {
      const next = lightsState({phase: snap.phase, countdownMs: snap.countdownMs ?? (snap.countdown || 0) * 1000, totalMs, timeMs: snap.timeMs});
      // The green fades out over its last 250 ms of race time (game time, so a pause or a slow frame holds it).
      const fade = next.state === 'green' ? String(Math.max(0, Math.min(1, (GREEN_MS - snap.timeMs) / 250))) : '';
      if (node.style && node.style.opacity !== fade) node.style.opacity = fade;
      if (next.state === shown.state && next.lit === shown.lit && next.count === shown.count) return next;
      if (next.state === 'count' && next.lit > shown.lit) for (let n = shown.lit + 1; n <= next.lit; n++) onLamp(n);
      if (next.state === 'green' && shown.state !== 'green') onGreen();
      lamps.forEach((lamp, i) => { lamp.dataset.on = next.state === 'green' ? 'green' : String(i < next.lit); });
      node.dataset.state = next.state; node.dataset.lit = String(next.lit); node.hidden = next.state === 'off';
      count.textContent = next.count;
      if (next.count !== shown.count || (next.state === 'green' && shown.state !== 'green')) spoken.textContent = next.state === 'green' ? 'יוצאים' : next.count;
      shown = next; return next;
    },
    dispose() { node.remove(); }
  };
}

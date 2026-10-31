/** Car-style speedometer for Alpine Rush: a 240 degree dial with ticks every 10 km/h, labels every 20,
 * a red zone at the top of the range, an orange needle and a digital read-out. Presentation only;
 * update({kmh}) is cached so the DOM and the needle change only when the shown value does. */
const NS = 'http://www.w3.org/2000/svg', CX = 80, CY = 82, R = 62, START = 150, SWEEP = 240;
const rad = d => d * Math.PI / 180;
const point = (deg, r) => [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))];
const arc = (from, to, r) => { const [x1, y1] = point(from, r), [x2, y2] = point(to, r); return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };

export function create(host, {maxKmh = 120, unit = 'קמ״ש', label = 'מהירות'} = {}) {
  const doc = host.ownerDocument, max = Math.max(20, Math.ceil(maxKmh / 20) * 20);
  const el = (tag, attrs = {}) => { const n = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  // Same hooks as the HUD kit's speed meter (.ih-speed, [role=meter], .ih-speed-value) so tests and assistive tech see one meter.
  const root = doc.createElement('section'); root.className = 'alpine-dial ih-speed ih-panel';
  const svg = el('svg', {viewBox: '0 0 160 118', role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': '0'});
  svg.append(el('path', {d: arc(START, START + SWEEP, R), class: 'alpine-dial-track', fill: 'none'}));
  svg.append(el('path', {d: arc(START + SWEEP * .82, START + SWEEP, R), class: 'alpine-dial-red', fill: 'none'}));
  const fill = el('path', {d: arc(START, START + SWEEP, R), class: 'alpine-dial-fill', fill: 'none', pathLength: '100'});
  fill.style.strokeDasharray = '100'; fill.style.strokeDashoffset = '100'; svg.append(fill);
  for (let v = 0; v <= max; v += 10) {
    const deg = START + SWEEP * v / max, major = v % 20 === 0, [x1, y1] = point(deg, R + 6), [x2, y2] = point(deg, R - (major ? 8 : 4));
    svg.append(el('line', {x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2), class: major ? 'alpine-dial-tick major' : 'alpine-dial-tick'}));
    if (major) { const [tx, ty] = point(deg, R - 17), t = el('text', {x: tx.toFixed(1), y: (ty + 3).toFixed(1), class: 'alpine-dial-num', 'text-anchor': 'middle'}); t.textContent = String(v); svg.append(t); }
  }
  const needle = el('g', {class: 'alpine-dial-needle'});
  needle.append(el('path', {d: `M${CX - 8} ${CY - 2}L${CX + R - 8} ${CY}L${CX - 8} ${CY + 2}Z`, class: 'alpine-dial-hand'}), el('circle', {cx: CX, cy: CY, r: 5, class: 'alpine-dial-hub'}));
  needle.style.transformOrigin = `${CX}px ${CY}px`; needle.style.transform = `rotate(${START}deg)`; svg.append(needle);
  const value = el('text', {x: CX, y: CY + 28, class: 'alpine-dial-value ih-speed-value', 'text-anchor': 'middle'}); value.textContent = '0';
  const unitText = el('text', {x: CX, y: CY + 41, class: 'alpine-dial-unit', 'text-anchor': 'middle'}); unitText.textContent = unit;
  svg.append(value, unitText); root.append(svg); host.append(root);
  let previous = -1, dead = false;
  return {
    update(state = {}) {
      if (dead) return;
      const speed = Math.round(Math.max(0, Math.min(max, Number(state.kmh) || 0)));
      if (speed === previous) return; previous = speed;
      const fraction = speed / max;
      needle.style.transform = `rotate(${START + SWEEP * fraction}deg)`;
      fill.style.strokeDashoffset = String(100 - fraction * 100);
      value.textContent = String(speed); svg.setAttribute('aria-valuenow', String(speed));
    },
    destroy() { if (dead) return; dead = true; root.remove(); }
  };
}

// רועיקי: אנימציות SVG דו-ממדיות (royiki/<id>.svg, SMIL) במסך התרגיל. אותו ממשק כמו Figure ו-Stage3D:
// play(ex, speed) / still / stop / onRep(n) / dispose / pace. הקבצים מקומיים בלבד, נטענים לפי הצורך.
// SMIL אין לו קצב ניגון, לכן מקפיאים את האנימציה ומקדמים אותה ידנית (setCurrentTime) בקצב הרצוי.
import { ROYIKI, ROYIKI_SPEED } from './royiki-data.js?v=20261010-camera-1';
import { cycleMs } from './figure.js?v=20261010-camera-1';

export const ROYIKI_IDS = Object.keys(ROYIKI);
export const hasRoyiki = id => Object.prototype.hasOwnProperty.call(ROYIKI, id);
export const royikiUrl = id => new URL(`../royiki/${id}.svg`, import.meta.url).href;
export const STAGE_SPEED = 0.7; // אותו קצב כמו הדמות התלת-ממדית: speed=1 → מחזור המקור חלקי .7
const CACHE = 'workout-royiki-v1';

// מטמון בתוך הדף: טעינה מהרשת פעם אחת, אחר כך מהמטמון (בלי service worker לאימון)
async function fetchSvg(id) {
  const url = royikiUrl(id);
  let cache = null; try { cache = await caches.open(CACHE); } catch { /* בלי Cache API */ }
  if (cache) { const hit = await cache.match(url); if (hit) return hit.text(); }
  const res = await fetch(url);
  if (!res.ok) throw new Error('royiki ' + id + ' ' + res.status);
  if (cache) { try { await cache.put(url, res.clone()); } catch { /* */ } }
  return res.text();
}

let seq = 0;
// כמה דמויות באותו DOM: מזהים ייחודיים ל-defs, ל-href ולתוויות הנגישות
export function uniqueIds(svg, prefix) {
  return svg
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
    .replace(/aria-labelledby="([^"]+)"/g, (_, ids) => `aria-labelledby="${ids.split(' ').map(i => prefix + i).join(' ')}"`);
}

export class RoyikiStage {
  constructor(box, ex, { onReady, onFail } = {}) {
    this.box = box; this.exId = ex.id; this.meta = ROYIKI[ex.id];
    this.svg = null; this.raf = 0; this.dead = false; this.onRep = null; this.speed = 1; this.cyc = 0; this.start = 0; this.pending = null;
    fetchSvg(ex.id).then(text => {
      if (this.dead || !box.isConnected) return;
      box.innerHTML = uniqueIds(text, `r${++seq}-`).replace(/^<\?xml[^>]*\?>\s*/, '');
      const svg = this.svg = box.querySelector('svg');
      if (!svg) throw new Error('royiki: no svg');
      svg.removeAttribute('width'); svg.removeAttribute('height'); svg.classList.add('royiki-svg'); svg.setAttribute('aria-hidden', 'true');
      svg.pauseAnimations(); svg.setCurrentTime(0);
      box.dataset.royikiReady = 'true';
      if (onReady) onReady(this);
      if (this.pending) { const [k, e, s] = this.pending; this.pending = null; k === 'play' ? this.play(e, s) : this.still(e); }
    }).catch(err => { if (!this.dead && onFail) onFail(err); });
  }
  // זמן בתוך המחזור, במילישניות של ה-SVG
  ms() { return this.raf ? (performance.now() - this.start) * this.speed * STAGE_SPEED / ROYIKI_SPEED : 0; }
  play(ex, speed = 1) {
    if (!this.svg) { this.pending = ['play', ex, speed]; return; }
    this.stop(); this.speed = speed; this.cyc = 0; this.start = performance.now();
    const dur = this.meta.ms;
    const tick = () => {
      if (this.dead) return;
      const t = this.ms(), c = Math.floor(t / dur);
      if (c > this.cyc) { this.cyc = c; if (this.onRep) this.onRep(c); }
      this.svg.setCurrentTime((t % dur) / 1000);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  still() { if (!this.svg) { this.pending = ['still']; return; } this.stop(); this.svg.setCurrentTime(0); }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  // מחזור אחד של התרגיל נמשך duration מילישניות (כמו Figure/Stage3D: מחזור המקור = cycleMs(frames))
  pace(ex, duration) { this.play(ex, cycleMs(ex.frames) / duration / STAGE_SPEED); }
  dispose() { this.dead = true; this.stop(); this.pending = null; }
}

// שכבת תלת-ממד למשחק: קנבס WebGL מאחורי קנבס המשחק. המשחק מצייר על הקנבס הדו-ממדי רק ממשק (מד, קשת, טקסט) אחרי clearRect,
// והסצנה (מגרש, דמות, כדור) מתרנדרת ב-three.js. project() ממיר נקודה בעולם לפיקסלים כדי לצייר ממשק מעל עצמים.
import { THREE, hasWebGL, makeRenderer } from '../char3d.js?v=20261009-companion-1';
export function layer3d(r, { fov = 48 } = {}) {
  const cv = r.cv; const hasDoc = typeof document !== 'undefined'; const gl = hasDoc ? document.createElement('canvas') : null; if (gl) { gl.className = 'g3d'; gl.width = r.W; gl.height = r.H; }
  let renderer = null;
  try { if (gl && cv && cv.parentElement && hasWebGL()) { cv.parentElement.insertBefore(gl, cv); cv.classList.add('over3d'); renderer = makeRenderer(gl, r.W, r.H); } } catch (e) { console.warn('layer3d', e); renderer = null; }
  const sc = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(fov, r.W / r.H, 1, 6000); const v = new THREE.Vector3();
  return {
    sc, cam, THREE, ok: !!renderer,
    render() { if (renderer) renderer.render(sc, cam); },
    project(x, y, z) { v.set(x, y, z).project(cam); return [(v.x + 1) / 2 * r.W, (1 - v.y) / 2 * r.H, v.z]; },
    dispose() { if (renderer) { try { renderer.dispose(); } catch { /* */ } } gl && gl.remove(); cv && cv.classList.remove('over3d'); renderer = null; },
  };
}

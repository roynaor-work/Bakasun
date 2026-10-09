// במת התרגיל בסגנון "סרט מצויר" (סגנון 3 שרועי בחר, 01/10/2026): הדמות התלת-ממדית שלנו עם קו מתאר עבה,
// שתי דרגות צבע, רקע שטוח, רצפה שטוחה וצל עגול מתחת לרגליים. אותו ממשק כמו Figure: play(ex, speed), still(ex), stop(), onRep.
import { THREE, loadCharacter, KITS3D, viewFront, propMesh, outlineMaterial } from './char3d.js?v=20261009-companion-1';
import { poseAt, cycleMs } from './figure.js?v=20261009-companion-1';

const BG = '#F2A9E3', FLOOR = '#E58FD6', LINE = '#241B3A';
let gradTex = null;
export function flatGradient(dark = '#8a8a8a', light = '#ffffff') { if (gradTex) return gradTex; const c = document.createElement('canvas'); c.width = 2; c.height = 1; const g = c.getContext('2d'); g.fillStyle = dark; g.fillRect(0, 0, 1, 1); g.fillStyle = light; g.fillRect(1, 0, 1, 1); gradTex = new THREE.CanvasTexture(c); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.colorSpace = THREE.NoColorSpace; return gradTex; }
// הופך דמות שנטענה ב-loadCharacter למצוירת: קו עבה, שתי דרגות, צבע רווי
export function cartoonize(ch) { return ch; }
// ניסוי דו-ממד: דרגת צבע אחת (בלי הצללה), קו מתאר עבה יותר
export function flatten(ch) { if (!ch.mesh) return ch; const c = document.createElement('canvas'); c.width = 2; c.height = 1; const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 1, 1); g.fillStyle = '#ffffff'; g.fillRect(1, 0, 1, 1); const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; ch.mesh.material.gradientMap = t; ch.mesh.material.needsUpdate = true; if (ch.outline) { const ws = new THREE.Vector3(); ch.mesh.getWorldScale(ws); ch.outline.material = outlineMaterial(6 / (ws.x || 1), '#241B3A'); } return ch; } /* הסגנון המצויר הוא עכשיו ברירת המחדל ב-loadCharacter (char3d.js: CARTOON) */
export function blobShadow(scene, w = 130, h = 60) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const rg = g.createRadialGradient(64, 64, 8, 64, 64, 64); rg.addColorStop(0, 'rgba(60,10,70,.5)'); rg.addColorStop(.6, 'rgba(60,10,70,.25)'); rg.addColorStop(1, 'rgba(60,10,70,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .6; m.renderOrder = -2; scene.add(m); return m; }
export function flatLights(scene) { scene.add(new THREE.HemisphereLight('#ffffff', '#ffffff', 2.6)); const key = new THREE.DirectionalLight('#ffffff', .9); key.position.set(120, 300, 260); scene.add(key); }

const KEY = ['Head_end', 'LeftHand', 'RightHand', 'LeftToes', 'RightToes', 'Hips', 'LeftLeg', 'RightLeg', 'LeftHandIndex3_end', 'RightHandIndex3_end'];
export const STAGE_SPEED = 0.7; /* רועי 01/10: "מהירות הגדרנו יותר לאט שיהיה ברור"; ההסבר (×.55) איטי עוד יותר */
export class Stage3D {
  constructor(el, ex, { onReady = null, onFail = null, bg = BG, floor = FLOOR, flat = false, kit = KITS3D.maccabi } = {}) {
    this.flat = flat; /* ניסוי דו-ממד (רועי 01/10): מצלמה אורתוגרפית ישרה מהצד, צבע שטוח לגמרי, קו מתאר עבה יותר: נראה כמו אנימציה דו-ממדית */
    this.el = el; this.onRep = null; this.speed = 1; this.frames = null; this.front = false; this.raf = 0; this.start = 0; this.cyc = 0; this.ch = null; this.prop = null; this.dead = false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(bg);
    this.camera = flat ? new THREE.OrthographicCamera(-200, 200, 250, -250, 1, 4000) : new THREE.PerspectiveCamera(24, 4 / 5, 1, 3000); this.aspect = 4 / 5; this.camTarget = new THREE.Vector3(0, 100, 0); this.camDist = 430; this.camAngle = flat ? 0 : 0.3;
    flatLights(this.scene);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: floor })); fl.rotation.x = -Math.PI / 2; fl.position.y = -.4; this.scene.add(fl); /* רצפה שטוחה: הרגליים "עומדות" על משהו */
    this.shadow = blobShadow(this.scene);
    el.appendChild(this.renderer.domElement); this.renderer.domElement.className = 'stage3d-canvas';
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); this.resize();
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    loadCharacter(kit).then(ch => { if (this.dead) return; this.ch = cartoonize(ch); if (this.flat) flatten(ch); this.scene.add(ch.model); if (this.pending) { const [e, s, stillOnly] = this.pending; this.pending = null; stillOnly ? this.still(e) : this.play(e, s); } onReady && onReady(this); }).catch(e => { console.warn('stage3d', e); onFail && onFail(e); });
    if (ex) this.play(ex, 1);
  }
  resize() { const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight || w * 1.25); this.renderer.setPixelRatio(Math.min(3, devicePixelRatio || 1)); this.renderer.setSize(w, h, false); this.aspect = w / h; if (!this.flat) this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.frames) this.frameCamera(); this.render(); }
  frameCamera() {
    const ch = this.ch; if (!ch || !this.frames) return;
    const box = new THREE.Box3(), v = this._v;
    for (const [pose] of this.frames) { ch.rig.apply(pose, this.front); for (const n of KEY) { const b = ch.rig.b[n]; if (b) { b.getWorldPosition(v); box.expandByPoint(v); } } }
    box.expandByScalar(16); box.min.y = Math.min(box.min.y, 0);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    this.camTarget.set(c.x * .6, c.y, 0);
    const need = Math.max(size.y, size.x / this.aspect, size.z / this.aspect) * 1.14;
    if (this.flat) { const half = need / 2; this.camera.top = half; this.camera.bottom = -half; this.camera.left = -half * this.aspect; this.camera.right = half * this.aspect; this.camera.updateProjectionMatrix(); this.camDist = 900; }
    else this.camDist = need / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + 40;
    this.placeCam();
  }
  placeCam() { const a = this.camAngle, d = this.camDist; this.camera.position.set(this.camTarget.x + Math.sin(a) * d, this.camTarget.y + (this.flat ? 0 : d * .14), Math.cos(a) * d); this.camera.lookAt(this.camTarget); } /* מצלמה נמוכה (בגובה החזה): הרצפה נראית מתחת לרגליים ולא "מלמעלה" */
  setExercise(ex) {
    const frames = Array.isArray(ex) ? ex : ex.frames; this.frames = frames; this.front = Array.isArray(ex) ? false : viewFront(ex);
    if (!this.ch) return;
    this.ch.model.rotation.y = this.front ? 0 : Math.PI / 2;
    if (this.prop) { this.scene.remove(this.prop); this.prop = null; }
    if (!Array.isArray(ex) && ex.prop) { this.prop = propMesh(ex.prop); if (this.prop) this.scene.add(this.prop); }
    this.frameCamera();
  }
  updateShadow(pose) {
    const ch = this.ch; if (!ch) return; const feet = ['LeftFoot', 'RightFoot'].map(n => ch.rig.b[n]).filter(Boolean); if (!feet.length) return;
    let cx = 0, cz = 0, minY = Infinity; for (const b of feet) { b.getWorldPosition(this._v); cx += this._v.x / feet.length; cz += this._v.z / feet.length; minY = Math.min(minY, this._v.y); }
    const lying = Math.max(pose.lh[1], pose.rh[1]) >= 178 || pose.head[1] >= 150; /* תרגיל רצפה: הצל מתחת למרכז הגוף ורחב */
    if (lying && ch.rig.b.Hips) { ch.rig.b.Hips.getWorldPosition(this._w); cx = (cx + this._w.x) / 2; cz = (cz + this._w.z) / 2; }
    this.shadow.position.x = cx; this.shadow.position.z = cz;
    const air = Math.max(0, minY - 6), s = Math.max(.45, 1 - air / 160) * (lying ? 1.7 : 1), a = Math.max(.35, 1 - air / 220);
    this.shadow.scale.set(s, s, 1); this.shadow.material.opacity = a;
  }
  render() { if (this.ch && this.frames) { const pose = poseAt(this.frames, this.ms()); this.ch.rig.apply(pose, this.front); this.updateShadow(pose); } this.renderer.render(this.scene, this.camera); }
  ms() { return this.raf ? (performance.now() - this.start) * this.speed : 0; }
  play(ex, speed = 1) {
    if (!this.ch) { this.pending = [ex, speed, false]; return; }
    this.stop(); this.setExercise(ex); this.speed = speed * STAGE_SPEED; this.cyc = 0; this.start = performance.now();
    const total = cycleMs(this.frames);
    const tick = now => { if (this.dead) return; const ms = (now - this.start) * this.speed; const c = Math.floor(ms / total); if (c > this.cyc) { this.cyc = c; if (this.onRep) this.onRep(c); } this.render(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  still(ex) { if (!this.ch) { this.pending = [ex, 1, true]; return; } this.stop(); this.setExercise(ex); this.render(); }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  dispose() { this.dead = true; this.stop(); try { this.ro.disconnect(); } catch { /* */ } try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch { /* */ } if (this.renderer.domElement.parentNode) this.renderer.domElement.remove(); }
}

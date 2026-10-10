// ציורים משותפים למשחקים: פוזות של דמויות מהקטלוג, ודמויות מצוירות (מכונית, ציפור, חללית...) במקום אימוג'י.
import { byId } from '../exercises.js?v=20261010-camera-1';

export const POSE = {
  run: byId['hall-sprint'].frames.slice(0, 4),         // רצף ריצה
  jog: byId.jog.frames,
  stand: byId.squats.frames[0][0],
  squat: byId.squats.frames[1][0],
  jumpUp: byId['run-vertical'].frames[3][0],           // קפיצה עם יד למעלה
  leap: byId['run-jump'].frames[3][0],                 // באוויר קדימה
  armsUp: byId['jumping-jacks'].frames[2][0],          // ידיים ורגליים פתוחות (מלפנים)
  front: byId['jumping-jacks'].frames[0][0],           // עמידה מלפנים
  shuffle: byId['side-shuffle'].frames[0][0],          // עמידת שומר
  ready: byId['reaction-sprint'].frames[0][0],         // עמידת זינוק
  sit: byId['russian-twists'].frames[1][0],
  plank: byId.plank.frames[0][0],
  hop: byId['ankle-hops'].frames[1][0],
};
// שוער: עמידה עם ידיים פתוחות, וקפיצה לצד
const F = POSE.front;
export const GK = {
  ready: { ...F, le: [76, 96], lh: [60, 88], re: [124, 96], rh: [140, 88], lk: [90, 148], lf: [86, 182], rk: [110, 148], rf: [114, 182], hip: [100, 118], neck: [100, 72], head: [100, 56] },
  diveL: { head: [40, 96], neck: [54, 104], hip: [100, 120], le: [40, 84], lh: [22, 70], re: [50, 92], rh: [36, 80], lk: [124, 128], lf: [148, 122], rk: [126, 138], rf: [150, 146] },
  diveR: { head: [160, 96], neck: [146, 104], hip: [100, 120], re: [160, 84], rh: [178, 70], le: [150, 92], lh: [164, 80], rk: [76, 128], rf: [52, 122], lk: [74, 138], lf: [50, 146] },
  up: { ...F, le: [80, 40], lh: [76, 14], re: [120, 40], rh: [124, 14], hip: [100, 108], neck: [100, 62], head: [100, 46], lk: [92, 142], lf: [90, 172], rk: [108, 142], rf: [110, 172] },
  // קפיצה גבוהה (לפינה העליונה) וקפיצה נמוכה (לפינה התחתונה), שמאלה וימינה
  diveLH: { head: [36, 56], neck: [50, 68], hip: [100, 104], le: [34, 44], lh: [18, 26], re: [46, 54], rh: [30, 36], lk: [126, 116], lf: [150, 108], rk: [128, 128], rf: [154, 134] },
  diveRH: { head: [164, 56], neck: [150, 68], hip: [100, 104], re: [166, 44], rh: [182, 26], le: [154, 54], lh: [170, 36], rk: [74, 116], rf: [50, 108], lk: [72, 128], lf: [46, 134] },
  diveLL: { head: [34, 140], neck: [50, 146], hip: [100, 154], le: [34, 130], lh: [16, 122], re: [48, 140], rh: [30, 134], lk: [128, 156], lf: [156, 152], rk: [130, 166], rf: [160, 170] },
  diveRL: { head: [166, 140], neck: [150, 146], hip: [100, 154], re: [166, 130], rh: [184, 122], le: [152, 140], lh: [170, 134], rk: [72, 156], rf: [44, 152], lk: [70, 166], lf: [40, 170] },
  // כריעה נמוכה במרכז (כדור נמוך באמצע)
  crouch: { ...F, le: [78, 128], lh: [66, 150], re: [122, 128], rh: [134, 150], hip: [100, 140], neck: [100, 100], head: [100, 84], lk: [84, 160], lf: [80, 182], rk: [116, 160], rf: [120, 182] },
  // שוכב על הדשא אחרי הקפיצה (ראש שמאלה / ימינה)
  lyingL: { head: [22, 166], neck: [40, 170], hip: [100, 172], le: [46, 158], lh: [28, 148], re: [52, 176], rh: [34, 180], lk: [130, 170], lf: [160, 168], rk: [134, 178], rf: [166, 178] },
  lyingR: { head: [178, 166], neck: [160, 170], hip: [100, 172], re: [154, 158], rh: [172, 148], le: [148, 176], lh: [166, 180], rk: [70, 170], rf: [40, 168], lk: [66, 178], lf: [34, 178] },
};

export const S = {
  // פרה מעופפת (במקום ציפור): גוף לבן עם כתמים, ראש, אף ורוד, קרניים, כנפיים קטנות שמנפנפות
  cow(r, x, y, flap, t = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.rotate(flap ? -.25 : .15); const wing = Math.sin(t * 25) * .6; for (const sgn of [-1, 1]) { c.fillStyle = '#fef3c7'; c.beginPath(); c.ellipse(-4, -8 * sgn * 0 - 10, 16, 7, -.6 + wing * sgn, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 1.5; c.stroke(); }
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 4, 22, 15, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#1B1740'; c.beginPath(); c.ellipse(-8, 2, 7, 5, .4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(6, 9, 5, 4, -.5, 0, Math.PI * 2); c.fill();
    for (const lx of [-10, -2, 6, 14]) { c.fillStyle = '#1B1740'; c.fillRect(lx - 2, 14, 4, 9 + (Math.sin(t * 12 + lx) * 2)); } c.fillStyle = '#fbcfe8'; c.beginPath(); c.ellipse(2, 16, 9, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(20, -4, 12, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#fbcfe8'; c.beginPath(); c.ellipse(26, 1, 7, 5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1B1740'; c.beginPath(); c.arc(24, 1, 1.3, 0, 7); c.arc(28, 1, 1.3, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(17, -7, 3.5, 0, 7); c.fill(); c.fillStyle = '#1B1740'; c.beginPath(); c.arc(18, -7, 1.8, 0, 7); c.fill();
    c.fillStyle = '#d6d3d1'; c.beginPath(); c.moveTo(12, -12); c.lineTo(8, -20); c.lineTo(16, -14); c.fill(); c.beginPath(); c.moveTo(26, -12); c.lineTo(30, -20); c.lineTo(22, -14); c.fill(); c.fillStyle = '#fef3c7'; c.beginPath(); c.ellipse(9, -6, 4, 6, .5, 0, Math.PI * 2); c.fill(); c.restore(); },
  // שקית מיץ (סגנון קאפרי): כסופה עם תווית כתומה וקשית
  pouch(r, x, y, s = 1, t = 0) { const c = r.ctx; c.save(); c.translate(x, y + Math.sin(t * 4) * 2); c.scale(s, s); const g = c.createLinearGradient(-9, -12, 9, 12); g.addColorStop(0, '#f8fafc'); g.addColorStop(.5, '#94a3b8'); g.addColorStop(1, '#e2e8f0'); c.fillStyle = g; c.beginPath(); c.moveTo(-8, -12); c.lineTo(8, -12); c.lineTo(10, 12); c.lineTo(-10, 12); c.closePath(); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#f97316'; c.fillRect(-7, -6, 14, 13); c.fillStyle = '#fde047'; c.beginPath(); c.arc(0, 1, 3.5, 0, 7); c.fill(); c.strokeStyle = '#fde047'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(6, -13); c.lineTo(9, -22); c.stroke(); c.restore(); },
  // המבורגר: לחמנייה עם שומשום, חסה, עגבנייה, גבינה, קציצה
  burger(r, x, y, s = 1, t = 0) { const c = r.ctx; c.save(); c.translate(x, y + Math.sin(t * 4) * 1.5); c.scale(s, s); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 4; c.shadowOffsetY = 2; c.fillStyle = '#f6c05a'; c.beginPath(); c.roundRect ? c.roundRect(-13, 4, 26, 8, 3) : c.rect(-13, 4, 26, 8); c.fill(); c.shadowColor = 'transparent'; c.fillStyle = '#6b3a12'; c.beginPath(); c.roundRect ? c.roundRect(-13, -3, 26, 8, 3) : c.rect(-13, -3, 26, 8); c.fill(); c.fillStyle = '#fbbf24'; c.beginPath(); c.moveTo(-13, -3); c.lineTo(13, -3); c.lineTo(11, 3); c.lineTo(7, -1); c.lineTo(3, 3); c.lineTo(-1, -1); c.lineTo(-5, 3); c.lineTo(-9, -1); c.lineTo(-13, 3); c.fill(); c.fillStyle = '#ef4444'; c.fillRect(-12, -6, 24, 4); c.fillStyle = '#4ade80'; c.beginPath(); for (let i = -3; i <= 3; i++) c.arc(i * 4.3, -6, 3, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f6c05a'; c.beginPath(); c.ellipse(0, -9, 14, 7, 0, Math.PI, 0); c.fill(); c.fillStyle = '#fff7d6'; for (const [sx, sy] of [[-7, -12], [-2, -14], [4, -13], [8, -11]]) { c.beginPath(); c.ellipse(sx, sy, 1.6, 1, .4, 0, 7); c.fill(); } c.strokeStyle = '#1B1740'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, -9, 14, 7, 0, Math.PI, 0); c.stroke(); c.restore(); },
  // פרצוף ילד (ראש הנחש): שיער, עיניים שמסתכלות לכיוון, פה שנפתח כשהאוכל קרוב. אפשר להעביר תמונה במקום.
  face(r, x, y, rad, dir, open, img) { const c = r.ctx; c.save(); if (img && img.complete && img.naturalWidth) { c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.clip(); c.drawImage(img, x - rad, y - rad, rad * 2, rad * 2); c.restore(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke(); return; }
    c.fillStyle = '#F5C9A6'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#3B2A1A'; c.beginPath(); c.arc(x, y - rad * .15, rad, Math.PI * 1.05, Math.PI * 1.95); c.fill(); for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(x + i * rad * .38, y - rad * .8, rad * .28, 0, 7); c.fill(); }
    const ex = dir[0] * rad * .18, ey = dir[1] * rad * .18; for (const sgn of [-1, 1]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x + sgn * rad * .38, y - rad * .1, rad * .22, 0, 7); c.fill(); c.fillStyle = '#1B1740'; c.beginPath(); c.arc(x + sgn * rad * .38 + ex, y - rad * .1 + ey, rad * .11, 0, 7); c.fill(); }
    c.fillStyle = '#7C2D12'; c.beginPath(); if (open > .1) { c.ellipse(x + dir[0] * rad * .2, y + rad * .42 + dir[1] * rad * .2, rad * .3, rad * .3 * open, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ef4444'; c.beginPath(); c.ellipse(x + dir[0] * rad * .2, y + rad * .5 + dir[1] * rad * .2, rad * .16, rad * .12 * open, 0, 0, Math.PI * 2); c.fill(); } else { c.strokeStyle = '#7C2D12'; c.lineWidth = 2; c.arc(x, y + rad * .25, rad * .35, .3, Math.PI - .3); c.stroke(); } c.restore(); },
  // שטר כסף: צבע לפי הערך (20 ירוק, 50 סגול, 100 כתום, 200 כחול), פס מתכתי, מספר גדול
  banknote(r, x, y, val = 20, rot = 0, s = 1) { const c = r.ctx; const col = ['#8a5a2b', '#3f2a12']; /* כל השטרות באותו חום כמו הקקי (רועי: קשה יותר להבדיל) */ c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 3; c.fillStyle = col[0]; c.beginPath(); c.roundRect ? c.roundRect(-34, -18, 68, 36, 4) : c.rect(-34, -18, 68, 36); c.fill(); c.shadowColor = 'transparent'; c.strokeStyle = col[1]; c.lineWidth = 2; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.strokeRect(-29, -13, 58, 26); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(-18, 0, 8, 0, 7); c.fill(); c.fillStyle = col[1]; c.fillRect(20, -18, 4, 36); c.font = '900 16px Heebo, Rubik, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col[1]; c.fillText(String(val), 4, 1); c.font = '700 8px Arial'; c.fillText('₪', -27, -9); c.fillText('₪', 14, 10); c.restore(); },
  // קקי מחייך (במקום פצצה)
  poop(r, x, y, t = 0) { const c = r.ctx; c.save(); c.translate(x, y); const wob = Math.sin(t * 6) * .05; c.rotate(wob); c.fillStyle = '#7c4a1e'; for (const [yy, w] of [[8, 20], [-2, 15], [-11, 10]]) { c.beginPath(); c.ellipse(0, yy, w, 8, 0, 0, Math.PI * 2); c.fill(); } c.beginPath(); c.moveTo(-3, -17); c.quadraticCurveTo(4, -26, 8, -16); c.lineTo(0, -12); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, 8, 20, 8, 0, 0, Math.PI); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(-6, -2, 4, 0, 7); c.arc(6, -2, 4, 0, 7); c.fill(); c.fillStyle = '#1B1740'; c.beginPath(); c.arc(-5, -2, 2, 0, 7); c.arc(7, -2, 2, 0, 7); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 3, 6, .2, Math.PI - .2); c.stroke(); c.fillStyle = 'rgba(163,230,53,.7)'; for (let i = 0; i < 3; i++) { const k = ((t * .8 + i / 3) % 1); c.globalAlpha = 1 - k; c.beginPath(); c.arc(-12 + i * 12, -22 - k * 18, 3 + k * 3, 0, 7); c.fill(); } c.restore(); },
  // אסלה (מכשול תחתון בפרה המעופפת)
  toilet(r, x, y, w, h) { const c = r.ctx; c.save(); c.fillStyle = '#e2e8f0'; c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.fillRect(x + w * .55, y, w * .4, h); c.strokeRect(x + w * .55, y, w * .4, h); c.beginPath(); c.ellipse(x + w * .45, y + 22, w * .45, 14, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#60a5fa'; c.beginPath(); c.ellipse(x + w * .45, y + 22, w * .3, 8, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e2e8f0'; c.fillRect(x + w * .2, y + 30, w * .5, h - 30); c.strokeRect(x + w * .2, y + 30, w * .5, h - 30); c.fillStyle = '#cbd5e1'; c.fillRect(x + w * .6, y + 6, w * .3, 6); c.restore(); },
  // תחתונים ענקיים תלויים על חבל (מכשול עליון)
  underpants(r, x, y, w, h) { const c = r.ctx; c.save(); const ph = Math.min(76, h), top = y + h - ph; c.strokeStyle = '#78350f'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, top); c.stroke(); c.lineWidth = 2; c.beginPath(); c.moveTo(x - 10, top); c.lineTo(x + w + 10, top); c.stroke(); for (const px of [x + 6, x + w - 6]) { c.fillStyle = '#fbbf24'; c.fillRect(px - 3, top - 6, 6, 12); }
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#fca5a5'); g.addColorStop(1, '#f87171'); c.fillStyle = g; c.strokeStyle = '#1B1740'; c.beginPath(); c.moveTo(x, top); c.lineTo(x + w, top); c.lineTo(x + w + 4, top + ph * .6); c.lineTo(x + w * .62, top + ph * .62); c.quadraticCurveTo(x + w / 2, top + ph * .3, x + w * .38, top + ph * .62); c.lineTo(x - 4, top + ph * .6); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + 8 + i * (w - 16) / 4, top + 18 + (i % 2) * 14, 3, 0, 7); c.fill(); } c.fillStyle = '#fde047'; c.fillRect(x, top, w, 7); c.restore(); },
  car(r, x, y, w, h, color, dir = 1) { const c = r.ctx; r.rect(x - w / 2, y - h / 2, w, h, color, 8); r.rect(x - w / 2 + 6, y - h / 2 + (dir > 0 ? 8 : h * 0.45), w - 12, h * 0.35, '#0F172ACC', 5); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => r.rect(x + a * (w / 2 - 2) - 4, y + b * (h / 2 - 12) - 6, 8, 12, '#111', 3)); c.fillStyle = '#FDE68A'; c.fillRect(x - w / 2 + 3, y + (dir > 0 ? -h / 2 : h / 2 - 5), 8, 5); c.fillRect(x + w / 2 - 11, y + (dir > 0 ? -h / 2 : h / 2 - 5), 8, 5); },
  bird(r, x, y, flap, color = '#FACC15') { r.circle(x, y, 14, color); r.circle(x + 6, y - 4, 4, '#fff'); r.circle(x + 7, y - 4, 2, '#111'); const c = r.ctx; c.fillStyle = '#F97316'; c.beginPath(); c.moveTo(x + 12, y + 2); c.lineTo(x + 24, y + 5); c.lineTo(x + 12, y + 8); c.fill(); c.fillStyle = '#EAB308'; c.beginPath(); c.ellipse(x - 4, y + 4 + flap * 4, 9, 5, -0.4 + flap * 0.6, 0, Math.PI * 2); c.fill(); },
  alien(r, x, y, t, color = '#A3E635') { const c = r.ctx; c.fillStyle = color; c.beginPath(); c.ellipse(x, y, 14, 9, 0, 0, Math.PI * 2); c.fill(); r.circle(x, y - 8, 8, color); r.circle(x - 3, y - 9, 2.5, '#111'); r.circle(x + 3, y - 9, 2.5, '#111'); const k = Math.sin(t * 8) > 0 ? 3 : -3; [-10, -4, 4, 10].forEach(dx => r.line(x + dx, y + 6, x + dx + (dx < 0 ? -k : k), y + 14, color, 3)); },
  ship(r, x, y, color = '#38BDF8') { const c = r.ctx; c.fillStyle = color; c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x + 16, y + 14); c.lineTo(x, y + 6); c.lineTo(x - 16, y + 14); c.closePath(); c.fill(); r.circle(x, y - 2, 5, '#E0F2FE'); c.fillStyle = '#F97316'; c.beginPath(); c.moveTo(x - 6, y + 12); c.lineTo(x, y + 22 + Math.random() * 6); c.lineTo(x + 6, y + 12); c.fill(); },
  mole(r, x, y) { r.circle(x, y, 22, '#8B5E3C'); r.circle(x, y + 8, 12, '#C4A484'); r.circle(x - 8, y - 6, 3.5, '#111'); r.circle(x + 8, y - 6, 3.5, '#111'); r.circle(x, y + 3, 4, '#F472B6'); r.line(x - 14, y + 4, x - 24, y + 2, '#111', 1.5); r.line(x + 14, y + 4, x + 24, y + 2, '#111', 1.5); },
  bomb(r, x, y, t) { r.circle(x, y + 4, 18, '#1F2937'); r.rect(x - 4, y - 18, 8, 8, '#6B7280'); r.line(x, y - 18, x + 8, y - 28, '#9CA3AF', 2); r.circle(x + 8, y - 28, 3 + Math.sin(t * 20) * 1.5, '#F97316'); r.circle(x - 6, y - 2, 4, '#ffffff33'); },
  pin(r, x, y) { const c = r.ctx; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x - 6, y + 16); c.quadraticCurveTo(x - 10, y, x - 4, y - 8); c.lineTo(x - 3, y - 16); c.lineTo(x + 3, y - 16); c.lineTo(x + 4, y - 8); c.quadraticCurveTo(x + 10, y, x + 6, y + 16); c.closePath(); c.fill(); c.strokeStyle = '#CBD5E1'; c.lineWidth = 1; c.stroke(); r.rect(x - 5, y - 6, 10, 3, '#EF4444'); },
  basket(r, x, y, w = 70) { const c = r.ctx; c.fillStyle = '#B45309'; c.beginPath(); c.moveTo(x - w / 2, y - 18); c.lineTo(x + w / 2, y - 18); c.lineTo(x + w / 2 - 10, y + 18); c.lineTo(x - w / 2 + 10, y + 18); c.closePath(); c.fill(); c.strokeStyle = '#78350F'; c.lineWidth = 2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 12, y - 18); c.lineTo(x + i * 10, y + 18); c.stroke(); } c.beginPath(); c.arc(x, y - 18, w / 2 - 6, Math.PI, 0); c.stroke(); },
  heli(r, x, y, t) { r.rect(x - 22, y - 10, 44, 22, '#EF4444', 10); r.rect(x + 14, y - 4, 26, 8, '#EF4444', 3); r.rect(x + 34, y - 14, 4, 18, '#B91C1C'); r.circle(x - 8, y - 2, 7, '#BFDBFE'); const k = Math.cos(t * 30) * 26; r.line(x - k, y - 16, x + k, y - 16, '#374151', 3); r.rect(x - 2, y - 18, 4, 8, '#374151'); r.line(x - 12, y + 16, x + 12, y + 16, '#374151', 3); },
  flag(r, x, y) { r.line(x, y, x, y - 40, '#fff', 3); const c = r.ctx; c.fillStyle = '#EF4444'; c.beginPath(); c.moveTo(x, y - 40); c.lineTo(x + 20, y - 33); c.lineTo(x, y - 26); c.fill(); },
  house(r, x, y, burning, t) { r.rect(x - 22, y - 18, 44, 30, '#FDE68A', 3); const c = r.ctx; c.fillStyle = '#B91C1C'; c.beginPath(); c.moveTo(x - 26, y - 18); c.lineTo(x, y - 40); c.lineTo(x + 26, y - 18); c.fill(); r.rect(x - 6, y - 4, 12, 16, '#78350F', 2); if (burning) { r.circle(x + (Math.sin(t * 10) * 4), y - 30, 10, '#F97316'); r.circle(x, y - 34, 6, '#FDE047'); } },
  tree(r, x, y) { r.rect(x - 4, y - 10, 8, 20, '#78350F'); const c = r.ctx; c.fillStyle = '#15803D'; [0, 12, 24].forEach(k => { c.beginPath(); c.moveTo(x - 20 + k * 0.3, y - 6 - k); c.lineTo(x, y - 30 - k); c.lineTo(x + 20 - k * 0.3, y - 6 - k); c.fill(); }); },
  cloud(r, x, y, s = 1) { [[0, 0, 16], [-14, 4, 11], [14, 4, 12], [-4, -8, 11]].forEach(([dx, dy, rad]) => r.circle(x + dx * s, y + dy * s, rad * s, '#ffffffDD')); },
  hoop(r, x, y) { r.rect(x + 24, y - 60, 6, 130, '#374151'); r.rect(x + 14, y - 50, 14, 46, '#F8FAFC', 2); r.ctx.strokeStyle = '#374151'; r.ctx.lineWidth = 1.5; r.ctx.strokeRect(x + 14, y - 50, 14, 46); r.line(x - 26, y, x + 26, y, '#EF4444', 5); for (let i = -20; i <= 20; i += 10) r.line(x + i, y, x + i * 0.6, y + 28, '#ffffffAA', 1.5); r.line(x - 14, y + 14, x + 14, y + 14, '#ffffffAA', 1.5); },
  net(r, x, y, w, h) { const c = r.ctx; c.strokeStyle = '#ffffff99'; c.lineWidth = 1; for (let i = 0; i <= w; i += 14) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i, y + h); c.stroke(); } for (let j = 0; j <= h; j += 14) { c.beginPath(); c.moveTo(x, y + j); c.lineTo(x + w, y + j); c.stroke(); } },
  ball(r, x, y, rad, color = '#F97316', line = '#7C2D12') { r.circle(x, y, rad, color); const c = r.ctx; c.strokeStyle = line; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x - rad, y); c.lineTo(x + rad, y); c.moveTo(x, y - rad); c.lineTo(x, y + rad); c.stroke(); c.beginPath(); c.arc(x - rad * 0.9, y, rad * 0.8, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(x + rad * 0.9, y, rad * 0.8, Math.PI - 0.9, Math.PI + 0.9); c.stroke(); },
  soccer(r, x, y, rad, rot = 0) { soccerBall(r.ctx, x, y, rad, rot); },
  soccerOld(r, x, y, rad) { r.circle(x, y, rad, '#fff'); const c = r.ctx; c.fillStyle = '#111'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; c.beginPath(); c.arc(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.22, 0, Math.PI * 2); c.fill(); } c.beginPath(); c.arc(x, y, rad * 0.2, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke(); },
  cannon(r, x, y, ang) { r.rect(x - 24, y - 8, 48, 26, '#374151', 8); r.circle(x - 12, y + 18, 9, '#111'); r.circle(x + 12, y + 18, 9, '#111'); const c = r.ctx; c.save(); c.translate(x, y); c.rotate(ang); r.rect(0, -8, 44, 16, '#1F2937', 6); c.restore(); },
  // חללית קרב (משותפת לפולשים ולאסטרואידים): גוף עם גרדיאנט, כנפיים, קוקפיט זכוכית, שני מנועים עם להבה שמרצדת
  fighter(r, x, y, t = 0, color = '#38BDF8', scale = 1, bank = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.scale(scale * (1 - Math.abs(bank) * .25), scale); // bank: -1..1 הטיה בתנועה
    // להבות מנוע עם זוהר
    const flame = 12 + Math.sin(t * 40) * 4 + Math.random() * 3; for (const fx of [-10, 10]) { const g = c.createLinearGradient(0, 18, 0, 18 + flame * 1.8); g.addColorStop(0, '#fff7ed'); g.addColorStop(.25, '#fbbf24'); g.addColorStop(.6, '#f97316'); g.addColorStop(1, 'rgba(239,68,68,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(fx - 5, 18); c.quadraticCurveTo(fx, 18 + flame * 2.2, fx + 5, 18); c.fill(); const glow = c.createRadialGradient(fx, 20, 1, fx, 20, 12); glow.addColorStop(0, 'rgba(251,191,36,.6)'); glow.addColorStop(1, 'rgba(251,191,36,0)'); c.fillStyle = glow; c.beginPath(); c.arc(fx, 20, 12, 0, 7); c.fill(); }
    // כנפיים גדולות עם פס צבע וקצה מעוגל
    const star = (cx, cy, rad) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#1d4ed8'; c.lineWidth = 1.1; for (const up of [1, -1]) { c.beginPath(); for (let q = 0; q < 3; q++) { const a = -Math.PI / 2 * up + q * Math.PI * 2 / 3; const px = cx + Math.cos(a) * rad * .72, py = cy + Math.sin(a) * rad * .72; q ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.stroke(); } };
    const GRAY = '#9ca3af';
    const wing = (dir) => { c.beginPath(); c.moveTo(dir * 5, -2); c.lineTo(dir * 30, 12); c.quadraticCurveTo(dir * 33, 16, dir * 29, 20); c.lineTo(dir * 7, 14); c.closePath(); const wg = c.createLinearGradient(0, 0, dir * 30, 0); wg.addColorStop(0, shade(GRAY, 10)); wg.addColorStop(1, shade(GRAY, -35)); c.fillStyle = wg; c.fill(); c.strokeStyle = '#0f172a'; c.lineWidth = 1.5; c.stroke(); c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.moveTo(dir * 10, 5); c.lineTo(dir * 27, 14.5); c.stroke(); star(dir * 19, 13.5, 4.6); };
    wing(-1); wing(1);
    // סנפירי זנב
    for (const d of [-1, 1]) { c.fillStyle = '#1d4ed8'; c.beginPath(); c.moveTo(d * 4, 8); c.lineTo(d * 14, 20); c.lineTo(d * 5, 18); c.closePath(); c.fill(); c.strokeStyle = '#0f172a'; c.lineWidth = 1.2; c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(d * 7, 13); c.lineTo(d * 11, 18); c.stroke(); }
    // גוף: גרדיאנט מתכתי, קו אמצע
    const bg = c.createLinearGradient(-9, 0, 9, 0); bg.addColorStop(0, shade(GRAY, -30)); bg.addColorStop(.45, '#f8fafc'); bg.addColorStop(.6, shade(GRAY, 20)); bg.addColorStop(1, shade(GRAY, -35)); c.fillStyle = bg; c.beginPath(); c.moveTo(0, -28); c.quadraticCurveTo(11, -8, 9, 18); c.lineTo(-9, 18); c.quadraticCurveTo(-11, -8, 0, -28); c.closePath(); c.fill(); c.strokeStyle = '#0f172a'; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = '#1e293b'; c.fillRect(-13, 15, 7, 6); c.fillRect(6, 15, 7, 6); c.fillStyle = '#1d4ed8'; c.beginPath(); c.moveTo(0, -28); c.lineTo(3, -18); c.lineTo(-3, -18); c.fill(); c.fillStyle = '#1d4ed8'; c.fillRect(-9, 2, 18, 3);
    // חופה: זכוכית עם השתקפות
    const gg = c.createLinearGradient(0, -16, 0, 0); gg.addColorStop(0, '#e0f2fe'); gg.addColorStop(.5, '#38bdf8'); gg.addColorStop(1, '#0369a1'); c.fillStyle = gg; c.beginPath(); c.ellipse(0, -8, 4.5, 8, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#0f172a'; c.lineWidth = 1; c.stroke(); c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(-1.6, -12, 1.4, 3, 0, 0, Math.PI * 2); c.fill();
    c.restore(); },
  // עב"ם בוס: צלחת עם כיפת זכוכית, שורת אורות שמסתובבים, זוהר מלמטה
  // רקטה שנופלת (חרטום למטה, להבה למעלה). color = צבע הגוף. hurt מצבע אדום
  rocket(r, x, y, t = 0, scale = 1, color = '#e5e7eb', hurt = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    const fl = 10 + Math.sin(t * 30) * 3 + Math.random() * 2; const g = c.createLinearGradient(0, -22, 0, -22 - fl * 2); g.addColorStop(0, '#fff7ed'); g.addColorStop(.4, '#fbbf24'); g.addColorStop(1, 'rgba(239,68,68,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(-5, -22); c.quadraticCurveTo(0, -22 - fl * 2.2, 5, -22); c.fill();
    c.fillStyle = '#7f1d1d'; for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 5, -22); c.lineTo(d * 13, -30); c.lineTo(d * 5, -10); c.closePath(); c.fill(); }
    const bg = c.createLinearGradient(-7, 0, 7, 0); bg.addColorStop(0, '#6b7280'); bg.addColorStop(.4, hurt > 0 ? '#fca5a5' : color); bg.addColorStop(1, '#374151'); c.fillStyle = bg; c.beginPath(); c.roundRect(-7, -24, 14, 34, 3); c.fill(); c.strokeStyle = '#111827'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#dc2626'; c.beginPath(); c.moveTo(-7, 10); c.lineTo(0, 24); c.lineTo(7, 10); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#dc2626'; c.fillRect(-7, -12, 14, 4); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-5, -22, 3, 30); c.restore(); },
  // רחפן: גוף עם 4 זרועות ופרופלורים שמסתובבים, עין אדומה
  drone(r, x, y, t = 0, scale = 1, hurt = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    c.strokeStyle = '#334155'; c.lineWidth = 3; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.moveTo(0, 0); c.lineTo(dx * 16, dy * 10); c.stroke(); c.fillStyle = 'rgba(203,213,225,.55)'; c.beginPath(); c.ellipse(dx * 16, dy * 10, 9, 2.5 + Math.abs(Math.sin(t * 25 + dx)) * 1.5, 0, 0, Math.PI * 2); c.fill(); r.circle(dx * 16, dy * 10, 2, '#0f172a'); }
    c.fillStyle = hurt > 0 ? '#fca5a5' : '#1e293b'; c.beginPath(); c.roundRect(-11, -7, 22, 14, 5); c.fill(); c.strokeStyle = '#0f172a'; c.lineWidth = 1.2; c.stroke(); r.circle(0, 0, 4, '#ef4444'); r.circle(-1, -1, 1.5, '#fff'); c.fillStyle = '#475569'; c.fillRect(-4, 7, 8, 5); c.restore(); },
  // עיר בלילה: קו רקיע עם חלונות מוארים, למטה. hitX: איפה נפלה רקטה (עשן)
  city(r, y, W, t = 0, damage = []) { const c = r.ctx; if (!Array.isArray(damage)) damage = []; const bs = [[0, 34, 26], [30, 52, 30], [64, 40, 22], [90, 66, 28], [122, 46, 24], [150, 74, 32], [186, 38, 22], [212, 58, 28], [244, 44, 26], [274, 70, 30], [308, 36, 22], [334, 54, 26]];
    for (const [bx, bh, bw] of bs) { c.fillStyle = '#111827'; c.fillRect(bx, y - bh, bw, bh); c.fillStyle = '#0b1120'; c.fillRect(bx + 2, y - bh, bw - 4, 3); for (let wy = y - bh + 6; wy < y - 4; wy += 8) for (let wx = bx + 4; wx < bx + bw - 4; wx += 7) { const on = ((wx * 7 + wy * 13) % 5) > 1; if (on) { c.fillStyle = ((wx + wy) % 3) ? '#fde68a' : '#fef3c7'; c.fillRect(wx, wy, 3, 4); } } }
    for (const d of damage) { c.fillStyle = `rgba(120,113,108,${.35 + Math.sin(t * 3 + d.x) * .1})`; for (let i = 0; i < 3; i++) c.beginPath(), c.arc(d.x + Math.sin(t * 2 + i) * 6, y - 30 - i * 14 - (t * 8 % 20), 10 + i * 3, 0, Math.PI * 2), c.fill(); r.circle(d.x, y - 6, 8, '#f97316'); r.circle(d.x, y - 8, 4, '#fde047'); } },
  // קנגורו (מבט מהצד, פונה ימינה; dir=-1 משקף). pose: 'run' | 'hop' | 'fall' | 'duck' | 'stand'. t לאנימציה. הרגליים והזנב לפי הפוזה
  kangaroo(r, x, y, pose = 'stand', t = 0, scale = 1, dir = 1) { const c = r.ctx; c.save(); c.translate(x, y); c.scale(scale * dir, scale);
    const FUR = '#c2743a', DARK = '#8a4b1f', LIGHT = '#f1c9a0', ph = Math.sin(t * 14);
    const legK = pose === 'run' ? ph : pose === 'hop' ? -1 : pose === 'fall' ? .6 : pose === 'duck' ? .2 : 0; /* מתיחת רגליים */
    const bodyY = pose === 'duck' ? -14 : -30, lean = pose === 'hop' ? -.25 : pose === 'fall' ? .15 : pose === 'run' ? -.1 : 0;
    c.rotate(lean);
    /* זנב: עקומה מאחור */ c.strokeStyle = FUR; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-8, bodyY + 12); c.quadraticCurveTo(-30, bodyY + 18 + (pose === 'hop' ? -22 : 6), -46, bodyY + (pose === 'hop' ? -4 : 14) - legK * 4); c.stroke(); c.strokeStyle = DARK; c.lineWidth = 3; c.beginPath(); c.moveTo(-44, bodyY + (pose === 'hop' ? -4 : 14) - legK * 4); c.lineTo(-47, bodyY + (pose === 'hop' ? -4 : 14) - legK * 4 + 1); c.stroke();
    /* רגל אחורית גדולה */ c.fillStyle = FUR; c.beginPath(); c.ellipse(-4, bodyY + 18, 13, 10, .3, 0, Math.PI * 2); c.fill(); c.strokeStyle = FUR; c.lineWidth = 7; c.beginPath(); c.moveTo(-2, bodyY + 24); const fx = pose === 'hop' ? -14 : 10 + legK * 8, fy = pose === 'hop' ? bodyY + 34 : -2; c.quadraticCurveTo(-8 + legK * 4, bodyY + 34, fx, fy); c.stroke(); c.strokeStyle = DARK; c.lineWidth = 6; c.beginPath(); c.moveTo(fx - 4, fy); c.lineTo(fx + 16, fy); c.stroke(); /* כף רגל ארוכה */
    if (pose === 'run') { c.strokeStyle = FUR; c.lineWidth = 6; c.beginPath(); c.moveTo(0, bodyY + 24); c.quadraticCurveTo(-4 - legK * 4, bodyY + 34, 8 - legK * 8, -2); c.stroke(); }
    /* גוף */ const bg = c.createLinearGradient(0, bodyY - 16, 0, bodyY + 20); bg.addColorStop(0, FUR); bg.addColorStop(1, DARK); c.fillStyle = bg; c.beginPath(); c.ellipse(0, bodyY, 15, 22, .15, 0, Math.PI * 2); c.fill(); c.fillStyle = LIGHT; c.beginPath(); c.ellipse(4, bodyY + 4, 8, 14, .1, 0, Math.PI * 2); c.fill(); /* בטן */ c.strokeStyle = DARK; c.lineWidth = 1.5; c.beginPath(); c.arc(4, bodyY + 8, 7, .2, Math.PI - .2); c.stroke(); /* כיס */
    /* ידיים קטנות */ c.strokeStyle = FUR; c.lineWidth = 5; c.beginPath(); c.moveTo(8, bodyY - 6); c.lineTo(16 + (pose === 'hop' ? 4 : ph * 2), bodyY + 2); c.stroke(); c.beginPath(); c.moveTo(6, bodyY - 4); c.lineTo(14 - (pose === 'hop' ? 2 : ph * 2), bodyY + 6); c.stroke();
    /* צוואר וראש */ c.fillStyle = FUR; c.beginPath(); c.ellipse(9, bodyY - 20, 7, 9, .4, 0, Math.PI * 2); c.fill(); const hx = 16, hy = bodyY - 32; c.beginPath(); c.ellipse(hx, hy, 12, 9, .1, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(hx + 11, hy + 3, 7, 5, .2, 0, Math.PI * 2); c.fill(); /* חוטם */ c.fillStyle = '#3f1d0b'; c.beginPath(); c.arc(hx + 17, hy + 3, 2.2, 0, Math.PI * 2); c.fill();
    /* אוזניים */ for (const ex of [-3, 3]) { c.fillStyle = FUR; c.beginPath(); c.ellipse(hx + ex - 4, hy - 13, 3.5, 9, ex * .08 - .1, 0, Math.PI * 2); c.fill(); c.fillStyle = LIGHT; c.beginPath(); c.ellipse(hx + ex - 4, hy - 12, 1.6, 5, ex * .08 - .1, 0, Math.PI * 2); c.fill(); }
    /* עין */ c.fillStyle = '#fff'; c.beginPath(); c.ellipse(hx + 5, hy - 2, 3.4, 3.8, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 6, hy - 2, 2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(hx + 6.8, hy - 3, .8, 0, Math.PI * 2); c.fill();
    if (pose !== 'duck') { c.strokeStyle = '#3f1d0b'; c.lineWidth = 1.2; c.beginPath(); c.arc(hx + 12, hy + 6, 3, .3, Math.PI * .7); c.stroke(); } /* חיוך */
    c.restore(); },
  ufo(r, x, y, t = 0, scale = 1, hurt = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    const glow = c.createRadialGradient(0, 14, 2, 0, 14, 40); glow.addColorStop(0, `rgba(163,230,53,${.35 + Math.sin(t * 6) * .1})`); glow.addColorStop(1, 'rgba(163,230,53,0)'); c.fillStyle = glow; c.beginPath(); c.ellipse(0, 18, 40, 16, 0, 0, Math.PI * 2); c.fill();
    const dome = c.createRadialGradient(-6, -14, 2, 0, -8, 22); dome.addColorStop(0, '#e0f2fe'); dome.addColorStop(1, hurt > 0 ? '#fca5a5' : '#7dd3fc'); c.fillStyle = dome; c.beginPath(); c.arc(0, -4, 20, Math.PI, 0); c.fill(); c.strokeStyle = '#1B1740'; c.lineWidth = 2; c.stroke();
    // הנוסע: חייזר ירוק קטן בתוך הכיפה
    c.fillStyle = '#a3e635'; c.beginPath(); c.ellipse(0, -10, 8, 9, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1B1740'; c.beginPath(); c.ellipse(-3, -11, 2.2, 3, 0, 0, 7); c.ellipse(3, -11, 2.2, 3, 0, 0, 7); c.fill();
    const body = c.createLinearGradient(0, -6, 0, 12); body.addColorStop(0, hurt > 0 ? '#f87171' : '#cbd5e1'); body.addColorStop(1, '#475569'); c.fillStyle = body; c.beginPath(); c.ellipse(0, 2, 46, 13, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    for (let i = 0; i < 8; i++) { const a = t * 2 + i * Math.PI / 4; const lx = Math.cos(a) * 36, ly = 6 + Math.sin(a) * 6; c.fillStyle = ['#f472b6', '#facc15', '#22d3ee', '#a3e635'][i % 4]; c.globalAlpha = .55 + Math.sin(a) * .45; c.beginPath(); c.arc(lx, ly, 3.5, 0, 7); c.fill(); } c.globalAlpha = 1; c.restore(); },
  // אסטרואיד מציאותי: צורה לא סדירה, גרדיאנט תאורה מהצד, מכתשים, קו מתאר כהה. מסתובב לפי rot
  rock(r, x, y, rad, seed, rot = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.rotate(rot); const pts = []; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr = rad * (0.72 + ((Math.sin(seed * 7 + k * 3) + 1) / 2) * 0.4); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath(); const g = c.createRadialGradient(-rad * .4, -rad * .4, rad * .1, 0, 0, rad * 1.1); g.addColorStop(0, '#a8a29e'); g.addColorStop(.6, '#78716c'); g.addColorStop(1, '#3f3f46'); c.fillStyle = g; c.fill(); c.strokeStyle = '#27272a'; c.lineWidth = Math.max(1, rad * .08); c.stroke();
    for (let k = 0; k < 3; k++) { const a = seed * 1.7 + k * 2.1, d = rad * (0.25 + k * 0.18), cr = rad * (0.14 + ((Math.sin(seed + k) + 1) / 2) * 0.1); const cx = Math.cos(a) * d, cy = Math.sin(a) * d; c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.arc(cx, cy, cr, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(cx - cr * .3, cy - cr * .3, cr * .5, 0, 7); c.fill(); }
    c.restore(); },
  rockOld(r, x, y, rad, seed) { const c = r.ctx; c.fillStyle = '#78716C'; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = rad * (0.75 + ((Math.sin(seed * 7 + k * 3) + 1) / 2) * 0.35); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); c.fillStyle = '#A8A29E'; c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.25, 0, Math.PI * 2); c.fill(); },
  frog(r, x, y, scale = 1, hop = 0) { const c = r.ctx; c.save(); c.translate(x, y); c.scale(scale, scale); /* צפרדע ממעוף הציפור, פונה למעלה: רגליים אחוריות גדולות, קדמיות קטנות, עיניים בולטות, נקודות */
    const G1 = '#22c55e', G2 = '#15803d', k = hop; c.strokeStyle = G2; c.lineCap = 'round'; c.lineWidth = 6;
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 9, 6); c.quadraticCurveTo(d * (20 + k * 4), 10, d * (16 + k * 6), 18 - k * 6); c.stroke(); c.fillStyle = G1; c.beginPath(); c.ellipse(d * (16 + k * 6), 18 - k * 6, 5, 3, d * .6, 0, Math.PI * 2); c.fill(); c.lineWidth = 4; c.beginPath(); c.moveTo(d * 8, -6); c.lineTo(d * 15, -12 - k * 3); c.stroke(); c.fillStyle = G1; c.beginPath(); c.ellipse(d * 15, -13 - k * 3, 4, 2.5, 0, 0, Math.PI * 2); c.fill(); c.lineWidth = 6; }
    const bg = c.createRadialGradient(-3, -4, 2, 0, 0, 16); bg.addColorStop(0, '#4ade80'); bg.addColorStop(1, G1); c.fillStyle = bg; c.beginPath(); c.ellipse(0, 2, 12, 15, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = G2; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#166534'; for (const [sx, sy] of [[-5, 4], [4, 8], [1, -1], [-3, 11]]) { c.beginPath(); c.arc(sx, sy, 1.8, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = G1; c.beginPath(); c.ellipse(0, -11, 10, 7, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = G2; c.stroke();
    for (const d of [-1, 1]) { c.fillStyle = G1; c.beginPath(); c.arc(d * 7, -15, 5, 0, Math.PI * 2); c.fill(); c.strokeStyle = G2; c.lineWidth = 1.2; c.stroke(); c.fillStyle = '#fde047'; c.beginPath(); c.arc(d * 7, -15, 3.2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.ellipse(d * 7, -15.5, 1.6, 2.4, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(d * 7 + 1, -17, .8, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#14532d'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -10, 5, .3, Math.PI - .3); c.stroke(); c.restore(); },
  skis(r, x, y) { r.line(x - 14, y + 2, x - 6, y + 6, '#EF4444', 4); r.line(x + 6, y + 6, x + 14, y + 2, '#EF4444', 4); r.line(x - 24, y + 6, x + 4, y + 6, '#1D4ED8', 3); r.line(x - 4, y + 6, x + 24, y + 6, '#1D4ED8', 3); },
};

// ---- דמות מלאה מאותו שלד: חולצה עם מספר, מכנסיים, גרביים, נעליים, עור, שיער, פנים. לשוער: כפפות ----
export const KITS = {
  blue: { shirt: '#2563EB', shirt2: '#1E40AF', shorts: '#1E3A8A', socks: '#fff', number: '10' },
  green: { shirt: '#16A34A', shirt2: '#15803D', shorts: '#fff', socks: '#16A34A', number: '9' },
  red: { shirt: '#DC2626', shirt2: '#991B1B', shorts: '#fff', socks: '#DC2626', number: '7' },
  keeper: { shirt: '#FACC15', shirt2: '#CA8A04', shorts: '#111827', socks: '#FACC15', number: '1', gloves: '#F97316' },
  grey: { shirt: '#9CA3AF', shirt2: '#6B7280', shorts: '#4B5563', socks: '#E5E7EB', number: '' },
  rabbi: { shirt: '#111827', shirt2: '#000', shorts: '#111827', socks: '#111827', number: '' }, // חליפה שחורה (הרבי בפרה המעופפת)
  purple: { shirt: '#7C3AED', shirt2: '#5B21B6', shorts: '#fff', socks: '#7C3AED', number: '8' },
  orange: { shirt: '#F97316', shirt2: '#C2410C', shorts: '#111827', socks: '#F97316', number: '11' },
  kid: { shirt: '#8B5CF6', shirt2: '#6D28D9', shorts: '#1E1B3A', socks: '#fff', number: '7' }, // הדמות באימון: סגול של האפליקציה, מספר 7 (הגיל)
};
const SKINS = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
// מבט מלפנים לפי הפוזה: שתי הידיים סימטריות סביב הצוואר ורחוקות זו מזו
export const isFront = pose => Math.abs((pose.le[0] - pose.neck[0]) + (pose.re[0] - pose.neck[0])) < 10 && Math.abs(pose.le[0] - pose.re[0]) > 14;
export function player(ctx, pose, x, y, scale, kit = KITS.blue, { flip = false, skin = SKINS[0], hair = '#3B2A1A', shoes = '#111827', happy = true, outline = '#1B1740', shadow = true, front: frontOpt = null } = {}) {
  // דמות מלאה: גפיים כפוליגונים מתעבים (ירך רחבה מהשוק), מפרקים עגולים, גוף עם כתפיים, מכנסיים, גרביים, נעליים עם סוליה, ראש עם אוזן, שיער, גבות, אף
  const P = ([a, b]) => [x + (flip ? -(a - 100) : (a - 100)) * scale, y + (b - 182) * scale];
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const front = frontOpt ?? isFront(pose); // front: קיבוע המבט לכל הסרטון (בסימולציית תרגיל), אחרת לפי הפוזה
  const dir = flip ? -1 : 1, OW = 1.6 * scale;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // גפה מתעבת: מלבן שמצטמצם מ-w0 ל-w1, עם קו מתאר וקו צל בצד אחד
  const limb = (a, b, w0, w1, color, dark) => { const [ax, ay] = P(a), [bx, by] = P(b); const ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang); ctx.beginPath(); ctx.moveTo(ax + nx * w0, ay + ny * w0); ctx.lineTo(bx + nx * w1, by + ny * w1); ctx.arc(bx, by, w1, ang + Math.PI / 2, ang - Math.PI / 2, true); ctx.lineTo(ax - nx * w0, ay - ny * w0); ctx.arc(ax, ay, w0, ang - Math.PI / 2, ang + Math.PI / 2, true); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = OW; ctx.stroke(); } if (dark) { ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = w0 * .8; ctx.beginPath(); ctx.moveTo(ax + nx * w0 * .8, ay + ny * w0 * .8); ctx.lineTo(bx + nx * w1 * .8, by + ny * w1 * .8); ctx.stroke(); ctx.restore(); } };
  const joint = (p, rad, color) => { const [px, py] = P(p); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill(); };
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 3 * scale, 26 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill(); }
  const shoe = (f, k, near) => { const [fx, fy] = P(f), [kx] = P(k); const fwd = front ? 0 : (fx >= kx ? 1 : -1) * dir * dir; const col = near ? shoes : shade(shoes, 25); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(fx + fwd * 5 * scale, fy + 1.5 * scale, 9 * scale, 4.5 * scale, 0, 0, Math.PI * 2); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = OW; ctx.stroke(); } ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(fx + fwd * 5 * scale, fy + 4.5 * scale, 9 * scale, 1.6 * scale, 0, 0, Math.PI * 2); ctx.fill(); };
  const leg = (k, f, near) => { const sk = near ? skin : shade(skin, -22), sock = near ? kit.socks : shade(kit.socks, -25); limb(pose.hip, k, 7.5 * scale, 5.5 * scale, sk, !near); limb(k, f, 5.5 * scale, 4 * scale, sk, !near); limb(lerp(k, f, .5), f, 4.6 * scale, 4.4 * scale, sock, false); joint(k, 4.6 * scale, sk); shoe(f, k, near); };
  const arm = (e, h, near) => { const sk = near ? skin : shade(skin, -22); limb(pose.neck, e, 5.2 * scale, 4 * scale, sk, !near); limb(e, h, 4 * scale, 3.2 * scale, sk, !near); joint(e, 3.4 * scale, sk); limb(pose.neck, lerp(pose.neck, e, .42), 7 * scale, 5.5 * scale, near ? kit.shirt : kit.shirt2, false); if (kit.gloves) { joint(h, 6.5 * scale, kit.gloves); if (outline) { const [hx2, hy2] = P(h); ctx.strokeStyle = outline; ctx.lineWidth = OW; ctx.beginPath(); ctx.arc(hx2, hy2, 6.5 * scale, 0, 7); ctx.stroke(); } } else { joint(h, 4.2 * scale, sk); if (outline) { const [hx2, hy2] = P(h); ctx.strokeStyle = outline; ctx.lineWidth = OW; ctx.beginPath(); ctx.arc(hx2, hy2, 4.2 * scale, 0, 7); ctx.stroke(); } } };
  const shW = (front ? 16 : 8) * scale, hipW = (front ? 12 : 7) * scale;
  const [nx, ny] = P(pose.neck), [hx, hy] = P(pose.hip); const ang = Math.atan2(hy - ny, hx - nx) + Math.PI / 2, cx = Math.cos(ang), cy = Math.sin(ang);
  // רחוק: רגל ויד
  leg(pose.lk, pose.lf, false); arm(pose.le, pose.lh, false);
  // מכנסיים: שני צינורות קצרים + חלק עליון
  limb(pose.hip, lerp(pose.hip, pose.lk, .45), 8.5 * scale, 7.5 * scale, shade(kit.shorts, -14), false); limb(pose.hip, lerp(pose.hip, pose.rk, .45), 8.5 * scale, 7.5 * scale, kit.shorts, false);
  // גוף: כתפיים רחבות, מותן צר, גרדיאנט ופס צד
  ctx.beginPath(); ctx.moveTo(nx - cx * shW, ny - cy * shW); ctx.quadraticCurveTo((nx + hx) / 2 - cx * (shW + hipW) / 2 * 1.05, (ny + hy) / 2 - cy * (shW + hipW) / 2 * 1.05, hx - cx * hipW, hy - cy * hipW + 5 * scale); ctx.lineTo(hx + cx * hipW, hy + cy * hipW + 5 * scale); ctx.quadraticCurveTo((nx + hx) / 2 + cx * (shW + hipW) / 2 * 1.05, (ny + hy) / 2 + cy * (shW + hipW) / 2 * 1.05, nx + cx * shW, ny + cy * shW); ctx.closePath();
  const tg = ctx.createLinearGradient(nx - cx * shW, ny - cy * shW, nx + cx * shW, ny + cy * shW); tg.addColorStop(0, kit.shirt2); tg.addColorStop(.4, kit.shirt); tg.addColorStop(1, kit.shirt2); ctx.fillStyle = tg; ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = OW; ctx.stroke(); }
  // צווארון
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(nx, ny + 2 * scale, 4.5 * scale, front ? .2 : .6, front ? Math.PI - .2 : Math.PI - .6); ctx.stroke();
  if (front && kit.number) { ctx.fillStyle = '#fff'; ctx.font = `900 ${13 * scale}px Heebo, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kit.number, (nx + hx) / 2, (ny + hy) / 2 + 2 * scale); }
  // קרוב: רגל ויד
  leg(pose.rk, pose.rf, true); arm(pose.re, pose.rh, true);
  // צוואר וראש
  const [hdx, hdy] = P(pose.head), R = 12 * scale; limb(pose.neck, lerp(pose.neck, pose.head, .5), 4 * scale, 4 * scale, shade(skin, -10), false);
  const hg = ctx.createRadialGradient(hdx - R * .3, hdy - R * .3, R * .2, hdx, hdy, R * 1.05); hg.addColorStop(0, shade(skin, 25)); hg.addColorStop(1, shade(skin, -6)); ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(hdx, hdy, R * .95, R, 0, 0, Math.PI * 2); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = OW; ctx.stroke(); }
  // אוזן
  ctx.fillStyle = skin; ctx.beginPath(); if (front) { ctx.ellipse(hdx - R * .95, hdy + R * .05, R * .18, R * .28, 0, 0, 7); ctx.ellipse(hdx + R * .95, hdy + R * .05, R * .18, R * .28, 0, 0, 7); } else ctx.ellipse(hdx - dir * R * .8, hdy + R * .05, R * .2, R * .28, 0, 0, 7); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = OW * .8; ctx.stroke(); }
  // שיער: כיפה עם פוני
  ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(hdx, hdy - R * .25, R * 1.02, R * .85, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hdx + R * 1.0, hdy - R * .1); ctx.quadraticCurveTo(hdx + R * .5, hdy - R * .55, hdx + R * .1, hdy - R * .3); ctx.quadraticCurveTo(hdx - R * .3, hdy - R * .6, hdx - R * .7, hdy - R * .25); ctx.lineTo(hdx - R * 1.0, hdy - R * .1); ctx.closePath(); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = OW * .8; ctx.stroke(); }
  // פנים: עיניים עם לבן, גבות, אף, פה
  ctx.lineWidth = Math.max(1, 1.3 * scale); ctx.strokeStyle = '#1B1740';
  const eye = (ex, ey) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R * .2, R * .22, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#1B1740'; ctx.beginPath(); ctx.arc(ex + (front ? 0 : dir * R * .05), ey + R * .03, R * .11, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(ex - R * .22, ey - R * .32); ctx.lineTo(ex + R * .22, ey - R * .36); ctx.stroke(); };
  if (front) { eye(hdx - R * .38, hdy - R * .02); eye(hdx + R * .38, hdy - R * .02); ctx.strokeStyle = shade(skin, -35); ctx.beginPath(); ctx.moveTo(hdx, hdy + R * .05); ctx.lineTo(hdx - R * .08, hdy + R * .3); ctx.stroke(); }
  else { eye(hdx + dir * R * .42, hdy - R * .02); ctx.strokeStyle = shade(skin, -35); ctx.beginPath(); ctx.moveTo(hdx + dir * R * .85, hdy + R * .1); ctx.lineTo(hdx + dir * R * 1.0, hdy + R * .28); ctx.stroke(); }
  ctx.strokeStyle = '#7C2D12'; ctx.lineWidth = Math.max(1, 1.4 * scale); ctx.beginPath(); if (happy) ctx.arc(hdx + (front ? 0 : dir * R * .4), hdy + R * .32, R * .38, front ? .25 : (dir > 0 ? .1 : Math.PI - .9), front ? Math.PI - .25 : (dir > 0 ? Math.PI * .9 : Math.PI + .1)); else { ctx.moveTo(hdx - R * .3 + (front ? 0 : dir * R * .4), hdy + R * .55); ctx.lineTo(hdx + R * .3 + (front ? 0 : dir * R * .4), hdy + R * .55); } ctx.stroke();
}
function shade(hex, amt) { const n = parseInt(hex.replace('#', '').padEnd(6, hex.length === 4 ? hex.slice(1) : '0'), 16); const c = k => Math.max(0, Math.min(255, ((n >> k) & 255) + amt)); return `rgb(${c(16)},${c(8)},${c(0)})`; }
S.player = (r, pose, x, y, scale, kit, opts) => player(r.ctx, pose, x, y, scale, kit, opts);

// ---- קהל שנראה כמו אנשים: ראשים, כתפיים, צעיפים ודגלים, קופץ כשמתרגש ----
export function crowdGen(count, W, rows, topY = 20, rowH = 22) {
  const fans = []; const colors = ['#16A34A', '#fff', '#16A34A', '#FDE047', '#1E3A8A', '#EF4444', '#0EA5E9', '#F472B6'];
  for (let r = 0; r < rows; r++) for (let i = 0; i < count; i++) fans.push({ x: (i + (r % 2) * .5) * (W / count) + W / count / 2, y: topY + r * rowH, color: colors[Math.floor(Math.random() * colors.length)], skin: SKINS[Math.floor(Math.random() * SKINS.length)], hair: ['#3B2A1A', '#111', '#8B5E3C', '#D1A054', '#444'][Math.floor(Math.random() * 5)], phase: Math.random() * 6, flag: Math.random() < .12, scarf: Math.random() < .25, size: 7 + Math.random() * 2, back: r });
  return fans;
}
export function crowd(ctx, fans, t, excited = false) {
  for (const f of fans) {
    const jump = excited && Math.sin(t * 9 + f.phase) > 0 ? -7 : 0, y = f.y + jump, s = f.size;
    ctx.fillStyle = f.color; ctx.beginPath(); ctx.roundRect(f.x - s * 1.4, y + s * .6, s * 2.8, s * 1.6, s * .6); ctx.fill();
    if (excited) { ctx.strokeStyle = f.skin; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x - s * 1.2, y + s); ctx.lineTo(f.x - s * 1.9, y - s * .9 - Math.sin(t * 12 + f.phase) * 3); ctx.moveTo(f.x + s * 1.2, y + s); ctx.lineTo(f.x + s * 1.9, y - s * .9 + Math.sin(t * 12 + f.phase) * 3); ctx.stroke(); }
    ctx.fillStyle = f.skin; ctx.beginPath(); ctx.arc(f.x, y, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.hair; ctx.beginPath(); ctx.arc(f.x, y - s * .2, s, Math.PI, Math.PI * 2); ctx.fill();
    if (f.scarf) { ctx.fillStyle = '#16A34A'; ctx.fillRect(f.x - s * 1.4, y + s * .5, s * 2.8, s * .45); }
    if (f.flag) { ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(f.x + s * 1.6, y + s); ctx.lineTo(f.x + s * 1.6, y - s * 2.6); ctx.stroke(); ctx.fillStyle = '#16A34A'; ctx.fillRect(f.x + s * 1.6, y - s * 2.6 + Math.sin(t * 4 + f.phase), s * 1.8, s * 1.1); }
  }
}
S.crowd = (r, fans, t, excited) => crowd(r.ctx, fans, t, excited);

// ---- כדורים תלת-ממדיים: כדור עם הצללה, סיבוב אמיתי של הדוגמה, והבהוב ----
export function soccerBall(ctx, x, y, r, rot = 0) {
  // כדור אמיתי יותר: כדור עם הצללה, מחומשים שחורים שמוקרנים על הכדור (קטנים ושטוחים לקראת הקצה), תפרים בין המחומשים, ברק והשתקפות
  const base = ctx.createRadialGradient(x - r * .3, y - r * .32, r * .05, x, y, r * 1.05); base.addColorStop(0, '#ffffff'); base.addColorStop(.45, '#f3f4f6'); base.addColorStop(.8, '#c7cbd3'); base.addColorStop(1, '#6b7280');
  ctx.fillStyle = base; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * .985, 0, Math.PI * 2); ctx.clip(); ctx.translate(x, y);
  // המחומשים יושבים על כדור: כל אחד בזווית (lon,lat), מוקרן עם סיבוב סביב ציר אנכי ומעט סביב ציר עומק
  const spots = [[0, 0]]; for (let k = 0; k < 5; k++) spots.push([k * Math.PI * 2 / 5, 1.1]); for (let k = 0; k < 5; k++) spots.push([k * Math.PI * 2 / 5 + Math.PI / 5, 2.05]);
  const proj = (lon, lat) => { const sl = Math.sin(lat), cl = Math.cos(lat); const px = sl * Math.cos(lon), py = sl * Math.sin(lon), pz = cl; const c = Math.cos(rot), sn = Math.sin(rot); const rx = px * c + pz * sn, rz = -px * sn + pz * c; const c2 = Math.cos(rot * .37), s2 = Math.sin(rot * .37); const ry = py * c2 - rz * s2, rz2 = py * s2 + rz * c2; return [rx, ry, rz2]; };
  const pts = spots.map(([lon, lat]) => proj(lon, lat)).filter(p => p[2] > -.05);
  // תפרים: קווים בין מחומשים קרובים
  ctx.strokeStyle = 'rgba(55,65,81,.55)'; ctx.lineWidth = Math.max(.8, r * .045);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j]; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < 1.25 && a[2] > .05 && b[2] > .05) { ctx.beginPath(); ctx.moveTo(a[0] * r, a[1] * r); ctx.lineTo(b[0] * r, b[1] * r); ctx.stroke(); } }
  for (const [px, py, pz] of pts) { if (pz <= 0) continue; const sq = Math.max(.12, pz); const pr = r * .28 * (0.55 + 0.45 * pz); const ang = Math.atan2(py, px); ctx.save(); ctx.translate(px * r, py * r); ctx.rotate(ang); ctx.scale(sq, 1); ctx.rotate(-ang + rot * .5); ctx.fillStyle = `rgba(17,24,39,${.75 + .25 * pz})`; ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; ctx.lineTo(Math.cos(a) * pr, Math.sin(a) * pr); } ctx.closePath(); ctx.fill(); ctx.restore(); }
  ctx.restore();
  // הצללה בתחתית, ברק למעלה, קו מתאר עדין
  const sh = ctx.createRadialGradient(x + r * .25, y + r * .3, r * .2, x, y, r); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(.7, 'rgba(0,0,0,.05)'); sh.addColorStop(1, 'rgba(0,0,0,.35)'); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(x - r * .38, y - r * .45, r * .2, r * .11, -.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(x + r * .1, y + r * .72, r * .35, r * .08, .1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(17,24,39,.4)'; ctx.lineWidth = Math.max(1, r * .06); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
export function basketBall(ctx, x, y, r, rot = 0) {
  const g = ctx.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); g.addColorStop(0, '#fdba74'); g.addColorStop(.5, '#f97316'); g.addColorStop(1, '#9a3412');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * .97, 0, Math.PI * 2); ctx.clip(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = '#3f1d0b'; ctx.lineWidth = Math.max(1.2, r * .09);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-r * .75, 0, r * .5, r * 1.1, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(r * .75, 0, r * .5, r * 1.1, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - r * .38, y - r * .42, r * .22, r * .13, -.6, 0, Math.PI * 2); ctx.fill();
}
// צל על הרצפה מתחת לעצם שבאוויר: ככל שגבוה יותר, הצל קטן ובהיר יותר
export function groundShadow(ctx, x, groundY, r, height = 0) { const k = Math.max(.35, 1 - height / 260); ctx.fillStyle = `rgba(0,0,0,${.32 * k})`; ctx.beginPath(); ctx.ellipse(x, groundY, r * 1.1 * k, r * .38 * k, 0, 0, Math.PI * 2); ctx.fill(); }
S.soccerBall = (r, x, y, rad, rot) => soccerBall(r.ctx, x, y, rad, rot);
S.basketBall = (r, x, y, rad, rot) => basketBall(r.ctx, x, y, rad, rot);
S.groundShadow = (r, x, gy, rad, h) => groundShadow(r.ctx, x, gy, rad, h);

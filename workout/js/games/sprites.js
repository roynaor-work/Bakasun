// ציורים משותפים למשחקים: פוזות של דמויות מהקטלוג, ודמויות מצוירות (מכונית, ציפור, חללית...) במקום אימוג'י.
import { byId } from '../exercises.js';

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
  banknote(r, x, y, val = 20, rot = 0, s = 1) { const c = r.ctx; const col = { 20: ['#4ade80', '#166534'], 50: ['#c084fc', '#581c87'], 100: ['#fdba74', '#9a3412'], 200: ['#60a5fa', '#1e3a8a'] }[val] || ['#e5e7eb', '#374151']; c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 3; c.fillStyle = col[0]; c.beginPath(); c.roundRect ? c.roundRect(-34, -18, 68, 36, 4) : c.rect(-34, -18, 68, 36); c.fill(); c.shadowColor = 'transparent'; c.strokeStyle = col[1]; c.lineWidth = 2; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.strokeRect(-29, -13, 58, 26); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(-18, 0, 8, 0, 7); c.fill(); c.fillStyle = col[1]; c.fillRect(20, -18, 4, 36); c.font = '900 16px Heebo, Rubik, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col[1]; c.fillText(String(val), 4, 1); c.font = '700 8px Arial'; c.fillText('₪', -27, -9); c.fillText('₪', 14, 10); c.restore(); },
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
  rock(r, x, y, rad, seed) { const c = r.ctx; c.fillStyle = '#78716C'; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = rad * (0.75 + ((Math.sin(seed * 7 + k * 3) + 1) / 2) * 0.35); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); c.fillStyle = '#A8A29E'; c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.25, 0, Math.PI * 2); c.fill(); },
  frog(r, x, y) { r.circle(x, y, 14, '#22C55E'); r.circle(x - 7, y - 10, 6, '#22C55E'); r.circle(x + 7, y - 10, 6, '#22C55E'); r.circle(x - 7, y - 10, 3, '#fff'); r.circle(x + 7, y - 10, 3, '#fff'); r.circle(x - 7, y - 10, 1.5, '#111'); r.circle(x + 7, y - 10, 1.5, '#111'); r.line(x - 5, y + 4, x + 5, y + 4, '#14532D', 2); },
  skis(r, x, y) { r.line(x - 14, y + 2, x - 6, y + 6, '#EF4444', 4); r.line(x + 6, y + 6, x + 14, y + 2, '#EF4444', 4); r.line(x - 24, y + 6, x + 4, y + 6, '#1D4ED8', 3); r.line(x - 4, y + 6, x + 24, y + 6, '#1D4ED8', 3); },
};

// ---- דמות מלאה מאותו שלד: חולצה עם מספר, מכנסיים, גרביים, נעליים, עור, שיער, פנים. לשוער: כפפות ----
export const KITS = {
  blue: { shirt: '#2563EB', shirt2: '#1E40AF', shorts: '#1E3A8A', socks: '#fff', number: '10' },
  green: { shirt: '#16A34A', shirt2: '#15803D', shorts: '#fff', socks: '#16A34A', number: '9' },
  red: { shirt: '#DC2626', shirt2: '#991B1B', shorts: '#fff', socks: '#DC2626', number: '7' },
  keeper: { shirt: '#FACC15', shirt2: '#CA8A04', shorts: '#111827', socks: '#FACC15', number: '1', gloves: '#F97316' },
  grey: { shirt: '#9CA3AF', shirt2: '#6B7280', shorts: '#4B5563', socks: '#E5E7EB', number: '' },
  purple: { shirt: '#7C3AED', shirt2: '#5B21B6', shorts: '#fff', socks: '#7C3AED', number: '8' },
  orange: { shirt: '#F97316', shirt2: '#C2410C', shorts: '#111827', socks: '#F97316', number: '11' },
};
const SKINS = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
export function player(ctx, pose, x, y, scale, kit = KITS.blue, { flip = false, skin = SKINS[0], hair = '#3B2A1A', shoes = '#111827', happy = true, outline = '#1B1740', shadow = true } = {}) {
  const P = ([a, b]) => [x + (flip ? -(a - 100) : (a - 100)) * scale, y + (b - 182) * scale];
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const cap = (a, b, w, color) => { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = w + 2.2 * scale; ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke(); } ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke(); };
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 3 * scale, 26 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill(); }
  const dot = (p, rad, color) => { const [px, py] = P(p); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill(); };
  // מלפנים או מהצד? מלפנים הידיים סימטריות סביב הצוואר
  const front = Math.abs((pose.le[0] - pose.neck[0]) + (pose.re[0] - pose.neck[0])) < 10 && Math.abs(pose.le[0] - pose.re[0]) > 14;
  const dir = flip ? -1 : 1, L = 8 * scale, A = 6.5 * scale, shW = (front ? 15 : 7) * scale, hipW = (front ? 11 : 6) * scale;
  const leg = (k, f, near) => { const sk = near ? skin : shade(skin, -18); cap(pose.hip, k, L * 1.15, sk); cap(k, f, L, sk); cap(lerp(k, f, .55), f, L + 1, near ? kit.socks : shade(kit.socks, -25)); const [fx, fy] = P(f); ctx.fillStyle = shoes; ctx.beginPath(); ctx.ellipse(fx + (front ? 0 : dir * 5 * scale), fy + 2 * scale, 8 * scale, 4.5 * scale, 0, 0, Math.PI * 2); ctx.fill(); };
  const arm = (e, h, near) => { const sk = near ? skin : shade(skin, -18); cap(pose.neck, e, A, sk); cap(e, h, A, sk); cap(pose.neck, lerp(pose.neck, e, .45), A + 4 * scale, near ? kit.shirt : kit.shirt2); if (kit.gloves) dot(h, 6.5 * scale, kit.gloves); else dot(h, 4 * scale, sk); };
  // רגל וזרוע רחוקות
  leg(pose.lk, pose.lf, false); arm(pose.le, pose.lh, false);
  // מכנסיים
  cap(pose.hip, lerp(pose.hip, pose.lk, .42), L * 1.6, shade(kit.shorts, -12)); cap(pose.hip, lerp(pose.hip, pose.rk, .42), L * 1.6, kit.shorts);
  // גוף
  const [nx, ny] = P(pose.neck), [hx, hy] = P(pose.hip); const ang = Math.atan2(hy - ny, hx - nx) + Math.PI / 2, cx = Math.cos(ang), cy = Math.sin(ang);
  const torso = () => { ctx.beginPath(); ctx.moveTo(nx - cx * shW, ny - cy * shW); ctx.lineTo(nx + cx * shW, ny + cy * shW); ctx.lineTo(hx + cx * hipW, hy + cy * hipW + 4 * scale); ctx.lineTo(hx - cx * hipW, hy - cy * hipW + 4 * scale); ctx.closePath(); };
  torso(); const tg = ctx.createLinearGradient(nx - shW, ny, nx + shW, ny); tg.addColorStop(0, kit.shirt2); tg.addColorStop(.45, kit.shirt); tg.addColorStop(1, kit.shirt2); ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = outline || kit.shirt2; ctx.lineWidth = 1.8 * scale; ctx.lineJoin = 'round'; ctx.stroke();
  if (front && kit.number) { ctx.fillStyle = '#fff'; ctx.font = `900 ${13 * scale}px Heebo, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kit.number, (nx + hx) / 2, (ny + hy) / 2); }
  // רגל וזרוע קרובות
  leg(pose.rk, pose.rf, true); arm(pose.re, pose.rh, true);
  // ראש
  const [hdx, hdy] = P(pose.head), R = 12 * scale; const hg = ctx.createRadialGradient(hdx - R * .3, hdy - R * .3, R * .2, hdx, hdy, R); hg.addColorStop(0, shade(skin, 25)); hg.addColorStop(1, skin); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hdx, hdy, R, 0, Math.PI * 2); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.6 * scale; ctx.stroke(); }
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hdx, hdy - R * .15, R * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(hdx + R * (front ? .95 : dir * .3), hdy - R * .2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1B1740';
  if (front) { ctx.beginPath(); ctx.arc(hdx - R * .35, hdy, R * .12, 0, 7); ctx.arc(hdx + R * .35, hdy, R * .12, 0, 7); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(hdx + dir * R * .45, hdy - R * .05, R * .13, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#7C2D12'; ctx.lineWidth = Math.max(1, 1.4 * scale); ctx.beginPath(); if (happy) ctx.arc(hdx + (front ? 0 : dir * R * .4), hdy + R * .3, R * .4, front ? .25 : (dir > 0 ? .1 : Math.PI - .9), front ? Math.PI - .25 : (dir > 0 ? Math.PI * .9 : Math.PI + .1)); else { ctx.moveTo(hdx - R * .3, hdy + R * .5); ctx.lineTo(hdx + R * .3, hdy + R * .5); } ctx.stroke();
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

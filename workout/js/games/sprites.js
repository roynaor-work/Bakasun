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
};

export const S = {
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
  soccer(r, x, y, rad) { r.circle(x, y, rad, '#fff'); const c = r.ctx; c.fillStyle = '#111'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; c.beginPath(); c.arc(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.22, 0, Math.PI * 2); c.fill(); } c.beginPath(); c.arc(x, y, rad * 0.2, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke(); },
  cannon(r, x, y, ang) { r.rect(x - 24, y - 8, 48, 26, '#374151', 8); r.circle(x - 12, y + 18, 9, '#111'); r.circle(x + 12, y + 18, 9, '#111'); const c = r.ctx; c.save(); c.translate(x, y); c.rotate(ang); r.rect(0, -8, 44, 16, '#1F2937', 6); c.restore(); },
  rock(r, x, y, rad, seed) { const c = r.ctx; c.fillStyle = '#78716C'; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = rad * (0.75 + ((Math.sin(seed * 7 + k * 3) + 1) / 2) * 0.35); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); c.fillStyle = '#A8A29E'; c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.25, 0, Math.PI * 2); c.fill(); },
  frog(r, x, y) { r.circle(x, y, 14, '#22C55E'); r.circle(x - 7, y - 10, 6, '#22C55E'); r.circle(x + 7, y - 10, 6, '#22C55E'); r.circle(x - 7, y - 10, 3, '#fff'); r.circle(x + 7, y - 10, 3, '#fff'); r.circle(x - 7, y - 10, 1.5, '#111'); r.circle(x + 7, y - 10, 1.5, '#111'); r.line(x - 5, y + 4, x + 5, y + 4, '#14532D', 2); },
  skis(r, x, y) { r.line(x - 14, y + 2, x - 6, y + 6, '#EF4444', 4); r.line(x + 6, y + 6, x + 14, y + 2, '#EF4444', 4); r.line(x - 24, y + 6, x + 4, y + 6, '#1D4ED8', 3); r.line(x - 4, y + 6, x + 24, y + 6, '#1D4ED8', 3); },
};

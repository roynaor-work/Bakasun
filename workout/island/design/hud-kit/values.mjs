// Pure presentation values. No game rules or game objects.
export const EMPTY = Object.freeze({});
export function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finite(value, min)));
}
export function integer(value, max = 999) { return Math.floor(clamp(value, 0, max)); }
export function percent(value) { return Math.round(clamp(value) * 100); }
export function clockTick(ms, hundredths = false) {
  return Math.floor(clamp(ms, 0, 5999990) / (hundredths ? 10 : 1000));
}
const two = Array.from({ length: 100 }, (_, n) => String(n).padStart(2, '0'));
export function clockText(tick, hundredths = false) {
  const t = integer(tick, hundredths ? 599999 : 5999);
  const sec = hundredths ? Math.floor(t / 100) : t;
  const base = two[Math.floor(sec / 60)] + ':' + two[sec % 60];
  return hundredths ? base + '.' + two[t % 100] : base;
}
// Writes into a caller-owned object, including for diagonal movement.
export function stickValues(out, x, y, deadZone = 0.08) {
  x = finite(x); y = finite(y);
  const length = Math.hypot(x, y);
  const zone = clamp(deadZone, 0, 0.95);
  const magnitude = length <= zone ? 0 : (Math.min(1, length) - zone) / (1 - zone);
  out.x = magnitude === 0 ? 0 : Math.round(x / length * magnitude * 1000) / 1000;
  out.y = magnitude === 0 ? 0 : Math.round(y / length * magnitude * 1000) / 1000;
  return out;
}
export function eventKind(kind) {
  return kind === 'goal' || kind === 'basket' || kind === 'fall' ? kind : 'goal';
}
export function outcomeKind(kind) {
  return kind === 'win' || kind === 'loss' || kind === 'incomplete' ? kind : 'draw';
}

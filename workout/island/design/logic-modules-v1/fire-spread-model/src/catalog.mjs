/** Game coefficients only. This is deliberately not a fire-engineering model. */
export const API_VERSION = '1.0.0';
export const TICK_SECONDS = 0.1;
const freeze = value => {
  if (value && typeof value === 'object') Object.values(value).forEach(freeze);
  return Object.freeze(value);
};
export const DIFFICULTIES = freeze({
  easy: { floors: 2, fires: 2, people: 2, seconds: 300, growth: 0.7, resources: 1.3, rescueSeconds: 1.5 },
  normal: { floors: 3, fires: 3, people: 3, seconds: 280, growth: 1, resources: 1.15, rescueSeconds: 2 },
  hard: { floors: 3, fires: 4, people: 3, seconds: 260, growth: 1.25, resources: 1, rescueSeconds: 2.5 },
});
export const MATERIALS = freeze({
  wood: { fireClass: 'A', fuel: 100, ignition: 0.58, burn: 0.24, growth: 1, smoke: 0.018 },
  fabric: { fireClass: 'A', fuel: 75, ignition: 0.5, burn: 0.32, growth: 1.1, smoke: 0.024 },
  liquid: { fireClass: 'B', fuel: 60, ignition: 0.48, burn: 0.36, growth: 1.25, smoke: 0.022 },
  electrical: { fireClass: 'E', fuel: 60, ignition: 0.56, burn: 0.27, growth: 1, smoke: 0.025 },
  cookingOil: { fireClass: 'F', fuel: 60, ignition: 0.55, burn: 0.27, growth: 1.15, smoke: 0.024 },
  concrete: { fireClass: 'A', fuel: 0, ignition: 0.84, burn: 0, growth: 0, smoke: 0 },
});
export const EXTINGUISHERS = freeze({
  water: { capacity: 65, usePerSecond: 2.4, efficacy: { A: 1.1, B: 0, E: 0, F: 0 } },
  foam: { capacity: 50, usePerSecond: 2.4, efficacy: { A: 0.85, B: 1.1, E: 0, F: 0.1 } },
  co2: { capacity: 50, usePerSecond: 2.4, efficacy: { A: 0.15, B: 0.9, E: 1.15, F: 0.05 } },
  powder: { capacity: 65, usePerSecond: 2.4, efficacy: { A: 0.8, B: 1, E: 0.9, F: 0 } },
  wetChemical: { capacity: 45, usePerSecond: 2.4, efficacy: { A: 0.65, B: 0.1, E: 0, F: 1.15 } },
});
export const FIRE_CLASSES = freeze(['A', 'B', 'E', 'F']);
export const LIMITS = freeze({ maxRooms: 48, maxLinks: 128, maxPeople: 24, maxFloors: 6, maxStepSeconds: 60 });

/** A pure, explicit-state 32-bit LCG. Seed zero is valid. */
export function nextRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be a uint32');
  const state = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { state, value: state / 4294967296 };
}

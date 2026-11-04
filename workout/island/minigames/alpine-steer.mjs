/** Alpine Rush steering feel, pure functions shared by the character, the view and the
 * measurement tool (tools/control-feel-alpine.mjs). Presentation only: the race engine
 * never reads anything from here, so scores, clocks and collisions are unchanged.
 *
 * The body answers the player's INTENT (the stick, after expo and rate limit) on the very
 * next frame; the lateral speed that moves the track position follows about 80 ms later.
 * Without an intent (older snapshots, rivals in tests) it falls back to the real lean. */
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));

/** Seconds-rate of the body following its target: quick to lean in, a little slower to come back up. */
export const BODY_FOLLOW = Object.freeze({attack: 24, release: 13});

/** Lean the body should be heading for, in [-1, 1]. */
export function bodyTarget(frame = {}) {
  const lean = clamp(frame.lean, -1, 1), intent = frame.intent;
  if (intent === undefined || intent === null || !Number.isFinite(Number(intent))) return lean;
  const i = clamp(intent, -1, 1);
  return Math.abs(i) > .02 ? i : lean;
}

/** One exponential step of the displayed body lean toward its target. */
export function followBody(current, target, dt) {
  const easing = Math.abs(target) < Math.abs(current) && target * current >= 0; // heading back toward upright
  const rate = easing ? BODY_FOLLOW.release : BODY_FOLLOW.attack;
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

/** Root yaw (rad) and carving roll (rad, into the turn, grows with speed) from the displayed tilt. */
export function carvePose(tilt, speed01 = 0) {
  return {yaw: tilt * .24, roll: -tilt * (.07 + .11 * clamp(speed01, 0, 1))};
}

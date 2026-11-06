/* Physical coordinates: RTL changes text order, never the control sides. */
export const MIN_TOUCH = 48;
export const SIZES = Object.freeze([
  [390, 844], [844, 390], [360, 640], [412, 915], [1024, 768],
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rect = (id, x, y, width, height) => ({ id, x, y, width, height });

export function intersects(a, b, clearance = 0) {
  return a.x < b.x + b.width + clearance &&
    a.x + a.width + clearance > b.x &&
    a.y < b.y + b.height + clearance &&
    a.y + a.height + clearance > b.y;
}

/** All bounds are local CSS pixels. Insets must leave a positive usable area. */
export function touchMap(width, height, insets = {}) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) {
    throw new RangeError('A finite, positive stage size is required');
  }
  const safe = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(key => {
    const value = insets[key] ?? 0;
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid safe area');
    return [key, value];
  }));
  const w = width - safe.left - safe.right;
  const h = height - safe.top - safe.bottom;
  if (w <= 0 || h <= 0) throw new RangeError('Insets consume the stage');
  // The divider follows the physical screen midpoint, including asymmetric notches.
  const middle = width / 2;
  const edge = Math.min(20, w * .04, h * .05);
  const gap = Math.min(20, w * .05);
  const leftWidth = Math.max(0, middle - gap / 2 - safe.left - edge);
  const rightWidth = Math.max(0, width - safe.right - edge - middle - gap / 2);
  if (leftWidth <= 0 || rightWidth <= 0) throw new RangeError('Each screen half needs usable space');
  const scale = Math.min(1, rightWidth / 152, h / 280);
  const primary = 76 * scale;
  const secondary = 60 * scale;
  const gutter = 12 * scale;
  const band = Math.min(180 * scale, h - edge * 2);
  const bottom = height - safe.bottom - edge;
  const joystick = rect('joystick', safe.left + edge, bottom - band, leftWidth, band);
  const radius = Math.min(52 * scale, leftWidth / 2, band / 2);
  const actionsRight = width - safe.right - edge;
  let actions = [
    rect('primary', actionsRight - primary, bottom - primary, primary, primary),
    rect('secondary', actionsRight - primary - gutter - secondary,
      bottom - secondary - 8 * scale, secondary, secondary),
    rect('tertiary', actionsRight - secondary,
      bottom - primary - gutter - secondary, secondary, secondary),
  ];
  // A notch on a narrow portrait screen must not turn child-sized buttons into
  // tiny targets. Stack them within the right half when two columns cannot fit.
  const stacked = rightWidth < 136;
  if (stacked) {
    const spacing = Math.min(12, h * .03);
    const hudReserve = Math.min(80, h * .28);
    const size = Math.min(64, rightWidth, (h - edge * 2 - spacing * 2 - hudReserve) / 3);
    actions = ['primary', 'secondary', 'tertiary'].map((id, index) =>
      rect(id, actionsRight - size, bottom - size * (index + 1) - spacing * index, size, size));
  }
  const pauseSize = Math.min(48, h * .16, w * .16);
  const pause = rect('pause', safe.left + edge, safe.top + edge, pauseSize, pauseSize);
  return {
    width, height, safe, scale, stacked, middle, gap, radius, joystick, actions, pause,
    defaultCenter: {
      x: joystick.x + joystick.width / 2,
      y: joystick.y + joystick.height / 2,
    },
    targets: [joystick, ...actions, pause],
  };
}

/** A floating base can move only inside the left region, including its full rim. */
export function joystickCenter(map, x, y) {
  const { joystick: zone, radius } = map;
  return {
    x: clamp(x, zone.x + radius, zone.x + zone.width - radius),
    y: clamp(y, zone.y + radius, zone.y + zone.height - radius),
  };
}

export function joystickVector(center, x, y, radius, deadzone = .08) {
  const dx = x - center.x;
  const dy = y - center.y;
  const distance = Math.hypot(dx, dy);
  const limit = radius * .55;
  const magnitude = limit ? Math.min(1, distance / limit) : 0;
  const strength = magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);
  return {
    x: distance ? dx / distance * strength : 0,
    y: distance ? dy / distance * strength : 0,
    knobX: distance ? dx / distance * Math.min(distance, limit) : 0,
    knobY: distance ? dy / distance * Math.min(distance, limit) : 0,
  };
}

export function applyTouchMap(stage, map) {
  for (const target of map.targets) {
    const el = stage.querySelector(`[data-iu-target="${target.id}"]`);
    if (!el) continue;
    el.setAttribute('data-iu-positioned', '');
    for (const [property, value] of Object.entries(target)) {
      if (property !== 'id') el.style.setProperty(`--iu-${property}`, `${value}px`);
    }
  }
  stage.style.setProperty('--iu-stick-size', `${map.radius * 2}px`);
  return map;
}

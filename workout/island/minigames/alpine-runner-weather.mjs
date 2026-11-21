// SPDX-License-Identifier: CC0-1.0
// Weather painters of the Codex pack alpine-runner-themes-v2 (its weather.mjs), copied unchanged below this line.
const TAU = Math.PI * 2;
const wrap = (value) => value - Math.floor(value);

function rgba(hex, alpha) {
  const color = Number.parseInt(hex.slice(1), 16);
  return `rgba(${color >> 16}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
}

export function makeWeather(spec) {
  let seed = spec.seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = spec.kind === "snow" ? spec.count : 7;
  const particles = Array.from({ length: count }, () => [random(), random(), random(), random()]);
  return { ...spec, particles };
}

export function paintGlow(ctx, width, height, weather, time) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const phase = time * weather.speed;
  for (const [band, center] of weather.bands.entries()) {
    const hue = band === 0 ? weather.color : weather.secondary;
    const strength = weather.opacity * (band === 0 ? 1 : 0.85);

    function ribbon(x) {
      const u = x / width;
      return height * (center + 0.11 * Math.sin(u * 4.4 + band * 1.8 + phase) +
        0.047 * Math.sin(u * 11.5 + 1.5 - phase * 0.48) +
        0.017 * Math.sin(u * 23.8 + band * 0.98 + phase * 0.71));
    }

    const step = Math.max(1, Math.floor(width / 200));
    for (let x = 0; x < width; x += step) {
      const y = ribbon(x);
      const folds = 0.62 + 0.25 * Math.sin(x / width * 48 + band + phase) + 0.13 * Math.sin(x * 0.37);
      const span = height * (0.16 + folds * 0.19);
      const end = 0.08 + 0.92 * Math.sin((x + 1) / (width + 2) * Math.PI) ** 0.53;
      const gradient = ctx.createLinearGradient(0, y - span, 0, y + height * 0.054);
      gradient.addColorStop(0, rgba(hue, 0));
      gradient.addColorStop(0.48, rgba(hue, 0.29 * strength * end * folds));
      gradient.addColorStop(0.79, rgba(hue, 0.91 * strength * end * folds));
      gradient.addColorStop(0.9, rgba(hue, 0.54 * strength * end));
      gradient.addColorStop(1, rgba(hue, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y - span, step, span + height * 0.054);
    }

    ctx.strokeStyle = rgba(hue, 0.58 * strength);
    ctx.lineWidth = height * 0.0061;
    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      if (x) ctx.lineTo(x, ribbon(x) + height * 0.006);
      else ctx.moveTo(x, ribbon(x) + height * 0.006);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function paintSnow(ctx, width, height, weather, time) {
  const [vx, vy] = weather.speed;
  const [minimum, maximum] = weather.size;
  ctx.strokeStyle = ctx.fillStyle = weather.color;
  for (const [px, py, depth, phase] of weather.particles) {
    const x = width * wrap(px + vx * time * (0.44 + depth * 0.83) + 0.015 * Math.sin(time * 1.15 + phase * TAU));
    const y = height * wrap(py + vy * time * (0.52 + depth * 0.86));
    const size = (minimum + (maximum - minimum) * depth ** 2) * Math.max(0.8, height / 253);
    ctx.globalAlpha = weather.opacity * (0.36 + phase * 0.64);
    ctx.beginPath();
    if (weather.streaks) {
      ctx.lineWidth = size;
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * weather.streaks, y - size * 0.85);
      ctx.stroke();
    } else {
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function paintFog(ctx, width, height, weather, time) {
  const tint = weather.color;
  for (const [px, py, size, strength] of weather.particles) {
    const x = width * wrap(px + time * weather.speed * (0.5 + size));
    const y = height * (weather.center + (py - 0.5) * 0.25 + Math.sin(time * 0.28 + px * TAU) * 0.028);
    const rx = width * (0.11 + size * 0.39);
    const ry = height * weather.width * (0.42 + size * 0.58);
    for (const cx of [x - width, x, x + width]) {
      ctx.save();
      ctx.translate(cx, y);
      ctx.scale(rx, ry);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, rgba(tint, weather.opacity * (0.42 + strength * 0.57)));
      gradient.addColorStop(0.52, rgba(tint, weather.opacity * 0.33));
      gradient.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }
}

export function paintForeground(ctx, width, height, weather, time) {
  if (weather.kind === "snow") paintSnow(ctx, width, height, weather, time);
  if (weather.kind === "fog") paintFog(ctx, width, height, weather, time);
}

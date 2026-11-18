import { atLateral, runoffWidth, sampleLine, samplePit } from './course.mjs';

const tau = Math.PI * 2;
const colors = {
  line: '#ffd186', pit: '#b6a4ef', drs: '#80e1a6',
  bridge: '#7ed3ed', runoff: '#dba984', prop: '#e5e9ee',
};

function series(from, to, step, at) {
  const count = Math.max(1, Math.ceil((to - from) / step));
  return Array.from({ length: count + 1 }, (_, i) => at(from + (to - from) * i / count));
}

function path(points, xy, close = false) {
  const line = new Path2D();
  for (const [i, point] of points.entries()) {
    const [x, y] = xy(point);
    if (i === 0) line.moveTo(x, y);
    else line.lineTo(x, y);
  }
  if (close) line.closePath();
  return line;
}

function stroke(ctx, line, color, width, dash = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke(line);
  ctx.setLineDash([]);
}

export function paintThumbnail(canvas, definition) {
  const ctx = canvas.getContext('2d');
  const xs = definition.points.map((point) => point[0]), zs = definition.points.map((point) => point[2]);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const w = Math.max(...xs) - minX, h = Math.max(...zs) - minZ;
  const scale = Math.min((canvas.width - 6) / w, (canvas.height - 6) / h);
  const x0 = (canvas.width - w * scale) / 2, y0 = (canvas.height + h * scale) / 2;
  ctx.lineJoin = 'round';
  stroke(ctx, path(definition.points, ([x, , z]) => [x0 + (x - minX) * scale, y0 - (z - minZ) * scale], true),
    definition.palette.accent, 2.65);
}

function background(ctx, w, h, palette) {
  const depth = ctx.createLinearGradient(0, 0, w * 0.85, h);
  depth.addColorStop(0, '#142031');
  depth.addColorStop(1, '#0b1520');
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.63, h * 0.43, 12, w * 0.63, h * 0.43, w * 0.66);
  glow.addColorStop(0, palette.horizon + '46');
  glow.addColorStop(1, palette.horizon + '06');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const grid = new Path2D();
  for (let x = 11.5; x < w; x += 25) { grid.moveTo(x, 0); grid.lineTo(x, h); }
  for (let y = 7.5; y < h; y += 25) { grid.moveTo(0, y); grid.lineTo(w, y); }
  stroke(ctx, grid, '#9fb6cd21', 0.65);

  const contours = new Path2D();
  for (const peak of [{ x: w * 0.19, y: h * 0.16, salt: 2.43 }, { x: w * 0.91, y: h * 0.82, salt: 1.08 }]) {
    for (let r = 23; r < h * 1.06; r += 12) {
      for (let i = 0; i < 110; i++) {
        const a = tau * i / 110;
        const dist = r * (1 + Math.sin(a * 3 + peak.salt) * 0.14 + Math.sin(a * 7 + r / 90) * 0.035);
        const x = peak.x + Math.cos(a) * dist * 1.38, y = peak.y + Math.sin(a) * dist;
        if (i === 0) contours.moveTo(x, y);
        else contours.lineTo(x, y);
      }
      contours.closePath();
    }
  }
  stroke(ctx, contours, palette.accent + '1b', 0.72);
}

export function createMap(canvas) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas'), layer = base.getContext('2d');
  let track, xy, origin, w = 1, h = 1, scale = 1, ratio = 1;

  function build() {
    if (!track) return;
    background(layer, w, h, track.palette);
    const props = track.roadside.map(({ s, lateralM }) => atLateral(track, s, lateralM));
    const points = [...track.points, ...props];
    const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const pad = { left: Math.min(102, w * 0.29), right: 20, top: 50, bottom: 18 };
    scale = Math.max(0.03, Math.min((w - pad.left - pad.right) / (x1 - x0 + 34), (h - pad.top - pad.bottom) / (z1 - z0 + 28)));
    origin = [(w + pad.left - pad.right) / 2 - (x0 + x1) / 2 * scale,
      (h + pad.top - pad.bottom) / 2 + (z0 + z1) / 2 * scale];
    xy = ({ x, z }) => [origin[0] + x * scale, origin[1] - z * scale];

    layer.lineJoin = layer.lineCap = 'round';
    const half = track.width / 2;
    const center = path(track.points, xy, true);
    stroke(layer, center, '#080e17', track.width * scale + 5.5);
    for (const zone of track.runoffs) {
      const inside = series(zone.from, zone.to, 2, (s) => atLateral(track, s, half * zone.side));
      const outside = series(zone.from, zone.to, 2, (s) => atLateral(track, s, (half + runoffWidth(zone, s)) * zone.side));
      const shoulder = path([...inside, ...outside.reverse()], xy, true);
      layer.fillStyle = colors.runoff + '9c';
      layer.fill(shoulder);
      stroke(layer, shoulder, colors.runoff, 0.85);
    }

    const pit = track.pitLane;
    const pitPath = path(series(pit.entryS, pit.exitS, 3, (s) => samplePit(track, s)), xy);
    stroke(layer, pitPath, '#493f65', pit.width * scale + 2.1);
    stroke(layer, pitPath, colors.pit, Math.max(0.9, pit.width * scale * 0.67));

    stroke(layer, center, '#8ca5b3', track.width * scale + 1.5);
    stroke(layer, center, '#293949', track.width * scale);

    for (const { from, to } of track.drsZones) {
      for (const sign of [-1, 1]) {
        const line = path(series(from, to, 2, (s) => atLateral(track, s, sign * (half - 0.65))), xy);
        stroke(layer, line, colors.drs, 1.35, [3.3, 2.3]);
      }
    }
    for (const span of track.bridges) {
      for (const sign of [-1, 1]) {
        const line = path(series(span.from, span.to, 2, (s) => atLateral(track, s, sign * span.deckWidthM / 2)), xy);
        stroke(layer, line, colors.bridge, 1.45);
      }
      for (const end of [span.from, span.to]) {
        for (const sign of [-1, 1]) {
          const line = path([atLateral(track, end, sign * (half - 1)), atLateral(track, end, sign * (half + 6))], xy);
          stroke(layer, line, colors.bridge, 1.25);
        }
      }
    }

    const racingLine = path(series(0, track.length, 2.5, (s) => sampleLine(track, s)), xy, true);
    stroke(layer, racingLine, '#151e28', 2.9);
    stroke(layer, racingLine, colors.line + 'e8', 1.25, [4.0, 2.2]);

    const flag = path([atLateral(track, 0, -half - 3), atLateral(track, 0, half + 3)], xy);
    stroke(layer, flag, '#101822', 3);
    stroke(layer, flag, '#f7faff', 1.4, [2, 1.5]);

    for (const p of props) {
      const [x, y] = xy(p);
      layer.beginPath();
      layer.moveTo(x, y - 2.6);
      layer.lineTo(x + 2.6, y);
      layer.lineTo(x, y + 2.6);
      layer.lineTo(x - 2.6, y);
      layer.closePath();
      layer.fillStyle = '#111c28';
      layer.fill();
      layer.strokeStyle = colors.prop;
      layer.lineWidth = 0.85;
      layer.stroke();
    }

    layer.textAlign = 'center';
    layer.font = '9px Arial';
    layer.fillStyle = '#bbcbd9';
    layer.fillText('N', 24, 18);
    layer.fillStyle = track.palette.accent;
    layer.beginPath();
    layer.moveTo(24, 22);
    layer.lineTo(20.5, 31.5);
    layer.lineTo(24, 29.5);
    layer.lineTo(27.5, 31.5);
    layer.closePath();
    layer.fill();

    const bar = new Path2D(), barEnd = 13 + 100 * scale;
    bar.moveTo(13, h - 17);
    bar.lineTo(13, h - 13);
    bar.lineTo(barEnd, h - 13);
    bar.lineTo(barEnd, h - 17);
    stroke(layer, bar, '#b5c5d4', 0.85);
    layer.fillStyle = '#d3dce6';
    layer.textAlign = 'left';
    layer.fillText('100 m', barEnd + 5, h - 11);
  }

  function resize(width, height, pixelRatio) {
    w = width;
    h = height;
    ratio = Math.min(2, pixelRatio);
    for (const surface of [canvas, base]) {
      surface.width = Math.max(1, Math.round(w * ratio));
      surface.height = Math.max(1, Math.round(h * ratio));
    }
    layer.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    build();
  }

  function draw(s) {
    if (!track || !xy) return;
    ctx.drawImage(base, 0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = s - 70 + i * 7;
      const segment = path(series(a, a + 7, 3, (d) => sampleLine(track, d)), xy);
      stroke(ctx, segment, colors.line + (35 + i * 20).toString(16).padStart(2, '0'), 2.8);
    }
    const [x, y] = xy(sampleLine(track, s));
    const [px, py] = xy(sampleLine(track, s + 3.6));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(py - y, px - x));
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, tau);
    ctx.fillStyle = '#162330dc';
    ctx.fill();
    ctx.strokeStyle = colors.line + 'a0';
    ctx.lineWidth = 0.82;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-3.6, 3.6);
    ctx.lineTo(-2.1, 0);
    ctx.lineTo(-3.6, -3.6);
    ctx.closePath();
    ctx.fillStyle = colors.line;
    ctx.fill();
    ctx.restore();
  }

  function pick(x, y) {
    if (!track || !origin) return 0;
    return track.project((x - origin[0]) / scale, (origin[1] - y) / scale).s;
  }

  return { resize, draw, pick, setCourse(course) { track = course; build(); } };
}

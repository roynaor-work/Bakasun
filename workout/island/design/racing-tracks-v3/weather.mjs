const fraction = (n) => n - Math.floor(n);

export function createAtmosphere(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 1, h = 1;

  function resize(width, height, screenScale) {
    w = width;
    h = height;
    const ratio = Math.min(2, screenScale);
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(preset, t) {
    ctx.clearRect(0, 0, w, h);
    const { effect, density, tint, cloudCover, windMps } = preset;
    if (effect === 'none') return;
    const haze = ctx.createLinearGradient(0, 0, 0, h);
    haze.addColorStop(0, tint + '00');
    const alpha = Math.round((effect === 'fog' || effect === 'dust' ? 0.31 : 0.20) * cloudCover * 255);
    haze.addColorStop(0.41, tint + alpha.toString(16).padStart(2, '0'));
    haze.addColorStop(0.92, tint + '00');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    if (effect === 'fog' || effect === 'heat') {
      const intensity = effect === 'fog' ? 0.15 : 0.13;
      for (let i = 0; i < 9; i++) {
        const x = fraction(i * 0.75487 + t * (0.009 + windMps * 0.0008)) * (w + 240) - 120;
        const y = h * (0.31 + 0.19 * Math.sin(i * 0.52));
        const spread = 60 + 35 * Math.cos(i * 0.5);
        const patch = ctx.createRadialGradient(x, y, 2, x, y, spread);
        patch.addColorStop(0, tint + Math.round(intensity * density * 255).toString(16).padStart(2, '0'));
        patch.addColorStop(1, tint + '00');
        ctx.fillStyle = patch;
        ctx.fillRect(x - spread, y - spread * 0.33, spread * 2, spread * 0.66);
      }
      return;
    }

    const amount = Math.ceil(density * (effect === 'dust' ? 110 : 145));
    ctx.lineCap = 'round';
    for (let i = 0; i < amount; i++) {
      const seed = fraction(i * 0.38231);
      const fall = effect === 'rain' ? 0.96 + seed : 0.11 + seed * 0.39;
      const lateral = effect === 'dust' ? 0.23 + windMps * 0.012 : 0.047 + windMps * 0.006;
      const x = fraction(i * 0.754877 + t * lateral) * (w + 10) - 5;
      const y = fraction(i * 0.56984 + t * fall) * (h + 13) - 6;
      if (effect === 'snow') {
        ctx.fillStyle = seed > 0.55 ? '#f4faffb8' : '#d5e5f07a';
        ctx.beginPath();
        ctx.arc(x + Math.sin(i + t * 2) * 2, y, 0.7 + seed * 1.1, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.strokeStyle = effect === 'rain' ? '#dceaf789' : '#ffd5a378';
      ctx.lineWidth = 0.58 + seed * 0.51;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (effect === 'dust' ? 7 : 2) * (0.5 + seed), y + (effect === 'dust' ? 1.6 : 8) * (0.5 + seed));
      ctx.stroke();
    }
  }

  return { resize, draw };
}

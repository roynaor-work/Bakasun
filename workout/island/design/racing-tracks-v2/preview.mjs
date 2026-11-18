// SPDX-License-Identifier: CC0-1.0; original diagnostic preview. See LICENSES.md.
const SVG_NS = 'http://www.w3.org/2000/svg';
const SCALE = 1.65;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, digits = 0) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('he-IL', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pct = v => `${fmt(v * 100, 1)}%`;
const seconds = v => Number.isFinite(Number(v)) ? `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}` : '—';
const byId = id => document.getElementById(id);
function svg(tag, attrs = {}, content) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (content !== undefined) el.textContent = content;
  return el;
}
function html(tag, attrs = {}, content) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (content !== undefined) el.textContent = content;
  return el;
}
function svgCoordinates(element, event) {
  const point = element.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(element.getScreenCTM().inverse());
}
function speedColor(ratio) {
  const stops = [[.55, [255, 119, 121]], [.75, [255, 182, 111]], [1, [115, 239, 198]]];
  const value = clamp(ratio, .55, 1);
  const [low, high] = value < .75 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const t = (value - low[0]) / (high[0] - low[0]);
  return `rgb(${low[1].map((v, i) => Math.round(v + (high[1][i] - v) * t)).join(',')})`;
}
function fit(samples, width, height, pad) {
  const xs = samples.map(p => p.x), zs = samples.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const factor = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxZ - minZ));
  const offsetX = (width - (maxX - minX) * factor) / 2, offsetZ = (height - (maxZ - minZ) * factor) / 2;
  return { factor, point: p => [offsetX + (p.x - minX) * factor, offsetZ + (p.z - minZ) * factor] };
}
function pathFor(samples, point, closed = false) {
  return samples.map((p, i) => `${i ? 'L' : 'M'}${point(p).map(v => v.toFixed(2)).join(',')}`).join('') + (closed ? 'Z' : '');
}
function asTracks(data) { return Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : []; }
function maxGrade(samples) {
  let grade = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i], b = samples[(i + 1) % samples.length];
    grade = Math.max(grade, Math.abs(b.y - a.y) / Math.max(1e-9, Math.hypot(b.x - a.x, b.z - a.z)));
  }
  return grade;
}
async function jsonFile(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function boot() {
  try {
    const [{ TRACKS }, { buildSpeedProfile }, layoutsData, measurements, { TRACKS: baseline }] = await Promise.all([
      import('./tracks.mjs'), import('./analysis.mjs'), jsonFile('layouts.json'), jsonFile('measurements.json').catch(() => ({})), import('../../minigames/racing-tracks.mjs'),
    ]);
    const layouts = new Map(asTracks(layoutsData).map(t => [t.id, t]));
    const state = { index: 0, tier: 0, model: 'ai', fraction: 0, playing: false, rate: 4, profiles: [], baselineProfiles: [], lastFrame: 0, mapPoint: null, marker: null, chartCursor: null, chartDot: null, chartBounds: {left:60,right:1090}, renderVersion: 0 };
    const measurementRows = asTracks(measurements).length ? asTracks(measurements) : (measurements.new || measurements.after || []);
    const findRecord = id => measurementRows.find?.(t => t.id === id) || measurements[id] || {};
    const profileAt = (profile, fraction) => profile.samples[Math.min(profile.samples.length - 1, Math.floor(clamp(fraction, 0, .999999) * profile.samples.length))];
    const rawLength = (definition, profile) => {
      const record = findRecord(definition.id), layout = layouts.get(definition.id);
      return record.rawLength ?? record.geometry?.length ?? layout?.length ?? profile.length / SCALE;
    };
    const getCorners = definition => layouts.get(definition.id)?.corners || [];
    const cornerFraction = (corner, definition, profile) => {
      const forward = clamp((corner.s ?? corner.apexS ?? 0) / rawLength(definition, profile), 0, 1);
      return state.tier === 3 ? (1 - forward) % 1 : forward;
    };
    const sampleAtCorner = (corner, definition, profile) => profileAt(profile, cornerFraction(corner, definition, profile));
    const lapFor = definition => {
      const record = findRecord(definition.id);
      const tierRecord = record.tiers?.find(t => t.tier === state.tier);
      if (tierRecord) {
        const sim = state.model === 'physical' ? tierRecord.physicalSimulation : tierRecord.simulation;
        return sim?.rollingLapSeconds ?? sim?.lapTimes?.at(-1);
      }
      const simulations = record.simulations || record.simulation || record.laps || {};
      const sim = Array.isArray(simulations) ? simulations.find(s => Number(s.tier ?? 0) === state.tier) : simulations[state.tier] || simulations[`tier${state.tier}`] || simulations;
      const times = sim?.lapTimes || record.lapTimes;
      return sim?.rollingLapSeconds ?? sim?.rollingLapTime ?? sim?.lapSeconds ?? (Array.isArray(times) ? times[times.length - 1] : undefined) ?? record.rollingLapSeconds;
    };
    const selected = () => ({ definition: TRACKS[state.index], profile: state.profiles[state.index], layout: layouts.get(TRACKS[state.index].id) });
    function drawMini(el, definition, active) {
      const rows = definition.points.map(([x, y, z]) => ({ x, y, z }));
      const transform = fit(rows, 170, 70, 6);
      el.replaceChildren(svg('path', { d: pathFor(rows, transform.point, true), fill: 'none', stroke: active ? '#73efc6' : '#708493', 'stroke-width': 2.3, 'stroke-linejoin': 'round' }));
    }
    function drawPicker() {
      byId('track-picker').replaceChildren(...TRACKS.map((definition, index) => {
        const button = html('button', { type: 'button', class: 'track-button', 'aria-pressed': index === state.index, 'data-track': definition.id });
        button.append(html('span', { class: 'track-number', dir: 'ltr' }, `CIRCUIT 0${index + 1}`));
        const miniature = svg('svg', { viewBox: '0 0 170 70', 'aria-hidden': true });
        drawMini(miniature, definition, index === state.index);
        button.append(miniature, html('strong', {}, definition.name), html('small', {}, `${fmt(rawLength(definition, state.profiles[index]))} מ׳ · ${getCorners(definition).length} פניות`));
        button.addEventListener('click', () => { state.index = index; state.fraction = 0; render(); });
        return button;
      }));
    }
    function drawMap() {
      const { definition, profile } = selected(), map = byId('track-map');
      const transform = fit(profile.samples, 820, 560, 70);
      state.mapPoint = transform.point;
      const group = svg('g');
      for (let x = 40; x < 820; x += 40) group.append(svg('line', { x1: x, y1: 25, x2: x, y2: 535, stroke: '#22343f', 'stroke-width': .7, opacity: .5 }));
      for (let y = 40; y < 560; y += 40) group.append(svg('line', { x1: 25, y1: y, x2: 795, y2: y, stroke: '#22343f', 'stroke-width': .7, opacity: .5 }));
      const roadWidth = Math.max(4, definition.width * transform.factor);
      group.append(svg('path', { d: pathFor(profile.samples, transform.point, true), stroke: '#9aaeb6', 'stroke-width': roadWidth + 2.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .52 }));
      profile.samples.forEach((a, i) => {
        const b = profile.samples[(i + 1) % profile.samples.length], [x1, y1] = transform.point(a), [x2, y2] = transform.point(b);
        group.append(svg('line', { x1, y1, x2, y2, stroke: speedColor(a.speed / profile.topSpeed), 'stroke-width': roadWidth, 'stroke-linecap': 'round' }));
      });
      profile.samples.forEach((a, i) => {
        const previous = profile.samples[(i + profile.samples.length - 1) % profile.samples.length];
        const recentlyBraking = Array.from({ length: Math.ceil(8 / profile.ds) }, (_, j) => profile.samples[(i - j - 1 + profile.samples.length) % profile.samples.length]).some(p => p.braking);
        if (a.braking && !previous.braking && !recentlyBraking) {
          const [x, y] = transform.point(a);
          group.append(svg('path', { d: `M${x},${y - 5}l5,5l-5,5l-5,-5Z`, fill: '#ff7779', stroke: '#111c28', 'stroke-width': 1.5 }));
        }
      });
      getCorners(definition).forEach((corner, i) => {
        const row = sampleAtCorner(corner, definition, profile), [x, y] = transform.point(row);
        const marker = svg('g', { 'data-corner': corner.id, tabindex: 0, role: 'button', 'aria-label': `${corner.label || `פנייה ${i + 1}`}: ${fmt(row.speed * 3.6)} קמ״ש` });
        marker.append(svg('circle', { cx: x, cy: y, r: 10, class: `marker-circle ${corner.type || ''}` }), svg('text', { x, y: y + 3.5, 'text-anchor': 'middle', class: 'corner-label', direction: 'ltr' }, i + 1));
        const go = () => { state.fraction = cornerFraction(corner, definition, profile); updateCursor(); };
        marker.addEventListener('click', event => { event.stopPropagation(); go(); });
        marker.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
        group.append(marker);
      });
      const start = profile.samples[0], [sx, sy] = transform.point(start);
      const startMarker = svg('g', { transform: `translate(${sx},${sy}) rotate(${-start.heading * 180 / Math.PI})` });
      startMarker.append(svg('rect', { x: -roadWidth / 2 - 3, y: -2, width: roadWidth + 6, height: 4, fill: '#effaf3', stroke: '#16252b', 'stroke-width': .7 }));
      group.append(startMarker);
      state.marker = svg('g');
      state.marker.append(svg('circle', { r: 14, fill: '#101b26', opacity: .8 }), svg('path', { d: 'M0,-11L7,7L0,3L-7,7Z', fill: '#f5fffb', stroke: '#111c28', 'stroke-width': 1.8 }));
      group.append(state.marker);
      const scaleM = 100, scalePx = scaleM * SCALE * transform.factor;
      group.append(svg('path', { d: `M35,520v5h${scalePx}v-5`, stroke: '#8da3b0', 'stroke-width': 1.5, fill: 'none' }), svg('text', { x: 35 + scalePx / 2, y: 544, 'text-anchor': 'middle', class: 'axis-label' }, '100 מ׳ לפני סקאלה'));
      map.replaceChildren(group);
    }
    function drawChart() {
      const { definition, profile } = selected(), chart = byId('speed-chart'), compact = innerWidth <= 760;
      const width = compact ? 460 : 1120, left = compact ? 42 : 60, right = width - 30, top = 20, bottom = 195;
      state.chartBounds = {left,right};
      chart.setAttribute('viewBox', `0 0 ${width} 240`);
      const length = rawLength(definition, profile), x = f => left + f * (right - left), y = v => bottom - v / profile.topSpeed * (bottom - top);
      const group = svg('g');
      for (let ratio = 0; ratio <= 1.001; ratio += .25) {
        const yy = y(ratio * profile.topSpeed);
        group.append(svg('line', { x1: left, y1: yy, x2: right, y2: yy, class: 'grid' }), svg('text', { x: left - 10, y: yy + 3, 'text-anchor': 'end', class: 'axis-label' }, fmt(ratio * profile.topSpeed * 3.6)));
      }
      const ticks = compact ? 4 : 5;
      for (let i = 0; i <= ticks; i++) {
        const xx = x(i / ticks);
        group.append(svg('line', { x1: xx, y1: top, x2: xx, y2: bottom, class: 'grid' }), svg('text', { x: xx, y: bottom + 21, 'text-anchor': 'middle', class: 'axis-label' }, fmt(length * i / ticks)));
      }
      group.append(svg('text', { x: left - 12, y: 11, 'text-anchor': 'end', class: 'chart-caption' }, 'קמ״ש'), svg('text', { x: right, y: 235, 'text-anchor': 'end', class: 'chart-caption' }, 'מטרים מתחילת ההקפה, לפני הסקאלה'));
      const rows = profile.samples, point = (row, i) => [x(i / rows.length), y(row.speed)];
      const ideal = rows.map((r, i) => `${i ? 'L' : 'M'}${point(r, i).join(',')}`).join('');
      group.append(svg('path', { d: `${ideal}L${x(1)},${y(rows[0].speed)}L${right},${bottom}L${left},${bottom}Z`, fill: '#73efc6', opacity: .07 }));
      rows.forEach((row, i) => {
        if (row.braking) group.append(svg('rect', { x: x(i / rows.length), y: top, width: Math.max(1, (right - left) / rows.length), height: bottom - top, fill: '#ff7779', opacity: .08 }));
      });
      group.append(svg('line', { x1: left, x2: right, y1: y(profile.topSpeed * .85), y2: y(profile.topSpeed * .85), stroke: '#ffb66f', 'stroke-width': 1, 'stroke-dasharray': '5 5', opacity: .7 }));
      const cap = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i / rows.length)},${y(Math.min(profile.topSpeed, r.cornerCap ?? profile.topSpeed))}`).join('');
      group.append(svg('path', { d: cap, fill: 'none', stroke: '#718491', 'stroke-width': 1.3, opacity: .8 }), svg('path', { d: ideal, fill: 'none', stroke: '#73efc6', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
      getCorners(definition).forEach((corner, i) => {
        const xx = x(cornerFraction(corner, definition, profile));
        group.append(svg('text', { x: xx, y: top + 11, 'text-anchor': 'middle', 'font-size': 9, fill: '#c9d5db', direction: 'ltr' }, `T${i + 1}`));
      });
      state.chartCursor = svg('line', { x1: left, x2: left, y1: top, y2: bottom, class: 'cursor-line' });
      state.chartDot = svg('circle', { cx: left, cy: bottom, r: 4, fill: '#f1fffa', stroke: '#73efc6', 'stroke-width': 2 });
      group.append(state.chartCursor, state.chartDot);
      chart.replaceChildren(group);
    }
    function drawFacts() {
      const { definition, profile, layout } = selected(), corners = getCorners(definition);
      const sharp = corners.filter(c => c.type === 'sharp' || c.type === 'hairpin').length;
      const facts = [['אורך הקפה', `${fmt(rawLength(definition, profile))} מ׳`], ['רוחב כביש', `${fmt(definition.width * (1 - state.tier * .025), 1)} מ׳`], ['פניות', `${corners.length} / ${sharp} חדות`], ['סיכת ראש', `${corners.filter(c => c.type === 'hairpin').length}`], ['שיקאנה', `${layout?.chicanes?.length ?? 0}`], ['זמן לפי הפרופיל', seconds(profile.idealLapSeconds)]];
      byId('track-facts').replaceChildren(...facts.map(([label, value]) => { const item = html('div'); item.append(html('dt', {}, label), html('dd', {}, value)); return item; }));
      const metrics = [[profile.under85Fraction >= .4, 'מרחק מתחת ל־85% מהשיא', pct(profile.under85Fraction), 'היעד: לפחות 40% מאורך ההקפה'], [profile.over95Fraction <= .25, 'מרחק מעל 95% מהשיא', pct(profile.over95Fraction), 'היעד: לכל היותר 25% מאורך ההקפה'], [true, 'טווח מהירות בפרופיל', `${fmt(profile.minSpeed * 3.6)}–${fmt(profile.maxSpeed * 3.6)}`, 'קמ״ש לאורך ההקפה'], [true, 'הקפת שחקן טוב', seconds(lapFor(definition)), 'מדידה הדלסית במנוע הפיזיקה']];
      byId('metrics-strip').replaceChildren(...metrics.map(([pass, title, value, note]) => { const el = html('div', { class: `metric ${pass ? 'pass' : 'fail'}` }); el.append(html('span', {}, title), html('strong', { dir: 'ltr' }, value), html('small', {}, note)); return el; }));
    }
    function drawCorners() {
      const { definition, profile } = selected();
      const names = { sharp: 'פנייה חדה', hairpin: 'סיכת ראש', bend: 'פנייה', chicane: 'שיקאנה' };
      byId('corners').replaceChildren(...getCorners(definition).map((corner, i) => {
        const row = sampleAtCorner(corner, definition, profile), button = html('button', { type: 'button', class: 'corner-button', 'aria-pressed': false, 'data-corner': corner.id });
        const heading = html('strong', {}, `T${i + 1} · ${names[corner.type] || 'פנייה'}`);
        const left = (corner.hand === 'left') !== (state.tier === 3);
        heading.append(html('span', {}, left ? 'שמ׳' : 'ימ׳'));
        button.append(heading, html('small', {}, `${fmt(cornerFraction(corner, definition, profile) * rawLength(definition, profile))} מ׳ · R${fmt(corner.radius, 1)}`), html('small', {}, `${fmt(row.speed * 3.6)} קמ״ש · ${pct(1 - row.speed / profile.topSpeed)} מתחת לשיא`));
        button.addEventListener('click', () => { state.fraction = cornerFraction(corner, definition, profile); updateCursor(); });
        return button;
      }));
    }
    function drawTable() {
      byId('table-tier').textContent = `רמה ${state.tier + 1} · ${state.model === 'ai' ? 'יעד aiCorner' : 'תקרת היגוי'} · Vmax ${fmt(state.profiles[0].topSpeed * 3.6)} קמ״ש`;
      byId('comparison').replaceChildren(...TRACKS.map((definition, i) => {
        const profile = state.profiles[i], base = state.baselineProfiles[i], row = html('tr', { class: i === state.index ? 'selected' : '', 'data-track': definition.id, tabindex: 0 });
        const cells = [[definition.name], [`${fmt(rawLength(definition, profile))} מ׳`], [getCorners(definition).length], [pct(profile.under85Fraction), profile.under85Fraction >= .4 ? 'pass-text' : 'fail-text'], [pct(profile.over95Fraction), profile.over95Fraction <= .25 ? 'pass-text' : 'fail-text'], [base ? pct(base.under85Fraction) : '—'], [seconds(profile.idealLapSeconds)], [seconds(lapFor(definition))], [pct(findRecord(definition.id).geometry?.maxGrade ?? maxGrade(profile.samples) * SCALE)]];
        row.append(...cells.map(([content, className]) => html('td', className ? { class: className } : {}, content)));
        const go = () => { state.index = i; state.fraction = 0; render(); };
        row.addEventListener('click', go);
        row.addEventListener('keydown', event => { if (event.key === 'Enter') go(); });
        return row;
      }));
    }
    function updateCursor() {
      const { definition, profile } = selected(), row = profileAt(profile, state.fraction);
      byId('current-speed').textContent = fmt(row.speed * 3.6);
      byId('current-distance').textContent = `${fmt(state.fraction * rawLength(definition, profile))} מ׳`;
      byId('current-ratio').textContent = pct(row.speed / profile.topSpeed);
      byId('scrubber').value = String(Math.round(state.fraction * 10000));
      const next = profileAt(profile, (state.fraction + 1 / profile.samples.length) % 1);
      const braking = row.braking || next.speed < row.speed - .02;
      byId('drive-phase').textContent = braking ? 'בלימה' : row.speed < profile.topSpeed * .95 ? 'האצה / פנייה' : 'מהירות גבוהה';
      byId('drive-phase').className = `phase${braking ? ' braking' : ''}`;
      const [x, y] = state.mapPoint(row);
      state.marker.setAttribute('transform', `translate(${x},${y}) rotate(${180 - row.heading * 180 / Math.PI})`);
      const chartX = state.chartBounds.left + state.fraction * (state.chartBounds.right - state.chartBounds.left), chartY = 195 - row.speed / profile.topSpeed * 175;
      state.chartCursor.setAttribute('x1', chartX); state.chartCursor.setAttribute('x2', chartX);
      state.chartDot.setAttribute('cx', chartX); state.chartDot.setAttribute('cy', chartY);
      const corners = getCorners(definition);
      const nearest = corners.reduce((best, c) => {
        const d = Math.abs(cornerFraction(c, definition, profile) - state.fraction), distance = Math.min(d, 1 - d);
        return distance < best.distance ? { id: c.id, distance } : best;
      }, { id: '', distance: Infinity });
      for (const button of byId('corners').children) button.setAttribute('aria-pressed', nearest.distance < .025 && button.dataset.corner === nearest.id ? 'true' : 'false');
    }
    function render() {
      byId('track-name').textContent = selected().definition.name + (state.tier === 3 ? ' · כיוון הפוך' : '');
      byId('profile-title').textContent = state.model === 'ai' ? 'פרופיל יעד לפי aiCorner' : 'פרופיל לפי תקרת ההיגוי של השחקן';
      drawPicker(); drawMap(); drawChart(); drawFacts(); drawCorners(); drawTable(); updateCursor();
      state.renderVersion++;
    }
    async function recalculate() {
      byId('loading').hidden = false;
      const lateralAcceleration = state.model === 'ai' ? 'ai' : 44;
      state.profiles = await Promise.all(TRACKS.map(track => buildSpeedProfile(track, { tier: state.tier, scale: SCALE, step: 2, lateralAcceleration })));
      state.baselineProfiles = await Promise.all(baseline.map(track => buildSpeedProfile(track, { tier: state.tier, scale: 1, step: 2, lateralAcceleration })));
      byId('loading').hidden = true;
      render();
    }
    byId('tier').addEventListener('change', async event => {
      state.tier = Number(event.target.value);
      try { await recalculate(); } catch (error) { showError(error); }
    });
    byId('model').addEventListener('change', async event => {
      state.model = event.target.value;
      try { await recalculate(); } catch (error) { showError(error); }
    });
    byId('scrubber').addEventListener('input', event => { state.fraction = Number(event.target.value) / 10000; updateCursor(); });
    byId('play').addEventListener('click', () => {
      state.playing = !state.playing;
      byId('play').setAttribute('aria-pressed', String(state.playing));
      byId('play').textContent = state.playing ? 'השהיה' : 'ניגון הקפה';
    });
    byId('playback-rate').addEventListener('change', event => { state.rate = Number(event.target.value); });
    byId('speed-chart').addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' && !event.buttons) return;
      const { x } = svgCoordinates(event.currentTarget, event);
      const {left,right} = state.chartBounds;
      if (x >= left && x <= right) { state.fraction = clamp((x - left) / (right - left), 0, .999999); updateCursor(); }
    });
    byId('speed-chart').addEventListener('click', event => {
      const { x } = svgCoordinates(event.currentTarget, event);
      const {left,right} = state.chartBounds;
      state.fraction = clamp((x - left) / (right - left), 0, .999999); updateCursor();
    });
    byId('track-map').addEventListener('click', event => {
      const { x: px, y: py } = svgCoordinates(event.currentTarget, event);
      const profile = selected().profile;
      let nearest = 0, best = Infinity;
      profile.samples.forEach((row, i) => { const [x, y] = state.mapPoint(row), d = (x - px) ** 2 + (y - py) ** 2; if (d < best) { best = d; nearest = i; } });
      state.fraction = nearest / profile.samples.length; updateCursor();
    });
    await recalculate();
    byId('app').hidden = false;
    addEventListener('resize', () => { drawChart(); updateCursor(); });
    // A narrow read-only surface supports browser verification without changing application state.
    globalThis.__racingTracksPreview = { get trackId() { return TRACKS[state.index].id; }, get tier() { return state.tier; }, get model() { return state.model; }, get renderVersion() { return state.renderVersion; }, get fraction() { return state.fraction; }, get profiles() { return state.profiles; }, trackCount: TRACKS.length };
    function frame(now) {
      const dt = Math.min(.1, Math.max(0, (now - state.lastFrame) / 1000)); state.lastFrame = now;
      if (state.playing && !document.hidden) {
        const profile = selected().profile, row = profileAt(profile, state.fraction);
        state.fraction = (state.fraction + row.speed * dt * state.rate / profile.length) % 1;
        updateCursor();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (error) { showError(error); }
}
function showError(error) {
  byId('loading').hidden = true;
  const notice = byId('error'); notice.hidden = false;
  notice.textContent = `לא ניתן לטעון את התצוגה. פתחו את preview.html דרך שרת HTTP מקומי משורש המאגר, וודאו שקובצי המסירה נמצאים באותה תיקייה. פרטים: ${error.message || error}`;
  console.error(error);
}
if (typeof document !== 'undefined') boot();

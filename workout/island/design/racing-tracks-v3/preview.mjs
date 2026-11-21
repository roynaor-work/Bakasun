import { createTrack, racingAngle } from '../../minigames/racing-tracks.mjs';
import { inRange, trackIds, wrapDistance } from './course.mjs';
import { createMap, paintThumbnail } from './map.mjs';
import { createAtmosphere } from './weather.mjs';

const byId = (id) => document.getElementById(id);
const controls = {
  circuits: byId('circuits'),
  weather: byId('weather'),
  play: byId('play'),
  progress: byId('progress'),
  distance: byId('distance'),
  heading: byId('route-name'),
  metrics: byId('route-metrics'),
  speed: byId('speed'),
  drs: byId('drs'),
  status: byId('scene-status'),
  error: byId('error'),
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const mapCanvas = byId('map'), chaseCanvas = byId('chase');
const map = createMap(mapCanvas);
const atmosphere = createAtmosphere(byId('atmosphere'));
const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const km = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let track, weather, chase, buttons;
let s = 0, elapsed = 0, playing = false, frame, previous = 0, selection = 0;

function speedAt(distance, drsAvailable) {
  const a = track.sample(distance - 4), b = track.sample(distance + 13);
  const bend = Math.abs(racingAngle(b.heading - a.heading)) / 17;
  const cap = (drsAvailable ? 49 : 44) * Math.sqrt(weather.grip);
  return Math.min(cap, Math.sqrt(26 * weather.grip / Math.max(0.001, bend)));
}

function isDrsAt(distance) {
  return weather.drsEnabled && track.drsZones.some((zone) => inRange(distance, zone, track.length));
}

function resize() {
  const mapSize = mapCanvas.getBoundingClientRect();
  const { clientWidth: chaseWidth, clientHeight: chaseHeight } = chaseCanvas.parentElement;
  map.resize(mapSize.width, mapSize.height, devicePixelRatio);
  chase?.resize(chaseWidth, chaseHeight, devicePixelRatio);
  atmosphere.resize(chaseWidth, chaseHeight, devicePixelRatio);
  requestDraw();
}

function frameAt(now) {
  frame = undefined;
  if (!track) return;
  const dt = Math.min(0.07, (now - (previous || now)) / 1000);
  previous = now;
  if (playing) {
    elapsed += dt;
    s = wrapDistance(s + speedAt(s, isDrsAt(s)) * dt, track.length);
  }

  const drsAvailable = isDrsAt(s);
  const position = number.format(s), total = number.format(track.length);
  controls.progress.value = Math.round(s / track.length * 1000);
  controls.progress.style.setProperty('--progress', `${s / track.length * 100}%`);
  controls.progress.setAttribute('aria-valuetext', `${position} מתוך ${total} מטרים`);
  controls.distance.textContent = `${position} / ${total} מ׳`;
  controls.speed.textContent = Math.round(speedAt(s, drsAvailable) * 3.6);
  controls.drs.dataset.state = drsAvailable ? 'active' : weather.drsEnabled ? 'ready' : 'off';
  const drsLabel = drsAvailable ? 'DRS פעיל' : weather.drsEnabled ? 'DRS מוכן' : 'DRS כבוי במזג אוויר זה';
  controls.drs.textContent = weather.drsEnabled ? 'DRS' : 'DRS ×';
  controls.drs.title = drsLabel;
  controls.drs.setAttribute('aria-label', drsLabel);
  map.draw(s);
  chase?.draw(s);
  atmosphere.draw(weather, elapsed);
  if (playing) requestDraw();
}

function requestDraw() {
  if (frame === undefined) frame = requestAnimationFrame(frameAt);
}

function setPlaying(value) {
  playing = value;
  previous = 0;
  const title = playing ? 'השהה הקפה' : 'נגן הקפה';
  controls.play.setAttribute('aria-label', title);
  controls.play.setAttribute('aria-pressed', String(playing));
  controls.play.title = title;
  requestDraw();
}

function setWeather(id) {
  weather = track.weather.find((preset) => preset.id === id) ?? track.weather[0];
  controls.weather.value = weather.id;
  chase?.setWeather(weather);
  requestDraw();
}

function loadScenery() {
  if (!chase) return;
  const token = ++selection;
  controls.status.textContent = 'טוען תפאורה…';
  chaseCanvas.dataset.ready = 'loading';
  chase.setCourse(track).then((ok) => {
    if (selection !== token) return;
    controls.status.textContent = ok ? '' : 'חלק מהתפאורה לא נטען';
    chaseCanvas.dataset.ready = ok ? 'true' : 'partial';
    requestDraw();
  }).catch(() => {
    if (selection !== token) return;
    chase = null;
    chaseCanvas.dataset.ready = 'unavailable';
    chaseCanvas.hidden = true;
    controls.status.textContent = 'מצלמת המרדף אינה זמינה';
    requestDraw();
  });
  chase.setWeather(weather);
}

function show(definition) {
  track = createTrack(definition);
  s = 18;
  previous = 0;
  elapsed = 0;
  for (const [id, button] of buttons) button.setAttribute('aria-current', String(id === track.id));
  controls.heading.textContent = track.name;
  controls.metrics.textContent = `${km.format(track.length / 1000)} ק״מ · ${track.corners.length} פניות`;
  document.documentElement.style.setProperty('--accent', track.palette.accent);
  chaseCanvas.parentElement.style.setProperty('--scene-sky', `url("${new URL(track.sky.asset, import.meta.url).href}")`);
  controls.weather.replaceChildren(...track.weather.map(({ label, id }) => new Option(label, id)));
  map.setCourse(track);
  setWeather(track.weather[0].id);
  loadScenery();
}

function seek(value) {
  if (!track) return;
  setPlaying(false);
  s = Math.max(0, Math.min(value, track.length));
  requestDraw();
}

async function start() {
  const definitions = await Promise.all(trackIds.map(async (id) => {
    const response = await fetch(`tracks/${id}.json`);
    if (!response.ok) throw new Error(`${id}: ${response.status}`);
    return response.json();
  }));

  buttons = new Map(definitions.map((definition) => {
    const button = document.createElement('button');
    button.className = 'circuit';
    button.type = 'button';
    button.dataset.track = definition.id;
    const thumb = document.createElement('canvas');
    thumb.width = 56;
    thumb.height = 40;
    thumb.setAttribute('aria-hidden', 'true');
    paintThumbnail(thumb, definition);
    button.append(thumb, definition.themeLabel);
    button.addEventListener('click', () => {
      if (track.id !== definition.id) show(definition);
    });
    controls.circuits.append(button);
    return [definition.id, button];
  }));

  controls.weather.disabled = controls.progress.disabled = controls.play.disabled = false;
  controls.weather.addEventListener('change', () => setWeather(controls.weather.value));
  controls.play.addEventListener('click', () => {
    if (!playing && s >= track.length) s = 0;
    setPlaying(!playing);
  });
  controls.progress.addEventListener('input', () => seek(track.length * Number(controls.progress.value) / 1000));
  mapCanvas.addEventListener('pointerup', ({ clientX, clientY }) => {
    const { left, top } = mapCanvas.getBoundingClientRect();
    seek(map.pick(clientX - left, clientY - top));
  });
  reduce.addEventListener('change', ({ matches }) => {
    if (matches) setPlaying(false);
  });
  const observer = new ResizeObserver(resize);
  observer.observe(mapCanvas.parentElement);
  observer.observe(chaseCanvas.parentElement);
  show(definitions[0]);
  resize();
  setPlaying(false);

  try {
    const { createChase } = await import('./scene.mjs');
    chase = createChase(chaseCanvas);
    resize();
    loadScenery();
  } catch {
    chaseCanvas.dataset.ready = 'unavailable';
    chaseCanvas.hidden = true;
    controls.status.textContent = 'מצלמת המרדף אינה זמינה';
    requestDraw();
  }
}

start().catch((error) => {
  controls.heading.textContent = 'טעינת המסלולים נכשלה';
  controls.error.hidden = false;
  controls.error.textContent = 'יש לפתוח את התצוגה דרך השרת המקומי ולוודא שקובצי המסלולים זמינים.';
  console.error(error);
});

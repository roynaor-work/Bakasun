// SPDX-License-Identifier: CC0-1.0
import * as THREE from "three";
import { GLTFLoader } from "../alpine-runner-v1/vendor/GLTFLoader.js";
import { makeWeather, paintForeground, paintGlow } from "./weather.mjs";

const byId = (id) => document.getElementById(id);
const stage = byId("stage");
const status = byId("status");
const themes = byId("themes");
const slider = byId("distance");
const play = byId("play");
const weatherToggle = byId("weather-toggle");
const background = byId("backdrop");
const atmosphere = byId("atmosphere");
const backgroundContext = background.getContext("2d");
const atmosphereContext = atmosphere.getContext("2d");
const root = document.querySelector(".review");
const loader = new GLTFLoader();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(51, 1, 0.1, 155);
const ambient = new THREE.HemisphereLight("#f4f9df", "#6a8d90", 2.03);
const sun = new THREE.DirectionalLight("#ffe7b7", 2.35);
const fill = new THREE.DirectionalLight("#bee2ed", 0.73);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -19, right: 19, bottom: -16, top: 16, near: 3, far: 55 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.normalBias = 0.062;
fill.position.set(-8, 4, 9);
scene.add(ambient, sun, sun.target, fill);
scene.fog = new THREE.Fog("#a8bfbd", 38, 108);

let renderer, manifest, mixer, skier, shadow, active, pending;
let width = 1, height = 1, distance = 0, weatherVisible = true, raf = 0, lastStamp;
let lastProgress = -1, lastTile = -1;
const parameters = new URLSearchParams(location.search);
const rate = 19;

async function fetchFile(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} · ${path}`);
  return response;
}

async function jsonFile(path, signal) {
  return (await fetchFile(path, signal)).json();
}

async function modelFile(path, signal) {
  const bytes = await (await fetchFile(path, signal)).arrayBuffer();
  return loader.parseAsync(bytes, "");
}

async function imageFile(path, signal) {
  const blob = await (await fetchFile(path, signal)).blob();
  return createImageBitmap(blob);
}

function releaseModels(models) {
  const geometries = new Set();
  const materials = new Set();
  for (const model of models) {
    model.scene.traverse((object) => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      for (const material of [object.material].flat()) materials.add(material);
    });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function makeSkierShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, "rgba(14,35,62,.66)");
  gradient.addColorStop(0.46, "rgba(14,35,62,.39)");
  gradient.addColorStop(1, "rgba(14,35,62,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const result = new THREE.Mesh(new THREE.PlaneGeometry(2.00, 3.30),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.36 }));
  result.rotation.x = -Math.PI / 2;
  return result;
}

async function loadTheme(theme, signal) {
  const modelEntries = [
    ...theme.tiles.map((item) => [`tile:${item.id}`, item.path]),
    ...theme.props.map((item) => [`prop:${item.id}`, item.path]),
    ...Object.entries(theme.signs).map(([key, item]) => [`gate:${key}`, item.path]),
  ];
  const tasks = [
    ...modelEntries.map(([, path]) => modelFile(path, signal)),
    ...theme.parallax.map((item) => imageFile(item.path, signal)),
    jsonFile(theme.weather.path, signal),
  ];
  const settled = await Promise.allSettled(tasks);
  const models = settled.slice(0, modelEntries.length);
  const images = settled.slice(modelEntries.length, -1);
  const failure = settled.find((result) => result.status === "rejected");
  if (failure || signal.aborted) {
    releaseModels(models.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
    for (const image of images) if (image.status === "fulfilled") image.value.close();
    throw failure?.reason ?? signal.reason;
  }

  const templates = new Map(modelEntries.map(([key], i) => {
    const template = models[i].value.scene;
    template.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = !key.startsWith("tile:") || key === "tile:ice_tunnel";
      object.receiveShadow = true;
    });
    return [key, template];
  }));
  const course = new THREE.Group();
  const tiles = theme.tiles.map((item) => {
    const group = new THREE.Group();
    group.position.z = item.startMeters;
    group.add(templates.get(`tile:${item.id}`));
    for (const placement of item.placements) {
      const prop = templates.get(`prop:${placement.prop}`).clone();
      prop.position.fromArray(placement.position);
      prop.rotation.y = placement.yawRadians;
      group.add(prop);
    }
    course.add(group);
    return group;
  });
  for (const [key, item] of Object.entries(theme.signs)) {
    const gate = templates.get(`gate:${key}`);
    gate.position.fromArray(item.position);
    course.add(gate);
  }
  // Leave a runway under the follow camera at either course endpoint.
  const length = manifest.coordinates.tileLengthMeters;
  const finish = manifest.coordinates.courseLengthMeters;
  for (const z of [-length, finish, finish + length]) {
    const extension = templates.get("tile:straight").clone();
    extension.position.z = z;
    course.add(extension);
  }
  return { theme, course, tiles, models: models.map((result) => result.value),
    images: images.map((result) => result.value), weather: makeWeather(settled.at(-1).value) };
}

function lighting(theme) {
  const { sky, ground, sun: sunlight, rim, fog } = theme.lighting;
  ambient.color.set(sky);
  ambient.groundColor.set(ground);
  sun.color.set(sunlight);
  fill.color.set(rim);
  scene.fog.color.set(fog);
  ambient.intensity = theme.id === "aurora" ? 1.48 : 2.03;
  sun.intensity = theme.id === "aurora" ? 1.46 : 2.35;
  fill.intensity = theme.id === "aurora" ? 1.06 : 0.73;
}

function controlState(loading, message) {
  stage.setAttribute("aria-busy", String(loading));
  status.textContent = message;
  status.hidden = !message;
  play.disabled = slider.disabled = weatherToggle.disabled = loading || !active;
}

async function selectTheme(id) {
  if (pending?.id === id) return;
  if (pending) {
    pending.controller.abort();
    pending = null;
  }
  if (active?.theme.id === id) {
    controlState(false, "");
    return;
  }
  const theme = manifest.themes.find((candidate) => candidate.id === id);
  if (!theme) return;
  const request = { id, controller: new AbortController() };
  pending = request;
  stop();
  controlState(true, `טוענים את ${theme.title}…`);
  try {
    const pack = await loadTheme(theme, request.controller.signal);
    if (pending !== request) {
      releaseModels(pack.models);
      for (const image of pack.images) image.close();
      return;
    }
    if (active) {
      scene.remove(active.course);
      releaseModels(active.models);
      for (const image of active.images) image.close();
    }
    active = pack;
    scene.add(pack.course);
    lighting(theme);
    root.style.setProperty("--accent", theme.accent);
    byId("scene-name").textContent = theme.title;
    byId("scene-weather").textContent = theme.weather.label;
    for (const button of themes.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.theme === id));
    }
    stage.dataset.theme = id;
    lastProgress = lastTile = -1;
    draw();
    controlState(false, "");
  } catch (error) {
    if (pending !== request) return;
    console.error(error);
    controlState(false, "טעינת הערכה נכשלה. לחצו על ערכה כדי לנסות שוב.");
  } finally {
    if (pending === request) pending = null;
  }
}

function sample(point) {
  const { centerlineSamples, tileLengthMeters } = manifest.coordinates;
  const tiles = active.theme.tiles;
  const index = Math.max(0, Math.min(tiles.length - 1, Math.floor(point / tileLengthMeters)));
  const local = THREE.MathUtils.clamp(point - index * tileLengthMeters, 0, tileLengthMeters);
  const samples = centerlineSamples[tiles[index].id];
  const row = local * (samples.length - 1) / tileLengthMeters;
  const low = samples[Math.floor(row)];
  const high = samples[Math.ceil(row)];
  const fraction = row % 1;
  return { x: THREE.MathUtils.lerp(low[1], high[1], fraction),
    y: THREE.MathUtils.lerp(low[2], high[2], fraction),
    dx: THREE.MathUtils.lerp(low[3], high[3], fraction), index };
}

function drawLayer(ctx, layer, image, x) {
  const tileWidth = Math.max(Math.round(width * 1.17), Math.round(height * image.width / image.height));
  const offset = Math.round((tileWidth - width) / 2 +
    (distance * layer.pixelsPerMeter + x * layer.cameraOffsetFactor) * width / layer.referenceViewportWidth);
  const start = -((offset % tileWidth + tileWidth) % tileWidth);
  for (let left = start; left < width; left += tileWidth) {
    ctx.drawImage(image, left, 0, tileWidth, height);
  }
}

function updateProgress(ground) {
  const progress = Math.floor(distance);
  if (progress !== lastProgress) {
    const total = manifest.coordinates.courseLengthMeters;
    slider.value = progress;
    slider.style.setProperty("--progress", `${progress / total * 100}%`);
    slider.setAttribute("aria-valuetext", `${progress} מתוך ${total} מטר`);
    byId("metres").textContent = `${progress} / ${total}`;
    lastProgress = progress;
  }
  if (ground.index !== lastTile) {
    byId("tile-name").textContent = active.theme.tiles[ground.index].label;
    byId("tile-number").textContent = `${String(ground.index + 1).padStart(2, "0")} / 08`;
    stage.dataset.tile = active.theme.tiles[ground.index].id;
    lastTile = ground.index;
  }
}

function draw() {
  if (!active) return;
  const ground = sample(distance);
  const look = sample(distance + 12);
  const time = distance / rate;
  const wander = Math.sin(distance * 0.115) * 0.67 + Math.sin(distance * 0.29) * 0.18;
  skier.position.set(ground.x + wander, ground.y + 0.058, distance);
  skier.rotation.y = Math.atan(ground.dx + Math.cos(distance * 0.115) * 0.064);
  shadow.position.set(skier.position.x, ground.y + 0.066, distance + 0.31);
  mixer.setTime(time);
  camera.fov = width / height > 2.5 ? 49 : 54;
  camera.updateProjectionMatrix();
  camera.position.set(ground.x + wander * 0.32, ground.y + 3.58, distance - 8.2);
  camera.lookAt(look.x + wander * 0.13, look.y + 0.77, distance + 15.0);
  sun.target.position.set(ground.x, ground.y, distance + 8);
  sun.position.set(ground.x + 14, ground.y + 20, distance - 2);
  for (const tile of active.tiles) {
    tile.visible = tile.position.z > distance - 45 && tile.position.z < distance + 112;
  }

  const { parallax } = active.theme;
  drawLayer(backgroundContext, parallax[0], active.images[0], camera.position.x);
  if (weatherVisible && active.weather.kind === "glow") {
    paintGlow(backgroundContext, width, height, active.weather, time);
  }
  for (let i = 1; i < parallax.length; i++) {
    drawLayer(backgroundContext, parallax[i], active.images[i], camera.position.x);
  }
  renderer.render(scene, camera);
  atmosphereContext.clearRect(0, 0, width, height);
  if (weatherVisible) paintForeground(atmosphereContext, width, height, active.weather, time);
  updateProgress(ground);
}

function resize() {
  width = stage.clientWidth;
  height = stage.clientHeight;
  if (width < 1 || height < 1) return;
  const scale = Math.min(window.devicePixelRatio || 1, 1.6);
  renderer.setPixelRatio(scale);
  renderer.setSize(width, height, false);
  for (const [canvas, ctx] of [[background, backgroundContext], [atmosphere, atmosphereContext]]) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  }
  camera.aspect = width / height;
  draw();
}

function setPlaying(playing) {
  play.dataset.playing = String(playing);
  byId("play-label").textContent = playing ? "השהיה" : "גלישה";
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastStamp = undefined;
  setPlaying(false);
}

function tick(stamp) {
  const total = manifest.coordinates.courseLengthMeters;
  if (lastStamp !== undefined) distance = Math.min(total, distance + Math.min(0.08, (stamp - lastStamp) / 1000) * rate);
  draw();
  lastStamp = stamp;
  if (distance < total) raf = requestAnimationFrame(tick);
  else stop();
}

play.addEventListener("click", () => {
  if (raf) {
    stop();
    return;
  }
  if (distance >= manifest.coordinates.courseLengthMeters) distance = 0;
  setPlaying(true);
  raf = requestAnimationFrame(tick);
});

slider.addEventListener("input", () => {
  stop();
  distance = slider.valueAsNumber;
  draw();
});

weatherToggle.addEventListener("click", () => {
  weatherVisible = !weatherVisible;
  weatherToggle.setAttribute("aria-pressed", String(weatherVisible));
  draw();
});

async function start() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: byId("world"), antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance",
    });
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    manifest = await jsonFile("manifest.json");
    const skierAsset = await modelFile(manifest.preview.localV1Dependencies.find((path) => path.endsWith("skier-coral.glb")));
    skier = skierAsset.scene;
    skier.traverse((object) => {
      if (object.isMesh) object.castShadow = true;
    });
    mixer = new THREE.AnimationMixer(skier);
    mixer.clipAction(THREE.AnimationClip.findByName(skierAsset.animations, "glide")).play();
    shadow = makeSkierShadow();
    scene.add(skier, shadow);

    const total = manifest.coordinates.courseLengthMeters;
    slider.max = total;
    distance = THREE.MathUtils.clamp(Number(parameters.get("at")) || 0, 0, total);
    for (const theme of manifest.themes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme";
      button.dataset.theme = theme.id;
      button.textContent = theme.label;
      button.style.setProperty("--swatch", theme.accent);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => selectTheme(theme.id));
      themes.append(button);
    }
    new ResizeObserver(resize).observe(stage);
    resize();
    const requested = manifest.themes.find((theme) => theme.id === parameters.get("theme"));
    await selectTheme(requested?.id ?? manifest.themes[0].id);
  } catch (error) {
    console.error(error);
    controlState(false, "התצוגה דורשת דפדפן עם WebGL ופתיחה משרת מקומי.");
  }
}

await start();

// SPDX-License-Identifier: CC0-1.0
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const $ = (id) => document.getElementById(id),
  params = new URLSearchParams(location.search);
const testMode = params.has("test"),
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const tileNames = [
  "straight",
  "gentle_turn",
  "slope",
  "bridge",
  "ice_tunnel",
  "village",
  "forest",
  "summit",
];
const tileLabels = [
  "מדרון פתוח",
  "העיקול הכחול",
  "גלי השלג",
  "גשר העננים",
  "מערת הקרח",
  "כפר הפסגה",
  "יער האורנים",
  "קו הרקיע",
];
const obstacles = [
  "tree",
  "rock",
  "low_fence",
  "high_beam",
  "cable_car",
  "ice_crevasse",
  "snowman",
  "penguin",
  "rolling_snowball",
];
const powerNames = ["magnet", "shield", "turbo", "double_coin"];
const propNames = [...obstacles, "coin", "star", ...powerNames];
const stage = $("stage"),
  canvas = $("world");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#b8dde6");
scene.fog = new THREE.Fog("#b8dde6", 42, 125);
const camera = new THREE.PerspectiveCamera(56, 844 / 390, 0.1, 230);
scene.add(new THREE.HemisphereLight("#effcff", "#557c92", 2.6));
const sun = new THREE.DirectionalLight("#fff1dc", 3.2);
sun.position.set(-10, 18, -8);
scene.add(sun);
const rim = new THREE.DirectionalLight("#b4e7ff", 1.3);
rim.position.set(10, 6, 12);
scene.add(rim);
const loader = new GLTFLoader(),
  templates = {},
  skiers = [],
  tileSlots = [],
  entities = [];
let characterSpec, worldSpec;
let rngState = 0x51a17e;
function random() {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
}
const state = {
  ready: false,
  running: false,
  started: false,
  paused: false,
  distance: 0,
  coins: 0,
  stars: 0,
  lane: 0,
  laneX: 0,
  suit: 0,
  time: 0,
  action: "glide",
  actionTime: 0,
  falling: false,
  invulnerable: 0,
  nextRow: 19,
  spawnIndex: 0,
  tilesPassed: 0,
  collisions: 0,
  collected: 0,
  powers: {},
  visited: new Set(),
  events: [],
};
let mixer,
  actions = {},
  rootBone,
  actionQueue = [],
  actionRemaining = 0,
  toastUntil = 0,
  lastStamp = 0;
function event(type, detail = {}) {
  state.events.push({
    type,
    t: Math.round(state.time * 1000) / 1000,
    ...detail,
  });
  if (state.events.length > 100) state.events.shift();
}
function message(text) {
  $("toast").textContent = text;
  toastUntil = state.time + 1.8;
  $("toast").classList.add("visible");
}
function tileType(sequence) {
  return sequence < 0 ? "straight" : tileNames[sequence % tileNames.length];
}
function shape(type, z) {
  const s = Math.sin((Math.PI * Math.max(0, Math.min(30, z))) / 30),
    d = (Math.sin((2 * Math.PI * z) / 30) * Math.PI) / 30;
  return {
    x: type === "gentle_turn" ? 1.2 * s * s : 0,
    y: type === "slope" ? 1.5 * s * s : 0,
    dx: type === "gentle_turn" ? 1.2 * d : 0,
    dy: type === "slope" ? 1.5 * d : 0,
  };
}
function surface(s) {
  const seq = Math.floor(s / 30),
    z = s - seq * 30,
    type = tileType(seq);
  return { ...shape(type, z), type, seq };
}
function setTile(slot, seq) {
  if (slot.model) scene.remove(slot.model);
  slot.model = templates[tileType(seq)].clone(true);
  slot.seq = seq;
  slot.model.position.z = seq * 30 - state.distance;
  scene.add(slot.model);
}
function mountains() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#719caf",
    roughness: 1,
    flatShading: true,
  });
  const snow = new THREE.MeshStandardMaterial({
    color: "#e1f5f7",
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1,
      h = 10 + random() * 22,
      r = 8 + random() * 12,
      z = 40 + random() * 105,
      x = side * (21 + random() * 35);
    const g = new THREE.ConeGeometry(r, h, 5);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, h / 2 - 3, z);
    m.rotation.y = random() * 3;
    scene.add(m);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(r * 0.37 * 1.012, h * 0.37, 5),
      snow,
    );
    top.rotation.y = m.rotation.y;
    top.position.set(x, h * 0.815 - 3, z);
    scene.add(top);
  }
}
const player = new THREE.Group();
scene.add(player);
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.72, 24),
  new THREE.MeshBasicMaterial({
    color: "#376f89",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }),
);
shadow.rotation.x = -Math.PI / 2;
scene.add(shadow);
const shieldBubble = new THREE.Mesh(
  new THREE.SphereGeometry(0.95, 16, 10),
  new THREE.MeshBasicMaterial({
    color: "#7ff4ec",
    transparent: true,
    opacity: 0.14,
    wireframe: true,
  }),
);
shieldBubble.position.y = 0.95;
shieldBubble.visible = false;
player.add(shieldBubble);
const particleCount = reduced ? 36 : 100,
  particlePos = new Float32Array(particleCount * 3),
  particleData = [];
const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
const snowParticles = new THREE.Points(
  particleGeo,
  new THREE.PointsMaterial({
    color: "#fff",
    size: 0.065,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  }),
);
scene.add(snowParticles);
for (let i = 0; i < particleCount; i++)
  particleData.push({
    x: (random() - 0.5) * 18,
    y: random() * 6,
    z: random() * 40 - 8,
  });
const trailCount = reduced ? 18 : 48,
  trailPos = new Float32Array(trailCount * 3),
  trailAge = new Float32Array(trailCount).fill(2);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Points(
  trailGeo,
  new THREE.PointsMaterial({
    color: "#f5ffff",
    size: 0.15,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  }),
);
scene.add(trail);
let trailCursor = 0,
  trailAccumulator = 0;

function duration(name) {
  return actions[name]?.getClip().duration ?? 0.5;
}
function play(name, loop = false, fade = 0.07) {
  if (!actions[name]) return;
  const next = actions[name];
  for (const a of Object.values(actions)) if (a !== next) a.fadeOut(fade);
  next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.clampWhenFinished = !loop;
  next.fadeIn(fade).play();
  state.action = name;
  state.actionTime = 0;
  actionRemaining = loop ? Infinity : duration(name);
  event("animation", { name });
}
function sequence(names) {
  actionQueue = names.slice(1);
  play(names[0]);
}
function chooseSuit(index) {
  mixer?.stopAllAction();
  state.suit = (index + 3) % 3;
  skiers.forEach((s, i) => (s.scene.visible = i === state.suit));
  mixer = new THREE.AnimationMixer(skiers[state.suit].scene);
  actions = Object.fromEntries(
    skiers[state.suit].animations.map((c) => [c.name, mixer.clipAction(c)]),
  );
  rootBone = skiers[state.suit].scene.getObjectByName("Root");
  actionQueue = [];
  state.falling = false;
  play("glide", true, 0);
  mixer.update(0);
  event("suit", { index: state.suit });
}
function addEntity(kind, lane, s, y = 0.0) {
  const source = templates[kind].clone(true);
  let model = source,
    pivot;
  if (kind === "rolling_snowball") {
    model = new THREE.Group();
    pivot = new THREE.Group();
    pivot.position.y = 0.78;
    source.position.y = -0.78;
    pivot.add(source);
    model.add(pivot);
  }
  scene.add(model);
  const entity = {
    kind,
    lane,
    s,
    y,
    model,
    pivot,
    done: false,
    phase: random() * 6,
  };
  entities.push(entity);
  return entity;
}
function spawnRows() {
  while (state.nextRow < state.distance + 125) {
    const i = state.spawnIndex++,
      s = state.nextRow,
      lane = (i % 3) - 1,
      kind = obstacles[i % obstacles.length];
    addEntity(kind, lane, s);
    const safeLane = lane === 0 ? (i % 2 ? -1 : 1) : 0;
    for (let j = 0; j < 6; j++)
      addEntity(
        "coin",
        safeLane,
        s - 5 + j * 1.45,
        0.9 + Math.sin((j / 5) * Math.PI) * 0.55,
      );
    if (i % 3 === 1) addEntity("star", -lane, s + 4, 1.25);
    if (i % 4 === 2)
      addEntity(powerNames[Math.floor(i / 4) % 4], safeLane, s + 6, 1.05);
    state.nextRow += 13.5;
  }
}
function removeEntity(e) {
  scene.remove(e.model);
  entities.splice(entities.indexOf(e), 1);
}
function collect(e) {
  e.done = true;
  scene.remove(e.model);
  if (e.kind === "coin") {
    state.coins += state.powers.double_coin ? 2 : 1;
    state.collected++;
  } else if (e.kind === "star") {
    state.stars++;
    message("כוכב בדרך לפסגה");
  } else {
    state.powers[e.kind] = state.time + (e.kind === "turbo" ? 6 : 9);
    message(
      {
        magnet: "מגנט פעיל",
        shield: "מגן פעיל",
        turbo: "טורבו!",
        double_coin: "מטבעות כפולים",
      }[e.kind],
    );
    if (e.kind === "turbo" && state.action === "glide") play("turbo", true);
  }
  event("collect", { kind: e.kind });
}
function crash(e) {
  if (state.invulnerable > state.time) return;
  if (state.powers.shield || state.powers.turbo) {
    delete state.powers.shield;
    state.invulnerable = state.time + 0.6;
    message("המגן שמר עליך");
    event("blocked", { kind: e.kind });
    return;
  }
  state.collisions++;
  state.falling = true;
  state.invulnerable = state.time + 4.5;
  sequence([
    ["fall_left", "fall_right", "fall_forward"][state.collisions % 3],
    "get_up",
  ]);
  message("קמים וממשיכים");
  event("collision", { kind: e.kind });
}
function command(name) {
  if (!state.ready) return false;
  if (name === "pause") {
    togglePause();
    return true;
  }
  if (!state.running || state.falling) return false;
  if (name === "left" || name === "right") {
    const old = state.lane;
    state.lane = THREE.MathUtils.clamp(
      state.lane + (name === "left" ? -1 : 1),
      -1,
      1,
    );
    if (old === state.lane) return false;
    if (!state.action.startsWith("jump") && state.action !== "slide")
      sequence([name === "left" ? "lane_left" : "lane_right"]);
    event("lane", { lane: state.lane });
    return true;
  }
  if (state.action.startsWith("jump") || state.action === "slide") return false;
  if (name === "jump") {
    sequence(["jump_rise", "jump_apex", "jump_land"]);
    event("jump");
    return true;
  }
  if (name === "slide") {
    sequence(["slide"]);
    event("slide");
    return true;
  }
  return false;
}
function start() {
  state.started = true;
  state.running = true;
  state.paused = false;
  stage.dataset.state = "running";
  $("pause").setAttribute("aria-label", "השהיה");
  $("pause").firstElementChild.src = "assets/icons/pause.svg";
  $("welcome").hidden = true;
  lastStamp = 0;
  event("start");
}
function togglePause() {
  if (!state.started) return;
  state.paused = !state.paused;
  state.running = !state.paused;
  stage.dataset.state = state.paused ? "paused" : "running";
  $("pause").setAttribute("aria-label", state.paused ? "המשך" : "השהיה");
  $("pause").firstElementChild.src =
    `assets/icons/${state.paused ? "play" : "pause"}.svg`;
  event(state.paused ? "pause" : "resume");
}
function reset() {
  for (const e of [...entities]) removeEntity(e);
  Object.assign(state, {
    distance: 0,
    coins: 0,
    stars: 0,
    lane: 0,
    laneX: 0,
    time: 0,
    falling: false,
    invulnerable: 0,
    nextRow: 19,
    spawnIndex: 0,
    collisions: 0,
    collected: 0,
    powers: {},
    tilesPassed: 0,
    visited: new Set(),
    events: [],
  });
  rngState = 0x51a17e;
  tileSlots.forEach((s, i) => setTile(s, i - 1));
  actionQueue = [];
  trailAge.fill(2);
  for (let i = 0; i < trailCount; i++) trailPos[i * 3 + 1] = -100;
  trailAccumulator = 0;
  play("glide", true);
  mixer.update(0);
  spawnRows();
  start();
  event("restart");
}
function tick(dt, draw = true) {
  dt = Math.max(0, Math.min(dt, 1 / 30));
  if (state.running) {
    state.time += dt;
    state.actionTime += dt;
    const speed =
      (state.powers.turbo ? 22 : 14 + Math.min(5, state.distance / 500)) *
      (state.falling ? 0.25 : 1);
    state.distance += speed * dt;
    state.laneX = THREE.MathUtils.damp(state.laneX, -state.lane * 2.4, 16, dt);
    actionRemaining -= dt;
    if (actionRemaining <= 1e-7) {
      if (actionQueue.length) {
        const next = actionQueue.shift();
        play(next, false, next === "get_up" ? 0.18 : 0.025);
      } else {
        state.falling = false;
        play(state.powers.turbo ? "turbo" : "glide", true);
      }
    }
    mixer.update(dt);
    for (const k of Object.keys(state.powers))
      if (state.powers[k] <= state.time) {
        delete state.powers[k];
        if (k === "turbo" && state.action === "turbo") play("glide", true);
      }
    for (const slot of tileSlots) {
      if (slot.seq * 30 - state.distance < -35)
        setTile(slot, Math.max(...tileSlots.map((s) => s.seq)) + 1);
      slot.model.position.z = slot.seq * 30 - state.distance;
    }
    spawnRows();
    if (state.time > toastUntil) $("toast").classList.remove("visible");
  }
  const ground = surface(state.distance),
    look = surface(state.distance + 13);
  state.visited.add(ground.type);
  state.tilesPassed = Math.floor(state.distance / 30);
  player.position.set(ground.x + state.laneX, ground.y, 0);
  player.rotation.y = Math.atan(ground.dx);
  player.rotation.x = -Math.atan(ground.dy);
  player.visible = !(
    state.invulnerable > state.time &&
    state.falling &&
    Math.floor(state.time * 12) % 2 === 0
  );
  const lift = Math.max(0, rootBone?.position.y ?? 0);
  shadow.position.set(player.position.x, ground.y + 0.022, 0);
  shadow.scale.setScalar(Math.max(0.45, 1 - lift * 0.25));
  shadow.material.opacity = 0.18 / (1 + lift);
  shieldBubble.visible = Boolean(state.powers.shield);
  shieldBubble.rotation.y = state.time;
  for (const e of [...entities]) {
    if (e.s < state.distance - 9 || e.done) {
      removeEntity(e);
      continue;
    }
    const g = surface(e.s),
      z = e.s - state.distance;
    e.model.position.set(g.x - e.lane * 2.4, g.y + e.y, z);
    e.model.rotation.y = Math.atan(g.dx);
    if (e.kind === "coin" || e.kind === "star" || powerNames.includes(e.kind)) {
      e.model.rotation.y += state.time * 1.5 + e.phase;
      e.model.position.y += Math.sin(state.time * 3 + e.phase) * 0.08;
    }
    if (e.kind === "rolling_snowball") {
      e.pivot.rotation.x = -state.distance / 0.78;
      e.model.position.x += Math.sin(state.time * 1.4 + e.phase) * 0.35;
    }
    if (state.running && !e.done && !e.resolved) {
      const gap = Math.abs(e.model.position.x - player.position.x),
        pickup = !obstacles.includes(e.kind);
      if (pickup) {
        const magnet = e.kind === "coin" && state.powers.magnet;
        if (
          (Math.abs(z) < 1.2 &&
            gap < 0.85 &&
            Math.abs(e.y - (lift + 0.85)) < 1.1) ||
          (magnet && z < 9 && z > -1 && gap < 6)
        ) {
          collect(e);
        }
      } else if (
        Math.abs(z) < (e.kind === "ice_crevasse" ? 1.2 : 0.62) &&
        gap < (e.kind === "high_beam" ? 1.0 : 0.86)
      ) {
        const hold = characterSpec.transitions.slideHoldSeconds;
        const cleared =
          e.kind === "low_fence"
            ? lift > 1.05
            : e.kind === "high_beam"
              ? state.action === "slide" &&
                state.actionTime >= hold[0] &&
                state.actionTime <= hold[1]
              : e.kind === "ice_crevasse"
                ? lift > 0.45
                : false;
        if (!cleared) crash(e);
        e.resolved = true;
      }
    }
  }
  camera.position.set(ground.x + state.laneX * 0.28, ground.y + 3.55, -6.4);
  camera.lookAt(look.x, look.y + 0.8, 13);
  for (let i = 0; i < particleCount; i++) {
    const p = particleData[i];
    if (state.running && !reduced) {
      p.z -= dt * (state.powers.turbo ? 29 : 17);
      p.y -= dt * 0.24;
      if (p.z < -9) {
        p.z = 34;
        p.y = random() * 6;
      }
      if (p.y < 0.1) p.y = 6;
    }
    particlePos[i * 3] = p.x + ground.x;
    particlePos[i * 3 + 1] = p.y + ground.y;
    particlePos[i * 3 + 2] = p.z;
  }
  particleGeo.attributes.position.needsUpdate = true;
  if (state.running) {
    trailAccumulator += dt;
    while (trailAccumulator > 1 / 24) {
      trailAccumulator -= 1 / 24;
      const i = trailCursor++ % trailCount;
      trailPos[i * 3] = player.position.x + (trailCursor % 2 ? 0.19 : -0.19);
      trailPos[i * 3 + 1] = ground.y + 0.08 + lift;
      trailPos[i * 3 + 2] = -0.6;
      trailAge[i] = 0;
    }
    for (let i = 0; i < trailCount; i++) {
      trailAge[i] += dt;
      trailPos[i * 3 + 2] -= dt * 16;
      trailPos[i * 3 + 1] += dt * 0.25;
      if (trailAge[i] > 1.6) trailPos[i * 3 + 1] = -100;
    }
  }
  trailGeo.attributes.position.needsUpdate = true;
  if (!draw) return;
  $("distance").textContent = Math.floor(state.distance).toLocaleString(
    "he-IL",
  );
  $("coins").textContent = state.coins;
  $("stars").textContent = state.stars;
  $("biome").textContent = tileLabels[tileNames.indexOf(ground.type)];
  $("speed").textContent =
    `${Math.round((state.powers.turbo ? 22 : 14 + Math.min(5, state.distance / 500)) * 3.6)} km/h`;
  $("progress").firstElementChild.style.width =
    `${((state.distance % 240) / 240) * 100}%`;
  for (const el of $("powers").children)
    if (!state.powers[el.dataset.kind]) el.remove();
  for (const [kind, until] of Object.entries(state.powers)) {
    let el = $("powers").querySelector(`[data-kind="${kind}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "power";
      el.dataset.kind = kind;
      el.innerHTML = `<img src="assets/icons/${kind}.svg" alt="${{ magnet: "מגנט", shield: "מגן", turbo: "טורבו", double_coin: "מטבע כפול" }[kind]}"><i></i>`;
      $("powers").append(el);
    }
    el.lastElementChild.style.transform = `scaleX(${Math.max(0, (until - state.time) / (kind === "turbo" ? 6 : 9))})`;
  }
  renderer.render(scene, camera);
}
function resize() {
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
$("start").onclick = start;
$("pause").onclick = togglePause;
$("restart").onclick = reset;
$("suit").onclick = () => chooseSuit(state.suit + 1);
for (const b of document.querySelectorAll("[data-command]"))
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    command(b.dataset.command);
  });
addEventListener("keydown", (e) => {
  const map = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "jump",
    ArrowDown: "slide",
    " ": "jump",
    p: "pause",
    Escape: "pause",
  };
  if (map[e.key]) {
    e.preventDefault();
    if (!e.repeat) command(map[e.key]);
  }
});
let touchStart;
canvas.addEventListener("pointerdown", (e) => {
  touchStart = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x,
    dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  command(
    Math.abs(dx) > Math.abs(dy)
      ? dx < 0
        ? "left"
        : "right"
      : dy < 0
        ? "jump"
        : "slide",
  );
});
canvas.addEventListener("pointercancel", () => {
  touchStart = null;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running) togglePause();
});
window.__alpine = {
  snapshot: () => ({
    ...state,
    visited: [...state.visited],
    powers: { ...state.powers },
    events: [...state.events],
    rootHeight: rootBone?.position.y ?? 0,
    entityCount: entities.length,
    tileCount: tileSlots.length,
    renderer: renderer.info.render,
  }),
  command,
  start,
  restart: reset,
  advance: (seconds) => {
    for (let s = 0; s < seconds - 1e-8; s += 1 / 120)
      tick(Math.min(1 / 120, seconds - s), false);
    tick(0);
    return window.__alpine.snapshot();
  },
  inject: (kind, lane = state.lane, offset = 5) => {
    if (!templates[kind]) throw Error(`Unknown asset: ${kind}`);
    return Boolean(
      addEntity(
        kind,
        lane,
        state.distance + offset,
        obstacles.includes(kind) ? 0 : 0.9,
      ),
    );
  },
  clear: () => {
    for (const e of [...entities]) removeEntity(e);
    state.nextRow = state.distance + 200;
  },
  suit: chooseSuit,
  clip: (name) => {
    actionQueue = [];
    play(name, name === "glide" || name === "turbo");
  },
  inspectTile: (name) => {
    if (!tileNames.includes(name)) throw Error("Unknown tile");
    reset();
    const seq = tileNames.indexOf(name);
    state.distance = seq * 30 + 4;
    tileSlots.forEach((s, i) => setTile(s, seq + i - 1));
    state.nextRow = state.distance + 200;
    for (const e of [...entities]) removeEntity(e);
    tick(0);
  },
  dispose: () => {
    state.running = false;
    renderer.dispose();
  },
};

try {
  [characterSpec, worldSpec] = await Promise.all(
    ["character-spec.json", "world-spec.json"].map((p) =>
      fetch(p).then((r) => {
        if (!r.ok) throw Error(p);
        return r.json();
      }),
    ),
  );
  const jobs = [
    ...tileNames.map((n) => [n, `assets/tiles/${n}.glb`]),
    ...propNames.map((n) => [n, `assets/props/${n}.glb`]),
  ];
  await Promise.all(
    jobs.map(async ([n, p]) => {
      templates[n] = (await loader.loadAsync(p)).scene;
    }),
  );
  for (const color of ["coral", "teal", "violet"]) {
    const gltf = await loader.loadAsync(`assets/characters/skier-${color}.glb`);
    skiers.push(gltf);
    player.add(gltf.scene);
  }
  chooseSuit(0);
  mountains();
  for (let i = -1; i < 5; i++) {
    const slot = {};
    setTile(slot, i);
    tileSlots.push(slot);
  }
  spawnRows();
  state.ready = true;
  $("loading").hidden = true;
  resize();
  tick(0);
  event("ready");
  if (params.has("autoplay")) start();
  if (params.has("tile")) window.__alpine.inspectTile(params.get("tile"));
  if (params.has("clip")) {
    start();
    window.__alpine.clip(params.get("clip"));
  }
  if (!testMode) {
    let accumulated = 0;
    requestAnimationFrame(function frame(stamp) {
      const elapsed = lastStamp
        ? Math.min(0.25, (stamp - lastStamp) / 1000)
        : 0;
      lastStamp = stamp;
      accumulated = state.running ? accumulated + elapsed : 0;
      while (accumulated >= 1 / 120) {
        tick(1 / 120, false);
        accumulated -= 1 / 120;
      }
      tick(0);
      requestAnimationFrame(frame);
    });
  }
} catch (error) {
  $("loading").textContent = "טעינת המסלול נכשלה. יש לפתוח דרך שרת HTTP.";
  window.__alpineError = error.message;
  console.error(error);
}

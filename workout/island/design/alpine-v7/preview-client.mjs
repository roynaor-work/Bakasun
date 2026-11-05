export async function startPreview({
  THREE,
  buildWorld,
  motion,
  loadGLB,
  assetURL,
  pack,
}) {
  const $ = (id) => document.getElementById(id),
    clamp = THREE.MathUtils.clamp;
  const loadingControls = [
    ...document.querySelectorAll(
      "[data-athlete],[data-view],[data-env],#time,#clip,#toggle-play,#open-controls,#orbit-reset",
    ),
  ];
  for (const control of loadingControls) control.disabled = true;
  $("stage").setAttribute("aria-busy", "true");
  const labels = {
    glide: "גלישה",
    carve_left: "קארוינג שמאלה",
    carve_right: "קארוינג ימינה",
    crouch: "כריעה",
    accelerate: "האצה",
    ramp_jump: "קפיצה מרמפה",
    trick_180: "טריק · 180°",
    trick_360: "טריק · 360°",
    trick_shifty: "טריק · שיפטי",
    trick_tail_grab: "טריק · גרב אחורי",
    trick_backflip: "טריק · סלטה לאחור",
    fall_roll: "נפילה מתגלגלת",
    get_up: "קימה",
    celebrate: "חגיגה",
  };
  const chapters = {
    glide: ["01", "קריאת השטח", "למצוא את הקו."],
    carve_left: ["02", "עומס וזרימה", "לתת לקנט לעבוד."],
    carve_right: ["02", "עומס וזרימה", "לתת לקנט לעבוד."],
    crouch: ["03", "קרוב לשלג", "לאסוף את הגוף."],
    accelerate: ["04", "זרימה קדימה", "לשחרר מהירות."],
    ramp_jump: ["05", "מגע ואז שקט", "רגע מעל ההר."],
    fall_roll: ["07", "איבוד שיווי משקל", "לחזור אל השלג."],
    get_up: ["08", "תמיכה והתאוששות", "לקום, ולהמשיך."],
    celebrate: ["09", "סוף הקו", "להרים את הרגע."],
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.03, 260);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  // A weak bounce from the downhill floodlight keeps dark fabric readable.
  const nightFill = new THREE.DirectionalLight(0xaecded, 0.28);
  nightFill.position.set(8, 6, 9);
  nightFill.visible = false;
  scene.add(nightFill);
  renderer.domElement.setAttribute(
    "aria-label",
    "דמות עם ציוד על מסלול סקי מושלג",
  );
  $("canvas").append(renderer.domElement);
  const actorScale = pack.manifest.recommendedWorldScale || 1.35;
  const state = {
    focus: "athlete",
    athlete: 0,
    clip: "carve_left",
    environment: "sunset",
    view: "close",
    playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    time: 0.85,
    speed: 1,
    detail: "auto",
    yaw: 0.55,
    elevation: 0.13,
    distance: 6.1 * actorScale,
    wire: false,
    rig: false,
    ready: false,
    activeLOD: 0,
  };
  const order = ["ski-male", "snowboard-female", "ski-female"];
  const characters = [...pack.manifest.characters].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
  const records = new Map(),
    pendingRecords = new Map(),
    atlasCache = new Map();
  let world,
    active,
    helper,
    reflectionTarget,
    width = 390,
    height = 844,
    lastRAF = 0,
    frames = 0,
    renderBatchDepth = 0,
    fps = 0,
    performanceStart = performance.now(),
    renderSamples = [],
    events = [];
  function applyMaterials(root, id) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.wireframe = state.wire;
        if (id && m.map) {
          if (!atlasCache.has(id)) atlasCache.set(id, m.map);
          else if (m.map !== atlasCache.get(id)) {
            const previous = m.map;
            m.map = atlasCache.get(id);
            previous.dispose();
            m.needsUpdate = true;
          }
        }
        if (/goggle|visor|lens/i.test(m.name)) {
          m.envMapIntensity =
            state.environment === "night-floodlit" ? 1.65 : 1.15;
          m.metalness = 0.92;
          m.roughness = 0.12;
        }
        if (m.transparent) m.depthWrite = false;
      }
    });
  }
  function makeReflection(id) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext("2d");
    const colors =
      id === "night-floodlit"
        ? ["#06122d", "#2a4974", "#5b8aaf", "#bcd5dd"]
        : id === "fog"
          ? ["#b3c9ce", "#d7e2dc", "#889fa6", "#d7e8e5"]
          : ["#3d668a", "#ddac8c", "#6b7f99", "#e2e7e2"];
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, colors[0]);
    sky.addColorStop(0.42, colors[1]);
    sky.addColorStop(0.51, colors[2]);
    sky.addColorStop(1, colors[3]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = id === "night-floodlit" ? "#c3efff" : "#fff0d6";
    ctx.beginPath();
    ctx.arc(344, 95, id === "night-floodlit" ? 5 : 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors[2];
    ctx.beginPath();
    ctx.moveTo(0, 135);
    for (let i = 0; i <= 32; i++)
      ctx.lineTo(i * 16, 122 - 18 * Math.sin(i * 1.8) - 8 * Math.sin(i * 3.4));
    ctx.lineTo(512, 174);
    ctx.lineTo(0, 174);
    ctx.fill();
    if (id === "night-floodlit") {
      ctx.fillStyle = "#eef8ff";
      for (const x of [42, 170, 298, 426])
        for (const offset of [0, 4, 8]) ctx.fillRect(x + offset, 106, 2, 10);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const gen = new THREE.PMREMGenerator(renderer);
    const rt = gen.fromEquirectangular(tex);
    gen.dispose();
    tex.dispose();
    if (reflectionTarget) reflectionTarget.dispose();
    reflectionTarget = rt;
    scene.environment = rt.texture;
  }
  async function getRecord(index, lod = 0) {
    const key = `${index}:${lod}`;
    if (records.has(key)) return records.get(key);
    if (pendingRecords.has(key)) return pendingRecords.get(key);
    const pending = (async () => {
      const meta = characters[index],
        p = lod === 0 ? meta.model : meta.lods[lod - 1].path;
      const gltf = await loadGLB(p);
      gltf.scene.scale.setScalar(actorScale);
      gltf.scene.userData.alpineRecordKey = key;
      applyMaterials(gltf.scene, meta.id);
      gltf.scene.visible = false;
      scene.add(gltf.scene);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const rec = { gltf, mixer, meta, index, lod, action: null };
      records.set(key, rec);
      return rec;
    })();
    pendingRecords.set(key, pending);
    try {
      return await pending;
    } finally {
      pendingRecords.delete(key);
    }
  }
  function clipFor(rec, name) {
    return (
      rec.gltf.animations.find((c) => c.name === name) || rec.gltf.animations[0]
    );
  }
  function composePresentation() {
    if (!active) return;
    const clip = clipFor(active, state.clip),
      air =
        motion.CLIPS?.find((c) => c.name === state.clip)?.category === "air";
    const placementYaw =
      active.meta.worldYawRadians ??
      (active.meta.sport === "snowboard" ? Math.PI / 2 : 0);
    if (!air || !clip) {
      active.gltf.scene.position.set(0, 0, 0);
      active.gltf.scene.rotation.set(0, placementYaw, 0);
      return;
    }
    const u = clamp(state.time / clip.duration, 0, 1),
      smooth = (t) => {
        t = clamp(t, 0, 1);
        return t * t * (3 - 2 * t);
      };
    let z,
      y,
      pitch = 0;
    if (u < 0.23) {
      const p = smooth(u / 0.23);
      z = -4.5 + 4.5 * p;
      y = 1.32 * p * p;
      pitch = -Math.atan((2 * 1.32 * p) / 4.5);
    } else if (u < 0.77) {
      const p = (u - 0.23) / 0.54;
      z = 5 * p;
      y = 1.32 * (1 - p);
      pitch = -Math.atan((2 * 1.32) / 4.5) * (1 - smooth((u - 0.23) / 0.12));
    } else {
      z = 5 + 0.5 * smooth((u - 0.77) / 0.23);
      y = 0;
    }
    active.gltf.scene.position.set(0, y, z);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      placementYaw,
    );
    active.gltf.scene.quaternion
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch)
      .multiply(yawQ);
    if (u <= 0.23) {
      scene.updateMatrixWorld(true);
      active.gltf.scene.traverse((mesh) => {
        if (mesh.isSkinnedMesh) mesh.skeleton.update();
      });
      let lift = 0;
      const vertex = new THREE.Vector3();
      active.gltf.scene.traverse((mesh) => {
        if (
          !mesh.isMesh ||
          !/Laminate equipment|metal edges/.test(mesh.material?.name || "")
        )
          return;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
          const terrain =
            vertex.z >= -4.5 && vertex.z <= 0
              ? 1.32 * ((vertex.z + 4.5) / 4.5) ** 2
              : 0;
          lift = Math.max(lift, terrain - vertex.y + 0.001);
        }
      });
      active.gltf.scene.position.y += lift;
    }
  }

  function applyPose() {
    if (!active) return;
    const clip = clipFor(active, state.clip);
    if (!clip) return;
    if (active.action?.getClip() !== clip) {
      active.mixer.stopAllAction();
      active.action = active.mixer.clipAction(clip);
      active.action.setLoop(THREE.LoopOnce, 1);
      active.action.clampWhenFinished = true;
      active.action.play();
    }
    active.action.paused = false;
    active.action.time = clamp(state.time, 0, clip.duration - 0.00001);
    active.mixer.update(0);
    composePresentation();
    scene.updateMatrixWorld(true);
    $("time").value = clamp(state.time / clip.duration, 0, 1);
    $("time").style.setProperty(
      "--progress",
      `${clamp((state.time / clip.duration) * 100, 0, 100)}%`,
    );
    $("time-label").textContent =
      `${state.time.toFixed(2)} / ${clip.duration.toFixed(2)}`;
  }
  let switchSerial = 0;
  async function selectAthlete(index, lod = state.activeLOD) {
    const serial = ++switchSerial;
    const record = await getRecord(index, lod);
    if (serial !== switchSerial) return;
    for (const r of records.values()) r.gltf.scene.visible = false;
    active = record;
    active.gltf.scene.visible = true;
    state.athlete = index;
    state.activeLOD = lod;
    if (helper) {
      scene.remove(helper);
      helper.dispose();
    }
    helper = new THREE.SkeletonHelper(active.gltf.scene);
    helper.visible = state.rig;
    scene.add(helper);
    const names = active.gltf.animations.map((c) => c.name);
    $("clip").innerHTML = names
      .map((id) => `<option value="${id}">${labels[id] || id}</option>`)
      .join("");
    if (!names.includes(state.clip)) state.clip = names[0];
    $("clip").value = state.clip;
    document.querySelectorAll("[data-athlete]").forEach((b) => {
      b.classList.toggle("active", +b.dataset.athlete === index);
      b.setAttribute("aria-pressed", String(+b.dataset.athlete === index));
    });
    $("athlete-tag").textContent =
      `0${index + 1} / ${record.meta.sport === "snowboard" ? "סנובורד" : "סקי"}`;
    $("athlete-palette").textContent = [
      "פטרול · טורקיז",
      "קו חופשי · חמרה",
      "רכס · שנהב",
    ][index];
    applyPose();
    updateChapter();
    render();
  }
  const focusChapters = {
    powder: ["10", "חומר / אבקה", "שלג של אוויר."],
    ice: ["11", "חומר / קרח", "לקרוא את הסדק."],
    churned: ["12", "חומר / מרוסק", "הקו נשאר בשלג."],
    forest: ["13", "אורנים / מרחק", "לראות את היער."],
  };
  function setFocus(kind) {
    state.focus = kind;
    document.body.dataset.focus = kind;
    $("focus").value = kind;
    if (kind !== "athlete") {
      state.view = "close";
      for (const button of document.querySelectorAll("[data-view]")) {
        button.classList.toggle("active", button.dataset.view === "close");
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.view === "close"),
        );
      }
      const preset = world.getInspectionCamera(kind),
        offset = preset.position.clone().sub(preset.target);
      state.distance = offset.length();
      state.yaw = Math.atan2(offset.x, offset.z);
      state.elevation = Math.asin(offset.y / state.distance);
    }
    updateChapter();
    render();
  }
  function updateChapter() {
    const data =
      state.focus !== "athlete"
        ? focusChapters[state.focus]
        : chapters[state.clip] || [
            "06",
            "חופש מעל המסלול",
            "לשנות כיוון באוויר.",
          ];
    $("chapter-num").textContent = data[0];
    $("chapter-kicker").textContent = data[1];
    $("chapter-title").textContent = data[2];
  }
  const poseFocusHead = new THREE.Vector3(),
    poseFocusHips = new THREE.Vector3();
  function updateCamera() {
    const landscape = width / height > 1.3;
    let distance = state.distance;
    if (state.view === "close" && landscape) distance *= 0.75;
    const position = active?.gltf.scene.position || new THREE.Vector3();
    const rootHeight =
      active?.gltf.scene.getObjectByName("Root")?.position.y || 0;
    const target =
      state.focus !== "athlete" && world
        ? world.getFocusPoint(state.focus)
        : state.view === "wide"
          ? new THREE.Vector3(
              position.x,
              0.8 +
                position.y * 0.3 +
                Math.max(0, rootHeight) * actorScale * 0.25,
              position.z -
                (motion.CLIPS?.find((c) => c.name === state.clip)?.category ===
                "air"
                  ? 1
                  : 2),
            )
          : new THREE.Vector3(
              position.x,
              0.78 * actorScale +
                position.y +
                Math.max(0, rootHeight) *
                  actorScale *
                  (motion.CLIPS?.find((c) => c.name === state.clip)
                    ?.category === "air"
                    ? 0.75
                    : 0.4),
              position.z,
            );
    // Low recovery poses need their actual body centre: Root translation can
    // rise while the torso rotates down, leaving hands behind the portrait dock.
    if (
      state.focus === "athlete" &&
      state.view === "close" &&
      (state.clip === "fall_roll" || state.clip === "get_up") &&
      active
    ) {
      const head = active.gltf.scene.getObjectByName("Head");
      const hips = active.gltf.scene.getObjectByName("Hips");
      if (head && hips) {
        active.gltf.scene.updateMatrixWorld(true);
        head.getWorldPosition(poseFocusHead);
        hips.getWorldPosition(poseFocusHips);
        target.y = Math.min(
          target.y,
          Math.max(0.4, (poseFocusHead.y + poseFocusHips.y) * 0.5 + 0.15),
        );
      }
    }
    camera.position.set(
      target.x + Math.sin(state.yaw) * Math.cos(state.elevation) * distance,
      target.y + Math.sin(state.elevation) * distance,
      target.z + Math.cos(state.yaw) * Math.cos(state.elevation) * distance,
    );
    camera.lookAt(target);
    camera.setViewOffset(
      width,
      height,
      landscape ? -width * 0.12 : 0,
      0,
      width,
      height,
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    world?.setCamera?.(camera);
  }
  function resize() {
    width = $("stage").clientWidth;
    height = $("stage").clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    updateCamera();
    world?.resize?.(width, height);
    if (state.ready) render();
  }
  new ResizeObserver(resize).observe($("stage"));
  function diagnostics() {
    const info = renderer.info.render;
    const text = `${THREE.REVISION} · LOD ${state.activeLOD} · ${active?.meta.sport || ""}\n${Math.round(info.triangles).toLocaleString()} triangles · ${info.calls} draw calls\n${fps.toFixed(1)} fps · DPR ${renderer.getPixelRatio()}\n${renderer.info.memory.geometries} geometries · ${renderer.info.memory.textures} GPU textures`;
    $("diagnostics").textContent = text;
    $("live-stat").textContent =
      `${state.playing && fps ? fps.toFixed(0) + " fps · " : ""}LOD ${state.activeLOD} · ${state.playing ? "מקומי" : "מושהה"}`;
    return text;
  }
  function render() {
    if (renderBatchDepth) return;
    updateCamera();
    renderer.info.reset();
    renderer.render(scene, camera);
  }
  function setEnvironment(id) {
    if (state.environment === id && reflectionTarget) {
      render();
      return;
    }
    state.environment = id;
    world?.setEnvironment(id);
    nightFill.visible = id === "night-floodlit";
    makeReflection(id);
    for (const record of records.values())
      applyMaterials(record.gltf.scene, record.meta.id);
    const data = {
      sunset: ["אור אחרון", "שלג רך · ‎−8°"],
      fog: ["רכס בענן", "ערפל · ‎−12°"],
      "night-floodlit": ["אחרי השקיעה", "זרקורים · ‎−15°"],
    }[id];
    $("scene-label").textContent = data[0];
    $("weather-label").textContent = data[1];
    document.querySelectorAll("[data-env]").forEach((b) => {
      b.classList.toggle("active", b.dataset.env === id);
      b.setAttribute("aria-pressed", String(b.dataset.env === id));
    });
    render();
  }
  async function setView(view) {
    state.view = view;
    state.distance = view === "wide" ? 24 : 6.1 * actorScale;
    state.elevation = view === "wide" ? 0.16 : 0.13;
    state.yaw =
      motion.CLIPS?.find((c) => c.name === state.clip)?.category === "air"
        ? view === "wide"
          ? 0.65
          : 1.05
        : view === "wide"
          ? 0.42
          : 0.55;
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
    });
    await updateLOD();
    render();
  }
  function desiredLOD() {
    const lods = characters[state.athlete].lods;
    return state.detail === "high"
      ? 0
      : state.detail === "low"
        ? 2
        : state.distance >= lods[1].distance
          ? 2
          : state.distance >= lods[0].distance
            ? 1
            : 0;
  }
  async function updateLOD() {
    const lod = desiredLOD();
    if (active && lod !== state.activeLOD)
      await selectAthlete(state.athlete, lod);
  }
  function setClip(name, time = 0) {
    const previousAir =
      motion.CLIPS?.find((c) => c.name === state.clip)?.category === "air";
    state.clip = name;
    state.time = time;
    const nextAir =
      motion.CLIPS?.find((c) => c.name === name)?.category === "air";
    if (previousAir !== nextAir)
      state.yaw = nextAir
        ? state.view === "wide"
          ? 0.65
          : 1.05
        : state.view === "wide"
          ? 0.42
          : 0.55;
    world?.setRampPresentation?.(
      motion.CLIPS?.find((c) => c.name === name)?.category === "air",
    );
    $("clip").value = name;
    applyPose();
    updateChapter();
    render();
  }
  function setPlaying(value) {
    if (
      value &&
      active &&
      state.time >= clipFor(active, state.clip)?.duration - 0.001
    )
      state.time = 0;
    state.lastDraw = performance.now();
    state.playing = value;
    $("toggle-play").textContent = value ? "Ⅱ" : "▷";
    $("toggle-play").setAttribute("aria-label", value ? "השהיה" : "ניגון");
    if (state.ready) diagnostics();
  }
  function triggerEvents(previous, current) {
    const duration = clipFor(active, state.clip)?.duration || 1,
      wrapped = current < previous;
    const crossed = (t) =>
      wrapped ? t > previous || t <= current : t > previous && t <= current;
    const metadata = motion.CLIPS?.find((c) => c.name === state.clip);
    for (const event of metadata?.events || []) {
      if (!crossed(event.time)) continue;
      events.push({ type: event.name, time: event.time, clip: state.clip });
      if (event.name === "landing")
        world?.triggerLanding?.(
          active.gltf.scene.position.clone().add(new THREE.Vector3(0, 0.02, 0)),
        );
    }
    if (
      ["carve_left", "carve_right", "accelerate"].includes(state.clip) &&
      current > 0.3 &&
      Math.floor(previous * 4) !== Math.floor(current * 4)
    )
      world?.triggerPowder?.(
        active.gltf.scene.position
          .clone()
          .add(new THREE.Vector3(0, 0.03, -0.1)),
        0.35,
      );
  }
  function tick(now) {
    lastRAF = now;
    const effectsActive = now < (state.effectUntil || 0);
    if (
      state.ready &&
      (state.playing || effectsActive) &&
      now - (state.lastDraw || 0) >= 1000 / 30 - 1
    ) {
      const drawDelta = Math.min((now - (state.lastDraw || now)) / 1000, 0.25);
      const clip = clipFor(active, state.clip),
        before = state.time;
      if (state.playing && clip) {
        const next = state.time + drawDelta * state.speed;
        const loops =
          motion.CLIPS?.find((c) => c.name === state.clip)?.loop ?? true;
        state.time = loops
          ? next % clip.duration
          : Math.min(next, clip.duration - 0.00001);
        applyPose();
        triggerEvents(before, state.time);
        if (!loops && next >= clip.duration) setPlaying(false);
      }
      world?.update(drawDelta, now / 1000, {
        position: active.gltf.scene
          .getObjectByName("Root")
          ?.getWorldPosition(new THREE.Vector3()),
        sport: active.meta.sport,
        clip: state.clip,
        time: state.time,
        playing: state.playing,
      });
      const begin = performance.now();
      render();
      frames++;
      state.lastDraw = now;
      renderSamples.push(performance.now() - begin);
      if (renderSamples.length > 600) renderSamples.shift();
      if (now - performanceStart > 1000) {
        fps = frames / ((now - performanceStart) / 1000);
        frames = 0;
        performanceStart = now;
        diagnostics();
      }
    }
    requestAnimationFrame(tick);
  }
  function effect(kind) {
    if (!active || !state.ready) return;
    const position = (
      state.focus === "athlete"
        ? active.gltf.scene.position.clone()
        : world.getFocusPoint(state.focus)
    ).add(new THREE.Vector3(0, 0.03, 0));
    world?.[kind]?.(position, 1);
    $("tools-dialog").close();
    state.effectUntil =
      performance.now() +
      (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1600);
    render();
  }
  $("toggle-play").onclick = () => setPlaying(!state.playing);
  $("clip").onchange = (e) => setClip(e.target.value);
  $("time").oninput = (e) => {
    if (!active || !state.ready) return;
    setPlaying(false);
    state.time = +e.target.value * clipFor(active, state.clip).duration;
    applyPose();
    render();
  };
  document.querySelectorAll("[data-athlete]").forEach(
    (b) =>
      (b.onclick = async () => {
        state.focus = "athlete";
        document.body.dataset.focus = "athlete";
        $("focus").value = "athlete";
        await selectAthlete(+b.dataset.athlete);
        await setView("close");
      }),
  );
  document
    .querySelectorAll("[data-env]")
    .forEach((b) => (b.onclick = () => setEnvironment(b.dataset.env)));
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        setFocus("athlete");
        setView(b.dataset.view);
      }),
  );
  $("orbit-reset").onclick = () => setView(state.view);
  $("open-controls").onclick = () => $("tools-dialog").showModal();
  $("open-info").onclick = () => $("info-dialog").showModal();
  $("speed").onchange = (e) => (state.speed = +e.target.value);
  $("focus").onchange = async (e) => {
    setPlaying(false);
    setFocus(e.target.value);
    if (e.target.value === "athlete") await setView("close");
    $("tools-dialog").close();
  };
  $("detail").onchange = async (e) => {
    state.detail = e.target.value;
    await updateLOD();
    render();
  };
  $("powder").onclick = () => effect("triggerPowder");
  $("landing").onclick = () => effect("triggerLanding");
  $("skeleton").onclick = () => {
    state.rig = !state.rig;
    helper.visible = state.rig;
    $("skeleton").setAttribute("aria-pressed", String(state.rig));
    render();
  };
  $("wireframe").onclick = () => {
    state.wire = !state.wire;
    for (const r of records.values()) applyMaterials(r.gltf.scene, r.meta.id);
    $("wireframe").setAttribute("aria-pressed", String(state.wire));
    render();
  };
  let pointers = new Map(),
    pinchDistance = 0;
  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x,
      dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      state.yaw -= dx * 0.007;
      state.elevation = clamp(state.elevation + dy * 0.003, -0.02, 0.65);
    } else {
      const p = [...pointers.values()],
        d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDistance > 0)
        state.distance = clamp(
          (state.distance * pinchDistance) / Math.max(d, 1),
          2.8,
          35,
        );
      pinchDistance = d;
    }
    updateLOD();
    render();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(event, (e) => {
      pointers.delete(e.pointerId);
      pinchDistance = 0;
    });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      state.distance = clamp(
        state.distance * Math.exp(e.deltaY * 0.001),
        2.8,
        35,
      );
      updateLOD();
      render();
    },
    { passive: false },
  );
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    setPlaying(false);
    $("status").className = "status-pill error";
    $("status").textContent = "התצוגה נעצרה. רעננו כדי לטעון שוב את הנכסים.";
  });
  document.addEventListener("visibilitychange", () => {
    lastRAF = 0;
  });
  world = await buildWorld({
    THREE,
    scene,
    loadGLB,
    quality: "medium",
    assetURL: (p) => assetURL(`world/${p.replace(/^\.\//, "")}`),
  });
  setEnvironment("sunset");
  await selectAthlete(0, 0);
  resize();
  state.ready = true;
  performanceStart = performance.now();
  frames = 0;
  for (const control of loadingControls) control.disabled = false;
  $("stage").setAttribute("aria-busy", "false");
  setPlaying(state.playing);
  $("status").textContent = "מוכן";
  $("status").classList.add("ready");
  window.alpine = {
    state,
    scene,
    camera,
    renderer,
    world,
    characters,
    records,
    async set({
      focus = "athlete",
      athlete = state.athlete,
      view = state.view,
      environment = state.environment,
      clip = state.clip,
      time = 0,
      playing = false,
      yaw,
      elevation,
      detail,
    } = {}) {
      renderBatchDepth++;
      try {
        setPlaying(false);
        if (detail) {
          state.detail = detail;
          $("detail").value = detail;
        }
        if (athlete !== state.athlete) await selectAthlete(athlete);
        await setView(view);
        setEnvironment(environment);
        setClip(clip, time);
        setFocus(focus);
        if (yaw !== undefined) state.yaw = yaw;
        if (elevation !== undefined) state.elevation = elevation;
        setPlaying(playing);
      } finally {
        renderBatchDepth--;
      }
      render();
      diagnostics();
      return this.snapshot();
    },
    snapshot() {
      return {
        ...state,
        viewport: [width, height],
        bundleBuiltAt: pack.builtAt,
        bundleSources: pack.sourceHashes,
        threeRevision: THREE.REVISION,
        render: { ...renderer.info.render },
        renderScope: "main and shadow passes; excludes PMREM setup",
        memory: { ...renderer.info.memory },
        programs: renderer.info.programs.length,
        actorScale,
        pixelRatio: renderer.getPixelRatio(),
        drawingBufferSize: renderer
          .getDrawingBufferSize(new THREE.Vector2())
          .toArray(),
        loadedRecords: records.size,
        characterRoots: scene.children.filter((o) => o.userData.alpineRecordKey)
          .length,
        pendingLoads: pendingRecords.size,
        fps,
        renderSamples: [...renderSamples],
        clips: active.gltf.animations.map((c) => ({
          name: c.name,
          duration: c.duration,
        })),
        events: events.slice(-20),
        worldStats: world.stats,
      };
    },
    render,
    resetStatistics() {
      renderSamples.length = 0;
      events.length = 0;
      frames = 0;
      fps = 0;
      performanceStart = performance.now();
    },
    async preload() {
      for (let i = 0; i < characters.length; i++)
        for (let l = 0; l <= characters[i].lods.length; l++)
          await getRecord(i, l);
      return records.size;
    },
    get active() {
      return active;
    },
  };
  window.__ALPINE_READY = true;
  requestAnimationFrame(tick);
}

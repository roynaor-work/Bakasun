import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(
  "/tmp/alpine-v7-tools/node_modules/playwright-core/index.mjs"
);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-dev-shm-usage",
  ],
});
const report = {
  startedAt: new Date().toISOString(),
  mode: "Single-file HTML loaded into about:blank with browser network disabled; no localhost server",
  errors: [],
  consoleErrors: [],
  externalRequests: [],
  viewports: [],
  checks: [],
};
for (const size of [
  [390, 844],
  [844, 390],
]) {
  const context = await browser.newContext({
    viewport: { width: size[0], height: size[1] },
    deviceScaleFactor: 1.5,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await context.setOffline(true);
  if (!report.localFileNavigation) {
    const probe = await context.newPage();
    try {
      await probe.goto(
        pathToFileURL(path.join(root, "preview-standalone.html")).href,
        { waitUntil: "load", timeout: 15000 },
      );
      await probe.waitForFunction(
        () => window.__ALPINE_READY || window.__ALPINE_ERROR,
        null,
        { timeout: 90000 },
      );
      const error = await probe.evaluate(() => window.__ALPINE_ERROR);
      if (error) throw Error(error);
      report.localFileNavigation = {
        status: "passed",
        mode: "file:// with network disabled",
      };
    } catch (error) {
      const constrained = /ERR_BLOCKED_BY_ADMINISTRATOR/.test(error.message);
      report.localFileNavigation = {
        status: constrained ? "blocked by managed browser policy" : "failed",
        error: error.message,
      };
      if (!constrained) report.errors.push(error.message);
    } finally {
      await probe.close();
    }
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.consoleErrors.push(m.text());
  });
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) report.externalRequests.push(r.url());
  });
  await page.setContent(
    await fs.readFile(path.join(root, "preview-standalone.html"), "utf8"),
    { waitUntil: "load", timeout: 90000 },
  );
  await page.waitForFunction(
    () => window.__ALPINE_READY || window.__ALPINE_ERROR,
    null,
    { timeout: 90000 },
  );
  const err = await page.evaluate(() => window.__ALPINE_ERROR);
  if (err) throw Error(err);
  const baseline = await page.evaluate(() => window.alpine.snapshot());
  report.checks.push({
    name: `${size.join("x")} local three r160`,
    pass: baseline.threeRevision === "160",
  });
  const names = baseline.clips.map((c) => c.name);
  report.checks.push({
    name: `${size.join("x")} fourteen clips`,
    pass: names.length === 14,
    names,
  });
  const before = await page.evaluate(() => window.alpine.state.time);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.alpine.state.time);
  report.checks.push({
    name: `${size.join("x")} reduced motion and pause freeze`,
    pass: before === after,
    before,
    after,
  });
  await page
    .getByRole("button", { name: "סנובורדיסטית", exact: false })
    .click();
  await page.waitForFunction(() => window.alpine.state.athlete === 1);
  report.checks.push({
    name: `${size.join("x")} athlete button changes sport`,
    pass: await page.evaluate(
      () => window.alpine.active.meta.sport === "snowboard",
    ),
  });
  await page.locator("#clip").selectOption("trick_360");
  await page.locator("#time").evaluate((e) => {
    e.value = "0.5";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  report.checks.push({
    name: `${size.join("x")} seek pauses at chosen phase`,
    pass: await page.evaluate(
      () =>
        !window.alpine.state.playing &&
        Math.abs(
          window.alpine.state.time /
            window.alpine.active.action.getClip().duration -
            0.5,
        ) < 0.001,
    ),
  });
  const particle = [];
  for (const environment of ["sunset", "fog", "night-floodlit"]) {
    await page.evaluate(async (env) => {
      await window.alpine.set({
        environment: env,
        clip: "glide",
        time: 0,
        playing: false,
      });
      window.alpine.world.triggerPowder([0, 0.03, 0], 1);
      window.alpine.world.triggerLanding([0, 0.03, 0], 1);
      window.alpine.world.update(0.08, 0.08);
      window.alpine.render();
    }, environment);
    particle.push(
      await page.evaluate(() => ({
        environment: window.alpine.state.environment,
        active: window.alpine.world.stats.activeParticles,
        render: window.alpine.renderer.info.render,
      })),
    );
  }
  report.checks.push({
    name: `${size.join("x")} particle shaders all lighting`,
    pass: particle.every((p) => p.active > 0),
    particle,
  });
  await page.locator("#open-controls").click();
  await page.locator("#detail").selectOption("low");
  await page.waitForFunction(() => window.alpine.state.activeLOD === 2);
  await page.locator("#tools-dialog form button").click();
  report.checks.push({
    name: `${size.join("x")} forced LOD`,
    pass: await page.evaluate(() => window.alpine.state.activeLOD === 2),
  });
  await page.evaluate(() =>
    window.alpine.set({ clip: "glide", view: "wide", detail: "auto" }),
  );
  await page.mouse.move(size[0] * 0.55, size[1] * 0.5);
  await page.mouse.wheel(0, -400);
  await page.waitForFunction(() => window.alpine.state.activeLOD === 1);
  report.checks.push({
    name: `${size.join("x")} middle LOD loads through zoom`,
    pass: await page.evaluate(() => window.alpine.state.activeLOD === 1),
  });
  await page.evaluate(() => {
    for (const index of [1, 0, 1, 0, 1])
      document.querySelector(`[data-athlete="${index}"]`).click();
  });
  await page.waitForFunction(
    () =>
      window.alpine.state.athlete === 1 &&
      window.alpine.snapshot().pendingLoads === 0,
  );
  const rapid = await page.evaluate(() => window.alpine.snapshot());
  report.checks.push({
    name: `${size.join("x")} rapid athlete changes share pending loads`,
    pass:
      rapid.loadedRecords === rapid.characterRoots && rapid.loadedRecords <= 9,
    loadedRecords: rapid.loadedRecords,
    characterRoots: rapid.characterRoots,
  });
  await page.locator("#open-controls").click();
  await page.locator("#powder").click();
  const pausedParticle = await page.evaluate(() => window.alpine.snapshot());
  report.checks.push({
    name: `${size.join("x")} explicit powder visible while paused`,
    pass:
      !pausedParticle.playing && pausedParticle.worldStats.activeParticles > 0,
  });
  await page.evaluate(() =>
    window.alpine.set({ clip: "accelerate", time: 2.55, playing: true }),
  );
  const oneShotSettled = await page
    .waitForFunction(
      () =>
        !window.alpine.state.playing &&
        Math.abs(window.alpine.state.time - 2.6) < 0.01,
      null,
      { timeout: 5000 },
    )
    .then(
      () => true,
      () => false,
    );
  const once = await page.evaluate(() => window.alpine.snapshot());
  report.checks.push({
    name: `${size.join("x")} one-shot clamps at the end`,
    pass: oneShotSettled && !once.playing && Math.abs(once.time - 2.6) < 0.01,
    time: once.time,
  });
  await page.setViewportSize({ width: size[1], height: size[0] });
  // ResizeObserver runs on a rendering opportunity; SwiftShader can take longer
  // than a fixed100ms. Wait for the actual app viewport, with a bounded failure.
  const rotationSettled = await page
    .waitForFunction(
      ([width, height]) => {
        const viewport = window.alpine.snapshot().viewport;
        return viewport[0] === width && viewport[1] === height;
      },
      [size[1], size[0]],
      { timeout: 10000 },
    )
    .then(
      () => true,
      () => false,
    );
  const rotated = await page.evaluate(() => window.alpine.snapshot());
  report.checks.push({
    name: `${size.join("x")} orientation change resizes scene`,
    pass:
      rotationSettled &&
      rotated.viewport[0] === size[1] &&
      rotated.viewport[1] === size[0],
    observedViewport: rotated.viewport,
    expectedViewport: [size[1], size[0]],
  });
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.waitForFunction(
    ([width, height]) => {
      const viewport = window.alpine.snapshot().viewport;
      return viewport[0] === width && viewport[1] === height;
    },
    size,
    { timeout: 10000 },
  );
  await page.evaluate(() =>
    window.alpine.set({ clip: "glide", view: "close", playing: true }),
  );
  await page.mouse.move(size[0] * 0.55, size[1] * 0.5);
  await page.mouse.down();
  for (let i = 0; i < 12; i++)
    await page.mouse.move(
      size[0] * 0.55 + i * 2,
      size[1] * 0.5 + Math.sin(i) * 4,
    );
  await page.mouse.up();
  await page.waitForTimeout(250);
  report.checks.push({
    name: `${size.join("x")} orbit does not starve playback`,
    pass: await page.evaluate(
      () => window.alpine.state.playing && window.alpine.state.time > 0.05,
    ),
  });
  await page.evaluate(() =>
    window.alpine.set({ clip: "glide", view: "close", playing: false }),
  );
  const beforePinch = await page.evaluate(() => window.alpine.state.distance);
  const touch = await context.newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: size[0] * 0.42, y: size[1] * 0.52 },
      { id: 2, x: size[0] * 0.62, y: size[1] * 0.52 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: size[0] * 0.35, y: size[1] * 0.52 },
      { id: 2, x: size[0] * 0.69, y: size[1] * 0.52 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touch.detach();
  const afterPinch = await page.evaluate(() => window.alpine.state.distance);
  report.checks.push({
    name: `${size.join("x")} two-finger pinch changes zoom`,
    pass: afterPinch < beforePinch * 0.9,
    beforePinch,
    afterPinch,
  });
  const bounds = [];
  // Bounds use the real posed/skinned vertices and camera projection. Rasterizing
  // the full world does not affect them; UI/shader checks above and the separate
  // sustained matrix retain real GPU rendering. Keep the preview wrapper active
  // so camera/view offsets are still updated for every configuration.
  await page.evaluate(() => {
    window.__alpineAuditRender = window.alpine.renderer.render;
    window.alpine.renderer.render = () => {};
  });
  try {
    for (const view of ["close", "wide"])
      for (let athlete = 0; athlete < 3; athlete++)
        for (const clip of baseline.clips.map((c) => c.name)) {
          for (const phase of [
            ...new Set([
              0,
              0.1,
              0.23,
              0.38,
              0.5,
              0.64,
              0.77,
              0.85,
              0.95,
              1,
              ...(clip === "fall_roll"
                ? [0.55, 0.5583333333, 0.5666666667, 0.575, 0.5833333333]
                : []),
            ]),
          ]) {
            await page.evaluate(
              async (config) => {
                if (["fall_roll", "get_up"].includes(config.clip)) {
                  await window.alpine.set({
                    ...config,
                    clip: "ramp_jump",
                    time: 1.62,
                  });
                  const clip = document.querySelector("#clip");
                  clip.value = config.clip;
                  clip.dispatchEvent(new Event("change", { bubbles: true }));
                  const time = document.querySelector("#time");
                  time.value = String(
                    config.time /
                      window.alpine.active.action.getClip().duration,
                  );
                  time.dispatchEvent(new Event("input", { bubbles: true }));
                } else await window.alpine.set(config);
              },
              {
                athlete,
                view,
                detail: "high",
                clip,
                time:
                  (baseline.clips.find((c) => c.name === clip)?.duration || 3) *
                  phase,
                playing: false,
              },
            );
            const box = await page.evaluate(() => {
              const a = window.alpine,
                point = new a.camera.position.constructor();
              let left = Infinity,
                right = -Infinity,
                top = Infinity,
                bottom = -Infinity,
                behind = false;
              const uiPanel =
                a.state.view === "close" &&
                ["fall_roll", "get_up"].includes(a.state.clip)
                  ? document
                      .querySelector(".athletes")
                      .getBoundingClientRect()
                      .toJSON()
                  : null;
              const ui = uiPanel
                ? {
                    panel: uiPanel,
                    criticalVertices: 0,
                    overlaps: 0,
                    examples: [],
                  }
                : null;
              const criticalBones = new Set([
                "LeftForeArm",
                "LeftHand",
                "RightForeArm",
                "RightHand",
                "Head",
              ]);
              const components = ["getX", "getY", "getZ", "getW"];
              a.scene.updateMatrixWorld(true);
              a.camera.updateMatrixWorld();
              a.active.gltf.scene.traverse((mesh) => {
                if (mesh.isSkinnedMesh) mesh.skeleton.update();
              });
              a.active.gltf.scene.traverse((mesh) => {
                if (!mesh.isMesh) return;
                for (
                  let i = 0;
                  i < mesh.geometry.attributes.position.count;
                  i++
                ) {
                  mesh
                    .getVertexPosition(i, point)
                    .applyMatrix4(mesh.matrixWorld)
                    .project(a.camera);
                  const x = ((point.x + 1) * innerWidth) / 2,
                    y = ((1 - point.y) * innerHeight) / 2;
                  if (ui && mesh.isSkinnedMesh) {
                    const indices = mesh.geometry.attributes.skinIndex;
                    const weights = mesh.geometry.attributes.skinWeight;
                    let influence = 0;
                    for (let component = 0; component < 4; component++) {
                      if (
                        criticalBones.has(
                          mesh.skeleton.bones[indices[components[component]](i)]
                            ?.name,
                        )
                      )
                        influence += weights[components[component]](i);
                    }
                    if (influence > 0.2) {
                      ui.criticalVertices++;
                      if (
                        x >= uiPanel.left &&
                        x <= uiPanel.right &&
                        y >= uiPanel.top &&
                        y <= uiPanel.bottom
                      ) {
                        ui.overlaps++;
                        if (ui.examples.length < 8) ui.examples.push({ x, y });
                      }
                    }
                  }
                  left = Math.min(left, x);
                  right = Math.max(right, x);
                  top = Math.min(top, y);
                  bottom = Math.max(bottom, y);
                  if (
                    !Number.isFinite(x) ||
                    !Number.isFinite(y) ||
                    point.z < -1 ||
                    point.z > 1
                  )
                    behind = true;
                }
              });
              return {
                left,
                right,
                top,
                bottom,
                behind,
                ui,
                poseTime: a.state.time,
                poseYaw: a.state.yaw,
                poseClip: a.state.clip,
              };
            });
            bounds.push({
              athlete,
              view,
              clip,
              phase,
              bounds: box,
              inside:
                box.left >= 0 &&
                box.right <= size[0] &&
                box.top >= 0 &&
                box.bottom <= size[1] &&
                !box.behind,
            });
          }
        }
  } finally {
    await page.evaluate(() => {
      window.alpine.renderer.render = window.__alpineAuditRender;
      delete window.__alpineAuditRender;
      window.alpine.render();
    });
  }
  report.checks.push({
    name: `${size.join("x")} full body and equipment framing`,
    method:
      "All posed/skinned vertices projected with the actual preview camera; rasterization skipped only during this geometry sweep",
    pass: bounds.every((b) => b.inside),
    failures: bounds.filter((b) => !b.inside),
    samples: bounds.length,
  });
  const uiBounds = bounds.filter((b) => b.bounds.ui);
  report.checks.push({
    name: `${size.join("x")} near fall and recovery hands clear of athlete controls`,
    method:
      "Actual skinned head/forearm/hand vertices with joint influence above0.2 projected against the actual athlete-controls rectangle",
    pass:
      uiBounds.length === 75 &&
      uiBounds.every(
        (b) => b.bounds.ui.criticalVertices > 0 && b.bounds.ui.overlaps === 0,
      ),
    samples: uiBounds.length,
    failures: uiBounds.filter(
      (b) => !b.bounds.ui.criticalVertices || b.bounds.ui.overlaps > 0,
    ),
  });
  const transitions = bounds.filter((b) =>
    ["fall_roll", "get_up"].includes(b.clip),
  );
  const transitionPassed = (b) =>
    b.bounds.poseClip === b.clip &&
    Math.abs(b.bounds.poseYaw - (b.view === "wide" ? 0.42 : 0.55)) < 1e-8 &&
    Math.abs(
      b.bounds.poseTime -
        baseline.clips.find((c) => c.name === b.clip).duration * b.phase,
    ) < 0.005;
  report.checks.push({
    name: `${size.join("x")} air to ground selection restores camera preset`,
    method:
      "Enter ramp_jump, select the ground clip through its real change event, then seek with the real timeline input; no ground setView call masks the transition",
    pass: transitions.length === 150 && transitions.every(transitionPassed),
    samples: transitions.length,
    failures: transitions.filter((b) => !transitionPassed(b)),
  });
  report.viewports.push({
    size,
    baseline,
    final: await page.evaluate(() => window.alpine.snapshot()),
  });
  await context.close();
}
await browser.close();
report.completedAt = new Date().toISOString();
report.pass =
  !report.errors.length &&
  !report.consoleErrors.length &&
  !report.externalRequests.length &&
  report.checks.every((c) => c.pass);
await fs.writeFile(
  path.join(root, "verification/browser-audit.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    pass: report.pass,
    checks: report.checks.map((c) => ({ name: c.name, pass: c.pass })),
    errors: report.errors,
    consoleErrors: report.consoleErrors,
    externalRequests: report.externalRequests,
  }),
);
if (!report.pass) process.exitCode = 1;

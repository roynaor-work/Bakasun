/** Sustained offline rendering matrix, no external requests, one browser only. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(
  "/tmp/alpine-v7-tools/node_modules/playwright-core/index.mjs"
);
const sharp = (
  await import("/tmp/alpine-v7-tools/node_modules/sharp/lib/index.js")
).default;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const dwell = +arg("--dwell", "10"),
  limit = +arg("--limit", "504"),
  out = path.join(root, "verification/matrix");
await fs.mkdir(out, { recursive: true });
const html = await fs.readFile(
  path.join(root, "preview-standalone.html"),
  "utf8",
);
const report = {
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  playbackProtocol:
    "At least10 wall-clock seconds of actual playback with independently observed time changes and rendered frames. Unfinished one-shots then receive a separately recorded seek-assisted near-end probe. This does not claim that every full clip naturally completes in ten seconds under software rendering.",
  sourceHTMLSHA256: crypto.createHash("sha256").update(html).digest("hex"),
  dwellSeconds: dwell,
  expectedCases: limit,
  devicePixelRatio: 1.5,
  minimumProgressTimeoutSeconds: 45,
  endProbeTimeoutSeconds: 45,
  toolSourceSHA256: crypto
    .createHash("sha256")
    .update(await fs.readFile(fileURLToPath(import.meta.url)))
    .digest("hex"),
  execution: {
    node: process.version,
    cpuAffinity:
      (await fs.readFile("/proc/self/status", "utf8")).match(
        /^Cpus_allowed_list:\s*(.*)$/m,
      )?.[1] ?? null,
    cpuQuota: (await fs.readFile("/sys/fs/cgroup/cpu.max", "utf8")).trim(),
  },
  renderer:
    "Chromium / ANGLE SwiftShader, software rendering; not physical phone performance",
  cases: [],
  errors: [],
  externalRequests: [],
  baselines: [],
};
const casesFile = path.join(out, "cases.jsonl");
if ((await fs.stat(casesFile).catch(() => null))?.size)
  throw Error(
    "Existing matrix cases must be preserved before starting a fresh run",
  );
await fs.writeFile(casesFile, "");
async function persistProgress() {
  const { cases, ...metadata } = report;
  const journal = {
    ...metadata,
    updatedAt: new Date().toISOString(),
    caseCount: cases.length,
    lastCompletedId: cases.at(-1)?.id ?? null,
  };
  const temporary = path.join(out, "run-state.tmp");
  await fs.writeFile(temporary, JSON.stringify(journal, null, 2) + "\n");
  await fs.rename(temporary, path.join(out, "run-state.json"));
}
await persistProgress();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
  ],
});
let serial = 0;
for (const size of [
  [390, 844],
  [844, 390],
]) {
  const context = await browser.newContext({
    viewport: { width: size[0], height: size[1] },
    hasTouch: true,
    deviceScaleFactor: 1.5,
    reducedMotion: "reduce",
  });
  await context.setOffline(true);
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    report.errors.push({ case: serial, message: e.message }),
  );
  page.on("console", (m) => {
    if (m.type() === "error")
      report.errors.push({ case: serial, message: m.text() });
  });
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) report.externalRequests.push(r.url());
  });
  await page.setContent(html, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(
    () => window.__ALPINE_READY || window.__ALPINE_ERROR,
    null,
    { timeout: 90000 },
  );
  const err = await page.evaluate(() => window.__ALPINE_ERROR);
  if (err) throw Error(err);
  await page.evaluate(() => window.alpine.preload());
  // Warm all9LOD meshes and3atlases before measuring resource stability.
  for (let athlete = 0; athlete < 3; athlete++)
    for (const detail of ["high", "low"])
      await page.evaluate((config) => window.alpine.set(config), {
        athlete,
        detail,
        clip: "glide",
        playing: false,
      });
  report.baselines.push({
    size,
    snapshot: await page.evaluate(() => window.alpine.snapshot()),
  });
  await persistProgress();
  for (const environment of ["sunset", "fog", "night-floodlit"])
    for (let athlete = 0; athlete < 3; athlete++)
      for (const view of ["close", "wide"]) {
        const clips = await page.evaluate(() =>
          window.alpine.snapshot().clips.map((c) => c.name),
        );
        for (const clip of clips) {
          if (serial >= limit) break;
          // A control file permits evidence capture without running two GPU sessions.
          while (
            await fs.access(path.join(out, "pause")).then(
              () => true,
              () => false,
            )
          )
            await new Promise((r) => setTimeout(r, 500));
          const id = String(++serial).padStart(3, "0"),
            start = Date.now(),
            state = {
              athlete,
              view,
              environment,
              clip,
              time: 0,
              playing: true,
              detail: "auto",
            };
          await page.bringToFront();
          await page.evaluate((config) => window.alpine.set(config), state);
          await page.evaluate(() => {
            const a = window.alpine;
            a.resetStatistics();
            const trace = {
              active: true,
              initialTime: a.state.time,
              observedSamples: 0,
              changedSamples: 0,
              minTime: a.state.time,
              maxTime: a.state.time,
              lastTime: a.state.time,
              startedAtMilliseconds: performance.now(),
              lastObservedAtMilliseconds: performance.now(),
              maximumRAFGapMilliseconds: 0,
              initialVisibility: document.visibilityState,
              initialFocus: document.hasFocus(),
            };
            window.__alpineMatrixTrace = trace;
            function observe() {
              if (!trace.active) return;
              const time = a.state.time;
              const now = performance.now();
              trace.maximumRAFGapMilliseconds = Math.max(
                trace.maximumRAFGapMilliseconds,
                now - trace.lastObservedAtMilliseconds,
              );
              trace.lastObservedAtMilliseconds = now;
              trace.observedSamples++;
              if (Math.abs(time - trace.lastTime) > 1e-7)
                trace.changedSamples++;
              trace.minTime = Math.min(trace.minTime, time);
              trace.maxTime = Math.max(trace.maxTime, time);
              trace.lastTime = time;
              requestAnimationFrame(observe);
            }
            requestAnimationFrame(observe);
          });
          await page.waitForTimeout(dwell * 1000);
          const minimumProgressReady = await page
            .waitForFunction(
              () =>
                window.alpine.snapshot().renderSamples.length >= 2 &&
                window.__alpineMatrixTrace.changedSamples >= 2,
              null,
              { timeout: report.minimumProgressTimeoutSeconds * 1000 },
            )
            .then(
              () => true,
              () => false,
            );
          const progressObservation = await page.evaluate(() => {
            const trace = window.__alpineMatrixTrace;
            trace.active = false;
            const now = performance.now();
            trace.finalRAFGapMilliseconds =
              now - trace.lastObservedAtMilliseconds;
            trace.maximumRAFGapMilliseconds = Math.max(
              trace.maximumRAFGapMilliseconds,
              trace.finalRAFGapMilliseconds,
            );
            trace.observationElapsedMilliseconds =
              now - trace.startedAtMilliseconds;
            trace.finalVisibility = document.visibilityState;
            trace.finalFocus = document.hasFocus();
            const { active, ...observation } = trace;
            return observation;
          });
          const snapshot = await page.evaluate(() => window.alpine.snapshot());
          const timings = snapshot.renderSamples.slice().sort((a, b) => a - b);
          snapshot.renderTimingMilliseconds = {
            samples: timings.length,
            minimum: timings[0] ?? null,
            median: timings[Math.floor(timings.length * 0.5)] ?? null,
            p95: timings[Math.floor(timings.length * 0.95)] ?? null,
            maximum: timings.at(-1) ?? null,
            scope: "CPU submission time; GPU completion is not measured",
          };
          delete snapshot.renderSamples;
          snapshot.clipDuration = snapshot.clips.find(
            (c) => c.name === clip,
          ).duration;
          delete snapshot.clips;
          delete snapshot.bundleSources;
          const entry = {
            id,
            viewport: size,
            configuration: state,
            elapsedSeconds: (Date.now() - start) / 1000,
            snapshot,
            progressObservation,
            jsHeap: await page.evaluate(() =>
              performance.memory
                ? {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                  }
                : null,
            ),
          };
          const loops = [
            "glide",
            "carve_left",
            "carve_right",
            "crouch",
            "celebrate",
          ].includes(clip);
          entry.looping = loops;
          entry.naturalEnd = loops
            ? null
            : !snapshot.playing &&
              Math.abs(snapshot.time - snapshot.clipDuration) < 0.01;
          entry.runPlaybackPass =
            minimumProgressReady &&
            snapshot.renderTimingMilliseconds.samples >= 2 &&
            progressObservation.changedSamples >= 2 &&
            snapshot.time >= 0 &&
            snapshot.time <= snapshot.clipDuration + 0.01 &&
            (loops ? snapshot.playing : snapshot.playing || entry.naturalEnd);
          if (!loops && !entry.naturalEnd) {
            const probeStart = Date.now();
            const seekStartTime = Math.max(0, snapshot.clipDuration - 0.05);
            await page.bringToFront();
            await page.evaluate((config) => window.alpine.set(config), {
              ...state,
              time: seekStartTime,
            });
            const settled = await page
              .waitForFunction(
                (duration) =>
                  !window.alpine.state.playing &&
                  Math.abs(window.alpine.state.time - duration) < 0.01,
                snapshot.clipDuration,
                { timeout: report.endProbeTimeoutSeconds * 1000 },
              )
              .then(
                () => true,
                () => false,
              );
            const finalSnapshot = await page.evaluate(() => {
              const s = window.alpine.snapshot();
              return {
                time: s.time,
                playing: s.playing,
                clip: s.clip,
                athlete: s.athlete,
                view: s.view,
                environment: s.environment,
                pixelRatio: s.pixelRatio,
                bundleBuiltAt: s.bundleBuiltAt,
                memory: s.memory,
                loadedRecords: s.loadedRecords,
                characterRoots: s.characterRoots,
                visibility: document.visibilityState,
                focused: document.hasFocus(),
              };
            });
            entry.endProbe = {
              method: "seek-assisted near-end playback",
              timeoutSeconds: report.endProbeTimeoutSeconds,
              seekStartTime,
              startedAt: new Date(probeStart).toISOString(),
              elapsedSeconds: (Date.now() - probeStart) / 1000,
              finalSnapshot,
              pass:
                settled &&
                !finalSnapshot.playing &&
                Math.abs(finalSnapshot.time - snapshot.clipDuration) < 0.01,
            };
          }
          entry.playbackPass =
            entry.runPlaybackPass &&
            (loops || entry.naturalEnd || entry.endProbe?.pass === true);
          const resourcesWithinBudget = (s) =>
            s.memory.geometries < 200 &&
            s.memory.textures < 64 &&
            s.loadedRecords === s.characterRoots;
          entry.resourcesPass =
            resourcesWithinBudget(snapshot) &&
            (!entry.endProbe ||
              resourcesWithinBudget(entry.endProbe.finalSnapshot));
          if (["carve_left", "ramp_jump", "fall_roll"].includes(clip)) {
            entry.screenshotPose = await page.evaluate(
              (phaseSource) => {
                window.alpine.state.playing = false;
                window.alpine.render();
                return {
                  time: window.alpine.state.time,
                  playing: false,
                  clip: window.alpine.state.clip,
                  phaseSource,
                };
              },
              entry.endProbe ? "seek-assisted end probe" : "ten-second run",
            );
            const imageName = `${id}-${size.join("x")}-${environment}-${athlete}-${view}-${clip}.webp`;
            await sharp(await page.screenshot({ scale: "css" }))
              .webp({ quality: 88 })
              .toFile(path.join(out, imageName));
            entry.screenshot = imageName;
          }
          entry.totalElapsedSeconds = (Date.now() - start) / 1000;
          report.cases.push(entry);
          await fs.appendFile(casesFile, JSON.stringify(entry) + "\n");
          await persistProgress();
          if (serial % 3 === 0)
            console.log(
              JSON.stringify({
                completed: serial,
                total: limit,
                viewport: size,
                environment,
                athlete,
                view,
                clip,
                playbackPass: entry.playbackPass,
                geometry: snapshot.memory.geometries,
                textures: snapshot.memory.textures,
                fps: snapshot.fps.toFixed(1),
              }),
            );
        }
      }
  await context.close();
  if (serial >= limit) break;
}
await browser.close();
report.completedAt = new Date().toISOString();
report.durationMinutes =
  (Date.parse(report.completedAt) - Date.parse(report.startedAt)) / 60000;
report.pass =
  report.cases.length === limit &&
  report.cases.every((c) => c.playbackPass && c.resourcesPass) &&
  !report.errors.length &&
  !report.externalRequests.length;
report.summary = {
  cases: report.cases.length,
  seekAssistedEndProbes: report.cases.filter((c) => c.endProbe).length,
  naturalOneShotEnds: report.cases.filter((c) => c.naturalEnd === true).length,
  failures: report.cases
    .filter((c) => !c.playbackPass || !c.resourcesPass)
    .map((c) => ({
      id: c.id,
      configuration: c.configuration,
      viewport: c.viewport,
      playbackPass: c.playbackPass,
      resourcesPass: c.resourcesPass,
    })),
  maxGeometries: Math.max(
    ...report.cases.map((c) => c.snapshot.memory.geometries),
  ),
  maxTextures: Math.max(...report.cases.map((c) => c.snapshot.memory.textures)),
};
await fs.writeFile(
  path.join(root, "verification/matrix-soak.json"),
  JSON.stringify(report, null, 2) + "\n",
);
await persistProgress();
console.log(
  JSON.stringify({
    pass: report.pass,
    durationMinutes: report.durationMinutes,
    ...report.summary,
    errors: report.errors,
    externalRequests: report.externalRequests,
  }),
);
if (!report.pass) process.exitCode = 1;

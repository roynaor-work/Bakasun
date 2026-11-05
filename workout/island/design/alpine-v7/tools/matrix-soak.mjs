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
const resume = process.argv.includes("--resume");
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
  screenshotTimeoutSeconds: 90,
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
  recoveryBaselines: [],
  continuations: [],
  controllerSegments: [],
  replayCases: [],
};
const casesFile = path.join(out, "cases.jsonl");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const sourceBytes = await fs.readFile(fileURLToPath(import.meta.url));
let recoveredCount = 0,
  replayDirectory = null;
if (resume) {
  const archive = path.join(out, "continuation-01");
  const priorBytes = await fs.readFile(path.join(archive, "run-state.json"));
  const prefixBytes = await fs.readFile(path.join(archive, "cases.jsonl"));
  const prior = JSON.parse(priorBytes);
  const rows = prefixBytes
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const fail = (message) => {
    throw Error("Cannot resume: " + message);
  };
  if (
    prior.schemaVersion !== 2 ||
    prior.sourceHTMLSHA256 !== report.sourceHTMLSHA256 ||
    prior.expectedCases !== limit ||
    prior.dwellSeconds !== dwell ||
    prior.devicePixelRatio !== 1.5 ||
    prior.minimumProgressTimeoutSeconds !== 45 ||
    prior.endProbeTimeoutSeconds !== 45 ||
    prior.execution.cpuAffinity !== report.execution.cpuAffinity ||
    prior.execution.cpuQuota !== report.execution.cpuQuota
  )
    fail("source, protocol or CPU identity changed");
  if (
    prior.errors.length ||
    prior.externalRequests.length ||
    rows.length !== prior.caseCount ||
    rows.length !== 285
  )
    fail("the preserved285-case prefix is incomplete or failed");
  if (
    digest(await fs.readFile(path.join(archive, "controller.mjs"))) !==
      prior.toolSourceSHA256 ||
    !prefixBytes.equals(await fs.readFile(casesFile))
  )
    fail("preserved source/prefix bytes changed");
  const expected = [];
  for (const viewport of [
    [390, 844],
    [844, 390],
  ])
    for (const environment of ["sunset", "fog", "night-floodlit"])
      for (let athlete = 0; athlete < 3; athlete++)
        for (const view of ["close", "wide"])
          for (const clip of prior.baselines[0].snapshot.clips.map(
            (c) => c.name,
          ))
            expected.push({ viewport, environment, athlete, view, clip });
  for (const [i, row] of rows.entries()) {
    const e = expected[i],
      c = row.configuration;
    if (
      row.id !== String(i + 1).padStart(3, "0") ||
      row.viewport.join("x") !== e.viewport.join("x") ||
      c.environment !== e.environment ||
      c.athlete !== e.athlete ||
      c.view !== e.view ||
      c.clip !== e.clip ||
      c.time !== 0 ||
      c.playing !== true ||
      c.detail !== "auto" ||
      !row.playbackPass ||
      !row.resourcesPass ||
      row.elapsedSeconds < dwell ||
      row.snapshot.pixelRatio !== 1.5 ||
      row.snapshot.bundleBuiltAt !== prior.baselines[0].snapshot.bundleBuiltAt
    )
      fail("invalid completed prefix at" + row.id);
    if (row.screenshot) await fs.access(path.join(out, row.screenshot));
  }
  recoveredCount = rows.length;
  report.startedAt = prior.startedAt;
  report.cases = rows;
  report.baselines = prior.baselines;
  const resumedAt = new Date().toISOString();
  report.continuations.push({
    index: 1,
    resumedAt,
    completedPrefix: recoveredCount,
    incompleteCase: "286",
    reason:
      "Original Playwright screenshot timed out after30000ms; incomplete286 is fully rerun with90s capture patience and explicit retry evidence",
    archiveDirectory: "verification/matrix/continuation-01",
    prefixSHA256: digest(prefixBytes),
    previousJournalSHA256: digest(priorBytes),
    previousLogSHA256: digest(await fs.readFile(path.join(archive, "run.log"))),
    previousControllerSHA256: prior.toolSourceSHA256,
    replayStart: 253,
    replayEnd: 285,
    replayDirectory: "verification/matrix/replay-01",
  });
  report.controllerSegments.push({
    index: 1,
    firstCase: 1,
    lastCase: 285,
    startedAt: prior.startedAt,
    lastCheckpointAt: prior.updatedAt,
    sourceFile: "verification/matrix/continuation-01/controller.mjs",
    toolSourceSHA256: prior.toolSourceSHA256,
  });
  report.controllerSegments.push({
    index: 2,
    firstCase: 286,
    lastCase: 285,
    startedAt: resumedAt,
    sourceFile: "verification/matrix/controller-02.mjs",
    toolSourceSHA256: report.toolSourceSHA256,
  });
  await fs.writeFile(path.join(out, "controller-02.mjs"), sourceBytes);
  replayDirectory = path.join(out, "replay-01");
  await fs.mkdir(replayDirectory, { recursive: true });
  if (
    (await fs.stat(path.join(replayDirectory, "cases.jsonl")).catch(() => null))
      ?.size
  )
    fail("replay evidence already exists");
  await fs.writeFile(path.join(replayDirectory, "cases.jsonl"), "");
} else if ((await fs.stat(casesFile).catch(() => null))?.size)
  throw Error(
    "Existing matrix cases must be preserved before starting a fresh run",
  );
else {
  await fs.writeFile(casesFile, "");
  await fs.writeFile(path.join(out, "controller-01.mjs"), sourceBytes);
  report.controllerSegments.push({
    index: 1,
    firstCase: 1,
    lastCase: 0,
    startedAt: report.startedAt,
    sourceFile: "verification/matrix/controller-01.mjs",
    toolSourceSHA256: report.toolSourceSHA256,
  });
}
async function persistProgress() {
  const { cases, replayCases, ...metadata } = report;
  const journal = {
    ...metadata,
    updatedAt: new Date().toISOString(),
    caseCount: cases.length,
    replayCaseCount: replayCases.length,
    replayExpectedCount: resume ? 33 : 0,
    replayLastId: replayCases.at(-1)?.id ?? null,
    replayFailures: replayCases
      .filter((c) => !c.playbackPass || !c.resourcesPass)
      .map((c) => c.id),
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
  if (resume && size[0] === 390 && recoveredCount >= 252) {
    serial += 252;
    continue;
  }
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
  const baseline = {
    size,
    snapshot: await page.evaluate(() => window.alpine.snapshot()),
  };
  if (resume)
    report.recoveryBaselines.push({
      ...baseline,
      controllerSegment: 2,
      observedAt: new Date().toISOString(),
    });
  else report.baselines.push(baseline);
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
            replaying = resume && serial <= recoveredCount,
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
            controllerSegment: resume ? 2 : 1,
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
            entry.captureAttempts = [];
            let screenshot;
            for (let attempt = 1; attempt <= 2; attempt++) {
              const began = Date.now();
              try {
                screenshot = await page.screenshot({
                  scale: "css",
                  timeout: report.screenshotTimeoutSeconds * 1000,
                });
                entry.captureAttempts.push({
                  attempt,
                  startedAt: new Date(began).toISOString(),
                  elapsedSeconds: (Date.now() - began) / 1000,
                  passed: true,
                });
                break;
              } catch (error) {
                entry.captureAttempts.push({
                  attempt,
                  startedAt: new Date(began).toISOString(),
                  elapsedSeconds: (Date.now() - began) / 1000,
                  passed: false,
                  error: error.message,
                });
                console.error(
                  JSON.stringify({
                    captureTimeout: id,
                    replaying,
                    attempt,
                    error: error.message,
                  }),
                );
                if (attempt === 2 || !/Timeout/i.test(error.message))
                  throw error;
              }
            }
            await sharp(screenshot)
              .webp({ quality: 88 })
              .toFile(path.join(replaying ? replayDirectory : out, imageName));
            entry.screenshot = replaying ? "replay-01/" + imageName : imageName;
          }
          entry.totalElapsedSeconds = (Date.now() - start) / 1000;
          if (replaying) {
            entry.replayOfId = id;
            report.replayCases.push(entry);
            await fs.appendFile(
              path.join(replayDirectory, "cases.jsonl"),
              JSON.stringify(entry) + "\n",
            );
          } else {
            report.cases.push(entry);
            report.controllerSegments.at(-1).lastCase = serial;
            await fs.appendFile(casesFile, JSON.stringify(entry) + "\n");
          }
          await persistProgress();
          if (serial % 3 === 0)
            console.log(
              JSON.stringify({
                completed: serial,
                phase: replaying ? "replay" : "new",
                persistedMainCases: report.cases.length,
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
  (!resume ||
    (report.replayCases.length === 33 &&
      report.replayCases.every((c) => c.playbackPass && c.resourcesPass))) &&
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

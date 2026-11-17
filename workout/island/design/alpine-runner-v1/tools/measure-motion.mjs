// SPDX-License-Identifier: CC0-1.0
// Sample the delivered GLB with the immutable motion-qa-v1 reader and formulas.
import { readFile, writeFile, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(base, "../../../..");
const pinned = "5eb4f093bc22523ee417a7f2345c3b813bffba24";
const qaPath = "workout/island/design/motion-qa-v1";
const workspace = await mkdtemp(
  path.join(tmpdir(), "alpine-runner-motion-qa-"),
);
const qaRoot = path.join(workspace, qaPath);
await mkdir(qaRoot, { recursive: true });
try {
  execFileSync("git", ["cat-file", "-e", `${pinned}^{commit}`], {
    cwd: repo,
    stdio: "pipe",
  });
} catch {
  execFileSync(
    "git",
    ["fetch", "--depth=1", "--filter=blob:none", "--no-tags", "origin", pinned],
    { cwd: repo, stdio: "inherit" },
  );
}
const hash = (b) => createHash("sha256").update(b).digest("hex");
const provenance = [];
for (const file of ["metrics.mjs", "glb.mjs"]) {
  const bytes = execFileSync("git", ["show", `${pinned}:${qaPath}/${file}`], {
    cwd: repo,
    maxBuffer: 4e6,
  });
  await writeFile(path.join(qaRoot, file), bytes);
  provenance.push({
    path: `${qaPath}/${file}`,
    commit: pinned,
    sha256: hash(bytes),
    bytes: bytes.length,
  });
}
// The original reader imports its existing MIT Three.js dependency; no patching.
await mkdir(path.join(qaRoot, "../soccer-motion-v8/runtime"), {
  recursive: true,
});
await symlink(
  path.join(repo, "workout/island/design/soccer-motion-v8/runtime/vendor"),
  path.join(qaRoot, "../soccer-motion-v8/runtime/vendor"),
  "dir",
);
const { sampleGLB } = await import(
  pathToFileURL(path.join(qaRoot, "glb.mjs")).href
);
const { analyzeClip, METRICS } = await import(
  pathToFileURL(path.join(qaRoot, "metrics.mjs")).href
);
const spec = JSON.parse(
  await readFile(path.join(base, "character-spec.json"), "utf8"),
);
const assetPath = spec.suits[0].path;
const asset = await readFile(path.join(base, assetPath));
const rotate = (q, p) => {
  const [x, y, z, w] = q,
    [a, b, c] = p,
    tx = 2 * (y * c - z * b),
    ty = 2 * (z * a - x * c),
    tz = 2 * (x * b - y * a);
  return [
    a + w * tx + y * tz - z * ty,
    b + w * ty + z * tx - x * tz,
    c + w * tz + x * ty - y * tx,
  ];
};
const samples = new Map(
  spec.clips.map((c) => {
    const native = sampleGLB(asset, { animation: c.name, fps: 120 });
    // Reader's default 8cm probe is not this model's 5.5cm ski sole. Preserve
    // sampled joint poses and declare the real bone-local sole for this geometry.
    for (const f of native.frames)
      f.floorPoints = ["LeftFoot", "RightFoot"].map((b) => ({
        bone: b,
        position: f.joints[b].map(
          (v, i) =>
            v + rotate(f.rotations[b], c.soleLocal ?? [0, -0.055, 0])[i],
        ),
      }));
    return [c.name, native];
  }),
);
const nearest = (frames, time) =>
  frames.reduce((a, b) =>
    Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a,
  );
function reference(descriptor, fallback) {
  const d = descriptor ?? fallback;
  const name = typeof d === "string" ? d : d.clip;
  const native = samples.get(name);
  if (!native) throw Error(`Unknown transition reference ${name}`);
  const time = d.timeSeconds ?? d.time;
  if (typeof d === "string" || time === undefined) return native.frames;
  const t = time === "end" ? native.duration : time;
  // Keep true neighboring samples so endpoint velocities remain measurable.
  return native.frames.filter((f) => Math.abs(f.t - t) <= 1 / 60 + 1e-6);
}
function measure(clip, native) {
  const metadata = {
    loop: clip.loop,
    rootMotion: clip.name.startsWith("jump"),
    locomotion: false,
    ballVisible: false,
    ballContacts: [],
    events: clip.events ?? [],
    supports: clip.supports ?? [],
    soleLocal: clip.soleLocal ?? [0, -0.055, 0],
    floorY: 0,
    checkHingeDirection: true,
    symmetryMode: "structural",
    kind: "ski-slide",
    coordinateSpace:
      "Actual delivered GLB in canonical metres; external forward/lane travel excluded",
    floorProbeKind:
      "Actual ski sole center [0,-.055,0] transformed from native GLB joints plus skeletal joint centers; whole mesh audited separately",
    ...clip.qaMetadata,
  };
  const entryReference =
    clip.transitionReferences?.entry ?? clip.entryReference;
  const exitReference = clip.transitionReferences?.exit ?? clip.exitReference;
  const idleFrames = {
    entry: reference(entryReference, "glide"),
    exit: reference(exitReference, "glide"),
  };
  const measured = analyzeClip({
    frames: native.frames,
    duration: native.duration,
    height: native.height,
    metadata,
    idleFrames,
    clipId: clip.name,
    sport: "alpine",
  });
  return {
    id: clip.name,
    sourceClips: clip.sourceClips ?? [clip.name],
    durationSeconds: native.duration,
    samples: native.frames.length,
    heightMeters: native.height,
    entryReference: entryReference ?? "glide",
    exitReference: exitReference ?? "glide",
    ...measured,
    metadata,
  };
}
const jumpNames = ["jump_rise", "jump_apex", "jump_land"];
const phaseDiagnostics = spec.clips
  .filter((c) => jumpNames.includes(c.name))
  .map((c) => measure(c, samples.get(c.name)));
const rows = spec.clips
  .filter((c) => !jumpNames.includes(c.name))
  .map((c) => measure(c, samples.get(c.name)));
let jumpTime = 0;
const jumpFrames = [];
for (const name of jumpNames) {
  const native = samples.get(name);
  for (const frame of native.frames) {
    const t = frame.t + jumpTime;
    if (jumpFrames.length && t - jumpFrames.at(-1).t < 1e-6) continue;
    jumpFrames.push({ ...frame, t });
  }
  jumpTime += native.duration;
}
rows.push(
  measure(
    {
      name: "jump",
      sourceClips: jumpNames,
      loop: false,
      soleLocal: [0, -0.055, 0],
      transitionReferences: {
        entry: { clip: "glide", timeSeconds: 0 },
        exit: { clip: "glide", timeSeconds: 0 },
      },
    },
    {
      frames: jumpFrames,
      duration: jumpTime,
      height: samples.get("jump_rise").height,
    },
  ),
);
const fail = rows.filter(
  (c) =>
    c.score <= 88 ||
    c.coverage !== 1 ||
    Object.values(c.metrics).some((m) => m.status === "red"),
);
const report = {
  schemaVersion: 1,
  tool: "motion-qa-v1",
  qaCommit: pinned,
  qaFiles: provenance,
  invocation:
    "Original analyzeClip() and sampleGLB() loaded byte-for-byte; 120Hz plus original 30Hz sample times; declared intended state transitions",
  sourceAsset: assetPath,
  sourceSha256: hash(asset),
  sampleHz: 120,
  deliveredClips: 13,
  measuredActions: rows.length,
  metricDefinitions: METRICS,
  scoreKind:
    "Original weighted reproducible screening proxy; not a perceptual quality score",
  skiingSemantics:
    "Skis slide continuously: gait cadence/bodySliding is not applicable. Forward travel and lane displacement are driven externally by the preview. FootSliding checks the stance in the local sliding frame.",
  minimumScore: Math.min(...rows.map((c) => c.score)),
  averageScore: rows.reduce((s, c) => s + c.score, 0) / rows.length,
  redMetrics: rows.reduce(
    (n, c) =>
      n + Object.values(c.metrics).filter((m) => m.status === "red").length,
    0,
  ),
  jumpMeasurement:
    "Three delivered clips are sampled consecutively as one real jump action for the scoring gate. Isolated airborne phases have no support contacts; the original footSliding formula cannot express this as not-applicable. Per-phase diagnostics remain unmodified below and are not claimed as passing standalone scores.",
  phaseDiagnostics,
  clips: rows,
  passed: fail.length === 0,
  failures: fail.map((c) => ({
    id: c.id,
    score: c.score,
    coverage: c.coverage,
    reasons: c.reasons,
  })),
};
await mkdir(path.join(base, "verification"), { recursive: true });
await writeFile(
  path.join(base, "verification/motion-qa.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      clips: rows.length,
      minimumScore: report.minimumScore,
      redMetrics: report.redMetrics,
      passed: report.passed,
      failures: report.failures,
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;

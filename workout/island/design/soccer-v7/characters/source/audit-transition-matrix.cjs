/**
 * Bounded verification of the actual packaged viewer, not a GPU benchmark.
 *
 * Run after the models, offline payloads and runtime are frozen:
 *   node source/audit-transition-matrix.cjs
 * Optional --out=/absolute/directory selects a temporary report directory.
 * Optional --workers=2 permits two numeric browser jobs; the default is one.
 * Aggregate: <out>/transitions-matrix.json; per-model reports: <out>/transitions/.
 * A durable /tmp journal records the owning PID, child/Chromium processes,
 * immutable input hash and completed report hashes. Restarting resumes only
 * exact matching completed reports; a still-live owned process blocks a
 * duplicate queue. Use a different output directory for a changed snapshot.
 *
 * Runs all eight identities at both explicit LODs through the 66 live action
 * and interrupted transition sequences at the target 30 Hz integration rate.
 * Then repeats player-01 LOD0 at 120 Hz for denser geometry samples. Each child
 * loads the actual classic-script package and decoded Draco GLB, measures every
 * deformed vertex after IK, and records the served payload hashes. Children run
 * with one or two workers. Rendering is suppressed during samples, so no FPS
 * is inferred. Input changes, execution errors and signals abort owned workers.
 *
 * The input snapshot is immutable across the entire queue. A model, payload,
 * manifest, motion, runtime, or auditor change prevents an aggregate pass even
 * when all individual reports happened to pass at different points in time.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const argument = process.argv.find(value => value.startsWith("--out="));
const outputIndex = process.argv.indexOf("--out");
const outputDirectory = path.resolve(argument?.slice(6) || (outputIndex >= 0 ? process.argv[outputIndex + 1] : path.join(root, "verification")));
const workersArgument = process.argv.find(value => value.startsWith("--workers="));
const workersIndex = process.argv.indexOf("--workers");
const workerCount = Number(workersArgument?.slice(10) || (workersIndex >= 0 ? process.argv[workersIndex + 1] : 1));
if (![1, 2].includes(workerCount)) throw new Error("--workers must be 1 or 2");
const auditor = path.join(__dirname, "audit-transitions.cjs");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const stamp = file => {
  const bytes = fs.readFileSync(path.join(root, file));
  return { bytes: bytes.length, sha256: digest(bytes) };
};
const maximum = values => values.length ? Math.max(...values) : 0;
const minimum = values => values.length ? Math.min(...values) : null;
const statePath = path.join("/tmp", "soccer-v7-transition-matrix-" + digest(Buffer.from(outputDirectory)).slice(0, 16) + ".json");
// The kernel lock closes the startup race between two resumed shell sessions.
// Its guardian stays alive if the requesting shell disconnects.
if (process.env.SOCCER_V7_MATRIX_LOCKED !== statePath) {
  const locked = spawnSync("flock", ["-n", "-E", "75", statePath + ".lock", process.execPath, __filename, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, SOCCER_V7_MATRIX_LOCKED: statePath } });
  if (locked.status === 75) console.error("Matrix queue already owns the lock; inspect " + statePath);
  if (locked.error) console.error(locked.error);
  process.exit(locked.status ?? 1);
}
let journal;
const runningChildren = new Map();
let abortReason = null, cleanupPromise = null, inputMonitor = null;
function processIdentity(pid) {
  try { const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" "); return { pid, startedTicks: fields[19], state: fields[0] }; } catch { return null; }
}
function processIsAlive(identity) {
  const actual = identity && processIdentity(identity.pid);
  return Boolean(actual && !["Z", "X"].includes(actual.state) && actual.startedTicks === identity.startedTicks);
}
function processTable() {
  return fs.readdirSync("/proc").filter(name => /^\d+$/.test(name)).flatMap(name => {
    try { const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8"), fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" "); return [{ pid: Number(name), parent: Number(fields[1]), startedTicks: fields[19], state: fields[0] }]; } catch { return []; }
  });
}
function descendantsOf(pid, rows = processTable()) {
  try {
    const found = new Set([pid]);
    for (let changed = true; changed;) { changed = false; for (const row of rows) if (found.has(row.parent) && !found.has(row.pid)) { found.add(row.pid); changed = true; } }
    return rows.filter(row => found.has(row.pid)).map(({ pid, startedTicks, state }) => ({ pid, startedTicks, state }));
  } catch { return [processIdentity(pid)].filter(Boolean); }
}
function saveJournal() {
  // Synchronous writes on the single JS event loop serialize all workers and
  // monitor/signal callbacks. fsync + rename makes each receipt atomic.
  journal.updatedAt = new Date().toISOString();
  journal.writeSequence = (journal.writeSequence || 0) + 1;
  const temporary = statePath + "." + process.pid + ".tmp";
  const handle = fs.openSync(temporary, "w", 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(journal, null, 2) + "\n"); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  fs.renameSync(temporary, statePath);
}
function unchangedInputNames(inputs) {
  return Object.keys(inputs).filter(file => { try { return stamp(file).sha256 !== inputs[file].sha256; } catch { return true; } });
}

function abortOwnedWorkers(reason) {
  abortReason ||= reason instanceof Error ? reason : new Error(String(reason));
  if (cleanupPromise) return cleanupPromise;
  if (inputMonitor) { clearInterval(inputMonitor); inputMonitor = null; }
  const identities = new Map();
  const table = processTable();
  for (const job of Object.values(journal.activeJobs || {})) for (const identity of [job.child, ...(job.ownedProcesses || [])].filter(Boolean)) identities.set(identity.pid + "/" + identity.startedTicks, identity);
  for (const [workerID, item] of runningChildren) {
    const owned = processIsAlive(item.identity) ? descendantsOf(item.child.pid, table) : [];
    for (const identity of [...(journal.activeJobs[workerID]?.ownedProcesses || []), ...owned, item.identity].filter(Boolean)) identities.set(identity.pid + "/" + identity.startedTicks, identity);
    if (journal.activeJobs[workerID]) journal.activeJobs[workerID].ownedProcesses = [...new Map([...(journal.activeJobs[workerID].ownedProcesses || []), ...owned].map(identity => [identity.pid + "/" + identity.startedTicks, identity])).values()];
  }
  journal.status = "aborting"; journal.error = String(abortReason);
  journal.cleanup = { startedAt: new Date().toISOString(), ownedProcesses: [...identities.values()], stillLive: [...identities.values()].filter(processIsAlive) }; saveJournal();
  const signal = type => { for (const identity of [...identities.values()].reverse()) if (processIsAlive(identity)) { try { process.kill(identity.pid, type); } catch {} } };
  signal("SIGTERM");
  cleanupPromise = (async () => {
    for (let i = 0; i < 8 && [...identities.values()].some(processIsAlive); i++) await new Promise(resolve => setTimeout(resolve, 125));
    signal("SIGKILL");
    for (let i = 0; i < 8 && [...identities.values()].some(processIsAlive); i++) await new Promise(resolve => setTimeout(resolve, 125));
    journal.cleanup = { completedAt: new Date().toISOString(), ownedProcesses: [...identities.values()], stillLive: [...identities.values()].filter(processIsAlive) };
    journal.status = "interrupted-or-failed"; saveJournal();
  })();
  return cleanupPromise;
}
function execute(args, job, workerID) {
  return new Promise((resolve, reject) => {
    if (abortReason) { reject(abortReason); return; }
    const child = spawn(process.execPath, [auditor, ...args], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const identity = processIdentity(child.pid);
    runningChildren.set(workerID, { child, identity });
    journal.maximumConcurrentWorkersObserved = Math.max(journal.maximumConcurrentWorkersObserved || 0, runningChildren.size);
    journal.activeJobs[workerID] = { ...job, workerID, startedAt: new Date().toISOString(), child: identity, ownedProcesses: descendantsOf(child.pid) };
    saveJournal();
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => { runningChildren.delete(workerID); reject(error); });
    child.on("close", (exitCode, signal) => { runningChildren.delete(workerID); resolve({ exitCode, signal, stderr }); });
  });
}

function summarize(report, relativeFile, exit) {
  const sequences = report.results || [];
  const boundaries = sequences.flatMap(row => row.boundaries);
  const coverage = sequences.flatMap(row => Object.values(row.supportCoverage));
  return {
    characterID: report.characterID,
    lod: report.testedLOD,
    updateRateHz: report.updateRateHz,
    report: relativeFile,
    reportPackagePath:path.relative(root,path.join(outputDirectory,relativeFile)).split(path.sep).join('/'),
    reportSha256: digest(fs.readFileSync(path.join(outputDirectory, relativeFile))),
    auditSource: report.auditSource,
    observerSource: report.observerSource,
    complete: report.complete === true,
    runtimeSha256: report.servedResources?.["vendor/viewer-runtime.js"]?.sha256,
    dataSha256: report.servedResources?.["vendor/data.js"]?.sha256,
    models: report.loadedModels,
    pass: report.pass === true && report.complete === true && exit.exitCode === 0,
    exitCode: exit.exitCode,
    failedChecks: Object.entries(report.checks || {}).filter(([, pass]) => !pass).map(([name]) => name),
    sequences: sequences.length,
    samples: sequences.reduce((sum, row) => sum + row.sampleCount, 0),
    minimumVertexY: minimum(sequences.map(row => row.minVertexY)),
    maximumPlantAnchorDistanceMeters: maximum(sequences.map(row => row.maxPlantAnchorDistanceMeters)),
    maximumImmediateBonePositionMeters: maximum(boundaries.map(row => row.jump.maximumBonePositionMeters)),
    maximumImmediateVisibleWorldRotationDegrees: maximum(boundaries.map(row => row.jump.maximumBoneRotationDegrees)),
    maximumImmediateRootPositionMeters: maximum(boundaries.map(row => row.jump.rootPathMeters)),
    maximumAdvancingBoneTravelPerSampleMeters: maximum(sequences.map(row => row.maximumBoneTravelPerSampleMeters || 0)),
    maximumAdvancingJointAngularSpeedRadiansPerSecond: maximum(sequences.map(row => row.maximumJointAngularSpeedRadiansPerSecond || 0)),
    maximumRootRelativeBoneSpeedMps: maximum(sequences.map(row => row.maximumRootRelativeBoneSpeedMps || 0)),
    maximumAdvancingBoneRotationPerSampleDegrees: maximum(sequences.map(row => row.maximumBoneRotationPerSampleDegrees || 0)),
    worstAdvancingBoneStep: sequences.reduce((worst, row) => !worst || (row.worstBoneStep?.meters || 0) > (worst.meters || 0) ? row.worstBoneStep : worst, null),
    worstAdvancingBoneRotationStep: sequences.reduce((worst, row) => !worst || (row.worstBoneRotationStep?.degrees || 0) > (worst.degrees || 0) ? row.worstBoneRotationStep : worst, null),
    maximumFirstStepRootVelocityJumpMps: maximum(boundaries.map(row => row.firstStep?.velocityJumpMps || 0)),
    maximumUnadmittedNearGroundXZStepMeters: maximum(coverage.map(row => row.maximumNearGroundUnadmittedXZStepMeters)),
    maximumLandingProjectionMeters: maximum(sequences.map(row => row.maximumLandingProjectionMeters)),
    maximumLandingKinematicDeviationMeters: maximum(sequences.map(row => row.maximumLandingKinematicDeviationMeters || 0)),
    maximumRecoveryLifetimeSeconds: maximum(sequences.map(row => row.maximumRecoveryLifetimeSeconds)),
    maximumLandingReleaseSoleStepMeters: maximum(sequences.map(row => row.maximumLandingReleaseSoleStepMeters)),
    physicalPalmExpectedSamples:sequences.reduce((sum,row)=>sum+(row.physicalPalmObservation?.expectedSamples||0),0),
    physicalPalmPositiveSolverSamples:sequences.reduce((sum,row)=>sum+(row.physicalPalmObservation?.positiveSolverSamples||0),0),
    maximumPhysicalPalmPatchAnchorDistanceMeters:maximum(sequences.map(row=>row.physicalPalmObservation?.maximumPlantDistanceMeters||0)),
    maximumPhysicalPalmPatchXZDistanceMeters:maximum(sequences.map(row=>row.physicalPalmObservation?.maximumPlantXZDistanceMeters||0)),
    bodySettlingSamples:sequences.reduce((sum,row)=>sum+(row.bodySettlingObservation?.samples||0),0),
    bodySettlingImplementationDiagnostics:sequences.reduce((sum,row)=>sum+(row.bodySettlingObservation?.implementationDiagnostics?.length||0),0),
    maximumSettledAuthoredHandSupportResidualMeters: maximum(sequences.map(row => row.maxSettledAuthoredHandSupportResidualMeters)),
    stderr: exit.stderr.trim() || undefined
  };
}

(async () => {
  const startedAt = new Date().toISOString();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "asset-manifest.json"), "utf8"));
  const identities = manifest.characters.map(character => character.id);
  if (identities.length !== 8 || new Set(identities).size !== 8) throw new Error("Expected eight distinct identities");
  const jobs = identities.flatMap(characterID => [0, 1].map(lod => ({ characterID, lod, hz: 30, file: `transitions/${characterID}-lod${lod}-30hz.json` })));
  jobs.push({ characterID: "player-01", lod: 0, hz: 120, file: "transitions-120hz.json" });
  const models = jobs.filter(job => job.hz === 30).map(job => `models/${job.characterID}-lod${job.lod}.glb`);
  for (const character of manifest.characters) {
    if (character.kits.length !== 1) throw new Error(`Expected one kit per identity: ${character.id}`);
    for (const lod of [0, 1]) if (character.kits[0][`lod${lod}`] !== `models/${character.id}-lod${lod}.glb`) throw new Error(`Unexpected manifest path for ${character.id}/LOD${lod}`);
  }
  const sourceFiles = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = directory + "/" + entry.name;
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:js|mjs|cjs|py|json|wasm)$/.test(entry.name) ? [file] : [];
  });
  const files = [...new Set([
    "asset-manifest.json", "animations.json", "rig.json", "motion-manifest.json", "verification/boot-bounds.json",
    "preview.html", "preview.css", "preview.js", "source/motion-runtime.js",
    "vendor/viewer-runtime.js", "vendor/data.js",
    "source/audit-transitions.cjs", "source/audit-transition-matrix.cjs",
    ...sourceFiles("source"), ...sourceFiles("vendor"),
    ...models, ...models.map(file => file.replace("models/", "offline/").replace(/\.glb$/, ".js"))
  ])].sort();
  const inputs = Object.fromEntries(files.map(file => [file, stamp(file)]));
  const snapshotSha256 = digest(Buffer.from(JSON.stringify(inputs)));
  let previousJournal = null;
  try { previousJournal = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previousJournal) {
    const historicalJobs = [previousJournal.activeJob, ...Object.values(previousJournal.activeJobs || {})].filter(Boolean);
    const active = [previousJournal.owner, ...historicalJobs.flatMap(job => [job.child, ...(job.ownedProcesses || [])]), ...(previousJournal.cleanup?.ownedProcesses || [])].filter(processIsAlive);
    if (active.length) throw new Error(`An owned matrix job is still live (${active.map(item => item.pid).join(", ")}). Inspect ${statePath} before launching another queue.`);
    if (previousJournal.snapshotSha256 !== snapshotSha256 || previousJournal.outputDirectory !== outputDirectory) throw new Error(`Input snapshot changed since ${statePath}. Preserve the old reports and use a different --out directory.`);
  }
  journal = { schemaVersion: 2, workerCount, outputDirectory, statePath, snapshotSha256, inputs, owner: processIdentity(process.pid), startedAt: previousJournal?.startedAt || startedAt, resumedAt: previousJournal ? startedAt : null, status: "running", activeJob: null, activeJobs: {}, completed: previousJournal?.completed || [] };
  saveJournal();
  fs.mkdirSync(path.join(outputDirectory, "transitions"), { recursive: true });
  const results = new Array(jobs.length);
  // Start the denser job early; logical job and receipt order stays unchanged.
  const launchIndices = jobs.map((_, index) => index).sort((a, b) => jobs[b].hz - jobs[a].hz || a - b);
  let nextJobIndex = 0;
  const signals = new Map([['SIGINT', 130], ['SIGTERM', 143]]);
  for (const [signal, exitCode] of signals) process.on(signal, () => { process.exitCode = exitCode; void abortOwnedWorkers(new Error('Received ' + signal)); });
  let nextInputCheckAt = 0;
  inputMonitor = setInterval(() => {
    try {
      if (Date.now() >= nextInputCheckAt) {
        nextInputCheckAt = Date.now() + 1000;
        const changed = unchangedInputNames(inputs);
        if (changed.length) { void abortOwnedWorkers(new Error('Frozen inputs changed during jobs: ' + changed.join(', '))); return; }
      }
      const table = processTable();
      for (const [workerID, item] of runningChildren) if (journal.activeJobs[workerID] && processIsAlive(item.identity)) journal.activeJobs[workerID].ownedProcesses = descendantsOf(item.child.pid, table);
      saveJournal();
    } catch (error) { void abortOwnedWorkers(error); }
  }, 250);
  async function worker(workerID) {
    try {
    while (nextJobIndex < jobs.length) {
      if (abortReason) throw abortReason;
      const index = launchIndices[nextJobIndex++], job = jobs[index], destination = path.join(outputDirectory, job.file);
      const changedBeforeJob = unchangedInputNames(inputs);
      if (changedBeforeJob.length) throw new Error('Frozen inputs changed before job: ' + changedBeforeJob.join(', '));
      const completed = journal.completed.find(row => row.file === job.file);
      if (completed) {
        const bytes = fs.readFileSync(destination), report = JSON.parse(bytes.toString('utf8'));
        if (digest(bytes) !== completed.reportSha256 || report.auditSource?.sha256 !== inputs['source/audit-transitions.cjs'].sha256 || report.observerSource?.sha256 !== inputs['source/audit-action-observer.cjs'].sha256 || report.complete !== true || report.servedResources?.['vendor/viewer-runtime.js']?.sha256 !== inputs['vendor/viewer-runtime.js'].sha256 || report.servedResources?.['vendor/data.js']?.sha256 !== inputs['vendor/data.js'].sha256 || report.characterID !== job.characterID || report.testedLOD !== job.lod || report.updateRateHz !== job.hz || report.results?.length !== 66 || report.loadedModels?.length !== 1 || report.loadedModels.some(model => inputs[model.path]?.sha256 !== model.sha256)) throw new Error('Completed report no longer matches the frozen job: ' + destination);
        results[index] = summarize(report, job.file, completed.exit);
        console.log(JSON.stringify({ resumed: true, workerID, completed: index + 1, total: jobs.length, report: destination, reportSha256: completed.reportSha256 }));
        continue;
      }
      // An unreceipted file may be a partial prior attempt. Preserve it, then
      // require this execution to produce its own complete report.
      if (fs.existsSync(destination)) fs.renameSync(destination, destination + ".unreceipted-" + process.pid + "-" + Date.now());
      console.log(`Starting ${index + 1}/${jobs.length} on worker ${workerID}: ${job.characterID} LOD${job.lod} ${job.hz}Hz`);
      const exit = await execute(['--extended', `--sample-hz=${job.hz}`, `--character=${job.characterID}`, `--lod=${job.lod}`, '--out', destination], job, workerID);
      if (abortReason) throw abortReason;
      if (exit.signal || ![0, 1].includes(exit.exitCode)) throw new Error(`Worker ${workerID} failed to execute ${job.file}: ${exit.signal || exit.exitCode} ${exit.stderr}`);
      const report = JSON.parse(fs.readFileSync(destination, 'utf8'));
      if (report.results?.length !== 66) throw new Error('Worker did not finish all 66 cases: ' + destination);
      const row = summarize(report, job.file, exit);
      results[index] = row;
      journal.completed.push({ ...job, workerID, completedAt: new Date().toISOString(), reportPath: destination, reportSha256: row.reportSha256, exit });
      delete journal.activeJobs[workerID]; saveJournal();
      console.log(JSON.stringify({ completed: journal.completed.length, total: jobs.length, workerID, characterID: job.characterID, lod: job.lod, hz: job.hz, pass: row.pass, samples: row.samples, minimumVertexY: row.minimumVertexY, failedChecks: row.failedChecks }));
    }
    } catch (error) { await abortOwnedWorkers(error); throw error; }
  }
  const outcomes = await Promise.allSettled(Array.from({ length: workerCount }, (_, index) => worker(index + 1))); 
  if (inputMonitor) { clearInterval(inputMonitor); inputMonitor = null; }
  if (cleanupPromise) await cleanupPromise;
  const rejected = outcomes.find(result => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  if (abortReason) throw abortReason;
  const changedInputs = files.filter(file => {
    try { return stamp(file).sha256 !== inputs[file].sha256; } catch { return true; }
  });
  if (changedInputs.length) throw new Error("Frozen inputs changed before aggregation: " + changedInputs.join(", "));
  const expectedSelection = results.every((row, index) => row.characterID === jobs[index].characterID && row.lod === jobs[index].lod && row.updateRateHz === jobs[index].hz && row.sequences === 66);
  const provenanceConsistent = results.every(row => row.auditSource?.sha256 === inputs["source/audit-transitions.cjs"].sha256 && row.observerSource?.sha256 === inputs["source/audit-action-observer.cjs"].sha256 && row.complete && row.runtimeSha256 === inputs["vendor/viewer-runtime.js"].sha256 && row.dataSha256 === inputs["vendor/data.js"].sha256 && row.models?.length === 1 && row.models.every(model => inputs[model.path]?.sha256 === model.sha256));
  const checks = {
    allSeventeenRunsPassed: results.length === 17 && results.every(row => row.pass),
    allSeventeenReportsComplete: results.length === 17 && results.every(row => row.complete),
    requestedIdentityLodRateAndSequences: expectedSelection,
    singleFrozenInputSnapshot: changedInputs.length === 0,
    consistentActualPayloadAndAuditorProvenance: provenanceConsistent
  };
  const aggregate = {
    kind: "actual-bundled-viewer-transition-matrix",
    startedAt,
    generatedAt: new Date().toISOString(),
    auditSource: { file: "source/audit-transition-matrix.cjs", sha256: inputs["source/audit-transition-matrix.cjs"].sha256 },
    workerCount,
    method: "Bounded actual-browser verification (one or two independent numeric workers): all eight identities at both LODs, 66 live/interrupted chains per model at 30Hz; player-01 LOD0 repeated at 120Hz. Each run evaluates every skinned mesh vertex after the controller and IK, with the real classic-script runtime and decoded Draco GLB. Exact served payloads and auditor sources are hashed. No GPU renderer timing is inferred.",
    limitations: ["These are 66 representative chains per model, not every possible interruption or variable frame-time pattern.", "Production 30Hz and dense 120Hz are separate stateful solver trajectories.", "Foot plant accuracy uses the documented bone sole marker; actual all-vertex geometry floor is measured independently. Hand support uses an independently reconstructed immutable anatomical Skin/glove triangle with full Hand/ForeArm skinning. Legacy wrist/marker residuals remain descriptive.", "Airborne reach projection and recovery release travel are descriptive metrics and require visual assessment.", "No physical medium-phone GPU/FPS measurement is provided."],
    coverage: { identities: identities.length, explicitLods: [0, 1], modelsAt30Hz: 16, sequencesAt30Hz: results.filter(row => row.updateRateHz === 30).reduce((sum, row) => sum + (row.sequences || 0), 0), sequencesAt120Hz: results.filter(row => row.updateRateHz === 120).reduce((sum, row) => sum + (row.sequences || 0), 0), totalSamples: results.reduce((sum, row) => sum + (row.samples || 0), 0) },
    metrics: { minimumVertexY: minimum(results.map(row => row.minimumVertexY).filter(value => value !== undefined && value !== null)), maximumAdvancingJointAngularSpeedRadiansPerSecond: maximum(results.map(row => row.maximumAdvancingJointAngularSpeedRadiansPerSecond || 0)), maximumRootRelativeBoneSpeedMps: maximum(results.map(row => row.maximumRootRelativeBoneSpeedMps || 0)), maximumPlantAnchorDistanceMeters: maximum(results.map(row => row.maximumPlantAnchorDistanceMeters || 0)), maximumImmediateBonePositionMeters: maximum(results.map(row => row.maximumImmediateBonePositionMeters || 0)), maximumImmediateVisibleWorldRotationDegrees: maximum(results.map(row => row.maximumImmediateVisibleWorldRotationDegrees || 0)), maximumUnadmittedNearGroundXZStepMeters: maximum(results.map(row => row.maximumUnadmittedNearGroundXZStepMeters || 0)), maximumLandingProjectionMeters: maximum(results.map(row => row.maximumLandingProjectionMeters || 0)), maximumLandingKinematicDeviationMeters: maximum(results.map(row => row.maximumLandingKinematicDeviationMeters || 0)), maximumRecoveryLifetimeSeconds: maximum(results.map(row => row.maximumRecoveryLifetimeSeconds || 0)),physicalPalmExpectedSamples:results.reduce((sum,row)=>sum+(row.physicalPalmExpectedSamples||0),0),physicalPalmPositiveSolverSamples:results.reduce((sum,row)=>sum+(row.physicalPalmPositiveSolverSamples||0),0),maximumPhysicalPalmPatchAnchorDistanceMeters:maximum(results.map(row=>row.maximumPhysicalPalmPatchAnchorDistanceMeters||0)),maximumPhysicalPalmPatchXZDistanceMeters:maximum(results.map(row=>row.maximumPhysicalPalmPatchXZDistanceMeters||0)),bodySettlingSamples:results.reduce((sum,row)=>sum+(row.bodySettlingSamples||0),0),bodySettlingImplementationDiagnostics:results.reduce((sum,row)=>sum+(row.bodySettlingImplementationDiagnostics||0),0) },
    inputs,
    changedInputs,
    checks,
    complete: results.length === 17 && results.every(row => row.complete) && expectedSelection && provenanceConsistent && changedInputs.length === 0,
    pass: Object.values(checks).every(Boolean),
    runs: results
  };
  const destination = path.join(outputDirectory, "transitions-matrix.json");
  fs.writeFileSync(destination, JSON.stringify(aggregate, null, 2) + "\n");
  journal.status = "completed"; journal.activeJob = null; journal.activeJobs = {}; journal.aggregate = { path: destination, sha256: digest(fs.readFileSync(destination)), pass: aggregate.pass }; saveJournal();
  console.log(JSON.stringify({ file: destination, pass: aggregate.pass, checks, coverage: aggregate.coverage, metrics: aggregate.metrics }, null, 2));
  if (!aggregate.pass) process.exitCode = 1;
})().catch(async error => { if (journal) { await abortOwnedWorkers(error); journal.status = "interrupted-or-failed"; journal.error = String(error); saveJournal(); } console.error(error); if (!process.exitCode) process.exitCode = 1; });

/**
 * Independent audit of the actual local, classic-script viewer bundle.
 * Run from any directory:
 *   node workout/island/design/soccer-v7/characters/source/audit-transitions.cjs
 * Optional --out /absolute/report.json selects an interim report destination.
 * Add --extended for 28 representative action, keeper, and referee chains.
 * --sample-hz=30 (also 60 or 120) selects the actual stateful update rate;
 * final verification should include both the 120 Hz and target 30 Hz runs.
 * --character=goalkeeper --lod=1 selects another actual decoded identity/LOD;
 * defaults stay player-01/LOD0. --lod accepts 0 or 1, not automatic distance.
 * --gaits-only replaces the sequence list with 60 ordered five-speed run
 * handoffs (20 distinct pairs, three phases), including root-velocity evidence.
 * --gaits-extended adds nine idle/sprint/run_1 edge handoffs to those 60.
 * --sequence-name="exact name" restricts a diagnostic to one named chain.
 * --trace-constraints records raw post-IK pole/leg-axis markers and per-frame
 * landing state without replacing or instrumenting the solver methods.
 * --diagnostic-runtime=/absolute/runtime.js replaces only the served runtime.
 * --diagnostic-root=/absolute/snapshot serves an immutable diagnostic package
 * snapshot, with local codec fallbacks. Either option forces complete:false.
 * Requires Playwright and Chromium; CHROMIUM_PATH may override /usr/bin/chromium.
 *
 * Hand support is measured on an immutable actual anatomical Skin/glove
 * triangle, including mixed Hand/ForeArm skinning. Native/bridge obligations
 * use actual clocks and immutable timing; legacy marker/wrist residuals are
 * descriptive. Opaque captured-body geometry excludes combined Hand/Foot mass
 * >=.5 and retains the existing8mm pre-first-flat support obligation.
 * No source animation, pose, IK, or floor-correction method is replaced. The
 * actual runtime samples 38 live/interrupted sequences (66 with --extended)
 * at 120 Hz; every deformed
 * mesh vertex is checked after its IK pass. GPU rendering is suppressed only
 * during deterministic pose samples, so this is not a performance benchmark.
 * The exact served bundle and decoded GLB payload are SHA-256 stamped. All HTTP
 * requests are restricted to the ephemeral localhost package server. No file://
 * policy bypass and no network service are used.
 *
 * Quaternion comparisons normalize snapshots to avoid false angles caused by
 * six-decimal source quantization. Sole-marker and full-mesh floor evidence are
 * reported separately. Authored versus admitted contact coverage is included so
 * a zero anchor error cannot hide a policy that defers every support contact.
 * Coverage itself is descriptive: delaying a new plant during a live blend can
 * be valid and must be assessed against the displayed motion.
 * The admission gate excludes only authored landings still inside their own
 * duration and an immutable 0.30s observation window. The separately named
 * release/recovery branch restores the current FK swing, must retain no static
 * anchor, and is bounded to 0.08s. It never excuses an expected support plant.
 * Both-frame near-ground drift includes this recovery branch. Projection from
 * an unreachable intended target is reported separately from IK solve error.
 * Advancing poses have independent broad pop guards: 30 rad/s world angular
 * speed per visible joint and 25 m/s bone speed relative to root-path travel.
 * The zero-weight logical Root is excluded from these limb guards. Presentation
 * floor lift remains in the relative speed so a vertical correction cannot
 * hide behind root subtraction. These guards do not prove natural motion.
 * Checks are representative, not a proof of every possible
 * animation interruption, character, LOD, or physical-device frame rate.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");
const {createActionObserver,createPhysicalPalmObserver,createBodySettlingObserver}=require("./audit-action-observer.cjs");
const {DECLARED_SOURCE_FILES,declaredSourceBindings,capturePackageSnapshot}=require("./audit-viewer-session.cjs");
(async () => {
  const root = path.resolve(__dirname, "..");
  const option=name=>{const inline=process.argv.find(value=>value.startsWith(name+"="));const at=process.argv.indexOf(name);return inline?inline.slice(name.length+1):at>=0?process.argv[at+1]:null;};
  const diagnosticRuntime=option("--diagnostic-runtime"),diagnosticRoot=option("--diagnostic-root");
  const runtimePath=diagnosticRuntime?path.resolve(diagnosticRuntime):null,snapshotRoot=diagnosticRoot?path.resolve(diagnosticRoot):null;
  const diagnostic=Boolean(runtimePath||snapshotRoot);
  const runtimeBytes=runtimePath?fs.readFileSync(runtimePath):null;
  const inputFiles=[...new Set(["vendor/viewer-runtime.js", "vendor/data.js", "source/audit-transitions.cjs", "source/audit-action-observer.cjs", "source/audit-viewer-session.cjs",...Object.values(DECLARED_SOURCE_FILES)])];
  const digest=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
  const initialInputs=Object.fromEntries(inputFiles.map(file=>{const bytes=fs.readFileSync(path.join(root,file));return[file,{bytes:bytes.length,sha256:digest(bytes)}];}));
  const diagnosticInputs=Object.fromEntries([...(runtimePath?[runtimePath]:[]),...process.argv.filter(value=>value.startsWith("--diagnostic-source=")).map(value=>path.resolve(value.slice(20)))].map(file=>{const bytes=fs.readFileSync(file);return[file,{bytes:bytes.length,sha256:digest(bytes)}];}));
  const outputIndex = process.argv.indexOf("--out");
  const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(root, "verification/transitions.json");
  const extended = process.argv.includes("--extended");
  const traceConstraints = process.argv.includes("--trace-constraints");
  const extendedGaits = process.argv.includes("--gaits-extended");
  const gaitsOnly = process.argv.includes("--gaits-only") || extendedGaits;
  const sequenceName = process.argv.find(value => value.startsWith("--sequence-name="))?.slice(16);
  const sampleHzArgument = process.argv.find(value => value.startsWith("--sample-hz="));
  const sampleHzIndex = process.argv.indexOf("--sample-hz");
  const sampleHz = Number(sampleHzArgument?.split("=")[1] || (sampleHzIndex >= 0 ? process.argv[sampleHzIndex + 1] : 120));
  if (![30, 60, 120].includes(sampleHz)) throw new Error("--sample-hz must be 30, 60, or 120");
  const characterArgument = process.argv.find(value => value.startsWith("--character="));
  const characterIndex = process.argv.indexOf("--character");
  const characterID = characterArgument?.split("=")[1] || (characterIndex >= 0 ? process.argv[characterIndex + 1] : "player-01");
  const lodArgument = process.argv.find(value => value.startsWith("--lod="));
  const lodIndex = process.argv.indexOf("--lod");
  const testedLOD = Number(lodArgument?.split("=")[1] || (lodIndex >= 0 ? process.argv[lodIndex + 1] : 0));
  if (![0, 1].includes(testedLOD)) throw new Error("--lod must be 0 or 1");
  const observerPath=path.join(__dirname,"audit-action-observer.cjs");
  const observerSourceHash=crypto.createHash("sha256").update(fs.readFileSync(observerPath)).digest("hex");
  const auditSource = { file: "source/audit-transitions.cjs", sha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex") };
  const packageSnapshot=snapshotRoot?null:capturePackageSnapshot(root);
  if(inputFiles.some(file=>digest(fs.readFileSync(path.join(root,file)))!==initialInputs[file].sha256))throw Error("Input changed during RAM package construction");
  const served = {}, servedGLB = {};
  const mime = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname);
    if (!file.startsWith(root + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const relative=path.relative(root,file),snapshotFile=snapshotRoot?path.join(snapshotRoot,relative):null;
      const source=relative==="vendor/viewer-runtime.js"&&runtimePath?runtimePath:snapshotFile&&fs.existsSync(snapshotFile)?snapshotFile:file;
      const bytes=source===runtimePath?runtimeBytes:packageSnapshot?packageSnapshot.bytes.get(relative):fs.readFileSync(source);
      if(!bytes)throw Error("Resource outside frozen package snapshot");
      served[relative] = { bytes: bytes.length, sha256:digest(bytes),source };
      if (file.includes("/offline/")) {
        const match = bytes.toString("utf8").match(/\["([^"]+)"\]="([^"]+)";/);
        if (match) {
          const decoded = Buffer.from(match[2], "base64");
          servedGLB[match[1]] = { path: match[1], bytes: decoded.length, sha256: crypto.createHash("sha256").update(decoded).digest("hex") };
        }
      }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [], remote = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(origin + "/")) remote.push(r.url());
  });
  await page.route(/^https?:/, (route) => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort("blockedbyclient"));
  await page.addInitScript(() => {
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => {
    };
  });
  try {
    await page.goto(origin + "/preview.html?paused&clean", { waitUntil: "load", timeout: 6e4 });
    await page.waitForFunction(() => globalThis.soccerV7?.ready, { timeout: 6e4 });
    await page.evaluate(() => soccerV7.ready);
    const report = await page.evaluate(async ({ extended, gaitsOnly, extendedGaits, traceConstraints, sequenceName, sampleHz, characterID, testedLOD, actionObserverFactorySource,physicalPalmFactorySource,bodySettlingFactorySource }) => {
      const api = soccerV7;
      const makeActionObserver=Function("return ("+actionObserverFactorySource+")")(),makePhysicalPalmObserver=Function("return ("+physicalPalmFactorySource+")")(),makeBodySettlingObserver=Function("return ("+bodySettlingFactorySource+")")();
      const physicalPalmCalibrationCache=new WeakMap();
      api.setPlaying(false);
      await api.setView("body");
      if (api.state().characterID !== characterID) await api.setCharacter(characterID);
      await api.setLOD(testedLOD);
      const { renderer } = api.inspect();
      const realRender = renderer.render;
      renderer.render = () => {
      };
      const fps = sampleHz, dt = 1 / fps, round = (n) => Math.round(n * 1e8) / 1e8;
      const isRecovery = landing => landing?.mode === "release" || landing?.mode === "recovery";
      const landingIdentity = (epoch, bone, landing) => `${epoch}/${bone}/${isRecovery(landing) ? "recovery" : "authored"}/${landing.key}`;
      const describeLanding = (bone, landing, actorClock) => ({ bone, key: landing.key, mode: landing.mode || "authored", start: landing.start, duration: landing.duration, elapsed: actorClock - landing.start, from: landing.from.toArray(), to: landing.to?.toArray() || null, projectionMeters: landing.projectionMeters || 0, kinematicDeviationMeters: landing.kinematicDeviationMeters || 0 });
      let logicalRootWeightedVertexCount = 0, logicalRootPresentInEverySkin = true;
      for (const mesh of api.inspect().actors[0].meshes) {
        const rootIndex = mesh.skeleton.bones.findIndex(bone => bone.name === "Root");
        if (rootIndex < 0) logicalRootPresentInEverySkin = false;
        const indices = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight");
        for (let i = 0; i < indices.count; i++) {
          const joints = [indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)];
          const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
          if (joints.some((joint, k) => joint === rootIndex && values[k] > 1e-8)) logicalRootWeightedVertexCount++;
        }
      }
      const sequences = [
        { name: "phase-aligned locomotion and interrupted fade", start: "run_2", phase: 0.18, segments: [{ advance: 0.25, next: "run_5" }, { advance: 0.06, next: "sprint" }, { advance: 0.32, next: "decelerate" }, { advance: 0.5 }] },
        { name: "short and long pass interrupted from idle", start: "idle", phase: 0.1, segments: [{ advance: 0.15, next: "short_pass" }, { advance: 0.075, next: "long_pass" }, { advance: 1.5 }] },
        { name: "fall to stand recovery", start: "fall", phase: 0, segments: [{ advance: 0.82, next: "get_up" }, { advance: 1.35, next: "run_2" }, { advance: 0.3 }] }
      ];
      for (const start of ["run_1", "run_2", "run_3", "run_4", "run_5"]) for (const phase of [0, 0.18, 0.36, 0.5, 0.68, 0.9, 0.999]) sequences.push({ name: "entry phase " + start + " @ " + phase, start, phase, segments: [{ advance: 0.05, next: "sprint" }, { advance: 0.06, next: "decelerate" }, { advance: 1.15 }] });
      if (extended) {
        for (const start of ["kick", "turn_left", "turn_right", "header"]) for (const phase of [.15, .5, .85]) sequences.push({ name: "action recovery " + start + " @ " + phase, start, phase, segments: [{ advance: .05, next: "run_2" }, { advance: .6 }] });
        for (const phase of [.18, .68]) sequences.push({ name: "dribble kick run @ " + phase, start: "dribble", phase, segments: [{ advance: .12, next: "kick" }, { advance: .25, next: "run_3" }, { advance: .6 }] });
        for (const phase of [.15, .5, .85]) sequences.push({ name: "slide recovery run @ " + phase, start: "slide_tackle", phase, segments: [{ advance: .1, next: "get_up" }, { advance: .8, next: "run_2" }, { advance: .45 }] });
        for (const start of ["keeper_dive_left", "keeper_dive_right", "keeper_dive_high"]) for (const phase of [.25, .75]) sequences.push({ name: "keeper chain " + start + " @ " + phase, start, phase, segments: [{ advance: .1, next: "keeper_catch" }, { advance: .35, next: "keeper_throw" }, { advance: .8, next: "idle" }, { advance: .25 }] });
        for (const phase of [.15, .5, .85]) sequences.push({ name: "keeper punt recovery @ " + phase, start: "keeper_punt", phase, segments: [{ advance: .05, next: "idle" }, { advance: .8 }] });
        for (const phase of [.2, .7]) sequences.push({ name: "referee signal chain @ " + phase, start: "referee_whistle", phase, segments: [{ advance: .1, next: "referee_signal" }, { advance: .4, next: "idle" }, { advance: .6 }] });
      }
      if (gaitsOnly) {
        sequences.length = 0;
        const runs = ["run_1", "run_2", "run_3", "run_4", "run_5"];
        for (const start of runs) for (const target of runs) if (start !== target) for (const phase of [.18, .5, .85]) sequences.push({ name: `ordered gait ${start} to ${target} @ ${phase}`, start, phase, segments: [{ advance: .05, next: target }, { advance: .8 }] });
        if (extendedGaits) for (const [start, target] of [["sprint", "run_1"], ["idle", "sprint"], ["sprint", "idle"]]) for (const phase of [.18, .5, .85]) sequences.push({ name: `critical gait ${start} to ${target} @ ${phase}`, start, phase, segments: [{ advance: .05, next: target }, { advance: .8 }] });
      }
      if (sequenceName) {
        const selected = sequences.filter(sequence => sequence.name === sequenceName);
        if (!selected.length) throw Error("Unknown sequence: " + sequenceName);
        sequences.splice(0, sequences.length, ...selected);
      }
      const results = [];
      const geometryCache=new WeakMap();
      function snapshot(a) {
        const vector = a.model.position.clone();
        const bones = {};
        for (const [n, b] of Object.entries(a.bones)) bones[n] = { q: b.quaternion.clone().normalize(), worldQ: b.getWorldQuaternion(b.quaternion.clone()).normalize(), position: b.getWorldPosition(vector).toArray() };
        const soles = {};
        for (const side of ["LeftFoot", "RightFoot"]) soles[side] = a.bones[side].localToWorld(vector.set(0, -0.08, 0)).toArray();
        const palms = {};
        for (const side of ["LeftHand", "RightHand"]) palms[side] = a.bones[side].localToWorld(vector.set(0, -0.07, 0)).toArray();
        let landingStates;
        if (traceConstraints) landingStates = Object.fromEntries([...a.landings].map(([name, landing]) => {
          const side = name.replace(/Foot$/, ''), hip = a.bones[side + 'UpLeg'].getWorldPosition(a.world.clone()), knee = a.bones[side + 'Leg'].getWorldPosition(a.world.clone()), ankle = a.bones[name].getWorldPosition(a.world.clone());
          const axis = ankle.clone().sub(hip).normalize(), captured = landing.pole.clone(), projected = captured.clone().addScaledVector(axis, -captured.dot(axis));
          const destination = landing.mode === 'release' ? a.kneePole(name) : a.world.clone().set(0, 0, 1).applyAxisAngle(a.world.clone().set(0, 1, 0), landing.worldYaw ?? (a.model.rotation.y + (landing.yawRadians || 0)));
          const toProjected = destination.clone().addScaledVector(axis, -destination.dot(axis));
          const fromUnit = projected.clone().normalize(), toUnit = toProjected.clone().normalize();
          const rawAngle = Math.atan2(axis.dot(axis.clone().crossVectors(fromUnit, toUnit)), Math.max(-1, Math.min(1, fromUnit.dot(toUnit))));
          return [name, { key: landing.key, mode: landing.mode || 'authored', elapsed: a.clock - landing.start, duration: landing.duration, u: (a.clock - landing.start) / landing.duration, hip: hip.toArray(), knee: knee.toArray(), ankle: ankle.toArray(), axis: axis.toArray(), capturedPole: captured.toArray(), capturedPoleDotAxis: captured.dot(axis), capturedPoleProjectionLength: projected.length(), capturedProjectedUnit: fromUnit.toArray(), destinationPole: destination.toArray(), destinationPoleIsPostIKForRelease: landing.mode === 'release', destinationProjectionLength: toProjected.length(), rawProjectedAngleRadians: rawAngle, runtimeUnwrappedPoleAngleRadians: landing.poleAngle ?? null, displayedKneePole: a.kneePole(name).toArray(), kinematicDeviationMeters: landing.kinematicDeviationMeters || 0, from: landing.from?.toArray(), to: landing.to?.toArray() }];
        }));
        if(!geometryCache.has(a))geometryCache.set(a,a.meshes.map((mesh,meshIndex)=>{const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),flags=[];for(let i=0;i<p.count;i++){const js=[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)],ws=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];let footWeight=0,rigid=null,rigidWeight=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[js[k]].name;if(/Foot$/.test(name)){footWeight+=ws[k];if(ws[k]>=.95&&p.getY(i)<.18){rigid=name;rigidWeight=ws[k];}}}flags.push({body:footWeight<.5,rigid,weight:rigidWeight});}return{mesh,meshIndex,count:p.count,flags};}));
        let minimumVertexY=Infinity,nonBootMinimumY=Infinity;const bootVertices={LeftFoot:[],RightFoot:[]};
        for(const piece of geometryCache.get(a))for(let i=0;i<piece.count;i++){const point=piece.mesh.getVertexPosition(i,vector).applyMatrix4(piece.mesh.matrixWorld),flag=piece.flags[i];minimumVertexY=Math.min(minimumVertexY,point.y);if(flag.body)nonBootMinimumY=Math.min(nonBootMinimumY,point.y);if(flag.rigid)bootVertices[flag.rigid].push({meshIndex:piece.meshIndex,vertexIndex:i,weight:flag.weight,position:point.toArray()});}
        return { position: a.model.position.toArray(), world: a.world.toArray(), lift: a.lift, sampleSeconds: a.sampleSeconds, fadeElapsed: a.fade?.elapsed ?? null, bones, soles, palms, landingStates,minimumVertexY,nonBootMinimumY,bootVertices };
      }
      const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
      function jump(a, b) {
        let maxBoneRotation = 0, maxLocalBoneRotation = 0, maxBonePosition = 0, rotationBone, localRotationBone, positionBone;
        for (const name of Object.keys(a.bones)) {
          const r = a.bones[name].worldQ.angleTo(b.bones[name].worldQ), local = a.bones[name].q.angleTo(b.bones[name].q), p = distance(a.bones[name].position, b.bones[name].position);
          // Logical Root carries heading but has no vertex weights. Its
          // orientation is descriptive; all visible descendants stay strict.
          if (name !== "Root" && r > maxBoneRotation) {
            maxBoneRotation = r;
            rotationBone = name;
          }
          if (local > maxLocalBoneRotation) {
            maxLocalBoneRotation = local;
            localRotationBone = name;
          }
          if (p > maxBonePosition) {
            maxBonePosition = p;
            positionBone = name;
          }
        }
        return { modelPositionMeters: round(distance(a.position, b.position)), rootPathMeters: round(distance(a.world, b.world)), maximumBoneRotationDegrees: round(maxBoneRotation * 180 / Math.PI), rotationSpace: "world, all bones except unweighted logical Root", rotationBone, logicalRootWorldRotationDegrees: round(a.bones.Root.worldQ.angleTo(b.bones.Root.worldQ) * 180 / Math.PI), maximumLocalBoneRotationDegrees: round(maxLocalBoneRotation * 180 / Math.PI), localRotationBone, maximumBonePositionMeters: round(maxBonePosition), positionBone, soleJumpMeters: Object.fromEntries(Object.keys(a.soles).map((n) => [n, round(distance(a.soles[n], b.soles[n]))])) };
      }
      for (const sequence of sequences) {
        let measure2 = function() {
          const pose = snapshot(a), clearance = pose.minimumVertexY;
          const sampleDt=clock-previousMeasureClock,descriptor=a.recoveryDescriptor();
          const physicalPalmSample=physicalPalmObserver.sample({descriptor,clock,sampleDt});
          bodySettlingObserver.sample({descriptor,clock,sampleDt});
          const actual=actionObserver.sample({pose,previous,clock,sampleDt,physicalPalmSupports:physicalPalmSample.validatedSupports});
          activeClip=actual.clip;playbackTime=actual.seconds;
          const effectivePlants=actual.plants;
          if(diveClip&&actual.descriptor?.overlayClip==='keeper_catch'&&actual.descriptor.activeBaseClip===sequence.start){
            const seconds=Math.min(diveClip.duration,actual.descriptor.baseSeconds),control=diveControls.get(seconds.toFixed(8));
            maximumDiveClockErrorSeconds=Math.max(maximumDiveClockErrorSeconds,Math.abs(seconds-Math.min(diveClip.duration,sequence.phase*diveClip.duration+clock)));
            if(!control)missingDiveBodyControls++;else{diveBodyControlSamples++;maximumDiveRootDeviation=Math.max(maximumDiveRootDeviation,distance(pose.world,control.world));for(const bone of diveBodyBones){maximumDiveBodyPositionDeviation=Math.max(maximumDiveBodyPositionDeviation,distance(pose.bones[bone].position,control.bones[bone].position));maximumDiveBodyOrientationDegrees=Math.max(maximumDiveBodyOrientationDegrees,pose.bones[bone].worldQ.angleTo(control.bones[bone].worldQ)*180/Math.PI);}}
          }
          minY = Math.min(minY, clearance);
          maxY = Math.max(maxY, clearance);
          maxLift = Math.max(maxLift, a.lift || 0);
          maxReachResidual = Math.max(maxReachResidual, a.contactResidual || 0);
          for (const bone of [...continuousConstraints.keys()]) if (!a.landings.has(bone)) continuousConstraints.delete(bone);
          if (clock > previousMeasureClock + 1e-8) {
            for (const [bone, key] of previousLandings) {
              if (a.landings.get(bone)?.key === key) continue;
              const soleStep = distance(pose.soles[bone], previous.soles[bone]);
              if (soleStep > maximumLandingReleaseSoleStepMeters) {
                maximumLandingReleaseSoleStepMeters = soleStep;
                worstLandingRelease = { clock, clip: api.state().clipID, sampleSeconds: a.sampleSeconds, bone, releasedKey: key, secondsSincePreviousSample: clock - previousMeasureClock, previousSole: previous.soles[bone], sole: pose.soles[bone], soleStepMeters: soleStep, nowLocked: a.locks.has(bone), nextLandingKey: a.landings.get(bone)?.key || null };
              }
            }
          }
          for (const [bone, landing] of a.landings) {
            const elapsed = a.clock - landing.start;
            if (!continuousConstraints.has(bone)) continuousConstraints.set(bone, a.clock);
            maximumContinuousFootConstraintLifetimeSeconds = Math.max(maximumContinuousFootConstraintLifetimeSeconds, a.clock - continuousConstraints.get(bone));
            const identity = landingIdentity(clipEpoch, bone, landing);
            if (!landingObserved.has(identity)) landingObserved.set(identity, a.clock);
            const observedLifetime = a.clock - landingObserved.get(identity);
            maximumLandingLifetimeSeconds = Math.max(maximumLandingLifetimeSeconds, observedLifetime);
            maximumLandingObjectElapsedSeconds = Math.max(maximumLandingObjectElapsedSeconds, elapsed);
            maximumLandingDurationSeconds = Math.max(maximumLandingDurationSeconds, landing.duration);
            if (elapsed > landing.duration + 1e-6) overdueLandingSamples++;
            const maximumLifetime = isRecovery(landing) ? .080001 : .300001;
            if (elapsed < -1e-6 || observedLifetime > maximumLifetime || landing.duration > maximumLifetime || !(landing.duration > 0)) invalidLandingLifetimeSamples++;
            if (isRecovery(landing)) {
              recoverySamples++;
              recoveryModes.add(landing.mode);
              maximumRecoveryLifetimeSeconds = Math.max(maximumRecoveryLifetimeSeconds, observedLifetime);
              maximumRecoveryDurationSeconds = Math.max(maximumRecoveryDurationSeconds, landing.duration);
              if (elapsed < -1e-6 || observedLifetime > .080001 || landing.duration > .080001 || !(landing.duration > 0)) invalidRecoveryLifetimeSamples++;
              if (landing.to) recoveryRetainedStaticAnchorSamples++;
            }
            if ((landing.kinematicDeviationMeters || 0) > maximumLandingKinematicDeviationMeters) {
              maximumLandingKinematicDeviationMeters = landing.kinematicDeviationMeters;
              worstLandingKinematicDeviation = { clock, clip: api.state().clipID, sampleSeconds: a.sampleSeconds, ...describeLanding(bone, landing, a.clock), observedLifetime, sole: pose.soles[bone] };
            }
            if ((landing.projectionMeters || 0) > maximumLandingProjectionMeters) {
              maximumLandingProjectionMeters = landing.projectionMeters;
              worstLandingProjection = { clock, clip: api.state().clipID, sampleSeconds: a.sampleSeconds, ...describeLanding(bone, landing, a.clock), observedLifetime, sole: pose.soles[bone] };
            }
          }
          if ((a.landingResidual || 0) > maxLandingResidual) {
            maxLandingResidual = a.landingResidual;
            worstLandingResidual = { clock, sampleSeconds: a.sampleSeconds, clip: api.state().clipID, residual: a.landingResidual, landings: [...a.landings].map(([bone, landing]) => describeLanding(bone, landing, a.clock)) };
          }
          for (const bone of ["LeftHand", "RightHand"]) {
            minimumWristY = Math.min(minimumWristY, pose.bones[bone].position[1]);
            if (pose.palms[bone][1] < minimumPalmMarkerY) {
              minimumPalmMarkerY = pose.palms[bone][1];
              lowestPalmSample = { clock, sampleSeconds: a.sampleSeconds, clip: api.state().clipID, bone, wrist: pose.bones[bone].position, palmMarker: pose.palms[bone], meshMinimumY: clearance };
            }
          }
          playbackTime = actual.seconds;
          const duration = activeClip.duration;
          const cycle = activeClip.loop ? Math.floor(Math.max(0, playbackTime) / duration) : 0;
          const local = activeClip.loop ? Math.max(0, playbackTime) - cycle * duration : Math.min(Math.max(0, playbackTime), duration);
          const activeAuthoredContacts = actual.contacts;
          const activeContactKeys = new Set(activeAuthoredContacts.map(contact => `${activeClip.id}/${contact.sourceBone||contact.bone}/${cycle}/${contact.start}`));
          for (const [bone, landing] of a.landings) {
            if (actual.canonical && !isRecovery(landing) && !activeContactKeys.has(landing.key)) {
              expiredContactLandingSamples++;
              worstExpiredContactLanding = { clock, clip: activeClip.id, sampleSeconds: playbackTime, bone, key: landing.key, localTimeSeconds: local, cycle, elapsed: a.clock - landing.start, duration: landing.duration, projectionMeters: landing.projectionMeters || 0, sole: pose.soles[bone] };
            }
          }
          for (const contact of actual.contacts) {
            if (contact.mode !== "hand-support" || local < contact.start - 1e-8 || local > contact.end + 1e-8) continue;
            const offset = contact.contactPointOffsetMeters || [0, 0, 0];
            const point = a.bones[contact.bone].localToWorld(a.world.clone().fromArray(offset));
            const anchor = a.referencePoint(contact.anchor).add(a.offset).add(a.origin);
            const residual = point.distanceTo(anchor);
            authoredHandSupportSamples++;
            if (residual > maxAuthoredHandSupportResidual) {
              maxAuthoredHandSupportResidual = residual;
              worstAuthoredHandSupport = { clock, clip: activeClip.id, sampleSeconds: playbackTime, bone: contact.bone, contactPointOffsetMeters: offset, point: point.toArray(), anchor: anchor.toArray(), residual, fadeElapsed: a.fade?.elapsed ?? null };
            }
            if (!a.fade) maxSettledAuthoredHandSupportResidual = Math.max(maxSettledAuthoredHandSupportResidual, residual);
          }
          for(const support of actual.palmSupports||[]){const point=a.bones[support.bone].localToWorld(a.world.clone().fromArray(support.offset)),error=point.distanceTo(a.world.clone().fromArray(support.target));maxVirtualPalmSupportError=Math.max(maxVirtualPalmSupportError,error);}
          const expected = actual.expected;
          const coverage = supportCoverage[actual.supportLabel||activeClip.id] ||= { samples: 0, expectedFootSamples: 0, admittedFootSamples: 0, actualLockSamples: 0, maximumConsecutiveUnadmittedFrames: 0, postBlendExpectedFootSamples: 0, postBlendAdmittedFootSamples: 0, postBlendActiveLandingFootSamples: 0, settledExpectedFootSamples: 0, settledAdmittedFootSamples: 0, nearGroundUnadmittedSamples: 0, nearGroundRecoverySamples: 0, maximumNearGroundUnadmittedXZStepMeters: 0, totalNearGroundUnadmittedXZTravelMeters: 0, worstNearGroundUnadmitted: null, nearGroundEntryCrossings: 0, maximumNearGroundEntryXZStepMeters: 0, worstNearGroundEntry: null,rigidBootPivotSamples:0,maximumRawNearGroundXZStepMeters:0,intentionalGroundTravelSamples:0,maximumIntentionalGroundXZStepMeters:0,worstIntentionalGroundTravel:null };
          coverage.samples++;
          coverage.expectedFootSamples += expected.size;
          coverage.actualLockSamples += effectivePlants.size;
          for (const bone of ["LeftFoot", "RightFoot"]) {
            const key = activeClip.id + "/" + bone;
            if (expected.has(bone) && effectivePlants.has(bone)) coverage.admittedFootSamples++;
            if (expected.has(bone) && !a.fade) {
              coverage.postBlendExpectedFootSamples++;
              if (effectivePlants.has(bone)) coverage.postBlendAdmittedFootSamples++;
              const landing = a.landings.get(bone), elapsed = landing ? a.clock - landing.start : -1;
              const firstSeen = landing && landingObserved.get(landingIdentity(clipEpoch, bone, landing));
              const observedLifetime = landing ? a.clock - firstSeen : Infinity;
              const validLanding = landing && !isRecovery(landing) && elapsed >= -1e-6 && elapsed <= landing.duration + 1e-6 && landing.duration > 0 && landing.duration <= .300001 && observedLifetime <= .300001;
              if (validLanding) coverage.postBlendActiveLandingFootSamples++;
              else {
                coverage.settledExpectedFootSamples++;
                if (effectivePlants.has(bone)) coverage.settledAdmittedFootSamples++;
              }
            }
            if (!effectivePlants.has(bone) && pose.soles[bone][1] <= .008) {
              const sole = pose.soles[bone], prior = previous.soles[bone];
              const rawMovement = Math.hypot(sole[0] - prior[0], sole[2] - prior[2]);
              let movement=rawMovement,rigidPivot=null;
              if(prior[1]<=.008&&rawMovement>.003){const priorVertices=new Map((previous.bootVertices[bone]||[]).map(v=>[v.meshIndex+"/"+v.vertexIndex,v]));for(const vertex of pose.bootVertices[bone]||[]){const before=priorVertices.get(vertex.meshIndex+"/"+vertex.vertexIndex);if(before&&vertex.weight>=.9999&&before.weight>=.9999&&before.position[1]<=.008&&vertex.position[1]<=.008){const travel=Math.hypot(vertex.position[0]-before.position[0],vertex.position[2]-before.position[2]);if(travel<=.003){rigidPivot={meshIndex:vertex.meshIndex,vertexIndex:vertex.vertexIndex,previous:before.position,current:vertex.position,xzStepMeters:travel};movement=0;break;}}}}
              const landing = a.landings?.get(bone);
              const diagnostic = { clock, playbackTime, bone, sole: sole.slice(), previousSole: prior.slice(), fadeElapsed: a.fade?.elapsed ?? null, xzStepMeters: movement, rawXZStepMeters:rawMovement,rigidPivot, landingResidual: a.landingResidual ?? null, landing: landing ? describeLanding(bone, landing, a.clock) : null };
              // A descending foot may enter this height band with legitimate
              // airborne travel. Only two samples in the band measure drift;
              // crossing samples remain visible as separate landing evidence.
              if (prior[1] <= .008) {
                coverage.maximumRawNearGroundXZStepMeters=Math.max(coverage.maximumRawNearGroundXZStepMeters,rawMovement);
                if(rigidPivot)coverage.rigidBootPivotSamples++;
                if(actual.intentionalGroundTravel&&!expected.has(bone)&&!isRecovery(landing)){coverage.intentionalGroundTravelSamples++;if(rawMovement>coverage.maximumIntentionalGroundXZStepMeters){coverage.maximumIntentionalGroundXZStepMeters=rawMovement;coverage.worstIntentionalGroundTravel={...diagnostic,actualBaseClip:actual.descriptor.activeBaseClip,actualBaseSeconds:actual.descriptor.baseSeconds};}movement=0;}
                coverage.nearGroundUnadmittedSamples++;
                if (isRecovery(landing)) coverage.nearGroundRecoverySamples++;
                coverage.totalNearGroundUnadmittedXZTravelMeters += movement;
                if (movement > coverage.maximumNearGroundUnadmittedXZStepMeters) {
                  coverage.maximumNearGroundUnadmittedXZStepMeters = movement;
                  coverage.worstNearGroundUnadmitted = diagnostic;
                }
              } else {
                coverage.nearGroundEntryCrossings++;
                if (movement > coverage.maximumNearGroundEntryXZStepMeters) {
                  coverage.maximumNearGroundEntryXZStepMeters = movement;
                  coverage.worstNearGroundEntry = diagnostic;
                }
              }
            }
            if (expected.has(bone) && !effectivePlants.has(bone)) missingRun[key] = (missingRun[key] || 0) + 1;
            else missingRun[key] = 0;
            coverage.maximumConsecutiveUnadmittedFrames = Math.max(coverage.maximumConsecutiveUnadmittedFrames, missingRun[key]);
          }
          let worstAnchor = null;
          for (const [bone, lock] of effectivePlants) {
            const sole = pose.soles[bone];
            if (!sole) continue;
            const anchor = lock.anchor.toArray(), error = distance(sole, anchor);
            const diagnostic = { bone, key: lock.key, error, sole, anchor, release: lock.release, actorClock: a.clock, actorSampleSeconds: a.sampleSeconds, phaseRate: a.phaseRate, pathScale: a.pathScale, rootWorld: a.world.toArray(), modelPosition: a.model.position.toArray(), hipWorld: a.bones.Hips.getWorldPosition(a.model.position.clone()).toArray(), fadeElapsed: a.fade?.elapsed ?? null, rootBlend: a.rootBlend ? { elapsed: a.rootBlend.elapsed, velocity: a.rootBlend.velocity.toArray(), lastTime: a.rootBlend.lastTime } : null };
            if (!worstAnchor || error > worstAnchor.error) worstAnchor = diagnostic;
            if (error > maxAnchorError) {
              maxAnchorError = error;
              maxAnchorSample = { clock: round(clock), clip: api.state().clipID, localPlaybackTime: api.state().time, ...diagnostic };
            }
            let record = active.get(bone);
            if (!record || record.key !== lock.key) {
              record = { key: lock.key, first: sole.slice(), previousWorldQ: pose.bones[bone].worldQ.clone(), firstWorldQ: pose.bones[bone].worldQ.clone() };
              active.set(bone, record);
            }
            maxSoleDrift = Math.max(maxSoleDrift, distance(sole, record.first));
            const orientationStep = record.previousWorldQ.angleTo(pose.bones[bone].worldQ) * 180 / Math.PI;
            if (orientationStep > maxPlantOrientationStepDegrees) {
              maxPlantOrientationStepDegrees = orientationStep;
              worstPlantOrientationStep = { clock, bone, key: lock.key, degrees: orientationStep, clip: api.state().clipID, sampleSeconds: a.sampleSeconds };
            }
            maxPlantOrientationTotalDegrees = Math.max(maxPlantOrientationTotalDegrees, record.firstWorldQ.angleTo(pose.bones[bone].worldQ) * 180 / Math.PI);
            record.previousWorldQ.copy(pose.bones[bone].worldQ);
          }
          for (const bone of [...active.keys()]) if (!effectivePlants.has(bone)) active.delete(bone);
          const delta = jump(previous, pose);
          if (delta.maximumBonePositionMeters > maxBoneStep) {
            maxBoneStep = delta.maximumBonePositionMeters;
            worstBoneStep = { clock, clip: api.state().clipID, sampleSeconds: a.sampleSeconds, secondsSincePreviousSample: clock - previousMeasureClock, bone: delta.positionBone, meters: maxBoneStep, previousLandingStates: previous.landingStates, landingStates: pose.landingStates, previousPosition: previous.bones[delta.positionBone].position, position: pose.bones[delta.positionBone].position, previousModelPosition: previous.position, modelPosition: pose.position, previousRootWorld: previous.world, rootWorld: pose.world, previousLift: previous.lift, lift: a.lift, fadeElapsed: a.fade?.elapsed ?? null, phaseRate: a.phaseRate, locks: [...a.locks.values()].map(lock => ({ bone: lock.bone, key: lock.key, anchor: lock.anchor.toArray(), release: lock.release })), landings: [...a.landings].map(([bone, landing]) => ({ bone, key: landing.key, mode: landing.mode || 'authored', elapsed: a.clock - landing.start, duration: landing.duration, projectionMeters: landing.projectionMeters || 0 })) };
          }
          if (delta.maximumBoneRotationDegrees > maxBoneRotationStep) {
            maxBoneRotationStep = delta.maximumBoneRotationDegrees;
            worstBoneRotationStep = { clock, clip: api.state().clipID, sampleSeconds: a.sampleSeconds, secondsSincePreviousSample: clock - previousMeasureClock, bone: delta.rotationBone, degrees: maxBoneRotationStep, previousHipsPosition:previous.bones.Hips.position,hipsPosition:pose.bones.Hips.position,previousRootWorld:previous.world,rootWorld:pose.world, previousLandingStates: previous.landingStates, landingStates: pose.landingStates, previousWorldQuaternion: previous.bones[delta.rotationBone].worldQ.toArray(), worldQuaternion: pose.bones[delta.rotationBone].worldQ.toArray(), fadeElapsed: a.fade?.elapsed ?? null, previousFadeElapsed: previous.fadeElapsed, degreesPerSecond: clock > previousMeasureClock ? maxBoneRotationStep / (clock - previousMeasureClock) : null, fade: a.fade ? { sourceLocal: a.fade.pose.rotations[delta.rotationBone], previousLocal: a.fade.previous?.rotations[delta.rotationBone], dt: a.fade.dt, targetLocal: activeClip.frames?api.inspect().sample(activeClip, playbackTime).rotations[delta.rotationBone]:null, targetPreviousLocal: activeClip.frames?api.inspect().sample(activeClip, previous.sampleSeconds).rotations[delta.rotationBone]:null } : null };
          }

          if (sampleDt > 1e-8) {
            const clipMetrics = advancingByClip[activeClip.id] ||= { samples: 0, maximumJointAngularSpeedRadiansPerSecond: 0, angularBone: null, maximumRootRelativeBoneSpeedMps: 0, velocityBone: null };
            clipMetrics.samples++;
            for (const name of Object.keys(pose.bones)) {
              if (name === 'Root') continue;
              const angularSpeed = previous.bones[name].worldQ.angleTo(pose.bones[name].worldQ) / sampleDt;
              const relativeDelta = pose.bones[name].position.map((value, k) => value - pose.world[k] - previous.bones[name].position[k] + previous.world[k]);
              const relativeSpeed = Math.hypot(...relativeDelta) / sampleDt;
              if (angularSpeed > maximumJointAngularSpeedRadiansPerSecond) maximumJointAngularSpeedRadiansPerSecond = angularSpeed;
              if (angularSpeed > clipMetrics.maximumJointAngularSpeedRadiansPerSecond) { clipMetrics.maximumJointAngularSpeedRadiansPerSecond = angularSpeed; clipMetrics.angularBone = name; }
              if (relativeSpeed > clipMetrics.maximumRootRelativeBoneSpeedMps) { clipMetrics.maximumRootRelativeBoneSpeedMps = relativeSpeed; clipMetrics.velocityBone = name; }
              if (relativeSpeed > maximumRootRelativeBoneSpeedMps) {
                maximumRootRelativeBoneSpeedMps = relativeSpeed;
                worstRootRelativeBoneSpeed = { clock, clip: activeClip.id, sampleSeconds: a.sampleSeconds, secondsSincePreviousSample: sampleDt, bone: name, metersPerSecond: relativeSpeed, previousPosition: previous.bones[name].position, position: pose.bones[name].position, previousRootWorld: previous.world, rootWorld: pose.world, previousLift: previous.lift, lift: a.lift, fadeElapsed: a.fade?.elapsed ?? null };
              }
            }
          }
          maxRootStep = Math.max(maxRootStep, delta.rootPathMeters);
          previous = pose;
          previousLandings.clear();
          for (const [bone, landing] of a.landings) previousLandings.set(bone, landing.key);
          previousMeasureClock = clock;
          if (traceConstraints) constraintTrace.push({ clock, clip: activeClip.id, sampleSeconds: a.sampleSeconds, phaseRate: a.phaseRate, lift: a.lift, rootWorld: pose.world, landingStates: pose.landingStates });
          sampleCount++;
          if (clearance < -1e-3 || worstAnchor && worstAnchor.error > 0.01) violations.push({ clock: round(clock), clip: api.state().clipID, minimumY: round(clearance), anchor: worstAnchor });
        };
        var measure = measure2;
        api.setPlaying(false);
        api.setClip(sequence.start);
        api.seek(sequence.phase);
        const a = api.inspect().actors[0];
        const diveControls=new Map(),diveBodyBones=['Hips','Spine','Chest','Neck','Head','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
        const diveClip=/^keeper_dive_/.test(sequence.start)?api.inspect().clipMap.get(sequence.start):null;
        if(diveClip){api.setPlaying(true);for(let n=0;n<=Math.ceil((diveClip.duration+1)*fps);n++){const control=snapshot(a),seconds=Math.min(diveClip.duration,a.recoveryDescriptor().baseSeconds);diveControls.set(seconds.toFixed(8),control);api.step(dt);}api.setPlaying(false);api.setClip(sequence.start);api.seek(sequence.phase);}
        let diveBodyControlSamples=0,missingDiveBodyControls=0,maximumDiveBodyPositionDeviation=0,maximumDiveBodyOrientationDegrees=0,maximumDiveRootDeviation=0,maximumDiveClockErrorSeconds=0;
        const actionObserver=makeActionObserver({api,actor:a}),physicalPalmObserver=makePhysicalPalmObserver({api,actor:a,calibrationCache:physicalPalmCalibrationCache}),bodySettlingObserver=makeBodySettlingObserver({api,actor:a});
        let maxVirtualPalmSupportError=0;
        let sampleCount = 0, minY = Infinity, maxY = -Infinity, maxAnchorError = 0, maxSoleDrift = 0, maxReachResidual = 0, maxLandingResidual = 0, worstLandingResidual = null, maximumLandingLifetimeSeconds = 0, maximumLandingObjectElapsedSeconds = 0, maximumLandingDurationSeconds = 0, invalidLandingLifetimeSamples = 0, overdueLandingSamples = 0, maximumLandingProjectionMeters = 0, worstLandingProjection = null, maximumLandingKinematicDeviationMeters = 0, worstLandingKinematicDeviation = null, expiredContactLandingSamples = 0, worstExpiredContactLanding = null, authoredHandSupportSamples = 0, maxAuthoredHandSupportResidual = 0, maxSettledAuthoredHandSupportResidual = 0, worstAuthoredHandSupport = null, minimumWristY = Infinity, minimumPalmMarkerY = Infinity, lowestPalmSample = null, maxLift = 0, maxBoneStep = 0, maxRootStep = 0, maxPlantOrientationStepDegrees = 0, maxPlantOrientationTotalDegrees = 0, worstPlantOrientationStep = null, maxAnchorSample = null, violations = [], previous = snapshot(a), active = /* @__PURE__ */ new Map(), clock = 0, clipEpoch = 0;
        let playbackTime = api.state().time, activeClip = api.inspect().clipMap.get(sequence.start);
        const supportCoverage = {}, missingRun = {}, landingObserved = new Map();
        const previousLandings = new Map();
        let previousMeasureClock = 0, maximumLandingReleaseSoleStepMeters = 0, worstLandingRelease = null, pendingVelocityBoundary = null, worstBoneStep = null, worstBoneRotationStep = null, maxBoneRotationStep = 0, maximumJointAngularSpeedRadiansPerSecond = 0, maximumRootRelativeBoneSpeedMps = 0, worstRootRelativeBoneSpeed = null;
        const advancingByClip = {}, constraintTrace = [];
        const continuousConstraints = new Map(), recoveryModes = new Set();
        let maximumContinuousFootConstraintLifetimeSeconds = 0, recoverySamples = 0, maximumRecoveryLifetimeSeconds = 0, maximumRecoveryDurationSeconds = 0, invalidRecoveryLifetimeSamples = 0, recoveryRetainedStaticAnchorSamples = 0;
        const boundaries = [];
        // Observe the exact cold motor seed before its first positive integration
        // step, so an internal first-frame reach release has an actual prior hip
        // witness. The cold handoff itself keeps the ordinary strict C0 gates.
        api.setPlaying(true);const coldBefore=previous;api.step(0);const coldAfter=snapshot(a);
        boundaries.push({clock:0,to:sequence.start,coldMotorEntry:true,jump:jump(coldBefore,coldAfter),floorAfter:coldAfter.minimumVertexY});previous=coldAfter;
        measure2();
        for (const segment of sequence.segments) {
          api.setPlaying(true);
          for (let i = 0; i < Math.ceil(segment.advance * fps); i++) {
            api.step(dt);
            clock += dt;
            playbackTime += dt;
            if (pendingVelocityBoundary) {
              const measuredVelocity = a.world.clone().sub(pendingVelocityBoundary.origin).multiplyScalar(1 / dt);
              const priorVelocity = a.world.clone().fromArray(pendingVelocityBoundary.boundary.velocityBeforeMetersPerSecond);
              pendingVelocityBoundary.boundary.firstStep = { sampleSeconds: a.sampleSeconds, seconds: dt, velocityMetersPerSecond: measuredVelocity.toArray(), speedMps: measuredVelocity.length(), velocityJumpMps: measuredVelocity.distanceTo(priorVelocity), speedJumpMps: Math.abs(measuredVelocity.length() - priorVelocity.length()) };
              pendingVelocityBoundary = null;
            }
            measure2();
          }
          if (segment.next) {
            const before = snapshot(a);
            const velocityBefore = a.velocity.toArray();
            api.setClip(segment.next);
            clipEpoch++;
            playbackTime = api.state().time;
            // Requested labels never replace the descriptor's actual active clock.
            const after = snapshot(a);
            actionObserver.noteRequest(segment.next,clock,after);
            const boundary = { clock: round(clock), to: segment.next, velocityBeforeMetersPerSecond: velocityBefore, speedBeforeMps: Math.hypot(...velocityBefore), jump: jump(before, after), floorAfter: round(a.minimumY(true)), locks: [...a.locks.values()].map((l) => ({ bone: l.bone, key: l.key, release: l.release, anchor: l.anchor.toArray() })) };
            boundaries.push(boundary);
            pendingVelocityBoundary = { boundary, origin: a.world.clone() };
            previous = after;
            measure2();
          }
        }
        let drainSamples=0;
        while(actionObserver.needsDrain(clock)&&drainSamples<Math.ceil(12*fps)){api.step(dt);clock+=dt;measure2();drainSamples++;}
        const actionObservation=actionObserver.report();
        results.push({ physicalPalmObservation:physicalPalmObserver.report(),bodySettlingObservation:bodySettlingObserver.report(),finalPhysicalState:{rootWorld:previous.world,soles:previous.soles,motor:a.locomotion?(()=>{const m=a.locomotion.snapshot();return{clock:m.clock,actualSpeed:m.actualSpeed,targetSpeed:m.targetSpeed,phase:m.unwrappedPhase,feet:m.feet,request:m.requests?.find(request=>request.id===m.requestID)}})():null},actionObservation,drainSamples,maxVirtualPalmSupportError,diveBodyControlSamples,missingDiveBodyControls,maximumDiveBodyPositionDeviation,maximumDiveBodyOrientationDegrees,maximumDiveRootDeviation,maximumDiveClockErrorSeconds, name: sequence.name, start: sequence.start, sampleRateHz: fps, sampleCount, minVertexY: round(minY), maxMinimumVertexY: round(maxY), maxPlantAnchorDistanceMeters: round(maxAnchorError), maxPlantSoleDisplacementDuringLockMeters: round(maxSoleDrift), maxPlantOrientationStepDegrees: round(maxPlantOrientationStepDegrees), maxPlantOrientationTotalDegrees: round(maxPlantOrientationTotalDegrees), worstPlantOrientationStep, maxReachResidualMeters: round(maxReachResidual), maxLandingResidualMeters: round(maxLandingResidual), worstLandingResidual, maximumLandingLifetimeSeconds: round(maximumLandingLifetimeSeconds), maximumLandingObjectElapsedSeconds: round(maximumLandingObjectElapsedSeconds), maximumLandingDurationSeconds: round(maximumLandingDurationSeconds), maximumContinuousFootConstraintLifetimeSeconds: round(maximumContinuousFootConstraintLifetimeSeconds), invalidLandingLifetimeSamples, overdueLandingSamples, recoverySamples, recoveryModes: [...recoveryModes], maximumRecoveryLifetimeSeconds: round(maximumRecoveryLifetimeSeconds), maximumRecoveryDurationSeconds: round(maximumRecoveryDurationSeconds), invalidRecoveryLifetimeSamples, recoveryRetainedStaticAnchorSamples, maximumLandingProjectionMeters: round(maximumLandingProjectionMeters), worstLandingProjection, maximumLandingKinematicDeviationMeters: round(maximumLandingKinematicDeviationMeters), worstLandingKinematicDeviation, maximumLandingReleaseSoleStepMeters: round(maximumLandingReleaseSoleStepMeters), worstLandingRelease, expiredContactLandingSamples, worstExpiredContactLanding, authoredHandSupportSamples, maxAuthoredHandSupportResidualMeters: round(maxAuthoredHandSupportResidual), maxSettledAuthoredHandSupportResidualMeters: round(maxSettledAuthoredHandSupportResidual), worstAuthoredHandSupport, minimumWristY: round(minimumWristY), minimumPalmMarkerY: round(minimumPalmMarkerY), palmMarkerOffsetMeters: [0, -.07, 0], lowestPalmSample, maxFloorLiftMeters: round(maxLift), maximumJointAngularSpeedRadiansPerSecond, maximumRootRelativeBoneSpeedMps, worstRootRelativeBoneSpeed, advancingByClip, constraintTrace: traceConstraints ? constraintTrace : undefined, maximumBoneTravelPerSampleMeters: round(maxBoneStep), worstBoneStep, maximumBoneRotationPerSampleDegrees: maxBoneRotationStep, worstBoneRotationStep, maximumRootTravelPerSampleMeters: round(maxRootStep), supportCoverage, boundaries, maxAnchorSample, violationCount: violations.length, worst: violations.sort((a2, b) => (b.anchor?.error || 0) - (a2.anchor?.error || 0) || a2.minimumY - b.minimumY).slice(0, 12) });
      }
      renderer.render = realRender;
      api.setPlaying(false);
      api.setClip("idle");
      api.seek(0);
      const loadedPaths = [...new Set(api.inspect().actors.map((a) => a.path))];
      return { loadedPaths, declaredPackageHashes: globalThis.SOCCER_V7_DATA.hashes, kind: "actual-bundled-viewer-transition-audit", extended, gaitsOnly, extendedGaits, updateRateHz: fps, characterID, testedLOD, logicalRootWeightedVertexCount, logicalRootPresentInEverySkin, method: `Actual classic-script bundle loaded from local HTTP; synchronous api.step updates and real post-IK skeleton/mesh sampled at ${fps}Hz. GPU renderer temporarily suppressed, requestAnimationFrame disabled to prevent races. No source/mesh/IK code replaced. All mesh vertices evaluated after each update.`, limitations: [`Single ${characterID} LOD${testedLOD} in this run; other identities and LODs require separate runs.`, "Foot accuracy uses the bone sole marker (0,-0.08,0). Active hand support uses an independently reconstructed immutable anatomical Skin/glove triangle with full mixed-bone skinning and3mm contact/anchor limits. Legacy authored markers and wrist proxies remain descriptive. Actual mesh floor scans every vertex independently.", `The stateful solver was integrated at ${fps}Hz; other integration rates can follow different paths and require a separate run.`, "Logical Root orientation is recorded separately because heading handoff counter-rotates Hips; its actual decoded skin weights must be zero. Hips and all descendant world orientations, and every bone position including Root, remain gated.", "First-step root velocity is descriptive. Separate broad engineering pop guards limit visible joint world angular speed to 30 rad/s and bone speed relative to authoritative root travel to 25 m/s; they catch abrupt advancing-pose jumps but do not establish natural motion, acceleration quality or physical collision.", "Rigid boot pivots are classified only when the same decoded vertex with at least 99.99% Foot weight is within 8mm of the floor in both frames and moves at most 3mm in XZ; raw sole-marker travel and the exact vertex witness remain in the report. Authored slide/fall body travel outside expected plants is reported separately; all actual expected supports, recovery transfers, anchor drift and dynamic pop guards remain gated.", "Requests are followed through the actual contributor/recovery/motor descriptor and bounded ledger drain; UI clip labels are never substituted for active clocks. Unsupported actual semantics force incomplete verification.", "No physical phone GPU or FPS evidence."], results, state: api.state() };
    }, { extended, gaitsOnly, extendedGaits, traceConstraints, sequenceName, sampleHz, characterID, testedLOD, actionObserverFactorySource:createActionObserver.toString(),physicalPalmFactorySource:createPhysicalPalmObserver.toString(),bodySettlingFactorySource:createBodySettlingObserver.toString() });
    report.loadedModels = report.loadedPaths.map((path2) => servedGLB[path2] || { path: path2, error: "Payload not captured" });
    delete report.loadedPaths;
    report.servedResources = served;
    report.generatedAt = (/* @__PURE__ */ new Date()).toISOString();
    report.auditSource = auditSource;
    report.observerSource={file:"source/audit-action-observer.cjs",sha256:observerSourceHash};
    report.errors = errors;
    report.remoteRequests = remote;
    report.inputs = {};
    for (const file of inputFiles) {
      const bytes = fs.readFileSync(path.join(root, file));
      report.inputs[file] = { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
    }
    report.initialInputs=initialInputs;
    report.ramPackageSnapshot=packageSnapshot?{atomicConstruction:packageSnapshot.atomicConstruction,modelIntegrity:packageSnapshot.integrity,files:[...packageSnapshot.bytes].map(([file,bytes])=>({file,bytes:bytes.length,sha256:digest(bytes)}))}:null;
    report.diagnostic={enabled:diagnostic,runtimePath,snapshotRoot,inputs:diagnosticInputs,unchanged:Object.entries(diagnosticInputs).map(([file,expected])=>({file,pass:fs.existsSync(file)&&digest(fs.readFileSync(file))===expected.sha256}))};
    report.thresholds = { minimumVertexY: -1e-3, maximumPlantAnchorDistanceMeters: 3e-3, maximumImmediateBoneJumpMeters: 3e-3, maximumImmediateBoneRotationDegrees: 1, maximumImmediateRootJumpMeters: 5e-4, minimumSettledContactAdmissionRatio: .98, maximumValidLandingDurationSeconds: .30, maximumRecoveryDurationSeconds: .08, maximumExpectedUnadmittedNearGroundXZStepMeters: .003, maximumAdvancingJointAngularSpeedRadiansPerSecond: 30, maximumRootRelativeBoneSpeedMps: 25,maximumPhysicalPalmPatchAnchorDistanceMeters:.003,maximumPhysicalPalmPatchY:.003,legacyWristAndAuthoredPalmMarkerAcceptance:false };
    report.loadedModelsMatchDisk = report.loadedModels.map((model) => {
      const bytes = fs.readFileSync(path.join(root, model.path)), hash = crypto.createHash("sha256").update(bytes).digest("hex");
      return { path: model.path, pass: hash === model.sha256, diskSha256: hash };
    });
    report.servedResourcesMatchDisk = Object.entries(report.servedResources).map(([file, served]) => {
      const bytes = fs.readFileSync(served.source||path.join(root,file)), hash = crypto.createHash("sha256").update(bytes).digest("hex");
      return { path: file, source:served.source||path.join(root,file), pass: hash === served.sha256, diskSha256: hash };
    });
    const allSequences = (predicate) => report.results.every(predicate);
    report.declaredSourceBindings=declaredSourceBindings(report.declaredPackageHashes,report.inputs);
    report.checks = {
      allDeclaredSourceHashesMatch:report.declaredSourceBindings.pass,
      sourceInputsUnchangedDuringAudit:inputFiles.every(file=>initialInputs[file].sha256===report.inputs[file].sha256),
      diagnosticInputsUnchangedDuringAudit:report.diagnostic.unchanged.every(row=>row.pass),
      actualDescriptorSupported:allSequences(row=>row.actionObservation.supported),
      actualLedgerAndFulfillment:allSequences(row=>row.actionObservation.pass),
      physicalPalmDescriptorSupported:allSequences(row=>row.physicalPalmObservation.unsupported.length===0),
      bodySettlingDescriptorSupported:allSequences(row=>row.bodySettlingObservation.unsupported.length===0),
      actualAnatomicalPalmSupport:allSequences(row=>row.physicalPalmObservation.pass),
      actualBodySettlingGeometryAndState:allSequences(row=>row.bodySettlingObservation.pass),
      catchDiveBodyContinuation:allSequences(row=>!/^keeper chain /.test(row.name)||row.diveBodyControlSamples>0&&row.missingDiveBodyControls===0&&row.maximumDiveBodyPositionDeviation<=.003&&row.maximumDiveBodyOrientationDegrees<=1&&row.maximumDiveRootDeviation<=.0005&&row.maximumDiveClockErrorSeconds<=1e-6),
      observerUnchangedDuringAudit:observerSourceHash===report.inputs["source/audit-action-observer.cjs"].sha256,
      noPageErrors: errors.length === 0,
      noRemoteRequests: remote.length === 0,
      auditorUnchangedDuringAudit: auditSource.sha256 === report.inputs[auditSource.file].sha256,
      requestedIdentityAndLODLoaded: report.state.characterID === characterID && Number(report.state.lod) === testedLOD && report.loadedModels.length === 1 && report.loadedModels[0].path === `models/${characterID}-lod${testedLOD}.glb`,
      decodedModelsMatchDisk: report.loadedModelsMatchDisk.every(row => row.pass),
      decodedModelsMatchDeclaredData: report.loadedModels.every(model => model.sha256 === report.declaredPackageHashes?.models?.[model.path]),
      declaredMotionMatchesCurrentSource: report.declaredPackageHashes?.motion === report.inputs["animations.json"].sha256,
      declaredManifestMatchesCurrentSource: report.declaredPackageHashes?.manifest === report.inputs["asset-manifest.json"].sha256,
      declaredMotionRuntimeMatchesCurrentSource: report.declaredPackageHashes?.motionRuntime === report.inputs["source/motion-runtime.js"].sha256,
      logicalRootHasNoSkinWeights: report.logicalRootPresentInEverySkin && report.logicalRootWeightedVertexCount === 0,
      servedPackageUnchangedDuringAudit: report.servedResourcesMatchDisk.every(row => row.pass),
      fullMeshAboveFloor: allSequences(row => row.minVertexY >= report.thresholds.minimumVertexY),
      activePlantAnchors: allSequences(row => row.maxPlantAnchorDistanceMeters <= report.thresholds.maximumPlantAnchorDistanceMeters),
      boundedActiveLandings: allSequences(row => row.invalidLandingLifetimeSamples === 0),
      boundedRecovery: allSequences(row => row.invalidRecoveryLifetimeSamples === 0 && row.recoveryRetainedStaticAnchorSamples === 0),
      noExpiredContactLandings: allSequences(row => row.expiredContactLandingSamples === 0),
      settledSupportCoverage: allSequences(row => Object.values(row.supportCoverage).every(coverage => !coverage.settledExpectedFootSamples || coverage.settledAdmittedFootSamples / coverage.settledExpectedFootSamples >= report.thresholds.minimumSettledContactAdmissionRatio)),
      unadmittedNearGroundDrift: allSequences(row => Object.values(row.supportCoverage).every(coverage => coverage.maximumNearGroundUnadmittedXZStepMeters <= report.thresholds.maximumExpectedUnadmittedNearGroundXZStepMeters)),
      immediateBonePositionContinuity: allSequences(row => row.boundaries.every(boundary => boundary.jump.maximumBonePositionMeters <= report.thresholds.maximumImmediateBoneJumpMeters)),
      immediateBoneRotationContinuity: allSequences(row => row.boundaries.every(boundary => boundary.jump.maximumBoneRotationDegrees <= report.thresholds.maximumImmediateBoneRotationDegrees)),
      immediateRootContinuity: allSequences(row => row.boundaries.every(boundary => boundary.jump.rootPathMeters <= report.thresholds.maximumImmediateRootJumpMeters)),
      advancingJointAngularVelocity: allSequences(row => row.maximumJointAngularSpeedRadiansPerSecond <= report.thresholds.maximumAdvancingJointAngularSpeedRadiansPerSecond),
      advancingRootRelativeBoneVelocity: allSequences(row => row.maximumRootRelativeBoneSpeedMps <= report.thresholds.maximumRootRelativeBoneSpeedMps)
    };
    report.complete=!diagnostic&&report.results.length===(extended?66:38)&&report.checks.allDeclaredSourceHashesMatch&&report.checks.sourceInputsUnchangedDuringAudit&&report.checks.decodedModelsMatchDisk&&report.checks.decodedModelsMatchDeclaredData&&report.checks.declaredMotionMatchesCurrentSource&&report.checks.declaredManifestMatchesCurrentSource&&report.checks.declaredMotionRuntimeMatchesCurrentSource&&report.checks.actualDescriptorSupported&&report.checks.physicalPalmDescriptorSupported&&report.checks.bodySettlingDescriptorSupported&&report.checks.auditorUnchangedDuringAudit&&report.checks.observerUnchangedDuringAudit&&report.checks.servedPackageUnchangedDuringAudit;
    report.pass = Object.values(report.checks).every(Boolean);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ file: output, pass: report.pass, checks: report.checks, sequences: report.results.length, samples: report.results.reduce((sum, row) => sum + row.sampleCount, 0), minimumVertexY: Math.min(...report.results.map((row) => row.minVertexY)), maximumPlantAnchorDistanceMeters: Math.max(...report.results.map((row) => row.maxPlantAnchorDistanceMeters)), worst: report.results.map((row) => ({ name: row.name, anchorError: row.maxPlantAnchorDistanceMeters, instantBoneJump: Math.max(...row.boundaries.map((b) => b.jump.maximumBonePositionMeters)), floor: row.minVertexY })).sort((a, b) => b.anchorError - a.anchorError).slice(0, 8), errors, remote }, null, 2));
    if (!report.pass) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

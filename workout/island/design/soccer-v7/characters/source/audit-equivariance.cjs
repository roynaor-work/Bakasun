/**
 * Independent rigid-yaw equivariance of the actual packaged skinned geometry.
 * node source/audit-equivariance.cjs --out /absolute/report.json
 * Add --all-models to check all eight identities at both explicit LODs.
 *
 * Seven identical clip/phase poses are solved at heading zero and pi. Every
 * decoded skinned vertex at pi must equal its zero-heading counterpart rotated
 * 180 degrees around the world origin. This checks the geometry, rather than
 * only joint positions or contact-marker accuracy. The real controller and IK
 * are unchanged; the public inspect hook supplies heading/reset state. GPU
 * rendering and autonomous RAF are suppressed during the samples.
 *
 * --diagnostic allows a useful partial report when a newer raw source GLB is
 * being exported while the immutable offline payload still matches its loaded
 * data manifest. It NEVER changes complete/pass or relaxes their disk guards.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const {DECLARED_SOURCE_FILES,declaredSourceBindings,capturePackageSnapshot}=require('./audit-viewer-session.cjs');
const {createPhysicalPalmObserver}=require('./audit-action-observer.cjs');
const root = path.resolve(__dirname, '..');
const outputIndex = process.argv.indexOf('--out');
const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(root, 'verification/yaw-equivariance.json');
const diagnostic = process.argv.includes('--diagnostic');
const allModels = process.argv.includes('--all-models');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const auditSource = { file: 'source/audit-equivariance.cjs', sha256: digest(fs.readFileSync(__filename)) };

(async () => {
  const inputFiles=[...new Set([...Object.values(DECLARED_SOURCE_FILES),'source/audit-equivariance.cjs','source/audit-viewer-session.cjs','source/audit-action-observer.cjs'])];
  const stamp=file=>{const bytes=fs.readFileSync(path.join(root,file));return{bytes:bytes.length,sha256:digest(bytes)};};
  const inputs=Object.fromEntries(inputFiles.map(file=>[file,stamp(file)]));
  const packageSnapshot=capturePackageSnapshot();
  if(inputFiles.some(file=>stamp(file).sha256!==inputs[file].sha256))throw Error('Source changed during package snapshot construction');
  const served = {}, servedGLB = {};
  const mime = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
      const relative = path.relative(root, file),bytes=packageSnapshot.bytes.get(relative);if(!bytes)throw Error('Resource outside immutable package snapshot');
      served[relative] = { bytes: bytes.length, sha256: digest(bytes) };
      if (relative.startsWith('offline/')) {
        const match = bytes.toString('utf8').match(/\["([^"]+)"\]="([^"]+)";/);
        if (match) {
          const decoded = Buffer.from(match[2], 'base64');
          servedGLB[match[1]] = { path: match[1], bytes: decoded.length, sha256: digest(decoded) };
        }
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [], remoteRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) remoteRequests.push(request.url()); });
  await page.route(/^https?:/, route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort('blockedbyclient'));
  await page.addInitScript(() => { globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {}; });
  try {
    await page.goto(origin + '/preview.html?paused&clean', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => globalThis.soccerV7?.ready, { timeout: 60000 });
    await page.evaluate(() => soccerV7.ready);
    const report = await page.evaluate(async ({ allModels,palmFactorySource }) => {
      const api = soccerV7;
      const makePalmObserver=Function('return ('+palmFactorySource+')')(),palmValidationCache=new WeakMap();
      api.setPlaying(false);
      const { renderer } = api.inspect(), realRender = renderer.render;
      renderer.render = () => {};
      await api.setView('body');
      const selections = allModels ? api.inspect().data.manifest.characters.flatMap(character => [0, 1].map(lod => ({ characterID: character.id, lod }))) : [{ characterID: 'player-01', lod: 0 }];
      const results = [], testedModels = [];
      const poses = [
        { clip: 'idle', phase: .5 },
        { clip: 'run_1', phase: .18 },
        { clip: 'run_3', phase: .18 },
        { clip: 'run_3', phase: .5 },
        { clip: 'run_5', phase: .68 },
        { clip: 'slide_tackle', phase: .85,requiredPalmBones:['LeftHand'] },
        { clip: 'get_up', phase: .35,requiredPalmBones:['LeftHand','RightHand'] }
      ];
      const round = value => Math.round(value * 1e9) / 1e9;
      const region = bone => /Head|Neck/.test(bone) ? 'head' : /UpLeg/.test(bone) ? 'upperLeg' : /Foot/.test(bone) ? 'foot' : /Leg/.test(bone) ? 'lowerLeg' : /Arm|Hand/.test(bone) ? 'arm' : 'torso';
      const restYBin = value => {
        const edges = [-Infinity, 0, .15, .4, .7, 1, 1.3, 1.5, 1.7, 1.9, Infinity];
        for (let i = 0; i < edges.length - 1; i++) if (value >= edges[i] && value < edges[i + 1]) return `${edges[i]}..${edges[i + 1]}`;
      };
      for (const selection of selections) {
      await api.setCharacter(selection.characterID);
      await api.setLOD(selection.lod);
      const a = api.inspect().actors[0];
      testedModels.push({ ...selection, path: a.path });
      const metadata = a.meshes.map(m => {
        const p = m.geometry.attributes.position, j = m.geometry.attributes.skinIndex, w = m.geometry.attributes.skinWeight;
        return Array.from({ length: p.count }, (_, i) => {
          const weights = [w.getX(i), w.getY(i), w.getZ(i), w.getW(i)];
          const joints = [j.getX(i), j.getY(i), j.getZ(i), j.getW(i)];
          const dominantBone = m.skeleton.bones[joints[weights.indexOf(Math.max(...weights))]].name;
          const rest = [p.getX(i), p.getY(i), p.getZ(i)];
          return { mesh: m.name, vertex: i, material: Array.isArray(m.material) ? m.material.map(x => x.name).join('|') : m.material.name, dominantBone, dominantRegion: region(dominantBone), rest, restYBin: restYBin(rest[1]) };
        });
      });
      const capture = () => {
        const v = a.world.clone();
        return a.meshes.map(m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => { m.getVertexPosition(i, v); return v.applyMatrix4(m.matrixWorld).toArray(); }));
      };
      const poseAt = (pose, heading) => {
        api.setClip(pose.clip);
        a.baseYaw = heading;
        a.offset.set(0, 0, 0);
        a.model.rotation.set(0, heading, 0);
        a.world.set(0, 0, 0);
        a.origin.set(0, 0, 0);
        a.phaseSynced = false;
        api.seek(pose.phase);
        if(pose.requiredPalmBones){api.setPlaying(true);api.step(1/120);api.setPlaying(false);}
        a.updateMatrices();
        const descriptor=a.recoveryDescriptor(),palmObserver=makePalmObserver({api,actor:a,calibrationCache:palmValidationCache}),palmProof=[];
        for(const bone of pose.requiredPalmBones||[]){
          const support=descriptor.palmSupports?.find(value=>value.bone===bone&&value.clipID===pose.clip&&value.phase==='plant'),validation=support?palmObserver.validateCalibration(bone,support.calibration):null,sampled=validation?.valid?palmObserver.sampleWorld(validation):null,anchor=support?.anchorWorldMeters;
          const anchorDistance=sampled&&Array.isArray(anchor)?Math.hypot(...sampled.point.map((value,i)=>value-anchor[i])):null;
          const solverExecuted=support?.solverName==='nativePalmSurfaceIK'&&Number.isInteger(support.solverIterations)&&support.solverIterations>0&&Number.isInteger(support?.solveCount)&&support.solveCount>0&&Number.isFinite(support.lastSolveClock)&&Math.abs(support.lastSolveClock-a.clock)<=1e-6;
          palmProof.push({bone,key:support?.key||null,phase:support?.phase||null,weight:support?.weight??null,solveCount:support?.solveCount??null,lastSolveClock:support?.lastSolveClock??null,actorClock:a.clock,solverName:support?.solverName||null,solverIterations:support?.solverIterations??null,solverExecuted,calibrationValid:validation?.valid===true,issues:validation?.issues||[],point:sampled?.point||null,vertices:sampled?.vertices||null,anchor:anchor||null,anchorDistanceMeters:anchorDistance,positive:solverExecuted&&validation?.valid===true&&support.weight>=1-1e-6&&sampled.point[1]>=-.001&&sampled.point[1]<=.003&&anchorDistance!=null&&anchorDistance<=.003});
        }
        return { vertices: capture(),palmProof,palmContractSupported:Array.isArray(descriptor.palmSupports),actorClock:a.clock,sampleSeconds:a.sampleSeconds,palmPositiveStepSeconds:pose.requiredPalmBones?1/120:0, modelEuler: a.model.rotation.toArray(), world: a.world.toArray(), modelPosition: a.model.position.toArray(), lift: a.lift, floor: a.minimumYReference(), locks: [...a.locks.values()].map(lock => ({ bone: lock.bone, key: lock.key, anchor: lock.anchor.toArray(), worldYaw: lock.worldYaw })), bones: Object.fromEntries(Object.entries(a.bones).map(([name, b]) => [name, { world: b.getWorldPosition(a.world.clone()).toArray(), worldQuaternion: b.getWorldQuaternion(b.quaternion.clone()).toArray() }])) };
      };
      for (const pose of poses) {
        const baseline = poseAt(pose, 0), rotated = poseAt(pose, Math.PI);
        const groups = { material: {}, dominantBone: {}, region: {}, restY: {} };
        let count = 0, square = 0, maximum = 0, worst = null;
        const add = (map, key, error, detail) => {
          const row = map[key] ||= { vertices: 0, square: 0, maximumMeters: 0, worst: null };
          row.vertices++; row.square += error * error;
          if (error > row.maximumMeters) { row.maximumMeters = error; row.worst = detail; }
        };
        for (let m = 0; m < baseline.vertices.length; m++) for (let i = 0; i < baseline.vertices[m].length; i++) {
          const b = baseline.vertices[m][i], r = rotated.vertices[m][i], expected = [-b[0], b[1], -b[2]];
          const error = Math.hypot(r[0] - expected[0], r[1] - expected[1], r[2] - expected[2]);
          const meta = metadata[m][i], detail = { ...meta, baseline: b, expected, actual: r, errorMeters: error };
          count++; square += error * error;
          if (error > maximum) { maximum = error; worst = detail; }
          add(groups.material, meta.material, error, detail);
          add(groups.dominantBone, meta.dominantBone, error, detail);
          add(groups.region, meta.dominantRegion, error, detail);
          add(groups.restY, meta.restYBin, error, detail);
        }
        for (const map of Object.values(groups)) for (const row of Object.values(map)) { row.rmsMeters = round(Math.sqrt(row.square / row.vertices)); row.maximumMeters = round(row.maximumMeters); delete row.square; }
        let maximumBonePositionErrorMeters = 0, maximumBoneOrientationErrorDegrees = 0, worstBonePosition = null, worstBoneOrientation = null;
        const yaw = a.bones.Root.quaternion.clone().setFromAxisAngle(a.world.clone().set(0, 1, 0), Math.PI);
        for (const name of Object.keys(baseline.bones)) {
          const b = baseline.bones[name], r = rotated.bones[name];
          const positionError = Math.hypot(r.world[0] + b.world[0], r.world[1] - b.world[1], r.world[2] + b.world[2]);
          const expectedQ = yaw.clone().multiply(yaw.clone().fromArray(b.worldQuaternion)).normalize();
          const actualQ = yaw.clone().fromArray(r.worldQuaternion).normalize();
          const orientationError = expectedQ.angleTo(actualQ) * 180 / Math.PI;
          if (positionError > maximumBonePositionErrorMeters) { maximumBonePositionErrorMeters = positionError; worstBonePosition = name; }
          if (orientationError > maximumBoneOrientationErrorDegrees) { maximumBoneOrientationErrorDegrees = orientationError; worstBoneOrientation = name; }
        }
        delete baseline.vertices; delete rotated.vertices;
        results.push({ ...selection, path: a.path, ...pose, vertices: count, maximumMeters: round(maximum), rmsMeters: round(Math.sqrt(square / count)), worst, groups, maximumBonePositionErrorMeters, worstBonePosition, maximumBoneOrientationErrorDegrees, worstBoneOrientation, baseline, rotated });
      }
      }
      renderer.render = realRender;
      return { kind: 'actual-bundled-viewer-yaw-equivariance-audit', allModels, testedModels, declaredPackageHashes: globalThis.SOCCER_V7_DATA.hashes, method: 'Full decoded skinned vertex comparison after identical paused clip seeks at baseYaw 0 and pi. Seven poses include active slide hand support and bilateral get_up hand support, with independently validated anatomical skin/glove triangles and positive actual ground/anchor observations. Those two poses advance an equal1/120s step at each heading to require actual solver execution; their sample clocks must match. Baseline world vertices are independently rotated 180 degrees about the world origin. Actor state is reset through paused seek; source sampler, solver and post-IK floor code are unchanged. Public actor inspection changes only heading/offset state.', limitations: ['Seven static poses per selected identity and LOD; not every heading or stateful transition.', 'Grouping uses largest skin weight, not an anatomical segmentation. Rest-Y bins use original decoded POSITION.y.', 'Vertices shared across split material primitives are counted separately.', 'A partial diagnostic can remain valid for its exact served offline payload while raw source GLBs are being exported; complete/pass still require all disk guards.', 'No GPU or physical-phone performance measurement.'], results };
    }, { allModels,palmFactorySource:createPhysicalPalmObserver.toString() });
    report.generatedAt = new Date().toISOString();
    report.auditSource = auditSource;
    report.coverage={models:report.testedModels.length,posesPerModel:7,poseComparisons:report.results.length,requiredPhysicalPalmSamples:report.results.reduce((sum,row)=>sum+(row.requiredPalmBones?.length||0)*2,0),positivePhysicalPalmSamples:report.results.reduce((sum,row)=>sum+[row.baseline,row.rotated].reduce((n,sample)=>n+sample.palmProof.filter(palm=>palm.positive).length,0),0)};
    report.inputs=inputs;report.changedInputs=inputFiles.filter(file=>stamp(file).sha256!==inputs[file].sha256);report.declaredSourceBindings=declaredSourceBindings(report.declaredPackageHashes,inputs);report.palmObserverSource={file:'source/audit-action-observer.cjs',sha256:inputs['source/audit-action-observer.cjs'].sha256};
    report.packageSnapshot={atomicConstruction:packageSnapshot.atomicConstruction,modelIntegrity:packageSnapshot.integrity};
    report.servedResources = served;
    report.loadedModels = report.testedModels.map(model => servedGLB[model.path] || { path: model.path, error: 'Payload not captured' });
    report.modelsMatchDisk = report.loadedModels.map(model => ({ path: model.path, pass: digest(fs.readFileSync(path.join(root, model.path))) === model.sha256 }));
    report.servedResourcesMatchDisk = Object.entries(served).map(([file, stamp]) => ({ path: file, pass: digest(fs.readFileSync(path.join(root, file))) === stamp.sha256 }));
    report.errors = errors;
    report.remoteRequests = remoteRequests;
    report.thresholds = { maximumGeometryEquivarianceErrorMeters: .001, maximumBonePositionErrorMeters: .001, maximumBoneOrientationErrorDegrees: .5 };
    report.checks = {
      sevenPosesPerRequestedModel: report.testedModels.length === (allModels ? 16 : 1) && report.testedModels.every(model => report.results.filter(pose => pose.path === model.path).length === 7),
      allDeclaredSourceHashesMatch:report.declaredSourceBindings.pass,
      allSourceInputsUnchanged:report.changedInputs.length===0,
      activePhysicalPalmSolvers:report.results.filter(row=>row.requiredPalmBones).length===(allModels?32:2)&&report.results.filter(row=>row.requiredPalmBones).every(row=>[row.baseline,row.rotated].every(sample=>sample.palmProof.length===row.requiredPalmBones.length&&sample.palmProof.every(palm=>palm.positive))),
      physicalPalmContractSupported:report.results.filter(row=>row.requiredPalmBones).every(row=>row.baseline.palmContractSupported&&row.rotated.palmContractSupported),
      matchingSourcePoseTimes:report.results.every(row=>Math.abs(row.baseline.sampleSeconds-row.rotated.sampleSeconds)<=1e-8&&row.baseline.palmPositiveStepSeconds===row.rotated.palmPositiveStepSeconds),
      requestedIdentityAndLodPaths: report.testedModels.every(model => model.path === `models/${model.characterID}-lod${model.lod}.glb`),
      noPageErrorsOrRemoteRequests: errors.length === 0 && remoteRequests.length === 0,
      actualPayloadMatchesLoadedData: report.loadedModels.every(model => model.sha256 === report.declaredPackageHashes?.models?.[model.path]),
      servedFilesUnchanged: report.servedResourcesMatchDisk.every(row => row.pass),
      auditorUnchanged: auditSource.sha256 === digest(fs.readFileSync(__filename)),
      actualPayloadMatchesCurrentSourceGLBs: report.modelsMatchDisk.every(row => row.pass),
      geometryYawEquivariance: report.results.every(row => row.maximumMeters <= report.thresholds.maximumGeometryEquivarianceErrorMeters),
      bonePositionYawEquivariance: report.results.every(row => row.maximumBonePositionErrorMeters <= report.thresholds.maximumBonePositionErrorMeters),
      boneOrientationYawEquivariance: report.results.every(row => row.maximumBoneOrientationErrorDegrees <= report.thresholds.maximumBoneOrientationErrorDegrees)
    };
    report.complete = report.checks.actualPayloadMatchesCurrentSourceGLBs && report.checks.servedFilesUnchanged&&report.checks.allDeclaredSourceHashesMatch&&report.checks.allSourceInputsUnchanged&&report.checks.sevenPosesPerRequestedModel&&report.checks.physicalPalmContractSupported;
    report.partialDiagnostic = diagnostic && !report.complete;
    report.pass = Object.values(report.checks).every(Boolean);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ file: output, pass: report.pass, complete: report.complete, checks: report.checks, models: report.loadedModels, runtime: served['vendor/viewer-runtime.js'], poses: report.results.map(row => ({ clip: row.clip, phase: row.phase, maximumMeters: row.maximumMeters, rmsMeters: row.rmsMeters, bonePosition: row.maximumBonePositionErrorMeters, boneOrientationDegrees: row.maximumBoneOrientationErrorDegrees, worstBoneOrientation: row.worstBoneOrientation, regions: Object.fromEntries(Object.entries(row.groups.region).map(([key, value]) => [key, { maximum: value.maximumMeters, rms: value.rmsMeters }])) })) }, null, 2));
    if (!report.pass) process.exitCode = 1;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// SPDX-License-Identifier: CC0-1.0
// Original acceptance checks. Run: node --test workout/island/design/racing-tracks-v2/verify.test.mjs
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {TRACKS} from './tracks.mjs';
import {validateGeometry, segmentDistance, segmentsIntersect} from './geometry.mjs';
import {buildSpeedProfile, buildScaledTrack, profileSpeedAt, wrap} from './analysis.mjs';
import {simulateLap, physicsSourceSHA256} from './simulate.mjs';
import {checkRibbons} from './ribbon-check.mjs';
import {createTrack} from '../../minigames/racing-tracks.mjs';

const root = new URL('./', import.meta.url);
const readJSON = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const layoutDocument = await readJSON('layouts.json');
const layouts = new Map(layoutDocument.tracks.map(layout => [layout.id, layout]));
const tolerance = 1e-7;

async function listFiles(directory = root, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const name = prefix + entry.name;
    assert.ok(!entry.isSymbolicLink(), `Package must not escape through symlink: ${name}`);
    if (entry.isDirectory()) files.push(...await listFiles(new URL(entry.name + '/', directory), name + '/'));
    else files.push(name);
  }
  return files.sort();
}

test('every package file loads, text decodes, JSON parses, modules parse, and licenses cover each file', async () => {
  const files = await listFiles();
  for (const required of ['tracks.json','tracks.mjs','layouts.json','preview.html','preview.mjs','preview.css','REPORT.md','LICENSES.md','measurements.json'])
    assert.ok(files.includes(required), `Missing deliverable: ${required}`);
  const licenses = await readFile(new URL('LICENSES.md', root), 'utf8');
  const decoder = new TextDecoder('utf-8', {fatal:true});
  for (const name of files) {
    const bytes = await readFile(new URL(name, root));
    assert.ok(bytes.length > 0, `Empty file: ${name}`);
    assert.ok(licenses.includes('`' + name + '`'), `No explicit source/license entry for ${name}`);
    if (/\.(?:mjs|json|md|html|css|txt|csv|svg|py)$/.test(name)) {
      const text = decoder.decode(bytes);
      assert.ok(!text.includes('\ufffd'), `Replacement character: ${name}`);
      if (name.endsWith('.json')) JSON.parse(text);
      if (name.endsWith('.mjs')) {
        // Parse browser modules and build scripts without executing or rewriting them.
        const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], {encoding:'utf8'});
        assert.equal(result.status, 0, `${name}: ${result.stderr}`);
      }
      if (name.endsWith('.py')) {
        const result = spawnSync('python3',['-c',
          'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"), filename=sys.argv[1])',
          fileURLToPath(new URL(name,root))],{encoding:'utf8'});
        assert.equal(result.status,0,`${name}: ${result.stderr}`);
      }
    }
  }
  const html = await readFile(new URL('preview.html', root), 'utf8');
  assert.match(html, /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=/i);
  assert.match(html, /Content-Security-Policy/i);
  assert.doesNotMatch(html, /wasm-unsafe-eval|unsafe-eval|https?:\/\/[^\s"'<>]+\.(?:js|mjs|css)/i);
});

test('JSON and module provide the same six complete, finite periodic track definitions', async () => {
  assert.deepEqual(await readJSON('tracks.json'), TRACKS);
  assert.equal(TRACKS.length, 6);
  assert.equal(new Set(TRACKS.map(track => track.id)).size, 6);
  assert.equal(layouts.size, 6);
  assert.equal(layoutDocument.longStraightThreshold, 160);
  for (const track of TRACKS) {
    for (const key of ['id','name','theme','landmark']) assert.equal(typeof track[key], 'string', `${track.id}.${key}`);
    assert.ok(track.width > 0 && Number.isFinite(track.width));
    assert.ok(track.points.length >= 20);
    for (const point of track.points) {
      assert.equal(point.length, 3);
      assert.ok(point.every(Number.isFinite), `${track.id}: nonfinite point`);
    }
    // Production createTrack closes cyclically. Duplicating the endpoint creates a cusp.
    assert.notDeepEqual(track.points[0], track.points.at(-1));
    const path = createTrack(track), a = path.sample(0), b = path.sample(path.length);
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z) < tolerance, `${track.id}: closure`);
    assert.ok(path.length >= 1300 && path.length <= 1600, `${track.id}: pre-scale length ${path.length}`);
    const layout = layouts.get(track.id);
    assert.ok(layout.corners.length >= 10 && layout.corners.length <= 14, `${track.id}: turn count`);
    assert.ok(layout.corners.filter(c => c.type === 'sharp').length >= 3, `${track.id}: sharp count`);
    assert.ok(layout.corners.some(c => c.type === 'hairpin' && c.angleDeg >= 135), `${track.id}: hairpin`);
    assert.ok(layout.chicanes.length >= 1, `${track.id}: chicane`);
    assert.ok(layout.straights.filter(s => s.length >= 160).length <= 1, `${track.id}: long straights`);
    for (const chicane of layout.chicanes) {
      const [first,second] = chicane.corners.map(id => layout.corners.find(c => c.id === id));
      assert.ok(first && second && first.hand !== second.hand && chicane.gap < 85, `${track.id}: invalid chicane`);
    }
  }
});

test('geometry checker rejects crossings and unsafe close parallel sections', () => {
  assert.ok(segmentsIntersect([0,0],[10,10],[0,10],[10,0]));
  assert.equal(segmentDistance([0,0],[100,0],[10,8],[90,8]), 8);
  assert.equal(segmentDistance([0,0],[10,0],[15,0],[20,0]), 5);
  const crossing = validateGeometry({id:'crossing-fixture',width:5,samples:12,points:[[0,0,0],[100,0,100],[0,0,100],[100,0,0]]});
  assert.ok(crossing.crossings > 0 && !crossing.passed, 'Crossing fixture escaped validation');
  const parallel = validateGeometry({id:'parallel-fixture',width:5,samples:12,points:[[0,0,0],[200,0,0],[200,0,10],[0,0,10]]});
  assert.ok(parallel.minClearance < 3*parallel.width && !parallel.passed, 'Close parallel fixture escaped validation');
});

for (const [circuitIndex, definition] of TRACKS.entries()) {
  test(`${definition.id}: spline geometry, clearance, grade and road winding`, () => {
    const geometry = validateGeometry(definition);
    assert.equal(geometry.crossings, 0);
    assert.equal(geometry.invertedRoadTriangles, 0);
    assert.equal(geometry.closed, true);
    assert.ok(geometry.minClearance >= 3*definition.width, `Clearance ${geometry.minClearance} < ${3*definition.width}`);
    assert.ok(geometry.maxGrade <= .08, `Grade ${geometry.maxGrade}`);
    // The contiguous local arc is excluded only for clearance, never for crossings.
    // Dense i/i+2 segments touch through their shared road neighbourhood by design.
    assert.equal(geometry.localArcExclusion, 4*definition.width);
    assert.equal(geometry.passed, true);
  });

  test(`${definition.id}: speed and braking criteria pass AI and physical envelopes in all five production tiers`, () => {
    const layout = layouts.get(definition.id), raw = createTrack(definition);
    for (let tier=0;tier<5;tier++) {
      for (const lateralAcceleration of ['ai',44]) {
        const profile = buildSpeedProfile(definition,{tier,lateralAcceleration}), scaled = buildScaledTrack(definition,{tier,reverse:tier===3});
        assert.ok(profile.under85Fraction >= .4, `${definition.id}/tier${tier}: under85=${profile.under85Fraction}`);
        assert.ok(profile.over95Fraction <= .25, `${definition.id}/tier${tier}: over95=${profile.over95Fraction}`);
        assert.ok(profile.samples.some(sample => sample.braking), `${definition.id}/tier${tier}: no braking zone`);
        assert.ok(profile.samples.some(sample => sample.accelerating), `${definition.id}/tier${tier}: no acceleration zone`);
        for (const corner of layout.corners.filter(c => c.type === 'sharp' || c.type === 'hairpin')) {
          const point = raw.sample(corner.s);
          const s = scaled.project(point.x*1.65,point.z*1.65).s;
          const speed = profileSpeedAt(profile,s,'cornerCap');
          assert.ok(speed <= .75*profile.topSpeed + tolerance,
            `${definition.id}/tier${tier}/${corner.id}: apex target ${(speed/profile.topSpeed*100).toFixed(2)}% > 75%`);
          const endpoints = [corner.entryS,corner.exitS].map(rawS => {
            const p = raw.sample(rawS);
            return scaled.project(p.x*1.65,p.z*1.65).s;
          });
          if (wrap(endpoints[1]-endpoints[0],profile.length) > profile.length/2) endpoints.reverse();
          const interval = wrap(endpoints[1]-endpoints[0],profile.length);
          const speeds = profile.samples.filter(row => wrap(row.s-endpoints[0],profile.length) <= interval).map(row => row.speed);
          speeds.push(...endpoints.map(endpoint => profileSpeedAt(profile,endpoint)));
          assert.ok(Math.max(...speeds) <= .75*profile.topSpeed+tolerance,
            `${definition.id}/tier${tier}/${corner.id}: envelope exceeds 75% within named corner`);
        }
      }
    }
  });

  test(`${definition.id}: production road, grass verges and terrain do not expose green strips in any tier`, {timeout:120000}, () => {
    for (let tier=0;tier<5;tier++) {
      const result = checkRibbons(definition,{tier});
      assert.equal(result.foldedRoadTriangles,0, `${definition.id}/tier${tier}: folded road`);
      assert.equal(result.grass.visibleIntrusionPairs,0, `${definition.id}/tier${tier}: grass above road`);
      assert.equal(result.terrain.visibleIntrusionPairs,0, `${definition.id}/tier${tier}: terrain above road`);
      assert.equal(result.passed,true);
    }
  });

  for (const tier of [0,4]) test(`${definition.id}: actual unmodified physics completes AI and physical standing + rolling laps at tier ${tier}`, {timeout:120000}, () => {
    for (const lateralAcceleration of ['ai',44]) {
      const result = simulateLap(definition,{tier,circuitIndex,lateralAcceleration});
      assert.equal(result.finished,true);
      assert.equal(result.checkpoints,32);
      assert.equal(result.requiredCheckpoints,32);
      assert.equal(result.wallHits,0);
      assert.equal(result.recoveries,0);
      assert.equal(result.lapTimes.length,2);
      assert.ok(result.standingLapSeconds > result.rollingLapSeconds);
      assert.ok(result.rollingLapSeconds > 0 && Number.isFinite(result.rollingLapSeconds));
      assert.ok(result.maxLateral < definition.width*(1-tier*.025)/2);
      assert.ok(Math.abs(result.measuredDistance-result.length) < 1, 'Rolling distance must cover exactly one lap');
      assert.equal(result.completeRollingLap,true);
      assert.ok(result.under85Fraction >= .4);
      assert.ok(result.over95Fraction <= .25);
      assert.ok(result.brakingFraction > 0);
      assert.ok(result.samples.every(sample => Number.isFinite(sample.s+sample.speed+sample.x+sample.y+sample.z)));
    }
  });
}

test('recorded measurements identify exact physics and successful per-track simulations', async () => {
  const measurements = await readJSON('measurements.json');
  assert.equal(measurements.physicsSha256, await physicsSourceSHA256());
  assert.match(measurements.baselineCommit,/^[0-9a-f]{40}$/);
  assert.equal(measurements.tracks.length,6);
  assert.equal(measurements.baseline.length,6);
  const sourceFiles = {racingPhysics:'../../minigames/racing-physics.mjs',racingTracks:'../../minigames/racing-tracks.mjs',
    analysis:'analysis.mjs',simulate:'simulate.mjs',geometry:'geometry.mjs',ribbonCheck:'ribbon-check.mjs',tracksData:'tracks.json',layouts:'layouts.json'};
  for (const [key,name] of Object.entries(sourceFiles)) {
    const hash = createHash('sha256').update(await readFile(new URL(name,root))).digest('hex');
    assert.equal(measurements.sourceHashes[key],hash,`Recorded source drift: ${name}`);
  }
  for (const record of measurements.tracks) {
    const definition = TRACKS.find(t => t.id === record.id);
    assert.ok(definition);
    assert.equal(record.geometry.width,definition.width);
    assert.equal(record.geometry.localArcExclusion,4*definition.width);
    assert.equal(record.tiers.length,5);
    for (const item of record.tiers) {
      assert.ok(item.ideal.under85Fraction >= .4 && item.ideal.over95Fraction <= .25);
      assert.ok(item.physical.under85Fraction >= .4 && item.physical.over95Fraction <= .25);
      assert.ok(item.corners.filter(c => c.type === 'sharp' || c.type === 'hairpin').every(c => c.passes25));
      assert.ok(item.physicalCorners.filter(c => c.type === 'sharp' || c.type === 'hairpin').every(c => c.passes25));
      assert.equal(item.ribbons.passed,true);
      for (const key of ['simulation','physicalSimulation']) {
        assert.equal(item[key].finished,true);
        assert.equal(item[key].checkpoints,32);
        assert.equal(item[key].completeRollingLap,true);
        assert.equal(item[key].wallHits,0);
        assert.equal(item[key].recoveries,0);
        assert.ok(item[key].rollingLapSeconds > 0);
        assert.ok(item[key].under85Fraction >= .4 && item[key].over95Fraction <= .25);
      }
    }
  }
});

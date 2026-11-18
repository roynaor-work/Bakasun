// SPDX-License-Identifier: CC0-1.0
// Original reproducible measurements; no production file is written.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TRACKS as CURRENT, createTrack } from '../../minigames/racing-tracks.mjs';
import { TRACKS } from './tracks.mjs';
import { validateGeometry } from './geometry.mjs';
import { checkRibbons } from './ribbon-check.mjs';
import { buildScaledTrack, buildSpeedProfile, profileSpeedAt, wrap } from './analysis.mjs';
import { simulateLap, physicsSourceSHA256 } from './simulate.mjs';

const directory = new URL('./', import.meta.url);
const layouts = JSON.parse(await readFile(new URL('layouts.json', directory), 'utf8'));
const summarizeProfile = ({samples, ...summary}) => summary;
const summarizeSimulation = ({samples, ...summary}) => summary;
const baselineCommit = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: fileURLToPath(directory), encoding: 'utf8' }).trim();
const hash = async path => createHash('sha256').update(await readFile(new URL(path,directory))).digest('hex');
const sourceHashes = {};
for (const [name,path] of Object.entries({racingPhysics:'../../minigames/racing-physics.mjs',racingTracks:'../../minigames/racing-tracks.mjs',analysis:'analysis.mjs',simulate:'simulate.mjs',geometry:'geometry.mjs',ribbonCheck:'ribbon-check.mjs',tracksData:'tracks.json',layouts:'layouts.json'})) sourceHashes[name] = await hash(path);
const result = { schemaVersion: 1, baselineCommit, physicsSha256: await physicsSourceSHA256(), sourceHashes,
  methodology: {
    rawUnits: 'metres before XZ scale 1.65; Y and width unchanged',
    profile: 'periodic forward/backward centre-line envelope; max of production AI 18 m heading window and local 4 m window',
    idealLateralAcceleration: 'stage.aiCorner (17,19.2,21.4,23.6,25.8 m/s²)',
    physicalLateralAcceleration: '44 m/s² soft player limit with exact full-lock tanh and steering-speed response',
    simulation: 'unmodified createRacing, 60 Hz, default gearbox and feel, normal player inputs only, 2 laps, all 32 gates',
    controls: 'same deterministic good-player controller; AI and faster physical target trials; 1.5% target margin',
    timeTrial: 'stock equipment, no opponents, no pad/pickup, no nitro, no drift, no drafting; walls remain enabled',
    fractions: 'distance weighted; spatial envelopes periodic, actual measurements second complete rolling lap',
    corner25Percent: 'all named sharp/hairpin corner intervals: maximum AI and physical-envelope speeds <= 75% stock stage.playerSpeed',
    spatialLimit: 'spatial envelope omits 0.16 s gear shifts; actual headless times include shifts; neither envelope is a global optimal racing line'
  }, tracks: [], baseline: [] };
const traces = {schemaVersion:1, tracks:[], baseline:[]};
const reuseIndex = process.argv.indexOf('--reuse-baseline');
let baselineCache = null;
if (reuseIndex >= 0) {
  const cachePath = process.argv[reuseIndex + 1] || '/tmp/racing-baseline-final.json';
  baselineCache = JSON.parse(await readFile(cachePath,'utf8'));
  if (baselineCache.baselineCommit !== baselineCommit) throw new Error('Baseline cache commit mismatch');
  for (const key of ['racingPhysics','racingTracks','analysis','simulate','geometry','ribbonCheck'])
    if (baselineCache.sourceHashes?.[key] !== sourceHashes[key]) throw new Error(`Baseline cache source mismatch: ${key}`);
  if (baselineCache.baseline?.length !== 6 || baselineCache.baseline.some(t=>t.tiers.length!==5)) throw new Error('Incomplete baseline cache');
}


function cornerMetrics(definition, layout, runtimeTrack, ideal) {
  const raw = createTrack(definition);
  // Project the exact raw spline location after XZ scaling. This also handles
  // reverse tier 3 without assuming that Y scales or arc length scales exactly.
  const runtimeS = s => {
    const p = raw.sample(s);
    return runtimeTrack.project(p.x * 1.65, p.z * 1.65).s;
  };
  return layout.corners.map(corner => {
    const s = runtimeS(corner.s), entryS = runtimeS(corner.entryS), exitS = runtimeS(corner.exitS);
    let from = entryS, to = exitS;
    // The shorter interval is this individual corner in either race direction.
    if (wrap(to - from, ideal.length) > ideal.length / 2) [from,to] = [to,from];
    const interval = wrap(to - from, ideal.length);
    const rows = ideal.samples.filter(row => wrap(row.s - from, ideal.length) <= interval);
    const speeds = rows.map(row=>row.speed).concat(profileSpeedAt(ideal,from),profileSpeedAt(ideal,to));
    const maxSpeed = Math.max(...speeds), minSpeed = Math.min(...speeds);
    const apexSpeed = profileSpeedAt(ideal,s), cornerCap = profileSpeedAt(ideal,s,'cornerCap');
    return { id:corner.id,type:corner.type,s,entryS,exitS,radius:corner.radius,angleDeg:corner.angleDeg,
      apexSpeed,cornerCap,minSpeed,maxSpeed,slowdownFraction:1-maxSpeed/ideal.topSpeed,
      passes25:maxSpeed <= .75*ideal.topSpeed+1e-9 };
  });
}

async function measureSet(definitions, destination, traceDestination, newDesign) {
  for(const [circuitIndex,definition] of definitions.entries()) {
    const layout = newDesign ? layouts.tracks.find(row=>row.id===definition.id) : null;
    const geometry = validateGeometry(definition);
    const record = {id:definition.id,name:definition.name,geometry,
      layout: layout ? {turns:layout.corners.length,sharpCorners:layout.corners.filter(c=>c.type==='sharp').length,
        hairpins:layout.corners.filter(c=>c.type==='hairpin').length,chicanes:layout.chicanes.length,
        longStraights:layout.straights.filter(s=>s.length>=layouts.longStraightThreshold).length,
        longestStraight:Math.max(...layout.straights.map(s=>s.length)),longStraightThreshold:layouts.longStraightThreshold} : null,
      tiers:[]};
    const traceRecord={id:definition.id,tiers:[]};
    for(let tier=0;tier<5;tier++) {
      const track = buildScaledTrack(definition,{tier,reverse:tier===3});
      const ideal = buildSpeedProfile(track,{tier});
      const physical = buildSpeedProfile(track,{tier,lateralAcceleration:44});
      const simulation = simulateLap(definition,{tier,circuitIndex,lateralAcceleration:'ai'});
      const physicalSimulation = simulateLap(definition,{tier,circuitIndex,lateralAcceleration:44});
      const corners = layout ? cornerMetrics(definition,layout,track,ideal) : [];
      const physicalCorners = layout ? cornerMetrics(definition,layout,track,physical) : [];
      const ribbons = checkRibbons(definition,{tier});
      record.tiers.push({tier,reverse:tier===3,ribbons,ideal:summarizeProfile(ideal),physical:summarizeProfile(physical),corners,physicalCorners,
        simulation:summarizeSimulation(simulation),physicalSimulation:summarizeSimulation(physicalSimulation)});
      if(tier===0||tier===4) {
        const compact = rows => rows.filter((_,i)=>i%3===0||i===rows.length-1)
          .map(({s,speed,brake})=>({s:+s.toFixed(3),speed:+speed.toFixed(4),brake}));
        traceRecord.tiers.push({tier,simulation:compact(simulation.samples),physicalSimulation:compact(physicalSimulation.samples)});
      }
      const concise = {set:newDesign?'new':'baseline',id:definition.id,tier,
        idealUnder85:+(ideal.under85Fraction*100).toFixed(2),idealOver95:+(ideal.over95Fraction*100).toFixed(2),
        physicalUnder85:+(physical.under85Fraction*100).toFixed(2),physicalOver95:+(physical.over95Fraction*100).toFixed(2),actualPhysicalUnder85:+(physicalSimulation.under85Fraction*100).toFixed(2),rollingSeconds:+simulation.rollingLapSeconds?.toFixed(3),physicalRollingSeconds:+physicalSimulation.rollingLapSeconds?.toFixed(3),
        sharp25:corners.filter(c=>c.type==='sharp'||c.type==='hairpin').every(c=>c.passes25),physicalSharp25:physicalCorners.filter(c=>c.type==='sharp'||c.type==='hairpin').every(c=>c.passes25),
        finished:simulation.completeRollingLap&&physicalSimulation.completeRollingLap,
        ribbons:ribbons.passed,wallHits:simulation.wallHits+physicalSimulation.wallHits,recoveries:simulation.recoveries+physicalSimulation.recoveries};
      console.log(JSON.stringify(concise));
    }
    destination.push(record);traceDestination.push(traceRecord);
  }
}

await measureSet(TRACKS,result.tracks,traces.tracks,true);
const currentRaw = CURRENT.map(definition=>({...definition,points:definition.points.map(([x,y,z])=>[x/1.65,y,z/1.65])}));
if (baselineCache) { result.baseline = baselineCache.baseline; traces.baseline = baselineCache.tracesBaseline; }
else await measureSet(currentRaw,result.baseline,traces.baseline,false);
await writeFile(new URL('measurements.json',directory),JSON.stringify(result,null,2)+'\n');
await writeFile(new URL('simulations.json',directory),JSON.stringify(traces)+'\n');
const failures=[];
for(const track of result.tracks) {
  if(!track.geometry.passed) failures.push(`${track.id}: geometry`);
  if(track.geometry.length<1300||track.geometry.length>1600)failures.push(`${track.id}: raw length`);
  if(track.layout.turns<10||track.layout.turns>14||track.layout.sharpCorners<3||track.layout.hairpins<1||track.layout.chicanes<1||track.layout.longStraights>1)failures.push(`${track.id}: layout`);
  for(const tier of track.tiers) {
    if(!tier.ribbons.passed)failures.push(`${track.id} tier${tier.tier}: rendered ribbon/terrain intrusion`);
    if(tier.ideal.under85Fraction<.4||tier.ideal.over95Fraction>.25)failures.push(`${track.id} tier${tier.tier}: ideal speed fractions`);
    if(tier.physical.under85Fraction<.4||tier.physical.over95Fraction>.25)failures.push(`${track.id} tier${tier.tier}: physical speed fractions`);
    if(tier.physicalSimulation.under85Fraction<.4||tier.physicalSimulation.over95Fraction>.25)failures.push(`${track.id} tier${tier.tier}: actual physical speed fractions`);
    if(tier.physicalCorners.some(c=>(c.type==='sharp'||c.type==='hairpin')&&!c.passes25))failures.push(`${track.id} tier${tier.tier}: physical sharp slowdown`);
    if(tier.corners.some(c=>(c.type==='sharp'||c.type==='hairpin')&&!c.passes25))failures.push(`${track.id} tier${tier.tier}: sharp slowdown`);
    for(const simulation of [tier.simulation,tier.physicalSimulation])if(!simulation.completeRollingLap||simulation.wallHits||simulation.recoveries)failures.push(`${track.id} tier${tier.tier}: headless lap`);
  }
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}

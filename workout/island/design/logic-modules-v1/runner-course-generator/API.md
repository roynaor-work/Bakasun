# Runner course generator API v1

Entry point: `src/index.mjs`. Runtime: standard ES modules in Node or a browser; no dependencies or environment services. All exported data and generated results are deeply frozen, contain JSON-compatible values, and retain no mutable state. No function mutates or freezes its input. Units: metres, seconds, metres/second. Forward distance increases; lanes are `0` (x=−3), `1` (x=0), `2` (x=3), each 3 m wide. A renderer may map increasing distance to negative Z.

## Exports and validation

| Export | Contract |
|---|---|
| `API_VERSION` | Integer `1` |
| `SEGMENT_LENGTH_M` | `30` |
| `EPOCH_SEGMENTS` | `8`; random-access generation block, not a visual theme change |
| `MAX_SEGMENTS` | `1_000_000`; exclusive segment-index upper bound |
| `MAX_BATCH_SEGMENTS` | `1024` |
| `LANES` | Frozen three-element array of `{ index, xM, widthM }` |
| `DIFFICULTIES` | Frozen object keyed `1`, `2`, `3`; complete physics and grammar bounds |
| `THEMES` | Frozen object keyed `pine`, `ice`, `lava`, `aurora`, `village`, `peak`; labels, palettes and grammar weights |
| `PATTERNS` | Frozen `['gate', 'stagger', 'long', 'reward']` |
| `generateCourse(options)` | Frozen course for a random-access range |
| `generateSegment(options)` | Frozen self-contained single segment, including incoming obstacle tails |
| `validateCourse(course)` | Frozen independent validation report; malformed course data returns `valid:false` |

Generator options must be plain objects (ordinary or null prototype), not arrays or class instances. Unknown own enumerable keys throw `TypeError`. `seed` is required: a nonblank string of 1–128 UTF-16 code units, or an integer in 0…4,294,967,295. Seed type matters: `1` and `'1'` are different runs. String whitespace and Unicode are preserved; no normalization is applied. Optional undefined values use defaults. Invalid types/noninteger numbers throw `TypeError`; numeric values outside permitted bounds throw `RangeError`. No coercion or clamping occurs.

```js
generateCourse({
  seed: 'winter-17',       // required
  difficulty: 1,          // integer 1..3, default 1
  theme: 'pine',          // one of the six exact IDs, default pine
  startSegment: 0,        // integer 0..999999, default 0
  segmentCount: 12,       // integer 0..1024, default 12
});
generateSegment({ seed: 'winter-17', difficulty: 1, theme: 'pine', index: 123 });
```

`index` is required for `generateSegment`; range options are not accepted there. `startSegment + segmentCount` must be ≤1,000,000. An empty course is valid, with no obstacles, bonuses or witness; its report uses `null` for unavailable minimum timing statistics. `generateSegment({...config,index:i})` equals the segment with index `i` in every range containing it.

## Course schema

```js
{
  apiVersion: 1,
  config: { seed, difficulty, theme },
  segmentLengthM: 30,
  lanes: [{ index: 0, xM: -3, widthM: 3 }, /* lanes 1, 2 */],
  physics: { /* exact selected DIFFICULTIES entry */ },
  range: { startSegment, segmentCount, startM, endM },
  segments: [ /* consecutive Segment objects */ ]
}
```

`physics` fields: `id`, `name`, `nominalSpeedMps`, `maxSpeedMps`, `reactionSeconds`, `laneSwitchSeconds`, `maxLateralSpeedMps`, `playerHalfWidthM`, `playerHalfLengthM`, `lateralClearanceM`, `longitudinalClearanceM`, `hazardStartM`, `maxObstacleHalfWidthM`, `pairChance`, `sideChance`, `turnChance`. The last six govern generation, not additional runtime motion. All difficulties certify at `maxSpeedMps=31` and `maxLateralSpeedMps=3/.36`; nominal speed is advisory. No generated bonus changes these limits.

## Segment schema

```js
{
  apiVersion: 1, index, startM, endM, theme, difficulty,
  entryLane, exitLane,        // same or adjacent; never 0↔2 in one segment
  pattern,                   // gate | stagger | long | reward
  obstacles: [Obstacle],      // 1..3, owned by this segment
  carryIn: [Obstacle],        // 0..2 copies of previous segment's seam-crossing row
  bonuses: [Bonus],           // 1..3, all on the certified route
  path: {
    cueM,                    // first guaranteed notice; startM+3
    moveStartM,              // after maxSpeed × reactionSeconds
    moveEndM,                // after another maxSpeed × laneSwitchSeconds
    points: [{zM,xM}, ...]    // 6 increasing-z points, linear interpolation
  }
}
```

`startM=index*30`, `endM=startM+30`. `path.points` spans `[startM,endM+3]`; its final three metres hold `exitLane` and cover the full seam tail with player length and clearance. At `endM`, the next segment begins in the same position and holds it through its own initial clearance. If entry equals exit, the timed movement interval remains in the data but x is constant. Input for a lane-based game can follow `entryLane→exitLane`, but collision/rendering should use the continuous path and widths rather than instantaneous teleports.

`gate` has a late row; `stagger` adds a hazard in a lane outside the entry/exit corridor; `long` fixes the row's end to `endM+2`; `reward` places three bonuses. Other patterns can add an early side hazard according to difficulty/theme. Easy late rows block one lane, medium one or two, hard two. The exit lane is open. Side hazards start 8–10 m and end 16–18 m into the segment, outside both entry and exit lanes. Rows start at local 29/28/27 m and end at local 31–32 m. No safe exit lane or pattern repeats more than twice, including epoch seams.

```js
// Obstacle: axis-aligned world-space box footprint; all bounds inclusive for collision.
{ id: 's123-o0', kind: 'ice-spire', role: 'row', lane: 0,
  xM: -3, zStartM: 3719, zEndM: 3722, halfWidthM: .8 }

// Bonus: circular footprint; kind is a reward tag, with no implicit physics effect.
{ id: 's123-b0', kind: 'star', lane: 1, xM: 0,
  zM: 3718, radiusM: .18, value: 1 }
```

Obstacle `kind` comes from the selected theme; `role` is `row` or `side`. Obstacle longitudinal extents can exceed the owning segment's end by 2 m. Width varies within `[maxObstacleHalfWidthM-.1,maxObstacleHalfWidthM]` and stays within its lane. Bonus kinds are `star`, `energy`, `shield`; values are 1 or 3 in generated data (validator accepts integers 1..3). Bonus centres use local 28, 29, 29.8 m, entirely inside the segment. IDs are stable and unique within a run, independent of range/chunk size. IDs are not globally unique across seeds; prefix them with the run identity when mixing runs.

On stream start or resume, materialize `segments[0].carryIn` once, then spawn each segment's `obstacles` once. During ordinary continuation, `carryIn` identifies already-spawned tails and must not spawn duplicates. It is present in every segment so single-segment random access and chunked output remain identical. De-duplicate by `id` within a run if materializing a union. Do not clip obstacles at 30 m boundaries.

## Independent validation report

```js
{
  apiVersion: 1, valid: true,
  errors: [], // {code, message, segmentIndex: number|null, id: string|null}
  stats: {
    segments, obstacles, bonuses, laneChanges,
    minimumReactionHeadroomSeconds, // null for empty; floating-point tolerance 1e-6
    maximumLateralSpeedMps
  }
}
```

The validator checks schema/version/ranges/profiles, exactly three lanes, collision width bounds, incoming tail integrity between included segments, path continuity, full reaction time, minimum switch duration, lateral speed at 31 m/s, geometric lane availability at all obstacle events and event intervals, continuous swept-path collision, reachable bonus placement, bonus/obstacle separation, IDs and repeat limits. For the first requested segment, `carryIn` is the supplied boundary context; the validator does not fetch an undisclosed prefix. It does not regenerate from the seed or prove all alternate player choices safe.

The collision check expands each obstacle by player half length + longitudinal clearance, and half width + lateral clearance. For each polyline leg it clips the z interval to the expanded obstacle and tests the entire interpolated x interval, catching collisions between endpoints. Touching is a collision. Geometry and kinematic comparisons allow a 1e-6 numerical tolerance; generation rounds positions to 1e-6 m.

Error codes include `SCHEMA`, `VERSION`, `CONFIG`, `RANGE`, `SEGMENT_LENGTH`, `LANES`, `PHYSICS`, `SEGMENTS`, `SEGMENT`, `OBSTACLE`, `BONUS`, `ROUTE`, `REACTION`, `LANE_SWITCH`, `LATERAL_SPEED`, `LANE_CLOSED`, `PATH_COLLISION`, `BONUS_OFF_ROUTE`, `BONUS_COLLISION`, `SEAM`, `DUPLICATE_ID`, `REPEAT`. Reports are JSON-safe. The validator reports evidence about supplied data; it is not an untrusted-code sandbox.

## Replay and integration limits

Randomness is FNV-1a over a JSON tuple containing API version, typed seed, difficulty, theme, block/index and domain; each stream uses Mulberry32. No unseeded randomness, wall clock, stateful iterator or process-global cache is used. Eight-segment blocks have deterministic centre-lane seam anchors and independent route/pattern streams; object streams are per absolute segment index. The output is independent of generation call order and chunk sizes. V1 never silently changes this mapping; the test fixture SHA-256 is `e06ef6a46f7e6605a5e0b3161d91b6c915487f4e595ea67b18998a5301ef3e5e` for the 12-segment `runner-v1`/2/`lava` course's compact `JSON.stringify` output.

Enforce the documented speed ceiling, collision footprint, cue visibility and steering ability when integrating. Theme art must fit those boxes. Friction, wind, airborne rules, moving hazards, network delays or larger bodies require a new motion model and validation; their safety is not covered by this module. The module reserves a route at every segment and seam, including boosts up to 31 m/s; it does not supply a full ski game, assets or frame update loop.

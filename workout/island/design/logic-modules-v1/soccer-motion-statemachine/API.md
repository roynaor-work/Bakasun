# Soccer motion state machine API 1.0.0

Import only `./src/index.mjs`. `API_VERSION` is the string `'1.0.0'`; serialized state and graph use `schemaVersion:1`. Clip IDs include their source package, for example `soccer-run-cycles-v3:run`; short names alone are not accepted. Runtime source imports stay within `src/`, including extracted animation data. No dependencies, WASM, DOM, clock, random source, I/O or global mutable playback state are required.

Units: seconds for clock/clip time/duration, metres for position and translation, metres/second for speed, radians for heading, degrees only in rotation diagnostics. Coordinates are Y-up; heading 0 travels along +Z, heading π/2 along +X. Rotations are parent-local unit quaternions `[x,y,z,w]`; scales are componentwise XYZ. A Pose is an 18-element array in `clip.skeleton` order of `{translation:[x,y,z],rotation:[x,y,z,w],scale:[x,y,z]}`. Skeleton parents precede children; Root has parent −1.

## Exports

| Export | Result |
|---|---|
| `API_VERSION` | `'1.0.0'` |
| `CLIPS` | Deeply frozen full clip array; 89 source-qualified IDs |
| `HUBS` | Frozen `{field,keeper,referee}` map of idle/ready IDs |
| `TRANSITIONS` | Frozen complete explicit edge array |
| `GRAPH` | Frozen renderer-neutral `{schemaVersion,apiVersion,hubs,nodes,transitions}` |
| `getClip(id)` | Full frozen clip; unknown/non-string ID throws `RangeError` |
| `transitionsFrom(id)` | New mutable array of frozen outgoing edges; validates ID |
| `guardFailures(clip,role,context={})` | New string array naming failed guards |
| `chooseLocomotion(speedMps,role='field')` | Suggested clip ID; selection does not execute guards |
| `createMotionState(options={})` | Initial frozen JSON state |
| `restoreMotionState(jsonOrObject)` | JSON-cloned, validated, frozen state |
| `requestMotion(state,request,context={})` | Frozen `{state,events}` |
| `advanceMotion(state,dt,context={})` | Frozen `{state,events,rootDisplacement}` |
| `setLocomotion(state,options={},context={})` | Desired-speed/heading update plus locomotion request; `{state,events}` |
| `sampleMotion(state,options={})` | Frozen `{clipId,time,pose,diagnostics}` |
| `playbackRateFor(clipOrId,speedMps)` | Dimensionless playback rate |
| `RETIMING_POLICY`, `FLOOR_POLICY`, `DIAGNOSTIC_THRESHOLDS` | Frozen policy data |
| `sampleClip`, `blendPoses`, `worldPose`, `floorProbes`, `floorMinimum`, `correctFloor`, `poseDifference` | Low-level pose operations, detailed below |
| `auditClip`, `auditTransition`, `auditGraph` | Frozen measured diagnostic results |

Functions do not edit animation tracks or current playback fields in place. Use states produced by the API or `restoreMotionState`; returned states/results and nested data are frozen. Low-level pose functions intentionally return fresh **mutable** arrays/objects for renderer adapters. `transitionsFrom` and `guardFailures` also return fresh mutable arrays. This is not a generic validation layer for arbitrary glTF, proxies or hostile objects.

## Clip and graph data

Each clip exposes:

```js
{
  id, sourceId, sourcePackage,
  provenance: {branch,commit,path,gitBlob,sha256,bytes,
               catalogPath,catalogSha256,animationName},
  duration, glbDuration, loop, nativeRate, speedMps,
  category, role, kind, priority, guards,
  locomotion, rootMotion, events, supports, referenceTravel, rawMetadata,
  skeleton: [{name,parent,translation,rotation,scale}, ...],
  tracks: [{bone,path,interpolation,values,times}, ...]
}
```

`role` is normalized to `field`, `keeper` or `referee`; `rawMetadata` retains source spelling, such as `goalkeeper`. `kind` is `idle`, `ready`, `move`, `bridge`, `action` or `recovery`. It controls graph policy, not a complete physical classification: `running_kick` remains an action with `locomotion:true`. Source `duration` is the catalog time; `glbDuration` retains the float32 channel endpoint and can differ by a small rounding error. Current extracted tracks are LINEAR, with original accessor numbers and original time arrays, not synthesized test poses. `referenceTravel` is host demonstration metadata, not an additional baked Root displacement.

`GRAPH.nodes` omits heavy skeleton/tracks/raw metadata and retains ID, source package/name, duration, loop, role, kind, priority, guards, speed and provenance. Read counts from `CLIPS.length` and `TRANSITIONS.length`; use actual edge IDs rather than depending on array positions.

```js
{
  id: `${from}>${to}:${kind}`, from, to,
  kind: 'request' | 'automatic' | 'automatic-fallback' | 'cancel',
  exitWindow: [minNormalizedPhase,maxNormalizedPhase],
  entryPhase: number | 'preserve-normalized',
  blendSeconds, priority, guards,
  queueExpirySeconds: .45,
  cancellation: 'queue-when-locked' | 'mandatory' | 'early-window-only'
}
```

Numeric `entryPhase` is normalized destination time, not seconds. Loop-to-loop movement preserves the normalized phase. Native acceleration/deceleration handoffs use source `rawMetadata.nativeHandoff.targetPhaseSeconds / destination.duration`; this includes half-cycle entries in the v3 gaits. `running_kick` enters v3 `run` at time 0.4 s and blends for 0.3 s because its older source reference is a different running clip. Other ordinary entries use phase 0. Default blends are 0.18 s, recovery exits 0.22 s, cancel edges 0.20 s; a requested `fall_soft` uses 0.12 s to finish its entrance before the fastest source fall. The active edge is the authority.

Every role loop can request same-role non-recovery clips, with bridge entrance restrictions. `idle_to_*` requires an idle source; `*_to_idle` requires the matching source gait name. Loop request windows are `[0,1]`. One-shot clips have a mandatory automatic edge at `[1,1]`; non-recovery one-shots also have a cancel edge to their role hub during `[0,.14]`. Recovery clips cannot be requested directly or cancelled during normal playback. `createMotionState` can initialize a recovery for tooling, tests or explicit replay.

Mandatory fall/landing chains include:

| Predecessor within its package | Recovery |
|---|---|
| `slide_tackle` | `getup_fast` |
| `fall_soft`, `fall_foul` | `getup_soft`, `getup_foul`, respectively |
| `dive_left`, `dive_low_left`, `dive_high_left`, `catch_chest`, `catch_high` | `getup_keeper_left` |
| `dive_right`, `dive_low_right`, `dive_high_right`, `punch`, `save_with_foot` | `getup_keeper_right` |
| `scissor_backward` | `scissor_land_getup` |

All 14 predecessor-end/recovery-start poses match the extracted source data. These native splits still use the graph's runtime blend policy; exact pose matching is not a promise that the original author's velocity-continuous player is reproduced. Modern keeper dives already include their recovery and return directly to keeper ready; they do not use the older lying get-up clips. `header_prepare` is a standalone tracking action, not a compulsory predecessor to jumping headers. Ordinary actions and completed recoveries return to the role hub, except explicit running/native bridge continuations.

## State schema and ownership

```js
{
  schemaVersion: 1,
  apiVersion: '1.0.0',
  clock: 0,                         // elapsed simulation seconds
  clipId: 'soccer-run-cycles-v3:idle_relaxed',
  time: 0,                          // local clip seconds
  cycle: 0,                         // completed loops in this clip
  role: 'field',
  speedMps: 0,                      // desired simulation speed
  heading: 0,
  position: [0,0,0],
  blend: null,                      // or Blend below
  queue: null,                      // or Queue below
  sequence: 0                       // successful transition count
}

// Blend captures the unfloored displayed pose, including any previous blend.
{ fromClipId, fromPose: Pose, startedAt, duration }

// One queued request, not an arbitrary task list.
{ request: {clipId,ttl,priority,cancel}, expiresAt, priority }
```

`clock`, `time`, `cycle`, `speedMps` and `sequence` must be finite nonnegative numbers; cycle/sequence must be safe integers. Clip time must not exceed the clip's duration (1e−9 boundary tolerance). Role must match the selected clip. Position is three finite numbers; heading is finite. `blend` and `queue` must be explicit `null` or objects. A blend has finite nonnegative `startedAt≤clock`, positive duration, and a full TRS pose with finite numbers and nonzero quaternions. A queue must contain a known clip, finite nonnegative TTL/priority/expiry. Validation covers playback invariants; it is not an exhaustive JSON Schema that rejects all unknown properties or reconstructs graph history.

`restoreMotionState(value)` parses a string or JSON-round-trips an object, validates these invariants, and freezes the cloned result. Malformed JSON throws its parse error; invalid numeric/state invariants or IDs normally throw `RangeError`; a malformed request can throw `TypeError`. No coercion of numeric strings occurs. A saved state includes blend/queue data needed to continue playback; context is not stored, so supply it again on advance. Do not add renderer objects or live resources to saved state.

```js
createMotionState({
  role: 'field',              // field | keeper | referee
  clipId: HUBS.field,         // default HUBS[role]
  speedMps: 0, heading: 0,
  position: [0,0,0],
});
```

Initialization starts at time/cycle/clock/sequence 0 with no queue or blend. It checks role, finite values and the selected clip's maximum retiming envelope. Initialization is not a gameplay request: possession, action/height/space guards and `running_kick`'s minimum speed are not evaluated there. Use `requestMotion` to enforce those contextual guards during gameplay.

## Requests, priority, cancellation and guards

```js
requestMotion(state, {
  clipId: 'soccer-kicks-v2:chip', // required known ID
  ttl: .45,                    // optional, finite ≥0 seconds
  priority: 50,                // optional, finite ≥0; default target clip priority
  cancel: false,               // cancellation only when exactly true
}, context);
```

The destination's guards run first. A failure returns the same state with a `request-rejected` event. Requesting the active clip then returns `already-active`. An available edge in its exit window enters immediately and clears the queue; `ttl:0` does not prevent an immediate legal transition. A recovery target without its mandatory predecessor or a closed cancellation window is rejected rather than queued.

Otherwise a request enters the one-slot queue. `ttl:0` expires immediately. A still-live queued request with strictly higher priority is retained; equal priority is replaced by the new request. Priority defaults: recovery 110; fall/stumble/tackle 100; keeper action 80; other action 50; idle/ready/movement/bridge 10. Cancel edges advertise priority 200, but cancellation is decided by the explicit cancel edge/window; it does not use priority to break a recovery or other lock. Edge priorities do not create a general interrupt system.

At each advance boundary the queue is processed before a completed one-shot's automatic edge. `expiresAt≤clock+1e−9` expires first, including a tie with an unlock boundary. Guards are checked again using the new context; failure removes the queue. A legal request executes once its edge exists, typically after action→recovery→hub. Default 0.45 s requests can expire before an action or recovery completes; supply a longer TTL or repeat the controller command when desired. `queueExpirySeconds` on edges documents the default; the actual expiry is the request's `ttl` plus the request clock.

| Guard | Context semantics |
|---|---|
| `role:field/keeper/referee` | Current state role must match |
| `hasBall` | `context.hasBall === true`; applies to the kicks package, `run_ball`, keeper throw/punt |
| `canAct` | Fails if `context.grounded === false` or `context.canAct === false`; omitted values allow acting |
| `spaceForScissor` | Requires `context.spaceForScissor === true` |
| `height:min:max` | Requires finite `ballHeightMeters` inside the inclusive interval |
| `maxSpeed:n` | Finite supplied speed must not exceed n, with 1e−9 tolerance in guard evaluation |
| `minSpeed:n` | Requires finite supplied speed ≥n, with the same tolerance |

Volleys use ball height 0.5–1.2 m; scissors 1.2–1.8 m plus explicit space; headers, including preparation, 1.5–2.2 m. `running_kick` requires possession, `canAct` and speed 2.6–6.75 m/s. Normal machine calls override `context.speedMps` with `state.speedMps`; callers cannot bypass a speed guard with a different contextual speed. Direct `guardFailures` is a low-level inspection helper and expects a valid clip/context.

Automatic recovery is mandatory even if transient possession/grounded context changes. Automatic successors check **maximum speed only**, not every contextual guard. Acceleration bridges and `running_kick` have explicit `automatic-fallback` edges to the role hub: if the primary successor's maximum speed is no longer supported, `advanceMotion` emits `automatic-speed-fallback` and follows the fallback edge. It retains the desired speed; a continuous controller can subsequently request appropriate locomotion.

## Time, movement and event results

`advanceMotion(state,dt,context={})` accepts finite `dt≥0`. Clock overflow beyond `Number.MAX_SAFE_INTEGER`, unsafe cycle counters or more than 512 transition-boundary iterations throws `RangeError`. It splits elapsed time exactly at action completion, queue expiry and applicable future window openings; remaining time continues through mandatory chains. It does not discard time after the first transition. A zero-dt call can still expire/reject a queue or execute a completion already at its boundary.

Loops advance arithmetically rather than frame by frame; long loop advances aggregate counts and marker occurrences. One large call and partitioned calls with identical commands/context yield equivalent playback state within floating-point tolerance and the same total marker occurrences. Event array grouping may differ because a large call aggregates many occurrences; arrays are not a globally time-sorted expansion of every marker. Context changes only at calls/boundaries supplied by the host, not continuously inside a large dt.

For `kind==='move'`, `kind==='bridge'` or `locomotion===true`, each elapsed interval contributes `state.speedMps*seconds` along `[sin(heading),0,cos(heading)]`. Other actions, ready and idle intervals contribute zero travel. `rootDisplacement` is final minus initial simulation position for that call. Hips animation and `referenceTravel` are never added; vertical physics and direction changes from source demonstration paths are not integrated. Turn clips therefore require controller-supplied heading/path updates; backward/strafe clip names do not infer a different travel direction. Their original curved path/yaw demonstrations remain in metadata for an external adapter. `sampleMotion` does not apply `state.position` or heading to its local Pose. A host collider may consume the displacement, but should avoid also reapplying the already-updated position.

`setLocomotion(state,{speedMps=state.speedMps,heading=state.heading}={},context={})` updates desired speed/heading immediately, then requests `chooseLocomotion(...)` at priority 10 with default TTL. The updated desired values remain even if the request is queued, retained behind a higher-priority queue, or rejected by a destination guard. Check returned events and keep issuing a controller command if sustained locomotion is desired.

Events preserve the following data; optional fields depend on the reason:

| Type | Fields in addition to `type` |
|---|---|
| `transition` | `at,from,to,transitionId,kind` |
| `clip-event` | `clipId,event,count,firstAt,lastAt`; `event` is source metadata |
| `loop` | `at,clipId,count`; `at` is the aggregation interval end |
| `queued` | `at,clipId,expiresAt,replaced` (ID or null) |
| `queue-kept` | `at,clipId` of the retained request |
| `queue-expired` | `at,clipId` |
| `queue-rejected` | `at,clipId,guards` |
| `request-rejected` | `at,clipId,guards` or `reason` |
| `already-active` | `at,clipId` |
| `automatic-speed-fallback` | `at,from,to` before the fallback transition event |

Rejection reasons include `cancel-window-closed` and `recovery-requires-predecessor`. Marker occurrences inside the traversed interval are included once; a marker exactly at destination entry time is emitted by the transition. Entering at a later phase does not replay skipped earlier markers. `count`, `firstAt` and `lastAt` allow consumers to handle long intervals without allocating millions of events. Creating initial state itself emits no marker event.

## Locomotion and retiming

`chooseLocomotion` rejects negative/nonfinite speed, unknown role and speed >10.8 m/s. Field selection: speed <0.1→idle; <3.4→jog; <5.8→run; otherwise sprint, using v3 gaits. Keeper selection: <0.1→keeper ready, otherwise one-shot `keeper_shuffle`. Referee selection: <0.1→referee idle, otherwise referee run. Selection is a name lookup, not a promise that the chosen role-specific clip accepts every speed under the global 10.8 ceiling; its guards still apply.

`playbackRateFor` returns `min(1.5,speedMps/clip.speedMps)` only for a looping `move` clip with positive native speed; it returns 1 for actions, bridges, ready clips and the one-shot keeper shuffle. A zero desired speed freezes an eligible looping gait at rate 0. The v3 game speeds 2.6/4.5/7.2 map to native rate 1. Old clip caps are their own native speeds ×1.5, not the v3 limits. The standalone rate helper clamps at 1.5; request/initialization guards reject unsupported maximum speed instead of silently accepting excessive stride mismatch. Accelerating bridges inherit the target gait's cap. `RETIMING_POLICY` exposes these choices and the simulation-owned world-motion policy.

## Pose operations and floor presentation

`sampleClip(clip,time)` clamps finite clip time to `[0,duration]`, samples exact extracted channels with LINEAR translation/scale and shortest-path quaternion SLERP, and returns a fresh mutable Pose. It does not loop; the state machine handles wrapping. `blendPoses(a,b,weight)` requires equal pose-array lengths, clamps finite weight to `[0,1]`, interpolates translation/scale and SLERPs rotation. `worldPose(clip,pose)` composes parent-first local TRS into fresh world-space joint TRS **within the actor's native coordinate frame**; it does not apply state position/heading.

These helpers trust canonical skeleton/track/pose structure; they are not complete external-data validators. Malformed lengths, parent indices, tracks or rotations are outside their documented input form even when a particular malformed value happens to be accepted. Scalar finite/zero-quaternion checks do not replace model validation.

`sampleMotion(state,{floor=true,floorPolicy=FLOOR_POLICY}={})` samples the active clip and blends from the captured outgoing unfloored pose with clamped linear elapsed blend weight. A new transition during a blend captures that composite pose, preserving pose continuity at the instant of switching. The outgoing pose is held rather than advanced. This policy does not guarantee velocity/acceleration continuity or reproduce source C1/Hermite runtime metadata.

`floorProbes(clip,pose)` returns `{bone,position}` points: each joint origin except Root, and four corners around each foot with local offsets `[±.045,-.08,-.035]` / `[±.045,-.08,.12]`. `floorMinimum` returns the minimum Y among these probes. These are skeletal/sole proxies, not mesh vertices or a collision envelope.

`correctFloor(clip,pose,{maxLift=.12,clearance=0}={})` returns:

```js
{ pose, rawMinimum, minimum, lift, requiredLift, safe }
```

The function creates a fresh pose and raises each parentless Root by `min(maxLift,max(0,clearance-rawMinimum))`. The returned `minimum` is raw minimum plus applied lift; `safe` requires `minimum>=−1e−5`. `maxLift` and clearance must be finite nonnegative. Residual penetration is reported rather than hidden by unlimited lift. With floor enabled, `sampleMotion().diagnostics` contains these fields except pose; with floor disabled diagnostics is null and no floor correction is applied. Floor correction affects presentation only, never stored state position, source data or later simulation displacement.

`poseDifference(clip,a,b)` returns `{maxJointMeters,maxRotationDegrees}` using joint-origin separation under the canonical skeleton and parent-local quaternion angle. It is not a skin-surface error metric.

## Audits, thresholds and evidence

`auditClip(clipOrId,options={})` samples all native key times, exact endpoints and a uniform grid. It returns `{clipId,samples,minimum,time,floorPass,loopClosure}`; loopClosure is the endpoint pose difference or null for a nonlooping clip. This uses the runtime's sole-corner probes. The independent [native audit](data/native-audit.json) uses joint origins and sole centres, so its minima intentionally differ.

`auditTransition(transitionOrId,options={})` measures a graph edge at both window endpoints and uniform interior source phases. It follows edge phase/rate policy, freezes the outgoing source pose, samples the destination throughout the blend, and measures raw/blended/corrected poses. Supply an existing edge ID or the canonical edge object. Options:

```js
{ sampleRate:120, phaseSamples:5, speedMps:4.5 }
```

`sampleRate` is finite 1–240 Hz; `phaseSamples` is an integer 2–33. Omit speed for native target rate 1; otherwise it must be a valid speed for the rate helper. Single-point automatic windows use one source phase. Speed-profile audit rows measure the declared geometry/rate even when a gameplay request guard would reject that requested speed; they are diagnostics rather than a claim that every edge is usable at every profile. They do not simulate arbitrary blends already in progress or changing context.

Each transition result includes IDs/kind, source phases, sample count/rate, target rate/requested speed, `speedPermitted`, `speedGuardFailures`, raw hard-cut joint/rotation differences, maximum adjacent corrected-pose step, raw/corrected floor minima, required/applied lift, worst source phase and three pass flags. `speedPermitted` describes the requested speed against applicable destination speed guards; it does not certify possession, height or other gameplay context. Native-rate audit uses no requested speed. Blocked rows still retain measured geometry at the capped target rate:

| Field / threshold | Rule |
|---|---|
| `hardCutPass` | max joint ≤0.15 m **and** max local rotation ≤40° |
| `rawFloorPass` | raw blended probe minimum ≥−0.02 m |
| `adaptedPass` | corrected minimum ≥−0.02 m **and** max sampled corrected pose step ≤0.12 m |
| Presentation lift | default maximum 0.12 m |

`DIAGNOSTIC_THRESHOLDS` also exposes sampleRateHz 120 and phaseSamples 5. `adaptedPass` and `diagnostics.safe` deliberately use different residual-floor criteria (2 cm versus 1e−5 m). Passing after adaptation does not mean the source hard cut or uncorrected blend passes. The pose-step criterion depends on sampling interval; it is not a velocity bound or a proof between sample times.

`auditGraph(options={})` audits every declared edge and returns `{schemaVersion,thresholds,scope,summary,transitions}`. Summary includes transition/sample counts, `speedGuardedTransitions`, hard-cut/raw-floor/adapted failure counts and worst joint step, floor minima and required lift. All audit outputs are frozen. Tools write the reproducible JSON evidence; public runtime audit functions perform no I/O.

Evidence and reproducibility:

- [data/inventory.json](data/inventory.json): pinned source commits, catalog/GLB hashes, Git blob IDs, extracted counts and 14 excluded reference/template GLBs.
- [src/data/clips.mjs](src/data/clips.mjs): exact original float32 accessor values, original metadata and canonical skeleton. Equal time arrays/skeletons are shared as immutable data.
- [data/native-audit.json](data/native-audit.json): independent source-key/subframe FK and sole-centre sampling, before runtime adaptation.
- [data/transition-audit.json](data/transition-audit.json): current full graph at native/2.6/4.5/7.2 profiles, raw and adapted results; quality tests compare its summaries with fresh computation.
- [data/rejected-candidate-audit.json](data/rejected-candidate-audit.json): historical rejected candidate with exposed failures; not the final passing report.
- [LICENSES.md](LICENSES.md) and [data/licenses/](data/licenses/): full CC0 source notices and pinned links for all six authored motion packs; [data/README.md](data/README.md) explains extraction and provenance.

Source counts: locomotion-v2 19, kicks-v2 14, tackle-keeper-v2 19, volley-scissor-v1 6, run-cycles-v3 17, keeper-motion-v3 14. Source motions were authored/computed, not captured from an identified athlete. This module includes animation numbers and metadata, not meshes, skin weights, textures, Three.js, dense ball trajectories or live ball attachment. Audit measurements cover canonical joint origins/sole proxies at the stated samples, and exclude mesh envelope, contact IK, foot slip, physical ball collision, balance and unsampled time/phase/rate combinations. They are evidence for this graph and presentation policy, not whole-character or whole-game certification.

From the module directory:

```sh
node --test tests/*.test.mjs
python3 -m http.server 8765
```

Open [preview.html](http://localhost:8765/preview.html). To regenerate fixtures from pinned Git objects when the source history is available:

```sh
node tools/extract-clips.mjs
node tools/audit-native-clips.mjs
node tools/audit-transitions.mjs
```

The extraction tool accepts `--repo=/absolute/path/to/Bakasun`, reads pinned objects without branch switching/network access, and rewrites only this module's generated data. Audit tools rewrite their evidence files. Runtime consumers need none of these tools or repository history. Save the API version with replay state; replay depends on the same versioned graph, source data, command times and context sequence.

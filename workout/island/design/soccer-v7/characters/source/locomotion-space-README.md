# Continuous-phase locomotion motor

This module passed an independent isolated69-case actual-browser gait audit at both30Hz and120Hz on player01LOD0. It remains a runtime prototype until the final viewer integration and all identity/LOD audits pass. The compact evidence is in `locomotion-prototype-proof.json`; no physical-phone performance is inferred. It leaves all authored JSON/native GLB clips and the canonical rig unchanged.

`LocomotionSpace(THREE, clips, sample, skeleton)` owns speed, an unwrapped normalized gait phase, a heading-local world-distance coordinate, explicit feet and bounded request records. Its six nodes are the original run1–5 and sprint clips. They are sampled at the same normalized phase and blended by **actual speed**, with true idle contributions below1.6m/s. `snapshot()` exposes those actual contributors and sample clocks; the selected UI clip is a request, not proof of the currently displayed pose.

## API

- `reset({speed, phase, distance, feet, idleSeconds, sourceClip})` seeds the exact displayed soles/orientations. The local world frame has +Y up and +Z travel; the Actor supplies the frozen world origin/heading transform.
- `request(id)` accepts `idle`, `run_1` through `run_5`, or `sprint`. The latest request wins. Repeating the same request does not reset its deadline.
- `step(dt, geometry, {includeHistory=true})` integrates at subdivisions no larger than1/240s. Longitudinal acceleration is3.5m/s² and deceleration4.5m/s². Its output is the inspectable snapshot. The internal viewer uses `includeHistory:false` to avoid copying histories on every actor/frame; default public `snapshot()` retains the complete bounded heel/request history. Omission changes only the returned copy, as verified against identical full-history physical states.
- `pose()` returns same-phase blended canonical local rotations and Hips offset. The Actor applies foot targets with the supplied18-bone IK and scans the actual skinned mesh.
- `flightTarget(name, hip)` limits only an airborne foot's fore/aft position against a smooth bent-leg reach envelope while preserving its planned vertical clearance. Active plant anchors are never projected.
- `exportState()`, `restore()`, `copyFrom()` and `clone()` use structured cloning, retaining Infinity and the internal heel-record graph without cross-instance aliases. They preserve phase, speed, requests, immutable heel records, anchors, current swing plans and inherited-source commitments. A LOD swap must copy the motor and its world origin/heading and skip a zero-time solver step.

The nonmutating `predict(dt)` / `predictPose(dt)` helpers estimate the actual future motor body target using the same bounded speed and phase integrator. They are intended for upper-body world-inertial entry fades; a canonical selected gait can differ from the current motor mixture. They do not step feet or predict support. `poseAt(speed, phase, clock)` samples that body target directly. State and prediction checks are reproducible with `node source/locomotion-state-check.mjs`; their proof is in `locomotion-state-proof.json`. Per-frame geometry is numeric data with an optional `predictWorldReach` callback. Exports omit callbacks; callers regenerate them after Actor rebuild. A cloned circular motor rejects nonzero foot stepping until a new geometry callback is bound. See `locomotion-curve-README.md` for the exact circular world metric and coordinate proof.

## Contacts

Left heels cross integer phase and right heels cross integer+0.5. Each actual touchdown freezes a stance fraction interpolated from the original six nodes:0.42,0.36,0.32,0.28,0.26,0.22. A later slowdown cannot widen that window and create a second plant in the middle of a cycle. Records include the heel phase/time/speed, frozen end, anchor and a unique serial ID. Initial inherited standing support is explicitly recorded rather than fabricated as a new heel crossing.

The fixed world anchor remains unchanged until the frozen toeoff or an independently checkable anticipatory leg-reach predicate. The latter uses the actual previous outer-frame UpLeg hip geometry, speed and world anchor; it predicts20ms root advance and initial swing lift. Its current and predicted reach, fixed limits, measurement time and release speed are frozen in the release record. A stationary neutral stop step is separately declared and requires another planted foot, speed below0.03m/s and a non-neutral anchor.

Free feet lift before horizontal transfer. The future heel is forecast by integrating the same bounded speed and cadence policy. Its front placement is limited by the source pose's predicted future hip height. The swing destination freezes before lowering; its lateral transfer finishes before the last near-floor interval. The Actor's fore/aft-only reach projection must preserve Y and use a bent radius, not full0.78m extension; the latter has a square-root knee-angle singularity.

## Cold seek and play

An already airborne source foot is **not** a new toeoff. It keeps the original source clip's FK position/orientation at the continuous phase until its own next heel. Incoming speed/cadence is committed until the last such inherited swing finishes, under one cycle. The commitment is fixed at seed and does not grow with repeated requests. This avoids compressing a remaining half-swing into a fresh rest-to-rest path. Direct paused preview/seek remains the exact authored clip.

That inherited heel is always the actual next heel, including seeds less than
0.08 phase before it. The new-flight planner's minimum-duration rule does not
apply to a native swing already in progress. Targeted seeds at0.95,0.999 and
1.499 exercise this handover across all six gaits.

At zero speed, a captured sole above3mm starts free/settling rather than being
reported as planted in the air. Its snapshot retains source clip/time, authored
contact and measured sole-height information. A neutral airborne foot can
descend vertically over0.30s; neutral movement in XZ retains the lift-first arc.
Idle completion requires planted modes, canonical lateral placement, sole Y
within1mm and fore/aft placement within15mm. The viewer independently verifies
the actual rendered feet before its recovery ledger reports completion.

A standing restart chooses the Left0.25 or Right0.75 phase basis from the actual
grounded support side and advances that basis forward only. `phaseReseeds`
records from/to/time/request/support/source speed; `lastPhaseReseed` is also
available in history-free snapshots. At zero speed this explicit basis event
changes neither the displayed body pose nor world root/sole positions. It does
not excuse an advancing gait phase reversal or reset a moving foot's support.

Run `node source/locomotion-seed-check.mjs` for31 finite state regressions and
31 clone/copy checks of the added state. The six critical actual chains at both
30Hz and120Hz are summarized in
`source/evidence/locomotion-c14/focused-summary.json`. This focused diagnostic
coverage does not replace the final combined66/69, curved pitch, identity/LOD
and source31 audits bound to the final runtime and native assets.

## Viewer integration

The isolated Actor integration is maintained in a temporary prototype during validation; root merges only the motor additions, preserving later viewer fixes. In an already-active motor, an accepted within-family request should bypass the legacy pose capture/rebase and call `request()` without resetting phase or contacts. Non-locomotion actions should seed from the actual displayed motor pose and actual velocity, not the requested gait's nominal speed. Dribble's run2-compatible support can be integrated separately with its authored style/ball semantics; it is not silently treated as a generic gait by this prototype.

Blended poses and planned foot targets must use full actual-vertex post-IK floor evaluation. The cached exact-clip envelope is not indexed with a selected UI clip's unrelated clock. No physical-phone FPS claim follows from the deterministic geometry tests.

Independent validation keeps30rad/s visible-bone angular speed,25m/s root-relative bone speed,3mm anchor/near-floor drift, exact phase/contact histories, request fulfillment and full-mesh floor gates. A pilot or one successful source phase does not certify all69 gait cases or all16 delivered models.

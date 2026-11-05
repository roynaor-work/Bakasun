# Cold deceleration: target clearance diagnostic and temporary correction

This is a focused diagnostic, not final package coverage. Production source, runtime, motion and models were not edited. The candidate runtime is `/tmp/soccer-v7-cold-clearance/runtime.js`, 849,127 bytes, SHA-256 `45337a6dbe3cb493702e781dff2931506b113c920e3706f3eba4eaabab81d09f`. Its preview base is production `67e36e54266c802fe3c9112350d432829c243c6c0bff3b6065572568141627cd`; the production motor base is `10392c2b103a4e6ea510352b0f9f2aa02e1ba043f756aed6227dee872d529a9f`.

## Exact cause

The actual native32 player-01 LOD0 cold `decelerate` trajectory reaches its worst displayed vertex at 0.1333333333 seconds (frame 16 at 120 Hz). Mesh `player-01-lod0_1`, material `Cloth`, vertex 147, is rigidly weighted 100% to RightFoot (canonical index 17). Its decoded rest position is `[-0.1290055215358734, 0.0020000000949949026, 0.17000694572925568]`; its displayed world position is `[-0.12906203957950874, -0.00012251217878606491, 1.0800332953704341]`.

The reference all-vertex Three skinning minimum is -0.122512179 mm. The optimized floor minimum differs by 0.000000056 mm. This is a real boot penetration, not numerical noise in the optimized scan. The inherited RightFoot sole target is at Y=-2.124284444 mm, with an almost-flat world quaternion. The bound rigid-boot hull correctly predicts -0.622515772 mm after its conservative 0.5 mm padding.

The motor floor loop raises the body and re-solves the foot to the same underfloor target on each of three passes. The boot stays below the floor while the body accumulates 6.367536369 mm of lift. The source/inherited foot target must be corrected before IK.

## Candidate seam and behavior

`locomotion-space.patch` appends the pure `airborneFootGoalClearance` export; no class state, gait math, heel records, phase, clone or plant semantics change. `actor-hook.js.txt` is inserted after the dribble detail and before the existing free-foot reach projection. The import adds `airborneFootGoalClearance` beside `LocomotionSpace`.

The helper transforms the bound Foot-local hull using the requested final world foot quaternion and the rotated sole-to-ankle offset. It adds only the minimum necessary world-Y lift to obtain a 1 mm conservative hull minimum. XZ and quaternion are preserved exactly. Plants are excluded. The Actor hook verifies that the hull is bound to this exact loaded model hash. Existing all-vertex post-IK floor checks remain active. `motorFootClearance` records the before/after goal, orientation, calculated hull bound and correction; the coherent production merge should expose it as a pose modifier for independent expected-pose audit.

The largest observed correction is 1.622515778 mm. An independent 202-case algebra check verifies the rotation/offset, bound, immutability, exact XZ, plant exclusion and idempotence to 8.33e-17 m.

## Actual browser evidence

`../cold-decelerate-minimum-vertex-diagnostic.json` records the exact vertex, decoded weights, final bone/mesh matrices and both floor implementations. `../cold-decelerate-vertical-clearance-focused-proof.json` compares the actual frozen baseline against the temporary correction on separate stateful 30 Hz and 120 Hz trajectories. All resources are RAM pinned before boot; model bytes, canonical motion, source and served resources remain unchanged. No remote requests or browser errors occurred.

| Case | Rate | Baseline minimum | Candidate minimum | Candidate body lift |
| --- | ---: | ---: | ---: | ---: |
| Cold decelerate | 30 Hz | -0.122512 mm | +1.500004 mm | 0 mm |
| Cold decelerate | 120 Hz | -0.122512 mm | +1.500003 mm | 0 mm |
| Inherited sprint .85 to idle | 30 Hz | +2.000001 mm | +2.000001 mm | 0 mm |
| Inherited sprint .85 to idle | 120 Hz | +1.945082 mm | +1.945082 mm | 0 mm |

World root trajectories and immutable anchors are identical. Actual planted XZ differs by at most 1.11e-12 m. Whole cold-trajectory sole XZ differs by at most 6.81e-12 m. C0 initialization and request gates are unchanged. Both control trajectories have identical foot/root/lock traces, with zero clearance applied, max angular speed 26.869425 rad/s, max root-relative speed 9.899060 m/s and negligible ground drift.

## Separate unresolved cold-entry defects

This floor correction is not a complete cold-deceleration pass. Both baseline and candidate retain an existing 43.979319 rad/s LeftArm change on the first 120 Hz live frame, and existing near-ground unlocked RightFoot drift up to 32.198478 mm at 30 Hz / 15.307579 mm at 120 Hz. The fixed 30 rad/s and 3 mm limits remain failures. The candidate leaves both peaks unchanged.

The cold source is the nonperiodic `decelerate` clip, but motor initialization treats it as an inherited cyclic gait: source FK advances at motor normalized cadence while world speed is held until a generic .5 heel. Native deceleration root/contact clocks do not match that phase mapping. In addition, the standing motor entry fade is skipped because `motorClipFor(decelerate)` is accepted, although the displayed body is replaced by a gait blend. Those entry/admission semantics require a separate coherent adapter fix by the preview owner. No claimed final transition score or overall pass follows from this focused floor proof.

# Guarded nonperiodic entry into the locomotion motor

This focused temporary candidate builds on the floor diagnosis in `../cold-decelerate-clearance-candidate/`. Production motor, preview, package, canonical motion 7c and native32 models remain unchanged. Final coherent actual-main 69/action/pitch coverage remains required.

Candidate core SHA-256: `9d72815c00e1aa42da78e21bdf70dd9eb18a9cb7721f0c9beb4c436090183d1a`. Temporary runtime: 849,855 bytes, SHA-256 `ca311aa9a7d9417fd77e0162530075c9f8eb5626f663953c0e188ff34c828661`. Base preview SHA-256 is `67e36e54266c802fe3c9112350d432829c243c6c0bff3b6065572568141627cd`; base motor SHA-256 is `10392c2b103a4e6ea510352b0f9f2aa02e1ba043f756aed6227dee872d529a9f`.

## Entry semantics

Native inherited-FK continuation is valid only for the six canonical moving gaits and dribble (which shares run2 support). A nonperiodic source such as decelerate has its own root/contact clock and cannot continue under the motor's cyclic phase and speed integral.

On nongait entry, a positive-speed foot is admitted as an inherited fixed support only when its actual captured sole is grounded (within the existing 3 mm ground admission) AND the source clip declares a plant at the captured native source time. All other feet enter the existing smooth foot planner from the exact captured position/orientation. No airborne foot is labeled planted from a generic gait phase.

Grounded inherited nongait support has explicit reason `nongait-inherited-support`; it is not a new heel crossing. It begins a physical stance interval at the current motor phase using the existing speed-derived stance fraction and existing physical reach release. Its immutable record carries source clip, native seconds, source phase, sole height, source-grounded/authored-plant flags, and original contact start/end. The motor owns the new physical trajectory after admission; it does not replay or stretch the remaining authored contact clock. Canonical gait seed/inherited math is unchanged.

The preview enables the existing world-entry fade when a displayed source is noncanonical deceleration. This retains the captured world body/reference rotations and its existing angular-velocity fade instead of abruptly replacing the body with a gait blend. The planner retains exact captured foot position/quaternion (C0); it does not claim exact C1 continuation of authored nongait sole velocity. Measured frame velocity, angular and floor/drift guards remain authoritative.

The bound-hull vertical-only target clearance helper from the companion floor patch remains applied after dribble style and before reach/IK. Plants are excluded and their fixed XZ anchors remain untouched. Full actual all-vertex post-IK checks remain active.

## Actual temporary browser results

`../cold-decelerate-nongait-v3-focused-proof.json` contains 16 stateful cases: cold deceleration phases 0, .18, .3, .5, .7, .85, .999 and the normal inherited sprint .85 to idle control, each at 30 Hz and 120 Hz. Every case runs 4.5 seconds and passes unchanged 30 rad/s angular, 25 m/s root-relative, 3 mm near-floor drift, 3 mm anchor and C0 guards. It also requires nonnegative actual all-vertex floor, zero goal-XZ modification, and observed neutral feet/root held for .2 seconds before the 4.5-second deadline.

For the seven cold entries, the worst angular speed is 26.640743 rad/s, root-relative speed 9.860246 m/s, actual minimum vertex Y is +1.500210 mm, and near-floor drift is at numerical IK noise. Body floor lift is zero. First neutral stance is observed within 0.408–1.900 seconds; the .2-second stable neutral witness is reached within 0.600–2.083334 seconds. The normal sprint control remains unchanged, with max 26.869425 rad/s and 9.899060 m/s and first neutral at 2.500 seconds. No source, runtime or served/native input changed during either session and no remote requests/browser errors occurred.

These results repair the focused previously failing cold source entry. The original actual package baseline still fails floor, near-floor drift and dense angular entry; its failures remain preserved in the companion report and are not reclassified as passes.

Independent CPU review adds 36 source/phase seeds, 72 clone/copy checks and 12,960 steps; source-support metadata is immutable, no inherited nongait interval starts expired, and reset sole C0 error is zero. The original state suite passes 30 prediction and 30 lightweight-return checks with zero scalar/pose error. The original seed suite passes 31 cases and 31 clone checks.

## Selective merge

`locomotion-space.patch` applies to the owned production core only. `preview-selective.patch` has only three seams: import the new helper, admit the existing world-entry fade for noncanonical decelerate, and insert the bound-hull Y-only goal correction. The preview owner should merge these exact hunks into coherent C16 while preserving its other body/palm/camera changes; do not replace preview with the old temporary full copy. Expose `motorFootClearance` as a numeric expected-pose modifier in the final descriptor. Repackage only in the coordinated source freeze and run final actual-main cold obligations in addition to the original 69.

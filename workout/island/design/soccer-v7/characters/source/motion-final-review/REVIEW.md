# Historical native15 action review

This is the complete 93-image review of the **native15 / e60a** snapshot, at 20%, 50% and 80% of all 31 clips. `capture.json` records the immutable runtime, data and decoded role-correct model hashes. Later source, geometry and controller changes require a fresh capture; the folder name does not make these old screenshots final verification of a later package.

The six contact sheets in `grids/` include every captured image. Field actions use player-01, goalkeeper actions use the actual goalkeeper with glove geometry, and referee actions use the referee. No external requests or runtime errors occurred during the capture.

| Group | Visual finding | Follow-up |
|---|---|---|
| Idle and six locomotion speeds | Relaxed arms now stay beside the body; knee lift and stride increase with speed. Still images cannot establish cadence, support locking or a continuous handoff. | Continuous motor and dense displayed-pose audits supersede the old speed crossfade. |
| Turns and braking | Both turns show a visible change of body heading and staggered steps. Braking ends upright with two feet beneath the pelvis. | Check actual heading handoff and complete stopping steps in the live controller. |
| Kick and passes | Backswing, strike and return are readable; the ball follows the intended foot contact. | Dense rigid-boot checks subsequently found native kick/long-pass entry and return skates. Those defects are absent from these sparse 20/50/80% samples, so this grid is not a no-slide proof. |
| Header and leap | The full airborne silhouette and landing fit the phone view. | A live request to run must finish the landing before changing the lower-body motion. |
| Slide and get-up | The slide now finishes seated on the side with a flat supporting palm, rather than a fingertip tripod. Get-up has a bent-knee push and returns to standing. | A seated slide is not compatible with get-up frame zero. The explicit supported tuck bridge is tested separately. |
| Fall | The body rolls onto its side, and the camera keeps the full silhouette visible. | The maximum root lift is controlled by opaque pelvis clothing, not an alpha-card artifact. Normal/side and x-ray evidence is preserved in `../motion-fall-support-final/` and `../motion-fall-global-peak/`. |
| Celebrations | Five distinct arm/body gestures are recognizable. | The fixed hand mesh cannot close into an animated fist or articulate individual fingers on this 18-bone skeleton. |
| Keeper actions | Three dive directions, catch, throw and punt are distinct. The actual goalkeeper gloves remain visible in the phone frame. | Catch during a dive needs the six-arm overlay on the continuing dive body. Returning directly to the standing catch clip caused foot drift and is superseded by recovery-state planning. |
| Referee | Whistle and extended-arm signal are readable; a small local prop supplies whistle context. | Finger-specific whistle grips are outside the canonical skeleton. |

These are authored sports motions with a simplified 18-bone rig. The review does not establish the production capture, facial animation, finger motion or cloth simulation quality of EA FC Mobile. Geometry/material quality, contact correctness and transition timing have separate evidence and should not be inferred from this contact sheet.

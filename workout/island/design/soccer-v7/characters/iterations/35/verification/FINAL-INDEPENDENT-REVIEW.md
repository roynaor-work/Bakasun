# Final independent numeric and visual review

The coherent C16 package passed the final representative numerical audits. The exact transition aggregate is `verification/transitions-matrix.json`; its job reports remain at `verification/c16-r2/`. The earlier failed `verification/final32/` and interrupted `verification/c16/` attempts remain preserved.

| Actual bundled-viewer audit | Coverage | Result |
| --- | --- | --- |
| Transition matrix | Eight identities, both LODs at 30 Hz; player-01 LOD0 repeated at 120 Hz;1,122 chains, 84,435 samples | PASS,complete |
| Locomotion | 69 ordered gait/idle/sprint handoffs at 120 Hz and 30 Hz | PASS,complete at both rates |
| Curved pitch | Three scenarios, 12 actors/six distinct far models/opposed headings; 6,480 actor samples | PASS,complete |
| Yaw geometry | Seven poses × 16 models = 112 whole-mesh comparisons; 96 required actual native-palm solver witnesses | PASS,complete; 96/96 positive |

Matrix minimum actual deformed geometry Y was+0.80854 mm. Maximum advancing visible joint speed was27.5294 rad/s; maximum root-relative bone speed was8.4336 m/s. Maximum sole-marker anchor error was0.00032 mm, immediate bone-position discontinuity 0.6237 mm and visible world-orientation discontinuity 0.136245°. Active anatomical palm patch anchor error peaked at 2.49476 mm and XZ error at 2.39231 mm, within the retained 3 mm limits. The whole mesh floor scan and the opaque combined-Hand/Foot-excluded 8 mm captured-body obligation remained active.

The two 69-case locomotion runs reached requested physical speed/neutral feet within 2.65 s. Their maximum joint speeds were 28.5393 rad/s at 120 Hz and 26.7181 rad/s at 30 Hz. Curved pitch reconstructed actual roots, headings, previous-hip reach and release predicates independently; maximum active-foot world-orientation drift was 0.000002415°.

All declared 12 package-source hashes, actual offline payload/model SHAs and auditor inputs were unchanged. Matrix owner/workers and all auxiliary browsers/servers closed normally. Quiet CPU/GPU evidence belongs to its separate audit; these deterministic checks make no physical-phone FPS claim. They sample representative actions and integration rates rather than every possible interruption/frame-time sequence.

The body-settle 1.5 mm target and 0.30 s implementation bound remain descriptive under root's explicit 8 mm acceptance decision: 2,901 sampled target misses and 60 continued-after-bound diagnostics are retained. No deadline-flag contradiction was observed. The independently measured far planted-boot surface gap remains a separate geometry/appearance observation, documented in the earlier shoe-gap probe.

## Current visual scores

The reviewed final roster geometry is the combined32 set; later camera and C16 controller changes preserve that art. The paired close phone reviews and full 64-frame roster inspection remain the basis of these grades.

| Item | Independent score/10 | Detail still missing for 8 |
| --- | ---: | --- |
| Faces | 7.5 | Broad cheek/temple planes, limited eyelid/brow softness and pale/simple eye shading remain visible close-up. |
| Hair | 7–7.25 | Long card-edge contours, cap-like volume and stiff fringe tips remain visible; the far scalp holes were fixed. |
| Cloth | 7.5 | Fabric still reads as a smooth, stiff tunic in places, with limited responsive folds; small collar-band endpoint notches remain. |

The numerical results support the stated contact, continuity and provenance limits. Motion naturalness, close-face art and physical-device performance still require their own visual/device judgment.

Observer source SHA: c9b6de82bf07fc6d57e417e3fdf33d1d04d57b88412eaa322e0d23ac3f981691. Runtime SHA: ef474e25f1c7d68309198f1a769eaf6135bfcd6bc097c4ab91d58573ec954b08. Data SHA: f4d3878855abdbbc6e04bc57fd5c334ef672c2834ae6d846831f7705bf04844d.
